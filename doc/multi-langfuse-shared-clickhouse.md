# 多 Langfuse 实例共享 ClickHouse 部署方案

## 概述

本文档描述了多个 Langfuse 实例共享同一个 ClickHouse 集群的部署方案。适用于以下场景：

- 多租户 SaaS 部署
- 多环境（开发/测试/生产）共享基础设施
- 降低运维成本，统一管理 ClickHouse 集群

## 背景

### 现有数据隔离机制

Langfuse 已经内置了完善的数据隔离机制：

1. **PostgreSQL**: 所有表都包含 `projectId` 外键，使用复合主键确保数据隔离
2. **ClickHouse**: `project_id` 是所有表 PRIMARY KEY 的第一列，支持高效的分区裁剪

```sql
-- ClickHouse traces 表结构示例
CREATE TABLE traces (
    project_id String,
    ...
) ENGINE = ReplicatedReplacingMergeTree(...)
PRIMARY KEY (project_id, toDate(timestamp))
ORDER BY (project_id, toDate(timestamp), id);
```

### 相关配置项

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `CLICKHOUSE_URL` | ClickHouse HTTP 接口地址 | `http://localhost:8123` |
| `CLICKHOUSE_MIGRATION_URL` | ClickHouse Native 协议地址（用于 migration） | `clickhouse://localhost:9000` |
| `CLICKHOUSE_USER` | 用户名 | `clickhouse` |
| `CLICKHOUSE_PASSWORD` | 密码 | `clickhouse` |
| `CLICKHOUSE_DB` | 数据库名 | `default` |
| `CLICKHOUSE_CLUSTER_ENABLED` | 是否启用集群模式 | `false` |
| `CLICKHOUSE_CLUSTER_NAME` | 集群名称（集群模式） | `default` |

---

## 方案对比

| 方案 | 隔离级别 | 代码改动 | 运维复杂度 | 推荐度 |
|------|---------|---------|-----------|--------|
| 方案 1: Database 隔离 | 数据库级 | 无 | 低 | ⭐⭐⭐⭐⭐ |
| 方案 2: project_id 隔离 | 行级 | 无 | 中 | ⭐⭐⭐ |
| 方案 3: 添加 instance_id | 行级 | 大 | 高 | ⭐⭐ |

---

## 方案 1: Database 隔离（推荐）

### 原理

每个 Langfuse 实例使用独立的 ClickHouse 数据库，通过 `CLICKHOUSE_DB` 环境变量配置。

### 架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │    │  Langfuse C     │
│  (PostgreSQL A) │    │  (PostgreSQL B) │    │  (PostgreSQL C) │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         │ CLICKHOUSE_DB=db_a   │ CLICKHOUSE_DB=db_b   │ CLICKHOUSE_DB=db_c
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Shared ClickHouse   │
                    │  ┌─────────────────┐  │
                    │  │    db_a         │  │
                    │  │  - traces       │  │
                    │  │  - observations │  │
                    │  │  - scores       │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │    db_b         │  │
                    │  │  - traces       │  │
                    │  │  - observations │  │
                    │  │  - scores       │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │    db_c         │  │
                    │  │  - traces       │  │
                    │  │  - observations │  │
                    │  │  - scores       │  │
                    │  └─────────────────┘  │
                    └───────────────────────┘
```

### 实施步骤

#### 步骤 1: 在 ClickHouse 中创建数据库

连接到共享的 ClickHouse 实例，为每个 Langfuse 实例创建独立的数据库：

```sql
-- 非集群模式
CREATE DATABASE langfuse_instance_a;
CREATE DATABASE langfuse_instance_b;
CREATE DATABASE langfuse_instance_c;

-- 集群模式
CREATE DATABASE langfuse_instance_a ON CLUSTER default;
CREATE DATABASE langfuse_instance_b ON CLUSTER default;
CREATE DATABASE langfuse_instance_c ON CLUSTER default;
```

#### 步骤 2: 配置 Langfuse 实例

为每个 Langfuse 实例配置对应的环境变量：

**实例 A (.env)**
```bash
# ClickHouse 共享配置
CLICKHOUSE_URL="http://shared-clickhouse:8123"
CLICKHOUSE_MIGRATION_URL="clickhouse://shared-clickhouse:9000"
CLICKHOUSE_USER="clickhouse"
CLICKHOUSE_PASSWORD="your_secure_password"

# 实例特定配置
CLICKHOUSE_DB="langfuse_instance_a"

# 集群模式（可选）
CLICKHOUSE_CLUSTER_ENABLED="true"
CLICKHOUSE_CLUSTER_NAME="default"
```

**实例 B (.env)**
```bash
# ClickHouse 共享配置
CLICKHOUSE_URL="http://shared-clickhouse:8123"
CLICKHOUSE_MIGRATION_URL="clickhouse://shared-clickhouse:9000"
CLICKHOUSE_USER="clickhouse"
CLICKHOUSE_PASSWORD="your_secure_password"

# 实例特定配置
CLICKHOUSE_DB="langfuse_instance_b"

# 集群模式（可选）
CLICKHOUSE_CLUSTER_ENABLED="true"
CLICKHOUSE_CLUSTER_NAME="default"
```

#### 步骤 3: 运行 Migration

每个 Langfuse 实例启动时会自动在其配置的数据库中创建所需的表结构。

```bash
# 实例 A
cd packages/shared && pnpm run ch:up

# 实例 B
cd packages/shared && pnpm run ch:up
```

#### 步骤 4: 启动服务

正常启动各 Langfuse 实例即可。

### 优点

- ✅ **零代码修改**: 仅需配置环境变量
- ✅ **完全隔离**: 数据库级别物理隔离，互不影响
- ✅ **独立运维**: 各实例可独立执行 schema migration
- ✅ **权限控制**: 可为每个数据库配置不同的访问权限
- ✅ **资源监控**: 易于按数据库监控资源使用

### 缺点

- ⚠️ Schema 在每个数据库中重复存储
- ⚠️ 跨实例聚合查询需要额外处理

### 权限配置示例

为不同实例配置独立的 ClickHouse 用户（可选）：

```sql
-- 创建实例专用用户
CREATE USER langfuse_a IDENTIFIED BY 'password_a';
CREATE USER langfuse_b IDENTIFIED BY 'password_b';

-- 授予对应数据库的权限
GRANT ALL ON langfuse_instance_a.* TO langfuse_a;
GRANT ALL ON langfuse_instance_b.* TO langfuse_b;
```

---

## 方案 2: 利用现有 project_id 隔离

### 原理

由于 ClickHouse 表设计已经以 `project_id` 作为 PRIMARY KEY 的第一列，多个 Langfuse 实例可以共用同一个数据库，依靠 `project_id` 的唯一性进行隔离。

### 架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │    │  Langfuse C     │
│  (PostgreSQL A) │    │  (PostgreSQL B) │    │  (PostgreSQL C) │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Shared ClickHouse   │
                    │  ┌─────────────────┐  │
                    │  │    default      │  │
                    │  │  - traces       │◄─┼─ project_id 隔离
                    │  │  - observations │  │
                    │  │  - scores       │  │
                    │  └─────────────────┘  │
                    └───────────────────────┘
```

### 实施步骤

#### 步骤 1: 配置所有实例使用相同的 ClickHouse

所有实例使用相同的 `CLICKHOUSE_DB`：

```bash
# 所有实例共用配置
CLICKHOUSE_URL="http://shared-clickhouse:8123"
CLICKHOUSE_MIGRATION_URL="clickhouse://shared-clickhouse:9000"
CLICKHOUSE_USER="clickhouse"
CLICKHOUSE_PASSWORD="your_secure_password"
CLICKHOUSE_DB="default"
```

#### 步骤 2: 协调 Migration

**重要**: 需要协调 migration 的执行，避免并发冲突。

**为什么需要协调？**

1. **并发冲突**: 如果多个实例同时启动并执行 migration，可能出现 DDL 语句竞态条件（如同时 `CREATE TABLE`）
2. **版本一致性**: 如果不同实例使用不同版本的 Langfuse，migration 文件可能不同，需要明确由哪个实例负责 schema 升级
3. **幂等性**: `golang-migrate` 会检查 `schema_migrations` 表跳过已执行的 migration，但并发场景下可能失效

**推荐做法**:

```bash
# 方式 1: 指定主实例负责 migration
# 只在主实例运行 migration
cd packages/shared && pnpm run ch:up

# 其他实例启动时跳过 migration（通过环境变量或启动脚本控制）

# 方式 2: 启动前统一执行
# 在部署流程中，先执行 migration，再启动所有实例
pnpm run ch:up  # 部署脚本中执行一次
# 然后启动所有 Langfuse 实例

# 方式 3: 顺序启动
# 先启动实例 A（执行 migration），等待完成后再启动其他实例
```

#### 步骤 3: 确保 project_id 唯一性

由于 Langfuse 使用 UUID 生成 `project_id`，理论上不会冲突。但建议：

- 使用不同的 PostgreSQL 数据库（各实例独立管理 project）
- 监控是否有 project_id 冲突的情况

### 优点

- ✅ **无需多数据库**: 简化 ClickHouse 管理
- ✅ **零代码修改**: 利用现有设计
- ✅ **可跨实例查询**: 所有数据在同一数据库中

### 缺点

- ⚠️ **Migration 协调复杂**: 多实例共享同一数据库时，需要避免并发执行 migration（DDL 竞态条件），且需要明确由哪个实例负责 schema 升级
- ⚠️ **无物理隔离**: 误操作可能影响其他实例数据
- ⚠️ **project_id 冲突风险**: 虽然概率极低，但理论上存在
- ⚠️ **权限控制困难**: 无法按实例细分权限

### 适用场景

- 同一组织内的多环境部署（dev/staging/prod 共享 project）
- 对隔离性要求不高的场景

---

## 方案 3: 添加 instance_id 维度

### 原理

在现有表结构基础上增加 `instance_id` 字段，用于区分不同的 Langfuse 实例。

### 改动范围

#### 数据库层改动

```sql
-- 1. 修改 traces 表
ALTER TABLE traces ADD COLUMN instance_id String FIRST;

-- 2. 修改 PRIMARY KEY（需要重建表）
-- PRIMARY KEY (instance_id, project_id, toDate(timestamp))

-- 3. 同样修改 observations、scores 等所有表
```

#### 代码层改动

1. **环境变量**: 添加 `LANGFUSE_INSTANCE_ID` 配置
2. **查询层**: 修改 `getProjectIdDefaultFilter()` 添加 instance_id 过滤
3. **写入层**: 所有写入操作添加 instance_id 字段
4. **Migration**: 创建新的 migration 脚本

### 涉及文件（示例）

```
packages/shared/src/server/queries/clickhouse-sql/factory.ts
packages/shared/src/server/repositories/traces.ts
packages/shared/src/server/repositories/observations.ts
packages/shared/src/server/repositories/scores.ts
worker/src/services/ClickhouseWriter/index.ts
```

### 优点

- ✅ **灵活的隔离粒度**: 可以按 instance_id + project_id 组合查询
- ✅ **跨实例统一分析**: 便于全局数据分析

### 缺点

- ❌ **大量代码改动**: 需要修改查询和写入逻辑
- ❌ **数据迁移复杂**: 现有数据需要回填 instance_id
- ❌ **维护成本高**: 增加系统复杂度
- ❌ **性能影响**: 主键增加一列，可能影响查询性能

### 适用场景

- 需要跨实例统一分析的场景
- 有充足开发资源进行定制化改造的场景

---

## 推荐方案总结

| 场景 | 推荐方案 |
|------|---------|
| 生产环境多租户部署 | 方案 1: Database 隔离 |
| 开发/测试环境共享 | 方案 1 或 方案 2 |
| 需要跨实例分析 | 方案 3（需开发投入） |
| 快速部署、低运维成本 | 方案 1: Database 隔离 |

**强烈推荐使用方案 1（Database 隔离）**，原因：

1. 无需任何代码修改
2. 提供完整的数据隔离
3. 运维简单，各实例独立管理
4. 易于扩展和迁移

---

## 附录

### ClickHouse 表清单

以下是需要在每个数据库中创建的主要表：

| 表名 | 用途 |
|------|------|
| `traces` | 追踪记录 |
| `observations` | 观测数据（span、generation、event） |
| `scores` | 评分数据 |
| `events` | 事件日志 |
| `dataset_run_items_rmt` | 数据集运行项 |
| `blob_storage_file_log` | Blob 存储文件日志 |

### 常用运维命令

```bash
# 查看数据库列表
clickhouse-client --query "SHOW DATABASES"

# 查看表大小
clickhouse-client --query "
SELECT
    database,
    table,
    formatReadableSize(sum(bytes)) as size,
    sum(rows) as rows
FROM system.parts
WHERE active
GROUP BY database, table
ORDER BY sum(bytes) DESC
"

# 查看各实例数据量
clickhouse-client --query "
SELECT
    database,
    count() as trace_count
FROM system.parts
WHERE table = 'traces' AND active
GROUP BY database
"
```

### 参考资料

- [ClickHouse 多租户最佳实践](https://clickhouse.com/docs/en/guides/sre/user-management/configuring-users-and-roles)
- [Langfuse 官方文档](https://langfuse.com/docs)

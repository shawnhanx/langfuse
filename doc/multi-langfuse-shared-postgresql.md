# 多 Langfuse 实例共享 PostgreSQL 部署方案

## 概述

本文档描述了多个 Langfuse 实例共享同一个 PostgreSQL 集群的部署方案。适用于以下场景：

- 多租户 SaaS 部署
- 多环境（开发/测试/生产）共享基础设施
- 降低运维成本，统一管理 PostgreSQL 集群

## 背景

### Langfuse 双数据库架构

**重要**: Langfuse 使用双数据库架构，数据分布如下：

| 数据类型 | 存储位置 | 说明 |
|---------|---------|------|
| **Trace、Observation、Score** | **ClickHouse** | 高吞吐量时序数据，用于分析查询 |
| **用户、项目、组织** | **PostgreSQL** | 事务性数据，需要强一致性 |
| **配置数据**（ScoreConfig、Prompt 等） | **PostgreSQL** | 配置信息和关系型数据 |
| **会话元数据**（TraceSession） | **PostgreSQL** | 会话引用，实际 Trace 在 ClickHouse |

本文档主要讨论 **PostgreSQL 的共享部署方案**。如需了解 ClickHouse 共享方案，请参考 `multi-langfuse-shared-clickhouse.md`。

### 现有数据隔离机制

Langfuse 在 PostgreSQL 中已经内置了完善的数据隔离机制：

1. **projectId 外键**: 所有业务表都包含 `projectId` 字段，用于区分不同项目的数据
2. **organizationId**: 组织级别的数据隔离

```sql
-- PostgreSQL 表结构示例（Project 表）
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    ...
);

-- 会话元数据表（实际 Trace 数据在 ClickHouse）
CREATE TABLE "TraceSession" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    ...
);
```

### 相关配置项

| 环境变量 | 说明 | 示例值 |
|---------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@host:5432/dbname` |
| `DIRECT_URL` | 直连 URL（用于 Prisma migration） | `postgresql://user:pass@host:5432/dbname` |

**DATABASE_URL 格式**:
```
postgresql://[user]:[password]@[host]:[port]/[database]?schema=[schema]
```

---

## 方案对比

| 方案 | 隔离级别 | 代码改动 | 运维复杂度 | 推荐度 |
|------|---------|---------|-----------|--------|
| 方案 1: Database 隔离 | 数据库级 | 无 | 低 | ⭐⭐⭐⭐⭐ |
| 方案 2: Schema 隔离 | Schema 级 | 无 | 中 | ⭐⭐⭐⭐ |
| 方案 3: projectId 隔离 | 行级 | 无 | 高 | ⭐⭐ |

---

## 方案 1: Database 隔离（推荐）

### 原理

每个 Langfuse 实例使用独立的 PostgreSQL 数据库，通过 `DATABASE_URL` 环境变量中的数据库名配置。

### 架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │    │  Langfuse C     │
│  (ClickHouse A) │    │  (ClickHouse B) │    │  (ClickHouse C) │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         │ db=langfuse_a        │ db=langfuse_b        │ db=langfuse_c
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Shared PostgreSQL   │
                    │  ┌─────────────────┐  │
                    │  │   langfuse_a    │  │
                    │  │  - Project      │  │
                    │  │  - User         │  │
                    │  │  - Organization │  │
                    │  │  - ScoreConfig  │  │
                    │  │  - TraceSession │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │   langfuse_b    │  │
                    │  │  - Project      │  │
                    │  │  - User         │  │
                    │  │  - Organization │  │
                    │  │  - ScoreConfig  │  │
                    │  │  - TraceSession │  │
                    │  └─────────────────┘  │
                    │  ┌─────────────────┐  │
                    │  │   langfuse_c    │  │
                    │  │  - Project      │  │
                    │  │  - User         │  │
                    │  │  - Organization │  │
                    │  │  - ScoreConfig  │  │
                    │  │  - TraceSession │  │
                    │  └─────────────────┘  │
                    └───────────────────────┘
```

### 实施步骤

#### 步骤 1: 在 PostgreSQL 中创建数据库

连接到共享的 PostgreSQL 实例，为每个 Langfuse 实例创建独立的数据库：

```sql
-- 创建数据库
CREATE DATABASE langfuse_instance_a;
CREATE DATABASE langfuse_instance_b;
CREATE DATABASE langfuse_instance_c;

-- （可选）创建专用用户
CREATE USER langfuse_a WITH PASSWORD 'password_a';
CREATE USER langfuse_b WITH PASSWORD 'password_b';

-- 授予权限
GRANT ALL PRIVILEGES ON DATABASE langfuse_instance_a TO langfuse_a;
GRANT ALL PRIVILEGES ON DATABASE langfuse_instance_b TO langfuse_b;
```

**或者**，使用 Docker 镜像自动创建（适用于首次部署）：

```yaml
# docker-compose.yml (实例 A)
postgres:
  image: postgres:17
  environment:
    POSTGRES_DB: langfuse_instance_a  # 镜像启动时自动创建
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: your_password
```

#### 步骤 2: 配置 Langfuse 实例

为每个 Langfuse 实例配置对应的环境变量：

**实例 A (.env)**
```bash
# PostgreSQL 配置
DATABASE_URL="postgresql://postgres:your_password@shared-postgres:5432/langfuse_instance_a"

# 如果使用连接池（如 PgBouncer），还需配置直连 URL
DIRECT_URL="postgresql://postgres:your_password@shared-postgres:5432/langfuse_instance_a"
```

**实例 B (.env)**
```bash
# PostgreSQL 配置
DATABASE_URL="postgresql://postgres:your_password@shared-postgres:5432/langfuse_instance_b"
DIRECT_URL="postgresql://postgres:your_password@shared-postgres:5432/langfuse_instance_b"
```

#### 步骤 3: 运行 Migration

每个 Langfuse 实例启动时会自动运行 Prisma migration，在其配置的数据库中创建所需的表结构。

```bash
# 实例 A
cd packages/shared && pnpm run db:migrate

# 实例 B
cd packages/shared && pnpm run db:migrate
```

**注意**: 各实例的 migration 是独立的，不需要协调。

#### 步骤 4: 启动服务

正常启动各 Langfuse 实例即可。

### 优点

- ✅ **零代码修改**: 仅需配置环境变量
- ✅ **完全隔离**: 数据库级别物理隔离，互不影响
- ✅ **独立运维**: 各实例可独立执行 schema migration
- ✅ **权限控制**: 可为每个数据库配置不同的访问权限
- ✅ **资源监控**: 易于按数据库监控资源使用
- ✅ **备份恢复**: 可独立备份和恢复各实例数据

### 缺点

- ⚠️ Schema 在每个数据库中重复存储
- ⚠️ 跨实例聚合查询需要额外处理
- ⚠️ 需要为每个实例单独创建数据库

### 权限配置示例

为不同实例配置独立的 PostgreSQL 用户（可选但推荐）：

```sql
-- 创建实例专用用户
CREATE USER langfuse_a WITH PASSWORD 'password_a';
CREATE USER langfuse_b WITH PASSWORD 'password_b';

-- 授予对应数据库的权限
GRANT ALL PRIVILEGES ON DATABASE langfuse_instance_a TO langfuse_a;
GRANT ALL PRIVILEGES ON DATABASE langfuse_instance_b TO langfuse_b;

-- 授予 schema 权限（连接到对应数据库后执行）
\c langfuse_instance_a
GRANT ALL ON SCHEMA public TO langfuse_a;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO langfuse_a;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO langfuse_a;
```

---

## 方案 2: Schema 隔离

### 原理

在同一个 PostgreSQL 数据库中，每个 Langfuse 实例使用独立的 Schema（命名空间）。

### 架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │    │  Langfuse C     │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         │ schema=instance_a    │ schema=instance_b    │ schema=instance_c
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Shared PostgreSQL   │
                    │   Database: langfuse  │
                    │  ┌─────────────────┐  │
                    │  │ Schema:         │  │
                    │  │  instance_a     │  │
                    │  │  instance_b     │  │
                    │  │  instance_c     │  │
                    │  └─────────────────┘  │
                    └───────────────────────┘
```

### 实施步骤

#### 步骤 1: 创建 Schema

```sql
-- 连接到共享数据库
\c langfuse

-- 创建 Schema
CREATE SCHEMA instance_a;
CREATE SCHEMA instance_b;
CREATE SCHEMA instance_c;
```

#### 步骤 2: 配置 DATABASE_URL

通过 URL 参数指定 schema：

**实例 A (.env)**
```bash
DATABASE_URL="postgresql://postgres:password@shared-postgres:5432/langfuse?schema=instance_a"
```

**实例 B (.env)**
```bash
DATABASE_URL="postgresql://postgres:password@shared-postgres:5432/langfuse?schema=instance_b"
```

#### 步骤 3: 运行 Migration

```bash
# 各实例独立运行
cd packages/shared && pnpm run db:migrate
```

### 优点

- ✅ **零代码修改**: 通过 URL 参数配置
- ✅ **单数据库管理**: 所有实例在同一数据库中
- ✅ **灵活的权限控制**: 可按 Schema 设置权限
- ✅ **易于跨实例查询**: 同一数据库内可跨 Schema 查询

### 缺点

- ⚠️ **隔离性较弱**: 相比数据库级隔离，Schema 隔离的边界较弱
- ⚠️ **连接池共享**: 所有实例共享同一数据库的连接池
- ⚠️ **备份粒度**: 只能整库备份，无法单独备份某个实例

### 适用场景

- 开发/测试环境
- 对隔离性要求不高的内部部署

---

## 方案 3: 利用现有 projectId 隔离

### 原理

所有 Langfuse 实例共用同一个数据库和 Schema，依靠 `projectId` 和 `organizationId` 的唯一性进行数据隔离。

### 架构图

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │    │  Langfuse C     │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Shared PostgreSQL   │
                    │  ┌─────────────────┐  │
                    │  │    langfuse     │  │
                    │  │  - Project      │◄─┼─ orgId 隔离
                    │  │  - User         │  │   (用户可跨实例共享)
                    │  │  - Organization │  │
                    │  │  - ScoreConfig  │◄─┼─ projectId 隔离
                    │  │  - TraceSession │◄─┼─ projectId 隔离
                    │  │                 │  │
                    │  │  注: Trace/Observation/Score │
                    │  │  的实际数据存储在 ClickHouse  │
                    │  └─────────────────┘  │
                    └───────────────────────┘
```

### 实施步骤

#### 步骤 1: 配置所有实例使用相同的数据库

所有实例使用相同的 `DATABASE_URL`：

```bash
# 所有实例共用配置
DATABASE_URL="postgresql://postgres:password@shared-postgres:5432/langfuse"
```

#### 步骤 2: 协调 Migration

**重要**: 需要协调 migration 的执行，避免并发冲突。

**为什么需要协调？**

1. **并发冲突**: 如果多个实例同时启动并执行 migration，可能出现 DDL 语句竞态条件
2. **版本一致性**: 如果不同实例使用不同版本的 Langfuse，migration 文件可能不同
3. **Prisma 锁机制**: Prisma 使用 `_prisma_migrations` 表记录 migration 状态，并发执行可能导致冲突

**推荐做法**:

```bash
# 方式 1: 指定主实例负责 migration
# 只在主实例运行 migration
cd packages/shared && pnpm run db:migrate

# 其他实例启动时跳过 migration

# 方式 2: 部署前统一执行
# 在部署流程中，先执行 migration，再启动所有实例
pnpm run db:deploy  # 部署脚本中执行一次

# 方式 3: 顺序启动
# 先启动实例 A（执行 migration），等待完成后再启动其他实例
```

#### 步骤 3: 用户管理考虑

由于所有实例共享 User 表，需要考虑：

- **用户可跨实例登录**: 同一用户可在多个实例使用相同账号
- **组织隔离**: 通过 Organization 和 Membership 控制访问权限
- **SSO 集成**: 如果使用 SSO，需要统一配置

### 优点

- ✅ **无需多数据库**: 简化 PostgreSQL 管理
- ✅ **用户统一管理**: 用户可跨实例共享账号
- ✅ **可跨实例查询**: 所有数据在同一数据库中

### 缺点

- ❌ **Migration 协调复杂**: 多实例共享同一数据库时，需要避免并发执行 migration
- ❌ **无物理隔离**: 误操作可能影响其他实例数据
- ❌ **版本升级风险**: 一个实例升级可能影响其他实例
- ❌ **权限控制困难**: 无法按实例细分权限
- ❌ **潜在 ID 冲突**: 虽然使用 UUID，理论上仍存在极小概率冲突

### 适用场景

- 同一组织内的多环境部署（dev/staging/prod 需要共享用户）
- 对隔离性要求不高的场景
- 需要统一用户管理的场景

---

## 推荐方案总结

| 场景 | 推荐方案 |
|------|---------|
| 生产环境多租户部署 | 方案 1: Database 隔离 |
| 开发/测试环境共享 | 方案 1 或 方案 2 |
| 需要统一用户管理 | 方案 3（需谨慎） |
| 快速部署、低运维成本 | 方案 1: Database 隔离 |

**强烈推荐使用方案 1（Database 隔离）**，原因：

1. 无需任何代码修改
2. 提供完整的数据隔离
3. 运维简单，各实例独立管理
4. 易于扩展和迁移
5. 各实例可独立升级，互不影响

---

## 与 ClickHouse 共享方案的组合

通常，PostgreSQL 和 ClickHouse 的共享策略应保持一致：

| 组合 | PostgreSQL | ClickHouse | 推荐场景 |
|------|------------|------------|---------|
| 完全隔离 | 独立数据库 | 独立数据库 | 生产环境多租户 |
| 完全共享 | 共享（方案3） | 共享（方案2） | 开发测试环境 |
| 混合模式 | 独立数据库 | 共享数据库 | 特殊需求 |

**推荐组合**: PostgreSQL 独立数据库 + ClickHouse 独立数据库

```
┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │
└────────┬────────┘    └────────┬────────┘
         │                      │
    ┌────┴────┐            ┌────┴────┐
    │         │            │         │
    ▼         ▼            ▼         ▼
┌───────┐ ┌───────┐    ┌───────┐ ┌───────┐
│ PG    │ │ CH    │    │ PG    │ │ CH    │
│ db_a  │ │ db_a  │    │ db_b  │ │ db_b  │
└───┬───┘ └───┬───┘    └───┬───┘ └───┬───┘
    │         │            │         │
    └────┬────┘            └────┬────┘
         │                      │
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Shared          │    │ Shared          │
│ PostgreSQL      │    │ ClickHouse      │
└─────────────────┘    └─────────────────┘
```

---

## 附录

### PostgreSQL 主要表清单

以下是 Langfuse 在 PostgreSQL 中的主要表：

| 表名 | 用途 | 备注 |
|------|------|------|
| `User` | 用户账号 | |
| `Organization` | 组织 | |
| `OrganizationMembership` | 组织成员关系 | |
| `Project` | 项目 | |
| `ApiKey` | API 密钥 | |
| `TraceSession` | 追踪会话元数据 | 仅会话信息，实际 Trace 数据在 ClickHouse |
| `ScoreConfig` | 评分配置 | 配置信息，实际 Score 数据在 ClickHouse |
| `LegacyPrismaTrace` | 遗留追踪表 | 已废弃，新数据在 ClickHouse |
| `LegacyPrismaObservation` | 遗留观测表 | 已废弃，新数据在 ClickHouse |
| `LegacyPrismaScore` | 遗留评分表 | 已废弃，新数据在 ClickHouse |
| `Prompt` | 提示词模板 | |
| `Dataset` | 数据集 | |
| `DatasetItem` | 数据集条目 | |
| `DatasetRun` | 数据集运行记录 | |
| `EvalTemplate` | 评估模板 | |
| `JobConfiguration` | 作业配置 | |
| `CronJobs` | 定时任务 | |

**重要说明**:
- **Trace、Observation、Score 的实际数据存储在 ClickHouse**，不在 PostgreSQL 中
- PostgreSQL 只存储配置数据（如 ScoreConfig）、会话元数据（如 TraceSession）和遗留表
- 高吞吐量的时序数据全部存储在 ClickHouse，以获得更好的性能

### 常用运维命令

```bash
# 查看数据库列表
psql -h localhost -U postgres -c "\l"

# 查看数据库大小
psql -h localhost -U postgres -c "
SELECT
    datname as database,
    pg_size_pretty(pg_database_size(datname)) as size
FROM pg_database
WHERE datname LIKE 'langfuse%'
ORDER BY pg_database_size(datname) DESC;
"

# 查看各表大小
psql -h localhost -U postgres -d langfuse_instance_a -c "
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
"

# 查看连接数
psql -h localhost -U postgres -c "
SELECT
    datname,
    count(*) as connections
FROM pg_stat_activity
GROUP BY datname
ORDER BY connections DESC;
"

# 备份单个数据库
pg_dump -h localhost -U postgres langfuse_instance_a > langfuse_a_backup.sql

# 恢复数据库
psql -h localhost -U postgres langfuse_instance_a < langfuse_a_backup.sql
```

### 连接池配置建议

如果使用连接池（如 PgBouncer），建议：

1. 为每个 Langfuse 实例配置独立的连接池
2. 设置合理的 `pool_size`（建议每个实例 10-20）
3. 使用 `DIRECT_URL` 配置直连地址用于 migration

```bash
# 应用连接通过连接池
DATABASE_URL="postgresql://user:pass@pgbouncer:6432/langfuse_a"

# Migration 直连数据库
DIRECT_URL="postgresql://user:pass@postgres:5432/langfuse_a"
```

### 参考资料

- [PostgreSQL 多租户最佳实践](https://www.postgresql.org/docs/current/ddl-schemas.html)
- [Prisma 多数据库配置](https://www.prisma.io/docs/concepts/database-connectors/postgresql)
- [Langfuse 官方文档](https://langfuse.com/docs)

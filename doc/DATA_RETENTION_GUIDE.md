# Langfuse 自托管数据保留与清理指南

## 概述

Langfuse 使用四种存储系统，各有不同的数据保留需求：

| 存储系统 | 用途 | 数据增长 | 需要清理 |
|---------|------|---------|---------|
| **ClickHouse** | Traces、Observations、Scores 分析数据 | 高 | ✅ 是 |
| **S3/MinIO** | Ingestion 事件、媒体文件 | 高 | ✅ 是 |
| **PostgreSQL** | 媒体元数据、配置数据 | 低 | ✅ 是（仅 Media 表） |
| **Redis** | 缓存、队列 | 无（自动过期） | ❌ 否 |

---

## 方案一：内置数据保留功能（推荐）

### 前提条件

1. **需要企业版许可证**：`data-retention` 是 `self-hosted:enterprise` 功能
2. **Worker 必须运行**
3. **环境变量**：`QUEUE_CONSUMER_DATA_RETENTION_QUEUE_IS_ENABLED=true`（默认已启用）

### 配置方式

#### 方式 A：通过 UI 配置（需要 EE 许可证）

1. 进入项目 → Settings → Data Retention
2. 设置 `retentionDays`（最少 3 天，0 表示无限期）

#### 方式 B：直接修改数据库（绕过 UI 限制）

```sql
-- 设置项目保留 30 天
UPDATE "Project"
SET "retentionDays" = 30
WHERE id = 'your-project-id';

-- 查看所有项目的保留设置
SELECT id, name, "retentionDays" FROM "Project";
```

### 自动清理调度

- **执行时间**：每天 UTC 3:15 AM
- **调度配置**：`packages/shared/src/server/redis/dataRetentionQueue.ts`

### 自动清理范围

```
数据保留作业执行流程：
├── ClickHouse
│   ├── traces (timestamp < cutoffDate)
│   ├── observations (start_time < cutoffDate)
│   └── scores (timestamp < cutoffDate)
├── S3
│   ├── ingestion events (通过 blob_storage_file_log 追踪)
│   └── media files (通过 PostgreSQL Media 表追踪)
└── PostgreSQL
    └── Media + TraceMedia + ObservationMedia (级联删除)
```

### 验证清理是否正常运行

```bash
# 检查 Worker 日志
docker logs langfuse-worker 2>&1 | grep -i "Data Retention"

# 预期输出示例
# [Data Retention] Deleting media files older than 30 days for project xxx
# [Data Retention] Deleted ClickHouse and S3 data older than 30 days for project xxx
```

---

## 方案二：手动清理脚本

适用于无法使用内置功能或需要更精细控制的场景。

### 1. ClickHouse 清理

```sql
-- 设置变量
SET param_project_id = 'your-project-id';
SET param_cutoff_days = 30;

-- 删除过期 traces
ALTER TABLE traces DELETE
WHERE project_id = {param_project_id:String}
AND timestamp < now() - INTERVAL {param_cutoff_days:Int32} DAY;

-- 删除过期 observations
ALTER TABLE observations DELETE
WHERE project_id = {param_project_id:String}
AND start_time < now() - INTERVAL {param_cutoff_days:Int32} DAY;

-- 删除过期 scores
ALTER TABLE scores DELETE
WHERE project_id = {param_project_id:String}
AND timestamp < now() - INTERVAL {param_cutoff_days:Int32} DAY;

-- 清理 blob_storage_file_log（如果启用）
ALTER TABLE blob_storage_file_log DELETE
WHERE project_id = {param_project_id:String}
AND created_at < now() - INTERVAL {param_cutoff_days:Int32} DAY;
```

**注意**：ClickHouse DELETE 是异步操作，可通过以下命令查看进度：

```sql
SELECT * FROM system.mutations WHERE is_done = 0;
```

### 2. PostgreSQL 清理

```sql
-- 删除过期媒体记录（TraceMedia 和 ObservationMedia 会级联删除）
DELETE FROM "Media"
WHERE "projectId" = 'your-project-id'
AND "createdAt" < NOW() - INTERVAL '30 days';
```

### 3. S3/MinIO 清理

#### 方式 A：生命周期策略（推荐）

**MinIO：**

```bash
# 设置 Event Bucket 30 天过期
mc ilm add myminio/langfuse-events --expiry-days 30

# 设置 Media Bucket 30 天过期
mc ilm add myminio/langfuse-media --expiry-days 30

# 查看当前策略
mc ilm ls myminio/langfuse-events
```

**AWS S3：**

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket langfuse-events \
  --lifecycle-configuration '{
    "Rules": [{
      "ID": "expire-old-events",
      "Status": "Enabled",
      "Filter": {},
      "Expiration": { "Days": 30 }
    }]
  }'
```

#### 方式 B：脚本删除

```bash
#!/bin/bash
# 删除 30 天前的文件

# MinIO
mc find myminio/langfuse-events --older-than 30d --exec "mc rm {}"
mc find myminio/langfuse-media --older-than 30d --exec "mc rm {}"

# AWS S3
aws s3 ls s3://langfuse-events --recursive | \
  awk -v cutoff="$(date -d '-30 days' +%Y-%m-%d)" '$1 < cutoff {print $4}' | \
  xargs -P 10 -I {} aws s3 rm s3://langfuse-events/{}
```

### 4. Redis（无需清理）

Redis 数据自动过期，无需手动清理：

| 数据类型 | 清理机制 |
|---------|---------|
| 缓存 | TTL 自动过期（5分钟 ~ 24小时） |
| 队列任务 | 完成后自动删除 |
| 失败任务 | 滚动保留最近 100 条 |

---

## 完整清理脚本

创建 `/opt/langfuse/scripts/cleanup.sh`：

```bash
#!/bin/bash
set -e

# ============ 配置 ============
RETENTION_DAYS=30
PROJECT_ID="your-project-id"  # 或 "all" 清理所有项目

# 数据库连接
CLICKHOUSE_HOST="localhost"
CLICKHOUSE_PORT="8123"
CLICKHOUSE_USER="default"
CLICKHOUSE_PASSWORD=""
CLICKHOUSE_DB="default"

POSTGRES_URL="postgresql://user:password@localhost:5432/langfuse"

# MinIO 配置
MINIO_ALIAS="myminio"
EVENT_BUCKET="langfuse-events"
MEDIA_BUCKET="langfuse-media"

# ============ 计算截止日期 ============
CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +"%Y-%m-%d 00:00:00")
echo "清理 ${CUTOFF_DATE} 之前的数据..."

# ============ ClickHouse 清理 ============
echo "清理 ClickHouse..."

clickhouse_query() {
  clickhouse-client \
    --host="${CLICKHOUSE_HOST}" \
    --port="${CLICKHOUSE_PORT}" \
    --user="${CLICKHOUSE_USER}" \
    --password="${CLICKHOUSE_PASSWORD}" \
    --database="${CLICKHOUSE_DB}" \
    --query="$1"
}

if [ "$PROJECT_ID" = "all" ]; then
  WHERE_CLAUSE="timestamp < '${CUTOFF_DATE}'"
  WHERE_CLAUSE_OBS="start_time < '${CUTOFF_DATE}'"
else
  WHERE_CLAUSE="project_id = '${PROJECT_ID}' AND timestamp < '${CUTOFF_DATE}'"
  WHERE_CLAUSE_OBS="project_id = '${PROJECT_ID}' AND start_time < '${CUTOFF_DATE}'"
fi

clickhouse_query "ALTER TABLE traces DELETE WHERE ${WHERE_CLAUSE}"
clickhouse_query "ALTER TABLE observations DELETE WHERE ${WHERE_CLAUSE_OBS}"
clickhouse_query "ALTER TABLE scores DELETE WHERE ${WHERE_CLAUSE}"

echo "ClickHouse 清理任务已提交（异步执行）"

# ============ PostgreSQL 清理 ============
echo "清理 PostgreSQL..."

if [ "$PROJECT_ID" = "all" ]; then
  psql "${POSTGRES_URL}" -c "DELETE FROM \"Media\" WHERE \"createdAt\" < '${CUTOFF_DATE}'"
else
  psql "${POSTGRES_URL}" -c "DELETE FROM \"Media\" WHERE \"projectId\" = '${PROJECT_ID}' AND \"createdAt\" < '${CUTOFF_DATE}'"
fi

echo "PostgreSQL 清理完成"

# ============ S3/MinIO 清理 ============
echo "清理 S3/MinIO..."

mc find "${MINIO_ALIAS}/${EVENT_BUCKET}" --older-than "${RETENTION_DAYS}d" --exec "mc rm {}"
mc find "${MINIO_ALIAS}/${MEDIA_BUCKET}" --older-than "${RETENTION_DAYS}d" --exec "mc rm {}"

echo "S3/MinIO 清理完成"

# ============ 完成 ============
echo "数据清理完成！"
```

### 配置定时任务

```bash
# 编辑 crontab
crontab -e

# 每天凌晨 3 点执行清理
0 3 * * * /opt/langfuse/scripts/cleanup.sh >> /var/log/langfuse-cleanup.log 2>&1
```

---

## 方案对比

| 维度 | 方案一（内置） | 方案二（手动） |
|------|--------------|---------------|
| **依赖** | Worker + EE 许可证（或直接改数据库） | 无 |
| **数据一致性** | 高（官方代码保证） | 需自行保证 |
| **维护成本** | 低 | 高 |
| **灵活性** | 按项目配置 | 完全自定义 |
| **推荐场景** | Worker 正常运行 | 特殊需求或无 Worker |

---

## 推荐配置

### 生产环境推荐

| 存储 | 保留天数 | 实现方式 |
|------|---------|---------|
| ClickHouse | 30-90 天 | 方案一（内置）或 方案二（脚本） |
| S3 | 30-90 天 | S3 生命周期策略 |
| PostgreSQL | 与 ClickHouse 同步 | 方案一（内置）或 方案二（脚本） |
| Redis | 无需配置 | 自动过期 |

### 最简配置（推荐）

1. **设置数据库保留天数**：
   ```sql
   UPDATE "Project" SET "retentionDays" = 30 WHERE id = 'your-project-id';
   ```

2. **配置 S3 生命周期策略**：
   ```bash
   mc ilm add myminio/langfuse-events --expiry-days 30
   mc ilm add myminio/langfuse-media --expiry-days 30
   ```

3. **确保 Worker 运行**

---

## 相关环境变量

| 变量 | 默认值 | 说明 |
|------|-------|------|
| `QUEUE_CONSUMER_DATA_RETENTION_QUEUE_IS_ENABLED` | `true` | 启用数据保留队列 |
| `LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG` | `true` | 启用 S3 文件追踪 |
| `LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS` | `600000` | ClickHouse 删除超时（10分钟） |
| `LANGFUSE_S3_EVENT_UPLOAD_BUCKET` | - | Event 存储桶名称 |
| `LANGFUSE_S3_MEDIA_UPLOAD_BUCKET` | - | Media 存储桶名称 |

---

## 故障排查

### 1. 数据保留作业未执行

```bash
# 检查 Worker 是否运行
docker ps | grep worker

# 检查 Redis 队列
redis-cli KEYS "*DataRetention*"

# 检查项目保留设置
psql $DATABASE_URL -c 'SELECT id, name, "retentionDays" FROM "Project" WHERE "retentionDays" > 0'
```

### 2. ClickHouse 删除卡住

```sql
-- 查看正在执行的 mutations
SELECT * FROM system.mutations WHERE is_done = 0;

-- 取消卡住的 mutation
KILL MUTATION WHERE mutation_id = 'xxx';
```

### 3. S3 清理失败

```bash
# 检查桶权限
mc ls myminio/langfuse-events

# 检查生命周期策略
mc ilm ls myminio/langfuse-events
```

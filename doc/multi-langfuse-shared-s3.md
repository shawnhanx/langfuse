# 多 Langfuse 实例共享 S3/MinIO 部署方案

## 概述

本文档描述了多个 Langfuse 实例共享同一个 S3/MinIO 存储的部署方案。

**当前状态**: Langfuse 原生**支持** S3/MinIO 共用，无需代码改动。

---

## 背景

### S3 在 Langfuse 中的用途

| 存储类型 | 用途 | 环境变量前缀 |
|---------|------|-------------|
| Event Upload | 存储原始事件数据（traces、observations、scores） | `LANGFUSE_S3_EVENT_UPLOAD_*` |
| Media Upload | 存储媒体文件（图片、音频、视频、PDF） | `LANGFUSE_S3_MEDIA_UPLOAD_*` |
| Batch Export | 存储批量导出文件 | `LANGFUSE_S3_BATCH_EXPORT_*` |

### 相关配置项

#### Event Upload 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LANGFUSE_S3_EVENT_UPLOAD_BUCKET` | Bucket 名称 | - |
| `LANGFUSE_S3_EVENT_UPLOAD_PREFIX` | 文件路径前缀 | `""` |
| `LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT` | S3 端点 | - |
| `LANGFUSE_S3_EVENT_UPLOAD_REGION` | S3 区域 | - |
| `LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID` | 访问密钥 ID | - |
| `LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY` | 访问密钥 | - |
| `LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE` | 强制路径样式 | `false` |

#### Media Upload 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LANGFUSE_S3_MEDIA_UPLOAD_BUCKET` | Bucket 名称 | - |
| `LANGFUSE_S3_MEDIA_UPLOAD_PREFIX` | 文件路径前缀 | `""` |
| `LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT` | S3 端点 | - |
| `LANGFUSE_S3_MEDIA_UPLOAD_REGION` | S3 区域 | - |
| `LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID` | 访问密钥 ID | - |
| `LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY` | 访问密钥 | - |
| `LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE` | 强制路径样式 | `false` |

#### Batch Export 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `LANGFUSE_S3_BATCH_EXPORT_ENABLED` | 启用批量导出 | `false` |
| `LANGFUSE_S3_BATCH_EXPORT_BUCKET` | Bucket 名称 | - |
| `LANGFUSE_S3_BATCH_EXPORT_PREFIX` | 文件路径前缀 | `""` |
| `LANGFUSE_S3_BATCH_EXPORT_ENDPOINT` | S3 端点 | - |
| `LANGFUSE_S3_BATCH_EXPORT_REGION` | S3 区域 | - |
| `LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID` | 访问密钥 ID | - |
| `LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY` | 访问密钥 | - |
| `LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE` | 强制路径样式 | `false` |

---

## 文件路径结构

### Event Upload 路径

```typescript
// worker/src/queues/ingestionQueue.ts:75
bucket_path: `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${projectId}/${entityType}/${eventBodyId}/${fileName}`

// 示例
// PREFIX=instance-a/events/
// 实际路径: instance-a/events/proj-123/trace/event-456/file.json
```

### Media Upload 路径

```typescript
// web/src/pages/api/public/media/index.ts:216-220
const prefix = env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX ?? "";
return `${prefix}${projectId}/${mediaId}.${fileExtension}`;

// 示例
// PREFIX=instance-a/media/
// 实际路径: instance-a/media/proj-123/media-456.png
```

### Batch Export 路径

```typescript
// worker/src/features/batchExport/handleBatchExportJob.ts:183
const fileName = `${env.LANGFUSE_S3_BATCH_EXPORT_PREFIX}${fileDate}-lf-${tableName}-export-${projectId}.${fileExtension}`;

// 示例
// PREFIX=instance-a/exports/
// 实际路径: instance-a/exports/1704067200000-lf-traces-export-proj-123.csv
```

---

## 为什么可以安全共用

### 1. PREFIX 提供命名空间隔离

每个实例配置不同的前缀，文件路径完全分离：

```
Bucket: langfuse-shared

实例 A 的文件:
├── instance-a/
│   ├── events/
│   │   └── proj-111/trace/...
│   ├── media/
│   │   └── proj-111/...
│   └── exports/
│       └── ...-proj-111.csv

实例 B 的文件:
├── instance-b/
│   ├── events/
│   │   └── proj-222/trace/...
│   ├── media/
│   │   └── proj-222/...
│   └── exports/
│       └── ...-proj-222.csv
```

### 2. projectId 是 UUID

每个 Langfuse 实例使用独立的 PostgreSQL，生成的 `projectId` 是 UUID，几乎不可能冲突：

```
实例 A projectId: 7a88fb47-b4e2-43b8-a06c-a5ce950dc53a
实例 B projectId: 9c12de89-f6a3-4b7e-8d91-c7bf123efg45
```

### 3. 文件名包含唯一标识

- Event 文件包含 `eventBodyId`（UUID）
- Media 文件包含 `mediaId`（基于 SHA256 哈希）
- Export 文件包含时间戳和 `projectId`

---

## 部署方案

### 方案 1: 同一 Bucket + 不同 PREFIX（推荐）

**架构图**

```
┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │
│  (PostgreSQL A) │    │  (PostgreSQL B) │
└────────┬────────┘    └────────┬────────┘
         │                      │
         │ PREFIX=instance-a/   │ PREFIX=instance-b/
         │                      │
         └──────────┬───────────┘
                    │
         ┌──────────▼──────────┐
         │  共享 S3/MinIO       │
         │  ┌───────────────┐  │
         │  │ Bucket:       │  │
         │  │ langfuse      │  │
         │  │ ├─instance-a/ │  │
         │  │ └─instance-b/ │  │
         │  └───────────────┘  │
         └─────────────────────┘
```

**配置示例**

实例 A (.env):
```bash
# 共享配置
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT=http://shared-minio:9000
LANGFUSE_S3_EVENT_UPLOAD_REGION=us-east-1
LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID=minio
LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY=miniosecret
LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE=true

# 实例特定前缀
LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-a/events/

LANGFUSE_S3_MEDIA_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT=http://shared-minio:9000
LANGFUSE_S3_MEDIA_UPLOAD_REGION=us-east-1
LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID=minio
LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY=miniosecret
LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE=true
LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-a/media/

LANGFUSE_S3_BATCH_EXPORT_ENABLED=true
LANGFUSE_S3_BATCH_EXPORT_BUCKET=langfuse
LANGFUSE_S3_BATCH_EXPORT_ENDPOINT=http://shared-minio:9000
LANGFUSE_S3_BATCH_EXPORT_REGION=us-east-1
LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID=minio
LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY=miniosecret
LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE=true
LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-a/exports/
```

实例 B (.env):
```bash
# 共享配置（相同）
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT=http://shared-minio:9000
# ... 其他相同配置 ...

# 实例特定前缀（不同）
LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-b/events/
LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-b/media/
LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-b/exports/
```

### 方案 2: 不同 Bucket

**架构图**

```
┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │
└────────┬────────┘    └────────┬────────┘
         │                      │
         │ BUCKET=langfuse-a    │ BUCKET=langfuse-b
         │                      │
         └──────────┬───────────┘
                    │
         ┌──────────▼──────────┐
         │  共享 S3/MinIO       │
         │  ┌───────────────┐  │
         │  │ langfuse-a    │  │
         │  │ langfuse-b    │  │
         │  └───────────────┘  │
         └─────────────────────┘
```

**配置示例**

```bash
# 实例 A
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse-a
LANGFUSE_S3_MEDIA_UPLOAD_BUCKET=langfuse-a
LANGFUSE_S3_BATCH_EXPORT_BUCKET=langfuse-a

# 实例 B
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse-b
LANGFUSE_S3_MEDIA_UPLOAD_BUCKET=langfuse-b
LANGFUSE_S3_BATCH_EXPORT_BUCKET=langfuse-b
```

### 方案 3: 同一 Bucket + 无 PREFIX（依赖 projectId 隔离）

理论上可行，因为 `projectId` 是 UUID，但不推荐：

```bash
# 实例 A 和 B 使用相同配置
LANGFUSE_S3_EVENT_UPLOAD_BUCKET=langfuse
LANGFUSE_S3_EVENT_UPLOAD_PREFIX=  # 空前缀
```

**风险**：
- 文件混在一起，难以管理
- 无法按实例清理数据
- 如果两个 PostgreSQL 碰巧生成相同 projectId（概率极低），会冲突

---

## 方案对比

| 方案 | 隔离级别 | 代码改动 | 管理复杂度 | 推荐度 |
|------|---------|---------|-----------|--------|
| 同一 Bucket + 不同 PREFIX | 路径级 | 无 | 低 | ⭐⭐⭐⭐⭐ |
| 不同 Bucket | Bucket 级 | 无 | 中 | ⭐⭐⭐⭐ |
| 同一 Bucket + 无 PREFIX | projectId 级 | 无 | 高 | ⭐⭐ |

---

## 实施步骤

### 步骤 1: 创建 Bucket（如果使用方案 2）

**MinIO**
```bash
mc alias set myminio http://shared-minio:9000 minio miniosecret
mc mb myminio/langfuse-a
mc mb myminio/langfuse-b
```

**AWS S3**
```bash
aws s3 mb s3://langfuse-a
aws s3 mb s3://langfuse-b
```

### 步骤 2: 配置 IAM 权限（可选）

为每个实例创建独立的 IAM 用户/策略，限制访问范围：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::langfuse",
        "arn:aws:s3:::langfuse/instance-a/*"
      ]
    }
  ]
}
```

### 步骤 3: 配置环境变量

为每个 Langfuse 实例配置对应的环境变量。

### 步骤 4: 启动服务

```bash
docker-compose up -d
```

---

## 数据迁移

### 从独立 S3 迁移到共享 S3

如果需要将现有数据迁移到共享存储：

```bash
# 使用 aws s3 sync 或 mc mirror
aws s3 sync s3://old-bucket-a s3://langfuse/instance-a/
aws s3 sync s3://old-bucket-b s3://langfuse/instance-b/

# 或使用 MinIO Client
mc mirror myminio/old-bucket-a myminio/langfuse/instance-a/
mc mirror myminio/old-bucket-b myminio/langfuse/instance-b/
```

**注意**：迁移后需要更新 PostgreSQL 中的 `bucketPath` 字段（如果存储了完整路径）。

---

## 监控和运维

### 查看各实例存储使用量

**MinIO**
```bash
# 查看实例 A 的存储使用量
mc du myminio/langfuse/instance-a/

# 查看实例 B 的存储使用量
mc du myminio/langfuse/instance-b/
```

**AWS S3**
```bash
aws s3 ls s3://langfuse/instance-a/ --recursive --summarize
aws s3 ls s3://langfuse/instance-b/ --recursive --summarize
```

### 清理特定实例的数据

```bash
# 删除实例 A 的所有数据（谨慎操作！）
mc rm --recursive --force myminio/langfuse/instance-a/

# 或 AWS S3
aws s3 rm s3://langfuse/instance-a/ --recursive
```

### 设置生命周期策略

为不同前缀设置不同的生命周期策略：

```json
{
  "Rules": [
    {
      "ID": "instance-a-retention",
      "Filter": {
        "Prefix": "instance-a/"
      },
      "Status": "Enabled",
      "Expiration": {
        "Days": 365
      }
    },
    {
      "ID": "instance-b-retention",
      "Filter": {
        "Prefix": "instance-b/"
      },
      "Status": "Enabled",
      "Expiration": {
        "Days": 180
      }
    }
  ]
}
```

---

## 优缺点分析

### 优点

- ✅ **零代码改动**：仅需配置环境变量
- ✅ **完全隔离**：通过 PREFIX 实现路径级隔离
- ✅ **易于管理**：可按前缀监控和清理数据
- ✅ **成本优化**：共享存储基础设施
- ✅ **灵活权限**：可为每个前缀配置不同的 IAM 策略

### 缺点

- ⚠️ 配额管理需要额外工具（S3 原生不支持按前缀配额）
- ⚠️ 一个实例的高 I/O 可能影响其他实例（带宽竞争）
- ⚠️ 跨实例数据访问需要额外权限配置

---

## 与其他组件的配合

### 完整的多实例共享架构

```
┌─────────────────┐    ┌─────────────────┐
│  Langfuse A     │    │  Langfuse B     │
│  (PostgreSQL A) │    │  (PostgreSQL B) │
│  (Redis A)      │    │  (Redis B)      │
└────────┬────────┘    └────────┬────────┘
         │                      │
         └──────────┬───────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌────────┐   ┌───────────┐   ┌──────────┐
│Shared  │   │ Shared    │   │ Shared   │
│ClickHouse│   │ S3/MinIO  │   │(Optional)│
│(DB隔离) │   │(PREFIX隔离)│   │          │
└────────┘   └───────────┘   └──────────┘
```

| 组件 | 共用支持 | 隔离方式 |
|------|---------|---------|
| ClickHouse | ✅ 支持 | `CLICKHOUSE_DB` |
| S3/MinIO | ✅ 支持 | `*_PREFIX` |
| Redis | ❌ 需改动 | 修改 `getQueuePrefix` |
| PostgreSQL | ❌ 不支持 | 必须独立 |

---

## 总结

S3/MinIO 是 Langfuse 多实例部署中**最容易共用**的组件：

1. **原生支持**：无需任何代码改动
2. **配置简单**：只需设置不同的 `*_PREFIX` 环境变量
3. **隔离完善**：PREFIX + projectId 双重隔离
4. **运维友好**：可按前缀独立管理各实例数据

**强烈推荐使用方案 1（同一 Bucket + 不同 PREFIX）**，这是最简单且最灵活的方案。

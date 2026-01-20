# Redis 关键数据结构总结与访问方法

## 连接 Redis

```bash
# 使用 redis-cli 连接
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234

# 或使用连接字符串
redis-cli -u redis://root:cce-1234@192.168.128.7:6379/0
```

## 查看所有 Key

```bash
# 查看所有 key（生产环境慎用，数据量大会阻塞 Redis）
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 KEYS "*"

# 使用 --scan 自动遍历（推荐，安全不阻塞）
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 --scan

# 按模式查找 key
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 --scan --pattern "bull:*"
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 --scan --pattern "api-key:*"
```

## 查看 Key 类型和 TTL

```bash
# 查看 key 类型
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 TYPE "key-name"

# 查看 key TTL
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 TTL "key-name"

# 查看 key 内容（字符串类型）
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 GET "key-name"
```

## 查看 BullMQ 队列

```bash
# 查看所有队列相关 key
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 KEYS "bull:*"

# 查看特定队列的待处理任务数
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 LLEN "bull:ingestion-queue:wait"

# 查看队列的活跃任务数
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 LLEN "bull:ingestion-queue:active"

# 查看队列的失败任务数
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 ZCARD "bull:ingestion-queue:failed"

# 查看队列的延迟任务数
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 ZCARD "bull:ingestion-queue:delayed"

# 查看队列的已完成任务数
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 ZCARD "bull:ingestion-queue:completed"
```

## 查看 API Key 缓存

```bash
# 查看所有 API key 缓存
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 KEYS "api-key:*"

# 查看特定 API key 缓存内容
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 GET "api-key:your-hashed-key"
```

## 查看评估配置缓存

```bash
# 查看项目是否有评估配置缓存
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 GET "langfuse:eval:no-job-configs:your-project-id"
```

## 查看 S3 限流标记

> 需设置环境变量 `LANGFUSE_S3_RATE_ERROR_SLOWDOWN_ENABLED=true` 才会生效

```bash
# 查看项目是否被 S3 限流
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 GET "langfuse:s3-slowdown:your-project-id"
```

## 查看 OTel 项目标记

> 需设置环境变量 `LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS=true` 才会生效

```bash
# 查看项目是否使用 OTel
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 GET "langfuse:project:your-project-id:otel:active"
```

## 队列状态统计脚本

```bash
# 统计所有队列状态
for queue in ingestion-queue trace-upsert evaluation-execution-queue batch-export-queue; do
  echo "=== $queue ==="
  echo "wait: $(redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 LLEN "bull:$queue:wait" 2>/dev/null)"
  echo "active: $(redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 LLEN "bull:$queue:active" 2>/dev/null)"
  echo "failed: $(redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 ZCARD "bull:$queue:failed" 2>/dev/null)"
  echo "delayed: $(redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 ZCARD "bull:$queue:delayed" 2>/dev/null)"
done
```

## 清理操作

```bash
# 删除特定 key
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 DEL "key-name"

# 清空特定队列的失败任务
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 DEL "bull:ingestion-queue:failed"

# 清空所有数据
redis-cli -h 192.168.128.7 -p 6379 -a cce-1234 FLUSHDB
```

---

## 核心用途

| 用途         | 说明                               |
| ------------ | ---------------------------------- |
| 任务队列     | BullMQ 队列，处理数据摄入、评估等  |
| API Key 缓存 | 缓存已验证的 API Key，加速认证     |
| 功能标记     | 标记项目状态（S3限流、OTel等）     |
| 配置缓存     | 缓存评估配置、Prompt、模型匹配结果 |

## BullMQ 队列列表

### 数据摄入队列

| 队列名                    | 用途                   |
| ------------------------- | ---------------------- |
| ingestion-queue           | 主数据摄入队列（分片） |
| secondary-ingestion-queue | 高优先级项目摄入       |
| otel-ingestion-queue      | OpenTelemetry 数据摄入 |

### 数据处理队列

| 队列名                        | 用途           |
| ----------------------------- | -------------- |
| trace-upsert                  | Trace 更新     |
| trace-delete                  | Trace 删除     |
| score-delete                  | Score 删除     |
| dataset-delete-queue          | 数据集删除     |
| dataset-run-item-upsert-queue | 数据集条目更新 |
| project-delete                | 项目删除       |

### 评估队列

| 队列名                     | 用途         |
| -------------------------- | ------------ |
| evaluation-execution-queue | 执行评估任务 |
| create-eval-queue          | 创建评估任务 |

### 集成队列

| 队列名                        | 用途          |
| ----------------------------- | ------------- |
| posthog-integration-queue     | PostHog 集成  |
| mixpanel-integration-queue    | Mixpanel 集成 |
| blobstorage-integration-queue | Blob 存储集成 |

### 导出队列

| 队列名                              | 用途             |
| ----------------------------------- | ---------------- |
| batch-export-queue                  | 批量数据导出     |
| core-data-s3-export-queue           | 核心数据 S3 导出 |
| metering-data-postgres-export-queue | 计量数据导出     |

### 系统队列

| 队列名                  | 用途         |
| ----------------------- | ------------ |
| batch-action-queue      | 批量操作     |
| webhook-queue           | Webhook 发送 |
| notification-queue      | 通知发送     |
| dead-letter-retry-queue | 失败任务重试 |
| data-retention-queue    | 数据保留策略 |

---

## Key 模式说明

| Key 模式                                   | 数据类型   | 用途           |
| ------------------------------------------ | ---------- | -------------- |
| `api-key:{hashedKey}`                      | String     | API Key 缓存   |
| `langfuse:eval:no-job-configs:{projectId}` | String     | 评估配置缓存   |
| `langfuse:s3-slowdown:{projectId}`         | String     | S3 限流标记    |
| `langfuse:project:{projectId}:otel:active` | String     | OTel 项目标记  |
| `bull:{queueName}:wait`                    | List       | 队列等待任务   |
| `bull:{queueName}:active`                  | List       | 队列活跃任务   |
| `bull:{queueName}:failed`                  | Sorted Set | 队列失败任务   |
| `bull:{queueName}:delayed`                 | Sorted Set | 队列延迟任务   |
| `bull:{queueName}:completed`               | Sorted Set | 队列已完成任务 |

---

## 缓存 TTL 配置

| 缓存类型    | 环境变量                                      | 默认值 | 说明                                                  |
| ----------- | --------------------------------------------- | ------ | ----------------------------------------------------- |
| Prompt      | `LANGFUSE_CACHE_PROMPT_TTL_SECONDS`           | 300s   | 所有版本可用                                          |
| 模型匹配    | `LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS`      | 86400s | 所有版本可用                                          |
| 评估配置    | 固定                                          | 600s   | 所有版本可用，创建评估任务后自动生效                  |
| OTel 标记   | 固定                                          | 86400s | 需设置 `LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS=true`   |
| S3 限流标记 | `LANGFUSE_S3_RATE_ERROR_SLOWDOWN_TTL_SECONDS` | 可配置 | 需设置 `LANGFUSE_S3_RATE_ERROR_SLOWDOWN_ENABLED=true` |

---

## 队列默认配置

不同队列配置不同，以下是常见范围：

| 配置项           | 值范围                     | 说明                            |
| ---------------- | -------------------------- | ------------------------------- |
| removeOnComplete | `true` 或 `100`            | 完成后删除任务或保留最近 100 条 |
| removeOnFail     | `100` ~ `100,000`          | 保留失败任务数，用于调试        |
| attempts         | `2` ~ `10` 次              | 重试次数，因队列重要性而异      |
| backoff          | exponential, 5000ms 初始值 | 所有队列统一使用指数退避        |

### 主要队列配置详情

| 队列名               | attempts | removeOnFail |
| -------------------- | -------- | ------------ |
| ingestion-queue      | 6        | 100,000      |
| trace-upsert         | 可配置   | 100,000      |
| trace-delete         | 2        | 100,000      |
| evaluation-execution | 10       | 10,000       |
| batch-export         | 8        | 10,000       |
| webhook-queue        | 5        | 100,000      |

# 多 Langfuse 实例共享 Redis 部署方案

**当前状态**: 支持共用同一 Redis 数据库实，需使用不同 db

[https://github.com/orgs/langfuse/discussions/8420](https://github.com/orgs/langfuse/discussions/8420)

[https://langfuse.com/self-hosting/deployment/infrastructure/cache](https://langfuse.com/self-hosting/deployment/infrastructure/cache)

## 背景

### Redis 在 Langfuse 中的用途

| 用途            | 说明                                             |
| --------------- | ------------------------------------------------ |
| BullMQ 任务队列 | 异步任务处理（ingestion、export、evaluation 等） |
| 缓存            | Prompt 缓存、API Key 缓存等                      |
| 分布式锁        | 防止重复处理、并发控制                           |
| 去重检查        | 事件去重（recently-processed cache）             |

### 相关配置项

| 环境变量                  | 说明             | 默认值  |
| ------------------------- | ---------------- | ------- |
| `REDIS_HOST`              | Redis 主机地址   | -       |
| `REDIS_PORT`              | Redis 端口       | `6379`  |
| `REDIS_AUTH`              | Redis 密码       | -       |
| `REDIS_USERNAME`          | Redis 用户名     | -       |
| `REDIS_CONNECTION_STRING` | Redis 连接字符串 | -       |
| `REDIS_KEY_PREFIX`        | Redis key 前缀   | -       |
| `REDIS_CLUSTER_ENABLED`   | 是否启用集群模式 | `false` |
| `REDIS_CLUSTER_NODES`     | 集群节点列表     | -       |

---

## 当前限制

### 问题：BullMQ 队列名称硬编码

```
// packages/shared/src/server/queues.ts
export enum QueueName {
  IngestionQueue = "ingestion-queue",
  BatchExport = "batch-export",
  TraceDelete = "trace-delete",
  // ... 等等
}
```

### 问题：BullMQ 不使用 ioredis keyPrefix

```
// packages/shared/src/server/redis/redis.ts
const defaultRedisOptions: Partial<RedisOptions> = {
  keyPrefix: env.REDIS_KEY_PREFIX ?? undefined,  // 只影响普通 Redis 操作
};

// BullMQ 队列创建
new Queue(QueueName.IngestionQueue, {
  connection: redis,
  prefix: getQueuePrefix(queueName),  // BullMQ 使用自己的 prefix，忽略 ioredis keyPrefix
});

// getQueuePrefix 当前实现
export const getQueuePrefix = (queueName: string): string | undefined => {
  if (env.REDIS_CLUSTER_ENABLED === "true") {
    return `{${queueName}}`;  // 只是哈希标签，不是实例隔离前缀
  }
  return undefined;  // 非集群模式无前缀
};
```

### 共用 Redis 的后果

```
实例 A Web/Worker                实例 B Web/Worker
     │                                │
     │  生产/消费 "ingestion-queue"   │  生产/消费 "ingestion-queue"
     │                                │
     └────────────┬───────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │  共享 Redis      │
        │                 │
        │ bull:ingestion-queue:job-1  ← 实例 A 的任务
        │ bull:ingestion-queue:job-2  ← 实例 B 的任务
        │                 │
        └─────────────────┘

结果：实例 A 的 Worker 可能处理实例 B 的任务，导致数据错乱
```

---

## 解决方案

### 方案 1：使用不同 Redis 数据库（推荐）

Redis 单实例默认支持 16 个数据库（db 0 ~ db 15），可以为每套 Langfuse 环境分配不同的 db：

```yaml
# Langfuse 实例 A（生产环境）
- name: REDIS_CONNECTION_STRING
  value: redis://root:password@192.168.128.7:6379/0

# Langfuse 实例 B（测试环境）
- name: REDIS_CONNECTION_STRING
  value: redis://root:password@192.168.128.7:6379/1

# Langfuse 实例 C（开发环境）
- name: REDIS_CONNECTION_STRING
  value: redis://root:password@192.168.128.7:6379/2
```

**优点**：

- 无需修改代码
- 完全隔离 BullMQ 队列和缓存
- 单 Redis 实例即可支持多环境

---

## 注意事项

### REDIS_KEY_PREFIX 的作用范围

| Key 类型                         | 受 REDIS_KEY_PREFIX 影响 |
| -------------------------------- | ------------------------ |
| 缓存 Key（api-key、eval 配置等） | 是                       |
| BullMQ 队列 Key（bull:\*）       | 否                       |

因此，**仅设置 `REDIS_KEY_PREFIX` 无法实现多环境隔离**。

### 查看 Redis 数据库数量

```bash
redis-cli -h 192.168.128.7 -p 6379 -a password CONFIG GET databases
```

### 验证不同 db 的隔离性

```bash
# 查看 db 0 的 key
redis-cli -h 192.168.128.7 -p 6379 -a password -n 0 KEYS "bull:*"

# 查看 db 1 的 key
redis-cli -h 192.168.128.7 -p 6379 -a password -n 1 KEYS "bull:*"
```

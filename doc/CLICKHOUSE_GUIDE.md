# ClickHouse 关键表结构总结与访问方法

## 查看所有表

```bash
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SHOW TABLES"
```

## 查看任意表结构

```bash
# 方式1：查看列信息
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "DESCRIBE TABLE traces"

# 方式2：查看建表语句
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SHOW CREATE TABLE traces"

# 方式3：查看字段名（带表头输出）
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --format PrettyCompactNoEscapes \
    --query "SELECT * FROM traces LIMIT 1"

# 方式4：仅查看列名列表
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT name FROM system.columns WHERE table = 'traces' AND database = currentDatabase()"
```

## 查看 Traces（执行追踪）

```bash
# 关键字段
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT id, project_id, name, user_id, session_id, timestamp FROM traces LIMIT 10"

# 按项目查询
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT id, name, timestamp FROM traces WHERE project_id = 'your-project-id' ORDER BY timestamp DESC LIMIT 10"

# 统计项目 trace 数量
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT project_id, count() as trace_count FROM traces WHERE is_deleted = 0 GROUP BY project_id"
```

## 查看 Observations（LLM调用记录）

```bash
# 关键字段
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT id, trace_id, project_id, type, name, provided_model_name, total_cost FROM observations LIMIT 10"

# 按类型统计
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT type, count() as count FROM observations WHERE project_id = 'your-project-id' GROUP BY type"

# 查看 Token 使用量（仅 GENERATION 类型）
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT id, provided_model_name, usage_details, cost_details, total_cost FROM observations WHERE project_id = 'cmjz6nbhl0006zw07jwn1pe9j' AND type = 'GENERATION' LIMIT 10"
```

## 查看 Scores（评分）

```bash
# 关键字段
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT id, project_id, trace_id, name, value, source, data_type FROM scores LIMIT 10"

# 按来源统计
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT source, count() as count FROM scores WHERE project_id = 'your-project-id' GROUP BY source"

# 按评分名称统计平均值
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT name, avg(value) as avg_score, count() as count FROM scores WHERE project_id = 'your-project-id' AND data_type = 'NUMERIC' GROUP BY name"
```

## 查看 Sessions（会话）

```bash
# 注意：ClickHouse 中没有独立的 sessions 表，session_id 是 traces 表的字段
# 按 session 聚合查询
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT session_id, count() as trace_count, min(timestamp) as start_time, max(timestamp) as end_time FROM traces WHERE project_id = 'cmjz6nbhl0006zw07jwn1pe9j' AND session_id IS NOT NULL GROUP BY session_id LIMIT 10"
```

## 查看 Dataset Run Items（数据集运行条目）

```bash
# 关键字段
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT id, project_id, dataset_id, dataset_run_id, trace_id FROM dataset_run_items LIMIT 10"

# 按数据集统计运行情况
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT dataset_id, dataset_run_name, count() as item_count FROM dataset_run_items WHERE project_id = 'your-project-id' GROUP BY dataset_id, dataset_run_name"
```

## 查看项目环境列表

```bash
# 按项目查看使用的环境
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT project_id, groupUniqArray(environment) as environments FROM traces GROUP BY project_id"

# 查看特定项目的环境
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT DISTINCT environment FROM traces WHERE project_id = 'your-project-id'"
```

## 常用统计查询

```bash
# 项目每日 trace 数量趋势
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT toDate(timestamp) as date, count() as count FROM traces WHERE project_id = 'cmjz6nbhl0006zw07jwn1pe9j' AND is_deleted = 0 GROUP BY date ORDER BY date DESC LIMIT 30"

# 项目成本统计（按模型）
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT provided_model_name, sum(total_cost) as total_cost, count() as call_count FROM observations WHERE project_id = 'your-project-id' AND is_deleted = 0 GROUP BY provided_model_name ORDER BY total_cost DESC"

# 项目 Token 使用统计
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "SELECT
        sumMap(usage_details)['input'] as total_input_tokens,
        sumMap(usage_details)['output'] as total_output_tokens,
        sumMap(usage_details)['total'] as total_tokens
    FROM observations WHERE project_id = 'cmjz6nbhl0006zw07jwn1pe9j' AND is_deleted = 0"
```

## 删除数据（软删除机制）

```bash
# ClickHouse 使用 ReplacingMergeTree，通过 is_deleted 标记实现软删除
# 不建议直接删除数据，应通过应用层接口操作

# 如需物理删除（谨慎操作）
clickhouse-client --host 192.168.128.4 --user admin --password cce@1234 --database default \
    --query "ALTER TABLE traces DELETE WHERE project_id = 'your-project-id' AND id = 'trace-id'"
```

---

## 核心业务表

| 表名              | 用途                 | 引擎                         |
| ----------------- | -------------------- | ---------------------------- |
| traces            | 执行追踪记录         | ReplicatedReplacingMergeTree |
| observations      | LLM调用/工具调用记录 | ReplicatedReplacingMergeTree |
| scores            | 评分/评估结果        | ReplicatedReplacingMergeTree |
| dataset_run_items | 数据集运行条目       | ReplacingMergeTree           |

## 辅助表

| 表名                  | 用途             | 引擎                           |
| --------------------- | ---------------- | ------------------------------ |
| project_environments  | 项目环境列表聚合 | ReplicatedAggregatingMergeTree |
| event_log             | 事件日志         | MergeTree                      |
| blob_storage_file_log | Blob存储审计日志 | ReplicatedReplacingMergeTree   |

## 分析视图

| 表名                   | 用途                    |
| ---------------------- | ----------------------- |
| analytics_traces       | 按小时 trace 分析       |
| analytics_observations | 按小时 observation 分析 |
| analytics_scores       | 按小时 score 分析       |

## 其他表

| 表名                  | 用途                     |
| --------------------- | ------------------------ |
| schema_migrations     | ClickHouse 迁移记录      |
| dataset_run_items_rmt | 数据集运行条目（复制版） |

---

## 关键字段说明

### traces 表核心字段

| 字段        | 类型                   | 说明                         |
| ----------- | ---------------------- | ---------------------------- |
| id          | String                 | 唯一标识                     |
| project_id  | String                 | 项目ID                       |
| name        | String                 | trace 名称                   |
| user_id     | Nullable(String)       | 关联用户                     |
| session_id  | Nullable(String)       | 会话ID                       |
| environment | LowCardinality(String) | 环境（default/production等） |
| input       | Nullable(String)       | 输入数据（ZSTD压缩）         |
| output      | Nullable(String)       | 输出数据（ZSTD压缩）         |
| metadata    | Map(String, String)    | 自定义元数据                 |
| tags        | Array(String)          | 标签数组                     |
| timestamp   | DateTime64             | 时间戳                       |
| is_deleted  | UInt8                  | 软删除标记                   |

### observations 表核心字段

| 字段                | 类型                   | 说明                         |
| ------------------- | ---------------------- | ---------------------------- |
| id                  | String                 | 唯一标识                     |
| trace_id            | String                 | 关联的 trace                 |
| project_id          | String                 | 项目ID                       |
| type                | LowCardinality(String) | 类型（LLM/TOOL/RETRIEVAL等） |
| name                | String                 | 名称                         |
| provided_model_name | Nullable(String)       | 模型名称                     |
| usage_details       | Map(String, UInt64)    | Token 使用详情               |
| cost_details        | Map(String, Decimal64) | 成本详情                     |
| total_cost          | Nullable(Decimal64)    | 总成本                       |
| start_time          | DateTime64             | 开始时间                     |
| end_time            | Nullable(DateTime64)   | 结束时间                     |
| input               | Nullable(String)       | 输入（ZSTD压缩）             |
| output              | Nullable(String)       | 输出（ZSTD压缩）             |

### scores 表核心字段

| 字段           | 类型             | 说明                                    |
| -------------- | ---------------- | --------------------------------------- |
| id             | String           | 唯一标识                                |
| project_id     | String           | 项目ID                                  |
| trace_id       | String           | 关联的 trace                            |
| observation_id | Nullable(String) | 关联的 observation                      |
| name           | String           | 评分名称                                |
| value          | Float64          | 数值评分                                |
| string_value   | Nullable(String) | 字符串评分                              |
| source         | String           | 来源（ANNOTATION/API/EVAL）             |
| data_type      | String           | 数据类型（NUMERIC/BOOLEAN/CATEGORICAL） |

---

## 设计模式说明

1. **软删除**：所有可变表使用 `is_deleted` 标记 + `event_ts` 配合 ReplacingMergeTree
2. **多租户隔离**：所有查询必须带 `project_id` 过滤
3. **数据压缩**：大字段（input/output/comment）使用 ZSTD 压缩
4. **布隆过滤器索引**：常查询字段（id/trace_id/user_id）建立 bloom_filter 索引
5. **低基数优化**：枚举字段（type/level/environment）使用 LowCardinality
6. **Map存储**：灵活元数据使用 Map(String, String)
7. **月分区**：traces/observations/scores 按月分区 (toYYYYMM)

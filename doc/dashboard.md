langfuse指标采集

目前 Dashboard 不支持计算型指标（如错误率、成功率等），可以使用 Metrics API 编程方式获取数据并计算错误率，然后通过外部工具展示

| **指标分类** | **指标名称** | **是否可以直接获取** | **解决方案** |
| ------------ | ------------ | -------------------- | ------------ |
|              |              |                      |              |
|              |              |                      |              |
|              |              |                      |              |

## agent数

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "traces",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [{"field": "tags"}],
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"tags":["cce-agent"],"count_count":"131"},{"tags":[],"count_count":"65"},{"tags":["agent","demo"],"count_count":"39"},{"tags":["agent","demo","mcp"],"count_count":"25"},{"tags":["cce-agent","demo","mcp"],"count_count":"2"},{"tags":["cfc-agent"],"count_count":"1"},{"tags":["agent","demo","langgraph"],"count_count":"1"},{"tags":["ccr-agent","demo","mcp"],"count_count":"1"}]}
```

需要把返回结果二次加工：比如规定所有包含“-agent”的tag用于区分不同agent，以上返回符合条件的共出现过cce-agent, cfc-agent, ccr-agent，所以agent数应该是3

## Trace数

Trace数

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "traces",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [],
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"count_count":"284"}]}
```

Trace数，折线图

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "traces",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "timeDimension": {"granularity": "day"},
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"time_dimension":"2026-01-01","count_count":"0"},{"time_dimension":"2026-01-02","count_count":"0"},{"time_dimension":"2026-01-03","count_count":"0"},{"time_dimension":"2026-01-04","count_count":"69"},{"time_dimension":"2026-01-05","count_count":"215"}]
```

## 会话数

会话数

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "traces",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [{"field": "sessionId"}],
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"sessionId":"session-test","count_count":"121"},{"sessionId":"cce-agent","count_count":"79"},{"sessionId":null,"count_count":"31"},{"sessionId":"test-session-id","count_count":"14"},{"sessionId":"cfc-123456789","count_count":"8"},{"sessionId":"q1xyfhly2cvqc52y5spi","count_count":"6"},{"sessionId":"session-001","count_count":"5"},{"sessionId":"session-67890","count_count":"5"},{"sessionId":"test","count_count":"4"},{"sessionId":"irpan_session_id","count_count":"3"},{"sessionId":"session-test-1","count_count":"2"},{"sessionId":"test-session-456","count_count":"1"},{"sessionId":"session-003","count_count":"1"},{"sessionId":"session-002","count_count":"1"}]}
```

这会返回每个sessionId的trace数量,然后需要统计返回结果中data的长度来得到session总数

会话数，按agent筛选

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "traces",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [{"field": "sessionId"}],
  "filters": [
    {
      "column": "tags",
      "operator": "any of",
      "value": ["cce-agent", "ccr-agent"],
      "type": "arrayOptions"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"sessionId":"session-test","count_count":"87"},{"sessionId":"cce-agent","count_count":"67"},{"sessionId":"session-test-1","count_count":"2"}]}
```

可以得到cce-agent和ccr-agent一共有3个session

会话数，折线图

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "traces",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [{"field": "sessionId"}],
  "timeDimension": {"granularity": "day"},
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"sessionId":null,"time_dimension":"2026-01-01","count_count":"0"},{"sessionId":null,"time_dimension":"2026-01-02","count_count":"0"},{"sessionId":null,"time_dimension":"2026-01-03","count_count":"0"},{"sessionId":"session-003","time_dimension":"2026-01-04","count_count":"1"},{"sessionId":"session-67890","time_dimension":"2026-01-04","count_count":"5"},{"sessionId":"cce-agent","time_dimension":"2026-01-04","count_count":"11"},{"sessionId":"test","time_dimension":"2026-01-04","count_count":"4"},{"sessionId":"irpan_session_id","time_dimension":"2026-01-04","count_count":"3"},{"sessionId":"session-test","time_dimension":"2026-01-04","count_count":"11"},{"sessionId":"cfc-123456789","time_dimension":"2026-01-04","count_count":"8"},{"sessionId":"session-001","time_dimension":"2026-01-04","count_count":"5"},{"sessionId":null,"time_dimension":"2026-01-04","count_count":"18"},{"sessionId":"session-002","time_dimension":"2026-01-04","count_count":"1"},{"sessionId":"test-session-id","time_dimension":"2026-01-04","count_count":"1"},{"sessionId":"test-session-456","time_dimension":"2026-01-04","count_count":"1"},{"sessionId":null,"time_dimension":"2026-01-05","count_count":"13"},{"sessionId":"session-test","time_dimension":"2026-01-05","count_count":"113"},{"sessionId":"session-test-1","time_dimension":"2026-01-05","count_count":"2"},{"sessionId":"test-session-id","time_dimension":"2026-01-05","count_count":"13"},{"sessionId":"cce-agent","time_dimension":"2026-01-05","count_count":"68"},{"sessionId":"q1xyfhly2cvqc52y5spi","time_dimension":"2026-01-05","count_count":"6"}]}
```

需要分别计算每个time_dimension的结果长度

## 错误数

错误数

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [],
  "filters": [
    {
      "column": "level",
      "operator": "=",
      "value": "ERROR",
      "type": "string"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"count_count":"94"}]}
```

错误数，折线图

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [],
  "timeDimension": {"granularity": "day"},
  "filters": [
    {
      "column": "level",
      "operator": "=",
      "value": "ERROR",
      "type": "string"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"time_dimension":"2026-01-01","count_count":"0"},{"time_dimension":"2026-01-02","count_count":"0"},{"time_dimension":"2026-01-03","count_count":"0"},{"time_dimension":"2026-01-04","count_count":"39"},{"time_dimension":"2026-01-05","count_count":"55"}]}
```

错误数，按agent筛选

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [],
  "timeDimension": {"granularity": "day"},
  "filters": [
    {
      "column": "level",
      "operator": "=",
      "value": "ERROR",
      "type": "string"
    },
    {
      "column": "tags",
      "operator": "any of",
      "value": ["cce-agent", "ccr-agent"],
      "type": "arrayOptions"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"time_dimension":"2026-01-01","count_count":"0"},{"time_dimension":"2026-01-02","count_count":"0"},{"time_dimension":"2026-01-03","count_count":"0"},{"time_dimension":"2026-01-04","count_count":"0"},{"time_dimension":"2026-01-05","count_count":"5"}]}
```

错误数，按名称分组统计

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [{"field": "name"}],
  "timeDimension": {"granularity": "day"},
  "filters": [
    {
      "column": "level",
      "operator": "=",
      "value": "ERROR",
      "type": "string"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"name":"","time_dimension":"2026-01-01","count_count":"0"},{"name":"","time_dimension":"2026-01-02","count_count":"0"},{"name":"","time_dimension":"2026-01-03","count_count":"0"},{"name":"LangGraph","time_dimension":"2026-01-04","count_count":"16"},{"name":"ChatGoogleGenerativeAI","time_dimension":"2026-01-04","count_count":"2"},{"name":"multiply_numbers","time_dimension":"2026-01-04","count_count":"1"},{"name":"ChatOpenAI","time_dimension":"2026-01-04","count_count":"9"},{"name":"model","time_dimension":"2026-01-04","count_count":"11"},{"name":"ChatOpenAI","time_dimension":"2026-01-05","count_count":"13"},{"name":"model","time_dimension":"2026-01-05","count_count":"13"},{"name":"process_user_query_async","time_dimension":"2026-01-05","count_count":"11"},{"name":"process_user_query","time_dimension":"2026-01-05","count_count":"2"},{"name":"LangGraph","time_dimension":"2026-01-05","count_count":"14"},{"name":"multiply_numbers","time_dimension":"2026-01-05","count_count":"1"},{"name":"tools","time_dimension":"2026-01-05","count_count":"1"}]}
```

## 模型调用次数

模型调用次数

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
"view": "observations",
"metrics": [{"measure": "count", "aggregation": "count"}],
"dimensions": [],
"filters": [
{
"column": "type",
"operator": "=",
"value": "GENERATION",
"type": "string"
}
],
"fromTimestamp": "2026-01-04T00:00:00Z",
"toTimestamp": "2026-01-05T00:00:00Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"count_count":"372"}]}
```

模型调用次数，按模型分组排序

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
"view": "observations",
"metrics": [{"measure": "count", "aggregation": "count"}],
"dimensions": [{"field": "providedModelName"}],
"filters": [
{
"column": "type",
"operator": "=",
"value": "GENERATION",
"type": "string"
}
],
"fromTimestamp": "2026-01-04T00:00:00Z",
"toTimestamp": "2026-01-05T00:00:00Z",
"orderBy": [{"field": "count_count", "direction": "desc"}]
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"providedModelName":"deepseek-v3.2","count_count":"352"},{"providedModelName":"gemini-3-flash-preview","count_count":"11"},{"providedModelName":"gemini-2.5-pro","count_count":"6"},{"providedModelName":"ERNIE-4.0-8K","count_count":"2"},{"providedModelName":"gemini-1.5-flash","count_count":"1"}]}
```

模型调用次数，折线图

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
"view": "observations",
"metrics": [{"measure": "count", "aggregation": "count"}],
"dimensions": [],
"filters": [
{
"column": "type",
"operator": "=",
"value": "GENERATION",
"type": "string"
}
],
"timeDimension": {"granularity": "auto"},
"fromTimestamp": "2026-01-01T00:00:00Z",
"toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"time_dimension":"2026-01-01","count_count":"0"},{"time_dimension":"2026-01-02","count_count":"0"},{"time_dimension":"2026-01-03","count_count":"0"},{"time_dimension":"2026-01-04","count_count":"372"},{"time_dimension":"2026-01-05","count_count":"459"}]}
```

其中`granularity` 支持以下选项：

| 粒度     | 描述         |
| -------- | ------------ |
| `minute` | 按分钟分组   |
| `hour`   | 按小时分组   |
| `day`    | 按天分组     |
| `week`   | 按周分组     |
| `month`  | 按月分组     |
| `auto`   | 自动选择粒度 |

模型调用次数折线图，按模型分组

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
"view": "observations",
"metrics": [{"measure": "count", "aggregation": "count"}],
"dimensions": [{"field": "providedModelName"}],
"filters": [
{
"column": "type",
"operator": "=",
"value": "GENERATION",
"type": "string"
}
],
"timeDimension": {"granularity": "day"},
"fromTimestamp": "2026-01-01T00:00:00Z",
"toTimestamp": "2026-01-05T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"providedModelName":null,"time_dimension":"2026-01-01","count_count":"0"},{"providedModelName":null,"time_dimension":"2026-01-02","count_count":"0"},{"providedModelName":null,"time_dimension":"2026-01-03","count_count":"0"},{"providedModelName":"ERNIE-4.0-8K","time_dimension":"2026-01-04","count_count":"2"},{"providedModelName":"deepseek-v3.2","time_dimension":"2026-01-04","count_count":"352"},{"providedModelName":"gemini-3-flash-preview","time_dimension":"2026-01-04","count_count":"11"},{"providedModelName":"gemini-1.5-flash","time_dimension":"2026-01-04","count_count":"1"},{"providedModelName":"gemini-2.5-pro","time_dimension":"2026-01-04","count_count":"6"},{"providedModelName":"deepseek-v3","time_dimension":"2026-01-05","count_count":"19"},{"providedModelName":"deepseek-v3.2","time_dimension":"2026-01-05","count_count":"440"}]}
```

## Token消耗

Token消耗

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "totalTokens", "aggregation": "sum"}],
  "dimensions": [],
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-09T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"sum_totalTokens":"1691427"}]}
```

Token消耗，折线图

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "totalTokens", "aggregation": "sum"}],
  "dimensions": [],
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-09T23:59:59Z",
  "timeDimension": {"granularity": "day"}
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"time_dimension":"2026-01-01","sum_totalTokens":"0"},{"time_dimension":"2026-01-02","sum_totalTokens":"0"},{"time_dimension":"2026-01-03","sum_totalTokens":"0"},{"time_dimension":"2026-01-04","sum_totalTokens":"587095"},{"time_dimension":"2026-01-05","sum_totalTokens":"755213"},{"time_dimension":"2026-01-06","sum_totalTokens":"349119"},{"time_dimension":"2026-01-07","sum_totalTokens":"0"},{"time_dimension":"2026-01-08","sum_totalTokens":"0"}]}
```

## Trace错误数

Trace错误数

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'filter=[{"type":"number","column":"errorCount","operator":">","value":0}]' \
--data-urlencode 'fromTimestamp=2026-01-01T00:00:00Z' \
--data-urlencode 'toTimestamp=2026-01-05T23:59:59Z' \
http://120.48.107.60:3000/api/public/traces
```

通过 `meta.totalItems` 获取总数

不支持直接获取错误Trace数的时间序列，需要多次调用上述接口

## 延时

按具体的工具名称分组查看延迟

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "latency", "aggregation": "avg"}],
  "dimensions": [{"field": "name"}],
  "filters": [
    {
      "column": "type",
      "operator": "=",
      "value": "TOOL",
      "type": "string"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-09T23:59:59Z",
  "timeDimension": {"granularity": "day"}
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"name":"","time_dimension":"2026-01-01","avg_latency":null},{"name":"","time_dimension":"2026-01-02","avg_latency":null},{"name":"","time_dimension":"2026-01-03","avg_latency":null},{"name":"get_weather","time_dimension":"2026-01-04","avg_latency":0.7573529411764706},{"name":"multiply_numbers","time_dimension":"2026-01-04","avg_latency":0.6020408163265306},{"name":"add_numbers","time_dimension":"2026-01-04","avg_latency":0.6625},{"name":"search_web","time_dimension":"2026-01-04","avg_latency":0.65},{"name":"add_numbers","time_dimension":"2026-01-05","avg_latency":0.4},{"name":"search_web","time_dimension":"2026-01-05","avg_latency":0.6142857142857143},{"name":"get_weather","time_dimension":"2026-01-05","avg_latency":0.5699481865284974},{"name":"multiply_numbers","time_dimension":"2026-01-05","avg_latency":0.4423076923076923},{"name":"get-current-time","time_dimension":"2026-01-05","avg_latency":540.5445544554456},{"name":"chinese-holiday-detail","time_dimension":"2026-01-06","avg_latency":710.3389830508474},{"name":"get-current-time","time_dimension":"2026-01-06","avg_latency":400.80392156862746},{"name":"get_weather","time_dimension":"2026-01-06","avg_latency":1.0714285714285714},{"name":"","time_dimension":"2026-01-07","avg_latency":null},{"name":"","time_dimension":"2026-01-08","avg_latency":null}]}
```

延时分布

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "latency", "aggregation": "p95"}],
  "dimensions": [{"field": "type"}],
  "filters": [],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-09T23:59:59Z"
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"type":"SPAN","p95_latency":9171.999999999998},{"type":"CHAIN","p95_latency":6404.199999999998},{"type":"GENERATION","p95_latency":3888.599999999998},{"type":"TOOL","p95_latency":658.25}]}
```

![](https://rte.weiyun.baidu.com/wiki/attach/image/api/imageDownloadAddress?attachId=40de0317cadb41869438e99356676130&docGuid=rNTjypoPma4tvA)

## 工具错误率

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [{"field": "level"}],
  "filters": [
    {
      "column": "type",
      "operator": "=",
      "value": "TOOL",
      "type": "string"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-09T23:59:59Z",
  "timeDimension": {"granularity": "day"}
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"level":"","time_dimension":"2026-01-01","count_count":"0"},{"level":"","time_dimension":"2026-01-02","count_count":"0"},{"level":"","time_dimension":"2026-01-03","count_count":"0"},{"level":"ERROR","time_dimension":"2026-01-04","count_count":"1"},{"level":"DEFAULT","time_dimension":"2026-01-04","count_count":"373"},{"level":"DEFAULT","time_dimension":"2026-01-05","count_count":"455"},{"level":"ERROR","time_dimension":"2026-01-05","count_count":"1"},{"level":"DEFAULT","time_dimension":"2026-01-06","count_count":"195"},{"level":"ERROR","time_dimension":"2026-01-06","count_count":"1"},{"level":"","time_dimension":"2026-01-07","count_count":"0"},{"level":"","time_dimension":"2026-01-08","count_count":"0"}]}
```

返回每天按 level 分组的工具调用数量，可以从中计算错误率。

加入工具名的维度，用于精细化查看

```
curl \
-H "Authorization: Basic cGstbGYtZmVmNmVmNTctYjdhNC00NGU1LTkzMTUtMTAzMzBmZGJmMGZiOnNrLWxmLWZiYjgwYzg3LTU2MGEtNDkxZi1hMWFjLTE2YjAzMjZiNmJlNA==" \
-G \
--data-urlencode 'query={
  "view": "observations",
  "metrics": [{"measure": "count", "aggregation": "count"}],
  "dimensions": [{"field": "name"}, {"field": "level"}],
  "filters": [
    {
      "column": "type",
      "operator": "=",
      "value": "TOOL",
      "type": "string"
    }
  ],
  "fromTimestamp": "2026-01-01T00:00:00Z",
  "toTimestamp": "2026-01-09T23:59:59Z",
  "timeDimension": {"granularity": "day"}
}' \
http://120.48.107.60:3000/api/public/metrics
{"data":[{"name":"","level":"","time_dimension":"2026-01-01","count_count":"0"},{"name":"","level":"","time_dimension":"2026-01-02","count_count":"0"},{"name":"","level":"","time_dimension":"2026-01-03","count_count":"0"},{"name":"multiply_numbers","level":"ERROR","time_dimension":"2026-01-04","count_count":"1"},{"name":"multiply_numbers","level":"DEFAULT","time_dimension":"2026-01-04","count_count":"97"},{"name":"get_weather","level":"DEFAULT","time_dimension":"2026-01-04","count_count":"136"},{"name":"search_web","level":"DEFAULT","time_dimension":"2026-01-04","count_count":"60"},{"name":"add_numbers","level":"DEFAULT","time_dimension":"2026-01-04","count_count":"80"},{"name":"search_web","level":"DEFAULT","time_dimension":"2026-01-05","count_count":"70"},{"name":"add_numbers","level":"DEFAULT","time_dimension":"2026-01-05","count_count":"40"},{"name":"get-current-time","level":"DEFAULT","time_dimension":"2026-01-05","count_count":"101"},{"name":"multiply_numbers","level":"ERROR","time_dimension":"2026-01-05","count_count":"1"},{"name":"multiply_numbers","level":"DEFAULT","time_dimension":"2026-01-05","count_count":"51"},{"name":"get_weather","level":"DEFAULT","time_dimension":"2026-01-05","count_count":"193"},{"name":"chinese-holiday-detail","level":"DEFAULT","time_dimension":"2026-01-06","count_count":"60"},{"name":"get_weather","level":"DEFAULT","time_dimension":"2026-01-06","count_count":"85"},{"name":"get-current-time","level":"ERROR","time_dimension":"2026-01-06","count_count":"1"},{"name":"get-current-time","level":"DEFAULT","time_dimension":"2026-01-06","count_count":"50"},{"name":"","level":"","time_dimension":"2026-01-07","count_count":"0"},{"name":"","level":"","time_dimension":"2026-01-08","count_count":"0"}]}
```

## 每个trace的token消耗

## 每个trace的LLM调用次数/工具调用次数

备注

Metrics API v2目前仅在 Langfuse Cloud 上可用，处于 beta 阶段

[https://langfuse.com/changelog/2025-12-17-v2-metrics-and-observations-api](https://langfuse.com/changelog/2025-12-17-v2-metrics-and-observations-api)

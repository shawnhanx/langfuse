# Agents页面仪表盘指标汇总

本文档汇总了Agents页面下三个Tab中所有仪表盘指标的含义和说明。

---

## Model Tab - 模型分析

### 主要组件

| 组件名称 | 指标含义 | 子标签页/字段 | 详细说明 |
|---------|---------|-------------|---------|
| **Model Usage** | 模型使用情况 | Cost by model | 按模型统计成本时间趋势，显示总成本 |
| | | Cost by type | 按类型统计成本时间趋势，显示总成本 |
| | | Usage by model | 按模型统计Token使用量时间趋势，显示总Token数 |
| | | Usage by type | 按类型统计Token使用量时间趋势，显示总Token数 |
| **Model costs** | 模型成本 | Model | 表格展示每个模型的Token使用量和USD成本，按成本降序排列 |
| | | Tokens | 总Token数量 |
| | | USD | 总成本（USD），计算公式：Token数量 × 每Token成本 |
| **Model latencies** | 模型延迟 | 50th Percentile | P50延迟时间（秒），按模型分组 |
| | | 75th Percentile | P75延迟时间（秒），按模型分组 |
| | | 90th Percentile | P90延迟时间（秒），按模型分组 |
| | | 95th Percentile | P95延迟时间（秒），按模型分组 |
| | | 99th Percentile | P99延迟时间（秒），按模型分组 |
| **User consumption** | 用户消耗 | Token cost | 按用户统计的Token成本，显示总成本 |
| | | Count of Traces | 按用户统计的Trace数量，显示总Trace数 |

### Dashboard Widgets - Token使用指标

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Total Input Tokens | NUMBER | 总输入Token数量 |
| Total Output Tokens | NUMBER | 总输出Token数量 |
| Total Tokens | NUMBER | 总Token消耗数量 |
| Token Usage Trend | LINE_TIME_SERIES | Token消耗时间趋势 |
| Token Usage by Model | VERTICAL_BAR | 按模型统计的Token消耗（Top 20） |
| Top 20 Users by Token Usage | HORIZONTAL_BAR | 按用户统计的Top 20 Token消耗 |
| P99 Input Tokens | LINE_TIME_SERIES | 输入Token的P99值趋势 |
| P95 Input Tokens | LINE_TIME_SERIES | 输入Token的P95值趋势 |
| P50 Input Tokens | LINE_TIME_SERIES | 输入Token的P50值趋势 |
| P99 Output Tokens | LINE_TIME_SERIES | 输出Token的P99值趋势 |
| P95 Output Tokens | LINE_TIME_SERIES | 输出Token的P95值趋势 |
| P50 Output Tokens | LINE_TIME_SERIES | 输出Token的P50值趋势 |
| P99 Total Tokens | LINE_TIME_SERIES | 总Token的P99值趋势 |
| P95 Total Tokens | LINE_TIME_SERIES | 总Token的P95值趋势 |
| P50 Total Tokens | LINE_TIME_SERIES | 总Token的P50值趋势 |

### Dashboard Widgets - 模型调用指标

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Model Call Count | NUMBER | 模型调用总数（GENERATION类型） |
| Model Calls by Model | HORIZONTAL_BAR | 按模型统计调用次数 |
| Model Call Trend | LINE_TIME_SERIES | 模型调用次数趋势 |

### Dashboard Widgets - 性能指标

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Avg Time To First Token by Prompt Name | VERTICAL_BAR | 按Prompt名称分组的平均首Token时间 |
| P95 Time To First Token by Model | LINE_TIME_SERIES | 按模型分组的P95首Token时间 |
| P95 Latency by Model | LINE_TIME_SERIES | 按模型分组的P95延迟 |
| Avg Output Tokens Per Second by Model | LINE_TIME_SERIES | 按模型分组的平均输出Token/秒 |
| P95 Latency by Use Case | LINE_TIME_SERIES | 按使用场景（Trace名称）分组的P95延迟 |
| P95 Latency by Level (Observations) | LINE_TIME_SERIES | 按级别分组的Observation P95延迟 |
| Max Latency by User Id (Traces) | HORIZONTAL_BAR | 按用户分组的最大延迟（Top 50） |
| P95 Latency | NUMBER | P95延迟（毫秒），整体延迟指标 |
| P95 Latency by Type | HORIZONTAL_BAR | 按type分组的P95延迟 |
| P95 Latency Trend by Type | LINE_TIME_SERIES | P95延迟趋势（按type分组） |
| Tool Latency by Name | HORIZONTAL_BAR | 按工具名称分组的延迟（平均值） |

### Dashboard Widgets - 成本指标

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Total costs | LINE_TIME_SERIES | 总成本（所有使用场景） |
| Top 20 Users by Cost | HORIZONTAL_BAR | Top 20用户的成本 |
| Top 20 Use Cases (Observation) by Cost | VERTICAL_BAR | Top 20使用场景（观测）的成本 |
| Top 20 Use Cases (Trace) by Cost | VERTICAL_BAR | Top 20使用场景（追踪）的成本 |
| Cost by Environment | PIE | 按环境分组的成本 |
| Cost by Model Name | VERTICAL_BAR | 按模型名称分组的成本 |
| P95 Cost per Trace | LINE_TIME_SERIES | 每个Trace的P95成本 |
| P95 Output Cost per Observation | LINE_TIME_SERIES | 每个观测的P95输出成本 |
| P95 Input Cost per Observation | LINE_TIME_SERIES | 每个观测的P95输入成本 |

---

## Sessions Tab - 会话分析

### 主要组件

| 组件名称 | 指标含义 | 字段 | 详细说明 |
|---------|---------|------|---------|
| **Sessions Overview** | 会话概览 | Total Sessions | 总会话数（唯一sessionId数量，排除空值） |
| | | Avg Traces per Session | 平均每会话Trace数 |
| | | Total Tokens | 总Token数 |
| | | Sessions with Errors | 有错误的会话数（包含ERROR级别观测的会话） |
| **Session Count Trend** | 会话数量趋势 | - | 折线图显示独立会话随时间的变化趋势 |

### Dashboard Widgets

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Sessions Distribution | HORIZONTAL_BAR | 按Session分组统计Trace数（Top 50） |
| Tokens per Session | HORIZONTAL_BAR | 每Session的Token消耗分布（Top 20） |

---

## Traces Tab - 追踪分析

### 主要组件

| 组件名称 | 指标含义 | 子标签页/字段 | 详细说明 |
|---------|---------|-------------|---------|
| **Traces & Observations Time Series** | Trace和观测时间序列 | Traces | Trace数量时间趋势，显示总Trace数 |
| | | Observations by Level | 按级别（DEBUG/INFO/WARN/ERROR）分组的Observation时间趋势，显示总Observation数 |
| **Traces (Bar List)** | Traces条形列表 | - | 条形图展示各Trace名称的数量，显示总Trace数，可展开查看更多（默认5个，展开20个） |
| **Latency Tables** | 延迟表 | Trace latency percentiles | 按Trace名称分组的P50/P90/P95/P99延迟，按P95降序，表格展示 |
| | | Generation latency percentiles | 按Generation名称分组的P50/P90/P95/P99延迟，按P95降序，表格展示 |
| | | Span latency percentiles | 按Span名称分组的P50/P90/P95/P99延迟，按P95降序，表格展示 |

### Dashboard Widgets - Trace数量指标

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Trace Count | NUMBER | Trace总数 |
| Total Trace Count (over time) | BAR_TIME_SERIES | Trace数量随时间趋势 |
| Total Trace Count (by env) | BAR_TIME_SERIES | 按环境分组的Trace数量时间趋势 |
| Trace Count Trend | LINE_TIME_SERIES | Trace数量趋势 |
| Traces by User | HORIZONTAL_BAR | 按用户统计Trace数（Top 20） |

### Dashboard Widgets - Observation数量指标

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Observation Count | NUMBER | Observation总数 |
| Total Observation Count (over time) | BAR_TIME_SERIES | Observation数量随时间趋势 |
| Total Observation Count (by env) | BAR_TIME_SERIES | 按环境分组的Observation数量时间趋势 |
| Observation Count Trend | LINE_TIME_SERIES | Observation总数趋势 |

### Dashboard Widgets - 错误指标

| 指标名称 | 图表类型 | 说明 |
|---------|---------|------|
| Error Count | NUMBER | 错误总数（ERROR级别） |
| Error Count Trend | LINE_TIME_SERIES | 错误数量趋势 |
| Tool Error Count | NUMBER | 工具错误总数（TOOL类型且ERROR级别） |
| Tool Errors by Name | HORIZONTAL_BAR | 按工具名称统计错误数量（Top 20） |
| Errors by Name | HORIZONTAL_BAR | 按名称分组统计错误数量（Top 20） |

---

## 术语说明

| 术语 | 说明 |
|------|------|
| **Trace** | 一次完整的LLM应用调用链路 |
| **Observation** | Trace中的单个操作/事件，类型包括：GENERATION（模型调用）、TOOL（工具调用）、SPAN（自定义追踪）等 |
| **Session** | 会话，通过sessionId关联的多条Trace |
| **Tokens** | LLM使用的Token数量，包括输入和输出 |
| **Latency** | 延迟时间，通常以毫秒或秒为单位 |
| **Cost** | 成本，基于Token使用量和模型定价计算得出的USD费用 |
| **Percentiles (P50/P90/P95/P99)** | 第50/90/95/99百分位数的值，用于衡量性能分布情况，例如P95表示95%的请求延迟都低于该值 |
| **Level** | Observation的日志级别，包括：DEBUG、INFO、WARN、ERROR |
| **Environment** | 运行环境，如：production、staging、development等 |
| **Use Case** | 使用场景，通常通过Trace名称或Observation名称来标识 |

---

## 图表类型说明

| 图表类型 | 说明 |
|---------|------|
| **NUMBER** | 数字卡片，显示单个数值 |
| **LINE_TIME_SERIES** | 折线图，展示时间序列趋势 |
| **BAR_TIME_SERIES** | 柱状图，展示时间序列数据 |
| **VERTICAL_BAR** | 垂直柱状图，用于分类数据对比 |
| **HORIZONTAL_BAR** | 水平条形图，用于分类数据对比，适合长标签 |
| **PIE** | 饼图，展示占比分布 |

---

*最后更新时间：2026-01-14*

# 🎉 Token 消耗 Dashboard 配置完成总结

## ✅ 已完成的工作

### 1. Dashboard 配置已创建并验证通过 ✨

**新增内容:**
- ✅ 5 个 Token 相关 Widgets
- ✅ 1 个完整的 "Token 消耗统计" Dashboard
- ✅ 所有配置已验证正确

**配置文件位置:**
```
/workspaces/langfuse/worker/src/constants/langfuse-dashboards.json
```

**验证脚本:**
```bash
cd /workspaces/langfuse/worker
node verify-token-dashboard.js
```

### 2. 创建的 Widgets

| Widget 名称 | 类型 | 用途 |
|------------|------|------|
| Total Input Tokens | NUMBER | 总输入 Token 数量 |
| Total Output Tokens | NUMBER | 总输出 Token 数量 |
| Token Usage Trend | BAR_TIME_SERIES | Token 消耗时间趋势 |
| Token Usage by Model | VERTICAL_BAR | 按模型统计 Top 20 |
| Top 20 Users by Token Usage | HORIZONTAL_BAR | 按用户统计 Top 20 |

### 3. Dashboard 布局

```
+------------------+------------------+-------------------------+
| Input Tokens     | Output Tokens    |  Token Usage Trend      |
| (数字卡片 3x3)    | (数字卡片 3x3)    |  (时间序列 6x5)         |
+------------------+------------------+                         |
| Token Usage by Model (按模型 6x5)   |                         |
+-------------------------------------+-------------------------+
| Top 20 Users by Token Usage (按用户 12x5)                     |
+----------------------------------------------------------------+
```

### 4. 文档和脚本

创建了以下文件:
- ✅ `TOKEN_DASHBOARD_SETUP.md` - 完整的部署指南
- ✅ `worker/verify-token-dashboard.js` - 配置验证脚本

---

## 🚀 在本地机器上运行(推荐)

由于当前 Codespaces 环境不支持 Docker daemon,建议在你的**本地机器**上运行:

### 步骤概览:

1. **克隆代码到本地机器**
   ```bash
   git clone <your-repo-url>
   cd langfuse
   ```

2. **确保 Docker 已安装并运行**
   ```bash
   docker --version
   docker-compose --version
   ```

3. **安装依赖**
   ```bash
   pnpm install
   ```

4. **启动基础设施服务**
   ```bash
   pnpm run infra:dev:up
   ```

5. **初始化数据库**
   ```bash
   cd packages/shared
   pnpm run db:generate
   pnpm run db:migrate
   pnpm run db:seed
   pnpm run ch:reset
   ```

6. **启动 Worker**(在新终端)
   ```bash
   cd worker
   pnpm run dev
   ```

   **查看日志,应该看到:**
   ```
   Upserted widget Total Input Tokens (e6ca78cc...)
   Upserted widget Total Output Tokens (1b17b72d...)
   ...
   Upserted dashboard Token 消耗统计 (31e07c7b...)
   Finished upserting Langfuse dashboards and widgets
   ```

7. **启动 Web 应用**(在新终端)
   ```bash
   pnpm run dev:web
   ```

8. **访问 Dashboard**
   - 打开浏览器: http://localhost:3000
   - 登录: `demo@langfuse.com` / `password`
   - 进入 Dashboards: http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/dashboards
   - 查找 **"Token 消耗统计 (Langfuse Maintained)"**

---

## 📋 配置文件说明

### Widget 配置示例:

```json
{
  "id": "e6ca78cc-a3ec-47b5-9309-4bc2fc06b443",
  "name": "Total Input Tokens",
  "description": "总输入 Token 数量",
  "view": "OBSERVATIONS",
  "dimensions": [],
  "metrics": [{"agg": "sum", "measure": "inputTokens"}],
  "chartType": "NUMBER",
  "owner": "LANGFUSE"
}
```

### Dashboard 配置示例:

```json
{
  "id": "31e07c7b-94d5-4664-94c6-24524cfc06bc",
  "name": "Token 消耗统计",
  "description": "追踪和分析 Token 使用情况,按时间趋势、模型和用户维度展示",
  "owner": "LANGFUSE",
  "definition": {
    "widgets": [
      {
        "id": "unique-placement-id",
        "widgetId": "widget-reference-id",
        "type": "widget",
        "x": 0,
        "y": 0,
        "x_size": 3,
        "y_size": 3
      }
    ]
  }
}
```

---

## 🛠️ 如何修改 Dashboard

### 1. 编辑配置文件

```bash
cd /workspaces/langfuse/worker
# 编辑 src/constants/langfuse-dashboards.json
```

### 2. 修改内容后,更新时间戳

将相应 widget 或 dashboard 的 `updatedAt` 改为当前时间:
```json
{
  "updatedAt": "2025-01-06T16:00:00.000Z"
}
```

### 3. 验证修改

```bash
node verify-token-dashboard.js
```

### 4. 重启 Worker 同步到数据库

```bash
# 停止当前 worker (Ctrl+C)
pnpm run dev
```

### 5. 刷新浏览器查看更新

---

## 📊 可用的配置选项

### View 类型:
- `TRACES` - 追踪视图
- `OBSERVATIONS` - 观察视图(LLM 调用)
- `SCORES_NUMERIC` - 数值评分
- `SCORES_CATEGORICAL` - 分类评分

### Chart 类型:
- `NUMBER` - 数字卡片
- `LINE_TIME_SERIES` - 时间序列折线图
- `BAR_TIME_SERIES` - 时间序列柱状图
- `VERTICAL_BAR` - 垂直柱状图
- `HORIZONTAL_BAR` - 水平柱状图
- `PIE` - 饼图

### Metrics 聚合:
- `count` - 计数
- `sum` - 求和
- `avg` - 平均值
- `p95` - 95分位数
- `max` - 最大值
- `min` - 最小值

### Metrics 度量 (measure):
- `count` - 数量
- `totalTokens` - 总 Token 数
- `inputTokens` - 输入 Token 数
- `outputTokens` - 输出 Token 数
- `totalCost` - 总成本
- `latency` - 延迟
- `timeToFirstToken` - 首 Token 时间

### Dimensions 字段:
- `name` - 名称(trace/observation name)
- `userId` - 用户 ID
- `environment` - 环境
- `providedModelName` - 模型名称
- `promptName` - 提示词名称
- `level` - 级别(observations)

---

## 🎯 下一步建议

### 选项 1: 在本地机器上运行(推荐)
1. 将代码推送到 Git 仓库
2. 在本地机器克隆并运行
3. 按照上面的步骤启动服务
4. 查看和调试 Dashboard

### 选项 2: 在当前环境中查看配置
配置文件已经准备就绪,可以:
1. 查看 JSON 配置:`cat worker/src/constants/langfuse-dashboards.json`
2. 运行验证脚本:`node worker/verify-token-dashboard.js`
3. 提交代码,在有 Docker 的环境中运行

### 选项 3: 使用现有 Langfuse 部署
如果你有访问现有 Langfuse 部署的权限:
1. 将配置文件复制到该部署环境
2. 重启 Worker 同步配置
3. 立即在现有环境中看到新 Dashboard

---

## 📚 参考文档

- **设置指南**: `/workspaces/langfuse/TOKEN_DASHBOARD_SETUP.md`
- **验证脚本**: `/workspaces/langfuse/worker/verify-token-dashboard.js`
- **配置文件**: `/workspaces/langfuse/worker/src/constants/langfuse-dashboards.json`
- **同步脚本**: `/workspaces/langfuse/worker/src/scripts/upsertLangfuseDashboards.ts`
- **Langfuse 文档**: https://langfuse.com/docs/metrics/features/custom-dashboards

---

## ✨ 总结

✅ **所有配置已完成并验证通过!**

配置文件已经准备就绪,包含了你要求的所有功能:
- ✅ Token 消耗追踪
- ✅ 按时间趋势分析
- ✅ 按模型分组统计
- ✅ 按用户分组统计
- ✅ 清晰的中文命名
- ✅ 响应式布局

一旦在有 Docker 的环境中运行,Worker 会自动将这些配置同步到数据库,你就可以在前端看到全新的 "Token 消耗统计" Dashboard 了!

---

**需要帮助?**
- 查看详细设置指南: `cat TOKEN_DASHBOARD_SETUP.md`
- 运行验证脚本: `cd worker && node verify-token-dashboard.js`
- 检查配置文件: `cat worker/src/constants/langfuse-dashboards.json | jq .`

Good luck! 🚀

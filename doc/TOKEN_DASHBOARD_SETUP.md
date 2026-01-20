# Token 消耗 Dashboard 本地调试指南

## ✅ 已完成的配置

新增了一个 **"Token 消耗统计"** Dashboard,包含 5 个 Widgets:

1. **Total Input Tokens** (数字卡片) - 总输入 Token 数量
2. **Total Output Tokens** (数字卡片) - 总输出 Token 数量
3. **Token Usage Trend** (柱状时间序列图) - Token 消耗时间趋势
4. **Token Usage by Model** (垂直柱状图) - 按模型统计 Token 消耗
5. **Top 20 Users by Token Usage** (水平柱状图) - 按用户统计 Token 消耗

配置文件位置: `/worker/src/constants/langfuse-dashboards.json`

---

## 🚀 本地运行步骤

### 前提条件

- Node.js 24 (当前使用 20.19.6,建议升级)
- Docker 和 Docker Compose
- pnpm 9.5.0

### 步骤 1: 启动基础设施服务

在项目根目录执行:

```bash
# 启动 PostgreSQL, Redis, ClickHouse, MinIO
pnpm run infra:dev:up

# 验证服务状态
docker ps
```

你应该看到以下容器运行:
- `langfuse-postgres` (端口 5432)
- `langfuse-redis` (端口 6379)
- `langfuse-clickhouse` (端口 8123, 9000)
- `langfuse-minio` (端口 9090, 9091)

### 步骤 2: 数据库初始化

```bash
cd packages/shared

# 生成 Prisma 客户端
pnpm run db:generate

# 运行数据库迁移
pnpm run db:migrate

# 填充测试数据
pnpm run db:seed

# ClickHouse 初始化
pnpm run ch:reset
pnpm run ch:seed
```

### 步骤 3: 启动 Worker (同步 Dashboard 配置)

在新的终端窗口:

```bash
cd worker
pnpm run dev
```

**查看同步日志** - 你应该看到:
```
Upserted widget Total Input Tokens (e6ca78cc-a3ec-47b5-9309-4bc2fc06b443)
Upserted widget Total Output Tokens (1b17b72d-f9aa-4562-8905-7527f245c415)
Upserted widget Token Usage Trend (01f91b0f-3eda-4240-a9d7-5bfb30f4d38a)
Upserted widget Token Usage by Model (0b1f61ee-3ea3-4434-bd81-71b47513a1f4)
Upserted widget Top 20 Users by Token Usage (259f771f-958f-4319-8516-71051374df23)
Upserted dashboard Token 消耗统计 (31e07c7b-94d5-4664-94c6-24524cfc06bc)
Finished upserting Langfuse dashboards and widgets in XXXms
```

### 步骤 4: 启动 Web 应用

在另一个新的终端窗口:

```bash
pnpm run dev:web
```

等待编译完成,看到:
```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

### 步骤 5: 访问 Dashboard

1. 打开浏览器访问: http://localhost:3000

2. 使用演示账户登录:
   - Email: `demo@langfuse.com`
   - Password: `password`

3. 进入 Dashboard 页面:
   - 方式 1: 直接访问 http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a/dashboards
   - 方式 2: 点击左侧菜单 → Dashboards

4. 查找 **"Token 消耗统计 (Langfuse Maintained)"**,点击进入

---

## 🔍 验证配置

如果无法启动完整环境,可以验证配置文件:

```bash
cd /workspaces/langfuse/worker

# 验证 JSON 格式
node -e "
const data = require('./src/constants/langfuse-dashboards.json');
console.log('✅ JSON 格式正确');
console.log('Widgets 总数:', data.widgets.length);
console.log('Dashboards 总数:', data.dashboards.length);

const newDashboard = data.dashboards.find(d => d.name === 'Token 消耗统计');
if (newDashboard) {
  console.log('✅ 找到 Token 消耗统计 Dashboard');
  console.log('   包含', newDashboard.definition.widgets.length, '个 widgets');
} else {
  console.log('❌ 未找到 Token 消耗统计 Dashboard');
}
"
```

---

## 📊 Dashboard 布局

```
+------------------+------------------+------------------------+
| Input Tokens     | Output Tokens    |  Token Usage Trend     |
| (数字卡片 3x3)    | (数字卡片 3x3)    |  (时间序列 6x5)        |
+------------------+------------------+                        |
| Token Usage by Model (按模型 6x5)   |                        |
+-------------------------------------+------------------------+
| Top 20 Users by Token Usage (按用户 12x5)                    |
+---------------------------------------------------------------+
```

---

## 🛠️ 故障排查

### 问题 1: Worker 启动失败 - Redis 连接错误

**错误信息:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**解决方法:**
```bash
# 检查 Redis 是否运行
docker ps | grep redis

# 如果没有运行,启动服务
pnpm run infra:dev:up

# 检查 Redis 连接
docker exec -it langfuse-redis redis-cli -a myredissecret ping
# 应该返回: PONG
```

### 问题 2: Worker 启动失败 - PostgreSQL 连接错误

**错误信息:**
```
Can't reach database server at localhost:5432
```

**解决方法:**
```bash
# 检查 PostgreSQL 是否运行
docker ps | grep postgres

# 检查连接
docker exec -it langfuse-postgres psql -U postgres -c "SELECT version();"
```

### 问题 3: Dashboard 没有显示

**可能原因:**
1. Worker 没有成功同步配置
2. Web 应用缓存问题

**解决方法:**
```bash
# 1. 检查数据库中的 dashboard
docker exec -it langfuse-postgres psql -U postgres -d postgres -c "
  SELECT id, name, \"projectId\", owner
  FROM \"Dashboard\"
  WHERE name LIKE '%Token%';
"

# 2. 强制重新同步(修改 worker/src/initialize.ts)
# 临时将 upsertLangfuseDashboards(); 改为 upsertLangfuseDashboards(true);
# 然后重启 worker

# 3. 清除浏览器缓存并刷新页面
```

### 问题 4: Node 版本警告

**警告信息:**
```
WARN Unsupported engine: wanted: {"node":"24"} (current: {"node":"v20.19.6"})
```

**说明:** 项目需要 Node 24,但可以使用 Node 20 运行(会有警告)

**升级 Node (可选):**
```bash
# 使用 nvm
nvm install 24
nvm use 24

# 重新安装依赖
pnpm install
```

---

## 📝 修改 Dashboard

如需修改 Dashboard 布局或添加新 Widgets:

1. 编辑 `/worker/src/constants/langfuse-dashboards.json`

2. 更新 `updatedAt` 时间戳:
```json
{
  "updatedAt": "2025-01-06T15:00:00.000Z"  // 改为当前时间
}
```

3. 重启 Worker:
```bash
# 停止当前 worker (Ctrl+C)
cd worker
pnpm run dev
```

4. 刷新浏览器查看更新

---

## 🎯 快速测试(无需完整环境)

如果只想验证配置格式,可以运行:

```bash
cd /workspaces/langfuse/worker
node -e "
const { FileSchema } = require('zod/v4');
try {
  const data = require('./src/constants/langfuse-dashboards.json');
  console.log('✅ 配置验证成功!');
  console.log('📊 Dashboards:', data.dashboards.length);
  console.log('🎯 Widgets:', data.widgets.length);
} catch (e) {
  console.error('❌ 配置验证失败:', e.message);
}
"
```

---

## 📚 相关文档

- Langfuse 官方文档: https://langfuse.com/docs
- Dashboard 文档: https://langfuse.com/docs/metrics/features/custom-dashboards
- Widget 配置参考: `/worker/src/scripts/upsertLangfuseDashboards.ts`
- Dashboard Service: `/packages/shared/src/server/services/DashboardService/`

---

## ✨ 下一步

配置已经准备就绪!一旦基础设施服务运行:

1. Worker 会自动同步 Dashboard 配置到数据库
2. Web 应用会立即显示新的 "Token 消耗统计" Dashboard
3. 可以点击 "Clone" 按钮创建自定义版本进行修改

Good luck! 🚀

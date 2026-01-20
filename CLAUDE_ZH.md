# CLAUDE.md (中文版)

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概述

Langfuse 是一个开源的 LLM 工程平台,帮助团队协作开发、监控、评估和调试 AI 应用。
主要功能领域包括追踪(tracing)、评估(evals)和提示词管理(prompt management)。Langfuse 由 Web 应用(本仓库)、文档、Python SDK 和 JavaScript/TypeScript SDK 组成。
本仓库包含 Web 应用、Worker 和支持包,但不包括 JS 和 Python 客户端 SDK。

## 仓库结构
高层结构。还有更多文件夹(如 hooks 等)。
```
langfuse/
├── web/                     # Next.js 14 前端/后端应用
│   ├── src/
│   │   ├── components/     # 可复用 UI 组件 (shadcn/ui)
│   │   ├── features/       # 按领域组织的特性代码
│   │   ├── pages/          # Next.js 页面 (Pages Router)
│   │   └── server/         # tRPC API 路由和服务器逻辑
│   └── public/             # 静态资源
├── worker/                  # Express.js 后台任务处理器
│   └── src/
│       ├── queues/         # BullMQ 任务队列
│       └── services/       # 后台处理服务
├── packages/
│   ├── shared/             # 共享类型、schemas 和工具
│   │   ├── prisma/         # 数据库 schema 和迁移
│   │   └── src/            # 共享 TypeScript 代码
│   ├── config-eslint/      # ESLint 配置
│   └── config-typescript/  # TypeScript 配置
├── ee/                     # 企业版功能
├── fern/                   # API 文档和 OpenAPI 规范
├── generated/              # 自动生成的客户端代码
└── scripts/                # 开发和部署脚本
```

## 仓库架构
这是一个 **pnpm + Turbo monorepo**,包含以下关键包:

### 核心应用
- **`/web/`** - Next.js 14 应用 (Pages Router),提供前端 UI 和后端 API
- **`/worker/`** - Express.js 后台任务处理服务器
- **`/packages/shared/`** - 共享数据库 schema、类型和工具

### 支持包
- **`/ee/`** - 企业版功能(独立许可证)
- **`/packages/config-eslint/`** - 共享 ESLint 配置
- **`/packages/config-typescript/`** - 共享 TypeScript 配置

## 开发命令

### 开发
```sh
pnpm i               # 安装依赖
pnpm run dev         # 启动所有服务 (web + worker)
pnpm run dev:web     # 仅 Web 应用 (localhost:3000) - **最常用!**
pnpm run dev:worker  # 仅 Worker
pnpm run dx          # 完整初始设置:安装依赖、重置数据库、重置 node_modules、填充数据、启动开发。谨慎使用,会清空数据库和 node_modules
```

### 数据库管理
数据库命令需要在 `packages/shared/` 文件夹中运行。
```sh
pnpm run db:generate       # 构建 Prisma 模型
pnpm run db:migrate        # 运行 Prisma 迁移
pnpm run db:reset          # 重置并重新填充数据库
pnpm run db:seed           # 填充示例数据
pnpm run ch:reset          # 重置 ClickHouse
pnpm run ch:seed           # 填充 ClickHouse 数据
```

### 基础设施
```sh
pnpm run infra:dev:up      # 启动 Docker 服务 (PostgreSQL, ClickHouse, Redis, MinIO)
pnpm run infra:dev:down    # 停止 Docker 服务
pnpm run infra:dev:prune   # 删除卷(清空数据)
```

### 构建
```sh
pnpm --filter=PACKAGE_NAME run build  # 运行构建命令,会显示真实的 TypeScript 错误等
```

### Web 包测试
Web 包使用 JEST 进行单元测试。
根据文件位置(同步、异步),`web` 相关测试必须放在 `web/src/__tests__/` 文件夹中。

**四个测试项目:**
1. **client** - 客户端测试 (`.clienttest.ts`)
2. **sync-server** - 同步服务器测试 (`.servertest.ts`,不在 async 文件夹中)
3. **async-server** - 异步服务器测试 (`__tests__/async/` 中的 `.servertest.ts`)
4. **e2e-server** - 端到端测试 (`__e2e__/` 中的 `.servertest.ts`)

```sh
pnpm test                  # 异步服务器测试
pnpm test-sync             # 同步服务器测试
pnpm test-client           # 客户端测试
pnpm test:e2e              # Playwright E2E 测试
pnpm test:e2e:server       # E2E 服务器测试

# 使用过滤器
pnpm test-sync --testPathPatterns="$FILE_LOCATION_PATTERN" --testNamePattern="$TEST_NAME_PATTERN"
# 对于 async 文件夹中的测试:
pnpm test -- --testPathPatterns="$FILE_LOCATION_PATTERN" --testNamePattern="$TEST_NAME_PATTERN"
# 对于客户端测试:
pnpm test-client --testPathPatterns="buildStepData" --testNamePattern="buildStepData"
```

### Worker 包测试
Worker 使用 `vitest` 进行单元测试。
```sh
pnpm run test --filter=worker -- $TEST_FILE_NAME -t "$TEST_NAME"
pnpm run test:exclude-llm-connections  # 跳过 LLM 连接测试
```

### 工具
```bash
pnpm run format            # 格式化整个项目的代码
pnpm run lint              # 检查所有包
pnpm run nuke              # 删除所有 node_modules、构建文件、清空数据库、Docker 容器。**谨慎使用**
```

## 技术栈

### Web 应用 (`/web/`)
- **框架**: Next.js 14 (Pages Router)
- **API**: tRPC(类型安全的客户端-服务器通信)+ REST API(公开访问)
- **认证**: NextAuth.js/Auth.js(支持 15+ SSO 提供商)
- **数据库**: Prisma ORM with PostgreSQL
- **分析数据库**: ClickHouse(高容量追踪数据)
- **验证**: Zod schemas,使用 zod v4(始终从 `zod/v4` 导入)
- **样式**: Tailwind CSS with CSS 变量用于主题
- **组件**: shadcn/ui (Radix UI 原语)
- **状态管理**: TanStack Query (React Query) + tRPC
- **图表**: Tremor, Recharts
- **测试**: Jest(多个测试项目:sync, async, client, e2e)

### Worker 应用 (`/worker/`)
- **框架**: Express.js
- **队列系统**: BullMQ with Redis
- **用途**: 异步处理(数据摄取、评估、导出、集成)
- **测试**: Vitest

### 基础设施
- **主数据库**: PostgreSQL 17(通过 Prisma ORM)
- **分析数据库**: ClickHouse 25.8(OLAP,用于高容量事件数据)
- **缓存/队列**: Redis 7.2.4
- **Blob 存储**: MinIO/S3

## 开发指南

### 前端功能
- 所有新功能放在 `/web/src/features/[feature-name]/`
- 使用 tRPC 进行全栈功能开发(入口点:`web/src/server/api/root.ts`)
- 遵循现有功能结构以保持一致性
- 使用来自 `@/src/components/ui` 的 shadcn/ui 组件
- 自定义可复用组件放在 `@/src/components`

**标准功能结构:**
```
features/[feature-name]/
├── components/          # React 组件
├── server/              # 服务器端逻辑
│   ├── routers/        # tRPC 路由器
│   └── actions/        # 服务器操作
├── types/              # TypeScript 类型
├── README.md           # 功能文档
└── [feature]Router.ts  # 主路由器
```

### 公共 API 开发
- 所有公共 API 路由在 `/web/src/pages/api/public`
- 使用 `withMiddlewares.ts` 包装器
- 在 `/web/src/features/public-api/types` 中定义类型,使用严格的 Zod v4 对象(`.strict()`)
- 使用 `makeZodVerifiedAPICall` 添加端到端测试(参见 `datasets-api.servertest.ts`)
- 手动更新 `/fern/` 中的 Fern API 规范,然后通过 Fern CLI 重新生成 OpenAPI 规范

**中间件模式:**
```typescript
export default withMiddlewares({
  GET: async (req, res) => {
    // 处理器实现
  },
  POST: async (req, res) => {
    // 处理器实现
  }
});
```

### tRPC 架构

**入口点:** `/web/src/server/api/root.ts`

**路由器注册(55+ 路由器):**
```typescript
export const appRouter = createTRPCRouter({
  traces: traceRouter,
  sessions: sessionRouter,
  projects: projectsRouter,
  datasets: datasetRouter,
  evals: evalRouter,
  // ... 50+ 更多路由器
});
```

**创建新的 tRPC 过程:**
1. 在 `/web/src/features/[feature]/server/` 中创建路由器
2. 添加到 `root.ts`
3. 使用标准过程:`publicProcedure`、`protectedProcedure`、`orgAdminProcedure`

### 授权和 RBAC
- 检查 `/web/src/features/rbac/README.md` 了解授权模式
- 实现适当的权限检查(参见 `/web/src/features/entitlements/README.md`)

**权限系统:**
- **Plan**: 功能层级(oss, cloud:pro, self-hosted:enterprise)
- **Entitlement**: 可用功能(例如 playground)
- **EntitlementLimit**: 资源使用限制(例如 annotation-queue-count)

**使用:**
- 客户端:React hooks(`usePlan` 等)
- 服务器端:`hasEntitlement.ts`、`hasEntitlementLimit.ts`

### 数据库
- **双数据库系统**: PostgreSQL(主数据库,OLTP)+ ClickHouse(分析,OLAP)
- 使用 `golang-migrate` CLI 进行数据库迁移
- 所有 PostgreSQL 数据库操作通过 Prisma ORM
- 外键关系可能不在 schema 中强制执行,以允许无序摄取

**迁移模式:**
```bash
# Prisma (PostgreSQL)
cd packages/shared
pnpm run db:migrate -- --name add_new_feature

# ClickHouse
# 迁移在 packages/shared/clickhouse/migrations/
# 集群/非集群部署的独立路径
```

**为什么使用双数据库?**
- **PostgreSQL**: ACID 事务、关系完整性
- **ClickHouse**: 列式存储用于分析,处理数十亿事件

### 测试
- Jest 用于 API 测试,Playwright 用于 E2E 测试
- 对于后端/API 更改,推送前测试必须通过
- 为新的 API 端点和功能添加测试
- 编写测试时,专注于解耦每个 `it` 或 `test` 块,确保它们可以独立并发运行。测试绝不能依赖于之前或之后测试的操作或结果。
- 编写测试时,尤其是在 `__tests__/async` 目录中,确保避免 `pruneDatabase` 调用。
- 使用 `makeZodVerifiedAPICall` 进行 API 测试以验证响应 schema

### 代码约定
- **Pages Router**(不是 App Router)
- 在 main 分支上遵循 Conventional Commits
- 使用 CSS 变量进行主题化(支持自动深色/浅色模式)
- 全程使用 TypeScript
- Zod v4 用于所有输入验证
- 如果可能,不要使用 `any` 类型
- 为便于代码审查,除非必要或被指示,否则不要在文件中移动函数等

## Worker 和队列架构

### Worker 应用
**入口:** `/worker/src/app.ts`

**队列处理器(20+):**
- `ingestionQueue` - 数据摄取
- `otelIngestionQueue` - OpenTelemetry 摄取
- `evalQueue` - 评估处理(创建器、执行器、数据集创建器)
- `batchExportQueue` - 数据导出
- `traceDelete`、`projectDelete`、`scoreDelete` - 删除操作
- `webhooks` - Webhook 传递
- `postHogIntegration`、`mixpanelIntegration` - 分析集成
- 以及更多...

**队列管理:**
```typescript
WorkerManager.register(
  QueueName.CreateEvalQueue,
  evalJobCreatorQueueProcessor,
  {
    concurrency: env.LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY,
    limiter: { max: N, duration: MS }
  }
);
```

## 共享包架构

**位置:** `/packages/shared/`

**关键导出:**
- 数据库模型(Prisma)
- ClickHouse 客户端和 schema
- Redis 队列定义
- 错误类型
- 服务器工具(auth、observability)
- 共享验证 schemas

**结构:**
```
packages/shared/
├── prisma/              # 数据库 schema 和迁移
├── clickhouse/          # ClickHouse 迁移和脚本
├── src/
│   ├── db.ts           # Prisma 客户端
│   ├── server/         # 服务器工具
│   │   ├── redis/      # 队列定义
│   │   ├── clickhouse/ # ClickHouse 客户端
│   │   └── auth/       # 认证工具
│   └── errors/         # 错误类
└── scripts/            # 填充脚本
```

## 环境设置

- **Node.js**: 版本 24(在 `.nvmrc` 中指定)
- **包管理器**: pnpm v9.5.0
- **数据库依赖**: Docker 用于本地 PostgreSQL、ClickHouse、Redis、MinIO
- **环境**: 复制 `.env.dev.example` 到 `.env`
- **额外 CLI 工具**: golang-migrate CLI、ClickHouse 客户端

### Docker Compose 开发

**文件:** `docker-compose.dev.yml`

**服务:**
- **ClickHouse**: 端口 8123(HTTP)、9000(native)
- **PostgreSQL**: 端口 5432
- **Redis**: 端口 6379(密码:`myredissecret`)
- **MinIO**: 端口 9090(API)、9091(控制台)

## 开发登录

使用种子数据在本地运行时:
- 用户名: `demo@langfuse.com`
- 密码: `password`
- 演示项目 URL: `http://localhost:3000/project/7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`

## 可观察性和监控

**OpenTelemetry:**
- Web 和 Worker 中的完整仪器化
- 通过 `observability.config.ts` 配置
- Sentry 集成用于错误跟踪
- 通过 `@appsignal/opentelemetry-instrumentation-bullmq` 进行 BullMQ 仪器化

**日志记录:**
- 来自 `@langfuse/shared` 的 Winston 日志记录器
- 带有上下文的结构化日志
- DataDog 追踪支持(`dd-trace`)

## API 文档

**Fern 框架:**
- `/fern/` 中的 API 规范
- 生成 OpenAPI:`fern generate --api server`
- 生成客户端代码:`fern generate --api client`
- 为 Python SDK 自动生成 Pydantic 模型

## 企业版

**位置:** `/ee/`
- 独立许可证(参见 LICENSE 文件)
- 仅限云或自托管企业功能
- 示例:计费、UI 定制、SCIM

## 重要配置文件

### 环境配置
**文件:** `/web/src/env.mjs`
- 使用 `@t3-oss/env-nextjs` 进行验证
- **690+ 行**环境变量
- 部分:Auth(15+ SSO 提供商)、Database、Email、Telemetry、Features
- 服务器端和客户端验证

### Next.js 配置
**文件:** `/web/next.config.mjs`
- **Standalone 输出**用于 Docker
- 转译:`@langfuse/shared`、`vis-network/standalone`
- 带严格安全策略的 CSP 头
- 用于 monorepo 的 Turbopack 别名
- Sentry 集成

## Linear MCP
要获取项目,请使用 `get_project` 功能,并使用标题中的完整项目名称。
- 错误: message-placeholder-in-chat-messages-2beb6f02ec48
- 正确: Message placeholder in chat messages

## 前端提示

### Window Location 处理
- 每当你想使用或确实使用 `window.location...` 时,确保你还添加了对自定义 basePath 的适当处理

## 开发提示
- 在尝试构建包之前,先尝试运行一次 linter

## 快速入门检查清单

1. ✅ 安装 Node.js 24、pnpm 9.5.0、Docker
2. ✅ 安装 golang-migrate CLI 和 ClickHouse 客户端
3. ✅ 克隆仓库,运行 `pnpm install`
4. ✅ 复制 `.env.dev.example` 到 `.env`
5. ✅ 运行 `pnpm run dx`(仅第一次)
6. ✅ 访问 http://localhost:3000,以 demo@langfuse.com 登录
7. ✅ 在进行更改之前阅读特性相关的 README
8. ✅ 检查未解决的问题,尤其是"good first issue"标签
9. ✅ 加入 Discord 提问
10. ✅ 提交 PR 之前查看 CONTRIBUTING.md

# Session Cookie 冲突问题修复

## 问题描述

**现象**: 登录实例 A 后，实例 B 自动退出；反之亦然。

**根本原因**: NextAuth Session Cookie 冲突

## 原因分析

### 当前错误配置

```yaml
# 实例 A 和实例 B 都使用相同的 NEXTAUTH_URL
NEXTAUTH_URL=http://localhost:3000
```

### Cookie 冲突机制

当两个实例都使用相同的 `NEXTAUTH_URL` 时：

1. NextAuth 会在同一个域名（localhost）下设置 session cookie
2. 默认的 cookie 名称相同（`next-auth.session-token`）
3. 后登录的实例会覆盖前一个实例的 cookie
4. 导致前一个实例的会话失效

### 为什么会发生这种情况

```
浏览器访问 localhost:3000 (实例 A)
├─ 登录成功
├─ NextAuth 设置 cookie: next-auth.session-token (domain=localhost)
└─ Cookie 中包含实例 A 的 session ID

浏览器访问 localhost:3001 (实例 B)
├─ 登录成功
├─ NextAuth 设置 cookie: next-auth.session-token (domain=localhost) ← 覆盖了实例 A 的 cookie！
└─ Cookie 中包含实例 B 的 session ID

浏览器再次访问 localhost:3000 (实例 A)
├─ 发送 cookie: next-auth.session-token (包含实例 B 的 session ID)
└─ 实例 A 找不到这个 session → 自动退出 ✗
```

## 解决方案

根据您的部署方式选择对应的解决方案：

### 方案 1: 使用不同的域名/子域名（推荐，生产环境）

**配置示例**：

```yaml
# 实例 A
NEXTAUTH_URL=https://langfuse-a.example.com

# 实例 B
NEXTAUTH_URL=https://langfuse-b.example.com
```

**Ingress 配置**：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: langfuse-ingress
  namespace: langfuse
spec:
  rules:
  - host: langfuse-a.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: langfuse-web
            port:
              number: 3000
  - host: langfuse-b.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: langfuse-web-b
            port:
              number: 3000
```

**优点**：
- ✅ 完全独立的 cookie 域名
- ✅ 不会冲突
- ✅ 适合生产环境

### 方案 2: 使用不同的路径前缀（同域名）

**配置示例**：

```yaml
# 实例 A
NEXTAUTH_URL=http://example.com
NEXTAUTH_URL_PATH=/

# 实例 B
NEXTAUTH_URL=http://example.com/instance-b
NEXTAUTH_URL_PATH=/instance-b
```

**注意**: 此方案需要配置 basePath，Langfuse 可能需要额外配置支持。

### 方案 3: 使用不同的端口 + 正确的 NEXTAUTH_URL（开发环境）

**配置示例**：

```yaml
# 实例 A
NEXTAUTH_URL=http://localhost:3000

# 实例 B
NEXTAUTH_URL=http://localhost:3001
```

**访问方式**：

```bash
# 实例 A
kubectl port-forward svc/langfuse-web 3000:3000 -n langfuse

# 实例 B (不同的终端)
kubectl port-forward svc/langfuse-web-b 3001:3000 -n langfuse
```

**注意**: 虽然端口不同，但由于 cookie domain 仍然是 `localhost`，仍可能冲突。需要确保 NextAuth 正确处理端口号。

### 方案 4: 自定义 Cookie 名称（终极方案）

如果以上方案都不适用，可以通过自定义 cookie 名称来完全避免冲突。

**需要修改 Langfuse 代码**（不推荐）：

```typescript
// web/src/server/auth/index.ts
export const authOptions: NextAuthOptions = {
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token-instance-b`, // 自定义名称
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: true,
      },
    },
  },
  // ...
};
```

## 推荐的修复步骤

### 步骤 1: 确定您的访问方式

请确认您是如何访问两个实例的：

A. 通过 Ingress + 不同域名？
B. 通过 port-forward + localhost:3000 和 localhost:3001？
C. 通过 NodePort + 不同端口？
D. 其他方式？

### 步骤 2: 根据访问方式选择解决方案

**如果是方式 B（开发环境，port-forward）**：

修改实例 B 的配置：

```bash
# 更新 NEXTAUTH_URL
kubectl set env deployment/langfuse-web-b -n langfuse \
  NEXTAUTH_URL=http://localhost:3001
```

**如果是生产环境（Ingress）**：

1. 配置两个不同的域名或子域名
2. 更新 NEXTAUTH_URL 为实际的访问 URL

### 步骤 3: 重启实例 B

```bash
kubectl rollout restart deployment/langfuse-web-b -n langfuse
kubectl rollout restart deployment/langfuse-worker-b -n langfuse
```

### 步骤 4: 清除浏览器 Cookie

修复后，需要清除浏览器中 localhost 域名下的所有 cookie：

1. 打开浏览器开发者工具（F12）
2. 进入 Application / Storage -> Cookies
3. 删除 localhost 下的所有 cookie
4. 重新登录测试

## 验证修复

修复后的验证步骤：

1. 清除浏览器 cookie
2. 登录实例 A（localhost:3000）
3. 登录实例 B（localhost:3001）
4. 切换回实例 A
5. **预期结果**: 实例 A 仍然保持登录状态

## 文档方案 1 的完整合规性

要完全符合文档中的方案 1（Database 隔离），还需要：

### PostgreSQL 用户隔离（可选但推荐）

虽然当前共享 `langfuse` 用户也能工作，但推荐为每个实例创建专用用户：

```sql
-- 创建实例 B 的专用用户
CREATE USER langfuse_b WITH PASSWORD 'secure_password_b';

-- 授予权限
GRANT ALL PRIVILEGES ON DATABASE langfuse_b TO langfuse_b;

-- 连接到 langfuse_b 数据库
\c langfuse_b

-- 授予 schema 权限
GRANT ALL ON SCHEMA public TO langfuse_b;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO langfuse_b;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO langfuse_b;
```

然后更新实例 B 的配置：

```yaml
DATABASE_USERNAME: langfuse_b
DATABASE_PASSWORD: secure_password_b
```

### 为实例 A 也配置 S3 PREFIX（推荐）

```bash
# 为实例 A 添加 S3 PREFIX
kubectl set env deployment/langfuse-web -n langfuse \
  LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-a/events/ \
  LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-a/media/ \
  LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-a/exports/

kubectl set env deployment/langfuse-worker -n langfuse \
  LANGFUSE_S3_EVENT_UPLOAD_PREFIX=instance-a/events/ \
  LANGFUSE_S3_MEDIA_UPLOAD_PREFIX=instance-a/media/ \
  LANGFUSE_S3_BATCH_EXPORT_PREFIX=instance-a/exports/
```

## 总结

| 配置项 | 方案 1 要求 | 当前状态 | 需要修复 |
|--------|-------------|----------|----------|
| PostgreSQL Database | ✅ 独立数据库 | ✅ langfuse_b vs postgres_langfuse | - |
| PostgreSQL User | ⚠️ 推荐独立 | ❌ 共享 langfuse | 可选 |
| ClickHouse Database | ✅ 独立数据库 | ✅ langfuse_b vs default | - |
| S3 Prefix | ✅ 不同前缀 | ✅ instance-b/* vs 无 | 推荐为 A 也配置 |
| Redis | ✅ 独立实例 | ✅ redis-b vs redis | - |
| **NEXTAUTH_URL** | ✅ **正确配置** | ❌ **两个实例相同** | **必须修复** |

**关键问题**: NEXTAUTH_URL 配置错误导致 Session Cookie 冲突，必须修复！

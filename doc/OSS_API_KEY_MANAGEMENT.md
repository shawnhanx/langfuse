# Langfuse OSS 版本 - 项目级 API 密钥管理指南

本文档介绍在 Langfuse OSS 版本中如何查询、创建、修改和删除项目级 API 密钥 (pk/sk)。

> **注意**: Public REST API (`/api/public/projects/{projectId}/apiKeys`) 需要企业版 `admin-api` 权限，OSS 版本不可用。

## 目录

- [方式一：通过数据库直接操作](#方式一通过数据库直接操作)
- [方式二：通过 tRPC API（模拟登录）](#方式二通过-trpc-api模拟登录)
- [方式三：通过 UI 界面](#方式三通过-ui-界面)
- [API 密钥格式说明](#api-密钥格式说明)
- [常见问题](#常见问题)

---

## 方式一：通过数据库直接操作

### 环境准备

```bash
# K8s 环境变量（根据实际情况修改）
export NAMESPACE="langfuse"
export PG_POD="langfuse-postgresql-0"
export PG_USER="langfuse"
export PG_PASSWORD="your-password"  # 从 secret 获取
export PG_DATABASE="postgres_langfuse"

# 获取数据库密码
kubectl get secret langfuse-postgresql -n $NAMESPACE -o jsonpath='{.data.password}' | base64 -d
```

### 1. 查询所有 API 密钥

```bash
kubectl exec $PG_POD -n $NAMESPACE -- sh -c "PGPASSWORD=\"$PG_PASSWORD\" psql -U $PG_USER -d $PG_DATABASE -c \"
SELECT
  id,
  public_key,
  display_secret_key,
  scope,
  project_id,
  organization_id,
  note,
  created_at,
  last_used_at
FROM api_keys
ORDER BY created_at DESC;
\""
```

### 2. 查询指定项目的 API 密钥

```bash
PROJECT_ID="your-project-id"

kubectl exec $PG_POD -n $NAMESPACE -- sh -c "PGPASSWORD=\"$PG_PASSWORD\" psql -U $PG_USER -d $PG_DATABASE -c \"
SELECT
  id,
  public_key,
  display_secret_key,
  note,
  created_at
FROM api_keys
WHERE project_id = '$PROJECT_ID' AND scope = 'PROJECT';
\""
```

### 3. 查询项目列表

```bash
kubectl exec $PG_POD -n $NAMESPACE -- sh -c "PGPASSWORD=\"$PG_PASSWORD\" psql -U $PG_USER -d $PG_DATABASE -c \"
SELECT id, name, org_id, created_at FROM projects ORDER BY created_at;
\""
```

### 4. 创建新的项目级 API 密钥

需要先在本地生成密钥和哈希值，然后插入数据库。

#### 步骤 1：生成密钥脚本

创建文件 `generate-api-key.js`：

```javascript
const { randomUUID, createHash } = require('crypto');
const bcrypt = require('bcryptjs');

// 从环境变量获取 SALT（必须与 Langfuse 配置一致）
const SALT = process.env.LANGFUSE_SALT || 'your-salt-value';

function generateApiKey() {
  const publicKey = `pk-lf-${randomUUID()}`;
  const secretKey = `sk-lf-${randomUUID()}`;

  // bcrypt 哈希（用于验证）
  const hashedSecretKey = bcrypt.hashSync(secretKey, 10);

  // SHA256 快速哈希（用于查询）
  const saltHash = createHash('sha256').update(SALT, 'utf8').digest('hex');
  const fastHashedSecretKey = createHash('sha256')
    .update(secretKey)
    .update(saltHash)
    .digest('hex');

  // 显示格式
  const displaySecretKey = `sk-lf-...${secretKey.slice(-4)}`;

  // 生成 ID
  const id = `api-key-${randomUUID().slice(0, 8)}`;

  return {
    id,
    publicKey,
    secretKey,        // 完整密钥（仅显示一次）
    hashedSecretKey,
    fastHashedSecretKey,
    displaySecretKey
  };
}

const key = generateApiKey();
console.log(JSON.stringify(key, null, 2));
```

#### 步骤 2：获取 SALT 值

```bash
# 从 Langfuse Web Pod 获取 SALT
kubectl exec -n $NAMESPACE $(kubectl get pods -n $NAMESPACE -l app=langfuse-web -o jsonpath='{.items[0].metadata.name}') -- printenv SALT
```

#### 步骤 3：生成并插入密钥

```bash
# 设置环境变量
export LANGFUSE_SALT="your-salt-from-above"
export PROJECT_ID="your-project-id"
export NOTE="API key for production"

# 生成密钥
KEY_JSON=$(node generate-api-key.js)

# 提取各字段
ID=$(echo $KEY_JSON | jq -r '.id')
PUBLIC_KEY=$(echo $KEY_JSON | jq -r '.publicKey')
SECRET_KEY=$(echo $KEY_JSON | jq -r '.secretKey')
HASHED=$(echo $KEY_JSON | jq -r '.hashedSecretKey')
FAST_HASHED=$(echo $KEY_JSON | jq -r '.fastHashedSecretKey')
DISPLAY=$(echo $KEY_JSON | jq -r '.displaySecretKey')

# 插入数据库
kubectl exec $PG_POD -n $NAMESPACE -- sh -c "PGPASSWORD=\"$PG_PASSWORD\" psql -U $PG_USER -d $PG_DATABASE -c \"
INSERT INTO api_keys (
  id,
  public_key,
  hashed_secret_key,
  fast_hashed_secret_key,
  display_secret_key,
  scope,
  project_id,
  note
) VALUES (
  '$ID',
  '$PUBLIC_KEY',
  '$HASHED',
  '$FAST_HASHED',
  '$DISPLAY',
  'PROJECT',
  '$PROJECT_ID',
  '$NOTE'
);
\""

# 输出结果（保存好 SECRET_KEY，只显示一次！）
echo "=========================================="
echo "API 密钥创建成功！"
echo "=========================================="
echo "PUBLIC_KEY:  $PUBLIC_KEY"
echo "SECRET_KEY:  $SECRET_KEY"
echo "PROJECT_ID:  $PROJECT_ID"
echo "=========================================="
echo "警告：SECRET_KEY 只显示一次，请妥善保存！"
```

### 5. 修改 API 密钥备注

```bash
KEY_ID="your-api-key-id"
NEW_NOTE="Updated note"

kubectl exec $PG_POD -n $NAMESPACE -- sh -c "PGPASSWORD=\"$PG_PASSWORD\" psql -U $PG_USER -d $PG_DATABASE -c \"
UPDATE api_keys
SET note = '$NEW_NOTE'
WHERE id = '$KEY_ID';
\""
```

### 6. 删除 API 密钥

```bash
KEY_ID="your-api-key-id"

kubectl exec $PG_POD -n $NAMESPACE -- sh -c "PGPASSWORD=\"$PG_PASSWORD\" psql -U $PG_USER -d $PG_DATABASE -c \"
DELETE FROM api_keys WHERE id = '$KEY_ID';
\""
```

> **注意**: 删除后需要清除 Redis 缓存才能立即生效，否则需等待缓存过期。

### 7. 清除 Redis 缓存（可选）

```bash
REDIS_POD="langfuse-redis-primary-0"

# 清除所有 API 密钥缓存
kubectl exec $REDIS_POD -n $NAMESPACE -- redis-cli KEYS "api-key:*" | xargs -I {} kubectl exec $REDIS_POD -n $NAMESPACE -- redis-cli DEL {}
```

---

## 方式二：通过 tRPC API（模拟登录）

tRPC 是 Langfuse Web UI 使用的内部 API，需要用户 Session 认证。

### 1. 获取 Session Token

```bash
# 获取 CSRF Token
CSRF_TOKEN=$(curl -s -c /tmp/cookies.txt "http://localhost:3000/api/auth/csrf" | jq -r '.csrfToken')

# 登录获取 Session
curl -s -b /tmp/cookies.txt -c /tmp/cookies.txt \
  -X POST "http://localhost:3000/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=YOUR_EMAIL&password=YOUR_PASSWORD&csrfToken=${CSRF_TOKEN}"

# 查看 Session Cookie
cat /tmp/cookies.txt | grep session
```

### 2. 查询项目 API 密钥

```bash
PROJECT_ID="your-project-id"

curl -s "http://localhost:3000/api/trpc/projectApiKeys.byProjectId?input=$(echo -n "{\"json\":{\"projectId\":\"$PROJECT_ID\"}}" | jq -sRr @uri)" \
  -b /tmp/cookies.txt | jq .
```

### 3. 创建项目 API 密钥

```bash
PROJECT_ID="your-project-id"

curl -s -X POST "http://localhost:3000/api/trpc/projectApiKeys.create" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"note\":\"Created via tRPC\"}}" | jq .
```

响应示例：
```json
{
  "result": {
    "data": {
      "json": {
        "id": "xxx",
        "publicKey": "pk-lf-xxx",
        "secretKey": "sk-lf-xxx",  // 完整密钥，仅返回一次！
        "displaySecretKey": "sk-lf-...xxxx"
      }
    }
  }
}
```

### 4. 修改 API 密钥备注

```bash
PROJECT_ID="your-project-id"
KEY_ID="your-api-key-id"
NEW_NOTE="Updated note"

curl -s -X POST "http://localhost:3000/api/trpc/projectApiKeys.updateNote" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"keyId\":\"$KEY_ID\",\"note\":\"$NEW_NOTE\"}}"
```

### 5. 删除 API 密钥

```bash
PROJECT_ID="your-project-id"
KEY_ID="your-api-key-id"

curl -s -X POST "http://localhost:3000/api/trpc/projectApiKeys.delete" \
  -H "Content-Type: application/json" \
  -b /tmp/cookies.txt \
  -d "{\"json\":{\"projectId\":\"$PROJECT_ID\",\"id\":\"$KEY_ID\"}}"
```

---

## 方式三：通过 UI 界面

1. 登录 Langfuse Web 界面
2. 进入项目设置页面：`/project/{projectId}/settings`
3. 在 "API Keys" 部分进行管理：
   - 点击 "Create API Key" 创建新密钥
   - 点击密钥旁的编辑图标修改备注
   - 点击删除图标删除密钥

---

## API 密钥格式说明

### 密钥格式

| 字段 | 格式 | 示例 |
|------|------|------|
| Public Key | `pk-lf-{uuid}` | `pk-lf-5e622f3d-3c74-4623-9aa5-55e0ab87ec81` |
| Secret Key | `sk-lf-{uuid}` | `sk-lf-f851f7cb-7d53-40d9-8a08-224408b02194` |
| Display Secret Key | `sk-lf-...{last4}` | `sk-lf-...2194` |

### 数据库表结构

```sql
CREATE TABLE api_keys (
  id                     TEXT PRIMARY KEY,
  created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  note                   TEXT,
  public_key             TEXT UNIQUE NOT NULL,
  hashed_secret_key      TEXT UNIQUE NOT NULL,  -- bcrypt 哈希
  fast_hashed_secret_key TEXT UNIQUE,           -- SHA256 哈希（用于快速查询）
  display_secret_key     TEXT NOT NULL,
  last_used_at           TIMESTAMP,
  expires_at             TIMESTAMP,
  project_id             TEXT,                   -- 项目级密钥
  organization_id        TEXT,                   -- 组织级密钥
  scope                  ApiKeyScope DEFAULT 'PROJECT'  -- PROJECT 或 ORGANIZATION
);
```

### 密钥类型

| 类型 | scope | 用途 |
|------|-------|------|
| 项目级 | `PROJECT` | 用于 Trace 采集、数据查询等 |
| 组织级 | `ORGANIZATION` | 用于管理操作（需企业版） |

---

## 常见问题

### Q1: 为什么创建密钥后 API 调用返回 401？

**原因**: SALT 值不匹配。

**解决**: 确保生成密钥时使用的 SALT 与 Langfuse 配置一致：
```bash
kubectl exec -n langfuse <web-pod> -- printenv SALT
```

### Q2: 删除密钥后为什么还能使用？

**原因**: Redis 缓存未清除。

**解决**: 清除 Redis 缓存或等待缓存过期（默认 TTL 由 `LANGFUSE_CACHE_API_KEY_TTL_SECONDS` 控制）。

### Q3: 如何查看密钥的使用情况？

```sql
SELECT id, public_key, last_used_at, created_at
FROM api_keys
WHERE project_id = 'your-project-id'
ORDER BY last_used_at DESC;
```

### Q4: OSS 版本能否通过 REST API 管理密钥？

不能。`/api/public/projects/{projectId}/apiKeys` 接口需要企业版 `admin-api` 权限。

OSS 版本可选方案：
1. 直接操作数据库
2. 通过 tRPC API（需模拟登录）
3. 通过 UI 界面

---

## 使用示例

### 完整的密钥创建和测试流程

```bash
#!/bin/bash
set -e

# 配置
NAMESPACE="langfuse"
PG_POD="langfuse-postgresql-0"
PG_USER="langfuse"
PG_PASSWORD="your-password"
PG_DATABASE="postgres_langfuse"
PROJECT_ID="your-project-id"
LANGFUSE_SALT="your-salt"
LANGFUSE_HOST="http://localhost:3000"

# 1. 生成密钥
echo "生成 API 密钥..."
PUBLIC_KEY="pk-lf-$(uuidgen | tr '[:upper:]' '[:lower:]')"
SECRET_KEY="sk-lf-$(uuidgen | tr '[:upper:]' '[:lower:]')"
DISPLAY_KEY="sk-lf-...${SECRET_KEY: -4}"
ID="api-key-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)"

# 2. 计算哈希（需要 Node.js 环境）
HASHES=$(node -e "
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const secretKey = '$SECRET_KEY';
const salt = '$LANGFUSE_SALT';
const hashed = bcrypt.hashSync(secretKey, 10);
const saltHash = crypto.createHash('sha256').update(salt, 'utf8').digest('hex');
const fastHashed = crypto.createHash('sha256').update(secretKey).update(saltHash).digest('hex');
console.log(hashed + '|' + fastHashed);
")
HASHED_KEY=$(echo $HASHES | cut -d'|' -f1)
FAST_HASHED_KEY=$(echo $HASHES | cut -d'|' -f2)

# 3. 插入数据库
echo "插入数据库..."
kubectl exec $PG_POD -n $NAMESPACE -- sh -c "PGPASSWORD=\"$PG_PASSWORD\" psql -U $PG_USER -d $PG_DATABASE -c \"
INSERT INTO api_keys (id, public_key, hashed_secret_key, fast_hashed_secret_key, display_secret_key, scope, project_id, note)
VALUES ('$ID', '$PUBLIC_KEY', '$HASHED_KEY', '$FAST_HASHED_KEY', '$DISPLAY_KEY', 'PROJECT', '$PROJECT_ID', 'Auto-generated');
\""

# 4. 测试 API
echo "测试 API..."
curl -s "$LANGFUSE_HOST/api/public/traces?limit=1" -u "$PUBLIC_KEY:$SECRET_KEY" | jq .

# 5. 输出结果
echo ""
echo "=========================================="
echo "API 密钥创建成功！"
echo "PUBLIC_KEY:  $PUBLIC_KEY"
echo "SECRET_KEY:  $SECRET_KEY"
echo "=========================================="
```

---

## 相关文档

- [Langfuse API 文档](https://langfuse.com/docs/api)
- [Langfuse 企业版功能](https://langfuse.com/docs/deployment/self-host#enterprise-edition)

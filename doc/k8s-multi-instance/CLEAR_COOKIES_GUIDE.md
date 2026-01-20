# 清除 Cookie 操作指南

## 问题现象

访问实例 A 时出现 "Unauthorized" 错误：
- Path: dashboardWidgets.all
- 错误类型: UNAUTHORIZED
- 根本原因: JWT session 解密失败

## 为什么会出现这个问题

1. 实例 A 和实例 B 使用了不同的 `NEXTAUTH_SECRET`
2. 您先登录了实例 B，浏览器保存了用实例 B 的密钥加密的 session cookie
3. 虽然我们修复了 `NEXTAUTH_URL`，但旧的 cookie 仍然保存在浏览器中
4. 当访问实例 A 时，实例 A 无法解密这个用实例 B 密钥加密的 cookie
5. 导致认证失败，显示 "Unauthorized"

## 解决方案

### 方案 1: 清除浏览器 Cookie（推荐）

#### Chrome / Edge 浏览器

1. **打开开发者工具**
   - 按 `F12` 或 `Ctrl+Shift+I` (Windows/Linux)
   - 按 `Cmd+Option+I` (Mac)

2. **进入 Application 标签**
   - 在顶部标签栏找到 `Application`（应用程序）
   - 如果没有看到，点击 `>>` 展开更多标签

3. **清除 Cookies**
   - 左侧菜单展开 `Storage` → `Cookies`
   - 点击 `http://localhost:3000`
   - 右键点击右侧的 cookie 列表区域
   - 选择 `Clear` 或 `Delete All`

   **重点删除的 Cookie**：
   - `next-auth.session-token`
   - `next-auth.csrf-token`
   - `next-auth.callback-url`

4. **如果访问过实例 B**，同样清除 `http://localhost:3001` 的 cookies

5. **刷新页面** (F5 或 Ctrl+R)

#### Firefox 浏览器

1. **打开开发者工具**
   - 按 `F12`

2. **进入 Storage 标签**
   - 点击顶部的 `Storage`（存储）标签

3. **清除 Cookies**
   - 展开左侧的 `Cookies`
   - 点击 `http://localhost:3000`
   - 右键选择所有 cookie
   - 点击 `Delete All`

4. **刷新页面**

#### Safari 浏览器

1. **打开 Web Inspector**
   - 按 `Cmd+Option+I`

2. **进入 Storage 标签**

3. **删除 Cookies**
   - 选择 `Cookies` → `localhost`
   - 删除所有相关 cookies

### 方案 2: 使用浏览器的无痕/隐私模式

**最简单的方法**：在不同模式访问不同实例

```
正常窗口 → 访问实例 A (http://localhost:3000)
无痕窗口 → 访问实例 B (http://localhost:3001)
```

**优点**：
- 不需要手动清除 cookie
- 两个实例完全隔离
- 可以同时使用两个实例

**如何打开无痕模式**：
- Chrome: `Ctrl+Shift+N` (Windows/Linux) 或 `Cmd+Shift+N` (Mac)
- Firefox: `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
- Edge: `Ctrl+Shift+N`
- Safari: `Cmd+Shift+N`

### 方案 3: 使用不同的浏览器

**更彻底的隔离**：

- **Chrome** → 访问实例 A (http://localhost:3000)
- **Firefox** → 访问实例 B (http://localhost:3001)

这样两个实例的 cookies 存储在完全不同的地方，永远不会冲突。

### 方案 4: 使用浏览器配置文件（Chrome/Edge）

创建不同的浏览器配置文件：

1. Chrome 右上角点击头像
2. 点击 `+ Add` 创建新配置文件
3. 配置文件 1 访问实例 A
4. 配置文件 2 访问实例 B

## 完整的测试流程

### 步骤 1: 清除所有 Cookie

按照上述方案 1 清除浏览器 Cookie。

### 步骤 2: 设置端口转发

打开两个终端窗口：

```bash
# 终端 1 - 实例 A
kubectl port-forward svc/langfuse-web 3000:3000 -n langfuse

# 终端 2 - 实例 B
kubectl port-forward svc/langfuse-web-b 3001:3000 -n langfuse
```

### 步骤 3: 测试实例 A

1. 打开浏览器（**正常窗口**）
2. 访问 http://localhost:3000
3. 注册或登录账号
4. 验证：
   - ✅ 可以正常登录
   - ✅ Dashboard 正常显示
   - ✅ **不再出现 "Unauthorized" 错误**

### 步骤 4: 测试实例 B

**选择以下任一方式**：

**方式 A: 无痕模式（推荐）**
1. 打开新的无痕/隐私窗口
2. 访问 http://localhost:3001
3. 登录实例 B
4. 验证正常工作

**方式 B: 清除 Cookie 后访问**
1. 在同一浏览器清除 Cookie
2. 访问 http://localhost:3001
3. 登录实例 B

**方式 C: 使用不同浏览器**
1. 打开另一个浏览器（如 Firefox）
2. 访问 http://localhost:3001
3. 登录实例 B

### 步骤 5: 验证隔离效果

1. 在正常窗口访问实例 A → 应该保持登录
2. 在无痕窗口访问实例 B → 应该保持登录
3. 来回切换 → **两个实例都不应该退出**

## 常见问题

### Q1: 清除 Cookie 后，实例 A 仍然显示 Unauthorized？

**解决**：
1. 完全关闭浏览器（所有窗口）
2. 重新打开浏览器
3. 清除浏览器缓存：`Ctrl+Shift+Delete` → 选择 `Cached images and files`
4. 再次访问

### Q2: 我想在同一个浏览器窗口使用两个实例怎么办？

**不推荐**，因为 Session Cookie 仍可能冲突。建议：
1. 使用无痕模式访问其中一个实例
2. 或使用不同浏览器
3. 或使用浏览器配置文件

### Q3: 能否让两个实例共享登录会话？

**不能也不应该**，原因：
1. 两个实例使用不同的数据库（`postgres_langfuse` vs `langfuse_b`）
2. 用户数据存储在不同的数据库中
3. Session 也存储在不同的数据库中
4. 强制共享会导致数据不一致

如果您真的需要统一登录，应该：
- 使用方案 3（projectId 隔离）
- 共享同一个 PostgreSQL 数据库
- 但这不是推荐的生产环境方案

## 预防措施

### 未来如何避免这个问题？

**最佳实践**：

1. **使用不同的域名**（生产环境）
   ```yaml
   实例 A: https://langfuse-a.example.com
   实例 B: https://langfuse-b.example.com
   ```

2. **使用无痕模式**（开发/测试环境）
   - 正常窗口 → 实例 A
   - 无痕窗口 → 实例 B

3. **使用不同的浏览器**（最简单）
   - Chrome → 实例 A
   - Firefox → 实例 B

4. **记录访问方式**
   - 在浏览器书签中标注哪个窗口访问哪个实例
   - 避免混淆

## 技术细节

### Cookie 冲突的技术原因

```
Cookie 属性:
- Name: next-auth.session-token
- Domain: localhost
- Path: /
- Secure: false (本地开发)

问题:
1. 实例 A 和实例 B 都在 localhost 域名下
2. Cookie name 相同
3. 浏览器只保存一个同名 cookie（后者覆盖前者）
4. 导致会话冲突
```

### 为什么 NEXTAUTH_URL 修复不够？

虽然我们修复了 `NEXTAUTH_URL`：
- 实例 A: `http://localhost:3000`
- 实例 B: `http://localhost:3001`

但 **Cookie 的 domain 仍然是 `localhost`**（不包含端口号），所以仍会冲突。

**真正的解决方案**：
- 不同的域名（生产环境）
- 或使用浏览器隔离（开发环境）

## 附录：手动验证 Cookie

### 查看当前 Cookie

在开发者工具的 Console 中执行：

```javascript
// 查看所有 cookie
document.cookie

// 查看 next-auth session token
document.cookie.split('; ').find(row => row.startsWith('next-auth.session-token'))
```

### 手动删除 Cookie

```javascript
// 删除 session token
document.cookie = 'next-auth.session-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'

// 删除 csrf token
document.cookie = 'next-auth.csrf-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
```

执行后刷新页面。

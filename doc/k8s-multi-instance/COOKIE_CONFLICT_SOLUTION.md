# Cookie Conflict Root Cause and Solutions

## Problem Summary

Both instances A and B report "Unauthorized" errors when trying to create API keys or access dashboard features, even when logged in via incognito mode.

## Root Cause Analysis

### Why This Happens

Browser cookies **do NOT include port numbers** when matching domains. When you have:
- Instance A: `http://localhost:3000`
- Instance B: `http://localhost:3001`

**Both instances use cookies with domain `localhost`** (no port), causing conflicts:

```
Instance A sets:
  Cookie: next-auth.session-token
  Domain: localhost
  Encrypted with: Instance A's NEXTAUTH_SECRET

Instance B sets:
  Cookie: next-auth.session-token
  Domain: localhost
  Encrypted with: Instance B's NEXTAUTH_SECRET  (DIFFERENT SECRET!)
```

### What Happens

1. User logs into Instance A → Cookie encrypted with Secret A
2. User logs into Instance B → **Cookie overwrites** with one encrypted with Secret B
3. User returns to Instance A → Instance A tries to decrypt cookie encrypted with Secret B
4. **JWT decryption fails** → No valid session → UNAUTHORIZED error

### Why Incognito Mode Doesn't Help

If you use **one incognito window** and navigate between:
- `http://localhost:3000` (Instance A)
- `http://localhost:3001` (Instance B)

**The cookies still conflict!** Both URLs share the same domain (`localhost`) in the same browser context.

### Technical Details

From `/web/src/server/utils/cookies.ts`:

```typescript
export const getCookieOptions = () => ({
  domain: env.NEXTAUTH_COOKIE_DOMAIN ?? undefined,  // undefined = current hostname
  httpOnly: true,
  sameSite: "lax" as const,
  path: env.NEXT_PUBLIC_BASE_PATH || "/",
  secure: shouldSecureCookies(),
});
```

Since `NEXTAUTH_COOKIE_DOMAIN` is not set, the browser uses the default domain (`localhost`), which matches both ports.

## Solutions

### Solution 1: Use Completely Separate Browsers (Recommended for Local Testing)

**Best for development/testing:**

```
Chrome      → Instance A (http://localhost:3000)
Firefox     → Instance B (http://localhost:3001)
```

**Why this works:** Different browsers have completely separate cookie storage.

**Steps:**
1. Open Chrome → Visit `http://localhost:3000` → Login
2. Open Firefox → Visit `http://localhost:3001` → Login
3. Switch between browsers freely - no conflicts!

---

### Solution 2: Use Different Browser Profiles

**For Chrome/Edge:**

1. Click your profile icon (top right)
2. Click "Add" to create a new profile
3. Profile 1 → Access Instance A
4. Profile 2 → Access Instance B

**Why this works:** Each profile has its own cookie storage, completely isolated.

---

### Solution 3: Use Separate Incognito Windows (Carefully)

**Important:** You must use **completely separate incognito sessions**, not just tabs!

**Correct approach:**
```bash
# Terminal 1
kubectl port-forward svc/langfuse-web 3000:3000 -n langfuse
```

1. Open **first** incognito window → Visit `http://localhost:3000` → Login
2. **Keep this window open, do NOT navigate to 3001**

```bash
# Terminal 2
kubectl port-forward svc/langfuse-web-b 3001:3000 -n langfuse
```

3. Open **second** incognito window → Visit `http://localhost:3001` → Login
4. **Keep this window open, do NOT navigate to 3000**

**Critical:** Never navigate between the two URLs in the same browser window/session!

---

### Solution 4: Deploy with Different Hostnames (Production Solution)

**For production environments, use different domains:**

```yaml
# Instance A
NEXTAUTH_URL: https://langfuse-a.example.com

# Instance B
NEXTAUTH_URL: https://langfuse-b.example.com
```

Then configure Ingress:

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

**Why this works:** Different domains → Different cookie storage → No conflicts!

---

## Verification Steps

After applying any solution above:

### Step 1: Clear ALL Cookies

Before testing, clear all cookies for `localhost`:

1. Open DevTools (F12)
2. Go to Application → Cookies
3. Delete all cookies under `http://localhost`

### Step 2: Test Instance A

```bash
kubectl port-forward svc/langfuse-web 3000:3000 -n langfuse
```

1. Open browser (using one of the solutions above)
2. Visit `http://localhost:3000`
3. Login with `cprom@baidu.com`
4. Navigate to Settings → API Keys
5. **Try to create an API key**
6. ✅ Should work without "Unauthorized" error

### Step 3: Test Instance B

```bash
kubectl port-forward svc/langfuse-web-b 3001:3000 -n langfuse
```

1. Open different browser/profile/window (using one of the solutions above)
2. Visit `http://localhost:3001`
3. Login with `cprom@baidu.com`
4. Navigate to Settings → API Keys
5. **Try to create an API key**
6. ✅ Should work without "Unauthorized" error

### Step 4: Verify Isolation

1. Instance A window → Should remain logged in
2. Instance B window → Should remain logged in
3. Switch between windows → **Both should stay logged in**

---

## Why Setting NEXT_PUBLIC_LANGFUSE_CLOUD_REGION Didn't Work

Attempted solution: Set `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` to add unique cookie suffix.

**Problem:** This flag triggers cloud-specific features including DataDog tracing (`dd-trace`), which is not installed in self-hosted deployments.

**Error:**
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'dd-trace'
```

**Conclusion:** This approach requires cloud dependencies and is not suitable for self-hosted instances.

---

## Technical Deep Dive

### How NextAuth Session Works

1. **Login (Credentials Provider)**:
   ```
   User submits email + password
   → CredentialsProvider.authorize() validates
   → Returns User object (with empty organizations array)
   → NextAuth creates JWT token with user data
   → JWT token stored in cookie: next-auth.session-token
   ```

2. **Subsequent Requests**:
   ```
   Browser sends cookie: next-auth.session-token
   → NextAuth decrypts JWT using NEXTAUTH_SECRET
   → Calls session callback with token data
   → Session callback queries database for user + organizations
   → Returns populated session with user.organizations
   → tRPC middleware checks project access
   ```

3. **When Cookie Conflict Occurs**:
   ```
   Browser sends cookie encrypted with Secret B
   → Instance A tries to decrypt with Secret A
   → Decryption fails
   → Invalid JWT token
   → Session callback gets invalid/null token
   → Session.user is null
   → Middleware throws UNAUTHORIZED
   ```

### Why Port Numbers Don't Help

Browser cookie matching rules (RFC 6265):

```
A cookie with domain "localhost" matches:
  - localhost
  - localhost:3000
  - localhost:3001
  - localhost:ANY_PORT
```

The domain attribute does NOT include or match on port numbers. Therefore:
- `localhost:3000` and `localhost:3001` are considered the SAME domain
- Cookies are shared between all ports on `localhost`

---

## Recommended Approach

**For local development/testing:**
→ Use **Solution 1** (separate browsers) - Simplest and most reliable

**For production deployment:**
→ Use **Solution 4** (different hostnames) - Proper isolation

---

## Summary

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| Cookie conflicts | Same domain (`localhost`) for both instances | Use separate browsers OR different hostnames |
| JWT decryption fails | Different NEXTAUTH_SECRET per instance | Properly isolate cookies so each instance only sees its own |
| Incognito mode doesn't help | Still using same browser context | Use completely separate browser instances or profiles |
| Port forwarding limitations | Browser cookies ignore port numbers | Production: Use different domains/subdomains |

---

## Files Referenced

- `/web/src/server/utils/cookies.ts` - Cookie configuration
- `/web/src/server/auth.ts` - NextAuth configuration, session callback
- `/web/src/server/api/trpc.ts` - Middleware that checks authentication
- `/doc/k8s-multi-instance/03-langfuse-web-b.yaml` - Instance B configuration
- `/doc/k8s-multi-instance/SESSION_CONFLICT_FIX.md` - Previous session issue documentation
- `/doc/k8s-multi-instance/CLEAR_COOKIES_GUIDE.md` - Cookie clearing guide

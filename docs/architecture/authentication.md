# 认证与授权架构

## JWT 认证中间件

**文件位置**: `server/src/middleware/auth.ts`

**职责**: 处理用户认证和权限验证

### 认证流程

1. 从 `Authorization` 头提取 Bearer Token
2. 首先尝试 JWT 验证
3. JWT 失败后尝试 API Token 验证
4. 验证成功将用户信息附加到 `req.user`

### 密钥管理

```typescript
// 双层 JWT 密钥结构
JWT_SECRET = BASE_JWT_SECRET + RUNTIME_SECRET
```

## API Token 权限系统

**文件位置**: `server/src/service/token.ts`

**职责**: 管理 API Token 的创建、验证和权限控制

### Token 权限维度

- **服务权限**: 限制可访问的 API 服务
- **域名权限**: 限制可操作的域名范围
- **时间权限**: 设置 Token 的有效期
- **角色继承**: 继承创建者的角色权限

## 角色权限系统

**文件位置**: `server/src/utils/roles.ts`

```typescript
const ROLE_USER = 1          // 普通用户
const ROLE_ADMIN = 2         // 管理员
const ROLE_SUPER_ADMIN = 3   // 超级管理员

isSuper(role: number): boolean
isAdmin(role: number): boolean
normalizeRole(role: unknown): number
```

## 认证安全特性

### 1. JWT 双层密钥

- **BASE_JWT_SECRET**: 环境变量配置的基础密钥
- **RUNTIME_SECRET**: 数据库存储的运行时密钥
- 运行时密钥在初始化时自动生成，支持轮换

### 2. Token 过期时间

- JWT Token: 7 天
- API Token: 可配置有效期

### 3. 密码加密

- 使用 bcrypt 进行密码哈希
- 自动加盐，防止彩虹表攻击

### 4. 登录限流

**文件位置**: `server/src/service/loginLimit.ts`

- 防止暴力破解
- 可配置最大尝试次数和锁定时间
- 支持手动解锁

### 5. 双因素认证 (2FA)

**文件位置**: `server/src/service/totp.ts`

- 支持 TOTP (Time-based One-Time Password)
- 提供备份验证码
- 兼容 Google Authenticator 等标准应用

### 6. Passkeys 支持

**文件位置**: `server/src/service/webauthn.ts`

- 支持 WebAuthn 标准
- 生物识别登录（指纹、面容等）
- 硬件安全密钥支持

## OAuth2/OIDC 集成

**文件位置**: `server/src/routes/auth.ts`

### 支持的流程

1. **授权码流程**: 标准 OAuth2 授权码模式
2. **OIDC 自动发现**: 支持通过 issuer URL 自动获取配置
3. **账号绑定**: 支持将 OAuth 账号绑定到现有用户

### 配置模板

- **通用 OAuth2/OIDC**: 支持任意标准 OAuth2/OIDC 提供商
- **Logto 模板**: 针对 Logto 平台的优化配置

## 权限检查中间件

### adminOnly

限制只有管理员可以访问：

```typescript
export function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role < ROLE_ADMIN) {
    return res.status(403).json({ code: -1, msg: 'Admin access required' });
  }
  next();
}
```

### superAdminOnly

限制只有超级管理员可以访问：

```typescript
export function superAdminOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role < ROLE_SUPER_ADMIN) {
    return res.status(403).json({ code: -1, msg: 'Super admin access required' });
  }
  next();
}
```

## 会话管理

**文件位置**: `server/src/service/session.ts`

- 管理用户会话状态
- 支持多设备登录
- 支持远程注销其他会话

## 安全头设置

```typescript
// Content Security Policy
Content-Security-Policy: default-src 'self'

// X-Content-Type-Options
X-Content-Type-Options: nosniff

// X-Frame-Options
X-Frame-Options: DENY

// X-XSS-Protection
X-XSS-Protection: 1; mode=block

// Referrer-Policy
Referrer-Policy: strict-origin-when-cross-origin
```

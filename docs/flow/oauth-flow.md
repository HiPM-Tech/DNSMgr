# OAuth 登录流程

## 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant API as API 客户端
    participant Backend as 后端
    participant OAuth as OAuth 提供商
    participant Adapter as 业务适配器层
    participant DB as 数据库
    participant Audit as 审计服务

    User->>Frontend: 1. 点击"OAuth 登录"
    Frontend->>API: 2. 调用 authApi.oauthStatus()
    API->>Backend: 3. GET /api/auth/oauth/status
    Backend->>SettingsOperations: 4. get() 查询 OAuth 配置
    SettingsOperations->>Adapter: 5. get() 查询配置
    Adapter->>DB: 6. SELECT * FROM system_settings
    DB-->>Adapter: 返回配置
    Adapter-->>SettingsOperations: 返回配置
    SettingsOperations-->>Backend: 返回配置
    Backend-->>API: 7. 返回启用的提供商
    API-->>Frontend: 显示 OAuth 按钮

    User->>Frontend: 8. 点击 OAuth 提供商按钮
    Frontend->>API: 9. 调用 authApi.oauthStart()
    API->>Backend: 10. POST /api/auth/oauth/start
    Backend->>SettingsOperations: 11. get() 查询 OAuth 配置
    SettingsOperations->>Adapter: 12. get() 查询配置
    Adapter->>DB: 13. SELECT * FROM system_settings
    DB-->>Adapter: 返回配置
    Adapter-->>SettingsOperations: 返回配置
    SettingsOperations-->>Backend: 返回配置
    Backend->>Backend: 14. 生成 state (防 CSRF)
    Backend->>Backend: 15. 存储 state 到内存
    Backend-->>API: 16. 返回 authUrl
    API-->>Frontend: 返回授权 URL
    Frontend->>OAuth: 17. 重定向到 OAuth 授权页

    Note over OAuth: 用户授权登录

    OAuth->>Frontend: 18. 重定向回 /oauth/callback?code=xxx
    Frontend->>API: 19. 调用 authApi.oauthCallback()
    API->>Backend: 20. POST /api/auth/oauth/callback

    Note over Backend: OAuth 回调处理

    Backend->>Backend: 21. 验证 state
    Backend->>OAuth: 22. 用 code 换取 access_token
    OAuth-->>Backend: 返回 {access_token, id_token}
    Backend->>OAuth: 23. 获取用户信息
    OAuth-->>Backend: 返回用户资料
    Backend->>Backend: 24. 解析用户标识 (subject)
    Backend->>OAuthOperations: 25. getByProviderSubject() 查询是否已绑定
    OAuthOperations->>Adapter: 26. get() 查询绑定信息
    Adapter->>DB: 27. SELECT * FROM oauth_user_links
    DB-->>Adapter: 返回绑定信息
    Adapter-->>OAuthOperations: 返回绑定信息
    OAuthOperations-->>Backend: 返回绑定信息

    alt 未绑定
        Backend-->>API: 返回：账户未绑定
        API-->>Frontend: 提示先绑定账户
        Frontend-->>User: 显示错误
    else 已绑定且状态正常
        Backend->>Backend: 28. signToken() 生成 JWT
        Backend->>AuditOperations: 29. log() 记录 OAuth 登录日志
        AuditOperations->>Adapter: 30. execute() 记录操作日志
        Adapter->>DB: 31. INSERT INTO audit_logs
        DB-->>Adapter: 记录完成
        Adapter-->>AuditOperations: 记录完成
        AuditOperations-->>Backend: 记录完成
        Backend-->>API: 32. 返回：{token, user}
        API-->>Frontend: 存储 token
        Frontend->>Frontend: 33. 更新 AuthContext
        Frontend-->>User: 跳转到 Dashboard
    else 账户被禁用
        Backend-->>API: 返回：账户已禁用
        API-->>Frontend: 显示错误
        Frontend-->>User: 提示联系管理员
    end
```

## 关键代码路径

### 获取 OAuth 状态

**前端：**
```
Login.tsx
  → authApi.oauthStatus()
  → api.get('/auth/oauth/status')
```

**后端：**
```
GET /api/auth/oauth/status (routes/auth.ts)
  → SettingsOperations.get('oauth_config') / get('oauth_logto_config')
  → 返回启用的提供商列表
```

### 开始 OAuth 流程

**前端：**
```
Login.tsx
  → authApi.oauthStart(provider)
  → api.post('/auth/oauth/start')
```

**后端：**
```
POST /api/auth/oauth/start (routes/auth.ts)
  → SettingsOperations.get() 获取 OAuth 配置
  → randomHex() 生成 state
  → 存储 state 到 oauthStateStore (内存 Map)
  → 构建授权 URL
  → 返回 {authUrl}
```

### OAuth 回调处理

**前端：**
```
OAuthCallback.tsx
  → 从 URL 提取 code 和 state
  → authApi.oauthCallback({code, state, provider})
  → api.post('/auth/oauth/callback')
```

**后端：**
```
POST /api/auth/oauth/callback (routes/auth.ts)
  → 验证 state (防止 CSRF)
  → exchangeOauthCode() 用 code 换取 access_token
  → fetchOAuthProfile() 获取用户信息
  → 解析 subject (用户唯一标识)
  → OAuthOperations.getUserByProviderSubject() 查询绑定
  → 如果已绑定：
    → signToken() 生成 JWT
    → AuditOperations.log() 记录审计日志
    → 返回 {token, user}
  → 如果未绑定：
    → 返回错误提示绑定账户
```

## 数据流

```
用户点击 OAuth 登录
  ↓
前端获取 OAuth 状态
  ↓
显示可用的 OAuth 提供商
  ↓
用户选择提供商
  ↓
后端生成 state 并返回授权 URL
  ↓
重定向到 OAuth 提供商授权页
  ↓
用户授权
  ↓
重定向回应用 callback
  ↓
用 code 换取 access_token
  ↓
获取用户信息
  ↓
查询是否已绑定本地账户
  ↓
如果已绑定：生成 JWT 并登录
如果未绑定：提示绑定账户
```

## 安全机制

1. **State 验证**: 防止 CSRF 攻击
2. **Code 一次性使用**: 授权码只能使用一次
3. **PKCE 支持**: 可选的 PKCE 流程增强安全性
4. **Token 验证**: 验证 ID Token 的签名和声明

## 支持的 OAuth 提供商

- **通用 OAuth2/OIDC**: 支持任意标准 OAuth2/OIDC 提供商
- **Logto**: 针对 Logto 平台的优化配置

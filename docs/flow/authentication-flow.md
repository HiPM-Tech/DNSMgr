# 用户认证流程

## 认证方式总览

DNSMgr 支持多种认证方式，满足不同安全需求：

```mermaid
graph TB
    A[用户访问] --> B{认证方式}
    B -->|用户名密码| C[传统登录]
    B -->|OAuth| D[OAuth2/OIDC]
    B -->|Passkey| E[WebAuthn]
    B -->|API Token| F[Token 认证]
    
    C --> G[验证用户名密码]
    G --> H{2FA 启用?}
    H -->|是| I[验证 TOTP]
    H -->|否| J[生成 JWT]
    I --> J
    
    D --> K[重定向到提供商]
    K --> L[获取授权码]
    L --> M[换取 Access Token]
    M --> N[获取用户信息]
    N --> O[查询绑定关系]
    O --> J
    
    E --> P[生成 Challenge]
    P --> Q[客户端签名]
    Q --> R[验证签名]
    R --> J
    
    F --> S[验证 Token]
    S --> T[返回数据]
    
    J --> U[创建设备信任]
    U --> V[返回 Token]
```

## 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端 (React)
    participant API as API 客户端
    participant Backend as 后端 (Express)
    participant LoginLimit as 登录限制服务
    participant Adapter as 业务适配器层
    participant DB as 数据库
    participant TOTP as TOTP 服务
    participant Audit as 审计服务

    User->>Frontend: 1. 输入用户名/密码
    Frontend->>API: 2. 调用 authApi.login()
    API->>Backend: 3. POST /api/auth/login

    Backend->>LoginLimit: 4. checkLoginAllowed()
    LoginLimit->>Adapter: 5. get() 查询登录限制配置
    Adapter->>DB: 6. SELECT * FROM system_settings
    DB-->>Adapter: 返回配置
    Adapter-->>LoginLimit: 返回配置
    LoginLimit->>Adapter: 7. get() 查询失败尝试记录
    Adapter->>DB: 8. SELECT * FROM login_attempts
    DB-->>Adapter: 返回记录
    Adapter-->>LoginLimit: 返回记录
    LoginLimit-->>Backend: 9. 返回是否允许登录

    alt 登录被限制
        Backend-->>API: 返回错误：账户被锁定
        API-->>Frontend: 显示错误信息
        Frontend-->>User: 提示稍后重试
    else 允许登录
        Backend->>Adapter: 10. get() 查询用户信息
        Adapter->>DB: 11. SELECT * FROM users WHERE ...
        DB-->>Adapter: 返回用户数据
        Adapter-->>Backend: 返回用户数据

        alt 用户不存在
            Backend->>LoginLimit: 记录失败尝试
            Backend-->>API: 返回：用户名或密码错误
        else 用户存在
            Backend->>Backend: bcrypt.compare 密码
            alt 密码错误
                Backend->>LoginLimit: 记录失败尝试
                Backend-->>API: 返回：密码错误
            else 密码正确
                Backend->>TOTP: 检查 2FA 状态
                TOTP-->>Backend: 返回是否启用

                alt 2FA 已启用
                    Backend-->>API: 返回 code: -2 (需要 2FA)
                    API-->>Frontend: 显示 2FA 输入框
                    User->>Frontend: 输入 2FA 码
                    Frontend->>API: 重新调用 login (带 totpCode)
                    API->>Backend: POST /api/auth/login
                    Backend->>TOTP: verifyTOTPToken()
                end

                Backend->>LoginLimit: clearLoginAttempts()
                Backend->>Audit: logAuditOperation()
                Backend->>Backend: signToken() 生成 JWT
                Backend-->>API: 返回：{token, user}
                API-->>Frontend: 存储 token
                Frontend-->>User: 跳转到 Dashboard
            end
        end
    end
```

## 关键代码路径

### 前端调用链

```
Login.tsx 
  → authApi.login() 
  → api.post('/auth/login') 
  → Axios 拦截器 (添加 Token)
```

### 后端处理链

```
POST /api/auth/login (routes/auth.ts)
  → loginLimiter 中间件 (限流)
  → checkLoginAllowed() (service/loginLimit.ts)
  → get() 查询用户 (通过业务适配器层)
  → bcrypt.compareSync() 验证密码
  → getTOTPStatus() 检查 2FA (service/totp.ts)
  → verifyTOTPToken() 验证 2FA 码
  → clearLoginAttempts() 清除记录 (service/loginLimit.ts)
  → signToken() 生成 JWT (middleware/auth.ts)
  → logAuditOperation() 记录审计 (service/audit.ts)
  → 返回 {token, user}
```

## 数据流

```
用户输入
  ↓
前端表单验证
  ↓
authApi.login(username, password)
  ↓
POST /api/auth/login
  ↓
[后端] loginLimiter 中间件
  ↓
[后端] checkLoginAllowed() - 检查登录限制
  ↓
[后端] get() - 查询用户 (通过业务适配器层)
  ↓
[后端] bcrypt.compare() - 验证密码
  ↓
[后端] getTOTPStatus() - 检查 2FA
  ↓
[后端] verifyTOTPToken() - 验证 2FA 码 (如果需要)
  ↓
[后端] clearLoginAttempts() - 清除失败记录
  ↓
[后端] signToken() - 生成 JWT
  ↓
[后端] logAuditOperation() - 记录审计日志
  ↓
返回 {token, user}
  ↓
前端存储 token 到 localStorage
  ↓
更新 AuthContext
  ↓
重定向到 Dashboard
```

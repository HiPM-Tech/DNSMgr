# DNSMgr 前后端调用流程与模块交互图

## 目录

- [整体架构图](#整体架构图)
- [用户登录流程](#用户登录流程)
- \[OAuth 登录流程]\(#oauth 登录流程)
- \[DNS 记录管理流程]\(#dns 记录管理流程)
- [数据库初始化流程](#数据库初始化流程)
- \[API 请求处理流程]\(#api 请求处理流程)
- [前端路由与页面加载流程](#前端路由与页面加载流程)

***

## 整体架构图

```mermaid
graph TB
    subgraph "前端层 (Client - React)"
        UI[用户界面 Pages]
        Components[通用组件 Components]
        AuthContext[认证上下文 AuthContext]
        API[API 客户端 api/index.ts]
        I18n[国际化 i18n]
        Theme[主题管理 ThemeContext]
    end

    subgraph "后端层 (Server - Express)"
        Routes[API 路由 Routes]
        Middleware[中间件 Middleware]
        Service[业务服务 Service]
        DNS[DNS 核心层 DNS Core]
        DB[数据库层 Database]
    end

    subgraph "外部服务"
        DNSProviders[DNS 服务商 API]
        OAuth[OAuth 提供商]
        SMTP[SMTP 邮件服务]
    end

    subgraph "数据存储"
        SQLite[(SQLite/MySQL/PostgreSQL)]
    end

    UI --> Components
    UI --> AuthContext
    UI --> API
    API --> Routes
    Routes --> Middleware
    Middleware --> Service
    Service --> DB
    Service --> DNS
    DNS --> DNSProviders
    Service --> OAuth
    Service --> SMTP
    DB --> SQLite

    style UI fill:#e1f5ff
    style API fill:#e1f5ff
    style Routes fill:#ffe1e1
    style Service fill:#fff4e1
    style DNS fill:#e1ffe1
    style DB fill:#f0e1ff
```

***

## 用户登录流程

### 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端 (React)
    participant API as API 客户端
    participant Backend as 后端 (Express)
    participant Auth as 认证中间件
    participant LoginLimit as 登录限制服务
    participant DB as 数据库
    participant TOTP as TOTP 服务
    participant Audit as 审计服务

    User->>Frontend: 1. 输入用户名/密码
    Frontend->>API: 2. 调用 authApi.login()
    API->>Backend: 3. POST /api/auth/login

    Note over Backend: 请求到达认证路由

    Backend->>LoginLimit: 4. checkLoginAllowed()
    LoginLimit->>DB: 5. 查询登录限制配置
    DB-->>LoginLimit: 返回配置
    LoginLimit->>DB: 6. 查询失败尝试记录
    DB-->>LoginLimit: 返回记录
    LoginLimit-->>Backend: 7. 返回是否允许登录

    alt 登录被限制
        Backend-->>API: 8. 返回错误：账户被锁定
        API-->>Frontend: 显示错误信息
        Frontend-->>User: 提示稍后重试
    else 允许登录
        Backend->>DB: 9. 查询用户信息
        alt 按邮箱登录
            Note over DB: WHERE email = ?
        else 按用户名登录
            Note over DB: WHERE username = ?
        end
        DB-->>Backend: 返回用户数据

        alt 用户不存在
            Backend->>LoginLimit: 记录失败尝试
            LoginLimit->>DB: 更新尝试记录
            Backend-->>API: 返回：用户名或密码错误
            API-->>Frontend: 显示错误
            Frontend-->>User: 提示凭证错误
        else 用户存在
            Backend->>Backend: bcrypt.compare 密码
            alt 密码错误
                Backend->>LoginLimit: 记录失败尝试
                Backend-->>API: 返回：密码错误
                API-->>Frontend: 显示错误
                Frontend-->>User: 提示密码错误
            else 密码正确
                Backend->>TOTP: 检查 2FA 状态
                TOTP->>DB: 查询 TOTP 配置
                DB-->>TOTP: 返回配置
                TOTP-->>Backend: 返回是否启用

                alt 2FA 已启用
                    Backend-->>API: 返回 code: -2 (需要 2FA)
                    API-->>Frontend: 显示 2FA 输入框
                    Frontend-->>User: 请求输入 2FA 码
                    User->>Frontend: 输入 2FA 码
                    Frontend->>API: 重新调用 login (带 totpCode)
                    API->>Backend: POST /api/auth/login
                    Backend->>TOTP: verifyTOTPToken()
                    TOTP->>TOTP: 验证令牌
                    alt 验证失败
                        Backend-->>API: 返回：2FA 码错误
                        API-->>Frontend: 显示错误
                    else 验证成功
                        Note over Backend: 继续登录流程
                    end
                else 2FA 未启用
                    Note over Backend: 跳过 2FA 验证
                end

                Note over Backend: 2FA 验证通过或无需 2FA

                Backend->>LoginLimit: clearLoginAttempts()
                LoginLimit->>DB: 清除失败记录
                Backend->>Audit: logAuditOperation()
                Audit->>DB: 记录登录审计日志
                Backend->>Backend: signToken() 生成 JWT
                Backend-->>API: 返回：{token, user}
                API-->>Frontend: 存储 token 到 localStorage
                Frontend->>Frontend: 更新 AuthContext
                Frontend-->>User: 跳转到 Dashboard
            end
        end
    end
```

### 关键代码路径

```
前端调用链:
Login.tsx 
  → authApi.login() 
  → api.post('/auth/login') 
  → Axios 拦截器 (添加 Token)

后端处理链:
POST /api/auth/login (routes/auth.ts)
  → loginLimiter 中间件 (限流)
  → checkLoginAllowed() (service/loginLimit.ts)
  → db.get() 查询用户 (db/adapter.ts)
  → bcrypt.compareSync() 验证密码
  → getTOTPStatus() 检查 2FA (service/totp.ts)
  → verifyTOTPToken() 验证 2FA 码
  → clearLoginAttempts() 清除记录 (service/loginLimit.ts)
  → signToken() 生成 JWT (middleware/auth.ts)
  → logAuditOperation() 记录审计 (service/audit.ts)
  → 返回 {token, user}
```

***

## OAuth 登录流程

### 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant API as API 客户端
    participant Backend as 后端
    participant OAuth as OAuth 提供商
    participant DB as 数据库
    participant Audit as 审计服务

    User->>Frontend: 1. 点击"OAuth 登录"
    Frontend->>API: 2. 调用 authApi.oauthStatus()
    API->>Backend: 3. GET /api/auth/oauth/status
    Backend->>DB: 4. 查询 OAuth 配置
    DB-->>Backend: 返回配置
    Backend-->>API: 5. 返回启用的提供商
    API-->>Frontend: 显示 OAuth 按钮

    User->>Frontend: 6. 点击 OAuth 提供商按钮
    Frontend->>API: 7. 调用 authApi.oauthStart()
    API->>Backend: 8. POST /api/auth/oauth/start
    Backend->>DB: 9. 查询 OAuth 配置
    DB-->>Backend: 返回配置
    Backend->>Backend: 生成 state (防 CSRF)
    Backend->>Backend: 存储 state 到内存
    Backend-->>API: 10. 返回 authUrl
    API-->>Frontend: 返回授权 URL
    Frontend->>OAuth: 11. 重定向到 OAuth 授权页

    Note over OAuth: 用户授权登录

    OAuth->>Frontend: 12. 重定向回 /oauth/callback?code=xxx
    Frontend->>API: 13. 调用 authApi.oauthCallback()
    API->>Backend: 14. POST /api/auth/oauth/callback

    Note over Backend: OAuth 回调处理

    Backend->>Backend: 验证 state
    Backend->>OAuth: 15. 用 code 换取 access_token
    OAuth-->>Backend: 返回 {access_token, id_token}
    Backend->>OAuth: 16. 获取用户信息
    OAuth-->>Backend: 返回用户资料
    Backend->>Backend: 解析用户标识 (subject)
    Backend->>DB: 17. 查询是否已绑定
    DB-->>Backend: 返回绑定信息

    alt 未绑定
        Backend-->>API: 返回：账户未绑定
        API-->>Frontend: 提示先绑定账户
        Frontend-->>User: 显示错误
    else 已绑定且状态正常
        Backend->>Backend: signToken() 生成 JWT
        Backend->>Audit: logAuditOperation()
        Audit->>DB: 记录 OAuth 登录日志
        Backend-->>API: 返回：{token, user}
        API-->>Frontend: 存储 token
        Frontend->>Frontend: 更新 AuthContext
        Frontend-->>User: 跳转到 Dashboard
    else 账户被禁用
        Backend-->>API: 返回：账户已禁用
        API-->>Frontend: 显示错误
        Frontend-->>User: 提示联系管理员
    end
```

### 关键代码路径

```Textile
OAuth 启动流程:
前端：
  Login.tsx/OAuthCallback.tsx
    → authApi.oauthStatus()
    → authApi.oauthStart(provider)

后端：
  GET /api/auth/oauth/status (routes/auth.ts:418)
    → getEnabledOAuthProviders()
      → getOAuthConfigByProvider()
        → db.get('SELECT value FROM system_settings WHERE key = ?')
  
  POST /api/auth/oauth/start (routes/auth.ts:467)
    → getOAuthConfigByProvider()
    → assertOAuthEnabled()
    → 生成 state 并存储
    → buildOauthAuthUrl()
    → 返回 authUrl

OAuth 回调流程:
  POST /api/auth/oauth/callback (routes/auth.ts:591)
    → 验证 state
    → exchangeOauthCode() 换取 token
    → fetchOAuthProfile() 获取用户信息
    → verifyIdToken() 验证 id_token
    → resolveOAuthSubject() 解析用户标识
    → resolveOAuthEmail() 解析邮箱
    → db.get() 查询 oauth_user_links
    → 检查绑定状态
    → signToken() 生成 JWT
    → logAuditOperation() 记录审计
    → 返回 {token, user}
```

***

## DNS 记录管理流程

### 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant API as API 客户端
    participant AuthMW as 认证中间件
    participant Routes as API 路由
    participant Adapter as 数据库适配器
    participant DnsHelper as DNS 助手
    participant Provider as DNS 服务商
    participant DB as 数据库
    participant Audit as 审计服务

    User->>Frontend: 1. 访问域名记录页面
    Frontend->>API: 2. 调用 recordsApi.list()
    API->>AuthMW: 3. GET /api/domains/:id/records

    Note over AuthMW: JWT 验证

    AuthMW->>AuthMW: 验证 Token
    alt Token 无效
        AuthMW-->>API: 返回 401
        API-->>Frontend: 跳转到登录页
    else Token 有效
        AuthMW->>Routes: 4. 进入记录路由
        Routes->>Adapter: 5. 查询域名权限
        Adapter->>DB: 6. 查询 domain_permissions
        DB-->>Adapter: 返回权限信息

        alt 无权限
            Routes-->>API: 返回 403
            API-->>Frontend: 显示无权限
            Frontend-->>User: 提示无访问权限
        else 有权限
            Routes->>Adapter: 7. 查询域名信息
            Adapter->>DB: 8. SELECT * FROM domains
            DB-->>Adapter: 返回域名数据
            Routes->>Adapter: 9. 查询所属账号
            Adapter->>DB: 10. SELECT * FROM dns_accounts
            DB-->>Adapter: 返回账号配置
            Routes->>DnsHelper: 11. createAdapter()
            DnsHelper->>Provider: 12. 实例化服务商适配器

            Note over Provider: 根据账号 type 选择
            Note over Provider: 如 aliyun, cloudflare 等

            Routes->>Provider: 13. getDomainRecords()
            Provider->>Provider: 调用服务商 API
            Provider-->>Routes: 14. 返回记录列表
            Routes->>Routes: 数据格式化
            Routes-->>API: 15. 返回 {total, list}
            API-->>Frontend: 返回记录数据
            Frontend-->>User: 渲染记录表格
        end
    end

    Note over User: 用户修改记录

    User->>Frontend: 16. 编辑记录并提交
    Frontend->>API: 17. 调用 recordsApi.update()
    API->>AuthMW: 18. PUT /api/domains/:id/records/:recordId
    AuthMW->>Routes: 19. 进入更新路由
    Routes->>Adapter: 20. 查询权限
    Adapter->>DB: 21. 验证写权限
    DB-->>Adapter: 返回权限结果

    alt 无写权限
        Routes-->>API: 返回 403
        API-->>Frontend: 显示无权限
    else 有写权限
        Routes->>Adapter: 22. 获取域名和账号
        Adapter->>DB: 23. 查询配置
        DB-->>Adapter: 返回配置
        Routes->>DnsHelper: 24. createAdapter()
        DnsHelper->>Provider: 25. 实例化适配器
        Routes->>Provider: 26. updateDomainRecord()
        Provider->>Provider: 调用服务商 API
        Provider-->>Routes: 27. 返回更新结果

        alt 更新失败
            Routes-->>API: 返回 500
            API-->>Frontend: 显示错误
            Frontend-->>User: 提示更新失败
        else 更新成功
            Routes->>Adapter: 28. 更新本地缓存
            Adapter->>DB: 29. UPDATE domain_records
            Routes->>Audit: 30. logAuditOperation()
            Audit->>DB: 记录操作日志
            Routes-->>API: 31. 返回成功
            API-->>Frontend: 刷新列表
            Frontend-->>User: 显示成功提示
        end
    end
```

### 关键代码路径

```
获取记录列表:
前端：
  Records.tsx
    → useQuery(['records', domainId], () => recordsApi.list(domainId))
    → recordsApi.list(domainId, params)
    → api.get(`/domains/${domainId}/records`)

后端：
  GET /api/domains/:domainId/records (routes/records.ts)
    → authMiddleware (认证)
    → 检查域名权限
    → db.get() 查询域名信息
    → db.get() 查询账号配置
    → createAdapter() 创建 DNS 适配器
    → adapter.getDomainRecords() 调用服务商 API
    → 格式化返回数据
    → 返回 {total, list}

更新记录:
前端：
  RecordForm.tsx
    → recordsApi.update(domainId, recordId, data)
    → api.put(`/domains/${domainId}/records/${recordId}`)

后端：
  PUT /api/domains/:domainId/records/:recordId (routes/records.ts)
    → authMiddleware (认证)
    → 检查写权限
    → db.get() 查询域名和账号
    → createAdapter() 创建 DNS 适配器
    → adapter.updateDomainRecord() 调用服务商 API
    → db.execute() 更新本地数据库
    → logAuditOperation() 记录审计
    → 返回成功
```

***

## 数据库初始化流程

### 完整调用链路

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant API as API 客户端
    participant InitRouter as 初始化路由
    participant Schema as Schema 管理
    participant DB as 数据库

    User->>Frontend: 1. 访问 /setup
    Frontend->>API: 2. 调用 initApi.status()
    API->>InitRouter: 3. GET /api/init/status
    InitRouter->>DB: 4. 检查数据库状态
    DB-->>InitRouter: 返回初始化状态
    InitRouter-->>API: 5. 返回 {initialized, dbInitialized}
    API-->>Frontend: 显示设置向导

    Note over User: 配置数据库

    User->>Frontend: 6. 选择数据库类型并填写配置
    Frontend->>API: 7. 调用 initApi.testDb()
    API->>InitRouter: 8. POST /api/init/test-db
    InitRouter->>DB: 9. 尝试连接数据库
    DB-->>InitRouter: 返回连接结果

    alt 连接失败
        InitRouter-->>API: 返回：连接失败
        API-->>Frontend: 显示错误
        Frontend-->>User: 提示检查配置
    else 连接成功
        InitRouter-->>API: 返回：连接成功
        API-->>Frontend: 显示下一步
        Frontend-->>User: 确认初始化
    end

    User->>Frontend: 10. 点击"初始化数据库"
    Frontend->>API: 11. 调用 initApi.initDatabase()
    API->>InitRouter: 12. POST /api/init/database
    InitRouter->>Schema: 13. initSchemaAsync()
    Schema->>DB: 14. 创建表结构

    Note over DB: 根据数据库类型
    Note over DB: 执行对应 Schema

    alt SQLite
        Schema->>DB: 执行 SQLite Schema
    else MySQL
        Schema->>DB: 执行 MySQL Schema
    else PostgreSQL
        Schema->>DB: 执行 PostgreSQL Schema
    end

    DB-->>Schema: 表创建完成
    Schema-->>InitRouter: 初始化完成
    InitRouter-->>API: 返回：{success: true}
    API-->>Frontend: 显示下一步
    Frontend-->>User: 请求创建管理员

    Note over User: 创建管理员账户

    User->>Frontend: 15. 填写管理员信息
    Frontend->>API: 16. 调用 initApi.createAdmin()
    API->>InitRouter: 17. POST /api/init/admin
    InitRouter->>DB: 18. 检查是否已有用户
    DB-->>InitRouter: 返回用户数

    alt 已有用户
        InitRouter-->>API: 返回 403: 已初始化
        API-->>Frontend: 显示错误
        Frontend-->>User: 提示无需重复创建
    else 无用户
        InitRouter->>DB: 19. INSERT INTO users
        DB-->>InitRouter: 返回用户 ID
        InitRouter->>DB: 20. 生成 runtime_secret
        DB-->>InitRouter: 存储完成
        InitRouter-->>API: 返回：{success: true}
        API-->>Frontend: 初始化完成
        Frontend-->>User: 跳转到登录页
    end
```

### 关键代码路径

```
初始化状态检查:
前端：
  Setup.tsx
    → initApi.status()
    → api.get('/init/status')

后端：
  GET /api/init/status (routes/init.ts)
    → isDbInitialized() (db/database.ts)
      → 检查表是否存在
    → hasUsers() (db/database.ts)
      → SELECT COUNT(*) FROM users
    → 返回 {initialized, dbInitialized, hasUsers}

数据库初始化:
  POST /api/init/database (routes/init.ts)
    → createConnection() (db/database.ts)
      → 根据配置创建连接
    → initSchemaAsync() (db/schema.ts)
      → 根据 DB_TYPE 选择 Schema
      → schemas/sqlite.ts
      → schemas/mysql.ts
      → schemas/postgresql.ts
    → 执行 CREATE TABLE 语句
    → 返回 {success: true}

创建管理员:
  POST /api/init/admin (routes/init.ts)
    → hasUsers() 检查是否已有用户
    → bcrypt.hashSync() 加密密码
    → db.insert() 插入用户记录
    → 生成 runtime_secret
    → 返回 {success: true}
```

***

## API 请求处理流程

### 完整调用链路

```mermaid
graph TB
    Request[HTTP 请求] --> CORS[CORS 中间件]
    CORS --> JSON[express.json 解析]
    JSON --> RequestId[Request ID 生成]
    RequestId --> Logger[请求日志中间件]
    Logger --> CSP[安全策略中间件]
    CSP --> Swagger[Swagger 文档]
    Swagger --> InitCheck[初始化检查中间件]
    
    InitCheck --> InitRoute{路径是否 /api/init/*?}
    InitRoute -->|是 | InitRouter[初始化路由]
    InitRoute -->|否 | AuthCheck{是否保护路由？}
    
    AuthCheck -->|是 | AuthMW[认证中间件]
    AuthCheck -->|否 | PublicRoute[公开路由]
    
    AuthMW --> TokenValid{Token 是否有效？}
    TokenValid -->|无效 | 401[返回 401]
    TokenValid -->|有效 | RoleCheck{权限检查}
    
    RoleCheck -->|需要管理员 | AdminCheck[adminOnly 中间件]
    RoleCheck -->|普通用户 | RouteHandler[路由处理器]
    
    AdminCheck --> IsAdmin{是否管理员？}
    IsAdmin -->|否 | 403[返回 403]
    IsAdmin -->|是 | RouteHandler
    
    RouteHandler --> BusinessLogic[业务逻辑处理]
    BusinessLogic --> Service[调用服务层]
    Service --> DB[DNS 适配器/数据库]
    
    DB --> Success{操作成功？}
    Success -->|是 | Response[返回成功响应]
    Success -->|否 | ErrorHandle[错误处理中间件]
    
    ErrorHandle --> ErrorResponse[返回错误响应]
    401 --> Response
    403 --> Response
    
    Response --> Log[记录响应日志]
    Log --> Client[返回给客户端]
    
    style Request fill:#e1f5ff
    style AuthMW fill:#ffe1e1
    style RouteHandler fill:#e1ffe1
    style Service fill:#fff4e1
    style DB fill:#f0e1ff
    style Response fill:#e1f5ff
```

### 中间件执行顺序

```
1. CORS 中间件 (cors)
   - 处理跨域请求

2. JSON 解析中间件 (express.json)
   - 解析 application/json 请求体

3. Request ID 中间件 (requestIdMiddleware)
   - 生成唯一请求 ID
   - 添加到请求头和响应头

4. 请求日志中间件 (requestLogger)
   - 记录请求开始时间
   - 监听响应完成事件
   - 记录请求方法、路径、状态码、耗时

5. 安全策略中间件
   - Content-Security-Policy
   - X-Content-Type-Options
   - X-Frame-Options
   - X-XSS-Protection
   - Referrer-Policy

6. 初始化检查中间件 (initCheckMiddleware)
   - 检查系统是否已初始化
   - 未初始化时返回 503

7. 认证中间件 (authMiddleware)
   - 提取 Bearer Token
   - 验证 JWT 或 API Token
   - 附加用户信息到 req.user

8. 权限检查中间件 (adminOnly 等)
   - 检查用户角色
   - 验证资源访问权限

9. 路由处理器 (Route Handler)
   - 处理业务逻辑
   - 调用服务层
   - 返回响应

10. 错误处理中间件 (errorHandler)
    - 捕获未处理错误
    - 格式化错误响应
    - 记录错误日志
```

***

## 前端路由与页面加载流程

### 应用启动流程

```mermaid
sequenceDiagram
    participant Browser as 浏览器
    participant React as React 应用
    participant Router as React Router
    participant App as App.tsx
    participant Context as Context  providers
    participant Page as 页面组件
    participant API as API 客户端
    participant Server as 后端服务

    Browser->>React: 1. 加载应用
    React->>App: 2. 渲染根组件
    App->>Context: 3. 初始化 Context
    
    Note over Context: QueryClientProvider
    Note over Context: ThemeProvider
    Note over Context: I18nProvider
    Note over Context: AuthProvider

    Context->>Router: 4. 设置路由
    Router->>Router: 5. 匹配当前路径

    alt 路径 = /setup
        Router->>Page: 6. 渲染 Setup 页面
        Page->>API: 7. 调用 initApi.status()
        API->>Server: 8. GET /api/init/status
        Server-->>API: 返回初始化状态
        API-->>Page: 显示设置向导
    else 路径 = /login
        Router->>Page: 6. 渲染 Login 页面
        Page->>API: 7. 调用 authApi.oauthStatus()
        API->>Server: 8. GET /api/auth/oauth/status
        Server-->>API: 返回 OAuth 配置
        API-->>Page: 显示登录表单
    else 路径 = / (保护路由)
        Router->>Context: 6. 检查 AuthContext
        Context->>Context: 检查 token
        
        alt 有 token
            Context->>API: 7. 调用 authApi.me()
            API->>Server: 8. GET /api/auth/me
            Server-->>API: 返回用户信息
            API-->>Context: 更新 AuthContext
            Context->>Router: 9. 渲染 Layout + 子路由
            Router->>Page: 10. 渲染 Dashboard
        else 无 token
            Context->>Router: 7. 重定向到 /login
            Router->>Page: 8. 渲染 Login 页面
        end
    end

    Page->>Page: 9. useEffect 触发数据加载
    Page->>API: 10. 调用数据 API
    API->>Server: 11. 请求数据
    Server-->>API: 返回数据
    API-->>Page: 更新状态
    Page->>Browser: 12. 渲染完成
```

### 保护路由机制

```
前端路由守卫 (ProtectedRoute.tsx):

1. 检查 AuthContext 中的 user 状态
   - 如果 user === null 且 loading === false
     → 重定向到 /login
   
2. 如果 user 存在
   → 渲染子路由 (Outlet)

3. 管理员路由守卫 (AdminRoute.tsx):
   - 检查 user.role >= 2
   - 如果不是管理员
     → 重定向到 / (403)
   - 如果是
     → 渲染子路由

路由配置 (App.tsx):

<BrowserRouter>
  <Routes>
    {/* 公开路由 */}
    <Route path="/setup" element={<Setup />} />
    <Route path="/login" element={<Login />} />
    <Route path="/oauth/callback" element={<OAuthCallback />} />
    
    {/* 保护路由 */}
    <Route element={<ProtectedRoute />}>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="domains" element={<Domains />} />
        <Route path="domains/:id/records" element={<Records />} />
        
        {/* 管理员路由 */}
        <Route element={<AdminRoute />}>
          <Route path="users" element={<Users />} />
          <Route path="audit" element={<Audit />} />
          <Route path="system" element={<System />} />
        </Route>
      </Route>
    </Route>
    
    {/* 404 重定向 */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
</BrowserRouter>
```

***

## 附录：关键数据流

### 用户登录数据流

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
[后端] db.get() - 查询用户
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

### DNS 记录创建数据流

```
用户填写记录表单
  ↓
前端表单验证
  ↓
recordsApi.create(domainId, recordData)
  ↓
POST /api/domains/:domainId/records
  ↓
[后端] authMiddleware - JWT 验证
  ↓
[后端] 检查域名权限
  ↓
[后端] db.get() - 查询域名信息
  ↓
[后端] db.get() - 查询账号配置
  ↓
[后端] createAdapter() - 创建 DNS 适配器
  ↓
[后端] adapter.addDomainRecord() - 调用服务商 API
  ↓
[后端] db.insert() - 更新本地数据库
  ↓
[后端] logAuditOperation() - 记录审计日志
  ↓
返回 {id}
  ↓
前端刷新记录列表
  ↓
显示成功提示
```

***

## 总结

本文档详细描述了 DNSMgr 项目的前后端调用流程和各模块的交互逻辑，包括：

1. **整体架构**：前后端分离，通过 RESTful API 通信
2. **认证流程**：支持用户名密码、OAuth、2FA 多种认证方式
3. **DNS 管理**：通过适配器模式统一管理多个 DNS 服务商
4. **权限控制**：基于 RBAC 的权限模型，支持团队和域名级别授权
5. **数据流**：完整的请求 - 响应链路，包含中间件处理、业务逻辑、数据库操作

所有流程都遵循以下设计原则：

- **分层架构**：路由层 → 服务层 → 数据访问层
- **统一认证**：所有 API 请求都经过认证中间件
- **审计日志**：关键操作都记录审计日志
- **错误处理**：统一的错误处理中间件
- **限流保护**：登录、注册等接口有限流保护


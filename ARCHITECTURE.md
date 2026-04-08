# DNSMgr 技术架构文档

## 项目概述

DNSMgr 是一个现代化的 DNS 聚合管理平台，支持管理多个 DNS 服务商的域名解析记录。项目采用前后端分离架构，使用 TypeScript 全栈开发。

### 核心特性

- **多 DNS 服务商支持**：支持 18+ 个 DNS 服务商（阿里云、腾讯云、华为云、Cloudflare 等）
- **多用户与团队管理**：基于角色的权限控制（RBAC）
- **完整的 DNS 记录管理**：支持所有常见记录类型的 CRUD 操作
- **审计日志**：完整的操作审计和导出功能
- **高可用支持**：DNS 故障转移和监控
- **现代化 UI**：React 18 + TailwindCSS 响应式设计

***

## 技术栈

### 后端技术栈

| 技术                                     | 用途                             |
| -------------------------------------- | ------------------------------ |
| **Node.js + TypeScript**               | 运行时和开发语言                       |
| **Express.js**                         | Web 框架                         |
| **better-sqlite3 / mysql2 / pg**       | 数据库驱动（SQLite/MySQL/PostgreSQL） |
| **JWT**                                | 身份认证                           |
| **swagger-jsdoc + swagger-ui-express** | API 文档                         |

### 前端技术栈

| 技术                        | 用途       |
| ------------------------- | -------- |
| **React 18**              | UI 框架    |
| **TypeScript**            | 开发语言     |
| **Vite**                  | 构建工具     |
| **TailwindCSS v3**        | CSS 框架   |
| **React Router v6**       | 路由管理     |
| **@tanstack/react-query** | 数据请求和缓存  |
| **Axios**                 | HTTP 客户端 |
| **lucide-react**          | 图标库      |
| **react-i18next**         | 国际化      |

***

## 项目架构

```
DNSMgr/
├── server/                    # 后端服务
│   └── src/
│       ├── config/           # 配置文件
│       │   └── env.ts        # 环境变量加载
│       ├── db/               # 数据库层（新架构）
│       │   ├── business-adapter.ts  # 业务适配器层（函数式 API）
│       │   ├── core/         # 核心抽象层
│       │   │   ├── types.ts  # 统一类型定义
│       │   │   ├── connection.ts  # 连接管理器
│       │   │   └── config.ts    # 配置管理
│       │   ├── drivers/      # 数据库驱动实现
│       │   │   ├── base.ts   # 基础驱动类
│       │   │   ├── mysql.ts  # MySQL 驱动
│       │   │   ├── postgresql.ts  # PostgreSQL 驱动
│       │   │   └── sqlite.ts    # SQLite 驱动
│       │   ├── query/        # SQL 查询层
│       │   │   ├── builder.ts   # 查询构建器
│       │   │   ├── compiler.ts  # SQL 编译器
│       │   │   └── identifier.ts  # 标识符处理
│       │   ├── schema/       # Schema 管理
│       │   │   ├── migration.ts   # 迁移管理
│       │   │   └── registry.ts    # Schema 注册
│       │   ├── schemas/      # 各数据库 Schema 定义
│       │   │   ├── mysql.ts
│       │   │   ├── postgresql.ts
│       │   │   └── sqlite.ts
│       │   ├── database.ts   # 传统连接管理（向后兼容）
│       │   └── index.ts      # 主入口，导出业务适配器函数
│       ├── lib/dns/          # DNS 核心逻辑
│       │   ├── DnsHelper.ts  # DNS 适配器工厂
│       │   ├── DnsInterface.ts # DNS 接口定义
│       │   ├── providerAlias.ts # 服务商别名映射
│       │   └── providers/    # DNS 服务商实现
│       ├── middleware/       # Express 中间件
│       │   ├── auth.ts       # JWT 认证
│       │   ├── errorHandler.ts # 错误处理
│       │   ├── rateLimit.ts  # 限流
│       │   ├── requestLogger.ts # 请求日志
│       │   └── validate.ts   # 请求验证
│       ├── routes/           # API 路由
│       │   ├── auth.ts       # 认证
│       │   ├── users.ts      # 用户管理
│       │   ├── teams.ts      # 团队管理
│       │   ├── accounts.ts   # DNS 账号管理
│       │   ├── domains.ts    # 域名管理
│       │   ├── records.ts    # 解析记录管理
│       │   ├── audit.ts      # 审计日志
│       │   ├── system.ts     # 系统管理
│       │   ├── settings.ts   # 设置
│       │   ├── security.ts   # 安全
│       │   ├── tokens.ts     # API Token
│       │   ├── tunnels.ts    # 隧道
│       │   ├── webauthn.ts   # WebAuthn
│       │   └── init.ts       # 初始化
│       ├── service/          # 业务服务
│       │   ├── audit.ts      # 审计服务
│       │   ├── auditExport.ts # 审计导出
│       │   ├── auditRules.ts # 审计规则
│       │   ├── cnameFlattening.ts # CNAME 扁平化
│       │   ├── emailTemplate.ts # 邮件模板
│       │   ├── emailVerification.ts # 邮件验证
│       │   ├── failover.ts   # 故障转移
│       │   ├── failoverJob.ts # 故障转移任务
│       │   ├── loginLimit.ts # 登录限制
│       │   ├── multiLine.ts  # 多线路解析
│       │   ├── notification.ts # 通知服务
│       │   ├── session.ts    # 会话管理
│       │   ├── smtp.ts       # SMTP 服务
│       │   ├── token.ts      # Token 管理
│       │   ├── totp.ts       # TOTP 双因素
│       │   ├── userPreferences.ts # 用户偏好
│       │   ├── webauthn.ts   # WebAuthn 服务
│       │   └── whoisJob.ts   # WHOIS 查询任务
│       ├── types/            # TypeScript 类型定义
│       │   ├── index.ts      # 通用类型
│       │   └── token.ts      # Token 类型
│       ├── utils/            # 工具函数
│       │   ├── http.ts       # HTTP 工具
│       │   ├── response.ts   # 响应工具
│       │   ├── roles.ts      # 角色权限
│       │   └── validation.ts # 验证工具
│       └── app.ts            # 应用入口
└── client/                   # 前端应用
    └── src/
        ├── api/              # API 客户端
        │   └── index.ts      # API 封装
        ├── assets/           # 静态资源
        ├── components/       # UI 组件
        ├── pages/            # 页面组件
        ├── contexts/         # React Context
        ├── hooks/            # 自定义 Hooks
        ├── i18n/             # 国际化
        ├── styles/           # 样式文件
        ├── utils/            # 工具函数
        ├── App.tsx           # 应用根组件
        └── main.tsx          # 应用入口
```

***

## 核心模块详解

### 1. 数据库层 (Database Layer) - 新架构

数据库层采用**三层架构**设计，严格遵循审核团要求：

```
路由层/Service层/Middleware层 → 业务适配器层 → 数据库抽象层 → 驱动 → 数据库
```

#### 1.1 架构层级

**第一层：业务适配器层 (Business Adapter Layer)**

文件：`db/business-adapter.ts`

**职责**：提供函数式 API，所有数据库操作必须通过此层

**核心函数**：

```typescript
// 查询多行
export async function query<T = QueryResult>(sql: string, params?: unknown[]): Promise<T[]>

// 查询单行
export async function get<T = QueryResult>(sql: string, params?: unknown[]): Promise<T | undefined>

// 执行无返回
export async function execute(sql: string, params?: unknown[]): Promise<void>

// 插入返回ID
export async function insert(sql: string, params?: unknown[]): Promise<number>

// 执行返回影响行数
export async function run(sql: string, params?: unknown[]): Promise<{ changes: number }>

// 获取当前时间函数
export function now(): string

// 获取数据库类型
export function getDbType(): DatabaseType

// 检查是否已连接
export function isDbConnected(): boolean

// 事务支持
export async function withTransaction<T>(fn: (trx: TransactionOperations) => Promise<T>): Promise<T>
```

**业务操作模块**：

```typescript
// 用户操作
export const UserOperations = {
  async getById(id: number): Promise<User | undefined>,
  async getByUsername(username: string): Promise<User | undefined>,
  async getByEmail(email: string): Promise<User | undefined>,
  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<number>,
  async update(id: number, updates: Partial<User>): Promise<void>,
  async delete(id: number): Promise<void>,
  async list(options?: ListOptions): Promise<PaginatedResult<User>>,
}

// DNS 账号操作
export const DnsAccountOperations = { ... }

// 域名操作
export const DomainOperations = { ... }

// 团队操作
export const TeamOperations = { ... }

// 设置操作
export const SettingsOperations = { ... }

// 审计操作
export const AuditOperations = { ... }
```

**使用示例**：

```typescript
import { query, get, execute, insert, run, now, UserOperations } from '../db';

// 查询单行
const user = await get<User>('SELECT * FROM users WHERE id = ?', [userId]);

// 查询多行
const users = await query<User>('SELECT * FROM users WHERE status = ?', ['active']);

// 插入数据
const id = await insert('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);

// 执行更新
await execute('UPDATE users SET last_login = ? WHERE id = ?', [now(), userId]);

// 使用业务操作模块
const user = await UserOperations.getById(1);
```

**第二层：数据库抽象层 (Database Abstraction Layer)**

文件：`db/core/`

**职责**：提供统一的数据库连接和类型系统

```
db/core/
├── types.ts       # 统一类型定义
├── connection.ts  # 连接管理器（单例模式）
└── config.ts      # 配置管理
```

**核心类型**：

```typescript
// 数据库类型
type DatabaseType = 'sqlite' | 'mysql' | 'postgresql'

// 数据库连接接口
interface DatabaseConnection {
  readonly type: DatabaseType
  readonly isConnected: boolean
  
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>
  execute(sql: string, params?: unknown[]): Promise<void>
  insert(sql: string, params?: unknown[]): Promise<number>
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>
  
  beginTransaction(): Promise<Transaction>
  close(): Promise<void>
}
```

**第三层：驱动层 (Drivers Layer)**

文件：`db/drivers/`

**职责**：实现具体数据库的操作逻辑

```
db/drivers/
├── base.ts        # 基础驱动类（模板方法模式）
├── mysql.ts       # MySQL 驱动（连接池）
├── postgresql.ts  # PostgreSQL 驱动（连接池）
└── sqlite.ts      # SQLite 驱动（better-sqlite3）
```

**驱动特性**：

- **MySQL**：连接池管理、慢查询日志、连接池事件监控
- **PostgreSQL**：连接池管理、SSL 支持
- **SQLite**：WAL 模式、外键约束、同步执行包装

#### 1.2 数据库主入口 (`db/index.ts`)

**职责**：统一导出业务适配器函数和类型

```typescript
// ==================== 业务适配器层（推荐）====================
export {
  // 核心函数
  query, get, execute, insert, run, now,
  getDbType, isDbConnected, withTransaction,
  
  // 业务操作模块
  UserOperations, DnsAccountOperations, DomainOperations,
  TeamOperations, SettingsOperations, AuditOperations,
  
  // 类型
  type QueryResult, TransactionOperations,
} from './business-adapter';

// ==================== 初始化函数 ====================
export { initSchema, initSchemaAsync } from './schema';
```

#### 1.3 Schema 管理

**职责**：定义和管理数据库表结构

**多数据库 Schema**：

- SQLite Schema：`schemas/sqlite.ts`
- MySQL Schema：`schemas/mysql.ts`
- PostgreSQL Schema：`schemas/postgresql.ts`

**核心表**：

- `users`：用户表
- `teams`：团队表
- `team_members`：团队成员表
- `dns_accounts`：DNS 账号表
- `domains`：域名表
- `domain_records`：解析记录表
- `audit_logs`：审计日志表
- `runtime_secrets`：运行时密钥表
- `api_tokens`：API Token 表
- `notification_channels`：通知渠道表
- `failover_configs`：故障转移配置表
- `oauth_user_links`：OAuth 用户绑定表
- `user_2fa`：双因素认证表
- `login_attempts`：登录尝试表
- `system_settings`：系统设置表

#### 1.4 数据库初始化流程

```
app.ts:252  → createConnection()     → 创建数据库连接（传统层）
app.ts:255  → connect()              → 初始化业务适配器
app.ts:258  → initSchemaAsync(conn)  → 初始化数据库表结构
```

**initSchemaAsync 函数**：

```typescript
export async function initSchemaAsync(conn, reset = false): Promise<void> {
  if (conn.type === 'sqlite') {
    initSQLiteSchema(conn, reset);
  } else if (conn.type === 'mysql') {
    await initMySQLSchema(conn, reset);
  } else if (conn.type === 'postgresql') {
    await initPostgreSQLSchema(conn, reset);
  }
}
```

***

### 2. DNS 核心层 (DNS Core Layer)

#### 2.1 DNS 接口定义 (`DnsInterface.ts`)

**职责**：定义 DNS 服务商适配器的标准接口

**核心接口**：

```typescript
interface DnsAdapter {
  check(): Promise<boolean>
  getDomainList(page: number, pageSize: number): Promise<PageResult<DomainInfo>>
  getDomainRecords(domain: string, page: number, pageSize: number): Promise<PageResult<DnsRecord>>
  addDomainRecord(domain: string, record: DnsRecord): Promise<string | null>
  updateDomainRecord(domain: string, recordId: string, record: DnsRecord): Promise<boolean>
  deleteDomainRecord(domain: string, recordId: string): Promise<boolean>
  setDomainRecordStatus(domain: string, recordId: string, status: 'enable' | 'disable'): Promise<boolean>
  getError(): string
}
```

#### 2.2 DNS 适配器工厂 (`DnsHelper.ts`)

**职责**：根据服务商类型创建对应的适配器实例

```typescript
// 创建适配器实例
createAdapter(type: string, config: Record<string, string>, domain?: string, zoneId?: string): DnsAdapter

// 获取所有支持的服务商
getProviders(includeStub?: boolean): ProviderInfo[]
```

#### 2.3 DNS 服务商实现 (`providers/`)

**支持的服务商**：阿里云、腾讯云、华为云、Cloudflare 等 18+ 个

***

### 3. 认证与授权层 (Authentication & Authorization)

#### 3.1 JWT 认证中间件 (`middleware/auth.ts`)

**职责**：处理用户认证和权限验证

**认证流程**：

1. 从 `Authorization` 头提取 Bearer Token
2. 首先尝试 JWT 验证
3. JWT 失败后尝试 API Token 验证
4. 验证成功将用户信息附加到 `req.user`

**密钥管理**：

```typescript
// 双层 JWT 密钥结构
JWT_SECRET = BASE_JWT_SECRET + RUNTIME_SECRET
```

#### 3.2 API Token 权限系统 (`service/token.ts`)

**职责**：管理 API Token 的创建、验证和权限控制

**Token 权限维度**：

- **服务权限**：限制可访问的 API 服务
- **域名权限**：限制可操作的域名范围
- **时间权限**：设置 Token 的有效期
- **角色继承**：继承创建者的角色权限

#### 3.3 角色权限系统 (`utils/roles.ts`)

```typescript
const ROLE_USER = 1          // 普通用户
const ROLE_ADMIN = 2         // 管理员
const ROLE_SUPER_ADMIN = 3   // 超级管理员

isSuper(role: number): boolean
isAdmin(role: number): boolean
normalizeRole(role: unknown): number
```

***

### 4. API 路由层 (API Routes)

#### 4.1 路由结构

| 路由                           | 方法                  | 功能        | 权限     |
| ---------------------------- | ------------------- | --------- | ------ |
| `/api/auth/*`                | POST/GET            | 认证相关      | 公开/已认证 |
| `/api/users/*`               | GET/POST/PUT/DELETE | 用户管理      | 管理员    |
| `/api/teams/*`               | GET/POST/PUT/DELETE | 团队管理      | 已认证    |
| `/api/accounts/*`            | GET/POST/PUT/DELETE | DNS 账号管理  | 管理员    |
| `/api/domains/*`             | GET/POST/PUT/DELETE | 域名管理      | 已认证    |
| `/api/domains/:id/records/*` | GET/POST/PUT/DELETE | 解析记录管理    | 已认证    |
| `/api/audit/*`               | GET                 | 审计日志      | 管理员    |
| `/api/system/*`              | GET/POST            | 系统管理      | 超级管理员  |
| `/api/settings/*`            | GET/PUT             | 系统设置      | 管理员    |
| `/api/security/*`            | GET/POST            | 安全设置      | 已认证    |
| `/api/tokens/*`              | GET/POST/DELETE     | API Token | 已认证    |
| `/api/tunnels/*`             | GET/POST/DELETE     | 隧道管理      | 管理员    |
| `/api/init/*`                | POST                | 初始化       | 公开     |

#### 4.2 数据库调用规范

**所有路由必须使用业务适配器函数**：

```typescript
// ✅ 正确 - 使用业务适配器函数
import { query, get, execute, insert, UserOperations } from '../db';

const user = await get<User>('SELECT * FROM users WHERE id = ?', [userId]);
const users = await query<User>('SELECT * FROM users WHERE status = ?', ['active']);
const id = await insert('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);

// ❌ 错误 - 直接使用兼容层
import { getAdapter } from '../db/adapter';  // 已废除
const db = getAdapter();
```

***

### 5. 业务服务层 (Business Services)

#### 5.1 审计服务 (`service/audit.ts`, `auditExport.ts`)

**职责**：记录和管理用户操作日志

**核心函数**：

```typescript
// 记录审计日志
export async function logAuditOperation(
  userId: number,
  action: string,
  domain: string,
  data: unknown
): Promise<void>
```

#### 5.2 故障转移服务 (`service/failover.ts`, `failoverJob.ts`)

**职责**：监控 DNS 记录健康状态并自动切换

#### 5.3 通知服务 (`service/notification.ts`)

**职责**：发送系统通知（邮件、Webhook 等）

#### 5.4 邮件服务 (`service/smtp.ts`)

**职责**：邮件发送和 SMTP 配置管理

#### 5.5 会话管理 (`service/session.ts`)

**职责**：管理用户会话状态

#### 5.6 登录限制 (`service/loginLimit.ts`)

**职责**：防止暴力破解

***

### 6. 前端架构 (Frontend Architecture)

#### 6.1 应用结构 (`App.tsx`)

**路由配置**：

```typescript
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
  </Routes>
</BrowserRouter>
```

#### 6.2 认证上下文 (`contexts/AuthContext.tsx`)

**职责**：管理全局认证状态

#### 6.3 国际化上下文 (`contexts/I18nContext.tsx`)

**支持语言**：英语、简体中文、萌娘中文、日语、西班牙语

#### 6.4 API 客户端 (`api/index.ts`)

**职责**：封装所有 API 请求

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截器：自动添加 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

***

### 7. 中间件系统 (Middleware System)

#### 7.1 错误处理中间件 (`middleware/errorHandler.ts`)

```typescript
export function asyncHandler(fn: RequestHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('[Error]', err)
  res.status(err instanceof HttpError ? err.statusCode : 500).json({
    code: -1,
    msg: err.message || 'Internal Server Error',
  })
}
```

#### 7.2 请求日志中间件 (`middleware/requestLogger.ts`)

```typescript
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`[${req.method}] ${req.originalUrl} ${res.statusCode} ${duration}ms`)
  })
  next()
}
```

#### 7.3 中间件执行顺序

```
1. CORS 中间件
2. JSON 解析中间件
3. Request ID 中间件
4. 请求日志中间件
5. 安全策略中间件
6. 初始化检查中间件
7. 认证中间件
8. 权限检查中间件
9. 路由处理器
10. 错误处理中间件
```

***

### 8. 定时任务系统 (Scheduled Jobs)

#### 8.1 故障转移任务 (`service/failoverJob.ts`)

```typescript
export function startFailoverJob() {
  // 每分钟执行一次
  setInterval(async () => {
    const configs = await getFailoverConfigs()
    for (const config of configs) {
      const isHealthy = await checkHealth(config)
      if (!isHealthy) {
        await triggerFailover(config)
        await sendNotification(config)
      }
    }
  }, 60000)
}
```

#### 8.2 WHOIS 查询任务 (`service/whoisJob.ts`)

```typescript
export function startWhoisJob() {
  // 每天执行一次
  setInterval(async () => {
    const domains = await getAllDomains()
    for (const domain of domains) {
      const whoisInfo = await queryWhois(domain.name)
      await updateDomainExpiry(domain.id, whoisInfo.expiryDate)
    }
  }, 86400000)
}
```

***

## 数据流图

### 用户登录流程

```
用户输入凭证
    ↓
前端调用 /api/auth/login
    ↓
后端验证用户名密码（通过业务适配器层）
    ↓
生成 JWT Token
    ↓
返回 Token 和用户信息
    ↓
前端存储 Token
    ↓
后续请求自动携带 Token
```

### DNS 记录管理流程

```
用户在前端创建记录
    ↓
前端调用 POST /api/domains/:id/records
    ↓
后端验证权限和参数
    ↓
通过业务适配器层查询域名和账号信息
    ↓
创建 DNS 适配器
    ↓
调用服务商 API
    ↓
记录审计日志（通过业务适配器层）
    ↓
返回创建结果
```

***

## 安全特性

### 1. 认证安全

- **JWT 双层密钥**：BASE_JWT_SECRET + RUNTIME_SECRET
- **Token 过期时间**：7 天
- **密码加密**：bcrypt 哈希
- **登录限流**：防止暴力破解
- **双因素认证**：支持 TOTP

### 2. 授权安全

- **RBAC 权限模型**：基于角色的访问控制
- **API Token 权限**：细粒度服务/域名权限
- **团队隔离**：团队资源隔离
- **操作审计**：完整操作日志

### 3. 数据安全

- **敏感信息加密**：DNS 账号配置加密存储
- **CSP 策略**：内容安全策略
- **XSS 防护**：HTTP 头防护
- **SQL 注入防护**：参数化查询（业务适配器层自动处理）

### 4. 网络安全

- **HTTPS 支持**：SSL/TLS 加密
- **限流保护**：防止 DDoS

***

## 性能优化

### 后端优化

- **数据库连接池**：MySQL/PostgreSQL 连接池管理
- **慢查询日志**：监控超过 100ms 的查询
- **索引优化**：关键字段建立索引
- **分页查询**：避免一次性加载大量数据

### 前端优化

- **React Query 缓存**：减少重复请求
- **懒加载**：路由级别代码分割
- **虚拟列表**：大数据量表格优化
- **防抖节流**：搜索输入优化

***

## 监控与日志

### 日志系统

- **请求日志**：所有 HTTP 请求记录
- **错误日志**：异常堆栈追踪
- **审计日志**：用户操作记录
- **性能日志**：慢查询、慢请求

### 业务适配器层日志

```typescript
// 自动记录所有数据库操作
[BusinessAdapter] [DEBUG] Executing get {"sql":"SELECT * FROM users WHERE id = ?","params":[1]}
[BusinessAdapter] [ERROR] Get failed {"sql":"...","error":"...","duration":"44ms"}
```

***

## 总结

DNSMgr 是一个设计良好、架构清晰的 DNS 聚合管理平台。项目采用现代化的技术栈，具有良好的可扩展性和可维护性。

### 核心优势

1. **三层数据库架构**：业务适配器层 → 数据库抽象层 → 驱动层
2. **完善的权限系统**：RBAC + API Token 双重控制
3. **高可用支持**：故障转移和健康监控
4. **现代化 UI**：响应式设计，多语言支持
5. **完整的审计**：操作可追溯

### 数据库架构亮点

- **严格分层**：所有数据库操作必须通过业务适配器层
- **函数式 API**：简洁统一的函数接口
- **多数据库支持**：SQLite/MySQL/PostgreSQL 统一抽象
- **连接池管理**：自动连接池管理和监控
- **事务支持**：完整的事务支持
- **慢查询日志**：自动慢查询检测和日志记录

### 适用场景

- 企业多账号 DNS 管理
- DNS 服务商迁移
- DNS 解析监控和告警
- 自动化 DNS 运维

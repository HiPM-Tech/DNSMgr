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

```C
DNSMgr/
├── server/                    # 后端服务
│   └── src/
│       ├── config/           # 配置文件
│       │   └── env.ts        # 环境变量加载
│       ├── db/               # 数据库层
│       │   ├── schemas/      # 数据库 Schema 定义
│       │   ├── adapter.ts    # 数据库操作适配器
│       │   ├── config.ts     # 数据库配置
│       │   ├── connection.ts # 连接管理
│       │   ├── database.ts   # 数据库连接实现
│       │   ├── init.ts       # 数据库初始化
│       │   └── schema.ts     # Schema 管理
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
        │   ├── AuditLogList.tsx    # 审计日志列表
        │   ├── Avatar.tsx          # 头像
        │   ├── Badge.tsx           # 徽章
        │   ├── ConfirmDialog.tsx   # 确认对话框
        │   ├── Header.tsx          # 头部
        │   ├── Layout.tsx          # 布局
        │   ├── Modal.tsx           # 模态框
        │   ├── NotificationChannels.tsx # 通知渠道
        │   ├── RecordForm.tsx      # 记录表单
        │   ├── Sidebar.tsx         # 侧边栏
        │   ├── Table.tsx           # 表格
        │   ├── ToastContainer.tsx  # Toast 提示
        │   └── TunnelList.tsx      # 隧道列表
        ├── config/           # 配置文件
        │   └── gravatar.ts   # Gravatar 配置
        ├── contexts/         # React Context
        │   ├── AuthContext.tsx     # 认证上下文
        │   ├── I18nContext.tsx     # 国际化上下文
        │   └── ThemeContext.tsx    # 主题上下文
        ├── hooks/            # 自定义 Hooks
        │   ├── useLocalStorage.ts # 本地存储
        │   └── useToast.ts   # Toast Hook
        ├── i18n/             # 国际化
        │   ├── locales/      # 语言包
        │   │   ├── en.json   # 英语
        │   │   ├── zh-CN.json # 简体中文
        │   │   ├── zh-CN-Mesugaki.json # 萌娘中文
        │   │   ├── ja.json   # 日语
        │   │   └── es.json   # 西班牙语
        │   ├── index.ts      # i18n 配置
        │   └── types.ts      # 类型定义
        ├── pages/            # 页面组件
        │   ├── system/       # 系统管理页面
        │   │   ├── DatabaseTab.tsx   # 数据库
        │   │   ├── OverviewTab.tsx   # 概览
        │   │   └── SecurityTab.tsx   # 安全
        │   ├── About.tsx     # 关于
        │   ├── Accounts.tsx  # 账号管理
        │   ├── Audit.tsx     # 审计日志
        │   ├── Dashboard.tsx # 仪表盘
        │   ├── Domains.tsx   # 域名管理
        │   ├── Login.tsx     # 登录
        │   ├── MailSetupModal.tsx # 邮件设置
        │   ├── OAuthCallback.tsx # OAuth 回调
        │   ├── Records.tsx   # 解析记录
        │   ├── Security.tsx  # 安全设置
        │   ├── Settings.tsx  # 设置
        │   ├── Setup.tsx     # 初始化设置
        │   ├── System.tsx    # 系统管理
        │   ├── Teams.tsx     # 团队管理
        │   ├── Tokens.tsx    # API Token
        │   ├── Tunnels.tsx   # 隧道
        │   └── Users.tsx     # 用户管理
        ├── styles/           # 样式文件
        │   ├── globals.css   # 全局样式
        │   └── theme.ts      # 主题配置
        ├── utils/            # 工具函数
        │   ├── auditLogs.ts  # 审计日志工具
        │   ├── gravatar.ts   # Gravatar 工具
        │   ├── md5.ts        # MD5 工具
        │   └── roles.ts      # 角色工具
        ├── App.tsx           # 应用根组件
        ├── App.css           # 应用样式
        ├── ProtectedRoute.tsx # 路由守卫
        ├── index.css         # 入口样式
        └── main.tsx          # 应用入口
```

***

## 核心模块详解

### 1. 数据库层 (Database Layer)

数据库层采用**驱动架构**设计，提供统一的抽象层支持多种数据库。

#### 1.1 核心架构

```
db/
├── core/              # 核心抽象层
│   ├── types.ts       # 统一类型定义
│   ├── connection.ts  # 连接管理器
│   └── config.ts      # 配置管理
├── drivers/           # 数据库驱动实现
│   ├── base.ts        # 基础驱动类
│   ├── mysql.ts       # MySQL 驱动
│   ├── postgresql.ts  # PostgreSQL 驱动
│   ├── sqlite.ts      # SQLite 驱动
│   └── types.ts       # 驱动类型定义
├── query/             # SQL 查询层
│   ├── builder.ts     # 查询构建器
│   ├── compiler.ts    # SQL 编译器
│   └── identifier.ts  # 标识符处理
├── schema/            # Schema 管理
│   ├── migration.ts   # 迁移管理
│   └── registry.ts    # Schema 注册
├── schemas/           # 各数据库 Schema 定义
│   ├── mysql.ts
│   ├── postgresql.ts
│   └── sqlite.ts
├── adapter.ts         # 兼容适配器
└── database.ts        # 传统连接管理（向后兼容）
```

#### 1.2 核心层 (Core Layer)

**职责**：提供统一的类型系统和连接管理

**核心类型** (`core/types.ts`)：

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
  raw(): RawConnection
  close(): Promise<void>
}

// 事务接口
interface Transaction {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>
  execute(sql: string, params?: unknown[]): Promise<void>
  insert(sql: string, params?: unknown[]): Promise<number>
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>
}
```

**连接管理器** (`core/connection.ts`)：

```typescript
// ConnectionManager 单例模式
class ConnectionManager {
  // 连接到数据库
  async connect(config?: DatabaseConfig): Promise<DatabaseConnection>
  
  // 获取当前连接
  getConnection(): DatabaseConnection
  
  // 断开连接
  async disconnect(): Promise<void>
  
  // 事务支持
  async transaction<T>(fn: (trx: Transaction) => Promise<T>): Promise<T>
}

// 便捷函数
function connect(): Promise<DatabaseConnection>
function disconnect(): Promise<void>
function getConnection(): DatabaseConnection
function transaction<T>(fn: (trx: Transaction) => Promise<T>): Promise<T>
```

#### 1.3 驱动层 (Drivers Layer)

**职责**：实现具体数据库的操作逻辑

**基础驱动类** (`drivers/base.ts`)：

```typescript
abstract class BaseDriver implements DatabaseDriver {
  abstract readonly type: DatabaseType
  
  protected config: DriverConfig
  protected _stats: DriverStats
  
  // 通用方法实现（模板方法模式）
  async query<T>(sql: string, params?: unknown[]): Promise<T[]>
  async get<T>(sql: string, params?: unknown[]): Promise<T | undefined>
  async execute(sql: string, params?: unknown[]): Promise<void>
  async insert(sql: string, params?: unknown[]): Promise<number>
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }>
  async beginTransaction(): Promise<Transaction>
  
  // 子类需要实现的具体方法
  protected abstract executeQuery<T>(sql: string, params?: unknown[]): Promise<T[]>
  protected abstract executeSingle<T>(sql: string, params?: unknown[]): Promise<T | undefined>
  protected abstract executeCommand(sql: string, params?: unknown[]): Promise<void>
}
```

**MySQL 驱动** (`drivers/mysql.ts`)：

```typescript
class MySQLDriver extends BaseDriver {
  readonly type = 'mysql'
  private pool: Pool  // mysql2 连接池
  
  constructor(config: MySQLDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig)
    // 初始化连接池
    this.pool = mysql.createPool({ /* 配置 */ })
    // 设置连接池事件监控
    this.setupPoolEvents()
  }
  
  // 连接池事件监控
  private setupPoolEvents(): void {
    this.pool.on('acquire', () => {
      this._stats.acquired++
      console.debug(`[MySQL] Connection acquired`)
    })
    this.pool.on('release', () => {
      this._stats.released++
      console.debug(`[MySQL] Connection released`)
    })
    this.pool.on('enqueue', () => {
      console.warn('[MySQL] Waiting for connection slot')
    })
  }
  
  // 慢查询日志
  private logSlowQuery(sql: string, duration: number): void {
    if (this.config.slowQueryThreshold && duration > this.config.slowQueryThreshold) {
      console.warn(`[MySQL] Slow query (${duration}ms): ${sql.substring(0, 100)}`)
    }
  }
}
```

**PostgreSQL 驱动** (`drivers/postgresql.ts`)：

```typescript
class PostgreSQLDriver extends BaseDriver {
  readonly type = 'postgresql'
  private pool: Pool  // pg 连接池
  
  constructor(config: PostgreSQLDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig)
    // 初始化连接池
    this.pool = new Pool({ /* 配置 */ })
    // 设置事件监控
    this.setupPoolEvents()
  }
}
```

**SQLite 驱动** (`drivers/sqlite.ts`)：

```typescript
class SQLiteDriver extends BaseDriver {
  readonly type = 'sqlite'
  private db: Database.Database  // better-sqlite3 实例
  
  constructor(config: SQLiteDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig)
    // 初始化 SQLite
    this.db = new Database(config.path)
    // 启用 WAL 模式和外键
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }
  
  // SQLite 同步执行（包装为 Promise）
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql)
    return stmt.all(...(params || [])) as T[]
  }
}
```

#### 1.4 查询层 (Query Layer)

**职责**：提供 SQL 构建和编译功能

**SQL 编译器** (`query/compiler.ts`)：

```typescript
class SQLCompiler {
  protected config: CompilerConfig
  
  // 编译 SELECT 查询
  compileSelect(query: SelectQuery): CompiledSQL
  
  // 编译 INSERT 查询
  compileInsert(query: InsertQuery): CompiledSQL
  
  // 编译 UPDATE 查询
  compileUpdate(query: UpdateQuery): CompiledSQL
  
  // 编译 DELETE 查询
  compileDelete(query: DeleteQuery): CompiledSQL
  
  // 编译 JOIN
  protected compileJoin(join: JoinCondition): string
  
  // 编译 WHERE 条件
  protected compileWhere(where: WhereCondition): string
  
  // 编译 ORDER BY
  protected compileOrderBy(order: OrderBy): string
}
```

**查询构建器** (`query/builder.ts`)：

```typescript
class QueryBuilder {
  private state: QueryState
  
  // SELECT 子句
  select(columns: string[]): this
  
  // FROM 子句
  from(table: string): this
  
  // WHERE 条件
  where(column: string, operator: Operator, value: unknown): this
  whereIn(column: string, values: unknown[]): this
  whereBetween(column: string, from: unknown, to: unknown): this
  
  // JOIN 子句
  leftJoin(table: string, left: string, right: string): this
  innerJoin(table: string, left: string, right: string): this
  
  // ORDER BY
  orderBy(column: string, direction: OrderDirection): this
  
  // LIMIT / OFFSET
  limit(limit: number): this
  offset(offset: number): this
  
  // 构建查询
  build(): CompiledSQL
}
```

**标识符处理** (`query/identifier.ts`)：

```typescript
class IdentifierHandler {
  // 根据数据库类型转义标识符
  escape(identifier: string): string {
    switch (this.dbType) {
      case 'mysql':
        return `\`${identifier}\``  // MySQL 使用反引号
      case 'postgresql':
        return `"${identifier}"`    // PostgreSQL 使用双引号
      case 'sqlite':
        return `"${identifier}"`    // SQLite 使用双引号
    }
  }
  
  // 处理保留关键字
  handleKeyword(identifier: string): string {
    const keywords = this.getReservedKeywords()
    if (keywords.has(identifier.toLowerCase())) {
      return this.escape(identifier)
    }
    return identifier
  }
}
```

#### 1.5 适配器层 (Adapter Layer)

**职责**：保持向后兼容，提供平滑迁移

**数据库适配器** (`adapter.ts`)：

```typescript
class DbAdapter {
  private conn: DatabaseConnection
  private compiler: SQLCompiler
  
  constructor(conn: DatabaseConnection, compiler?: SQLCompiler) {
    this.conn = conn
    this.compiler = compiler || getDefaultCompiler()
  }
  
  // 获取适配器实例（单例）
  static getInstance(): DbAdapter | null {
    const conn = getConnection()
    return new DbAdapter(conn)
  }
  
  // SQL 处理（占位符转换、标识符转义）
  private processSql(sql: string): string {
    // PostgreSQL 占位符转换：? → $1, $2...
    if (this.conn.type === 'postgresql') {
      let index = 0
      sql = sql.replace(/\?/g, () => `$${++index}`)
    }
    
    // MySQL 保留关键字转义
    if (this.conn.type === 'mysql') {
      const keywords = ['key', 'value', 'order', 'group']
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi')
        sql = sql.replace(regex, `\`${keyword}\``)
      })
    }
    
    return sql
  }
  
  // 查询方法
  async query(sql: string, params?: unknown[]): Promise<QueryResult[]>
  async get(sql: string, params?: unknown[]): Promise<QueryResult | undefined>
  async execute(sql: string, params?: unknown[]): Promise<void>
  async insert(sql: string, params?: unknown[]): Promise<number>
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }>
  
  // 事务支持
  async transaction<T>(fn: (db: DbAdapter) => Promise<T>): Promise<T>
}

// 便捷函数
function getAdapter(): DbAdapter | null
async function query(sql: string, params?: unknown[]): Promise<QueryResult[]>
async function get(sql: string, params?: unknown[]): Promise<QueryResult | undefined>
async function execute(sql: string, params?: unknown[]): Promise<void>
async function insert(sql: string, params?: unknown[]): Promise<number>
```

#### 1.6 传统连接管理 (`database.ts`)

**职责**：向后兼容的旧版连接管理

**核心函数**：

```typescript
// 创建数据库连接（旧版）
async function createConnection(): Promise<DbConnection>

// 获取当前连接（仅 SQLite）
function getDb(): DbConnection

// 关闭连接
async function closeConnection(): Promise<void>

// 检查数据库是否初始化
async function isDbInitialized(): Promise<boolean>

// 检查是否存在用户
async function hasUsers(): Promise<boolean>
```

#### 1.7 Schema 管理

**职责**：定义和管理数据库表结构

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

**多数据库 Schema**：

- SQLite Schema：`schemas/sqlite.ts`
- MySQL Schema：`schemas/mysql.ts`
- PostgreSQL Schema：`schemas/postgresql.ts`

**迁移管理** (`schema/migration.ts`)：

```typescript
class MigrationManager {
  // 执行迁移
  async migrate(): Promise<void>
  
  // 回滚迁移
  async rollback(): Promise<void>
  
  // 获取迁移历史
  async getMigrations(): Promise<MigrationRecord[]>
}
```

***

### 2. DNS 核心层 (DNS Core Layer)

#### 2.1 DNS 接口定义 (`DnsInterface.ts`)

**职责**：定义 DNS 服务商适配器的标准接口

**核心接口**：

```typescript
interface DnsAdapter {
  // 检查凭证有效性
  check(): Promise<boolean>
  
  // 获取域名列表
  getDomainList(page: number, pageSize: number): Promise<PageResult<DomainInfo>>
  
  // 获取域名记录列表
  getDomainRecords(domain: string, page: number, pageSize: number): Promise<PageResult<DnsRecord>>
  
  // 添加记录
  addDomainRecord(domain: string, record: DnsRecord): Promise<string | null>
  
  // 更新记录
  updateDomainRecord(domain: string, recordId: string, record: DnsRecord): Promise<boolean>
  
  // 删除记录
  deleteDomainRecord(domain: string, recordId: string): Promise<boolean>
  
  // 设置记录状态
  setDomainRecordStatus(domain: string, recordId: string, status: 'enable' | 'disable'): Promise<boolean>
  
  // 获取错误信息
  getError(): string
}
```

#### 2.2 DNS 适配器工厂 (`DnsHelper.ts`)

**职责**：根据服务商类型创建对应的适配器实例

**核心函数**：

```typescript
// 创建适配器实例
createAdapter(
  type: string, 
  config: Record<string, string>, 
  domain?: string, 
  zoneId?: string
): DnsAdapter

// 获取所有支持的服务商
getProviders(includeStub?: boolean): ProviderInfo[]

// 获取特定服务商信息
getProvider(type: string): ProviderInfo | undefined
```

#### 2.3 DNS 服务商实现 (`providers/`)

**支持的服务商**：

- `aliyun.ts`：阿里云 DNS
- `aliyunesa.ts`：阿里云 ESA
- `tenceneo.ts`：腾讯 EdgeOne
- `dnspod.ts`：DNSPod（腾讯云）
- `huawei.ts`：华为云
- `baidu.ts`：百度云
- `huoshan.ts`：火山引擎
- `jdcloud.ts`：京东云
- `west.ts`：西部数码
- `qingcloud.ts`：青云
- `cloudflare.ts`：Cloudflare
- `namesilo.ts`：NameSilo
- `spaceship.ts`：Spaceship
- `powerdns.ts`：PowerDNS
- `bt.ts`：宝塔面板
- `dnshe.ts`：DNSHE
- `dnsla.ts`：DNS.LA
- `rainyun.ts`：雨云
- `http.ts`：HTTP 通用接口

**服务商别名映射** (`providerAlias.ts`)：

```typescript
// 统一不同用户输入的提供商名称
const providerAliasMap: Record<string, string> = {
  'alidns': 'aliyun',
  'tencentcloud': 'dnspod',
  'edgeone': 'tenceneo',
  'baiducloud': 'baidu',
  'huaweicloud': 'huawei',
  'volcengine': 'huoshan',
  'westcn': 'west',
  'pdns': 'powerdns',
}
```

#### 2.4 服务商注册表 (`providers/registry.ts`)

**职责**：注册和管理所有 DNS 服务商的定义信息

**核心结构**：

```typescript
interface ProviderInfo {
  type: string           // 内部类型
  name: string           // 显示名称
  configFields: ProviderConfigField[]  // 配置字段
  capabilities: ProviderCapabilities   // 能力特性
  isStub?: boolean       // 是否为存根实现
}

interface ProviderConfigField {
  key: string            // 字段键
  label: string          // 字段标签
  type: 'text' | 'password' | 'select'  // 字段类型
  required?: boolean     // 是否必填
  options?: { value: string; label: string }[]  // 选项（select 类型）
}

interface ProviderCapabilities {
  supportsProxy?: boolean      // 支持代理（Cloudflare）
  supportsLines?: boolean      // 支持线路
  supportsTTL?: boolean        // 支持 TTL
  supportsPriority?: boolean   // 支持优先级
  // ... 其他能力
}
```

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

// BASE_JWT_SECRET：环境变量或随机生成
// RUNTIME_SECRET：存储在数据库中的运行时密钥
```

**核心函数**：

```typescript
// 认证中间件
authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>

// 管理员权限检查
adminOnly(req: Request, res: Response, next: NextFunction): void

// JWT 签名
signToken(payload: JwtPayload): Promise<string>

// 获取运行时密钥
getRuntimeSecret(): Promise<string>
```

#### 3.2 API Token 权限系统 (`service/token.ts`)

**职责**：管理 API Token 的创建、验证和权限控制

**Token 权限维度**：

- **服务权限**：限制可访问的 API 服务（如 `accounts`、`domains`、`records`）
- **域名权限**：限制可操作的域名范围
- **时间权限**：设置 Token 的有效期
- **角色继承**：继承创建者的角色权限

**核心函数**：

```typescript
// 验证 Token
verifyToken(token: string): Promise<TokenPayload | null>

// 检查服务权限
hasServicePermission(payload: TokenPayload, service: string): boolean

// 检查域名权限
hasDomainPermission(payload: TokenPayload, domainId: number): Promise<boolean>
```

#### 3.3 角色权限系统 (`utils/roles.ts`)

**职责**：管理用户角色和权限

**角色定义**：

```typescript
const ROLE_USER = 1          // 普通用户
const ROLE_ADMIN = 2         // 管理员
const ROLE_SUPER_ADMIN = 3   // 超级管理员

// 角色判断工具
isSuper(role: number): boolean      // 是否超级管理员
isAdmin(role: number): boolean      // 是否管理员
normalizeRole(role: unknown): number // 标准化角色值
```

**权限控制**：

- **超级管理员**：可访问所有资源
- **管理员**：可管理自己创建的资源
- **普通用户**：只能查看自己被授权的资源

***

### 4. API 路由层 (API Routes)

#### 4.1 路由结构

所有路由都遵循 RESTful 风格设计：

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

#### 4.2 核心路由实现

**账号管理** (`accounts.ts`)：

```typescript
// 1. 获取账号列表（支持团队共享）
GET /api/accounts

// 2. 添加账号（验证凭证）
POST /api/accounts
Body: { type, name, config, remark, team_id }

// 3. 获取账号详情
GET /api/accounts/:id

// 4. 更新账号（可选重新验证凭证）
PUT /api/accounts/:id

// 5. 删除账号
DELETE /api/accounts/:id
```

**权限检查逻辑**：

```typescript
// 读取权限
async function canReadAccount(account, userId, role): Promise<boolean> {
  if (isSuper(role)) return true
  if (account.created_by === userId) return true
  if (account.team_id) {
    // 检查是否属于同一团队
    const membership = await adapter.get(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [account.team_id, userId]
    )
    if (membership) return true
  }
  return false
}

// 管理权限
function canManageAccount(account, userId, role): boolean {
  if (isSuper(role)) return true
  return role >= ROLE_ADMIN && account.created_by === userId
}
```

**域名和记录管理** (`domains.ts`, `records.ts`)：

```typescript
// 获取域名列表（从所有账号同步）
GET /api/domains

// 同步域名
POST /api/domains/sync

// 获取域名记录
GET /api/domains/:domainId/records

// 添加记录（自动处理 CNAME 扁平化）
POST /api/domains/:domainId/records

// 更新记录（支持 Cloudflare 代理）
PUT /api/domains/:domainId/records/:recordId

// 删除记录
DELETE /api/domains/:domainId/records/:recordId
```

***

### 5. 业务服务层 (Business Services)

#### 5.1 审计服务 (`service/audit.ts`, `auditExport.ts`)

**职责**：记录和管理用户操作日志

**审计内容**：

- 用户登录/登出
- DNS 记录增删改
- 账号管理操作
- 系统配置变更

**导出功能**：

- 支持 CSV 格式导出
- 支持按时间范围、用户、操作类型过滤
- 支持分页查询

**核心函数**：

```typescript
// 记录审计日志
logAudit(userId: number, action: string, domain?: string, data?: object): Promise<void>

// 获取审计日志
getAuditLogs(page: number, pageSize: number, filters: AuditFilters): Promise<{total, logs}>

// 导出审计日志
exportAuditLogs(filters: AuditFilters): Promise<Buffer>
```

#### 5.2 故障转移服务 (`service/failover.ts`, `failoverJob.ts`)

**职责**：监控 DNS 记录健康状态并自动切换

**工作原理**：

1. 定期执行健康检查（通过 `failoverJob.ts` 定时任务）
2. 检测记录不可用时自动切换到备用记录
3. 发送通知告警
4. 记录切换日志

**核心配置**：

```typescript
interface FailoverConfig {
  recordId: number          // 主记录 ID
  backupRecordId: number    // 备用记录 ID
  checkInterval: number     // 检查间隔（秒）
  threshold: number         // 失败阈值
  protocol: 'http' | 'https' | 'tcp' | 'ping'
  checkTarget: string       // 检查目标
}
```

#### 5.3 通知服务 (`service/notification.ts`)

**职责**：发送系统通知（邮件、Webhook 等）

**通知渠道**：

- SMTP 邮件
- Webhook
- 未来可扩展：短信、钉钉、企业微信等

**通知场景**：

- 故障转移告警
- 登录异常提醒
- 系统维护通知

#### 5.4 邮件服务 (`service/smtp.ts`, `emailTemplate.ts`, `emailVerification.ts`)

**职责**：邮件发送和模板管理

**功能**：

- SMTP 连接管理
- 邮件模板渲染
- 验证码生成和验证
- 邮件发送限流

#### 5.5 会话管理 (`service/session.ts`)

**职责**：管理用户会话状态

**功能**：

- 会话创建和销毁
- 会话过期检查
- 多设备会话管理

#### 5.6 登录限制 (`service/loginLimit.ts`)

**职责**：防止暴力破解

**策略**：

- IP 级别限流
- 用户名级别限流
- 验证码触发机制

#### 5.7 多线路解析 (`service/multiLine.ts`)

**职责**：智能 DNS 线路解析

**线路类型**：

- 运营商线路（电信、联通、移动）
- 地域线路（省份、国家）
- 搜索引擎线路（百度、谷歌）

#### 5.8 CNAME 扁平化 (`service/cnameFlattening.ts`)

**职责**：将 CNAME 记录转换为 A 记录

**应用场景**：

- 根域名 CNAME 支持
- 提升解析速度
- 兼容不支持 CNAME 的 DNS 服务商

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
        <Route path="tunnels" element={<Tunnels />} />
        <Route path="tokens" element={<Tokens />} />
        <Route path="teams" element={<Teams />} />
        <Route path="settings" element={<Settings />} />
        <Route path="about" element={<About />} />
        
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

#### 6.2 认证上下文 (`contexts/AuthContext.tsx`)

**职责**：管理全局认证状态

**核心功能**：

```typescript
interface AuthContextType {
  user: User | null
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  isLoading: boolean
}

// 使用示例
const { user, login, logout } = useAuth()
```

**工作流程**：

1. 应用启动时从 localStorage 恢复 Token
2. 调用 `/api/auth/me` 验证 Token 有效性
3. 登录成功后存储 Token
4. 登出时清除 Token 和用户信息

#### 6.3 国际化上下文 (`contexts/I18nContext.tsx`)

**职责**：管理多语言切换

**支持语言**：

- `en`：英语
- `zh-CN`：简体中文
- `zh-CN-Mesugaki`：萌娘中文
- `ja`：日语
- `es`：西班牙语

**使用示例**：

```typescript
const { t, i18n } = useI18n()
const greeting = t('common.greeting')
await i18n.changeLanguage('zh-CN')
```

#### 6.4 主题上下文 (`contexts/ThemeContext.tsx`)

**职责**：管理深色/浅色主题切换

**功能**：

- 主题切换（light/dark）
- 主题持久化（localStorage）
- 系统主题自动检测

#### 6.5 API 客户端 (`api/index.ts`)

**职责**：封装所有 API 请求

**核心实现**：

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器：自动添加 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：处理 401 错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期，跳转到登录页
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

#### 6.6 通用组件

**布局组件** (`components/Layout.tsx`)：

- 侧边栏导航
- 顶部 Header
- 主内容区域
- 响应式设计

**表格组件** (`components/Table.tsx`)：

- 分页支持
- 排序支持
- 自定义列渲染
- 批量操作

**模态框组件** (`components/Modal.tsx`)：

- 可复用对话框
- 支持自定义内容
- 动画效果

**表单组件** (`components/RecordForm.tsx`)：

- DNS 记录表单
- 动态字段渲染
- 表单验证

***

### 7. 中间件系统 (Middleware System)

#### 7.1 错误处理中间件 (`middleware/errorHandler.ts`)

**职责**：统一处理应用错误

**实现**：

```typescript
// 异步处理器包装
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

// 全局错误处理
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('[Error]', err)
  
  res.status(err instanceof HttpError ? err.statusCode : 500).json({
    code: -1,
    msg: err.message || 'Internal Server Error',
  })
}
```

#### 7.2 请求日志中间件 (`middleware/requestLogger.ts`)

**职责**：记录所有请求日志

**日志内容**：

- 请求 ID（用于追踪）
- 请求方法、路径
- 响应状态码
- 响应时间
- 用户信息

**实现**：

```typescript
// 请求 ID 生成
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = crypto.randomUUID()
  req.headers['x-request-id'] = requestId
  res.setHeader('x-request-id', requestId)
  next()
}

// 请求日志记录
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(
      `[${req.method}] ${req.originalUrl} ${res.statusCode} ${duration}ms`
    )
  })
  
  next()
}
```

#### 7.3 限流中间件 (`middleware/rateLimit.ts`)

**职责**：防止 API 滥用

**策略**：

- 基于 IP 限流
- 令牌桶算法
- 可配置限流规则

#### 7.4 验证中间件 (`middleware/validate.ts`)

**职责**：验证请求参数

**功能**：

- JSON Schema 验证
- 自定义验证规则
- 错误信息格式化

***

### 8. 工具函数 (Utilities)

#### 8.1 HTTP 工具 (`utils/http.ts`, `utils/response.ts`)

**职责**：提供统一的 HTTP 响应格式

**核心函数**：

```typescript
// 发送成功响应
sendSuccess(res: Response, data?: any, statusCode?: number): void

// 发送错误响应
sendError(res: Response, message: string, statusCode?: number): void

// 发送服务器错误
sendServerError(res: Response): void

// 解析分页参数
parsePagination(
  query: ParsedQs, 
  options: { defaultPageSize?: number; maxPageSize?: number }
): { page: number; pageSize: number }

// 解析整数参数
parseInteger(value: unknown): number | null

// 解析字符串参数
getString(value: unknown): string | undefined
```

#### 8.2 角色工具 (`utils/roles.ts`)

**职责**：角色权限判断

**核心函数**：

```typescript
// 判断是否超级管理员
isSuper(role: number): boolean

// 判断是否管理员
isAdmin(role: number): boolean

// 标准化角色值
normalizeRole(role: unknown): number
```

#### 8.3 验证工具 (`utils/validation.ts`)

**职责**：数据验证

**功能**：

- 邮箱格式验证
- 域名格式验证
- IP 地址验证
- 自定义验证规则

***

### 9. 定时任务系统 (Scheduled Jobs)

#### 9.1 故障转移任务 (`service/failoverJob.ts`)

**职责**：定期检查 DNS 记录健康状态

**执行逻辑**：

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

#### 9.2 WHOIS 查询任务 (`service/whoisJob.ts`)

**职责**：定期查询域名过期时间

**执行逻辑**：

```typescript
export function startWhoisJob() {
  // 每天执行一次
  setInterval(async () => {
    const domains = await getAllDomains()
    
    for (const domain of domains) {
      const whoisInfo = await queryWhois(domain.name)
      await updateDomainExpiry(domain.id, whoisInfo.expiryDate)
      
      // 即将过期时发送提醒
      if (isExpiringSoon(whoisInfo.expiryDate)) {
        await sendExpiryNotification(domain)
      }
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
后端验证用户名密码
    ↓
生成 JWT Token（包含用户信息和角色）
    ↓
返回 Token 和用户信息
    ↓
前端存储 Token 到 localStorage
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
根据域名所属账号获取 DNS 适配器
    ↓
调用适配器的 addDomainRecord 方法
    ↓
DNS 服务商 API 执行创建
    ↓
记录审计日志
    ↓
返回创建结果
```

### 故障转移流程

```
定时任务触发
    ↓
获取所有故障转移配置
    ↓
对每个配置执行健康检查
    ↓
检测到主记录失败
    ↓
自动切换到备用记录
    ↓
发送告警通知
    ↓
记录切换日志
```

***

## 部署架构

### Docker 部署

```dockerfile
# 多阶段构建
FROM node:20-alpine AS builder
# 构建前端
WORKDIR /app/client
COPY client/ .
RUN pnpm install && pnpm build

# 构建后端
WORKDIR /app/server
COPY server/ .
RUN pnpm install && pnpm build

# 生产镜像
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/client/dist ./client/dist
RUN npm install --production
CMD ["node", "dist/app.js"]
```

### 环境变量配置

```bash
# 服务端口
PORT=3001

# 运行环境
NODE_ENV=production

# JWT 密钥（必须设置）
JWT_SECRET=your-secret-key-at-least-32-chars

# 数据库配置
DB_TYPE=sqlite                    # sqlite/mysql/postgresql
DB_PATH=./dnsmgr.db               # SQLite 路径
DB_HOST=localhost                 # MySQL/PostgreSQL 主机
DB_PORT=3306                      # MySQL 端口
DB_NAME=dnsmgr                    # 数据库名
DB_USER=root                      # 数据库用户
DB_PASSWORD=password              # 数据库密码
DB_SSL=false                      # 是否启用 SSL
```

***

## 安全特性

### 1. 认证安全

- **JWT 双层密钥**：BASE\_JWT\_SECRET + RUNTIME\_SECRET
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
- **CSRF 防护**：Token 验证

### 4. 网络安全

- **HTTPS 支持**：SSL/TLS 加密
- **SQL 注入防护**：参数化查询
- **限流保护**：防止 DDoS

***

## 扩展性设计

### 添加新的 DNS 服务商

1. **创建适配器**：在 `server/src/lib/dns/providers/` 创建新文件
2. **实现接口**：实现 `DnsAdapter` 接口
3. **注册适配器**：在 `registry.ts` 中注册
4. **更新前端**：在 `Accounts.tsx` 添加服务商选项

### 添加新的 API 端点

1. **创建路由文件**：在 `server/src/routes/` 创建新路由
2. **实现业务逻辑**：调用服务和数据库适配器
3. **添加中间件**：认证、验证、限流等
4. **注册路由**：在 `app.ts` 中注册
5. **添加 API 文档**：Swagger 注释

### 添加新的前端页面

1. **创建页面组件**：在 `client/src/pages/` 创建
2. **添加路由**：在 `App.tsx` 中添加路由配置
3. **添加导航菜单**：在 `Sidebar.tsx` 中添加菜单项
4. **调用 API**：使用 `api/index.ts` 中的客户端

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

### 监控指标

- **API 响应时间**：P95、P99 延迟
- **错误率**：HTTP 5xx 错误比例
- **数据库连接池**：连接使用情况
- **DNS 同步状态**：同步成功率

***

## 总结

DNSMgr 是一个设计良好、架构清晰的 DNS 聚合管理平台。项目采用现代化的技术栈，具有良好的可扩展性和可维护性。

### 核心优势

1. **多 DNS 服务商支持**：统一的抽象接口，易于扩展
2. **完善的权限系统**：RBAC + API Token 双重控制
3. **高可用支持**：故障转移和健康监控
4. **现代化 UI**：响应式设计，多语言支持
5. **完整的审计**：操作可追溯

### 适用场景

- 企业多账号 DNS 管理
- DNS 服务商迁移
- DNS 解析监控和告警
- 自动化 DNS 运维

### 未来发展方向

- 支持更多 DNS 服务商
- 增强监控和告警功能
- 提供公共 API SDK
- 支持 DNS 统计和分析


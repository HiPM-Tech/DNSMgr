# 数据库层架构

## 三层架构设计

DNSMgr 实现了严格的三层数据库架构：

```
路由/Service层 → 业务适配器层 → 数据库抽象层 → 驱动层 → 数据库
```

## 第一层：业务适配器层

**文件位置**: `server/src/db/business-adapter.ts`

**职责**: 提供函数式 API，所有数据库操作必须通过此层

### 核心函数

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

### 业务操作模块

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

### 使用示例

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

## 第二层：数据库抽象层

**文件位置**: `server/src/db/core/`

**职责**: 提供统一的数据库连接和类型系统

### 文件结构

```
db/core/
├── types.ts       # 统一类型定义
├── connection.ts  # 连接管理器（单例模式）
└── config.ts      # 配置管理
```

### 核心类型

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

## 第三层：驱动层

**文件位置**: `server/src/db/drivers/`

**职责**: 实现具体数据库的操作逻辑

### 文件结构

```
db/drivers/
├── base.ts        # 基础驱动类（模板方法模式）
├── mysql.ts       # MySQL 驱动（连接池）
├── postgresql.ts  # PostgreSQL 驱动（连接池）
└── sqlite.ts      # SQLite 驱动（better-sqlite3）
```

### 驱动特性

- **MySQL**: 连接池管理、慢查询日志、连接池事件监控
- **PostgreSQL**: 连接池管理、SSL 支持
- **SQLite**: WAL 模式、外键约束、同步执行包装

## 数据库主入口

**文件位置**: `server/src/db/index.ts`

**职责**: 统一导出业务适配器函数和类型

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

## Schema 管理

**职责**: 定义和管理数据库表结构

### 多数据库 Schema

- SQLite Schema: `schemas/sqlite.ts`
- MySQL Schema: `schemas/mysql.ts`
- PostgreSQL Schema: `schemas/postgresql.ts`

### 核心表

- `users`: 用户表
- `teams`: 团队表
- `team_members`: 团队成员表
- `dns_accounts`: DNS 账号表
- `domains`: 域名表
- `domain_records`: 解析记录表
- `audit_logs`: 审计日志表
- `runtime_secrets`: 运行时密钥表
- `api_tokens`: API Token 表
- `notification_channels`: 通知渠道表
- `failover_configs`: 故障转移配置表
- `oauth_user_links`: OAuth 用户绑定表
- `user_2fa`: 双因素认证表
- `login_attempts`: 登录尝试表
- `system_settings`: 系统设置表

## 数据库初始化流程

```
app.ts:252  → createConnection()     → 创建数据库连接（传统层）
app.ts:255  → connect()              → 初始化业务适配器
app.ts:258  → initSchemaAsync(conn)  → 初始化数据库表结构
```

### initSchemaAsync 函数

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

## 数据库调用规范

### ✅ 正确用法

```typescript
// 使用业务适配器函数
import { query, get, execute, insert, UserOperations } from '../db';

const user = await get<User>('SELECT * FROM users WHERE id = ?', [userId]);
const users = await query<User>('SELECT * FROM users WHERE status = ?', ['active']);
const id = await insert('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
```

### ❌ 错误用法

```typescript
// 禁止直接使用兼容层
import { getAdapter } from '../db/adapter';  // 已废除
const db = getAdapter();
```

## 日志记录

业务适配器层自动记录所有数据库操作：

```
[BusinessAdapter] [DEBUG] Executing get {"sql":"SELECT * FROM users WHERE id = ?","params":[1]}
[BusinessAdapter] [ERROR] Get failed {"sql":"...","error":"...","duration":"44ms"}
```

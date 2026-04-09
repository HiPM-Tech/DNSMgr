# 业务适配器层架构

## 设计理念

业务适配器层是 DNSMgr 项目的核心中枢，所有 SQL 语句都集成在此层中。业务代码**只能通过 API 调用**实现数据库操作，不允许直接编写 SQL 语句。

## 核心原则

1. **SQL 语句集中管理**: 所有 SQL 语句都定义在业务适配器层
2. **API 调用规范**: 业务代码只能通过预定义的 API 函数操作数据库
3. **类型安全**: 使用 TypeScript 泛型确保类型安全
4. **自动日志**: 所有数据库操作自动记录日志
5. **性能监控**: 自动记录操作耗时

## 文件位置

```
server/src/db/business-adapter.ts
```

## 核心 API 函数

### 基础操作函数

```typescript
// 查询多行数据
export async function query<T = QueryResult>(
  sql: string, 
  params?: unknown[]
): Promise<T[]>

// 查询单行数据
export async function get<T = QueryResult>(
  sql: string, 
  params?: unknown[]
): Promise<T | undefined>

// 执行无返回的操作（UPDATE/DELETE）
export async function execute(
  sql: string, 
  params?: unknown[]
): Promise<void>

// 插入数据并返回 ID
export async function insert(
  sql: string, 
  params?: unknown[]
): Promise<number>

// 执行并返回影响行数
export async function run(
  sql: string, 
  params?: unknown[]
): Promise<{ changes: number }>
```

### 工具函数

```typescript
// 获取当前时间（数据库格式）
export function now(): string

// 获取数据库类型
export function getDbType(): DatabaseType

// 检查是否已连接
export function isDbConnected(): boolean

// 事务支持
export async function withTransaction<T>(
  fn: (trx: TransactionOperations) => Promise<T>
): Promise<T>
```

## 业务操作模块

业务适配器层提供预定义的业务操作模块，封装了常见的业务逻辑：

### UserOperations - 用户操作

```typescript
export const UserOperations = {
  // 根据 ID 获取用户
  async getById(id: number): Promise<User | undefined>,
  
  // 根据用户名获取用户
  async getByUsername(username: string): Promise<User | undefined>,
  
  // 根据邮箱获取用户
  async getByEmail(email: string): Promise<User | undefined>,
  
  // 创建用户
  async create(user: Omit<User, 'id' | 'createdAt'>): Promise<number>,
  
  // 更新用户
  async update(id: number, updates: Partial<User>): Promise<void>,
  
  // 删除用户
  async delete(id: number): Promise<void>,
  
  // 获取用户列表（分页）
  async list(options?: ListOptions): Promise<PaginatedResult<User>>,
}
```

### DnsAccountOperations - DNS 账号操作

```typescript
export const DnsAccountOperations = {
  async getById(id: number): Promise<DnsAccount | undefined>,
  async create(account: Omit<DnsAccount, 'id'>): Promise<number>,
  async update(id: number, updates: Partial<DnsAccount>): Promise<void>,
  async delete(id: number): Promise<void>,
  async list(options?: ListOptions): Promise<PaginatedResult<DnsAccount>>,
  async getByProvider(provider: string): Promise<DnsAccount[]>,
}
```

### DomainOperations - 域名操作

```typescript
export const DomainOperations = {
  async getById(id: number): Promise<Domain | undefined>,
  async getByName(name: string): Promise<Domain | undefined>,
  async create(domain: Omit<Domain, 'id'>): Promise<number>,
  async update(id: number, updates: Partial<Domain>): Promise<void>,
  async delete(id: number): Promise<void>,
  async listByAccount(accountId: number): Promise<Domain[]>,
  async syncRecords(domainId: number): Promise<void>,
}
```

### TeamOperations - 团队操作

```typescript
export const TeamOperations = {
  async getById(id: number): Promise<Team | undefined>,
  async create(team: Omit<Team, 'id'>): Promise<number>,
  async update(id: number, updates: Partial<Team>): Promise<void>,
  async delete(id: number): Promise<void>,
  async addMember(teamId: number, userId: number, role: string): Promise<void>,
  async removeMember(teamId: number, userId: number): Promise<void>,
  async listMembers(teamId: number): Promise<TeamMember[]>,
}
```

### SettingsOperations - 设置操作

```typescript
export const SettingsOperations = {
  async get(key: string): Promise<string | undefined>,
  async set(key: string, value: string): Promise<void>,
  async getAll(): Promise<Record<string, string>>,
  async getSMTPConfig(): Promise<SMTPConfig>,
  async getOAuthConfig(): Promise<OAuthConfig>,
}
```

### AuditOperations - 审计操作

```typescript
export const AuditOperations = {
  async log(operation: AuditLog): Promise<void>,
  async list(options?: ListOptions): Promise<PaginatedResult<AuditLog>>,
  async export(startDate: Date, endDate: Date): Promise<string>,
}
```

## 使用规范

### ✅ 正确用法

```typescript
import { UserOperations, DnsAccountOperations } from '../db';

// 使用业务操作模块
const user = await UserOperations.getById(1);
const accounts = await DnsAccountOperations.list();

// 使用基础 API 函数（仅限适配器层内部）
const users = await query<User>('SELECT * FROM users WHERE status = ?', ['active']);
```

### ❌ 错误用法

```typescript
// ❌ 禁止在业务代码中直接编写 SQL
import { query, get, execute } from '../db';
const user = await query<User>('SELECT * FROM users WHERE id = ?', [id]);

// ❌ 禁止使用已废除的兼容层
import { getAdapter } from '../db/adapter';
const db = getAdapter();

// ❌ 禁止直接调用底层 API 函数
const users = await get<User>('SELECT * FROM users WHERE status = ?', ['active']);
```

**严格规定**：`query`, `get`, `execute`, `insert`, `run` 等底层函数只能在业务适配器层内部使用，业务代码必须通过 `UserOperations`, `DomainOperations` 等业务操作模块访问数据库。

## 架构优势

1. **SQL 集中管理**: 所有 SQL 语句都在适配器层，便于维护和优化
2. **类型安全**: TypeScript 泛型确保编译时类型检查
3. **自动日志**: 所有操作自动记录，无需手动添加
4. **性能监控**: 自动记录操作耗时，便于性能分析
5. **事务支持**: 统一的事务管理机制
6. **数据库无关**: 上层业务代码不依赖具体数据库类型

## 日志记录

业务适配器层自动记录所有数据库操作：

```
[BusinessAdapter] [DEBUG] Executing get {"sql":"SELECT * FROM users WHERE id = ?","params":[1]}
[BusinessAdapter] [INFO] Get success {"sql":"...","duration":"15ms"}
[BusinessAdapter] [ERROR] Get failed {"sql":"...","error":"...","duration":"44ms"}
```

## 扩展指南

如需添加新的业务操作模块：

1. 在 `business-adapter.ts` 中定义新的操作模块
2. 在模块内部封装所有 SQL 语句
3. 导出模块供业务代码使用
4. 更新类型定义

示例：

```typescript
// 在 business-adapter.ts 中添加
export const CustomOperations = {
  async customQuery(param: string): Promise<CustomResult[]> {
    return query<CustomResult>(
      'SELECT * FROM custom_table WHERE field = ?',
      [param]
    );
  },
};
```

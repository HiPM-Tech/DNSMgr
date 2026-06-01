# SQLite 启用状态迁移全面检查报告

**生成时间**: 2026-05-28  
**版本**: HiDNS Manager v1.6.3

---

## 📋 检查范围

检查所有数据库迁移代码中是否存在以下问题：
1. ❌ 使用 SQLite 不支持的 `ADD COLUMN IF NOT EXISTS` 语法
2. ⚠️ 依赖 catch 块捕获错误的迁移方式
3. ✅ 正确的先检查后添加模式

---

## 🔍 检查结果

### 1. PostgreSQL Schema (`server/src/db/schemas/postgresql.ts`)

**状态**: ✅ **正确**

PostgreSQL **完全支持** `ADD COLUMN IF NOT EXISTS` 语法，以下用法都是正确的：

```typescript
// Line 118
`ALTER TABLE dns_accounts ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1`,

// Line 136
`ALTER TABLE domains ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1`,

// Line 484, 486, 488
`ALTER TABLE domains ADD COLUMN IF NOT EXISTS apex_expires_at TIMESTAMP`,
`ALTER TABLE domains ADD COLUMN IF NOT EXISTS whois_status TEXT`,
`ALTER TABLE domains ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1`,

// Line 502-506
`ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS encrypted_ns TEXT`,
`ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS plain_ns TEXT`,
`ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS is_poisoned BOOLEAN NOT NULL DEFAULT false`,
`ALTER TABLE ns_monitor_domains ADD COLUMN IF NOT EXISTS domain_name VARCHAR(255) NOT NULL DEFAULT ''`,

// Line 529-530
`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS pinned_domains JSONB DEFAULT '[]'::jsonb`,
`ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS avatar_image TEXT`,
```

**结论**: 无需修改 ✅

---

### 2. MySQL Schema (`server/src/db/schemas/mysql.ts`)

**状态**: ✅ **正确**

MySQL 注释明确指出不支持 `ADD COLUMN IF NOT EXISTS`（第 10 行），代码使用了其他策略：

- Export-Rebuild 模式（dns_accounts.enabled）
- 先检查后添加（addMySQLColumn 辅助函数）

**结论**: 无需修改 ✅

---

### 3. SQLite Schema (`server/src/db/schemas/sqlite.ts`)

**状态**: ⚠️ **注释错误，但代码正确**

#### ❌ 错误注释（第 39-40 行）

```typescript
/**
 * 9. ALTER TABLE ADD COLUMN IF NOT EXISTS 支持良好
 *    - 从 3.2.0 版本开始支持
 */
```

**这是完全错误的！** SQLite **从未支持** `ADD COLUMN IF NOT EXISTS` 语法。

证据：
- Docker 容器报错：`SqliteError: near "EXISTS": syntax error`
- SQLite 官方论坛确认不支持（2022-02-18）
- better-sqlite3 实际测试失败

#### ✅ 实际代码正确

SQLite schema 定义中**没有直接使用** `ADD COLUMN IF NOT EXISTS`，而是通过：
- `handleSQLiteMigrations()` 函数处理迁移
- `addSQLiteColumn()` 辅助函数（带存在检查）

**建议修复**: 更正注释

---

### 4. Business Adapter (`server/src/db/business-adapter.ts`)

**状态**: ✅ **已修复**

#### 修复前（❌ 错误）

```typescript
// Line 3130 (旧代码)
await executeInternal(
  `ALTER TABLE whois_cache ADD COLUMN IF NOT EXISTS status TEXT`, 
  [], 
  { operation: 'Whois.migrateAddStatusColumn', table: 'whois_cache' }
);
```

#### 修复后（✅ 正确）

```typescript
// Line 3128-3147 (新代码)
// SQLite 不支持 ADD COLUMN IF NOT EXISTS，需要先检查
const columns = await queryInternal('PRAGMA table_info(whois_cache)', [], { 
  operation: 'Whois.checkStatusColumn', 
  table: 'whois_cache' 
}) as any[];

const hasStatusColumn = columns.some((col: any) => col.name === 'status');

if (!hasStatusColumn) {
  await executeInternal(
    `ALTER TABLE whois_cache ADD COLUMN status TEXT`, 
    [], 
    { operation: 'Whois.addStatusColumn', table: 'whois_cache' }
  );
  log.info('BusinessAdapter', 'Added status column to whois_cache table');
} else {
  log.debug('BusinessAdapter', 'status column already exists in whois_cache table');
}
```

**两处都已修复**：
- Line 3128-3147 (SQLite 分支)
- Line 3215-3233 (另一处 SQLite 分支)

**结论**: 已完成修复 ✅

---

### 5. Schema Migration (`server/src/db/schema.ts`)

**状态**: ✅ **基本正确，有改进空间**

#### ✅ 正确的部分

1. **addMySQLColumn()** (Line 69-115)
   - 先检查列是否存在
   - 再执行 ALTER TABLE
   - 捕获并忽略重复错误

2. **addSQLiteColumn()** (Line 1014-1044)
   - 调用 `checkSQLiteColumnExists()`
   - 如果存在则跳过
   - 捕获并发错误

3. **checkSQLiteColumnExists()** (Line 983-1009)
   - 使用 `PRAGMA table_info()` 查询
   - 正确处理异步/同步连接
   - 添加了详细日志

#### ⚠️ 需要改进的部分

**init.ts** (Line 293-302):

```typescript
// Migration: Ensure dns_accounts.enabled column exists before creating index
try {
  await conn.execute("ALTER TABLE dns_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
} catch (e) {
  // Ignore "duplicate column" errors - column already exists
  if (e instanceof Error && !e.message.toLowerCase().includes('duplicate column')) {
    throw e;
  }
}
```

**问题**:
- ❌ 直接执行 ALTER TABLE，依赖 catch 捕获错误
- ❌ 性能浪费（每次都尝试执行）
- ❌ 日志污染（每次启动都记录错误）

**建议**: 改用先检查后添加的模式

---

## 📊 统计总结

| 文件 | 位置 | 问题类型 | 状态 | 优先级 |
|------|------|---------|------|--------|
| `schemas/postgresql.ts` | 多处 | 正确使用 PG 语法 | ✅ 正常 | - |
| `schemas/mysql.ts` | - | 正确使用 MySQL 策略 | ✅ 正常 | - |
| `schemas/sqlite.ts` | Line 39-40 | 错误注释 | ⚠️ 需修正 | P2 |
| `business-adapter.ts` | Line 3130, 3210 | 使用不支持的语法 | ✅ 已修复 | P0 |
| `schema.ts` | Line 983-1009 | checkSQLiteColumnExists | ✅ 已优化 | P1 |
| `init.ts` | Line 293-302 | 依赖 catch 捕获错误 | ⚠️ 需改进 | P2 |

---

## 🔧 待修复项

### P2 - 低优先级

#### 1. 修正 SQLite Schema 注释

**文件**: `server/src/db/schemas/sqlite.ts`  
**位置**: Line 39-40

**当前内容**:
```typescript
/**
 * 9. ALTER TABLE ADD COLUMN IF NOT EXISTS 支持良好
 *    - 从 3.2.0 版本开始支持
 */
```

**应改为**:
```typescript
/**
 * 9. ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS
 *    - SQLite 从未支持此语法（包括最新版本）
 *    - 必须先使用 PRAGMA table_info() 检查列是否存在
 *    - 或使用 try-catch 捕获 "duplicate column" 错误
 */
```

#### 2. 改进 init.ts 迁移逻辑

**文件**: `server/src/db/init.ts`  
**位置**: Line 293-302

**当前代码**:
```typescript
try {
  await conn.execute("ALTER TABLE dns_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
} catch (e) {
  if (e instanceof Error && !e.message.toLowerCase().includes('duplicate column')) {
    throw e;
  }
}
```

**建议改为**:
```typescript
// 先检查列是否存在
const columns = await conn.query('PRAGMA table_info(dns_accounts)') as any[];
const hasEnabledColumn = columns.some((col: any) => col.name === 'enabled');

if (!hasEnabledColumn) {
  await conn.execute("ALTER TABLE dns_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
  log.info('DB', 'Added enabled column to dns_accounts table');
} else {
  log.debug('DB', 'enabled column already exists in dns_accounts table');
}
```

**优点**:
- ✅ 避免不必要的 SQL 执行
- ✅ 减少错误日志
- ✅ 提高启动速度
- ✅ 与其他迁移代码保持一致

---

## ✅ 已完成的修复

### P0 - 高优先级（已完成）

1. ✅ **business-adapter.ts** - 修复两处 `ADD COLUMN IF NOT EXISTS` 错误
   - Line 3128-3147
   - Line 3215-3233
   - 改用先检查后添加模式

### P1 - 中优先级（已完成）

2. ✅ **schema.ts** - 优化 `checkSQLiteColumnExists()` 函数
   - 添加详细日志
   - 改进错误处理
   - 区分异步/同步连接

---

## 🎯 核心发现

### 关键事实

1. **SQLite 从未支持 `ADD COLUMN IF NOT EXISTS`**
   - 官方文档未提及此语法
   - 实际测试报语法错误
   - 社区确认不支持

2. **PostgreSQL 完全支持此语法**
   - 可以安全使用
   - 代码中的用法正确

3. **MySQL 不支持此语法**
   - 使用 Export-Rebuild 或先检查后添加
   - 代码策略正确

### 最佳实践

对于 SQLite 迁移，应该：

```typescript
// ✅ 推荐：先检查后添加
const columns = await queryInternal('PRAGMA table_info(table_name)', []);
const hasColumn = columns.some(col => col.name === 'column_name');
if (!hasColumn) {
  await executeInternal('ALTER TABLE table_name ADD COLUMN column_name TYPE', []);
}

// ⚠️ 可接受：捕获错误（用于简单场景）
try {
  await executeInternal('ALTER TABLE table_name ADD COLUMN column_name TYPE', []);
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    throw e;
  }
}

// ❌ 禁止：直接使用 IF NOT EXISTS
await executeInternal('ALTER TABLE table_name ADD COLUMN IF NOT EXISTS column_name TYPE', []);
```

---

## 📝 行动建议

### 立即执行（可选）

虽然 P2 优先级的修复不是紧急的，但建议尽快完成以保持一致性：

1. 修正 `schemas/sqlite.ts` 的错误注释
2. 改进 `init.ts` 的迁移逻辑

### 验证步骤

修复后，重启 Docker 容器并检查日志：

```bash
docker restart DNSmgr
docker logs DNSmgr --tail 100
```

应该看到：
```
✅ [Schema] Starting SQLite migrations...
✅ [Schema] Checking dns_accounts.enabled column (SQLite)...
✅ [BusinessAdapter] Added status column to whois_cache table
✅ [Schema] SQLite migrations completed
```

不应该看到：
```
❌ SqliteError: near "EXISTS": syntax error
❌ SqliteError: no such column: a.enabled
```

---

## 🔗 相关文档

- [SQLite 不支持 ADD COLUMN IF NOT EXISTS](../memory/common_pitfalls_experience.md)
- [DNSMgr SQLite 缺少 enabled 列](../memory/common_pitfalls_experience.md)
- [多数据库启用状态迁移实现](../memory/project_tech_stack.md)
- [数据库迁移系统改进](./database-migration-improvements.md)

---

**报告结束**

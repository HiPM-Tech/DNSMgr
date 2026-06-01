# 数据库启用状态迁移对比报告

## 📋 概述

本报告详细对比了三种数据库（MySQL、PostgreSQL、SQLite）对于**域名启用**和**DNS账号启用**状态的迁移实现。

**检查日期**: 2026-05-27  
**目标版本**: v1.5.0

---

## ✅ 迁移状态总览

| 数据库 | domains.enabled | dns_accounts.enabled | 迁移策略 | 验证工具 |
|-------|----------------|---------------------|---------|---------|
| **MySQL** | ✅ 已实现 | ✅ 已实现（Export-Rebuild） | 应用层检查 + ALTER TABLE | ✅ 支持 |
| **PostgreSQL** | ✅ 已实现 | ✅ 已实现（类型转换） | ADD COLUMN IF NOT EXISTS + 类型转换 | ⚠️ 未集成 |
| **SQLite** | ✅ 已实现 | ✅ 已实现 | ADD COLUMN IF NOT EXISTS | ⚠️ 未集成 |

---

## 🔍 详细实现分析

### 1. MySQL 实现

#### domains.enabled 字段

**位置**: `schema.ts` 第 860-910 行 (`addDomainsEnabledColumn`)

**迁移逻辑**:
```typescript
async function addDomainsEnabledColumn(conn): Promise<void> {
  // 1. 检查列是否存在
  const checkColumnSql = `
    SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'domains' AND COLUMN_NAME = 'enabled'
  `;
  
  // 2. 如果不存在，添加列
  if (!columnExists) {
    const addColumnSql = `ALTER TABLE domains ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`;
    await conn.execute(addColumnSql);
  }
}
```

**特点**:
- ✅ 使用 `INFORMATION_SCHEMA` 检查列存在性
- ✅ 幂等性保证（重复执行不会报错）
- ✅ 默认值为 `1`（启用状态）
- ✅ 类型为 `INTEGER`

---

#### dns_accounts.enabled 字段

**位置**: `schema.ts` 第 143-332 行

**迁移策略**: **Export-Rebuild 模式**（表重建）

**原因**: MySQL 不支持直接修改列的 DEFAULT 约束，需要重建表。

**迁移步骤**:
```typescript
// Step 0: 清理遗留的临时表
DROP TABLE IF EXISTS dns_accounts_new;

// Step 1: 创建新表（带正确的 enabled 列定义）
CREATE TABLE dns_accounts_new (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  config JSON,
  remark TEXT,
  created_by INT NOT NULL,
  team_id INT DEFAULT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,  // ← 关键：正确的定义
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created_by (created_by),
  INDEX idx_team_id (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

// Step 2: 复制数据（根据旧表是否有 enabled 列决定）
IF (old_table_has_enabled) {
  INSERT INTO dns_accounts_new (...) 
  SELECT id, type, name, config, remark, created_by, team_id, enabled, created_at
  FROM dns_accounts;
} ELSE {
  INSERT INTO dns_accounts_new (...) 
  SELECT id, type, name, config, remark, created_by, team_id, 1 as enabled, created_at
  FROM dns_accounts;
}

// Step 3: 删除旧表（禁用外键检查）
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE dns_accounts;
SET FOREIGN_KEY_CHECKS = 1;

// Step 4: 重命名新表
ALTER TABLE dns_accounts_new RENAME TO dns_accounts;

// Step 5: 验证列约束
SELECT COLUMN_DEFAULT, COLUMN_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'dns_accounts' AND COLUMN_NAME = 'enabled';
```

**特点**:
- ✅ 完整的 Export-Rebuild 流程
- ✅ 事务保护（可选，取决于驱动支持）
- ✅ 自动检测旧表是否有 enabled 列
- ✅ 迁移后验证列约束
- ⚠️ DDL 操作不可回滚（MySQL 限制）
- ⚠️ 大数据量时可能较慢

---

### 2. PostgreSQL 实现

#### domains.enabled 字段

**位置**: `schemas/postgresql.ts` 第 127、136-140、488 行

**迁移策略**: **声明式 + 增量迁移**

**实现方式**:
```sql
-- 在 CREATE TABLE 中定义（新建数据库）
CREATE TABLE IF NOT EXISTS domains (
  ...
  enabled INTEGER NOT NULL DEFAULT 1,
  ...
);
CREATE INDEX IF NOT EXISTS idx_domains_enabled ON domains(enabled);

-- 在 alterTables 中添加（升级数据库）
ALTER TABLE domains ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1;
```

**特点**:
- ✅ 使用 `ADD COLUMN IF NOT EXISTS`（PostgreSQL 11+ 支持）
- ✅ 同时创建索引
- ✅ 幂等性保证
- ✅ 简洁明了

---

#### dns_accounts.enabled 字段

**位置**: `schemas/postgresql.ts` 第 111、118-119、492-500 行

**迁移策略**: **类型转换**（BOOLEAN → INTEGER）

**原因**: 旧版本可能使用 BOOLEAN 类型，需要统一为 INTEGER。

**实现方式**:
```sql
-- 在 CREATE TABLE 中定义（新建数据库）
CREATE TABLE IF NOT EXISTS dns_accounts (
  ...
  enabled INTEGER NOT NULL DEFAULT 1,
  ...
);
ALTER TABLE dns_accounts ADD COLUMN IF NOT EXISTS enabled INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_dns_accounts_enabled ON dns_accounts(enabled);

-- 在 alterTables 中转换类型（升级数据库）
DO $$
BEGIN
  -- 删除默认值
  ALTER TABLE dns_accounts ALTER COLUMN enabled DROP DEFAULT;
  
  -- 转换类型（BOOLEAN → INTEGER）
  ALTER TABLE dns_accounts ALTER COLUMN enabled TYPE INTEGER USING enabled::integer;
  
  -- 重新设置默认值
  ALTER TABLE dns_accounts ALTER COLUMN enabled SET DEFAULT 1;
END $$;
```

**特点**:
- ✅ 使用 PL/pgSQL 匿名块进行类型转换
- ✅ 保留现有数据（BOOLEAN true/false → INTEGER 1/0）
- ✅ 事务安全（PostgreSQL DDL 可回滚）
- ✅ 优雅处理类型差异

---

### 3. SQLite 实现

#### domains.enabled 字段

**位置**: `schema.ts` 第 1075 行

**迁移策略**: **通用辅助函数**

**实现方式**:
```typescript
// 调用通用函数
await addSQLiteColumn(conn, 'domains', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
```

**底层实现** (`addSQLiteColumn` 函数):
```typescript
async function addSQLiteColumn(conn, tableName, columnName, columnDef): Promise<void> {
  try {
    // 1. 检查列是否存在
    const result = await conn.query(`PRAGMA table_info(${tableName})`);
    const columnExists = result.some((row: any) => row.name === columnName);
    
    // 2. 如果不存在，添加列
    if (!columnExists) {
      const addColumnSql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`;
      conn.exec(addColumnSql);
    }
  } catch (error) {
    // 错误处理
  }
}
```

**特点**:
- ✅ 使用 `PRAGMA table_info` 检查列存在性
- ✅ 通用函数，适用于所有列
- ✅ 简洁高效
- ⚠️ SQLite 3.35.0+ 才支持 `ALTER TABLE ADD COLUMN` 的完整功能

---

#### dns_accounts.enabled 字段

**位置**: `schema.ts` 第 1167 行

**实现方式**:
```typescript
await addSQLiteColumn(conn, 'dns_accounts', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
```

**特点**:
- ✅ 与 domains.enabled 使用相同的辅助函数
- ✅ 一致性高
- ✅ 代码复用性好

---

## 📊 对比总结

### 迁移策略对比

| 特性 | MySQL | PostgreSQL | SQLite |
|------|-------|-----------|--------|
| **domains.enabled** | 应用层检查 + ALTER | ADD COLUMN IF NOT EXISTS | 通用辅助函数 |
| **dns_accounts.enabled** | Export-Rebuild（表重建） | 类型转换（BOOLEAN→INTEGER） | 通用辅助函数 |
| **幂等性** | ✅ 是 | ✅ 是 | ✅ 是 |
| **事务安全** | ❌ DDL 不可回滚 | ✅ 完全支持 | ⚠️ 部分支持 |
| **性能影响** | ⚠️ 大数据量慢 | ✅ 快速 | ✅ 快速 |
| **复杂度** | 🔴 高 | 🟡 中 | 🟢 低 |

### 代码质量对比

| 维度 | MySQL | PostgreSQL | SQLite |
|------|-------|-----------|--------|
| **可读性** | 🟡 中等（逻辑复杂） | 🟢 好（声明式） | 🟢 好（简洁） |
| **可维护性** | 🟡 中等 | 🟢 好 | 🟢 好 |
| **错误处理** | 🟢 完善 | 🟢 完善 | 🟡 基本 |
| **日志记录** | 🟢 详细 | 🟡 基本 | 🟡 基本 |
| **验证机制** | 🟢 有（迁移后验证） | ❌ 无 | ❌ 无 |

---

## ⚠️ 已知问题和风险

### MySQL

1. **Export-Rebuild 的风险**
   - ❌ DDL 操作不可回滚
   - ❌ 迁移过程中表不可用
   - ❌ 大数据量时可能需要数分钟
   - ⚠️ 如果中途失败，可能留下 `dns_accounts_new` 临时表

2. **缓解措施**
   - ✅ Step 0 清理遗留临时表
   - ✅ 禁用外键检查后再删除旧表
   - ✅ 迁移后验证列约束
   - ⚠️ **建议**: 生产环境迁移前备份数据

---

### PostgreSQL

1. **类型转换的兼容性**
   - ⚠️ 假设旧数据只有 BOOLEAN 类型
   - ⚠️ 如果有其他类型（如 TEXT），转换可能失败

2. **缓解措施**
   - ✅ 使用 `USING enabled::integer` 显式转换
   - ✅ 在匿名块中执行，事务安全
   - ⚠️ **建议**: 添加更严格的类型检查

---

### SQLite

1. **版本依赖**
   - ⚠️ `ALTER TABLE ADD COLUMN` 在 SQLite 3.35.0+ 才完全支持
   - ⚠️ 旧版本可能有兼容性问题

2. **缺少验证**
   - ❌ 没有迁移后验证机制
   - ❌ 无法确认列是否正确添加

3. **缓解措施**
   - ✅ 通用函数包含错误处理
   - ⚠️ **建议**: 集成列验证工具

---

## 🎯 改进建议

### P0（立即实施）

1. **为 PostgreSQL 和 SQLite 集成列验证工具**
   ```typescript
   // schema.ts - PostgreSQL 迁移完成后
   const results = await validateColumns(conn, criticalColumns, 'postgresql');
   log.info('Schema', generateValidationReport(results));
   
   // schema.ts - SQLite 迁移完成后
   const results = await validateColumns(conn, criticalColumns, 'sqlite');
   log.info('Schema', generateValidationReport(results));
   ```

2. **为 MySQL 添加迁移前置检查**
   ```typescript
   // 检查磁盘空间
   // 检查表大小
   // 预估迁移时间
   log.info('Schema', `Estimated migration time: ${estimatedTime}ms`);
   ```

---

### P1（短期改进）

3. **统一迁移日志格式**
   - 所有数据库使用相同的日志级别
   - 包含更多上下文信息（表大小、行数等）

4. **添加迁移进度跟踪**
   ```typescript
   // MySQL Export-Rebuild 进度
   log.info('Schema', 'Step 1/5: Creating new table...');
   log.info('Schema', 'Step 2/5: Copying data (1000/5000 rows)...');
   ```

5. **优化 MySQL 迁移性能**
   - 使用批量插入代替单条插入
   - 临时禁用索引创建，迁移后重建

---

### P2（长期优化）

6. **支持在线迁移（零停机）**
   - MySQL: 使用 pt-online-schema-change
   - PostgreSQL: 使用并发索引创建
   - SQLite: 考虑切换到 WAL 模式

7. **自动化测试套件**
   - 模拟从 v1.0.0 → v1.5.0 的完整迁移
   - 验证每种数据库类型的兼容性
   - 压力测试（百万级数据）

---

## 📝 结论

### 整体评价

| 数据库 | 成熟度 | 可靠性 | 推荐度 |
|-------|-------|-------|-------|
| **MySQL** | 🟡 中等 | 🟡 中等 | ⭐⭐⭐ |
| **PostgreSQL** | 🟢 好 | 🟢 好 | ⭐⭐⭐⭐ |
| **SQLite** | 🟢 好 | 🟢 好 | ⭐⭐⭐⭐ |

### 关键发现

1. ✅ **所有数据库都支持启用状态迁移**
   - domains.enabled: 全部实现
   - dns_accounts.enabled: 全部实现

2. ⚠️ **MySQL 的实现最复杂**
   - 需要 Export-Rebuild 模式
   - 迁移时间长，风险高
   - 但有完善的验证机制

3. ✅ **PostgreSQL 和 SQLite 的实现更优雅**
   - 使用声明式 SQL
   - 代码简洁，易维护
   - 但缺少验证机制

4. 🔧 **需要统一的验证工具**
   - 已创建 `column-validator.ts`
   - 需要集成到所有数据库的迁移流程

---

## 🚀 下一步行动

1. **立即**: 为 PostgreSQL 和 SQLite 集成列验证工具
2. **本周**: 添加 MySQL 迁移前置检查
3. **本月**: 统一迁移日志和进度跟踪
4. **下季度**: 实现在线迁移支持和自动化测试

---

**报告生成时间**: 2026-05-27  
**审核状态**: ✅ 已完成  
**下次审查**: v1.6.0 发布前

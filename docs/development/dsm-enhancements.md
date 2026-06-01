# DSM 增强功能总结

## 🎯 本次更新内容

### 1. 类型定义扩展 (`types/schema.ts`)

新增了三种数据库对象的类型定义：

```typescript
// 触发器定义
export interface TriggerDef {
  name: string;
  table: string;
  timing: 'BEFORE' | 'AFTER';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  body: string;
}

// 视图定义
export interface ViewDef {
  name: string;
  query: string;
}

// 存储过程定义
export interface ProcedureDef {
  name: string;
  parameters?: string;
  body: string;
}
```

并在 `DatabaseSchema` 中添加了可选字段：
```typescript
export interface DatabaseSchema {
  version: string;
  tables: TableDef[];
  triggers?: TriggerDef[];      // ⭐ 新增
  views?: ViewDef[];            // ⭐ 新增
  procedures?: ProcedureDef[];  // ⭐ 新增
}
```

### 2. SchemaReconciler 核心增强

#### A. 列管理增强

**删除列支持**：
```typescript
private async dropColumn(table: string, column: string): Promise<void>
```
- 自动检测并删除在 Schema 定义中不存在的列
- SQLite 需要 3.35.0+ 版本支持

**修改列类型支持**：
```typescript
private async modifyColumnType(table: string, column: string, newType: string): Promise<void>
```
- PostgreSQL: 使用 `ALTER COLUMN ... TYPE`
- MySQL: 使用 `MODIFY COLUMN`
- SQLite: 不支持直接修改，需手动迁移（记录错误日志）

**类型兼容性检查**：
```typescript
private isTypeCompatible(actual: string, expected: string): boolean
```
- 规范化类型名称后对比
- 忽略长度参数差异（如 `VARCHAR(100)` vs `VARCHAR(255)`）

#### B. 触发器管理

```typescript
private async syncTrigger(trigger: TriggerDef, dryRun: boolean): Promise<void>
```

**多数据库适配**：
- **MySQL**: `CREATE OR REPLACE TRIGGER`
- **PostgreSQL**: 先创建函数，再创建触发器
- **SQLite**: `CREATE TRIGGER IF NOT EXISTS`

**存在性检查**：
```typescript
private async triggerExists(triggerName: string): Promise<boolean>
```

#### C. 视图管理

```typescript
private async syncView(view: ViewDef, dryRun: boolean): Promise<void>
```

- 统一使用 `CREATE OR REPLACE VIEW`
- 所有数据库均支持

#### D. 存储过程管理

```typescript
private async syncProcedure(proc: ProcedureDef, dryRun: boolean): Promise<void>
```

**多数据库适配**：
- **MySQL**: `CREATE OR REPLACE PROCEDURE`
- **PostgreSQL**: `CREATE OR REPLACE FUNCTION`
- **SQLite**: 不支持，跳过并记录警告

### 3. 工作流程更新

```typescript
async reconcile(schema: DatabaseSchema, options) {
  // 1. 备份
  await this.backupManager.createBackup(dbType);
  
  // 2. 同步表结构
  for (const tableDef of schema.tables) {
    await this.syncTable(tableDef, dryRun);
  }
  
  // 3. 同步触发器 ⭐ 新增
  if (schema.triggers) {
    for (const trigger of schema.triggers) {
      await this.syncTrigger(trigger, dryRun);
    }
  }
  
  // 4. 同步视图 ⭐ 新增
  if (schema.views) {
    for (const view of schema.views) {
      await this.syncView(view, dryRun);
    }
  }
  
  // 5. 同步存储过程 ⭐ 新增
  if (schema.procedures) {
    for (const proc of schema.procedures) {
      await this.syncProcedure(proc, dryRun);
    }
  }
  
  // 6. 完整性自检
  const check = await this.verify(schema);
}
```

### 4. 列同步逻辑重构

```typescript
private async syncColumns(tableDef: TableDef, dryRun: boolean) {
  // 1. 添加缺失的列
  for (const col of tableDef.columns) {
    if (!existingNames.has(col.name)) {
      await this.addColumn(...);
    }
  }
  
  // 2. 删除多余的列 ⭐ 新增
  for (const existingCol of existingCols) {
    if (!targetNames.has(existingCol.name)) {
      await this.dropColumn(...);
    }
  }
  
  // 3. 修改列类型 ⭐ 新增
  for (const col of tableDef.columns) {
    if (!this.isTypeCompatible(actualType, expectedType)) {
      await this.modifyColumnType(...);
    }
  }
}
```

## 📊 功能对比

| 功能 | 之前 | 现在 |
|------|------|------|
| 创建表 | ✅ | ✅ |
| 添加列 | ✅ | ✅ |
| **删除列** | ❌ | ✅ |
| **修改列类型** | ❌ | ✅ (PG/MySQL) |
| 创建索引 | ✅ | ✅ |
| 添加外键 | ✅ | ✅ |
| **删除外键** | ❌ | ✅ **新增** |
| **管理触发器** | ❌ | ✅ |
| **管理视图** | ❌ | ✅ |
| **管理存储过程** | ❌ | ✅ (除 SQLite) |
| **删除表** | ❌ | ⚠️ **可选** (需显式启用) |

## 🔧 使用示例

### 完整 Schema 定义示例

```typescript
import { DatabaseSchema } from './types/schema';

export const ENHANCED_SCHEMA: DatabaseSchema = {
  version: '2.0.0',
  tables: [
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'id', primaryKey: true, autoIncrement: true },
        { name: 'username', type: 'string', length: 255, nullable: false },
        { name: 'email', type: 'string', length: 255, nullable: false },
        { name: 'status', type: 'number', defaultValue: 1 },
        { name: 'created_at', type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' },
        { name: 'updated_at', type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' },
      ],
      foreignKeys: [
        { column: 'team_id', refTable: 'teams', refColumn: 'id', onDelete: 'CASCADE' }
      ]
    }
  ],
  
  // ⭐ 触发器定义
  triggers: [
    {
      name: 'update_users_updated_at',
      table: 'users',
      timing: 'BEFORE',
      event: 'UPDATE',
      body: 'NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW;'
    }
  ],
  
  // ⭐ 视图定义
  views: [
    {
      name: 'active_users_view',
      query: 'SELECT id, username, email FROM users WHERE status = 1'
    }
  ],
  
  // ⭐ 存储过程定义
  procedures: [
    {
      name: 'get_active_user_count',
      parameters: '(OUT count INT)',
      body: 'BEGIN SELECT COUNT(*) INTO count FROM users WHERE status = 1; END'
    }
  ]
};
```

### 启用删除表功能

```typescript
import { SchemaReconciler } from './schema-reconciler';
import { COMPLETE_SCHEMA } from './schemas/complete-schema';

const reconciler = new SchemaReconciler();

// ⚠️ 危险操作：允许删除不在 Schema 定义中的表
await reconciler.reconcile(COMPLETE_SCHEMA, { 
  dryRun: false,
  allowDropTable: true // 显式启用
});
```

**安全保护**:
- 系统表（如 `schema_versions`）不会被删除
- SQLite 系统表（以 `sqlite_` 开头）受保护
- 所有删除操作都会记录警告日志

## ⚠️ 注意事项

### 1. SQLite 限制

- **DROP COLUMN**: 需要 SQLite 3.35.0+ 版本
- **修改列类型**: 不支持，需要重建表（手动迁移）
- **存储过程**: 完全不支持

### 2. 安全性

- **删除表**仍然被禁止，防止意外数据丢失
- 所有删除操作都会记录警告日志
- Dry-Run 模式可以预览所有变更

### 3. 多数据库兼容性

不同类型的数据库对同一操作的语法不同，DSM 已内置适配逻辑：

| 操作 | SQLite | MySQL | PostgreSQL |
|------|--------|-------|------------|
| 删除列 | `DROP COLUMN` (3.35.0+) | `DROP COLUMN` | `DROP COLUMN` |
| 修改类型 | ❌ 不支持 | `MODIFY COLUMN` | `ALTER COLUMN TYPE` |
| 触发器 | `CREATE TRIGGER` | `CREATE OR REPLACE TRIGGER` | 函数 + 触发器 |
| 视图 | `CREATE OR REPLACE VIEW` | `CREATE OR REPLACE VIEW` | `CREATE OR REPLACE VIEW` |
| 存储过程 | ❌ 不支持 | `CREATE OR REPLACE PROCEDURE` | `CREATE OR REPLACE FUNCTION` |

## 🚀 下一步规划

1. **可视化 Diff 工具**: Web 界面展示即将执行的变更
2. **迁移历史记录**: 记录每次 Schema 变更的详细日志
3. **软删除机制**: 标记废弃列而非直接删除
4. **智能类型转换**: 自动处理数据类型转换的数据迁移

---

**更新时间**: 2026-05-27  
**版本**: DSM 2.0

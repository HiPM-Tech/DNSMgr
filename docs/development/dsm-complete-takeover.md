# HiDNS 声明式数据库模式管理 (DSM) 完全接管方案

## 📋 概述

HiDNS 现已全面采用**声明式数据库模式管理（Declarative Schema Management, DSM）**，实现了对数据库结构的完全自动化同步与维护。

## 🎯 核心原则

### 1. 单一事实来源 (Single Source of Truth)
- **统一 Schema 定义**: `server/src/db/schemas/complete-schema.ts`
- 包含所有业务表、系统表和 MCP 模块表的完整定义
- 不再分散在多个文件或 SQL 脚本中

### 2. 自动同步 (Automatic Reconciliation)
- 启动时自动对比"目标状态"与"当前状态"
- 自动创建缺失的表、列、索引和外键
- 支持 Dry-Run 预览模式

### 3. 安全优先 (Safety First)
- 变更前自动备份数据库
- 完整性自检确保同步成功
- 支持回滚到备份点

### 4. 多库兼容 (Multi-Database Support)
- 通过类型重写策略适配 SQLite、MySQL、PostgreSQL
- 自动处理方言差异（自增主键、布尔值、JSON 等）

## 📁 文件结构

```
server/src/db/
├── schemas/
│   ├── complete-schema.ts    # ⭐ 统一的完整 Schema 定义（唯一入口）
│   ├── index.ts              # 旧 SQL 建表语句（保留用于参考）
│   ├── sqlite.ts             # 旧 SQLite 建表语句（保留用于参考）
│   ├── mysql.ts              # 旧 MySQL 建表语句（保留用于参考）
│   └── postgresql.ts         # 旧 PostgreSQL 建表语句（保留用于参考）
├── types/
│   └── schema.ts             # DSM 类型定义
├── schema-reconciler.ts      # 核心协调引擎
├── backup-manager.ts         # 自动备份管理器
├── init-dsm.ts               # DSM 初始化入口
└── connection.ts             # 数据库连接管理
```

## 🔄 工作流程

### 应用启动流程

```typescript
// server/src/app.ts
await initializeDSM(); // 自动同步所有表结构
```

### 同步过程

1. **加载目标状态**: 从 `complete-schema.ts` 读取完整定义
2. **探测当前状态**: 查询数据库现有表、列、索引
3. **计算差异 (Diff)**: 识别需要创建的表和列
4. **执行备份**: 变更前自动生成备份文件
5. **应用变更**: 
   - 创建缺失的表 (`CREATE TABLE`)
   - 添加缺失的列 (`ALTER TABLE ADD COLUMN`)
   - 创建缺失的索引 (`CREATE INDEX`)
   - 添加外键约束 (`ALTER TABLE ADD CONSTRAINT`)
6. **完整性自检**: 验证所有表结构是否符合定义

## 🛠️ 使用指南

### 添加新表

在 `complete-schema.ts` 中添加表定义：

```typescript
{
  name: 'new_table',
  columns: [
    { name: 'id', type: 'id', primaryKey: true, autoIncrement: true },
    { name: 'name', type: 'string', length: 255, nullable: false },
    { name: 'created_at', type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' },
  ],
  indexes: [
    { name: 'idx_new_table_name', columns: ['name'] }
  ]
}
```

### 添加触发器

```typescript
// 在 complete-schema.ts 的 DatabaseSchema 中添加
triggers: [
  {
    name: 'update_updated_at',
    table: 'users',
    timing: 'BEFORE',
    event: 'UPDATE',
    body: 'NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW;' // PostgreSQL 语法
  }
]
```

### 添加视图

```typescript
views: [
  {
    name: 'active_users_view',
    query: 'SELECT id, username, email FROM users WHERE status = 1'
  }
]
```

### 添加存储过程

```typescript
procedures: [
  {
    name: 'get_user_count',
    parameters: '(OUT count INT)',
    body: 'BEGIN SELECT COUNT(*) INTO count FROM users; END' // MySQL 语法
  }
]
```

### 修改现有表

直接修改 `complete-schema.ts` 中的列定义，DSM 会自动检测并同步。

### 预览变更

```typescript
// 不实际执行，只输出将要执行的 SQL
await initializeDSM(true);
```

### 启用删除表功能（谨慎使用）

```typescript
import { SchemaReconciler } from './db/schema-reconciler';
import { COMPLETE_SCHEMA } from './db/schemas/complete-schema';

const reconciler = new SchemaReconciler();

// ⚠️ 危险操作：允许删除不在 Schema 定义中的表
await reconciler.reconcile(COMPLETE_SCHEMA, { 
  dryRun: false,
  allowDropTable: true // 显式启用删除表功能
});
```

**注意**: 
- `allowDropTable` 默认值为 `false`
- 系统表（如 `schema_versions`）受保护，不会被删除
- 建议先在 Dry-Run 模式下预览变更

## ⚠️ 注意事项

### 1. 支持的操作

DSM **完全支持**以下操作：
- ✅ 创建表 (`CREATE TABLE`)
- ✅ 添加列 (`ALTER TABLE ADD COLUMN`)
- ✅ **删除列** (`ALTER TABLE DROP COLUMN`) - *SQLite 需要 3.35.0+*
- ✅ **修改列类型** (`ALTER COLUMN TYPE`) - *PostgreSQL/MySQL*
- ✅ 创建索引 (`CREATE INDEX`)
- ✅ 添加外键约束 (`ALTER TABLE ADD CONSTRAINT`)
- ✅ **管理触发器** (Triggers) - *自动同步*
- ✅ **管理视图** (Views) - *使用 CREATE OR REPLACE*
- ✅ **管理存储过程** (Procedures/Functions) - *SQLite 除外*

### 2. 不支持的操作

DSM 目前**默认禁用**以下高风险操作（需要显式启用）：
- ⚠️ **删除表** (`DROP TABLE`) - *需设置 `allowDropTable: true`*
- ⚠️ **修改外键约束** - *自动检测并同步*

**安全机制**:
- 删除表功能默认关闭，防止意外数据丢失
- 系统表（如 `schema_versions`）受保护，不会被删除
- 所有删除操作都会记录警告日志
- Dry-Run 模式可以预览所有变更

旧的 SQL 建表语句文件（`sqlite.ts`, `mysql.ts`, `postgresql.ts`）**仅作为参考**，不再被 DSM 使用。如需迁移历史数据，请参考这些文件中的字段定义。

### 3. 历史遗留表

## 🔍 完整性检查

DSM 提供 `verify()` 方法用于验证数据库状态：

```typescript
const reconciler = new SchemaReconciler();
const result = await reconciler.verify(COMPLETE_SCHEMA);

if (!result.valid) {
  console.error('Schema issues:', result.issues);
}
```

## 📊 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.7.2 | 2026-05-27 | 初始完整定义，整合所有业务表、系统表和 MCP 模块 |

## 🚀 未来规划

1. **支持列类型变更**: 安全地修改列类型（如 `VARCHAR(100)` → `VARCHAR(255)`）
2. **支持列删除**: 提供软删除机制，标记废弃列而非直接删除
3. **迁移历史记录**: 记录每次 Schema 变更的详细日志
4. **可视化 Diff 工具**: 提供 Web 界面查看即将执行的变更

## 📞 问题反馈

如发现 DSM 同步异常，请检查：
1. 数据库备份文件 (`data/backups/`)
2. 应用日志中的 `DSM` 标签
3. 完整性检查输出的错误信息

---

**最后更新**: 2026-05-27  
**维护者**: HiDNS Team

# HiDNS 声明式数据库模式管理技术方案

**版本**: 1.0  
**状态**: 规划阶段  
**最后更新**: 2026-05-31

---

## 1. 概述 (Overview)

### 1.1 背景
传统的数据库迁移通常采用“过程式”脚本（Imperative Scripts），即手动编写 `ALTER TABLE` 等 SQL 语句并按顺序执行。这种方式在多数据库兼容（SQLite/MySQL/PostgreSQL）和长期维护中存在以下痛点：
*   **兼容性差**：不同数据库的 SQL 语法差异大，需维护多套脚本。
*   **状态不一致**：漏跑脚本或执行顺序错误会导致数据库结构与预期不符。
*   **维护成本高**：随着项目迭代，迁移脚本数量激增，难以理清最终表结构。

### 1.2 目标
引入**声明式模式管理（Declarative Schema Management）**，通过定义“最终期望的表结构”，由系统自动计算差异并同步数据库。核心目标是：
*   **全量补全**：无论数据库当前处于何种状态，启动时自动对齐至目标结构。
*   **多库兼容**：一份 TypeScript 定义，自动适配三种主流数据库。
*   **类型安全**：利用 TS 类型系统约束 Schema 定义，减少人为错误。

---

## 2. 核心架构 (Architecture)

### 2.1 设计原则：导出并重写 (Export & Rewrite)
我们不直接生成原始 SQL，而是采用**中间层转换**策略：
1.  **Universal Schema (通用定义)**：使用与数据库无关的 TypeScript 接口描述业务模型。
2.  **Transformer (重写器)**：针对不同数据库特性，将通用定义“重写”为特定的 SQL 语句或操作指令。
3.  **Reconciler (协调器)**：负责探测现状、计算 Diff 并执行变更。

### 2.2 组件关系图

```mermaid
graph TD
    A[Schema Definition (TS)] -->|Input| B(Universal Schema)
    B -->|Rewrite for MySQL| C[MySQL Transformer]
    B -->|Rewrite for PG| D[PostgreSQL Transformer]
    B -->|Rewrite for SQLite| E[SQLite Transformer]
    C & D & E -->|SQL / Operations| F[Database Adapter]
    F --> G[(Database)]
    
    H[Reconciler] -->|Detect State| F
    H -->|Apply Changes| F
```

---

## 3. 详细实现 (Implementation Details)

### 3.1 通用 Schema 定义 (`types/schema.ts`)

定义一套抽象的数据类型，屏蔽底层差异。

```typescript
export type PrimitiveType = 
  | 'id'          // 主键 ID
  | 'string'      // 字符串
  | 'number'      // 数字
  | 'boolean'     // 布尔值
  | 'datetime'    // 时间戳
  | 'json';       // JSON 对象

export interface ColumnDef {
  name: string;
  type: PrimitiveType;
  length?: number;        // 仅针对 string
  primaryKey?: boolean;
  autoIncrement?: boolean;
  nullable?: boolean;
  defaultValue?: any;
  unique?: boolean;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  indexes?: { name: string; columns: string[]; unique?: boolean }[];
  foreignKeys?: { 
    column: string; 
    refTable: string; 
    refColumn: string; 
    onDelete?: 'CASCADE' | 'SET NULL'; 
  }[];
}
```

### 3.2 数据库重写器 (Transformers)

#### 3.2.1 PostgreSQL 重写器 (`transformers/pg-rewriter.ts`)
PostgreSQL 拥有最丰富的类型系统，重写时需充分利用其特性（如 `SERIAL`, `JSONB`, `TIMESTAMPTZ`）。

```typescript
export function rewriteColumnForPG(col: ColumnDef): string {
  let sqlType = 'TEXT';
  switch (col.type) {
    case 'id': sqlType = col.autoIncrement ? 'SERIAL' : 'INTEGER'; break;
    case 'number': sqlType = 'BIGINT'; break;
    case 'boolean': sqlType = 'BOOLEAN'; break;
    case 'datetime': sqlType = 'TIMESTAMPTZ'; break;
    case 'json': sqlType = 'JSONB'; break;
    case 'string': sqlType = col.length ? `VARCHAR(${col.length})` : 'TEXT'; break;
  }

  let def = `"${col.name}" ${sqlType}`;
  if (col.primaryKey && !col.autoIncrement) def += ' PRIMARY KEY';
  if (!col.nullable) def += ' NOT NULL';
  if (col.defaultValue !== undefined) {
    def += ` DEFAULT ${formatPGValue(col.defaultValue, col.type)}`;
  }
  return def;
}
```

#### 3.2.2 MySQL 重写器 (`transformers/mysql-rewriter.ts`)
MySQL 需注意 `AUTO_INCREMENT` 的位置以及引擎后缀。

```typescript
export function rewriteColumnForMySQL(col: ColumnDef): string {
  let sqlType = 'VARCHAR(255)';
  switch (col.type) {
    case 'id': sqlType = col.autoIncrement ? 'INT' : 'INT'; break;
    case 'number': sqlType = 'BIGINT'; break;
    case 'boolean': sqlType = 'TINYINT(1)'; break;
    case 'datetime': sqlType = 'DATETIME'; break;
    case 'json': sqlType = 'JSON'; break;
  }

  let def = `\`${col.name}\` ${sqlType}`;
  if (col.primaryKey) def += ' PRIMARY KEY';
  if (col.autoIncrement) def += ' AUTO_INCREMENT';
  if (!col.nullable) def += ' NOT NULL';
  // ... 处理默认值
  return def;
}
```

#### 3.2.3 SQLite 重写器 (`transformers/sqlite-rewriter.ts`)
SQLite 类型较为宽松，重点在于简化逻辑和兼容性。

```typescript
export function rewriteColumnForSQLite(col: ColumnDef): string {
  let sqlType = 'TEXT';
  switch (col.type) {
    case 'id': sqlType = 'INTEGER'; break;
    case 'number': sqlType = 'INTEGER'; break;
    case 'boolean': sqlType = 'INTEGER'; break; // SQLite 无原生 Boolean
    case 'datetime': sqlType = 'DATETIME'; break;
    case 'json': sqlType = 'TEXT'; break; // SQLite 存 JSON 字符串
  }

  let def = `"${col.name}" ${sqlType}`;
  if (col.primaryKey) def += ' PRIMARY KEY';
  if (col.autoIncrement) def += ' AUTOINCREMENT';
  // ... 
  return def;
}
```

### 3.3 协调器 (Reconciler)

协调器负责“感知”与“执行”。

```typescript
export class SchemaReconciler {
  constructor(private dbType: DbType, private adapter: IDatabaseAdapter) {}

  async sync(table: TableDef) {
    const exists = await this.adapter.tableExists(table.name);
    
    if (!exists) {
      // 1. 表不存在：根据重写器生成的 SQL 创建
      const createSQL = this.generateCreateSQL(table);
      await this.adapter.execute(createSQL);
    } else {
      // 2. 表存在：逐列检查并补全
      const existingCols = await this.adapter.getTableColumns(table.name);
      for (const col of table.columns) {
        if (!existingCols.find(c => c.name === col.name)) {
          const addSQL = this.generateAddColumnSQL(table.name, col);
          await this.adapter.execute(addSQL);
        }
      }
    }
  }

  private generateCreateSQL(table: TableDef): string {
    // 根据 dbType 调用对应的 rewrite 函数拼接 SQL
    // ...
  }
}
```

---

## 4. 使用示例 (Usage Example)

### 4.1 定义 MCP 模块 Schema

```typescript
// schemas/mcp-schema.ts
import { TableDef } from '../types/schema';

export const MCP_GLOBAL_CONFIG: TableDef = {
  name: 'mcp_global_config',
  columns: [
    { name: 'id', type: 'id', primaryKey: true, autoIncrement: true },
    { name: 'enabled', type: 'boolean', defaultValue: false },
    { name: 'token_expiry_days', type: 'number', defaultValue: 15 },
    { name: 'created_at', type: 'datetime', defaultValue: 'NOW()' }
  ]
};
```

### 4.2 在初始化流程中接入

```typescript
// db/init.ts
import { createDatabaseAdapter } from './database-adapter';
import { SchemaReconciler } from './schema-reconciler';
import { MCP_GLOBAL_CONFIG } from './schemas/mcp-schema';

export async function initDB() {
  const adapter = createDatabaseAdapter();
  const reconciler = new SchemaReconciler(process.env.DB_TYPE as any, adapter);
  
  console.log('🔄 Syncing MCP schema...');
  await reconciler.sync(MCP_GLOBAL_CONFIG);
  console.log('✅ MCP schema synced.');
}
```

---

## 5. 高级特性 (Advanced Features)

### 5.1 预览模式 (Dry Run)
在执行变更前，输出即将执行的 SQL 供管理员审核。
```typescript
await reconciler.sync(MCP_GLOBAL_CONFIG, { dryRun: true });
// Output: CREATE TABLE IF NOT EXISTS "mcp_global_config" (...)
```

### 5.2 危险操作保护
对于“删除列”或“修改列类型”等可能导致数据丢失的操作，Reconciler 应默认拒绝执行，并要求人工介入。

### 5.3 索引与外键同步
除了列结构，Reconciler 还应负责索引和外键的自动创建与维护，确保查询性能与数据完整性。

---

## 6. 总结 (Conclusion)

通过**导出并重写**的声明式方案，HiDNS 实现了：
1.  **开发效率提升**：新增字段只需修改 TS 定义。
2.  **运维稳定性增强**：消除了迁移脚本遗漏的风险。
3.  **架构灵活性**：轻松支持未来扩展新的数据库类型。

该方案是 HiDNS 迈向现代化、自动化运维的重要一步。

/**
 * HiDNS 声明式 Schema 管理 - 类型定义
 */

export type PrimitiveType = 
  | 'id'          // 主键 ID (自动处理自增)
  | 'string'      // 字符串 (VARCHAR/TEXT)
  | 'number'      // 数字 (INT/BIGINT)
  | 'boolean'     // 布尔值 (TINYINT/BOOLEAN)
  | 'datetime'    // 时间戳 (DATETIME/TIMESTAMPTZ)
  | 'json';       // JSON 对象 (JSON/JSONB/TEXT)

export interface ColumnDef {
  name: string;
  type: PrimitiveType;
  length?: number;        // 仅针对 string 类型有效
  primaryKey?: boolean;
  autoIncrement?: boolean;
  nullable?: boolean;
  defaultValue?: any;
  unique?: boolean;
  comment?: string;
}

export interface IndexDef {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface ForeignKeyDef {
  column: string;
  refTable: string;
  refColumn: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  indexes?: IndexDef[];
  foreignKeys?: ForeignKeyDef[];
  engine?: string; // MySQL 专用，如 InnoDB
  charset?: string; // MySQL 专用，如 utf8mb4
  managed?: boolean; // 是否由 DSM 管理（false 表示只读，不会被删除）
}

/**
 * 触发器定义
 */
export interface TriggerDef {
  name: string;
  table: string;
  timing: 'BEFORE' | 'AFTER';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  body: string; // SQL 函数体
}

/**
 * 视图定义
 */
export interface ViewDef {
  name: string;
  query: string; // SELECT 查询语句
}

/**
 * 存储过程定义
 */
export interface ProcedureDef {
  name: string;
  parameters?: string; // 参数列表，如 '(IN id INT, OUT result VARCHAR(255))'
  body: string; // SQL 函数体
}

export interface DatabaseSchema {
  version?: string; // Schema 版本号（可选，DSM 将根据 Git/Package 动态记录）
  tables: TableDef[];
  triggers?: TriggerDef[]; // 可选：触发器定义
  views?: ViewDef[]; // 可选：视图定义
  procedures?: ProcedureDef[]; // 可选：存储过程定义
}

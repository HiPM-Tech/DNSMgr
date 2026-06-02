export type PrimitiveType = 
  | 'id'
  | 'string'
  | 'text'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'datetime'
  | 'json';

export interface ColumnDef {
  name: string;
  type: PrimitiveType;
  length?: number;
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
  engine?: string;
  charset?: string;
  managed?: boolean;
}

export interface TriggerDef {
  name: string;
  table: string;
  timing: 'BEFORE' | 'AFTER';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  body: string;
}

export interface ViewDef {
  name: string;
  query: string;
}

export interface ProcedureDef {
  name: string;
  parameters?: string;
  body: string;
}

export interface DatabaseSchema {
  version?: string;
  tables: TableDef[];
  triggers?: TriggerDef[];
  views?: ViewDef[];
  procedures?: ProcedureDef[];
}
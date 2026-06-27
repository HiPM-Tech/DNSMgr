/**
 * Generate dialect-specific SQL from COMPLETE_SCHEMA.
 * Replaces the old hand-crafted dialect/*.ts files.
 */
import { DatabaseSchema, ColumnDef, TableDef, IndexDef, ForeignKeyDef } from './types/schema';

interface SchemaDefinition {
  createTables: string[];
  createIndexes: string[];
  alterTables?: string[];
}

type Dialect = 'sqlite' | 'mysql' | 'postgresql';

function mapType(col: ColumnDef, dialect: Dialect): string {
  const base = col.type;
  if (base === 'id') {
    switch (dialect) {
      case 'sqlite': return 'INTEGER PRIMARY KEY AUTOINCREMENT';
      case 'mysql': return 'INT AUTO_INCREMENT PRIMARY KEY';
      case 'postgresql': return 'SERIAL PRIMARY KEY';
    }
  }
  if (base === 'string') {
    const len = col.length ?? 255;
    switch (dialect) {
      case 'sqlite': return 'TEXT';
      case 'mysql': return `VARCHAR(${len})`;
      case 'postgresql': return `VARCHAR(${len})`;
    }
  }
  if (base === 'text') return 'TEXT';
  if (base === 'integer' || base === 'number') {
    switch (dialect) {
      case 'sqlite': return 'INTEGER';
      case 'mysql': return 'INT';
      case 'postgresql': return 'INTEGER';
    }
  }
  if (base === 'boolean') {
    switch (dialect) {
      case 'sqlite': return 'INTEGER';
      case 'mysql': return 'TINYINT(1)';
      case 'postgresql': return 'BOOLEAN';
    }
  }
  if (base === 'datetime') {
    switch (dialect) {
      case 'sqlite': return 'TEXT';
      case 'mysql': return 'DATETIME';
      case 'postgresql': return 'TIMESTAMP';
    }
  }
  if (base === 'json') {
    switch (dialect) {
      case 'sqlite': return 'TEXT';
      case 'mysql': return 'JSON';
      case 'postgresql': return 'JSONB';
    }
  }
  return 'TEXT';
}

function formatDefaultValue(col: ColumnDef, dialect: Dialect): string {
  if (col.defaultValue === undefined || col.defaultValue === null) return '';
  const dv = col.defaultValue;
  if (dv === 'CURRENT_TIMESTAMP') {
    switch (dialect) {
      case 'sqlite': return "DEFAULT (datetime('now'))";
      default: return 'DEFAULT CURRENT_TIMESTAMP';
    }
  }
  if (typeof dv === 'boolean') {
    const val = dv ? (dialect === 'postgresql' ? 'TRUE' : '1') : (dialect === 'postgresql' ? 'FALSE' : '0');
    return `DEFAULT ${val}`;
  }
  if (typeof dv === 'number') return `DEFAULT ${dv}`;
  return `DEFAULT '${dv}'`;
}

function nullableClause(col: ColumnDef): string {
  if (col.primaryKey) return '';
  if (col.nullable === true) return '';
  return 'NOT NULL';
}

function uniqueClause(col: ColumnDef): string {
  return col.unique ? 'UNIQUE' : '';
}

function columnDefSql(col: ColumnDef, dialect: Dialect): string {
  const parts = [col.name, mapType(col, dialect)];
  if (col.primaryKey && col.type !== 'id') {
    parts.push('PRIMARY KEY');
    if (col.autoIncrement) {
      switch (dialect) {
        case 'sqlite': parts.push('AUTOINCREMENT'); break;
        case 'mysql': parts.push('AUTO_INCREMENT'); break;
        case 'postgresql': break;
      }
    }
  }
  const nn = nullableClause(col);
  if (nn) parts.push(nn);
  const uq = uniqueClause(col);
  if (uq) parts.push(uq);
  const dv = formatDefaultValue(col, dialect);
  if (dv) parts.push(dv);
  return parts.join(' ');
}

function foreignKeySql(fk: ForeignKeyDef, tableName: string, dialect: Dialect): string {
  const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
  const onUpdate = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
  if (dialect === 'sqlite') {
    return `FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable}(${fk.refColumn})${onDelete}${onUpdate}`;
  }
  // mysql/pg prefer inline but we still support table-level for multi-column
  return `FOREIGN KEY (${fk.column}) REFERENCES ${fk.refTable}(${fk.refColumn})${onDelete}${onUpdate}`;
}

function createTableSql(table: TableDef, dialect: Dialect): string {
  const columns: string[] = [];
  const constraints: string[] = [];

  for (const col of table.columns) {
    if (col.type === 'id') {
      columns.push(columnDefSql(col, dialect));
      continue;
    }
    columns.push(columnDefSql(col, dialect));
  }

  // Collect inline foreign keys (sqlite uses table-level)
  if (table.foreignKeys) {
    for (const fk of table.foreignKeys) {
      constraints.push(foreignKeySql(fk, table.name, dialect));
    }
  }

  // Collect unique constraints
  for (const col of table.columns) {
    if (col.unique && col.type !== 'id') {
      // Already handled inline above
    }
  }

  // Table-level unique constraints from indexes
  if (table.indexes) {
    for (const idx of table.indexes) {
      if (idx.unique) {
        const cols = idx.columns.join(', ');
        // Check if this is a single-column unique already handled inline
        if (idx.columns.length > 1) {
          constraints.push(`UNIQUE(${cols})`);
        }
      }
    }
  }

  const allParts = [...columns, ...constraints];
  let sql = `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${allParts.join(',\n  ')}\n)`;

  if (dialect === 'mysql') {
    sql += ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
  }

  return sql;
}

function createIndexSql(index: IndexDef, table: string, dialect: Dialect): string {
  const unique = index.unique ? 'UNIQUE ' : '';
  let sql = `CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${table}(${index.columns.join(', ')})`;
  return sql;
}

export function generateSchema(schema: DatabaseSchema, dialect: Dialect): SchemaDefinition {
  const createTables: string[] = [];
  const createIndexes: string[] = [];

  for (const table of schema.tables) {
    createTables.push(createTableSql(table, dialect));

    if (table.indexes) {
      for (const idx of table.indexes) {
        createIndexes.push(createIndexSql(idx, table.name, dialect));
      }
    }
  }

  return { createTables, createIndexes, alterTables: [] };
}

import { COMPLETE_SCHEMA } from './complete-schema';

export const sqliteSchema = generateSchema(COMPLETE_SCHEMA, 'sqlite');
export const mysqlSchema = generateSchema(COMPLETE_SCHEMA, 'mysql');
export const postgresqlSchema = generateSchema(COMPLETE_SCHEMA, 'postgresql');

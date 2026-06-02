import type { ColumnDefinition, TableDefinition, ColumnType } from '../../dal/types';

export class ColumnBuilder {
  private definition: Partial<ColumnDefinition> = {};

  constructor(name: string, type: ColumnType) {
    this.definition.name = name;
    this.definition.type = type;
    this.definition.nullable = true;
  }

  notNull(): this {
    this.definition.nullable = false;
    return this;
  }

  nullable(): this {
    this.definition.nullable = true;
    return this;
  }

  primary(): this {
    this.definition.primary = true;
    this.definition.nullable = false;
    return this;
  }

  unique(): this {
    this.definition.unique = true;
    return this;
  }

  default(value: unknown): this {
    this.definition.default = value;
    return this;
  }

  autoIncrement(): this {
    this.definition.autoIncrement = true;
    return this;
  }

  length(len: number): this {
    this.definition.length = len;
    return this;
  }

  precision(p: number, s?: number): this {
    this.definition.precision = p;
    if (s !== undefined) {
      this.definition.scale = s;
    }
    return this;
  }

  defaultNow(): this {
    this.definition.default = 'now';
    return this;
  }

  build(): ColumnDefinition {
    if (!this.definition.name) {
      throw new Error('Column name is required');
    }
    return this.definition as ColumnDefinition;
  }
}

export const column = {
  string(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'string');
  },

  text(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'text');
  },

  integer(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'integer');
  },

  bigint(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'bigint');
  },

  decimal(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'decimal');
  },

  boolean(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'boolean');
  },

  datetime(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'datetime');
  },

  timestamp(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'timestamp');
  },

  date(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'date');
  },

  json(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'json');
  },

  uuid(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'uuid');
  },

  serial(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'serial').primary();
  },
};

export interface Index {
  name: string;
  columns: string[];
  unique?: boolean;
}

export class TableBuilder<T extends Record<string, ColumnBuilder> = Record<string, ColumnBuilder>> {
  private _name: string;
  private _columns: Map<string, ColumnBuilder> = new Map();
  private _indexes: Index[] = [];
  private _primaryKey: string[] = [];

  constructor(name: string, columns?: T) {
    this._name = name;
    if (columns) {
      Object.entries(columns).forEach(([key, builder]) => {
        this._columns.set(key, builder);
      });
    }
  }

  addColumn(name: string, builder: ColumnBuilder): this {
    this._columns.set(name, builder);
    return this;
  }

  index(columns: string[], name?: string): this {
    const indexName = name || `idx_${this._name}_${columns.join('_')}`;
    this._indexes.push({
      name: indexName,
      columns,
      unique: false,
    });
    return this;
  }

  unique(columns: string[], name?: string): this {
    const indexName = name || `uniq_${this._name}_${columns.join('_')}`;
    this._indexes.push({
      name: indexName,
      columns,
      unique: true,
    });
    return this;
  }

  primaryKey(columns: string[]): this {
    this._primaryKey = columns;
    return this;
  }

  build(): TableDefinition {
    const columnDefs: ColumnDefinition[] = [];

    for (const [name, builder] of this._columns) {
      const def = builder.build();
      if (def.name !== name) {
        def.name = name;
      }
      columnDefs.push(def);
    }

    return {
      name: this._name,
      columns: columnDefs,
      indexes: this._indexes,
      primaryKey: this._primaryKey.length > 0 ? this._primaryKey : undefined,
    };
  }

  getTableName(): string {
    return this._name;
  }

  getColumns(): ColumnDefinition[] {
    return Array.from(this._columns.values()).map(b => b.build());
  }

  get $inferType(): Record<string, unknown> {
    const type: Record<string, unknown> = {};
    for (const [name, builder] of this._columns) {
      const def = builder.build();
      switch (def.type) {
        case 'string':
        case 'text':
        case 'uuid':
        case 'date':
        case 'datetime':
        case 'timestamp':
        case 'json':
          type[name] = '' as string;
          break;
        case 'integer':
        case 'bigint':
        case 'serial':
          type[name] = 0 as number;
          break;
        case 'decimal':
          type[name] = 0 as number;
          break;
        case 'boolean':
          type[name] = true as boolean;
          break;
        default:
          type[name] = undefined;
      }
    }
    return type;
  }
}

class TableRegistry {
  private tables: Map<string, TableBuilder> = new Map();

  register<T extends Record<string, ColumnBuilder>>(
    name: string,
    columns: T
  ): TableBuilder<T> {
    const builder = new TableBuilder<T>(name, columns);
    this.tables.set(name, builder);
    return builder;
  }

  get(name: string): TableBuilder | undefined {
    return this.tables.get(name);
  }

  has(name: string): boolean {
    return this.tables.has(name);
  }

  getTableNames(): string[] {
    return Array.from(this.tables.keys());
  }

  getAllDefinitions(): TableDefinition[] {
    return Array.from(this.tables.values()).map(t => t.build());
  }

  clear(): void {
    this.tables.clear();
  }
}

export const registry = new TableRegistry();

export function defineTable<T extends Record<string, ColumnBuilder>>(
  name: string,
  columns: T
): TableBuilder<T> {
  return registry.register(name, columns);
}

export function getTable(name: string): TableBuilder | undefined {
  return registry.get(name);
}

export function createTable(name: string): TableBuilder {
  return new TableBuilder(name);
}

export function generateCreateTableSQL(
  definition: TableDefinition,
  type: 'mysql' | 'postgresql' | 'sqlite'
): string {
  const { createCompiler } = require('../query/compiler');
  const compiler = createCompiler(type);

  const columns: string[] = definition.columns.map(col => {
    let sql = compiler.escapeIdentifier(col.name);
    sql += ` ${compiler.mapType(col.type, col)}`;

    if (!col.nullable) {
      sql += ' NOT NULL';
    }

    if (col.unique && !col.primary) {
      sql += ' UNIQUE';
    }

    if (col.default !== undefined) {
      if (col.default === 'now') {
        sql += ` DEFAULT ${compiler.now()}`;
      } else {
        sql += ` DEFAULT ${JSON.stringify(col.default)}`;
      }
    }

    return sql;
  });

  if (definition.primaryKey && definition.primaryKey.length > 0) {
    const pkColumns = definition.primaryKey.map(c => compiler.escapeIdentifier(c)).join(', ');
    columns.push(`PRIMARY KEY (${pkColumns})`);
  }

  let sql = `CREATE TABLE ${compiler.escapeIdentifier(definition.name)} (\n  `;
  sql += columns.join(',\n  ');
  sql += '\n)';

  return sql;
}

export function generateCreateIndexSQL(
  tableName: string,
  index: Index,
  type: 'mysql' | 'postgresql' | 'sqlite'
): string {
  const { createCompiler } = require('../query/compiler');
  const compiler = createCompiler(type);

  const unique = index.unique ? 'UNIQUE ' : '';
  const columns = index.columns.map(c => compiler.escapeIdentifier(c)).join(', ');

  return `CREATE ${unique}INDEX ${compiler.escapeIdentifier(index.name)} ON ${compiler.escapeIdentifier(tableName)} (${columns})`;
}
/**
 * 表注册中心
 * 管理数据库表定义和类型推断
 */

import type { ColumnDefinition, TableDefinition, ColumnType } from '../core/types';

/** 列构建器 */
export class ColumnBuilder {
  private definition: Partial<ColumnDefinition> = {};

  constructor(name: string, type: ColumnType) {
    this.definition.name = name;
    this.definition.type = type;
    this.definition.nullable = true;
  }

  /** 设置非空 */
  notNull(): this {
    this.definition.nullable = false;
    return this;
  }

  /** 设置可空 */
  nullable(): this {
    this.definition.nullable = true;
    return this;
  }

  /** 设置主键 */
  primary(): this {
    this.definition.primary = true;
    this.definition.nullable = false;
    return this;
  }

  /** 设置唯一 */
  unique(): this {
    this.definition.unique = true;
    return this;
  }

  /** 设置默认值 */
  default(value: unknown): this {
    this.definition.default = value;
    return this;
  }

  /** 设置自增 */
  autoIncrement(): this {
    this.definition.autoIncrement = true;
    return this;
  }

  /** 设置长度（用于字符串类型） */
  length(len: number): this {
    this.definition.length = len;
    return this;
  }

  /** 设置精度和小数位（用于数值类型） */
  precision(p: number, s?: number): this {
    this.definition.precision = p;
    if (s !== undefined) {
      this.definition.scale = s;
    }
    return this;
  }

  /** 设置默认当前时间 */
  defaultNow(): this {
    this.definition.default = 'now';
    return this;
  }

  /** 构建列定义 */
  build(): ColumnDefinition {
    if (!this.definition.name) {
      throw new Error('Column name is required');
    }
    return this.definition as ColumnDefinition;
  }
}

/** 列类型构建器 */
export const column = {
  /** 字符串类型 */
  string(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'string');
  },

  /** 文本类型 */
  text(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'text');
  },

  /** 整数类型 */
  integer(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'integer');
  },

  /** 大整数类型 */
  bigint(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'bigint');
  },

  /** 小数类型 */
  decimal(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'decimal');
  },

  /** 布尔类型 */
  boolean(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'boolean');
  },

  /** 日期时间类型 */
  datetime(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'datetime');
  },

  /** 时间戳类型 */
  timestamp(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'timestamp');
  },

  /** 日期类型 */
  date(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'date');
  },

  /** JSON 类型 */
  json(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'json');
  },

  /** UUID 类型 */
  uuid(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'uuid');
  },

  /** 自增序列类型 */
  serial(name: string): ColumnBuilder {
    return new ColumnBuilder(name, 'serial').primary();
  },
};

/** 索引定义 */
export interface Index {
  name: string;
  columns: string[];
  unique?: boolean;
}

/** 表构建器 */
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

  /** 添加列 */
  addColumn(name: string, builder: ColumnBuilder): this {
    this._columns.set(name, builder);
    return this;
  }

  /** 添加索引 */
  index(columns: string[], name?: string): this {
    const indexName = name || `idx_${this._name}_${columns.join('_')}`;
    this._indexes.push({
      name: indexName,
      columns,
      unique: false,
    });
    return this;
  }

  /** 添加唯一索引 */
  unique(columns: string[], name?: string): this {
    const indexName = name || `uniq_${this._name}_${columns.join('_')}`;
    this._indexes.push({
      name: indexName,
      columns,
      unique: true,
    });
    return this;
  }

  /** 设置主键 */
  primaryKey(columns: string[]): this {
    this._primaryKey = columns;
    return this;
  }

  /** 构建表定义 */
  build(): TableDefinition {
    const columnDefs: ColumnDefinition[] = [];

    for (const [name, builder] of this._columns) {
      const def = builder.build();
      // 如果列名与构建器中的不同，使用构建器中的名称
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

  /** 获取表名 */
  getTableName(): string {
    return this._name;
  }

  /** 获取列定义 */
  getColumns(): ColumnDefinition[] {
    return Array.from(this._columns.values()).map(b => b.build());
  }

  /** 推断类型（用于 TypeScript 类型） */
  get $inferType(): Record<string, unknown> {
    const type: Record<string, unknown> = {};
    for (const [name, builder] of this._columns) {
      const def = builder.build();
      // 根据列类型推断 TypeScript 类型
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

/** 表注册中心 */
class TableRegistry {
  private tables: Map<string, TableBuilder> = new Map();

  /** 注册表 */
  register<T extends Record<string, ColumnBuilder>>(
    name: string,
    columns: T
  ): TableBuilder<T> {
    const builder = new TableBuilder<T>(name, columns);
    this.tables.set(name, builder);
    return builder;
  }

  /** 获取表 */
  get(name: string): TableBuilder | undefined {
    return this.tables.get(name);
  }

  /** 检查表是否存在 */
  has(name: string): boolean {
    return this.tables.has(name);
  }

  /** 获取所有表名 */
  getTableNames(): string[] {
    return Array.from(this.tables.keys());
  }

  /** 获取所有表定义 */
  getAllDefinitions(): TableDefinition[] {
    return Array.from(this.tables.values()).map(t => t.build());
  }

  /** 清除所有注册 */
  clear(): void {
    this.tables.clear();
  }
}

/** 全局表注册中心实例 */
export const registry = new TableRegistry();

/** 便捷函数：定义表 */
export function defineTable<T extends Record<string, ColumnBuilder>>(
  name: string,
  columns: T
): TableBuilder<T> {
  return registry.register(name, columns);
}

/** 便捷函数：获取表 */
export function getTable(name: string): TableBuilder | undefined {
  return registry.get(name);
}

/** 便捷函数：创建表构建器 */
export function createTable(name: string): TableBuilder {
  return new TableBuilder(name);
}

/** 从表定义生成 SQL */
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

  // 主键约束
  if (definition.primaryKey && definition.primaryKey.length > 0) {
    const pkColumns = definition.primaryKey.map(c => compiler.escapeIdentifier(c)).join(', ');
    columns.push(`PRIMARY KEY (${pkColumns})`);
  }

  let sql = `CREATE TABLE ${compiler.escapeIdentifier(definition.name)} (\n  `;
  sql += columns.join(',\n  ');
  sql += '\n)';

  return sql;
}

/** 生成索引 SQL */
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

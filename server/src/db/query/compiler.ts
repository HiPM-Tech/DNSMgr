/**
 * SQL 编译器
 * 支持 MySQL、PostgreSQL 和 SQLite 的 SQL 方言编译
 */

import type {
  DatabaseType,
  ColumnType,
  CompiledSQL,
  SelectQuery,
  InsertQuery,
  BatchInsertQuery,
  UpdateQuery,
  DeleteQuery,
  WhereCondition,
  JoinCondition,
  OrderBy,
} from '../core/types';
import {
  MYSQL_RESERVED_KEYWORDS,
  POSTGRESQL_RESERVED_KEYWORDS,
  SQLITE_RESERVED_KEYWORDS,
} from '../core/types';

/** SQL 编译器接口 */
export interface SQLCompiler {
  readonly type: DatabaseType;

  /** 转义标识符 */
  escapeIdentifier(name: string): string;

  /** 获取占位符 */
  placeholder(index: number): string;

  /** 映射数据类型 */
  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string;

  /** 获取当前时间函数 */
  now(): string;

  /** 日期差异函数 */
  dateDiff(a: string, b: string): string;

  /** 分页语法 */
  limitOffset(limit: number, offset?: number): string;

  /** 编译 SELECT */
  compileSelect(query: SelectQuery): CompiledSQL;

  /** 编译 INSERT */
  compileInsert(query: InsertQuery): CompiledSQL;

  /** 编译批量 INSERT */
  compileBatchInsert(query: BatchInsertQuery): CompiledSQL;

  /** 编译 UPDATE */
  compileUpdate(query: UpdateQuery): CompiledSQL;

  /** 编译 DELETE */
  compileDelete(query: DeleteQuery): CompiledSQL;
}

/** 基础编译器实现 */
abstract class BaseCompiler implements SQLCompiler {
  abstract readonly type: DatabaseType;
  abstract escapeIdentifier(name: string): string;
  abstract placeholder(index: number): string;
  abstract mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string;
  abstract now(): string;
  abstract dateDiff(a: string, b: string): string;
  abstract limitOffset(limit: number, offset?: number): string;

  protected abstract get reservedKeywords(): Set<string>;

  /** 检查是否为保留关键字 */
  protected isReservedKeyword(name: string): boolean {
    return this.reservedKeywords.has(name.toLowerCase());
  }

  /** 编译 WHERE 条件 */
  protected compileWhere(conditions: WhereCondition[]): { sql: string; params: unknown[] } {
    if (conditions.length === 0) {
      return { sql: '', params: [] };
    }

    const params: unknown[] = [];
    const clauses: string[] = [];

    for (const condition of conditions) {
      const column = this.escapeIdentifier(condition.column);
      let clause = '';

      switch (condition.operator) {
        case '=':
        case '!=':
        case '<>':
        case '<':
        case '<=':
        case '>':
        case '>=':
          params.push(condition.value);
          clause = `${column} ${condition.operator} ${this.placeholder(params.length)}`;
          break;

        case 'LIKE':
        case 'NOT LIKE':
          params.push(condition.value);
          clause = `${column} ${condition.operator} ${this.placeholder(params.length)}`;
          break;

        case 'IN':
        case 'NOT IN':
          const values = Array.isArray(condition.value) ? condition.value : [condition.value];
          const placeholders = values.map(() => this.placeholder(++params.length)).join(', ');
          params.push(...values);
          clause = `${column} ${condition.operator} (${placeholders})`;
          break;

        case 'IS':
        case 'IS NOT':
          if (condition.value === null) {
            clause = `${column} ${condition.operator} NULL`;
          } else {
            params.push(condition.value);
            clause = `${column} ${condition.operator} ${this.placeholder(params.length)}`;
          }
          break;

        case 'BETWEEN':
          const [min, max] = Array.isArray(condition.value) ? condition.value : [condition.value, condition.value];
          params.push(min, max);
          clause = `${column} BETWEEN ${this.placeholder(params.length - 1)} AND ${this.placeholder(params.length)}`;
          break;
      }

      if (clauses.length > 0) {
        clause = `${condition.boolean.toUpperCase()} ${clause}`;
      }

      clauses.push(clause);
    }

    return { sql: `WHERE ${clauses.join(' ')}`, params };
  }

  /** 编译 JOIN */
  protected compileJoins(joins: JoinCondition[]): string {
    if (joins.length === 0) {
      return '';
    }

    return joins
      .map((join) => {
        const type = join.type === 'inner' ? 'INNER' : join.type.toUpperCase();
        const table = this.escapeIdentifier(join.table);
        const conditions = join.on
          .map((c) => {
            const left = this.escapeIdentifier(c.left);
            const right = this.escapeIdentifier(c.right);
            return `${left} ${c.operator} ${right}`;
          })
          .join(' AND ');
        return `${type} JOIN ${table} ON ${conditions}`;
      })
      .join(' ');
  }

  /** 编译 ORDER BY */
  protected compileOrderBy(orderBy: OrderBy[]): string {
    if (orderBy.length === 0) {
      return '';
    }

    const clauses = orderBy.map((o) => {
      const column = this.escapeIdentifier(o.column);
      return `${column} ${o.direction.toUpperCase()}`;
    });

    return `ORDER BY ${clauses.join(', ')}`;
  }

  /** 编译 SELECT */
  compileSelect(query: SelectQuery): CompiledSQL {
    const params: unknown[] = [];
    const table = this.escapeIdentifier(query.table);

    // SELECT columns
    const columns = query.columns.length === 0 || query.columns[0] === '*' 
      ? '*' 
      : query.columns.map(c => this.escapeIdentifier(c)).join(', ');
    
    let sql = `SELECT ${query.distinct ? 'DISTINCT ' : ''}${columns} FROM ${table}`;

    // JOINs
    const joinsSql = this.compileJoins(query.joins);
    if (joinsSql) {
      sql += ` ${joinsSql}`;
    }

    // WHERE
    const whereResult = this.compileWhere(query.where);
    if (whereResult.sql) {
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    // ORDER BY
    const orderBySql = this.compileOrderBy(query.orderBy);
    if (orderBySql) {
      sql += ` ${orderBySql}`;
    }

    // LIMIT/OFFSET
    if (query.limit !== undefined) {
      sql += ` ${this.limitOffset(query.limit, query.offset)}`;
    }

    return { sql, params };
  }

  /** 编译 INSERT */
  compileInsert(query: InsertQuery): CompiledSQL {
    const table = this.escapeIdentifier(query.table);
    const entries = Object.entries(query.data);
    
    const columns = entries.map(([key]) => this.escapeIdentifier(key)).join(', ');
    const placeholders = entries.map((_, i) => this.placeholder(i + 1)).join(', ');
    const params = entries.map(([, value]) => value);

    let sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

    if (query.returning && query.returning.length > 0) {
      sql += ` RETURNING ${query.returning.map(r => this.escapeIdentifier(r)).join(', ')}`;
    }

    return { sql, params };
  }

  /** 编译批量 INSERT */
  compileBatchInsert(query: BatchInsertQuery): CompiledSQL {
    const table = this.escapeIdentifier(query.table);
    
    if (query.data.length === 0) {
      return { sql: '', params: [] };
    }

    const keys = Object.keys(query.data[0]);
    const columns = keys.map(k => this.escapeIdentifier(k)).join(', ');
    
    const params: unknown[] = [];
    const valueGroups: string[] = [];

    for (const row of query.data) {
      const placeholders = keys.map(() => this.placeholder(++params.length)).join(', ');
      valueGroups.push(`(${placeholders})`);
      params.push(...keys.map(k => row[k]));
    }

    let sql = `INSERT INTO ${table} (${columns}) VALUES ${valueGroups.join(', ')}`;

    if (query.returning && query.returning.length > 0) {
      sql += ` RETURNING ${query.returning.map(r => this.escapeIdentifier(r)).join(', ')}`;
    }

    return { sql, params };
  }

  /** 编译 UPDATE */
  compileUpdate(query: UpdateQuery): CompiledSQL {
    const table = this.escapeIdentifier(query.table);
    const params: unknown[] = [];

    // SET clause
    const setEntries = Object.entries(query.data);
    const setClause = setEntries
      .map(([key], i) => {
        params.push(query.data[key]);
        return `${this.escapeIdentifier(key)} = ${this.placeholder(params.length)}`;
      })
      .join(', ');

    let sql = `UPDATE ${table} SET ${setClause}`;

    // WHERE
    const whereResult = this.compileWhere(query.where);
    if (whereResult.sql) {
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    if (query.returning && query.returning.length > 0) {
      sql += ` RETURNING ${query.returning.map(r => this.escapeIdentifier(r)).join(', ')}`;
    }

    return { sql, params };
  }

  /** 编译 DELETE */
  compileDelete(query: DeleteQuery): CompiledSQL {
    const table = this.escapeIdentifier(query.table);
    const params: unknown[] = [];

    let sql = `DELETE FROM ${table}`;

    // WHERE
    const whereResult = this.compileWhere(query.where);
    if (whereResult.sql) {
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    if (query.returning && query.returning.length > 0) {
      sql += ` RETURNING ${query.returning.map(r => this.escapeIdentifier(r)).join(', ')}`;
    }

    return { sql, params };
  }
}

/** MySQL 编译器 */
export class MySQLCompiler extends BaseCompiler {
  readonly type: DatabaseType = 'mysql';

  protected get reservedKeywords(): Set<string> {
    return MYSQL_RESERVED_KEYWORDS;
  }

  escapeIdentifier(name: string): string {
    return `\`${name}\``;
  }

  placeholder(): string {
    return '?';
  }

  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string {
    switch (type) {
      case 'string':
        return `VARCHAR(${options?.length || 255})`;
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INT';
      case 'bigint':
        return 'BIGINT';
      case 'decimal':
        return `DECIMAL(${options?.precision || 10}, ${options?.scale || 2})`;
      case 'boolean':
        return 'TINYINT(1)';
      case 'datetime':
        return 'DATETIME';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'json':
        return 'JSON';
      case 'uuid':
        return 'CHAR(36)';
      case 'serial':
        return 'BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY';
      default:
        return 'TEXT';
    }
  }

  now(): string {
    return 'NOW()';
  }

  dateDiff(a: string, b: string): string {
    return `DATEDIFF(${a}, ${b})`;
  }

  limitOffset(limit: number, offset?: number): string {
    if (offset !== undefined) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit}`;
  }
}

/** PostgreSQL 编译器 */
export class PostgreSQLCompiler extends BaseCompiler {
  readonly type: DatabaseType = 'postgresql';

  protected get reservedKeywords(): Set<string> {
    return POSTGRESQL_RESERVED_KEYWORDS;
  }

  escapeIdentifier(name: string): string {
    return `"${name}"`;
  }

  placeholder(index: number): string {
    return `$${index}`;
  }

  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string {
    switch (type) {
      case 'string':
        return `VARCHAR(${options?.length || 255})`;
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'BIGINT';
      case 'decimal':
        return `DECIMAL(${options?.precision || 10}, ${options?.scale || 2})`;
      case 'boolean':
        return 'BOOLEAN';
      case 'datetime':
        return 'TIMESTAMP';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'json':
        return 'JSONB';
      case 'uuid':
        return 'UUID';
      case 'serial':
        return 'BIGSERIAL PRIMARY KEY';
      default:
        return 'TEXT';
    }
  }

  now(): string {
    return 'NOW()';
  }

  dateDiff(a: string, b: string): string {
    return `(${a} - ${b})`;
  }

  limitOffset(limit: number, offset?: number): string {
    if (offset !== undefined) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit}`;
  }
}

/** SQLite 编译器 */
export class SQLiteCompiler extends BaseCompiler {
  readonly type: DatabaseType = 'sqlite';

  protected get reservedKeywords(): Set<string> {
    return SQLITE_RESERVED_KEYWORDS;
  }

  escapeIdentifier(name: string): string {
    return `"${name}"`;
  }

  placeholder(): string {
    return '?';
  }

  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string {
    switch (type) {
      case 'string':
        return 'TEXT';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'INTEGER';
      case 'decimal':
        return 'REAL';
      case 'boolean':
        return 'INTEGER';
      case 'datetime':
        return 'TEXT';
      case 'timestamp':
        return 'TEXT';
      case 'date':
        return 'TEXT';
      case 'json':
        return 'TEXT';
      case 'uuid':
        return 'TEXT';
      case 'serial':
        return 'INTEGER PRIMARY KEY AUTOINCREMENT';
      default:
        return 'TEXT';
    }
  }

  now(): string {
    return "datetime('now')";
  }

  dateDiff(a: string, b: string): string {
    return `julianday(${a}) - julianday(${b})`;
  }

  limitOffset(limit: number, offset?: number): string {
    if (offset !== undefined) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit}`;
  }
}

/** 编译器工厂 */
export function createCompiler(type: DatabaseType): SQLCompiler {
  switch (type) {
    case 'mysql':
      return new MySQLCompiler();
    case 'postgresql':
      return new PostgreSQLCompiler();
    case 'sqlite':
      return new SQLiteCompiler();
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}

/** 获取默认编译器 */
export function getDefaultCompiler(): SQLCompiler {
  const type = (process.env.DB_TYPE as DatabaseType) || 'sqlite';
  return createCompiler(type);
}

/**
 * 数据库驱动基类
 * 提供通用的 SQL 编译逻辑
 */

import type {
  DatabaseType,
  Transaction,
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
import type { DatabaseDriver, DriverConfig, ConnectionStats } from './types';

/** 抽象基础驱动类 */
export abstract class BaseDriver implements DatabaseDriver {
  abstract readonly type: DatabaseType;
  protected _stats: ConnectionStats = { queries: 0, acquired: 0, released: 0, errors: 0 };
  protected config: DriverConfig;

  constructor(config: DriverConfig = {}) {
    this.config = config;
  }

  get stats(): ConnectionStats {
    return { ...this._stats };
  }

  abstract get isConnected(): boolean;

  // ==================== 抽象方法（必须由子类实现） ====================

  abstract query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  abstract get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  abstract execute(sql: string, params?: unknown[]): Promise<void>;
  abstract insert(sql: string, params?: unknown[]): Promise<number>;
  abstract run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  abstract beginTransaction(): Promise<Transaction>;
  abstract raw(): unknown;
  abstract close(): Promise<void>;

  // ==================== SQL 方言（必须由子类实现） ====================

  abstract escapeIdentifier(name: string): string;
  abstract placeholder(index: number): string;
  abstract mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string;
  abstract now(): string;
  abstract dateDiff(a: string, b: string): string;
  abstract limitOffset(limit: number, offset?: number): string;

  // ==================== 通用 SQL 编译逻辑 ====================

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

  compileSelect(query: SelectQuery): CompiledSQL {
    const params: unknown[] = [];
    const table = this.escapeIdentifier(query.table);

    const columns = query.columns.length === 0 || query.columns[0] === '*' 
      ? '*' 
      : query.columns.map(c => this.escapeIdentifier(c)).join(', ');
    
    let sql = `SELECT ${query.distinct ? 'DISTINCT ' : ''}${columns} FROM ${table}`;

    const joinsSql = this.compileJoins(query.joins);
    if (joinsSql) {
      sql += ` ${joinsSql}`;
    }

    const whereResult = this.compileWhere(query.where);
    if (whereResult.sql) {
      sql += ` ${whereResult.sql}`;
      params.push(...whereResult.params);
    }

    const orderBySql = this.compileOrderBy(query.orderBy);
    if (orderBySql) {
      sql += ` ${orderBySql}`;
    }

    if (query.limit !== undefined) {
      sql += ` ${this.limitOffset(query.limit, query.offset)}`;
    }

    return { sql, params };
  }

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

  compileUpdate(query: UpdateQuery): CompiledSQL {
    const table = this.escapeIdentifier(query.table);
    const params: unknown[] = [];

    const setEntries = Object.entries(query.data);
    const setClause = setEntries
      .map(([key]) => {
        params.push(query.data[key]);
        return `${this.escapeIdentifier(key)} = ${this.placeholder(params.length)}`;
      })
      .join(', ');

    let sql = `UPDATE ${table} SET ${setClause}`;

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

  compileDelete(query: DeleteQuery): CompiledSQL {
    const table = this.escapeIdentifier(query.table);
    const params: unknown[] = [];

    let sql = `DELETE FROM ${table}`;

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

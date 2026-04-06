/**
 * 兼容层 (Adapter)
 * 保持现有 API 兼容，内部使用新架构
 * 用于平滑迁移现有代码到新数据库抽象层
 */

import type { DatabaseConnection, Transaction } from './core/types';
import { getConnection, getConnectionManager, transaction } from './core/connection';
import { createCompiler, getDefaultCompiler } from './query/compiler';
import type { SQLCompiler } from './query/compiler';

/** 查询结果类型 */
type QueryResult = Record<string, unknown>;

/** 数据库适配器类 */
export class DbAdapter {
  private conn: DatabaseConnection;
  private compiler: SQLCompiler;

  constructor(conn: DatabaseConnection, compiler?: SQLCompiler) {
    this.conn = conn;
    this.compiler = compiler || getDefaultCompiler();
  }

  /** 获取适配器实例 */
  static getInstance(): DbAdapter | null {
    try {
      const conn = getConnection();
      return new DbAdapter(conn);
    } catch {
      return null;
    }
  }

  /** 获取数据库类型 */
  get type(): string {
    return this.conn.type;
  }

  /** 处理 SQL（转换占位符、转义标识符） */
  private processSql(sql: string): string {
    // 转换 PostgreSQL 的 $1, $2... 占位符
    if (this.conn.type === 'postgresql') {
      let index = 0;
      sql = sql.replace(/\?/g, () => `$${++index}`);
    }

    // MySQL 保留关键字转义
    if (this.conn.type === 'mysql') {
      const keywords = ['key', 'value', 'order', 'group'];
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        sql = sql.replace(regex, `\`${keyword}\``);
      });
    }

    return sql;
  }

  /** 执行查询并返回多行 */
  async query(sql: string, params?: unknown[]): Promise<QueryResult[]> {
    const processedSql = this.processSql(sql);
    return this.conn.query<QueryResult>(processedSql, params);
  }

  /** 执行查询并返回单行 */
  async get(sql: string, params?: unknown[]): Promise<QueryResult | undefined> {
    const processedSql = this.processSql(sql);
    return this.conn.get<QueryResult>(processedSql, params);
  }

  /** 执行 INSERT/UPDATE/DELETE */
  async execute(sql: string, params?: unknown[]): Promise<void> {
    const processedSql = this.processSql(sql);
    await this.conn.execute(processedSql, params);
  }

  /** 执行 INSERT 并返回最后插入的 ID */
  async insert(sql: string, params?: unknown[]): Promise<number> {
    const processedSql = this.processSql(sql);
    return this.conn.insert(processedSql, params);
  }

  /** 执行 UPDATE/DELETE 并返回影响的行数 */
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const processedSql = this.processSql(sql);
    return this.conn.run(processedSql, params);
  }

  /** 获取当前时间函数 */
  now(): string {
    return this.compiler.now();
  }

  /** 获取日期比较函数 */
  dateCompare(column: string, operator: string, value: string): string {
    if (this.conn.type === 'sqlite') {
      return `date(${column}) ${operator} date(?)`;
    }
    return `${column} ${operator} ?`;
  }

  /** 开始事务 */
  async beginTransaction(): Promise<void> {
    await this.conn.execute('BEGIN TRANSACTION');
  }

  /** 提交事务 */
  async commit(): Promise<void> {
    await this.conn.execute('COMMIT');
  }

  /** 回滚事务 */
  async rollback(): Promise<void> {
    await this.conn.execute('ROLLBACK');
  }

  /** 在事务中执行函数 */
  async transaction<T>(fn: (db: DbAdapter) => Promise<T>): Promise<T> {
    return transaction(async (trx) => {
      // 创建临时适配器使用事务连接
      const trxAdapter = new DbAdapter(
        {
          ...this.conn,
          query: trx.query.bind(trx),
          get: trx.get.bind(trx),
          execute: trx.execute.bind(trx),
          insert: trx.insert.bind(trx),
          run: trx.run.bind(trx),
        } as DatabaseConnection,
        this.compiler
      );
      return fn(trxAdapter);
    });
  }
}

/** 便捷函数：获取适配器实例 */
export function getAdapter(): DbAdapter | null {
  return DbAdapter.getInstance();
}

/** 便捷函数：执行查询 */
export async function query(sql: string, params?: unknown[]): Promise<QueryResult[]> {
  const adapter = getAdapter();
  if (!adapter) {
    throw new Error('Database not connected');
  }
  return adapter.query(sql, params);
}

/** 便捷函数：执行查询并返回单行 */
export async function get(sql: string, params?: unknown[]): Promise<QueryResult | undefined> {
  const adapter = getAdapter();
  if (!adapter) {
    throw new Error('Database not connected');
  }
  return adapter.get(sql, params);
}

/** 便捷函数：执行 SQL */
export async function execute(sql: string, params?: unknown[]): Promise<void> {
  const adapter = getAdapter();
  if (!adapter) {
    throw new Error('Database not connected');
  }
  return adapter.execute(sql, params);
}

/** 便捷函数：执行 INSERT */
export async function insert(sql: string, params?: unknown[]): Promise<number> {
  const adapter = getAdapter();
  if (!adapter) {
    throw new Error('Database not connected');
  }
  return adapter.insert(sql, params);
}

/** 便捷函数：执行 UPDATE/DELETE */
export async function run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
  const adapter = getAdapter();
  if (!adapter) {
    throw new Error('Database not connected');
  }
  return adapter.run(sql, params);
}

/** 重新导出核心类型和函数以保持兼容性 */
export {
  getConnection,
  getConnectionManager,
  connect,
  disconnect,
  transaction,
} from './core/connection';

export type {
  DatabaseConnection,
  Transaction,
  DatabaseType,
  Operator,
  OrderDirection,
  JoinType,
  ColumnType,
  ColumnDefinition,
  TableDefinition,
  CompiledSQL,
} from './core/types';

export type { DatabaseConfig, MySQLConfig, PostgreSQLConfig, SQLiteConfig } from './core/config';
export { getDatabaseConfig, validateConfig, mergeConfig } from './core/config';

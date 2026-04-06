/**
 * 数据库抽象层统一导出
 * 提供完整的数据库访问 API
 */

// ==================== Core ====================
export {
  ConnectionManager,
  getConnectionManager,
  connect,
  disconnect,
  getConnection,
  transaction,
} from './core/connection';

export type {
  DatabaseConnection,
  Transaction,
  DatabaseType,
  Operator,
  OrderDirection,
  JoinType,
  RawConnection,
  ColumnType,
  ColumnDefinition,
  TableDefinition,
  IndexDefinition,
  WhereCondition,
  JoinCondition,
  OrderBy,
  QueryState,
  CompiledSQL,
  InsertQuery,
  BatchInsertQuery,
  UpdateQuery,
  DeleteQuery,
  SelectQuery,
} from './core/types';

export {
  MYSQL_RESERVED_KEYWORDS,
  POSTGRESQL_RESERVED_KEYWORDS,
  SQLITE_RESERVED_KEYWORDS,
} from './core/types';

export type {
  DatabaseConfig,
  MySQLConfig,
  PostgreSQLConfig,
  SQLiteConfig,
  PoolStats,
} from './core/config';

export {
  getDatabaseConfig,
  validateConfig,
  mergeConfig,
} from './core/config';

// ==================== Drivers ====================
export {
  BaseDriver,
  registerDriver,
  getDriver,
  hasDriver,
  getSupportedDrivers,
  createDriver,
  createDriverFromEnv,
  DriverManager,
  getDriverManager,
  initDriver,
  closeDriver,
  getCurrentDriver,
} from './drivers';

export type {
  DatabaseDriver,
  DriverConfig,
  ConnectionStats,
  DriverConstructor,
  DriverFactoryConfig,
} from './drivers';

export {
  MySQLDriver,
} from './drivers/mysql';

export type {
  MySQLDriverConfig,
} from './drivers/mysql';

export {
  PostgreSQLDriver,
} from './drivers/postgresql';

export type {
  PostgreSQLDriverConfig,
} from './drivers/postgresql';

export {
  SQLiteDriver,
} from './drivers/sqlite';

export type {
  SQLiteDriverConfig,
} from './drivers/sqlite';

// ==================== Query ====================
export {
  QueryBuilder,
  InsertBuilder,
  BatchInsertBuilder,
  UpdateBuilder,
  DeleteBuilder,
  createQueryBuilder,
  createInsertBuilder,
  createBatchInsertBuilder,
  createUpdateBuilder,
  createDeleteBuilder,
} from './query/builder';

export type {
  SQLCompiler,
} from './query/compiler';

export {
  MySQLCompiler,
  PostgreSQLCompiler,
  SQLiteCompiler,
  createCompiler,
  getDefaultCompiler,
} from './query/compiler';

export type {
  IdentifierEscaper,
} from './query/identifier';

export {
  MySQLIdentifierEscaper,
  PostgreSQLIdentifierEscaper,
  SQLiteIdentifierEscaper,
  createIdentifierEscaper,
  getDefaultIdentifierEscaper,
  generateAlias,
  needsEscaping,
  escapeIdentifiers,
} from './query/identifier';

// ==================== Schema ====================
export {
  ColumnBuilder,
  column,
  TableBuilder,
  registry,
  defineTable,
  getTable,
  createTable,
  generateCreateTableSQL,
  generateCreateIndexSQL,
} from './schema/registry';

export type {
  Index,
} from './schema/registry';

export type {
  Migration,
  MigrationRecord,
  MigrationStatus,
} from './schema/migration';

export {
  MigrationManager,
  createMigration,
} from './schema/migration';

// ==================== Adapter (兼容层) ====================
export {
  DbAdapter,
  getAdapter,
  query,
  get,
  execute,
  insert,
  run,
} from './adapter';

// ==================== 数据库类 ====================
import type { DatabaseConnection, Transaction } from './core/types';
import type { DatabaseConfig } from './core/config';
import { ConnectionManager } from './core/connection';
import { QueryBuilder, InsertBuilder, UpdateBuilder, DeleteBuilder } from './query/builder';
import { MigrationManager } from './schema/migration';
import { getCurrentDriver, type DatabaseDriver } from './drivers';

/**
 * 主数据库类
 * 提供统一的数据库访问接口
 */
export class Database {
  private connectionManager: ConnectionManager;

  constructor() {
    this.connectionManager = ConnectionManager.getInstance();
  }

  /** 获取数据库连接 */
  get connection(): DatabaseConnection {
    return this.connectionManager.getConnection();
  }

  /** 获取当前驱动 */
  get driver(): DatabaseDriver {
    return getCurrentDriver();
  }

  /** 连接到数据库 */
  async connect(config?: DatabaseConfig): Promise<DatabaseConnection> {
    return this.connectionManager.connect(config);
  }

  /** 断开连接 */
  async disconnect(): Promise<void> {
    return this.connectionManager.disconnect();
  }

  /** 检查是否已连接 */
  get isConnected(): boolean {
    return this.connectionManager.isConnected;
  }

  /** 创建查询构建器 */
  createQueryBuilder<T extends Record<string, unknown> = Record<string, unknown>>(table?: string): QueryBuilder<T> {
    const builder = new QueryBuilder<T>(this.driver);
    if (table) {
      builder.from(table);
    }
    return builder;
  }

  /** 创建插入构建器 */
  insertInto<T extends Record<string, unknown> = Record<string, unknown>>(table: string): InsertBuilder<T> {
    return new InsertBuilder<T>(this.driver).into(table);
  }

  /** 创建更新构建器 */
  updateTable<T extends Record<string, unknown> = Record<string, unknown>>(table: string): UpdateBuilder<T> {
    return new UpdateBuilder<T>(this.driver).table(table);
  }

  /** 创建删除构建器 */
  deleteFrom<T extends Record<string, unknown> = Record<string, unknown>>(table: string): DeleteBuilder<T> {
    return new DeleteBuilder<T>(this.driver).from(table);
  }

  /** 在事务中执行 */
  async transaction<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
    return this.connectionManager.transaction(fn);
  }

  /** 获取迁移管理器 */
  getMigrationManager(): MigrationManager {
    return new MigrationManager(this.connection);
  }

  /** 执行原始 SQL (兼容层) */
  async execute(sql: string, params?: unknown[]): Promise<void> {
    return this.driver.execute(sql, params);
  }

  /** 原始查询 (兼容层) */
  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.driver.query<T>(sql, params);
  }

  /** 原始查询单行 (兼容层) */
  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.driver.get<T>(sql, params);
  }

  /** 插入数据并返回ID (兼容层) */
  async insert(sql: string, params?: unknown[]): Promise<number> {
    return this.driver.insert(sql, params);
  }

  /** 运行SQL并返回变更信息 (兼容层) */
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    return this.driver.run(sql, params);
  }

  /** 获取当前时间函数 (兼容层) */
  now(): string {
    return this.driver.now();
  }

  /** 获取数据库类型 (兼容层) */
  get type(): string {
    return this.driver.type;
  }
}

/** 默认数据库实例 */
export const db = new Database();

/** 便捷函数：获取数据库实例 */
export function getDatabase(): Database {
  return db;
}

export default db;

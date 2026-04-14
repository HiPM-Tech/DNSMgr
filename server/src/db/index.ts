/**
 * 数据库模块主入口
 * 
 * 架构：路由/Service/Middleware → 业务适配器函数 → 数据库抽象层 → 驱动 → 数据库
 * 
 * 使用方式：
 * import { query, get, execute, insert, run, UserOperations } from '../db';
 */

// ==================== 数据库抽象层 ====================
export {
  // 核心类型
  type DatabaseConnection,
  type Transaction,
  type DatabaseType,
  type Operator,
  type OrderDirection,
  type JoinType,
  type ColumnType,
  type ColumnDefinition,
  type TableDefinition,
  type CompiledSQL,
} from './core/types';

export {
  type DatabaseConfig,
  type MySQLConfig,
  type PostgreSQLConfig,
  type SQLiteConfig,
  getDatabaseConfig,
  validateConfig,
  mergeConfig,
} from './core/config';

export {
  ConnectionManager,
  getConnection,
  getConnectionManager,
  connect,
  disconnect,
  transaction,
} from './core/connection';

// ==================== 驱动层 ====================
export {
  type DatabaseDriver,
  type DriverConfig,
} from './drivers/types';

export { BaseDriver } from './drivers/base';
export { MySQLDriver } from './drivers/mysql';
export { PostgreSQLDriver } from './drivers/postgresql';
export { SQLiteDriver } from './drivers/sqlite';

export {
  getCurrentDriver,
  createDriver,
} from './drivers';

// ==================== 查询构建器 ====================
export {
  QueryBuilder,
  InsertBuilder,
  UpdateBuilder,
  DeleteBuilder,
} from './query/builder';

export {
  type SQLCompiler,
  getDefaultCompiler,
  createCompiler,
} from './query/compiler';

// ==================== Schema管理 ====================
export {
  type Migration,
  createMigration,
} from './schema/migration';

// ==================== 业务适配器层（唯一入口）====================
export {
  // 通用操作函数
  query,
  get,
  execute,
  insert,
  run,
  now,
  getDbType,
  isDbConnected,
  withTransaction,
  
  // 业务操作模块
  UserOperations,
  DnsAccountOperations,
  DomainOperations,
  TeamOperations,
  SettingsOperations,
  AuditOperations,
  CertificateOperations,
  
  // 类型
  type QueryResult,
  TransactionOperations,
} from './business-adapter';

// ==================== 工具函数 ====================
export { escapeIdentifiers } from './query/identifier';

// ==================== 初始化函数 ====================
export { initSchema, initSchemaAsync } from './schema';

// ==================== 数据库实例（向后兼容）====================
import { database } from './business-adapter';
export const db = database;
export default database;

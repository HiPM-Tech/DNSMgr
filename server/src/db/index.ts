/**
 * 数据库模块主入口
 *
 * 架构：路由/Service/Middleware → 业务适配器函数 → 数据库抽象层 → 驱动 → 数据库
 *
 * 使用方式：
 * import { UserOperations, DnsAccountOperations, ... } from '../db';
 *
 * 注意：
 * 1. 禁止直接导入 query, get, execute, insert, run 等底层数据库操作函数
 * 2. 禁止直接导入驱动层 (BaseDriver, MySQLDriver, etc.)
 * 3. 禁止直接导入查询构建器 (QueryBuilder, SQLCompiler, etc.)
 * 4. 所有数据库操作必须通过业务适配器层的专用操作函数进行
 */

// ==================== 数据库抽象层（仅类型导出）====================
export {
  // 核心类型 - 仅类型，不导出实现
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
  // 配置类型和函数
  type DatabaseConfig,
  type MySQLConfig,
  type PostgreSQLConfig,
  type SQLiteConfig,
  getDatabaseConfig,
  validateConfig,
  mergeConfig,
} from './core/config';

// ==================== 连接管理（仅应用初始化使用）====================
export {
  // 仅导出连接/断开函数，用于应用生命周期管理
  connect,
  disconnect,
} from './core/connection';

// ==================== 驱动层（仅类型导出）====================
export {
  // 仅导出类型，不导出具体驱动实现
  type DatabaseDriver,
  type DriverConfig,
} from './drivers/types';

// ==================== Schema管理（仅初始化使用）====================
export {
  type Migration,
  createMigration,
} from './schema/migration';

export { initSchema, initSchemaAsync } from './schema';

// ==================== 业务适配器层（唯一业务入口）====================
export {
  // 类型
  type QueryResult,
  type TransactionOperations,

  // 工具函数（业务适配器内部使用）
  now,
  getDbType,
  isDbConnected,
  withTransaction,

  // 业务操作模块 - 所有数据库操作必须通过以下模块进行
  UserOperations,
  DnsAccountOperations,
  DomainOperations,
  TeamOperations,
  SettingsOperations,
  AuditOperations,
  TokenOperations,
  SecretOperations,
  SecurityPolicyOperations,
  TrustedDeviceOperations,
  UserPreferencesOperations,
  SessionOperations,
  LoginLimitOperations,
  FailoverOperations,
  AuditExportOperations,
  TOTPOperations,
  WebAuthnOperations,
  SmtpOperations,
  WhoisOperations,
  AuditRulesOperations,
  AuditLogOperations,
  OAuthOperations,
  TwoFAOperations,
} from './business-adapter';

// ==================== 数据库实例（向后兼容，仅用于特殊场景）====================
import { database } from './business-adapter';
export const db = database;
export default database;

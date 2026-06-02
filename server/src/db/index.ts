/**
 * 数据库模块主入口
 *
 * 架构：路由/Service/Middleware → BAL (业务适配器层) → DAL (数据库抽象层) → DL (驱动层) → 数据库
 *                        ↕ DSM (声明式模式管理)
 *
 * 分层说明：
 * - bal/  : Business Adapter Layer  - 业务适配器层（唯一业务入口）
 * - dal/  : Database Abstraction Layer - 数据库抽象层（连接管理 + 类型系统）
 * - dl/   : Driver Layer             - 驱动层（SQLite/MySQL/PostgreSQL）
 * - dsm/  : Declarative Schema Management - 声明式模式管理（初始化与迁移）
 *
 * 使用方式：
 * import { UserOperations, DnsAccountOperations, ... } from '../db';
 *
 * 注意：
 * 1. 禁止直接导入底层数据库操作函数（query, get, execute 等）
 * 2. 禁止直接导入驱动层 (BaseDriver, MySQLDriver 等)
 * 3. 所有数据库操作必须通过 bal/ 层的业务操作函数进行
 */

// ==================== BAL - 业务适配器层（唯一业务入口）====================
export {
  type QueryResult,
  type TransactionOperations,
  now,
  getDbType,
  isDbConnected,
  withTransaction,
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
  SystemOperations,
  NotificationOperations,
  DomainPermissionOperations,
  RenewableDomainOperations,
  NSMonitorOperations,
  AuditRuleOperations,
  DomainExpiryOperations,
} from './bal/business-adapter';

// ==================== DAL - 数据库抽象层（仅类型 + 连接管理）====================
export {
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
  type DatabaseConfig,
  type MySQLConfig,
  type PostgreSQLConfig,
  type SQLiteConfig,
  connect,
  disconnect,
} from './dal';

// ==================== DL - 驱动层（仅类型导出）====================
export {
  type DatabaseDriver,
  type DriverConfig,
} from './dl/types';

// ==================== DSM - 声明式模式管理====================
export {
  initializeDSM,
  SchemaReconciler,
  DataMigrationRunner,
  COMPLETE_SCHEMA,
} from './dsm';

// ==================== 遗留兼容（已弃用）====================
import { database } from './bal/business-adapter';
export const db = database;
export default database;
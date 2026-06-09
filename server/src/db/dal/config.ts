/**
 * 数据库配置定义
 * 统一的数据库配置管理和获取
 */

import type { DatabaseType } from './types';
import path from 'path';
import os from 'os';

/** MySQL 配置 */
export interface MySQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionLimit?: number;
  connectTimeout?: number;
  acquireTimeout?: number;
  timeout?: number;
}

/** PostgreSQL 配置 */
export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

/** SQLite 配置 */
export interface SQLiteConfig {
  path: string;
  mode?: 'readwrite' | 'readonly' | 'create';
  busyTimeout?: number;
  enableWAL?: boolean;
  foreignKeys?: boolean;
}

/** 统一数据库配置 */
export interface DatabaseConfig {
  type: DatabaseType;
  mysql?: MySQLConfig;
  postgresql?: PostgreSQLConfig;
  sqlite?: SQLiteConfig;
  logging?: boolean;
  slowQueryThreshold?: number;
}

/** 连接池统计信息 */
export interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
}

/** 默认配置值 */
const DEFAULT_CONFIG = {
  mysql: {
    host: 'localhost',
    port: 3306,
    connectionLimit: 20,
    connectTimeout: 60000,
    acquireTimeout: 60000,
    timeout: 60000,
  },
  postgresql: {
    host: 'localhost',
    port: 5432,
    poolSize: 20,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
  },
  sqlite: {
    mode: 'readwrite' as const,
    busyTimeout: 5000,
    enableWAL: true,
    foreignKeys: true,
  },
  common: {
    slowQueryThreshold: 100, // ms
    logging: process.env.NODE_ENV !== 'production',
  },
};

/**
 * 检测是否为 SEA 二进制运行环境
 * 支持 Node.js Single Executable Applications 和 pkg 打包环境
 */
function isBinaryEnvironment(): boolean {
  // pkg 打包检测
  if (!!(process as any).pkg) return true;
  // Node.js SEA 检测（Node.js 20.12+）
  try {
    const sea = require('node:sea');
    return typeof sea.isSea === 'function' && sea.isSea();
  } catch {
    // node:sea 不可用，继续其他检测
  }
  // 按可执行文件名检测
  const exe = path.basename(process.execPath).toLowerCase();
  return exe === 'hidns.exe' || exe === 'hidns';
}

/**
 * 解析默认 SQLite 数据库路径
 * 
 * 优先级：
 * 1. process.env.DB_PATH（最高优先级，用户显式指定）
 * 2. process.env.HIDNS_DATA_DIR（用户指定数据目录）
 * 3. 二进制运行环境（SEA/pkg）：使用平台标准应用数据目录
 *    - Windows: %APPDATA%/HiDNS/data/hidns.db
 *    - macOS:   ~/Library/Application Support/HiDNS/data/hidns.db
 *    - Linux:   ~/.config/hidns/data/hidns.db
 * 4. 开发环境：{cwd}/data/hidns.db（向后兼容）
 */
export function resolveDefaultDbPath(): string {
  // 优先级 1：用户显式指定
  if (process.env.DB_PATH) return process.env.DB_PATH;

  // 优先级 2：用户指定数据目录
  if (process.env.HIDNS_DATA_DIR) {
    return path.join(process.env.HIDNS_DATA_DIR, 'data', 'hidns.db');
  }

  // 优先级 3：二进制环境
  if (isBinaryEnvironment()) {
    if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'HiDNS', 'data', 'hidns.db');
    }
    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'HiDNS', 'data', 'hidns.db');
    }
    // Linux
    const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(xdgData, 'hidns', 'data', 'hidns.db');
  }

  // 优先级 4：开发环境
  return path.resolve(process.cwd(), 'data', 'hidns.db');
}

/**
 * 从环境变量获取数据库配置
 */
export function getDatabaseConfig(): DatabaseConfig {
  const dbType = (process.env.DB_TYPE as DatabaseType) || 'sqlite';

  switch (dbType) {
    case 'mysql':
      return {
        type: 'mysql',
        mysql: {
          host: process.env.DB_HOST || DEFAULT_CONFIG.mysql.host,
          port: parseInt(process.env.DB_PORT || String(DEFAULT_CONFIG.mysql.port), 10),
          database: process.env.DB_NAME || 'dnsmgr',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
          ssl: process.env.DB_SSL === 'true',
          connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || String(DEFAULT_CONFIG.mysql.connectionLimit), 10),
          connectTimeout: DEFAULT_CONFIG.mysql.connectTimeout,
          acquireTimeout: DEFAULT_CONFIG.mysql.acquireTimeout,
          timeout: DEFAULT_CONFIG.mysql.timeout,
        },
        logging: process.env.DB_LOGGING !== 'false',
        slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || String(DEFAULT_CONFIG.common.slowQueryThreshold), 10),
      };

    case 'postgresql':
      return {
        type: 'postgresql',
        postgresql: {
          host: process.env.DB_HOST || DEFAULT_CONFIG.postgresql.host,
          port: parseInt(process.env.DB_PORT || String(DEFAULT_CONFIG.postgresql.port), 10),
          database: process.env.DB_NAME || 'dnsmgr',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          ssl: process.env.DB_SSL === 'true',
          poolSize: parseInt(process.env.DB_POOL_SIZE || String(DEFAULT_CONFIG.postgresql.poolSize), 10),
          connectionTimeoutMillis: DEFAULT_CONFIG.postgresql.connectionTimeoutMillis,
          idleTimeoutMillis: DEFAULT_CONFIG.postgresql.idleTimeoutMillis,
        },
        logging: process.env.DB_LOGGING !== 'false',
        slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || String(DEFAULT_CONFIG.common.slowQueryThreshold), 10),
      };

    case 'sqlite':
    default:
      return {
        type: 'sqlite',
        sqlite: {
          path: resolveDefaultDbPath(),
          mode: DEFAULT_CONFIG.sqlite.mode,
          busyTimeout: DEFAULT_CONFIG.sqlite.busyTimeout,
          enableWAL: process.env.DB_SQLITE_WAL !== 'false',
          foreignKeys: process.env.DB_SQLITE_FOREIGN_KEYS !== 'false',
        },
        logging: process.env.DB_LOGGING !== 'false',
        slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || String(DEFAULT_CONFIG.common.slowQueryThreshold), 10),
      };
  }
}

/**
 * 验证数据库配置
 */
export function validateConfig(config: DatabaseConfig): void {
  if (!config.type) {
    throw new Error('Database type is required');
  }

  switch (config.type) {
    case 'mysql':
      if (!config.mysql) {
        throw new Error('MySQL configuration is required');
      }
      if (!config.mysql.host || !config.mysql.database) {
        throw new Error('MySQL host and database are required');
      }
      break;

    case 'postgresql':
      if (!config.postgresql) {
        throw new Error('PostgreSQL configuration is required');
      }
      if (!config.postgresql.host || !config.postgresql.database) {
        throw new Error('PostgreSQL host and database are required');
      }
      break;

    case 'sqlite':
      if (!config.sqlite) {
        throw new Error('SQLite configuration is required');
      }
      if (!config.sqlite.path) {
        throw new Error('SQLite database path is required');
      }
      break;

    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

/**
 * 合并配置
 */
export function mergeConfig(base: Partial<DatabaseConfig>, override: Partial<DatabaseConfig>): DatabaseConfig {
  const type = override.type || base.type || 'sqlite';
  const logging = override.logging ?? base.logging ?? DEFAULT_CONFIG.common.logging;
  const slowQueryThreshold = override.slowQueryThreshold || base.slowQueryThreshold || DEFAULT_CONFIG.common.slowQueryThreshold;

  if (type === 'mysql') {
    return {
      type,
      logging,
      slowQueryThreshold,
      mysql: {
        ...DEFAULT_CONFIG.mysql,
        ...base.mysql,
        ...override.mysql,
      } as MySQLConfig,
    };
  }

  if (type === 'postgresql') {
    return {
      type,
      logging,
      slowQueryThreshold,
      postgresql: {
        ...DEFAULT_CONFIG.postgresql,
        ...base.postgresql,
        ...override.postgresql,
      } as PostgreSQLConfig,
    };
  }

  return {
    type,
    logging,
    slowQueryThreshold,
    sqlite: {
      ...DEFAULT_CONFIG.sqlite,
      ...base.sqlite,
      ...override.sqlite,
    } as SQLiteConfig,
  };
}
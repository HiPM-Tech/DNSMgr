// Re-export from core/connection.ts - 新数据库连接系统
export {
  connect,
  disconnect,
  getConnection,
  transaction,
  getConnectionManager,
  ConnectionManager,
} from './core/connection';

// Re-export types
export type {
  DatabaseConnection as DbConnection,
  DatabaseType as DbType,
  Transaction,
} from './core/types';

// Re-export from config.ts for types
export {
  getDatabaseConfig,
  type DatabaseConfig,
} from './core/config';

// Re-export DatabaseType from types
export type { DatabaseType } from './core/types';

// 向后兼容的辅助函数
import { getConnection } from './core/connection';

/**
 * 获取当前连接（向后兼容）
 * @deprecated 使用 getConnection() 替代
 */
export function getCurrentConnection() {
  try {
    return getConnection();
  } catch {
    return null;
  }
}

/**
 * 创建连接（向后兼容）
 * @deprecated 使用 connect() 替代
 */
export async function createConnection() {
  const { connect } = await import('./core/connection');
  return connect();
}

/**
 * 关闭连接（向后兼容）
 * @deprecated 使用 disconnect() 替代
 */
export async function closeConnection() {
  const { disconnect } = await import('./core/connection');
  return disconnect();
}

/**
 * 检查数据库是否已初始化（向后兼容）
 */
export async function isDbInitialized(): Promise<boolean> {
  try {
    const conn = getConnection();
    const type = conn.type;

    if (type === 'sqlite') {
      const result = await conn.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
      return !!result;
    } else if (type === 'mysql') {
      const result = await conn.get("SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'");
      return !!result;
    } else if (type === 'postgresql') {
      const result = await conn.get("SELECT tablename as name FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'");
      return !!result;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 检查是否有用户（向后兼容）
 */
export async function hasUsers(): Promise<boolean> {
  try {
    const conn = getConnection();
    const result = await conn.get('SELECT COUNT(*) as cnt FROM users');
    return (result as { cnt: number })?.cnt > 0;
  } catch {
    return false;
  }
}

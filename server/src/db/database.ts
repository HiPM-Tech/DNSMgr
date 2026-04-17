// @deprecated 此文件已弃用，请使用 db/connection.ts 或 db/core/connection.ts
// 此文件保留用于向后兼容，所有功能已迁移到新系统

export {
  // 新系统导出
  connect,
  disconnect,
  getConnection,
  transaction,
  getConnectionManager,
  ConnectionManager,
  // 向后兼容导出
  createConnection,
  closeConnection,
  getCurrentConnection,
  isDbInitialized,
  hasUsers,
} from './connection';

export type {
  DatabaseConnection as DbConnection,
  DatabaseType as DbType,
  Transaction,
} from './core/types';

// 向后兼容：SQLiteConnection 类型
import type { DatabaseConnection } from './core/types';
export type SQLiteConnection = DatabaseConnection;

// 向后兼容：getDb 函数
import { getConnection } from './connection';
export function getDb(): DatabaseConnection {
  return getConnection();
}

// 向后兼容：db 对象
export const db = {
  get isConnected() {
    try {
      getConnection();
      return true;
    } catch {
      return false;
    }
  },
  get type() {
    try {
      return getConnection().type;
    } catch {
      return process.env.DB_TYPE || 'sqlite';
    }
  },
};

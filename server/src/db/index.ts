// Database configuration and connection management
export * from './config';
export * from './connection';
export * from './init';

// Schema definitions
export * from './schemas';

// Legacy compatibility - maintain backward compatibility with existing code
import { getConnection, SQLiteConnection } from './connection';

/**
 * Get database instance (for backward compatibility)
 * Note: This only works with SQLite. For MySQL/PostgreSQL, use getConnection()
 * @deprecated Use getConnection() instead
 */
export function getDb(): SQLiteConnection {
  const conn = getConnection();
  if (conn.type !== 'sqlite') {
    throw new Error('getDb() only supports SQLite. Use getConnection() for other databases.');
  }
  return conn as SQLiteConnection;
}

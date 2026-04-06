// Re-export from database.ts to ensure single source of truth
// This file is kept for backward compatibility
export {
  createConnection,
  closeConnection,
  getCurrentConnection as getConnection,
  getDb,
  isDbInitialized,
  hasUsers,
  SQLiteConnection,
  type DbConnection,
  type DbType,
} from './database';

// Re-export from config.ts for types
export {
  getDatabaseConfig,
  type DatabaseConfig,
  type DatabaseType,
} from './config';

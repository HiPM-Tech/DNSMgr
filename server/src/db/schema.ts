/**
 * Database Schema Module
 *
 * This file re-exports schema definitions from the schemas/ directory.
 * All schema definitions have been moved to:
 * - schemas/sqlite.ts - SQLite schema
 * - schemas/mysql.ts - MySQL schema
 * - schemas/postgresql.ts - PostgreSQL schema
 */

import { sqliteSchema } from './schemas/sqlite';
import { mysqlSchema } from './schemas/mysql';
import { postgresqlSchema } from './schemas/postgresql';
import { getDb, SQLiteConnection } from './database';
import { log } from '../lib/logger';

// Re-export schema definitions
export { sqliteSchema, mysqlSchema, postgresqlSchema };

/**
 * Initialize database schema (legacy synchronous version - SQLite only)
 * @deprecated Use initSchemaAsync instead
 */
export function initSchema(): void {
  const db = getDb();
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Create tables
  for (const sql of sqliteSchema.createTables) {
    try {
      (db as SQLiteConnection).exec(sql);
    } catch (error) {
      log.error('Schema', 'Failed to create table', { error, sql: sql.substring(0, 100) });
      throw error;
    }
  }

  // Create indexes
  for (const sql of sqliteSchema.createIndexes) {
    try {
      (db as SQLiteConnection).exec(sql);
    } catch (error) {
      log.error('Schema', 'Failed to create index', { error, sql: sql.substring(0, 100) });
      throw error;
    }
  }

  log.info('Schema', 'Database schema initialized (SQLite)');
}

/**
 * Initialize database schema (async version - supports all database types)
 * @param conn Database connection object
 * @param reset Whether to reset (drop and recreate) existing tables
 */
export async function initSchemaAsync(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<void> },
  reset: boolean = false
): Promise<void> {
  const dbType = conn.type || 'sqlite';

  // Reset database if requested
  if (reset) {
    log.warn('Schema', 'Resetting database - dropping all tables');
    const dropTables = [
      'DROP TABLE IF EXISTS failover_status',
      'DROP TABLE IF EXISTS failover_configs',
      'DROP TABLE IF EXISTS user_tokens',
      'DROP TABLE IF EXISTS user_preferences',
      'DROP TABLE IF EXISTS user_sessions',
      'DROP TABLE IF EXISTS login_attempts',
      'DROP TABLE IF EXISTS trusted_devices',
      'DROP TABLE IF EXISTS user_webauthn_credentials',
      'DROP TABLE IF EXISTS user_totp',
      'DROP TABLE IF EXISTS user_security_settings',
      'DROP TABLE IF EXISTS security_policies',
      'DROP TABLE IF EXISTS webauthn_credentials',
      'DROP TABLE IF EXISTS user_2fa',
      'DROP TABLE IF EXISTS runtime_secrets',
      'DROP TABLE IF EXISTS system_settings',
      'DROP TABLE IF EXISTS oauth_user_links',
      'DROP TABLE IF EXISTS oauth_states',
      'DROP TABLE IF EXISTS operation_logs',
      'DROP TABLE IF EXISTS domain_permissions',
      'DROP TABLE IF EXISTS domains',
      'DROP TABLE IF EXISTS dns_accounts',
      'DROP TABLE IF EXISTS team_members',
      'DROP TABLE IF EXISTS teams',
      'DROP TABLE IF EXISTS users',
    ];

    for (const sql of dropTables) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
      } catch (error) {
        log.warn('Schema', 'Failed to drop table (may not exist)', { error: (error as Error).message });
      }
    }
  }

  // Create tables based on database type
  if (dbType === 'sqlite') {
    for (const sql of sqliteSchema.createTables) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
      } catch (error) {
        log.error('Schema', 'Failed to create table', { error, sql: sql.substring(0, 100) });
        throw error;
      }
    }

    for (const sql of sqliteSchema.createIndexes) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
      } catch (error) {
        log.error('Schema', 'Failed to create index', { error, sql: sql.substring(0, 100) });
        throw error;
      }
    }
  } else if (dbType === 'mysql') {
    for (const sql of mysqlSchema.createTables) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
      } catch (error) {
        log.error('Schema', 'Failed to create table', { error, sql: sql.substring(0, 100) });
        throw error;
      }
    }

    for (const sql of mysqlSchema.createIndexes) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
      } catch (error) {
        log.error('Schema', 'Failed to create index', { error, sql: sql.substring(0, 100) });
        throw error;
      }
    }
  } else if (dbType === 'postgresql') {
    for (const sql of postgresqlSchema.createTables) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
      } catch (error) {
        log.error('Schema', 'Failed to create table', { error, sql: sql.substring(0, 100) });
        throw error;
      }
    }

    for (const sql of postgresqlSchema.createIndexes) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
      } catch (error) {
        log.error('Schema', 'Failed to create index', { error, sql: sql.substring(0, 100) });
        throw error;
      }
    }
  } else {
    throw new Error(`Unsupported database type: ${dbType}`);
  }

  log.info('Schema', `Database schema initialized (${dbType})`);
}

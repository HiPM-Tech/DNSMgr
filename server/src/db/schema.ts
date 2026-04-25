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
import { getConnection } from './core/connection';
import type { DatabaseConnection } from './core/types';
import { log } from '../lib/logger';

/**
 * Handle MySQL-specific migrations that require application-level checks
 * (stored procedures are not supported in prepared statement protocol)
 */
async function handleMySQLMigrations(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  try {
    // Check if apex_expires_at column exists in domains table
    const checkColumnSql = `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'domains' AND COLUMN_NAME = 'apex_expires_at'`;
    
    let columnExists = false;
    if (conn.execute) {
      const result = await conn.execute(checkColumnSql) as Array<{ cnt: number }>;
      columnExists = result && result[0] && result[0].cnt > 0;
    }

    if (!columnExists) {
      try {
        const addColumnSql = `ALTER TABLE domains ADD COLUMN apex_expires_at DATETIME`;
        if (conn.execute) {
          await conn.execute(addColumnSql);
        } else if (conn.exec) {
          conn.exec(addColumnSql);
        }
        log.info('Schema', 'Added apex_expires_at column to domains table');
      } catch (error) {
        log.warn('Schema', 'Failed to add apex_expires_at column (may already exist)', { error: (error as Error).message });
      }
    } else {
      log.debug('Schema', 'apex_expires_at column already exists in domains table');
    }
  } catch (error) {
    log.warn('Schema', 'MySQL migration check failed', { error: (error as Error).message });
  }
}

// Re-export schema definitions
export { sqliteSchema, mysqlSchema, postgresqlSchema };

/**
 * Initialize database schema (legacy synchronous version - SQLite only)
 * @deprecated Use initSchemaAsync instead
 */
export async function initSchema(): Promise<void> {
  const conn = getConnection();

  // Create tables
  for (const sql of sqliteSchema.createTables) {
    try {
      await conn.execute(sql);
    } catch (error) {
      log.error('Schema', 'Failed to create table', { error, sql: sql.substring(0, 100) });
      throw error;
    }
  }

  // Create indexes
  for (const sql of sqliteSchema.createIndexes) {
    try {
      await conn.execute(sql);
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

    // Execute alter tables (migrations)
    for (const sql of sqliteSchema.alterTables || []) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
        log.info('Schema', 'Executed migration', { sql: sql.substring(0, 100) });
      } catch (error) {
        // Migration errors are logged but not thrown (idempotent)
        log.warn('Schema', 'Migration skipped (may already be applied)', { error: (error as Error).message, sql: sql.substring(0, 100) });
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

    // Execute alter tables (migrations)
    for (const sql of mysqlSchema.alterTables || []) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
        log.info('Schema', 'Executed migration', { sql: sql.substring(0, 100) });
      } catch (error) {
        // Migration errors are logged but not thrown (idempotent)
        log.warn('Schema', 'Migration skipped (may already be applied)', { error: (error as Error).message, sql: sql.substring(0, 100) });
      }
    }

    // Handle MySQL-specific migrations that require application-level checks
    // (stored procedures are not supported in prepared statement protocol)
    await handleMySQLMigrations(conn);
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

    // Execute alter tables (migrations)
    for (const sql of postgresqlSchema.alterTables || []) {
      try {
        if (conn.execute) {
          await conn.execute(sql);
        } else if (conn.exec) {
          conn.exec(sql);
        }
        log.info('Schema', 'Executed migration', { sql: sql.substring(0, 100) });
      } catch (error) {
        // Migration errors are logged but not thrown (idempotent)
        log.warn('Schema', 'Migration skipped (may already be applied)', { error: (error as Error).message, sql: sql.substring(0, 100) });
      }
    }
  } else {
    throw new Error(`Unsupported database type: ${dbType}`);
  }

  log.info('Schema', `Database schema initialized (${dbType})`);
}

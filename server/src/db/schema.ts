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
      try {
        const result = await conn.execute(checkColumnSql);
        // Handle different result formats from different MySQL drivers
        if (Array.isArray(result) && result.length > 0) {
          const row = result[0];
          if (row && typeof row === 'object') {
            // Try different possible property names
            const count = row.cnt ?? row.CNT ?? row['COUNT(*)'] ?? row.count ?? 0;
            columnExists = parseInt(String(count), 10) > 0;
          }
        }
      } catch (checkError) {
        log.warn('Schema', 'Failed to check if column exists, assuming it does not exist', { error: (checkError as Error).message });
      }
    }

    if (!columnExists) {
      try {
        const addColumnSql = `ALTER TABLE domains ADD COLUMN apex_expires_at DATETIME`;
        if (conn.execute) {
          try {
            await conn.execute(addColumnSql);
          } catch (execError) {
            // Handle async execute error
            const errorMsg = (execError as Error).message || '';
            if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
              log.info('Schema', 'apex_expires_at column already exists (detected during add)');
              return;
            }
            throw execError;
          }
        } else if (conn.exec) {
          try {
            conn.exec(addColumnSql);
          } catch (execError) {
            // Handle sync exec error
            const errorMsg = (execError as Error).message || '';
            if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
              log.info('Schema', 'apex_expires_at column already exists (detected during add)');
              return;
            }
            throw execError;
          }
        }
        log.info('Schema', 'Added apex_expires_at column to domains table');
      } catch (error) {
        // If error is duplicate column, just log it as info
        const errorMsg = (error as Error).message || '';
        if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
          log.info('Schema', 'apex_expires_at column already exists (detected during add)');
        } else {
          log.warn('Schema', 'Failed to add apex_expires_at column', { error: errorMsg });
        }
      }
    } else {
      log.debug('Schema', 'apex_expires_at column already exists in domains table');
    }

    // 迁移：删除旧的域名级 NS 监测表（已废弃，改为用户级）
    await dropOldNsMonitorTables(conn);
  } catch (error) {
    log.warn('Schema', 'MySQL migration check failed', { error: (error as Error).message });
  }
}

/**
 * 删除旧的域名级 NS 监测表（迁移到用户级）- MySQL
 */
async function dropOldNsMonitorTables(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  const oldTables = [
    'ns_monitor_configs',
    'ns_monitor_status',
    'ns_monitor_alerts'
  ];

  for (const tableName of oldTables) {
    try {
      // 检查表是否存在
      const checkTableSql = `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = '${tableName}'`;

      let tableExists = false;
      if (conn.execute) {
        const result = await conn.execute(checkTableSql);
        if (Array.isArray(result) && result.length > 0) {
          const row = result[0] as Record<string, number>;
          const count = row?.cnt ?? row?.CNT ?? row?.['COUNT(*)'] ?? row?.count ?? 0;
          tableExists = parseInt(String(count), 10) > 0;
        }
      }

      if (tableExists) {
        // 清空表数据
        try {
          if (conn.execute) {
            await conn.execute(`DELETE FROM ${tableName}`);
          } else if (conn.exec) {
            conn.exec(`DELETE FROM ${tableName}`);
          }
          log.info('Schema', `Cleared old NS monitor table: ${tableName}`);
        } catch (clearError) {
          log.warn('Schema', `Failed to clear table ${tableName}`, { error: (clearError as Error).message });
        }

        // 删除表
        try {
          if (conn.execute) {
            await conn.execute(`DROP TABLE ${tableName}`);
          } else if (conn.exec) {
            conn.exec(`DROP TABLE ${tableName}`);
          }
          log.info('Schema', `Dropped old NS monitor table: ${tableName}`);
        } catch (dropError) {
          log.warn('Schema', `Failed to drop table ${tableName}`, { error: (dropError as Error).message });
        }
      }
    } catch (error) {
      log.warn('Schema', `Error processing old NS monitor table ${tableName}`, { error: (error as Error).message });
    }
  }
}

/**
 * 删除旧的域名级 NS 监测表（迁移到用户级）- SQLite
 */
async function dropOldNsMonitorTablesSQLite(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  const oldTables = [
    'ns_monitor_configs',
    'ns_monitor_status',
    'ns_monitor_alerts'
  ];

  for (const tableName of oldTables) {
    try {
      // 检查表是否存在
      let tableExists = false;
      if (conn.execute) {
        try {
          await conn.execute(`SELECT 1 FROM ${tableName} LIMIT 1`);
          tableExists = true;
        } catch {
          tableExists = false;
        }
      } else if (conn.exec) {
        try {
          conn.exec(`SELECT 1 FROM ${tableName} LIMIT 1`);
          tableExists = true;
        } catch {
          tableExists = false;
        }
      }

      if (tableExists) {
        // 清空表数据
        try {
          if (conn.execute) {
            await conn.execute(`DELETE FROM ${tableName}`);
          } else if (conn.exec) {
            conn.exec(`DELETE FROM ${tableName}`);
          }
          log.info('Schema', `Cleared old NS monitor table: ${tableName}`);
        } catch (clearError) {
          log.warn('Schema', `Failed to clear table ${tableName}`, { error: (clearError as Error).message });
        }

        // 删除表
        try {
          if (conn.execute) {
            await conn.execute(`DROP TABLE IF EXISTS ${tableName}`);
          } else if (conn.exec) {
            conn.exec(`DROP TABLE IF EXISTS ${tableName}`);
          }
          log.info('Schema', `Dropped old NS monitor table: ${tableName}`);
        } catch (dropError) {
          log.warn('Schema', `Failed to drop table ${tableName}`, { error: (dropError as Error).message });
        }
      }
    } catch (error) {
      log.warn('Schema', `Error processing old NS monitor table ${tableName}`, { error: (error as Error).message });
    }
  }
}

/**
 * 删除旧的域名级 NS 监测表（迁移到用户级）- PostgreSQL
 */
async function dropOldNsMonitorTablesPostgreSQL(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  const oldTables = [
    'ns_monitor_configs',
    'ns_monitor_status',
    'ns_monitor_alerts'
  ];

  for (const tableName of oldTables) {
    try {
      // 检查表是否存在
      const checkTableSql = `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = '${tableName}'
      )`;

      let tableExists = false;
      if (conn.execute) {
        const result = await conn.execute(checkTableSql);
        if (Array.isArray(result) && result.length > 0) {
          const row = result[0] as Record<string, boolean>;
          tableExists = row?.exists ?? false;
        }
      }

      if (tableExists) {
        // 清空表数据
        try {
          if (conn.execute) {
            await conn.execute(`DELETE FROM ${tableName}`);
          } else if (conn.exec) {
            conn.exec(`DELETE FROM ${tableName}`);
          }
          log.info('Schema', `Cleared old NS monitor table: ${tableName}`);
        } catch (clearError) {
          log.warn('Schema', `Failed to clear table ${tableName}`, { error: (clearError as Error).message });
        }

        // 删除表
        try {
          if (conn.execute) {
            await conn.execute(`DROP TABLE IF EXISTS ${tableName}`);
          } else if (conn.exec) {
            conn.exec(`DROP TABLE IF EXISTS ${tableName}`);
          }
          log.info('Schema', `Dropped old NS monitor table: ${tableName}`);
        } catch (dropError) {
          log.warn('Schema', `Failed to drop table ${tableName}`, { error: (dropError as Error).message });
        }
      }
    } catch (error) {
      log.warn('Schema', `Error processing old NS monitor table ${tableName}`, { error: (error as Error).message });
    }
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

    // 迁移：删除旧的域名级 NS 监测表（已废弃，改为用户级）
    await dropOldNsMonitorTablesSQLite(conn);
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

    // 迁移：删除旧的域名级 NS 监测表（已废弃，改为用户级）
    await dropOldNsMonitorTablesPostgreSQL(conn);
  } else {
    throw new Error(`Unsupported database type: ${dbType}`);
  }

  log.info('Schema', `Database schema initialized (${dbType})`);
}

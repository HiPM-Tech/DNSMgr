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
    log.info('Schema', 'Starting MySQL migrations...');
    
    // 迁移1: 添加 apex_expires_at 字段到 domains 表
    try {
      const checkColumnSql = `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'domains' AND COLUMN_NAME = 'apex_expires_at'`;

      let columnExists = false;
      if (conn.execute) {
        const result = await conn.execute(checkColumnSql);
        if (Array.isArray(result) && result.length > 0) {
          const row = result[0] as Record<string, number>;
          const count = row?.cnt ?? row?.CNT ?? row?.['COUNT(*)'] ?? row?.count ?? 0;
          columnExists = parseInt(String(count), 10) > 0;
        }
      }

      if (columnExists) {
        log.debug('Schema', 'apex_expires_at column already exists in domains table');
      } else {
        // 只在字段不存在时才执行ALTER TABLE，避免触发驱动层ERROR日志
        const addColumnSql = `ALTER TABLE domains ADD COLUMN apex_expires_at DATETIME`;
        if (conn.execute) {
          await conn.execute(addColumnSql);
        } else if (conn.exec) {
          conn.exec(addColumnSql);
        }
        log.info('Schema', 'Added apex_expires_at column to domains table');
      }
    } catch (error) {
      const errorMsg = (error as Error).message || '';
      if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
        log.info('Schema', 'apex_expires_at column already exists');
      } else {
        log.warn('Schema', 'Failed to add apex_expires_at column', { error: errorMsg });
      }
    }

    // 迁移1.5: 添加 whois_status 字段到 domains 表
    try {
      const checkColumnSql = `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'domains' AND COLUMN_NAME = 'whois_status'`;

      let columnExists = false;
      if (conn.execute) {
        const result = await conn.execute(checkColumnSql);
        if (Array.isArray(result) && result.length > 0) {
          const row = result[0] as Record<string, number>;
          const count = row?.cnt ?? row?.CNT ?? row?.['COUNT(*)'] ?? row?.count ?? 0;
          columnExists = parseInt(String(count), 10) > 0;
        }
      }

      if (columnExists) {
        log.debug('Schema', 'whois_status column already exists in domains table');
      } else {
        const addColumnSql = `ALTER TABLE domains ADD COLUMN whois_status TEXT`;
        if (conn.execute) {
          await conn.execute(addColumnSql);
        } else if (conn.exec) {
          conn.exec(addColumnSql);
        }
        log.info('Schema', 'Added whois_status column to domains table');
      }
    } catch (error) {
      const errorMsg = (error as Error).message || '';
      if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
        log.info('Schema', 'whois_status column already exists');
      } else {
        log.warn('Schema', 'Failed to add whois_status column', { error: errorMsg });
      }
    }

    // 迁移2: 删除旧的域名级 NS 监测表（已废弃，改为用户级）
    await dropOldNsMonitorTables(conn);

    // 迁移3: 添加 enabled 字段到 domains 表
    log.info('Schema', 'Starting domains enabled column migration...');
    await addDomainsEnabledColumn(conn);
    log.info('Schema', 'Completed domains enabled column migration');

    // 迁移4: 添加 encrypted_ns, plain_ns, is_poisoned 字段到 ns_monitor_domains
    log.info('Schema', 'Starting ns_monitor_domains columns migration...');
    await addNsMonitorColumns(conn);
    log.info('Schema', 'Completed ns_monitor_domains columns migration');
    
    // 迁移4: 创建 whois_cache 表
    log.info('Schema', 'Starting whois_cache table migration...');
    await ensureWhoisCacheTableMySQL(conn);
    log.info('Schema', 'Completed whois_cache table migration');
    
    // 迁移5: 添加 pinned_domains 字段到 user_preferences 表
    log.info('Schema', 'Starting user_preferences pinned_domains column migration...');
    await addPinnedDomainsColumn(conn);
    log.info('Schema', 'Completed user_preferences pinned_domains column migration');

    log.info('Schema', 'Starting user_preferences avatar_image column migration...');
    await addUserPreferencesTextColumn(conn, 'avatar_image');
    log.info('Schema', 'Completed user_preferences avatar_image column migration');

    // Migration: Update dns_accounts type from dnsmgr to hidns
    await migrateDnsAccountType(conn);
    
    log.info('Schema', 'All MySQL migrations completed');
  } catch (error) {
    log.error('Schema', 'MySQL migration check failed', { error: (error as Error).message, stack: (error as Error).stack });
  }
}

/**
 * 添加 NS 监测相关字段到 ns_monitor_domains 表 - MySQL
 */
async function addNsMonitorColumns(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  log.info('Schema', 'addNsMonitorColumns called, checking ns_monitor_domains table');
  
  const columns = [
    { name: 'encrypted_ns', sql: 'ALTER TABLE ns_monitor_domains ADD COLUMN encrypted_ns TEXT' },
    { name: 'plain_ns', sql: 'ALTER TABLE ns_monitor_domains ADD COLUMN plain_ns TEXT' },
    { name: 'is_poisoned', sql: 'ALTER TABLE ns_monitor_domains ADD COLUMN is_poisoned TINYINT NOT NULL DEFAULT 0' },
    { name: 'domain_name', sql: 'ALTER TABLE ns_monitor_domains ADD COLUMN domain_name VARCHAR(255) NOT NULL DEFAULT \'\'' }
  ];

  for (const column of columns) {
    try {
      // 检查列是否存在 - 使用 SHOW COLUMNS 更可靠
      const checkColumnSql = `SHOW COLUMNS FROM ns_monitor_domains LIKE '${column.name}'`;

      let columnExists = false;
      if (conn.execute) {
        const result = await conn.execute(checkColumnSql);
        // SHOW COLUMNS 返回空数组表示字段不存在，有数据表示存在
        if (Array.isArray(result)) {
          columnExists = result.length > 0;
          log.debug('Schema', `Check ${column.name}: found ${result.length} rows, exists=${columnExists}`);
        }
      } else if (conn.exec) {
        // 对于同步exec方法，也尝试检查（虽然通常不会用到）
        log.debug('Schema', `Skipping column existence check for ${column.name} (sync connection)`);
        columnExists = false;  // 同步连接不做检查，直接尝试添加
      }

      if (columnExists) {
        log.info('Schema', `${column.name} column already exists in ns_monitor_domains table, skipping ALTER TABLE`);
        continue;  // 跳过此列，不执行ALTER TABLE
      }
      
      // 只在字段不存在时才执行ALTER TABLE，避免触发驱动层ERROR日志
      log.info('Schema', `Adding ${column.name} column to ns_monitor_domains table...`);
      if (conn.execute) {
        await conn.execute(column.sql);
      } else if (conn.exec) {
        conn.exec(column.sql);
      }
      log.info('Schema', `Successfully added ${column.name} column`);
    } catch (error) {
      const errorMsg = (error as Error).message || '';
      if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
        log.info('Schema', `${column.name} column already exists`);
      } else {
        log.warn('Schema', `Failed to add ${column.name} column`, { error: errorMsg });
      }
    }
  }
  
  // Migration: Sync domain_name from domains table for existing records (always execute)
  try {
    log.info('Schema', 'Syncing domain_name from domains table...');
    const syncSql = `
      UPDATE ns_monitor_domains n 
      INNER JOIN domains d ON n.domain_id = d.id 
      SET n.domain_name = d.name 
      WHERE n.domain_name = ''
    `;
    if (conn.execute) {
      await conn.execute(syncSql);
    } else if (conn.exec) {
      conn.exec(syncSql);
    }
    log.info('Schema', 'Successfully synced domain_name');
  } catch (error) {
    log.warn('Schema', 'Failed to sync domain_name', { error: (error as Error).message });
  }
  
  // Note: domain_id column is kept but set to NULL for backward compatibility
  // It will be deprecated in future versions
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
 * 创建 whois_cache 表 - MySQL
 */
async function ensureWhoisCacheTableMySQL(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  try {
    // Get current database name
    let dbName = '';
    if (conn.execute) {
      const dbResult = await conn.execute('SELECT DATABASE() as db');
      if (Array.isArray(dbResult) && dbResult.length > 0) {
        dbName = (dbResult[0] as Record<string, string>)?.db || '';
      }
    }

    // 检查表是否存在
    const checkTableSql = dbName
      ? `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = 'whois_cache'`
      : `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_NAME = 'whois_cache'`;

    let tableExists = false;
    if (conn.execute) {
      const result = await conn.execute(checkTableSql);
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as Record<string, number>;
        const count = row?.cnt ?? row?.CNT ?? row?.['COUNT(*)'] ?? row?.count ?? 0;
        tableExists = parseInt(String(count), 10) > 0;
      }
    }

    if (!tableExists) {
      // 创建表
      const createTableSql = `
        CREATE TABLE whois_cache (
          id INT AUTO_INCREMENT PRIMARY KEY,
          domain VARCHAR(255) NOT NULL UNIQUE,
          expiry_date DATETIME,
          apex_expiry_date DATETIME,
          registrar VARCHAR(255),
          name_servers TEXT,
          raw_data TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_domain (domain),
          INDEX idx_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `;
      
      if (conn.execute) {
        await conn.execute(createTableSql);
      } else if (conn.exec) {
        conn.exec(createTableSql);
      }
      
      log.info('Schema', 'Created whois_cache table');
    } else {
      log.debug('Schema', 'whois_cache table already exists');
    }
  } catch (error) {
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('already exists') || errorMsg.includes('ER_TABLE_EXISTS_ERROR')) {
      log.info('Schema', 'whois_cache table already already exists');
    } else {
      log.warn('Schema', 'Failed to create whois_cache table', { error: errorMsg });
    }
  }
}

/**
 * 添加 pinned_domains 字段到 user_preferences 表 - MySQL
 */
async function addPinnedDomainsColumn(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  try {
    // Get current database name
    let dbName = '';
    if (conn.execute) {
      const dbResult = await conn.execute('SELECT DATABASE() as db');
      if (Array.isArray(dbResult) && dbResult.length > 0) {
        dbName = (dbResult[0] as Record<string, string>)?.db || '';
      }
    }

    // 检查字段是否存在
    const checkColumnSql = dbName
      ? `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = 'user_preferences' AND COLUMN_NAME = 'pinned_domains'`
      : `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'user_preferences' AND COLUMN_NAME = 'pinned_domains'`;

    let columnExists = false;
    if (conn.execute) {
      const result = await conn.execute(checkColumnSql);
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as Record<string, number>;
        const count = row?.cnt ?? row?.CNT ?? row?.['COUNT(*)'] ?? row?.count ?? 0;
        columnExists = parseInt(String(count), 10) > 0;
      }
    }

    if (!columnExists) {
      // 添加字段
      const addColumnSql = `ALTER TABLE user_preferences ADD COLUMN pinned_domains JSON DEFAULT (JSON_ARRAY())`;
      if (conn.execute) {
        await conn.execute(addColumnSql);
      } else if (conn.exec) {
        conn.exec(addColumnSql);
      }
      log.info('Schema', 'Added pinned_domains column to user_preferences table');
    } else {
      log.debug('Schema', 'pinned_domains column already exists in user_preferences table');
    }
  } catch (error) {
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
      log.info('Schema', 'pinned_domains column already exists');
    } else {
      log.warn('Schema', 'Failed to add pinned_domains column', { error: errorMsg });
    }
  }
}

/**
 * 添加 enabled 字段到 domains 表 - MySQL
 */
async function addDomainsEnabledColumn(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  try {
    // Get current database name
    let dbName = '';
    if (conn.execute) {
      const dbResult = await conn.execute('SELECT DATABASE() as db');
      if (Array.isArray(dbResult) && dbResult.length > 0) {
        dbName = (dbResult[0] as Record<string, string>)?.db || '';
      }
    }

    // 检查字段是否存在
    const checkColumnSql = dbName
      ? `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = 'domains' AND COLUMN_NAME = 'enabled'`
      : `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'domains' AND COLUMN_NAME = 'enabled'`;

    let columnExists = false;
    if (conn.execute) {
      const result = await conn.execute(checkColumnSql);
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as Record<string, number>;
        const count = row?.cnt ?? row?.CNT ?? row?.['COUNT(*)'] ?? row?.count ?? 0;
        columnExists = parseInt(String(count), 10) > 0;
      }
    }

    if (!columnExists) {
      // 添加字段
      const addColumnSql = `ALTER TABLE domains ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`;
      if (conn.execute) {
        await conn.execute(addColumnSql);
      } else if (conn.exec) {
        conn.exec(addColumnSql);
      }
      log.info('Schema', 'Added enabled column to domains table');
    } else {
      log.debug('Schema', 'enabled column already exists in domains table');
    }
  } catch (error) {
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
      log.info('Schema', 'enabled column already exists');
    } else {
      log.warn('Schema', 'Failed to add enabled column', { error: errorMsg });
    }
  }
}

/**
 * 添加文本字段到 user_preferences 表 - MySQL
 */
async function addUserPreferencesTextColumn(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> },
  columnName: string
): Promise<void> {
  try {
    // Get current database name
    let dbName = '';
    if (conn.execute) {
      const dbResult = await conn.execute('SELECT DATABASE() as db');
      if (Array.isArray(dbResult) && dbResult.length > 0) {
        dbName = (dbResult[0] as Record<string, string>)?.db || '';
      }
    }

    const checkColumnSql = dbName
      ? `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME = 'user_preferences' AND COLUMN_NAME = '${columnName}'`
      : `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'user_preferences' AND COLUMN_NAME = '${columnName}'`;

    let columnExists = false;
    if (conn.execute) {
      const result = await conn.execute(checkColumnSql);
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as Record<string, number>;
        const count = row?.cnt ?? row?.CNT ?? row?.['COUNT(*)'] ?? row?.count ?? 0;
        columnExists = parseInt(String(count), 10) > 0;
      }
    }

    if (!columnExists) {
      const addColumnSql = `ALTER TABLE user_preferences ADD COLUMN ${columnName} TEXT`;
      if (conn.execute) {
        await conn.execute(addColumnSql);
      } else if (conn.exec) {
        conn.exec(addColumnSql);
      }
      log.info('Schema', `Added ${columnName} column to user_preferences table`);
    } else {
      log.debug('Schema', `${columnName} column already exists in user_preferences table`);
    }
  } catch (error) {
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('Duplicate column') || errorMsg.includes('ER_DUP_FIELDNAME')) {
      log.info('Schema', `${columnName} column already exists`);
    } else {
      log.warn('Schema', `Failed to add ${columnName} column`, { error: errorMsg });
    }
  }
}

/**
 * 检查 SQLite 列是否存在
 */
async function checkSQLiteColumnExists(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown>; query?: (sql: string, params?: unknown[]) => Promise<unknown[]> },
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    const sql = `PRAGMA table_info(${tableName})`;
    let result: unknown[] | undefined;

    if (conn.query) {
      result = await conn.query(sql);
    } else if (conn.exec) {
      // 对于同步连接，需要特殊处理
      return false; // 默认返回 false，让迁移尝试执行
    }

    if (Array.isArray(result)) {
      return result.some((row: unknown) => {
        const col = row as Record<string, string>;
        return col.name === columnName;
      });
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 添加列到 SQLite 表（带存在检查）
 */
async function addSQLiteColumn(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown>; query?: (sql: string, params?: unknown[]) => Promise<unknown[]> },
  tableName: string,
  columnName: string,
  columnDef: string
): Promise<void> {
  const exists = await checkSQLiteColumnExists(conn, tableName, columnName);
  if (exists) {
    log.debug('Schema', `Column ${columnName} already exists in ${tableName}, skipping`);
    return;
  }

  try {
    // SQLite 不支持 IF NOT EXISTS，依赖前面的检查和 catch 块
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`;
    if (conn.execute) {
      await conn.execute(sql);
    } else if (conn.exec) {
      conn.exec(sql);
    }
    log.info('Schema', `Added column ${columnName} to ${tableName}`);
  } catch (error) {
    const errorMsg = (error as Error).message || '';
    if (errorMsg.includes('duplicate column') || errorMsg.includes('already exists')) {
      // 并发情况下可能出现，这是正常的
      log.debug('Schema', `Column ${columnName} already exists in ${tableName} (concurrent migration)`);
    } else {
      throw error;
    }
  }
}

/**
 * 迁移 DNS 账号类型从 dnsmgr 到 hidns
 */
async function migrateDnsAccountType(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown>; query?: (sql: string, params?: unknown[]) => Promise<unknown[]> }
): Promise<void> {
  try {
    log.info('Schema', 'Migrating dns_accounts type from dnsmgr to hidns...');
    const sql = "UPDATE dns_accounts SET type = 'hidns' WHERE type = 'dnsmgr'";
    if (conn.execute) {
      const result = await conn.execute(sql);
      log.info('Schema', 'DNS account type migration completed', { result });
    } else if (conn.exec) {
      conn.exec(sql);
      log.info('Schema', 'DNS account type migration completed');
    }
  } catch (error) {
    log.warn('Schema', 'Failed to migrate dns_accounts type', { error: (error as Error).message });
  }
}

/**
 * 处理 SQLite 特定的迁移
 */
async function handleSQLiteMigrations(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown>; query?: (sql: string, params?: unknown[]) => Promise<unknown[]> }
): Promise<void> {
  log.info('Schema', 'Starting SQLite migrations...');

  // Migration: Add apex_expires_at column to domains table
  await addSQLiteColumn(conn, 'domains', 'apex_expires_at', 'TEXT');

  // Migration: Add whois_status column to domains table
  await addSQLiteColumn(conn, 'domains', 'whois_status', 'TEXT');

  // Migration: Add enabled column to domains table
  await addSQLiteColumn(conn, 'domains', 'enabled', 'INTEGER NOT NULL DEFAULT 1');

  // Migration: Add columns to ns_monitor_domains table
  await addSQLiteColumn(conn, 'ns_monitor_domains', 'encrypted_ns', 'TEXT');
  await addSQLiteColumn(conn, 'ns_monitor_domains', 'plain_ns', 'TEXT');
  await addSQLiteColumn(conn, 'ns_monitor_domains', 'is_poisoned', 'INTEGER NOT NULL DEFAULT 0');
  
  // Migration: Add domain_name column to ns_monitor_domains table
  await addSQLiteColumn(conn, 'ns_monitor_domains', 'domain_name', 'TEXT NOT NULL DEFAULT \'\'');
  
  // Migration: Sync domain_name from domains table for existing records
  try {
    log.info('Schema', 'Syncing domain_name from domains table (SQLite)...');
    const syncSql = `
      UPDATE ns_monitor_domains 
      SET domain_name = (
        SELECT name FROM domains WHERE domains.id = ns_monitor_domains.domain_id
      )
      WHERE domain_name = '' AND domain_id IS NOT NULL
    `;
    if (conn.exec) {
      conn.exec(syncSql);
      log.info('Schema', 'Successfully synced domain_name (SQLite)');
    }
  } catch (error) {
    log.warn('Schema', 'Failed to sync domain_name (SQLite)', { error: (error as Error).message });
  }
  
  // Note: domain_id column is kept but set to NULL for backward compatibility
  // It will be deprecated in future versions

  // Migration: Add pinned_domains column to user_preferences table
  await addSQLiteColumn(conn, 'user_preferences', 'pinned_domains', "TEXT DEFAULT '[]'");
  await addSQLiteColumn(conn, 'user_preferences', 'avatar_image', 'TEXT');

  // 迁移：删除旧的域名级 NS 监测表
  await dropOldNsMonitorTablesSQLite(conn);

  // Migration: Update dns_accounts type from dnsmgr to hidns
  await migrateDnsAccountType(conn);

  log.info('Schema', 'SQLite migrations completed');
}

/**
 * 删除旧的域名级 NS 监测表（迁移到用户级）- SQLite
 */
async function dropOldNsMonitorTablesSQLite(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown>; query?: (sql: string, params?: unknown[]) => Promise<unknown[]> }
): Promise<void> {
  const oldTables = [
    'ns_monitor_configs',
    'ns_monitor_status',
    'ns_monitor_alerts'
  ];

  for (const tableName of oldTables) {
    try {
      // 直接使用 DROP TABLE IF EXISTS，无需先检查
      if (conn.execute) {
        await conn.execute(`DROP TABLE IF EXISTS ${tableName}`);
      } else if (conn.exec) {
        conn.exec(`DROP TABLE IF EXISTS ${tableName}`);
      }
      log.info('Schema', `Dropped old NS monitor table (if exists): ${tableName}`);
    } catch (error) {
      // DROP TABLE IF EXISTS 不应该失败，但如果失败了只记录警告
      log.warn('Schema', `Failed to drop table ${tableName}`, { error: (error as Error).message });
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
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<void>; query?: (sql: string, params?: unknown[]) => Promise<unknown[]> },
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

    // Execute SQLite-specific migrations (with column existence checks)
    await handleSQLiteMigrations(conn);
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

    // Migration: Update dns_accounts type from dnsmgr to hidns
    await migrateDnsAccountType(conn);
  } else {
    throw new Error(`Unsupported database type: ${dbType}`);
  }

  log.info('Schema', `Database schema initialized (${dbType})`);
}

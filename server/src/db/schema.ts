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
import { SchemaVersionManager } from './migration-manager';

/**
 * Execute a migration with version tracking
 */
async function executeMigration(
  versionManager: SchemaVersionManager,
  description: string,
  migrationFn: () => Promise<void>
): Promise<void> {
  // Check if version table exists
  const hasVersionTable = await versionManager.hasVersionTable();
  
  if (!hasVersionTable) {
    // Auto-detect and promote if database appears to be already migrated
    log.info('Schema', 'schema_versions table not found, attempting auto-detection...');
    const isPromoted = await versionManager.autoDetectAndPromote(description);
    
    if (isPromoted) {
      log.info('Schema', 'Auto-detection successful, skipping migration');
      return;
    }
    // If not promoted, continue with normal migration flow
  } else {
    // Version table exists, check normally
    const isApplied = await versionManager.isCurrentVersionApplied();
    
    if (isApplied) {
      log.info('Schema', `Schema version ${versionManager.getCurrentVersion()} already applied, skipping`);
      return;
    }
  }
  
  const startTime = Date.now();
  log.info('Schema', `Applying schema version ${versionManager.getCurrentVersion()}: ${description}`);
  
  try {
    await migrationFn();
    const executionTime = Date.now() - startTime;
    await versionManager.recordSuccess(description, executionTime);
    log.info('Schema', `Schema version ${versionManager.getCurrentVersion()} completed successfully in ${executionTime}ms`);
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorMessage = (error as Error).message;
    await versionManager.recordFailure(description, errorMessage, executionTime);
    log.error('Schema', `Schema version ${versionManager.getCurrentVersion()} failed after ${executionTime}ms: ${errorMessage}`);
    throw error;
  }
}

/**
 * Handle MySQL-specific migrations that require application-level checks
 * (stored procedures are not supported in prepared statement protocol)
 */
async function handleMySQLMigrations(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  const versionManager = new SchemaVersionManager(conn, mysqlSchema);
  
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
    
    // Use transaction for domain_id cleanup to ensure same connection
    const mysqlDriver = (conn as any).driver;
    if (mysqlDriver && mysqlDriver.beginTransaction) {
      let tx: any = null;
      try {
        tx = await mysqlDriver.beginTransaction();
        log.info('Schema', 'Transaction started for ns_monitor_domains migration');
        
        // Create a wrapper that uses the transaction
        const txConn = {
          type: 'mysql' as const,
          execute: async (sql: string, params?: unknown[]) => {
            await tx.execute(sql, params);
          }
        };
        
        await addNsMonitorColumns(txConn);
        
        // Commit transaction
        await tx.commit?.();
        log.info('Schema', 'Transaction committed');
      } catch (error) {
        // Rollback on error
        try {
          await tx?.rollback?.();
          log.info('Schema', 'Transaction rolled back');
        } catch (rollbackError) {
          log.warn('Schema', 'Failed to rollback', { error: (rollbackError as Error).message });
        }
        throw error;
      }
    } else {
      // Fallback: use regular connection (may have issues with FK checks)
      log.warn('Schema', 'Transaction not available, using regular connection');
      await addNsMonitorColumns(conn);
    }
    
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

    // Migration: Add enabled field to dns_accounts table using export-rebuild pattern
    await executeMigration(
      versionManager,
      'Add enabled column to dns_accounts table (export-rebuild)',
      async () => {
        // Check if migration is needed
        const checkSql = `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'dns_accounts' AND COLUMN_NAME = 'enabled'`;
        
        let needMigration = true;
        if (conn.execute) {
          const result = await conn.execute(checkSql) as any[];
          if (Array.isArray(result) && result.length > 0) {
            const count = (result[0] as any).cnt;
            needMigration = count === 0;
          }
        }
        
        if (!needMigration) {
          log.info('Schema', 'enabled column already exists in dns_accounts, skipping migration');
          return;
        }
        
        log.info('Schema', 'Starting export-rebuild migration for dns_accounts...');
        
        if (conn.execute) {
          // Step 0: Clean up any leftover temporary table from previous failed migration
          await conn.execute(`DROP TABLE IF EXISTS dns_accounts_new`);
          log.info('Schema', 'Step 0: Cleaned up any existing dns_accounts_new table');
          
          // Step 1: Create new table with enabled column
          await conn.execute(`
            CREATE TABLE dns_accounts_new (
              id INT AUTO_INCREMENT PRIMARY KEY,
              type VARCHAR(100) NOT NULL,
              name VARCHAR(255) NOT NULL,
              config JSON,
              remark TEXT NOT NULL DEFAULT '',
              created_by INT NOT NULL,
              team_id INT DEFAULT NULL,
              enabled TINYINT(1) NOT NULL DEFAULT 1,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_created_by (created_by),
              INDEX idx_team_id (team_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          log.info('Schema', 'Step 1: Created dns_accounts_new table');
          
          // Step 2: Copy data from old table
          await conn.execute(`
            INSERT INTO dns_accounts_new (id, type, name, config, remark, created_by, team_id, enabled, created_at)
            SELECT id, type, name, config, remark, created_by, team_id, 
                   COALESCE(enabled, 1) as enabled, created_at
            FROM dns_accounts
          `);
          log.info('Schema', 'Step 2: Copied data to dns_accounts_new');
          
          // Step 3: Drop old table
          await conn.execute(`DROP TABLE dns_accounts`);
          log.info('Schema', 'Step 3: Dropped old dns_accounts table');
          
          // Step 4: Rename new table
          await conn.execute(`ALTER TABLE dns_accounts_new RENAME TO dns_accounts`);
          log.info('Schema', 'Step 4: Renamed dns_accounts_new to dns_accounts');
          
          log.info('Schema', 'Export-rebuild migration completed successfully');
        }
      }
    );

    // Migration: Update dns_accounts type from dnsmgr to hidns
    await migrateDnsAccountType(conn);
    
    log.info('Schema', 'All MySQL migrations completed');
  } catch (error) {
    log.error('Schema', 'MySQL migration check failed', { error: (error as Error).message, stack: (error as Error).stack });
  }
}

/**
 * 添加 NS 监測相关字段到 ns_monitor_domains 表 - MySQL
 */
async function addNsMonitorColumns(
  conn: { type: string; exec?: (sql: string) => void; execute?: (sql: string, params?: unknown[]) => Promise<unknown> }
): Promise<void> {
  log.info('Schema', 'addNsMonitorColumns called, checking ns_monitor_domains table');
  
  // Check if domain_name column already exists
  let domainNameExists = false;
  try {
    const checkSql = conn.type === 'mysql' 
      ? `SHOW COLUMNS FROM ns_monitor_domains LIKE 'domain_name'`
      : `PRAGMA table_info(ns_monitor_domains)`;
    
    if (conn.execute) {
      const result = await conn.execute(checkSql);
      if (Array.isArray(result)) {
        if (conn.type === 'mysql') {
          domainNameExists = result.length > 0;
        } else {
          // SQLite PRAGMA returns all columns, check if domain_name is in the list
          domainNameExists = result.some((row: any) => row.name === 'domain_name');
        }
        log.info('Schema', `domain_name column exists: ${domainNameExists}`);
      }
    } else if (conn.exec) {
      // For sync connections, skip check and assume migration needed
      log.debug('Schema', 'Skipping column existence check for sync connection');
      domainNameExists = false;
    }
  } catch (error) {
    log.warn('Schema', 'Failed to check domain_name existence', { error: (error as Error).message });
    domainNameExists = false;
  }
  
  // Only skip adding the column if it already exists, but continue with other migrations
  if (!domainNameExists) {
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
  } else {
    log.info('Schema', 'domain_name column already exists, skipping column addition');
  }
  
  // Always sync domain_name data (even if column already exists)
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
  
  // Always drop domain_id column (for performance)
  try {
    log.info('Schema', 'Starting domain_id cleanup (FK + column)...');
    
    if (conn.execute) {
      
      // Step 1: Try to drop foreign key constraints
      log.info('Schema', 'Attempting to drop FK constraints on domain_id...');
      
      const possibleFkNames = [
        'ns_monitor_domains_ibfk_1',
        'ns_monitor_domains_ibfk_2', 
        'ns_monitor_domains_ibfk_3',
        'fk_ns_monitor_domains_domain_id',
        'ns_monitor_domains_domain_id_fkey'
      ];
      
      for (const fkName of possibleFkNames) {
        try {
          await conn.execute(`ALTER TABLE ns_monitor_domains DROP FOREIGN KEY ${fkName}`);
          log.info('Schema', `Successfully dropped FK: ${fkName}`);
        } catch (error) {
          const errorMsg = (error as Error).message || '';
          if (!errorMsg.includes('check that it exists') && !errorMsg.includes('ER_CANT_DROP_FIELD_OR_KEY')) {
            log.debug('Schema', `FK ${fkName} does not exist or already dropped`);
          }
        }
      }
      
      // Step 2: Clean up duplicate records
      log.info('Schema', 'Checking for duplicate (user_id, domain_name) combinations...');
      try {
        const findDuplicatesSql = `
          SELECT user_id, domain_name, COUNT(*) as count
          FROM ns_monitor_domains
          GROUP BY user_id, domain_name
          HAVING count > 1
        `;
        
        const duplicates = await conn.execute(findDuplicatesSql) as any[];
        if (Array.isArray(duplicates) && duplicates.length > 0) {
          log.warn('Schema', `Found ${duplicates.length} duplicate combinations`);
          
          const cleanupSql = `
            DELETE n1 FROM ns_monitor_domains n1
            INNER JOIN ns_monitor_domains n2 
            WHERE n1.id > n2.id 
            AND n1.user_id = n2.user_id 
            AND n1.domain_name = n2.domain_name
          `;
          await conn.execute(cleanupSql);
          log.info('Schema', 'Cleaned up duplicate records');
        } else {
          log.info('Schema', 'No duplicate records found');
        }
      } catch (cleanupError) {
        log.error('Schema', 'Failed to cleanup duplicates', { error: (cleanupError as Error).message });
      }
      
      // Step 3: Drop the unique index
      log.info('Schema', 'Dropping unique_user_domain index...');
      try {
        await conn.execute('ALTER TABLE ns_monitor_domains DROP INDEX unique_user_domain');
        log.info('Schema', 'Successfully dropped unique_user_domain index');
      } catch (indexError) {
        log.warn('Schema', 'Failed to drop unique_user_domain index', { error: (indexError as Error).message });
      }
      
      // Step 4: Drop the domain_id column
      log.info('Schema', 'Dropping domain_id column...');
      try {
        await conn.execute('ALTER TABLE ns_monitor_domains DROP COLUMN domain_id');
        log.info('Schema', 'Successfully dropped domain_id column');
      } catch (dropError) {
        const errorMsg = (dropError as Error).message || '';
        if (errorMsg.includes('Duplicate entry')) {
          // If there's a duplicate entry error, it means the unique index is causing issues
          // Try to drop the column with CASCADE (MySQL doesn't support this, so we'll just log and continue)
          log.warn('Schema', 'Cannot drop domain_id due to unique constraint conflicts. Manual intervention may be required.');
          log.warn('Schema', 'Please manually execute: ALTER TABLE ns_monitor_domains DROP COLUMN domain_id;');
          throw dropError; // Re-throw to indicate failure
        } else {
          throw dropError;
        }
      }
      
      // Step 5: Recreate the unique index
      log.info('Schema', 'Recreating unique_user_domain index...');
      try {
        await conn.execute('ALTER TABLE ns_monitor_domains ADD UNIQUE KEY unique_user_domain (user_id, domain_name)');
        log.info('Schema', 'Successfully recreated unique_user_domain index');
      } catch (recreateError) {
        log.error('Schema', 'Failed to recreate unique_user_domain index', { error: (recreateError as Error).message });
      }
      
      // Step 6: Drop the idx_domain_id index
      log.info('Schema', 'Dropping idx_domain_id index...');
      try {
        await conn.execute('DROP INDEX idx_domain_id ON ns_monitor_domains');
        log.info('Schema', 'Successfully dropped idx_domain_id index');
      } catch (indexError) {
        const errorMsg = (indexError as Error).message || '';
        if (errorMsg.includes('CANT_DROP') || errorMsg.includes('check that key/index exists')) {
          log.info('Schema', 'idx_domain_id index already dropped');
        } else {
          log.warn('Schema', 'Failed to drop idx_domain_id index', { error: errorMsg });
        }
      }
    }
    
    log.info('Schema', 'Completed domain_id cleanup');
  } catch (error) {
    log.error('Schema', 'Failed to cleanup domain_id', { error: (error as Error).message });
    throw error; // Re-throw to trigger transaction rollback
  }
}

/**
 * 删除旧的域名级 NS 监測表（迁移到用户级）- MySQL
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
  const versionManager = new SchemaVersionManager(conn, sqliteSchema);
  
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
  
  // Check if domain_name column already exists before adding
  let domainNameExists = false;
  try {
    if (conn.query) {
      const result = await conn.query('PRAGMA table_info(ns_monitor_domains)') as unknown[];
      if (Array.isArray(result)) {
        domainNameExists = result.some((row: any) => row.name === 'domain_name');
        log.info('Schema', `domain_name column exists: ${domainNameExists}`);
      }
    } else {
      // If query is not available, assume migration is needed
      log.debug('Schema', 'query method not available, assuming migration needed');
      domainNameExists = false;
    }
  } catch (error) {
    log.warn('Schema', 'Failed to check domain_name existence', { error: (error as Error).message });
  }
  
  if (!domainNameExists) {
    // Migration: Add domain_name column to ns_monitor_domains table
    await addSQLiteColumn(conn, 'ns_monitor_domains', 'domain_name', 'TEXT NOT NULL DEFAULT \'\'');
  } else {
    log.info('Schema', 'domain_name column already exists, skipping column addition');
  }
  
  // Always sync domain_name data (even if column already exists)
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
  
  // Always drop domain_id column (for performance)
  try {
    log.info('Schema', 'Dropping domain_id column (SQLite)...');
    if (conn.exec) {
      // Step 0: Clean up any leftover temporary table from previous failed migration
      conn.exec('DROP TABLE IF EXISTS ns_monitor_domains_new');
      log.info('Schema', 'Step 0: Cleaned up any existing ns_monitor_domains_new table');
      
      // SQLite requires table recreation to drop columns
      conn.exec(`
        CREATE TABLE ns_monitor_domains_new AS
        SELECT id, user_id, domain_name, expected_ns, current_ns, encrypted_ns, plain_ns,
               is_poisoned, status, enabled, last_check_at, last_alert_at, alert_count,
               created_at, updated_at
        FROM ns_monitor_domains
      `);
      conn.exec('DROP TABLE ns_monitor_domains');
      conn.exec('ALTER TABLE ns_monitor_domains_new RENAME TO ns_monitor_domains');
      
      // Recreate indexes (without domain_id index)
      conn.exec('CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_user_id ON ns_monitor_domains(user_id)');
      conn.exec('CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_domain_name ON ns_monitor_domains(domain_name)');
      conn.exec('CREATE INDEX IF NOT EXISTS idx_ns_monitor_domains_enabled ON ns_monitor_domains(enabled)');
      conn.exec('CREATE UNIQUE INDEX IF NOT EXISTS unique_user_domain ON ns_monitor_domains(user_id, domain_name)');
      
      log.info('Schema', 'Successfully dropped domain_id column and recreated indexes (SQLite)');
    }
  } catch (error) {
    log.error('Schema', 'Failed to drop domain_id column (SQLite)', { error: (error as Error).message });
  }

  // Migration: Add pinned_domains column to user_preferences table
  await addSQLiteColumn(conn, 'user_preferences', 'pinned_domains', "TEXT DEFAULT '[]'");
  await addSQLiteColumn(conn, 'user_preferences', 'avatar_image', 'TEXT');

  // 迁移：删除旧的域名级 NS 监測表
  await dropOldNsMonitorTablesSQLite(conn);

  // Migration: Add enabled field to dns_accounts table
  await executeMigration(
    versionManager,
    'Add enabled column to dns_accounts table (SQLite)',
    async () => {
      await addSQLiteColumn(conn, 'dns_accounts', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
    }
  );

  // Migration: Update dns_accounts type from dnsmgr to hidns
  await migrateDnsAccountType(conn);

  log.info('Schema', 'SQLite migrations completed');
}

/**
 * 删除旧的域名级 NS 监測表（迁移到用户级）- SQLite
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
 * 删除旧的域名级 NS 监測表（迁移到用户级）- PostgreSQL
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

    // Record PostgreSQL schema version after migrations
    try {
      const versionManager = new SchemaVersionManager(conn, postgresqlSchema);
      const isApplied = await versionManager.isCurrentVersionApplied();
      if (!isApplied) {
        await versionManager.recordSuccess('PostgreSQL initial migrations (including dns_accounts.enabled)', 0);
      }
    } catch (error) {
      log.warn('Schema', 'Failed to record PostgreSQL migration version', { error: (error as Error).message });
    }

    // 迁移：删除旧的域名级 NS 监測表（已废弃，改为用户级）
    await dropOldNsMonitorTablesPostgreSQL(conn);

    // Migration: Update dns_accounts type from dnsmgr to hidns
    await migrateDnsAccountType(conn);
  } else {
    throw new Error(`Unsupported database type: ${dbType}`);
  }

  log.info('Schema', `Database schema initialized (${dbType})`);
}

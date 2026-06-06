import { getConnection } from './dal/connection';
import type { DatabaseConnection, DatabaseType } from './dal/types';
import { sqliteSchema } from './dsm/schemas/dialects/sqlite';
import { mysqlSchema } from './dsm/schemas/dialects/mysql';
import { postgresqlSchema } from './dsm/schemas/dialects/postgresql';
import { getDatabaseConfig } from './dal/config';
import fs from 'fs';
import path from 'path';
import { initializeDSM } from './dsm/init-dsm';
import { createLogger } from '../lib/logger';

const log = createLogger('DAL').sub('Init');
export async function initSchema(): Promise<void> {
  const config = getDatabaseConfig();

  // Special handling for SQLite: check if database file exists
  if (config.type === 'sqlite') {
    const dbPath = (config as any).path;
    const dbFileExists = fs.existsSync(dbPath);

    if (!dbFileExists) {
      // Database file doesn't exist - this is a fresh install
      // Don't create the file yet, let the web initialization handle it
      log.info('SQLite database file not found, entering initialization mode');
      log.info('Please complete the web initialization wizard to configure the database');
      return;
    }

    // File exists, continue with normal checks
    log.info('SQLite database file found, checking system status...');
  }

  const conn = getConnection();
  const type = conn.type;

  // Step 1: Check if schema_versions table exists AND is HiDNS system
  const isHiDNSSystem = await checkHiDNSSystem(conn);

  if (isHiDNSSystem) {
    // System is already initialized as HiDNS, check if users exist
    log.info('HiDNS system detected via schema_versions');

    const hasUsers = await checkUsersExist(conn);
    if (!hasUsers) {
      log.warn('HiDNS system found but no users exist, entering initialization mode');
      log.info('Please complete the web initialization wizard to create admin user');
      return;
    }

    log.info('HiDNS system fully initialized, running migration checks...');
    // Continue to migration handling below - will call initSchemaAsync
  } else {
    // Not a HiDNS system, check if it's a legacy system or first-time setup

    // Step 2: Check if this is a legacy system that needs migration detection
    const isLegacySystem = await checkLegacySystem(conn);

    if (isLegacySystem) {
      log.info('Legacy system detected, running migration detection...');
      // Migration will be handled by handleMySQLMigrations/handleSQLiteMigrations
      // which includes auto-detection and promotion logic
      return;
    }

    // Step 3: First-time initialization - create all tables
    log.info('First-time initialization, creating schema...');

    switch (type) {
      case 'mysql':
        await initMySQLSchema(conn);
        break;
      case 'postgresql':
        await initPostgreSQLSchema(conn);
        break;
      case 'sqlite':
      default:
        await initSQLiteSchema(conn);
        break;
    }

    log.info('Initial schema setup complete');
    // DO NOT return here! Continue to migration checks to handle legacy databases
  }

  // Step 4: Run DSM for HiDNS systems
  log.info('Running DSM reconciliation...');
  await initializeDSM();

  log.info('DSM reconciliation completed');
}

/**
 * Check if this is a HiDNS system by verifying schema_versions table exists and has hidns marker
 */
async function checkHiDNSSystem(conn: DatabaseConnection): Promise<boolean> {
  try {
    const dbType = conn.type;
    let sql = '';

    switch (dbType) {
      case 'mysql':
        sql = `SELECT COUNT(*) as count FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = 'schema_versions'`;
        break;
      case 'postgresql':
        sql = `SELECT COUNT(*) as count FROM information_schema.tables
               WHERE table_name = 'schema_versions'`;
        break;
      case 'sqlite':
        sql = `SELECT COUNT(*) as count FROM sqlite_master
               WHERE type='table' AND name='schema_versions'`;
        break;
    }

    const result = await conn.execute(sql);
    if (Array.isArray(result) && result.length > 0) {
      const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
      const tableExists = parseInt(String(count), 10) > 0;

      if (!tableExists) {
        return false;
      }

      // Table exists, check if it has HiDNS marker
      const versionCheck = await conn.execute(
        "SELECT COUNT(*) as count FROM schema_versions WHERE system_type = 'hidns' LIMIT 1"
      );

      if (Array.isArray(versionCheck) && versionCheck.length > 0) {
        const versionCount = (versionCheck[0] as any).count || (versionCheck[0] as any)['COUNT(*)'];
        return parseInt(String(versionCount), 10) > 0;
      }

      return false;
    }

    return false;
  } catch (error) {
    log.debug('HiDNS system check failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Check if users table has any data
 */
async function checkUsersExist(conn: DatabaseConnection): Promise<boolean> {
  try {
    const result = await conn.execute('SELECT COUNT(*) as count FROM users');
    if (Array.isArray(result) && result.length > 0) {
      const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
      return parseInt(String(count), 10) > 0;
    }
    return false;
  } catch (error) {
    log.warn('Failed to check users table', { error: (error as Error).message });
    return false;
  }
}

/**
 * Check if this is a legacy system by verifying key tables exist
 * Legacy systems have the 4 core tables but no schema_versions table
 */
async function checkLegacySystem(conn: DatabaseConnection): Promise<boolean> {
  try {
    const dbType = conn.type;

    // Check for 4 critical tables:
    // 1. domains (域名列表)
    // 2. users (用户列表)
    // 3. ns_monitor_domains (NS表)
    // 4. whois_cache (WHOIS缓存表)

    const requiredTables = ['domains', 'users', 'ns_monitor_domains', 'whois_cache'];
    let existingCount = 0;

    for (const tableName of requiredTables) {
      const exists = await checkTableExists(conn, tableName);
      if (exists) {
        existingCount++;
      }
    }

    // If all 4 tables exist but schema_versions doesn't, it's a legacy system
    const isLegacy = existingCount === requiredTables.length;

    if (isLegacy) {
      log.info(`Legacy system detected: all ${requiredTables.length} core tables exist`);
    } else {
      log.debug(`Not a legacy system: ${existingCount}/${requiredTables.length} core tables found`);
    }

    return isLegacy;
  } catch (error) {
    log.warn('Failed to check legacy system status', { error: (error as Error).message });
    return false;
  }
}

/**
 * Check if a specific table exists
 */
async function checkTableExists(conn: DatabaseConnection, tableName: string): Promise<boolean> {
  try {
    // Whitelist validation to prevent SQL injection
    const allowedTables = [
      'users', 'dns_accounts', 'domains', 'domain_records', 'teams',
      'team_members', 'team_accounts', 'api_tokens', 'token_domain_permissions',
      'domain_permissions', 'oauth_states', 'audit_logs', 'security_policies',
      'trusted_devices', 'renewable_domains', 'ns_monitors', 'rdap_cache',
      'system_cache', 'password_resets'
    ];

    if (!allowedTables.includes(tableName)) {
      throw new Error(`Invalid table name: ${tableName}`);
    }

    const dbType = conn.type;
    let sql = '';

    switch (dbType) {
      case 'mysql':
        sql = `SELECT COUNT(*) as count FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = ?`;
        break;
      case 'postgresql':
        sql = `SELECT COUNT(*) as count FROM information_schema.tables
               WHERE table_name = ?`;
        break;
      case 'sqlite':
        sql = `SELECT COUNT(*) as count FROM sqlite_master
               WHERE type='table' AND name=?`;
        break;
    }

    const result = await conn.execute(sql, [tableName]);
    if (Array.isArray(result) && result.length > 0) {
      const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
      return parseInt(String(count), 10) > 0;
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if schema_versions table exists
 */
async function checkVersionTableExists(conn: DatabaseConnection): Promise<boolean> {
  try {
    const dbType = conn.type;
    let sql = '';

    switch (dbType) {
      case 'mysql':
        sql = `SELECT COUNT(*) as count FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = 'schema_versions'`;
        break;
      case 'postgresql':
        sql = `SELECT COUNT(*) as count FROM information_schema.tables
               WHERE table_name = 'schema_versions'`;
        break;
      case 'sqlite':
        sql = `SELECT COUNT(*) as count FROM sqlite_master
               WHERE type='table' AND name='schema_versions'`;
        break;
    }

    const result = await conn.execute(sql);
    if (Array.isArray(result) && result.length > 0) {
      const count = (result[0] as any).count || (result[0] as any)['COUNT(*)'];
      return parseInt(String(count), 10) > 0;
    }

    return false;
  } catch (error) {
    log.debug('schema_versions table does not exist', { error: (error as Error).message });
    return false;
  }
}

async function initSQLiteSchema(conn: DatabaseConnection): Promise<void> {
  // 创建表
  for (const sql of sqliteSchema.createTables) {
    await conn.execute(sql);
  }

  // Migration: Ensure dns_accounts.enabled column exists before creating index
  // (for databases created by older versions without this column)
  try {
    // 先检查列是否存在，避免不必要的 SQL 执行
    const columns = await conn.query('PRAGMA table_info(dns_accounts)') as any[];
    const hasEnabledColumn = columns.some((col: any) => col.name.replace(/["'`]/g, '') === 'enabled');

    if (!hasEnabledColumn) {
      await conn.execute("ALTER TABLE dns_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1");
      log.info('Added enabled column to dns_accounts table');
    } else {
      log.debug('enabled column already exists in dns_accounts table');
    }
  } catch (e) {
    // 如果 PRAGMA 查询失败，回退到旧的方式
    if (e instanceof Error && !e.message.toLowerCase().includes('duplicate column')) {
      throw e;
    }
  }

  // 创建索引
  for (const sql of sqliteSchema.createIndexes) {
    await conn.execute(sql);
  }

  log.info('SQLite schema initialized');
}

async function initMySQLSchema(conn: DatabaseConnection): Promise<void> {
  // 创建表（IF NOT EXISTS 会自动跳过已存在的表）
  for (const sql of mysqlSchema.createTables) {
    await conn.execute(sql);
  }

  // 创建索引
  for (const sql of mysqlSchema.createIndexes) {
    try {
      await conn.execute(sql);
    } catch (e) {
      // 忽略已存在的索引错误
      if (e instanceof Error &&
          (e.message.includes('Duplicate') || e.message.includes('already exists'))) {
        continue;
      }
      throw e;
    }
  }

  log.info('MySQL schema initialized');
}

async function initPostgreSQLSchema(conn: DatabaseConnection): Promise<void> {
  // 创建表和索引（PostgreSQL schema 中已包含索引创建）
  for (const sql of postgresqlSchema.createTables) {
    try {
      await conn.execute(sql);
    } catch (e) {
      // 忽略已存在的错误
      if (!(e instanceof Error && e.message.includes('already exists'))) {
        throw e;
      }
    }
  }

  log.info('PostgreSQL schema initialized');
}

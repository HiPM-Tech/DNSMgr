import { getConnection } from './core/connection';
import type { DatabaseConnection, DatabaseType } from './core/types';
import { sqliteSchema } from './schemas/sqlite';
import { mysqlSchema } from './schemas/mysql';
import { postgresqlSchema } from './schemas/postgresql';
import { getDatabaseConfig } from './core/config';
import fs from 'fs';
import path from 'path';
import { log } from '../lib/logger';

export async function initSchema(): Promise<void> {
  const config = getDatabaseConfig();
  
  // Special handling for SQLite: check if database file exists
  if (config.type === 'sqlite') {
    const dbPath = (config as any).path;
    const dbFileExists = fs.existsSync(dbPath);
    
    if (!dbFileExists) {
      // Database file doesn't exist - this is a fresh install
      // Don't create the file yet, let the web initialization handle it
      log.info('DB', 'SQLite database file not found, entering initialization mode');
      log.info('DB', 'Please complete the web initialization wizard to configure the database');
      return;
    }
    
    // File exists, continue with normal checks
    log.info('DB', 'SQLite database file found, checking system status...');
  }
  
  const conn = getConnection();
  const type = conn.type;

  // Step 1: Check if schema_versions table exists AND is HiDNS system
  const isHiDNSSystem = await checkHiDNSSystem(conn);
  
  if (isHiDNSSystem) {
    // System is already initialized as HiDNS, skip everything
    log.info('DB', 'HiDNS system detected via schema_versions, skipping initialization');
    return;
  }

  // Step 2: Check if this is a legacy system that needs migration detection
  const isLegacySystem = await checkLegacySystem(conn);
  
  if (isLegacySystem) {
    log.info('DB', 'Legacy system detected, running migration detection...');
    // Migration will be handled by handleMySQLMigrations/handleSQLiteMigrations
    // which includes auto-detection and promotion logic
    return;
  }
  
  // Step 3: First-time initialization - create all tables
  log.info('DB', 'First-time initialization, creating schema...');

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
  
  log.info('DB', 'Initial schema setup complete');
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
    log.debug('DB', 'HiDNS system check failed', { error: (error as Error).message });
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
      log.info('DB', `Legacy system detected: all ${requiredTables.length} core tables exist`);
    } else {
      log.debug('DB', `Not a legacy system: ${existingCount}/${requiredTables.length} core tables found`);
    }
    
    return isLegacy;
  } catch (error) {
    log.warn('DB', 'Failed to check legacy system status', { error: (error as Error).message });
    return false;
  }
}

/**
 * Check if a specific table exists
 */
async function checkTableExists(conn: DatabaseConnection, tableName: string): Promise<boolean> {
  try {
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
    log.debug('DB', 'schema_versions table does not exist', { error: (error as Error).message });
    return false;
  }
}

async function initSQLiteSchema(conn: DatabaseConnection): Promise<void> {
  // 创建表
  for (const sql of sqliteSchema.createTables) {
    await conn.execute(sql);
  }

  // 创建索引
  for (const sql of sqliteSchema.createIndexes) {
    await conn.execute(sql);
  }

  log.info('DB', 'SQLite schema initialized');
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

  log.info('DB', 'MySQL schema initialized');
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

  log.info('DB', 'PostgreSQL schema initialized');
}

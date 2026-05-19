import { getConnection } from './core/connection';
import type { DatabaseConnection, DatabaseType } from './core/types';
import { sqliteSchema } from './schemas/sqlite';
import { mysqlSchema } from './schemas/mysql';
import { postgresqlSchema } from './schemas/postgresql';
import { UserOperations } from './business-adapter';
import bcrypt from 'bcryptjs';
import { log } from '../lib/logger';

export async function initSchema(): Promise<void> {
  const conn = getConnection();
  const type = conn.type;

  // Step 1: Check if schema_versions table exists
  const hasVersionTable = await checkVersionTableExists(conn);
  
  if (hasVersionTable) {
    // System already initialized, skip table creation
    log.info('DB', 'Schema versions table found, skipping initial schema creation');
    
    // Check if users table has data
    const hasUsers = await checkUsersExist(conn);
    if (!hasUsers) {
      log.warn('DB', 'No users found in database, creating default admin user...');
      await createDefaultAdminUser(conn);
    } else {
      log.info('DB', 'Users table has data, initialization complete');
    }
    return;
  }
  
  // Step 2: First-time initialization - create all tables
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
  
  // Step 3: Create default admin user
  log.info('DB', 'Creating default admin user...');
  await createDefaultAdminUser(conn);
  
  log.info('DB', 'Initial schema setup complete');
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
    log.warn('DB', 'Failed to check users table', { error: (error as Error).message });
    return false;
  }
}

/**
 * Create default admin user
 */
async function createDefaultAdminUser(conn: DatabaseConnection): Promise<void> {
  try {
    // Check if admin user already exists
    const existing = await UserOperations.getByUsername('admin');
    if (existing) {
      log.info('DB', 'Admin user already exists');
      return;
    }
    
    // Create default admin user
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    await UserOperations.create({
      username: 'admin',
      nickname: 'Administrator',
      email: 'admin@example.com',
      password_hash: hashedPassword,
      role: 'super_admin',
      role_level: 0,
    });
    
    log.info('DB', 'Default admin user created (username: admin, password: admin123)');
    log.warn('DB', '⚠️  Please change the default password immediately!');
  } catch (error) {
    log.error('DB', 'Failed to create default admin user', { error: (error as Error).message });
    throw error;
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

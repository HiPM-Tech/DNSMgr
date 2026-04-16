import { DbConnection, getConnection, SQLiteConnection } from './connection';
import { DatabaseType } from './config';
import { sqliteSchema } from './schemas/sqlite';
import { mysqlSchema } from './schemas/mysql';
import { postgresqlSchema } from './schemas/postgresql';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { log } from '../lib/logger';

export async function initSchema(): Promise<void> {
  const conn = getConnection();
  if (!conn) {
    throw new Error('Database connection not initialized. Call createConnection first.');
  }
  const type = conn.type;

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

  // 创建默认管理员用户
  await createDefaultAdminUser(conn);

  // 轮换运行时密钥
  await rotateRuntimeSecrets(conn);
}

async function initSQLiteSchema(conn: DbConnection): Promise<void> {
  const sqliteConn = conn as SQLiteConnection;

  // 创建表
  for (const sql of sqliteSchema.createTables) {
    sqliteConn.exec(sql);
  }

  // 创建索引
  for (const sql of sqliteSchema.createIndexes) {
    sqliteConn.exec(sql);
  }

  // 检查并添加列（SQLite 的 ALTER TABLE 支持有限）
  const userColumns = sqliteConn.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasNickname = userColumns.some((col) => col.name === 'nickname');
  if (!hasNickname) {
    sqliteConn.exec("ALTER TABLE users ADD COLUMN nickname TEXT NOT NULL DEFAULT ''");
    sqliteConn.exec("UPDATE users SET nickname = username WHERE nickname = '' OR nickname IS NULL");
  }

  const hasRoleLevel = userColumns.some((col) => col.name === 'role_level');
  if (!hasRoleLevel) {
    sqliteConn.exec('ALTER TABLE users ADD COLUMN role_level INTEGER NOT NULL DEFAULT 1');
    sqliteConn.exec("UPDATE users SET role_level = CASE role WHEN 'admin' THEN 2 ELSE 1 END");
  }

  const domainColumns = sqliteConn.prepare("PRAGMA table_info(domains)").all() as { name: string }[];
  const hasExpiresAt = domainColumns.some((col) => col.name === 'expires_at');
  if (!hasExpiresAt) {
    sqliteConn.exec("ALTER TABLE domains ADD COLUMN expires_at TEXT");
  }

  const permColumns = sqliteConn.prepare("PRAGMA table_info(domain_permissions)").all() as { name: string }[];
  const hasPermission = permColumns.some((col) => col.name === 'permission');
  if (!hasPermission) {
    sqliteConn.exec("ALTER TABLE domain_permissions ADD COLUMN permission TEXT NOT NULL DEFAULT 'write'");
  }

  // 检查并添加 user_preferences 表的 background_image 字段
  const userPrefsColumns = sqliteConn.prepare("PRAGMA table_info(user_preferences)").all() as { name: string }[];
  const hasBackgroundImage = userPrefsColumns.some((col) => col.name === 'background_image');
  if (!hasBackgroundImage) {
    sqliteConn.exec("ALTER TABLE user_preferences ADD COLUMN background_image TEXT");
    log.info('DB', 'Added missing column: user_preferences.background_image');
  }

  // 规范化历史重复域名
  sqliteConn.exec(`
    DELETE FROM domains
    WHERE id IN (
      SELECT d1.id
      FROM domains d1
      JOIN domains d2
        ON d1.account_id = d2.account_id
       AND lower(trim(d1.name)) = lower(trim(d2.name))
       AND d1.id > d2.id
    );
  `);
}

async function initMySQLSchema(conn: DbConnection): Promise<void> {
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

  // 自动检测并补全缺失的列
  await syncMySQLColumns(conn);
}

async function syncMySQLColumns(conn: DbConnection): Promise<void> {
  // 定义表结构（表名 -> 列定义）
  const tableColumns: Record<string, Array<{ name: string; type: string; after?: string }>> = {
    users: [
      { name: 'nickname', type: "VARCHAR(255) NOT NULL DEFAULT ''", after: 'username' },
      { name: 'role_level', type: 'INT NOT NULL DEFAULT 1', after: 'role' },
    ],
    domains: [
      { name: 'expires_at', type: 'DATETIME', after: 'updated_at' },
    ],
    domain_permissions: [
      { name: 'permission', type: "VARCHAR(50) NOT NULL DEFAULT 'write'", after: 'domain_id' },
    ],
    user_preferences: [
      { name: 'background_image', type: 'TEXT', after: 'updated_at' },
    ],
  };

  log.info('DB', 'Starting MySQL column sync...');

  for (const [table, columns] of Object.entries(tableColumns)) {
    try {
      // 获取表的现有列
      const existingColumns = await conn.query(`SHOW COLUMNS FROM ${table}`) as Array<{ Field: string }>;
      const existingNames = new Set(existingColumns.map(c => c.Field));

      log.info('DB', `Table ${table} has columns: ${Array.from(existingNames).join(', ')}`);

      for (const col of columns) {
        if (!existingNames.has(col.name)) {
          log.info('DB', `Adding missing column: ${table}.${col.name}`);
          const afterClause = col.after ? ` AFTER ${col.after}` : '';
          await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}${afterClause}`);
          log.info('DB', `Successfully added column: ${table}.${col.name}`);
        } else {
          log.debug('DB', `Column already exists: ${table}.${col.name}`);
        }
      }
    } catch (e) {
      // 表可能不存在，忽略错误
      if (e instanceof Error && (e.message.includes("doesn't exist") || e.message.includes('Unknown table'))) {
        log.warn('DB', `Table ${table} does not exist, skipping column sync`);
        continue;
      }
      log.error('DB', `Failed to sync columns for ${table}`, { error: e });
    }
  }

  log.info('DB', 'MySQL column sync completed');
}

async function initPostgreSQLSchema(conn: DbConnection): Promise<void> {
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

  // 自动检测并补全缺失的列
  await syncPostgreSQLColumns(conn);
}

async function syncPostgreSQLColumns(conn: DbConnection): Promise<void> {
  // 定义表结构（表名 -> 列定义）
  const tableColumns: Record<string, Array<{ name: string; type: string }>> = {
    users: [
      { name: 'nickname', type: "VARCHAR(255) NOT NULL DEFAULT ''" },
      { name: 'role_level', type: 'INTEGER NOT NULL DEFAULT 1' },
    ],
    domains: [
      { name: 'expires_at', type: 'TIMESTAMP' },
    ],
    domain_permissions: [
      { name: 'permission', type: "VARCHAR(50) NOT NULL DEFAULT 'write'" },
    ],
    user_preferences: [
      { name: 'background_image', type: 'TEXT' },
    ],
  };

  for (const [table, columns] of Object.entries(tableColumns)) {
    try {
      // 获取表的现有列
      const existingColumns = await conn.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [table]
      ) as Array<{ column_name: string }>;
      const existingNames = new Set(existingColumns.map(c => c.column_name));

      for (const col of columns) {
        if (!existingNames.has(col.name)) {
          log.info('DB', `Adding missing column: ${table}.${col.name}`);
          await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`);
        }
      }
    } catch (e) {
      // 表可能不存在，忽略错误
      if (e instanceof Error && (e.message.includes('does not exist') || e.message.includes('Undefined table'))) {
        continue;
      }
      log.warn('DB', `Failed to sync columns for ${table}`, { error: e });
    }
  }
}

async function createDefaultAdminUser(conn: DbConnection): Promise<void> {
  try {
    const result = await conn.get('SELECT COUNT(*) as cnt FROM users');
    const count = (result as { cnt: number })?.cnt || 0;

    if (count === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await conn.execute(
        `INSERT INTO users (username, nickname, email, password_hash, role, role_level) VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin', 'admin', 'admin@localhost', hash, 'admin', 3]
      );
      log.info('DB', 'Default super admin user created', { username: 'admin', password: 'admin123' });
    }

    // 确保至少有一个超级管理员
    const superResult = await conn.get('SELECT COUNT(*) as cnt FROM users WHERE role_level = 3');
    const superCount = (superResult as { cnt: number })?.cnt || 0;

    if (superCount === 0) {
      const adminCandidate = await conn.get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
      const fallback = adminCandidate || await conn.get('SELECT id FROM users ORDER BY id LIMIT 1');

      if (fallback && (fallback as { id: number }).id) {
        await conn.execute('UPDATE users SET role_level = 3 WHERE id = ?', [(fallback as { id: number }).id]);
      }
    }
  } catch (e) {
    log.error('DB', 'Error creating default admin user', { error: e });
  }
}

async function rotateRuntimeSecrets(conn: DbConnection): Promise<void> {
  try {
    const jwtRuntimeSecret = crypto.randomBytes(32).toString('hex');

    // 根据数据库类型使用不同的 SQL 语法
    const type = conn.type;

    if (type === 'sqlite') {
      const sqliteConn = conn as SQLiteConnection;
      sqliteConn.exec('DELETE FROM runtime_secrets');
      sqliteConn.prepare('INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?)').run('jwt_runtime', jwtRuntimeSecret);
    } else if (type === 'mysql') {
      await conn.execute('DELETE FROM runtime_secrets');
      await conn.execute('INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?)', ['jwt_runtime', jwtRuntimeSecret]);
    } else if (type === 'postgresql') {
      await conn.execute('DELETE FROM runtime_secrets');
      await conn.execute('INSERT INTO runtime_secrets ("key", "value") VALUES ($1, $2)', ['jwt_runtime', jwtRuntimeSecret]);
    }

    log.info('DB', 'Runtime secrets rotated');
  } catch (e) {
    log.error('DB', 'Error rotating runtime secrets', { error: e });
  }
}

export function getRuntimeSecret(key: string): string | null {
  try {
    const conn = getConnection();
    if (!conn) {
      return null;
    }

    if (conn.type === 'sqlite') {
      const sqliteConn = conn as SQLiteConnection;
      const result = sqliteConn.prepare('SELECT `value` FROM runtime_secrets WHERE `key` = ?').get(key) as { value: string } | undefined;
      return result?.value || null;
    }

    // MySQL 和 PostgreSQL 是异步的，这里简化处理
    // 实际使用时应该在初始化时缓存密钥
    return null;
  } catch (e) {
    return null;
  }
}

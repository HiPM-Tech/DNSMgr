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
  // 创建表
  for (const sql of mysqlSchema.createTables) {
    await conn.execute(sql);
  }

  // 创建索引
  for (const sql of mysqlSchema.createIndexes) {
    await conn.execute(sql);
  }
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
      sqliteConn.prepare('INSERT INTO runtime_secrets (key, value) VALUES (?, ?)').run('jwt_runtime', jwtRuntimeSecret);
    } else if (type === 'mysql') {
      await conn.execute('DELETE FROM runtime_secrets');
      await conn.execute('INSERT INTO runtime_secrets (key, value) VALUES (?, ?)', ['jwt_runtime', jwtRuntimeSecret]);
    } else if (type === 'postgresql') {
      await conn.execute('DELETE FROM runtime_secrets');
      await conn.execute('INSERT INTO runtime_secrets (key, value) VALUES ($1, $2)', ['jwt_runtime', jwtRuntimeSecret]);
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
      const result = sqliteConn.prepare('SELECT value FROM runtime_secrets WHERE key = ?').get(key) as { value: string } | undefined;
      return result?.value || null;
    }

    // MySQL 和 PostgreSQL 是异步的，这里简化处理
    // 实际使用时应该在初始化时缓存密钥
    return null;
  } catch (e) {
    return null;
  }
}

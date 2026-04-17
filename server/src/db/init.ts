import { getConnection } from './core/connection';
import type { DatabaseConnection, DatabaseType } from './core/types';
import { sqliteSchema } from './schemas/sqlite';
import { mysqlSchema } from './schemas/mysql';
import { postgresqlSchema } from './schemas/postgresql';
import { UserOperations, SecretOperations } from './business-adapter';
import { log } from '../lib/logger';

export async function initSchema(): Promise<void> {
  const conn = getConnection();
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

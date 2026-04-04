import mysql from 'mysql2/promise';
import { Pool, PoolClient } from 'pg';
import Database from 'better-sqlite3';
import { DatabaseConfig, DatabaseType } from './config';

export interface DbConnection {
  type: DatabaseType;
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  execute: (sql: string, params?: unknown[]) => Promise<void>;
  get: (sql: string, params?: unknown[]) => Promise<unknown | undefined>;
  close: () => Promise<void>;
}

class MySQLConnection implements DbConnection {
  type: DatabaseType = 'mysql';
  private pool: mysql.Pool;

  constructor(config: NonNullable<DatabaseConfig['mysql']>) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: config.connectionLimit || 10,
      waitForConnections: true,
      queueLimit: 0,
    });
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const [rows] = await this.pool.execute(sql, params as (string | number | boolean | Date | Buffer | null)[]);
    return rows as unknown[];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.pool.execute(sql, params as (string | number | boolean | Date | Buffer | null)[]);
  }

  async get(sql: string, params?: unknown[]): Promise<unknown | undefined> {
    const [rows] = await this.pool.execute(sql, params as (string | number | boolean | Date | Buffer | null)[]);
    const results = rows as unknown[];
    return results.length > 0 ? results[0] : undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PostgreSQLConnection implements DbConnection {
  type: DatabaseType = 'postgresql';
  private pool: Pool;

  constructor(config: NonNullable<DatabaseConfig['postgresql']>) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.poolSize || 10,
    });
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.pool.query(sql, params);
  }

  async get(sql: string, params?: unknown[]): Promise<unknown | undefined> {
    const result = await this.pool.query(sql, params);
    return result.rows.length > 0 ? result.rows[0] : undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class SQLiteConnection implements DbConnection {
  type: DatabaseType = 'sqlite';
  private db: Database.Database;

  constructor(path: string) {
    const fs = require('fs');
    const dir = require('path').dirname(path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const stmt = this.db.prepare(sql);
    if (sql.trim().toLowerCase().startsWith('select')) {
      return stmt.all(...(params || [])) as unknown[];
    }
    stmt.run(...(params || []));
    return [];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(...(params || []));
  }

  async get(sql: string, params?: unknown[]): Promise<unknown | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...(params || [])) as unknown | undefined;
  }

  async close(): Promise<void> {
    this.db.close();
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }
}

let connection: DbConnection | null = null;

export async function createConnection(config: DatabaseConfig): Promise<DbConnection> {
  if (connection) {
    await connection.close();
  }

  switch (config.type) {
    case 'mysql':
      if (!config.mysql) {
        throw new Error('MySQL configuration is required');
      }
      connection = new MySQLConnection(config.mysql);
      break;

    case 'postgresql':
      if (!config.postgresql) {
        throw new Error('PostgreSQL configuration is required');
      }
      connection = new PostgreSQLConnection(config.postgresql);
      break;

    case 'sqlite':
    default:
      if (!config.sqlite) {
        throw new Error('SQLite configuration is required');
      }
      connection = new SQLiteConnection(config.sqlite.path);
      break;
  }

  return connection;
}

export function getConnection(): DbConnection {
  if (!connection) {
    throw new Error('Database connection not initialized. Call createConnection first.');
  }
  return connection;
}

export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
  }
}

export { SQLiteConnection };

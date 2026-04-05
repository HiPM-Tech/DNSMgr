import mysql from 'mysql2/promise';
import { Pool } from 'pg';
import Database from 'better-sqlite3';
import { getDbConfig } from '../config/env';

export type DbType = 'sqlite' | 'mysql' | 'postgresql';

// Database connection interface
export interface DbConnection {
  type: DbType;
  query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  execute: (sql: string, params?: unknown[]) => Promise<void>;
  get: (sql: string, params?: unknown[]) => Promise<unknown | undefined>;
  close: () => Promise<void>;
  // SQLite-specific methods (for backward compatibility)
  exec?: (sql: string) => void;
  prepare?: (sql: string) => Database.Statement;
  transaction?: (fn: () => void) => () => void;
}

class MySQLConnection implements DbConnection {
  type: DbType = 'mysql';
  private pool: mysql.Pool;

  constructor(config: { host: string; port: number; database: string; user: string; password: string; ssl: boolean }) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 10,
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
  type: DbType = 'postgresql';
  private pool: Pool;

  constructor(config: { host: string; port: number; database: string; user: string; password: string; ssl: boolean }) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 10,
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
  type: DbType = 'sqlite';
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

  // SQLite-specific synchronous methods (for backward compatibility)
  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  transaction(fn: () => void): () => void {
    return this.db.transaction(fn);
  }
}

let connection: DbConnection | null = null;

export async function createConnection(): Promise<DbConnection> {
  const config = getDbConfig();
  
  if (connection) {
    await connection.close();
  }

  switch (config.type) {
    case 'mysql':
      connection = new MySQLConnection(config.mysql);
      break;

    case 'postgresql':
      connection = new PostgreSQLConnection(config.postgresql);
      break;

    case 'sqlite':
    default:
      connection = new SQLiteConnection(config.sqlite.path);
      break;
  }

  return connection;
}

// Get database connection (synchronous version for backward compatibility)
// This only works with SQLite - for MySQL/PostgreSQL, use async createConnection
export function getDb(): DbConnection & { exec: (sql: string) => void; prepare: (sql: string) => Database.Statement; transaction: (fn: () => void) => () => void } {
  if (!connection) {
    // Try to create a default SQLite connection for backward compatibility
    const config = getDbConfig();
    if (config.type === 'sqlite') {
      connection = new SQLiteConnection(config.sqlite.path);
    } else {
      throw new Error('Database connection not initialized. Call createConnection first for MySQL/PostgreSQL.');
    }
  }
  
  if (connection.type !== 'sqlite') {
    throw new Error('getDb() only supports SQLite. Use createConnection() and async methods for MySQL/PostgreSQL.');
  }
  
  return connection as SQLiteConnection;
}

export async function closeConnection(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
  }
}

// Get current connection if available (for all database types)
export function getCurrentConnection(): DbConnection | null {
  return connection;
}

// Check if database is initialized (has tables)
export async function isDbInitialized(): Promise<boolean> {
  try {
    // Use global connection if available
    if (!connection) {
      return false;
    }
    
    if (connection.type === 'sqlite') {
      const result = connection.prepare!("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
      return !!result;
    } else if (connection.type === 'mysql') {
      const result = await connection.get("SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'");
      return !!result;
    } else if (connection.type === 'postgresql') {
      const result = await connection.get("SELECT tablename as name FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users'");
      return !!result;
    }
    return false;
  } catch {
    return false;
  }
}

// Check if any user exists
export async function hasUsers(): Promise<boolean> {
  try {
    // Use global connection if available
    if (!connection) {
      return false;
    }
    
    if (connection.type === 'sqlite') {
      const result = connection.prepare!('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
      return result.cnt > 0;
    } else {
      const result = await connection.get('SELECT COUNT(*) as cnt FROM users');
      return (result as { cnt: number })?.cnt > 0;
    }
  } catch {
    return false;
  }
}

export { SQLiteConnection };

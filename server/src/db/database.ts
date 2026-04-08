import mysql from 'mysql2/promise';
import { Pool, PoolClient } from 'pg';
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

// MySQL connection pool
class MySQLConnection implements DbConnection {
  type: DbType = 'mysql';
  private pool: mysql.Pool;
  private stats = { acquired: 0, released: 0, queries: 0 };

  constructor(config: { host: string; port: number; database: string; user: string; password: string; ssl: boolean }) {
    const poolSize = parseInt(process.env.DB_POOL_SIZE || '20', 10);
    console.log(`[MySQL] Initializing connection pool to ${config.host}:${config.port}/${config.database} (pool size: ${poolSize})`);

    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: poolSize,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      // 连接超时配置
      connectTimeout: 60000,
    });

    // 连接池事件监控
    this.pool.on('acquire', () => {
      this.stats.acquired++;
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[MySQL] Connection acquired (total: ${this.stats.acquired})`);
      }
    });
    this.pool.on('release', () => {
      this.stats.released++;
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[MySQL] Connection released (total: ${this.stats.released})`);
      }
    });
    this.pool.on('enqueue', () => {
      console.warn('[MySQL] Waiting for available connection slot');
    });
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const startTime = Date.now();
    this.stats.queries++;
    try {
      const [rows] = await this.pool.execute(sql, params as mysql.RowDataPacket);
      const duration = Date.now() - startTime;
      if (duration > 100) {
        console.warn(`[MySQL] Slow query (${duration}ms): ${sql.substring(0, 100)}`);
      }
      return rows as unknown[];
    } catch (error) {
      console.error(`[MySQL] Query error: ${sql.substring(0, 100)}`, error);
      throw error;
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const startTime = Date.now();
    this.stats.queries++;
    try {
      await this.pool.execute(sql, params as mysql.RowDataPacket);
      const duration = Date.now() - startTime;
      if (duration > 100) {
        console.warn(`[MySQL] Slow execute (${duration}ms): ${sql.substring(0, 100)}`);
      }
    } catch (error) {
      console.error(`[MySQL] Execute error: ${sql.substring(0, 100)}`, error);
      throw error;
    }
  }

  async get(sql: string, params?: unknown[]): Promise<unknown | undefined> {
    const startTime = Date.now();
    this.stats.queries++;
    try {
      const [rows] = await this.pool.execute(sql, params as mysql.RowDataPacket);
      const results = rows as unknown[];
      const duration = Date.now() - startTime;
      if (duration > 100) {
        console.warn(`[MySQL] Slow get (${duration}ms): ${sql.substring(0, 100)}`);
      }
      return results.length > 0 ? results[0] : undefined;
    } catch (error) {
      console.error(`[MySQL] Get error: ${sql.substring(0, 100)}`, error);
      throw error;
    }
  }

  async close(): Promise<void> {
    console.log(`[MySQL] Closing connection pool (stats: acquired=${this.stats.acquired}, released=${this.stats.released}, queries=${this.stats.queries})`);
    await this.pool.end();
  }
}

// PostgreSQL connection pool
class PostgreSQLConnection implements DbConnection {
  type: DbType = 'postgresql';
  private pool: Pool;
  private stats = { connected: 0, acquired: 0, removed: 0 };

  constructor(config: { host: string; port: number; database: string; user: string; password: string; ssl: boolean }) {
    const poolSize = parseInt(process.env.DB_POOL_SIZE || '20', 10);
    console.log(`[PostgreSQL] Initializing connection pool to ${config.host}:${config.port}/${config.database} (pool size: ${poolSize})`);

    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 60000,
    });

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected pool error:', err);
    });

    // 连接池事件监控
    this.pool.on('connect', () => {
      this.stats.connected++;
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[PostgreSQL] New client connected (total: ${this.stats.connected})`);
      }
    });
    this.pool.on('acquire', () => {
      this.stats.acquired++;
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[PostgreSQL] Client acquired from pool (total: ${this.stats.acquired})`);
      }
    });
    this.pool.on('remove', () => {
      this.stats.removed++;
      if (process.env.NODE_ENV !== 'production') {
        console.debug(`[PostgreSQL] Client removed from pool (total: ${this.stats.removed})`);
      }
    });
  }

  async query(sql: string, params?: unknown[]): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  async get(sql: string, params?: unknown[]): Promise<unknown | undefined> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result.rows.length > 0 ? result.rows[0] : undefined;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class SQLiteConnection implements DbConnection {
  type: DbType = 'sqlite';
  private db: Database.Database;
  private stats = { queries: 0, transactions: 0 };

  constructor(path: string) {
    console.log(`[SQLite] Opening database at ${path}`);
    const fs = require('fs');
    const dir = require('path').dirname(path);
    if (!fs.existsSync(dir)) {
      console.log(`[SQLite] Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    console.log(`[SQLite] Database opened successfully (WAL mode enabled)`);
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
let connectionPromise: Promise<DbConnection> | null = null;

export async function createConnection(): Promise<DbConnection> {
  console.log('[Database] createConnection() called');

  // 如果连接已存在且未关闭，直接返回
  if (connection) {
    console.log(`[Database] Returning existing connection: ${connection.type}`);
    return connection;
  }

  // 如果正在创建连接，等待创建完成
  if (connectionPromise) {
    console.log('[Database] Waiting for existing connection promise');
    return connectionPromise;
  }

  // 创建新连接
  connectionPromise = (async () => {
    console.log('[Database] Creating new connection...');
    const config = getDbConfig();
    console.log(`[Database] Config type: ${config.type}`);

    switch (config.type) {
      case 'mysql':
        console.log('[Database] Creating MySQL connection...');
        connection = new MySQLConnection(config.mysql);
        break;

      case 'postgresql':
        console.log('[Database] Creating PostgreSQL connection...');
        connection = new PostgreSQLConnection(config.postgresql);
        break;

      case 'sqlite':
      default:
        console.log('[Database] Creating SQLite connection...');
        connection = new SQLiteConnection(config.sqlite.path);
        break;
    }

    console.log(`[Database] Connected to ${config.type}`);
    return connection;
  })();

  return connectionPromise;
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

// 导出 db 实例（向后兼容）
export const db = {
  get isConnected() { return !!connection; },
  get type() { return process.env.DB_TYPE || 'sqlite'; },
};

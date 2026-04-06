/**
 * MySQL 数据库驱动
 */

import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { Transaction, ColumnType } from '../core/types';
import type { DriverConfig } from './types';
import { BaseDriver } from './base';
import { registerDriver } from './types';

/** MySQL 配置 */
export interface MySQLDriverConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionLimit?: number;
  connectTimeout?: number;
  acquireTimeout?: number;
  timeout?: number;
}

/** MySQL 驱动实现 */
export class MySQLDriver extends BaseDriver {
  readonly type = 'mysql' as const;
  private pool: Pool;
  private connectionConfig: MySQLDriverConfig;

  constructor(config: MySQLDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig);
    this.connectionConfig = config;

    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: config.connectionLimit || 20,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: config.connectTimeout || 60000,
    } as mysql.PoolOptions);

    this.setupPoolEvents();
  }

  private setupPoolEvents(): void {
    this.pool.on('acquire', () => {
      this._stats.acquired++;
      if (this.config.logging) {
        console.debug(`[MySQL] Connection acquired (total: ${this._stats.acquired})`);
      }
    });

    this.pool.on('release', () => {
      this._stats.released++;
      if (this.config.logging) {
        console.debug(`[MySQL] Connection released (total: ${this._stats.released})`);
      }
    });

    this.pool.on('enqueue', () => {
      console.warn('[MySQL] Waiting for available connection slot');
    });
  }

  get isConnected(): boolean {
    return true;
  }

  private logSlowQuery(sql: string, duration: number): void {
    if (this.config.slowQueryThreshold && duration > this.config.slowQueryThreshold) {
      console.warn(`[MySQL] Slow query (${duration}ms): ${sql.substring(0, 100)}`);
    }
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const startTime = Date.now();
    this._stats.queries++;
    try {
      const [rows] = await this.pool.execute(sql, params as mysql.RowDataPacket);
      this.logSlowQuery(sql, Date.now() - startTime);
      return rows as T[];
    } catch (error) {
      this._stats.errors++;
      console.error(`[MySQL] Query error: ${sql.substring(0, 100)}`, error);
      throw error;
    }
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const startTime = Date.now();
    this._stats.queries++;
    try {
      const [rows] = await this.pool.execute(sql, params as mysql.RowDataPacket);
      const results = rows as T[];
      this.logSlowQuery(sql, Date.now() - startTime);
      return results.length > 0 ? results[0] : undefined;
    } catch (error) {
      this._stats.errors++;
      console.error(`[MySQL] Get error: ${sql.substring(0, 100)}`, error);
      throw error;
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const startTime = Date.now();
    this._stats.queries++;
    try {
      await this.pool.execute(sql, params as mysql.RowDataPacket);
      this.logSlowQuery(sql, Date.now() - startTime);
    } catch (error) {
      this._stats.errors++;
      console.error(`[MySQL] Execute error: ${sql.substring(0, 100)}`, error);
      throw error;
    }
  }

  async insert(sql: string, params?: unknown[]): Promise<number> {
    await this.execute(sql, params);
    const result = await this.get<{ id: number }>('SELECT LAST_INSERT_ID() as id');
    return result?.id || 0;
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const [result] = await this.pool.execute(sql, params as mysql.RowDataPacket);
    return { changes: (result as any).affectedRows || 0 };
  }

  async beginTransaction(): Promise<Transaction> {
    const connection = await this.pool.getConnection();
    await connection.beginTransaction();

    return {
      query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
        const [rows] = await connection.execute(sql, params as mysql.RowDataPacket);
        return rows as T[];
      },
      get: async <T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> => {
        const [rows] = await connection.execute(sql, params as mysql.RowDataPacket);
        const results = rows as T[];
        return results.length > 0 ? results[0] : undefined;
      },
      execute: async (sql: string, params?: unknown[]): Promise<void> => {
        await connection.execute(sql, params as mysql.RowDataPacket);
      },
      insert: async (sql: string, params?: unknown[]): Promise<number> => {
        await connection.execute(sql, params as mysql.RowDataPacket);
        const [rows] = await connection.execute('SELECT LAST_INSERT_ID() as id');
        return (rows as { id: number }[])[0]?.id || 0;
      },
      run: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
        const [result] = await connection.execute(sql, params as mysql.RowDataPacket);
        return { changes: (result as any).affectedRows || 0 };
      },
    };
  }

  raw(): Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    console.log(`[MySQL] Closing connection pool (stats: queries=${this._stats.queries}, errors=${this._stats.errors})`);
    await this.pool.end();
  }

  // ==================== SQL 方言 ====================

  escapeIdentifier(name: string): string {
    return `\`${name}\``;
  }

  placeholder(): string {
    return '?';
  }

  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string {
    switch (type) {
      case 'string':
        return `VARCHAR(${options?.length || 255})`;
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INT';
      case 'bigint':
        return 'BIGINT';
      case 'decimal':
        return `DECIMAL(${options?.precision || 10}, ${options?.scale || 2})`;
      case 'boolean':
        return 'TINYINT(1)';
      case 'datetime':
        return 'DATETIME';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'json':
        return 'JSON';
      case 'uuid':
        return 'CHAR(36)';
      case 'serial':
        return 'BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY';
      default:
        return 'TEXT';
    }
  }

  now(): string {
    return 'NOW()';
  }

  dateDiff(a: string, b: string): string {
    return `DATEDIFF(${a}, ${b})`;
  }

  limitOffset(limit: number, offset?: number): string {
    if (offset !== undefined) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit}`;
  }
}

// 注册驱动
registerDriver('mysql', MySQLDriver as any);

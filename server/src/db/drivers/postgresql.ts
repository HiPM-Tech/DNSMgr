/**
 * PostgreSQL 数据库驱动
 */

import { Pool, PoolClient } from 'pg';
import type { Transaction, ColumnType } from '../core/types';
import type { DriverConfig } from './types';
import { BaseDriver } from './base';
import { registerDriver } from './types';

/** PostgreSQL 配置 */
export interface PostgreSQLDriverConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
}

/** PostgreSQL 驱动实现 */
export class PostgreSQLDriver extends BaseDriver {
  readonly type = 'postgresql' as const;
  private pool: Pool;
  private connectionConfig: PostgreSQLDriverConfig;

  constructor(config: PostgreSQLDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig);
    this.connectionConfig = config;

    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: config.poolSize || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 60000,
    });

    this.setupPoolEvents();
  }

  private setupPoolEvents(): void {
    this.pool.on('error', (err) => {
      console.error('[PostgreSQL] Unexpected pool error:', err);
    });

    this.pool.on('connect', () => {
      if (this.config.logging) {
        console.debug('[PostgreSQL] New client connected');
      }
    });

    this.pool.on('acquire', () => {
      this._stats.acquired++;
      if (this.config.logging) {
        console.debug(`[PostgreSQL] Client acquired from pool (total: ${this._stats.acquired})`);
      }
    });

    this.pool.on('remove', () => {
      this._stats.released++;
      if (this.config.logging) {
        console.debug(`[PostgreSQL] Client removed from pool (total: ${this._stats.released})`);
      }
    });
  }

  get isConnected(): boolean {
    return true;
  }

  private logSlowQuery(sql: string, duration: number): void {
    if (this.config.slowQueryThreshold && duration > this.config.slowQueryThreshold) {
      console.warn(`[PostgreSQL] Slow query (${duration}ms): ${sql.substring(0, 100)}`);
    }
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const startTime = Date.now();
    this._stats.queries++;
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      this.logSlowQuery(sql, Date.now() - startTime);
      return result.rows as T[];
    } catch (error) {
      this._stats.errors++;
      console.error(`[PostgreSQL] Query error: ${sql.substring(0, 100)}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const startTime = Date.now();
    this._stats.queries++;
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      this.logSlowQuery(sql, Date.now() - startTime);
      return result.rows.length > 0 ? (result.rows[0] as T) : undefined;
    } catch (error) {
      this._stats.errors++;
      console.error(`[PostgreSQL] Get error: ${sql.substring(0, 100)}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const startTime = Date.now();
    this._stats.queries++;
    const client = await this.pool.connect();
    try {
      await client.query(sql, params);
      this.logSlowQuery(sql, Date.now() - startTime);
    } catch (error) {
      this._stats.errors++;
      console.error(`[PostgreSQL] Execute error: ${sql.substring(0, 100)}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async insert(sql: string, params?: unknown[]): Promise<number> {
    if (!sql.toLowerCase().includes('returning')) {
      await this.execute(sql, params);
      try {
        const result = await this.get<{ id: number }>('SELECT lastval() as id');
        return result?.id || 0;
      } catch {
        return 0;
      }
    } else {
      const result = await this.get<{ id: number }>(sql, params);
      return result?.id || 0;
    }
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    await this.execute(sql, params);
    return { changes: 0 };
  }

  async beginTransaction(): Promise<Transaction> {
    const client = await this.pool.connect();
    await client.query('BEGIN');

    return {
      query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
        const result = await client.query(sql, params);
        return result.rows as T[];
      },
      get: async <T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> => {
        const result = await client.query(sql, params);
        return result.rows.length > 0 ? (result.rows[0] as T) : undefined;
      },
      execute: async (sql: string, params?: unknown[]): Promise<void> => {
        await client.query(sql, params);
      },
      insert: async (sql: string, params?: unknown[]): Promise<number> => {
        if (!sql.toLowerCase().includes('returning')) {
          await client.query(sql, params);
          try {
            const result = await client.query('SELECT lastval() as id');
            return result.rows[0]?.id || 0;
          } catch {
            return 0;
          }
        } else {
          const result = await client.query(sql, params);
          return result.rows[0]?.id || 0;
        }
      },
      run: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
        await client.query(sql, params);
        return { changes: 0 };
      },
    };
  }

  raw(): Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    console.log(`[PostgreSQL] Closing connection pool (stats: queries=${this._stats.queries}, errors=${this._stats.errors})`);
    await this.pool.end();
  }

  // ==================== SQL 方言 ====================

  escapeIdentifier(name: string): string {
    return `"${name}"`;
  }

  placeholder(index: number): string {
    return `$${index}`;
  }

  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string {
    switch (type) {
      case 'string':
        return `VARCHAR(${options?.length || 255})`;
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'BIGINT';
      case 'decimal':
        return `DECIMAL(${options?.precision || 10}, ${options?.scale || 2})`;
      case 'boolean':
        return 'BOOLEAN';
      case 'datetime':
        return 'TIMESTAMP';
      case 'timestamp':
        return 'TIMESTAMP';
      case 'date':
        return 'DATE';
      case 'json':
        return 'JSONB';
      case 'uuid':
        return 'UUID';
      case 'serial':
        return 'BIGSERIAL PRIMARY KEY';
      default:
        return 'TEXT';
    }
  }

  now(): string {
    return 'NOW()';
  }

  dateDiff(a: string, b: string): string {
    return `(${a} - ${b})`;
  }

  limitOffset(limit: number, offset?: number): string {
    if (offset !== undefined) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit}`;
  }
}

// 注册驱动
registerDriver('postgresql', PostgreSQLDriver as any);

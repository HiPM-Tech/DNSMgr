/**
 * PostgreSQL 数据库驱动
 */

import type { Transaction, ColumnType } from '../core/types';
import type { DriverConfig } from './types';
import { BaseDriver } from './base';
import { registerDriver } from './types';
import { log } from '../../lib/logger';

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
  private pool: any; // Pool
  private connectionConfig: PostgreSQLDriverConfig;

  constructor(config: PostgreSQLDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig);
    this.connectionConfig = config;

    try {
      // 动态导入 pg 模块
      const { Pool } = require('pg');
      
      log.info('PostgreSQL', 'Creating connection pool', { 
        host: config.host, 
        port: config.port, 
        database: config.database 
      });

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
      log.info('PostgreSQL', 'Connection pool created successfully');
    } catch (error) {
      log.error('PostgreSQL', 'Failed to create connection pool', { 
        host: config.host, 
        port: config.port, 
        database: config.database,
        error 
      });
      throw new Error(
        `Failed to initialize PostgreSQL driver: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private setupPoolEvents(): void {
    this.pool.on('error', (err: Error) => {
      log.error('PostgreSQL', 'Unexpected pool error', { error: err });
    });

    this.pool.on('connect', () => {
      log.debug('PostgreSQL', 'New client connected');
    });

    this.pool.on('acquire', () => {
      log.debug('PostgreSQL', 'Client acquired from pool');
    });

    this.pool.on('remove', () => {
      log.debug('PostgreSQL', 'Client removed from pool');
    });
  }

  get isConnected(): boolean {
    try {
      return this.pool !== null;
    } catch {
      return false;
    }
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    this._stats.queries++;
    const startTime = Date.now();

    try {
      const result = await this.pool.query(sql, params);
      const duration = Date.now() - startTime;

      if (duration > (this._config.slowQueryThreshold || 100)) {
        log.warn('PostgreSQL', 'Slow query detected', { sql: sql.substring(0, 100), duration });
      }

      return result.rows as T[];
    } catch (error) {
      this._stats.errors++;
      log.error('PostgreSQL', 'Query error', { sql: sql.substring(0, 100), error });
      throw error;
    }
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.query(sql, params);
  }

  async insert(sql: string, params?: unknown[]): Promise<number> {
    const result = await this.query<{ id: number }>(sql + ' RETURNING id', params);
    return result[0]?.id || 0;
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const result = await this.query(sql, params);
    // PostgreSQL doesn't return changes directly, we need to use GET DIAGNOSTICS
    // For simplicity, return 0 here
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
        return result.rows[0] as T | undefined;
      },
      execute: async (sql: string, params?: unknown[]): Promise<void> => {
        await client.query(sql, params);
      },
      insert: async (sql: string, params?: unknown[]): Promise<number> => {
        const result = await client.query(sql + ' RETURNING id', params);
        return result.rows[0]?.id || 0;
      },
      run: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
        await client.query(sql, params);
        return { changes: 0 };
      },
    };
  }

  raw(): any {
    return this.pool;
  }

  async close(): Promise<void> {
    log.info('PostgreSQL', 'Closing connection pool', { stats: this._stats });
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
        return options?.length ? `VARCHAR(${options.length})` : 'TEXT';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'BIGINT';
      case 'decimal':
        return options?.precision && options?.scale
          ? `DECIMAL(${options.precision}, ${options.scale})`
          : 'DECIMAL';
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
        return 'SERIAL PRIMARY KEY';
      default:
        return 'TEXT';
    }
  }

  now(): string {
    return 'CURRENT_TIMESTAMP';
  }

  dateDiff(a: string, b: string): string {
    return `EXTRACT(EPOCH FROM (${a} - ${b}))`;
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

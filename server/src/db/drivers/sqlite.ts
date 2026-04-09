/**
 * SQLite 数据库驱动
 */

import Database from 'better-sqlite3';
import type { Transaction, ColumnType } from '../core/types';
import type { DriverConfig } from './types';
import { BaseDriver } from './base';
import { registerDriver } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../lib/logger';

/** SQLite 配置 */
export interface SQLiteDriverConfig {
  path: string;
  mode?: 'readwrite' | 'readonly' | 'create';
  busyTimeout?: number;
  enableWAL?: boolean;
  foreignKeys?: boolean;
}

/** SQLite 驱动实现 */
export class SQLiteDriver extends BaseDriver {
  readonly type = 'sqlite' as const;
  private db: Database.Database;
  private connectionConfig: SQLiteDriverConfig;

  constructor(config: SQLiteDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig);
    this.connectionConfig = config;

    // 确保目录存在
    const dir = path.dirname(config.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(config.path);

    // 配置 SQLite
    if (config.enableWAL !== false) {
      this.db.pragma('journal_mode = WAL');
    }
    if (config.foreignKeys !== false) {
      this.db.pragma('foreign_keys = ON');
    }
    if (config.busyTimeout) {
      this.db.pragma(`busy_timeout = ${config.busyTimeout}`);
    }
  }

  get isConnected(): boolean {
    return this.db.open;
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    this._stats.queries++;
    try {
      const stmt = this.db.prepare(sql);
      if (sql.trim().toLowerCase().startsWith('select')) {
        return stmt.all(...(params || [])) as T[];
      }
      stmt.run(...(params || []));
      return [];
    } catch (error) {
      this._stats.errors++;
      log.error('SQLite', 'Query error', { sql: sql.substring(0, 100), error });
      throw error;
    }
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    this._stats.queries++;
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...(params || [])) as T | undefined;
    } catch (error) {
      this._stats.errors++;
      log.error('SQLite', 'Get error', { sql: sql.substring(0, 100), error });
      throw error;
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this._stats.queries++;
    try {
      const stmt = this.db.prepare(sql);
      stmt.run(...(params || []));
    } catch (error) {
      this._stats.errors++;
      log.error('SQLite', 'Execute error', { sql: sql.substring(0, 100), error });
      throw error;
    }
  }

  async insert(sql: string, params?: unknown[]): Promise<number> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params || []));
    return Number(result.lastInsertRowid);
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...(params || []));
    return { changes: result.changes };
  }

  async beginTransaction(): Promise<Transaction> {
    this.db.exec('BEGIN TRANSACTION');

    return {
      query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
        const stmt = this.db.prepare(sql);
        if (sql.trim().toLowerCase().startsWith('select')) {
          return stmt.all(...(params || [])) as T[];
        }
        stmt.run(...(params || []));
        return [];
      },
      get: async <T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> => {
        const stmt = this.db.prepare(sql);
        return stmt.get(...(params || [])) as T | undefined;
      },
      execute: async (sql: string, params?: unknown[]): Promise<void> => {
        const stmt = this.db.prepare(sql);
        stmt.run(...(params || []));
      },
      insert: async (sql: string, params?: unknown[]): Promise<number> => {
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...(params || []));
        return Number(result.lastInsertRowid);
      },
      run: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...(params || []));
        return { changes: result.changes };
      },
    };
  }

  raw(): Database.Database {
    return this.db;
  }

  async close(): Promise<void> {
    log.info('SQLite', 'Closing database', { stats: this._stats });
    this.db.close();
  }

  // ==================== SQL 方言 ====================

  escapeIdentifier(name: string): string {
    return `"${name}"`;
  }

  placeholder(): string {
    return '?';
  }

  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string {
    switch (type) {
      case 'string':
        return 'TEXT';
      case 'text':
        return 'TEXT';
      case 'integer':
        return 'INTEGER';
      case 'bigint':
        return 'INTEGER';
      case 'decimal':
        return 'REAL';
      case 'boolean':
        return 'INTEGER';
      case 'datetime':
        return 'TEXT';
      case 'timestamp':
        return 'TEXT';
      case 'date':
        return 'TEXT';
      case 'json':
        return 'TEXT';
      case 'uuid':
        return 'TEXT';
      case 'serial':
        return 'INTEGER PRIMARY KEY AUTOINCREMENT';
      default:
        return 'TEXT';
    }
  }

  now(): string {
    return "datetime('now')";
  }

  dateDiff(a: string, b: string): string {
    return `julianday(${a}) - julianday(${b})`;
  }

  limitOffset(limit: number, offset?: number): string {
    if (offset !== undefined) {
      return `LIMIT ${limit} OFFSET ${offset}`;
    }
    return `LIMIT ${limit}`;
  }
}

// 注册驱动
registerDriver('sqlite', SQLiteDriver as any);

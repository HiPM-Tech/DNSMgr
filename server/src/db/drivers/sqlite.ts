/**
 * SQLite 数据库驱动
 */

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

/** 将参数中的 Date 对象转换为 Unix 时间戳（秒） */
function serializeParams(params: unknown[]): unknown[] {
  return params.map(p => p instanceof Date ? Math.floor(p.getTime() / 1000) : p);
}

/** SQLite 驱动实现 */
export class SQLiteDriver extends BaseDriver {
  readonly type = 'sqlite' as const;
  private db: any; // Database.Database
  private connectionConfig: SQLiteDriverConfig;

  constructor(config: SQLiteDriverConfig, driverConfig?: DriverConfig) {
    super(driverConfig);
    this.connectionConfig = config;

    try {
      // 确保目录存在
      const dir = path.dirname(config.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      log.info('SQLite', 'Opening database', { path: config.path, cwd: process.cwd() });

      // 在 EXE 环境中，需要手动指定 better-sqlite3 的绑定文件路径
      // pkg 打包后，process.pkg 会被设置
      const isPkgEnvironment = !!(process as any).pkg;
      if (isPkgEnvironment) {
        log.info('SQLite', 'Detected PKG environment, setting up native bindings path');
        // 尝试从 EXE 所在目录的 node_modules 加载绑定文件
        const exeDir = path.dirname(process.execPath);
        const possiblePaths = [
          path.join(exeDir, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
          path.join(exeDir, 'node_modules', 'better-sqlite3', 'build', 'better_sqlite3.node'),
          path.join(exeDir, '..', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
          path.join(exeDir, '..', 'node_modules', 'better-sqlite3', 'build', 'better_sqlite3.node'),
        ];

        let bindingPath: string | null = null;
        for (const tryPath of possiblePaths) {
          log.debug('SQLite', 'Checking binding path', { path: tryPath, exists: fs.existsSync(tryPath) });
          if (fs.existsSync(tryPath)) {
            bindingPath = tryPath;
            break;
          }
        }

        if (bindingPath) {
          log.info('SQLite', 'Found native binding', { path: bindingPath });
          // 设置环境变量让 bindings 模块能找到正确的路径
          process.env.BETTER_SQLITE3_BINDING = bindingPath;
        } else {
          log.warn('SQLite', 'Native binding not found in expected locations', { possiblePaths });
        }
      }

      // 动态导入 better-sqlite3，以便在 EXE 环境中更好地处理错误
      let Database: any;
      try {
        Database = require('better-sqlite3');
      } catch (importError) {
        log.error('SQLite', 'Failed to import better-sqlite3 module', {
          error: importError,
          cwd: process.cwd(),
          execPath: process.execPath,
          isPkg: isPkgEnvironment,
          nodeModulesPath: path.join(process.cwd(), 'node_modules', 'better-sqlite3')
        });
        throw new Error(
          `Failed to load better-sqlite3 module. ` +
          `This may be due to missing native bindings in EXE environment. ` +
          `Please ensure node_modules/better-sqlite3/build/Release/better_sqlite3.node exists next to the EXE. ` +
          `Error: ${importError instanceof Error ? importError.message : 'Unknown error'}`
        );
      }

      this.db = new Database(config.path);
      log.info('SQLite', 'Database opened successfully');

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
    } catch (error) {
      log.error('SQLite', 'Failed to open database', { path: config.path, error });
      throw error;
    }
  }

  get isConnected(): boolean {
    try {
      return this.db && this.db.open;
    } catch {
      return false;
    }
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    this._stats.queries++;
    try {
      const stmt = this.db.prepare(sql);
      if (sql.trim().toLowerCase().startsWith('select')) {
        return stmt.all(...serializeParams(params || [])) as T[];
      }
      stmt.run(...serializeParams(params || []));
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
      return stmt.get(...serializeParams(params || [])) as T | undefined;
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
      stmt.run(...serializeParams(params || []));
    } catch (error) {
      this._stats.errors++;
      log.error('SQLite', 'Execute error', { sql: sql.substring(0, 100), error });
      throw error;
    }
  }

  async insert(sql: string, params?: unknown[]): Promise<number> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...serializeParams(params || []));
    return Number(result.lastInsertRowid);
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...serializeParams(params || []));
    return { changes: result.changes };
  }

  async beginTransaction(): Promise<Transaction> {
    this.db.exec('BEGIN TRANSACTION');

    return {
      query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
        const stmt = this.db.prepare(sql);
        if (sql.trim().toLowerCase().startsWith('select')) {
          return stmt.all(...serializeParams(params || [])) as T[];
        }
        stmt.run(...serializeParams(params || []));
        return [];
      },
      get: async <T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> => {
        const stmt = this.db.prepare(sql);
        return stmt.get(...serializeParams(params || [])) as T | undefined;
      },
      execute: async (sql: string, params?: unknown[]): Promise<void> => {
        const stmt = this.db.prepare(sql);
        stmt.run(...serializeParams(params || []));
      },
      insert: async (sql: string, params?: unknown[]): Promise<number> => {
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...serializeParams(params || []));
        return Number(result.lastInsertRowid);
      },
      run: async (sql: string, params?: unknown[]): Promise<{ changes: number }> => {
        const stmt = this.db.prepare(sql);
        const result = stmt.run(...serializeParams(params || []));
        return { changes: result.changes };
      },
    };
  }

  raw(): any {
    return this.db;
  }

  async close(): Promise<void> {
    log.info('SQLite', 'Closing database', { stats: this._stats });
    if (this.db) {
      this.db.close();
    }
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

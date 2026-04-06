/**
 * 数据库连接管理器
 * 使用驱动系统提供统一的数据库访问接口
 */

import type {
  DatabaseType,
  DatabaseConnection,
  Transaction,
  RawConnection,
} from './types';
import type { DatabaseConfig } from './config';
import { getDatabaseConfig, validateConfig } from './config';
import type { DatabaseDriver } from '../drivers/types';
import { initDriver, getCurrentDriver, closeDriver, DriverManager } from '../drivers';

/**
 * 驱动包装器
 * 将 DatabaseDriver 包装为 DatabaseConnection 接口
 */
class DriverConnectionWrapper implements DatabaseConnection {
  private driver: DatabaseDriver;

  constructor(driver: DatabaseDriver) {
    this.driver = driver;
  }

  get type(): DatabaseType {
    return this.driver.type;
  }

  get isConnected(): boolean {
    return this.driver.isConnected;
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.driver.query<T>(sql, params);
  }

  async get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.driver.get<T>(sql, params);
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    return this.driver.execute(sql, params);
  }

  async insert(sql: string, params?: unknown[]): Promise<number> {
    return this.driver.insert(sql, params);
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    return this.driver.run(sql, params);
  }

  async beginTransaction(): Promise<Transaction> {
    return this.driver.beginTransaction();
  }

  raw(): RawConnection {
    return this.driver.raw() as RawConnection;
  }

  async close(): Promise<void> {
    return this.driver.close();
  }
}

/** 连接管理器 */
export class ConnectionManager {
  private static instance: ConnectionManager | null = null;
  private connection: DatabaseConnection | null = null;
  private connectionPromise: Promise<DatabaseConnection> | null = null;

  private constructor() {}

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * 连接到数据库
   */
  async connect(config?: DatabaseConfig): Promise<DatabaseConnection> {
    const dbConfig = config || getDatabaseConfig();
    validateConfig(dbConfig);

    if (this.connection) {
      console.log(`[ConnectionManager] Returning existing connection: ${this.connection.type}`);
      return this.connection;
    }

    if (this.connectionPromise) {
      console.log('[ConnectionManager] Waiting for existing connection promise');
      return this.connectionPromise;
    }

    this.connectionPromise = this.createConnection(dbConfig);
    this.connection = await this.connectionPromise;
    this.connectionPromise = null;

    return this.connection;
  }

  private async createConnection(config: DatabaseConfig): Promise<DatabaseConnection> {
    console.log(`[ConnectionManager] Creating new ${config.type} connection...`);

    const driver = await initDriver({
      databaseConfig: config,
      driverConfig: {
        logging: config.logging,
        slowQueryThreshold: config.slowQueryThreshold,
      },
    });

    console.log(`[ConnectionManager] ${config.type} driver initialized`);
    return new DriverConnectionWrapper(driver);
  }

  /**
   * 获取当前连接
   */
  getConnection(): DatabaseConnection {
    if (!this.connection) {
      throw new Error('Database connection not initialized. Call connect() first.');
    }
    return this.connection;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await closeDriver();
      this.connection = null;
      ConnectionManager.instance = null;
    }
  }

  /**
   * 检查是否已连接
   */
  get isConnected(): boolean {
    return this.connection !== null && this.connection.isConnected;
  }

  /**
   * 在事务中执行操作
   */
  async transaction<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
    if (!this.connection) {
      throw new Error('Database connection not initialized. Call connect() first.');
    }

    const trx = await this.connection.beginTransaction();
    try {
      const result = await fn(trx);
      await trx.execute('COMMIT');
      return result;
    } catch (error) {
      await trx.execute('ROLLBACK');
      throw error;
    }
  }
}

/** 便捷函数：获取连接管理器实例 */
export function getConnectionManager(): ConnectionManager {
  return ConnectionManager.getInstance();
}

/** 便捷函数：连接到数据库 */
export async function connect(config?: DatabaseConfig): Promise<DatabaseConnection> {
  return ConnectionManager.getInstance().connect(config);
}

/** 便捷函数：断开连接 */
export async function disconnect(): Promise<void> {
  return ConnectionManager.getInstance().disconnect();
}

/** 便捷函数：获取当前连接 */
export function getConnection(): DatabaseConnection {
  return ConnectionManager.getInstance().getConnection();
}

/** 便捷函数：在事务中执行 */
export async function transaction<T>(fn: (trx: Transaction) => Promise<T>): Promise<T> {
  return ConnectionManager.getInstance().transaction(fn);
}

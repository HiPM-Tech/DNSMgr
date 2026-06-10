/**
 * 数据库驱动统一导出
 */

// 导入并注册所有驱动
import './mysql';
import './postgresql';
import './sqlite';

export * from './base';
export * from './types';
export * from './mysql';
export * from './postgresql';
export * from './sqlite';

import type { DatabaseType } from '../dal/types';
import type { DatabaseConfig } from '../dal/config';
import type { DatabaseDriver, DriverConfig } from './types';
import { getDriver } from './types';
import { MySQLDriver } from './mysql';
import { PostgreSQLDriver } from './postgresql';
import { SQLiteDriver } from './sqlite';
import { getDatabaseConfig } from '../dal/config';

/** 驱动工厂配置 */
export interface DriverFactoryConfig {
  /** 数据库配置 */
  databaseConfig: DatabaseConfig;
  /** 驱动配置 */
  driverConfig?: DriverConfig;
}

/**
 * 创建数据库驱动
 * 根据配置自动选择合适的驱动
 */
export function createDriver(config: DriverFactoryConfig): DatabaseDriver {
  const { databaseConfig, driverConfig } = config;
  const DriverClass = getDriver(databaseConfig.type);

  if (!DriverClass) {
    throw new Error(`No driver registered for database type: ${databaseConfig.type}`);
  }

  switch (databaseConfig.type) {
    case 'mysql': {
      if (!databaseConfig.mysql) {
        throw new Error('MySQL configuration is required');
      }
      return new MySQLDriver(databaseConfig.mysql, driverConfig);
    }

    case 'postgresql': {
      if (!databaseConfig.postgresql) {
        throw new Error('PostgreSQL configuration is required');
      }
      return new PostgreSQLDriver(databaseConfig.postgresql, driverConfig);
    }

    case 'sqlite':
    default: {
      if (!databaseConfig.sqlite) {
        throw new Error('SQLite configuration is required');
      }
      return new SQLiteDriver(databaseConfig.sqlite, driverConfig);
    }
  }
}

/**
 * 根据环境变量创建驱动
 */
export function createDriverFromEnv(): DatabaseDriver {
  const dbConfig = getDatabaseConfig();

  return createDriver({
    databaseConfig: dbConfig,
    driverConfig: {
      logging: dbConfig.logging,
      slowQueryThreshold: dbConfig.slowQueryThreshold,
    },
  });
}

/**
 * 驱动管理器
 * 管理驱动的生命周期
 */
export class DriverManager {
  private static instance: DriverManager | null = null;
  private driver: DatabaseDriver | null = null;
  private driverPromise: Promise<DatabaseDriver> | null = null;

  private constructor() {}

  static getInstance(): DriverManager {
    if (!DriverManager.instance) {
      DriverManager.instance = new DriverManager();
    }
    return DriverManager.instance;
  }

  /**
   * 初始化驱动
   */
  async initialize(config?: DriverFactoryConfig): Promise<DatabaseDriver> {
    if (this.driver) {
      return this.driver;
    }

    if (this.driverPromise) {
      return this.driverPromise;
    }

    this.driverPromise = this.createDriverInternal(config);
    try {
      this.driver = await this.driverPromise;
      this.driverPromise = null;
      return this.driver;
    } catch (error) {
      // 重置 driverPromise，允许后续调用重新尝试
      this.driverPromise = null;
      throw error;
    }
  }

  private async createDriverInternal(config?: DriverFactoryConfig): Promise<DatabaseDriver> {
    if (config) {
      return createDriver(config);
    }
    return createDriverFromEnv();
  }

  /**
   * 获取当前驱动
   */
  getDriver(): DatabaseDriver {
    if (!this.driver) {
      throw new Error('Driver not initialized. Call initialize() first.');
    }
    return this.driver;
  }

  /**
   * 关闭驱动
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      DriverManager.instance = null;
    }
  }

  /**
   * 检查是否已初始化
   */
  get isInitialized(): boolean {
    return this.driver !== null && this.driver.isConnected;
  }
}

/** 便捷函数：获取驱动管理器实例 */
export function getDriverManager(): DriverManager {
  return DriverManager.getInstance();
}

/** 便捷函数：初始化驱动 */
export async function initDriver(config?: DriverFactoryConfig): Promise<DatabaseDriver> {
  return DriverManager.getInstance().initialize(config);
}

/** 便捷函数：关闭驱动 */
export async function closeDriver(): Promise<void> {
  return DriverManager.getInstance().close();
}

/** 便捷函数：获取当前驱动 */
export function getCurrentDriver(): DatabaseDriver {
  return DriverManager.getInstance().getDriver();
}
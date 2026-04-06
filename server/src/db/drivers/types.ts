/**
 * 数据库驱动接口定义
 * 定义所有数据库驱动必须实现的接口
 */

import type {
  DatabaseType,
  Transaction,
  ColumnType,
  CompiledSQL,
  SelectQuery,
  InsertQuery,
  BatchInsertQuery,
  UpdateQuery,
  DeleteQuery,
} from '../core/types';

/** 连接统计信息 */
export interface ConnectionStats {
  queries: number;
  acquired: number;
  released: number;
  errors: number;
}

/** 驱动配置接口 */
export interface DriverConfig {
  logging?: boolean;
  slowQueryThreshold?: number;
}

/** 数据库驱动接口
 * 
 * 所有数据库驱动必须实现此接口，提供统一的数据库操作抽象
 */
export interface DatabaseDriver {
  /** 数据库类型 */
  readonly type: DatabaseType;
  
  /** 连接状态 */
  readonly isConnected: boolean;
  
  /** 连接统计 */
  readonly stats: ConnectionStats;

  // ==================== 基本查询操作 ====================
  
  /** 执行查询并返回多行结果 */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  
  /** 执行查询并返回单行结果 */
  get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
  
  /** 执行 SQL（不返回结果） */
  execute(sql: string, params?: unknown[]): Promise<void>;
  
  /** 执行插入并返回最后插入的 ID */
  insert(sql: string, params?: unknown[]): Promise<number>;
  
  /** 执行更新/删除并返回影响的行数 */
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;

  // ==================== 事务支持 ====================
  
  /** 开始事务 */
  beginTransaction(): Promise<Transaction>;

  // ==================== 连接管理 ====================
  
  /** 获取原始连接（用于特殊操作） */
  raw(): unknown;
  
  /** 关闭连接 */
  close(): Promise<void>;

  // ==================== SQL 方言 ====================
  
  /** 转义标识符 */
  escapeIdentifier(name: string): string;
  
  /** 获取占位符 */
  placeholder(index: number): string;
  
  /** 映射数据类型 */
  mapType(type: ColumnType, options?: { length?: number; precision?: number; scale?: number }): string;
  
  /** 获取当前时间函数 */
  now(): string;
  
  /** 日期差异函数 */
  dateDiff(a: string, b: string): string;
  
  /** 分页语法 */
  limitOffset(limit: number, offset?: number): string;

  // ==================== SQL 编译 ====================
  
  /** 编译 SELECT 查询 */
  compileSelect(query: SelectQuery): CompiledSQL;
  
  /** 编译 INSERT 查询 */
  compileInsert(query: InsertQuery): CompiledSQL;
  
  /** 编译批量 INSERT 查询 */
  compileBatchInsert(query: BatchInsertQuery): CompiledSQL;
  
  /** 编译 UPDATE 查询 */
  compileUpdate(query: UpdateQuery): CompiledSQL;
  
  /** 编译 DELETE 查询 */
  compileDelete(query: DeleteQuery): CompiledSQL;
}

/** 驱动构造函数接口 */
export interface DriverConstructor {
  new (config: unknown, driverConfig?: DriverConfig): DatabaseDriver;
}

/** 驱动注册表 */
const driverRegistry = new Map<DatabaseType, DriverConstructor>();

/** 注册驱动 */
export function registerDriver(type: DatabaseType, driver: DriverConstructor): void {
  driverRegistry.set(type, driver);
}

/** 获取驱动 */
export function getDriver(type: DatabaseType): DriverConstructor | undefined {
  return driverRegistry.get(type);
}

/** 检查驱动是否已注册 */
export function hasDriver(type: DatabaseType): boolean {
  return driverRegistry.has(type);
}

/** 获取所有支持的驱动类型 */
export function getSupportedDrivers(): DatabaseType[] {
  return Array.from(driverRegistry.keys());
}

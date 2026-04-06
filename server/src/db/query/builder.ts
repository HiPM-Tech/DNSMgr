/**
 * 查询构建器
 * 提供类型安全的链式 API 用于构建 SQL 查询
 */

import type {
  DatabaseConnection,
  Operator,
  OrderDirection,
  JoinType,
  WhereCondition,
  JoinCondition,
  OrderBy,
  SelectQuery,
  InsertQuery,
  UpdateQuery,
  DeleteQuery,
  CompiledSQL,
} from '../core/types';
import type { DatabaseDriver } from '../drivers/types';
import { getCurrentDriver } from '../drivers';

/** 查询构建器类 */
export class QueryBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private state: {
    table?: string;
    columns: string[];
    where: WhereCondition[];
    joins: JoinCondition[];
    orderBy: OrderBy[];
    limit?: number;
    offset?: number;
    distinct: boolean;
  } = {
    columns: [],
    where: [],
    joins: [],
    orderBy: [],
    distinct: false,
  };

  private driver: DatabaseDriver;

  constructor(driver?: DatabaseDriver) {
    this.driver = driver || getCurrentDriver();
  }

  /** 设置表名 */
  from(table: string): this {
    this.state.table = table;
    return this;
  }

  /** 选择列 */
  select(columns: (keyof T)[] | '*'): this {
    if (columns === '*') {
      this.state.columns = ['*'];
    } else {
      this.state.columns = columns as string[];
    }
    return this;
  }

  /** 选择所有列 */
  selectAll(): this {
    this.state.columns = ['*'];
    return this;
  }

  /** 设置 DISTINCT */
  distinct(): this {
    this.state.distinct = true;
    return this;
  }

  /** 添加 WHERE 条件 */
  where<K extends keyof T>(
    column: K,
    operator: Operator,
    value: T[K]
  ): this;
  where<K extends keyof T>(
    column: K,
    value: T[K]
  ): this;
  where<K extends keyof T>(
    column: K,
    operatorOrValue: Operator | T[K],
    value?: T[K]
  ): this {
    let operator: Operator;
    let actualValue: T[K];

    if (value === undefined) {
      operator = '=';
      actualValue = operatorOrValue as T[K];
    } else {
      operator = operatorOrValue as Operator;
      actualValue = value;
    }

    this.state.where.push({
      column: column as string,
      operator,
      value: actualValue,
      boolean: 'and',
    });

    return this;
  }

  /** 添加 OR WHERE 条件 */
  orWhere<K extends keyof T>(
    column: K,
    operator: Operator,
    value: T[K]
  ): this {
    this.state.where.push({
      column: column as string,
      operator,
      value,
      boolean: 'or',
    });

    return this;
  }

  /** WHERE IN */
  whereIn<K extends keyof T>(column: K, values: T[K][]): this {
    this.state.where.push({
      column: column as string,
      operator: 'IN',
      value: values,
      boolean: 'and',
    });

    return this;
  }

  /** WHERE NOT IN */
  whereNotIn<K extends keyof T>(column: K, values: T[K][]): this {
    this.state.where.push({
      column: column as string,
      operator: 'NOT IN',
      value: values,
      boolean: 'and',
    });

    return this;
  }

  /** WHERE NULL */
  whereNull<K extends keyof T>(column: K): this {
    this.state.where.push({
      column: column as string,
      operator: 'IS',
      value: null,
      boolean: 'and',
    });

    return this;
  }

  /** WHERE NOT NULL */
  whereNotNull<K extends keyof T>(column: K): this {
    this.state.where.push({
      column: column as string,
      operator: 'IS NOT',
      value: null,
      boolean: 'and',
    });

    return this;
  }

  /** WHERE BETWEEN */
  whereBetween<K extends keyof T>(column: K, min: T[K], max: T[K]): this {
    this.state.where.push({
      column: column as string,
      operator: 'BETWEEN',
      value: [min, max],
      boolean: 'and',
    });

    return this;
  }

  /** WHERE LIKE */
  whereLike<K extends keyof T>(column: K, pattern: string): this {
    this.state.where.push({
      column: column as string,
      operator: 'LIKE',
      value: pattern,
      boolean: 'and',
    });

    return this;
  }

  /** 添加 JOIN */
  join<U extends Record<string, unknown>>(
    table: string,
    leftColumn: keyof T,
    operator: Operator,
    rightColumn: keyof U
  ): QueryBuilder<T & U> {
    this.state.joins.push({
      type: 'inner',
      table,
      on: [{
        left: leftColumn as string,
        operator,
        right: rightColumn as string,
      }],
    });

    return this as unknown as QueryBuilder<T & U>;
  }

  /** 添加 LEFT JOIN */
  leftJoin<U extends Record<string, unknown>>(
    table: string,
    leftColumn: keyof T,
    operator: Operator,
    rightColumn: keyof U
  ): QueryBuilder<T & U> {
    this.state.joins.push({
      type: 'left',
      table,
      on: [{
        left: leftColumn as string,
        operator,
        right: rightColumn as string,
      }],
    });

    return this as unknown as QueryBuilder<T & U>;
  }

  /** 添加 ORDER BY */
  orderBy(column: keyof T, direction: OrderDirection = 'asc'): this {
    this.state.orderBy.push({
      column: column as string,
      direction,
    });

    return this;
  }

  /** 添加 LIMIT */
  limit(count: number): this {
    this.state.limit = count;
    return this;
  }

  /** 添加 OFFSET */
  offset(count: number): this {
    this.state.offset = count;
    return this;
  }

  /** 编译为 SQL */
  toSQL(): CompiledSQL {
    if (!this.state.table) {
      throw new Error('Table name is required. Call from() first.');
    }

    const query: SelectQuery = {
      table: this.state.table,
      columns: this.state.columns,
      where: this.state.where,
      joins: this.state.joins,
      orderBy: this.state.orderBy,
      limit: this.state.limit,
      offset: this.state.offset,
      distinct: this.state.distinct,
    };

    return this.driver.compileSelect(query);
  }

  /** 执行查询并获取所有结果 */
  async get(): Promise<T[]> {
    const { sql, params } = this.toSQL();
    return this.driver.query<T>(sql, params);
  }

  /** 执行查询并获取第一条结果 */
  async first(): Promise<T | undefined> {
    this.state.limit = 1;
    const { sql, params } = this.toSQL();
    return this.driver.get<T>(sql, params);
  }

  /** 执行查询并获取结果数量 */
  async count(): Promise<number> {
    const originalColumns = this.state.columns;
    this.state.columns = ['COUNT(*) as count'];

    const { sql, params } = this.toSQL();
    const result = await this.driver.get<{ count: number }>(sql, params);

    this.state.columns = originalColumns;

    return result?.count || 0;
  }

  /** 检查是否存在 */
  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  /** 清空查询状态 */
  clear(): this {
    this.state = {
      columns: [],
      where: [],
      joins: [],
      orderBy: [],
      distinct: false,
    };
    return this;
  }
}

/** 插入构建器 */
export class InsertBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table?: string;
  private _data: Partial<T> = {};
  private _returningColumns?: (keyof T)[];
  private driver: DatabaseDriver;

  constructor(driver?: DatabaseDriver) {
    this.driver = driver || getCurrentDriver();
  }

  /** 设置表名 */
  into(table: string): this {
    this._table = table;
    return this;
  }

  /** 设置插入数据 */
  values(data: Partial<T>): this {
    this._data = data;
    return this;
  }

  /** 设置返回列 */
  returning(columns: (keyof T)[]): this {
    this._returningColumns = columns;
    return this;
  }

  /** 编译为 SQL */
  toSQL(): CompiledSQL {
    if (!this._table) {
      throw new Error('Table name is required. Call into() first.');
    }

    if (Object.keys(this._data).length === 0) {
      throw new Error('Insert data is required. Call values() first.');
    }

    const query: InsertQuery = {
      table: this._table,
      data: this._data as Record<string, unknown>,
      returning: this._returningColumns as string[],
    };

    return this.driver.compileInsert(query);
  }

  /** 执行插入并返回 ID */
  async execute(): Promise<number> {
    const { sql, params } = this.toSQL();
    return this.driver.insert(sql, params);
  }

  /** 执行插入并返回完整记录 */
  async executeTakeFirst(): Promise<T | undefined> {
    if (!this._returningColumns) {
      throw new Error('Call returning() before executeTakeFirst()');
    }

    const { sql, params } = this.toSQL();
    return this.driver.get<T>(sql, params);
  }
}

/** 批量插入构建器 */
export class BatchInsertBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table?: string;
  private _data: Partial<T>[] = [];
  private _returningColumns?: (keyof T)[];
  private driver: DatabaseDriver;

  constructor(driver?: DatabaseDriver) {
    this.driver = driver || getCurrentDriver();
  }

  /** 设置表名 */
  into(table: string): this {
    this._table = table;
    return this;
  }

  /** 设置插入数据 */
  values(data: Partial<T>[]): this {
    this._data = data;
    return this;
  }

  /** 设置返回列 */
  returning(columns: (keyof T)[]): this {
    this._returningColumns = columns;
    return this;
  }

  /** 编译为 SQL */
  toSQL(): CompiledSQL {
    if (!this._table) {
      throw new Error('Table name is required. Call into() first.');
    }

    if (this._data.length === 0) {
      throw new Error('Insert data is required. Call values() first.');
    }

    const query = {
      table: this._table,
      data: this._data as Record<string, unknown>[],
      returning: this._returningColumns as string[],
    };

    return this.driver.compileBatchInsert(query);
  }

  /** 执行批量插入 */
  async execute(): Promise<void> {
    const { sql, params } = this.toSQL();
    await this.driver.execute(sql, params);
  }
}

/** 更新构建器 */
export class UpdateBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table?: string;
  private _data: Partial<T> = {};
  private _whereConditions: WhereCondition[] = [];
  private _returningColumns?: (keyof T)[];
  private driver: DatabaseDriver;

  constructor(driver?: DatabaseDriver) {
    this.driver = driver || getCurrentDriver();
  }

  /** 设置表名 */
  table(tableName: string): this {
    this._table = tableName;
    return this;
  }

  /** 设置更新数据 */
  set(data: Partial<T>): this {
    this._data = data;
    return this;
  }

  /** 添加 WHERE 条件 */
  where<K extends keyof T>(
    column: K,
    operator: Operator,
    value: T[K]
  ): this;
  where<K extends keyof T>(
    column: K,
    value: T[K]
  ): this;
  where<K extends keyof T>(
    column: K,
    operatorOrValue: Operator | T[K],
    value?: T[K]
  ): this {
    let operator: Operator;
    let actualValue: T[K];

    if (value === undefined) {
      operator = '=';
      actualValue = operatorOrValue as T[K];
    } else {
      operator = operatorOrValue as Operator;
      actualValue = value;
    }

    this._whereConditions.push({
      column: column as string,
      operator,
      value: actualValue,
      boolean: 'and',
    });

    return this;
  }

  /** 设置返回列 */
  returning(columns: (keyof T)[]): this {
    this._returningColumns = columns;
    return this;
  }

  /** 编译为 SQL */
  toSQL(): CompiledSQL {
    if (!this._table) {
      throw new Error('Table name is required. Call table() first.');
    }

    if (Object.keys(this._data).length === 0) {
      throw new Error('Update data is required. Call set() first.');
    }

    const query: UpdateQuery = {
      table: this._table,
      data: this._data as Record<string, unknown>,
      where: this._whereConditions,
      returning: this._returningColumns as string[],
    };

    return this.driver.compileUpdate(query);
  }

  /** 执行更新 */
  async execute(): Promise<{ changes: number }> {
    const { sql, params } = this.toSQL();
    return this.driver.run(sql, params);
  }

  /** 执行更新并返回第一条记录 */
  async executeTakeFirst(): Promise<T | undefined> {
    if (!this._returningColumns) {
      throw new Error('Call returning() before executeTakeFirst()');
    }

    const { sql, params } = this.toSQL();
    return this.driver.get<T>(sql, params);
  }
}

/** 删除构建器 */
export class DeleteBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private _table?: string;
  private _whereConditions: WhereCondition[] = [];
  private _returningColumns?: (keyof T)[];
  private driver: DatabaseDriver;

  constructor(driver?: DatabaseDriver) {
    this.driver = driver || getCurrentDriver();
  }

  /** 设置表名 */
  from(table: string): this {
    this._table = table;
    return this;
  }

  /** 添加 WHERE 条件 */
  where<K extends keyof T>(
    column: K,
    operator: Operator,
    value: T[K]
  ): this;
  where<K extends keyof T>(
    column: K,
    value: T[K]
  ): this;
  where<K extends keyof T>(
    column: K,
    operatorOrValue: Operator | T[K],
    value?: T[K]
  ): this {
    let operator: Operator;
    let actualValue: T[K];

    if (value === undefined) {
      operator = '=';
      actualValue = operatorOrValue as T[K];
    } else {
      operator = operatorOrValue as Operator;
      actualValue = value;
    }

    this._whereConditions.push({
      column: column as string,
      operator,
      value: actualValue,
      boolean: 'and',
    });

    return this;
  }

  /** 设置返回列 */
  returning(columns: (keyof T)[]): this {
    this._returningColumns = columns;
    return this;
  }

  /** 编译为 SQL */
  toSQL(): CompiledSQL {
    if (!this._table) {
      throw new Error('Table name is required. Call from() first.');
    }

    const query: DeleteQuery = {
      table: this._table,
      where: this._whereConditions,
      returning: this._returningColumns as string[],
    };

    return this.driver.compileDelete(query);
  }

  /** 执行删除 */
  async execute(): Promise<{ changes: number }> {
    const { sql, params } = this.toSQL();
    return this.driver.run(sql, params);
  }

  /** 执行删除并返回第一条记录 */
  async executeTakeFirst(): Promise<T | undefined> {
    if (!this._returningColumns) {
      throw new Error('Call returning() before executeTakeFirst()');
    }

    const { sql, params } = this.toSQL();
    return this.driver.get<T>(sql, params);
  }
}

/** 便捷函数：创建查询构建器 */
export function createQueryBuilder<T extends Record<string, unknown>>(
  driver?: DatabaseDriver
): QueryBuilder<T> {
  return new QueryBuilder<T>(driver);
}

/** 便捷函数：创建插入构建器 */
export function createInsertBuilder<T extends Record<string, unknown>>(
  driver?: DatabaseDriver
): InsertBuilder<T> {
  return new InsertBuilder<T>(driver);
}

/** 便捷函数：创建批量插入构建器 */
export function createBatchInsertBuilder<T extends Record<string, unknown>>(
  driver?: DatabaseDriver
): BatchInsertBuilder<T> {
  return new BatchInsertBuilder<T>(driver);
}

/** 便捷函数：创建更新构建器 */
export function createUpdateBuilder<T extends Record<string, unknown>>(
  driver?: DatabaseDriver
): UpdateBuilder<T> {
  return new UpdateBuilder<T>(driver);
}

/** 便捷函数：创建删除构建器 */
export function createDeleteBuilder<T extends Record<string, unknown>>(
  driver?: DatabaseDriver
): DeleteBuilder<T> {
  return new DeleteBuilder<T>(driver);
}

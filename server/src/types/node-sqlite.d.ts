/**
 * node:sqlite 类型声明 (Node.js 24+)
 *
 * node:sqlite 是 Node.js 内置的 SQLite 模块，无需外部依赖。
 * 此文件为 TypeScript 提供类型支持，直到 @types/node 更新到包含这些类型。
 *
 * 参考: https://nodejs.org/api/sqlite.html
 */

declare module 'node:sqlite' {
  /** 语句执行结果 */
  interface StatementResult {
    changes: number;
    lastInsertRowid: number;
  }

  /** 预编译语句（同步接口） */
  class StatementSync {
    /**
     * 执行查询并返回所有结果行
     */
    all(...params: unknown[]): Record<string, unknown>[];

    /**
     * 执行查询并返回第一行结果
     */
    get(...params: unknown[]): Record<string, unknown> | undefined;

    /**
     * 执行语句（INSERT/UPDATE/DELETE），返回影响行数和最后插入 ID
     */
    run(...params: unknown[]): StatementResult;
  }

  /** SQLite 数据库连接选项 */
  interface DatabaseSyncOptions {
    /** 是否以只读模式打开 */
    readonly?: boolean;

    /** 是否允许创建数据库文件 */
    allowCreate?: boolean;
  }

  /** SQLite 数据库连接（同步接口） */
  class DatabaseSync {
    /**
     * 打开或创建 SQLite 数据库
     * @param path 数据库文件路径（或 ':memory:'）
     * @param options 连接选项
     */
    constructor(path: string, options?: DatabaseSyncOptions);

    /**
     * 预编译 SQL 语句
     */
    prepare(sql: string): StatementSync;

    /**
     * 执行 SQL 语句（不返回结果行）
     * 注：PRAGMA 语句也通过 exec() 执行，例如 db.exec('PRAGMA journal_mode = WAL')
     */
    exec(sql: string): void;

    /**
     * 关闭数据库连接
     */
    close(): void;
  }
}
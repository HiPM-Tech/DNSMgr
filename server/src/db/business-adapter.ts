/**
 * 数据库业务适配器层 (Database Business Adapter Layer)
 * 
 * 架构层级：
 * 路由层 → 业务适配器（本文件）→ 数据库抽象层 → 数据库驱动 → 数据库
 * 
 * 设计原则：
 * 1. 函数式API - 路由层通过简单函数调用使用数据库
 * 2. 单一职责 - 每个函数只处理一个业务操作
 * 3. 高扩展性 - 新增业务只需添加新函数
 * 4. 封装隔离 - 数据库变动不影响路由层
 * 5. 完整日志 - 所有操作都有详细日志
 */

import crypto from 'crypto';
import type { SQLCompiler } from './query/compiler';
import { getDefaultCompiler } from './query/compiler';
import { transaction, getConnection } from './core/connection';
import { log } from '../lib/logger';

// 本地 db 对象，避免循环依赖
const db = {
  get type() { return process.env.DB_TYPE || 'sqlite'; },
  get isConnected() { 
    try {
      const conn = getConnection();
      return !!conn;
    } catch {
      return false;
    }
  },
  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const conn = getConnection();
    return conn.query<T>(sql, params);
  },
  async get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const conn = getConnection();
    return conn.get<T>(sql, params);
  },
  async execute(sql: string, params?: unknown[]): Promise<void> {
    const conn = getConnection();
    return conn.execute(sql, params);
  },
  async insert(sql: string, params?: unknown[]): Promise<number> {
    const conn = getConnection();
    return conn.insert(sql, params);
  },
  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const conn = getConnection();
    return conn.run(sql, params);
  },
};

// ============================================================================
// 类型定义
// ============================================================================

/** 查询结果类型 */
export type QueryResult = Record<string, unknown>;

/** 业务操作上下文 */
interface OperationContext {
  operation: string;
  table?: string;
  userId?: number;
  requestId?: string;
}

// ============================================================================
// SQL 兼容性辅助函数
// ============================================================================

/**
 * 生成 UPSERT SQL 语句（兼容 MySQL/PostgreSQL/SQLite）
 * @param table 表名
 * @param columns 列名数组（不含 updated_at）
 * @param values 值数组
 * @param conflictKey 冲突键
 * @param updateColumns 需要更新的列（不含 updated_at）
 */
function buildUpsertSql(
  table: string,
  columns: string[],
  values: unknown[],
  conflictKey: string,
  updateColumns: string[]
): { sql: string; params: unknown[] } {
  const dbType = getDbType();
  
  // 添加 updated_at 列
  const allColumns = [...columns, 'updated_at'];
  
  if (dbType === 'mysql') {
    // MySQL: INSERT ... ON DUPLICATE KEY UPDATE
    // updated_at 不在 INSERT 的列中，只在 UPDATE 部分使用 NOW()
    const insertColumns = columns.map(col => col === 'key' || col === 'value' ? `\`${col}\`` : col).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const updates = updateColumns.map(col => {
      const escaped = col === 'key' || col === 'value' ? `\`${col}\`` : col;
      return `${escaped} = VALUES(${escaped})`;
    }).join(', ');
    
    const sql = `INSERT INTO ${table} (${insertColumns}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}, updated_at = NOW()`;
    return { sql, params: values };
  } else if (dbType === 'postgresql') {
    // PostgreSQL: INSERT ... ON CONFLICT DO UPDATE
    // updated_at 不在 INSERT 的列中，只在 UPDATE 部分使用 NOW()
    const insertColumns = columns.join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const updates = updateColumns.map(col => {
      return `${col} = EXCLUDED.${col}`;
    }).join(', ');
    
    const sql = `INSERT INTO ${table} (${insertColumns}) VALUES (${placeholders}) ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}, updated_at = NOW()`;
    return { sql, params: values };
  } else {
    // SQLite: INSERT ... ON CONFLICT DO UPDATE
    // updated_at 不在 INSERT 的列中，只在 UPDATE 部分使用 CURRENT_TIMESTAMP
    const insertColumns = columns.join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const updates = updateColumns.map(col => {
      return `${col} = excluded.${col}`;
    }).join(', ');
    
    const sql = `INSERT INTO ${table} (${insertColumns}) VALUES (${placeholders}) ON CONFLICT(${conflictKey}) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`;
    return { sql, params: values };
  }
}

// ============================================================================
// 日志系统 - 使用统一日志模块
// ============================================================================

/** 创建操作日志上下文 */
function createOperationLogger(context: OperationContext) {
  return {
    start: () => log.debug('BusinessAdapter', `Starting ${context.operation}`, { table: context.table, userId: context.userId }),
    success: (duration: number, meta?: Record<string, unknown>) => 
      log.debug('BusinessAdapter', `${context.operation} completed`, { ...meta, duration: `${duration}ms`, table: context.table }),
    error: (error: unknown, duration: number) => 
      log.error('BusinessAdapter', `${context.operation} failed`, { error, duration: `${duration}ms`, table: context.table }),
  };
}

// ============================================================================
// 底层数据库操作（内部使用）
// ============================================================================

/** SQL处理器 */
function processSql(sql: string, dbType: string): string {
  const originalSql = sql;
  
  // 转换 PostgreSQL 的 $1, $2... 占位符
  if (dbType === 'postgresql') {
    let index = 0;
    sql = sql.replace(/\?/g, () => `$${++index}`);
  }

  // MySQL 兼容性处理
  if (dbType === 'mysql') {
    // 1. 先处理 ON CONFLICT 转换（在关键字转义之前）
    // 匹配: ON CONFLICT(...) DO UPDATE SET col = excluded.col, ...
    sql = sql.replace(
      /ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\s+(.+?)(?:\s*$|\s+(?=RETURNING|WHERE|ORDER|LIMIT|OFFSET))/i,
      (match, updateClause) => {
        // 转换 excluded.col 为 VALUES(col)
        const mysqlUpdateClause = updateClause.replace(
          /excluded\.([a-zA-Z_][a-zA-Z0-9_]*)/gi,
          'VALUES($1)'
        );
        return `ON DUPLICATE KEY UPDATE ${mysqlUpdateClause}`;
      }
    );

    // 2. 转义保留关键字（仅转义作为标识符的关键字）
    // 注意：跳过已经转义的、在 ON DUPLICATE KEY UPDATE 中的、以及 SQL 关键字上下文中的
    const keywords = ['key', 'value'];
    keywords.forEach(keyword => {
      // 匹配未转义的关键字：前面不是反引号，后面也不是反引号
      // 使用 lookbehind 和 lookahead 来确保关键字没有被反引号包围
      const regex = new RegExp(`(?<!\x60)\\b${keyword}\\b(?!\x60)`, 'gi');
      sql = sql.replace(regex, (match, offset) => {
        const upperSql = sql.toUpperCase();
        const beforeContext = sql.substring(Math.max(0, offset - 20), offset).toUpperCase();
        const afterContext = sql.substring(offset + match.length, Math.min(sql.length, offset + match.length + 20)).toUpperCase();
        
        // 跳过 ON DUPLICATE KEY UPDATE 中的 KEY
        if (beforeContext.includes('ON DUPLICATE') && keyword.toLowerCase() === 'key') {
          return match;
        }
        
        // 跳过 ORDER BY / GROUP BY 中的 BY
        if (beforeContext.includes('ORDER') || beforeContext.includes('GROUP')) {
          return match;
        }
        
        // 跳过 FOREIGN KEY / PRIMARY KEY 中的 KEY
        if (beforeContext.includes('FOREIGN') || beforeContext.includes('PRIMARY')) {
          return match;
        }
        
        return `\`${keyword}\``;
      });
    });
  }

  if (sql !== originalSql) {
    log.debug('BusinessAdapter', 'SQL processed', { original: originalSql, processed: sql });
  }

  return sql;
}

/** 执行查询并返回多行（内部） */
async function queryInternal<T = QueryResult>(sql: string, params?: unknown[], context?: OperationContext): Promise<T[]> {
  const startTime = Date.now();
  const processedSql = processSql(sql, db.type);
  
  log.debug('BusinessAdapter', 'Executing query', { sql: processedSql, params, operation: context?.operation });
  
  try {
    const results = await db.query<T>(processedSql, params);
    const duration = Date.now() - startTime;
    log.debug('BusinessAdapter', `Query executed`, { 
      sql: processedSql.substring(0, 100), 
      rowCount: results.length,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('BusinessAdapter', 'Query failed', { 
      sql: processedSql, 
      params, 
      error,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    throw error;
  }
}

/** 执行查询并返回单行（内部） */
async function getInternal<T = QueryResult>(sql: string, params?: unknown[], context?: OperationContext): Promise<T | undefined> {
  const startTime = Date.now();
  const processedSql = processSql(sql, db.type);
  
  log.debug('BusinessAdapter', 'Executing get', { sql: processedSql, params, operation: context?.operation });
  
  try {
    const result = await db.get<T>(processedSql, params);
    const duration = Date.now() - startTime;
    log.debug('BusinessAdapter', `Get executed`, { 
      sql: processedSql.substring(0, 100), 
      found: result !== undefined,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('BusinessAdapter', 'Get failed', { 
      sql: processedSql, 
      params, 
      error,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    throw error;
  }
}

/** 执行INSERT/UPDATE/DELETE（内部） */
async function executeInternal(sql: string, params?: unknown[], context?: OperationContext): Promise<void> {
  const startTime = Date.now();
  const processedSql = processSql(sql, db.type);
  
  log.debug('BusinessAdapter', 'Executing command', { sql: processedSql, params, operation: context?.operation });
  
  try {
    await db.execute(processedSql, params);
    const duration = Date.now() - startTime;
    log.info('BusinessAdapter', `Command executed`, { 
      sql: processedSql.substring(0, 100),
      duration: `${duration}ms`,
      operation: context?.operation
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('BusinessAdapter', 'Command failed', { 
      sql: processedSql, 
      params, 
      error,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    throw error;
  }
}

/** 执行INSERT并返回ID（内部） */
async function insertInternal(sql: string, params?: unknown[], context?: OperationContext): Promise<number> {
  const startTime = Date.now();
  const processedSql = processSql(sql, db.type);
  
  log.debug('BusinessAdapter', 'Executing insert', { sql: processedSql, params, operation: context?.operation });
  
  try {
    const id = await db.insert(processedSql, params);
    const duration = Date.now() - startTime;
    log.info('BusinessAdapter', `Insert executed`, { 
      sql: processedSql.substring(0, 100), 
      insertId: id,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    return id;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('BusinessAdapter', 'Insert failed', { 
      sql: processedSql, 
      params, 
      error,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    throw error;
  }
}

/** 执行UPDATE/DELETE并返回影响行数（内部） */
async function runInternal(sql: string, params?: unknown[], context?: OperationContext): Promise<{ changes: number }> {
  const startTime = Date.now();
  const processedSql = processSql(sql, db.type);
  
  log.debug('BusinessAdapter', 'Executing run', { sql: processedSql, params, operation: context?.operation });
  
  try {
    const result = await db.run(processedSql, params);
    const duration = Date.now() - startTime;
    log.info('BusinessAdapter', `Run executed`, { 
      sql: processedSql.substring(0, 100), 
      changes: result.changes,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('BusinessAdapter', 'Run failed', { 
      sql: processedSql, 
      params, 
      error,
      duration: `${duration}ms`,
      operation: context?.operation
    });
    throw error;
  }
}

// ============================================================================
// 通用数据库操作（可直接使用）
// ============================================================================

/** 执行查询并返回多行 */
export async function query<T = QueryResult>(sql: string, params?: unknown[]): Promise<T[]> {
  return queryInternal<T>(sql, params, { operation: 'query' });
}

/** 执行查询并返回单行 */
export async function get<T = QueryResult>(sql: string, params?: unknown[]): Promise<T | undefined> {
  return getInternal<T>(sql, params, { operation: 'get' });
}

/** 执行INSERT/UPDATE/DELETE */
export async function execute(sql: string, params?: unknown[]): Promise<void> {
  return executeInternal(sql, params, { operation: 'execute' });
}

/** 执行INSERT并返回ID */
export async function insert(sql: string, params?: unknown[]): Promise<number> {
  return insertInternal(sql, params, { operation: 'insert' });
}

/** 执行UPDATE/DELETE并返回影响行数 */
export async function run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
  return runInternal(sql, params, { operation: 'run' });
}

/** 获取当前时间函数 */
export function now(): string {
  const compiler = getDefaultCompiler();
  return compiler.now();
}

/** 获取数据库类型 */
export function getDbType(): string {
  return db.type;
}

/** 检查数据库是否已连接 */
export function isDbConnected(): boolean {
  return db.isConnected;
}

// ============================================================================
// 用户相关业务操作
// ============================================================================

export const UserOperations = {
  /** 根据ID获取用户完整信息 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id, username, nickname, email, password_hash, role_level as role, status, created_at, updated_at FROM users WHERE id = ?',
      [id],
      { operation: 'User.getById', table: 'users' }
    );
  },

  /** 根据用户名获取用户完整信息 */
  async getByUsername(username: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id, username, nickname, email, password_hash, role_level as role, status, created_at, updated_at FROM users WHERE username = ?',
      [username],
      { operation: 'User.getByUsername', table: 'users' }
    );
  },

  /** 根据邮箱获取用户完整信息 */
  async getByEmail(email: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id, username, nickname, email, password_hash, role_level as role, status, created_at, updated_at FROM users WHERE email = ?',
      [email],
      { operation: 'User.getByEmail', table: 'users' }
    );
  },

  /** 根据ID获取用户公开信息（不含密码） */
  async getPublicById(id: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id, username, nickname, email, role_level as role, status, created_at, updated_at FROM users WHERE id = ?',
      [id],
      { operation: 'User.getPublicById', table: 'users' }
    );
  },

  /** 获取所有用户 */
  async getAll(): Promise<QueryResult[]> {
    return queryInternal('SELECT * FROM users ORDER BY id', [], { operation: 'User.getAll', table: 'users' });
  },

  /** 创建用户 */
  async create(data: { username: string; nickname: string; email: string; password_hash: string; role: string; role_level: number }): Promise<number> {
    return insertInternal(
      'INSERT INTO users (username, nickname, email, password_hash, role, role_level) VALUES (?, ?, ?, ?, ?, ?)',
      [data.username, data.nickname, data.email, data.password_hash, data.role, data.role_level],
      { operation: 'User.create', table: 'users' }
    );
  },

  /** 更新用户 */
  async update(id: number, updates: Record<string, unknown>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);
    
    return executeInternal(
      `UPDATE users SET ${setClause} WHERE id = ?`,
      [...values, id],
      { operation: 'User.update', table: 'users' }
    );
  },

  /** 删除用户 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM users WHERE id = ?', [id], { operation: 'User.delete', table: 'users' });
  },

  /** 更新密码 */
  async updatePassword(id: number, passwordHash: string): Promise<void> {
    return executeInternal(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, id],
      { operation: 'User.updatePassword', table: 'users' }
    );
  },

  /** 获取用户数量 */
  async getCount(): Promise<number> {
    const result = await getInternal<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users', [], { operation: 'User.getCount', table: 'users' });
    return result?.cnt || 0;
  },
};

// ============================================================================
// DNS账号业务操作
// ============================================================================

export const DnsAccountOperations = {
  /** 根据ID获取账号 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM dns_accounts WHERE id = ?', [id], { operation: 'DnsAccount.getById', table: 'dns_accounts' });
  },

  /** 获取所有账号 */
  async getAll(): Promise<QueryResult[]> {
    return queryInternal('SELECT * FROM dns_accounts ORDER BY id', [], { operation: 'DnsAccount.getAll', table: 'dns_accounts' });
  },

  /** 获取用户可访问的账号 */
  async getByUserId(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM dns_accounts WHERE created_by = ? ORDER BY id',
      [userId],
      { operation: 'DnsAccount.getByUserId', table: 'dns_accounts' }
    );
  },

  /** 获取用户可访问的账号（包括团队共享） */
  async getAccessibleByUserId(userId: number, teamIds: number[]): Promise<QueryResult[]> {
    if (teamIds.length > 0) {
      const placeholders = teamIds.map(() => '?').join(',');
      return queryInternal(
        `SELECT * FROM dns_accounts WHERE created_by = ? OR team_id IN (${placeholders}) ORDER BY id`,
        [userId, ...teamIds],
        { operation: 'DnsAccount.getAccessibleByUserId', table: 'dns_accounts' }
      );
    }
    return this.getByUserId(userId);
  },

  /** 创建账号 */
  async create(data: { type: string; name: string; config: string; remark: string; created_by: number; team_id?: number | null }): Promise<number> {
    return insertInternal(
      'INSERT INTO dns_accounts (type, name, config, remark, created_by, team_id) VALUES (?, ?, ?, ?, ?, ?)',
      [data.type, data.name, data.config, data.remark, data.created_by, data.team_id ?? null],
      { operation: 'DnsAccount.create', table: 'dns_accounts' }
    );
  },

  /** 更新账号 */
  async update(id: number, updates: Record<string, unknown>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);
    
    return executeInternal(
      `UPDATE dns_accounts SET ${setClause} WHERE id = ?`,
      [...values, id],
      { operation: 'DnsAccount.update', table: 'dns_accounts' }
    );
  },

  /** 删除账号 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM dns_accounts WHERE id = ?', [id], { operation: 'DnsAccount.delete', table: 'dns_accounts' });
  },

  /** 获取账号的创建者 */
  async getCreatedBy(id: number): Promise<number | undefined> {
    const result = await getInternal<{ created_by: number }>(
      'SELECT created_by FROM dns_accounts WHERE id = ?',
      [id],
      { operation: 'DnsAccount.getCreatedBy', table: 'dns_accounts' }
    );
    return result?.created_by;
  },

  /** 根据类型获取账号 */
  async getByType(type: string): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM dns_accounts WHERE type = ?',
      [type],
      { operation: 'DnsAccount.getByType', table: 'dns_accounts' }
    );
  },

  /** 根据类型和用户获取账号 */
  async getByTypeAndUser(type: string, userId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM dns_accounts WHERE type = ? AND created_by = ?',
      [type, userId],
      { operation: 'DnsAccount.getByTypeAndUser', table: 'dns_accounts' }
    );
  },

  /** 根据类型、用户或团队获取账号 */
  async getByTypeAndUserOrTeams(type: string, userId: number, teamIds: number[]): Promise<QueryResult[]> {
    const placeholders = teamIds.map(() => '?').join(',');
    return queryInternal(
      `SELECT * FROM dns_accounts WHERE type = ? AND (created_by = ? OR team_id IN (${placeholders}))`,
      [type, userId, ...teamIds],
      { operation: 'DnsAccount.getByTypeAndUserOrTeams', table: 'dns_accounts' }
    );
  },
};

// ============================================================================
// 域名业务操作
// ============================================================================

export const DomainOperations = {
  /** 根据ID获取域名 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM domains WHERE id = ?', [id], { operation: 'Domain.getById', table: 'domains' });
  },

  /** 根据名称获取域名 */
  async getByName(name: string): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM domains WHERE name = ?', [name], { operation: 'Domain.getByName', table: 'domains' });
  },

  /** 获取所有域名 */
  async getAll(): Promise<QueryResult[]> {
    return queryInternal('SELECT * FROM domains ORDER BY id', [], { operation: 'Domain.getAll', table: 'domains' });
  },

  /** 获取账号下的域名 */
  async getByAccountId(accountId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM domains WHERE account_id = ? ORDER BY id',
      [accountId],
      { operation: 'Domain.getByAccountId', table: 'domains' }
    );
  },

  /** 创建域名 */
  async create(data: { account_id: number; name: string; third_id?: string; record_count?: number }): Promise<number> {
    return insertInternal(
      'INSERT INTO domains (account_id, name, third_id, record_count) VALUES (?, ?, ?, ?)',
      [data.account_id, data.name, data.third_id ?? null, data.record_count ?? 0],
      { operation: 'Domain.create', table: 'domains' }
    );
  },

  /** 更新域名 */
  async update(id: number, updates: Record<string, unknown>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);
    
    return executeInternal(
      `UPDATE domains SET ${setClause} WHERE id = ?`,
      [...values, id],
      { operation: 'Domain.update', table: 'domains' }
    );
  },

  /** 删除域名 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM domains WHERE id = ?', [id], { operation: 'Domain.delete', table: 'domains' });
  },

  /** 更新记录数量 */
  async updateRecordCount(id: number, count: number): Promise<void> {
    return executeInternal(
      'UPDATE domains SET record_count = ? WHERE id = ?',
      [count, id],
      { operation: 'Domain.updateRecordCount', table: 'domains' }
    );
  },

  /** 根据账号ID和名称获取域名 */
  async getByAccountIdAndName(accountId: number, name: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM domains WHERE account_id = ? AND name = ?',
      [accountId, name],
      { operation: 'Domain.getByAccountIdAndName', table: 'domains' }
    );
  },

  /** 更新域名的第三方ID和记录数 */
  async updateThirdIdAndRecordCount(id: number, thirdId: string, recordCount: number): Promise<void> {
    return executeInternal(
      'UPDATE domains SET third_id = ?, record_count = ? WHERE id = ?',
      [thirdId, recordCount, id],
      { operation: 'Domain.updateThirdIdAndRecordCount', table: 'domains' }
    );
  },

  /** 更新域名的备注和隐藏状态 */
  async updateRemarkAndHidden(id: number, remark?: string, isHidden?: number): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
    if (isHidden !== undefined) { updates.push('is_hidden = ?'); params.push(isHidden); }
    if (updates.length === 0) return;
    params.push(id);
    return executeInternal(
      `UPDATE domains SET ${updates.join(', ')} WHERE id = ?`,
      params,
      { operation: 'Domain.updateRemarkAndHidden', table: 'domains' }
    );
  },

  /** 获取用户可访问的域名列表（带过滤） */
  async getAccessibleDomains(params: {
    userId: number;
    teamIds: number[];
    accountId?: number;
    keyword?: string;
    isSuper?: boolean;
  }): Promise<QueryResult[]> {
    const { userId, teamIds, accountId, keyword, isSuper } = params;
    
    if (isSuper) {
      let sql = 'SELECT * FROM domains WHERE 1=1';
      const queryParams: unknown[] = [];
      if (accountId) { sql += ' AND account_id = ?'; queryParams.push(accountId); }
      if (keyword) { sql += ' AND name LIKE ?'; queryParams.push(`%${keyword}%`); }
      sql += ' ORDER BY id';
      return queryInternal(sql, queryParams, { operation: 'Domain.getAccessibleDomains.super', table: 'domains' });
    }
    
    // 非超级管理员需要检查权限
    const teamFilter = teamIds.length > 0 ? `OR team_id IN (${teamIds.map(() => '?').join(',')})` : '';
    const teamPermFilter = teamIds.length > 0 ? `OR team_id IN (${teamIds.map(() => '?').join(',')})` : '';
    
    let sql = `SELECT d.* FROM domains d WHERE (d.account_id IN (
      SELECT id FROM dns_accounts WHERE created_by = ? ${teamFilter}
    ) OR d.id IN (
      SELECT domain_id FROM domain_permissions WHERE user_id = ? ${teamPermFilter}
    ))`;
    
    const queryParams: unknown[] = [userId, ...teamIds, userId, ...teamIds];
    
    if (accountId) { sql += ' AND d.account_id = ?'; queryParams.push(accountId); }
    if (keyword) { sql += ' AND d.name LIKE ?'; queryParams.push(`%${keyword}%`); }
    sql += ' ORDER BY d.id';
    
    return queryInternal(sql, queryParams, { operation: 'Domain.getAccessibleDomains', table: 'domains' });
  },

  /** 检查用户是否有权限访问特定域名（用于令牌权限验证） */
  async checkUserDomainAccess(domainId: number, userId: number): Promise<boolean> {
    const result = await getInternal<{ id: number }>(
      `SELECT d.id FROM domains d
       JOIN dns_accounts da ON d.account_id = da.id
       WHERE d.id = ? AND (da.created_by = ? OR d.id IN (
         SELECT domain_id FROM domain_permissions WHERE user_id = ?
       ))`,
      [domainId, userId, userId],
      { operation: 'Domain.checkUserDomainAccess', table: 'domains' }
    );
    return !!result;
  },

  /** 获取用户可访问的域名列表（用于令牌创建） */
  async getUserAccessibleDomains(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT d.id, d.name, da.name as account_name
       FROM domains d
       JOIN dns_accounts da ON d.account_id = da.id
       WHERE da.created_by = ? OR d.id IN (
         SELECT domain_id FROM domain_permissions WHERE user_id = ?
       )
       ORDER BY d.name`,
      [userId, userId],
      { operation: 'Domain.getUserAccessibleDomains', table: 'domains' }
    );
  },
};

// ============================================================================
// 团队业务操作
// ============================================================================

export const TeamOperations = {
  /** 根据ID获取团队 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM teams WHERE id = ?', [id], { operation: 'Team.getById', table: 'teams' });
  },

  /** 获取所有团队 */
  async getAll(): Promise<QueryResult[]> {
    return queryInternal('SELECT * FROM teams ORDER BY id', [], { operation: 'Team.getAll', table: 'teams' });
  },

  /** 获取用户所属团队 */
  async getByUserId(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT t.* FROM teams t
       INNER JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = ?
       ORDER BY t.id`,
      [userId],
      { operation: 'Team.getByUserId', table: 'teams' }
    );
  },

  /** 创建团队 */
  async create(data: { name: string; description: string; created_by: number }): Promise<number> {
    return insertInternal(
      'INSERT INTO teams (name, description, created_by) VALUES (?, ?, ?)',
      [data.name, data.description, data.created_by],
      { operation: 'Team.create', table: 'teams' }
    );
  },

  /** 更新团队 */
  async update(id: number, updates: Record<string, unknown>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);
    
    return executeInternal(
      `UPDATE teams SET ${setClause} WHERE id = ?`,
      [...values, id],
      { operation: 'Team.update', table: 'teams' }
    );
  },

  /** 删除团队 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM teams WHERE id = ?', [id], { operation: 'Team.delete', table: 'teams' });
  },

  /** 添加团队成员 */
  async addMember(teamId: number, userId: number, role: string): Promise<void> {
    return executeInternal(
      'INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)',
      [teamId, userId, role],
      { operation: 'Team.addMember', table: 'team_members' }
    );
  },

  /** 获取团队成员 */
  async getMembers(teamId: number): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT tm.*, u.username, u.nickname, u.email FROM team_members tm
       INNER JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ?`,
      [teamId],
      { operation: 'Team.getMembers', table: 'team_members' }
    );
  },

  /** 检查用户是否在团队中 */
  async isMember(teamId: number, userId: number): Promise<boolean> {
    const result = await getInternal<{ id: number }>(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId],
      { operation: 'Team.isMember', table: 'team_members' }
    );
    return !!result;
  },

  /** 移除团队成员 */
  async removeMember(teamId: number, userId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId],
      { operation: 'Team.removeMember', table: 'team_members' }
    );
  },

  /** 更新团队成员角色 */
  async updateMemberRole(teamId: number, userId: number, role: string): Promise<void> {
    return executeInternal(
      'UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?',
      [role, teamId, userId],
      { operation: 'Team.updateMemberRole', table: 'team_members' }
    );
  },

  /** 获取用户的所有团队ID */
  async getTeamIdsByUserId(userId: number): Promise<number[]> {
    const results = await queryInternal<{ team_id: number }>(
      'SELECT team_id FROM team_members WHERE user_id = ?',
      [userId],
      { operation: 'Team.getTeamIdsByUserId', table: 'team_members' }
    );
    return results.map(r => r.team_id);
  },

  /** 获取团队成员及其角色 */
  async getMemberWithRole(teamId: number, userId: number): Promise<{ id: number; role: string } | undefined> {
    return getInternal<{ id: number; role: string }>(
      'SELECT id, role FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId],
      { operation: 'Team.getMemberWithRole', table: 'team_members' }
    );
  },
};

// ============================================================================
// 系统设置业务操作
// ============================================================================

export const SettingsOperations = {
  /** 获取设置值 */
  async get(key: string): Promise<string | undefined> {
    const result = await getInternal<{ value: string }>(
      'SELECT value FROM system_settings WHERE key = ?',
      [key],
      { operation: 'Settings.get', table: 'system_settings' }
    );
    return result?.value;
  },

  /** 设置值 */
  async set(key: string, value: string): Promise<void> {
    const { sql, params } = buildUpsertSql(
      'system_settings',
      ['key', 'value'],
      [key, value],
      'key',
      ['value']
    );
    
    return executeInternal(sql, params, { operation: 'Settings.set', table: 'system_settings' });
  },

  /** 获取JSON设置 */
  async getJson<T>(key: string, defaultValue: T): Promise<T> {
    const value = await this.get(key);
    if (!value) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return defaultValue;
    }
  },

  /** 设置JSON值 */
  async setJson(key: string, value: unknown): Promise<void> {
    return this.set(key, JSON.stringify(value));
  },
};

// ============================================================================
// 审计日志业务操作
// ============================================================================

export const AuditOperations = {
  /** 记录审计日志 */
  async log(data: { user_id: number; action: string; target_type?: string; target_id?: string; details?: string }): Promise<void> {
    return executeInternal(
      'INSERT INTO audit_logs (user_id, action, target_type, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [data.user_id, data.action, data.target_type ?? null, data.target_id ?? null, data.details ?? null],
      { operation: 'Audit.log', table: 'audit_logs' }
    );
  },

  /** 获取审计日志 */
  async getLogs(options: { userId?: number; action?: string; limit?: number; offset?: number } = {}): Promise<QueryResult[]> {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: unknown[] = [];
    
    if (options.userId) {
      sql += ' AND user_id = ?';
      params.push(options.userId);
    }
    
    if (options.action) {
      sql += ' AND action = ?';
      params.push(options.action);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    // MySQL 的 LIMIT/OFFSET 需要直接嵌入数值
    const dbType = getDbType();
    if (options.limit) {
      if (dbType === 'mysql') {
        sql += ` LIMIT ${Number(options.limit)}`;
      } else {
        sql += ' LIMIT ?';
        params.push(Number(options.limit));
      }
    }
    
    if (options.offset) {
      if (dbType === 'mysql') {
        sql += ` OFFSET ${Number(options.offset)}`;
      } else {
        sql += ' OFFSET ?';
        params.push(Number(options.offset));
      }
    }
    
    return queryInternal(sql, params, { operation: 'Audit.getLogs', table: 'audit_logs' });
  },
};

// ============================================================================
// 通知渠道业务操作
// ============================================================================

export const NotificationOperations = {
  /** 获取通知渠道配置 */
  async getChannels(): Promise<string | undefined> {
    return SettingsOperations.get('notification_channels');
  },

  /** 保存通知渠道配置 */
  async saveChannels(config: string): Promise<void> {
    return SettingsOperations.set('notification_channels', config);
  },
};

// ============================================================================
// 审计规则业务操作
// ============================================================================

export const AuditRuleOperations = {
  /** 获取审计规则 */
  async getRules(): Promise<string | undefined> {
    return SettingsOperations.get('audit_rules');
  },

  /** 保存审计规则 */
  async saveRules(rules: string): Promise<void> {
    return SettingsOperations.set('audit_rules', rules);
  },
};

// ============================================================================
// 域名过期通知业务操作
// ============================================================================

export const DomainExpiryOperations = {
  /** 获取过期通知配置 */
  async getNotification(): Promise<string | undefined> {
    return SettingsOperations.get('domain_expiry_notification');
  },

  /** 保存过期通知配置 */
  async saveNotification(config: string): Promise<void> {
    return SettingsOperations.set('domain_expiry_notification', config);
  },

  /** 获取过期天数 */
  async getDays(): Promise<string | undefined> {
    return SettingsOperations.get('domain_expiry_days');
  },

  /** 保存过期天数 */
  async saveDays(days: string): Promise<void> {
    return SettingsOperations.set('domain_expiry_days', days);
  },
};

// ============================================================================
// 2FA 业务操作
// ============================================================================

export const TwoFAOperations = {
  /** 获取用户的 2FA 配置 */
  async getByUserIdAndType(userId: number, type: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM user_2fa WHERE user_id = ? AND type = ?',
      [userId, type],
      { operation: 'TwoFA.getByUserIdAndType', table: 'user_2fa' }
    );
  },

  /** 检查是否启用了 WebAuthn */
  async isWebAuthnEnabled(userId: number): Promise<boolean> {
    const result = await getInternal<{ enabled: number }>(
      'SELECT enabled FROM user_2fa WHERE user_id = ? AND type = ?',
      [userId, 'webauthn'],
      { operation: 'TwoFA.isWebAuthnEnabled', table: 'user_2fa' }
    );
    return Boolean(result?.enabled);
  },

  /** 获取 TOTP 密钥 */
  async getTOTPSecret(userId: number): Promise<string | undefined> {
    const result = await getInternal<{ secret: string }>(
      'SELECT secret FROM user_2fa WHERE user_id = ? AND type = ?',
      [userId, 'totp'],
      { operation: 'TwoFA.getTOTPSecret', table: 'user_2fa' }
    );
    return result?.secret;
  },

  /** 创建或更新 2FA 配置 */
  async upsert(data: { user_id: number; type: string; secret?: string; enabled?: boolean }): Promise<void> {
    const { sql, params } = buildUpsertSql(
      'user_2fa',
      ['user_id', 'type', 'secret', 'enabled', 'updated_at'],
      [data.user_id, data.type, data.secret ?? null, data.enabled ? 1 : 0, 'NOW()'],
      'user_id,type',
      ['secret', 'enabled', 'updated_at']
    );
    return executeInternal(sql, params, { operation: 'TwoFA.upsert', table: 'user_2fa' });
  },

  /** 删除 2FA 配置 */
  async delete(userId: number, type: string): Promise<void> {
    return executeInternal(
      'DELETE FROM user_2fa WHERE user_id = ? AND type = ?',
      [userId, type],
      { operation: 'TwoFA.delete', table: 'user_2fa' }
    );
  },
};

// ============================================================================
// OAuth 用户链接业务操作
// ============================================================================

export const OAuthOperations = {
  /** 根据 provider 和 subject 获取用户链接 */
  async getByProviderSubject(provider: string, subject: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM oauth_user_links WHERE provider = ? AND subject = ?',
      [provider, subject],
      { operation: 'OAuth.getByProviderSubject', table: 'oauth_user_links' }
    );
  },

  /** 根据 provider 和 subject 获取用户完整信息（包含 JOIN users） */
  async getUserByProviderSubject(provider: string, subject: string): Promise<QueryResult | undefined> {
    return getInternal(
      `SELECT l.user_id, u.id, u.username, u.nickname, u.email, u.role_level as role, u.status
       FROM oauth_user_links l
       INNER JOIN users u ON u.id = l.user_id
       WHERE l.provider = ? AND l.subject = ?`,
      [provider, subject],
      { operation: 'OAuth.getUserByProviderSubject', table: 'oauth_user_links' }
    );
  },

  /** 获取用户的所有 OAuth 绑定 */
  async getByUserId(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT provider, subject, email, created_at FROM oauth_user_links WHERE user_id = ? ORDER BY id DESC',
      [userId],
      { operation: 'OAuth.getByUserId', table: 'oauth_user_links' }
    );
  },

  /** 创建 OAuth 用户链接 */
  async create(userId: number, provider: string, subject: string, email: string): Promise<void> {
    return executeInternal(
      'INSERT INTO oauth_user_links (user_id, provider, subject, email) VALUES (?, ?, ?, ?)',
      [userId, provider, subject, email],
      { operation: 'OAuth.create', table: 'oauth_user_links' }
    );
  },

  /** 删除 OAuth 用户链接 */
  async delete(userId: number, provider: string): Promise<void> {
    return executeInternal(
      'DELETE FROM oauth_user_links WHERE user_id = ? AND provider = ?',
      [userId, provider],
      { operation: 'OAuth.delete', table: 'oauth_user_links' }
    );
  },

  // ============================================================================
  // OAuth State 管理（用于回调验证）
  // ============================================================================

  /**
   * 将日期格式化为数据库兼容的格式 (YYYY-MM-DD HH:mm:ss)
   */
  formatDateForDB(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },

  /** 创建 OAuth state */
  async createState(state: string, mode: 'login' | 'bind', provider: string, userId: number | null, expiresAt: Date): Promise<void> {
    // 使用数据库兼容的日期格式
    const expiresStr = this.formatDateForDB(expiresAt);
    log.debug('OAuth', 'Creating state', {
      state: state.substring(0, 16) + '...',
      mode,
      provider,
      userId,
      expiresAt: expiresStr
    });
    return executeInternal(
      'INSERT INTO oauth_states (state, mode, provider, user_id, expires_at) VALUES (?, ?, ?, ?, ?)',
      [state, mode, provider, userId, expiresStr],
      { operation: 'OAuth.createState', table: 'oauth_states' }
    );
  },

  /** 获取并删除 OAuth state（一次性使用） */
  async getAndDeleteState(state: string): Promise<{ mode: 'login' | 'bind'; provider: 'custom' | 'logto'; userId: number | null; expiresAt: Date } | undefined> {
    const result = await getInternal<{ mode: string; provider: string; user_id: number | null; expires_at: string }>(
      'SELECT mode, provider, user_id, expires_at FROM oauth_states WHERE state = ?',
      [state],
      { operation: 'OAuth.getState', table: 'oauth_states' }
    );

    log.debug('OAuth', 'Getting state', {
      state: state.substring(0, 16) + '...',
      found: !!result,
      result
    });

    if (!result) return undefined;

    // 删除已使用的 state
    await executeInternal(
      'DELETE FROM oauth_states WHERE state = ?',
      [state],
      { operation: 'OAuth.deleteState', table: 'oauth_states' }
    );

    return {
      mode: result.mode as 'login' | 'bind',
      provider: result.provider as 'custom' | 'logto',
      userId: result.user_id,
      expiresAt: new Date(result.expires_at),
    };
  },

  /** 清理过期的 OAuth states */
  async cleanupExpiredStates(): Promise<number> {
    const expiresStr = this.formatDateForDB(new Date());
    const result = await runInternal(
      'DELETE FROM oauth_states WHERE expires_at < ?',
      [expiresStr],
      { operation: 'OAuth.cleanupExpiredStates', table: 'oauth_states' }
    );
    return result.changes || 0;
  },
};

// ============================================================================
// API 令牌业务操作
// ============================================================================

export const TokenOperations = {
  /** 根据 ID 获取令牌 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM user_tokens WHERE id = ?', [id], { operation: 'Token.getById', table: 'user_tokens' });
  },

  /** 获取用户的所有令牌 */
  async getByUserId(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM user_tokens WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
      { operation: 'Token.getByUserId', table: 'user_tokens' }
    );
  },

  /** 根据 token_hash 获取令牌 */
  async getByTokenHash(tokenHash: string): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM user_tokens WHERE token_hash = ?', [tokenHash], { operation: 'Token.getByTokenHash', table: 'user_tokens' });
  },

  /** 创建令牌 */
  async create(data: {
    user_id: number;
    name: string;
    token_hash: string;
    allowed_domains: string;
    allowed_services: string;
    start_time?: string | null;
    end_time?: string | null;
    max_role: number;
  }): Promise<number> {
    return insertInternal(
      'INSERT INTO user_tokens (user_id, name, token_hash, allowed_domains, allowed_services, start_time, end_time, max_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.user_id, data.name, data.token_hash, data.allowed_domains, data.allowed_services, data.start_time ?? null, data.end_time ?? null, data.max_role],
      { operation: 'Token.create', table: 'user_tokens' }
    );
  },

  /** 更新令牌状态 */
  async updateStatus(id: number, isActive: boolean): Promise<void> {
    return executeInternal(
      'UPDATE user_tokens SET is_active = ? WHERE id = ?',
      [isActive ? 1 : 0, id],
      { operation: 'Token.updateStatus', table: 'user_tokens' }
    );
  },

  /** 更新最后使用时间 */
  async updateLastUsed(id: number): Promise<void> {
    return executeInternal(
      'UPDATE user_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id],
      { operation: 'Token.updateLastUsed', table: 'user_tokens' }
    );
  },

  /** 删除令牌 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM user_tokens WHERE id = ?', [id], { operation: 'Token.delete', table: 'user_tokens' });
  },

  /** 删除指定用户的令牌 */
  async deleteByUser(tokenId: number, userId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM user_tokens WHERE id = ? AND user_id = ?',
      [tokenId, userId],
      { operation: 'Token.deleteByUser', table: 'user_tokens' }
    );
  },

  /** 切换令牌状态（带用户验证） */
  async toggleStatusByUser(tokenId: number, userId: number, isActive: boolean): Promise<void> {
    return executeInternal(
      `UPDATE user_tokens SET is_active = ? WHERE id = ? AND user_id = ?`,
      [isActive ? 1 : 0, tokenId, userId],
      { operation: 'Token.toggleStatusByUser', table: 'user_tokens' }
    );
  },
};

// ============================================================================
// 域名权限业务操作
// ============================================================================

export const DomainPermissionOperations = {
  /** 获取域名的所有权限规则 */
  async getByDomainId(domainId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM domain_permissions WHERE domain_id = ?',
      [domainId],
      { operation: 'DomainPermission.getByDomainId', table: 'domain_permissions' }
    );
  },

  /** 获取用户的域名权限 */
  async getByDomainAndUser(domainId: number, userId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT permission, sub FROM domain_permissions WHERE domain_id = ? AND user_id = ?',
      [domainId, userId],
      { operation: 'DomainPermission.getByDomainAndUser', table: 'domain_permissions' }
    );
  },

  /** 获取用户的团队域名权限 */
  async getByDomainAndTeamMember(domainId: number, userId: number): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT dp.permission, dp.sub
       FROM domain_permissions dp
       INNER JOIN team_members tm ON tm.team_id = dp.team_id
       WHERE dp.domain_id = ? AND tm.user_id = ?`,
      [domainId, userId],
      { operation: 'DomainPermission.getByDomainAndTeamMember', table: 'domain_permissions' }
    );
  },

  /** 检查域名是否有权限规则 */
  async hasRules(domainId: number): Promise<boolean> {
    const result = await getInternal<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM domain_permissions WHERE domain_id = ?',
      [domainId],
      { operation: 'DomainPermission.hasRules', table: 'domain_permissions' }
    );
    return (result?.cnt || 0) > 0;
  },

  /** 创建权限规则 */
  async create(data: {
    domain_id: number;
    user_id?: number | null;
    team_id?: number | null;
    permission: 'read' | 'write';
    sub?: string;
  }): Promise<number> {
    return insertInternal(
      'INSERT INTO domain_permissions (domain_id, user_id, team_id, permission, sub) VALUES (?, ?, ?, ?, ?)',
      [data.domain_id, data.user_id ?? null, data.team_id ?? null, data.permission, data.sub ?? null],
      { operation: 'DomainPermission.create', table: 'domain_permissions' }
    );
  },

  /** 删除权限规则 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM domain_permissions WHERE id = ?', [id], { operation: 'DomainPermission.delete', table: 'domain_permissions' });
  },

  /** 删除域名的所有权限 */
  async deleteByDomainId(domainId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM domain_permissions WHERE domain_id = ?',
      [domainId],
      { operation: 'DomainPermission.deleteByDomainId', table: 'domain_permissions' }
    );
  },

  /** 获取团队的域名权限列表 */
  async getByTeamId(teamId: number): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT dp.*, d.name as domain_name
       FROM domain_permissions dp
       INNER JOIN domains d ON d.id = dp.domain_id
       WHERE dp.team_id = ?
       ORDER BY d.name`,
      [teamId],
      { operation: 'DomainPermission.getByTeamId', table: 'domain_permissions' }
    );
  },

  /** 根据团队ID、域名ID和子域名获取权限 */
  async getByTeamDomainAndSub(teamId: number, domainId: number, sub: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id FROM domain_permissions WHERE team_id = ? AND domain_id = ? AND sub = ?',
      [teamId, domainId, sub],
      { operation: 'DomainPermission.getByTeamDomainAndSub', table: 'domain_permissions' }
    );
  },

  /** 更新权限 */
  async updatePermission(id: number, permission: 'read' | 'write'): Promise<void> {
    return executeInternal(
      'UPDATE domain_permissions SET permission = ? WHERE id = ?',
      [permission, id],
      { operation: 'DomainPermission.updatePermission', table: 'domain_permissions' }
    );
  },

  /** 删除团队权限 */
  async deleteByTeamAndId(id: number, teamId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM domain_permissions WHERE id = ? AND team_id = ?',
      [id, teamId],
      { operation: 'DomainPermission.deleteByTeamAndId', table: 'domain_permissions' }
    );
  },

  /** 获取用户的域名权限列表（带域名名称） */
  async getByUserIdWithDomainName(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT dp.*, d.name as domain_name
       FROM domain_permissions dp
       INNER JOIN domains d ON d.id = dp.domain_id
       WHERE dp.user_id = ?
       ORDER BY d.name`,
      [userId],
      { operation: 'DomainPermission.getByUserIdWithDomainName', table: 'domain_permissions' }
    );
  },

  /** 根据用户ID、域名ID和子域名获取权限 */
  async getByUserDomainAndSub(userId: number, domainId: number, sub: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id FROM domain_permissions WHERE user_id = ? AND domain_id = ? AND sub = ?',
      [userId, domainId, sub],
      { operation: 'DomainPermission.getByUserDomainAndSub', table: 'domain_permissions' }
    );
  },

  /** 删除用户权限 */
  async deleteByUserAndId(id: number, userId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM domain_permissions WHERE id = ? AND user_id = ?',
      [id, userId],
      { operation: 'DomainPermission.deleteByUserAndId', table: 'domain_permissions' }
    );
  },
};

// ============================================================================
// DNS 记录业务操作
// ============================================================================

export const RecordOperations = {
  /** 根据 ID 获取记录 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM records WHERE id = ?', [id], { operation: 'Record.getById', table: 'records' });
  },

  /** 获取域名的所有记录 */
  async getByDomainId(domainId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM records WHERE domain_id = ? ORDER BY id',
      [domainId],
      { operation: 'Record.getByDomainId', table: 'records' }
    );
  },

  /** 创建记录 */
  async create(data: {
    domain_id: number;
    name: string;
    type: string;
    content: string;
    ttl?: number;
    priority?: number;
    third_id?: string;
  }): Promise<number> {
    return insertInternal(
      'INSERT INTO records (domain_id, name, type, content, ttl, priority, third_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.domain_id, data.name, data.type, data.content, data.ttl ?? 3600, data.priority ?? 0, data.third_id ?? null],
      { operation: 'Record.create', table: 'records' }
    );
  },

  /** 更新记录 */
  async update(id: number, updates: Record<string, unknown>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);

    return executeInternal(
      `UPDATE records SET ${setClause} WHERE id = ?`,
      [...values, id],
      { operation: 'Record.update', table: 'records' }
    );
  },

  /** 删除记录 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM records WHERE id = ?', [id], { operation: 'Record.delete', table: 'records' });
  },

  /** 删除域名的所有记录 */
  async deleteByDomainId(domainId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM records WHERE domain_id = ?',
      [domainId],
      { operation: 'Record.deleteByDomainId', table: 'records' }
    );
  },
};

// ============================================================================
// 邮件模板业务操作
// ============================================================================

export const EmailTemplateOperations = {
  /** 获取所有模板 */
  async getAll(): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM email_templates ORDER BY id',
      [],
      { operation: 'EmailTemplate.getAll', table: 'email_templates' }
    );
  },

  /** 根据 ID 获取模板 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM email_templates WHERE id = ?', [id], { operation: 'EmailTemplate.getById', table: 'email_templates' });
  },

  /** 根据类型获取模板 */
  async getByType(type: string): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM email_templates WHERE type = ?', [type], { operation: 'EmailTemplate.getByType', table: 'email_templates' });
  },

  /** 创建模板 */
  async create(data: { type: string; subject: string; body: string }): Promise<number> {
    return insertInternal(
      'INSERT INTO email_templates (type, subject, body) VALUES (?, ?, ?)',
      [data.type, data.subject, data.body],
      { operation: 'EmailTemplate.create', table: 'email_templates' }
    );
  },

  /** 更新模板 */
  async update(id: number, updates: { subject?: string; body?: string }): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);

    return executeInternal(
      `UPDATE email_templates SET ${setClause} WHERE id = ?`,
      [...values, id],
      { operation: 'EmailTemplate.update', table: 'email_templates' }
    );
  },

  /** 删除模板 */
  async delete(id: number): Promise<void> {
    return executeInternal('DELETE FROM email_templates WHERE id = ?', [id], { operation: 'EmailTemplate.delete', table: 'email_templates' });
  },
};

// ============================================================================
// 事务支持
// ============================================================================

/** 在事务中执行函数 */
export async function withTransaction<T>(fn: (trx: TransactionOperations) => Promise<T>): Promise<T> {
  log.info('BusinessAdapter', 'Starting transaction block');
  const startTime = Date.now();
  
  try {
    const result = await transaction(async (trx: {
      query: <U>(sql: string, params?: unknown[]) => Promise<U[]>;
      get: <U>(sql: string, params?: unknown[]) => Promise<U | undefined>;
      execute: (sql: string, params?: unknown[]) => Promise<void>;
      insert: (sql: string, params?: unknown[]) => Promise<number>;
      run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
    }) => {
      const trxOps = new TransactionOperations(trx);
      return fn(trxOps);
    });
    
    const duration = Date.now() - startTime;
    log.info('BusinessAdapter', `Transaction block completed`, { duration: `${duration}ms` });
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('BusinessAdapter', 'Transaction block failed', { error, duration: `${duration}ms` });
    throw error;
  }
}

/** 事务操作类 */
export class TransactionOperations {
  private trx: {
    query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
    get: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>;
    execute: (sql: string, params?: unknown[]) => Promise<void>;
    insert: (sql: string, params?: unknown[]) => Promise<number>;
    run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
  };

  constructor(trx: TransactionOperations['trx']) {
    this.trx = trx;
  }

  async query<T = QueryResult>(sql: string, params?: unknown[]): Promise<T[]> {
    const processedSql = processSql(sql, db.type);
    log.debug('BusinessAdapter', '[Transaction] Executing query', { sql: processedSql });
    return this.trx.query<T>(processedSql, params);
  }

  async get<T = QueryResult>(sql: string, params?: unknown[]): Promise<T | undefined> {
    const processedSql = processSql(sql, db.type);
    log.debug('BusinessAdapter', '[Transaction] Executing get', { sql: processedSql });
    return this.trx.get<T>(processedSql, params);
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const processedSql = processSql(sql, db.type);
    log.debug('BusinessAdapter', '[Transaction] Executing execute', { sql: processedSql });
    return this.trx.execute(processedSql, params);
  }

  async insert(sql: string, params?: unknown[]): Promise<number> {
    const processedSql = processSql(sql, db.type);
    log.debug('BusinessAdapter', '[Transaction] Executing insert', { sql: processedSql });
    return this.trx.insert(processedSql, params);
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    const processedSql = processSql(sql, db.type);
    log.debug('BusinessAdapter', '[Transaction] Executing run', { sql: processedSql });
    return this.trx.run(processedSql, params);
  }
}

// ============================================================================
// 系统信息业务操作
// ============================================================================

export const SystemOperations = {
  /** 获取数据库信息（版本、驱动等） */
  async getDatabaseInfo(): Promise<{ type: string; version: string; driverVersion: string }> {
    const conn = getConnection();

    let dbInfo = {
      type: conn.type,
      version: 'unknown',
      driverVersion: 'unknown',
    };

    if (conn.type === 'sqlite') {
      // Get SQLite version
      const result = await conn.get('SELECT sqlite_version() as version');
      dbInfo.version = (result as { version: string })?.version || 'unknown';
      dbInfo.driverVersion = require('better-sqlite3/package.json').version;
    } else if (conn.type === 'mysql') {
      // Get MySQL version
      const result = await conn.get('SELECT VERSION() as version');
      dbInfo.version = (result as { version: string })?.version || 'unknown';
      dbInfo.driverVersion = require('mysql2/package.json').version;
    } else if (conn.type === 'postgresql') {
      // Get PostgreSQL version
      const result = await conn.get('SELECT version() as version');
      const fullVersion = (result as { version: string })?.version || 'unknown';
      // Extract version number from string like "PostgreSQL 15.2 on ..."
      const match = fullVersion.match(/PostgreSQL\s+(\d+\.?\d*)/);
      dbInfo.version = match ? match[1] : fullVersion;
      dbInfo.driverVersion = require('pg/package.json').version;
    }

    return dbInfo;
  },

  /** 
   * 测试 SQLite 数据库连接并检查是否有现有数据
   * 注意：此方法使用直接连接进行初始化测试，不是标准业务查询
   */
  async testSqliteConnection(sqlitePath: string): Promise<{ success: boolean; message: string; hasExistingData: boolean; hasUsers?: boolean }> {
    const Database = require('better-sqlite3');
    const fs = require('fs');
    const path = require('path');
    
    const dir = path.dirname(sqlitePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const testDb = new Database(sqlitePath);
    
    // Check if tables exist
    let hasData = false;
    let hasUsers = false;
    try {
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
      if (tables.length > 0) {
        hasData = true;
        // Check if users table exists and has data
        const usersTable = tables.find(t => t.name === 'users');
        if (usersTable) {
          const userCount = testDb.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
          hasUsers = userCount?.cnt > 0;
        }
      }
    } catch {
      // No tables yet
    }
    
    testDb.close();
    return { success: true, message: 'SQLite connection successful', hasExistingData: hasData, hasUsers };
  },

  /** 
   * 测试 MySQL 数据库连接并检查是否有现有数据
   * 注意：此方法使用直接连接进行初始化测试，不是标准业务查询
   */
  async testMysqlConnection(config: { host: string; port: number; user: string; password: string; database: string; ssl?: boolean }): Promise<{ success: boolean; message: string; hasExistingData: boolean; hasUsers?: boolean }> {
    const mysql = require('mysql2/promise');
    
    const pool = mysql.createPool({
      host: config.host,
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 1,
    });

    // Verify the connection is actually reachable before proceeding
    const conn = await pool.getConnection();
    conn.release();

    // Check if there's any data
    let hasData = false;
    let hasUsers = false;
    try {
      const [tables] = await pool.execute('SHOW TABLES') as [any[], any];
      if (tables && tables.length > 0) {
        hasData = true;
        // Check if users table exists and has data
        const usersTableExists = tables.some(t => Object.values(t)[0] === 'users');
        if (usersTableExists) {
          const [userCountResult] = await pool.execute('SELECT COUNT(*) as cnt FROM users') as [any[], any];
          hasUsers = userCountResult[0]?.cnt > 0;
        }
      }
    } catch {
      // No tables yet
    }
    
    await pool.end();
    return { success: true, message: 'MySQL connection successful', hasExistingData: hasData, hasUsers };
  },

  /** 
   * 测试 PostgreSQL 数据库连接并检查是否有现有数据
   * 注意：此方法使用直接连接进行初始化测试，不是标准业务查询
   */
  async testPostgresqlConnection(config: { host: string; port: number; user: string; password: string; database: string; ssl?: boolean }): Promise<{ success: boolean; message: string; hasExistingData: boolean; hasUsers?: boolean }> {
    const { Pool } = require('pg');
    
    const pool = new Pool({
      host: config.host,
      port: config.port || 5432,
      user: config.user,
      password: config.password,
      database: config.database,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      max: 1,
    });

    // Verify the connection is actually reachable before proceeding
    const client = await pool.connect();
    client.release();

    // Check if there's any data
    let hasData = false;
    let hasUsers = false;
    try {
      const tablesResult = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);
      const tables = tablesResult.rows as { table_name: string }[];
      if (tables && tables.length > 0) {
        hasData = true;
        // Check if users table exists and has data
        const usersTableExists = tables.some(t => t.table_name === 'users');
        if (usersTableExists) {
          const userCountResult = await pool.query('SELECT COUNT(*) as cnt FROM users');
          hasUsers = userCountResult.rows[0]?.cnt > 0;
        }
      }
    } catch {
      // No tables yet
    }
    
    await pool.end();
    return { success: true, message: 'PostgreSQL connection successful', hasExistingData: hasData, hasUsers };
  },

  /**
   * 统一测试数据库连接（根据类型自动选择）
   * 注意：此方法使用直接连接进行初始化测试，不是标准业务查询
   */
  async testConnection(config: { 
    type: 'sqlite' | 'mysql' | 'postgresql'; 
    sqlite?: { path: string }; 
    mysql?: { host: string; port: number; user: string; password: string; database: string; ssl?: boolean }; 
    postgresql?: { host: string; port: number; user: string; password: string; database: string; ssl?: boolean } 
  }): Promise<{ success: boolean; message: string; hasExistingData: boolean; hasUsers?: boolean }> {
    if (config.type === 'sqlite') {
      return this.testSqliteConnection(config.sqlite?.path || './data/dnsmgr.db');
    } else if (config.type === 'mysql') {
      if (!config.mysql) throw new Error('MySQL configuration required');
      return this.testMysqlConnection(config.mysql);
    } else if (config.type === 'postgresql') {
      if (!config.postgresql) throw new Error('PostgreSQL configuration required');
      return this.testPostgresqlConnection(config.postgresql);
    }
    throw new Error(`Unsupported database type: ${config.type}`);
  },
};

// ============================================================================
// 运行时密钥业务操作
// ============================================================================

export const SecretOperations = {
  /** 获取运行时密钥 */
  async getRuntimeSecret(key: string): Promise<string | undefined> {
    const dbType = getDbType();
    const sql = dbType === 'mysql'
      ? 'SELECT `value` FROM runtime_secrets WHERE `key` = ?'
      : dbType === 'postgresql'
        ? 'SELECT "value" FROM runtime_secrets WHERE "key" = $1'
        : 'SELECT `value` FROM runtime_secrets WHERE `key` = ?';
    const params = dbType === 'postgresql' ? [key] : [key];
    const row = await getInternal<{ value: string }>(
      sql,
      params,
      { operation: 'Secret.getRuntimeSecret', table: 'runtime_secrets' }
    );
    return row?.value;
  },

  /** 确保运行时密钥表存在 */
  async ensureRuntimeSecretsTable(): Promise<void> {
    const dbType = getDbType();
    const sql = dbType === 'mysql'
      ? `CREATE TABLE IF NOT EXISTS runtime_secrets (
        \`key\` VARCHAR(255) PRIMARY KEY,
        \`value\` TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
      : dbType === 'postgresql'
        ? `CREATE TABLE IF NOT EXISTS runtime_secrets (
        "key" VARCHAR(255) PRIMARY KEY,
        "value" TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
        : `CREATE TABLE IF NOT EXISTS runtime_secrets (
        \`key\` VARCHAR(255) PRIMARY KEY,
        \`value\` TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`;
    return executeInternal(
      sql,
      [],
      { operation: 'Secret.ensureRuntimeSecretsTable', table: 'runtime_secrets' }
    );
  },

  /** 设置运行时密钥 */
  async setRuntimeSecret(key: string, value: string): Promise<void> {
    const dbType = getDbType();
    let sql: string;
    let params: unknown[];

    if (dbType === 'mysql') {
      // MySQL: 使用 INSERT ... ON DUPLICATE KEY UPDATE
      sql = 'INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)';
      params = [key, value];
    } else if (dbType === 'postgresql') {
      // PostgreSQL: 使用 INSERT ... ON CONFLICT
      sql = 'INSERT INTO runtime_secrets ("key", "value") VALUES ($1, $2) ON CONFLICT("key") DO UPDATE SET "value" = EXCLUDED."value"';
      params = [key, value];
    } else {
      // SQLite: 使用 INSERT ... ON CONFLICT
      sql = 'INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?) ON CONFLICT(`key`) DO UPDATE SET `value` = excluded.`value`';
      params = [key, value];
    }

    return executeInternal(
      sql,
      params,
      { operation: 'Secret.setRuntimeSecret', table: 'runtime_secrets' }
    );
  },

  /** 轮换运行时密钥 */
  async rotateRuntimeSecrets(): Promise<void> {
    try {
      const jwtRuntimeSecret = crypto.randomBytes(32).toString('hex');
      const dbType = getDbType();

      if (dbType === 'sqlite') {
        // SQLite: 使用 executeInternal 执行 SQL
        await executeInternal('DELETE FROM runtime_secrets', [], { operation: 'Secret.rotate.delete', table: 'runtime_secrets' });
        await executeInternal(
          'INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?)',
          ['jwt_runtime', jwtRuntimeSecret],
          { operation: 'Secret.rotate.insert', table: 'runtime_secrets' }
        );
      } else if (dbType === 'mysql') {
        // MySQL: 使用 executeInternal 执行 SQL
        await executeInternal('DELETE FROM runtime_secrets', [], { operation: 'Secret.rotate.delete', table: 'runtime_secrets' });
        await executeInternal(
          'INSERT INTO runtime_secrets (`key`, `value`) VALUES (?, ?)',
          ['jwt_runtime', jwtRuntimeSecret],
          { operation: 'Secret.rotate.insert', table: 'runtime_secrets' }
        );
      } else {
        // PostgreSQL: 使用 executeInternal 执行 SQL
        await executeInternal('DELETE FROM runtime_secrets', [], { operation: 'Secret.rotate.delete', table: 'runtime_secrets' });
        await executeInternal(
          'INSERT INTO runtime_secrets ("key", "value") VALUES ($1, $2)',
          ['jwt_runtime', jwtRuntimeSecret],
          { operation: 'Secret.rotate.insert', table: 'runtime_secrets' }
        );
      }

      log.info('Secret', 'Runtime secrets rotated');
    } catch (error) {
      log.error('Secret', 'Error rotating runtime secrets', { error });
      throw error;
    }
  },
};

// ============================================================================
// 安全策略业务操作
// ============================================================================

export const SecurityPolicyOperations = {
  /** 获取当前安全策略 */
  async getPolicy(): Promise<QueryResult | undefined> {
    return getInternal(
      `SELECT id, require_2fa_global as require2FAGlobal, min_password_length as minPasswordLength,
        min_password_strength as minPasswordStrength, session_timeout_hours as sessionTimeoutHours,
        max_login_attempts as maxLoginAttempts, lockout_duration_minutes as lockoutDurationMinutes,
        allow_remember_device as allowRememberDevice, trusted_device_days as trustedDeviceDays,
        require_password_change_on_first_login as requirePasswordChangeOnFirstLogin,
        created_at, updated_at
      FROM security_policies LIMIT 1`,
      [],
      { operation: 'SecurityPolicy.getPolicy', table: 'security_policies' }
    );
  },

  /** 更新安全策略 */
  async updatePolicy(updates: Record<string, unknown>, policyId: number): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);
    return executeInternal(
      `UPDATE security_policies SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, policyId],
      { operation: 'SecurityPolicy.updatePolicy', table: 'security_policies' }
    );
  },

  /** 初始化默认安全策略 */
  async initPolicy(values: unknown[]): Promise<void> {
    return executeInternal(
      `INSERT INTO security_policies (
        require_2fa_global, min_password_length, min_password_strength,
        session_timeout_hours, max_login_attempts, lockout_duration_minutes,
        allow_remember_device, trusted_device_days, require_password_change_on_first_login
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      values,
      { operation: 'SecurityPolicy.initPolicy', table: 'security_policies' }
    );
  },

  /** 检查策略是否存在 */
  async exists(): Promise<boolean> {
    const result = await getInternal<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM security_policies',
      [],
      { operation: 'SecurityPolicy.exists', table: 'security_policies' }
    );
    return (result?.cnt || 0) > 0;
  },

  /** 获取用户安全设置 */
  async getUserSecuritySetting(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT require_2fa FROM user_security_settings WHERE user_id = ?',
      [userId],
      { operation: 'SecurityPolicy.getUserSecuritySetting', table: 'user_security_settings' }
    );
  },

  /** 检查用户是否有 2FA */
  async has2FA(userId: number): Promise<boolean> {
    const totp = await getInternal<{ id: number }>(
      'SELECT id FROM user_totp WHERE user_id = ?',
      [userId],
      { operation: 'SecurityPolicy.has2FA.totp', table: 'user_totp' }
    );
    const webauthn = await getInternal<{ id: number }>(
      'SELECT id FROM user_webauthn_credentials WHERE user_id = ? LIMIT 1',
      [userId],
      { operation: 'SecurityPolicy.has2FA.webauthn', table: 'user_webauthn_credentials' }
    );
    return !!(totp || webauthn);
  },

  /** 更新用户 2FA 要求设置 */
  async updateUser2FARequirement(userId: number, require2FA: boolean): Promise<void> {
    const existing = await getInternal<{ id: number }>(
      'SELECT id FROM user_security_settings WHERE user_id = ?',
      [userId],
      { operation: 'SecurityPolicy.updateUser2FARequirement.check', table: 'user_security_settings' }
    );
    if (existing) {
      return executeInternal(
        'UPDATE user_security_settings SET require_2fa = ? WHERE user_id = ?',
        [require2FA ? 1 : 0, userId],
        { operation: 'SecurityPolicy.updateUser2FARequirement.update', table: 'user_security_settings' }
      );
    } else {
      return executeInternal(
        'INSERT INTO user_security_settings (user_id, require_2fa) VALUES (?, ?)',
        [userId, require2FA ? 1 : 0],
        { operation: 'SecurityPolicy.updateUser2FARequirement.insert', table: 'user_security_settings' }
      );
    }
  },
};

// ============================================================================
// 受信任设备业务操作
// ============================================================================

export const TrustedDeviceOperations = {
  /** 添加受信任设备 */
  async add(deviceId: string, userId: number, deviceName: string, fingerprint: string, userAgent: string, ipAddress: string, expiresAt: string): Promise<void> {
    return executeInternal(
      `INSERT INTO trusted_devices (id, user_id, device_name, device_fingerprint, user_agent, ip_address, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [deviceId, userId, deviceName, fingerprint, userAgent, ipAddress, expiresAt],
      { operation: 'TrustedDevice.add', table: 'trusted_devices' }
    );
  },

  /** 根据指纹获取设备 */
  async getByFingerprint(userId: number, fingerprint: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id, expires_at FROM trusted_devices WHERE user_id = ? AND device_fingerprint = ?',
      [userId, fingerprint],
      { operation: 'TrustedDevice.getByFingerprint', table: 'trusted_devices' }
    );
  },

  /** 更新最后使用时间 */
  async updateLastUsed(deviceId: string): Promise<void> {
    return executeInternal(
      'UPDATE trusted_devices SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
      [deviceId],
      { operation: 'TrustedDevice.updateLastUsed', table: 'trusted_devices' }
    );
  },

  /** 删除设备 */
  async delete(deviceId: string): Promise<void> {
    return executeInternal(
      'DELETE FROM trusted_devices WHERE id = ?',
      [deviceId],
      { operation: 'TrustedDevice.delete', table: 'trusted_devices' }
    );
  },

  /** 删除用户的所有设备 */
  async deleteByUser(userId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM trusted_devices WHERE user_id = ?',
      [userId],
      { operation: 'TrustedDevice.deleteByUser', table: 'trusted_devices' }
    );
  },

  /** 获取用户的所有设备 */
  async getByUser(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT id, user_id as userId, device_name as deviceName, device_fingerprint as deviceFingerprint,
        user_agent as userAgent, ip_address as ipAddress, last_used_at as lastUsedAt,
        expires_at as expiresAt, created_at as createdAt
      FROM trusted_devices WHERE user_id = ? ORDER BY last_used_at DESC`,
      [userId],
      { operation: 'TrustedDevice.getByUser', table: 'trusted_devices' }
    );
  },

  /** 删除过期设备 */
  async cleanupExpired(): Promise<number> {
    const result = await runInternal(
      'DELETE FROM trusted_devices WHERE expires_at < CURRENT_TIMESTAMP',
      [],
      { operation: 'TrustedDevice.cleanupExpired', table: 'trusted_devices' }
    );
    return result.changes || 0;
  },

  /** 删除指定用户的设备 */
  async deleteByUserAndId(userId: number, deviceId: string): Promise<number> {
    const result = await runInternal(
      'DELETE FROM trusted_devices WHERE id = ? AND user_id = ?',
      [deviceId, userId],
      { operation: 'TrustedDevice.deleteByUserAndId', table: 'trusted_devices' }
    );
    return result.changes || 0;
  },
};

// ============================================================================
// 用户偏好设置业务操作
// ============================================================================

export const UserPreferencesOperations = {
  /** 获取用户偏好设置 */
  async get(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT user_id, theme, language, notifications_enabled, email_notifications, background_image FROM user_preferences WHERE user_id = ?',
      [userId],
      { operation: 'UserPreferences.get', table: 'user_preferences' }
    );
  },

  /** 更新用户偏好设置 (SQLite) */
  async upsertSQLite(userId: number, theme: string, language: string, notificationsEnabled: number, emailNotifications: number, backgroundImage: string | null): Promise<void> {
    return executeInternal(
      `INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications, background_image, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
        theme = excluded.theme, language = excluded.language,
        notifications_enabled = excluded.notifications_enabled, email_notifications = excluded.email_notifications,
        background_image = excluded.background_image, updated_at = datetime('now')`,
      [userId, theme, language, notificationsEnabled, emailNotifications, backgroundImage],
      { operation: 'UserPreferences.upsertSQLite', table: 'user_preferences' }
    );
  },

  /** 更新用户偏好设置 (MySQL) */
  async upsertMySQL(userId: number, theme: string, language: string, notificationsEnabled: number, emailNotifications: number, backgroundImage: string | null): Promise<void> {
    return executeInternal(
      `INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications, background_image)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        theme = VALUES(theme), language = VALUES(language),
        notifications_enabled = VALUES(notifications_enabled), email_notifications = VALUES(email_notifications),
        background_image = VALUES(background_image)`,
      [userId, theme, language, notificationsEnabled, emailNotifications, backgroundImage],
      { operation: 'UserPreferences.upsertMySQL', table: 'user_preferences' }
    );
  },

  /** 更新用户偏好设置 (PostgreSQL) */
  async upsertPostgreSQL(userId: number, theme: string, language: string, notificationsEnabled: number, emailNotifications: number, backgroundImage: string | null): Promise<void> {
    return executeInternal(
      `INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications, background_image)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(user_id) DO UPDATE SET
        theme = EXCLUDED.theme, language = EXCLUDED.language,
        notifications_enabled = EXCLUDED.notifications_enabled, email_notifications = EXCLUDED.email_notifications,
        background_image = EXCLUDED.background_image`,
      [userId, theme, language, notificationsEnabled, emailNotifications, backgroundImage],
      { operation: 'UserPreferences.upsertPostgreSQL', table: 'user_preferences' }
    );
  },
};

// ============================================================================
// 会话管理业务操作
// ============================================================================

export const SessionOperations = {
  /** 创建会话 */
  async create(sessionId: string, userId: number, token: string, ipAddress: string, userAgent: string, expiresAt: string): Promise<void> {
    return executeInternal(
      `INSERT INTO user_sessions (id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ${now()}, ${now()}, ?)`,
      [sessionId, userId, token, ipAddress, userAgent, expiresAt],
      { operation: 'Session.create', table: 'user_sessions' }
    );
  },

  /** 获取用户的活跃会话 */
  async getActiveByUser(userId: number, nowTime: string): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at
      FROM user_sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_activity_at DESC`,
      [userId, nowTime],
      { operation: 'Session.getActiveByUser', table: 'user_sessions' }
    );
  },

  /** 更新会话活动时间 */
  async updateActivity(sessionId: string): Promise<void> {
    return executeInternal(
      `UPDATE user_sessions SET last_activity_at = ${now()} WHERE id = ?`,
      [sessionId],
      { operation: 'Session.updateActivity', table: 'user_sessions' }
    );
  },

  /** 删除会话 */
  async delete(sessionId: string): Promise<void> {
    return executeInternal(
      'DELETE FROM user_sessions WHERE id = ?',
      [sessionId],
      { operation: 'Session.delete', table: 'user_sessions' }
    );
  },

  /** 删除用户的其他会话 */
  async deleteOthers(userId: number, currentSessionId: string): Promise<void> {
    return executeInternal(
      'DELETE FROM user_sessions WHERE user_id = ? AND id != ?',
      [userId, currentSessionId],
      { operation: 'Session.deleteOthers', table: 'user_sessions' }
    );
  },

  /** 删除用户的所有会话 */
  async deleteByUser(userId: number): Promise<void> {
    return executeInternal(
      'DELETE FROM user_sessions WHERE user_id = ?',
      [userId],
      { operation: 'Session.deleteByUser', table: 'user_sessions' }
    );
  },

  /** 清理过期会话 */
  async cleanupExpired(nowTime: string): Promise<void> {
    return executeInternal(
      'DELETE FROM user_sessions WHERE expires_at < ?',
      [nowTime],
      { operation: 'Session.cleanupExpired', table: 'user_sessions' }
    );
  },

  /** 根据 token 获取会话 */
  async getByToken(token: string, nowTime: string): Promise<QueryResult | undefined> {
    return getInternal(
      `SELECT id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at
      FROM user_sessions WHERE token = ? AND expires_at > ? LIMIT 1`,
      [token, nowTime],
      { operation: 'Session.getByToken', table: 'user_sessions' }
    );
  },
};

// ============================================================================
// 登录限制业务操作
// ============================================================================

export const LoginLimitOperations = {
  /** 获取登录限制配置 */
  async getConfig(): Promise<QueryResult | undefined> {
    return getInternal(
      "SELECT value FROM system_settings WHERE key = 'login_limit_config'",
      [],
      { operation: 'LoginLimit.getConfig', table: 'system_settings' }
    );
  },

  /** 更新登录限制配置 */
  async updateConfig(configJson: string): Promise<void> {
    const { sql, params } = buildUpsertSql(
      'system_settings',
      ['key', 'value'],
      ['login_limit_config', configJson],
      'key',
      ['value']
    );
    return executeInternal(sql, params, { operation: 'LoginLimit.updateConfig', table: 'system_settings' });
  },

  /** 获取登录尝试记录 */
  async getAttempt(identifier: string): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM login_attempts WHERE identifier = ? ORDER BY created_at DESC LIMIT 1',
      [identifier.toLowerCase()],
      { operation: 'LoginLimit.getAttempt', table: 'login_attempts' }
    );
  },

  /** 更新登录尝试记录 */
  async updateAttempt(id: number, count: number, lockedUntil: string | null): Promise<void> {
    return executeInternal(
      `UPDATE login_attempts SET attempt_count = ?, last_attempt_at = ${now()}, locked_until = ? WHERE id = ?`,
      [count, lockedUntil, id],
      { operation: 'LoginLimit.updateAttempt', table: 'login_attempts' }
    );
  },

  /** 创建登录尝试记录 */
  async createAttempt(identifier: string, ipAddress: string): Promise<void> {
    return executeInternal(
      `INSERT INTO login_attempts (identifier, ip_address, attempt_count, last_attempt_at) VALUES (?, ?, 1, ${now()})`,
      [identifier.toLowerCase(), ipAddress],
      { operation: 'LoginLimit.createAttempt', table: 'login_attempts' }
    );
  },

  /** 清除登录尝试记录 */
  async clearAttempts(identifier: string): Promise<void> {
    return executeInternal(
      'DELETE FROM login_attempts WHERE identifier = ?',
      [identifier.toLowerCase()],
      { operation: 'LoginLimit.clearAttempts', table: 'login_attempts' }
    );
  },

  /** 获取锁定账户数量 */
  async getLockedCount(nowExpr: string): Promise<number> {
    const result = await getInternal<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM login_attempts WHERE locked_until > ${nowExpr}`,
      [],
      { operation: 'LoginLimit.getLockedCount', table: 'login_attempts' }
    );
    return result?.cnt || 0;
  },

  /** 获取最近尝试数量 */
  async getRecentCount(yesterdayExpr: string): Promise<number> {
    const result = await getInternal<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM login_attempts WHERE last_attempt_at > ${yesterdayExpr}`,
      [],
      { operation: 'LoginLimit.getRecentCount', table: 'login_attempts' }
    );
    return result?.cnt || 0;
  },

  /** 获取尝试次数最多的标识符 */
  async getTopIdentifiers(): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT identifier, attempt_count as attempts FROM login_attempts ORDER BY attempt_count DESC LIMIT 10',
      [],
      { operation: 'LoginLimit.getTopIdentifiers', table: 'login_attempts' }
    );
  },
};

// ============================================================================
// 容灾配置业务操作
// ============================================================================

export const FailoverOperations = {
  /** 获取所有启用的容灾配置 */
  async getAllEnabled(): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM failover_configs WHERE enabled = 1',
      [],
      { operation: 'Failover.getAllEnabled', table: 'failover_configs' }
    );
  },

  /** 根据域名ID获取容灾配置 */
  async getByDomain(domainId: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM failover_configs WHERE domain_id = ?',
      [domainId],
      { operation: 'Failover.getByDomain', table: 'failover_configs' }
    );
  },

  /** 根据ID获取容灾配置 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM failover_configs WHERE id = ?',
      [id],
      { operation: 'Failover.getById', table: 'failover_configs' }
    );
  },

  /** 创建容灾配置 */
  async create(data: Record<string, unknown>): Promise<number> {
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?').join(', ');
    return insertInternal(
      `INSERT INTO failover_configs (${fields.join(', ')}) VALUES (${placeholders})`,
      Object.values(data),
      { operation: 'Failover.create', table: 'failover_configs' }
    );
  },

  /** 更新容灾配置 */
  async update(id: number, updates: Record<string, unknown>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);
    return executeInternal(
      `UPDATE failover_configs SET ${setClause} WHERE id = ?`,
      [...values, id],
      { operation: 'Failover.update', table: 'failover_configs' }
    );
  },

  /** 删除容灾配置 */
  async delete(id: number): Promise<void> {
    return executeInternal(
      'DELETE FROM failover_configs WHERE id = ?',
      [id],
      { operation: 'Failover.delete', table: 'failover_configs' }
    );
  },

  /** 获取容灾状态 */
  async getStatus(configId: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM failover_status WHERE config_id = ?',
      [configId],
      { operation: 'Failover.getStatus', table: 'failover_status' }
    );
  },

  /** 更新容灾状态 */
  async updateStatus(configId: number, updates: Record<string, unknown>): Promise<void> {
    const fields = Object.keys(updates);
    if (fields.length === 0) return;
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = Object.values(updates);
    return executeInternal(
      `UPDATE failover_status SET ${setClause} WHERE config_id = ?`,
      [...values, configId],
      { operation: 'Failover.updateStatus', table: 'failover_status' }
    );
  },

  /** 初始化容灾状态 */
  async initStatus(configId: number, primaryIp: string): Promise<void> {
    return executeInternal(
      `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, fail_count, switch_count)
       VALUES (?, ?, 1, ${now()}, 1, 0, 0)`,
      [configId, primaryIp],
      { operation: 'Failover.initStatus', table: 'failover_status' }
    );
  },

  /** 更新检查状态 (SQLite) */
  async updateCheckStatusSQLite(configId: number, currentIp: string, isPrimary: number, isHealthy: number): Promise<void> {
    return executeInternal(
      `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, switch_count)
       VALUES (?, ?, ?, datetime('now'), ?, 0)
       ON CONFLICT(config_id) DO UPDATE SET
        last_check_time = datetime('now'), last_check_result = excluded.last_check_result`,
      [configId, currentIp, isPrimary, isHealthy],
      { operation: 'Failover.updateCheckStatusSQLite', table: 'failover_status' }
    );
  },

  /** 更新检查状态 (MySQL) */
  async updateCheckStatusMySQL(configId: number, currentIp: string, isPrimary: number, isHealthy: number): Promise<void> {
    return executeInternal(
      `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, switch_count)
       VALUES (?, ?, ?, NOW(), ?, 0)
       ON DUPLICATE KEY UPDATE
       last_check_time = NOW(), last_check_result = VALUES(last_check_result)`,
      [configId, currentIp, isPrimary, isHealthy],
      { operation: 'Failover.updateCheckStatusMySQL', table: 'failover_status' }
    );
  },

  /** 更新检查状态 (PostgreSQL) */
  async updateCheckStatusPostgreSQL(configId: number, currentIp: string, isPrimary: number, isHealthy: number): Promise<void> {
    return executeInternal(
      `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, switch_count)
       VALUES ($1, $2, $3, NOW(), $4, 0)
       ON CONFLICT(config_id) DO UPDATE SET
       last_check_time = NOW(), last_check_result = EXCLUDED.last_check_result`,
      [configId, currentIp, isPrimary, isHealthy],
      { operation: 'Failover.updateCheckStatusPostgreSQL', table: 'failover_status' }
    );
  },
};

// ============================================================================
// 审计日志导出业务操作
// ============================================================================

export const AuditExportOperations = {
  /** 获取审计日志总数 */
  async getCount(where: string, params: unknown[]): Promise<number> {
    const result = await getInternal<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM operation_logs l WHERE ${where}`,
      params,
      { operation: 'AuditExport.getCount', table: 'operation_logs' }
    );
    return result?.cnt || 0;
  },

  /** 获取审计日志列表 */
  async getLogs(where: string, params: unknown[], pageSize: number, offset: number): Promise<QueryResult[]> {
    const dbType = getDbType();
    const listSql = dbType === 'postgresql'
      ? `SELECT l.*, u.username, u.nickname FROM operation_logs l
         LEFT JOIN users u ON u.id = l.user_id WHERE ${where} ORDER BY l.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      : `SELECT l.*, u.username, u.nickname FROM operation_logs l
         LEFT JOIN users u ON u.id = l.user_id WHERE ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`;
    const finalSql = dbType === 'mysql'
      ? listSql.replace('LIMIT ? OFFSET ?', `LIMIT ${pageSize} OFFSET ${offset}`)
      : listSql;
    const finalParams = dbType === 'mysql' ? params : [...params, pageSize, offset];
    return queryInternal(finalSql, finalParams, { operation: 'AuditExport.getLogs', table: 'operation_logs' });
  },

  /** 检测异常 - 删除操作 */
  async getDeleteCount(userId: number, timeWindow: string): Promise<number> {
    const result = await getInternal<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM operation_logs WHERE user_id = ? AND action LIKE \'%delete%\' AND created_at > ?',
      [userId, timeWindow],
      { operation: 'AuditExport.getDeleteCount', table: 'operation_logs' }
    );
    return result?.cnt || 0;
  },

  /** 检测异常 - 创建操作 */
  async getCreateCount(userId: number, timeWindow: string): Promise<number> {
    const result = await getInternal<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM operation_logs WHERE user_id = ? AND action LIKE \'%create%\' AND created_at > ?',
      [userId, timeWindow],
      { operation: 'AuditExport.getCreateCount', table: 'operation_logs' }
    );
    return result?.cnt || 0;
  },

  /** 检测异常 - 域名数量 */
  async getDomainCount(userId: number, timeWindow: string): Promise<number> {
    const result = await getInternal<{ cnt: number }>(
      'SELECT COUNT(DISTINCT domain) as cnt FROM operation_logs WHERE user_id = ? AND created_at > ?',
      [userId, timeWindow],
      { operation: 'AuditExport.getDomainCount', table: 'operation_logs' }
    );
    return result?.cnt || 0;
  },

  /** 获取用户操作统计 */
  async getUserActionStats(userId: number, startDate: string): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT action, COUNT(*) as count FROM operation_logs WHERE user_id = ? AND created_at > ? GROUP BY action ORDER BY count DESC',
      [userId, startDate],
      { operation: 'AuditExport.getUserActionStats', table: 'operation_logs' }
    );
  },

  /** 获取操作时间分布 (SQLite) */
  async getTimeDistributionSQLite(userId: number, startDate: string): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT STRFTIME('%H', created_at) as hour, COUNT(*) as count FROM operation_logs
       WHERE user_id = ? AND created_at > ? GROUP BY STRFTIME('%H', created_at) ORDER BY hour`,
      [userId, startDate],
      { operation: 'AuditExport.getTimeDistributionSQLite', table: 'operation_logs' }
    );
  },

  /** 获取操作时间分布 (PostgreSQL) */
  async getTimeDistributionPostgreSQL(userId: number, startDate: string): Promise<QueryResult[]> {
    return queryInternal(
      `SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count FROM operation_logs
       WHERE user_id = $1 AND created_at > $2 GROUP BY EXTRACT(HOUR FROM created_at) ORDER BY hour`,
      [userId, startDate],
      { operation: 'AuditExport.getTimeDistributionPostgreSQL', table: 'operation_logs' }
    );
  },
};

// ============================================================================
// TOTP 2FA 业务操作
// ============================================================================

export const TOTPOperations = {
  /** 获取 TOTP 配置 */
  async getByUser(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT enabled, backup_codes FROM user_2fa WHERE user_id = ? AND type = ?',
      [userId, 'totp'],
      { operation: 'TOTP.getByUser', table: 'user_2fa' }
    );
  },

  /** 启用 TOTP (SQLite) */
  async enableSQLite(userId: number, secret: string, encryptedCodes: string): Promise<void> {
    return executeInternal(
      `INSERT INTO user_2fa (user_id, type, secret, backup_codes, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))
       ON CONFLICT(user_id, type) DO UPDATE SET
        secret = excluded.secret, backup_codes = excluded.backup_codes,
        enabled = 1, updated_at = datetime('now')`,
      [userId, 'totp', secret, encryptedCodes],
      { operation: 'TOTP.enableSQLite', table: 'user_2fa' }
    );
  },

  /** 启用 TOTP (MySQL) */
  async enableMySQL(userId: number, secret: string, encryptedCodes: string): Promise<void> {
    return executeInternal(
      `INSERT INTO user_2fa (user_id, type, secret, backup_codes, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE
       secret = VALUES(secret), backup_codes = VALUES(backup_codes),
       enabled = 1, updated_at = NOW()`,
      [userId, 'totp', secret, encryptedCodes],
      { operation: 'TOTP.enableMySQL', table: 'user_2fa' }
    );
  },

  /** 启用 TOTP (PostgreSQL) */
  async enablePostgreSQL(userId: number, secret: string, encryptedCodes: string): Promise<void> {
    return executeInternal(
      `INSERT INTO user_2fa (user_id, type, secret, backup_codes, enabled, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       ON CONFLICT(user_id, type) DO UPDATE SET
       secret = EXCLUDED.secret, backup_codes = EXCLUDED.backup_codes,
       enabled = true, updated_at = NOW()`,
      [userId, 'totp', secret, encryptedCodes],
      { operation: 'TOTP.enablePostgreSQL', table: 'user_2fa' }
    );
  },

  /** 禁用 TOTP */
  async disable(userId: number, enabledValue: number | boolean): Promise<void> {
    return executeInternal(
      'UPDATE user_2fa SET enabled = ? WHERE user_id = ? AND type = ?',
      [enabledValue, userId, 'totp'],
      { operation: 'TOTP.disable', table: 'user_2fa' }
    );
  },

  /** 验证备用码 */
  async verifyBackupCode(userId: number, enabledValue: number | boolean): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT backup_codes FROM user_2fa WHERE user_id = ? AND type = ? AND enabled = ?',
      [userId, 'totp', enabledValue],
      { operation: 'TOTP.verifyBackupCode', table: 'user_2fa' }
    );
  },

  /** 更新备用码 */
  async updateBackupCodes(userId: number, codes: string): Promise<void> {
    return executeInternal(
      'UPDATE user_2fa SET backup_codes = ? WHERE user_id = ? AND type = ?',
      [codes, userId, 'totp'],
      { operation: 'TOTP.updateBackupCodes', table: 'user_2fa' }
    );
  },
};

// ============================================================================
// WebAuthn 业务操作
// ============================================================================

export const WebAuthnOperations = {
  /** 获取用户的 WebAuthn 凭证 */
  async getByUser(userId: number): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT * FROM webauthn_credentials WHERE user_id = ?',
      [userId],
      { operation: 'WebAuthn.getByUser', table: 'webauthn_credentials' }
    );
  },

  /** 添加 WebAuthn 凭证 */
  async add(cred: { id: string; user_id: number; public_key: string; counter: number; device_type: string; backed_up: number; transports: string; name: string }): Promise<void> {
    return executeInternal(
      'INSERT INTO webauthn_credentials (id, user_id, public_key, counter, device_type, backed_up, transports, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [cred.id, cred.user_id, cred.public_key, cred.counter, cred.device_type, cred.backed_up, cred.transports, cred.name],
      { operation: 'WebAuthn.add', table: 'webauthn_credentials' }
    );
  },

  /** 检查用户是否有 WebAuthn 配置 */
  async exists(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT * FROM user_2fa WHERE user_id = ? AND type = ?',
      [userId, 'webauthn'],
      { operation: 'WebAuthn.exists', table: 'user_2fa' }
    );
  },

  /** 创建 WebAuthn 配置 */
  async createConfig(userId: number): Promise<void> {
    return executeInternal(
      'INSERT INTO user_2fa (user_id, type, secret, enabled) VALUES (?, ?, ?, ?)',
      [userId, 'webauthn', 'webauthn', 1],
      { operation: 'WebAuthn.createConfig', table: 'user_2fa' }
    );
  },

  /** 启用 WebAuthn */
  async enable(userId: number): Promise<void> {
    return executeInternal(
      'UPDATE user_2fa SET enabled = 1 WHERE user_id = ? AND type = ?',
      [userId, 'webauthn'],
      { operation: 'WebAuthn.enable', table: 'user_2fa' }
    );
  },

  /** 更新凭证计数器 */
  async updateCounter(id: string, counter: number): Promise<void> {
    return executeInternal(
      `UPDATE webauthn_credentials SET counter = ?, last_used_at = ${now()} WHERE id = ?`,
      [counter, id],
      { operation: 'WebAuthn.updateCounter', table: 'webauthn_credentials' }
    );
  },

  /** 删除凭证 */
  async delete(userId: number, id: string): Promise<void> {
    return executeInternal(
      'DELETE FROM webauthn_credentials WHERE user_id = ? AND id = ?',
      [userId, id],
      { operation: 'WebAuthn.delete', table: 'webauthn_credentials' }
    );
  },

  /** 禁用 WebAuthn */
  async disable(userId: number): Promise<void> {
    return executeInternal(
      'UPDATE user_2fa SET enabled = 0 WHERE user_id = ? AND type = ?',
      [userId, 'webauthn'],
      { operation: 'WebAuthn.disable', table: 'user_2fa' }
    );
  },
};

// ============================================================================
// SMTP 配置业务操作
// ============================================================================

export const SmtpOperations = {
  /** 获取 SMTP 配置 */
  async getConfig(): Promise<QueryResult | undefined> {
    return getInternal(
      "SELECT value FROM system_settings WHERE key = 'smtp_config'",
      [],
      { operation: 'Smtp.getConfig', table: 'system_settings' }
    );
  },

  /** 更新 SMTP 配置 (MySQL) */
  async updateConfigMySQL(configJson: string): Promise<void> {
    return executeInternal(
      `INSERT INTO system_settings (\`key\`, \`value\`, updated_at) VALUES (?, ?, ${now()})
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = ${now()}`,
      ['smtp_config', configJson],
      { operation: 'Smtp.updateConfigMySQL', table: 'system_settings' }
    );
  },

  /** 更新 SMTP 配置 (SQLite/PostgreSQL) */
  async updateConfig(configJson: string): Promise<void> {
    return executeInternal(
      `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ${now()})
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = ${now()}`,
      ['smtp_config', configJson],
      { operation: 'Smtp.updateConfig', table: 'system_settings' }
    );
  },
};

// ============================================================================
// WHOIS 业务操作
// ============================================================================

export const WhoisOperations = {
  /** 获取所有域名 */
  async getAllDomains(): Promise<QueryResult[]> {
    return queryInternal(
      'SELECT id, name FROM domains',
      [],
      { operation: 'Whois.getAllDomains', table: 'domains' }
    );
  },

  /** 更新域名过期时间 */
  async updateExpiry(domainId: number, expiresAt: string): Promise<void> {
    return executeInternal(
      'UPDATE domains SET expires_at = ? WHERE id = ?',
      [expiresAt, domainId],
      { operation: 'Whois.updateExpiry', table: 'domains' }
    );
  },

  /** 获取域名过期通知设置 */
  async getNotificationSetting(): Promise<QueryResult | undefined> {
    return getInternal(
      "SELECT value FROM system_settings WHERE key = 'domain_expiry_notification'",
      [],
      { operation: 'Whois.getNotificationSetting', table: 'system_settings' }
    );
  },

  /** 获取域名过期阈值 */
  async getExpiryDays(): Promise<QueryResult | undefined> {
    return getInternal(
      "SELECT value FROM system_settings WHERE key = 'domain_expiry_days'",
      [],
      { operation: 'Whois.getExpiryDays', table: 'system_settings' }
    );
  },

  /** 根据ID获取域名 */
  async getDomainById(id: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT id, name FROM domains WHERE id = ?',
      [id],
      { operation: 'Whois.getDomainById', table: 'domains' }
    );
  },
};

// ============================================================================
// 审计规则业务操作
// ============================================================================

export const AuditRulesOperations = {
  /** 获取审计规则配置 */
  async getConfig(): Promise<QueryResult | undefined> {
    return getInternal(
      "SELECT value FROM system_settings WHERE key = 'audit_rules'",
      [],
      { operation: 'AuditRules.getConfig', table: 'system_settings' }
    );
  },

  /** 获取用户名 */
  async getUsername(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      'SELECT username FROM users WHERE id = ?',
      [userId],
      { operation: 'AuditRules.getUsername', table: 'users' }
    );
  },

  /** 获取最近删除操作数量 (SQLite) */
  async getRecentDeletionsSQLite(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      `SELECT COUNT(*) as count FROM operation_logs WHERE user_id = ? AND action IN ('delete_record', 'delete_domain')
       AND created_at >= datetime('now', '-1 hour')`,
      [userId],
      { operation: 'AuditRules.getRecentDeletionsSQLite', table: 'operation_logs' }
    );
  },

  /** 获取最近删除操作数量 (MySQL) */
  async getRecentDeletionsMySQL(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      `SELECT COUNT(*) as count FROM operation_logs WHERE user_id = ? AND action IN ('delete_record', 'delete_domain')
       AND created_at >= NOW() - INTERVAL 1 HOUR`,
      [userId],
      { operation: 'AuditRules.getRecentDeletionsMySQL', table: 'operation_logs' }
    );
  },

  /** 获取最近删除操作数量 (PostgreSQL) */
  async getRecentDeletionsPostgreSQL(userId: number): Promise<QueryResult | undefined> {
    return getInternal(
      `SELECT COUNT(*) as count FROM operation_logs WHERE user_id = $1 AND action IN ('delete_record', 'delete_domain')
       AND created_at >= NOW() - INTERVAL '1 hour'`,
      [userId],
      { operation: 'AuditRules.getRecentDeletionsPostgreSQL', table: 'operation_logs' }
    );
  },
};

// ============================================================================
// 审计日志记录业务操作
// ============================================================================

export const AuditLogOperations = {
  /** 记录审计日志 */
  async log(userId: number, action: string, domain: string, data: string): Promise<void> {
    return executeInternal(
      'INSERT INTO operation_logs (user_id, action, domain, data) VALUES (?, ?, ?, ?)',
      [userId, action, domain, data],
      { operation: 'AuditLog.log', table: 'operation_logs' }
    );
  },
};

// ============================================================================
// 导出默认对象（兼容旧代码）
// ============================================================================

// 导出 database 对象（向后兼容）
export const database = {
  query,
  get,
  execute,
  insert,
  run,
  now,
  get type() { return getDbType(); },
  get isConnected() { return isDbConnected(); },
  transaction: withTransaction,
};

export default {
  query,
  get,
  execute,
  insert,
  run,
  now,
  getDbType,
  isDbConnected,
  withTransaction,
  User: UserOperations,
  DnsAccount: DnsAccountOperations,
  Domain: DomainOperations,
  Team: TeamOperations,
  Settings: SettingsOperations,
  Audit: AuditOperations,
  Token: TokenOperations,
  Secret: SecretOperations,
  SecurityPolicy: SecurityPolicyOperations,
  TrustedDevice: TrustedDeviceOperations,
  UserPreferences: UserPreferencesOperations,
  Session: SessionOperations,
  LoginLimit: LoginLimitOperations,
  Failover: FailoverOperations,
  AuditExport: AuditExportOperations,
  TOTP: TOTPOperations,
  WebAuthn: WebAuthnOperations,
  Smtp: SmtpOperations,
  Whois: WhoisOperations,
  AuditRules: AuditRulesOperations,
  AuditLog: AuditLogOperations,
};

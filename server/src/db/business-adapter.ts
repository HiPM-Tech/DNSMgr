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
// 日志系统 - 使用统一日志模块
// ============================================================================

/** 创建操作日志上下文 */
function createOperationLogger(context: OperationContext) {
  return {
    start: () => log.debug('BusinessAdapter', `Starting ${context.operation}`, { table: context.table, userId: context.userId }),
    success: (duration: number, meta?: Record<string, unknown>) => 
      log.info('BusinessAdapter', `${context.operation} completed`, { ...meta, duration: `${duration}ms`, table: context.table }),
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

  // MySQL 保留关键字转义（仅转义作为标识符的关键字，不转义 SQL 关键字如 ORDER BY）
  if (dbType === 'mysql') {
    // 只转义在特定上下文中的关键字（如列名、表名别名等）
    // 避免转义 SQL 关键字如 ORDER BY, GROUP BY 等
    const keywords = ['key', 'value'];
    keywords.forEach(keyword => {
      // 只匹配作为独立标识符的关键字，后面不跟 BY 等 SQL 关键字
      const regex = new RegExp(`\\b${keyword}\\b(?!\\s+(?:BY|AS|FROM|WHERE|AND|OR))`, 'gi');
      sql = sql.replace(regex, (match, offset) => {
        // 检查是否在 ORDER BY 或 GROUP BY 上下文中
        const beforeContext = sql.substring(Math.max(0, offset - 10), offset).toUpperCase();
        if (beforeContext.includes('ORDER') || beforeContext.includes('GROUP')) {
          return match; // 不转义
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
    log.info('BusinessAdapter', `Query executed`, { 
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
    log.info('BusinessAdapter', `Get executed`, { 
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
  /** 根据ID获取用户 */
  async getById(id: number): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM users WHERE id = ?', [id], { operation: 'User.getById', table: 'users' });
  },

  /** 根据用户名获取用户 */
  async getByUsername(username: string): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM users WHERE username = ?', [username], { operation: 'User.getByUsername', table: 'users' });
  },

  /** 根据邮箱获取用户 */
  async getByEmail(email: string): Promise<QueryResult | undefined> {
    return getInternal('SELECT * FROM users WHERE email = ?', [email], { operation: 'User.getByEmail', table: 'users' });
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
    const dbType = getDbType();
    let sql: string;
    
    if (dbType === 'mysql') {
      // MySQL 使用 ON DUPLICATE KEY UPDATE
      sql = 'INSERT INTO system_settings (`key`, `value`, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = CURRENT_TIMESTAMP';
    } else if (dbType === 'postgresql') {
      // PostgreSQL 使用 ON CONFLICT
      sql = 'INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP';
    } else {
      // SQLite 使用 ON CONFLICT
      sql = 'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP';
    }
    
    return executeInternal(sql, [key, value], { operation: 'Settings.set', table: 'system_settings' });
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
};

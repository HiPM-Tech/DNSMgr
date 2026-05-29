/**
 * Domain Query Builder
 * 域名查询构建器 - 用于组合不同的过滤条件
 */

import { normalizeDomain } from '../../utils/dns';

export interface DomainQueryOptions {
  select?: string;
  joins?: string[];
  wheres?: string[];
  params?: unknown[];
  orderBy?: string;
}

export class DomainQueryBuilder {
  private selectColumns: string = 'd.*';
  private joins: string[] = [];
  private wheres: string[] = [];
  private params: unknown[] = [];
  private orderBy: string = 'd.id';

  /**
   * 设置查询列
   */
  select(columns: string): this {
    this.selectColumns = columns;
    return this;
  }

  /**
   * 添加 JOIN
   */
  join(sql: string): this {
    this.joins.push(sql);
    return this;
  }

  /**
   * 添加 WHERE 条件（带参数）
   */
  where(condition: string, ...params: unknown[]): this {
    this.wheres.push(condition);
    this.params.push(...params);
    return this;
  }

  /**
   * 添加 WHERE 条件（不带参数）
   */
  whereRaw(condition: string): this {
    this.wheres.push(condition);
    return this;
  }

  /**
   * 关联 dns_accounts 表
   */
  joinAccounts(): this {
    this.joins.push('INNER JOIN dns_accounts a ON d.account_id = a.id');
    return this;
  }

  /**
   * 过滤启用的账号
   */
  whereAccountEnabled(): this {
    this.wheres.push('a.enabled = 1');
    return this;
  }

  /**
   * 按账号 ID 过滤
   */
  whereAccountId(accountId: number): this {
    this.wheres.push('d.account_id = ?');
    this.params.push(accountId);
    return this;
  }

  /**
   * 按关键词搜索
   */
  whereKeyword(keyword: string): this {
    // Normalize keyword to Punycode for database search (supports IDN domains)
    const normalizedKeyword = normalizeDomain(keyword);
    this.wheres.push('d.name LIKE ?');
    this.params.push(`%${normalizedKeyword}%`);
    return this;
  }

  /**
   * 按域名状态过滤
   */
  whereDomainEnabled(enabled: boolean): this {
    this.wheres.push('d.enabled = ?');
    this.params.push(enabled ? 1 : 0);
    return this;
  }

  /**
   * 按域名类型过滤（顶域/子域）
   */
  whereDomainType(type: 'apex' | 'subdomain'): this {
    if (type === 'apex') {
      // 顶域：name 中不包含 . （或者 name = root_domain）
      // 简化判断：name 不包含额外的点
      this.wheres.push("d.name NOT LIKE '%.%.%'");
    } else if (type === 'subdomain') {
      // 子域：name 中包含多个点
      this.wheres.push("d.name LIKE '%.%.%'");
    }
    return this;
  }

  /**
   * 按域名 ID 列表过滤
   */
  whereDomainIds(ids: number[]): this {
    if (ids.length === 0) {
      this.wheres.push('1=0'); // 永远为假
      return this;
    }
    const placeholders = ids.map(() => '?').join(',');
    this.wheres.push(`d.id IN (${placeholders})`);
    this.params.push(...ids);
    return this;
  }

  /**
   * 设置排序
   */
  orderByColumn(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderBy = `${column} ${direction}`;
    return this;
  }

  /**
   * 重置所有条件
   */
  reset(): this {
    this.selectColumns = 'd.*';
    this.joins = [];
    this.wheres = [];
    this.params = [];
    this.orderBy = 'd.id';
    return this;
  }

  /**
   * 构建 SQL
   */
  build(): { sql: string; params: unknown[] } {
    const joinClause = this.joins.length > 0 ? ' ' + this.joins.join(' ') : '';
    const whereClause = this.wheres.length > 0 
      ? ' WHERE ' + this.wheres.join(' AND ') 
      : '';
    
    return {
      sql: `SELECT ${this.selectColumns} FROM domains d${joinClause}${whereClause} ORDER BY ${this.orderBy}`,
      params: this.params
    };
  }

  // ============================================================================
  // 常用查询预设（静态工厂方法）
  // ============================================================================

  /**
   * Level 1: ALL - 查询所有域名（无过滤）
   */
  static all(): DomainQueryBuilder {
    return new DomainQueryBuilder();
  }

  /**
   * Level 3: 带账号关联和 enabled 过滤
   */
  static withAccountFilter(): DomainQueryBuilder {
    return new DomainQueryBuilder()
      .joinAccounts()
      .whereAccountEnabled();
  }

  /**
   * Level 3: Token 认证 - 按 ID 列表查询
   */
  static forTokenAuth(domainIds: number[], options?: { accountId?: number; keyword?: string }): DomainQueryBuilder {
    const builder = new DomainQueryBuilder()
      .joinAccounts()
      .whereAccountEnabled()
      .whereDomainIds(domainIds);
    
    if (options?.accountId) {
      builder.whereAccountId(options.accountId);
    }
    if (options?.keyword) {
      builder.whereKeyword(options.keyword);
    }
    
    return builder;
  }

  /**
   * Level 3: 超级管理员查询
   */
  static forSuperAdmin(options?: { accountId?: number; keyword?: string }): DomainQueryBuilder {
    const builder = new DomainQueryBuilder()
      .joinAccounts();
    // 注意：不过滤账号 enabled 状态，允许查看所有账号的域名
    
    if (options?.accountId) {
      builder.whereAccountId(options.accountId);
    }
    if (options?.keyword) {
      builder.whereKeyword(options.keyword);
    }
    
    return builder;
  }

  /**
   * Level 1: NS 监控专用 - 普通用户查询（不过滤 enabled）
   */
  static forNSMonitorUser(userId: number): DomainQueryBuilder {
    const builder = new DomainQueryBuilder();
    builder.wheres.push('d.account_id IN (SELECT id FROM dns_accounts WHERE created_by = ?)');
    builder.params.push(userId);
    return builder;
  }

  /**
   * Level 3: 可访问域名 - 超级管理员
   */
  static accessibleForSuperAdmin(options?: { accountId?: number; keyword?: string }): DomainQueryBuilder {
    const builder = DomainQueryBuilder.withAccountFilter();
    
    if (options?.accountId) {
      builder.whereAccountId(options.accountId);
    }
    if (options?.keyword) {
      builder.whereKeyword(options.keyword);
    }
    
    return builder;
  }

  /**
   * Level 3: 可访问域名 - 普通用户（带团队和权限检查）
   */
  static accessibleForUser(userId: number, teamIds: number[], options?: { accountId?: number; keyword?: string }): DomainQueryBuilder {
    const builder = new DomainQueryBuilder();
    
    // Build permission check subqueries
    const teamFilter = teamIds.length > 0 ? `OR team_id IN (${teamIds.map(() => '?').join(',')})` : '';
    const teamPermFilter = teamIds.length > 0 ? `OR team_id IN (${teamIds.map(() => '?').join(',')})` : '';
    
    // Main permission check
    builder.wheres.push(`(d.account_id IN (
      SELECT id FROM dns_accounts WHERE created_by = ? ${teamFilter}
    ) OR d.id IN (
      SELECT domain_id FROM domain_permissions WHERE user_id = ? ${teamPermFilter}
    ))`);
    
    // Add parameters: userId, teamIds..., userId, teamIds...
    builder.params.push(userId, ...teamIds, userId, ...teamIds);
    
    // Add optional filters
    if (options?.accountId) {
      builder.whereAccountId(options.accountId);
    }
    if (options?.keyword) {
      builder.whereKeyword(options.keyword);
    }
    
    return builder;
  }

  /**
   * Level 2: 用户域名访问检查（用于 Token 权限验证）
   */
  static checkUserAccess(domainId: number, userId: number): DomainQueryBuilder {
    const builder = new DomainQueryBuilder();
    builder.selectColumns = 'd.id';
    builder.joins.push('JOIN dns_accounts da ON d.account_id = da.id');
    builder.wheres.push(`d.enabled != 0 AND d.id = ? AND (da.created_by = ? OR d.id IN (
      SELECT domain_id FROM domain_permissions WHERE user_id = ?
    ))`);
    builder.params.push(domainId, userId, userId);
    return builder;
  }

  /**
   * Level 3: 批量过滤可访问的域名
   */
  static filterAccessibleDomains(domainIds: number[], userId: number): DomainQueryBuilder {
    if (domainIds.length === 0) {
      const builder = new DomainQueryBuilder();
      builder.wheres.push('1=0'); // 永远返回空
      return builder;
    }

    const builder = new DomainQueryBuilder();
    builder.selectColumns = 'd.id';
    builder.joins.push('JOIN dns_accounts da ON d.account_id = da.id');
    
    const placeholders = domainIds.map(() => '?').join(',');
    builder.wheres.push(`d.id IN (${placeholders}) 
      AND d.enabled != 0
      AND (da.created_by = ? OR d.id IN (
        SELECT domain_id FROM domain_permissions WHERE user_id = ?
      ))`);
    builder.params.push(...domainIds, userId, userId);
    
    return builder;
  }

  /**
   * Level 2: 检查域名所有者
   */
  static checkDomainOwner(domainId: number, userId: number): DomainQueryBuilder {
    const builder = new DomainQueryBuilder();
    builder.selectColumns = 'd.id';
    builder.joins.push('JOIN dns_accounts da ON d.account_id = da.id');
    builder.wheres.push('d.id = ? AND da.created_by = ?');
    builder.params.push(domainId, userId);
    return builder;
  }
}

/**
 * Renewable Domain Query Builder
 * 续期域名查询构建器 - 用于组合不同的过滤条件
 */

export class RenewableDomainQueryBuilder {
  private selectColumns: string = 'rd.*';
  private joins: string[] = [];
  private wheres: string[] = [];
  private params: unknown[] = [];
  private orderBy: string = 'rd.expires_at ASC';

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
    this.joins.push('INNER JOIN dns_accounts da ON rd.account_id = da.id');
    return this;
  }

  /**
   * 过滤启用的账号
   */
  whereAccountEnabled(): this {
    this.wheres.push('da.enabled = 1');
    return this;
  }

  /**
   * 过滤启用的续期域名
   */
  whereRenewableEnabled(enabledValue: string = '1'): this {
    this.wheres.push(`rd.enabled = ${enabledValue}`);
    return this;
  }

  /**
   * 按账号 ID 过滤
   */
  whereAccountId(accountId: number): this {
    this.wheres.push('rd.account_id = ?');
    this.params.push(accountId);
    return this;
  }

  /**
   * 按提供商类型过滤
   */
  whereProviderType(providerType: string): this {
    this.wheres.push('rd.provider_type = ?');
    this.params.push(providerType);
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
    this.selectColumns = 'rd.*';
    this.joins = [];
    this.wheres = [];
    this.params = [];
    this.orderBy = 'rd.expires_at ASC';
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
      sql: `SELECT ${this.selectColumns} FROM renewable_domains rd${joinClause}${whereClause} ORDER BY ${this.orderBy}`,
      params: this.params
    };
  }

  // ============================================================================
  // 常用查询预设（静态工厂方法）
  // ============================================================================

  /**
   * Level 3: 主列表 - 所有续期域名（过滤禁用账号）
   */
  static all(): RenewableDomainQueryBuilder {
    return new RenewableDomainQueryBuilder()
      .joinAccounts()
      .whereAccountEnabled();
  }

  /**
   * Level 3: 按提供商类型查询（过滤启用状态和账号）
   */
  static byProviderType(providerType: string, enabledValue: string = '1'): RenewableDomainQueryBuilder {
    return new RenewableDomainQueryBuilder()
      .joinAccounts()
      .whereProviderType(providerType)
      .whereRenewableEnabled(enabledValue)
      .whereAccountEnabled();
  }

  /**
   * Level 3: 获取所有启用的续期域名（后台任务用）
   */
  static allEnabled(enabledValue: string = '1'): RenewableDomainQueryBuilder {
    return new RenewableDomainQueryBuilder()
      .joinAccounts()
      .whereRenewableEnabled(enabledValue)
      .whereAccountEnabled();
  }

  /**
   * Level 2: 按账号 ID 查询（不过滤账号 enabled）
   */
  static byAccountId(accountId: number): RenewableDomainQueryBuilder {
    return new RenewableDomainQueryBuilder()
      .whereAccountId(accountId);
  }
}

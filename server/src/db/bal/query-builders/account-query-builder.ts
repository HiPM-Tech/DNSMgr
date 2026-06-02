/**
 * Account Query Builder
 * DNS账号查询构建器 - 用于组合不同的过滤条件
 */

export class AccountQueryBuilder {
  private selectColumns: string = 'da.*';
  private joins: string[] = [];
  private wheres: string[] = [];
  private params: unknown[] = [];
  private orderBy: string = 'da.id';

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
   * 按账号 ID 过滤
   */
  whereAccountId(accountId: number): this {
    this.wheres.push('da.id = ?');
    this.params.push(accountId);
    return this;
  }

  /**
   * 按创建者过滤
   */
  whereCreatedBy(userId: number): this {
    this.wheres.push('da.created_by = ?');
    this.params.push(userId);
    return this;
  }

  /**
   * 过滤启用的账号
   */
  whereEnabled(): this {
    this.wheres.push('da.enabled = true');
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
    this.selectColumns = 'da.*';
    this.joins = [];
    this.wheres = [];
    this.params = [];
    this.orderBy = 'da.id';
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
      sql: `SELECT ${this.selectColumns} FROM dns_accounts da${joinClause}${whereClause} ORDER BY ${this.orderBy}`,
      params: this.params
    };
  }

  // ============================================================================
  // 常用查询预设（静态工厂方法）
  // ============================================================================

  /**
   * Level 2: 检查账号访问权限
   */
  static checkAccountAccess(accountId: number, userId: number): AccountQueryBuilder {
    const builder = new AccountQueryBuilder();
    builder.selectColumns = 'da.id';
    builder.whereAccountId(accountId);
    builder.whereRaw(`(da.created_by = ? OR da.id IN (
      SELECT account_id FROM team_accounts WHERE team_id IN (
        SELECT team_id FROM team_members WHERE user_id = ?
      )
    ))`);
    builder.params.push(userId, userId);
    return builder;
  }

  /**
   * Level 3: 获取用户可访问的账号列表（无团队）
   */
  static accessibleAccountsNoTeam(userId: number): AccountQueryBuilder {
    return new AccountQueryBuilder()
      .whereCreatedBy(userId);
  }

  /**
   * Level 3: 获取用户可访问的账号列表（有团队）
   */
  static accessibleAccountsWithTeam(userId: number, teamIds: number[]): AccountQueryBuilder {
    const builder = new AccountQueryBuilder();
    builder.selectColumns = 'DISTINCT da.*';
    
    const placeholders = teamIds.map(() => '?').join(',');
    builder.whereRaw(`da.created_by = ? OR da.id IN (
      SELECT account_id FROM team_accounts WHERE team_id IN (${placeholders})
    )`);
    builder.params.push(userId, ...teamIds);
    
    return builder;
  }
}

/**
 * Team Query Builder
 * 团队查询构建器 - 用于组合不同的过滤条件
 */

export class TeamQueryBuilder {
  private selectColumns: string = 'tm.*';
  private joins: string[] = [];
  private wheres: string[] = [];
  private params: unknown[] = [];
  private orderBy: string = 'tm.id';

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
   * 按团队 ID 过滤
   */
  whereTeamId(teamId: number): this {
    this.wheres.push('tm.team_id = ?');
    this.params.push(teamId);
    return this;
  }

  /**
   * 按用户 ID 过滤
   */
  whereUserId(userId: number): this {
    this.wheres.push('tm.user_id = ?');
    this.params.push(userId);
    return this;
  }

  /**
   * 按角色过滤
   */
  whereRole(role: 'member' | 'admin' | 'owner'): this {
    this.wheres.push('tm.role = ?');
    this.params.push(role);
    return this;
  }

  /**
   * 按多个角色过滤
   */
  whereRoles(roles: ('member' | 'admin' | 'owner')[]): this {
    const placeholders = roles.map(() => '?').join(',');
    this.wheres.push(`tm.role IN (${placeholders})`);
    this.params.push(...roles);
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
    this.selectColumns = 'tm.*';
    this.joins = [];
    this.wheres = [];
    this.params = [];
    this.orderBy = 'tm.id';
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
      sql: `SELECT ${this.selectColumns} FROM team_members tm${joinClause}${whereClause} ORDER BY ${this.orderBy}`,
      params: this.params
    };
  }

  // ============================================================================
  // 常用查询预设（静态工厂方法）
  // ============================================================================

  /**
   * Level 2: 检查团队访问权限（默认成员级别）
   */
  static checkTeamAccess(teamId: number, userId: number, requiredRole?: 'member' | 'admin' | 'owner'): TeamQueryBuilder {
    const builder = new TeamQueryBuilder();
    builder.selectColumns = 'tm.team_id as id';
    builder.whereTeamId(teamId);
    builder.whereUserId(userId);
    
    if (requiredRole) {
      switch (requiredRole) {
        case 'owner':
          builder.whereRole('owner');
          break;
        case 'admin':
          builder.whereRoles(['owner', 'admin']);
          break;
        case 'member':
        default:
          // 不需要额外条件
          break;
      }
    }
    
    return builder;
  }

  /**
   * Level 3: 获取用户的团队列表
   */
  static userTeams(userId: number): TeamQueryBuilder {
    return new TeamQueryBuilder()
      .select('tm.team_id')
      .whereUserId(userId);
  }
}

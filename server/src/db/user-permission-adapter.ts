/**
 * User Permission Adapter
 * 用户权限适配器 - 专门处理用户权限检查和验证
 */

import { queryInternal, getInternal } from '../core/connection';
import type { QueryResult } from '../types';

export interface PermissionCheckResult {
  hasAccess: boolean;
  reason?: string;
}

export interface UserPermissionContext {
  userId: number;
  teamIds: number[];
  isSuper: boolean;
}

export const UserPermissionAdapter = {
  /**
   * 检查用户是否有权限访问特定域名
   * @param domainId 域名ID
   * @param userId 用户ID
   * @returns 是否有访问权限
   */
  async checkDomainAccess(domainId: number, userId: number): Promise<boolean> {
    const result = await getInternal<{ id: number }>(
      `SELECT d.id FROM domains d
       JOIN dns_accounts da ON d.account_id = da.id
       WHERE d.enabled != 0 AND d.id = ? AND (da.created_by = ? OR d.id IN (
         SELECT domain_id FROM domain_permissions WHERE user_id = ?
       ))`,
      [domainId, userId, userId],
      { operation: 'UserPermission.checkDomainAccess', table: 'domains' }
    );
    
    return !!result;
  },

  /**
   * 检查用户是否有权限管理特定账号
   * @param accountId 账号ID
   * @param userId 用户ID
   * @returns 是否有管理权限
   */
  async checkAccountAccess(accountId: number, userId: number): Promise<boolean> {
    const result = await getInternal<{ id: number }>(
      `SELECT id FROM dns_accounts 
       WHERE id = ? AND (created_by = ? OR id IN (
         SELECT account_id FROM team_accounts WHERE team_id IN (
           SELECT team_id FROM team_members WHERE user_id = ?
         )
       ))`,
      [accountId, userId, userId],
      { operation: 'UserPermission.checkAccountAccess', table: 'dns_accounts' }
    );
    
    return !!result;
  },

  /**
   * 获取用户可访问的账号ID列表
   * @param userId 用户ID
   * @param teamIds 用户所属团队ID列表
   * @returns 可访问的账号ID数组
   */
  async getAccessibleAccountIds(userId: number, teamIds: number[]): Promise<number[]> {
    if (teamIds.length === 0) {
      // 没有团队，只返回用户创建的账号
      const accounts = await queryInternal<{ id: number }>(
        'SELECT id FROM dns_accounts WHERE created_by = ?',
        [userId],
        { operation: 'UserPermission.getAccessibleAccountIds.noTeam', table: 'dns_accounts' }
      );
      return accounts.map(a => a.id);
    }

    // 有团队，返回用户创建的 + 团队关联的账号
    const placeholders = teamIds.map(() => '?').join(',');
    const accounts = await queryInternal<{ id: number }>(
      `SELECT DISTINCT id FROM dns_accounts 
       WHERE created_by = ? OR id IN (
         SELECT account_id FROM team_accounts WHERE team_id IN (${placeholders})
       )`,
      [userId, ...teamIds],
      { operation: 'UserPermission.getAccessibleAccountIds.withTeam', table: 'dns_accounts' }
    );
    
    return accounts.map(a => a.id);
  },

  /**
   * 检查用户是否有权限操作特定团队
   * @param teamId 团队ID
   * @param userId 用户ID
   * @param requiredRole 所需角色 ('member', 'admin', 'owner')
   * @returns 是否有权限
   */
  async checkTeamAccess(teamId: number, userId: number, requiredRole: 'member' | 'admin' | 'owner' = 'member'): Promise<boolean> {
    let roleCondition = '';
    
    switch (requiredRole) {
      case 'owner':
        roleCondition = 'AND tm.role = \'owner\'';
        break;
      case 'admin':
        roleCondition = 'AND tm.role IN (\'owner\', \'admin\')';
        break;
      case 'member':
      default:
        roleCondition = '';
        break;
    }

    const result = await getInternal<{ id: number }>(
      `SELECT tm.team_id as id FROM team_members tm
       WHERE tm.team_id = ? AND tm.user_id = ? ${roleCondition}`,
      [teamId, userId],
      { operation: 'UserPermission.checkTeamAccess', table: 'team_members' }
    );
    
    return !!result;
  },

  /**
   * 构建用户权限上下文
   * @param userId 用户ID
   * @param userRole 用户角色
   * @param teamIds 用户所属团队ID列表（可选，会自动查询）
   * @returns 权限上下文对象
   */
  async buildPermissionContext(
    userId: number, 
    userRole: string,
    teamIds?: number[]
  ): Promise<UserPermissionContext> {
    const isSuper = userRole === 'super_admin' || userRole === 'admin';
    
    if (!teamIds) {
      // 自动查询用户所属团队
      const teams = await queryInternal<{ team_id: number }>(
        'SELECT team_id FROM team_members WHERE user_id = ?',
        [userId],
        { operation: 'UserPermission.buildPermissionContext.getTeams', table: 'team_members' }
      );
      teamIds = teams.map(t => t.team_id);
    }

    return {
      userId,
      teamIds,
      isSuper,
    };
  },

  /**
   * 批量检查用户对多个域名的访问权限
   * @param domainIds 域名ID数组
   * @param userId 用户ID
   * @returns 有权限的域名ID数组
   */
  async filterAccessibleDomains(domainIds: number[], userId: number): Promise<number[]> {
    if (domainIds.length === 0) return [];

    const placeholders = domainIds.map(() => '?').join(',');
    const accessibleDomains = await queryInternal<{ id: number }>(
      `SELECT d.id FROM domains d
       JOIN dns_accounts da ON d.account_id = da.id
       WHERE d.id IN (${placeholders}) 
         AND d.enabled != 0
         AND (da.created_by = ? OR d.id IN (
           SELECT domain_id FROM domain_permissions WHERE user_id = ?
         ))`,
      [...domainIds, userId, userId],
      { operation: 'UserPermission.filterAccessibleDomains', table: 'domains' }
    );
    
    return accessibleDomains.map(d => d.id);
  },

  /**
   * 检查用户是否是域名的所有者（创建者）
   * @param domainId 域名ID
   * @param userId 用户ID
   * @returns 是否是所有者
   */
  async isDomainOwner(domainId: number, userId: number): Promise<boolean> {
    const result = await getInternal<{ id: number }>(
      `SELECT d.id FROM domains d
       JOIN dns_accounts da ON d.account_id = da.id
       WHERE d.id = ? AND da.created_by = ?`,
      [domainId, userId],
      { operation: 'UserPermission.isDomainOwner', table: 'domains' }
    );
    
    return !!result;
  },
};

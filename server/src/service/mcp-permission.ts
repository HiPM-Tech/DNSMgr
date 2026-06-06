/**
 * MCP 权限验证服务
 *
 * 权限模型：
 * - 全局开关仅控制启用/禁用，不影响具体权限
 * - 权限由用户角色决定
 * - API Key 拥有用户角色的最大权限
 * - OAuth2 可选择具体的权限范围
 */

import { McpOperations, UserOperations } from '../db/bal/business-adapter';
import { AppError } from '../middleware/errorHandler';
import { createLogger } from '../lib/logger';
import { ROLE_USER, ROLE_ADMIN, ROLE_SUPER } from '../utils/roles';

const log = createLogger('Security').sub('McpPermission');
export type McpPermissionLevel = 'disabled' | 'read' | 'write';

export type McpModule =
  | 'ns_monitor'
  | 'domain_management'
  | 'renewal_management'
  | 'log_query'
  | 'failover_management';

/**
 * 用户角色对应的权限映射
 */
const ROLE_PERMISSIONS: Record<string, Record<McpModule, McpPermissionLevel>> = {
  member: {
    ns_monitor: 'read',
    domain_management: 'read',
    renewal_management: 'read',
    log_query: 'disabled', // 普通用户禁止访问日志
    failover_management: 'read',
  },
  admin: {
    ns_monitor: 'write',
    domain_management: 'write',
    renewal_management: 'write',
    log_query: 'read', // 管理员可读日志
    failover_management: 'write',
  },
  super: {
    ns_monitor: 'write',
    domain_management: 'write',
    renewal_management: 'write',
    log_query: 'read', // 超管也只读日志（安全考虑）
    failover_management: 'write',
  },
};

/**
 * 比较两个权限级别，返回更严格的那个
 */
function minPermission(a: McpPermissionLevel, b: McpPermissionLevel): McpPermissionLevel {
  const levels: Record<McpPermissionLevel, number> = {
    disabled: 0,
    read: 1,
    write: 2,
  };

  return levels[a] <= levels[b] ? a : b;
}

/**
 * 检查 MCP 是否全局启用
 */
export async function isMcpEnabled(): Promise<boolean> {
  try {
    const config = await McpOperations.getGlobalConfig();
    return config?.enabled || false;
  } catch (error) {
    log.error('Failed to check MCP status', { error });
    return false;
  }
}

/**
 * 获取用户在某个模块的权限
 *
 * @param userId 用户ID
 * @param module 模块名称
 * @returns 权限级别
 */
export async function getUserModulePermission(
  userId: number,
  module: McpModule
): Promise<McpPermissionLevel> {
  // 1. 检查全局开关
  if (!await isMcpEnabled()) {
    return 'disabled';
  }

  // 2. 获取用户角色
  const user = await UserOperations.getById(userId);
  if (!user) {
    log.warn('User not found', { userId });
    return 'disabled';
  }

  // 3. 将数字 role_level 转为角色名称字符串
  const roleLevel = user.role as number;
  let roleName: string;
  if (roleLevel >= ROLE_SUPER) {
    roleName = 'super';
  } else if (roleLevel >= ROLE_ADMIN) {
    roleName = 'admin';
  } else {
    roleName = 'member';
  }

  // 4. 返回角色对应的权限
  const rolePermissions = ROLE_PERMISSIONS[roleName];
  if (!rolePermissions) {
    log.warn('Unknown role', { userId, role: user.role });
    return 'disabled';
  }

  return rolePermissions[module] || 'disabled';
}

/**
 * 验证工具调用权限
 *
 * @param userId 用户ID
 * @param toolName 工具名称
 * @param requiredPermission 所需权限级别
 * @throws AppError 如果权限不足
 */
export async function validateToolPermission(
  userId: number,
  toolName: string,
  requiredPermission: 'read' | 'write',
  authType?: string,
  tokenScope?: string
): Promise<void> {
  const module = getModuleByToolName(toolName);

  if (!module) {
    throw new AppError(400, `Unknown MCP tool: ${toolName}`);
  }

  // OAuth token scope check
  if (authType === 'oauth2') {
    if (!tokenScope) {
      throw new AppError(403, 'OAuth token has no scope assigned');
    }

    const scopes = tokenScope.split(',').map(s => s.trim());
    const requiredScope = `${module}:${requiredPermission}`;
    const writeScope = `${module}:write`;

    if (requiredPermission === 'write') {
      if (!scopes.includes(writeScope)) {
        log.warn('OAuth token scope insufficient for write', {
          userId, module, toolName, tokenScope
        });
        throw new AppError(403, `Token does not have '${writeScope}' scope`);
      }
    } else {
      if (!scopes.includes(requiredScope) && !scopes.includes(writeScope)) {
        log.warn('OAuth token scope insufficient for read', {
          userId, module, toolName, tokenScope
        });
        throw new AppError(403, `Token does not have '${requiredScope}' scope`);
      }
    }
  }

  const userPermission = await getUserModulePermission(userId, module);

  if (userPermission === 'disabled') {
    log.warn('Module disabled or no permission', {
      userId,
      module,
      toolName
    });
    throw new AppError(403, `MCP module '${module}' is disabled or you have no permission`);
  }

  if (requiredPermission === 'write' && userPermission !== 'write') {
    log.warn('Insufficient permission for write operation', {
      userId,
      module,
      toolName,
      userPermission
    });
    throw new AppError(403, `Write permission required for '${module}' module`);
  }

  log.debug('Permission validated', {
    userId,
    module,
    toolName,
    permission: userPermission
  });
}

/**
 * 根据工具名称获取所属模块
 */
export function getModuleByToolName(toolName: string): McpModule | null {
  const toolToModule: Record<string, McpModule> = {
    // NS 监控模块
    'list_ns_records': 'ns_monitor',
    'check_ns_status': 'ns_monitor',
    'get_ns_info': 'ns_monitor',
    'refresh_ns_monitor': 'ns_monitor',

    // 域名管理模块
    'list_domains': 'domain_management',
    'list_domains_filtered': 'domain_management',
    'get_domain_info': 'domain_management',
    'get_domain_remark': 'domain_management',
    'get_domain_pinned_status': 'domain_management',
    'get_domain_whois': 'domain_management',
    'update_domain_status': 'domain_management',
    'add_domain': 'domain_management',
    'delete_domain': 'domain_management',
    'update_domain': 'domain_management',

    // DNS 解析记录管理
    'list_domain_records': 'domain_management',
    'get_dns_lines': 'domain_management',
    'create_dns_record': 'domain_management',
    'update_dns_record': 'domain_management',
    'delete_dns_record': 'domain_management',

    // 续期管理模块
    'get_renewable_domains': 'renewal_management',
    'check_domain_expiry': 'renewal_management',
    'get_expiry_alerts': 'renewal_management',
    'manual_renew_domain': 'renewal_management',
    'disable_domain_renewal': 'renewal_management',

    // 日志查询模块
    'query_audit_logs': 'log_query',
    'get_audit_stats': 'log_query',
    'export_audit_logs': 'log_query',

    // 故障转移模块
    'list_failover_rules': 'failover_management',
    'get_failover_config': 'failover_management',
    'create_failover_config': 'failover_management',
    'delete_failover_config': 'failover_management',
    'perform_health_check': 'failover_management',
  };

  return toolToModule[toolName] || null;
}

/**
 * 计算 OAuth2 授权的实际权限范围
 *
 * @param userId 用户ID
 * @param requestedScopes 请求的权限范围
 * @returns 实际授权的权限范围
 */
export async function calculateOAuthScope(
  userId: number,
  requestedScopes: Partial<Record<McpModule, McpPermissionLevel>>
): Promise<Partial<Record<McpModule, McpPermissionLevel>>> {
  const actualScopes: Partial<Record<McpModule, McpPermissionLevel>> = {};

  for (const [module, requested] of Object.entries(requestedScopes)) {
    if (!isValidModule(module)) {
      continue;
    }

    // 获取用户在该模块的实际权限
    const userPermission = await getUserModulePermission(userId, module as McpModule);

    // 取请求权限和用户权限的最小值
    actualScopes[module as McpModule] = minPermission(
      requested as McpPermissionLevel,
      userPermission
    );
  }

  return actualScopes;
}

/**
 * 验证模块名称是否有效
 */
function isValidModule(module: string): boolean {
  const validModules: McpModule[] = [
    'ns_monitor',
    'domain_management',
    'renewal_management',
    'log_query',
    'failover_management',
  ];

  return validModules.includes(module as McpModule);
}

/**
 * 记录 MCP 审计日志
 */
export async function logMcpAction(data: {
  userId: number;
  authType: 'api_key' | 'oauth2';
  clientId?: string;
  module: McpModule;
  action: string;
  resourceType?: string;
  resourceId?: string;
  requestParams?: any;
  responseStatus: 'success' | 'denied' | 'error';
  ipAddress?: string;
}): Promise<void> {
  try {
    await McpOperations.logAudit({
      user_id: data.userId,
      auth_type: data.authType,
      client_id: data.clientId,
      module: data.module,
      action: data.action,
      resource_type: data.resourceType,
      resource_id: data.resourceId,
      request_params: data.requestParams ? JSON.stringify(data.requestParams) : undefined,
      response_status: data.responseStatus,
      ip_address: data.ipAddress,
    });
  } catch (error) {
    // 审计日志失败不应影响主流程
    log.error('Failed to log MCP action', { error, data });
  }
}

/**
 * 更新 API Key 最后使用时间并记录审计日志
 */
export async function trackApiKeyUsage(keyId: number, userId: number, ipAddress?: string): Promise<void> {
  try {
    await McpOperations.updateApiKeyLastUsed(keyId);

    // 记录审计日志
    await logMcpAction({
      userId,
      authType: 'api_key',
      module: 'domain_management', // 默认模块，具体模块在工具调用时记录
      action: 'api_key_used',
      responseStatus: 'success',
      ipAddress,
    });
  } catch (error) {
    log.error('Failed to track API key usage', { error, keyId });
  }
}

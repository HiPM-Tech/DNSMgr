import { AuditLogOperations, UserOperations } from '../db/business-adapter';
import { checkAuditRules } from './auditRules';
import { log } from '../lib/logger';
import { Request } from 'express';
import { wsService } from './websocket';

/**
 * 记录审计操作
 * @param userId - 用户 ID（可能是 Token 关联的用户 ID）
 * @param action - 操作类型
 * @param domain - 域名或资源名称
 * @param data - 额外数据
 * @param req - Express 请求对象（可选，用于检测 Token 认证）
 */
export async function logAuditOperation(
  userId: number,
  action: string,
  domain: string,
  data: unknown,
  req?: Request
): Promise<void> {
  let actualUserId = userId;
  let operatorName = '';
  let authSource = 'jwt'; // jwt, token, team

  // 检测是否为 Token 认证
  const tokenPayload = (req as any)?.tokenPayload;
  if (tokenPayload) {
    authSource = 'token';
    
    // Token 认证时，尝试获取实际用户信息
    try {
      const user = await UserOperations.getById(userId) as { username?: string; nickname?: string } | undefined;
      if (user) {
        operatorName = user.nickname || user.username || `user:${userId}`;
      } else {
        operatorName = `user:${userId}`;
      }
    } catch (err) {
      log.warn('Audit', 'Failed to get user info for token auth', { userId, error: err });
      operatorName = `user:${userId}`;
    }
  } else {
    // JWT 认证，直接使用 userId
    try {
      const user = await UserOperations.getById(userId) as { username?: string; nickname?: string } | undefined;
      if (user) {
        operatorName = user.nickname || user.username || `user:${userId}`;
      } else {
        operatorName = `user:${userId}`;
      }
    } catch (err) {
      log.warn('Audit', 'Failed to get user info for JWT auth', { userId, error: err });
      operatorName = `user:${userId}`;
    }
  }

  // 构建审计数据，包含认证来源和操作者信息
  const auditData = {
    ...(data as object),
    _auth_source: authSource,
    _operator_name: operatorName,
    _operator_id: actualUserId,
  };

  await AuditLogOperations.log(actualUserId, action, domain, JSON.stringify(auditData));

  // Async check against audit rules
  checkAuditRules(actualUserId, action, domain, auditData).catch(err => {
    log.error('Audit', 'Audit rule engine error', { error: err });
  });
  
  // 推送 WebSocket 消息给管理员（异步，不阻塞）
  try {
    wsService.broadcastToRole('3', {
      type: 'audit_log_created',
      data: {
        action,
        domain,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    log.warn('Audit', 'Failed to broadcast audit_log_created event', { error: err });
  }
}

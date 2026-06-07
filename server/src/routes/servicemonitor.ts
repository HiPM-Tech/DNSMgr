import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { DomainOperations } from '../db/bal/business-adapter';
import { createLogger } from '../lib/logger';
import { normalizeRole, isSuper } from '../utils/roles';
import { parseInteger, sendError, sendSuccess } from '../utils/http';
import {
  getMonitors,
  getMonitor,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  performCheck,
  runCheckAndUpdate,
} from '../service/serviceMonitor';

const log = createLogger('HTTP').sub('Route').sub('ServiceMonitor');
const router = Router();

// ============================================================================
// 工具函数
// ============================================================================

async function getDomainAccess(domainId: number, userId: number, role: number): Promise<{ canRead: boolean; canWrite: boolean }> {
  const domain = await DomainOperations.getById(domainId) as any;
  if (!domain) return { canRead: false, canWrite: false };
  if (isSuper(role) || domain.created_by === userId) return { canRead: true, canWrite: true };

  // Check team membership
  if (domain.team_id) {
    const { TeamOperations } = await import('../db/bal/business-adapter');
    const isMember = await TeamOperations.isMember(domain.team_id, userId);
    if (isMember) return { canRead: true, canWrite: true };
  }

  return { canRead: false, canWrite: false };
}

// ============================================================================
// 路由
// ============================================================================

/**
 * GET /api/servicemonitor/stats - 仪表盘统计
 */
router.get('/stats', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const monitors = await getMonitors(userId);

  const typeCount: Record<string, number> = {};
  const statusCount: Record<string, number> = { ok: 0, warning: 0, error: 0, unknown: 0 };
  let total = monitors.length;

  for (const m of monitors) {
    typeCount[m.type] = (typeCount[m.type] || 0) + 1;
    const s = m.status?.status || 'unknown';
    statusCount[s] = (statusCount[s] || 0) + 1;
  }

  sendSuccess(res, {
    total,
    byType: typeCount,
    byStatus: statusCount,
  });
}));

/**
 * GET /api/servicemonitor - 列出用户监控
 */
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const monitors = await getMonitors(userId);
  sendSuccess(res, monitors);
}));

/**
 * GET /api/servicemonitor/available-domains - 列出可用于 dns_failover 的域名
 */
router.get('/available-domains', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);
  const domains = await DomainOperations.getAllForSuperAdminWithPagination({
    keyword: '',
    domainStatus: 'all',
    page: 1,
    pageSize: 1000,
  });

  // 过滤用户有权限的域名
  const accessible = (domains.list as any[]).filter((d: any) => {
    if (isSuper(role) || d.created_by === userId) return true;
    return false;
  });

  sendSuccess(res, accessible.map((d: any) => ({ id: d.id, name: d.name })));
}));

/**
 * POST /api/servicemonitor - 创建监控
 */
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { name, type, target, domainId, config, checkInterval, checkTimeout, enabled, notifyOnFailure, notifyOnRecovery } = req.body;

  if (!name || !type || !target) {
    sendError(res, 'name, type and target are required', 400);
    return;
  }

  if (!['ssl_certificate', 'endpoint', 'dns_failover'].includes(type)) {
    sendError(res, 'Invalid type. Must be one of: ssl_certificate, endpoint, dns_failover', 400);
    return;
  }

  if (type === 'dns_failover' && domainId) {
    const access = await getDomainAccess(domainId, userId, normalizeRole(req.user!.role));
    if (!access.canWrite) {
      sendError(res, 'No write permission for the specified domain', 403);
      return;
    }
  }

  const id = await createMonitor({
    userId,
    name,
    type,
    target,
    domainId,
    config: config || {},
    checkInterval,
    checkTimeout,
    enabled,
    notifyOnFailure,
    notifyOnRecovery,
  });

  log.info(`ServiceMonitor monitor created: ${id}`, { userId, name, type, target });
  sendSuccess(res, { id });
}));

/**
 * GET /api/servicemonitor/:id - 获取单个监控
 */
router.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const monitorId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const monitor = await getMonitor(monitorId);

  if (!monitor) {
    sendError(res, 'Monitor not found', 404);
    return;
  }

  if (monitor.userId !== req.user!.userId && !isSuper(normalizeRole(req.user!.role))) {
    sendError(res, 'No permission', 403);
    return;
  }

  sendSuccess(res, monitor);
}));

/**
 * PUT /api/servicemonitor/:id - 更新监控
 */
router.put('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const monitorId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const existing = await getMonitor(monitorId);

  if (!existing) {
    sendError(res, 'Monitor not found', 404);
    return;
  }

  if (existing.userId !== req.user!.userId && !isSuper(normalizeRole(req.user!.role))) {
    sendError(res, 'No permission', 403);
    return;
  }

  const { name, type, target, domainId, config, checkInterval, checkTimeout, enabled, notifyOnFailure, notifyOnRecovery } = req.body;

  await updateMonitor(monitorId, {
    name, type, target, domainId,
    config, checkInterval, checkTimeout, enabled, notifyOnFailure, notifyOnRecovery,
  });

  log.info(`ServiceMonitor monitor updated: ${monitorId}`, { userId: req.user!.userId });
  sendSuccess(res, { id: monitorId });
}));

/**
 * DELETE /api/servicemonitor/:id - 删除监控
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const monitorId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const existing = await getMonitor(monitorId);

  if (!existing) {
    sendError(res, 'Monitor not found', 404);
    return;
  }

  if (existing.userId !== req.user!.userId && !isSuper(normalizeRole(req.user!.role))) {
    sendError(res, 'No permission', 403);
    return;
  }

  await deleteMonitor(monitorId);

  log.info(`ServiceMonitor monitor deleted: ${monitorId}`, { userId: req.user!.userId });
  sendSuccess(res, { id: monitorId });
}));

/**
 * POST /api/servicemonitor/:id/check - 手动触发检查
 */
router.post('/:id/check', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const monitorId = parseInteger(req.params.id, { min: 1 }) ?? 0;
  const existing = await getMonitor(monitorId);

  if (!existing) {
    sendError(res, 'Monitor not found', 404);
    return;
  }

  if (existing.userId !== req.user!.userId && !isSuper(normalizeRole(req.user!.role))) {
    sendError(res, 'No permission', 403);
    return;
  }

  // 执行检查
  const { status, responseTime, error, resultData } = await performCheck(existing);

  // 更新状态
  await runCheckAndUpdate(existing);

  sendSuccess(res, {
    monitorId,
    status,
    responseTime,
    error,
    resultData,
  });
}));

export default router;
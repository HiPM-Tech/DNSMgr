/**
 * NS Monitor Routes
 * NS 监测路由 - 新架构（用户级）
 */

import { Router, Request, Response } from 'express';
import { NSMonitorOperations, DomainOperations, getDbType, formatDateForDB } from '../db/business-adapter';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { log } from '../lib/logger';
import { normalizeRole, isSuper, isAdmin } from '../utils/roles';
import { resolveNsRecords } from '../lib/dns/ns-lookup';
import { getDomainAccess } from './domains';

const router = Router();

/** 将布尔值转换为数据库特定的布尔类型 */
function toDbBoolean(value: boolean, dbType: string): boolean | number {
  return dbType === 'postgresql' ? value : value ? 1 : 0;
}

// ============================================================================
// 用户 NS 监测偏好设置
// ============================================================================

/**
 * @swagger
 * /api/ns-monitor/user/prefs:
 *   get:
 *     summary: Get user's NS monitor preferences
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's NS monitor preferences
 */
router.get('/user/prefs', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const prefs = await NSMonitorOperations.getUserPrefs(userId);

  res.json({
    success: true,
    data: prefs || {
      user_id: userId,
      notify_email: true,
      notify_channels: true,
      check_interval: 3600,
    },
  });
}));

/**
 * @swagger
 * /api/ns-monitor/user/prefs:
 *   put:
 *     summary: Update user's NS monitor preferences
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 */
router.put('/user/prefs', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);
  const { notify_email, notify_channels, check_interval } = req.body;

  const updates: Record<string, unknown> = {};
  const dbType = getDbType();

  // check_interval 所有用户都可以修改
  if (check_interval !== undefined) {
    updates.check_interval = check_interval;
  }

  // notify_email 所有用户都可以修改（邮件发送至用户自己的邮箱）
  if (notify_email !== undefined) {
    updates.notify_email = toDbBoolean(notify_email, dbType);
  }

  // notify_channels 只有管理员可以修改
  if (isAdmin(role) || isSuper(role)) {
    if (notify_channels !== undefined) {
      updates.notify_channels = toDbBoolean(notify_channels, dbType);
    }
  } else if (notify_channels !== undefined) {
    log.warn('NSMonitor', 'Non-admin user attempted to modify notification channels', {
      userId,
      role,
    });
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ success: false, error: 'No valid fields to update' });
    return;
  }

  const existing = await NSMonitorOperations.getUserPrefs(userId);

  if (existing) {
    await NSMonitorOperations.updateUserPrefs(userId, updates);
  } else {
    await NSMonitorOperations.createUserPrefs(userId, {
      notify_email: toDbBoolean(true, dbType),
      notify_channels: toDbBoolean(true, dbType),
      check_interval: 3600,
      ...updates,
    });
  }

  log.info('NSMonitor', 'User preferences updated', { userId, updates });
  res.json({ success: true, msg: 'Preferences updated successfully' });
}));

// ============================================================================
// 域名监测列表
// ============================================================================

/**
 * @swagger
 * /api/ns-monitor:
 *   get:
 *     summary: List user's NS monitor configurations
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const monitors = await NSMonitorOperations.getUserMonitors(userId);

  res.json({
    success: true,
    data: monitors,
  });
}));

/**
 * @swagger
 * /api/ns-monitor/{id}:
 *   get:
 *     summary: Get NS monitor configuration by ID
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const monitor = await NSMonitorOperations.getById(parseInt(id), userId);
  if (!monitor) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }

  res.json({
    success: true,
    data: monitor,
  });
}));

/**
 * @swagger
 * /api/ns-monitor:
 *   post:
 *     summary: Create NS monitor configuration
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { domain_id, expected_ns, enabled } = req.body;
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  if (!domain_id) {
    res.status(400).json({ success: false, error: 'domain_id is required' });
    return;
  }

  // Check permission
  if (!isSuper(role)) {
    const access = await getDomainAccess(domain_id, userId, role);
    if (!access.canWrite) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }
  }

  // Check if already exists
  const existing = await NSMonitorOperations.getByDomain(userId, domain_id);
  if (existing) {
    res.status(409).json({ success: false, error: 'Monitor already exists for this domain' });
    return;
  }

  // Auto-fetch expected NS if not provided
  let finalExpectedNs = expected_ns || '';
  if (!finalExpectedNs) {
    try {
      const domain = await DomainOperations.getById(domain_id);
      if (domain && domain.name) {
        const currentNs = await resolveNsRecords(domain.name as string);
        if (currentNs.length > 0) {
          finalExpectedNs = currentNs.join(', ');
          log.info('NSMonitor', 'Auto-filled expected NS', {
            domainId: domain_id,
            domainName: domain.name,
            nsRecords: currentNs,
          });
        }
      }
    } catch (error) {
      log.warn('NSMonitor', 'Failed to auto-fetch NS records', { domainId: domain_id, error });
    }
  }

  const id = await NSMonitorOperations.create({
    user_id: userId,
    domain_id,
    expected_ns: finalExpectedNs,
  });

  log.info('NSMonitor', 'Monitor created', { domainId: domain_id, userId, monitorId: id });

  res.json({
    success: true,
    data: { id },
  });
}));

/**
 * @swagger
 * /api/ns-monitor/{id}:
 *   put:
 *     summary: Update NS monitor configuration
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { expected_ns, enabled } = req.body;
  const userId = req.user!.userId;
  const dbType = getDbType();

  const monitor = await NSMonitorOperations.getById(parseInt(id), userId);
  if (!monitor) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (expected_ns !== undefined) updates.expected_ns = expected_ns;
  if (enabled !== undefined) updates.enabled = toDbBoolean(enabled, dbType);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ success: false, error: 'No fields to update' });
    return;
  }

  await NSMonitorOperations.update(parseInt(id), userId, updates);

  log.info('NSMonitor', 'Monitor updated', { monitorId: id, userId, updates });
  res.json({ success: true });
}));

/**
 * @swagger
 * /api/ns-monitor/{id}:
 *   delete:
 *     summary: Delete NS monitor configuration
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const monitor = await NSMonitorOperations.getById(parseInt(id), userId);
  if (!monitor) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }

  await NSMonitorOperations.delete(parseInt(id), userId);

  log.info('NSMonitor', 'Monitor deleted', { monitorId: id, userId });
  res.json({ success: true });
}));

/**
 * @swagger
 * /api/ns-monitor/{id}/check:
 *   post:
 *     summary: Manually trigger NS check
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/check', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;

  const monitor = await NSMonitorOperations.getById(parseInt(id), userId);
  if (!monitor) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }

  const domain = await DomainOperations.getById(monitor.domain_id as number);
  if (!domain) {
    res.status(404).json({ success: false, error: 'Domain not found' });
    return;
  }

  // Query current NS records
  const currentNs = await resolveNsRecords(domain.name as string);
  const currentNsStr = currentNs.join(', ');

  // Check against expected
  const expectedNs = (monitor.expected_ns as string) || '';
  let status = 'ok';

  if (expectedNs && currentNs.length > 0) {
    const expectedList = expectedNs.split(',').map(s => s.trim()).filter(Boolean);
    const hasMismatch = expectedList.length > 0 && !expectedList.every(ns => currentNs.includes(ns));
    if (hasMismatch) {
      status = 'mismatch';
    }
  } else if (currentNs.length === 0) {
    status = 'missing';
  }

  // Update status
  await NSMonitorOperations.updateStatus(parseInt(id), {
    current_ns: currentNsStr,
    status,
    last_check_at: formatDateForDB(new Date()),
  });

  log.info('NSMonitor', 'Manual check completed', { monitorId: id, domainId: monitor.domain_id, status });

  res.json({
    success: true,
    data: {
      current_ns: currentNs,
      expected_ns: expectedNs.split(',').map(s => s.trim()).filter(Boolean),
      status,
    },
  });
}));

export default router;

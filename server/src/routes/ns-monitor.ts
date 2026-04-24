/**
 * NS Monitor Routes
 * NS 监测路由
 */

import { Router, Request, Response } from 'express';
import { NSMonitorOperations, DomainOperations, getDbType, formatDateForDB } from '../db/business-adapter';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { log } from '../lib/logger';
import { normalizeRole, isSuper } from '../utils/roles';
import { resolveNsRecords } from '../lib/dns/ns-lookup';
import { getDomainAccess } from './domains';

const router = Router();

/** 将布尔值转换为数据库特定的布尔类型 */
function toDbBoolean(value: boolean, dbType: string): boolean | number {
  return dbType === 'postgresql' ? value : value ? 1 : 0;
}

/**
 * @swagger
 * /api/ns-monitor:
 *   get:
 *     summary: List all NS monitor configurations
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of NS monitor configurations
 */
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  const configs = await NSMonitorOperations.getAllWithDomain(userId, isSuper(role));

  res.json({
    success: true,
    data: configs,
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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: NS monitor configuration details
 */
router.get('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  const config = await NSMonitorOperations.getById(parseInt(id));
  if (!config) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }

  // Check permission
  if (!isSuper(role)) {
    const access = await getDomainAccess(config.domain_id as number, userId, role);
    if (!access.canRead) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }
  }

  // Get alerts history
  const alerts = await NSMonitorOperations.getAlertsByConfig(parseInt(id), 10);

  res.json({
    success: true,
    data: { ...config, alerts },
  });
}));

/**
 * @swagger
 * /api/ns-monitor/domain/{domainId}:
 *   get:
 *     summary: Get NS monitor configuration by domain ID
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: domainId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: NS monitor configuration for domain
 */
router.get('/domain/:domainId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { domainId } = req.params;
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  // Check permission
  if (!isSuper(role)) {
    const access = await getDomainAccess(parseInt(domainId), userId, role);
    if (!access.canRead) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }
  }

  const config = await NSMonitorOperations.getByDomain(parseInt(domainId));
  if (!config) {
    res.json({ success: true, data: null });
    return;
  }

  // Get status
  const status = await NSMonitorOperations.getStatus(config.id as number);

  res.json({
    success: true,
    data: { ...config, status },
  });
}));

/**
 * @swagger
 * /api/ns-monitor:
 *   post:
 *     summary: Create or update NS monitor configuration
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domain_id:
 *                 type: integer
 *               expected_ns:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *               notify_email:
 *                 type: boolean
 *               notify_channels:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Configuration created/updated successfully
 */
router.post('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { domain_id, expected_ns, enabled, notify_email, notify_channels } = req.body;
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

  // Check if configuration exists
  const existing = await NSMonitorOperations.getByDomain(domain_id);

  const dbType = getDbType();

  // 自动获取当前 NS 记录作为预期值（如果用户未提供）
  let finalExpectedNs = expected_ns || '';
  if (!finalExpectedNs) {
    try {
      const domain = await DomainOperations.getById(domain_id);
      if (domain && domain.name) {
        const currentNs = await resolveNsRecords(domain.name as string);
        if (currentNs.length > 0) {
          finalExpectedNs = currentNs.join(', ');
          log.info('NSMonitor', 'Auto-filled expected NS from current records', {
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

  if (existing) {
    // Update existing
    await NSMonitorOperations.update(existing.id as number, {
      expected_ns: finalExpectedNs,
      enabled: toDbBoolean(enabled, dbType),
      notify_email: toDbBoolean(notify_email, dbType),
      notify_channels: toDbBoolean(notify_channels, dbType),
    });

    log.info('NSMonitor', 'Configuration updated', { domainId: domain_id, userId });

    res.json({
      success: true,
      data: { id: existing.id },
    });
  } else {
    // Create new
    const id = await NSMonitorOperations.create({
      domain_id,
      expected_ns: finalExpectedNs,
      enabled: toDbBoolean(enabled, dbType),
      notify_email: toDbBoolean(notify_email, dbType),
      notify_channels: toDbBoolean(notify_channels, dbType),
      created_by: userId,
    });

    // Initialize status
    await NSMonitorOperations.initStatus(id, '');

    log.info('NSMonitor', 'Configuration created', { domainId: domain_id, userId, configId: id });

    res.json({
      success: true,
      data: { id },
    });
  }
}));

/**
 * @swagger
 * /api/ns-monitor/{id}/check:
 *   post:
 *     summary: Manually trigger NS check for a domain
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: NS check completed
 */
router.post('/:id/check', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  const config = await NSMonitorOperations.getById(parseInt(id));
  if (!config) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }

  // Check permission
  if (!isSuper(role)) {
    const access = await getDomainAccess(config.domain_id as number, userId, role);
    if (!access.canWrite) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }
  }

  // Get domain name
  const domain = await DomainOperations.getById(config.domain_id as number);
  if (!domain) {
    res.status(404).json({ success: false, error: 'Domain not found' });
    return;
  }

  // Query current NS records
  const currentNs = await resolveNsRecords(domain.name as string);
  const currentNsStr = currentNs.join(', ');

  // Check against expected
  const expectedNs = (config.expected_ns as string) || '';
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
  const now = new Date();

  await NSMonitorOperations.updateStatus(parseInt(id), {
    current_ns: currentNsStr,
    status,
    last_check_at: formatDateForDB(now),
  });

  log.info('NSMonitor', 'Manual check completed', { domainId: config.domain_id, status, userId });

  res.json({
    success: true,
    data: {
      current_ns: currentNs,
      expected_ns: expectedNs.split(',').map(s => s.trim()).filter(Boolean),
      status,
    },
  });
}));

/**
 * @swagger
 * /api/ns-monitor/{id}:
 *   delete:
 *     summary: Delete NS monitor configuration
 *     tags: [NS Monitor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Configuration deleted successfully
 */
router.delete('/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = req.user!.userId;
  const role = normalizeRole(req.user!.role);

  const config = await NSMonitorOperations.getById(parseInt(id));
  if (!config) {
    res.status(404).json({ success: false, error: 'Configuration not found' });
    return;
  }

  // Check permission
  if (!isSuper(role)) {
    const access = await getDomainAccess(config.domain_id as number, userId, role);
    if (!access.canWrite) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }
  }

  await NSMonitorOperations.delete(parseInt(id));

  log.info('NSMonitor', 'Configuration deleted', { configId: id, userId });

  res.json({ success: true });
}));

export default router;

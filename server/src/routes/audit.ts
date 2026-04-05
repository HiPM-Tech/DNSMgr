import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import {
  AuditLogEntry,
  AuditLogFilters,
  getAuditLogs,
  exportAuditLogsAsCSV,
  exportAuditLogsAsJSON,
  detectAnomalies,
  getUserActionStats,
  getActionTimeDistribution,
} from '../service/auditExport';
import { getString, parseInteger, parsePagination, sendSuccess } from '../utils/http';

const router = Router();

function getAuditFilters(query: Request['query']): AuditLogFilters {
  return {
    domain: getString(query.domain),
    userId: parseInteger(query.userId),
    action: getString(query.action),
    startDate: getString(query.startDate),
    endDate: getString(query.endDate),
  };
}

function toLegacyAuditLog(log: AuditLogEntry) {
  return {
    id: log.id,
    user_id: log.userId,
    username: log.username,
    nickname: log.nickname,
    action: log.action,
    domain: log.domain,
    data: JSON.stringify(log.data),
    created_at: log.createdAt,
  };
}

/**
 * @swagger
 * /api/audit/logs:
 *   get:
 *     summary: 获取审计日志
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 审计日志列表
 */
router.get(
  '/logs',
  authMiddleware,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const { page, pageSize } = parsePagination(req.query, { defaultPageSize: 50, maxPageSize: 200 });
    const { total, logs } = await getAuditLogs(page, pageSize, getAuditFilters(req.query));

    sendSuccess(res, { total, list: logs.map(toLegacyAuditLog) });
  })
);

/**
 * @swagger
 * /api/audit/export/csv:
 *   get:
 *     summary: 导出审计日志为 CSV
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV 文件
 */
router.get(
  '/export/csv',
  authMiddleware,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const csv = await exportAuditLogsAsCSV(getAuditFilters(req.query));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  })
);

/**
 * @swagger
 * /api/audit/export/json:
 *   get:
 *     summary: 导出审计日志为 JSON
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: domain
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: JSON 文件
 */
router.get(
  '/export/json',
  authMiddleware,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const json = await exportAuditLogsAsJSON(getAuditFilters(req.query));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(json);
  })
);

/**
 * @swagger
 * /api/audit/anomalies/{userId}:
 *   get:
 *     summary: 检测用户异常操作
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: timeWindow
 *         schema:
 *           type: integer
 *           default: 60
 *           description: 时间窗口（分钟）
 *     responses:
 *       200:
 *         description: 异常操作列表
 */
router.get(
  '/anomalies/:userId',
  authMiddleware,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInteger(req.params.userId, { min: 1 });
    const timeWindow = parseInteger(req.query.timeWindow, { defaultValue: 60, min: 1, max: 1440 }) ?? 60;

    const anomalies = await detectAnomalies(userId ?? 0, timeWindow);
    sendSuccess(res, { anomalies });
  })
);

/**
 * @swagger
 * /api/audit/stats/{userId}:
 *   get:
 *     summary: 获取用户操作统计
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: 操作统计
 */
router.get(
  '/stats/:userId',
  authMiddleware,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInteger(req.params.userId, { min: 1 });
    const days = parseInteger(req.query.days, { defaultValue: 7, min: 1, max: 365 }) ?? 7;

    const stats = await getUserActionStats(userId ?? 0, days);
    sendSuccess(res, stats);
  })
);

/**
 * @swagger
 * /api/audit/time-distribution/{userId}:
 *   get:
 *     summary: 获取操作时间分布
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *     responses:
 *       200:
 *         description: 时间分布
 */
router.get(
  '/time-distribution/:userId',
  authMiddleware,
  adminOnly,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = parseInteger(req.params.userId, { min: 1 });
    const days = parseInteger(req.query.days, { defaultValue: 7, min: 1, max: 365 }) ?? 7;

    const distribution = await getActionTimeDistribution(userId ?? 0, days);
    sendSuccess(res, distribution);
  })
);

export default router;

import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ResponseHelper } from '../utils/response';
import {
  getAuditLogs,
  exportAuditLogsAsCSV,
  exportAuditLogsAsJSON,
  detectAnomalies,
  getUserActionStats,
  getActionTimeDistribution,
} from '../service/auditExport';

const router = Router();

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
    const { page = '1', pageSize = '50', domain, userId, action, startDate, endDate } = req.query;

    const { total, logs } = await getAuditLogs(parseInt(page as string), parseInt(pageSize as string), {
      domain: domain as string,
      userId: userId ? parseInt(userId as string) : undefined,
      action: action as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    ResponseHelper.paginated(
      res,
      logs,
      total,
      parseInt(page as string),
      parseInt(pageSize as string)
    );
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
    const { domain, userId, action, startDate, endDate } = req.query;

    const csv = await exportAuditLogsAsCSV({
      domain: domain as string,
      userId: userId ? parseInt(userId as string) : undefined,
      action: action as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

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
    const { domain, userId, action, startDate, endDate } = req.query;

    const json = await exportAuditLogsAsJSON({
      domain: domain as string,
      userId: userId ? parseInt(userId as string) : undefined,
      action: action as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

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
    const { userId } = req.params;
    const { timeWindow = '60' } = req.query;

    const anomalies = await detectAnomalies(parseInt(userId), parseInt(timeWindow as string));
    ResponseHelper.success(res, { anomalies });
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
    const { userId } = req.params;
    const { days = '7' } = req.query;

    const stats = await getUserActionStats(parseInt(userId), parseInt(days as string));
    ResponseHelper.success(res, stats);
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
    const { userId } = req.params;
    const { days = '7' } = req.query;

    const distribution = await getActionTimeDistribution(parseInt(userId), parseInt(days as string));
    ResponseHelper.success(res, distribution);
  })
);

export default router;

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { ResponseHelper } from '../utils/response';
import {
  getAvailableTemplates,
  getEmailTemplate,
  detectConflicts,
  generatePreview,
} from '../service/emailTemplate';

const router = Router();

/**
 * @swagger
 * /api/email-templates:
 *   get:
 *     summary: 获取所有可用的邮件模板
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 邮件模板列表
 */
router.get(
  '/',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const templates = getAvailableTemplates();
    ResponseHelper.success(res, templates);
  })
);

/**
 * @swagger
 * /api/email-templates/{templateId}:
 *   get:
 *     summary: 获取邮件模板详情
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 邮件模板详情
 */
router.get(
  '/:templateId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const template = getEmailTemplate(templateId);

    if (!template) {
      ResponseHelper.notFound(res, 'Template not found');
      return;
    }

    ResponseHelper.success(res, template);
  })
);

/**
 * @swagger
 * /api/email-templates/{templateId}/preview:
 *   get:
 *     summary: 获取邮件模板预览
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: domain
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 模板预览
 */
router.get(
  '/:templateId/preview',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const { domain } = req.query;

    if (!domain) {
      ResponseHelper.badRequest(res, 'Domain is required');
      return;
    }

    const preview = generatePreview(templateId, domain as string);
    ResponseHelper.success(res, { preview });
  })
);

/**
 * @swagger
 * /api/email-templates/{templateId}/check-conflicts:
 *   post:
 *     summary: 检查邮件模板与现有记录的冲突
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               existingRecords:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: 冲突检查结果
 */
router.post(
  '/:templateId/check-conflicts',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const { existingRecords } = req.body as { existingRecords: any[] };

    const template = getEmailTemplate(templateId);
    if (!template) {
      ResponseHelper.notFound(res, 'Template not found');
      return;
    }

    const conflicts = detectConflicts(existingRecords || [], template.records);
    ResponseHelper.success(res, { conflicts, hasConflicts: conflicts.length > 0 });
  })
);

/**
 * @swagger
 * /api/email-templates/{templateId}/apply:
 *   post:
 *     summary: 应用邮件模板（添加记录）
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               domainId:
 *                 type: integer
 *               skipConflicts:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 应用结果
 */
router.post(
  '/:templateId/apply',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { templateId } = req.params;
    const { domainId, skipConflicts } = req.body as { domainId: number; skipConflicts?: boolean };

    const template = getEmailTemplate(templateId);
    if (!template) {
      ResponseHelper.notFound(res, 'Template not found');
      return;
    }

    // 获取现有记录 - 注意：dns_records 表不存在，此功能需要重新实现
    // const existingRecords = await db.query(
    //   'SELECT * FROM dns_records WHERE domain_id = ?',
    //   [domainId]
    // );
    const existingRecords: any[] = [];

    // 检查冲突
    const conflicts = detectConflicts(existingRecords, template.records);
    if (conflicts.length > 0 && !skipConflicts) {
      ResponseHelper.conflict(res, 'Conflicts detected', { conflicts });
      return;
    }

    // 添加记录
    const addedRecords = [];
    const failedRecords = [];

    for (const record of template.records) {
      try {
        // 检查是否已存在
        const existing = existingRecords.find(
          (r: any) => (r.name || '@') === (record.name || '@') && r.type === record.type
        );

        if (existing && !skipConflicts) {
          failedRecords.push({
            ...record,
            error: 'Record already exists',
          });
          continue;
        }

        // 添加记录（这里需要调用实际的 DNS API）
        // 这是一个占位符实现
        addedRecords.push(record);
      } catch (error) {
        failedRecords.push({
          ...record,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    ResponseHelper.success(res, {
      template: template.name,
      addedCount: addedRecords.length,
      failedCount: failedRecords.length,
      addedRecords,
      failedRecords,
    });
  })
);

export default router;

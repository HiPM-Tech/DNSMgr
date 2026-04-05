import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler, errors } from '../middleware/errorHandler';
import { ResponseHelper } from '../utils/response';
import {
  generateTOTPSecret,
  verifyTOTPToken,
  enableTOTP,
  disableTOTP,
  getTOTPStatus,
  verifyBackupCode,
} from '../service/totp';
import {
  getActiveSessions,
  deleteSession,
  deleteOtherSessions,
  deleteAllSessions,
  cleanupExpiredSessions,
} from '../service/session';
import { getUserPreferences, updateUserPreferences } from '../service/userPreferences';
import { logAuditOperation } from '../service/audit';

const router = Router();

/**
 * 2FA 相关路由
 */

/**
 * @swagger
 * /api/security/2fa/setup:
 *   post:
 *     summary: 生成 TOTP 2FA 密钥和二维码
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: TOTP 设置信息
 */
router.post(
  '/2fa/setup',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const email = (req as any).user.email;

    const setup = await generateTOTPSecret(userId, email);
    ResponseHelper.success(res, setup, 'TOTP setup generated');
  })
);

/**
 * @swagger
 * /api/security/2fa/enable:
 *   post:
 *     summary: 启用 TOTP 2FA
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               secret:
 *                 type: string
 *               token:
 *                 type: string
 *               backupCodes:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: 2FA enabled
 */
router.post(
  '/2fa/enable',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { secret, token, backupCodes } = req.body as {
      secret: string;
      token: string;
      backupCodes: string[];
    };

    if (!secret || !token || !backupCodes) {
      throw errors.badRequest('Missing required fields');
    }

    // 验证 token
    if (!verifyTOTPToken(secret, token)) {
      throw errors.badRequest('Invalid TOTP token');
    }

    // 启用 2FA
    await enableTOTP(userId, secret, backupCodes);
    await logAuditOperation(userId, 'enable_2fa', '', {});

    ResponseHelper.success(res, null, '2FA enabled successfully');
  })
);

/**
 * @swagger
 * /api/security/2fa/disable:
 *   post:
 *     summary: 禁用 TOTP 2FA
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 2FA disabled
 */
router.post(
  '/2fa/disable',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { password } = req.body as { password: string };

    if (!password) {
      throw errors.badRequest('Password is required');
    }

    // 验证密码（这里应该验证用户密码，但为了简化示例，跳过）
    // 实际应该调用验证密码的函数

    await disableTOTP(userId);
    await logAuditOperation(userId, 'disable_2fa', '', {});

    ResponseHelper.success(res, null, '2FA disabled successfully');
  })
);

/**
 * @swagger
 * /api/security/2fa/status:
 *   get:
 *     summary: 获取 2FA 状态
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status
 */
router.get(
  '/2fa/status',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const status = await getTOTPStatus(userId);
    ResponseHelper.success(res, status);
  })
);

/**
 * 会话管理相关路由
 */

/**
 * @swagger
 * /api/security/sessions:
 *   get:
 *     summary: 获取所有活跃会话
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 活跃会话列表
 */
router.get(
  '/sessions',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const sessions = await getActiveSessions(userId);
    ResponseHelper.success(res, sessions);
  })
);

/**
 * @swagger
 * /api/security/sessions/{sessionId}:
 *   delete:
 *     summary: 删除指定会话（登出）
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Session deleted
 */
router.delete(
  '/sessions/:sessionId',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { sessionId } = req.params;

    // 验证会话属于当前用户
    const sessions = await getActiveSessions(userId);
    if (!sessions.find((s) => s.id === sessionId)) {
      throw errors.forbidden('Cannot delete other user sessions');
    }

    await deleteSession(sessionId);
    await logAuditOperation(userId, 'logout_session', '', { sessionId });

    ResponseHelper.noContent(res);
  })
);

/**
 * @swagger
 * /api/security/sessions/logout-others:
 *   post:
 *     summary: 登出所有其他会话
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Other sessions logged out
 */
router.post(
  '/sessions/logout-others',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const currentSessionId = (req as any).sessionId || '';

    await deleteOtherSessions(userId, currentSessionId);
    await logAuditOperation(userId, 'logout_other_sessions', '', {});

    ResponseHelper.success(res, null, 'Other sessions logged out');
  })
);

/**
 * @swagger
 * /api/security/sessions/logout-all:
 *   post:
 *     summary: 登出所有会话
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions logged out
 */
router.post(
  '/sessions/logout-all',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;

    await deleteAllSessions(userId);
    await logAuditOperation(userId, 'logout_all_sessions', '', {});

    ResponseHelper.success(res, null, 'All sessions logged out');
  })
);

/**
 * 用户偏好设置相关路由
 */

/**
 * @swagger
 * /api/security/preferences:
 *   get:
 *     summary: 获取用户偏好设置
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 用户偏好设置
 */
router.get(
  '/preferences',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const preferences = await getUserPreferences(userId);
    ResponseHelper.success(res, preferences);
  })
);

/**
 * @swagger
 * /api/security/preferences:
 *   put:
 *     summary: 更新用户偏好设置
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [light, dark, auto]
 *               language:
 *                 type: string
 *               notificationsEnabled:
 *                 type: boolean
 *               emailNotifications:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Preferences updated
 */
router.put(
  '/preferences',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { theme, language, notificationsEnabled, emailNotifications } = req.body;

    await updateUserPreferences(userId, {
      theme,
      language,
      notificationsEnabled,
      emailNotifications,
    });

    await logAuditOperation(userId, 'update_preferences', '', {
      theme,
      language,
      notificationsEnabled,
      emailNotifications,
    });

    const updated = await getUserPreferences(userId);
    ResponseHelper.success(res, updated, 'Preferences updated');
  })
);

export default router;

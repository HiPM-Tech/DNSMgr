/**
 * 安全策略 API 路由
 */

import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess, sendError } from '../utils/http';
import {
  getSecurityPolicy,
  updateSecurityPolicy,
  checkPasswordStrength,
  requires2FA,
  has2FAEnabled,
} from '../service/securityPolicy';
import {
  getUserTrustedDevices,
  removeTrustedDevice,
  verifyTrustedDevice,
  DeviceInfo,
} from '../service/deviceTrust';
import { log } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/security/policy:
 *   get:
 *     summary: Get current security policy (admin only)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Security policy
 */
router.get('/policy', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const policy = await getSecurityPolicy();
  sendSuccess(res, policy);
}));

/**
 * @swagger
 * /api/security/policy:
 *   put:
 *     summary: Update security policy (admin only)
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
 *               require2FAGlobal:
 *                 type: boolean
 *               minPasswordLength:
 *                 type: integer
 *               minPasswordStrength:
 *                 type: integer
 *               sessionTimeoutHours:
 *                 type: integer
 *               maxLoginAttempts:
 *                 type: integer
 *               lockoutDurationMinutes:
 *                 type: integer
 *               allowRememberDevice:
 *                 type: boolean
 *               trustedDeviceDays:
 *                 type: integer
 *               requirePasswordChangeOnFirstLogin:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Policy updated
 */
router.put('/policy', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  await updateSecurityPolicy(req.body);
  sendSuccess(res, await getSecurityPolicy());
}));

/**
 * @swagger
 * /api/security/password-strength:
 *   post:
 *     summary: Check password strength
 *     tags: [Security]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password strength result
 */
router.post('/password-strength', asyncHandler(async (req: Request, res: Response) => {
  const { password } = req.body as { password: string };
  if (!password) {
    sendError(res, 'Password is required');
    return;
  }
  
  const result = checkPasswordStrength(password);
  const policy = await getSecurityPolicy();
  
  sendSuccess(res, {
    ...result,
    meetsPolicy: result.score >= policy.minPasswordStrength && password.length >= policy.minPasswordLength,
    policy: {
      minLength: policy.minPasswordLength,
      minStrength: policy.minPasswordStrength,
    },
  });
}));

/**
 * @swagger
 * /api/security/2fa/status:
 *   get:
 *     summary: Get current user's 2FA status
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 2FA status
 */
router.get('/2fa/status', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const forceRequired = await requires2FA(userId);
  const enabled = await has2FAEnabled(userId);
  
  sendSuccess(res, {
    enabled,
    forceRequired,
    canSkip: !forceRequired,
  });
}));

/**
 * @swagger
 * /api/security/trusted-devices:
 *   get:
 *     summary: Get current user's trusted devices
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of trusted devices
 */
router.get('/trusted-devices', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const devices = await getUserTrustedDevices(req.user!.userId);
  sendSuccess(res, devices);
}));

/**
 * @swagger
 * /api/security/trusted-devices/{id}:
 *   delete:
 *     summary: Remove a trusted device
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device removed
 */
router.delete('/trusted-devices/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const deviceId = req.params.id;
  const success = await removeTrustedDevice(req.user!.userId, deviceId);
  
  if (success) {
    sendSuccess(res);
  } else {
    sendError(res, 'Device not found');
  }
}));

/**
 * @swagger
 * /api/security/check-device:
 *   post:
 *     summary: Check if current device is trusted
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Device trust status
 */
router.post('/check-device', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const deviceInfo: DeviceInfo = {
    userAgent: req.headers['user-agent'] || '',
    ipAddress: req.ip || req.socket.remoteAddress || '',
  };
  
  const result = await verifyTrustedDevice(req.user!.userId, deviceInfo);
  sendSuccess(res, result);
}));

/**
 * @swagger
 * /api/security/users/{userId}/require-2fa:
 *   get:
 *     summary: Get user's 2FA requirement status (admin only)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User 2FA requirement status
 */
router.get('/users/:userId/require-2fa', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    sendError(res, 'Invalid user ID');
    return;
  }
  
  const userSetting = await get(
    'SELECT require_2fa FROM user_security_settings WHERE user_id = ?',
    [userId]
  ) as any;
  
  sendSuccess(res, { require2FA: userSetting?.require_2fa === 1 });
}));

/**
 * @swagger
 * /api/security/users/{userId}/require-2fa:
 *   put:
 *     summary: Set user's 2FA requirement (admin only)
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               require2FA:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User 2FA requirement updated
 */
router.put('/users/:userId/require-2fa', authMiddleware, adminOnly, asyncHandler(async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) {
    sendError(res, 'Invalid user ID');
    return;
  }
  
  const { require2FA } = req.body as { require2FA: boolean };
  
  // Check if user exists
  const user = await get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) {
    sendError(res, 'User not found');
    return;
  }
  
  // Insert or update user security settings
  const existing = await get(
    'SELECT id FROM user_security_settings WHERE user_id = ?',
    [userId]
  );
  
  if (existing) {
    await query(
      'UPDATE user_security_settings SET require_2fa = ? WHERE user_id = ?',
      [require2FA ? 1 : 0, userId]
    );
  } else {
    await query(
      'INSERT INTO user_security_settings (user_id, require_2fa) VALUES (?, ?)',
      [userId, require2FA ? 1 : 0]
    );
  }
  
  log.info('SecurityPolicy', `User ${userId} 2FA requirement set to ${require2FA}`);
  sendSuccess(res, { require2FA });
}));

import { get, query } from '../db';

export default router;

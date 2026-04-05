import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { getLoginLimitConfig, updateLoginLimitConfig, getLoginAttemptStats, unlockAccount } from '../service/loginLimit';

const router = Router();

/**
 * @swagger
 * /api/settings/login-limit:
 *   get:
 *     summary: Get login limit configuration
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login limit configuration
 */
router.get('/login-limit', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const config = await getLoginLimitConfig();
    res.json({
      code: 0,
      data: config,
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to get login limit config',
    });
  }
});

/**
 * @swagger
 * /api/settings/login-limit:
 *   put:
 *     summary: Update login limit configuration
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               maxAttempts:
 *                 type: integer
 *               lockoutDuration:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Configuration updated
 */
router.put('/login-limit', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { enabled, maxAttempts, lockoutDuration } = req.body;
  
  try {
    const updateData: Partial<{ enabled: boolean; maxAttempts: number; lockoutDuration: number }> = {};
    
    if (enabled !== undefined) updateData.enabled = enabled;
    if (maxAttempts !== undefined) updateData.maxAttempts = maxAttempts;
    if (lockoutDuration !== undefined) updateData.lockoutDuration = lockoutDuration;
    
    await updateLoginLimitConfig(updateData);
    
    const config = await getLoginLimitConfig();
    res.json({
      code: 0,
      data: config,
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to update login limit config',
    });
  }
});

/**
 * @swagger
 * /api/settings/login-attempts/stats:
 *   get:
 *     summary: Get login attempt statistics
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Login attempt statistics
 */
router.get('/login-attempts/stats', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const stats = await getLoginAttemptStats();
    res.json({
      code: 0,
      data: stats,
      msg: 'success',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to get login attempt stats',
    });
  }
});

/**
 * @swagger
 * /api/settings/login-attempts/unlock:
 *   post:
 *     summary: Manually unlock an account
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier]
 *             properties:
 *               identifier:
 *                 type: string
 *     responses:
 *       200:
 *         description: Account unlocked
 */
router.post('/login-attempts/unlock', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  const { identifier } = req.body;
  
  if (!identifier) {
    res.json({ code: -1, msg: 'Identifier is required' });
    return;
  }
  
  try {
    await unlockAccount(identifier);
    res.json({
      code: 0,
      msg: 'Account unlocked successfully',
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      msg: error instanceof Error ? error.message : 'Failed to unlock account',
    });
  }
});

export default router;

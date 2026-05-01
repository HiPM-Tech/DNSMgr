import { Router, Request, Response } from 'express';
import { authMiddleware, noTokenAuth } from '../middleware/auth';
import { createUserToken, getUserTokens, deleteUserToken, toggleTokenStatus, updateTokenPermissions } from '../service/token';
import { DomainOperations } from '../db/business-adapter';
import { normalizeRole } from '../utils/roles';
import { wsService } from '../service/websocket';
import { log } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/tokens:
 *   get:
 *     summary: Get all tokens for current user
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user tokens
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       name:
 *                         type: string
 *                       allowed_domains:
 *                         type: array
 *                         items:
 *                           type: number
 *                       allowed_services:
 *                         type: array
 *                         items:
 *                           type: string
 *                       start_time:
 *                         type: string
 *                         nullable: true
 *                       end_time:
 *                         type: string
 *                         nullable: true
 *                       max_role:
 *                         type: number
 *                       is_active:
 *                         type: boolean
 *                       created_at:
 *                         type: string
 *                       last_used_at:
 *                         type: string
 *                         nullable: true
 *                 msg:
 *                   type: string
 */
router.get('/', authMiddleware, noTokenAuth('token management'), async (req: Request, res: Response) => {
  try {
    const tokens = await getUserTokens(req.user!.userId);
    res.json({ code: 0, data: tokens, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get tokens' });
  }
});

/**
 * @swagger
 * /api/tokens:
 *   post:
 *     summary: Create a new API token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - allowed_domains
 *             properties:
 *               name:
 *                 type: string
 *                 description: Token name
 *               allowed_domains:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: List of allowed domain IDs (empty array means all domains)
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: Token activation time (optional)
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 description: Token expiration time (optional, null means no expiry)
 *     responses:
 *       200:
 *         description: Token created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       description: The plain token (only shown once)
 *                     tokenData:
 *                       type: object
 *                 msg:
 *                   type: string
 *       400:
 *         description: Invalid request parameters
 */
router.post('/', authMiddleware, noTokenAuth('token management'), async (req: Request, res: Response) => {
  const { name, allowed_domains, start_time, end_time } = req.body;

  if (!name || !allowed_domains) {
    res.status(400).json({ code: 400, msg: 'Missing required fields' });
    return;
  }

  // Token inherits user's role - no separate max_role needed
  const userRole = normalizeRole(req.user!.role);

  try {
    const result = await createUserToken(req.user!.userId, {
      name,
      allowed_domains,
      allowed_services: ['*'], // Allow all services - token has same permissions as user
      start_time,
      end_time,
      max_role: userRole,
    });

    res.json({
      code: 0,
      data: {
        token: result.token,
        tokenData: result.tokenData,
      },
      msg: 'Token created successfully',
    });
    
    // 推送 WebSocket 消息给当前用户
    try {
      wsService.sendToClient(req.user!.userId, {
        type: 'token_created',
        data: {
          tokenId: result.tokenData.id,
          name,
        },
      });
    } catch (error) {
      log.error('Tokens', 'Failed to send token_created event', { error });
    }
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to create token' });
  }
});

/**
 * @swagger
 * /api/tokens/{id}:
 *   delete:
 *     summary: Delete a token
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: Token ID
 *     responses:
 *       200:
 *         description: Token deleted successfully
 *       400:
 *         description: Invalid token ID
 *       500:
 *         description: Server error
 */
router.delete('/:id', authMiddleware, noTokenAuth('token management'), async (req: Request, res: Response) => {
  const tokenId = parseInt(req.params.id);
  if (isNaN(tokenId)) {
    res.status(400).json({ code: 400, msg: 'Invalid token ID' });
    return;
  }

  try {
    await deleteUserToken(tokenId, req.user!.userId);
    res.json({ code: 0, msg: 'Token deleted successfully' });
    
    // 推送 WebSocket 消息给当前用户
    try {
      wsService.sendToClient(req.user!.userId, {
        type: 'token_revoked',
        data: {
          tokenId,
        },
      });
    } catch (error) {
      log.error('Tokens', 'Failed to send token_revoked event', { error });
    }
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to delete token' });
  }
});

/**
 * @swagger
 * /api/tokens/{id}/status:
 *   patch:
 *     summary: Toggle token active status
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: Token ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_active
 *             properties:
 *               is_active:
 *                 type: boolean
 *                 description: New active status
 *     responses:
 *       200:
 *         description: Token status updated
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
router.patch('/:id/status', authMiddleware, noTokenAuth('token management'), async (req: Request, res: Response) => {
  const tokenId = parseInt(req.params.id);
  const { is_active } = req.body;

  if (isNaN(tokenId) || typeof is_active !== 'boolean') {
    res.status(400).json({ code: 400, msg: 'Invalid parameters' });
    return;
  }

  try {
    await toggleTokenStatus(tokenId, req.user!.userId, is_active);
    res.json({ code: 0, msg: 'Token status updated' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update token status' });
  }
});

/**
 * @swagger
 * /api/tokens/{id}:
 *   put:
 *     summary: Update token permissions
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: Token ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Token name
 *               allowed_domains:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: List of allowed domain IDs (empty array means all domains)
 *               allowed_services:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of allowed services
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: Token activation time (optional)
 *               end_time:
 *                 type: string
 *                 format: date-time
 *                 description: Token expiration time (optional, null means no expiry)
 *     responses:
 *       200:
 *         description: Token permissions updated successfully
 *       400:
 *         description: Invalid parameters
 *       500:
 *         description: Server error
 */
router.put('/:id', authMiddleware, noTokenAuth('token management'), async (req: Request, res: Response) => {
  const tokenId = parseInt(req.params.id);
  const { name, allowed_domains, allowed_services, start_time, end_time } = req.body;

  if (isNaN(tokenId)) {
    res.status(400).json({ code: 400, msg: 'Invalid token ID' });
    return;
  }

  try {
    await updateTokenPermissions(tokenId, req.user!.userId, {
      name,
      allowed_domains,
      allowed_services,
      start_time,
      end_time,
    });
    res.json({ code: 0, msg: 'Token permissions updated successfully' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update token permissions' });
  }
});

/**
 * @swagger
 * /api/tokens/domains:
 *   get:
 *     summary: Get user's accessible domains for token creation
 *     tags: [Tokens]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of accessible domains
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       name:
 *                         type: string
 *                       account_name:
 *                         type: string
 *                 msg:
 *                   type: string
 *       500:
 *         description: Database connection not available
 */
router.get('/domains', authMiddleware, noTokenAuth('token management'), async (req: Request, res: Response) => {
  try {
    const domains = await DomainOperations.getUserAccessibleDomains(req.user!.userId);

    res.json({ code: 0, data: domains, msg: 'success' });
  } catch (error) {
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get domains' });
  }
});

export default router;

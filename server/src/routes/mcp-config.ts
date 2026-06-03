import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { McpOperations } from '../db/bal/business-adapter';
import { sendSuccess } from '../utils/http';
import { log } from '../lib/logger';

const router = Router();

/**
 * @swagger
 * /api/mcp/status:
 *   get:
 *     summary: Check if MCP is enabled
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: MCP status
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
 *                     enabled:
 *                       type: boolean
 *                 msg:
 *                   type: string
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const config = await McpOperations.getGlobalConfig();
    sendSuccess(res, { enabled: config?.enabled || false });
  } catch (error) {
    log.error('MCP', 'Failed to get MCP status', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get MCP status' });
  }
});

/**
 * @swagger
 * /api/mcp/config:
 *   get:
 *     summary: Get MCP global configuration (Super Admin only)
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MCP configuration
 *       403:
 *         description: Forbidden - Super Admin required
 */
router.get('/config', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const config = await McpOperations.getGlobalConfig();
    sendSuccess(res, config || { id: 0, enabled: false });
  } catch (error) {
    log.error('MCP', 'Failed to get MCP config', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get MCP config' });
  }
});

/**
 * @swagger
 * /api/mcp/config:
 *   post:
 *     summary: Update MCP global configuration (Super Admin only)
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - enabled
 *             properties:
 *               enabled:
 *                 type: boolean
 *                 description: Enable or disable MCP globally
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 *       403:
 *         description: Forbidden - Super Admin required
 */
router.post('/config', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ code: 400, msg: 'enabled must be a boolean' });
    }

    await McpOperations.updateGlobalConfig(enabled, req.user!.userId);
    
    log.info('MCP', `MCP global config updated by user ${req.user!.userId}`, { enabled });
    
    sendSuccess(res, { success: true });
  } catch (error) {
    log.error('MCP', 'Failed to update MCP config', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update MCP config' });
  }
});

export default router;

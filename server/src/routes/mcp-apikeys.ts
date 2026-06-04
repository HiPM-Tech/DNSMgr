import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { McpOperations } from '../db/bal/business-adapter';
import { sendSuccess } from '../utils/http';
import { log } from '../lib/logger';
import crypto from 'crypto';

const router = Router();

/**
 * Generate secure API key
 */
function generateApiKey(): string {
  const prefix = 'hidns_mcp_';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return prefix + randomBytes;
}

/**
 * @swagger
 * /api/mcp/api-keys:
 *   get:
 *     summary: Get current user's API keys
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys (without full key value)
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const keys = await McpOperations.getUserApiKeys(req.user!.userId);
    
    // Mask API keys for security
    const maskedKeys = keys.map(key => ({
      ...key,
      api_key: key.api_key.substring(0, 15) + '...',
    }));
    
    sendSuccess(res, maskedKeys);
  } catch (error) {
    log.error('MCP', 'Failed to get API keys', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get API keys' });
  }
});

/**
 * @swagger
 * /api/mcp/api-keys:
 *   post:
 *     summary: Generate new API key
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
 *               - description
 *             properties:
 *               description:
 *                 type: string
 *                 description: Description of the API key usage
 *               expires_in_days:
 *                 type: number
 *                 description: Expiration in days (default: 365)
 *     responses:
 *       200:
 *         description: New API key generated (shown only once)
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { description, expires_in_days, expiresAt } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({ code: 400, msg: 'description is required' });
    }

    const apiKey = generateApiKey();
    
    // Calculate expiration date - support both camelCase and snake_case
    let expiresAtStr: string | undefined;
    if (expiresAt) {
      expiresAtStr = expiresAt;
    } else if (expires_in_days && typeof expires_in_days === 'number' && expires_in_days > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + expires_in_days);
      expiresAtStr = expiryDate.toISOString();
    }

    await McpOperations.createApiKey(req.user!.userId, apiKey, description, expiresAtStr);
    
    log.info('MCP', `API key created for user ${req.user!.userId}`, { description });
    
    // Return the full API key (only shown once) with both formats for compatibility
    sendSuccess(res, {
      api_key: apiKey,
      apiKey,
      message: 'API key generated successfully. Please save it securely, it will not be shown again.',
    });
  } catch (error) {
    log.error('MCP', 'Failed to create API key', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to create API key' });
  }
});

/**
 * @swagger
 * /api/mcp/api-keys/{id}/revoke:
 *   post:
 *     summary: Revoke API key
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: API key revoked
 *       404:
 *         description: API key not found
 */
router.post('/:id/revoke', authMiddleware, async (req: Request, res: Response) => {
  try {
    const keyId = parseInt(req.params.id);
    
    if (isNaN(keyId)) {
      return res.status(400).json({ code: 400, msg: 'Invalid key ID' });
    }

    await McpOperations.revokeApiKey(keyId, req.user!.userId);
    
    log.info('MCP', `API key revoked by user ${req.user!.userId}`, { keyId });
    
    sendSuccess(res, { success: true, message: 'API key revoked' });
  } catch (error) {
    log.error('MCP', 'Failed to revoke API key', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to revoke API key' });
  }
});

/**
 * @swagger
 * /api/mcp/api-keys/{id}:
 *   delete:
 *     summary: Revoke API key
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: API key revoked
 *       404:
 *         description: API key not found
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const keyId = parseInt(req.params.id);
    
    if (isNaN(keyId)) {
      return res.status(400).json({ code: 400, msg: 'Invalid key ID' });
    }

    await McpOperations.revokeApiKey(keyId, req.user!.userId);
    
    log.info('MCP', `API key revoked by user ${req.user!.userId}`, { keyId });
    
    sendSuccess(res, { success: true, message: 'API key revoked' });
  } catch (error) {
    log.error('MCP', 'Failed to revoke API key', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to revoke API key' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { McpOperations } from '../db/bal/business-adapter';
import { sendSuccess } from '../utils/http';
import { log } from '../lib/logger';
import crypto from 'crypto';

const router = Router();

/**
 * Generate secure client ID and secret
 */
function generateOAuthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = 'hidns_mcp_' + crypto.randomBytes(16).toString('hex');
  const clientSecret = crypto.randomBytes(32).toString('hex');
  return { clientId, clientSecret };
}

/**
 * @swagger
 * /api/mcp/oauth/clients:
 *   get:
 *     summary: Get current user's OAuth clients
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of OAuth clients (without secret)
 */
router.get('/clients', authMiddleware, async (req: Request, res: Response) => {
  try {
    const clients = await McpOperations.getUserOAuthClients(req.user!.userId);
    sendSuccess(res, clients);
  } catch (error) {
    log.error('MCP', 'Failed to get OAuth clients', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get OAuth clients' });
  }
});

/**
 * @swagger
 * /api/mcp/oauth/clients:
 *   post:
 *     summary: Create new OAuth client
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
 *               - app_name
 *               - redirect_uris
 *             properties:
 *               app_name:
 *                 type: string
 *                 description: Application name
 *               redirect_uris:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of redirect URIs
 *               scope:
 *                 type: object
 *                 description: Optional permission scopes
 *     responses:
 *       200:
 *         description: OAuth client created (secret shown only once)
 */
router.post('/clients', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { app_name, redirect_uris, scope } = req.body;

    if (!app_name || typeof app_name !== 'string') {
      return res.status(400).json({ code: 400, msg: 'app_name is required' });
    }

    if (!redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
      return res.status(400).json({ code: 400, msg: 'redirect_uris is required and must be a non-empty array' });
    }

    const { clientId, clientSecret } = generateOAuthCredentials();

    await McpOperations.createOAuthClient({
      client_id: clientId,
      client_secret: clientSecret,
      user_id: req.user!.userId,
      app_name,
      redirect_uris: JSON.stringify(redirect_uris),
      scope: scope ? JSON.stringify(scope) : undefined,
    });

    log.info('MCP', `OAuth client created for user ${req.user!.userId}`, { app_name });

    // Return credentials (only shown once)
    sendSuccess(res, {
      client_id: clientId,
      client_secret: clientSecret,
      message: 'OAuth client created successfully. Please save the client_secret securely, it will not be shown again.',
    });
  } catch (error) {
    log.error('MCP', 'Failed to create OAuth client', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to create OAuth client' });
  }
});

/**
 * @swagger
 * /api/mcp/oauth/clients/{id}:
 *   delete:
 *     summary: Delete OAuth client
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: OAuth client deleted
 *       404:
 *         description: OAuth client not found
 */
router.delete('/clients/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const clientId = req.params.id;

    await McpOperations.deleteOAuthClient(clientId, req.user!.userId);

    log.info('MCP', `OAuth client deleted by user ${req.user!.userId}`, { clientId });

    sendSuccess(res, { success: true, message: 'OAuth client deleted' });
  } catch (error) {
    log.error('MCP', 'Failed to delete OAuth client', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to delete OAuth client' });
  }
});

/**
 * @swagger
 * /api/mcp/oauth/token:
 *   post:
 *     summary: Exchange authorization code for access token
 *     tags: [MCP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - grant_type
 *               - code
 *               - client_id
 *               - client_secret
 *             properties:
 *               grant_type:
 *                 type: string
 *                 enum: [authorization_code]
 *               code:
 *                 type: string
 *               client_id:
 *                 type: string
 *               client_secret:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token issued
 *       400:
 *         description: Invalid request
 */
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { grant_type, code, client_id, client_secret } = req.body;

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    // TODO: Implement authorization code validation and token exchange
    // This is a placeholder for the OAuth2 token endpoint
    
    res.status(501).json({ 
      error: 'not_implemented',
      error_description: 'OAuth2 token exchange not yet implemented',
    });
  } catch (error) {
    log.error('MCP', 'OAuth token exchange failed', { error });
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;

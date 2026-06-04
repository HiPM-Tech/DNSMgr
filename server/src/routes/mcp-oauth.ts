import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { McpOperations } from '../db/bal/business-adapter';
import { sendSuccess } from '../utils/http';
import { log } from '../lib/logger';

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
 * /api/mcp/oauth/clients/{id}/scope:
 *   put:
 *     summary: Update OAuth client scope
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scope
 *             properties:
 *               scope:
 *                 type: string
 *     responses:
 *       200:
 *         description: Scope updated
 */
router.put('/clients/:id/scope', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { scope } = req.body;
    if (typeof scope !== 'string') {
      return res.status(400).json({ code: 400, msg: 'scope is required' });
    }

    await McpOperations.updateOAuthClientScope(req.params.id, req.user!.userId, scope);
    log.info('MCP', `OAuth client scope updated by user ${req.user!.userId}`, { clientId: req.params.id, scope });
    sendSuccess(res, { success: true });
  } catch (error) {
    log.error('MCP', 'Failed to update OAuth client scope', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update scope' });
  }
});

/**
 * @swagger
 * /api/mcp/oauth/clients/{id}/expiry:
 *   put:
 *     summary: Update OAuth client expiry date
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               expires_at:
 *                 type: string
 *                 format: date
 *                 description: ISO datetime or null to clear
 *     responses:
 *       200:
 *         description: Expiry updated
 */
router.put('/clients/:id/expiry', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expires_at } = req.body;
    const expiryValue = expires_at ? expires_at : null;

    await McpOperations.updateOAuthClientExpiry(req.params.id, req.user!.userId, expiryValue);
    log.info('MCP', `OAuth client expiry updated by user ${req.user!.userId}`, { clientId: req.params.id, expires_at: expiryValue });
    sendSuccess(res, { success: true });
  } catch (error) {
    log.error('MCP', 'Failed to update OAuth client expiry', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to update expiry' });
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
 *     summary: Exchange client credentials for access token (Client Credentials Flow)
 *     tags: [MCP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - grant_type
 *               - client_id
 *               - client_secret
 *             properties:
 *               grant_type:
 *                 type: string
 *                 enum: [client_credentials]
 *               client_id:
 *                 type: string
 *               client_secret:
 *                 type: string
 *               scope:
 *                 type: string
 *                 description: Optional requested scope
 *     responses:
 *       200:
 *         description: Access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 token_type:
 *                   type: string
 *                   example: Bearer
 *                 expires_in:
 *                   type: number
 *                 scope:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid client credentials
 */
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { grant_type, client_id, client_secret, scope } = req.body;

    // Only client_credentials grant type is supported
    if (grant_type !== 'client_credentials') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials grant type is supported',
      });
    }

    if (!client_id || !client_secret) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'client_id and client_secret are required',
      });
    }

    // Validate client credentials
    const client = await McpOperations.validateClientCredentials(client_id, client_secret);
    if (!client) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      });
    }

    // Generate access token and refresh token
    const accessToken = 'hdt_' + crypto.randomBytes(32).toString('hex');
    const refreshToken = 'hdr_' + crypto.randomBytes(32).toString('hex');
    
    // Token expires in 1 hour (3600 seconds)
    const expiresIn = 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Determine scope - use the client's configured scope or the requested scope
    let tokenScope: string | undefined;
    if (scope) {
      tokenScope = scope;
    } else if (client.scope) {
      tokenScope = client.scope;
    }

    // Store the access token
    await McpOperations.createAccessToken({
      access_token: accessToken,
      refresh_token: refreshToken,
      client_id,
      user_id: client.user_id,
      scope: tokenScope ? JSON.stringify(tokenScope) : undefined,
      expires_at: expiresAt,
    });

    log.info('MCP OAuth', `Access token issued for client`, { client_id, user_id: client.user_id });

    // Return OAuth 2.0 standard response
    res.status(200).json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: tokenScope || '',
    });
  } catch (error) {
    log.error('MCP OAuth', 'Token issuance failed', { error });
    res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/mcp/oauth/tokens:
 *   get:
 *     summary: List OAuth access tokens
 *     tags: [MCP]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of issued tokens
 */
router.get('/tokens', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tokens = await McpOperations.getOAuthAccessTokens(req.user!.userId);
    sendSuccess(res, tokens);
  } catch (error) {
    log.error('MCP OAuth', 'Failed to get tokens', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to get tokens' });
  }
});

/**
 * @swagger
 * /api/mcp/oauth/tokens/{id}/revoke:
 *   post:
 *     summary: Revoke an access token
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
 *         description: Token revoked
 */
router.post('/tokens/:id/revoke', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tokenId = parseInt(req.params.id);
    if (isNaN(tokenId)) {
      return res.status(400).json({ code: 400, msg: 'Invalid token ID' });
    }

    await McpOperations.revokeOAuthTokenById(tokenId, req.user!.userId);

    log.info('MCP OAuth', `Token revoked by user ${req.user!.userId}`, { tokenId });

    sendSuccess(res, { success: true, message: 'Token revoked' });
  } catch (error) {
    log.error('MCP OAuth', 'Failed to revoke token', { error });
    res.status(500).json({ code: 500, msg: error instanceof Error ? error.message : 'Failed to revoke token' });
  }
});

export default router;

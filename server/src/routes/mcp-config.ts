import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { McpOperations } from '../db/bal/business-adapter';
import { sendSuccess } from '../utils/http';
import { log } from '../lib/logger';

const router = Router();

// ─── MCP OAuth JWKS Key Pair ──────────────────────────────────────
interface McpJwksKey {
  kid: string;
  jwk: crypto.JsonWebKey;
}

let jwksKeyCache: McpJwksKey | null = null;
let jwksKeyGeneratedAt = 0;
const JWKS_KEY_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getOrGenerateMcpJwksKey(): McpJwksKey {
  const now = Date.now();

  if (!jwksKeyCache || (now - jwksKeyGeneratedAt) > JWKS_KEY_TTL) {
    log.info('MCP', 'Generating new EC P-256 key pair for MCP OAuth JWKS');

    const { publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const pubKeyObj = crypto.createPublicKey(publicKey);
    const jwk = pubKeyObj.export({ format: 'jwk' }) as crypto.JsonWebKey;
    // Generate a stable kid from the x-coordinate fingerprint
    const kid = crypto.createHash('sha256').update(Buffer.from(jwk.x || '', 'base64url')).digest('hex').slice(0, 16);

    jwksKeyCache = { kid, jwk: { ...jwk, alg: 'ES256', kid, use: 'sig' } };
    jwksKeyGeneratedAt = now;
  }

  return jwksKeyCache;
}

/**
 * @swagger
 * /api/mcp/.well-known/jwks.json:
 *   get:
 *     summary: MCP OAuth JWKS endpoint — EC P-256 public key in JWK Set format
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: JWK Set containing the MCP OAuth public key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 keys:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/.well-known/jwks.json', async (req: Request, res: Response) => {
  try {
    const { jwk } = getOrGenerateMcpJwksKey();
    res.status(200).json({ keys: [jwk] });
  } catch (error) {
    log.error('MCP', 'Failed to serve JWKS', { error });
    res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
  }
});

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

// PUT alias for frontend compatibility
router.put('/config', authMiddleware, adminOnly, async (req: Request, res: Response) => {
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

/**
 * @swagger
 * /api/mcp/.well-known/oauth-protected-resource:
 *   get:
 *     summary: OAuth 2.0 Protected Resource Metadata (RFC 9728)
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: OAuth protected resource metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resource:
 *                   type: string
 *                 authorization_servers:
 *                   type: array
 *                   items:
 *                     type: string
 *                 scopes_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                 bearer_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                 jwks_uri:
 *                   type: string
 *                   description: OPTIONAL. URL of the JWK Set containing public keys
 *                 authorization_endpoint:
 *                   type: string
 *                   description: OPTIONAL. URL of the authorization endpoint
 *                 token_endpoint:
 *                   type: string
 *                   description: OPTIONAL. URL of the token endpoint
 *                 registration_endpoint:
 *                   type: string
 *                   description: OPTIONAL. URL of the dynamic client registration endpoint
 *                 resource_name:
 *                   type: string
 *                   description: RECOMMENDED. Human-readable resource name
 */
router.get('/.well-known/oauth-protected-resource', async (req: Request, res: Response) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    const metadata = {
      resource: `${baseUrl}/api/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: [
        'ns_monitor:read',
        'ns_monitor:write',
        'domain_management:read',
        'domain_management:write',
        'renewal_management:read',
        'renewal_management:write',
        'log_query:read',
        'failover_management:read',
        'failover_management:write',
      ],
      bearer_methods_supported: ['header'],
      jwks_uri: `${baseUrl}/api/mcp/.well-known/jwks.json`,
      authorization_endpoint: `${baseUrl}/api/mcp/oauth/authorize`,
      token_endpoint: `${baseUrl}/api/mcp/oauth/token`,
      registration_endpoint: `${baseUrl}/api/mcp/oauth/register`,
      resource_name: 'HiDNS MCP API',
    };

    res.status(200).json(metadata);
  } catch (error) {
    log.error('MCP', 'Failed to serve OAuth protected resource metadata', { error });
    res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
  }
});

export default router;

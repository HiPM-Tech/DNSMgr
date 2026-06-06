import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { McpOperations } from '../db/bal/business-adapter';
import { sendSuccess } from '../utils/http';
import { createLogger } from '../lib/logger';

const log = createLogger('MCP').sub('Route').sub('Config');
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
    log.info('Generating new EC P-256 key pair for MCP OAuth JWKS');

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
    log.error('Failed to serve JWKS', { error });
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
    log.error('Failed to get MCP status', { error });
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
    log.error('Failed to get MCP config', { error });
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

    log.info(`MCP global config updated by user ${req.user!.userId}`, { enabled });

    sendSuccess(res, { success: true });
  } catch (error) {
    log.error('Failed to update MCP config', { error });
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

    log.info(`MCP global config updated by user ${req.user!.userId}`, { enabled });

    sendSuccess(res, { success: true });
  } catch (error) {
    log.error('Failed to update MCP config', { error });
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
      authorization_servers: [`${baseUrl}/api/mcp`],
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
    log.error('Failed to serve OAuth protected resource metadata', { error });
    res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/mcp/.well-known/oauth-authorization-server:
 *   get:
 *     summary: OAuth 2.0 Authorization Server Metadata (RFC 8414)
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: Authorization server metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 issuer:
 *                   type: string
 *                   description: REQUIRED. The authorization server's issuer identifier
 *                 authorization_endpoint:
 *                   type: string
 *                   description: REQUIRED. URL of the authorization endpoint
 *                 token_endpoint:
 *                   type: string
 *                   description: REQUIRED. URL of the token endpoint
 *                 registration_endpoint:
 *                   type: string
 *                   description: OPTIONAL. URL of the dynamic client registration endpoint
 *                 jwks_uri:
 *                   type: string
 *                   description: RECOMMENDED. URL of the JWK Set
 *                 scopes_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: RECOMMENDED. JSON array of supported scope values
 *                 response_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: REQUIRED. JSON array of supported response types
 *                 grant_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: OPTIONAL. JSON array of supported grant types
 *                 token_endpoint_auth_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: OPTIONAL. JSON array of supported token endpoint auth methods
 *                 code_challenge_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: OPTIONAL. JSON array of supported PKCE code challenge methods
 */
router.get('/.well-known/oauth-authorization-server', async (req: Request, res: Response) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    const metadata = {
      // REQUIRED
      issuer: `${baseUrl}/api/mcp`,
      authorization_endpoint: `${baseUrl}/api/mcp/oauth/authorize`,
      token_endpoint: `${baseUrl}/api/mcp/oauth/token`,
      response_types_supported: ['code'],
      // RECOMMENDED
      jwks_uri: `${baseUrl}/api/mcp/.well-known/jwks.json`,
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
      // OPTIONAL
      registration_endpoint: `${baseUrl}/api/mcp/oauth/register`,
      grant_types_supported: [
        'authorization_code',
        'client_credentials',
        'refresh_token',
      ],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        'client_secret_basic',
        'none',
      ],
      code_challenge_methods_supported: ['S256', 'plain'],
      // Additional
      introspection_endpoint: `${baseUrl}/api/mcp/oauth/introspect`,
      revocation_endpoint: `${baseUrl}/api/mcp/oauth/revoke`,
    };

    res.status(200).json(metadata);
  } catch (error) {
    log.error('Failed to serve authorization server metadata', { error });
    res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/mcp/.well-known/mcp.json:
 *   get:
 *     summary: MCP Server Capability Discovery
 *     description: |
 *       MCP 能力发现端点。客户端可在连接前或收到 401 后获取此信息,
 *       了解服务器支持的 MCP 协议版本、端点地址和认证方式。
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: MCP server metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                 version:
 *                   type: string
 *                 protocolVersion:
 *                   type: string
 *                 description:
 *                   type: string
 *                 capabilities:
 *                   type: object
 *                   properties:
 *                     tools:
 *                       type: object
 *                       description: Server supports tools
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     streamableHttp:
 *                       type: object
 *                       properties:
 *                         url:
 *                           type: string
 *                     sse:
 *                       type: object
 *                       properties:
 *                         url:
 *                           type: string
 *                 authentication:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     authorizationEndpoint:
 *                       type: string
 *                     tokenEndpoint:
 *                       type: string
 *                     registrationEndpoint:
 *                       type: string
 *                     scopesSupported:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.get('/.well-known/mcp.json', async (req: Request, res: Response) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    const metadata = {
      // 服务器信息
      name: 'HiDNS MCP Server',
      version: '1.0.0',
      protocolVersion: '2025-03-26',
      description: 'MCP server for HiDNS domain management, DNS record management, NS monitoring, and related services.',

      // 能力声明
      capabilities: {
        tools: {},
      },

      // 端点地址
      endpoints: {
        streamableHttp: {
          url: `${baseUrl}/api/mcp`,
        },
        sse: {
          url: `${baseUrl}/api/mcp/sse`,
        },
      },

      // 认证信息
      authentication: {
        type: 'oauth2',
        authorizationEndpoint: `${baseUrl}/api/mcp/oauth/authorize`,
        tokenEndpoint: `${baseUrl}/api/mcp/oauth/token`,
        registrationEndpoint: `${baseUrl}/api/mcp/oauth/register`,
        scopesSupported: [
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
        metadataUri: `${baseUrl}/api/mcp/.well-known/oauth-protected-resource`,
        authorizationServerMetadataUri: `${baseUrl}/api/mcp/.well-known/oauth-authorization-server`,
      },
    };

    // 允许跨域访问（MCP 客户端可能来自不同源）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(metadata);
  } catch (error) {
    log.error('Failed to serve MCP capability discovery metadata', { error });
    res.status(500).json({ error: 'server_error', error_description: 'Internal server error' });
  }
});

export default router;

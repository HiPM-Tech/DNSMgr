/**
 * MCP 协议路由 — Streamable HTTP & SSE 端点
 *
 * /api/mcp      — Streamable HTTP：支持 JSON-RPC 请求-响应（每个请求使用独立 Transport）
 * /api/mcp/sse  — 传统 SSE 传输（兼容 Trae IDE、Cursor 等客户端）
 *
 * 注意：MCP SDK 的 Streamable HTTP 无状态模式（sessionIdGenerator: undefined）
 * 不允许复用 Transport 实例。因此每个 POST 请求创建独立的 Transport 实例，
 * 处理完成后断开连接，以支持多客户端并发访问。
 */

import { Router, Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { mcpServer, HidnsMcpServer } from '../mcp/server';
import { McpOperations } from '../db/bal/business-adapter';
import { log } from '../lib/logger';

const router = Router();

// ── 传统 SSE 传输层 ──

// 独立的 MCP 服务器实例用于传统 SSE 传输（避免与 Streamable HTTP 的传输层冲突）
const sseMcpServer = new HidnsMcpServer();
// 活跃的 SSE 传输层会话 { sessionId → transport }
const sseTransports = new Map<string, SSEServerTransport>();

/**
 * MCP 启用检查中间件
 * 当 MCP 未启用时返回 503
 */
async function mcpEnabledCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const config = await McpOperations.getGlobalConfig();
    if (!config?.enabled) {
      res.status(503).json({ code: 503, msg: 'MCP is disabled', data: null });
      return;
    }
    next();
  } catch (error) {
    log.error('MCP Protocol', 'Failed to check MCP enabled status', { error });
    res.status(500).json({ code: 500, msg: 'Failed to check MCP status', data: null });
  }
}

/**
 * 从请求头提取 API Key 或 OAuth Bearer Token（脱敏后返回）
 */
function extractAuthValue(req: Request): string | null {
  const apiKeyHeader = req.headers['api-key'] as string | undefined;
  if (apiKeyHeader) return apiKeyHeader;

  const authHeader = req.headers['authorization'] as string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  if (authHeader?.startsWith('Basic ')) {
    return authHeader.slice(6).trim();
  }

  return null;
}

/**
 * 脱敏认证值（只保留前缀和后4位）
 */
function maskAuthValue(value: string): string {
  if (value.length <= 8) return value.slice(0, 4) + '****';
  return value.slice(0, 8) + '...' + value.slice(-4);
}

/**
 * 从 JSON-RPC body 中提取方法名（支持单条和批量）
 */
function extractMethods(body: any): string[] {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body)) return body.map((m: any) => m?.method).filter(Boolean);
  return body.method ? [body.method] : [];
}

/**
 * 构造 OAuth 发现 URL（baseUrl 从请求推断，支持 CDN/反向代理）
 */
function buildOAuthMetadataUrl(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}/api/mcp/.well-known/oauth-protected-resource`;
}

/**
 * 处理 MCP Streamable HTTP POST 请求 — 每个请求使用独立的 Transport
 *
 * MCP SDK 的 Streamable HTTP 无状态模式（sessionIdGenerator: undefined）
 * 禁止复用 Transport（抛出 "Stateless transport cannot be reused"）。
 * 因此为每个 POST 请求创建新 Transport，使用 JSON 响应模式（enableJsonResponse: true）
 * 避免 SSE 流状态残留，处理完成后立即断开连接。
 */
async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
  const startTime = Date.now();

  try {
    // ── 日志：收到请求 ──
    log.info('MCP Protocol', `Incoming ${req.method} /api/mcp`, {
      method: req.method,
      clientIp,
      contentType: req.headers['content-type'],
      accept: req.headers['accept'],
    });

    // ── 非 POST 请求：不支持，引导使用 SSE ──
    if (req.method !== 'POST') {
      res.status(400).json({
        code: 400,
        msg: 'This endpoint only supports POST (Streamable HTTP). For SSE connections, use GET /api/mcp/sse',
        data: null,
      });
      return;
    }

    // ── OAuth 发现：POST 请求未携带认证头时返回 401 ──
    const authValue = extractAuthValue(req);

    if (!authValue) {
      const oauthUri = buildOAuthMetadataUrl(req);

      log.info('MCP Protocol', 'Auth required (no API-Key/Bearer token), returning 401 with OAuth discovery', {
        clientIp,
        oauthUri,
      });

      res.status(401)
        .set('WWW-Authenticate', `Bearer realm="HiDNS MCP", resource_metadata="${oauthUri}"`)
        .json({
          error: 'unauthorized',
          error_description: 'Authentication is required to access MCP. Provide API-Key header or use OAuth 2.0.',
          oauth_metadata_uri: oauthUri,
        });
      return;
    }

    // ── 日志：认证通过 ──
    const methods = extractMethods(req.body);
    log.info('MCP Protocol', 'POST /api/mcp authenticated', {
      clientIp,
      authType: req.headers['api-key'] ? 'api-key' : 'bearer',
      authValue: maskAuthValue(authValue),
      methods: methods.length > 0 ? methods : undefined,
      methodCount: Array.isArray(req.body) ? req.body.length : undefined,
    });

    // 已认证：API Key / Bearer Token 注入到 tools/call 参数
    if (req.body && typeof req.body === 'object') {
      const injectApiKey = (msg: any) => {
        if (msg?.method === 'tools/call' && msg?.params && !msg.params.apiKey) {
          msg.params.apiKey = authValue;
          log.debug('MCP Protocol', 'API key injected into tools/call params', {
            toolName: msg.params?.name,
            params: Object.keys(msg.params).filter(k => k !== 'apiKey'),
          });
        }
      };
      if (Array.isArray(req.body)) {
        req.body.forEach(injectApiKey);
      } else {
        injectApiKey(req.body);
      }
    }

    // ── 创建每个请求独立的 Transport ──
    // 无状态模式（sessionIdGenerator: undefined）+ JSON 响应模式（enableJsonResponse: true）
    // 每个请求完成后断开连接，让下一个请求可以创建新的 Transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // 先断开上一次连接的 Transport（如果有），再连接新的
    const server = mcpServer.getServer();
    if (server.close) {
      await server.close().catch(() => { /* 忽略未连接时的关闭错误 */ });
    }
    await server.connect(transport);
    log.debug('MCP Protocol', 'Streamable HTTP transport connected for request', {
      clientIp,
      methods,
    });

    try {
      // 处理请求 — 在 JSON 响应模式下，handleRequest 会在响应发送完成后才 resolve
      await transport.handleRequest(req, res, req.body);

      // ── 日志：请求完成 ──
      const duration = Date.now() - startTime;
      log.info('MCP Protocol', `Completed POST /api/mcp`, {
        statusCode: res.statusCode,
        durationMs: duration,
        clientIp,
      });
    } finally {
      // 断开 Transport 连接，释放服务器以供下一个请求连接
      await server.close().catch((err) => {
        log.debug('MCP Protocol', 'Error closing per-request transport', { error: err });
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('MCP Protocol', 'Failed to handle MCP protocol request', {
      error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error,
      method: req.method,
      path: req.path,
      clientIp,
      durationMs: duration,
    });

    if (!res.headersSent) {
      res.status(500).json({ code: 500, msg: 'Internal server error', data: null });
    }
  }
}

/**
 * 处理传统 SSE GET 请求 — 建立 SSE 流连接
 *
 * 流程：
 * 1. 客户端发送 GET /api/mcp/sse
 * 2. 服务端认证后创建 SSEServerTransport 并连接到 McpServer
 * 3. 服务端发送 `event: endpoint\ndata: /api/mcp/sse?sessionId=xxx` 事件
 * 4. 客户端收到 endpoint 事件后，用该 URL 发送 POST JSON-RPC 消息
 */
async function handleSseGet(req: Request, res: Response): Promise<void> {
  const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';

  try {
    const authValue = extractAuthValue(req);

    // ── 日志：收到 SSE 连接请求 ──
    log.info('MCP Protocol', 'Incoming SSE GET /api/mcp/sse', {
      clientIp,
      contentType: req.headers['content-type'],
      accept: req.headers['accept'],
    });

    if (!authValue) {
      log.info('MCP Protocol', 'SSE auth required (no API-Key/Bearer token), returning 401', { clientIp });

      const oauthUri = buildOAuthMetadataUrl(req);

      res.status(401)
        .set('WWW-Authenticate', `Bearer realm="HiDNS MCP", resource_metadata="${oauthUri}"`)
        .json({
          error: 'unauthorized',
          error_description: 'Authentication is required to access MCP SSE endpoint.',
          oauth_metadata_uri: oauthUri,
        });
      return;
    }

    // ── 日志：SSE 认证通过 ──
    log.info('MCP Protocol', 'SSE GET /api/mcp/sse authenticated', {
      clientIp,
      authType: req.headers['api-key'] ? 'api-key' : 'bearer',
      authValue: maskAuthValue(authValue),
    });

    // 创建 SSE 传输层，endpoint 指向当前路径（用于 POST 消息回传）
    const transport = new SSEServerTransport('/api/mcp/sse', res);
    const sessionId = transport.sessionId;

    // 存储传输层实例
    sseTransports.set(sessionId, transport);

    // 连接到 MCP 服务器（connect 会调用 transport.start() 自动发送 endpoint 事件）
    await sseMcpServer.getServer().connect(transport);

    log.info('MCP Protocol', `SSE session established: ${sessionId}`, {
      sessionId,
      clientIp,
      authType: req.headers['api-key'] ? 'api-key' : 'bearer',
      authValue: maskAuthValue(authValue),
    });

    // 连接关闭时清理
    res.on('close', () => {
      sseTransports.delete(sessionId);
      log.info('MCP Protocol', `SSE session closed: ${sessionId}`, {
        sessionId,
        clientIp,
      });
    });
  } catch (error) {
    log.error('MCP Protocol', 'Failed to establish SSE connection', {
      error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error,
      clientIp,
    });
    if (!res.headersSent) {
      res.status(500).json({ code: 500, msg: 'Internal server error', data: null });
    }
  }
}

/**
 * 处理传统 SSE POST 请求 — 接收 JSON-RPC 消息
 *
 * 流程：
 * 1. 客户端向 endpoint 事件返回的 URL 发送 POST
 * 2. 服务端找到对应的 SSEServerTransport 并处理消息
 * 3. McpServer 处理 JSON-RPC 并通过 SSE 流返回响应
 */
async function handleSsePost(req: Request, res: Response): Promise<void> {
  const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
  const startTime = Date.now();
  const sessionId = req.query.sessionId as string;

  try {
    // ── 日志：收到 SSE POST 消息 ──
    const methods = extractMethods(req.body);
    log.info('MCP Protocol', `Incoming SSE POST /api/mcp/sse`, {
      sessionId: sessionId || '(missing)',
      clientIp,
      contentType: req.headers['content-type'],
      methods: methods.length > 0 ? methods : undefined,
      methodCount: Array.isArray(req.body) ? req.body.length : undefined,
    });

    if (!sessionId) {
      res.status(400).json({ code: 400, msg: 'Missing sessionId query parameter', data: null });
      return;
    }

    const transport = sseTransports.get(sessionId);
    if (!transport) {
      log.warn('MCP Protocol', 'SSE session not found for POST message', {
        sessionId,
        clientIp,
        durationMs: Date.now() - startTime,
      });
      res.status(404).json({ code: 404, msg: 'SSE session not found', data: null });
      return;
    }

    // 将 Express 解析的 body 传给 SSEServerTransport（避免 getRawBody 重复读取）
    await transport.handlePostMessage(req, res, req.body);

    // ── 日志：SSE POST 完成 ──
    const duration = Date.now() - startTime;
    log.info('MCP Protocol', `Completed SSE POST /api/mcp/sse`, {
      sessionId,
      clientIp,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('MCP Protocol', 'Failed to handle SSE POST message', {
      error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error,
      sessionId: sessionId || '(unknown)',
      clientIp,
      durationMs: duration,
    });
    if (!res.headersSent) {
      res.status(500).json({ code: 500, msg: 'Internal server error', data: null });
    }
  }
}

// /api/mcp — Streamable HTTP：仅处理 POST (JSON-RPC)
router.post('/', mcpEnabledCheck, handleMcpRequest);

// /api/mcp/sse — 传统 SSE 传输
router.get('/sse', mcpEnabledCheck, handleSseGet);
router.post('/sse', mcpEnabledCheck, handleSsePost);

export default router;
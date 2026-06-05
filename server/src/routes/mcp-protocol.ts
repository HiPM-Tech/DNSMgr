/**
 * MCP 协议路由 — Streamable HTTP & SSE 端点
 *
 * /api/mcp  — Streamable HTTP：支持 JSON-RPC 请求-响应和 SSE 流
 * /api/mcp/sse — 专用 SSE 端点
 */

import { Router, Request, Response, NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import crypto from 'crypto';
import { mcpServer } from '../mcp/server';
import { McpOperations } from '../db/bal/business-adapter';
import { log } from '../lib/logger';

const router = Router();

// 有状态的 Streamable HTTP 传输层单例
const httpTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});

let transportConnected = false;

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
 * 从请求头提取 API Key 或 OAuth Bearer Token
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
 * 构造 OAuth 发现 URL（baseUrl 从请求推断，支持 CDN/反向代理）
 */
function buildOAuthMetadataUrl(req: Request): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}/api/mcp/.well-known/oauth-protected-resource`;
}

/**
 * 连接传输层并处理 MCP 协议请求
 * 首次请求时自动连接 McpServer 与 Streamable HTTP 传输层
 */
async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  try {
    // ── OAuth 发现：POST 请求未携带认证头时返回 401 ──
    // 标准 MCP 客户端（Cursor、Claude Desktop 等）收到 401 后，
    // 会读取 WWW-Authenticate 头并通过 oauth_metadata_uri 发现 OAuth 端点，
    // 自动完成动态注册 → 授权码流程 → 获取 token → 重试请求。
    if (req.method === 'POST') {
      const authValue = extractAuthValue(req);

      if (!authValue) {
        const oauthUri = buildOAuthMetadataUrl(req);

        res.status(401)
          .set('WWW-Authenticate', `Bearer realm="HiDNS MCP"`)
          .json({
            error: 'unauthorized',
            error_description: 'Authentication is required to access MCP. Provide API-Key header or use OAuth 2.0.',
            oauth_metadata_uri: oauthUri,
          });
        return;
      }

      // 已认证：从请求头提取的 API Key / Bearer Token 注入到
      // JSON-RPC tools/call 参数中（兼容现有工具处理器的 apiKey 参数约定）
      if (req.body && typeof req.body === 'object') {
        const injectApiKey = (msg: any) => {
          if (msg?.method === 'tools/call' && msg?.params && !msg.params.apiKey) {
            msg.params.apiKey = authValue;
          }
        };
        if (Array.isArray(req.body)) {
          req.body.forEach(injectApiKey);
        } else {
          injectApiKey(req.body);
        }
      }
    }

    if (!transportConnected) {
      await mcpServer.getServer().connect(httpTransport);
      transportConnected = true;
      log.info('MCP Protocol', 'Streamable HTTP transport connected to McpServer');
    }

    await httpTransport.handleRequest(req, res, req.body);
  } catch (error) {
    log.error('MCP Protocol', 'Failed to handle MCP protocol request', {
      error,
      method: req.method,
      path: req.path,
    });

    if (!res.headersSent) {
      res.status(500).json({ code: 500, msg: 'Internal server error', data: null });
    }
  }
}

// /api/mcp — Streamable HTTP：处理 GET(SSE) 和 POST(JSON-RPC)
router.all('/', mcpEnabledCheck, handleMcpRequest);

// /api/mcp/sse — 专用 SSE 端点
router.all('/sse', mcpEnabledCheck, handleMcpRequest);

export default router;
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
 * 连接传输层并处理 MCP 协议请求
 * 首次请求时自动连接 McpServer 与 Streamable HTTP 传输层
 */
async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  try {
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
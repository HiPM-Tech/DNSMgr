# MCP HTTP/SSE Transport 实现计划

## 概述

为 MCP Server 添加 HTTP 传输层支持，使其可通过 `/api/mcp`（Streamable HTTP）和 `/api/mcp/sse`（专用 SSE）端点访问，而不仅限于当前 stdio 模式。

## 当前状态

- `HidnsMcpServer`（`server/src/mcp/server.ts`）创建 `McpServer` 并注册 25 个工具
- 当前仅支持 `StdioServerTransport`（通过 `start.ts` 独立运行）
- Express 应用未调用 `mcpServer.start()`，因此 `McpServer` 尚未连接任何传输层
- 现有 MCP 管理路由：`/config`、`/status`、`/api-keys`、`/oauth`、`/audit-logs`

## 变更计划

### 1. `server/src/mcp/server.ts` — 暴露 McpServer 实例

**变更**：添加 `getServer()` 公共方法

```typescript
export class HidnsMcpServer {
  private server: McpServer;

  /** 获取内部的 McpServer 实例，供 HTTP 传输层连接 */
  getServer(): McpServer {
    return this.server;
  }
}
```

**原因**：路由文件需要访问 `McpServer` 实例来连接 `StreamableHTTPServerTransport`。

### 2. `server/src/routes/mcp-protocol.ts`（新建）— MCP 协议路由

**文件内容**：

- 导入 `StreamableHTTPServerTransport`（来自 `@modelcontextprotocol/sdk/server/streamableHttp.js`）
- 导入 `McpOperations` 用于检查 MCP 是否启用
- 创建单例 `httpTransport`，使用 `sessionIdGenerator` 支持有状态模式
- 路由处理：

| 方法 | 路径 | 处理方式 |
|------|------|----------|
| POST | `/api/mcp` | JSON-RPC 请求-响应（通过 `StreamableHTTPServerTransport`）|
| GET | `/api/mcp` | SSE 流（当 `Accept: text/event-stream`）|
| POST | `/api/mcp/sse` | JSON-RPC 消息（SSE 通道建立后）|
| GET | `/api/mcp/sse` | 专用 SSE 端点建立 |

- 首次请求时连接传输层（`mcpServer.getServer().connect(httpTransport)`）
- MCP 启用检查中间件（调用 `McpOperations.getGlobalConfig()`）
- 错误处理

**关键实现细节**：

```typescript
import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import crypto from 'crypto';
import { mcpServer } from '../mcp/server';
import { McpOperations } from '../db/bal/business-adapter';
import { log } from '../lib/logger';

const router = Router();

// 创建有状态的 Streamable HTTP 传输层
const httpTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});

let transportConnected = false;

// MCP 启用检查中间件
async function mcpEnabledCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const config = await McpOperations.getGlobalConfig();
    if (!config?.enabled) {
      return res.status(503).json({ error: 'MCP is disabled' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to check MCP status' });
  }
}

// 连接传输层并处理请求
async function handleMcpRequest(req: Request, res: Response) {
  try {
    if (!transportConnected) {
      await mcpServer.getServer().connect(httpTransport);
      transportConnected = true;
      log.info('MCP Protocol', 'Streamable HTTP transport connected');
    }
    await httpTransport.handleRequest(req, res, req.body);
  } catch (error) {
    log.error('MCP Protocol', 'Failed to handle request', { error });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

// /api/mcp - 处理所有方法
router.all('/', mcpEnabledCheck, handleMcpRequest);

// /api/mcp/sse - 专用 SSE 端点
router.all('/sse', mcpEnabledCheck, handleMcpRequest);

export default router;
```

### 3. `server/src/app.ts` — 注册新路由

**变更**：

```typescript
// 在现有 MCP 路由之后添加
import mcpProtocolRouter from './routes/mcp-protocol';

// ... 现有 MCP 路由 ...
app.use('/api/mcp', mcpConfigRouter);
app.use('/api/mcp/api-keys', mcpApiKeysRouter);
app.use('/api/mcp/oauth', mcpOAuthRouter);
app.use('/api/mcp/audit-logs', mcpAuditRouter);
app.use('/api/mcp/audit-stats', mcpAuditRouter);

// MCP 协议路由 - 放在最后，确保更具体的路由优先匹配
app.use('/api/mcp', mcpProtocolRouter);
```

**原因**：Express 按注册顺序匹配路由。将协议路由放在最后，确保 `/api/mcp/config`、`/api/mcp/status` 等管理端点优先匹配。

## 认证处理

MCP 协议认证通过两种方式：

1. **`apiKey` 参数**（工具调用参数）— 现有逻辑，HTTP 传输层同样适用
2. **`Authorization: Bearer` 头** — 可通过 MCP SDK 的 `auth` 属性支持

当前实现保持向后兼容，`apiKey` 参数方式在所有传输层均可工作。

## 验证步骤

1. 启动服务后，通过 `curl` 测试 POST JSON-RPC：
   ```bash
   curl -X POST http://localhost:3000/api/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

2. 测试 SSE 连接：
   ```bash
   curl -N http://localhost:3000/api/mcp \
     -H "Accept: text/event-stream"
   ```

3. 测试 `/api/mcp/sse`：
   ```bash
   curl -N http://localhost:3000/api/mcp/sse
   ```

4. 验证 MCP 关闭时返回 503
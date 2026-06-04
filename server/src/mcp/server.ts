/**
 * MCP Server 入口文件
 * 
 * 实现 Model Context Protocol 服务器，提供 DNS 管理工具
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools';
import { log } from '../lib/logger';

export class HidnsMcpServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      {
        name: 'HiDNS MCP Server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {}, // 支持工具调用
          // resources: {}, // 可选：支持资源访问
          // prompts: {},   // 可选：支持提示词模板
        },
      }
    );

    // 注册所有工具
    registerTools(this.server);

    log.info('MCP Server', 'HiDNS MCP Server initialized', {
      capabilities: ['tools'],
      toolCount: 25,
    });
  }

  /**
   * 获取内部的 McpServer 实例，供 HTTP 传输层连接
   */
  getServer(): McpServer {
    return this.server;
  }

  /**
   * 启动 MCP Server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info('MCP Server', 'MCP Server started and connected to stdio transport');
  }

  /**
   * 停止 MCP Server
   */
  async stop(): Promise<void> {
    await this.server.close();
    log.info('MCP Server', 'MCP Server stopped');
  }
}

// 导出单例实例
export const mcpServer = new HidnsMcpServer();

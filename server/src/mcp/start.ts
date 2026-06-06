#!/usr/bin/env node

/**
 * MCP Server 独立启动脚本
 *
 * 使用方式：
 * npx ts-node src/mcp/start.ts
 */

import { mcpServer } from './server';
import { createLogger } from '../lib/logger';

const log = createLogger('MCP').sub('Start');

async function main() {
  try {
    log.info('Starting HiDNS MCP Server...');

    // 启动 MCP Server
    await mcpServer.start();

    log.info('HiDNS MCP Server is running');

    // 保持进程运行
    process.on('SIGINT', async () => {
      log.info('Received SIGINT, shutting down...');
      await mcpServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      log.info('Received SIGTERM, shutting down...');
      await mcpServer.stop();
      process.exit(0);
    });
  } catch (error) {
    log.error('Failed to start MCP Server', { error });
    process.exit(1);
  }
}

main();

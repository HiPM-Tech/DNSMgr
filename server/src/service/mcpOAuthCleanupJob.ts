import { McpOperations } from '../db/bal/business-adapter';
import { taskManager } from './taskManager';
import { log } from '../lib/logger';

export function startMcpOAuthCleanupJob() {
  // 每 5 分钟清理一次超过 25 分钟仍未授权的临时客户端
  setInterval(async () => {
    try {
      await taskManager.submit(
        {
          id: 'mcp-oauth-cleanup',
          name: 'MCP OAuth Temporary Client Cleanup',
          concurrency: 1,
          timeout: 30000,
          retries: 1,
          retryDelay: 2000,
        },
        async () => {
          const deletedCount = await McpOperations.cleanupExpiredUnassignedClients();
          if (deletedCount > 0) {
            log.info('MCP OAuth', `Cleaned up ${deletedCount} unassigned temporary clients (expired 10min)`);
          }
        }
      );
    } catch (err) {
      log.error('MCP OAuth', 'Failed to cleanup expired unassigned clients', { error: err });
    }
  }, 5 * 60 * 1000);

  log.info('MCP OAuth', 'Temporary client cleanup job started (interval: 5min)');
}
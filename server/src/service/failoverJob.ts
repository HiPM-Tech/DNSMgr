import { FailoverOperations, getDbType } from '../db/business-adapter';
import { getFailoverConfig, getFailoverStatus, performHealthCheck, performFailover, FailoverConfig } from './failover';
import { taskManager } from './taskManager';
import { connect } from '../db/core/connection';
import { log } from '../lib/logger';

export async function startFailoverJob() {
  // 每 10 秒检查一次，但使用任务管理器控制并发
  setInterval(async () => {
    try {
      const dbType = getDbType();
      const enabledValue = dbType === 'postgresql' ? true : 1;
      const configs = await FailoverOperations.getAllEnabled() as { id: number }[];

      if (configs.length === 0) {
        return; // 没有启用的配置
      }

      // 使用任务管理器并发处理所有故障转移配置
      const tasks = configs.map(({ id }) => {
        return taskManager.submit(
          {
            id: `failover-${id}`,
            name: `Failover Check: Config ${id}`,
            concurrency: 5,       // 允许最多5个并发检查
            timeout: 30000,       // 30秒超时
            retries: 1,           // 失败重试1次
            retryDelay: 2000,     // 重试间隔2秒
          },
          async () => {
            const config = await getFailoverConfig(id);
            if (!config) return;

            const status = await getFailoverStatus(id);

            // Check if it's time to run
            if (status) {
              const lastCheckTime = new Date(status.lastCheckTime).getTime();
              const nowTime = Date.now();
              if (nowTime - lastCheckTime < config.checkInterval * 1000) {
                return; // Not yet time to check
              }
            }

            const { available: isHealthy } = await performHealthCheck(config, status!);

            // Decide what to do based on health and current status
            const isCurrentlyPrimary = status ? status.isPrimary : true;
            const currentIp = status ? status.currentIp : config.primaryIp;

            if (isHealthy) {
              if (!isCurrentlyPrimary && config.autoSwitchBack) {
                // Switch back to primary
                await performFailover(config, status!, config.primaryIp, true, 0); // 0 means system
              } else {
                // Just update last_check_at and last_check_status
                await updateCheckStatus(config.id, true, isCurrentlyPrimary, currentIp);
              }
            } else {
              if (isCurrentlyPrimary && config.backupIps && config.backupIps.length > 0) {
                // Need to failover
                const toIp = config.backupIps[0]; // Simplest approach: pick first backup IP
                await performFailover(config, status!, toIp, false, 0);
              } else {
                await updateCheckStatus(config.id, false, isCurrentlyPrimary, currentIp);
              }
            }
          }
        );
      });

      // 等待所有任务完成
      await Promise.all(tasks);
    } catch (e) {
      // Check if it's a connection error, try to reconnect
      if (e instanceof Error && e.message.includes('Database connection not initialized')) {
        log.warn('FailoverJob', 'Database connection lost, attempting to reconnect...');
        try {
          await connect();
          log.info('FailoverJob', 'Database reconnected successfully');
        } catch (reconnectError) {
          log.error('FailoverJob', 'Failed to reconnect to database', { error: reconnectError });
        }
      } else {
        log.error('FailoverJob', 'Error', { error: e });
      }
    }
  }, 10000); // check every 10 seconds, but inside we respect checkInterval
}

async function updateCheckStatus(configId: number, isHealthy: boolean, isPrimary: boolean, currentIp: string) {
  const dbType = getDbType();
  const isHealthyInt = isHealthy ? 1 : 0;
  const isPrimaryInt = isPrimary ? 1 : 0;

  if (dbType === 'sqlite') {
    await FailoverOperations.updateCheckStatusSQLite(configId, currentIp, isPrimaryInt, isHealthyInt);
  } else if (dbType === 'mysql') {
    await FailoverOperations.updateCheckStatusMySQL(configId, currentIp, isPrimaryInt, isHealthyInt);
  } else {
    await FailoverOperations.updateCheckStatusPostgreSQL(configId, currentIp, isPrimaryInt, isHealthyInt);
  }
}

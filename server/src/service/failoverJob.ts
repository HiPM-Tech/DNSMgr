import { query, get, execute, getDbType } from '../db';
import { getFailoverConfig, getFailoverStatus, performHealthCheck, performFailover, FailoverConfig } from './failover';

export function startFailoverJob() {
  setInterval(async () => {
    try {
      const dbType = getDbType();
      const enabledValue = dbType === 'postgresql' ? true : 1;
      const configs = await query<{ id: number }>(
        'SELECT id FROM failover_configs WHERE enabled = ?',
        [enabledValue]
      );
      
      for (const { id } of configs) {
        const config = await getFailoverConfig(id);
        if (!config) continue;

        const status = await getFailoverStatus(id);
        
        // Check if it's time to run
        if (status) {
           const lastCheckTime = new Date(status.lastCheckTime).getTime();
           const nowTime = Date.now();
           if (nowTime - lastCheckTime < config.checkInterval * 1000) {
             continue; // Not yet time to check
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
    } catch (e) {
      console.error('[Failover Job] Error:', e);
    }
  }, 10000); // check every 10 seconds, but inside we respect checkInterval
}

async function updateCheckStatus(configId: number, isHealthy: boolean, isPrimary: boolean, currentIp: string) {
  const dbType = getDbType();
  const isHealthyInt = isHealthy ? 1 : 0;
  const isPrimaryInt = isPrimary ? 1 : 0;

  if (dbType === 'sqlite') {
    await execute(`
      INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, switch_count)
      VALUES (?, ?, ?, datetime('now'), ?, 0)
      ON CONFLICT(config_id) DO UPDATE SET
        last_check_time = datetime('now'),
        last_check_result = excluded.last_check_result
    `, [configId, currentIp, isPrimaryInt, isHealthyInt]);
  } else if (dbType === 'mysql') {
    await execute(
      `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, switch_count)
       VALUES (?, ?, ?, NOW(), ?, 0)
       ON DUPLICATE KEY UPDATE
       last_check_time = NOW(),
       last_check_result = VALUES(last_check_result)`,
      [configId, currentIp, isPrimaryInt, isHealthyInt]
    );
  } else {
    await execute(
      `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, switch_count)
       VALUES ($1, $2, $3, NOW(), $4, 0)
       ON CONFLICT(config_id) DO UPDATE SET
       last_check_time = NOW(),
       last_check_result = EXCLUDED.last_check_result`,
      [configId, currentIp, isPrimaryInt, isHealthyInt]
    );
  }
}

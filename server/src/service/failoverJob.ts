import { getAdapter } from '../db/adapter';
import { getFailoverConfig, getFailoverStatus, performHealthCheck, performFailover, FailoverConfig } from './failover';

export function startFailoverJob() {
  setInterval(async () => {
    try {
      const db = getAdapter();
      if (!db) return;

      const configs = await db.query('SELECT id FROM failover_configs WHERE enabled = 1') as { id: number }[];
      for (const { id } of configs) {
        const config = await getFailoverConfig(id);
        if (!config) continue;

        const status = await getFailoverStatus(id);
        
        // Check if it's time to run
        if (status) {
           const lastCheckTime = new Date(status.lastCheckAt).getTime();
           const now = Date.now();
           if (now - lastCheckTime < config.checkInterval * 1000) {
             continue; // Not yet time to check
           }
        }

        const isHealthy = await performHealthCheck(config);
        
        // Decide what to do based on health and current status
        const isCurrentlyPrimary = status ? status.isPrimary : true;
        const currentIp = status ? status.currentIp : config.primaryIp;

        if (isHealthy) {
          if (!isCurrentlyPrimary && config.autoSwitchBack) {
            // Switch back to primary
            await performFailover(config.id, config.primaryIp, 0); // 0 means system
          } else {
             // Just update last_check_at and last_check_status
             await updateCheckStatus(config.id, true, isCurrentlyPrimary, currentIp);
          }
        } else {
          if (isCurrentlyPrimary && config.backupIps && config.backupIps.length > 0) {
            // Need to failover
            const toIp = config.backupIps[0]; // Simplest approach: pick first backup IP
            await performFailover(config.id, toIp, 0);
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
  const db = getAdapter();
  if (!db) return;
  const isHealthyInt = isHealthy ? 1 : 0;
  const isPrimaryInt = isPrimary ? 1 : 0;

  if (db.type === 'sqlite') {
    const stmt = (db as any).prepare(`
      INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_at, last_check_status, switch_count)
      VALUES (?, ?, ?, datetime('now'), ?, 0)
      ON CONFLICT(config_id) DO UPDATE SET
        last_check_at = datetime('now'),
        last_check_status = excluded.last_check_status
    `);
    stmt.run(configId, currentIp, isPrimaryInt, isHealthyInt);
  } else {
    const sql = db.type === 'mysql'
      ? `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_at, last_check_status, switch_count)
         VALUES (?, ?, ?, NOW(), ?, 0)
         ON DUPLICATE KEY UPDATE
         last_check_at = NOW(),
         last_check_status = VALUES(last_check_status)`
      : `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_at, last_check_status, switch_count)
         VALUES ($1, $2, $3, NOW(), $4, 0)
         ON CONFLICT(config_id) DO UPDATE SET
         last_check_at = NOW(),
         last_check_status = EXCLUDED.last_check_status`;

    await db.execute(sql, [configId, currentIp, isPrimary, isHealthy]);
  }
}

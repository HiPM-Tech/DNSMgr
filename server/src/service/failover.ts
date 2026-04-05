import { getAdapter } from '../db/adapter';
import { logAuditOperation } from './audit';

/**
 * 容灾切换服务
 */

export interface FailoverConfig {
  id: number;
  domainId: number;
  primaryIp: string;
  backupIps: string[];
  checkMethod: 'http' | 'tcp' | 'ping';
  checkInterval: number; // 秒
  checkPort: number;
  checkPath?: string;
  autoSwitchBack: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FailoverStatus {
  configId: number;
  currentIp: string;
  isPrimary: boolean;
  lastCheckAt: string;
  lastCheckStatus: boolean;
  switchCount: number;
}

/**
 * 创建容灾配置
 */
export async function createFailoverConfig(
  domainId: number,
  primaryIp: string,
  backupIps: string[],
  checkMethod: 'http' | 'tcp' | 'ping' = 'http',
  checkInterval: number = 300,
  checkPort: number = 80,
  checkPath?: string,
  autoSwitchBack: boolean = true
): Promise<FailoverConfig> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  if (db.type === 'sqlite') {
    const stmt = (db as any).prepare(`
      INSERT INTO failover_configs (
        domain_id, primary_ip, backup_ips, check_method, check_interval,
        check_port, check_path, auto_switch_back, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `);
    stmt.run(
      domainId,
      primaryIp,
      JSON.stringify(backupIps),
      checkMethod,
      checkInterval,
      checkPort,
      checkPath || null,
      autoSwitchBack ? 1 : 0
    );
  } else {
    const sql = db.type === 'mysql'
      ? `INSERT INTO failover_configs (
           domain_id, primary_ip, backup_ips, check_method, check_interval,
           check_port, check_path, auto_switch_back, enabled, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`
      : `INSERT INTO failover_configs (
           domain_id, primary_ip, backup_ips, check_method, check_interval,
           check_port, check_path, auto_switch_back, enabled, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())`;

    await db.execute(sql, [
      domainId,
      primaryIp,
      JSON.stringify(backupIps),
      checkMethod,
      checkInterval,
      checkPort,
      checkPath || null,
      autoSwitchBack,
    ]);
  }

  return {
    id: 0,
    domainId,
    primaryIp,
    backupIps,
    checkMethod,
    checkInterval,
    checkPort,
    checkPath,
    autoSwitchBack,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 获取容灾配置
 */
export async function getFailoverConfig(configId: number): Promise<FailoverConfig | null> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const result = await db.get(
    'SELECT * FROM failover_configs WHERE id = ?',
    [configId]
  );

  if (!result) return null;

  return {
    id: (result as any).id,
    domainId: (result as any).domain_id,
    primaryIp: (result as any).primary_ip,
    backupIps: JSON.parse((result as any).backup_ips || '[]'),
    checkMethod: (result as any).check_method,
    checkInterval: (result as any).check_interval,
    checkPort: (result as any).check_port,
    checkPath: (result as any).check_path,
    autoSwitchBack: !!(result as any).auto_switch_back,
    enabled: !!(result as any).enabled,
    createdAt: (result as any).created_at,
    updatedAt: (result as any).updated_at,
  };
}

/**
 * 获取域名的容灾配置
 */
export async function getFailoverConfigByDomain(domainId: number): Promise<FailoverConfig | null> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const result = await db.get(
    'SELECT * FROM failover_configs WHERE domain_id = ? LIMIT 1',
    [domainId]
  );

  if (!result) return null;

  return {
    id: (result as any).id,
    domainId: (result as any).domain_id,
    primaryIp: (result as any).primary_ip,
    backupIps: JSON.parse((result as any).backup_ips || '[]'),
    checkMethod: (result as any).check_method,
    checkInterval: (result as any).check_interval,
    checkPort: (result as any).check_port,
    checkPath: (result as any).check_path,
    autoSwitchBack: !!(result as any).auto_switch_back,
    enabled: !!(result as any).enabled,
    createdAt: (result as any).created_at,
    updatedAt: (result as any).updated_at,
  };
}

/**
 * 获取容灾状态
 */
export async function getFailoverStatus(configId: number): Promise<FailoverStatus | null> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const result = await db.get(
    'SELECT * FROM failover_status WHERE config_id = ? LIMIT 1',
    [configId]
  );

  if (!result) return null;

  return {
    configId: (result as any).config_id,
    currentIp: (result as any).current_ip,
    isPrimary: !!(result as any).is_primary,
    lastCheckAt: (result as any).last_check_at,
    lastCheckStatus: !!(result as any).last_check_status,
    switchCount: (result as any).switch_count,
  };
}

/**
 * 执行健康检查
 */
export async function performHealthCheck(config: FailoverConfig): Promise<boolean> {
  try {
    if (config.checkMethod === 'http') {
      const url = `http://${config.primaryIp}:${config.checkPort}${config.checkPath || '/'}`;
      const response = await fetch(url, { timeout: 5000 });
      return response.ok;
    } else if (config.checkMethod === 'tcp') {
      // TCP 检查需要使用 net 模块
      return await checkTcpConnection(config.primaryIp, config.checkPort);
    } else if (config.checkMethod === 'ping') {
      // Ping 检查需要使用 child_process
      return await checkPing(config.primaryIp);
    }
  } catch (error) {
    console.error('[Failover] Health check failed:', error);
  }
  return false;
}

/**
 * TCP 连接检查
 */
async function checkTcpConnection(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 5000);

    socket.connect(port, host, () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Ping 检查
 */
async function checkPing(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    const command = process.platform === 'win32' ? `ping -n 1 ${host}` : `ping -c 1 ${host}`;

    exec(command, { timeout: 5000 }, (error: Error | null) => {
      resolve(!error);
    });
  });
}

/**
 * 执行容灾切换
 */
export async function performFailover(
  configId: number,
  toIp: string,
  userId: number
): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const config = await getFailoverConfig(configId);
  if (!config) throw new Error('Failover config not found');

  // 更新 DNS 记录（这里需要调用相应的 DNS 提供商 API）
  // 这是一个占位符，实际实现需要根据 DNS 提供商而定

  // 更新容灾状态
  const isPrimary = toIp === config.primaryIp;
  const status = await getFailoverStatus(configId);
  const switchCount = (status?.switchCount || 0) + 1;

  if (db.type === 'sqlite') {
    const stmt = (db as any).prepare(`
      INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_at, last_check_status, switch_count)
      VALUES (?, ?, ?, datetime('now'), 1, ?)
      ON CONFLICT(config_id) DO UPDATE SET
        current_ip = excluded.current_ip,
        is_primary = excluded.is_primary,
        last_check_at = datetime('now'),
        last_check_status = 1,
        switch_count = excluded.switch_count
    `);
    stmt.run(configId, toIp, isPrimary ? 1 : 0, switchCount);
  } else {
    const sql = db.type === 'mysql'
      ? `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_at, last_check_status, switch_count)
         VALUES (?, ?, ?, NOW(), 1, ?)
         ON DUPLICATE KEY UPDATE
         current_ip = VALUES(current_ip),
         is_primary = VALUES(is_primary),
         last_check_at = NOW(),
         last_check_status = 1,
         switch_count = VALUES(switch_count)`
      : `INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_at, last_check_status, switch_count)
         VALUES ($1, $2, $3, NOW(), true, $4)
         ON CONFLICT(config_id) DO UPDATE SET
         current_ip = EXCLUDED.current_ip,
         is_primary = EXCLUDED.is_primary,
         last_check_at = NOW(),
         last_check_status = true,
         switch_count = EXCLUDED.switch_count`;

    await db.execute(sql, [configId, toIp, isPrimary, switchCount]);
  }

  // 记录审计日志
  await logAuditOperation(userId, 'failover_switch', config.primaryIp, {
    fromIp: config.primaryIp,
    toIp,
    configId,
  });
}

/**
 * 更新容灾配置
 */
export async function updateFailoverConfig(
  configId: number,
  updates: Partial<FailoverConfig>
): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.primaryIp) {
    fields.push('primary_ip = ?');
    values.push(updates.primaryIp);
  }
  if (updates.backupIps) {
    fields.push('backup_ips = ?');
    values.push(JSON.stringify(updates.backupIps));
  }
  if (updates.checkMethod) {
    fields.push('check_method = ?');
    values.push(updates.checkMethod);
  }
  if (updates.checkInterval) {
    fields.push('check_interval = ?');
    values.push(updates.checkInterval);
  }
  if (updates.checkPort) {
    fields.push('check_port = ?');
    values.push(updates.checkPort);
  }
  if (updates.checkPath !== undefined) {
    fields.push('check_path = ?');
    values.push(updates.checkPath || null);
  }
  if (updates.autoSwitchBack !== undefined) {
    fields.push('auto_switch_back = ?');
    values.push(updates.autoSwitchBack ? 1 : 0);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ' + (db.type === 'sqlite' ? "datetime('now')" : 'NOW()'));
  values.push(configId);

  const sql = `UPDATE failover_configs SET ${fields.join(', ')} WHERE id = ?`;
  await db.execute(sql, values);
}

/**
 * 删除容灾配置
 */
export async function deleteFailoverConfig(configId: number): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  await db.execute('DELETE FROM failover_configs WHERE id = ?', [configId]);
  await db.execute('DELETE FROM failover_status WHERE config_id = ?', [configId]);
}

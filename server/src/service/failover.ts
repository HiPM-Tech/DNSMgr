import { query, get, execute, insert, run, withTransaction } from '../db';
import { logAuditOperation } from './audit';
import { createAdapter } from '../lib/dns/DnsHelper';
import { sendNotification } from './notification';

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
  id: number;
  configId: number;
  currentIp: string;
  isPrimary: boolean;
  lastCheckTime: string;
  lastCheckResult: boolean;
  failCount: number;
  switchCount: number;
  lastSwitchTime?: string;
}

/**
 * 获取容灾配置（按域名ID）
 * @deprecated 使用 getFailoverConfig
 */
export async function getFailoverConfigByDomain(domainId: number): Promise<FailoverConfig | null> {
  return getFailoverConfig(domainId);
}

/**
 * 创建容灾配置
 * @deprecated 使用 saveFailoverConfig
 */
export async function createFailoverConfig(
  domainId: number,
  config: Omit<FailoverConfig, 'id' | 'domainId' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  return saveFailoverConfig(domainId, config);
}

/**
 * 更新容灾配置
 * @deprecated 使用 saveFailoverConfig
 */
export async function updateFailoverConfig(
  domainId: number,
  config: Partial<Omit<FailoverConfig, 'id' | 'domainId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const existing = await get('SELECT id FROM failover_configs WHERE domain_id = ?', [domainId]) as any;
  if (!existing) {
    throw new Error('Failover config not found');
  }
  
  const fields: string[] = [];
  const values: unknown[] = [];
  
  if (config.primaryIp !== undefined) { fields.push('primary_ip = ?'); values.push(config.primaryIp); }
  if (config.backupIps !== undefined) { fields.push('backup_ips = ?'); values.push(JSON.stringify(config.backupIps)); }
  if (config.checkMethod !== undefined) { fields.push('check_method = ?'); values.push(config.checkMethod); }
  if (config.checkInterval !== undefined) { fields.push('check_interval = ?'); values.push(config.checkInterval); }
  if (config.checkPort !== undefined) { fields.push('check_port = ?'); values.push(config.checkPort); }
  if (config.checkPath !== undefined) { fields.push('check_path = ?'); values.push(config.checkPath); }
  if (config.autoSwitchBack !== undefined) { fields.push('auto_switch_back = ?'); values.push(config.autoSwitchBack ? 1 : 0); }
  if (config.enabled !== undefined) { fields.push('enabled = ?'); values.push(config.enabled ? 1 : 0); }
  
  if (fields.length > 0) {
    values.push(existing.id);
    await execute(`UPDATE failover_configs SET ${fields.join(', ')} WHERE id = ?`, values);
  }
}

/**
 * 执行健康检查
 */
export async function performHealthCheck(
  config: FailoverConfig,
  status: FailoverStatus
): Promise<{ available: boolean; responseTime: number }> {
  const startTime = Date.now();
  const available = await checkIpAvailability(
    status.currentIp,
    config.checkMethod,
    config.checkPort,
    config.checkPath
  );
  const responseTime = Date.now() - startTime;
  return { available, responseTime };
}

/**
 * 获取容灾配置
 */
export async function getFailoverConfig(domainId: number): Promise<FailoverConfig | null> {
  const row = await get('SELECT * FROM failover_configs WHERE domain_id = ?', [domainId]) as any;
  if (!row) return null;

  return {
    id: row.id,
    domainId: row.domain_id,
    primaryIp: row.primary_ip,
    backupIps: JSON.parse(row.backup_ips || '[]'),
    checkMethod: row.check_method,
    checkInterval: row.check_interval,
    checkPort: row.check_port,
    checkPath: row.check_path,
    autoSwitchBack: row.auto_switch_back === 1,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 获取容灾状态
 */
export async function getFailoverStatus(configId: number): Promise<FailoverStatus | null> {
  const row = await get('SELECT * FROM failover_status WHERE config_id = ?', [configId]) as any;
  if (!row) return null;

  return {
    id: row.id,
    configId: row.config_id,
    currentIp: row.current_ip,
    isPrimary: row.is_primary === 1,
    lastCheckTime: row.last_check_time,
    lastCheckResult: row.last_check_result === 1,
    failCount: row.fail_count,
    switchCount: row.switch_count,
    lastSwitchTime: row.last_switch_time,
  };
}

/**
 * 创建或更新容灾配置
 */
export async function saveFailoverConfig(
  domainId: number,
  config: Omit<FailoverConfig, 'id' | 'domainId' | 'createdAt' | 'updatedAt'>
): Promise<number> {
  const existing = await get('SELECT id FROM failover_configs WHERE domain_id = ?', [domainId]) as any;

  const data = {
    domain_id: domainId,
    primary_ip: config.primaryIp,
    backup_ips: JSON.stringify(config.backupIps),
    check_method: config.checkMethod,
    check_interval: config.checkInterval,
    check_port: config.checkPort,
    check_path: config.checkPath,
    auto_switch_back: config.autoSwitchBack ? 1 : 0,
    enabled: config.enabled ? 1 : 0,
  };

  if (existing) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    await execute(`UPDATE failover_configs SET ${fields} WHERE id = ?`, [...values, existing.id]);
    return existing.id;
  } else {
    const fields = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const id = await insert(`INSERT INTO failover_configs (${fields}) VALUES (${placeholders})`, Object.values(data));

    // 初始化状态记录
    await execute(
      'INSERT INTO failover_status (config_id, current_ip, is_primary, last_check_time, last_check_result, fail_count, switch_count) VALUES (?, ?, ?, datetime("now"), ?, ?, ?)',
      [id, config.primaryIp, 1, 1, 0, 0]
    );

    return id;
  }
}

/**
 * 删除容灾配置
 */
export async function deleteFailoverConfig(domainId: number): Promise<void> {
  const config = await get('SELECT id FROM failover_configs WHERE domain_id = ?', [domainId]) as any;
  if (config) {
    await execute('DELETE FROM failover_status WHERE config_id = ?', [config.id]);
    await execute('DELETE FROM failover_configs WHERE id = ?', [config.id]);
  }
}

/**
 * 检查IP可用性
 */
export async function checkIpAvailability(
  ip: string,
  method: 'http' | 'tcp' | 'ping',
  port: number,
  path?: string
): Promise<boolean> {
  try {
    if (method === 'ping') {
      // 使用 ping 检查
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);

      const { stdout } = await execAsync(`ping -n 1 -w 3000 ${ip}`);
      return stdout.includes('TTL=') || stdout.includes('time=');
    } else if (method === 'tcp') {
      // 使用 TCP 连接检查
      const net = require('net');
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.on('error', () => {
          resolve(false);
        });
        socket.connect(port, ip);
      });
    } else {
      // HTTP 检查
      const fetch = require('node-fetch');
      const url = `http://${ip}:${port}${path || '/'}`;
      const response = await fetch(url, { timeout: 5000 });
      return response.ok;
    }
  } catch {
    return false;
  }
}

/**
 * 执行容灾切换
 */
export async function performFailover(
  config: FailoverConfig,
  status: FailoverStatus,
  targetIp: string,
  isPrimary: boolean,
  userId: number
): Promise<void> {
  const currentIp = status?.currentIp || config.primaryIp;

  // 使用事务保护容灾切换操作
  await withTransaction(async (txDb) => {
    // 更新 DNS 记录
    const domainRow = await txDb.get('SELECT * FROM domains WHERE id = ?', [config.domainId]) as any;
    if (!domainRow) {
      throw new Error('Domain not found');
    }

    const accountRow = await txDb.get('SELECT * FROM dns_accounts WHERE id = ?', [domainRow.account_id]) as any;
    if (!accountRow) {
      throw new Error('DNS account not found');
    }

    // 获取当前 DNS 记录
    const dnsAdapter = createAdapter(accountRow.type, JSON.parse(accountRow.config));
    const result = await dnsAdapter.getDomainRecords(domainRow.name);
    const records = result.list || [];

    // 找到需要更新的 A 记录
    const aRecords = records.filter((r: any) => r.type === 'A' && r.value === currentIp);
    if (aRecords.length === 0) {
      throw new Error('No matching A record found');
    }

    // 更新 DNS 记录
    for (const record of aRecords) {
      await dnsAdapter.updateDomainRecord(
        record.RecordId,
        record.Name,
        record.Type,
        targetIp,
        record.Line,
        record.TTL,
        record.MX,
        record.Weight,
        record.Remark
      );
    }

    // 更新状态
    await txDb.execute(
      'UPDATE failover_status SET current_ip = ?, is_primary = ?, last_switch_time = datetime("now"), switch_count = switch_count + 1 WHERE config_id = ?',
      [targetIp, isPrimary ? 1 : 0, config.id]
    );

    // 记录审计日志
    await logAuditOperation(userId, 'failover_switch', 'domain', {
      domainId: config.domainId,
      fromIp: currentIp,
      toIp: targetIp,
      isPrimary,
    });

    // 发送通知
    await sendNotification(
      '[容灾切换] DNSMgr',
      `域名 ${domainRow.name} 已从 ${currentIp} 切换至 ${targetIp}`
    );
  });
}

/**
 * 获取所有启用的容灾配置
 */
export async function getAllEnabledFailoverConfigs(): Promise<FailoverConfig[]> {
  const rows = await query('SELECT * FROM failover_configs WHERE enabled = 1') as any[];
  return rows.map(row => ({
    id: row.id,
    domainId: row.domain_id,
    primaryIp: row.primary_ip,
    backupIps: JSON.parse(row.backup_ips || '[]'),
    checkMethod: row.check_method,
    checkInterval: row.check_interval,
    checkPort: row.check_port,
    checkPath: row.check_path,
    autoSwitchBack: row.auto_switch_back === 1,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * 更新容灾状态
 */
export async function updateFailoverStatus(
  configId: number,
  updates: Partial<Omit<FailoverStatus, 'id' | 'configId'>>
): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.currentIp !== undefined) {
    fields.push('current_ip = ?');
    values.push(updates.currentIp);
  }
  if (updates.isPrimary !== undefined) {
    fields.push('is_primary = ?');
    values.push(updates.isPrimary ? 1 : 0);
  }
  if (updates.lastCheckTime !== undefined) {
    fields.push('last_check_time = ?');
    values.push(updates.lastCheckTime);
  }
  if (updates.lastCheckResult !== undefined) {
    fields.push('last_check_result = ?');
    values.push(updates.lastCheckResult ? 1 : 0);
  }
  if (updates.failCount !== undefined) {
    fields.push('fail_count = ?');
    values.push(updates.failCount);
  }

  if (fields.length > 0) {
    values.push(configId);
    await execute(`UPDATE failover_status SET ${fields.join(', ')} WHERE config_id = ?`, values);
  }
}

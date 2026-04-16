import { FailoverOperations, DomainOperations, withTransaction, TransactionOperations } from '../db/business-adapter';
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
  const existing = await FailoverOperations.getByDomain(domainId) as any;
  if (!existing) {
    throw new Error('Failover config not found');
  }

  const updates: Record<string, unknown> = {};

  if (config.primaryIp !== undefined) { updates.primary_ip = config.primaryIp; }
  if (config.backupIps !== undefined) { updates.backup_ips = JSON.stringify(config.backupIps); }
  if (config.checkMethod !== undefined) { updates.check_method = config.checkMethod; }
  if (config.checkInterval !== undefined) { updates.check_interval = config.checkInterval; }
  if (config.checkPort !== undefined) { updates.check_port = config.checkPort; }
  if (config.checkPath !== undefined) { updates.check_path = config.checkPath; }
  if (config.autoSwitchBack !== undefined) { updates.auto_switch_back = config.autoSwitchBack ? 1 : 0; }
  if (config.enabled !== undefined) { updates.enabled = config.enabled ? 1 : 0; }

  if (Object.keys(updates).length > 0) {
    await FailoverOperations.update(existing.id, updates);
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
  const row = await FailoverOperations.getByDomain(domainId) as any;
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
  const row = await FailoverOperations.getStatus(configId) as any;
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
  const existing = await FailoverOperations.getByDomain(domainId) as any;

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
    await FailoverOperations.update(existing.id, data);
    return existing.id;
  } else {
    const id = await FailoverOperations.create(data);

    // 初始化状态记录
    await FailoverOperations.initStatus(id, config.primaryIp);

    return id;
  }
}

/**
 * 删除容灾配置
 */
export async function deleteFailoverConfig(domainId: number): Promise<void> {
  const config = await FailoverOperations.getByDomain(domainId) as any;
  if (config) {
    await FailoverOperations.delete(config.id);
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
  await withTransaction(async (txDb: TransactionOperations) => {
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
  const rows = await FailoverOperations.getAllEnabled() as any[];
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
  const data: Record<string, unknown> = {};

  if (updates.currentIp !== undefined) {
    data.current_ip = updates.currentIp;
  }
  if (updates.isPrimary !== undefined) {
    data.is_primary = updates.isPrimary ? 1 : 0;
  }
  if (updates.lastCheckTime !== undefined) {
    data.last_check_time = updates.lastCheckTime;
  }
  if (updates.lastCheckResult !== undefined) {
    data.last_check_result = updates.lastCheckResult ? 1 : 0;
  }
  if (updates.failCount !== undefined) {
    data.fail_count = updates.failCount;
  }

  if (Object.keys(data).length > 0) {
    await FailoverOperations.updateStatus(configId, data);
  }
}

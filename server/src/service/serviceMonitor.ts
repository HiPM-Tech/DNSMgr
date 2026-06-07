import https from 'https';
import http from 'http';
import { ServiceMonitorOperations, getDbType } from '../db/bal/business-adapter';
import { createLogger } from '../lib/logger';
import { httpsRequest } from '../lib/proxy-http';
import { sendNotification } from './notification';

const log = createLogger('Service').sub('ServiceMonitor');

export interface ServiceMonitorMonitor {
  id: number;
  userId: number;
  name: string;
  type: 'ssl_certificate' | 'endpoint' | 'dns_failover';
  target: string;
  domainId: number | null;
  config: Record<string, unknown>;
  checkInterval: number;
  checkTimeout: number;
  enabled: boolean;
  notifyOnFailure: boolean;
  notifyOnRecovery: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceMonitorStatus {
  id: number;
  monitorId: number;
  status: 'ok' | 'warning' | 'error' | 'unknown';
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastResponseTime: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  resultData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface SSLCertConfig {
  port?: number;
  warn_days?: number;
}

interface EndpointConfig {
  method?: string;
  expected_status?: number;
  expected_body?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface DnsFailoverConfig {
  primary_ip: string;
  backup_ips?: string[];
  check_method?: 'http' | 'tcp' | 'ping';
  check_port?: number;
  check_path?: string;
}

/**
 * 获取用户的所有监控
 */
export async function getMonitors(userId: number): Promise<(ServiceMonitorMonitor & { status?: ServiceMonitorStatus })[]> {
  const rows = await ServiceMonitorOperations.getByUser(userId) as any[];
  const monitors: (ServiceMonitorMonitor & { status?: ServiceMonitorStatus })[] = [];

  for (const row of rows) {
    const monitor: ServiceMonitorMonitor & { status?: ServiceMonitorStatus } = rowToMonitor(row);
    const statusRow = await ServiceMonitorOperations.getStatus(monitor.id) as any;
    if (statusRow) {
      monitor.status = rowToStatus(statusRow);
    }
    monitors.push(monitor);
  }

  return monitors;
}

/**
 * 获取单个监控（含状态）
 */
export async function getMonitor(id: number): Promise<(ServiceMonitorMonitor & { status?: ServiceMonitorStatus }) | null> {
  const row = await ServiceMonitorOperations.getById(id) as any;
  if (!row) return null;

  const monitor: ServiceMonitorMonitor & { status?: ServiceMonitorStatus } = rowToMonitor(row);
  const statusRow = await ServiceMonitorOperations.getStatus(monitor.id) as any;
  if (statusRow) {
    monitor.status = rowToStatus(statusRow);
  }
  return monitor;
}

/**
 * 创建监控
 */
export async function createMonitor(data: {
  userId: number;
  name: string;
  type: string;
  target: string;
  domainId?: number;
  config: Record<string, unknown>;
  checkInterval?: number;
  checkTimeout?: number;
  enabled?: boolean;
  notifyOnFailure?: boolean;
  notifyOnRecovery?: boolean;
}): Promise<number> {
  const insertData: Record<string, unknown> = {
    user_id: data.userId,
    name: data.name,
    type: data.type,
    target: data.target,
    config: JSON.stringify(data.config),
    check_interval: data.checkInterval || 300,
    check_timeout: data.checkTimeout || 10,
    enabled: data.enabled !== false ? 1 : 0,
    notify_on_failure: data.notifyOnFailure !== false ? 1 : 0,
    notify_on_recovery: data.notifyOnRecovery !== false ? 1 : 0,
  };

  if (data.domainId !== undefined) {
    insertData.domain_id = data.domainId;
  }

  const id = await ServiceMonitorOperations.create(insertData);

  // 初始化状态记录
  await ServiceMonitorOperations.initStatus(id);

  return id;
}

/**
 * 更新监控
 */
export async function updateMonitor(id: number, data: Partial<{
  name: string;
  type: string;
  target: string;
  domainId: number | null;
  config: Record<string, unknown>;
  checkInterval: number;
  checkTimeout: number;
  enabled: boolean;
  notifyOnFailure: boolean;
  notifyOnRecovery: boolean;
}>): Promise<void> {
  const updates: Record<string, unknown> = {};

  if (data.name !== undefined) updates.name = data.name;
  if (data.type !== undefined) updates.type = data.type;
  if (data.target !== undefined) updates.target = data.target;
  if (data.domainId !== undefined) updates.domain_id = data.domainId;
  if (data.config !== undefined) updates.config = JSON.stringify(data.config);
  if (data.checkInterval !== undefined) updates.check_interval = data.checkInterval;
  if (data.checkTimeout !== undefined) updates.check_timeout = data.checkTimeout;
  if (data.enabled !== undefined) updates.enabled = data.enabled ? 1 : 0;
  if (data.notifyOnFailure !== undefined) updates.notify_on_failure = data.notifyOnFailure ? 1 : 0;
  if (data.notifyOnRecovery !== undefined) updates.notify_on_recovery = data.notifyOnRecovery ? 1 : 0;

  if (Object.keys(updates).length > 0) {
    await ServiceMonitorOperations.update(id, updates);
  }
}

/**
 * 删除监控
 */
export async function deleteMonitor(id: number): Promise<void> {
  await ServiceMonitorOperations.delete(id);
}

/**
 * 执行健康检查（分派到对应的检查器）
 */
export async function performCheck(monitor: ServiceMonitorMonitor): Promise<{
  status: 'ok' | 'warning' | 'error';
  responseTime: number | null;
  error: string | null;
  resultData: Record<string, unknown> | null;
}> {
  switch (monitor.type) {
    case 'ssl_certificate':
      return checkSSL(monitor.target, monitor.config as SSLCertConfig);
    case 'endpoint':
      return checkEndpoint(monitor.target, monitor.config as EndpointConfig, monitor.checkTimeout);
    case 'dns_failover':
      return checkFailover(monitor);
    default:
      return { status: 'error', responseTime: null, error: `Unknown monitor type: ${monitor.type}`, resultData: null };
  }
}

/**
 * SSL 证书检查
 */
export async function checkSSL(
  target: string,
  config: SSLCertConfig
): Promise<{
  status: 'ok' | 'warning' | 'error';
  responseTime: number | null;
  error: string | null;
  resultData: Record<string, unknown> | null;
}> {
  const startTime = Date.now();
  const port = config.port || 443;
  const warnDays = config.warn_days || 30;

  return new Promise((resolve) => {
    const req = https.get(`https://${target}:${port}`, { rejectUnauthorized: false }, (res) => {
      const cert = (res.socket as any).getPeerCertificate();
      if (!cert || !cert.valid_to) {
        resolve({
          status: 'error',
          responseTime: Date.now() - startTime,
          error: 'Could not retrieve SSL certificate',
          resultData: null,
        });
        return;
      }

      const expiryDate = new Date(cert.valid_to);
      const now = new Date();
      const daysLeft = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const responseTime = Date.now() - startTime;

      res.destroy();

      if (daysLeft <= 0) {
        resolve({
          status: 'error',
          responseTime,
          error: `SSL certificate has expired on ${cert.valid_to}`,
          resultData: { issuer: cert.issuer, validFrom: cert.valid_from, validTo: cert.valid_to, daysLeft, subject: cert.subject },
        });
      } else if (daysLeft <= warnDays) {
        resolve({
          status: 'warning',
          responseTime,
          error: `SSL certificate expires in ${daysLeft} days (threshold: ${warnDays} days)`,
          resultData: { issuer: cert.issuer, validFrom: cert.valid_from, validTo: cert.valid_to, daysLeft, subject: cert.subject },
        });
      } else {
        resolve({
          status: 'ok',
          responseTime,
          error: null,
          resultData: { issuer: cert.issuer, validFrom: cert.valid_from, validTo: cert.valid_to, daysLeft, subject: cert.subject },
        });
      }
    });

    req.setTimeout(config.port ? 10000 : 10000, () => {
      req.destroy();
      resolve({
        status: 'error',
        responseTime: Date.now() - startTime,
        error: 'SSL check timed out',
        resultData: null,
      });
    });

    req.on('error', (err) => {
      resolve({
        status: 'error',
        responseTime: Date.now() - startTime,
        error: `SSL check failed: ${err.message}`,
        resultData: null,
      });
    });
  });
}

/**
 * HTTP 端点检查
 */
export async function checkEndpoint(
  target: string,
  config: EndpointConfig,
  timeout: number
): Promise<{
  status: 'ok' | 'warning' | 'error';
  responseTime: number | null;
  error: string | null;
  resultData: Record<string, unknown> | null;
}> {
  const startTime = Date.now();
  const method = config.method || 'GET';
  const expectedStatus = config.expected_status || 200;

  try {
    const response = await httpsRequest(target, {
      method,
      headers: config.headers || {},
      body: config.body,
      timeout: timeout * 1000,
    });

    const responseTime = Date.now() - startTime;

    if (response.status !== expectedStatus) {
      return {
        status: 'error',
        responseTime,
        error: `Expected status ${expectedStatus}, got ${response.status}`,
        resultData: { statusCode: response.status, responseTime, bodyPreview: response.data.substring(0, 500) },
      };
    }

    if (config.expected_body && !response.data.includes(config.expected_body)) {
      return {
        status: 'error',
        responseTime,
        error: `Response body does not contain expected text`,
        resultData: { statusCode: response.status, responseTime, bodyPreview: response.data.substring(0, 500) },
      };
    }

    return {
      status: 'ok',
      responseTime,
      error: null,
      resultData: { statusCode: response.status, responseTime },
    };
  } catch (err: any) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'error',
      responseTime,
      error: `Endpoint check failed: ${err.message}`,
      resultData: null,
    };
  }
}

/**
 * DNS 故障转移检查
 * 简化版：只检查主 IP 是否可用，不做 DNS 记录切换
 */
export async function checkFailover(
  monitor: ServiceMonitorMonitor
): Promise<{
  status: 'ok' | 'warning' | 'error';
  responseTime: number | null;
  error: string | null;
  resultData: Record<string, unknown> | null;
}> {
  const config = monitor.config as unknown as DnsFailoverConfig;
  const startTime = Date.now();
  const checkMethod = config.check_method || 'ping';
  const checkPort = config.check_port || 80;
  const checkPath = config.check_path || '/';

  try {
    const available = await checkIpAvailability(config.primary_ip, checkMethod, checkPort, checkPath);
    const responseTime = Date.now() - startTime;

    if (available) {
      return {
        status: 'ok',
        responseTime,
        error: null,
        resultData: { primaryIp: config.primary_ip, available: true, method: checkMethod },
      };
    } else {
      const backupCount = config.backup_ips?.length || 0;
      let status: 'ok' | 'warning' | 'error' = 'error';
      let error: string | null = `Primary IP ${config.primary_ip} is not reachable`;

      if (backupCount > 0) {
        error += `. ${backupCount} backup IP(s) configured but not automatically switching`;
        status = 'warning';
      }

      return {
        status,
        responseTime,
        error,
        resultData: { primaryIp: config.primary_ip, available: false, method: checkMethod },
      };
    }
  } catch (err: any) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'error',
      responseTime,
      error: `Failover check failed: ${err.message}`,
      resultData: null,
    };
  }
}

/**
 * 获取所有启用的监控
 */
export async function getAllEnabled(): Promise<ServiceMonitorMonitor[]> {
  const rows = await ServiceMonitorOperations.getAllEnabled() as any[];
  return rows.map(rowToMonitor);
}

/**
 * 执行检查并更新状态 + 触发通知
 */
export async function runCheckAndUpdate(monitor: ServiceMonitorMonitor): Promise<void> {
  const result = await performCheck(monitor);
  const dbType = getDbType();
  const newStatus = result.status;

  // 获取当前状态
  const currentStatus = await ServiceMonitorOperations.getStatus(monitor.id) as any;

  if (dbType === 'sqlite') {
    await ServiceMonitorOperations.updateCheckStatusSQLite(monitor.id, newStatus, result.responseTime, result.error);
  } else if (dbType === 'mysql') {
    await ServiceMonitorOperations.updateCheckStatusMySQL(monitor.id, newStatus, result.responseTime, result.error);
  } else {
    await ServiceMonitorOperations.updateCheckStatusPostgreSQL(monitor.id, newStatus, result.responseTime, result.error);
  }

  // 更新 consecutive 计数
  const consecutiveUpdates: Record<string, unknown> = {};
  if (newStatus === 'ok') {
    consecutiveUpdates.consecutive_successes = (currentStatus?.consecutive_successes || 0) + 1;
    consecutiveUpdates.consecutive_failures = 0;
  } else {
    consecutiveUpdates.consecutive_failures = (currentStatus?.consecutive_failures || 0) + 1;
    consecutiveUpdates.consecutive_successes = 0;
  }
  await ServiceMonitorOperations.updateStatus(monitor.id, consecutiveUpdates);

  // 结果数据更新
  if (result.resultData) {
    await ServiceMonitorOperations.updateStatus(monitor.id, { result_data: JSON.stringify(result.resultData) });
  }

  // 发送通知
  if (result.error && monitor.notifyOnFailure) {
    const wasPreviouslyOk = currentStatus?.status === 'ok' || currentStatus?.status === 'warning';
    if (wasPreviouslyOk) {
      try {
        await sendNotification(
          '[服务监控] 监控告警',
          `监控 "${monitor.name}" (${monitor.target}) 状态异常: ${result.error}`
        );
      } catch (notifyError) {
        log.error('Failed to send failure notification', { error: notifyError, monitorId: monitor.id });
      }
    }
  } else if (!result.error && monitor.notifyOnRecovery) {
    const wasPreviouslyError = currentStatus?.status === 'error';
    if (wasPreviouslyError) {
      try {
        await sendNotification(
          '[服务监控] 恢复通知',
          `监控 "${monitor.name}" (${monitor.target}) 已恢复`
        );
      } catch (notifyError) {
        log.error('Failed to send recovery notification', { error: notifyError, monitorId: monitor.id });
      }
    }
  }
}

/**
 * 检查 IP 可用性
 */
async function checkIpAvailability(
  ip: string,
  method: 'http' | 'tcp' | 'ping',
  port: number,
  path?: string
): Promise<boolean> {
  try {
    if (method === 'ping') {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      const { stdout } = await execAsync(`ping -n 1 -w 3000 ${ip}`);
      return stdout.includes('TTL=') || stdout.includes('time=');
    } else if (method === 'tcp') {
      const net = require('net');
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { resolve(false); });
        socket.connect(port, ip);
      });
    } else {
      const url = `http://${ip}:${port}${path || '/'}`;
      const response = await httpsRequest(url, { method: 'GET', timeout: 5000 });
      return response.status < 500;
    }
  } catch {
    return false;
  }
}

function rowToMonitor(row: any): ServiceMonitorMonitor {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type,
    target: row.target,
    domainId: row.domain_id || null,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}),
    checkInterval: row.check_interval,
    checkTimeout: row.check_timeout,
    enabled: row.enabled === 1 || row.enabled === true,
    notifyOnFailure: row.notify_on_failure === 1 || row.notify_on_failure === true,
    notifyOnRecovery: row.notify_on_recovery === 1 || row.notify_on_recovery === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToStatus(row: any): ServiceMonitorStatus {
  return {
    id: row.id,
    monitorId: row.monitor_id,
    status: row.status,
    lastCheckAt: row.last_check_at || null,
    lastSuccessAt: row.last_success_at || null,
    lastFailureAt: row.last_failure_at || null,
    lastError: row.last_error || null,
    lastResponseTime: row.last_response_time || null,
    consecutiveFailures: row.consecutive_failures || 0,
    consecutiveSuccesses: row.consecutive_successes || 0,
    resultData: row.result_data ? (typeof row.result_data === 'string' ? JSON.parse(row.result_data) : row.result_data) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
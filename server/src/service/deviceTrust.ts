/**
 * 设备信任管理服务
 * 管理受信任设备，用于减少 2FA 频率
 */

import crypto from 'crypto';
import { query, get, execute } from '../db';
import { log } from '../lib/logger';
import { getSecurityPolicy } from './securityPolicy';

export interface TrustedDevice {
  id: string;
  userId: number;
  deviceName: string;
  deviceFingerprint: string;
  userAgent: string;
  ipAddress: string;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface DeviceInfo {
  userAgent: string;
  ipAddress: string;
}

/**
 * 创建设备指纹
 */
export function createDeviceFingerprint(userAgent: string, ipAddress: string): string {
  const data = `${userAgent}:${ipAddress}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * 生成设备 ID
 */
export function generateDeviceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 初始化受信任设备表
 */
export async function initTrustedDevicesTable(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;
  
  try {
    await execute(sql);
    // 创建索引
    await execute('CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id)');
    await execute('CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint ON trusted_devices(device_fingerprint)');
    log.info('DeviceTrust', 'Initialized trusted_devices table');
  } catch (error) {
    log.error('DeviceTrust', 'Failed to init table:', { error });
    throw error;
  }
}

/**
 * 添加受信任设备
 */
export async function addTrustedDevice(
  userId: number,
  deviceInfo: DeviceInfo,
  deviceName?: string
): Promise<string> {
  await initTrustedDevicesTable();
  
  const policy = await getSecurityPolicy();
  const deviceId = generateDeviceId();
  const fingerprint = createDeviceFingerprint(deviceInfo.userAgent, deviceInfo.ipAddress);
  
  // 计算过期时间
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + policy.trustedDeviceDays);
  
  // 设备名称
  const name = deviceName || generateDeviceName(deviceInfo.userAgent);
  
  await execute(
    `INSERT INTO trusted_devices (
      id, user_id, device_name, device_fingerprint,
      user_agent, ip_address, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      deviceId,
      userId,
      name,
      fingerprint,
      deviceInfo.userAgent,
      deviceInfo.ipAddress,
      expiresAt.toISOString(),
    ]
  );
  
  log.info('DeviceTrust', `Added trusted device for user ${userId}: ${name}`);
  return deviceId;
}

/**
 * 验证设备是否受信任
 */
export async function verifyTrustedDevice(
  userId: number,
  deviceInfo: DeviceInfo
): Promise<{ trusted: boolean; deviceId?: string }> {
  const policy = await getSecurityPolicy();
  
  // 如果不允许记住设备，直接返回不信任
  if (!policy.allowRememberDevice) {
    return { trusted: false };
  }
  
  const fingerprint = createDeviceFingerprint(deviceInfo.userAgent, deviceInfo.ipAddress);
  
  const device = await get(
    `SELECT id, expires_at FROM trusted_devices 
     WHERE user_id = ? AND device_fingerprint = ?`,
    [userId, fingerprint]
  ) as any;
  
  if (!device) {
    return { trusted: false };
  }
  
  // 检查是否过期
  const expiresAt = new Date(device.expires_at);
  if (expiresAt < new Date()) {
    // 删除过期设备
    await execute('DELETE FROM trusted_devices WHERE id = ?', [device.id]);
    log.debug('DeviceTrust', `Removed expired device ${device.id}`);
    return { trusted: false };
  }
  
  // 更新最后使用时间
  await execute(
    'UPDATE trusted_devices SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
    [device.id]
  );
  
  return { trusted: true, deviceId: device.id };
}

/**
 * 获取用户的受信任设备列表
 */
export async function getUserTrustedDevices(userId: number): Promise<TrustedDevice[]> {
  const rows = await query(
    `SELECT 
      id,
      user_id as userId,
      device_name as deviceName,
      device_fingerprint as deviceFingerprint,
      user_agent as userAgent,
      ip_address as ipAddress,
      last_used_at as lastUsedAt,
      expires_at as expiresAt,
      created_at as createdAt
    FROM trusted_devices 
    WHERE user_id = ? 
    ORDER BY last_used_at DESC`,
    [userId]
  ) as any[];
  
  return rows.map(row => ({
    ...row,
    lastUsedAt: new Date(row.lastUsedAt),
    expiresAt: new Date(row.expiresAt),
    createdAt: new Date(row.createdAt),
  }));
}

/**
 * 删除受信任设备
 */
export async function removeTrustedDevice(userId: number, deviceId: string): Promise<boolean> {
  const result = await execute(
    'DELETE FROM trusted_devices WHERE id = ? AND user_id = ?',
    [deviceId, userId]
  );
  
  if (result > 0) {
    log.info('DeviceTrust', `Removed trusted device ${deviceId} for user ${userId}`);
    return true;
  }
  
  return false;
}

/**
 * 删除用户的所有受信任设备
 */
export async function removeAllUserTrustedDevices(userId: number): Promise<void> {
  await execute('DELETE FROM trusted_devices WHERE user_id = ?', [userId]);
  log.info('DeviceTrust', `Removed all trusted devices for user ${userId}`);
}

/**
 * 清理所有过期设备
 */
export async function cleanupExpiredDevices(): Promise<number> {
  const result = await execute(
    'DELETE FROM trusted_devices WHERE expires_at < CURRENT_TIMESTAMP'
  );
  
  if (result > 0) {
    log.info('DeviceTrust', `Cleaned up ${result} expired devices`);
  }
  
  return result;
}

/**
 * 根据 User-Agent 生成设备名称
 */
function generateDeviceName(userAgent: string): string {
  // 简单解析 User-Agent
  if (userAgent.includes('Windows')) return 'Windows Device';
  if (userAgent.includes('Mac')) return 'Mac Device';
  if (userAgent.includes('Linux')) return 'Linux Device';
  if (userAgent.includes('Android')) return 'Android Device';
  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('iPad')) return 'iPad';
  return 'Unknown Device';
}

/**
 * 设备信任管理服务
 * 管理受信任设备，用于减少 2FA 频率
 */

import crypto from 'crypto';
import { TrustedDeviceOperations, getDbType } from '../db/business-adapter';
import { log } from '../lib/logger';
import { getSecurityPolicy } from './securityPolicy';

/**
 * 初始化受信任设备表
 */
export async function initTrustedDevicesTable(): Promise<void> {
  // 表初始化已在业务适配器中处理，此函数保留用于兼容性
  log.debug('DeviceTrust', 'Trusted devices table initialized');
}

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
 * 添加受信任设备
 */
export async function addTrustedDevice(
  userId: number,
  deviceInfo: DeviceInfo,
  deviceName?: string
): Promise<string> {
  const policy = await getSecurityPolicy();
  const deviceId = generateDeviceId();
  const fingerprint = createDeviceFingerprint(deviceInfo.userAgent, deviceInfo.ipAddress);

  // 计算过期时间
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + policy.trustedDeviceDays);

  // 设备名称
  const name = deviceName || generateDeviceName(deviceInfo.userAgent);

  await TrustedDeviceOperations.add(
    deviceId,
    userId,
    name,
    fingerprint,
    deviceInfo.userAgent,
    deviceInfo.ipAddress,
    expiresAt.toISOString()
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

  const device = await TrustedDeviceOperations.getByFingerprint(userId, fingerprint);

  if (!device) {
    return { trusted: false };
  }

  // 检查是否过期
  const expiresAt = new Date(device.expires_at as string);
  if (expiresAt < new Date()) {
    // 删除过期设备
    await TrustedDeviceOperations.delete(device.id as string);
    log.debug('DeviceTrust', `Removed expired device ${device.id}`);
    return { trusted: false };
  }

  // 更新最后使用时间
  await TrustedDeviceOperations.updateLastUsed(device.id as string);

  return { trusted: true, deviceId: device.id as string };
}

/**
 * 获取用户的受信任设备列表
 */
export async function getUserTrustedDevices(userId: number): Promise<TrustedDevice[]> {
  const rows = await TrustedDeviceOperations.getByUser(userId);

  return rows.map(row => ({
    ...row,
    lastUsedAt: new Date(row.lastUsedAt as string),
    expiresAt: new Date(row.expiresAt as string),
    createdAt: new Date(row.createdAt as string),
  })) as TrustedDevice[];
}

/**
 * 删除受信任设备
 */
export async function removeTrustedDevice(userId: number, deviceId: string): Promise<boolean> {
  const changes = await TrustedDeviceOperations.deleteByUserAndId(userId, deviceId);

  if (changes > 0) {
    log.info('DeviceTrust', `Removed trusted device ${deviceId} for user ${userId}`);
    return true;
  }

  return false;
}

/**
 * 删除用户的所有受信任设备
 */
export async function removeAllUserTrustedDevices(userId: number): Promise<void> {
  await TrustedDeviceOperations.deleteByUser(userId);
  log.info('DeviceTrust', `Removed all trusted devices for user ${userId}`);
}

/**
 * 清理所有过期设备
 */
export async function cleanupExpiredDevices(): Promise<number> {
  const count = await TrustedDeviceOperations.cleanupExpired();

  if (count > 0) {
    log.info('DeviceTrust', `Cleaned up ${count} expired devices`);
  }

  return count;
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

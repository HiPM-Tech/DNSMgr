/**
 * 安全策略服务
 * 管理系统级安全策略和用户级安全设置
 */

import { SecurityPolicyOperations } from '../db/business-adapter';
import { log } from '../lib/logger';

// zxcvbn 是 CommonJS 模块，需要这样导入
import zxcvbn from 'zxcvbn';

export interface SecurityPolicy {
  id?: number;
  // 全局强制 2FA
  require2FAGlobal: boolean;
  // 密码最小长度
  minPasswordLength: number;
  // 密码最小强度 (0-4, zxcvbn score)
  minPasswordStrength: number;
  // 会话超时时间（小时）
  sessionTimeoutHours: number;
  // 最大登录失败次数
  maxLoginAttempts: number;
  // 锁定时间（分钟）
  lockoutDurationMinutes: number;
  // 允许记住设备
  allowRememberDevice: boolean;
  // 信任设备有效期（天）
  trustedDeviceDays: number;
  // 首次登录强制修改密码
  requirePasswordChangeOnFirstLogin: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PasswordStrengthResult {
  score: number; // 0-4
  feedback: {
    warning: string;
    suggestions: string[];
  };
  crackTime: string;
  isStrong: boolean;
}

const DEFAULT_POLICY: SecurityPolicy = {
  require2FAGlobal: false,
  minPasswordLength: 8,
  minPasswordStrength: 2, // 0-4, 2 = 中等强度
  sessionTimeoutHours: 24,
  maxLoginAttempts: 5,
  lockoutDurationMinutes: 30,
  allowRememberDevice: true,
  trustedDeviceDays: 30,
  requirePasswordChangeOnFirstLogin: false,
};

/**
 * 初始化安全策略表
 */
export async function initSecurityPolicyTable(): Promise<void> {
  try {
    // 检查是否已有策略记录
    const existing = await SecurityPolicyOperations.exists();
    if (!existing) {
      // 插入默认策略
      await SecurityPolicyOperations.initPolicy([
        DEFAULT_POLICY.require2FAGlobal ? 1 : 0,
        DEFAULT_POLICY.minPasswordLength,
        DEFAULT_POLICY.minPasswordStrength,
        DEFAULT_POLICY.sessionTimeoutHours,
        DEFAULT_POLICY.maxLoginAttempts,
        DEFAULT_POLICY.lockoutDurationMinutes,
        DEFAULT_POLICY.allowRememberDevice ? 1 : 0,
        DEFAULT_POLICY.trustedDeviceDays,
        DEFAULT_POLICY.requirePasswordChangeOnFirstLogin ? 1 : 0,
      ]);
      log.info('SecurityPolicy', 'Initialized default security policy');
    }
  } catch (error) {
    log.error('SecurityPolicy', 'Failed to init table:', { error });
    throw error;
  }
}

/**
 * 获取当前安全策略
 */
export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  try {
    const row = await SecurityPolicyOperations.getPolicy();

    if (!row) {
      await initSecurityPolicyTable();
      return DEFAULT_POLICY;
    }

    return {
      ...row,
      require2FAGlobal: Boolean(row.require2FAGlobal),
      allowRememberDevice: Boolean(row.allowRememberDevice),
      requirePasswordChangeOnFirstLogin: Boolean(row.requirePasswordChangeOnFirstLogin),
    } as SecurityPolicy;
  } catch (error) {
    log.error('SecurityPolicy', 'Failed to get policy:', { error });
    return DEFAULT_POLICY;
  }
}

/**
 * 更新安全策略
 */
export async function updateSecurityPolicy(policy: Partial<SecurityPolicy>): Promise<void> {
  const current = await getSecurityPolicy();
  const updates: Record<string, unknown> = {};

  if (policy.require2FAGlobal !== undefined) {
    updates.require_2fa_global = policy.require2FAGlobal ? 1 : 0;
  }
  if (policy.minPasswordLength !== undefined) {
    updates.min_password_length = policy.minPasswordLength;
  }
  if (policy.minPasswordStrength !== undefined) {
    updates.min_password_strength = policy.minPasswordStrength;
  }
  if (policy.sessionTimeoutHours !== undefined) {
    updates.session_timeout_hours = policy.sessionTimeoutHours;
  }
  if (policy.maxLoginAttempts !== undefined) {
    updates.max_login_attempts = policy.maxLoginAttempts;
  }
  if (policy.lockoutDurationMinutes !== undefined) {
    updates.lockout_duration_minutes = policy.lockoutDurationMinutes;
  }
  if (policy.allowRememberDevice !== undefined) {
    updates.allow_remember_device = policy.allowRememberDevice ? 1 : 0;
  }
  if (policy.trustedDeviceDays !== undefined) {
    updates.trusted_device_days = policy.trustedDeviceDays;
  }
  if (policy.requirePasswordChangeOnFirstLogin !== undefined) {
    updates.require_password_change_on_first_login = policy.requirePasswordChangeOnFirstLogin ? 1 : 0;
  }

  if (Object.keys(updates).length === 0) return;

  await SecurityPolicyOperations.updatePolicy(updates, current.id!);

  log.info('SecurityPolicy', 'Policy updated', policy);
}

/**
 * 检测密码强度
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const result = zxcvbn(password);

  return {
    score: result.score, // 0-4
    feedback: result.feedback,
    crackTime: result.crack_times_display.offline_slow_hashing_1e4_per_second,
    isStrong: result.score >= 2, // 2 = 中等强度以上
  };
}

/**
 * 验证密码是否符合策略
 */
export async function validatePassword(password: string): Promise<{ valid: boolean; message?: string }> {
  const policy = await getSecurityPolicy();

  if (password.length < policy.minPasswordLength) {
    return {
      valid: false,
      message: `Password must be at least ${policy.minPasswordLength} characters`
    };
  }

  const strength = checkPasswordStrength(password);
  if (strength.score < policy.minPasswordStrength) {
    return {
      valid: false,
      message: `Password is too weak. ${strength.feedback.warning || 'Please use a stronger password'}`
    };
  }

  return { valid: true };
}

/**
 * 检查用户是否需要强制 2FA
 */
export async function requires2FA(userId: number): Promise<boolean> {
  const policy = await getSecurityPolicy();

  // 全局强制 2FA
  if (policy.require2FAGlobal) {
    return true;
  }

  // 检查用户是否被强制要求 2FA
  const userSetting = await SecurityPolicyOperations.getUserSecuritySetting(userId);

  return userSetting?.require_2fa === 1;
}

/**
 * 检查用户是否已完成 2FA 设置
 */
export async function has2FAEnabled(userId: number): Promise<boolean> {
  return SecurityPolicyOperations.has2FA(userId);
}

import { Router } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { SecurityPolicyOperations, TrustedDeviceOperations, getDbType, UserOperations } from '../db/business-adapter';
import { getSecurityPolicy, updateSecurityPolicy, checkPasswordStrength, validatePassword, requires2FA, has2FAEnabled } from '../service/securityPolicy';
import { generateTOTPSecret, enableTOTP, disableTOTP, getTOTPStatus, verifyTOTPToken } from '../service/totp';
import { log } from '../lib/logger';

const router = Router();

// 获取安全策略
router.get('/policy', authMiddleware, adminOnly, async (req, res) => {
  try {
    const policy = await getSecurityPolicy();
    res.json({ success: true, data: policy });
  } catch (error) {
    log.error('Security', 'Failed to get security policy:', { error });
    res.status(500).json({ success: false, message: 'Failed to get security policy' });
  }
});

// 更新安全策略
router.put('/policy', authMiddleware, adminOnly, async (req, res) => {
  try {
    const policy = req.body;
    await updateSecurityPolicy(policy);
    res.json({ success: true, message: 'Security policy updated' });
  } catch (error) {
    log.error('Security', 'Failed to update security policy:', { error });
    res.status(500).json({ success: false, message: 'Failed to update security policy' });
  }
});

// 检查密码强度
router.post('/password-strength', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const result = checkPasswordStrength(password);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Security', 'Failed to check password strength:', { error });
    res.status(500).json({ success: false, message: 'Failed to check password strength' });
  }
});

// 验证密码是否符合策略
router.post('/validate-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const result = await validatePassword(password);
    res.json({ success: true, data: result });
  } catch (error) {
    log.error('Security', 'Failed to validate password:', { error });
    res.status(500).json({ success: false, message: 'Failed to validate password' });
  }
});

// 检查当前用户是否需要 2FA
router.get('/requires-2fa', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const required = await requires2FA(userId);
    res.json({ success: true, data: { required } });
  } catch (error) {
    log.error('Security', 'Failed to check 2FA requirement:', { error });
    res.status(500).json({ success: false, message: 'Failed to check 2FA requirement' });
  }
});

// 检查当前用户是否已启用 2FA
router.get('/2fa-status', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const status = await getTOTPStatus(userId);
    res.json({ success: true, data: status });
  } catch (error) {
    log.error('Security', 'Failed to check 2FA status:', { error });
    res.status(500).json({ success: false, message: 'Failed to check 2FA status' });
  }
});

// 设置 TOTP 2FA
router.post('/2fa/setup', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const user = await UserOperations.getById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const email = (user as { email?: string }).email;
    const username = (user as { username: string }).username;
    const setup = await generateTOTPSecret(userId, email || username);
    res.json({ success: true, data: setup });
  } catch (error) {
    log.error('Security', 'Failed to setup 2FA:', { error });
    res.status(500).json({ success: false, message: 'Failed to setup 2FA' });
  }
});

// 启用 TOTP 2FA
router.post('/2fa/enable', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { secret, token, backupCodes } = req.body;

    if (!secret || !token || !backupCodes) {
      return res.status(400).json({ success: false, message: 'secret, token, and backupCodes are required' });
    }

    // 验证 TOTP 令牌
    if (!verifyTOTPToken(secret, token)) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    await enableTOTP(userId, secret, backupCodes);
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (error) {
    log.error('Security', 'Failed to enable 2FA:', { error });
    res.status(500).json({ success: false, message: 'Failed to enable 2FA' });
  }
});

// 禁用 TOTP 2FA
router.post('/2fa/disable', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { token } = req.body;

    // 验证当前 TOTP 令牌才能禁用
    const status = await getTOTPStatus(userId);
    if (!status.enabled) {
      return res.status(400).json({ success: false, message: '2FA is not enabled' });
    }

    await disableTOTP(userId);
    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    log.error('Security', 'Failed to disable 2FA:', { error });
    res.status(500).json({ success: false, message: 'Failed to disable 2FA' });
  }
});

// 获取用户的受信任设备列表
router.get('/trusted-devices', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const devices = await TrustedDeviceOperations.getByUser(userId);
    res.json({ success: true, data: devices });
  } catch (error) {
    log.error('Security', 'Failed to get trusted devices:', { error });
    res.status(500).json({ success: false, message: 'Failed to get trusted devices' });
  }
});

// 删除受信任设备
router.delete('/trusted-devices/:deviceId', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { deviceId } = req.params;
    const changes = await TrustedDeviceOperations.deleteByUserAndId(userId, deviceId);

    if (changes > 0) {
      res.json({ success: true, message: 'Device removed' });
    } else {
      res.status(404).json({ success: false, message: 'Device not found' });
    }
  } catch (error) {
    log.error('Security', 'Failed to remove trusted device:', { error });
    res.status(500).json({ success: false, message: 'Failed to remove trusted device' });
  }
});

// 删除所有受信任设备
router.delete('/trusted-devices', authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    await TrustedDeviceOperations.deleteByUser(userId);
    res.json({ success: true, message: 'All devices removed' });
  } catch (error) {
    log.error('Security', 'Failed to remove all trusted devices:', { error });
    res.status(500).json({ success: false, message: 'Failed to remove all trusted devices' });
  }
});

// 设置用户是否需要 2FA（管理员功能）
router.post('/user-require-2fa', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { userId, require2FA } = req.body;
    if (userId === undefined || require2FA === undefined) {
      return res.status(400).json({ success: false, message: 'userId and require2FA are required' });
    }

    await SecurityPolicyOperations.updateUser2FARequirement(userId, require2FA);
    res.json({ success: true, message: 'User 2FA requirement updated' });
  } catch (error) {
    log.error('Security', 'Failed to update user 2FA requirement:', { error });
    res.status(500).json({ success: false, message: 'Failed to update user 2FA requirement' });
  }
});

export default router;

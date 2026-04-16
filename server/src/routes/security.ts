import { Router } from 'express';
import { authMiddleware, adminOnly } from '../middleware/auth';
import { SecurityPolicyOperations, TrustedDeviceOperations, getDbType } from '../db/business-adapter';
import { getSecurityPolicy, updateSecurityPolicy, checkPasswordStrength, validatePassword, requires2FA, has2FAEnabled } from '../service/securityPolicy';
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
    const enabled = await has2FAEnabled(userId);
    res.json({ success: true, data: { enabled } });
  } catch (error) {
    log.error('Security', 'Failed to check 2FA status:', { error });
    res.status(500).json({ success: false, message: 'Failed to check 2FA status' });
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

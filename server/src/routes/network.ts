/**
 * Network Routes
 * 网络信息路由 - 代理配置管理
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { log } from '../lib/logger';
import { SettingsOperations } from '../db/business-adapter';

const router = Router();

/**
 * 代理配置接口
 */
interface ProxyConfig {
  enabled: boolean;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/**
 * 获取代理配置
 */
async function getProxyConfig(): Promise<ProxyConfig | null> {
  try {
    log.debug('Network', 'Getting proxy config from database');
    const configValue = await SettingsOperations.get('proxy_config');
    log.debug('Network', 'Proxy config raw value', { configValue: configValue || 'null' });
    if (!configValue) return null;
    const parsed = JSON.parse(configValue);
    log.debug('Network', 'Proxy config parsed', { enabled: parsed.enabled, type: parsed.type, host: parsed.host });
    return parsed;
  } catch (error) {
    log.warn('Network', 'Failed to get proxy config', { error: (error as Error).message });
    return null;
  }
}

/**
 * 获取代理配置
 * GET /api/network/proxy
 */
router.get('/proxy', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const config = await getProxyConfig();
  res.json({
    code: 0,
    msg: 'success',
    data: config || {
      enabled: false,
      type: 'http',
      host: '',
      port: 8080,
    },
  });
}));

/**
 * 更新代理配置
 * POST /api/network/proxy
 */
router.post('/proxy', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { enabled, type, host, port, username, password } = req.body;

  const config: ProxyConfig = {
    enabled: !!enabled,
    type: type === 'socks5' ? 'socks5' : 'http',
    host: host || '',
    port: parseInt(port) || 8080,
    username: username || undefined,
    password: password || undefined,
  };

  const configJson = JSON.stringify(config);
  log.debug('Network', 'Saving proxy config to database', { configJson });
  await SettingsOperations.set('proxy_config', configJson);

  // 验证保存是否成功
  const verifyValue = await SettingsOperations.get('proxy_config');
  log.debug('Network', 'Verify proxy config saved', { verifyValue: verifyValue || 'null' });

  log.info('Network', 'Proxy configuration updated', { enabled, type, host, port });

  res.json({
    code: 0,
    msg: 'success',
    data: config,
  });
}));

export default router;

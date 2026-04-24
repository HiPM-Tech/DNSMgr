/**
 * Network Routes
 * 网络信息路由 - 代理配置管理和网络连通性检测
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { log } from '../lib/logger';
import { SettingsOperations } from '../db/business-adapter';
import { getProxyConfig, createProxyAgent } from '../lib/proxy-http';
import https from 'https';
import http from 'http';

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
 * 连通性检测结果接口
 */
interface ConnectivityResult {
  name: string;
  url: string;
  status: 'ok' | 'error' | 'timeout';
  latency: number; // 毫秒
  error?: string;
}

/**
 * 从数据库获取代理配置
 */
async function getProxyConfigFromDB(): Promise<ProxyConfig | null> {
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
  const config = await getProxyConfigFromDB();
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

/**
 * 测试单个URL的连通性
 */
function testConnectivity(url: string, agent?: any, timeout: number = 10000): Promise<{ status: number; latency: number; error?: string }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'HEAD',
      timeout: timeout,
    } as https.RequestOptions;

    if (agent) {
      requestOptions.agent = agent;
    }

    const client = isHttps ? https : http;
    
    const req = client.request(requestOptions, (res) => {
      const latency = Date.now() - startTime;
      resolve({
        status: res.statusCode || 0,
        latency,
      });
    });

    req.on('error', (error) => {
      const latency = Date.now() - startTime;
      resolve({
        status: 0,
        latency,
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 0,
        latency: timeout,
        error: 'Request timeout',
      });
    });

    req.end();
  });
}

/**
 * 要测试的连通性目标
 */
const CONNECTIVITY_TARGETS = [
  { name: 'Baidu', url: 'https://www.baidu.com' },
  { name: 'Google', url: 'https://www.google.com' },
  { name: 'Apple', url: 'https://www.apple.com' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com' },
];

/**
 * 测试网络连通性
 * GET /api/network/connectivity
 */
router.get('/connectivity', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  log.debug('Network', 'Testing network connectivity');
  
  // 获取代理配置
  const proxyConfig = await getProxyConfig();
  const agent = proxyConfig?.enabled ? createProxyAgent(proxyConfig) : undefined;
  
  const results: ConnectivityResult[] = [];
  
  // 并行测试所有目标
  const tests = CONNECTIVITY_TARGETS.map(async (target) => {
    try {
      const result = await testConnectivity(target.url, agent, 10000);
      
      let status: 'ok' | 'error' | 'timeout' = 'error';
      if (result.error === 'Request timeout') {
        status = 'timeout';
      } else if (result.status >= 200 && result.status < 400) {
        status = 'ok';
      }
      
      return {
        name: target.name,
        url: target.url,
        status,
        latency: result.latency,
        error: result.error,
      } as ConnectivityResult;
    } catch (error) {
      return {
        name: target.name,
        url: target.url,
        status: 'error' as const,
        latency: 0,
        error: (error as Error).message,
      } as ConnectivityResult;
    }
  });
  
  const settledResults = await Promise.all(tests);
  results.push(...settledResults);
  
  log.debug('Network', 'Connectivity test completed', { results });
  
  res.json({
    code: 0,
    msg: 'success',
    data: {
      proxyEnabled: proxyConfig?.enabled || false,
      results,
    },
  });
}));

export default router;

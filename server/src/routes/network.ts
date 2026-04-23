/**
 * Network Routes
 * 网络信息路由
 */

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { log } from '../lib/logger';
import https from 'https';
import http from 'http';
import { SettingsOperations } from '../db/business-adapter';

// Dynamic imports for proxy agents
let SocksProxyAgent: any;
let HttpsProxyAgent: any;

try {
  const socksModule = require('socks-proxy-agent');
  SocksProxyAgent = socksModule.SocksProxyAgent;
} catch {
  log.warn('Network', 'socks-proxy-agent not available');
}

try {
  const httpsModule = require('https-proxy-agent');
  HttpsProxyAgent = httpsModule.HttpsProxyAgent;
} catch {
  log.warn('Network', 'https-proxy-agent not available');
}

const router = Router();

// IP 查询服务列表
const IP_SERVICES = [
  { name: 'ipinfo.tw', url: 'https://ipinfo.tw/json', ipv6Url: 'https://ipinfo.tw/json' },
  { name: 'ipinfo.hinswu', url: 'https://ipinfo.hinswu.top/json', ipv6Url: 'https://ipinfo.hinswu.top/json' },
  { name: 'ipapi.co', url: 'https://ipapi.co/json/', ipv6Url: 'https://ipapi.co/json/' },
  { name: 'cloudflare', url: 'https://www.cloudflare-cn.com/cdn-cgi/trace', ipv6Url: 'https://www.cloudflare-cn.com/cdn-cgi/trace' },
];

interface IpInfo {
  ip: string;
  type: 'v4' | 'v6';
  source: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
}

/**
 * 从 cloudflare trace 响应中解析 IP
 */
function parseCloudflareTrace(data: string): { ip: string; type: 'v4' | 'v6' } | null {
  const ipMatch = data.match(/ip=([\d.:a-fA-F]+)/);
  if (!ipMatch) return null;
  
  const ip = ipMatch[1];
  const type = ip.includes(':') ? 'v6' : 'v4';
  return { ip, type };
}

/**
 * 从 JSON 响应中提取 IP 信息
 */
function parseJsonIp(data: any, source: string): IpInfo | null {
  try {
    let ip = data.ip || data.query || data.origin;
    if (!ip) return null;

    // 判断 IP 类型
    const type = ip.includes(':') ? 'v6' : 'v4';

    return {
      ip,
      type,
      source,
      country: data.country || data.country_name || data.countryCode,
      region: data.region || data.regionName,
      city: data.city,
      isp: data.isp || data.org || data.asn,
    };
  } catch (error) {
    return null;
  }
}

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
    const configValue = await SettingsOperations.get('proxy_config');
    if (!configValue) return null;
    return JSON.parse(configValue);
  } catch (error) {
    log.warn('Network', 'Failed to get proxy config', { error });
    return null;
  }
}

/**
 * 创建代理 Agent
 */
function createProxyAgent(config: ProxyConfig): any | null {
  if (!config.enabled) return null;

  try {
    if (config.type === 'socks5' && SocksProxyAgent) {
      const auth = config.username && config.password
        ? `${config.username}:${config.password}@`
        : '';
      const proxyUrl = `socks5://${auth}${config.host}:${config.port}`;
      return new SocksProxyAgent(proxyUrl);
    } else if (HttpsProxyAgent) {
      const auth = config.username && config.password
        ? `${config.username}:${config.password}@`
        : '';
      const proxyUrl = `http://${auth}${config.host}:${config.port}`;
      return new HttpsProxyAgent(proxyUrl);
    }
    log.warn('Network', 'Proxy agent not available');
    return null;
  } catch (error) {
    log.error('Network', 'Failed to create proxy agent', { error });
    return null;
  }
}

/**
 * 使用 https 请求获取数据（支持代理）
 */
function httpsGet(url: string, agent?: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      timeout: 5000,
    };
    if (agent) {
      options.agent = agent;
    }

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * 使用 http 请求获取数据（支持代理）
 */
function httpGet(url: string, agent?: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      timeout: 5000,
    };
    if (agent) {
      options.agent = agent;
    }

    http.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * 查询单个服务的 IP（支持代理）
 */
async function queryIpService(service: typeof IP_SERVICES[0], isV6: boolean = false, proxyAgent?: any): Promise<IpInfo | null> {
  try {
    const url = isV6 && service.ipv6Url ? service.ipv6Url : service.url;
    const isHttp = url.startsWith('http://');
    const data = isHttp 
      ? await httpGet(url, proxyAgent) 
      : await httpsGet(url, proxyAgent);

    if (service.name === 'cloudflare') {
      const result = parseCloudflareTrace(data);
      if (!result) return null;
      return {
        ip: result.ip,
        type: result.type,
        source: service.name,
      };
    }

    try {
      const jsonData = JSON.parse(data);
      return parseJsonIp(jsonData, service.name);
    } catch {
      return null;
    }
  } catch (error) {
    log.warn('Network', `Failed to query IP from ${service.name}`, { error });
    return null;
  }
}

/**
 * 获取服务器 IP 信息
 * GET /api/network/server-ip
 */
router.get('/server-ip', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const results: { v4: IpInfo | null; v6: IpInfo | null } = { v4: null, v6: null };

  // 获取代理配置
  const proxyConfig = await getProxyConfig();
  const proxyAgent = proxyConfig ? createProxyAgent(proxyConfig) : undefined;

  // 并行查询所有服务
  const promises = IP_SERVICES.map(async (service) => {
    const v4Result = await queryIpService(service, false, proxyAgent);
    const v6Result = await queryIpService(service, true, proxyAgent);
    return { service: service.name, v4: v4Result, v6: v6Result };
  });

  const queryResults = await Promise.allSettled(promises);

  // 收集结果，优先使用第一个成功的结果
  for (const result of queryResults) {
    if (result.status === 'fulfilled') {
      const { v4, v6 } = result.value;
      if (v4 && v4.type === 'v4' && !results.v4) {
        results.v4 = v4;
      }
      if (v6 && v6.type === 'v6' && !results.v6) {
        results.v6 = v6;
      }
    }
  }

  res.json({
    success: true,
    data: results,
  });
}));

/**
 * 获取客户端 IP 信息
 * GET /api/network/client-ip
 */
router.get('/client-ip', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // 从请求头中获取客户端 IP
  const clientIp = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.socket.remoteAddress ||
                   req.ip;

  const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
  
  if (!ip) {
    res.json({
      success: true,
      data: { v4: null, v6: null },
    });
    return;
  }

  // 清理 IP 地址（移除 IPv6 映射的 IPv4 前缀）
  const cleanIp = ip.toString().replace(/^::ffff:/, '');
  const type: 'v4' | 'v6' = cleanIp.includes(':') ? 'v6' : 'v4';

  const result: IpInfo = {
    ip: cleanIp,
    type,
    source: 'request',
  };

  res.json({
    success: true,
    data: {
      v4: type === 'v4' ? result : null,
      v6: type === 'v6' ? result : null,
    },
  });
}));

/**
 * 获取所有网络信息（服务器 + 客户端）
 * GET /api/network/info
 */
router.get('/info', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  // 获取代理配置
  const proxyConfig = await getProxyConfig();
  const proxyAgent = proxyConfig ? createProxyAgent(proxyConfig) : undefined;

  // 获取服务器 IP（通过代理）
  const serverResults: { v4: IpInfo | null; v6: IpInfo | null } = { v4: null, v6: null };

  const promises = IP_SERVICES.map(async (service) => {
    const v4Result = await queryIpService(service, false, proxyAgent);
    const v6Result = await queryIpService(service, true, proxyAgent);
    return { service: service.name, v4: v4Result, v6: v6Result };
  });

  const queryResults = await Promise.allSettled(promises);

  for (const result of queryResults) {
    if (result.status === 'fulfilled') {
      const { v4, v6 } = result.value;
      if (v4 && v4.type === 'v4' && !serverResults.v4) {
        serverResults.v4 = v4;
      }
      if (v6 && v6.type === 'v6' && !serverResults.v6) {
        serverResults.v6 = v6;
      }
    }
  }

  // 获取服务器直连 IP（不通过代理）
  const directResults: { v4: IpInfo | null; v6: IpInfo | null } = { v4: null, v6: null };
  const directPromises = IP_SERVICES.map(async (service) => {
    const v4Result = await queryIpService(service, false, undefined);
    const v6Result = await queryIpService(service, true, undefined);
    return { service: service.name, v4: v4Result, v6: v6Result };
  });

  const directQueryResults = await Promise.allSettled(directPromises);

  for (const result of directQueryResults) {
    if (result.status === 'fulfilled') {
      const { v4, v6 } = result.value;
      if (v4 && v4.type === 'v4' && !directResults.v4) {
        directResults.v4 = v4;
      }
      if (v6 && v6.type === 'v6' && !directResults.v6) {
        directResults.v6 = v6;
      }
    }
  }

  // 获取客户端 IP
  const clientIp = req.headers['x-forwarded-for'] ||
                   req.headers['x-real-ip'] ||
                   req.socket.remoteAddress ||
                   req.ip;

  const ip = Array.isArray(clientIp) ? clientIp[0] : clientIp;
  const clientResults: { v4: IpInfo | null; v6: IpInfo | null } = { v4: null, v6: null };

  if (ip) {
    const cleanIp = ip.toString().replace(/^::ffff:/, '');
    const type: 'v4' | 'v6' = cleanIp.includes(':') ? 'v6' : 'v4';

    const clientInfo: IpInfo = {
      ip: cleanIp,
      type,
      source: 'request',
    };

    if (type === 'v4') {
      clientResults.v4 = clientInfo;
    } else {
      clientResults.v6 = clientInfo;
    }
  }

  res.json({
    success: true,
    data: {
      server: serverResults,
      serverDirect: directResults,
      client: clientResults,
      proxy: proxyConfig && proxyConfig.enabled ? {
        enabled: true,
        type: proxyConfig.type,
        host: proxyConfig.host,
        port: proxyConfig.port,
      } : null,
    },
  });
}));

/**
 * 获取代理配置
 * GET /api/network/proxy
 */
router.get('/proxy', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const config = await getProxyConfig();
  res.json({
    success: true,
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

  await SettingsOperations.set('proxy_config', JSON.stringify(config));

  log.info('Network', 'Proxy configuration updated', { enabled, type, host, port });

  res.json({
    success: true,
    data: config,
  });
}));

export default router;

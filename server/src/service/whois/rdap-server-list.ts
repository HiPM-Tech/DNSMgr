/**
 * RDAP 服务器列表管理
 * 从 IANA 官方源下载并缓存 RDAP 服务器列表
 * 官方源: https://data.iana.org/rdap/dns.json
 */

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { log } from '../../lib/logger';

// IANA RDAP 服务器列表 URL
const IANA_RDAP_URL = 'https://data.iana.org/rdap/dns.json';

// 缓存文件路径
const CACHE_DIR = process.env.CACHE_DIR || path.join(process.cwd(), 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'rdap-servers.json');

// 缓存有效期（30天，单位：毫秒）
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * IANA RDAP 响应数据结构
 */
interface IanaRdapResponse {
  description: string;
  publication: string;
  services: Array<Array<string[] | string[]>>;
  version: string;
}

/**
 * RDAP 服务器配置
 */
interface RdapServerConfig {
  tld: string;
  servers: string[];
}

/**
 * 缓存数据结构
 */
interface RdapCache {
  lastUpdated: string;
  data: RdapServerConfig[];
}

/**
 * 确保缓存目录存在
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    log.info('RdapServerList', `Created cache directory: ${CACHE_DIR}`);
  }
}

/**
 * 从 IANA 下载 RDAP 服务器列表
 */
async function downloadFromIana(): Promise<IanaRdapResponse | null> {
  return new Promise((resolve, reject) => {
    log.info('RdapServerList', `Downloading RDAP server list from ${IANA_RDAP_URL}`);

    const options = {
      hostname: 'data.iana.org',
      port: 443,
      path: '/rdap/dns.json',
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DNSMgr/1.0 (RDAP Client)',
      },
      timeout: 30000,
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data) as IanaRdapResponse;
            log.info('RdapServerList', `Successfully downloaded RDAP server list`, {
              version: jsonData.version,
              publication: jsonData.publication,
              serviceCount: jsonData.services?.length || 0,
            });
            resolve(jsonData);
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * 解析 IANA RDAP 响应数据
 */
function parseIanaData(data: IanaRdapResponse): RdapServerConfig[] {
  const configs: RdapServerConfig[] = [];

  if (!data.services || !Array.isArray(data.services)) {
    log.warn('RdapServerList', 'Invalid services data from IANA');
    return configs;
  }

  for (const service of data.services) {
    if (!Array.isArray(service) || service.length < 2) {
      continue;
    }

    const [tlds, servers] = service;

    if (!Array.isArray(tlds) || !Array.isArray(servers)) {
      continue;
    }

    for (const tld of tlds) {
      if (typeof tld === 'string') {
        configs.push({
          tld: tld.toLowerCase(),
          servers: servers.filter((s): s is string => typeof s === 'string'),
        });
      }
    }
  }

  log.info('RdapServerList', `Parsed ${configs.length} RDAP server configurations`);
  return configs;
}

/**
 * 保存缓存到文件
 */
function saveCache(configs: RdapServerConfig[]): void {
  try {
    ensureCacheDir();
    const cache: RdapCache = {
      lastUpdated: new Date().toISOString(),
      data: configs,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
    log.info('RdapServerList', `Saved RDAP server list cache to ${CACHE_FILE}`);
  } catch (error) {
    log.error('RdapServerList', 'Failed to save cache', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 从缓存文件加载
 */
function loadCache(): RdapCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      log.debug('RdapServerList', 'Cache file does not exist');
      return null;
    }

    const content = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(content) as RdapCache;

    // 验证缓存结构
    if (!cache.lastUpdated || !Array.isArray(cache.data)) {
      log.warn('RdapServerList', 'Invalid cache structure');
      return null;
    }

    log.debug('RdapServerList', `Loaded cache from ${CACHE_FILE}`, {
      lastUpdated: cache.lastUpdated,
      configCount: cache.data.length,
    });

    return cache;
  } catch (error) {
    log.error('RdapServerList', 'Failed to load cache', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * 检查缓存是否过期
 */
function isCacheExpired(cache: RdapCache): boolean {
  const lastUpdated = new Date(cache.lastUpdated).getTime();
  const now = Date.now();
  const age = now - lastUpdated;

  const isExpired = age > CACHE_TTL;
  log.debug('RdapServerList', `Cache age: ${Math.floor(age / 1000 / 60 / 60)} hours, expired: ${isExpired}`);

  return isExpired;
}

/**
 * 获取 RDAP 服务器列表
 * 优先使用缓存，缓存过期或不存在时从 IANA 下载
 */
export async function getRdapServerList(forceRefresh = false): Promise<RdapServerConfig[]> {
  // 尝试加载缓存
  const cache = loadCache();

  // 如果缓存有效且未强制刷新，使用缓存
  if (!forceRefresh && cache && !isCacheExpired(cache)) {
    log.info('RdapServerList', 'Using cached RDAP server list');
    return cache.data;
  }

  // 缓存不存在或已过期，从 IANA 下载
  try {
    const ianaData = await downloadFromIana();
    if (ianaData) {
      const configs = parseIanaData(ianaData);
      saveCache(configs);
      return configs;
    }
  } catch (error) {
    log.error('RdapServerList', 'Failed to download from IANA', {
      error: error instanceof Error ? error.message : String(error),
    });

    // 下载失败但有缓存，使用过期缓存作为后备
    if (cache) {
      log.warn('RdapServerList', 'Using expired cache as fallback');
      return cache.data;
    }
  }

  // 下载失败且无缓存，返回空数组
  log.error('RdapServerList', 'No RDAP server list available');
  return [];
}

/**
 * 根据 TLD 查找 RDAP 服务器
 */
export async function findRdapServer(tld: string): Promise<string | null> {
  const normalizedTld = tld.toLowerCase().replace(/^\./, '');
  const configs = await getRdapServerList();

  const config = configs.find(c => c.tld === normalizedTld);
  if (config && config.servers.length > 0) {
    // 返回第一个服务器
    const server = config.servers[0];
    log.debug('RdapServerList', `Found RDAP server for .${normalizedTld}`, { server });
    return server;
  }

  log.debug('RdapServerList', `No RDAP server found for .${normalizedTld}`);
  return null;
}

/**
 * 根据域名查找 RDAP 服务器
 */
export async function findRdapServerForDomain(domain: string): Promise<string | null> {
  const parts = domain.toLowerCase().split('.');
  const tld = parts[parts.length - 1];
  return findRdapServer(tld);
}

/**
 * 强制刷新 RDAP 服务器列表
 */
export async function refreshRdapServerList(): Promise<RdapServerConfig[]> {
  log.info('RdapServerList', 'Force refreshing RDAP server list');
  return getRdapServerList(true);
}

/**
 * 获取缓存状态信息
 */
export function getCacheStatus(): { exists: boolean; lastUpdated?: string; age?: number; expired?: boolean } {
  const cache = loadCache();

  if (!cache) {
    return { exists: false };
  }

  const lastUpdated = new Date(cache.lastUpdated).getTime();
  const now = Date.now();
  const age = now - lastUpdated;

  return {
    exists: true,
    lastUpdated: cache.lastUpdated,
    age: Math.floor(age / 1000), // 秒
    expired: age > CACHE_TTL,
  };
}

/**
 * 初始化 RDAP 服务器列表
 * 在应用启动时调用，预加载缓存
 */
export async function initRdapServerList(): Promise<void> {
  log.info('RdapServerList', 'Initializing RDAP server list...');
  
  try {
    const configs = await getRdapServerList();
    log.info('RdapServerList', `Initialized with ${configs.length} RDAP servers`);
  } catch (error) {
    log.error('RdapServerList', 'Failed to initialize', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// 导出类型
export type { RdapServerConfig, RdapCache };

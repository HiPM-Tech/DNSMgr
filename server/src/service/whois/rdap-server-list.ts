/**
 * RDAP 服务器列表管理
 * 从 IANA 官方源下载并缓存 RDAP 服务器列表到数据库
 * 官方源: https://data.iana.org/rdap/dns.json
 */

import * as https from 'https';
import { log } from '../../lib/logger';
import { RdapCacheOperations, SystemCacheOperations } from '../../db/business-adapter';

// IANA RDAP 服务器列表 URL
const IANA_RDAP_URL = 'https://data.iana.org/rdap/dns.json';

// 缓存有效期（30天，单位：毫秒）
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

// 系统缓存键
const CACHE_KEY = 'rdap_server_list_last_update';

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
 * 保存 RDAP 服务器列表到数据库
 */
async function saveToDatabase(configs: RdapServerConfig[]): Promise<void> {
  try {
    // 清空旧缓存
    await RdapCacheOperations.clearAll();
    
    // 批量保存新数据
    await RdapCacheOperations.saveBatch(configs);
    
    // 更新缓存时间戳
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CACHE_TTL);
    await SystemCacheOperations.set(CACHE_KEY, now.toISOString(), expiresAt);
    
    log.info('RdapServerList', `Saved ${configs.length} RDAP servers to database`);
  } catch (error) {
    log.error('RdapServerList', 'Failed to save to database', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * 从数据库加载 RDAP 服务器列表
 */
async function loadFromDatabase(): Promise<RdapServerConfig[]> {
  try {
    const entries = await RdapCacheOperations.getAll();
    
    const configs: RdapServerConfig[] = entries.map(entry => ({
      tld: entry.tld as string,
      servers: JSON.parse(entry.servers as string),
    }));
    
    log.debug('RdapServerList', `Loaded ${configs.length} RDAP servers from database`);
    return configs;
  } catch (error) {
    log.error('RdapServerList', 'Failed to load from database', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * 检查缓存是否过期
 */
async function isCacheExpired(): Promise<boolean> {
  try {
    const lastUpdateStr = await SystemCacheOperations.get(CACHE_KEY);
    
    if (!lastUpdateStr) {
      log.debug('RdapServerList', 'No cache timestamp found, cache is expired');
      return true;
    }
    
    const lastUpdate = new Date(lastUpdateStr).getTime();
    const now = Date.now();
    const age = now - lastUpdate;
    
    const isExpired = age > CACHE_TTL;
    log.debug('RdapServerList', `Cache age: ${Math.floor(age / 1000 / 60 / 60)} hours, expired: ${isExpired}`);
    
    return isExpired;
  } catch (error) {
    log.warn('RdapServerList', 'Failed to check cache expiration', {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/**
 * 获取 RDAP 服务器列表
 * 优先使用数据库缓存，缓存过期或不存在时从 IANA 下载
 */
export async function getRdapServerList(forceRefresh = false): Promise<RdapServerConfig[]> {
  // 检查缓存是否有效
  const isExpired = forceRefresh || await isCacheExpired();
  
  if (!isExpired) {
    log.info('RdapServerList', 'Using cached RDAP server list from database');
    const configs = await loadFromDatabase();
    if (configs.length > 0) {
      return configs;
    }
    log.warn('RdapServerList', 'Database cache is empty, will download from IANA');
  }

  // 缓存不存在或已过期，从 IANA 下载
  try {
    const ianaData = await downloadFromIana();
    if (ianaData) {
      const configs = parseIanaData(ianaData);
      await saveToDatabase(configs);
      return configs;
    }
  } catch (error) {
    log.error('RdapServerList', 'Failed to download from IANA', {
      error: error instanceof Error ? error.message : String(error),
    });

    // 下载失败但尝试使用数据库缓存作为后备
    log.warn('RdapServerList', 'Using database cache as fallback');
    const configs = await loadFromDatabase();
    if (configs.length > 0) {
      return configs;
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
  
  try {
    const entry = await RdapCacheOperations.getByTld(normalizedTld);
    if (entry) {
      const servers = JSON.parse(entry.servers as string);
      if (servers.length > 0) {
        log.debug('RdapServerList', `Found RDAP server for .${normalizedTld}`, { server: servers[0] });
        return servers[0];
      }
    }
  } catch (error) {
    log.warn('RdapServerList', `Failed to find RDAP server for .${normalizedTld}`, {
      error: error instanceof Error ? error.message : String(error),
    });
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
export async function getCacheStatus(): Promise<{ exists: boolean; lastUpdated?: string; age?: number; expired?: boolean; count?: number }> {
  try {
    const lastUpdateStr = await SystemCacheOperations.get(CACHE_KEY);
    const stats = await RdapCacheOperations.getStats();
    
    if (!lastUpdateStr) {
      return { exists: false, count: stats.count };
    }

    const lastUpdated = new Date(lastUpdateStr).getTime();
    const now = Date.now();
    const age = now - lastUpdated;

    return {
      exists: true,
      lastUpdated: lastUpdateStr,
      age: Math.floor(age / 1000), // 秒
      expired: age > CACHE_TTL,
      count: stats.count,
    };
  } catch (error) {
    log.warn('RdapServerList', 'Failed to get cache status', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { exists: false };
  }
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
export type { RdapServerConfig };

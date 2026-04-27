/**
 * DNS 服务器配置接口
 * 定义 DNS 解析服务器的基础能力
 */

import { DNSServerType } from './types';

/**
 * DNS 服务器配置
 */
export interface DNSServerConfig {
  /** 服务器名称（唯一标识） */
  name: string;
  /** 服务器类型 */
  type: DNSServerType;
  /** 服务器地址（DoH为URL，DoT为host:port，UDP/TCP为ip:port） */
  address: string;
  /** 优先级（数字越小优先级越高） */
  priority: number;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 是否启用代理 */
  proxyEnabled: boolean;
}

/**
 * 加密 DNS 服务器列表（DoH/DoT）
 */
export const ENCRYPTED_DNS_SERVERS: DNSServerConfig[] = [
  // AdGuard DoH
  {
    name: 'adguard-doh',
    type: DNSServerType.DOH,
    address: 'https://dns.adguard-dns.com/dns-query',
    priority: 1,
    timeout: 5000,
    proxyEnabled: true,
  },
  // AdGuard DoT
  {
    name: 'adguard-dot',
    type: DNSServerType.DOT,
    address: 'dns.adguard-dns.com:853',
    priority: 2,
    timeout: 5000,
    proxyEnabled: false,
  },
  // Cloudflare DoH
  {
    name: 'cloudflare-doh',
    type: DNSServerType.DOH,
    address: 'https://dns.cloudflare.com/dns-query',
    priority: 1,
    timeout: 5000,
    proxyEnabled: true,
  },
  {
    name: 'cloudflare-doh-ipv6',
    type: DNSServerType.DOH,
    address: 'https://[2606:4700:4700::1111]/dns-query',
    priority: 2,
    timeout: 5000,
    proxyEnabled: true,
  },
  // Cloudflare DoT
  {
    name: 'cloudflare-dot',
    type: DNSServerType.DOT,
    address: 'one.one.one.one:853',
    priority: 2,
    timeout: 5000,
    proxyEnabled: false,
  },
  // Google DoH
  {
    name: 'google-doh',
    type: DNSServerType.DOH,
    address: 'https://dns.google/dns-query',
    priority: 1,
    timeout: 5000,
    proxyEnabled: true,
  },
  // Google DoT
  {
    name: 'google-dot',
    type: DNSServerType.DOT,
    address: 'dns.google:853',
    priority: 2,
    timeout: 5000,
    proxyEnabled: false,
  },
  // Quad9 DoH
  {
    name: 'quad9-doh',
    type: DNSServerType.DOH,
    address: 'https://dns.quad9.net/dns-query',
    priority: 2,
    timeout: 5000,
    proxyEnabled: true,
  },
  // AliDNS DoH
  {
    name: 'alidns-doh',
    type: DNSServerType.DOH,
    address: 'https://dns.alidns.com/dns-query',
    priority: 3,
    timeout: 5000,
    proxyEnabled: true,
  },
  // AliDNS DoT
  {
    name: 'alidns-dot',
    type: DNSServerType.DOT,
    address: 'dns.alidns.com:853',
    priority: 3,
    timeout: 5000,
    proxyEnabled: false,
  },
  // DNSPod DoH
  {
    name: 'dnspod-doh',
    type: DNSServerType.DOH,
    address: 'https://doh.pub/dns-query',
    priority: 3,
    timeout: 5000,
    proxyEnabled: true,
  },
  // DNSPod DoT
  {
    name: 'dnspod-dot',
    type: DNSServerType.DOT,
    address: 'dot.pub:853',
    priority: 3,
    timeout: 5000,
    proxyEnabled: false,
  },
];

/**
 * 明文 DNS 服务器列表（UDP/TCP）
 */
export const PLAIN_DNS_SERVERS: DNSServerConfig[] = [
  // AdGuard
  {
    name: 'adguard-udp',
    type: DNSServerType.UDP,
    address: '94.140.14.14:53',
    priority: 9,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'adguard-tcp',
    type: DNSServerType.TCP,
    address: '94.140.14.14:53',
    priority: 9,
    timeout: 5000,
    proxyEnabled: false,
  },
  {
    name: 'adguard-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2a10:50c0::ad1:ff]:53',
    priority: 9,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'adguard-secondary-udp',
    type: DNSServerType.UDP,
    address: '94.140.15.15:53',
    priority: 9,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'adguard-secondary-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2a10:50c0::ad2:ff]:53',
    priority: 9,
    timeout: 3000,
    proxyEnabled: false,
  },
  // Cloudflare
  {
    name: 'cloudflare-udp',
    type: DNSServerType.UDP,
    address: '1.1.1.1:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'cloudflare-tcp',
    type: DNSServerType.TCP,
    address: '1.1.1.1:53',
    priority: 10,
    timeout: 5000,
    proxyEnabled: false,
  },
  {
    name: 'cloudflare-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2606:4700:4700::1111]:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'cloudflare-secondary-udp',
    type: DNSServerType.UDP,
    address: '1.0.0.1:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'cloudflare-secondary-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2606:4700:4700::1001]:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  // Google
  {
    name: 'google-udp',
    type: DNSServerType.UDP,
    address: '8.8.8.8:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'google-tcp',
    type: DNSServerType.TCP,
    address: '8.8.8.8:53',
    priority: 10,
    timeout: 5000,
    proxyEnabled: false,
  },
  {
    name: 'google-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2001:4860:4860::8888]:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'google-secondary-udp',
    type: DNSServerType.UDP,
    address: '8.8.4.4:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'google-secondary-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2001:4860:4860::8844]:53',
    priority: 10,
    timeout: 3000,
    proxyEnabled: false,
  },
  // AliDNS
  {
    name: 'alidns-udp',
    type: DNSServerType.UDP,
    address: '223.5.5.5:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'alidns-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2400:3200::1]:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'alidns-secondary-udp',
    type: DNSServerType.UDP,
    address: '223.6.6.6:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'alidns-secondary-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2400:3200:baba::1]:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
  // DNSPod
  {
    name: 'dnspod-udp',
    type: DNSServerType.UDP,
    address: '119.29.29.29:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'dnspod-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2402:4e00::]:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'dnspod-secondary-udp',
    type: DNSServerType.UDP,
    address: '119.28.28.28:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
  {
    name: 'dnspod-secondary-ipv6-udp',
    type: DNSServerType.UDP,
    address: '[2402:4e00:1::]:53',
    priority: 11,
    timeout: 3000,
    proxyEnabled: false,
  },
];

/**
 * 根据名称查找加密 DNS 服务器
 */
export function findEncryptedServer(name: string): DNSServerConfig | null {
  return ENCRYPTED_DNS_SERVERS.find(s => s.name === name) || null;
}

/**
 * 根据名称查找明文 DNS 服务器
 */
export function findPlainServer(name: string): DNSServerConfig | null {
  return PLAIN_DNS_SERVERS.find(s => s.name === name) || null;
}

/**
 * 获取所有加密 DNS 服务器（按优先级排序）
 */
export function getEncryptedServers(): DNSServerConfig[] {
  return [...ENCRYPTED_DNS_SERVERS].sort((a, b) => a.priority - b.priority);
}

/**
 * 获取所有明文 DNS 服务器（按优先级排序）
 */
export function getPlainServers(): DNSServerConfig[] {
  return [...PLAIN_DNS_SERVERS].sort((a, b) => a.priority - b.priority);
}

/**
 * 添加自定义加密 DNS 服务器
 */
export function addEncryptedServer(config: DNSServerConfig): void {
  const exists = ENCRYPTED_DNS_SERVERS.some(s => s.name === config.name);
  if (exists) {
    console.warn(`[DNSServers] Encrypted server ${config.name} already exists, skipping`);
    return;
  }

  ENCRYPTED_DNS_SERVERS.push(config);
  console.log(`[DNSServers] Added encrypted server: ${config.name}`, {
    type: config.type,
    address: config.address,
  });
}

/**
 * 添加自定义明文 DNS 服务器
 */
export function addPlainServer(config: DNSServerConfig): void {
  const exists = PLAIN_DNS_SERVERS.some(s => s.name === config.name);
  if (exists) {
    console.warn(`[DNSServers] Plain server ${config.name} already exists, skipping`);
    return;
  }

  PLAIN_DNS_SERVERS.push(config);
  console.log(`[DNSServers] Added plain server: ${config.name}`, {
    type: config.type,
    address: config.address,
  });
}

/**
 * 移除 DNS 服务器
 */
export function removeServer(name: string): boolean {
  let removed = false;

  const encryptedIndex = ENCRYPTED_DNS_SERVERS.findIndex(s => s.name === name);
  if (encryptedIndex !== -1) {
    ENCRYPTED_DNS_SERVERS.splice(encryptedIndex, 1);
    removed = true;
    console.log(`[DNSServers] Removed encrypted server: ${name}`);
  }

  const plainIndex = PLAIN_DNS_SERVERS.findIndex(s => s.name === name);
  if (plainIndex !== -1) {
    PLAIN_DNS_SERVERS.splice(plainIndex, 1);
    removed = true;
    console.log(`[DNSServers] Removed plain server: ${name}`);
  }

  return removed;
}

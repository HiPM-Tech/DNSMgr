/**
 * DNS 服务器注册列表
 * 支持从配置文件加载和动态注册
 */

import { DNSServerConfig, DNSServerType } from './types';
import { log } from '../../logger';

// 内置加密 DNS 服务器列表
export const BUILTIN_DNS_SERVERS: DNSServerConfig[] = [
  // Cloudflare DoH
  {
    name: 'cloudflare-doh',
    type: DNSServerType.DOH,
    address: 'https://cloudflare-dns.com/dns-query',
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
  // Google DoH
  {
    name: 'google-doh',
    type: DNSServerType.DOH,
    address: 'https://dns.google/dns-query',
    priority: 1,
    timeout: 5000,
    proxyEnabled: true,
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
  // DNSPod DoH
  {
    name: 'dnspod-doh',
    type: DNSServerType.DOH,
    address: 'https://doh.pub/dns-query',
    priority: 3,
    timeout: 5000,
    proxyEnabled: true,
  },
  // Cloudflare DoT
  {
    name: 'cloudflare-dot',
    type: DNSServerType.DOT,
    address: 'cloudflare-dns.com:853',
    priority: 2,
    timeout: 5000,
    proxyEnabled: false,
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
];

// 内置明文 DNS 服务器列表（回退使用）
export const BUILTIN_PLAIN_DNS_SERVERS: DNSServerConfig[] = [
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
  // AliDNS
  {
    name: 'alidns-udp',
    type: DNSServerType.UDP,
    address: '223.5.5.5:53',
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
];

// 动态服务器注册表
class DNSServerRegistry {
  private servers: Map<string, DNSServerConfig> = new Map();
  private customServers: DNSServerConfig[] = [];

  constructor() {
    // 初始化内置服务器
    this.loadBuiltinServers();
  }

  private loadBuiltinServers() {
    [...BUILTIN_DNS_SERVERS, ...BUILTIN_PLAIN_DNS_SERVERS].forEach(server => {
      this.servers.set(server.name, server);
    });
    log.info('DNSResolver', `Loaded ${this.servers.size} built-in DNS servers`);
  }

  /**
   * 注册自定义 DNS 服务器
   */
  register(server: DNSServerConfig): void {
    if (this.servers.has(server.name)) {
      log.warn('DNSResolver', `DNS server ${server.name} already exists, updating`);
    }
    this.servers.set(server.name, server);
    this.customServers.push(server);
    log.info('DNSResolver', `Registered DNS server: ${server.name} (${server.type})`);
  }

  /**
   * 移除 DNS 服务器
   */
  unregister(name: string): boolean {
    const existed = this.servers.delete(name);
    if (existed) {
      this.customServers = this.customServers.filter(s => s.name !== name);
      log.info('DNSResolver', `Unregistered DNS server: ${name}`);
    }
    return existed;
  }

  /**
   * 获取所有服务器
   */
  getAll(): DNSServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * 获取加密 DNS 服务器（DoH/DoT）
   */
  getEncryptedServers(): DNSServerConfig[] {
    return this.getAll().filter(
      s => s.type === DNSServerType.DOH || s.type === DNSServerType.DOT
    );
  }

  /**
   * 获取明文 DNS 服务器（UDP/TCP）
   */
  getPlainServers(): DNSServerConfig[] {
    return this.getAll().filter(
      s => s.type === DNSServerType.UDP || s.type === DNSServerType.TCP
    );
  }

  /**
   * 获取支持代理的服务器
   */
  getProxyEnabledServers(): DNSServerConfig[] {
    return this.getAll().filter(s => s.proxyEnabled);
  }

  /**
   * 从配置文件加载服务器列表
   */
  loadFromConfig(servers: DNSServerConfig[]): void {
    servers.forEach(server => this.register(server));
  }

  /**
   * 清空自定义服务器
   */
  clearCustom(): void {
    this.customServers.forEach(server => {
      this.servers.delete(server.name);
    });
    this.customServers = [];
    log.info('DNSResolver', 'Cleared all custom DNS servers');
  }
}

// 导出单例
export const dnsServerRegistry = new DNSServerRegistry();

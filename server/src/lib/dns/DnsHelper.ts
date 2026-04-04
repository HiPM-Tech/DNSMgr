import { DnsAdapter } from './DnsInterface';
import {
  CloudflareAdapter,
  AliyunAdapter,
  DnspodAdapter,
  HuaweiAdapter,
  BaiduAdapter,
  HuoshanAdapter,
  JdcloudAdapter,
  DnslaAdapter,
  WestAdapter,
  QingcloudAdapter,
  NamesiloAdapter,
  BtAdapter,
  SpaceshipAdapter,
  PowerdnsAdapter,
  AliyunesaAdapter,
  TencenteoAdapter,
  DnsheAdapter,
  RainyunAdapter,
} from './providers';

export interface ProviderCapabilities {
  remark: boolean;
  status: boolean;
  redirect: boolean;
  log: boolean;
  weight: boolean;
}

export interface ProviderConfigField {
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  group?: string; // for grouped/conditional fields
}

export interface ProviderInfo {
  type: string;
  name: string;
  capabilities: ProviderCapabilities;
  configFields: ProviderConfigField[];
  isStub?: boolean;
}

const STUB_TYPES = new Set([
  'huawei',
  'baidu',
  'huoshan',
  'jdcloud',
  'dnsla',
  'qingcloud',
  'namesilo',
  'bt',
  'spaceship',
  'powerdns',
  'aliyunesa',
]);

const providers: ProviderInfo[] = [
  {
    type: 'aliyun',
    name: '阿里云',
    capabilities: { remark: false, status: true, redirect: false, log: true, weight: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'AccessKeySecret', type: 'password', required: true },
    ],
  },
  {
    type: 'dnspod',
    name: '腾讯云-DNSPod',
    capabilities: { remark: false, status: true, redirect: false, log: true, weight: false },
    configFields: [
      { key: 'SecretId', label: 'SecretId', type: 'text', required: true },
      { key: 'SecretKey', label: 'SecretKey', type: 'password', required: true },
    ],
  },
  {
    type: 'huawei',
    name: '华为云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'SecretAccessKey', type: 'password', required: true },
    ],
  },
  {
    type: 'baidu',
    name: '百度云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'SecretAccessKey', type: 'password', required: true },
    ],
  },
  {
    type: 'huoshan',
    name: '火山引擎',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'SecretAccessKey', type: 'password', required: true },
    ],
  },
  {
    type: 'jdcloud',
    name: '京东云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'AccessKeySecret', type: 'password', required: true },
    ],
  },
  {
    type: 'cloudflare',
    name: 'Cloudflare',
    capabilities: { remark: true, status: false, redirect: true, log: false, weight: true },
    configFields: [
      { key: 'apiToken', label: 'API Token', type: 'password', required: false, group: 'token' },
      { key: 'email', label: 'Email', type: 'text', required: false, group: 'key' },
      { key: 'apiKey', label: 'Global API Key', type: 'password', required: false, group: 'key' },
    ],
  },
  {
    type: 'dnsla',
    name: 'DNS.LA',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: true },
    configFields: [
      { key: 'apiid', label: 'API ID', type: 'text', required: true },
      { key: 'apisecret', label: 'API Secret', type: 'password', required: true },
    ],
  },
  {
    type: 'west',
    name: '西部数码',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'api_password', label: 'API Password', type: 'password', required: true },
    ],
  },
  {
    type: 'qingcloud',
    name: '青云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'access_key_id', label: 'Access Key ID', type: 'text', required: true },
      { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
    ],
  },
  {
    type: 'namesilo',
    name: 'NameSilo',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'apikey', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    type: 'bt',
    name: '宝塔',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'AccountID', label: 'Account ID', type: 'text', required: true },
      { key: 'AccessKey', label: 'Access Key', type: 'password', required: true },
    ],
  },
  {
    type: 'spaceship',
    name: 'Spaceship',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'text', required: true },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
    ],
  },
  {
    type: 'powerdns',
    name: 'PowerDNS',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'serverUrl', label: 'Server URL', type: 'text', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  },
  {
    type: 'aliyunesa',
    name: '阿里云ESA',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'AccessKeySecret', type: 'password', required: true },
    ],
  },
  {
    type: 'tencenteo',
    name: '腾讯EdgeOne',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'SecretId', label: 'SecretId', type: 'text', required: true },
      { key: 'SecretKey', label: 'SecretKey', type: 'password', required: true },
    ],
  },
  {
    type: 'dnshe',
    name: 'DNSHE',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'text', required: true },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
    ],
  },
  {
    type: 'rainyun',
    name: '雨云',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false },
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  },
];

const providerMap = new Map(providers.map((p) => [p.type, p]));

export function getProviders(includeStub = false): ProviderInfo[] {
  const enriched = providers.map((p) => ({ ...p, isStub: STUB_TYPES.has(p.type) }));
  if (includeStub) return enriched;
  return enriched.filter((p) => !p.isStub);
}

export function getProvider(type: string): ProviderInfo | undefined {
  return providerMap.get(type);
}

export function isStubProvider(type: string): boolean {
  return STUB_TYPES.has(type);
}

export function createAdapter(type: string, config: Record<string, string>, domain?: string, zoneId?: string): DnsAdapter {
  const cfg = { ...config, domain: domain ?? '', zoneId: zoneId ?? '' };
  switch (type) {
    case 'cloudflare': return new CloudflareAdapter(cfg);
    case 'aliyun': return new AliyunAdapter(cfg);
    case 'aliyunesa': return new AliyunesaAdapter(cfg);
    case 'dnspod': return new DnspodAdapter(cfg);
    case 'tencenteo': return new TencenteoAdapter(cfg);
    case 'huawei': return new HuaweiAdapter(cfg);
    case 'baidu': return new BaiduAdapter(cfg);
    case 'huoshan': return new HuoshanAdapter(cfg);
    case 'jdcloud': return new JdcloudAdapter(cfg);
    case 'dnsla': return new DnslaAdapter(cfg);
    case 'west': return new WestAdapter(cfg);
    case 'qingcloud': return new QingcloudAdapter(cfg);
    case 'namesilo': return new NamesiloAdapter(cfg);
    case 'bt': return new BtAdapter(cfg);
    case 'spaceship': return new SpaceshipAdapter(cfg);
    case 'powerdns': return new PowerdnsAdapter(cfg);
    case 'dnshe': return new DnsheAdapter(cfg);
    case 'rainyun': return new RainyunAdapter(cfg);
    default: throw new Error(`Unknown provider type: ${type}`);
  }
}

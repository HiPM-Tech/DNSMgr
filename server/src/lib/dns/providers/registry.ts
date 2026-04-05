import { DnsAdapter } from '../DnsInterface';
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
} from './index';

export interface ProviderCapabilities {
  remark: boolean;
  status: boolean;
  redirect: boolean;
  log: boolean;
  weight: boolean;
  line: boolean;
  cnameFlattening: boolean;
}

export interface ProviderConfigField {
  key: string;
  label: string;
  type: 'text' | 'password';
  required: boolean;
  group?: string;
}

export interface ProviderDefinition {
  type: string;
  name: string;
  capabilities: ProviderCapabilities;
  configFields: ProviderConfigField[];
  adapterFactory: (config: Record<string, string>) => DnsAdapter;
}

export type ProviderInfo = Omit<ProviderDefinition, 'adapterFactory'>;

const providerDefinitions: ProviderDefinition[] = [
  {
    type: 'aliyun',
    name: '阿里云',
    capabilities: { remark: false, status: true, redirect: false, log: true, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'AccessKeySecret', type: 'password', required: true },
      { key: 'region', label: 'Region', type: 'text', required: false },
    ],
    adapterFactory: (config) => new AliyunAdapter(config),
  },
  {
    type: 'dnspod',
    name: '腾讯云-DNSPod',
    capabilities: { remark: false, status: true, redirect: false, log: true, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'SecretId', label: 'SecretId', type: 'text', required: true },
      { key: 'SecretKey', label: 'SecretKey', type: 'password', required: true },
      { key: 'site_type', label: 'Site Type (intl)', type: 'text', required: false },
    ],
    adapterFactory: (config) => new DnspodAdapter(config),
  },
  {
    type: 'huawei',
    name: '华为云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'SecretAccessKey', type: 'password', required: true },
    ],
    adapterFactory: (config) => new HuaweiAdapter(config),
  },
  {
    type: 'baidu',
    name: '百度云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'SecretAccessKey', type: 'password', required: true },
    ],
    adapterFactory: (config) => new BaiduAdapter(config),
  },
  {
    type: 'huoshan',
    name: '火山引擎',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'SecretAccessKey', type: 'password', required: true },
    ],
    adapterFactory: (config) => new HuoshanAdapter(config),
  },
  {
    type: 'jdcloud',
    name: '京东云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'AccessKeySecret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new JdcloudAdapter(config),
  },
  {
    type: 'cloudflare',
    name: 'Cloudflare',
    capabilities: { remark: true, status: false, redirect: true, log: false, weight: true , line: true, cnameFlattening: true },
    configFields: [
      { key: 'accountId', label: 'Account ID (for Tunnels)', type: 'text', required: false, group: 'token' },
      { key: 'apiToken', label: 'API Token', type: 'password', required: false, group: 'token' },
      { key: 'email', label: 'Email', type: 'text', required: false, group: 'key' },
      { key: 'apiKey', label: 'Global API Key', type: 'password', required: false, group: 'key' },
    ],
    adapterFactory: (config) => new CloudflareAdapter(config),
  },
  {
    type: 'dnsla',
    name: 'DNS.LA',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: true , line: true, cnameFlattening: false },
    configFields: [
      { key: 'apiid', label: 'API ID', type: 'text', required: true },
      { key: 'apisecret', label: 'API Secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new DnslaAdapter(config),
  },
  {
    type: 'west',
    name: '西部数码',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'api_password', label: 'API Password', type: 'password', required: true },
    ],
    adapterFactory: (config) => new WestAdapter(config),
  },
  {
    type: 'qingcloud',
    name: '青云',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'access_key_id', label: 'Access Key ID', type: 'text', required: true },
      { key: 'secret_access_key', label: 'Secret Access Key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new QingcloudAdapter(config),
  },
  {
    type: 'namesilo',
    name: 'NameSilo',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [{ key: 'apikey', label: 'API Key', type: 'password', required: true }],
    adapterFactory: (config) => new NamesiloAdapter(config),
  },
  {
    type: 'bt',
    name: '宝塔',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'AccountID', label: 'Account ID', type: 'text', required: true },
      { key: 'AccessKey', label: 'Access Key', type: 'password', required: true },
      { key: 'SecretKey', label: 'Secret Key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new BtAdapter(config),
  },
  {
    type: 'spaceship',
    name: 'Spaceship',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'text', required: true },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new SpaceshipAdapter(config),
  },
  {
    type: 'powerdns',
    name: 'PowerDNS',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'serverUrl', label: 'Server URL', type: 'text', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      { key: 'serverId', label: 'Server ID', type: 'text', required: false },
    ],
    adapterFactory: (config) => new PowerdnsAdapter(config),
  },
  {
    type: 'aliyunesa',
    name: '阿里云ESA',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'AccessKeyId', label: 'AccessKeyId', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'AccessKeySecret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new AliyunesaAdapter(config),
  },
  {
    type: 'tencenteo',
    name: '腾讯EdgeOne',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'SecretId', label: 'SecretId', type: 'text', required: true },
      { key: 'SecretKey', label: 'SecretKey', type: 'password', required: true },
    ],
    adapterFactory: (config) => new TencenteoAdapter(config),
  },
  {
    type: 'dnshe',
    name: 'DNSHE',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'text', required: true },
      { key: 'apiSecret', label: 'API Secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new DnsheAdapter(config),
  },
  {
    type: 'rainyun',
    name: '雨云',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false , line: true, cnameFlattening: false },
    configFields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
    adapterFactory: (config) => new RainyunAdapter(config),
  },
];

function validateDefinitions(definitions: ProviderDefinition[]): void {
  const seenTypes = new Set<string>();

  for (const definition of definitions) {
    if (seenTypes.has(definition.type)) {
      throw new Error(`Duplicate provider type detected in registry: "${definition.type}"`);
    }
    seenTypes.add(definition.type);

    const seenConfigKeys = new Set<string>();
    for (const field of definition.configFields) {
      if (seenConfigKeys.has(field.key)) {
        throw new Error(
          `Duplicate config key detected in provider "${definition.type}": "${field.key}"`,
        );
      }
      seenConfigKeys.add(field.key);
    }
  }
}

validateDefinitions(providerDefinitions);

export const providerDefinitionMap = new Map(providerDefinitions.map((definition) => [definition.type, definition]));

export function getProviderDefinitions(): ProviderDefinition[] {
  return providerDefinitions;
}

export function getProviderInfoList(): ProviderInfo[] {
  return providerDefinitions.map(({ adapterFactory, ...providerInfo }) => providerInfo);
}

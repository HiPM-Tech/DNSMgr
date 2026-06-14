import { DnsAdapter } from '../DnsInterface';
import * as Adapters from './index';

export interface ProviderCapabilities {
  remark: boolean;
  status: boolean;
  redirect: boolean;
  log: boolean;
  weight: boolean;
  line: boolean;
  cnameFlattening: boolean;
  dns: boolean;
  renewal: boolean;
}

export interface ProviderConfigFieldOption {
  value: string;
  label: string;
}

export interface ProviderConfigField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'select';
  required: boolean;
  group?: string;
  options?: ProviderConfigFieldOption[];
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
    name: 'provider.aliyun',
    capabilities: { remark: false, status: true, redirect: false, log: true, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'AccessKeyId', label: 'provider.config.access_key_id', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'provider.config.access_key_secret', type: 'password', required: true },
      { key: 'region', label: 'provider.config.region', type: 'text', required: false },
    ],
    adapterFactory: (config) => new Adapters.AliyunAdapter(config),
  },
  {
    type: 'dnspod',
    name: 'provider.dnspod',
    capabilities: { remark: false, status: true, redirect: false, log: true, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'SecretId', label: 'provider.config.secret_id', type: 'text', required: true },
      { key: 'SecretKey', label: 'provider.config.secret_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.DnspodAdapter(config),
  },
  {
    type: 'huawei',
    name: 'provider.huawei',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'AccessKeyId', label: 'provider.config.access_key_id', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'provider.config.secret_access_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.HuaweiAdapter(config),
  },
  {
    type: 'baidu',
    name: 'provider.baidu',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'AccessKeyId', label: 'provider.config.access_key_id', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'provider.config.secret_access_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.BaiduAdapter(config),
  },
  {
    type: 'huoshan',
    name: 'provider.huoshan',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'AccessKeyId', label: 'provider.config.access_key_id', type: 'text', required: true },
      { key: 'SecretAccessKey', label: 'provider.config.secret_access_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.HuoshanAdapter(config),
  },
  {
    type: 'jdcloud',
    name: 'provider.jdcloud',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'AccessKeyId', label: 'provider.config.access_key_id', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'provider.config.access_key_secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.JdcloudAdapter(config),
  },
  {
    type: 'cloudflare',
    name: 'provider.cloudflare',
    capabilities: { remark: true, status: false, redirect: true, log: false, weight: true , line: true, cnameFlattening: true, dns: true, renewal: false },
    configFields: [
      { key: 'accountId', label: 'provider.config.account_id_tunnels', type: 'text', required: false, group: 'token' },
      { key: 'apiToken', label: 'provider.config.api_token', type: 'password', required: true, group: 'token' },
      { key: 'email', label: 'provider.config.email', type: 'text', required: false, group: 'key' },
      { key: 'apiKey', label: 'provider.config.global_api_key', type: 'password', required: false, group: 'key' },
    ],
    adapterFactory: (config) => new Adapters.CloudflareAdapter(config),
  },
  {
    type: 'dnsla',
    name: 'provider.dnsla',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: true , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'apiid', label: 'provider.config.api_id', type: 'text', required: true },
      { key: 'apisecret', label: 'provider.config.api_secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.DnslaAdapter(config),
  },
  {
    type: 'west',
    name: 'provider.west',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'username', label: 'provider.config.username', type: 'text', required: true },
      { key: 'api_password', label: 'provider.config.api_password', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.WestAdapter(config),
  },
  {
    type: 'qingcloud',
    name: 'provider.qingcloud',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'access_key_id', label: 'provider.config.access_key_id_label', type: 'text', required: true },
      { key: 'secret_access_key', label: 'provider.config.secret_access_key_label', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.QingcloudAdapter(config),
  },
  {
    type: 'namesilo',
    name: 'provider.namesilo',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [{ key: 'apikey', label: 'provider.config.api_key', type: 'password', required: true }],
    adapterFactory: (config) => new Adapters.NamesiloAdapter(config),
  },
  {
    type: 'bt',
    name: 'provider.bt',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'AccountID', label: 'provider.config.account_id', type: 'text', required: true },
      { key: 'AccessKey', label: 'provider.config.access_key', type: 'password', required: true },
      { key: 'SecretKey', label: 'provider.config.secret_key_generic', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.BtAdapter(config),
  },
  {
    type: 'spaceship',
    name: 'provider.spaceship',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'apiKey', label: 'provider.config.api_key', type: 'text', required: true },
      { key: 'apiSecret', label: 'provider.config.api_secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.SpaceshipAdapter(config),
  },
  {
    type: 'powerdns',
    name: 'provider.powerdns',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'serverUrl', label: 'provider.config.server_url', type: 'text', required: true },
      { key: 'apiKey', label: 'provider.config.api_key', type: 'password', required: true },
      { key: 'serverId', label: 'provider.config.server_id', type: 'text', required: false },
    ],
    adapterFactory: (config) => new Adapters.PowerdnsAdapter(config),
  },
  {
    type: 'aliyunesa',
    name: 'provider.aliyunesa',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'AccessKeyId', label: 'provider.config.access_key_id', type: 'text', required: true },
      { key: 'AccessKeySecret', label: 'provider.config.access_key_secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.AliyunesaAdapter(config),
  },
  {
    type: 'tencenteo',
    name: 'provider.tencenteo',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'SecretId', label: 'provider.config.secret_id', type: 'text', required: true },
      { key: 'SecretKey', label: 'provider.config.secret_key', type: 'password', required: true },
      { key: 'site_type', label: 'provider.config.site_type', type: 'select', required: true, options: [
        { value: 'mainland', label: 'provider.config.site_type_mainland' },
        { value: 'intl', label: 'provider.config.site_type_intl' },
      ]},
    ],
    adapterFactory: (config) => new Adapters.TencenteoAdapter(config),
  },
  {
    type: 'dnshe',
    name: 'provider.dnshe',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false, line: true, cnameFlattening: true, dns: true, renewal: true },
    configFields: [
      { key: 'apiKey', label: 'provider.config.api_key', type: 'text', required: true },
      { key: 'apiSecret', label: 'provider.config.api_secret', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.DnsheAdapter(config),
  },
  {
    type: 'rainyun',
    name: 'provider.rainyun',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false , line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [{ key: 'apiKey', label: 'provider.config.api_key', type: 'password', required: true }],
    adapterFactory: (config) => new Adapters.RainyunAdapter(config),
  },
  {
    type: 'hidns',
    name: 'provider.hidns',
    capabilities: { remark: true, status: true, redirect: false, log: false, weight: true, line: false, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'baseUrl', label: 'provider.config.hidns_url', type: 'text', required: true },
      { key: 'apiToken', label: 'provider.config.api_token', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.HiDNSAdapter(config),
  },
  {
    type: 'caihongdns',
    name: 'provider.caihongdns',
    capabilities: { remark: true, status: true, redirect: false, log: false, weight: true, line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'baseUrl', label: 'provider.config.caihong_url', type: 'text', required: true },
      { key: 'uid', label: 'provider.config.user_id', type: 'text', required: true },
      { key: 'apiKey', label: 'provider.config.api_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.CaihongDnsAdapter(config),
  },
  {
    type: 'vps8',
    name: 'provider.vps8',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false, line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'apiKey', label: 'provider.config.api_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.Vps8Adapter(config),
  },
  {
    type: 'gcore',
    name: 'provider.gcore',
    capabilities: { remark: false, status: true, redirect: false, log: false, weight: false, line: false, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'apiKey', label: 'provider.config.api_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.GcoreAdapter(config as any),
  },
  {
    type: 'dnsneko',
    name: 'provider.dnsneko',
    capabilities: { remark: true, status: true, redirect: false, log: false, weight: false, line: true, cnameFlattening: false, dns: true, renewal: false },
    configFields: [
      { key: 'username', label: 'provider.config.username', type: 'text', required: true },
      { key: 'apiKey', label: 'provider.config.api_key', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.DnsnekoAdapter(config),
  },
  {
    type: 'dpdns_reverse',
    name: 'provider.dpdns_reverse',
    capabilities: { remark: false, status: false, redirect: false, log: false, weight: false, line: false, cnameFlattening: false, dns: false, renewal: true },
    configFields: [
      { key: 'rememberToken', label: 'provider.config.remember_token', type: 'password', required: true },
    ],
    adapterFactory: (config) => new Adapters.DpdnsReverseAdapter(config),
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

import { DnsAdapter } from './DnsInterface';
import { TencenteoAdapter } from './providers/tencenteo/adapter';
import {
  ProviderCapabilities,
  ProviderConfigField,
  ProviderInfo,
  getProviderDefinitions,
  getProviderInfoList,
  providerDefinitionMap,
} from './providers/registry';
import { log } from '../logger';

export type { ProviderCapabilities, ProviderConfigField, ProviderInfo };

// All providers now have implementations
const STUB_TYPES = new Set<string>([]);

const providers = getProviderInfoList();

export function getProviders(includeStub = false): ProviderInfo[] {
  const enriched = providers.map((p) => ({ ...p, isStub: STUB_TYPES.has(p.type) }));
  if (includeStub) return enriched;
  return enriched.filter((p) => !p.isStub);
}

export function getProvider(type: string): ProviderInfo | undefined {
  return getProviderDefinitions().find((provider) => provider.type === type);
}

export function isStubProvider(type: string): boolean {
  return STUB_TYPES.has(type);
}

export function createAdapter(type: string, config: Record<string, string>, domain?: string, zoneId?: string, domainId?: string): DnsAdapter {
  const definition = providerDefinitionMap.get(type);
  if (!definition) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  // 将 domain、zoneId 和 domainId 添加到 config 中，供需要它们的提供商使用
  const enhancedConfig = { ...config };
  if (domain) enhancedConfig.domain = domain;
  if (zoneId) enhancedConfig.zoneId = zoneId;
  if (domainId) enhancedConfig.domainId = domainId;

  const adapter = definition.adapterFactory(enhancedConfig);

  // 对于腾讯 EO 适配器，设置 Zone ID 和域名
  if (type === 'tencenteo' && adapter instanceof TencenteoAdapter) {
    log.debug('DnsHelper', 'Creating TencentEO adapter', { domain, zoneId, hasZoneId: !!zoneId, hasDomain: !!domain });
    if (zoneId && domain) {
      adapter.setZoneInfo(zoneId, domain);
      log.debug('DnsHelper', 'TencentEO adapter ZoneInfo set', { zoneId, domain });
    } else {
      log.warn('DnsHelper', 'TencentEO adapter missing zoneId or domain', { zoneId, domain });
    }
  }

  return adapter;
}

import { DnsAdapter } from './DnsInterface';
import {
  ProviderCapabilities,
  ProviderConfigField,
  ProviderInfo,
  getProviderDefinitions,
  getProviderInfoList,
  providerDefinitionMap,
} from './providers/registry';

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

export function createAdapter(type: string, config: Record<string, string>, domain?: string, zoneId?: string): DnsAdapter {
  const definition = providerDefinitionMap.get(type);
  if (!definition) {
    throw new Error(`Unknown provider type: ${type}`);
  }

  const cfg = { ...config, domain: domain ?? '', zoneId: zoneId ?? '' };
  return definition.adapterFactory(cfg);
}

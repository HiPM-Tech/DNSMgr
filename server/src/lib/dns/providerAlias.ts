const LEGO_TO_INTERNAL = {
  alidns: 'aliyun',
  aliyun: 'aliyun',
  pdns: 'powerdns',
  powerdns: 'powerdns',
  edgeone: 'tencenteo',
  tencenteo: 'tencenteo',
  tencentcloud: 'dnspod',
  dnspod: 'dnspod',
} as const;

type LegoName = keyof typeof LEGO_TO_INTERNAL;

const INTERNAL_TO_ALIASES: Record<string, string[]> = Object.entries(LEGO_TO_INTERNAL)
  .reduce<Record<string, string[]>>((acc, [alias, internalType]) => {
    if (!acc[internalType]) {
      acc[internalType] = [];
    }
    acc[internalType].push(alias);
    return acc;
  }, {});

export function normalizeProviderType(type: string): string {
  const normalized = type.trim().toLowerCase();
  return LEGO_TO_INTERNAL[normalized as LegoName] ?? normalized;
}

export function getProviderAliases(internalType: string): string[] {
  const normalizedInternalType = internalType.trim().toLowerCase();
  return INTERNAL_TO_ALIASES[normalizedInternalType] ?? [normalizedInternalType];
}

export const providerAliasMap = {
  legoToInternal: LEGO_TO_INTERNAL,
  internalToAliases: INTERNAL_TO_ALIASES,
};

/**
 * 多线路解析支持服务
 * 为 DNS 记录添加线路支持
 */

export interface LineInfo {
  code: string;
  name: string;
  description?: string;
}

export interface ProviderLineSupport {
  providerName: string;
  supported: boolean;
  lines?: LineInfo[];
  documentation?: string;
}

/**
 * 常见的线路定义
 */
export const COMMON_LINES: Record<string, LineInfo[]> = {
  china: [
    { code: 'default', name: 'Default' },
    { code: 'chinanet', name: 'China Telecom (电信)' },
    { code: 'cnc', name: 'China Netcom (网通)' },
    { code: 'cernet', name: 'CERNET (教育网)' },
    { code: 'cmcc', name: 'China Mobile (移动)' },
    { code: 'cuc', name: 'China Unicom (联通)' },
  ],
  international: [
    { code: 'default', name: 'Default' },
    { code: 'us', name: 'United States' },
    { code: 'eu', name: 'Europe' },
    { code: 'asia', name: 'Asia' },
    { code: 'jp', name: 'Japan' },
    { code: 'sg', name: 'Singapore' },
    { code: 'hk', name: 'Hong Kong' },
  ],
};

/**
 * 获取提供商的线路支持
 */
export function getProviderLineSupport(providerName: string): ProviderLineSupport {
  const supportMap: Record<string, ProviderLineSupport> = {
    dnspod: {
      providerName: 'DNSPod',
      supported: true,
      lines: COMMON_LINES.china,
      documentation: 'https://docs.dnspod.cn/dns/5f3e8e8e9e8e8e8e8e8e8e8/',
    },
    aliyun: {
      providerName: 'Aliyun DNS',
      supported: true,
      lines: COMMON_LINES.china,
      documentation: 'https://help.aliyun.com/document_detail/29739.html',
    },
    cloudflare: {
      providerName: 'Cloudflare',
      supported: false,
      documentation: 'https://developers.cloudflare.com/dns/',
    },
    route53: {
      providerName: 'AWS Route53',
      supported: true,
      lines: [
        { code: 'default', name: 'Default' },
        { code: 'geolocation', name: 'Geolocation Routing' },
        { code: 'latency', name: 'Latency-based Routing' },
        { code: 'failover', name: 'Failover Routing' },
        { code: 'weighted', name: 'Weighted Routing' },
      ],
      documentation: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html',
    },
    default: {
      providerName: providerName,
      supported: false,
    },
  };

  return supportMap[providerName.toLowerCase()] || supportMap.default;
}

/**
 * 验证线路是否有效
 */
export function isValidLine(providerName: string, lineCode: string): boolean {
  const support = getProviderLineSupport(providerName);
  if (!support.supported || !support.lines) {
    return false;
  }
  return support.lines.some((line) => line.code === lineCode);
}

/**
 * 获取线路名称
 */
export function getLineName(providerName: string, lineCode: string): string | null {
  const support = getProviderLineSupport(providerName);
  if (!support.lines) {
    return null;
  }
  const line = support.lines.find((l) => l.code === lineCode);
  return line?.name || null;
}

/**
 * 获取提供商支持的所有线路
 */
export function getProviderLines(providerName: string): LineInfo[] {
  const support = getProviderLineSupport(providerName);
  return support.lines || [];
}

/**
 * 验证记录的线路配置
 */
export function validateLineConfig(
  providerName: string,
  records: any[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const support = getProviderLineSupport(providerName);

  if (!support.supported) {
    // 如果提供商不支持多线路，检查是否有线路配置
    const recordsWithLine = records.filter((r) => r.line && r.line !== 'default');
    if (recordsWithLine.length > 0) {
      errors.push(`Provider ${providerName} does not support multi-line routing`);
    }
    return { valid: errors.length === 0, errors };
  }

  // 检查每条记录的线路是否有效
  for (const record of records) {
    const line = record.line || 'default';
    if (!isValidLine(providerName, line)) {
      errors.push(`Invalid line '${line}' for provider ${providerName}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 生成线路配置建议
 */
export function generateLineConfigAdvice(providerName: string): string {
  const support = getProviderLineSupport(providerName);

  if (!support.supported) {
    return `Provider ${providerName} does not support multi-line routing.`;
  }

  let advice = `Provider ${providerName} supports multi-line routing.\n\n`;
  advice += 'Available lines:\n';

  if (support.lines) {
    for (const line of support.lines) {
      advice += `- ${line.code}: ${line.name}`;
      if (line.description) {
        advice += ` (${line.description})`;
      }
      advice += '\n';
    }
  }

  if (support.documentation) {
    advice += `\nDocumentation: ${support.documentation}`;
  }

  return advice;
}

/**
 * 获取线路的地理位置信息
 */
export function getLineGeolocation(lineCode: string): string | null {
  const geoMap: Record<string, string> = {
    // China lines
    chinanet: 'China - Telecom',
    cnc: 'China - Netcom',
    cernet: 'China - CERNET',
    cmcc: 'China - Mobile',
    cuc: 'China - Unicom',
    // International lines
    us: 'United States',
    eu: 'Europe',
    asia: 'Asia',
    jp: 'Japan',
    sg: 'Singapore',
    hk: 'Hong Kong',
  };

  return geoMap[lineCode] || null;
}

/**
 * 建议最优的线路配置
 */
export function recommendLineConfig(
  providerName: string,
  targetRegions: string[]
): Record<string, string> {
  const support = getProviderLineSupport(providerName);
  const config: Record<string, string> = {};

  if (!support.lines) {
    return config;
  }

  // 简单的推荐逻辑
  for (const region of targetRegions) {
    const line = support.lines.find((l) => l.code.toLowerCase().includes(region.toLowerCase()));
    if (line) {
      config[region] = line.code;
    }
  }

  return config;
}

/**
 * CNAME 拉平检测服务
 * 检测 DNS 记录中的 CNAME 冲突并提供解决方案
 */

export interface CNAMEConflict {
  domain: string;
  conflictType: 'root_cname' | 'mx_cname' | 'ns_cname' | 'other';
  message: string;
  affectedRecords: string[];
  solution: string;
  supportsFlatteningProviders: string[];
}

export interface ProviderCapability {
  name: string;
  supportsCNAMEFlattening: boolean;
  flatteningMethod?: 'native' | 'api' | 'manual';
  documentation?: string;
}

/**
 * 检测 CNAME 冲突
 */
export function detectCNAMEConflicts(records: any[]): CNAMEConflict[] {
  const conflicts: CNAMEConflict[] = [];
  const recordMap = new Map<string, any[]>();

  // 按名称分组记录
  for (const record of records) {
    const name = record.name || '@';
    if (!recordMap.has(name)) {
      recordMap.set(name, []);
    }
    recordMap.get(name)!.push(record);
  }

  // 检查每个名称下的记录
  for (const [name, nameRecords] of recordMap.entries()) {
    const hasCNAME = nameRecords.some((r) => r.type === 'CNAME');
    const hasOtherRecords = nameRecords.some((r) => r.type !== 'CNAME');

    if (hasCNAME && hasOtherRecords) {
      // 根域名不能有 CNAME
      if (name === '@') {
        conflicts.push({
          domain: name,
          conflictType: 'root_cname',
          message: 'Root domain (@) cannot have CNAME record with other records',
          affectedRecords: nameRecords.map((r) => `${r.type} ${r.value}`),
          solution: 'Use A/AAAA records instead of CNAME for root domain',
          supportsFlatteningProviders: ['Cloudflare', 'Akamai', 'AWS Route53'],
        });
      }

      // MX 记录不能与 CNAME 共存
      if (nameRecords.some((r) => r.type === 'MX')) {
        conflicts.push({
          domain: name,
          conflictType: 'mx_cname',
          message: 'MX records cannot coexist with CNAME records',
          affectedRecords: nameRecords.filter((r) => r.type === 'MX' || r.type === 'CNAME').map((r) => `${r.type} ${r.value}`),
          solution: 'Remove CNAME or use CNAME flattening service',
          supportsFlatteningProviders: ['Cloudflare', 'Akamai'],
        });
      }

      // NS 记录不能与 CNAME 共存
      if (nameRecords.some((r) => r.type === 'NS')) {
        conflicts.push({
          domain: name,
          conflictType: 'ns_cname',
          message: 'NS records cannot coexist with CNAME records',
          affectedRecords: nameRecords.filter((r) => r.type === 'NS' || r.type === 'CNAME').map((r) => `${r.type} ${r.value}`),
          solution: 'Remove CNAME or use separate subdomain',
          supportsFlatteningProviders: [],
        });
      }
    }
  }

  return conflicts;
}

/**
 * 获取提供商的 CNAME 拉平能力
 */
export function getProviderCapabilities(providerName: string): ProviderCapability {
  const capabilities: Record<string, ProviderCapability> = {
    cloudflare: {
      name: 'Cloudflare',
      supportsCNAMEFlattening: true,
      flatteningMethod: 'native',
      documentation: 'https://developers.cloudflare.com/dns/cname-flattening/',
    },
    akamai: {
      name: 'Akamai',
      supportsCNAMEFlattening: true,
      flatteningMethod: 'native',
      documentation: 'https://www.akamai.com/us/en/products/cloud-security/dns/',
    },
    route53: {
      name: 'AWS Route53',
      supportsCNAMEFlattening: true,
      flatteningMethod: 'native',
      documentation: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values-alias.html',
    },
    dnspod: {
      name: 'DNSPod',
      supportsCNAMEFlattening: false,
      documentation: 'https://www.dnspod.cn/',
    },
    aliyun: {
      name: 'Aliyun DNS',
      supportsCNAMEFlattening: false,
      documentation: 'https://www.aliyun.com/product/dns',
    },
    default: {
      name: providerName,
      supportsCNAMEFlattening: false,
    },
  };

  return capabilities[providerName.toLowerCase()] || capabilities.default;
}

/**
 * 生成 CNAME 拉平建议
 */
export function generateCNAMEFlatteningAdvice(
  conflicts: CNAMEConflict[],
  providerName: string
): string {
  if (conflicts.length === 0) {
    return 'No CNAME conflicts detected.';
  }

  const capability = getProviderCapabilities(providerName);
  let advice = `Found ${conflicts.length} CNAME conflict(s):\n\n`;

  for (const conflict of conflicts) {
    advice += `**${conflict.domain}**: ${conflict.message}\n`;
    advice += `- Affected records: ${conflict.affectedRecords.join(', ')}\n`;
    advice += `- Solution: ${conflict.solution}\n`;

    if (capability.supportsCNAMEFlattening) {
      advice += `- ✅ Your provider (${capability.name}) supports CNAME flattening\n`;
      if (capability.documentation) {
        advice += `- Documentation: ${capability.documentation}\n`;
      }
    } else {
      advice += `- ❌ Your provider (${capability.name}) does not support CNAME flattening\n`;
      if (conflict.supportsFlatteningProviders.length > 0) {
        advice += `- Consider using: ${conflict.supportsFlatteningProviders.join(', ')}\n`;
      }
    }
    advice += '\n';
  }

  return advice;
}

/**
 * 验证记录是否可以安全添加
 */
export function validateRecordAddition(
  existingRecords: any[],
  newRecord: any
): { valid: boolean; warning?: string; error?: string } {
  const name = newRecord.name || '@';
  const type = newRecord.type;

  // 检查是否已存在相同的记录
  const duplicate = existingRecords.find(
    (r) => (r.name || '@') === name && r.type === type && r.value === newRecord.value
  );

  if (duplicate) {
    return {
      valid: false,
      error: `Record already exists: ${type} ${name} -> ${newRecord.value}`,
    };
  }

  // 检查 CNAME 冲突
  const nameRecords = existingRecords.filter((r) => (r.name || '@') === name);

  if (type === 'CNAME') {
    if (nameRecords.length > 0) {
      return {
        valid: false,
        error: `Cannot add CNAME to ${name}: other records already exist`,
      };
    }
    if (name === '@') {
      return {
        valid: false,
        error: 'Cannot add CNAME to root domain (@)',
      };
    }
  } else {
    const hasCNAME = nameRecords.some((r) => r.type === 'CNAME');
    if (hasCNAME) {
      return {
        valid: false,
        error: `Cannot add ${type} to ${name}: CNAME record already exists`,
      };
    }

    // MX 和 NS 不能与 CNAME 共存
    if ((type === 'MX' || type === 'NS') && nameRecords.some((r) => r.type === 'CNAME')) {
      return {
        valid: false,
        error: `Cannot add ${type} to ${name}: CNAME record already exists`,
      };
    }
  }

  return { valid: true };
}

/**
 * 获取 CNAME 拉平的替代方案
 */
export function getAlternativeSolutions(conflict: CNAMEConflict): string[] {
  const solutions: string[] = [];

  if (conflict.conflictType === 'root_cname') {
    solutions.push('Use A/AAAA records instead of CNAME for root domain');
    solutions.push('Use CNAME flattening service (Cloudflare, Akamai, Route53)');
    solutions.push('Use ALIAS records if supported by your provider');
  } else if (conflict.conflictType === 'mx_cname') {
    solutions.push('Remove CNAME record and use A/AAAA records');
    solutions.push('Use CNAME flattening service');
    solutions.push('Move MX records to a different subdomain');
  } else if (conflict.conflictType === 'ns_cname') {
    solutions.push('Remove CNAME record');
    solutions.push('Use separate subdomain for CNAME');
    solutions.push('Delegate subdomain to different nameservers');
  }

  return solutions;
}

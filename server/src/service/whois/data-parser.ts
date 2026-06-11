/**
 * WHOIS/RDAP/HTTP-API 数据解析中心
 *
 * 统一所有查询方式的数据提取逻辑
 * 替代原先分散在 WhoisMethod / RdapMethod / data-parser.ts 中的重复解析
 */

/**
 * 查询数据类型
 */
export type QueryDataType = 'RDAP' | 'WHOIS' | 'DNS';

/**
 * 解析后的 WHOIS 数据
 */
export interface ParsedWhoisData {
  status?: string | null;
  expiryDate?: Date | null;
  registrar?: string | null;
  nameServers?: string[];
  [key: string]: any;
}

// ========== 日期解析 ==========

/**
 * 解析各种日期格式
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  const formats: RegExp[] = [
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
    /^(\d{4})-(\d{2})-(\d{2})/,
    /^(\d{4})\/(\d{2})\/(\d{2})/,
    /^(\d{2})\/(\d{2})\/(\d{4})/,
    /^(\d{2})\.(\d{2})\.(\d{4})/,
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)?/,
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,
  ];

  for (const regex of formats) {
    const match = dateStr.match(regex);
    if (match) {
      try {
        if (match[4] && match[5] && match[6]) {
          d = new Date(
            parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
            parseInt(match[4]), parseInt(match[5]), parseInt(match[6]),
          );
        } else {
          d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
        }
        if (!isNaN(d.getTime())) return d;
      } catch {
        // continue
      }
    }
  }
  return null;
}

// ========== WHOIS 文本解析 ==========

const WHOIS_EXPIRY_PATTERNS = [
  /Registry Expiry Date:\s*(.+)/i,
  /Expiry Date:\s*(.+)/i,
  /Registrar Registration Expiration Date:\s*(.+)/i,
  /Expiration Date:\s*(.+)/i,
  /expires:\s*(.+)/i,
  /Expiration Time:\s*(.+)/i,
  /paid-till:\s*(.+)/i,
  /Renewal Date:\s*(.+)/i,
  /Domain Expiration Date:\s*(.+)/i,
  /Expire Date:\s*(.+)/i,
  /Valid Until:\s*(.+)/i,
  /Valid-Until:\s*(.+)/i,
  /expire:\s*(.+)/i,
  /Expiry:\s*(.+)/i,
  /Expiration:\s*(.+)/i,
];

const WHOIS_REGISTRAR_PATTERNS = [
  /Registrar:\s*(.+)/i,
  /Sponsoring Registrar:\s*(.+)/i,
  /Registrar Name:\s*(.+)/i,
];

const WHOIS_NS_PATTERNS = [
  /Name Server:\s*(.+)/gi,
  /Nserver:\s*(.+)/gi,
  /NS:\s*(.+)/gi,
];

// ========== RDAP JSON 解析 ==========

/**
 * 从 RDAP vcardArray 中提取组织名称
 */
export function extractFromVcard(vcardArray: any[]): string | null {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return null;
  const vcard = vcardArray[1];
  if (!Array.isArray(vcard)) return null;

  const fnEntry = vcard.find((v: any) => Array.isArray(v) && v[0] === 'fn');
  if (fnEntry && fnEntry[3]) return fnEntry[3];

  const orgEntry = vcard.find((v: any) => Array.isArray(v) && v[0] === 'org');
  if (orgEntry && orgEntry[3]) return orgEntry[3];

  return null;
}

// ========== 统一提取方法 ==========

/**
 * 从原始 WHOIS/RDAP 文本中提取状态
 *
 * 解析优先级：
 * 1. RDAP JSON - status 数组
 * 2. WHOIS 文本 - Domain Status 行
 * 3. WHOIS 文本 - status: 行
 */
export function extractStatus(raw: string): string | null {
  if (!raw) return null;

  // RDAP JSON
  try {
    const jsonData = JSON.parse(raw);
    if (jsonData.status && Array.isArray(jsonData.status) && jsonData.status.length > 0) {
      return jsonData.status.join('\n');
    }
  } catch { /* not JSON */ }

  // WHOIS Domain Status 行
  const domainStatuses: string[] = [];
  const domainStatusPattern = /Domain Status:\s*([\w]+)\s*/gi;
  let match;
  while ((match = domainStatusPattern.exec(raw)) !== null) {
    if (match[1]) domainStatuses.push(match[1].trim());
  }
  if (domainStatuses.length > 0) return domainStatuses.join('\n');

  // WHOIS status: 行（备选）
  const statuses: string[] = [];
  const statusPattern = /(?:^|\n)status:\s*([\w]+)\s*/gim;
  while ((match = statusPattern.exec(raw)) !== null) {
    if (match[1]) statuses.push(match[1].trim());
  }
  if (statuses.length > 0) return statuses.join('\n');

  return null;
}

/**
 * 从原始数据中提取到期时间
 */
export function extractExpiryDate(raw: string, dataType?: QueryDataType): Date | null {
  if (!raw) return null;

  if (dataType === 'RDAP' || (!dataType && raw.trim().startsWith('{'))) {
    try {
      const jsonData = JSON.parse(raw);
      if (jsonData.events && Array.isArray(jsonData.events)) {
        const expiryEvent = jsonData.events.find((e: any) =>
          e.eventAction === 'expiration' || e.eventAction === 'registration expiration' || e.eventAction === 'expiry',
        );
        if (expiryEvent?.eventDate) return parseDate(expiryEvent.eventDate);
      }
    } catch { /* not JSON */ }
  }

  if (dataType === 'WHOIS' || !dataType) {
    for (const pattern of WHOIS_EXPIRY_PATTERNS) {
      const match = raw.match(pattern);
      if (match && match[1]) {
        const date = parseDate(match[1].trim());
        if (date) return date;
      }
    }
  }

  // DNS / HTTP API JSON
  if (dataType === 'DNS' || (!dataType && raw.trim().startsWith('{'))) {
    try {
      const jsonData = JSON.parse(raw);
      if (jsonData.expiration_date) return parseDate(jsonData.expiration_date);
      if (jsonData.expireTime) return parseDate(jsonData.expireTime);
      if (jsonData.ExpiresAt) return parseDate(jsonData.ExpiresAt);
      // dataPath navigation for nested responses
      if (jsonData.data?.expireTime) return parseDate(jsonData.data.expireTime);
      if (jsonData.data?.expiration_date) return parseDate(jsonData.data.expiration_date);
    } catch { /* not JSON */ }
  }

  return null;
}

/**
 * 从原始数据中提取注册商
 */
export function extractRegistrar(raw: string, dataType?: QueryDataType): string | null {
  if (!raw) return null;

  if (dataType === 'RDAP' || (!dataType && raw.trim().startsWith('{'))) {
    try {
      const jsonData = JSON.parse(raw);
      if (jsonData.entities && Array.isArray(jsonData.entities)) {
        const registrar = jsonData.entities.find((e: any) => e.roles?.includes('registrar'));
        if (registrar?.vcardArray) return extractFromVcard(registrar.vcardArray);
      }
    } catch { /* not JSON */ }
  }

  if (dataType === 'WHOIS' || !dataType) {
    for (const pattern of WHOIS_REGISTRAR_PATTERNS) {
      const match = raw.match(pattern);
      if (match && match[1]) return match[1].trim();
    }
  }

  return null;
}

/**
 * 从原始 WHOIS 文本中提取域名服务器
 */
export function extractNameServers(raw: string): string[] {
  if (!raw) return [];

  const ns: string[] = [];
  for (const pattern of WHOIS_NS_PATTERNS) {
    let match;
    while ((match = pattern.exec(raw)) !== null) {
      ns.push(match[1].trim().toLowerCase());
    }
  }

  // RDAP JSON
  if (ns.length === 0 && raw.trim().startsWith('{')) {
    try {
      const jsonData = JSON.parse(raw);
      if (jsonData.nameservers && Array.isArray(jsonData.nameservers)) {
        jsonData.nameservers.forEach((ns: any) => {
          if (ns.ldhName) ns.push(ns.ldhName.toLowerCase());
        });
      }
    } catch { /* not JSON */ }
  }

  return [...new Set(ns)];
}

/**
 * 检查 WHOIS 响应是否表示域名未找到
 */
export function isWhoisNotFound(raw: string): boolean {
  const patterns = [
    'No match', 'NOT FOUND', 'Not found',
    'No entries found', 'Domain not found',
  ];
  return patterns.some(p => raw.includes(p));
}

/**
 * 从原始数据中提取完整 WHOIS 信息
 */
export function parseWhoisData(raw: string, dataType: QueryDataType): ParsedWhoisData {
  return {
    status: extractStatus(raw),
    expiryDate: extractExpiryDate(raw, dataType),
    registrar: extractRegistrar(raw, dataType),
    nameServers: extractNameServers(raw),
  };
}

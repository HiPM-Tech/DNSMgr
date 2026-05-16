/**
 * WHOIS/RDAP 数据解析中心
 * 
 * 负责从原始数据中提取结构化信息
 * 根据查询类型（RDAP/WHOIS/DNS）使用不同的解析策略
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

/**
 * 从原始数据中提取状态
 * 
 * 解析优先级：
 * 1. RDAP JSON - 直接读取 status 数组
 * 2. WHOIS 文本 - 匹配 Domain Status 行
 * 3. WHOIS 文本 - 匹配 status 行（备选）
 * 
 * @param raw 原始 WHOIS/RDAP 数据
 * @returns 状态字符串或 null
 */
export function extractStatus(raw: string): string | null {
  if (!raw) return null;
  
  // 策略 1: 尝试解析为 RDAP JSON（结构化数据，优先）
  try {
    const jsonData = JSON.parse(raw);
    if (jsonData.status && Array.isArray(jsonData.status) && jsonData.status.length > 0) {
      return jsonData.status[0];
    }
  } catch (e) {
    // 不是 JSON，继续尝试 WHOIS 文本
  }
  
  // 策略 2: 从 WHOIS 文本中提取 - Domain Status（精确锚定行首）
  const domainStatusMatch = raw.match(/^Domain Status:\s*([\w]+)\s/im);
  if (domainStatusMatch && domainStatusMatch[1]) {
    return domainStatusMatch[1];
  }
  
  // 策略 3: 匹配其他 WHOIS 状态格式（备选）
  const statusMatch = raw.match(/^status:\s*([\w]+)\s/im);
  if (statusMatch && statusMatch[1]) {
    return statusMatch[1];
  }
  
  return null;
}

/**
 * 从原始数据中提取到期时间
 * 
 * @param raw 原始数据
 * @param dataType 数据类型
 * @returns 到期时间或 null
 */
export function extractExpiryDate(raw: string, dataType: QueryDataType): Date | null {
  if (!raw) return null;
  
  if (dataType === 'RDAP') {
    try {
      const jsonData = JSON.parse(raw);
      if (jsonData.events && Array.isArray(jsonData.events)) {
        const expiryEvent = jsonData.events.find((e: any) => e.eventAction === 'expiration');
        if (expiryEvent && expiryEvent.eventDate) {
          return new Date(expiryEvent.eventDate);
        }
      }
    } catch (e) {
      // 解析失败
    }
  } else if (dataType === 'WHOIS') {
    // WHOIS 文本解析到期时间
    const patterns = [
      /Registry Expiry Date:\s*(.+)/i,
      /Expiry Date:\s*(.+)/i,
      /Expiration Date:\s*(.+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match && match[1]) {
        const dateStr = match[1].trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }
  } else if (dataType === 'DNS') {
    try {
      const jsonData = JSON.parse(raw);
      if (jsonData.expiration_date || jsonData.ExpiresAt) {
        const dateStr = jsonData.expiration_date || jsonData.ExpiresAt;
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    } catch (e) {
      // 解析失败
    }
  }
  
  return null;
}

/**
 * 从原始数据中提取注册商
 * 
 * @param raw 原始数据
 * @param dataType 数据类型
 * @returns 注册商名称或 null
 */
export function extractRegistrar(raw: string, dataType: QueryDataType): string | null {
  if (!raw) return null;
  
  if (dataType === 'RDAP') {
    try {
      const jsonData = JSON.parse(raw);
      if (jsonData.entities && Array.isArray(jsonData.entities)) {
        const registrar = jsonData.entities.find((e: any) => e.roles && e.roles.includes('registrar'));
        if (registrar && registrar.vcardArray) {
          // 从 vcardArray 提取组织名
          const vcard = registrar.vcardArray[1];
          if (Array.isArray(vcard)) {
            const orgEntry = vcard.find((v: any) => Array.isArray(v) && v[0] === 'org');
            if (orgEntry && orgEntry[3]) {
              return orgEntry[3];
            }
          }
        }
      }
    } catch (e) {
      // 解析失败
    }
  } else if (dataType === 'WHOIS') {
    const match = raw.match(/Registrar:\s*(.+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * 从原始数据中提取完整 WHOIS 信息
 * 
 * @param raw 原始数据
 * @param dataType 数据类型
 * @returns 解析后的 WHOIS 数据
 */
export function parseWhoisData(raw: string, dataType: QueryDataType): ParsedWhoisData {
  return {
    status: extractStatus(raw),
    expiryDate: extractExpiryDate(raw, dataType),
    registrar: extractRegistrar(raw, dataType),
  };
}

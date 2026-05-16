/**
 * WHOIS/RDAP 状态解析器
 * 
 * 根据数据格式（RDAP JSON 或 WHOIS 文本）使用不同的解析策略
 * 避免滥用正则表达式，优先使用结构化数据解析
 */

/**
 * 从原始数据中提取 WHOIS 状态
 * 
 * 解析优先级：
 * 1. RDAP JSON - 直接读取 status 数组
 * 2. WHOIS 文本 - 匹配 Domain Status 行
 * 3. WHOIS 文本 - 匹配 status 行（备选）
 * 
 * @param raw 原始 WHOIS/RDAP 数据
 * @returns 状态字符串或 null
 */
export function extractStatusFromRaw(raw: string): string | null {
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

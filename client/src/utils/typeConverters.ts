/**
 * 数据类型转换工具函数
 * 用于处理后端返回的数据类型不一致问题
 */

/**
 * 将后端可能返回的各种布尔值类型转换为严格的 boolean
 * 支持: boolean, number (0/1), string ('0'/'1'/'true'/'false')
 * 
 * @param value - 需要转换的值
 * @returns 严格的 boolean 值
 */
export function toBoolean(value: boolean | number | string | undefined | null): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === '1' || lower === 'true';
  }
  return false;
}

/**
 * 将值转换为字符串，处理 null/undefined
 * 
 * @param value - 需要转换的值
 * @param defaultValue - 默认值（可选）
 * @returns 字符串
 */
export function toString(value: any, defaultValue: string = ''): string {
  if (value === undefined || value === null) return defaultValue;
  return String(value);
}

/**
 * 将值转换为数字，处理无效值
 * 
 * @param value - 需要转换的值
 * @param defaultValue - 默认值（可选）
 * @returns 数字
 */
export function toNumber(value: any, defaultValue: number = 0): number {
  if (value === undefined || value === null) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

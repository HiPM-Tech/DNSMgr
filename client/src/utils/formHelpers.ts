/**
 * 表单辅助函数模块
 * 
 * 提供统一的数据类型转换和工具函数，避免在组件中重复实现
 * 所有表单组件必须使用这些函数进行类型转换
 * 
 * @example
 * import { toBoolean, toString, toNumber } from '../utils/formHelpers';
 * 
 * const enabled = toBoolean(data.enabled);
 * const name = toString(data.name);
 * const port = toNumber(data.port, 8080);
 */

/**
 * 将任意值转换为字符串
 * 
 * @param value - 要转换的值
 * @param defaultValue - 默认值（当 value 为 null/undefined 时返回）
 * @returns 转换后的字符串
 * 
 * @example
 * toString(null) // ''
 * toString(123) // '123'
 * toString('hello', 'default') // 'hello'
 * toString(undefined, 'default') // 'default'
 */
export function toString(value: any, defaultValue: string = ''): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

/**
 * 将任意值转换为布尔值
 * 
 * 支持：boolean, number (0/1), string ('0'/'1'/'true'/'false')
 * 
 * @param value - 要转换的值
 * @param defaultValue - 默认值（当 value 为 null/undefined 且无法转换时返回）
 * @returns 转换后的布尔值
 * 
 * @example
 * toBoolean(true) // true
 * toBoolean(1) // true
 * toBoolean('true') // true
 * toBoolean('1') // true
 * toBoolean(0) // false
 * toBoolean('false') // false
 * toBoolean(null) // false
 * toBoolean(undefined, true) // true
 */
export function toBoolean(value: any, defaultValue: boolean = false): boolean {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === '1';
  }
  return defaultValue;
}

/**
 * 将任意值转换为数字
 * 
 * @param value - 要转换的值
 * @param defaultValue - 默认值（当 value 为 null/undefined 或转换失败时返回）
 * @returns 转换后的数字
 * 
 * @example
 * toNumber(123) // 123
 * toNumber('456') // 456
 * toNumber(null, 0) // 0
 * toNumber('abc', 0) // 0 (NaN 转换为默认值)
 */
export function toNumber(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * 从 TDesign SelectValue 提取字符串值
 * 
 * TDesign Select 组件返回的值可能是数组或单个值
 * 
 * @param value - SelectValue 类型（可能是数组或单个值）
 * @returns 提取后的字符串
 * 
 * @example
 * selectToString(['value1']) // 'value1'
 * selectToString('value1') // 'value1'
 * selectToString(null) // ''
 */
export function selectToString(value: any): string {
  if (value === null || value === undefined) return '';
  return String(Array.isArray(value) ? value[0] ?? '' : value);
}

/**
 * 从 TDesign SelectValue 提取数字值
 * 
 * @param value - SelectValue 类型（可能是数组或单个值）
 * @returns 提取后的数字
 * 
 * @example
 * selectToNumber(['123']) // 123
 * selectToNumber(456) // 456
 * selectToNumber(null, 0) // 0
 */
export function selectToNumber(value: any, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const raw = Array.isArray(value) ? value[0] : value;
  const num = Number(raw);
  return isNaN(num) ? defaultValue : num;
}

/**
 * 深度比较两个对象是否相等
 * 
 * @param obj1 - 第一个对象
 * @param obj2 - 第二个对象
 * @returns 是否相等
 * 
 * @example
 * deepEqual({ a: 1 }, { a: 1 }) // true
 * deepEqual({ a: 1 }, { a: 2 }) // false
 * deepEqual({ a: { b: 1 } }, { a: { b: 1 } }) // true
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (typeof obj1 !== typeof obj2) return false;
  if (typeof obj1 !== 'object' || obj1 === null || obj2 === null) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  return keys1.every(key => deepEqual(obj1[key], obj2[key]));
}

/**
 * 安全的对象属性访问
 * 
 * @param obj - 对象
 * @param path - 属性路径（支持点分隔，如 'a.b.c'）
 * @param defaultValue - 默认值
 * @returns 属性值或默认值
 * 
 * @example
 * getNestedValue({ a: { b: { c: 1 } } }, 'a.b.c') // 1
 * getNestedValue({ a: { b: { c: 1 } } }, 'a.b.d', 'default') // 'default'
 */
export function getNestedValue(obj: any, path: string, defaultValue: any = undefined): any {
  if (!obj || !path) return defaultValue;
  
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result === null || result === undefined) return defaultValue;
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
}

/**
 * 合并表单数据
 * 
 * 用于更新表单状态时保留未更新的字段
 * 
 * @param currentState - 当前表单状态
 * @param updates - 要更新的字段
 * @returns 合并后的新状态
 * 
 * @example
 * mergeFormData({ a: 1, b: 2 }, { b: 3 }) // { a: 1, b: 3 }
 */
export function mergeFormData<T extends Record<string, any>>(
  currentState: Partial<T>,
  updates: Partial<T>
): Partial<T> {
  return {
    ...currentState,
    ...updates,
  };
}

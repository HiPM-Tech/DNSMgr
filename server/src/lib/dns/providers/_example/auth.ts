/**
 * Example Provider Authentication - 示例提供商认证模块
 * 
 * 这个文件展示了如何实现 DNS 提供商的认证逻辑。
 * 复制此文件并重命名，然后按照注释实现各个方法。
 * 
 * 实现步骤：
 * 1) 定义认证配置接口（AuthConfig Interface）
 * 2) 实现 buildAuthHeaders：构建认证请求头
 * 3) 实现 authenticatedRequest：发送认证请求
 * 4) 实现 validateCredentials：验证凭证有效性
 */

import { fetchWithFallback } from '../internal';

// ==================== 认证配置接口 ====================

/**
 * 认证配置接口
 * 根据提供商的认证要求定义所需字段
 * 
 * 常见认证方式：
 * 1. API Key + Secret: apiKey, apiSecret
 * 2. Bearer Token: apiToken
 * 3. Email + API Key: email, apiKey
 * 4. Access Key + Secret Key: accessKeyId, accessKeySecret
 * 5. 自定义签名: uid, apiKey (需要生成签名)
 */
export interface ExampleAuthConfig {
  apiKey: string;
  apiSecret: string;
  useProxy?: boolean;
}

// ==================== 认证工具函数 ====================

/**
 * 构建认证请求头
 * 根据提供商的认证要求设置头部
 * 
 * 常见认证方式示例：
 * 
 * 1. Bearer Token:
 *    headers['Authorization'] = `Bearer ${config.apiToken}`;
 * 
 * 2. Basic Auth:
 *    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
 *    headers['Authorization'] = `Basic ${credentials}`;
 * 
 * 3. Custom Headers:
 *    headers['X-API-Key'] = config.apiKey;
 *    headers['X-API-Secret'] = config.apiSecret;
 * 
 * 4. Query Parameters (在 authenticatedRequest 中处理):
 *    将认证参数添加到 URL 查询字符串中
 */
export function buildAuthHeaders(config: ExampleAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
    'X-API-Secret': config.apiSecret,
  };
}

/**
 * 发送认证请求
 * 使用认证配置发送 HTTP 请求
 * 
 * @param url 请求 URL
 * @param config 认证配置
 * @param options 请求选项
 * @returns Response 对象
 */
export async function authenticatedRequest(
  url: string,
  config: ExampleAuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  const headers = {
    ...buildAuthHeaders(config),
    ...options.headers,
  };

  return fetchWithFallback(
    url,
    {
      ...options,
      headers,
    },
    config.useProxy ?? false,
    'Example' // 提供商名称，用于日志记录
  );
}

/**
 * 验证凭证有效性
 * 通过调用提供商 API 验证凭证是否正确
 * 
 * @param config 认证配置
 * @returns 凭证是否有效
 */
export async function validateCredentials(config: ExampleAuthConfig): Promise<boolean> {
  try {
    // 调用提供商 API 验证凭证
    // 通常调用一个简单的 API，如获取域名列表或用户信息
    const baseUrl = 'https://api.example.com/v1';
    const url = `${baseUrl}/user/info`;
    
    const response = await authenticatedRequest(url, config, {
      method: 'GET',
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    // 根据提供商的响应格式判断是否成功
    return data.success === true || data.code === 0 || data.code === 200;
  } catch {
    return false;
  }
}

// ==================== 特殊认证方式示例 ====================

/**
 * 示例 1: 签名认证（如阿里云、腾讯云）
 * 需要根据请求参数生成签名
 */
/*
import crypto from 'crypto';

export function generateSignature(params: Record<string, string>, secret: string): string {
  // 按字母顺序排序参数
  const sortedKeys = Object.keys(params).sort();
  const queryString = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  
  // 生成 HMAC-SHA256 签名
  return crypto
    .createHmac('sha256', secret)
    .update(queryString)
    .digest('hex');
}
*/

/**
 * 示例 2: OAuth 2.0 认证
 * 需要使用 access_token
 */
/*
export interface OAuthConfig {
  accessToken: string;
  useProxy?: boolean;
}

export function buildOAuthHeaders(config: OAuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.accessToken}`,
  };
}
*/

/**
 * 示例 3: 查询参数认证（如 CaihongDNS）
 * 将认证参数添加到 URL 中
 */
/*
export function buildAuthUrl(baseUrl: string, params: Record<string, string>): string {
  const urlObj = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    urlObj.searchParams.set(key, value);
  });
  return urlObj.toString();
}
*/

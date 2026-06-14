/**
 * ⚠️ DigitalPlat Domains (dpdns) 认证模块 — 逆向实现
 *
 * 认证方式：remember_token Cookie（从浏览器 DevTools 抓取）
 * 这是通过逆向 web 控制台 API 实现的非官方适配器。
 *
 * ⚠️ 注意：未来将添加 dodns 提供商（官方 API key 实现），
 *    dpdns 与 dodns 是两个独立的提供商注册项。
 *
 * 用户需要从以下地址登录后，从 DevTools > Application > Cookies
 * 中复制 remember_token 值（格式：USER_ID|TOKEN_HASH）
 */

import { fetchWithFallback } from '../internal';

export interface DpdnsAuthConfig {
  /** remember_token 完整值，格式为 "USER_ID|TOKEN_HASH" */
  rememberToken: string;
  useProxy?: boolean;
}

/**
 * 构建包含 remember_token 的 Cookie 请求
 * 模拟完整浏览器请求头以避免被云端风控拦截
 */
export function authenticatedRequest(
  url: string,
  config: DpdnsAuthConfig,
  options: RequestInit = {}
): Promise<Response> {
  const cookieValue = `remember_token=${config.rememberToken}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Origin': 'https://dash.domain.digitalplat.org',
    'Referer': 'https://dash.domain.digitalplat.org/',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Priority': 'u=1, i',
    'Cache-Control': 'no-cache',
    'DNT': '1',
    ...(options.headers as Record<string, string>),
  };

  return fetchWithFallback(
    url,
    {
      ...options,
      headers: {
        ...headers,
        Cookie: cookieValue,
      },
    },
    config.useProxy ?? false,
    'DPDNS'
  );
}

/**
 * 验证 remember_token 是否有效（dpdns 逆向实现）
 */
export async function validateCredentials(config: DpdnsAuthConfig): Promise<boolean> {
  try {
    const url = 'https://dash.domain.digitalplat.org/_panel_api/api/auth/me';
    const response = await authenticatedRequest(url, config, { method: 'GET' });

    if (!response.ok) return false;

    const data = await response.json();
    return data.ok === true && !!data.user;
  } catch {
    return false;
  }
}
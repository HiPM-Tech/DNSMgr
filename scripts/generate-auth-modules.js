#!/usr/bin/env node

/**
 * 为所有 DNS 提供商生成 auth.ts 模块
 */

const fs = require('fs');
const path = require('path');

const providersDir = path.join(__dirname, '../server/src/lib/dns/providers');

// 提供商认证配置模板
const authTemplates = {
  // API Key + Secret 模式（DNSHE 风格）
  apiKeySecret: (providerName) => `import { fetchWithFallback } from '../internal';

export interface ${capitalizeFirst(providerName)}AuthConfig {
  apiKey: string;
  apiSecret: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for ${providerName.toUpperCase()} API
 */
export function buildAuthHeaders(config: ${capitalizeFirst(providerName)}AuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
    'X-API-Secret': config.apiSecret,
  };
}

/**
 * Make an authenticated request to ${providerName.toUpperCase()} API
 */
export async function authenticatedRequest(
  url: string,
  config: ${capitalizeFirst(providerName)}AuthConfig,
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
    config.useProxy ?? false
  );
}

/**
 * Validate ${providerName.toUpperCase()} credentials
 */
export async function validateCredentials(config: ${capitalizeFirst(providerName)}AuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
`,

  // Bearer Token 模式（Cloudflare 风格）
  bearerToken: (providerName) => `import { fetchWithFallback } from '../internal';

export interface ${capitalizeFirst(providerName)}AuthConfig {
  apiToken: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for ${providerName.toUpperCase()} API
 */
export function buildAuthHeaders(config: ${capitalizeFirst(providerName)}AuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': \`Bearer \${config.apiToken}\`,
  };
}

/**
 * Make an authenticated request to ${providerName.toUpperCase()} API
 */
export async function authenticatedRequest(
  url: string,
  config: ${capitalizeFirst(providerName)}AuthConfig,
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
    config.useProxy ?? false
  );
}

/**
 * Validate ${providerName.toUpperCase()} credentials
 */
export async function validateCredentials(config: ${capitalizeFirst(providerName)}AuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
`,

  // AccessKey + SecretKey 签名模式（阿里云/腾讯云风格）
  accessKey: (providerName, serviceName = '') => `import { fetchWithFallback } from '../internal';

export interface ${capitalizeFirst(providerName)}AuthConfig {
  accessKeyId: string;
  accessKeySecret: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for ${providerName.toUpperCase()} API
 * Note: This provider uses signature-based authentication.
 * The actual signing logic is handled in the adapter.
 */
export function buildAuthHeaders(config: ${capitalizeFirst(providerName)}AuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Make an authenticated request to ${providerName.toUpperCase()} API
 */
export async function authenticatedRequest(
  url: string,
  config: ${capitalizeFirst(providerName)}AuthConfig,
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
    config.useProxy ?? false
  );
}

/**
 * Validate ${providerName.toUpperCase()} credentials
 */
export async function validateCredentials(config: ${capitalizeFirst(providerName)}AuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
`,

  // 用户名密码模式
  usernamePassword: (providerName) => `import { fetchWithFallback } from '../internal';

export interface ${capitalizeFirst(providerName)}AuthConfig {
  username: string;
  password: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for ${providerName.toUpperCase()} API
 */
export function buildAuthHeaders(config: ${capitalizeFirst(providerName)}AuthConfig): Record<string, string> {
  const credentials = Buffer.from(\`\${config.username}:\${config.password}\`).toString('base64');
  return {
    'Content-Type': 'application/json',
    'Authorization': \`Basic \${credentials}\`,
  };
}

/**
 * Make an authenticated request to ${providerName.toUpperCase()} API
 */
export async function authenticatedRequest(
  url: string,
  config: ${capitalizeFirst(providerName)}AuthConfig,
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
    config.useProxy ?? false
  );
}

/**
 * Validate ${providerName.toUpperCase()} credentials
 */
export async function validateCredentials(config: ${capitalizeFirst(providerName)}AuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
`,

  // API Key 模式（简单）
  apiKey: (providerName) => `import { fetchWithFallback } from '../internal';

export interface ${capitalizeFirst(providerName)}AuthConfig {
  apiKey: string;
  useProxy?: boolean;
}

/**
 * Build authentication headers for ${providerName.toUpperCase()} API
 */
export function buildAuthHeaders(config: ${capitalizeFirst(providerName)}AuthConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': config.apiKey,
  };
}

/**
 * Make an authenticated request to ${providerName.toUpperCase()} API
 */
export async function authenticatedRequest(
  url: string,
  config: ${capitalizeFirst(providerName)}AuthConfig,
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
    config.useProxy ?? false
  );
}

/**
 * Validate ${providerName.toUpperCase()} credentials
 */
export async function validateCredentials(config: ${capitalizeFirst(providerName)}AuthConfig): Promise<boolean> {
  try {
    // TODO: Implement credential validation
    return true;
  } catch {
    return false;
  }
}
`,
};

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// 提供商认证类型映射
const providerAuthTypes = {
  aliyun: { type: 'accessKey' },
  dnspod: { type: 'accessKey' },
  tencenteo: { type: 'accessKey' },
  huawei: { type: 'accessKey' },
  baidu: { type: 'accessKey' },
  rainyun: { type: 'apiKey' },
  bt: { type: 'usernamePassword' },
  vps8: { type: 'usernamePassword' },
  spaceship: { type: 'apiKey' },
  namesilo: { type: 'apiKey' },
  west: { type: 'usernamePassword' },
  qingcloud: { type: 'accessKey' },
  powerdns: { type: 'apiKey' },
  huoshan: { type: 'accessKey' },
  jdcloud: { type: 'accessKey' },
  caihongdns: { type: 'apiKey' },
  dnsla: { type: 'apiKey' },
  dnsmgr: { type: 'usernamePassword' },
  aliyunesa: { type: 'accessKey' },
};

function generateAuth(providerName, authType) {
  const template = authTemplates[authType.type];
  if (!template) {
    console.log(`⚠️  未知认证类型: ${authType.type} for ${providerName}`);
    return null;
  }
  
  return template(providerName, authType.serviceName || '');
}

function main() {
  console.log('🔐 开始生成 auth.ts 模块...\n');
  
  let successCount = 0;
  
  Object.entries(providerAuthTypes).forEach(([provider, authType]) => {
    const providerDir = path.join(providersDir, provider);
    const authPath = path.join(providerDir, 'auth.ts');
    
    if (!fs.existsSync(providerDir)) {
      console.log(`⚠️  目录不存在: ${provider}`);
      return;
    }
    
    if (fs.existsSync(authPath)) {
      console.log(`✅ ${provider}/auth.ts 已存在，跳过`);
      return;
    }
    
    const content = generateAuth(provider, authType);
    if (content) {
      fs.writeFileSync(authPath, content, 'utf-8');
      console.log(`✅ ${provider}/auth.ts 已生成 (${authType.type})`);
      successCount++;
    }
  });
  
  console.log(`\n✨ 完成! 生成了 ${successCount} 个 auth.ts 文件`);
}

main();

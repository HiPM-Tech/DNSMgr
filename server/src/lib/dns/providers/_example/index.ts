/**
 * Example Provider Module - 示例提供商模块
 * 
 * This module exports all example provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 * 
 * 使用说明：
 * 1. 复制整个 _example 文件夹并重命名为你的提供商名称（如 cloudflare）
 * 2. 修改 adapter.ts 中的类名和实现
 * 3. 修改 auth.ts 中的认证逻辑
 * 4. 更新 index.ts 中的导出名称
 * 5. 在 providers/index.ts 中导出你的适配器
 */

// Main adapter for DNS record operations
export { ExampleAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as exampleBuildAuthHeaders,
  authenticatedRequest as exampleAuthenticatedRequest,
  validateCredentials as exampleValidateCredentials,
  type ExampleAuthConfig,
} from './auth';

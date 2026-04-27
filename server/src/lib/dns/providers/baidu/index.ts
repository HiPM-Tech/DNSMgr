/**
 * Baidu Provider Module
 * 
 * This module exports all baidu provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { BaiduAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as baiduBuildAuthHeaders,
  authenticatedRequest as baiduAuthenticatedRequest,
  validateCredentials as baiduValidateCredentials,
  type BaiduAuthConfig,
} from './auth';

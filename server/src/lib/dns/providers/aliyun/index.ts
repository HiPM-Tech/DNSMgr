/**
 * Aliyun Provider Module
 * 
 * This module exports all aliyun provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { AliyunAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as aliyunBuildAuthHeaders,
  authenticatedRequest as aliyunAuthenticatedRequest,
  validateCredentials as aliyunValidateCredentials,
  type AliyunAuthConfig,
} from './auth';

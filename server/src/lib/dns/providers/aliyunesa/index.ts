/**
 * Aliyunesa Provider Module
 * 
 * This module exports all aliyunesa provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { AliyunesaAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as aliyunesaBuildAuthHeaders,
  authenticatedRequest as aliyunesaAuthenticatedRequest,
  validateCredentials as aliyunesaValidateCredentials,
  type AliyunesaAuthConfig,
} from './auth';

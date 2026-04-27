/**
 * Qingcloud Provider Module
 * 
 * This module exports all qingcloud provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { QingcloudAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as qingcloudBuildAuthHeaders,
  authenticatedRequest as qingcloudAuthenticatedRequest,
  validateCredentials as qingcloudValidateCredentials,
  type QingcloudAuthConfig,
} from './auth';

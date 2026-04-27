/**
 * Jdcloud Provider Module
 * 
 * This module exports all jdcloud provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { JdcloudAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as jdcloudBuildAuthHeaders,
  authenticatedRequest as jdcloudAuthenticatedRequest,
  validateCredentials as jdcloudValidateCredentials,
  type JdcloudAuthConfig,
} from './auth';

/**
 * West Provider Module
 * 
 * This module exports all west provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { WestAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as westBuildAuthHeaders,
  authenticatedRequest as westAuthenticatedRequest,
  validateCredentials as westValidateCredentials,
  type WestAuthConfig,
} from './auth';

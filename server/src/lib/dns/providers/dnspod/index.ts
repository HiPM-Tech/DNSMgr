/**
 * Dnspod Provider Module
 * 
 * This module exports all dnspod provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { DnspodAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as dnspodBuildAuthHeaders,
  authenticatedRequest as dnspodAuthenticatedRequest,
  validateCredentials as dnspodValidateCredentials,
  type DnspodAuthConfig,
} from './auth';

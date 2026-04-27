/**
 * Dnsmgr Provider Module
 * 
 * This module exports all dnsmgr provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { DnsMgrAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as dnsmgrBuildAuthHeaders,
  authenticatedRequest as dnsmgrAuthenticatedRequest,
  validateCredentials as dnsmgrValidateCredentials,
  type DnsMgrAuthConfig,
} from './auth';

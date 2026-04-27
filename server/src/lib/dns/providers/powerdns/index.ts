/**
 * Powerdns Provider Module
 * 
 * This module exports all powerdns provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { PowerdnsAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as powerdnsBuildAuthHeaders,
  authenticatedRequest as powerdnsAuthenticatedRequest,
  validateCredentials as powerdnsValidateCredentials,
  type PowerdnsAuthConfig,
} from './auth';

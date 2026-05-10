/**
 * HiDNS Provider Module
 * 
 * This module exports all HiDNS provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { HiDNSAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as hidnsBuildAuthHeaders,
  authenticatedRequest as hidnsAuthenticatedRequest,
  validateCredentials as hidnsValidateCredentials,
  type HiDNSAuthConfig,
} from './auth';

/**
 * Dnsla Provider Module
 * 
 * This module exports all dnsla provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { DnslaAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as dnslaBuildAuthHeaders,
  authenticatedRequest as dnslaAuthenticatedRequest,
  validateCredentials as dnslaValidateCredentials,
  type DnslaAuthConfig,
} from './auth';

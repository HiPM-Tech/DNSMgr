/**
 * Caihongdns Provider Module
 * 
 * This module exports all caihongdns provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { CaihongDnsAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthParams as caihongdnsBuildAuthParams,
  authenticatedRequest as caihongdnsAuthenticatedRequest,
  validateCredentials as caihongdnsValidateCredentials,
  type CaihongDnsAuthConfig,
} from './auth';

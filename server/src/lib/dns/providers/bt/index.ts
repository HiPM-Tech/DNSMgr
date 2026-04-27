/**
 * Bt Provider Module
 * 
 * This module exports all bt provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { BtAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as btBuildAuthHeaders,
  authenticatedRequest as btAuthenticatedRequest,
  validateCredentials as btValidateCredentials,
  type BtAuthConfig,
} from './auth';

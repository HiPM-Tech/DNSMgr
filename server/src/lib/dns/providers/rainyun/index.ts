/**
 * Rainyun Provider Module
 * 
 * This module exports all rainyun provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { RainyunAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as rainyunBuildAuthHeaders,
  authenticatedRequest as rainyunAuthenticatedRequest,
  validateCredentials as rainyunValidateCredentials,
  type RainyunAuthConfig,
} from './auth';

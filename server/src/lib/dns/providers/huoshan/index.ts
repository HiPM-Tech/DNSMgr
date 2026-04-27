/**
 * Huoshan Provider Module
 * 
 * This module exports all huoshan provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { HuoshanAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as huoshanBuildAuthHeaders,
  authenticatedRequest as huoshanAuthenticatedRequest,
  validateCredentials as huoshanValidateCredentials,
  type HuoshanAuthConfig,
} from './auth';

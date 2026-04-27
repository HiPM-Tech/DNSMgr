/**
 * Namesilo Provider Module
 * 
 * This module exports all namesilo provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { NamesiloAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as namesiloBuildAuthHeaders,
  authenticatedRequest as namesiloAuthenticatedRequest,
  validateCredentials as namesiloValidateCredentials,
  type NamesiloAuthConfig,
} from './auth';

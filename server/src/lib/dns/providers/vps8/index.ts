/**
 * Vps8 Provider Module
 * 
 * This module exports all vps8 provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { Vps8Adapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as vps8BuildAuthHeaders,
  authenticatedRequest as vps8AuthenticatedRequest,
  validateCredentials as vps8ValidateCredentials,
  type Vps8AuthConfig,
} from './auth';

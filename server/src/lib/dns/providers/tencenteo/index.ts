/**
 * Tencenteo Provider Module
 * 
 * This module exports all tencenteo provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { TencenteoAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as tencenteoBuildAuthHeaders,
  authenticatedRequest as tencenteoAuthenticatedRequest,
  validateCredentials as tencenteoValidateCredentials,
  type TencenteoAuthConfig,
} from './auth';

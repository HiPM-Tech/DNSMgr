/**
 * Cloudflare Provider Module
 * 
 * This module exports all Cloudflare provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { CloudflareAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as cloudflareBuildAuthHeaders,
  authenticatedRequest as cloudflareAuthenticatedRequest,
  validateCredentials as cloudflareValidateCredentials,
  type CloudflareAuthConfig,
} from './auth';

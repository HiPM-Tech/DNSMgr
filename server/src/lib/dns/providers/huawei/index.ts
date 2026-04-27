/**
 * Huawei Provider Module
 * 
 * This module exports all huawei provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { HuaweiAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as huaweiBuildAuthHeaders,
  authenticatedRequest as huaweiAuthenticatedRequest,
  validateCredentials as huaweiValidateCredentials,
  type HuaweiAuthConfig,
} from './auth';

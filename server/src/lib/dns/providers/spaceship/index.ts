/**
 * Spaceship Provider Module
 * 
 * This module exports all spaceship provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { SpaceshipAdapter } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as spaceshipBuildAuthHeaders,
  authenticatedRequest as spaceshipAuthenticatedRequest,
  validateCredentials as spaceshipValidateCredentials,
  type SpaceshipAuthConfig,
} from './auth';

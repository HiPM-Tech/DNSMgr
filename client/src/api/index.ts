// ─── API Module Exports ──────────────────────────────────────────────────────
// This file provides backward-compatible exports while migration to modular structure is in progress.
// New code should import directly from individual module files (e.g., './auth', './accounts').

// Base client and types
export { api } from './client';
export type { ApiResponse } from './client';
export * from './types';

// Modular APIs (new structure - preferred)
export { authApi } from './auth';
export { accountsApi, tunnelsApi } from './accounts';
export { domainsApi, domainRenewalApi } from './domains';
export { recordsApi } from './records';

// Legacy API exports (deprecated - will be removed after full migration)
// These are kept for backward compatibility with existing imports

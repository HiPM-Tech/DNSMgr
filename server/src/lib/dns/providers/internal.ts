/**
 * DNS Providers Internal Module
 * 
 * This module re-exports external dependencies for internal use within DNS providers.
 * It provides a centralized place to manage external dependencies and simplifies imports.
 * 
 * Usage in provider files:
 * ```typescript
 * import { log, fetchWithFallback, BaseAdapter, ... } from './internal';
 * ```
 */

// ============================================================================
// Logger
// ============================================================================
export { log } from '../../logger';

// ============================================================================
// HTTP Utilities
// ============================================================================
export { fetchWithFallback } from '../../proxy-http';
export { requestXml } from './http';

// ============================================================================
// Common Types and Utilities
// ============================================================================
export { 
  asArray, 
  Dict, 
  normalizeRrName, 
  safeString, 
  BaseAdapter, 
  AliyunRpcAdapter,
  TencentCloudAdapter,
  toNumber, 
  toRecordStatus,
  resolveDomainIdHelper,
  uuid,
  isSrv,
  parseSrvValue,
  buildSrvValue,
} from './common';

// ============================================================================
// DNS Interface Types
// ============================================================================
export type { 
  DnsAdapter, 
  DnsRecord, 
  DomainInfo, 
  PageResult,
} from '../DnsInterface';

// ============================================================================
// Helper Functions
// ============================================================================
export { 
  createAdapter,
  getProvider,
  getProviders,
  isStubProvider,
} from '../DnsHelper';

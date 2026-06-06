/**
 * DNS Providers Internal Module
 *
 * This module re-exports external dependencies for internal use within DNS providers.
 * It provides a centralized place to manage external dependencies and simplifies imports.
 *
 * Usage in provider files:
 * ```typescript
 * import { createProviderAdapterLogger, fetchWithFallback, BaseAdapter } from './internal';
 * ```
 */

// ============================================================================
// Logger
// ============================================================================
import { createLogger } from '../../logger';

const log = createLogger('DNS');

export const createDnsLogger = () => log;
export const createDnsHelperLogger = () => log.sub('Helper');
export const createDnsResolverLogger = (resolver: string) => log.sub('Resolver').sub(resolver);
export const createProviderLogger = (provider: string) => log.sub('Provider').sub(provider);
export const createProviderAdapterLogger = (provider: string) => createProviderLogger(provider).sub('Adapter');
export const createProviderAuthLogger = (provider: string) => createProviderLogger(provider).sub('Auth');
export const createProviderApiLogger = (provider: string) => createProviderLogger(provider).sub('API');
export const createProviderRenewalLogger = (provider: string) => createProviderLogger(provider).sub('Renewal');
export const createProviderWhoisLogger = (provider: string) => createProviderLogger(provider).sub('Whois');

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

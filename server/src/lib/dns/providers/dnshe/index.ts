/**
 * DNSHE Provider Module
 * 
 * This module exports all DNSHE provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 * - Renewal: Domain renewal functionality
 * - Whois: WHOIS query functionality
 */

// Main adapter for DNS record operations
export { DnsheAdapter } from './adapter';

// Authentication utilities
export { 
  buildAuthHeaders,
  authenticatedRequest,
  validateCredentials,
  type DnsheAuthConfig,
} from './auth';

// Domain renewal functionality
export { 
  renewSubdomain,
  listSubdomains,
  type DnsheRenewalResult,
  type DnsheSubdomain,
  type DnsheSubdomainListResult,
} from './renewal';

// WHOIS query functionality
export { 
  getWhois,
  type DnsheWhoisResult,
} from './whois';

// Domain renewal scheduler
export { 
  DnsheRenewalScheduler,
  dnsheRenewalScheduler,
} from './scheduler';

// WHOIS query scheduler
export { 
  DnsheWhoisScheduler,
  dnsheWhoisScheduler,
} from './whoisScheduler';

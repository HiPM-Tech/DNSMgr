# DNSHE Provider Module Structure (API V2.0)

## Overview

The DNSHE provider has been refactored into a modular structure to improve maintainability and extensibility. This implementation follows the **DNSHE API V2.0** specification.

### Key Features in V2.0

- ✅ **Pagination Support**: Native API pagination with `page`, `per_page`, and `include_total`
- ✅ **Domain Expiry Information**: `expires_at` and `never_expires` fields in domain list
- ✅ **Advanced Search**: Filter by keyword, rootdomain, status, date range
- ✅ **Dual Record IDs**: Both internal `id` and cloud provider `record_id`
- ✅ **WHOIS Public Access**: Optional API key for WHOIS queries
- ✅ **Renewal with Billing**: Returns `charged_amount` for renewal operations

## Directory Structure

```
dnshe/
├── index.ts          # Main export file - re-exports all modules
├── adapter.ts        # DNS record management (DnsAdapter implementation)
├── auth.ts           # Authentication utilities
├── renewal.ts        # Domain renewal functionality
└── whois.ts          # WHOIS query functionality
```

## Modules

### API V2.0 Changes

**Updated Interfaces:**

```typescript
interface DnsheSubdomain {
  id: number;
  subdomain: string;
  rootdomain: string;
  full_domain: string;
  status: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;        // NEW in V2.0
  never_expires?: number;     // NEW in V2.0 (0 or 1)
}

interface DnsheRecord {
  id: number;
  record_id?: string;         // NEW in V2.0 - Cloud provider ID
  name: string;
  type: string;
  content: string;
  ttl: number;
  priority: number | null;
  line?: string | null;       // NEW in V2.0
  proxied: boolean;
  status: string;
  created_at: string;
  updated_at?: string;        // NEW in V2.0
}
```

**Pagination Response:**

```typescript
{
  success: true,
  count: 100,
  subdomains: [...],
  pagination: {
    page: 2,
    per_page: 100,
    has_more: true,
    next_page: 3,
    prev_page: 1,
    total: 12500
  }
}
```

### 1. `auth.ts` - Authentication Module

Handles all authentication-related operations for DNSHE API.

**Exports:**
- `DnsheAuthConfig` - Configuration interface
- `buildAuthHeaders()` - Build authentication headers
- `authenticatedRequest()` - Make authenticated HTTP requests
- `validateCredentials()` - Validate API credentials

**Usage:**
```typescript
import { buildAuthHeaders, validateCredentials } from './auth';

const config = {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  useProxy: false,
};

// Build headers for custom requests
const headers = buildAuthHeaders(config);

// Validate credentials
const isValid = await validateCredentials(config);
```

### 2. `adapter.ts` - DNS Record Management

Implements the `DnsAdapter` interface for DNS record operations.

**V2.0 Features:**
- ✅ Native API pagination support
- ✅ Domain expiry information (`expires_at`, `never_expires`)
- ✅ Advanced search and filtering
- ✅ Dual record ID support (internal `id` + cloud `record_id`)

**Features:**
- Domain list management with pagination
- DNS record CRUD operations
- Record status management
- Integration with renewal and whois modules

**Usage:**
```typescript
import { DnsheAdapter } from './adapter';

const adapter = new DnsheAdapter({
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  zoneId: 'subdomain-id',
  domain: 'example.com',
});

// Get domain records (V2.0 with pagination)
const records = await adapter.getDomainRecords(1, 50);

// Add a record
const recordId = await adapter.addDomainRecord('www', 'A', '1.2.3.4');

// Get domain list with expiry info (V2.0)
const domains = await adapter.getDomainList('test', 1, 50);
// Returns: { total: 100, list: [{ Domain, ThirdId, ExpiresAt, NeverExpires, ... }] }
```

### 3. `renewal.ts` - Domain Renewal Module

Handles domain/subdomain renewal operations.

**V2.0 Response:**
```typescript
interface DnsheRenewalResult {
  success: boolean;
  message?: string;
  subdomain_id: number;
  subdomain: string;
  previous_expires_at: string;
  new_expires_at: string;
  renewed_at: string;
  never_expires: number;
  status: string;
  remaining_days: number;
  charged_amount: number;  // NEW in V2.0 - Amount deducted from balance
}
```

**Exports:**
- `DnsheRenewalResult` - Renewal result interface
- `renewSubdomain()` - Renew a subdomain

**Usage:**
```typescript
import { renewSubdomain } from './renewal';

const result = await renewSubdomain(
  {
    apiKey: 'your-api-key',
    apiSecret: 'your-api-secret',
    useProxy: false,
  },
  subdomainId
);

if (result) {
  console.log(`Renewed until: ${result.new_expires_at}`);
  console.log(`Charged: ${result.charged_amount} credits`);  // V2.0
}
```

### 4. `whois.ts` - WHOIS Query Module

Handles WHOIS information queries for domains.

**Exports:**
- `DnsheWhoisResult` - WHOIS result interface
- `getWhois()` - Query WHOIS information

**Usage:**
```typescript
import { getWhois } from './whois';

const whois = await getWhois(
  {
    apiKey: 'your-api-key',
    apiSecret: 'your-api-secret',
    useProxy: false,
  },
  'example.com'
);

if (whois) {
  console.log(`Expires at: ${whois.expires_at}`);
}
```

### 5. `index.ts` - Main Export File

Re-exports all modules for convenient access.

**Usage:**
```typescript
// Import everything from one place
import {
  DnsheAdapter,
  renewSubdomain,
  getWhois,
  validateCredentials,
  type DnsheAuthConfig,
  type DnsheRenewalResult,
  type DnsheWhoisResult,
} from './dnshe';
```

## Benefits of This Architecture

### 1. **Separation of Concerns**
- Each module has a single responsibility
- Easier to understand and maintain
- Clear boundaries between different functionalities

### 2. **Reusability**
- Auth module can be used by other modules
- Renewal and WHOIS functions can be called independently
- Easy to add new features that need authentication

### 3. **Extensibility**
- New features can be added as separate modules
- Existing modules can be extended without affecting others
- Easy to add support for new providers following the same pattern

### 4. **Testability**
- Each module can be tested independently
- Mock dependencies easily
- Better test coverage

### 5. **Maintainability**
- Changes to one module don't affect others
- Easier to locate and fix bugs
- Clear code organization

## Future Enhancements

This architecture makes it easy to add:

1. **Monitoring Module** - Track domain health and performance
2. **Statistics Module** - Gather usage statistics
3. **Backup Module** - Backup and restore DNS configurations
4. **Migration Module** - Migrate domains between providers
5. **Webhook Module** - Handle webhook notifications

All new modules can reuse the `auth.ts` module for authentication.

## Migration Guide

If you're updating code that used the old single-file structure:

**Before:**
```typescript
import { DnsheAdapter } from '../providers/dnshe';

const adapter = new DnsheAdapter(config);
await adapter.renewSubdomain(id);
await adapter.getWhois(domain);
```

**After:**
```typescript
import { 
  DnsheAdapter,
  dnsheRenewSubdomain,
  dnsheGetWhois,
} from '../providers';

// For DNS operations, use the adapter
const adapter = new DnsheAdapter(config);
await adapter.getDomainRecords();

// For renewal, use the dedicated function
const result = await dnsheRenewSubdomain(authConfig, subdomainId);

// For WHOIS, use the dedicated function
const whois = await dnsheGetWhois(authConfig, domain);
```

## Internal Module

All providers share a common internal module at `providers/internal.ts` that re-exports external dependencies:

```typescript
import { log, fetchWithFallback, BaseAdapter } from '../internal';
```

This simplifies imports and provides a centralized place to manage dependencies.

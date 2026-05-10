/**
 * Domain utilities with IDN (Internationalized Domain Name) support
 * Supports Chinese and other Unicode domain names
 */

/**
 * Convert Unicode domain to Punycode (ASCII representation)
 * Example: "例子.测试" -> "xn--fsq092h.xn--0zwm56d"
 */
export function toPunycode(domain: string): string {
  try {
    // Use URL API for Punycode conversion
    // The URL API automatically handles IDN to Punycode conversion
    const url = new URL(`http://${domain.trim()}`);
    return url.hostname;
  } catch {
    // If URL parsing fails, return the original domain
    return domain.trim().toLowerCase();
  }
}

/**
 * Convert Punycode domain to Unicode
 * Example: "xn--fsq092h.xn--0zwm56d" -> "例子.测试"
 */
export function toUnicode(domain: string): string {
  try {
    // Use URL API with unicode option for conversion
    const url = new URL(`http://${domain.trim()}`);
    // The hostname getter returns Unicode representation when possible
    return url.hostname;
  } catch {
    return domain.trim();
  }
}

/**
 * Check if domain contains Unicode characters (non-ASCII)
 */
export function isUnicodeDomain(domain: string): boolean {
  return /[^\x00-\x7F]/.test(domain);
}

/**
 * Check if domain is in Punycode format
 */
export function isPunycodeDomain(domain: string): boolean {
  return domain.includes('xn--');
}

/**
 * Normalize domain name:
 * 1. Trim whitespace
 * 2. Convert to lowercase
 * 3. Convert Unicode to Punycode for storage and API calls
 */
export function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  
  // If contains Unicode, convert to Punycode
  if (isUnicodeDomain(trimmed)) {
    return toPunycode(trimmed);
  }
  
  return trimmed;
}

/**
 * Validate domain name format (supports both ASCII and Unicode)
 * Supports:
 * - Standard ASCII domains: example.com
 * - Punycode domains: xn--fsq092h.xn--0zwm56d
 * - Unicode domains: 例子.测试
 */
export function isValidDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }

  const trimmed = domain.trim();
  if (trimmed.length === 0 || trimmed.length > 253) {
    return false;
  }

  try {
    // Convert to Punycode for validation
    const punycode = toPunycode(trimmed);
    
    // Validate Punycode format
    // Each label should be 1-63 characters, total max 253
    const labels = punycode.split('.');
    
    for (const label of labels) {
      if (label.length === 0 || label.length > 63) {
        return false;
      }
      
      // Punycode labels start with xn--
      if (label.startsWith('xn--')) {
        // Validate Punycode format
        if (!/^xn--[a-z0-9-]+$/i.test(label)) {
          return false;
        }
      } else {
        // Standard ASCII label validation
        // Allow: alphanumeric, hyphen
        // Must start and end with alphanumeric
        if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) {
          return false;
        }
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract root domain from a domain name
 * Supports both ASCII and Unicode domains
 */
export function getRootDomain(domain: string): string {
  const normalized = normalizeDomain(domain);
  const parts = normalized.split('.');
  
  if (parts.length < 2) {
    return normalized;
  }
  
  // For common TLDs, take last 2 parts
  // For country-code TLDs with second level (like .co.uk), this might need adjustment
  return parts.slice(-2).join('.');
}

/**
 * Get display name for domain (Unicode for UI, Punycode for system)
 */
export function getDisplayDomain(domain: string, preferUnicode = true): string {
  if (preferUnicode) {
    return toUnicode(domain);
  }
  return normalizeDomain(domain);
}

/**
 * Sanitize domain input
 * Removes whitespace and converts to lowercase
 */
export function sanitizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

/**
 * Check if two domains are the same (handles both Unicode and Punycode forms)
 */
export function areDomainsEqual(domain1: string, domain2: string): boolean {
  const normalized1 = normalizeDomain(domain1);
  const normalized2 = normalizeDomain(domain2);
  return normalized1 === normalized2;
}

/**
 * Validate subdomain name
 * Supports Unicode subdomains and underscore-prefixed labels
 * Examples: www, blog, _dmarc, _acme-challenge, 子域名
 */
export function isValidSubdomain(subdomain: string): boolean {
  if (!subdomain || typeof subdomain !== 'string') {
    return false;
  }

  const trimmed = subdomain.trim();

  // Special case for @ (root)
  if (trimmed === '@') {
    return true;
  }

  // Empty or too long
  if (trimmed.length === 0 || trimmed.length > 63) {
    return false;
  }

  // Split by dot for multi-level subdomains
  const labels = trimmed.split('.');

  for (const label of labels) {
    if (label.length === 0 || label.length > 63) {
      return false;
    }

    // Check if label contains Unicode characters
    if (/[^\x00-\x7F]/.test(label)) {
      // Unicode label - convert to Punycode for validation
      try {
        const punycode = toPunycode(label);
        if (punycode.startsWith('xn--')) {
          if (!/^xn--[a-z0-9-]+$/i.test(punycode)) {
            return false;
          }
        }
      } catch {
        return false;
      }
    } else {
      // ASCII label - allow underscore for DNS records like _dmarc, _acme-challenge
      // Allow: alphanumeric, hyphen, underscore
      // Must not start or end with hyphen
      if (!/^[a-zA-Z0-9_]([a-zA-Z0-9-_]{0,61}[a-zA-Z0-9_])?$/i.test(label)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate hostname for DNS record values (CNAME, MX, NS, etc.)
 * Supports:
 * - Standard domains: example.com
 * - IDN domains: 例子.测试
 * - Underscore-prefixed labels: _dmarc.example.com, _acme-challenge.example.com
 * - Punycode domains: xn--fsq092h.xn--0zwm56d
 */
export function isValidHostname(hostname: string): boolean {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }

  const trimmed = hostname.trim().replace(/\.$/, ''); // Remove trailing dot
  if (trimmed.length === 0 || trimmed.length > 253) {
    return false;
  }

  // Split by dot for validation
  const labels = trimmed.split('.');

  for (const label of labels) {
    if (label.length === 0 || label.length > 63) {
      return false;
    }

    // Check if label contains Unicode characters
    if (/[^\x00-\x7F]/.test(label)) {
      // Unicode label - convert to Punycode for validation
      try {
        const punycode = toPunycode(label);
        if (punycode.startsWith('xn--')) {
          if (!/^xn--[a-z0-9-]+$/i.test(punycode)) {
            return false;
          }
        }
      } catch {
        return false;
      }
    } else {
      // ASCII label - allow underscore for DNS records like _dmarc, _acme-challenge, _cf
      // Allow: alphanumeric, hyphen, underscore
      // Must not start or end with hyphen
      if (!/^[a-zA-Z0-9_]([a-zA-Z0-9-_]{0,61}[a-zA-Z0-9_])?$/i.test(label)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Extract subdomain from full domain
 * Example: "www.example.com" -> "www", "example.com"
 */
export function extractSubdomain(fullDomain: string, rootDomain: string): { subdomain: string; domain: string } {
  const normalizedFull = normalizeDomain(fullDomain);
  const normalizedRoot = normalizeDomain(rootDomain);
  
  if (normalizedFull === normalizedRoot) {
    return { subdomain: '@', domain: normalizedRoot };
  }
  
  if (normalizedFull.endsWith('.' + normalizedRoot)) {
    const subdomain = normalizedFull.slice(0, -(normalizedRoot.length + 1));
    return { subdomain, domain: normalizedRoot };
  }
  
  return { subdomain: '@', domain: normalizedFull };
}

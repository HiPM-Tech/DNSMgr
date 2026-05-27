import punycode from 'punycode.js';

/**
 * Convert Punycode domain to Unicode (IDN decoding)
 * Example: xn--fiqs8s.com -> 中国.com
 */
export function decodePunycode(domain: string): string {
  if (!domain || typeof domain !== 'string') {
    return domain;
  }

  try {
    // Check if domain contains Punycode labels (xn--)
    const hasPunycode = domain.split('.').some(label => label.toLowerCase().startsWith('xn--'));
    if (!hasPunycode) {
      return domain;
    }

    // Use punycode.js library for reliable IDN decoding
    return punycode.toUnicode(domain);
  } catch {
    // If any error occurs, return original domain
    return domain;
  }
}

/**
 * Format domain name for display (decode Punycode to Unicode)
 */
export function formatDomainName(domain: string): string {
  return decodePunycode(domain);
}

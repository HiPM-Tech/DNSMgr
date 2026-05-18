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
    const labels = domain.split('.');
    const decodedLabels = labels.map((label) => {
      // Only decode labels that start with xn--
      if (label.toLowerCase().startsWith('xn--')) {
        try {
          // Use the built-in URL API for decoding
          // Create a fake URL to leverage the browser's IDN decoding
          const decoded = new URL(`http://${label}.example.com`).hostname.split('.')[0];
          return decoded;
        } catch {
          // If decoding fails, return original label
          return label;
        }
      }
      return label;
    });

    return decodedLabels.join('.');
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

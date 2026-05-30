/**
 * RSA Encryption Utility for Password Security
 * Uses Web Crypto API for client-side encryption
 */

let publicKey: string | null = null;
let cryptoKey: CryptoKey | null = null;

/**
 * Fetch RSA public key from server
 */
export async function getPublicKey(): Promise<string> {
  if (publicKey) {
    return publicKey;
  }

  try {
    const response = await fetch('/api/auth/public-key');
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(data.msg || 'Failed to get public key');
    }
    
    publicKey = data.data.publicKey as string;
    return publicKey;
  } catch (error) {
    console.error('Failed to fetch public key:', error);
    throw error;
  }
}

/**
 * Import PEM public key to CryptoKey
 */
async function importPublicKey(pem: string): Promise<CryptoKey> {
  if (cryptoKey) {
    return cryptoKey;
  }

  // Remove PEM headers and decode base64
  const pemContents = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import the key
  cryptoKey = await window.crypto.subtle.importKey(
    'spki',
    binaryDer.buffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    true,
    ['encrypt']
  );

  return cryptoKey;
}

/**
 * Encrypt password using RSA public key
 * @param password - Plain text password
 * @returns Base64 encoded encrypted password
 */
export async function encryptPassword(password: string): Promise<string> {
  if (!window.crypto?.subtle) {
    throw new Error('Password encryption is unavailable (non-HTTPS context)');
  }

  try {
    const pem = await getPublicKey();
    const key = await importPublicKey(pem);
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      key,
      data
    );
    const encryptedArray = new Uint8Array(encrypted);
    return btoa(String.fromCharCode(...encryptedArray));
  } catch (error) {
    console.error('Failed to encrypt password:', error);
    throw new Error(`Password encryption failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Clear cached keys (useful for logout or key rotation)
 */
export function clearKeyCache(): void {
  publicKey = null;
  cryptoKey = null;
}

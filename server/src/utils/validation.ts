/**
 * Common validation utilities
 * Provides reusable validation functions for common patterns
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate username format (alphanumeric, underscore, hyphen)
 */
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[A-Za-z0-9_-]{3,32}$/;
  return usernameRegex.test(username);
}

/**
 * Validate password strength
 * Requires: at least 8 chars, 1 uppercase, 1 lowercase, 1 number
 */
export function isValidPassword(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

/**
 * Validate domain name format
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
  return domainRegex.test(domain);
}

/**
 * Validate IP address (IPv4 or IPv6)
 */
export function isValidIp(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([\da-f]{0,4}:){2,7}[\da-f]{0,4}$/i;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate required field
 */
export function isRequired(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Validate string length
 */
export function isValidLength(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max;
}

/**
 * Validate number range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Sanitize string input (basic XSS prevention)
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate object against schema
 */
export interface ValidationSchema {
  [key: string]: {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: RegExp;
    custom?: (value: unknown) => boolean;
  };
}

export function validateObject(obj: Record<string, unknown>, schema: ValidationSchema): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const [key, rules] of Object.entries(schema)) {
    const value = obj[key];

    // Check required
    if (rules.required && !isRequired(value)) {
      errors[key] = `${key} is required`;
      continue;
    }

    if (!isRequired(value)) continue;

    // Check type
    if (rules.type && typeof value !== rules.type) {
      errors[key] = `${key} must be of type ${rules.type}`;
      continue;
    }

    // Check string length
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors[key] = `${key} must be at least ${rules.minLength} characters`;
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors[key] = `${key} must be at most ${rules.maxLength} characters`;
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors[key] = `${key} format is invalid`;
      }
    }

    // Check number range
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors[key] = `${key} must be at least ${rules.min}`;
      }
      if (rules.max !== undefined && value > rules.max) {
        errors[key] = `${key} must be at most ${rules.max}`;
      }
    }

    // Check custom validation
    if (rules.custom && !rules.custom(value)) {
      errors[key] = `${key} validation failed`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

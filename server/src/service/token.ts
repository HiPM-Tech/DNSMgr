import crypto from 'crypto';
import { TokenOperations, DomainOperations } from '../db/business-adapter';
import { UserToken, UserTokenCreate, UserTokenResponse, TokenPayload } from '../types/token';
import { isAdmin } from '../utils/roles';

const TOKEN_PREFIX = 'dnsmgr_';

// Generate a new token
export function generateToken(): string {
  return TOKEN_PREFIX + crypto.randomBytes(32).toString('hex');
}

// Hash token for storage
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Create a new user token
export async function createUserToken(
  userId: number,
  data: UserTokenCreate
): Promise<{ token: string; tokenData: UserTokenResponse }> {
  // Generate token
  const plainToken = generateToken();
  const tokenHash = hashToken(plainToken);

  // Insert into database using business adapter
  const id = await TokenOperations.create({
    user_id: userId,
    name: data.name,
    token_hash: tokenHash,
    allowed_domains: JSON.stringify(data.allowed_domains),
    allowed_services: JSON.stringify(data.allowed_services),
    start_time: data.start_time || null,
    end_time: data.end_time || null,
    max_role: data.max_role,
  });

  const tokenData: UserTokenResponse = {
    id,
    name: data.name,
    allowed_domains: data.allowed_domains,
    allowed_services: data.allowed_services,
    start_time: data.start_time || null,
    end_time: data.end_time || null,
    max_role: data.max_role,
    is_active: true,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };

  return { token: plainToken, tokenData };
}

// Verify a token and return payload
export async function verifyToken(plainToken: string): Promise<TokenPayload | null> {
  if (!plainToken.startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(plainToken);

  // Use business adapter to get token
  const result = await TokenOperations.getByTokenHash(tokenHash) as UserToken | undefined;

  if (!result || !result.is_active) return null;

  // Check time restrictions
  const nowTime = new Date();
  if (result.start_time && new Date(result.start_time) > nowTime) return null;
  if (result.end_time && new Date(result.end_time) < nowTime) return null;

  // Update last used time using business adapter
  await TokenOperations.updateLastUsed(result.id);

  return {
    type: 'token',
    tokenId: result.id,
    userId: result.user_id,
    maxRole: result.max_role,
    allowedDomains: JSON.parse(result.allowed_domains),
    allowedServices: JSON.parse(result.allowed_services),
  };
}

// Get all tokens for a user
export async function getUserTokens(userId: number): Promise<UserTokenResponse[]> {
  // Use business adapter to get tokens
  const results = await TokenOperations.getByUserId(userId) as unknown as UserToken[];

  return results.map((t) => ({
    id: t.id,
    name: t.name,
    allowed_domains: JSON.parse(t.allowed_domains),
    allowed_services: JSON.parse(t.allowed_services),
    start_time: t.start_time,
    end_time: t.end_time,
    max_role: t.max_role,
    is_active: !!t.is_active,
    created_at: t.created_at,
    last_used_at: t.last_used_at,
  }));
}

// Delete a token
export async function deleteUserToken(tokenId: number, userId: number): Promise<void> {
  // Use business adapter to delete token
  await TokenOperations.deleteByUser(tokenId, userId);
}

// Toggle token active status
export async function toggleTokenStatus(tokenId: number, userId: number, isActive: boolean): Promise<void> {
  // Use business adapter to toggle status
  await TokenOperations.toggleStatusByUser(tokenId, userId, isActive);
}

// Check if token has permission for a service
export function hasServicePermission(tokenPayload: TokenPayload, service: string): boolean {
  return tokenPayload.allowedServices.includes(service) || 
         tokenPayload.allowedServices.includes('*');
}

// Check if token has permission for a domain
// Also verifies that the token's creator (user) has access to the domain
export async function hasDomainPermission(tokenPayload: TokenPayload, domainId: number): Promise<boolean> {
  // First check if token explicitly allows this domain
  const tokenAllowsDomain = tokenPayload.allowedDomains.includes(domainId) || 
         tokenPayload.allowedDomains.length === 0; // empty array means all domains
  
  if (!tokenAllowsDomain) return false;
  
  // Admin users have access to all domains
  if (isAdmin(tokenPayload.maxRole)) {
    return true;
  }
  
  // Use business adapter to check domain access
  return await DomainOperations.checkUserDomainAccess(domainId, tokenPayload.userId);
}

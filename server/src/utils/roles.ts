export type RoleLevel = 1 | 2 | 3;

export const ROLE_USER: RoleLevel = 1;
export const ROLE_ADMIN: RoleLevel = 2;
export const ROLE_SUPER: RoleLevel = 3;

export function normalizeRole(role: unknown): RoleLevel {
  if (role === ROLE_SUPER || role === '3') return ROLE_SUPER;
  if (role === ROLE_ADMIN || role === '2' || role === 'admin') return ROLE_ADMIN;
  return ROLE_USER;
}

export function isAtLeast(role: unknown, level: RoleLevel): boolean {
  return normalizeRole(role) >= level;
}

export function isAdmin(role: unknown): boolean {
  return isAtLeast(role, ROLE_ADMIN);
}

export function isSuper(role: unknown): boolean {
  return normalizeRole(role) === ROLE_SUPER;
}

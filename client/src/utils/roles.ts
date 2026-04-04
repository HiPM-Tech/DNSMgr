export type RoleLevel = 1 | 2 | 3;

export const ROLE_USER: RoleLevel = 1;
export const ROLE_ADMIN: RoleLevel = 2;
export const ROLE_SUPER: RoleLevel = 3;

export function isAdmin(role?: number | null): boolean {
  return (role ?? ROLE_USER) >= ROLE_ADMIN;
}

export function roleLabelKey(role?: number | null): string {
  switch (role) {
    case ROLE_SUPER:
      return 'users.role3';
    case ROLE_ADMIN:
      return 'users.role2';
    default:
      return 'users.role1';
  }
}

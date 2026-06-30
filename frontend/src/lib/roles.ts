export type UserRole = "ADMIN" | "OWNER" | "MANAGER" | "TECHNICIAN" | "TENANT";

type RoleLike = { role?: UserRole | string | null; roles?: Array<UserRole | string> | null } | null | undefined;

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  OWNER: "Chủ nhà",
  MANAGER: "Quản lý",
  TECHNICIAN: "Kỹ thuật",
  TENANT: "Khách thuê",
};

export function getUserRoles(user: RoleLike): UserRole[] {
  if (!user) return [];
  const roles = Array.isArray(user.roles) ? user.roles.filter(Boolean) : [];
  if (roles.length > 0) return Array.from(new Set(roles)) as UserRole[];
  return user.role ? [user.role as UserRole] : [];
}

export function hasRole(user: RoleLike, role: UserRole): boolean {
  return getUserRoles(user).includes(role);
}

export function hasAnyRole(user: RoleLike, roles: UserRole[]): boolean {
  const userRoles = getUserRoles(user);
  return roles.some((role) => userRoles.includes(role));
}

export function primaryRole(user: RoleLike): UserRole | undefined {
  const roles = getUserRoles(user);
  const priority: UserRole[] = ["ADMIN", "OWNER", "MANAGER", "TECHNICIAN", "TENANT"];
  return priority.find((role) => roles.includes(role)) || roles[0];
}

export function formatRoles(user: RoleLike): string {
  return getUserRoles(user).map((role) => ROLE_LABELS[role] || role).join(", ");
}

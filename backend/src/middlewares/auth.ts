import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, UserRole } from "../entities/User";
import { AppDataSource } from "../data-source";

export interface AuthPayload {
  id: string;
  phone?: string;
  role?: UserRole;
  roles?: UserRole[];
  appBuildingFilter?: string[];
  isVincentMode?: boolean;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key";

export function normalizeRoles(user?: { role?: UserRole | null; roles?: UserRole[] | null }): UserRole[] {
  if (!user) return [];
  const roles = Array.isArray(user.roles) ? user.roles.filter(Boolean) : [];
  if (roles.length > 0) return Array.from(new Set(roles));
  return user.role ? [user.role] : [];
}

export function primaryRole(user?: { role?: UserRole | null; roles?: UserRole[] | null }): UserRole | undefined {
  const roles = normalizeRoles(user);
  const priority = [UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER, UserRole.TECHNICIAN, UserRole.TENANT];
  return priority.find((role) => roles.includes(role)) || roles[0] || user?.role || undefined;
}

export function hasRole(user: { role?: UserRole | null; roles?: UserRole[] | null } | undefined, role: UserRole): boolean {
  return normalizeRoles(user).includes(role);
}

export function hasAnyRole(user: { role?: UserRole | null; roles?: UserRole[] | null } | undefined, roles: UserRole[]): boolean {
  const userRoles = normalizeRoles(user);
  return roles.some((role) => userRoles.includes(role));
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token khong hop le" });
    return;
  }

  try {
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    
    // Check if user is active in DB
    const user = await AppDataSource.getRepository(User).findOneBy({ id: payload.id });
    if (!user || user.is_active === false) {
      res.status(401).json({ message: "Tài khoản của bạn đã bị khóa hoặc không tồn tại" });
      return;
    }

    const appFilterHeader = req.headers["x-app-building-filter"];
    let appBuildingFilter = typeof appFilterHeader === "string" && appFilterHeader.trim() !== ""
      ? appFilterHeader.split(",").map(id => id.trim())
      : undefined;

    if (primaryRole(user) === UserRole.ADMIN && user.is_vincent_mode) {
      const vincentBuildingsEnv = process.env.VINCENT_BUILDINGS || "v1,v2,v4,v8,v9,v22,v27,a4tk";
      appBuildingFilter = vincentBuildingsEnv.split(",").map(id => id.trim());
    }

    req.user = { 
      ...payload, 
      role: primaryRole(payload), 
      roles: normalizeRoles(payload),
      appBuildingFilter,
      isVincentMode: user.is_vincent_mode
    };
    next();
  } catch {
    res.status(401).json({ message: "Token het han hoac khong hop le" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !hasAnyRole(req.user, roles)) {
      res.status(403).json({ message: "Ban khong co quyen truy cap" });
      return;
    }
    next();
  };
}

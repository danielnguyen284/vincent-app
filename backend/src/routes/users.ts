import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../data-source";
import { User, UserRole } from "../entities/User";
import { authenticate, requireRole, AuthRequest, hasRole, normalizeRoles, primaryRole } from "../middlewares/auth";

const router = Router();
const userRepo = () => AppDataSource.getRepository(User);
const assignableRoles = [UserRole.OWNER, UserRole.MANAGER, UserRole.TECHNICIAN];

function parseAssignableRoles(input: unknown, fallback?: unknown): UserRole[] | null {
  const rawRoles = Array.isArray(input) ? input : fallback ? [fallback] : [];
  if (rawRoles.length === 0) return null;
  if (rawRoles.some((role) => !assignableRoles.includes(role as UserRole))) return null;
  return Array.from(new Set(rawRoles)) as UserRole[];
}

function serializeUser(user: User) {
  const roles = normalizeRoles(user);
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: primaryRole(user),
    roles,
    payment_qr_code: user.payment_qr_code,
    is_active: user.is_active,
    is_vincent_mode: user.is_vincent_mode,
    created_at: user.created_at,
  };
}

router.use(authenticate);

router.post("/toggle-vincent-mode", requireRole(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOneBy({ id: req.user!.id });
    if (!user) {
      res.status(404).json({ message: "Không tìm thấy người dùng" });
      return;
    }
    user.is_vincent_mode = !user.is_vincent_mode;
    const saved = await userRepo().save(user);
    res.json({
      message: `Đã ${saved.is_vincent_mode ? "bật" : "tắt"} chế độ Vincent`,
      is_vincent_mode: saved.is_vincent_mode,
      user: serializeUser(saved)
    });
  } catch (error) {
    console.error("Toggle Vincent Mode error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

router.get("/", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const roleQuery = req.query.role as string;
    let users = await userRepo().find({
      select: ["id", "name", "phone", "email", "role", "roles", "payment_qr_code", "is_active", "created_at"],
      order: { created_at: "DESC" },
    });

    if (hasRole(req.user, UserRole.MANAGER) && !hasRole(req.user, UserRole.ADMIN) && !hasRole(req.user, UserRole.OWNER)) {
      users = users.filter((user) => normalizeRoles(user).includes(UserRole.TECHNICIAN));
    }

    if (roleQuery === "TENANT") {
      users = users.filter((user) => normalizeRoles(user).includes(UserRole.TENANT));
    } else {
      // Exclude users who are ONLY tenants to keep lists clean
      users = users.filter((user) => {
        const roles = normalizeRoles(user);
        return !(roles.length === 1 && roles[0] === UserRole.TENANT);
      });
    }

    res.json(users.map(serializeUser));
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ message: "Loi he thong" });
  }
});

router.get("/:id", requireRole(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({
      where: { id: req.params.id as string },
      select: ["id", "name", "phone", "email", "role", "roles", "payment_qr_code", "is_active", "created_at"],
    });
    if (!user) {
      res.status(404).json({ message: "Khong tim thay nguoi dung" });
      return;
    }
    res.json(serializeUser(user));
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Loi he thong" });
  }
});

router.post("/", requireRole(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, email, password, role, roles: requestedRoles, payment_qr_code } = req.body;
    const roles = parseAssignableRoles(requestedRoles, role);

    if (!name || !phone || !password || !roles) {
      res.status(400).json({ message: "Thieu thong tin bat buoc (name, phone, password, roles)" });
      return;
    }

    const existing = await userRepo().findOneBy({ phone });
    if (existing) {
      res.status(409).json({ message: "So dien thoai da ton tai" });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    const user = userRepo().create({
      name,
      phone,
      email: email || null,
      password_hash: hash,
      role: roles[0],
      roles,
      payment_qr_code: roles.includes(UserRole.OWNER) ? payment_qr_code || null : null,
    });

    const saved = await userRepo().save(user);
    res.status(201).json(serializeUser(saved));
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ message: "Loi he thong" });
  }
});

router.patch("/:id", requireRole(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOneBy({ id: req.params.id as string });
    if (!user) {
      res.status(404).json({ message: "Khong tim thay nguoi dung" });
      return;
    }

    const { name, phone, email, password, role, roles: requestedRoles, payment_qr_code, is_active } = req.body;

    if (name) user.name = name;
    if (phone) {
      const dup = await userRepo().findOneBy({ phone });
      if (dup && dup.id !== user.id) {
        res.status(409).json({ message: "So dien thoai da ton tai" });
        return;
      }
      user.phone = phone;
    }
    if (email !== undefined) user.email = email;
    if (payment_qr_code !== undefined) user.payment_qr_code = payment_qr_code || null;
    if (password) user.password_hash = await bcrypt.hash(password, 10);
    if (is_active !== undefined) user.is_active = is_active;
    
    if (requestedRoles !== undefined || role) {
      if (normalizeRoles(user).includes(UserRole.ADMIN)) {
        user.roles = [UserRole.ADMIN];
        user.role = UserRole.ADMIN;
      } else {
        const roles = parseAssignableRoles(requestedRoles, role);
        if (!roles) {
          // If the user only has TENANT role, let's keep it
          if (normalizeRoles(user).includes(UserRole.TENANT)) {
            // It's allowed
          } else {
            res.status(400).json({ message: "Vai trò không hợp lệ" });
            return;
          }
        } else {
          user.roles = roles;
          user.role = roles[0];
          if (!roles.includes(UserRole.OWNER)) user.payment_qr_code = "";
        }
      }
    }

    const saved = await userRepo().save(user);
    res.json(serializeUser(saved));
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Loi he thong" });
  }
});

router.delete("/:id", requireRole(UserRole.ADMIN), async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOneBy({ id: req.params.id as string });
    if (!user) {
      res.status(404).json({ message: "Khong tim thay nguoi dung" });
      return;
    }

    if (normalizeRoles(user).includes(UserRole.ADMIN)) {
      res.status(403).json({ message: "Khong the xoa tai khoan Admin" });
      return;
    }

    await userRepo().remove(user);
    res.json({ message: "Da xoa nguoi dung" });
  } catch (error: any) {
    console.error("Delete user error:", error);
    if (error.code === "23503") {
      res.status(409).json({ message: "Khong the xoa nguoi dung nay vi dang co du lieu lien ket." });
      return;
    }
    res.status(500).json({ message: "Loi he thong" });
  }
});

export default router;

import { Router, Response } from "express";
import { In, Not } from "typeorm";
import { AppDataSource } from "../data-source";
import { Tenant } from "../entities/Tenant";
import { Room } from "../entities/Room";
import { Contract } from "../entities/Contract";
import { Ticket, TicketPriority, TicketStatus } from "../entities/Ticket";
import { Invoice } from "../entities/Invoice";
import { ConsumptionRecord } from "../entities/ConsumptionRecord";
import { User, UserRole } from "../entities/User";
import { authenticate, AuthRequest } from "../middlewares/auth";
import bcrypt from "bcryptjs";

const router = Router();
router.use(authenticate);

// Middleware to ensure role is TENANT
function requireTenant(req: AuthRequest, res: Response, next: any) {
  if (!req.user || !req.user.roles?.includes(UserRole.TENANT)) {
    res.status(403).json({ message: "Quyền truy cập bị từ chối. Chỉ dành cho khách thuê." });
    return;
  }
  next();
}

router.use(requireTenant);

// GET /api/tenant/dashboard
router.get("/dashboard", async (req: AuthRequest, res: Response) => {
  try {
    const phone = req.user!.phone;
    if (!phone) {
      res.status(400).json({ message: "Số điện thoại không hợp lệ trong token." });
      return;
    }

    const tenantRepo = AppDataSource.getRepository(Tenant);
    
    // Find active tenant records by phone
    const tenancies = await tenantRepo.find({
      where: { phone, status: "ACTIVE" },
      relations: [
        "room",
        "room.floor",
        "room.floor.building",
        "contract",
        "contract.representative_tenant"
      ]
    });

    if (tenancies.length === 0) {
      res.status(404).json({ message: "Không tìm thấy thông tin phòng thuê hoạt động cho số điện thoại này." });
      return;
    }

    // Assemble tenancies details
    const result = [];
    for (const tenancy of tenancies) {
      // Find roommates (other active tenants in same room)
      const roommates = await tenantRepo.find({
        where: {
          room_id: tenancy.room_id,
          status: "ACTIVE",
          id: Not(tenancy.id)
        }
      });

      result.push({
        id: tenancy.id,
        name: tenancy.name,
        cccd: tenancy.cccd,
        phone: tenancy.phone,
        is_representative: tenancy.is_representative,
        room: {
          id: tenancy.room.id,
          name: tenancy.room.name,
          base_rent: tenancy.room.base_rent,
          floor: tenancy.room.floor.name,
          building: tenancy.room.floor.building.name,
          address: tenancy.room.floor.building.address,
          payment_qr_code: tenancy.room.floor.building.payment_qr_code,
        },
        contract: tenancy.contract ? {
          id: tenancy.contract.id,
          start_date: tenancy.contract.start_date,
          end_date: tenancy.contract.end_date,
          rent_amount: tenancy.contract.rent_amount,
          deposit_amount: tenancy.contract.deposit_amount,
          status: tenancy.contract.status,
          document_photos: tenancy.contract.document_photos,
          representative_tenant: tenancy.contract.representative_tenant ? {
            name: tenancy.contract.representative_tenant.name,
            phone: tenancy.contract.representative_tenant.phone,
          } : null,
        } : null,
        roommates: roommates.map(r => ({
          name: r.name,
          phone: r.phone,
          is_representative: r.is_representative
        })),
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Get tenant dashboard error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// Helper to get active room IDs for tenant
async function getTenantActiveRoomIds(phone: string): Promise<string[]> {
  const tenancies = await AppDataSource.getRepository(Tenant).find({
    where: { phone, status: "ACTIVE" }
  });
  return tenancies.map(t => t.room_id);
}

// GET /api/tenant/invoices
router.get("/invoices", async (req: AuthRequest, res: Response) => {
  try {
    const roomIds = await getTenantActiveRoomIds(req.user!.phone!);
    if (roomIds.length === 0) {
      res.json([]);
      return;
    }

    const invoices = await AppDataSource.getRepository(Invoice).find({
      where: { room_id: In(roomIds) },
      relations: ["items", "room", "room.floor", "room.floor.building"],
      order: { billing_period: "DESC" }
    });

    res.json(invoices);
  } catch (error) {
    console.error("Get tenant invoices error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// GET /api/tenant/utilities
router.get("/utilities", async (req: AuthRequest, res: Response) => {
  try {
    const roomIds = await getTenantActiveRoomIds(req.user!.phone!);
    if (roomIds.length === 0) {
      res.json([]);
      return;
    }

    const records = await AppDataSource.getRepository(ConsumptionRecord).find({
      where: { room_id: In(roomIds) },
      relations: ["room", "room.floor", "room.floor.building"],
      order: { billing_period: "DESC", created_at: "DESC" }
    });

    res.json(records);
  } catch (error) {
    console.error("Get tenant utilities error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// GET /api/tenant/tickets
router.get("/tickets", async (req: AuthRequest, res: Response) => {
  try {
    const roomIds = await getTenantActiveRoomIds(req.user!.phone!);
    if (roomIds.length === 0) {
      res.json([]);
      return;
    }

    const tickets = await AppDataSource.getRepository(Ticket).find({
      where: { room_id: In(roomIds) },
      relations: ["room", "assigned_tech", "expenses"],
      order: { created_at: "DESC" }
    });

    res.json(tickets);
  } catch (error) {
    console.error("Get tenant tickets error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/tenant/tickets
router.post("/tickets", async (req: AuthRequest, res: Response) => {
  try {
    const { room_id, title, description, evidence_photos } = req.body;
    if (!room_id || !title) {
      res.status(400).json({ message: "room_id và tiêu đề là bắt buộc" });
      return;
    }

    // Verify tenant actually belongs to this room
    const roomIds = await getTenantActiveRoomIds(req.user!.phone!);
    if (!roomIds.includes(room_id)) {
      res.status(403).json({ message: "Bạn không có quyền gửi yêu cầu sửa chữa cho phòng này." });
      return;
    }

    // Fetch room to get building_id
    const room = await AppDataSource.getRepository(Room).findOne({
      where: { id: room_id },
      relations: ["floor"]
    });

    if (!room) {
      res.status(404).json({ message: "Không tìm thấy phòng." });
      return;
    }

    const ticketRepo = AppDataSource.getRepository(Ticket);
    const ticket = ticketRepo.create({
      building_id: room.floor.building_id,
      room_id,
      title,
      description: description || null,
      created_by: req.user!.id,
      priority: TicketPriority.MEDIUM,
      evidence_photos: evidence_photos || [],
      status: TicketStatus.PENDING,
    });

    const saved = await ticketRepo.save(ticket);
    res.status(201).json(saved);
  } catch (error) {
    console.error("Create tenant ticket error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/tenant/change-password
router.post("/change-password", async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: "Mật khẩu hiện tại và mật khẩu mới là bắt buộc." });
      return;
    }

    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOneBy({ id: req.user!.id });
    if (!user) {
      res.status(404).json({ message: "Không tìm thấy tài khoản người dùng." });
      return;
    }

    // Check current password
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      res.status(400).json({ message: "Mật khẩu hiện tại không chính xác." });
      return;
    }

    // Hash and save new password
    user.password_hash = await bcrypt.hash(newPassword, 10);
    await userRepo.save(user);

    res.json({ message: "Đổi mật khẩu thành công." });
  } catch (error) {
    console.error("Tenant change password error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

export default router;

import { Router, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source";
import { Tenant } from "../entities/Tenant";
import { Contract, ContractStatus } from "../entities/Contract";
import { Room, RoomStatus } from "../entities/Room";
import { authenticate, requireRole, AuthRequest } from "../middlewares/auth";
import { User, UserRole } from "../entities/User";
import { Building } from "../entities/Building";
import { BuildingManager } from "../entities/BuildingManager";
import { uploadToImgBB } from "../services/imgbb";
import { getAccessibleBuildingIds } from "../utils/access";
import bcrypt from "bcryptjs";

const router = Router();
const tenantRepo = () => AppDataSource.getRepository(Tenant);
const contractRepo = () => AppDataSource.getRepository(Contract);
const roomRepo = () => AppDataSource.getRepository(Room);
const buildingRepo = () => AppDataSource.getRepository(Building);
const managerRepo = () => AppDataSource.getRepository(BuildingManager);

async function syncTenantUser(tenantName: string, tenantPhone: string | undefined | null, tenantStatus: string) {
  if (!tenantPhone) return;
  const userRepo = AppDataSource.getRepository(User);
  const existingUser = await userRepo.findOneBy({ phone: tenantPhone });
  const isActive = tenantStatus === "ACTIVE";

  if (existingUser) {
    const currentRoles = existingUser.roles || [existingUser.role];
    if (!currentRoles.includes(UserRole.TENANT)) {
      currentRoles.push(UserRole.TENANT);
      existingUser.roles = currentRoles;
    }
    
    // Check if the user has non-tenant roles
    const hasNonTenantRole = currentRoles.some(r => r !== UserRole.TENANT);
    if (!hasNonTenantRole) {
      existingUser.role = UserRole.TENANT;
      existingUser.is_active = isActive;
      if (tenantName) existingUser.name = tenantName;
    }
    
    await userRepo.save(existingUser);
  } else {
    const defaultPasswordHash = await bcrypt.hash("88888888", 10);
    const newUser = userRepo.create({
      name: tenantName,
      phone: tenantPhone,
      password_hash: defaultPasswordHash,
      role: UserRole.TENANT,
      roles: [UserRole.TENANT],
      is_active: isActive,
    });
    await userRepo.save(newUser);
  }
}

async function handleTenantPhoneChange(oldPhone: string | undefined | null, newPhone: string | undefined | null, name: string, status: string) {
  if (oldPhone && oldPhone !== newPhone) {
    await deactivateTenantUser(oldPhone);
  }
  if (newPhone) {
    if (status === "ACTIVE") {
      await syncTenantUser(name, newPhone, "ACTIVE");
    } else {
      await deactivateTenantUser(newPhone);
    }
  }
}

async function deactivateTenantUser(phone: string) {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepoInstance = AppDataSource.getRepository(Tenant);
  const activeTenants = await tenantRepoInstance.find({
    where: { phone, status: "ACTIVE" }
  });

  if (activeTenants.length === 0) {
    const tenantUser = await userRepo.findOneBy({ phone });
    if (tenantUser) {
      const roles = tenantUser.roles || [];
      const onlyTenant = roles.length === 0 || (roles.length === 1 && roles.includes(UserRole.TENANT));
      if (onlyTenant) {
        tenantUser.is_active = false;
        await userRepo.save(tenantUser);
      }
    }
  }
}

async function activateTenantUser(phone: string, name: string) {
  await syncTenantUser(name, phone, "ACTIVE");
}

router.use(authenticate);

// ─── Tenants ───

// GET /api/rooms/:roomId/tenants
router.get("/:roomId/tenants", async (req: AuthRequest, res: Response) => {
  try {
    const roomId = req.params.roomId as string;
    const room = await roomRepo().findOne({
      where: { id: roomId },
      relations: ["floor"]
    });
    if (!room) { res.status(404).json({ message: "Không tìm thấy phòng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền xem khách thuê phòng này" });
      return;
    }

    const tenants = await tenantRepo().find({
      where: { room_id: roomId },
      order: { is_representative: "DESC", name: "ASC" },
    });
    res.json(tenants);
  } catch (error) {
    console.error("List tenants error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/rooms/:roomId/tenants
router.post("/:roomId/tenants", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const room_id = req.params.roomId as string;
    const { name, cccd, phone, is_representative } = req.body;
    if (!name) { res.status(400).json({ message: "Tên là bắt buộc" }); return; }

    const room = await roomRepo().findOne({
      where: { id: room_id },
      relations: ["floor"]
    });
    if (!room) { res.status(404).json({ message: "Không tìm thấy phòng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền thêm khách thuê phòng này" });
      return;
    }

    // If marking as representative, unset any existing one
    if (is_representative) {
      await tenantRepo().update({ room_id, is_representative: true }, { is_representative: false });
    }

    // Find if there is an active contract in this room to automatically link the tenant
    const activeContract = await contractRepo().findOne({
      where: { room_id, status: ContractStatus.ACTIVE },
      order: { created_at: "DESC" }
    });

    const tenant = tenantRepo().create({
      room_id,
      contract_id: activeContract ? activeContract.id : undefined,
      name,
      cccd: cccd || undefined,
      phone: phone || undefined,
      is_representative: is_representative || false,
      status: "ACTIVE",
    });

    const saved = await tenantRepo().save(tenant);
    if (saved.phone) {
      await syncTenantUser(saved.name, saved.phone, saved.status);
    }
    res.status(201).json(saved);
  } catch (error) {
    console.error("Create tenant error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// PATCH /api/rooms/:roomId/tenants/:tenantId
router.patch("/:roomId/tenants/:tenantId", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await tenantRepo().findOneBy({ id: req.params.tenantId as string });
    if (!tenant) { res.status(404).json({ message: "Không tìm thấy khách thuê" }); return; }

    const room = await roomRepo().findOne({
      where: { id: tenant.room_id },
      relations: ["floor"]
    });
    if (!room) { res.status(404).json({ message: "Không tìm thấy phòng tương ứng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền cập nhật khách thuê này" });
      return;
    }

    const { name, cccd, phone, is_representative, status } = req.body;
    const oldPhone = tenant.phone;
    const oldName = tenant.name;
    const oldStatus = tenant.status;

    if (name !== undefined) tenant.name = name;
    if (cccd !== undefined) tenant.cccd = cccd;
    if (phone !== undefined) tenant.phone = phone;
    if (status !== undefined) tenant.status = status;

    if (is_representative === true) {
      await tenantRepo().update({ room_id: tenant.room_id, is_representative: true }, { is_representative: false });
      tenant.is_representative = true;
    } else if (is_representative === false) {
      tenant.is_representative = false;
    }

    const saved = await tenantRepo().save(tenant);

    if (phone !== undefined || name !== undefined || status !== undefined) {
      const finalPhone = phone !== undefined ? phone : oldPhone;
      const finalName = name !== undefined ? name : oldName;
      const finalStatus = status !== undefined ? status : oldStatus;
      await handleTenantPhoneChange(oldPhone, finalPhone, finalName, finalStatus);
    }

    res.json(saved);
  } catch (error) {
    console.error("Update tenant error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// ─── Contracts ───

// GET /api/rooms/:roomId/contracts
router.get("/:roomId/contracts", async (req: AuthRequest, res: Response) => {
  try {
    const roomId = req.params.roomId as string;
    const room = await roomRepo().findOne({
      where: { id: roomId },
      relations: ["floor"]
    });
    if (!room) { res.status(404).json({ message: "Không tìm thấy phòng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền xem hợp đồng phòng này" });
      return;
    }

    const contracts = await contractRepo().find({
      where: { room_id: roomId },
      relations: ["representative_tenant"],
      order: { created_at: "DESC" },
    });
    res.json(contracts);
  } catch (error) {
    console.error("List contracts error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/rooms/:roomId/contracts
router.post("/:roomId/contracts", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const room_id = req.params.roomId as string;
    const { representative_tenant_id, start_date, end_date, rent_amount, deposit_amount, document_photos, tenant_ids, auto_renew_months } = req.body;

    if (!representative_tenant_id || !start_date || !end_date) {
      res.status(400).json({ message: "representative_tenant_id, start_date, end_date là bắt buộc" });
      return;
    }

    const room = await roomRepo().findOne({
      where: { id: room_id },
      relations: ["floor"]
    });
    if (!room) { res.status(404).json({ message: "Không tìm thấy phòng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền tạo hợp đồng cho phòng này" });
      return;
    }

    // Check for existing active/new contracts for this room
    const existingContract = await contractRepo().findOne({
      where: [
        { room_id, status: ContractStatus.ACTIVE },
        { room_id, status: ContractStatus.NEW }
      ]
    });

    if (existingContract) {
      res.status(400).json({ message: "Phòng này hiện đang có hợp đồng hoạt động. Vui lòng thanh lý hoặc hủy hợp đồng cũ trước khi tạo hợp đồng mới." });
      return;
    }

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const startDateObj = new Date(start_date);
    startDateObj.setHours(0, 0, 0, 0);

    const isFutureContract = startDateObj > todayDate;
    const initialContractStatus = isFutureContract ? ContractStatus.NEW : ContractStatus.ACTIVE;

    const contract = contractRepo().create({
      room_id,
      representative_tenant_id,
      start_date,
      end_date,
      rent_amount: rent_amount || 0,
      deposit_amount: deposit_amount || 0,
      status: initialContractStatus,
      document_photos: document_photos || [],
      auto_renew_months: auto_renew_months || null,
    });

    const saved = await contractRepo().save(contract);

    // Link provided tenant_ids and the representative tenant to this contract
    const idsToAssign = Array.isArray(tenant_ids) ? [...tenant_ids] : [];
    if (!idsToAssign.includes(representative_tenant_id)) {
      idsToAssign.push(representative_tenant_id);
    }
    if (idsToAssign.length > 0) {
      await AppDataSource.createQueryBuilder()
        .update(Tenant)
        .set({ 
          contract_id: saved.id,
          room_id: room_id,
          status: "ACTIVE"
        })
        .where("id IN (:...ids)", { ids: idsToAssign })
        .execute();

      const assignedTenants = await tenantRepo().find({ where: { id: In(idsToAssign) } });
      for (const t of assignedTenants) {
        if (t.phone) {
          await activateTenantUser(t.phone, t.name);
        }
      }
    }

    // Update room status
    const newRoomStatus = isFutureContract ? RoomStatus.DEPOSITED : RoomStatus.OCCUPIED;
    await roomRepo().update(room_id, { status: newRoomStatus });

    res.status(201).json(saved);
  } catch (error) {
    console.error("Create contract error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// PATCH /api/rooms/:roomId/contracts/:contractId
router.patch("/:roomId/contracts/:contractId", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const contract = await contractRepo().findOne({
      where: { id: req.params.contractId as string },
      relations: ["room", "room.floor"]
    });
    if (!contract) { res.status(404).json({ message: "Không tìm thấy hợp đồng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, contract.room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(contract.room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền sửa hợp đồng này" });
      return;
    }

    const { status, end_date, rent_amount, deposit_amount, document_photos, tenant_ids, auto_renew_months } = req.body;
    if (status !== undefined) contract.status = status;
    if (end_date !== undefined) contract.end_date = end_date;
    if (rent_amount !== undefined) contract.rent_amount = rent_amount;
    if (deposit_amount !== undefined) contract.deposit_amount = deposit_amount;
    if (document_photos !== undefined) contract.document_photos = document_photos;
    if (auto_renew_months !== undefined) contract.auto_renew_months = auto_renew_months;

    await contractRepo().save(contract);

    // Update tenants if tenant_ids provided
    if (tenant_ids !== undefined && Array.isArray(tenant_ids)) {
      const newIds = [...tenant_ids];
      if (!newIds.includes(contract.representative_tenant_id)) {
        newIds.push(contract.representative_tenant_id);
      }

      const tenantsToDeactivate = await tenantRepo()
        .createQueryBuilder("t")
        .where("t.contract_id = :contractId", { contractId: contract.id })
        .andWhere("t.id NOT IN (:...newIds)", { newIds })
        .getMany();

      // 1. Mark tenants who were in this contract but not in the new list as INACTIVE
      await AppDataSource.createQueryBuilder()
        .update(Tenant)
        .set({ status: "INACTIVE", contract_id: null as any })
        .where("contract_id = :contractId", { contractId: contract.id })
        .andWhere("id NOT IN (:...newIds)", { newIds })
        .execute();

      // 2. Mark new tenants as ACTIVE and link to this contract/room
      await AppDataSource.createQueryBuilder()
        .update(Tenant)
        .set({ 
          status: "ACTIVE", 
          contract_id: contract.id,
          room_id: contract.room_id
        })
        .where("id IN (:...newIds)", { newIds })
        .execute();

      const tenantsToActivate = await tenantRepo().find({ where: { id: In(newIds) } });

      for (const t of tenantsToDeactivate) {
        if (t.phone) {
          await deactivateTenantUser(t.phone);
        }
      }
      for (const t of tenantsToActivate) {
        if (t.phone) {
          await activateTenantUser(t.phone, t.name);
        }
      }
    }

    // If terminated, set room to EMPTY
    if (status === ContractStatus.TERMINATED || status === ContractStatus.EXPIRED) {
      await roomRepo().update(contract.room_id, { status: RoomStatus.EMPTY });
      const tenantsToDeactivate = await tenantRepo().find({ where: { contract_id: contract.id } });
      await tenantRepo().update({ contract_id: contract.id }, { status: "INACTIVE" });
      for (const t of tenantsToDeactivate) {
        if (t.phone) {
          await deactivateTenantUser(t.phone);
        }
      }
    }

    res.json(contract);
  } catch (error) {
    console.error("Update contract error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/rooms/:roomId/contracts/:contractId/terminate
router.post("/:roomId/contracts/:contractId/terminate", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const contract = await contractRepo().findOne({
      where: { id: req.params.contractId as string },
      relations: ["room", "room.floor"]
    });
    if (!contract) { res.status(404).json({ message: "Không tìm thấy hợp đồng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, contract.room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(contract.room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền thanh lý hợp đồng này" });
      return;
    }

    // Deposit settlement: (Deposit) - (LastMonthRent) - (DamageFees) = Refund
    const { last_month_rent, damage_fees, notes, actual_end_date } = req.body;
    const refund = contract.deposit_amount - (last_month_rent || 0) - (damage_fees || 0);

    contract.status = ContractStatus.TERMINATED;
    contract.refunded_deposit = refund;
    contract.actual_end_date = actual_end_date || new Date().toISOString().split("T")[0];
    if (notes) contract.notes = notes;
    await contractRepo().save(contract);

    // Set room to EMPTY
    await roomRepo().update(contract.room_id, { status: RoomStatus.EMPTY });

    // Deactivate ONLY tenants in this specific contract
    const tenantsToDeactivate = await tenantRepo().find({ where: { contract_id: contract.id } });
    await tenantRepo().update({ contract_id: contract.id }, { status: "INACTIVE" });
    for (const t of tenantsToDeactivate) {
      if (t.phone) {
        await deactivateTenantUser(t.phone);
      }
    }

    res.json({
      message: "Đã thanh lý hợp đồng",
      deposit: Number(contract.deposit_amount),
      last_month_rent: last_month_rent || 0,
      damage_fees: damage_fees || 0,
      refund_amount: refund,
      notes,
    });
  } catch (error) {
    console.error("Terminate contract error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/rooms/:roomId/contracts/:contractId/cancel
router.post("/:roomId/contracts/:contractId/cancel", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const contract = await contractRepo().findOne({
      where: { id: req.params.contractId as string },
      relations: ["room", "room.floor"]
    });
    if (!contract) { res.status(404).json({ message: "Không tìm thấy hợp đồng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, contract.room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(contract.room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền hủy hợp đồng này" });
      return;
    }

    const { notes } = req.body;

    contract.status = ContractStatus.CANCELLED;
    if (notes) contract.notes = notes;
    await contractRepo().save(contract);

    // Set room to EMPTY
    await roomRepo().update(contract.room_id, { status: RoomStatus.EMPTY });

    // Deactivate ONLY tenants in this specific contract
    const tenantsToDeactivate = await tenantRepo().find({ where: { contract_id: contract.id } });
    await tenantRepo().update({ contract_id: contract.id }, { status: "INACTIVE" });
    for (const t of tenantsToDeactivate) {
      if (t.phone) {
        await deactivateTenantUser(t.phone);
      }
    }

    res.json({ message: "Đã hủy hợp đồng" });
  } catch (error) {
    console.error("Cancel contract error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/rooms/:roomId/contracts/:contractId/reactivate
router.post("/:roomId/contracts/:contractId/reactivate", requireRole(UserRole.ADMIN, UserRole.OWNER, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const contract = await contractRepo().findOne({
      where: { id: req.params.contractId as string },
      relations: ["room", "room.floor"]
    });
    if (!contract) { res.status(404).json({ message: "Không tìm thấy hợp đồng" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, contract.room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(contract.room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền khôi phục hợp đồng này" });
      return;
    }

    if (contract.status !== ContractStatus.CANCELLED) {
      res.status(400).json({ message: "Chỉ được phép kích hoạt lại hợp đồng bị Hủy giữa chừng (CANCELLED)." });
      return;
    }

    const room = await roomRepo().findOneBy({ id: contract.room_id });
    if (room && room.status === RoomStatus.OCCUPIED) {
      res.status(400).json({ message: "Phòng đang thuê (hợp đồng khác đang hiệu lực). Không thể kích hoạt." });
      return;
    }

    const today = new Date();
    const endDate = new Date(contract.end_date);
    
    // Reset time components for accurate comparison
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < today) {
      res.status(400).json({ message: "Hợp đồng này đã hết hạn. Vui lòng tạo hợp đồng mới." });
      return;
    }

    contract.status = ContractStatus.ACTIVE;
    await contractRepo().save(contract);

    // Set room to OCCUPIED
    await roomRepo().update(contract.room_id, { status: RoomStatus.OCCUPIED });

    // Reactivate ONLY tenants in this specific contract
    await tenantRepo().update({ contract_id: contract.id }, { status: "ACTIVE" });
    const tenantsToReactivate = await tenantRepo().find({ where: { contract_id: contract.id } });
    for (const t of tenantsToReactivate) {
      if (t.phone) {
        await activateTenantUser(t.phone, t.name);
      }
    }

    res.json({ message: "Đã kích hoạt lại hợp đồng", status: contract.status });
  } catch (error) {
    console.error("Reactivate contract error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// GET /api/contracts/expiring — contracts expiring within 30 days
router.get("/contracts/expiring", async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!);
    if (allowedBuildingIds !== null && allowedBuildingIds.length === 0) {
      res.json([]);
      return;
    }

    const qb = contractRepo()
      .createQueryBuilder("c")
      .leftJoinAndSelect("c.representative_tenant", "t")
      .leftJoinAndSelect("c.room", "r")
      .leftJoinAndSelect("r.floor", "f")
      .where("c.status = :status", { status: ContractStatus.ACTIVE })
      .andWhere("c.end_date <= :limit", { limit: thirtyDays.toISOString().split("T")[0] })
      .andWhere("c.end_date >= :today", { today: today.toISOString().split("T")[0] });

    if (allowedBuildingIds !== null) {
      qb.andWhere("f.building_id IN (:...allowedBuildingIds)", { allowedBuildingIds });
    }

    qb.orderBy("c.end_date", "ASC");

    const contracts = await qb.getMany();
    res.json(contracts);
  } catch (error) {
    console.error("Expiring contracts error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/upload — upload image to ImgBB
router.post("/upload", async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) { res.status(400).json({ message: "image (base64) là bắt buộc" }); return; }
    const url = await uploadToImgBB(image);
    res.json({ url });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: "Lỗi upload ảnh" });
  }
});

export default router;

export const globalTenantRouter = Router();
globalTenantRouter.use(authenticate);

globalTenantRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { building_id, room_id, status, search } = req.query;

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, building_id as string | undefined);

    if (allowedBuildingIds !== null && allowedBuildingIds.length === 0) {
      return res.json([]);
    }

    const qb = tenantRepo().createQueryBuilder("t")
      .leftJoinAndSelect("t.room", "r")
      .leftJoinAndSelect("r.floor", "f")
      .leftJoinAndSelect("f.building", "b");

    if (allowedBuildingIds !== null) {
      qb.andWhere("f.building_id IN (:...allowedBuildingIds)", { allowedBuildingIds });
    }

    if (room_id) {
      qb.andWhere("t.room_id = :room_id", { room_id });
    }

    if (status) {
      qb.andWhere("t.status = :status", { status });
    }

    if (search) {
      qb.andWhere("(LOWER(t.name) LIKE LOWER(:search) OR t.phone LIKE :search OR t.cccd LIKE :search)", { search: `%${search}%` });
    }

    qb.orderBy("t.created_at", "DESC");

    const tenants = await qb.getMany();
    
    res.json(tenants);
  } catch (error) {
    console.error("List global tenants error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

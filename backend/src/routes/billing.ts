import { Router, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../data-source";
import { ConsumptionRecord } from "../entities/ConsumptionRecord";
import { Invoice, InvoiceStatus } from "../entities/Invoice";
import { InvoiceItem } from "../entities/InvoiceItem";
import { Room } from "../entities/Room";
import { authenticate, requireRole, AuthRequest } from "../middlewares/auth";
import { UserRole } from "../entities/User";
import { generateInvoicesForBuilding } from "../services/invoiceCalculator";
import { getAccessibleBuildingIds } from "../utils/access";

const router = Router();
const consumptionRepo = () => AppDataSource.getRepository(ConsumptionRecord);
const invoiceRepo = () => AppDataSource.getRepository(Invoice);
const itemRepo = () => AppDataSource.getRepository(InvoiceItem);

router.use(authenticate);

// ─── Consumption Records ───

// GET /api/buildings/:buildingId/consumption?period=2026-05
router.get("/buildings/:buildingId/consumption", async (req: AuthRequest, res: Response) => {
  try {
    const buildingId = req.params.buildingId as string;
    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, buildingId);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(buildingId)) {
      res.status(403).json({ message: "Không có quyền xem chỉ số điện nước tòa nhà này" });
      return;
    }

    const qb = consumptionRepo()
      .createQueryBuilder("cr")
      .leftJoinAndSelect("cr.room", "room")
      .leftJoinAndSelect("room.floor", "floor")
      .where("floor.building_id = :buildingId", { buildingId });

    if (req.query.period) {
      qb.andWhere("cr.billing_period = :period", { period: req.query.period });
    }

    qb.orderBy("cr.billing_period", "DESC").addOrderBy("room.name", "ASC");

    const records = await qb.getMany();
    res.json(records);
  } catch (error) {
    console.error("List building consumption error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// GET /api/rooms/:roomId/consumption?period=2026-05
router.get("/rooms/:roomId/consumption", async (req: AuthRequest, res: Response) => {
  try {
    const roomId = req.params.roomId as string;
    const room = await AppDataSource.getRepository(Room).findOne({
      where: { id: roomId },
      relations: ["floor"]
    });
    if (!room) {
      res.status(404).json({ message: "Không tìm thấy phòng" });
      return;
    }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền xem chỉ số điện nước phòng này" });
      return;
    }

    const where: Record<string, string> = { room_id: roomId };
    if (req.query.period) where.billing_period = req.query.period as string;

    const records = await consumptionRepo().find({
      where,
      order: { billing_period: "DESC", created_at: "DESC" },
    });
    res.json(records);
  } catch (error) {
    console.error("List consumption error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// POST /api/rooms/:roomId/consumption
router.post("/rooms/:roomId/consumption", requireRole(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const room_id = req.params.roomId as string;
    const { fee_id, billing_period, start_index, end_index } = req.body;

    if (!fee_id || !billing_period || start_index === undefined || end_index === undefined) {
      res.status(400).json({ message: "fee_id, billing_period, start_index, end_index là bắt buộc" });
      return;
    }

    const room = await AppDataSource.getRepository(Room).findOne({
      where: { id: room_id },
      relations: ["floor"]
    });
    if (!room) {
      res.status(404).json({ message: "Không tìm thấy phòng" });
      return;
    }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền cập nhật chỉ số điện nước phòng này" });
      return;
    }

    const usage = end_index - start_index;
    if (usage < 0) {
      res.status(400).json({ message: "Chỉ số cuối phải lớn hơn chỉ số đầu" });
      return;
    }

    // Upsert: update if exists, create if not
    const records = await consumptionRepo().find({
      where: { room_id, fee_id, billing_period }
    });

    let record = records.length > 0 ? records[0] : null;

    if (record) {
      record.start_index = start_index;
      record.end_index = end_index;
      record.usage_amount = usage;
      record.recorded_by = req.user!.id;
      
      // Cleanup duplicates if they exist
      if (records.length > 1) {
        await consumptionRepo().remove(records.slice(1));
      }
    } else {
      record = consumptionRepo().create({
        room_id,
        fee_id,
        billing_period,
        start_index,
        end_index,
        usage_amount: usage,
        recorded_by: req.user!.id,
      });
    }

    const saved = await consumptionRepo().save(record);
    res.status(201).json(saved);
  } catch (error: any) {
    require('fs').appendFileSync('error.log', new Date().toISOString() + ': ' + (error.stack || error) + '\n');
    console.error("Create consumption error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// ─── Invoice Generation ───

// POST /api/buildings/:buildingId/generate-invoices
router.post("/buildings/:buildingId/generate-invoices", requireRole(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const buildingId = req.params.buildingId as string;
    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, buildingId);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(buildingId)) {
      res.status(403).json({ message: "Không có quyền tạo hóa đơn cho tòa nhà này" });
      return;
    }

    const { billing_period } = req.body;
    if (!billing_period) {
      res.status(400).json({ message: "billing_period (YYYY-MM) là bắt buộc" });
      return;
    }

    const results = await generateInvoicesForBuilding(
      buildingId,
      billing_period
    );

    res.status(201).json({
      message: `Đã tạo ${results.length} hóa đơn`,
      count: results.length,
      invoices: results.map((r) => ({
        invoice_id: r.invoice.id,
        room_id: r.invoice.room_id,
        total: r.invoice.total_amount,
        items_count: r.items.length,
      })),
    });
  } catch (error) {
    console.error("Generate invoices error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// ─── Invoice Management ───

// GET /api/invoices?room_id=&period=&status=
router.get("/invoices", async (req: AuthRequest, res: Response) => {
  try {
    const { room_id, building_id, period, status } = req.query;
    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, building_id as string | undefined);
    
    if (allowedBuildingIds !== null && allowedBuildingIds.length === 0) {
      res.json([]);
      return;
    }

    const qb = invoiceRepo()
      .createQueryBuilder("inv")
      .leftJoinAndSelect("inv.room", "room")
      .leftJoinAndSelect("room.floor", "floor")
      .leftJoinAndSelect("inv.contract", "contract");

    if (allowedBuildingIds !== null) {
      qb.andWhere("floor.building_id IN (:...allowedBuildingIds)", { allowedBuildingIds });
    } else if (building_id) {
      qb.andWhere("floor.building_id = :buildingId", { buildingId: building_id });
    }

    if (room_id) qb.andWhere("inv.room_id = :roomId", { roomId: room_id });
    if (period) qb.andWhere("inv.billing_period = :period", { period });
    if (status) qb.andWhere("inv.status = :status", { status });

    qb.orderBy("inv.billing_period", "DESC").addOrderBy("inv.created_at", "DESC");

    const invoices = await qb.getMany();
    res.json(invoices);
  } catch (error) {
    console.error("List invoices error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// GET /api/invoices/:id — with items
router.get("/invoices/:id", async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await invoiceRepo().findOne({
      where: { id: req.params.id as string },
      relations: ["room", "room.floor", "room.floor.building", "room.floor.building.owner", "contract"],
    });
    if (!invoice) { res.status(404).json({ message: "Không tìm thấy hóa đơn" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, invoice.room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(invoice.room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền xem hóa đơn này" });
      return;
    }

    const items = await itemRepo().find({
      where: { invoice_id: invoice.id },
      order: { amount: "DESC" },
    });

    res.json({ ...invoice, items });
  } catch (error) {
    console.error("Get invoice error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

// PATCH /api/invoices/:id — update invoice data
router.patch("/invoices/:id", requireRole(UserRole.ADMIN, UserRole.MANAGER), async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await invoiceRepo().findOne({
      where: { id: req.params.id as string },
      relations: ["room", "room.floor"]
    });
    if (!invoice) { res.status(404).json({ message: "Không tìm thấy hóa đơn" }); return; }

    const allowedBuildingIds = await getAccessibleBuildingIds(req.user!, invoice.room.floor.building_id);
    if (allowedBuildingIds !== null && !allowedBuildingIds.includes(invoice.room.floor.building_id)) {
      res.status(403).json({ message: "Không có quyền sửa hóa đơn này" });
      return;
    }

    const { paid_amount, status, rent_amount, rolling_balance, items } = req.body;

    if (rent_amount !== undefined) invoice.rent_amount = rent_amount;
    if (rolling_balance !== undefined) invoice.rolling_balance = rolling_balance;

    if (items !== undefined && Array.isArray(items)) {
      // Replace items
      await itemRepo().delete({ invoice_id: invoice.id });
      const newItems = items.map((item: any) => itemRepo().create({
        invoice_id: invoice.id,
        fee_id: item.fee_id || null,
        description: item.description,
        amount: item.amount
      }));
      await itemRepo().save(newItems);
      
      // Calculate new total
      const itemsTotal = newItems.reduce((sum, item) => sum + Number(item.amount), 0);
      invoice.total_amount = Number(invoice.rent_amount) + Number(invoice.rolling_balance) + itemsTotal;
    }

    if (paid_amount !== undefined) {
      invoice.paid_amount = paid_amount;
    }

    // Auto-determine status from amount if status not explicitly provided
    if (status !== undefined) {
      invoice.status = status;
    } else {
      const total = Number(invoice.total_amount);
      const paid = Number(invoice.paid_amount);
      if (paid >= total) {
        invoice.status = InvoiceStatus.PAID;
      } else if (paid > 0) {
        invoice.status = InvoiceStatus.PARTIAL;
      } else {
        invoice.status = InvoiceStatus.UNPAID;
      }
    }

    await invoiceRepo().save(invoice);
    
    // Return updated invoice with items
    const updated = await invoiceRepo().findOne({
      where: { id: invoice.id },
      relations: ["items"]
    });
    res.json(updated);
  } catch (error) {
    console.error("Update invoice error:", error);
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
});

export default router;

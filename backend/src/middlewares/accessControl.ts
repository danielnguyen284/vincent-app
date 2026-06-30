import { Response, NextFunction } from "express";
import { AuthRequest, hasRole } from "./auth";
import { UserRole } from "../entities/User";
import { Ticket } from "../entities/Ticket";
import { AppDataSource } from "../data-source";
import { Building } from "../entities/Building";
import { BuildingManager } from "../entities/BuildingManager";
import { BuildingOwner } from "../entities/BuildingOwner";
import { getAccessibleBuildingIds } from "../utils/access";

async function ownsBuilding(buildingId: string, userId: string) {
  const buildingRepo = AppDataSource.getRepository(Building);
  const ownerRepo = AppDataSource.getRepository(BuildingOwner);
  const building = await buildingRepo.findOneBy({ id: buildingId });
  const ownership = await ownerRepo.findOneBy({ building_id: buildingId, owner_id: userId });
  return !!building && (!!ownership || building.owner_id === userId);
}

async function managesBuilding(buildingId: string, userId: string) {
  const managerRepo = AppDataSource.getRepository(BuildingManager);
  const assignment = await managerRepo.findOneBy({ building_id: buildingId, manager_id: userId });
  return !!assignment;
}

export const requireBuildingAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const buildingId = req.params.id || req.body.building_id || req.query.building_id;
  if (req.user.appBuildingFilter && buildingId) {
    const allowedIds = await getAccessibleBuildingIds(req.user);
    if (allowedIds && !allowedIds.includes(buildingId as string)) {
      res.status(403).json({ message: "Toa nha khong thuoc pham vi cua ung dung nay" });
      return;
    }
  }

  if (hasRole(req.user, UserRole.ADMIN)) return next();
  if (!buildingId) return res.status(400).json({ message: "Thieu ID toa nha" });

  const id = buildingId as string;
  if (hasRole(req.user, UserRole.OWNER) && await ownsBuilding(id, req.user.id)) return next();
  if (hasRole(req.user, UserRole.MANAGER) && await managesBuilding(id, req.user.id)) return next();

  res.status(403).json({ message: "Khong co quyen" });
};

export const requireTicketAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const ticketId = req.params.id;
  if (!ticketId) return res.status(400).json({ message: "Thieu ID phieu" });

  const ticketRepo = AppDataSource.getRepository(Ticket);
  const ticket = await ticketRepo.findOne({
    where: { id: ticketId as string },
    relations: ["building"]
  });

  if (!ticket) return res.status(404).json({ message: "Khong tim thay phieu" });

  if (req.user.appBuildingFilter) {
    const allowedIds = await getAccessibleBuildingIds(req.user);
    if (allowedIds && !allowedIds.includes(ticket.building_id)) {
      res.status(403).json({ message: "Phieu khong thuoc pham vi cua ung dung nay" });
      return;
    }
  }

  if (hasRole(req.user, UserRole.ADMIN)) return next();

  if (hasRole(req.user, UserRole.MANAGER) && await managesBuilding(ticket.building_id, req.user.id)) return next();
  if (hasRole(req.user, UserRole.TECHNICIAN) && ticket.assigned_tech_id === req.user.id) return next();
  if (hasRole(req.user, UserRole.OWNER) && await ownsBuilding(ticket.building_id, req.user.id)) {
    const visibleStatuses = ["WAITING_APPROVAL", "COMPLETED"];
    if (visibleStatuses.includes(ticket.status)) return next();
  }

  res.status(403).json({ message: "Ban khong co quyen truy cap phieu nay" });
};

export const requireExpenseAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const expenseId = req.params.expenseId;
  if (!expenseId) return res.status(400).json({ message: "Thieu ID khoan chi" });

  const expenseRepo = AppDataSource.getRepository("TicketExpense");
  const expense = await expenseRepo.findOne({
    where: { id: expenseId as string },
    relations: ["ticket", "ticket.building"]
  }) as any;

  if (!expense) return res.status(404).json({ message: "Khong tim thay khoan chi" });

  const ticket = expense.ticket;

  if (req.user.appBuildingFilter) {
    const allowedIds = await getAccessibleBuildingIds(req.user);
    if (allowedIds && !allowedIds.includes(ticket.building_id)) {
      res.status(403).json({ message: "Khoan chi khong thuoc pham vi cua ung dung nay" });
      return;
    }
  }

  if (hasRole(req.user, UserRole.ADMIN)) return next();

  if (hasRole(req.user, UserRole.MANAGER) && await managesBuilding(ticket.building_id, req.user.id)) return next();
  if (hasRole(req.user, UserRole.TECHNICIAN) && ticket.assigned_tech_id === req.user.id) return next();
  if (hasRole(req.user, UserRole.OWNER) && await ownsBuilding(ticket.building_id, req.user.id)) {
    const visibleStatuses = ["WAITING_APPROVAL", "COMPLETED"];
    if (visibleStatuses.includes(ticket.status)) return next();
  }

  res.status(403).json({ message: "Ban khong co quyen truy cap khoan chi nay" });
};

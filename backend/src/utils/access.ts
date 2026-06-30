import { In } from "typeorm";
import { AppDataSource } from "../data-source";
import { Building } from "../entities/Building";
import { BuildingManager } from "../entities/BuildingManager";
import { BuildingOwner } from "../entities/BuildingOwner";
import { UserRole } from "../entities/User";
import { AuthPayload, hasRole } from "../middlewares/auth";

export async function getAccessibleBuildingIds(user: AuthPayload, queryBuildingId?: string): Promise<string[] | null> {
  let baseAccessibleIds: string[] | null = null;

  if (hasRole(user, UserRole.ADMIN)) {
    baseAccessibleIds = null;
  } else {
    const ids = new Set<string>();
    const buildingRepo = AppDataSource.getRepository(Building);

    if (hasRole(user, UserRole.OWNER)) {
      const ownerRepo = AppDataSource.getRepository(BuildingOwner);
      const ownerships = await ownerRepo.find({ where: { owner_id: user.id } });
      ownerships.forEach((ownership) => ids.add(ownership.building_id));
      const legacyBuildings = await buildingRepo.find({ where: { owner_id: user.id }, select: ["id"] });
      legacyBuildings.forEach((building) => ids.add(building.id));
    }

    if (hasRole(user, UserRole.MANAGER)) {
      const managerRepo = AppDataSource.getRepository(BuildingManager);
      const assignments = await managerRepo.find({ where: { manager_id: user.id } });
      assignments.forEach((assignment) => ids.add(assignment.building_id));
    }

    baseAccessibleIds = Array.from(ids);
  }

function isUuid(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Intersect with appBuildingFilter if present
  let filteredIds: string[] | null = baseAccessibleIds;
  if (user.appBuildingFilter && user.appBuildingFilter.length > 0) {
    const uuids = user.appBuildingFilter.filter(x => isUuid(x));
    const names = user.appBuildingFilter.filter(x => !isUuid(x)).map(n => n.toLowerCase().trim());

    let resolvedIdsFromName: string[] = [];
    if (names.length > 0) {
      const buildingRepo = AppDataSource.getRepository(Building);
      const allBuildings = await buildingRepo.find({ select: ["id", "name"] });
      for (const b of allBuildings) {
        const bNameLower = b.name.toLowerCase().trim();
        const matches = names.some(n => {
          if (bNameLower === n) return true;
          try {
            const regex = new RegExp(`\\b${n}\\b`, 'i');
            return regex.test(bNameLower);
          } catch (e) {
            // Fallback in case of invalid regex chars
            return bNameLower.includes(n);
          }
        });
        if (matches) {
          resolvedIdsFromName.push(b.id);
        }
      }
    }

    const allAllowedIds = [...uuids, ...resolvedIdsFromName];

    if (baseAccessibleIds === null) {
      filteredIds = allAllowedIds;
    } else {
      filteredIds = baseAccessibleIds.filter(id => allAllowedIds.includes(id));
    }
  }

  if (queryBuildingId) {
    if (filteredIds === null) {
      return [queryBuildingId];
    }
    return filteredIds.includes(queryBuildingId) ? [queryBuildingId] : [];
  }

  return filteredIds;
}

export async function ownsBuilding(buildingId: string, userId: string) {
  const buildingRepo = AppDataSource.getRepository(Building);
  const ownerRepo = AppDataSource.getRepository(BuildingOwner);
  const building = await buildingRepo.findOneBy({ id: buildingId });
  const ownership = await ownerRepo.findOneBy({ building_id: buildingId, owner_id: userId });
  return !!building && (!!ownership || building.owner_id === userId);
}

export async function managesBuilding(buildingId: string, userId: string) {
  const managerRepo = AppDataSource.getRepository(BuildingManager);
  const assignment = await managerRepo.findOneBy({ building_id: buildingId, manager_id: userId });
  return !!assignment;
}

export function buildingWhereByIds(ids: string[] | null) {
  if (ids === null) return {};
  if (ids.length === 0) return { id: In(["__no_access__"]) };
  return { id: In(ids) };
}

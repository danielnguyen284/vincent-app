import bcrypt from "bcryptjs";
import { AppDataSource } from "../data-source";
import { User, UserRole } from "../entities/User";
import { Tenant } from "../entities/Tenant";

export async function backfillTenantAccounts() {
  const userRepo = AppDataSource.getRepository(User);
  const tenantRepo = AppDataSource.getRepository(Tenant);

  // Fetch all tenants
  const tenants = await tenantRepo.find();
  if (tenants.length === 0) {
    console.log("No tenants found in database to backfill.");
    return;
  }

  let createdCount = 0;
  let updatedCount = 0;
  const defaultPasswordHash = await bcrypt.hash("88888888", 10);

  // Group tenants by phone to resolve overall active status correctly
  const phoneToTenants: Record<string, Tenant[]> = {};
  for (const t of tenants) {
    if (!t.phone) continue;
    const phone = t.phone.trim();
    if (!phone) continue;
    if (!phoneToTenants[phone]) {
      phoneToTenants[phone] = [];
    }
    phoneToTenants[phone].push(t);
  }

  console.log(`Checking accounts for ${Object.keys(phoneToTenants).length} unique tenant phone numbers...`);

  for (const [phone, tenantList] of Object.entries(phoneToTenants)) {
    // Active if at least one tenant record is active
    const isActive = tenantList.some(t => t.status === "ACTIVE");
    // Pick name from active record or default to first record
    const representativeTenant = tenantList.find(t => t.status === "ACTIVE") || tenantList[0];

    const existingUser = await userRepo.findOneBy({ phone });

    if (!existingUser) {
      // Create new tenant account
      const newUser = userRepo.create({
        name: representativeTenant.name,
        phone,
        password_hash: defaultPasswordHash,
        role: UserRole.TENANT,
        roles: [UserRole.TENANT],
        is_active: isActive,
      });
      await userRepo.save(newUser);
      createdCount++;
    } else {
      // Ensure existing user has tenant role
      let needsSave = false;
      const currentRoles = existingUser.roles || [existingUser.role];
      if (!currentRoles.includes(UserRole.TENANT)) {
        existingUser.roles = [...currentRoles, UserRole.TENANT];
        needsSave = true;
      }
      
      const hasNonTenantRole = currentRoles.some(r => r !== UserRole.TENANT);
      if (!hasNonTenantRole) {
        if (existingUser.role !== UserRole.TENANT) {
          existingUser.role = UserRole.TENANT;
          needsSave = true;
        }
        if (existingUser.is_active !== isActive) {
          existingUser.is_active = isActive;
          needsSave = true;
        }
      }

      if (needsSave) {
        await userRepo.save(existingUser);
        updatedCount++;
      }
    }
  }

  console.log(`Tenant accounts backfill complete: Created ${createdCount}, Updated ${updatedCount}.`);

  // Reactivate all non-tenant accounts (Admin, Owner, Manager, Technician)
  try {
    const allUsers = await userRepo.find();
    let reactivatedCount = 0;
    for (const u of allUsers) {
      const roles = u.roles || [u.role];
      const hasNonTenantRole = roles.some(r => r !== UserRole.TENANT);
      if (hasNonTenantRole && !u.is_active) {
        u.is_active = true;
        await userRepo.save(u);
        reactivatedCount++;
        console.log(`Reactivated system user account: ${u.name} (${u.phone})`);
      }
    }
    if (reactivatedCount > 0) {
      console.log(`Reactivated ${reactivatedCount} system user accounts.`);
    }
  } catch (reactivateError) {
    console.error("Failed to reactivate system user accounts:", reactivateError);
  }
}

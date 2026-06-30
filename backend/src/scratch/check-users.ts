import { AppDataSource } from "../data-source";
import { User, UserRole } from "../entities/User";

async function main() {
  await AppDataSource.initialize();
  console.log("Database initialized.");

  const userRepo = AppDataSource.getRepository(User);
  const users = await userRepo.find();

  console.log("\n--- Current Users in Database ---");
  for (const u of users) {
    console.log(`ID: ${u.id} | Name: ${u.name} | Phone: ${u.phone} | Role: ${u.role} | Roles: ${JSON.stringify(u.roles)} | Active: ${u.is_active}`);
  }

  console.log("\nChecking for any overridden accounts...");
  let fixedCount = 0;
  for (const u of users) {
    const roles = u.roles || [u.role];
    
    // If the user has non-tenant roles (like ADMIN, OWNER, MANAGER, TECHNICIAN)
    // but their primary role was overridden to TENANT, or they were deactivated
    const hasAdmin = roles.includes(UserRole.ADMIN);
    const hasOwner = roles.includes(UserRole.OWNER);
    const hasManager = roles.includes(UserRole.MANAGER);
    const hasTech = roles.includes(UserRole.TECHNICIAN);

    const isSystemUser = hasAdmin || hasOwner || hasManager || hasTech;
    
    if (isSystemUser) {
      let needsFix = false;
      
      // 1. If their primary role got set to TENANT, restore it to the first non-tenant role
      if (u.role === UserRole.TENANT) {
        const primaryNonTenant = roles.find(r => r !== UserRole.TENANT);
        if (primaryNonTenant) {
          u.role = primaryNonTenant;
          needsFix = true;
          console.log(`-> Restoring primary role of ${u.name} (${u.phone}) to ${primaryNonTenant}`);
        }
      }

      // 2. If they got deactivated, reactivate them
      if (!u.is_active) {
        u.is_active = true;
        needsFix = true;
        console.log(`-> Reactivating system user ${u.name} (${u.phone})`);
      }

      if (needsFix) {
        await userRepo.save(u);
        fixedCount++;
      }
    }
  }

  console.log(`\nFixed ${fixedCount} accounts.`);
  await AppDataSource.destroy();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

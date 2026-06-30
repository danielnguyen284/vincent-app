import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { normalizeRoles, primaryRole } from "../middlewares/auth";

export async function backfillUserRoles() {
  const userRepo = AppDataSource.getRepository(User);
  const users = await userRepo.find();
  const usersToUpdate = users.filter((user) => normalizeRoles(user).length === 0 || !user.roles?.length);

  for (const user of usersToUpdate) {
    const roles = normalizeRoles(user);
    if (roles.length === 0) continue;
    user.roles = roles;
    user.role = primaryRole(user)!;
    await userRepo.save(user);
  }

  if (usersToUpdate.length > 0) {
    console.log(`Backfilled roles for ${usersToUpdate.length} users.`);
  }
}

import { AppDataSource } from "../data-source";
import { Building } from "../entities/Building";

async function main() {
  await AppDataSource.initialize();
  console.log("Database initialized.");

  const buildingRepo = AppDataSource.getRepository(Building);
  const buildings = await buildingRepo.find({ select: ["id", "name"] });

  console.log("\n--- Current Buildings in Database ---");
  for (const b of buildings) {
    console.log(`ID: ${b.id} | Name: ${b.name}`);
  }

  await AppDataSource.destroy();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

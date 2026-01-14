import { seedSoccerActivities } from "./activities-soccer";
import { seedBasketballActivities } from "./activities-basketball";
import { seedPracticeTemplates } from "./practice-templates";

async function seedPracticePlanning() {
  console.log("=== Seeding Practice Planning Content ===\n");

  // Seed activities
  await seedSoccerActivities();
  console.log("");

  await seedBasketballActivities();
  console.log("");

  // Seed templates
  await seedPracticeTemplates();
  console.log("");

  console.log("=== Practice Planning Content Seeded ===");
}

seedPracticePlanning()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

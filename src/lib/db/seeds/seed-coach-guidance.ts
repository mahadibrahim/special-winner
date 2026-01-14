import { seedCoachPrompts } from "./coach-prompts";
import { seedCoachResources } from "./coach-resources";

async function main() {
  console.log("Starting coach guidance seeding...\n");

  try {
    await seedCoachPrompts();
    console.log("");
    await seedCoachResources();
    console.log("\n✅ Coach guidance seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding coach guidance:", error);
    process.exit(1);
  }
}

main();

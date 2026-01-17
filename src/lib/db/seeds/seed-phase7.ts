/**
 * Phase 7: Content Expansion Seed Runner
 *
 * Seeds all Phase 7 content:
 * - Expanded activities (soccer + basketball)
 * - Session plan library
 * - Skills and assessment rubrics
 * - Coach training modules
 */

import { seedSoccerActivities } from "./activities-soccer";
import { seedBasketballActivities } from "./activities-basketball";
import { seedSessionPlanLibrary } from "./session-plan-library";
import { seedSkillsAndRubrics } from "./skills-and-rubrics";
import { seedCoachTrainingModules } from "./coach-training-modules";

async function seedPhase7() {
  console.log("=== Phase 7: Content Expansion ===\n");

  // Seed expanded activities
  console.log("--- Activities ---");
  await seedSoccerActivities();
  console.log("");

  await seedBasketballActivities();
  console.log("");

  // Seed session plan library
  console.log("--- Session Plan Library ---");
  await seedSessionPlanLibrary();
  console.log("");

  // Seed skills and rubrics
  console.log("--- Skills & Assessment Rubrics ---");
  await seedSkillsAndRubrics();
  console.log("");

  // Seed coach training modules
  console.log("--- Coach Training Modules ---");
  await seedCoachTrainingModules();
  console.log("");

  console.log("=== Phase 7 Content Seeded Successfully ===");
}

seedPhase7()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

/**
 * Curriculum V2 - Comprehensive Coach Guides Master Seeder
 *
 * This file seeds all the comprehensive, print-ready coaching content
 * including activities with full coaching scripts, troubleshooting guides,
 * skill connections, age adaptations, and parent communication templates.
 *
 * Content created:
 * - Soccer Fundamentals Activities (5 activities)
 * - Soccer Skill Building Activities (4 activities)
 * - Basketball Fundamentals Activities (5 activities)
 * - Soccer Session Plans (4 complete session plans)
 * - Soccer Skills (13 skills with comprehensive assessment guides)
 *
 * Run with: npx tsx src/lib/db/seeds/curriculum-v2/index.ts
 */

import { seedSoccerFundamentalsActivities } from "./soccer-fundamentals-activities";
import { seedSoccerFundamentalsActivities2 } from "./soccer-fundamentals-activities-2";
import { seedSoccerSkillBuildingActivities } from "./soccer-skill-building-activities";
import { seedBasketballFundamentalsActivities } from "./basketball-fundamentals-activities";
import { seedSoccerSessionPlans } from "./soccer-session-plans";
import { seedSoccerSkills } from "./soccer-skills";

async function seedAllCurriculumV2() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  CURRICULUM V2 - Comprehensive Coach Guides");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("");

  try {
    // Soccer Activities - Fundamentals (Ages 6-8)
    console.log("📚 Seeding Soccer Fundamentals Activities...");
    await seedSoccerFundamentalsActivities();
    await seedSoccerFundamentalsActivities2();
    console.log("   ✓ Soccer Fundamentals Activities complete\n");

    // Soccer Activities - Skill Building (Ages 9-11)
    console.log("📚 Seeding Soccer Skill Building Activities...");
    await seedSoccerSkillBuildingActivities();
    console.log("   ✓ Soccer Skill Building Activities complete\n");

    // Basketball Activities - Fundamentals (Ages 6-8)
    console.log("🏀 Seeding Basketball Fundamentals Activities...");
    await seedBasketballFundamentalsActivities();
    console.log("   ✓ Basketball Fundamentals Activities complete\n");

    // Soccer Session Plans
    console.log("📋 Seeding Soccer Session Plans...");
    await seedSoccerSessionPlans();
    console.log("   ✓ Soccer Session Plans complete\n");

    // Soccer Skills with Comprehensive Assessments
    console.log("⚽ Seeding Soccer Skills with Assessment Guides...");
    await seedSoccerSkills();
    console.log("   ✓ Soccer Skills complete\n");

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("  ✅ ALL CURRICULUM V2 CONTENT SEEDED SUCCESSFULLY");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("");
    console.log("Content Summary:");
    console.log("  • 5 Soccer Fundamentals Activities (ages 6-8)");
    console.log("  • 4 Soccer Skill Building Activities (ages 9-11)");
    console.log("  • 5 Basketball Fundamentals Activities (ages 6-8)");
    console.log("  • 4 Soccer Session Plans (complete practice guides)");
    console.log("  • 13 Soccer Skills with comprehensive assessment guides");
    console.log("");
    console.log("Each item includes:");
    console.log("  ✓ Quick reference for experienced coaches");
    console.log("  ✓ Complete minute-by-minute coaching scripts");
    console.log("  ✓ Troubleshooting guides (game balance, player behavior)");
    console.log("  ✓ Skill connections with 5-level indicators");
    console.log("  ✓ Age adaptations (6-8, 9-11, 12-14)");
    console.log("  ✓ Parent communication templates");
    console.log("  ✓ Safety and inclusion considerations");
    console.log("  ✓ Coach reflection prompts");
    console.log("");
  } catch (error) {
    console.error("❌ Error seeding curriculum:", error);
    throw error;
  }
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedAllCurriculumV2()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { seedAllCurriculumV2 };

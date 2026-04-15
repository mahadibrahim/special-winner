/**
 * Identify skills that need comprehensive guide upgrades
 */

import { getDb } from "../../index";
import { skills } from "../../schema";
import { eq } from "drizzle-orm";

async function main() {
  const allSkills = await getDb().query.skills.findMany({
    where: eq(skills.active, true),
    with: { sport: true, domain: true, stage: true },
  });

  // Filter to those without comprehensive guides
  const needsUpgrade = allSkills.filter((s) => !s.comprehensiveGuide);

  // Group by sport
  const bySport: Record<string, typeof needsUpgrade> = {};
  for (const skill of needsUpgrade) {
    const sport = skill.sport?.name || "Unknown";
    if (!bySport[sport]) bySport[sport] = [];
    bySport[sport].push(skill);
  }

  console.log("Skills needing comprehensive guides:");
  for (const [sport, sportSkills] of Object.entries(bySport)) {
    console.log(`\n${sport} (${sportSkills.length} skills):`);
    for (const s of sportSkills) {
      console.log(`  - ${s.name} (${s.domain?.name}, ${s.stage?.name})`);
    }
  }

  console.log(`\nTotal: ${needsUpgrade.length} skills need upgrading`);

  // Output as JSON for processing
  console.log("\n--- JSON DATA ---");
  console.log(JSON.stringify(
    Object.entries(bySport).map(([sport, skills]) => ({
      sport,
      count: skills.length,
      skills: skills.map(s => ({
        id: s.id,
        name: s.name,
        domain: s.domain?.name,
        stage: s.stage?.name,
      })),
    })),
    null,
    2
  ));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

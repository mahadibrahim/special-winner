/**
 * Curriculum Day-0 seed — populates the curriculum surface with real content.
 *
 * Mirrors the admin-deep-dive-day0-seed pattern: idempotent (every insert
 * is guarded by ON CONFLICT DO NOTHING or a WHERE NOT EXISTS), env-gated,
 * and scoped to the production org so it can't leak into other tenants.
 *
 * What it seeds:
 *   1. Reference tables (skill_domains + development_stages) — these are
 *      platform-wide and only need to exist once. CI deliberately does NOT
 *      run them; prod gets them via this script.
 *   2. ~12 soccer skills covering the four domains across early stages.
 *   3. ~6 starter activities (warm-ups, technical drills, scrimmage).
 *   4. 1 starter practice template referencing a subset of those.
 *
 * Required env: DATABASE_URL pointing at the target DB.
 * Required opt-in: ALLOW_CURRICULUM_SEED=yes
 * Required for prod target: ALLOW_PROD_AUDIT=yes (same flag as the other
 *   audit/purge scripts).
 *
 * Usage:
 *   ALLOW_CURRICULUM_SEED=yes ALLOW_PROD_AUDIT=yes npx tsx scripts/curriculum-day0-seed.ts
 */

import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const KEEP_ORG_ID = "caf5eac4-28ed-459a-8bdd-04c572d052d3";

function guardEnv(): void {
  if (process.env.ALLOW_CURRICULUM_SEED !== "yes") {
    console.error("REFUSED: set ALLOW_CURRICULUM_SEED=yes to run this seed.");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("REFUSED: DATABASE_URL is unset.");
    process.exit(2);
  }
  const looksProd = /rlwy\.net|railway\.app/.test(process.env.DATABASE_URL);
  if (looksProd && process.env.ALLOW_PROD_AUDIT !== "yes") {
    console.error(
      "REFUSED: DATABASE_URL looks like Railway prod. Set ALLOW_PROD_AUDIT=yes to confirm.",
    );
    process.exit(2);
  }
}

function rowsOf(r: unknown): any[] {
  if (Array.isArray(r)) return r as any[];
  if (r && typeof r === "object" && Array.isArray((r as any).rows))
    return (r as any).rows;
  return [];
}

function q(s: string): string {
  return s.replace(/'/g, "''");
}

// jsonb columns expect a JSON-encoded array, not a Postgres array literal.
// Use this for: coaching_tips, common_mistakes, equipment_needed.
function jsonArr(items: string[]): string {
  return `'${q(JSON.stringify(items))}'::jsonb`;
}

type DB = ReturnType<typeof getDb>;

async function verifyBaseline(db: DB): Promise<{ soccerId: string }> {
  const orgRows = rowsOf(
    await db.execute(
      sql.raw(`SELECT id, name FROM organizations WHERE id = '${KEEP_ORG_ID}'`),
    ),
  );
  if (orgRows.length !== 1) {
    throw new Error(`Expected org ${KEEP_ORG_ID}; found ${orgRows.length}`);
  }
  console.log(`  ✓ Org: ${orgRows[0].name}`);

  const sportRows = rowsOf(
    await db.execute(
      sql.raw(
        `SELECT id FROM sports WHERE organization_id = '${KEEP_ORG_ID}' AND lower(name) = 'soccer'`,
      ),
    ),
  );
  if (sportRows.length !== 1) {
    throw new Error(
      "Soccer sport not found on the org — run admin-deep-dive-day0-seed.ts first.",
    );
  }
  console.log(`  ✓ Soccer sport: ${sportRows[0].id}`);
  return { soccerId: sportRows[0].id };
}

async function seedSkillDomains(db: DB): Promise<Map<string, string>> {
  const rows = [
    {
      name: "technical",
      displayName: "Technical",
      description: "Sport-specific techniques and motor skills.",
      color: "#3b82f6",
      icon: "target",
      sort_order: 1,
    },
    {
      name: "tactical",
      displayName: "Tactical",
      description: "Decision-making, game understanding, strategic awareness.",
      color: "#8b5cf6",
      icon: "brain",
      sort_order: 2,
    },
    {
      name: "physical",
      displayName: "Physical",
      description: "Speed, agility, strength, endurance, coordination.",
      color: "#22c55e",
      icon: "zap",
      sort_order: 3,
    },
    {
      name: "psychological",
      displayName: "Psychological",
      description: "Confidence, focus, resilience, teamwork.",
      color: "#f59e0b",
      icon: "heart",
      sort_order: 4,
    },
  ];
  for (const r of rows) {
    await db.execute(
      sql.raw(
        `INSERT INTO skill_domains (name, display_name, description, color, icon, sort_order)
         VALUES ('${r.name}', '${q(r.displayName)}', '${q(r.description)}', '${r.color}', '${r.icon}', ${r.sort_order})
         ON CONFLICT (name) DO NOTHING`,
      ),
    );
  }
  const all = rowsOf(await db.execute(sql.raw(`SELECT id, name FROM skill_domains`)));
  const map = new Map<string, string>(all.map((d: any) => [d.name, d.id]));
  console.log(`  ✓ Skill domains: ${map.size}`);
  return map;
}

async function seedDevelopmentStages(db: DB): Promise<Map<string, string>> {
  const rows = [
    {
      name: "Discovery",
      slug: "discovery",
      age_min: 3,
      age_max: 5,
      description: "Introduction to sports through play.",
      sort_order: 1,
    },
    {
      name: "Fundamentals",
      slug: "fundamentals",
      age_min: 6,
      age_max: 8,
      description: "Movement literacy + sport-specific basics through games.",
      sort_order: 2,
    },
    {
      name: "Foundation",
      slug: "foundation",
      age_min: 9,
      age_max: 12,
      description: "Skill refinement + introduction to team tactics.",
      sort_order: 3,
    },
    {
      name: "Growth",
      slug: "growth",
      age_min: 13,
      age_max: 16,
      description: "Position-specific training + competitive structures.",
      sort_order: 4,
    },
  ];
  for (const r of rows) {
    await db.execute(
      sql.raw(
        `INSERT INTO development_stages (name, slug, age_min, age_max, description, sort_order)
         VALUES ('${q(r.name)}', '${r.slug}', ${r.age_min}, ${r.age_max}, '${q(r.description)}', ${r.sort_order})
         ON CONFLICT (slug) DO NOTHING`,
      ),
    );
  }
  const all = rowsOf(
    await db.execute(sql.raw(`SELECT id, slug FROM development_stages`)),
  );
  const map = new Map<string, string>(all.map((s: any) => [s.slug, s.id]));
  console.log(`  ✓ Development stages: ${map.size}`);
  return map;
}

type SkillRow = {
  slug: string;
  name: string;
  domain: "technical" | "tactical" | "physical" | "psychological";
  stage: "fundamentals" | "foundation" | "growth";
  description: string;
  introductionAge: number;
  coachingTips: string[];
  commonMistakes: string[];
  sortOrder: number;
};

const SOCCER_SKILLS: SkillRow[] = [
  // Technical (5)
  {
    slug: "soccer-passing-short",
    name: "Short Passing",
    domain: "technical",
    stage: "fundamentals",
    description: "Push-pass with the inside of the foot over 5–10 yards.",
    introductionAge: 6,
    coachingTips: ["Plant foot beside the ball", "Lock the ankle", "Follow through toward the target"],
    commonMistakes: ["Toe-poking the ball", "Eyes on the ball instead of the target"],
    sortOrder: 1,
  },
  {
    slug: "soccer-receiving-first-touch",
    name: "First Touch (Receiving)",
    domain: "technical",
    stage: "fundamentals",
    description: "Cushioning the ball into space with one controlled touch.",
    introductionAge: 7,
    coachingTips: ["Open your body before the ball arrives", "Soft surface — relax the foot"],
    commonMistakes: ["Stopping the ball dead at your feet", "Receiving with the wrong foot"],
    sortOrder: 2,
  },
  {
    slug: "soccer-dribbling-close-control",
    name: "Close-Control Dribbling",
    domain: "technical",
    stage: "fundamentals",
    description: "Keeping the ball within a yard while changing direction.",
    introductionAge: 6,
    coachingTips: ["Many small touches, not one big one", "Use both feet"],
    commonMistakes: ["Looking only at the ball", "One foot dominance"],
    sortOrder: 3,
  },
  {
    slug: "soccer-shooting-instep",
    name: "Shooting (Instep Drive)",
    domain: "technical",
    stage: "foundation",
    description: "Striking with the laces to drive the ball low and hard.",
    introductionAge: 9,
    coachingTips: ["Plant foot pointed at target", "Keep your head down through contact"],
    commonMistakes: ["Leaning back so the ball goes up", "Toes pointed up at contact"],
    sortOrder: 4,
  },
  {
    slug: "soccer-heading-basic",
    name: "Basic Heading",
    domain: "technical",
    stage: "growth",
    description: "Contact with the forehead, body as a spring (age-gated per USSF).",
    introductionAge: 12,
    coachingTips: ["Eyes open, mouth closed", "Attack the ball — don't let it hit you"],
    commonMistakes: ["Closing eyes", "Heading with the top of the head"],
    sortOrder: 5,
  },
  // Tactical (3)
  {
    slug: "soccer-finding-space",
    name: "Finding Space",
    domain: "tactical",
    stage: "fundamentals",
    description: "Moving away from defenders to receive a pass.",
    introductionAge: 7,
    coachingTips: ["Scan before the ball arrives", "Move into the gap, not the cluster"],
    commonMistakes: ["Standing next to the ball-carrier", "Calling for the ball without moving"],
    sortOrder: 10,
  },
  {
    slug: "soccer-1v1-defending",
    name: "1v1 Defending",
    domain: "tactical",
    stage: "foundation",
    description: "Pressuring an attacker while staying goal-side.",
    introductionAge: 9,
    coachingTips: ["Approach low and slow", "Show them to their weak foot"],
    commonMistakes: ["Diving in", "Losing balance"],
    sortOrder: 11,
  },
  {
    slug: "soccer-team-shape",
    name: "Maintaining Team Shape",
    domain: "tactical",
    stage: "growth",
    description: "Holding position relative to teammates in attack and defense.",
    introductionAge: 12,
    coachingTips: ["Compact when defending, spread when attacking", "Watch the ball, your mark, and your teammates"],
    commonMistakes: ["Ball-chasing", "Drifting out of position after a turnover"],
    sortOrder: 12,
  },
  // Physical (2)
  {
    slug: "soccer-agility-cutting",
    name: "Cutting & Change of Direction",
    domain: "physical",
    stage: "fundamentals",
    description: "Decelerating and accelerating in a new direction.",
    introductionAge: 7,
    coachingTips: ["Plant the outside foot", "Drop the hips before cutting"],
    commonMistakes: ["Standing tall through the cut", "Crossing feet"],
    sortOrder: 20,
  },
  {
    slug: "soccer-endurance-recovery",
    name: "Recovery Sprints",
    domain: "physical",
    stage: "foundation",
    description: "Repeated high-intensity efforts with short recovery.",
    introductionAge: 10,
    coachingTips: ["Recover by jogging, not walking", "Manage your breathing"],
    commonMistakes: ["Walking during recovery", "Hands on knees between sprints"],
    sortOrder: 21,
  },
  // Psychological (2)
  {
    slug: "soccer-coachability",
    name: "Coachability",
    domain: "psychological",
    stage: "fundamentals",
    description: "Listening, accepting feedback, applying it on the next rep.",
    introductionAge: 6,
    coachingTips: ["Praise the response, not the result", "Name what you saw before the cue"],
    commonMistakes: ["Repeating the same mistake without adjustment"],
    sortOrder: 30,
  },
  {
    slug: "soccer-composure-under-pressure",
    name: "Composure Under Pressure",
    domain: "psychological",
    stage: "growth",
    description: "Slowing down decisions even when opponents are closing in.",
    introductionAge: 12,
    coachingTips: ["Take an extra second to look up", "Trust your first touch"],
    commonMistakes: ["Panic-kicking the ball", "Hiding from the ball after a mistake"],
    sortOrder: 31,
  },
];

async function seedSkills(
  db: DB,
  soccerId: string,
  domains: Map<string, string>,
  stages: Map<string, string>,
): Promise<void> {
  let inserted = 0;
  for (const s of SOCCER_SKILLS) {
    const domainId = domains.get(s.domain);
    const stageId = stages.get(s.stage);
    if (!domainId || !stageId) {
      throw new Error(
        `Missing reference: domain=${s.domain} (${domainId}) stage=${s.stage} (${stageId})`,
      );
    }
    const res = await db.execute(
      sql.raw(
        `INSERT INTO skills (
           organization_id, sport_id, domain_id, stage_id, name, slug, description,
           introduction_age, assessment_method, coaching_tips, common_mistakes,
           sort_order, active
         )
         SELECT '${KEEP_ORG_ID}', '${soccerId}', '${domainId}', '${stageId}',
                '${q(s.name)}', '${s.slug}', '${q(s.description)}',
                ${s.introductionAge}, 'observation',
                ${jsonArr(s.coachingTips)}, ${jsonArr(s.commonMistakes)},
                ${s.sortOrder}, true
         WHERE NOT EXISTS (
           SELECT 1 FROM skills WHERE sport_id = '${soccerId}' AND slug = '${s.slug}'
         )`,
      ),
    );
    inserted += rowsOf(res).length;
  }
  console.log(`  ✓ Skills (new this run): ${inserted}`);
}

type ActivityRow = {
  slug: string;
  name: string;
  activityType: "warmup" | "technical" | "tactical" | "game" | "scrimmage" | "conditioning" | "cooldown" | "fun";
  difficulty: "beginner" | "intermediate" | "advanced";
  minPlayers: number;
  maxPlayers: number | null;
  durationMinutes: number;
  description: string;
  howToPlay: string;
  setupInstructions: string;
  equipment: string[];
};

const SOCCER_ACTIVITIES: ActivityRow[] = [
  {
    slug: "soccer-rondo-3v1",
    name: "3v1 Rondo",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 5,
    durationMinutes: 10,
    description: "Classic possession-keeping square. Builds first-touch + scanning.",
    howToPlay:
      "3 players form a triangle ~5y apart. 1 defender in the middle. The triangle keeps the ball away with first-touch passes. Defender swaps in on each interception or after 5 consecutive passes.",
    setupInstructions: "4 cones in a 5y x 5y square. Rotate defender every 60 seconds even if uncaught.",
    equipment: ["4 cones", "1 ball"],
  },
  {
    slug: "soccer-passing-ladder",
    name: "Passing Ladder",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 12,
    description: "Two lines facing each other; players pass, follow their pass, join the back of the other line.",
    howToPlay:
      "Cone A and Cone B set 10y apart with a line of players at each. Player at A passes to player at B and jogs to the back of B's line. Player at B receives, controls, passes back to next player at A, jogs to A's line. Build up to two-touch then one-touch.",
    setupInstructions: "Two cones, 10y apart. Split group evenly behind each.",
    equipment: ["2 cones", "1 ball"],
  },
  {
    slug: "soccer-dribbling-gates",
    name: "Dribbling Through Gates",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 10,
    description: "Players dribble through as many cone gates as they can in 60 seconds.",
    howToPlay:
      "Scatter 8-12 cone gates (2 cones, 1m apart) in a 20x20y area. Every player has a ball. On the whistle, dribble through as many different gates as possible in 60s. Count out loud after each gate to encourage head-up dribbling.",
    setupInstructions: "20x20y area, 8-12 cone gates randomly placed.",
    equipment: ["16-24 cones", "1 ball per player"],
  },
  {
    slug: "soccer-1v1-channel",
    name: "1v1 to End Line",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 12,
    description: "Attacker tries to dribble across an end line; defender tries to win the ball.",
    howToPlay:
      "10y wide x 15y long channel. Attacker starts on one end line with the ball; defender starts on the other. On the whistle, defender steps forward and attacker tries to dribble across the defender's line. After 30s or possession lost, rotate.",
    setupInstructions: "4 cones forming a 10x15y channel. Pair up; line waiting at each end.",
    equipment: ["4 cones", "1 ball per pair"],
  },
  {
    slug: "soccer-small-sided-4v4",
    name: "4v4 to Goals",
    activityType: "scrimmage",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 8,
    durationMinutes: 15,
    description: "Game-realistic small-sided match with two small goals.",
    howToPlay:
      "Two teams of 4 on a 25y x 35y field with 2y wide goals at each end. Standard rules. Goalkeepers optional — at this size, prefer no keepers so every player attacks/defends. Restart with a kick-in (not throw-in).",
    setupInstructions: "Mark a 25x35y field with cones. Place 2 cone-width goals on each end line.",
    equipment: ["8 cones (corners + goals)", "Bibs (one color per team)", "1 ball"],
  },
  {
    slug: "soccer-cooldown-stretch-circle",
    name: "Stretch Circle Cooldown",
    activityType: "cooldown",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 5,
    description: "Round-robin stretches with each player leading one.",
    howToPlay:
      "Players form a circle. Coach starts with a quad stretch (10s hold each leg). Pick the next player to lead a different stretch (hamstring, calf, shoulder, etc.). Quiet enough to ask each player one thing about today's session.",
    setupInstructions: "No setup. Anywhere on the field.",
    equipment: [],
  },
];

async function seedActivities(db: DB, soccerId: string): Promise<void> {
  let inserted = 0;
  for (const a of SOCCER_ACTIVITIES) {
    const res = await db.execute(
      sql.raw(
        `INSERT INTO activities (
           organization_id, sport_id, name, slug, description, activity_type,
           difficulty, min_players, max_players, duration_minutes,
           setup_instructions, how_to_play, equipment_needed,
           indoor_suitable, active, featured
         )
         SELECT '${KEEP_ORG_ID}', '${soccerId}',
                '${q(a.name)}', '${a.slug}', '${q(a.description)}', '${a.activityType}',
                '${a.difficulty}', ${a.minPlayers},
                ${a.maxPlayers === null ? "NULL" : a.maxPlayers},
                ${a.durationMinutes},
                '${q(a.setupInstructions)}', '${q(a.howToPlay)}', ${jsonArr(a.equipment)},
                true, true, false
         WHERE NOT EXISTS (
           SELECT 1 FROM activities WHERE sport_id = '${soccerId}' AND slug = '${a.slug}'
         )`,
      ),
    );
    inserted += rowsOf(res).length;
  }
  console.log(`  ✓ Activities (new this run): ${inserted}`);
}

async function seedTemplates(
  db: DB,
  soccerId: string,
  stages: Map<string, string>,
): Promise<void> {
  const foundationStageId = stages.get("foundation");
  if (!foundationStageId) throw new Error("Missing 'foundation' stage");

  const structure = JSON.stringify([
    { name: "Warm-up — Rondo", type: "warmup", durationMinutes: 10 },
    { name: "Technical — Passing Ladder", type: "technical", durationMinutes: 12 },
    { name: "Game — 1v1 to End Line", type: "tactical", durationMinutes: 12 },
    { name: "Scrimmage — 4v4 to Goals", type: "scrimmage", durationMinutes: 15 },
    { name: "Cooldown — Stretch Circle", type: "cooldown", durationMinutes: 5 },
  ]);

  const res = await db.execute(
    sql.raw(
      `INSERT INTO practice_templates (
         organization_id, sport_id, stage_id, name, description,
         total_duration_minutes, structure, equipment_needed, is_default, active
       )
       SELECT '${KEEP_ORG_ID}', '${soccerId}', '${foundationStageId}',
              'Foundation — 54-Minute Practice', 'Starter template for U9-U12 sessions covering technical, tactical, and game-realistic blocks.',
              54, '${q(structure)}'::jsonb,
              ${jsonArr(["8 cones", "Bibs", "Balls (one per player ideally)"])},
              true, true
       WHERE NOT EXISTS (
         SELECT 1 FROM practice_templates
         WHERE sport_id = '${soccerId}'
           AND name = 'Foundation — 54-Minute Practice'
       )`,
    ),
  );
  console.log(`  ✓ Practice templates (new this run): ${rowsOf(res).length}`);
}

async function main(): Promise<void> {
  guardEnv();
  const db = getDb();

  console.log("Verifying baseline…");
  const { soccerId } = await verifyBaseline(db);

  console.log("Seeding reference tables…");
  const domains = await seedSkillDomains(db);
  const stages = await seedDevelopmentStages(db);

  console.log("Seeding soccer skills…");
  await seedSkills(db, soccerId, domains, stages);

  console.log("Seeding soccer activities…");
  await seedActivities(db, soccerId);

  console.log("Seeding starter practice template…");
  await seedTemplates(db, soccerId, stages);

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

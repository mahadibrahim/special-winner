/**
 * Day-0 launch seed — creates real Aspire Sports launch data.
 *
 * Idempotent: re-running is safe. Each insert checks WHERE NOT EXISTS
 * first.
 *
 * Per CLAUDE.md "Database write surface": one-off seed scripts live on a
 * feature branch and are deleted after the PR merges. The launch baseline
 * this creates stays in prod as real data.
 *
 * Required env: DATABASE_URL pointing at the target DB.
 * Required opt-in: ALLOW_DAY0_SEED=yes
 * Required for prod target: ALLOW_PROD_AUDIT=yes (the same flag used by
 *   audit/purge scripts to confirm "yes, I mean Railway prod").
 *
 * Usage:
 *   ALLOW_DAY0_SEED=yes ALLOW_PROD_AUDIT=yes npx tsx scripts/admin-deep-dive-day0-seed.ts
 */

import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const KEEP_ORG_ID = "caf5eac4-28ed-459a-8bdd-04c572d052d3";
const DOWNTOWN_LOCATION_ID = "18762139-8a91-4c12-bbfa-346c61e1106c";
const WORTHINGTON_LOCATION_ID = "2a1693fe-3adc-41f5-90e2-03278decbd6d";

function guardEnv(): void {
  if (process.env.ALLOW_DAY0_SEED !== "yes") {
    console.error("REFUSED: set ALLOW_DAY0_SEED=yes to run this seed.");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("REFUSED: DATABASE_URL is unset.");
    process.exit(2);
  }
  // Prod guard mirrors the audit + purge scripts.
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

// Helper for safely interpolating a string into raw SQL by escaping single quotes.
function q(s: string): string {
  return s.replace(/'/g, "''");
}

type DB = ReturnType<typeof getDb>;

async function verifyBaseline(db: DB): Promise<void> {
  const orgRows = rowsOf(
    await db.execute(
      sql.raw(`SELECT id, name FROM organizations WHERE id = '${KEEP_ORG_ID}'`),
    ),
  );
  if (orgRows.length !== 1) {
    throw new Error(`Expected org ${KEEP_ORG_ID}; found ${orgRows.length}`);
  }
  console.log(`  ✓ Org: ${orgRows[0].name}`);

  const locRows = rowsOf(
    await db.execute(
      sql.raw(
        `SELECT id, name FROM locations WHERE id IN ('${DOWNTOWN_LOCATION_ID}','${WORTHINGTON_LOCATION_ID}')`,
      ),
    ),
  );
  if (locRows.length !== 2) {
    throw new Error(`Expected 2 keep-locations; found ${locRows.length}`);
  }
  for (const l of locRows) console.log(`  ✓ Location: ${l.name}`);
}

async function seedSport(db: DB): Promise<void> {
  const existing = rowsOf(
    await db.execute(
      sql.raw(
        `SELECT id FROM sports WHERE organization_id = '${KEEP_ORG_ID}' AND lower(name) = 'soccer'`,
      ),
    ),
  );
  if (existing.length > 0) {
    console.log(`  ✓ Soccer sport already exists (id=${existing[0].id})`);
    return;
  }
  await db.execute(
    sql.raw(
      `INSERT INTO sports (organization_id, name, slug, active)
       VALUES ('${KEEP_ORG_ID}', 'Soccer', 'soccer', true)`,
    ),
  );
  console.log(`  ✓ Created Soccer sport`);
}

async function seedVenues(db: DB): Promise<void> {
  const venues = [
    { location_id: DOWNTOWN_LOCATION_ID, name: "Field 1", indoor: false, field_count: 1 },
    { location_id: WORTHINGTON_LOCATION_ID, name: "Field A", indoor: true, field_count: 1 },
    { location_id: WORTHINGTON_LOCATION_ID, name: "Field B", indoor: true, field_count: 1 },
    { location_id: WORTHINGTON_LOCATION_ID, name: "Field C", indoor: false, field_count: 1 },
  ];
  for (const v of venues) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(
          `SELECT id FROM venues WHERE location_id = '${v.location_id}' AND name = '${q(v.name)}'`,
        ),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Venue ${v.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(
        `INSERT INTO venues (location_id, name, indoor, field_count, active, owned)
         VALUES ('${v.location_id}', '${q(v.name)}', ${v.indoor}, ${v.field_count}, true, false)`,
      ),
    );
    console.log(`  ✓ Created venue ${v.name}`);
  }
}

async function seedAgeGroups(db: DB): Promise<void> {
  const ageGroups = [
    { name: "Adult Co-Ed", min_age: 18, max_age: 99 },
    { name: "Adult Open", min_age: 18, max_age: 99 },
    { name: "Adult Over 30", min_age: 30, max_age: 99 },
    { name: "U6", min_age: 4, max_age: 6 },
    { name: "U8", min_age: 6, max_age: 8 },
    { name: "U10", min_age: 8, max_age: 10 },
    { name: "U12", min_age: 10, max_age: 12 },
    { name: "HS", min_age: 14, max_age: 18 },
  ];
  for (const ag of ageGroups) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(
          `SELECT id FROM age_groups WHERE organization_id = '${KEEP_ORG_ID}' AND name = '${q(ag.name)}'`,
        ),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Age group ${ag.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(
        `INSERT INTO age_groups (organization_id, name, min_age, max_age)
         VALUES ('${KEEP_ORG_ID}', '${q(ag.name)}', ${ag.min_age}, ${ag.max_age})`,
      ),
    );
    console.log(`  ✓ Created age group ${ag.name}`);
  }
}

async function seedPrograms(db: DB): Promise<void> {
  const soccerId = rowsOf(
    await db.execute(
      sql.raw(
        `SELECT id FROM sports WHERE organization_id = '${KEEP_ORG_ID}' AND lower(name) = 'soccer' LIMIT 1`,
      ),
    ),
  )[0]?.id;
  if (!soccerId) throw new Error("Soccer sport missing — run seedSport first");

  const programs = [
    {
      name: "Adult Co-Ed 7v7 League",
      slug: "adult-coed-7v7",
      location_id: DOWNTOWN_LOCATION_ID,
      sport_id: soccerId,
      program_type: "league",
    },
    {
      name: "Founders' Tournament",
      slug: "founders-tournament",
      location_id: DOWNTOWN_LOCATION_ID,
      sport_id: soccerId,
      program_type: "tournament",
    },
    {
      name: "Adult Open Pickup",
      slug: "adult-open-pickup",
      location_id: DOWNTOWN_LOCATION_ID,
      sport_id: soccerId,
      program_type: "clinic",
    },
    {
      name: "Worthington Youth Soccer",
      slug: "worthington-youth-soccer",
      location_id: WORTHINGTON_LOCATION_ID,
      sport_id: soccerId,
      program_type: "league",
    },
  ];

  for (const p of programs) {
    const existing = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM programs WHERE slug = '${p.slug}'`)),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Program ${p.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(`
        INSERT INTO programs (location_id, sport_id, name, slug, program_type, audience_type, active, is_test)
        VALUES ('${p.location_id}', '${p.sport_id}', '${q(p.name)}', '${p.slug}',
                '${p.program_type}', 'parents', true, false)
      `),
    );
    console.log(`  ✓ Created program ${p.name}`);
  }
}

async function seedSeasons(db: DB): Promise<void> {
  const seasons = [
    {
      program_slug: "adult-coed-7v7",
      name: "Summer 2026 — Adult Co-Ed 7v7",
      slug: "summer-2026-adult-coed-7v7",
      start_date: "2026-07-08",
      end_date: "2026-08-26",
      registration_opens: "2026-05-20T00:00:00Z",
      registration_closes: "2026-06-25T23:59:59Z",
      max_participants: 80,
      status: "open",
      age_group_name: "Adult Co-Ed",
      venue_name: "Field 1",
    },
    {
      program_slug: "founders-tournament",
      name: "Founders' Tournament — June 2026",
      slug: "founders-tournament-jun-2026",
      start_date: "2026-06-21",
      end_date: "2026-06-21",
      registration_opens: "2026-05-20T00:00:00Z",
      registration_closes: "2026-06-15T23:59:59Z",
      max_participants: 60,
      status: "open",
      age_group_name: "Adult Co-Ed",
      venue_name: "Field 1",
    },
    {
      program_slug: "worthington-youth-soccer",
      name: "Summer 2026 — Worthington U10",
      slug: "summer-2026-worthington-u10",
      start_date: "2026-07-15",
      end_date: "2026-08-30",
      registration_opens: "2026-05-25T00:00:00Z",
      registration_closes: "2026-06-30T23:59:59Z",
      max_participants: 40,
      status: "draft",
      age_group_name: "U10",
      venue_name: "Field A",
    },
  ];

  for (const s of seasons) {
    const existing = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM seasons WHERE slug = '${s.slug}'`)),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Season ${s.name} already exists`);
      continue;
    }

    const programId = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM programs WHERE slug = '${s.program_slug}'`)),
    )[0]?.id;
    if (!programId) throw new Error(`Program ${s.program_slug} missing`);

    const ageGroupId = rowsOf(
      await db.execute(
        sql.raw(
          `SELECT id FROM age_groups WHERE organization_id = '${KEEP_ORG_ID}' AND name = '${q(s.age_group_name)}' LIMIT 1`,
        ),
      ),
    )[0]?.id;

    const venueId = rowsOf(
      await db.execute(sql.raw(`SELECT id FROM venues WHERE name = '${q(s.venue_name)}' LIMIT 1`)),
    )[0]?.id;

    await db.execute(
      sql.raw(`
        INSERT INTO seasons (program_id, age_group_id, venue_id, name, slug, start_date, end_date,
                             registration_opens, registration_closes, max_participants, status)
        VALUES ('${programId}',
                ${ageGroupId ? `'${ageGroupId}'` : "NULL"},
                ${venueId ? `'${venueId}'` : "NULL"},
                '${q(s.name)}', '${s.slug}', '${s.start_date}', '${s.end_date}',
                '${s.registration_opens}', '${s.registration_closes}',
                ${s.max_participants}, '${s.status}')
      `),
    );
    console.log(`  ✓ Created season ${s.name} (status=${s.status})`);
  }
}

async function seedTeams(db: DB): Promise<void> {
  const seasonId = rowsOf(
    await db.execute(
      sql.raw(`SELECT id FROM seasons WHERE slug = 'summer-2026-adult-coed-7v7'`),
    ),
  )[0]?.id;
  if (!seasonId) {
    console.log("  ⚠ Adult 7v7 season missing; skipping team seed");
    return;
  }
  const teams = [
    { name: "Founders Team 1", color: "#e11d48" },
    { name: "Founders Team 2", color: "#0ea5e9" },
  ];
  for (const t of teams) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(
          `SELECT id FROM teams WHERE season_id = '${seasonId}' AND name = '${q(t.name)}'`,
        ),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Team ${t.name} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(`
        INSERT INTO teams (season_id, name, color)
        VALUES ('${seasonId}', '${q(t.name)}', '${t.color}')
      `),
    );
    console.log(`  ✓ Created team ${t.name}`);
  }
}

async function seedGames(db: DB): Promise<void> {
  const seasonId = rowsOf(
    await db.execute(
      sql.raw(`SELECT id FROM seasons WHERE slug = 'summer-2026-adult-coed-7v7'`),
    ),
  )[0]?.id;
  if (!seasonId) return;

  const teams = rowsOf(
    await db.execute(
      sql.raw(`SELECT id, name FROM teams WHERE season_id = '${seasonId}' ORDER BY name`),
    ),
  );
  if (teams.length < 2) {
    console.log("  ⚠ Need >=2 teams to seed games");
    return;
  }
  const [t1, t2] = teams;

  const venueId = rowsOf(
    await db.execute(sql.raw(`SELECT id FROM venues WHERE name = 'Field 1' LIMIT 1`)),
  )[0]?.id;

  const games = [
    { kickoff: "2026-07-08T19:00:00Z", home: t1.id, away: t2.id },
    { kickoff: "2026-07-08T20:00:00Z", home: t2.id, away: t1.id },
    { kickoff: "2026-07-15T19:00:00Z", home: t1.id, away: t2.id },
    { kickoff: "2026-07-15T20:00:00Z", home: t2.id, away: t1.id },
  ];

  for (const g of games) {
    const existing = rowsOf(
      await db.execute(
        sql.raw(
          `SELECT id FROM games WHERE season_id = '${seasonId}' AND scheduled_at = '${g.kickoff}'`,
        ),
      ),
    );
    if (existing.length > 0) {
      console.log(`  ✓ Game ${g.kickoff} already exists`);
      continue;
    }
    await db.execute(
      sql.raw(`
        INSERT INTO games (season_id, home_team_id, away_team_id, venue_id, scheduled_at, duration_minutes, status)
        VALUES ('${seasonId}', '${g.home}', '${g.away}',
                ${venueId ? `'${venueId}'` : "NULL"},
                '${g.kickoff}', 60, 'scheduled')
      `),
    );
    console.log(`  ✓ Created game at ${g.kickoff}`);
  }
}

async function seedDiscountCodes(db: DB): Promise<void> {
  const code = "FOUNDERS";
  const existing = rowsOf(
    await db.execute(
      sql.raw(
        `SELECT id FROM discount_codes WHERE organization_id = '${KEEP_ORG_ID}' AND code = '${code}'`,
      ),
    ),
  );
  if (existing.length > 0) {
    console.log(`  ✓ Discount code ${code} already exists`);
    return;
  }
  await db.execute(
    sql.raw(
      `INSERT INTO discount_codes (organization_id, code, discount_type, discount_value, active)
       VALUES ('${KEEP_ORG_ID}', '${code}', 'percentage', 100, true)`,
    ),
  );
  console.log(`  ✓ Created discount code ${code}`);
}

async function main() {
  guardEnv();

  console.log("# Day-0 launch seed\n");
  console.log(
    `Target: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}\n`,
  );

  const db = getDb();

  console.log("## Baseline verification");
  await verifyBaseline(db);

  console.log("\n## Sport");
  await seedSport(db);

  console.log("\n## Venues");
  await seedVenues(db);

  console.log("\n## Age groups");
  await seedAgeGroups(db);

  console.log("\n## Programs");
  await seedPrograms(db);

  console.log("\n## Seasons");
  await seedSeasons(db);

  console.log("\n## Teams");
  await seedTeams(db);

  console.log("\n## Games");
  await seedGames(db);

  console.log("\n## Discount codes");
  await seedDiscountCodes(db);

  console.log("\n  - Registrations: deferred to customer-journey spec (Phase E)");

  console.log("\nDay-0 seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

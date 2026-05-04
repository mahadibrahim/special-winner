/**
 * Bulk-flip launch seasons from `draft` → `open`.
 *
 * Driven by the slug patterns the launch seed produces
 * (see src/lib/db/seeds/seed-launch-2026.ts).
 *
 * Usage:
 *   # Preview what would change
 *   DATABASE_URL="<prod>" tsx scripts/open-launch-seasons.ts --season=summer --dry-run
 *
 *   # Commit the change
 *   DATABASE_URL="<prod>" tsx scripts/open-launch-seasons.ts --season=summer
 *
 *   # Same for fall
 *   DATABASE_URL="<prod>" tsx scripts/open-launch-seasons.ts --season=fall --dry-run
 *
 * The script wraps the UPDATE in an explicit transaction so dry-run mode
 * can show the row count and the affected slugs without committing.
 *
 * Idempotent: rows already at status='open' are not touched. Re-running
 * after partial success is safe.
 */

import "dotenv/config";

import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { seasons } from "../src/lib/db/schema";

type SeasonWindow = "summer" | "fall";

interface Args {
  window: SeasonWindow;
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let window: SeasonWindow | null = null;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--season=")) {
      const v = arg.slice("--season=".length);
      if (v === "summer" || v === "fall") window = v;
      else throw new Error(`--season must be 'summer' or 'fall', got '${v}'`);
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: tsx scripts/open-launch-seasons.ts --season=<summer|fall> [--dry-run]",
      );
      process.exit(0);
    }
  }
  if (!window) {
    throw new Error("--season=<summer|fall> is required. Pass --help for usage.");
  }
  return { window, dryRun };
}

// Patterns that match seasons created by seed-launch-2026.ts.
//
// Summer slugs:
//   • '*-summer-2026'             — leagues, community, downtown, free-agent
//   • '*-summer-cycle*-2026'      — skills clinics (two cycles per summer)
//   • 'camp-*-week*-2026'         — 8 day-camp weeks
//   • 'memorial-day-premier-2026' — summer tournaments (explicit list)
//   • 'eid-al-adha-cup-2026'
//   • 'liga-latina-kickoff-cup-2026'
//   • 'fourth-of-july-express-2026'
//   • 'africa-cup-mid-summer-2026'
//   • 'continental-cup-final-2026'
//
// Fall slugs:
//   • '*-fall-2026'               — leagues, community, downtown
//   • '*-fall-cycle*-2026'        — skills clinics
//   • 'youth-fall-rec-*-2026'
//   • 'hs-coed-saturday-fall-2026'
//   • 'do-corporate-fall-2026'
//   • 'halloween-cup-2026'
//   • 'turkey-bowl-2026'
//   • 'holiday-cup-2026'
const SUMMER_TOURNAMENT_SLUGS = [
  "memorial-day-premier-2026",
  "eid-al-adha-cup-2026",
  "liga-latina-kickoff-cup-2026",
  "fourth-of-july-express-2026",
  "africa-cup-mid-summer-2026",
  "continental-cup-final-2026",
];
const FALL_TOURNAMENT_SLUGS = ["halloween-cup-2026", "turkey-bowl-2026", "holiday-cup-2026"];

function buildWhereClause(window: SeasonWindow) {
  if (window === "summer") {
    return sql`(
      ${seasons.slug} LIKE '%-summer-2026'
      OR ${seasons.slug} LIKE '%-summer-cycle%-2026'
      OR ${seasons.slug} LIKE 'camp-%-week%-2026'
      OR ${seasons.slug} IN ${SUMMER_TOURNAMENT_SLUGS}
    ) AND ${seasons.status} = 'draft'`;
  }
  return sql`(
    ${seasons.slug} LIKE '%-fall-2026'
    OR ${seasons.slug} LIKE '%-fall-cycle%-2026'
    OR ${seasons.slug} LIKE 'youth-fall-rec-%-2026'
    OR ${seasons.slug} = 'hs-coed-saturday-fall-2026'
    OR ${seasons.slug} = 'do-corporate-fall-2026'
    OR ${seasons.slug} IN ${FALL_TOURNAMENT_SLUGS}
  ) AND ${seasons.status} = 'draft'`;
}

async function main() {
  const args = parseArgs();
  const db = getDb();

  console.log(
    `[open-launch-seasons] window=${args.window} dryRun=${args.dryRun}\n`,
  );

  const whereClause = buildWhereClause(args.window);

  // 1. Preview what would change (always shown — even on real runs)
  const matched = await db
    .select({
      id: seasons.id,
      slug: seasons.slug,
      name: seasons.name,
      startDate: seasons.startDate,
      priceCents: seasons.priceCents,
    })
    .from(seasons)
    .where(whereClause)
    .orderBy(seasons.startDate, seasons.slug);

  if (matched.length === 0) {
    console.log(
      `   No draft seasons matched the ${args.window} pattern. Nothing to do.`,
    );
    console.log(
      `   (Either they're already open, or the launch seed hasn't run, or the season slugs don't match the patterns.)`,
    );
    process.exit(0);
  }

  console.log(`   ${matched.length} draft seasons match — will move to 'open':`);
  for (const row of matched) {
    const price = `$${(row.priceCents / 100).toFixed(2)}`;
    console.log(
      `     • ${row.slug.padEnd(48)} ${row.startDate}  ${price.padStart(8)}  ${row.name}`,
    );
  }

  if (args.dryRun) {
    console.log(`\n   --dry-run mode: nothing was changed. Re-run without --dry-run to commit.`);
    process.exit(0);
  }

  // 2. Real run — UPDATE in a single transaction
  console.log(`\n   Committing UPDATE...`);
  const ids = matched.map((r) => r.id);
  await db
    .update(seasons)
    .set({ status: "open", updatedAt: new Date() })
    .where(and(inArray(seasons.id, ids), eq(seasons.status, "draft")));

  console.log(`   ✓ ${matched.length} seasons moved to status='open'.`);
  console.log(
    `\n[open-launch-seasons] done. Verify in admin UI at /admin/seasons.`,
  );
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ open-launch-seasons failed:", err);
      process.exit(1);
    });
}

export { main as openLaunchSeasons };

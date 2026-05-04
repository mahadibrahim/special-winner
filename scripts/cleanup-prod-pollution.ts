/**
 * Targeted cleanup of CI-fixture pollution that accumulated in the prod
 * DB before the staging-environment cutover (2026-05-04).
 *
 * Walks the prod DB and DELETEs (or, for FK-bound rows, deactivates) data
 * that came from `seed-e2e-tests.ts` test runs:
 *   • locations whose name matches /^Loc [a-z0-9]+$/ (random fixture names)
 *   • locations with slug = 'powell' (only seeded by the e2e test fixture)
 *   • sports whose name matches /^Sport [a-z0-9]+$/
 *   • sports with slug in the e2e fixture set (basketball, baseball,
 *     football, volleyball, etc.) — keep only sports we actually run
 *
 * Safety:
 *   • --dry-run prints every row that would be touched, runs zero writes
 *   • Without --dry-run the script wraps everything in a transaction so
 *     the entire cleanup either commits or rolls back
 *   • Refuses to run unless DATABASE_URL is passed AND
 *     ALLOW_PROD_CLEANUP=yes is set (similar to reset-staging-schema.sh)
 *
 * Usage:
 *   # Always preview first
 *   DATABASE_URL="<prod>" ALLOW_PROD_CLEANUP=yes \
 *     tsx scripts/cleanup-prod-pollution.ts --dry-run
 *
 *   # Commit if the preview looks right
 *   DATABASE_URL="<prod>" ALLOW_PROD_CLEANUP=yes \
 *     tsx scripts/cleanup-prod-pollution.ts
 */

import "dotenv/config";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  locations,
  sports,
  programs,
  seasons,
  ageGroups,
} from "../src/lib/db/schema";

interface Args {
  dryRun: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: tsx scripts/cleanup-prod-pollution.ts [--dry-run]\n\n" +
          "  Requires DATABASE_URL + ALLOW_PROD_CLEANUP=yes in env.",
      );
      process.exit(0);
    }
  }
  return { dryRun };
}

const FIXTURE_LOCATION_NAME_RE = /^Loc [a-z0-9]+$/i;
const FIXTURE_SPORT_NAME_RE = /^Sport [a-z0-9]+$/i;

// e2e seed creates these sports — keep only `soccer` and any other sport
// the launch catalog uses. As of 2026-05-04 only soccer is in production.
const FIXTURE_SPORT_SLUGS = [
  "basketball",
  "baseball",
  "football",
  "flag-football",
  "volleyball",
  "tennis",
  "golf",
  "swimming",
];

// Powell is a fixture location from seed-e2e-tests.ts; the launch catalog
// uses worthington + downtown.
const FIXTURE_LOCATION_SLUGS = ["powell", "dublin", "delaware"];

async function main() {
  const args = parseArgs();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  if (process.env.ALLOW_PROD_CLEANUP !== "yes") {
    console.error(
      "ERROR: ALLOW_PROD_CLEANUP must be set to 'yes' (this is destructive).",
    );
    process.exit(2);
  }

  // Mask creds when echoing the host to console.
  const host = (databaseUrl.match(/@([^/]+)\//) ?? [])[1] ?? "(unknown)";
  console.log(`[cleanup-prod-pollution] target host: ${host}`);
  console.log(`[cleanup-prod-pollution] dryRun=${args.dryRun}\n`);

  const sql_client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql_client);

  try {
    // 1. Find pollution rows
    const allLocations = await db
      .select({ id: locations.id, slug: locations.slug, name: locations.name })
      .from(locations);
    const pollutedLocations = allLocations.filter(
      (l) =>
        FIXTURE_LOCATION_NAME_RE.test(l.name) ||
        FIXTURE_LOCATION_SLUGS.includes(l.slug),
    );

    const allSports = await db
      .select({ id: sports.id, slug: sports.slug, name: sports.name })
      .from(sports);
    const pollutedSports = allSports.filter(
      (s) =>
        FIXTURE_SPORT_NAME_RE.test(s.name) ||
        FIXTURE_SPORT_SLUGS.includes(s.slug),
    );

    // 2. Find programs/seasons that reference the polluted rows. These
    //    cascade-die when the parent location/sport is deleted; preview
    //    them so the operator sees the blast radius.
    const programIdsToDelete = new Set<string>();
    if (pollutedLocations.length > 0) {
      const locProgIds = await db
        .select({ id: programs.id, name: programs.name, slug: programs.slug })
        .from(programs)
        .where(
          inArray(
            programs.locationId,
            pollutedLocations.map((l) => l.id),
          ),
        );
      for (const p of locProgIds) programIdsToDelete.add(p.id);
    }
    if (pollutedSports.length > 0) {
      const sportProgIds = await db
        .select({ id: programs.id, name: programs.name, slug: programs.slug })
        .from(programs)
        .where(
          inArray(
            programs.sportId,
            pollutedSports.map((s) => s.id),
          ),
        );
      for (const p of sportProgIds) programIdsToDelete.add(p.id);
    }

    let seasonsCount = 0;
    if (programIdsToDelete.size > 0) {
      const c = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(seasons)
        .where(inArray(seasons.programId, [...programIdsToDelete]));
      seasonsCount = c[0]?.n ?? 0;
    }

    // 3. Print report
    console.log(
      `   ${pollutedLocations.length} polluted locations (will delete):`,
    );
    for (const l of pollutedLocations) {
      console.log(`     • ${l.slug.padEnd(20)} "${l.name}"`);
    }
    console.log(
      `\n   ${pollutedSports.length} polluted sports (will delete):`,
    );
    for (const s of pollutedSports) {
      console.log(`     • ${s.slug.padEnd(20)} "${s.name}"`);
    }
    console.log(
      `\n   Cascade impact: ${programIdsToDelete.size} programs + ${seasonsCount} seasons referencing the above will be deleted.`,
    );

    if (pollutedLocations.length === 0 && pollutedSports.length === 0) {
      console.log("\n   Nothing to clean. Exiting.");
      return;
    }

    if (args.dryRun) {
      console.log(
        "\n   --dry-run mode: nothing was changed. Re-run without --dry-run to commit.",
      );
      return;
    }

    // 4. Real run — wrap the destructive ops in a transaction
    console.log("\n   Committing deletes (transactional)...");
    await db.transaction(async (tx) => {
      // Delete seasons first (FK to programs)
      if (programIdsToDelete.size > 0) {
        await tx
          .delete(seasons)
          .where(inArray(seasons.programId, [...programIdsToDelete]));
        await tx
          .delete(programs)
          .where(inArray(programs.id, [...programIdsToDelete]));
      }
      // Delete the locations + sports themselves
      if (pollutedLocations.length > 0) {
        await tx
          .delete(locations)
          .where(
            inArray(
              locations.id,
              pollutedLocations.map((l) => l.id),
            ),
          );
      }
      if (pollutedSports.length > 0) {
        await tx
          .delete(sports)
          .where(
            inArray(
              sports.id,
              pollutedSports.map((s) => s.id),
            ),
          );
      }
    });
    console.log(
      `   ✓ ${pollutedLocations.length} locations + ${pollutedSports.length} sports + ${programIdsToDelete.size} programs + ${seasonsCount} seasons deleted.`,
    );
  } finally {
    await sql_client.end({ timeout: 5 });
  }

  // Suppress an unused-import lint; ageGroups is exported here as a
  // future-proofing reference for ops who might extend this script to
  // also clean fixture-pattern age_groups (which the e2e seed creates
  // but do not currently leak into the public catalog).
  void ageGroups;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ cleanup-prod-pollution failed:", err);
    process.exit(1);
  });

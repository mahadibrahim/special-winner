/**
 * Strict prod-DB cleanup — allow-list approach.
 *
 * The original cleanup-prod-pollution.ts used a deny-list of known
 * fixture patterns (Loc XXXXX names, powell/dublin/delaware slugs,
 * specific sport slugs). That doesn't catch everything: there are
 * additional locations (Powell with non-fixture suffix) and sports
 * (Baseball, Basketball, Flag Football, T-Ball) that are not part of
 * the actual launch catalog.
 *
 * This script flips the model: define what IS real, delete everything
 * else. Per the operator's confirmation 2026-05-05:
 *   • Real sports: only `soccer`
 *   • Real locations: only `worthington` and `downtown`
 *
 * Anything outside that allow-list — and everything that cascades from
 * it via programs/seasons — gets deleted in one transaction.
 *
 * Safety:
 *   • --dry-run prints every row that would be touched
 *   • Without --dry-run wraps in a transaction so the entire cleanup
 *     either commits or rolls back
 *   • Refuses to run unless DATABASE_URL is set AND
 *     ALLOW_PROD_CLEANUP=yes is also set
 *
 * Usage:
 *   # Always preview first
 *   DATABASE_URL="<prod>" ALLOW_PROD_CLEANUP=yes \
 *     npm run prod:cleanup-strict -- --dry-run
 *
 *   # Commit if the preview looks right
 *   DATABASE_URL="<prod>" ALLOW_PROD_CLEANUP=yes \
 *     npm run prod:cleanup-strict
 */

import "dotenv/config";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  locations,
  sports,
  programs,
  seasons,
  ageGroups,
} from "../src/lib/db/schema";

const ALLOWED_SPORT_SLUGS = ["soccer"] as const;
const ALLOWED_LOCATION_SLUGS = ["worthington", "downtown"] as const;

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
        "Usage: tsx scripts/cleanup-prod-strict.ts [--dry-run]\n\n" +
          "  Allow-list cleanup: keeps only sports IN " +
          ALLOWED_SPORT_SLUGS.join(", ") +
          " and locations IN " +
          ALLOWED_LOCATION_SLUGS.join(", ") +
          ".\n  Requires DATABASE_URL + ALLOW_PROD_CLEANUP=yes in env.",
      );
      process.exit(0);
    }
  }
  return { dryRun };
}

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

  const host = (databaseUrl.match(/@([^/]+)\//) ?? [])[1] ?? "(unknown)";
  console.log(`[cleanup-prod-strict] target host: ${host}`);
  console.log(`[cleanup-prod-strict] dryRun=${args.dryRun}`);
  console.log(`[cleanup-prod-strict] allowed sports:    ${ALLOWED_SPORT_SLUGS.join(", ")}`);
  console.log(`[cleanup-prod-strict] allowed locations: ${ALLOWED_LOCATION_SLUGS.join(", ")}\n`);

  const sql_client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql_client);

  try {
    // 1. Find what's outside the allow-list.
    const allSports = await db
      .select({ id: sports.id, slug: sports.slug, name: sports.name })
      .from(sports);
    const sportsToDelete = allSports.filter(
      (s) => !ALLOWED_SPORT_SLUGS.includes(s.slug as typeof ALLOWED_SPORT_SLUGS[number]),
    );
    const sportsToKeep = allSports.filter(
      (s) => ALLOWED_SPORT_SLUGS.includes(s.slug as typeof ALLOWED_SPORT_SLUGS[number]),
    );

    const allLocations = await db
      .select({ id: locations.id, slug: locations.slug, name: locations.name })
      .from(locations);
    const locationsToDelete = allLocations.filter(
      (l) => !ALLOWED_LOCATION_SLUGS.includes(l.slug as typeof ALLOWED_LOCATION_SLUGS[number]),
    );
    const locationsToKeep = allLocations.filter(
      (l) => ALLOWED_LOCATION_SLUGS.includes(l.slug as typeof ALLOWED_LOCATION_SLUGS[number]),
    );

    // 2. Find programs / seasons that reference rows being deleted.
    const programIdsToDelete = new Set<string>();

    if (sportsToDelete.length > 0) {
      const sportProgs = await db
        .select({ id: programs.id })
        .from(programs)
        .where(inArray(programs.sportId, sportsToDelete.map((s) => s.id)));
      for (const p of sportProgs) programIdsToDelete.add(p.id);
    }
    if (locationsToDelete.length > 0) {
      const locProgs = await db
        .select({ id: programs.id })
        .from(programs)
        .where(inArray(programs.locationId, locationsToDelete.map((l) => l.id)));
      for (const p of locProgs) programIdsToDelete.add(p.id);
    }

    let seasonsCount = 0;
    if (programIdsToDelete.size > 0) {
      const c = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(seasons)
        .where(inArray(seasons.programId, [...programIdsToDelete]));
      seasonsCount = c[0]?.n ?? 0;
    }

    // 3. Print report.
    console.log(`   Sports kept (${sportsToKeep.length}):`);
    for (const s of sportsToKeep) console.log(`     ✓ ${s.slug.padEnd(16)} "${s.name}"`);
    console.log(`\n   Sports to delete (${sportsToDelete.length}):`);
    for (const s of sportsToDelete) console.log(`     ✗ ${s.slug.padEnd(16)} "${s.name}"`);

    console.log(`\n   Locations kept (${locationsToKeep.length}):`);
    for (const l of locationsToKeep) console.log(`     ✓ ${l.slug.padEnd(16)} "${l.name}"`);
    console.log(`\n   Locations to delete (${locationsToDelete.length}):`);
    for (const l of locationsToDelete) console.log(`     ✗ ${l.slug.padEnd(16)} "${l.name}"`);

    console.log(
      `\n   Cascade impact: ${programIdsToDelete.size} programs + ${seasonsCount} seasons reference rows being deleted and will also be removed.`,
    );

    if (sportsToDelete.length === 0 && locationsToDelete.length === 0) {
      console.log("\n   Nothing outside the allow-list. Catalog is clean.");
      return;
    }

    if (args.dryRun) {
      console.log(
        "\n   --dry-run mode: nothing was changed. Re-run without --dry-run to commit.",
      );
      return;
    }

    // 4. Real run — wrap the destructive ops in a transaction.
    console.log("\n   Committing deletes (transactional)...");
    await db.transaction(async (tx) => {
      // Delete seasons + programs first (FK dependencies).
      if (programIdsToDelete.size > 0) {
        await tx
          .delete(seasons)
          .where(inArray(seasons.programId, [...programIdsToDelete]));
        await tx
          .delete(programs)
          .where(inArray(programs.id, [...programIdsToDelete]));
      }
      // Delete sports + locations themselves.
      if (sportsToDelete.length > 0) {
        await tx
          .delete(sports)
          .where(inArray(sports.id, sportsToDelete.map((s) => s.id)));
      }
      if (locationsToDelete.length > 0) {
        await tx
          .delete(locations)
          .where(inArray(locations.id, locationsToDelete.map((l) => l.id)));
      }
    });
    console.log(
      `   ✓ ${sportsToDelete.length} sports + ${locationsToDelete.length} locations + ${programIdsToDelete.size} programs + ${seasonsCount} seasons deleted.`,
    );
  } finally {
    await sql_client.end({ timeout: 5 });
  }

  // Suppress unused-import lints for symbols that may be added to the
  // cleanup later (e.g. age-group cleanup if fixture age groups appear).
  void ageGroups;
  void notInArray;
  void and;
  void eq;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ cleanup-prod-strict failed:", err);
    process.exit(1);
  });

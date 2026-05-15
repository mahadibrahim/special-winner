#!/usr/bin/env tsx
/**
 * One-off cleanup: soft-archive (active=false) every location and sport on
 * the production database EXCEPT the canonical kept rows.
 *
 * Background: prod accumulated test orgs/locations/sports from CI runs
 * that pointed at prod credentials. This script preserves all downstream
 * rows (registrations, games, drop-in bookings, etc.) by toggling the
 * `active` flag rather than deleting — reversible, no cascade.
 *
 * Per CLAUDE.md "Database write surface": this script is intentionally
 * branch-specific and MUST be deleted in a follow-up commit after the
 * prod run merges.
 *
 * Usage:
 *   # DRY-RUN (default) — prints counts of rows that would be touched.
 *   DATABASE_URL=$PROD_URL tsx scripts/cleanup-prod-locations-sports.ts
 *
 *   # APPLY — writes inside a single transaction. Requires explicit opt-in.
 *   DATABASE_URL=$PROD_URL ALLOW_PROD_CLEANUP=yes \
 *     tsx scripts/cleanup-prod-locations-sports.ts --apply
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, inArray, not } from "drizzle-orm";
import { locations } from "../src/lib/db/schema/organizations";
import { sports } from "../src/lib/db/schema/sports";

const KEPT_LOCATION_IDS = [
  // Aspire Sports — Downtown / OSU
  "18762139-8a91-4c12-bbfa-346c61e1106c",
  // Aspire Sports — Worthington
  "2a1693fe-3adc-41f5-90e2-03278decbd6d",
];

const KEPT_SPORT_IDS = [
  // Soccer (canonical, slug "soccer", Aspire Sports org, 83 programs)
  "c25183df-1cfd-4f1a-ad01-70175efef38d",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL not set");
    process.exit(1);
  }

  const apply = process.argv.includes("--apply");
  if (apply && process.env.ALLOW_PROD_CLEANUP !== "yes") {
    console.error(
      "REFUSED: --apply requires ALLOW_PROD_CLEANUP=yes (deliberate prod-write opt-in).",
    );
    process.exit(2);
  }

  const hostname = new URL(url).hostname;
  console.log(`[cleanup] mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`[cleanup] DATABASE_URL host: ${hostname}`);
  console.log(`[cleanup] kept locations: ${KEPT_LOCATION_IDS.length}`);
  console.log(`[cleanup] kept sports:    ${KEPT_SPORT_IDS.length}`);

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // Pre-counts (read-only).
  const locRows = await db.select({ id: locations.id, active: locations.active }).from(locations);
  const sportRows = await db.select({ id: sports.id, active: sports.active }).from(sports);

  const locKept = new Set(KEPT_LOCATION_IDS);
  const sportKept = new Set(KEPT_SPORT_IDS);

  const locToArchive = locRows.filter((r) => !locKept.has(r.id) && r.active === true).length;
  const locKeptActive = locRows.filter((r) => locKept.has(r.id) && r.active === true).length;
  const locKeptMissing = KEPT_LOCATION_IDS.filter(
    (id) => !locRows.some((r) => r.id === id),
  );
  const locAlreadyArchived = locRows.filter((r) => !locKept.has(r.id) && r.active === false).length;

  const sportToArchive = sportRows.filter((r) => !sportKept.has(r.id) && r.active === true).length;
  const sportKeptActive = sportRows.filter((r) => sportKept.has(r.id) && r.active === true).length;
  const sportKeptMissing = KEPT_SPORT_IDS.filter(
    (id) => !sportRows.some((r) => r.id === id),
  );
  const sportAlreadyArchived = sportRows.filter(
    (r) => !sportKept.has(r.id) && r.active === false,
  ).length;

  console.log("\n[locations]");
  console.log(`  total:            ${locRows.length}`);
  console.log(`  kept (active=true): ${locKeptActive}`);
  console.log(`  kept (missing):     ${locKeptMissing.length}${
    locKeptMissing.length ? "  -> " + locKeptMissing.join(", ") : ""
  }`);
  console.log(`  to archive:         ${locToArchive}`);
  console.log(`  already archived:   ${locAlreadyArchived}`);

  console.log("\n[sports]");
  console.log(`  total:            ${sportRows.length}`);
  console.log(`  kept (active=true): ${sportKeptActive}`);
  console.log(`  kept (missing):     ${sportKeptMissing.length}${
    sportKeptMissing.length ? "  -> " + sportKeptMissing.join(", ") : ""
  }`);
  console.log(`  to archive:         ${sportToArchive}`);
  console.log(`  already archived:   ${sportAlreadyArchived}`);

  if (locKeptMissing.length || sportKeptMissing.length) {
    console.error(
      "\n[cleanup] REFUSED: at least one KEPT id is missing from the DB. Verify the id list against prod before applying.",
    );
    await client.end();
    process.exit(3);
  }

  if (!apply) {
    console.log(
      "\n[cleanup] DRY-RUN complete. Re-run with --apply + ALLOW_PROD_CLEANUP=yes to write.",
    );
    await client.end();
    return;
  }

  await db.transaction(async (tx) => {
    const locResult = await tx
      .update(locations)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(locations.active, true), not(inArray(locations.id, KEPT_LOCATION_IDS))))
      .returning({ id: locations.id });

    const sportResult = await tx
      .update(sports)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(sports.active, true), not(inArray(sports.id, KEPT_SPORT_IDS))))
      .returning({ id: sports.id });

    console.log(`\n[locations] archived this run: ${locResult.length}`);
    console.log(`[sports]    archived this run: ${sportResult.length}`);
  });

  console.log("\n[cleanup] APPLY complete.");
  await client.end();
}

main().catch((err) => {
  console.error("[cleanup] FAILED:", err);
  process.exit(1);
});

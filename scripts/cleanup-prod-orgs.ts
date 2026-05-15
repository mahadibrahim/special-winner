#!/usr/bin/env tsx
/**
 * One-off cleanup: flip `status` from `'pending'` to `'inactive'` for every
 * leaked test organization on prod. Sibling to the locations/sports script
 * shipped in PR #47; same shape, same guarantees.
 *
 * Background: prod accumulated 162 test orgs (132 `T-<timestamp>` from
 * tests/utils/activity-tracking-helpers.ts, 30 `Org <random>` from
 * tests/api/webhooks/stripe.test.ts) over 2026-05-03 .. 2026-05-14, when
 * local `npm run test:api` runs were misconfigured to use prod creds.
 * The leak path is now guarded by the change in src/lib/db/index.ts
 * (separate PR).
 *
 * `organizations` has no `active` column — status enum is the soft-archive
 * signal. We move `'pending'` → `'inactive'`. The only real org in prod is
 * already `'active'` (caf5eac4-… Aspire Sports), and one other row is
 * already `'inactive'` (SoccerOne); neither is touched.
 *
 * Per CLAUDE.md "Database write surface": this script is branch-specific
 * and MUST be deleted in a follow-up commit on this PR after the prod
 * run applies.
 *
 * Usage:
 *   # DRY-RUN (default) — prints counts of rows that would be touched.
 *   DATABASE_URL=$PROD_URL tsx scripts/cleanup-prod-orgs.ts
 *
 *   # APPLY — writes inside a single transaction. Requires explicit opt-in.
 *   DATABASE_URL=$PROD_URL ALLOW_PROD_CLEANUP=yes \
 *     tsx scripts/cleanup-prod-orgs.ts --apply
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { organizations } from "../src/lib/db/schema/organizations";

// The single real org. Anything not in this list with status='pending'
// will flip to 'inactive'. Anything already 'inactive' (e.g. SoccerOne)
// is left alone by virtue of the status='pending' WHERE clause.
const KEPT_ORG_IDS = [
  // Aspire Sports — caf5eac4-28ed-459a-8bdd-04c572d052d3 — already 'active',
  // not touched by the WHERE status='pending' filter. Listed for the
  // missing-id integrity check below.
  "caf5eac4-28ed-459a-8bdd-04c572d052d3",
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
  console.log(`[cleanup-orgs] mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`[cleanup-orgs] DATABASE_URL host: ${hostname}`);

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  // Pre-counts (read-only).
  const rows = await db
    .select({ id: organizations.id, status: organizations.status })
    .from(organizations);

  const counts = {
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    pending: rows.filter((r) => r.status === "pending").length,
    inactive: rows.filter((r) => r.status === "inactive").length,
    suspended: rows.filter((r) => r.status === "suspended").length,
  };
  const keptMissing = KEPT_ORG_IDS.filter((id) => !rows.some((r) => r.id === id));

  console.log("\n[organizations] status distribution:");
  console.log(`  total:     ${counts.total}`);
  console.log(`  active:    ${counts.active}  (real orgs — untouched)`);
  console.log(`  pending:   ${counts.pending}  (to archive → 'inactive')`);
  console.log(`  inactive:  ${counts.inactive}  (already archived — untouched)`);
  console.log(`  suspended: ${counts.suspended}`);
  console.log(
    `  kept (missing from DB): ${keptMissing.length}${
      keptMissing.length ? "  -> " + keptMissing.join(", ") : ""
    }`,
  );

  if (keptMissing.length) {
    console.error(
      "\n[cleanup-orgs] REFUSED: at least one KEPT id is missing from the DB. Verify the id list against prod before applying.",
    );
    await client.end();
    process.exit(3);
  }

  if (!apply) {
    console.log(
      "\n[cleanup-orgs] DRY-RUN complete. Re-run with --apply + ALLOW_PROD_CLEANUP=yes to write.",
    );
    await client.end();
    return;
  }

  const updated = await db
    .update(organizations)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(eq(organizations.status, "pending"))
    .returning({ id: organizations.id });

  console.log(`\n[organizations] archived this run: ${updated.length}`);
  console.log("\n[cleanup-orgs] APPLY complete.");
  await client.end();
}

main().catch((err) => {
  console.error("[cleanup-orgs] FAILED:", err);
  process.exit(1);
});

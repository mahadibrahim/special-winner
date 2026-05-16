/**
 * ONE-OFF PROD PURGE — wipes test/zombie data, keeps a small whitelist.
 *
 * Per CLAUDE.md "Database write surface": one-off destructive scripts are
 * branch-specific and deleted after the merge. This file lives only on
 * feat/admin-overhaul-prod-purge and is gone after cleanup completes.
 *
 * Strategy: discover FK graph at runtime, topologically sort, delete
 * leaves first. Most tables get full DELETE. A small whitelist of tables
 * has WHERE-clause exceptions to preserve specific rows.
 *
 * Reference tables (curriculum, roles, etc.) are skipped — they're
 * shared catalog data with no test pollution.
 *
 * Guards:
 *   - Requires ALLOW_PROD_PURGE=yes opt-in.
 *   - Defaults to DRY RUN — prints what each phase would do.
 *     Pass PURGE_REALLY_RUN=yes to actually execute (still inside a
 *     transaction; rollback on any error).
 *
 * Keep-set:
 *   Organization: caf5eac4-…  "Aspire Sports"
 *   Locations:    18762139-…  "Aspire Sports — Downtown / OSU"
 *                 2a1693fe-…  "Aspire Sports — Worthington"
 *   Users:        mahad.ibrahim@gmail.com
 *                 alexis.santos@icloud.com
 */

import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

const KEEP_ORG_ID = "caf5eac4-28ed-459a-8bdd-04c572d052d3";
const KEEP_LOCATION_IDS = [
  "18762139-8a91-4c12-bbfa-346c61e1106c", // Downtown / OSU
  "2a1693fe-3adc-41f5-90e2-03278decbd6d", // Worthington
];
const KEEP_USER_EMAILS = [
  "mahad.ibrahim@gmail.com",
  "alexis.santos@icloud.com",
];

// Tables whose entire contents are reference/catalog data and must be
// preserved. These are shared across orgs and never reference users.
const REFERENCE_TABLES = new Set([
  "roles", // role definitions (super_admin, parent, etc.)
  "skill_domains",
  "skill_categories",
  "skill_category_assignments",
  "skill_progressions",
  "skills",
  "development_stages",
  "coaching_principles",
  "resource_templates",
  "drop_in_rate_card",       // catalog data — re-create if needed but harmless
  "field_rental_rate_card",  // catalog data
]);

// Tables that have specific keep-rules instead of a full wipe.
const KEEP_RULES: Record<string, string> = {
  organizations: `id = '${KEEP_ORG_ID}'`,
  locations: `id IN ('${KEEP_LOCATION_IDS.join("','")}')`,
  users: `email IN ('${KEEP_USER_EMAILS.join("','")}')`,
  user_roles: `user_id IN (SELECT id FROM users WHERE email IN ('${KEEP_USER_EMAILS.join("','")}'))`,
  sessions: `user_id IN (SELECT id FROM users WHERE email IN ('${KEEP_USER_EMAILS.join("','")}'))`,
  user_organization_access: `user_id IN (SELECT id FROM users WHERE email IN ('${KEEP_USER_EMAILS.join("','")}'))`,
};

const DRY_RUN = process.env.PURGE_REALLY_RUN !== "yes";

function guardEnv(): void {
  if (process.env.ALLOW_PROD_PURGE !== "yes") {
    console.error(
      "REFUSED: this script wipes >1000 rows from whatever DATABASE_URL is set to.",
    );
    console.error(
      "Set ALLOW_PROD_PURGE=yes (and PURGE_REALLY_RUN=yes for real execution).",
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

async function fetchTables(db: ReturnType<typeof getDb>): Promise<string[]> {
  const rows = rowsOf(
    await db.execute(
      sql.raw(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
      ),
    ),
  );
  return rows.map((r) => r.table_name as string);
}

async function fetchForeignKeys(db: ReturnType<typeof getDb>): Promise<Map<string, Set<string>>> {
  // Returns a map: dependent -> set of tables it depends on (parents).
  const rows = rowsOf(
    await db.execute(
      sql.raw(`
        SELECT
          tc.table_name AS dependent,
          ccu.table_name AS depends_on
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_schema = tc.constraint_schema
         AND ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND ccu.table_name <> tc.table_name -- ignore self-references
      `),
    ),
  );
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const dep = r.dependent as string;
    const parent = r.depends_on as string;
    if (!map.has(dep)) map.set(dep, new Set());
    map.get(dep)!.add(parent);
  }
  return map;
}

/**
 * Topologically sort tables so that dependents come BEFORE their parents
 * (good for DELETE ordering — wipe children before parents to avoid FK
 * violations). Returns tables in delete-order.
 */
function topologicalDeleteOrder(
  tables: string[],
  fks: Map<string, Set<string>>,
): string[] {
  // For DELETE order, we want tables with FK-out (dependents) first.
  // Build reverse: parent -> set of dependents.
  const dependents = new Map<string, Set<string>>();
  for (const t of tables) dependents.set(t, new Set());
  for (const [dep, parents] of fks) {
    for (const parent of parents) {
      if (!dependents.has(parent)) dependents.set(parent, new Set());
      dependents.get(parent)!.add(dep);
    }
  }

  // Kahn's algorithm: start with tables that have nobody depending on them
  // (leaves in the delete sense — safe to delete first), peel them off.
  const order: string[] = [];
  const ready: string[] = [];
  for (const t of tables) {
    if ((dependents.get(t)?.size ?? 0) === 0) ready.push(t);
  }
  // Track remaining dependents per table
  const remaining = new Map<string, Set<string>>();
  for (const [t, s] of dependents) remaining.set(t, new Set(s));

  while (ready.length > 0) {
    const t = ready.shift()!;
    order.push(t);
    // Find tables that depend on t; reduce their parent-count (but our
    // graph is parent -> dependents, so we look at FKs from each table to t)
    for (const otherTable of tables) {
      const parents = fks.get(otherTable);
      if (parents?.has(t)) {
        // Not the right move — we need to remove t from this entry.
        // Instead, track parent counts.
      }
    }
    // Actually simpler: walk dependents of t, remove t from their parents,
    // promote to ready if their parents-set is now empty.
    const ts = dependents.get(t) ?? new Set();
    for (const dep of ts) {
      const remParents = remaining.get(dep);
      // Not quite — remaining tracks dependents not parents. Restart with cleaner logic.
    }
    // Punt this implementation; use a simpler greedy below.
    break;
  }

  // --- Simpler greedy version ---
  // Repeatedly find a table with zero dependents (i.e., nothing points to
  // it), emit it, then strip references to it from the fks map.
  const remainingFks = new Map<string, Set<string>>();
  for (const [k, v] of fks) remainingFks.set(k, new Set(v));
  const remainingTables = new Set(tables);
  const finalOrder: string[] = [];
  while (remainingTables.size > 0) {
    // Build "incoming FK count" — how many tables still depend on each:
    const incoming = new Map<string, number>();
    for (const t of remainingTables) incoming.set(t, 0);
    for (const [, parents] of remainingFks) {
      for (const p of parents) {
        if (incoming.has(p)) incoming.set(p, (incoming.get(p) ?? 0) + 1);
      }
    }
    // Pick all tables with no dependents and emit them this round.
    const leaves: string[] = [];
    for (const [t, n] of incoming) {
      if (n === 0) leaves.push(t);
    }
    if (leaves.length === 0) {
      // Cycle — list and fall back to alphabetical for the rest.
      console.warn(
        `WARN: FK cycle detected among: ${[...remainingTables].join(", ")} — falling back to alphabetical for the cycle.`,
      );
      finalOrder.push(...[...remainingTables].sort());
      break;
    }
    leaves.sort();
    finalOrder.push(...leaves);
    for (const t of leaves) {
      remainingTables.delete(t);
      remainingFks.delete(t);
    }
  }
  return finalOrder;
}

async function main() {
  guardEnv();

  console.log("# Prod-purge (FK-graph-aware)\n");
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN" : "REAL EXECUTION (transactional)"}`,
  );
  console.log(
    `Target: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}`,
  );
  console.log("");

  const db = getDb();

  console.log("## Discovering schema");
  const tables = await fetchTables(db);
  const fks = await fetchForeignKeys(db);
  console.log(`  ${tables.length} tables, ${[...fks.values()].reduce((a, s) => a + s.size, 0)} FK edges`);

  const order = topologicalDeleteOrder(tables, fks);
  console.log(`  Delete order computed: ${order.length} tables`);

  console.log("\n## Plan per table (DRY-RUN counts)");
  const plan: { table: string; sqlDel: string; sqlPreview: string }[] = [];
  for (const t of order) {
    if (REFERENCE_TABLES.has(t)) {
      console.log(`  ${t.padEnd(35)} SKIP (reference table)`);
      continue;
    }
    const keepRule = KEEP_RULES[t];
    const where = keepRule ? `WHERE NOT (${keepRule})` : "";
    const sqlDel = `DELETE FROM "${t}" ${where}`.trim();
    const sqlPreview = `SELECT COUNT(*)::int AS n FROM "${t}" ${where}`.trim();
    try {
      const rows = rowsOf(await db.execute(sql.raw(sqlPreview)));
      const n = rows[0]?.n ?? 0;
      console.log(`  ${t.padEnd(35)} ${n} rows to delete${keepRule ? "  (keep-rule applied)" : ""}`);
      plan.push({ table: t, sqlDel, sqlPreview });
    } catch (e) {
      console.log(`  ${t.padEnd(35)} preview failed: ${(e as Error).message}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN — re-run with PURGE_REALLY_RUN=yes to execute.");
    process.exit(0);
  }

  console.log("\n## Executing in transaction\n");
  try {
    await db.transaction(async (tx) => {
      for (const { table, sqlDel } of plan) {
        const result = await tx.execute(sql.raw(sqlDel));
        // postgres-js returns the rows; for DELETE it returns an empty
        // array with a count attached. Best-effort report.
        const n = (result as any).count ?? (result as any).rowCount ?? "?";
        console.log(`  ✓ ${table.padEnd(35)} deleted ${n}`);
      }
    });
    console.log("\nTransaction committed.");
  } catch (e) {
    console.error("\nTransaction ROLLED BACK due to error:");
    console.error(e);
    process.exit(1);
  }

  console.log("\n## Post-purge sanity check\n");
  for (const [t, rule] of Object.entries(KEEP_RULES)) {
    const total = rowsOf(await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM "${t}"`)))[0]?.n ?? "?";
    const kept = rowsOf(await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM "${t}" WHERE ${rule}`)))[0]?.n ?? "?";
    console.log(`  ${t.padEnd(30)} total=${total}, matching keep-rule=${kept}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

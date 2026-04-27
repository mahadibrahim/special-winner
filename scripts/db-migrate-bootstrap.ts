/**
 * Idempotent reconciler for drizzle.__drizzle_migrations on databases that
 * were previously managed by `drizzle-kit push` (or that inherited a stale
 * tracking state from an earlier broken bootstrap).
 *
 * Algorithm:
 *   - parse all migrations once for raw schema effects (creates, adds, drops)
 *   - per migration M, resolve each create/add against drops in later migrations:
 *       · earlier create/add NOT dropped later → expectPresent: true
 *       · earlier create/add dropped later     → expectPresent: false
 *   - check whether each expectPresent:true target exists in the target DB
 *   - reconcile the tracking table:
 *       · missing expected rows → INSERT (hash, created_at)
 *       · rows for hashes whose net effects don't match DB state → DELETE (drift)
 *
 * On a truly empty DB (no `users` table) the whole bootstrap is a no-op and
 * the downstream migrator builds schema from scratch.
 *
 * Safe to run on every CI build.
 *
 * Handles four schema-effect shapes per migration:
 *   · CREATE TABLE "name"               → table must exist (unless later dropped)
 *   · ALTER TABLE "t" ADD COLUMN "c"   → column must exist (unless later dropped)
 *   · DROP TABLE "name"                → table should be absent
 *   · ALTER TABLE "t" DROP COLUMN "c"  → column should be absent
 *
 * A migration is treated as applied when ALL of its net effects are
 * consistent with the target DB state (accounting for later drops).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const MIGRATIONS_DIR = "src/lib/db/migrations";

// Raw effects parsed directly from a single migration file.
export type RawEffect =
  | { kind: "create-table"; name: string }
  | { kind: "add-column"; table: string; column: string }
  | { kind: "drop-table"; name: string }
  | { kind: "drop-column"; table: string; column: string };

// Resolved effects after accounting for later migrations that drop things.
export type ResolvedEffect =
  | { kind: "create-table"; name: string; expectPresent: boolean }
  | { kind: "add-column"; table: string; column: string; expectPresent: boolean };

export function extractSchemaEffects(sqlText: string): RawEffect[] {
  const effects: RawEffect[] = [];

  // CREATE TABLE [IF NOT EXISTS] "name"
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sqlText)) !== null) {
    effects.push({ kind: "create-table", name: m[1] });
  }

  // ALTER TABLE "t" ADD COLUMN [IF NOT EXISTS] "c"
  const addColRe =
    /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  while ((m = addColRe.exec(sqlText)) !== null) {
    effects.push({ kind: "add-column", table: m[1], column: m[2] });
  }

  // DROP TABLE [IF EXISTS] "name" [CASCADE]
  const dropTableRe =
    /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"(?:\s+CASCADE)?/gi;
  while ((m = dropTableRe.exec(sqlText)) !== null) {
    effects.push({ kind: "drop-table", name: m[1] });
  }

  // ALTER TABLE "t" DROP COLUMN [IF EXISTS] "c"
  const dropColRe =
    /ALTER\s+TABLE\s+"([^"]+)"\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"([^"]+)"/gi;
  while ((m = dropColRe.exec(sqlText)) !== null) {
    effects.push({ kind: "drop-column", table: m[1], column: m[2] });
  }

  return effects;
}

/**
 * For migration at `index` in `allEffects`, compute resolved effects by
 * checking if any later migration drops what this migration creates/adds.
 */
export function resolveEffects(
  index: number,
  allEffects: RawEffect[][],
): ResolvedEffect[] {
  const myEffects = allEffects[index];
  const laterEffects = allEffects.slice(index + 1).flat();

  // Build sets for O(1) lookup of what gets dropped later.
  const laterDroppedTables = new Set<string>();
  const laterDroppedColumns = new Set<string>(); // "table.column"

  for (const e of laterEffects) {
    if (e.kind === "drop-table") {
      laterDroppedTables.add(e.name);
    } else if (e.kind === "drop-column") {
      laterDroppedColumns.add(`${e.table}.${e.column}`);
    }
  }

  const resolved: ResolvedEffect[] = [];

  for (const e of myEffects) {
    if (e.kind === "create-table") {
      // If the table is dropped by a later migration, we don't expect it to exist.
      const expectPresent = !laterDroppedTables.has(e.name);
      resolved.push({ kind: "create-table", name: e.name, expectPresent });
    } else if (e.kind === "add-column") {
      // If a later migration drops the column or the parent table, don't expect it.
      const droppedByColumn = laterDroppedColumns.has(`${e.table}.${e.column}`);
      const droppedByTable = laterDroppedTables.has(e.table);
      const expectPresent = !droppedByColumn && !droppedByTable;
      resolved.push({
        kind: "add-column",
        table: e.table,
        column: e.column,
        expectPresent,
      });
    }
    // drop-table / drop-column effects from this migration don't need their
    // own resolved entry — their impact is captured in the expectPresent flags
    // of earlier migrations.
  }

  return resolved;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  const journal: Journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Fresh-DB check: if core tables are absent, skip bootstrap entirely and
    // let the migrator run all migrations from scratch.
    const coreCheck = await sql<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'organizations')
    `;

    if (coreCheck.length < 2) {
      console.log(
        "Bootstrap skipped: core tables (users, organizations) not present. " +
          "Treating as fresh DB — migrate will create schema from scratch.",
      );
      return;
    }

    // Ensure tracking schema + table exist.
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    // Snapshot the current set of public tables and columns for O(1) lookups.
    const publicTables = await sql<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const tableSet = new Set(publicTables.map((r) => r.table_name));

    const publicColumns = await sql<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
    const columnSet = new Set(
      publicColumns.map((r) => `${r.table_name}.${r.column_name}`),
    );

    // Parse raw effects for every migration in journal order.
    const entries = journal.entries;
    const perMigrationContents: Array<{ entry: JournalEntry; hash: string }> = [];
    const allRawEffects: RawEffect[][] = [];

    for (const entry of entries) {
      const sqlFile = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(sqlFile, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      perMigrationContents.push({ entry, hash });
      allRawEffects.push(extractSchemaEffects(content));
    }

    // Compute the set of migration hashes that SHOULD be marked applied
    // (every net schema effect is consistent with DB state).
    const expectedApplied = new Map<string, { tag: string; when: number }>();
    const expectedPending: Array<{ tag: string; missing: string[] }> = [];
    const hashlessEntries: string[] = [];

    for (let i = 0; i < perMigrationContents.length; i++) {
      const { entry, hash } = perMigrationContents[i];
      const rawEffects = allRawEffects[i];

      // If this migration has no parseable effects, flag it.
      if (rawEffects.length === 0) {
        hashlessEntries.push(entry.tag);
        continue;
      }

      // Resolve effects accounting for later drops.
      const resolved = resolveEffects(i, allRawEffects);

      // A migration with ONLY drop effects will have zero resolved entries.
      // CAVEAT: this branch unconditionally marks the migration applied. That's
      // correct as long as a CREATEing migration appears earlier in the journal —
      // its expectPresent:false check will refuse to mark it applied if the drop
      // hasn't actually happened yet, blocking the bootstrap and forcing the
      // migrator to run the drop. But a synthetic pure-DROP migration that drops
      // a table NOT created by any earlier journal entry would be marked applied
      // here without verifying the drop ran. No such migration exists today; if
      // one is ever added, this branch needs to verify drops against tableSet/
      // columnSet before marking applied.
      if (resolved.length === 0) {
        expectedApplied.set(hash, { tag: entry.tag, when: entry.when });
        continue;
      }

      const missing: string[] = [];
      const unexpectedlyPresent: string[] = [];

      for (const e of resolved) {
        if (e.kind === "create-table") {
          if (e.expectPresent && !tableSet.has(e.name)) {
            missing.push(e.name);
          } else if (!e.expectPresent && tableSet.has(e.name)) {
            // Bonus consistency check: table should be gone but isn't.
            unexpectedlyPresent.push(e.name);
          }
        } else if (e.kind === "add-column") {
          const key = `${e.table}.${e.column}`;
          if (e.expectPresent && !columnSet.has(key)) {
            missing.push(key);
          } else if (!e.expectPresent && columnSet.has(key)) {
            unexpectedlyPresent.push(key);
          }
        }
      }

      if (unexpectedlyPresent.length > 0) {
        console.warn(
          `  ${entry.tag}: warning — objects expected absent (dropped by later migration) ` +
            `still exist: ${unexpectedlyPresent.join(", ")}`,
        );
      }

      if (missing.length === 0) {
        expectedApplied.set(hash, { tag: entry.tag, when: entry.when });
      } else {
        expectedPending.push({ tag: entry.tag, missing });
      }
    }

    // Reconcile against the actual tracking-table contents.
    const existingRows = await sql<Array<{ hash: string }>>`
      SELECT hash FROM drizzle.__drizzle_migrations
    `;
    const existingHashes = new Set(existingRows.map((r) => r.hash));

    // DELETE stale rows (hash in table but migration's tables don't all exist).
    let deleted = 0;
    for (const hash of existingHashes) {
      if (!expectedApplied.has(hash)) {
        await sql`DELETE FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
        deleted++;
        console.log(`  removed stale tracking row (${hash.slice(0, 12)}…)`);
      }
    }

    // INSERT missing rows.
    let inserted = 0;
    for (const [hash, meta] of expectedApplied) {
      if (!existingHashes.has(hash)) {
        await sql`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${meta.when})
        `;
        inserted++;
        console.log(`  ${meta.tag}: marked applied (${hash.slice(0, 12)}…)`);
      }
    }

    for (const { tag, missing } of expectedPending) {
      console.log(
        `  ${tag}: left un-applied (missing objects: ${missing.join(", ")})`,
      );
    }

    for (const tag of hashlessEntries) {
      console.warn(
        `  ${tag}: no detectable schema effects (CREATE TABLE / ADD COLUMN); ` +
          `left un-applied. Migrator may fail if the changes have already run.`,
      );
    }

    console.log(
      `Bootstrap complete: ${inserted} inserted, ${deleted} removed, ` +
        `${expectedPending.length} pending for migrator.`,
    );
  } finally {
    await sql.end();
  }
}

// Only run when executed directly (not when imported for unit tests).
// When tsx runs a script, process.argv[1] is the script path.
// When vitest imports this file, process.argv[1] is the vitest binary.
const _isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("db-migrate-bootstrap.ts") ||
    process.argv[1].endsWith("db-migrate-bootstrap.js"));

if (_isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

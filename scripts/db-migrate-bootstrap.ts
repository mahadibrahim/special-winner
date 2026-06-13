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
 *   - reconcile the tracking table authoritatively (in one transaction):
 *       · the table is rewritten to contain exactly the expectedApplied
 *         set, each row carrying its journal `when` as `created_at`
 *       · rows whose hash matches a journal entry with NO parseable effects
 *         → PRESERVE (the migrator's own bookkeeping is the only record the
 *         migration ran; deleting it re-runs the migration — the 2026-06-12
 *         migrate-prod incident)
 *       · rows whose hash matches no current journal entry → DELETE (drift)
 *     This matters because drizzle's migrator selects what to run by the
 *     `created_at` TIMESTAMP, not by hash — a row with the right hash but
 *     a NULL/stale created_at silently makes it re-run every migration.
 *
 * On a truly empty DB (no `users` table) the whole bootstrap is a no-op and
 * the downstream migrator builds schema from scratch.
 *
 * Safe to run on every CI build.
 *
 * Handles six schema-effect shapes per migration:
 *   · CREATE TABLE "name"               → table must exist (unless later dropped)
 *   · ALTER TABLE "t" ADD COLUMN "c"   → column must exist (unless later dropped)
 *   · DROP TABLE "name"                → table should be absent
 *   · ALTER TABLE "t" DROP COLUMN "c"  → column should be absent
 *   · CREATE [UNIQUE] INDEX "i" ON "t" → index must exist (unless later dropped);
 *                                        gates only index-ONLY migrations — for
 *                                        mixed migrations a missing index is a
 *                                        warning, table/column evidence decides
 *   · DROP INDEX "i"                   → resolves earlier creates to expect-absent
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
  | { kind: "drop-column"; table: string; column: string }
  | { kind: "create-index"; name: string; table: string }
  | { kind: "drop-index"; name: string };

// Resolved effects after accounting for later migrations that drop things.
export type ResolvedEffect =
  | { kind: "create-table"; name: string; expectPresent: boolean }
  | { kind: "add-column"; table: string; column: string; expectPresent: boolean }
  | { kind: "create-index"; name: string; expectPresent: boolean };

// Match a SQL identifier in one of four shapes:
//   "name"            (quoted)         → captured by the "quoted" group
//   name              (unquoted)       → captured by the "unquoted" group
//   "schema"."name"   (schema-qual)    → "name" captured by the quoted group; schema discarded
//   schema.name       (schema-qual)    → "name" captured by the unquoted group; schema discarded
//   "schema".name     (mixed)          → "name" captured by the unquoted group; schema discarded
//   schema."name"     (mixed)          → "name" captured by the quoted group; schema discarded
//
// Each invocation of the helper appends ONE pair of capture groups, so a regex
// using two identifiers (e.g. ALTER TABLE t ADD COLUMN c) has 4 capture groups:
// table-quoted, table-unquoted, column-quoted, column-unquoted.
//
// Migration 0029_drop_unused_bookings_tables.sql shipped with unquoted,
// schema-qualified names (`DROP TABLE IF EXISTS public.bookings CASCADE`) which
// the original quote-only regexes silently skipped — bootstrap then left the
// migration "hashless" and drizzle's migrator considered it past-applied
// because a later migration carried a higher `when` (see
// drizzle.__drizzle_migrations comment block below).
const IDENT_GROUPS = `(?:"([^"]+)"|([a-zA-Z_][\\w$]*))`;
const SCHEMA_PREFIX = `(?:(?:"[^"]+"|[a-zA-Z_][\\w$]*)\\.)?`;
const QUAL_IDENT = SCHEMA_PREFIX + IDENT_GROUPS;

export function extractSchemaEffects(sqlText: string): RawEffect[] {
  const effects: RawEffect[] = [];

  // CREATE TABLE [IF NOT EXISTS] [schema.]name
  const createRe = new RegExp(
    `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QUAL_IDENT}`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sqlText)) !== null) {
    effects.push({ kind: "create-table", name: m[1] ?? m[2] });
  }

  // ALTER TABLE [schema.]t ADD COLUMN [IF NOT EXISTS] c
  const addColRe = new RegExp(
    `ALTER\\s+TABLE\\s+${QUAL_IDENT}\\s+ADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT_GROUPS}`,
    "gi",
  );
  while ((m = addColRe.exec(sqlText)) !== null) {
    effects.push({
      kind: "add-column",
      table: m[1] ?? m[2],
      column: m[3] ?? m[4],
    });
  }

  // DROP TABLE [IF EXISTS] [schema.]name [CASCADE]
  const dropTableRe = new RegExp(
    `DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${QUAL_IDENT}(?:\\s+CASCADE)?`,
    "gi",
  );
  while ((m = dropTableRe.exec(sqlText)) !== null) {
    effects.push({ kind: "drop-table", name: m[1] ?? m[2] });
  }

  // ALTER TABLE [schema.]t DROP COLUMN [IF EXISTS] c
  const dropColRe = new RegExp(
    `ALTER\\s+TABLE\\s+${QUAL_IDENT}\\s+DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?${IDENT_GROUPS}`,
    "gi",
  );
  while ((m = dropColRe.exec(sqlText)) !== null) {
    effects.push({
      kind: "drop-column",
      table: m[1] ?? m[2],
      column: m[3] ?? m[4],
    });
  }

  // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] name ON [schema.]table
  // The index name itself is never schema-qualified (it lives in the table's
  // schema), so plain IDENT_GROUPS for the name; QUAL_IDENT for the table.
  // Added after the 2026-06-12 incident: index-only migration 0043 parsed to
  // zero effects, so the reconciler deleted the migrator's tracking row for
  // it and the migrator re-ran it on the next deploy.
  const createIdxRe = new RegExp(
    `CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+NOT\\s+EXISTS\\s+)?${IDENT_GROUPS}\\s+ON\\s+${QUAL_IDENT}`,
    "gi",
  );
  while ((m = createIdxRe.exec(sqlText)) !== null) {
    effects.push({
      kind: "create-index",
      name: m[1] ?? m[2],
      table: m[3] ?? m[4],
    });
  }

  // DROP INDEX [CONCURRENTLY] [IF EXISTS] [schema.]name [CASCADE]
  // (single-name form only — the multi-name `DROP INDEX a, b` shape has never
  // appeared in this repo's migrations; extend if drizzle ever emits it)
  const dropIdxRe = new RegExp(
    `DROP\\s+INDEX\\s+(?:CONCURRENTLY\\s+)?(?:IF\\s+EXISTS\\s+)?${QUAL_IDENT}(?:\\s+CASCADE)?`,
    "gi",
  );
  while ((m = dropIdxRe.exec(sqlText)) !== null) {
    effects.push({ kind: "drop-index", name: m[1] ?? m[2] });
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
  const laterDroppedIndexes = new Set<string>();

  for (const e of laterEffects) {
    if (e.kind === "drop-table") {
      laterDroppedTables.add(e.name);
    } else if (e.kind === "drop-column") {
      laterDroppedColumns.add(`${e.table}.${e.column}`);
    } else if (e.kind === "drop-index") {
      laterDroppedIndexes.add(e.name);
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
    } else if (e.kind === "create-index") {
      // Dropped explicitly later, or implicitly via dropping the parent table.
      // CAVEAT (mirrors the pure-DROP caveat above): a later DROP COLUMN of an
      // indexed column also drops the index implicitly — we don't track index
      // column lists, so that shape would false-flag the index as missing.
      // No migration in this repo drops columns today; if one ever does,
      // index effects degrade to a warning for mixed migrations (see the
      // classification loop in main), so only an index-ONLY migration could
      // be affected.
      const expectPresent =
        !laterDroppedIndexes.has(e.name) && !laterDroppedTables.has(e.table);
      resolved.push({ kind: "create-index", name: e.name, expectPresent });
    }
    // drop-table / drop-column / drop-index effects from this migration don't
    // need their own resolved entry — their impact is captured in the
    // expectPresent flags of earlier migrations.
  }

  return resolved;
}

/**
 * Decide what the reconciler does with an existing tracking row.
 *
 *   - "rewrite":  hash is in the verified-applied set → delete-and-reinsert
 *                 with the journal `when` as created_at (fixes stale values)
 *   - "preserve": hash belongs to a journal entry with NO parseable effects.
 *                 The migrator's own bookkeeping is the only record that the
 *                 migration ran — deleting it would make the migrator re-run
 *                 the migration on the next deploy (the 2026-06-12 incident:
 *                 index-only 0043 was re-run and died on "already exists").
 *                 Keep the row; created_at is reconciled in place.
 *   - "delete":   hash matches no current journal entry → true drift.
 */
export function planExistingRowAction(
  rowHash: string,
  expectedApplied: Map<string, { tag: string; when: number }>,
  hashlessByHash: Map<string, { tag: string; when: number }>,
): "rewrite" | "preserve" | "delete" {
  if (expectedApplied.has(rowHash)) return "rewrite";
  if (hashlessByHash.has(rowHash)) return "preserve";
  return "delete";
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

    const publicIndexes = await sql<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;
    const indexSet = new Set(publicIndexes.map((r) => r.indexname));

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
    const hashlessByHash = new Map<string, { tag: string; when: number }>();

    for (let i = 0; i < perMigrationContents.length; i++) {
      const { entry, hash } = perMigrationContents[i];
      const rawEffects = allRawEffects[i];

      // If this migration has no parseable effects, flag it. Its hash is kept
      // so the reconciler can PRESERVE (not delete) a tracking row the
      // migrator wrote for it.
      if (rawEffects.length === 0) {
        hashlessEntries.push(entry.tag);
        hashlessByHash.set(hash, { tag: entry.tag, when: entry.when });
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
      const missingIndexes: string[] = [];
      const unexpectedlyPresent: string[] = [];
      let hasStrongEffects = false; // any table/column effect, regardless of state

      for (const e of resolved) {
        if (e.kind === "create-table") {
          hasStrongEffects = true;
          if (e.expectPresent && !tableSet.has(e.name)) {
            missing.push(e.name);
          } else if (!e.expectPresent && tableSet.has(e.name)) {
            // Bonus consistency check: table should be gone but isn't.
            unexpectedlyPresent.push(e.name);
          }
        } else if (e.kind === "add-column") {
          hasStrongEffects = true;
          const key = `${e.table}.${e.column}`;
          if (e.expectPresent && !columnSet.has(key)) {
            missing.push(key);
          } else if (!e.expectPresent && columnSet.has(key)) {
            unexpectedlyPresent.push(key);
          }
        } else if (e.kind === "create-index") {
          if (e.expectPresent && !indexSet.has(e.name)) {
            missingIndexes.push(`index:${e.name}`);
          } else if (!e.expectPresent && indexSet.has(e.name)) {
            unexpectedlyPresent.push(`index:${e.name}`);
          }
        }
      }

      if (unexpectedlyPresent.length > 0) {
        console.warn(
          `  ${entry.tag}: warning — objects expected absent (dropped by later migration) ` +
            `still exist: ${unexpectedlyPresent.join(", ")}`,
        );
      }

      // Index presence gates ONLY index-only migrations. For mixed migrations
      // the table/column evidence decides: if those all exist, the migration
      // ran, and a missing index is drift to surface — NOT a reason to mark
      // the migration pending, which would delete its tracking row and make
      // the migrator re-run a possibly non-idempotent CREATE TABLE against a
      // live database.
      if (hasStrongEffects && missing.length === 0 && missingIndexes.length > 0) {
        console.warn(
          `  ${entry.tag}: warning — tables/columns verify as applied but ` +
            `expected indexes are missing (drift?): ${missingIndexes.join(", ")}`,
        );
      }

      const gating = hasStrongEffects ? missing : [...missing, ...missingIndexes];

      if (gating.length === 0) {
        expectedApplied.set(hash, { tag: entry.tag, when: entry.when });
      } else {
        expectedPending.push({ tag: entry.tag, missing: gating });
      }
    }

    // ── Reconcile drizzle.__drizzle_migrations ────────────────────────
    // CRITICAL: drizzle's migrator (pg-core dialect) decides what to run
    // PURELY by the `created_at` timestamp — it runs every migration
    // whose journal `when` is greater than MAX(created_at) in this
    // table. It never compares hashes. So a row that exists with the
    // right hash but a NULL or stale `created_at` silently makes the
    // migrator re-run every migration from 0000 (which then fails on
    // "type/table already exists").
    //
    // The previous reconcile keyed only on `hash` ("does a row with this
    // hash exist?") and skipped otherwise — leaving bad `created_at`
    // values in place. We now reconcile authoritatively on BOTH columns:
    // the table is rewritten to contain exactly the expectedApplied set,
    // each row carrying its journal `when` as `created_at`.
    const existingRows = await sql<Array<{ hash: string; created_at: string | null }>>`
      SELECT hash, created_at FROM drizzle.__drizzle_migrations
    `;

    // Safety guard: core tables exist (checked above) but we resolved
    // ZERO applied migrations — that means the schema-effect parser
    // failed to recognise a populated DB, not that the DB is unmigrated.
    // Rewriting the table here would wipe valid tracking and make the
    // migrator re-run everything against a live database. Abort instead.
    if (expectedApplied.size === 0) {
      console.error(
        "Bootstrap ABORTED: core tables are present but zero migrations " +
          "resolved as applied. Refusing to rewrite the tracking table — " +
          "that would make the migrator re-run every migration against a " +
          "populated database. Investigate the effect parser before retrying.",
      );
      process.exit(1);
    }

    let deleted = 0;
    let written = 0;
    let preserved = 0;

    await sql.begin(async (txRaw) => {
      // The `postgres` lib types TransactionSql as Omit<Sql, …>, which
      // (a known TS quirk) drops the callable tagged-template signature.
      // It IS callable at runtime — re-alias to the base Sql type.
      const tx = txRaw as unknown as typeof sql;

      // Rows not in the expected-applied set are either (a) bookkeeping the
      // migrator wrote for a migration we can't parse — PRESERVE those, the
      // row is the only record the migration ran (deleting one caused the
      // 2026-06-12 migrate-prod failure: index-only 0043 was re-run and died
      // on "already exists") — or (b) true drift → delete.
      for (const r of existingRows) {
        const action = planExistingRowAction(r.hash, expectedApplied, hashlessByHash);
        if (action === "rewrite") continue; // handled in the write loop below
        if (action === "preserve") {
          const meta = hashlessByHash.get(r.hash)!;
          if (String(r.created_at) !== String(meta.when)) {
            await tx`
              UPDATE drizzle.__drizzle_migrations
              SET created_at = ${meta.when}
              WHERE hash = ${r.hash}
            `;
            console.log(
              `  ${meta.tag}: preserved migrator-written row (unverifiable effects), ` +
                `created_at reconciled → ${meta.when}`,
            );
          } else {
            console.log(
              `  ${meta.tag}: preserved migrator-written row (unverifiable effects)`,
            );
          }
          preserved++;
          continue;
        }
        await tx`DELETE FROM drizzle.__drizzle_migrations WHERE hash = ${r.hash}`;
        deleted++;
        console.log(`  removed stale tracking row (${r.hash.slice(0, 12)}…)`);
      }

      // Authoritatively (re)write every expected row with the correct
      // created_at. DELETE-then-INSERT so a pre-existing row with a
      // NULL/stale created_at is corrected rather than left untouched.
      for (const [hash, meta] of expectedApplied) {
        const existing = existingRows.find((r) => r.hash === hash);
        const needsFix =
          !existing || String(existing.created_at) !== String(meta.when);
        await tx`DELETE FROM drizzle.__drizzle_migrations WHERE hash = ${hash}`;
        await tx`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${hash}, ${meta.when})
        `;
        written++;
        if (needsFix) {
          console.log(
            `  ${meta.tag}: created_at reconciled → ${meta.when} ` +
              `(${hash.slice(0, 12)}…)`,
          );
        }
      }
    });

    for (const { tag, missing } of expectedPending) {
      console.log(
        `  ${tag}: left un-applied (missing objects: ${missing.join(", ")})`,
      );
    }

    for (const tag of hashlessEntries) {
      console.warn(
        `  ${tag}: no detectable schema effects (tables/columns/indexes); ` +
          `cannot verify against the DB. An existing tracking row is preserved; ` +
          `without one the migrator will (re-)run it — write such migrations ` +
          `idempotently.`,
      );
    }

    console.log(
      `Bootstrap complete: ${written} rows written (created_at reconciled), ` +
        `${preserved} preserved, ${deleted} stale removed, ` +
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

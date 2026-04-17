/**
 * Idempotent reconciler for drizzle.__drizzle_migrations on databases that
 * were previously managed by `drizzle-kit push` (or that inherited a stale
 * tracking state from an earlier broken bootstrap).
 *
 * Algorithm per committed migration in src/lib/db/migrations:
 *   - parse every `CREATE TABLE "name"` statement from the file
 *   - check whether every one of those tables exists in the target DB
 *   - compute the expected "applied" state from that existence check
 *   - reconcile the tracking table:
 *       · missing expected rows → INSERT (hash, created_at)
 *       · rows for hashes whose tables don't all exist → DELETE (drift)
 *
 * On a truly empty DB (no `users` table) the whole bootstrap is a no-op and
 * the downstream migrator builds schema from scratch.
 *
 * Safe to run on every CI build.
 *
 * Limitation: a migration that only ALTERs existing tables (no CREATE TABLE)
 * can't be detected this way. None of the current migrations fit that shape.
 * If one is added later, a smarter detector will be needed.
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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const MIGRATIONS_DIR = "src/lib/db/migrations";

function extractCreatedTables(sqlText: string): string[] {
  // Matches: CREATE TABLE "name" ... (ignores IF NOT EXISTS variants too).
  const regex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sqlText)) !== null) {
    names.push(m[1]);
  }
  return names;
}

async function main() {
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  const journal: Journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  const sql = postgres(connectionString!, { max: 1 });

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

    // Snapshot the current set of public tables for O(1) lookups.
    const publicTables = await sql<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const tableSet = new Set(publicTables.map((r) => r.table_name));

    // Compute the set of migration hashes that SHOULD be marked applied
    // (every CREATE TABLE target already present in public).
    const expectedApplied = new Map<string, { tag: string; when: number }>();
    const expectedPending: Array<{ tag: string; missing: string[] }> = [];
    const hashlessEntries: string[] = [];

    for (const entry of journal.entries) {
      const sqlFile = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(sqlFile, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");
      const createdTables = extractCreatedTables(content);

      if (createdTables.length === 0) {
        hashlessEntries.push(entry.tag);
        continue;
      }

      const missing = createdTables.filter((t) => !tableSet.has(t));
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
        `  ${tag}: left un-applied (missing tables: ${missing.join(", ")})`,
      );
    }

    for (const tag of hashlessEntries) {
      console.warn(
        `  ${tag}: no CREATE TABLE statements found; left un-applied. ` +
          `Migrator may fail if the ALTERs have already run.`,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

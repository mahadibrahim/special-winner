/**
 * Idempotent bootstrap for databases previously managed by `drizzle-kit push`
 * that are missing the drizzle migration tracking table (or have it empty).
 *
 * For each committed migration in src/lib/db/migrations:
 *   - parse every `CREATE TABLE "name"` statement from the file
 *   - check whether every one of those tables already exists in the target DB
 *   - if yes → mark that migration applied (insert hash + created_at row)
 *   - if any are missing → leave it un-applied; the subsequent `drizzle-orm`
 *     migrator will run it normally
 *
 * This lets us handle mixed states: a DB that was previously pushed up to,
 * say, migration 0001 but hasn't seen 0002/0003 yet. Only migrations whose
 * CREATE TABLE targets all exist are treated as "already applied."
 *
 * Safe to run every build. On a truly empty DB (no `users` table) the whole
 * bootstrap is a no-op and the downstream migrator builds schema from scratch.
 *
 * Limitation: a migration that only ALTERs existing tables (no CREATE TABLE)
 * can't be detected this way. None of the current migrations fit that shape.
 * If one is added later, a smarter check will be needed.
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
    // If the tracking table already has rows, trust it and don't touch
    // anything. Users can wipe rows manually to force a re-bootstrap.
    const existingRows = await sql<Array<{ hash: string }>>`
      SELECT hash FROM drizzle.__drizzle_migrations
    `.catch(() => null);

    if (existingRows && existingRows.length > 0) {
      console.log(
        `Bootstrap skipped: drizzle.__drizzle_migrations already has ${existingRows.length} row(s).`,
      );
      return;
    }

    // Check for core schema presence. Absent = fresh DB, skip bootstrap.
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

    // Pull every user table in the public schema for O(1) lookups.
    const publicTables = await sql<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `;
    const tableSet = new Set(publicTables.map((r) => r.table_name));

    // Make sure the tracking table exists (safe on re-run).
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    let markedApplied = 0;
    let leftPending = 0;
    for (const entry of journal.entries) {
      const sqlFile = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(sqlFile, "utf-8");
      const createdTables = extractCreatedTables(content);

      if (createdTables.length === 0) {
        // No CREATE TABLE in this migration (ALTER-only or similar). We can't
        // safely decide whether it's been applied — leave it for migrate, but
        // warn so the maintainer notices.
        console.warn(
          `  ${entry.tag}: no CREATE TABLE statements found; leaving un-applied. ` +
            `Migrator may fail if the ALTERs have already run.`,
        );
        leftPending++;
        continue;
      }

      const allPresent = createdTables.every((t) => tableSet.has(t));
      if (!allPresent) {
        const missing = createdTables.filter((t) => !tableSet.has(t));
        console.log(
          `  ${entry.tag}: leaving un-applied (missing tables: ${missing.join(", ")})`,
        );
        leftPending++;
        continue;
      }

      const hash = crypto.createHash("sha256").update(content).digest("hex");
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
      `;
      markedApplied++;
      console.log(`  ${entry.tag}: marked applied (${hash.slice(0, 12)}…)`);
    }

    console.log(
      `Bootstrap complete: ${markedApplied} marked applied, ${leftPending} left for migrator.`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

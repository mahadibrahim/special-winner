/**
 * One-time idempotent bootstrap for databases previously managed by
 * `drizzle-kit push` that are missing the drizzle migration tracking
 * table. Seeds drizzle.__drizzle_migrations with the hashes of every
 * migration currently in src/lib/db/migrations so that a subsequent
 * `drizzle-orm/migrator#migrate()` call sees them as already applied
 * and only runs genuinely new migrations.
 *
 * Safety: bootstrap only runs when
 *   1. the __drizzle_migrations table is missing OR empty, AND
 *   2. the target DB appears to already have the committed schema
 *      (core `users` and `organizations` tables exist)
 *
 * A fresh/empty DB (no users table) is left alone — running migrate on
 * that is the correct path and must not be short-circuited.
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

async function main() {
  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  const journal: Journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));

  const sql = postgres(connectionString!, { max: 1 });

  try {
    // Does the migration-tracking table already have rows?
    const existing = await sql<Array<{ hash: string }>>`
      SELECT hash FROM drizzle.__drizzle_migrations
    `.catch(() => null);

    if (existing && existing.length > 0) {
      console.log(
        `Bootstrap skipped: drizzle.__drizzle_migrations already has ${existing.length} row(s).`,
      );
      return;
    }

    // Does this look like an already-provisioned DB?
    const coreCheck = await sql<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'organizations')
    `;

    const hasCore = coreCheck.length === 2;
    if (!hasCore) {
      console.log(
        "Bootstrap skipped: core tables (users, organizations) not present. " +
          "Treating as fresh DB — migrate will create schema from scratch.",
      );
      return;
    }

    // Make sure the schema + table exist (creating them doesn't destroy data).
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    // Seed one row per journal entry.
    let inserted = 0;
    for (const entry of journal.entries) {
      const sqlFile = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(sqlFile, "utf-8");
      const hash = crypto.createHash("sha256").update(content).digest("hex");

      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
      `;
      inserted++;
      console.log(`  marked applied: ${entry.tag} (${hash.slice(0, 12)}…)`);
    }

    console.log(`Bootstrap complete: ${inserted} migration(s) marked applied.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

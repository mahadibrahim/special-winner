/**
 * Apply committed drizzle migrations to the target database.
 *
 * Hand-rolled per-file-transaction runner — NOT drizzle-orm's `migrate()`.
 *
 * Why: drizzle-orm's `postgres-js` migrator (see
 * `node_modules/drizzle-orm/pg-core/dialect.js`, `PgDialect.migrate`) wraps
 * every *pending* migration file in ONE `session.transaction(...)`:
 *
 *   await session.transaction(async (tx) => {
 *     for await (const migration of migrations) {
 *       if (pending) {
 *         for (const stmt of migration.sql) await tx.execute(sql.raw(stmt));
 *         await tx.execute(insert-into-migrations-table);
 *       }
 *     }
 *   });
 *
 * On a from-scratch DB (exactly what CI's ephemeral Postgres container is,
 * and what the *first* deploy of any PR is against prod) that means the
 * FULL migration history plus every new file in the PR lands in one
 * transaction — not one transaction per file. Concretely, this makes it
 * impossible for one migration to *use* an enum value (compare, assign,
 * cast) added by an earlier migration: Postgres refuses "unsafe use of new
 * value" for an enum value added earlier in the SAME transaction, even
 * across statements, even across files, as long as they're batched
 * together. Splitting an enum-add and its use into `NNNN`/`NNNN+1` files
 * does NOT fix this when both are new/pending in the same run — see
 * `.superpowers/sdd/payment-task-1-report.md` for the empirical proof and
 * the resulting ban on enum-value-using migrations.
 *
 * This runner applies each journal-listed migration FILE in its own
 * transaction, so a later file can safely use an enum value a strictly
 * earlier file added (that earlier file's ADD VALUE is already committed
 * by the time the later file's transaction opens). Statements WITHIN one
 * file remain one transaction (unchanged) — the "--> statement-breakpoint"
 * splitting is per-file exactly as before, just no longer coalesced across
 * files.
 *
 * Bookkeeping compatibility: the tracking table
 * (`drizzle.__drizzle_migrations`, columns `id serial primary key, hash
 * text not null, created_at bigint`) and the row shape written per applied
 * migration (`hash` = sha256 of the full raw .sql file content, `created_at`
 * = the migration's journal `when` in ms) are IDENTICAL to what drizzle's
 * own migrate() writes — we reuse `readMigrationFiles` from
 * `drizzle-orm/migrator` verbatim for the hash/split logic instead of
 * reimplementing it, so there is zero drift risk. This means migration
 * history is byte-compatible in both directions: a DB partially migrated
 * by the OLD drizzle migrate() and finished by this runner (or vice versa)
 * reconciles correctly — this runner determines "pending" by checking
 * whether a row with a migration's exact hash already exists (not by
 * drizzle's coarser "is journal `when` greater than the single latest
 * `created_at` row" watermark check), which is a superset-safe read of the
 * same bookkeeping table.
 *
 * Failure semantics (unchanged goal, finer granularity): if a file's
 * transaction fails partway through, ONLY that file's statements roll
 * back — every strictly-earlier pending file in this run already committed
 * and stays applied. The runner stops immediately (does not attempt later
 * files). Re-running is safe: already-applied files (by hash) are skipped,
 * and the failed file is retried from its own first statement.
 *
 * For an already-provisioned DB that was previously managed via push
 * (no __drizzle_migrations rows), run `db:migrate:bootstrap` first.
 */
import fs from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";

// Overridable only for the scratch enum-add-then-use / mixed-history proofs
// (see .superpowers/sdd/migration-runner-report.md) run against a synthetic
// folder outside src/lib/db/migrations. Unset in every real environment —
// dev, CI, and prod all get the hardcoded default.
const MIGRATIONS_FOLDER = process.env.DB_MIGRATE_FOLDER_OVERRIDE ?? "./src/lib/db/migrations";
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

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

interface TrackedMigration {
  sql: string[];
  bps: boolean;
  folderMillis: number;
  hash: string;
}

interface ExistingRow {
  hash: string;
  created_at: string | null;
}

/**
 * Non-blank statement chunks for one migration file, in file order. Mirrors
 * drizzle's own split-and-execute loop (`migration.sql.map(stmt =>
 * tx.execute(sql.raw(stmt)))`) — we additionally skip whitespace-only
 * chunks (a trailing "--> statement-breakpoint" with nothing after it would
 * otherwise send an empty statement to Postgres). No migration in this
 * repo's history produces one today; this is defensive for future files.
 */
export function statementsToRun(migration: Pick<TrackedMigration, "sql">): string[] {
  return migration.sql.filter((stmt) => stmt.trim().length > 0);
}

/**
 * Which journal-listed migrations still need to run against this target,
 * given the hashes already present in drizzle.__drizzle_migrations.
 *
 * Deliberately hash-based (not drizzle's single-row "journal `when` greater
 * than MAX(created_at)" watermark) — see the file header. Order is
 * preserved (journal / file order), which is also application order.
 */
export function pendingMigrations(
  migrations: TrackedMigration[],
  appliedHashes: ReadonlySet<string>,
): TrackedMigration[] {
  return migrations.filter((m) => !appliedHashes.has(m.hash));
}

function readJournal(): Journal {
  const journalPath = path.join(MIGRATIONS_FOLDER, "meta", "_journal.json");
  return JSON.parse(fs.readFileSync(journalPath, "utf-8"));
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  console.log("Applying migrations from src/lib/db/migrations …");

  // readMigrationFiles is drizzle-orm's own journal-driven loader: same
  // statement-breakpoint split, same sha256-of-raw-file hash, same
  // folderMillis (journal `when`) — reused verbatim so our bookkeeping
  // stays byte-compatible with what drizzle's migrate() would record.
  const migrations = readMigrationFiles({
    migrationsFolder: MIGRATIONS_FOLDER,
  }) as TrackedMigration[];
  const journal = readJournal();
  if (journal.entries.length !== migrations.length) {
    // Should be structurally impossible (readMigrationFiles builds its
    // array by iterating the same journal), but guard rather than log
    // misleading tags if it ever drifts.
    console.error(
      `Journal/migration count mismatch: journal has ${journal.entries.length} entries, ` +
        `readMigrationFiles returned ${migrations.length}.`,
    );
    process.exit(1);
  }
  const tags = journal.entries.map((e) => e.tag);

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Byte-identical to drizzle's PgDialect.migrate() setup so a DB that
    // mixes old-runner and new-runner history sees the same schema/table.
    await sql`CREATE SCHEMA IF NOT EXISTS ${sql(MIGRATIONS_SCHEMA)}`;
    await sql`
      CREATE TABLE IF NOT EXISTS ${sql(MIGRATIONS_SCHEMA)}.${sql(MIGRATIONS_TABLE)} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    const existingRows = await sql<ExistingRow[]>`
      SELECT hash, created_at
      FROM ${sql(MIGRATIONS_SCHEMA)}.${sql(MIGRATIONS_TABLE)}
    `;
    const appliedHashes = new Set(existingRows.map((r) => r.hash));

    const pending = pendingMigrations(migrations, appliedHashes);

    if (pending.length === 0) {
      console.log(
        `No pending migrations (${migrations.length} total, all already applied).`,
      );
      return;
    }

    console.log(
      `${pending.length} pending migration(s) of ${migrations.length} total.`,
    );

    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      const tag = tags[i];

      if (appliedHashes.has(migration.hash)) {
        console.log(`  [skip] ${tag} — already applied`);
        continue;
      }

      console.log(`  [apply] ${tag} …`);
      const statements = statementsToRun(migration);

      try {
        await sql.begin(async (txRaw) => {
          // Same TS quirk as db-migrate-bootstrap.ts: postgres-js types
          // TransactionSql without the callable tagged-template signature
          // even though it IS callable at runtime. Re-alias to the base
          // Sql type.
          const tx = txRaw as unknown as typeof sql;
          for (const stmt of statements) {
            await tx.unsafe(stmt);
          }
          await tx`
            INSERT INTO ${sql(MIGRATIONS_SCHEMA)}.${sql(MIGRATIONS_TABLE)}
              ("hash", "created_at")
            VALUES (${migration.hash}, ${migration.folderMillis})
          `;
        });
      } catch (err) {
        console.error(
          `\nMigration ${tag} FAILED — its transaction was rolled back. ` +
            `No changes from this file were applied. Every strictly-earlier ` +
            `pending migration in this run already committed and remains ` +
            `applied. Fix ${tag} and re-run db:migrate — already-applied ` +
            `files will be skipped and this one retried from its first ` +
            `statement.\n`,
        );
        throw err;
      }

      appliedHashes.add(migration.hash);
      console.log(`  [ok]   ${tag}`);
    }

    console.log("Migrations applied.");
  } finally {
    await sql.end();
  }
}

// Only run when executed directly (not when imported for unit tests) —
// same pattern as db-migrate-bootstrap.ts. When tsx runs a script,
// process.argv[1] is the script path; when vitest imports this file,
// process.argv[1] is the vitest binary.
const _isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("db-migrate.ts") || process.argv[1].endsWith("db-migrate.js"));

if (_isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

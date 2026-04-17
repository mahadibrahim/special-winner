/**
 * Apply committed drizzle migrations to the target database.
 *
 * Non-interactive replacement for `drizzle-kit push` in CI. Uses the
 * drizzle-orm migrator which tracks applied migrations in
 * drizzle.__drizzle_migrations and is idempotent: re-running on an
 * up-to-date DB is a no-op.
 *
 * For an already-provisioned DB that was previously managed via push
 * (no __drizzle_migrations rows), run `db:migrate:bootstrap` first.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

async function main() {
  const client = postgres(connectionString!, { max: 1 });
  const db = drizzle(client);

  console.log("Applying migrations from src/lib/db/migrations …");
  await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  console.log("Migrations applied.");

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

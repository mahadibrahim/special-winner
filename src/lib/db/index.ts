import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// Refuse to connect to a prod-DB host from a test runtime. A misconfigured
// local `npm run test:api` was leaking test orgs/locations/sports into
// prod; this is the in-code stop-gap. The check runs only when the
// process is identifiably a test runner (vitest sets process.env.VITEST,
// or NODE_ENV is "test") so production server imports pay no cost.
// Hosts on the denylist must be opt-out-only by changing this code — env
// vars can't disable it from the outside.
const PROD_DB_HOSTS = ["gondola.proxy.rlwy.net"];
if (
  connectionString &&
  (process.env.VITEST || process.env.NODE_ENV === "test")
) {
  const host = (() => {
    try {
      return new URL(connectionString).hostname;
    } catch {
      return "";
    }
  })();
  if (PROD_DB_HOSTS.includes(host)) {
    throw new Error(
      `[db] REFUSED: a test runtime is trying to connect to a prod DB host (${host}). ` +
        `Use 'DATABASE_URL=$STAGING_DATABASE_URL <command>' (or a local Postgres URL) before running tests. ` +
        `If you have a legitimate reason to point tests at this host, edit PROD_DB_HOSTS in src/lib/db/index.ts.`,
    );
  }
}

// Gracefully handle missing DATABASE_URL (e.g., in CI tests)
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (connectionString) {
  // For serverless environments, use a connection pool
  const client = postgres(connectionString, {
    max: 1, // Serverless: limit connections
    idle_timeout: 20,
    // Fail fast on initial connection. The previous 10-second timeout
    // meant a flaky DB stalled the whole request for 10 seconds before
    // erroring. 3 seconds is still long enough to tolerate a slow cold
    // start from Railway but short enough that users see the failure
    // quickly instead of spinning.
    connect_timeout: 3,
    // Keep prepared statements off for serverless — each invocation is a
    // fresh connection pool, so prepared-statement caching has no benefit
    // and just adds a round trip for deallocate.
    prepare: false,
  });

  db = drizzle(client, { schema });
}

export { db };

export type Database = NonNullable<typeof db>;

/**
 * Get the database instance, throwing an error if not available.
 * Use this in code that requires database access.
 */
export function getDb(): Database {
  if (!db) {
    throw new Error("Database not available. Ensure DATABASE_URL is set.");
  }
  return db;
}

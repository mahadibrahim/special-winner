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
  // Pool size. Was hardcoded to 1 ("serverless: limit connections"); now a
  // tunable with a default that actually unlocks concurrent query waves
  // (see `venue-today-perf-fix-report.md`'s Promise.all fixes, which found
  // ~0ms real-world benefit under max:1 because everything serialized on
  // the single connection). 5 matches the largest concurrent DB wave found
  // in the app (`getVenueDayData`'s wave 1: location + games + drop-ins +
  // rentals + resources = 5 queries) — enough for a full wave to run on
  // its own connection each, without going further than the evidence
  // supports. Netlify Functions = many short-lived isolates, each holding
  // its own pool, so N warm isolates * max all draw against Railway's
  // shared max_connections (confirmed 100 on the staging instance, ~10 in
  // use at idle — see db-parallelism-report.md). 5 leaves comfortable
  // headroom (20 concurrent warm isolates before saturating) for this
  // app's traffic profile; tune via DB_POOL_MAX if that changes.
  const poolMax = Number(process.env.DB_POOL_MAX) || 5;

  // For serverless environments, use a connection pool
  const client = postgres(connectionString, {
    max: poolMax,
    idle_timeout: 20,
    // Fail fast on initial connection. The previous 10-second timeout
    // meant a flaky DB stalled the whole request for 10 seconds before
    // erroring. 3 seconds is still long enough to tolerate a slow cold
    // start from Railway but short enough that users see the failure
    // quickly instead of spinning.
    connect_timeout: 3,
    // Prepared statements ON at the connection level. NOTE: this is
    // currently a no-op for every query this app issues, and raising
    // `max` above — not this — is what actually parallelizes query waves.
    // Root-caused while investigating the fix report's suggestion to flip
    // this: drizzle-orm's postgres-js driver (session.js) executes EVERY
    // query — including inside transactions — via `client.unsafe(query,
    // params)`, never the tagged-template `sql` form. postgres.js's
    // `unsafe()` (index.js) hardcodes `{ prepare: false, ...options }` and
    // drizzle never passes an options object, so `q.options.prepare` is
    // always explicitly `false` on every drizzle-issued query. In
    // connection.js's `build()`, `q.prepare = options.prepare &&
    // ('prepare' in q.options ? q.options.prepare : true)` — the
    // CONNECTION-level `true` we set here is short-circuited by the
    // per-query `false` `.unsafe()` always supplies. Verified empirically:
    // a direct `getVenueDayData()` benchmark (5 concurrent parameterized
    // selects, warmed) showed identical ~150ms-apart, fully-serialized
    // per-query SEND timestamps under `max:1` whether this flag was `true`
    // or `false` — see db-parallelism-report.md. Left `true` anyway
    // (harmless — it only matters if this app ever issues raw
    // `sql`-tagged-template queries directly against the client, or if a
    // future drizzle-orm version stops hardcoding the `.unsafe()` options)
    // but do not rely on it for the parallelism win; that's `max` alone.
    prepare: true,
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

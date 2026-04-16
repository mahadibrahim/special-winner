import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

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

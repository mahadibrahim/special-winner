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
    connect_timeout: 10,
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

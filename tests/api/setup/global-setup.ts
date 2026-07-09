import "dotenv/config";
import { beforeAll } from "vitest";
import { assertTestDatabase } from "../../utils/assert-test-database";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4321";

beforeAll(async () => {
  // Refuse to run the API suite against a prod database. The fixture helpers
  // do raw INSERTs against process.env.DATABASE_URL; a prod override here is
  // how test data ("Loc g00dqku7") leaked into prod on 2026-07-08.
  assertTestDatabase();

  try {
    const res = await fetch(`${BASE_URL}/api/auth/session`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Dev server returned ${res.status}`);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot reach dev server at ${BASE_URL}.\n` +
        `Make sure the dev server is running before executing API tests:\n\n` +
        `  npm run dev\n\n` +
        `Or set TEST_BASE_URL to point to your running server.\n\n` +
        `Original error: ${message}`
    );
  }
});

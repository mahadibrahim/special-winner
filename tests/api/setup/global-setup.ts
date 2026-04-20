import "dotenv/config";
import { beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:4321";

beforeAll(async () => {
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

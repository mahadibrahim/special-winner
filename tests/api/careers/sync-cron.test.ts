import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "localtest";

describe("POST /api/cron/sync-notion-applications", () => {
  it("rejects a missing/wrong cron secret", async () => {
    const res = await fetch(`${BASE}/api/cron/sync-notion-applications`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("runs and reports counts (0 synced with Notion env absent)", async () => {
    const res = await fetch(`${BASE}/api/cron/sync-notion-applications`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("attempted");
    expect(body).toHaveProperty("synced");
    expect(body.synced).toBe(0); // Notion unconfigured in CI/dev
  });
});

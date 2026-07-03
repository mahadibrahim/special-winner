import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

describe("POST /api/cron/send-ops-digest", () => {
  it("rejects a bad cron secret", async () => {
    const res = await fetch(`${BASE}/api/cron/send-ops-digest`, {
      method: "POST",
      headers: { "x-cron-secret": "wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("runs and reports org/sent counts", async () => {
    const res = await fetch(`${BASE}/api/cron/send-ops-digest`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.orgs).toBe("number");
    expect(typeof json.sent).toBe("number");
  });
});

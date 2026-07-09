import { describe, it, expect } from "vitest";

const base = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const secret = process.env.CRON_SECRET ?? "test-cron-secret";

describe("POST /api/cron/referee-closeout-reminders", () => {
  it("401s without the cron secret", async () => {
    const res = await fetch(`${base}/api/cron/referee-closeout-reminders`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("runs with the cron secret and returns a summary", async () => {
    const res = await fetch(`${base}/api/cron/referee-closeout-reminders`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("sent");
    expect(body).toHaveProperty("skipped");
  });
});

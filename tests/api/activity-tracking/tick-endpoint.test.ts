import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/cron/tick-activity-tracker";

describe("Cron: POST /api/cron/tick-activity-tracker", () => {
  it("rejects request without cron secret (401)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects request with wrong cron secret (401)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": "definitely-wrong-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("runs tick and returns counts when secret matches", async () => {
    const secret = process.env.CRON_SECRET ?? "";
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const json = await expectJson(res, 200);
    expect(typeof json.processed).toBe("number");
    expect(typeof json.fired).toBe("number");
    expect(typeof json.errors).toBe("number");
    expect(typeof json.elapsedMs).toBe("number");
  });

  it("GET returns description without triggering the job", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.description).toBe("string");
  });
});

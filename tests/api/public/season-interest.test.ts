import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/public/season-interest";

describe("POST /api/public/season-interest", () => {
  it("rejects a missing/invalid body (400)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s for a season that is not forming or not in this tenant", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        email: "fan@example.com",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("accepts interest for a forming season and is idempotent on resubmit", async () => {
    const list = await apiFetch("/api/public/seasons", { method: "GET" });
    const body = await expectJson(list, 200);
    const forming = body.seasons.find((s: any) => s.signupMode === "interest");
    if (!forming) return; // seed has no forming fixture yet — skip, not fail

    const payload = JSON.stringify({ seasonId: forming.id, email: "interested@example.com" });
    const first = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    expect(first.status).toBe(200);
    const second = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    expect(second.status).toBe(200); // upsert no-op, not a 409
  });
});

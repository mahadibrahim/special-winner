import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const CRON_ENDPOINT = "/api/cron/expire-pending-claims";

describe("Cron: POST /api/cron/expire-pending-claims", () => {
  it("rejects request without cron secret (401)", async () => {
    const res = await apiFetch(CRON_ENDPOINT, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects request with wrong cron secret (401)", async () => {
    const res = await apiFetch(CRON_ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": "definitely-wrong-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("runs expiry and returns counts when secret matches", async () => {
    const secret = process.env.CRON_SECRET ?? "";
    const res = await apiFetch(CRON_ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const json = await expectJson(res, 200);
    expect(typeof json.expired).toBe("number");
    expect(typeof json.promotedNext).toBe("number");
    expect(typeof json.elapsedMs).toBe("number");
  });

  it("GET returns description without triggering the job", async () => {
    const res = await apiFetch(CRON_ENDPOINT, { method: "GET" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.description).toBe("string");
  });
});

describe("GET /api/dropin/claim/:token", () => {
  it("returns 404 for unknown token", async () => {
    const res = await apiFetch(
      "/api/dropin/claim/not-a-real-token-1234567890",
      { method: "GET" },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/dropin/claim/:token", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const res = await apiFetch(
      "/api/dropin/claim/not-a-real-token-1234567890",
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });
});

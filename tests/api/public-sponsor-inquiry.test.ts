import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

function post(body: unknown) {
  return fetch(`${BASE}/api/public/sponsor-inquiry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  businessName: "Acme Plumbing",
  contactName: "Pat Acme",
  contactEmail: "pat@acmeplumbing.com",
  tierInterest: "sideline",
  facility: "worthington",
  message: "Interested in a sideline banner at Worthington.",
};

describe("POST /api/public/sponsor-inquiry", () => {
  it("rejects invalid JSON with 400", async () => {
    const res = await fetch(`${BASE}/api/public/sponsor-inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a missing required field with 400", async () => {
    const { businessName: _omit, ...missing } = valid;
    const res = await post(missing);
    expect(res.status).toBe(400);
  });

  it("rejects a malformed email with 400", async () => {
    const res = await post({ ...valid, contactEmail: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-enum tierInterest with 400", async () => {
    const res = await post({ ...valid, tierInterest: "diamond" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid inquiry with 200 {ok:true}", async () => {
    // Email is unconfigured in CI (no RESEND_API_KEY) → soft-success path.
    const res = await post(valid);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

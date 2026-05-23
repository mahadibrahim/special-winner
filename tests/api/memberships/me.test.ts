import { describe, expect, it } from "vitest";
import { getAuthCookie } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Local wrapper mapping conventional test emails to their passwords
// (mirrors tests/api/memberships/subscribe.test.ts).
async function signIn(email: string): Promise<string> {
  const passwordByEmail: Record<string, string> = {
    "parent@test.aspiresports.com": "TestParent123!",
    "member@test.soccerone.com": "TestMember123!",
    "member-pending@test.soccerone.com": "TestMember123!",
  };
  const password = passwordByEmail[email] ?? "TestParent123!";
  return getAuthCookie(email, password);
}

// IMPORTANT: marked .skip until Task 17 seeds the SoccerOne membership
// fixtures (the active-member user + their subscription row). Once those
// land, flip this to `describe(...)`.
describe("GET /api/memberships", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE}/api/memberships`, {
      headers: { host: "soccerone.aspiresports.com" },
    });
    expect(res.status).toBe(401);
  });

  it("returns { membership: null } for an Aspire user", async () => {
    const cookie = await signIn("parent@test.aspiresports.com");
    const res = await fetch(`${BASE}/api/memberships`, {
      headers: { cookie, host: "aspire.local" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membership).toBeNull();
  });

  // Skipped: relies on `host: soccerone…` for tenant resolution but Node's
  // fetch strips Host. Manual / staging verification only.
  it.skip("returns the active membership for the SoccerOne test member", async () => {
    const cookie = await signIn("member@test.soccerone.com");
    const res = await fetch(`${BASE}/api/memberships`, {
      headers: { cookie, host: "soccerone.aspiresports.com" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.membership).not.toBeNull();
    expect(body.membership.tier.benefits.rental_discount_pct).toBeGreaterThan(0);
    expect(["active", "paused", "past_due"]).toContain(body.membership.status);
  });
});

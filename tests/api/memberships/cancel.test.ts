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
describe.skip("POST /api/memberships/cancel", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE}/api/memberships/cancel`, {
      method: "POST",
      headers: { host: "soccerone.aspiresports.com" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the user has no active membership", async () => {
    const cookie = await signIn("parent@test.aspiresports.com");
    const res = await fetch(`${BASE}/api/memberships/cancel`, {
      method: "POST",
      headers: { cookie, host: "aspire.local" },
    });
    expect(res.status).toBe(404);
  });

  it("marks the active SoccerOne membership to cancel at period end", async () => {
    const cookie = await signIn("member@test.soccerone.com");
    const res = await fetch(`${BASE}/api/memberships/cancel`, {
      method: "POST",
      headers: { cookie, host: "soccerone.aspiresports.com" },
    });
    expect([200, 502, 503]).toContain(res.status);
  });
});

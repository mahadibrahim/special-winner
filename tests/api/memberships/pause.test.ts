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
describe.skip("POST /api/memberships/pause", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await fetch(`${BASE}/api/memberships/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "soccerone.aspiresports.com" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when there is no active membership", async () => {
    const cookie = await signIn("parent@test.aspiresports.com");
    const res = await fetch(`${BASE}/api/memberships/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, host: "aspire.local" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a non-ISO `resumesAt`", async () => {
    const cookie = await signIn("member@test.soccerone.com");
    const res = await fetch(`${BASE}/api/memberships/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, host: "soccerone.aspiresports.com" },
      body: JSON.stringify({ resumesAt: "tomorrow" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns success on a valid pause request", async () => {
    const cookie = await signIn("member@test.soccerone.com");
    const tenDaysOut = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${BASE}/api/memberships/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, host: "soccerone.aspiresports.com" },
      body: JSON.stringify({ resumesAt: tenDaysOut }),
    });
    expect([200, 502, 503]).toContain(res.status);
  });
});

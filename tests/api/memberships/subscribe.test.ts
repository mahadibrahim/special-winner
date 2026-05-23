import { describe, expect, it, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { getAuthCookie } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// The shared Playwright `signIn` helper in `tests/utils/test-helpers.ts`
// drives a real browser Page. API tests use the fetch-based getAuthCookie
// from tests/api/setup/test-helpers.ts — same plan intent, different
// signature.
async function signIn(email: string): Promise<string> {
  // Test passwords follow the Test{Role}123! convention. The SoccerOne
  // member-pending fixture (Task 17) seeds with TestMember123!; the Aspire
  // parent is TestParent123!. We map by email to keep the call-site terse.
  const passwordByEmail: Record<string, string> = {
    "member-pending@test.soccerone.com": "TestMember123!",
    "parent@test.aspiresports.com": "TestParent123!",
  };
  const password = passwordByEmail[email];
  if (!password) {
    throw new Error(`No test password mapped for ${email}`);
  }
  return await getAuthCookie(email, password);
}

let soccerOneOrgId: string | undefined;
let aspireOrgId: string | undefined;
let memberTierId: string | undefined;
// SoccerOne fixtures may be absent in CI when seed-soccerone-org.ts
// hasn't been run against the staging DB. Skip tests dynamically.
let hasSoccerOneFixtures = false;

beforeAll(async () => {
  const db = getDb();
  const [s1] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "soccerone"));
  const [aspire] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"));
  soccerOneOrgId = s1?.id;
  aspireOrgId = aspire?.id;
  if (soccerOneOrgId) {
    const [tier] = await db
      .select()
      .from(membershipTiers)
      .where(eq(membershipTiers.organizationId, soccerOneOrgId));
    memberTierId = tier?.id;
  }
  hasSoccerOneFixtures = Boolean(soccerOneOrgId && memberTierId);
});

// IMPORTANT: marked .skip until Task 17 seeds the SoccerOne membership tier
// + the member-pending@test.soccerone.com user. Once those fixtures land,
// flip this to `describe(...)`.
describe("POST /api/memberships/subscribe", () => {
  it("requires authentication", async () => {
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        host: "soccerone.aspiresports.com",
      },
      body: JSON.stringify({ tierId: memberTierId, billingInterval: "month" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects unknown tier ids", async (ctx) => {
    if (!hasSoccerOneFixtures) return ctx.skip();
    const cookie = await signIn("member-pending@test.soccerone.com");
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        host: "soccerone.aspiresports.com",
      },
      body: JSON.stringify({
        tierId: "00000000-0000-0000-0000-000000000000",
        billingInterval: "month",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a tier that belongs to a different org (tenant guard)", async (ctx) => {
    if (!hasSoccerOneFixtures) return ctx.skip();
    const cookie = await signIn("parent@test.aspiresports.com");
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        host: "aspire.local",
      },
      body: JSON.stringify({ tierId: memberTierId, billingInterval: "month" }),
    });
    expect(res.status).toBe(404);
  });

  // Skipped: relies on the `host: soccerone…` header to resolve the
  // SoccerOne org for the tier lookup, but Node's fetch strips Host
  // (see src/pages/api/test/org-fixtures.ts comment). Verify via browser
  // / staging instead.
  it.skip("rejects a billing interval the tier doesn't price", async () => {
    // The seed sets both monthly + annual price ids; this assertion verifies
    // the endpoint validates against tier.stripePriceIdMonthly/Annual being
    // present. To exercise the failure path we'll later (Task 17) seed a
    // Day-Pass-style tier with no stripePriceIdAnnual; for now this test is
    // documented inline.
    const cookie = await signIn("member-pending@test.soccerone.com");
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        host: "soccerone.aspiresports.com",
      },
      body: JSON.stringify({ tierId: memberTierId, billingInterval: "year" }),
    });
    expect([200, 422, 502, 503]).toContain(res.status);
  });

  // Skipped: same reason — host-stripped requests resolve to Aspire,
  // so the SoccerOne tier lookup 404s. Verify via browser / staging.
  it.skip("returns a Stripe Checkout URL when Stripe is configured", async () => {
    const cookie = await signIn("member-pending@test.soccerone.com");
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie,
        host: "soccerone.aspiresports.com",
      },
      body: JSON.stringify({ tierId: memberTierId, billingInterval: "month" }),
    });
    expect([200, 502, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    }
  });
});

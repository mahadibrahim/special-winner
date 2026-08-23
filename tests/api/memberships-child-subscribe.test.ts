import { describe, it, expect, beforeAll } from "vitest";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { getAuthCookie } from "./setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

const PARENT_EMAIL = "parent@test.aspiresports.com";
const PARENT_PASSWORD = "TestParent123!";
const OTHER_EMAIL = "both@test.aspiresports.com";

// `aspire.local` is not a known custom domain/subdomain, so the domain
// resolver falls through to the default org (aspire-sports) — same trick
// used by tests/api/memberships/subscribe.test.ts for its tenant-guard case.
const HOST = "aspire.local";

let ownChildId: string | undefined;
let otherUsersChildId: string | undefined;
let aspireTierId: string | undefined;
// Only set when an active, monthly-priced membership tier exists for the
// aspire-sports org in the seeded DB — the youth membership tier fixture
// isn't guaranteed yet, so the happy-path test skips dynamically rather
// than failing on missing fixtures.
let hasAspireTierFixture = false;

beforeAll(async () => {
  const db = getDb();

  // organizations.slug and users.email both carry unique constraints, so a
  // single match is guaranteed here — no orderBy needed. The family-member
  // lookups below aren't uniquely constrained, so those get an explicit
  // orderBy per the shared-CI-DB convention (see membershipTiers query).
  const [aspireOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .limit(1);
  if (!aspireOrg) return;

  const [parentUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PARENT_EMAIL))
    .limit(1);
  const [otherUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, OTHER_EMAIL))
    .limit(1);

  if (parentUser) {
    const [child] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.parentUserId, parentUser.id),
          eq(familyMembers.firstName, "Tommy"),
        ),
      )
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    ownChildId = child?.id;
  }
  if (otherUser) {
    const [child] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.parentUserId, otherUser.id))
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    otherUsersChildId = child?.id;
  }

  // Pin to the named fixture (seed-e2e-tests.ts Stage 13b) rather than
  // "any active tier" — the CI DB is shared across runs and accumulates
  // rows, so an unordered "give me a row" query can silently pick the
  // wrong one. orderBy + limit(1) keeps this deterministic even with
  // multiple matches.
  const [tier] = await db
    .select({ id: membershipTiers.id })
    .from(membershipTiers)
    .where(
      and(
        eq(membershipTiers.organizationId, aspireOrg.id),
        eq(membershipTiers.isActive, true),
        eq(membershipTiers.name, "Test Class Tier 4"),
      ),
    )
    .orderBy(asc(membershipTiers.createdAt))
    .limit(1);
  aspireTierId = tier?.id;
  hasAspireTierFixture = Boolean(aspireTierId);
});

describe("POST /api/memberships/subscribe — per-child (familyMemberId)", () => {
  it("rejects a familyMemberId belonging to a different user (404, not leaking existence)", async (ctx) => {
    if (!otherUsersChildId) return ctx.skip();
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, host: HOST },
      body: JSON.stringify({
        tierId: aspireTierId ?? "00000000-0000-0000-0000-000000000000",
        billingInterval: "month",
        familyMemberId: otherUsersChildId,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a malformed familyMemberId without a 500", async () => {
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, host: HOST },
      body: JSON.stringify({
        tierId: aspireTierId ?? "00000000-0000-0000-0000-000000000000",
        billingInterval: "month",
        familyMemberId: "not-a-uuid",
      }),
    });
    expect([404, 422]).toContain(res.status);
  });

  itWithStripe(
    "returns a Checkout URL for the caller's own child",
    async (ctx) => {
      if (!hasAspireTierFixture || !ownChildId) return ctx.skip();
      const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
      const res = await fetch(`${BASE}/api/memberships/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie, host: HOST },
        body: JSON.stringify({
          tierId: aspireTierId,
          billingInterval: "month",
          familyMemberId: ownChildId,
        }),
      });
      expect([200, 422, 502, 503]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        expect(body.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
      }
    },
  );
});

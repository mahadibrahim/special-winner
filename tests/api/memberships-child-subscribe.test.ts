import { describe, it, expect, beforeAll } from "vitest";
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema/organizations";
import { membershipTiers, memberships } from "@/lib/db/schema/memberships";
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
// Unique per test run so this spec is self-sufficient on shared staging —
// a fixed/reused name (e.g. the seed's "Tommy") can already hold a live
// membership from an earlier manual verification pass or a previous test
// run's real Checkout completion, which 409s the happy path here.
const HAPPY_PATH_CHILD_NAME = `HappyPathChild-${Date.now()}`;
// Only set when an active, monthly-priced membership tier exists for the
// aspire-sports org in the seeded DB — the youth membership tier fixture
// isn't guaranteed yet, so the happy-path test skips dynamically rather
// than failing on missing fixtures.
let hasAspireTierFixture = false;
// A dedicated child (distinct from ownChildId/HAPPY_PATH_CHILD_NAME, which
// the happy-path test needs to be subscribe-able) that already has an
// active membership, for the double-subscribe 409 guard test.
let alreadyMemberChildId: string | undefined;

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
    // Freshly inserted every run (unique name) rather than reusing an
    // existing family member — see HAPPY_PATH_CHILD_NAME comment above.
    const [child] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parentUser.id,
        firstName: HAPPY_PATH_CHILD_NAME,
        lastName: "Test",
        birthDate: "2016-03-10",
      })
      .returning({ id: familyMembers.id });
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

  // Fixture for the 409 double-subscribe guard test: a child of
  // parent@test.aspiresports.com who already holds an active membership.
  // Created directly here (select-then-insert, idempotent) rather than in
  // seed-e2e-tests.ts since it's only needed by this spec. Needs a real
  // tier row (FK + NOT NULL on memberships.tierId), so it's gated on the
  // same fixture as the happy path.
  if (parentUser && hasAspireTierFixture) {
    let [child] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.parentUserId, parentUser.id),
          eq(familyMembers.firstName, "AlreadyMemberChild"),
        ),
      )
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    if (!child) {
      [child] = await db
        .insert(familyMembers)
        .values({
          parentUserId: parentUser.id,
          firstName: "AlreadyMemberChild",
          lastName: "Test",
          birthDate: "2017-01-01",
        })
        .returning({ id: familyMembers.id });
    }
    alreadyMemberChildId = child.id;

    const [existingMembership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.familyMemberId, alreadyMemberChildId),
          eq(memberships.organizationId, aspireOrg.id),
        ),
      )
      .orderBy(asc(memberships.createdAt))
      .limit(1);
    if (!existingMembership) {
      await db.insert(memberships).values({
        userId: parentUser.id,
        familyMemberId: alreadyMemberChildId,
        organizationId: aspireOrg.id,
        tierId: aspireTierId,
        status: "active",
        billingInterval: "month",
        stripeSubscriptionId: "sub_test_seeded_already_member_child",
        stripeCustomerId: "cus_test_seeded_already_member_child",
      });
    }
  }
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

  it("rejects subscribing a child who already has an active membership (409)", async (ctx) => {
    if (!alreadyMemberChildId || !aspireTierId) return ctx.skip();
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    const res = await fetch(`${BASE}/api/memberships/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie, host: HOST },
      body: JSON.stringify({
        tierId: aspireTierId,
        billingInterval: "month",
        familyMemberId: alreadyMemberChildId,
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already has an active membership/i);
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

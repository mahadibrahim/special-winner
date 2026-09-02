/**
 * Stripe Customer Portal — `POST /api/memberships/billing-portal`, the
 * library it wraps (`src/lib/memberships/billing-portal.ts`), and the
 * customer-resolution rules it depends on (`src/lib/memberships/customer.ts`).
 *
 * Split the same way as tests/api/class-pack-purchase.test.ts: everything
 * that can be asserted without Stripe (auth, the return-path allow-list, the
 * no-customer 404, which customer wins) runs everywhere; every assertion
 * whose shape comes back FROM Stripe is `itWithStripe`-gated, because CI has
 * no STRIPE_SECRET_KEY (the standing CI-has-no-Stripe lesson).
 *
 * FIXTURE SHAPE — it encodes the customer-fan-out bug this endpoint has to
 * survive. Two membership rows are seeded for the test parent:
 *   1. older, `past_due`, pinned to a REAL Stripe customer minted here (the
 *      seeded `cus_test_seeded_*` ids are fake and Stripe rejects them). It
 *      hangs off a throwaway child, so it lands in the per-child partial
 *      unique index on a brand-new key and can never collide with a live
 *      fixture membership on the shared staging DB.
 *   2. newer, `cancelled`, pinned to a DELIBERATELY BOGUS customer id.
 *      `cancelled` sits outside both partial unique indexes, so this row is
 *      collision-proof too.
 * A "newest row wins" resolver would hand Stripe the bogus id and the
 * endpoint would 502 — so the happy path returning 200 is itself the proof
 * that past_due targeting works end to end, on top of the direct resolver
 * assertions below. Everything is torn down in `afterAll`, and `beforeAll`
 * also purges leftovers from a previously crashed run.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { organizations } from "@/lib/db/schema/organizations";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import {
  BILLING_PORTAL_CONFIG_VERSION,
  BILLING_RETURN_PATHS,
  createBillingPortalSession,
  ensureBillingPortalConfiguration,
} from "@/lib/memberships/billing-portal";
import {
  findMembershipStripeCustomerId,
  resolveBillingPortalCustomerId,
} from "@/lib/memberships/customer";
import { membershipsStripe } from "@/lib/memberships/stripe";
import { getAuthCookie } from "./setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

const PARENT_EMAIL = "parent@test.aspiresports.com";
const PARENT_PASSWORD = "TestParent123!";

/** Marks every row this spec creates, so a crashed run self-heals. */
const SPEC_CHILD_PREFIX = "BillingPortalSpecChild";
const SPEC_BOGUS_CUSTOMER_PREFIX = "cus_spec_billingportal_";
const RUN = `${Date.now()}`;

/** Accounts that plausibly hold NO membership with a Stripe customer id.
 *  The first one that actually qualifies (checked against the DB, since the
 *  shared staging DB drifts) drives the 404 case. */
const NO_BILLING_CANDIDATES = [
  { email: "coach@test.aspiresports.com", password: "TestCoach123!" },
  { email: "fresh@test.aspiresports.com", password: "TestFresh123!" },
  { email: "familyonly@test.aspiresports.com", password: "TestFamily123!" },
];

let noBillingAccount: { email: string; password: string } | undefined;
let parentUserId: string | undefined;
/** Rows + child inserted by this spec — all deleted in afterAll. */
const seededMembershipIds: string[] = [];
let seededChildId: string | undefined;
/** Customer on the OLDER past_due row (real when Stripe is configured). */
let pastDueCustomerId: string | undefined;
/** Customer on the NEWER cancelled row — always bogus, never valid at Stripe. */
const newestCustomerId = `${SPEC_BOGUS_CUSTOMER_PREFIX}${RUN}`;
/** Only set when we actually minted a customer at Stripe (cleanup key). */
let realStripeCustomerId: string | undefined;
/** True once both fixture rows exist. */
let fixturesReady = false;

async function postPortal(opts: {
  cookie?: string;
  body?: unknown;
}): Promise<Response> {
  return fetch(`${BASE}/api/memberships/billing-portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: JSON.stringify(opts.body ?? {}),
  });
}

/** The feature set the spec mandates — asserted on EVERY configuration
 *  carrying our metadata, not just the resolved one (see the "created once"
 *  test for why uniqueness itself can't be asserted). */
function expectSpecFeatures(config: Stripe.BillingPortal.Configuration) {
  expect(config.features.payment_method_update.enabled).toBe(true);
  expect(config.features.invoice_history.enabled).toBe(true);
  expect(config.features.subscription_cancel.enabled).toBe(true);
  expect(config.features.subscription_cancel.mode).toBe("at_period_end");
  expect(config.features.subscription_update.enabled).toBe(false);
  expect(config.business_profile.headline).toBeTruthy();
}

/** Delete every membership row + child this spec has ever created for the
 *  test parent — this run's and any orphaned by a crashed earlier run. */
async function purgeSpecFixtures(userId: string) {
  const db = getDb();
  const children = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, userId),
        like(familyMembers.firstName, `${SPEC_CHILD_PREFIX}%`),
      ),
    );
  const childIds = children.map((c) => c.id);
  if (childIds.length > 0) {
    await db.delete(memberships).where(inArray(memberships.familyMemberId, childIds));
    await db.delete(familyMembers).where(inArray(familyMembers.id, childIds));
  }
  await db
    .delete(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        like(memberships.stripeCustomerId, `${SPEC_BOGUS_CUSTOMER_PREFIX}%`),
      ),
    );
}

beforeAll(async () => {
  const db = getDb();

  // organizations.slug and users.email are uniquely constrained — single
  // match guaranteed, no orderBy needed. Every non-unique lookup below gets
  // an explicit orderBy per the shared-DB convention.
  const [aspireOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .limit(1);

  for (const candidate of NO_BILLING_CANDIDATES) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, candidate.email))
      .limit(1);
    if (!user) continue;
    const [withCustomer] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, user.id),
          isNotNull(memberships.stripeCustomerId),
        ),
      )
      .orderBy(desc(memberships.createdAt))
      .limit(1);
    if (!withCustomer) {
      noBillingAccount = candidate;
      break;
    }
  }

  if (!aspireOrg) return;

  const [parentUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PARENT_EMAIL))
    .limit(1);
  const [tier] = await db
    .select({ id: membershipTiers.id })
    .from(membershipTiers)
    .where(eq(membershipTiers.organizationId, aspireOrg.id))
    .orderBy(asc(membershipTiers.createdAt))
    .limit(1);
  if (!parentUser || !tier) return;
  parentUserId = parentUser.id;

  await purgeSpecFixtures(parentUser.id);

  // Real customer only when Stripe is configured; otherwise a placeholder,
  // so the DB-level resolver assertions still run on CI.
  if (stripeConfigured) {
    const customer = await membershipsStripe().customers.create({
      email: PARENT_EMAIL,
      name: "Billing Portal Spec",
      metadata: { aspire_test_fixture: "memberships-billing-portal" },
    });
    realStripeCustomerId = customer.id;
    pastDueCustomerId = customer.id;
  } else {
    pastDueCustomerId = `${SPEC_BOGUS_CUSTOMER_PREFIX}pastdue_${RUN}`;
  }

  const [child] = await db
    .insert(familyMembers)
    .values({
      parentUserId: parentUser.id,
      firstName: `${SPEC_CHILD_PREFIX}-${RUN}`,
      lastName: "Test",
      birthDate: "2016-05-02",
    })
    .returning({ id: familyMembers.id });
  seededChildId = child?.id;

  // OLDER row: past_due, real customer, child-scoped.
  const [pastDueRow] = await db
    .insert(memberships)
    .values({
      userId: parentUser.id,
      familyMemberId: seededChildId,
      organizationId: aspireOrg.id,
      tierId: tier.id,
      status: "past_due",
      billingInterval: "month",
      stripeCustomerId: pastDueCustomerId,
    })
    .returning({ id: memberships.id });
  if (pastDueRow) seededMembershipIds.push(pastDueRow.id);

  // NEWER row: cancelled, bogus customer — the decoy a newest-wins resolver
  // would pick.
  const [newestRow] = await db
    .insert(memberships)
    .values({
      userId: parentUser.id,
      organizationId: aspireOrg.id,
      tierId: tier.id,
      status: "cancelled",
      billingInterval: "month",
      stripeCustomerId: newestCustomerId,
    })
    .returning({ id: memberships.id });
  if (newestRow) seededMembershipIds.push(newestRow.id);

  fixturesReady = seededMembershipIds.length === 2;
});

afterAll(async () => {
  const db = getDb();
  if (seededMembershipIds.length > 0) {
    await db.delete(memberships).where(inArray(memberships.id, seededMembershipIds));
  }
  if (seededChildId) {
    await db.delete(familyMembers).where(eq(familyMembers.id, seededChildId));
  }
  if (realStripeCustomerId) {
    try {
      await membershipsStripe().customers.del(realStripeCustomerId);
    } catch {
      // Best-effort — a leftover test-mode customer is harmless.
    }
  }
});

describe("POST /api/memberships/billing-portal", () => {
  it("401s an unauthenticated caller", async () => {
    const res = await postPortal({});
    expect(res.status).toBe(401);
  });

  it("422s a returnPath outside the allow-list", async () => {
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    for (const returnPath of [
      "/admin",
      "https://evil.example.com/dashboard",
      "//evil.example.com",
      "/dashboard/family?next=/admin",
      "/dashboard/family/extra",
      42,
    ]) {
      const res = await postPortal({ cookie, body: { returnPath } });
      expect(
        res.status,
        `expected 422 for returnPath ${JSON.stringify(returnPath)}`,
      ).toBe(422);
    }
  });

  it("404s no_billing_account for a user with no Stripe customer", async (ctx) => {
    if (!noBillingAccount) return ctx.skip();
    const cookie = await getAuthCookie(
      noBillingAccount.email,
      noBillingAccount.password,
    );
    const res = await postPortal({ cookie });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no_billing_account");
    expect(typeof body.message).toBe("string");
  });

  itWithStripe(
    "returns a hosted portal URL, targeting the past_due customer",
    async (ctx) => {
      if (!fixturesReady) return ctx.skip();
      const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
      const res = await postPortal({ cookie, body: { returnPath: "/dashboard" } });
      // A newest-row-wins resolver would send Stripe the bogus customer on
      // the newer row and this would be a 502.
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
    },
  );

  itWithStripe("defaults the returnPath when the body omits it", async (ctx) => {
    if (!fixturesReady) return ctx.skip();
    const cookie = await getAuthCookie(PARENT_EMAIL, PARENT_PASSWORD);
    const res = await postPortal({ cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });
});

describe("billing customer resolution", () => {
  it("opens the portal on the past_due customer, not the newest row", async (ctx) => {
    if (!fixturesReady || !parentUserId) return ctx.skip();
    await expect(resolveBillingPortalCustomerId(parentUserId)).resolves.toBe(
      pastDueCustomerId,
    );
  });

  it("feeds purchases the newest customer, so new charges converge", async (ctx) => {
    if (!fixturesReady || !parentUserId) return ctx.skip();
    await expect(findMembershipStripeCustomerId(parentUserId)).resolves.toBe(
      newestCustomerId,
    );
  });
});

/**
 * A DIFFERENT fan-out shape than the past_due fixture above: no past_due row
 * at all, an older LIVE (`active`) row on a real customer, and a newer
 * `cancelled` row on a bogus customer. A newest-status-blind "newest row
 * wins" fallback would hand Stripe the bogus cancelled-row customer here —
 * so this is its own throwaway parent (not the PARENT_EMAIL fixture, which
 * always carries a past_due row) to keep the "no past_due present"
 * precondition true regardless of describe-block ordering.
 */
describe("billing customer resolution — live status beats newest-any", () => {
  const LIVE_SUFFIX = `${RUN}_live`;
  const liveMembershipIds: string[] = [];
  const liveCancelledCustomerId = `${SPEC_BOGUS_CUSTOMER_PREFIX}livecancelled_${LIVE_SUFFIX}`;
  let liveParentUserId: string | undefined;
  let liveActiveCustomerId: string | undefined;
  let liveRealStripeCustomerId: string | undefined;
  let liveFixturesReady = false;

  beforeAll(async () => {
    const db = getDb();
    const [aspireOrg] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, "aspire-sports"))
      .limit(1);
    if (!aspireOrg) return;
    const [tier] = await db
      .select({ id: membershipTiers.id })
      .from(membershipTiers)
      .where(eq(membershipTiers.organizationId, aspireOrg.id))
      .orderBy(asc(membershipTiers.createdAt))
      .limit(1);
    if (!tier) return;

    const [user] = await db
      .insert(users)
      .values({
        email: `billingportal.live.${LIVE_SUFFIX}@test.aspiresports.com`,
        emailVerified: true,
        firstName: "BillingPortalLive",
        lastName: "Spec",
      })
      .returning({ id: users.id });
    if (!user) return;
    liveParentUserId = user.id;

    // Real customer only when Stripe is configured; otherwise a placeholder
    // (the resolver never calls Stripe, so a bogus id is harmless here).
    if (stripeConfigured) {
      const customer = await membershipsStripe().customers.create({
        email: `billingportal.live.${LIVE_SUFFIX}@test.aspiresports.com`,
        name: "Billing Portal Live Spec",
        metadata: { aspire_test_fixture: "memberships-billing-portal-live" },
      });
      liveRealStripeCustomerId = customer.id;
      liveActiveCustomerId = customer.id;
    } else {
      liveActiveCustomerId = `${SPEC_BOGUS_CUSTOMER_PREFIX}liveactive_${LIVE_SUFFIX}`;
    }

    // OLDER row: active, real customer, adult-self shape (no family member).
    const [activeRow] = await db
      .insert(memberships)
      .values({
        userId: liveParentUserId,
        organizationId: aspireOrg.id,
        tierId: tier.id,
        status: "active",
        billingInterval: "month",
        stripeCustomerId: liveActiveCustomerId,
      })
      .returning({ id: memberships.id });
    if (activeRow) liveMembershipIds.push(activeRow.id);

    // NEWER row: cancelled, bogus customer — the decoy a newest-any resolver
    // would pick with no past_due row to short-circuit first.
    const [cancelledRow] = await db
      .insert(memberships)
      .values({
        userId: liveParentUserId,
        organizationId: aspireOrg.id,
        tierId: tier.id,
        status: "cancelled",
        billingInterval: "month",
        stripeCustomerId: liveCancelledCustomerId,
      })
      .returning({ id: memberships.id });
    if (cancelledRow) liveMembershipIds.push(cancelledRow.id);

    liveFixturesReady = liveMembershipIds.length === 2;
  });

  afterAll(async () => {
    const db = getDb();
    if (liveMembershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, liveMembershipIds));
    }
    if (liveParentUserId) {
      await db.delete(users).where(eq(users.id, liveParentUserId));
    }
    if (liveRealStripeCustomerId) {
      try {
        await membershipsStripe().customers.del(liveRealStripeCustomerId);
      } catch {
        // Best-effort — a leftover test-mode customer is harmless.
      }
    }
  });

  it("targets the newest LIVE-status row's customer, not the newer cancelled row", async (ctx) => {
    if (!liveFixturesReady || !liveParentUserId) return ctx.skip();
    await expect(resolveBillingPortalCustomerId(liveParentUserId)).resolves.toBe(
      liveActiveCustomerId,
    );
  });
});

describe("billing-portal library", () => {
  it("rejects an off-list returnPath before touching Stripe", async () => {
    await expect(
      createBillingPortalSession({
        customerId: "cus_never_used",
        returnPath: "/admin",
        origin: "https://example.com",
      }),
    ).rejects.toThrow(/returnPath/i);
  });

  it("allow-lists exactly the three dashboard paths, family first", () => {
    expect([...BILLING_RETURN_PATHS]).toEqual([
      "/dashboard/family",
      "/dashboard",
      "/dashboard/play",
    ]);
  });

  itWithStripe(
    "resolves one configuration per process and every match carries the spec's features",
    async () => {
      const first = await ensureBillingPortalConfiguration();
      const second = await ensureBillingPortalConfiguration();
      expect(second).toBe(first);

      const s = membershipsStripe();
      const matches: Stripe.BillingPortal.Configuration[] = [];
      for await (const config of s.billingPortal.configurations.list({ limit: 100 })) {
        if (config.metadata?.aspire_config === BILLING_PORTAL_CONFIG_VERSION) {
          matches.push(config);
        }
      }

      // NOT "exactly one": find-before-create isn't atomic across processes,
      // and the stable idempotency key on create only collapses bursts
      // inside Stripe's 24h window. What must hold is that the id we resolve
      // is one of ours and that any duplicate is behaviourally identical.
      expect(matches.map((c) => c.id)).toContain(first);
      for (const config of matches) expectSpecFeatures(config);
    },
  );

  itWithStripe("configures the resolved configuration per the spec", async () => {
    const configId = await ensureBillingPortalConfiguration();
    expectSpecFeatures(
      await membershipsStripe().billingPortal.configurations.retrieve(configId),
    );
  });
});

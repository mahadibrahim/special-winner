/**
 * Class-pack purchase — `POST /api/classes/packs/purchase` (Checkout
 * creation) and `handleClassPackPurchaseComplete` (webhook fulfillment),
 * Task 7 of the class purchase ladder.
 *
 * Two halves, deliberately split:
 *   - The endpoint's validation surface (auth, tenant scoping, child
 *     ownership) needs no Stripe and runs everywhere. Only the one test that
 *     actually mints a Checkout Session is `itWithStripe`-gated — same shape
 *     as tests/api/memberships-child-subscribe.test.ts.
 *   - Fulfillment is driven by calling the handler DIRECTLY with a synthetic
 *     `Stripe.Checkout.Session` (the pattern in
 *     tests/api/webhooks/dropin-checkout.test.ts): a real webhook delivery is
 *     unreachable from an API test, and the handler is the whole contract —
 *     grant shape, calendar-month expiry, and replay idempotency via the
 *     UNIQUE index on `stripe_checkout_session_id`.
 *
 * Fixtures are self-cleaning per tests/utils/classes-helpers.ts conventions:
 * every pack row and every grant this file creates is deleted in `afterAll`,
 * the grants keyed by the run-unique Checkout Session ids minted below (the
 * shared staging DB accumulates rows across runs, so nothing may leak).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import { classCreditGrants, classPackProducts } from "@/lib/db/schema/classes";
import { organizations } from "@/lib/db/schema/organizations";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { handleClassPackPurchaseComplete } from "@/lib/classes/purchase-webhooks";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../utils/classes-helpers";

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

/** A parent OTHER than CLASS_TEST_PARENT_EMAIL, for the not-your-child case. */
const OTHER_PARENT_EMAIL = "both@test.aspiresports.com";

const RUN = `${Date.now()}`;
const NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

let organizationId: string;
let parentUserId: string;
let cookie: string;

let packId: string;
let foreignPackId: string | undefined;
let inactivePackId: string;
let ownChildId: string;
let otherUsersChildId: string | undefined;

const createdPackIds: string[] = [];
/** Every Checkout Session id this file stamps onto a grant — the delete key
 *  in afterAll (the grants themselves are created by the handler, so their
 *  ids are only known via this run-unique natural key). */
const usedCheckoutSessionIds: string[] = [];

const PACK_SESSIONS = 8;
const PACK_PRICE_CENTS = 18_000;
const PACK_EXPIRY_MONTHS = 6;

async function createPack(opts: {
  organizationId: string;
  name: string;
  sessionCount?: number;
  priceCents?: number;
  expiryMonths?: number;
  active?: boolean;
}): Promise<string> {
  const [row] = await getDb()
    .insert(classPackProducts)
    .values({
      organizationId: opts.organizationId,
      name: opts.name,
      sessionCount: opts.sessionCount ?? PACK_SESSIONS,
      priceCents: opts.priceCents ?? PACK_PRICE_CENTS,
      expiryMonths: opts.expiryMonths ?? PACK_EXPIRY_MONTHS,
      active: opts.active ?? true,
    })
    .returning({ id: classPackProducts.id });
  createdPackIds.push(row.id);
  return row.id;
}

/** The metadata contract POST /api/classes/packs/purchase stamps, on a
 *  realistic completed payment-mode Checkout Session. Only the handful of
 *  fields the handler reads are real; the rest is unsafe-cast away, exactly
 *  as tests/api/webhooks/dropin-checkout.test.ts does. */
function makePackCheckoutSession(o: {
  checkoutSessionId: string;
  organizationId?: string;
  userId?: string;
  familyMemberId: string;
  packProductId: string;
  amountTotal?: number;
  type?: string;
  mode?: string;
}): Stripe.Checkout.Session {
  if (!usedCheckoutSessionIds.includes(o.checkoutSessionId)) {
    usedCheckoutSessionIds.push(o.checkoutSessionId);
  }
  return {
    id: o.checkoutSessionId,
    object: "checkout.session",
    amount_total: o.amountTotal ?? PACK_PRICE_CENTS,
    currency: "usd",
    payment_status: "paid",
    status: "complete",
    mode: o.mode ?? "payment",
    customer_details: { email: CLASS_TEST_PARENT_EMAIL },
    metadata: {
      type: o.type ?? "class_pack_purchase",
      organization_id: o.organizationId ?? organizationId,
      user_id: o.userId ?? parentUserId,
      family_member_id: o.familyMemberId,
      pack_product_id: o.packProductId,
      brand: "aspire",
    },
  } as unknown as Stripe.Checkout.Session;
}

async function grantsFor(checkoutSessionId: string) {
  return getDb()
    .select()
    .from(classCreditGrants)
    .where(eq(classCreditGrants.stripeCheckoutSessionId, checkoutSessionId));
}

/** Same calendar-month arithmetic the handler uses, for the expiry assertion. */
function addCalendarMonthsUtc(from: Date, months: number): Date {
  return new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + months,
      from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

async function purchase(body: unknown, opts: { cookie?: string } = {}) {
  return apiFetch("/api/classes/packs/purchase", {
    method: "POST",
    ...(opts.cookie ? { cookie: opts.cookie } : {}),
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const db = getDb();
  ({ organizationId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  packId = await createPack({ organizationId, name: `Purchase Pack ${RUN}` });
  inactivePackId = await createPack({
    organizationId,
    name: `Purchase Pack Retired ${RUN}`,
    active: false,
  });

  // Tenant-scoping fixture: an active pack owned by a DIFFERENT org must 404,
  // not leak. Skipped (undefined) if this DB only has the one org.
  const [otherOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(ne(organizations.id, organizationId))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (otherOrg) {
    foreignPackId = await createPack({
      organizationId: otherOrg.id,
      name: `Purchase Pack Foreign ${RUN}`,
    });
  }

  ownChildId = await createTestChild(parentUserId, `PackBuyer-${RUN}`);

  const [otherParent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, OTHER_PARENT_EMAIL))
    .limit(1);
  if (otherParent) {
    const [child] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.parentUserId, otherParent.id))
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    otherUsersChildId = child?.id;
  }
});

afterAll(async () => {
  const db = getDb();
  if (usedCheckoutSessionIds.length > 0) {
    await db
      .delete(classCreditGrants)
      .where(inArray(classCreditGrants.stripeCheckoutSessionId, usedCheckoutSessionIds));
  }
  if (createdPackIds.length > 0) {
    await db.delete(classPackProducts).where(inArray(classPackProducts.id, createdPackIds));
  }
});

describe("POST /api/classes/packs/purchase", () => {
  it("401s an anonymous caller", async () => {
    const res = await purchase({ packProductId: packId, familyMemberId: ownChildId });
    expect(res.status).toBe(401);
  });

  it("404s a pack that does not exist", async () => {
    const res = await purchase(
      { packProductId: NONEXISTENT_UUID, familyMemberId: ownChildId },
      { cookie },
    );
    expect(res.status).toBe(404);
  });

  it("404s a pack owned by another organization (no existence leak)", async (ctx) => {
    if (!foreignPackId) return ctx.skip();
    const res = await purchase(
      { packProductId: foreignPackId, familyMemberId: ownChildId },
      { cookie },
    );
    expect(res.status).toBe(404);
  });

  it("404s an inactive pack", async () => {
    const res = await purchase(
      { packProductId: inactivePackId, familyMemberId: ownChildId },
      { cookie },
    );
    expect(res.status).toBe(404);
  });

  it("404s a familyMemberId belonging to a different user", async (ctx) => {
    if (!otherUsersChildId) return ctx.skip();
    const res = await purchase(
      { packProductId: packId, familyMemberId: otherUsersChildId },
      { cookie },
    );
    expect(res.status).toBe(404);
  });

  it("rejects malformed ids without a 500", async () => {
    const malformedPack = await purchase(
      { packProductId: "not-a-uuid", familyMemberId: ownChildId },
      { cookie },
    );
    expect([404, 422]).toContain(malformedPack.status);

    const malformedChild = await purchase(
      { packProductId: packId, familyMemberId: "not-a-uuid" },
      { cookie },
    );
    expect([404, 422]).toContain(malformedChild.status);

    const missing = await purchase({ packProductId: packId }, { cookie });
    expect([400, 422]).toContain(missing.status);
  });

  it("409s a half-configured pack that has no price to charge", async () => {
    // Neither a reconciled Stripe Price nor a positive priceCents: an admin
    // catalog row that isn't finished, not a client error.
    const unpricedId = await createPack({
      organizationId,
      name: `Purchase Pack Unpriced ${RUN}`,
      priceCents: 0,
    });
    const res = await purchase(
      { packProductId: unpricedId, familyMemberId: ownChildId },
      { cookie },
    );
    expect(res.status).toBe(409);
  });

  itWithStripe("returns a Checkout URL for the caller's own child", async () => {
    const res = await purchase(
      { packProductId: packId, familyMemberId: ownChildId },
      { cookie },
    );
    // 200 locally with a live key (verified: a real checkout.stripe.com URL).
    // 502/503 tolerated so a Stripe outage / restricted key on the shared CI
    // box can't turn an unrelated red into this file's problem — the URL
    // assertion still runs whenever the call actually succeeded.
    expect([200, 502, 503]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json();
      expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    }
  });
});

describe("handleClassPackPurchaseComplete", () => {
  it("inserts one credit grant with the pack's sessions and calendar-month expiry", async () => {
    const childId = await createTestChild(parentUserId, `PackGrant-${RUN}`);
    const checkoutSessionId = `cs_test_pack_${RUN}_grant`;

    const before = new Date();
    await handleClassPackPurchaseComplete(
      makePackCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        packProductId: packId,
        amountTotal: PACK_PRICE_CENTS,
      }),
    );
    const after = new Date();

    const rows = await grantsFor(checkoutSessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId,
      familyMemberId: childId,
      source: "pack",
      packProductId: packId,
      blockId: null,
      slotTemplateId: null,
      sessionsGranted: PACK_SESSIONS,
      pricePaidCents: PACK_PRICE_CENTS,
    });

    // Expiry is `expiryMonths` CALENDAR months out, computed off the UTC
    // parts of the fulfillment instant — so it lands inside the window the
    // same arithmetic produces for the instants either side of the call.
    const lower = addCalendarMonthsUtc(before, PACK_EXPIRY_MONTHS).getTime();
    const upper = addCalendarMonthsUtc(after, PACK_EXPIRY_MONTHS).getTime();
    const actual = rows[0].expiresAt.getTime();
    expect(actual).toBeGreaterThanOrEqual(lower);
    expect(actual).toBeLessThanOrEqual(upper);
  });

  it("is replay-safe: redelivering the same session leaves exactly one grant", async () => {
    const childId = await createTestChild(parentUserId, `PackReplay-${RUN}`);
    const checkoutSessionId = `cs_test_pack_${RUN}_replay`;
    const session = makePackCheckoutSession({
      checkoutSessionId,
      familyMemberId: childId,
      packProductId: packId,
    });

    await handleClassPackPurchaseComplete(session);
    await handleClassPackPurchaseComplete(session);
    await handleClassPackPurchaseComplete(session);

    const rows = await grantsFor(checkoutSessionId);
    expect(rows).toHaveLength(1);
  });

  it("records what was actually charged, not the list price", async () => {
    const childId = await createTestChild(parentUserId, `PackDiscount-${RUN}`);
    const checkoutSessionId = `cs_test_pack_${RUN}_discounted`;

    await handleClassPackPurchaseComplete(
      makePackCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        packProductId: packId,
        amountTotal: 12_000,
      }),
    );

    const rows = await grantsFor(checkoutSessionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].pricePaidCents).toBe(12_000);
  });

  it("ignores a session that is not a class-pack purchase", async () => {
    const childId = await createTestChild(parentUserId, `PackIgnored-${RUN}`);

    const wrongType = `cs_test_pack_${RUN}_wrongtype`;
    await handleClassPackPurchaseComplete(
      makePackCheckoutSession({
        checkoutSessionId: wrongType,
        familyMemberId: childId,
        packProductId: packId,
        type: "membership_subscription",
      }),
    );
    expect(await grantsFor(wrongType)).toHaveLength(0);

    const wrongMode = `cs_test_pack_${RUN}_wrongmode`;
    await handleClassPackPurchaseComplete(
      makePackCheckoutSession({
        checkoutSessionId: wrongMode,
        familyMemberId: childId,
        packProductId: packId,
        mode: "subscription",
      }),
    );
    expect(await grantsFor(wrongMode)).toHaveLength(0);
  });

  it("ignores a session whose pack belongs to another organization", async (ctx) => {
    if (!foreignPackId) return ctx.skip();
    const childId = await createTestChild(parentUserId, `PackForeign-${RUN}`);
    const checkoutSessionId = `cs_test_pack_${RUN}_foreign`;

    // metadata.organization_id is the resolved org, but the pack id points at
    // another tenant's row — the handler must not grant credits off it.
    await handleClassPackPurchaseComplete(
      makePackCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        packProductId: foreignPackId,
      }),
    );
    expect(await grantsFor(checkoutSessionId)).toHaveLength(0);
  });

  it("ignores a session missing required metadata", async () => {
    const childId = await createTestChild(parentUserId, `PackNoMeta-${RUN}`);
    const checkoutSessionId = `cs_test_pack_${RUN}_nometa`;
    const session = makePackCheckoutSession({
      checkoutSessionId,
      familyMemberId: childId,
      packProductId: packId,
    });
    delete (session.metadata as Record<string, string>).pack_product_id;

    await handleClassPackPurchaseComplete(session);
    expect(await grantsFor(checkoutSessionId)).toHaveLength(0);
  });
});

describe("class-pack grants are visible to the credit ledger", () => {
  it("a fulfilled purchase leaves a redeemable grant for the child", async () => {
    const childId = await createTestChild(parentUserId, `PackLedger-${RUN}`);
    const checkoutSessionId = `cs_test_pack_${RUN}_ledger`;

    await handleClassPackPurchaseComplete(
      makePackCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        packProductId: packId,
      }),
    );

    const [grant] = await getDb()
      .select()
      .from(classCreditGrants)
      .where(
        and(
          eq(classCreditGrants.familyMemberId, childId),
          eq(classCreditGrants.organizationId, organizationId),
        ),
      );
    expect(grant).toBeTruthy();
    expect(grant.sessionsGranted).toBe(PACK_SESSIONS);
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

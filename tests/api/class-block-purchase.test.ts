/**
 * Class-BLOCK purchase — `POST /api/classes/blocks/purchase` (prorated
 * Checkout creation) and `handleClassBlockPurchaseComplete` (webhook
 * fulfillment: pinned credit grant + standing enrollment), Task 8 of the
 * class purchase ladder.
 *
 * Same two-half split as tests/api/class-pack-purchase.test.ts:
 *   - The endpoint's validation surface (auth, tenant scoping, child
 *     ownership, `block_over`, `template_full`, `already_enrolled`,
 *     `class_rate_not_configured`) never reaches Stripe and runs everywhere.
 *     Only the test that actually mints a Checkout Session — which is also
 *     the one that can assert the PRORATED total off the response — is
 *     `itWithStripe`-gated.
 *   - Fulfillment is driven by calling the handler DIRECTLY with a synthetic
 *     `Stripe.Checkout.Session` (the pattern in
 *     tests/api/webhooks/dropin-checkout.test.ts): grant shape (pinned
 *     `slotTemplateId`, block-end expiry), the credit-backed enrollment
 *     (`membershipId` null, `creditGrantId` set), and replay idempotency.
 *
 * Blocks: this file creates its OWN run-unique `class_blocks` rows and
 * deletes them in `afterAll`. It never parks pre-existing blocks the way
 * tests/api/public-class-catalog.test.ts has to — the purchase endpoint
 * takes an explicit `blockId`, so which block is "current" is irrelevant
 * here and there is nothing to take away from a concurrent run.
 *
 * Templates follow the `TEST_TEMPLATE_NAME_PREFIXES` convention ("Block-")
 * and are deactivated in `afterAll` via `cleanupTestClassFixtures`, so the
 * materialize cron never picks them up on a later run.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type Stripe from "stripe";
import { getDb } from "@/lib/db";
import {
  classBlocks,
  classCreditGrants,
  classEnrollments,
  classSlotTemplates,
} from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { organizations } from "@/lib/db/schema/organizations";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { handleClassBlockPurchaseComplete } from "@/lib/classes/purchase-webhooks";
import { blockExpiryInstant, blockOccurrenceInstants } from "@/lib/classes/block-occurrences";
import { getCreditBalances, selectRedeemableGrant } from "@/lib/classes/credits";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import { createTestDropInSession } from "../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  cleanupTestClassFixtures,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../utils/classes-helpers";

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

/** A parent OTHER than CLASS_TEST_PARENT_EMAIL, for the not-your-child case. */
const OTHER_PARENT_EMAIL = "both@test.aspiresports.com";

const RUN = `${Date.now()}`;
const NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

/** Per-session block rate on the sellable fixture template. Deliberately not
 *  a round multiple of anything else in the file so a proration assertion
 *  can't pass by coincidence. */
const BLOCK_RATE_CENTS = 2_350;
/** Set too, and deliberately DIFFERENT: the endpoint must prefer
 *  `blockRateCents` over `sessionRateCents`. */
const SESSION_RATE_CENTS = 9_900;

let organizationId: string;
let venueId: string;
let parentUserId: string;
let timeZone: string;
let cookie: string;

/** Mid-flight: started three weeks ago, ends three weeks out. Every weekday
 *  lands in it several times, with occurrences on both sides of `now`. */
let midBlockId: string;
let midBlockStart: string;
let midBlockEnd: string;

/** Still running (`endDate >= today`) but whose only occurrence of the
 *  fixture template's weekday is already past → `block_over`. */
let overBlockId: string;
/** endDate before today → not purchasable at all. */
let endedBlockId: string;
let inactiveBlockId: string;
let foreignBlockId: string | undefined;

let templateId: string;
let noRateTemplateId: string;
let fullTemplateId: string;
let inactiveTemplateId: string;
let foreignTemplateId: string | undefined;
/** Weekday of the template every "happy path" case buys into. */
let templateWeekday: number;
/** Weekday whose only occurrence inside `overBlock` is in the past. */
let overTemplateId: string;

let ownChildId: string;
let otherUsersChildId: string | undefined;

/** Origin/destination pair for the stranded-booking test — kept off the
 *  shared `templateId` so its enrollments can't perturb the capacity and
 *  already-enrolled assertions above. */
let strandOriginTemplateId: string;
let strandDestTemplateId: string;

const createdBlockIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdEnrollmentIds: string[] = [];
/** Every drop_in_sessions row this file materializes, cancelled in afterAll so
 *  none of them linger as a later run's "earliest upcoming scheduled session". */
const createdSessionIds: string[] = [];
/** Every Checkout Session id this file stamps onto a grant — the delete key
 *  in afterAll (grants/enrollments are created by the handler, so their ids
 *  are only known via this run-unique natural key). */
const usedCheckoutSessionIds: string[] = [];

// ---- civil-date helpers (org timezone) ------------------------------------

function orgToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** `delta` calendar days from the org's today, as "YYYY-MM-DD". */
function civilDay(delta: number): string {
  const [y, m, d] = orgToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** JS weekday (0=Sun) of a "YYYY-MM-DD" civil date. */
function weekdayOf(civil: string): number {
  return new Date(`${civil}T00:00:00Z`).getUTCDay();
}

async function createBlock(opts: {
  name: string;
  startDate: string;
  endDate: string;
  active?: boolean;
  organizationId?: string;
}): Promise<string> {
  const [row] = await getDb()
    .insert(classBlocks)
    .values({
      organizationId: opts.organizationId ?? organizationId,
      name: opts.name,
      startDate: opts.startDate,
      endDate: opts.endDate,
      active: opts.active ?? true,
    })
    .returning({ id: classBlocks.id });
  createdBlockIds.push(row.id);
  return row.id;
}

async function createTemplate(opts: {
  name: string;
  capacity?: number;
  weekday: number;
  active?: boolean;
  blockRateCents?: number | null;
  sessionRateCents?: number | null;
  minAge?: number;
  maxAge?: number;
  organizationId?: string;
}): Promise<string> {
  const id = await createTestClassTemplate({
    organizationId: opts.organizationId ?? organizationId,
    venueId,
    name: opts.name,
    capacity: opts.capacity ?? 8,
    weekday: opts.weekday,
    startTime: "16:00:00",
    active: opts.active ?? true,
    blockRateCents: opts.blockRateCents ?? undefined,
    sessionRateCents: opts.sessionRateCents ?? undefined,
    minAge: opts.minAge,
    maxAge: opts.maxAge,
  });
  createdTemplateIds.push(id);
  return id;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

/** A `kind='class'` drop_in_sessions row pinned to a class-slot template —
 *  the shape the materialize cron produces. */
async function createClassSession(startsAt: Date, slotTemplateId: string): Promise<string> {
  const db = getDb();
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt,
    memberRateCents: 999,
  });
  await db
    .update(dropInSessions)
    .set({ classSlotTemplateId: slotTemplateId })
    .where(eq(dropInSessions.id, ctx.sessionId));
  createdSessionIds.push(ctx.sessionId);
  return ctx.sessionId;
}

/** The metadata contract POST /api/classes/blocks/purchase stamps, on a
 *  realistic completed payment-mode Checkout Session. */
function makeBlockCheckoutSession(o: {
  checkoutSessionId: string;
  organizationId?: string;
  userId?: string;
  familyMemberId: string;
  blockId?: string;
  slotTemplateId?: string;
  sessionsGranted?: number;
  amountTotal?: number;
  type?: string;
  mode?: string;
}): Stripe.Checkout.Session {
  if (!usedCheckoutSessionIds.includes(o.checkoutSessionId)) {
    usedCheckoutSessionIds.push(o.checkoutSessionId);
  }
  const sessions = o.sessionsGranted ?? 3;
  return {
    id: o.checkoutSessionId,
    object: "checkout.session",
    amount_total: o.amountTotal ?? sessions * BLOCK_RATE_CENTS,
    currency: "usd",
    payment_status: "paid",
    status: "complete",
    mode: o.mode ?? "payment",
    customer_details: { email: CLASS_TEST_PARENT_EMAIL },
    metadata: {
      type: o.type ?? "class_block_purchase",
      organization_id: o.organizationId ?? organizationId,
      user_id: o.userId ?? parentUserId,
      family_member_id: o.familyMemberId,
      block_id: o.blockId ?? midBlockId,
      slot_template_id: o.slotTemplateId ?? templateId,
      sessions_granted: String(sessions),
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

async function enrollmentsForGrant(grantId: string) {
  return getDb()
    .select()
    .from(classEnrollments)
    .where(eq(classEnrollments.creditGrantId, grantId));
}

async function purchase(body: unknown, opts: { cookie?: string } = {}) {
  return apiFetch("/api/classes/blocks/purchase", {
    method: "POST",
    ...(opts.cookie ? { cookie: opts.cookie } : {}),
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const db = getDb();
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  timeZone = org?.timezone ?? ORG_DEFAULT_TIMEZONE;

  midBlockStart = civilDay(-21);
  midBlockEnd = civilDay(21);
  midBlockId = await createBlock({
    name: `Block-Mid-${RUN}`,
    startDate: midBlockStart,
    endDate: midBlockEnd,
  });

  // Buy into the weekday that fell two days ago: inside the mid-block window
  // it has already occurred (three times) and still has three to go, so
  // `remainingSessions < totalSessions` is guaranteed — that's the proration
  // assertion's whole point.
  templateWeekday = weekdayOf(civilDay(-2));

  templateId = await createTemplate({
    name: `Block-Buy-${RUN}`,
    weekday: templateWeekday,
    capacity: 8,
    blockRateCents: BLOCK_RATE_CENTS,
    sessionRateCents: SESSION_RATE_CENTS,
  });
  noRateTemplateId = await createTemplate({
    name: `Block-NoRate-${RUN}`,
    weekday: templateWeekday,
    blockRateCents: null,
    sessionRateCents: null,
  });
  inactiveTemplateId = await createTemplate({
    name: `Block-Retired-${RUN}`,
    weekday: templateWeekday,
    active: false,
    blockRateCents: BLOCK_RATE_CENTS,
  });

  // A capacity-1 template already holding its one active (membership-backed)
  // enrollment → `template_full`.
  fullTemplateId = await createTemplate({
    name: `Block-Full-${RUN}`,
    weekday: templateWeekday,
    capacity: 1,
    blockRateCents: BLOCK_RATE_CENTS,
  });
  const { tierId } = await resolveClassTestFixtures();
  const occupantChildId = await createTestChild(parentUserId, `BlockOccupant-${RUN}`);
  const occupantMembershipId = await createTestChildMembership({
    userId: parentUserId,
    familyMemberId: occupantChildId,
    organizationId,
    tierId,
    idSuffix: `block_full_${RUN}`,
  });
  const [occupantEnrollment] = await db
    .insert(classEnrollments)
    .values({
      slotTemplateId: fullTemplateId,
      familyMemberId: occupantChildId,
      membershipId: occupantMembershipId,
    })
    .returning({ id: classEnrollments.id });
  createdEnrollmentIds.push(occupantEnrollment.id);

  // `block_over`: a 7-day window ending today contains each weekday exactly
  // once, so a template pinned to the weekday of two days ago has its single
  // occurrence strictly in the past while the block itself is still running.
  overBlockId = await createBlock({
    name: `Block-Over-${RUN}`,
    startDate: civilDay(-6),
    endDate: civilDay(0),
  });
  overTemplateId = await createTemplate({
    name: `Block-Over-Slot-${RUN}`,
    weekday: weekdayOf(civilDay(-2)),
    blockRateCents: BLOCK_RATE_CENTS,
  });

  // Same effective rate on both, so the stranded-booking test exercises the
  // booking release rather than tripping the rate guard.
  strandOriginTemplateId = await createTemplate({
    name: `Block-StrandFrom-${RUN}`,
    weekday: templateWeekday,
    blockRateCents: BLOCK_RATE_CENTS,
  });
  strandDestTemplateId = await createTemplate({
    name: `Block-StrandTo-${RUN}`,
    weekday: (templateWeekday + 1) % 7,
    blockRateCents: BLOCK_RATE_CENTS,
  });

  endedBlockId = await createBlock({
    name: `Block-Ended-${RUN}`,
    startDate: civilDay(-40),
    endDate: civilDay(-1),
  });
  inactiveBlockId = await createBlock({
    name: `Block-Inactive-${RUN}`,
    startDate: midBlockStart,
    endDate: midBlockEnd,
    active: false,
  });

  // Tenant-scoping fixtures: an active block/template owned by a DIFFERENT
  // org must 404, not leak. Skipped when this DB only has the one org.
  const [otherOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(ne(organizations.id, organizationId))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (otherOrg) {
    foreignBlockId = await createBlock({
      name: `Block-Foreign-${RUN}`,
      startDate: midBlockStart,
      endDate: midBlockEnd,
      organizationId: otherOrg.id,
    });
    foreignTemplateId = await createTemplate({
      name: `Block-Foreign-Slot-${RUN}`,
      weekday: templateWeekday,
      blockRateCents: BLOCK_RATE_CENTS,
      organizationId: otherOrg.id,
    });
  }

  ownChildId = await createTestChild(parentUserId, `BlockBuyer-${RUN}`);

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
  // Bookings carry a SOFT reference to the grants (no FK), so they are deleted
  // by session id rather than cascading.
  if (createdSessionIds.length > 0) {
    await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, createdSessionIds));
    await db
      .update(dropInSessions)
      .set({ status: "cancelled" })
      .where(inArray(dropInSessions.id, createdSessionIds));
  }
  // Enrollments reference grants (FK onDelete restrict), so they go first.
  if (usedCheckoutSessionIds.length > 0) {
    const grants = await db
      .select({ id: classCreditGrants.id })
      .from(classCreditGrants)
      .where(inArray(classCreditGrants.stripeCheckoutSessionId, usedCheckoutSessionIds));
    if (grants.length > 0) {
      await db.delete(classEnrollments).where(
        inArray(
          classEnrollments.creditGrantId,
          grants.map((g) => g.id),
        ),
      );
      await db.delete(classCreditGrants).where(
        inArray(
          classCreditGrants.id,
          grants.map((g) => g.id),
        ),
      );
    }
  }
  if (createdEnrollmentIds.length > 0) {
    await db.delete(classEnrollments).where(inArray(classEnrollments.id, createdEnrollmentIds));
  }
  // Templates are deactivated (not deleted): drop_in_sessions may reference
  // them via classSlotTemplateId with onDelete restrict.
  await cleanupTestClassFixtures(createdTemplateIds);
  if (createdBlockIds.length > 0) {
    await db.delete(classBlocks).where(inArray(classBlocks.id, createdBlockIds));
  }
});

describe("POST /api/classes/blocks/purchase — validation", () => {
  it("401s an anonymous caller", async () => {
    const res = await purchase({
      blockId: midBlockId,
      slotTemplateId: templateId,
      familyMemberId: ownChildId,
    });
    expect(res.status).toBe(401);
  });

  it("422s a missing or malformed id without a 500", async () => {
    const missing = await purchase({ blockId: midBlockId }, { cookie });
    expect([400, 422]).toContain(missing.status);

    const malformed = await purchase(
      { blockId: "not-a-uuid", slotTemplateId: templateId, familyMemberId: ownChildId },
      { cookie },
    );
    expect([404, 422]).toContain(malformed.status);

    const malformedChild = await purchase(
      { blockId: midBlockId, slotTemplateId: templateId, familyMemberId: "not-a-uuid" },
      { cookie },
    );
    expect([404, 422]).toContain(malformedChild.status);
  });

  it("404s a block that does not exist, is inactive, has ended, or belongs to another org", async () => {
    for (const blockId of [NONEXISTENT_UUID, inactiveBlockId, endedBlockId]) {
      const res = await purchase(
        { blockId, slotTemplateId: templateId, familyMemberId: ownChildId },
        { cookie },
      );
      expect(res.status).toBe(404);
    }
    if (foreignBlockId) {
      const res = await purchase(
        { blockId: foreignBlockId, slotTemplateId: templateId, familyMemberId: ownChildId },
        { cookie },
      );
      expect(res.status).toBe(404);
    }
  });

  it("404s a template that does not exist, is inactive, or belongs to another org", async () => {
    for (const slotTemplateId of [NONEXISTENT_UUID, inactiveTemplateId]) {
      const res = await purchase(
        { blockId: midBlockId, slotTemplateId, familyMemberId: ownChildId },
        { cookie },
      );
      expect(res.status).toBe(404);
    }
    if (foreignTemplateId) {
      const res = await purchase(
        { blockId: midBlockId, slotTemplateId: foreignTemplateId, familyMemberId: ownChildId },
        { cookie },
      );
      expect(res.status).toBe(404);
    }
  });

  it("404s a familyMemberId belonging to a different user", async (ctx) => {
    if (!otherUsersChildId) return ctx.skip();
    const res = await purchase(
      { blockId: midBlockId, slotTemplateId: templateId, familyMemberId: otherUsersChildId },
      { cookie },
    );
    expect(res.status).toBe(404);
  });

  it("409 class_rate_not_configured when the template has no block or session rate", async () => {
    const res = await purchase(
      { blockId: midBlockId, slotTemplateId: noRateTemplateId, familyMemberId: ownChildId },
      { cookie },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("class_rate_not_configured");
  });

  it("409 block_over when the block is still running but has no sessions left", async () => {
    // The public catalog deliberately still LISTS a slot in this state
    // (`remainingSessions: 0`) so the UI can explain it. The purchase
    // endpoint must refuse it rather than sell $0 of nothing.
    const res = await purchase(
      { blockId: overBlockId, slotTemplateId: overTemplateId, familyMemberId: ownChildId },
      { cookie },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("block_over");
  });

  it("409 template_full when the slot's active enrollments have filled it", async () => {
    const res = await purchase(
      { blockId: midBlockId, slotTemplateId: fullTemplateId, familyMemberId: ownChildId },
      { cookie },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("template_full");
  });

  it("422 age_ineligible for a child outside the slot's age range — and not for one inside it", async () => {
    // Without this gate the parent pays for a standing seat the materialize
    // cron can never fill: every weekly auto-booking comes back
    // `age_ineligible` forever.
    const agedTemplateId = await createTemplate({
      name: `Block-Aged-${RUN}`,
      weekday: templateWeekday,
      blockRateCents: BLOCK_RATE_CENTS,
      minAge: 14,
      maxAge: 16,
    });

    // DOBs are derived from the current year, not hardcoded — a fixed literal
    // silently drifts into (or out of) the band as years pass.
    const thisYear = new Date().getUTCFullYear();
    const tooYoungId = await createTestChild(
      parentUserId,
      `BlockTooYoung-${RUN}`,
      `${thisYear - 8}-01-01`,
    );
    const tooYoung = await purchase(
      { blockId: midBlockId, slotTemplateId: agedTemplateId, familyMemberId: tooYoungId },
      { cookie },
    );
    expect(tooYoung.status).toBe(422);
    expect((await tooYoung.json()).error).toBe("age_ineligible");

    // Same template, a child whose DOB puts them mid-band: must NOT be gated.
    // (It may still 503 when Stripe is unconfigured — the point is only that
    // the age gate does not fire.)
    const inRangeId = await createTestChild(
      parentUserId,
      `BlockInRange-${RUN}`,
      `${thisYear - 15}-01-01`,
    );
    const inRange = await purchase(
      { blockId: midBlockId, slotTemplateId: agedTemplateId, familyMemberId: inRangeId },
      { cookie },
    );
    expect(inRange.status).not.toBe(422);

    // And a child with NO DOB on file skips the gate entirely, exactly as the
    // booking engine does.
    const [noDobChild] = await getDb()
      .insert(familyMembers)
      .values({ parentUserId, firstName: `BlockNoDob-${RUN}`, lastName: "Test" })
      .returning({ id: familyMembers.id });
    const noDob = await purchase(
      { blockId: midBlockId, slotTemplateId: agedTemplateId, familyMemberId: noDobChild.id },
      { cookie },
    );
    expect(noDob.status).not.toBe(422);
  });

  it("409 already_enrolled when the child already holds this slot", async () => {
    const db = getDb();
    const childId = await createTestChild(parentUserId, `BlockDupe-${RUN}`);
    const { tierId } = await resolveClassTestFixtures();
    const membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `block_dupe_${RUN}`,
    });
    const [enrollment] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childId, membershipId })
      .returning({ id: classEnrollments.id });
    createdEnrollmentIds.push(enrollment.id);

    const res = await purchase(
      { blockId: midBlockId, slotTemplateId: templateId, familyMemberId: childId },
      { cookie },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("already_enrolled");
  });
});

describe("POST /api/classes/blocks/purchase — proration", () => {
  it("the mid-block fixture really does have fewer sessions left than it holds", () => {
    // Guards the fixture the Stripe-gated assertion below depends on: if the
    // window/weekday ever stopped straddling `now`, that test would pass
    // vacuously with remaining === total.
    const all = blockOccurrenceInstants({
      weekday: templateWeekday,
      startTime: "16:00:00",
      timeZone,
      startDate: midBlockStart,
      endDate: midBlockEnd,
      after: new Date(`${midBlockStart}T00:00:00Z`),
    });
    const remaining = blockOccurrenceInstants({
      weekday: templateWeekday,
      startTime: "16:00:00",
      timeZone,
      startDate: midBlockStart,
      endDate: midBlockEnd,
      after: new Date(),
    });
    expect(all.length).toBeGreaterThan(0);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.length).toBeLessThan(all.length);
  });

  itWithStripe("prices only the sessions still to come, at the BLOCK rate", async () => {
    const childId = await createTestChild(parentUserId, `BlockQuote-${RUN}`);
    const res = await purchase(
      { blockId: midBlockId, slotTemplateId: templateId, familyMemberId: childId },
      { cookie },
    );
    // 502/503 tolerated so a Stripe outage / restricted key on the shared CI
    // box can't turn an unrelated red into this file's problem.
    expect([200, 502, 503]).toContain(res.status);
    if (res.status !== 200) return;

    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

    const expectedRemaining = blockOccurrenceInstants({
      weekday: templateWeekday,
      startTime: "16:00:00",
      timeZone,
      startDate: midBlockStart,
      endDate: midBlockEnd,
      after: new Date(),
    }).length;
    expect(body.remainingSessions).toBe(expectedRemaining);
    // BLOCK rate, not the (deliberately different) session rate.
    expect(body.totalCents).toBe(expectedRemaining * BLOCK_RATE_CENTS);
  });
});

describe("handleClassBlockPurchaseComplete", () => {
  it("grants pinned credits expiring at the block end AND enrolls the child", async () => {
    const childId = await createTestChild(parentUserId, `BlockGrant-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_grant`;

    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        sessionsGranted: 4,
        amountTotal: 4 * BLOCK_RATE_CENTS,
      }),
    );

    const grants = await grantsFor(checkoutSessionId);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      organizationId,
      familyMemberId: childId,
      source: "block",
      blockId: midBlockId,
      packProductId: null,
      // Pinned: block credits only ever spend on their own slot.
      slotTemplateId: templateId,
      sessionsGranted: 4,
      pricePaidCents: 4 * BLOCK_RATE_CENTS,
    });
    expect(grants[0].expiresAt.getTime()).toBe(
      blockExpiryInstant(midBlockEnd, timeZone).getTime(),
    );

    const enrollments = await enrollmentsForGrant(grants[0].id);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]).toMatchObject({
      slotTemplateId: templateId,
      familyMemberId: childId,
      // The whole point of the nullable column: a block enrollment is backed
      // by the grant, never by a membership.
      membershipId: null,
      creditGrantId: grants[0].id,
      status: "active",
    });
  });

  it("is replay-safe: redelivering leaves exactly one grant and one enrollment", async () => {
    const childId = await createTestChild(parentUserId, `BlockReplay-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_replay`;
    const session = makeBlockCheckoutSession({
      checkoutSessionId,
      familyMemberId: childId,
    });

    await handleClassBlockPurchaseComplete(session);
    await handleClassBlockPurchaseComplete(session);
    await handleClassBlockPurchaseComplete(session);

    const grants = await grantsFor(checkoutSessionId);
    expect(grants).toHaveLength(1);
    expect(await enrollmentsForGrant(grants[0].id)).toHaveLength(1);
  });

  it("records what was actually charged, not the quoted total", async () => {
    const childId = await createTestChild(parentUserId, `BlockDiscount-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_discounted`;

    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        sessionsGranted: 3,
        amountTotal: 1_000,
      }),
    );

    const grants = await grantsFor(checkoutSessionId);
    expect(grants).toHaveLength(1);
    expect(grants[0].pricePaidCents).toBe(1_000);
    expect(grants[0].sessionsGranted).toBe(3);
  });

  it("still grants when the child already holds the slot (enrollment absorbed)", async () => {
    // A membership-backed enrollment already exists on this template for the
    // child (bought a block for a slot they were already in). The money moved,
    // so the GRANT must still land; the duplicate enrollment insert is
    // absorbed by the partial unique index.
    const db = getDb();
    const childId = await createTestChild(parentUserId, `BlockHeld-${RUN}`);
    const { tierId } = await resolveClassTestFixtures();
    const membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `block_held_${RUN}`,
    });
    const [existing] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: templateId, familyMemberId: childId, membershipId })
      .returning({ id: classEnrollments.id });
    createdEnrollmentIds.push(existing.id);

    const checkoutSessionId = `cs_test_block_${RUN}_held`;
    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({ checkoutSessionId, familyMemberId: childId }),
    );

    const grants = await grantsFor(checkoutSessionId);
    expect(grants).toHaveLength(1);
    expect(await enrollmentsForGrant(grants[0].id)).toHaveLength(0);

    const active = await db
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.slotTemplateId, templateId),
          eq(classEnrollments.familyMemberId, childId),
          eq(classEnrollments.status, "active"),
        ),
      );
    expect(active).toHaveLength(1);
  });

  it("ignores a session that is not a class-block purchase", async () => {
    const childId = await createTestChild(parentUserId, `BlockIgnored-${RUN}`);

    const wrongType = `cs_test_block_${RUN}_wrongtype`;
    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({
        checkoutSessionId: wrongType,
        familyMemberId: childId,
        type: "class_pack_purchase",
      }),
    );
    expect(await grantsFor(wrongType)).toHaveLength(0);

    const wrongMode = `cs_test_block_${RUN}_wrongmode`;
    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({
        checkoutSessionId: wrongMode,
        familyMemberId: childId,
        mode: "subscription",
      }),
    );
    expect(await grantsFor(wrongMode)).toHaveLength(0);
  });

  it("ignores a session missing required metadata", async () => {
    const childId = await createTestChild(parentUserId, `BlockNoMeta-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_nometa`;
    const session = makeBlockCheckoutSession({ checkoutSessionId, familyMemberId: childId });
    delete (session.metadata as Record<string, string>).slot_template_id;

    await handleClassBlockPurchaseComplete(session);
    expect(await grantsFor(checkoutSessionId)).toHaveLength(0);
  });

  it("ignores a session whose block belongs to another organization", async (ctx) => {
    if (!foreignBlockId) return ctx.skip();
    const childId = await createTestChild(parentUserId, `BlockForeign-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_foreignblock`;

    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        blockId: foreignBlockId,
      }),
    );
    expect(await grantsFor(checkoutSessionId)).toHaveLength(0);
  });

  it("ignores a session whose template belongs to another organization", async (ctx) => {
    if (!foreignTemplateId) return ctx.skip();
    const childId = await createTestChild(parentUserId, `BlockForeignSlot-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_foreignslot`;

    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        slotTemplateId: foreignTemplateId,
      }),
    );
    expect(await grantsFor(checkoutSessionId)).toHaveLength(0);
  });

  it("ignores a non-numeric sessions_granted rather than writing NaN", async () => {
    const childId = await createTestChild(parentUserId, `BlockNaN-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_nan`;
    const session = makeBlockCheckoutSession({ checkoutSessionId, familyMemberId: childId });
    (session.metadata as Record<string, string>).sessions_granted = "lots";

    await handleClassBlockPurchaseComplete(session);
    expect(await grantsFor(checkoutSessionId)).toHaveLength(0);
  });
});

describe("PUT /api/classes/enrollments/:id on a credit-backed enrollment", () => {
  it("carries the grant to the new slot and re-pins the grant's template", async () => {
    // Regression: `changeEnrollmentSlot` used to copy only `membershipId` to
    // the replacement row, so moving a BLOCK (credit-backed) enrollment
    // inserted a row with both membershipId and creditGrantId null — a
    // class_enrollments_membership_xor_grant CHECK violation (500). The grant
    // must travel with the family AND re-pin to the destination template, or
    // its remaining credits become unspendable in the slot they now attend.
    const db = getDb();
    const childId = await createTestChild(parentUserId, `BlockMove-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_move`;

    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({ checkoutSessionId, familyMemberId: childId }),
    );
    const [grant] = await grantsFor(checkoutSessionId);
    expect(grant).toBeTruthy();
    const [enrollment] = await enrollmentsForGrant(grant.id);
    expect(enrollment).toBeTruthy();

    const destinationTemplateId = await createTemplate({
      name: `Block-MoveDest-${RUN}`,
      weekday: (templateWeekday + 1) % 7,
      blockRateCents: BLOCK_RATE_CENTS,
    });

    const res = await apiFetch(`/api/classes/enrollments/${enrollment.id}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: destinationTemplateId }),
    });
    expect(res.status).toBe(200);
    const { enrollmentId } = await res.json();

    const [moved] = await db
      .select()
      .from(classEnrollments)
      .where(eq(classEnrollments.id, enrollmentId));
    expect(moved).toMatchObject({
      slotTemplateId: destinationTemplateId,
      familyMemberId: childId,
      membershipId: null,
      creditGrantId: grant.id,
      status: "active",
    });

    // The grant follows the seat: its pin now names the destination template,
    // so `selectRedeemableGrant` will still spend it on the sessions the child
    // actually attends.
    const [repinned] = await db
      .select({ slotTemplateId: classCreditGrants.slotTemplateId })
      .from(classCreditGrants)
      .where(eq(classCreditGrants.id, grant.id));
    expect(repinned.slotTemplateId).toBe(destinationTemplateId);

    // Old row ended, not left dangling.
    const [old] = await db
      .select({ status: classEnrollments.status })
      .from(classEnrollments)
      .where(eq(classEnrollments.id, enrollment.id));
    expect(old.status).toBe("ended");
  });

  it("cancels the child's future bookings on the old slot and frees the credit", async () => {
    // The materialize cron books up to HORIZON_DAYS ahead, so a slot change
    // strands already-booked future sessions on the class the child left —
    // each one holding a paid credit hostage. The move must release them.
    const db = getDb();
    const childId = await createTestChild(parentUserId, `BlockStrand-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_strand`;

    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({
        checkoutSessionId,
        familyMemberId: childId,
        slotTemplateId: strandOriginTemplateId,
        sessionsGranted: 4,
      }),
    );
    const [grant] = await grantsFor(checkoutSessionId);
    const [enrollment] = await enrollmentsForGrant(grant.id);
    expect(enrollment).toBeTruthy();

    // A future session on the OLD slot with a credit-paid seat — exactly what
    // the cron's auto-booking leaves behind.
    const futureSessionId = await createClassSession(hoursFromNow(72), strandOriginTemplateId);
    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId: futureSessionId,
        userId: parentUserId,
        familyMemberId: childId,
        status: "confirmed",
        source: "auto_enrollment",
        paymentMethod: "pack_credit",
        amountPaidCents: 0,
        creditGrantId: grant.id,
      })
      .returning({ id: dropInBookings.id });

    // One of the four credits is spoken for while that booking stands.
    const before = await getCreditBalances(childId, organizationId);
    expect(before.find((b) => b.grantId === grant.id)?.remaining).toBe(3);

    const res = await apiFetch(`/api/classes/enrollments/${enrollment.id}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: strandDestTemplateId }),
    });
    expect(res.status).toBe(200);

    const [after] = await db
      .select({
        status: dropInBookings.status,
        cancelledAt: dropInBookings.cancelledAt,
        cancellationReason: dropInBookings.cancellationReason,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(after.status).toBe("cancelled");
    expect(after.cancelledAt).not.toBeNull();
    expect(after.cancellationReason).toBe("user_request");

    // Balances are count-derived, so the credit came back with no counter to
    // decrement — and the re-pinned grant is redeemable on the NEW slot.
    const balances = await getCreditBalances(childId, organizationId);
    const moved = balances.find((b) => b.grantId === grant.id);
    expect(moved?.remaining).toBe(4);
    expect(
      selectRedeemableGrant(balances, {
        slotTemplateId: strandDestTemplateId,
        at: hoursFromNow(72),
      })?.grantId,
    ).toBe(grant.id);
  });

  it("409 rate_mismatch when a credit-backed move targets a pricier slot", async () => {
    // A pinned grant gets re-pinned by the move, so without this guard a
    // family could buy the cheapest slot in the block and immediately move to
    // the priciest one at the cheap rate. Policy: destination rate must be
    // <= origin rate. (Owner-reviewable default — see enrollment.ts.)
    const childId = await createTestChild(parentUserId, `BlockArb-${RUN}`);
    const checkoutSessionId = `cs_test_block_${RUN}_arb`;

    await handleClassBlockPurchaseComplete(
      makeBlockCheckoutSession({ checkoutSessionId, familyMemberId: childId }),
    );
    const [grant] = await grantsFor(checkoutSessionId);
    const [enrollment] = await enrollmentsForGrant(grant.id);

    const pricierTemplateId = await createTemplate({
      name: `Block-Pricier-${RUN}`,
      weekday: (templateWeekday + 2) % 7,
      blockRateCents: BLOCK_RATE_CENTS * 2,
    });
    const cheaperTemplateId = await createTemplate({
      name: `Block-Cheaper-${RUN}`,
      weekday: (templateWeekday + 3) % 7,
      blockRateCents: BLOCK_RATE_CENTS - 100,
    });

    const up = await apiFetch(`/api/classes/enrollments/${enrollment.id}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: pricierTemplateId }),
    });
    expect(up.status).toBe(409);
    expect((await up.json()).error).toBe("rate_mismatch");

    // Moving DOWN in price is allowed — the family already paid more.
    const down = await apiFetch(`/api/classes/enrollments/${enrollment.id}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: cheaperTemplateId }),
    });
    expect(down.status).toBe(200);
  });

  it("leaves a MEMBERSHIP-backed move unguarded by the rate policy", async () => {
    // A subscription doesn't buy a per-session rate, so there is nothing to
    // arbitrage — a member may move to a pricier slot freely.
    const db = getDb();
    const childId = await createTestChild(parentUserId, `BlockMemberMove-${RUN}`);
    const { tierId } = await resolveClassTestFixtures();
    const membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `block_member_move_${RUN}`,
    });
    const originId = await createTemplate({
      name: `Block-MemberOrigin-${RUN}`,
      weekday: (templateWeekday + 4) % 7,
      blockRateCents: BLOCK_RATE_CENTS,
    });
    const pricierId = await createTemplate({
      name: `Block-MemberPricier-${RUN}`,
      weekday: (templateWeekday + 5) % 7,
      blockRateCents: BLOCK_RATE_CENTS * 3,
    });
    const [enrollment] = await db
      .insert(classEnrollments)
      .values({ slotTemplateId: originId, familyMemberId: childId, membershipId })
      .returning({ id: classEnrollments.id });
    createdEnrollmentIds.push(enrollment.id);

    const res = await apiFetch(`/api/classes/enrollments/${enrollment.id}`, {
      method: "PUT",
      cookie,
      body: JSON.stringify({ newSlotTemplateId: pricierId }),
    });
    expect(res.status).toBe(200);
    const { enrollmentId } = await res.json();
    createdEnrollmentIds.push(enrollmentId);
  });
});

describe("template lookup sanity", () => {
  it("the fixture templates are all in the resolved org", async () => {
    const rows = await getDb()
      .select({ id: classSlotTemplates.id, organizationId: classSlotTemplates.organizationId })
      .from(classSlotTemplates)
      .where(inArray(classSlotTemplates.id, [templateId, noRateTemplateId, fullTemplateId]));
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.organizationId).toBe(organizationId);
  });
});

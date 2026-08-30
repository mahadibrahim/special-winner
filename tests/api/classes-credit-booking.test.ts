/**
 * Credit redemption through `POST /api/classes/book` (`kind: "member"`).
 *
 * Covers the fallthrough added to `createChildClassBooking`: when the child
 * has no active membership (or has one whose monthly allotment is used up),
 * the booking engine tries the class-credit ledger before failing. Grants
 * are seeded by direct insert into `class_credit_grants` — same disposable-
 * fixture convention every other `tests/api/classes/*` suite uses for
 * children/memberships/templates (see tests/utils/classes-helpers.ts).
 *
 * Balances are count-derived (src/lib/classes/credits.ts), so there is no
 * counter to reset between tests: every test owns its own child, and a
 * child's grants are only ever reachable by that child.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInRateCard, dropInSessions } from "@/lib/db/schema/drop-in";
import { createChildClassBooking } from "@/lib/classes/book-child";
import { classCreditGrants } from "@/lib/db/schema/classes";
import { eq, inArray } from "drizzle-orm";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import { createTestDropInSession } from "../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  createTestClassTemplate,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
  CLASS_TEST_WAIVER,
} from "../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let tierId: string;
let cookie: string;
/** Read from the org's own rate card rather than assumed 24 — same reason
 *  tests/api/classes/book.test.ts does it. */
let cancelWindowHours = 24;

/** Every session this file creates, cancelled in afterAll so none of them
 *  linger as the "earliest upcoming scheduled session" for a later run. */
const createdSessionIds: string[] = [];

beforeAll(async () => {
  const db = getDb();
  ({ organizationId, venueId, parentUserId, tierId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  await db.insert(dropInRateCard).values({ organizationId }).onConflictDoNothing();
  const [rateCard] = await db
    .select({ cancelWindowHours: dropInRateCard.cancelWindowHours })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, organizationId))
    .limit(1);
  cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
});

afterAll(async () => {
  if (createdSessionIds.length === 0) return;
  const db = getDb();
  await db
    .update(dropInSessions)
    .set({ status: "cancelled" })
    .where(inArray(dropInSessions.id, createdSessionIds));
});

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

/** A `kind='class'` session, optionally materialized-looking (pinned to a
 *  class-slot template) so pinned-grant selection can be exercised. */
async function createClassSession(
  startsAt: Date,
  opts: { capacity?: number; slotTemplateId?: string } = {},
): Promise<string> {
  const db = getDb();
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: opts.capacity ?? 10,
    startsAt,
    memberRateCents: 999,
  });
  if (opts.slotTemplateId) {
    await db
      .update(dropInSessions)
      .set({ classSlotTemplateId: opts.slotTemplateId })
      .where(eq(dropInSessions.id, ctx.sessionId));
  }
  createdSessionIds.push(ctx.sessionId);
  return ctx.sessionId;
}

/** Direct insert into the credits ledger — the purchase path that normally
 *  writes these rows is the Stripe webhook, which no API test can drive. */
async function createCreditGrant(opts: {
  familyMemberId: string;
  sessionsGranted: number;
  idSuffix: string;
  source?: "pack" | "block";
  slotTemplateId?: string | null;
  expiresAt?: Date;
}): Promise<string> {
  const db = getDb();
  const [grant] = await db
    .insert(classCreditGrants)
    .values({
      organizationId,
      familyMemberId: opts.familyMemberId,
      source: opts.source ?? "pack",
      slotTemplateId: opts.slotTemplateId ?? null,
      sessionsGranted: opts.sessionsGranted,
      pricePaidCents: 9900,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 90 * 86_400_000),
      stripeCheckoutSessionId: `cs_test_credit_${opts.idSuffix}`,
    })
    .returning({ id: classCreditGrants.id });
  return grant.id;
}

/** `POST /api/classes/book` with `kind: "member"`. */
async function book(
  sessionId: string,
  familyMemberId: string,
  withWaiver = false,
): Promise<Response> {
  return apiFetch("/api/classes/book", {
    method: "POST",
    cookie,
    body: JSON.stringify({
      sessionId,
      familyMemberId,
      kind: "member",
      ...(withWaiver ? { waiver: CLASS_TEST_WAIVER } : {}),
    }),
  });
}

describe("POST /api/classes/book — pack credit redemption", () => {
  it("books a membership-less child against a floating pack credit", async () => {
    const suffix = `${Date.now()}-c1`;
    const childId = await createTestChild(parentUserId, `CreditFloat-${suffix}`);
    const grantId = await createCreditGrant({
      familyMemberId: childId,
      sessionsGranted: 3,
      idSuffix: suffix,
    });

    const sessionId = await createClassSession(hoursFromNow(5 * 24));
    const res = await book(sessionId, childId, true);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentMethod).toBe("pack_credit");
    expect(typeof body.bookingId).toBe("string");

    // Row shape, read straight from the DB: a redeemed credit is a $0 row
    // that points at the grant it spent and carries NO membership.
    const [row] = await getDb()
      .select({
        paymentMethod: dropInBookings.paymentMethod,
        creditGrantId: dropInBookings.creditGrantId,
        membershipId: dropInBookings.membershipId,
        amountPaidCents: dropInBookings.amountPaidCents,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, body.bookingId))
      .limit(1);
    expect(row).toMatchObject({
      paymentMethod: "pack_credit",
      creditGrantId: grantId,
      membershipId: null,
      amountPaidCents: 0,
    });
  });

  it("403s no_membership once a membership-less child's credits run out", async () => {
    const suffix = `${Date.now()}-c2`;
    const childId = await createTestChild(parentUserId, `CreditDrain-${suffix}`);
    await createCreditGrant({ familyMemberId: childId, sessionsGranted: 2, idSuffix: suffix });

    for (let i = 0; i < 2; i++) {
      const sessionId = await createClassSession(hoursFromNow((5 + i) * 24));
      const res = await book(sessionId, childId, i === 0);
      expect(res.status).toBe(200);
      expect((await res.json()).paymentMethod).toBe("pack_credit");
    }

    // Exhausted credits on a child with NO membership reports no_membership
    // (403), NOT allotment_exhausted (402) — there is no allotment to
    // exhaust and no member rate to quote.
    const thirdSessionId = await createClassSession(hoursFromNow(9 * 24));
    const res = await book(thirdSessionId, childId);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_membership");
  });

  it("falls through to credits when a member child's monthly allotment is used up", async () => {
    const suffix = `${Date.now()}-c3`;
    const childId = await createTestChild(parentUserId, `CreditAfterAllotment-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });

    // Burn the tier's 4-class monthly allotment.
    for (let i = 0; i < 4; i++) {
      const sessionId = await createClassSession(hoursFromNow((5 + i) * 24));
      const res = await book(sessionId, childId, i === 0);
      expect(res.status).toBe(200);
      expect((await res.json()).paymentMethod).toBe("member_allotment");
    }

    await createCreditGrant({ familyMemberId: childId, sessionsGranted: 1, idSuffix: suffix });

    const extraSessionId = await createClassSession(hoursFromNow(12 * 24));
    const res = await book(extraSessionId, childId);
    expect(res.status).toBe(200);
    expect((await res.json()).paymentMethod).toBe("pack_credit");
  });

  it("cancelling a credit booking returns the credit", async () => {
    const suffix = `${Date.now()}-c4`;
    const childId = await createTestChild(parentUserId, `CreditCancel-${suffix}`);
    await createCreditGrant({ familyMemberId: childId, sessionsGranted: 1, idSuffix: suffix });

    const firstSessionId = await createClassSession(hoursFromNow(cancelWindowHours + 48));
    const firstRes = await book(firstSessionId, childId, true);
    expect(firstRes.status).toBe(200);
    const { bookingId } = await firstRes.json();

    // Confirm the single credit is genuinely spent before cancelling.
    const secondSessionId = await createClassSession(hoursFromNow(cancelWindowHours + 72));
    expect((await book(secondSessionId, childId)).status).toBe(403);

    const cancelRes = await apiFetch(`/api/classes/bookings/${bookingId}/cancel`, {
      method: "POST",
      cookie,
    });
    expect(cancelRes.status).toBe(200);
    expect(await cancelRes.json()).toMatchObject({ cancelled: true, creditFreed: true });

    // The freed credit lets the previously-rejected booking through.
    const retryRes = await book(secondSessionId, childId);
    expect(retryRes.status).toBe(200);
    expect((await retryRes.json()).paymentMethod).toBe("pack_credit");
  });

  it("403s no_membership when the only grant has expired", async () => {
    const suffix = `${Date.now()}-c5`;
    const childId = await createTestChild(parentUserId, `CreditExpired-${suffix}`);
    await createCreditGrant({
      familyMemberId: childId,
      sessionsGranted: 5,
      idSuffix: suffix,
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    const sessionId = await createClassSession(hoursFromNow(6 * 24));
    const res = await book(sessionId, childId, true);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_membership");
  });

  it("spends a pinned block grant only on its own slot template's sessions", async () => {
    const suffix = `${Date.now()}-c6`;
    const childId = await createTestChild(parentUserId, `CreditPinned-${suffix}`);
    // Created INACTIVE: these templates exist only as pin targets, and an
    // active template would be swept into materialization by the class cron.
    const templateA = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Credit-Pinned-A-${suffix}`,
      capacity: 10,
      active: false,
    });
    const templateB = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Credit-Pinned-B-${suffix}`,
      capacity: 10,
      active: false,
    });
    await createCreditGrant({
      familyMemberId: childId,
      sessionsGranted: 4,
      idSuffix: suffix,
      source: "block",
      slotTemplateId: templateA,
    });

    const sessionB = await createClassSession(hoursFromNow(5 * 24), { slotTemplateId: templateB });
    const resB = await book(sessionB, childId, true);
    expect(resB.status).toBe(403);
    expect((await resB.json()).error).toBe("no_membership");

    const sessionA = await createClassSession(hoursFromNow(6 * 24), { slotTemplateId: templateA });
    const resA = await book(sessionA, childId, true);
    expect(resA.status).toBe(200);
    expect((await resA.json()).paymentMethod).toBe("pack_credit");
  });
});

/**
 * `source` is not reachable over HTTP — `POST /api/classes/book` never sets
 * it, so every booking that endpoint makes is `online_booking`. The only
 * caller that passes `auto_enrollment` is the materialization cron, which
 * picks its own children and sessions and can't be steered at a specific
 * grant from a test. So these two call `createChildClassBooking` directly,
 * against the same real staging DB the HTTP tests above use — a library
 * call, not a mock, so the transaction, gates and inserts are all the real
 * ones.
 */
describe("createChildClassBooking — background bookings and the credits ladder", () => {
  it("will NOT spend a floating pack credit on an auto_enrollment booking", async () => {
    const suffix = `${Date.now()}-c7`;
    const childId = await createTestChild(parentUserId, `CreditCronFloat-${suffix}`);
    await createCreditGrant({ familyMemberId: childId, sessionsGranted: 3, idSuffix: suffix });
    const sessionId = await createClassSession(hoursFromNow(5 * 24));

    // Waiver supplied, so the only thing that can reject this is the credit
    // gate. A floating pack is parent-initiated spend: the background job
    // must skip the child exactly as it did before credits existed.
    const cronResult = await createChildClassBooking({
      sessionId,
      parentUserId,
      familyMemberId: childId,
      kind: "member",
      source: "auto_enrollment",
      waiver: CLASS_TEST_WAIVER,
    });
    expect(cronResult.ok).toBe(false);
    if (!cronResult.ok) expect(cronResult.error.code).toBe("no_membership");

    // Control: the SAME child, SAME session, same untouched grant — only
    // the source differs — books fine when the parent asks for it.
    const res = await book(sessionId, childId, true);
    expect(res.status).toBe(200);
    expect((await res.json()).paymentMethod).toBe("pack_credit");
  });

  it("DOES spend a pinned block grant on an auto_enrollment booking", async () => {
    const suffix = `${Date.now()}-c8`;
    const childId = await createTestChild(parentUserId, `CreditCronPinned-${suffix}`);
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `Credit-Cron-Pinned-${suffix}`,
      capacity: 10,
      active: false,
    });
    await createCreditGrant({
      familyMemberId: childId,
      sessionsGranted: 4,
      idSuffix: suffix,
      source: "block",
      slotTemplateId: templateId,
    });
    const sessionId = await createClassSession(hoursFromNow(5 * 24), { slotTemplateId: templateId });

    // A block IS a standing commitment to this weekly slot — auto-booking it
    // week after week is the whole feature.
    const cronResult = await createChildClassBooking({
      sessionId,
      parentUserId,
      familyMemberId: childId,
      kind: "member",
      source: "auto_enrollment",
      waiver: CLASS_TEST_WAIVER,
    });
    expect(cronResult.ok).toBe(true);
    if (cronResult.ok) expect(cronResult.paymentMethod).toBe("pack_credit");
  });
});

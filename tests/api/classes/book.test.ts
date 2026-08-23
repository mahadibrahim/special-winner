import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { dropInRateCard } from "@/lib/db/schema/drop-in";
import { eq } from "drizzle-orm";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
  CLASS_TEST_WAIVER,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let tierId: string;
let cookie: string;
/** The org's own `dropInRateCard.cancelWindowHours` — read fresh rather than
 *  assumed 24, so the cutoff tests stay correct even if staging's rate card
 *  was ever hand-tuned (see book-child.ts's `isBeforeCutoff` doc comment). */
let cancelWindowHours = 24;

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

/** A `kind='class'` drop-in session under the resolved org/venue, with a
 *  deterministic `memberRateCents` so the 402 pricing assertion doesn't
 *  depend on the org's rate-card fallback. */
async function createClassSession(
  startsAt: Date,
  opts: { capacity?: number; memberRateCents?: number } = {},
): Promise<string> {
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: opts.capacity ?? 10,
    startsAt,
    memberRateCents: opts.memberRateCents ?? 999,
  });
  return ctx.sessionId;
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

describe("POST /api/classes/book", () => {
  it("books free (member_allotment) while the child's monthly allotment lasts", async () => {
    const suffix = `${Date.now()}-a`;
    const childId = await createTestChild(parentUserId, `BookChildA-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });
    const sessionId = await createClassSession(hoursFromNow(5 * 24));

    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentMethod).toBe("member_allotment");
    expect(typeof body.bookingId).toBe("string");
  });

  it("402s allotment_exhausted with memberRateCents once the monthly cap (4) is used up", async () => {
    const suffix = `${Date.now()}-b`;
    const childId = await createTestChild(parentUserId, `BookChildB-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });

    for (let i = 0; i < 4; i++) {
      const sessionId = await createClassSession(hoursFromNow((5 + i) * 24));
      const res = await apiFetch("/api/classes/book", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          sessionId,
          familyMemberId: childId,
          kind: "member",
          // Waiver only needed on the first booking — a signed row on file
          // for this child+org satisfies every booking after.
          ...(i === 0 ? { waiver: CLASS_TEST_WAIVER } : {}),
        }),
      });
      expect(res.status).toBe(200);
    }

    const fifthSessionId = await createClassSession(hoursFromNow(30 * 24), {
      memberRateCents: 1499,
    });
    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: fifthSessionId, familyMemberId: childId, kind: "member" }),
    });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("allotment_exhausted");
    expect(body.memberRateCents).toBe(1499);
  });

  it("allows one trial booking per child ever, then 409s trial_already_used", async () => {
    const suffix = `${Date.now()}-c`;
    const childId = await createTestChild(parentUserId, `BookChildC-${suffix}`);

    const session1 = await createClassSession(hoursFromNow(3 * 24));
    const res1 = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: session1,
        familyMemberId: childId,
        kind: "trial",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.paymentMethod).toBe("trial");

    const session2 = await createClassSession(hoursFromNow(4 * 24));
    const res2 = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: session2, familyMemberId: childId, kind: "trial" }),
    });
    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.error).toBe("trial_already_used");
  });

  it("lets two different children of the same parent both book the same session", async () => {
    const suffix = `${Date.now()}-d`;
    const childA = await createTestChild(parentUserId, `SiblingA-${suffix}`);
    const childB = await createTestChild(parentUserId, `SiblingB-${suffix}`);
    const sessionId = await createClassSession(hoursFromNow(6 * 24), { capacity: 10 });

    const resA = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId,
        familyMemberId: childA,
        kind: "trial",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(resA.status).toBe(200);

    const resB = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId,
        familyMemberId: childB,
        kind: "trial",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(resB.status).toBe(200);
  });

  it("422s waiver_required when no waiver is on file and none is supplied", async () => {
    const suffix = `${Date.now()}-e`;
    const childId = await createTestChild(parentUserId, `BookChildE-${suffix}`);
    const sessionId = await createClassSession(hoursFromNow(7 * 24));

    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId, familyMemberId: childId, kind: "trial" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("waiver_required");
  });
});

describe("POST /api/classes/bookings/:id/cancel", () => {
  it("cancelling >= the org's cutoff frees a member-allotment credit for a later booking", async () => {
    const suffix = `${Date.now()}-f`;
    const childId = await createTestChild(parentUserId, `CancelFree-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });

    // Fill the 4-class monthly cap, all well outside the cancel window.
    const bookingIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const sessionId = await createClassSession(hoursFromNow(cancelWindowHours + 48 + i * 24));
      const res = await apiFetch("/api/classes/book", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          sessionId,
          familyMemberId: childId,
          kind: "member",
          ...(i === 0 ? { waiver: CLASS_TEST_WAIVER } : {}),
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      bookingIds.push(body.bookingId);
    }

    // Confirm the allotment is genuinely exhausted before cancelling.
    const exhaustedSessionId = await createClassSession(hoursFromNow(cancelWindowHours + 90));
    const exhaustedRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: exhaustedSessionId, familyMemberId: childId, kind: "member" }),
    });
    expect(exhaustedRes.status).toBe(402);

    // Cancel one of the four, well outside the cutoff.
    const cancelRes = await apiFetch(`/api/classes/bookings/${bookingIds[0]}/cancel`, {
      method: "POST",
      cookie,
    });
    expect(cancelRes.status).toBe(200);
    const cancelBody = await cancelRes.json();
    expect(cancelBody).toMatchObject({ cancelled: true, creditFreed: true, refunded: false });

    // The freed credit lets a fresh booking through where it would otherwise 402.
    const freedSessionId = await createClassSession(hoursFromNow(cancelWindowHours + 96));
    const freedRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: freedSessionId, familyMemberId: childId, kind: "member" }),
    });
    expect(freedRes.status).toBe(200);
  });

  it("409s inside_cutoff when cancelling inside the org's cancel window", async () => {
    const suffix = `${Date.now()}-g`;
    const childId = await createTestChild(parentUserId, `CancelInside-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });

    // Inside the cutoff window but still bookable (session hasn't started).
    const soonHours = Math.max(0.25, cancelWindowHours / 2);
    const sessionId = await createClassSession(hoursFromNow(soonHours));

    const bookRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(bookRes.status).toBe(200);
    const { bookingId } = await bookRes.json();

    const cancelRes = await apiFetch(`/api/classes/bookings/${bookingId}/cancel`, {
      method: "POST",
      cookie,
    });
    expect(cancelRes.status).toBe(409);
    const body = await cancelRes.json();
    expect(body.error).toBe("inside_cutoff");
  });
});

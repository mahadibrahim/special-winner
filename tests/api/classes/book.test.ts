import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInRateCard, dropInSessions } from "@/lib/db/schema/drop-in";
import { consents } from "@/lib/db/schema/consents";
import { and, eq, inArray } from "drizzle-orm";
import { WAIVER_VALID_DAYS } from "@/lib/consents/liability";
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

  it("409s member_child_no_trial when a child who already holds a membership asks for a trial", async () => {
    const suffix = `${Date.now()}-h`;
    const childId = await createTestChild(parentUserId, `MemberTrial-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });
    const sessionId = await createClassSession(hoursFromNow(8 * 24));

    // The trial is an acquisition offer — a member child's seat comes from
    // the allotment (or the paid make-up), never from the one-per-child
    // trial. Sent WITH a waiver so the rejection can only be the membership
    // gate, not waiver_required.
    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId,
        familyMemberId: childId,
        kind: "trial",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("member_child_no_trial");

    // ...and the same child CAN still book on the allotment.
    const memberRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(memberRes.status).toBe(200);
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

// ---------------------------------------------------------------------------
// Annual waiver validity
// (docs/superpowers/specs/2026-08-31-annual-waiver-unification-design.md)
//
// The engine's on-file gate is `hasValidLiabilityWaiver` — a granted,
// unexpired, org-scoped `consents` row, or a legacy signature row inside the
// same 365-day window. Two consequences this block pins down: a signature
// that has aged out must re-ask (the old query had NO date bound, so a
// veteran family was never asked again), and a canonical consents row must
// satisfy the gate on its own, with no booking history at all.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** Children + sessions this block creates, so afterAll can clear the rows it
 *  wrote. Consents rows in particular MUST be cleaned: they are org-scoped
 *  and long-lived by design, so a leaked one would silently satisfy the
 *  waiver gate for its child on every later run. */
const waiverChildIds: string[] = [];
const waiverSessionIds: string[] = [];

afterAll(async () => {
  const db = getDb();
  if (waiverChildIds.length > 0) {
    await db.delete(consents).where(inArray(consents.familyMemberId, waiverChildIds));
    await db.delete(dropInBookings).where(inArray(dropInBookings.familyMemberId, waiverChildIds));
  }
  if (waiverSessionIds.length > 0) {
    await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, waiverSessionIds));
    await db.delete(dropInSessions).where(inArray(dropInSessions.id, waiverSessionIds));
  }
});

async function newWaiverChild(label: string): Promise<string> {
  const id = await createTestChild(parentUserId, `${label}-${Date.now()}`);
  waiverChildIds.push(id);
  return id;
}

/** A tracked class session — same helper as the rest of the file, but its id
 *  is recorded for teardown. */
async function createTrackedClassSession(hoursOut: number): Promise<string> {
  const sessionId = await createClassSession(hoursFromNow(hoursOut));
  waiverSessionIds.push(sessionId);
  return sessionId;
}

/**
 * A legacy, pre-unification signature row: `waiverSigned` + a real
 * `waiverSignedAt`, on a session in THIS org. `paymentMethod: "card_online"`
 * (never `"trial"`) deliberately — every test below reaches the waiver gate
 * via `kind: "trial"`, which is the only kind a membership-less child can
 * get past, and a prior `trial` row would short-circuit on
 * `trial_already_used` before the waiver gate is ever consulted.
 */
async function insertLegacySignedBooking(familyMemberId: string, signedAt: Date): Promise<void> {
  const db = getDb();
  const sessionId = await createTrackedClassSession(3 * 24);
  await db.insert(dropInBookings).values({
    sessionId,
    userId: parentUserId,
    familyMemberId,
    status: "confirmed",
    source: "online_booking",
    paymentMethod: "card_online",
    amountPaidCents: 0,
    waiverSigned: true,
    waiverSignedAt: signedAt,
    waiverSignedBy: "Parent Test",
  });
}

async function liabilityConsentsFor(familyMemberId: string) {
  return getDb()
    .select()
    .from(consents)
    .where(and(eq(consents.familyMemberId, familyMemberId), eq(consents.type, "liability")));
}

describe("POST /api/classes/book — annual waiver validity", () => {
  it("422s when the child's only signature is older than the annual window", async () => {
    const childId = await newWaiverChild("WaiverStale");
    // Signed, but 400 days ago — outside the 365-day window. Under the old
    // forever-valid predicate this booked silently.
    await insertLegacySignedBooking(childId, new Date(Date.now() - 400 * DAY_MS));

    const sessionId = await createTrackedClassSession(7 * 24);
    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId, familyMemberId: childId, kind: "trial" }),
    });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("waiver_required");
  });

  it("books waiver-free on a signature still inside the window", async () => {
    // Control for the test above: same fixture shape, a signature 30 days
    // old instead of 400, so the ONLY difference is the date.
    const childId = await newWaiverChild("WaiverRecent");
    await insertLegacySignedBooking(childId, new Date(Date.now() - 30 * DAY_MS));

    const sessionId = await createTrackedClassSession(8 * 24);
    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId, familyMemberId: childId, kind: "trial" }),
    });

    expect(res.status).toBe(200);
  });

  it("books waiver-free on a fresh consents row with NO booking history", async () => {
    const childId = await newWaiverChild("WaiverConsentOnly");
    const db = getDb();
    const signedAt = new Date();
    await db.insert(consents).values({
      familyMemberId: childId,
      organizationId,
      type: "liability",
      status: "granted",
      signedByUserId: parentUserId,
      signedByName: "Parent Test",
      signedAt,
      expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
    });

    const sessionId = await createTrackedClassSession(9 * 24);
    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId, familyMemberId: childId, kind: "trial" }),
    });

    expect(res.status).toBe(200);
  });

  it("writes ONE consents row per SIGNATURE — none on the on-file path, one more when a covered family signs again", async () => {
    const childId = await newWaiverChild("WaiverFreshSig");

    const firstSessionId = await createTrackedClassSession(10 * 24);
    const firstRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: firstSessionId,
        familyMemberId: childId,
        kind: "trial",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(firstRes.status).toBe(200);

    const rows = await liabilityConsentsFor(childId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.organizationId).toBe(organizationId);
    expect(row.status).toBe("granted");
    expect(row.signedByUserId).toBe(parentUserId);
    expect(row.signedByName).toBe(CLASS_TEST_WAIVER.signedBy);
    // Variant is hardcoded "guardian" — the classes engine only ever books a
    // child (see book-child.ts's header).
    expect(row.notes).toContain("guardian");
    // Signing audit trail, attached by the endpoint from the request context
    // (clientAddress + the user-agent header), never from the body. Once the
    // legacy signature fallbacks age out this row is the ONLY record of the
    // signature, so it has to carry what every other consent-writing surface
    // captures. Asserted as "present", not as a literal: the local address
    // is ::1 or 127.0.0.1 depending on how the dev server bound, and the
    // fetch client picks its own UA string.
    expect(row.ipAddress).toBeTruthy();
    expect(row.userAgent).toBeTruthy();
    const expiresAt = row.expiresAt?.getTime() ?? 0;
    const expected = row.signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS;
    expect(Math.abs(expiresAt - expected)).toBeLessThan(5000);

    // A SECOND booking now takes the ON-FILE path (the trial is spent, so
    // give the child a membership to get past the kind gate).
    // recordLiabilityWaiver is append-only with no dedupe, so the caller
    // contract — call it ONLY on a fresh signature — is the only thing
    // keeping the audit log from growing a duplicate row per booking. Assert
    // the count, not just that the booking succeeded.
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `waiver-fresh-sig-${Date.now()}`,
    });
    const secondSessionId = await createTrackedClassSession(11 * 24);
    const secondRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: secondSessionId, familyMemberId: childId, kind: "member" }),
    });
    expect(secondRes.status).toBe(200);
    const { bookingId } = await secondRes.json();
    expect(await liabilityConsentsFor(childId)).toHaveLength(1);

    // The on-file path still stamps the denormalized local flag, with no
    // signature fields of its own (nobody signed anything on this request).
    const [bookingRow] = await getDb()
      .select({
        waiverSigned: dropInBookings.waiverSigned,
        waiverSignedAt: dropInBookings.waiverSignedAt,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookingId))
      .limit(1);
    expect(bookingRow.waiverSigned).toBe(true);
    expect(bookingRow.waiverSignedAt).toBeNull();

    // ...and a THIRD booking that DOES carry a signature records it, even
    // though the child is covered. Coverage gates the ask, never the record
    // (clause 3): a stale client that still rendered the panel produces a real
    // signing event, and stamping "On file" over it would file the release as
    // something that did not happen the way it is written down.
    const thirdSessionId = await createTrackedClassSession(12 * 24);
    const thirdRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: thirdSessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(thirdRes.status).toBe(200);
    expect(await liabilityConsentsFor(childId)).toHaveLength(2);

    const [signedRow] = await getDb()
      .select({
        waiverSigned: dropInBookings.waiverSigned,
        waiverSignedAt: dropInBookings.waiverSignedAt,
        waiverSignedBy: dropInBookings.waiverSignedBy,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, (await thirdRes.json()).bookingId))
      .limit(1);
    expect(signedRow.waiverSigned).toBe(true);
    expect(signedRow.waiverSignedBy).toBe(CLASS_TEST_WAIVER.signedBy);
    expect(signedRow.waiverSignedAt).not.toBeNull();
  });

  it("does not let a signature at another org satisfy this org's gate", async () => {
    const childId = await newWaiverChild("WaiverOtherOrg");
    const db = getDb();
    const signedAt = new Date();
    // Org-NULL is the shape the 0139 backfill leaves an unattributable legacy
    // row in; it must never satisfy a specific org's gate.
    await db.insert(consents).values({
      familyMemberId: childId,
      organizationId: null,
      type: "liability",
      status: "granted",
      signedByUserId: parentUserId,
      signedByName: "Parent Test",
      signedAt,
      expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
    });

    const sessionId = await createTrackedClassSession(12 * 24);
    const res = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId, familyMemberId: childId, kind: "trial" }),
    });

    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("waiver_required");
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

  it("GET /api/dropin/bookings includes familyMemberId on child bookings", async () => {
    const suffix = `${Date.now()}-list-check`;
    const childId = await createTestChild(parentUserId, `ListCheckChild-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: suffix,
    });
    const sessionId = await createClassSession(hoursFromNow(5 * 24));

    // Book the child
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

    // Fetch bookings list and expect familyMemberId on the matching booking
    const listRes = await apiFetch("/api/dropin/bookings", {
      method: "GET",
      cookie,
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    const booking = listBody.bookings.find((b: any) => b.id === bookingId);
    expect(booking).toBeDefined();
    expect(booking.familyMemberId).toBe(childId);
  });
});

/**
 * Class pricing + eligibility across the WALK-UP surfaces.
 *
 * A `kind='class'` drop-in session carries its own rates, copied down from
 * its class-slot template by the materialization cron. Until this suite's
 * change, every walk-up surface priced EVERY session through
 * `resolveRate` + the org's `drop_in_rate_card` — the ADULT PICKUP price
 * list — so a kid walked into a class at the front desk was quoted (and
 * charged) an adult drop-in price nobody had configured.
 *
 * Three surfaces are exercised end to end on one hold:
 *   1. POST /api/kiosk/[locationSlug]/walkin/start   → the quote
 *   2. POST /api/kiosk/[locationSlug]/walkin/payment → the actual charge
 *   3. GET  /api/self-serve/[token]                  → what the pay link shows
 * plus GET /api/kiosk/[locationSlug]/sessions (what the desk may pick at
 * all) and POST /api/admin/dropin/sessions/:id/walk-up (the Terminal door,
 * covered in tests/api/dropin/walkup-rates.test.ts).
 *
 * The rate card is deliberately set to LOUD, distinctive values in
 * `beforeAll` (and restored afterwards): every class assertion below is an
 * exact-amount assertion, so if the adult card ever leaks back into a class
 * quote the number that shows up is unmistakably its.
 *
 * PICKUP REGRESSION is part of the contract, not an afterthought: the last
 * describe proves an unpriced pickup session still resolves off that same
 * card, i.e. the class branch bypasses the rate-card machinery instead of
 * replacing it.
 *
 * RATE LIMIT NOTE: /walkin/start allows 10 requests per minute per
 * (kiosk segment, IP). The kiosk segment resolves a location by UUID
 * case-insensitively, but the limiter keys on the raw segment STRING — so
 * the pickup block below deliberately addresses the same facility through
 * the upper-cased UUID, giving it its own bucket. Without that, this file
 * plus its neighbours can trip a 429 that looks like a pricing bug.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { familyMembers } from "@/lib/db/schema/registrations";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { computeSurchargeCents } from "@/lib/payments/surcharge";
import { CLASS_RATE_NOT_CONFIGURED } from "@/lib/classes/class-rate";
import {
  CLASS_AGE_INELIGIBLE,
  CLASS_REQUIRES_CHILD,
} from "@/lib/classes/class-walkup";
import { E2E_ORG_ID, E2E_RENTAL_VENUE_ID } from "@/lib/db/seeds/seed-e2e-tests";
import {
  createTestChild,
  createTestChildMembership,
} from "../../utils/classes-helpers";

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// Distinctive rate-card values: any of these appearing in a CLASS quote is a
// leak of the adult pickup price list into a kids' class.
const CARD_WALK_UP_CENTS = 9137;
const CARD_SESSION_CENTS = 9138;
const CARD_MEMBER_CENTS = 9139;

// Class prices (from the session / its template), what a class walk-up owes.
const CLASS_SESSION_CENTS = 3300;
const CLASS_MEMBER_CENTS = 1500;
// A session-level walk-up override — a class must ignore this too: walk-up
// pricing is a PICKUP channel concept, classes cost what the class costs.
const CLASS_WALK_UP_OVERRIDE_CENTS = 8888;

// Pickup fixtures — unchanged behaviour.
const PICKUP_SESSION_CENTS = 1200;
const PICKUP_WALK_UP_CENTS = 1900;

const PARENT_EMAIL = `kiosk-class-parent-${SUFFIX}@walkin-test.invalid`;
const MEMBER_PARENT_EMAIL = `kiosk-class-member-${SUFFIX}@walkin-test.invalid`;
const ADULT_EMAIL = `kiosk-class-adult-${SUFFIX}@walkin-test.invalid`;
const PICKUP_EMAIL = `kiosk-class-pickup-${SUFFIX}@walkin-test.invalid`;

/** `YYYY-MM-DD` for a child who is unambiguously `age` on `onDate`
 *  (one day past the birthday, so no boundary flake). */
function dobForAge(age: number, onDate: Date): string {
  const d = new Date(
    Date.UTC(onDate.getUTCFullYear() - age, onDate.getUTCMonth(), onDate.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

let locationId: string;
/** Same facility, different rate-limit bucket — see the file header. */
let altSegment: string;
let originalCard: {
  defaultSessionRateCents: number;
  defaultMemberRateCents: number;
  defaultWalkUpRateCents: number;
} | null = null;

const createdSessionIds: string[] = [];
const createdTemplateIds: string[] = [];
const createdTierIds: string[] = [];
const createdMembershipIds: string[] = [];
const createdChildIds: string[] = [];

let classPublicId: string;
let classMemberId: string;
let classMemberRateMissingId: string;
let classUnpricedId: string;
let classAgeGatedId: string;
let pickupWithOverrideId: string;
let pickupNoOverrideId: string;

let memberChildFirstName: string;
const MEMBER_CHILD_LAST_NAME = "Test";
let memberChildDob: string;

/** Session start used by every fixture: inside the facility's local day (so
 *  GET /sessions can see it) and comfortably in the future (so /walkin/start
 *  accepts it). */
const sessionStart = new Date(Date.now() + 5 * 60_000);
const sessionEnd = new Date(sessionStart.getTime() + 90 * 60_000);

async function insertSession(opts: {
  kind: "class" | "pickup";
  label: string;
  sessionRateCents: number | null;
  memberRateCents?: number | null;
  walkUpRateCents?: number | null;
  classSlotTemplateId?: string | null;
}): Promise<string> {
  const [row] = await getDb()
    .insert(dropInSessions)
    .values({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      kind: opts.kind,
      sportOrClassLabel: `${opts.label}-${SUFFIX}`,
      startsAt: sessionStart,
      endsAt: sessionEnd,
      capacity: 20,
      teamCount: opts.kind === "class" ? 0 : 2,
      teamColors: opts.kind === "class" ? [] : ["red", "blue"],
      sessionRateCents: opts.sessionRateCents,
      memberRateCents: opts.memberRateCents ?? null,
      walkUpRateCents: opts.walkUpRateCents ?? null,
      classSlotTemplateId: opts.classSlotTemplateId ?? null,
    })
    .returning({ id: dropInSessions.id });
  createdSessionIds.push(row.id);
  return row.id;
}

/** Start a walk-in for a CHILD (parent payload → the COPPA/minor path, which
 *  is what puts a `family_member_id` on the booking). */
async function startChildWalkIn(opts: {
  segment?: string;
  sessionId: string;
  firstName: string;
  lastName?: string;
  dob: string;
  parentEmail: string;
}): Promise<Response> {
  return apiFetch(`/api/kiosk/${opts.segment ?? locationId}/walkin/start`, {
    method: "POST",
    body: JSON.stringify({
      sessionId: opts.sessionId,
      contact: {
        firstName: opts.firstName,
        lastName: opts.lastName ?? "Test",
        email: opts.parentEmail,
        phone: "6145550101",
        dob: opts.dob,
      },
      parent: {
        firstName: "Kiosk",
        lastName: `ClassParent${SUFFIX.slice(-4)}`,
        email: opts.parentEmail,
        phone: "6145550101",
      },
    }),
  });
}

async function startAdultWalkIn(opts: {
  segment?: string;
  sessionId: string;
  email: string;
  firstName?: string;
}): Promise<Response> {
  return apiFetch(`/api/kiosk/${opts.segment ?? locationId}/walkin/start`, {
    method: "POST",
    body: JSON.stringify({
      sessionId: opts.sessionId,
      contact: {
        firstName: opts.firstName ?? "Adult",
        lastName: "Walkin",
        email: opts.email,
        phone: "6145550102",
        dob: "1990-04-04",
      },
    }),
  });
}

beforeAll(async () => {
  const db = getDb();

  const [rentalVenue] = await db
    .select({ locationId: venues.locationId })
    .from(venues)
    .where(eq(venues.id, E2E_RENTAL_VENUE_ID))
    .limit(1);
  if (!rentalVenue) {
    throw new Error("E2E rental venue not seeded — run `npm run db:seed:e2e` first.");
  }
  locationId = rentalVenue.locationId;
  altSegment = locationId.toUpperCase();

  // Rate card → loud values, remembered for restoration.
  await db
    .insert(dropInRateCard)
    .values({ organizationId: E2E_ORG_ID })
    .onConflictDoNothing();
  const [card] = await db
    .select({
      defaultSessionRateCents: dropInRateCard.defaultSessionRateCents,
      defaultMemberRateCents: dropInRateCard.defaultMemberRateCents,
      defaultWalkUpRateCents: dropInRateCard.defaultWalkUpRateCents,
    })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, E2E_ORG_ID))
    .limit(1);
  originalCard = card ?? null;
  await db
    .update(dropInRateCard)
    .set({
      defaultSessionRateCents: CARD_SESSION_CENTS,
      defaultMemberRateCents: CARD_MEMBER_CENTS,
      defaultWalkUpRateCents: CARD_WALK_UP_CENTS,
    })
    .where(eq(dropInRateCard.organizationId, E2E_ORG_ID));

  // Age-gated class-slot template. Deliberately `active: false` so the
  // materialization cron never picks it up — this suite inserts its sessions
  // by hand and only ever reads the template's age range.
  const [ageTemplate] = await db
    .insert(classSlotTemplates)
    .values({
      organizationId: E2E_ORG_ID,
      venueId: E2E_RENTAL_VENUE_ID,
      name: `Kiosk-AgeGate-${SUFFIX}`,
      sportLabel: "Soccer",
      weekday: sessionStart.getUTCDay(),
      startTime: "16:00:00",
      durationMins: 55,
      capacity: 20,
      minAge: 8,
      maxAge: 10,
      sessionRateCents: CLASS_SESSION_CENTS,
      active: false,
    })
    .returning({ id: classSlotTemplates.id });
  createdTemplateIds.push(ageTemplate.id);

  classPublicId = await insertSession({
    kind: "class",
    label: "kiosk-class-public",
    sessionRateCents: CLASS_SESSION_CENTS,
    memberRateCents: CLASS_MEMBER_CENTS,
    walkUpRateCents: CLASS_WALK_UP_OVERRIDE_CENTS,
  });
  classMemberId = await insertSession({
    kind: "class",
    label: "kiosk-class-member",
    sessionRateCents: CLASS_SESSION_CENTS,
    memberRateCents: CLASS_MEMBER_CENTS,
  });
  classMemberRateMissingId = await insertSession({
    kind: "class",
    label: "kiosk-class-nomemberrate",
    sessionRateCents: CLASS_SESSION_CENTS,
    memberRateCents: null,
  });
  classUnpricedId = await insertSession({
    kind: "class",
    label: "kiosk-class-unpriced",
    sessionRateCents: null,
    memberRateCents: null,
  });
  classAgeGatedId = await insertSession({
    kind: "class",
    label: "kiosk-class-agegate",
    sessionRateCents: CLASS_SESSION_CENTS,
    memberRateCents: CLASS_MEMBER_CENTS,
    classSlotTemplateId: ageTemplate.id,
  });
  pickupWithOverrideId = await insertSession({
    kind: "pickup",
    label: "kiosk-pickup-override",
    sessionRateCents: PICKUP_SESSION_CENTS,
    walkUpRateCents: PICKUP_WALK_UP_CENTS,
  });
  pickupNoOverrideId = await insertSession({
    kind: "pickup",
    label: "kiosk-pickup-card",
    sessionRateCents: PICKUP_SESSION_CENTS,
    walkUpRateCents: null,
  });

  // A member CHILD: the parent user, the child row, and an active membership
  // are created up front so `resolvePerson` (name + DOB under the parent)
  // dedupes the kiosk walk-in onto THIS child, membership and all.
  const [memberParent] = await db
    .insert(users)
    .values({
      email: MEMBER_PARENT_EMAIL,
      firstName: "Member",
      lastName: `ClassParent${SUFFIX.slice(-4)}`,
      emailVerified: false,
      phoneVerified: false,
    })
    .returning({ id: users.id });

  memberChildFirstName = `KioskMemberChild${SUFFIX.slice(-4)}`;
  memberChildDob = dobForAge(9, sessionStart);
  // createTestChild hardcodes lastName "Test" — MEMBER_CHILD_LAST_NAME must
  // match it, since resolvePerson dedupes the kiosk walk-in on name + DOB.
  const childId = await createTestChild(
    memberParent.id,
    memberChildFirstName,
    memberChildDob,
  );
  createdChildIds.push(childId);

  // Name prefix matches TEST_MEMBERSHIP_TIER_NAME_PREFIXES so the shared
  // orphan sweep can clean it up if this run dies before afterAll.
  const [tier] = await db
    .insert(membershipTiers)
    .values({
      organizationId: E2E_ORG_ID,
      name: `Makeup Tier 1 - kiosk-class-${SUFFIX}`,
      monthlyPriceCents: 5000,
      benefits: { classes_per_month: 4 },
      isActive: true,
    })
    .returning({ id: membershipTiers.id });
  createdTierIds.push(tier.id);

  createdMembershipIds.push(
    await createTestChildMembership({
      userId: memberParent.id,
      familyMemberId: childId,
      organizationId: E2E_ORG_ID,
      tierId: tier.id,
      idSuffix: `kiosk-class-${SUFFIX}`,
    }),
  );
});

afterAll(async () => {
  const db = getDb();
  try {
    if (createdSessionIds.length > 0) {
      await db
        .delete(dropInBookings)
        .where(inArray(dropInBookings.sessionId, createdSessionIds));
    }
    if (createdMembershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, createdMembershipIds));
    }
    const parentUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        inArray(users.email, [
          PARENT_EMAIL,
          MEMBER_PARENT_EMAIL,
          ADULT_EMAIL,
          PICKUP_EMAIL,
        ]),
      );
    const parentUserIds = parentUsers.map((u) => u.id);
    if (parentUserIds.length > 0) {
      await db
        .delete(familyMembers)
        .where(inArray(familyMembers.parentUserId, parentUserIds));
      await db.delete(users).where(inArray(users.id, parentUserIds));
    }
    if (createdTierIds.length > 0) {
      await db
        .update(membershipTiers)
        .set({ isActive: false })
        .where(inArray(membershipTiers.id, createdTierIds));
    }
    if (createdTemplateIds.length > 0) {
      await db
        .update(classSlotTemplates)
        .set({ active: false })
        .where(inArray(classSlotTemplates.id, createdTemplateIds));
    }
    if (originalCard) {
      await db
        .update(dropInRateCard)
        .set(originalCard)
        .where(eq(dropInRateCard.organizationId, E2E_ORG_ID));
    }
  } finally {
    // Keep the fixture sessions off the venue command center's today board —
    // same cancel-then-delete dance as walkin.test.ts.
    const adminCookie = await getAdminCookie().catch(() => null);
    if (!adminCookie) return;
    for (const id of createdSessionIds) {
      await apiFetch(`/api/admin/dropin/sessions/${id}/cancel`, {
        method: "POST",
        cookie: adminCookie,
      }).catch(() => null);
      await apiFetch(`/api/admin/dropin/sessions/${id}`, {
        method: "DELETE",
        cookie: adminCookie,
      }).catch(() => null);
    }
  }
});

describe("kiosk class walk-up — priced from the SESSION, never the adult rate card", () => {
  let publicToken: string;
  let publicBookingId: string;

  it("quotes the class's own sessionRateCents for a child with no membership", async () => {
    const res = await startChildWalkIn({
      sessionId: classPublicId,
      firstName: `PublicChild${SUFFIX.slice(-4)}`,
      dob: dobForAge(9, sessionStart),
      parentEmail: PARENT_EMAIL,
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    // The whole point: the class price, not the card's walk-up default and
    // not the session's own (pickup-channel) walk-up override.
    expect(body.amountDueCents).toBe(CLASS_SESSION_CENTS);
    expect(body.amountDueCents).not.toBe(CARD_WALK_UP_CENTS);
    expect(body.amountDueCents).not.toBe(CLASS_WALK_UP_OVERRIDE_CENTS);

    publicToken = body.token;
    publicBookingId = body.bookingId;
  });

  it("books the CHILD (family_member_id set), not the parent", async () => {
    const [booking] = await getDb()
      .select({
        familyMemberId: dropInBookings.familyMemberId,
        status: dropInBookings.status,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, publicBookingId))
      .limit(1);
    expect(booking.status).toBe("pending_payment");
    expect(booking.familyMemberId).not.toBeNull();
  });

  it("charges exactly that at /walkin/payment (or skips when Stripe is absent)", async () => {
    const res = await apiFetch(`/api/kiosk/${locationId}/walkin/payment`, {
      method: "POST",
      body: JSON.stringify({ token: publicToken }),
    });
    const body = await res.json();
    if (res.status === 503 && body?.error === "Stripe not configured") {
      expect(stripeConfigured).toBe(false);
      return;
    }
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.baseAmountCents).toBe(CLASS_SESSION_CENTS);
    expect(body.amountCents).toBe(
      CLASS_SESSION_CENTS + computeSurchargeCents(CLASS_SESSION_CENTS, "card"),
    );
  });

  it("shows the same amount on the self-serve pay link", async () => {
    const res = await apiFetch(`/api/self-serve/${publicToken}`);
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.outstanding.payment).toBe(true);
    expect(body.amountDueCents).toBe(CLASS_SESSION_CENTS);
  });

  it("uses the class MEMBER rate when the CHILD holds an active membership", async () => {
    const res = await startChildWalkIn({
      sessionId: classMemberId,
      firstName: memberChildFirstName,
      lastName: MEMBER_CHILD_LAST_NAME,
      dob: memberChildDob,
      parentEmail: MEMBER_PARENT_EMAIL,
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.amountDueCents).toBe(CLASS_MEMBER_CENTS);
    expect(body.amountDueCents).not.toBe(CARD_MEMBER_CENTS);

    // …and it really did resolve onto the pre-seeded, membership-holding child.
    const [booking] = await getDb()
      .select({ familyMemberId: dropInBookings.familyMemberId })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, body.bookingId))
      .limit(1);
    expect(booking.familyMemberId).toBe(createdChildIds[0]);
  });
});

describe("kiosk class walk-up — eligibility", () => {
  it("refuses an adult-self walk-up into a kids' class (422 class_requires_child)", async () => {
    const res = await startAdultWalkIn({
      sessionId: classPublicId,
      email: ADULT_EMAIL,
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(422);
    expect(body.code).toBe(CLASS_REQUIRES_CHILD);
    // The kiosk renders `error` verbatim — it must be a human sentence.
    expect(typeof body.error).toBe("string");

    // Nothing was created for the refused attempt.
    const [user] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ADULT_EMAIL))
      .limit(1);
    expect(user).toBeUndefined();
  });

  it("refuses a child outside the template's age range (422 age_ineligible)", async () => {
    const res = await startChildWalkIn({
      sessionId: classAgeGatedId,
      firstName: `TooYoung${SUFFIX.slice(-4)}`,
      dob: dobForAge(5, sessionStart), // template is 8-10
      parentEmail: PARENT_EMAIL,
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(422);
    expect(body.code).toBe(CLASS_AGE_INELIGIBLE);
  });

  it("admits a child inside the range, at the class rate", async () => {
    const res = await startChildWalkIn({
      sessionId: classAgeGatedId,
      firstName: `InRange${SUFFIX.slice(-4)}`,
      dob: dobForAge(9, sessionStart), // template is 8-10
      parentEmail: PARENT_EMAIL,
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.amountDueCents).toBe(CLASS_SESSION_CENTS);
  });
});

describe("kiosk class walk-up — unconfigured class rate fails loud", () => {
  it("409s the walk-in start instead of quoting the adult card", async () => {
    const res = await startChildWalkIn({
      sessionId: classUnpricedId,
      firstName: `Unpriced${SUFFIX.slice(-4)}`,
      dob: dobForAge(9, sessionStart),
      parentEmail: PARENT_EMAIL,
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(409);
    expect(body.error).toBe(CLASS_RATE_NOT_CONFIGURED);
    expect(typeof body.message).toBe("string");
    expect(body.amountDueCents).toBeUndefined();

    // No hold was created for a session we can't price.
    const holds = await getDb()
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(eq(dropInBookings.sessionId, classUnpricedId));
    expect(holds).toHaveLength(0);
  });

  it("409s a MEMBER child when only the member rate is missing", async () => {
    const res = await startChildWalkIn({
      sessionId: classMemberRateMissingId,
      firstName: memberChildFirstName,
      lastName: MEMBER_CHILD_LAST_NAME,
      dob: memberChildDob,
      parentEmail: MEMBER_PARENT_EMAIL,
    });
    const body = await res.json();
    // The session HAS a public rate — but this child is a member, so the
    // member rate is the one that applies, and it isn't configured. Falling
    // back to either the public rate or the card would both be inventions.
    expect(res.status, JSON.stringify(body)).toBe(409);
    expect(body.error).toBe(CLASS_RATE_NOT_CONFIGURED);
  });

  it("hides the unpriced class from the kiosk session list, but keeps the priced one", async () => {
    const res = await apiFetch(`/api/kiosk/${locationId}/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = (body.sessions as { id: string }[]).map((s) => s.id);
    expect(ids).toContain(classPublicId);
    expect(ids).not.toContain(classUnpricedId);
    // Pickup sessions are untouched by the filter, priced or not.
    expect(ids).toContain(pickupNoOverrideId);
  });
});

describe("PICKUP regression — the adult rate card still prices pickup walk-ups", () => {
  it("uses the session's walk-up override when set", async () => {
    const res = await startAdultWalkIn({
      segment: altSegment,
      sessionId: pickupWithOverrideId,
      email: PICKUP_EMAIL,
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.amountDueCents).toBe(PICKUP_WALK_UP_CENTS);
  });

  it("falls back to the rate card's default walk-up rate when it isn't", async () => {
    const res = await startAdultWalkIn({
      segment: altSegment,
      sessionId: pickupNoOverrideId,
      email: PICKUP_EMAIL,
      firstName: "Adult",
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    // The card fallback is the behaviour the class branch must NOT have
    // changed — an unpriced pickup still resolves off drop_in_rate_card.
    expect(body.amountDueCents).toBe(CARD_WALK_UP_CENTS);
  });
});

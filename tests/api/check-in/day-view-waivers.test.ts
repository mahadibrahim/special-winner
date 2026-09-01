/**
 * `waiversOutstanding` on the manager day view is a WORK QUEUE, not a column
 * dump (src/lib/check-in/day-view.ts).
 *
 * Before the annual waiver existed, "outstanding" meant `waiver_signed = false`
 * on the row — which counted every family who had already signed for the year
 * at some other door, because only the door they signed AT stamps its own row.
 * This suite pins the corrected rule for both counting surfaces (drop-in
 * bookings and field rentals): a person counts only when they are BOTH
 * unstamped on the row AND uncovered by the org's annual liability waiver.
 *
 * Library-level, not over HTTP — `getVenueDayEvents` has no route of its own
 * yet, and the counting rule is the whole subject. Every fixture is placed on
 * a run-unique far-future day so it cannot collide with other suites sharing
 * the same venue.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { consents } from "@/lib/db/schema/consents";
import { dropInBookings, dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { familyMembers } from "@/lib/db/schema/registrations";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { WAIVER_VALID_DAYS } from "@/lib/consents/liability";
import { getVenueDayEvents } from "@/lib/check-in/day-view";
import { resolveClassTestFixtures, createTestChild } from "../../utils/classes-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A run-unique far-future day, so no other suite's rows land in the view. */
const RUN_BASE_UTC =
  Date.UTC(2040, 0, 1) + Math.floor(Math.random() * 3_650) * DAY_MS;
const DAY_START = new Date(RUN_BASE_UTC);
const DAY_END = new Date(RUN_BASE_UTC + DAY_MS);

const suffix = Math.random().toString(36).slice(2, 10);

let organizationId: string;
let venueId: string;
let parentUserId: string;
let sessionId: string;
/** A second org sharing the SAME venue — the Aspire/SoccerOne shape. */
let otherOrganizationId: string;
let otherOrgSessionId: string;
let sharedChildId: string;

const childIds: string[] = [];
const selfPersonIds: string[] = [];
const renterUserIds: string[] = [];
const rentalIds: string[] = [];
const sessionIds: string[] = [];

async function grantWaiver(familyMemberId: string, orgId?: string): Promise<void> {
  const signedAt = new Date(Date.now() - DAY_MS);
  await getDb()
    .insert(consents)
    .values({
      familyMemberId,
      organizationId: orgId ?? organizationId,
      type: "liability",
      status: "granted",
      signedByUserId: parentUserId,
      signedByName: "Parent Test",
      signedAt,
      expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
    });
}

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  const db = getDb();

  const session = await createTestDropInSession({
    organizationId,
    venueId,
    startsAt: new Date(RUN_BASE_UTC + 10 * 3_600_000),
    endsAt: new Date(RUN_BASE_UTC + 11 * 3_600_000),
  });
  sessionId = session.sessionId;
  sessionIds.push(sessionId);

  // Three confirmed bookings, none of them stamped except the last:
  //   covered + unstamped   → NOT outstanding (the bug this suite pins)
  //   uncovered + unstamped → outstanding
  //   uncovered + stamped   → NOT outstanding (unchanged behaviour)
  const coveredChild = await createTestChild(parentUserId, `DayCovered${suffix}`);
  const uncoveredChild = await createTestChild(parentUserId, `DayUncovered${suffix}`);
  const stampedChild = await createTestChild(parentUserId, `DayStamped${suffix}`);
  childIds.push(coveredChild, uncoveredChild, stampedChild);
  await grantWaiver(coveredChild);

  await db.insert(dropInBookings).values([
    {
      sessionId,
      userId: parentUserId,
      familyMemberId: coveredChild,
      status: "confirmed" as const,
      source: "online_booking" as const,
      paymentMethod: "card_online" as const,
      amountPaidCents: 0,
      waiverSigned: false,
    },
    {
      sessionId,
      userId: parentUserId,
      familyMemberId: uncoveredChild,
      status: "confirmed" as const,
      source: "online_booking" as const,
      paymentMethod: "card_online" as const,
      amountPaidCents: 0,
      waiverSigned: false,
    },
    {
      sessionId,
      userId: parentUserId,
      familyMemberId: stampedChild,
      status: "confirmed" as const,
      source: "online_booking" as const,
      paymentMethod: "card_online" as const,
      amountPaidCents: 0,
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Parent Test",
    },
  ]);

  // Rentals: coverage for a renter hangs off their SELF person row, since
  // field_rentals carries no participant column.
  const [coveredRenter] = await db
    .insert(users)
    .values({
      email: `day-view-covered-${suffix}@t.example`,
      passwordHash: "x",
      firstName: "Covered",
      lastName: "Renter",
    })
    .returning({ id: users.id });
  const [uncoveredRenter] = await db
    .insert(users)
    .values({
      email: `day-view-uncovered-${suffix}@t.example`,
      passwordHash: "x",
      firstName: "Uncovered",
      lastName: "Renter",
    })
    .returning({ id: users.id });
  renterUserIds.push(coveredRenter.id, uncoveredRenter.id);

  const [coveredSelf] = await db
    .insert(familyMembers)
    .values({
      selfUserId: coveredRenter.id,
      firstName: "Covered",
      lastName: "Renter",
      birthDate: "1990-01-01",
    })
    .returning({ id: familyMembers.id });
  const [uncoveredSelf] = await db
    .insert(familyMembers)
    .values({
      selfUserId: uncoveredRenter.id,
      firstName: "Uncovered",
      lastName: "Renter",
      birthDate: "1990-01-01",
    })
    .returning({ id: familyMembers.id });
  selfPersonIds.push(coveredSelf.id, uncoveredSelf.id);
  await grantWaiver(coveredSelf.id);

  const rentalBase = {
    organizationId,
    venueId,
    status: "confirmed" as const,
    source: "admin_created" as const,
    paymentMethod: "cash" as const,
    amountDueCents: 5000,
    amountPaidCents: 5000,
    paymentStatus: "paid" as const,
    waiverSigned: false,
  };
  // ── Shared venue, second org ────────────────────────────────────────────
  // The same physical field hosts a session belonging to a DIFFERENT org on
  // the same day, with the same child booked into it. The child is covered at
  // `organizationId` only — org B never got a release.
  const [orgB] = await db
    .insert(organizations)
    .values({
      name: `Day View Org B ${suffix}`,
      slug: `day-view-org-b-${suffix}`,
      organizationType: "headquarters",
    })
    .returning({ id: organizations.id });
  otherOrganizationId = orgB.id;
  await db
    .insert(dropInRateCard)
    .values({ organizationId: otherOrganizationId })
    .onConflictDoNothing();

  sharedChildId = await createTestChild(parentUserId, `DayShared${suffix}`);
  childIds.push(sharedChildId);
  await grantWaiver(sharedChildId, organizationId);

  const [orgBSession] = await db
    .insert(dropInSessions)
    .values({
      organizationId: otherOrganizationId,
      venueId, // SAME venue as the org-A session above
      kind: "pickup",
      sportOrClassLabel: "soccer",
      startsAt: new Date(RUN_BASE_UTC + 18 * 3_600_000),
      endsAt: new Date(RUN_BASE_UTC + 19 * 3_600_000),
      capacity: 16,
      teamCount: 2,
      teamColors: ["orange", "black"],
    })
    .returning({ id: dropInSessions.id });
  otherOrgSessionId = orgBSession.id;
  sessionIds.push(otherOrgSessionId);

  await db.insert(dropInBookings).values([
    {
      sessionId,
      userId: parentUserId,
      familyMemberId: sharedChildId,
      status: "confirmed" as const,
      source: "online_booking" as const,
      paymentMethod: "card_online" as const,
      amountPaidCents: 0,
      waiverSigned: false,
    },
    {
      sessionId: otherOrgSessionId,
      userId: parentUserId,
      familyMemberId: sharedChildId,
      status: "confirmed" as const,
      source: "online_booking" as const,
      paymentMethod: "card_online" as const,
      amountPaidCents: 0,
      waiverSigned: false,
    },
  ]);

  const inserted = await db
    .insert(fieldRentals)
    .values([
      {
        ...rentalBase,
        fieldNumber: 91,
        startsAt: new Date(RUN_BASE_UTC + 13 * 3_600_000),
        endsAt: new Date(RUN_BASE_UTC + 14 * 3_600_000),
        renterName: "Covered Renter",
        renterUserId: coveredRenter.id,
      },
      {
        ...rentalBase,
        fieldNumber: 92,
        startsAt: new Date(RUN_BASE_UTC + 15 * 3_600_000),
        endsAt: new Date(RUN_BASE_UTC + 16 * 3_600_000),
        renterName: "Uncovered Renter",
        renterUserId: uncoveredRenter.id,
      },
    ])
    .returning({ id: fieldRentals.id });
  rentalIds.push(...inserted.map((r) => r.id));
});

afterAll(async () => {
  const db = getDb();
  if (rentalIds.length) {
    await db.delete(fieldRentals).where(inArray(fieldRentals.id, rentalIds));
  }
  if (sessionIds.length) {
    await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, sessionIds));
    await db.delete(dropInSessions).where(inArray(dropInSessions.id, sessionIds));
  }
  const people = [...childIds, ...selfPersonIds];
  if (people.length) {
    await db.delete(consents).where(inArray(consents.familyMemberId, people));
    await db.delete(familyMembers).where(inArray(familyMembers.id, people));
  }
  if (renterUserIds.length) {
    await db.delete(users).where(inArray(users.id, renterUserIds));
  }
  if (otherOrganizationId) {
    await db.delete(dropInRateCard).where(eq(dropInRateCard.organizationId, otherOrganizationId));
    await db.delete(organizations).where(eq(organizations.id, otherOrganizationId));
  }
});

describe("getVenueDayEvents — waiversOutstanding is coverage-aware", () => {
  it("counts only the drop-in booking that is BOTH unstamped and uncovered", async () => {
    const view = await getVenueDayEvents(venueId, DAY_START, DAY_END);
    const event = view?.events.find((e) => e.id === sessionId);

    expect(event).toBeDefined();
    // covered + uncovered + stamped + the shared-venue child (also covered
    // at this org), all confirmed.
    expect(event!.counts.expected).toBe(4);
    // The covered-but-unstamped children used to be counted here; the stamped
    // one never was. Only the genuinely uncovered person is real work.
    expect(event!.counts.waiversOutstanding).toBe(1);
  });

  it("does not count a rental whose renter is covered by the annual waiver", async () => {
    const view = await getVenueDayEvents(venueId, DAY_START, DAY_END);
    const [coveredRentalId, uncoveredRentalId] = rentalIds;

    const covered = view?.events.find((e) => e.id === coveredRentalId);
    const uncovered = view?.events.find((e) => e.id === uncoveredRentalId);

    expect(covered).toBeDefined();
    expect(uncovered).toBeDefined();
    // Both rows carry waiver_signed = false; only the uncovered renter is a
    // missing release.
    expect(covered!.counts.waiversOutstanding).toBe(0);
    expect(uncovered!.counts.waiversOutstanding).toBe(1);
  });

  it("judges coverage per ROW's org, not the venue's, on a shared venue", async () => {
    const view = await getVenueDayEvents(venueId, DAY_START, DAY_END);

    const orgAEvent = view?.events.find((e) => e.id === sessionId);
    const orgBEvent = view?.events.find((e) => e.id === otherOrgSessionId);
    expect(orgAEvent).toBeDefined();
    expect(orgBEvent).toBeDefined();

    // ONE child, ONE venue, TWO orgs, an unstamped booking in each. The child
    // holds a release from org A only. Judging the whole view under the
    // venue's org would let that release silence org B's count — a missing
    // waiver rendered as "nothing to do".
    expect(orgBEvent!.counts.expected).toBe(1);
    expect(orgBEvent!.counts.waiversOutstanding).toBe(1);
    // …while the same person, same day, same field is correctly NOT chased at
    // the org they actually signed for.
    expect(orgAEvent!.counts.waiversOutstanding).toBe(1); // the uncovered child only
  });
});

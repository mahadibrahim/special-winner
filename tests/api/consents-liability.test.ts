/**
 * Canonical annual liability-waiver helpers (`src/lib/consents/liability.ts`).
 *
 * These are library functions, not HTTP endpoints — the suite exercises them
 * directly against the test database, the same convention
 * tests/api/classes-credit-booking.test.ts uses for `createChildClassBooking`.
 * It lives in tests/api/ (not tests/unit/) because every assertion needs a
 * real Postgres row graph: the org-scoped consents predicate and the two
 * legacy signature fallbacks are pure SQL joins.
 *
 * Every fixture is run-unique and torn down in afterAll: the consents rows,
 * the drop-in bookings/sessions, the children, and the throwaway "org B".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { consents } from "@/lib/db/schema/consents";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { organizations } from "@/lib/db/schema/organizations";
import {
  WAIVER_VALID_DAYS,
  hasValidLiabilityWaiver,
  recordLiabilityWaiver,
} from "@/lib/consents/liability";
import { resolveActiveLiabilityWaiver } from "@/lib/consents/active-waiver";
import { resolveClassTestFixtures, createTestChild } from "../utils/classes-helpers";
import { createTestDropInSession } from "../utils/dropin-helpers";
import { seedPaidRegistration } from "../utils/registration-context";

const DAY_MS = 24 * 60 * 60 * 1000;

let organizationId: string;
let venueId: string;
let parentUserId: string;
/** A second org, used purely for the cross-org isolation assertion. */
let otherOrganizationId: string;
/** One shared drop-in session under `organizationId` for the legacy-booking
 *  scenarios — the one-active-booking-per-participant index is keyed on the
 *  participant, so distinct children can share a session. */
let legacySessionId: string;

const createdChildIds: string[] = [];
const createdSessionIds: string[] = [];
/** People this suite writes consents for but does NOT own (seedPaidRegistration
 *  makes its own family_members row) — consents get cleaned, the person stays. */
const borrowedConsentFamilyMemberIds: string[] = [];

const suffix = Math.random().toString(36).slice(2, 10);

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());

  const db = getDb();
  const [orgB] = await db
    .insert(organizations)
    .values({
      name: `Waiver Org B ${suffix}`,
      slug: `waiver-org-b-${suffix}`,
      organizationType: "headquarters",
    })
    .returning({ id: organizations.id });
  otherOrganizationId = orgB.id;

  const session = await createTestDropInSession({ organizationId, venueId });
  legacySessionId = session.sessionId;
  createdSessionIds.push(session.sessionId);
});

afterAll(async () => {
  const db = getDb();
  if (borrowedConsentFamilyMemberIds.length > 0) {
    await db
      .delete(consents)
      .where(inArray(consents.familyMemberId, borrowedConsentFamilyMemberIds));
  }
  if (createdChildIds.length > 0) {
    await db.delete(consents).where(inArray(consents.familyMemberId, createdChildIds));
    await db
      .delete(dropInBookings)
      .where(inArray(dropInBookings.familyMemberId, createdChildIds));
  }
  if (createdSessionIds.length > 0) {
    await db
      .delete(dropInBookings)
      .where(inArray(dropInBookings.sessionId, createdSessionIds));
    await db.delete(dropInSessions).where(inArray(dropInSessions.id, createdSessionIds));
  }
  if (createdChildIds.length > 0) {
    await db.delete(familyMembers).where(inArray(familyMembers.id, createdChildIds));
  }
  if (otherOrganizationId) {
    await db.delete(organizations).where(eq(organizations.id, otherOrganizationId));
  }
});

async function newChild(label: string): Promise<string> {
  const id = await createTestChild(parentUserId, `Waiver${label}${suffix}`);
  createdChildIds.push(id);
  return id;
}

/** Direct consents insert — the fixture shape a real signature produces
 *  (`expiresAt = signedAt + 365d`), with the age of the signature as the
 *  only knob. */
async function insertLiabilityConsent(opts: {
  familyMemberId: string;
  organizationId: string | null;
  signedDaysAgo: number;
  status?: "granted" | "revoked";
}): Promise<void> {
  const db = getDb();
  const signedAt = new Date(Date.now() - opts.signedDaysAgo * DAY_MS);
  await db.insert(consents).values({
    familyMemberId: opts.familyMemberId,
    organizationId: opts.organizationId,
    type: "liability",
    status: opts.status ?? "granted",
    signedByUserId: parentUserId,
    signedByName: "Parent Test",
    signedAt,
    expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
  });
}

/** A legacy drop-in signature row: the pre-unification capture shape. */
async function insertLegacyBooking(opts: {
  familyMemberId: string;
  waiverSigned: boolean;
  waiverSignedAt: Date | null;
}): Promise<void> {
  const db = getDb();
  await db.insert(dropInBookings).values({
    sessionId: legacySessionId,
    userId: parentUserId,
    familyMemberId: opts.familyMemberId,
    status: "confirmed",
    source: "online_booking",
    paymentMethod: "card_online",
    amountPaidCents: 0,
    waiverSigned: opts.waiverSigned,
    waiverSignedAt: opts.waiverSignedAt,
    waiverSignedBy: opts.waiverSignedAt ? "Parent Test" : null,
  });
}

describe("hasValidLiabilityWaiver — canonical consents predicate", () => {
  it("(a) returns true for a fresh org-scoped liability consent", async () => {
    const childId = await newChild("Fresh");
    await insertLiabilityConsent({ familyMemberId: childId, organizationId, signedDaysAgo: 1 });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(true);
  });

  it("(b) returns false once the signature is older than the validity window", async () => {
    const childId = await newChild("Stale");
    await insertLiabilityConsent({ familyMemberId: childId, organizationId, signedDaysAgo: 400 });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(false);
  });

  it("(c) does not let a valid waiver at org A satisfy org B", async () => {
    const childId = await newChild("OrgIso");
    await insertLiabilityConsent({ familyMemberId: childId, organizationId, signedDaysAgo: 1 });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(true);
    expect(await hasValidLiabilityWaiver(childId, otherOrganizationId)).toBe(false);
  });

  it("is valid at 364 days and invalid at 366 (window boundary)", async () => {
    const inside = await newChild("Day364");
    await insertLiabilityConsent({
      familyMemberId: inside,
      organizationId,
      signedDaysAgo: WAIVER_VALID_DAYS - 1,
    });
    const outside = await newChild("Day366");
    await insertLiabilityConsent({
      familyMemberId: outside,
      organizationId,
      signedDaysAgo: WAIVER_VALID_DAYS + 1,
    });

    expect(await hasValidLiabilityWaiver(inside, organizationId)).toBe(true);
    expect(await hasValidLiabilityWaiver(outside, organizationId)).toBe(false);
  });

  it("returns false for a legacy consent row left org-NULL by the backfill", async () => {
    const childId = await newChild("NullOrg");
    await insertLiabilityConsent({
      familyMemberId: childId,
      organizationId: null,
      signedDaysAgo: 1,
    });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(false);
  });
});

describe("hasValidLiabilityWaiver — legacy drop-in booking fallback", () => {
  it("(d) accepts a signed booking inside the window, with no consents row", async () => {
    const childId = await newChild("Booking");
    await insertLegacyBooking({
      familyMemberId: childId,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - 30 * DAY_MS),
    });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(true);
    // The session belongs to `organizationId`, so no other org inherits it.
    expect(await hasValidLiabilityWaiver(childId, otherOrganizationId)).toBe(false);
  });

  it("(e) rejects a signed booking older than the window", async () => {
    const childId = await newChild("OldBook");
    await insertLegacyBooking({
      familyMemberId: childId,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - 400 * DAY_MS),
    });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(false);
  });

  it("is valid at 364 days and invalid at 366 (window boundary)", async () => {
    const inside = await newChild("BookD364");
    await insertLegacyBooking({
      familyMemberId: inside,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - (WAIVER_VALID_DAYS - 1) * DAY_MS),
    });
    const outside = await newChild("BookD366");
    await insertLegacyBooking({
      familyMemberId: outside,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - (WAIVER_VALID_DAYS + 1) * DAY_MS),
    });

    expect(await hasValidLiabilityWaiver(inside, organizationId)).toBe(true);
    expect(await hasValidLiabilityWaiver(outside, organizationId)).toBe(false);
  });

  it("(f) rejects a derived row (waiverSigned true, no signature timestamp)", async () => {
    const childId = await newChild("Derived");
    await insertLegacyBooking({
      familyMemberId: childId,
      waiverSigned: true,
      waiverSignedAt: null,
    });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(false);
  });
});

describe("hasValidLiabilityWaiver — legacy registration fallback", () => {
  it("(g) accepts a signed registration inside the window via season → org", async () => {
    const seeded = await seedPaidRegistration(1000);

    expect(await hasValidLiabilityWaiver(seeded.familyMemberId, seeded.organizationId)).toBe(
      true,
    );
    // The org comes from registrations → seasons → programs → locations, so a
    // different org must not inherit the signature.
    expect(await hasValidLiabilityWaiver(seeded.familyMemberId, organizationId)).toBe(false);
  });
});

describe("hasValidLiabilityWaiver — revocation is authoritative", () => {
  it("a revoked consent overrides a recent legacy registration signature", async () => {
    const seeded = await seedPaidRegistration(1000);
    borrowedConsentFamilyMemberIds.push(seeded.familyMemberId);

    // The legacy signature alone is enough (proved by (g) above).
    expect(await hasValidLiabilityWaiver(seeded.familyMemberId, seeded.organizationId)).toBe(
      true,
    );

    await insertLiabilityConsent({
      familyMemberId: seeded.familyMemberId,
      organizationId: seeded.organizationId,
      signedDaysAgo: 0,
      status: "revoked",
    });

    // A revocation is an affirmative "not covered" — it must not fall
    // through to the older signature it supersedes.
    expect(await hasValidLiabilityWaiver(seeded.familyMemberId, seeded.organizationId)).toBe(
      false,
    );
  });

  it("an EXPIRED grant still falls through to a legacy signature (renewal)", async () => {
    const seeded = await seedPaidRegistration(1000);
    borrowedConsentFamilyMemberIds.push(seeded.familyMemberId);

    // Expired grant is the most recent consents row, but the registration
    // was signed today — that is a legitimate later renewal, not a
    // revocation, so the fallback must still be consulted.
    await insertLiabilityConsent({
      familyMemberId: seeded.familyMemberId,
      organizationId: seeded.organizationId,
      signedDaysAgo: WAIVER_VALID_DAYS + 10,
    });

    expect(await hasValidLiabilityWaiver(seeded.familyMemberId, seeded.organizationId)).toBe(
      true,
    );
  });
});

describe("recordLiabilityWaiver", () => {
  it("(h) writes an org-scoped row with the 365-day expiry, waiver hash and variant", async () => {
    const db = getDb();
    const childId = await newChild("Record");
    const expectedWaiver = await resolveActiveLiabilityWaiver(db, organizationId);

    await recordLiabilityWaiver({
      familyMemberId: childId,
      organizationId,
      signedByUserId: parentUserId,
      signedByName: "Parent Test",
      consentVariant: "guardian",
      consentText: "I agree on behalf of my child.",
      ipAddress: "203.0.113.7",
      userAgent: "vitest",
    });

    const [row] = await db
      .select()
      .from(consents)
      .where(and(eq(consents.familyMemberId, childId), eq(consents.type, "liability")))
      .orderBy(desc(consents.signedAt))
      .limit(1);

    expect(row).toBeDefined();
    expect(row.organizationId).toBe(organizationId);
    expect(row.status).toBe("granted");
    expect(row.signedByUserId).toBe(parentUserId);
    expect(row.ipAddress).toBe("203.0.113.7");
    expect(row.notes).toContain("guardian");
    expect(row.waiverId).toBe(expectedWaiver?.id ?? null);
    expect(row.contentHash).toBe(expectedWaiver?.contentHash ?? null);

    const expiresAt = row.expiresAt?.getTime() ?? 0;
    const expected = row.signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS;
    // Allow a second of slack: expiry is computed from Date.now(), signedAt
    // from the same wall clock a few statements earlier.
    expect(Math.abs(expiresAt - expected)).toBeLessThan(5000);

    // The write must satisfy the read.
    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(true);
    expect(await hasValidLiabilityWaiver(childId, otherOrganizationId)).toBe(false);
  });

  it("falls back to the person's owning user when the signer has no account", async () => {
    const db = getDb();
    const childId = await newChild("NoAcct");

    await recordLiabilityWaiver({
      familyMemberId: childId,
      organizationId,
      signedByUserId: null,
      signedByName: "Walk-up Guardian",
      consentVariant: "guardian",
      consentText: "I agree on behalf of my child.",
    });

    const [row] = await db
      .select()
      .from(consents)
      .where(and(eq(consents.familyMemberId, childId), eq(consents.type, "liability")))
      .limit(1);

    expect(row).toBeDefined();
    // consents.signed_by_user_id is NOT NULL — the owning parent stands in as
    // the account of record while signedByName keeps the real signer.
    expect(row.signedByUserId).toBe(parentUserId);
    expect(row.signedByName).toBe("Walk-up Guardian");
    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(true);
  });

  it("accepts a transaction handle so the consent lands with its caller's writes", async () => {
    const db = getDb();
    const childId = await newChild("InTx");

    await db.transaction(async (tx) => {
      await recordLiabilityWaiver(
        {
          familyMemberId: childId,
          organizationId,
          signedByUserId: parentUserId,
          signedByName: "Parent Test",
          consentVariant: "adult",
          consentText: "I agree.",
        },
        tx,
      );
      expect(await hasValidLiabilityWaiver(childId, organizationId, tx)).toBe(true);
    });

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(true);
  });
});

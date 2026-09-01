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
  hasValidLiabilityWaiverBatch,
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

/**
 * WHAT THIS SUITE PROVES — AND WHAT IT DOES NOT.
 *
 * `hasValidLiabilityWaiver` DELEGATES to `hasValidLiabilityWaiverBatch`
 * (one-person call), so "batch agrees with singular" is NOT a check on the
 * rule itself — it is a check that batch-of-N equals batch-of-1 for every
 * person, i.e. that nothing LEAKS ACROSS PEOPLE when they share a query:
 * a revocation stopping the wrong person's fall-through, one person's
 * signature satisfying another, the stage-2/3 `limit` starving someone out of
 * the result set. Those are exactly the bugs a set-based rewrite introduces,
 * and only a many-person run can catch them.
 *
 * The RULE's own pins are the ABSOLUTE assertions in the describes above —
 * (a)–(g), the window boundaries, the derived-row rejection, and the
 * revocation pair. They assert concrete true/false verdicts against seeded
 * facts and are the only thing standing between this file and a predicate
 * that is self-consistently wrong. They are NOT superseded by this suite and
 * must not be deleted as redundant.
 *
 * Judging the matrix under several orgs is what covers the registration
 * fallback and the cross-org isolation of all three sources at once.
 */
describe("hasValidLiabilityWaiverBatch ≡ hasValidLiabilityWaiver", () => {
  /** Every seeded person, plus the orgs the matrix has to be judged under. */
  const matrixIds: string[] = [];
  const matrixOrgIds: string[] = [];
  /** The two registration-source people, kept for the absolute assertions
   *  below — their interesting verdicts only exist under their OWN orgs. */
  let seededId: string;
  let seededOrgId: string;
  let seededRevokedId: string;
  let seededRevokedOrgId: string;

  beforeAll(async () => {
    // ── consents branch ──────────────────────────────────────────────────
    const fresh = await newChild("MxFresh");
    await insertLiabilityConsent({ familyMemberId: fresh, organizationId, signedDaysAgo: 1 });

    const expired = await newChild("MxExpired");
    await insertLiabilityConsent({
      familyMemberId: expired,
      organizationId,
      signedDaysAgo: WAIVER_VALID_DAYS + 10,
    });

    const revoked = await newChild("MxRevoked");
    await insertLiabilityConsent({
      familyMemberId: revoked,
      organizationId,
      signedDaysAgo: 30,
    });
    await insertLiabilityConsent({
      familyMemberId: revoked,
      organizationId,
      signedDaysAgo: 0,
      status: "revoked",
    });

    // Revoked-latest sitting ON TOP of a legacy booking that is itself inside
    // the window — the revocation must win, with no fall-through, in both forms.
    const revokedOverLegacy = await newChild("MxRevokedLegacy");
    await insertLegacyBooking({
      familyMemberId: revokedOverLegacy,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - 10 * DAY_MS),
    });
    await insertLiabilityConsent({
      familyMemberId: revokedOverLegacy,
      organizationId,
      signedDaysAgo: 0,
      status: "revoked",
    });

    const otherOrgOnly = await newChild("MxOtherOrg");
    await insertLiabilityConsent({
      familyMemberId: otherOrgOnly,
      organizationId: otherOrganizationId,
      signedDaysAgo: 1,
    });

    const orgNull = await newChild("MxOrgNull");
    await insertLiabilityConsent({
      familyMemberId: orgNull,
      organizationId: null,
      signedDaysAgo: 1,
    });

    const boundaryIn = await newChild("MxDay364");
    await insertLiabilityConsent({
      familyMemberId: boundaryIn,
      organizationId,
      signedDaysAgo: WAIVER_VALID_DAYS - 1,
    });

    // ── legacy drop-in booking branch ────────────────────────────────────
    const bookingIn = await newChild("MxBookIn");
    await insertLegacyBooking({
      familyMemberId: bookingIn,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - 30 * DAY_MS),
    });

    const bookingOut = await newChild("MxBookOut");
    await insertLegacyBooking({
      familyMemberId: bookingOut,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - 400 * DAY_MS),
    });

    // Undated derived stamp: waiverSigned true with no signature date. Grants
    // nothing — the exact row the classes engine's on-file branch writes.
    const derived = await newChild("MxDerived");
    await insertLegacyBooking({
      familyMemberId: derived,
      waiverSigned: true,
      waiverSignedAt: null,
    });

    // Expired GRANT falling through to a dated booking inside the window —
    // the asymmetry with the revoked case, exercised in both forms.
    const expiredThenBooking = await newChild("MxExpiredThenBook");
    await insertLiabilityConsent({
      familyMemberId: expiredThenBooking,
      organizationId,
      signedDaysAgo: WAIVER_VALID_DAYS + 10,
    });
    await insertLegacyBooking({
      familyMemberId: expiredThenBooking,
      waiverSigned: true,
      waiverSignedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    // ── nothing at all ───────────────────────────────────────────────────
    const bare = await newChild("MxNothing");

    // ── legacy registration branch (its own org, seeded by the helper) ────
    const seeded = await seedPaidRegistration(1000);
    seededId = seeded.familyMemberId;
    seededOrgId = seeded.organizationId;

    const seededRevoked = await seedPaidRegistration(1000);
    seededRevokedId = seededRevoked.familyMemberId;
    seededRevokedOrgId = seededRevoked.organizationId;
    borrowedConsentFamilyMemberIds.push(seededRevoked.familyMemberId);
    await insertLiabilityConsent({
      familyMemberId: seededRevoked.familyMemberId,
      organizationId: seededRevoked.organizationId,
      signedDaysAgo: 0,
      status: "revoked",
    });

    matrixIds.push(
      fresh,
      expired,
      revoked,
      revokedOverLegacy,
      otherOrgOnly,
      orgNull,
      boundaryIn,
      bookingIn,
      bookingOut,
      derived,
      expiredThenBooking,
      bare,
      seeded.familyMemberId,
      seededRevoked.familyMemberId,
    );
    // Both registration orgs are judged, so `seededRevoked` is exercised
    // under the org where its revocation actually decides something rather
    // than being a false===false no-op everywhere.
    matrixOrgIds.push(
      organizationId,
      otherOrganizationId,
      seededOrgId,
      seededRevokedOrgId,
    );
  });

  it("agrees with the singular predicate for every person, under every org", async () => {
    for (const orgId of matrixOrgIds) {
      const batch = await hasValidLiabilityWaiverBatch(matrixIds, orgId);
      const singular = new Map<string, boolean>(
        await Promise.all(
          matrixIds.map(
            async (id) => [id, await hasValidLiabilityWaiver(id, orgId)] as const,
          ),
        ),
      );

      for (const id of matrixIds) {
        expect(
          batch.get(id) ?? false,
          `person ${id} under org ${orgId}`,
        ).toBe(singular.get(id));
      }
    }
  });

  it("covers both verdicts under at least one org (the matrix is not degenerate)", async () => {
    const batch = await hasValidLiabilityWaiverBatch(matrixIds, organizationId);
    const verdicts = matrixIds.map((id) => batch.get(id) ?? false);
    expect(verdicts).toContain(true);
    expect(verdicts).toContain(false);
  });

  /**
   * ABSOLUTE verdicts for the registration branch — the parity loop above
   * cannot see these, because under the two registration orgs it only ever
   * compares false to false unless the interesting rows are pinned by value.
   * This is the batch-side twin of the (g) + revocation assertions.
   */
  it("pins the registration branch by value, inside a many-person batch", async () => {
    const atSeededOrg = await hasValidLiabilityWaiverBatch(matrixIds, seededOrgId);
    // The dated registration signature alone covers its own person…
    expect(atSeededOrg.get(seededId)).toBe(true);
    // …and nobody else in the batch inherits it.
    for (const id of matrixIds.filter((i) => i !== seededId)) {
      expect(atSeededOrg.get(id) ?? false, `person ${id} at seeded org`).toBe(false);
    }

    const atRevokedOrg = await hasValidLiabilityWaiverBatch(
      matrixIds,
      seededRevokedOrgId,
    );
    // Same fixture shape, plus a revocation on top: the revocation wins and
    // must NOT fall through to the registration signature underneath it —
    // proved here in a batch, where the revoked person shares the query with
    // people the fallbacks do answer true for.
    expect(atRevokedOrg.get(seededRevokedId)).toBe(false);
  });

  it("returns an empty map for empty input", async () => {
    expect(await hasValidLiabilityWaiverBatch([], organizationId)).toEqual(new Map());
  });

  it("is duplicate-tolerant — repeated ids collapse to one verdict", async () => {
    const childId = await newChild("MxDupe");
    await insertLiabilityConsent({ familyMemberId: childId, organizationId, signedDaysAgo: 1 });

    const batch = await hasValidLiabilityWaiverBatch(
      [childId, childId, childId],
      organizationId,
    );
    expect(batch.size).toBe(1);
    expect(batch.get(childId)).toBe(true);
  });

  it("answers false for an id that matches no person", async () => {
    const unknown = "00000000-0000-0000-0000-000000000000";
    const known = await newChild("MxKnown");
    await insertLiabilityConsent({ familyMemberId: known, organizationId, signedDaysAgo: 1 });

    const batch = await hasValidLiabilityWaiverBatch([unknown, known], organizationId);
    expect(batch.get(unknown) ?? false).toBe(false);
    expect(batch.get(known)).toBe(true);
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

/**
 * Annual liability waiver at the admin walk-up desk
 * (`POST /api/admin/walk-up-registration`, parent+child variant).
 *
 * Two calls against the SAME child, in two seasons of the same organization,
 * exercise both halves of the rule in the order a front desk actually hits
 * them:
 *
 *  1. First registration, waiver taken at the desk → the row is DATED and
 *     NAMED (both columns this endpoint used to drop on the floor), and one
 *     `liability` consent is logged with the desk's `walk-up: admin=<id>`
 *     provenance.
 *  2. Second registration for the same person, waiver NOT re-taken → the row
 *     is born on-file with a NULL signature date, and nothing further is
 *     appended to the append-only consents log.
 *  3. A SECOND child whose covered registration DOES take a fresh desk
 *     signature → dated, named, and one more consent appended. Coverage gates
 *     the ask, not the record.
 *
 * The second call deliberately reuses the parent email + child name + DOB so
 * `resolvePerson` dedupes to the same `family_members` row — the linkage the
 * annual predicate hangs on.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import {
  consents,
  familyMembers,
  locations,
  programs,
  registrations,
  seasons,
} from "@/lib/db/schema";
import { WAIVER_ON_FILE_ATTRIBUTION } from "@/lib/consents/liability";
import { walkUpWaiverAssentText } from "@/lib/registrations/waiver-text";

// Two open seasons under the same organization — the walk-up endpoint is
// tenant-scoped to the caller's org, and `registrations_member_season_active_uniq`
// forbids two live rows for one person in one season.
const SEASON_A_SLUG = "e2e-adult-open-soccer-2026";
const SEASON_B_SLUG = "e2e-adult-team-soccer-2026";

let adminCookie: string;
let seasonAId: string;
let seasonBId: string;

const suffix = Math.random().toString(36).slice(2, 10);
const parentEmail = `walkup-waiver-${suffix}@test.example`;
const kid = {
  firstName: "WalkUp",
  lastName: `Waiver${suffix}`,
  birthDate: "2015-06-01",
};
/** A SECOND child under the same parent, for the covered-and-re-signed case.
 *  Distinct from `kid` because `registrations_member_season_active_uniq`
 *  allows each person only one live row per season, and that case needs both
 *  seasons for one person. */
const kid2 = {
  firstName: "WalkUpAgain",
  lastName: `Waiver${suffix}`,
  birthDate: "2014-03-02",
};

const createdRegistrationIds: string[] = [];
let createdFamilyMemberId: string | null = null;
const createdFamilyMemberIds: string[] = [];

beforeAll(async () => {
  adminCookie = await getAdminCookie();
  const db = getDb();

  const rows = await db
    .select({ id: seasons.id, slug: seasons.slug, organizationId: locations.organizationId })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(inArray(seasons.slug, [SEASON_A_SLUG, SEASON_B_SLUG]));

  const a = rows.find((r) => r.slug === SEASON_A_SLUG);
  const b = rows.find((r) => r.slug === SEASON_B_SLUG);
  if (!a || !b) {
    throw new Error(
      `Walk-up waiver fixtures missing (${SEASON_A_SLUG} / ${SEASON_B_SLUG}) — re-run npm run db:seed:e2e`,
    );
  }
  // The on-file rule is org-scoped; the whole test is meaningless if the two
  // seasons don't share one.
  expect(a.organizationId).toBe(b.organizationId);
  seasonAId = a.id;
  seasonBId = b.id;
});

afterAll(async () => {
  const db = getDb();
  if (createdRegistrationIds.length > 0) {
    await db
      .delete(registrations)
      .where(inArray(registrations.id, createdRegistrationIds));
  }
  const personIds = [
    ...new Set([...createdFamilyMemberIds, createdFamilyMemberId].filter(Boolean)),
  ] as string[];
  if (personIds.length > 0) {
    await db.delete(consents).where(inArray(consents.familyMemberId, personIds));
    await db.delete(familyMembers).where(inArray(familyMembers.id, personIds));
  }
});

async function walkUp(
  seasonId: string,
  waiverSigned: boolean,
  waiverSignedBy?: string,
  who: typeof kid = kid,
) {
  return apiFetch("/api/admin/walk-up-registration", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({
      parent: {
        firstName: "Desk",
        lastName: `Parent${suffix}`,
        email: parentEmail,
        phone: "6145550142",
      },
      kid: who,
      seasonId,
      paymentStatus: "paid",
      waiverSigned,
      ...(waiverSignedBy ? { waiverSignedBy } : {}),
    }),
  });
}

async function liabilityConsents(familyMemberId: string) {
  return getDb()
    .select()
    .from(consents)
    .where(
      and(
        eq(consents.familyMemberId, familyMemberId),
        eq(consents.type, "liability"),
      ),
    );
}

async function waiverColumns(registrationId: string) {
  const [row] = await getDb()
    .select({
      waiverSigned: registrations.waiverSigned,
      waiverSignedBy: registrations.waiverSignedBy,
      waiverSignedAt: registrations.waiverSignedAt,
    })
    .from(registrations)
    .where(eq(registrations.id, registrationId));
  return row;
}

describe("walk-up desk — annual liability waiver", () => {
  it("dates and names a waiver taken at the desk, and logs it with the admin's provenance", async () => {
    const signature = `Desk Parent${suffix}`;
    const res = await walkUp(seasonAId, true, signature);
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    createdRegistrationIds.push(body.registrationId);
    createdFamilyMemberId = body.familyMemberId;
    expect(createdFamilyMemberId).toBeTruthy();

    const row = await waiverColumns(body.registrationId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(signature);
    // Both of these used to be dropped: the insert wrote only the boolean, so
    // the roster showed "signed" with no signer and no date.
    expect(row.waiverSignedAt).toBeTruthy();

    const liability = await liabilityConsents(createdFamilyMemberId!);
    expect(liability).toHaveLength(1);
    expect(liability[0].organizationId).toBeTruthy();
    expect(liability[0].signedByName).toBe(signature);
    // The consent quotes the guardian assent sentence, and its notes disclose
    // that a staff member captured it — signedByUserId is the parent, so no
    // other column carries who operated the screen.
    expect(liability[0].notes).toContain(
      walkUpWaiverAssentText("guardian", `${kid.firstName} ${kid.lastName}`),
    );
    expect(liability[0].notes).toContain("walk-up: admin=");
    expect(liability[0].notes).toContain("variant=guardian");
  });

  it("births the next registration on-file, with no signature date and no new consent", async () => {
    // Same parent + same child name/DOB → resolvePerson dedupes to the person
    // the first call created, so the annual signature is on file for them.
    const res = await walkUp(seasonBId, false);
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.familyMemberId).toBe(createdFamilyMemberId);
    createdRegistrationIds.push(body.registrationId);

    const row = await waiverColumns(body.registrationId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    // Load-bearing: a dated derived copy would satisfy the legacy
    // `registrations` fallback and renew the window it was derived from.
    expect(row.waiverSignedAt).toBeNull();

    // consents is append-only and does not dedupe — this branch is a READ.
    expect(await liabilityConsents(createdFamilyMemberId!)).toHaveLength(1);
  });

  it("records the REAL signature when the desk takes one from a COVERED person", async () => {
    // The desk collected a fresh in-person acceptance even though the person
    // was already covered. Coverage gates the ASK, not the record (caller
    // contract, clause 4) — stamping "On file (annual waiver)" over a
    // signature staff actually took would file a false audit entry, and the
    // desk's `walk-up: admin=<id>` provenance would be lost with it.
    const signature = `Desk Parent${suffix}`;

    const first = await walkUp(seasonAId, true, signature, kid2);
    const firstBody = await first.json();
    expect(first.status, JSON.stringify(firstBody)).toBe(200);
    createdRegistrationIds.push(firstBody.registrationId);
    const personId = firstBody.familyMemberId as string;
    createdFamilyMemberIds.push(personId);
    expect(await liabilityConsents(personId)).toHaveLength(1);

    // Same person, second season, waiver taken AGAIN at the desk.
    const second = await walkUp(seasonBId, true, signature, kid2);
    const secondBody = await second.json();
    expect(second.status, JSON.stringify(secondBody)).toBe(200);
    expect(secondBody.familyMemberId).toBe(personId);
    createdRegistrationIds.push(secondBody.registrationId);

    const row = await waiverColumns(secondBody.registrationId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(signature);
    // A REAL signature is dated — only derived on-file copies are not.
    expect(row.waiverSignedAt).toBeTruthy();

    // Exactly ONE row appended.
    const liability = await liabilityConsents(personId);
    expect(liability).toHaveLength(2);
    expect(liability.every((c) => c.notes?.includes("walk-up: admin="))).toBe(true);
  });
});

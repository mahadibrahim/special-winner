/**
 * Annual liability waiver, registration surfaces.
 *
 * The rule (docs/superpowers/specs/2026-08-31-annual-waiver-unification-design.md):
 * a participant who already carries a valid, org-scoped `liability` consent is
 * covered for a year and must not be asked again. These cases pin what that
 * means for `POST /api/registrations`:
 *
 *  - a covered participant's registration is BORN signed, attributed to the
 *    shared "On file (annual waiver)" string, with `waiverSignedAt` NULL —
 *    the null date is load-bearing (see below);
 *  - an expired signature, or none at all, leaves the waiver owed exactly as
 *    before;
 *  - a genuinely fresh signature is dated, named, and written to `consents`
 *    org-scoped;
 *  - a covered participant who ALSO submits a genuine signature has it
 *    RECORDED — dated columns plus one appended consents row — while a covered
 *    participant who submits none leaves the log untouched.
 *
 * Fixtures are run-unique children under the seeded parent account, torn down
 * in afterAll (registrations first — family_members is ON DELETE RESTRICT).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, desc } from "drizzle-orm";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import {
  consents,
  familyMembers,
  locations,
  programs,
  registrations,
  seasons,
} from "@/lib/db/schema";
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  WAIVER_VALID_DAYS,
} from "@/lib/consents/liability";
import { wizardWaiverAssentText } from "@/lib/registrations/waiver-text";
import { CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD } from "../utils/classes-helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

// Same slug convention as registration-completion.test.ts — the e2e seed
// catalog exports no fixture ids, so the season is resolved at runtime.
const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

let seasonId: string;
let seasonOrgId: string;
let parentUserId: string;
let cookie: string;

const createdChildIds: string[] = [];
const suffix = Math.random().toString(36).slice(2, 10);

beforeAll(async () => {
  const db = getDb();

  // The season AND its owning org in one join: waivers are org-scoped legal
  // releases, so a consents row seeded against the wrong org would prove
  // nothing (the isolation case in consents-liability.test.ts covers that).
  const [row] = await db
    .select({ id: seasons.id, organizationId: locations.organizationId })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
    .limit(1);
  if (!row?.organizationId) {
    throw new Error(
      `Adult open soccer season (slug: ${ADULT_OPEN_SEASON_SLUG}) or its owning org not found — re-run npm run db:seed:e2e`,
    );
  }
  seasonId = row.id;
  seasonOrgId = row.organizationId;

  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  const me = await apiFetch("/api/auth/me", { cookie });
  const meBody = await me.json();
  parentUserId = meBody.user?.id;
  expect(parentUserId, "signed-in parent id").toBeTruthy();
});

afterAll(async () => {
  const db = getDb();
  if (createdChildIds.length === 0) return;
  // Order matters: registrations references family_members ON DELETE RESTRICT.
  await db
    .delete(registrations)
    .where(inArray(registrations.familyMemberId, createdChildIds));
  await db.delete(consents).where(inArray(consents.familyMemberId, createdChildIds));
  await db.delete(familyMembers).where(inArray(familyMembers.id, createdChildIds));
});

/** A fresh dependent under the seeded parent, unique per run. Birthdate is
 *  adult-range (not a real "child" DOB) — this fixture registers against
 *  e2e-adult-open-soccer-2026 (18-99 age_group), and the age-eligibility
 *  gate (Task 2, F1) now 422s a mismatched-age dependent at creation. Waiver
 *  coverage logic (what this suite actually tests) doesn't care who's
 *  registering, so a compatible-age dependent keeps the fixture minimal. */
async function newChild(label: string): Promise<string> {
  const db = getDb();
  const [child] = await db
    .insert(familyMembers)
    .values({
      parentUserId,
      firstName: `AnnualWaiver${label}`,
      lastName: suffix,
      birthDate: "1995-01-01",
    })
    .returning({ id: familyMembers.id });
  createdChildIds.push(child.id);
  return child.id;
}

/** The consents row shape a real signature produces, with the age of the
 *  signature as the only knob (mirrors consents-liability.test.ts). */
async function insertLiabilityConsent(
  familyMemberId: string,
  signedDaysAgo: number,
): Promise<void> {
  const signedAt = new Date(Date.now() - signedDaysAgo * DAY_MS);
  await getDb().insert(consents).values({
    familyMemberId,
    organizationId: seasonOrgId,
    type: "liability",
    status: "granted",
    signedByUserId: parentUserId,
    signedByName: "Parent Test",
    signedAt,
    expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
  });
}

async function registerChild(
  familyMemberId: string,
  body: Record<string, unknown> = {},
): Promise<Response> {
  return apiFetch("/api/registrations", {
    method: "POST",
    cookie,
    body: JSON.stringify({
      seasonId,
      familyMemberId,
      registrationType: "full",
      waiverSigned: false,
      ...body,
    }),
  });
}

async function waiverColumns(familyMemberId: string) {
  const [row] = await getDb()
    .select({
      waiverSigned: registrations.waiverSigned,
      waiverSignedBy: registrations.waiverSignedBy,
      waiverSignedAt: registrations.waiverSignedAt,
    })
    .from(registrations)
    .where(eq(registrations.familyMemberId, familyMemberId))
    .orderBy(desc(registrations.createdAt))
    .limit(1);
  return row;
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
    )
    .orderBy(desc(consents.signedAt));
}

describe("POST /api/registrations — annual waiver on file", () => {
  it("(a) is born signed, attributed on-file, with NO signature date", async () => {
    const childId = await newChild("OnFile");
    await insertLiabilityConsent(childId, 1);

    const res = await registerChild(childId);
    expect(res.status).toBe(201);

    const row = await waiverColumns(childId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    // Load-bearing: hasValidLiabilityWaiver's legacy `registrations` fallback
    // accepts any DATED signed row, so a dated derived copy would let this
    // registration renew the very window it was derived from.
    expect(row.waiverSignedAt).toBeNull();
  });

  it("(b) an EXPIRED signature leaves the waiver owed", async () => {
    const childId = await newChild("Expired");
    await insertLiabilityConsent(childId, WAIVER_VALID_DAYS + 10);

    const res = await registerChild(childId);
    expect(res.status).toBe(201);

    const row = await waiverColumns(childId);
    expect(row.waiverSigned).toBe(false);
    expect(row.waiverSignedBy).toBeNull();
    expect(row.waiverSignedAt).toBeNull();
  });

  it("(d) does not fire for a participant with no waiver of any kind", async () => {
    const childId = await newChild("NoWaiver");

    const res = await registerChild(childId);
    expect(res.status).toBe(201);

    const row = await waiverColumns(childId);
    expect(row.waiverSigned).toBe(false);
    expect(row.waiverSignedBy).toBeNull();
  });

  it("(c) a genuinely fresh signature is dated, named, and logged org-scoped", async () => {
    const childId = await newChild("Fresh");
    const signature = `Fresh Signer ${suffix}`;

    const res = await registerChild(childId, {
      waiverSigned: true,
      waiverSignedBy: signature,
    });
    expect(res.status).toBe(201);

    const row = await waiverColumns(childId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(signature);
    // The signer name and timestamp were both dropped on the floor before —
    // the insert only ever wrote the boolean.
    expect(row.waiverSignedAt).toBeTruthy();

    const rows = await liabilityConsents(childId);
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(seasonOrgId);
    expect(rows[0].status).toBe("granted");
    expect(rows[0].signedByName).toBe(signature);
    // ip/UA come from THIS request's context, never the body.
    expect(rows[0].userAgent).toBeTruthy();
    // The record must quote what the SCREEN showed. This is the AUTHED wizard
    // registering a DEPENDENT, so waiver-step.tsx rendered the guardian body
    // sentence ("I authorize <child> to participate…") followed by the accept
    // label — not the bare adult label.
    const expectedAssent = wizardWaiverAssentText({
      variant: "guardian",
      participantName: `AnnualWaiverFresh ${suffix}`,
    });
    expect(rows[0].notes).toContain(expectedAssent);
    expect(expectedAssent).toContain("parent or legal guardian");
    expect(rows[0].notes).toContain("variant=guardian");
    const expiresAt = rows[0].expiresAt?.getTime() ?? 0;
    expect(
      Math.abs(expiresAt - (rows[0].signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS)),
    ).toBeLessThan(5000);
  });

  it("records the REAL signature when a covered family signs anyway", async () => {
    // The deliberate exception to "gate first" (see recordLiabilityWaiver's
    // caller contract): a covered family shown a stale form types a real name
    // and really assents. Stamping "On file (annual waiver)" over that would
    // file a false audit entry — the honest record is the signature, dated,
    // with its own appended consents row.
    const childId = await newChild("CoveredSigns");
    await insertLiabilityConsent(childId, 1);
    expect(await liabilityConsents(childId)).toHaveLength(1);

    const res = await registerChild(childId, {
      waiverSigned: true,
      waiverSignedBy: "Redundant Signer",
    });
    expect(res.status).toBe(201);
    // The response still reports coverage — the completion form keeps
    // dropping the release for this family.
    expect((await res.json()).waiverOnFile).toBe(true);

    const rows = await liabilityConsents(childId);
    expect(rows).toHaveLength(2);
    expect(rows[0].signedByName).toBe("Redundant Signer");
    // ip/UA come from THIS request's context, never the body.
    expect(rows[0].userAgent).toBeTruthy();
    expect(rows[0].status).toBe("granted");

    const row = await waiverColumns(childId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Redundant Signer");
    expect(row.waiverSignedAt).toBeTruthy();
  });

  it("appends nothing when a covered family submits NO signature", async () => {
    // The other side of the same rule, and the one that keeps the annual
    // waiver from renewing itself: with no signature field in the payload
    // there is no human act to record, so the on-file branch stays a pure
    // READ — undated stamp, log untouched.
    const childId = await newChild("CoveredSilent");
    await insertLiabilityConsent(childId, 1);
    expect(await liabilityConsents(childId)).toHaveLength(1);

    const res = await registerChild(childId);
    expect(res.status).toBe(201);

    expect(await liabilityConsents(childId)).toHaveLength(1);
    const row = await waiverColumns(childId);
    expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    expect(row.waiverSignedAt).toBeNull();
  });
});

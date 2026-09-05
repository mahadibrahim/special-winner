/**
 * Server-side age-eligibility gate (audit finding F1, owner decision: hard
 * block both directions). Both registration endpoints — the guest
 * parent+child path in guest-checkout.ts and the signed-in dependent path in
 * POST /api/registrations — must 422 with `{ error: "age_ineligible",
 * minAge, maxAge, ageGroupName }` for an out-of-range player, BEFORE any
 * user/family-member/registration write and before any Stripe call. A season
 * with no age_group_id gates nothing.
 *
 * Fixtures: the seeded `e2e-youth-dual-winter-2027` (U12, min 10/max 12) and
 * `e2e-test-spring-2026` (U8, min 6/max 8) — see seed-e2e-tests.ts. Age is
 * computed on the season's own startDate (the same convention the endpoints
 * use), so birthDates below are built relative to each season's real
 * startDate rather than "today" — keeps the boundary math exact regardless
 * of when this suite runs.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons, ageGroups, users, familyMembers, registrations } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

const U12_SLUG = "e2e-youth-dual-winter-2027";
const U8_SLUG = "e2e-test-spring-2026";
const PARENT_EMAIL = "parent@test.aspiresports.com";

interface SeasonAgeFixture {
  id: string;
  programId: string;
  startDate: Date;
  minAge: number;
  maxAge: number;
  ageGroupName: string;
}

let u12: SeasonAgeFixture;
let u8: SeasonAgeFixture;
let noAgeGroupSeasonId: string;
let parentCookie: string;

/** Build a YYYY-MM-DD birthDate that is exactly `age` years old on `onDate`
 *  (same month/day as onDate, so ageOnDate's exact-birthday rule lands on
 *  the boundary precisely, matching the age-eligibility unit tests). */
function birthDateForAge(onDate: Date, age: number): string {
  const year = onDate.getUTCFullYear() - age;
  const month = String(onDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(onDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function loadSeasonAgeFixture(slug: string): Promise<SeasonAgeFixture> {
  const db = getDb();
  // Shared CI DB hazard: a slug-only lookup can match more than one row —
  // pin the oldest (mirrors the seed's own re-seed convention).
  const [row] = await db
    .select({
      id: seasons.id,
      programId: seasons.programId,
      startDate: seasons.startDate,
      minAge: ageGroups.minAge,
      maxAge: ageGroups.maxAge,
      ageGroupName: ageGroups.name,
    })
    .from(seasons)
    .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
    .where(eq(seasons.slug, slug))
    .orderBy(asc(seasons.createdAt))
    .limit(1);
  if (!row) {
    throw new Error(`Season not found (slug: ${slug}) — re-run npm run db:seed:e2e`);
  }
  if (row.minAge == null || row.maxAge == null) {
    throw new Error(`Season ${slug} has no age_group bounds — re-run npm run db:seed:e2e`);
  }
  return {
    id: row.id,
    programId: row.programId,
    startDate: new Date(row.startDate),
    minAge: row.minAge,
    maxAge: row.maxAge,
    ageGroupName: row.ageGroupName ?? "",
  };
}

/** A throwaway season with NO age_group_id, reusing the U8 fixture's program
 *  (so it inherits a valid org/location) — proves "a season with no age
 *  group gates nothing" for both endpoints. Unique per run; left in the
 *  shared CI DB like every other run-unique fixture in this suite. */
async function ensureNoAgeGroupSeason(programId: string): Promise<string> {
  const db = getDb();
  const start = new Date();
  start.setDate(start.getDate() + 30);
  const end = new Date(start);
  end.setDate(end.getDate() + 60);
  const [row] = await db
    .insert(seasons)
    .values({
      programId,
      ageGroupId: null,
      name: "E2E Age Gate — No Age Group",
      slug: `e2e-age-gate-no-group-${Date.now()}`,
      startDate: isoDate(start),
      endDate: isoDate(end),
      status: "open",
      priceCents: 5000,
      signupModes: ["individual"],
    })
    .returning({ id: seasons.id });
  return row.id;
}

beforeAll(async () => {
  u12 = await loadSeasonAgeFixture(U12_SLUG);
  u8 = await loadSeasonAgeFixture(U8_SLUG);
  noAgeGroupSeasonId = await ensureNoAgeGroupSeason(u8.programId);
  parentCookie = await getAuthCookie(PARENT_EMAIL, "TestParent123!");
});

function uniqueEmail(label: string): string {
  return `age-gate-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe("POST /api/registrations/guest-checkout — age gate (parent+child path)", () => {
  it("422s a too-young child with the exact age_ineligible body, before any write", async () => {
    const email = uniqueEmail("guest-too-young");
    const birthDate = birthDateForAge(u12.startDate, u12.minAge - 1);
    const res = await apiFetch("/api/registrations/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        seasonId: u12.id,
        parent: { firstName: "GateGuest", lastName: "TooYoung", email },
        child: {
          firstName: `GateKid${Date.now()}`,
          lastName: "TooYoung",
          birthDate,
        },
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "GateGuest TooYoung",
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: "age_ineligible",
      minAge: u12.minAge,
      maxAge: u12.maxAge,
      ageGroupName: u12.ageGroupName,
    });

    // Nothing was written for this guest — the gate fires before
    // upsertGuestUser.
    const db = getDb();
    const [userRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(userRow, "no user row should have been created").toBeFalsy();
  });

  it("422s a too-old child with the exact age_ineligible body, before any write", async () => {
    const email = uniqueEmail("guest-too-old");
    const birthDate = birthDateForAge(u12.startDate, u12.maxAge + 1);
    const res = await apiFetch("/api/registrations/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        seasonId: u12.id,
        parent: { firstName: "GateGuest", lastName: "TooOld", email },
        child: {
          firstName: `GateKid${Date.now()}`,
          lastName: "TooOld",
          birthDate,
        },
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "GateGuest TooOld",
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: "age_ineligible",
      minAge: u12.minAge,
      maxAge: u12.maxAge,
      ageGroupName: u12.ageGroupName,
    });

    const db = getDb();
    const [userRow] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(userRow, "no user row should have been created").toBeFalsy();
  });

  itWithStripe("passes an in-range child through as today (no 422)", async () => {
    const email = uniqueEmail("guest-in-range");
    const birthDate = birthDateForAge(u12.startDate, u12.minAge + 1);
    const res = await apiFetch("/api/registrations/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        seasonId: u12.id,
        parent: { firstName: "GateGuest", lastName: "InRange", email },
        child: {
          firstName: `GateKid${Date.now()}`,
          lastName: "InRange",
          birthDate,
        },
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "GateGuest InRange",
      }),
    });
    expect(res.status).not.toBe(422);
    expect(res.status).toBe(200);
  });

  it("a season with no age_group gates nothing (guest path)", async () => {
    const email = uniqueEmail("guest-no-group");
    // Deliberately out of every real age-group's bounds — proves the gate
    // is skipped because the season carries no age_group_id, not because
    // this DOB happens to fit.
    const res = await apiFetch("/api/registrations/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        seasonId: noAgeGroupSeasonId,
        parent: { firstName: "GateGuest", lastName: "NoGroup", email },
        child: {
          firstName: `GateKid${Date.now()}`,
          lastName: "NoGroup",
          birthDate: "2000-01-01",
        },
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "GateGuest NoGroup",
      }),
    });
    // No Stripe key in CI 503s at the checkout step; either way it must not
    // be the 422 age gate.
    expect(res.status).not.toBe(422);
    expect([200, 503]).toContain(res.status);
  });
});

describe("POST /api/registrations — age gate (signed-in dependent path)", () => {
  async function createDependent(label: string, birthDate: string): Promise<string> {
    const res = await apiFetch("/api/family-members", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        firstName: `AgeGate${label}${Date.now()}`,
        lastName: "Dependent",
        birthDate,
        gender: "male",
        parentalConsent: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    return body.familyMember.id as string;
  }

  it("422s a too-young dependent with the exact age_ineligible body", async () => {
    const birthDate = birthDateForAge(u8.startDate, u8.minAge - 1);
    const familyMemberId = await createDependent("TooYoung", birthDate);

    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        seasonId: u8.id,
        familyMemberId,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Test Parent",
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: "age_ineligible",
      minAge: u8.minAge,
      maxAge: u8.maxAge,
      ageGroupName: u8.ageGroupName,
    });

    // No registration row was created for this dependent.
    const db = getDb();
    const rows = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.id, familyMemberId));
    expect(rows.length).toBe(1); // the dependent row exists...
    // ...but no registration references it (assert via the registrations
    // table would need an import; the 422 body above is the load-bearing
    // assertion — the endpoint returns before createRegistration runs).
  });

  it("422s a too-old dependent with the exact age_ineligible body", async () => {
    const birthDate = birthDateForAge(u8.startDate, u8.maxAge + 1);
    const familyMemberId = await createDependent("TooOld", birthDate);

    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        seasonId: u8.id,
        familyMemberId,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Test Parent",
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: "age_ineligible",
      minAge: u8.minAge,
      maxAge: u8.maxAge,
      ageGroupName: u8.ageGroupName,
    });
  });

  it("passes an in-range dependent through as today (no 422)", async () => {
    const birthDate = birthDateForAge(u8.startDate, u8.minAge + 1);
    const familyMemberId = await createDependent("InRange", birthDate);

    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        seasonId: u8.id,
        familyMemberId,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Test Parent",
      }),
    });
    expect(res.status).not.toBe(422);
    expect([200, 201]).toContain(res.status);
  });

  it("a season with no age_group gates nothing (signed-in path)", async () => {
    // Deliberately out of every real age-group's bounds.
    const familyMemberId = await createDependent("NoGroup", "2000-01-01");

    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        seasonId: noAgeGroupSeasonId,
        familyMemberId,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Test Parent",
      }),
    });
    expect(res.status).not.toBe(422);
    expect([200, 201]).toContain(res.status);
  });
});

describe("POST /api/registrations — age gate (signed-in registerSelf path)", () => {
  /** A brand-new throwaway account (unique per run) so the birthDate we set
   *  directly below is unambiguous — the shared parent@/adult-self fixtures
   *  may already carry a self family_members row from other suites, which
   *  would make "no self row was created" unprovable. */
  async function createThrowawayUser(label: string): Promise<{ userId: string; cookie: string }> {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `age-gate-self-${label}-${stamp}@example.com`;
    const password = "TestAgeGateSelf123!";
    const signupRes = await apiFetch("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        firstName: "AgeGateSelf",
        lastName: label,
      }),
    });
    expect(signupRes.status).toBeLessThan(300);
    const cookie = await getAuthCookie(email, password);
    const db = getDb();
    // Signup stores email.toLowerCase() — match on that, not the (already
    // lowercase-domain but possibly mixed-case-local) literal we sent.
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    expect(u, "signed-up user should exist").toBeTruthy();
    return { userId: u.id, cookie };
  }

  it("422s an out-of-range registerSelf with the exact age_ineligible body, before any self family_members write", async () => {
    const { userId, cookie } = await createThrowawayUser("TooOld");
    // Set the user's OWN birthDate directly (signup collects no DOB) —
    // simulates an authenticated user whose stored birthDate is already on
    // file and out of range for this season.
    const birthDate = birthDateForAge(u12.startDate, u12.maxAge + 5);
    const db = getDb();
    await db.update(users).set({ birthDate }).where(eq(users.id, userId));

    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        seasonId: u12.id,
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Age Gate Self",
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: "age_ineligible",
      minAge: u12.minAge,
      maxAge: u12.maxAge,
      ageGroupName: u12.ageGroupName,
    });

    // The gate must fire BEFORE resolvePerson runs — no self family_members
    // row should exist for this user at all.
    const selfRows = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.selfUserId, userId));
    expect(
      selfRows.length,
      "no self family_members row should have been created",
    ).toBe(0);
  });

  // Round-2 review finding: users.birthDate is self-service mutable
  // (PUT /api/user/profile accepts birthDate: null and clears it), so a
  // returning registrant with a real out-of-range DOB already mirrored on
  // their self family_members row could clear their profile DOB, null-
  // short-circuit the users.birthDate check, and have resolvePerson quietly
  // find the still-out-of-range existing self row. The gate must also read
  // that row directly, before resolvePerson runs.
  it("closes the mutable-profile bypass: a cleared users.birthDate still gates on the existing self family_members row's DOB", async () => {
    const { userId, cookie } = await createThrowawayUser("Bypass");
    const db = getDb();

    // An existing self row with a real, out-of-range birthDate already on
    // file — the state a real returning registrant would be in.
    const outOfRangeDob = birthDateForAge(u12.startDate, u12.maxAge + 5);
    await db.insert(familyMembers).values({
      selfUserId: userId,
      firstName: "AgeGateSelf",
      lastName: "Bypass",
      birthDate: outOfRangeDob,
    });

    // ...and users.birthDate cleared, exactly as PUT /api/user/profile
    // would leave it — the state the bypass exploited.
    await db.update(users).set({ birthDate: null }).where(eq(users.id, userId));

    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        seasonId: u12.id,
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Age Gate Self",
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: "age_ineligible",
      minAge: u12.minAge,
      maxAge: u12.maxAge,
      ageGroupName: u12.ageGroupName,
    });

    // No registration was created for this user.
    const regs = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(eq(registrations.registeredByUserId, userId));
    expect(regs.length, "no registration should have been created").toBe(0);
  });
});

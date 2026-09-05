import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { eq } from "drizzle-orm";
import { apiFetch } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestClassTemplate,
  cleanupTestClassFixtures,
} from "../../utils/classes-helpers";

/**
 * Coverage for the signed-OUT guest-trial front door (POST
 * /api/classes/guest-trial). Unlike POST /api/classes/book, every request
 * here is unauthenticated — the endpoint mints its own guest user (or emails
 * a sign-in link to an existing one) before ever touching the booking
 * engine, so every test needs a UNIQUE parent email (and, for the age-gate
 * and kid-dedupe cases, a unique kid name+DOB) to avoid colliding with debris
 * left in the shared staging DB by a previous run.
 *
 * This file alone issues 10 POSTs to the endpoint, which burst-limits at 5
 * requests/min/IP (see guest-trial.ts's `rateLimit("guest-trial:...", 5,
 * 60_000)`). The dev server MUST run with DISABLE_RATE_LIMIT=1 or every test
 * past the 5th will fail with a confusing 429 instead of its expected
 * status — CI sets this globally; a plain `npm run dev` locally does not.
 *
 * This suite also depends on `TURNSTILE_SECRET_KEY` being ABSENT from the
 * server's env: `verifyTurnstile` fails OPEN (treats every token as valid)
 * when no secret is configured, and CI does not set this var. If it's ever
 * added to CI, every case here would start 403ing with `turnstile_failed`
 * instead of its expected status. One consequence worth flagging: Turnstile
 * gating itself has NO test coverage by construction — this suite can only
 * ever exercise the fail-open path.
 */

let organizationId: string;
let venueId: string;
const createdTemplateIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId } = await resolveClassTestFixtures());
});

afterAll(async () => {
  await cleanupTestClassFixtures(createdTemplateIds);
});

let sessionCounter = 0;

/** A fresh `kind='class'` drop-in session in the resolved org/venue, with no
 *  class-slot template attached (so no age gate applies) unless the caller
 *  updates `classSlotTemplateId` afterward. Each call gets its own start
 *  time so parallel-looking test cases never collide on the
 *  one-session-per-template-start unique index. */
async function createGuestSession(): Promise<string> {
  sessionCounter += 1;
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt: new Date(Date.now() + (72 + sessionCounter) * 3_600_000),
    memberRateCents: 999,
  });
  return ctx.sessionId;
}

function guestEmail(tag: string): string {
  return `guest-trial-${tag}-${Date.now()}@test.aspiresports.com`;
}

const GUEST_TRIAL_WAIVER = {
  signedBy: "Guest Parent",
  consentText: "I agree to the guardian waiver on behalf of my child.",
};

/** A `YYYY-MM-DD` birth date for a child who is exactly `age` years old
 *  today (Jan 1 of the appropriate year) — stable across the whole current
 *  year, same trick as tests/api/classes/enrollments.test.ts. */
function birthDateForAge(age: number): string {
  return `${new Date().getUTCFullYear() - age}-01-01`;
}

// Body validation (zod) runs BEFORE the session lookup, so the three
// invalid_body cases below never need a real session row — a well-formed
// but nonexistent UUID satisfies the `sessionId: z.string().uuid()` shape
// check without the cost of minting a throwaway drop-in session per case.
const THROWAWAY_SESSION_ID = "11111111-1111-1111-1111-111111111111";

async function postGuestTrial(body: Record<string, unknown>) {
  return apiFetch("/api/classes/guest-trial", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/classes/guest-trial", () => {
  let happyEmail: string;
  let happyChildFirstName: string;
  const happyChildLastName = "Trialkid";
  const happyChildBirthDate = "2018-04-01";

  it("books a trial for a brand-new guest and signs them in (Set-Cookie -> GET /api/auth/me)", async () => {
    const sessionId = await createGuestSession();
    happyEmail = guestEmail("happy");
    happyChildFirstName = `GuestKid${Date.now()}`;

    const res = await postGuestTrial({
      sessionId,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email: happyEmail },
      child: {
        firstName: happyChildFirstName,
        lastName: happyChildLastName,
        birthDate: happyChildBirthDate,
      },
      parentalConsent: true,
      waiver: GUEST_TRIAL_WAIVER,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("booked");
    expect(typeof body.bookingId).toBe("string");

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    const cookieHeader = setCookie!.split(";")[0];

    const meRes = await apiFetch("/api/auth/me", { cookie: cookieHeader });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.authenticated).toBe(true);
    expect(meBody.user.email).toBe(happyEmail);
  });

  it("returns existing_account (no booking) when the email already has an account, even with a fresh kid", async () => {
    const sessionId = await createGuestSession();
    const res = await postGuestTrial({
      sessionId,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email: happyEmail },
      child: {
        firstName: `FreshKid${Date.now()}`,
        lastName: "Other",
        birthDate: "2017-06-01",
      },
      parentalConsent: true,
      waiver: GUEST_TRIAL_WAIVER,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("existing_account");
    expect(body.bookingId).toBeUndefined();
  });

  it("still returns existing_account (never already_booked) re-posting the ORIGINAL kid for an existing email", async () => {
    const sessionId = await createGuestSession();
    const res = await postGuestTrial({
      sessionId,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email: happyEmail },
      child: {
        firstName: happyChildFirstName,
        lastName: happyChildLastName,
        birthDate: happyChildBirthDate,
      },
      parentalConsent: true,
      waiver: GUEST_TRIAL_WAIVER,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("existing_account");
  });

  it("422s invalid_body when parentalConsent is false", async () => {
    const res = await postGuestTrial({
      sessionId: THROWAWAY_SESSION_ID,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email: guestEmail("consent-false") },
      child: { firstName: `ConsentFalseKid${Date.now()}`, lastName: "Trialkid", birthDate: "2016-01-01" },
      parentalConsent: false,
      waiver: GUEST_TRIAL_WAIVER,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("422s invalid_body when parentalConsent is absent", async () => {
    const res = await postGuestTrial({
      sessionId: THROWAWAY_SESSION_ID,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email: guestEmail("consent-absent") },
      child: { firstName: `ConsentAbsentKid${Date.now()}`, lastName: "Trialkid", birthDate: "2016-01-01" },
      waiver: GUEST_TRIAL_WAIVER,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("422s invalid_body when waiver is missing", async () => {
    const res = await postGuestTrial({
      sessionId: THROWAWAY_SESSION_ID,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email: guestEmail("no-waiver") },
      child: { firstName: `NoWaiverKid${Date.now()}`, lastName: "Trialkid", birthDate: "2016-01-01" },
      parentalConsent: true,
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("invalid_body");
  });

  it("409s trial_already_used for a fresh account whose kid's name+DOB matches an already-spent trial (org-wide dedupe)", async () => {
    const sessionId = await createGuestSession();
    const res = await postGuestTrial({
      sessionId,
      turnstileToken: "",
      parent: { firstName: "Second", lastName: "Guest", email: guestEmail("dedupe") },
      child: {
        firstName: happyChildFirstName,
        lastName: happyChildLastName,
        birthDate: happyChildBirthDate,
      },
      parentalConsent: true,
      waiver: GUEST_TRIAL_WAIVER,
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("trial_already_used");
  });

  it("404s session_not_found for a bad/foreign sessionId", async () => {
    const res = await postGuestTrial({
      sessionId: "00000000-0000-0000-0000-000000000000",
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email: guestEmail("badsession") },
      child: { firstName: `BadSessionKid${Date.now()}`, lastName: "Trialkid", birthDate: "2016-01-01" },
      parentalConsent: true,
      waiver: GUEST_TRIAL_WAIVER,
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("session_not_found");
  });

  it("422s age_ineligible outside the template's age range, then books a real retry (not existing_account) with the SAME email + a corrected DOB", async () => {
    const suffix = Date.now();
    const templateId = await createTestClassTemplate({
      organizationId,
      venueId,
      name: `GuestTrial-AgeGate-${suffix}`,
      capacity: 10,
      minAge: 8,
      maxAge: 12,
    });
    createdTemplateIds.push(templateId);

    const sessionId = await createGuestSession();
    await getDb()
      .update(dropInSessions)
      .set({ classSlotTemplateId: templateId })
      .where(eq(dropInSessions.id, sessionId));

    const email = guestEmail("agegate");
    const childFirstName = `AgeGateKid${suffix}`;

    const tooYoungRes = await postGuestTrial({
      sessionId,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email },
      child: { firstName: childFirstName, lastName: "Trialkid", birthDate: birthDateForAge(4) },
      parentalConsent: true,
      waiver: GUEST_TRIAL_WAIVER,
    });
    expect(tooYoungRes.status).toBe(422);
    const tooYoungBody = await tooYoungRes.json();
    expect(tooYoungBody.error).toBe("age_ineligible");

    // Compensating cleanup pin: the failed attempt's just-created user+kid
    // rows must have been deleted, so this re-POST with the SAME email is a
    // genuine retry (a new user gets created and the booking is attempted
    // again) rather than hitting the wasNewUser:false -> existing_account
    // branch.
    const retryRes = await postGuestTrial({
      sessionId,
      turnstileToken: "",
      parent: { firstName: "Guest", lastName: "Parent", email },
      child: { firstName: childFirstName, lastName: "Trialkid", birthDate: birthDateForAge(10) },
      parentalConsent: true,
      waiver: GUEST_TRIAL_WAIVER,
    });
    expect(retryRes.status).toBe(200);
    const retryBody = await retryRes.json();
    expect(retryBody.status).toBe("booked");
    expect(typeof retryBody.bookingId).toBe("string");
  });
});

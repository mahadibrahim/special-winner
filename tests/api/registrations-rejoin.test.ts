import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getParentCookie, apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons, users, familyMembers, registrations } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

// Cancelled-registration lockout fix (funnel-friction Wave A, Task 1):
// createRegistration's existing-registration lookup used to take the OLDEST
// row for a (familyMember, season) pair regardless of status, so a
// `cancelled` row permanently triggered "already registered" and blocked
// re-registration forever. The lookup now excludes cancelled/refunded rows
// (mirrors the DB's own registrations_member_season_active_uniq partial
// index), and the live-row throw is now a structured 409 `already_registered`.
//
// Uses the seeded adult-open season purely as a stable, price-simple season
// fixture — registrations here are created via familyMemberId (dependent
// path), not registerSelf, so this exercises the shared lookup/throw code
// that both v1 (youth) and v2 (adult) flows go through. Each test gets its
// own fresh family member row so it can't collide with other suites reusing
// the shared parent@test.aspiresports.com account on this season.
const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";
const PARENT_EMAIL = "parent@test.aspiresports.com";

let seasonId: string;
let parentUserId: string;
let parentCookie: string;
const cleanupMemberIds: string[] = [];

beforeAll(async () => {
  const db = getDb();

  const [season] = await db
    .select({ id: seasons.id, maxParticipants: seasons.maxParticipants })
    .from(seasons)
    .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
    .limit(1);
  if (!season) {
    throw new Error(
      `Adult open soccer season not found (slug: ${ADULT_OPEN_SEASON_SLUG}) — re-run npm run db:seed:e2e`,
    );
  }
  seasonId = season.id;

  // The shared staging DB accumulates confirmed registrations on this season
  // across many prior test runs (54 confirmed vs. a maxParticipants of 30 as
  // of this writing) — capacity/waitlist behavior isn't what this suite
  // tests, so uncap it here rather than have unrelated pollution flip
  // "created" into "waitlisted" underneath these assertions.
  if (season.maxParticipants !== null) {
    await db
      .update(seasons)
      .set({ maxParticipants: null })
      .where(eq(seasons.id, season.id));
  }

  const [parent] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PARENT_EMAIL))
    .limit(1);
  if (!parent) {
    throw new Error(`Parent test account not found (${PARENT_EMAIL}) — re-run npm run db:seed:e2e`);
  }
  parentUserId = parent.id;

  parentCookie = await getParentCookie();
});

afterAll(async () => {
  if (cleanupMemberIds.length === 0) return;
  const db = getDb();
  await db.delete(registrations).where(inArray(registrations.familyMemberId, cleanupMemberIds));
  await db.delete(familyMembers).where(inArray(familyMembers.id, cleanupMemberIds));
});

async function makePerson(label: string) {
  const db = getDb();
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId,
      firstName: "Rejoin",
      lastName: `${label}-${unique}`,
      birthDate: "2015-01-01",
    })
    .returning();
  cleanupMemberIds.push(member.id);
  return member;
}

function registerBody(familyMemberId: string) {
  return JSON.stringify({
    seasonId,
    familyMemberId,
    registrationType: "full",
    waiverSigned: true,
    waiverSignedBy: "Test Parent",
  });
}

describe("cancelled registrations no longer block re-registration", () => {
  it("a cancelled row falls through to a fresh registration", async () => {
    const member = await makePerson("cancel");

    const createRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.registration.status).toBe("pending");

    const cancelRes = await apiFetch(`/api/registrations/${created.registration.id}/cancel`, {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({ reason: "test cleanup" }),
    });
    expect(cancelRes.status).toBe(200);
    const cancelled = await cancelRes.json();
    expect(cancelled.registration.status).toBe("cancelled");

    const rejoinRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(rejoinRes.status).toBe(201);
    const rejoined = await rejoinRes.json();
    expect(rejoined.resumed).toBeFalsy();
    expect(rejoined.registration.id).not.toBe(created.registration.id);
    expect(rejoined.registration.status).toBe("pending");
  });

  it("a paid/confirmed row still blocks with a structured 409 already_registered", async () => {
    const member = await makePerson("paid");

    const createRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    // Simulate a completed payment directly — the payment/webhook path is
    // out of scope here; this test only needs a live (non-cancelled) row.
    await getDb()
      .update(registrations)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: created.registration.amountDueCents,
      })
      .where(eq(registrations.id, created.registration.id));

    const blockedRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(blockedRes.status).toBe(409);
    const body = await blockedRes.json();
    expect(body.error).toBe("already_registered");
    expect(body.message).toBe("This player is already registered for this season");
  });

  it("a pending/unpaid row still resumes instead of blocking", async () => {
    const member = await makePerson("pending");

    const createRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.registration.status).toBe("pending");

    const resumeRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(resumeRes.status).toBe(200);
    const resumed = await resumeRes.json();
    expect(resumed.resumed).toBe(true);
    expect(resumed.registration.id).toBe(created.registration.id);
  });

  it("a refunded row also falls through to a fresh registration", async () => {
    const member = await makePerson("refunded");

    const createRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    // Mirrors the DB's registrations_member_season_active_uniq partial index,
    // which already excludes 'refunded' alongside 'cancelled' so a refunded
    // member can hold a fresh row — the lookup now matches that intent.
    await getDb()
      .update(registrations)
      .set({ status: "refunded", paymentStatus: "refunded" })
      .where(eq(registrations.id, created.registration.id));

    const rejoinRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: parentCookie,
      body: registerBody(member.id),
    });
    expect(rejoinRes.status).toBe(201);
    const rejoined = await rejoinRes.json();
    expect(rejoined.resumed).toBeFalsy();
    expect(rejoined.registration.id).not.toBe(created.registration.id);
  });
});

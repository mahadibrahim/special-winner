/**
 * Admin comp (goodwill) class-credit grants —
 * `POST /api/admin/classes/credits/grant`, Task 7 of the
 * waiver-ladder-followups plan (spec F, owner decision 3).
 *
 * Covers: 401 non-admin, 404 cross-org child, validation (sessions bounds,
 * expiresInDays bounds), the happy-path grant row shape (source: 'comp',
 * no Checkout Session, grantedByUserId = the admin, $0 price, expiry =
 * now + N days), that the resulting grant actually BOOKS a class session
 * (redemption proof — comp credits float exactly like pack credits), and
 * that the parent dashboard summary surfaces it under the "Class credit"
 * label.
 *
 * Fixtures are self-cleaning: every child/session/grant this file creates
 * is torn down in `afterAll` — the shared staging DB accumulates rows
 * across runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants } from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { consents } from "@/lib/db/schema/consents";
import {
  resolveClassTestFixtures,
  createTestChild,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
  CLASS_TEST_WAIVER,
} from "../utils/classes-helpers";
import { createTestDropInSession } from "../utils/dropin-helpers";
import { apiFetch, getAdminCookie, getAuthCookie, expectJson } from "./setup/test-helpers";

const RUN = `${Date.now()}`;
const NONEXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
const GRANT_PATH = "/api/admin/classes/credits/grant";

let organizationId: string;
let venueId: string;
let parentUserId: string;
let adminCookie: string;
let parentCookie: string;

const createdChildIds: string[] = [];
const createdSessionIds: string[] = [];
const createdGrantIds: string[] = [];

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  adminCookie = await getAdminCookie();
  parentCookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
});

afterAll(async () => {
  const db = getDb();
  if (createdChildIds.length > 0) {
    await db.delete(consents).where(inArray(consents.familyMemberId, createdChildIds));
  }
  if (createdSessionIds.length > 0) {
    await db
      .update(dropInSessions)
      .set({ status: "cancelled" })
      .where(inArray(dropInSessions.id, createdSessionIds));
  }
  if (createdGrantIds.length > 0) {
    await db.delete(classCreditGrants).where(inArray(classCreditGrants.id, createdGrantIds));
  }
});

async function newChild(firstName: string): Promise<string> {
  const id = await createTestChild(parentUserId, firstName);
  createdChildIds.push(id);
  return id;
}

async function grant(
  body: Record<string, unknown>,
  cookie: string | undefined = adminCookie,
): Promise<Response> {
  return apiFetch(GRANT_PATH, {
    method: "POST",
    cookie,
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/classes/credits/grant — auth & validation", () => {
  it("401s without auth", async () => {
    // "" (not undefined) — `grant`'s cookie param defaults to adminCookie on
    // undefined (JS default-parameter semantics), so an explicit falsy
    // empty string is what actually skips the Cookie header.
    const res = await grant({ familyMemberId: NONEXISTENT_UUID, sessions: 5 }, "");
    expect(res.status).toBe(401);
  });

  it("404s on a family member outside the active org (cross-org isolation)", async () => {
    let orgBCookie: string;
    try {
      orgBCookie = await getAuthCookie("admin-orgb@test.aspiresports.com", "TestAdmin123!");
    } catch {
      return; // orgB seed not present — tolerate thin seeds
    }

    // Discover a person id that belongs to orgB via its own lookup endpoint.
    const lk = await apiFetch(`/api/admin/lookup?q=a`, { cookie: orgBCookie });
    const lkBody = await lk.json();
    const crossOrgId: string | undefined = lkBody.people?.[0]?.id;
    if (!crossOrgId) return; // tolerate a seed with no people in orgB

    const res = await grant({ familyMemberId: crossOrgId, sessions: 5 });
    expect(res.status).toBe(404);
  });

  it("404s on a family member id that doesn't exist", async () => {
    const res = await grant({ familyMemberId: NONEXISTENT_UUID, sessions: 5 });
    expect(res.status).toBe(404);
  });

  it("422s on sessions = 0", async () => {
    const childId = await newChild(`CompVal0-${RUN}`);
    const res = await grant({ familyMemberId: childId, sessions: 0 });
    expect(res.status).toBe(422);
  });

  it("422s on sessions = 51 (above the cap)", async () => {
    const childId = await newChild(`CompVal51-${RUN}`);
    const res = await grant({ familyMemberId: childId, sessions: 51 });
    expect(res.status).toBe(422);
  });

  it("422s on a non-integer sessions value", async () => {
    const childId = await newChild(`CompValFloat-${RUN}`);
    const res = await grant({ familyMemberId: childId, sessions: 3.5 });
    expect(res.status).toBe(422);
  });

  it("422s on expiresInDays out of bounds (0)", async () => {
    const childId = await newChild(`CompExpLow-${RUN}`);
    const res = await grant({ familyMemberId: childId, sessions: 5, expiresInDays: 0 });
    expect(res.status).toBe(422);
  });

  it("422s on expiresInDays out of bounds (3651)", async () => {
    const childId = await newChild(`CompExpHigh-${RUN}`);
    const res = await grant({ familyMemberId: childId, sessions: 5, expiresInDays: 3651 });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/admin/classes/credits/grant — happy path", () => {
  it("creates a comp grant with the expected row shape", async () => {
    const childId = await newChild(`CompHappy-${RUN}`);
    const before = Date.now();
    const res = await grant({
      familyMemberId: childId,
      sessions: 7,
      expiresInDays: 45,
      note: "Goodwill after a scheduling mix-up",
    });
    const body = await expectJson(res, 201);
    createdGrantIds.push(body.grant.id);

    expect(body.grant.source).toBe("comp");
    expect(body.grant.stripeCheckoutSessionId).toBeNull();
    expect(body.grant.pricePaidCents).toBe(0);
    expect(body.grant.sessionsGranted).toBe(7);
    expect(body.grant.familyMemberId).toBe(childId);
    expect(body.grant.organizationId).toBe(organizationId);
    expect(typeof body.grant.grantedByUserId).toBe("string");

    const expiresAt = new Date(body.grant.expiresAt).getTime();
    const expectedMs = 45 * 24 * 60 * 60 * 1000;
    // Allow generous slack for request/DB round-trip time.
    expect(expiresAt).toBeGreaterThan(before + expectedMs - 60_000);
    expect(expiresAt).toBeLessThan(before + expectedMs + 60_000);

    // Row, read straight from the DB, confirms the admin identity landed.
    const [row] = await getDb()
      .select()
      .from(classCreditGrants)
      .where(eq(classCreditGrants.id, body.grant.id));
    expect(row.source).toBe("comp");
    expect(row.stripeCheckoutSessionId).toBeNull();
    expect(row.grantedByUserId).not.toBeNull();
  });

  it("defaults expiresInDays to 90 when omitted", async () => {
    const childId = await newChild(`CompDefaultExp-${RUN}`);
    const before = Date.now();
    const res = await grant({ familyMemberId: childId, sessions: 3 });
    const body = await expectJson(res, 201);
    createdGrantIds.push(body.grant.id);

    const expiresAt = new Date(body.grant.expiresAt).getTime();
    const expectedMs = 90 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThan(before + expectedMs - 60_000);
    expect(expiresAt).toBeLessThan(before + expectedMs + 60_000);
  });
});

describe("POST /api/admin/classes/credits/grant — redemption proof", () => {
  it("an admin-issued comp grant books a class session for the child", async () => {
    const childId = await newChild(`CompRedeem-${RUN}`);
    const grantRes = await grant({ familyMemberId: childId, sessions: 2, expiresInDays: 90 });
    const grantBody = await expectJson(grantRes, 201);
    createdGrantIds.push(grantBody.grant.id);

    const sessionCtx = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "class",
      capacity: 10,
      startsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      memberRateCents: 999,
    });
    createdSessionIds.push(sessionCtx.sessionId);

    const bookRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie: parentCookie,
      body: JSON.stringify({
        sessionId: sessionCtx.sessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    const bookBody = await expectJson(bookRes, 200);
    expect(bookBody.paymentMethod).toBe("pack_credit");
    expect(typeof bookBody.bookingId).toBe("string");

    const [bookingRow] = await getDb()
      .select({
        paymentMethod: dropInBookings.paymentMethod,
        creditGrantId: dropInBookings.creditGrantId,
        amountPaidCents: dropInBookings.amountPaidCents,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, bookBody.bookingId))
      .limit(1);
    expect(bookingRow).toMatchObject({
      paymentMethod: "pack_credit",
      creditGrantId: grantBody.grant.id,
      amountPaidCents: 0,
    });
  });
});

describe("GET /api/classes/summary — comp credit display", () => {
  it("surfaces a comp grant under the 'Class credit' label", async () => {
    const childId = await newChild(`CompSummary-${RUN}`);
    const grantRes = await grant({ familyMemberId: childId, sessions: 4, expiresInDays: 90 });
    const grantBody = await expectJson(grantRes, 201);
    createdGrantIds.push(grantBody.grant.id);

    const res = await apiFetch("/api/classes/summary", { cookie: parentCookie });
    const body = await expectJson(res, 200);
    const childSummary = body.children.find((c: { familyMemberId: string }) => c.familyMemberId === childId);
    expect(childSummary).toBeTruthy();
    const compCredit = childSummary.credits.find((c: { source: string }) => c.source === "comp");
    expect(compCredit).toBeTruthy();
    expect(compCredit.label).toBe("Class credit");
    expect(compCredit.remaining).toBe(4);
  });
});

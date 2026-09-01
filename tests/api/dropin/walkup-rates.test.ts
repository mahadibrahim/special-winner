import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { CLASS_REQUIRES_CHILD } from "@/lib/classes/class-walkup";

const RATE_CARD = "/api/admin/dropin/rate-card";

describe("walk-up rate card admin API", () => {
  it("rejects an unauthenticated PUT (401)", async () => {
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: 1700 }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts defaultWalkUpRateCents for an admin (200)", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return; // fixture not present in this environment — skip
    }
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: 1700 }),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rateCard.defaultWalkUpRateCents).toBe(1700);
  });

  it("rejects a negative walk-up rate (400)", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }
    const res = await apiFetch(RATE_CARD, {
      method: "PUT",
      body: JSON.stringify({ defaultWalkUpRateCents: -5 }),
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(400);
  });
});

/**
 * POST /api/admin/dropin/sessions/:id/walk-up — the front-desk Terminal door.
 *
 * It books the USER it is handed and prices them off `resolveRate` + the org
 * `drop_in_rate_card`, which is the ADULT PICKUP price list. It has no notion
 * of a child participant (neither does the walk-up PaymentIntent it mints,
 * nor the webhook that inserts the row), while a CLASS is always a child's
 * seat — so every class attempt reaching here is an adult-self booking into a
 * kids' class, at a price nobody configured. It must be refused BEFORE the
 * card is consulted; a class walk-up goes through the kiosk walk-in flow,
 * which names the child and prices the class from the session.
 *
 * The pickup case in the same block is the regression half: unchanged
 * behaviour, i.e. it gets past this guard and on to the normal rate path.
 */
describe("admin walk-up — class sessions are refused, pickup is unchanged", () => {
  const createdSessionIds: string[] = [];

  afterAll(async () => {
    if (createdSessionIds.length === 0) return;
    await getDb()
      .update(dropInSessions)
      .set({ status: "cancelled" })
      .where(inArray(dropInSessions.id, createdSessionIds));
  });

  async function seedSession(kind: "class" | "pickup"): Promise<string> {
    const { organizationId, venueId } = await resolveDefaultOrgForHttpTests();
    const ctx = await createTestDropInSession({
      organizationId,
      venueId,
      kind,
      capacity: 10,
      startsAt: new Date(Date.now() + 3 * 3_600_000),
      sessionRateCents: 3300,
      memberRateCents: 1500,
    });
    createdSessionIds.push(ctx.sessionId);
    return ctx.sessionId;
  }

  it("422s a class session with class_requires_child", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return; // fixture not present in this environment — skip
    }
    const sessionId = await seedSession("class");
    const res = await apiFetch(`/api/admin/dropin/sessions/${sessionId}/walk-up`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        newAccount: {
          firstName: "Desk",
          lastName: "ClassWalkUp",
          email: `desk-class-walkup-${Date.now()}@walkup-test.invalid`,
        },
      }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(422);
    expect(body.error?.code).toBe(CLASS_REQUIRES_CHILD);
    expect(body.clientSecret).toBeUndefined();
    expect(body.amountCents).toBeUndefined();
  });

  it("lets a PICKUP session through the same guard", async () => {
    let cookie: string;
    try {
      cookie = await getAdminCookie();
    } catch {
      return;
    }
    const sessionId = await seedSession("pickup");
    const res = await apiFetch(`/api/admin/dropin/sessions/${sessionId}/walk-up`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        newAccount: {
          firstName: "Desk",
          lastName: "PickupWalkUp",
          email: `desk-pickup-walkup-${Date.now()}@walkup-test.invalid`,
        },
      }),
    });
    const body = await res.json();
    // Stripe/Terminal availability varies by environment, so assert only that
    // the class guard didn't fire and the request reached the normal rate
    // path (which prices pickup walk-ups off walkUpRateCents ?? the card).
    expect(res.status).not.toBe(422);
    expect(body.error?.code).not.toBe(CLASS_REQUIRES_CHILD);
    if (res.status === 200) {
      expect(typeof body.paymentRequired).toBe("boolean");
    }
  });
});

/**
 * Guards for the class/pickup boundary on the SHARED drop-in surfaces.
 *
 * `drop_in_sessions` holds two products: adult pickup and youth classes
 * (kind='class', materialized weekly by the class-slot cron). Everything in
 * this file exists because the class rows used to be invisible to those
 * surfaces' filters — the public list served them as pickup inventory, the
 * authed booking endpoint let an adult book themselves into a kids' class,
 * and guest checkout let an anonymous visitor pay into one.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
} from "../../utils/classes-helpers";

let organizationId: string;
let venueId: string;
let cookie: string;
let pickupSessionId: string;
let classSessionId: string;

interface SessionsResponse {
  sessions: Array<{ id: string; kind: string }>;
  defaults: unknown;
}

beforeAll(async () => {
  ({ organizationId, venueId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);

  // Both inside the list endpoint's default 14-day window.
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  pickupSessionId = (
    await createTestDropInSession({ organizationId, venueId, kind: "pickup", startsAt })
  ).sessionId;
  classSessionId = (
    await createTestDropInSession({ organizationId, venueId, kind: "class", startsAt })
  ).sessionId;
});

describe("GET /api/dropin/sessions", () => {
  it("excludes class sessions by default — the pickup surfaces consume this unfiltered", async () => {
    const res = await apiFetch("/api/dropin/sessions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionsResponse;

    const ids = body.sessions.map((s) => s.id);
    expect(ids).toContain(pickupSessionId);
    expect(ids).not.toContain(classSessionId);
    // Not just this fixture — nothing in the payload may be a class.
    expect(body.sessions.every((s) => s.kind === "pickup")).toBe(true);
    // Response shape is unchanged (the price chip still needs the defaults).
    expect(body).toHaveProperty("defaults");
  });

  it("returns class sessions only when ?kind=class opts in", async () => {
    const res = await apiFetch("/api/dropin/sessions?kind=class");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionsResponse;

    const ids = body.sessions.map((s) => s.id);
    expect(ids).toContain(classSessionId);
    expect(ids).not.toContain(pickupSessionId);
    expect(body.sessions.every((s) => s.kind === "class")).toBe(true);
  });
});

describe("POST /api/dropin/bookings — class guard", () => {
  it("422s class_requires_child when an adult books a class session with no familyMemberId", async () => {
    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: classSessionId }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("class_requires_child");
  });

  it("still books an adult into a PICKUP session (the guard is class-only)", async () => {
    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: pickupSessionId, paymentFlow: "embedded" }),
    });
    // 200 (free or paid intent) locally with Stripe configured; 500
    // "Stripe not configured" on a CI runner without keys — either way it
    // is NOT the class rejection, which is the point of this assertion.
    expect(res.status).not.toBe(422);
  });
});

describe("POST /api/dropin/guest-checkout — class guard", () => {
  it("422s class_requires_child: guests can never book a kids' class", async () => {
    const res = await apiFetch("/api/dropin/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        sessionId: classSessionId,
        firstName: "Guest",
        lastName: "Tester",
        email: `guest-class-${Date.now()}@test.aspiresports.com`,
      }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("class_requires_child");
  });
});

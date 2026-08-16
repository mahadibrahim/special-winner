import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie } from "../setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

/** A body every case starts from, so a new field never breaks an old case. */
const validBase = {
  defaultHourlyRateCents: 9500,
  cancelWindowHours: 24,
  bookingIncrementMinutes: 30,
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
};

describe("rental rate-card API", () => {
  let cookie: string;

  const apiFetch = (init: RequestInit = {}) =>
    fetch(`${BASE}/api/admin/rentals/rate-card`, init);

  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("GET creates and returns a default rate card", async () => {
    const res = await apiFetch({ headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateCard.defaultHourlyRateCents).toBeGreaterThan(0);
    expect(body.rateCard.id).toBeTruthy();
    expect(body.rateCard.organizationId).toBeTruthy();
    expect(typeof body.rateCard.cancelWindowHours).toBe("number");
    expect(typeof body.rateCard.bookingIncrementMinutes).toBe("number");
    expect(typeof body.rateCard.depositPct).toBe("number");
    expect(typeof body.rateCard.balanceDueLeadDays).toBe("number");
    expect(typeof body.rateCard.blockHoldHours).toBe("number");
    expect(typeof body.rateCard.quoteMarkerTtlDays).toBe("number");
  });

  it("PUT updates the default hourly rate", async () => {
    const res = await apiFetch({
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultHourlyRateCents: 9500 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rateCard.defaultHourlyRateCents).toBe(9500);
  });

  it("PUT rejects a negative rate with 400", async () => {
    const res = await apiFetch({
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ defaultHourlyRateCents: -5 }),
    });
    expect(res.status).toBe(400);
  });

  it("PUT rejects minDurationMinutes > maxDurationMinutes with 400", async () => {
    const res = await apiFetch({
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ minDurationMinutes: 300, maxDurationMinutes: 60 }),
    });
    expect(res.status).toBe(400);
  });

  it("persists the block settings", async () => {
    const res = await apiFetch({
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        ...validBase,
        depositPct: 30,
        balanceDueLeadDays: 21,
        blockHoldHours: 48,
        quoteMarkerTtlDays: 10,
      }),
    });
    expect(res.status).toBe(200);
    const { rateCard } = await res.json();
    expect(rateCard).toMatchObject({
      depositPct: 30,
      balanceDueLeadDays: 21,
      blockHoldHours: 48,
      quoteMarkerTtlDays: 10,
    });

    // Restore the org defaults so the rest of the suite prices as it expects.
    await apiFetch({
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        ...validBase,
        depositPct: 25,
        balanceDueLeadDays: 30,
        blockHoldHours: 72,
        quoteMarkerTtlDays: 14,
      }),
    });
  });

  it("rejects a deposit percent outside 0-100", async () => {
    const res = await apiFetch({
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBase, depositPct: 130 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a non-integer hold window", async () => {
    const res = await apiFetch({
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBase, blockHoldHours: 12.5 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a zero-day quote marker TTL", async () => {
    const res = await apiFetch({
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ ...validBase, quoteMarkerTtlDays: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("GET without auth returns 401/403", async () => {
    const res = await apiFetch();
    expect([401, 403]).toContain(res.status);
  });
});

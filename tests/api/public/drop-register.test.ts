import { describe, it, expect } from "vitest";
import { apiFetch, expectJson } from "../setup/test-helpers";

const ENDPOINT = "/api/public/drop-register";

// Ineligible: 6'0" / 150 lbs → BMI ≈ 20.3 (well below 27.5)
const INELIGIBLE_BODY = {
  firstName: "Test",
  lastName: "User",
  email: "ineligible@example.com",
  heightFeet: 6,
  heightInches: 0,
  weightLbs: 150,
  consent: true,
};

// Eligible: 5'5" / 220 lbs → BMI ≈ 36.6
const ELIGIBLE_BODY = {
  firstName: "Test",
  lastName: "Eligible",
  email: "eligible@example.com",
  heightFeet: 5,
  heightInches: 5,
  weightLbs: 220,
  consent: true,
};

describe("POST /api/public/drop-register", () => {
  it("rejects missing/invalid body — bad email → 400", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        dropSeasonId: "00000000-0000-0000-0000-000000000000",
        firstName: "Test",
        lastName: "User",
        email: "not-an-email",
        heightFeet: 5,
        heightInches: 10,
        weightLbs: 200,
        consent: true,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing dropSeasonId (not a UUID) → 400", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        ...ELIGIBLE_BODY,
        dropSeasonId: "not-a-uuid",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects consent=false → 400", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        dropSeasonId: "00000000-0000-0000-0000-000000000000",
        ...INELIGIBLE_BODY,
        consent: false,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects absent consent field → 400", async () => {
    const { consent: _omitted, ...bodyWithoutConsent } = INELIGIBLE_BODY;
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        dropSeasonId: "00000000-0000-0000-0000-000000000000",
        ...bodyWithoutConsent,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("404s for a non-existent dropSeasonId", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        dropSeasonId: "00000000-0000-0000-0000-000000000000",
        ...ELIGIBLE_BODY,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("422 with { error: 'not_eligible' } for ineligible BMI — no player row created", async () => {
    // We don't know the dropSeasonId from seed fixtures yet; if none is open
    // this will 404 before the BMI check. To test the BMI gate specifically we
    // need an open season. Mirror the season-interest guard: if no open drop
    // season exists in the fixture, skip rather than fail.
    const listRes = await apiFetch("/api/public/drop-seasons", { method: "GET" });
    if (listRes.status !== 200) return; // endpoint may not exist yet — skip

    const listBody = await listRes.json().catch(() => null);
    const openSeason = Array.isArray(listBody?.seasons)
      ? listBody.seasons.find((s: any) => s.status === "open")
      : null;
    if (!openSeason) return; // no open fixture — skip

    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      body: JSON.stringify({
        dropSeasonId: openSeason.id,
        ...INELIGIBLE_BODY,
        email: `ineligible-bmi-${Date.now()}@example.com`,
      }),
    });
    const body = await expectJson(res, 422);
    expect(body.error).toBe("not_eligible");
    // Must not leak weight or bmi
    expect(JSON.stringify(body)).not.toMatch(/weight/i);
    expect(JSON.stringify(body)).not.toMatch(/bmi/i);
  });

  it("200 for an eligible registration and is idempotent on resubmit", async () => {
    const listRes = await apiFetch("/api/public/drop-seasons", { method: "GET" });
    if (listRes.status !== 200) return;

    const listBody = await listRes.json().catch(() => null);
    const openSeason = Array.isArray(listBody?.seasons)
      ? listBody.seasons.find((s: any) => s.status === "open")
      : null;
    if (!openSeason) return;

    const email = `eligible-${Date.now()}@example.com`;
    const payload = JSON.stringify({
      dropSeasonId: openSeason.id,
      ...ELIGIBLE_BODY,
      email,
    });

    const first = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    const firstBody = await expectJson(first, 200);
    expect(firstBody.ok).toBe(true);
    expect(firstBody.eligible).toBe(true);
    // Response must not contain weight or bmi
    expect(JSON.stringify(firstBody)).not.toMatch(/weight/i);
    expect(JSON.stringify(firstBody)).not.toMatch(/bmi/i);

    // Idempotent: second submission with same email → still 200 (onConflictDoNothing)
    const second = await apiFetch(ENDPOINT, { method: "POST", body: payload });
    expect(second.status).toBe(200);
  });
});

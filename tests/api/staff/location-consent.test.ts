/**
 * GET/POST /api/staff/location-consent — the mandatory employment-condition
 * acknowledgement gating clock-in (Task 7,
 * docs/superpowers/plans/2026-07-07-time-tracking.md).
 *
 * Uses a freshly-created plain user (no role assignments) rather than a
 * cached test account, so each run starts from a guaranteed "not yet
 * acknowledged" state — reusing a shared test account would accumulate an
 * acknowledgement across runs and never observe the unacknowledged branch.
 * Mirrors the fresh-user pattern in
 * tests/api/referee/report-preserves-ejections.test.ts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { hashPassword } from "@/lib/auth/password";
import { getAuthCookie, apiFetch, expectJson } from "../setup/test-helpers";
import { CURRENT_LOCATION_CONSENT_VERSION } from "@/lib/time-tracking/consent";

const PASSWORD = "TestConsentUser123!";
const ENDPOINT = "/api/staff/location-consent";

describe(ENDPOINT, () => {
  let cookie: string;

  beforeAll(async () => {
    const db = getDb();
    const email = `consent-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(users)
      .values({ email, passwordHash, firstName: "Consent", lastName: "Fixture", emailVerified: true });
    cookie = await getAuthCookie(email, PASSWORD);
  });

  it("401s without a session", async () => {
    const res = await apiFetch(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("GET reflects an unacknowledged state for a brand-new user", async () => {
    const res = await apiFetch(ENDPOINT, { cookie });
    const body = await expectJson(res, 200);
    expect(body.acknowledged).toBe(false);
    expect(body.noticeVersion).toBeNull();
    expect(body.currentVersion).toBe(CURRENT_LOCATION_CONSENT_VERSION);
    expect(typeof body.noticeTitle).toBe("string");
    expect(body.noticeTitle.length).toBeGreaterThan(0);
    expect(typeof body.noticeBody).toBe("string");
    // The employment-condition framing must be explicit in the copy, not
    // just implied — this is the whole point of owner decision #1.
    expect(body.noticeBody.toLowerCase()).toContain("condition of");
  });

  it("rejects a POST body that doesn't explicitly acknowledge", async () => {
    const res = await apiFetch(ENDPOINT, {
      cookie,
      method: "POST",
      body: JSON.stringify({ acknowledged: false }),
    });
    expect(res.status).toBe(400);
  });

  it("POST records acknowledgement of the current version", async () => {
    const res = await apiFetch(ENDPOINT, {
      cookie,
      method: "POST",
      body: JSON.stringify({ acknowledged: true }),
    });
    const body = await expectJson(res, 200);
    expect(body.acknowledged).toBe(true);
    expect(body.noticeVersion).toBe(CURRENT_LOCATION_CONSENT_VERSION);
    expect(body.acknowledgedAt).toBeTruthy();
  });

  it("GET now reflects the acknowledged state", async () => {
    const res = await apiFetch(ENDPOINT, { cookie });
    const body = await expectJson(res, 200);
    expect(body.acknowledged).toBe(true);
    expect(body.noticeVersion).toBe(CURRENT_LOCATION_CONSENT_VERSION);
  });

  it("POST is idempotent — re-acknowledging doesn't error and stays acknowledged", async () => {
    const res = await apiFetch(ENDPOINT, {
      cookie,
      method: "POST",
      body: JSON.stringify({ acknowledged: true }),
    });
    const body = await expectJson(res, 200);
    expect(body.acknowledged).toBe(true);
    expect(body.noticeVersion).toBe(CURRENT_LOCATION_CONSENT_VERSION);
  });
});

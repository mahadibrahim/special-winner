import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getMediaStaffCookie,
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Photographer Jobs API", () => {
  let adminCookie: string;
  let mediaCookie: string;
  let coachCookie: string;
  let mediaStaffUserId: string;
  let sessionId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    mediaCookie = await getMediaStaffCookie();
    coachCookie = await getCoachCookie();
    const me = await apiFetch("/api/auth/me", { method: "GET", cookie: mediaCookie });
    mediaStaffUserId = (await expectJson(me, 200)).user.id;

    // Admin creates a shoot assigned to our media_staff user.
    const create = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: mediaStaffUserId,
        sessionType: "game",
        scheduledStart: new Date(Date.now() + 3 * 86400_000).toISOString(),
        scheduledEnd: new Date(Date.now() + 3 * 86400_000 + 2 * 3600_000).toISOString(),
      }),
    });
    sessionId = (await expectJson(create, 201)).session.id;
  });

  afterAll(() => resetCookies());

  it("GET /api/media/jobs lists only the photographer's sessions", async () => {
    const res = await apiFetch("/api/media/jobs", { method: "GET", cookie: mediaCookie });
    const json = await expectJson(res, 200);
    expect(json.jobs.some((j: any) => j.id === sessionId)).toBe(true);
  });

  it("GET /api/media/jobs rejects a coach (403)", async () => {
    const res = await apiFetch("/api/media/jobs", { method: "GET", cookie: coachCookie });
    expect(res.status).toBe(403);
  });

  it("POST confirm transitions status to 'confirmed'", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/confirm`, {
      method: "POST",
      cookie: mediaCookie,
      body: "{}",
    });
    const json = await expectJson(res, 200);
    expect(json.session.status).toBe("confirmed");
    expect(json.session.confirmedAt).toBeTruthy();
  });

  it("POST check-in rejects when user is not assigned", async () => {
    // Coach has no session assigned; their attempt should 403.
    const res = await apiFetch(`/api/media/jobs/${sessionId}/check-in`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({ lat: 40.0, lng: -83.0 }),
    });
    expect(res.status).toBe(403);
  });

  it("POST check-in stamps geolocation and transitions to 'checked_in'", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/check-in`, {
      method: "POST",
      cookie: mediaCookie,
      body: JSON.stringify({ lat: 40.123456, lng: -83.123456 }),
    });
    const json = await expectJson(res, 200);
    expect(json.session.status).toBe("checked_in");
    expect(Number(json.session.checkedInLat)).toBeCloseTo(40.123456, 5);
    expect(Number(json.session.checkedInLng)).toBeCloseTo(-83.123456, 5);
    expect(json.session.checkedInAt).toBeTruthy();
  });

  it("POST check-out stamps checkedOutAt", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/check-out`, {
      method: "POST",
      cookie: mediaCookie,
      body: "{}",
    });
    const json = await expectJson(res, 200);
    expect(json.session.checkedOutAt).toBeTruthy();
  });
});

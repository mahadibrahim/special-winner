import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getMediaStaffCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

const ENDPOINT = "/api/admin/media/shoots";

describe("Admin Media Shoots API", () => {
  let adminCookie: string;
  let mediaCookie: string;
  let mediaStaffUserId: string;
  let createdId: string;
  const scheduledStart = new Date(Date.now() + 7 * 86400_000).toISOString();
  const scheduledEnd = new Date(Date.now() + 7 * 86400_000 + 2 * 3600_000).toISOString();

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    mediaCookie = await getMediaStaffCookie();
    const me = await apiFetch("/api/auth/me", { method: "GET", cookie: mediaCookie });
    const meJson = await expectJson(me, 200);
    mediaStaffUserId = meJson.user.id;
  });

  afterAll(() => resetCookies());

  it("POST creates a shoot (201)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: mediaStaffUserId,
        sessionType: "game",
        scheduledStart,
        scheduledEnd,
        rateType: "per_game",
        rateCents: 7500,
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.session).toBeDefined();
    expect(json.session.status).toBe("assigned");
    expect(json.session.assignedUserId).toBe(mediaStaffUserId);
    createdId = json.session.id;
  });

  it("POST rejects non-admin (403)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: mediaCookie,
      body: JSON.stringify({
        assignedUserId: mediaStaffUserId,
        sessionType: "game",
        scheduledStart,
        scheduledEnd,
      }),
    });
    expect(res.status).toBe(403);
  });

  it("GET returns the created shoot", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.sessions)).toBe(true);
    expect(json.sessions.find((s: any) => s.id === createdId)).toBeDefined();
  });

  it("GET supports status filter", async () => {
    const res = await apiFetch(`${ENDPOINT}?status=assigned`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.sessions.every((s: any) => s.status === "assigned")).toBe(true);
  });

  it("GET rejects unauthenticated (401)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("GET /:id returns session detail", async () => {
    const res = await apiFetch(`${ENDPOINT}/${createdId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(json.session.id).toBe(createdId);
  });

  it("PATCH /:id reschedules the session", async () => {
    const newStart = new Date(Date.now() + 10 * 86400_000).toISOString();
    const res = await apiFetch(`${ENDPOINT}/${createdId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ scheduledStart: newStart }),
    });
    const json = await expectJson(res, 200);
    expect(new Date(json.session.scheduledStart).toISOString()).toBe(newStart);
  });

  it("PATCH /:id cancels the session", async () => {
    const res = await apiFetch(`${ENDPOINT}/${createdId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ status: "cancelled" }),
    });
    const json = await expectJson(res, 200);
    expect(json.session.status).toBe("cancelled");
  });
});

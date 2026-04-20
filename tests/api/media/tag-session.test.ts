import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getAuthCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("GET /api/media/tag/:session_id — payload + roster subset", () => {
  let adminCookie: string;
  let sessionId: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const qres = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const qjson = await expectJson(qres, 200);
    if (qjson.queue.length > 0) {
      const target = qjson.queue[0];
      await apiFetch(
        `/api/admin/media/tag-queue/${target.session_id}/claim`,
        { method: "POST", cookie: adminCookie }
      );
      sessionId = target.session_id;
    } else {
      sessionId = "";
    }
  });

  afterAll(() => resetCookies());

  it("returns assets + home/away roster subset WITHOUT contact info", async () => {
    if (!sessionId) return;
    const res = await apiFetch(`/api/media/tag/${sessionId}`, {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);

    expect(Array.isArray(json.assets)).toBe(true);
    for (const a of json.assets) {
      expect(a.id).toBeTruthy();
      expect(a.thumbnail_url || a.preview_url).toBeTruthy();
      expect(typeof a.captured_at === "string" || a.captured_at === null).toBe(
        true
      );
    }

    expect(json.roster).toBeDefined();
    for (const side of ["home", "away"] as const) {
      expect(json.roster[side]).toBeDefined();
      for (const p of json.roster[side].players) {
        const allowed = new Set([
          "id",
          "first_name",
          "last_initial",
          "jersey_number",
          "photo_url",
          "roster_id",
        ]);
        for (const k of Object.keys(p)) {
          expect(allowed.has(k)).toBe(true);
        }
        expect((p as any).last_name).toBeUndefined();
        expect((p as any).email).toBeUndefined();
        expect((p as any).phone).toBeUndefined();
        expect((p as any).parent_user_id).toBeUndefined();
        expect((p as any).medical_notes).toBeUndefined();
        expect((p as any).birth_date).toBeUndefined();
      }
    }
  });

  it("rejects users without a role", async () => {
    const parentCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!"
    );
    const res = await apiFetch(
      `/api/media/tag/${sessionId || "00000000-0000-0000-0000-000000000000"}`,
      { method: "GET", cookie: parentCookie }
    );
    expect([401, 403, 404]).toContain(res.status);
  });
});

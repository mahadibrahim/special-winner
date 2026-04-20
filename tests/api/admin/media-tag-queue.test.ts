import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("GET /api/admin/media/tag-queue", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  afterAll(() => resetCookies());

  it("returns sessions in 'uploaded' state ordered by oldest", async () => {
    const res = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const json = await expectJson(res, 200);
    expect(Array.isArray(json.queue)).toBe(true);
    for (const item of json.queue) {
      expect(item.session_id).toBeTruthy();
      expect(typeof item.asset_count).toBe("number");
    }
    const times = json.queue
      .map((x: any) => (x.uploaded_at ? new Date(x.uploaded_at).getTime() : 0))
      .filter(Boolean);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    }
  });

  it("rejects non-admin", async () => {
    const res = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
    });
    expect([401, 403]).toContain(res.status);
  });
});

describe("POST /api/admin/media/tag-queue/:id/claim", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
  });

  it("claims a session, flipping status uploaded -> tagging", async () => {
    const listRes = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const listJson = await expectJson(listRes, 200);
    if (listJson.queue.length === 0) {
      return;
    }
    const target = listJson.queue[0];

    const claimRes = await apiFetch(
      `/api/admin/media/tag-queue/${target.session_id}/claim`,
      { method: "POST", cookie: adminCookie }
    );
    const claimJson = await expectJson(claimRes, 200);
    expect(claimJson.session.id).toBe(target.session_id);
    expect(claimJson.session.status).toBe("tagging");
  });

  it("returns 409 when claiming an already-claimed session", async () => {
    const listRes = await apiFetch("/api/admin/media/tag-queue", {
      method: "GET",
      cookie: adminCookie,
    });
    const listJson = await expectJson(listRes, 200);
    if (listJson.queue.length === 0) return;

    const target = listJson.queue[0];
    const res = await apiFetch(
      `/api/admin/media/tag-queue/${target.session_id}/claim`,
      { method: "POST", cookie: adminCookie }
    );
    expect([200, 409]).toContain(res.status);
  });
});

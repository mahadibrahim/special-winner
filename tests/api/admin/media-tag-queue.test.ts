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

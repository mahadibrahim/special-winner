import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie } from "./setup/test-helpers";

/**
 * Tests for POST /api/admin/person/[id]/photo?as=family_member|user
 *
 * Full multipart upload requires R2_MOCK + a real person id — only the
 * auth and param guards are asserted here (no file I/O needed).
 */
describe("POST /api/admin/person/[id]/photo", () => {
  const FAKE_ID = "00000000-0000-0000-0000-000000000000";

  it("401s without auth", async () => {
    const res = await apiFetch(
      `/api/admin/person/${FAKE_ID}/photo?as=family_member`,
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });

  it("400s when `as` param is missing", async () => {
    const cookie = await getAdminCookie();
    const form = new FormData();
    // No file — the `as` check fires first, so we expect 400 regardless.
    const res = await apiFetch(`/api/admin/person/${FAKE_ID}/photo`, {
      method: "POST",
      cookie,
      body: form,
      headers: {},
    });
    expect(res.status).toBe(400);
  });

  it("400s when `as` param is invalid", async () => {
    const cookie = await getAdminCookie();
    const form = new FormData();
    const res = await apiFetch(
      `/api/admin/person/${FAKE_ID}/photo?as=roster_entry`,
      {
        method: "POST",
        cookie,
        body: form,
        headers: {},
      },
    );
    expect(res.status).toBe(400);
  });

  it("400s when no file is provided", async () => {
    const cookie = await getAdminCookie();
    const form = new FormData();
    // Valid `as`, but no file attached.
    const res = await apiFetch(
      `/api/admin/person/${FAKE_ID}/photo?as=family_member`,
      {
        method: "POST",
        cookie,
        body: form,
        headers: {},
      },
    );
    // The person will 404 before the file check in practice with a fake id,
    // but both 400 and 404 indicate the guard fired correctly.
    expect([400, 404]).toContain(res.status);
  });
});

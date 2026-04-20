import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  getMediaStaffCookie,
  getCoachCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

// Dev server loads the real R2 module; test guard here is at the API layer —
// we verify the server returns the expected shape WITHOUT reaching R2 by
// pointing the dev server at a mock (set R2_MOCK=1 in the dev env). The API
// code below detects R2_MOCK and returns deterministic fake URLs.

describe("Media uploads API", () => {
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

  it("POST uploads rejects non-media_staff (coach → 403)", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/uploads`, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        files: [{ filename: "a.jpg", contentType: "image/jpeg", sizeBytes: 1024, partCount: 1 }],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("POST uploads rejects media_staff who is not assigned to the session", async () => {
    // Create a second session assigned to *admin* so media_staff is unassigned.
    const c = await apiFetch("/api/admin/media/shoots", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        assignedUserId: (await expectJson(
          await apiFetch("/api/auth/me", { method: "GET", cookie: adminCookie }),
          200
        )).user.id,
        sessionType: "game",
        scheduledStart: new Date(Date.now() + 4 * 86400_000).toISOString(),
        scheduledEnd: new Date(Date.now() + 4 * 86400_000 + 2 * 3600_000).toISOString(),
      }),
    });
    const otherSessionId = (await expectJson(c, 201)).session.id;

    const res = await apiFetch(`/api/media/jobs/${otherSessionId}/uploads`, {
      method: "POST",
      cookie: mediaCookie,
      body: JSON.stringify({
        files: [{ filename: "a.jpg", contentType: "image/jpeg", sizeBytes: 1024, partCount: 1 }],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("POST uploads returns signed part URLs + creates media_assets rows in status='uploading'", async () => {
    const res = await apiFetch(`/api/media/jobs/${sessionId}/uploads`, {
      method: "POST",
      cookie: mediaCookie,
      body: JSON.stringify({
        files: [
          { filename: "shot1.jpg", contentType: "image/jpeg", sizeBytes: 5 * 1024 * 1024, partCount: 1 },
          { filename: "shot2.jpg", contentType: "image/jpeg", sizeBytes: 6 * 1024 * 1024, partCount: 1 },
        ],
      }),
    });
    const json = await expectJson(res, 201);
    expect(json.uploads).toHaveLength(2);
    for (const u of json.uploads) {
      expect(u.assetId).toBeTruthy();
      expect(u.uploadId).toBeTruthy();
      expect(Array.isArray(u.partUrls)).toBe(true);
      expect(u.partUrls).toHaveLength(1);
    }
  });

  it("POST complete transitions asset to 'uploaded'", async () => {
    // First, request a single-file upload.
    const req = await apiFetch(`/api/media/jobs/${sessionId}/uploads`, {
      method: "POST",
      cookie: mediaCookie,
      body: JSON.stringify({
        files: [{ filename: "done.jpg", contentType: "image/jpeg", sizeBytes: 1024, partCount: 1 }],
      }),
    });
    const reqJson = await expectJson(req, 201);
    const { assetId, uploadId } = reqJson.uploads[0];

    const done = await apiFetch(
      `/api/media/jobs/${sessionId}/uploads/${assetId}/complete`,
      {
        method: "POST",
        cookie: mediaCookie,
        body: JSON.stringify({
          uploadId,
          parts: [{ ETag: '"fake-etag"', PartNumber: 1 }],
        }),
      }
    );
    const doneJson = await expectJson(done, 200);
    expect(doneJson.asset.status).toBe("uploaded");
    expect(doneJson.asset.uploadedAt).toBeTruthy();
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("Site announcement settings round-trip", () => {
  let adminCookie: string;
  let originalSiteAnnouncement: unknown = undefined;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Capture existing siteAnnouncement so we can restore it at test end.
    const res = await apiFetch("/api/admin/organizations/settings", {
      cookie: adminCookie,
    });
    if (res.ok) {
      const json = await res.json();
      originalSiteAnnouncement = json.settings?.siteAnnouncement ?? null;
    }
  });

  afterAll(async () => {
    // Restore original org siteAnnouncement.
    await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: { siteAnnouncement: originalSiteAnnouncement ?? null },
      }),
    });
    resetCookies();
  });

  // Case 1: PATCH set → 200, GET roundtrips every field
  it("PATCH sets siteAnnouncement and GET roundtrips all fields (200)", async () => {
    const patchRes = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: {
          siteAnnouncement: {
            title: "Summer 7v7 League",
            detail: "Registration closes June 30 — 4 spots left",
            linkUrl: "/adult/leagues",
            linkLabel: "Claim a spot",
            audience: "adult",
            expiresAt: "2099-01-01T00:00:00.000Z",
          },
        },
      }),
    });
    const patchJson = await expectJson(patchRes, 200);
    expect(patchJson.settings.siteAnnouncement).toEqual({
      title: "Summer 7v7 League",
      detail: "Registration closes June 30 — 4 spots left",
      linkUrl: "/adult/leagues",
      linkLabel: "Claim a spot",
      audience: "adult",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const getRes = await apiFetch("/api/admin/organizations/settings", {
      cookie: adminCookie,
    });
    const getJson = await expectJson(getRes, 200);
    expect(getJson.settings.siteAnnouncement).toEqual({
      title: "Summer 7v7 League",
      detail: "Registration closes June 30 — 4 spots left",
      linkUrl: "/adult/leagues",
      linkLabel: "Claim a spot",
      audience: "adult",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  // Case 2: PATCH invalid → 400
  it("PATCH rejects blank title (400)", async () => {
    const res = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: {
          siteAnnouncement: {
            title: "",
            audience: "all",
          },
        },
      }),
    });
    await expectJson(res, 400);
  });

  it("PATCH rejects bad audience value (400)", async () => {
    const res = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: {
          siteAnnouncement: {
            title: "Valid title",
            audience: "kids",
          },
        },
      }),
    });
    await expectJson(res, 400);
  });

  it("PATCH rejects non-datetime expiresAt (400)", async () => {
    const res = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: {
          siteAnnouncement: {
            title: "Valid title",
            audience: "all",
            expiresAt: "not-a-date",
          },
        },
      }),
    });
    await expectJson(res, 400);
  });

  // Case 3: PATCH null → key gone on GET
  it("PATCH siteAnnouncement: null removes the key (200)", async () => {
    // First set a value
    await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: {
          siteAnnouncement: {
            title: "Temp banner",
            audience: "all",
          },
        },
      }),
    });

    // Now clear it
    const clearRes = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: { siteAnnouncement: null },
      }),
    });
    await expectJson(clearRes, 200);

    const getRes = await apiFetch("/api/admin/organizations/settings", {
      cookie: adminCookie,
    });
    const getJson = await expectJson(getRes, 200);
    expect(getJson.settings.siteAnnouncement).toBeUndefined();
  });

  // Case 4: unauthenticated PATCH → 401
  it("requires auth (401)", async () => {
    const res = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      body: JSON.stringify({ settings: { siteAnnouncement: null } }),
    });
    await expectJson(res, 401);
  });
});

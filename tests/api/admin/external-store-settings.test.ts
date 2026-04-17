import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  testSlug,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("External Store settings round-trip", () => {
  let adminCookie: string;
  let originalOrgExternalStore: unknown = undefined;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Capture existing externalStore so we can restore it at test end.
    const res = await apiFetch("/api/admin/organizations/settings", {
      cookie: adminCookie,
    });
    if (res.ok) {
      const json = await res.json();
      originalOrgExternalStore = json.settings?.externalStore ?? null;
    }
  });

  afterAll(async () => {
    // Restore original org externalStore.
    await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: { externalStore: originalOrgExternalStore ?? null },
      }),
    });
    resetCookies();
  });

  describe("Organization settings", () => {
    it("GET /api/admin/organizations/settings returns caller's settings (200)", async () => {
      const res = await apiFetch("/api/admin/organizations/settings", {
        cookie: adminCookie,
      });
      const json = await expectJson(res, 200);
      expect(json.settings).toBeDefined();
    });

    it("PATCH merges externalStore into settings (200)", async () => {
      const patchRes = await apiFetch("/api/admin/organizations/settings", {
        method: "PATCH",
        cookie: adminCookie,
        body: JSON.stringify({
          settings: {
            externalStore: {
              url: "https://teamstore.example.com",
              label: "Aspire Test Team Store",
              partnerName: "Squadlocker",
            },
          },
        }),
      });
      const patchJson = await expectJson(patchRes, 200);
      expect(patchJson.settings.externalStore).toEqual({
        url: "https://teamstore.example.com",
        label: "Aspire Test Team Store",
        partnerName: "Squadlocker",
      });

      const getRes = await apiFetch("/api/admin/organizations/settings", {
        cookie: adminCookie,
      });
      const getJson = await expectJson(getRes, 200);
      expect(getJson.settings.externalStore).toEqual({
        url: "https://teamstore.example.com",
        label: "Aspire Test Team Store",
        partnerName: "Squadlocker",
      });
    });

    it("PATCH preserves other settings keys (does not overwrite whole blob)", async () => {
      const before = await (
        await apiFetch("/api/admin/organizations/settings", {
          cookie: adminCookie,
        })
      ).json();

      await apiFetch("/api/admin/organizations/settings", {
        method: "PATCH",
        cookie: adminCookie,
        body: JSON.stringify({
          settings: {
            externalStore: {
              url: "https://other.example.com",
              label: "Other",
              partnerName: "BSN",
            },
          },
        }),
      });

      const after = await (
        await apiFetch("/api/admin/organizations/settings", {
          cookie: adminCookie,
        })
      ).json();

      // Non-externalStore keys from before should survive.
      if (before.settings?.branding) {
        expect(after.settings.branding).toEqual(before.settings.branding);
      }
      if (before.settings?.payments) {
        expect(after.settings.payments).toEqual(before.settings.payments);
      }
    });

    it("PATCH rejects invalid externalStore shape (400)", async () => {
      const res = await apiFetch("/api/admin/organizations/settings", {
        method: "PATCH",
        cookie: adminCookie,
        body: JSON.stringify({
          settings: {
            externalStore: {
              url: "not-a-url",
              label: "",
              partnerName: "NotAPartner",
            },
          },
        }),
      });
      await expectJson(res, 400);
    });

    it("requires auth (401)", async () => {
      const res = await apiFetch("/api/admin/organizations/settings", {
        method: "PATCH",
        body: JSON.stringify({ settings: {} }),
      });
      await expectJson(res, 401);
    });
  });

  describe("Location settings", () => {
    let locationId: string;

    beforeAll(async () => {
      const slug = testSlug("loc-store");
      const res = await apiFetch("/api/admin/locations", {
        method: "POST",
        cookie: adminCookie,
        body: JSON.stringify({
          name: "Test Store Location",
          slug,
          active: true,
        }),
      });
      const json = await expectJson(res, 201);
      locationId = json.location.id;
    });

    afterAll(async () => {
      if (locationId) {
        await apiFetch(`/api/admin/locations?id=${locationId}`, {
          method: "DELETE",
          cookie: adminCookie,
        });
      }
    });

    it("PUT /api/admin/locations accepts settings.externalStore and round-trips (200)", async () => {
      const putRes = await apiFetch("/api/admin/locations", {
        method: "PUT",
        cookie: adminCookie,
        body: JSON.stringify({
          id: locationId,
          name: "Test Store Location",
          slug: `test-store-${locationId.slice(0, 8)}`,
          active: true,
          settings: {
            externalStore: {
              url: "https://powell.example.com",
              label: "Powell Team Store",
              partnerName: "Custom Ink",
            },
          },
        }),
      });
      const putJson = await expectJson(putRes, 200);
      expect(putJson.location.settings?.externalStore).toEqual({
        url: "https://powell.example.com",
        label: "Powell Team Store",
        partnerName: "Custom Ink",
      });

      const listRes = await apiFetch("/api/admin/locations", {
        cookie: adminCookie,
      });
      const listJson = await expectJson(listRes, 200);
      const updated = listJson.locations.find((l: any) => l.id === locationId);
      expect(updated?.settings?.externalStore).toEqual({
        url: "https://powell.example.com",
        label: "Powell Team Store",
        partnerName: "Custom Ink",
      });
    });
  });
});

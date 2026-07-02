import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getAdminCookie,
  apiFetch,
  expectJson,
  resetCookies,
} from "../setup/test-helpers";

describe("PATCH /api/admin/organizations/settings — feedback block", () => {
  let adminCookie: string;
  let originalFeedback: unknown = undefined;
  let originalNpsFlag: boolean | undefined = undefined;
  let originalRefFlag: boolean | undefined = undefined;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();

    // Capture existing feedback settings + feature flags so we can restore
    // them at test end — the admin test org is shared across CI runs.
    const res = await apiFetch("/api/admin/organizations/settings", {
      cookie: adminCookie,
    });
    if (res.ok) {
      const json = await res.json();
      originalFeedback = json.settings?.feedback ?? null;
      originalNpsFlag = json.features?.enableNpsSurveys;
      originalRefFlag = json.features?.enableRefereeRatings;
    }
  });

  afterAll(async () => {
    // Restore the original feedback block (null deletes it) and feature
    // flags. The features patch only accepts booleans, so a flag that was
    // originally absent is restored as `false` (behaviorally equivalent).
    await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: { feedback: originalFeedback ?? null },
        features: {
          enableNpsSurveys: originalNpsFlag ?? false,
          enableRefereeRatings: originalRefFlag ?? false,
        },
      }),
    });
    resetCookies();
  });

  it("round-trips feedback settings and feature flags", async () => {
    const patch = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: {
          feedback: {
            googleReviewUrl: { aspire: "https://g.page/r/test-aspire/review" },
            detractorAlertEmail: "owner@test.aspiresports.com",
          },
        },
        features: { enableNpsSurveys: true, enableRefereeRatings: true },
      }),
    });
    await expectJson(patch, 200);

    const get = await apiFetch("/api/admin/organizations/settings", {
      cookie: adminCookie,
    });
    const json = await expectJson(get, 200);
    expect(json.settings.feedback.googleReviewUrl.aspire).toBe(
      "https://g.page/r/test-aspire/review",
    );
    expect(json.features.enableNpsSurveys).toBe(true);
  });

  it("rejects a malformed review URL", async () => {
    const res = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: { feedback: { googleReviewUrl: { aspire: "not-a-url" } } },
      }),
    });
    await expectJson(res, 400);
  });
});

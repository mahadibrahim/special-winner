import { describe, it, expect } from "vitest";
import { getAdminCookie, apiFetch, expectJson } from "../setup/test-helpers";

describe("PATCH /api/admin/organizations/settings — feedback block", () => {
  it("round-trips feedback settings and feature flags", async () => {
    const cookie = await getAdminCookie();

    const patch = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie,
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
      cookie,
    });
    const json = await expectJson(get, 200);
    expect(json.settings.feedback.googleReviewUrl.aspire).toBe(
      "https://g.page/r/test-aspire/review",
    );
    expect(json.features.enableNpsSurveys).toBe(true);
  });

  it("rejects a malformed review URL", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch("/api/admin/organizations/settings", {
      method: "PATCH",
      cookie,
      body: JSON.stringify({
        settings: { feedback: { googleReviewUrl: { aspire: "not-a-url" } } },
      }),
    });
    await expectJson(res, 400);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getAdminCookie, apiFetch, expectJson, resetCookies } from "../setup/test-helpers";

const ENDPOINT = "/api/admin/organizations/settings";

describe("org settings — opsPings block", () => {
  let adminCookie: string;
  let originalOpsPings: unknown;

  beforeAll(async () => {
    adminCookie = await getAdminCookie();
    const res = await apiFetch(ENDPOINT, { cookie: adminCookie });
    const json = await expectJson(res, 200);
    originalOpsPings = json.settings?.opsPings ?? null;
  });

  afterAll(async () => {
    // Shared CI org — restore what we found (null deletes the key).
    await apiFetch(ENDPOINT, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({ settings: { opsPings: originalOpsPings } }),
    });
    resetCookies();
  });

  it("round-trips the opsPings block", async () => {
    const patch = await apiFetch(ENDPOINT, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: {
          opsPings: {
            enabled: false,
            principals: [{ name: "Mahad", phone: "+16145550100" }],
          },
        },
      }),
    });
    await expectJson(patch, 200);

    const get = await apiFetch(ENDPOINT, { cookie: adminCookie });
    const json = await expectJson(get, 200);
    expect(json.settings.opsPings.enabled).toBe(false);
    expect(json.settings.opsPings.principals[0].phone).toBe("+16145550100");
  });

  it("rejects malformed principal phone entries", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "PATCH",
      cookie: adminCookie,
      body: JSON.stringify({
        settings: { opsPings: { principals: [{ name: "X", phone: 12345 }] } },
      }),
    });
    await expectJson(res, 400);
  });
});

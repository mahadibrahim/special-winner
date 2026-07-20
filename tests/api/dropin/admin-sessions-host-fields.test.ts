import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

const ENDPOINT_BASE = "/api/admin/dropin/sessions";

describe("GET /api/admin/dropin/sessions host fields", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("every row carries hostUserId and hostName keys (null when unhosted)", async () => {
    const res = await apiFetch(`${ENDPOINT_BASE}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const { sessions } = await res.json();
    expect(Array.isArray(sessions)).toBe(true);
    for (const s of sessions) {
      expect(s).toHaveProperty("hostUserId");
      expect(s).toHaveProperty("hostName");
    }
  });
});

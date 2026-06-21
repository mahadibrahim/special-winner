import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie, expectJson } from "./setup/test-helpers";

describe("GET /api/admin/person/[id]", () => {
  it("returns a type-discriminated, scoped profile for a family member", async () => {
    const cookie = await getAdminCookie();
    // Discover a person id from the lookup endpoint (seeded data)
    const lk = await apiFetch(`/api/admin/lookup?q=a`, { cookie });
    const body = await expectJson(lk, 200);
    const personId = body.people?.[0]?.id;
    if (!personId) return; // tolerate a seed with no people
    const res = await apiFetch(`/api/admin/person/${personId}?as=family_member`, { cookie });
    const profile = await expectJson(res, 200);
    expect(["child", "adult"]).toContain(profile.type);
    expect(profile.contact).toBeTruthy();
    expect(Array.isArray(profile.registrations)).toBe(true);
    expect(profile.payments).toHaveProperty("totalPaidCents");
  });

  it("returns a type-discriminated profile for a user", async () => {
    const cookie = await getAdminCookie();
    // Discover a user id from the lookup endpoint (seeded data)
    const lk = await apiFetch(`/api/admin/lookup?q=a`, { cookie });
    const body = await expectJson(lk, 200);
    const userId = body.users?.[0]?.id;
    if (!userId) return; // tolerate a seed with no users
    const res = await apiFetch(`/api/admin/person/${userId}?as=user`, { cookie });
    const profile = await expectJson(res, 200);
    expect(profile.type).toBe("parent");
    expect(profile.contact).toBeTruthy();
    expect(Array.isArray(profile.family)).toBe(true);
    expect(profile.payments).toHaveProperty("totalPaidCents");
  });

  it("400s when `as` param is missing", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/person/00000000-0000-0000-0000-000000000000`,
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("400s when `as` param is invalid", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/person/00000000-0000-0000-0000-000000000000?as=bad`,
      { cookie },
    );
    expect(res.status).toBe(400);
  });

  it("401s without auth", async () => {
    const res = await apiFetch(
      `/api/admin/person/00000000-0000-0000-0000-000000000000?as=family_member`,
    );
    expect(res.status).toBe(401);
  });
});

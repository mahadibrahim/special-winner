import { describe, it, expect, vi } from "vitest";

// Mock getDb so the helper exercises its logic without hitting the DB.
// The helper makes TWO sequential queries: (1) userRoles → scopes, then
// (2) locations within scoped orgs (only if org-scoped rows exist). We
// queue mocks in that order per test.
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => queryMock(),
      }),
    }),
  }),
}));

import { getLocationIdsForUser } from "@/lib/auth/location-scope";

describe("getLocationIdsForUser", () => {
  it("returns empty array when the user has no scoped roles", async () => {
    queryMock.mockResolvedValueOnce([]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids).toEqual([]);
  });

  it("returns location scopeIds for location-scoped rows", async () => {
    queryMock.mockResolvedValueOnce([
      { scopeType: "location", scopeId: "loc-1" },
      { scopeType: "location", scopeId: "loc-2" },
    ]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids.sort()).toEqual(["loc-1", "loc-2"]);
  });

  it("expands organization-scoped rows to all locations in those orgs", async () => {
    queryMock
      .mockResolvedValueOnce([
        { scopeType: "organization", scopeId: "org-1" },
      ])
      .mockResolvedValueOnce([{ id: "loc-a" }, { id: "loc-b" }, { id: "loc-c" }]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids.sort()).toEqual(["loc-a", "loc-b", "loc-c"]);
  });

  it("dedupes overlapping location- and org-scoped rows", async () => {
    queryMock
      .mockResolvedValueOnce([
        { scopeType: "location", scopeId: "loc-a" },
        { scopeType: "organization", scopeId: "org-1" },
      ])
      .mockResolvedValueOnce([{ id: "loc-a" }, { id: "loc-b" }]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids.sort()).toEqual(["loc-a", "loc-b"]);
  });

  it("ignores rows with null scopeId", async () => {
    queryMock.mockResolvedValueOnce([
      { scopeType: "location", scopeId: "loc-1" },
      { scopeType: "location", scopeId: null },
    ]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids).toEqual(["loc-1"]);
  });
});

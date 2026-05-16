import { describe, it, expect, vi } from "vitest";

// Mock getDb so the helper exercises its .map/.filter without touching the DB.
// Mirrors the pattern in tests/unit/branding/resolver.test.ts — the project's
// .env DATABASE_URL points at the prod Railway DB, so DB-touching tests are
// unsafe to run locally.
const selectMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => selectMock(),
      }),
    }),
  }),
}));

import { getLocationIdsForUser } from "@/lib/auth/location-scope";

describe("getLocationIdsForUser", () => {
  it("returns an empty array when no location-scoped rows exist", async () => {
    selectMock.mockResolvedValueOnce([]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids).toEqual([]);
  });

  it("returns the scopeId values from each row", async () => {
    selectMock.mockResolvedValueOnce([
      { scopeId: "11111111-1111-1111-1111-111111111111" },
      { scopeId: "22222222-2222-2222-2222-222222222222" },
    ]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids.sort()).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("filters out null scopeId values defensively", async () => {
    selectMock.mockResolvedValueOnce([
      { scopeId: "33333333-3333-3333-3333-333333333333" },
      { scopeId: null },
    ]);
    const ids = await getLocationIdsForUser("user-1");
    expect(ids).toEqual(["33333333-3333-3333-3333-333333333333"]);
  });
});

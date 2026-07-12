import { describe, it, expect, vi } from "vitest";

// Mock getDb to drive a single test: location lookup returns no rows ⇒
// the helper short-circuits to null. The query joins are exercised by
// integration tests via the API endpoint, not here — this is a guard
// against the early-return path getting silently broken.
const locationSelectMock = vi.fn();
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              // gameRows joins home AND away teams (two chained leftJoins
              // against an aliased teams table) since the self-join merge
              // — see venue-day-data.ts.
              leftJoin: () => ({
                leftJoin: () => ({
                  where: () => Promise.resolve([]),
                }),
                where: () => Promise.resolve([]),
              }),
              where: () => Promise.resolve([]),
            }),
            where: () => Promise.resolve([]),
          }),
          leftJoin: () => ({
            where: () => Promise.resolve([]),
          }),
          // venue_resources fetch ends .where(...).orderBy(...) — the
          // chain must be both awaitable (other call sites) and
          // orderBy-able (this one).
          where: () =>
            Object.assign(Promise.resolve([]), {
              orderBy: () => Promise.resolve([]),
            }),
        }),
        where: () => ({
          limit: () => locationSelectMock(),
        }),
      }),
    }),
  }),
}));

import { getVenueDayData } from "@/lib/admin/venue-day-data";

describe("getVenueDayData", () => {
  it("returns null when the location lookup finds no row", async () => {
    locationSelectMock.mockResolvedValueOnce([]);
    const data = await getVenueDayData("00000000-0000-0000-0000-000000000000", "2026-05-19");
    expect(data).toBeNull();
  });

  it("returns shape with empty blocks when the location exists but has no activity", async () => {
    locationSelectMock.mockResolvedValueOnce([{ id: "loc-1", name: "Downtown" }]);
    const data = await getVenueDayData("loc-1", "2026-05-19");
    expect(data).not.toBeNull();
    expect(data!.locationId).toBe("loc-1");
    expect(data!.locationName).toBe("Downtown");
    expect(data!.date).toBe("2026-05-19");
    expect(data!.blocks).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

let rows: Array<{ id: string }> = [];
let lastWhereArgs: unknown[] = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: (...args: unknown[]) => {
          lastWhereArgs = args;
          return { limit: async () => rows };
        },
      }),
    }),
  }),
}));

import { requireAssignedOfficial } from "@/lib/referee/require-assigned-official";

describe("requireAssignedOfficial", () => {
  beforeEach(() => {
    rows = [];
    lastWhereArgs = [];
  });

  it("returns true when the user is assigned to the game", async () => {
    rows = [{ id: "a1" }];
    const result = await requireAssignedOfficial("u1", "g1");
    expect(result).toBe(true);
  });

  it("returns false when the user has no assignment row at all", async () => {
    rows = [];
    const result = await requireAssignedOfficial("u1", "g1");
    expect(result).toBe(false);
  });

  it("returns false for a mismatched game (query args reflect both filters)", async () => {
    rows = [];
    const result = await requireAssignedOfficial("u1", "wrong-game");
    expect(result).toBe(false);
    expect(lastWhereArgs.length).toBeGreaterThan(0);
  });
});

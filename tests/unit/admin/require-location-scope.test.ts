import { describe, it, expect, vi, beforeEach } from "vitest";

// The effective scope the caller resolves to (null = super-admin).
let scope: string[] | null = null;
// The venue row returned by the lookup (empty = not found).
let venueRow: Array<{ locationId: string }> = [];

vi.mock("@/lib/admin/active-venue", () => ({
  getEffectiveLocationIds: async () => scope,
}));
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => venueRow }) }) }),
  }),
}));

import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";

const ctx = () =>
  ({ locals: { user: { id: "u" }, userRoles: [], activeLocationId: null } }) as never;

describe("callerCanActOnVenue", () => {
  beforeEach(() => {
    scope = null;
    venueRow = [];
  });

  it("super-admin (null scope) is allowed without a venue lookup", async () => {
    scope = null;
    venueRow = []; // even with no venue row, super-admin short-circuits to true
    expect(await callerCanActOnVenue(ctx(), "v1")).toBe(true);
  });

  it("a caller with no assigned locations is denied", async () => {
    scope = [];
    expect(await callerCanActOnVenue(ctx(), "v1")).toBe(false);
  });

  it("allows a venue whose location is in scope", async () => {
    scope = ["loc_1"];
    venueRow = [{ locationId: "loc_1" }];
    expect(await callerCanActOnVenue(ctx(), "v1")).toBe(true);
  });

  it("denies a venue whose location is outside scope", async () => {
    scope = ["loc_1"];
    venueRow = [{ locationId: "loc_2" }];
    expect(await callerCanActOnVenue(ctx(), "v1")).toBe(false);
  });

  it("denies when the venue does not exist", async () => {
    scope = ["loc_1"];
    venueRow = [];
    expect(await callerCanActOnVenue(ctx(), "v1")).toBe(false);
  });
});

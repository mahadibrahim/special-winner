import { describe, it, expect, vi, beforeEach } from "vitest";

let profile: { serviceLocationIds: string[] | null; active: boolean; organizationId: string } | null = null;
let rows: Array<{
  sessionId: string; sessionType: string; scheduledStart: Date; updatedAt: Date;
  sessionLocationId: string | null; venueLocationId: string | null;
  venueName: string | null; locationName: string | null;
}> = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    query: { mediaStaffProfiles: { findFirst: async () => profile } },
    select: () => ({ from: () => ({ leftJoin: () => ({ leftJoin: () => ({ where: () => ({ orderBy: async () => rows }) }) }) }) }),
  }),
}));

import { getTaggingQueue } from "@/lib/media/get-tagging-queue";

const D = new Date("2026-06-15T12:00:00Z");

describe("getTaggingQueue", () => {
  beforeEach(() => { profile = null; rows = []; });

  it("returns [] when the editor has no active profile", async () => {
    profile = null;
    expect(await getTaggingQueue("u1")).toEqual([]);
  });

  it("returns [] for an inactive profile", async () => {
    profile = { serviceLocationIds: ["loc1"], active: false, organizationId: "o1" };
    expect(await getTaggingQueue("u1")).toEqual([]);
  });

  it("keeps only sessions whose effective location is in the service area", async () => {
    profile = { serviceLocationIds: ["loc1"], active: true, organizationId: "o1" };
    rows = [
      // in service area via session.locationId
      { sessionId: "s1", sessionType: "game", scheduledStart: D, updatedAt: D, sessionLocationId: "loc1", venueLocationId: null, venueName: null, locationName: "Downtown" },
      // in service area via venue fallback (session.locationId null)
      { sessionId: "s2", sessionType: "game", scheduledStart: D, updatedAt: D, sessionLocationId: null, venueLocationId: "loc1", venueName: "Field A", locationName: null },
      // NOT in service area
      { sessionId: "s3", sessionType: "game", scheduledStart: D, updatedAt: D, sessionLocationId: "loc2", venueLocationId: null, venueName: null, locationName: "Worthington" },
    ];
    expect(await getTaggingQueue("u1")).toEqual([
      { sessionId: "s1", sessionType: "game", scheduledStart: D, placeName: "Downtown" },
      { sessionId: "s2", sessionType: "game", scheduledStart: D, placeName: "Field A" },
    ]);
  });
});

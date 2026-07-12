import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VenueDayData } from "@/lib/admin/venue-day-data";

// getNavBadges is mocked per-test so we can simulate both the "genuinely
// zero" case and the "call failed" case that this task's fix addresses —
// the two used to be indistinguishable because build-today's catch block
// swallowed errors silently.
const getNavBadgesMock = vi.fn();
vi.mock("@/lib/admin/nav-badges", () => ({
  getNavBadges: (...args: unknown[]) => getNavBadgesMock(...args),
}));

import { buildVenueToday } from "@/lib/venue/build-today";

const baseDayData: VenueDayData = {
  date: "2026-07-11",
  locationId: "loc_1",
  locationName: "Test Venue",
  blocks: [],
  resources: [],
  closeAt: null,
};

describe("buildVenueToday attention badges", () => {
  beforeEach(() => {
    getNavBadgesMock.mockReset();
  });

  it("surfaces request + message attention items when getNavBadges succeeds", async () => {
    getNavBadgesMock.mockResolvedValue({ refundsPending: 2, inbox: 4, attention: 0 });

    const payload = await buildVenueToday(baseDayData, "org_1", "user_1", ["loc_1"]);

    expect(payload.attention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "request", id: "pending-refunds" }),
        expect.objectContaining({ kind: "message", id: "unread-inbox" }),
      ]),
    );
  });

  it("requests an org-wide inbox count (matching the sidebar) while keeping refunds location-scoped", async () => {
    getNavBadgesMock.mockResolvedValue({ refundsPending: 0, inbox: 0, attention: 0 });

    await buildVenueToday(baseDayData, "org_1", "user_1", ["loc_1", "loc_2"]);

    expect(getNavBadgesMock).toHaveBeenCalledWith("org_1", {
      locationIds: ["loc_1", "loc_2"],
      userId: "user_1",
      inboxScope: "org",
    });
  });

  it("fails soft (empty attention) AND logs when getNavBadges throws", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getNavBadgesMock.mockRejectedValue(new Error("boom"));

    const payload = await buildVenueToday(baseDayData, "org_1", "user_1", ["loc_1"]);

    // Fail-soft: no request/message attention items, but no throw either.
    expect(payload.attention).toEqual([]);
    // The catch must log — a silent catch here previously produced a
    // misleading "All clear" state indistinguishable from a real zero count.
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[build-today] attention badges failed:",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});

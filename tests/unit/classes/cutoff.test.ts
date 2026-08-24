import { describe, it, expect } from "vitest";
import { isBeforeCutoff } from "@/lib/classes/book-child";

describe("isBeforeCutoff", () => {
  const startsAt = new Date("2026-09-01T18:00:00Z");

  it("allows cancellation more than 24h before start (default window)", () => {
    const now = new Date("2026-08-31T17:59:59Z"); // 24h00m01s before start
    expect(isBeforeCutoff(startsAt, now)).toBe(true);
  });

  it("blocks cancellation exactly at the 24h boundary", () => {
    const now = new Date("2026-08-31T18:00:00Z"); // exactly 24h before start
    expect(isBeforeCutoff(startsAt, now)).toBe(false);
  });

  it("blocks cancellation inside the 24h window", () => {
    const now = new Date("2026-09-01T12:00:00Z"); // 6h before start
    expect(isBeforeCutoff(startsAt, now)).toBe(false);
  });

  it("blocks cancellation after the session has already started", () => {
    const now = new Date("2026-09-01T19:00:00Z"); // 1h after start
    expect(isBeforeCutoff(startsAt, now)).toBe(false);
  });

  it("honors a custom hours parameter", () => {
    const now = new Date("2026-09-01T15:00:00Z"); // 3h before start
    expect(isBeforeCutoff(startsAt, now, 2)).toBe(true);
    expect(isBeforeCutoff(startsAt, now, 4)).toBe(false);
  });
});

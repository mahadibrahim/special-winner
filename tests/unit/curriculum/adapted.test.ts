import { describe, expect, it } from "vitest";
import { isAdapted } from "@/lib/curriculum/adapted";

describe("isAdapted", () => {
  it("returns false for a freshly-generated session identical to its template", () => {
    const template = [
      { name: "Warmup", durationMinutes: 10 },
      { name: "Technical", durationMinutes: 20 },
      { name: "Scrimmage", durationMinutes: 15 },
    ];
    const session = [
      { name: "Warmup", durationMinutes: 10, order: 1 },
      { name: "Technical", durationMinutes: 20, order: 2 },
      { name: "Scrimmage", durationMinutes: 15, order: 3 },
    ];
    expect(isAdapted(session, template)).toBe(false);
  });

  it("returns true when segments are reordered (durations swap position)", () => {
    const template = [
      { name: "Warmup", durationMinutes: 10 },
      { name: "Technical", durationMinutes: 20 },
    ];
    const session = [
      { name: "Technical", durationMinutes: 20, order: 1 },
      { name: "Warmup", durationMinutes: 10, order: 2 },
    ];
    expect(isAdapted(session, template)).toBe(true);
  });

  it("returns true when a segment's duration changes", () => {
    const template = [{ name: "Warmup", durationMinutes: 10 }];
    const session = [{ name: "Warmup", durationMinutes: 15, order: 1 }];
    expect(isAdapted(session, template)).toBe(true);
  });

  it("returns true when a segment is added beyond the template", () => {
    const template = [{ name: "Warmup", durationMinutes: 10 }];
    const session = [
      { name: "Warmup", durationMinutes: 10, order: 1 },
      { name: "Cooldown", durationMinutes: 5, order: 2 },
    ];
    expect(isAdapted(session, template)).toBe(true);
  });

  it("returns true when a segment is removed from the template", () => {
    const template = [
      { name: "Warmup", durationMinutes: 10 },
      { name: "Technical", durationMinutes: 20 },
    ];
    const session = [{ name: "Warmup", durationMinutes: 10, order: 1 }];
    expect(isAdapted(session, template)).toBe(true);
  });

  it("returns false when both are empty", () => {
    expect(isAdapted([], [])).toBe(false);
    expect(isAdapted(null, null)).toBe(false);
    expect(isAdapted(undefined, undefined)).toBe(false);
  });

  it("returns true when a coach attaches a concrete activity a template only suggested", () => {
    const template = [{ name: "Technical", durationMinutes: 20 }];
    const session = [
      {
        name: "Technical",
        durationMinutes: 20,
        order: 1,
        activityId: "11111111-1111-1111-1111-111111111111",
      },
    ];
    expect(isAdapted(session, template)).toBe(true);
  });

  it("sorts session segments by their own order field, not array position", () => {
    const template = [
      { name: "Warmup", durationMinutes: 10 },
      { name: "Technical", durationMinutes: 20 },
    ];
    // Stored out of order but `order` values match the template's sequence.
    const session = [
      { name: "Technical", durationMinutes: 20, order: 2 },
      { name: "Warmup", durationMinutes: 10, order: 1 },
    ];
    expect(isAdapted(session, template)).toBe(false);
  });
});

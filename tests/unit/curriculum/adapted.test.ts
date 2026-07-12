import { describe, expect, it } from "vitest";
import { isAdapted } from "@/lib/curriculum/adapted";

// Below, every local `template` variable stands in for a session's
// `prescribedStructure` — the generation-time snapshot, never a live
// template read (see adapted.ts's module docstring, T9/T10 review fix).
// The variable name is kept short for readability; the mechanics under
// test are unchanged by the source-of-truth rename.
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

  // Distribution skill-linkage fix: prescribedStructure can now carry a
  // resolvedActivityId (the suggestion the distribution engine resolved at
  // generation time). A session is "delivered" — not adapted — as long as
  // the coach never changed which activity is actually attached, i.e. the
  // session's own activityId still equals what was resolved at generation.
  describe("resolvedActivityId semantics", () => {
    it("legacy snapshot (no resolvedActivityId) + a concrete session activityId still counts as adapted (unchanged legacy behavior)", () => {
      const template = [{ name: "Technical", durationMinutes: 20 }]; // no resolvedActivityId
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

    it("new snapshot with a matching resolvedActivityId is NOT adapted", () => {
      const template = [
        {
          name: "Technical",
          durationMinutes: 20,
          resolvedActivityId: "11111111-1111-1111-1111-111111111111",
        },
      ];
      const session = [
        {
          name: "Technical",
          durationMinutes: 20,
          order: 1,
          activityId: "11111111-1111-1111-1111-111111111111",
        },
      ];
      expect(isAdapted(session, template)).toBe(false);
    });

    it("swapped activityId (coach picked a different activity than resolved) is adapted", () => {
      const template = [
        {
          name: "Technical",
          durationMinutes: 20,
          resolvedActivityId: "11111111-1111-1111-1111-111111111111",
        },
      ];
      const session = [
        {
          name: "Technical",
          durationMinutes: 20,
          order: 1,
          activityId: "22222222-2222-2222-2222-222222222222",
        },
      ];
      expect(isAdapted(session, template)).toBe(true);
    });

    it("resolved snapshot + coach clearing the activity is adapted", () => {
      const template = [
        {
          name: "Technical",
          durationMinutes: 20,
          resolvedActivityId: "11111111-1111-1111-1111-111111111111",
        },
      ];
      const session = [
        { name: "Technical", durationMinutes: 20, order: 1, activityId: null },
      ];
      expect(isAdapted(session, template)).toBe(true);
    });
  });
});

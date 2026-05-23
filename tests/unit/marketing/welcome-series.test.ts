import { describe, it, expect } from "vitest";
import {
  WELCOME_SERIES_STEPS,
  dueWelcomeSeriesSteps,
} from "@/lib/marketing/welcome-series";

const REF = new Date("2026-05-21T12:00:00Z");
const daysAgo = (n: number) => new Date(REF.getTime() - n * 86_400_000);

describe("dueWelcomeSeriesSteps", () => {
  it("returns no steps before the first offset", () => {
    expect(
      dueWelcomeSeriesSteps({
        enrolledAt: daysAgo(1),
        optedOutAt: null,
        sentEmailTypes: new Set(),
        now: REF,
      }),
    ).toEqual([]);
  });

  it("returns step 1 once its offset has elapsed", () => {
    const due = dueWelcomeSeriesSteps({
      enrolledAt: daysAgo(2),
      optedOutAt: null,
      sentEmailTypes: new Set(),
      now: REF,
    });
    expect(due.map((s) => s.step)).toEqual([1]);
  });

  it("does not re-return a step already sent", () => {
    const due = dueWelcomeSeriesSteps({
      enrolledAt: daysAgo(6),
      optedOutAt: null,
      sentEmailTypes: new Set(["welcome_series_1"]),
      now: REF,
    });
    expect(due.map((s) => s.step)).toEqual([2]);
  });

  it("returns nothing when opted out", () => {
    expect(
      dueWelcomeSeriesSteps({
        enrolledAt: daysAgo(30),
        optedOutAt: daysAgo(1),
        sentEmailTypes: new Set(),
        now: REF,
      }),
    ).toEqual([]);
  });

  it("returns all remaining due steps when the cron missed days", () => {
    const due = dueWelcomeSeriesSteps({
      enrolledAt: daysAgo(20),
      optedOutAt: null,
      sentEmailTypes: new Set(),
      now: REF,
    });
    expect(due.map((s) => s.step)).toEqual([1, 2, 3]);
  });
});

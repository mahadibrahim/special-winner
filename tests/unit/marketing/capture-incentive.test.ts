import { describe, it, expect } from "vitest";
import {
  CAPTURE_INCENTIVE,
  formatIncentiveAmount,
  sourceTriggersIncentive,
  CAPTURE_INCENTIVE_SOURCE,
  JOIN_PAGE_SOURCE,
} from "@/lib/marketing/capture-incentive";

describe("capture incentive campaign config", () => {
  it("formats whole-dollar amounts without cents", () => {
    expect(formatIncentiveAmount(1500)).toBe("$15");
  });

  it("formats fractional amounts with two decimals", () => {
    expect(formatIncentiveAmount(1250)).toBe("$12.50");
  });

  it("pins the live campaign values — update callers if this changes", () => {
    expect(CAPTURE_INCENTIVE.code).toBe("WELCOME15");
    expect(CAPTURE_INCENTIVE.amountCents).toBe(1500);
  });
});

describe("sourceTriggersIncentive", () => {
  it("triggers for the home capture band source", () => {
    expect(sourceTriggersIncentive(CAPTURE_INCENTIVE_SOURCE)).toBe(true);
  });

  it("triggers for the join-page source", () => {
    expect(sourceTriggersIncentive(JOIN_PAGE_SOURCE)).toBe(true);
  });

  it("does not trigger for unrelated or missing sources", () => {
    expect(sourceTriggersIncentive("footer")).toBe(false);
    expect(sourceTriggersIncentive(undefined)).toBe(false);
    expect(sourceTriggersIncentive(null)).toBe(false);
  });
});

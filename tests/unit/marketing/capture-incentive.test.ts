import { describe, it, expect } from "vitest";
import {
  CAPTURE_INCENTIVE,
  formatIncentiveAmount,
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

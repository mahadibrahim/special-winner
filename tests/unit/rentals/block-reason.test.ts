import { describe, it, expect } from "vitest";
import { blockReasonLabel } from "@/lib/rentals/availability";

describe("blockReasonLabel", () => {
  it('maps "rental" → "Rented"', () => {
    expect(blockReasonLabel("rental")).toBe("Rented");
  });

  it('maps "drop_in" → "Pickup Game"', () => {
    expect(blockReasonLabel("drop_in")).toBe("Pickup Game");
  });

  it('maps "game" → "League Game"', () => {
    expect(blockReasonLabel("game")).toBe("League Game");
  });

  it('maps "maintenance" → "Closed"', () => {
    expect(blockReasonLabel("maintenance")).toBe("Closed");
  });

  it('maps "external" → "Reserved"', () => {
    expect(blockReasonLabel("external")).toBe("Reserved");
  });

  it('maps "practice" → "Reserved"', () => {
    expect(blockReasonLabel("practice")).toBe("Reserved");
  });

  it('maps an unknown value → "Unavailable"', () => {
    expect(blockReasonLabel("unknown_future_type")).toBe("Unavailable");
    expect(blockReasonLabel("")).toBe("Unavailable");
  });
});

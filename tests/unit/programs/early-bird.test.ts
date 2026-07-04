import { describe, expect, it } from "vitest";
import { effectivePriceCents, isEarlyBirdActive } from "@/lib/programs/early-bird";

const NOW = new Date("2026-07-04T15:00:00Z");

describe("isEarlyBirdActive", () => {
  it("is active while now is before the deadline and a price is set", () => {
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: "2026-07-18T00:00:00Z", earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(true);
  });

  it("expires once the deadline has passed", () => {
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: "2026-07-01T00:00:00Z", earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(false);
  });

  it("is inactive exactly at the deadline instant (strictly before)", () => {
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: NOW, earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(false);
  });

  it("deadline set but no price → never active", () => {
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: "2026-07-18T00:00:00Z", earlyBirdPriceCents: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("price set but no deadline → never active", () => {
    expect(
      isEarlyBirdActive({ earlyBirdDeadline: null, earlyBirdPriceCents: 13000 }, NOW),
    ).toBe(false);
  });

  it("accepts a Date object for the deadline", () => {
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: new Date("2026-07-18T00:00:00Z"), earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(true);
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: new Date("2026-07-01T00:00:00Z"), earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("effectivePriceCents", () => {
  const base = { priceCents: 15000 };

  it("returns the early-bird price while the window is active", () => {
    expect(
      effectivePriceCents(
        { ...base, earlyBirdDeadline: "2026-07-18T00:00:00Z", earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(13000);
  });

  it("returns the list price once the window has expired", () => {
    expect(
      effectivePriceCents(
        { ...base, earlyBirdDeadline: "2026-07-01T00:00:00Z", earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(15000);
  });

  it("returns the list price when the deadline is set but no price", () => {
    expect(
      effectivePriceCents(
        { ...base, earlyBirdDeadline: "2026-07-18T00:00:00Z", earlyBirdPriceCents: null },
        NOW,
      ),
    ).toBe(15000);
  });

  it("returns the list price when the price is set but no deadline", () => {
    expect(
      effectivePriceCents(
        { ...base, earlyBirdDeadline: null, earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(15000);
  });

  it("accepts Date and string deadlines equivalently", () => {
    const asString = effectivePriceCents(
      { ...base, earlyBirdDeadline: "2026-07-18T00:00:00Z", earlyBirdPriceCents: 13000 },
      NOW,
    );
    const asDate = effectivePriceCents(
      { ...base, earlyBirdDeadline: new Date("2026-07-18T00:00:00Z"), earlyBirdPriceCents: 13000 },
      NOW,
    );
    expect(asString).toBe(asDate);
  });

  it("treats a zero or negative early-bird price as unset — never charges $0", () => {
    expect(
      effectivePriceCents(
        { ...base, earlyBirdDeadline: "2026-07-18T00:00:00Z", earlyBirdPriceCents: 0 },
        NOW,
      ),
    ).toBe(15000);
    expect(
      effectivePriceCents(
        { ...base, earlyBirdDeadline: "2026-07-18T00:00:00Z", earlyBirdPriceCents: -100 },
        NOW,
      ),
    ).toBe(15000);
  });
});

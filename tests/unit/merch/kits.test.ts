import { describe, it, expect } from "vitest";
import { kitWindowState, generateShareToken } from "@/lib/merch/kits";

const t = (iso: string | null) => (iso ? new Date(iso) : null);

describe("kitWindowState", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  it("open when now is within the window", () => {
    expect(kitWindowState({ orderOpensAt: t("2026-08-01T00:00:00Z"), orderClosesAt: t("2026-08-31T00:00:00Z") }, now)).toBe("open");
  });
  it("not_open before the start", () => {
    expect(kitWindowState({ orderOpensAt: t("2026-09-01T00:00:00Z"), orderClosesAt: null }, now)).toBe("not_open");
  });
  it("closed after the end", () => {
    expect(kitWindowState({ orderOpensAt: null, orderClosesAt: t("2026-08-01T00:00:00Z") }, now)).toBe("closed");
  });
  it("open when both bounds are null", () => {
    expect(kitWindowState({ orderOpensAt: null, orderClosesAt: null }, now)).toBe("open");
  });
});

describe("generateShareToken", () => {
  it("is 32 hex chars", () => {
    expect(generateShareToken()).toMatch(/^[0-9a-f]{32}$/);
  });
});

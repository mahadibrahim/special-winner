import { describe, it, expect } from "vitest";
import { storeWindowState, generateShareToken, isStoreShoppable } from "@/lib/merch/stores";

const t = (iso: string) => new Date(iso);

describe("storeWindowState", () => {
  const now = t("2026-08-01T12:00:00Z");
  it("open when no window set", () => {
    expect(storeWindowState({ orderOpensAt: null, orderClosesAt: null }, now)).toBe("open");
  });
  it("not_open before open", () => {
    expect(storeWindowState({ orderOpensAt: t("2026-08-02T00:00:00Z"), orderClosesAt: null }, now)).toBe("not_open");
  });
  it("closed after close", () => {
    expect(storeWindowState({ orderOpensAt: null, orderClosesAt: t("2026-07-31T00:00:00Z") }, now)).toBe("closed");
  });
  it("open inside window", () => {
    expect(storeWindowState({ orderOpensAt: t("2026-07-01T00:00:00Z"), orderClosesAt: t("2026-08-31T00:00:00Z") }, now)).toBe("open");
  });
});

describe("generateShareToken", () => {
  it("is 32 hex chars, unique-ish", () => {
    const a = generateShareToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(generateShareToken());
  });
});

describe("isStoreShoppable", () => {
  const base = { active: true, orderOpensAt: null, orderClosesAt: null } as const;
  const now = t("2026-08-01T12:00:00Z");
  it("false when inactive", () => { expect(isStoreShoppable({ ...base, active: false }, now)).toBe(false); });
  it("false when closed", () => { expect(isStoreShoppable({ ...base, orderClosesAt: t("2026-07-01T00:00:00Z") }, now)).toBe(false); });
  it("true when active + open", () => { expect(isStoreShoppable(base, now)).toBe(true); });
});

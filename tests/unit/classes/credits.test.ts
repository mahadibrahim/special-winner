import { describe, it, expect } from "vitest";
import { selectRedeemableGrant, type CreditGrantBalance } from "@/lib/classes/credits";

const base = (over: Partial<CreditGrantBalance>): CreditGrantBalance => ({
  grantId: "g1",
  source: "pack",
  slotTemplateId: null,
  sessionsGranted: 10,
  used: 0,
  remaining: 10,
  expiresAt: new Date("2027-01-01T00:00:00Z"),
  packName: null,
  blockName: null,
  ...over,
});
const NOW = new Date("2026-09-01T00:00:00Z");

describe("selectRedeemableGrant", () => {
  it("prefers a pinned grant matching the template over a floating pack", () => {
    const pinned = base({ grantId: "block", source: "block", slotTemplateId: "tpl-1" });
    const floating = base({ grantId: "pack" });
    expect(
      selectRedeemableGrant([floating, pinned], { slotTemplateId: "tpl-1", at: NOW })?.grantId,
    ).toBe("block");
  });
  it("never spends a pinned grant on a different template's session", () => {
    const pinned = base({ grantId: "block", source: "block", slotTemplateId: "tpl-1" });
    expect(selectRedeemableGrant([pinned], { slotTemplateId: "tpl-2", at: NOW })).toBeNull();
    expect(selectRedeemableGrant([pinned], { slotTemplateId: null, at: NOW })).toBeNull();
  });
  it("floating packs redeem on any template, oldest expiry first", () => {
    const a = base({ grantId: "later", expiresAt: new Date("2027-06-01T00:00:00Z") });
    const b = base({ grantId: "sooner", expiresAt: new Date("2026-12-01T00:00:00Z") });
    expect(selectRedeemableGrant([a, b], { slotTemplateId: "tpl-9", at: NOW })?.grantId).toBe(
      "sooner",
    );
  });
  it("skips expired and exhausted grants", () => {
    const expired = base({ grantId: "expired", expiresAt: new Date("2026-08-01T00:00:00Z") });
    const empty = base({ grantId: "empty", remaining: 0, used: 10 });
    expect(selectRedeemableGrant([expired, empty], { slotTemplateId: null, at: NOW })).toBeNull();
  });
  it("expiry boundary: a grant expiring exactly at the session start is not redeemable", () => {
    const atNow = base({ grantId: "atNow", expiresAt: NOW });
    expect(selectRedeemableGrant([atNow], { slotTemplateId: null, at: NOW })).toBeNull();
  });

  it("is not redeemable for a session that starts after the grant expires", () => {
    // `at` is the SESSION START instant, not the wall clock. A grant that is
    // live TODAY but dead before the session runs must not be spent on it —
    // otherwise a block credit buys a seat outside its own block window, and
    // a pack credit buys a session it will never be valid for. This is the
    // whole reason the opt is named `at` rather than `now`.
    const expiringSoon = base({ grantId: "expiring", expiresAt: new Date("2026-09-15T00:00:00Z") });

    const sessionAfterExpiry = new Date("2026-09-20T00:00:00Z");
    expect(
      selectRedeemableGrant([expiringSoon], { slotTemplateId: null, at: sessionAfterExpiry }),
    ).toBeNull();

    // Control: the SAME grant, an earlier session still inside its window.
    const sessionBeforeExpiry = new Date("2026-09-10T00:00:00Z");
    expect(
      selectRedeemableGrant([expiringSoon], { slotTemplateId: null, at: sessionBeforeExpiry })
        ?.grantId,
    ).toBe("expiring");
  });

  it("prefers a pinned grant that outlives the session over one that does not", () => {
    // Ranking still puts pinned first, but only among grants that survive to
    // the session — a dead pinned grant must not shadow a live floating pack.
    const pinnedDead = base({
      grantId: "pin-dead",
      source: "block",
      slotTemplateId: "tpl-1",
      expiresAt: new Date("2026-09-15T00:00:00Z"),
    });
    const floatingLive = base({ grantId: "pack-live" });
    expect(
      selectRedeemableGrant([pinnedDead, floatingLive], {
        slotTemplateId: "tpl-1",
        at: new Date("2026-09-20T00:00:00Z"),
      })?.grantId,
    ).toBe("pack-live");
  });

  it("returns null for an empty balance list", () => {
    expect(selectRedeemableGrant([], { slotTemplateId: "tpl-1", at: NOW })).toBeNull();
  });

  it("picks the earliest-expiring pinned grant when several match the template", () => {
    const later = base({
      grantId: "pin-later",
      source: "block",
      slotTemplateId: "tpl-1",
      expiresAt: new Date("2027-03-01T00:00:00Z"),
    });
    const sooner = base({
      grantId: "pin-sooner",
      source: "block",
      slotTemplateId: "tpl-1",
      expiresAt: new Date("2026-11-01T00:00:00Z"),
    });
    expect(
      selectRedeemableGrant([later, sooner], { slotTemplateId: "tpl-1", at: NOW })?.grantId,
    ).toBe("pin-sooner");
  });

  it("falls back to a floating pack when the pinned grant is exhausted", () => {
    const pinnedEmpty = base({
      grantId: "pin-empty",
      source: "block",
      slotTemplateId: "tpl-1",
      remaining: 0,
      used: 8,
      sessionsGranted: 8,
      expiresAt: new Date("2026-10-01T00:00:00Z"),
    });
    const floating = base({ grantId: "pack" });
    expect(
      selectRedeemableGrant([pinnedEmpty, floating], { slotTemplateId: "tpl-1", at: NOW })
        ?.grantId,
    ).toBe("pack");
  });

  it("does not mutate the input array", () => {
    const a = base({ grantId: "later", expiresAt: new Date("2027-06-01T00:00:00Z") });
    const b = base({ grantId: "sooner", expiresAt: new Date("2026-12-01T00:00:00Z") });
    const input = [a, b];
    selectRedeemableGrant(input, { slotTemplateId: null, at: NOW });
    expect(input.map((g) => g.grantId)).toEqual(["later", "sooner"]);
  });
});

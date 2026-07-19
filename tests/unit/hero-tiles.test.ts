// tests/unit/hero-tiles.test.ts
import { describe, it, expect } from "vitest"
import { tileLinksOut, type HeroTile } from "@/lib/landing/hero-tiles"

const base: HeroTile = {
  label: "Soccer", key: "soccer", state: "live",
  statusLabel: "● Now registering", meta: "3 sessions", color: "oklch(0.66 0.21 35)",
}

describe("tileLinksOut", () => {
  it("links out when a live tile has an href", () => {
    expect(tileLinksOut({ ...base, href: "/adult/leagues/soccer" })).toBe(true)
  })
  it("scroll-filters (no link) when a live tile has no href", () => {
    expect(tileLinksOut({ ...base, href: null })).toBe(false)
    expect(tileLinksOut(base)).toBe(false)
  })
  it("never links out for a coming_soon tile", () => {
    expect(tileLinksOut({ ...base, state: "coming_soon", href: "/x" })).toBe(false)
  })
  it("a fallbackHref alone keeps the tile on the scroll-filter path", () => {
    // fallbackHref is the no-JS / empty-finder safety net, not a link-out —
    // the hero renders it as an anchor but the script still filters in-page.
    expect(tileLinksOut({ ...base, fallbackHref: "/programs?audience=youth" })).toBe(false)
  })
})

// tests/unit/camp-page-content.test.ts
// The camps registry drives /youth/camps AND /youth/camps/[type]. These
// invariants are what the pages assume; break one and a page 404s or
// renders an empty band silently.
import { describe, it, expect } from "vitest"
import {
  CAMP_TYPES,
  CAMP_DAY_FACTS,
  CAMP_CALENDAR,
  CAMP_HUB_FAQS,
} from "@/lib/youth/camp-page-content"

describe("camp page content registry", () => {
  it("carries exactly the four owner-decided families, in menu order", () => {
    expect(CAMP_TYPES.map((t) => t.slug)).toEqual([
      "schools-out",
      "summer",
      "skills",
      "specialty",
    ])
  })

  it("slugs are unique and URL-safe (they are route params)", () => {
    const slugs = CAMP_TYPES.map((t) => t.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
  })

  it("every family renders either a timetable or named camps — never neither", () => {
    for (const t of CAMP_TYPES) {
      expect(
        t.schedule.length > 0 || t.namedCamps.length > 0,
        `${t.slug} has no schedule and no named camps`,
      ).toBe(true)
    }
  })

  it("program slugs never overlap between families (a season must have one home)", () => {
    const all = CAMP_TYPES.flatMap((t) => t.programSlugs)
    expect(new Set(all).size).toBe(all.length)
  })

  it("every family has who-cards and FAQs for its detail page", () => {
    for (const t of CAMP_TYPES) {
      expect(t.whoCards.length, `${t.slug} whoCards`).toBeGreaterThanOrEqual(2)
      expect(t.faqs.length, `${t.slug} faqs`).toBeGreaterThanOrEqual(3)
    }
  })

  it("hub-level furniture is populated", () => {
    expect(CAMP_DAY_FACTS.length).toBeGreaterThanOrEqual(4)
    expect(CAMP_CALENDAR.length).toBe(4)
    expect(CAMP_HUB_FAQS.length).toBeGreaterThanOrEqual(5)
  })

  it("copy ban: nothing claims camps are school-break-only", () => {
    // The year-round framing is an owner-approved contract.
    const allCopy = JSON.stringify(CAMP_TYPES) + JSON.stringify(CAMP_HUB_FAQS)
    expect(allCopy.toLowerCase()).not.toContain("only when school")
    expect(allCopy.toLowerCase()).not.toContain("school breaks only")
  })
})

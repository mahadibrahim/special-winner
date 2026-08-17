import { describe, it, expect } from "vitest"
import { divisionSlug, divisionNaming } from "@/lib/leagues/division-slug"

const base = {
  id: "s-1",
  slug: "u10-girls",
  dayOfWeek: "sat",
  location: { slug: "worthington", name: "Worthington", state: "OH" },
}

describe("divisionSlug for youth", () => {
  it("builds a slug from age group and gender", () => {
    expect(
      divisionSlug({ ...base, divisionGender: "girls" }, { ageGroupName: "U10" }),
    ).toBe("u10-girls-saturday-worthington")
  })

  it("handles boys", () => {
    expect(
      divisionSlug({ ...base, divisionGender: "boys" }, { ageGroupName: "U12" }),
    ).toBe("u12-boys-saturday-worthington")
  })

  it("keeps coed spelled as co-ed, matching existing adult URLs", () => {
    expect(
      divisionSlug({ ...base, divisionGender: "coed" }, { ageGroupName: "U8" }),
    ).toBe("u8-co-ed-saturday-worthington")
  })

  it("leaves adult slugs byte-identical when no age group is passed", () => {
    expect(
      divisionSlug({
        ...base,
        slug: "co-ed-b",
        divisionGender: "coed",
        skillLevel: "b",
        dayOfWeek: "wed",
      }),
    ).toBe("co-ed-b-wednesday-worthington")
  })
})

describe("divisionNaming audience", () => {
  it("says Youth in a youth title", () => {
    const n = divisionNaming(
      { ...base, divisionGender: "girls" },
      "Soccer",
      "Winter I",
      "youth",
    )
    expect(n.title).toContain("Youth Soccer League")
    expect(n.title).not.toContain("Adult")
  })

  it("still says Adult by default", () => {
    const n = divisionNaming({ ...base, divisionGender: "coed" }, "Soccer", "Fall 2026")
    expect(n.title).toContain("Adult Soccer League")
  })

  it("leads the headline and title with the age group when passed", () => {
    const n = divisionNaming(
      { ...base, divisionGender: "girls" },
      "Soccer",
      "Winter I",
      "youth",
      "U10",
    )
    expect(n.headline).toBe("U10 Girls Saturday")
    expect(n.title).toContain("U10 Girls Saturday Youth Soccer League")
  })

  it("produces distinct headline/title for divisions differing ONLY by age group", () => {
    // Same gender/day/venue, different age group — divisionSlug already gives
    // these distinct URLs (u8-... vs u10-...); this is the regression test
    // for the title/H1/breadcrumb duplication bug that shipped alongside it.
    const u8 = divisionNaming({ ...base, divisionGender: "girls" }, "Soccer", "Winter I", "youth", "U8")
    const u10 = divisionNaming({ ...base, divisionGender: "girls" }, "Soccer", "Winter I", "youth", "U10")
    expect(u8.headline).not.toBe(u10.headline)
    expect(u8.title).not.toBe(u10.title)
    expect(u8.headline).toBe("U8 Girls Saturday")
    expect(u10.headline).toBe("U10 Girls Saturday")
  })

  it("omits the age group and stays byte-identical for adult when ageGroupName is not passed", () => {
    const withoutAgeGroup = divisionNaming(
      { ...base, slug: "co-ed-b", divisionGender: "coed", skillLevel: "b", dayOfWeek: "wed" },
      "Soccer",
      "Fall 2026",
    )
    const explicitAdultDefault = divisionNaming(
      { ...base, slug: "co-ed-b", divisionGender: "coed", skillLevel: "b", dayOfWeek: "wed" },
      "Soccer",
      "Fall 2026",
      "adult",
    )
    expect(withoutAgeGroup).toEqual(explicitAdultDefault)
    expect(withoutAgeGroup.headline).toBe("Co-Ed B Wednesday")
    expect(withoutAgeGroup.title).toBe(
      "Co-Ed B Wednesday Adult Soccer League — Worthington, OH | Fall 2026",
    )
  })
})

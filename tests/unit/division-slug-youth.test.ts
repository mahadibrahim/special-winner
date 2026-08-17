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
})

import { describe, it, expect } from "vitest";
import { divisionSlug, divisionSlugMap, divisionNaming } from "@/lib/leagues/division-slug";

const base = {
  id: "s1",
  slug: "fall-2026-co-ed-b",
  divisionGender: "coed",
  skillLevel: "b",
  dayOfWeek: "wed",
  minAge: null,
  location: { slug: "worthington", name: "Worthington", state: "OH" },
};

describe("divisionSlug", () => {
  it("builds gender-tier-day-venue slugs", () => {
    expect(divisionSlug(base)).toBe("co-ed-b-wednesday-worthington");
    expect(divisionSlug({ ...base, divisionGender: "mens", skillLevel: "d", dayOfWeek: "mon" })).toBe(
      "mens-d-monday-worthington",
    );
  });

  it("uses the age qualifier instead of a skill letter for 30+/40+ divisions", () => {
    expect(divisionSlug({ ...base, skillLevel: null, minAge: 30, dayOfWeek: "sun" })).toBe(
      "co-ed-30-plus-sunday-worthington",
    );
    expect(divisionSlug({ ...base, skillLevel: "b", minAge: 40, dayOfWeek: "sun" })).toBe(
      "co-ed-40-plus-sunday-worthington",
    );
  });

  it("treats 'open' skill as no tier", () => {
    expect(divisionSlug({ ...base, skillLevel: "open" })).toBe("co-ed-wednesday-worthington");
  });

  it("keeps venues distinct for identical divisions", () => {
    const downtown = { ...base, id: "s2", location: { slug: "downtown", name: "Downtown", state: "OH" } };
    expect(divisionSlug(base)).not.toBe(divisionSlug(downtown));
  });

  it("falls back to seasons.slug for degenerate metadata", () => {
    const bare = { ...base, divisionGender: null, skillLevel: null, dayOfWeek: null, minAge: null };
    expect(divisionSlug(bare)).toBe("fall-2026-co-ed-b-worthington");
  });
});

describe("divisionSlugMap", () => {
  it("disambiguates collisions with seasons.slug", () => {
    const twin = { ...base, id: "s2", slug: "fall-2026-co-ed-b-late" };
    const map = divisionSlugMap([base, twin]);
    expect(map.size).toBe(2);
    expect(map.get("co-ed-b-wednesday-worthington")?.id).toBe("s1");
    expect(map.get("fall-2026-co-ed-b-late-worthington")?.id).toBe("s2");
  });
});

describe("divisionNaming", () => {
  it("builds the SEO title from division metadata", () => {
    const { title, headline, label } = divisionNaming(base, "Soccer", "Fall 2026");
    expect(label).toBe("Co-Ed B");
    expect(headline).toBe("Co-Ed B Wednesday");
    expect(title).toBe("Co-Ed B Wednesday Adult Soccer League — Worthington, OH | Fall 2026");
  });

  it("labels age divisions with the qualifier", () => {
    const { title } = divisionNaming(
      { ...base, skillLevel: null, minAge: 30, dayOfWeek: "sun" },
      "Soccer",
      "Fall 2026",
    );
    expect(title).toBe("Co-Ed 30+ Sunday Adult Soccer League — Worthington, OH | Fall 2026");
  });
});

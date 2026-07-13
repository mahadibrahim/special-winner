import { describe, it, expect } from "vitest";
import { aggregateFeaturedTerm, type SeasonLike } from "@/lib/soccerone/featured-term";

const season = (over: Partial<SeasonLike>): SeasonLike => ({
  id: "id-" + Math.abs(JSON.stringify(over).length),
  name: "Fall 2026 — Co-Ed D",
  startDate: "2026-09-14",
  registrationCloses: "2026-09-03T23:59:59.000Z",
  termSlug: "fall-2026",
  termLabel: "Fall 2026",
  price: 120,
  teamPrice: 1050,
  ...over,
});

describe("aggregateFeaturedTerm", () => {
  it("aggregates a multi-division term (the prod fall shape)", () => {
    const agg = aggregateFeaturedTerm([
      season({ name: "Fall 2026 — Co-Ed D" }),
      season({ name: "Fall 2026 — Men's C" }),
      season({ name: "Fall 2026 — Women's Open" }),
      season({ name: "Fall 2026 — Co-Ed 30+" }),
      season({ name: "Fall 2026 — Open / A" }),
    ]);
    expect(agg.multi).toBe(true);
    expect(agg.termLabel).toBe("Fall 2026");
    expect(agg.count).toBe(5);
    expect(agg.families).toEqual(["Co-Ed", "Men's", "Women's", "30+/40+", "Open"]);
    expect(agg.kickoff).toBe("2026-09-14");
    expect(agg.closes).toBe("2026-09-03T23:59:59.000Z");
    expect(agg.uniformPrice).toBe("$120/player · $1,050/team");
  });

  it("stays single for a lone season and for null terms", () => {
    expect(aggregateFeaturedTerm([season({})]).multi).toBe(false);
    const nullTerm = aggregateFeaturedTerm([
      season({ termSlug: null, termLabel: null }),
      season({ termSlug: null, termLabel: null }),
    ]);
    expect(nullTerm.multi).toBe(false);
    expect(nullTerm.count).toBe(1);
  });

  it("only groups the FEATURED season's term", () => {
    const agg = aggregateFeaturedTerm([
      season({ termSlug: "spring-2026", termLabel: "Spring 2026", name: "Adult Coed — Spring 2026", startDate: "2026-08-23" }),
      season({ name: "Fall 2026 — Co-Ed D" }),
      season({ name: "Fall 2026 — Men's C" }),
    ]);
    expect(agg.multi).toBe(false);
    expect(agg.termLabel).toBe("Spring 2026");
    expect(agg.count).toBe(1);
  });

  it("drops uniform price on any variance and takes the earliest closes", () => {
    const agg = aggregateFeaturedTerm([
      season({ name: "Fall 2026 — Co-Ed D", registrationCloses: "2026-09-03T23:59:59.000Z" }),
      season({ name: "Fall 2026 — Futsal Co-Ed", teamPrice: 800, registrationCloses: "2026-08-30T23:59:59.000Z" }),
    ]);
    expect(agg.multi).toBe(true);
    expect(agg.uniformPrice).toBeNull();
    expect(agg.closes).toBe("2026-08-30T23:59:59.000Z");
    expect(agg.families).toContain("Futsal");
  });

  it("handles empty input and null closes", () => {
    expect(aggregateFeaturedTerm([]).multi).toBe(false);
    const agg = aggregateFeaturedTerm([
      season({ registrationCloses: null }),
      season({ name: "Fall 2026 — Men's D", registrationCloses: null }),
    ]);
    expect(agg.closes).toBeNull();
    expect(agg.multi).toBe(true);
  });
});

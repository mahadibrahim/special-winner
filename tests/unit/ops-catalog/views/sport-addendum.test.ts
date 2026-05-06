import { describe, it, expect } from "vitest";
import { renderSportAddendum } from "../../../../scripts/ops-catalog/views/sport-addendum";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";

describe("renderSportAddendum", () => {
  it("includes only activities tagged with the requested sport", () => {
    const md = renderSportAddendum(buildInlineCatalog(), "soccer");

    expect(md).toMatch(/^# Sport addendum — soccer/m);
    // rainout + post_game_report are tagged soccer.
    expect(md).toContain(`(\`${fixtureIds.activities.rainout}\`)`);
    expect(md).toContain(`(\`${fixtureIds.activities.postGameReport}\`)`);
    // field_setup has empty sport_tags -> excluded.
    expect(md).not.toContain(`(\`${fixtureIds.activities.fieldSetup}\`)`);
    // Per-activity context bullets present.
    expect(md).toMatch(/Phase:/);
    expect(md).toMatch(/Accountable:/);
  });

  it("returns 'No sport-specific activities' note when nothing matches", () => {
    const md = renderSportAddendum(buildInlineCatalog(), "pickleball");

    expect(md).toMatch(/^# Sport addendum — pickleball/m);
    expect(md).toContain("No sport-specific activities for pickleball.");
  });
});

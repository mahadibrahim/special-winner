import { describe, it, expect } from "vitest";
import {
  renderRunbook,
  type RunbookContext,
} from "../../../../src/lib/ops-catalog/views/runbook";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";

const baseCtx: RunbookContext = {
  venue_id: "powell",
  event_date: "2026-06-01",
  sport_tags: ["soccer"],
  venue_tags: ["outdoor"],
  format_tags: [],
  audience_tags: ["youth"],
};

describe("renderRunbook", () => {
  it("renders top-level header and phase sections for matching phases", () => {
    const md = renderRunbook(buildInlineCatalog(), baseCtx);

    expect(md).toMatch(/^# Runbook — powell — 2026-06-01/m);
    // pre_game has rainout (matches outdoor + soccer + youth)
    expect(md).toContain("## pre_game");
    // day_setup has field setup (no tag constraints, always matches)
    expect(md).toContain("## day_setup");
    // No phase has post_game match (post_game requires venue indoor)
    expect(md).not.toContain("## post_game");
  });

  it("includes activities matching the context tags", () => {
    const md = renderRunbook(buildInlineCatalog(), baseCtx);

    expect(md).toContain(`(\`${fixtureIds.activities.rainout}\`)`);
    expect(md).toContain(`(\`${fixtureIds.activities.fieldSetup}\`)`);
    // Per-activity bullets
    expect(md).toMatch(/Accountable:.*role\.venue_manager/);
    expect(md).toMatch(/Expected completion:.*T-90min/);
    expect(md).toMatch(/Tracking:.*form/);
  });

  it("excludes activities whose populated tag dimension doesn't match", () => {
    // Switch venue to indoor: rainout (outdoor) should drop, post_game (indoor) should appear.
    const md = renderRunbook(buildInlineCatalog(), {
      ...baseCtx,
      venue_tags: ["indoor"],
    });

    expect(md).not.toContain(`(\`${fixtureIds.activities.rainout}\`)`);
    expect(md).toContain(`(\`${fixtureIds.activities.postGameReport}\`)`);
    // pre_game phase has no other matching activities -> no header
    expect(md).not.toContain("## pre_game");
  });
});

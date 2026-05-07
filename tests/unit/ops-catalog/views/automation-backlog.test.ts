import { describe, it, expect } from "vitest";
import { generateAutomationBacklog } from "../../../../src/lib/ops-catalog/views/automation-backlog";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";

describe("generateAutomationBacklog", () => {
  it("returns deduplicated features with referencing activity ids", () => {
    const backlog = generateAutomationBacklog(buildInlineCatalog());

    // One entry per feature regardless of reference count.
    expect(backlog).toHaveLength(2);

    const dash = backlog.find((b) => b.id === fixtureIds.features.weatherDash);
    const cancel = backlog.find((b) => b.id === fixtureIds.features.cancellation);

    // weather_alert_dashboard is referenced only by rainout (hybrid). The
    // field_setup activity references it too but is automation_status=manual
    // and must be excluded.
    expect(dash?.referenced_by).toEqual([fixtureIds.activities.rainout]);

    // cancellation is referenced by rainout (hybrid) + post_game_report (platform).
    expect(cancel?.referenced_by).toEqual(
      [fixtureIds.activities.postGameReport, fixtureIds.activities.rainout].sort(),
    );
  });

  it("excludes manual-only activities from referencing", () => {
    const backlog = generateAutomationBacklog(buildInlineCatalog());
    const dash = backlog.find((b) => b.id === fixtureIds.features.weatherDash);

    // act.field_setup is manual; even though it lists weather_alert_dashboard
    // in platform_features, it must NOT appear in referenced_by.
    expect(dash?.referenced_by).not.toContain(fixtureIds.activities.fieldSetup);
  });

  it("sorts by reference count descending", () => {
    const backlog = generateAutomationBacklog(buildInlineCatalog());
    const counts = backlog.map((b) => b.referenced_by.length);
    const sortedDesc = [...counts].sort((a, b) => b - a);
    expect(counts).toEqual(sortedDesc);
    // First entry has more refs than the last.
    expect(backlog[0].referenced_by.length).toBeGreaterThanOrEqual(
      backlog[backlog.length - 1].referenced_by.length,
    );
  });
});

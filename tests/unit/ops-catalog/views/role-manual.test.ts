import { describe, it, expect } from "vitest";
import {
  renderRoleManual,
  generateAllRoleManuals,
} from "../../../../src/lib/ops-catalog/views/role-manual";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";

describe("renderRoleManual", () => {
  it("includes activities where role is accountable or responsible", () => {
    const md = renderRoleManual(buildInlineCatalog(), fixtureIds.roles.venueManager);

    // Header is the role name.
    expect(md).toMatch(/^# Venue Manager/m);
    // Venue manager is accountable on rainout + field setup.
    expect(md).toContain(`(\`${fixtureIds.activities.rainout}\`)`);
    expect(md).toContain(`(\`${fixtureIds.activities.fieldSetup}\`)`);
    // Activity heading marks role's involvement.
    expect(md).toMatch(/Rainout decision.*Accountable/);
    // Per-activity context bullets present.
    expect(md).toMatch(/Trigger:/);
    expect(md).toMatch(/Expected completion:/);
    expect(md).toMatch(/Tracking:/);
    expect(md).toMatch(/Escalation:/);
  });

  it("excludes activities where role is uninvolved", () => {
    // Parent is informed only on rainout + post_game_report, not accountable
    // or responsible anywhere -> manual should be empty of activities.
    const md = renderRoleManual(buildInlineCatalog(), fixtureIds.roles.parent);

    expect(md).toMatch(/^# Parent/m);
    expect(md).not.toContain(`(\`${fixtureIds.activities.rainout}\`)`);
    expect(md).not.toContain(`(\`${fixtureIds.activities.fieldSetup}\`)`);
    expect(md).not.toContain(`(\`${fixtureIds.activities.postGameReport}\`)`);
  });

  it("throws on unknown roleId", () => {
    expect(() =>
      renderRoleManual(buildInlineCatalog(), "role.does_not_exist"),
    ).toThrow();
  });
});

describe("generateAllRoleManuals", () => {
  it("returns one manual per worker role and excludes customer/system", () => {
    const all = generateAllRoleManuals(buildInlineCatalog());

    expect(Object.keys(all).sort()).toEqual([
      fixtureIds.roles.coach,
      fixtureIds.roles.venueManager,
    ].sort());
    expect(all[fixtureIds.roles.parent]).toBeUndefined();
  });
});

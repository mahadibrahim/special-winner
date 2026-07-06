import { describe, it, expect } from "vitest";
import {
  renderRoleManual,
  generateAllRoleManuals,
  involvementOf,
  PHASE_ORDER,
} from "../../../../src/lib/ops-catalog/views/role-manual";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";
import type { Role } from "../../../../src/lib/ops-catalog/types/role";

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

  it("skips hand_authored worker roles so catalog:render never clobbers their manuals", () => {
    const catalog = buildInlineCatalog();
    const handAuthored: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role whose manual is written by hand.",
      manual_target: "hand_authored",
    };
    const all = generateAllRoleManuals({
      ...catalog,
      roles: [...catalog.roles, handAuthored],
    });

    expect(all["role.team_captain"]).toBeUndefined();
    expect(Object.keys(all).sort()).toEqual(
      [fixtureIds.roles.coach, fixtureIds.roles.venueManager].sort(),
    );
  });
});

describe("shared exports for the training-deck view", () => {
  it("exports PHASE_ORDER starting with pre_day and ending with post_day", () => {
    expect(PHASE_ORDER[0]).toBe("pre_day");
    expect(PHASE_ORDER[PHASE_ORDER.length - 1]).toBe("post_day");
  });

  it("exports involvementOf with the same matching semantics used internally", () => {
    const catalog = buildInlineCatalog();
    const rainout = catalog.activities.find((a) => a.id === fixtureIds.activities.rainout)!;
    expect(involvementOf(rainout, fixtureIds.roles.venueManager)).toBe(
      "Accountable | Responsible",
    );
    expect(involvementOf(rainout, fixtureIds.roles.parent)).toBeNull();
  });
});

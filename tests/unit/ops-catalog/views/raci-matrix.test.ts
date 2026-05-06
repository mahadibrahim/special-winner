import { describe, it, expect } from "vitest";
import { renderRaciMatrix } from "../../../../scripts/ops-catalog/views/raci-matrix";
import { buildInlineCatalog, fixtureIds } from "../fixtures/inline-catalog";

describe("renderRaciMatrix", () => {
  it("header row contains activity_id, phase, and all role ids sorted alphabetically", () => {
    const csv = renderRaciMatrix(buildInlineCatalog());
    const [header] = csv.split("\n");

    const expectedRoles = [
      fixtureIds.roles.coach,
      fixtureIds.roles.parent,
      fixtureIds.roles.venueManager,
    ].sort();
    expect(header).toBe(`activity_id,phase,${expectedRoles.join(",")}`);
  });

  it("cell contents reflect RACI assignments correctly", () => {
    const csv = renderRaciMatrix(buildInlineCatalog());
    const lines = csv.split("\n");
    const header = lines[0].split(",");
    const venueIdx = header.indexOf(fixtureIds.roles.venueManager);
    const coachIdx = header.indexOf(fixtureIds.roles.coach);
    const parentIdx = header.indexOf(fixtureIds.roles.parent);

    const rainoutRow = lines.find((l) => l.startsWith(`${fixtureIds.activities.rainout},`));
    expect(rainoutRow).toBeDefined();
    const cells = rainoutRow!.split(",");

    expect(cells[1]).toBe("pre_game");
    // venue_manager is accountable AND in responsible -> A wins.
    expect(cells[venueIdx]).toBe("A");
    // coach is informed only.
    expect(cells[coachIdx]).toBe("I");
    // parent is informed only.
    expect(cells[parentIdx]).toBe("I");

    const setupRow = lines.find((l) => l.startsWith(`${fixtureIds.activities.fieldSetup},`));
    expect(setupRow).toBeDefined();
    const setupCells = setupRow!.split(",");
    // Coach is responsible on field_setup -> R.
    expect(setupCells[coachIdx]).toBe("R");
    // Parent is uninvolved -> empty.
    expect(setupCells[parentIdx]).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { deriveEquipment } from "@/lib/sessions/equipment";

describe("deriveEquipment", () => {
  it("unions plan + activity equipment, plan first, insertion-ordered", () => {
    expect(
      deriveEquipment(["Cones", "Pinnies"], [["Balls", "Cones"], null, ["Goals"]]),
    ).toEqual(["Cones", "Pinnies", "Balls", "Goals"]);
  });

  it("dedupes case-insensitively, keeping first casing", () => {
    expect(deriveEquipment(["cones"], [["Cones", "CONES", "Balls"]])).toEqual([
      "cones",
      "Balls",
    ]);
  });

  it("handles null/empty everything", () => {
    expect(deriveEquipment(null, [])).toEqual([]);
  });
});

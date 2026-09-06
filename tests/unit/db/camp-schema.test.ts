import { describe, it, expect } from "vitest";
import {
  dropInSessionKindEnum,
  dropInPaymentMethodEnum,
  dropInSessions,
} from "@/lib/db/schema/drop-in";
import { seasons } from "@/lib/db/schema/programs";

describe("camp schema (Phase 4 Task 1)", () => {
  it("dropInSessionKindEnum includes 'camp'", () => {
    expect(dropInSessionKindEnum.enumValues).toContain("camp");
  });

  it("dropInPaymentMethodEnum includes 'registration'", () => {
    expect(dropInPaymentMethodEnum.enumValues).toContain("registration");
  });

  it("dropInSessions exports campSeasonId", () => {
    expect(dropInSessions.campSeasonId).toBeDefined();
  });

  it("seasons table exports formationStrategy", () => {
    expect(seasons.formationStrategy).toBeDefined();
  });
});

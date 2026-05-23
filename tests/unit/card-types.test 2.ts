import { describe, it, expect } from "vitest";
import { CARD_TYPES, type CardType } from "@/lib/dashboard/card-types";

describe("CARD_TYPES", () => {
  const types: CardType[] = ["league_game", "tournament", "pickup", "class", "field_rental"];
  it("defines every card type with a complete config", () => {
    for (const t of types) {
      const c = CARD_TYPES[t];
      expect(c.icon).toBeTruthy();
      expect(c.eyebrow.length).toBeGreaterThan(0);
      for (const k of ["tile", "edge", "tint", "accentText", "accentBorder"] as const) {
        expect(typeof c[k]).toBe("string");
        expect(c[k].length).toBeGreaterThan(0);
      }
    }
  });
  it("maps tournament onto the league-game hue but its own eyebrow", () => {
    expect(CARD_TYPES.tournament.edge).toBe(CARD_TYPES.league_game.edge);
    expect(CARD_TYPES.tournament.eyebrow).toBe("Tournament");
  });
});

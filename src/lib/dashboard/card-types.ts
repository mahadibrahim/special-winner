import { Trophy, Users, GraduationCap, Flag, type LucideIcon } from "lucide-react";

/** The kinds of event/membership a dashboard card can represent. */
export type CardType = "league_game" | "tournament" | "pickup" | "class" | "field_rental";

export interface CardTypeConfig {
  icon: LucideIcon;
  /** Eyebrow label rendered above the card title. */
  eyebrow: string;
  /** Solid icon-tile classes (background + icon color). */
  tile: string;
  /** 4px left-edge border color class. */
  edge: string;
  /** Faint type-tint card background class. */
  tint: string;
  /** Accent text color (eyebrow, type-toned figures). */
  accentText: string;
  /** Accent border color (Directions chip). */
  accentBorder: string;
}

const GAME_HUE = {
  tile: "bg-primary text-cream",
  edge: "border-l-primary",
  tint: "bg-primary/[0.06]",
  accentText: "text-primary",
  accentBorder: "border-primary/45",
} as const;

export const CARD_TYPES: Record<CardType, CardTypeConfig> = {
  league_game: { icon: Trophy, eyebrow: "League game", ...GAME_HUE },
  tournament:  { icon: Trophy, eyebrow: "Tournament", ...GAME_HUE },
  pickup: {
    icon: Users, eyebrow: "Pickup game",
    tile: "bg-navy text-cream", edge: "border-l-navy",
    tint: "bg-navy/[0.06]", accentText: "text-navy", accentBorder: "border-navy/45",
  },
  class: {
    icon: GraduationCap, eyebrow: "Class / clinic",
    tile: "bg-ochre text-cream", edge: "border-l-ochre",
    tint: "bg-ochre/[0.08]", accentText: "text-ochre", accentBorder: "border-ochre/45",
  },
  field_rental: {
    icon: Flag, eyebrow: "Field rental",
    tile: "bg-sage text-cream", edge: "border-l-sage",
    tint: "bg-sage/[0.08]", accentText: "text-sage", accentBorder: "border-sage/45",
  },
};

// Youth soccer division levels, as parent-facing copy.
//
// The level KEYS and LABELS are owned by division-filters.ts (YOUTH_LEVELS /
// DIVISION_LEVEL_LABEL) — that is the vocabulary the admin dropdowns and the
// database agree on. This file adds only the customer-facing description, so
// there is exactly one place a level can be added and one place it is
// explained.
//
// Deliberately NOT a strength ladder. The adult ladder ranks four tiers with
// ascending bars, which is right when everyone is choosing a competitive
// bracket for themselves. Youth is different: Competitive A and B are a
// competitive pair, while Developmental and Recreational are different tracks —
// not lower rungs. Rendering 4→1 bars here would tell a Recreational parent
// their kid is rated 1 out of 4. The codebase already learned this once: Bars
// grew a `flat` prop because open divisions rendering the ascending 4/4 ladder
// "reads as elite instead of open-to-everyone".
//
// COPY STATUS: these descriptions are authored, not owner-approved. They make
// no claim about format, roster size, season length, or price — only about who
// a division is for. Get the Director of Coaching to confirm the wording before
// the first youth season publishes.

import { YOUTH_LEVELS, DIVISION_LEVEL_LABEL } from "./division-filters";

export interface YouthLevel {
  /** Stored value, e.g. "competitive_a". Matches seasons.skill_level. */
  key: (typeof YOUTH_LEVELS)[number];
  /** Display name from the shared vocabulary, e.g. "Competitive A". */
  label: string;
  /** Who this division is for. No format or price claims. */
  description: string;
}

const DESCRIPTIONS: Record<(typeof YOUTH_LEVELS)[number], string> = {
  competitive_a:
    "For players with club or travel experience who want the strongest competition in their age group.",
  competitive_b:
    "For experienced players who want real competition without a year-round club commitment.",
  developmental:
    "For players still learning the game. Coaching focuses on skills and touches, with games to put them to use.",
  recreational:
    "For players who want to play for fun with friends. Everyone plays, every week.",
};

/** Ladder order is the shared vocabulary's order — competitive pair first,
 *  then the two tracks. */
export const YOUTH_SKILL_LEVELS: YouthLevel[] = YOUTH_LEVELS.map((key) => ({
  key,
  label: DIVISION_LEVEL_LABEL[key],
  description: DESCRIPTIONS[key],
}));

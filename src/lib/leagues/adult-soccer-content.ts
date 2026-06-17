// src/lib/leagues/adult-soccer-content.ts
// Evergreen copy for the Adult Soccer league pages.
// Source of truth: docs/sports/adult-soccer-leagues.md (the published League Guide).

export type SkillLevel = {
  key: "a" | "b" | "c" | "d";
  label: string;
  bars: 1 | 2 | 3 | 4;
  description: string;
};

export const SKILL_LEVELS: SkillLevel[] = [
  { key: "a", label: "Elite", bars: 4, description: "Highest level, very competitive. Played in college or at a premier level for most of your life." },
  { key: "b", label: "Competitive", bars: 3, description: "Moderately competitive. Played in high school or at a select / club level." },
  { key: "c", label: "Rec +", bars: 2, description: "Recreational with some soccer experience — you've played at some point in your life." },
  { key: "d", label: "Beginner", bars: 1, description: "Recreational, little or no experience — new to the game or just getting back into it." },
];

export const FORMAT_FACTS: string[] = [
  "7v7 on the field",
  "7-game season, no playoffs",
  "50 min per game, two halves",
  "Roster up to 14 (7 to play)",
  "Certified referees every match",
  "Walled-arena rules (no offside, the wall is in play)",
];

export type RuleSection = { title: string; items: string[] };

export const RULE_SECTIONS: RuleSection[] = [
  { title: "The game", items: [
    "7v7 including goalkeeper · two 24-min running-clock halves",
    "No offside · all restarts direct, taken within 5 sec",
    "No GK punts (punt = free kick at top of arc)",
    "Free substitution on the fly",
    "Three-line violation · play off the wall · ceiling restart",
  ]},
  { title: "Coed rules", items: [
    "Min. 2 female field players (1 to start); keeper gender-neutral",
    "Females may sub for males, not vice-versa",
    "Safety rule on driving the ball above the waist near a female player",
  ]},
  { title: "Conduct & safety", items: [
    "No slide tackling (GK exception in the box)",
    "Penalty box: yellow = 2 min, red = 5 min + 1-game suspension",
    "Zero tolerance — violent conduct = ejection",
    "Shin guards required · flat / turf shoes only, no cleats",
  ]},
  { title: "Roster & standings", items: [
    "Roster up to 14 (7 to play) · locks after game 3",
    "3 pts win / 1 draw / 0 loss · tiebreak: H2H → goal differential → fewest conceded",
    "Mercy rule: max 5-goal differential recorded",
    "$200 non-refundable deposit · paid in full by game 1",
  ]},
];

export type FaqEntry = { q: string; a: string };

export const FAQ: FaqEntry[] = [
  { q: "Don't have a team?", a: "Register solo in any D or Open division — we place free agents on balanced teams by skill and schedule." },
  { q: "How do I pay?", a: "A $200 non-refundable deposit holds your spot; the balance is due in full by game 1. Early-bird team pricing is $1,000 through the early-bird deadline." },
  { q: "Indoor vs outdoor?", a: "Indoor walled 7v7 — faster, no offside, and the wall keeps the ball in play. Games run rain or shine." },
  { q: "Roster size?", a: "Up to 14 on a roster, 7 on the field. Free substitution on the fly; the roster locks after game 3." },
];

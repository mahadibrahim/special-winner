// Owner-editable copy for the youth league pages (two-path composition).
// Every fact below is owner-directed (2026-08-18): the commitment numbers
// are Arena-copy placeholders the owner will tune — change them HERE only.
// Design: docs/superpowers/specs/2026-08-18-youth-leagues-two-path-design.md

/** "The commitment, up front." facts band. */
export const COMMITMENT_FACTS: { label: string; value: string; sub?: string }[] = [
  { label: "Games", value: "1 per week" },
  { label: "Practices", value: "None required" },
  { label: "Season", value: "6–10 games" },
  { label: "Game length", value: "45–50 minutes", sub: "varies by league" },
  { label: "Game days", value: "Sat & Sun, 7am–8pm" },
];

/** Copy shell around the live term facts in the top deadline banner. */
export const DEADLINE_BANNER = {
  /** Rendered before the live "closes <date>" fact. */
  urgency: "divisions fill fast",
  cta: "Claim your spot →",
};

/** "Bringing a whole team?" section. */
export const CLUB_TEAM_PROMISES = [
  "One team fee, split online — the captain reserves the spot, every family pays their own share.",
  "Your division's schedule is published before week 1.",
  "Games on Saturdays and Sundays only — no weeknight travel.",
];

export const CLUB_CARD = {
  heading: "Spots go fast. Claim yours.",
  body: "Tell us your age group and level and we'll place your team in the right division — or enter directly above.",
  enterCta: "Enter your team →",
  emailCta: "Email us about winter entry",
};

/** The two league-type cards (#types). Division rows render live under these. */
export const LEAGUE_TYPE_CARDS = {
  competitive: {
    kicker: "Winter · November – late March",
    heading: "Competitive — for club teams",
    body:
      "Competitive indoor play for club teams who want to keep their season going through the cold months. Enter your full team; the roster registers and pays online.",
    urgency: "● Claim your winter spot — divisions fill fast",
    facts: [
      { label: "For", value: "Established teams" },
      { label: "Play", value: "Sat & Sun" },
      { label: "Entry", value: "Team registration" },
    ],
    allLink: "All winter divisions ↓",
  },
  developmental: {
    kicker: "Spring, summer & fall",
    heading: "Developmental — for individual players",
    body:
      "Built for touches and guidance. Coaches talk players through the game while it is happening, and what they took from it matters more than the scoreline. Sign your kid up solo — we build balanced teams.",
    urgency: null as string | null,
    facts: [
      { label: "For", value: "Individual players" },
      { label: "Teams", value: "We build them" },
      { label: "Signup", value: "Per player" },
    ],
    allLink: "All open age groups ↓",
  },
};

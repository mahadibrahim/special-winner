// src/lib/leagues/adult-flag-football-content.ts
// Evergreen copy for the Adult 4v4 Flag Football league pages.
// Source of truth: docs/sports/adult-flag-football-leagues.md (the published League Guide).
import type { ValueProp, RuleSection, FaqEntry } from "@/lib/leagues/landing-content";

export const FORMAT_FACTS: string[] = [
  "4v4 — everyone's a receiver",
  "8-game season, no playoffs",
  "Two 20-min halves, running clock",
  "Roster 6–10 (4 to play)",
  "7-second pass clock",
  "Boarded indoor turf — bigger than NFL Blitz indoor spec",
];

export const RULE_SECTIONS: RuleSection[] = [
  { title: "The game", items: [
    "4v4 flag, no contact · two 20-min running-clock halves",
    "No QB runs — handoffs, pitches and laterals behind the line only",
    "7-second pass clock (play is dead if the ball isn't out)",
    "No diving, no jumping to avoid a flag pull · spinning allowed",
    "Flag pull = down · ball spotted at the flag",
  ]},
  { title: "Coed rules", items: [
    "At least 1 female player on the field at all times",
    "Females may sub for males, not vice-versa",
    "No gender restrictions on positions — anyone can play QB",
  ]},
  { title: "Conduct & safety", items: [
    "No contact: no blocking, no stripping, no flag guarding",
    "Zero tolerance — violent conduct = ejection",
    "Mouthguards recommended · flat / turf shoes only, no cleats",
    "Flags provided; shirts must be tucked (flags visible)",
  ]},
  { title: "Roster & standings", items: [
    "Roster 6–10 (4 to play) · locks after game 3",
    "3 pts win / 1 draw / 0 loss · tiebreak: H2H → point differential",
    "$200 non-refundable deposit · paid in full by game 1",
  ]},
];

export const FAQ: FaqEntry[] = [
  { q: "Don't have a team?", a: "Register solo — we place free agents on balanced teams by schedule. Individual spot is $105 for the 8-game season." },
  { q: "Why 4v4 instead of 6v6?", a: "Our boarded fields are sized for it — bigger than the official NFL Blitz indoor 4v4 spec. Four a side means every player runs a route on every play, and you get roughly double the touches of a 6v6 league." },
  { q: "How do I pay?", a: "A $200 non-refundable deposit holds your team's spot; the balance is due in full by game 1. Team registration is $795 with a 6–10 player roster." },
  { q: "What do I wear?", a: "Athletic wear and flat or turf shoes — no cleats. We provide the flags and game balls. Shirts tucked so flags stay visible." },
  { q: "When and where?", a: "Wednesday nights at our Worthington facility (535 Lakeview Plaza Blvd) on climate-controlled boarded turf. Winter 1 runs November into January; Winter 2 follows straight after." },
];

export const WHY_4V4: ValueProp[] = [
  { icon: "🏈", tint: "orange", title: "Everyone's a receiver", copy: "4v4 means every player runs a route on every snap — no linemen, no standing around." },
  { icon: "⚡", tint: "ochre", title: "More touches, faster games", copy: "A 7-second pass clock and short field keep the ball moving — roughly double the touches of a 6v6 league." },
  { icon: "🧱", tint: "sage", title: "The ball never dies", copy: "Fully boarded turf, bigger than NFL Blitz indoor spec. No chasing overthrows into a parking lot." },
  { icon: "☃︎", tint: "sage", title: "Winter-proof", copy: "Climate-controlled indoor turf. Games run on schedule all winter — never frozen out." },
  { icon: "🤝", tint: "orange", title: "No team? No problem", copy: "Sign up solo and we place free agents on balanced squads by schedule." },
  { icon: "🍻", tint: "ochre", title: "Stick around after", copy: "Half of league night happens off the field — food, drinks, and the people you'll keep playing with." },
];

// Season-one divisions (rendered on the Overview tab in place of soccer's skill ladder).
export const DIVISION_CALLOUTS: { title: string; copy: string }[] = [
  { title: "Men's 4v4", copy: "Open competitive division. Roster 6–10, everyone plays." },
  { title: "Coed 4v4", copy: "At least 1 female player on the field at all times; anyone can play QB. The social-but-real-football option." },
];

// Reference curriculum sequences — one per live sport/stage combo that has
// session-plan content (Phase 3 seed, so the sequencing feature isn't empty
// on ship). Entry order follows the pedagogical arc of the underlying
// session-plan content files; every `template` string must exactly match a
// SessionPlanContent.name of the same sport (validated by validateSequences
// and enforced at load time by the (sportId, name) template lookup).
//
// Deliberately NOT part of CURRICULUM_CONTENT/planUpserts — the loader's
// applySequences step (scripts/curriculum-load.ts) upserts these directly
// on the curriculum_sequences (sportId, name) natural key.

import type { CurriculumContent, SequenceContent } from "./types";

export const REFERENCE_SEQUENCES: SequenceContent[] = [
  {
    name: "Soccer Fundamentals — 6-Week League Block",
    sport: "soccer",
    stage: "fundamentals",
    programType: "league",
    description:
      "A six-week arc for ages 6–8: from first-day team building through ball mastery, dribbling, and first passing, ending with the pre-game routine before the season's first match.",
    entries: [
      {
        template: "First Day of Season - Getting Started Right",
        objectives: ["Learn every player's name", "Establish the fun-and-safe team culture"],
      },
      {
        template: "Ball Mastery Session - Individual Ball Control",
        objectives: ["Maximize individual touches", "Build comfort with the ball"],
      },
      {
        template: "Dribbling Adventures - Learning to Move with the Ball",
        objectives: ["Dribble with the ball close under light pressure"],
      },
      {
        template: "Ball Mastery Fun Session",
        objectives: ["Reinforce ball control through games"],
      },
      {
        template: "First Passing Session",
        objectives: ["Introduce inside-of-foot passing with a partner"],
      },
      {
        template: "Game Day Warmup - Pre-Game Routine",
        objectives: ["Rehearse the pre-game routine before the first match"],
        notes: "Schedule this the week of the first game.",
      },
    ],
  },
  {
    name: "Soccer Skill Building — 3-Week Technical Block",
    sport: "soccer",
    stage: "skill-building",
    programType: "league",
    description:
      "Three weeks for ages 9–10: receiving under pressure, attacking combinations, then defending principles.",
    entries: [
      {
        template: "Technical Skills: Receiving",
        objectives: ["Control with the first touch away from pressure"],
      },
      {
        template: "Attacking Combinations",
        objectives: ["Combine in pairs and threes to break lines"],
      },
      {
        template: "Defending Principles",
        objectives: ["Pressure, cover, and delay as a unit"],
      },
    ],
  },
  {
    name: "Soccer Development — 2-Week Tactical Block",
    sport: "soccer",
    stage: "development",
    programType: "league",
    description:
      "Two weeks for ages 11–12: building out from the back, then finishing.",
    entries: [
      {
        template: "Playing Out from the Back",
        objectives: ["Build attacks from the goalkeeper under pressure"],
      },
      {
        template: "Finishing Session",
        objectives: ["Finish from realistic game situations"],
      },
    ],
  },
  {
    name: "Basketball Fundamentals — 2-Week Intro Block",
    sport: "basketball",
    stage: "fundamentals",
    programType: "league",
    description:
      "Two weeks for ages 6–8: ball-handling basics through play, then shooting form.",
    entries: [
      {
        template: "Basketball Basics Fun",
        objectives: ["Build comfort dribbling and passing through games"],
      },
      {
        template: "Shooting Fundamentals",
        objectives: ["Learn basic shooting form with lots of successes"],
      },
    ],
  },
  {
    name: "Basketball Skill Building — 3-Week Block",
    sport: "basketball",
    stage: "skill-building",
    programType: "league",
    description:
      "Three weeks for ages 9–10: ball handling, team offense basics, then defense.",
    entries: [
      {
        template: "Ball Handling Development",
        objectives: ["Handle the ball with either hand under pressure"],
      },
      {
        template: "Team Offense Basics",
        objectives: ["Move without the ball; catch and face"],
      },
      {
        template: "Defense Development",
        objectives: ["Defensive stance, slides, and help positioning"],
      },
    ],
  },
  {
    name: "Basketball Development — 2-Week Block",
    sport: "basketball",
    stage: "development",
    programType: "league",
    description:
      "Two weeks for ages 11–12: transition offense, then advanced shooting.",
    entries: [
      {
        template: "Transition Offense",
        objectives: ["Convert stops into fast-break chances"],
      },
      {
        template: "Advanced Shooting",
        objectives: ["Shoot off the move and off the dribble"],
      },
    ],
  },
  {
    name: "Hockey Fundamentals — 4-Week Cross-Ice Block",
    sport: "hockey",
    stage: "fundamentals",
    programType: "league",
    description:
      "Four cross-ice weeks for ages 6–8: skating comfort, puck control, passing and support, then small-area games that put it all together.",
    entries: [
      {
        template: "First Skate Comfort - Cross-Ice Confidence Day",
        objectives: ["Build skating confidence and falling-safely habits"],
      },
      {
        template: "Puck Control Stations - Building Comfort with the Puck",
        objectives: ["Maximize puck touches at stations"],
      },
      {
        template: "Passing & Support - Moving the Puck as a Team",
        objectives: ["Pass and move to support the puck carrier"],
      },
      {
        template: "Small-Area Games Day - Everything Together",
        objectives: ["Apply skating, puck control, and passing in games"],
      },
    ],
  },
];

/**
 * Validates the reference sequences against the content registry. Returns
 * human-readable violation messages; empty means valid. Mirrors the style of
 * validateRegistry in ./index.ts.
 */
export function validateSequences(
  content: CurriculumContent,
  sequences: SequenceContent[],
): string[] {
  const violations: string[] = [];
  const stageSlugs = new Set(content.stages.map((s) => s.slug));
  const planNamesBySport = new Map<string, Set<string>>();
  for (const plan of content.sessionPlans) {
    if (!planNamesBySport.has(plan.sport)) {
      planNamesBySport.set(plan.sport, new Set());
    }
    planNamesBySport.get(plan.sport)!.add(plan.name);
  }

  const keySeen = new Set<string>();
  for (const seq of sequences) {
    const key = `${seq.sport}::${seq.name}`;
    if (keySeen.has(key)) {
      violations.push(`Duplicate sequence name "${seq.name}" for sport "${seq.sport}"`);
    }
    keySeen.add(key);

    if (!planNamesBySport.has(seq.sport)) {
      violations.push(
        `Sequence "${seq.name}" references sport "${seq.sport}" with no session plans`,
      );
    }
    if (!stageSlugs.has(seq.stage)) {
      violations.push(`Sequence "${seq.name}" references unknown stage "${seq.stage}"`);
    }
    if (seq.entries.length === 0) {
      violations.push(`Sequence "${seq.name}" has no entries`);
    }
    const sportPlans = planNamesBySport.get(seq.sport) ?? new Set<string>();
    for (const entry of seq.entries) {
      if (!sportPlans.has(entry.template)) {
        violations.push(
          `Sequence "${seq.name}" entry references unknown template "${entry.template}" (sport ${seq.sport})`,
        );
      }
    }
  }
  return violations;
}

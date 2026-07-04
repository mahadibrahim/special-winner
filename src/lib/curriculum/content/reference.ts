// Reference data: skill domains and development stages.
//
// Transcribed verbatim (names, slugs, weights, age ranges) from the
// gen-0 source of truth: `src/lib/db/seed-curriculum.ts`. Stage slugs are
// kept exactly as that file creates them — the coach UI may reference them.

import type { DomainContent, StageContent } from "./types";

export const DOMAINS: DomainContent[] = [
  {
    name: "technical",
    displayName: "Technical",
    description:
      "Sport-specific techniques and motor skills. The physical execution of movements required for the sport.",
    weightInOverall: "0.30",
    sortOrder: 1,
  },
  {
    name: "tactical",
    displayName: "Tactical",
    description:
      "Decision-making, game understanding, and strategic awareness. Reading the game and making good choices.",
    weightInOverall: "0.25",
    sortOrder: 2,
  },
  {
    name: "physical",
    displayName: "Physical",
    description:
      "Athletic abilities: speed, agility, strength, endurance, coordination, and flexibility.",
    weightInOverall: "0.25",
    sortOrder: 3,
  },
  {
    name: "psychological",
    displayName: "Psychological",
    description:
      "Mental skills: confidence, focus, resilience, coachability, teamwork, and competitive mindset.",
    weightInOverall: "0.20",
    sortOrder: 4,
  },
];

export const STAGES: StageContent[] = [
  {
    slug: "discovery",
    name: "Discovery",
    ageMin: 3,
    ageMax: 5,
    description:
      "Introduction to sports through play. Focus on joy, movement, and social interaction.",
    sortOrder: 1,
  },
  {
    slug: "fundamentals",
    name: "Fundamentals",
    ageMin: 6,
    ageMax: 8,
    description:
      "Build basic movement literacy and sport-specific fundamentals through games and activities.",
    sortOrder: 2,
  },
  {
    slug: "skill-building",
    name: "Skill Building",
    ageMin: 9,
    ageMax: 10,
    description:
      "Refine fundamental skills and introduce tactical awareness through guided discovery.",
    sortOrder: 3,
  },
  {
    slug: "development",
    name: "Development",
    ageMin: 11,
    ageMax: 12,
    description:
      "Develop sport-specific skills and tactical understanding. Introduction to competition.",
    sortOrder: 4,
  },
  {
    slug: "competitive",
    name: "Competitive",
    ageMin: 13,
    ageMax: 15,
    description:
      "Event/position specialization begins. Focus on performance with continued development.",
    sortOrder: 5,
  },
  {
    slug: "refinement",
    name: "Refinement",
    ageMin: 16,
    ageMax: 18,
    description: "Elite performance focus. Athletes fully committed to their sport.",
    sortOrder: 6,
  },
];

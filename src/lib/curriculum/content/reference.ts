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
    color: "#3b82f6",
    icon: "target",
    assessmentFrequency: "monthly",
    weightInOverall: "0.30",
    sortOrder: 1,
  },
  {
    name: "tactical",
    displayName: "Tactical",
    description:
      "Decision-making, game understanding, and strategic awareness. Reading the game and making good choices.",
    color: "#8b5cf6",
    icon: "brain",
    assessmentFrequency: "monthly",
    weightInOverall: "0.25",
    sortOrder: 2,
  },
  {
    name: "physical",
    displayName: "Physical",
    description:
      "Athletic abilities: speed, agility, strength, endurance, coordination, and flexibility.",
    color: "#22c55e",
    icon: "zap",
    assessmentFrequency: "per_season",
    weightInOverall: "0.25",
    sortOrder: 3,
  },
  {
    name: "psychological",
    displayName: "Psychological",
    description:
      "Mental skills: confidence, focus, resilience, coachability, teamwork, and competitive mindset.",
    color: "#f59e0b",
    icon: "heart",
    assessmentFrequency: "per_season",
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
    philosophy:
      "Let children explore. Every child should touch equipment, move freely, and experience success. No formal instruction—just guided play.",
    practiceToGameRatio: "N/A",
    maxHoursPerWeek: 2,
    keyPrinciples: [
      "Fun is the #1 priority",
      "Free exploration over instruction",
      "Maximum participation time",
      "No competition or scores",
      "Celebrate all effort",
    ],
    coachRole: "Facilitator - Create safe, fun environment for exploration",
    sortOrder: 1,
  },
  {
    slug: "fundamentals",
    name: "Fundamentals",
    ageMin: 6,
    ageMax: 8,
    description:
      "Build basic movement literacy and sport-specific fundamentals through games and activities.",
    philosophy:
      "Technique through play. Use small-sided games and activities that naturally develop skills. Avoid lines and lectures.",
    practiceToGameRatio: "3:1",
    maxHoursPerWeek: 4,
    keyPrinciples: [
      "Games over drills",
      "All players touch equipment constantly",
      "Focus on ABCs: Agility, Balance, Coordination, Speed",
      "Multi-sport participation strongly encouraged",
      "Equal playing time for all",
      "Celebrate improvement, not results",
    ],
    coachRole: "Teacher - Demonstrate, encourage, ask questions instead of lecturing",
    sortOrder: 2,
  },
  {
    slug: "skill-building",
    name: "Skill Building",
    ageMin: 9,
    ageMax: 10,
    description:
      "Refine fundamental skills and introduce tactical awareness through guided discovery.",
    philosophy:
      "Technique before tactics. Perfect fundamental skills before adding complexity. Use questions to develop decision-making.",
    practiceToGameRatio: "2:1",
    maxHoursPerWeek: 6,
    keyPrinciples: [
      "Skill refinement through repetition in game-like contexts",
      "Introduction to basic tactics",
      "Question-based coaching (What did you see? What could you try?)",
      "Position rotation - everyone plays everywhere",
      "Multi-sport participation still encouraged",
      "Small-sided games remain primary learning tool",
    ],
    coachRole:
      "Developer - Guide skill refinement, introduce tactical concepts through questions",
    sortOrder: 3,
  },
  {
    slug: "development",
    name: "Development",
    ageMin: 11,
    ageMax: 12,
    description:
      "Develop sport-specific skills and tactical understanding. Introduction to competition.",
    philosophy:
      "Apply skills in competitive contexts. Develop game intelligence through decision-making practice. Balance winning with development.",
    practiceToGameRatio: "2:1",
    maxHoursPerWeek: 8,
    keyPrinciples: [
      "Skill application under pressure",
      "Tactical development through game situations",
      "Introduction to position-specific training",
      "Competition as learning tool, not end goal",
      "Growth spurts require training adjustments",
      "Mental skills introduction",
    ],
    coachRole:
      "Coach - Balance skill development with competitive preparation, manage growth spurt challenges",
    sortOrder: 4,
  },
  {
    slug: "competitive",
    name: "Competitive",
    ageMin: 13,
    ageMax: 15,
    description:
      "Event/position specialization begins. Focus on performance with continued development.",
    philosophy:
      "Performance through mastery. Athletes begin to specialize while maintaining broad athletic development. Competition becomes more central.",
    practiceToGameRatio: "2:1",
    maxHoursPerWeek: 12,
    keyPrinciples: [
      "Position/event specialization begins",
      "Advanced tactical training",
      "Physical preparation becomes structured",
      "Mental training integral",
      "Competition preparation",
      "Player ownership of development",
    ],
    coachRole:
      "Performance Coach - Prepare athletes for competition while continuing development",
    sortOrder: 5,
  },
  {
    slug: "refinement",
    name: "Refinement",
    ageMin: 16,
    ageMax: 18,
    description: "Elite performance focus. Athletes fully committed to their sport.",
    philosophy:
      "Excellence through specialization. Athletes pursue peak performance with structured, periodized training.",
    practiceToGameRatio: "2:1",
    maxHoursPerWeek: 16,
    keyPrinciples: [
      "Full specialization",
      "Periodized training",
      "Elite competition",
      "Individual development plans",
      "Recovery and regeneration focus",
      "Career pathway planning",
    ],
    coachRole: "Elite Coach - Manage individual development toward peak performance",
    sortOrder: 6,
  },
];

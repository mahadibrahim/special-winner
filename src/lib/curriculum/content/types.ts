// Content-as-code types for the curriculum registry.
//
// Every content item is keyed by a human-readable slug (never a uuid) so
// this module can be authored and reviewed as plain TypeScript. Loaders
// (Task 8) resolve slugs -> database uuids at load time via the natural-key
// unique indexes added in Task 1.

export type DomainName =
  | "technical"
  | "tactical"
  | "physical"
  | "psychological";

export interface DomainContent {
  name: DomainName;
  displayName: string;
  description: string;
  color?: string; // hex color, e.g. "#3b82f6"
  icon?: string; // icon name, e.g. "target"
  assessmentFrequency?: string; // e.g. "monthly", "per_season", "weekly"
  weightInOverall: string; // decimal as string, e.g. "0.25"
  sortOrder: number;
}

export interface StageContent {
  slug: string;
  name: string;
  ageMin: number;
  ageMax: number;
  description: string;
  philosophy?: string; // guiding philosophy for the stage
  practiceToGameRatio?: string; // e.g. "3:1", "2:1", "N/A"
  maxHoursPerWeek?: number;
  keyPrinciples?: string[];
  coachRole?: string; // description of coach's role
  sortOrder: number;
}

export interface SkillContent {
  slug: string;
  name: string;
  sport: string; // sport slug: "soccer" | "basketball" | "hockey" | "baseball"
  domain: DomainName;
  stage: string; // StageContent.slug
  description?: string;
  introductionAge?: number;
  assessmentMethod?: "observation" | "test" | "game" | "self_report";
  progressionLevels?: { 1: string; 2: string; 3: string; 4: string; 5: string };
  observableBehaviors?: string[];
  commonMistakes?: string[];
  coachingTips?: string[];
  tags?: string[];
  comprehensiveGuide?: unknown; // matches skills.comprehensiveGuide $type; copy verbatim from source
  isCore?: boolean;
  sortOrder?: number;
}

export interface ActivityContent {
  slug: string;
  name: string;
  description?: string; // matches activities.description column
  sport: string;
  activityType: string; // matches activityTypeEnum values in practice-planning.ts
  difficulty: "beginner" | "intermediate" | "advanced";
  minPlayers: number;
  maxPlayers?: number;
  durationMinutes: number;
  skillsDeveloped?: string[]; // SKILL SLUGS — loader resolves to uuids
  setupInstructions?: string;
  howToPlay: string;
  diagram?: string; // ASCII-art setup diagram; matches activities.diagram column (some v2 activities only)
  coachingPoints?: string[];
  questionsToAsk?: string[];
  commonMistakes?: string[];
  variations?: { name: string; description: string; difficulty: string }[];
  makeEasier?: string;
  makeHarder?: string;
  equipmentNeeded?: string[];
  spaceRequired?: string;
  indoorSuitable?: boolean;
  appropriateStages?: string[]; // STAGE SLUGS — loader resolves
  tags?: string[];
  featured?: boolean; // matches activities.featured column
  comprehensiveGuide?: unknown; // matches activities.comprehensiveGuide $type
}

export interface SessionPlanContent {
  name: string;
  sport: string;
  stage?: string;
  durationMinutes: number;
  structure: {
    name: string;
    type: string;
    durationMinutes: number;
    description?: string;
    activitySuggestions?: string[];
    coachingScript?: string;
  }[];
  description?: string; // matches practiceTemplates.description column
  equipmentNeeded?: string[]; // matches practiceTemplates.equipmentNeeded column
  isDefault?: boolean; // matches practiceTemplates.isDefault column
  coachingNotes?: string;
}

export interface CoachGuidanceContent {
  prompts: Record<string, unknown>[]; // rows shaped for coachPrompts insert (minus ids/org)
  resources: Record<string, unknown>[];
  principles: Record<string, unknown>[];
}

export interface CurriculumContent {
  domains: DomainContent[];
  stages: StageContent[];
  skills: SkillContent[];
  activities: ActivityContent[];
  sessionPlans: SessionPlanContent[];
  coachGuidance: CoachGuidanceContent;
}

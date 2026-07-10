// Glows & Grows reinforcement language.
//
// Pure, DB-free content module: curated praise ("glow") and growth-language
// ("grow") phrases coaches tap after a session. Parents see these verbatim
// on the family dashboard, so every phrase here is written for a parent
// reading it about their own kid -- specific, warm, and never clinical.
//
// See docs/superpowers/specs/2026-07-09-glows-and-grows-design.md for the
// product design this backs.
//
// Hockey and baseball skill coverage lands in a follow-up task; until then
// getSkillGlow/getSkillGrow return null for those sports' slugs and
// getSessionChips falls back to the universal glows.

/**
 * ~8 sport-agnostic praise chips, always available regardless of which
 * skills a session focused on. Used as the fallback when a session has no
 * (or too few) skill-specific glows, and always appended after skill
 * glows in getSessionChips.
 */
export const UNIVERSAL_GLOWS: string[] = [
  "Great effort today",
  "Kind teammate",
  "Brave and tried new things",
  "Great listening",
  "Never gave up",
  "Helped a teammate",
  "Positive attitude",
  "Super focused",
];

interface SkillReinforcement {
  glow: string;
  grow: string;
}

// Curated per-skill praise + growth language. Keyed by skill slug (natural
// key shared with CURRICULUM_CONTENT.skills). "coachability" is authored
// once and shared across sports since both soccer and basketball define an
// identically-scoped skill under that slug.
const SKILL_REINFORCEMENT: Record<string, SkillReinforcement> = {
  // ---- Soccer ----
  "ball-control": {
    glow: "Kept the ball glued to their feet",
    grow: "Working on keeping the ball closer while moving",
  },
  "passing-short": {
    glow: "Passes right to a teammate's feet",
    grow: "Working on pointing their foot at the target",
  },
  "receiving-first-touch": {
    glow: "Soft, controlled first touch",
    grow: "Working on touching the ball forward, not under their feet",
  },
  dribbling: {
    glow: "Confident dribbling under pressure",
    grow: "Working on looking up while dribbling",
  },
  shooting: {
    glow: "Picked a spot and struck it well",
    grow: "Working on looking up before shooting",
  },
  "finding-space": {
    glow: "Found open space all session",
    grow: "Working on moving to space right after passing",
  },
  "support-play": {
    glow: "Always gave a passing option",
    grow: "Working on moving again after every pass",
  },
  "1v1-defending": {
    glow: "Patient, tough one-on-one defender",
    grow: "Working on staying patient instead of diving in",
  },
  "agility-coordination": {
    glow: "Quick feet and great balance",
    grow: "Working on staying low when changing direction",
  },
  speed: {
    glow: "Explosive burst of speed",
    grow: "Working on driving their arms when sprinting",
  },
  confidence: {
    glow: "Brave and confident on the ball",
    grow: "Working on trying new moves without hesitating",
  },
  resilience: {
    glow: "Bounced back after every mistake",
    grow: "Working on staying positive after a tough moment",
  },
  teamwork: {
    glow: "Great teammate all session",
    grow: "Working on cheering for teammates more",
  },
  "ball-mastery-toe-taps": {
    glow: "Smooth, steady toe taps",
    grow: "Working on tapping the ball while looking up",
  },
  "dribbling-with-inside-outside": {
    glow: "Smooth touches with both sides of the foot",
    grow: "Working on using their weaker foot more",
  },
  "agility-change-of-direction": {
    glow: "Changed direction in a flash",
    grow: "Working on bending their knees before turning",
  },
  coachability: {
    glow: "Listened and tried every tip",
    grow: "Working on trying a new tip right away",
  },
  "1v1-dribbling-moves": {
    glow: "Beat a defender with a slick move",
    grow: "Working on trying a different move each time",
  },
  "turning-with-ball": {
    glow: "Turned away from pressure smoothly",
    grow: "Working on keeping their head up after turning",
  },
  "when-to-dribble-vs-pass": {
    glow: "Made a smart read with the ball",
    grow: "Working on scanning before the ball arrives",
  },
  "long-passing": {
    glow: "Struck a great long ball",
    grow: "Working on planting their foot toward the target",
  },
  "heading-defensive": {
    glow: "Attacked the header with courage",
    grow: "Working on timing their jump to meet the ball",
  },
  "positional-awareness": {
    glow: "Stayed in great position all game",
    grow: "Working on getting back to position quickly",
  },
  "dribbling-with-speed": {
    glow: "Flew past defenders with the ball",
    grow: "Working on keeping their head up at full speed",
  },
  "creating-passing-angles": {
    glow: "Always gave a clear passing lane",
    grow: "Working on adjusting position as defenders move",
  },
  "enjoyment-of-play": {
    glow: "Big smile the whole session",
    grow: "Working on jumping into every activity",
  },

  // ---- Basketball ----
  "ball-handling": {
    glow: "Great control dribbling with both hands",
    grow: "Working on keeping their dribble lower",
  },
  "passing-basketball": {
    glow: "Sharp, accurate passes all game",
    grow: "Working on stepping toward the target when passing",
  },
  "two-hand-chest-pass": {
    glow: "Crisp two-hand chest passes",
    grow: "Working on snapping their wrists on the follow-through",
  },
  "catching-basketball": {
    glow: "Soft hands on every catch",
    grow: "Working on watching the ball into their hands",
  },
  "two-hand-bounce-pass": {
    glow: "Perfectly timed bounce pass",
    grow: "Working on bouncing the pass closer to their partner",
  },
  "form-shooting": {
    glow: "Textbook shooting form",
    grow: "Working on following all the way through",
  },
  "shooting-layups": {
    glow: "Smooth finish at the rim",
    grow: "Working on using the correct footwork on layups",
  },
  "layups-dominant-hand": {
    glow: "Confident finish with the strong hand",
    grow: "Working on jumping off the correct foot",
  },
  "shooting-jump-shot": {
    glow: "Beautiful arc on that jump shot",
    grow: "Working on keeping their elbow under the ball",
  },
  "dribbling-on-the-move": {
    glow: "Kept control while sprinting",
    grow: "Working on keeping their head up while dribbling",
  },
  "layups-weak-hand": {
    glow: "Brave attacking with the weak hand",
    grow: "Working on finishing layups with the off hand",
  },
  "pull-up-jump-shot": {
    glow: "Balanced stop and pop off the dribble",
    grow: "Working on staying balanced through the stop",
  },
  "crossover-dribble": {
    glow: "Quick, low crossover move",
    grow: "Working on keeping the crossover lower",
  },
  "court-spacing": {
    glow: "Great spacing on offense",
    grow: "Working on filling open spots on the floor",
  },
  "help-defense": {
    glow: "Always ready to help a teammate",
    grow: "Working on recovering to their own player after helping",
  },
  "transition-play": {
    glow: "Sprinted hard in transition",
    grow: "Working on getting back on defense faster",
  },
  "give-and-go": {
    glow: "Cut to the basket after passing",
    grow: "Working on cutting immediately after every pass",
  },
  "pick-and-roll-ball-handler": {
    glow: "Great patience using the screen",
    grow: "Working on reading the defense off the screen",
  },
  "athletic-stance": {
    glow: "Always in a strong, ready stance",
    grow: "Working on keeping their weight forward on their toes",
  },
  "agility-footwork": {
    glow: "Quick feet on defense",
    grow: "Working on staying low on defense",
  },
  "vertical-jump": {
    glow: "Explosive jump for the rebound",
    grow: "Working on using their arms to jump higher",
  },
  coordination: {
    glow: "Moved with great control and balance",
    grow: "Working on catching the ball with both hands",
  },
  "confidence-basketball": {
    glow: "Fearless taking on new challenges",
    grow: "Working on trying again right after a miss",
  },
  "effort-and-hustle": {
    glow: "Nonstop hustle all session",
    grow: "Working on sprinting back on every possession",
  },
  "team-communication": {
    glow: "Loud, positive communication",
    grow: "Working on calling out screens and switches",
  },
};

/** Curated praise phrase for a skill slug, or null if not yet authored. */
export function getSkillGlow(slug: string): string | null {
  return SKILL_REINFORCEMENT[slug]?.glow ?? null;
}

/** Curated "Working on ..." growth phrase for a skill slug, or null. */
export function getSkillGrow(slug: string): string | null {
  return SKILL_REINFORCEMENT[slug]?.grow ?? null;
}

export interface SessionChipsInput {
  /** Skill slugs the session's segments/activities were built around. */
  skillSlugs: string[];
}

export interface SessionChips {
  glows: string[];
  grows: string[];
}

const MAX_SKILL_GLOWS = 4;
const MAX_GROWS = 3;

/**
 * Resolves a session's focus skills into the glow/grow chip sets a coach
 * picks from on the capture screen. Pure and DB-free: the caller (the
 * bootstrap endpoint) resolves session segments -> activities ->
 * skillsDeveloped slugs before calling this.
 *
 * - Skill glows: deduped, in first-seen order, capped at MAX_SKILL_GLOWS.
 * - Universal glows are always appended after the skill glows.
 * - Grows: deduped, in first-seen order, capped at MAX_GROWS. Unlike
 *   glows there is no universal fallback -- grows are always specific.
 */
export function getSessionChips(input: SessionChipsInput): SessionChips {
  const skillGlows: string[] = [];
  const grows: string[] = [];

  for (const slug of input.skillSlugs) {
    if (skillGlows.length < MAX_SKILL_GLOWS) {
      const glow = getSkillGlow(slug);
      if (glow && !skillGlows.includes(glow)) {
        skillGlows.push(glow);
      }
    }

    if (grows.length < MAX_GROWS) {
      const grow = getSkillGrow(slug);
      if (grow && !grows.includes(grow)) {
        grows.push(grow);
      }
    }
  }

  return {
    glows: [...skillGlows, ...UNIVERSAL_GLOWS],
    grows,
  };
}

// Coach guidance content: just-in-time coaching prompts, educational
// resources, and coaching principles for the coach portal.
//
// Target tables (LIVE, currently empty on staging/prod; read
// src/lib/db/schema/coach-guidance.ts before touching this file):
//   coachPrompts       -- consumer: src/pages/api/coach/prompts/index.ts
//   coachResources     -- consumer: src/pages/api/coach/resources/index.ts
//   coachingPrinciples -- consumer: src/pages/api/coach/prompts/principles.ts
//
// Row shape: each entry below is shaped for direct insert into its target
// table MINUS id/organizationId/sportId/stageId/skillId/createdAt/updatedAt
// (per CoachGuidanceContent in ./types.ts). The loader (Task 8) resolves
// scoping ids and writes the remaining columns verbatim.
//
// Sport/stage convention (documented here per the plan's "Sport references"
// requirement): rows that the recovered seeds scoped to a specific
// sport/stage via a resolved uuid (`sportId: soccer.id`, `stageId:
// fundamentals.id`, etc.) instead carry a human-readable `sport` (sport slug,
// e.g. "soccer" | "basketball" -- matches ActivityContent.sport) and/or
// `stage` (StageContent slug from ./reference.ts, e.g. "fundamentals")
// field. The loader resolves these slugs to uuids the same way it resolves
// ActivityContent.skillsDeveloped/appropriateStages. A row with neither field
// is global (mirrors the nullable sportId/stageId columns -- null means
// "applies to every sport/stage").
//
// Skill-linking (Directive 1, curriculum-refinery refine wave): coach_prompts
// rows may additionally carry a `skill` field -- a SKILL SLUG (SkillContent.
// slug) scoped to the row's `sport`, matching how activities.skillsDeveloped
// resolves. `skill` REQUIRES `sport` to also be set (skills are unique on
// (sportId, slug), so there is no sport-less way to resolve a bare slug); the
// loader (scripts/curriculum-load.ts) throws if `skill` is present without a
// resolvable `sport`, or if the (sport, skill) pair doesn't match a real
// skill. Only coach_prompts documents this convention -- coach_resources and
// coaching_principles never set `skill` (though coach_resources.skillId
// exists as a DB column, no content row here populates it, so the loader
// only wires skillId for prompts).
//
// Natural keys (Task 1, src/lib/db/schema/coach-guidance.ts): coach_prompts
// is unique on `content` (title is nullable there); coach_resources and
// coaching_principles are unique on `title`.
//
// Provenance: the recovered seeds contain TWO generations of this content
// that were never consolidated -- coach-prompts.ts + coach-resources.ts
// (the original pass) and coach-training-modules.ts ("Phase 7: Content
// Expansion", a later and much larger pass covering the same three tables).
// Both generations are folded in below, verbatim, extracted programmatically
// (see git history of this file / the Task 7 report for the extraction
// approach) to avoid hand-transcription drift.
//
// Natural-key collision found and resolved: both generations define a
// "Development Over Winning" coaching principle (coaching_principles is
// unique on title) with different body text. Mirroring how upgrade payloads
// win over v2-canonical content in the skills modules (Tasks 3/5), the
// coach-training-modules.ts version is kept as the later, more detailed
// pass; the coach-prompts.ts version of that one principle is dropped here.
// No other collisions were found: zero coach_prompts `content` duplicates
// and zero other coach_resources/coaching_principles `title` duplicates
// across the two generations (verified programmatically over all title/
// content strings from all three source files).
//
// sortOrder on coaching principles is NOT globally renumbered -- each
// generation's sortOrder sequence (1-5 vs a grouped 1/2/3/10/11/12/...
// scheme) is kept verbatim since sortOrder has no uniqueness constraint and
// is purely a display hint.

import type { CoachGuidanceContent } from "./types";

// Directive 1 (curriculum-refinery refine wave, 2026-07-11): skill-linked
// during_practice prompts for every soccer skill in ./soccer/skills.ts (26
// skills, 3 prompts each = 78 rows). Each row carries `sport: "soccer"`,
// `skill: "<slug>"`, and the skill's own `stage` (see the module header
// above for the `skill` field convention) so the loader resolves a real
// coach_prompts.skill_id instead of leaving these sport/stage-only. Content
// echoes each skill's actual coachingTips/commonMistakes/description from
// soccer/skills.ts rather than generic filler, and is pitched to the skill's
// stage: fundamentals-stage skills (ages 6-8) use simple, concrete language;
// skill-building/development-stage skills (ages 9-14) use more tactical
// vocabulary, matching soccer/skills.ts's own age-graded coachingTips.
const SOCCER_SKILL_PROMPTS: Record<string, unknown>[] = [
  // ball-control (fundamentals, technical)
  {
    sport: "soccer",
    skill: "ball-control",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Soft Touch Check",
    content: "Can you make your foot soft like a pillow so the ball stays close when it arrives?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "first-touch quality",
    tags: ["soccer", "ball-control", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "ball-control",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Cushion, Don't Stab",
    content: "Watch for a stiff-legged first touch — cue players to cushion with the inside of the foot, not the toe.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "first-touch quality",
    tags: ["soccer", "ball-control", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "ball-control",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Bounced Away? No Problem",
    content: "When a touch bounces away, say 'nice try — controlling a moving ball is genuinely hard!' and keep it light.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "first-touch quality",
    tags: ["soccer", "ball-control", "technical"],
    active: true,
  },
  // passing-short (fundamentals, technical)
  {
    sport: "soccer",
    skill: "passing-short",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Front Foot Target",
    content: "Before you pass, whose front foot are you aiming for?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "passing technique",
    tags: ["soccer", "passing", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "passing-short",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Check the Plant Foot",
    content: "If a pass wobbles off target, check the non-kicking foot — it should point straight at the target.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "passing technique",
    tags: ["soccer", "passing", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "passing-short",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Praise the Technique",
    content: "A locked ankle and a real follow-through are worth praising even when the pass drifts wide.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "passing technique",
    tags: ["soccer", "passing", "technical"],
    active: true,
  },
  // receiving-first-touch (fundamentals, technical)
  {
    sport: "soccer",
    skill: "receiving-first-touch",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Check Your Shoulder",
    content: "Did you check your shoulder before the ball arrived?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "receiving technique",
    tags: ["soccer", "receiving", "first-touch"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "receiving-first-touch",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Touch It Forward",
    content: "If the ball keeps trapping dead under a player's feet, cue 'touch it forward, not down.'",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "receiving technique",
    tags: ["soccer", "receiving", "first-touch"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "receiving-first-touch",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "First Touch Into Space",
    content: "A first touch that opens the body toward the field is a win, even if the next play doesn't come off.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "receiving technique",
    tags: ["soccer", "receiving", "first-touch"],
    active: true,
  },
  // dribbling (fundamentals, technical)
  {
    sport: "soccer",
    skill: "dribbling",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Eyes Up Check",
    content: "While you're dribbling, can you tell me what color shirt I'm wearing?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "close control while moving",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "dribbling",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Lighter Touch First",
    content: "Ball escaping is completely normal here — cue a lighter touch before adding more speed.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "close control while moving",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "dribbling",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Ball Got Away? Ask What's Next",
    content: "The ball got away — no problem. Ask what they'll try differently on the next go.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "close control while moving",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  // shooting (fundamentals, technical)
  {
    sport: "soccer",
    skill: "shooting",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Pick Your Spot",
    content: "Did you pick your spot in the goal before you struck the ball?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "shooting technique",
    tags: ["soccer", "shooting", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "shooting",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Watch the Plant Foot",
    content:
      "Watch the plant foot on a shot — if it lands too far behind the ball, players lean back and the shot sails over the bar.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "shooting technique",
    tags: ["soccer", "shooting", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "shooting",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Celebrate the Strike",
    content: "Celebrate a clean strike on target as much as a goal — technique is what you're building.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "shooting technique",
    tags: ["soccer", "shooting", "technical"],
    active: true,
  },
  // finding-space (fundamentals, tactical)
  {
    sport: "soccer",
    skill: "finding-space",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Where's the Space?",
    content: "Where is nobody standing right now — can you go there?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "off-ball movement",
    tags: ["soccer", "finding-space", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "finding-space",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Spread Out Like a Starfish",
    content: "Clustering around the ball is normal at this age — cue players to spread out like a starfish.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "off-ball movement",
    tags: ["soccer", "finding-space", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "finding-space",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Off-Ball Movement Counts",
    content: "Praise the player who moved to open space after passing, even if the ball never came back to them.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "off-ball movement",
    tags: ["soccer", "finding-space", "tactical"],
    active: true,
  },
  // support-play (fundamentals, tactical)
  {
    sport: "soccer",
    skill: "support-play",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Support After the Pass",
    content: "You just passed — where can you move to help again?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "supporting the ball carrier",
    tags: ["soccer", "support-play", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "support-play",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Give Them an Option",
    content: "If a player stands and watches after passing, cue 'give them another option' to get them moving.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "supporting the ball carrier",
    tags: ["soccer", "support-play", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "support-play",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Notice the Second Run",
    content: "Shout out the player who keeps supporting after the pass — that movement often goes unnoticed.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "supporting the ball carrier",
    tags: ["soccer", "support-play", "tactical"],
    active: true,
  },
  // 1v1-defending (fundamentals, tactical)
  {
    sport: "soccer",
    skill: "1v1-defending",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Which Way Did You Force Them?",
    content: "Which way did you force the attacker to go?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "1v1 defending shape",
    tags: ["soccer", "defending", "1v1"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "1v1-defending",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Patience Over the Dive",
    content: "If a defender dives in early and gets beaten, cue patience: 'stay on your toes, let them come to you.'",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "1v1 defending shape",
    tags: ["soccer", "defending", "1v1"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "1v1-defending",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Beaten Once, Still Defending",
    content: "Getting beaten once and staying in the play is real defending — praise the recovery, not just the win.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "1v1 defending shape",
    tags: ["soccer", "defending", "1v1"],
    active: true,
  },
  // agility-coordination (fundamentals, physical)
  {
    sport: "soccer",
    skill: "agility-coordination",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Bend Those Knees",
    content: "What happens to your balance when you bend your knees a little more?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "balance and coordination",
    tags: ["soccer", "agility", "physical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "agility-coordination",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Get Low Before the Turn",
    content: "A player standing tall through a direction change loses balance easily — cue 'get low' before the turn.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "balance and coordination",
    tags: ["soccer", "agility", "physical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "agility-coordination",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Wobbly Landing, Real Effort",
    content: "A wobbly landing after a jump still counts as trying to control it — praise the attempt.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "balance and coordination",
    tags: ["soccer", "agility", "physical"],
    active: true,
  },
  // speed (fundamentals, physical)
  {
    sport: "soccer",
    skill: "speed",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Arms Drive the Legs",
    content: "If a player's arms cross their body while sprinting, cue 'arms drive the legs' to straighten them out.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "sprint mechanics",
    tags: ["soccer", "speed", "physical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "speed",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "What Changed on That Sprint?",
    content: "What did you do differently on that faster sprint?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "sprint mechanics",
    tags: ["soccer", "speed", "physical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "speed",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Race Yourself, Not Just Others",
    content: "Praise the effort in a sprint even when a teammate finishes first — racing yourself is the real goal here.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "sprint mechanics",
    tags: ["soccer", "speed", "physical"],
    active: true,
  },
  // confidence (fundamentals, psychological)
  {
    sport: "soccer",
    skill: "confidence",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "That's Brave",
    content: "'That's brave!' lands better than 'good job' when a player tries something new and it doesn't work out.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "building confidence",
    tags: ["soccer", "confidence", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "confidence",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "What Made You Try It?",
    content: "What made you want to try that move?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "building confidence",
    tags: ["soccer", "confidence", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "confidence",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "A Small Safe Invite",
    content: "A player avoiding the ball may just need a small, safe chance to try something — invite them in gently.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "building confidence",
    tags: ["soccer", "confidence", "psychological"],
    active: true,
  },
  // resilience (fundamentals, psychological)
  {
    sport: "soccer",
    skill: "resilience",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Everyone Struggles Sometimes",
    content: "If a player shuts down after a mistake, pause and say 'everyone struggles sometimes' before moving on.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "emotional recovery",
    tags: ["soccer", "resilience", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "resilience",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "What Would You Try Differently?",
    content: "What's one thing you could try differently next time?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "emotional recovery",
    tags: ["soccer", "resilience", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "resilience",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Bouncing Back in Real Time",
    content: "Praise the player who kept playing right after a tough moment — that's resilience happening in real time.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "emotional recovery",
    tags: ["soccer", "resilience", "psychological"],
    active: true,
  },
  // teamwork (fundamentals, psychological)
  {
    sport: "soccer",
    skill: "teamwork",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Name the Good Pass",
    content: "Catch a good pass and say it out loud — teamwork moments need to be named for players to learn them.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "collaborative play",
    tags: ["soccer", "teamwork", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "teamwork",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Include the Quiet Player",
    content: "Who hasn't touched the ball yet — how can you include them?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "collaborative play",
    tags: ["soccer", "teamwork", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "teamwork",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Cheer as Loud as a Goal",
    content: "Celebrate a player cheering for a teammate's success as loudly as you'd celebrate a goal.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "collaborative play",
    tags: ["soccer", "teamwork", "psychological"],
    active: true,
  },
  // ball-mastery-toe-taps (fundamentals, technical)
  {
    sport: "soccer",
    skill: "ball-mastery-toe-taps",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Feel the Ball, Don't Watch It",
    content: "Can you feel the top of the ball with your toes without looking down?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "ball mastery rhythm",
    tags: ["soccer", "ball-mastery", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "ball-mastery-toe-taps",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Lighter and Quicker Taps",
    content: "If the ball keeps rolling away, cue lighter and quicker taps instead of harder ones.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "ball mastery rhythm",
    tags: ["soccer", "ball-mastery", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "ball-mastery-toe-taps",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Count Out Loud Together",
    content: "Counting taps out loud together builds rhythm and gives every player a small, visible win.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "ball mastery rhythm",
    tags: ["soccer", "ball-mastery", "technical"],
    active: true,
  },
  // dribbling-with-inside-outside (fundamentals, technical)
  {
    sport: "soccer",
    skill: "dribbling-with-inside-outside",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Inside vs Outside Feel",
    content: "Can you feel the difference between touching with the inside and the outside of your foot?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "two-footed dribbling",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "dribbling-with-inside-outside",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Keep the Touch Moving",
    content: "If a player stops to switch feet mid-dribble, cue a continuous touch instead of a full stop.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "two-footed dribbling",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "dribbling-with-inside-outside",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Praise the Weaker Foot",
    content: "Trying the less comfortable foot deserves real praise, even when the touch is clumsy.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "two-footed dribbling",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  // agility-change-of-direction (fundamentals, physical)
  {
    sport: "soccer",
    skill: "agility-change-of-direction",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Look Before Your Feet Turn",
    content: "If a player watches their own feet through a turn, cue 'look where you want to go before your feet turn.'",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "change of direction",
    tags: ["soccer", "agility", "physical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "agility-change-of-direction",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Which Foot Pushed You Off?",
    content: "Which foot pushed you off in that new direction?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "change of direction",
    tags: ["soccer", "agility", "physical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "agility-change-of-direction",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "A Controlled Stop Counts",
    content: "A fast, controlled stop is worth celebrating just as much as a fast sprint.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "change of direction",
    tags: ["soccer", "agility", "physical"],
    active: true,
  },
  // coachability (fundamentals, psychological)
  {
    sport: "soccer",
    skill: "coachability",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "One Correction at a Time",
    content: "Give one correction at a time — stacking several fixes at once makes feedback harder to absorb.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "receiving feedback",
    tags: ["soccer", "coachability", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "coachability",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "What Did You Notice?",
    content: "What's one thing you noticed after that last correction?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "receiving feedback",
    tags: ["soccer", "coachability", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "coachability",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Quiet Doesn't Mean Ignoring",
    content: "A player who goes quiet after feedback may still be absorbing it — check back in a few reps.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "receiving feedback",
    tags: ["soccer", "coachability", "psychological"],
    active: true,
  },
  // 1v1-dribbling-moves (skill-building, technical)
  {
    sport: "soccer",
    skill: "1v1-dribbling-moves",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Read the Defender's Weight",
    content: "Which way was the defender leaning right before you made your move?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "beating a defender 1v1",
    tags: ["soccer", "dribbling", "1v1"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "1v1-dribbling-moves",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Don't Repeat the Same Move",
    content: "If a move gets read every time, cue a different one — predictability is exactly what defenders exploit.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "beating a defender 1v1",
    tags: ["soccer", "dribbling", "1v1"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "1v1-dribbling-moves",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Praise the Sell, Not Just the Result",
    content: "Selling the fake with your body is worth praising even when the move doesn't beat the defender.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "beating a defender 1v1",
    tags: ["soccer", "dribbling", "1v1"],
    active: true,
  },
  // turning-with-ball (skill-building, technical)
  {
    sport: "soccer",
    skill: "turning-with-ball",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Where's the Open Side?",
    content: "Which way is the defender showing you — where's the open side?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "turning under pressure",
    tags: ["soccer", "turning", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "turning-with-ball",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Check the Shoulder First",
    content: "If a player turns straight into pressure, cue checking the shoulder before the ball even arrives.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "turning under pressure",
    tags: ["soccer", "turning", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "turning-with-ball",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "A Half-Second Under Pressure",
    content: "A turn that keeps the ball close and buys half a second under pressure is a real win — name it.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "turning under pressure",
    tags: ["soccer", "turning", "technical"],
    active: true,
  },
  // when-to-dribble-vs-pass (skill-building, tactical)
  {
    sport: "soccer",
    skill: "when-to-dribble-vs-pass",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "What Did You See First?",
    content: "What did you see before the ball got to you — was there a better option?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "decision-making",
    tags: ["soccer", "decision-making", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "when-to-dribble-vs-pass",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Decide Before It Arrives",
    content: "Cue players to decide before the ball arrives, not after — scanning early beats deciding late.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "decision-making",
    tags: ["soccer", "decision-making", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "when-to-dribble-vs-pass",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Praise the Read",
    content: "A good decision that didn't work out is still a good decision — praise the read, not just the result.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "decision-making",
    tags: ["soccer", "decision-making", "tactical"],
    active: true,
  },
  // long-passing (development, technical)
  {
    sport: "soccer",
    skill: "long-passing",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Plant Foot Points at Target",
    content: "Watch the plant foot on a long pass — it should sit right beside the ball, pointing at the target.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "long-passing technique",
    tags: ["soccer", "passing", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "long-passing",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Watch It Onto Your Foot",
    content: "Did you watch the ball all the way onto your foot before looking up?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "long-passing technique",
    tags: ["soccer", "passing", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "long-passing",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Technique Over the Result",
    content: "A well-struck long pass that lands slightly off target still shows real technique — name what worked.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "long-passing technique",
    tags: ["soccer", "passing", "technical"],
    active: true,
  },
  // heading-defensive (development, technical)
  {
    sport: "soccer",
    skill: "heading-defensive",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Attack the Ball",
    content: "If a player waits and lets the header come to them, cue 'attack the ball, don't let it hit you.'",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "defensive heading",
    tags: ["soccer", "heading", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "heading-defensive",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Time the Jump",
    content: "Did you time your jump to meet the ball at its highest point?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "defensive heading",
    tags: ["soccer", "heading", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "heading-defensive",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Eyes Open Through Contact",
    content: "Keeping eyes open through contact is a big step for a new header — praise it even without much power.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "defensive heading",
    tags: ["soccer", "heading", "technical"],
    active: true,
  },
  // positional-awareness (development, tactical)
  {
    sport: "soccer",
    skill: "positional-awareness",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "What's Your Job Here?",
    content: "What's your job in this position — what area are you protecting right now?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "maintaining shape",
    tags: ["soccer", "positioning", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "positional-awareness",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Check Shape, Not Just the Ball",
    content: "If a player is ball-watching, cue a quick shape check even when the ball is far from them.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "maintaining shape",
    tags: ["soccer", "positioning", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "positional-awareness",
    stage: "development",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Fast Recovery Deserves a Callout",
    content: "Getting back into position quickly after an attacking run deserves a specific, immediate callout.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "maintaining shape",
    tags: ["soccer", "positioning", "tactical"],
    active: true,
  },
  // dribbling-with-speed (skill-building, technical)
  {
    sport: "soccer",
    skill: "dribbling-with-speed",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Bigger Touches at Speed",
    content: "If a player's touches get choppy at speed, cue bigger touches with the laces once space opens up.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "dribbling at speed",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "dribbling-with-speed",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Where Does Control Break Down?",
    content: "Where does your control start to break down as you speed up?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "dribbling at speed",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "dribbling-with-speed",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Losing It at Top Speed Is Progress",
    content: "Losing the ball while pushing to full speed for the first time is progress — say so out loud.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "dribbling at speed",
    tags: ["soccer", "dribbling", "technical"],
    active: true,
  },
  // creating-passing-angles (skill-building, tactical)
  {
    sport: "soccer",
    skill: "creating-passing-angles",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Is There a Straight Line?",
    content: "Can you see a straight line between you and the ball right now? If not, what do you do?",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "off-ball positioning",
    tags: ["soccer", "passing-angles", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "creating-passing-angles",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Keep Adjusting the Angle",
    content: "If a player finds an angle and then stands still, cue continued movement as the defender reacts.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "off-ball positioning",
    tags: ["soccer", "passing-angles", "tactical"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "creating-passing-angles",
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Praise the Movement, Not Just the Pass",
    content: "Praise the movement that opened a passing lane even when the pass to them never actually comes.",
    priority: 6,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "off-ball positioning",
    tags: ["soccer", "passing-angles", "tactical"],
    active: true,
  },
  // enjoyment-of-play (fundamentals, psychological)
  {
    sport: "soccer",
    skill: "enjoyment-of-play",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "What Would Make This More Fun?",
    content: "What would make this drill more fun for you today?",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: true,
    targetedBehavior: "love of the game",
    tags: ["soccer", "enjoyment", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "enjoyment-of-play",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Redirect to Effort",
    content: "If enthusiasm drops after a mistake or a bad score, redirect the conversation back to effort, not outcome.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "love of the game",
    tags: ["soccer", "enjoyment", "psychological"],
    active: true,
  },
  {
    sport: "soccer",
    skill: "enjoyment-of-play",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "I Love Watching You Play",
    content: "Tell a player directly: 'I love watching you play' — it lands harder than any tactical note.",
    priority: 7,
    frequency: "random" as const,
    isQuestionBased: false,
    targetedBehavior: "love of the game",
    tags: ["soccer", "enjoyment", "psychological"],
    active: true,
  },
];

export const COACH_PROMPTS: Record<string, unknown>[] = [
  {
    triggerContext: "pre_practice" as const,
    promptType: "question" as const,
    title: "Today's Focus",
    content: "What's the ONE skill you want every player to improve today? Keep it simple and measurable.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Session planning and focus",
    tags: ["planning", "focus", "goals"],
    active: true,
  },
  {
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Equipment Check",
    content: "Do you have enough equipment for everyone? Players waiting = players disengaged.",
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Preparation",
    tags: ["equipment", "preparation"],
    active: true,
  },
  {
    triggerContext: "pre_practice" as const,
    promptType: "tip" as const,
    title: "European Coaching Insight",
    content: "In European academies, coaches arrive 30 minutes early to set up. When players arrive, practice begins immediately - no standing around.",
    priority: 7,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "Preparation",
    tags: ["european", "preparation", "efficiency"],
    active: true,
  },
  {
    triggerContext: "pre_practice" as const,
    promptType: "question" as const,
    title: "Individual Attention",
    content: "Which 2-3 players need extra attention today? What specific feedback will you give them?",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Individualization",
    tags: ["individual", "feedback", "planning"],
    active: true,
  },
  {
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Positive Start",
    content: "Greet every player by name as they arrive. A simple 'Hey [Name], glad you're here!' sets the tone for the whole session.",
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Relationship building",
    tags: ["relationships", "positivity", "greeting"],
    active: true,
  },
  {
    stage: "discovery",
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Fun First",
    content: "At this age, FUN is the #1 priority. If players aren't smiling and laughing, adjust your plan.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Age-appropriate coaching",
    tags: ["fun", "discovery", "engagement"],
    active: true,
  },
  {
    stage: "discovery",
    triggerContext: "pre_practice" as const,
    promptType: "tip" as const,
    title: "Short Activities",
    content: "Young players have ~5-7 minute attention spans. Plan for frequent activity changes with minimal instruction time.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "Age-appropriate coaching",
    tags: ["attention", "discovery", "activities"],
    active: true,
  },
  {
    stage: "fundamentals",
    triggerContext: "pre_practice" as const,
    promptType: "question" as const,
    title: "Skill Progression",
    content: "What skill from last practice are you building on today? Players learn through repetition with variation.",
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Progressive development",
    tags: ["progression", "fundamentals", "repetition"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Ask, Don't Tell",
    content: "Instead of correcting, try asking: 'What happened there?' or 'What could you try differently?' Let players discover the answer.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Guided discovery",
    tags: ["questioning", "european", "discovery-learning"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "reminder" as const,
    title: "Watch the Quiet Ones",
    content: "The loudest players get the most attention. Scan for players who are disengaged or struggling silently.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Inclusive coaching",
    tags: ["inclusion", "awareness", "all-players"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Praise Effort, Not Outcome",
    content: "Say 'Great effort on that run!' instead of 'Good goal!' Effort-based praise builds resilience and growth mindset.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "Growth mindset",
    tags: ["praise", "effort", "mindset"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "warning" as const,
    title: "Avoid Long Lines",
    content: "If players are standing in lines for more than 30 seconds, they're not learning. More stations, smaller groups.",
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Maximizing engagement",
    tags: ["engagement", "efficiency", "organization"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Celebrate Mistakes",
    content: "When a player makes a mistake trying something new, say 'I love that you tried that!' Mistakes mean they're learning.",
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Safe learning environment",
    tags: ["mistakes", "encouragement", "learning"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Check Understanding",
    content: "Ask a player to explain the activity to the group. If they can't, your instructions weren't clear enough.",
    priority: 7,
    frequency: "weekly" as const,
    isQuestionBased: true,
    targetedBehavior: "Clear communication",
    tags: ["communication", "understanding", "instructions"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Freeze & Question",
    content: "Occasionally freeze the action: 'Everyone stop! [Player], what do you see right now? What are your options?'",
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: true,
    targetedBehavior: "Game understanding",
    tags: ["freeze", "questioning", "tactical-awareness"],
    active: true,
  },
  {
    stage: "discovery",
    triggerContext: "during_practice" as const,
    promptType: "reminder" as const,
    title: "Movement Over Perfection",
    content: "At ages 3-5, focus on MOVEMENT not technique. Are they running, jumping, throwing? That's success!",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Age-appropriate expectations",
    tags: ["discovery", "movement", "expectations"],
    active: true,
  },
  {
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Add Decision-Making",
    content: "At this age, add choices to drills: 'Defender steps left, what do you do?' Build game intelligence.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: true,
    targetedBehavior: "Decision-making development",
    tags: ["decisions", "game-intelligence", "skill-building"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "question" as const,
    title: "Self-Reflection",
    content: "What's one thing YOU would do differently next time? Great coaches constantly improve.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Coach development",
    tags: ["reflection", "improvement", "self-assessment"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "reminder" as const,
    title: "End on a High",
    content: "Did you end with something fun and successful? Players remember how they FELT at the end.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Positive endings",
    tags: ["ending", "fun", "memory"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "tip" as const,
    title: "Parent Connection",
    content: "Take 30 seconds to tell one parent something positive their child did today. Builds trust and community.",
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "Parent engagement",
    tags: ["parents", "communication", "community"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "question" as const,
    title: "Player Progress",
    content: "Which player showed the most improvement today? Have you recorded it for their development journey?",
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Progress tracking",
    tags: ["progress", "tracking", "individual"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "reminder" as const,
    title: "Next Session Prep",
    content: "While it's fresh: What will you do NEXT practice based on what you saw today?",
    priority: 7,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Continuity planning",
    tags: ["planning", "continuity", "improvement"],
    active: true,
  },
  {
    triggerContext: "assessment" as const,
    promptType: "reminder" as const,
    title: "Observe, Don't Judge",
    content: "Assessments capture where they ARE, not where they SHOULD be. No player should feel they failed.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Non-judgmental assessment",
    tags: ["assessment", "observation", "mindset"],
    active: true,
  },
  {
    triggerContext: "assessment" as const,
    promptType: "tip" as const,
    title: "Natural Environment",
    content: "The best assessments happen during games, not isolated tests. Watch for skills in context.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "Contextual assessment",
    tags: ["assessment", "games", "context"],
    active: true,
  },
  {
    triggerContext: "assessment" as const,
    promptType: "question" as const,
    title: "Growth Focus",
    content: "Compare this player to THEMSELVES last month, not to other players. What's their personal growth?",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "Individual progress",
    tags: ["assessment", "growth", "individual"],
    active: true,
  },
  {
    triggerContext: "pre_game" as const,
    promptType: "reminder" as const,
    title: "Equal Playing Time",
    content: "At youth level, EVERY player deserves meaningful playing time. Winning isn't the goal—development is.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Equal opportunity",
    tags: ["game-day", "playing-time", "development"],
    active: true,
  },
  {
    triggerContext: "during_game" as const,
    promptType: "tip" as const,
    title: "Let Them Play",
    content: "Resist the urge to coach every moment. Let players make decisions—that's where learning happens.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Player autonomy",
    tags: ["game-day", "autonomy", "decisions"],
    active: true,
  },
  {
    triggerContext: "during_game" as const,
    promptType: "warning" as const,
    title: "Sideline Behavior",
    content: "Your sideline energy affects players. Stay calm and positive—they're watching you more than you think.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "Coach composure",
    tags: ["game-day", "composure", "behavior"],
    active: true,
  },
  {
    triggerContext: "post_game" as const,
    promptType: "tip" as const,
    title: "The Car Ride Home",
    content: "Remind parents: After a game, just say 'I love watching you play.' No coaching, no critique, just support.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "Parent education",
    tags: ["game-day", "parents", "support"],
    active: true,
  },
  {
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Arrival Preparation",
    content:
      "Arrive 10-15 minutes before practice starts. Use this time to set up equipment, greet players individually, and observe their mood and energy levels.",
    priority: 10,
    frequency: "first_time" as const,
    isQuestionBased: false,
    targetedBehavior: "preparation",
    tags: ["preparation", "arrival", "setup"],
    active: true,
  },
  {
    triggerContext: "pre_practice" as const,
    promptType: "question" as const,
    title: "Session Goals",
    content:
      "What are 2-3 specific skills you want players to improve today? Can you describe what success looks like in simple terms?",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "goal setting",
    tags: ["planning", "goals", "focus"],
    active: true,
  },
  {
    triggerContext: "pre_practice" as const,
    promptType: "tip" as const,
    title: "Equipment Check",
    content:
      "Ensure you have: enough balls for all players, visible cones/markers, any safety equipment, and a first aid kit nearby. Running out of equipment disrupts the learning flow.",
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "organization",
    tags: ["equipment", "preparation", "safety"],
    active: true,
  },
  {
    stage: "fundamentals",
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Fun First at Fundamentals",
    content:
      "For ages 6-8, fun is the #1 priority. If players aren't smiling and laughing, reconsider your activity choices. Technical perfection can wait - falling in love with the sport cannot.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "age-appropriate coaching",
    tags: ["fundamentals", "fun", "engagement"],
    active: true,
  },
  {
    stage: "skill-building",
    triggerContext: "pre_practice" as const,
    promptType: "tip" as const,
    title: "Skill Building Balance",
    content:
      "Ages 9-11 can handle more technical instruction, but still need 70% of practice time in game-like activities. Drills should be short (5-7 min max) before returning to play.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "training design",
    tags: ["skill-building", "structure", "balance"],
    active: true,
  },
  {
    stage: "development",
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Development Stage Autonomy",
    content:
      "Players 12-14 are ready for more responsibility. Let them help with warmup leadership, activity selection, and peer feedback. Autonomy builds intrinsic motivation.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "player autonomy",
    tags: ["development", "autonomy", "leadership"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Question Over Tell",
    content:
      'Instead of telling players what to do, ask questions: "What happened there?", "What could you try differently?", "Where is the space?" This develops thinking players.',
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "guided discovery",
    tags: ["questions", "discovery", "european-style"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "reminder" as const,
    title: "Let Them Play",
    content:
      "Resist the urge to stop play frequently. Most learning happens during the activity itself. Save detailed feedback for breaks or transitions.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "coach silence",
    tags: ["play", "flow", "minimal-intervention"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "encouragement" as const,
    title: "Effort Over Outcome",
    content:
      'Praise effort and process: "Great try!", "I love that you kept going", "Good decision to look up first". Avoid outcome-only praise like "Nice goal" which they can\'t always control.',
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "growth mindset",
    tags: ["praise", "effort", "growth-mindset"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "warning" as const,
    title: "Watch for Fatigue",
    content:
      "Signs of mental fatigue: increased mistakes, decreased effort, looking away, fidgeting. When you see these, change the activity or take a water break. Tired players don't learn well.",
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "player welfare",
    tags: ["fatigue", "attention", "breaks"],
    active: true,
  },
  {
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Positive to Constructive Ratio",
    content:
      "Aim for 4-5 positive comments for every constructive correction. Players who feel encouraged are more willing to take risks and try new skills.",
    priority: 7,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "feedback balance",
    tags: ["feedback", "positivity", "encouragement"],
    active: true,
  },
  {
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "reminder" as const,
    title: "One Thing at a Time",
    content:
      "Young players (6-8) can only focus on one coaching point at a time. Pick ONE thing to improve and stick with it for the whole activity. Too much instruction overwhelms them.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "focused instruction",
    tags: ["fundamentals", "focus", "simplicity"],
    active: true,
  },
  {
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Use Imagery",
    content:
      'Young players respond to imagery: "Be a cheetah!", "Sticky feet like glue", "Eyes like an owl". Abstract concepts like "keep your body low" don\'t land as well.',
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "communication",
    tags: ["imagery", "communication", "young-players"],
    active: true,
  },
  {
    stage: "skill-building",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Problem Solving",
    content:
      'At ages 9-11, challenge players to solve problems: "The defender keeps winning - what can you change?", "How can you create more space?"',
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "tactical thinking",
    tags: ["problem-solving", "tactical", "thinking"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "question" as const,
    title: "Self Reflection",
    content:
      "Before leaving: What went well today? What would you do differently? Did every player get individual attention? Were there players who struggled that need extra support?",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "coach reflection",
    tags: ["reflection", "improvement", "self-assessment"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "reminder" as const,
    title: "Individual Notes",
    content:
      "Take 2 minutes to record notes on 2-3 players - their progress, challenges, or something specific you noticed. These notes build into meaningful development insights over time.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "documentation",
    tags: ["notes", "tracking", "development"],
    active: true,
  },
  {
    triggerContext: "post_practice" as const,
    promptType: "tip" as const,
    title: "Parent Communication",
    content:
      'End practice with parents present. Share one positive highlight: "Today we worked on... and I saw some great effort from everyone." Parents appreciate seeing what their child is learning.',
    priority: 7,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "parent engagement",
    tags: ["parents", "communication", "transparency"],
    active: true,
  },
  {
    triggerContext: "assessment" as const,
    promptType: "reminder" as const,
    title: "Assessment Is Observation",
    content:
      "Assessment should happen naturally during play, not through formal testing. Watch players in game-like situations to see their true ability level.",
    priority: 10,
    frequency: "first_time" as const,
    isQuestionBased: false,
    targetedBehavior: "assessment approach",
    tags: ["assessment", "observation", "authentic"],
    active: true,
  },
  {
    triggerContext: "assessment" as const,
    promptType: "tip" as const,
    title: "Focus on Progress",
    content:
      "Compare each player to their own past performance, not to teammates. Development happens at different rates. A player at Level 2 who improved from Level 1 deserves celebration.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "growth mindset",
    tags: ["progress", "individual", "growth"],
    active: true,
  },
  {
    triggerContext: "assessment" as const,
    promptType: "question" as const,
    title: "Holistic View",
    content:
      "Beyond technical skills, consider: Is this player enjoying practice? Are they a good teammate? Do they show resilience when things get hard? Development is multi-dimensional.",
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: true,
    targetedBehavior: "holistic development",
    tags: ["psychological", "social", "whole-player"],
    active: true,
  },
  {
    sport: "soccer",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Ball Mastery Time",
    content:
      "Start every soccer practice with 5-7 minutes of individual ball mastery. Every player, every ball, every surface. This builds the technical foundation for everything else.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "technical development",
    tags: ["soccer", "ball-mastery", "technical"],
    active: true,
  },
  {
    sport: "soccer",
    triggerContext: "during_practice" as const,
    promptType: "question" as const,
    title: "Soccer Vision",
    content:
      '"Can you see your teammates before you receive the ball?" - The best players scan before receiving. Encourage players to "take a picture" of the field before the ball arrives.',
    priority: 8,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "awareness",
    tags: ["soccer", "scanning", "awareness"],
    active: true,
  },
  {
    sport: "soccer",
    stage: "fundamentals",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Small Sided Games",
    content:
      "For ages 6-8, 3v3 or 4v4 maximum. Smaller games mean more touches, more decisions, more goals. Big games create spectators, not players.",
    priority: 10,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "game format",
    tags: ["soccer", "small-sided", "fundamentals"],
    active: true,
  },
  {
    sport: "basketball",
    triggerContext: "during_practice" as const,
    promptType: "tip" as const,
    title: "Eyes Up",
    content:
      'Young basketball players watch the ball while dribbling. Use "eyes up" games where players must identify colors or numbers while handling the ball to develop court vision.',
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "ball handling",
    tags: ["basketball", "dribbling", "vision"],
    active: true,
  },
  {
    sport: "basketball",
    triggerContext: "during_practice" as const,
    promptType: "reminder" as const,
    title: "Form Over Distance",
    content:
      "Shooting form is built close to the basket. Move players back gradually only as their form stays consistent. Bad habits from shooting too far are hard to fix.",
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "shooting mechanics",
    tags: ["basketball", "shooting", "technique"],
    active: true,
  },
  {
    sport: "basketball",
    stage: "fundamentals",
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Lower Hoops",
    content:
      "Use 8-foot hoops for ages 6-8 if available. Standard 10-foot hoops force poor shooting form. Players should be able to make layups and close shots with proper technique.",
    priority: 9,
    frequency: "first_time" as const,
    isQuestionBased: false,
    targetedBehavior: "equipment adaptation",
    tags: ["basketball", "equipment", "fundamentals"],
    active: true,
  },
  {
    triggerContext: "pre_game" as const,
    promptType: "reminder" as const,
    title: "Equal Playing Time",
    content:
      "For development ages (under 12), every player should get roughly equal playing time. Development happens through playing, not watching. Winning is secondary to development.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "player rotation",
    tags: ["game-day", "playing-time", "development"],
    active: true,
  },
  {
    triggerContext: "during_game" as const,
    promptType: "tip" as const,
    title: "Sideline Behavior",
    content:
      "During games, limit your instructions to encouragement. Players need to learn to make their own decisions. Constant coaching from the sideline creates dependent players.",
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "coach silence",
    tags: ["game-day", "sideline", "autonomy"],
    active: true,
  },
  {
    triggerContext: "post_game" as const,
    promptType: "question" as const,
    title: "Game Reflection",
    content:
      'Ask players: "Did you have fun?", "What did you try that worked?", "What do you want to work on at practice?" Focus on effort and learning, not score.',
    priority: 9,
    frequency: "always" as const,
    isQuestionBased: true,
    targetedBehavior: "player reflection",
    tags: ["game-day", "reflection", "learning"],
    active: true,
  },
  {
    stage: "fundamentals",
    triggerContext: "post_game" as const,
    promptType: "reminder" as const,
    title: "Score Doesn't Matter",
    content:
      "For ages 6-8, never mention the score in post-game talks. Ask about fun moments, good tries, and teamwork. Building love for the sport matters more than any result.",
    priority: 10,
    frequency: "always" as const,
    isQuestionBased: false,
    targetedBehavior: "outcome vs process",
    tags: ["game-day", "fundamentals", "enjoyment"],
    active: true,
  },
  {
    sport: "hockey",
    triggerContext: "pre_practice" as const,
    promptType: "tip" as const,
    title: "Station-Based, Cross-Ice Practice",
    content:
      "Structure youth practices as rotating stations (8-10 min each) with cross-ice small-area games, not full-ice drills. USA Hockey's ADM model runs 8U as stations plus cross-ice 4v4 with intermediate nets, and 6U as 3v3 with mini nets and no goalies.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "practice design",
    tags: ["hockey", "adm", "cross-ice", "stations"],
    active: true,
  },
  {
    sport: "hockey",
    triggerContext: "during_practice" as const,
    promptType: "reminder" as const,
    title: "Small Ice Means More Shots",
    content:
      "Keep the ice small and the games short. An IIHF-hosted Sweden/Finland small-area-games study found up to 5x more shot attempts in small-ice games than full-ice 5v5 - that's where reps and confidence come from.",
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "practice design",
    tags: ["hockey", "small-area-games", "shots", "development"],
    active: true,
  },
  {
    sport: "baseball",
    triggerContext: "pre_practice" as const,
    promptType: "reminder" as const,
    title: "Throw, Catch, Run, Hit - Our Teaching Sequence",
    content:
      "USA Baseball's LTAD guidance for ages 6-8 identifies four core motor competencies - throwing, catching, running, hitting - taught through play, not lecture. We sequence our own teaching in that order (throw, catch, run, hit) as an editorial choice, not something the federation ranks. If practice time is short, protect the throw and catch reps before the hitting reps.",
    priority: 9,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "session planning",
    tags: ["baseball", "ltad", "fundamentals", "sequencing"],
    active: true,
  },
  {
    sport: "baseball",
    stage: "fundamentals",
    triggerContext: "pre_practice" as const,
    promptType: "tip" as const,
    title: "Tee First, Rules Minimal",
    content:
      "For 6-8 year olds, hit off the tee before live or soft-toss pitching, and keep game knowledge to the essentials: which base to run to, where to stand, what counts as an out. Everything else is noise at this age.",
    priority: 8,
    frequency: "weekly" as const,
    isQuestionBased: false,
    targetedBehavior: "age-appropriate coaching",
    tags: ["baseball", "tee-ball", "fundamentals", "simplicity"],
    active: true,
  },
  ...SOCCER_SKILL_PROMPTS,
];

export const COACH_RESOURCES: Record<string, unknown>[] = [
  {
    resourceType: "article" as const,
    title: "The Art of Questioning in Coaching",
    description:
      "Learn how to use questions instead of instructions to develop players who think for themselves. The European approach to guided discovery.",
      content: `# The Art of Questioning in Coaching

## Why Questions Work Better Than Instructions

When you tell a player what to do, they follow instructions. When you ask them what they see, they learn to think. This fundamental shift—from instructing to questioning—is at the heart of European coaching methodology.

## The Question Framework

### Open Questions
- "What do you see?"
- "What are your options?"
- "What happened there?"

### Guided Questions
- "Where is the space?"
- "What did your teammate expect?"
- "How could you create more time?"

### Reflection Questions
- "What would you do differently?"
- "Why did that work?"
- "What surprised you?"

## Practical Application

**Instead of:** "Pass the ball earlier!"
**Ask:** "When did you decide to pass? Was there an earlier moment?"

**Instead of:** "You should have shot!"
**Ask:** "What options did you see there?"

**Instead of:** "Move to space!"
**Ask:** "Where was the space? How could you get there?"

## Key Principles

1. **Wait Time**: After asking, give players 3-5 seconds to think
2. **No Wrong Answers**: Every answer reveals their thinking
3. **Follow Up**: "Tell me more about that..."
4. **Celebrate Thinking**: "I love that you saw that option!"

## Remember

The goal isn't to get the "right" answer. It's to develop players who constantly scan, think, and make decisions. The thinking process matters more than the answer.`,
    topic: "coaching-methodology",
    tags: ["questioning", "european", "methodology", "communication"],
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Creating Psychologically Safe Training Environments",
    description:
      "Research-backed strategies for creating an environment where players feel safe to take risks, make mistakes, and develop creativity.",
      content: `# Creating Psychologically Safe Training Environments

## What is Psychological Safety?

Psychological safety is the belief that you won't be punished or humiliated for speaking up, asking questions, or making mistakes. In youth sports, it's the foundation for learning and creativity.

## Why It Matters

- Players who feel safe take more creative risks
- Mistakes become learning opportunities, not shame experiences
- Players develop intrinsic motivation and love for the sport
- Retention rates dramatically improve

## Warning Signs of Unsafe Environments

- Players look at the coach after making mistakes
- Risk-averse play (only safe passes, no creative attempts)
- Quiet, disengaged players
- Fear of trying new skills
- Decreased effort over time

## Building Safety: Practical Strategies

### 1. Reframe Mistakes
"Mistakes mean you're trying something new—that's exactly what I want!"

### 2. Model Vulnerability
Share your own mistakes: "When I played, I struggled with this too..."

### 3. Praise Risk-Taking
"I love that you tried that! Even though it didn't work, the attempt was great!"

### 4. Private Corrections
Pull players aside for individual feedback rather than public correction.

### 5. Question, Don't Critique
Instead of "That was wrong," ask "What happened there? What might you try next time?"

## Team Culture Builders

- "We celebrate effort, not just success"
- "Mistakes help us learn"
- "We support each other"
- "Everyone belongs here"

## Remember

The safest environments often produce the boldest players. When failure isn't scary, players are free to be creative.`,
    topic: "psychology",
    tags: ["safety", "psychology", "culture", "mistakes"],
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Age-Appropriate Coaching: The Science of Development",
    description:
      "Understanding cognitive, physical, and emotional development stages to match your coaching to where players actually are.",
      content: `# Age-Appropriate Coaching: The Science of Development

## The Development Reality

Children are not mini-adults. Their brains, bodies, and emotional capacity develop at predictable stages. Effective coaching matches methods to developmental reality.

## Ages 3-5: Discovery Stage

### Physical Development
- Large muscle control developing
- Fine motor skills limited
- Coordination improving but inconsistent
- Tire quickly, recover quickly

### Cognitive Development
- Attention span: 5-7 minutes max
- Egocentric (can't see others' perspectives)
- Concrete thinkers (abstract concepts don't work)
- Learn through DOING, not listening

### Coaching Implications
- Maximum activity, minimum instruction
- Lots of breaks (water, rest, silly breaks)
- Simple rules, simple games
- Success = participation and smiling
- No positions, no complex tactics

## Ages 6-8: Fundamentals Stage

### Physical Development
- Improved coordination
- Still developing spatial awareness
- Can sustain activity longer
- Growth spurts may cause clumsiness

### Cognitive Development
- Attention span: 10-12 minutes
- Beginning to understand others' views
- Can follow multi-step instructions
- Learning cause and effect

### Coaching Implications
- Introduce basic techniques
- Use demonstrations, not just words
- Small-sided games (3v3, 4v4)
- Still prioritize fun and participation
- Begin teaching teamwork concepts

## Ages 9-12: Skill Building Stage

### Physical Development
- "Skill-hungry years" - rapid learning
- Good coordination
- Varied growth (some early, some late)
- Can handle more physical demands

### Cognitive Development
- Attention span: 15-20 minutes
- Understand tactics and strategy
- Can self-reflect
- Beginning abstract thinking

### Coaching Implications
- Technique refinement
- Introduce decision-making
- More complex game concepts
- Individual feedback matters
- Still development over winning

## Golden Rules for All Ages

1. **Shorten talking, increase doing**
2. **Match expectations to development**
3. **Remember late developers catch up**
4. **Fun remains essential at every age**
5. **Relationships before results**`,
    topic: "development",
    tags: ["age-appropriate", "development", "stages", "science"],
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Effective Feedback: The 4:1 Ratio",
    description:
      "Learn the research-backed approach to feedback that builds confidence while still developing skills.",
      content: `# Effective Feedback: The 4:1 Ratio

## The Research

Studies show that the optimal feedback ratio for development is 4:1 positive to corrective. This isn't about being soft—it's about how brains learn best.

## Why 4:1 Works

- Positive feedback releases dopamine, enhancing learning
- Players remain open to correction
- Confidence builds alongside skill
- Players take more risks

## Types of Positive Feedback

### 1. Effort Praise
"You worked so hard on that drill!"
"I saw you running back on defense—great effort!"

### 2. Improvement Recognition
"Your left foot is so much better than last month!"
"That pass was way more accurate than before!"

### 3. Behavior Acknowledgment
"I love how you encouraged your teammate!"
"Great job staying positive when that didn't work!"

### 4. Specific Skill Praise
"Your body position was perfect there!"
"That first touch set up everything!"

## The Corrective Feedback Part

### When It's Needed
- After establishing safety through positive feedback
- Focused on one thing at a time
- Delivered as information, not judgment

### How to Deliver It
**Format:** Acknowledge → Suggest → Encourage

"That pass showed great vision. What if you opened your body more to see both options? Try it again—you've got this!"

## Common Mistakes

❌ "Good job, BUT..." (the but erases the praise)
❌ Praising only outcomes (goals, wins)
❌ Generic praise ("Nice work!")
❌ Delayed feedback (save it for later)

## Remember

Players don't remember what you said. They remember how you made them feel. The 4:1 ratio creates players who love coming to practice.`,
    topic: "feedback",
    tags: ["feedback", "communication", "praise", "correction"],
    featured: false,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Small-Sided Games: The Heart of Modern Coaching",
    description:
      "Why small-sided games develop better players faster, and how to design effective game-based activities.",
      content: `# Small-Sided Games: The Heart of Modern Coaching

## The Research is Clear

Players in small-sided games get:
- 4x more touches on the ball
- 3x more 1v1 situations
- 2x more passing decisions
- More goals/shots (building confidence)
- Constant cognitive engagement

## Why They Work

### More Repetition
In 11v11, a player might touch the ball 20 times in an hour.
In 4v4, they might touch it 100+ times.

### Game-Real Learning
Skills are practiced in context, with opposition, under pressure—just like real games.

### Constant Decision-Making
Every touch requires a decision: dribble? pass? shoot? where?

### Self-Organizing
Players naturally learn spacing, support, movement without explicit instruction.

## Designing Effective Small-Sided Games

### The Formula
**Small space + Few players + Simple rules = Maximum engagement**

### Key Principles
1. **Quick restart** - No waiting, ball out = ball in immediately
2. **Multiple balls** - Keep one on the field at all times
3. **Play, then coach** - Let them play before stopping
4. **Constraints, not instructions** - Change the game, not the player

### Example Constraints
- "You must complete 3 passes before shooting"
- "Goals only count if team is in attacking half"
- "Score double points for weak foot goals"
- "Can only score from a one-touch finish"

## Game Sizes by Age

| Age | Recommended Size |
|-----|------------------|
| 3-5 | 1v1, 2v2 |
| 6-8 | 3v3, 4v4 |
| 9-12 | 4v4, 5v5, 7v7 |

## Remember

The best practice looks like the best playground soccer: constant action, kids fully engaged, having fun, getting better without realizing it.`,
    topic: "methodology",
    tags: ["small-sided-games", "games", "methodology", "engagement"],
    featured: true,
    active: true,
  },
  {
    sport: "soccer",
    resourceType: "article" as const,
    title: "Teaching the First Touch",
    description: "How to develop players who can control the ball in any situation, using game-based methods.",
      content: `# Teaching the First Touch

## Why First Touch Matters

In modern soccer, the first touch determines everything. A good first touch creates time, space, and options. A poor first touch means pressure, panic, and lost possession.

## The European Approach

Don't drill first touch in isolation. Develop it through games where first touch matters.

## Game-Based Activities

### 1. Receive and Turn (4v4)
- Goals on all 4 sides of square
- Extra point for receiving, turning, and scoring on opposite goal
- Forces players to receive facing away from pressure

### 2. Two-Touch Maximum
- Normal small-sided game
- Maximum 2 touches
- Players must prepare their first touch for the second

### 3. The Pressure Game
- 3v1 in a square
- Player who receives ball becomes defender
- Forces quality first touch under pressure

## Coaching Points (delivered as questions)

- "Where is the defender? Where do you want your first touch?"
- "What part of your foot gives you the most control?"
- "Can you receive the ball so you're already facing your next action?"

## Common Mistakes (and what causes them)

| Mistake | Usually caused by |
|---------|-------------------|
| Ball bounces off | Standing flat-footed, tense body |
| Touch too heavy | Not cushioning, kicking instead of receiving |
| Touch too close | Not looking before receiving |
| Touch backward | Body not open to the field |

## Remember

The best first touch isn't always perfect control—it's the touch that solves the problem. Sometimes that's a touch into space, sometimes it's a first-time pass.`,
    topic: "technique",
    tags: ["soccer", "first-touch", "receiving", "technique"],
    featured: false,
    active: true,
  },
  {
    sport: "basketball",
    resourceType: "article" as const,
    title: "Ball Handling Development",
    description: "Progressive approach to developing ball handling skills that transfer to game situations.",
      content: `# Ball Handling Development

## Philosophy

Ball handling isn't about fancy moves—it's about being comfortable with the ball so your eyes and mind can focus on the game.

## Progression

### Stage 1: Comfort (Ages 5-7)
Goal: Ball feels natural in hands
- Pound dribbles (hard, loud dribbles)
- Figure 8s around legs (no dribble)
- Dribble while sitting, kneeling, standing
- Games: Dribble tag, knockout

### Stage 2: Control (Ages 8-10)
Goal: Maintain dribble while doing other things
- Dribble with eyes up
- Change speeds
- Change hands
- Games: 1v1, dribble relay races

### Stage 3: Decision-Making (Ages 11+)
Goal: Read defense and react
- Attack space
- Use moves to create advantage
- When to dribble vs when to pass
- Games: 2v2, 3v3 with dribble constraints

## Key Moves to Teach

### Crossover
The foundation. Change direction with one dribble.
- Low, quick, ball below knee
- Sell the direction first

### Hesitation
Change of pace to freeze defender.
- Slow down like you're stopping
- Accelerate past

### Between the Legs
Protect the ball while changing direction.
- Ball crosses under the leg
- Used when defender is reaching

## Game-Based Practice

**Sharks and Minnows**
Everyone dribbles. 1-2 "sharks" try to knock balls away.
Develops: protecting the ball, head up, using body

**1v1 Full Court**
Start at baseline, score at opposite basket.
Develops: attacking, decision-making, conditioning

## Remember

The best ball handlers look like they're barely dribbling—the ball is just part of them. That comfort comes from thousands of repetitions in game-like situations.`,
    topic: "technique",
    tags: ["basketball", "ball-handling", "dribbling", "technique"],
    featured: false,
    active: true,
  },
  {
    resourceType: "video" as const,
    title: "The Changing Room: Coach Communication",
    description: "How top European coaches communicate with young players before, during, and after training.",
    url: "https://www.youtube.com/watch?v=example1",
    durationMinutes: 12,
    topic: "communication",
    tags: ["video", "communication", "european", "methodology"],
    source: "UEFA Coaching Education",
    featured: false,
    active: true,
  },
  {
    resourceType: "video" as const,
    title: "Small-Sided Games in Action",
    description: "Watch how FC Barcelona's La Masia academy uses small-sided games to develop world-class players.",
    url: "https://www.youtube.com/watch?v=example2",
    durationMinutes: 18,
    topic: "methodology",
    tags: ["video", "small-sided-games", "barcelona", "academy"],
    source: "FC Barcelona",
    featured: true,
    active: true,
  },
  {
    resourceType: "video" as const,
    title: "Age-Appropriate Coaching Demonstration",
    description: "See the difference between coaching 6-year-olds vs 12-year-olds with the same activity.",
    url: "https://www.youtube.com/watch?v=example3",
    durationMinutes: 15,
    topic: "development",
    tags: ["video", "age-appropriate", "demonstration", "comparison"],
    source: "US Soccer Development Academy",
    featured: false,
    active: true,
  },
  {
    stage: "discovery",
    resourceType: "article" as const,
    title: "Coaching the Discovery Stage (Ages 3-5)",
    description: "Everything you need to know about coaching the youngest athletes. Focus: fun, movement, and falling in love with activity.",
      content: `# Coaching the Discovery Stage (Ages 3-5)

## Your #1 Goal

Get them to come back next week. That's it. Everything else is secondary.

## What They Need

- Movement in all directions
- Success (lots of it)
- Fun (constant fun)
- Connection with you and friends
- Short bursts of activity
- Zero pressure

## What They Don't Need

- Technique correction
- Positions
- Competition focus
- Long explanations
- Standing still
- Complex rules

## Session Structure (30-45 minutes)

1. **Free Play** (5 min) - Let them explore with equipment
2. **Movement Game** (8 min) - Sharks and minnows, tag, etc.
3. **Water Break** (3 min) - They need lots of these
4. **Activity 2** (8 min) - Simple skill game
5. **Water Break** (2 min)
6. **Activity 3** (8 min) - Different movement challenge
7. **Fun Game** (5 min) - End on a high

## Language to Use

✅ "Let's see who can..." (makes it a game)
✅ "Show me how you..." (celebrates individuality)
✅ "Who's ready to..." (builds excitement)
✅ "Great job trying!" (praises effort)

## Language to Avoid

❌ "No, do it like this..."
❌ "You need to..."
❌ "That's wrong..."
❌ "Watch how I do it..."

## Remember

A 4-year-old who loves coming to practice will become a 14-year-old who's still playing. A 4-year-old who feels pressured won't make it to age 6.`,
    topic: "age-appropriate",
    tags: ["discovery", "young-children", "fun", "development"],
    featured: false,
    active: true,
  },
  {
    stage: "fundamentals",
    resourceType: "article" as const,
    title: "Coaching the Fundamentals Stage (Ages 6-8)",
    description: "Building the foundation: basic techniques, simple tactics, and maintaining the love of the game.",
      content: `# Coaching the Fundamentals Stage (Ages 6-8)

## The Sweet Spot

Old enough to learn basic techniques, young enough that fun still trumps everything. This is where foundations are laid.

## Your Goals

1. Maintain their love of the sport
2. Develop basic movement skills
3. Introduce sport-specific fundamentals
4. Build social connections
5. Create confident, happy athletes

## What's Developmentally Appropriate

### Physical
- Can sustain activity for 10-15 minutes
- Coordination improving rapidly
- Still learning body awareness
- Growth spurts may cause clumsiness

### Cognitive
- Can follow 2-3 step instructions
- Beginning to understand cause/effect
- Starting to see others' perspectives
- Attention span: ~10-12 minutes

### Emotional
- Want to please adults
- Sensitive to criticism
- Need frequent encouragement
- Compare themselves to peers

## Session Structure (45-60 minutes)

1. **Dynamic Warm-Up** (8 min) - Fun movement games
2. **Technical Block** (12 min) - One skill focus
3. **Water Break** (3 min)
4. **Game-Based Activity** (12 min) - Skill in game context
5. **Water Break** (3 min)
6. **Small-Sided Game** (15 min) - Free play with minimal rules
7. **Cool-Down** (5 min) - Team cheer, positive send-off

## Technique Teaching Approach

1. **Demonstrate** - Quick visual (10 seconds)
2. **Play** - Let them try immediately
3. **Observe** - Watch what happens
4. **Question** - "What did you notice?"
5. **Play Again** - Apply what they discovered

## Remember

They're still discovering if they LIKE this sport. Your job is to make sure they do.`,
    topic: "age-appropriate",
    tags: ["fundamentals", "technique", "foundation", "development"],
    featured: false,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "The Art of the Question: Guided Discovery in Youth Sports",
    description:
      "Learn how to use questions instead of commands to develop thinking athletes. Based on European coaching methodologies.",
      content: `# The Art of the Question: Guided Discovery in Youth Sports

## Why Questions Matter

Traditional coaching often relies on direct instruction: "Do this", "Don't do that", "Move here". While this approach can produce short-term results, it creates players who depend on coaches for every decision.

European academies have pioneered a different approach: **Guided Discovery**. Instead of telling players what to do, coaches ask questions that help players discover solutions themselves.

## The Science Behind It

When players solve problems themselves:
- Neural pathways strengthen through active processing
- Confidence increases (they found the solution)
- Transfer improves (they understand the "why")
- Intrinsic motivation grows (ownership of learning)

## Types of Coaching Questions

### 1. Observation Questions
Help players become aware of what's happening.
- "What did you notice there?"
- "Where was the space?"
- "What happened when you slowed down?"

### 2. Solution Questions
Guide players toward discovering answers.
- "What could you try differently?"
- "How else might you solve this?"
- "What worked last time?"

### 3. Reflection Questions
Encourage self-assessment and learning.
- "How did that feel?"
- "What would you do again?"
- "What was the hardest part?"

## Practical Tips

**Wait for answers.** Silence is uncomfortable, but give players 5-10 seconds to think. Don't answer your own questions.

**Accept wrong answers gracefully.** "Interesting - let's see what happens if you try that." Let players learn from testing their ideas.

**Build on responses.** "You said you needed more space. How might you create it?"

**Keep questions simple.** One question at a time, especially for younger players.

## Age Adaptations

**Ages 6-8:** Use simple, concrete questions. "Where are the sharks?" (defenders). "Can you find the empty space?"

**Ages 9-11:** Introduce tactical questions. "Why did that pass work?" "What makes the defender turn?"

**Ages 12+:** Challenge with complex scenarios. "When would you NOT make that run?" "What's the defender thinking?"

## Remember

The goal isn't to never give instruction. Sometimes direct coaching is appropriate. But if you find yourself telling more than asking, pause and convert your next instruction into a question.

**Instead of:** "Get your head up when you dribble."
**Try:** "What could you see if you looked up while dribbling?"

The best coaching creates players who don't need coaches.`,
    topic: "feedback",
    tags: ["questions", "guided-discovery", "feedback", "european-style"],
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Positive Sandwich vs. Authentic Feedback",
    description:
      "Why the 'positive-negative-positive' approach can backfire, and what works better for youth athletes.",
      content: `# Positive Sandwich vs. Authentic Feedback

## The Positive Sandwich Problem

Many coaches learn to give feedback as a "sandwich":
1. Say something positive
2. Give the correction
3. End with something positive

Example: "Great effort, but you need to keep your head up, and I love your energy!"

Sounds good, right? Here's the problem: **players stop trusting your positive feedback**.

When every correction comes wrapped in compliments, players learn that "great job" really means "here comes the critique." Your genuine praise loses its power.

## What Research Shows

Studies on feedback show:
- Immediate, specific feedback is more effective than delayed, general feedback
- Authenticity matters more than positivity ratio
- Players prefer honest coaches over "nice" coaches
- Growth mindset develops from effort recognition, not empty praise

## Better Approaches

### 1. Separate Your Feedback

Let positive observations stand alone:
- "Nice turn away from pressure there."
- (Later, unrelated moment) "On that last play, check your shoulder before receiving."

### 2. Be Specific

**Vague:** "Good job!"
**Specific:** "You looked over your shoulder before the ball came - that's how you knew where to go."

**Vague:** "You need to communicate more."
**Specific:** "Calling for the ball earlier would help your teammate see you."

### 3. Focus on Process, Not Outcome

**Outcome-based:** "Great goal!" (Player got lucky, defender slipped)
**Process-based:** "Great decision to shoot early before the defender closed down."

**Outcome-based:** "Unlucky miss."
**Process-based:** "Good body shape on that shot - the technique was right."

### 4. Use "AND" Instead of "BUT"

"But" negates everything before it.

**With but:** "You dribbled well, BUT you should have passed earlier."
(Player hears: I should have passed earlier)

**With and:** "You dribbled well, AND passing earlier is something to work on."
(Player hears: Both things are true)

### 5. Make Corrections Forward-Looking

**Backward:** "You shouldn't have passed there."
**Forward:** "Next time, check if the space is there before passing."

## Age Considerations

**Ages 6-8:** Keep feedback mostly positive and about effort. Technical corrections should be minimal and playful.

**Ages 9-11:** Can handle more specific feedback. Still emphasize effort and improvement over mistakes.

**Ages 12+:** Ready for direct, honest feedback. They'll respect you more for it.

## The Bottom Line

Authenticity beats formula. Players know when you're genuine. Give honest praise when deserved, specific corrections when needed, and skip the manufactured positivity sandwich.`,
    topic: "feedback",
    tags: ["feedback", "communication", "positive-coaching", "praise"],
    featured: false,
    active: true,
  },
  {
    stage: "fundamentals",
    resourceType: "article" as const,
    title: "Coaching 6-8 Year Olds: The Fundamentals Stage",
    description:
      "Understanding child development and adapting your coaching for the youngest athletes.",
      content: `# Coaching 6-8 Year Olds: The Fundamentals Stage

## Understanding This Age

Children aged 6-8 are in the "sampling years" - they should be trying many sports and activities. Your job is to make their experience so positive that they want to keep playing, regardless of which sport they ultimately focus on.

### Cognitive Development
- Attention span: 8-15 minutes maximum per activity
- Concrete thinkers: can't process abstract concepts
- Egocentric: difficulty understanding others' perspectives
- Memory: need frequent repetition of instructions

### Physical Development
- Developing fundamental motor skills
- Poor spatial awareness
- Limited hand-eye coordination
- Easily fatigued but recover quickly

### Emotional Development
- Sensitive to criticism
- Need lots of encouragement
- Learn through play, not lecture
- Want to belong and have fun

## Coaching Implications

### Session Design
- **Keep activities to 5-7 minutes max**
- **Minimize time in lines** (everyone has a ball)
- **Use games over drills** (they can't distinguish anyway)
- **Build in movement breaks** (drink water, switch activities)
- **End while they're still having fun** (leave them wanting more)

### Communication
- **One instruction at a time** ("Kick with your laces" - not "kick with your laces and follow through")
- **Use imagery** ("Be a cheetah" not "run fast")
- **Demonstrate don't explain** (show, don't tell)
- **Get on their level** (kneel when talking to them)
- **Names matter** (use their names frequently)

### Feedback
- **Effort over outcome** ("Great try!" even when they miss)
- **5:1 positive ratio** (five encouragements per correction)
- **No sarcasm** (they take everything literally)
- **Celebrate small wins** (touching the ball counts!)

### Common Mistakes to Avoid
- ❌ Stopping play too often to correct
- ❌ Long explanations or tactical talks
- ❌ Expecting focus during water breaks
- ❌ Competition based on ability (they all want to win)
- ❌ Scorekeeping and standings

## What Success Looks Like

At this age, success is NOT:
- Winning games
- Perfect technique
- Understanding formations

Success IS:
- Players excited to come back
- Everyone active and moving
- Smiles and laughter during practice
- Players trying their best
- Nobody standing around
- Basic love for movement and sport

## Sample Session Structure (45-50 min)

1. **Free play arrival (5 min):** Let them touch balls, play with friends
2. **Warmup game (7 min):** Tag or movement game with theme
3. **Ball familiarity (7 min):** Everyone has a ball, simple challenges
4. **Technical game (8 min):** Game that develops one skill
5. **Water break (3 min):** Keep it short, they'll lose focus
6. **Small-sided game (12 min):** 3v3 or 4v4 with modified rules
7. **Cool down (5 min):** Gentle activity, group circle

## Remember

At 6-8, you are not coaching a sport. You are **coaching movement literacy and love of activity**. Technical and tactical development comes later. Right now, make it fun.`,
    topic: "age-appropriate",
    tags: ["fundamentals", "6-8", "development", "fun"],
    featured: true,
    active: true,
  },
  {
    stage: "skill-building",
    resourceType: "article" as const,
    title: "Coaching 9-11 Year Olds: The Skill Building Stage",
    description:
      "How to leverage the 'golden age of learning' for skill development while maintaining enjoyment.",
      content: `# Coaching 9-11 Year Olds: The Skill Building Stage

## The Golden Age of Learning

Ages 9-11 are often called the "golden age" for skill acquisition. Children at this stage can:
- Learn motor skills quickly
- Handle more complex instructions
- Begin understanding basic tactics
- Benefit from repetition without boredom

This is your window to develop technical foundations that will serve them for life.

### Cognitive Development
- Attention span: 15-25 minutes per activity
- Beginning abstract thought
- Can understand cause and effect
- Ready for basic tactical concepts
- Can process 2-3 instructions at once

### Physical Development
- Improved coordination and balance
- Better spatial awareness
- Pre-puberty: similar abilities across genders
- Motor learning at peak sensitivity

### Emotional Development
- Growing social awareness
- Peer relationships matter more
- Beginning self-comparison to others
- Can handle constructive feedback

## Coaching Implications

### Session Design
- **Longer activities possible** (8-12 minutes per activity)
- **Introduce structured repetition** (but still game-like)
- **Challenge with progressions** (make it harder, make it easier)
- **Include small-sided games** (5v5 or 6v6 work well)
- **Add some decision-making** (choices within activities)

### Communication
- **Explain the "why"** (they can understand reasons now)
- **Use tactical vocabulary** (space, support, pressure)
- **Ask questions** (begin guided discovery approach)
- **Let them problem-solve** (give them time to figure it out)
- **Group discussions work** (brief team huddles)

### Technical Development
- **Focus on quality** (technique matters now)
- **Both feet/hands** (develop weak side)
- **Speed with skill** (add time pressure gradually)
- **Movement combinations** (not isolated skills)
- **Match-realistic practice** (skills used as in games)

### Tactical Introduction
- **Simple concepts first** (width, depth, support)
- **Use questions** ("Where is the space?")
- **Let games teach** (they'll discover patterns)
- **Avoid rigid positions** (rotation and experience)
- **Individual tactics before team** (1v1 before 5v5)

## Training Session Structure (60-75 min)

1. **Warmup with ball (10 min):** Technical warmup, ball mastery
2. **Technical block (12 min):** Skill focus with progressions
3. **Tactical activity (12 min):** Small group problem-solving game
4. **Water break (3 min)**
5. **Conditioned game (15 min):** Modified game emphasizing session theme
6. **Free game (15 min):** Uninterrupted play
7. **Cool down/review (5 min):** Quick reflection questions

## Skill Building Priorities

### Technical Focus Areas
- Sport-specific fundamentals at game speed
- Weak foot/hand development
- Receiving and controlling under pressure
- 1v1 attacking and defending
- First touch quality

### Tactical Introduction
- What to do with the ball (immediate options)
- What to do without the ball (movement off ball)
- Basic defensive concepts (pressure, cover)
- Transition awareness (attack to defense, defense to attack)

## Balancing Development and Competition

At this age, there's tension between development and results. Remember:
- **Still about development** (winning is secondary)
- **Equal playing time** (all positions)
- **Rotate positions** (don't specialize)
- **Process over outcome** (celebrate good play regardless of result)

## Signs of Good Coaching

✓ Players trying new skills without fear of failure
✓ Players making decisions without looking at coach
✓ Improvement visible over the season
✓ Players still enjoying practice and games
✓ Players from all ability levels engaged
✓ Questions being asked by players`,
    topic: "age-appropriate",
    tags: ["skill-building", "9-11", "technique", "golden-age"],
    featured: true,
    active: true,
  },
  {
    stage: "development",
    resourceType: "article" as const,
    title: "Coaching 12-14 Year Olds: The Development Stage",
    description:
      "Navigating puberty, growing tactical understanding, and maintaining motivation during the crucial development years.",
      content: `# Coaching 12-14 Year Olds: The Development Stage

## The Challenging Years

Ages 12-14 bring significant changes. Puberty creates uneven development - some players shoot up in height, others mature early in strength. Managing these differences while continuing development requires thoughtful coaching.

### Physical Changes
- Puberty onset varies (11-15 for most)
- Temporary loss of coordination during growth spurts
- Strength and speed develop at different rates
- Gender differences begin to emerge
- Greater injury risk during rapid growth

### Cognitive Development
- Full abstract thinking develops
- Can understand complex tactics
- Capable of self-reflection
- Can analyze performance
- Ready for position-specific learning

### Emotional Development
- Identity formation in progress
- Peer influence at maximum
- Sensitive to embarrassment
- Beginning to question authority
- Need for autonomy growing

## Coaching Implications

### Managing Physical Diversity

Within one team you might have:
- A physically mature player who looks 16
- An early bloomer who's peaked
- A late developer who hasn't started growing

**Critical principle:** Never select or evaluate based on current physical attributes. The late developers often become the best players.

Tips:
- **Adjust training for individuals** (not one-size-fits-all)
- **Monitor growth spurts** (reduce load during rapid growth)
- **Value technique over power** (the fast, strong kid who can't control a ball has no advantage)
- **Praise skill, not size** (recognize technical excellence regardless of physical build)

### Session Design
- **Longer activities** (15-20 minutes possible)
- **More game-like** (80% of practice in game situations)
- **Player input** (let them influence session content)
- **Tactical complexity** (formations, systems, set plays)
- **Position-specific** (beginning specialization - but not complete)

### Communication
- **Treat them as young adults** (respectful, not childish)
- **Explain rationale** (they need to understand why)
- **Accept questions and pushback** (it's healthy)
- **Private corrections preferred** (avoid public embarrassment)
- **Give responsibility** (leadership roles, warmup leads)

### Motivation
- **Autonomy matters** (choice and input)
- **Competence grows** (help them see their improvement)
- **Relatedness counts** (team culture, belonging)
- **Avoid external pressure** (intrinsic motivation is fragile)

## Training Session Structure (75-90 min)

1. **Player-led warmup (10 min):** Give players ownership
2. **Technical development (15 min):** Position-relevant skills
3. **Tactical block (20 min):** Phase of play or game situations
4. **Conditioned games (25 min):** Modified games with focus
5. **Full game (15 min):** Realistic game scenario
6. **Debrief (5 min):** Player-led discussion

## Development Priorities

### Technical Refinement
- Skills at match speed and under pressure
- Position-specific techniques
- Weak foot/hand to 70% of dominant
- Combination play execution
- Set piece execution

### Tactical Development
- Understanding of team system
- Position-specific responsibilities
- Reading the game (anticipation)
- Decision-making under pressure
- Leadership and communication

### Physical Development
- Introduce structured conditioning
- Movement quality and injury prevention
- Speed and agility (appropriate to growth)
- Strength foundations (bodyweight first)

### Psychological Development
- Resilience and dealing with setbacks
- Focus and concentration
- Competitive mindset (healthy competition)
- Self-reflection and goal-setting

## The Dropout Risk

Ages 12-14 see the highest dropout rate in youth sports. Common reasons:
- Not fun anymore
- Too much pressure
- Coach relationships
- Other interests competing
- Early specialization burnout

**Prevention:**
- Keep enjoyment central
- Reduce pressure
- Build genuine relationships
- Allow multi-sport participation
- Value process over outcomes

## Signs of Success

✓ Players want to be there
✓ Improvement visible in all players
✓ Players solve problems independently
✓ Team culture is positive
✓ Players taking leadership
✓ Late developers are thriving`,
    topic: "age-appropriate",
    tags: ["development", "12-14", "puberty", "tactical"],
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Partnering with Parents: Building Trust and Alignment",
    description:
      "How to communicate your development philosophy to parents and get them on board with the journey.",
      content: `# Partnering with Parents: Building Trust and Alignment

## The Parent Challenge

Many parents approach youth sports with good intentions but misguided expectations. They may:
- Overvalue winning and outcomes
- Compare their child to more developed peers
- Provide well-meaning but counterproductive feedback
- Focus on playing time over development
- Project their own sports dreams onto their child

Your job is to **educate and align** parents with a development-focused philosophy.

## Start with Transparency

### Pre-Season Meeting
Hold a mandatory pre-season meeting to establish expectations:

1. **Your philosophy** (development over winning)
2. **What practices look like** (play-based, age-appropriate)
3. **Playing time expectations** (equal at young ages)
4. **Your communication approach** (how and when you're available)
5. **Their role** (support, not coach)

### Provide Resources
Share documents on:
- Age-appropriate development
- What to say (and not say) on the ride home
- How to watch games supportively
- Signs of burnout to watch for

## Ongoing Communication

### Regular Updates
- Weekly email with practice themes and what you worked on
- Monthly development focuses
- Positive highlights (rotate through all players)

### Progress Conversations
- Schedule 1-2 individual player conversations per season
- Focus on development, not outcomes
- Include the player when appropriate (ages 10+)

### Game Day Guidance
Before games, remind parents:
- "We're working on [specific focus]. Look for players trying this."
- "Today's success is effort and teamwork, regardless of score."
- "Let them play - no coaching from the sidelines."

## Handling Difficult Conversations

### "My child isn't playing enough"
"I understand your concern. At this age, equal participation is how players develop. [Child] is getting the same opportunity as everyone else, and I'm seeing growth in [specific area]."

### "Why aren't we trying to win?"
"Winning is fun, and we're not trying to lose. But research shows that focusing on development produces better players AND more winning in the long run. Short-term results can hide long-term problems."

### "My child is better than others"
"[Child] is doing well in [specific area]. At this age, physical maturity can mask technical gaps. I'm focused on making sure [Child] has the skills needed for the next level, which sometimes means working on weaknesses."

### "I disagree with your coaching"
"I'm happy to explain my approach. Can we set up a time to talk this week? I want you to understand why I'm doing what I'm doing."

## Setting Boundaries

### Sideline Behavior
Be clear about expectations:
- Cheering for effort: ✓
- Coaching from sidelines: ✗
- Criticizing referees: ✗
- Negative comments about players: ✗

### The 24-Hour Rule
Establish a cooling-off period for post-game discussions. Emotions run high; decisions are made better with perspective.

### What You Won't Discuss
- Other players
- Playing time comparisons
- Team selection decisions
- In-game tactical decisions

## The Ride Home

Share research on "The Car Ride Home":
- Ask: "Did you have fun?"
- Ask: "What did you enjoy most?"
- Avoid: Analysis of performance
- Avoid: What they did wrong
- Avoid: What coach should have done

Players whose parents say "I love watching you play" report higher enjoyment and stay in sports longer.

## Converting Skeptics

Some parents take time to buy in. Strategies:
- Invite them to watch practice (see your methods)
- Share player improvement stories
- Connect them with aligned parents
- Be patient - results over time win them over

## Remember

Parents want what's best for their child. When they trust that you do too, most difficulties dissolve. Build that trust through consistent communication, visible care for players, and genuine expertise.`,
    topic: "parent-communication",
    tags: ["parents", "communication", "alignment", "philosophy"],
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "The Post-Game Conversation: What Parents Should Say",
    description:
      "Research-backed guidance on how parents can support their child athlete after competition.",
      content: `# The Post-Game Conversation: What Parents Should Say

## The Most Important Six Words

Research by Bruce Brown and Rob Miller surveyed hundreds of college athletes about their youth sports experiences. The most impactful thing parents can say?

**"I love watching you play."**

That's it. Not advice. Not analysis. Just unconditional enjoyment of seeing their child compete.

## What Athletes Don't Want to Hear

The same research revealed what caused the most negative memories:
- Criticism of their performance
- Criticism of the coach
- Criticism of teammates
- Analysis of what they should have done
- Comparisons to other players

## The Optimal Post-Game Conversation

### Immediately After the Game
**Say:** "Did you have fun?"
**Purpose:** Reinforces that enjoyment matters most

**Say:** "Are you hungry/thirsty?"
**Purpose:** Takes care of their physical needs, changes focus

**Say:** "I'm proud of how hard you worked out there."
**Purpose:** Reinforces effort over outcome

### Later (If They Want to Talk)
Let the child lead. If they want to discuss the game, ask open-ended questions:
- "What was your favorite moment?"
- "What do you want to work on for next time?"
- "How did the team do together?"

### What to Avoid
- Detailed analysis of their play
- Comparison to other players
- "Constructive" criticism
- Questions about the coach's decisions
- Your disappointment (even if hidden)

## Why This Matters

### Performance Anxiety
When children expect post-game criticism, they develop performance anxiety. They play not to fail rather than playing to succeed.

### Intrinsic Motivation
Children who receive unconditional support maintain love for the sport longer. Those whose parental approval seems conditional on performance often burn out or quit.

### Parent-Child Relationship
Sports should enhance the parent-child bond, not strain it. When games are followed by criticism, children associate the sport with negative emotions.

## Common Parent Mistakes

### "I'm just trying to help them improve"
**Reality:** Improvement happens at practice with coaches. The car ride home isn't coaching time.

### "They need to hear tough feedback"
**Reality:** They get plenty of feedback at practice. They need unconditional support at home.

### "I played at a high level and know what they need"
**Reality:** Your expertise doesn't change their emotional needs. Your role now is parent, not coach.

### "They seemed upset, I wanted to explain what went wrong"
**Reality:** Let them process. Being a listening ear beats being an analyst.

## The Exception

If your child asks for your feedback or analysis, you can provide it thoughtfully:
- Ask permission: "Do you want my thoughts, or do you just want to vent?"
- Start positive: What they did well
- Be specific and actionable: One thing to work on
- End supportive: Express confidence in them

## For Coaches: Help Parents Succeed

Share this guidance with parents:
- Pre-season meeting discussion
- Handout for game day
- Reminder in weekly emails

Parents want to do right by their kids. Many just don't know what that looks like.

## Final Thought

Children have the rest of their lives to analyze, strategize, and optimize. For now, they need to feel loved unconditionally while they play a game.

**"I love watching you play."**`,
    topic: "parent-communication",
    tags: ["parents", "post-game", "car-ride", "emotional-support"],
    featured: false,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Long-Term Athletic Development: The European Model",
    description:
      "Understanding the LTAD framework and how European academies develop elite athletes over decades, not seasons.",
      content: `# Long-Term Athletic Development: The European Model

## The Fundamental Shift

American youth sports often operate on a **"win now"** model:
- Early specialization
- Year-round single-sport training
- Best players get most playing time
- Selection based on current ability
- Results-focused evaluation

European academies operate on a **"develop for later"** model:
- Multi-sport foundation
- Phased development over decades
- Equal development opportunities
- Selection based on potential
- Process-focused evaluation

## The LTAD Framework

Long-Term Athletic Development (LTAD) structures development into phases:

### 1. Active Start (Ages 0-6)
- Fundamental movement (run, jump, throw, catch)
- Play-based learning
- Multiple activities
- **Goal:** Love of movement

### 2. FUNdamentals (Ages 6-9)
- Basic sport skills across many sports
- ABC's of athleticism (Agility, Balance, Coordination, Speed)
- Minimal competition focus
- **Goal:** Movement literacy

### 3. Learn to Train (Ages 9-12)
- Sport-specific skill development
- "Golden age" of motor learning
- Still multi-sport recommended
- **Goal:** Technical foundation

### 4. Train to Train (Ages 12-16)
- Building the "engine"
- Increasing training volume
- Beginning specialization (late in phase)
- **Goal:** Physical and tactical capacity

### 5. Train to Compete (Ages 16-18)
- Competition-specific training
- Position specialization
- Periodization introduction
- **Goal:** Competition readiness

### 6. Train to Win (Ages 18+)
- Elite performance focus
- Full-time training
- Peak performance management
- **Goal:** Winning

## Why America Gets It Wrong

### Early Specialization
American youth often specialize by age 8-10. Research shows:
- Higher injury rates
- Earlier burnout
- Narrower athletic base
- Lower peak performance ceiling

### Selection Based on Maturity
America selects "best" players young, often based on physical maturity. Early developers dominate youth sports but plateau. Late developers, passed over, often have more long-term potential.

### Year-Round Single-Sport
Playing one sport year-round creates:
- Overuse injuries
- Skill imbalances
- Mental fatigue
- Social isolation from broader peer groups

## The European Approach

### Multi-Sport Foundation
Ajax Academy in Amsterdam requires young players to play other sports. Barcelona's La Masia has players do gymnastics and swimming. This builds complete athletes.

### Development Over Results
German youth football banned standings and league tables for under-11s. Development happens when pressure is removed.

### Late Selection
European academies delay selection decisions. They know the 12-year-old who's behind physically might be the 18-year-old with the best skills.

### Training Quality Over Quantity
More is not better. European academies focus on deliberate practice quality, not just hours.

## Practical Applications

### For Coaches
- Encourage multi-sport participation
- Don't over-train (more rest, less drilling)
- Focus on skill quality over game results
- Give late developers time and opportunity
- Celebrate improvement, not just current ability

### For Parents
- Resist pressure to specialize early
- Value development over trophies
- Support participation in multiple sports
- Trust the long-term process
- Avoid "scholarship" thinking at young ages

### For Organizations
- Delay competitive selections
- Remove or minimize standings for young ages
- Train coaches in development philosophy
- Evaluate on development metrics, not just wins
- Partner with other sports programs

## The Payoff

Countries using LTAD frameworks (Germany, Belgium, France) have seen:
- Increased player pools at elite levels
- Lower youth dropout rates
- Fewer overuse injuries
- More creative, well-rounded players
- Better long-term competitive success

## Remember

The goal is not to produce the best 10-year-old. The goal is to produce the best 25-year-old. Every decision should serve that end.`,
    topic: "development",
    tags: ["LTAD", "development", "european", "long-term"],
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Recognizing Burnout: When to Pull Back",
    description:
      "Signs of athlete burnout and how coaches can create sustainable development environments.",
      content: `# Recognizing Burnout: When to Pull Back

## What Is Burnout?

Burnout is a state of physical and emotional exhaustion resulting from prolonged stress. In youth athletes, it manifests as:
- Decreased enjoyment
- Reduced sense of accomplishment
- Emotional and physical exhaustion
- Often leads to dropout from sport

## Warning Signs

### Behavioral Changes
- Arriving late or making excuses to miss practice
- Reduced effort during training
- Increased conflicts with teammates or coaches
- Isolation from team activities
- Talking negatively about the sport they used to love

### Physical Signs
- Chronic fatigue not explained by physical load
- Frequent minor illnesses
- Lingering injuries that don't heal
- Decreased performance despite training
- Sleep problems

### Emotional Signs
- Mood changes (irritability, sadness)
- Anxiety about training or competition
- Loss of confidence
- Feelings of being trapped
- Pressure feels overwhelming

## Risk Factors

### Training Load
- Year-round single-sport participation
- Excessive training hours
- Inadequate recovery time
- Playing on multiple teams simultaneously

### Environment
- Win-at-all-costs culture
- Excessive parental pressure
- Fear-based coaching
- Social isolation from non-sport peers
- Early specialization

### Individual
- Perfectionism
- High need for external validation
- Poor coping skills
- Lack of autonomy
- Sport-only identity

## Prevention Strategies

### Training Design
- Build in rest periods (off-season matters)
- Vary activities to prevent monotony
- Balance challenge with achievable success
- Include player input in training design

### Culture
- Celebrate effort, not just outcomes
- Foster intrinsic motivation
- Create positive social environment
- Support multi-sport participation
- Model healthy work-life balance

### Communication
- Regular check-ins on how players are feeling
- Open door for concerns
- Notice and address changes in behavior
- Involve parents in wellness monitoring

## When You See Signs

### Immediate Actions
1. **Talk privately** - Express concern without judgment
2. **Listen more than speak** - Understand their experience
3. **Reduce load** - Decrease training temporarily
4. **Connect with parents** - Align on approach

### Medium-Term Actions
- Take a break from competition
- Encourage other activities
- Consider professional support if needed
- Re-evaluate development path

### Long-Term Actions
- Examine and adjust team culture
- Reduce unnecessary pressure sources
- Build sustainable training models
- Create systems for early detection

## The Larger Issue

Burnout is often a symptom of systemic problems:
- Youth sports that mirror professional models
- Adults' dreams projected onto children
- Pressure to specialize for scholarships
- Fear of falling behind peers

Coaches can only do so much. But modeling healthy approaches and protecting player welfare is within your control.

## Remember

The child who burns out at 12 will never become the elite athlete at 22. Sustainability beats intensity. Fun drives longevity. The sport should enrich their life, not consume it.

If you're unsure, ask: "Will this child still love this sport in 5 years?" If the answer isn't a clear yes, something needs to change.`,
    topic: "welfare",
    tags: ["burnout", "welfare", "prevention", "sustainability"],
    featured: false,
    active: true,
  },
  {
    sport: "hockey",
    resourceType: "article" as const,
    title: "The Cross-Ice Model: Why Small Ice Develops Better Players",
    description:
      "How USA Hockey's American Development Model uses station-based practices and cross-ice small-area games to build more touches, more decisions, and more confident players.",
      content: `# The Cross-Ice Model: Why Small Ice Develops Better Players

## The Problem With Full Ice

Put a group of 6-to-10-year-olds on a full sheet of ice and most of them spend the practice watching, not playing. Full-ice 5v5 was built for adults with adult skating speed and adult ice coverage - youth players simply can't fill the space.

## The USA Hockey ADM Answer

USA Hockey's American Development Model (ADM) restructures youth practice around two ideas:

1. **Stations, not one big drill.** 8U practices run as rotating stations, 8-10 minutes each, so every player is always working - not standing in a line waiting for a turn.
2. **Cross-ice games, not full-ice scrimmages.** 8U finishes stations with cross-ice 4v4 using intermediate nets. 6U plays 3v3 with mini nets and no goalies.

Across an 8U practice, the mix is roughly 70% individual skills, 20% small-area games, 10% team tactics (admkids.com; usahockey.com/news_article/show/1072320; the 8U basic structure guide at portal.usahockey.com).

## Why It Works: The Shot-Attempt Numbers

An IIHF-hosted study of small-area games in Sweden and Finland found that players in small-ice formats took **up to 5 times more shot attempts** than players in full-ice 5v5 games over the same time period. More shots mean more reps, more decisions, and more chances to build confidence with the puck.

Sweden takes this far enough to ban checking until age 14, prioritizing skill development over physical play in the years that matter most for skill acquisition.

## Hockey Canada Agrees

Hockey Canada's U11 seasonal structure mirrors the same philosophy: roughly 85% skills-and-tactics work to 15% team play, with a typical week built around one skills session, one small-area-games session, and one game.

## What This Means for Your Practices

- Run 8U practices as stations (8-10 minutes each) ending in cross-ice 4v4 with intermediate nets.
- Run 6U practices as 3v3 with mini nets and no goalies - let everyone touch the puck constantly.
- Favor small-area games over full-ice scrimmage time whenever the goal is skill development, not just game simulation.
- Don't mistake "more ice" for "more development" - the data says the opposite.

## Remember

A cramped, chaotic-looking cross-ice game is producing more touches, more decisions, and more shots than a tidy full-ice scrimmage. Small ice isn't a compromise for young players - it's the better development environment.`,
    topic: "methodology",
    tags: ["hockey", "cross-ice", "adm", "small-area-games"],
    source: "USA Hockey ADM / IIHF",
    featured: true,
    active: true,
  },
  {
    sport: "baseball",
    resourceType: "article" as const,
    title: "Throw, Catch, Run, Hit: Teaching USA Baseball's Core Motor Competencies",
    description:
      "USA Baseball's Long-Term Athletic Development core motor competencies for ages 6-8, our teaching sequence for them, and why keeping rules minimal and equipment tee-first matters more than early hitting reps.",
      content: `# Throw, Catch, Run, Hit: Teaching USA Baseball's Core Motor Competencies

## The Four Core Competencies

USA Baseball's Long-Term Athletic Development (LTAD) guidance for ages 6-8 identifies four core motor competencies, taught through play rather than lecture:

- **Throwing**
- **Catching**
- **Running**
- **Hitting**

USA Baseball frames these as an unordered set, not a ranking. Our own teaching sequence below - throw, then catch, then run, then hit - is an editorial choice, not something the federation specifies: throwing and catching are foundational, multi-sport movement patterns that transfer everywhere, and most practice time gets eaten by hitting reps if a coach isn't deliberate about protecting the other three.

## Keep the Rules Minimal

At 6-8, USA Baseball's guidance is to strip the rulebook down to what's actually needed to play:

- Which base to run to
- Where to stand
- What counts as an out

Everything past that - infield fly rules, force plays versus tag plays, lead-off strategy - is noise at this age. Time spent explaining rules is time not spent throwing, catching, running, and hitting.

## Equipment: Tee First

Progress equipment in a sequence that matches development, not the calendar:

1. **Tee work** - isolates the swing mechanics without timing pressure
2. **Soft toss** - introduces timing in a controlled, predictable way
3. **Live or coach-pitch** - only once tee and soft-toss mechanics are solid

Rushing to live pitching before mechanics are set builds bad habits that are hard to unlearn later.

## Multi-Sport, Station-Based

USA Baseball's LTAD explicitly champions multi-sport participation at this age and recommends station-based practice structures, similar to what's now standard in hockey's ADM model - rotate small groups through throw/catch, fielding, and hitting stations rather than running one line drill for the whole team.

## Remember

At 6-8, the goal isn't a polished batting stance. It's a kid who can throw accurately, catch confidently, run the right way, and is starting to understand where the ball needs to go. Hitting comes together faster once those foundations are solid.`,
    topic: "development",
    tags: ["baseball", "ltad", "fundamentals", "tee-ball"],
    source: "USA Baseball LTAD",
    featured: true,
    active: true,
  },
  {
    resourceType: "article" as const,
    title: "Assessment Calibration: What a 2, a 3, and a 4 Actually Look Like",
    description:
      "A worked-example guide to reading a skill's progression levels and observable behaviors consistently, comparing a player to their own past ratings, and knowing when to co-assess with a lead coach.",
    content: `# Assessment Calibration: What a 2, a 3, and a 4 Actually Look Like

## Why calibration matters

A "2" you give one player and a "2" a different coach gives another player
should mean the same thing. Assessment ratings only mean something to
parents and to the platform's development report if coaches read them the
same way.

## Read the rubric, don't guess from memory

Every skill's assessment page (\`/coach/assess/[playerId]\`) shows that
skill's **progression level descriptions** (what levels 1 through 5 mean for
this specific skill) and its **observable behaviors** (concrete things you
should be able to see, not impressions). Read both before you rate — don't
rely on a general sense of "pretty good" or "needs work."

## A worked example

Take a generic technical skill with this progression shape:

- **1 (Emerging):** Attempts the skill but rarely completes it under any
  pressure.
- **2 (Developing):** Completes the skill in isolation (no pressure, no
  decision) most of the time; breaks down under any opposition or time
  pressure.
- **3 (Competent):** Completes the skill reliably in small-sided game
  situations with light pressure; occasional breakdown under full pressure.
- **4 (Proficient):** Completes the skill under game-realistic pressure and
  starts making it look easy; can vary it (weak foot/hand, different angle).
- **5 (Advanced):** Executes under pressure with disguise, speed, or
  creativity beyond what's coached — this is rare at youth levels and should
  be rare in your ratings too.

The line between a 2 and a 3 is **pressure and context**, not repetition
count. A player who can do a move 20 times against a cone but freezes the
first time a defender closes is a 2, not a 3 — no matter how clean the
cone-only rep looked.

## Compare the player to themselves, not to teammates

Ratings track individual development over time, not a leaderboard. A player
who moved from a 1 to a 2 this month made real progress and should be
recognized for it, even if a teammate is already a 4. Never let "where does
this player rank against the team" creep into the number — that's what
turns assessment into judgment instead of development tracking.

## When to co-assess with a lead coach

If you're new to assessing, or a rating feels genuinely borderline (a strong
2 vs. a weak 3, especially), assess your first few sessions alongside a lead
coach or your assigned mentor and compare notes before finalizing. This is
exactly what the "Shadow session confirmed" onboarding step is for — use
that session to calibrate ratings together, not just to observe practice
delivery.

## Remember

The goal isn't a precise science — it's consistency. A parent reading "3,
stable trend" for two different children coached by two different people
should be able to trust that those 3s mean roughly the same thing.`,
    topic: "assessment-calibration",
    tags: ["assessment", "calibration", "onboarding", "rubric"],
    featured: false,
    active: true,
  },
];

export const COACHING_PRINCIPLES: Record<string, unknown>[] = [
  {
    title: "Questions Over Instructions",
    principle: "Guide players to discover solutions rather than telling them what to do.",
    explanation:
      "When players figure things out themselves, they understand more deeply and retain longer. This approach builds problem-solvers and creative thinkers.",
    doExamples: [
      "Ask 'What do you see?' instead of 'Look left!'",
      "Ask 'What happened there?' instead of 'You should have passed!'",
      "Let players try solutions before correcting",
      "Praise the thinking process, not just correct answers",
    ],
    dontExamples: [
      "Give step-by-step instructions for every situation",
      "Stop play constantly to correct mistakes",
      "Tell players exactly what to do in games",
      "Praise only correct outcomes",
    ],
    europeanInsight:
      "German coaching methodology emphasizes 'guided discovery' where coaches ask questions that lead players to understand concepts themselves.",
    sortOrder: 2,
    active: true,
  },
  {
    title: "Game-Based Learning",
    principle: "Learn skills in game-like contexts, not isolated drills.",
    explanation:
      "Players develop faster when skills are practiced in situations that mirror real games. Isolated drills create 'practice players' who can't transfer skills to competition.",
    doExamples: [
      "Use small-sided games as the primary teaching tool",
      "Add decision-making elements to every drill",
      "Create game situations in practice activities",
      "Let players experience why a skill matters",
    ],
    dontExamples: [
      "Run lines of players taking turns at drills",
      "Practice skills without any opposition",
      "Spend entire practices on technique without games",
      "Separate 'skill work' from 'game play'",
    ],
    europeanInsight:
      "Spanish academies use 'rondos' (keep-away games) because they teach passing, receiving, and decision-making all at once in a game context.",
    sortOrder: 3,
    active: true,
  },
  {
    title: "Psychological Safety",
    principle: "Create an environment where players feel safe to make mistakes and take risks.",
    explanation:
      "Learning requires mistakes. Players who fear failure play cautiously, avoid risks, and develop more slowly. The best learning environments celebrate creative attempts.",
    doExamples: [
      "Celebrate players who try new things (even if they fail)",
      "Share your own mistakes as a coach",
      "Use failure as a teaching moment without criticism",
      "Praise effort and creativity, not just success",
    ],
    dontExamples: [
      "Show frustration when players make mistakes",
      "Single out errors in front of the team",
      "Pull players for making mistakes in games",
      "Create pressure situations for young players",
    ],
    europeanInsight:
      "Dutch academies have a saying: 'The player who makes no mistakes makes nothing.' Creative players need permission to fail.",
    sortOrder: 4,
    active: true,
  },
  {
    title: "Individual Development Paths",
    principle: "Every player develops at their own pace and in their own way.",
    explanation:
      "Development is not linear. Early developers often plateau while late developers catch up. Comparing players to each other ignores natural development variation.",
    doExamples: [
      "Track individual progress, not peer comparisons",
      "Set personalized goals for each player",
      "Recognize different learning styles",
      "Be patient with late developers",
    ],
    dontExamples: [
      "Rank players against each other",
      "Cut late-developing players",
      "Apply same standards regardless of relative age",
      "Assume current ability predicts future potential",
    ],
    europeanInsight:
      "FC Barcelona considers birthdates when evaluating players—a January-born 8-year-old has up to 12 months more development than a December-born teammate.",
    sortOrder: 5,
    active: true,
  },
  {
    title: "Development Over Winning",
    principle:
      "Prioritize individual player development over team results. A successful season is measured by player improvement and enjoyment, not win-loss record.",
    explanation:
      "Youth sports exist to develop people, not to produce trophies. Research shows that development-focused programs produce better players AND more long-term success than win-focused programs.",
    doExamples: [
      "Celebrate improvement regardless of game outcome",
      "Give equal playing time at young ages",
      "Focus practice on skill development, not just game tactics",
      "Ask 'Are players getting better?' not 'Are we winning?'",
    ],
    dontExamples: [
      "Reduce playing time for weaker players",
      "Skip skill work to practice set plays",
      "Judge success solely by standings",
      "Prioritize winning over player welfare",
    ],
    europeanInsight:
      "German youth football banned league standings for under-11s. This removed win pressure and increased development focus. Participation and skill development increased.",
    sortOrder: 1,
    active: true,
  },
  {
    title: "Ask, Don't Tell",
    principle:
      "Use questions to guide player learning rather than giving direct commands. Players who discover solutions develop deeper understanding.",
    explanation:
      "The European coaching approach uses guided discovery. When coaches ask questions instead of giving answers, players develop problem-solving skills and retain learning better.",
    doExamples: [
      "Ask 'What did you see?' after a play",
      "Ask 'What could you try differently?'",
      "Let players experiment before correcting",
      "Guide with 'What if...' questions",
    ],
    dontExamples: [
      "Give constant play-by-play instructions",
      "Answer your own questions immediately",
      "Correct every mistake as it happens",
      "Lecture during water breaks",
    ],
    europeanInsight:
      "Dutch coaching philosophy emphasizes 'coaching without a whistle' - letting the game teach and using questions to prompt reflection rather than stopping play to instruct.",
    sortOrder: 2,
    active: true,
  },
  {
    title: "Play is the Teacher",
    principle:
      "Games and play-based activities develop skills more effectively than isolated drills. The best learning happens within game contexts.",
    explanation:
      "Skills learned in isolation don't transfer well to games. Skills learned in game-like situations transfer directly. Additionally, play is intrinsically motivating while drills are not.",
    doExamples: [
      "Use small-sided games as primary teaching tool",
      "Design activities that look like the game",
      "Keep players playing, not waiting in lines",
      "Adjust games to emphasize target skills",
    ],
    dontExamples: [
      "Run drills for half of practice",
      "Have players standing in lines",
      "Practice skills without opposition",
      "Separate technical work from tactical work",
    ],
    europeanInsight:
      "Barcelona's La Masia uses 'rondos' (keep-away games) as the foundation of technical training. Game-like pressure creates game-ready skills.",
    sortOrder: 3,
    active: true,
  },
  {
    stage: "fundamentals",
    title: "Fun is Non-Negotiable",
    principle:
      "At ages 6-8, every session must be fun first. If players aren't enjoying themselves, nothing else matters - you'll lose them before skills develop.",
    explanation:
      "Children at this age are sampling activities. They'll continue with what's enjoyable and drop what isn't. Your job is to make them fall in love with the sport.",
    doExamples: [
      "Observe faces - are they smiling?",
      "Use games and competitions they find exciting",
      "Include silly elements and celebrations",
      "End on a high note, leaving them wanting more",
    ],
    dontExamples: [
      "Prioritize technical perfection over engagement",
      "Run serious, adult-like training sessions",
      "Spend time on tactics or formations",
      "Criticize performance in front of peers",
    ],
    europeanInsight:
      "Ajax Amsterdam's youth philosophy states: 'If a child isn't enjoying it, we're doing something wrong.' Fun is considered a prerequisite for development, not a distraction from it.",
    sortOrder: 10,
    active: true,
  },
  {
    stage: "fundamentals",
    title: "Movement First",
    principle:
      "Focus on general movement literacy (running, jumping, throwing, catching, balancing) before sport-specific skills. Athletic foundations transfer across all sports.",
    explanation:
      "The best athletes have broad movement vocabularies. Early years should develop coordination, agility, balance, and spatial awareness through varied movements.",
    doExamples: [
      "Include activities from other sports",
      "Use animal movements and crawling patterns",
      "Incorporate jumping, hopping, skipping",
      "Challenge balance in fun ways",
    ],
    dontExamples: [
      "Focus exclusively on sport-specific skills",
      "Neglect non-ball activities",
      "Assume movement skills are already developed",
      "Skip warmups that build coordination",
    ],
    europeanInsight:
      "German sport schools teach 'ABC's of Athleticism' (Agility, Balance, Coordination, Speed) across multiple sports before any specialization occurs.",
    sortOrder: 11,
    active: true,
  },
  {
    stage: "fundamentals",
    title: "Every Ball, Every Player",
    principle:
      "Maximize touches and minimize waiting. Every player should have a ball whenever possible. Lines and waiting kill learning.",
    explanation:
      "Skill development requires repetition. Waiting in lines means missed repetitions. Young players also lose focus when passive.",
    doExamples: [
      "Provide enough equipment for all players",
      "Design activities where everyone moves simultaneously",
      "Use multiple small groups over one large group",
      "Keep ball-to-player ratio high",
    ],
    dontExamples: [
      "Have half the team watching",
      "Run passing lines with waiting",
      "Share balls between many players",
      "Use activities with long inactive periods",
    ],
    europeanInsight:
      "Spanish youth academies use 'technical circuits' where all players work simultaneously on different stations, rotating frequently to maintain engagement and maximize touches.",
    sortOrder: 12,
    active: true,
  },
  {
    stage: "skill-building",
    title: "The Golden Age",
    principle:
      "Ages 9-11 are the peak years for motor skill acquisition. Use this window to develop technical foundations that will last a lifetime.",
    explanation:
      "Neurological research shows this age has exceptional capacity for learning complex motor skills. Skills developed now become automatic; those missed are harder to develop later.",
    doExamples: [
      "Focus practice time on technique",
      "Develop both sides (weak hand/foot)",
      "Add complexity gradually",
      "Repeat skills in varied contexts",
    ],
    dontExamples: [
      "Skip technical work for tactics",
      "Only use dominant hand/foot",
      "Allow sloppy technique for results",
      "Reduce skill work as season progresses",
    ],
    europeanInsight:
      "Ajax identifies 'moments of learning' at each age. For ages 9-11, technical excellence is the primary focus, knowing that tactical understanding develops more readily later.",
    sortOrder: 20,
    active: true,
  },
  {
    stage: "skill-building",
    title: "Challenge with Care",
    principle:
      "Players this age can handle more challenge and repetition than younger players, but still need success to stay motivated. Find the sweet spot.",
    explanation:
      "The zone of proximal development - challenging enough to grow, achievable enough to succeed. Too easy breeds boredom; too hard breeds frustration.",
    doExamples: [
      "Use progressions that increase difficulty",
      "Provide variations for different ability levels",
      "Celebrate effort when tasks are hard",
      "Adjust on the fly based on success rate",
    ],
    dontExamples: [
      "Give everyone the same challenge",
      "Push past frustration point",
      "Keep activities too easy for too long",
      "Ignore struggling players",
    ],
    europeanInsight:
      "Belgian youth development emphasizes 'individual development plans' where training is customized to each player's current ability and growth areas.",
    sortOrder: 21,
    active: true,
  },
  {
    stage: "development",
    title: "Manage the Transition",
    principle:
      "Puberty creates temporary skill regression as bodies change. Be patient with awkward phases and focus on maintaining enjoyment through physical transition.",
    explanation:
      "Players who grew 4 inches may temporarily lose coordination. Previously coordinated players may struggle. This is normal and temporary.",
    doExamples: [
      "Recognize growth-related changes",
      "Reduce physical load during growth spurts",
      "Focus on technique maintenance not perfection",
      "Provide encouragement through awkward phases",
    ],
    dontExamples: [
      "Judge current ability as permanent",
      "Push through overuse injuries",
      "Compare to peers at different maturity",
      "Increase pressure during difficult transitions",
    ],
    europeanInsight:
      "French Football Federation tracks biological age separately from chronological age, adjusting training loads and expectations based on physical development, not birth year.",
    sortOrder: 30,
    active: true,
  },
  {
    stage: "development",
    title: "Build Thinking Players",
    principle:
      "Players 12-14 can understand complex tactics. Develop their game intelligence through questions, film, and tactical challenges, not just instructions.",
    explanation:
      "Abstract thinking develops in this phase. Players can now understand why, not just what. Use this capacity to develop decision-makers.",
    doExamples: [
      "Discuss tactical scenarios",
      "Ask 'Why did that work?'",
      "Give decision-making responsibility",
      "Use video analysis together",
    ],
    dontExamples: [
      "Give all tactical instructions",
      "Dictate every decision from sideline",
      "Remove all player autonomy",
      "Ignore their tactical suggestions",
    ],
    europeanInsight:
      "Dutch academies create 'street football players' - intelligent, creative players who can solve problems independently rather than dependent on coach direction.",
    sortOrder: 31,
    active: true,
  },
  {
    stage: "development",
    title: "Autonomy and Ownership",
    principle:
      "Give players voice and choice. Involve them in goal-setting, activity selection, and team culture. Autonomy builds intrinsic motivation.",
    explanation:
      "Self-determination theory shows autonomy is a core human need. Players who feel ownership over their development are more motivated and resilient.",
    doExamples: [
      "Let players lead warmups",
      "Ask for activity preferences",
      "Involve in team goal-setting",
      "Give leadership opportunities",
    ],
    dontExamples: [
      "Control every aspect of training",
      "Ignore player input",
      "Use fear or punishment as motivation",
      "Treat players as passive recipients",
    ],
    europeanInsight:
      "German youth programs have 'player councils' where athletes contribute to team decisions, building leadership and investment in the team's success.",
    sortOrder: 32,
    active: true,
  },
  {
    sport: "soccer",
    title: "Small-Sided is Superior",
    principle:
      "Use small-sided games (3v3 to 7v7) for development. They produce more touches, more decisions, and more scoring opportunities than full-field games.",
    explanation:
      "Research shows small-sided games (SSG) create 200-500% more skill execution opportunities than 11v11. They're also more age-appropriate for young players.",
    doExamples: [
      "Use 3v3 for 6-8 year olds",
      "Use 5v5 to 7v7 for 9-12 year olds",
      "Multiple small games over one big game",
      "Adjust field size to player age",
    ],
    dontExamples: [
      "Play 11v11 with young players",
      "Use adult-sized goals and fields",
      "Have half the team as subs watching",
      "Prioritize positions over play",
    ],
    europeanInsight:
      "All major European leagues mandate small-sided games for youth. The English FA requires 5v5 until U10, 7v7 until U12, 9v9 until U14.",
    sortOrder: 100,
    active: true,
  },
  {
    sport: "soccer",
    stage: "fundamentals",
    title: "Ball Mastery First",
    principle:
      "Individual ball work (touches, control, moves) is the foundation. Every practice should include dedicated ball mastery time with one ball per player.",
    explanation:
      "Technical excellence starts with comfort on the ball. European academies spend years developing individual technique before tactical complexity.",
    doExamples: [
      "Start each session with ball mastery",
      "One ball per player minimum",
      "All surfaces (laces, inside, sole, outside)",
      "Both feet development",
    ],
    dontExamples: [
      "Skip individual work for team drills",
      "Share balls between players",
      "Only use dominant foot",
      "Rush to passing/shooting activities",
    ],
    europeanInsight:
      "Brazilian futsal produces some of the world's most technically skilled players because youth spend years in small spaces with constant ball contact.",
    sortOrder: 101,
    active: true,
  },
  {
    sport: "basketball",
    title: "Lower the Hoop",
    principle:
      "Use age-appropriate equipment. Lower hoops, smaller balls, and shorter courts develop proper mechanics that transfer to regulation equipment later.",
    explanation:
      "Players shooting at 10-foot hoops with regulation balls must use improper form to generate enough power. This creates habits that are difficult to correct.",
    doExamples: [
      "8-foot hoops for ages 6-8",
      "9-foot hoops for ages 9-11",
      "Size appropriate balls (27.5 inch for youth)",
      "Shorter free throw distance",
    ],
    dontExamples: [
      "Use 10-foot hoops for young players",
      "Expect range before strength develops",
      "Allow 'heaving' shot form",
      "Prioritize makes over mechanics",
    ],
    europeanInsight:
      "European basketball federations mandate lower hoops and smaller balls for youth. This is why European shooting mechanics are often considered superior.",
    sortOrder: 110,
    active: true,
  },
  {
    sport: "basketball",
    stage: "fundamentals",
    title: "Handle Before Shoot",
    principle:
      "Ball handling and court awareness come before shooting. Players who can control the ball and see the court become complete players; pure shooters are limited.",
    explanation:
      "Every player should be able to handle, pass, and make decisions. Early positional specialization limits development.",
    doExamples: [
      "All players practice ball handling",
      "Include court vision in dribbling work",
      "Teach all players to pass under pressure",
      "Rotate positions regardless of size",
    ],
    dontExamples: [
      "Specialize positions based on size",
      "Let tall players skip ball handling",
      "Only post players in the low block",
      "Point guard only handles the ball",
    ],
    europeanInsight:
      "European basketball produces 'positionless' players who can handle, pass, and shoot regardless of size. This is why European players adapt well to modern NBA styles.",
    sortOrder: 111,
    active: true,
  },
  {
    sport: "hockey",
    title: "Small Ice, Big Development",
    principle:
      "Prioritize small-area games and cross-ice formats over full-ice play for youth hockey development.",
    explanation:
      "USA Hockey's ADM structures 8U practices as stations ending in cross-ice 4v4 with intermediate nets, and 6U as 3v3 with mini nets and no goalies, because young players can't fill a full sheet of ice the way adults do. An IIHF-hosted study of small-area games in Sweden and Finland found up to 5x more shot attempts in small-ice games than full-ice 5v5 over the same time - more touches and more decisions per minute, which is where skill development actually happens.",
    doExamples: [
      "Run 8U practices as rotating stations (8-10 min each) finishing in cross-ice 4v4 with intermediate nets",
      "Run 6U as 3v3 with mini nets and no goalies",
      "Favor small-area games over full-ice scrimmage time when the goal is skill development",
      "Track shot attempts and touches, not just ice time, as a development signal",
    ],
    dontExamples: [
      "Default straight to full-ice 5v5 for players under 11",
      "Treat full-ice scrimmage minutes as equivalent to small-area-game reps",
      "Introduce checking before age 14 (Sweden's benchmark) purely to look more 'game-like'",
      "Judge a chaotic-looking cross-ice game as less valuable than a tidy full-ice one",
    ],
    europeanInsight:
      "Sweden bans checking until age 14 and leans on small-area games for skill development, consistent with the IIHF-hosted study showing up to 5x more shot attempts in small-ice formats than full-ice 5v5.",
    source: "IIHF-hosted Sweden/Finland small-area-games study (blob.iihf.com)",
    sortOrder: 120,
    active: true,
  },
  {
    sport: "baseball",
    title: "Throw, Catch, Run, Hit - Keep the Rules Minimal",
    principle:
      "Teach youth baseball's four core motor competencies - throwing, catching, running, hitting - through play; our own sequence (throw, then catch, then run, then hit) is an editorial choice, not a federation-specified order. Keep rules knowledge to the essentials.",
    explanation:
      "USA Baseball's Long-Term Athletic Development guidance for ages 6-8 identifies throwing, catching, running, and hitting as core motor competencies - an unordered set, not a ranking - taught through play rather than lecture, with station-based practice and multi-sport participation both explicitly recommended. We sequence our own teaching as throw, catch, run, then hit as an editorial choice, since throwing and catching are foundational movement patterns that transfer everywhere and are easy to lose to hitting time otherwise. Rules content should stay minimal at this age - which base to run to, where to stand, what counts as an out - because explaining infield-fly-rule nuance eats practice time that's better spent on reps.",
    doExamples: [
      "Sequence practice time so throwing and catching reps happen before hitting reps",
      "Run station-based practices rotating through throw/catch, fielding, and hitting",
      "Teach only the rules needed to play: which base to run to, where to stand, what an out is",
      "Progress hitting equipment tee-first, then soft toss, then live pitching",
    ],
    dontExamples: [
      "Let hitting reps crowd out throwing and catching time",
      "Spend practice time explaining advanced rules (force vs. tag, infield fly) to 6-8 year olds",
      "Rush players to live pitching before tee and soft-toss mechanics are solid",
      "Treat single-sport specialization as necessary at this age",
    ],
    source: "USA Baseball LTAD",
    sortOrder: 121,
    active: true,
  },
  {
    title: "Watch the Birthday, Not Just the Talent",
    principle:
      "Recognize the relative-age effect: within any age group, kids born earlier in the selection year are systematically bigger, stronger, and more coordinated than kids born later - and get over-selected and over-praised as a result, independent of true long-term potential.",
    explanation:
      "The relative-age effect (RAE) is well documented across youth sports: a player born early in a cut-off year can have close to a year of extra physical and cognitive maturity over a teammate born late in the same year, yet both are evaluated as same-age peers. Coaches and selectors consistently mistake this maturity gap for talent, over-selecting relatively older players and under-selecting relatively younger, equally talented ones. Bio-banding (grouping by biological maturity instead of birth year) reduces this bias but does not eliminate it - birthday-banding is a documented alternative under discussion as further mitigation (Pediatric Exercise Science 2024, PMC7739587). Awareness is the first defense: coaches who explicitly check a player's birth quarter before judging them as 'ahead' or 'behind' catch themselves before repeating the bias.",
    doExamples: [
      "Note each player's birth quarter when assessing whether they look 'ahead' or 'behind'",
      "Ask whether an 'advanced' player is relatively older, not just more skilled",
      "Give relatively younger players extra patience and opportunity rather than writing them off early",
      "Consider bio-banding or mixed-age small-sided groupings to reduce the physical-maturity gap in competitive settings",
    ],
    dontExamples: [
      "Confuse relative maturity (being one of the oldest in the age group) with ability",
      "Base playing time or roster cuts primarily on size/strength at young ages",
      "Assume the most dominant player in an age group today will remain the best prospect long-term",
      "Ignore birth-month distribution when reviewing who gets selected for advanced groups or all-star teams",
    ],
    source: "Pediatric Exercise Science 2024; PMC7739587",
    sortOrder: 40,
    active: true,
  }
];

export const COACH_GUIDANCE: CoachGuidanceContent = {
  prompts: COACH_PROMPTS,
  resources: COACH_RESOURCES,
  principles: COACHING_PRINCIPLES,
};

// Basketball skills content.
//
// Transcribed verbatim from the recovered curriculum seeds under
// `.superpowers/curriculum-recovery/seeds/` (REFERENCE ONLY -- never imported
// from src/). Container shape is `SkillContent`; skill copy (progression
// levels, coaching tips, comprehensiveGuide, etc.) is byte-for-byte from the
// sources.
//
// FOLD PROVENANCE (see the Task 5 report at
// .superpowers/sdd/cr-task-5-report.md for the full breakdown; this mirrors
// Task 3's soccer methodology exactly):
//
// - The 13 v2-canonical skills come from `curriculum-v2__basketball-skills.ts`
//   (5 technical / 3 tactical / 2 physical / 3 psychological).
// - 13 of gen-0's 14 basketball skills (`src/lib/db/seed-curriculum.ts`) have
//   no name collision with the 13 and are folded in as shells (slug re-derived
//   by kebab-casing the name). The 14th, "Help Defense", collides by exact
//   name with a v2-canonical skill -- v2 wins as the base layer (same
//   precedent as soccer's "Finding Space").
// - Two upgrade files layer richer content onto skills matched BY NAME,
//   case-insensitive, never by the hardcoded UUIDs the original seeds used:
//     upgrade.ts   (batch 1, 8 skills, full-field patches -- progressionLevels/
//                   observableBehaviors/commonMistakes/coachingTips/tags/
//                   comprehensiveGuide -- all 8 match a gen-0 shell name
//                   exactly)
//     upgrade-2.ts (batch 2, 18 skills, same full-field shape). Several
//                   entries target the SAME name twice (Crossover Dribble,
//                   Shooting Form, Ball Handling) -- confirmed by inspecting
//                   the source that each such pair shares one identical guide
//                   object (e.g. `crossoverDribbleGuide` used for both the
//                   "Development stage" and "Skill Building stage" comments),
//                   so folding them onto a single entry by name loses no
//                   content -- the second write is byte-identical to the
//                   first.
//   Where a batch-2 name matches nothing yet in the map (v2-canonical, gen-0
//   shells, or an earlier batch-2 entry), it becomes a brand-new
//   `SkillContent` with domain/stage taken from that entry's own
//   "SKILL N: <Name> (domain, stage)" source comment: Chest Pass, Layup,
//   Pull-Up Jumper, Spacing, Pick and Roll Ball Handler, Coordination,
//   Shooting Form (created once, from the first of its two identical
//   entries).
//
// Raw fold count: 33 basketball skills (13 v2-canonical + 13 gen-0-shelled +
// 7 brand new). The 13-skill / 5-3-2-3 v2-canonical split is preserved.
//
// CONSOLIDATION (pre-load pass, see
// .superpowers/sdd/cr-consolidation-report.md): before this content's first
// live load, 7 near-duplicate skills that taught the same technique at the
// same stage were merged into their richer sibling and removed (the
// fold-by-name step above only collapses exact-name duplicates, so
// differently-worded duplicates like "Form Shooting" / "Shooting Form"
// survived the original fold as separate entries):
//   - "Stationary Ball Handling" -> "Ball Handling"
//   - "Chest Pass" -> "Two-Hand Chest Pass"
//   - "Shooting Form" -> "Form Shooting"
//   - "Layup" -> "Layups - Dominant Hand"
//   - "Pull-Up Jumper" -> "Pull-Up Jump Shot"
//   - "Spacing Awareness" and "Spacing" -> "Court Spacing" (3-way overlap)
// Any genuinely distinct unique material (e.g. the 12-15 foot spacing rule)
// was merged into the surviving entry's top-level fields; no content was
// invented. True count: 26. This file's actual totals are asserted directly
// in registry.test.ts.

import type { SkillContent } from "../types";

export const BASKETBALL_SKILLS: SkillContent[] = [
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Ball Handling",
    slug: "ball-handling",
    description:
      "The ability to control and maneuver the basketball while dribbling, including stationary dribbling drills (pounds, wraps, figure 8s), moving with the ball, and protecting it from defenders.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 1,
    progressionLevels: {
      1: "Loses ball frequently; palm-dribbles; eyes on ball; only dominant hand",
      2: "Maintains basic dribble with dominant hand; fingertip control developing",
      3: "Confident with both hands; fingertips consistent; head up while dribbling",
      4: "Excellent control with both hands; performs multiple moves; court vision",
      5: "Elite handling with creative combinations; full court vision; ambidextrous mastery",
    },
    observableBehaviors: [
      "Uses fingertips rather than palm",
      "Maintains consistent rhythm without losing ball",
      "Keeps ball at or below waist height",
      "Dribbles with both hands",
      "Shows head-up position while dribbling",
    ],
    commonMistakes: [
      "Slapping ball with palm instead of fingertips",
      "Dribbling too high (above waist)",
      "Looking down at ball constantly",
      "Standing upright without athletic bend",
      "Using only dominant hand",
      "No rhythm or timing to dribbles",
    ],
    coachingTips: [
      "What part of your hand is touching the ball - palm or fingertips?",
      "Can you feel the ball with fingertips like playing piano?",
      "How low can you keep the dribble while staying in control?",
      "What do you see when you look up? Tell me what's happening around you!",
      "Mistakes mean you're challenging yourself. What did you notice when the ball got away?",
      "Your weak hand needs extra love - every attempt builds skill!",
    ],
    tags: ["technical", "ball-handling", "dribbling", "fundamentals", "core"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Loses ball frequently. Palm-dribbles with poor control. Cannot maintain dribble for extended period.",
          observableBehaviors: [
            "Ball escapes within 5-10 dribbles",
            "Uses palm instead of fingertips",
            "Eyes fixed on ball",
            "Stands upright while dribbling",
            "Only attempts dominant hand",
            "Appears frustrated with ball",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Can maintain basic stationary dribble with dominant hand. Fingertip control developing but inconsistent.",
          observableBehaviors: [
            "20+ dribbles with dominant hand",
            "Beginning fingertip control",
            "Glances up occasionally",
            "Some rhythm developing",
            "Weak hand inconsistent",
            "More relaxed with ball",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Confident with both hands stationary. Uses fingertips consistently and can look up while dribbling.",
          observableBehaviors: [
            "Both hands 30+ dribbles",
            "Fingertip control consistent",
            "Head up 50%+ of time",
            "Can answer questions while dribbling",
            "Attempts crossovers",
            "Shows confidence",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent control with both hands. Performs multiple moves and maintains court vision.",
          observableBehaviors: [
            "Both hands nearly equal",
            "Multiple moves executed (crossovers, between the legs)",
            "Head up 80%+ of time",
            "Reads and reacts while handling",
            "Smooth move transitions",
            "Creative and confident",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite ball handler with creative, ambidextrous control. Can perform any move while maintaining full awareness.",
          observableBehaviors: [
            "Ambidextrous mastery",
            "Creates unique combinations",
            "Full court vision",
            "Game-speed execution",
            "Ball is extension of hand",
            "Leads handling drills",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "No improvement in consecutive dribbles after 4+ weeks",
        "Persistent palm-hitting despite consistent coaching",
        "Extreme frustration affecting willingness to practice",
        "Physical coordination issues affecting multiple motor skills",
        "Complete avoidance of ball handling activities",
      ],
      parentExplanation:
        "Ball handling is the foundation for all basketball dribbling. We focus on 'fingertip control' - using spread fingers rather than the palm to push and guide the ball. This takes thousands of touches to develop! At home, any time with a ball in their hands helps - dribbling while watching TV, bouncing in the driveway, or just carrying a ball around. The key is lots of touches!",
      homeActivities: [
        "Dribble while watching TV (commercial break challenges)",
        "Two-ball dribbling for advanced challenge",
        "Dribble on different surfaces (grass is harder!)",
        "Fingertip push-ups on the basketball",
        "Count dribbles in 30 seconds each hand",
        "Ball squeeze exercises for hand strength",
      ],
      assessmentFrequency:
        "Every 2-3 weeks observation, formal assessment monthly",
      assessmentDuration:
        "Compare dominant and weak hand control. Note fingertip usage and head position.",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Passing",
    slug: "passing-basketball",
    description:
      "The ability to accurately deliver the ball to teammates using chest passes, bounce passes, and overhead passes.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 2,
    progressionLevels: {
      1: "Throws ball randomly; no specific pass type; inaccurate and weak",
      2: "Can make chest pass to stationary target; inconsistent accuracy; limited range",
      3: "Accurate chest and bounce passes; can pass to moving teammate; appropriate pace",
      4: "Multiple pass types; passes through traffic; reads defense to find open player",
      5: "Elite passer; creates advantages; no-look and skip passes; perfect timing",
    },
    observableBehaviors: [
      "Steps toward target when passing",
      "Thumbs point down on follow-through (chest pass)",
      "Uses appropriate pass type for situation",
      "Leads moving receivers",
      "Passes away from defender",
    ],
    commonMistakes: [
      "Not stepping into pass",
      "Passing to where player is, not where they're going",
      "Using wrong pass type (bounce when chest needed)",
      "Telegraphing passes",
      "Passing too hard or too soft",
    ],
    coachingTips: [
      "'Step and snap!' - step toward target, snap wrists",
      "'Thumbs down!' - proper follow-through",
      "'Pass to the chest!' - target is teammate's chest",
      "'Lead them!' - pass ahead of moving player",
      "'See the defense!' - find the open window",
    ],
    tags: ["core", "technical", "fundamental", "passing"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player throws the ball without specific technique. Passes are inaccurate and often too weak or wild.",
          observableBehaviors: [
            "No consistent pass technique",
            "Passes go in random directions",
            "Very weak passes",
            "Doesn't step toward target",
            "No awareness of pass types",
          ],
          commonMistakes: [
            "Throwing like a ball (not basketball pass)",
            "Not looking at target",
            "Standing flat-footed",
            "Using one hand only",
          ],
          coachingTips: [
            "Start with chest pass fundamentals only",
            "Partner passing from close range (5 feet)",
            "'Push the ball to your friend's chest'",
            "Wall passing for repetition",
          ],
          assessmentActivities: [
            "Partner passing at 5 feet",
            "Pass to target on wall",
            "Catch and pass back to coach",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can make basic chest passes to stationary targets. Beginning to understand bounce pass.",
          observableBehaviors: [
            "Chest pass technique emerging",
            "Can hit stationary target",
            "Beginning to step into passes",
            "Learning bounce pass",
            "Range limited",
          ],
          commonMistakes: [
            "Passes still too weak at distance",
            "Bounce pass bounces wrong spot",
            "Forgets to step",
            "Passes behind moving teammates",
          ],
          coachingTips: [
            "Add bounce pass - 'bounce it 2/3 of the way'",
            "Increase distance gradually",
            "Pass and cut drill",
            "Target practice with points",
          ],
          assessmentActivities: [
            "Chest pass accuracy at 10 feet",
            "Bounce pass through cones",
            "Partner passing on the move",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Accurate with chest and bounce passes. Can pass to moving teammates. Uses appropriate pace.",
          observableBehaviors: [
            "Chest and bounce passes accurate",
            "Passes to moving targets",
            "Appropriate pass speed",
            "Steps into passes consistently",
            "Beginning to read situations",
          ],
          commonMistakes: [
            "Overhead pass underdeveloped",
            "Struggles with defensive pressure",
            "Sometimes telegraphs",
            "One-handed passes inaccurate",
          ],
          coachingTips: [
            "Add overhead/outlet pass",
            "Introduce passing against defense",
            "Passing in transition",
            "Decision-making - which pass?",
          ],
          assessmentActivities: [
            "3-person weave",
            "Passing with passive defender",
            "Full court outlet passing",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Uses multiple pass types effectively. Passes through traffic and finds open teammates consistently.",
          observableBehaviors: [
            "All pass types available",
            "Finds open passing lanes",
            "Passes through traffic",
            "Reads defense effectively",
            "Good timing on passes",
          ],
          commonMistakes: [
            "May attempt too difficult passes",
            "Occasionally forces passes",
          ],
          coachingTips: [
            "Advanced passes - wrap around, baseball",
            "Skip passes across court",
            "Passing under pressure",
            "Creating passing angles",
          ],
          assessmentActivities: [
            "Passing in scrimmage situations",
            "Full game observation",
            "High-pressure passing drills",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite passer who creates advantages for team. Perfect timing, creative passes, and exceptional vision.",
          observableBehaviors: [
            "Creates scoring opportunities",
            "No-look passes",
            "Skip passes with accuracy",
            "Reads defense before it happens",
            "Makes teammates better",
          ],
          commonMistakes: ["May try too flashy at times"],
          coachingTips: [
            "Continue developing creativity",
            "Leadership role in passing drills",
            "Teach others",
            "Maintain through competition",
          ],
          assessmentActivities: [
            "Full game observation",
            "Assist tracking",
            "High-level scrimmages",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Focus on chest pass basics. Hands may be small for full control - that's okay! Make it fun with partner games. Don't worry about bounce pass perfection yet.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "All three basic passes should be developing. Emphasize passing to moving targets. Introduce passing against light defense.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect accurate passing under pressure. Decision-making is key focus. Work on advanced passes and creating for teammates.",
        },
      },
      redFlags: [
        "Cannot make any accurate pass after extended practice",
        "Significant fear of catching/throwing",
        "Physical limitations affecting ability",
        "No improvement over several months",
      ],
      parentExplanation:
        "Passing is how teams share the ball and create scoring opportunities. We teach three main passes: chest pass (most common), bounce pass (under defender's hands), and overhead pass (over defenders). Good passing requires stepping toward your target and snapping your wrists. The best passers see the whole court and know where teammates will be!",
      homeActivities: [
        "Wall passing - chest pass and catch against wall",
        "Partner passing with family member",
        "Bounce pass through chair legs as target",
        "Watch basketball and notice the passes (assists)",
        "Target practice - pass to knock down objects",
      ],
      bestAssessedIn: [
        "Partner passing drills",
        "3-person weave",
        "Scrimmage situations",
        "Full games",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across 2-3 sessions",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Two-Hand Chest Pass",
    slug: "two-hand-chest-pass",
    description: "Passing the ball with two hands from the chest to a partner",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 2,
    progressionLevels: {
      1: "Pass lacks power and accuracy; incorrect hand position; ball floats or bounces unpredictably",
      2: "Can make short chest passes to stationary target; inconsistent accuracy; developing proper form",
      3: "Accurate chest passes at medium distance; proper thumbs-down follow-through; can hit moving target",
      4: "Crisp, accurate passes at various distances; good decision-making; leads receivers appropriately",
      5: "Elite passing vision and execution; creates scoring opportunities; perfectly weighted passes",
    },
    observableBehaviors: [
      "Holds ball at chest level with fingers spread on sides",
      "Steps toward target when passing",
      "Thumbs point down on follow-through",
      "Ball arrives at receiver's chest level",
      "Pass has appropriate speed - not too hard or soft",
    ],
    commonMistakes: [
      "Holding ball too high or too low",
      "Pushing with palms instead of fingers",
      "No step toward target",
      "Thumbs up instead of down on release",
      "Passing behind or at feet of moving teammate",
      "Ball arrives at receiver's feet or over head",
    ],
    coachingTips: [
      "Where should the ball be when you start - can you show me chest level?",
      "What direction do your thumbs point when you finish the pass?",
      "Where is your teammate going to be, not where they are now?",
      "Every pass is a chance to help a teammate - what makes an easy catch?",
      "If the pass wasn't perfect, what would you try differently?",
    ],
    tags: ["core", "technical", "fundamental", "passing", "teamwork"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning the basic motion of a chest pass. Passes lack power and direction, often bouncing or floating unpredictably.",
          observableBehaviors: [
            "Ball held incorrectly (too high, too low, wrong grip)",
            "No stepping motion with pass",
            "Ball bounces multiple times or floats high",
            "Passes miss target by significant margin",
            "Receiver has difficulty catching pass",
            "Little to no follow-through",
          ],
          commonMistakes: [
            "Throwing like a shot put",
            "Fingers pointing forward instead of behind ball",
            "Standing flat-footed",
            "Releasing ball at wrong height",
          ],
          coachingTips: [
            "Let's start by holding the ball together - where are your thumbs?",
            "Can you step toward me like you're taking a big step to say hello?",
            "Push the ball to your partner like you're opening a door",
            "When the ball doesn't go where you wanted, that's information! What can you adjust?",
            "Nice effort! I can see you're really trying to step and push",
          ],
          assessmentActivities: [
            "Partner passing at 6 feet - count catches out of 10",
            "Wall passing - see if ball returns to chest",
            "Grip check - can they show proper hand position?",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can complete short chest passes to a stationary partner. Form is developing but inconsistent, especially under any pressure.",
          observableBehaviors: [
            "Makes 5-6 of 10 passes at short distance",
            "Beginning to step toward target",
            "Thumbs-down follow-through sometimes",
            "Passes catchable but not always at chest",
            "Can describe proper technique",
            "More confident with familiar partners",
          ],
          commonMistakes: [
            "Inconsistent starting position",
            "Step too small or absent when rushed",
            "Variable pass height",
            "Accuracy decreases with distance",
          ],
          coachingTips: [
            "What's your checklist before you pass? Ball at chest, thumbs behind, step and push!",
            "Try passing to a spot on the wall - can you hit the same spot 5 times?",
            "When the pass goes high, what might have happened with your release?",
            "You're getting more consistent - what feels different now?",
            "Learning means trying, adjusting, trying again. You're doing that!",
          ],
          assessmentActivities: [
            "Partner passing at 10 feet - accuracy check",
            "Target passing - hit marked spot on wall",
            "Moving receiver introduction - slow walk",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Makes accurate chest passes at medium distances. Shows proper form consistently and can pass to moving teammates.",
          observableBehaviors: [
            "Accurate 8+ of 10 passes at 15 feet",
            "Consistent thumbs-down follow-through",
            "Leads moving receivers appropriately",
            "Pass speed matches situation",
            "Can complete passes in drills",
            "Adjusts to different receivers",
          ],
          commonMistakes: [
            "May struggle under defensive pressure",
            "Decision-making still developing",
            "Long passes less accurate",
            "Can be predictable with timing",
          ],
          coachingTips: [
            "When you have a defender nearby, what changes about your pass?",
            "Where does your teammate need the ball to catch it in stride?",
            "What tells you when to pass versus when to hold the ball?",
            "Your form is solid - now let's work on reading the game. What do you see before you pass?",
            "Great adjustment on that pass! You noticed they were moving faster",
          ],
          assessmentActivities: [
            "Moving partner passing drill",
            "Pass with passive defender present",
            "Decision game - pass or hold based on cue",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Executes crisp, accurate passes in game situations. Shows good vision and makes appropriate decisions about when and where to pass.",
          observableBehaviors: [
            "Accurate in game situations",
            "Good pass fakes",
            "Reads defenders well",
            "Consistent under pressure",
            "Creates passing angles",
            "Supports teammates' positioning",
          ],
          commonMistakes: [
            "Occasional forced pass into traffic",
            "May try difficult pass when simple works",
            "Can be too unselfish at times",
          ],
          coachingTips: [
            "When is the right time to make the flashy pass versus the simple one?",
            "How can you help your teammate get open for your pass?",
            "What do you look for before deciding to pass?",
            "Your passing makes teammates better - how does that feel?",
            "You're becoming someone others want to play with. That's real impact!",
          ],
          assessmentActivities: [
            "Game observation - passing decisions",
            "2v1 passing drill",
            "Full-court passing accuracy test",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite passer with exceptional vision and execution. Creates scoring opportunities for teammates and makes everyone around them better.",
          observableBehaviors: [
            "Sees passing lanes others miss",
            "Perfect weight on every pass",
            "Creates easy baskets for teammates",
            "Rarely turns ball over on passes",
            "Leads team in assists in games",
            "Teammates seek to play with them",
          ],
          commonMistakes: [
            "May expect teammates to read plays the same way",
            "High expectations of others' hands",
          ],
          coachingTips: [
            "How can you help teammates understand where you'll look to pass?",
            "What can you teach younger players about passing?",
            "Your gift is making others better. How do you want to use that?",
            "Continue challenging yourself - what pass can't you make yet?",
          ],
          assessmentActivities: [
            "Game assist tracking",
            "Teaching demonstration",
            "Advanced passing combinations",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Chest passing requires coordination and strength that young players are still developing. Use lighter balls and shorter distances. Focus on the fun of connecting with a partner rather than perfect technique. Celebrate successful catches, not just successful passes. Partner games make passing enjoyable and social.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can now understand and apply passing technique. Increase distances gradually as strength improves. Introduce passing to moving targets. Emphasize teamwork aspect - 'A great pass makes your teammate look good.' Connect passing to basketball's team nature. This is prime time for building passing habits.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect competent chest passes in practice situations. Focus on decision-making and game application. Introduce pass fakes and reading defenders. Discuss court vision and anticipation. Connect passing excellence to team success and being a good teammate.",
        },
      },
      redFlags: [
        "Cannot complete basic pass to stationary partner at 6 feet after multiple sessions",
        "Persistent incorrect grip despite repeated instruction",
        "Fear of having ball thrown to them (may indicate past negative experience)",
        "Significant arm/shoulder weakness affecting all throwing motions",
        "Frustration that prevents continued effort and learning",
      ],
      parentExplanation:
        "The two-hand chest pass is basketball's most fundamental pass - it's how players share the ball and work together. We teach 'step and push' with thumbs ending down. Passing is really about teamwork and communication. When your child makes a good pass, they're learning to help others succeed. At home, playing catch with any ball develops passing skills. Ask them to show you the 'thumbs down' follow-through - they love teaching what they've learned!",
      homeActivities: [
        "Wall passing practice (ball should return to chest height)",
        "Partner passing in the driveway (count consecutive catches)",
        "Pass to targets on wall (draw a square at chest height)",
        "Play catch while discussing how practice went",
        "Watch basketball games and notice passing",
        "Pass and move games with family",
      ],
      bestAssessedIn: [
        "Partner passing drills",
        "Small-sided games (2v2, 3v3)",
        "Transition drills",
        "Game observation",
      ],
      assessmentFrequency:
        "Every 2-3 weeks observation, formal assessment monthly",
      assessmentDuration:
        "Observe across multiple passing situations over 10-15 minutes",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Catching",
    slug: "catching-basketball",
    description:
      "The ability to receive passes cleanly with proper hand positioning, including catching while stationary and on the move.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 3,
    progressionLevels: {
      1: "Balls bounce off hands; doesn't move to ball; afraid of ball",
      2: "Catches stationary passes; struggles with hard or off-target passes",
      3: "Catches most passes; moves toward ball; catches while moving",
      4: "Catches difficult passes; strong hands; catches in traffic",
      5: "Elite receiver; catches everything; creates separation to receive",
    },
    observableBehaviors: [
      "Hands ready - 'target' for passer",
      "Moves toward the ball",
      "Gives soft hands on contact",
      "Secures ball quickly",
      "Eyes follow ball into hands",
    ],
    commonMistakes: [
      "Waiting for ball to arrive",
      "Hands not ready",
      "Stiff/hard hands (ball bounces off)",
      "Looking away before securing",
      "Catching with body instead of hands",
    ],
    coachingTips: [
      "'Show your hands!' - give passer a target",
      "'Meet the ball!' - move toward the pass",
      "'Soft hands!' - cushion the ball",
      "'Look it in!' - watch ball into hands",
      "'10 fingers!' - catch with both hands",
    ],
    tags: ["core", "technical", "fundamental", "catching", "receiving"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player struggles to catch passes. Ball often bounces off hands. May show fear of the ball.",
          observableBehaviors: [
            "Ball bounces off hands",
            "Flinches or closes eyes",
            "Hands not ready",
            "Doesn't move to ball",
            "Catches with body/chest",
          ],
          commonMistakes: [
            "Eyes closed on catch",
            "Hands too stiff",
            "Not watching the ball",
            "Arms not extended to receive",
          ],
          coachingTips: [
            "Start with soft balls or smaller balls",
            "Very close range - build confidence",
            "'Watch it into your hands'",
            "Self-toss and catch first",
            "Celebrate every catch!",
          ],
          assessmentActivities: [
            "Self-toss and catch",
            "Coach tosses gentle passes from 5 feet",
            "Bounce catches (easier)",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can catch routine passes when prepared. Struggles with hard passes or ones requiring movement.",
          observableBehaviors: [
            "Catches routine passes",
            "Hands more ready",
            "Still struggles with hard passes",
            "Beginning to meet ball",
            "More confidence",
          ],
          commonMistakes: [
            "Waits for ball at times",
            "Drops difficult passes",
            "One hand catching",
            "Not securing quickly",
          ],
          coachingTips: [
            "Increase distance gradually",
            "Add movement - catch on the move",
            "Partner catching games",
            "Harder passes gradually",
          ],
          assessmentActivities: [
            "Partner passing from 10 feet",
            "Catch while walking",
            "Bounce pass catching",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Catches most passes reliably. Moves toward the ball. Can catch while on the move.",
          observableBehaviors: [
            "Catches most passes",
            "Moves to the ball",
            "Catches while moving",
            "Shows target hands",
            "Secures ball quickly",
          ],
          commonMistakes: [
            "May struggle with very hard passes",
            "Traffic causes issues",
            "High passes challenging",
            "Occasionally bobbles",
          ],
          coachingTips: [
            "Increase pass difficulty",
            "Catching in traffic practice",
            "Catch and immediate action",
            "Different angles and heights",
          ],
          assessmentActivities: [
            "Catch in cutting drills",
            "Catch with defender nearby",
            "High/low pass catching",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong, reliable receiver. Catches difficult passes and can receive in traffic with defenders.",
          observableBehaviors: [
            "Catches everything",
            "Strong hands in traffic",
            "Creates space to receive",
            "Immediate triple threat",
            "Confident receiver",
          ],
          commonMistakes: [
            "May not always call for ball",
            "Could create more separation",
          ],
          coachingTips: [
            "Catching under full pressure",
            "Outlet receiving",
            "Post entry catches",
            "One-handed catches when needed",
          ],
          assessmentActivities: [
            "Game-speed receiving",
            "Catching in scrimmages",
            "Full game observation",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite receiver who catches everything. Creates separation and is always ready to receive.",
          observableBehaviors: [
            "Never drops passes",
            "Elite hands",
            "Creates own space",
            "Catches in worst situations",
            "Immediate threat after catch",
          ],
          commonMistakes: ["May expect passes others can't make"],
          coachingTips: [
            "Maintain through challenging drills",
            "Leadership role",
            "Help others develop",
          ],
          assessmentActivities: [
            "Full game observation",
            "High-pressure drills",
            "Elite competition",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Hands are small and coordination is developing. Use appropriately sized balls. Fear of the ball is common - build confidence gradually with soft passes.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Catching should become more reliable. Focus on moving to the ball and showing target hands. Catching while moving is key development.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect reliable catching. Focus on catching under pressure and in traffic. Quick transition to triple threat after receiving.",
        },
      },
      redFlags: [
        "Persistent fear of ball not improving",
        "Cannot catch soft tosses from close range",
        "Vision issues affecting tracking",
        "No improvement despite practice",
      ],
      parentExplanation:
        "Catching seems simple but is a fundamental skill! We teach players to 'show their hands' (give the passer a target), 'meet the ball' (move toward it), and use 'soft hands' (cushion on contact). At young ages, hands are small and the ball is big - be patient! Practice catching with any ball at home to build hand-eye coordination.",
      homeActivities: [
        "Play catch with any ball (tennis, baseball, basketball)",
        "Self-toss against wall and catch",
        "Catch games with family",
        "Reaction catches - parent throws without warning",
        "Catch while walking/moving",
      ],
      bestAssessedIn: [
        "Passing drills (receiving end)",
        "Cutting and catching drills",
        "Game situations",
        "Fast break drills",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across 2-3 sessions",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Two-Hand Bounce Pass",
    slug: "two-hand-bounce-pass",
    description: "Passing the ball with a bounce to a partner",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 3,
    progressionLevels: {
      1: "Cannot control where ball bounces; incorrect bounce point; pass either too hard or too soft",
      2: "Can make short bounce pass to stationary target; bounce point inconsistent; developing feel for distance",
      3: "Accurate bounce passes at medium distance; hits proper bounce point (2/3 to receiver); leads moving targets",
      4: "Executes bounce passes in traffic; uses pass to avoid defenders' hands; good touch and timing",
      5: "Elite bounce pass execution; perfect timing through traffic; creates scoring chances with precision",
    },
    observableBehaviors: [
      "Ball bounces approximately 2/3 of the way to receiver",
      "Pass arrives at receiver's waist to chest level",
      "Uses bounce pass to go under defender's reach",
      "Appropriate force - ball reaches target with one bounce",
      "Steps toward target with pass",
    ],
    commonMistakes: [
      "Bouncing ball too close (arrives at feet)",
      "Bouncing ball too far (difficult catch)",
      "Pass too hard (bounces too high)",
      "Pass too soft (ball dies short)",
      "Using bounce pass when chest pass is better option",
    ],
    coachingTips: [
      "Where should the ball hit the floor - closer to you or closer to your partner?",
      "What happens to the ball if you push it harder versus softer?",
      "When is a bounce pass better than a chest pass? What problem does it solve?",
      "When the pass didn't reach your partner well, what would you adjust?",
      "Nice problem-solving! You saw the defender's hands up and went underneath",
    ],
    tags: ["core", "technical", "fundamental", "passing", "teamwork"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning the bounce pass concept. Cannot yet control where the ball bounces or how it arrives at the target.",
          observableBehaviors: [
            "Ball bounces randomly - too close or too far",
            "Pass arrives at feet or way off target",
            "No understanding of bounce point",
            "Force is inconsistent - too hard or too soft",
            "Often reverts to chest pass or gives up",
            "Surprised by where ball goes",
          ],
          commonMistakes: [
            "Aiming at partner instead of floor",
            "Not bending knees",
            "Releasing ball too early or late",
            "No follow-through toward floor",
          ],
          coachingTips: [
            "Let's find the bounce spot together - can you bounce the ball so it comes up to your partner's hands?",
            "What happens when you bounce it here versus here? (demonstrate different spots)",
            "Every bounce that doesn't work teaches us something. What did that one tell us?",
            "Try pushing the ball toward the floor like you're pushing a ball down a slide",
            "Good effort experimenting! You're figuring out how the bounce works",
          ],
          assessmentActivities: [
            "Target on floor - can they hit the spot?",
            "Partner passing at 6 feet - 10 attempts",
            "Compare chest pass to bounce pass - when to use each?",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can complete short bounce passes to stationary targets. Understanding the concept but inconsistent with execution.",
          observableBehaviors: [
            "Makes 4-5 of 10 passes catchable",
            "Beginning to find consistent bounce point",
            "Can explain where to bounce it",
            "Some passes arrive at good height",
            "More comfortable at close range",
            "Shows adjustment after misses",
          ],
          commonMistakes: [
            "Bounce point drifts during drill",
            "Force varies from pass to pass",
            "Struggles with longer distances",
            "Doesn't always step toward target",
          ],
          coachingTips: [
            "What's your target on the floor before you pass?",
            "When that pass arrived at their knees, what needed to change?",
            "Can you bounce pass to that spot 3 times in a row?",
            "You're getting more consistent! What are you doing differently now?",
            "Learning means adjusting. You're doing that every time you try again!",
          ],
          assessmentActivities: [
            "Marked spot on floor - hit 5 of 10",
            "Partner passing at 10 feet",
            "Pass height check - waist to chest arrivals",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Executes accurate bounce passes at medium distance. Understands and hits proper bounce point and can lead moving receivers.",
          observableBehaviors: [
            "7+ of 10 passes accurate and catchable",
            "Consistently hits 2/3 distance bounce point",
            "Passes arrive at appropriate height",
            "Can lead moving teammates",
            "Chooses bounce pass over chest pass appropriately",
            "Adjusts force for distance",
          ],
          commonMistakes: [
            "May struggle with defensive pressure",
            "Timing with moving targets still developing",
            "Occasionally wrong pass selection",
            "Speed of execution could improve",
          ],
          coachingTips: [
            "When you see a defender between you and your teammate, what does that tell you about which pass to use?",
            "How far ahead of your teammate should the bounce be when they're running?",
            "What do you look at to decide bounce pass or chest pass?",
            "Great decision! You recognized when to use the bounce pass",
            "Your understanding is growing. Now let's add game pressure",
          ],
          assessmentActivities: [
            "Moving target bounce pass drill",
            "Decision drill - bounce or chest?",
            "Passive defender in passing lane",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Makes effective bounce passes in game situations with defenders present. Good touch and decision-making.",
          observableBehaviors: [
            "Effective in game settings",
            "Uses bounce pass to beat defenders",
            "Quick execution",
            "Reads situations well",
            "Consistent touch and accuracy",
            "Good pass fakes setup bounce passes",
          ],
          commonMistakes: [
            "Occasional forced pass",
            "May over-rely on bounce pass",
            "Could vary speed more",
          ],
          coachingTips: [
            "What tells you the bounce pass is open versus another option?",
            "How can you use pass fakes to create the bounce pass lane?",
            "When is the bounce pass the wrong choice even if it's open?",
            "You make the right pass most of the time now. What helps you decide?",
            "Your decision-making makes the team better",
          ],
          assessmentActivities: [
            "Game observation - bounce pass effectiveness",
            "2v1 drill with decision emphasis",
            "Entry passes to post player",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite bounce passer who threads passes through traffic with perfect timing. Creates scoring opportunities for teammates.",
          observableBehaviors: [
            "Threading passes through multiple defenders",
            "Perfect touch for every situation",
            "Creates easy baskets for teammates",
            "Excellent timing with cutters",
            "Makes difficult passes look easy",
            "Team's go-to passer in key moments",
          ],
          commonMistakes: [
            "May expect too much from receivers",
            "Occasionally attempts very high difficulty pass",
          ],
          coachingTips: [
            "How can you help teammates anticipate where you'll pass?",
            "What can you teach others about reading the defense?",
            "When should you take the simple pass even when the flashy one is open?",
            "Your passing vision is a gift. How can you continue to grow it?",
          ],
          assessmentActivities: [
            "Game impact observation",
            "Complex passing patterns",
            "Teaching younger players",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Bounce passing is conceptually challenging at this age. Players are still developing spatial awareness needed to hit a bounce point. Keep distances short (6-8 feet) and use visual targets on the floor. Focus on the fun of making the ball bounce to a friend. Don't worry about perfect technique - build comfort with the concept first.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can now understand and apply bounce pass mechanics. Introduce the 2/3 rule for bounce point. Practice with moving receivers. Connect bounce pass to game situations - 'Use this when there's a tall defender!' This age shows good improvement with focused practice.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect competent bounce passing with understanding of when to use it. Focus on execution under pressure and quick decision-making. Introduce post entry passes and passes to cutting teammates. Connect passing to team offensive concepts.",
        },
      },
      redFlags: [
        "Cannot make ball bounce in general area of target after multiple sessions",
        "No improvement in accuracy over 4+ weeks",
        "Refuses to attempt bounce passes (may indicate frustration or confusion)",
        "Cannot adjust force appropriately despite clear feedback",
        "Difficulty understanding concept of bounce point",
      ],
      parentExplanation:
        "The bounce pass is used to get the ball past defenders - it goes under their outstretched hands! We teach players to bounce the ball about 2/3 of the way to their teammate so it arrives at a catchable height. This requires learning to control both the location and force of the pass. At home, you can practice with any bouncy ball. Set up a target on the ground and see if your child can hit it consistently. The coordination they develop transfers to many other sports and activities.",
      homeActivities: [
        "Chalk target on driveway - hit the X",
        "Partner bounce pass catch game",
        "Wall bounce passing at target height",
        "Bounce pass bowling - knock down targets",
        "One-handed bounce pass practice (advanced)",
        "Count consecutive good bounce passes",
      ],
      bestAssessedIn: [
        "Partner passing drills",
        "Entry pass practice to post area",
        "Small-sided games with emphasis on pass selection",
        "Game observation",
      ],
      assessmentFrequency:
        "Every 2-3 weeks observation, formal assessment monthly",
      assessmentDuration: "10-15 minutes across multiple passing situations",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Form Shooting",
    slug: "form-shooting",
    description:
      "Proper shooting form from close range (BEEF: Balance, Eyes, Elbow, Follow through)",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 4,
    progressionLevels: {
      1: "Throws ball toward basket without form; two-handed push; no arc; misses badly most attempts",
      2: "Developing one-hand shot form; inconsistent release; some arc; makes occasional close shots",
      3: "Proper BEEF form (Balance, Eyes, Elbow, Follow-through); consistent arc; makes 40%+ close range",
      4: "Smooth, consistent form from various distances; good arc and rotation; makes 50%+ mid-range",
      5: "Textbook shooting form; high percentage shooter; form maintained under pressure",
    },
    observableBehaviors: [
      "Balanced stance with feet shoulder-width apart",
      "Eyes focused on target (rim or backboard)",
      "Shooting elbow under ball and pointing at target",
      "Follows through with wrist snap - 'reach into the cookie jar'",
      "Ball has proper arc and backspin",
    ],
    commonMistakes: [
      "Two-handed push instead of one-hand release",
      "Shooting elbow out to side ('chicken wing')",
      "No follow-through - shot stops at release",
      "Flat trajectory with no arc",
      "Guide hand influencing the shot",
    ],
    coachingTips: [
      "Can you show me 'shooting hand in the cookie jar' follow-through?",
      "Where is your elbow pointing - at the basket or to the side?",
      "What does BEEF stand for? Let's check each part of your shot",
      "When the shot went left/right, what might your guide hand have done?",
      "Shooting takes thousands of repetitions - every practice is a step forward!",
    ],
    tags: ["core", "technical", "fundamental", "shooting", "scoring"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player throws the ball toward the basket without proper shooting form. Uses two hands equally and ball has little arc.",
          observableBehaviors: [
            "Two-handed push/throw toward basket",
            "No consistent stance or balance",
            "Eyes wander during shot",
            "Ball goes flat without arc",
            "Rarely comes close to basket",
            "No follow-through visible",
          ],
          commonMistakes: [
            "Shooting from chest level",
            "Both hands pushing equally",
            "No leg power involvement",
            "Looking at defender instead of rim",
          ],
          coachingTips: [
            "Let's start with no basket - just shoot up to the sky! Can you make it spin?",
            "Put the ball in your shooting hand only - can you push it straight up?",
            "Where are you looking when you shoot? Find the rim and stay there!",
            "Every shot that doesn't go in teaches us something. What can you adjust?",
            "Great effort! I see you're trying to reach up high on your follow-through",
          ],
          assessmentActivities: [
            "Ball spin drill - can they make ball spin backward?",
            "Close range form shooting (3-5 feet from basket)",
            "Self-pass and catch in shooting position",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Developing one-handed shooting form. Some components present but inconsistent. Makes occasional close shots.",
          observableBehaviors: [
            "Attempting one-hand release",
            "Some follow-through present",
            "Ball has some arc sometimes",
            "Makes 2-3 of 10 from close range",
            "Can describe BEEF components",
            "Guide hand stabilizing ball",
          ],
          commonMistakes: [
            "Guide hand still influencing shot",
            "Elbow often out to side",
            "Inconsistent release point",
            "Balance issues on release",
          ],
          coachingTips: [
            "Let's check your elbow - is it under the ball like a shelf?",
            "What does your guide hand do? It just holds, then waves goodbye!",
            "After you shoot, can you hold your follow-through and show me?",
            "You're making progress! What feels different when the shot goes in?",
            "Mistakes are data. That miss told us something - what was it?",
          ],
          assessmentActivities: [
            "Form shooting at 5-7 feet - 10 shots",
            "BEEF checklist - demonstrate each component",
            "Follow-through hold drill",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Shows proper BEEF form consistently. Good arc and makes 40%+ from close range. Form mostly holds under light pressure.",
          observableBehaviors: [
            "BEEF components present consistently",
            "Good arc on most shots",
            "Makes 4+ of 10 from close range",
            "Follow-through automatic",
            "Balance maintained through shot",
            "Backspin visible on ball",
          ],
          commonMistakes: [
            "Form breaks at longer distances",
            "Rushed shots lose technique",
            "May fade away unnecessarily",
            "Confidence varies by location",
          ],
          coachingTips: [
            "What's the farthest distance where your form stays perfect?",
            "When you miss, is it usually short, long, left, or right? What does that tell us?",
            "How can you keep the same form when you're tired?",
            "Your form is looking consistent. Now let's build range slowly",
            "Great self-correction! You noticed the elbow and fixed it",
          ],
          assessmentActivities: [
            "Form shooting from multiple spots",
            "Game-speed catch and shoot",
            "Shooting after movement",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Smooth, consistent shooting form from various distances. High percentage from mid-range. Form holds under defensive pressure.",
          observableBehaviors: [
            "Consistent form at all distances",
            "Makes 50%+ from mid-range",
            "Good shot selection",
            "Form maintained when contested",
            "Quick release",
            "Confident body language",
          ],
          commonMistakes: [
            "May force difficult shots",
            "Three-point range still developing",
            "Could create more space sometimes",
          ],
          coachingTips: [
            "What's your shooting routine before each game?",
            "How do you maintain form when a defender is close?",
            "When should you pass instead of shoot?",
            "Your shooting makes you valuable to the team. What's next for your development?",
            "You've put in the work. Trust your form!",
          ],
          assessmentActivities: [
            "Contested shooting drill",
            "Game shooting percentage tracking",
            "Various distance consistency test",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Textbook shooting form with high percentage from all areas. Maintains form under game pressure. Team's go-to scorer.",
          observableBehaviors: [
            "Near-perfect form every shot",
            "High percentage shooter",
            "Makes clutch shots",
            "Creates own shot when needed",
            "Form never breaks",
            "Confidence inspires teammates",
          ],
          commonMistakes: [
            "May take too many shots at times",
            "Could involve teammates more occasionally",
          ],
          coachingTips: [
            "How can you help teammates improve their shooting?",
            "What mental routines help you in big moments?",
            "When does the team need you to score versus facilitate?",
            "Continue working to extend range and maintain percentage",
            "Your work ethic is a model for others",
          ],
          assessmentActivities: [
            "Game scoring analysis",
            "Clutch shooting situations",
            "Teaching demonstration",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Shooting is very challenging for young players due to strength requirements. Use lower baskets (8 feet) and smaller balls. Focus on the motion and form rather than making shots. Celebrate proper follow-through regardless of result. Making baskets will come as strength develops - don't sacrifice form for makes.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is the critical age for developing proper shooting form. BEEF fundamentals should be taught and reinforced constantly. Strength is improving so more shots will go in. Keep basket height appropriate - better to use a lower basket with good form than a high basket with bad form. Volume of proper repetitions matters most.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Players should have consistent form and be working on range extension. Focus on shooting under pressure and off movement. Introduce shot selection concepts. This age can handle detailed technical feedback. Connect shooting practice to game situations.",
        },
      },
      redFlags: [
        "Persistent two-handed push after extended form work",
        "No improvement in arc/form after 6+ weeks of instruction",
        "Physical limitations preventing proper arm positioning",
        "Extreme frustration that prevents willingness to practice",
        "Fear of shooting that wasn't present before (may indicate negative experience)",
      ],
      parentExplanation:
        "Form shooting is about building the proper mechanics that allow players to shoot accurately and consistently. We use 'BEEF' - Balance, Eyes on target, Elbow under ball, Follow-through. This is a long-term development skill - it takes thousands of repetitions to build muscle memory. At home, you can help by providing a ball and hoop (even a toy hoop for young players). Focus praise on effort and proper form, not whether shots go in. A great follow-through with a miss is better than a made shot with poor form!",
      homeActivities: [
        "Lying down shooting - shoot straight up, catch, repeat (builds form)",
        "Form shooting on mini hoop or lowered basket",
        "Self-pass and shoot drill",
        "Watch favorite players' shooting form in slow motion",
        "Count makes out of 10 from favorite spot",
        "Wall shooting for follow-through practice",
      ],
      bestAssessedIn: [
        "Individual shooting drills",
        "Catch and shoot situations",
        "Game free throw attempts",
        "Warm-up shooting observation",
      ],
      assessmentFrequency:
        "Weekly observation during shooting drills, formal assessment monthly",
      assessmentDuration: "Observe 10-15 shots from various distances",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Shooting (Layups)",
    slug: "shooting-layups",
    description:
      "The ability to score close to the basket using proper footwork, hand position, and finishing technique.",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 4,
    progressionLevels: {
      1: "Cannot coordinate steps and shot; misses basket frequently; wrong hand/wrong foot",
      2: "Can make layups from dominant side; footwork developing; inconsistent",
      3: "Makes layups from both sides; correct footwork; uses backboard",
      4: "Finishes with either hand; can finish through contact; variety of finishes",
      5: "Elite finisher; creative around rim; finishes against defenders",
    },
    observableBehaviors: [
      "Correct footwork (right-left-jump for right hand)",
      "Uses backboard appropriately",
      "Finishes with correct hand for side",
      "Protects ball on approach",
      "Soft touch on release",
    ],
    commonMistakes: [
      "Wrong foot pattern",
      "Using wrong hand for side",
      "Shooting too hard off backboard",
      "Not jumping off correct foot",
      "Stopping instead of driving through",
    ],
    coachingTips: [
      "'Inside hand, inside foot last' - correct side technique",
      "'Kiss it off the glass!' - soft touch on backboard",
      "'High off one foot!' - drive up, not out",
      "'Protect the ball!' - chin the ball on approach",
      "'Finish through!' - don't stop at the rim",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "shooting",
      "layup",
      "finishing",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot coordinate the steps with the shot. Frequently misses the basket entirely.",
          observableBehaviors: [
            "Steps are uncoordinated",
            "Uses wrong hand",
            "Misses basket frequently",
            "No consistency",
            "May stop at basket",
          ],
          commonMistakes: [
            "Random footwork",
            "Shooting with dominant hand from both sides",
            "Not jumping",
            "Ball released too low or too hard",
          ],
          coachingTips: [
            "Start without ball - footwork only",
            "One step layup from right next to basket",
            "Use 'step-step-up' counting",
            "Lower basket if possible",
          ],
          assessmentActivities: [
            "Layup without ball (footwork)",
            "Layup from next to basket",
            "Mikan drill (slow)",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can make layups from dominant side. Footwork is developing but inconsistent.",
          observableBehaviors: [
            "Makes dominant side layups",
            "Footwork improving",
            "Uses backboard",
            "Weak side difficult",
            "Can make with space",
          ],
          commonMistakes: [
            "Weak side wrong hand/foot",
            "Rushes the approach",
            "Inconsistent footwork",
            "Off backboard too hard",
          ],
          coachingTips: [
            "Extensive weak side practice",
            "'Mirror image' - opposite foot, opposite hand",
            "Slow approach, emphasize footwork",
            "Add dribble approach",
          ],
          assessmentActivities: [
            "Dominant side layup drill",
            "Weak side layup attempts",
            "Layup lines",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Makes layups from both sides with correct technique. Uses backboard effectively.",
          observableBehaviors: [
            "Both sides with correct form",
            "Good use of backboard",
            "Correct footwork both sides",
            "Finishes off dribble",
            "Soft touch",
          ],
          commonMistakes: [
            "Struggles with speed",
            "Contest causes issues",
            "Limited finish variety",
            "May avoid weak side in games",
          ],
          coachingTips: [
            "Add defensive contest",
            "Increase approach speed",
            "Introduce reverse layup",
            "Finishing through contact",
          ],
          assessmentActivities: [
            "Both side layup drills",
            "Layup with passive defender",
            "Game observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Finishes effectively with either hand. Can finish through contact and has variety.",
          observableBehaviors: [
            "Either hand finishing",
            "Finishes through contact",
            "Reverse layups",
            "Variety of finishes",
            "Game-speed execution",
          ],
          commonMistakes: [
            "May attempt difficult finishes when easier available",
            "Could be more physical",
          ],
          coachingTips: [
            "Advanced finishes - euro step, floater",
            "Finishing in traffic",
            "Reading defender to choose finish",
            "Finishing off different moves",
          ],
          assessmentActivities: [
            "1v1 to basket",
            "Finishing drills with contact",
            "Game observation",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite finisher with creative ability around the rim. Scores against defenders consistently.",
          observableBehaviors: [
            "Creative finishes",
            "Scores against contests",
            "Uses body effectively",
            "Multiple finish options",
            "Elite touch",
          ],
          commonMistakes: ["May over-complicate at times"],
          coachingTips: [
            "Continue developing creativity",
            "Finishing under fatigue",
            "Leadership role in drills",
          ],
          assessmentActivities: [
            "Game observation",
            "Contested finishing drills",
            "1v1 full court",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Lower baskets are essential for proper development! Focus on footwork without worrying about making it. Use smaller balls. The coordination will come with practice.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Both sides should be developing. Correct footwork is the priority. Begin using regulation height as appropriate. Lots of repetition needed.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect competent finishing from both sides. Add defender pressure. Work on variety of finishes and finishing through contact.",
        },
      },
      redFlags: [
        "Cannot coordinate steps after extended practice",
        "Persistent wrong hand/wrong foot despite instruction",
        "Fear of approaching the basket",
        "No improvement over several months",
      ],
      parentExplanation:
        "Layups are the highest percentage shot in basketball! We teach proper footwork (for right-hand layup: right foot, left foot, jump off left). Using the backboard ('kiss it off the glass') makes shots easier. The tricky part is using the OPPOSITE hand from the side you're on - right hand from right side, left hand from left side. This takes lots of practice!",
      homeActivities: [
        "Mikan drill at any basket (alternating sides)",
        "Practice footwork without ball at home",
        "Driveway layups (if you have a hoop)",
        "Watch NBA players finish at the rim",
        "Jump off one foot practice (no ball needed)",
      ],
      bestAssessedIn: [
        "Layup lines",
        "Mikan drill",
        "1v1 situations",
        "Fast breaks",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across 2-3 sessions",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Layups - Dominant Hand",
    slug: "layups-dominant-hand",
    description:
      "Finishing at the basket with dominant hand using proper footwork",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 5,
    progressionLevels: {
      1: "Cannot coordinate footwork and shot; wrong foot/hand combination; ball doesn't reach rim",
      2: "Developing footwork; occasional correct foot takeoff; some made layups from close range",
      3: "Consistent footwork; uses backboard effectively; makes 50%+ from short approach",
      4: "Smooth layup from various angles; good finish touch; makes 70%+ in drills",
      5: "Elite finishing; makes layups under contact; creative finishes; ambidextrous capability",
    },
    observableBehaviors: [
      "Takes off from opposite foot (right hand = left foot takeoff)",
      "Drives knee up on shooting side",
      "Uses backboard at proper angle",
      "Soft touch on release",
      "Eyes focused on target throughout",
    ],
    commonMistakes: [
      "Same foot/same hand takeoff",
      "Running too fast, out of control",
      "Shooting directly at rim instead of using backboard",
      "No knee drive - flat jump",
      "Ball released too early or too late",
    ],
    coachingTips: [
      "Which foot should you jump from when shooting with your right hand?",
      "Can you drive your knee up like you're marching in a parade?",
      "Where on the backboard are you aiming - can you show me the spot?",
      "When you missed, was it too hard or too soft? What can you adjust?",
      "The footwork feels awkward at first - that's normal! Keep practicing and it will click",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "shooting",
      "layup",
      "finishing",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot coordinate layup footwork and shooting motion. Uses wrong foot/hand combination and rarely gets ball to rim.",
          observableBehaviors: [
            "Same foot/same hand takeoff",
            "Throws ball at basket without control",
            "No clear footwork pattern",
            "Jumps from both feet or wrong foot",
            "Ball rarely reaches rim",
            "Looks confused about what to do",
          ],
          commonMistakes: [
            "Running through the basket",
            "No jump at all",
            "Two-handed push at basket",
            "Eyes looking everywhere except target",
          ],
          coachingTips: [
            "Let's slow way down - can you take one step and jump?",
            "Which hand is your shooting hand? Now, what's the opposite foot?",
            "Pretend you're stepping over a puddle with your shooting-side knee!",
            "This is tricky at first - everyone struggles. Let's break it into pieces",
            "Great effort! You're getting closer. What felt different on that one?",
          ],
          assessmentActivities: [
            "One step layup (starting close to basket)",
            "Knee drive without ball",
            "Opposite foot/hand identification",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Footwork developing with occasional correct foot takeoff. Makes some layups from close range but inconsistent.",
          observableBehaviors: [
            "Sometimes correct footwork",
            "Getting ball to backboard",
            "Makes 2-3 of 10 layups",
            "Slowing down appropriately",
            "Beginning to use backboard",
            "Can describe proper footwork",
          ],
          commonMistakes: [
            "Reverts to wrong foot under pressure",
            "Inconsistent touch on finish",
            "Approach angle limits options",
            "Still thinking about footwork (not automatic)",
          ],
          coachingTips: [
            "What's your step pattern? Let's say it out loud: step-step-jump!",
            "Which foot did you take off from that time? Was it the right one?",
            "Where should the ball hit the backboard - high, low, or middle of the square?",
            "You're making progress! The footwork is starting to feel more natural, right?",
            "Mistakes help us learn. What did that miss teach you?",
          ],
          assessmentActivities: [
            "Two-step layup drill from both sides",
            "Footwork check - count correct takeoffs of 10",
            "Backboard targeting drill",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Consistent layup footwork and technique. Uses backboard effectively and makes 50%+ from short approach.",
          observableBehaviors: [
            "Footwork automatic/correct",
            "Effective backboard use",
            "Makes 5+ of 10 layups",
            "Good touch and control",
            "Approaches from different angles",
            "Confident at the rim",
          ],
          commonMistakes: [
            "May struggle with speed dribble to layup",
            "Off-angle layups less consistent",
            "Contested layups challenging",
            "Non-dominant hand layup weak",
          ],
          coachingTips: [
            "Can you finish the layup after dribbling at game speed?",
            "What happens when there's a defender at the rim?",
            "How might you finish differently coming from the baseline versus the wing?",
            "Your dominant hand layup is solid. Ready to start working on the other side?",
            "Great finish! You stayed in control all the way through",
          ],
          assessmentActivities: [
            "Dribble-to-layup from three-point line",
            "Layups from various angles",
            "Transition layup drill",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Smooth layups from various angles and situations. Good finishing touch even with defense present. High percentage in drills.",
          observableBehaviors: [
            "Makes 7+ of 10 in drills",
            "Finishes with either hand",
            "Adapts finish to defense",
            "Good body control",
            "Various finishes (regular, reverse, floater)",
            "Confident under pressure",
          ],
          commonMistakes: [
            "May force difficult finishes",
            "Could use more variety occasionally",
            "Contact sometimes disrupts finish",
          ],
          coachingTips: [
            "What finish options do you have when the defender cuts off your angle?",
            "When is a floater better than a traditional layup?",
            "How do you finish through contact without losing control?",
            "Your finishing ability creates problems for defenses. Keep expanding your options!",
            "You've worked hard to develop this. Trust your ability at the rim",
          ],
          assessmentActivities: [
            "Contested layup drills",
            "Game finishing percentage tracking",
            "Various finish demonstration",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite finisher at the rim. Makes layups under contact with creative finishes. Truly ambidextrous around the basket.",
          observableBehaviors: [
            "Makes contested layups consistently",
            "Multiple creative finishes",
            "Both hands equally effective",
            "Adjusts mid-air when needed",
            "Elite body control",
            "Makes difficult finishes look easy",
          ],
          commonMistakes: [
            "May attempt very difficult finishes",
            "Could pass out sometimes when appropriate",
          ],
          coachingTips: [
            "What new finish can you add to your game?",
            "How can you help teammates improve their finishing?",
            "When should you pass out versus force a tough finish?",
            "Your finishing ability is elite. Continue challenging yourself!",
            "Your creativity at the rim inspires teammates",
          ],
          assessmentActivities: [
            "Game finishing analysis",
            "Creative finish showcase",
            "Teaching demonstration to others",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Layup coordination is challenging at this age. Use lower baskets to allow proper technique development. Focus on the footwork pattern without worrying about makes. The opposite foot/opposite hand concept is confusing - be patient! Make it fun with games and challenges. Celebrate proper steps even when shots miss.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is the ideal age to cement proper layup technique. Footwork should become automatic with repetition. Introduce finishing from different angles. Begin working on non-dominant hand layups. Connect layups to game situations with simple drives. Most players show significant improvement at this age.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect consistent layup mechanics with game application. Focus on finishing under pressure and with defense. Introduce various finishes (reverse, floater). Both hands should be developing. Connect finishing to team offense concepts.",
        },
      },
      redFlags: [
        "Cannot identify correct takeoff foot after multiple explanations",
        "Persistent same-foot/same-hand takeoff despite consistent practice",
        "Fear of going to the basket (may indicate previous injury or negative experience)",
        "No improvement in footwork over 6+ weeks",
        "Physical coordination issues affecting running and jumping combination",
      ],
      parentExplanation:
        "Layups require coordinating running, jumping, and shooting all at once - it's actually quite complex! We teach 'opposite foot, opposite hand' - when shooting with the right hand, jump off the left foot. This is counterintuitive at first but becomes natural with practice. Using the backboard ('the shooter's best friend') increases accuracy. At home, practice the footwork pattern without a ball, then add the ball. Patience is key - this skill clicks suddenly after lots of practice!",
      homeActivities: [
        "Footwork practice without ball (step-step-jump pattern)",
        "Layups on lowered hoop or playground basket",
        "Knee drive practice against wall",
        "Watch NBA layups in slow motion",
        "Mikan drill (alternating layups) on low hoop",
        "Practice approach from different angles",
      ],
      bestAssessedIn: [
        "Layup lines during practice",
        "Transition drills",
        "Game fast break situations",
        "Individual skill work",
      ],
      assessmentFrequency:
        "Weekly observation during drills, formal assessment monthly",
      assessmentDuration: "Observe 10 layup attempts from various situations",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "fundamentals",
    name: "Shooting (Jump Shot)",
    slug: "shooting-jump-shot",
    description:
      "The ability to shoot the basketball with proper form including footwork, hand position, and follow-through.",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 5,
    progressionLevels: {
      1: "Throws ball at basket; no consistent form; rarely makes shots",
      2: "Developing form; can make close shots; range very limited",
      3: "Consistent form; makes open shots from mid-range; developing range",
      4: "Reliable shooter; good range; can shoot off dribble; makes contested shots",
      5: "Elite shooter; unlimited range; consistent in pressure situations",
    },
    observableBehaviors: [
      "Feet square to basket",
      "Elbow under ball, not out",
      "Ball starts at set point consistently",
      "Follow-through with wrist flick",
      "Arc on shot",
    ],
    commonMistakes: [
      "Elbow flying out",
      "No arc (flat shot)",
      "Inconsistent set point",
      "Feet not set",
      "Pushing ball rather than shooting",
    ],
    coachingTips: [
      "'Elbow under the ball!' - alignment",
      "'Reach into the cookie jar!' - follow-through",
      "'Snap your wrist!' - backspin",
      "'Feet first!' - set your feet before shooting",
      "'Arc it!' - ball should rainbow into basket",
    ],
    tags: ["core", "technical", "fundamental", "shooting", "jump-shot"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player throws the ball at the basket without consistent form. Makes very few shots.",
          observableBehaviors: [
            "No consistent technique",
            "Throws rather than shoots",
            "Rarely makes baskets",
            "No set point",
            "Flat or wild trajectory",
          ],
          commonMistakes: [
            "Two-hand push shot",
            "Shot from hip",
            "No wrist action",
            "Body not square",
          ],
          coachingTips: [
            "Start VERY close to basket (3-4 feet)",
            "Form shooting - one hand, no jump",
            "Use smaller/lighter balls if needed",
            "Focus on follow-through only first",
          ],
          assessmentActivities: [
            "Form shooting from 4 feet",
            "One-hand release practice",
            "Make 5 from close range",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Form is developing. Can make some close shots. Range is very limited.",
          observableBehaviors: [
            "Form emerging",
            "Makes some close shots",
            "Set point developing",
            "Some follow-through",
            "Limited range",
          ],
          commonMistakes: [
            "Inconsistent form",
            "Shoots differently when farther",
            "Elbow still wanders",
            "Flat shots",
          ],
          coachingTips: [
            "Don't extend range until form is solid",
            "50-100 form shots daily",
            "BEEF: Balance, Eyes, Elbow, Follow-through",
            "Partner rebounding for rhythm",
          ],
          assessmentActivities: [
            "Form shooting at 6-8 feet",
            "Spot shooting close range",
            "Free throws",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Consistent form with reasonable accuracy from mid-range. Developing three-point range.",
          observableBehaviors: [
            "Consistent technique",
            "Makes open mid-range shots",
            "Good arc on shot",
            "Proper follow-through",
            "Feet square to basket",
          ],
          commonMistakes: [
            "Form changes under pressure",
            "Off-the-dribble shooting weak",
            "May rush shots",
            "Contested shots difficult",
          ],
          coachingTips: [
            "Game-speed shooting",
            "Catch and shoot drills",
            "Off-the-dribble introduction",
            "Shot selection teaching",
          ],
          assessmentActivities: [
            "Spot shooting from mid-range",
            "Catch and shoot drill",
            "Game observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Reliable shooter with good range. Can shoot off the dribble and makes contested shots.",
          observableBehaviors: [
            "Consistent at range",
            "Off-the-dribble shooting",
            "Makes contested shots",
            "Quick release",
            "Good shot selection",
          ],
          commonMistakes: [
            "May force difficult shots",
            "Could be more efficient",
          ],
          coachingTips: [
            "Advanced shooting - off screens, step-backs",
            "Shooting under fatigue",
            "Shot selection refinement",
            "Clutch shooting practice",
          ],
          assessmentActivities: [
            "Shooting off movement",
            "Contested shooting drills",
            "Game statistics",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite shooter with unlimited range. Consistent under pressure. Creates own shot.",
          observableBehaviors: [
            "Elite accuracy",
            "Unlimited range",
            "Pressure doesn't affect",
            "Creates own shot",
            "Quick release",
          ],
          commonMistakes: ["May over-shoot when other options better"],
          coachingTips: [
            "Maintain through varied practice",
            "Leadership in shooting drills",
            "Help others with form",
            "Continue challenging range/speed",
          ],
          assessmentActivities: [
            "Game statistics",
            "Pressure shooting drills",
            "Shooting competitions",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Use smaller balls and lower baskets! Developing proper form is more important than making shots. Start very close to basket. Range will come later - form must come first.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Form should be solidifying. Resist the urge to shoot from too far. Build from close range outward. Free throw practice is excellent at this age.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Range can extend appropriately. Off-the-dribble shooting develops. Focus on game-speed shooting and shot selection.",
        },
      },
      redFlags: [
        "Persistent poor form despite instruction",
        "Cannot make shots from close range",
        "Physical limitations affecting shooting motion",
        "No improvement over extended period",
      ],
      parentExplanation:
        "Shooting form is crucial - we use BEEF: Balance, Eyes on target, Elbow under ball, Follow-through. The biggest mistake is shooting from too far before form is solid. We start close and only extend range when technique is consistent. At home, form shooting from very close (even without a basket - just release) builds good habits. 50 good-form shots is better than 200 bad ones!",
      homeActivities: [
        "Form shooting - lay on back, shoot straight up, catch",
        "Close-range shooting if you have access to a hoop",
        "Free throw routine practice",
        "Watch great shooters and notice their form",
        "'Chair shooting' - sitting down for form",
      ],
      bestAssessedIn: [
        "Spot shooting drills",
        "Free throw shooting",
        "Game situations",
        "Shooting off catch",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe form consistency across sessions",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "skill-building",
    name: "Dribbling on the Move",
    slug: "dribbling-on-the-move",
    description: "Controlling the ball while moving at various speeds",
    introductionAge: 9,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 6,
    progressionLevels: {
      1: "Loses ball frequently while moving; stops to dribble; watches ball constantly; cannot change direction",
      2: "Can dribble while walking slowly; control decreases with speed; beginning weak hand work",
      3: "Comfortable dribbling at moderate speed with both hands; can change direction; head up more often",
      4: "Strong dribbling at game speed; protects ball; maintains court vision; changes pace effectively",
      5: "Elite ball handling on the move; creates opportunities; full court vision; ambidextrous mastery",
    },
    observableBehaviors: [
      "Maintains dribble while running without losing control",
      "Uses appropriate hand based on direction and defender",
      "Keeps head up to see teammates and court",
      "Protects ball with body positioning",
      "Changes pace and direction without losing control",
    ],
    commonMistakes: [
      "Dribbling too high while running (ball bounces away)",
      "Looking down at ball instead of up at court",
      "Using only dominant hand regardless of direction",
      "Running faster than dribble control allows",
      "Failing to protect ball from defenders",
      "Stopping forward momentum to regain control",
    ],
    coachingTips: [
      "What happens to your dribble when you try to run faster? How can you stay in control?",
      "Which hand should you use when a defender is on your right side? Why?",
      "Can you tell me how many fingers I'm holding up while you dribble down the court?",
      "When the ball gets away, that's learning! What did you notice right before you lost it?",
      "Effort on your weak hand now will make you unstoppable later. Keep pushing through the mistakes!",
      "What's one thing you can do to protect the ball from a defender while moving?",
    ],
    tags: [
      "technical",
      "ball-handling",
      "dribbling",
      "movement",
      "skill-building",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player struggles to maintain ball control while moving. Frequently loses the ball, stops to dribble, or watches the ball constantly while walking.",
          observableBehaviors: [
            "Ball escapes within 3-5 dribbles while moving",
            "Stops moving to regain control of dribble",
            "Eyes fixed on ball, cannot see court",
            "Uses only dominant hand",
            "Runs into obstacles or other players",
            "Cannot change direction while dribbling",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Can maintain a basic dribble while walking or jogging slowly. Control decreases significantly when speed increases or direction changes are required.",
          observableBehaviors: [
            "Maintains dribble while walking for 10+ seconds",
            "Can jog slowly with ball for short distances",
            "Glances up occasionally while moving",
            "Beginning to use weak hand in controlled settings",
            "Slows down to maintain control",
            "Can change direction if given time",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Comfortable dribbling at moderate speed with either hand. Can change direction and navigate around obstacles while maintaining reasonable control.",
          observableBehaviors: [
            "Dribbles at jogging speed with control",
            "Changes direction without losing ball",
            "Head up 50%+ of the time while moving",
            "Uses both hands depending on direction",
            "Navigates around cones/obstacles",
            "Can speed up or slow down on command",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Strong dribbling at game speed with either hand. Maintains control through traffic, changes pace effectively, and keeps head up to see the court.",
          observableBehaviors: [
            "Dribbles at full speed with control",
            "Protects ball with body while moving",
            "Head up 80%+ of time, sees teammates",
            "Changes pace to beat defenders",
            "Comfortable in traffic",
            "Both hands nearly equal",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite ball handler on the move. Can navigate any situation at any speed while maintaining complete court vision and creating opportunities for self and teammates.",
          observableBehaviors: [
            "Elite control at all speeds",
            "Full court vision while handling",
            "Creates scoring opportunities while moving",
            "Beats defenders with pace changes",
            "Ambidextrous mastery",
            "Leads fast breaks effectively",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Cannot dribble while walking after 4+ weeks of practice",
        "Consistently runs into obstacles or other players",
        "Extreme frustration leading to refusal to practice",
        "No improvement in weak hand usage over extended period",
        "Physical coordination issues affecting running and dribbling combination",
      ],
      parentExplanation:
        "Dribbling on the move is essential for playing real basketball - players must be able to advance the ball while running and looking for teammates. We teach players to keep the ball low (knee height), use the hand away from defenders, and look up to see the court. This skill takes many hours of practice! At home, any dribbling practice helps - even dribbling while walking around the house or down the driveway builds the necessary coordination.",
      homeActivities: [
        "Dribble walks around the neighborhood (safe areas)",
        "Dribble through backyard obstacle courses",
        "Dribble while a parent calls out numbers to identify",
        "Weak hand only dribble walks",
        "Speed control practice - slow, medium, fast on command",
        "Dribble tag games with siblings or parents",
      ],
      assessmentFrequency:
        "Every 2-3 weeks observation, formal assessment monthly",
      assessmentDuration:
        "Observe across multiple speed levels and directions. Note differences between dominant and weak hand control.",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "skill-building",
    name: "Layups - Weak Hand",
    slug: "layups-weak-hand",
    description: "Finishing at the basket with non-dominant hand",
    introductionAge: 9,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 7,
    progressionLevels: {
      1: "Cannot coordinate weak hand layup; uses wrong footwork or switches to dominant hand",
      2: "Attempting weak hand with developing footwork; success rate low but improving",
      3: "Consistent weak hand form with moderate success; footwork automatic; growing confidence",
      4: "Strong weak hand finishing; can finish under light pressure; weak side becoming weapon",
      5: "Elite weak hand that mirrors dominant; finishes through contact; defenders cannot overplay",
    },
    observableBehaviors: [
      "Takes off from correct foot (opposite of shooting hand)",
      "Completes layup with non-dominant hand",
      "Uses backboard effectively from weak side angles",
      "Drives knee up on shooting side",
      "Shows confidence approaching basket from weak side",
    ],
    commonMistakes: [
      "Switching to dominant hand at last moment",
      "Using same-foot/same-hand takeoff (should be opposite)",
      "Approaching from wrong angle for weak hand",
      "No knee drive - flat jump",
      "Releasing ball too early or too late",
      "Not using backboard when appropriate",
    ],
    coachingTips: [
      "Which foot do you jump from when shooting with your left hand? (Right foot for left hand shot)",
      "What happens to your options if you can only finish with one hand? Defenders love that!",
      "Can you drive your opposite knee up high like a marching soldier?",
      "Mistakes on your weak hand are expected - that's exactly how you develop it!",
      "Every weak hand attempt makes you a better player, even the misses. Keep the effort high!",
      "Where on the backboard should you aim from this angle?",
    ],
    tags: ["technical", "finishing", "layup", "weak-hand", "skill-building"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot coordinate weak hand layup. Uses wrong footwork, wrong hand, or reverts to dominant hand at the basket.",
          observableBehaviors: [
            "Switches to dominant hand before shooting",
            "Same foot/same hand takeoff (incorrect)",
            "Ball rarely reaches rim with weak hand",
            "Looks confused about footwork",
            "No confidence approaching weak side",
            "Avoids weak hand layup attempts",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Attempting weak hand layups with developing footwork. Success rate is low but showing understanding of the technique.",
          observableBehaviors: [
            "Occasionally correct footwork",
            "Gets ball to backboard sometimes",
            "Makes 1-2 of 10 attempts",
            "Thinking through each step",
            "More willing to try weak side",
            "Can describe proper technique",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Consistent weak hand layup form with moderate success rate. Footwork is automatic and player shows confidence on weak side.",
          observableBehaviors: [
            "Correct footwork 80%+ of attempts",
            "Makes 4-5 of 10 layups",
            "Uses backboard effectively",
            "Approaches from various angles",
            "Smooth transition from dribble",
            "Growing confidence on weak side",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Strong weak hand finishing with high success rate. Can finish weak side layups under light pressure and in game situations.",
          observableBehaviors: [
            "Makes 7+ of 10 in drills",
            "Finishes under light contest",
            "Various finish options",
            "Game-speed execution",
            "Attacks weak side confidently",
            "Weak side becoming a weapon",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite weak hand finishing that mirrors dominant hand. Can score creatively from weak side under heavy pressure.",
          observableBehaviors: [
            "Equal proficiency both hands",
            "Finishes through contact",
            "Multiple creative finishes",
            "Attacks weak side by choice",
            "Defenders cannot overplay",
            "Makes difficult finishes look easy",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Complete avoidance of weak side approaches after extended practice",
        "Persistent same-foot/same-hand pattern despite correction",
        "No improvement in makes after 6+ weeks of focused practice",
        "Frustration leading to refusal to attempt weak hand",
        "Physical limitation preventing opposite foot takeoff",
      ],
      parentExplanation:
        "Weak hand layups are crucial because defenders will try to force your child to their weak side. If they can only finish with one hand, opponents will take that away! We teach opposite foot takeoff (left hand = right foot jump) which feels awkward at first but becomes natural. At home, encourage any weak hand practice - even bouncing a ball with their non-dominant hand builds coordination. Be patient - this skill takes time but is incredibly valuable.",
      homeActivities: [
        "Weak hand ball bouncing and catching games",
        "Footwork practice without ball (step-step-jump pattern)",
        "Mini hoop weak hand layups",
        "Mikan drill on lowered hoop",
        "Watch NBA players finish with both hands",
        "Brush teeth, eat with non-dominant hand (builds general coordination)",
      ],
      assessmentFrequency:
        "Weekly observation during drills, formal assessment bi-weekly",
      assessmentDuration:
        "Compare weak hand success rate to dominant hand. Look for footwork consistency and willingness to attempt weak side.",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "development",
    name: "Pull-Up Jump Shot",
    slug: "pull-up-jump-shot",
    description: "Stopping off the dribble to shoot a jump shot",
    introductionAge: 11,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 8,
    progressionLevels: {
      1: "Cannot transition from dribble to shot; travels or loses balance; form breaks down",
      2: "Beginning to coordinate stop and shot; footwork developing; limited consistency",
      3: "Executes pull-up with proper footwork; makes open shots from mid-range",
      4: "Effective pull-up from various distances; creates shot against defenders",
      5: "Elite pull-up shooter; scores from anywhere; creates own shot consistently",
    },
    observableBehaviors: [
      "Gathers ball legally while stopping dribble",
      "Maintains balance through the stop and shot",
      "Keeps same shooting form as stationary shot",
      "Jumps straight up rather than drifting",
      "Makes good decisions about when to pull up",
    ],
    commonMistakes: [
      "Traveling during the gather and stop",
      "Leaning forward or backward during shot",
      "Rushing the shot without proper balance",
      "Jumping too far forward instead of straight up",
      "Losing shot form due to defender pressure",
      "Attempting from too far before ready",
    ],
    coachingTips: [
      "What does your body feel like when you stop - are you balanced or falling?",
      "Can you show me how to gather the ball while your last dribble is happening?",
      "Where should your momentum go - forward toward defender or straight up?",
      "That attempt wasn't balanced - what can you adjust? That's learning!",
      "The effort to develop this shot will make you very hard to guard. Keep working!",
      "What tells you it's time to pull up versus continue driving?",
    ],
    tags: ["technical", "shooting", "scoring", "mid-range", "development"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Cannot transition from dribble to jump shot. Stops completely, travels, or throws ball without proper shooting form.",
          observableBehaviors: [
            "Travels when attempting to stop",
            "Cannot gather the ball properly",
            "Off-balance on jump",
            "Shot form breaks down completely",
            "Ball rarely reaches rim",
            "Avoids pull-up attempts",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to coordinate stop and shot. Footwork is developing but shot consistency and balance are limited.",
          observableBehaviors: [
            "Sometimes stops legally",
            "Gathers ball with control occasionally",
            "Balance improving on jump",
            "Some shots reach rim",
            "Better from dominant side",
            "Attempts more frequently",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Executes pull-up with proper footwork and reasonable form. Can make open pull-ups from mid-range.",
          observableBehaviors: [
            "Legal footwork consistently",
            "Proper gather and jump",
            "Balanced at release",
            "Makes 30-40% from mid-range",
            "Uses from either direction",
            "Shot form mostly maintained",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Effective pull-up jump shot from various distances and angles. Can create and make this shot against defenders.",
          observableBehaviors: [
            "Makes 40-50% from mid-range",
            "Quick release",
            "Effective against closeouts",
            "Uses off screens and drives",
            "Good shot selection",
            "Creates separation",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite pull-up shooter who can score from anywhere on the court. Creates own shot consistently against tight defense.",
          observableBehaviors: [
            "Makes 50%+ from mid-range",
            "Unguardable release",
            "Range extends to three-point",
            "Scores against any defense",
            "Go-to scorer for team",
            "Clutch in big moments",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Cannot stop without traveling after extended practice",
        "Persistent balance issues despite footwork corrections",
        "Shot form completely different from stationary form",
        "No improvement in accuracy over 6+ weeks",
        "Fear of attempting pull-up with defender present",
      ],
      parentExplanation:
        "The pull-up jump shot is when a player dribbles, stops quickly, and shoots - it's a crucial weapon because defenders can't easily block it. We teach proper footwork (1-2 step or jump stop), gathering the ball during the stop, and shooting with the same form as a set shot. This is an advanced skill that requires mastering dribbling and shooting separately first. At home, your child can practice the footwork and gather without a basket.",
      homeActivities: [
        "Footwork practice - dribble and stop without shooting",
        "Stationary form shooting to maintain mechanics",
        "Watch elite players' pull-up technique in slow motion",
        "Balance board or single leg exercises",
        "Shadow dribble-stop-shoot motion",
        "Practice on lowered or mini hoop if available",
      ],
      assessmentFrequency:
        "Weekly observation during shooting drills, formal assessment monthly",
      assessmentDuration:
        "Assess footwork legality, balance at release, and shot form maintenance separately before evaluating makes.",
    },
  },
  {
    sport: "basketball",
    domain: "technical",
    stage: "development",
    name: "Crossover Dribble",
    slug: "crossover-dribble",
    description: "Changing direction with a quick crossover dribble",
    introductionAge: 11,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 9,
    progressionLevels: {
      1: "Cannot execute crossover; ball bounces away or goes wrong direction",
      2: "Can perform stationary crossover; move is slow and telegraphed",
      3: "Executes crossover while moving; uses to change direction effectively",
      4: "Quick, deceptive crossover that beats defenders; sets up with hesitation",
      5: "Elite crossover that breaks down any defender; multiple variations and combinations",
    },
    observableBehaviors: [
      "Keeps ball low during crossover (below knee height)",
      "Changes direction quickly after crossover",
      "Sells initial direction before crossing",
      "Maintains balance through the move",
      "Uses crossover to beat defender in game situations",
    ],
    commonMistakes: [
      "Crossing ball too high (should be below knee)",
      "No change of pace before crossover",
      "Telegraphing the move (defender knows it's coming)",
      "Eyes on ball during crossover",
      "Not selling the initial direction",
      "Losing balance or momentum during move",
    ],
    coachingTips: [
      "How low can you keep the ball during your crossover? Lower = harder to steal!",
      "What can you do to make the defender think you're going the other direction first?",
      "Can you do the crossover without looking at the ball? What do you see?",
      "That crossover was stolen - what made it easy for the defender? Learning moment!",
      "Keep pushing your speed on the crossover. Mistakes mean you're challenging yourself!",
      "What happens if you hesitate right before the crossover? Try it!",
    ],
    tags: [
      "technical",
      "ball-handling",
      "dribbling",
      "moves",
      "skill-building",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Cannot execute basic crossover. Ball bounces too high, goes out of control, or player loses ball attempting the move.",
          observableBehaviors: [
            "Ball bounces away on crossover attempt",
            "Crossover too high (easy to steal)",
            "Loses balance during move",
            "Ball goes wrong direction",
            "No change of pace",
            "Avoids crossover attempts",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Can perform stationary crossover with some control. Move is slow and telegraphed but ball stays with player.",
          observableBehaviors: [
            "Completes stationary crossover",
            "Ball control improving",
            "Still looks at ball during move",
            "Move is slow/predictable",
            "Some success when stationary",
            "Struggles with crossover while moving",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Executes crossover with control while moving. Uses move to change direction effectively in drills.",
          observableBehaviors: [
            "Crossover while moving",
            "Ball stays low and protected",
            "Head up more during move",
            "Changes direction effectively",
            "Uses in breakdown drills",
            "Beginning to sell the move",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Quick, deceptive crossover that beats defenders. Uses pace change and sets up crossover with hesitation.",
          observableBehaviors: [
            "Beats defenders with crossover",
            "Quick change of direction",
            "Sets up with hesitation",
            "Uses in games effectively",
            "Protects ball during move",
            "Creates driving lanes",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite crossover that breaks down defenders consistently. Uses multiple setups, speeds, and combinations.",
          observableBehaviors: [
            "Elite quickness and deception",
            "Multiple crossover variations",
            "Creates at will against any defender",
            "Combines with other moves",
            "Signature move repertoire",
            "Unguardable in isolation",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Cannot execute stationary crossover after multiple weeks of practice",
        "Persistent high dribble despite correction",
        "No improvement in speed of move over 4+ weeks",
        "Balance issues affecting all lateral movements",
        "Frustration leading to avoidance of move",
      ],
      parentExplanation:
        "The crossover dribble is a fundamental move where the player quickly bounces the ball from one hand to the other to change direction and beat a defender. We teach players to keep the ball low (knee height or below), sell the initial direction to freeze the defender, then cross quickly. At home, any crossover practice helps - between the legs of a chair, around cones, or just stationary in the driveway. The key is thousands of repetitions!",
      homeActivities: [
        "Stationary crossover practice (100 reps daily goal)",
        "Crossover around cones or household objects",
        "Watch favorite players' crossover in slow motion",
        "Crossover while walking, then jogging",
        "Two-ball dribbling for advanced challenge",
        "Crossover games with family members",
      ],
      assessmentFrequency:
        "Every 2-3 weeks observation, formal assessment monthly",
      assessmentDuration:
        "Observe ball height, speed of execution, and head position. Compare stationary versus moving crossover success.",
    },
  },
  {
    sport: "basketball",
    domain: "tactical",
    stage: "fundamentals",
    name: "Court Spacing",
    slug: "court-spacing",
    description:
      "The ability to position oneself appropriately on offense to create passing lanes, driving lanes, and scoring opportunities.",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 10,
    progressionLevels: {
      1: "Bunches with teammates; follows ball; doesn't understand spacing",
      2: "Beginning to spread out with reminders; understands concept but forgets",
      3: "Maintains spacing in half-court (12-15 foot rule); moves to fill empty spots",
      4: "Excellent spacing; creates driving lanes; relocates after passes",
      5: "Elite court awareness; manipulates defense with positioning; organizes teammates",
    },
    observableBehaviors: [
      "Maintains appropriate distance from teammates (about 12-15 feet)",
      "Fills empty spots on court",
      "Stays out of teammate's driving lane",
      "Moves to open areas when ball moves",
      "Creates passing angles",
    ],
    commonMistakes: [
      "Standing too close to ball handler",
      "Bunching with other players",
      "Standing in driving lanes",
      "Not moving when ball moves",
      "Hiding from the ball",
    ],
    coachingTips: [
      "'Space the floor!' - spread out",
      "'Fill the spot!' - move to empty areas",
      "'Don't clog!' - stay out of driving lanes",
      "'Ball moves, you move!' - relocate with ball",
      "'Be seen!' - give passer a target",
    ],
    tags: ["core", "tactical", "fundamental", "spacing", "positioning"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player has no concept of spacing. Follows the ball and bunches with teammates.",
          observableBehaviors: [
            "Follows ball everywhere",
            "Stands next to teammates",
            "In ball handler's way",
            "No awareness of spacing",
            "Crowds the paint",
          ],
          commonMistakes: [
            "Running toward ball handler",
            "Standing directly behind players",
            "All players on one side",
            "Paint always crowded",
          ],
          coachingTips: [
            "Use spots/markers on floor",
            "'Stay in your spot!'",
            "Freeze play and show spacing",
            "Simple 4-out shell positioning",
          ],
          assessmentActivities: [
            "4-out shell spacing",
            "Spot-standing game",
            "Game observation",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Understands spacing concept but needs constant reminders. Beginning to spread out.",
          observableBehaviors: [
            "Spreads out when reminded",
            "Understands concept",
            "Forgets during play",
            "Sometimes finds spots",
            "Improving awareness",
          ],
          commonMistakes: [
            "Forgets in heat of game",
            "Defaults to bunching",
            "Doesn't move with ball",
            "Stands in one spot too long",
          ],
          coachingTips: [
            "Constant spacing calls",
            "Simple movement patterns",
            "'Ball moves, you move!'",
            "Praise good spacing",
          ],
          assessmentActivities: [
            "5v0 spacing walk-through",
            "Shell drill with movement",
            "Game observation",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Maintains good spacing in half-court sets, understanding the 12-15 foot rule. Moves to fill empty spots consistently.",
          observableBehaviors: [
            "Maintains spacing",
            "Fills empty spots",
            "Moves when ball moves",
            "Stays out of driving lanes",
            "Creates passing angles",
          ],
          commonMistakes: [
            "Transition spacing weaker",
            "May stand and watch",
            "Doesn't always relocate after pass",
            "Could be more dynamic",
          ],
          coachingTips: [
            "Add transition spacing",
            "Spacing plus cutting",
            "Relocate after passing",
            "Reading defense to find space",
          ],
          assessmentActivities: [
            "5v5 half-court",
            "Transition drills",
            "Game observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent court awareness. Creates driving lanes for teammates and relocates intelligently.",
          observableBehaviors: [
            "Creates lanes for others",
            "Excellent relocation",
            "Reads defense",
            "Vocal about spacing",
            "Dynamic movement",
          ],
          commonMistakes: [
            "May expect others to space equally",
            "Could organize more",
          ],
          coachingTips: [
            "Leadership in spacing",
            "Help organize teammates",
            "Advanced spacing concepts",
            "Counter when defense adjusts",
          ],
          assessmentActivities: [
            "Full games",
            "Scrimmage observation",
            "Leadership assessment",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite court awareness. Manipulates defense with positioning. Organizes teammates' spacing.",
          observableBehaviors: [
            "Manipulates defense",
            "Organizes team spacing",
            "Creates advantages",
            "Elite awareness",
            "Always in right spot",
          ],
          commonMistakes: ["May be frustrated with less aware teammates"],
          coachingTips: [
            "Leadership development",
            "Teaching others",
            "Advanced concepts",
            "Maintaining standards",
          ],
          assessmentActivities: [
            "Game film review",
            "Full game observation",
            "Team spacing analysis",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Bunching is completely normal! Young players are drawn to the ball. Use floor markers and constant reminders. Keep expectations reasonable - this is a complex concept.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Spacing should be improving. Use simple patterns and rules. 'Stay spread out' becomes more consistent. Ball movement helps spacing naturally.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good understanding of spacing. Work on dynamic movement and creating for others. Reading defense to find space is key development.",
        },
      },
      redFlags: [
        "Cannot understand basic spacing concepts",
        "Persistent ball-following despite instruction",
        "No improvement over extended period",
        "Avoids open positions consistently",
      ],
      parentExplanation:
        "Spacing is about where players stand on offense. When everyone spreads out, there are lanes to drive to the basket and room to pass. Young players naturally bunch together near the ball - this is normal! We teach them to 'fill spots' on the court and move when the ball moves. Watch basketball on TV and notice how spread out good teams are!",
      homeActivities: [
        "Watch basketball and notice floor spacing",
        "Discuss 'where should you stand?' scenarios",
        "Draw court positions on paper",
        "Play video games that show spacing concepts",
      ],
      bestAssessedIn: [
        "Half-court offense",
        "5v5 play",
        "Scrimmages",
        "Shell drill",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple game situations",
    },
  },
  {
    sport: "basketball",
    domain: "tactical",
    stage: "fundamentals",
    name: "Help Defense",
    slug: "help-defense",
    description:
      "The ability to provide defensive support for teammates, including positioning to help and recover, and protecting the basket.",
    introductionAge: 8,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 11,
    progressionLevels: {
      1: "Only guards assigned player; no awareness of help opportunities; doesn't see ball",
      2: "Beginning to understand help concept; helps when reminded; positioning inconsistent",
      3: "Understands and executes basic help; proper positioning; rotates on drives",
      4: "Strong help defender; anticipates plays; disrupts offense; recovers quickly",
      5: "Elite help defender who anchors team defense; reads entire offense; makes teammates better",
    },
    observableBehaviors: [
      "Maintains proper help side position (sees ball and player)",
      "Rotates to stop ball when teammate is beaten",
      "Communicates 'help' calls to teammates",
      "Recovers to own player after helping",
      "Contests shots in the paint when in position",
    ],
    commonMistakes: [
      "Ball-watching without maintaining player awareness",
      "Helping too late when drive is already at the rim",
      "Leaving corner shooter to help unnecessarily",
      "Not recovering to own player after helping",
      "Helping from wrong position (too far away)",
      "Not communicating help to teammates",
    ],
    coachingTips: [
      "Where should you be standing when your teammate is guarding the ball? (One pass away = deny, two passes away = help position)",
      "Can you see both the ball and your player right now? Show me your vision",
      "When your teammate gets beat, what should you do? What happens to your player?",
      "That time you didn't help - what information would have helped you know to help?",
      "Great help! Even though they scored, your effort disrupted the play. That's team defense!",
      "What do you yell to tell your teammates you're helping?",
    ],
    tags: ["tactical", "defense", "team-defense", "rotations", "development"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player only guards their assigned player. No awareness of teammates' defensive situations or when help is needed.",
          observableBehaviors: [
            "Watches only their player",
            "No help when teammate beaten",
            "Doesn't see ball when guarding",
            "Out of position to help",
            "No communication on defense",
            "Surprised when asked to help",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand help concept. Will help when reminded but positioning and timing are inconsistent.",
          observableBehaviors: [
            "Helps when coach calls for it",
            "Starting to see ball and player",
            "Help positioning developing",
            "Sometimes rotates correctly",
            "Beginning to communicate",
            "Returns to player late",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Understands and executes basic help defense. Positions in correct spots and rotates when drives occur.",
          observableBehaviors: [
            "Proper help side position",
            "Rotates on drives correctly",
            "Sees ball and player",
            "Communicates 'help' calls",
            "Recovers to own player",
            "Contests shots in paint",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Strong help defender who reads plays before they happen. Disrupts offense with active help and recovery.",
          observableBehaviors: [
            "Anticipates drives before they happen",
            "Excellent help positioning",
            "Quick rotations",
            "Draws charges occasionally",
            "Leads defensive communication",
            "Helps and recovers quickly",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite help defender who anchors team defense. Reads entire offense, helps teammates, and recovers without giving up easy baskets.",
          observableBehaviors: [
            "Quarterback of team defense",
            "Helps without giving up corner 3s",
            "Multiple rotations per possession",
            "Consistent charge drawing",
            "Makes teammates better defenders",
            "Creates steals from help position",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Cannot understand see ball/see player concept after multiple explanations",
        "Never helps teammates despite repeated instruction",
        "Cannot physically get to help position in time",
        "Consistently in wrong position despite practice",
        "Refuses to communicate on defense",
      ],
      parentExplanation:
        "Help defense means being ready to stop an opponent who beats your teammate while still being aware of your own player. We teach 'see ball, see player' - one foot to ball, one foot to player, so you can react to both. It's like being a lifeguard watching the whole pool, not just one swimmer! At home, watch basketball and notice how defenders position themselves away from the ball - they're in help position, ready to stop drives to the basket.",
      homeActivities: [
        "Watch games and identify help defense",
        "Discuss 'what would you do?' scenarios",
        "Practice defensive stance with vision training",
        "Study NBA help defense in slow motion",
        "Defensive slide races for conditioning",
        "Talk through help responsibilities for each position",
      ],
      assessmentFrequency:
        "Every scrimmage observation, formal assessment bi-weekly",
      assessmentDuration:
        "Observe positioning when ball is two passes away, rotation timing on drives, and recovery to own player.",
    },
  },
  {
    sport: "basketball",
    domain: "tactical",
    stage: "fundamentals",
    name: "Transition Play",
    slug: "transition-play",
    description:
      "The ability to quickly change from offense to defense and defense to offense, including fast break awareness and getting back on defense.",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: false,
    sortOrder: 12,
    progressionLevels: {
      1: "Slow to transition; stands after turnovers; doesn't run in transition",
      2: "Runs in transition but slow; sometimes fills lanes; inconsistent hustle",
      3: "Good transition player; fills lanes; gets back on defense",
      4: "Excellent transition; leads fast breaks; always first back on defense",
      5: "Elite transition player; creates transition opportunities; organizes team",
    },
    observableBehaviors: [
      "Sprints after turnovers (both directions)",
      "Fills appropriate lane on fast break",
      "Gets back before ball on defense",
      "Looks ahead to find open teammates",
      "Makes quick decisions in transition",
    ],
    commonMistakes: [
      "Standing after turnovers",
      "Jogging in transition",
      "Everyone running to ball",
      "Not getting back on defense",
      "Forcing in transition when numbers not favorable",
    ],
    coachingTips: [
      "'Sprint!' - effort in transition",
      "'Fill the lanes!' - spread the floor",
      "'Head on a swivel!' - see opportunities",
      "'Get back!' - defense first after misses",
      "'Numbers game!' - know when to push vs pull up",
    ],
    tags: ["tactical", "fundamental", "transition", "fast-break"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is slow to transition both directions. Stands after turnovers. No urgency.",
          observableBehaviors: [
            "Slow after turnovers",
            "Stands and watches",
            "Jogs in transition",
            "No lane filling",
            "Doesn't get back",
          ],
          commonMistakes: [
            "Ball-watching after turnovers",
            "No hustle",
            "Always behind play",
            "No urgency",
          ],
          coachingTips: [
            "'Sprint on change of possession!'",
            "Transition sprints in practice",
            "Reward hustle in transition",
            "Simple fast break concepts",
          ],
          assessmentActivities: [
            "Sprint on whistle drills",
            "Turnover transition sprints",
            "Game observation",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Runs in transition but not consistently fast. Beginning to understand lane concepts.",
          observableBehaviors: [
            "Runs in transition",
            "Sometimes fills lanes",
            "Inconsistent hustle",
            "Understanding concepts",
            "Gets back sometimes",
          ],
          commonMistakes: [
            "Hustle inconsistent",
            "Wrong lane at times",
            "Forgets to get back",
            "Wants ball in transition always",
          ],
          coachingTips: [
            "Lane filling drills",
            "Defensive transition emphasis",
            "Consistent effort focus",
            "Decision-making in transition",
          ],
          assessmentActivities: [
            "3-on-2 continuous",
            "11-player drill",
            "Game observation",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Good transition player both ways. Fills lanes and gets back consistently.",
          observableBehaviors: [
            "Good both directions",
            "Fills lanes correctly",
            "Gets back on defense",
            "Appropriate decisions",
            "Consistent hustle",
          ],
          commonMistakes: [
            "May force at times",
            "Could be faster",
            "Doesn't always push when should",
            "Transition defense could improve",
          ],
          coachingTips: [
            "Advanced reads in transition",
            "When to push vs organize",
            "Defensive transition first",
            "Creating transition chances",
          ],
          assessmentActivities: [
            "Full court drills",
            "Scrimmage observation",
            "Game statistics",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent transition player who leads fast breaks and is always first back.",
          observableBehaviors: [
            "Leads fast breaks",
            "First back on defense",
            "Excellent decisions",
            "Creates opportunities",
            "High motor",
          ],
          commonMistakes: [
            "May need to slow team sometimes",
            "Could organize better",
          ],
          coachingTips: [
            "Leadership in transition",
            "Organizing teammates",
            "Advanced concepts",
            "Maintaining intensity",
          ],
          assessmentActivities: [
            "Full game observation",
            "Transition statistics",
            "Scrimmage leadership",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite transition player who creates opportunities and organizes team in fast break.",
          observableBehaviors: [
            "Creates transition chances",
            "Organizes fast breaks",
            "Elite effort both ways",
            "Makes others run",
            "Game-changing in transition",
          ],
          commonMistakes: ["May expect others to match intensity"],
          coachingTips: [
            "Continue leading by example",
            "Help others develop",
            "Maintain motor",
            "Advanced strategies",
          ],
          assessmentActivities: [
            "Game impact observation",
            "Transition statistics",
            "Film review",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Focus on effort and hustle. Running hard is the main goal. Concepts like lanes can be introduced simply. Make transition fun with games.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Lane filling and defensive transition should develop. Emphasize getting back on defense first. Decision-making in transition begins.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good transition play both directions. Focus on decision-making and creating advantages. Defensive transition is non-negotiable.",
        },
      },
      redFlags: [
        "Consistently refuses to run",
        "No improvement in effort over time",
        "Complete lack of transition awareness",
        "Physical limitations affecting ability",
      ],
      parentExplanation:
        "Transition is the change from offense to defense (and vice versa). The best teams RUN when the ball changes possession. We teach 'sprint to the other end' whether attacking or defending. On fast breaks, players fill 'lanes' (like running lanes on a highway) to spread out. Getting back on defense quickly prevents easy baskets. Hustle wins games!",
      homeActivities: [
        "Sprint intervals to build conditioning",
        "Watch basketball and notice who runs hardest",
        "Race games with family",
        "Discuss 'when should you run?' scenarios",
      ],
      bestAssessedIn: [
        "Full court drills",
        "Scrimmages",
        "Games",
        "Turnover situations",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe effort across multiple possessions",
    },
  },
  {
    sport: "basketball",
    domain: "tactical",
    stage: "skill-building",
    name: "Give and Go",
    slug: "give-and-go",
    description: "Passing and cutting to the basket to receive return pass",
    introductionAge: 9,
    assessmentMethod: "game",
    isCore: true,
    sortOrder: 21,
    progressionLevels: {
      1: "Stands still after passing; no understanding of cut concept; runs away from basket",
      2: "Beginning to understand pass-and-cut; timing inconsistent; sometimes ready for return pass",
      3: "Executes basic give and go; reads defender position; makes appropriate cuts",
      4: "Effective give and go player; uses fakes; reads defense; finishes consistently",
      5: "Elite give and go execution; masters timing; reads entire defense; creates easy baskets",
    },
    observableBehaviors: [
      "Cuts immediately after making a pass",
      "Cuts toward the basket, not away from it",
      "Has hands ready to receive return pass",
      "Reads defender to determine cut direction",
      "Finishes or makes good decision after receiving return pass",
    ],
    commonMistakes: [
      "Standing and watching after making the pass",
      "Cutting before the pass is caught (too early)",
      "Cutting away from the basket instead of toward it",
      "Not having hands ready for return pass",
      "Running the same predictable cut every time",
      "Not reading the defender before deciding cut direction",
    ],
    coachingTips: [
      "What should happen immediately after you pass the ball? (Cut to basket!)",
      "Where is your defender looking right now - at you or the ball? What opportunity does that create?",
      "Can you show me 'give' with a fake before you actually pass?",
      "When the timing wasn't right, what information did that give you for next time?",
      "Great effort on that cut! Even when you don't get the ball, you're creating space for teammates",
      "What tells you to cut backdoor versus straight to the basket?",
    ],
    tags: [
      "tactical",
      "teamwork",
      "cutting",
      "offensive-concepts",
      "skill-building",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player does not understand give and go concept. Stands still after passing or runs away from the ball instead of toward the basket.",
          observableBehaviors: [
            "Passes and stands watching",
            "No cut after the pass",
            "Runs to wrong location",
            "Cannot time the cut",
            "Doesn't expect return pass",
            "Unaware of defender position",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand pass-and-cut concept. Attempts to cut after passing but timing and execution are inconsistent.",
          observableBehaviors: [
            "Attempts cut after passing",
            "Timing is off - too early or late",
            "Cut direction sometimes wrong",
            "Sometimes ready for return pass",
            "Beginning to read defender",
            "Needs reminders to cut",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Executes basic give and go with proper timing. Reads defender position and makes appropriate cuts.",
          observableBehaviors: [
            "Cuts immediately after passing",
            "Proper cut direction most of time",
            "Ready hands for return pass",
            "Reads defender's overplay",
            "Finishes when receiving pass",
            "Beginning to sell the cut",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Effective give and go player who creates scoring opportunities. Uses fakes, reads defense well, and finishes consistently.",
          observableBehaviors: [
            "Uses pass fakes before giving",
            "Explosive cut after pass",
            "Reads multiple defenders",
            "Finishes in traffic",
            "Creates for self and teammates",
            "Communicates with passer",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite give and go execution that creates easy baskets. Masters timing, reads the entire defense, and makes the right decision every time.",
          observableBehaviors: [
            "Perfect timing on cuts",
            "Manipulates defenders with fakes",
            "Reads help defense",
            "Finishes creatively",
            "Creates easy baskets for team",
            "Teaches teammates the action",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Cannot understand pass-then-cut sequence after multiple explanations",
        "Persistent standing after passing despite reminders",
        "Unable to time cut with partner's catch",
        "No improvement in cut direction reading over 4+ weeks",
        "Physical inability to make explosive cut",
      ],
      parentExplanation:
        "Give and go is one of basketball's oldest and most effective plays - pass the ball and immediately cut toward the basket for a return pass. It works because defenders often watch the ball, not their player, creating an easy scoring opportunity. We teach players to pass, cut hard, have hands ready, and finish. At home, watch basketball together and spot give and go plays - they happen all the time once you know what to look for!",
      homeActivities: [
        "Watch games and identify give and go plays",
        "Practice passing and cutting with a parent or sibling",
        "Shadow cutting footwork without ball",
        "Discuss 'what would you do next?' during game watching",
        "Explosive start practice from standing position",
        "Hand-eye coordination games for catching on the move",
      ],
      assessmentFrequency:
        "Every scrimmage observation, formal assessment monthly",
      assessmentDuration:
        "Observe both the timing of cuts and the decision-making about cut direction. Note finishing success when pass is received.",
    },
  },
  {
    sport: "basketball",
    domain: "tactical",
    stage: "skill-building",
    name: "Pick and Roll Ball Handler",
    slug: "pick-and-roll-ball-handler",
    progressionLevels: {
      1: "Does not understand pick and roll; runs into screens; ignores screener",
      2: "Beginning to understand; uses screen but reads and decisions slow",
      3: "Uses screens effectively; reads basic defensive coverage",
      4: "Strong pick and roll player; reads all coverage; makes good decisions",
      5: "Elite pick and roll handler; manipulates defense; creates advantages at will",
    },
    observableBehaviors: [
      "Sets up defender before using screen",
      "Uses screen at proper angle (shoulder to shoulder)",
      "Reads how defense is playing the screen",
      "Finds roll man when open",
      "Makes good decisions based on coverage",
    ],
    commonMistakes: [
      "Not setting up defender before using screen",
      "Running into screen instead of shoulder-to-shoulder",
      "Ignoring the roll man after screen",
      "Not reading how defense is playing it",
      "Going too fast into the screen",
      "Picking up dribble too early after screen",
    ],
    coachingTips: [
      "Before you use the screen, what can you do to get your defender to follow you?",
      "How close should you be to the screener when you come off? (Shoulder to shoulder!)",
      "After you come off the screen, where is your screener? What's the defense doing?",
      "That read wasn't right - what did the defense do? What should you have done?",
      "Great patience waiting for the screen! Your effort to set it up correctly paid off",
      "What are your three options when you use a pick and roll?",
    ],
    tags: [
      "tactical",
      "offensive-concepts",
      "pick-and-roll",
      "skill-building",
      "decision-making",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Does not understand pick and roll. Runs into screens, cannot use screens, or ignores screener.",
          observableBehaviors: [
            "Runs into the screen",
            "Doesn't wait for screen to be set",
            "Ignores screener after pick",
            "Cannot read defender",
            "Drives into traffic",
            "No understanding of concept",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand using screens. Can use screen but reads and decisions are slow.",
          observableBehaviors: [
            "Waits for screen sometimes",
            "Uses screen occasionally",
            "Slow to read defense",
            "Sometimes sees roll man",
            "Decision-making delayed",
            "Better with reminders",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Uses screens effectively to create advantage. Reads basic defensive coverage.",
          observableBehaviors: [
            "Sets up defender before using screen",
            "Uses screen with good angle",
            "Reads hedge/switch",
            "Finds roll man sometimes",
            "Makes good decisions in drills",
            "Understands multiple options",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Strong pick and roll player who reads all coverage and makes good decisions consistently.",
          observableBehaviors: [
            "Reads all defensive coverage",
            "Attacks or passes appropriately",
            "Finds roll man consistently",
            "Creates for self and others",
            "Effective in games",
            "Makes defense uncomfortable",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite pick and roll handler who manipulates defense. Creates advantages at will.",
          observableBehaviors: [
            "Makes all reads instantly",
            "Manipulates defense pre-screen",
            "Perfect pocket passes to roll man",
            "Scores at will from PnR",
            "Defense cannot solve them",
            "Runs team pick and roll",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Cannot understand screen concept after multiple explanations",
        "Consistently runs into screens instead of using them",
        "Never sees roll man despite drilling",
        "No improvement in reads over 4+ weeks",
        "Cannot execute basic 2v0 pick and roll",
      ],
      parentExplanation:
        "Pick and roll is basketball's most common play - one player sets a screen for the ball handler, then rolls to the basket. The ball handler must read the defense to decide: attack, pass to the roller, or pass to an open shooter. We teach setup (make defender follow), use (shoulder-to-shoulder), and read (what is defense doing?). Watch any NBA game and you'll see dozens of pick and rolls!",
      homeActivities: [
        "Watch NBA games and count pick and rolls",
        "Discuss what options ball handler had",
        "Practice footwork of coming off screen",
        "Watch highlights of great PnR players",
        "Draw up pick and roll options",
        "2v0 practice with parent as screener",
      ],
      assessmentFrequency:
        "Every practice with tactical drills, formal assessment bi-weekly",
      assessmentDuration:
        "Assess screen setup, usage angle, and decision-making separately. Look for improvement in reads.",
    },
  },
  {
    sport: "basketball",
    domain: "physical",
    stage: "fundamentals",
    name: "Athletic Stance",
    slug: "athletic-stance",
    description: "Maintaining proper defensive/ready position",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 10,
    progressionLevels: {
      1: "Stands upright; feet together; not ready to move in any direction; unaware of body position",
      2: "Beginning to understand stance concept; inconsistent knee bend; feet sometimes apart",
      3: "Consistent athletic stance when reminded; good knee bend and foot width; can maintain briefly",
      4: "Automatic athletic stance in most situations; quick to get low; maintains through movements",
      5: "Elite body control; perfect stance is instinctive; adjusts stance for different situations",
    },
    observableBehaviors: [
      "Feet shoulder-width apart or slightly wider",
      "Knees bent, not locked straight",
      "Weight on balls of feet, not heels",
      "Hips back, chest up, back straight",
      "Hands ready position (varies by situation)",
    ],
    commonMistakes: [
      "Standing straight up with locked knees",
      "Feet too close together",
      "Weight on heels (falling backward)",
      "Bent at waist instead of knees",
      "Looking down instead of forward",
    ],
    coachingTips: [
      "Can you sit in an invisible chair? That's our stance!",
      "Where is your weight right now - on your heels or on the balls of your feet?",
      "If I pushed you gently, would you fall over? Let's test your base!",
      "What do you notice about how you can move from this position?",
      "Great stance! I can tell you're ready to move any direction",
    ],
    tags: [
      "core",
      "physical",
      "fundamental",
      "stance",
      "balance",
      "movement-prep",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player stands upright with little awareness of athletic positioning. Not prepared to move quickly in any direction.",
          observableBehaviors: [
            "Stands straight up with locked knees",
            "Feet close together",
            "Weight back on heels",
            "Falls off balance easily",
            "Slow to react to movement cues",
            "Unaware of body positioning",
          ],
          commonMistakes: [
            "Looking at ground",
            "Arms hanging at sides",
            "Leaning backward",
            "No muscle engagement",
          ],
          coachingTips: [
            "Let's play 'invisible chair' - can you sit down without a chair?",
            "Can you show me a superhero pose? Now bend your knees a little!",
            "How wide apart should your feet be? Try shoulder-width and see how that feels",
            "Push against my hands - are you strong from this position?",
            "Good effort! When you bend your knees, you're ready for anything",
          ],
          assessmentActivities: [
            "Stance check - can they hold position for 5 seconds?",
            "Push test - gentle push from various angles",
            "Movement burst - can they move quickly from stance?",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand and attempt athletic stance. Position inconsistent but showing improvement when reminded.",
          observableBehaviors: [
            "Sometimes shows knee bend",
            "Feet apart but not consistent width",
            "Can achieve stance when cued",
            "Holds position briefly",
            "Starting to understand purpose",
            "Returns to standing upright when not focused",
          ],
          commonMistakes: [
            "Stance not maintained during activity",
            "Forgets to get low in games",
            "Still tends to stand when waiting",
            "Position deteriorates with fatigue",
          ],
          coachingTips: [
            "Before we start, let's check - are you in your athletic stance?",
            "What should your body look like when you're ready to move?",
            "After each play, can you reset to your ready position?",
            "You're remembering more often! What helps you remember?",
            "Good self-correction - you noticed and fixed your stance!",
          ],
          assessmentActivities: [
            "Stance to movement drill",
            "Game observation - how often in stance?",
            "Defensive slides from stance",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Consistent athletic stance when prompted. Good fundamental position and can maintain while performing basic movements.",
          observableBehaviors: [
            "Proper stance when reminded",
            "Good knee bend and width",
            "Maintains during defensive slides",
            "Can move quickly from stance",
            "Understands stance importance",
            "Beginning to use automatically",
          ],
          commonMistakes: [
            "Still needs reminders sometimes",
            "Stance varies by drill type",
            "May stand up during games",
            "Fatigue affects stance maintenance",
          ],
          coachingTips: [
            "How can you remind yourself to stay low without me saying anything?",
            "What do you notice about your defense when you stay in stance?",
            "When do you find yourself standing up? What's happening in those moments?",
            "Your stance is becoming automatic. What helps you stay ready?",
            "I notice you're getting into stance without being told now!",
          ],
          assessmentActivities: [
            "Full drill observation - stance maintenance",
            "Defensive game assessment",
            "Fatigue test - maintain stance in late drill",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Athletic stance is automatic in most situations. Player gets low instinctively and maintains position through various movements.",
          observableBehaviors: [
            "Stance automatic in drills",
            "Low position in games",
            "Maintains through fatigue",
            "Quick stance recovery",
            "Adjusts depth for situation",
            "Role model for teammates",
          ],
          commonMistakes: [
            "Occasional standing in transition",
            "May drop too low in some situations",
            "Could be lower in closeouts",
          ],
          coachingTips: [
            "What situations still challenge your stance?",
            "How can you help teammates remember their stance?",
            "When do you need to be in a deeper stance versus lighter?",
            "Your stance sets a great example. Others watch what you do!",
            "You've developed a habit that will help you forever in basketball",
          ],
          assessmentActivities: [
            "Game stance audit",
            "Transition defense observation",
            "Peer teaching assessment",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite body control and positioning. Athletic stance is instinctive and adjusts automatically for different game situations.",
          observableBehaviors: [
            "Perfect stance is instinctive",
            "Adjusts for every situation",
            "Never caught standing up",
            "Elite body control",
            "Leads by example",
            "Helps others develop",
          ],
          commonMistakes: ["May expect same from all teammates"],
          coachingTips: [
            "What subtle adjustments do you make for different situations?",
            "How can you help younger players develop this habit?",
            "Your stance discipline is elite. What made it click for you?",
            "Continue to refine - there's always room to get better",
          ],
          assessmentActivities: [
            "Teaching demonstration",
            "Game situation analysis",
            "Leadership observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Athletic stance is a new concept that requires constant reinforcement. Use fun analogies like 'superhero pose' or 'gorilla stance.' Don't expect maintenance during play - celebrate any attempt. Build body awareness through various movement activities. Make stance practice a game!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can now understand WHY stance matters - explain the connection to quick movement and defense. Consistent practice builds the habit. Use reminders but help them develop self-awareness. Connect stance to successful plays they make. This age shows good progression with reinforcement.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect automatic stance in most drill situations. Focus on game application and maintenance under fatigue. Introduce position-specific stance adjustments. Connect stance discipline to defensive effectiveness. This age can self-monitor and correct.",
        },
      },
      redFlags: [
        "Cannot achieve basic athletic position despite instruction",
        "Physical limitations preventing knee bend",
        "No improvement in stance awareness over several weeks",
        "Consistent balance issues affecting all activities",
        "Appears uncomfortable or in pain when in stance position",
      ],
      parentExplanation:
        "Athletic stance is basketball's 'ready position' - feet shoulder-width apart, knees bent, weight on the balls of the feet. From this position, players can move quickly in any direction. We use cues like 'invisible chair' or 'ready to jump.' This fundamental position applies to ALL sports, so developing it now creates benefits beyond basketball. At home, you can practice 'stance holds' or play games where your child has to react quickly from athletic position.",
      homeActivities: [
        "Stance hold challenge - how long can they maintain?",
        "Reaction games - move quickly from stance on parent's signal",
        "Mirror drill - copy movements while staying in stance",
        "Stance during TV commercials",
        "Defensive slide races in the driveway",
        "Any sport/activity that reinforces low, ready position",
      ],
      bestAssessedIn: [
        "Defensive drills and slides",
        "Transition situations",
        "Game defense observation",
        "Rest periods between activities",
      ],
      assessmentFrequency:
        "Ongoing observation every session, formal check monthly",
      assessmentDuration:
        "Brief checks throughout practice (5-10 second observations)",
    },
  },
  {
    sport: "basketball",
    domain: "physical",
    stage: "fundamentals",
    name: "Agility / Footwork",
    slug: "agility-footwork",
    description:
      "The ability to move quickly and efficiently on the basketball court, including defensive slides, pivoting, and change of direction.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 20,
    progressionLevels: {
      1: "Slow, uncoordinated movements; crosses feet; poor balance",
      2: "Developing footwork; can slide slowly; pivots developing",
      3: "Good defensive slides; pivots both directions; changes direction well",
      4: "Quick, controlled movements; excellent pivoting; defensive footwork strong",
      5: "Elite quickness and control; footwork is a weapon; exceptional balance",
    },
    observableBehaviors: [
      "Stays low in defensive stance",
      "Slides without crossing feet",
      "Pivots without traveling",
      "Quick first step",
      "Maintains balance through movements",
    ],
    commonMistakes: [
      "Crossing feet on slides",
      "Standing too upright",
      "Dragging pivot foot",
      "Slow to react",
      "Poor balance on changes of direction",
    ],
    coachingTips: [
      "'Push off, slide!' - proper slide technique",
      "'Stay low!' - bend those knees",
      "'Pivot foot stuck in mud!' - don't drag it",
      "'Quick feet!' - fast, choppy steps when needed",
      "'Athletic stance!' - ready position",
    ],
    tags: ["core", "physical", "fundamental", "footwork", "agility", "defense"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player has slow, uncoordinated movements. Crosses feet when trying to slide. Poor balance.",
          observableBehaviors: [
            "Crosses feet when moving",
            "Falls over on direction changes",
            "Cannot defensive slide",
            "Poor balance",
            "Slow reactions",
          ],
          commonMistakes: [
            "Feet crossing constantly",
            "Standing straight up",
            "Traveling when pivoting",
            "No athletic stance",
          ],
          coachingTips: [
            "Basic athletic stance practice",
            "Slow defensive slides with guidance",
            "Balance activities",
            "Simple footwork games",
          ],
          assessmentActivities: [
            "Defensive stance hold",
            "Slow slides across lane",
            "Balance challenges",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Footwork developing but still slow. Can slide at moderate pace. Pivoting improving.",
          observableBehaviors: [
            "Can slide slowly",
            "Pivots developing",
            "Improving balance",
            "Beginning low stance",
            "Still crosses feet sometimes",
          ],
          commonMistakes: [
            "Reverts to crossing feet when fast",
            "Stands up when tired",
            "Pivot foot drags",
            "Slow to react",
          ],
          coachingTips: [
            "Increase slide speed gradually",
            "Pivot drills",
            "Lane slide contests",
            "Agility ladders",
          ],
          assessmentActivities: [
            "Lane slides for time",
            "Pivot and face drills",
            "Agility course",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Good defensive slides and pivoting. Changes direction well. Solid basketball footwork.",
          observableBehaviors: [
            "Good defensive slides",
            "Pivots both directions",
            "Stays low in stance",
            "Changes direction smoothly",
            "Good balance",
          ],
          commonMistakes: [
            "May stand up under fatigue",
            "Could be quicker",
            "Footwork less clean at speed",
            "First step could be quicker",
          ],
          coachingTips: [
            "Increase speed demands",
            "Game-speed footwork",
            "Lateral quickness drills",
            "First step emphasis",
          ],
          assessmentActivities: [
            "Defensive slide contests",
            "1v1 defense",
            "Agility tests",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Quick, controlled movements. Excellent pivoting and defensive footwork. First step is quick.",
          observableBehaviors: [
            "Quick controlled slides",
            "Excellent pivots",
            "Quick first step",
            "Strong defensive footwork",
            "Maintains through fatigue",
          ],
          commonMistakes: [
            "Could always be lower",
            "Occasional upright moments",
          ],
          coachingTips: [
            "Maintain quickness under fatigue",
            "Elite-level challenges",
            "Footwork as competitive advantage",
            "Position-specific footwork",
          ],
          assessmentActivities: [
            "Defensive 1v1",
            "Agility competitions",
            "Game observation",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite quickness and body control. Footwork is a weapon on both ends.",
          observableBehaviors: [
            "Elite quickness",
            "Footwork is advantage",
            "Exceptional balance",
            "Fluid movements",
            "Maintains at all speeds",
          ],
          commonMistakes: ["None significant"],
          coachingTips: [
            "Continue challenging",
            "Leadership role",
            "Helping others",
            "Maintain through competition",
          ],
          assessmentActivities: [
            "Elite-level testing",
            "Game dominance observation",
            "Competitive challenges",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Coordination is developing. Focus on fun movement activities. Defensive stance can be taught but don't expect perfect slides. Make footwork games fun!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is the golden age for footwork development! Lots of practice will show results. Defensive slides should be improving. Pivoting becomes more consistent.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect solid basketball footwork. Speed and quickness should be developing. Focus on maintaining technique at game speed.",
        },
      },
      redFlags: [
        "Persistent coordination issues",
        "Cannot maintain balance",
        "No improvement in basic movements",
        "Physical limitations affecting ability",
      ],
      parentExplanation:
        "Footwork is the foundation of basketball movement! We teach defensive slides (moving laterally without crossing feet), pivoting (turning while keeping one foot planted), and athletic stance (knees bent, ready to move). Good footwork makes everything else easier. Any movement activities - dancing, hopscotch, jump rope - help develop coordination!",
      homeActivities: [
        "Defensive slides in hallway",
        "Jump rope for coordination",
        "Agility ladder (or tape on floor)",
        "Dance and movement games",
        "Pivot practice (without ball)",
        "Reaction games with family",
      ],
      bestAssessedIn: [
        "Defensive drills",
        "Agility tests",
        "1v1 situations",
        "Game movement",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe in various movement situations",
    },
  },
  {
    sport: "basketball",
    domain: "physical",
    stage: "fundamentals",
    name: "Vertical Jump",
    slug: "vertical-jump",
    description:
      "The ability to jump explosively for rebounds, blocks, and finishing at the rim.",
    introductionAge: 6,
    assessmentMethod: "test",
    isCore: false,
    sortOrder: 21,
    progressionLevels: {
      1: "Limited jumping ability; poor technique; weak takeoff",
      2: "Developing jump; some power; technique improving",
      3: "Good vertical; proper technique; effective for rebounding/shooting",
      4: "Strong vertical; explosive; uses jump effectively in games",
      5: "Elite leaping ability; exceptional for age; dominates above rim",
    },
    observableBehaviors: [
      "Bends knees before jumping",
      "Uses arms to generate power",
      "Lands with balance",
      "Times jump appropriately",
      "Jumps off one or two feet as needed",
    ],
    commonMistakes: [
      "Not bending knees enough",
      "Arms not swinging upward",
      "Jumping too early (mistiming)",
      "Poor landing position",
      "Only jumping off two feet",
    ],
    coachingTips: [
      "'Load and explode!' - bend then jump",
      "'Swing your arms!' - arms help you jump",
      "'Time it!' - jump at the right moment",
      "'Land soft!' - bent knees on landing",
      "'Jump to get the ball!' - purpose in jumping",
    ],
    tags: ["physical", "fundamental", "jumping", "explosiveness", "rebounding"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Limited jumping ability with poor technique. Weak takeoff and low height.",
          observableBehaviors: [
            "Low jump height",
            "Poor technique",
            "Weak takeoff",
            "Arms don't help",
            "Unbalanced landing",
          ],
          commonMistakes: [
            "Stiff legs on takeoff",
            "Arms at sides",
            "Jumping late/early",
            "Falling on landing",
          ],
          coachingTips: [
            "Basic jump technique",
            "Arm swing practice",
            "'Load' position emphasis",
            "Jump to targets",
          ],
          assessmentActivities: [
            "Standing vertical jump",
            "Jump to touch target",
            "Jump rope basics",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Jump developing with improving technique. Some power emerging.",
          observableBehaviors: [
            "Improving technique",
            "Some power",
            "Arms helping more",
            "Better timing",
            "More balanced",
          ],
          commonMistakes: [
            "Inconsistent technique",
            "Still mistimes sometimes",
            "One-foot jump underdeveloped",
            "Could load more",
          ],
          coachingTips: [
            "Both takeoff styles practice",
            "Rebounding jumps",
            "Jump timing drills",
            "Progressive jump training",
          ],
          assessmentActivities: [
            "Vertical jump test",
            "Rebounding drill",
            "Layup jumping",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Good vertical jump with proper technique. Effective for game situations.",
          observableBehaviors: [
            "Good vertical",
            "Proper technique",
            "Effective in games",
            "Good timing",
            "Balanced landing",
          ],
          commonMistakes: [
            "Could be more explosive",
            "Timing off occasionally",
            "May not jump max every time",
            "Fatigue affects jump",
          ],
          coachingTips: [
            "Max effort jumping",
            "Game-speed jumping",
            "Rebounding position + jump",
            "Finishing at rim",
          ],
          assessmentActivities: [
            "Vertical jump test",
            "Rebounding competitions",
            "Game observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong vertical jump. Explosive and uses jump effectively in all game situations.",
          observableBehaviors: [
            "Strong vertical",
            "Explosive takeoff",
            "Uses in games effectively",
            "Good timing always",
            "Multiple takeoff styles",
          ],
          commonMistakes: [
            "May over-rely on athleticism",
            "Could position better sometimes",
          ],
          coachingTips: [
            "Maintain explosiveness",
            "Position + jump combination",
            "Advanced finishing",
            "Shot blocking technique",
          ],
          assessmentActivities: [
            "Max vertical test",
            "Game impact observation",
            "Rim finishing drills",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite leaping ability for age. Exceptional vertical that provides significant advantage.",
          observableBehaviors: [
            "Elite vertical",
            "Dominates at rim",
            "Exceptional for age",
            "Game-changing ability",
            "Perfect technique",
          ],
          commonMistakes: ["May attempt too much with ability"],
          coachingTips: [
            "Maintain through growth",
            "Use as weapon appropriately",
            "Landing safety emphasis",
            "Continue development",
          ],
          assessmentActivities: [
            "Vertical measurement",
            "Game dominance observation",
            "Elite competitions",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Jumping ability varies widely. Focus on technique and fun jumping activities. Don't measure against others - development varies. Make jumping fun!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Jumping should be improving with growth. Technique becomes more important. Both one and two-foot takeoffs should develop.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Athletic development accelerates with puberty. Some players will see big gains. Focus on technique and safe landing. Strength training begins to help.",
        },
      },
      redFlags: [
        "Fear of jumping",
        "Persistent poor technique despite instruction",
        "Pain during jumping activities",
        "No improvement over time",
      ],
      parentExplanation:
        "Vertical jump helps with rebounding, finishing at the rim, and defense. We teach proper technique: bend knees, swing arms upward, and land with control. Jumping ability develops at different rates - don't compare to others. Safe landing is important! Any jumping activities (trampolines, jump rope, playground) help develop this ability.",
      homeActivities: [
        "Jump rope for coordination and endurance",
        "Jump to touch targets (door frames, etc.)",
        "Playground jumping activities",
        "Box jumps onto sturdy surfaces",
        "Squat jumps at home",
      ],
      bestAssessedIn: [
        "Vertical jump test",
        "Rebounding situations",
        "Finishing at rim",
        "Blocking attempts",
      ],
      assessmentFrequency: "Quarterly measurement/observation",
      assessmentDuration: "Single testing session plus game observation",
    },
  },
  {
    sport: "basketball",
    domain: "physical",
    stage: "fundamentals",
    name: "Coordination",
    slug: "coordination",
    progressionLevels: {
      1: "Struggles with basic movement; awkward running, jumping, catching",
      2: "Basic movements improving; combining movements still challenging",
      3: "Good coordination for age; combines multiple movements smoothly",
      4: "Strong coordination supporting skill development; moves fluidly in games",
      5: "Elite coordination enabling high-level performance; movement is effortless",
    },
    observableBehaviors: [
      "Runs with smooth, efficient form",
      "Catches balls thrown from various distances",
      "Jumps and lands with control",
      "Combines running, jumping, and catching",
      "Moves confidently in all activities",
    ],
    commonMistakes: [
      "Rushing movements before ready",
      "Not watching ball when catching",
      "Stiff body instead of relaxed",
      "Poor timing on jumps and catches",
      "Not bending knees for balance",
      "Trying complex movements before mastering basics",
    ],
    coachingTips: [
      "Can you show me slow and controlled before we try fast?",
      "Where should your eyes be when catching the ball? Watch it into your hands!",
      "What happens to your body when you relax your shoulders? Feels better, right?",
      "That was a bit awkward - let's try it slower. Mistakes help us learn!",
      "Great effort working on your balance! Coordination takes time and practice",
      "What part of your body helps you stay balanced? (Bent knees, low center!)",
    ],
    tags: [
      "physical",
      "coordination",
      "fundamentals",
      "movement",
      "athletic-development",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Struggles with basic movement coordination. Running, jumping, and catching are inconsistent and uncontrolled.",
          observableBehaviors: [
            "Awkward running form",
            "Difficulty catching balls",
            "Uncoordinated jumping",
            "Trips or falls frequently",
            "Cannot combine movements",
            "Appears uncomfortable moving",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Basic movements improving but combining movements is challenging. Shows improvement with practice.",
          observableBehaviors: [
            "Running form improving",
            "Catches closer throws",
            "Basic jumping ability",
            "Falls less frequently",
            "Simple combinations possible",
            "Growing confidence in movement",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Good basic coordination for age. Can combine multiple movements smoothly in practice situations.",
          observableBehaviors: [
            "Smooth running form",
            "Catches thrown balls consistently",
            "Controlled jumping",
            "Rarely trips or falls",
            "Combines 2-3 movements",
            "Confident in most activities",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Strong coordination that supports basketball skill development. Moves fluidly in game situations.",
          observableBehaviors: [
            "Athletic movement patterns",
            "Catches in various situations",
            "Powerful controlled jumping",
            "Excellent body control",
            "Complex movement combinations",
            "Moves efficiently",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite coordination that enables high-level basketball performance. Movement is effortless and efficient.",
          observableBehaviors: [
            "Elite athletic movement",
            "Catches anything thrown",
            "Explosive yet controlled",
            "Never off-balance",
            "Any movement combination",
            "Makes difficult look easy",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "No improvement in basic coordination over extended period",
        "Significant difficulty with all motor tasks",
        "Frequently injured during normal activities",
        "Extreme frustration with movement activities",
        "Possible motor development concerns - consider specialist evaluation",
      ],
      parentExplanation:
        "Coordination is the foundation for all athletic skills - the ability to move body parts together smoothly. At this age, coordination varies widely and improves rapidly with practice. We develop coordination through varied movement activities, not just basketball drills. At home, any active play helps - climbing, running, throwing, catching, jumping. The more movement experiences, the better coordination develops!",
      homeActivities: [
        "Playground activities (climbing, swinging, jumping)",
        "Catch with various sized balls",
        "Jump rope",
        "Obstacle courses in yard",
        "Dance or movement games",
        "Any multi-sport activities",
      ],
      assessmentFrequency: "Ongoing observation, formal assessment quarterly",
      assessmentDuration:
        "Observe across various activities, not just basketball. Note improvement trends over time.",
    },
  },
  {
    sport: "basketball",
    domain: "psychological",
    stage: "fundamentals",
    name: "Confidence",
    slug: "confidence-basketball",
    description:
      "The belief in one's own abilities to perform basketball skills, take shots, and compete effectively.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 30,
    progressionLevels: {
      1: "Lacks confidence; hesitates; avoids skills; gives up quickly after mistakes",
      2: "Growing but inconsistent; better in comfortable situations; struggles when challenged",
      3: "Generally confident in practice; recovers from mistakes; maintains effort",
      4: "Strong confidence in games; seeks challenges; supports teammates",
      5: "Elite confidence; thrives under pressure; elevates self and team",
    },
    observableBehaviors: [
      "Willingly attempts challenging skills",
      "Recovers effort and attitude after mistakes",
      "Shows positive or neutral body language",
      "Volunteers for activities and challenges",
      "Encourages and supports teammates",
    ],
    commonMistakes: [
      "Negative self-talk after mistakes",
      "Comparing self to others negatively",
      "Avoiding challenges to prevent failure",
      "Giving up before really trying",
      "Letting one mistake ruin entire practice",
      "Body language that shows defeat",
    ],
    coachingTips: [
      "What would you tell a friend who made that same mistake? Now tell yourself!",
      "What's one thing you did well today? Let's build on that!",
      "Mistakes mean you're trying hard enough to challenge yourself. That's growth!",
      "I noticed you kept trying even when it was hard. That takes courage!",
      "What can you control in that situation? Focus on what you CAN do!",
      "Your effort and attitude are choices. You're making great choices!",
    ],
    tags: [
      "psychological",
      "confidence",
      "fundamentals",
      "mental-skills",
      "ELM",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Lacks confidence in basketball situations. Hesitates, avoids attempting skills, or gives up quickly.",
          observableBehaviors: [
            "Avoids attempting skills",
            "Gives up after mistakes",
            "Negative self-talk visible",
            "Hesitates in decisions",
            "Body language shows defeat",
            "Reluctant to participate",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        2: {
          name: "Developing",
          description:
            "Growing confidence but inconsistent. Better in comfortable situations, struggles when challenged.",
          observableBehaviors: [
            "Attempts skills sometimes",
            "Recovers from some mistakes",
            "Better with encouragement",
            "Confidence varies by skill",
            "Body language improving",
            "Participates with prompting",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        3: {
          name: "Competent",
          description:
            "Generally confident in practice situations. Can recover from mistakes and maintain effort.",
          observableBehaviors: [
            "Attempts most skills willingly",
            "Bounces back from mistakes",
            "Positive or neutral self-talk",
            "Confident in familiar drills",
            "Good body language usually",
            "Volunteers for activities",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        4: {
          name: "Proficient",
          description:
            "Strong confidence that transfers to games. Seeks challenges and supports teammates' confidence.",
          observableBehaviors: [
            "Attempts all challenges",
            "Mistakes don't affect effort",
            "Positive self-talk evident",
            "Confident in games",
            "Strong body language",
            "Encourages teammates",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
        5: {
          name: "Advanced",
          description:
            "Elite confidence that elevates self and team. Thrives under pressure and helps others build confidence.",
          observableBehaviors: [
            "Seeks biggest challenges",
            "Turns mistakes into motivation",
            "Leads positive team culture",
            "Clutch in big moments",
            "Unwavering body language",
            "Builds others' confidence",
          ],
          commonMistakes: [],
          coachingTips: [],
          assessmentActivities: [],
        },
      },
      redFlags: [
        "Persistent negative self-talk despite intervention",
        "Consistent avoidance of all challenging activities",
        "Crying or emotional distress regularly at practice",
        "No improvement in confidence over extended period",
        "Signs of anxiety beyond normal nervousness",
      ],
      parentExplanation:
        "Confidence in basketball comes from positive experiences, effort recognition, and learning to handle mistakes. We build confidence by focusing on what players CAN control - effort, attitude, and trying their best. At home, praise effort over outcome. Avoid comparing to other players. When they make mistakes, help them see it as learning. Ask 'What did you learn?' instead of 'Did you win?' Your response to their struggles shapes their confidence!",
      homeActivities: [
        "Praise effort, not just results",
        "Share your own stories of learning from mistakes",
        "Avoid comparing to siblings or friends",
        "Celebrate trying hard things even if unsuccessful",
        "Ask 'What did you enjoy?' after practice",
        "Model positive self-talk in your own activities",
      ],
      assessmentFrequency: "Ongoing observation every session",
      assessmentDuration:
        "Observe across entire practice, not just during skills. Note improvement trends and triggers for confidence changes.",
    },
  },
  {
    sport: "basketball",
    domain: "psychological",
    stage: "fundamentals",
    name: "Effort & Hustle",
    slug: "effort-and-hustle",
    description: "Giving maximum effort regardless of score or situation",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 30,
    progressionLevels: {
      1: "Minimal effort; gives up when challenged; doesn't pursue loose balls; walks during play",
      2: "Inconsistent effort; hustles sometimes but not consistently; affected by score/situation",
      3: "Consistent effort in drills; pursues loose balls; beginning to understand effort's impact",
      4: "High effort is standard; inspires teammates; maintains effort when tired or behind",
      5: "Elite effort every possession; team leader in hustle; effort is unaffected by any circumstance",
    },
    observableBehaviors: [
      "Sprints during transitions (not jogging)",
      "Dives/hustles for loose balls",
      "Contests every shot attempt",
      "Gets back on defense without reminder",
      "Maintains effort throughout entire practice/game",
    ],
    commonMistakes: [
      "Jogging when sprinting is appropriate",
      "Letting loose balls go without pursuing",
      "Standing and watching when ball is loose",
      "Effort drops when tired or team is losing",
      "Taking plays off on defense",
    ],
    coachingTips: [
      "What's something that doesn't require any talent - just effort?",
      "When you're tired, what tells you to keep pushing?",
      "How does your effort affect your teammates?",
      "What did you notice about your energy level compared to last week?",
      "Effort is a choice - and you made a great choice on that play!",
    ],
    tags: [
      "core",
      "psychological",
      "fundamental",
      "effort",
      "hustle",
      "character",
      "ELM",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player shows minimal consistent effort. Gives up when challenged and doesn't pursue loose balls or hustle during play.",
          observableBehaviors: [
            "Walks during live play",
            "Doesn't chase loose balls",
            "Gives up when tired or challenged",
            "Last to arrive at drills",
            "Lets others do the work",
            "Body language shows disengagement",
          ],
          commonMistakes: [
            "Conserving energy unnecessarily",
            "Giving up before trying",
            "Comparing effort to others negatively",
            "Not understanding effort's importance",
          ],
          coachingTips: [
            "What's one thing you can do that shows me you're trying hard?",
            "Let's set a small effort goal for today - what could it be?",
            "I noticed you worked hard on that one play. What felt different?",
            "Effort is something YOU control. What will you choose?",
            "Everyone has times when it's hard to try. What might help you push through?",
          ],
          assessmentActivities: [
            "Effort observation - count hustle plays",
            "Transition sprint tracking",
            "Loose ball response observation",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Shows effort inconsistently. Hustles in some situations but effort varies based on score, fatigue, or perceived importance.",
          observableBehaviors: [
            "Hustles sometimes",
            "Effort tied to scoreboard",
            "Better early in practice, fades",
            "Sprints when motivated",
            "Responds to encouragement",
            "Inconsistent across situations",
          ],
          commonMistakes: [
            "Selective effort based on situation",
            "Effort drops when team struggles",
            "Waits to see if ball comes to them",
            "Sprints in drills, jogs in games",
          ],
          coachingTips: [
            "What makes you hustle hard? Can we find more of those moments?",
            "I notice your effort is different in different situations. What's going on?",
            "What if we decided effort was the same no matter the score?",
            "When you got that loose ball, you were hustling! What was your mindset?",
            "Building consistent effort is a process. You're getting better at it!",
          ],
          assessmentActivities: [
            "Effort tracking across full practice",
            "Situational effort comparison (ahead vs. behind)",
            "Late-game/practice effort observation",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Shows consistent effort in practice drills. Pursues loose balls and is beginning to understand how effort impacts self and team.",
          observableBehaviors: [
            "Consistent drill effort",
            "Pursues loose balls",
            "Gets back on defense",
            "Understands effort importance",
            "Sprints transitions usually",
            "Beginning to encourage others",
          ],
          commonMistakes: [
            "Game effort may lag drill effort",
            "Effort dips in blowout situations",
            "May not be vocal leader yet",
            "Sometimes waits for others to hustle first",
          ],
          coachingTips: [
            "Your effort in practice is consistent. How can we bring that same energy to games?",
            "What does it feel like when everyone on the team hustles together?",
            "How can you help a teammate who's struggling with effort?",
            "Your effort makes a difference. I see it, and your teammates see it too!",
            "Effort is contagious. You can spread it to others!",
          ],
          assessmentActivities: [
            "Game hustle play counting",
            "Team effort leadership observation",
            "Fatigue-state effort assessment",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "High effort is the standard, not the exception. Maintains effort when tired or team is behind. Beginning to inspire teammates through effort.",
          observableBehaviors: [
            "High effort is default",
            "Maintains when tired",
            "Maintains when behind",
            "Inspires teammates",
            "First to loose balls",
            "Never takes plays off",
          ],
          commonMistakes: [
            "May judge others' effort",
            "Could be more vocal in leadership",
            "Rare effort lapses possible",
          ],
          coachingTips: [
            "Your effort is a gift to your team. How can you bring others up?",
            "What do you do mentally to maintain effort when you're exhausted?",
            "When you see a teammate's effort drop, how can you help?",
            "Your effort makes you stand out. It's a competitive advantage!",
            "Leaders influence through effort. You're becoming that leader",
          ],
          assessmentActivities: [
            "Late-game effort observation",
            "Team influence observation",
            "Effort in adversity assessment",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite effort on every possession regardless of circumstance. Team leader in hustle whose effort elevates everyone around them.",
          observableBehaviors: [
            "Elite effort every possession",
            "Unaffected by score, time, fatigue",
            "Team follows their example",
            "Gets teammates to hustle",
            "Known for effort by opponents",
            "Effort is automatic",
          ],
          commonMistakes: ["High standards may create tension occasionally"],
          coachingTips: [
            "How can you lead effort without making teammates feel bad about themselves?",
            "What's your secret to sustaining this effort?",
            "Your effort legacy will be remembered. What do you want it to be?",
            "Continue to grow as a leader while maintaining your hustle standard",
            "You show what's possible when effort is a non-negotiable",
          ],
          assessmentActivities: [
            "Season-long effort consistency",
            "Peer nomination for effort",
            "Leadership impact assessment",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Effort at this age is tied to engagement and fun. If they're having fun, they hustle; if not, they don't. Don't punish low effort - make activities engaging! Celebrate effort attempts, not just successful ones. Use effort as a positive ('I love how hard you tried!') not a negative ('You're not trying!'). Short bursts of high effort with rest are appropriate.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can now understand effort as a choice and connect it to outcomes. Teach that effort is controllable - one of the few things fully in their control. Use ELM language: 'Effort is what we can control.' Reinforce that mistakes made while trying hard are good. Connect effort to improvement and team success.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect more consistent effort as players mature. Discuss mental toughness and effort in difficult moments. Connect effort to character development beyond basketball. Peer influence is strong - effort culture matters. Help them see effort as identity: 'I'm someone who hustles.'",
        },
      },
      redFlags: [
        "Persistent minimal effort despite engaging activities and environment",
        "Effort issues only in certain settings (may indicate anxiety or social concerns)",
        "Significant drop in effort from previous levels",
        "Physical complaints that disappear when activity is appealing",
        "Giving up immediately when challenged (may indicate fear of failure or perfectionism)",
      ],
      parentExplanation:
        "Effort and hustle are the great equalizers in basketball - they don't require special talent, just choice. We teach that effort is one of the few things completely in a player's control using the ELM framework (Effort, Learning, Mistakes). When your child gives great effort, they're developing a life skill that transfers everywhere. At home, praise effort over results: 'I loved how hard you worked on that!' helps more than 'Great job winning!' Effort is built by recognizing it, not by punishing its absence.",
      homeActivities: [
        "Notice and praise effort in any activity",
        "Play high-effort games together (races, active play)",
        "Discuss effort heroes (athletes known for hustle)",
        "Set effort goals, not outcome goals",
        "Model effort in your own activities",
        "Talk about times effort led to good outcomes",
      ],
      bestAssessedIn: [
        "Late in practice when tired",
        "When team is losing in scrimmage",
        "Loose ball situations",
        "Transition defense opportunities",
        "Any situation where effort is a choice",
      ],
      assessmentFrequency: "Ongoing observation every session",
      assessmentDuration: "Continuous throughout all activities",
    },
  },
  {
    sport: "basketball",
    domain: "psychological",
    stage: "fundamentals",
    name: "Coachability",
    slug: "coachability",
    description:
      "The willingness and ability to receive instruction, accept feedback, and apply corrections to improve performance.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 31,
    progressionLevels: {
      1: "Doesn't listen; ignores instruction; resistant to feedback",
      2: "Listens sometimes; struggles to apply feedback; gets defensive",
      3: "Listens and tries to apply; accepts feedback; shows effort to improve",
      4: "Actively seeks feedback; applies corrections quickly; growth mindset",
      5: "Exceptionally coachable; seeks challenges; models learning attitude",
    },
    observableBehaviors: [
      "Makes eye contact when coach speaks",
      "Tries to apply corrections immediately",
      "Asks questions to understand",
      "Doesn't make excuses",
      "Shows appreciation for feedback",
    ],
    commonMistakes: [
      "Not looking at coach when spoken to",
      "Making excuses for mistakes",
      "Ignoring corrections",
      "Getting defensive about feedback",
      "Doing own thing instead of drill",
    ],
    coachingTips: [
      "'Eyes on me!' - attention getting",
      "'Try it this way' - give specific corrections",
      "'Good job adjusting!' - praise application",
      "'Questions?' - invite dialogue",
      "'I'm coaching you because I believe in you' - frame feedback positively",
    ],
    tags: ["core", "psychological", "fundamental", "coachability", "learning"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player doesn't listen to instruction. Resistant to feedback and does their own thing.",
          observableBehaviors: [
            "Doesn't listen",
            "Ignores corrections",
            "Does own thing",
            "Resistant to feedback",
            "May be disruptive",
          ],
          commonMistakes: [
            "Looking elsewhere during instruction",
            "Arguing with feedback",
            "Making excuses constantly",
            "Refusing to try corrections",
          ],
          coachingTips: [
            "Build relationship first",
            "Keep instructions brief and clear",
            "Individual attention",
            "Find what motivates them",
            "Patience and consistency",
          ],
          assessmentActivities: [
            "Response to instruction observation",
            "Correction application",
            "Attention during teaching",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Listens sometimes but struggles to apply. May get defensive but showing improvement.",
          observableBehaviors: [
            "Listens when focused",
            "Tries but struggles to apply",
            "Gets defensive sometimes",
            "Improving attention",
            "Effort showing",
          ],
          commonMistakes: [
            "Attention wanders",
            "Defensive when corrected",
            "Forgets corrections quickly",
            "Needs multiple reminders",
          ],
          coachingTips: [
            "Praise effort to apply",
            "Keep feedback positive",
            "'Sandwich' criticism between positives",
            "Check for understanding",
          ],
          assessmentActivities: [
            "Correction application speed",
            "Response to feedback",
            "Attention during drills",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Listens to instruction and genuinely tries to apply. Accepts feedback constructively.",
          observableBehaviors: [
            "Listens attentively",
            "Tries to apply corrections",
            "Accepts feedback well",
            "Shows effort",
            "Improving from feedback",
          ],
          commonMistakes: [
            "May not always understand",
            "Could ask more questions",
            "Sometimes forgets",
            "Inconsistent application",
          ],
          coachingTips: [
            "Challenge with more detailed instruction",
            "Encourage questions",
            "Video feedback",
            "Peer teaching opportunities",
          ],
          assessmentActivities: [
            "Complex instruction following",
            "Feedback application",
            "Learning speed observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Actively seeks feedback. Applies corrections quickly. Strong growth mindset.",
          observableBehaviors: [
            "Seeks feedback actively",
            "Quick to apply corrections",
            "Growth mindset evident",
            "Asks good questions",
            "No excuses",
          ],
          commonMistakes: [
            "May want too much feedback",
            "Could be too self-critical",
          ],
          coachingTips: [
            "Leadership opportunities",
            "Help others learn",
            "Advanced feedback",
            "Self-evaluation skills",
          ],
          assessmentActivities: [
            "Response to challenging feedback",
            "Self-correction ability",
            "Teaching others",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Exceptionally coachable player who models learning attitude. Seeks challenges constantly.",
          observableBehaviors: [
            "Exceptionally receptive",
            "Models coachability",
            "Seeks challenges",
            "Helps others learn",
            "Takes full responsibility",
          ],
          commonMistakes: ["May be too hard on self"],
          coachingTips: [
            "Leadership role in learning",
            "Mentoring younger players",
            "Balance with self-compassion",
            "Continue challenging",
          ],
          assessmentActivities: [
            "Long-term growth observation",
            "Leadership in learning",
            "Mentoring effectiveness",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Attention spans are short. Keep instructions brief and use demonstrations. Don't expect perfect listening - redirect gently. Make learning fun!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Coachability should be developing. Players can understand and apply more complex feedback. Build the habit of listening and trying.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good coachability. Growth mindset teaching is valuable. Players should actively seek feedback and apply it.",
        },
      },
      redFlags: [
        "Persistent refusal to listen",
        "Cannot follow any instruction",
        "Severe behavioral issues",
        "No improvement in receptiveness",
      ],
      parentExplanation:
        "Coachability is the ability to receive feedback and apply it to improve. It's one of the most important skills for long-term development! We teach players to listen, try corrections, and see mistakes as learning opportunities. At home, you can model this by how you receive feedback yourself and by praising your child's effort to improve, not just results.",
      homeActivities: [
        "Model receiving feedback gracefully",
        "Praise effort to improve",
        "Ask 'What did your coach teach you today?'",
        "Discuss growth mindset - getting better takes practice",
        "Avoid excuses - model taking responsibility",
      ],
      bestAssessedIn: [
        "Instruction situations",
        "Response to corrections",
        "Learning new skills",
        "Feedback application",
      ],
      assessmentFrequency: "Ongoing observation throughout season",
      assessmentDuration: "Builds picture over multiple sessions",
    },
  },
  {
    sport: "basketball",
    domain: "psychological",
    stage: "fundamentals",
    name: "Team Communication",
    slug: "team-communication",
    description:
      "The ability to communicate effectively with teammates during play, including calling screens, switches, and encouragement.",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 32,
    progressionLevels: {
      1: "Silent on court; no communication with teammates; unaware of need",
      2: "Beginning to talk; inconsistent; forgets during play",
      3: "Communicates regularly; calls screens/switches; encourages teammates",
      4: "Strong communicator; organizes teammates; constant talking",
      5: "Elite communicator; vocal leader; makes team better through voice",
    },
    observableBehaviors: [
      "Calls out screens",
      "Communicates defensive switches",
      "Calls for ball when open",
      "Encourages teammates",
      "Provides help instructions",
    ],
    commonMistakes: [
      "Playing in silence",
      "Not calling screens",
      "No defensive communication",
      "Only negative communication",
      "Talking but not helpfully",
    ],
    coachingTips: [
      "'Talk!' - constant reminder",
      "'Call it out!' - screens, switches",
      "'Help your teammate!' - defensive calls",
      "'Be positive!' - encouraging communication",
      "'Loud and clear!' - be heard",
    ],
    tags: ["core", "psychological", "fundamental", "communication", "teamwork"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is silent on the court. No communication with teammates during play.",
          observableBehaviors: [
            "Completely silent",
            "No calls",
            "Doesn't respond to teammates",
            "Unaware communication matters",
            "Isolated in play",
          ],
          commonMistakes: [
            "Playing as if alone",
            "Not responding when called",
            "No screen calls",
            "Silent on defense",
          ],
          coachingTips: [
            "Start with simple calls - 'ball!'",
            "Reward any communication",
            "Communication games",
            "Model talking constantly",
          ],
          assessmentActivities: [
            "Communication observation",
            "Required call drills",
            "Partner communication games",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to communicate but inconsistent. Forgets during intense play.",
          observableBehaviors: [
            "Talks sometimes",
            "Forgets during play",
            "Inconsistent calls",
            "Responds to teammates",
            "Improving awareness",
          ],
          commonMistakes: [
            "Forgets in heat of game",
            "Only communicates sometimes",
            "May be too quiet",
            "Communication not specific",
          ],
          coachingTips: [
            "Constant reminders",
            "Specific call practice",
            "Communication emphasis in drills",
            "Praise when communicating",
          ],
          assessmentActivities: [
            "Shell drill communication",
            "Scrimmage observation",
            "Call-specific drills",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Communicates regularly during play. Calls screens and switches. Encourages teammates.",
          observableBehaviors: [
            "Regular communication",
            "Calls screens",
            "Defensive switches",
            "Encourages others",
            "Responds appropriately",
          ],
          commonMistakes: [
            "Could be louder",
            "Inconsistent in big moments",
            "May not organize",
            "Communication could be more helpful",
          ],
          coachingTips: [
            "Leadership in communication",
            "More specific calls",
            "Organizing teammates",
            "Constant talking expectation",
          ],
          assessmentActivities: [
            "Game communication audit",
            "Defensive communication",
            "Team organization",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong communicator who organizes teammates. Constant helpful talking.",
          observableBehaviors: [
            "Constant communication",
            "Organizes teammates",
            "Specific helpful calls",
            "Positive and instructive",
            "Leadership through voice",
          ],
          commonMistakes: [
            "May talk too much (clutter)",
            "Could let others communicate more",
          ],
          coachingTips: [
            "Quality of communication",
            "Letting others develop",
            "Advanced organizational calls",
            "Communication under pressure",
          ],
          assessmentActivities: [
            "Full game observation",
            "Team organization assessment",
            "Communication quality",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite communicator and vocal leader. Makes team significantly better through communication.",
          observableBehaviors: [
            "Elite communication",
            "Team significantly better with voice",
            "Organizes entire team",
            "Calm under pressure",
            "Inspirational",
          ],
          commonMistakes: ["Others may rely on them too much"],
          coachingTips: [
            "Develop other communicators",
            "Leadership expansion",
            "Maintain through competition",
            "Continue inspiring",
          ],
          assessmentActivities: [
            "Team performance with/without",
            "Leadership observation",
            "Communication impact",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Don't expect much game communication yet. Start with simple calls and make it fun. 'Ball!' when open is a good start. Shy players especially need encouragement.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Communication should be developing. Screen calls, defensive switches, and encouragement should emerge. Make it an expectation.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good communication. Focus on quality and helpfulness of calls. Vocal leaders should be emerging. Communication is non-negotiable.",
        },
      },
      redFlags: [
        "Cannot or will not communicate despite encouragement",
        "Only negative communication",
        "Social anxiety severely limiting",
        "Speech or hearing issues affecting ability",
      ],
      parentExplanation:
        "Communication on the basketball court helps the whole team! Players need to call out screens ('Screen right!'), switches on defense ('Switch!'), and encourage each other. Good teams are LOUD teams. At home, you can encourage communication by asking about what they said to teammates and praising them for supporting others.",
      homeActivities: [
        "Ask 'What did you say to your teammates today?'",
        "Praise encouraging communication",
        "Watch basketball and notice communication",
        "Practice being loud and clear",
        "Communication games at home",
      ],
      bestAssessedIn: [
        "Defensive situations",
        "Screen and roll plays",
        "Scrimmages",
        "Games",
      ],
      assessmentFrequency: "Ongoing observation throughout season",
      assessmentDuration: "Builds picture over multiple sessions",
    },
  },
];

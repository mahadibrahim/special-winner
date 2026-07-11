// Soccer skills content.
//
// Transcribed verbatim from the recovered curriculum seeds under
// `.superpowers/curriculum-recovery/seeds/` (REFERENCE ONLY — never imported
// from src/). Container shape is `SkillContent`; skill copy (progression
// levels, coaching tips, comprehensiveGuide, etc.) is byte-for-byte from the
// sources.
//
// FOLD PROVENANCE (see the Task 3 report at
// .superpowers/sdd/cr-task-3-report.md for the full breakdown):
//
// - The 13 v2-canonical skills come from `curriculum-v2__soccer-skills.ts`
//   (5 technical / 3 tactical / 2 physical / 3 psychological).
// - Four upgrade files layer comprehensiveGuide (and, for the batch-1 file,
//   also progressionLevels/observableBehaviors/commonMistakes/coachingTips/
//   tags) onto skills matched BY NAME, case-insensitive, never by the
//   hardcoded UUIDs the original seeds used:
//     upgrade.ts   (batch 1, full-field patches + 2 brand-new "general"
//                   skills: "Passing", "Receiving")
//     upgrade-2.ts (batch 2, comprehensiveGuide-only patches)
//     upgrade-3.ts (batch 3, comprehensiveGuide-only patches; explicitly
//                   carries name/domain/stage per entry; introduces 6
//                   brand-new skills)
//     upgrade-4.ts (batch 4, "final quality fixes" — partial-field patches:
//                   coachingTips/observableBehaviors/commonMistakes/
//                   comprehensiveGuide only)
//   Where multiple batches target the same skill name, the later batch wins
//   PER FIELD it actually writes (mirrors the original seeds' column-level
//   SQL UPDATEs) — e.g. "Ball Control" keeps upgrade.ts's progressionLevels/
//   tags (upgrade-4 never touches those columns) but upgrade-4's
//   coachingTips/observableBehaviors/commonMistakes/comprehensiveGuide.
// - Upgrade targets whose name does NOT match any of the 13 (or each other)
//   are gen-0 names (e.g. "Ball Mastery - Toe Taps") folded onto the
//   matching skill shell in `src/lib/db/seed-curriculum.ts` (gen-0 source of
//   truth for slug/description/introductionAge/assessmentMethod/isCore/
//   sortOrder), or — where no gen-0 shell exists either — added as wholly
//   new SkillContent entries with only the fields the upgrade payload
//   itself provides (slug/name/sport/domain/stage/comprehensiveGuide).
//
// Raw fold count: 34 soccer skills (13 canonical + 13 gen-0-shelled + 8 brand
// new). The 13-skill / 5-3-2-3 v2-canonical split is preserved.
//
// CONSOLIDATION (pre-load pass, see
// .superpowers/sdd/cr-consolidation-report.md): before this content's first
// live load, 8 near-duplicate skills that taught the same technique at the
// same stage were merged into their richer sibling and removed:
//   - "Inside of Foot Pass" and the general "Passing" -> "Passing (Short)"
//   - "Receiving with Inside of Foot" and the general "Receiving" ->
//     "Receiving / First Touch"
//   - "Defending 1v1" -> "1v1 Defending"
//   - "1v1 Moves" -> "1v1 Dribbling Moves"
//   - "Shooting with Laces" -> "Shooting"
//   - "Agility" -> "Agility - Change of Direction"
// Any genuinely distinct unique material (e.g. the laces approach-angle cue)
// was merged into the surviving entry's top-level fields; no content was
// invented. True count: 26. This file's actual totals are asserted directly
// in registry.test.ts.

import type { SkillContent } from "../types";

export const SOCCER_SKILLS: SkillContent[] = [
  {
    sport: "soccer",
    domain: "technical",
    stage: "fundamentals",
    name: "Ball Control",
    slug: "ball-control",
    description:
      "The ability to keep the ball close and under control while stationary and moving. Foundation skill that enables all other technical abilities.",
    introductionAge: 4,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 1,
    progressionLevels: {
      1: "Ball frequently escapes; requires multiple touches to control; often loses possession",
      2: "Can control ball when stationary; loses control when moving; inconsistent touch",
      3: "Maintains control while jogging; can change direction with ball; occasional loss of control under pressure",
      4: "Controls ball at speed; uses both feet; maintains control with defender nearby",
      5: "Exceptional close control in tight spaces; creative touches; rarely loses possession",
    },
    observableBehaviors: [
      "Keeps ball within 2 feet when receiving a pass rolling at moderate speed",
      "Uses inside of foot (not toe) to cushion incoming balls",
      "Gets body behind the ball's path when preparing to receive",
      "First touch sets up next action (doesn't need multiple touches to settle ball)",
      "Controls balls from 10+ yards with consistency appropriate for age",
    ],
    commonMistakes: [
      "The ball bouncing away is totally normal - controlling a moving ball is genuinely difficult!",
      "Using the toe is natural at first - the inside foot habit develops with practice",
      "Stiff-legged receiving is common - the cushioning motion takes time to learn",
      "Control gets worse under pressure - this is normal skill regression under stress",
      "Air balls are extra challenging - this is one of the hardest skills to master",
    ],
    coachingTips: [
      "What happened when you stopped the ball with your toe? What about your inside foot?",
      "Can you make your foot 'soft like a pillow' to catch the ball? What did you notice?",
      "Where did you want the ball to go after you controlled it? Did it go there?",
      "Which part of your foot did you use? What made you choose that one?",
      "That control bounced away - no problem! What could you try next time?",
    ],
    tags: ["core", "technical", "fundamental", "ball-mastery", "close-control"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning to stop and manage a rolling or bouncing ball. The ball often escapes, which is a completely normal part of learning.",
          observableBehaviors: [
            "Ball bounces away more than 4 feet when receiving",
            "Struggles to stop ball - often chases it",
            "Uses toe to stop ball rather than inside of foot",
            "Body position is often behind or beside ball",
            "Cannot cushion a passed ball",
          ],
          commonMistakes: [
            "The ball bouncing away is totally normal - controlling a moving ball is hard!",
            "Using the toe is natural before learning proper foot surfaces",
            "Stiff leg when receiving is common - the cushioning motion takes time to learn",
            "Turning away from incoming balls shows they're still building confidence",
          ],
          coachingTips: [
            "What happened to the ball when you stopped it with your toe? What about your inside foot?",
            "Can you make your foot 'soft' like a pillow to catch the ball? What happens?",
            "Where did the ball go? That's okay! Everyone's learning. Try again!",
            "Which part of your foot is the biggest flat surface? Can you stop the ball with that?",
          ],
          assessmentActivities: [
            "Roll and stop: Parent/coach rolls ball gently, player stops it any way they can",
            "Bounce catch: Small bouncing ball, use any foot surface to control",
            "Self-toss: Toss ball up gently, control with foot when it lands",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can stop a slowly rolling ball and is beginning to use the inside of the foot. Control of faster or bouncing balls is still developing.",
          observableBehaviors: [
            "Stops slow rolling balls within 2-3 feet",
            "Uses inside of foot sometimes when receiving",
            "Gets body behind the ball on ground passes",
            "Some cushioning action visible on controlled touches",
            "Can control ball from short distances (5-10 yards)",
          ],
          commonMistakes: [
            "Harder passes are difficult to control - this improves with practice and timing",
            "Players often let bouncing balls hit their shin instead of using their foot",
            "Forgetting to cushion is common - the instinct to 'block' is strong",
            "Control disappears under pressure - this is normal skill regression under stress",
          ],
          coachingTips: [
            "How did you catch that one? What made it easier than the last one?",
            "When the ball came faster, what did you do differently? What could you try?",
            "Which touch did you like best? Can you do that one again?",
            "Where do you want the ball to go after you control it? Let's aim there!",
          ],
          assessmentActivities: [
            "Partner passing: Receive and control from 10 yards - various speeds",
            "Cushion challenge: Count how many 'soft' controls out of 10",
            "Control zones: Receive ball into a marked area",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player controls most ground balls reliably and is developing control of bouncing balls. Can receive with both feet in unpressured situations.",
          observableBehaviors: [
            "Controls ground passes within 1-2 feet consistently",
            "Uses inside, outside, and sole of foot appropriately",
            "Controls half-volleys with some success",
            "First touch sets up next action (pass, dribble, shot)",
            "Can receive on either foot when given time",
          ],
          commonMistakes: [
            "Air balls remain challenging - this is one of the hardest skills to master",
            "First touch goes too far when rushed - this improves with experience",
            "Strong side preference under pressure is completely normal at this stage",
            "Occasionally the ball skips off the foot - it happens at every level!",
          ],
          coachingTips: [
            "Where did your first touch set you up? Did that help you?",
            "What made you choose to control it that way? What else could you have done?",
            "How did you know which foot to use? What was your thinking?",
            "That control set up a great pass! What did you see before you touched it?",
          ],
          assessmentActivities: [
            "Moving reception: Control while moving, not standing still",
            "Two-touch game: Receive and pass - quality of first touch is focus",
            "Pressure control: Light defender nearby during reception",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player controls the ball reliably in most situations including with pressure. First touch is consistently productive, setting up the next play.",
          observableBehaviors: [
            "Controls air balls with body, thigh, or foot reliably",
            "First touch escapes pressure (touch away from defender)",
            "Controls balls at pace from distance",
            "Both feet equally comfortable in reception",
            "Uses first touch to change direction of play",
          ],
          commonMistakes: [
            "Difficult balls in game situations may cause occasional loss - that's soccer!",
            "Trying too much with first touch happens as players get creative",
            "Pressure situations may cause reversion to safe touches - this is intelligent",
            "Fatigue affects control late in games - completely normal physical response",
          ],
          coachingTips: [
            "You took that touch away from the defender - what did you read before the ball came?",
            "How did you know to use your chest there instead of your foot?",
            "That first touch created space - what was your next thought?",
            "When the ball came in spinning, what adjustment did you make?",
          ],
          assessmentActivities: [
            "Aerial control: Receive driven balls from distance",
            "Pressure reception: Control with defender closing quickly",
            "First-touch finishing: Control and shoot under time pressure",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player has exceptional ball control in all situations. First touch creates immediate advantages, and control is reliable under any pressure.",
          observableBehaviors: [
            "Controls any ball in any situation with consistency",
            "First touch creates scoring opportunities",
            "Manipulates defenders with deceptive first touches",
            "Controls difficult balls while scanning the field",
            "Equally skilled receiving on ground, bouncing, or aerial balls",
          ],
          commonMistakes: [
            "Even elite players occasionally misjudge spin or pace - it happens!",
            "Attempting spectacular touches and losing ball is part of pushing boundaries",
            "Comfort leading to casual touches in low-pressure moments is human nature",
            "Misjudging wet or uneven surfaces affects everyone",
          ],
          coachingTips: [
            "That touch was incredible - what information were you processing before it arrived?",
            "You made that look easy - what adjustments did you make that we couldn't see?",
            "The defender was beaten before the ball arrived - how did you set that up?",
            "When conditions are difficult, what do you adjust in your technique?",
          ],
          assessmentActivities: [
            "Game analysis: Review first touch quality in match situations",
            "Difficult conditions: Control in wind, rain, or on poor surfaces",
            "High-pressure drills: Reception in crowded areas with quick decisions",
          ],
        },
      },
      ageExpectations: {
        "4-6": {
          typical:
            "Ball bounces away often, using toes, chasing the ball - all normal!",
          focus:
            "Fun with the ball, any control is success, building confidence",
          patience:
            "Coordination is developing rapidly - celebrate every controlled touch",
        },
        "7-9": {
          typical:
            "Inside of foot developing, can stop slow balls, cushioning emerging",
          focus:
            "Multiple foot surfaces, receiving and moving, building habits",
          patience:
            "Skill development is non-linear - some days are better than others",
        },
        "10-12": {
          typical:
            "Reliable ground control, developing aerial control, first touch with purpose",
          focus:
            "First touch setting up next action, both feet, receiving under pressure",
          patience:
            "Growth spurts may temporarily affect coordination - this passes",
        },
        "13+": {
          typical:
            "All surfaces confident, control under pressure, creative first touches",
          focus:
            "Game-context decisions, controlling difficult balls, deceptive touches",
          patience: "Control continues to refine throughout a player's career",
        },
      },
      redFlags: [
        "Consistent flinching or turning away from incoming balls - may need gentler progressions",
        "Unable to stop slow rolling balls after extended practice - check for vision/coordination",
        "Extreme frustration with self over lost control - focus on emotional support and normalization",
        "Complete avoidance of receiving the ball - build confidence in small-group settings",
      ],
      parentExplanation:
        "Ball control is the ability to receive a pass and keep the ball close, ready to make the next play. Young children often have the ball bounce away from them - this is completely normal! Controlling a moving ball requires timing, body positioning, and soft touch - skills that develop over time. We teach players to 'cushion' the ball like catching an egg, using their foot to absorb the speed. At home, rolling balls back and forth helps build this skill. Every touch matters, and there's no shortcut to developing great control - it takes many repetitions over time. Focus on fun and frequency rather than perfection.",
      homeActivities: [
        "Roll and cushion: Roll ball to each other, practice 'soft' stops",
        "Wall returns: Kick against wall, control the rebound",
        "Juggling starts: Just trying to kick the ball up and control it",
        "Moving controls: Walk while a parent rolls balls for you to control",
        "Foot surface safari: Stop the ball with different parts of your foot",
      ],
      assessmentActivities: [
        {
          name: "Partner Reception",
          domain: "technical",
          description:
            "Receive passes from various distances and speeds, track control quality",
        },
        {
          name: "First Touch Focus",
          domain: "technical",
          description:
            "Where does first touch go? Does it set up the next action?",
        },
        {
          name: "Game Observation",
          domain: "tactical",
          description:
            "Watch ball control in match situations - how do they handle pressure?",
        },
        {
          name: "Aerial Challenges",
          domain: "physical",
          description:
            "Control of thrown or lofted balls - age-appropriate progressions",
        },
      ],
      assessmentFrequency:
        "Ongoing observation each session, focused assessment monthly",
      assessmentDuration:
        "2-3 minute focused observations during passing activities",
      bestAssessedIn: [
        "Passing activities",
        "Warm-up rondos",
        "Game situations",
        "Technical circuits",
      ],
    },
  },
  {
    sport: "soccer",
    domain: "technical",
    stage: "fundamentals",
    name: "Passing (Short)",
    slug: "passing-short",
    description:
      "The ability to accurately deliver the ball to a teammate over short distances (under 15 yards) using the inside of the foot.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 2,
    progressionLevels: {
      1: "Passes lack direction and weight; uses toe or random foot surface",
      2: "Can pass stationary ball to stationary target; inconsistent accuracy",
      3: "Passes moving ball accurately to stationary teammate; appropriate weight",
      4: "Passes accurately to moving teammate; uses both feet; consistent technique",
      5: "Disguised passes; perfect weight; can execute under pressure",
    },
    observableBehaviors: [
      "Uses inside of foot (not toe)",
      "Non-kicking foot points to target",
      "Follow-through toward target",
      "Appropriate pace for distance",
      "Makes eye contact/communication before passing",
    ],
    commonMistakes: [
      "Using toe to pass (ball bounces unpredictably)",
      "Non-kicking foot pointing wrong direction",
      "No follow-through (stabbing at ball)",
      "Passing too hard or too soft",
      "Not looking before passing",
    ],
    coachingTips: [
      "'Lock your ankle' - foot stays firm like a hockey stick",
      "'Point your belly button' at your target",
      "'Pass to their front foot' - lead a moving teammate",
      "'Use the flat part' - show inside of foot like high-five",
      "'Check your shoulder' before passing - see who's open",
    ],
    tags: ["core", "technical", "fundamental", "passing"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player's passes lack direction and power control. Technique is undeveloped with toe kicks common.",
          observableBehaviors: [
            "Uses toe to kick ball",
            "Ball goes in random directions",
            "No consistent technique",
            "Cannot judge distance/power",
            "Doesn't look at target before passing",
          ],
          commonMistakes: [
            "Toe-poking the ball",
            "Standing too close or far from ball",
            "Swinging leg across body",
            "Looking down entire time",
          ],
          coachingTips: [
            "Start with rolling ball to partner (underhand roll)",
            "Practice passing against a wall (ball returns)",
            "Use 'high-five foot' cue - show inside of foot",
            "Stand beside player and guide their leg motion",
          ],
          assessmentActivities: [
            "Pass to coach from 3 yards",
            "Pass through wide gate (3 yards wide)",
            "Knock over a cone from 5 yards",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can pass a stationary ball to a stationary target with some success. Technique is emerging but inconsistent.",
          observableBehaviors: [
            "Uses inside of foot sometimes",
            "Can hit stationary target from 5 yards",
            "Struggles with moving ball",
            "Power inconsistent",
            "Beginning to look at target",
          ],
          commonMistakes: [
            "Reverting to toe when rushed",
            "Passing foot turns out (slices ball)",
            "Standing too upright",
            "Passes always too hard or too soft",
          ],
          coachingTips: [
            "Practice with stationary ball first",
            "Use 'plant foot points to friend' cue",
            "Add targets - 'can you hit the cone?'",
            "Pair with patient partner for repetition",
          ],
          assessmentActivities: [
            "Pass through gates (2 yards wide) from 5 yards",
            "Partner passing (both stationary)",
            "Pass to numbered targets on call",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Passes a moving ball accurately to stationary targets. Appropriate weight most of the time. Reliable technique.",
          observableBehaviors: [
            "Consistent inside-of-foot technique",
            "Passes moving ball successfully",
            "Good weight for distance",
            "Looks up before passing",
            "Uses dominant foot confidently",
          ],
          commonMistakes: [
            "Weak foot passes are poor",
            "Struggles when under pressure",
            "Passes behind moving teammate",
            "Takes extra touch when unnecessary",
          ],
          coachingTips: [
            "Add movement - pass and move",
            "Introduce passing to moving targets",
            "Begin weak foot development",
            "Add light defensive pressure",
          ],
          assessmentActivities: [
            "Triangle passing (pass and move)",
            "2v1 keep-away",
            "Pass through gates while jogging",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Passes accurately to moving teammates. Uses both feet. Can execute under moderate pressure.",
          observableBehaviors: [
            "Accurate passes to moving targets",
            "Uses both feet effectively",
            "Maintains technique under pressure",
            "Varies weight appropriately",
            "Combines passing with movement",
          ],
          commonMistakes: [
            "May telegraph passes against good defenders",
            "Occasional poor decision (should have passed elsewhere)",
            "Weak foot still slightly less accurate",
          ],
          coachingTips: [
            "Work on disguise - look one way, pass another",
            "Increase speed of play in practices",
            "Add decision-making - multiple targets",
            "Practice one-touch passing",
          ],
          assessmentActivities: [
            "4v2 Rondo",
            "Small-sided games (focus on passing accuracy)",
            "Combination play patterns",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Exceptional passing ability. Disguises intentions, perfect weight, executes under high pressure.",
          observableBehaviors: [
            "Disguised passes (body feints)",
            "Perfect weight in all situations",
            "No-look passes",
            "One-touch passing at speed",
            "Plays through tight windows",
          ],
          commonMistakes: [
            "May attempt difficult passes when simple option available",
            "Could over-complicate in certain situations",
          ],
          coachingTips: [
            "Challenge with complex patterns",
            "Encourage creativity but also smart decisions",
            "Work on long-range passing development",
            "Have them lead passing drills for younger players",
          ],
          assessmentActivities: [
            "Rondo 3v2 or 4v2 in tight spaces",
            "Full match observation",
            "Combination play with one-touch limit",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Players are learning basic technique. Focus on inside of foot contact and having fun. Accuracy will be inconsistent - celebrate effort and improvement, not perfection.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Technique should be more consistent. Players should reliably use inside of foot. Begin emphasizing passing to moving teammates and developing weak foot.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good passing technique under moderate pressure. Both feet should be functional. Focus on speed of play and decision-making around when/where to pass.",
        },
      },
      redFlags: [
        "Persistent toe-kicking despite instruction",
        "Cannot judge distance/power even at close range",
        "Avoids passing situations",
        "Coordination issues affecting kicking motion",
        "No improvement in accuracy over 2+ months",
      ],
      parentExplanation:
        "Short passing is how players connect with their teammates. We teach using the 'inside of the foot' - the flat part - because it's the most accurate surface. Your child is learning to 'plant and point' - planting their non-kicking foot toward their target. At this age, passing is more about developing the technique than perfect accuracy. Playing wall-ball at home is excellent practice!",
      homeActivities: [
        "Wall passing - pass against wall, control return, repeat",
        "Pass back and forth with family member in backyard",
        "Target practice - set up cones and try to knock them down",
        "Two-touch game - control, then pass back",
        "Weak foot challenge - 10 passes with each foot",
        "Pass through goals made of shoes/objects",
      ],
      bestAssessedIn: [
        "Partner passing drills",
        "Rondos and keep-away games",
        "Small-sided games",
        "Combination play exercises",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across 2-3 sessions before rating",
    },
  },
  {
    sport: "soccer",
    domain: "technical",
    stage: "fundamentals",
    name: "Receiving / First Touch",
    slug: "receiving-first-touch",
    description:
      "The ability to control an incoming ball and prepare it for the next action (pass, dribble, or shot). The most important touch in soccer.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 3,
    progressionLevels: {
      1: "Ball bounces away on first touch; cannot control pace of incoming ball",
      2: "Can stop ball but it stays under feet; needs multiple touches",
      3: "Controls ball into space with first touch; body opens to field",
      4: "First touch sets up next action; can receive under pressure",
      5: "Creative first touch; deceives defenders; controls any ball",
    },
    observableBehaviors: [
      "Cushions ball on contact (soft touch)",
      "Body opens toward intended direction",
      "Ball moves into space, not trapped under feet",
      "Checks shoulder before receiving",
      "First touch allows immediate next action",
    ],
    commonMistakes: [
      "Stiff leg (ball bounces away)",
      "Trapping ball directly under feet",
      "Not looking before receiving",
      "Body closed (back to play)",
      "Standing still waiting for ball",
    ],
    coachingTips: [
      "'Soft feet like pillows' - cushion the ball",
      "'Open your body' - show where you want to go",
      "'Touch it forward' - not under your feet",
      "'Check your shoulder' - look before it arrives",
      "'Move to meet the ball' - don't wait for it",
    ],
    tags: ["core", "technical", "fundamental", "receiving", "first-touch"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot control the pace of incoming passes. Ball frequently bounces away or gets stuck under feet.",
          observableBehaviors: [
            "Ball bounces off foot",
            "Stiff leg when receiving",
            "Ball ends up behind player",
            "Needs 3+ touches to control",
            "Doesn't move toward ball",
          ],
          commonMistakes: [
            "Kicking at ball instead of cushioning",
            "Foot rigid on contact",
            "Standing still waiting for ball",
            "Eyes close on contact",
          ],
          coachingTips: [
            "Start with partner rolling ball gently",
            "Practice catching ball with foot (stop it dead)",
            "Use 'pillow' cue - soft like landing on pillow",
            "Lots of repetition at slow speeds",
          ],
          assessmentActivities: [
            "Partner roll and stop (5 yards)",
            "Self-toss and control with foot",
            "Receive and freeze",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can stop a ball but it stays trapped under feet. Beginning to show cushioning but inconsistent.",
          observableBehaviors: [
            "Stops ball most of the time",
            "Ball stays close but under feet",
            "Shows some cushioning",
            "Can control gentle passes",
            "Struggles with firm passes",
          ],
          commonMistakes: [
            "Ball gets stuck under feet (no space to act)",
            "Still stiff on faster passes",
            "Body doesn't open to field",
            "Takes extra touches before ready",
          ],
          coachingTips: [
            "Introduce 'touch to space' - push ball slightly forward",
            "Practice receiving sideways-on",
            "Add targets - receive and pass to target",
            "Vary pass speeds gradually",
          ],
          assessmentActivities: [
            "Receive and pass to target",
            "Receive and dribble to cone",
            "Control ball inside a hoop/circle",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Controls ball into space with first touch. Body position opens to the field. Ready for next action.",
          observableBehaviors: [
            "First touch moves ball into space",
            "Body opens toward play",
            "Checks shoulder before receiving",
            "Can receive and pass quickly",
            "Handles moderate pace passes",
          ],
          commonMistakes: [
            "Under pressure, reverts to trapping under feet",
            "Doesn't always check shoulder",
            "Weak foot receiving inconsistent",
            "Struggles with bouncing balls",
          ],
          coachingTips: [
            "Add light defensive pressure",
            "Practice receiving and turning",
            "Work on weak foot receiving",
            "Introduce different heights of ball",
          ],
          assessmentActivities: [
            "Receive and turn drill",
            "2v1 receive under pressure",
            "Triangle passing with first-touch requirement",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "First touch consistently sets up next action. Receives effectively under pressure. Uses both feet.",
          observableBehaviors: [
            "First touch enables immediate action",
            "Receives well with both feet",
            "Comfortable under pressure",
            "Varies receiving surface for situation",
            "Scans before ball arrives",
          ],
          commonMistakes: [
            "Occasional heavy touch under high pressure",
            "May lose ball in very tight spaces",
            "Sometimes predictable direction of touch",
          ],
          coachingTips: [
            "Work on disguised first touches",
            "Practice in very tight spaces",
            "Add multiple defenders",
            "Receive and play one-touch",
          ],
          assessmentActivities: [
            "Rondo with first-touch limitation",
            "Receive with back to goal, turn and play",
            "3v1 in tight space",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Creative first touch that deceives defenders. Controls any type of ball. Makes the difficult look easy.",
          observableBehaviors: [
            "First touch beats defender",
            "Creative touches into space",
            "Controls balls from any height/pace",
            "Uses chest, thigh, outside of foot",
            "First touch often creates scoring chance",
          ],
          commonMistakes: [
            "May over-complicate when simple touch would suffice",
          ],
          coachingTips: [
            "Challenge with unpredictable deliveries",
            "Work on first touch in final third",
            "Practice receiving under full match pressure",
            "Encourage teaching others",
          ],
          assessmentActivities: [
            "Match play observation",
            "Receive and shoot exercises",
            "High-pressure rondos",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Focus on 'soft feet' and stopping the ball. Don't worry about direction yet - just controlling it is the goal. Lots of touches with rolling balls.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players should receive and move ball into space. Body position becoming important. Begin receiving under light pressure.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "First touch should prepare for next action. Receiving under pressure is expected. Work on receiving in tight spaces and turning.",
        },
      },
      redFlags: [
        "Ball consistently bounces away despite practice",
        "Fear of receiving firm passes",
        "Cannot improve from rolling ball stage",
        "Coordination issues affecting timing",
        "Significant gap compared to peers after extended time",
      ],
      parentExplanation:
        "First touch is often called the most important touch in soccer - it determines everything that happens next! We teach players to 'cushion' the ball (soft feet) and push it into space so they're ready to pass or dribble. Your child is learning to prepare their body and check their surroundings BEFORE the ball arrives. Great first touch takes thousands of repetitions to develop.",
      homeActivities: [
        "Wall receiving - pass against wall, cushion return, repeat",
        "Self-toss and control - throw up, control with foot",
        "Receive and turn - partner passes, control and spin around",
        "Target zones - set up areas to receive ball into",
        "Juggling with bounce - helps develop soft touch",
        "Parent tosses ball at different heights to control",
      ],
      bestAssessedIn: [
        "Passing drills with receiving component",
        "Rondos",
        "Small-sided games",
        "Receive and turn exercises",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across 2-3 sessions before rating",
    },
  },
  {
    sport: "soccer",
    domain: "technical",
    stage: "fundamentals",
    name: "Dribbling",
    slug: "dribbling",
    description:
      "The ability to move with the ball while maintaining control, including changes of speed, direction, and using moves to beat opponents.",
    introductionAge: 4,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 4,
    progressionLevels: {
      1: "Kicks ball ahead and chases; no control while moving",
      2: "Can dribble slowly in straight line; struggles with direction changes",
      3: "Dribbles at jogging pace with direction changes; can use basic moves",
      4: "Dribbles at speed; uses multiple moves; beats defenders",
      5: "Creative dribbling; unpredictable; beats multiple defenders",
    },
    observableBehaviors: [
      "Ball stays within 2 feet of body while moving at comfortable pace",
      "Uses inside, outside, or sole of foot (not just toe) to control ball",
      "Changes direction at least once without losing control over 10 yards",
      "Looks up at least 2-3 times during a 15-yard dribble",
      "Adjusts pace (faster or slower) on command or by choice",
    ],
    commonMistakes: [
      "It's common for the ball to escape - every player works on this throughout their career!",
      "Players often use only their toe at first - other foot surfaces develop with practice",
      "Looking at the ball constantly is natural - head-up dribbling builds over time",
      "Running faster than skill allows happens when players are excited - we channel that energy!",
      "Favoring one foot is normal - both feet develop through consistent practice",
    ],
    coachingTips: [
      "What happens when you kick the ball harder? What about a softer touch?",
      "Can you peek up and tell me what color shirt I'm wearing while you dribble?",
      "Which part of your foot are you using? What happens if you try a different part?",
      "Where's an open space you could dribble to? Show me!",
      "The ball got away - no problem! What will you try differently next time?",
    ],
    tags: ["core", "technical", "fundamental", "dribbling", "1v1"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning to move with the ball. The ball often gets away, and that's completely normal at this stage. Focus is on building confidence and enjoying the experience.",
          observableBehaviors: [
            "Ball travels more than 3 feet away from body",
            "Uses toe to push ball forward in 'kick and chase' pattern",
            "Loses ball 3+ times in a 10-yard dribble",
            "Stops to regain control before continuing",
            "Eyes stay on ball 90%+ of time",
          ],
          commonMistakes: [
            "Players often kick the ball too hard - this is a natural starting point as they learn touch",
            "It's common to only use one foot at first - both feet will develop with practice",
            "Looking at the ball constantly is normal - head-up dribbling comes later",
            "Running too fast for skill level happens when players are excited - we embrace enthusiasm!",
          ],
          coachingTips: [
            "What happens when you kick the ball harder? What about a softer touch?",
            "Can you show me how slowly you can walk with the ball? Now a tiny bit faster?",
            "How many times can you touch the ball between these two cones?",
            "If the ball rolls away, that's okay! Everyone's ball escapes sometimes. What will you do next?",
          ],
          assessmentActivities: [
            "Dribble walk: Walk with ball across 10 yards - count touches (goal: 8+ touches)",
            "Free exploration: Dribble anywhere in space for 1 minute",
            "Stop and go: Dribble and stop on coach signal",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player keeps the ball closer and can move at a slow pace. Beginning to use different parts of the foot. Building the foundation of ball control.",
          observableBehaviors: [
            "Ball stays within 2-3 feet during slow dribbling",
            "Uses inside of foot sometimes (not just toe)",
            "Completes 10-yard dribble with 1-2 losses of control",
            "Can change direction with ball if moving slowly",
            "Looks up briefly 2-3 times during dribble sequence",
          ],
          commonMistakes: [
            "Players often speed up and lose control - pace awareness is developing",
            "It's natural to favor one foot heavily at this stage",
            "Forgetting to look up is very common - we're building this habit gradually",
            "Straight-line dribbling dominates - curves and turns come next",
          ],
          coachingTips: [
            "What part of your foot did you use there? What happens if you try the inside?",
            "Can you dribble to me as slowly as possible? Now just a little faster?",
            "How many fingers am I holding up? Try to peek up while dribbling!",
            "Which direction could you go next? Show me a turn!",
          ],
          assessmentActivities: [
            "Dribble jog: Jog pace dribble across 15 yards - track control",
            "Color call: Peek up while dribbling, call out colors coach shows",
            "Simple weave: Dribble through 3 cones spaced 5 yards apart",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player dribbles confidently at moderate speed using multiple foot surfaces. Can navigate around obstacles and change direction. Developing game-ready skills.",
          observableBehaviors: [
            "Ball stays within 2 feet at jogging speed",
            "Uses inside, outside, and sole of foot appropriately",
            "Completes cone courses with smooth direction changes",
            "Head up 40-50% of dribbling time",
            "Changes pace intentionally (slow-fast-slow)",
          ],
          commonMistakes: [
            "Players commonly lose control when trying new moves - that's learning!",
            "Speed increases may cause temporary control loss - normal progression",
            "Defaulting to dominant foot under pressure is typical at this stage",
            "Forgetting to scan when focused on ball control happens often",
          ],
          coachingTips: [
            "What made you choose to go that direction? What else could you have done?",
            "When you changed speed, what happened to the imaginary defender?",
            "Which foot feels more comfortable? Let's give the other one some practice too!",
            "Can you tell me what's happening around you while you dribble?",
          ],
          assessmentActivities: [
            "Obstacle course: Navigate 5-cone slalom at own pace, then faster",
            "Freeze tag dribble: Dribble while avoiding taggers",
            "Head-up challenge: Count objects while dribbling across space",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player dribbles with confidence at game speed. Uses deceptive movements and changes of pace effectively. Maintains awareness while controlling the ball.",
          observableBehaviors: [
            "Ball stays within 1-2 feet at running speed",
            "Executes 2-3 different dribbling moves on command",
            "Completes complex courses maintaining control",
            "Head up 60-70% of dribbling time with court vision",
            "Successfully beats stationary or slow-moving defenders",
          ],
          commonMistakes: [
            "Overcomplicating moves in game situations is common as players learn to read when to be simple",
            "Dribbling when passing is better happens as tactical awareness develops",
            "Slight control loss at top speed is normal - it's pushing boundaries",
            "Reverting to safe moves under pressure shows good decision-making instincts",
          ],
          coachingTips: [
            "What did the defender do when you dropped your shoulder? How can you use that?",
            "When might it be better to pass instead of dribble past them?",
            "You had two options there - tell me about your decision?",
            "What move would work best against a defender coming at you fast vs. standing still?",
          ],
          assessmentActivities: [
            "1v1 challenges: Beat a defender to score, track success rate",
            "Decision games: Choose dribble or pass in various scenarios",
            "Move showcase: Demonstrate 3 different moves against passive defense",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player has exceptional ball control and can dribble effectively in any situation. Creates opportunities for self and teammates through skilled dribbling.",
          observableBehaviors: [
            "Near-complete ball mastery at all speeds",
            "Executes moves instinctively based on defender positioning",
            "Dribbles effectively in tight spaces with pressure",
            "Head up 80%+ with excellent peripheral awareness",
            "Creates goal-scoring opportunities through dribbling",
          ],
          commonMistakes: [
            "Even advanced players sometimes over-dribble - reading when to release is an ongoing skill",
            "Trying moves outside their toolkit occasionally is how they expand their game",
            "Moments of control loss happen when pushing creative boundaries",
            "Holding the ball when teammates have runs is a tactical learning moment",
          ],
          coachingTips: [
            "What did you read from the defense before making that move?",
            "You created that chance - what options did your teammates give you?",
            "When you beat the first defender, what was your next thought?",
            "That was creative! What made you try something new there?",
          ],
          assessmentActivities: [
            "Small-sided games: Track successful dribbles, chances created",
            "Pressure situations: 1v2 dribbling challenges",
            "Creative challenges: Invent and teach a new move to teammates",
          ],
        },
      },
      ageExpectations: {
        "4-6": {
          typical:
            "Kick and chase pattern, toe dribbling, lots of ball escapes - all normal!",
          focus:
            "Fun exploration with ball, positive experience with dribbling",
          patience: "Ball control develops over years - celebrate every touch",
        },
        "7-9": {
          typical:
            "Inside of foot emerging, better pace control, starting to look up occasionally",
          focus:
            "Multiple foot surfaces, change of direction, building confidence",
          patience:
            "Comparisons with peers are unhelpful - each child develops at their own pace",
        },
        "10-12": {
          typical:
            "Game-speed dribbling, moves repertoire developing, reading defenders",
          focus:
            "Decision-making (when to dribble), move combinations, both feet",
          patience:
            "Growth spurts may temporarily affect coordination - this is normal",
        },
        "13+": {
          typical:
            "Refined technique, creative problem-solving, positional awareness while dribbling",
          focus:
            "Game context decisions, creating for teammates, dribbling under fatigue",
          patience:
            "Physical changes continue to affect skill - ongoing development is expected",
        },
      },
      redFlags: [
        "Persistent fear of having the ball - may need 1-on-1 encouragement, smaller groups",
        "Frustration leading to withdrawal - adjust challenge level, celebrate small wins",
        "Physical coordination concerns beyond normal development - consult with parents",
        "Complete avoidance of dribbling in games - may need modified games to build confidence",
      ],
      parentExplanation:
        "Dribbling is how players move with the ball at their feet. At the youngest ages, children naturally 'kick and chase' - hitting the ball and running after it. This gradually develops into controlled dribbling where the ball stays close. We focus on lots of touches (keeping the ball close) rather than fancy moves. The best dribblers started with thousands of hours of simply playing with the ball. Every minute your child spends with a ball at their feet - in the backyard, at the park, anywhere - contributes to their development. There's no rushing this process, and comparing to others isn't helpful as every child develops at their own pace.",
      homeActivities: [
        "Ball walks: Walk around the house or yard with a ball at their feet (use a soft ball indoors!)",
        "Touch counting: How many touches can you get from the door to the fence?",
        "Obstacle courses: Set up shoes, cones, or toys to dribble around",
        "Follow the leader: Parent walks a path, child dribbles following along",
        "Speed zones: Create slow and fast zones - change pace in each",
      ],
      assessmentActivities: [
        {
          name: "Free Dribbling Exploration",
          domain: "technical",
          description:
            "Open space dribbling with encouragement to try different speeds and directions",
        },
        {
          name: "Cone Weave Course",
          domain: "technical",
          description:
            "Navigate through cones at comfortable pace, then challenge with speed or tighter cones",
        },
        {
          name: "1v1 to Goal",
          domain: "tactical",
          description:
            "Beat a defender to score - observe decision-making and execution",
        },
        {
          name: "Head-Up Challenge",
          domain: "cognitive",
          description:
            "Call out colors or numbers while dribbling to assess awareness",
        },
      ],
      assessmentFrequency:
        "Ongoing observation each session, with specific skill focus monthly",
      assessmentDuration: "2-3 minute focused observations during activities",
      bestAssessedIn: [
        "Free play with ball",
        "Cone courses",
        "Small-sided games",
        "1v1 situations",
      ],
    },
  },
  {
    sport: "soccer",
    domain: "technical",
    stage: "fundamentals",
    name: "Shooting",
    slug: "shooting",
    description:
      "The ability to strike the ball toward goal with power, accuracy, and appropriate technique.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 5,
    progressionLevels: {
      1: "Shots weak and inaccurate; often misses target completely; technique inconsistent",
      2: "Can shoot on target from close range; power developing; technique improving",
      3: "Shoots with power and accuracy; can shoot moving ball; makes good decisions",
      4: "Powerful, accurate shots in game situations; variety of techniques; confident finisher",
      5: "Elite finishing ability; clinical with both feet; creates and converts chances; natural scorer",
    },
    observableBehaviors: [
      "Strikes ball with appropriate surface (laces for power, inside for placement)",
      "Approaches ball at angle (not straight on) for laces strikes",
      "Plants foot beside ball pointing at target",
      "Head down over ball at contact",
      "Follow-through toward target",
      "Selects appropriate technique for situation",
    ],
    commonMistakes: [
      "Using toe to shoot",
      "Leaning back (ball goes high)",
      "Planting foot too far from ball",
      "Approaching straight at the ball instead of at an angle",
      "No follow-through",
      "Shooting without looking at goal",
    ],
    coachingTips: [
      "Where is the goal - did you look before you shot?",
      "What happens to the ball when you lean over it versus lean back?",
      "Can you pick your spot before shooting?",
      "Which part of your foot gives you power? Which gives placement?",
      "What do you see in the goal before deciding where to shoot?",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "shooting",
      "finishing",
      "attacking",
      "scoring",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning to strike the ball with intent. Shots are often off target and technique is developing. Scoring is the most fun part - keep it positive!",
          observableBehaviors: [
            "Shots miss target often",
            "Little power generated",
            "Uses toe frequently",
            "Must stop to shoot",
            "No awareness of goal position",
          ],
          commonMistakes: [
            "Toe-poking habit",
            "Looking down during shot",
            "Standing foot pointing wrong way",
            "No approach angle",
          ],
          coachingTips: [
            "Can you show me your laces? That's for shooting!",
            "Before you shoot, take a quick peek at the goal!",
            "What happens when you kick through the ball?",
            "Can you point your toe down like a ballerina?",
            "Great try! Let's see where that one goes next time!",
          ],
          assessmentActivities: [
            "Shoot at large goal from 8 yards",
            "Strike stationary ball at targets",
            "Slow approach and shoot",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can hit the target from close range. Power is developing and technique is improving. Shows desire to score and celebrates successes.",
          observableBehaviors: [
            "Hits target from close range",
            "Uses laces more often",
            "Some power developing",
            "Shoots stationary ball well",
            "Shows enthusiasm to shoot",
          ],
          commonMistakes: [
            "Moving ball is harder",
            "Leans back sometimes",
            "Only uses dominant foot",
            "Accuracy from distance poor",
          ],
          coachingTips: [
            "What happens when you stay over the ball?",
            "Can you shoot a rolling ball the same way?",
            "Where should your chest be when you shoot?",
            "How does the ball fly when you follow through high versus low?",
            "Can you hit the same spot three times in a row?",
          ],
          assessmentActivities: [
            "Shoot at target zones",
            "Rolling ball finishing",
            "Shooting from angles",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player shoots with power and accuracy. Can shoot moving balls and makes reasonable decisions about when to shoot. Growing confidence.",
          observableBehaviors: [
            "Powerful shots on target",
            "Strikes moving ball well",
            "Good technique consistent",
            "Shoots from various positions",
            "Both feet developing",
          ],
          commonMistakes: [
            "Technique suffers under pressure",
            "Sometimes blasts when placement better",
            "Weak foot noticeably weaker",
            "May shoot when pass is better",
          ],
          coachingTips: [
            "When do you power it versus place it?",
            "What do you see before deciding where to shoot?",
            "Is scoring more about power or accuracy?",
            "How do you stay calm when the shot matters?",
            "Can you focus on your weaker foot this week?",
          ],
          assessmentActivities: [
            "Shooting with passive defender",
            "Receive and shoot",
            "Weak foot shooting",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player shoots powerfully and accurately in games. Uses variety of techniques and makes smart decisions. Confident and composed finisher.",
          observableBehaviors: [
            "Consistent in game situations",
            "Variety of shooting techniques",
            "Smart shooting decisions",
            "Comfortable both feet",
            "Confident near goal",
          ],
          commonMistakes: [
            "May force shots occasionally",
            "Could be more clinical in key moments",
          ],
          coachingTips: [
            "How do you know when it's the right time to shoot?",
            "What goes through your mind just before shooting?",
            "How do you stay calm when the game is on the line?",
            "What can make you even more clinical?",
            "When is passing to a teammate in better position the right choice?",
          ],
          assessmentActivities: [
            "Shooting under pressure",
            "Game finishing observation",
            "1v1 with goalkeeper",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player is an elite finisher. Clinical with both feet and creates scoring chances. Shows ice-cold composure and natural scoring instincts.",
          observableBehaviors: [
            "Clinical finishing",
            "Scores with both feet",
            "Creates own chances",
            "Calm in pressure moments",
            "Natural goal-scoring instinct",
          ],
          commonMistakes: ["May become overly focused on personal scoring"],
          coachingTips: [
            "How do you stay so composed?",
            "What do you see that others might miss?",
            "How can you help teammates become better finishers?",
            "What's your routine before a big moment?",
            "When is setting up a teammate better than shooting?",
          ],
          assessmentActivities: [
            "Goal statistics in games",
            "High-pressure finishing",
            "Creating and finishing",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Scoring goals is the highlight of soccer! Focus on fun and celebration over technique. Use larger goals and let them score often - success builds love for the game. Don't worry about perfect form; the joy of seeing the ball hit the net is what matters most.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand shooting technique. Introduce 'picking your spot' in the goal. Work on both feet regularly. Shooting games and competitions make practice engaging. Help them understand that missing is part of the journey to scoring.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good technique and smart decisions about when to shoot. Challenge with realistic pressure. Discuss the mental game: confidence after missing, composure in big moments. Weak foot competence becomes important.",
        },
      },
      redFlags: [
        "Avoids shooting even when clearly open",
        "Persistent toe-poking despite instruction",
        "Extreme negative reaction to missing",
        "Physical discomfort when shooting",
        "No power development over time",
      ],
      parentExplanation:
        "Shooting is about striking through the ball with the laces for power, or inside of foot for accuracy. We teach: plant foot beside ball pointing at target, lock ankle, toe down, follow through. At home, any shooting practice helps - targets on a wall, shooting at cones. Remember: the best scorers miss a lot! They keep shooting with confidence. Encourage using their weaker foot too. When they score: celebrate! When they miss: 'Good try, keep shooting!'",
      homeActivities: [
        "Target shooting at cones or markers",
        "Wall shooting with target zones",
        "Shooting competitions with family",
        "Practice striking motion without ball",
        "Watch goal compilations - study technique",
        "Weak foot shooting challenge",
      ],
      bestAssessedIn: [
        "Shooting drills",
        "Finishing games",
        "Small-sided games",
        "1v1 with keeper",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration:
        "Observe across multiple shooting situations (5-10 minutes)",
    },
  },
  {
    sport: "soccer",
    domain: "tactical",
    stage: "fundamentals",
    name: "Finding Space",
    slug: "finding-space",
    description:
      "The ability to position oneself in open areas to receive the ball, create passing options, and contribute to team play.",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 10,
    progressionLevels: {
      1: "Follows the ball everywhere; bunches with teammates; no awareness of space",
      2: "Beginning to spread out when reminded; occasionally finds space",
      3: "Finds open space consistently; shows for ball; understands width/depth basics",
      4: "Creates space through movement; times runs well; reads game situation",
      5: "Manipulates space; creates options for teammates; advanced tactical awareness",
    },
    observableBehaviors: [
      "Moves to open space within 3 seconds of passing the ball",
      "Positions at least 5 yards away from nearest teammate in possession games",
      "Checks over shoulder at least once before calling for the ball",
      "Adjusts position as the ball moves to maintain passing angle",
      "Finds space to receive rather than running toward the ball carrier",
    ],
    commonMistakes: [
      "Clustering around the ball is completely natural for young players - they're drawn to the action!",
      "Standing still when off the ball is common - movement awareness develops with experience",
      "Moving to obvious spaces only is a natural starting point - reading space develops over time",
      "Forgetting to scan is very normal - this cognitive habit takes many repetitions to build",
      "Returning to the same spot after moving shows developing understanding of space",
    ],
    coachingTips: [
      "Where is nobody standing right now? Can you go there?",
      "If you were the ball, could you see your teammate from there?",
      "What happens when everyone bunches together? Is there room to play?",
      "You passed the ball - now what? Where's a good spot to move to?",
      "What did you notice about where the defenders were? Where didn't they want you to go?",
    ],
    tags: ["core", "tactical", "fundamental", "movement", "positioning"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player tends to cluster with teammates or stand still when not on the ball. Understanding of space is just beginning to develop.",
          observableBehaviors: [
            "Stands in same spot for 10+ seconds when off the ball",
            "Moves to where the ball is rather than open space",
            "Positions within arm's reach of 2+ teammates",
            "Does not look around to find open areas",
            "Calls for ball while standing behind defender",
          ],
          commonMistakes: [
            "Clustering near the ball is completely natural at young ages - they're attracted to the action!",
            "Standing still is common as players learn the game - movement awareness develops over time",
            "Hiding behind defenders happens as players learn spacing concepts",
            "Not scanning is normal - this cognitive skill develops with experience",
          ],
          coachingTips: [
            "Where is nobody standing right now? Can you go there?",
            "If you were the ball, could you see your teammate? What could they do?",
            "What happens when everyone stands together? Is there space to play?",
            "Let's pretend defenders are sleeping - where would you sneak to?",
          ],
          assessmentActivities: [
            "Freeze game: Call freeze and ask 'where is open space?'",
            "Space hunters: Points for moving to open areas",
            "Passing pairs: Simple pass and move exercise",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player starts to understand the concept of space but application is inconsistent. Beginning to move after passing.",
          observableBehaviors: [
            "Moves after passing (at least sometimes)",
            "Occasionally finds open space when reminded",
            "Begins to spread out when coach prompts",
            "Looks around briefly before calling for ball",
            "Recognizes when too close to teammates with reminders",
          ],
          commonMistakes: [
            "Forgetting to move after passing is very common - the habit takes many repetitions to form",
            "Moving to obvious spaces only is a natural starting point",
            "Returning to same spot after moving shows developing understanding",
            "Getting attracted back to the ball happens as excitement overrides positioning",
          ],
          coachingTips: [
            "You passed - now what? Where's a good spot to move to?",
            "What do you see when you look around? Any empty spaces?",
            "If the ball can't see you, can it find you? How do you help it?",
            "Where do you think the defender doesn't want you to go?",
          ],
          assessmentActivities: [
            "Pass and move: Track if player moves after passing",
            "Space recognition: Point to open space during stoppages",
            "Simple keep-away: Small groups, observe movement patterns",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player consistently moves to create space and makes themselves available for passes. Understanding of angles developing.",
          observableBehaviors: [
            "Moves to space within 3 seconds of passing",
            "Checks shoulder before calling for ball",
            "Positions at an angle to receive (not directly behind teammate)",
            "Adjusts position as play develops",
            "Creates passing lanes by intelligent movement",
          ],
          commonMistakes: [
            "Making runs at wrong moments is part of learning timing - timing improves with experience",
            "Moving to the same spots repeatedly happens as players find 'safe' spaces",
            "Not communicating movement is common - verbal cues develop alongside tactical understanding",
            "Getting stuck watching the ball instead of scanning is a habit that takes time to break",
          ],
          coachingTips: [
            "What made you choose to move there? What else did you consider?",
            "Did the passer see you? How could you make yourself more visible?",
            "What was the defender doing when you made your move?",
            "When is a good moment to move - before or after your teammate controls the ball?",
          ],
          assessmentActivities: [
            "Triangle passing: Maintain shape while passing and moving",
            "Numbers game: Position to receive from any direction",
            "4v2 keep-away: Observe spacing and support",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player reads the game well and creates space through intelligent movement. Understands how to drag defenders to create opportunities.",
          observableBehaviors: [
            "Makes runs that create space for teammates",
            "Times runs to coincide with teammate's head-up moments",
            "Uses body feints to mislead defenders before moving",
            "Adjusts positioning based on ball location and defender positions",
            "Finds space in central dangerous areas",
          ],
          commonMistakes: [
            "Overcomplicating movements happens as players get creative - simplicity is a learned skill",
            "Making runs without communication is common until verbal leadership develops",
            "Misjudging timing of runs is part of developing game reading skills",
            "Defaulting to wide positions is safer - central bravery develops with confidence",
          ],
          coachingTips: [
            "You created that space - did your teammate see it? How could you help them notice?",
            "What did the defender's body language tell you before you moved?",
            "When you made that run, what options did it create for the team?",
            "Could you have created more danger with a different angle? Tell me your thinking.",
          ],
          assessmentActivities: [
            "Positional games: Observe awareness and movement off ball",
            "Third-man running: Track combination play understanding",
            "Small-sided games: Assess space creation in game situations",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player has exceptional spatial awareness and creates opportunities through sophisticated movement. Influences teammates' spacing through leadership.",
          observableBehaviors: [
            "Manipulates defenders with decoy runs to create space for others",
            "Orchestrates team spacing through verbal and physical cues",
            "Exploits split-second gaps in defensive structure",
            "Positions optimally in transition moments",
            "Finds space even against organized defensive systems",
          ],
          commonMistakes: [
            "Occasional misread of defensive structure is normal even at high levels",
            "Trusting teammates to see runs when they don't happens in team development",
            "Energy conservation leading to less movement late in games is natural",
            "Over-anticipating team patterns when chemistry is developing is common",
          ],
          coachingTips: [
            "How did you know that run would open up space for your teammate?",
            "What were you communicating with that movement?",
            "The defense recovered quickly - what adjustment could break them down next time?",
            "You're reading the game at a high level - what do you see that others might miss?",
          ],
          assessmentActivities: [
            "Full match analysis: Review decision-making with video",
            "Leadership observation: How do they organize teammates?",
            "Complex positional games: High-speed decision-making",
          ],
        },
      },
      ageExpectations: {
        "4-6": {
          typical:
            "Clustering around ball, standing still off ball - completely normal at this age!",
          focus: "Joy of playing, basic awareness that space exists",
          patience:
            "Abstract concepts like 'space' are hard to grasp - use concrete language and games",
        },
        "7-9": {
          typical:
            "Beginning to spread out with prompts, inconsistent movement after passing",
          focus:
            "Pass and move concept, simple spacing games, visual reminders",
          patience:
            "Cognitive development varies widely - some 'get it' earlier than others",
        },
        "10-12": {
          typical: "Understanding angles, reading where space is, timing runs",
          focus:
            "Reading the game, creating for teammates, positional awareness",
          patience:
            "Physical and cognitive development interact - be patient with inconsistency",
        },
        "13+": {
          typical:
            "Sophisticated movement, manipulating defenders, team-level spacing",
          focus: "Leadership of spacing, advanced reading, positional mastery",
          patience:
            "Even professional players continue developing spatial understanding",
        },
      },
      redFlags: [
        "Persistent confusion about basic directions - may need simpler cues or check understanding",
        "Anxiety about being in open space - may need smaller-sided games to build confidence",
        "Difficulty processing multiple visual inputs - consider individual coaching moments",
        "Complete disengagement when off ball - find ways to keep them mentally in the game",
      ],
      parentExplanation:
        "Finding space is a tactical skill - it's about reading the game and positioning yourself where you can receive the ball or help teammates. Young children naturally cluster around the ball because that's where the excitement is! This 'magnet to the ball' behavior is completely normal and gradually shifts as children develop game understanding. We use games and simple cues to help players start 'seeing' space. At home, watching soccer together and pointing out 'look at that player finding space!' can help build awareness. Every child develops this understanding at their own pace.",
      homeActivities: [
        "Watch together: Point out player movement when watching soccer on TV",
        "Freeze frame: Pause games and ask 'where would you move if you were that player?'",
        "Space tag: Play tag but earn points for being in open space",
        "Pass and move: Simple garden passing where you move after each pass",
        "Treasure hunt: Find the 'treasure' (open space) before the defender catches you",
      ],
      assessmentActivities: [
        {
          name: "Keep-Away Games",
          domain: "tactical",
          description:
            "3v1 or 4v2 possession games observing movement and support angles",
        },
        {
          name: "Space Recognition",
          domain: "cognitive",
          description: "Stop play and ask player to identify open spaces",
        },
        {
          name: "Pass and Move Drills",
          domain: "technical",
          description: "Simple combinations tracking movement after release",
        },
        {
          name: "Small-Sided Games",
          domain: "tactical",
          description:
            "Observe off-ball positioning and movement patterns in game context",
        },
      ],
      assessmentFrequency:
        "Weekly observation in game situations, focused check monthly",
      assessmentDuration: "5-10 minute observation periods during games",
      bestAssessedIn: [
        "Small-sided games",
        "Possession activities",
        "Match situations",
        "Rondo exercises",
      ],
    },
  },
  {
    sport: "soccer",
    domain: "tactical",
    stage: "fundamentals",
    name: "Support Play",
    slug: "support-play",
    description:
      "The ability to provide passing options and help for the teammate with the ball through positioning, communication, and movement.",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: false,
    sortOrder: 11,
    progressionLevels: {
      1: "Watches teammate; provides no support; no awareness of helping",
      2: "Occasionally moves to help; support distance wrong; minimal communication",
      3: "Provides consistent support option; good distance; calls for ball",
      4: "Creates multiple options; adjusts angle based on pressure; combines effectively",
      5: "Always available; organizes support play; creates overloads",
    },
    observableBehaviors: [
      "Moves to support ball-carrier",
      "Maintains appropriate distance (not too close/far)",
      "Shows at correct angle (can receive and advance)",
      "Communicates availability",
      "Moves to give new option after pass",
    ],
    commonMistakes: [
      "Standing watching the play",
      "Supporting too close (congests space)",
      "Supporting too far (pass too difficult)",
      "Poor angle (can't see teammate or play forward)",
      "Static after passing (doesn't support receiver)",
    ],
    coachingTips: [
      "'Give them an option!' - always be available",
      "'Show at an angle!' - so you can see forward",
      "'Right distance!' - not too close, not too far",
      "'Call for it!' - let them know you're there",
      "'Pass and move!' - support continues after you pass",
    ],
    tags: ["tactical", "fundamental", "teamwork", "support", "passing"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player watches the game rather than participating. Provides no support for teammate with the ball.",
          observableBehaviors: [
            "Stands and watches play",
            "No movement to help",
            "Doesn't communicate",
            "Unaware of teammate's needs",
            "No understanding of 'support'",
          ],
          commonMistakes: [
            "Becoming a spectator",
            "Walking during play",
            "Staying in same spot entire game",
            "Not recognizing when help is needed",
          ],
          coachingTips: [
            "Constant engagement - 'Move to help!'",
            "Freeze game to show support positions",
            "Simple rule: 'Always be moving'",
            "Praise any support movement",
          ],
          assessmentActivities: [
            "2v1 keep-away",
            "Triangle passing",
            "Observation during games",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Sometimes moves to support but distance and angle are often incorrect. Beginning to understand concept.",
          observableBehaviors: [
            "Moves to help sometimes",
            "Support distance inconsistent",
            "Occasionally calls for ball",
            "Shows understanding of concept",
            "Position often unhelpful",
          ],
          commonMistakes: [
            "Too close - clutters space",
            "Too far - pass too difficult",
            "Behind the ball (can't progress play)",
            "Movement is reactive, not proactive",
          ],
          coachingTips: [
            "Use cones to show 'support zone' distance",
            "Angle practice - 'show where you can see me AND forward'",
            "3v1 games to practice support",
            "Video examples of good support",
          ],
          assessmentActivities: [
            "3v1 Rondo",
            "Diamond passing patterns",
            "Coach observation in games",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Consistently provides support at appropriate distance and angle. Calls for the ball. Understands their role.",
          observableBehaviors: [
            "Reliable support positioning",
            "Good distance and angle",
            "Communicates availability",
            "Moves after passing",
            "Understands pass and move",
          ],
          commonMistakes: [
            "Support angle could be sharper",
            "May stop moving after passing",
            "Doesn't always adjust to pressure",
            "Support play predictable",
          ],
          coachingTips: [
            "Introduce 'third man' concept",
            "Work on movement after passing",
            "Adjust angle based on pressure",
            "Combine with other movements",
          ],
          assessmentActivities: [
            "4v2 Rondo",
            "Combination play exercises",
            "Positional games",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Creates multiple passing options. Adjusts position based on game situation. Effective combination play.",
          observableBehaviors: [
            "Creates multiple options",
            "Adjusts to pressure",
            "Combines well with teammates",
            "Pass and move automatic",
            "Organizes basic team shape",
          ],
          commonMistakes: [
            "May try too many combinations",
            "Could be more vocal",
            "Sometimes over-complicates",
          ],
          coachingTips: [
            "Decision-making focus",
            "When to combine vs. advance directly",
            "Leadership - organizing others",
            "Complex passing patterns",
          ],
          assessmentActivities: [
            "Complex passing sequences",
            "Full-sided games",
            "Phase of play exercises",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Always available. Organizes team's support play. Creates numerical advantages. Makes teammates better.",
          observableBehaviors: [
            "Always an option",
            "Organizes teammates",
            "Creates overloads",
            "Anticipates play",
            "Makes others look good",
          ],
          commonMistakes: [
            "May see options others don't",
            "Could be frustrated by less aware teammates",
          ],
          coachingTips: [
            "Leadership development",
            "Complex tactical understanding",
            "Team organization",
            "Mentoring younger players",
          ],
          assessmentActivities: [
            "Full matches",
            "Tactical discussions",
            "Leadership observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Support play is an advanced concept for this age. Focus on 'being a helper' and moving toward the ball when teammate has it. Don't expect consistent support positioning.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and apply support concepts. Use simple games like 3v1 to practice. Emphasize 'give and go' combinations.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect consistent support play. Work on timing and angle refinement. Combination play should be a strength. Decision-making focus.",
        },
      },
      redFlags: [
        "Consistently stands still during play",
        "No improvement in game engagement",
        "Cannot understand basic support concepts",
        "Social withdrawal affecting participation",
        "Physical limitations preventing movement",
      ],
      parentExplanation:
        "Support play means helping your teammate who has the ball by being available for a pass. Think of it like being a 'helper' - when your friend has the ball, where should you stand so they can pass to you? We teach players to be at a good distance (not too close, not too far) and at an angle where they can receive AND see the field. Combination play like 'give-and-go' develops from good support.",
      homeActivities: [
        "Play 2v1 keep-away in the backyard",
        "Watch soccer and identify support players",
        "Discuss: 'When would you pass to a helper?'",
        "Triangle passing with family",
        "Games that require teamwork and helping others",
      ],
      bestAssessedIn: [
        "Rondos (keep-away games)",
        "Small-sided games",
        "Combination play exercises",
        "Match situations",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across 2-3 sessions in game situations",
    },
  },
  {
    sport: "soccer",
    domain: "tactical",
    stage: "fundamentals",
    name: "1v1 Defending",
    slug: "1v1-defending",
    description:
      "The ability to stop an attacker in individual situations through proper positioning, patience, and tackling technique.",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 12,
    progressionLevels: {
      1: "Dives in immediately; easily beaten; no defensive shape",
      2: "Shows some patience; body position improving; still often beaten",
      3: "Stays balanced; forces attacker wide; wins some challenges",
      4: "Consistently delays attacker; reads their intentions; wins majority of 1v1s",
      5: "Dominant 1v1 defender; anticipates moves; rarely beaten",
    },
    observableBehaviors: [
      "Closes down attacker with control",
      "Stays on balls of feet (not flat-footed)",
      "Body position at angle (forces direction)",
      "Patient - doesn't dive in",
      "Watches ball, not attacker's body",
    ],
    commonMistakes: [
      "Diving in immediately (lunging)",
      "Standing flat-footed",
      "Square to attacker (can go either way)",
      "Watching attacker's feet/body (gets fooled)",
      "Giving up when beaten once",
    ],
    coachingTips: [
      "'Get goalside!' - always between attacker and goal",
      "'Patience!' - don't dive in",
      "'On your toes!' - stay bouncy, ready to move",
      "'Show them the line!' - force them wide",
      "'Watch the ball!' - not their tricks",
    ],
    tags: ["core", "tactical", "fundamental", "defending", "1v1"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player dives in immediately at every opportunity. Easily beaten. No concept of defensive positioning.",
          observableBehaviors: [
            "Lunges at ball immediately",
            "Falls over when beaten",
            "No awareness of position",
            "Stands flat-footed",
            "Gives up after being beaten",
          ],
          commonMistakes: [
            "Diving in constantly",
            "Not tracking attacker's run",
            "Turning back to attacker",
            "Stopping once beaten",
          ],
          coachingTips: [
            "'Freeze!' - can you stay patient?",
            "Practice closing down without tackling",
            "Shadow defending - follow without contact",
            "Celebrate patience, not just tackles",
          ],
          assessmentActivities: [
            "1v1 defending practice (passive attacker)",
            "Shadow defending games",
            "Cone touch defending",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to show patience. Body position improving but still often beaten. Understanding defensive concepts.",
          observableBehaviors: [
            "Sometimes waits before tackling",
            "Improving body position",
            "Stays between attacker and goal more",
            "Beginning to force direction",
            "Still beaten fairly often",
          ],
          commonMistakes: [
            "Patience breaks under pressure",
            "Body position square to attacker",
            "Watches wrong cues (feet, body)",
            "Gives away easily when tired",
          ],
          coachingTips: [
            "Body shape practice - 'show them the line'",
            "Ball watching exercises",
            "Countdown patience - 'wait... wait... NOW!'",
            "1v1 games with points for patience",
          ],
          assessmentActivities: [
            "1v1 to cone (defender protects cone)",
            "Channel defending",
            "Body shape races",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Stays balanced and forces attacker in desired direction. Wins some individual battles. Reliable positioning.",
          observableBehaviors: [
            "Closes down with control",
            "Forces attacker wide/to weak foot",
            "Patient - picks moments",
            "Wins tackle or forces turnover",
            "Recovers position after being beaten",
          ],
          commonMistakes: [
            "Can be beaten by skilled dribblers",
            "Sometimes too passive (lets attacker shoot)",
            "Doesn't always recover quickly",
            "Predictable in approach",
          ],
          coachingTips: [
            "When to commit vs. delay",
            "Recovery runs practice",
            "2v1 defending introduction",
            "Vary attackers in training",
          ],
          assessmentActivities: [
            "1v1 to goal",
            "2v2 defending situations",
            "Game observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Consistently delays attacker effectively. Reads their intentions. Wins majority of individual battles.",
          observableBehaviors: [
            "Delays and disrupts consistently",
            "Reads attacker's intentions",
            "Wins majority of 1v1s",
            "Uses body well to recover",
            "Communicates with teammates",
          ],
          commonMistakes: [
            "May be over-aggressive at times",
            "Could be beaten by exceptional skill",
            "Occasionally commits too early",
          ],
          coachingTips: [
            "Decision-making refinement",
            "Defensive leadership",
            "Team defending integration",
            "Recovery and tracking practice",
          ],
          assessmentActivities: [
            "1v1 vs best attackers",
            "Full match observation",
            "Defensive phase of play",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Dominant 1v1 defender. Anticipates attacker moves. Rarely beaten. Forces turnovers consistently.",
          observableBehaviors: [
            "Wins almost all 1v1s",
            "Anticipates moves before they happen",
            "Physically and mentally dominant",
            "Organizes defensive shape",
            "Creates turnovers through positioning",
          ],
          commonMistakes: [
            "May be over-confident occasionally",
            "Could be targeted by multiple attackers",
          ],
          coachingTips: [
            "Leadership development",
            "Defensive organization",
            "Against multiple attackers",
            "Mentoring younger defenders",
          ],
          assessmentActivities: [
            "Full match observation",
            "1v2 defending",
            "Team defensive leadership",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Diving in is completely normal at this age - it's the instinctive response! Focus on 'standing your ground' and not committing too early. Patience is the main lesson.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can learn body positioning and patience. Introduce the concept of 'showing them where to go.' 1v1 defending games are effective at this age.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect reliable defensive technique. Focus on reading attackers and decision-making. Recovery running and team defending concepts are appropriate.",
        },
      },
      redFlags: [
        "Absolutely no patience despite extended practice",
        "Fear of defensive contact",
        "Cannot understand positioning concepts",
        "Physical limitations affecting defending",
        "Significant gap compared to peers",
      ],
      parentExplanation:
        "1v1 defending is about stopping an attacker who is trying to beat you with the ball. The most important lesson is PATIENCE - not diving in immediately. We teach players to 'show them the line' (force them in one direction), stay on their toes (ready to react), and watch the ball (not the attacker's tricks). Good defending is often invisible - it's about preventing, not tackling.",
      homeActivities: [
        "Play 1v1 games in the backyard - take turns attacking/defending",
        "Watch defenders on TV - notice their body position",
        "Practice staying 'bouncy' on toes",
        "Patience games - how long can you wait before reacting?",
        "Shadow defending - follow someone without touching",
      ],
      bestAssessedIn: [
        "1v1 defending exercises",
        "Small-sided games",
        "Full matches",
        "Defensive phase of play",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across 2-3 sessions in defensive situations",
    },
  },
  {
    sport: "soccer",
    domain: "physical",
    stage: "fundamentals",
    name: "Agility & Coordination",
    slug: "agility-coordination",
    description:
      "The ability to change direction quickly, maintain balance, and coordinate multiple body parts effectively during movement.",
    introductionAge: 4,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 20,
    progressionLevels: {
      1: "Uncoordinated movement; struggles with balance; slow direction changes",
      2: "Basic coordination developing; can change direction with planning",
      3: "Good body control; changes direction quickly; maintains balance in most situations",
      4: "Excellent agility; quick feet; maintains control at speed",
      5: "Elite movement ability; exceptional balance; explosive direction changes",
    },
    observableBehaviors: [
      "Can change direction without falling",
      "Lands balanced from jumps",
      "Moves efficiently (no wasted motion)",
      "Coordinates arms and legs together",
      "Low center of gravity when changing direction",
    ],
    commonMistakes: [
      "Standing upright when changing direction",
      "Crossing feet (leads to falling)",
      "Arms not helping movement",
      "Taking too many steps to change direction",
      "Looking down at feet",
    ],
    coachingTips: [
      "'Get low!' - bend knees for direction changes",
      "'Push off!' - drive off outside foot",
      "'Arms help!' - pump arms for balance and power",
      "'Quick feet!' - small fast steps when needed",
      "'Stay bouncy!' - on balls of feet, not heels",
    ],
    tags: [
      "core",
      "physical",
      "fundamental",
      "agility",
      "coordination",
      "movement",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player shows uncoordinated movement patterns. Struggles with balance and is slow to change direction.",
          observableBehaviors: [
            "Falls over when changing direction",
            "Arms don't coordinate with legs",
            "Very slow direction changes",
            "Trips over own feet",
            "Poor balance even stationary",
          ],
          commonMistakes: [
            "Not bending knees",
            "Feet tangling",
            "No use of arms",
            "Looking at ground",
          ],
          coachingTips: [
            "Start with basic locomotor activities (hopping, skipping)",
            "Balance games (stand on one foot)",
            "Simple obstacle courses",
            "Celebrate effort, not just success",
          ],
          assessmentActivities: [
            "Simple obstacle course",
            "Balance tests (stand on one foot)",
            "Basic direction change drills",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Basic coordination is developing. Can change direction if given time to prepare. Balance improving.",
          observableBehaviors: [
            "Can change direction with preparation",
            "Balance okay at slower speeds",
            "Shows improving coordination",
            "Beginning to use arms",
            "Still hesitant with quick changes",
          ],
          commonMistakes: [
            "Slowing too much before direction change",
            "Standing too upright",
            "Still some balance issues at speed",
            "Movement efficiency poor",
          ],
          coachingTips: [
            "Ladder drills at moderate pace",
            "Cone drills with increasing speed",
            "Balance challenges (eyes closed, uneven surface)",
            "Jump and land activities",
          ],
          assessmentActivities: [
            "Agility ladder (slow)",
            "Cone slalom",
            "Jump and land on target",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Good body control with quick direction changes. Maintains balance in most game situations.",
          observableBehaviors: [
            "Changes direction quickly",
            "Maintains balance at speed",
            "Good coordination overall",
            "Uses arms effectively",
            "Efficient movement patterns",
          ],
          commonMistakes: [
            "May lose balance under pressure",
            "Coordination decreases when fatigued",
            "Still developing explosiveness",
            "Some inefficiencies in movement",
          ],
          coachingTips: [
            "Increase speed of agility work",
            "Add reaction components",
            "Competitive agility games",
            "Sport-specific movements",
          ],
          assessmentActivities: [
            "Timed agility tests",
            "Reaction-based direction changes",
            "Game situation observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent agility with quick feet and maintained control at high speeds. Strong balance under pressure.",
          observableBehaviors: [
            "Quick explosive changes",
            "Excellent balance at all speeds",
            "Efficient movement",
            "Controls body in contact",
            "Athletic appearance",
          ],
          commonMistakes: [
            "May over-rely on athleticism",
            "Could be more efficient in some movements",
          ],
          coachingTips: [
            "Position-specific agility",
            "Maintain through games/competitions",
            "Advanced coordination challenges",
            "Integration with technical skills",
          ],
          assessmentActivities: [
            "Advanced agility tests",
            "Game observation",
            "Competitive movement games",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite movement ability with exceptional balance and explosive direction changes. Stands out athletically.",
          observableBehaviors: [
            "Elite direction changes",
            "Exceptional balance",
            "Explosive power",
            "Movement appears effortless",
            "Athleticism is a weapon",
          ],
          commonMistakes: ["Could coast on natural ability"],
          coachingTips: [
            "Continue challenging with complexity",
            "Sport-specific applications",
            "Leadership in movement activities",
            "Maintain through puberty",
          ],
          assessmentActivities: [
            "Elite-level agility tests",
            "Game observation",
            "Competitive comparison",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Coordination is still developing rapidly. Focus on fundamental movements (running, jumping, hopping, skipping). Make it FUN with games and obstacles. This is the best age to develop these skills!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Prime window for agility development. Challenge with speed, direction changes, and combinations. Sport-specific agility becomes appropriate.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good agility. May see temporary decline during growth spurts - this is normal. Continue challenging while being patient with growth-related awkwardness.",
        },
      },
      redFlags: [
        "Significant coordination issues not improving with practice",
        "Persistent balance problems",
        "Difficulty with basic locomotor skills (running, jumping)",
        "Physical development concerns",
        "Pain during movement activities",
      ],
      parentExplanation:
        "Agility and coordination are foundational athletic abilities - the 'ABCs' of movement. These skills affect everything in sports and daily life. The good news: ages 6-12 are the BEST time to develop these abilities! Playing varied sports and physical games (not just soccer) helps most. Climbing, jumping, balancing, chasing - all contribute to coordination development.",
      homeActivities: [
        "Obstacle courses in backyard or playground",
        "Hopscotch and jumping games",
        "Balance challenges (stand on one foot while doing something)",
        "Play multiple sports - variety helps coordination",
        "Dance and movement games",
        "Playground play - climbing, swinging, jumping",
      ],
      bestAssessedIn: [
        "Agility drills",
        "Game movements (direction changes, etc.)",
        "General observation during activities",
        "Obstacle courses",
      ],
      assessmentFrequency: "Quarterly observation",
      assessmentDuration: "Observe during varied movement activities",
    },
  },
  {
    sport: "soccer",
    domain: "physical",
    stage: "fundamentals",
    name: "Speed",
    slug: "speed",
    description:
      "The ability to move quickly over short distances, including acceleration, top speed, and speed with the ball.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: false,
    sortOrder: 21,
    progressionLevels: {
      1: "Slow relative to peers; poor running technique; slow acceleration",
      2: "Average speed; developing technique; improving acceleration",
      3: "Good speed; efficient running form; quick acceleration",
      4: "Fast relative to peers; excellent technique; explosive starts",
      5: "Exceptionally fast; elite sprinting ability; speed is a weapon",
    },
    observableBehaviors: [
      "Pumps arms when sprinting",
      "Drives knees up",
      "Leans forward during acceleration",
      "Pushes off ground powerfully",
      "Runs in straight line (efficient)",
    ],
    commonMistakes: [
      "Arms across body (not driving forward)",
      "Short choppy strides",
      "Running upright when accelerating",
      "Looking at ground while running",
      "Inefficient running form",
    ],
    coachingTips: [
      "'Arms drive the legs!' - pump those arms",
      "'Drive those knees!' - high knee action",
      "'Lean forward!' - fall into your sprint",
      "'Push the ground away!' - drive off the ground",
      "'Run tall!' - good posture at top speed",
    ],
    tags: ["physical", "fundamental", "speed", "running", "athleticism"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is slow compared to peers with poor running mechanics. May be among the last in races.",
          observableBehaviors: [
            "Noticeably slower than peers",
            "Poor running form",
            "Slow to accelerate",
            "Inefficient movement",
            "May avoid running activities",
          ],
          commonMistakes: [
            "Arms not pumping",
            "Very short strides",
            "Head looking down",
            "No forward lean",
          ],
          coachingTips: [
            "Focus on effort, not results",
            "Basic running form activities",
            "Games where speed helps but isn't required",
            "Celebrate improvement, not placement",
          ],
          assessmentActivities: [
            "Short sprints (10-20 yards)",
            "Running form observation",
            "Tag games",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Average speed for age group. Running technique is developing. Acceleration improving.",
          observableBehaviors: [
            "Middle of pack in races",
            "Developing running form",
            "Shows improvement",
            "Beginning to use arms better",
            "Acceleration improving",
          ],
          commonMistakes: [
            "Inconsistent technique",
            "May slow in longer sprints",
            "Form breaks under pressure",
            "Still developing power",
          ],
          coachingTips: [
            "Technique work - arm action, knee drive",
            "Short burst sprints",
            "Racing games for fun competition",
            "Strength through play",
          ],
          assessmentActivities: [
            "20-yard sprints",
            "Technique observation",
            "Game-based speed assessment",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Good speed with efficient running form. Quick acceleration. Above average for age.",
          observableBehaviors: [
            "Faster than average",
            "Good running technique",
            "Quick off the mark",
            "Efficient movement",
            "Uses speed effectively in games",
          ],
          commonMistakes: [
            "May coast on ability",
            "Could be faster with better form",
            "Speed with ball slower",
            "Top speed not maintained long",
          ],
          coachingTips: [
            "Technique refinement",
            "Speed with ball work",
            "Maintain speed under fatigue",
            "Game situation speed",
          ],
          assessmentActivities: [
            "Timed sprints",
            "Speed with ball tests",
            "Game observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Fast compared to peers with excellent technique. Explosive starts. Speed is an advantage.",
          observableBehaviors: [
            "Among fastest in group",
            "Excellent technique",
            "Explosive acceleration",
            "Speed maintained well",
            "Uses speed as weapon in games",
          ],
          commonMistakes: [
            "May over-rely on speed",
            "Could develop game smarts more",
          ],
          coachingTips: [
            "Maintain with games and sprints",
            "Tactical use of speed",
            "Speed endurance",
            "Position-specific applications",
          ],
          assessmentActivities: [
            "Competitive sprints",
            "Game observation",
            "Speed endurance tests",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Exceptionally fast. Elite sprinting ability. Speed is a significant weapon that stands out.",
          observableBehaviors: [
            "Fastest in group",
            "Perfect technique",
            "Explosive power",
            "Speed looks effortless",
            "Changes games with pace",
          ],
          commonMistakes: ["May rely too heavily on speed"],
          coachingTips: [
            "Maintain elite speed",
            "Develop all-round game",
            "Speed maintenance through growth",
            "Tactical application",
          ],
          assessmentActivities: [
            "Competitive sprints",
            "Game observation",
            "Position requirements",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Speed varies widely at this age. Focus on running TECHNIQUE not outcomes. Make running fun through games. Don't label kids as 'fast' or 'slow' - ability changes!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Speed differences become more stable. Technique development is valuable. This is a good age to develop running form through specific activities.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Speed may fluctuate during growth spurts - this is normal. Continue technique work. Strength development begins to contribute more to speed.",
        },
      },
      redFlags: [
        "Significantly slower with no improvement over time",
        "Pain during running activities",
        "Unusual running gait requiring assessment",
        "Avoiding running activities consistently",
        "Motor development concerns",
      ],
      parentExplanation:
        "Speed in soccer involves quick sprints, not long-distance running. We focus on technique (arm action, knee drive, body position) because good form improves speed. At young ages, speed varies widely and can change significantly as kids grow. The key is developing good running habits and keeping it fun. Playing tag, racing, and active play all help develop speed!",
      homeActivities: [
        "Races in the backyard (short sprints)",
        "Tag games of all kinds",
        "Relay races with family",
        "Playground running games",
        "Practice arm pumping while running",
        "Knee-high running drills",
      ],
      bestAssessedIn: [
        "Short sprint activities",
        "Game situations (chasing/being chased)",
        "Tag games",
        "Speed competitions",
      ],
      assessmentFrequency: "Quarterly observation",
      assessmentDuration: "Observe in multiple running contexts",
    },
  },
  {
    sport: "soccer",
    domain: "psychological",
    stage: "fundamentals",
    name: "Confidence",
    slug: "confidence",
    description:
      "The belief in one's own abilities to perform skills, take on challenges, and recover from mistakes during play.",
    introductionAge: 4,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 30,
    progressionLevels: {
      1: "Hesitant to try; avoids ball; gives up easily; needs constant encouragement",
      2: "Will try with encouragement; affected by mistakes; inconsistent confidence",
      3: "Tries most things willingly; recovers from some mistakes; generally positive",
      4: "Takes on challenges readily; resilient to setbacks; believes in abilities",
      5: "Supremely confident; inspires others; thrives under pressure; welcomes challenges",
    },
    observableBehaviors: [
      "Volunteers to demonstrate",
      "Takes on 1v1 challenges",
      "Tries new skills without fear",
      "Positive body language",
      "Recovers quickly from mistakes",
    ],
    commonMistakes: [
      "Avoiding the ball or challenges",
      "Negative self-talk ('I can't do this')",
      "Hiding during activities",
      "Crying or shutting down after mistakes",
      "Looking to others for validation constantly",
    ],
    coachingTips: [
      "'You can do it!' - genuine encouragement",
      "'Great effort!' - praise the try, not just success",
      "'Mistakes help us learn!' - normalize errors",
      "'That's brave!' - acknowledge courage to try",
      "'I believe in you!' - express confidence in them",
    ],
    tags: ["core", "psychological", "fundamental", "confidence", "mental"],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is hesitant to participate. Avoids challenging situations. Easily discouraged by mistakes.",
          observableBehaviors: [
            "Stands on edge of activities",
            "Avoids ball or challenges",
            "Gives up after mistakes",
            "Seeks constant reassurance",
            "Negative body language",
          ],
          commonMistakes: [
            "Saying 'I can't' before trying",
            "Hiding behind teammates",
            "Refusing to take part",
            "Crying after small setbacks",
          ],
          coachingTips: [
            "Build relationship first",
            "Start with easy successes",
            "Lots of encouragement",
            "Partner with supportive teammate",
            "Celebrate tiny wins",
          ],
          assessmentActivities: [
            "Observation during activities",
            "Note participation level",
            "Response to challenges",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Will participate with encouragement. Still affected by mistakes but shows some willingness to try.",
          observableBehaviors: [
            "Participates with encouragement",
            "Upset by mistakes but recovers",
            "Beginning to try new things",
            "Shows moments of confidence",
            "Improving engagement",
          ],
          commonMistakes: [
            "Confidence fluctuates",
            "Still hesitant on harder tasks",
            "Compares self to others negatively",
            "Needs external validation",
          ],
          coachingTips: [
            "Build on small successes",
            "Teach growth mindset basics",
            "Reduce fear of failure",
            "Create safe environment",
          ],
          assessmentActivities: [
            "Observation during various activities",
            "Response to new challenges",
            "Recovery from mistakes",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Generally confident player who tries most activities willingly. Recovers from some mistakes. Positive outlook.",
          observableBehaviors: [
            "Tries new skills willingly",
            "Generally positive attitude",
            "Recovers from mistakes",
            "Participates fully",
            "Occasional hesitation on hard tasks",
          ],
          commonMistakes: [
            "Confidence dips in new situations",
            "Affected by peer reactions",
            "May avoid very hard challenges",
            "Inconsistent self-belief",
          ],
          coachingTips: [
            "Challenge with harder tasks",
            "Build on strengths",
            "Teach self-talk strategies",
            "Normalize struggle as learning",
          ],
          assessmentActivities: [
            "Response to challenge",
            "Performance under pressure",
            "Attitude observation",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Confident player who takes on challenges readily. Resilient to setbacks. Strong belief in own abilities.",
          observableBehaviors: [
            "Welcomes challenges",
            "Quick recovery from mistakes",
            "Positive self-talk",
            "Willing to fail trying",
            "Helps others feel confident",
          ],
          commonMistakes: [
            "May become over-confident",
            "Could take excessive risks",
            "Might not ask for help",
          ],
          coachingTips: [
            "Channel confidence positively",
            "Leadership opportunities",
            "Balance confidence with humility",
            "Use as role model",
          ],
          assessmentActivities: [
            "Performance in pressure situations",
            "Response to failure",
            "Observation over time",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Supremely confident player who inspires others. Thrives under pressure. Seeks out challenges.",
          observableBehaviors: [
            "Exceptional self-belief",
            "Inspires teammates",
            "Thrives in pressure moments",
            "Seeks challenges",
            "Positive influence on team",
          ],
          commonMistakes: [
            "May border on arrogance",
            "Could intimidate less confident peers",
          ],
          coachingTips: [
            "Leadership development",
            "Helping others grow",
            "Balance with humility",
            "Channel appropriately",
          ],
          assessmentActivities: [
            "Observation over time",
            "Pressure situations",
            "Team influence",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Confidence varies hugely at this age. Some kids are naturally bold, others very hesitant. Focus on creating SAFE environment where trying is celebrated. Never embarrass or call out mistakes publicly.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Confidence becomes more stable but social comparison increases. Build self-efficacy through achievable challenges. Growth mindset teaching is valuable.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Social awareness peaks and can affect confidence significantly. Create supportive team culture. Individual attention for struggling players. Performance pressure increases.",
        },
      },
      redFlags: [
        "Persistent severe anxiety affecting participation",
        "Complete withdrawal from activities",
        "Excessive negative self-talk",
        "No improvement despite supportive environment",
        "Signs of deeper emotional issues",
      ],
      parentExplanation:
        "Confidence is the belief that you can do something successfully. In sports, it affects willingness to try new things, recovery from mistakes, and performance under pressure. We build confidence through achievable challenges, celebrating effort (not just results), and creating a safe environment where mistakes are okay. The most important thing you can do at home is focus on effort and enjoyment, not performance!",
      homeActivities: [
        "Celebrate effort, not just achievement",
        "Talk about what they enjoyed, not just how they did",
        "Share your own stories of learning through failure",
        "Avoid comparison to siblings or peers",
        "Let them see you try new things (and sometimes fail!)",
        "Focus on growth: 'You're getting better at...'",
      ],
      bestAssessedIn: [
        "New or challenging situations",
        "Response to mistakes",
        "Willingness to volunteer",
        "General observation over time",
      ],
      assessmentFrequency: "Ongoing observation throughout season",
      assessmentDuration: "Builds picture over multiple sessions",
    },
  },
  {
    sport: "soccer",
    domain: "psychological",
    stage: "fundamentals",
    name: "Resilience",
    slug: "resilience",
    description:
      "The ability to recover from setbacks, handle adversity, and persist through challenges in sport and competition.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 31,
    progressionLevels: {
      1: "Gives up at first difficulty; overwhelmed by setbacks; cannot self-regulate",
      2: "Recovers slowly from setbacks; needs support to continue; struggles with losing",
      3: "Handles most setbacks; recovers reasonably quickly; learning to manage emotions",
      4: "Bounces back quickly; uses setbacks as motivation; manages emotions well",
      5: "Thrives on adversity; inspires others in tough moments; exceptional emotional control",
    },
    observableBehaviors: [
      "Continues after mistakes",
      "Maintains effort when losing",
      "Recovers from disappointment",
      "Shows appropriate emotional response",
      "Persists through difficulty",
    ],
    commonMistakes: [
      "Stopping trying after errors",
      "Crying/tantrum after setbacks",
      "Blaming others for failures",
      "Complete shutdown when things go wrong",
      "Extreme emotional reactions",
    ],
    coachingTips: [
      "'Keep going!' - encourage persistence",
      "'Mistakes are how we learn!' - reframe errors",
      "'Take a breath' - help with emotional regulation",
      "'What can we do differently?' - solution focus",
      "'Everyone struggles sometimes' - normalize difficulty",
    ],
    tags: [
      "core",
      "psychological",
      "fundamental",
      "resilience",
      "mental",
      "grit",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player struggles significantly after setbacks. Mistakes, failures, or criticism lead to extended negative responses. Difficulty bouncing back within the same session.",
          observableBehaviors: [
            "Cries or becomes very upset after mistakes",
            "Shuts down or withdraws after errors",
            "Cannot continue playing normally after setback",
            "Negative self-talk visible or audible",
            "Blames others when things go wrong",
            "Gives up when challenged or frustrated",
          ],
          commonMistakes: [
            "Interpreting feedback as personal criticism",
            "Catastrophizing small setbacks",
            "Taking mistakes personally rather than as part of learning",
            "Comparing self negatively to others",
          ],
          coachingTips: [
            "Mistakes are how we learn - can you try again?",
            "What's one small thing you could try differently?",
            "I make mistakes too - watch me! What matters is trying again.",
            "Let's take a breath together - you've got this!",
          ],
          assessmentActivities: [
            "Observe response to making errors in practice",
            "Note body language during feedback",
            "Watch willingness to retry after correction",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Shows initial negative response to setbacks but can recover with support. Bounces back within the session but may carry frustration. Beginning to understand setbacks are normal.",
          observableBehaviors: [
            "Initial frustration but recovers with encouragement",
            "Can continue playing after mistakes with support",
            "Understands mistakes happen to everyone",
            "May need cool-down period after setback",
            "Recovery time is decreasing over time",
            "Beginning to try again after failures",
          ],
          commonMistakes: [
            "Applying feedback for short periods only then reverting",
            "Needing repeated reminders of same corrections",
            "Struggling with feedback during competition",
            "Hiding mistakes rather than learning from them",
          ],
          coachingTips: [
            "You tried to apply that - what happened?",
            "Learning takes time - you're making progress!",
            "What questions do you have about what we worked on?",
            "I noticed you bounced back faster that time - great job!",
          ],
          assessmentActivities: [
            "Track recovery time from setbacks",
            "Observe response to feedback in different contexts",
            "Note improvement in resilience over time",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Generally bounces back from setbacks quickly. Can process frustration and continue playing. Views mistakes as learning opportunities most of the time.",
          observableBehaviors: [
            "Brief frustration then re-engagement",
            "Tries again after unsuccessful attempts",
            "Can articulate what to do differently",
            "Maintains effort when things aren't going well",
            "Asks for help rather than giving up",
            "Keeps positive attitude most of the time",
          ],
          commonMistakes: [
            "May become discouraged with slow progress",
            "Sometimes focuses on too many corrections at once",
            "Occasionally reverts under game pressure",
            "Could be more proactive in seeking feedback",
          ],
          coachingTips: [
            "What feedback has been most helpful for you lately?",
            "How do you feel about your progress in this area?",
            "You're showing real growth - what's helping you learn?",
            "Can you teach what you've learned to a teammate?",
          ],
          assessmentActivities: [
            "Track application of feedback over multiple sessions",
            "Observe self-correction without prompting",
            "Note resilience in competitive situations",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong resilience - uses setbacks as fuel for improvement. Remains positive and engaged even during significant challenges. Models resilience for others.",
          observableBehaviors: [
            "Quickly redirects after mistakes",
            "Sees setbacks as opportunities to learn",
            "Maintains performance level under adversity",
            "Encourages teammates who are struggling",
            "Persistent in face of repeated challenges",
            "Talks positively about overcoming struggles",
          ],
          commonMistakes: [
            "May over-focus on improvement and lose natural play",
            "Could be more patient with own development",
          ],
          coachingTips: [
            "What areas are you most curious to improve?",
            "How do you prioritize the feedback you receive?",
            "Can you help others develop their resilience?",
            "You model great learning behavior - keep it up!",
          ],
          assessmentActivities: [
            "Observe leadership in receiving feedback",
            "Note influence on team resilience culture",
            "Track self-directed improvement efforts",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite resilience that thrives under pressure and adversity. Major setbacks are processed quickly and used constructively. Resilience inspires and elevates entire team.",
          observableBehaviors: [
            "Adversity brings out best performance",
            "Processes major setbacks constructively",
            "Creates culture of resilience on team",
            "Helps others develop coping strategies",
            "Remains confident through sustained challenges",
            "Views failures as essential to growth",
          ],
          commonMistakes: ["May set unrealistically high standards for self"],
          coachingTips: [
            "You model elite resilience - how can you spread this?",
            "What's your process for applying feedback?",
            "Continue seeking challenging environments!",
            "Your resilience is a superpower - share it with others!",
          ],
          assessmentActivities: [
            "Leadership assessment in challenging situations",
            "Impact on team resilience culture",
            "Self-directed development plan quality",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Young children are still developing emotional regulation and may struggle to bounce back from setbacks. Keep things light and fun. Normalize mistakes constantly. Model your own mistakes and how you recover. Patience is essential.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can receive more nuanced feedback about resilience. Use stories and examples of famous athletes bouncing back. Help players develop simple strategies for recovering from mistakes. Celebrate bounce-back moments.",
        },
        ages12to14: {
          typicalLevel: "2-4",
          notes:
            "Wide range at this age based on personality and experience. Players can engage in deeper discussions about mindset and resilience. Involve them in developing their own coping strategies. Adolescent emotions add complexity.",
        },
      },
      redFlags: [
        "Unable to continue playing after minor setbacks",
        "Consistent crying or emotional distress in response to normal challenges",
        "Complete avoidance of challenging situations",
        "Negative self-talk that is extreme or concerning",
        "No improvement in coping despite consistent support",
      ],
      parentExplanation:
        "Resilience is the ability to bounce back from setbacks - mistakes, failures, disappointments. It's one of the most important psychological skills, not just for soccer but for life. We help players develop resilience by normalizing mistakes, celebrating effort over outcome, and teaching that failure is part of learning. At home, you can help by responding to their soccer struggles with curiosity ('What did you learn?') rather than disappointment, and by sharing your own stories of bouncing back from setbacks. The goal is for them to see challenges as opportunities, not threats.",
      homeActivities: [
        "Share family stories about bouncing back from failures",
        "After setbacks, play the 'What did we learn?' game",
        "Celebrate effort and persistence, not just results",
        "Model resilience in your own life and discuss it",
        "Ask 'What did you learn today?' instead of 'Did you win?'",
        "Praise specific moments when they bounced back: 'I saw you recover from that mistake - great job!'",
      ],
      bestAssessedIn: [
        "Response to in-training feedback and mistakes",
        "Recovery from errors during games",
        "Behavior during halftime when losing",
        "Reactions after difficult losses or poor performances",
      ],
      assessmentFrequency:
        "Observe at every session, formal assessment quarterly",
      assessmentDuration:
        "Ongoing observation across multiple situations over time",
    },
  },
  {
    sport: "soccer",
    domain: "psychological",
    stage: "fundamentals",
    name: "Teamwork",
    slug: "teamwork",
    description:
      "The ability to work cooperatively with teammates, communicate effectively, and prioritize team success over individual achievement.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 32,
    progressionLevels: {
      1: "Plays alone; doesn't pass or cooperate; unaware of teammates",
      2: "Beginning to include teammates; passes sometimes; aware of others",
      3: "Works well with teammates; shares ball; celebrates others' success",
      4: "Strong collaborator; encourages teammates; team-first mentality",
      5: "Team leader; elevates others; exceptional communication; selfless",
    },
    observableBehaviors: [
      "Passes to teammates",
      "Celebrates teammates' success",
      "Communicates positively",
      "Supports struggling teammates",
      "Shares credit and takes responsibility",
    ],
    commonMistakes: [
      "Ball-hogging",
      "Getting upset when not passed to",
      "Blaming teammates for mistakes",
      "Negative comments to teammates",
      "Only caring about own performance",
    ],
    coachingTips: [
      "'We're a team!' - emphasize collective",
      "'Great pass!' - praise teamwork moments",
      "'Help your teammate!' - encourage support",
      "'How can you include everyone?' - shared responsibility",
      "'Team wins together!' - collective celebration",
    ],
    tags: [
      "core",
      "psychological",
      "fundamental",
      "teamwork",
      "social",
      "cooperation",
    ],
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player operates independently. Little awareness of teammates. Doesn't share the ball or cooperate.",
          observableBehaviors: [
            "Never passes",
            "Unaware of teammates",
            "Doesn't celebrate others' success",
            "Plays as individual",
            "No communication",
          ],
          commonMistakes: [
            "Ignoring open teammates",
            "Getting upset when ball taken",
            "No interest in others' play",
            "Refusing to cooperate in activities",
          ],
          coachingTips: [
            "Pair activities with one partner",
            "Reward any teamwork moments",
            "Use games that require cooperation",
            "Gentle reminders about teammates",
          ],
          assessmentActivities: [
            "Partner activities",
            "Small-sided games",
            "Observation of interactions",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to include teammates. Will pass occasionally. Shows awareness of others but still primarily self-focused.",
          observableBehaviors: [
            "Passes sometimes",
            "Aware of teammates",
            "Occasionally celebrates others",
            "Improving cooperation",
            "Still prefers ball at feet",
          ],
          commonMistakes: [
            "Passes as last resort",
            "Upset when not passed to",
            "Teamwork inconsistent",
            "May exclude certain teammates",
          ],
          coachingTips: [
            "Praise all teamwork moments",
            "Games where passing is required",
            "Discuss what makes a good teammate",
            "Partner with positive role models",
          ],
          assessmentActivities: [
            "Games requiring cooperation",
            "Passing frequency observation",
            "Social interaction observation",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Works well with teammates. Shares the ball willingly. Celebrates others' success. Good team member.",
          observableBehaviors: [
            "Shares ball willingly",
            "Celebrates teammates",
            "Positive communication",
            "Includes all teammates",
            "Team-oriented attitude",
          ],
          commonMistakes: [
            "May favor certain teammates",
            "Could be more encouraging",
            "Leadership not yet developed",
            "Occasionally frustrated with others",
          ],
          coachingTips: [
            "Leadership opportunities",
            "Include all teammates equally",
            "Model encouraging communication",
            "Discuss team dynamics",
          ],
          assessmentActivities: [
            "Team activities observation",
            "Social dynamics observation",
            "Game behavior",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong team player who encourages others. Team-first mentality. Positive influence on group.",
          observableBehaviors: [
            "Encourages all teammates",
            "Team success over personal",
            "Positive leader",
            "Helps struggling players",
            "Excellent communication",
          ],
          commonMistakes: [
            "May do too much for others",
            "Could develop individual skills more",
          ],
          coachingTips: [
            "Leadership development",
            "Balance team with individual growth",
            "Mentoring opportunities",
            "Model for others",
          ],
          assessmentActivities: [
            "Team dynamics observation",
            "Leadership in activities",
            "Game behavior",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Exceptional team player and leader. Elevates everyone around them. Selfless and communicative.",
          observableBehaviors: [
            "Makes everyone better",
            "Exceptional leader",
            "Selfless play",
            "Organizes teammates",
            "Outstanding communication",
          ],
          commonMistakes: ["May need to be more assertive sometimes"],
          coachingTips: [
            "Captain role",
            "Help develop team culture",
            "Balance with own development",
            "Recognize contribution",
          ],
          assessmentActivities: [
            "Team leadership observation",
            "Impact on team dynamics",
            "Long-term observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Parallel play (playing alongside rather than with teammates) is normal at younger ages. Don't force passing - encourage it. Focus on enjoying being part of a team.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Social awareness increases significantly. Team dynamics become important. Address cliques or exclusion. Teach what good teamwork looks like.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good teamwork. Social dynamics can be complex - be aware of group issues. Develop leadership within the group. Team culture matters greatly.",
        },
      },
      redFlags: [
        "Persistent isolation from group",
        "Bullying or excluding teammates",
        "Unable to cooperate even in structured activities",
        "Social anxiety preventing participation",
        "Consistently negative impact on team dynamics",
      ],
      parentExplanation:
        "Teamwork is working together toward a common goal - one of sport's greatest lessons for life! At young ages, kids naturally play 'parallel' (alongside each other) rather than truly together - this evolves over time. We encourage passing, celebrating teammates' successes, and being a good sport. You can reinforce this by asking 'Who did you help today?' and 'What did your team do well?' rather than focusing only on their individual performance.",
      homeActivities: [
        "Ask about teammates - 'Tell me about your team'",
        "Celebrate team success, not just individual",
        "Play cooperative games at home",
        "Discuss what makes a good teammate",
        "Watch team sports together and notice teamwork",
        "Model cooperation in family activities",
      ],
      bestAssessedIn: [
        "Team activities and games",
        "Passing situations",
        "Observation of social interactions",
        "Response to teammates' success/struggles",
      ],
      assessmentFrequency: "Ongoing observation throughout season",
      assessmentDuration: "Builds picture over multiple sessions",
    },
  },
  {
    slug: "ball-mastery-toe-taps",
    name: "Ball Mastery - Toe Taps",
    sport: "soccer",
    domain: "technical",
    stage: "fundamentals",
    description:
      "Alternating toe taps on top of the ball with control and rhythm",
    introductionAge: 6,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Struggles to tap ball; loses balance frequently; ball rolls away after each attempt",
      2: "Can perform slow toe taps; needs to stop and reset often; rhythm inconsistent",
      3: "Performs toe taps with steady rhythm; maintains balance; can sustain for 20+ seconds",
      4: "Quick, rhythmic toe taps with eyes up; can move around the ball; confident alternating feet",
      5: "Effortless toe taps at high speed; incorporates variations; maintains rhythm while scanning",
    },
    observableBehaviors: [
      "Alternates feet smoothly on top of ball",
      "Maintains athletic stance with knees bent",
      "Ball stays relatively stationary under control",
      "Eyes can look up periodically during taps",
      "Demonstrates consistent rhythm without pausing",
    ],
    commonMistakes: [
      "Stepping on ball instead of tapping top",
      "Standing too upright (losing balance)",
      "Looking down at feet throughout",
      "Tapping too hard (ball rolls away)",
      "Using same foot repeatedly instead of alternating",
    ],
    coachingTips: [
      "What happens to your balance when you bend your knees a little more?",
      "Can you feel the top of the ball with your toes without looking?",
      "How light can you make your touches while still staying in control?",
      "What do you notice when you try to tap faster - where does the ball go?",
      "Can you count out loud while tapping - does that help your rhythm?",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "ball-mastery",
      "coordination",
      "foundation",
    ],
    isCore: true,
    sortOrder: 1,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is exploring the toe tap movement. Balance is challenging and the ball frequently escapes. This is a normal starting point - every mistake is a learning opportunity.",
          observableBehaviors: [
            "Loses balance after 2-3 taps",
            "Ball rolls away from foot",
            "Uses one foot predominantly",
            "Must watch feet constantly",
            "Long pauses between tap attempts",
          ],
          commonMistakes: [
            "Stepping flat on ball (slipping risk)",
            "Standing straight up without knee bend",
            "Tapping too forcefully",
            "Feet too close together for balance",
          ],
          coachingTips: [
            "What happens if you try tapping next to a wall for balance support?",
            "Can you show me your best statue pose before we add the ball?",
            "Celebrate the effort! How many taps can you do today versus yesterday?",
            "What does the top of the ball feel like under your foot?",
            "Let's see if you can beat your personal best - that's what matters most!",
          ],
          assessmentActivities: [
            "Count maximum consecutive taps (any count is success)",
            "Toe tap for 10 seconds with wall support",
            "Alternate foot tapping at own pace",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can perform toe taps but needs frequent resets. Rhythm is developing and effort is evident. The learning process is visible in their concentration.",
          observableBehaviors: [
            "Completes 5-10 consecutive taps",
            "Begins alternating feet intentionally",
            "Balance improving but still wobbly",
            "Can sustain 10-15 seconds",
            "Starting to find personal rhythm",
          ],
          commonMistakes: [
            "Rhythm speeds up then breaks down",
            "Dominant foot does more work",
            "Ball drifts slowly in one direction",
            "Tension in shoulders and upper body",
          ],
          coachingTips: [
            "What speed feels most comfortable for you right now?",
            "Can you relax your shoulders while tapping - what changes?",
            "How many taps with just your left foot? Now your right? What did you notice?",
            "What if you whispered 'left-right-left-right' while tapping?",
            "Where is your balance best - try moving your feet a bit wider apart",
          ],
          assessmentActivities: [
            "Toe taps for 20 seconds (count total)",
            "Alternating feet for 15 seconds",
            "Toe taps while counting out loud",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player maintains consistent toe taps with good rhythm. Balance is reliable and they demonstrate the persistence and focus to sustain the movement.",
          observableBehaviors: [
            "Sustains 20+ seconds without stopping",
            "Smooth alternating between feet",
            "Ball stays in consistent position",
            "Can occasionally glance up",
            "Consistent rhythm maintained",
          ],
          commonMistakes: [
            "Rhythm becomes robotic (no variation)",
            "Still looks down when challenged",
            "Speed plateaus - afraid to go faster",
            "Upper body movement excessive",
          ],
          coachingTips: [
            "What happens if you try to tap just a little bit faster?",
            "Can you do toe taps while I hold up fingers - how many did you see?",
            "What if you moved in a small circle while tapping?",
            "How does it feel when you challenge yourself to try something new?",
            "When you make a mistake, what helps you restart quickly?",
          ],
          assessmentActivities: [
            "Toe taps for 30 seconds at steady pace",
            "Toe taps with head up - identify colors coach shows",
            "Toe taps moving around the ball (360 degrees)",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player demonstrates confident, quick toe taps with awareness of surroundings. Shows willingness to challenge themselves and try variations.",
          observableBehaviors: [
            "Quick taps with eyes up frequently",
            "Can move around ball while tapping",
            "Maintains control at increased speed",
            "Demonstrates tap variations",
            "Recovers quickly from small errors",
          ],
          commonMistakes: [
            "May sacrifice control for speed",
            "Variations sometimes disrupt rhythm",
            "Could be more creative with movements",
          ],
          coachingTips: [
            "What new variation can you invent with toe taps?",
            "How fast can you go while still feeling in control?",
            "Can you toe tap while moving forward? Backward?",
            "What challenges have you overcome to get this good?",
            "How could you help a teammate who is still learning toe taps?",
          ],
          assessmentActivities: [
            "Speed toe taps for 20 seconds (count total)",
            "Toe taps while moving in different directions",
            "Create and demonstrate a toe tap combo",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player exhibits mastery with effortless toe taps. Demonstrates creativity, leadership in helping others, and genuine love for the skill challenge.",
          observableBehaviors: [
            "Effortless high-speed taps",
            "Seamless transitions between variations",
            "Full field awareness during taps",
            "Creates own challenges and combos",
            "Helps teammates improve",
          ],
          commonMistakes: [
            "May get bored without new challenges",
            "Could over-complicate simple situations",
          ],
          coachingTips: [
            "What new challenge can you set for yourself?",
            "How would you teach this to someone just starting?",
            "Can you combine toe taps with other ball mastery moves?",
            "What does it mean to be a leader in practice?",
            "How can you help make our team better at ball mastery?",
          ],
          assessmentActivities: [
            "Create and perform a 30-second ball mastery routine including toe taps",
            "Teach toe taps to a less experienced player",
            "Toe taps in dynamic game-like situations",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Toe taps are challenging for this age due to coordination development. Focus on effort and fun, not perfection. Celebrate every attempt - falling down and getting back up is part of learning! Short practice bursts (30-60 seconds) work best. Make it playful: 'Can you tap like a bunny?'",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Coordination allows for more consistent toe taps. Players can sustain longer practice and understand rhythm concepts. Introduce the idea of 'personal bests' - competing against yourself builds healthy confidence. Begin adding head-up challenges.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect competent toe taps with the ability to add variations. Challenge them to integrate toe taps into warm-ups they design. Encourage leadership - teaching younger players reinforces their own learning and builds social skills.",
        },
      },
      redFlags: [
        "Consistent balance issues after multiple sessions (may need physical assessment)",
        "Frustration leading to giving up rather than trying again",
        "Avoidance of ball mastery activities entirely",
        "No improvement over 4-6 weeks with regular practice",
        "Excessive anxiety or negative self-talk during attempts",
      ],
      parentExplanation:
        "Toe taps build the foundation for all soccer skills - they develop balance, coordination, and 'feel' for the ball. Your child is learning that getting better takes practice and patience. At home, encourage them to practice for short periods (1-2 minutes) rather than long sessions. Celebrate effort and improvement, not just success. When they make mistakes (and they will!), that's when the best learning happens. Ask them 'What did you learn?' rather than 'How many did you do?'",
      homeActivities: [
        "Toe tap challenge: beat yesterday's personal best",
        "Toe taps during TV commercials (makes it fun!)",
        "Practice on different surfaces (grass, carpet, pavement)",
        "Toe tap counting game with family members",
        "Video record and watch back together (great for self-reflection)",
        "Create a toe tap obstacle course",
      ],
      bestAssessedIn: [
        "Warm-up routines",
        "Ball mastery stations",
        "Individual skill challenges",
        "Partner counting activities",
      ],
      assessmentFrequency:
        "Weekly observation during training, formal assessment monthly",
      assessmentDuration: "30-60 seconds of observation is sufficient",
    },
  },
  {
    slug: "dribbling-with-inside-outside",
    name: "Dribbling with Inside/Outside",
    sport: "soccer",
    domain: "technical",
    stage: "fundamentals",
    description: "Moving with the ball using inside and outside of both feet",
    introductionAge: 6,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Ball escapes frequently; uses only one surface; cannot change direction; stops to control",
      2: "Can dribble slowly using inside; beginning to use outside; changes direction with difficulty",
      3: "Smooth inside/outside touch at jogging pace; changes direction fluidly; maintains ball close",
      4: "Quick direction changes using both surfaces; beats defenders; executes at speed under pressure",
      5: "Elite close control with deceptive touches; creates space effortlessly; artistic ball manipulation",
    },
    observableBehaviors: [
      "Alternates between inside and outside of foot smoothly",
      "Ball stays within playing distance during direction changes",
      "Uses both feet for inside/outside touches",
      "Maintains body balance during quick changes",
      "Head up to scan while dribbling",
    ],
    commonMistakes: [
      "Only using inside of foot",
      "Pushing ball too far when changing direction",
      "Stopping to switch from inside to outside",
      "Looking down constantly during dribbling",
      "Standing upright instead of athletic stance",
    ],
    coachingTips: [
      "Can you feel the difference between touching with the inside versus outside?",
      "What happens to the defender when you quickly change the direction of the ball?",
      "How close can you keep the ball while still moving forward?",
      "Which foot feels more comfortable - let's practice the other one too!",
      "Can you look up and still know where the ball is?",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "dribbling",
      "ball-control",
      "1v1",
    ],
    isCore: true,
    sortOrder: 3,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is discovering how different parts of the foot move the ball differently. Control is developing and mistakes are plentiful - all part of the learning journey.",
          observableBehaviors: [
            "Ball frequently rolls away",
            "Uses only one surface (usually inside)",
            "Must stop to change direction",
            "Watches ball constantly",
            "Stiff body movement",
          ],
          commonMistakes: [
            "Kicking ball instead of pushing with foot",
            "Reaching for ball instead of moving to it",
            "No awareness of body position",
            "Forgetting to use outside of foot",
          ],
          coachingTips: [
            "Can you push the ball gently with the inside of your foot like petting a cat?",
            "Now try with the outside - how does it feel different?",
            "What happens when you bend your knees a little more?",
            "Mistakes are how we learn - what did you discover that time?",
            "Can you dribble as slowly as possible without losing the ball?",
          ],
          assessmentActivities: [
            "Dribble across small grid using inside of foot only",
            "Dribble using outside of foot only (short distance)",
            "Stop ball with inside, then push with outside",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can dribble using inside of foot and is beginning to incorporate outside touches. Shows effort and determination to try both surfaces.",
          observableBehaviors: [
            "Comfortable dribbling with inside",
            "Attempts outside touches",
            "Can change direction (slowly)",
            "Ball control improving",
            "Beginning to use both feet",
          ],
          commonMistakes: [
            "Reverts to inside only under pressure",
            "Outside touch is heavy",
            "Direction changes are slow and obvious",
            "Only uses dominant foot",
          ],
          coachingTips: [
            "How many different ways can you touch the ball to change direction?",
            "What if you alternated inside-outside-inside without stopping?",
            "Can you feel when your outside touch is too hard?",
            "Which direction change fools your partner - inside or outside?",
            "Let's count: how many outside touches can you make in one minute?",
          ],
          assessmentActivities: [
            "Cone slalom using inside/outside alternating",
            "Dribble and change direction on whistle",
            "Partner follow-the-leader dribbling",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player smoothly transitions between inside and outside touches. Can change direction fluidly while maintaining control. Shows growing confidence.",
          observableBehaviors: [
            "Smooth inside/outside transitions",
            "Fluid direction changes",
            "Ball stays close to body",
            "Can look up periodically",
            "Both feet becoming reliable",
          ],
          commonMistakes: [
            "Speed causes control problems",
            "Predictable patterns in direction changes",
            "Head drops under pressure",
            "May telegraph intentions",
          ],
          coachingTips: [
            "What happens to the defender when you change direction quickly?",
            "Can you vary your rhythm - slow, slow, then QUICK?",
            "How can you use your body to hide which way you're going?",
            "When the defender is close, what touch helps you escape?",
            "What do you notice about your balance when you change direction?",
          ],
          assessmentActivities: [
            "Dribble through cone course at increasing speed",
            "1v1 in small grid",
            "Inside/outside moves to beat passive defender",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player executes quick direction changes under pressure. Uses inside/outside effectively to beat defenders and create space. Demonstrates confidence and creativity.",
          observableBehaviors: [
            "Quick changes beat defenders",
            "Executes at game speed",
            "Creates space effectively",
            "Unpredictable movement patterns",
            "Head up even under pressure",
          ],
          commonMistakes: [
            "May over-dribble when pass is better",
            "Occasionally takes unnecessary risks",
            "Could be more efficient in certain situations",
          ],
          coachingTips: [
            "When do you dribble to beat a player versus dribble to keep possession?",
            "How do you decide when to take on a defender?",
            "What's your favorite move to create space - can you develop another?",
            "How can your dribbling help your teammates?",
            "When has a risky dribble paid off? When hasn't it?",
          ],
          assessmentActivities: [
            "1v1 attacking situations",
            "Small-sided games (watch for purposeful dribbling)",
            "Beat defender and finish challenges",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player demonstrates elite close control with artistic ball manipulation. Creates space effortlessly and uses dribbling to unlock defenses. A joy to watch.",
          observableBehaviors: [
            "Artistic ball manipulation",
            "Creates chances through dribbling",
            "Unpredictable and deceptive",
            "Maintains control at any speed",
            "Dribbling is a weapon",
          ],
          commonMistakes: [
            "May try to beat too many players",
            "Could frustrate teammates by not releasing ball",
          ],
          coachingTips: [
            "When does your dribbling serve the team best?",
            "How can you use your skill to create opportunities for others?",
            "What can you teach teammates about dribbling confidence?",
            "How do you stay humble while being so skilled?",
            "What new move are you working on?",
          ],
          assessmentActivities: [
            "Game observation - successful take-ons",
            "1v1, 1v2 challenges",
            "Creative dribbling in game situations",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Make dribbling playful! Games like 'sharks and minnows' or 'traffic lights' build skills without pressure. Focus on ball touches rather than beating defenders. At this age, the ball is their friend to explore with. Celebrate all attempts to try new touches.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand inside versus outside touches and practice deliberately. Introduce the idea of 'moves' that combine touches. Lots of repetition in fun games builds the muscle memory needed. Both feet should be developing.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect players to dribble with purpose - to beat defenders or maintain possession. Challenge them to develop signature moves. Discuss decision-making: when to dribble, when to pass. 1v1 confidence is important psychologically at this age.",
        },
      },
      redFlags: [
        "Refuses to attempt dribbling in games (always passes immediately)",
        "Cannot use outside of foot after extended practice",
        "Extreme frustration when losing ball",
        "Physical discomfort or avoiding using one leg",
        "No improvement in close control over multiple months",
      ],
      parentExplanation:
        "Dribbling with the inside and outside of the foot gives players two 'gears' to change direction. The inside of the foot pulls the ball across the body; the outside pushes it away. Together, they allow quick direction changes that can beat defenders. At home, dribbling through cones or household objects (gently!) helps develop this skill. Encourage using both feet - the 'magic' happens when both are comfortable. Let them watch skilled dribblers on TV and try to copy moves they see.",
      homeActivities: [
        "Cone slalom in backyard (inside/outside required)",
        "Dribble figure-8s around two objects",
        "Copy moves from YouTube tutorials",
        "Dribble tag with family members",
        "Practice signature moves repeatedly",
        "Wall touches: inside-push, outside-push patterns",
      ],
      bestAssessedIn: [
        "Dribbling relay activities",
        "1v1 situations",
        "Small-sided games",
        "Technical warm-up circuits",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration:
        "Observe across varied dribbling situations (5-10 minutes)",
    },
  },
  {
    slug: "agility-change-of-direction",
    name: "Agility - Change of Direction",
    sport: "soccer",
    domain: "physical",
    stage: "fundamentals",
    description: "Ability to quickly change direction while running",
    introductionAge: 6,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Slow direction changes, loses balance",
      2: "Can change direction but slows significantly",
      3: "Smooth direction changes at moderate speed",
      4: "Quick direction changes, maintains speed",
      5: "Explosive changes, can fake and deceive",
    },
    observableBehaviors: [
      "Low center of gravity",
      "Quick feet",
      "Body control",
      "Eyes and head lead the direction change before the feet turn",
      "Arms swing to assist balance and momentum through the turn",
    ],
    commonMistakes: [
      "Standing too tall",
      "Crossing feet",
      "Losing balance",
      "Looking down at the feet instead of the target direction",
      "Taking too many steps to slow down before changing direction",
    ],
    coachingTips: [
      "Bend your knees",
      "Small quick steps before changing",
      "Push off the outside foot",
      "Look where you want to go before your feet turn",
      "Use your arms to help drive and balance through the turn",
    ],
    tags: ["agility", "movement", "physical"],
    isCore: true,
    sortOrder: 10,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player shows limited ability to change direction. Movements are slow, off-balance, and lack coordination. Often loses balance or stumbles when attempting direction changes.",
          observableBehaviors: [
            "Takes wide, sweeping arcs when changing direction",
            "Often stumbles or loses balance during direction changes",
            "Needs multiple steps to slow down before turning",
            "Body remains upright without proper lean",
            "Arms do not assist in balance or momentum",
          ],
          commonMistakes: [
            "Standing too tall without athletic stance",
            "Crossing feet during direction changes",
            "Looking at feet instead of target direction",
            "Not bending knees to lower center of gravity",
            "Momentum carrying player past intended direction",
          ],
          coachingTips: [
            "What happens to your balance when you bend your knees more?",
            "Can you feel yourself getting lower before you turn?",
            "Let's celebrate every attempt - mistakes help us learn!",
            "What do you notice about how your feet feel on the ground?",
            "Try turning like you're in a small box - small steps are powerful!",
          ],
          assessmentActivities: [
            "Cone touch and return (short distance)",
            "Simple left-right shuffle between markers",
            "Follow the leader with direction changes",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can change direction but with noticeable deceleration and hesitation. Shows understanding of body position but execution is inconsistent.",
          observableBehaviors: [
            "Can change direction with 2-3 step preparation",
            "Shows some knee bend before direction change",
            "Occasionally maintains balance through turns",
            "Beginning to plant outside foot for cuts",
            "Starts using arms for balance",
          ],
          commonMistakes: [
            "Slowing down too much before changing direction",
            "Inconsistent foot placement on cuts",
            "Upper body lags behind lower body",
            "Hesitating before committing to new direction",
            "Reverting to upright stance under pressure",
          ],
          coachingTips: [
            "What happens if you push harder off your outside foot?",
            "How quickly can you get your eyes looking where you want to go?",
            "Notice how your body feels when you stay low - is it more powerful?",
            "Each wobble teaches your body something new - keep exploring!",
            "Can you feel the difference between a slow turn and a sharp cut?",
          ],
          assessmentActivities: [
            "T-drill at moderate pace",
            "React and change direction on whistle",
            "Partner shadow drill (slow speed)",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player demonstrates reliable direction changes with proper technique in controlled settings. Can execute cuts effectively but may lose efficiency when fatigued or under pressure.",
          observableBehaviors: [
            "Plants and drives effectively in most situations",
            "Maintains low center of gravity through changes",
            "Eyes and head lead the direction change",
            "Arms swing opposite to legs for balance",
            "Can change direction without significant speed loss",
          ],
          commonMistakes: [
            "Technique breaks down when fatigued",
            "Slower direction changes under defensive pressure",
            "Occasionally telegraphs intended direction",
            "May favor one side over the other",
            "Inconsistent first step explosiveness after cut",
          ],
          coachingTips: [
            "What adjustments help you change direction faster to your weaker side?",
            "How can you disguise where you're about to go?",
            "When you get tired, what's the first thing that changes in your technique?",
            "Can you make the defender guess wrong about your next move?",
            "What does it feel like when you nail a sharp cut? Let's recreate that!",
          ],
          assessmentActivities: [
            "Timed agility ladder with direction changes",
            "1v1 keep-away with limited space",
            "Reaction drill with visual cues",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player executes sharp, explosive direction changes consistently in game situations. Maintains technique under pressure and fatigue. Can deceive opponents with body feints.",
          observableBehaviors: [
            "Explosive first step out of direction changes",
            "Seamlessly links multiple direction changes",
            "Uses deceptive body movements before cuts",
            "Maintains technique when fatigued",
            "Equal proficiency changing direction either way",
          ],
          commonMistakes: [
            "May over-rely on agility when simpler solutions exist",
            "Occasionally too predictable in timing of cuts",
          ],
          coachingTips: [
            "How can you use your agility to create space for teammates?",
            "What patterns do defenders look for? How can you break those patterns?",
            "Leadership opportunity: can you help teammates improve their footwork?",
            "When is the best moment to make your move?",
            "How does your agility combine with your technical skills?",
          ],
          assessmentActivities: [
            "Complex agility course with decision-making",
            "1v1 attacking in tight spaces",
            "Game observation during high-pressure moments",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite agility that creates consistent advantages. Player combines explosive direction changes with deception to beat defenders reliably. Agility is a weapon in their game.",
          observableBehaviors: [
            "Creates separation from defenders at will",
            "Changes direction with minimal speed loss",
            "Instinctively reads and reacts to defensive movements",
            "Combines agility with ball skills seamlessly",
            "Maintains elite movement quality for full game",
          ],
          commonMistakes: [
            "May attempt too many direction changes when direct approach is better",
          ],
          coachingTips: [
            "How can you use your elite movement to make the whole team better?",
            "What can you teach others about reading defensive movements?",
            "Continue challenging yourself - what's the next level?",
            "How do you maintain this quality over a full season?",
            "Model the effort and learning mindset for younger players",
          ],
          assessmentActivities: [
            "Elite speed and agility testing",
            "Game observation for separation created",
            "Performance under tournament pressure",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Young players are still developing coordination and body awareness. Focus on fun movement games rather than technical drills. Celebrate effort and improvement over outcomes. Balance and basic coordination are developing rapidly at this age.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is a critical window for agility development - the nervous system is highly adaptable. Introduce more structured footwork activities while keeping them playful. Players can begin understanding how body position affects movement quality.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Players going through growth spurts may temporarily lose coordination - this is normal. Focus on maintaining technique even as bodies change. Can work on more advanced deception and combining agility with game situations.",
        },
      },
      redFlags: [
        "Consistent balance issues not improving with practice",
        "Significant difference in ability between left and right sides persisting over time",
        "Pain or discomfort during direction changes",
        "Fear of quick movements not decreasing with exposure",
        "Unable to learn basic footwork patterns after extended practice",
      ],
      parentExplanation:
        "Agility - the ability to change direction quickly and efficiently - is fundamental to soccer. We work on teaching players to stay low, plant their outside foot, and explode in a new direction. It's not just about speed, but about control and body awareness. Every player develops at their own pace, and we celebrate effort and improvement. Home activities that involve quick movements and balance help reinforce what we work on in practice!",
      homeActivities: [
        "Play tag games that require quick direction changes",
        "Set up simple cone courses in the backyard",
        "Balance activities like standing on one foot while brushing teeth",
        "Hopscotch and similar playground games",
        "Dancing - great for coordination and rhythm",
        "Jump rope - builds foot quickness and coordination",
      ],
      bestAssessedIn: [
        "Agility drills and ladder work",
        "1v1 situations during training",
        "Small-sided games with limited space",
        "Warm-up activities with direction changes",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple training sessions and games",
    },
  },
  {
    slug: "coachability",
    name: "Coachability",
    sport: "soccer",
    domain: "psychological",
    stage: "fundamentals",
    description:
      "Receptiveness to instruction, feedback, and trying new things",
    introductionAge: 6,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Resistant to feedback, doesn't try new things",
      2: "Listens but struggles to apply feedback",
      3: "Accepts feedback and attempts to implement",
      4: "Actively seeks feedback, applies it quickly",
      5: "Self-corrects, asks questions, loves learning",
    },
    observableBehaviors: [
      "Eye contact when receiving instruction",
      "Tries suggestions",
      "Asks questions",
      "Retains and applies a correction in the next attempt, not just in the moment",
      "Recovers quickly from a correction without becoming defensive or shutting down",
    ],
    commonMistakes: [
      "Processes instructions quietly and slowly - can look disengaged when actually absorbing",
      "Needs to hear or see a correction several times before it sticks, which can look like resistance to feedback",
      "Reacts defensively to a single correction in the moment, then recovers and applies it a few reps later",
      "Withdraws or goes quiet when corrected in front of teammates, even though they take the same feedback well one-on-one",
      "Nods and says 'okay' to a correction without repeating it back or attempting it, then makes the same mistake on the next try",
    ],
    coachingTips: [
      "Catch them doing something right",
      "Make feedback specific and immediate",
      "Ask what they noticed",
      "Give one correction at a time rather than stacking multiple fixes at once",
      "Frame feedback as 'I noticed... I wonder...' rather than a flat correction",
    ],
    tags: ["psychological", "attitude", "learning"],
    isCore: true,
    sortOrder: 30,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player struggles to receive or apply coaching feedback. May resist instruction, become defensive, or ignore suggestions. Limited ability to implement changes.",
          observableBehaviors: [
            "Defensive or argumentative when receiving feedback",
            "Ignores or forgets coaching instructions quickly",
            "Does not attempt to apply corrections",
            "Body language shows disengagement (crossed arms, looking away)",
            "Makes excuses rather than attempting change",
          ],
          commonMistakes: [
            "Interpreting feedback as personal criticism",
            "Shutting down emotionally when corrected",
            "Not asking for clarification when confused",
            "Comparing self negatively to others",
            "Giving up after unsuccessful attempts",
          ],
          coachingTips: [
            "What's one small thing you could try differently?",
            "Mistakes are how we learn - can you try again?",
            "I'm going to help you get better - are you ready?",
            "Let's focus on effort, not perfection!",
            "How do you feel when you're learning something new?",
          ],
          assessmentActivities: [
            "Give simple instruction and observe response",
            "Note body language during feedback",
            "Observe willingness to retry after correction",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Shows willingness to receive feedback but struggles to implement it consistently. Can accept coaching in positive moments but may become frustrated when challenged.",
          observableBehaviors: [
            "Listens to feedback without strong resistance",
            "Attempts to apply corrections but inconsistently",
            "Accepts feedback better from trusted coaches",
            "Shows frustration but continues trying",
            "Beginning to ask questions about feedback",
          ],
          commonMistakes: [
            "Applying feedback for short periods only",
            "Reverting to old habits under pressure",
            "Accepting feedback but not fully understanding it",
            "Needing repeated reminders of same corrections",
            "Struggling with feedback during competition",
          ],
          coachingTips: [
            "What part of that feedback makes sense to you?",
            "How can we remember this for next time?",
            "You tried to apply that - what happened?",
            "Learning takes time - you're making progress!",
            "What questions do you have about what we worked on?",
          ],
          assessmentActivities: [
            "Provide multi-step instruction and observe",
            "Check retention of coaching after short break",
            "Observe response to feedback during games",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Receives feedback positively and makes genuine attempts to implement it. Can sustain changes over multiple sessions. Open to learning and shows growth mindset.",
          observableBehaviors: [
            "Listens actively with positive body language",
            "Attempts corrections immediately",
            "Retains coaching from session to session",
            "Asks clarifying questions appropriately",
            "Shows visible effort to improve",
          ],
          commonMistakes: [
            "May become discouraged with slow progress",
            "Sometimes focuses on too many corrections at once",
            "Could be more proactive in seeking feedback",
            "Occasionally reverts under game pressure",
            "May need help prioritizing what to work on",
          ],
          coachingTips: [
            "What feedback has been most helpful for you lately?",
            "How do you feel about your progress in this area?",
            "Let's pick one thing to focus on today - what's most important?",
            "You're showing real growth - what's helping you learn?",
            "Can you teach what you've learned to a teammate?",
          ],
          assessmentActivities: [
            "Track application of feedback over multiple sessions",
            "Observe self-correction without prompting",
            "Note frequency of seeking feedback",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Actively seeks feedback and applies it quickly. Views coaching as opportunity for growth. Can receive feedback from multiple sources and prioritize what to work on.",
          observableBehaviors: [
            "Proactively asks for feedback",
            "Applies corrections quickly and retains them",
            "Welcomes challenging feedback",
            "Self-corrects based on previous coaching",
            "Helps teammates receive and apply feedback",
          ],
          commonMistakes: [
            "May over-focus on feedback and lose natural play",
            "Could be more patient with own development",
          ],
          coachingTips: [
            "What areas are you most curious to improve?",
            "How do you prioritize the feedback you receive?",
            "Can you help others develop their coachability?",
            "Balance analysis with trusting your instincts!",
            "You model great learning behavior - keep it up!",
          ],
          assessmentActivities: [
            "Observe leadership in receiving feedback",
            "Note influence on team learning culture",
            "Track self-directed improvement efforts",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite learner who maximizes every coaching interaction. Creates learning opportunities for self and others. Models coachability for the entire team.",
          observableBehaviors: [
            "Transforms feedback into immediate improvement",
            "Creates team culture of learning",
            "Seeks feedback from multiple sources",
            "Processes feedback at game speed",
            "Mentors teammates in receiving coaching",
          ],
          commonMistakes: ["May set unrealistically high standards for self"],
          coachingTips: [
            "You model elite coachability - how can you spread this?",
            "What's your process for applying feedback?",
            "Continue seeking challenging coaching environments!",
            "Balance growth mindset with self-compassion",
            "Your coachability is a superpower - share it with others!",
          ],
          assessmentActivities: [
            "Leadership assessment in learning situations",
            "Impact on team learning culture",
            "Self-directed development plan quality",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Young children are still developing emotional regulation and may struggle with feedback. Keep instructions simple and positive. Celebrate effort over outcome. Avoid public corrections when possible. Make learning feel like play!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can receive more detailed feedback but still need it delivered positively. Model how to receive feedback. Use 'I notice... I wonder...' language. Help players see feedback as helpful, not critical.",
        },
        ages12to14: {
          typicalLevel: "2-4",
          notes:
            "Wide range at this age based on personality and experience. Players can engage in deeper discussions about their development. Involve them in goal-setting. Adolescents may have more complex emotional responses to feedback - be patient and supportive.",
        },
      },
      redFlags: [
        "Complete refusal to accept any feedback",
        "Severe emotional reactions to correction",
        "Consistent blame of others for own mistakes",
        "No improvement in receptiveness over extended time",
        "Anxiety or fear responses to coaching situations",
      ],
      parentExplanation:
        "Coachability is the ability to receive feedback positively and use it to improve. It's one of the most important skills for long-term development in any area of life! We use the ELM framework: celebrate Effort, embrace Learning, and see Mistakes as opportunities. Young players are still developing emotional regulation, so we're patient and positive. At home, you can model coachability by showing how you receive feedback in your own life and talking about mistakes as learning opportunities!",
      homeActivities: [
        "Model receiving feedback positively in your own life",
        "Talk about mistakes as learning opportunities",
        "Ask 'What did you learn today?' instead of 'Did you win?'",
        "Celebrate effort and improvement, not just results",
        "Share stories of famous people who learned from feedback",
        "Practice giving and receiving feedback as a family game",
      ],
      bestAssessedIn: [
        "Response to in-training feedback",
        "Application of coaching in games",
        "Behavior during halftime team talks",
        "Recovery from mistakes",
      ],
      assessmentFrequency: "Ongoing observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple interactions over time",
    },
  },
  {
    slug: "1v1-dribbling-moves",
    name: "1v1 Dribbling Moves",
    sport: "soccer",
    domain: "technical",
    stage: "skill-building",
    description:
      "Performing dribbling moves to beat a defender (step-over, scissors, feints)",
    introductionAge: 9,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Cannot execute any moves",
      2: "Knows 1-2 moves but can't apply in games",
      3: "Can execute 2-3 moves in game situations",
      4: "Multiple moves, good timing",
      5: "Creative, unpredictable, beats defenders consistently",
    },
    observableBehaviors: [
      "Change of pace",
      "Body feint",
      "Acceleration after move",
      "Watches the defender's feet and weight, not just the ball",
      "Uses more than one type of move rather than relying on a single trick",
    ],
    commonMistakes: [
      "Performing move too far from defender",
      "No change of speed",
      "Telegraphing the move",
      "Repeating the same move so often that defenders anticipate it",
      "Slowing down after beating the defender instead of accelerating away",
    ],
    coachingTips: [
      "Get close to the defender first",
      "Sell the fake with your body",
      "Explode into the space",
      "Watch the defender's feet - which way are they leaning?",
      "Practice more than one move so you're not predictable",
    ],
    tags: ["dribbling", "1v1", "moves", "technique"],
    isCore: true,
    sortOrder: 6,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player has no effective moves to beat a defender. Dribbles directly into defenders or kicks ball past and chases. No deceptive body movements.",
          observableBehaviors: [
            "Dribbles straight at defender with no change",
            "Loses ball immediately when defender engages",
            "No attempt at feints or body movements",
            "Kicks ball past defender and chases",
            "Stops with ball when defender approaches",
          ],
          commonMistakes: [
            "No change of pace before or after move",
            "Eyes only on ball, not defender",
            "Body weight prevents quick direction change",
            "Telegraphing intentions to defender",
            "Attempting moves from too far away",
          ],
          coachingTips: [
            "Can you pretend to go one way and then go the other?",
            "What happens if you slow down before speeding up?",
            "Watch the defender - where are they moving?",
            "Every attempt teaches you something - keep trying!",
            "Let's start with one simple move and practice it lots!",
          ],
          assessmentActivities: [
            "1v1 in tight space with passive defender",
            "Cone dribbling with direction changes",
            "Move execution without defender",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to attempt moves but execution is slow or predictable. Can occasionally beat passive defenders but struggles against active pressure.",
          observableBehaviors: [
            "Attempts one or two basic moves",
            "Sometimes successful against passive defenders",
            "Move execution is slow",
            "Beginning to use change of pace",
            "Starting to watch defender's movements",
          ],
          commonMistakes: [
            "Move is telegraphed or slow to execute",
            "Only one move attempted regardless of situation",
            "Loses balance during move execution",
            "No acceleration after successful move",
            "Attempting moves in wrong situations",
          ],
          coachingTips: [
            "How can you make that move quicker?",
            "What does the defender's body tell you?",
            "After your move, where do you explode?",
            "You're getting it! What felt good about that attempt?",
            "Can you try the move to your other side?",
          ],
          assessmentActivities: [
            "1v1 with semi-active defenders",
            "Timed move execution drills",
            "Success rate tracking against defenders",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Has 2-3 reliable moves that can beat defenders in game situations. Uses change of pace and body feints. Can select appropriate move for the situation.",
          observableBehaviors: [
            "Executes 2-3 moves effectively",
            "Uses change of pace to unbalance defenders",
            "Reads defender position before selecting move",
            "Accelerates effectively after successful move",
            "Can perform moves at game speed",
          ],
          commonMistakes: [
            "Relies too heavily on favorite move",
            "May force 1v1 when pass is better option",
            "Inconsistent success against physical defenders",
            "Move selection sometimes inappropriate",
            "Struggling to chain moves together",
          ],
          coachingTips: [
            "What's your go-to move? What's your backup?",
            "What does the defender's weight distribution tell you?",
            "When does 1v1 dribbling help the team most?",
            "Can you combine two moves together?",
            "You're becoming dangerous - what's next to learn?",
          ],
          assessmentActivities: [
            "1v1 competitions with scoring",
            "Game observation for moves attempted/successful",
            "Move variety assessment",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent repertoire of moves executed at speed. Can chain moves together. Creates chances regularly through 1v1 ability. Reads defenders instinctively.",
          observableBehaviors: [
            "Multiple moves executed at high speed",
            "Chains moves together fluidly",
            "Reads and exploits defender weaknesses",
            "Uses moves to create team opportunities",
            "Consistent success rate against good defenders",
          ],
          commonMistakes: [
            "May over-dribble in team contexts",
            "Could be more direct when appropriate",
          ],
          coachingTips: [
            "How can your 1v1 ability help teammates?",
            "When is the simple option better than the move?",
            "Can you help others develop their moves?",
            "What makes elite dribblers different?",
            "Balance creativity with team responsibility!",
          ],
          assessmentActivities: [
            "Elite 1v1 competitions",
            "Game impact statistics",
            "Teaching ability assessment",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite dribbler who can beat defenders consistently in any situation. Moves are explosive and deceptive. 1v1 ability is a significant team weapon.",
          observableBehaviors: [
            "Beats defenders at will",
            "Creates chances from nothing",
            "Moves executed instinctively",
            "Draws multiple defenders to create space",
            "Performs under highest pressure moments",
          ],
          commonMistakes: [
            "Teammates may become too reliant on individual skill",
          ],
          coachingTips: [
            "How can you use your ability to make others better?",
            "What do you see that others don't?",
            "Continue innovating - what's the next move to master?",
            "Model the practice habits that built this skill!",
            "Your skill inspires others - keep working!",
          ],
          assessmentActivities: [
            "Performance in high-stakes matches",
            "Statistical impact analysis",
            "Comparison to elite standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "At this age, let players experiment freely with the ball. Don't worry about specific moves - encourage creativity and trying different things. Ball familiarity is the foundation. Make it fun and celebrate attempts!",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin introducing basic moves (scissors, step-over, cut). Focus on one move at a time until comfortable. This is a great age for technical development. Lots of repetition in fun contexts builds the foundation.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players can develop a repertoire of moves. Work on selecting the right move for the situation. Introduce chaining moves together. Challenge them to beat defenders consistently in practice.",
        },
      },
      redFlags: [
        "Complete avoidance of 1v1 situations",
        "No improvement in any move after extended practice",
        "Fear of attempting moves in games",
        "Physical limitations preventing move execution",
        "Severe frustration blocking learning",
      ],
      parentExplanation:
        "1v1 dribbling moves are the tricks and fakes players use to get past defenders. We teach basic moves like scissors, step-overs, and cuts, but the real skill is in the timing, body movement, and change of pace. Players need lots of practice to make moves instinctive. At home, any time with the ball helps! Encourage creative dribbling in the backyard - the more comfortable they are with the ball, the better their moves will become.",
      homeActivities: [
        "Free dribbling in the yard - just play with the ball!",
        "Watch skill videos together and try to copy moves",
        "Set up cones to dribble around",
        "Practice moves in slow motion then speed up",
        "Play 1v1 with family members",
        "Challenge: how many moves can you learn?",
      ],
      bestAssessedIn: [
        "1v1 training activities",
        "Small-sided games",
        "Match situations with space to dribble",
        "Individual skill sessions",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple 1v1 opportunities",
    },
  },
  {
    slug: "turning-with-ball",
    name: "Turning with Ball",
    sport: "soccer",
    domain: "technical",
    stage: "skill-building",
    description:
      "Changing direction with the ball under control (inside hook, outside hook, Cruyff turn)",
    introductionAge: 9,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Loses ball when trying to turn",
      2: "Can execute one type of turn slowly",
      3: "Multiple turns, can select appropriate one",
      4: "Quick, deceptive turns under pressure",
      5: "Creates space with turns, sets up next action",
    },
    observableBehaviors: [
      "Shielding ball during turn",
      "Head up after turn",
      "Good first touch",
      "Can execute more than one type of turn (e.g., Cruyff, drag-back, outside hook)",
      "Lowers center of gravity and stays balanced through the turn",
    ],
    commonMistakes: [
      "Turning into pressure",
      "Losing sight of surroundings",
      "Ball getting stuck under feet",
      "Only turning in one direction rather than reading which way is open",
      "Standing upright during the turn instead of lowering the body",
    ],
    coachingTips: [
      "Check shoulder before receiving",
      "Turn into space, not pressure",
      "Which way is the defender going?",
      "Can you turn away from the defender, not into them?",
      "Try a different turn than usual - which one keeps the ball closest?",
    ],
    tags: ["turning", "ball control", "technique"],
    isCore: true,
    sortOrder: 7,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot turn effectively with the ball. Multiple touches required, ball often escapes during turn attempts. No variety in turning technique and cannot turn under any pressure.",
          observableBehaviors: [
            "Takes 4+ touches to complete a turn",
            "Ball rolls away during turn attempts",
            "Stops completely before changing direction",
            "Only attempts to turn one direction",
            "Cannot execute any named turn (Cruyff, drag-back, etc.)",
            "Never checks shoulder before receiving",
          ],
          commonMistakes: [
            "Not checking shoulder before receiving - turns into pressure",
            "Ball gets away from body during turn",
            "Standing upright during turn instead of lowering center of gravity",
            "No use of body to shield ball",
          ],
          coachingTips: [
            "Can you keep the ball close as you spin around?",
            "What happens if you use the inside of your foot?",
            "Try to make your body a shield between ball and defender!",
            "Every turn attempt helps you learn - keep trying!",
          ],
          assessmentActivities: [
            "Turn and dribble to cone (no pressure)",
            "Receive ball and turn drill with targets",
            "Counting touches needed to complete turn",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can complete basic turns in unpressured situations. Beginning to learn specific turn techniques but execution is slow and sometimes unsuccessful. Shows understanding of need to check shoulder.",
          observableBehaviors: [
            "Completes inside cut turns with 2-3 touches",
            "Attempts drag-back turns with mixed success",
            "Beginning to shield ball during turns",
            "Sometimes checks shoulder before receiving",
            "Can turn both directions but one is clearly weaker",
            "Loses ball when any pressure is applied during turn",
          ],
          commonMistakes: [
            "Turn is slow and predictable",
            "Telegraphing turn direction with body shape",
            "No acceleration after completing turn",
            "Limited turn variety - same turn every time",
          ],
          coachingTips: [
            "What can you see before you receive to know where to turn?",
            "How can you make your turn quicker?",
            "Can you try using the outside of your foot too?",
            "What happens if you lean your body during the turn?",
          ],
          assessmentActivities: [
            "Turn under light pressure from walking defender",
            "Practice different turn types in sequence",
            "Turn and accelerate into space exercise",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Executes multiple turn types with reliability. Can turn away from light pressure. Checks shoulder regularly and makes appropriate turn selection based on defender position.",
          observableBehaviors: [
            "Executes 3-4 different turn types effectively",
            "Single touch turns becoming consistent",
            "Shields ball effectively during turns",
            "Regularly checks shoulder before receiving",
            "Can turn both directions with competence",
            "Accelerates out of turns into space",
          ],
          commonMistakes: [
            "May default to favorite turn type",
            "Occasionally caught by quick pressure",
            "Could be sharper in execution",
            "Sometimes turns into pressure unnecessarily",
          ],
          coachingTips: [
            "What tells you which type of turn to use?",
            "How can you turn even sharper and quicker?",
            "When would a Cruyff turn work better than a drag-back?",
            "Can you help a teammate improve their turns?",
          ],
          assessmentActivities: [
            "Turn against semi-active defender",
            "Turn variety in rondo situations",
            "Game observation for turn success rate",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent turning ability with variety and deception. Can turn under pressure and in tight spaces. Turn selection is instinctive and appropriate to situation.",
          observableBehaviors: [
            "Full repertoire of turns executed at speed",
            "Uses body feints to disguise turn direction",
            "Turns create space and attacking opportunities",
            "Can turn in tight spaces under pressure",
            "First touch often sets up the turn",
            "Reads defender position to select optimal turn",
          ],
          commonMistakes: [
            "May attempt ambitious turns when simple is better",
            "Could distribute quicker after turns sometimes",
          ],
          coachingTips: [
            "How do your turns help the team build attacks?",
            "When is turning necessary vs. playing direct?",
            "What do you look for when choosing your turn?",
            "Elite turning comes from preparation - keep scanning!",
          ],
          assessmentActivities: [
            "High-pressure rondo with focus on turns",
            "Game impact analysis - turns leading to chances",
            "Turn success rate statistics",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite turning ability that creates consistent advantages. Can escape any pressure through turning. Turns are deceptive, quick, and lead to dangerous attacking positions.",
          observableBehaviors: [
            "Turns out of pressure from any position",
            "Creates chances through turning ability",
            "Combines turns with other skills seamlessly",
            "Performs elite turns (Zidane turn, etc.) effectively",
            "Turning is unpredictable - defenders cannot read",
            "Turns at maximum speed without losing control",
          ],
          commonMistakes: [
            "Teammates may not expect quick turn and play forward",
          ],
          coachingTips: [
            "Your turning ability changes games - how do you create that?",
            "What can you teach others about preparing to receive?",
            "Continue challenging yourself in tighter spaces!",
            "Model the scanning habits that make this possible!",
          ],
          assessmentActivities: [
            "Performance in elite competition",
            "Statistical impact of turning on team attack",
            "Comparison to professional standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Turning with the ball is challenging at this age. Focus on comfort with the ball first. Simple turns without pressure are appropriate. Make it playful - 'spin like a top!' Don't expect smooth execution yet.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin teaching specific turn types (inside cut, outside cut, drag-back). Focus on one turn at a time. Add light pressure gradually. This is a great age for technical development through repetition.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players should have multiple turns in their toolkit. Work on turn selection and execution under pressure. Emphasize checking shoulder before receiving. Can introduce more advanced turns like Cruyff and spin turns.",
        },
      },
      redFlags: [
        "Cannot turn at all after extended practice",
        "Always loses ball when attempting any turn",
        "Fear of receiving ball with back to goal",
        "Physical limitations preventing turning motion",
        "No improvement in any turn type over extended time",
      ],
      parentExplanation:
        "Turning with the ball is how players change direction while keeping possession. It's crucial for playing out of pressure and creating attacking opportunities. We teach different turn types: inside cut, outside cut, drag-back, and more advanced turns. The key is checking over the shoulder BEFORE receiving to know where pressure is coming from. At home, practicing individual turns against a wall or with a parent playing passive defender helps build this skill.",
      homeActivities: [
        "Wall turn practice: pass against wall, receive and execute turn, repeat",
        "Shoulder check game: before every touch, look over shoulder - parent holds up fingers to call",
        "Defender shadow turns: parent acts as slow-motion defender, player turns away",
        "Turn competition: time how quickly you can receive, turn, and dribble 5 yards",
        "Practice specific turns in slow motion, then speed up",
        "Watch professionals turn on video and try to copy their technique",
      ],
      bestAssessedIn: [
        "Rondo and possession activities",
        "Receiving exercises with back to goal",
        "Game situations receiving under pressure",
        "Technical training circuits",
      ],
      assessmentFrequency:
        "Weekly observation during training, formal assessment monthly",
      assessmentDuration:
        "Observe across multiple receiving and turning situations (5-10 minutes)",
    },
  },
  {
    slug: "when-to-dribble-vs-pass",
    name: "When to Dribble vs Pass",
    sport: "soccer",
    domain: "tactical",
    stage: "skill-building",
    description:
      "Recognizing whether to dribble or pass based on game situation",
    introductionAge: 9,
    assessmentMethod: "game",
    progressionLevels: {
      1: "Always dribbles or always passes regardless of situation",
      2: "Sometimes makes good decisions",
      3: "Usually chooses correctly in clear situations",
      4: "Good decisions quickly, recognizes when to switch",
      5: "Excellent game reading, plays one touch when needed",
    },
    observableBehaviors: [
      "Scans before receiving",
      "Dribbles when space available",
      "Passes when teammate is better positioned",
      "Makes the decision before the ball arrives, not after receiving it",
      "Recognizes when a defender is close enough to force a quick decision",
    ],
    commonMistakes: [
      "Head down, not seeing options",
      "Dribbling into crowds",
      "Passing when dribble would be better",
      "Deciding what to do only after the ball has already arrived",
      "Passing backward when a forward dribbling lane is open",
    ],
    coachingTips: [
      "What do you see?",
      "Is there a teammate in a better position?",
      "Is there space ahead of you?",
      "Decide what you'll do before the ball gets to you - what did you see?",
      "When you lost the ball there, what other choice did you have?",
    ],
    tags: ["decision making", "tactical", "game intelligence"],
    isCore: true,
    sortOrder: 21,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player defaults to one option regardless of situation - either always dribbles or always passes. No recognition of cues that should influence the decision.",
          observableBehaviors: [
            "Dribbles into pressure when pass is open",
            "Passes immediately when dribbling space exists",
            "Head down, not scanning for options",
            "Panics when pressed - rushes decision",
            "No recognition of defensive positioning",
          ],
          commonMistakes: [
            "Not looking before receiving to assess options",
            "Making decision before receiving ball",
            "Ignoring open teammates to dribble",
            "Passing backward when forward dribble is available",
            "Taking too many touches before deciding",
          ],
          coachingTips: [
            "Before the ball comes, what can you look at?",
            "If a defender is far away, what option do you have?",
            "When you lost the ball there, what might have worked better?",
            "Great effort! Learning when to dribble takes lots of tries!",
            "Can you show me what you saw when you made that choice?",
          ],
          assessmentActivities: [
            "2v1 decisions with guided questions",
            "Freeze and discuss during small-sided games",
            "Shadow play to practice scanning",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to recognize some cues but execution is inconsistent. Can make correct decision in simple situations but struggles with speed of play or multiple options.",
          observableBehaviors: [
            "Sometimes looks up before receiving",
            "Can identify open pass in simple situations",
            "Recognizes when pressed and when free",
            "Occasionally chooses appropriate action",
            "Starting to understand risk vs. safety",
          ],
          commonMistakes: [
            "Correct read but slow execution",
            "Good decision on easy situations, poor on complex",
            "Reverting to habits under pressure",
            "Seeing options too late to use them",
            "Choosing appropriate action but poor technique",
          ],
          coachingTips: [
            "You saw that space perfectly - how can you act on it quicker?",
            "What told you that was the right moment to dribble?",
            "When you're feeling rushed, what can help you slow down mentally?",
            "That's a tough situation - what are your options?",
            "You're learning to read the game - mistakes are part of that!",
          ],
          assessmentActivities: [
            "Directional possession games",
            "3v2 attacking scenarios",
            "Decision-making exercises with visual cues",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Makes appropriate decisions in most game situations. Understands basic principles but may struggle in complex or rapid situations. Good judgment in moderate tempo.",
          observableBehaviors: [
            "Scans before receiving consistently",
            "Chooses appropriate action most of the time",
            "Recognizes when to take on vs. when to combine",
            "Understands risk based on field position",
            "Can verbalize why a choice was made",
          ],
          commonMistakes: [
            "Struggles with quick decision sequences",
            "May overthink in critical moments",
            "Inconsistent decision-making when fatigued",
            "Sometimes too safe when risk is appropriate",
            "Occasionally too risky in dangerous areas",
          ],
          coachingTips: [
            "What information helped you make that decision so quickly?",
            "In that situation, what made you choose to pass instead of dribble?",
            "When the game speeds up, how can you keep making good choices?",
            "Can you recognize the moment of decision earlier?",
            "You're developing great game sense - trust your instincts!",
          ],
          assessmentActivities: [
            "Full-pressure scrimmages with decision focus",
            "Video review of decision moments",
            "Phase of play with positional rules",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent decision-making at game speed. Chooses optimal action in most situations. Can make decisions under pressure and adjust based on game state.",
          observableBehaviors: [
            "Quick, appropriate decisions consistently",
            "Reads defensive body language to choose action",
            "Adjusts decision based on game context",
            "Takes calculated risks in appropriate moments",
            "Creates advantages through smart decisions",
          ],
          commonMistakes: [
            "May occasionally misread complex defensive schemes",
            "Could communicate decisions better to teammates",
          ],
          coachingTips: [
            "How can you help teammates understand your decision-making?",
            "What do you see that tells you to take that risk?",
            "In tight games, how do you balance risk and safety?",
            "You have great instincts - how did you develop them?",
            "Leadership: can you help others see the cues you see?",
          ],
          assessmentActivities: [
            "High-pressure game scenarios",
            "Competitive match analysis",
            "Leadership in tactical discussions",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite decision-maker who consistently makes optimal choices at speed. Anticipates situations before they develop. Decision-making is a competitive advantage.",
          observableBehaviors: [
            "Sees passes and dribbles before they're obvious",
            "Manipulates defenders through decision variety",
            "Makes difficult decisions look easy",
            "Teammates trust and follow their decisions",
            "Adjusts game plan based on opponent weaknesses",
          ],
          commonMistakes: ["Teammates may not execute at the same level"],
          coachingTips: [
            "How do you process so much information so quickly?",
            "What can you teach others about reading the game?",
            "Continue studying the game at the highest levels",
            "Your decision-making elevates everyone - keep modeling it!",
            "What's the next frontier in your tactical development?",
          ],
          assessmentActivities: [
            "Elite competition performance",
            "Tactical leadership assessment",
            "Video comparison to professional standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "At this age, focus on having fun with the ball. Don't worry about perfect decisions - let them explore dribbling and passing. Simple 2v1 situations introduce the concept gently. Avoid over-coaching decisions; let them play and learn!",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Players can start understanding basic principles: dribble when free, pass when pressed. Use freeze games to discuss options. Keep explanations simple and visual. This is the beginning of tactical awareness.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Tactical understanding accelerates significantly. Can work on reading defensive cues and making quicker decisions. Video analysis becomes useful. Players should be able to explain their choices.",
        },
      },
      redFlags: [
        "Unable to identify any passing options after extended coaching",
        "Persistent panic when receiving the ball",
        "No improvement in decision-making over a full season",
        "Completely ignoring coaching cues about options",
        "Severe anxiety affecting ability to process information",
      ],
      parentExplanation:
        "Learning when to dribble and when to pass is like learning when to share - it takes time and lots of practice! Young players often default to one or the other. We teach them to look up, see their options, and choose based on the situation. A good rule: dribble when you have space, pass when you're under pressure. But really, this skill develops through playing lots of soccer and making lots of decisions - both good ones and mistakes. Both teach valuable lessons!",
      homeActivities: [
        "Watch games together and discuss player decisions",
        "Play 2v1 in the yard with decision discussions",
        "Ask 'what would you do?' during soccer on TV",
        "Video games that require tactical decisions",
        "Backyard soccer with 'freeze and discuss' moments",
        "Encourage multiple solutions to game scenarios",
      ],
      bestAssessedIn: [
        "Small-sided games with realistic pressure",
        "Phase of play exercises",
        "Full-sided competitive matches",
        "2v1 and 3v2 attacking scenarios",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration:
        "Observe across multiple game situations with varied pressure",
    },
  },
  {
    slug: "long-passing",
    name: "Long Passing",
    sport: "soccer",
    domain: "technical",
    stage: "development",
    description: "Accurate long-range passes using laces or inside of foot",
    introductionAge: 11,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Cannot generate enough power or accuracy",
      2: "Can strike long but inconsistent accuracy",
      3: "Consistent long passes to stationary targets",
      4: "Can switch play accurately, varied trajectory",
      5: "Accurate under pressure, can weight for teammate's run",
    },
    observableBehaviors: [
      "Proper body position over ball",
      "Good follow through",
      "Strikes through center",
      "Non-kicking foot planted alongside the ball, pointing toward the target",
      "Eyes stay on the ball through the moment of contact",
    ],
    commonMistakes: [
      "Leaning back",
      "No follow through",
      "Striking too low (ball pops up)",
      "Striking with the toe instead of the instep or laces",
      "Non-kicking foot planted too far from the ball, throwing off balance",
    ],
    coachingTips: [
      "Approach at angle",
      "Lock ankle, toe down",
      "Keep head over ball for driven pass",
      "Plant your non-kicking foot right next to the ball, pointing at your target",
      "Watch the ball all the way onto your foot before looking up",
    ],
    tags: ["passing", "technique", "long range"],
    isCore: true,
    sortOrder: 8,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot execute long passes effectively. Ball stays on ground, goes wrong direction, or has no power. Technique is incorrect.",
          observableBehaviors: [
            "Ball does not get airborne",
            "Passes lack distance (under 15 yards)",
            "No accuracy - ball goes anywhere",
            "Incorrect body position and contact",
            "Often whiffs or mis-hits the ball",
          ],
          commonMistakes: [
            "Striking with toe instead of instep/laces",
            "Standing too upright at contact",
            "Non-kicking foot placement incorrect",
            "No follow-through on strike",
            "Eyes not on ball at contact",
          ],
          coachingTips: [
            "Can you point your toe down when you kick?",
            "Where should your non-kicking foot be?",
            "Watch the ball all the way onto your foot!",
            "Every attempt helps you learn - that was brave to try!",
            "Let's work on just getting it in the air first!",
          ],
          assessmentActivities: [
            "Stationary long pass attempts",
            "Distance measurement exercises",
            "Technique breakdown practice",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can get ball airborne but with limited accuracy and distance. Technique improving but inconsistent. Struggles with weight of pass.",
          observableBehaviors: [
            "Gets ball airborne occasionally",
            "Passes reach 15-25 yards sometimes",
            "Direction generally correct",
            "Technique inconsistent",
            "Some proper body mechanics showing",
          ],
          commonMistakes: [
            "Inconsistent contact point on ball",
            "Leaning back too much (ball goes too high)",
            "Or leaning forward (ball stays low)",
            "Run-up inconsistent",
            "Weight of pass varies widely",
          ],
          coachingTips: [
            "What happens when you lean back vs. stay over the ball?",
            "Can you feel the difference when you strike it cleanly?",
            "How's your approach - is it the same each time?",
            "You're getting height! Now how about accuracy?",
            "What part of your foot makes the best contact?",
          ],
          assessmentActivities: [
            "Target practice at various distances",
            "Switching play exercises",
            "Technique video analysis",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Executes long passes with reasonable accuracy and distance in training. Can switch play and hit longer passes in games with moderate success.",
          observableBehaviors: [
            "Consistent technique and contact",
            "Passes reach 25-40 yards accurately",
            "Can switch play effectively",
            "Appropriate weight on most passes",
            "Uses both instep and driven techniques",
          ],
          commonMistakes: [
            "Accuracy decreases under pressure",
            "May struggle with moving ball long passes",
            "Inconsistent in windy conditions",
            "Could improve weak foot long passing",
            "Timing of release sometimes off",
          ],
          coachingTips: [
            "How does your long passing help the team tactically?",
            "What adjustments help in different conditions?",
            "Can you hit that pass first time off a moving ball?",
            "When is a long pass the right choice?",
            "You're developing a weapon - how else can you use it?",
          ],
          assessmentActivities: [
            "Long pass accuracy tests",
            "Switching play under pressure",
            "Game observation for long pass success",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent long passing ability with accuracy and variety. Can execute diagonal balls, switches, and long balls into space. Creates chances through distribution.",
          observableBehaviors: [
            "Accurate long passes consistently",
            "Creates chances through distribution",
            "Can hit different types of long balls",
            "Comfortable in game pressure",
            "Uses weak foot for long passes",
          ],
          commonMistakes: [
            "May over-rely on long passing when short is better",
            "Could time passes more precisely",
          ],
          coachingTips: [
            "How do you read when a long pass will break the defense?",
            "What long passing patterns most help the team?",
            "Can you help teammates improve their technique?",
            "When does the simple ball work better?",
            "Your range changes the game - when do you use it?",
          ],
          assessmentActivities: [
            "Distribution impact in games",
            "Long pass assist statistics",
            "Accuracy under pressure testing",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite long passing ability that creates consistent advantages. Can hit any type of long ball with precision. Distribution is a key weapon for the team.",
          observableBehaviors: [
            "Creates chances from deep through passing",
            "Hits targets at any distance",
            "Switches play instantly",
            "Passes perfectly weighted for runners",
            "Long passing opens up games",
          ],
          commonMistakes: [
            "Teammates may not make runs for exceptional passes",
          ],
          coachingTips: [
            "Your passing range is elite - how did you develop it?",
            "What can you teach others about technique?",
            "Continue perfecting variety and disguise!",
            "How do you communicate your vision to runners?",
            "Model the practice habits that built this skill!",
          ],
          assessmentActivities: [
            "Distribution statistics analysis",
            "Impact on team attacking patterns",
            "Comparison to professional standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Long passing is not developmentally appropriate at this age due to strength limitations. Focus on short passing technique. Any long kicking is just for fun, not for assessment. Let them explore without pressure.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin introducing long passing technique as strength develops. Focus on proper mechanics over distance. Don't expect game-ready long passes yet. Make it playful - 'how far can you kick?'",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players have more strength for long passing. Focus on accuracy and weight. Can begin using long passes tactically. Weak foot development becomes important. Video analysis can help with technique.",
        },
      },
      redFlags: [
        "Cannot get ball airborne after extended technique work",
        "Pain or discomfort when striking",
        "Dramatic difference between feet not improving",
        "Fear of attempting long passes in games",
        "No improvement in distance over extended period",
      ],
      parentExplanation:
        "Long passing is the ability to accurately send the ball over longer distances (25+ yards). It's a crucial skill for switching play, hitting forwards with through balls, and goal kicks. The technique involves striking through the bottom half of the ball with a locked ankle, proper body position, and follow-through. It takes strength that develops over time, so younger players shouldn't be expected to hit long passes yet. Practice kicking at targets helps develop the technique!",
      homeActivities: [
        "Practice kicking at targets in open spaces",
        "Work on technique with standing ball first",
        "Watch professional long passes and discuss technique",
        "Kick toward targets at increasing distances",
        "Practice with both feet",
        "Video your technique to review",
      ],
      bestAssessedIn: [
        "Switching play exercises",
        "Target practice activities",
        "Game situations requiring distribution",
        "Set piece delivery",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple long passing opportunities",
    },
  },
  {
    slug: "heading-defensive",
    name: "Heading - Defensive",
    sport: "soccer",
    domain: "technical",
    stage: "development",
    description: "Clearing the ball with the forehead away from danger",
    introductionAge: 11,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Afraid of ball, closes eyes",
      2: "Makes contact but poor direction/power",
      3: "Consistent contact, can direct header",
      4: "Good power and direction, wins aerial duels",
      5: "Dominant in the air, heads to teammates",
    },
    observableBehaviors: [
      "Eyes open",
      "Forehead contact",
      "Attack the ball",
      "Times the jump to meet the ball at its highest point",
      "Uses neck and upper body to drive through the ball, not just the head",
    ],
    commonMistakes: [
      "Heading with top of head",
      "Waiting for ball to hit you",
      "Eyes closed before contact",
      "Mistiming or skipping the jump for balls in the air",
      "Showing visible hesitation or flinching before contact",
    ],
    coachingTips: [
      "Watch the ball onto your forehead",
      "Go get it, don't let it hit you",
      "Head through the ball",
      "Time your jump to meet the ball at the top, not after it drops",
      "Use your whole body, not just your neck, to power through the header",
    ],
    tags: ["heading", "technique", "defending"],
    isCore: false,
    sortOrder: 9,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player avoids heading or closes eyes before contact. Cannot direct the ball with their head. Fear or discomfort with heading.",
          observableBehaviors: [
            "Avoids heading attempts",
            "Closes eyes before ball arrives",
            "Lets ball hit top of head passively",
            "Cannot time jump for aerial balls",
            "Shows visible fear or reluctance",
          ],
          commonMistakes: [
            "Closing eyes before contact",
            "Letting ball hit instead of attacking ball",
            "Using top of head instead of forehead",
            "No jump or mistimed jump",
            "Not watching ball all the way",
          ],
          coachingTips: [
            "Can you keep your eyes open and watch the ball?",
            "Let's start with very soft serves - no pressure!",
            "You control the ball, not the other way around!",
            "Every attempt builds bravery - great effort!",
            "What does it feel like on your forehead vs. top of head?",
          ],
          assessmentActivities: [
            "Self-serve and head drill",
            "Partner soft toss heading",
            "Comfort level observation",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can head the ball when served but with limited power and accuracy. Beginning to time jumps. Still uncomfortable but willing to attempt.",
          observableBehaviors: [
            "Attempts headers when required",
            "Makes contact with forehead sometimes",
            "Basic timing developing",
            "Can head stationary serves",
            "Power is limited",
          ],
          commonMistakes: [
            "Waiting for ball instead of attacking it",
            "Neck stiff instead of generating power",
            "Poor timing on aerial challenges",
            "Direction of header unpredictable",
            "Losing aerial duels to more aggressive players",
          ],
          coachingTips: [
            "Can you go TO the ball instead of waiting for it?",
            "What part of your forehead should hit the ball?",
            "How does your neck movement affect power?",
            "You're getting braver! What's helping your confidence?",
            "Can you direct it toward a target?",
          ],
          assessmentActivities: [
            "Heading accuracy to target",
            "Timing and jump drills",
            "Heading for distance",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Heads the ball with decent power and direction in game situations. Can win some aerial duels. Comfortable with heading technique.",
          observableBehaviors: [
            "Attacks the ball with forehead",
            "Generates power through neck snap",
            "Times jumps reasonably well",
            "Clears ball with distance",
            "Wins some aerial duels",
          ],
          commonMistakes: [
            "May lose duels against stronger opponents",
            "Direction could be more precise",
            "Heading under pressure less effective",
            "Could be more commanding in the air",
            "Positioning for aerial duels needs work",
          ],
          coachingTips: [
            "What helps you win aerial duels against bigger players?",
            "How can you attack the ball at its highest point?",
            "Where should your header go to help the team?",
            "You're comfortable heading - now how about commanding?",
            "Can you read where the ball will be served?",
          ],
          assessmentActivities: [
            "Aerial duel competitions",
            "Defensive heading clearances",
            "Heading under game pressure",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong defensive heading with power, timing, and direction. Commands aerial duels. Can head away from danger in all situations.",
          observableBehaviors: [
            "Dominates aerial situations",
            "Clears with distance and direction",
            "Excellent timing on all deliveries",
            "Commands box on defensive set pieces",
            "Heads under maximum pressure",
          ],
          commonMistakes: [
            "May go for every ball even when not needed",
            "Could communicate aerial intentions better",
          ],
          coachingTips: [
            "How do you organize others in aerial situations?",
            "When should you leave it vs. attack it?",
            "Your heading gives confidence to teammates - keep it up!",
            "Can you help others develop heading comfort?",
            "What positioning helps you dominate aerially?",
          ],
          assessmentActivities: [
            "Set piece defensive organization",
            "Aerial duel statistics",
            "Leadership in aerial situations",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite defensive heading ability. Dominates aerially in all situations. Heading is a major defensive weapon. Organizes team defensive heading.",
          observableBehaviors: [
            "Wins vast majority of aerial duels",
            "Clears danger consistently",
            "Heads from difficult positions effectively",
            "Commands entire defensive aerial game",
            "Creates confidence through dominance",
          ],
          commonMistakes: ["Teammates may over-rely on heading ability"],
          coachingTips: [
            "Your aerial dominance changes games - how?",
            "What can you teach about heading bravery?",
            "Continue challenging yourself against elite opponents!",
            "How do you prepare to win aerial duels?",
            "Model the preparation habits that make this possible!",
          ],
          assessmentActivities: [
            "Performance against elite attackers",
            "Statistical aerial duel analysis",
            "Defensive impact assessment",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "SAFETY FIRST: No heading for players under age 10 in most organizations due to brain development concerns. If heading is part of your program, use only soft, light balls and very gentle serves. Focus on tracking the ball and proper contact point. Never force reluctant players to head.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Follow your organization's heading guidelines carefully. If introducing heading, use appropriate balls and limited practice. Focus on technique with soft serves. Build confidence gradually. Never shame reluctance to head.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players can begin more regular heading practice with proper technique emphasis. Focus on attacking the ball and proper contact point. Build confidence through progressive challenges. Defensive heading becomes more relevant at this age.",
        },
      },
      redFlags: [
        "Severe anxiety or fear around heading not improving",
        "Pain or headaches after heading practice",
        "Complete avoidance despite supportive environment",
        "Dizziness or disorientation after heading",
        "Any signs of concussion - seek medical attention immediately",
      ],
      parentExplanation:
        "Defensive heading is the ability to clear the ball from danger using your head. SAFETY is paramount - we follow all organizational guidelines about heading for different age groups. When teaching heading, we emphasize proper technique (forehead contact, eyes open, attacking the ball) and build confidence gradually. We never force players to head if they're uncomfortable. If your child has any headaches or discomfort after heading, please let us know immediately.",
      homeActivities: [
        "Practice heading with very soft balls (beach balls, balloons)",
        "Work on tracking ball flight without heading",
        "Watch professional heading technique",
        "Strengthen neck muscles with appropriate exercises",
        "Build comfort with ball coming toward head gradually",
        "Never practice heading alone without proper balls",
      ],
      bestAssessedIn: [
        "Controlled heading drills",
        "Aerial duel exercises",
        "Set piece defending",
        "Game situations (crosses, long balls)",
      ],
      assessmentFrequency: "Monthly observation when age-appropriate",
      assessmentDuration: "Observe across multiple aerial situations",
    },
  },
  {
    slug: "positional-awareness",
    name: "Positional Awareness",
    sport: "soccer",
    domain: "tactical",
    stage: "development",
    description:
      "Understanding and maintaining proper position relative to teammates and ball",
    introductionAge: 11,
    assessmentMethod: "game",
    progressionLevels: {
      1: "No understanding of position, chases ball",
      2: "Knows position but frequently out of it",
      3: "Maintains position in most situations",
      4: "Adjusts position based on ball movement",
      5: "Excellent spacing, helps organize teammates",
    },
    observableBehaviors: [
      "Maintains shape with team",
      "Adjusts when ball moves",
      "Provides passing angles",
      "Returns to their position after attacking or defensive transitions",
      "Recognizes their own area of responsibility on the field",
    ],
    commonMistakes: [
      "Ball watching while out of position",
      "Too close to teammates (bunching)",
      "Too far from play",
      "Following the ball like a magnet instead of holding position",
      "Not returning to position after an attacking run forward",
    ],
    coachingTips: [
      "Where should you be if the ball is here?",
      "Can you see the ball and your player?",
      "Check your shape",
      "After you attack, how quickly can you get back to your spot?",
      "What's your job in this position - what area do you protect?",
    ],
    tags: ["tactical", "positioning", "shape"],
    isCore: true,
    sortOrder: 22,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Limited understanding of positional structure. Wanders away from assigned area. No awareness of how position relates to teammates or team shape.",
          observableBehaviors: [
            "Consistently found out of position",
            "Chases ball regardless of role",
            "Leaves large gaps in team shape",
            "Cannot identify own position's area",
            "No adjustment when teammates move",
          ],
          commonMistakes: [
            "Following the ball like a magnet",
            "Standing still in wrong area",
            "Leaving defensive responsibilities",
            "Bunching with other positions",
            "Not returning to position after attacking",
          ],
          coachingTips: [
            "Can you find your home area on the field?",
            "If you go there, who protects your space?",
            "Where would you stand to help your teammate?",
            "Every position is important - what's your job?",
            "Let's explore your area together - where are the boundaries?",
          ],
          assessmentActivities: [
            "Cone-marked position zones",
            "Freeze game to check positions",
            "Walking through team shape",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand positional area. Can maintain position in static situations but loses it during dynamic play. Needs frequent reminders.",
          observableBehaviors: [
            "Knows general area for their position",
            "Can return to position when reminded",
            "Starting to see relationships with nearby players",
            "Maintains position in slow moments",
            "Beginning to adjust based on ball location",
          ],
          commonMistakes: [
            "Losing position when ball moves quickly",
            "Only adjusting in one direction",
            "Forgetting to recover after pressing",
            "Not communicating with adjacent positions",
            "Position good off ball but poor with ball",
          ],
          coachingTips: [
            "When the ball moves there, how does your position change?",
            "What do you notice about where your teammates are?",
            "If you were the coach, where would you want yourself?",
            "You're learning the shape - it takes time and that's okay!",
            "Can you feel when you're connected to the team vs. isolated?",
          ],
          assessmentActivities: [
            "Shadow play without opposition",
            "Ball movement with positional shifting",
            "Partner connection maintaining distance",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Maintains positional discipline in most situations. Understands how position relates to team shape. Can adjust based on ball and teammate positions.",
          observableBehaviors: [
            "Consistently stays in appropriate area",
            "Adjusts position as ball moves",
            "Maintains connection with nearby teammates",
            "Recovers to position after transitions",
            "Understands defensive and attacking shape",
          ],
          commonMistakes: [
            "Occasional positional lapses in long games",
            "May drift when attention lapses",
            "Struggles with complex tactical adjustments",
            "Slow to adapt when formation changes",
            "Better in one phase (attack/defense) than other",
          ],
          coachingTips: [
            "How does your position change between attack and defense?",
            "What triggers you to shift your position?",
            "Can you stay positionally connected even when tired?",
            "What's your relationship with the players closest to you?",
            "You're reading the game well - what patterns do you notice?",
          ],
          assessmentActivities: [
            "11v11 with positional focus",
            "Video review of positioning",
            "Defensive shape exercises",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent positional discipline and understanding. Organizes self within team structure. Can adapt position based on game state and opponent behavior.",
          observableBehaviors: [
            "Instinctively maintains correct position",
            "Helps organize teammates positionally",
            "Adapts to different formations quickly",
            "Reads game to anticipate positional needs",
            "Positions to support multiple phases of play",
          ],
          commonMistakes: [
            "May become too rigid in positioning",
            "Occasionally sacrifices creativity for structure",
          ],
          coachingTips: [
            "How can you help teammates understand their positions?",
            "When should you break from position to create chances?",
            "You're a positional leader - how can you organize others?",
            "What do you notice about opponent positioning?",
            "Balance structure with creativity - when do you take risks?",
          ],
          assessmentActivities: [
            "Tactical leadership evaluation",
            "Game observation for positioning influence",
            "Organizing team shape exercises",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite positional intelligence. Organizes team shape and anticipates tactical needs. Position becomes a weapon through intelligent movement and organization.",
          observableBehaviors: [
            "Commands team organization vocally",
            "Anticipates opponent patterns to position",
            "Creates overloads through positioning",
            "Adapts position to exploit weaknesses",
            "Maintains shape under extreme pressure",
          ],
          commonMistakes: ["Teammates may not match tactical understanding"],
          coachingTips: [
            "How do you see the game differently than others?",
            "What can you teach about reading positions?",
            "Continue studying elite tactical organization",
            "Your understanding benefits everyone - keep sharing it!",
            "What's next in your tactical education?",
          ],
          assessmentActivities: [
            "Captaincy/leadership assessment",
            "Video analysis of organizational impact",
            "Performance against elite opponents",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Strict positions are not developmentally appropriate at this age. Let players experience all areas of the field. Basic ideas of 'your area' can be introduced gently, but expect players to chase the ball. Focus on having fun and experiencing different roles!",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin introducing positional concepts more formally. Players start to understand team shape and their role within it. Still allow flexibility - rigid positions can limit development. Use visual aids and freeze games to teach positioning.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and maintain positions more consistently. Can work on connections between positions and how shape changes in different phases. Video analysis becomes very useful for teaching positional concepts.",
        },
      },
      redFlags: [
        "Complete inability to understand positional area after extended coaching",
        "Cannot maintain position even when game is stopped",
        "No improvement in positional awareness over a season",
        "Significant anxiety about positional responsibilities",
        "Unable to see relationship between self and teammates",
      ],
      parentExplanation:
        "Positional awareness is about understanding where to be on the field and how that relates to teammates and opponents. Young players naturally chase the ball - that's completely normal! As they develop, they learn about team shape and their role within it. We teach positions gradually, always balancing structure with the freedom to explore. A player who understands positioning makes the whole team better because they know how to support teammates and cover space. This develops over years of playing and learning!",
      homeActivities: [
        "Watch professional games and track one player's movement",
        "Discuss team shapes visible on TV broadcasts",
        "Draw position maps after watching games",
        "Play video games that show tactical formations",
        "Have conversations about different positions and roles",
        "Watch tactical analysis videos appropriate for their age",
      ],
      bestAssessedIn: [
        "Full-sided games with focus on shape",
        "Phase of play exercises",
        "Transition moments in games",
        "Defensive organization activities",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across a full game or multiple sessions",
    },
  },
  {
    slug: "dribbling-with-speed",
    name: "Dribbling with Speed",
    sport: "soccer",
    domain: "technical",
    stage: "skill-building",
    description:
      "The ability to dribble at speed while maintaining close control of the ball, using bigger touches with the outside or top of the foot (laces) to cover ground quickly without losing possession.",
    introductionAge: 9,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Loses control as soon as pace increases; must stop completely to regain the ball and dribbles head-down throughout",
      2: "Dribbles at jogging pace with control but loses the ball when accelerating quickly; control breaks down around 70% speed",
      3: "Maintains control at 80-90% running speed with appropriate touch weight and some scanning of the field while moving",
      4: "Explodes into space under control at near-maximum speed and adjusts touch weight instantly to beat defenders",
      5: "Full-speed dribbling appears effortless and is used as a primary attacking weapon while reading defensive positioning",
    },
    observableBehaviors: [
      "Uses top of foot (laces) or outside of foot for bigger touches, not inside of foot",
      "Pushes ball further ahead when space is open, closer when space is tight",
      "Keeps head up to scan the field while running with the ball",
      "Maintains rhythm and balance without choppy, stop-start movements",
      "Recovers control quickly after a heavy touch instead of stopping completely",
    ],
    commonMistakes: [
      "Using inside of foot for speed dribbling instead of laces or outside of foot",
      "Taking too many small touches even when space is open ahead",
      "Looking down at the ball instead of scanning the space ahead",
      "Pushing the ball too far when accelerating and losing it to a defender",
      "Slowing down to regain control instead of adjusting touch weight",
    ],
    coachingTips: [
      "Use the top of your foot for bigger touches when you have space",
      "Push the ball further ahead, then sprint to catch up to it",
      "Keep your head up - what do you see ahead of you?",
      "Start at half speed and build up - notice where your control breaks down",
      "Smooth acceleration, not jerky starts - like a race car",
    ],
    tags: ["technical", "dribbling", "speed", "running with the ball"],
    isCore: true,
    sortOrder: 8,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot maintain ball control while running. Speed and control are mutually exclusive - they either run fast and lose the ball, or maintain control but move slowly. Touches are erratic and unpredictable.",
          observableBehaviors: [
            "Ball escapes control as soon as pace increases",
            "Must stop completely to regain control",
            "Takes many small touches even when space is available",
            "Head down 100% of time while dribbling",
            "Cannot run in a straight line with ball",
            "Kicks ball too far ahead and chases it",
          ],
          commonMistakes: [
            "Using inside of foot for speed dribbling (should use laces/outside)",
            "Taking too many touches when space is open",
            "Looking down at ball instead of scanning space ahead",
            "Running without rhythm - choppy movements",
          ],
          coachingTips: [
            "ELM - Effort: 'I love seeing you try to go fast! What happens when you push the ball further?'",
            "ELM - Mistakes: 'Losing the ball at speed is how we find our limits!'",
            "Question: 'What part of your foot helps you run fastest with the ball?'",
            "Let's start at 50% speed and build up - where does your control break?",
          ],
          assessmentActivities: [
            "Speed dribble over 20 yards - time and assess control",
            "Dribble through wide cone corridor at increasing speeds",
            "Simple breakaway: dribble to goal before walking defender catches up",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to combine speed with control in open space. Can dribble at moderate pace but loses ball when accelerating quickly. Shows understanding that bigger touches allow faster movement.",
          observableBehaviors: [
            "Can dribble at jogging pace with control",
            "Attempts to push ball into space but often too far",
            "Beginning to use laces for longer touches",
            "Some head-up moments during dribbling",
            "Control breaks down at about 70% speed",
            "Can dribble in straight lines at moderate pace",
          ],
          commonMistakes: [
            "Pushes ball too far ahead when accelerating",
            "Reverts to small touches when should push into space",
            "Same touch weight regardless of space available",
            "Slows down to regain control rather than adjusting touch",
          ],
          coachingTips: [
            "ELM - Learning: 'What did you learn from that attempt? The ball went far - what could you try next?'",
            "Question: 'How far can you push the ball before you can't catch up to it?'",
            "Try using the top of your foot like the fast players you watch!",
            "Imagine you're a race car - smooth acceleration, not jerky starts!",
          ],
          assessmentActivities: [
            "Timed dribble race vs. previous personal best",
            "Dribble through speed zones: slow-medium-fast marked areas",
            "Breakaway with passive defender chasing from behind",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Dribbles at good speed with reliable control in most situations. Can accelerate with ball and maintain possession. Uses appropriate touch weight for available space.",
          observableBehaviors: [
            "Maintains control at 80-90% running speed",
            "Pushes ball appropriately for space available",
            "Uses laces effectively for speed dribbling",
            "Scans environment while dribbling at speed",
            "Can change speed while maintaining control",
            "Recovers well from slight control errors",
          ],
          commonMistakes: [
            "May lose control when fatigued",
            "Occasionally pushes too far in tight spaces",
            "Sometimes telegraphs when about to accelerate",
            "May favor one foot for speed dribbling",
          ],
          coachingTips: [
            "When you get tired, what's the first thing that changes in your dribbling?",
            "Can you accelerate with your other foot just as well?",
            "What do you see when you look up while dribbling fast?",
            "How do you decide when to push the ball versus keep it close?",
          ],
          assessmentActivities: [
            "Speed dribble with head-up challenges (call out numbers)",
            "Dribble races with direction changes at speed",
            "Game observation: breakaway success rate",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent speed dribbling with consistent control even under pressure. Can burst past defenders and maintain ball throughout. Touch weight is almost always appropriate.",
          observableBehaviors: [
            "Explodes into space with ball under control",
            "Maintains control at near-maximum speed",
            "Uses speed dribbling to beat defenders",
            "Excellent spatial awareness while at speed",
            "Can decelerate rapidly without losing ball",
            "Adjusts touch for different surfaces instantly",
          ],
          commonMistakes: [
            "May over-rely on speed when other solutions exist",
            "Occasionally takes risks in dangerous areas",
          ],
          coachingTips: [
            "When is speed dribbling the best choice versus passing?",
            "How can your speed help the team, not just yourself?",
            "What adjustments do you make on wet versus dry fields?",
            "Can you help teammates develop their speed dribbling?",
          ],
          assessmentActivities: [
            "1v1 breakaway situations with active defenders",
            "Speed dribble and finish under pressure",
            "Game observation: creating chances through speed",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite speed dribbling that creates consistent attacking advantages. Ball seems attached to foot even at full sprint. Speed with ball is nearly as fast as without.",
          observableBehaviors: [
            "Full speed dribbling appears effortless",
            "Creates breakaways through speed dribbling",
            "Maintains total control in tight spaces at speed",
            "Changes direction at speed without losing control",
            "Speed dribbling is a primary attacking weapon",
            "Reads defensive positioning while at full speed",
          ],
          commonMistakes: [
            "May attempt speed dribbles when simpler solutions exist",
          ],
          coachingTips: [
            "How do you use your elite speed to make teammates better?",
            "What can you teach others about speed dribbling?",
            "When do you choose to slow down rather than sprint?",
            "Your speed changes games - how do you decide when to use it?",
          ],
          assessmentActivities: [
            "Elite competition performance observation",
            "Speed and control testing vs. running without ball",
            "Analysis of chances created through speed dribbling",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Speed dribbling develops after basic control is established. At this age, focus on comfort with the ball first. Speed will come naturally as coordination develops. Short, fun races with the ball build the foundation without pressure on technique.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is an excellent window for developing speed dribbling. Players have basic control and can begin pushing the ball further. Teach the concept of touch weight matching space available. Competitive races and games make practice engaging.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Players can execute speed dribbling in game situations. Focus on decision-making: when to accelerate versus other options. Physical development increases speed capacity. Work on maintaining technique when fatigued.",
        },
      },
      redFlags: [
        "Cannot dribble faster than walking pace after extended practice",
        "Consistent fear of losing ball prevents any acceleration attempts",
        "Physical coordination issues affecting running gait with ball",
        "Avoids any situation requiring speed with ball",
        "Ball contact causes pain or discomfort when dribbling fast",
      ],
      parentExplanation:
        "Dribbling with speed is about moving fast while keeping the ball under control. It's how players break through defenses and create scoring chances. We teach players to use the top of their foot (laces) or outside of foot for bigger touches when they have space, then adjust touch size based on how much room they have. This skill takes lots of practice because players need to find the balance between speed and control. At home, any fast dribbling practice helps - racing with the ball, timed dribbles, or just sprinting with the ball in open space.",
      homeActivities: [
        "Speed dribble sprints: set up cones 20-30 yards apart and time yourself",
        "Breakaway practice: have someone chase you while you dribble to goal",
        "Touch counting: dribble a set distance as fast as possible while counting touches - fewer is better!",
        "Race your shadow: on sunny days, try to dribble fast enough to stay ahead of your shadow",
        "Different surfaces: practice speed dribbling on grass, pavement, and other surfaces",
        "Video yourself dribbling and watch to see when you lose control",
      ],
      bestAssessedIn: [
        "Open-field dribbling exercises",
        "Breakaway situations in training",
        "Small-sided games with space to run",
        "1v1 situations with room behind defender",
      ],
      assessmentFrequency:
        "Weekly observation during training, formal assessment monthly",
      assessmentDuration:
        "Observe across multiple speed dribbling opportunities (5-10 minutes)",
    },
  },
  {
    slug: "creating-passing-angles",
    name: "Creating Passing Angles",
    sport: "soccer",
    domain: "tactical",
    stage: "skill-building",
    description:
      "The ability to position off the ball so a teammate has a clear lane to pass to, adjusting body position and location as the ball and defenders move.",
    introductionAge: 9,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Stands in direct lines behind defenders or teammates with no adjustment, making themselves unpassable",
      2: "Sometimes moves to get clear of a defender but movement is often too small or too late to open a real lane",
      3: "Consistently repositions to create a clear, appropriately-spaced passing lane and opens the body to play forward",
      4: "Creates angles that manipulate defenders' positioning and bypass multiple opponents to enable progression",
      5: "Anticipates and creates angles that unlock defenses before the ball arrives, organizing teammates into better shape",
    },
    observableBehaviors: [
      "Checks for a clear line between self and the ball before expecting a pass",
      "Adjusts position as the ball or a defender moves",
      "Opens body to the field rather than standing side-on or with back to play",
      "Positions at an appropriate distance from the ball carrier - not too close, not too far",
      "Moves to a spot that also allows playing forward immediately after receiving",
    ],
    commonMistakes: [
      "Standing directly behind a defender where the ball carrier cannot reach them",
      "Positioning too close to the ball carrier, which reduces the passing lane",
      "Standing in the same line as another teammate instead of offering a different angle",
      "Creating an angle but standing still, letting the defender adjust and close it",
      "Body closed off to the field when receiving instead of open to play forward",
    ],
    coachingTips: [
      "Can you see a straight line between you and the ball? If not, move",
      "Show your teammate where you want the ball with your movement, not just your voice",
      "Create the angle, then keep adjusting it as the defender reacts",
      "Position yourself so you can play forward the moment you receive",
      "Look for gaps between defenders, not just open grass",
    ],
    tags: ["tactical", "passing", "positioning", "support play"],
    isCore: true,
    sortOrder: 22,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player has no understanding of passing angles. Positions directly behind defenders or teammates, making themselves unpassable. Static positioning regardless of ball location.",
          observableBehaviors: [
            "Stands in direct line behind defender",
            "Hides behind teammates when ball is near",
            "Never adjusts position based on ball movement",
            "Positions too close or too far from ball carrier",
            "Body closed off rather than open to receive",
            "No understanding of passing lanes",
          ],
          commonMistakes: [
            "Hiding behind the defender - can't receive pass",
            "Positioning too close to ball carrier - reduces passing lanes",
            "Standing in same line as other teammates",
            "Body closed to field when receiving",
          ],
          coachingTips: [
            "Can you see a straight line between you and the ball? If not, move!",
            "What happens when you stand where the defender isn't?",
            "Show me where you need to be for me to pass to you!",
            "Every time you move to an open space, you're learning!",
          ],
          assessmentActivities: [
            "3v1 with focus on angle creation",
            "Freeze and discuss: who can receive right now?",
            "Simple passing gates - find the open gate",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand need to be 'passable.' Sometimes adjusts position but often not far enough or at wrong angle. Inconsistent awareness of blocking defenders.",
          observableBehaviors: [
            "Occasionally moves to get clear of defender",
            "Beginning to recognize when they're blocked",
            "Sometimes shows for ball at correct angle",
            "Movement often too small to create clear lane",
            "May create angle but body position closed",
            "Understands concept when coached directly",
          ],
          commonMistakes: [
            "Creating angle but standing still - defender adjusts",
            "Only creating angle on one side - predictable",
            "Finding angle but not communicating availability",
            "Moving too early or too late to create angle",
          ],
          coachingTips: [
            "You found a gap - how can you show your teammate you're open?",
            "What happens if you move just a little bit wider?",
            "Can you create an angle so you can play forward after receiving?",
            "Great learning! What made that movement work?",
          ],
          assessmentActivities: [
            "4v1 rondo with angle requirements",
            "Pass and move exercises with targets",
            "Angle recognition quiz during freeze moments",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Consistently positions to create passing angles. Understands relationship between self, ball, and defender. Opens body appropriately to receive and play forward.",
          observableBehaviors: [
            "Regularly adjusts to create clear passing lane",
            "Positions at appropriate distance from ball carrier",
            "Opens body to receive facing forward",
            "Adjusts angle as ball or defender moves",
            "Understands when to stay vs. when to move",
            "Creates options for ball carrier consistently",
          ],
          commonMistakes: [
            "Movement becoming predictable to defenders",
            "Occasionally creating angle but at wrong depth",
            "May struggle against compact defenses",
            "Sometimes slow to adjust when ball moves quickly",
          ],
          coachingTips: [
            "How can your body position help you play forward after receiving?",
            "What do you notice about the defender's position when you move?",
            "Can you create an angle that splits two defenders?",
            "You're developing great awareness - what patterns do you see?",
          ],
          assessmentActivities: [
            "Rondo with central player option",
            "Positional games with angle scoring bonus",
            "Game observation for angle quality",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent understanding of passing angles. Creates angles that enable progression. Can create angle while also manipulating defender's position.",
          observableBehaviors: [
            "Creates angles that bypass multiple defenders",
            "Uses movement to drag defender and open lane",
            "Timing of movements creates perfect passing windows",
            "Receives in positions that enable forward play",
            "Helps teammates find angles through communication",
            "Recognizes and exploits defender's blind side",
          ],
          commonMistakes: [
            "May overcomplicate when simple angle works",
            "Teammates may not recognize created opportunities",
          ],
          coachingTips: [
            "How can you help teammates understand the angles you're creating?",
            "You're reading the game well - what tells you where to move?",
            "When is a simple angle better than a creative one?",
            "Leadership: can you organize teammates into better angles?",
          ],
          assessmentActivities: [
            "Complex positional exercises",
            "Game analysis for progressive passing success",
            "Video review of angle creation",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite understanding of passing geometry. Creates angles that others don't see. Movement creates passing opportunities that unlock defenses.",
          observableBehaviors: [
            "Creates angles that lead directly to chances",
            "Anticipates where angles will open before ball arrives",
            "Movement manipulates multiple defenders simultaneously",
            "Receives in half-spaces and dangerous areas",
            "Organizes team shape to create collective angles",
            "Finds receiving positions that split defensive lines",
          ],
          commonMistakes: ["Teammates may not execute at the level required"],
          coachingTips: [
            "How do you process where to move so quickly?",
            "What can you teach others about reading the game?",
            "Your understanding elevates everyone - keep sharing it!",
            "Continue studying the game at the highest levels.",
          ],
          assessmentActivities: [
            "Elite tactical exercises",
            "Statistical analysis of progressive passes received",
            "Comparison to professional movement patterns",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Passing angles are conceptually difficult at this age. Focus on basic spreading out and being visible to teammates. Don't expect understanding of geometric relationships. Simple games work better than tactical instruction.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Players can begin understanding that they need to be 'open' to receive. Use freeze games to show good and poor angles. Visual demonstrations are powerful. Consistent practice in rondos helps develop this instinct.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Tactical understanding accelerates rapidly. Can work on more nuanced concepts like depth, width, and body shape. Video analysis becomes useful. Challenge players to create angles that enable forward play.",
        },
      },
      redFlags: [
        "Cannot understand concept of passing lanes after extended coaching",
        "Consistently hides from ball in game situations",
        "No adjustment of position regardless of ball movement",
        "Anxiety about receiving ball even in open positions",
        "Unable to recognize when blocked from receiving",
      ],
      parentExplanation:
        "Creating passing angles is about positioning to receive a pass. Players need to understand that defenders block passing lanes, so they must move to where the ball can actually reach them. We teach players to imagine a straight line between themselves and the ball - if a defender is in that line, they need to move! Good angles also mean being positioned to play forward after receiving, not just receiving and having to turn. Watch games together and notice how professional players constantly adjust their positions.",
      homeActivities: [
        "Passing lane freeze: while watching soccer, pause and ask who can receive right now",
        "Triangle passing game: three family members form triangle, move to stay 'open'",
        "Angle adjustment drill: parent with ball, child creates angle to receive, parent moves, child adjusts",
        "Video analysis: record a game and review your movement and positioning",
        "3v1 in backyard: focus on finding angles to stay open",
        "Discuss: why was that pass blocked? Where could they have moved?",
      ],
      bestAssessedIn: [
        "Possession games and rondos",
        "Small-sided games with focus on passing",
        "Technical passing exercises with defenders",
        "Game observation for off-ball positioning",
      ],
      assessmentFrequency:
        "Weekly observation during training, formal assessment monthly",
      assessmentDuration:
        "Observe across multiple passing situations in rondos and games (10-15 minutes)",
    },
  },
  {
    slug: "enjoyment-of-play",
    name: "Enjoyment of Play",
    sport: "soccer",
    domain: "psychological",
    stage: "fundamentals",
    description:
      "A player's genuine engagement with and love for playing soccer, shown through positive attitude, willingness to participate, and enthusiasm during practice and games.",
    introductionAge: 4,
    assessmentMethod: "observation",
    progressionLevels: {
      1: "Shows reluctance or disengagement, needs coaxing to join in, and may express not wanting to play",
      2: "Enjoys some activities (like games) but not others (like drills), with enjoyment dependent on external factors",
      3: "Generally enjoys soccer, approaches practice positively, and can stay engaged even through less-preferred activities",
      4: "Radiates enthusiasm in nearly all situations, finds joy even in challenging drills, and lifts teammates' energy",
      5: "Shows deep, intrinsic love for the game independent of outcomes, and their passion elevates the whole team's culture",
    },
    observableBehaviors: [
      "Joins activities willingly without needing to be coaxed",
      "Smiles and shows positive body language during practice and games",
      "Stays engaged through less-preferred activities, not just favorite games",
      "Talks about soccer positively outside of practice",
      "Bounces back quickly from mistakes or disappointing moments",
    ],
    commonMistakes: [
      "Tenses up or goes quiet under high-pressure feedback, and their visible enjoyment drains from play",
      "Enthusiasm craters when the scoreline or outcome becomes the focus, even if their play quality holds",
      "Disengages or sulks after being compared to a teammate, even without direct criticism of their own play",
      "Enthusiasm drops steadily across a season with no recovery - a pattern consistent with burnout rather than dislike of the sport",
      "Checks a parent's or coach's reaction after plays rather than reacting to the play itself, suggesting performance is for approval rather than enjoyment",
    ],
    coachingTips: [
      "What would make this more fun for you?",
      "Let's play a game - you choose what we do!",
      "It's okay not to love every drill - what helps you push through the tough parts?",
      "I just want you to enjoy being here - no pressure",
      "Your effort is what matters most to me - have fun with it",
    ],
    tags: ["psychological", "enjoyment", "motivation", "fun"],
    isCore: true,
    sortOrder: 33,
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player shows limited enjoyment during soccer activities. May appear reluctant, disengaged, or anxious. Participation feels like an obligation rather than something wanted.",
          observableBehaviors: [
            "Reluctant to join activities or needs coaxing",
            "Body language shows disengagement (slouching, looking away)",
            "Frequently asks when practice ends",
            "Doesn't smile or show positive emotions during play",
            "Avoids involvement - stands on edges of activities",
            "May express wanting to quit or not wanting to attend",
          ],
          commonMistakes: [
            "Adults applying excessive pressure removing fun",
            "Focus only on winning diminishing joy in playing",
            "Comparing to others reducing personal enjoyment",
            "Not allowing free play and creativity",
          ],
          coachingTips: [
            "What would make this more fun for you?",
            "Show me your favorite thing to do with the ball!",
            "Let's play a game - you choose what we do!",
            "I just want you to enjoy being here - no pressure!",
          ],
          assessmentActivities: [
            "Free play observation - what do they choose?",
            "Informal conversation about feelings about soccer",
            "Body language observation throughout session",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Shows enjoyment in some situations but not consistently. May enjoy games but not drills, or fun activities but not challenging ones. Enjoyment depends on external factors.",
          observableBehaviors: [
            "Enjoys certain activities but not others",
            "Smiles during games or scrimmages",
            "Enjoyment depends on who they're with",
            "May disengage when challenged or when mistakes happen",
            "Needs external motivation to participate fully",
            "Inconsistent energy and enthusiasm",
          ],
          commonMistakes: [
            "Over-scheduling leading to burnout",
            "Fear of failure preventing trying new things",
            "Adult expectations overshadowing child's experience",
            "Too much focus on results rather than experience",
          ],
          coachingTips: [
            "What parts of training do you enjoy most?",
            "How can we make the drills more fun?",
            "It's okay to not love everything - what helps you get through the tough parts?",
            "Your effort is what matters most to me - have fun with it!",
          ],
          assessmentActivities: [
            "Track which activities produce most engagement",
            "Note enjoyment patterns across different situations",
            "Informal check-ins about how they're feeling",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Generally enjoys soccer most of the time. Positive attitude toward practice and games. Can maintain enjoyment even when activities are challenging or less preferred.",
          observableBehaviors: [
            "Approaches practice with positive attitude",
            "Maintains engagement through various activities",
            "Shows enjoyment through body language and expressions",
            "Bounces back from disappointments relatively quickly",
            "Talks positively about soccer to others",
            "Eager to play and participate in activities",
          ],
          commonMistakes: [
            "Taking enjoyment for granted without nurturing it",
            "Increasing pressure as skill develops",
            "Forgetting to celebrate the fun moments",
          ],
          coachingTips: [
            "What makes soccer fun for you?",
            "I love seeing you enjoy this - what keeps it fun?",
            "Even when it's challenging, you seem to find the fun - how?",
            "Your positive energy helps the whole team!",
          ],
          assessmentActivities: [
            "Regular informal conversations about enjoyment",
            "Observation of attitude across different activities",
            "Check-in with parents about enjoyment at home",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong love for the game evident in all situations. Finds joy in practice, games, challenges, and even setbacks. Brings positive energy that influences teammates.",
          observableBehaviors: [
            "Radiates enthusiasm in all situations",
            "Finds enjoyment even in drills or conditioning",
            "Maintains positivity when losing or struggling",
            "Helps create fun environment for teammates",
            "Seeks extra soccer opportunities voluntarily",
            "Talks about soccer with genuine passion",
          ],
          commonMistakes: [
            "Over-commitment leading to eventual burnout",
            "Others projecting expectations onto their passion",
          ],
          coachingTips: [
            "Your love for the game inspires others - keep sharing it!",
            "How do you stay positive even when things are tough?",
            "Can you help a teammate who's not enjoying things as much?",
            "Make sure to balance your passion with rest!",
          ],
          assessmentActivities: [
            "Observe influence on team atmosphere",
            "Note how they respond to challenges and setbacks",
            "Discussion about what they love about soccer",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Deep, intrinsic love for soccer that transcends outcomes. Finds joy in all aspects of the game. Passion is contagious and elevates entire team environment.",
          observableBehaviors: [
            "Joy is independent of results or external factors",
            "Celebrates others' success as much as own",
            "Creates culture of enjoyment for whole team",
            "Finds meaning and satisfaction in improvement process",
            "Remains passionate through setbacks and challenges",
            "Soccer brings genuine happiness and fulfillment",
          ],
          commonMistakes: ["Others may not understand depth of their passion"],
          coachingTips: [
            "Your passion is a gift to the team - thank you for sharing it!",
            "How did you develop such a deep love for the game?",
            "You make soccer better for everyone around you!",
            "Continue to nurture this - it will serve you your whole life!",
          ],
          assessmentActivities: [
            "Long-term observation of sustained enjoyment",
            "Impact on team culture and atmosphere",
            "Reflection discussions about meaning of soccer",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "2-4",
          notes:
            "Young players often have natural enthusiasm for play. The key is protecting this enjoyment rather than diminishing it with pressure or excessive instruction. Let them play, explore, and have fun. If enjoyment is low, investigate causes carefully.",
        },
        ages9to11: {
          typicalLevel: "2-4",
          notes:
            "Enjoyment can vary as players become more aware of comparison and competition. Balance skill development with fun activities. Watch for signs of pressure affecting enjoyment. Positive team culture is very important.",
        },
        ages12to14: {
          typicalLevel: "2-4",
          notes:
            "Adolescence brings complexity to enjoyment - social factors, self-consciousness, and increased pressure can all impact. Maintain focus on development over results. Create safe environment for players to enjoy the game.",
        },
      },
      redFlags: [
        "Consistently expresses not wanting to play or attend",
        "Crying or emotional distress before, during, or after soccer",
        "Complete disengagement - stands still, doesn't participate",
        "Physical symptoms (stomach ache, etc.) before soccer",
        "Significant personality change when at soccer activities",
      ],
      parentExplanation:
        "Enjoyment of play is the foundation of long-term soccer development. When kids enjoy playing, they practice more, persist through challenges, and develop lasting love for the game. We monitor enjoyment carefully and adjust when needed. Warning signs include reluctance to attend, negative body language, or expressing desire to quit. The research is clear: fun predicts development better than early intensity. If your child isn't enjoying soccer, we need to understand why and make changes. Your observations at home are valuable - let us know if you see changes in how they talk about or anticipate soccer.",
      homeActivities: [
        "Backyard free play: unstructured play with the ball, no coaching",
        "Watch age-appropriate soccer together and share excitement",
        "Create fun games with the ball - make up silly rules",
        "Let them lead: ask what they want to do with the ball",
        "Celebrate their enjoyment - 'I love seeing you have fun!'",
        "Never use soccer as punishment or reward",
      ],
      bestAssessedIn: [
        "Informal observation during all activities",
        "Free play periods",
        "Before and after practice conversations",
        "Parent feedback about home discussions",
      ],
      assessmentFrequency: "Observe at every session, formal check-in monthly",
      assessmentDuration:
        "Ongoing observation - enjoyment is assessed constantly",
    },
  },
];

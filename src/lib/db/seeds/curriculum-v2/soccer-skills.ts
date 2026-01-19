/**
 * Comprehensive Soccer Skills - Assessment Guides
 *
 * Complete skill assessment library with:
 * - Detailed 5-level progression definitions
 * - Observable behaviors at each level
 * - Common mistakes and corrections
 * - Age-appropriate expectations
 * - Red flags for additional support
 * - Parent communication templates
 * - Home activities for skill development
 *
 * Skills included:
 * TECHNICAL: Ball Control, Passing (Short), Receiving/First Touch, Dribbling, Shooting
 * TACTICAL: Finding Space, Support Play, 1v1 Defending
 * PHYSICAL: Agility/Coordination, Speed
 * PSYCHOLOGICAL: Confidence, Resilience, Teamwork
 */

import { getDb } from "../../index";
import { skills, skillDomains, developmentStages } from "../../schema/curriculum";
import { sports } from "../../schema/sports";
import { eq } from "drizzle-orm";

export async function seedSoccerSkills() {
  console.log("Seeding comprehensive soccer skills with assessment guides...");

  // Get required references
  const [soccer] = await getDb().select().from(sports).where(eq(sports.slug, "soccer"));
  if (!soccer) throw new Error("Soccer sport must be seeded first");

  const domains = await getDb().select().from(skillDomains);
  const stages = await getDb().select().from(developmentStages);

  const technical = domains.find((d) => d.name === "technical");
  const tactical = domains.find((d) => d.name === "tactical");
  const physical = domains.find((d) => d.name === "physical");
  const psychological = domains.find((d) => d.name === "psychological");

  const fundamentals = stages.find((s) => s.slug === "fundamentals");

  if (!technical || !tactical || !physical || !psychological) {
    throw new Error("Skill domains must be seeded first");
  }
  if (!fundamentals) {
    throw new Error("Development stages must be seeded first");
  }

  const comprehensiveSkills = [
    // ═══════════════════════════════════════════════════════════════════════════
    // TECHNICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Ball Control
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Ball Control",
      slug: "ball-control",
      description:
        "The ability to keep the ball close and under control while stationary and moving. Foundation skill that enables all other technical abilities.",
      introductionAge: 4,
      assessmentMethod: "observation" as const,
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
        "Ball stays within playing distance (1-2 feet)",
        "Eyes can look up while controlling",
        "Uses appropriate surface of foot for situation",
        "Body position stays balanced over ball",
        "Can shield ball from pressure",
      ],

      commonMistakes: [
        "Kicking ball too far ahead",
        "Only using dominant foot",
        "Looking down constantly at ball",
        "Standing too upright (poor balance)",
        "Touching ball with toe instead of laces/inside",
      ],

      coachingTips: [
        "Use 'soft feet' - cushion the ball like catching an egg",
        "Keep the ball in your 'footprint' - imaginary circle around you",
        "Bend knees slightly for better balance",
        "Practice with both feet - 'two feet are better than one!'",
        "Head up! 'Peek at the ball, don't stare'",
      ],

      tags: ["core", "technical", "fundamental", "ball-mastery"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is just beginning to develop a relationship with the ball. Control is inconsistent and the ball frequently escapes.",
            observableBehaviors: [
              "Ball rolls away after each touch",
              "Needs 3+ touches to stop a rolling ball",
              "Can only use one foot",
              "Must stop completely to control ball",
              "Looks at ball 100% of time",
            ],
            commonMistakes: [
              "Using toe to control (ball bounces away)",
              "Reaching for ball instead of moving feet",
              "Kicking at ball instead of cushioning",
              "Standing on heels instead of balls of feet",
            ],
            coachingTips: [
              "Start with stationary ball - 'can you touch the top of the ball softly?'",
              "Use flat markers as 'homes' to bring ball back to",
              "Celebrate any successful touch - build confidence first",
              "Keep ball touches very simple - side of foot only",
            ],
            assessmentActivities: [
              "Ball tap counting (how many in 30 seconds without losing ball)",
              "Red light/green light with balls",
              "Partner roll and stop",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Player can control ball when stationary but struggles when movement is required. Touch is improving but inconsistent.",
            observableBehaviors: [
              "Can stop a rolling ball with 1-2 touches",
              "Controls while standing still",
              "Loses ball when trying to move quickly",
              "Beginning to use inside of foot",
              "Occasionally looks up",
            ],
            commonMistakes: [
              "Pushing ball too far when starting to move",
              "Only comfortable with ball on dominant side",
              "Panics when ball bounces up",
              "Stops moving to control ball",
            ],
            coachingTips: [
              "Practice 'tick-tock' - ball between feet while standing",
              "Walk with ball before jogging - 'slow is smooth, smooth is fast'",
              "Introduce 'pull-back' - sole of foot to bring ball back",
              "Use cones as targets - 'dribble to the cone, stop the ball'",
            ],
            assessmentActivities: [
              "Dribble through gates at walking pace",
              "Stop ball on a line on command",
              "Toe-taps for 20 seconds",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Player maintains control while moving at moderate pace. Can change direction and uses both feet, though dominant foot is preferred.",
            observableBehaviors: [
              "Dribbles at jogging pace with control",
              "Changes direction without losing ball",
              "Uses both feet (dominant more confidently)",
              "Can look up periodically while dribbling",
              "Basic shielding when challenged",
            ],
            commonMistakes: [
              "Ball gets away when sprinting",
              "Weak foot touch is heavy",
              "Loses control when pressured from behind",
              "Takes too many touches in tight spaces",
            ],
            coachingTips: [
              "Introduce 'speed bumps' - slow down when ball gets away, speed up when close",
              "Challenge: 'Can you dribble to the cone using only your weak foot?'",
              "Add light pressure - defender can only jog",
              "Practice shielding - 'make yourself BIG between ball and defender'",
            ],
            assessmentActivities: [
              "Dribble through cone slalom at jogging pace",
              "1v1 keep-away (passive defender)",
              "Dribble with head up - call out coach's fingers",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Player shows confident ball control at speed and under pressure. Uses both feet effectively and can manipulate the ball creatively.",
            observableBehaviors: [
              "Controls ball at full speed",
              "Comfortable using either foot",
              "Maintains control with defender applying pressure",
              "Uses different surfaces (inside, outside, sole)",
              "Head up most of the time while dribbling",
            ],
            commonMistakes: [
              "May over-complicate with unnecessary touches",
              "Occasionally caught out in very tight spaces",
              "Can be predictable with preferred moves",
            ],
            coachingTips: [
              "Encourage creativity - 'what new moves can you try?'",
              "Increase pressure in training - multiple defenders",
              "Work on first touch in tight spaces",
              "Challenge to use weaker foot in game situations",
            ],
            assessmentActivities: [
              "1v1 to goal with active defender",
              "Rondo (4v1) in tight space",
              "Speed dribble through cones with time pressure",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Exceptional ball control in all situations. Creative and unpredictable with the ball. Rarely loses possession.",
            observableBehaviors: [
              "Keeps ball in very tight spaces under pressure",
              "Creative first touches to create space",
              "Ambidextrous - no weak foot visible",
              "Uses advanced techniques (Cruyff, drag-backs, etc.)",
              "Controls ball while scanning surroundings",
            ],
            commonMistakes: [
              "May try to beat too many players",
              "Could be over-confident in some situations",
            ],
            coachingTips: [
              "Challenge with harder scenarios - multiple defenders, smaller spaces",
              "Encourage teaching younger players (reinforces learning)",
              "Introduce position-specific ball control challenges",
              "Focus on decision-making - when to dribble vs. pass",
            ],
            assessmentActivities: [
              "Rondo (4v2 or 3v2)",
              "1v2 keep-away",
              "Match play observation",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Focus on fun and lots of ball touches. Players at this age are developing basic coordination. Expect frequent loss of control - this is normal! Aim for improvement in ball familiarity, not perfection.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players should be developing control while moving. Most will have a clear dominant foot. Encourage weak foot development through games. Control under light pressure is emerging.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect competent control at speed. Focus on control under game-realistic pressure. Advanced players will show creativity and both-footedness. This is the key window for technical refinement.",
          },
        },

        redFlags: [
          "No improvement over 8+ weeks despite regular practice",
          "Significantly behind peers in basic coordination",
          "Frustration or avoidance of ball activities",
          "Difficulty with basic gross motor skills (running, jumping)",
          "Consistently uses toe to kick despite instruction",
        ],

        parentExplanation:
          "Ball control is the foundation of all soccer skills. It's the ability to keep the ball close while moving. Right now we're working on your child's 'relationship with the ball' - the more comfortable they are, the more confident they'll become. At home, simply having a ball at their feet while watching TV or in the backyard helps develop this 'feel' for the ball. Don't worry about perfect technique at this age - lots of touches with the ball is what matters most!",

        homeActivities: [
          "Toe taps while watching TV (30 seconds, try to beat your record)",
          "Dribble around the backyard - make up obstacle courses",
          "Ball between feet game - how long can you keep it moving side to side?",
          "Practice stopping the ball with different parts of your foot",
          "'Keepie-uppies' with bounces allowed (catch after each touch at first)",
          "Dribble to the mailbox and back every day",
        ],

        bestAssessedIn: [
          "Warm-up dribbling activities",
          "Small-sided games (3v3 or 4v4)",
          "1v1 situations",
          "Ball mastery circuits",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across 2-3 sessions before rating",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Passing (Short)
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Passing (Short)",
      slug: "passing-short",
      description:
        "The ability to accurately deliver the ball to a teammate over short distances (under 15 yards) using the inside of the foot.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Receiving / First Touch
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Receiving / First Touch",
      slug: "receiving-first-touch",
      description:
        "The ability to control an incoming ball and prepare it for the next action (pass, dribble, or shot). The most important touch in soccer.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Dribbling
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Dribbling",
      slug: "dribbling",
      description:
        "The ability to move with the ball while maintaining control, including changes of speed, direction, and using moves to beat opponents.",
      introductionAge: 4,
      assessmentMethod: "observation" as const,
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
        "Ball stays within 1-2 feet while moving",
        "Uses multiple surfaces of foot",
        "Can change direction without losing ball",
        "Uses changes of pace",
        "Head up while dribbling",
      ],

      commonMistakes: [
        "Kicking ball too far ahead",
        "Only using one foot/surface",
        "Looking down at ball constantly",
        "Running in straight lines only",
        "Same speed all the time",
      ],

      coachingTips: [
        "'Sticky feet' - ball stays close like glue",
        "'Touch, touch, touch' - lots of small touches",
        "'Slow, slow, FAST!' - change of pace beats defenders",
        "'Shoulder drop' - fake one way, go the other",
        "'Peek up' - quick glances while dribbling",
      ],

      tags: ["core", "technical", "fundamental", "dribbling", "1v1"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player kicks ball ahead and chases it. No real control while moving. Ball frequently escapes.",
            observableBehaviors: [
              "Kicks ball 5+ yards ahead",
              "Chases ball rather than dribbling",
              "Loses ball when trying to move",
              "Cannot change direction with ball",
              "Uses only toe to push ball",
            ],
            commonMistakes: [
              "Kicking instead of dribbling",
              "Running too fast for skill level",
              "Only touching ball every 5+ steps",
              "Giving up when ball escapes",
            ],
            coachingTips: [
              "Start VERY slowly - walking pace",
              "Count touches - 'let's see 5 touches before the cone'",
              "Use 'tiny kicks' cue",
              "Celebrate small successes",
            ],
            assessmentActivities: [
              "Dribble to coach (10 yards, no obstacles)",
              "Free dribbling in space",
              "Dribble and stop on command",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can dribble slowly in a straight line. Loses control with direction changes or increased speed.",
            observableBehaviors: [
              "Dribbles in straight line at walking/jogging pace",
              "Ball stays closer (2-3 feet)",
              "Struggles when turning",
              "Can stop ball on command",
              "Uses inside of foot sometimes",
            ],
            commonMistakes: [
              "Ball escapes when turning",
              "Only one foot/surface used",
              "Speed creates loss of control",
              "Stops to change direction",
            ],
            coachingTips: [
              "Introduce turn techniques (drag back, inside hook)",
              "Practice figure-8 around cones",
              "Use both feet in warm-ups",
              "Gradually add speed",
            ],
            assessmentActivities: [
              "Cone weaving at slow pace",
              "Dribble and turn on whistle",
              "Dribble around stationary obstacles",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Dribbles at jogging pace with direction changes. Uses basic moves. Can maintain control under light pressure.",
            observableBehaviors: [
              "Changes direction without losing ball",
              "Uses inside and outside of foot",
              "Employs 1-2 basic moves",
              "Can speed up and slow down",
              "Occasionally looks up",
            ],
            commonMistakes: [
              "Loses ball at full speed",
              "Moves are predictable",
              "Weak foot dribbling poor",
              "Head down too much",
            ],
            coachingTips: [
              "Add defender pressure (passive then active)",
              "Teach 2-3 specific moves",
              "Practice with weak foot",
              "Head-up challenges (call out numbers)",
            ],
            assessmentActivities: [
              "1v1 against passive defender",
              "Cone slalom at speed",
              "Dribble with head up challenges",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Dribbles confidently at speed. Uses multiple moves effectively. Can beat defenders in 1v1 situations.",
            observableBehaviors: [
              "Maintains control at full speed",
              "Uses multiple moves",
              "Beats defenders consistently",
              "Uses both feet well",
              "Reads defender's position",
            ],
            commonMistakes: [
              "May over-dribble in game situations",
              "Occasionally loses ball against strong defenders",
              "Could pass when dribbling is chosen",
            ],
            coachingTips: [
              "Decision-making - when to dribble vs pass",
              "Multiple defenders practice",
              "Position-specific dribbling",
              "Speed of execution",
            ],
            assessmentActivities: [
              "1v1 to goal",
              "2v1 attacking situations",
              "Small-sided games focus on dribbling",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Creative, unpredictable dribbler. Can beat multiple defenders. Makes the ball do what they want.",
            observableBehaviors: [
              "Beats multiple defenders",
              "Unpredictable moves",
              "Creates chances for team",
              "Dribbles under high pressure",
              "Perfect ball manipulation",
            ],
            commonMistakes: [
              "May take on too many players",
              "Could frustrate teammates by over-dribbling",
            ],
            coachingTips: [
              "Focus on decision-making",
              "When to release the ball",
              "Final third effectiveness",
              "Leadership in 1v1 situations",
            ],
            assessmentActivities: [
              "1v2 challenges",
              "Full match observation",
              "Counter-attacking scenarios",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Focus on lots of touches and keeping ball close. This is the best age to develop dribbling confidence. Don't worry about moves yet - ball familiarity is key.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players should change direction confidently. Introduce specific moves (scissors, step-over). This is the ideal age to develop 1v1 ability.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect confident dribbling at speed. Multiple moves should be in their toolkit. Focus shifts to when to dribble and reading defenders.",
          },
        },

        redFlags: [
          "Cannot keep ball close even at walking pace after extended practice",
          "Persistent coordination difficulties",
          "Avoids dribbling situations",
          "No improvement over several months",
          "Significantly behind peers in ball manipulation",
        ],

        parentExplanation:
          "Dribbling is running with the ball while keeping it under control. Your child is developing 'ball mastery' - the ability to make the ball go where they want. At this stage, we focus on lots of touches (keeping the ball close) rather than fancy moves. The best dribblers in the world all started with thousands of hours of just playing with the ball. Any time spent with a ball at their feet helps!",

        homeActivities: [
          "Dribble around the house (soft ball or training ball)",
          "Set up cone courses in the backyard",
          "Practice specific moves - watch YouTube tutorials together",
          "Play 1v1 with parent or sibling",
          "Ball mastery routines (many free videos online)",
          "Dribble to the park and back",
        ],

        bestAssessedIn: [
          "1v1 situations",
          "Free dribbling warm-ups",
          "Small-sided games",
          "Dribbling circuits",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across 2-3 sessions before rating",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Shooting
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Shooting",
      slug: "shooting",
      description:
        "The ability to strike the ball toward goal with power, accuracy, and appropriate technique.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 5,

      progressionLevels: {
        1: "Strikes with toe; no power or direction; ball often misses target entirely",
        2: "Uses instep sometimes; hits ball on ground; occasional shots on target",
        3: "Consistent technique; reasonable power; majority on target from close range",
        4: "Powerful shots with both feet; accurate from various angles; can finish under pressure",
        5: "Clinical finisher; shoots with both feet; scores in tight windows; composed under pressure",
      },

      observableBehaviors: [
        "Plants non-kicking foot beside ball",
        "Strikes with laces (instep)",
        "Body over ball for low shots",
        "Follow-through toward target",
        "Looks at target before striking",
      ],

      commonMistakes: [
        "Toe-poking the ball",
        "Leaning back (ball flies over)",
        "Non-kicking foot too far from ball",
        "No follow-through",
        "Trying to shoot too hard (sacrificing technique)",
      ],

      coachingTips: [
        "'Laces on laces' - strike through the middle",
        "'Nose over toes' - body forward for low shots",
        "'Plant and point' - non-kicking foot aims at target",
        "'Hit through it' - follow through toward goal",
        "'Pick your spot' - aim for corners",
      ],

      tags: ["core", "technical", "fundamental", "shooting", "finishing"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player strikes with toe, generating little power or accuracy. Ball often misses the goal entirely.",
            observableBehaviors: [
              "Toe-pokes the ball",
              "Ball goes in random directions",
              "Very little power generated",
              "Poor body position",
              "Doesn't look at goal before shooting",
            ],
            commonMistakes: [
              "Toe contact only",
              "Standing on heels",
              "Swinging leg across body",
              "Closing eyes on contact",
            ],
            coachingTips: [
              "Start close to goal (5-6 yards)",
              "Use 'shoelace' cue - strike with laces",
              "Stationary ball first",
              "Big targets (entire goal)",
            ],
            assessmentActivities: [
              "Shoot from penalty spot at open goal",
              "Strike stationary ball to coach",
              "Knock over large target",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to use instep (laces). Ball stays on ground most of time. Occasionally hits target.",
            observableBehaviors: [
              "Uses laces sometimes",
              "Shots stay low",
              "Some shots hit target",
              "Shows awareness of goal position",
              "Power improving",
            ],
            commonMistakes: [
              "Inconsistent contact point",
              "Leans back on harder shots",
              "Plants foot too far from ball",
              "Rushes the shot",
            ],
            coachingTips: [
              "Focus on technique over power",
              "Add gentle movement before shot",
              "Introduce 'pick a corner' concept",
              "Use targets in goal",
            ],
            assessmentActivities: [
              "Shoot after dribble from 10 yards",
              "Target practice (cones in corners)",
              "Shooting games with points",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Consistent technique generating reasonable power. Majority of shots from close range hit target.",
            observableBehaviors: [
              "Reliable technique",
              "Good power from stationary ball",
              "On target from 10-12 yards",
              "Uses dominant foot confidently",
              "Body position correct",
            ],
            commonMistakes: [
              "Weak foot shooting poor",
              "Struggles from distance",
              "Shots predictable",
              "Takes too long to shoot",
            ],
            coachingTips: [
              "Add pressure (defender closing)",
              "Practice weak foot",
              "Increase distance gradually",
              "Quick shooting practice",
            ],
            assessmentActivities: [
              "1v1 finishing vs goalkeeper",
              "Shooting after pass/layoff",
              "Time-pressure shooting",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Powerful and accurate shots with both feet. Finishes under pressure. Various techniques available.",
            observableBehaviors: [
              "Both feet effective",
              "Power and placement combined",
              "Finishes under pressure",
              "Uses inside foot, laces, outside",
              "Quick to shoot",
            ],
            commonMistakes: [
              "May snatch at chances",
              "Occasionally over-hits",
              "Could pick better moments",
            ],
            coachingTips: [
              "Decision-making - when to shoot",
              "Finishing in tight spaces",
              "First-time finishes",
              "Shooting under fatigue",
            ],
            assessmentActivities: [
              "Finishing circuits with goalkeeper",
              "Small-sided games (goals from shots)",
              "1v1 with GK from various angles",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Clinical finisher. Scores in tight windows. Composed under maximum pressure. Both feet equally effective.",
            observableBehaviors: [
              "Scores consistently under pressure",
              "Uses appropriate technique for situation",
              "Calm in front of goal",
              "Hits tight targets",
              "Creates shooting opportunities",
            ],
            commonMistakes: [
              "May shoot when passing is better option",
            ],
            coachingTips: [
              "Maintain sharpness through varied practice",
              "Decision-making refinement",
              "Leadership in attacking play",
              "Mental composure training",
            ],
            assessmentActivities: [
              "Full match observation",
              "Finishing under fatigue",
              "High-pressure shooting scenarios",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Focus on striking with the instep (laces) not the toe. Power is not the priority - technique is. Keep it fun with target games and celebrations.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Technique should be reliable. Begin developing weak foot. Add finishing under light pressure. This is when shooting technique really develops.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect powerful shots with both feet. Focus on composure and decision-making. Finishing under game pressure is key development area.",
          },
        },

        redFlags: [
          "Persistent toe-poking despite instruction",
          "Fear of striking ball",
          "Cannot generate any power",
          "Coordination affecting kicking motion",
          "No improvement after several months",
        ],

        parentExplanation:
          "Shooting is striking the ball toward goal with power and accuracy. We teach kids to use their 'laces' (top of foot) rather than their toe because it's more powerful and accurate. The key techniques are: planting the non-kicking foot beside the ball, staying over the ball (not leaning back), and following through. At this age, technique matters more than power!",

        homeActivities: [
          "Target practice against a wall or rebounder",
          "Shoot at targets in the backyard (cones, buckets)",
          "Practice the striking motion without a ball (shadow practice)",
          "Weak foot challenge - 10 shots with each foot",
          "Watch pro players and notice their body position",
          "Penalty shootout games with family",
        ],

        bestAssessedIn: [
          "Shooting drills with goalkeeper",
          "1v1 to goal situations",
          "Small-sided games",
          "Finishing after passes",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across 2-3 sessions before rating",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // TACTICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Finding Space
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Finding Space",
      slug: "finding-space",
      description:
        "The ability to position oneself in open areas to receive the ball, create passing options, and contribute to team play.",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
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
        "Moves away from ball to create space",
        "Shows for ball in open areas",
        "Maintains team shape/width",
        "Checks shoulder to see space",
        "Makes runs at right moment",
      ],

      commonMistakes: [
        "Bee-swarming around ball",
        "Standing still when teammate has ball",
        "Hiding behind defenders",
        "Running away from ball when should show",
        "Bunching with teammates",
      ],

      coachingTips: [
        "'Find the grass!' - move to open spaces",
        "'Show for the ball!' - move where passer can see you",
        "'Spread out!' - maintain width",
        "'Check your shoulder!' - see where space is",
        "'Move to help!' - be an option for teammate",
      ],

      tags: ["core", "tactical", "fundamental", "movement", "positioning"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player follows the ball everywhere ('bee-swarming'). No concept of positioning or creating space.",
            observableBehaviors: [
              "Always near the ball",
              "Bunches with teammates",
              "No awareness of open areas",
              "Stands still or crowds ball",
              "Doesn't show for passes",
            ],
            commonMistakes: [
              "Running toward ball constantly",
              "Standing directly behind teammate with ball",
              "No movement off the ball",
              "Getting in teammate's way",
            ],
            coachingTips: [
              "Use 'zones' - assign players to areas",
              "Visual aids - 'stay in your color zone'",
              "Freeze games - show where space is",
              "Reward movement off ball, not just goals",
            ],
            assessmentActivities: [
              "4v4 games with zones",
              "Freeze tag observation",
              "Keep-away with focus on movement",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to spread out with reminders. Sometimes finds space but inconsistent. Starting to understand concept.",
            observableBehaviors: [
              "Spreads out when told",
              "Occasionally finds open space",
              "Sometimes shows for ball",
              "Understands 'space' concept",
              "Still drawn to ball often",
            ],
            commonMistakes: [
              "Forgets to maintain position",
              "Only moves when reminded",
              "Hides when pressure is high",
              "Movement is late",
            ],
            coachingTips: [
              "Constant reminders initially",
              "Highlight good movement - 'Great find!'",
              "Simple patterns - 'when ball is here, you're here'",
              "Small-sided games to practice",
            ],
            assessmentActivities: [
              "3v3 with end zones",
              "Passing patterns with movement",
              "Coach observes during scrimmages",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Consistently finds open space. Shows for the ball. Understands width and depth in basic terms.",
            observableBehaviors: [
              "Regularly finds open areas",
              "Shows for ball appropriately",
              "Maintains team width",
              "Moves to support teammate",
              "Checks shoulder occasionally",
            ],
            commonMistakes: [
              "Timing of runs can be off",
              "Doesn't always see best option",
              "Under pressure may revert to bunching",
              "Movement predictable",
            ],
            coachingTips: [
              "Add tactical concepts - 'third man runs'",
              "Work on timing of movement",
              "Introduce checking runs",
              "Show video examples",
            ],
            assessmentActivities: [
              "Positional games (5v5 keep-away)",
              "Small-sided games with shape focus",
              "3v2 attacking exercises",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Creates space through intelligent movement. Times runs well. Reads game situations to find opportunities.",
            observableBehaviors: [
              "Creates space for self and others",
              "Well-timed runs",
              "Reads game situations",
              "Moves to receive in dangerous areas",
              "Combines positioning with teammates",
            ],
            commonMistakes: [
              "Occasionally makes run too early/late",
              "May be unmarked but not noticed by passer",
              "Could communicate more",
            ],
            coachingTips: [
              "Refine timing through repetition",
              "Communication focus",
              "Position-specific movement",
              "Game analysis - watch and discuss",
            ],
            assessmentActivities: [
              "Full-sided games",
              "Attacking patterns",
              "Phase of play exercises",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Manipulates space intelligently. Creates options for teammates. Advanced tactical understanding.",
            observableBehaviors: [
              "Manipulates defenders with movement",
              "Creates space for others",
              "Anticipates play development",
              "Always an option",
              "Organizes teammates' positioning",
            ],
            commonMistakes: [
              "May see space others don't recognize",
              "Could be frustrated when teammates don't find them",
            ],
            coachingTips: [
              "Leadership - help organize others",
              "Advanced tactical concepts",
              "Decision-making refinement",
              "Mental models of play",
            ],
            assessmentActivities: [
              "Full match observation",
              "Tactical discussions",
              "Complex attacking patterns",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "'Bee-swarming' is completely normal at this age! Children are naturally drawn to the ball. Gently remind them to 'find grass' and celebrate when they spread out. Don't expect tactical awareness - focus on fun.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players can now understand and apply concepts of space. Use visual aids and designated zones. This is when real positional understanding begins to develop.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect intelligent movement off the ball. Focus on timing of runs and reading the game. Players should be creating space for themselves and others.",
          },
        },

        redFlags: [
          "No improvement in spacing awareness after extended time",
          "Persistent avoidance of open positions (hiding)",
          "Cannot understand simple positional concepts",
          "Social anxiety affecting positioning",
          "Significantly behind peers in game awareness",
        ],

        parentExplanation:
          "Finding space is about positioning yourself where you can receive the ball. At young ages, kids naturally swarm around the ball like bees - this is totally normal! We're teaching them to 'find the grass' (stand in open spaces) so they can receive passes. This tactical awareness develops gradually. You can help by pointing out space during games on TV - 'see how that player moved to the open area?'",

        homeActivities: [
          "Watch professional soccer and spot players finding space",
          "Play keep-away games in the backyard",
          "Discussion: 'Where should you stand to receive a pass?'",
          "Small-sided games with friends (3v3)",
          "Movement games (not soccer-specific) that require spatial awareness",
          "Tag games that teach moving to open areas",
        ],

        bestAssessedIn: [
          "Small-sided games (3v3, 4v4)",
          "Keep-away/possession games",
          "Full matches",
          "Positional exercises",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across 2-3 sessions in game situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Support Play
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Support Play",
      slug: "support-play",
      description:
        "The ability to provide passing options and help for the teammate with the ball through positioning, communication, and movement.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: 1v1 Defending
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "1v1 Defending",
      slug: "1v1-defending",
      description:
        "The ability to stop an attacker in individual situations through proper positioning, patience, and tackling technique.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
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

    // ═══════════════════════════════════════════════════════════════════════════
    // PHYSICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Agility & Coordination
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Agility & Coordination",
      slug: "agility-coordination",
      description:
        "The ability to change direction quickly, maintain balance, and coordinate multiple body parts effectively during movement.",
      introductionAge: 4,
      assessmentMethod: "observation" as const,
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

      tags: ["core", "physical", "fundamental", "agility", "coordination", "movement"],

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
            commonMistakes: [
              "Could coast on natural ability",
            ],
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Speed
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Speed",
      slug: "speed",
      description:
        "The ability to move quickly over short distances, including acceleration, top speed, and speed with the ball.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "May rely too heavily on speed",
            ],
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

    // ═══════════════════════════════════════════════════════════════════════════
    // PSYCHOLOGICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Confidence
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Confidence",
      slug: "confidence",
      description:
        "The belief in one's own abilities to perform skills, take on challenges, and recover from mistakes during play.",
      introductionAge: 4,
      assessmentMethod: "observation" as const,
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Resilience
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Resilience",
      slug: "resilience",
      description:
        "The ability to recover from setbacks, handle adversity, and persist through challenges in sport and competition.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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

      tags: ["core", "psychological", "fundamental", "resilience", "mental", "grit"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player gives up immediately when facing difficulty. Cannot regulate emotions after setbacks.",
            observableBehaviors: [
              "Stops trying after mistakes",
              "Overwhelmed by failure",
              "Cries or shuts down easily",
              "Cannot continue after setback",
              "Extreme emotional reactions",
            ],
            commonMistakes: [
              "Quitting activities mid-way",
              "Blaming others or equipment",
              "Refusing to continue",
              "Meltdowns after small problems",
            ],
            coachingTips: [
              "Create safe, supportive environment",
              "Reduce pressure significantly",
              "Build coping strategies slowly",
              "Celebrate any persistence",
              "Don't force continuation - offer choice",
            ],
            assessmentActivities: [
              "Observation during challenging activities",
              "Response to losing games",
              "Recovery from mistakes",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can recover from setbacks with support. Still struggles with bigger disappointments but improving.",
            observableBehaviors: [
              "Recovers with encouragement",
              "Improving emotional control",
              "Sometimes continues independently",
              "Still affected by losing",
              "Shows moments of persistence",
            ],
            commonMistakes: [
              "Needs coach to re-engage",
              "Still has meltdown moments",
              "Struggles with unfairness",
              "Recovers but takes time",
            ],
            coachingTips: [
              "Teach simple coping strategies",
              "Celebrate recovery - 'Great job keeping going!'",
              "Normalize setbacks for everyone",
              "Gradually reduce support",
            ],
            assessmentActivities: [
              "Response to challenging drills",
              "Reaction to losing games",
              "Recovery observation",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Handles most setbacks appropriately. Recovers in reasonable time. Learning to manage emotions effectively.",
            observableBehaviors: [
              "Continues after most mistakes",
              "Recovers reasonably quickly",
              "Managing emotions better",
              "Shows good effort when losing",
              "Occasional struggles in big moments",
            ],
            commonMistakes: [
              "Big losses still difficult",
              "May need reminder to refocus",
              "Unfairness hard to handle",
              "End of season/tournament pressure",
            ],
            coachingTips: [
              "Introduce more challenging scenarios",
              "Teach mental strategies",
              "Discuss handling pressure",
              "Build on good foundation",
            ],
            assessmentActivities: [
              "Performance in losing situations",
              "Response to pressure",
              "Long-term observation",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Bounces back quickly from setbacks. Uses adversity as motivation. Good emotional regulation.",
            observableBehaviors: [
              "Quick recovery from setbacks",
              "Uses failure as fuel",
              "Strong emotional control",
              "Leads by example",
              "Stays positive in adversity",
            ],
            commonMistakes: [
              "May suppress emotions too much",
              "Could help teammates more",
            ],
            coachingTips: [
              "Leadership development",
              "Help support struggling teammates",
              "Maintain through increased pressure",
              "Healthy emotional expression",
            ],
            assessmentActivities: [
              "Pressure situations",
              "Response to significant setbacks",
              "Team observation",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Thrives in adversity. Inspires teammates during difficult moments. Exceptional emotional intelligence.",
            observableBehaviors: [
              "Best in difficult moments",
              "Inspires teammates",
              "Exceptional composure",
              "Seeks out challenges",
              "Positive team influence",
            ],
            commonMistakes: [
              "May set too high standards for others",
            ],
            coachingTips: [
              "Leadership role",
              "Help others develop",
              "Maintain healthy perspective",
              "Balance with enjoyment",
            ],
            assessmentActivities: [
              "Pressure situations",
              "Team leadership observation",
              "Long-term pattern",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Emotional regulation is still developing. Meltdowns are normal! Focus on creating safe environment and simple coping strategies. Don't expect adult-level composure.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Resilience should be growing. Teach coping strategies and reframing. Winning/losing becoming more significant - help maintain perspective.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect reasonable emotional control. Social pressure affects resilience. Create supportive team culture. Address struggles individually.",
          },
        },

        redFlags: [
          "Persistent extreme emotional reactions",
          "Complete inability to continue after any setback",
          "Self-harm or self-destructive responses",
          "No improvement despite support",
          "Signs of anxiety or depression",
        ],

        parentExplanation:
          "Resilience is the ability to bounce back from setbacks - missed shots, lost games, mistakes. It's one of the most valuable life skills sports can teach. We help build resilience by normalizing mistakes ('everyone misses sometimes'), teaching coping strategies, and celebrating persistence. At home, how you respond to their struggles matters hugely - focus on effort and improvement, not results!",

        homeActivities: [
          "Model resilience - let them see you handle setbacks",
          "Discuss 'what can we learn from this?' after disappointments",
          "Share stories of athletes who overcame adversity",
          "Avoid rescuing them from every difficulty",
          "Celebrate persistence: 'I'm proud you kept trying'",
          "Don't dismiss emotions - acknowledge then redirect",
        ],

        bestAssessedIn: [
          "Challenging game situations",
          "Response to mistakes in practice",
          "Losing situations",
          "Long-term observation",
        ],
        assessmentFrequency: "Ongoing observation throughout season",
        assessmentDuration: "Builds picture over multiple sessions",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Teamwork
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: soccer.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Teamwork",
      slug: "teamwork",
      description:
        "The ability to work cooperatively with teammates, communicate effectively, and prioritize team success over individual achievement.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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

      tags: ["core", "psychological", "fundamental", "teamwork", "social", "cooperation"],

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
            commonMistakes: [
              "May need to be more assertive sometimes",
            ],
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
  ];

  // Insert skills
  for (const skill of comprehensiveSkills) {
    try {
      await getDb()
        .insert(skills)
        .values(skill)
        .onConflictDoNothing();
      console.log(`  ✓ ${skill.name}`);
    } catch (error) {
      console.error(`  ✗ ${skill.name}:`, error);
    }
  }

  console.log(`\nSeeded ${comprehensiveSkills.length} comprehensive soccer skills\n`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedSoccerSkills()
    .then(() => {
      console.log("Soccer skills seeding complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

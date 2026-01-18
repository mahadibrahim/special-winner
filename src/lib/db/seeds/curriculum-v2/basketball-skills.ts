/**
 * Comprehensive Basketball Skills - Assessment Guides
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
 * TECHNICAL: Ball Handling, Passing, Catching, Shooting (Layups), Shooting (Jump Shot)
 * TACTICAL: Court Spacing, Help Defense, Transition Play
 * PHYSICAL: Agility/Footwork, Vertical Jump
 * PSYCHOLOGICAL: Confidence, Coachability, Team Communication
 */

import { db } from "../../index";
import { skills, skillDomains, developmentStages } from "../../schema/curriculum";
import { sports } from "../../schema/sports";
import { eq } from "drizzle-orm";

export async function seedBasketballSkills() {
  console.log("Seeding comprehensive basketball skills with assessment guides...");

  // Get required references
  const [basketball] = await db.select().from(sports).where(eq(sports.slug, "basketball"));
  if (!basketball) throw new Error("Basketball sport must be seeded first");

  const domains = await db.select().from(skillDomains);
  const stages = await db.select().from(developmentStages);

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
    // SKILL: Ball Handling
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Ball Handling",
      slug: "ball-handling",
      description:
        "The ability to control and maneuver the basketball while dribbling, including stationary dribbling, moving with the ball, and protecting it from defenders.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 1,

      progressionLevels: {
        1: "Loses ball frequently; watches ball while dribbling; can only use dominant hand",
        2: "Can dribble stationary with dominant hand; some control while walking; loses ball under pressure",
        3: "Dribbles while jogging; beginning to use weak hand; can change direction with ball",
        4: "Controls ball at speed; uses both hands effectively; protects ball from defenders",
        5: "Elite ball control; creative moves; handles pressure with ease; ambidextrous",
      },

      observableBehaviors: [
        "Dribbles with fingertips, not palm",
        "Keeps head up while dribbling",
        "Can dribble with either hand",
        "Protects ball with body",
        "Changes speed and direction while dribbling",
      ],

      commonMistakes: [
        "Slapping ball with palm",
        "Looking down at ball constantly",
        "Only using dominant hand",
        "Dribbling too high",
        "Carrying/palming the ball",
      ],

      coachingTips: [
        "'Pound the ball!' - push down with force",
        "'Fingertip control' - feel the ball with your fingers",
        "'Eyes up!' - see the court, not the ball",
        "'Low and tight!' - keep dribble below waist",
        "'Weak hand work!' - practice with both hands equally",
      ],

      tags: ["core", "technical", "fundamental", "ball-handling", "dribbling"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is learning basic ball control. Ball frequently escapes and player must watch the ball constantly.",
            observableBehaviors: [
              "Ball bounces away frequently",
              "Eyes glued to ball",
              "Only uses one hand",
              "Cannot move while dribbling",
              "Slaps at ball with palm",
            ],
            commonMistakes: [
              "Palm dribbling instead of fingertips",
              "Standing straight up while dribbling",
              "Dribbling too far from body",
              "Giving up when ball escapes",
            ],
            coachingTips: [
              "Start stationary - 'Can you bounce the ball 10 times?'",
              "Use 'fingertip tickle' cue - fingers spread on ball",
              "Have them sit and dribble to focus on hand technique",
              "Celebrate consecutive dribbles - build confidence",
            ],
            assessmentActivities: [
              "Stationary dribbling count (30 seconds)",
              "Dribble in place while coach counts",
              "Ball slaps and pounds drill",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can maintain a stationary dribble with dominant hand. Beginning to move slowly while dribbling.",
            observableBehaviors: [
              "Stationary dribble more consistent",
              "Can walk slowly while dribbling",
              "Still prefers dominant hand",
              "Occasionally looks up",
              "Loses ball when pressured",
            ],
            commonMistakes: [
              "Reverts to palm when tired",
              "Stops to look up",
              "Dribble gets high when moving",
              "Weak hand very inconsistent",
            ],
            coachingTips: [
              "Introduce walking dribble with targets to look at",
              "Weak hand stationary practice daily",
              "'Waist high' cue - keep ball low",
              "Simple cone weaving at walking pace",
            ],
            assessmentActivities: [
              "Dribble to cone and back (10 yards)",
              "Weak hand stationary dribbling (20 seconds)",
              "Walk and look up challenge",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Dribbles confidently while moving. Uses weak hand in practice. Can change direction without losing ball.",
            observableBehaviors: [
              "Jogs while dribbling with control",
              "Uses weak hand when required",
              "Changes direction successfully",
              "Head up more often",
              "Beginning to protect ball",
            ],
            commonMistakes: [
              "Weak hand still significantly weaker",
              "Loses ball at full speed",
              "Basic moves only",
              "Struggles under defensive pressure",
            ],
            coachingTips: [
              "Add defensive pressure (passive then active)",
              "Introduce crossover move",
              "Speed dribble drills",
              "Weak hand in games - challenges",
            ],
            assessmentActivities: [
              "Cone dribbling at jogging pace",
              "1v1 dribble keep-away",
              "Crossover drill",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Strong ball handler who can use both hands effectively. Protects ball well and handles pressure.",
            observableBehaviors: [
              "Both hands nearly equal",
              "Controls ball at speed",
              "Multiple moves available",
              "Protects ball from defenders",
              "Head up consistently",
            ],
            commonMistakes: [
              "May over-dribble in games",
              "Occasionally predictable",
              "Could be flashier than effective",
            ],
            coachingTips: [
              "Decision-making - when to dribble vs pass",
              "Advanced moves (hesitation, behind back)",
              "Finishing through contact",
              "Game situation dribbling",
            ],
            assessmentActivities: [
              "1v1 to basket",
              "Full court dribbling with pressure",
              "Game observation",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite ball handler. Creative, unpredictable, and virtually impossible to dispossess.",
            observableBehaviors: [
              "Ambidextrous - no weak hand",
              "Creative moves in traffic",
              "Creates for self and others",
              "Handles full-court pressure",
              "Makes difficult look easy",
            ],
            commonMistakes: [
              "May try too much at times",
            ],
            coachingTips: [
              "Continue challenging with constraints",
              "Leadership in ball-handling drills",
              "Teach others",
              "Maintain through competition",
            ],
            assessmentActivities: [
              "High-pressure 1v1",
              "Full game observation",
              "Creative challenge drills",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Focus on having fun with the ball. Lots of touches! Don't worry about perfect form - develop comfort and confidence with the ball. This is the best age to build 'feel' for dribbling.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Emphasize weak hand development - this is the critical window! Players should be working both hands equally. Introduce basic moves like crossover.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect confident ball handling with both hands. Focus on handling under pressure and game-speed moves. Decision-making becomes key.",
          },
        },

        redFlags: [
          "Cannot maintain any dribble after extended practice",
          "Significant coordination issues",
          "Fear or avoidance of ball handling activities",
          "No improvement over several months",
          "Physical limitations affecting grip or control",
        ],

        parentExplanation:
          "Ball handling is the foundation of basketball - the ability to dribble while moving and protecting the ball. We teach 'fingertip control' (not slapping with the palm) and keeping eyes up to see the court. The most important thing at this age is developing BOTH hands equally. At home, encourage dribbling with the weak hand as much as the strong hand!",

        homeActivities: [
          "Dribble while watching TV (switch hands during commercials)",
          "Weak hand challenge - brush teeth, eat with weak hand to build coordination",
          "Dribble tag with siblings",
          "Ball handling routine (many free videos on YouTube)",
          "Dribble to the mailbox and back",
          "Figure-8 through legs (stationary first)",
        ],

        bestAssessedIn: [
          "Ball handling drills",
          "1v1 situations",
          "Full court activities",
          "Game observation",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across 2-3 sessions",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Passing
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Passing",
      slug: "passing-basketball",
      description:
        "The ability to accurately deliver the ball to teammates using chest passes, bounce passes, and overhead passes.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "May try too flashy at times",
            ],
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Catching
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Catching",
      slug: "catching-basketball",
      description:
        "The ability to receive passes cleanly with proper hand positioning, including catching while stationary and on the move.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "May expect passes others can't make",
            ],
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Shooting (Layups)
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Shooting (Layups)",
      slug: "shooting-layups",
      description:
        "The ability to score close to the basket using proper footwork, hand position, and finishing technique.",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
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

      tags: ["core", "technical", "fundamental", "shooting", "layup", "finishing"],

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
            commonMistakes: [
              "May over-complicate at times",
            ],
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Shooting (Jump Shot)
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Shooting (Jump Shot)",
      slug: "shooting-jump-shot",
      description:
        "The ability to shoot the basketball with proper form including footwork, hand position, and follow-through.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "May over-shoot when other options better",
            ],
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

    // ═══════════════════════════════════════════════════════════════════════════
    // TACTICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Court Spacing
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Court Spacing",
      slug: "court-spacing",
      description:
        "The ability to position oneself appropriately on offense to create passing lanes, driving lanes, and scoring opportunities.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 10,

      progressionLevels: {
        1: "Bunches with teammates; follows ball; doesn't understand spacing",
        2: "Beginning to spread out with reminders; understands concept but forgets",
        3: "Maintains spacing in half-court; moves to fill empty spots",
        4: "Excellent spacing; creates driving lanes; relocates after passes",
        5: "Elite court awareness; manipulates defense with positioning; organizes teammates",
      },

      observableBehaviors: [
        "Maintains appropriate distance from teammates",
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
              "Maintains good spacing in half-court sets. Moves to fill empty spots consistently.",
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
            commonMistakes: [
              "May be frustrated with less aware teammates",
            ],
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Help Defense
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Help Defense",
      slug: "help-defense",
      description:
        "The ability to provide defensive support for teammates, including positioning to help and recover, and protecting the basket.",
      introductionAge: 8,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 11,

      progressionLevels: {
        1: "Only guards own player; no help concept; watches ball without moving",
        2: "Beginning to help but late; forgets assigned player; doesn't recover",
        3: "Provides timely help; recovers to own player; understands rotation",
        4: "Excellent help defender; reads when help needed; vocal communicator",
        5: "Elite help defense; anchors team defense; organizes rotations",
      },

      observableBehaviors: [
        "Sees ball and own player simultaneously",
        "Slides to help position when ball penetrates",
        "Recovers to own player after helping",
        "Communicates help and switches",
        "Takes charges when appropriate",
      ],

      commonMistakes: [
        "Standing straight up on own player",
        "Not seeing ball when off-ball",
        "Helping too late",
        "Not recovering after helping",
        "Over-helping (leaving shooter open)",
      ],

      coachingTips: [
        "'See ball, see man!' - positioning mantra",
        "'Jump to the ball!' - move when ball moves",
        "'Help and recover!' - don't abandon your player",
        "'Talk!' - communication is key",
        "'Shrink the floor!' - compress when ball penetrates",
      ],

      tags: ["core", "tactical", "fundamental", "defense", "help-defense"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player only focuses on their assigned player. No concept of team defense or helping.",
            observableBehaviors: [
              "Guards only own player",
              "No awareness of teammates",
              "Doesn't see ball off-ball",
              "No help provided",
              "Watches penetration happen",
            ],
            commonMistakes: [
              "Ball-watching without helping",
              "Standing next to player, back to ball",
              "No communication",
              "Not moving when ball moves",
            ],
            coachingTips: [
              "'Point to ball, point to man!'",
              "Shell drill basics",
              "Show help position visually",
              "Freeze play and demonstrate",
            ],
            assessmentActivities: [
              "Shell drill positioning",
              "Point to ball/man drill",
              "Simple help concepts",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Understanding help concepts but execution is late. Forgets about own player when helping.",
            observableBehaviors: [
              "Helps but late",
              "Understands concept",
              "Forgets own player",
              "Doesn't recover well",
              "Improving awareness",
            ],
            commonMistakes: [
              "Helps after drive is past",
              "Leaves shooter wide open",
              "No recovery",
              "Forgets to communicate",
            ],
            coachingTips: [
              "'Early help!' - anticipate",
              "Recovery sprints practice",
              "Communication emphasis",
              "Closeout practice",
            ],
            assessmentActivities: [
              "Help and recover drill",
              "Shell drill with drives",
              "Game observation",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Provides timely help. Recovers to own player. Understands basic rotation.",
            observableBehaviors: [
              "Timely help",
              "Recovers to player",
              "Understands rotation",
              "Good positioning",
              "Communicates some",
            ],
            commonMistakes: [
              "Complex rotations challenging",
              "May over-help",
              "Communication inconsistent",
              "Help position could be better",
            ],
            coachingTips: [
              "Advanced rotation concepts",
              "Communication emphasis",
              "Reading when to help vs stay",
              "Help positioning refinement",
            ],
            assessmentActivities: [
              "Shell drill with rotations",
              "5v5 defense",
              "Game observation",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Excellent help defender. Reads when help is needed. Strong communicator.",
            observableBehaviors: [
              "Excellent reads",
              "Timely help and recovery",
              "Strong communicator",
              "Takes charges",
              "Organizes teammates",
            ],
            commonMistakes: [
              "May help too much",
              "Expects others to rotate",
            ],
            coachingTips: [
              "Leadership development",
              "Advanced help concepts",
              "Organizing team defense",
              "Film study",
            ],
            assessmentActivities: [
              "Full game observation",
              "Defensive film review",
              "Scrimmage leadership",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite help defender who anchors team defense. Organizes all rotations.",
            observableBehaviors: [
              "Anchors defense",
              "Organizes rotations",
              "Elite communication",
              "Reads plays before they happen",
              "Makes others better defenders",
            ],
            commonMistakes: [
              "May be frustrated with less aware teammates",
            ],
            coachingTips: [
              "Leadership role",
              "Teaching others",
              "Maintaining standard",
              "Advanced concepts",
            ],
            assessmentActivities: [
              "Full game observation",
              "Defensive impact",
              "Team defense leadership",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1",
            notes:
              "Help defense is an advanced concept. At this age, focus on guarding your own player. Don't expect help concepts - introduce the idea simply but don't stress execution.",
          },
          ages9to11: {
            typicalLevel: "1-2",
            notes:
              "Begin teaching 'see ball, see man' positioning. Shell drill introduction. Help concepts emerging but execution will be inconsistent.",
          },
          ages12to14: {
            typicalLevel: "2-3",
            notes:
              "Help defense should be developing. Rotations becoming understood. Communication is key focus. This is when team defense really develops.",
          },
        },

        redFlags: [
          "Cannot understand basic help concepts by age 11-12",
          "Refuses to help teammates",
          "Consistently out of position despite instruction",
          "No defensive communication",
        ],

        parentExplanation:
          "Help defense is about supporting teammates on defense. Instead of only guarding your own player, you position yourself to help if someone gets beat. The phrase is 'see ball, see man' - always know where both are. Good help defenders communicate constantly and 'shrink' toward the ball when it penetrates. This is team defense!",

        homeActivities: [
          "Watch basketball and notice help defense",
          "Discuss 'who should help?' scenarios",
          "Practice defensive stance at home",
          "Communication games (constant talking)",
        ],

        bestAssessedIn: [
          "Shell drill",
          "5v5 defensive situations",
          "Scrimmages",
          "Games",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across defensive possessions",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Transition Play
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Transition Play",
      slug: "transition-play",
      description:
        "The ability to quickly change from offense to defense and defense to offense, including fast break awareness and getting back on defense.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "May expect others to match intensity",
            ],
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

    // ═══════════════════════════════════════════════════════════════════════════
    // PHYSICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Agility/Footwork
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Agility / Footwork",
      slug: "agility-footwork",
      description:
        "The ability to move quickly and efficiently on the basketball court, including defensive slides, pivoting, and change of direction.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "None significant",
            ],
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Vertical Jump
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Vertical Jump",
      slug: "vertical-jump",
      description:
        "The ability to jump explosively for rebounds, blocks, and finishing at the rim.",
      introductionAge: 6,
      assessmentMethod: "test" as const,
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
            commonMistakes: [
              "May attempt too much with ability",
            ],
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

    // ═══════════════════════════════════════════════════════════════════════════
    // PSYCHOLOGICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Confidence
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Confidence",
      slug: "confidence-basketball",
      description:
        "The belief in one's own abilities to perform basketball skills, take shots, and compete effectively.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 30,

      progressionLevels: {
        1: "Hesitant; avoids ball/shots; gives up easily; needs constant encouragement",
        2: "Will try with support; affected by misses; inconsistent confidence",
        3: "Takes shots willingly; recovers from misses; generally positive",
        4: "Confident in abilities; resilient; takes big shots; believes in self",
        5: "Supreme confidence; inspires others; wants ball in clutch; unshakeable",
      },

      observableBehaviors: [
        "Takes open shots without hesitation",
        "Wants the ball in pressure situations",
        "Recovers quickly from mistakes",
        "Positive body language",
        "Encourages teammates",
      ],

      commonMistakes: [
        "Passing up open shots",
        "Giving up after misses",
        "Negative self-talk",
        "Hiding from the ball",
        "Afraid to make mistakes",
      ],

      coachingTips: [
        "'Shoot it!' - encourage shot-taking",
        "'Next play!' - move past mistakes quickly",
        "'You can do it!' - genuine encouragement",
        "'Great effort!' - praise the try",
        "'I believe in you!' - express confidence",
      ],

      tags: ["core", "psychological", "fundamental", "confidence", "mental"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is hesitant to participate fully. Avoids shooting and challenging situations.",
            observableBehaviors: [
              "Avoids shooting",
              "Passes when should shoot",
              "Gives up after mistakes",
              "Negative body language",
              "Needs constant encouragement",
            ],
            commonMistakes: [
              "Saying 'I can't'",
              "Hiding on court",
              "Refusing to try",
              "Shutting down after errors",
            ],
            coachingTips: [
              "Build relationship first",
              "Start with easy successes",
              "Lots of encouragement",
              "Reduce pressure situations",
              "Celebrate small wins",
            ],
            assessmentActivities: [
              "Observation during activities",
              "Willingness to shoot",
              "Response to mistakes",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Will participate with encouragement. Still affected by mistakes but showing willingness.",
            observableBehaviors: [
              "Participates with support",
              "Sometimes takes shots",
              "Affected by misses",
              "Improving engagement",
              "Shows moments of confidence",
            ],
            commonMistakes: [
              "Confidence fluctuates",
              "Needs external validation",
              "Compares to others",
              "Still hesitant in pressure",
            ],
            coachingTips: [
              "Build on successes",
              "Reduce fear of failure",
              "Growth mindset teaching",
              "Safe environment creation",
            ],
            assessmentActivities: [
              "Shot-taking willingness",
              "Response to misses",
              "Pressure situation behavior",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Generally confident player who takes shots and recovers from mistakes reasonably well.",
            observableBehaviors: [
              "Takes open shots",
              "Recovers from misses",
              "Generally positive",
              "Participates fully",
              "Occasional hesitation",
            ],
            commonMistakes: [
              "Confidence dips in new situations",
              "Affected by peer reactions",
              "May avoid very hard challenges",
              "Inconsistent in pressure",
            ],
            coachingTips: [
              "Challenge with harder situations",
              "Build self-talk strategies",
              "Normalize struggle",
              "Increase pressure gradually",
            ],
            assessmentActivities: [
              "Pressure situations",
              "End-of-game scenarios",
              "Response to adversity",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Confident player who takes big shots, is resilient, and believes in their abilities.",
            observableBehaviors: [
              "Takes big shots",
              "Quick recovery from misses",
              "Positive self-talk",
              "Wants ball in pressure",
              "Helps teammates' confidence",
            ],
            commonMistakes: [
              "May become over-confident",
              "Could take bad shots",
            ],
            coachingTips: [
              "Channel confidence positively",
              "Leadership opportunities",
              "Balance confidence with smart play",
              "Use as role model",
            ],
            assessmentActivities: [
              "Clutch situations",
              "Leadership observation",
              "Response to failure",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Supreme confidence that inspires teammates. Wants the ball in clutch situations. Unshakeable.",
            observableBehaviors: [
              "Exceptional self-belief",
              "Inspires teammates",
              "Clutch performer",
              "Seeks pressure moments",
              "Positive team influence",
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
              "Pressure performance",
              "Team leadership impact",
              "Long-term observation",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Confidence varies hugely. Some are naturally bold, others hesitant. Focus on fun and safety. Never embarrass or call out mistakes publicly.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Confidence becomes more stable but social comparison increases. Build self-efficacy through achievable challenges.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Social awareness peaks. Create supportive team culture. Performance pressure increases - help manage it.",
          },
        },

        redFlags: [
          "Severe anxiety affecting participation",
          "Complete withdrawal from activities",
          "Excessive negative self-talk",
          "Signs of deeper emotional issues",
        ],

        parentExplanation:
          "Confidence affects everything in basketball - whether a player shoots, how they handle mistakes, and how they compete. We build confidence through achievable challenges, celebrating effort, and creating a safe environment. The most important thing you can do: focus on effort and enjoyment at home, not results!",

        homeActivities: [
          "Celebrate effort, not just makes",
          "Focus on what they enjoyed",
          "Share your own stories of failure and growth",
          "Avoid comparison to siblings/peers",
          "Focus on growth: 'You're getting better at...'",
        ],

        bestAssessedIn: [
          "Shooting situations",
          "Response to mistakes",
          "Pressure moments",
          "General observation",
        ],
        assessmentFrequency: "Ongoing observation throughout season",
        assessmentDuration: "Builds picture over multiple sessions",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Coachability
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Coachability",
      slug: "coachability",
      description:
        "The willingness and ability to receive instruction, accept feedback, and apply corrections to improve performance.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "May be too hard on self",
            ],
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

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Team Communication
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: basketball.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Team Communication",
      slug: "team-communication",
      description:
        "The ability to communicate effectively with teammates during play, including calling screens, switches, and encouragement.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
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
            commonMistakes: [
              "Others may rely on them too much",
            ],
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

  // Insert skills
  for (const skill of comprehensiveSkills) {
    try {
      await db
        .insert(skills)
        .values(skill)
        .onConflictDoNothing();
      console.log(`  ✓ ${skill.name}`);
    } catch (error) {
      console.error(`  ✗ ${skill.name}:`, error);
    }
  }

  console.log(`\nSeeded ${comprehensiveSkills.length} comprehensive basketball skills\n`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedBasketballSkills()
    .then(() => {
      console.log("Basketball skills seeding complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

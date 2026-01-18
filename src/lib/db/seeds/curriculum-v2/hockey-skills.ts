/**
 * Comprehensive Hockey Skills - Assessment Guides
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
 * TECHNICAL: Skating (Forward), Skating (Backward), Puck Control, Passing, Shooting (Wrist), Shooting (Slap)
 * TACTICAL: Positioning, Defensive Play, Transition/Breakout
 * PHYSICAL: Edge Work/Balance, Speed/Acceleration
 * PSYCHOLOGICAL: Confidence, Hockey IQ, Competitiveness
 */

import { db } from "../../index";
import { skills, skillDomains, developmentStages } from "../../schema/curriculum";
import { sports } from "../../schema/sports";
import { eq } from "drizzle-orm";

export async function seedHockeySkills() {
  console.log("Seeding comprehensive hockey skills with assessment guides...");

  // Get required references
  const [hockey] = await db.select().from(sports).where(eq(sports.slug, "hockey"));
  if (!hockey) throw new Error("Hockey sport must be seeded first");

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
    // SKILL: Skating (Forward)
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Skating (Forward)",
      slug: "skating-forward",
      description:
        "The ability to skate forward with proper technique, including stride, balance, and speed. The foundation of all hockey movement.",
      introductionAge: 4,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 1,

      progressionLevels: {
        1: "Struggles to stay upright; short choppy strides; looks at feet; falls frequently",
        2: "Can skate forward slowly; developing stride; some balance; still cautious",
        3: "Confident forward skating; good stride length; maintains speed; can stop",
        4: "Powerful stride; excellent balance; quick acceleration; efficient technique",
        5: "Elite skating; explosive speed; effortless technique; skating is a weapon",
      },

      observableBehaviors: [
        "Full leg extension on each stride",
        "Knees bent in athletic position",
        "Head up, not looking at feet",
        "Arms swing naturally for balance",
        "Recovers skate under body quickly",
      ],

      commonMistakes: [
        "Short choppy strides (not extending)",
        "Skating too upright (not bending knees)",
        "Looking down at feet/puck",
        "Arms not helping with balance",
        "Dragging toe on recovery",
      ],

      coachingTips: [
        "'Push and glide!' - full extension before recovery",
        "'Bend your knees!' - sit into your skating",
        "'Head up!' - see the ice, not your feet",
        "'Nose over toes!' - proper body position",
        "'Quick feet!' - fast recovery under body",
      ],

      tags: ["core", "technical", "fundamental", "skating", "movement"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player struggles to maintain balance on skates. Short, choppy strides with frequent falls.",
            observableBehaviors: [
              "Falls frequently",
              "Very short strides",
              "Looks at feet constantly",
              "Grabs boards for support",
              "Hesitant and slow",
            ],
            commonMistakes: [
              "Walking instead of gliding",
              "Feet too close together",
              "Standing straight up",
              "Arms flailing for balance",
            ],
            coachingTips: [
              "Start with balance exercises off-ice",
              "Use cones or markers for support initially",
              "March in place, then add glide",
              "Celebrate staying upright!",
              "Make falling okay - everyone falls",
            ],
            assessmentActivities: [
              "Skate width of ice slowly",
              "Glide on two feet for 5 seconds",
              "Get up from fall independently",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can skate forward at slow pace. Stride developing but still short. Balance improving.",
            observableBehaviors: [
              "Skates slowly but upright",
              "Stride lengthening",
              "Falls less frequently",
              "Some knee bend",
              "Gaining confidence",
            ],
            commonMistakes: [
              "Still not full extension",
              "Looks down often",
              "Speed inconsistent",
              "Stops using boards",
            ],
            coachingTips: [
              "Focus on 'push all the way'",
              "Increase distance of skating",
              "Add simple stops (snowplow)",
              "Use targets to look at",
            ],
            assessmentActivities: [
              "Skate full length of ice",
              "Snowplow stop",
              "Glide on one foot (3 seconds)",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Confident forward skating with good stride. Can maintain speed and stop effectively.",
            observableBehaviors: [
              "Good stride length",
              "Maintains speed",
              "Effective stops",
              "Head up more",
              "Confident on ice",
            ],
            commonMistakes: [
              "Could extend more",
              "Speed plateaus",
              "Crossovers developing",
              "Technique breaks at top speed",
            ],
            coachingTips: [
              "Add crossovers for turns",
              "Work on acceleration",
              "Skating with puck",
              "Hockey stop both sides",
            ],
            assessmentActivities: [
              "Timed skating drills",
              "Crossover practice",
              "Skating with puck",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Powerful, efficient skating with excellent technique. Quick acceleration and strong edges.",
            observableBehaviors: [
              "Powerful stride",
              "Quick acceleration",
              "Excellent balance",
              "Efficient technique",
              "Strong at speed",
            ],
            commonMistakes: [
              "May coast in games",
              "Could be more explosive",
            ],
            coachingTips: [
              "Maintain through fatigue",
              "Game-speed skating",
              "Skating under pressure",
              "Advanced edge work",
            ],
            assessmentActivities: [
              "Sprint skating tests",
              "Game observation",
              "Skating with contact",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite skating ability. Explosive speed, effortless technique. Skating is a competitive advantage.",
            observableBehaviors: [
              "Elite speed",
              "Effortless technique",
              "Explosive acceleration",
              "Skating is weapon",
              "Dominates with speed",
            ],
            commonMistakes: [
              "May rely too heavily on skating",
            ],
            coachingTips: [
              "Continue challenging",
              "Leadership in skating drills",
              "Help others develop",
              "Maintain through season",
            ],
            assessmentActivities: [
              "Elite speed tests",
              "Game dominance observation",
              "Competitive skating",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Skating is the hardest part of hockey to learn. Be patient! Focus on balance and having fun on the ice. Falls are normal and expected. Encourage time on any ice surface.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Skating should be improving significantly. This is the golden age for skating development. Lots of ice time helps most. Work on stride extension and crossovers.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect competent skating. Focus on power and speed development. Skating technique should be solid - work on explosiveness and game-speed skating.",
          },
        },

        redFlags: [
          "No improvement in balance after extended time on ice",
          "Fear of skating not decreasing",
          "Persistent falling without improvement",
          "Physical issues affecting skating ability",
          "Significant gap compared to peers after a full season",
        ],

        parentExplanation:
          "Skating is THE fundamental skill in hockey - everything else depends on it! We focus on 'push and glide' (full leg extension), knee bend, and keeping the head up. Skating takes years to develop, so patience is key. The best thing you can do: get your child on the ice as much as possible - public skating, pond hockey, any ice time helps!",

        homeActivities: [
          "Public skating sessions (most valuable!)",
          "Inline/roller skating for balance",
          "Balance board exercises",
          "Squat exercises for leg strength",
          "Watch hockey and notice skating technique",
          "Pond or outdoor rink time when available",
        ],

        bestAssessedIn: [
          "Skating drills",
          "Warm-up skating",
          "Game observation",
          "Sprint tests",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across multiple skating situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Skating (Backward)
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Skating (Backward)",
      slug: "skating-backward",
      description:
        "The ability to skate backward with control and speed, essential for defensive play and transitions.",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 2,

      progressionLevels: {
        1: "Cannot skate backward; loses balance immediately; resorts to turning around",
        2: "Can move backward slowly; limited control; uses C-cuts inconsistently",
        3: "Competent backward skating; good C-cuts; can transition forward/backward",
        4: "Quick backward skating; maintains gap on attackers; smooth transitions",
        5: "Elite backward skating; can defend any forward; seamless transitions",
      },

      observableBehaviors: [
        "Uses C-cuts to generate power",
        "Maintains athletic stance (knees bent)",
        "Head up, reading the play",
        "Smooth transitions both directions",
        "Can change direction while backward",
      ],

      commonMistakes: [
        "Standing too upright",
        "Looking over shoulder instead of swiveling head",
        "Crossing feet (losing balance)",
        "No power in C-cuts",
        "Turning around instead of skating backward",
      ],

      coachingTips: [
        "'C-cuts!' - push with inside edges",
        "'Stay low!' - bend those knees",
        "'Swivel your head!' - see both ways",
        "'Trust yourself!' - don't turn around",
        "'Quick feet!' - small powerful pushes",
      ],

      tags: ["core", "technical", "fundamental", "skating", "defense"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player cannot maintain backward movement. Loses balance immediately and turns around.",
            observableBehaviors: [
              "Falls when going backward",
              "Immediately turns around",
              "No control",
              "Fear of backward movement",
              "Cannot generate any power",
            ],
            commonMistakes: [
              "Standing straight up",
              "Looking at feet",
              "No C-cut attempt",
              "Crossing feet",
            ],
            coachingTips: [
              "Start at boards for support",
              "Basic C-cut from standstill",
              "Very short distances first",
              "Partner for support",
              "Build confidence gradually",
            ],
            assessmentActivities: [
              "C-cuts at boards",
              "Backward glide (supported)",
              "Any backward movement",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can move backward slowly with some control. C-cuts developing but inconsistent.",
            observableBehaviors: [
              "Moves backward slowly",
              "Some C-cut power",
              "Limited control",
              "More confidence",
              "Can stop backward",
            ],
            commonMistakes: [
              "Still turns around often",
              "C-cuts weak",
              "Cannot maintain speed",
              "Head position poor",
            ],
            coachingTips: [
              "Increase distance",
              "C-cut power focus",
              "Transitions introduction",
              "Defensive stance while backward",
            ],
            assessmentActivities: [
              "Backward skating blue line to blue line",
              "C-cut power drill",
              "Simple pivot",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Competent backward skating with good C-cuts. Can transition forward to backward smoothly.",
            observableBehaviors: [
              "Good backward speed",
              "Effective C-cuts",
              "Smooth transitions",
              "Maintains position",
              "Head up reading play",
            ],
            commonMistakes: [
              "Could be quicker",
              "Transitions need refinement",
              "Gap control developing",
              "May get caught flat-footed",
            ],
            coachingTips: [
              "Defensive gap control",
              "Quick transitions",
              "1v1 defending practice",
              "Reading attacker",
            ],
            assessmentActivities: [
              "Backward skating speed test",
              "Transition drills",
              "1v1 defending",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Quick backward skating with excellent gap control. Smooth transitions in game situations.",
            observableBehaviors: [
              "Quick backward skating",
              "Excellent gap control",
              "Seamless transitions",
              "Defends effectively",
              "Reads attackers well",
            ],
            commonMistakes: [
              "May get caught occasionally by elite speed",
              "Could anticipate more",
            ],
            coachingTips: [
              "Advanced defensive techniques",
              "Multiple attacker scenarios",
              "Game-speed defending",
              "Offensive zone starts backward",
            ],
            assessmentActivities: [
              "1v1 against fast forwards",
              "Game observation",
              "Defensive drills",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite backward skating. Can defend any forward. Transitions are seamless weapons.",
            observableBehaviors: [
              "Elite backward speed",
              "Defends anyone",
              "Perfect gap control",
              "Seamless transitions",
              "Skating is advantage",
            ],
            commonMistakes: [
              "May over-rely on skating",
            ],
            coachingTips: [
              "Continue challenging",
              "Leadership role",
              "Help others develop",
              "Maintain through season",
            ],
            assessmentActivities: [
              "Elite competition",
              "Game dominance",
              "Defensive statistics",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Backward skating is very challenging at young ages. Focus on basic C-cuts and building comfort. Don't expect game-speed backward skating. Forward skating is priority.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Backward skating should be developing. Introduce transitions and defensive positioning. This is important age for defensemen development.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect competent backward skating. Defensive players especially need strong backward skating. Work on gap control and reading attackers.",
          },
        },

        redFlags: [
          "Cannot move backward at all after extended practice",
          "Persistent fear of backward movement",
          "Always turns around instead of skating backward",
          "No improvement over a full season",
        ],

        parentExplanation:
          "Backward skating is essential for defense and transitions. We teach 'C-cuts' - pushing with the inside edges to move backward. It takes longer to develop than forward skating, so patience is important. Defensemen especially need strong backward skating. Any extra ice time helps develop this skill!",

        homeActivities: [
          "Practice C-cuts on any ice surface",
          "Inline skating backward (carefully!)",
          "Watch defensemen on TV - notice backward skating",
          "Balance exercises off-ice",
          "Public skating practice",
        ],

        bestAssessedIn: [
          "Backward skating drills",
          "Defensive situations",
          "Transition exercises",
          "1v1 defending",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across defensive situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Puck Control
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Puck Control",
      slug: "puck-control",
      description:
        "The ability to handle the puck while skating, including stickhandling, protecting the puck, and maintaining possession under pressure.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 3,

      progressionLevels: {
        1: "Puck constantly gets away; watches puck not ice; cannot stickhandle while moving",
        2: "Can control stationary puck; loses puck while skating; limited stickhandling",
        3: "Controls puck while skating; basic stickhandling moves; protects puck somewhat",
        4: "Excellent puck control at speed; creative stickhandling; protects puck effectively",
        5: "Elite puck skills; creative and deceptive; rarely loses possession",
      },

      observableBehaviors: [
        "Soft hands - cushions puck on stick",
        "Head up while handling puck",
        "Puck stays in scoring position",
        "Can stickhandle around obstacles",
        "Protects puck with body",
      ],

      commonMistakes: [
        "Puck too far from body",
        "Looking down at puck constantly",
        "Stiff hands (puck bounces off stick)",
        "Telegraphing moves",
        "Not protecting puck",
      ],

      coachingTips: [
        "'Soft hands!' - cushion the puck",
        "'Head up!' - see the ice",
        "'Keep it close!' - puck in control zone",
        "'Protect it!' - body between puck and defender",
        "'Cup the puck!' - proper blade angle",
      ],

      tags: ["core", "technical", "fundamental", "stickhandling", "puck-control"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player cannot control the puck. Puck constantly gets away. Cannot stickhandle while moving.",
            observableBehaviors: [
              "Puck escapes frequently",
              "Watches puck constantly",
              "Cannot move with puck",
              "Stiff stick/hands",
              "Loses puck immediately under pressure",
            ],
            commonMistakes: [
              "Puck too far out front",
              "No blade angle",
              "Pushing instead of cupping",
              "Standing still to handle puck",
            ],
            coachingTips: [
              "Start stationary",
              "Side to side - basic",
              "Use tennis ball off-ice",
              "Soft hands emphasis",
              "Lots of touches",
            ],
            assessmentActivities: [
              "Stationary stickhandling",
              "Puck control for 10 seconds",
              "Handle and stop",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can control stationary puck. Struggles to maintain control while skating.",
            observableBehaviors: [
              "Controls stationary puck",
              "Loses puck when skating",
              "Basic forehand/backhand",
              "Still looks down often",
              "Improving touch",
            ],
            commonMistakes: [
              "Puck gets ahead while skating",
              "Only uses forehand",
              "Stops to control puck",
              "Telegraphs intentions",
            ],
            coachingTips: [
              "Skating slowly with puck",
              "Forehand-backhand practice",
              "Head up drills",
              "Cones for obstacles",
            ],
            assessmentActivities: [
              "Skate with puck slowly",
              "Cone weaving",
              "Forehand-backhand drill",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Controls puck while skating. Basic stickhandling moves. Beginning to protect puck.",
            observableBehaviors: [
              "Skates with puck confidently",
              "Basic moves available",
              "Protects puck somewhat",
              "Head up more often",
              "Can beat stationary obstacles",
            ],
            commonMistakes: [
              "Loses puck at high speed",
              "Limited move variety",
              "Struggles under pressure",
              "Could protect better",
            ],
            coachingTips: [
              "Add defender pressure",
              "Introduce more moves",
              "Puck protection drills",
              "Game-speed handling",
            ],
            assessmentActivities: [
              "Puck control through cones at speed",
              "1v1 puck protection",
              "Stickhandling under pressure",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Excellent puck control at speed. Creative stickhandling. Protects puck effectively.",
            observableBehaviors: [
              "Controls at speed",
              "Creative moves",
              "Effective protection",
              "Head up always",
              "Deceptive handling",
            ],
            commonMistakes: [
              "May over-handle at times",
              "Could be more efficient",
            ],
            coachingTips: [
              "High-pressure situations",
              "Decision making - when to handle vs pass",
              "Offensive zone creativity",
              "Maintain under fatigue",
            ],
            assessmentActivities: [
              "1v1 offensive situations",
              "Game observation",
              "Pressure stickhandling",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite puck skills. Creative and deceptive. Rarely loses possession.",
            observableBehaviors: [
              "Elite touch",
              "Creative deception",
              "Rarely dispossessed",
              "Creates chances",
              "Handles any situation",
            ],
            commonMistakes: [
              "May try too much",
            ],
            coachingTips: [
              "Continue challenging",
              "Leadership role",
              "Help others develop",
              "Maintain creativity",
            ],
            assessmentActivities: [
              "Elite competition",
              "Game dominance",
              "Creative challenges",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Puck control takes thousands of touches to develop. Focus on lots of puck time - not perfection. Off-ice stickhandling is hugely valuable at this age!",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Puck control should be improving significantly. Can skate with puck. Introduce moves and puck protection. This is the best age for developing soft hands.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect confident puck control. Focus on control under pressure and creative moves. Decision-making around when to handle vs pass becomes important.",
          },
        },

        redFlags: [
          "Cannot control stationary puck after extended practice",
          "No improvement in touch over time",
          "Persistent avoidance of puck handling",
          "Physical limitations affecting grip/control",
        ],

        parentExplanation:
          "Puck control is about 'soft hands' - being able to control the puck on your stick while skating and under pressure. It takes thousands of touches to develop! The best thing you can do: get a stick and puck/ball at home. Stickhandling while watching TV, in the garage, or in the driveway develops this skill faster than anything else.",

        homeActivities: [
          "Stickhandling with golf ball or tennis ball",
          "Green biscuit or street puck in driveway",
          "Stickhandling while watching TV",
          "Obstacle courses around objects",
          "Swedish stickhandling ball for soft hands",
          "Any time with stick and puck/ball",
        ],

        bestAssessedIn: [
          "Stickhandling drills",
          "Skating with puck",
          "1v1 situations",
          "Game observation",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across various puck situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Passing
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Passing",
      slug: "passing-hockey",
      description:
        "The ability to accurately deliver the puck to teammates using forehand and backhand passes, including saucer passes.",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 4,

      progressionLevels: {
        1: "Passes inaccurate and weak; puck rolls off blade; cannot receive passes",
        2: "Can make short forehand pass; inconsistent accuracy; receiving improving",
        3: "Accurate forehand and backhand; leads teammates; receives cleanly",
        4: "Crisp passes in all situations; saucer passes; tape-to-tape consistently",
        5: "Elite passer; creates chances; sees plays before they develop",
      },

      observableBehaviors: [
        "Sweeps puck - doesn't slap at it",
        "Follows through to target",
        "Leads moving teammates",
        "Receives with soft hands",
        "Uses forehand and backhand",
      ],

      commonMistakes: [
        "Slapping at puck instead of sweeping",
        "Not following through",
        "Passing behind moving player",
        "Hard hands on receiving",
        "Only using forehand",
      ],

      coachingTips: [
        "'Sweep it!' - push through the puck",
        "'Point your blade!' - follow through to target",
        "'Lead them!' - pass where they're going",
        "'Soft hands!' - cushion the receive",
        "'Tape to tape!' - accuracy goal",
      ],

      tags: ["core", "technical", "fundamental", "passing"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player cannot make accurate passes. Puck often rolls off blade. Cannot receive passes cleanly.",
            observableBehaviors: [
              "Passes go everywhere",
              "Puck rolls off blade",
              "Cannot receive passes",
              "Very weak passes",
              "No follow-through",
            ],
            commonMistakes: [
              "Slapping at puck",
              "Blade angle wrong",
              "No weight transfer",
              "Stiff receiving",
            ],
            coachingTips: [
              "Basic sweep pass technique",
              "Partner passing stationary",
              "Blade angle focus",
              "Soft receiving practice",
            ],
            assessmentActivities: [
              "Partner passing 10 feet",
              "Pass to stationary target",
              "Receive and stop",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can make short forehand passes. Accuracy inconsistent. Receiving improving.",
            observableBehaviors: [
              "Short passes accurate",
              "Forehand developing",
              "Receiving better",
              "Follow-through improving",
              "Still inconsistent",
            ],
            commonMistakes: [
              "Backhand weak",
              "Long passes inaccurate",
              "Still hard hands sometimes",
              "Doesn't lead receivers",
            ],
            coachingTips: [
              "Increase distance",
              "Backhand passing",
              "Passing to moving target",
              "Passing off skating",
            ],
            assessmentActivities: [
              "Partner passing with movement",
              "Backhand pass drill",
              "Pass and receive skating",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Accurate forehand and backhand passes. Leads teammates. Receives cleanly.",
            observableBehaviors: [
              "Forehand and backhand",
              "Leads teammates",
              "Receives cleanly",
              "Tape to tape mostly",
              "Passes while skating",
            ],
            commonMistakes: [
              "Saucer pass developing",
              "Under pressure passes weaker",
              "Long passes inconsistent",
              "Could be crispier",
            ],
            coachingTips: [
              "Saucer pass introduction",
              "Passing under pressure",
              "Quick pass decisions",
              "One-timer passes",
            ],
            assessmentActivities: [
              "Tape to tape drill",
              "Passing under pressure",
              "Saucer pass practice",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Crisp passes in all situations. Saucer passes. Tape-to-tape consistently.",
            observableBehaviors: [
              "Crisp in all situations",
              "Effective saucer passes",
              "Tape to tape",
              "Creates chances",
              "Quick decisions",
            ],
            commonMistakes: [
              "May force difficult passes",
              "Could be simpler sometimes",
            ],
            coachingTips: [
              "Advanced passing patterns",
              "Passing in traffic",
              "One-touch passing",
              "Playmaking focus",
            ],
            assessmentActivities: [
              "Complex passing drills",
              "Game observation",
              "Assist tracking",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite passer who creates chances. Sees plays before they develop. Makes teammates better.",
            observableBehaviors: [
              "Elite vision",
              "Creates chances constantly",
              "Perfect weight",
              "Sees future plays",
              "Makes others better",
            ],
            commonMistakes: [
              "May expect too much from teammates",
            ],
            coachingTips: [
              "Continue challenging",
              "Leadership role",
              "Help others develop",
              "Maintain creativity",
            ],
            assessmentActivities: [
              "Game impact observation",
              "Assist statistics",
              "Elite competition",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Passing is challenging with undeveloped strength and technique. Focus on basic sweep pass and receiving. Keep it fun with passing games.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Passing should be improving. Both forehand and backhand should develop. Introduce passing while skating and to moving targets.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect accurate passing. Work on advanced passes (saucer, one-touch) and passing under pressure. Vision and decision-making become focus.",
          },
        },

        redFlags: [
          "Cannot make any accurate pass after extended practice",
          "Persistent technique issues despite correction",
          "Fear of receiving passes",
          "No improvement over time",
        ],

        parentExplanation:
          "Passing is how teams move the puck and create scoring chances. We teach the 'sweep' pass - pushing through the puck, not slapping at it. Good passing requires soft hands on the receive too. Partner passing practice is excellent at home if you have space!",

        homeActivities: [
          "Partner passing in driveway/basement",
          "Pass to target on boards/wall",
          "Passing games with family",
          "Watch hockey - notice the passes",
          "Off-ice passing practice",
        ],

        bestAssessedIn: [
          "Passing drills",
          "Scrimmage situations",
          "Games",
          "Breakout patterns",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across various passing situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Shooting (Wrist Shot)
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Shooting (Wrist Shot)",
      slug: "shooting-wrist",
      description:
        "The ability to shoot the puck using a wrist shot - the most versatile and accurate shot in hockey.",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 5,

      progressionLevels: {
        1: "Cannot elevate puck; weak shot; poor technique; shot often misses net",
        2: "Can get puck off ground sometimes; limited power; accuracy improving",
        3: "Consistent elevation; reasonable power; accurate to areas of net",
        4: "Quick release; powerful and accurate; can pick corners; shoots in stride",
        5: "Elite wrist shot; deceptive release; scores from anywhere; weapon",
      },

      observableBehaviors: [
        "Puck starts at heel, released at toe",
        "Weight transfer from back to front foot",
        "Wrists roll over on release",
        "Follow-through to target",
        "Quick release without telegraphing",
      ],

      commonMistakes: [
        "No weight transfer",
        "Puck on toe the whole time",
        "No wrist snap/roll",
        "Looking at net instead of shooting",
        "Telegraphing the shot",
      ],

      coachingTips: [
        "'Pull and snap!' - heel to toe, snap wrists",
        "'Transfer your weight!' - back foot to front",
        "'Roll your wrists!' - get it up",
        "'Quick release!' - don't wind up",
        "'Pick your spot!' - aim for specific targets",
      ],

      tags: ["core", "technical", "fundamental", "shooting", "wrist-shot"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player cannot elevate puck. Very weak shot with poor technique. Shots miss net frequently.",
            observableBehaviors: [
              "Puck stays on ice",
              "Very weak",
              "No technique",
              "Misses net",
              "No weight transfer",
            ],
            commonMistakes: [
              "Pushing instead of shooting",
              "No wrist action",
              "Standing straight up",
              "Puck position wrong",
            ],
            coachingTips: [
              "Basic shooting position",
              "Weight transfer practice",
              "Wrist roll off-ice",
              "Very close to net first",
            ],
            assessmentActivities: [
              "Shooting from 5 feet",
              "Technique observation",
              "Wrist snap practice",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can elevate puck sometimes. Limited power. Accuracy improving.",
            observableBehaviors: [
              "Sometimes elevates",
              "Limited power",
              "Accuracy improving",
              "Some weight transfer",
              "Wrist action emerging",
            ],
            commonMistakes: [
              "Inconsistent elevation",
              "Power varies greatly",
              "Winds up too much",
              "Technique breaks down",
            ],
            coachingTips: [
              "Increase distance gradually",
              "Targets in net",
              "Quick release focus",
              "Shooting in motion",
            ],
            assessmentActivities: [
              "Shooting from 10-15 feet",
              "Target accuracy drill",
              "Elevation test",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Consistent elevation with reasonable power. Can hit areas of net accurately.",
            observableBehaviors: [
              "Consistent elevation",
              "Reasonable power",
              "Hits targets",
              "Shoots in stride",
              "Proper technique",
            ],
            commonMistakes: [
              "Could be quicker release",
              "High shots difficult",
              "One-timer developing",
              "Pressure affects shot",
            ],
            coachingTips: [
              "Quick release emphasis",
              "High corners practice",
              "One-timer introduction",
              "Shooting under pressure",
            ],
            assessmentActivities: [
              "Corner shooting drill",
              "Quick release tests",
              "Shooting with defender",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Quick release with power and accuracy. Can pick corners. Shoots effectively in stride.",
            observableBehaviors: [
              "Quick release",
              "Powerful and accurate",
              "Picks corners",
              "Shoots in stride",
              "Deceptive",
            ],
            commonMistakes: [
              "May shoot when pass is better",
              "Could be more patient",
            ],
            coachingTips: [
              "Game-speed shooting",
              "Shot selection",
              "Shooting in traffic",
              "One-timers perfection",
            ],
            assessmentActivities: [
              "Game observation",
              "Shooting percentage tracking",
              "Pressure shooting",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite wrist shot. Deceptive release. Scores from anywhere. Shot is a weapon.",
            observableBehaviors: [
              "Elite shot",
              "Deceptive release",
              "Scores from anywhere",
              "Weapon",
              "Creates fear in goalies",
            ],
            commonMistakes: [
              "May over-rely on shot",
            ],
            coachingTips: [
              "Continue challenging",
              "Maintain sharpness",
              "Help others develop",
              "Diverse attacking",
            ],
            assessmentActivities: [
              "Elite competition",
              "Goal statistics",
              "Game dominance",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Strength is the main limitation. Don't expect power - focus on basic technique. Many shots will stay on the ice and that's okay. Technique now, power later.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Shooting should improve with strength gains. Focus on proper technique and elevation. Quick release becomes important. Lots of shooting practice helps.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect competent wrist shots. Strength allows for real power. Work on quick release, accuracy, and shooting under pressure.",
          },
        },

        redFlags: [
          "Cannot elevate puck at all after extended practice",
          "Persistent technique issues",
          "Physical limitations affecting shot",
          "No improvement over time",
        ],

        parentExplanation:
          "The wrist shot is the most important shot in hockey - accurate, quick, and deceptive. We teach the pull-and-snap technique with weight transfer. Shooting practice takes hundreds of repetitions! Shooting pads/boards at home are excellent investments for any young hockey player.",

        homeActivities: [
          "Shooting on net/tarp in driveway",
          "Wrist snap exercises without puck",
          "Shooting pucks into boards for practice",
          "Watch shooters on TV - notice technique",
          "Any shooting repetition helps",
        ],

        bestAssessedIn: [
          "Shooting drills",
          "Game situations",
          "One-on-goalie situations",
          "Accuracy tests",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across shooting situations",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // TACTICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Positioning
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Positioning",
      slug: "positioning-hockey",
      description:
        "The ability to be in the right place on the ice in all three zones, supporting teammates and being available for plays.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 10,

      progressionLevels: {
        1: "Chases puck everywhere; no positional awareness; leaves assigned areas",
        2: "Beginning to understand zones; stays in position sometimes; still chases often",
        3: "Good positional play; understands role; supports teammates; covers lanes",
        4: "Excellent positioning; reads play to anticipate; creates advantages",
        5: "Elite positioning; always in right spot; makes teammates better",
      },

      observableBehaviors: [
        "Stays in assigned zone/area",
        "Supports puck carrier from distance",
        "Covers passing/shooting lanes",
        "Moves to open ice",
        "Anticipates play development",
      ],

      commonMistakes: [
        "Chasing puck all over ice",
        "Leaving defensive position",
        "Bunching with teammates",
        "Standing still instead of moving",
        "Not supporting puck carrier",
      ],

      coachingTips: [
        "'Stay in your lane!' - positional discipline",
        "'Support the puck!' - be available option",
        "'Cover your man!' - defensive responsibility",
        "'Read the play!' - anticipate what's next",
        "'Find open ice!' - positioning to receive",
      ],

      tags: ["core", "tactical", "fundamental", "positioning", "hockey-sense"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player chases the puck everywhere. No understanding of position or role.",
            observableBehaviors: [
              "Chases puck constantly",
              "No positional awareness",
              "Leaves assigned area",
              "All five players at puck",
              "No defensive responsibility",
            ],
            commonMistakes: [
              "Everyone at the puck",
              "Huge gaps in coverage",
              "No support play",
              "Random movement",
            ],
            coachingTips: [
              "Use markers for positions",
              "'Your job is THIS area'",
              "Freeze play and show positions",
              "Simple zone responsibilities",
            ],
            assessmentActivities: [
              "Positional games",
              "Zone restriction drills",
              "Simple scrimmage observation",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to understand positions. Stays in area sometimes but still chases puck often.",
            observableBehaviors: [
              "Understands zones",
              "Stays sometimes",
              "Still chases often",
              "Improving awareness",
              "Responds to reminders",
            ],
            commonMistakes: [
              "Forgets in excitement",
              "Leaves position for puck",
              "Defensive lapses",
              "Not consistent",
            ],
            coachingTips: [
              "Constant positional reminders",
              "Praise staying in position",
              "Simple systems introduction",
              "Position-specific feedback",
            ],
            assessmentActivities: [
              "System drill observation",
              "Game positioning",
              "Zone coverage test",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Good positional play with understanding of role. Supports teammates and covers lanes.",
            observableBehaviors: [
              "Good positional discipline",
              "Understands role",
              "Supports teammates",
              "Covers lanes",
              "Generally in right spot",
            ],
            commonMistakes: [
              "May get pulled out sometimes",
              "Anticipation developing",
              "Complex situations challenging",
              "Could support better",
            ],
            coachingTips: [
              "Increase complexity",
              "Reading plays ahead",
              "Supporting from better angles",
              "System refinement",
            ],
            assessmentActivities: [
              "Complex system drills",
              "Game observation",
              "Defensive zone coverage",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Excellent positioning with ability to read and anticipate plays. Creates advantages.",
            observableBehaviors: [
              "Excellent positioning",
              "Reads play ahead",
              "Creates advantages",
              "Rarely out of position",
              "Supports perfectly",
            ],
            commonMistakes: [
              "May anticipate incorrectly occasionally",
              "Could organize others more",
            ],
            coachingTips: [
              "Leadership in positioning",
              "Organizing teammates",
              "Advanced tactical concepts",
              "Film study",
            ],
            assessmentActivities: [
              "Game film review",
              "Full game observation",
              "Tactical quizzes",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite positioning. Always in the right spot. Makes teammates better with positioning.",
            observableBehaviors: [
              "Elite positioning",
              "Always right spot",
              "Organizes others",
              "Makes team better",
              "Reads game perfectly",
            ],
            commonMistakes: [
              "May expect too much from teammates",
            ],
            coachingTips: [
              "Continue challenging",
              "Leadership development",
              "Help others understand",
              "Maintain standard",
            ],
            assessmentActivities: [
              "Team impact observation",
              "Advanced film study",
              "Leadership assessment",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Puck chasing is completely normal and expected! Young players are naturally drawn to the puck. Use simple zone assignments and be patient. Positioning develops slowly.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Positional awareness should be developing. Simple systems can be introduced. Players should understand their basic role. Still needs reminders but improving.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect good positional play. Systems can be more complex. Reading the play and anticipating become important. Position-specific skills develop.",
          },
        },

        redFlags: [
          "Cannot stay in position despite extended practice",
          "No understanding of role after full season",
          "Persistent puck-chasing despite instruction",
          "Cannot follow simple positional directions",
        ],

        parentExplanation:
          "Positioning is being in the right place on the ice. Young players naturally chase the puck - this is normal! We teach them their 'area' of the ice and how to support teammates. Good positioning means not everyone at the puck. Watch hockey with your child and point out good positioning!",

        homeActivities: [
          "Watch hockey and discuss 'where should they be?'",
          "Draw plays and positions on paper",
          "Discuss why players go where they go",
          "Video games can help understand positioning",
        ],

        bestAssessedIn: [
          "Game situations",
          "System drills",
          "Scrimmages",
          "Defensive zone coverage",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across multiple game situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Defensive Play
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Defensive Play",
      slug: "defensive-play",
      description:
        "The ability to play defense effectively, including positioning, stick work, body contact, and preventing scoring chances.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 11,

      progressionLevels: {
        1: "No defensive concept; lets attackers by easily; doesn't compete for puck",
        2: "Beginning to understand defense; tries to stop attackers; often beaten",
        3: "Solid defensive play; competes hard; uses stick and body appropriately",
        4: "Excellent defender; rarely beaten 1v1; smart positioning; wins battles",
        5: "Elite defensive player; shuts down top players; changes games defensively",
      },

      observableBehaviors: [
        "Stays between attacker and net",
        "Active stick in passing lanes",
        "Competes for pucks along boards",
        "Maintains gap control",
        "Finishes checks appropriately",
      ],

      commonMistakes: [
        "Reaching instead of positioning",
        "Letting attacker inside",
        "Not competing in battles",
        "Too aggressive (gets beaten)",
        "Not blocking shots",
      ],

      coachingTips: [
        "'Gap control!' - don't give them space",
        "'Stick on puck!' - active defensive stick",
        "'Win the battle!' - compete in corners",
        "'Stay on your man!' - defensive responsibility",
        "'Protect the house!' - defend slot area",
      ],

      tags: ["core", "tactical", "fundamental", "defense", "compete"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player has no defensive concept. Lets attackers by easily. Doesn't compete for puck.",
            observableBehaviors: [
              "No defensive effort",
              "Beaten easily",
              "Watches puck go by",
              "Doesn't compete",
              "No awareness of responsibility",
            ],
            commonMistakes: [
              "Standing and watching",
              "No compete level",
              "Letting everyone by",
              "Not understanding defense",
            ],
            coachingTips: [
              "Basic defensive concepts",
              "'Stay between them and the net'",
              "Compete games/drills",
              "1v1 battling introduction",
            ],
            assessmentActivities: [
              "1v1 defensive drill",
              "Basic compete games",
              "Defensive positioning",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to understand defense. Tries to stop attackers but often beaten.",
            observableBehaviors: [
              "Tries to defend",
              "Often beaten",
              "Some compete",
              "Understanding growing",
              "Improving effort",
            ],
            commonMistakes: [
              "Wrong positioning",
              "Too aggressive or passive",
              "Doesn't finish battles",
              "Stick not active",
            ],
            coachingTips: [
              "Gap control focus",
              "Active stick work",
              "Battle completion",
              "Angling practice",
            ],
            assessmentActivities: [
              "1v1 angling drill",
              "Board battles",
              "Defensive zone coverage",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Solid defensive play. Competes hard. Uses stick and body appropriately.",
            observableBehaviors: [
              "Solid defender",
              "Competes hard",
              "Good stick",
              "Wins some battles",
              "Good positioning",
            ],
            commonMistakes: [
              "Beaten by speed sometimes",
              "Could be more physical",
              "Decision making developing",
              "Not always consistent",
            ],
            coachingTips: [
              "Reading attackers",
              "Physicality appropriate for age",
              "Consistency focus",
              "Defending rushes",
            ],
            assessmentActivities: [
              "Rush defense drill",
              "2v1 defending",
              "Game observation",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Excellent defender who is rarely beaten 1v1. Smart positioning and wins battles.",
            observableBehaviors: [
              "Excellent defender",
              "Rarely beaten",
              "Smart positioning",
              "Wins battles",
              "Leadership defensively",
            ],
            commonMistakes: [
              "May get burned occasionally",
              "Could be more vocal",
            ],
            coachingTips: [
              "Defensive leadership",
              "Advanced concepts",
              "Organizing teammates",
              "Penalty kill role",
            ],
            assessmentActivities: [
              "Against top forwards",
              "Game impact observation",
              "Penalty kill play",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite defensive player who shuts down opponents. Changes games with defense.",
            observableBehaviors: [
              "Elite defender",
              "Shuts down opponents",
              "Game-changer",
              "Organizes defense",
              "Complete defender",
            ],
            commonMistakes: [
              "May be targeted with speed",
            ],
            coachingTips: [
              "Continue challenging",
              "Defensive leadership",
              "Help others develop",
              "Maintain excellence",
            ],
            assessmentActivities: [
              "Opponent tracking",
              "Game-winning defensive plays",
              "Elite competition",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Defense is an advanced concept for this age. Focus on basic positioning and competing for puck. Don't expect sophisticated defensive play.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Defensive concepts should be developing. Teach gap control and compete level. Board battles become important. Appropriate physicality develops.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect solid defensive play. Physicality increases. Focus on reading attackers and making smart decisions. System defense becomes sophisticated.",
          },
        },

        redFlags: [
          "Refuses to compete for pucks",
          "No effort defensively despite instruction",
          "Fear of physical play affecting defense",
          "Cannot understand basic defensive concepts",
        ],

        parentExplanation:
          "Defense in hockey means preventing the other team from scoring. We teach gap control (staying the right distance from attackers), active stick work, and competing hard for pucks. Checking develops later - first we focus on positioning and effort. Defense is often overlooked but is just as important as scoring!",

        homeActivities: [
          "Watch hockey and notice defensive play",
          "Discuss 'what should the defender do?'",
          "Compete games at home (any sport)",
          "Physicality through general sports play",
        ],

        bestAssessedIn: [
          "Defensive zone situations",
          "1v1 and 2v1 drills",
          "Board battles",
          "Game observation",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across defensive situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Transition / Breakout
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Transition / Breakout",
      slug: "transition-breakout",
      description:
        "The ability to transition from defense to offense efficiently, including proper breakout execution and supporting rush attacks.",
      introductionAge: 8,
      assessmentMethod: "observation" as const,
      isCore: false,
      sortOrder: 12,

      progressionLevels: {
        1: "No understanding of breakouts; doesn't support transition; stands still after turnovers",
        2: "Beginning to understand concepts; sometimes supports; timing often wrong",
        3: "Executes basic breakouts; supports transitions; understands timing",
        4: "Efficient breakouts; creates odd-man rushes; excellent transition player",
        5: "Elite transition game; leads rushes; creates scoring chances from defense",
      },

      observableBehaviors: [
        "Gets to proper breakout position quickly",
        "Provides wall or middle option",
        "Times departure correctly",
        "Fills lanes on rush",
        "Supports puck carrier through zones",
      ],

      commonMistakes: [
        "Standing still waiting for puck",
        "Not getting to position quickly",
        "Everyone going to same spot",
        "Leaving zone too early (offside)",
        "Not supporting through neutral zone",
      ],

      coachingTips: [
        "'Get to your spot!' - breakout positioning",
        "'Give them an option!' - support the puck",
        "'Fill the lanes!' - spread on rush",
        "'Blue line read!' - timing departure",
        "'Through the neutral zone!' - maintain support",
      ],

      tags: ["tactical", "fundamental", "transition", "breakout", "rush"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player doesn't understand breakouts or transitions. Stands still after turnovers.",
            observableBehaviors: [
              "No breakout awareness",
              "Stands after turnovers",
              "Doesn't support",
              "No transition concept",
              "Random positioning",
            ],
            commonMistakes: [
              "Standing in wrong spots",
              "Not moving on turnovers",
              "No support provided",
              "Everyone at puck",
            ],
            coachingTips: [
              "Basic breakout positions",
              "Simple: 'Go to the wall!'",
              "Movement on whistle/turnover",
              "Getting open concept",
            ],
            assessmentActivities: [
              "Basic breakout drill",
              "Position race to spots",
              "Simple transition",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to understand concepts. Sometimes gets to position. Timing often wrong.",
            observableBehaviors: [
              "Gets to position sometimes",
              "Understanding growing",
              "Timing off",
              "Supports occasionally",
              "Improving awareness",
            ],
            commonMistakes: [
              "Late to position",
              "Wrong timing",
              "Offsides on rush",
              "Position but not open",
            ],
            coachingTips: [
              "Timing emphasis",
              "Being open in position",
              "Filling lanes practice",
              "Neutral zone support",
            ],
            assessmentActivities: [
              "Breakout timing drill",
              "Rush lanes drill",
              "3-on-2 rushes",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Executes basic breakouts. Supports transitions well. Understands timing.",
            observableBehaviors: [
              "Executes breakouts",
              "Good timing",
              "Fills lanes",
              "Supports rushes",
              "Understands reads",
            ],
            commonMistakes: [
              "Complex breakouts challenging",
              "May not read defense perfectly",
              "Could be quicker",
              "Sometimes predictable",
            ],
            coachingTips: [
              "Complex breakout options",
              "Reading forechecks",
              "Creating odd-man rushes",
              "Speed through neutral zone",
            ],
            assessmentActivities: [
              "Full breakout systems",
              "Forechecking defense",
              "Rush attack drills",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Efficient breakouts. Creates odd-man rushes. Excellent transition player.",
            observableBehaviors: [
              "Efficient breakouts",
              "Creates rushes",
              "Quick transitions",
              "Reads forechecks",
              "Leading through zones",
            ],
            commonMistakes: [
              "May force breakouts",
              "Occasionally too aggressive",
            ],
            coachingTips: [
              "Decision making under pressure",
              "Leading breakouts",
              "Creating for teammates",
              "Transition defense awareness",
            ],
            assessmentActivities: [
              "Full game observation",
              "Rush creation tracking",
              "Transition efficiency",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite transition game. Leads rushes effectively. Creates scoring chances from defensive zone.",
            observableBehaviors: [
              "Elite transition",
              "Creates chances",
              "Leads rushes",
              "Breaks forechecks easily",
              "Game-changing transition",
            ],
            commonMistakes: [
              "May leave teammates behind",
            ],
            coachingTips: [
              "Continue developing",
              "Leadership in transition",
              "Help others improve",
              "Maintain excellence",
            ],
            assessmentActivities: [
              "Transition statistics",
              "Rush success rate",
              "Game impact",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1",
            notes:
              "Breakouts are very complex for this age. Focus on very simple concepts - 'get to the wall' or 'spread out.' Don't expect system execution.",
          },
          ages9to11: {
            typicalLevel: "1-2",
            notes:
              "Basic breakout concepts can be introduced. Keep it simple - 2-3 options maximum. Timing will be inconsistent but improving.",
          },
          ages12to14: {
            typicalLevel: "2-3",
            notes:
              "Expect understanding of basic breakouts. Can introduce more complex reads. Rush support and lane filling should be solid.",
          },
        },

        redFlags: [
          "Cannot understand basic breakout concepts",
          "Never moves on turnovers",
          "Persistent timing issues",
          "Cannot execute simple plays",
        ],

        parentExplanation:
          "Transition is changing from defense to offense quickly. Breakouts are how teams get the puck out of their defensive zone. We teach players to 'get to their spot' quickly and provide options for the puck carrier. This is one of the more complex parts of hockey and takes time to develop!",

        homeActivities: [
          "Watch hockey and notice breakouts",
          "Discuss transition plays you see",
          "Video games for hockey concepts",
          "Drawing plays on paper",
        ],

        bestAssessedIn: [
          "Breakout drills",
          "Game situations",
          "Rush attack drills",
          "Defensive zone play",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe in game situations",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PHYSICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Edge Work / Balance
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Edge Work / Balance",
      slug: "edge-work-balance",
      description:
        "The ability to use skate edges effectively for turning, stopping, and maintaining balance in all skating situations.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 20,

      progressionLevels: {
        1: "Cannot control edges; falls on turns; snowplow only stop",
        2: "Basic edge control; wide turns; hockey stop developing",
        3: "Good edge work; tight turns; stops both directions; crossovers solid",
        4: "Excellent edges; quick direction changes; uses edges as advantage",
        5: "Elite edge control; turns on a dime; edges create separation",
      },

      observableBehaviors: [
        "Uses inside and outside edges",
        "Maintains balance through turns",
        "Can stop quickly both directions",
        "Crossovers are smooth",
        "Low center of gravity in turns",
      ],

      commonMistakes: [
        "Skating on flats (no edge)",
        "Standing up in turns",
        "Cannot stop to one side",
        "Crossovers feet tangle",
        "Falls on tight turns",
      ],

      coachingTips: [
        "'Get on your edges!' - feel the angle",
        "'Stay low!' - bend knees through turns",
        "'Trust your edges!' - commit to the turn",
        "'Cross over, not under!' - proper crossover",
        "'Outside edge, inside edge!' - alternating",
      ],

      tags: ["core", "physical", "fundamental", "skating", "edges", "balance"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player cannot control edges. Falls on turns. Can only snowplow stop.",
            observableBehaviors: [
              "No edge control",
              "Falls on turns",
              "Snowplow stop only",
              "Wide turns only",
              "Skates on flats",
            ],
            commonMistakes: [
              "Flat skating",
              "Standing up in turns",
              "Fear of edges",
              "Cannot commit to turn",
            ],
            coachingTips: [
              "Basic edge introduction",
              "Standing edge tilts",
              "Wide turns with cones",
              "One-foot glides for balance",
            ],
            assessmentActivities: [
              "Edge introduction drill",
              "Wide turn drill",
              "Balance tests",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Basic edge control. Can make wide turns. Hockey stop developing.",
            observableBehaviors: [
              "Some edge control",
              "Wide turns possible",
              "Hockey stop emerging",
              "Better balance",
              "Beginning crossovers",
            ],
            commonMistakes: [
              "Tight turns difficult",
              "One-sided stop",
              "Crossovers not smooth",
              "Stands up at speed",
            ],
            coachingTips: [
              "Tighter turn practice",
              "Hockey stop both sides",
              "Crossover practice",
              "Edge awareness drills",
            ],
            assessmentActivities: [
              "Hockey stop test",
              "Figure skating drill",
              "Crossover introduction",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Good edge work with tight turns. Stops both directions. Crossovers solid.",
            observableBehaviors: [
              "Good edge work",
              "Tight turns",
              "Stops both ways",
              "Solid crossovers",
              "Good balance",
            ],
            commonMistakes: [
              "Could be tighter",
              "Speed affects edges",
              "Complex patterns challenging",
              "Not always explosive off edges",
            ],
            coachingTips: [
              "Speed through edges",
              "Tight turn drills",
              "Edge explosion",
              "Complex skating patterns",
            ],
            assessmentActivities: [
              "Tight turn drills",
              "Edge work course",
              "Speed through turns",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Excellent edges with quick direction changes. Uses edges as competitive advantage.",
            observableBehaviors: [
              "Excellent edges",
              "Quick changes",
              "Explosive off edges",
              "Uses as advantage",
              "Creates separation",
            ],
            commonMistakes: [
              "Could always improve",
              "Fatigue affects edges",
            ],
            coachingTips: [
              "Maintain through season",
              "Game-speed edge work",
              "Creating with edges",
              "Advanced patterns",
            ],
            assessmentActivities: [
              "Advanced edge drills",
              "Game observation",
              "1v1 separation",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite edge control. Turns on a dime. Edges create separation and scoring chances.",
            observableBehaviors: [
              "Elite edge control",
              "Turns on a dime",
              "Creates separation",
              "Edge weapon",
              "Balance unshakeable",
            ],
            commonMistakes: [
              "None significant",
            ],
            coachingTips: [
              "Continue challenging",
              "Help others develop",
              "Maintain excellence",
              "Edge creativity",
            ],
            assessmentActivities: [
              "Elite edge tests",
              "Game dominance",
              "Competitive edge work",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Edge work takes years to develop. Focus on balance and basic turns. Snowplow stop is fine initially. Lots of ice time helps most.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "This is the golden age for edge development. Hockey stops both ways should develop. Crossovers become important. Power skating helps greatly.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect good edge work. Focus on using edges at game speed. Tight turns and quick direction changes should be developing.",
          },
        },

        redFlags: [
          "Cannot control edges at all after extended practice",
          "Persistent falling on basic turns",
          "Fear of using edges not improving",
          "Significant balance issues",
        ],

        parentExplanation:
          "Edge work is using the edges of the skate blades to turn, stop, and change direction. It's fundamental to all hockey movement! We teach players to 'trust their edges' and stay low in turns. Power skating lessons are excellent for developing edges. Any extra ice time helps build this skill.",

        homeActivities: [
          "Power skating lessons (highly recommended)",
          "Any extra ice time",
          "Balance exercises off-ice",
          "Inline skating for edge feel",
          "Watch skating and notice edge use",
        ],

        bestAssessedIn: [
          "Skating drills",
          "Figure skating patterns",
          "Game movement",
          "Direction change drills",
        ],
        assessmentFrequency: "Monthly observation, formal assessment quarterly",
        assessmentDuration: "Observe across skating situations",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Speed / Acceleration
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Speed / Acceleration",
      slug: "speed-acceleration",
      description:
        "The ability to skate fast and accelerate quickly, creating separation from opponents and attacking with speed.",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      isCore: false,
      sortOrder: 21,

      progressionLevels: {
        1: "Slow compared to peers; cannot accelerate; inefficient technique",
        2: "Average speed; developing acceleration; technique improving",
        3: "Good speed; quick first few strides; can beat defenders with speed",
        4: "Fast; explosive acceleration; speed creates advantages",
        5: "Elite speed; game-changing acceleration; fastest on the ice",
      },

      observableBehaviors: [
        "Quick first three strides",
        "Full extension at top speed",
        "Arms pumping for power",
        "Low body position when accelerating",
        "Maintains speed through turns",
      ],

      commonMistakes: [
        "Short choppy strides when accelerating",
        "Standing too upright",
        "Arms not helping",
        "Slow first step",
        "Slowing in turns",
      ],

      coachingTips: [
        "'Explode!' - powerful first strides",
        "'Stay low!' - bend knees when accelerating",
        "'Drive your arms!' - use arms for power",
        "'Full extension!' - complete each stride",
        "'Quick feet!' - fast turnover",
      ],

      tags: ["physical", "fundamental", "skating", "speed", "acceleration"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is slow compared to peers. Cannot accelerate effectively. Technique is inefficient.",
            observableBehaviors: [
              "Slow skating",
              "Cannot accelerate",
              "Short strides",
              "Standing upright",
              "Falls behind",
            ],
            commonMistakes: [
              "No power in strides",
              "Inefficient technique",
              "Not using arms",
              "Gives up on races",
            ],
            coachingTips: [
              "Focus on technique first",
              "Acceleration starts",
              "Stride extension",
              "Make races fun",
            ],
            assessmentActivities: [
              "Short sprints",
              "Technique observation",
              "Acceleration drill",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Average speed for age. Acceleration developing. Technique improving.",
            observableBehaviors: [
              "Average speed",
              "Acceleration developing",
              "Technique improving",
              "More power",
              "Better position",
            ],
            commonMistakes: [
              "Speed inconsistent",
              "First strides not explosive",
              "Fatigues quickly",
              "Technique breaks at top speed",
            ],
            coachingTips: [
              "Explosive starts practice",
              "Sprint repetition",
              "Technique maintenance at speed",
              "Racing games",
            ],
            assessmentActivities: [
              "Sprint tests",
              "First three stride drill",
              "Relay races",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Good speed with quick first strides. Can beat defenders with speed.",
            observableBehaviors: [
              "Good speed",
              "Quick acceleration",
              "Beats defenders",
              "Good technique",
              "Maintains through zones",
            ],
            commonMistakes: [
              "Could be more explosive",
              "Speed drops late in shifts",
              "Not always using speed tactically",
              "May not finish races",
            ],
            coachingTips: [
              "Explosive power development",
              "Using speed tactically",
              "Maintaining through shifts",
              "Speed with puck",
            ],
            assessmentActivities: [
              "Game speed tests",
              "End-to-end races",
              "Speed in game situations",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Fast skater with explosive acceleration. Speed creates advantages in games.",
            observableBehaviors: [
              "Fast",
              "Explosive",
              "Creates advantages",
              "Uses speed well",
              "Wins most races",
            ],
            commonMistakes: [
              "May over-rely on speed",
              "Could pace better",
            ],
            coachingTips: [
              "Maintain through season",
              "Speed endurance",
              "Tactical speed use",
              "Speed leadership",
            ],
            assessmentActivities: [
              "Competitive races",
              "Game impact observation",
              "Speed endurance tests",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite speed. Game-changing acceleration. Among the fastest players at any level.",
            observableBehaviors: [
              "Elite speed",
              "Game-changing",
              "Explosive acceleration",
              "Speed weapon",
              "Dominates with pace",
            ],
            commonMistakes: [
              "May rely too heavily on speed",
            ],
            coachingTips: [
              "Maintain elite speed",
              "Diverse skill development",
              "Speed endurance",
              "Help others develop",
            ],
            assessmentActivities: [
              "Elite speed tests",
              "Game dominance",
              "Competitive comparison",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Speed varies widely and is still developing. Focus on technique over raw speed. Don't compare - development varies greatly at this age.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Speed should be improving with technique. Acceleration can be trained. This is a good age for skating development including speed.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Speed differences become more pronounced. Strength contributes to speed. Continue technique work while adding power development.",
          },
        },

        redFlags: [
          "Significantly slower with no improvement",
          "Physical issues affecting skating",
          "Avoiding speed situations",
          "No response to technique coaching",
        ],

        parentExplanation:
          "Speed in hockey comes from skating technique and power. We work on 'explosive' first strides and full leg extension. Speed develops differently for each player - some develop early, others later. More ice time and power skating lessons help develop speed. Don't compare your child to others - development varies!",

        homeActivities: [
          "Power skating lessons",
          "Off-ice sprints and agility",
          "Leg strengthening exercises",
          "Any extra ice time",
          "Racing games (any sport)",
        ],

        bestAssessedIn: [
          "Sprint skating drills",
          "Races",
          "Game observation",
          "Breakaway situations",
        ],
        assessmentFrequency: "Quarterly observation",
        assessmentDuration: "Observe across various skating situations",
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // PSYCHOLOGICAL SKILLS
    // ═══════════════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Confidence
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Confidence",
      slug: "confidence-hockey",
      description:
        "The belief in one's own abilities to perform hockey skills, compete effectively, and contribute to the team.",
      introductionAge: 5,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 30,

      progressionLevels: {
        1: "Hesitant; avoids puck; gives up easily; needs constant encouragement",
        2: "Will try with support; affected by mistakes; inconsistent confidence",
        3: "Competes willingly; recovers from mistakes; generally positive",
        4: "Confident competitor; resilient; takes on challenges; believes in self",
        5: "Supreme confidence; inspires teammates; clutch performer; unshakeable",
      },

      observableBehaviors: [
        "Goes to puck without hesitation",
        "Competes in battles willingly",
        "Recovers quickly from mistakes",
        "Positive body language",
        "Tries new skills without fear",
      ],

      commonMistakes: [
        "Avoiding the puck",
        "Giving up after turnovers",
        "Negative self-talk",
        "Hiding on the ice",
        "Afraid to make mistakes",
      ],

      coachingTips: [
        "'Go get it!' - encourage attacking puck",
        "'Next shift!' - move past mistakes",
        "'You can do it!' - genuine encouragement",
        "'Great compete!' - praise effort",
        "'Believe in yourself!' - confidence building",
      ],

      tags: ["core", "psychological", "fundamental", "confidence", "mental"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is hesitant on the ice. Avoids the puck and challenging situations. Needs constant encouragement.",
            observableBehaviors: [
              "Avoids puck",
              "Hesitant to compete",
              "Gives up easily",
              "Negative body language",
              "Needs constant encouragement",
            ],
            commonMistakes: [
              "Hiding on ice",
              "Saying 'I can't'",
              "Refusing challenges",
              "Shutting down after errors",
            ],
            coachingTips: [
              "Build relationship first",
              "Find small successes",
              "Lots of encouragement",
              "Reduce pressure",
              "Celebrate trying",
            ],
            assessmentActivities: [
              "Observation during activities",
              "Puck pursuit willingness",
              "Response to challenges",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Will try with support but affected by mistakes. Inconsistent confidence.",
            observableBehaviors: [
              "Tries with support",
              "Affected by mistakes",
              "Inconsistent confidence",
              "Sometimes competes",
              "Improving engagement",
            ],
            commonMistakes: [
              "Confidence fluctuates",
              "Needs validation",
              "Compares to others",
              "Hesitant in pressure",
            ],
            coachingTips: [
              "Build on successes",
              "Reduce fear of failure",
              "Growth mindset teaching",
              "Safe environment",
            ],
            assessmentActivities: [
              "Compete level observation",
              "Response to adversity",
              "Pressure situation behavior",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Competes willingly and recovers from mistakes reasonably well. Generally positive.",
            observableBehaviors: [
              "Competes willingly",
              "Recovers from mistakes",
              "Generally positive",
              "Goes to puck",
              "Tries new things",
            ],
            commonMistakes: [
              "Confidence dips in new situations",
              "Big games more nervous",
              "May avoid very hard challenges",
              "Inconsistent in pressure",
            ],
            coachingTips: [
              "Challenge with harder situations",
              "Self-talk strategies",
              "Normalize struggle",
              "Increase pressure gradually",
            ],
            assessmentActivities: [
              "Pressure situations",
              "Big game behavior",
              "Challenge response",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Confident competitor who takes on challenges and believes in abilities.",
            observableBehaviors: [
              "Confident competitor",
              "Takes challenges",
              "Believes in self",
              "Quick mistake recovery",
              "Positive influence",
            ],
            commonMistakes: [
              "May become over-confident",
              "Could take bad risks",
            ],
            coachingTips: [
              "Channel confidence well",
              "Leadership opportunities",
              "Balance with smart play",
              "Model for others",
            ],
            assessmentActivities: [
              "Clutch situations",
              "Leadership observation",
              "Pressure response",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Supreme confidence that inspires teammates. Clutch performer. Unshakeable.",
            observableBehaviors: [
              "Supreme confidence",
              "Inspires teammates",
              "Clutch performer",
              "Seeks challenges",
              "Unshakeable",
            ],
            commonMistakes: [
              "May border on arrogance",
            ],
            coachingTips: [
              "Leadership development",
              "Help others grow",
              "Balance with humility",
              "Channel appropriately",
            ],
            assessmentActivities: [
              "Pressure performance",
              "Team impact",
              "Long-term observation",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Confidence varies hugely. Hockey is challenging - skating is hard! Create safe environment where trying is celebrated. Never embarrass players.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Confidence should be stabilizing. Social comparison increases. Build through achievable challenges and growth mindset teaching.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Social awareness peaks. Create supportive team culture. Performance pressure increases. Help manage expectations.",
          },
        },

        redFlags: [
          "Severe anxiety affecting participation",
          "Complete withdrawal from activities",
          "Excessive negative self-talk",
          "Signs of deeper emotional issues",
        ],

        parentExplanation:
          "Confidence in hockey affects everything - willingness to go to the puck, competing in battles, and recovering from mistakes. Hockey is hard! We build confidence through achievable challenges and celebrating effort. The most important thing: focus on effort and enjoyment, not results. Your child's confidence is affected by how you respond to their play.",

        homeActivities: [
          "Celebrate effort, not just goals/wins",
          "Focus on what they enjoyed",
          "Share your own failure stories",
          "Avoid comparison to others",
          "Focus on improvement",
        ],

        bestAssessedIn: [
          "Puck battle situations",
          "Response to mistakes",
          "Challenging situations",
          "General observation",
        ],
        assessmentFrequency: "Ongoing observation throughout season",
        assessmentDuration: "Builds picture over multiple sessions",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Hockey IQ
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Hockey IQ",
      slug: "hockey-iq",
      description:
        "The ability to read and understand the game, anticipate plays, and make smart decisions on the ice.",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 31,

      progressionLevels: {
        1: "Doesn't understand game; makes poor decisions; no anticipation",
        2: "Beginning to understand; sometimes makes good plays; reactive not proactive",
        3: "Good understanding; reads plays developing; makes smart decisions usually",
        4: "High hockey IQ; anticipates plays; sees ice well; creates advantages",
        5: "Elite hockey sense; thinks multiple plays ahead; makes others better",
      },

      observableBehaviors: [
        "Anticipates where puck will go",
        "Makes good decisions with puck",
        "Understands positioning",
        "Reads defensive/offensive setups",
        "Knows when to shoot/pass/carry",
      ],

      commonMistakes: [
        "Always same decision regardless of situation",
        "Doesn't see open teammates",
        "Holds puck too long or not long enough",
        "Wrong reads on plays",
        "Reactive instead of proactive",
      ],

      coachingTips: [
        "'Read the play!' - see what's developing",
        "'What do you see?' - ask about decisions",
        "'Good choice!' - reinforce smart plays",
        "'Watch the game!' - encourage studying hockey",
        "'Think ahead!' - anticipation",
      ],

      tags: ["core", "psychological", "fundamental", "hockey-iq", "decision-making"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player doesn't understand the game. Poor decisions. No anticipation of plays.",
            observableBehaviors: [
              "No game understanding",
              "Poor decisions",
              "No anticipation",
              "Confused on ice",
              "Random play",
            ],
            commonMistakes: [
              "Always same action",
              "No awareness of options",
              "Doesn't understand situations",
              "Reactive only",
            ],
            coachingTips: [
              "Simple decision teaching",
              "Freeze and explain plays",
              "Watch hockey together",
              "'What should happen here?'",
            ],
            assessmentActivities: [
              "Decision quizzes",
              "Play explanation",
              "Simple situation reads",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to understand. Sometimes makes good decisions. Still mostly reactive.",
            observableBehaviors: [
              "Growing understanding",
              "Sometimes good decisions",
              "Mostly reactive",
              "Learning reads",
              "Improving awareness",
            ],
            commonMistakes: [
              "Still reactive",
              "Misses open plays",
              "Decision making slow",
              "Doesn't anticipate well",
            ],
            coachingTips: [
              "More complex situations",
              "Decision speed practice",
              "Film watching",
              "'What do you see?' questions",
            ],
            assessmentActivities: [
              "Situation recognition",
              "Decision drills",
              "Game film discussion",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Good understanding of game. Reads plays developing. Makes smart decisions usually.",
            observableBehaviors: [
              "Good understanding",
              "Reads plays",
              "Smart decisions",
              "Some anticipation",
              "Sees options",
            ],
            commonMistakes: [
              "Complex situations challenging",
              "May miss some reads",
              "Could anticipate more",
              "Pressure affects decisions",
            ],
            coachingTips: [
              "Advanced concepts",
              "Quicker reads",
              "Pressure decision making",
              "Film study",
            ],
            assessmentActivities: [
              "Complex situation drills",
              "Game observation",
              "Tactical quizzes",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "High hockey IQ. Anticipates plays. Sees ice well and creates advantages.",
            observableBehaviors: [
              "High IQ",
              "Anticipates plays",
              "Sees ice well",
              "Creates advantages",
              "Makes others better",
            ],
            commonMistakes: [
              "May see plays others don't",
              "Teammates may not understand",
            ],
            coachingTips: [
              "Leadership in reads",
              "Help others understand",
              "Advanced tactical",
              "Film leadership",
            ],
            assessmentActivities: [
              "Game impact observation",
              "Play creation tracking",
              "Tactical discussions",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite hockey sense. Thinks multiple plays ahead. Makes entire team better.",
            observableBehaviors: [
              "Elite sense",
              "Multiple plays ahead",
              "Makes team better",
              "Sees everything",
              "Game-changing IQ",
            ],
            commonMistakes: [
              "Teammates may not keep up",
            ],
            coachingTips: [
              "Continue challenging",
              "Leadership development",
              "Teaching others",
              "Maintain standard",
            ],
            assessmentActivities: [
              "Team impact",
              "Play prediction",
              "Elite analysis",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Hockey IQ takes years to develop. Young players are still learning the game. Focus on very simple concepts. Watching hockey helps develop understanding.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Hockey IQ should be developing. Can understand more complex concepts. Asking 'what do you see?' helps develop thinking. Film watching is valuable.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect developing hockey sense. Players should anticipate plays. Decision-making speed increases. Film study becomes valuable tool.",
          },
        },

        redFlags: [
          "Cannot understand basic concepts after extended time",
          "No improvement in decision making",
          "Persistent confusion about game situations",
          "Unable to learn from instruction",
        ],

        parentExplanation:
          "Hockey IQ is understanding the game - knowing what will happen next and making good decisions. It develops through playing AND watching hockey. Ask your child 'what did you see?' and 'why did you make that choice?' Watch hockey together and discuss what's happening. Great hockey sense takes years to develop!",

        homeActivities: [
          "Watch hockey together and discuss",
          "Ask 'what should happen here?'",
          "Play video games for hockey concepts",
          "Discuss plays after games",
          "Watch different positions",
        ],

        bestAssessedIn: [
          "Game situations",
          "Decision-making drills",
          "Tactical discussions",
          "Film review",
        ],
        assessmentFrequency: "Ongoing observation throughout season",
        assessmentDuration: "Builds picture over multiple games",
      },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SKILL: Competitiveness
    // ─────────────────────────────────────────────────────────────────────────
    {
      sportId: hockey.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Competitiveness",
      slug: "competitiveness",
      description:
        "The drive to compete, win battles, and play hard. The will to outwork opponents.",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      isCore: true,
      sortOrder: 32,

      progressionLevels: {
        1: "Doesn't compete; avoids battles; no urgency; gives up easily",
        2: "Competes sometimes; inconsistent effort; can be outworked",
        3: "Good compete level; battles hard; consistent effort; hates losing",
        4: "Highly competitive; wins most battles; relentless effort; inspires others",
        5: "Elite competitor; refuses to lose; competes every shift; raises team level",
      },

      observableBehaviors: [
        "Races to loose pucks",
        "Battles hard along boards",
        "Doesn't give up on plays",
        "Shows urgency in game situations",
        "Competes in practice too",
      ],

      commonMistakes: [
        "Watching instead of competing",
        "Giving up when behind",
        "Lazy on puck battles",
        "Quitting on plays",
        "Not racing for pucks",
      ],

      coachingTips: [
        "'Compete!' - constant reminder",
        "'Win the battle!' - puck battles",
        "'Don't give up!' - finish plays",
        "'Race for it!' - loose pucks",
        "'Great compete!' - praise effort",
      ],

      tags: ["core", "psychological", "fundamental", "compete", "effort", "mental"],

      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player doesn't compete. Avoids puck battles. No urgency. Gives up easily.",
            observableBehaviors: [
              "Doesn't compete",
              "Avoids battles",
              "No urgency",
              "Gives up",
              "Watches puck",
            ],
            commonMistakes: [
              "Standing and watching",
              "Letting others get puck",
              "No effort in battles",
              "Quitting on plays",
            ],
            coachingTips: [
              "Compete games in practice",
              "Reward any compete",
              "Build desire to win",
              "Make competing fun",
            ],
            assessmentActivities: [
              "Battle observation",
              "Loose puck races",
              "1v1 battles",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Competes sometimes but inconsistent. Can be outworked by others.",
            observableBehaviors: [
              "Competes sometimes",
              "Inconsistent effort",
              "Can be outworked",
              "Some urgency",
              "Improving",
            ],
            commonMistakes: [
              "Effort varies",
              "Gives up when hard",
              "Not consistent",
              "Lazy in practice",
            ],
            coachingTips: [
              "Consistent effort emphasis",
              "Compete games",
              "Praise all effort",
              "'Every puck!' mindset",
            ],
            assessmentActivities: [
              "Consistency tracking",
              "Practice compete",
              "Game battles",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Good compete level. Battles hard. Consistent effort. Hates losing.",
            observableBehaviors: [
              "Good compete",
              "Battles hard",
              "Consistent effort",
              "Hates losing",
              "Races for pucks",
            ],
            commonMistakes: [
              "May have off shifts",
              "Could compete more in blowouts",
              "Practice compete varies",
              "Fatigue affects compete",
            ],
            coachingTips: [
              "Every shift mentality",
              "Practice like game",
              "Compete when tired",
              "Leadership in compete",
            ],
            assessmentActivities: [
              "Shift-by-shift tracking",
              "Practice observation",
              "Game battles",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Highly competitive. Wins most battles. Relentless effort. Inspires teammates.",
            observableBehaviors: [
              "Highly competitive",
              "Wins battles",
              "Relentless",
              "Inspires others",
              "Never quits",
            ],
            commonMistakes: [
              "May take bad penalties",
              "Could channel better",
            ],
            coachingTips: [
              "Channel compete positively",
              "Smart compete",
              "Leadership role",
              "Maintain standard",
            ],
            assessmentActivities: [
              "Battle success rate",
              "Team inspiration",
              "Game impact",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite competitor. Refuses to lose. Competes every shift. Raises entire team's level.",
            observableBehaviors: [
              "Elite competitor",
              "Refuses to lose",
              "Every shift",
              "Raises team level",
              "Always competes",
            ],
            commonMistakes: [
              "May be too intense at times",
            ],
            coachingTips: [
              "Channel appropriately",
              "Leadership in compete",
              "Help others develop",
              "Maintain intensity",
            ],
            assessmentActivities: [
              "Team compete level",
              "Battle dominance",
              "Game impact",
            ],
          },
        },

        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Compete level varies widely. Some kids are naturally competitive, others less so. Focus on making competition fun. Don't expect consistent effort yet.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Compete should be developing. Battles matter more in games. Can teach 'compete every shift' mentality. Praise effort and compete.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect good compete level. Games are won by compete. Focus on consistent effort every shift. Leadership in compete emerges.",
          },
        },

        redFlags: [
          "Refuses to compete at all",
          "No effort despite encouragement",
          "Avoids all physical situations",
          "No improvement in compete over time",
        ],

        parentExplanation:
          "Competitiveness is the drive to compete and win battles. In hockey, this means racing for loose pucks, battling along the boards, and never giving up. Some kids are naturally more competitive - that's okay! We try to make competing fun and reward effort. At home, you can encourage compete by celebrating effort, not just results.",

        homeActivities: [
          "Competitive games (any sport)",
          "Celebrate effort and compete",
          "Watch hockey and notice battle winners",
          "Family competitions (fun)",
          "Don't let them win everything - compete is built through challenge",
        ],

        bestAssessedIn: [
          "Puck battles",
          "Loose puck races",
          "Board battles",
          "Game situations",
        ],
        assessmentFrequency: "Ongoing observation throughout season",
        assessmentDuration: "Builds picture over multiple games",
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

  console.log(`\nSeeded ${comprehensiveSkills.length} comprehensive hockey skills\n`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedHockeySkills()
    .then(() => {
      console.log("Hockey skills seeding complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

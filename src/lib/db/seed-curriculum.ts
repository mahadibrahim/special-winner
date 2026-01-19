import { getDb } from "./index";
import {
  developmentStages,
  skillDomains,
  skills,
  skillCategories,
  skillCategoryAssignments,
} from "./schema";
import { sports } from "./schema";
import { eq } from "drizzle-orm";

async function seedCurriculum() {
  console.log("🌱 Seeding curriculum data...");

  // ========================================
  // 1. DEVELOPMENT STAGES
  // ========================================
  console.log("Creating development stages...");
  const stagesData = [
    {
      name: "Discovery",
      slug: "discovery",
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
      name: "Fundamentals",
      slug: "fundamentals",
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
      name: "Skill Building",
      slug: "skill-building",
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
      coachRole: "Developer - Guide skill refinement, introduce tactical concepts through questions",
      sortOrder: 3,
    },
    {
      name: "Development",
      slug: "development",
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
      name: "Competitive",
      slug: "competitive",
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
      name: "Refinement",
      slug: "refinement",
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

  const insertedStages = await getDb()
    .insert(developmentStages)
    .values(stagesData)
    .onConflictDoNothing()
    .returning();

  // Create a map of stage slugs to IDs
  const allStages = await getDb().select().from(developmentStages);
  const stageMap = new Map(allStages.map((s) => [s.slug, s.id]));

  console.log(`✓ Created ${insertedStages.length} development stages`);

  // ========================================
  // 2. SKILL DOMAINS
  // ========================================
  console.log("Creating skill domains...");
  const domainsData = [
    {
      name: "technical" as const,
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
      name: "tactical" as const,
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
      name: "physical" as const,
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
      name: "psychological" as const,
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

  const insertedDomains = await getDb()
    .insert(skillDomains)
    .values(domainsData)
    .onConflictDoNothing()
    .returning();

  // Create a map of domain names to IDs
  const allDomains = await getDb().select().from(skillDomains);
  const domainMap = new Map(allDomains.map((d) => [d.name, d.id]));

  console.log(`✓ Created ${insertedDomains.length} skill domains`);

  // ========================================
  // 3. GET SPORT IDs
  // ========================================
  const allSports = await getDb().select().from(sports);
  const sportMap = new Map(allSports.map((s) => [s.slug, s.id]));

  const soccerId = sportMap.get("soccer");
  const basketballId = sportMap.get("basketball");

  if (!soccerId || !basketballId) {
    console.log("⚠️ Soccer or Basketball not found. Run seed.ts first.");
    return;
  }

  // ========================================
  // 4. SOCCER SKILLS
  // ========================================
  console.log("Creating soccer skills...");
  const soccerSkills = [
    // FUNDAMENTALS STAGE (6-8) - Technical
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Ball Mastery - Toe Taps",
      slug: "soccer-ball-mastery-toe-taps",
      description: "Alternating toe taps on top of the ball with control and rhythm",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Loses balance frequently, ball moves away",
        2: "Can do 5-10 taps with some control",
        3: "Consistent 20+ taps with good rhythm",
        4: "Fast rhythm, head up occasionally",
        5: "Can perform while moving, head up, various speeds",
      },
      observableBehaviors: ["Keeps ball close", "Alternates feet", "Maintains balance"],
      commonMistakes: ["Looking only at ball", "Stiff ankles", "Leaning too far forward"],
      coachingTips: [
        "Start slow, build rhythm",
        "Light touches",
        "Encourage head up between touches",
      ],
      tags: ["ball control", "foundation", "dribbling"],
      isCore: true,
      sortOrder: 1,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Inside of Foot Pass",
      slug: "soccer-inside-foot-pass",
      description: "Passing the ball using the inside of the foot to a stationary partner",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Inconsistent contact, ball goes in wrong direction",
        2: "Ball reaches partner but lacks accuracy",
        3: "Accurate passes to stationary targets",
        4: "Accurate passes with appropriate pace",
        5: "Can vary weight and adjust to moving targets",
      },
      observableBehaviors: [
        "Non-kicking foot points to target",
        "Locked ankle",
        "Follow through toward target",
      ],
      commonMistakes: [
        "Toe kick instead of side foot",
        "Non-kicking foot pointed wrong direction",
        "No follow through",
      ],
      coachingTips: [
        "Point your belly button at your target",
        "Lock your ankle",
        "Land on your kicking foot",
      ],
      tags: ["passing", "foundation", "technique"],
      isCore: true,
      sortOrder: 2,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Dribbling with Inside/Outside",
      slug: "soccer-dribbling-inside-outside",
      description: "Moving with the ball using inside and outside of both feet",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Ball gets away, can't use both surfaces",
        2: "Can dribble but only with preferred foot",
        3: "Uses both feet and both surfaces at slow speed",
        4: "Good control at medium speed, can change direction",
        5: "Close control at speed, can dribble past defenders",
      },
      observableBehaviors: ["Ball stays within playing distance", "Uses both feet", "Head up"],
      commonMistakes: ["Kicking ball too far ahead", "Using only one foot", "Always looking down"],
      coachingTips: [
        "Lots of small touches",
        "Use all parts of your foot",
        "What do you see ahead of you?",
      ],
      tags: ["dribbling", "foundation", "ball control"],
      isCore: true,
      sortOrder: 3,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Receiving with Inside of Foot",
      slug: "soccer-receiving-inside-foot",
      description: "Stopping/controlling a rolling ball with the inside of the foot",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Ball bounces away off foot",
        2: "Can stop ball but it rolls too far",
        3: "Clean first touch that keeps ball close",
        4: "Receives into space, sets up next action",
        5: "Receives under pressure, plays quickly",
      },
      observableBehaviors: [
        "Moves to meet the ball",
        "Cushions on contact",
        "First touch sets up second action",
      ],
      commonMistakes: [
        "Stopping with toe",
        "Rigid ankle on contact",
        "First touch too heavy or too soft",
      ],
      coachingTips: [
        "Soft foot like a pillow",
        "Move your foot back as ball arrives",
        "Where will you go next?",
      ],
      tags: ["receiving", "first touch", "foundation"],
      isCore: true,
      sortOrder: 4,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Shooting with Laces",
      slug: "soccer-shooting-laces",
      description: "Striking the ball with the instep (laces) toward goal",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Inconsistent contact, ball goes in random directions",
        2: "Can strike with laces but lacks power or accuracy",
        3: "Consistent contact, on target from close range",
        4: "Good power and accuracy from various angles",
        5: "Can shoot quickly, on target under pressure",
      },
      observableBehaviors: ["Approaches at angle", "Plants foot beside ball", "Follows through"],
      commonMistakes: [
        "Running straight at ball",
        "Leaning back (ball goes high)",
        "No follow through",
      ],
      coachingTips: ["Toe down, ankle locked", "Lean over the ball", "Hit through the middle"],
      tags: ["shooting", "striking", "technique"],
      isCore: true,
      sortOrder: 5,
    },
    // FUNDAMENTALS STAGE - Physical
    {
      sportId: soccerId,
      domainId: domainMap.get("physical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Agility - Change of Direction",
      slug: "soccer-agility-cod",
      description: "Ability to quickly change direction while running",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Slow direction changes, loses balance",
        2: "Can change direction but slows significantly",
        3: "Smooth direction changes at moderate speed",
        4: "Quick direction changes, maintains speed",
        5: "Explosive changes, can fake and deceive",
      },
      observableBehaviors: ["Low center of gravity", "Quick feet", "Body control"],
      commonMistakes: ["Standing too tall", "Crossing feet", "Losing balance"],
      coachingTips: [
        "Bend your knees",
        "Small quick steps before changing",
        "Push off the outside foot",
      ],
      tags: ["agility", "movement", "physical"],
      isCore: true,
      sortOrder: 10,
    },
    // FUNDAMENTALS STAGE - Tactical
    {
      sportId: soccerId,
      domainId: domainMap.get("tactical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Finding Space",
      slug: "soccer-finding-space",
      description: "Moving to open areas away from opponents",
      introductionAge: 7,
      assessmentMethod: "game" as const,
      progressionLevels: {
        1: "Follows the ball everywhere (magnet effect)",
        2: "Sometimes finds space but doesn't hold it",
        3: "Consistently finds open space",
        4: "Creates space with movement, makes self available",
        5: "Anticipates play, finds space before needed",
      },
      observableBehaviors: ["Looks for gaps", "Moves away from opponents", "Shows for the ball"],
      commonMistakes: ["Ball watching", "Standing still", "Hiding behind opponents"],
      coachingTips: [
        "Can your teammate see you?",
        "Where is the space?",
        "Move when they're not looking",
      ],
      tags: ["tactical", "movement off ball", "positioning"],
      isCore: true,
      sortOrder: 20,
    },
    // FUNDAMENTALS STAGE - Psychological
    {
      sportId: soccerId,
      domainId: domainMap.get("psychological")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Coachability",
      slug: "soccer-coachability-fundamentals",
      description: "Receptiveness to instruction, feedback, and trying new things",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
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
      ],
      commonMistakes: [],
      coachingTips: [
        "Catch them doing something right",
        "Make feedback specific and immediate",
        "Ask what they noticed",
      ],
      tags: ["psychological", "attitude", "learning"],
      isCore: true,
      sortOrder: 30,
    },

    // SKILL BUILDING STAGE (9-10) - Technical
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("skill-building")!,
      name: "1v1 Dribbling Moves",
      slug: "soccer-1v1-moves",
      description: "Performing dribbling moves to beat a defender (step-over, scissors, feints)",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Cannot execute any moves",
        2: "Knows 1-2 moves but can't apply in games",
        3: "Can execute 2-3 moves in game situations",
        4: "Multiple moves, good timing",
        5: "Creative, unpredictable, beats defenders consistently",
      },
      observableBehaviors: ["Change of pace", "Body feint", "Acceleration after move"],
      commonMistakes: [
        "Performing move too far from defender",
        "No change of speed",
        "Telegraphing the move",
      ],
      coachingTips: [
        "Get close to the defender first",
        "Sell the fake with your body",
        "Explode into the space",
      ],
      tags: ["dribbling", "1v1", "moves", "technique"],
      isCore: true,
      sortOrder: 6,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("skill-building")!,
      name: "Turning with Ball",
      slug: "soccer-turning-with-ball",
      description:
        "Changing direction with the ball under control (inside hook, outside hook, Cruyff turn)",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Loses ball when trying to turn",
        2: "Can execute one type of turn slowly",
        3: "Multiple turns, can select appropriate one",
        4: "Quick, deceptive turns under pressure",
        5: "Creates space with turns, sets up next action",
      },
      observableBehaviors: ["Shielding ball during turn", "Head up after turn", "Good first touch"],
      commonMistakes: [
        "Turning into pressure",
        "Losing sight of surroundings",
        "Ball getting stuck under feet",
      ],
      coachingTips: [
        "Check shoulder before receiving",
        "Turn into space, not pressure",
        "Which way is the defender going?",
      ],
      tags: ["turning", "ball control", "technique"],
      isCore: true,
      sortOrder: 7,
    },
    // SKILL BUILDING STAGE - Tactical
    {
      sportId: soccerId,
      domainId: domainMap.get("tactical")!,
      stageId: stageMap.get("skill-building")!,
      name: "When to Dribble vs Pass",
      slug: "soccer-dribble-vs-pass",
      description: "Recognizing whether to dribble or pass based on game situation",
      introductionAge: 9,
      assessmentMethod: "game" as const,
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
      ],
      commonMistakes: [
        "Head down, not seeing options",
        "Dribbling into crowds",
        "Passing when dribble would be better",
      ],
      coachingTips: [
        "What do you see?",
        "Is there a teammate in a better position?",
        "Is there space ahead of you?",
      ],
      tags: ["decision making", "tactical", "game intelligence"],
      isCore: true,
      sortOrder: 21,
    },

    // DEVELOPMENT STAGE (11-12) - Technical
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("development")!,
      name: "Long Passing",
      slug: "soccer-long-passing",
      description: "Accurate long-range passes using laces or inside of foot",
      introductionAge: 11,
      assessmentMethod: "observation" as const,
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
      ],
      commonMistakes: ["Leaning back", "No follow through", "Striking too low (ball pops up)"],
      coachingTips: [
        "Approach at angle",
        "Lock ankle, toe down",
        "Keep head over ball for driven pass",
      ],
      tags: ["passing", "technique", "long range"],
      isCore: true,
      sortOrder: 8,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("development")!,
      name: "Heading - Defensive",
      slug: "soccer-heading-defensive",
      description: "Clearing the ball with the forehead away from danger",
      introductionAge: 11,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Afraid of ball, closes eyes",
        2: "Makes contact but poor direction/power",
        3: "Consistent contact, can direct header",
        4: "Good power and direction, wins aerial duels",
        5: "Dominant in the air, heads to teammates",
      },
      observableBehaviors: ["Eyes open", "Forehead contact", "Attack the ball"],
      commonMistakes: [
        "Heading with top of head",
        "Waiting for ball to hit you",
        "Eyes closed before contact",
      ],
      coachingTips: [
        "Watch the ball onto your forehead",
        "Go get it, don't let it hit you",
        "Head through the ball",
      ],
      tags: ["heading", "technique", "defending"],
      isCore: false,
      sortOrder: 9,
    },
    // DEVELOPMENT STAGE - Tactical
    {
      sportId: soccerId,
      domainId: domainMap.get("tactical")!,
      stageId: stageMap.get("development")!,
      name: "Positional Awareness",
      slug: "soccer-positional-awareness",
      description: "Understanding and maintaining proper position relative to teammates and ball",
      introductionAge: 11,
      assessmentMethod: "game" as const,
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
      ],
      commonMistakes: [
        "Ball watching while out of position",
        "Too close to teammates (bunching)",
        "Too far from play",
      ],
      coachingTips: [
        "Where should you be if the ball is here?",
        "Can you see the ball and your player?",
        "Check your shape",
      ],
      tags: ["tactical", "positioning", "shape"],
      isCore: true,
      sortOrder: 22,
    },
  ];

  const insertedSoccerSkills = await getDb()
    .insert(skills)
    .values(soccerSkills)
    .onConflictDoNothing()
    .returning();

  console.log(`✓ Created ${insertedSoccerSkills.length} soccer skills`);

  // ========================================
  // 5. BASKETBALL SKILLS
  // ========================================
  console.log("Creating basketball skills...");
  const basketballSkills = [
    // FUNDAMENTALS STAGE (6-8) - Technical
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Stationary Ball Handling",
      slug: "basketball-stationary-ball-handling",
      description: "Controlling the ball while standing still (pounds, wraps, figure 8)",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Loses ball frequently, can't control",
        2: "Can do basic pounds with dominant hand",
        3: "Controls ball with both hands, various movements",
        4: "Smooth transitions between moves, head up",
        5: "Creative combinations, eyes never on ball",
      },
      observableBehaviors: ["Fingers spread", "Ball control", "Uses both hands"],
      commonMistakes: [
        "Slapping at ball (palm dribble)",
        "Eyes always on ball",
        "Only using dominant hand",
      ],
      coachingTips: [
        "Push the ball, don't slap it",
        "Use your fingertips",
        "Look at me while you dribble",
      ],
      tags: ["ball handling", "foundation", "dribbling"],
      isCore: true,
      sortOrder: 1,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Two-Hand Chest Pass",
      slug: "basketball-chest-pass",
      description: "Passing the ball with two hands from the chest to a partner",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Inconsistent, ball doesn't reach target",
        2: "Reaches partner but off target or weak",
        3: "Accurate passes with good form",
        4: "Quick, accurate passes on the move",
        5: "Can pass accurately while moving, under pressure",
      },
      observableBehaviors: ["Steps toward target", "Thumbs down on follow through", "Chest height"],
      commonMistakes: [
        "No step toward target",
        "Arms go out to sides",
        "Pass too high or too low",
      ],
      coachingTips: [
        "Step toward your target",
        "Thumbs down, pinkies up",
        "Snap those wrists",
      ],
      tags: ["passing", "foundation", "technique"],
      isCore: true,
      sortOrder: 2,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Two-Hand Bounce Pass",
      slug: "basketball-bounce-pass",
      description: "Passing the ball with a bounce to a partner",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Ball bounces unpredictably or too many times",
        2: "Can execute but inconsistent bounce point",
        3: "Consistent bounce, reaches partner at waist",
        4: "Good pace, accurate, can throw on the move",
        5: "Uses bounce pass appropriately in games",
      },
      observableBehaviors: ["Ball bounces 2/3 of the way", "Reaches waist height", "Good pace"],
      commonMistakes: [
        "Bouncing too close or too far",
        "Ball bounces too high or low",
        "No backspin",
      ],
      coachingTips: [
        "Aim 2/3 of the way to your partner",
        "Step and snap",
        "Backspin helps control",
      ],
      tags: ["passing", "foundation", "technique"],
      isCore: true,
      sortOrder: 3,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Form Shooting",
      slug: "basketball-form-shooting",
      description: "Proper shooting form from close range (BEEF: Balance, Eyes, Elbow, Follow through)",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "No consistent form, two-handed push",
        2: "Attempting one-hand shot, inconsistent",
        3: "Good form, makes close range shots",
        4: "Consistent form, extends range",
        5: "Smooth, quick release with proper form",
      },
      observableBehaviors: [
        "Elbow under ball",
        "Guide hand to side",
        "Follow through (gooseneck)",
      ],
      commonMistakes: [
        "Two-handed push shot",
        "Elbow out to side",
        "No follow through",
      ],
      coachingTips: [
        "Start close to basket",
        "Cookie jar on top of fridge",
        "Wave goodbye to the ball",
      ],
      tags: ["shooting", "foundation", "technique"],
      isCore: true,
      sortOrder: 4,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Layups - Dominant Hand",
      slug: "basketball-layup-dominant",
      description: "Finishing at the basket with dominant hand using proper footwork",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "No understanding of footwork or hand",
        2: "Correct footwork sometimes, inconsistent finish",
        3: "Consistent footwork and finish from one side",
        4: "Can finish layups from different angles",
        5: "Finishes layups at game speed, uses backboard",
      },
      observableBehaviors: ["Correct foot sequence", "Knee drive", "Uses backboard"],
      commonMistakes: [
        "Wrong foot/hand combination",
        "No knee drive",
        "Shooting too flat",
      ],
      coachingTips: [
        "Right-left-right for right layup",
        "Drive your knee up",
        "Kiss it off the glass",
      ],
      tags: ["layups", "finishing", "technique"],
      isCore: true,
      sortOrder: 5,
    },
    // FUNDAMENTALS STAGE - Physical
    {
      sportId: basketballId,
      domainId: domainMap.get("physical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Athletic Stance",
      slug: "basketball-athletic-stance",
      description: "Maintaining proper defensive/ready position",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Standing straight up, not ready",
        2: "Can get in stance but doesn't maintain",
        3: "Good stance, maintains for short periods",
        4: "Excellent stance, moves well in stance",
        5: "Natural stance, transitions smoothly",
      },
      observableBehaviors: ["Bent knees", "Hips back", "Hands ready", "On balls of feet"],
      commonMistakes: [
        "Standing straight up",
        "Feet too close together",
        "Weight on heels",
      ],
      coachingTips: [
        "Sit in your chair",
        "Wide base like a gorilla",
        "Hands up and active",
      ],
      tags: ["stance", "defense", "physical"],
      isCore: true,
      sortOrder: 10,
    },
    // FUNDAMENTALS STAGE - Tactical
    {
      sportId: basketballId,
      domainId: domainMap.get("tactical")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Spacing Awareness",
      slug: "basketball-spacing",
      description: "Maintaining proper distance from teammates (not bunching up)",
      introductionAge: 7,
      assessmentMethod: "game" as const,
      progressionLevels: {
        1: "Always in same area as ball/teammates",
        2: "Sometimes spreads out when reminded",
        3: "Understands spacing, maintains most of time",
        4: "Creates space, recognizes when to fill",
        5: "Excellent floor awareness, helps organize teammates",
      },
      observableBehaviors: ["Spread out", "Fill empty spots", "Create passing angles"],
      commonMistakes: [
        "Bunching around ball",
        "Standing in corner all game",
        "Moving to same spot as teammate",
      ],
      coachingTips: [
        "Spread out like a pizza",
        "If your teammate moves, you move",
        "Can I see all my teammates?",
      ],
      tags: ["spacing", "tactical", "positioning"],
      isCore: true,
      sortOrder: 20,
    },
    // FUNDAMENTALS STAGE - Psychological
    {
      sportId: basketballId,
      domainId: domainMap.get("psychological")!,
      stageId: stageMap.get("fundamentals")!,
      name: "Effort & Hustle",
      slug: "basketball-effort-hustle",
      description: "Giving maximum effort regardless of score or situation",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Low energy, gives up easily",
        2: "Tries hard when motivated",
        3: "Consistent effort in most situations",
        4: "High effort all the time, inspires teammates",
        5: "Relentless effort, dives for loose balls",
      },
      observableBehaviors: ["Sprints in transition", "Chases loose balls", "Gets back on defense"],
      commonMistakes: [],
      coachingTips: [
        "Hustle never has a bad day",
        "You control your effort",
        "Sprint everywhere",
      ],
      tags: ["effort", "psychological", "attitude"],
      isCore: true,
      sortOrder: 30,
    },

    // SKILL BUILDING STAGE (9-10) - Technical
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("skill-building")!,
      name: "Dribbling on the Move",
      slug: "basketball-dribble-moving",
      description: "Controlling the ball while moving at various speeds",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Loses ball frequently when moving",
        2: "Can dribble while walking",
        3: "Good control at jogging speed, both hands",
        4: "Control at full speed with either hand",
        5: "Can change pace and direction at speed",
      },
      observableBehaviors: ["Ball at hip level", "Eyes up", "Changes hands smoothly"],
      commonMistakes: [
        "Dribbling too high",
        "Carrying/palming",
        "Only using dominant hand",
      ],
      coachingTips: [
        "Keep it low, keep it tight",
        "Push the ball ahead as you speed up",
        "Use your weak hand!",
      ],
      tags: ["dribbling", "ball handling", "technique"],
      isCore: true,
      sortOrder: 6,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("skill-building")!,
      name: "Layups - Weak Hand",
      slug: "basketball-layup-weak",
      description: "Finishing at the basket with non-dominant hand",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Cannot finish with weak hand",
        2: "Footwork correct but misses most",
        3: "Can finish weak hand layups in drills",
        4: "Consistent in drills, uses in games sometimes",
        5: "Equally comfortable both hands in games",
      },
      observableBehaviors: [
        "Correct foot sequence (opposite of dominant)",
        "Uses backboard",
        "Attacks basket",
      ],
      commonMistakes: [
        "Using dominant hand from weak side",
        "Wrong footwork",
        "Avoiding weak hand",
      ],
      coachingTips: [
        "Left-right-left for left layup",
        "Practice twice as much on weak side",
        "Challenge yourself in games",
      ],
      tags: ["layups", "finishing", "weak hand"],
      isCore: true,
      sortOrder: 7,
    },
    // SKILL BUILDING STAGE - Tactical
    {
      sportId: basketballId,
      domainId: domainMap.get("tactical")!,
      stageId: stageMap.get("skill-building")!,
      name: "Give and Go",
      slug: "basketball-give-and-go",
      description: "Passing and cutting to the basket to receive return pass",
      introductionAge: 9,
      assessmentMethod: "game" as const,
      progressionLevels: {
        1: "Doesn't move after passing",
        2: "Sometimes cuts but wrong direction",
        3: "Cuts correctly, can finish when open",
        4: "Good timing, reads defense",
        5: "Creates for teammates, varies cuts",
      },
      observableBehaviors: ["Pass and move", "Reads defender", "Calls for ball"],
      commonMistakes: [
        "Standing after passing",
        "Cutting into congestion",
        "Not calling for ball",
      ],
      coachingTips: [
        "Pass and move, don't stand and watch",
        "Cut to where the defender isn't",
        "Show your hands",
      ],
      tags: ["cutting", "tactical", "offense"],
      isCore: true,
      sortOrder: 21,
    },

    // DEVELOPMENT STAGE (11-12) - Technical
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("development")!,
      name: "Pull-Up Jump Shot",
      slug: "basketball-pullup-jumper",
      description: "Stopping off the dribble to shoot a jump shot",
      introductionAge: 11,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Can't stop and shoot properly",
        2: "Can execute but slow and off balance",
        3: "Consistent form, makes some shots",
        4: "Quick stop, good balance, game ready",
        5: "Creates shot off dribble, high percentage",
      },
      observableBehaviors: ["Quick stop", "Squared to basket", "Proper shooting form"],
      commonMistakes: [
        "Drifting on shot",
        "Rushing the shot",
        "Not squaring up",
      ],
      coachingTips: [
        "Get your feet under you",
        "Stop with balance before shooting",
        "Same form as catch and shoot",
      ],
      tags: ["shooting", "technique", "off dribble"],
      isCore: true,
      sortOrder: 8,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      stageId: stageMap.get("development")!,
      name: "Crossover Dribble",
      slug: "basketball-crossover",
      description: "Changing direction with a quick crossover dribble",
      introductionAge: 11,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Cannot execute crossover",
        2: "Can cross over but slow and high",
        3: "Quick crossover in drills",
        4: "Uses effectively in games, change of pace",
        5: "Can chain moves, ankle-breaking crossovers",
      },
      observableBehaviors: ["Low dribble", "Quick change", "Shoulder/head fake"],
      commonMistakes: [
        "Crossing too high",
        "No change of pace",
        "Carrying the ball",
      ],
      coachingTips: [
        "Low and tight",
        "Sell the fake with your eyes",
        "Explode to the basket",
      ],
      tags: ["dribbling", "moves", "technique"],
      isCore: true,
      sortOrder: 9,
    },
    // DEVELOPMENT STAGE - Tactical
    {
      sportId: basketballId,
      domainId: domainMap.get("tactical")!,
      stageId: stageMap.get("development")!,
      name: "Help Defense",
      slug: "basketball-help-defense",
      description: "Understanding when and how to provide defensive help",
      introductionAge: 11,
      assessmentMethod: "game" as const,
      progressionLevels: {
        1: "Only guards own player, doesn't help",
        2: "Sometimes helps but loses own player",
        3: "Good help position, can recover",
        4: "Excellent help and recover, talks",
        5: "Quarterback of defense, anticipates plays",
      },
      observableBehaviors: ["Sees ball and man", "In gap", "Talks to teammates"],
      commonMistakes: [
        "Ball watching (loses player)",
        "Over-helping (giving up easy shot)",
        "No communication",
      ],
      coachingTips: [
        "Ball-you-man triangle",
        "One foot in the paint",
        "Talk! 'Help left!'",
      ],
      tags: ["defense", "tactical", "team defense"],
      isCore: true,
      sortOrder: 22,
    },
  ];

  const insertedBasketballSkills = await getDb()
    .insert(skills)
    .values(basketballSkills)
    .onConflictDoNothing()
    .returning();

  console.log(`✓ Created ${insertedBasketballSkills.length} basketball skills`);

  // ========================================
  // 6. SKILL CATEGORIES (Optional grouping)
  // ========================================
  console.log("Creating skill categories...");
  const categoriesData = [
    // Soccer categories
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      name: "Ball Control",
      description: "Skills related to controlling and manipulating the ball",
      sortOrder: 1,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      name: "Passing",
      description: "All passing techniques",
      sortOrder: 2,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      name: "Dribbling",
      description: "Moving with the ball",
      sortOrder: 3,
    },
    {
      sportId: soccerId,
      domainId: domainMap.get("technical")!,
      name: "Shooting",
      description: "Finishing and shooting techniques",
      sortOrder: 4,
    },
    // Basketball categories
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      name: "Ball Handling",
      description: "Dribbling and ball control skills",
      sortOrder: 1,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      name: "Passing",
      description: "All passing techniques",
      sortOrder: 2,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      name: "Shooting",
      description: "All shooting techniques",
      sortOrder: 3,
    },
    {
      sportId: basketballId,
      domainId: domainMap.get("technical")!,
      name: "Finishing",
      description: "Layups and close-range finishing",
      sortOrder: 4,
    },
  ];

  const insertedCategories = await getDb()
    .insert(skillCategories)
    .values(categoriesData)
    .onConflictDoNothing()
    .returning();

  console.log(`✓ Created ${insertedCategories.length} skill categories`);

  console.log("✅ Curriculum seeding complete!");
  console.log(`
Summary:
- ${allStages.length} development stages
- ${allDomains.length} skill domains
- ${insertedSoccerSkills.length} soccer skills
- ${insertedBasketballSkills.length} basketball skills
- ${insertedCategories.length} skill categories
  `);
}

seedCurriculum()
  .catch((error) => {
    console.error("❌ Curriculum seeding failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

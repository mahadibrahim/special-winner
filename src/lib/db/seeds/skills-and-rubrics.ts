import { db } from "../index";
import { skills } from "../schema/curriculum";
import { assessmentRubrics } from "../schema/assessments";
import { developmentStages, skillDomains } from "../schema/curriculum";
import { sports } from "../schema/sports";
import { eq } from "drizzle-orm";

// Level names for consistency
const LEVEL_NAMES = {
  1: "Emerging",
  2: "Developing",
  3: "Competent",
  4: "Proficient",
  5: "Advanced",
};

export async function seedSkillsAndRubrics() {
  console.log("Seeding skills and assessment rubrics...");

  // Get sports
  const [soccer] = await db.select().from(sports).where(eq(sports.slug, "soccer"));
  const [basketball] = await db.select().from(sports).where(eq(sports.slug, "basketball"));

  if (!soccer || !basketball) {
    console.log("  ⚠ Soccer or Basketball sport not found, skipping skills");
    return;
  }

  // Get development stages
  const stages = await db.select().from(developmentStages);
  const fundamentals = stages.find((s) => s.slug === "fundamentals");
  const skillBuilding = stages.find((s) => s.slug === "skill-building");
  const development = stages.find((s) => s.slug === "development");

  if (!fundamentals || !skillBuilding || !development) {
    console.log("  ⚠ Development stages not found, skipping skills");
    return;
  }

  // Get skill domains
  const domains = await db.select().from(skillDomains);
  const technical = domains.find((d) => d.name === "technical");
  const tactical = domains.find((d) => d.name === "tactical");
  const physical = domains.find((d) => d.name === "physical");
  const psychological = domains.find((d) => d.name === "psychological");

  if (!technical || !tactical || !physical || !psychological) {
    console.log("  ⚠ Skill domains not found, skipping skills");
    return;
  }

  // ============================================================
  // SOCCER SKILLS
  // ============================================================

  const soccerSkills = [
    // === TECHNICAL - FUNDAMENTALS ===
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Ball Control",
      slug: "soccer-ball-control-fundamentals",
      description: "Ability to keep the ball close while stationary and moving at slow speeds",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Struggles to keep ball close, frequently loses control",
        2: "Can control ball while stationary, loses it when moving",
        3: "Maintains control while walking, some control while jogging",
        4: "Good control while jogging, can use both feet",
        5: "Excellent control at various speeds, uses multiple surfaces",
      },
      observableBehaviors: [
        "Keeps ball within playing distance",
        "Uses inside, outside, and sole of foot",
        "Can change direction without losing ball",
        "Eyes up occasionally while dribbling",
      ],
      commonMistakes: [
        "Kicking ball too far ahead",
        "Only using dominant foot",
        "Looking down constantly",
        "Stiff ankles",
      ],
      coachingTips: [
        "Use soft touches - like petting a puppy",
        "Keep the ball close enough to touch anytime",
        "Try using different parts of your foot",
        "Practice in small spaces",
      ],
      tags: ["dribbling", "control", "foundational"],
      isCore: true,
    },
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Passing",
      slug: "soccer-passing-fundamentals",
      description: "Basic ability to pass the ball to a teammate using the inside of the foot",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Struggles to make contact with ball correctly, no direction control",
        2: "Can pass but accuracy is inconsistent, often too hard or soft",
        3: "Passes reach teammate most of the time at short distances",
        4: "Accurate passes at various distances, consistent technique",
        5: "Excellent accuracy with both feet, can weight passes appropriately",
      },
      observableBehaviors: [
        "Plant foot points toward target",
        "Ankle locked on contact",
        "Follows through toward target",
        "Uses inside of foot consistently",
      ],
      commonMistakes: [
        "Toe poking instead of side-foot",
        "Plant foot too far from ball",
        "No follow-through",
        "Looking at ball, not target",
      ],
      coachingTips: [
        "Plant foot points where you want to pass",
        "Lock your ankle like a hammer",
        "Push through the middle of the ball",
        "Keep your eye on the ball until you kick it",
      ],
      tags: ["passing", "technique", "foundational"],
      isCore: true,
    },
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Receiving",
      slug: "soccer-receiving-fundamentals",
      description: "Ability to control an incoming pass and keep the ball close",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Ball bounces off, struggles to control",
        2: "Can stop ball but takes multiple touches",
        3: "Controls ball in 1-2 touches on ground passes",
        4: "Good first touch, can receive on move",
        5: "Excellent first touch in any direction, prepares for next action",
      },
      observableBehaviors: [
        "Moves to meet the ball",
        "Cushions ball on contact",
        "First touch keeps ball playable",
        "Body positioned to see field",
      ],
      commonMistakes: [
        "Standing flat-footed waiting",
        "Stiff leg on reception",
        "Ball bouncing away",
        "Not watching ball all the way in",
      ],
      coachingTips: [
        "Go to the ball, don't wait for it",
        "Soft foot like a pillow catching the ball",
        "Touch the ball away from defenders",
        "Be ready before the ball arrives",
      ],
      tags: ["receiving", "first touch", "foundational"],
      isCore: true,
    },
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Shooting",
      slug: "soccer-shooting-fundamentals",
      description: "Basic ability to strike the ball toward goal",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Struggles to make solid contact, shots go in random directions",
        2: "Can strike ball but accuracy is poor, often off target",
        3: "Shots go toward goal most of the time, some power",
        4: "Accurate shots with good power, can aim to corners",
        5: "Excellent technique, can shoot with power and placement",
      },
      observableBehaviors: [
        "Strikes through middle of ball",
        "Non-kicking foot beside ball",
        "Follows through toward target",
        "Keeps body over ball",
      ],
      commonMistakes: [
        "Leaning back (ball goes high)",
        "Toe poke shooting",
        "No follow through",
        "Looking at goalkeeper instead of goal",
      ],
      coachingTips: [
        "Plant foot beside the ball",
        "Lean over the ball to keep it down",
        "Strike through the middle of the ball",
        "Aim for corners, not center of goal",
      ],
      tags: ["shooting", "striking", "foundational"],
      isCore: true,
    },

    // === TECHNICAL - SKILL BUILDING ===
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: skillBuilding.id,
      name: "Dribbling with Speed",
      slug: "soccer-speed-dribbling",
      description: "Ability to dribble at speed while maintaining control",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Loses ball frequently when trying to go fast",
        2: "Can dribble at medium speed but control suffers at full speed",
        3: "Maintains control at 70% speed, occasional touches with both feet",
        4: "Good control at high speed, uses outside of foot effectively",
        5: "Excellent control at full speed, can change direction without slowing",
      },
      observableBehaviors: [
        "Pushes ball with outside of foot at speed",
        "Longer touches in open space",
        "Smaller touches near defenders",
        "Head up to see field",
      ],
      commonMistakes: [
        "Ball too close when running",
        "Only using one foot",
        "Head down constantly",
        "Not accelerating after beating defender",
      ],
      coachingTips: [
        "Push ball ahead and run to it in open space",
        "Outside of foot is best for speed",
        "Look up every few touches",
        "Change speeds to unbalance defenders",
      ],
      tags: ["dribbling", "speed", "attacking"],
      isCore: true,
    },
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: skillBuilding.id,
      name: "Turning with Ball",
      slug: "soccer-turning",
      description: "Ability to change direction with the ball using various turns",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Cannot turn without stopping, loses ball on turns",
        2: "Can do basic pull-back turn but slowly",
        3: "Executes 2-3 turn types with reasonable speed",
        4: "Smooth execution of multiple turn types, both directions",
        5: "Explosive turns, selects appropriate turn for situation",
      },
      observableBehaviors: [
        "Executes Cruyff turn",
        "Uses inside and outside hook",
        "Can do drag back at speed",
        "Checks shoulder before turning",
      ],
      commonMistakes: [
        "Telegraphing the turn",
        "Not protecting ball during turn",
        "Turning into pressure",
        "Slow execution",
      ],
      coachingTips: [
        "Check shoulder BEFORE receiving",
        "Sell the fake before turning",
        "Accelerate out of the turn",
        "Use your body to shield",
      ],
      tags: ["dribbling", "turns", "technique"],
      isCore: false,
    },
    {
      sportId: soccer.id,
      domainId: technical.id,
      stageId: skillBuilding.id,
      name: "1v1 Moves",
      slug: "soccer-1v1-moves",
      description: "Ability to beat a defender using skill moves",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Runs into defenders, no moves attempted",
        2: "Attempts moves but execution is poor, easily read",
        3: "Can execute 2-3 moves in practice, struggles in games",
        4: "Effective moves in games, can beat defender consistently",
        5: "Creative and unpredictable, chains moves together",
      },
      observableBehaviors: [
        "Uses step-overs effectively",
        "Can execute scissors move",
        "Uses body feints to unbalance defender",
        "Changes pace before and after moves",
      ],
      commonMistakes: [
        "Move too far from defender",
        "No change of pace",
        "Same move every time",
        "Ball too far away during move",
      ],
      coachingTips: [
        "Get close to defender before move",
        "Sell the fake with your body",
        "Explode past after the move",
        "Have 2-3 go-to moves",
      ],
      tags: ["dribbling", "1v1", "creativity"],
      isCore: true,
    },

    // === TACTICAL - FUNDAMENTALS ===
    {
      sportId: soccer.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Finding Space",
      slug: "soccer-finding-space-fundamentals",
      description: "Basic understanding of moving to open space",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Stands in one place, doesn't move off ball",
        2: "Moves but often into crowded areas",
        3: "Recognizes open space and moves there sometimes",
        4: "Consistently finds open space, supports ball carrier",
        5: "Creates space for self and others, times runs well",
      },
      observableBehaviors: [
        "Moves away from other players",
        "Creates passing angle for teammate",
        "Doesn't bunch up in one area",
        "Moves after passing",
      ],
      commonMistakes: [
        "Following the ball (beehive soccer)",
        "Hiding behind defenders",
        "Standing still off ball",
        "All players on same side",
      ],
      coachingTips: [
        "If you can't see the ball, the ball can't see you",
        "Spread out - imagine you're connected by ropes",
        "Move after you pass",
        "Find a window to receive",
      ],
      tags: ["movement", "spacing", "awareness"],
      isCore: true,
    },

    // === TACTICAL - SKILL BUILDING ===
    {
      sportId: soccer.id,
      domainId: tactical.id,
      stageId: skillBuilding.id,
      name: "Creating Passing Angles",
      slug: "soccer-passing-angles",
      description: "Understanding how to position to receive a pass",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Stands behind defenders, no angle created",
        2: "Sometimes moves to create angle but timing off",
        3: "Creates good angles, but positioning could improve",
        4: "Consistently creates passing lanes, good timing",
        5: "Excellent at creating and reading angles, helps teammates",
      },
      observableBehaviors: [
        "Checks away then comes to ball",
        "Creates triangle with ball and goal",
        "Stays on 'same page' as ball (can see it)",
        "Adjusts position as ball moves",
      ],
      commonMistakes: [
        "Standing in a straight line",
        "Behind defender's line of sight",
        "Not moving when angle closes",
        "Poor body position on receive",
      ],
      coachingTips: [
        "Can you see the ball? Then move until you can",
        "Check away to come back",
        "Make a triangle with the ball",
        "Show for the ball with your body open",
      ],
      tags: ["movement", "passing", "positioning"],
      isCore: true,
    },
    {
      sportId: soccer.id,
      domainId: tactical.id,
      stageId: skillBuilding.id,
      name: "Defending 1v1",
      slug: "soccer-defending-1v1",
      description: "Individual defending technique and decision-making",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Dives in, easily beaten, poor body position",
        2: "Sometimes delays but positioning is inconsistent",
        3: "Good stance, delays attacker, occasionally wins ball",
        4: "Consistent technique, wins majority of 1v1s",
        5: "Excellent reader of play, wins ball cleanly, forces errors",
      },
      observableBehaviors: [
        "Gets goal-side quickly",
        "Stays on feet, doesn't dive in",
        "Shows attacker one direction",
        "Times tackle appropriately",
      ],
      commonMistakes: [
        "Diving in immediately",
        "Ball watching (not the hips)",
        "Flat footed stance",
        "Turning back on attacker",
      ],
      coachingTips: [
        "Stay on your feet as long as possible",
        "Watch the ball and hips, not the feet",
        "Stay goal-side at all times",
        "Make the attacker go where you want",
      ],
      tags: ["defending", "1v1", "positioning"],
      isCore: true,
    },

    // === PHYSICAL - FUNDAMENTALS ===
    {
      sportId: soccer.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Agility",
      slug: "soccer-agility-fundamentals",
      description: "Ability to change direction quickly while maintaining balance",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Slow to change direction, loses balance often",
        2: "Can change direction but slowly, some balance issues",
        3: "Reasonable direction changes, maintains balance most times",
        4: "Quick direction changes, good balance, fluid movement",
        5: "Explosive direction changes, excellent body control",
      },
      observableBehaviors: [
        "Low center of gravity when changing direction",
        "Quick feet patterns",
        "Balanced throughout movements",
        "Can change direction at speed",
      ],
      commonMistakes: [
        "Standing too tall",
        "Crossing feet when moving laterally",
        "Wide base making changes slow",
        "Leaning too far",
      ],
      coachingTips: [
        "Stay low and balanced",
        "Quick, small steps",
        "Push off the outside foot",
        "Keep your core engaged",
      ],
      tags: ["physical", "agility", "movement"],
      isCore: true,
    },

    // === PSYCHOLOGICAL - FUNDAMENTALS ===
    {
      sportId: soccer.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Enjoyment of Play",
      slug: "soccer-enjoyment-fundamentals",
      description: "Shows enthusiasm and joy while playing",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Appears disinterested, reluctant to participate",
        2: "Participates but without enthusiasm",
        3: "Engaged most of the time, enjoys games more than drills",
        4: "Enthusiastic participation, encourages others",
        5: "Passionate love of the game, natural leader in fun",
      },
      observableBehaviors: [
        "Smiles and laughs during play",
        "Eager to participate",
        "Disappointed when practice ends",
        "Talks positively about soccer",
      ],
      commonMistakes: [
        "Overemphasis on winning",
        "Too much correction kills joy",
        "Not enough play time",
        "Adult pressure affecting enjoyment",
      ],
      coachingTips: [
        "Make practices fun first",
        "Celebrate effort, not just results",
        "More games, less standing in lines",
        "Let them play!",
      ],
      tags: ["psychological", "motivation", "enjoyment"],
      isCore: true,
    },
    {
      sportId: soccer.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Resilience",
      slug: "soccer-resilience-fundamentals",
      description: "Ability to bounce back from mistakes and setbacks",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Gets upset easily, shuts down after mistakes",
        2: "Recovers slowly from mistakes, needs coach support",
        3: "Bounces back from most mistakes with minimal help",
        4: "Quickly moves on from errors, stays positive",
        5: "Uses mistakes as motivation, helps teammates recover",
      },
      observableBehaviors: [
        "Tries again after missing",
        "Doesn't blame others",
        "Stays engaged after errors",
        "Positive body language after setbacks",
      ],
      commonMistakes: [
        "Head drops after mistake",
        "Giving up easily",
        "Blaming teammates",
        "Arguing with referee",
      ],
      coachingTips: [
        "Praise the effort, not the result",
        "Normalize mistakes - everyone makes them",
        "Model resilience yourself",
        "Next play mentality",
      ],
      tags: ["psychological", "resilience", "mental"],
      isCore: true,
    },
  ];

  // ============================================================
  // BASKETBALL SKILLS
  // ============================================================

  const basketballSkills = [
    // === TECHNICAL - FUNDAMENTALS ===
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Ball Handling",
      slug: "basketball-ball-handling-fundamentals",
      description: "Basic ability to dribble and control the basketball",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Struggles to dribble, frequently loses control",
        2: "Can dribble while stationary, loses ball when moving",
        3: "Dribbles while walking, some control with both hands",
        4: "Good control while moving, uses both hands",
        5: "Excellent control, can dribble at speed with either hand",
      },
      observableBehaviors: [
        "Uses fingertips, not palm",
        "Keeps ball low (knee height)",
        "Eyes up occasionally",
        "Uses both hands",
      ],
      commonMistakes: [
        "Slapping ball with palm",
        "Dribbling too high",
        "Always looking at ball",
        "Only using dominant hand",
      ],
      coachingTips: [
        "Fingertips only - pretend you have a hot potato",
        "Keep the ball low to protect it",
        "Practice with your weak hand every day",
        "Your hand pushes the ball, doesn't slap it",
      ],
      tags: ["dribbling", "ball handling", "foundational"],
      isCore: true,
    },
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Chest Pass",
      slug: "basketball-chest-pass",
      description: "Basic two-hand pass from chest to teammate",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Struggles to make catchable passes",
        2: "Passes are often too high, low, or off target",
        3: "Most passes reach teammate, reasonable accuracy",
        4: "Accurate passes, good technique, proper weight",
        5: "Excellent accuracy and weight, can pass under pressure",
      },
      observableBehaviors: [
        "Steps into pass",
        "Thumbs down on follow-through",
        "Passes to teammate's chest",
        "Eyes on target",
      ],
      commonMistakes: [
        "Not stepping into pass",
        "Ball goes to feet or over head",
        "Weak passes that get intercepted",
        "Not looking at target",
      ],
      coachingTips: [
        "Step toward your target",
        "Thumbs point down after release",
        "Pass to the chest",
        "Snap your wrists for speed",
      ],
      tags: ["passing", "technique", "foundational"],
      isCore: true,
    },
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Layup",
      slug: "basketball-layup-fundamentals",
      description: "Basic layup technique from both sides",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Cannot complete layup, wrong footwork",
        2: "Sometimes makes layup but footwork inconsistent",
        3: "Makes layups from dominant side, uses correct footwork",
        4: "Makes layups from both sides, consistent technique",
        5: "Excellent finishing, variety of layups, either hand",
      },
      observableBehaviors: [
        "Correct footwork (right-left-right for right hand)",
        "Uses backboard",
        "Jumps off opposite foot",
        "Extends to finish high",
      ],
      commonMistakes: [
        "Wrong footwork sequence",
        "Not using backboard",
        "Jumping off wrong foot",
        "Releasing too low",
      ],
      coachingTips: [
        "Right side: right-left-jump, left hand: left-right-jump",
        "Use the backboard - it's your friend",
        "Finish at the top of your jump",
        "Practice from both sides every day",
      ],
      tags: ["shooting", "layup", "foundational"],
      isCore: true,
    },
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: fundamentals.id,
      name: "Shooting Form",
      slug: "basketball-shooting-form",
      description: "Basic shooting technique and form (BEEF)",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Pushes ball, no consistent form",
        2: "Shows elements of form but inconsistent",
        3: "BEEF fundamentals present, makes close shots",
        4: "Consistent form, makes shots from various spots",
        5: "Excellent form, high percentage, extends range",
      },
      observableBehaviors: [
        "Balance: feet set, shoulder width",
        "Eyes: focused on target",
        "Elbow: tucked under ball",
        "Follow-through: wrist snaps, holds it",
      ],
      commonMistakes: [
        "Pushing ball from chest",
        "Elbow out to side",
        "Not following through",
        "Jumping forward",
      ],
      coachingTips: [
        "BEEF: Balance, Eyes, Elbow, Follow-through",
        "Start close to basket, work out",
        "Snap your wrist like reaching into a cookie jar",
        "Hold your follow-through until ball hits rim",
      ],
      tags: ["shooting", "form", "foundational"],
      isCore: true,
    },

    // === TECHNICAL - SKILL BUILDING ===
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: skillBuilding.id,
      name: "Crossover Dribble",
      slug: "basketball-crossover",
      description: "Ability to cross ball from one hand to other to beat defender",
      introductionAge: 9,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Cannot execute crossover, loses ball",
        2: "Can cross over but slowly, easily read by defender",
        3: "Effective crossover in drills, struggles in games",
        4: "Uses crossover effectively in games, both directions",
        5: "Elite crossover, can chain with other moves, unpredictable",
      },
      observableBehaviors: [
        "Ball stays low on cross",
        "Quick hand switch",
        "Changes pace with move",
        "Attacks after crossing",
      ],
      commonMistakes: [
        "Ball bounces too high",
        "Crossing too wide (easy steal)",
        "No change of pace",
        "Same setup every time",
      ],
      coachingTips: [
        "Keep the cross low - knee height or lower",
        "Cross in front of your body",
        "Explode past defender after cross",
        "Sell the fake with your eyes and shoulder",
      ],
      tags: ["dribbling", "moves", "1v1"],
      isCore: true,
    },
    {
      sportId: basketball.id,
      domainId: technical.id,
      stageId: skillBuilding.id,
      name: "Pull-Up Jumper",
      slug: "basketball-pullup-jumper",
      description: "Ability to stop off dribble and shoot a jump shot",
      introductionAge: 10,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Cannot stop and shoot in balance",
        2: "Stops but shooting form breaks down",
        3: "Makes pull-ups in practice, struggles with defense",
        4: "Effective pull-up game, mid-range threat",
        5: "Elite pull-up, creates separation, high percentage",
      },
      observableBehaviors: [
        "Quick stop in balance",
        "Maintains shooting form",
        "Creates space from defender",
        "Consistent release point",
      ],
      commonMistakes: [
        "Fading away",
        "Not stopping in balance",
        "Rushing the shot",
        "Different form than set shot",
      ],
      coachingTips: [
        "Stop in balance first",
        "Same form as your set shot",
        "Rise straight up, don't fade",
        "Use your legs for power",
      ],
      tags: ["shooting", "mid-range", "advanced"],
      isCore: false,
    },

    // === TACTICAL - FUNDAMENTALS ===
    {
      sportId: basketball.id,
      domainId: tactical.id,
      stageId: fundamentals.id,
      name: "Spacing",
      slug: "basketball-spacing-fundamentals",
      description: "Understanding of court spacing and not bunching up",
      introductionAge: 7,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Bunches up with other players, follows ball",
        2: "Sometimes spreads out but inconsistent",
        3: "Understands need for space, maintains position",
        4: "Creates and maintains good spacing, helps teammates",
        5: "Excellent spacing awareness, adjusts for ball movement",
      },
      observableBehaviors: [
        "Stays spread out from teammates",
        "Moves away when teammate comes near",
        "Fills open spots",
        "Creates passing lanes",
      ],
      commonMistakes: [
        "Standing next to teammate",
        "Following the ball",
        "Cutting into crowded areas",
        "Staying in corners only",
      ],
      coachingTips: [
        "Imagine you're connected by ropes - stay apart",
        "Fill the open spot when teammate leaves",
        "If two people are close, one should move",
        "Create a triangle with ball and basket",
      ],
      tags: ["spacing", "offense", "awareness"],
      isCore: true,
    },

    // === TACTICAL - SKILL BUILDING ===
    {
      sportId: basketball.id,
      domainId: tactical.id,
      stageId: skillBuilding.id,
      name: "Pick and Roll (Ball Handler)",
      slug: "basketball-pick-and-roll-handler",
      description: "Using a screen to create advantage and make decisions",
      introductionAge: 10,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Doesn't use screen, goes before screen is set",
        2: "Uses screen but doesn't read defense",
        3: "Uses screen, makes basic reads (shoot or drive)",
        4: "Excellent at using screen, finds roller, good decisions",
        5: "Elite pick and roll player, reads defense perfectly, creates for others",
      },
      observableBehaviors: [
        "Waits for screen to be set",
        "Sets up defender before using screen",
        "Reads switch vs hedge vs drop",
        "Makes correct decision based on defense",
      ],
      commonMistakes: [
        "Going before screen is set",
        "Not using screen at all",
        "Always making same read",
        "Tunnel vision on own shot",
      ],
      coachingTips: [
        "Set up your defender first",
        "Wait for the screen",
        "Read the defense - what are they giving you?",
        "Keep your eyes up to see the roller",
      ],
      tags: ["offense", "pick and roll", "decision-making"],
      isCore: true,
    },

    // === PHYSICAL - FUNDAMENTALS ===
    {
      sportId: basketball.id,
      domainId: physical.id,
      stageId: fundamentals.id,
      name: "Coordination",
      slug: "basketball-coordination-fundamentals",
      description: "Basic body coordination and movement skills",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Struggles with basic movements, uncoordinated",
        2: "Can perform basic moves but slowly",
        3: "Reasonable coordination, can perform most movements",
        4: "Good coordination, smooth movements",
        5: "Excellent coordination, natural athlete",
      },
      observableBehaviors: [
        "Runs with good form",
        "Can skip and shuffle",
        "Good balance on one foot",
        "Smooth transitions between movements",
      ],
      commonMistakes: [
        "Flat-footed movement",
        "Poor running form",
        "Tripping over feet",
        "Stiff body",
      ],
      coachingTips: [
        "Stay on balls of feet",
        "Pump your arms when running",
        "Stay low and balanced",
        "Practice movement patterns often",
      ],
      tags: ["physical", "coordination", "foundational"],
      isCore: true,
    },

    // === PSYCHOLOGICAL - FUNDAMENTALS ===
    {
      sportId: basketball.id,
      domainId: psychological.id,
      stageId: fundamentals.id,
      name: "Confidence",
      slug: "basketball-confidence-fundamentals",
      description: "Willingness to try and belief in abilities",
      introductionAge: 6,
      assessmentMethod: "observation" as const,
      progressionLevels: {
        1: "Afraid to try, avoids ball, scared to shoot",
        2: "Tries but gives up easily, lacks belief",
        3: "Reasonable confidence, tries new things",
        4: "Good confidence, takes on challenges willingly",
        5: "High confidence, believes in self, helps others believe",
      },
      observableBehaviors: [
        "Willing to take shots",
        "Asks for the ball",
        "Tries new moves",
        "Not afraid of mistakes",
      ],
      commonMistakes: [
        "Passing up open shots",
        "Hiding from the ball",
        "Not trying new skills",
        "Giving up after errors",
      ],
      coachingTips: [
        "Praise effort, not just makes",
        "Celebrate taking the shot",
        "Build success gradually",
        "Create safe environment to fail",
      ],
      tags: ["psychological", "confidence", "mental"],
      isCore: true,
    },
  ];

  // Insert all skills and create rubrics for each
  const allSkills = [...soccerSkills, ...basketballSkills];

  for (const skill of allSkills) {
    try {
      // Insert skill
      const [insertedSkill] = await db
        .insert(skills)
        .values(skill)
        .onConflictDoNothing()
        .returning();

      if (insertedSkill) {
        console.log(`  ✓ Skill: ${skill.name}`);

        // Create rubrics for each level
        for (let level = 1; level <= 5; level++) {
          const levelKey = level as 1 | 2 | 3 | 4 | 5;
          const rubric = {
            skillId: insertedSkill.id,
            level,
            levelName: LEVEL_NAMES[levelKey],
            criteria: skill.progressionLevels[levelKey],
            observableBehaviors: skill.observableBehaviors || [],
            commonMistakes: skill.commonMistakes || [],
            coachingTips: skill.coachingTips || [],
            exampleActivities: [],
          };

          await db.insert(assessmentRubrics).values(rubric).onConflictDoNothing();
        }
        console.log(`    → Created 5 rubric levels`);
      }
    } catch (error) {
      console.error(`  ✗ Error inserting ${skill.name}:`, error);
    }
  }

  console.log(`Seeded ${allSkills.length} skills with assessment rubrics`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedSkillsAndRubrics()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

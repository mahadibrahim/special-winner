import { db } from "../index";
import { activities, developmentStages } from "../schema";
import { sports } from "../schema/sports";
import { eq } from "drizzle-orm";

export async function seedBasketballActivities() {
  if (!db) {
    console.error("Database not available");
    return;
  }

  console.log("Seeding basketball activities...");

  // Get basketball sport
  const [basketball] = await db
    .select()
    .from(sports)
    .where(eq(sports.name, "Basketball"));

  if (!basketball) {
    console.error("Basketball sport not found. Run seed.ts first.");
    return;
  }

  // Get development stages
  const stages = await db.select().from(developmentStages);
  const stageMap = new Map(stages.map((s) => [s.slug, s.id]));

  const fundamentalsId = stageMap.get("fundamentals");
  const skillBuildingId = stageMap.get("skill-building");
  const developmentId = stageMap.get("development");

  if (!fundamentalsId || !skillBuildingId || !developmentId) {
    console.error("Development stages not found. Run seed-curriculum.ts first.");
    return;
  }

  const basketballActivities = [
    // === WARMUP ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "Dribble Tag",
      slug: "dribble-tag",
      description: "Fun warmup where all players dribble while playing tag",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 20,
      durationMinutes: 6,
      setupInstructions: "Use half court. Everyone has a ball. Select 2-3 taggers with pinnies.",
      howToPlay: `1. Everyone dribbles continuously, including taggers
2. Taggers try to tag others while dribbling
3. If you lose your dribble or get tagged, do 5 ball slaps and return
4. Rotate taggers every 60-90 seconds`,
      coachingPoints: [
        "Keep ball low and protected",
        "Use your body to shield",
        "Keep head up to see taggers",
        "Change speeds and directions"
      ],
      questionsToAsk: [
        "How do you protect your dribble while moving?",
        "Where should you look while dribbling?"
      ],
      commonMistakes: [
        "Dribbling too high",
        "Looking down at the ball",
        "Standing in one spot"
      ],
      variations: [
        { name: "Off-Hand Only", description: "Must dribble with non-dominant hand", difficulty: "intermediate" },
        { name: "Partner Tag", description: "Must hold hands with partner while dribbling", difficulty: "intermediate" }
      ],
      makeEasier: "Fewer taggers, larger space",
      makeHarder: "More taggers, smaller space, weak hand only",
      equipmentNeeded: ["1 ball per player", "Pinnies"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["warmup", "dribbling", "fun", "game"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Ball Handling Circuit",
      slug: "ball-handling-circuit",
      description: "Stationary ball handling series to develop touch and control",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 8,
      setupInstructions: "Players spread out, each with a ball. Enough space for movement.",
      howToPlay: `Each exercise 30 seconds:
1. Ball slaps - rapid slaps on ball
2. Fingertip taps - quick taps using fingertips only
3. Around the waist - circle ball around waist both directions
4. Around the knees - circle ball around knees
5. Figure 8 - weave ball through legs in figure 8
6. One hand dribble (right)
7. One hand dribble (left)
8. Crossover dribbles`,
      coachingPoints: [
        "Quick hands, soft touch",
        "Eyes up - don't look at ball",
        "Athletic stance - knees bent",
        "Challenge yourself to go faster"
      ],
      questionsToAsk: [
        "Can you do it without looking?",
        "Which hand feels weaker?",
        "How low can you keep your dribble?"
      ],
      commonMistakes: [
        "Looking down at ball",
        "Standing straight up",
        "Slapping ball instead of controlling it"
      ],
      variations: [
        { name: "Eyes Closed", description: "Try exercises with eyes closed", difficulty: "advanced" },
        { name: "Moving Circuit", description: "Do exercises while walking forward", difficulty: "intermediate" }
      ],
      makeEasier: "Slower pace, fewer exercises",
      makeHarder: "Faster pace, eyes closed, add complexity",
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["warmup", "ball handling", "individual", "technique"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Dynamic Stretching Lines",
      slug: "dynamic-stretching-lines",
      description: "Movement-based warmup traveling down the court",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 6,
      setupInstructions: "Players line up on baseline. Travel to half-court and back.",
      howToPlay: `Each movement to half-court and back:
1. Jog
2. High knees
3. Butt kicks
4. Lateral slides (both directions)
5. Carioca/Grapevine
6. Backpedal
7. Lunge walk
8. Skip with arm circles`,
      coachingPoints: [
        "Full range of motion",
        "Stay low in defensive stance movements",
        "Quick feet on agility movements",
        "Get heart rate up gradually"
      ],
      questionsToAsk: [
        "Why do we warm up?",
        "How does your body feel?"
      ],
      commonMistakes: [
        "Going through motions without effort",
        "Standing too tall on slides"
      ],
      variations: [
        { name: "With Ball", description: "Add ball handling to some movements", difficulty: "intermediate" }
      ],
      makeEasier: "Shorter distance, simpler movements",
      makeHarder: "Full court, add complexity",
      equipmentNeeded: ["None"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["warmup", "movement", "agility", "stretching"],
      featured: false,
    },

    // === TECHNICAL ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "Triple Threat Moves",
      slug: "triple-threat-moves",
      description: "Practice attacking from triple threat position",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Partners with one ball. One player is defender (passive at first).",
      howToPlay: `From triple threat position, practice:
1. Jab step and shoot
2. Jab step and drive right
3. Jab step and drive left
4. Shot fake and drive
5. Shot fake, jab, crossover drive

Defender gradually increases pressure over repetitions.`,
      coachingPoints: [
        "Strong athletic triple threat stance",
        "Sell the fake with eyes and body",
        "Protect the ball",
        "Read the defender's reaction"
      ],
      questionsToAsk: [
        "What does the defender do when you jab?",
        "When should you shoot vs drive?",
        "How do you keep the ball protected?"
      ],
      commonMistakes: [
        "Weak jab step",
        "Not reading the defender",
        "Picking up dribble too early"
      ],
      variations: [
        { name: "Live Defense", description: "Defender tries to steal on catch", difficulty: "advanced" },
        { name: "Closeout", description: "Defender closes out, player reads and reacts", difficulty: "advanced" }
      ],
      makeEasier: "Passive defense, slower pace",
      makeHarder: "Active defense, add shot clock",
      equipmentNeeded: ["1 ball per pair"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["offense", "triple threat", "1v1", "footwork"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Form Shooting Progression",
      slug: "form-shooting-progression",
      description: "Build proper shooting mechanics from foundation up",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Each player at a basket (can share). Start close to basket.",
      howToPlay: `Progress through each stage (10 reps each):
1. One-hand form shooting (3 feet from basket)
2. Add guide hand (3 feet)
3. One-dribble pull-up (5 feet)
4. Catch and shoot (8 feet)
5. Move to 10-12 feet
6. Move to 3-point line (older players only)`,
      coachingPoints: [
        "BEEF: Balance, Eyes, Elbow, Follow-through",
        "Elbow under the ball",
        "Snap the wrist - 'reach into the cookie jar'",
        "Hold follow-through until ball hits rim"
      ],
      questionsToAsk: [
        "Where are you aiming?",
        "How does your release feel?",
        "What does your follow-through look like?"
      ],
      commonMistakes: [
        "Elbow out to the side",
        "Not using legs",
        "Guide hand pushing the ball",
        "Not holding follow-through"
      ],
      variations: [
        { name: "Partner Checking", description: "Partners check each other's form", difficulty: "beginner" },
        { name: "Competition", description: "Make 5 from each spot to advance", difficulty: "intermediate" }
      ],
      makeEasier: "Stay closer to basket, more time",
      makeHarder: "Move back faster, add defender",
      equipmentNeeded: ["1 ball per player", "Baskets"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["shooting", "form", "technique", "individual"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Cone Dribbling Course",
      slug: "cone-dribbling-course",
      description: "Navigate through cones using different dribble moves",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Set up 5-6 cones in a zigzag pattern, 3-4 yards apart. Multiple lines if needed.",
      howToPlay: `Round 1: Crossover at each cone
Round 2: Between the legs at each cone
Round 3: Behind the back at each cone
Round 4: Player's choice - mix moves

Time each run. Try to improve your time while maintaining control.`,
      coachingPoints: [
        "Change of pace with each move",
        "Keep ball low",
        "Protect ball as you go by cone",
        "Eyes up, see the next cone"
      ],
      questionsToAsk: [
        "What move works best for you?",
        "How low can you keep the ball?",
        "When would you use each move in a game?"
      ],
      commonMistakes: [
        "Ball too high",
        "No change of speed",
        "Looking down at ball"
      ],
      variations: [
        { name: "Add Finish", description: "End with layup or pull-up jumper", difficulty: "intermediate" },
        { name: "Defender", description: "Passive defender trails behind", difficulty: "advanced" }
      ],
      makeEasier: "Fewer cones, slower pace",
      makeHarder: "More cones, timed competition, add defender",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["dribbling", "moves", "agility", "technique"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Layup Lines",
      slug: "layup-lines",
      description: "Classic layup drill focusing on proper footwork and finishing",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 8,
      setupInstructions: "Two lines at half-court - one shooting, one rebounding. One ball.",
      howToPlay: `1. Shooter dribbles to basket and makes layup
2. Rebounder catches ball and passes to next shooter
3. Shooter becomes rebounder, rebounder goes to shooting line
4. Practice both sides

Progression: Start with right-handed from right side, then left from left side.`,
      coachingPoints: [
        "Outside foot plants first",
        "Two-foot jump for power layup",
        "Eyes on target (top corner of square)",
        "Protect ball with body"
      ],
      questionsToAsk: [
        "Which foot do you jump off on right side?",
        "Where do you aim on the backboard?",
        "How do you protect the ball?"
      ],
      commonMistakes: [
        "Wrong foot takeoff",
        "Eyes not on target",
        "Throwing ball at backboard"
      ],
      variations: [
        { name: "Reverse Layups", description: "Finish on opposite side of rim", difficulty: "intermediate" },
        { name: "Euro Step", description: "Add Euro step finish", difficulty: "advanced" }
      ],
      makeEasier: "Start closer, no dribble",
      makeHarder: "Add defender, require specific finish",
      equipmentNeeded: ["Balls", "Basket"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["layups", "finishing", "footwork", "technique"],
      featured: true,
    },

    // === TACTICAL/GAME ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "3v3 Half Court",
      slug: "3v3-half-court",
      description: "Small-sided game focusing on spacing and decision making",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 12,
      durationMinutes: 15,
      setupInstructions: "Half court with one basket. Teams of 3.",
      howToPlay: `1. Play 3v3 games to 7 points (1s and 2s)
2. Make it, take it
3. Check ball at top of key after scores and turnovers
4. Call your own fouls
5. Losers stay, winners rotate out`,
      coachingPoints: [
        "Space the floor - don't bunch up",
        "Cut with purpose - don't stand",
        "Move the ball - don't hold",
        "Play help defense"
      ],
      questionsToAsk: [
        "Where should you be when a teammate drives?",
        "How do you create space?",
        "What does your help look like?"
      ],
      commonMistakes: [
        "Standing and watching",
        "Everyone going to the ball",
        "Not moving without the ball"
      ],
      variations: [
        { name: "Must Score Inside", description: "All scores must be in paint", difficulty: "intermediate" },
        { name: "3 Passes", description: "Must make 3 passes before shooting", difficulty: "intermediate" }
      ],
      makeEasier: "No defense initially, add rules to help offense",
      makeHarder: "Shot clock, limited dribbles",
      equipmentNeeded: ["Balls", "Pinnies"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "small-sided", "tactical", "decision-making"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Shell Defense",
      slug: "shell-defense",
      description: "Foundation drill for team defensive positioning",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 8,
      maxPlayers: 12,
      durationMinutes: 10,
      setupInstructions: "4 offensive players around perimeter, 4 defenders. No basket needed initially.",
      howToPlay: `1. Offense passes the ball around the perimeter (no drives initially)
2. Defense moves on every pass:
   - On-ball: Up in stance
   - One pass away: Deny position
   - Two passes away: Help position
3. Defenders call out position changes`,
      coachingPoints: [
        "Move on the flight of the ball",
        "See man, see ball",
        "Jump to the ball on passes",
        "Communicate constantly"
      ],
      questionsToAsk: [
        "Where should you be when ball is two passes away?",
        "What do you call out?",
        "How do you help your teammate?"
      ],
      commonMistakes: [
        "Moving late",
        "Ball watching",
        "Not in proper stance"
      ],
      variations: [
        { name: "Add Drives", description: "Allow offense to drive and kick", difficulty: "advanced" },
        { name: "Add Post", description: "Put fifth offensive player in post", difficulty: "advanced" }
      ],
      makeEasier: "Slow ball movement, pause to check positions",
      makeHarder: "Faster ball movement, allow drives and cuts",
      equipmentNeeded: ["1 ball", "Cones optional"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["defense", "team", "positioning", "tactical"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "1v1 From Wing",
      slug: "1v1-from-wing",
      description: "Isolation game to develop attacking and defending skills",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 12,
      durationMinutes: 12,
      setupInstructions: "Offensive player on wing, defender guarding. Basket available.",
      howToPlay: `1. Coach passes to wing player
2. Defender closes out properly
3. Offensive player attacks to score (3 dribble limit)
4. Play until score, miss, or turnover
5. Rotate: offense to defense, defense out, new player on offense`,
      coachingPoints: [
        "Closeout under control - short choppy steps",
        "Attack the defender's front foot",
        "Read the defense - shoot if open, drive if defender too close",
        "Play through contact"
      ],
      questionsToAsk: [
        "What did the defender give you?",
        "How did you attack their weak spot?",
        "What could you have done better?"
      ],
      commonMistakes: [
        "Not reading the defense",
        "Predictable - always going same direction",
        "Picking up dribble too early"
      ],
      variations: [
        { name: "Must Score in Paint", description: "Can only score layups or close shots", difficulty: "intermediate" },
        { name: "5-Dribble Limit", description: "More time to work but still limited", difficulty: "intermediate" }
      ],
      makeEasier: "More dribbles allowed, passive defense",
      makeHarder: "2-dribble limit, full contact defense",
      equipmentNeeded: ["Balls", "Basket"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["1v1", "offense", "defense", "attacking"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Give and Go Game",
      slug: "give-and-go-game",
      description: "2v2 game focusing on passing and cutting fundamentals",
      activityType: "tactical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 12,
      durationMinutes: 10,
      setupInstructions: "Half court. Two offensive players, two defensive players. Coach at top of key.",
      howToPlay: `1. Coach passes to either offensive player
2. Receiver must pass to partner immediately
3. After passing, cut hard to basket
4. Partner can:
   - Pass to cutter for layup
   - Take one dribble and shoot
   - Pass back out and reset
5. Play to 5 points, then switch offense/defense`,
      coachingPoints: [
        "Pass and cut - don't stand",
        "Cut with purpose - sell it",
        "See the cutter",
        "Time the pass"
      ],
      questionsToAsk: [
        "When should you cut backdoor?",
        "How do you lose your defender?",
        "Where do you want the pass?"
      ],
      commonMistakes: [
        "Standing after passing",
        "Lazy cuts",
        "Not looking for cutter"
      ],
      variations: [
        { name: "Must Give and Go", description: "Every score must come from give and go", difficulty: "beginner" },
        { name: "Add Third Player", description: "3v3 with same rules", difficulty: "intermediate" }
      ],
      makeEasier: "Passive defense",
      makeHarder: "Active switching defense",
      equipmentNeeded: ["Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["passing", "cutting", "movement", "tactical"],
      featured: true,
    },

    // === SCRIMMAGE ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "5v5 Controlled Scrimmage",
      slug: "5v5-controlled-scrimmage",
      description: "Full court scrimmage with coaching points and stops",
      activityType: "scrimmage" as const,
      difficulty: "intermediate" as const,
      minPlayers: 10,
      maxPlayers: 15,
      durationMinutes: 20,
      setupInstructions: "Full court, two teams of 5. Standard basketball rules.",
      howToPlay: `1. Play full 5v5 scrimmage
2. Coach stops play to make teaching points
3. Focus on specific concepts being worked on
4. Can add restrictions (no 3s, must pass before shoot, etc.)`,
      coachingPoints: [
        "Apply what we practiced",
        "Communicate on defense",
        "Move without the ball",
        "Execute together"
      ],
      questionsToAsk: [
        "What was the right play there?",
        "What could we have done better?",
        "Who should have helped?"
      ],
      commonMistakes: [
        "Reverting to bad habits",
        "Not communicating",
        "Selfish play"
      ],
      variations: [
        { name: "Two Pass Minimum", description: "Must make two passes before shooting", difficulty: "intermediate" },
        { name: "Post Touches", description: "Must get ball into post before shooting", difficulty: "intermediate" }
      ],
      makeEasier: "Stop more often to teach",
      makeHarder: "Let them play through mistakes",
      equipmentNeeded: ["Balls", "Pinnies"],
      spaceRequired: "large",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["scrimmage", "game", "team", "full court"],
      featured: false,
    },

    // === FUN ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "Knockout",
      slug: "knockout",
      description: "Classic shooting game everyone loves",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 10,
      setupInstructions: "One basket. Players line up at free throw line. Two balls needed.",
      howToPlay: `1. First two players have balls
2. First player shoots
3. Second player shoots immediately after
4. If second player makes it before first player, first player is OUT
5. After shooting, rebound and shoot from anywhere until you make it
6. Last player standing wins`,
      coachingPoints: [
        "Follow your shot",
        "Stay focused under pressure",
        "Make your free throw"
      ],
      questionsToAsk: [
        "Where is the best spot to shoot from if you miss?",
        "How do you stay calm?"
      ],
      commonMistakes: [
        "Rushing the free throw",
        "Not following the shot"
      ],
      variations: [
        { name: "3-Point Knockout", description: "Start from 3-point line", difficulty: "intermediate" },
        { name: "Left Hand Only", description: "All shots must be left-handed", difficulty: "advanced" }
      ],
      makeEasier: "Closer starting position",
      makeHarder: "Must make two shots to survive",
      equipmentNeeded: ["2+ balls", "Basket"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["fun", "shooting", "game", "competitive"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "21",
      slug: "21-game",
      description: "Free-for-all scoring game to 21 points",
      activityType: "fun" as const,
      difficulty: "intermediate" as const,
      minPlayers: 3,
      maxPlayers: 8,
      durationMinutes: 15,
      setupInstructions: "One basket. One ball. All players vs each other.",
      howToPlay: `1. First player shoots from top of key
2. If make: shoot free throws (1 point each) until miss
3. If miss: everyone rebounds - whoever gets it attacks
4. Made shot from field = 2 points, then go to line for free throws
5. If you foul, fouled player shoots free throws
6. First to exactly 21 wins (must hit exact, or go back to 15)`,
      coachingPoints: [
        "Box out for rebounds",
        "Attack quick on rebounds",
        "Make your free throws count"
      ],
      questionsToAsk: [
        "What's your strategy when you're close to 21?",
        "How do you create space to score?"
      ],
      commonMistakes: [
        "Not boxing out",
        "Forcing shots"
      ],
      variations: [
        { name: "Taps", description: "Can score by tipping in miss off backboard", difficulty: "intermediate" }
      ],
      makeEasier: "To 11 points",
      makeHarder: "Must go back to zero if over 21",
      equipmentNeeded: ["1 ball", "Basket"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["fun", "shooting", "rebounding", "competitive"],
      featured: true,
    },

    // === COOLDOWN ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "Partner Passing",
      slug: "partner-passing",
      description: "Cool down with fundamental passing practice",
      activityType: "cooldown" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 6,
      setupInstructions: "Partners 10-15 feet apart. One ball per pair.",
      howToPlay: `Practice different passes, 10 of each:
1. Chest pass
2. Bounce pass
3. Overhead pass
4. One-hand push pass (both hands)
5. Baseball pass (longer distance)`,
      coachingPoints: [
        "Step into your pass",
        "Snap the wrist for rotation",
        "Hit your target",
        "Give a target to your partner"
      ],
      questionsToAsk: [
        "When do you use each pass?",
        "What makes a good pass?"
      ],
      commonMistakes: [
        "Not stepping into pass",
        "Telegraphing the pass"
      ],
      variations: [
        { name: "Add Defender", description: "Third player guards passer", difficulty: "intermediate" }
      ],
      makeEasier: "Closer together",
      makeHarder: "Move while passing",
      equipmentNeeded: ["1 ball per pair"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["cooldown", "passing", "technique", "partners"],
      featured: false,
    },
  ];

  // Insert activities
  for (const activity of basketballActivities) {
    try {
      await db.insert(activities).values(activity).onConflictDoNothing();
      console.log(`  ✓ ${activity.name}`);
    } catch (error) {
      console.error(`  ✗ Error inserting ${activity.name}:`, error);
    }
  }

  console.log(`Seeded ${basketballActivities.length} basketball activities`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedBasketballActivities()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

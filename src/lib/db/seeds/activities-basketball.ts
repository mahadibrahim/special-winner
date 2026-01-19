import { getDb } from "../index";
import { activities, developmentStages } from "../schema";
import { sports } from "../schema/sports";
import { eq } from "drizzle-orm";

export async function seedBasketballActivities() {

  console.log("Seeding basketball activities...");

  // Get basketball sport
  const [basketball] = await getDb()
    .select()
    .from(sports)
    .where(eq(sports.name, "Basketball"));

  if (!basketball) {
    console.error("Basketball sport not found. Run seed.ts first.");
    return;
  }

  // Get development stages
  const stages = await getDb().select().from(developmentStages);
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

    // === ADDITIONAL WARMUP ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "Red Light Green Light Dribble",
      slug: "red-light-green-light-dribble",
      description: "Classic game with dribbling - stop on red, go on green",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 6,
      setupInstructions: "Players line up on baseline with balls. Coach at opposite baseline.",
      howToPlay: `1. Coach turns back and calls 'Green light!' - players dribble forward
2. Coach turns around and calls 'Red light!' - players must stop and control ball
3. If caught moving or losing ball, go back to start
4. First to reach coach wins`,
      coachingPoints: [
        "Keep ball low to stop quickly",
        "React immediately to commands",
        "Eyes up to see the coach",
        "Control before speed",
      ],
      questionsToAsk: [
        "How do you stop quickly?",
        "What hand position helps you control?",
      ],
      commonMistakes: ["Ball bouncing when stopped", "Looking down while dribbling"],
      variations: [
        { name: "Weak Hand Only", description: "Must use non-dominant hand", difficulty: "intermediate" },
        { name: "Add Colors", description: "Yellow = slow dribble, Blue = crossovers", difficulty: "intermediate" },
      ],
      makeEasier: "Slower pace, longer distance",
      makeHarder: "Faster commands, add trick commands",
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["warmup", "dribbling", "fun", "control"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Passing Partner Warmup",
      slug: "passing-partner-warmup",
      description: "Moving warmup while passing with a partner",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 6,
      setupInstructions: "Partners 10 feet apart, one ball per pair. Line up on sideline.",
      howToPlay: `1. Partners move down the court while passing back and forth
2. Chest passes down
3. Bounce passes back
4. Overhead passes down
5. One-hand push passes back`,
      coachingPoints: [
        "Step into each pass",
        "Keep moving - don't stand still",
        "Lead your partner with the pass",
        "Call for the ball",
      ],
      questionsToAsk: [
        "How do you pass to a moving target?",
        "When do you use each pass type?",
      ],
      commonMistakes: ["Passing behind partner", "Stopping to catch"],
      variations: [
        { name: "Add Defender", description: "Third player in middle tries to intercept", difficulty: "intermediate" },
        { name: "One-Touch", description: "Catch and pass in one motion", difficulty: "advanced" },
      ],
      makeEasier: "Walking pace, shorter distance",
      makeHarder: "Running pace, longer distance, add defender",
      equipmentNeeded: ["1 ball per pair"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["warmup", "passing", "movement", "partners"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Four Corners Dribbling",
      slug: "four-corners-dribbling",
      description: "Dribbling through four stations with different moves at each",
      activityType: "warmup" as const,
      difficulty: "intermediate" as const,
      minPlayers: 8,
      maxPlayers: 24,
      durationMinutes: 8,
      setupInstructions: "Set up four cones in a square (20x20 yards). Split players into four groups.",
      howToPlay: `Corner 1 to 2: Right hand only
Corner 2 to 3: Left hand only
Corner 3 to 4: Crossovers
Corner 4 to 1: Between the legs
Rotate continuously for time.`,
      coachingPoints: [
        "Low dribble, quick feet",
        "Smooth transitions between moves",
        "Change speeds at each corner",
        "Eyes up",
      ],
      questionsToAsk: [
        "Which move is hardest for you?",
        "How do you stay low while moving fast?",
      ],
      commonMistakes: ["Standing up too tall", "Ball too high on moves"],
      variations: [
        { name: "Add Reverse", description: "Go backwards from corner 4 to corner 1", difficulty: "advanced" },
        { name: "Race Format", description: "First to complete 2 laps wins", difficulty: "intermediate" },
      ],
      makeEasier: "Slower pace, simpler moves",
      makeHarder: "Faster pace, add behind-the-back, time it",
      equipmentNeeded: ["Cones", "1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["warmup", "dribbling", "moves", "conditioning"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Circle Passing",
      slug: "circle-passing",
      description: "Team passing game in a circle formation",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 8,
      maxPlayers: 20,
      durationMinutes: 6,
      setupInstructions: "Players form a circle. Start with one ball, add more as players improve.",
      howToPlay: `1. Pass around the circle (chest passes)
2. Add second ball going opposite direction
3. Call name before passing
4. Try different passes: bounce, overhead
5. Count consecutive passes without drop`,
      coachingPoints: [
        "Give a target",
        "Call the name clearly",
        "Be ready to receive",
        "Soft hands on catch",
      ],
      questionsToAsk: [
        "How do you know who to pass to?",
        "What makes catching easier?",
      ],
      commonMistakes: ["Not calling names", "Bad passes - too hard or soft"],
      variations: [
        { name: "Cross Circle", description: "Pass across the circle, not around", difficulty: "intermediate" },
        { name: "Three Balls", description: "Add third ball for chaos", difficulty: "advanced" },
      ],
      makeEasier: "One ball, slower pace",
      makeHarder: "Multiple balls, faster pace, must sit if you drop",
      equipmentNeeded: ["1-3 balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["warmup", "passing", "teamwork", "focus"],
      featured: false,
    },

    // === ADDITIONAL TECHNICAL ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "Mikan Drill",
      slug: "mikan-drill",
      description: "Classic drill for developing soft touch around the rim",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 1,
      maxPlayers: 16,
      durationMinutes: 8,
      setupInstructions: "Players at basket. Can share baskets (2-3 per basket).",
      howToPlay: `1. Start under basket on right side
2. Layup with right hand
3. Rebound and go immediately to left side
4. Layup with left hand
5. Continue alternating, don't let ball touch ground
6. Do 10 on each side, then rest`,
      coachingPoints: [
        "Use backboard on every shot",
        "Stay light on feet - don't land heavy",
        "Extend to finish high",
        "Quick off the ground",
      ],
      questionsToAsk: [
        "Where do you aim on the backboard?",
        "How do you stay balanced?",
      ],
      commonMistakes: ["Ball hitting ground between shots", "Not using backboard"],
      variations: [
        { name: "Reverse Mikan", description: "Reverse layups instead", difficulty: "intermediate" },
        { name: "Jump Hook", description: "Use jump hooks instead of layups", difficulty: "intermediate" },
      ],
      makeEasier: "Allow ball to bounce between attempts",
      makeHarder: "Time it - most in 30 seconds, add jump",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["layups", "finishing", "technique", "individual"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Pound Dribble Series",
      slug: "pound-dribble-series",
      description: "Hard dribble exercises to build strength and control",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 10,
      setupInstructions: "Players spread out, each with a ball.",
      howToPlay: `Each exercise 30 seconds:
1. Right hand pound (hard, low dribbles)
2. Left hand pound
3. Alternating pound
4. Crossover pounds (in and out)
5. Between legs pounds
6. Behind back pounds`,
      coachingPoints: [
        "Pound the ball into the floor",
        "Keep it below knee level",
        "Strong stance - stay balanced",
        "Eyes up when possible",
      ],
      questionsToAsk: [
        "Why do we pound the ball hard?",
        "How low should it be?",
      ],
      commonMistakes: ["Dribbling too high", "Slapping instead of pushing"],
      variations: [
        { name: "Moving Pounds", description: "Do while walking forward", difficulty: "advanced" },
        { name: "Partner Challenge", description: "Partner tries to steal while you pound", difficulty: "advanced" },
      ],
      makeEasier: "Slower pace, simpler moves",
      makeHarder: "Faster pace, add movement, partner defense",
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["dribbling", "strength", "ball handling", "technique"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Elbow Shooting",
      slug: "elbow-shooting",
      description: "Mid-range shooting from the elbow areas",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Groups at each basket. Shooters at elbows, rebounders under basket.",
      howToPlay: `1. Catch and shoot from right elbow (5 shots)
2. Move to left elbow (5 shots)
3. Add one-dribble pull-up from each elbow
4. Track makes - goal is 7/10
5. Rotate shooter/rebounder`,
      coachingPoints: [
        "Square up to basket",
        "Same form every shot",
        "Shoot on the way up, not way down",
        "Follow through - hold it",
      ],
      questionsToAsk: [
        "What's your routine before each shot?",
        "Where do you aim from this distance?",
      ],
      commonMistakes: ["Rushing the shot", "Not squaring up", "Flat shot"],
      variations: [
        { name: "Off Screen", description: "Partner sets screen before catch", difficulty: "advanced" },
        { name: "Shot Fake First", description: "Shot fake, one dribble, shoot", difficulty: "intermediate" },
      ],
      makeEasier: "Closer to basket, no time pressure",
      makeHarder: "Add defender, shot clock",
      equipmentNeeded: ["Baskets", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["shooting", "mid-range", "technique", "elbow"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Post Moves Circuit",
      slug: "post-moves-circuit",
      description: "Practice post moves against passive defense",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Groups of 3: post player, defender (passive), passer.",
      howToPlay: `Practice each move 4 times:
1. Drop step baseline
2. Drop step middle
3. Up and under
4. Turnaround jumper
5. Dream shake (advanced)`,
      coachingPoints: [
        "Seal defender before receiving",
        "Chin the ball to protect it",
        "Strong, quick moves",
        "Use body to create space",
      ],
      questionsToAsk: [
        "When do you use each move?",
        "How do you read the defender?",
      ],
      commonMistakes: ["Weak seal", "Traveling", "Not protecting ball"],
      variations: [
        { name: "Live Defense", description: "Defender plays active", difficulty: "advanced" },
        { name: "Double Team", description: "Second defender comes to help", difficulty: "advanced" },
      ],
      makeEasier: "No defender, focus on footwork",
      makeHarder: "Active defender, must score",
      equipmentNeeded: ["Basket", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["post", "moves", "footwork", "technique"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Defensive Slide Course",
      slug: "defensive-slide-course",
      description: "Defensive positioning and footwork through cone course",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 10,
      setupInstructions: "Set up zigzag cone pattern down the court. 4-5 cones per lane.",
      howToPlay: `1. Start in defensive stance
2. Slide to first cone
3. Drop step and slide to next cone
4. Continue zigzag pattern down court
5. Sprint back, next person goes`,
      coachingPoints: [
        "Stay low - don't stand up",
        "Push off back foot",
        "Keep hands active",
        "Don't cross feet",
      ],
      questionsToAsk: [
        "Why don't we cross our feet?",
        "How do you stay low without getting tired?",
      ],
      commonMistakes: ["Standing up during slides", "Crossing feet", "Hands down"],
      variations: [
        { name: "With Ball", description: "Offensive player dribbles, defender mirrors", difficulty: "advanced" },
        { name: "Closeout Start", description: "Start with closeout then slides", difficulty: "intermediate" },
      ],
      makeEasier: "Fewer cones, slower pace",
      makeHarder: "More cones, add ball, time it",
      equipmentNeeded: ["Cones"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["defense", "footwork", "slides", "technique"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Free Throw Routine",
      slug: "free-throw-routine",
      description: "Develop consistent free throw mechanics and routine",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 10,
      setupInstructions: "Players at free throw lines. 2-3 per basket.",
      howToPlay: `1. Develop your routine (3 dribbles, deep breath, etc.)
2. Shoot 10 free throws
3. Track your makes
4. Shoot 5 more 'pressure' free throws (must make 3)
5. Do light conditioning if miss pressure shots`,
      coachingPoints: [
        "Same routine every time",
        "Bend knees, shoot on the way up",
        "Focus on back of rim",
        "Hold follow through",
      ],
      questionsToAsk: [
        "What's your personal routine?",
        "How do you stay calm at the line?",
      ],
      commonMistakes: ["Inconsistent routine", "Rushing", "No follow through"],
      variations: [
        { name: "Pressure Free Throws", description: "Run if you miss (game simulation)", difficulty: "intermediate" },
        { name: "Eyes Closed", description: "Shoot with eyes closed to feel the form", difficulty: "intermediate" },
      ],
      makeEasier: "No pressure component",
      makeHarder: "More pressure, team total needed",
      equipmentNeeded: ["Baskets", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["shooting", "free throws", "routine", "technique"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Pick and Roll Basics",
      slug: "pick-and-roll-basics",
      description: "Learn fundamental pick and roll mechanics",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Groups of 3: ball handler, screener, passive defender. Work on wing or top of key.",
      howToPlay: `1. Screener sets solid screen
2. Ball handler uses screen to create advantage
3. Screener rolls to basket after contact
4. Ball handler reads - pass to roller or score
5. Rotate positions after each rep`,
      coachingPoints: [
        "Screener: wide base, hands in",
        "Ball handler: set up defender, then use screen",
        "Screener: roll hard to the basket",
        "Ball handler: read the defense",
      ],
      questionsToAsk: [
        "When should you pass to the roller?",
        "How do you set a legal screen?",
        "What if the defender goes under?",
      ],
      commonMistakes: ["Moving screen", "Ball handler not using screen", "Lazy roll"],
      variations: [
        { name: "Pick and Pop", description: "Screener pops out for jumper instead of roll", difficulty: "intermediate" },
        { name: "Add Second Defender", description: "Play 2v2 off the screen", difficulty: "advanced" },
      ],
      makeEasier: "No defender, focus on footwork",
      makeHarder: "Active defenders, must score",
      equipmentNeeded: ["Baskets", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["pick and roll", "offense", "screening", "technique"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Outlet Pass Drill",
      slug: "outlet-pass-drill",
      description: "Practice rebounding and throwing quick outlet passes",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Rebounder under basket, outlet receiver at sideline near half court.",
      howToPlay: `1. Coach shoots and misses
2. Rebounder secures ball with two hands
3. Pivot outside and locate outlet
4. Throw baseball pass to outlet
5. Outlet catches and attacks opposite basket`,
      coachingPoints: [
        "Chin the rebound",
        "Pivot away from traffic",
        "Strong overhead pass",
        "Hit the outlet in stride",
      ],
      questionsToAsk: [
        "Why do we chin the ball?",
        "Where should the outlet be positioned?",
      ],
      commonMistakes: ["Bringing ball down (gets stolen)", "Slow pivot", "Inaccurate pass"],
      variations: [
        { name: "Add Defender", description: "Defender tries to intercept outlet", difficulty: "advanced" },
        { name: "Full Court", description: "Outlet attacks for layup", difficulty: "intermediate" },
      ],
      makeEasier: "No defense, closer outlet",
      makeHarder: "Active defense, further outlet, must finish with layup",
      equipmentNeeded: ["Baskets", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["rebounding", "outlet", "passing", "transition"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Catch and Face",
      slug: "catch-and-face",
      description: "Practice receiving the ball and immediately facing the basket",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Groups of 2-3 at each basket. Passer at top, receiver on wing.",
      howToPlay: `1. Receiver V-cuts to get open
2. Catch the pass
3. Immediately pivot to face basket (triple threat)
4. Read: open for shot? Drive? Pass?
5. Attack based on read`,
      coachingPoints: [
        "Strong V-cut to get open",
        "Catch in athletic position",
        "Pivot on inside foot to face basket",
        "See the whole floor",
      ],
      questionsToAsk: [
        "Why do you face the basket first?",
        "What do you see when you face up?",
      ],
      commonMistakes: ["Not facing basket", "Picking up dribble too early", "Standing straight up"],
      variations: [
        { name: "Add Defender", description: "Close out on the catch", difficulty: "intermediate" },
        { name: "Must Attack", description: "Every catch leads to a drive or shot", difficulty: "intermediate" },
      ],
      makeEasier: "No defense, focus on footwork",
      makeHarder: "Live defense, quick decisions",
      equipmentNeeded: ["Baskets", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["catching", "footwork", "triple threat", "technique"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Euro Step Progression",
      slug: "euro-step-progression",
      description: "Learn the Euro step finish from basic to game speed",
      activityType: "technical" as const,
      difficulty: "advanced" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Groups at each basket. Cones to simulate defenders.",
      howToPlay: `Progression:
1. Walk through footwork (no ball)
2. Add ball, walk through
3. Jog with ball
4. Full speed off cone
5. Full speed vs defender`,
      coachingPoints: [
        "Long first step past defender",
        "Second step opposite direction",
        "Keep ball protected",
        "Finish with either hand",
      ],
      questionsToAsk: [
        "When do you use a Euro step?",
        "How do you protect the ball?",
      ],
      commonMistakes: ["Traveling", "Second step not far enough", "Not protecting ball"],
      variations: [
        { name: "Left Side", description: "Practice from left side of basket", difficulty: "advanced" },
        { name: "Live Defense", description: "Defender plays active", difficulty: "advanced" },
      ],
      makeEasier: "Slower pace, no defense",
      makeHarder: "Active defense, must finish every time",
      equipmentNeeded: ["Baskets", "Cones", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [developmentId],
      tags: ["layups", "finishing", "footwork", "Euro step"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Spot Up Shooting",
      slug: "spot-up-shooting",
      description: "Practice catch-and-shoot from various spots on the floor",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "5 spots around the 3-point arc. Shooter rotates through spots.",
      howToPlay: `1. Start in corner
2. Receive pass, shoot immediately
3. Move to next spot
4. Shoot 2 from each spot
5. Track makes - goal is 7/10`,
      coachingPoints: [
        "Feet set before the catch",
        "Ready to shoot as ball arrives",
        "Square to basket",
        "Same release every time",
      ],
      questionsToAsk: [
        "What do your feet do as the ball comes?",
        "Where's your best spot?",
      ],
      commonMistakes: ["Feet not set", "Rising up before catch", "Leaning"],
      variations: [
        { name: "Closeout", description: "Defender closes out before shot", difficulty: "advanced" },
        { name: "Shot Fake Option", description: "Can shot fake and drive", difficulty: "intermediate" },
      ],
      makeEasier: "Inside the arc, no time pressure",
      makeHarder: "Add defense, shot clock, must make X before moving",
      equipmentNeeded: ["Baskets", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["shooting", "spot up", "catch and shoot", "technique"],
      featured: false,
    },

    // === ADDITIONAL TACTICAL ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "2v1 Fast Break",
      slug: "2v1-fast-break",
      description: "Practice converting 2v1 advantages in transition",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 15,
      durationMinutes: 12,
      setupInstructions: "Two offensive players at half court, one defender at free throw line.",
      howToPlay: `1. Two attackers start at half court with ball
2. Defender at free throw line extended
3. Attackers attack to score
4. If stopped, defense wins
5. Rotate: attackers to defense, new attackers`,
      coachingPoints: [
        "Stay wide apart - make defender choose",
        "Attack the basket aggressively",
        "Simple pass when defender commits",
        "Finish strong",
      ],
      questionsToAsk: [
        "What forces the defender to commit?",
        "When do you pass vs finish yourself?",
      ],
      commonMistakes: ["Getting too close together", "Slow attack", "Fancy passes"],
      variations: [
        { name: "3v2", description: "Three attackers vs two defenders", difficulty: "intermediate" },
        { name: "Trail Defender", description: "Second defender trails from behind", difficulty: "advanced" },
      ],
      makeEasier: "Start closer to basket",
      makeHarder: "Start further, add trailing defender",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["fast break", "transition", "2v1", "tactical"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Help Defense Drill",
      slug: "help-defense-drill",
      description: "Learn to help and recover in team defense",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 8,
      maxPlayers: 14,
      durationMinutes: 12,
      setupInstructions: "3 offensive players around the arc. 3 defenders.",
      howToPlay: `1. Ball starts on wing
2. Ball handler drives to basket
3. Help defender jumps to stop penetration
4. Ball handler kicks out
5. Defenders rotate - closest to ball recovers
6. Play out the possession`,
      coachingPoints: [
        "Jump to the ball on drive",
        "Stop the ball, contain",
        "Communicate rotations",
        "Recover with urgency",
      ],
      questionsToAsk: [
        "When do you help?",
        "How do you communicate?",
        "Who recovers to the open player?",
      ],
      commonMistakes: ["Helping too late", "No communication", "Slow recovery"],
      variations: [
        { name: "4v4", description: "Add fourth player for more complexity", difficulty: "advanced" },
        { name: "Post Help", description: "Help on post entry instead", difficulty: "intermediate" },
      ],
      makeEasier: "Offense plays slow",
      makeHarder: "Offense goes hard, add fourth player",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["defense", "help", "rotations", "tactical"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Motion Offense Basics",
      slug: "motion-offense-basics",
      description: "Introduction to motion offense principles",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 10,
      maxPlayers: 15,
      durationMinutes: 15,
      setupInstructions: "5 offensive players in 3-out, 2-in formation. Start with no defense.",
      howToPlay: `Rules:
1. Pass and cut (basket cut or away)
2. Fill behind the cutter
3. Screen away or down after passing
4. Read the defense - take what they give
Practice at walk-through speed first.`,
      coachingPoints: [
        "Move with purpose",
        "Cut hard, screen hard",
        "Read the defense",
        "Spacing is key",
      ],
      questionsToAsk: [
        "What happens after you pass?",
        "How do you read the defense?",
        "Why is spacing important?",
      ],
      commonMistakes: ["Standing after passing", "Poor screens", "Bad spacing"],
      variations: [
        { name: "Add Defense", description: "Play 5v5 with motion rules", difficulty: "advanced" },
        { name: "4-Out", description: "Run motion from 4-out, 1-in set", difficulty: "intermediate" },
      ],
      makeEasier: "Walk through, no defense",
      makeHarder: "Live defense, play until score",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["offense", "motion", "team", "tactical"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Box Out and Rebound",
      slug: "box-out-and-rebound",
      description: "Team rebounding with proper box out technique",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 12,
      durationMinutes: 10,
      setupInstructions: "3 defensive players, 3 offensive players around the lane. Coach shoots.",
      howToPlay: `1. Coach shoots the ball
2. Defenders MUST make contact and box out
3. Fight for the rebound
4. Offensive players try to get the board
5. Whoever gets rebound gets a point`,
      coachingPoints: [
        "Hit first, then find ball",
        "Wide base, butt into opponent",
        "Keep contact until ball is grabbed",
        "Pursue the ball aggressively",
      ],
      questionsToAsk: [
        "Why do we box out before looking for ball?",
        "How do you maintain contact?",
      ],
      commonMistakes: ["Looking for ball before boxing out", "Weak box out", "Giving up on rebound"],
      variations: [
        { name: "4v4", description: "Add fourth player to each side", difficulty: "intermediate" },
        { name: "Outlet Required", description: "Must throw outlet pass after rebound", difficulty: "intermediate" },
      ],
      makeEasier: "Start closer to basket",
      makeHarder: "Longer shots (longer rebounds), more players",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["rebounding", "box out", "defense", "tactical"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Press Break Basics",
      slug: "press-break-basics",
      description: "Learn to break full court press with composure",
      activityType: "tactical" as const,
      difficulty: "advanced" as const,
      minPlayers: 10,
      maxPlayers: 15,
      durationMinutes: 15,
      setupInstructions: "5 offensive players inbounding vs 5 defenders in press.",
      howToPlay: `1. Inbounder slaps ball to start
2. Players execute press break alignment
3. Goal: get ball to half court in 8 seconds
4. Once across, play continues to basket`,
      coachingPoints: [
        "Stay calm - don't panic",
        "Get open by moving, not standing",
        "Look to advance when possible",
        "Use the middle of the court",
      ],
      questionsToAsk: [
        "What do you do when trapped?",
        "Where is the safe space against a press?",
        "How do you help your teammate?",
      ],
      commonMistakes: ["Panic dribbling", "Standing instead of moving", "Throwing long passes when not open"],
      variations: [
        { name: "1-2-2 Press", description: "Break specific press formation", difficulty: "advanced" },
        { name: "Must Score", description: "Play continues until score or turnover", difficulty: "advanced" },
      ],
      makeEasier: "Light press, walk through first",
      makeHarder: "Aggressive trapping, must score",
      equipmentNeeded: ["Full court", "Ball"],
      spaceRequired: "large",
      indoorSuitable: true,
      appropriateStageIds: [developmentId],
      tags: ["press break", "offense", "inbound", "tactical"],
      featured: false,
    },

    // === ADDITIONAL GAME ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "2v2 Full Court",
      slug: "2v2-full-court",
      description: "Full court game with only two players per side",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 12,
      durationMinutes: 15,
      setupInstructions: "Full court, two teams of 2. Game to 7 points.",
      howToPlay: `1. 2v2 full court - live transitions
2. Make it, take it (keep ball if you score)
3. Must check ball at top of arc after scores
4. Winners stay, losers rotate out`,
      coachingPoints: [
        "Transition quickly both ways",
        "Create for your partner",
        "Communicate on defense",
        "Good shot selection",
      ],
      questionsToAsk: [
        "How do you create for your teammate?",
        "When do you push the pace?",
      ],
      commonMistakes: ["Ball watching on defense", "Poor conditioning", "One-on-one only"],
      variations: [
        { name: "Must Pass First", description: "Must pass before you can score", difficulty: "intermediate" },
        { name: "2s and 3s", description: "Count 2s and 3s separately", difficulty: "intermediate" },
      ],
      makeEasier: "Half court instead",
      makeHarder: "Longer games, conditioning penalties for losers",
      equipmentNeeded: ["Full court", "Ball"],
      spaceRequired: "large",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "2v2", "full court", "conditioning"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "5v5 with Constraints",
      slug: "5v5-with-constraints",
      description: "Full scrimmage with specific rules to emphasize skills",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 10,
      maxPlayers: 15,
      durationMinutes: 20,
      setupInstructions: "Full court 5v5. Coach chooses constraint for each game.",
      howToPlay: `Possible constraints:
1. No dribble game (passing only)
2. Must make 3 passes before shooting
3. Everyone touches ball before shot
4. No 3-pointers (must score inside)
5. Extra point for assists
Play games with different constraints.`,
      coachingPoints: [
        "Focus on the constraint",
        "Play together",
        "Good decisions under rules",
        "Communicate",
      ],
      questionsToAsk: [
        "How did the constraint change your game?",
        "What did you have to do differently?",
      ],
      commonMistakes: ["Forgetting the constraint", "Selfish play", "Poor communication"],
      variations: [
        { name: "Defense Constraint", description: "Must switch all screens", difficulty: "advanced" },
        { name: "Zone Only", description: "Defense must play zone", difficulty: "intermediate" },
      ],
      makeEasier: "Simpler constraints",
      makeHarder: "Multiple constraints at once",
      equipmentNeeded: ["Full court", "Ball", "Pinnies"],
      spaceRequired: "large",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "5v5", "constraints", "scrimmage"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Around the World",
      slug: "around-the-world",
      description: "Classic shooting game hitting spots around the court",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 2,
      maxPlayers: 8,
      durationMinutes: 10,
      setupInstructions: "5-7 spots around the basket (layup, right block, elbow, etc.)",
      howToPlay: `1. Make shot from first spot to advance
2. Miss - you can take a 'chance' shot
3. Make the chance - advance; miss - go back to start
4. Or just stay and try again next turn
5. First to make all spots wins`,
      coachingPoints: [
        "Good form on every shot",
        "Know when to take the chance",
        "Focus on making the shot",
      ],
      questionsToAsk: [
        "When should you take the chance?",
        "What's your toughest spot?",
      ],
      commonMistakes: ["Rushing shots", "Taking bad chances", "Inconsistent form"],
      variations: [
        { name: "All 3-pointers", description: "All spots are behind the 3-point line", difficulty: "advanced" },
        { name: "No Chances", description: "Must make each shot, no risky chances", difficulty: "beginner" },
      ],
      makeEasier: "Closer spots, more chances",
      makeHarder: "Further spots, no chances allowed",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["game", "shooting", "fun", "competition"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "King of the Court",
      slug: "king-of-the-court-basketball",
      description: "Competitive 1v1 game with continuous challenger format",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 10,
      durationMinutes: 12,
      setupInstructions: "Half court. One king starts on offense, challengers wait at half court.",
      howToPlay: `1. King starts with ball vs first challenger
2. Play 1v1 to one basket
3. If king scores, they stay - next challenger comes in
4. If challenger stops them, challenger becomes new king
5. Track consecutive wins`,
      coachingPoints: [
        "Attack quickly",
        "Make quick decisions",
        "Defend with intensity",
        "Be ready to go immediately",
      ],
      questionsToAsk: [
        "How do you conserve energy as king?",
        "What's your go-to move?",
      ],
      commonMistakes: ["Too slow on offense", "Fouling", "Getting tired"],
      variations: [
        { name: "2v2 Kings", description: "Play with partners", difficulty: "intermediate" },
        { name: "Point System", description: "Track total points instead", difficulty: "beginner" },
      ],
      makeEasier: "King gets ball at free throw line",
      makeHarder: "King must start from 3-point line",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "1v1", "competition", "intensity"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Hot Shot Challenge",
      slug: "hot-shot-challenge",
      description: "Timed shooting game from multiple spots",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 2,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "5 spots around the arc. Balls at each spot. 60 seconds per player.",
      howToPlay: `1. Start at spot 1, shoot until you make it
2. Move to spot 2, repeat
3. After making at spot 5, return to spot 1
4. Count total makes in 60 seconds
5. Compare scores to determine winner`,
      coachingPoints: [
        "Quick release",
        "Same form every shot",
        "Move quickly between spots",
        "Don't dwell on misses",
      ],
      questionsToAsk: [
        "How do you stay focused?",
        "Where do you shoot best under pressure?",
      ],
      commonMistakes: ["Rushing form", "Slow transitions", "Getting frustrated"],
      variations: [
        { name: "Layup Start", description: "Start with a layup from under basket", difficulty: "intermediate" },
        { name: "Partner Rebound", description: "Partner rebounds for faster attempts", difficulty: "intermediate" },
      ],
      makeEasier: "Fewer spots, more time",
      makeHarder: "More spots, less time, further distance",
      equipmentNeeded: ["Baskets", "Multiple balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "shooting", "timed", "competition"],
      featured: false,
    },

    // === ADDITIONAL CONDITIONING ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "17s",
      slug: "seventeen-drill",
      description: "Classic conditioning drill - sideline to sideline",
      activityType: "conditioning" as const,
      difficulty: "advanced" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 10,
      setupInstructions: "Players on sideline. Time each rep.",
      howToPlay: `1. Sprint sideline to sideline (17 touches in 60 seconds)
2. Each foot touch on sideline counts as 1
3. Must complete 17 touches per rep
4. Rest 90 seconds between reps
5. Complete 3-5 reps`,
      coachingPoints: [
        "Touch line every time",
        "Quick turnover at each line",
        "Pace yourself but push hard",
        "Mental toughness",
      ],
      questionsToAsk: [
        "How do you pace yourself?",
        "How do you push through when tired?",
      ],
      commonMistakes: ["Not touching lines", "Starting too fast", "Giving up"],
      variations: [
        { name: "14s", description: "Easier version - 14 touches in 60 seconds", difficulty: "intermediate" },
        { name: "Team 17s", description: "Whole team must finish or repeat", difficulty: "advanced" },
      ],
      makeEasier: "Fewer touches required, more rest",
      makeHarder: "More touches, less rest, more reps",
      equipmentNeeded: ["Court"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [developmentId],
      tags: ["conditioning", "sprinting", "endurance", "mental"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Full Court Layups",
      slug: "full-court-layups",
      description: "Continuous layups with full court running",
      activityType: "conditioning" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 8,
      setupInstructions: "Two lines at each basket. One ball per line.",
      howToPlay: `1. Player 1 makes layup, sprints to opposite basket
2. Receives outlet pass from line 2 at half court
3. Makes layup, joins line
4. Next player goes when layup is made
5. Continuous for time`,
      coachingPoints: [
        "Make every layup",
        "Sprint at game speed",
        "Clean passing",
        "Push through fatigue",
      ],
      questionsToAsk: [
        "How do you stay focused when tired?",
        "Can you still make layups at high speed?",
      ],
      commonMistakes: ["Missed layups", "Jogging instead of sprinting", "Poor passes"],
      variations: [
        { name: "Alternating Hands", description: "Must alternate finishing hands", difficulty: "intermediate" },
        { name: "Add Finish", description: "Different finish each time (reverse, power)", difficulty: "advanced" },
      ],
      makeEasier: "Walking pace first, shorter time",
      makeHarder: "Sprint pace, longer time, missed layup = restart count",
      equipmentNeeded: ["Full court", "Balls"],
      spaceRequired: "large",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["conditioning", "layups", "sprinting", "cardio"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Defensive Slides Conditioning",
      slug: "defensive-slides-conditioning",
      description: "Defensive conditioning through continuous slides",
      activityType: "conditioning" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 8,
      setupInstructions: "Players on baseline in defensive stance.",
      howToPlay: `1. Slide to free throw line
2. Drop step, slide to opposite elbow
3. Drop step, slide to half court
4. Backpedal to baseline
5. Repeat 3-5 times with rest between`,
      coachingPoints: [
        "Stay low the entire time",
        "Push off back foot",
        "Hands active",
        "Don't cross feet",
      ],
      questionsToAsk: [
        "How do your legs feel?",
        "Why is staying low so hard?",
      ],
      commonMistakes: ["Standing up", "Crossing feet", "Slow transitions"],
      variations: [
        { name: "Add Closeouts", description: "Closeout at each spot before sliding", difficulty: "advanced" },
        { name: "Mirror Partner", description: "Partner leads with ball, you mirror", difficulty: "intermediate" },
      ],
      makeEasier: "Fewer reps, more rest",
      makeHarder: "More reps, less rest, add ball to mirror",
      equipmentNeeded: ["Court"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["conditioning", "defense", "slides", "legs"],
      featured: false,
    },

    // === ADDITIONAL FUN ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "HORSE",
      slug: "horse-game",
      description: "Classic trick shot matching game",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 2,
      maxPlayers: 6,
      durationMinutes: 12,
      setupInstructions: "One basket, one ball per group.",
      howToPlay: `1. First player attempts any shot they want
2. If they make it, others must match the exact shot
3. If you miss the match shot, you get a letter (H-O-R-S-E)
4. Spell HORSE and you're out
5. Last player standing wins`,
      coachingPoints: [
        "Be creative with shots",
        "Challenge yourself and others",
        "Good sportsmanship",
        "Have fun!",
      ],
      questionsToAsk: [
        "What's your signature shot?",
        "What shot is hardest for you?",
      ],
      commonMistakes: ["Only doing basic shots", "Getting frustrated"],
      variations: [
        { name: "PIG", description: "Shorter version with 3 letters", difficulty: "beginner" },
        { name: "BASKETBALL", description: "Longer version for more challenge", difficulty: "intermediate" },
      ],
      makeEasier: "Closer shots, PIG instead",
      makeHarder: "Must be behind 3-point line, creative shots",
      equipmentNeeded: ["Basket", "Ball"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["fun", "shooting", "game", "creativity"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Musical Basketballs",
      slug: "musical-basketballs",
      description: "Basketball version of musical chairs with dribbling",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 20,
      durationMinutes: 8,
      setupInstructions: "One fewer ball than players. Music ready to play.",
      howToPlay: `1. Balls scattered around the gym
2. Players jog/skip while music plays
3. When music stops, grab a ball and do 5 crossovers
4. Player without ball is out (or does task and rejoins)
5. Remove one ball each round`,
      coachingPoints: [
        "Stay aware of where balls are",
        "React quickly to music",
        "Secure the ball before dribbling",
      ],
      questionsToAsk: [
        "How do you position yourself near a ball?",
        "What's your strategy?",
      ],
      commonMistakes: ["Standing in one spot", "Fighting over balls"],
      variations: [
        { name: "Skills Challenge", description: "Must complete specific skill to stay in", difficulty: "intermediate" },
        { name: "No Elimination", description: "Everyone does task, just for fun", difficulty: "beginner" },
      ],
      makeEasier: "No elimination, everyone does task",
      makeHarder: "More complex skills required",
      equipmentNeeded: ["Balls (one fewer than players)", "Music"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId],
      tags: ["fun", "game", "dribbling", "warmup"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Bump Out",
      slug: "bump-out",
      description: "Competitive layup game with elimination",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 15,
      durationMinutes: 10,
      setupInstructions: "One line at free throw line. Two balls.",
      howToPlay: `1. First two players have balls
2. First player shoots free throw, then rebounds and shoots layup
3. Second player shoots immediately after
4. If second player makes layup before first player, first player is OUT
5. Pass ball to next in line, go to back of line`,
      coachingPoints: [
        "Make your free throw!",
        "Quick rebound and layup",
        "Stay focused under pressure",
      ],
      questionsToAsk: [
        "How do you stay calm with pressure behind you?",
        "What's the fastest path to the basket?",
      ],
      commonMistakes: ["Panic shooting", "Missing easy layups", "Slow rebound"],
      variations: [
        { name: "3-Point Bump", description: "Start from 3-point line", difficulty: "advanced" },
        { name: "No Layups", description: "Any shot counts, no layup required", difficulty: "intermediate" },
      ],
      makeEasier: "Start closer, more attempts before out",
      makeHarder: "Start from 3, must make 2 layups",
      equipmentNeeded: ["Basket", "2 balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["fun", "game", "competition", "shooting"],
      featured: true,
    },
    {
      sportId: basketball.id,
      name: "Dribble Relay Races",
      slug: "dribble-relay-races",
      description: "Team relay races incorporating dribbling skills",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 8,
      maxPlayers: 24,
      durationMinutes: 10,
      setupInstructions: "Two or more teams. Cone course set up.",
      howToPlay: `1. First player dribbles through course
2. Returns and tags next player
3. First team to finish wins
4. Variety: crossovers at each cone, weak hand only, etc.`,
      coachingPoints: [
        "Control before speed",
        "Keep head up when possible",
        "Smooth moves at cones",
        "Cheer for your team!",
      ],
      questionsToAsk: [
        "How do you balance speed and control?",
        "What slowed you down?",
      ],
      commonMistakes: ["Losing ball at speed", "Wrong moves at cones"],
      variations: [
        { name: "Backward Dribble", description: "Must dribble backward on return", difficulty: "intermediate" },
        { name: "Partner Relay", description: "Pass to partner at half, they finish", difficulty: "intermediate" },
      ],
      makeEasier: "Simpler course, no move requirements",
      makeHarder: "Complex course, specific moves required",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["fun", "relay", "dribbling", "competition"],
      featured: false,
    },

    // === ADDITIONAL COOLDOWN ACTIVITIES ===
    {
      sportId: basketball.id,
      name: "Free Throw Shooting Contest",
      slug: "free-throw-contest",
      description: "Cool down with friendly free throw competition",
      activityType: "cooldown" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 8,
      setupInstructions: "Groups at each basket. Track makes per player.",
      howToPlay: `1. Each player shoots 10 free throws
2. Track your makes
3. Team total determines winner (if teams)
4. Or individual with most makes wins
5. Loser does 10 push-ups (optional)`,
      coachingPoints: [
        "Establish your routine",
        "Same form every time",
        "Deep breaths between shots",
        "Focus on the back of the rim",
      ],
      questionsToAsk: [
        "What's your personal best?",
        "What helps you focus?",
      ],
      commonMistakes: ["Rushing", "Inconsistent routine", "Not focusing"],
      variations: [
        { name: "Pressure Free Throws", description: "Must make last 2 or run", difficulty: "intermediate" },
        { name: "Team Total", description: "Team must hit combined 15/20", difficulty: "intermediate" },
      ],
      makeEasier: "No pressure, just practice",
      makeHarder: "Pressure shots, consequences for misses",
      equipmentNeeded: ["Baskets", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["cooldown", "free throws", "competition", "shooting"],
      featured: false,
    },
    {
      sportId: basketball.id,
      name: "Team Stretching Circle",
      slug: "team-stretching-circle",
      description: "Team-led stretching to cool down after practice",
      activityType: "cooldown" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 8,
      setupInstructions: "Team forms a circle. Captain leads stretches.",
      howToPlay: `Each stretch 20-30 seconds:
1. Quad stretch (standing, each leg)
2. Hamstring stretch (seated pike)
3. Groin stretch (butterfly)
4. Calf stretch
5. Shoulder stretches
6. Hip flexor stretch`,
      coachingPoints: [
        "Hold stretches, don't bounce",
        "Breathe deeply",
        "Feel the stretch, not pain",
        "Good time to discuss practice",
      ],
      questionsToAsk: [
        "What muscles are tight today?",
        "Why is stretching important?",
      ],
      commonMistakes: ["Bouncing", "Not holding long enough", "Skipping stretches"],
      variations: [
        { name: "Player Led", description: "Different player leads each practice", difficulty: "beginner" },
        { name: "Partner Stretches", description: "Help each other stretch", difficulty: "beginner" },
      ],
      makeEasier: "Shorter holds, fewer stretches",
      makeHarder: "Longer holds, more stretches, add core work",
      equipmentNeeded: ["None"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["cooldown", "stretching", "recovery", "team"],
      featured: false,
    },
  ];

  // Insert activities
  for (const activity of basketballActivities) {
    try {
      await getDb().insert(activities).values(activity).onConflictDoNothing();
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

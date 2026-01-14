import { db } from "../index";
import { activities, developmentStages } from "../schema";
import { sports } from "../schema/sports";
import { eq } from "drizzle-orm";

export async function seedSoccerActivities() {
  if (!db) {
    console.error("Database not available");
    return;
  }

  console.log("Seeding soccer activities...");

  // Get soccer sport
  const [soccer] = await db
    .select()
    .from(sports)
    .where(eq(sports.name, "Soccer"));

  if (!soccer) {
    console.error("Soccer sport not found. Run seed.ts first.");
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

  const soccerActivities = [
    // === WARMUP ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Shark Attack",
      slug: "shark-attack",
      description: "Fun dribbling warmup game where players protect their ball from 'sharks'",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 20,
      durationMinutes: 8,
      setupInstructions: "Create a 20x20 yard grid with cones. Each player has a ball except 2-3 'sharks'.",
      howToPlay: `1. All players with balls dribble freely inside the grid
2. 'Sharks' (without balls) try to kick players' balls out of the grid
3. If your ball is kicked out, do 5 toe taps and return
4. Rotate sharks every 2 minutes`,
      coachingPoints: [
        "Keep the ball close to your feet",
        "Use your body to shield the ball",
        "Keep your head up to see the sharks",
        "Change direction quickly when a shark approaches"
      ],
      questionsToAsk: [
        "Where are the sharks?",
        "How can you protect your ball?",
        "What part of your foot keeps the ball closest?"
      ],
      commonMistakes: [
        "Looking down at the ball too much",
        "Dribbling too fast and losing control",
        "Not using body to shield"
      ],
      variations: [
        { name: "Freeze Tag Sharks", description: "If tagged, freeze until another player passes through your legs", difficulty: "beginner" },
        { name: "Two-Ball Sharks", description: "Some players dribble two balls", difficulty: "intermediate" }
      ],
      makeEasier: "Fewer sharks, larger grid",
      makeHarder: "More sharks, smaller grid, must dribble with weak foot only",
      equipmentNeeded: ["Cones", "1 ball per player (except sharks)"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["warmup", "dribbling", "fun", "game"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Traffic Lights",
      slug: "traffic-lights",
      description: "Dribbling warmup with color commands for different actions",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 6,
      setupInstructions: "Use a 25x25 yard grid. Every player has a ball.",
      howToPlay: `1. Players dribble freely in the grid
2. Coach calls colors:
   - GREEN: Dribble fast
   - YELLOW: Dribble slow with close touches
   - RED: Stop the ball with sole of foot
3. Add more commands as players improve`,
      coachingPoints: [
        "React quickly to commands",
        "Keep ball under control at all speeds",
        "Use different surfaces of the foot",
        "Keep head up to hear and see"
      ],
      questionsToAsk: [
        "Which part of your foot stops the ball best?",
        "How do you change speed without losing the ball?"
      ],
      commonMistakes: [
        "Ball getting away when going fast",
        "Not stopping quickly on red"
      ],
      variations: [
        { name: "Add Purple", description: "Purple = do a move (turn, stepover)", difficulty: "intermediate" },
        { name: "Add Blue", description: "Blue = find a partner and pass 3 times", difficulty: "intermediate" }
      ],
      makeEasier: "Just use green and red at first",
      makeHarder: "Add more colors, require weak foot only",
      equipmentNeeded: ["Cones", "1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["warmup", "dribbling", "listening", "ball control"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Ball Mastery Circle",
      slug: "ball-mastery-circle",
      description: "Individual ball mastery exercises done in a circle formation",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 8,
      setupInstructions: "Players form a circle, each with a ball. Coach demonstrates from center.",
      howToPlay: `Perform each exercise for 30-45 seconds:
1. Toe taps (alternate feet on top of ball)
2. Side-to-side rolls (sole of foot)
3. Pull-push (pull back, push forward)
4. Around the world (circle ball with one foot)
5. Scissors (step over ball, alternating feet)
6. Foundation touches (inside-outside, same foot)`,
      coachingPoints: [
        "Quick, light touches",
        "Knees slightly bent",
        "Stay on balls of feet",
        "Small movements, ball stays close"
      ],
      questionsToAsk: [
        "Can you do it faster?",
        "Can you do it without looking?",
        "Which foot is harder?"
      ],
      commonMistakes: [
        "Touching ball too hard",
        "Standing flat-footed",
        "Looking down constantly"
      ],
      variations: [
        { name: "Mirror Partner", description: "Partners mirror each other's moves", difficulty: "intermediate" },
        { name: "Add Movement", description: "Do moves while slowly moving forward", difficulty: "intermediate" }
      ],
      makeEasier: "Slower pace, fewer exercises",
      makeHarder: "Faster pace, add combinations, music with beat",
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["warmup", "ball mastery", "individual", "technique"],
      featured: true,
    },

    // === TECHNICAL ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Gates Dribbling",
      slug: "gates-dribbling",
      description: "Dribble through small cone gates scattered around the area",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 10,
      setupInstructions: "Set up 10-15 gates (2 cones 2 yards apart) randomly in a 25x25 yard grid. Every player has a ball.",
      howToPlay: `1. Players dribble and try to pass through as many gates as possible
2. Count how many gates you can get through in 60 seconds
3. Can't go through same gate twice in a row
4. After 60 seconds, try to beat your score`,
      coachingPoints: [
        "Plan your route - look ahead",
        "Use both feet",
        "Change direction with inside and outside of foot",
        "Accelerate through the gate"
      ],
      questionsToAsk: [
        "How do you find open gates?",
        "Which foot should you use for which gates?",
        "How can you go faster?"
      ],
      commonMistakes: [
        "Only using one foot",
        "Not planning ahead",
        "Slowing down to go through gates"
      ],
      variations: [
        { name: "Partner Gates", description: "Partners must pass through same gate together", difficulty: "intermediate" },
        { name: "Defended Gates", description: "Add defenders who guard 2-3 gates each", difficulty: "advanced" }
      ],
      makeEasier: "Wider gates, more time",
      makeHarder: "Narrower gates, weak foot only, add defenders",
      equipmentNeeded: ["Cones (30+)", "1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["dribbling", "technique", "agility", "individual"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Wall Pass Combinations",
      slug: "wall-pass-combinations",
      description: "Practice one-two passing patterns with a partner or group",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Set up pairs of cones 10-12 yards apart. Groups of 3 work together.",
      howToPlay: `1. Player A passes to Player B (the 'wall')
2. Player A sprints forward
3. Player B plays one-touch pass into A's path
4. Player A receives and dribbles to the end
5. Rotate positions after each repetition`,
      coachingPoints: [
        "Quality first pass to the wall",
        "Sprint immediately after passing",
        "Wall player: open body position",
        "Return pass should be in front of runner"
      ],
      questionsToAsk: [
        "Where should your first touch be?",
        "When do you start your run?",
        "How does the wall player know where to pass?"
      ],
      commonMistakes: [
        "Not sprinting after first pass",
        "Wall pass behind the runner",
        "Poor first touch stopping momentum"
      ],
      variations: [
        { name: "Third Man Run", description: "Add third player making overlapping run", difficulty: "advanced" },
        { name: "Double Wall", description: "Two wall passes in sequence", difficulty: "advanced" }
      ],
      makeEasier: "Two-touch for wall player, shorter distance",
      makeHarder: "Add passive defender, require weak foot",
      equipmentNeeded: ["Cones", "1 ball per group"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["passing", "combination play", "one-two", "movement"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Receiving Under Pressure",
      slug: "receiving-under-pressure",
      description: "Practice first touch with defender applying pressure",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 18,
      durationMinutes: 12,
      setupInstructions: "Create a 10x10 yard box. Groups of 3: passer, receiver, defender.",
      howToPlay: `1. Receiver starts in box with passive defender behind
2. Server passes to receiver
3. Receiver must control ball and dribble out any side
4. Defender can close down but stays passive initially
5. Rotate after 4 repetitions`,
      coachingPoints: [
        "Check shoulder before receiving",
        "First touch away from pressure",
        "Body position to shield ball",
        "Accelerate after first touch"
      ],
      questionsToAsk: [
        "Where is the defender?",
        "Which way is the space?",
        "How do you decide which foot to use?"
      ],
      commonMistakes: [
        "Not checking shoulder",
        "First touch into defender",
        "Standing still after receiving"
      ],
      variations: [
        { name: "Active Defender", description: "Defender can try to win ball", difficulty: "advanced" },
        { name: "Two Gates", description: "Must exit through specific gate for bonus point", difficulty: "intermediate" }
      ],
      makeEasier: "Larger box, defender starts farther away",
      makeHarder: "Smaller box, fully active defender, add second defender",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["receiving", "first touch", "1v1", "pressure"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Coerver Moves Circuit",
      slug: "coerver-moves-circuit",
      description: "Practice classic dribbling moves at different stations",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 20,
      durationMinutes: 15,
      setupInstructions: "Set up 4-5 stations with cones. Each station practices a different move.",
      howToPlay: `Station 1: Scissors - step over ball, take with outside of other foot
Station 2: Step-over turn - fake to go one way, pull back
Station 3: Matthews cut - inside-outside quick change
Station 4: Cruyff turn - drag ball behind standing leg
Station 5: La Croqueta - inside to inside quick switch

Spend 2 minutes at each station, then rotate.`,
      coachingPoints: [
        "Sell the fake with body movement",
        "Accelerate after the move",
        "Practice both sides",
        "Keep ball close during the move"
      ],
      questionsToAsk: [
        "When would you use this move in a game?",
        "How do you sell the fake?",
        "Which is your best move?"
      ],
      commonMistakes: [
        "No change of pace after move",
        "Ball too far from body",
        "Only practicing dominant foot"
      ],
      variations: [
        { name: "Add Cone Defender", description: "Do move around a cone 'defender'", difficulty: "intermediate" },
        { name: "Chain Moves", description: "Do 2-3 moves in combination", difficulty: "advanced" }
      ],
      makeEasier: "Fewer moves, more time per station",
      makeHarder: "Add passive defender, require combo moves",
      equipmentNeeded: ["Cones", "1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["dribbling", "moves", "1v1", "technique"],
      featured: true,
    },

    // === TACTICAL/GAME ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "4v4 to Small Goals",
      slug: "4v4-small-goals",
      description: "Small-sided game focusing on combination play and quick decisions",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 8,
      maxPlayers: 12,
      durationMinutes: 15,
      setupInstructions: "Create a 30x25 yard field with small goals (pugg goals) at each end. No goalkeepers.",
      howToPlay: `1. Play 4v4 (or 4v4+2 neutral players)
2. Score by passing or dribbling through small goal
3. After a goal, play restarts from the other team's goal
4. Play 3-4 minute games, then rotate teams`,
      coachingPoints: [
        "Keep width and depth",
        "Quick ball movement",
        "Support the ball carrier",
        "Find the open player"
      ],
      questionsToAsk: [
        "Where is the open goal?",
        "Who is your support?",
        "What happens when we lose the ball?"
      ],
      commonMistakes: [
        "Everyone going to the ball",
        "Holding ball too long",
        "Not spreading out"
      ],
      variations: [
        { name: "Two-Touch Limit", description: "Maximum two touches per player", difficulty: "advanced" },
        { name: "Four Goals", description: "Teams can score on either goal for added decision-making", difficulty: "intermediate" }
      ],
      makeEasier: "Add neutral players, no touch limit",
      makeHarder: "One-touch finish required, smaller field",
      equipmentNeeded: ["Cones", "Small goals or pugg goals", "Pinnies", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "small-sided", "tactical", "decision-making"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "3v1 Rondo",
      slug: "3v1-rondo",
      description: "Classic possession game to develop quick passing and movement",
      activityType: "tactical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 12,
      durationMinutes: 10,
      setupInstructions: "Create 8x8 yard squares. Groups of 4 players, 3 on outside, 1 in middle.",
      howToPlay: `1. Three players on outside try to keep the ball
2. Defender in middle tries to win ball or force it out
3. If defender wins ball, they swap with player who lost it
4. Count consecutive passes - try to beat your record`,
      coachingPoints: [
        "Move after you pass",
        "Create passing angles",
        "Play one or two-touch",
        "Communicate with teammates"
      ],
      questionsToAsk: [
        "How can you help the ball carrier?",
        "Where should you move after passing?",
        "When do you play one-touch vs two-touch?"
      ],
      commonMistakes: [
        "Standing still after passing",
        "Passing to feet instead of space",
        "Taking too many touches"
      ],
      variations: [
        { name: "4v1", description: "Four outside players for easier possession", difficulty: "beginner" },
        { name: "3v2", description: "Two defenders for more pressure", difficulty: "advanced" }
      ],
      makeEasier: "Larger box, 4v1 instead of 3v1",
      makeHarder: "Smaller box, 3v2, one-touch only",
      equipmentNeeded: ["Cones", "Balls", "Pinnies optional"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["possession", "passing", "rondo", "movement"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "End Zone Game",
      slug: "end-zone-game",
      description: "Possession game where teams score by dribbling into end zone",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 8,
      maxPlayers: 16,
      durationMinutes: 15,
      setupInstructions: "Create a 35x25 yard field with 5-yard end zones at each end. Two equal teams.",
      howToPlay: `1. Teams try to dribble ball under control into opponent's end zone
2. Must be in control of ball when entering end zone to score
3. After a score, other team gets ball from their end zone
4. No goalkeepers - all outfield players`,
      coachingPoints: [
        "Width in attack",
        "Quick ball circulation",
        "Recognize when to dribble vs pass",
        "Support the ball carrier"
      ],
      questionsToAsk: [
        "When should you try to score vs keep possession?",
        "How do you create space to dribble into the zone?",
        "Where should you be when your teammate has the ball?"
      ],
      commonMistakes: [
        "Rushing into end zone without control",
        "Not spreading out",
        "Everyone chasing the ball"
      ],
      variations: [
        { name: "Receive in End Zone", description: "Must receive pass in end zone (not dribble) to score", difficulty: "intermediate" },
        { name: "Time Limit", description: "Must score within 30 seconds or lose possession", difficulty: "advanced" }
      ],
      makeEasier: "Wider field, larger end zones",
      makeHarder: "Smaller end zones, add neutral player for defending team",
      equipmentNeeded: ["Cones", "Pinnies", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["game", "possession", "dribbling", "tactical"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "1v1 to Goal",
      slug: "1v1-to-goal",
      description: "Classic 1v1 duel with attacker trying to score on goal",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Set up a 20x15 yard box with a full goal (or large goal). Goalkeeper in goal. Two lines of players.",
      howToPlay: `1. Attacker starts with ball at top of box
2. Defender starts on goal line next to goalkeeper
3. On 'Go', defender sprints out to close down attacker
4. Attacker tries to beat defender and score
5. Play ends when goal is scored, ball goes out, or GK saves
6. Attacker becomes defender, new attacker steps up`,
      coachingPoints: [
        "Attack the space before defender arrives",
        "Use your body to protect the ball",
        "Commit the defender before making a move",
        "Be decisive - shoot when you have chance"
      ],
      questionsToAsk: [
        "When should you take on the defender vs shoot?",
        "How do you use your body?",
        "What moves work best in this situation?"
      ],
      commonMistakes: [
        "Waiting for defender to arrive",
        "Predictable - always going same way",
        "Not shooting when chance is there"
      ],
      variations: [
        { name: "Delayed Start", description: "Attacker must complete 5 touches before defender can leave", difficulty: "beginner" },
        { name: "Two Attackers", description: "2v1 with overlapping run option", difficulty: "intermediate" }
      ],
      makeEasier: "Defender starts further back, larger goal",
      makeHarder: "Defender starts closer, add time limit (5 seconds)",
      equipmentNeeded: ["Cones", "Goal", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["1v1", "shooting", "dribbling", "finishing"],
      featured: true,
    },

    // === CONDITIONING ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Ball Tag",
      slug: "ball-tag",
      description: "Fun conditioning game where everyone dribbles while playing tag",
      activityType: "conditioning" as const,
      difficulty: "beginner" as const,
      minPlayers: 8,
      maxPlayers: 24,
      durationMinutes: 8,
      setupInstructions: "Use a 25x25 yard grid. Everyone has a ball. Select 2-3 taggers who wear pinnies.",
      howToPlay: `1. Everyone dribbles inside the grid, including taggers
2. Taggers try to tag other players while dribbling
3. If tagged, do 10 ball taps and return to the game
4. Rotate taggers every 90 seconds`,
      coachingPoints: [
        "Keep ball close while looking around",
        "Change direction suddenly to escape",
        "Use your body to shield",
        "Stay alert - know where taggers are"
      ],
      questionsToAsk: [
        "How do you escape the taggers?",
        "How do you keep control while running?"
      ],
      commonMistakes: [
        "Losing the ball while running",
        "Not keeping head up"
      ],
      variations: [
        { name: "Freeze Ball Tag", description: "Tagged players freeze, can be freed by another player passing through their legs", difficulty: "intermediate" }
      ],
      makeEasier: "Fewer taggers, larger grid",
      makeHarder: "More taggers, smaller grid",
      equipmentNeeded: ["Cones", "1 ball per player", "Pinnies"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["conditioning", "dribbling", "fun", "agility"],
      featured: false,
    },

    // === COOLDOWN ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Passing Pairs",
      slug: "passing-pairs",
      description: "Simple partner passing to cool down and focus on technique",
      activityType: "cooldown" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 6,
      setupInstructions: "Partners stand 10-15 yards apart. One ball per pair.",
      howToPlay: `1. Pass back and forth, focusing on technique
2. Receive with inside of foot, pass with inside
3. Two touches: one to control, one to pass
4. Switch to different passes: outside of foot, driven pass`,
      coachingPoints: [
        "Lock ankle when passing",
        "Follow through to target",
        "Soft first touch",
        "Communicate with partner"
      ],
      questionsToAsk: [
        "What makes a good pass?",
        "Where should your first touch go?"
      ],
      commonMistakes: [
        "Ankle not locked",
        "Toe poking the ball"
      ],
      variations: [
        { name: "One Touch", description: "Challenge to play one-touch passes", difficulty: "intermediate" }
      ],
      makeEasier: "Closer together",
      makeHarder: "Farther apart, one-touch only",
      equipmentNeeded: ["1 ball per pair"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["cooldown", "passing", "technique", "partners"],
      featured: false,
    },

    // === FUN ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "World Cup",
      slug: "world-cup-game",
      description: "Classic knockout shooting game that kids love",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "One goal with goalkeeper. All other players start at the top of the box.",
      howToPlay: `1. Coach serves balls randomly into the box
2. Everyone is for themselves - score in the goal
3. First to score 3 goals wins
4. If goalkeeper saves and shouts your name, you're eliminated
5. Can steal ball from anyone`,
      coachingPoints: [
        "Be first to the ball",
        "Shoot when you have a chance",
        "Shield the ball",
        "Stay alert"
      ],
      questionsToAsk: [
        "When should you shoot vs dribble?",
        "How do you get free from others?"
      ],
      commonMistakes: [
        "Taking too long to shoot",
        "Not being aware of others"
      ],
      variations: [
        { name: "Must One-Touch", description: "First touch must be a shot", difficulty: "advanced" },
        { name: "Headers Only", description: "Coach throws balls for headers only", difficulty: "intermediate" }
      ],
      makeEasier: "More balls in play",
      makeHarder: "Fewer balls, smaller goal",
      equipmentNeeded: ["Goal", "Many balls"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["fun", "shooting", "game", "competitive"],
      featured: true,
    },
  ];

  // Insert activities
  for (const activity of soccerActivities) {
    try {
      await db.insert(activities).values(activity).onConflictDoNothing();
      console.log(`  ✓ ${activity.name}`);
    } catch (error) {
      console.error(`  ✗ Error inserting ${activity.name}:`, error);
    }
  }

  console.log(`Seeded ${soccerActivities.length} soccer activities`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedSoccerActivities()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

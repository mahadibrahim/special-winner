import { getDb } from "../index";
import { activities, developmentStages } from "../schema";
import { sports } from "../schema/sports";
import { eq } from "drizzle-orm";

export async function seedSoccerActivities() {
  if (false) {
    console.error("Database not available");
    return;
  }

  console.log("Seeding soccer activities...");

  // Get soccer sport
  const [soccer] = await getDb()
    .select()
    .from(sports)
    .where(eq(sports.name, "Soccer"));

  if (!soccer) {
    console.error("Soccer sport not found. Run seed.ts first.");
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

    // === ADDITIONAL WARMUP ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Musical Balls",
      slug: "musical-balls",
      description: "Soccer version of musical chairs - when music stops, find a ball!",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 8,
      maxPlayers: 24,
      durationMinutes: 7,
      setupInstructions: "Scatter balls in a 25x25 grid - one fewer ball than players.",
      howToPlay: `1. Players jog/skip around the grid while music plays
2. When music stops, find a ball and perform a move (toe taps)
3. Player without a ball does 5 jumping jacks
4. Remove one ball each round until final two players`,
      coachingPoints: [
        "Stay light on your feet",
        "Be aware of space around you",
        "React quickly to the music",
      ],
      questionsToAsk: [
        "How do you position yourself near a ball?",
        "What helps you react faster?",
      ],
      commonMistakes: ["Standing too far from balls", "Not paying attention"],
      variations: [
        { name: "Skills Challenge", description: "Must complete 10 toe taps to 'claim' the ball", difficulty: "intermediate" },
      ],
      makeEasier: "Fewer balls removed each round",
      makeHarder: "More balls removed, smaller grid",
      equipmentNeeded: ["Balls (one fewer than players)", "Music speaker"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId],
      tags: ["warmup", "fun", "agility", "awareness"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Copy Cat Dribbling",
      slug: "copy-cat-dribbling",
      description: "Follow the leader dribbling game where players mirror the coach or leader",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 6,
      setupInstructions: "Open space, each player has a ball. Coach leads from the front.",
      howToPlay: `1. Players dribble following the leader
2. Leader performs different moves - players copy
3. Include: speed changes, direction changes, stops, turns
4. Rotate leader every 60-90 seconds`,
      coachingPoints: [
        "Keep ball close while watching leader",
        "Quick reactions",
        "Use different parts of foot",
      ],
      questionsToAsk: [
        "How do you watch and dribble at the same time?",
        "Which moves were hardest to copy?",
      ],
      commonMistakes: ["Watching only the ball", "Getting too far behind"],
      variations: [
        { name: "Freeze Copy", description: "Must freeze in exact same position as leader", difficulty: "intermediate" },
      ],
      makeEasier: "Slower pace, simpler moves",
      makeHarder: "Faster pace, complex combinations",
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["warmup", "dribbling", "following", "fun"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Volcano Dribble",
      slug: "volcano-dribble",
      description: "Dribble around 'volcanos' (cones) without touching them",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 6,
      setupInstructions: "Set up 15-20 cones randomly in a 30x30 grid. Each player has a ball.",
      howToPlay: `1. Players dribble freely avoiding the 'volcanos' (cones)
2. If you touch a volcano, it 'erupts' - do 5 toe taps
3. Coach can call 'Lava flow!' - everyone must freeze
4. Keep count of how many times you touched a volcano`,
      coachingPoints: [
        "Head up to see the volcanos",
        "Small touches to change direction",
        "Use different surfaces of foot",
      ],
      questionsToAsk: [
        "How do you avoid the volcanos?",
        "What part of your foot helps you turn quickly?",
      ],
      commonMistakes: ["Looking down at ball", "Big touches that lose control"],
      variations: [
        { name: "Moving Volcanos", description: "Some players are 'volcanos' that slowly move", difficulty: "intermediate" },
      ],
      makeEasier: "Fewer volcanos, larger spaces",
      makeHarder: "More volcanos, smaller spaces, faster pace",
      equipmentNeeded: ["Cones (15-20)", "1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId],
      tags: ["warmup", "dribbling", "awareness", "fun"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Numbers Game Warmup",
      slug: "numbers-game-warmup",
      description: "Coach calls numbers for different movements while dribbling",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 7,
      setupInstructions: "30x30 grid, each player has a ball. Review number commands first.",
      howToPlay: `Number commands:
1 = Stop ball with sole
2 = Speed dribble
3 = Turn around (any turn)
4 = Change direction (cut)
5 = Do a skill move
Players dribble freely, coach calls numbers.`,
      coachingPoints: [
        "React quickly to numbers",
        "Keep ball under control",
        "Practice different skills on command",
      ],
      questionsToAsk: [
        "Which number is hardest for you?",
        "What move do you do for number 5?",
      ],
      commonMistakes: ["Forgetting the numbers", "Slow reactions"],
      variations: [
        { name: "Player Caller", description: "A player becomes the number caller", difficulty: "beginner" },
        { name: "Add Colors", description: "Use both numbers and colors for different actions", difficulty: "intermediate" },
      ],
      makeEasier: "Fewer numbers (1-3 only)",
      makeHarder: "More numbers, faster calling, add combinations",
      equipmentNeeded: ["1 ball per player", "Cones for grid"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["warmup", "dribbling", "listening", "reactions"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Partner Mirror Warmup",
      slug: "partner-mirror-warmup",
      description: "Partners face each other, one leads dribbling moves and other mirrors",
      activityType: "warmup" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 8,
      setupInstructions: "Partners 3-4 yards apart, each with a ball, facing each other.",
      howToPlay: `1. One partner is the leader, performs moves
2. Other partner mirrors (opposite direction)
3. Include: side-to-side, forward-back, turns, skills
4. Switch leader every 45 seconds`,
      coachingPoints: [
        "Watch partner's hips, not their ball",
        "Stay balanced and ready to react",
        "Smooth, controlled movements",
      ],
      questionsToAsk: [
        "How do you anticipate what your partner will do?",
        "Which movements are hardest to mirror?",
      ],
      commonMistakes: ["Watching the ball instead of partner", "Slow reactions"],
      variations: [
        { name: "No Ball Mirror", description: "Start without balls, just movement", difficulty: "beginner" },
        { name: "Add Passes", description: "Include passing back and forth in the mirror", difficulty: "advanced" },
      ],
      makeEasier: "Slower movements, no ball first",
      makeHarder: "Faster movements, add skills",
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["warmup", "coordination", "reactions", "partners"],
      featured: false,
    },

    // === ADDITIONAL TECHNICAL ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Passing Accuracy Challenge",
      slug: "passing-accuracy-challenge",
      description: "Hit targets with passes to score points",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Set up 5-6 cone gates of varying widths at 10-20 yards distance.",
      howToPlay: `1. Players line up with balls
2. Pass through gates to score points
3. Narrow gate = 3 points, medium = 2 points, wide = 1 point
4. Each player gets 5 attempts, most points wins`,
      coachingPoints: [
        "Plant foot pointing at target",
        "Lock ankle, strike through middle of ball",
        "Follow through toward target",
      ],
      questionsToAsk: [
        "Where do you look when passing?",
        "How do you adjust for different distances?",
      ],
      commonMistakes: ["Toe poking", "Not following through", "Looking up too early"],
      variations: [
        { name: "Moving Target", description: "Partner moves side to side as target", difficulty: "intermediate" },
        { name: "Weak Foot Only", description: "All passes with non-dominant foot", difficulty: "intermediate" },
      ],
      makeEasier: "Wider gates, closer distances",
      makeHarder: "Narrower gates, further distances, add time limit",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["passing", "accuracy", "technique", "competition"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "First Touch Box",
      slug: "first-touch-box",
      description: "Receive passes and control ball within a small box",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Create 3x3 yard boxes. One receiver in box, partners around perimeter.",
      howToPlay: `1. Servers pass to receiver from different angles
2. Receiver must control ball inside the box
3. First touch must keep ball in the box
4. If ball leaves box, that's a point against
5. Rotate receiver every 8-10 passes`,
      coachingPoints: [
        "Get body behind the ball",
        "Cushion the ball",
        "First touch away from pressure",
        "Stay on your toes, ready to adjust",
      ],
      questionsToAsk: [
        "Where should your first touch go?",
        "How do you prepare your body before the ball arrives?",
      ],
      commonMistakes: ["Stiff leg on reception", "Letting ball bounce too high"],
      variations: [
        { name: "Smaller Box", description: "2x2 yard box for more precision", difficulty: "advanced" },
        { name: "Air Balls", description: "Servers throw/chip balls in the air", difficulty: "advanced" },
      ],
      makeEasier: "Larger box, softer passes",
      makeHarder: "Smaller box, faster passes, add time pressure",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["first touch", "receiving", "control", "technique"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Turn and Face",
      slug: "turn-and-face",
      description: "Receive ball with back to goal, turn and attack",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Line of servers with balls, receivers 15 yards away, goal behind receivers.",
      howToPlay: `1. Receiver checks toward server, receives ball
2. Turn using a skill move (Cruyff, drag back, spin)
3. Attack the goal and finish
4. Focus on different turn types each round`,
      coachingPoints: [
        "Check shoulder before receiving",
        "Open body if possible",
        "First touch to set up the turn",
        "Accelerate after turning",
      ],
      questionsToAsk: [
        "Which turn works best for you?",
        "When would you use each turn in a game?",
        "What do you check for before receiving?",
      ],
      commonMistakes: ["Not checking shoulder", "Slow turn execution", "Poor first touch"],
      variations: [
        { name: "Add Defender", description: "Passive defender on receiver's back", difficulty: "advanced" },
        { name: "Specific Turns Only", description: "Coach calls which turn to use", difficulty: "intermediate" },
      ],
      makeEasier: "No pressure, choose any turn",
      makeHarder: "Active defender, limited touch count",
      equipmentNeeded: ["Cones", "Balls", "Goal"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["turning", "receiving", "attacking", "technique"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Heading Progression",
      slug: "heading-progression",
      description: "Safe heading technique from basic to game-like situations",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Partners facing each other, 5 yards apart. Use appropriate size ball.",
      howToPlay: `Progression:
1. Sit and head (partner tosses gently)
2. Kneel and head
3. Stand and head
4. Jump and head
5. Running jump and head`,
      coachingPoints: [
        "Eyes open, watch the ball",
        "Use forehead, not top of head",
        "Neck muscles firm",
        "Arms out for balance",
      ],
      questionsToAsk: [
        "What part of your head contacts the ball?",
        "How do you generate power?",
      ],
      commonMistakes: ["Closing eyes", "Using top of head", "Neck too loose"],
      variations: [
        { name: "Target Headers", description: "Head ball back through cone gate", difficulty: "advanced" },
        { name: "Defensive Headers", description: "Head ball high and far", difficulty: "advanced" },
      ],
      makeEasier: "Start with lighter ball, seated position",
      makeHarder: "Moving service, add competition",
      equipmentNeeded: ["Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["heading", "technique", "aerial"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Juggling Challenge",
      slug: "juggling-challenge",
      description: "Progressive juggling skills building ball control",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 10,
      setupInstructions: "Each player with a ball, spread out in space.",
      howToPlay: `Challenge progression:
1. Drop and catch (one bounce between)
2. Two touches then catch
3. Thigh, foot, catch
4. Non-stop foot juggles (count personal best)
5. Alternating feet only`,
      coachingPoints: [
        "Soft touch - ball goes up, not away",
        "Point toe slightly up",
        "Small touches",
        "Stay balanced on standing leg",
      ],
      questionsToAsk: [
        "What makes the ball easier to control?",
        "How do you recover a bad touch?",
      ],
      commonMistakes: ["Kicking too hard", "Toe pointed down", "Leaning back"],
      variations: [
        { name: "Partner Juggling", description: "Juggle back and forth with partner", difficulty: "advanced" },
        { name: "Sit and Juggle", description: "Seated juggling with feet only", difficulty: "intermediate" },
      ],
      makeEasier: "Allow bounces between touches",
      makeHarder: "No bounces, add thigh/head, movement while juggling",
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["juggling", "ball control", "individual", "technique"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Crossing and Finishing",
      slug: "crossing-and-finishing",
      description: "Practice delivering and scoring from crosses",
      activityType: "technical" as const,
      difficulty: "advanced" as const,
      minPlayers: 6,
      maxPlayers: 14,
      durationMinutes: 15,
      setupInstructions: "Wide players on each side, finishers in central areas, goalkeeper in goal.",
      howToPlay: `1. Wide player receives, dribbles to crossing position
2. Delivers cross to near post, far post, or penalty spot
3. Finishers attack the cross
4. Rotate positions after each attempt`,
      coachingPoints: [
        "Cross with pace and accuracy",
        "Attack the ball - don't wait",
        "Time your run to arrive with the ball",
        "Finish with first touch when possible",
      ],
      questionsToAsk: [
        "Where is the best area to cross from?",
        "How do you lose your marker before the cross?",
        "When do you run near post vs far post?",
      ],
      commonMistakes: ["Poor cross quality", "Static in the box", "Poor timing of runs"],
      variations: [
        { name: "Add Defender", description: "Defender in box challenging finishers", difficulty: "advanced" },
        { name: "Low Cross Only", description: "All crosses must be driven low", difficulty: "intermediate" },
      ],
      makeEasier: "No defenders, static finishers",
      makeHarder: "Active defenders, one-touch finish required",
      equipmentNeeded: ["Goals", "Balls", "Cones"],
      spaceRequired: "large",
      indoorSuitable: false,
      appropriateStageIds: [developmentId],
      tags: ["crossing", "finishing", "attacking", "technique"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Long Passing Grid",
      slug: "long-passing-grid",
      description: "Develop long range passing accuracy and technique",
      activityType: "technical" as const,
      difficulty: "advanced" as const,
      minPlayers: 8,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Create a 40x40 yard grid divided into four 20x20 sections. Groups in opposite corners.",
      howToPlay: `1. Player drives long pass to partner in opposite corner
2. Partner receives and plays back
3. Alternate: driven pass, lofted pass, chipped pass
4. Score points for first-touch control`,
      coachingPoints: [
        "Approach at angle",
        "Plant foot beside ball",
        "Strike through bottom half for loft",
        "Follow through fully",
      ],
      questionsToAsk: [
        "What's the difference between driven and lofted?",
        "When would you use each pass type in a game?",
      ],
      commonMistakes: ["Leaning back too much", "Poor weight on pass", "Not following through"],
      variations: [
        { name: "Moving Targets", description: "Receiver makes run to receive", difficulty: "advanced" },
        { name: "Switching Play", description: "Simulate switching the point of attack", difficulty: "advanced" },
      ],
      makeEasier: "Shorter distances, stationary targets",
      makeHarder: "Longer distances, moving receivers, add pressure",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "large",
      indoorSuitable: false,
      appropriateStageIds: [developmentId],
      tags: ["passing", "long range", "technique", "switching play"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Shooting Technique Stations",
      slug: "shooting-technique-stations",
      description: "Practice different shooting techniques at multiple stations",
      activityType: "technical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 8,
      maxPlayers: 16,
      durationMinutes: 15,
      setupInstructions: "Set up 4 stations around a goal area. Groups rotate through stations.",
      howToPlay: `Station 1: Power shots from 18 yards
Station 2: Finesse shots (inside foot curl)
Station 3: One-touch finishes (partner pass)
Station 4: Volleys (self-toss or partner toss)
2-3 minutes each station, then rotate.`,
      coachingPoints: [
        "Different technique for each shot type",
        "Hit target areas of goal",
        "Plant foot positioning",
        "Stay over the ball for power shots",
      ],
      questionsToAsk: [
        "When would you use power vs finesse?",
        "Where should you aim?",
        "How do you strike a volley?",
      ],
      commonMistakes: ["Leaning back on shots", "Poor plant foot position", "Looking at goalkeeper not goal"],
      variations: [
        { name: "Add Goalkeeper", description: "Full goalkeeper at each station", difficulty: "advanced" },
        { name: "Weak Foot Stations", description: "Some stations require weak foot", difficulty: "intermediate" },
      ],
      makeEasier: "Closer to goal, no goalkeeper",
      makeHarder: "Further from goal, active goalkeeper, add time pressure",
      equipmentNeeded: ["Goals", "Balls", "Cones"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["shooting", "finishing", "technique", "stations"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Speed Dribbling Relay",
      slug: "speed-dribbling-relay",
      description: "Dribbling at speed through cones in team relay format",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 8,
      maxPlayers: 24,
      durationMinutes: 10,
      setupInstructions: "Two or more teams. Set up cone course - zigzag, straight line, or combination.",
      howToPlay: `1. First player dribbles through course and back
2. Tags next player who goes
3. First team to finish wins
4. Vary the dribbling technique required`,
      coachingPoints: [
        "Close control around cones",
        "Accelerate in open spaces",
        "Use outside of foot for speed",
        "Keep head up when possible",
      ],
      questionsToAsk: [
        "How do you go faster without losing control?",
        "What part of foot is best for speed?",
      ],
      commonMistakes: ["Ball too far ahead", "Slowing down too much at cones"],
      variations: [
        { name: "Weak Foot Only", description: "Must use non-dominant foot", difficulty: "intermediate" },
        { name: "Skill Move Required", description: "Must do a move at each cone", difficulty: "intermediate" },
      ],
      makeEasier: "Wider cone spacing, shorter course",
      makeHarder: "Tighter cones, longer course, add penalties for errors",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["dribbling", "speed", "relay", "competition"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Combination Play Circuit",
      slug: "combination-play-circuit",
      description: "Practice give-and-go, overlap, and third man run patterns",
      activityType: "technical" as const,
      difficulty: "advanced" as const,
      minPlayers: 9,
      maxPlayers: 18,
      durationMinutes: 15,
      setupInstructions: "Set up three stations with cones showing passing patterns. Groups of 3-4 at each.",
      howToPlay: `Station 1: Give-and-go (wall pass)
Station 2: Overlap run and cross
Station 3: Third man combination
Players perform pattern and rotate positions.`,
      coachingPoints: [
        "Weight and timing of passes",
        "Run immediately after passing",
        "Communication between players",
        "Quality of final action (cross, shot)",
      ],
      questionsToAsk: [
        "When should you use each combination?",
        "How do you create space for your teammate?",
      ],
      commonMistakes: ["Slow after passing", "Poor timing of runs", "Pass too hard or soft"],
      variations: [
        { name: "Add Defenders", description: "Passive defenders at each station", difficulty: "advanced" },
        { name: "Finish Required", description: "Each pattern ends with a shot on goal", difficulty: "advanced" },
      ],
      makeEasier: "Walk through patterns first, no pressure",
      makeHarder: "Add defenders, increase pace, add finishing",
      equipmentNeeded: ["Cones", "Balls", "Goals optional"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [developmentId],
      tags: ["combination play", "passing", "movement", "attacking"],
      featured: true,
    },

    // === ADDITIONAL TACTICAL ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "5v2 Rondo",
      slug: "5v2-rondo",
      description: "Classic possession game with larger group and two defenders",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 7,
      maxPlayers: 14,
      durationMinutes: 12,
      setupInstructions: "Create 12x12 yard box. 5 players on outside/inside, 2 defenders in middle.",
      howToPlay: `1. Five players try to keep possession
2. Two defenders try to win ball
3. If defenders win, they swap with last two passers
4. Count consecutive passes - try to beat record
5. Can play one or two-touch`,
      coachingPoints: [
        "Move after you pass",
        "Create triangles for passing options",
        "One-touch when pressured",
        "Communication essential",
      ],
      questionsToAsk: [
        "How do two defenders work together?",
        "Where should you be after passing?",
        "When do you play one-touch vs two-touch?",
      ],
      commonMistakes: ["Standing still after passing", "Hiding from ball", "Poor communication"],
      variations: [
        { name: "4v2", description: "Smaller group, more pressure", difficulty: "advanced" },
        { name: "5v2 with Middle Player", description: "One player can move inside the box", difficulty: "advanced" },
      ],
      makeEasier: "Larger box, 6v2",
      makeHarder: "Smaller box, one-touch only, 4v2",
      equipmentNeeded: ["Cones", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["possession", "rondo", "passing", "movement"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Positional Rondo",
      slug: "positional-rondo",
      description: "Rondo with position-specific setup simulating real game situations",
      activityType: "tactical" as const,
      difficulty: "advanced" as const,
      minPlayers: 10,
      maxPlayers: 14,
      durationMinutes: 15,
      setupInstructions: "Set up shape matching team formation (e.g., 4-3-3). Defenders in zones they would occupy.",
      howToPlay: `1. Players maintain positions (CB, FB, CM, etc.)
2. Build out from back vs 3-4 defenders
3. Complete a set number of passes to 'score'
4. Reset when ball is won or limit reached`,
      coachingPoints: [
        "Play like you play - position-specific",
        "Create angles for passing",
        "Recognize when to switch play",
        "Patient build-up under pressure",
      ],
      questionsToAsk: [
        "Where is the space?",
        "When should we switch play?",
        "How do you create a passing angle?",
      ],
      commonMistakes: ["Leaving position", "Rushed play under pressure", "Not switching play"],
      variations: [
        { name: "Target Player", description: "Must find striker to score", difficulty: "advanced" },
        { name: "Transition", description: "Defenders can counter-attack if they win ball", difficulty: "advanced" },
      ],
      makeEasier: "Fewer defenders, more space",
      makeHarder: "More defenders, must reach target in X passes",
      equipmentNeeded: ["Cones", "Balls", "Pinnies"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [developmentId],
      tags: ["possession", "positional", "build-up", "tactical"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Defending in Pairs",
      slug: "defending-in-pairs",
      description: "Learn to defend together with a partner",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 8,
      maxPlayers: 16,
      durationMinutes: 12,
      setupInstructions: "Create 20x15 yard box with goal at one end. 2 attackers vs 2 defenders.",
      howToPlay: `1. Attackers start with ball at top of box
2. Defenders work together to prevent goal
3. First defender (pressure) closes down ball carrier
4. Second defender (cover) provides backup
5. Switch roles after each attack`,
      coachingPoints: [
        "Communication: who presses, who covers",
        "Angle of approach - show attacker one way",
        "Stay goal-side",
        "Don't both commit to ball",
      ],
      questionsToAsk: [
        "Who should press? Who should cover?",
        "What angle should the first defender take?",
        "When do you switch roles?",
      ],
      commonMistakes: ["Both going to ball", "Flat defensive line", "Ball watching"],
      variations: [
        { name: "3v2", description: "Add third attacker for overload", difficulty: "advanced" },
        { name: "2v2+GK", description: "Add goalkeeper for realistic finishing", difficulty: "intermediate" },
      ],
      makeEasier: "Attackers limited to 2 touches",
      makeHarder: "Add attackers, reduce defending space",
      equipmentNeeded: ["Cones", "Goals", "Balls"],
      spaceRequired: "small",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["defending", "pairs", "pressure", "cover"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Transition Game",
      slug: "transition-game",
      description: "Quick transition from attack to defense and vice versa",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 12,
      maxPlayers: 18,
      durationMinutes: 15,
      setupInstructions: "30x40 yard field with goals at each end. Two teams of 5-6.",
      howToPlay: `1. Normal game, but when possession changes, teams have 6 seconds to score
2. If no goal in 6 seconds, ball goes back to team that lost it
3. Encourages quick counter-attacks
4. Emphasizes immediate transition`,
      coachingPoints: [
        "Immediate reaction to turnover",
        "Look forward first",
        "Support the ball quickly",
        "Sprint to get back when you lose it",
      ],
      questionsToAsk: [
        "What do you do the moment you win the ball?",
        "Where do you look first?",
        "How fast do you need to react?",
      ],
      commonMistakes: ["Slow reaction to transition", "Not sprinting back on turnovers", "Too many touches"],
      variations: [
        { name: "3-Second Rule", description: "Only 3 seconds to score - even faster", difficulty: "advanced" },
        { name: "Counter Points", description: "Goals within 6 seconds worth 2 points", difficulty: "intermediate" },
      ],
      makeEasier: "Longer time limit (8-10 seconds)",
      makeHarder: "Shorter time limit (4-5 seconds)",
      equipmentNeeded: ["Goals", "Balls", "Pinnies"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["transition", "game", "attacking", "defending"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Overload Game",
      slug: "overload-game",
      description: "Small-sided game with numerical advantages in zones",
      activityType: "tactical" as const,
      difficulty: "intermediate" as const,
      minPlayers: 12,
      maxPlayers: 18,
      durationMinutes: 15,
      setupInstructions: "Divide field into thirds. Each team has players who must stay in their zone.",
      howToPlay: `1. Team A has 2 players in zone 1, 3 in zone 2, 2 in zone 3
2. Team B has 3 players in zone 1, 2 in zone 2, 3 in zone 3
3. Creates overloads and underloads in different areas
4. Must work ball through zones to score`,
      coachingPoints: [
        "Find the spare player",
        "Quick ball movement through zones",
        "Support from your zone",
        "Recognize and exploit the overload",
      ],
      questionsToAsk: [
        "Where is your team's advantage?",
        "How do you beat the defenders in your zone?",
        "When should you play quickly through a zone?",
      ],
      commonMistakes: ["Not recognizing overloads", "Slow play into crowded zones", "Poor positioning in zone"],
      variations: [
        { name: "Floater", description: "One player can move between all zones", difficulty: "advanced" },
        { name: "Touch Limits", description: "Different touch limits per zone", difficulty: "intermediate" },
      ],
      makeEasier: "Clearer overloads (3v1 in zone)",
      makeHarder: "Closer numbers, add touch restrictions",
      equipmentNeeded: ["Cones", "Goals", "Pinnies", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["overloads", "zones", "tactical", "game"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Counter Attack Game",
      slug: "counter-attack-game",
      description: "Focus on quick transitions after winning ball",
      activityType: "game" as const,
      difficulty: "advanced" as const,
      minPlayers: 12,
      maxPlayers: 18,
      durationMinutes: 15,
      setupInstructions: "Large field (50x35 yards) with full goals. Two teams of 5-6 plus goalkeepers.",
      howToPlay: `1. One team attacks with 5 players
2. Other team defends with only 3 (2 waiting at halfway line)
3. When defending team wins ball, 2 waiting players join in
4. Now it's 5v3 counter-attack the other way
5. Roles switch each possession`,
      coachingPoints: [
        "Quick forward passes when you win ball",
        "Sprint to join counter",
        "Spread out quickly on counter",
        "Finish chances - limited time",
      ],
      questionsToAsk: [
        "Where do you play the ball first?",
        "How do you use the numerical advantage?",
        "When do you slow down vs attack quickly?",
      ],
      commonMistakes: ["Too slow to transition", "Poor decision on counter", "Not spreading out"],
      variations: [
        { name: "3-Second Counter", description: "Must shoot within 3 seconds of winning ball", difficulty: "advanced" },
        { name: "Through Ball Counter", description: "Counter must include a through ball", difficulty: "advanced" },
      ],
      makeEasier: "More counter-attackers (3 instead of 2)",
      makeHarder: "Fewer counter-attackers, time limit",
      equipmentNeeded: ["Goals", "Pinnies", "Balls"],
      spaceRequired: "large",
      indoorSuitable: false,
      appropriateStageIds: [developmentId],
      tags: ["counter attack", "transition", "finishing", "game"],
      featured: true,
    },

    // === ADDITIONAL GAME ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "3v3 Line Soccer",
      slug: "3v3-line-soccer",
      description: "Score by dribbling over end line instead of into goal",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 12,
      durationMinutes: 12,
      setupInstructions: "25x20 yard field. No goals - score by stopping ball on opponent's end line.",
      howToPlay: `1. 3v3 teams try to dribble across opponent's end line
2. Ball must be under control when crossing line
3. After goal, other team starts with ball
4. Encourages dribbling and width`,
      coachingPoints: [
        "Use the full width",
        "Recognize when to dribble vs pass",
        "Attack spaces, not defenders",
        "Transition quickly",
      ],
      questionsToAsk: [
        "Where is the open space?",
        "When should you take on a defender?",
        "How do you create space for teammates?",
      ],
      commonMistakes: ["Too narrow - everyone in middle", "Forcing through defenders", "Slow transition"],
      variations: [
        { name: "Wide Zones", description: "Create wide channels worth bonus points", difficulty: "intermediate" },
        { name: "Must Receive", description: "Must receive pass over line (not dribble)", difficulty: "intermediate" },
      ],
      makeEasier: "Wider field, larger end zones",
      makeHarder: "Narrower field, must receive in end zone",
      equipmentNeeded: ["Cones", "Pinnies", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["game", "dribbling", "small-sided", "width"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "2v2 with Mini Goals",
      slug: "2v2-mini-goals",
      description: "Intense 2v2 game with goals at each end",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 12,
      durationMinutes: 12,
      setupInstructions: "20x15 yard field with mini goals (pugg or cones) at each end. Pairs compete.",
      howToPlay: `1. 2v2 games to 3 goals
2. Winners stay on, losers rotate
3. Or play round robin tournament
4. Focus on individual skills and basic combinations`,
      coachingPoints: [
        "Support your partner",
        "Quick decisions",
        "Take on 1v1 situations",
        "Communicate",
      ],
      questionsToAsk: [
        "When should you pass vs dribble?",
        "How do you help your partner?",
        "What do you do when you don't have the ball?",
      ],
      commonMistakes: ["Both going to ball", "Not supporting partner", "Forcing shots"],
      variations: [
        { name: "Four Goals", description: "Each team can score in two goals", difficulty: "intermediate" },
        { name: "Touch Limit", description: "Maximum 3 touches per player", difficulty: "intermediate" },
      ],
      makeEasier: "Larger field, bigger goals",
      makeHarder: "Smaller field, touch restrictions",
      equipmentNeeded: ["Mini goals or cones", "Pinnies", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["game", "2v2", "small-sided", "competition"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "6v6 Half Field Game",
      slug: "6v6-half-field",
      description: "Larger small-sided game with more positional structure",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 12,
      maxPlayers: 14,
      durationMinutes: 20,
      setupInstructions: "Half of full field (55x40 yards). Full goal at one end, two mini goals at the other.",
      howToPlay: `1. One team attacks the full goal
2. Other team attacks the two mini goals (counter-attack)
3. Encourages realistic attacking and defending patterns
4. Switch roles every 5-7 minutes`,
      coachingPoints: [
        "Build up with purpose",
        "Width and depth in attack",
        "Quick transitions",
        "Shape and organization",
      ],
      questionsToAsk: [
        "How do you create chances against organized defense?",
        "What's the best way to counter-attack?",
        "How do you maintain shape?",
      ],
      commonMistakes: ["Rushing attacks", "Poor positioning", "Lack of communication"],
      variations: [
        { name: "Neutral Players", description: "Add 2 neutral players to support team in possession", difficulty: "intermediate" },
        { name: "Zones", description: "Add zones with player requirements", difficulty: "advanced" },
      ],
      makeEasier: "Add neutral players",
      makeHarder: "Add touch restrictions, specific pass requirements",
      equipmentNeeded: ["Goals", "Mini goals", "Pinnies", "Balls"],
      spaceRequired: "large",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "6v6", "attacking", "defending"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "King of the Ring",
      slug: "king-of-the-ring",
      description: "1v1 competition to knock opponents' balls out of circle",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Create a circle (15-20 yards diameter). All players with a ball inside.",
      howToPlay: `1. Everyone dribbles in the circle
2. Try to kick others' balls out while protecting yours
3. If your ball goes out, do 10 toe taps and return
4. Last one with ball in circle is 'King'`,
      coachingPoints: [
        "Protect your ball with body",
        "Head up to see opponents",
        "Timing of challenges",
        "Use your body to shield",
      ],
      questionsToAsk: [
        "How do you protect your ball?",
        "When should you attack vs defend?",
        "What part of foot do you use to shield?",
      ],
      commonMistakes: ["Ball too far from body", "Only focused on attacking", "Not shielding"],
      variations: [
        { name: "No Re-entry", description: "If knocked out, you're out for round", difficulty: "intermediate" },
        { name: "Partners", description: "Play as pairs - protect each other", difficulty: "intermediate" },
      ],
      makeEasier: "Larger circle, must stop ball before returning",
      makeHarder: "Smaller circle, no re-entry",
      equipmentNeeded: ["Cones", "1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["game", "1v1", "shielding", "fun", "competition"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Target Goals Game",
      slug: "target-goals-game",
      description: "Small-sided game with multiple goal options to encourage decision making",
      activityType: "game" as const,
      difficulty: "intermediate" as const,
      minPlayers: 8,
      maxPlayers: 14,
      durationMinutes: 15,
      setupInstructions: "35x25 yard field. Each team has 3 small goals to defend (spread across end line).",
      howToPlay: `1. 4v4 or 5v5 game
2. Can score in any of opponent's 3 goals
3. Goals in corner goals worth 2 points
4. Encourages width and switching play`,
      coachingPoints: [
        "Scan for open goal",
        "Switch point of attack",
        "Create overloads on weak side",
        "Defend in numbers",
      ],
      questionsToAsk: [
        "Which goal is easiest to score in?",
        "How do you create a 2v1 on a goal?",
        "How do you defend 3 goals?",
      ],
      commonMistakes: ["Only attacking central goal", "Not switching play", "Defenders bunched in middle"],
      variations: [
        { name: "Must Switch", description: "Must pass to other side of field before scoring", difficulty: "intermediate" },
        { name: "Moving Goals", description: "Coach moves one goal during play", difficulty: "advanced" },
      ],
      makeEasier: "Fewer goals (2 per team)",
      makeHarder: "Smaller goals, add touch restrictions",
      equipmentNeeded: ["Mini goals or cones", "Pinnies", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["game", "decision-making", "width", "tactical"],
      featured: false,
    },

    // === ADDITIONAL CONDITIONING ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Dribble Sprints",
      slug: "dribble-sprints",
      description: "Sprint conditioning with the ball at feet",
      activityType: "conditioning" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 10,
      setupInstructions: "Set up start line and finish line 30-40 yards apart. Each player has a ball.",
      howToPlay: `1. Sprint with ball from start to finish
2. Walk back to start
3. Rest time equals work time
4. Repeat 6-8 times`,
      coachingPoints: [
        "Push ball ahead and chase",
        "Longer touches at speed",
        "Stay controlled when tired",
        "Compete with yourself",
      ],
      questionsToAsk: [
        "How far ahead should the ball be?",
        "How do you stay fast when tired?",
      ],
      commonMistakes: ["Ball too close at speed", "Slowing down too much"],
      variations: [
        { name: "With Turn", description: "Sprint out, turn around cone, sprint back", difficulty: "intermediate" },
        { name: "Relay Race", description: "Teams compete in dribble relay", difficulty: "beginner" },
      ],
      makeEasier: "Shorter distance, more rest",
      makeHarder: "Longer distance, less rest, add finish at end",
      equipmentNeeded: ["Cones", "1 ball per player"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["conditioning", "dribbling", "speed", "fitness"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Box to Box Runs",
      slug: "box-to-box-runs",
      description: "Shuttle runs simulating midfielder workload",
      activityType: "conditioning" as const,
      difficulty: "advanced" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 12,
      setupInstructions: "Full field available, or marked 60-yard course.",
      howToPlay: `1. Start on penalty box line
2. Sprint to opposite penalty box line
3. Jog back
4. Immediately sprint again
5. Repeat 6-10 times with 60-second rest between sets`,
      coachingPoints: [
        "Pace yourself - it's multiple sprints",
        "Drive with arms",
        "Quick recovery jog back",
        "Mental toughness when tired",
      ],
      questionsToAsk: [
        "How do you recover during the jog?",
        "What position runs the most in a game?",
      ],
      commonMistakes: ["Going too hard too early", "Walking instead of jogging back"],
      variations: [
        { name: "With Ball", description: "Dribble on the way back", difficulty: "advanced" },
        { name: "Partner Work", description: "Partner passes to you at each end", difficulty: "advanced" },
      ],
      makeEasier: "Shorter distance, more rest between reps",
      makeHarder: "Add ball work, less rest, more reps",
      equipmentNeeded: ["Cones"],
      spaceRequired: "large",
      indoorSuitable: false,
      appropriateStageIds: [developmentId],
      tags: ["conditioning", "running", "endurance", "fitness"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Soccer Tennis Conditioning",
      slug: "soccer-tennis-conditioning",
      description: "Fun conditioning through soccer tennis rallies",
      activityType: "conditioning" as const,
      difficulty: "intermediate" as const,
      minPlayers: 4,
      maxPlayers: 12,
      durationMinutes: 12,
      setupInstructions: "Court area 15x30 feet, divided in half. Net (or cones/rope) at waist height.",
      howToPlay: `1. Teams of 2-3 on each side
2. Volleyball rules with feet (allow one bounce)
3. Rally until ball bounces twice or goes out
4. Continuous movement keeps heart rate up
5. Losing team does 5 burpees before next point`,
      coachingPoints: [
        "First touch to set up volley",
        "Communication with teammates",
        "Athletic positioning",
        "Stay on your toes",
      ],
      questionsToAsk: [
        "How do you position for the ball?",
        "How do you communicate with teammate?",
      ],
      commonMistakes: ["Flat-footed waiting", "No communication", "Poor first touch"],
      variations: [
        { name: "No Bounce", description: "Ball cannot bounce", difficulty: "advanced" },
        { name: "Headers Only", description: "Can use head as well", difficulty: "intermediate" },
      ],
      makeEasier: "Two bounces allowed, larger court",
      makeHarder: "No bounces, smaller court, singles",
      equipmentNeeded: ["Cones", "Ball", "Net or rope"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["conditioning", "fun", "technique", "agility"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Pressing Game Fitness",
      slug: "pressing-game-fitness",
      description: "High-intensity pressing drill combining tactics and fitness",
      activityType: "conditioning" as const,
      difficulty: "advanced" as const,
      minPlayers: 12,
      maxPlayers: 18,
      durationMinutes: 12,
      setupInstructions: "30x25 yard grid. Two teams, one possessing, one pressing.",
      howToPlay: `1. Team A keeps possession, team B presses for 60 seconds
2. If Team B wins ball, they score a point and Team A gets it back
3. After 60 seconds, switch roles
4. Three rounds each team
5. Most ball wins by pressing team wins`,
      coachingPoints: [
        "High intensity pressing",
        "Work as a unit - not alone",
        "Close down passing lanes",
        "Quick transition when you win",
      ],
      questionsToAsk: [
        "How do you press as a team?",
        "When do you go and when do you wait?",
        "How do you recover during possession?",
      ],
      commonMistakes: ["Pressing alone", "Not closing lanes", "Giving up"],
      variations: [
        { name: "Counter Goals", description: "Pressing team can score in mini goals when they win", difficulty: "advanced" },
        { name: "Touch Limit", description: "Possession team limited to 2 touches", difficulty: "advanced" },
      ],
      makeEasier: "Larger grid, 45-second rounds",
      makeHarder: "Smaller grid, 90-second rounds",
      equipmentNeeded: ["Cones", "Pinnies", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [developmentId],
      tags: ["conditioning", "pressing", "tactical", "high-intensity"],
      featured: false,
    },

    // === ADDITIONAL FUN ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Soccer Bowling",
      slug: "soccer-bowling",
      description: "Knock down cones by passing/shooting - bowling with a soccer ball",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 16,
      durationMinutes: 10,
      setupInstructions: "Set up 10 cones in bowling pin formation. Teams line up 15 yards away.",
      howToPlay: `1. Each player gets two 'rolls' (shots) to knock down cones
2. One point per cone knocked down
3. Spare (all cones in two shots) = 15 points
4. Strike (all cones in one shot) = 20 points
5. Teams take turns bowling`,
      coachingPoints: [
        "Aim for the lead cone",
        "Strike through the ball",
        "Follow through to target",
      ],
      questionsToAsk: [
        "Where do you aim?",
        "How do you get power and accuracy?",
      ],
      commonMistakes: ["Aiming too high", "Toe poking", "Not following through"],
      variations: [
        { name: "Long Distance Bowling", description: "Bowl from further away", difficulty: "intermediate" },
        { name: "Weak Foot Bowling", description: "Must use non-dominant foot", difficulty: "intermediate" },
      ],
      makeEasier: "Closer to pins, fewer pins",
      makeHarder: "Further from pins, weak foot only",
      equipmentNeeded: ["Cones (10)", "Balls"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["fun", "shooting", "accuracy", "game"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Dribblers vs Defenders",
      slug: "dribblers-vs-defenders",
      description: "Mass 1v1 game where dribblers try to cross the field",
      activityType: "fun" as const,
      difficulty: "beginner" as const,
      minPlayers: 10,
      maxPlayers: 24,
      durationMinutes: 12,
      setupInstructions: "30x40 yard field. Dribblers on one end line, 2-4 defenders in middle zone.",
      howToPlay: `1. All dribblers try to reach the other end line
2. Defenders try to kick balls out
3. If your ball is kicked out, you join the defenders
4. Last dribbler remaining is the winner
5. Play multiple rounds`,
      coachingPoints: [
        "Use moves to beat defenders",
        "Change speeds",
        "Protect the ball with body",
        "Find open lanes",
      ],
      questionsToAsk: [
        "How do you beat the defenders?",
        "When should you go fast vs slow?",
      ],
      commonMistakes: ["Running into defenders", "Not shielding", "Going too fast without control"],
      variations: [
        { name: "British Bulldog", description: "If tagged (not ball kicked), you become defender", difficulty: "beginner" },
        { name: "Safe Zones", description: "Add 'safe zones' where defenders can't enter", difficulty: "beginner" },
      ],
      makeEasier: "Wider field, fewer defenders",
      makeHarder: "Narrower field, more defenders",
      equipmentNeeded: ["Cones", "1 ball per dribbler"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: ["fun", "dribbling", "1v1", "game"],
      featured: true,
    },
    {
      sportId: soccer.id,
      name: "Four Goals Chaos",
      slug: "four-goals-chaos",
      description: "Scrimmage with four goals - anyone can score in any goal",
      activityType: "fun" as const,
      difficulty: "intermediate" as const,
      minPlayers: 10,
      maxPlayers: 16,
      durationMinutes: 15,
      setupInstructions: "40x40 yard square. Small goal at each side. Two teams.",
      howToPlay: `1. Each team can score in any of the four goals
2. After scoring, other team gets ball
3. Emphasizes vision, switching play, and chaos
4. Most goals in 10 minutes wins`,
      coachingPoints: [
        "Scan constantly - many options",
        "Quick decision-making",
        "Switch to open goal",
        "Defend all four goals",
      ],
      questionsToAsk: [
        "Which goal is most open?",
        "How do you defend four goals?",
        "What do you look for?",
      ],
      commonMistakes: ["Tunnel vision on one goal", "Poor defensive organization", "Not scanning"],
      variations: [
        { name: "Assigned Goals", description: "Each team has two goals to attack", difficulty: "intermediate" },
        { name: "Moving Goals", description: "Players can pick up and move one goal each minute", difficulty: "advanced" },
      ],
      makeEasier: "Fewer goals, assigned attack goals",
      makeHarder: "More chaos, no goalkeepers",
      equipmentNeeded: ["4 small goals", "Pinnies", "Balls"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["fun", "game", "chaos", "decision-making"],
      featured: true,
    },

    // === ADDITIONAL COOLDOWN ACTIVITIES ===
    {
      sportId: soccer.id,
      name: "Partner Stretching",
      slug: "partner-stretching",
      description: "Cool down with partner-assisted stretching",
      activityType: "cooldown" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 8,
      setupInstructions: "Partners find space. One ball per pair (optional for some stretches).",
      howToPlay: `Stretch each 30 seconds:
1. Seated hamstring (partner gently pushes back)
2. Calf stretch against partner
3. Quad stretch with partner balance
4. Groin stretch (soles together, partner presses knees)
5. Back twist with partner support
6. Shoulder stretch with partner assist`,
      coachingPoints: [
        "Gentle pressure - no bouncing",
        "Breathe deeply",
        "Communicate with partner",
        "Hold stretches, don't bounce",
      ],
      questionsToAsk: [
        "Which muscles are tight?",
        "How does stretching help recovery?",
      ],
      commonMistakes: ["Pushing too hard", "Bouncing stretches", "Holding breath"],
      variations: [
        { name: "Ball Stretches", description: "Use ball in some stretches", difficulty: "beginner" },
      ],
      makeEasier: "Less time per stretch",
      makeHarder: "Longer holds, more stretches",
      equipmentNeeded: ["None required"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["cooldown", "stretching", "recovery", "partners"],
      featured: false,
    },
    {
      sportId: soccer.id,
      name: "Keep It Up Circle",
      slug: "keep-it-up-circle",
      description: "Team juggling challenge to end practice",
      activityType: "cooldown" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 6,
      setupInstructions: "Team forms a circle, standing close together. One ball per group.",
      howToPlay: `1. Keep the ball up using any body part except hands
2. Each player can touch maximum twice
3. Count consecutive touches as a team
4. Try to beat your team record
5. If ball drops, restart count`,
      coachingPoints: [
        "Soft touches to keep in circle",
        "Call the ball",
        "Be ready to help teammates",
        "Positive encouragement",
      ],
      questionsToAsk: [
        "How do you keep the ball in the middle?",
        "How do you communicate?",
      ],
      commonMistakes: ["Kicking too hard", "Not communicating", "Same players doing all touches"],
      variations: [
        { name: "Feet Only", description: "Only feet allowed", difficulty: "advanced" },
        { name: "Two Balls", description: "Keep two balls up at once", difficulty: "advanced" },
      ],
      makeEasier: "Allow unlimited touches per player",
      makeHarder: "One touch per player, feet only",
      equipmentNeeded: ["Ball"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuildingId, developmentId],
      tags: ["cooldown", "juggling", "teamwork", "fun"],
      featured: false,
    },
  ];

  // Insert activities
  for (const activity of soccerActivities) {
    try {
      await getDb().insert(activities).values(activity).onConflictDoNothing();
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

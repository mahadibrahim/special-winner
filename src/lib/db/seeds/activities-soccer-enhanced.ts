/**
 * Enhanced Soccer Activities Seed
 *
 * Print-ready activities with:
 * - Exact coaching scripts
 * - Visual setup descriptions
 * - Time variations
 * - Detailed progressions
 * - Success criteria
 */

import { db } from "../index";
import { activities } from "../schema/practice-planning";
import { sports } from "../schema/sports";
import { developmentStages } from "../schema/curriculum";
import { eq } from "drizzle-orm";

export async function seedEnhancedSoccerActivities() {
  console.log("Seeding enhanced soccer activities...");

  // Get soccer sport
  const [soccer] = await db.select().from(sports).where(eq(sports.slug, "soccer"));
  if (!soccer) {
    throw new Error("Soccer sport must be seeded first");
  }

  // Get development stages
  const stages = await db.select().from(developmentStages);
  const fundamentalsId = stages.find((s) => s.slug === "fundamentals")?.id;
  const skillBuildingId = stages.find((s) => s.slug === "skill-building")?.id;
  const developmentId = stages.find((s) => s.slug === "development")?.id;

  if (!fundamentalsId || !skillBuildingId || !developmentId) {
    throw new Error("Development stages must be seeded first");
  }

  const enhancedActivities = [
    // ═══════════════════════════════════════════════════════════════════════
    // WARMUP ACTIVITIES
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Shark Attack",
      slug: "shark-attack",
      description:
        "Players dribble in a grid while avoiding 'sharks' who try to kick balls out. High energy, develops dribbling under pressure and awareness.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 7,
      setupInstructions: `SETUP DIAGRAM
┌─────────────────────────────────┐
│  ▲                          ▲   │
│      ○     ○                    │  20 paces
│          ○      ●(shark)        │
│      ○       ○      ○           │
│  ▲                          ▲   │
└─────────────────────────────────┘
        20 paces

EQUIPMENT NEEDED
• 1 ball per player (except sharks)
• 4 corner cones (use bright colors)
• Pinnies for sharks (1-2 different color)

QUICK SETUP
1. Create a 20x20 pace square with cones at corners
2. Give every player a ball except 1-2 sharks
3. Sharks wear pinnies so they're visible
4. All dribblers start inside the grid`,
      howToPlay: `GATHERING PLAYERS (30 seconds)
Say: "Everyone with a ball, find a space in the square. Sharks, come stand by me."

EXPLAINING THE GAME (45 seconds)
Say: "This is Shark Attack! Dribblers, your job is to keep your ball safe from the hungry sharks. Sharks, your job is to kick balls OUT of the square - not steal them, kick them out! If your ball goes out, do 5 toe taps on a ball outside, then come back in."

START ROUND 1 (2 minutes)
Say: "Sharks, show me your mean face! Dribblers, can you protect your ball? Ready... SHARKS ARE HUNGRY!"

Coach position: Stand outside the grid where you can see all players.

Look for:
• Are dribblers looking up to see sharks?
• Are they using their body to shield?
• Are sharks being active (not standing still)?

PAUSE AND COACH (30 seconds)
After 2 minutes, freeze the game.
Say: "Freeze! Dribblers, point to where the sharks are RIGHT NOW. Good! What could you do to keep your ball safer?"
Listen for: "move away," "shield it," "look up"

ROUND 2 (2 minutes)
Say: "New round! Sharks, you have 2 minutes to get as many balls as you can. Let's count together when time's up!"

SWITCH SHARKS (30 seconds)
Say: "New sharks! Who hasn't been a shark yet?"

FINAL ROUND (2 minutes)
Run one more round with new sharks.`,
      coachingPoints: [
        "Head up while dribbling - Say: 'Can you dribble AND see the shark at the same time?'",
        "Use body to shield - Say: 'Put your body between the shark and your ball, like protecting your lunch!'",
        "Small, close touches - Say: 'Keep the ball close like it's on a short leash'",
        "Change direction to escape - Say: 'When the shark gets close, can you turn away?'",
      ],
      questionsToAsk: [
        "Where are the sharks right now? (Develops awareness)",
        "What part of your foot keeps the ball closest? (Develops technique awareness)",
        "If a shark is coming from your right, which way should you turn? (Develops decision making)",
        "How did you keep your ball safe that time? (Develops reflection)",
      ],
      commonMistakes: [
        "Kicking ball too far ahead → Say: 'Tiny touches! The ball should never be more than one step away'",
        "Only watching the ball → Say: 'Quick peeks up! Look at ball, look up, look at ball, look up'",
        "Running away without ball → Say: 'Take your ball with you when you escape!'",
        "Sharks just chasing one player → Say: 'Sharks, look for the easy targets - who's not paying attention?'",
      ],
      variations: [
        {
          name: "Freeze Sharks",
          description:
            "When coach yells 'FREEZE!', everyone stops. Last person moving becomes a shark.",
          difficulty: "beginner",
        },
        {
          name: "Ball Thief",
          description:
            "Instead of kicking out, sharks try to steal a ball and dribble it themselves. Creates more 1v1 battles.",
          difficulty: "intermediate",
        },
        {
          name: "Shark Jail",
          description:
            "If your ball is kicked out, you become a shark too. Last dribbler wins!",
          difficulty: "intermediate",
        },
        {
          name: "Superhero Rescue",
          description:
            "A player with a ball can 'rescue' a frozen teammate by passing to them. Builds passing under pressure.",
          difficulty: "intermediate",
        },
      ],
      makeEasier: `IF PLAYERS ARE STRUGGLING
• Make the grid bigger (25x25 paces)
• Fewer sharks (1 shark per 6 dribblers)
• Sharks must hop instead of run
• Allow toe taps inside grid instead of outside

Signs they're struggling:
• Most balls knocked out within 30 seconds
• Players looking frustrated, not smiling
• No one can escape sharks`,
      makeHarder: `IF PLAYERS GET IT QUICKLY
• Make grid smaller (15x15 paces)
• Add more sharks (1 shark per 4 dribblers)
• Dribblers must stay moving (no standing still)
• Only weak foot allowed

Signs they're ready:
• Dribblers easily escaping sharks
• Players looking bored or asking "what's next?"
• Sharks can't catch anyone`,
      equipmentNeeded: ["1 ball per player", "4 cones", "2-3 pinnies"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: [
        "warmup",
        "dribbling",
        "awareness",
        "high-energy",
        "fun",
        "no-lines",
      ],
      featured: true,
      // Enhanced fields for print-ready content
      diagram: `┌─────────────────────────────────┐
│  ▲                          ▲   │
│      ○     ○                    │
│          ○      ●(shark)        │  20x20 paces
│      ○       ○      ○           │
│  ▲                          ▲   │
└─────────────────────────────────┘
▲ = cone  ○ = dribbler  ● = shark`,
    },

    {
      sportId: soccer.id,
      name: "Traffic Lights",
      slug: "traffic-lights",
      description:
        "Dribbling game where players respond to color commands. Red=stop, Yellow=slow, Green=fast. Develops listening, ball control at different speeds.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 30,
      durationMinutes: 5,
      setupInstructions: `SETUP DIAGRAM
┌─────────────────────────────────┐
│                                 │
│    ○    ○    ○    ○    ○       │
│                                 │  20 paces
│    ○    ○    ○    ○    ○       │
│                                 │
└─────────────────────────────────┘
        25 paces

EQUIPMENT NEEDED
• 1 ball per player
• 4 corner cones (optional but helpful)

QUICK SETUP
1. Players spread out in a large area (as big as available)
2. Every player has a ball at their feet
3. Coach stands where everyone can see and hear

VISUAL AIDS (optional)
• Hold up colored cones: red, yellow, green
• Or use hand signals: fist=stop, flat hand=slow, wave=fast`,
      howToPlay: `GATHERING PLAYERS (20 seconds)
Say: "Everyone grab a ball and find your own space - spread out so you can't touch anyone!"

EXPLAINING THE GAME (40 seconds)
Say: "We're going to play Traffic Lights! When I say GREEN, dribble as fast as you can control your ball. When I say YELLOW, slow motion dribbling - super slow! When I say RED, stop your ball completely with the bottom of your foot."

Demo: "Watch me - GREEN (fast dribble)... YELLOW (slow)... RED (stop with sole)."

ROUND 1: Basic Colors (90 seconds)
Say: "Find a space... GREEN!"

Call out colors randomly:
• Hold GREEN for 5-8 seconds
• Hold YELLOW for 3-5 seconds
• Hold RED for 3-4 seconds (check who stops cleanly)

Look for:
• Do they respond quickly to commands?
• Can they stop without the ball rolling away?
• Are they going different speeds for green vs yellow?

COACHING MOMENT (30 seconds)
Say: "Freeze on red! Show me how you stopped your ball. What part of your foot? Right - the bottom! That's called your sole. Let's go again."

ROUND 2: Add Challenge (90 seconds)
Say: "Same game, but now when I say RED, see how fast you can freeze. Slowest person does 3 jumping jacks! Ready... GREEN!"

ROUND 3: Mix It Up (60 seconds)
Add variations:
• "Reverse!" - GREEN means stop, RED means go
• "Red light... Red light... RED LIGHT!" (tricking them)
• Whisper colors so they must listen carefully`,
      coachingPoints: [
        "Stop with sole of foot - Say: 'Squash the ball like a bug!'",
        "Green = fast but in control - Say: 'Fast feet, but can you still stop when I say red?'",
        "Head up to hear commands - Say: 'Ears open, eyes up!'",
        "Change direction while dribbling - Say: 'Don't just go straight - explore the whole space!'",
      ],
      questionsToAsk: [
        "What part of your foot stops the ball best? (sole)",
        "Is it easier to stop from super fast or medium speed? (medium - control)",
        "Can you dribble fast AND keep the ball close? (challenge them)",
        "What helps you hear the colors - looking down or looking up? (looking up)",
      ],
      commonMistakes: [
        "Ball rolls away on 'red' → Say: 'Get your foot on top of the ball quicker! Squash it!'",
        "Same speed for green and yellow → Say: 'Show me the difference! Green is a cheetah, yellow is a turtle'",
        "Not spreading out → Say: 'Find a space where you can swing your arms and not touch anyone'",
        "Only dribbling in straight lines → Say: 'Explorers! Visit every corner of our space'",
      ],
      variations: [
        {
          name: "Add Amber/Orange",
          description:
            "Orange = medium speed. Now there are 4 speeds to control.",
          difficulty: "beginner",
        },
        {
          name: "Traffic Cop",
          description:
            "One player becomes the traffic cop and calls the colors. Rotate every 30 seconds.",
          difficulty: "beginner",
        },
        {
          name: "Body Part Stop",
          description:
            "On RED, call out a body part (knee, elbow, head) that must touch the ball to stop it.",
          difficulty: "intermediate",
        },
        {
          name: "Direction Colors",
          description:
            "Add BLUE = turn left, ORANGE = turn right. Must change direction while moving.",
          difficulty: "intermediate",
        },
      ],
      makeEasier: `IF PLAYERS ARE STRUGGLING
• Slow down your color calls
• Only use green and red first (add yellow later)
• Let ball stop naturally on red (don't require sole)
• Give more time between calls

Signs they're struggling:
• Most players can't stop on red
• Confusion about which color is which
• Collisions because not in control`,
      makeHarder: `IF PLAYERS GET IT QUICKLY
• Call colors faster
• Whisper colors (must really listen)
• Add reverse mode
• Require weak foot only on yellow
• Add movement (jumping jacks on red, spins on yellow)

Signs they're ready:
• Instant responses to all colors
• Perfect stops every time
• Players asking "what else?"`,
      equipmentNeeded: ["1 ball per player", "4 cones (optional)"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId],
      tags: [
        "warmup",
        "dribbling",
        "listening",
        "ball-control",
        "no-lines",
        "beginner-friendly",
      ],
      featured: true,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // TECHNICAL ACTIVITIES
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Ball Mastery Circle",
      slug: "ball-mastery-circle",
      description:
        "Individual ball work in a circle. Coach demonstrates moves, players copy. Develops all fundamental ball touches in a structured, follow-along format.",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 8,
      setupInstructions: `SETUP DIAGRAM
              ○
          ○       ○
        ○           ○
          ●(coach)
        ○           ○
          ○       ○
              ○

EQUIPMENT NEEDED
• 1 ball per player (including coach)
• No cones needed

QUICK SETUP
1. Players form a large circle, everyone can see coach
2. Coach stands in the middle with a ball
3. Every player has their own ball
4. Enough space between players to swing arms`,
      howToPlay: `GATHERING PLAYERS (20 seconds)
Say: "Make a big circle around me! Spread out so you have room. Everyone has a ball at your feet."

INTRO (15 seconds)
Say: "We're going to wake up our feet! I'll show you a move, then we all do it together. Watch first, then copy."

MOVE SEQUENCE (Do each for 20-30 seconds)

MOVE 1: Toe Taps
Say: "Toe taps! Tap the top of the ball with your toes, left-right-left-right. Like you're playing a drum!"
Demo for 5 seconds, then: "Your turn! Go!"
Count rhythm: "1-2-1-2-1-2..."
Look for: Light touches, staying balanced

MOVE 2: Sole Rolls (forward/back)
Say: "Sole rolls! Put your foot on top and roll the ball forward... now back... forward... back..."
Demo for 5 seconds, then: "Go! Forward... back... forward... back..."
Look for: Ball staying under control, not rolling away

MOVE 3: Sole Rolls (side to side)
Say: "Now side to side! Roll it left... right... left... right... use the bottom of your foot!"
Demo, then: "Go! Left... right... left... right..."
Look for: Body moving with the ball, staying balanced

MOVE 4: Inside Touches
Say: "Inside-inside! Tap the ball between your feet using the inside of each foot."
Demo, then: "Go! Inside-inside-inside..."
Look for: Soft touches, ball staying close

MOVE 5: Outside Touches
Say: "Tricky one! Tap with the OUTSIDE of your foot, little touches sideways."
Demo, then: "Go! Outside... outside..."
Look for: This is hard! Celebrate attempts.

MOVE 6: Pull-Push
Say: "Pull it back with your sole, then push it forward with your laces. Pull... push... pull... push..."
Demo, then: "Go! Pull... push..."
Look for: Smooth rhythm, not stopping

MOVE 7: Scissors
Say: "Step over the ball without touching it! Like your foot is a windmill."
Demo, then: "Try it! Step over... step over..."
Look for: Balance, foot going around (not hitting) ball

COMBO CHALLENGE (60 seconds)
Say: "Now let's combine! 4 toe taps... 4 inside touches... 4 sole rolls... GO!"
Call out the sequence as they go.

FREESTYLE FINISH (30 seconds)
Say: "30 seconds - show me YOUR favorite move! Be creative!"`,
      coachingPoints: [
        "Light touches - Say: 'Pet the ball, don't kick it!'",
        "Stay on your toes - Say: 'Bouncy feet, like you're on hot sand!'",
        "Ball stays close - Say: 'The ball is your best friend, keep it close!'",
        "Both feet - Say: 'Your left foot needs practice too!'",
      ],
      questionsToAsk: [
        "Which move is hardest for you? (builds self-awareness)",
        "What part of your foot are you using for toe taps? (top/laces)",
        "Can you do this move without looking at the ball? (challenge)",
        "Which foot is trickier - left or right? (both need work!)",
      ],
      commonMistakes: [
        "Kicking ball away → Say: 'Softer! Just touch it, don't kick it'",
        "Standing flat-footed → Say: 'On your toes! Stay bouncy!'",
        "Only using one foot → Say: 'Left foot's turn! Give it some practice'",
        "Losing balance → Say: 'Arms out wide for balance, like an airplane!'",
      ],
      variations: [
        {
          name: "Partner Mirror",
          description:
            "Partners face each other. One leads, one copies. Switch after 1 minute.",
          difficulty: "beginner",
        },
        {
          name: "Player Leader",
          description:
            "Players take turns being in the middle and calling moves. Great for confidence.",
          difficulty: "beginner",
        },
        {
          name: "Eyes Closed Challenge",
          description:
            "Try simple moves (toe taps) with eyes closed for 5 seconds!",
          difficulty: "intermediate",
        },
        {
          name: "Music Moves",
          description:
            "Play music. When it stops, everyone freezes with foot on ball.",
          difficulty: "beginner",
        },
      ],
      makeEasier: `IF PLAYERS ARE STRUGGLING
• Do each move longer (30-45 seconds)
• Skip harder moves (scissors, outside touches)
• Slower pace for demonstrations
• Let them hold a partner's shoulder for balance

Signs they're struggling:
• Balls constantly rolling away
• Players falling over
• Frustrated faces`,
      makeHarder: `IF PLAYERS GET IT QUICKLY
• Speed up the rhythm
• Call moves faster, less demo time
• Add combinations (2 moves in a row)
• No watching - audio only
• Weak foot only for whole activity

Signs they're ready:
• Perfect form on all moves
• Asking for harder moves
• Looking bored during easier moves`,
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: [
        "technical",
        "ball-mastery",
        "all-abilities",
        "no-lines",
        "individual",
        "foundation",
      ],
      featured: true,
    },

    {
      sportId: soccer.id,
      name: "Gates Dribbling",
      slug: "gates-dribbling",
      description:
        "Players dribble through cone 'gates' scattered in a grid. Simple setup, maximum touches, natural progressions. The foundation of all dribbling practices.",
      activityType: "technical" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 8,
      setupInstructions: `SETUP DIAGRAM
┌─────────────────────────────────────────┐
│                                         │
│    ▲▲      ▲▲         ▲▲               │
│                                         │
│         ▲▲        ▲▲                   │  25 paces
│                                         │
│    ▲▲         ▲▲              ▲▲       │
│                                         │
│              ▲▲       ▲▲               │
│                                         │
└─────────────────────────────────────────┘
          30 paces

▲▲ = gate (two cones, 2 paces apart)

EQUIPMENT NEEDED
• 1 ball per player
• 16-20 cones (to make 8-10 gates)
• Create gates: 2 cones, 2 paces apart

QUICK SETUP
1. Scatter gates randomly in the grid (different angles!)
2. Some gates face different directions
3. Players spread out with balls
4. More gates = less waiting, more touches`,
      howToPlay: `GATHERING PLAYERS (20 seconds)
Say: "Everyone grab a ball! Your challenge: dribble through as many gates as you can!"

ROUND 1: Free Dribbling (90 seconds)
Say: "Dribble through any gate, any direction. How many can you get in 1 minute? Count in your head... GO!"

Coach position: Move around the grid, encouraging players.

After 90 seconds:
Say: "Freeze! How many gates? Anyone get more than 10? More than 15?"

Look for:
• Are players going through the gates (not around)?
• Are they controlling the ball through?
• Are they finding empty gates?

COACHING MOMENT (30 seconds)
Say: "Quick tip - don't wait in line for a gate! Look for empty ones. And slow down BEFORE the gate so you can dribble through clean."

ROUND 2: Right Foot Only (60 seconds)
Say: "Same game, but RIGHT FOOT ONLY for dribbling. Left foot can't touch the ball! Ready... GO!"

ROUND 3: Left Foot Only (60 seconds)
Say: "Switch! LEFT FOOT ONLY! This is trickier. Ready... GO!"

ROUND 4: Specific Techniques (pick 2-3)
Options to call out:
• "Only INSIDE of foot through gates!"
• "Only OUTSIDE of foot through gates!"
• "Do a TURN inside every gate!"
• "STOP the ball inside every gate, then accelerate out!"

FINAL CHALLENGE: Speed Round (90 seconds)
Say: "Final round! How many gates in 90 seconds? Any foot, any technique. Try to beat your first score! Ready... GO!"

Count down: "30 seconds left!... 10 seconds!... FREEZE!"
Say: "Who beat their first score? Champions!"`,
      coachingPoints: [
        "Close control approaching gates - Say: 'Slow down before the gate, speed up after!'",
        "Head up to find empty gates - Say: 'Which gates are free? Find them with your eyes!'",
        "Change of pace - Say: 'Cruise to the gate, then zoom through!'",
        "Both feet - Say: 'Your left foot is feeling left out!'",
      ],
      questionsToAsk: [
        "Why is it easier to go through gates slowly? (more control)",
        "What happens if you're only looking at the ball? (miss empty gates, hit people)",
        "Which foot is harder - left or right? (practice the hard one!)",
        "What part of your foot gives most control through the gate? (inside)",
      ],
      commonMistakes: [
        "Lining up behind busy gates → Say: 'Find empty gates! Don't wait in line!'",
        "Running through without ball control → Say: 'The ball has to go WITH you through the gate'",
        "Only using one foot → Say: 'Opposite foot! Give it a try!'",
        "Skipping gates (going around) → Say: 'Through the gate, not around it!'",
      ],
      variations: [
        {
          name: "Color Gates",
          description:
            "Use different colored cones. Call out 'Only red gates!' or 'Blue gates worth 2 points!'",
          difficulty: "beginner",
        },
        {
          name: "Partner Chase",
          description:
            "Pairs - one leads through gates, partner follows same path. Switch after 1 minute.",
          difficulty: "intermediate",
        },
        {
          name: "Gate Defenders",
          description:
            "1-2 players without balls stand in gates. Dribblers must find open gates. Defenders can move between gates.",
          difficulty: "intermediate",
        },
        {
          name: "Skills in Gates",
          description:
            "Must perform a skill inside gate: pull back, step over, Cruyff turn.",
          difficulty: "advanced",
        },
      ],
      makeEasier: `IF PLAYERS ARE STRUGGLING
• Bigger gates (3-4 paces apart)
• Fewer gates, spread out more
• Remove foot restrictions
• Let them walk/jog instead of dribble at first

Signs they're struggling:
• Knocking over cones constantly
• Ball running away from them
• Getting frustrated or giving up`,
      makeHarder: `IF PLAYERS GET IT QUICKLY
• Smaller gates (1.5 paces)
• Add defenders in gates
• Require specific move IN the gate
• Time challenges (5 gates in 20 seconds)
• Weak foot only entire time

Signs they're ready:
• Cruising through gates easily
• Looking bored
• Finishing challenges very quickly`,
      equipmentNeeded: ["1 ball per player", "16-20 cones"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId],
      tags: [
        "technical",
        "dribbling",
        "no-lines",
        "high-touches",
        "adaptable",
        "foundation",
      ],
      featured: true,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // GAME ACTIVITIES
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "World Cup",
      slug: "world-cup",
      description:
        "Classic playground game adapted for practice. Small group scoring game that's competitive, fun, and develops shooting, dribbling, and goalkeeping.",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 12,
      durationMinutes: 12,
      setupInstructions: `SETUP DIAGRAM
                    ┌────────┐
                    │  GOAL  │
                    │        │ 4 paces wide
                    └────────┘
                        │
                        │ 12 paces
                        │
      ○  ○  ○  ○  ○  ○  ●  (players with ball)

EQUIPMENT NEEDED
• 1 ball
• 2 cones or goals for goal (4 paces wide)
• Pinnies if you want to track who scored

QUICK SETUP
1. One goal, about 4 paces wide
2. Playing area extends about 12-15 paces from goal
3. All players start behind a line (use cones)
4. Need a way to keep score (pinnies work well)

FOR LARGER GROUPS (8+)
Set up 2 games side by side to reduce waiting`,
      howToPlay: `GATHERING PLAYERS (30 seconds)
Say: "We're playing WORLD CUP! You all start as your own country. Pick a country in your head - Brazil, USA, Mexico, England - you're playing for them!"

EXPLAINING THE GAME (60 seconds)
Say: "Here's how it works:
1. I roll the ball into the area
2. Everyone competes - it's every country for themselves!
3. If you score, you're safe and step aside
4. If you don't have the ball, you can tackle to steal it
5. When 2 people are left, they have a 1v1 shootout
6. Winner stays, loser is eliminated

We play until one country wins!"

STARTING THE GAME
Say: "Everyone behind this line. Ready? WORLD CUP!"
Roll the ball into the middle of the playing area.

COACH ROLE DURING PLAY
• Stay behind the goal or to the side
• Call out "GOAL - Brazil is safe!" when someone scores
• After each goal, gather remaining players and roll a new ball
• Keep energy high: "Who wants it? Get in there!"

MANAGING FAIRNESS
• If same players always score, add rules:
  - "Must take 3 touches before shooting"
  - "Must beat someone 1v1 first"
• Keep eliminated players engaged:
  - "Knocked out? Do 10 ball taps, then cheer for your friend"

FINAL 2: SHOOTOUT
Say: "Final 2! You each get one shot from the line. [Player 1], you shoot at [Player 2] as keeper. Then switch!"
Best of 3 shots if needed.

CROWNING THE CHAMPION
Say: "WORLD CUP CHAMPION: [Country name]!"
Quick celebration, then: "New tournament! Everyone back in!"`,
      coachingPoints: [
        "Be first to the ball - Say: 'Who wants it more? Get there first!'",
        "Shoot when you see goal - Say: 'If you can see the goal, SHOOT!'",
        "Shield to protect - Say: 'Body between defender and ball!'",
        "Quick decisions - Say: 'Don't dribble too long - someone will steal it!'",
      ],
      questionsToAsk: [
        "What made you score that goal? (look for good answers: quick shot, beat defender)",
        "Why didn't you shoot there? (sometimes they don't see the goal)",
        "How did you steal the ball? (got there first, body position)",
        "What could you try next round? (builds self-reflection)",
      ],
      commonMistakes: [
        "Standing back and watching → Say: 'Get in there! You can't score from the back!'",
        "Dribbling too much → Say: 'Shoot! The goal isn't running away!'",
        "Fouling aggressively → Say: 'Win the ball, not the person. Shoulder to shoulder is OK.'",
        "Giving up after falling behind → Say: 'New round, new chance! Reset!'",
      ],
      variations: [
        {
          name: "Team World Cup",
          description:
            "Pairs work together. Both partners must touch the ball before scoring.",
          difficulty: "beginner",
        },
        {
          name: "Keeper Always",
          description:
            "Designate a permanent keeper. They can never be eliminated. Makes games longer.",
          difficulty: "beginner",
        },
        {
          name: "2-Touch Only",
          description:
            "Must shoot within 2 touches of receiving. Creates faster play.",
          difficulty: "intermediate",
        },
        {
          name: "Double Points",
          description:
            "Weak foot goals count as 2 goals (you can survive an extra round).",
          difficulty: "intermediate",
        },
      ],
      makeEasier: `IF PLAYERS ARE STRUGGLING
• Bigger goal (6 paces)
• Roll ball closer to weaker players to start
• "Safe zone" - players in safe zone can't be tackled for 2 seconds
• No elimination - just count goals

Signs they're struggling:
• Same players eliminated quickly every round
• Players giving up or not trying
• One player dominating entirely`,
      makeHarder: `IF PLAYERS GET IT QUICKLY
• Smaller goal (3 paces)
• Must dribble around a cone before shooting
• Add a goalkeeper
• Must beat at least one player before shooting

Signs they're ready:
• Games ending very quickly
• Players asking for more challenge
• Easy goals being scored`,
      equipmentNeeded: ["1 ball", "2 cones for goal"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: [
        "game",
        "shooting",
        "competition",
        "fun",
        "high-energy",
        "classic",
      ],
      featured: true,
    },

    {
      sportId: soccer.id,
      name: "4v4 to Small Goals",
      slug: "4v4-to-small-goals",
      description:
        "The fundamental small-sided game for youth soccer. Maximum involvement, lots of scoring opportunities, real game decision-making. Should be a staple of every practice.",
      activityType: "scrimmage" as const,
      difficulty: "beginner" as const,
      minPlayers: 8,
      maxPlayers: 10,
      durationMinutes: 15,
      setupInstructions: `SETUP DIAGRAM
     ▲═══════════════════════════════▲
     │                               │
     │                               │
GOAL │    ●  ●         ○  ○         │ GOAL
▲  ▲ │       ●           ○          │ ▲  ▲
     │    ●               ○          │
     │                               │
     ▲═══════════════════════════════▲

     30-35 paces long x 20-25 paces wide
     Goals: 3 paces wide (small goals/cones)

EQUIPMENT NEEDED
• 1 ball (plus 2-3 backup balls behind goals)
• 8 cones (4 corners + 2 per goal)
• Pinnies for one team
• Small goals if available (or cone goals)

QUICK SETUP
1. Create rectangular field: 30-35 x 20-25 paces
2. Place small goals (3 paces wide) at each end
3. 4 players per team, pinnies on one team
4. Extra balls behind each goal for quick restarts`,
      howToPlay: `PREGAME SETUP (60 seconds)
Say: "Two teams of 4! [divide quickly by pinnies]"
Say: "Quick reminder - no goalkeepers. You're all attackers and defenders."

KICKOFF
Say: "When ball goes out, I'll play a new one in - we never stop! First to 5 goals wins. Ready? PLAY!"

Coach: Roll a ball onto the field.

DURING THE GAME - COACH ROLE
Position: Stay outside the field, moving along the sideline.

Your Job:
• Keep balls flowing in (no stoppages for out-of-bounds)
• Count goals aloud: "1-0 blue team!"
• Brief coaching moments during natural breaks
• Keep energy high

What to Say DURING Play (sparingly):
• "Find space!" (when players bunch up)
• "Look up!" (when someone's dribbling with head down)
• "Shot!" (when someone has clear chance)

AVOID:
• Stopping play too often
• Giving tactical instructions constantly
• Coaching every touch

WATER BREAK (at 7-8 minutes)
Say: "Freeze! Water break - 30 seconds. Score is X-X."

Quick teaching moment (30 seconds max):
Pick ONE thing you've noticed.
• "I'm seeing everyone run to the ball. What happens to the rest of the field? [Empty!] Can some of you stay spread out?"

SECOND HALF
Say: "Same teams, switch ends. First to 5 again - go!"

END OF GAME
Say: "Final score: X-X! [Winning team], nice work! Both teams, tell me one thing you did well today."`,
      coachingPoints: [
        "Spread out when you have ball - Say: 'Make the field big!'",
        "Shoot when you see goal - Say: 'Can you see the goal? SHOOT!'",
        "Everyone defends - Say: 'Lost the ball? Now you're a defender!'",
        "Move without the ball - Say: 'Can you get open for a pass?'",
      ],
      questionsToAsk: [
        "What do you do when your teammate has the ball? (move to get open)",
        "Why did that goal happen? (look for tactical awareness)",
        "How can you help when you don't have the ball? (move, support)",
        "What happens when everyone runs to the ball? (no one to pass to!)",
      ],
      commonMistakes: [
        "Everyone chasing the ball → Say: 'Spread out! Only 1-2 people go to the ball!'",
        "Standing still without ball → Say: 'Move! Get open for a pass!'",
        "Only shooting from far away → Say: 'Get closer! Small goals need close shots'",
        "Ignoring teammates → Say: 'Look up - you've got teammates!'",
      ],
      variations: [
        {
          name: "4v4 + Neutral",
          description:
            "Add 1-2 neutral players who always play with the team that has the ball. Creates overloads.",
          difficulty: "intermediate",
        },
        {
          name: "Goal = Keep Ball",
          description:
            "After scoring, same team keeps the ball (starts from their own goal). Rewards good teams.",
          difficulty: "intermediate",
        },
        {
          name: "3-Touch Limit",
          description: "Maximum 3 touches before passing or shooting.",
          difficulty: "advanced",
        },
        {
          name: "End Zone Goals",
          description:
            "Instead of goals, score by dribbling across the end line and stopping the ball.",
          difficulty: "beginner",
        },
      ],
      makeEasier: `IF PLAYERS ARE STRUGGLING
• Bigger field (more space to play)
• Bigger goals (easier to score)
• Remove one player per team (3v3)
• Add neutrals (always attacking overload)

Signs they're struggling:
• No goals being scored
• Constant turnovers
• Players getting frustrated
• No one passing`,
      makeHarder: `IF PLAYERS GET IT QUICKLY
• Smaller field (less time to decide)
• Smaller goals (need accurate shots)
• Touch limits (2-touch or 3-touch)
• "Clinic goals" worth 2 (specific technique rewarded)

Signs they're ready:
• Clean passing sequences
• Tactical awareness emerging
• Asking for challenges
• Games feeling too easy`,
      equipmentNeeded: ["1 ball + extras", "8 cones", "pinnies"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: [
        "scrimmage",
        "small-sided",
        "game-like",
        "essential",
        "decision-making",
      ],
      featured: true,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // COOLDOWN ACTIVITIES
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Juggling Challenge",
      slug: "juggling-challenge-cooldown",
      description:
        "Individual or partner juggling as active cooldown. Low intensity, high engagement, builds touch and coordination. Perfect end to practice.",
      activityType: "cooldown" as const,
      difficulty: "intermediate" as const,
      minPlayers: 2,
      maxPlayers: 30,
      durationMinutes: 5,
      setupInstructions: `SETUP DIAGRAM

      ○       ○       ○       ○

      ○       ○       ○       ○

      Spread out - arm's length from neighbors

EQUIPMENT NEEDED
• 1 ball per player

QUICK SETUP
1. Players spread out anywhere in the area
2. Everyone has their own ball
3. Coach can participate too!`,
      howToPlay: `SETTING THE MOOD (15 seconds)
Say: "Let's cool down with some juggling. This isn't a race - focus on your OWN best, not anyone else's."

CHALLENGE 1: Personal Best (90 seconds)
Say: "First challenge: What's YOUR personal best for juggles without dropping? Any body part except hands and arms. Try to beat your best today."

Let them practice. Walk around encouraging.
• "Nice! One more than yesterday is a WIN!"
• "Start with a drop from your hands if it helps"
• "Thighs are easier than feet to start"

CHALLENGE 2: Body Part Sequence (60 seconds)
Say: "New challenge: Can you do foot-thigh-foot? Three touches, three body parts."

For advanced players: "Try foot-thigh-head!"

CHALLENGE 3: Partner Juggling (90 seconds)
Say: "Find a partner! See how many juggles you can get TOGETHER. You hit it, they hit it, you hit it... Work together!"

Walk around encouraging partnerships.

FINAL CHALLENGE: Show Off Time (30 seconds)
Say: "Anyone want to show the group a skill? Maybe you learned something cool today or you're working on a new trick!"

Let 2-3 volunteers demo briefly. Clap for everyone.

WRAP UP
Say: "Great practice today! [Quick summary of one thing they worked on]. Juggling is something you can practice at home - see you next time!"`,
      coachingPoints: [
        "Soft touches - Say: 'Cushion the ball, don't kick it up!'",
        "Eyes on ball - Say: 'Watch the ball all the way to your foot'",
        "Balanced stance - Say: 'Arms out for balance!'",
        "Start from hands - Say: 'It's OK to drop from your hands to start!'",
      ],
      questionsToAsk: [
        "Which body part is easiest for you? (thigh usually)",
        "What makes the ball go wild? (kicking too hard)",
        "How can you get more control? (soft touches, eye on ball)",
        "Did you beat your personal best today?",
      ],
      commonMistakes: [
        "Kicking too hard → Say: 'Softer! Just lift it gently'",
        "Leaning back → Say: 'Stay balanced, small movements'",
        "Giving up quickly → Say: 'Just one more than last time is a win!'",
        "Only using dominant foot → Say: 'Your other foot needs practice too!'",
      ],
      variations: [
        {
          name: "Ground Juggles Only",
          description:
            "Ball bounces on ground between each touch. Easier for beginners.",
          difficulty: "beginner",
        },
        {
          name: "Thigh Only",
          description:
            "Only use thighs - easier starting point for young players.",
          difficulty: "beginner",
        },
        {
          name: "Group Circle",
          description:
            "Small groups in circles pass with juggle touches around.",
          difficulty: "intermediate",
        },
        {
          name: "Juggle Walk",
          description: "Juggle while slowly walking across the field.",
          difficulty: "advanced",
        },
      ],
      makeEasier: `IF PLAYERS ARE STRUGGLING
• Allow bounce between each touch
• Thigh only (bigger surface)
• Just catch after one touch - build up slowly
• Partner holds ball up for them to volley

Signs they're struggling:
• Can't get more than 1-2 touches
• Getting frustrated, giving up
• Saying "I can't do this"`,
      makeHarder: `IF PLAYERS GET IT QUICKLY
• Weak foot only
• No thigh allowed (feet and head only)
• Moving while juggling
• Add flicks and tricks

Signs they're ready:
• Getting 10+ consecutively
• Looking bored or showing off
• Asking for challenges`,
      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentalsId, skillBuildingId, developmentId],
      tags: ["cooldown", "individual", "juggling", "coordination", "low-intensity"],
      featured: false,
    },
  ];

  // Insert activities
  for (const activity of enhancedActivities) {
    await db
      .insert(activities)
      .values(activity)
      .onConflictDoNothing();
    console.log(`  ✓ ${activity.name}`);
  }

  console.log(`\nSeeded ${enhancedActivities.length} enhanced soccer activities`);
}

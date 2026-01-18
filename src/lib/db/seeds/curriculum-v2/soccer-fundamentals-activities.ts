/**
 * Comprehensive Soccer Activities - Fundamentals Stage (Ages 6-8)
 *
 * Print-ready activities with complete coaching guides including:
 * - Quick reference cards
 * - Minute-by-minute scripts
 * - Troubleshooting guides
 * - Skill connections
 * - Developmental context
 * - Parent communication
 * - Safety considerations
 */

import { db } from "../../index";
import { activities, type NewActivity } from "../../schema/practice-planning";
import { sports } from "../../schema/sports";
import { developmentStages } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

export async function seedSoccerFundamentalsActivities() {
  console.log("Seeding comprehensive soccer activities (Fundamentals)...");

  const [soccer] = await db.select().from(sports).where(eq(sports.slug, "soccer"));
  if (!soccer) throw new Error("Soccer sport must be seeded first");

  const stages = await db.select().from(developmentStages);
  const fundamentals = stages.find((s) => s.slug === "fundamentals");
  const skillBuilding = stages.find((s) => s.slug === "skill-building");

  if (!fundamentals) throw new Error("Development stages must be seeded first");

  const comprehensiveActivities: NewActivity[] = [
    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 1: SHARK ATTACK
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Shark Attack",
      slug: "shark-attack-v2",
      description: "High-energy dribbling game where players protect their balls from 'sharks' who try to kick them out. Develops dribbling under pressure, awareness, and shielding in a fun, game-like environment.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 7,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 ball per player (except sharks)
□ 4 cones for corners (bright colors)
□ 2-3 pinnies for sharks

SPACE: 20x20 paces (adjust based on numbers)

SETUP STEPS
1. Place 4 cones in a square, 20 paces apart
2. Give every player a ball EXCEPT 1-2 sharks
3. Sharks wear pinnies (1 shark per 5-6 dribblers)
4. All dribblers start inside the grid with balls

DIAGRAM
┌────────────────────────────┐
│  ▲                     ▲   │
│     ○   ○                  │
│         ●(shark)   ○       │  20 paces
│     ○        ○    ○        │
│  ▲                     ▲   │
└────────────────────────────┘
       20 paces
▲=cone  ○=dribbler with ball  ●=shark (pinnie, no ball)`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (60 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of grid

SAY: "Everyone grab a ball and come into the square! Spread out - find your own space!"

Pick sharks: "Marcus and Lily, can you come help me? You're going to be our hungry sharks!"
Give sharks pinnies, take their balls.

SAY: "This is SHARK ATTACK! Dribblers - your job is to dribble around and PROTECT your ball from the sharks. Sharks - your job is to kick balls OUT of the square. Not steal them - kick them OUT!"

SAY: "Dribblers - if your ball gets kicked out, do 5 toe taps on a ball outside, then come right back in. Questions? Let's GO!"


PHASE 2: ROUND 1 (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Outside grid, moving around perimeter

SAY: "Sharks, show me your mean shark faces! Dribblers, protect your ball! Ready... SHARKS ARE HUNGRY!"

DURING PLAY - What to Watch For:
□ Are dribblers looking up to see sharks?
□ Are they using their body to shield?
□ Are sharks being active (not standing)?

PHRASES TO USE:
• "Great escape!"
• "Sharks, find the sleepy fish!"
• "Head up - where's the shark?"
• "Nice shielding!"

When ball goes out: Point to toe tap area, "5 toe taps, back in!"

COUNTDOWN: "One minute left!... 10 seconds!... FREEZE!"


PHASE 3: TEACHING MOMENT (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of grid, all players frozen

SAY: "Everyone freeze! Dribblers - point to where the sharks are RIGHT NOW."
Watch: Can they find them without searching?

ASK: "What helped you keep your ball safe?"
Listen for: "Moving away," "Shielding," "Looking up"

TEACH ONE THING:
SAY: "I noticed some of you putting your body between the shark and the ball - like THIS."
Demo: Quick shield demonstration
SAY: "That's BRILLIANT. Try that this round. GO!"


PHASE 4: ROUND 2 (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Sharks - how many balls can you kick out? Let's count!"

Reinforce teaching point:
• When you see shielding: "YES! Body between shark and ball!"
• When you see no shielding: "Turn your body - protect it!"

END: "FREEZE! Sharks, how many? Nice work!"


PHASE 5: ROUND 3 + WRAP UP (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SWITCH SHARKS: "New sharks! Who hasn't been a shark yet?"
Trade pinnies, run 45-second round.

WRAP UP (15 seconds):
SAY: "Great work! I saw great shielding and heads up looking for sharks. Water break, then we're moving to [next activity]."`,

      diagram: `┌────────────────────────────┐
│  ▲                     ▲   │
│     ○   ○                  │
│         ●(shark)   ○       │  20x20 paces
│     ○        ○    ○        │
│  ▲                     ▲   │
└────────────────────────────┘`,

      coachingPoints: [
        "HEAD UP while dribbling → Say: 'Can you dribble AND see the shark at the same time?'",
        "USE BODY to shield → Say: 'Put your body between the shark and your ball - like protecting your lunch!'",
        "SMALL touches → Say: 'Keep the ball close, like it's on a short leash!'",
        "CHANGE DIRECTION → Say: 'When the shark gets close, can you turn away?'",
      ],

      questionsToAsk: [
        "'Where are the sharks right now?' → Develops awareness without stopping play",
        "'What part of your foot keeps the ball closest?' → Develops technique awareness",
        "'If a shark is coming from your right, which way should you turn?' → Develops decision making",
        "'How did you keep your ball safe that time?' → Develops reflection",
      ],

      commonMistakes: [
        "KICKING BALL TOO FAR → Say: 'Tiny touches! Ball should never be more than one step away'",
        "ONLY WATCHING BALL → Say: 'Quick peeks up! Look at ball, look up, look at ball, look up'",
        "RUNNING WITHOUT BALL → Say: 'Take your ball with you when you escape!'",
        "SHARKS CHASING ONE PLAYER → Say: 'Sharks, look for easy targets - who's not paying attention?'",
      ],

      variations: [
        { name: "Freeze Sharks", description: "When coach yells 'FREEZE!' everyone stops. Last moving becomes shark.", difficulty: "beginner" },
        { name: "Ball Thief", description: "Sharks steal and dribble instead of kicking out. More 1v1 battles.", difficulty: "intermediate" },
        { name: "Shark Jail", description: "If caught, you become a shark too. Last dribbler wins!", difficulty: "intermediate" },
        { name: "Superhero Rescue", description: "Player with ball can 'rescue' frozen teammate by passing to them.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Most balls knocked out within 30 seconds
• Players looking frustrated, not smiling
• No one can escape sharks

SOLUTIONS:
• Make grid bigger (25x25 paces)
• Fewer sharks (1 shark per 6-7 dribblers)
• Sharks must hop instead of run
• Allow 3 toe taps instead of 5
• "Safe zones" in corners (can't be tagged for 3 seconds)`,

      makeHarder: `SIGNS THEY'RE READY:
• Dribblers easily escaping sharks
• Players looking bored or asking "what's next?"
• Sharks can't catch anyone

SOLUTIONS:
• Make grid smaller (15x15 paces)
• More sharks (1 shark per 4 dribblers)
• Dribblers must stay moving (no standing)
• Weak foot only for dribbling
• Add "super shark" who can use hands to block`,

      equipmentNeeded: ["1 ball per player", "4 cones", "2-3 pinnies"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id, skillBuilding?.id].filter(Boolean) as string[],
      tags: ["warmup", "dribbling", "awareness", "shielding", "high-energy", "fun", "no-lines"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Dribblers protect balls from sharks who kick them out; develops dribbling under pressure and awareness.",
          keyPhrases: [
            "Can you dribble AND see the shark?",
            "Body between shark and ball!",
            "Tiny touches - short leash!",
          ],
          setupDiagram: "20x20 pace grid, 4 corner cones, 1 shark per 5-6 dribblers with pinnies",
          quickProgression: {
            easier: "Bigger grid, fewer sharks, sharks must hop",
            harder: "Smaller grid, more sharks, weak foot only",
          },
        },

        completeScript: {
          beforeYouStart: {
            preparation: [
              "Arrive 5 minutes early to set up grid",
              "Count players to determine sharks (1 per 5-6 dribblers)",
              "Have extra balls nearby for quick replacement",
              "Pick 1-2 enthusiastic volunteers for first sharks",
            ],
            mindset: "This is a HIGH ENERGY warmup. Your enthusiasm sets the tone. Be loud, move around, celebrate effort. Goal: players moving and smiling.",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "60 seconds",
              coachPosition: "Center of grid",
              script: "SAY: 'Everyone grab a ball and come into the square!' Pick sharks, give pinnies, explain rules: sharks kick balls OUT, dribblers protect and do 5 toe taps if caught.",
              anticipatedResponses: {
                "Kids arguing about who's shark": "Everyone will get a turn! Let's start with volunteers.",
                "Not enough balls": "Share with a partner - you'll both dribble soon.",
                "Kids already kicking wildly": "Freeze! Balls under feet, eyes on me.",
              },
            },
            {
              phase: "Round 1",
              duration: "2 minutes",
              coachPosition: "Outside grid, moving around",
              script: "SAY: 'Sharks, mean faces! Dribblers, protect! SHARKS ARE HUNGRY!' Watch for: heads up, shielding, shark activity. Encourage constantly.",
              troubleshooting: {
                "Sharks can't catch anyone": ["Add shark", "Make grid smaller", "No standing still for dribblers"],
                "Balls out instantly": ["Remove shark", "Make grid bigger", "Sharks must hop"],
              },
            },
            {
              phase: "Teaching Moment",
              duration: "30 seconds",
              coachPosition: "Center, everyone frozen",
              script: "SAY: 'Freeze! Point to sharks.' ASK: 'What helped keep your ball safe?' TEACH: Demo shielding - body between shark and ball.",
            },
            {
              phase: "Round 2",
              duration: "90 seconds",
              coachPosition: "Outside grid",
              script: "SAY: 'Sharks, how many can you get? Let's count!' Reinforce shielding. End with freeze and count.",
            },
            {
              phase: "Round 3 & Wrap",
              duration: "90 seconds",
              coachPosition: "Outside grid",
              script: "Switch sharks. Run 45-second round. WRAP: 'Great shielding and awareness! Water break.'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            sharksTooStrong: {
              symptoms: ["Most balls out in 30 seconds", "Frustrated dribblers", "No one escapes"],
              solutions: ["Remove a shark", "Bigger grid (25x25)", "Sharks hop", "Add safe zone corners"],
            },
            sharksTooWeak: {
              symptoms: ["No balls kicked out", "Frustrated sharks", "Dribblers cruising"],
              solutions: ["Add a shark", "Smaller grid (15x15)", "No standing still", "Weak foot only"],
            },
          },
          playerBehavior: {
            notParticipating: {
              symptoms: ["Standing at edge", "Not moving with ball", "Disengaged"],
              approach: "Privately ask: 'Everything okay?' Offer alternative role: 'Help me count catches?' Wait it out - often join after watching.",
            },
            overlyAggressive: {
              symptoms: ["Pushing players", "Slide tackling", "Going for player not ball"],
              approach: "IMMEDIATE pause if dangerous. SAY: 'We go for BALL, not person.' If continues: 'Take 1-minute break.'",
            },
            frustrated: {
              symptoms: ["Kicking ball in anger", "Saying 'I can't'", "Tears"],
              approach: "Quick private word. Offer easier role. Normalize: 'Everyone finds this hard.'",
            },
          },
          environmentalIssues: {
            spaceTooBig: {
              symptoms: ["Can't see all players", "Game feels slow"],
              solution: "Move corner cones in. No shame adjusting mid-game.",
            },
            spaceTooSmall: {
              symptoms: ["Constant collisions", "Chaos"],
              solution: "Move cones out, or split into two games.",
            },
            unevenNumbers: {
              symptoms: ["Odd player always left out"],
              solutions: ["Odd player counts catches", "Permanent shark", "Uneven groups (5v1 and 6v1)"],
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Dribbling Under Pressure",
              domain: "Technical",
              howItDevelops: "Players control ball while evading active defenders, replicating game pressure in fun context.",
              levelIndicators: {
                1: "Ball frequently kicked away; can't escape sharks",
                2: "Sometimes escapes but no shielding; reactive not proactive",
                3: "Uses body to shield; looks up occasionally; survives most rounds",
                4: "Proactively avoids sharks; uses direction changes; rarely caught",
                5: "Beats sharks easily; helps teammates; could coach others",
              },
              assessmentNotes: "Watch across multiple rounds. Early performance may not reflect true ability as they learn the game.",
            },
            {
              skill: "Awareness / Scanning",
              domain: "Tactical",
              howItDevelops: "Must know where sharks are to avoid them. Builds habit of looking up while dribbling.",
              levelIndicators: {
                1: "Only looks at ball; surprised when caught",
                2: "Occasional glances up; reactive to sharks",
                3: "Regularly looks up; knows where 1 shark is",
                4: "Scans continuously; knows where multiple sharks are",
                5: "Always aware; makes decisions before shark arrives",
              },
              assessmentNotes: "Ask 'point to sharks' while frozen. Their accuracy reveals awareness level.",
            },
          ],
          secondarySkills: [
            {
              skill: "Ball Control",
              domain: "Technical",
              howItDevelops: "Close touches required to keep ball from sharks.",
              levelIndicators: {
                1: "Big kicks; ball far from feet",
                2: "Inconsistent touch distance",
                3: "Generally keeps ball close while moving",
                4: "Consistently close control at various speeds",
                5: "Perfect close control; can speed up/slow at will",
              },
            },
            {
              skill: "Change of Direction",
              domain: "Technical",
              howItDevelops: "Evading sharks requires quick turns and direction changes.",
            },
          ],
          physicalDevelopment: {
            agility: "Quick direction changes, stops, starts",
            spatialAwareness: "Understanding space relative to others",
            cardiovascular: "Continuous movement for 7 minutes",
          },
          psychologicalDevelopment: {
            resilience: "Getting caught and coming back in",
            competitiveness: "Desire to survive",
            enjoyment: "Fun activity builds love of sport",
          },
        },

        developmentalContext: {
          whyThisActivity: "Shark Attack develops dribbling under pressure in game-like context WITHOUT team tactical complexity. Players focus on: controlling ball, avoiding pressure, recovering from failure. This mirrors receiving ball in games when defender closes down.",
          whenToUseIt: {
            idealFor: [
              "Early in practice (warmup) - gets energy up",
              "When players need confidence - high success rate",
              "After technical work - applies skills under pressure",
              "When energy is low - competition re-engages",
            ],
            avoidWhen: [
              "End of practice when tired (too intense)",
              "Very uneven abilities (frustration for weaker players)",
              "Less than 6 players (dynamics don't work)",
            ],
          },
          progressionPath: {
            before: [
              { activity: "Traffic Lights", reason: "Ball control at speeds without defenders" },
              { activity: "Gates Dribbling", reason: "Dribbling through spaces without pressure" },
            ],
            after: [
              { activity: "1v1 to Goal", reason: "Dribbling under pressure with scoring" },
              { activity: "3v3 to Small Goals", reason: "Applies skills in team context" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Maximum fun, minimum correction",
              keyPhrases: ["Be a sneaky fish!", "Hide your ball!", "Sharks are coming!"],
              avoidSaying: ["You need to shield better (too abstract)", "Scan the field"],
              duration: "5 minutes max",
              simplifications: ["Bigger grid", "Fewer sharks", "No weak foot"],
            },
            "ages9to11": {
              approach: "Introduce technique, maintain fun",
              keyPhrases: ["Body position!", "Small touches!", "Eyes up!"],
              challenges: ["Weak foot rounds", "Must use a move to escape"],
              duration: "7-8 minutes with teaching",
            },
            "ages12to14": {
              approach: "Game realism, player-led",
              keyPhrases: ["When do you see this in games?", "What technique helps?"],
              challenges: ["Smaller grid", "Communicating sharks", "Points for assists"],
              coachRole: "Facilitate discussion about game application",
            },
          },
          commonMisconceptions: {
            "Just a game, not real training": "This IS training - game-like pressure transfers to matches better than drills.",
            "Weaker players always lose": "Design so everyone succeeds: enough sharks that weak aren't targeted, celebrate longest survivor.",
            "Not learning technique": "Learning to APPLY technique under pressure is harder than isolated technique.",
          },
        },

        parentCommunication: {
          ifAsked: "We play Shark Attack because it develops dribbling under pressure in a fun, game-like context. Your child learns to control the ball while someone tries to take it - exactly what happens in games.",
          newsletter: "This week: Shark Attack! This game teaches ball control under pressure. Watch for your child using their body to 'shield' the ball at home or in games!",
          whatToWatchFor: [
            "Does your child protect ball with their body? (shielding)",
            "Do they look up while dribbling? (awareness)",
            "Can they change direction quickly? (agility)",
            "Do they keep ball close to feet? (control)",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Player collisions", prevention: "Emphasize 'heads up', adequate space", response: "Check both players, pause to reinforce awareness" },
            { risk: "Slide tackling", prevention: "State 'no sliding' before game", response: "Immediate stop, reminder, repeat = sit out" },
            { risk: "Ball to face", prevention: "Sharks kick LOW toward feet", response: "Check player, ice if needed, remind about safe kicks" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Pair faster dribblers with slower sharks, or give immunity for first 30 seconds",
            newPlayers: "Partner with experienced player first round",
            anxiousPlayers: "Start as shark (less pressure) before dribbling",
          },
        },

        coachReflection: {
          afterActivity: [
            "Did all players have multiple turns before getting caught?",
            "Were there moments I should have adjusted difficulty?",
            "Did I name specific skills I saw?",
            "Was my energy appropriate?",
          ],
          forImprovement: [
            "What would I change about setup?",
            "Which phrases worked well?",
            "Who needed more support?",
            "How could I better connect to game situations?",
          ],
        },
      },
    },

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 2: TRAFFIC LIGHTS
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Traffic Lights",
      slug: "traffic-lights-v2",
      description: "Dribbling game where players respond to color commands. Red=stop, Yellow=slow, Green=fast. Develops listening skills, ball control at different speeds, and the foundational ability to stop a ball on command.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 30,
      durationMinutes: 5,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 ball per player
□ 4 cones for corners (optional but helpful)
□ Optional: colored cones/cards (red, yellow, green) as visual aids

SPACE: As large as available (minimum 20x25 paces)

SETUP STEPS
1. Players spread out in large area
2. Every player has ball at feet
3. Coach stands where everyone can see/hear

DIAGRAM
┌─────────────────────────────────┐
│                                 │
│    ○    ○    ○    ○    ○       │
│                                 │  20+ paces
│    ○    ○   COACH  ○    ○      │
│                                 │
│    ○    ○    ○    ○    ○       │
└─────────────────────────────────┘
       25+ paces`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (40 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Everyone grab a ball and find your own space - spread out so you can't touch anyone!"

SAY: "We're playing Traffic Lights! When I say GREEN, dribble as fast as you can control. When I say YELLOW, super slow motion! When I say RED, stop your ball completely with the bottom of your foot."

DEMO: "Watch me - GREEN (fast dribble)... YELLOW (slow)... RED (stop with sole). Your turn!"


PHASE 2: ROUND 1 - BASIC (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Find a space... GREEN!"

Call colors randomly:
• GREEN: Hold 5-8 seconds
• YELLOW: Hold 3-5 seconds
• RED: Hold 3-4 seconds (check clean stops)

WATCH FOR:
□ Quick response to commands?
□ Ball stopping without rolling away?
□ Different speeds for green vs yellow?

PRAISE: "Great stop!" "Love that speed!" "Nice slow control!"


PHASE 3: COACHING MOMENT (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Freeze on red! Show me how you stopped. What part of your foot?"

Wait for: "Bottom" / "Sole"

SAY: "Right - your SOLE! Like squashing a bug. Let's go again!"


PHASE 4: ROUND 2 - ADD CHALLENGE (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Same game, but now on RED, see how FAST you can freeze. Slowest person does 3 jumping jacks! Ready... GREEN!"


PHASE 5: ROUND 3 - MIX IT UP (60 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Options:
• "REVERSE!" - Green means stop, Red means go
• "Red light... Red light... RED LIGHT!" (trick them)
• Whisper colors so they must really listen

WRAP UP: "Great listening! Who can tell me which foot part stops the ball? Water break!"`,

      coachingPoints: [
        "STOP WITH SOLE → Say: 'Squash the ball like a bug!'",
        "GREEN = FAST BUT CONTROLLED → Say: 'Fast feet, but can you still stop on red?'",
        "HEAD UP FOR COMMANDS → Say: 'Ears open, eyes up!'",
        "CHANGE DIRECTION → Say: 'Don't just go straight - explore the whole space!'",
      ],

      questionsToAsk: [
        "'What part stops the ball best?' → Sole/bottom",
        "'Is it easier to stop from super fast or medium speed?' → Medium - more control",
        "'Can you dribble fast AND keep ball close?' → Challenge them",
        "'What helps you hear colors - looking down or up?' → Looking up",
      ],

      commonMistakes: [
        "BALL ROLLS AWAY ON RED → Say: 'Get foot on top quicker! Squash it!'",
        "SAME SPEED GREEN/YELLOW → Say: 'Show the difference! Green=cheetah, Yellow=turtle'",
        "NOT SPREADING OUT → Say: 'Find space where you can swing arms without touching anyone'",
        "ONLY STRAIGHT LINES → Say: 'Explorers! Visit every corner of our space'",
      ],

      variations: [
        { name: "Add Orange/Amber", description: "Orange = medium speed. Now 4 speeds to control.", difficulty: "beginner" },
        { name: "Traffic Cop", description: "Player becomes traffic cop, calls colors. Rotate every 30 seconds.", difficulty: "beginner" },
        { name: "Body Part Stop", description: "On RED, call body part (knee, elbow) to touch ball.", difficulty: "intermediate" },
        { name: "Direction Colors", description: "BLUE = turn left, ORANGE = turn right while moving.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Most can't stop on red
• Confusion about colors
• Collisions from lack of control

SOLUTIONS:
• Slow down color calls
• Only green and red first (add yellow later)
• Let ball stop naturally (don't require sole)
• More time between calls`,

      makeHarder: `SIGNS THEY'RE READY:
• Instant responses
• Perfect stops every time
• Asking "what else?"

SOLUTIONS:
• Call colors faster
• Whisper colors
• Add reverse mode
• Weak foot only on yellow
• Add movements (jumping jacks on red)`,

      equipmentNeeded: ["1 ball per player", "4 cones (optional)"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id],
      tags: ["warmup", "dribbling", "listening", "ball-control", "beginner-friendly", "no-lines"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Color commands control dribbling speed - RED=stop, YELLOW=slow, GREEN=fast - develops listening and ball control.",
          keyPhrases: [
            "Squash the ball like a bug!",
            "Green is cheetah, Yellow is turtle!",
            "Ears open, eyes up!",
          ],
          setupDiagram: "Large open space, 1 ball per player, everyone spread out",
          quickProgression: {
            easier: "Slower calls, only 2 colors, don't require sole stop",
            harder: "Faster calls, whisper, reverse mode, weak foot",
          },
        },

        completeScript: {
          beforeYouStart: {
            preparation: [
              "Ensure enough balls for all players",
              "Mark out area with corner cones if helpful",
              "Optional: have colored cones/cards as visual aids",
              "Position yourself where all can see and hear",
            ],
            mindset: "This is about LISTENING and CONTROL. Your voice is the main tool - vary volume, speed, and add playfulness (whispers, tricks). Celebrate the stops!",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "40 seconds",
              coachPosition: "Center where all can see",
              script: "SAY: 'Find your own space!' Explain: GREEN=fast, YELLOW=slow, RED=stop with sole. Demo each briefly.",
              anticipatedResponses: {
                "What if I forget the colors?": "Just watch what others do and you'll remember!",
                "Can I go really really fast?": "As fast as you can CONTROL the ball!",
              },
            },
            {
              phase: "Round 1 - Basic",
              duration: "90 seconds",
              coachPosition: "Center, visible to all",
              script: "Call colors randomly. GREEN 5-8 sec, YELLOW 3-5 sec, RED 3-4 sec. Praise good stops and speed control.",
              troubleshooting: {
                "Can't stop on RED": ["Give more warning", "Slower approach speed", "Don't require sole yet"],
                "Same speed all colors": ["Exaggerate demos", "Use animal comparisons", "Side-by-side race"],
              },
            },
            {
              phase: "Teaching Moment",
              duration: "30 seconds",
              coachPosition: "Center",
              script: "FREEZE! 'Show me how you stopped. What part of foot?' Teach: SOLE = bottom, like squashing bug.",
            },
            {
              phase: "Round 2 - Challenge",
              duration: "90 seconds",
              coachPosition: "Center",
              script: "Add competition: 'Slowest to stop does 3 jumping jacks!' Makes RED stops more urgent.",
            },
            {
              phase: "Round 3 - Fun",
              duration: "60 seconds",
              coachPosition: "Center",
              script: "Mix it up: Reverse mode, trick calls ('Red... Red... RED!'), whisper colors. End with celebration.",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            tooEasy: {
              symptoms: ["Perfect stops instantly", "Players bored", "Asking for more"],
              solutions: ["Faster calls", "Add reverse", "Whisper commands", "Weak foot requirement"],
            },
            tooHard: {
              symptoms: ["Constant rolling balls", "Confusion", "Frustration"],
              solutions: ["Slower calls", "Only 2 colors", "Let balls stop naturally first"],
            },
          },
          playerBehavior: {
            notListening: {
              symptoms: ["Missing color calls", "Delayed responses", "Doing own thing"],
              approach: "Move closer to them. Use their name before color: 'Marcus, ready? GREEN!' Praise when they respond.",
            },
            showingOff: {
              symptoms: ["Excessive speed", "Crashes into others", "Ignoring control"],
              approach: "Challenge: 'Can you go fast AND stop perfectly?' Channel energy into precision.",
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Ball Control at Speed",
              domain: "Technical",
              howItDevelops: "Players learn to modulate touch weight based on desired speed - foundation for all dribbling.",
              levelIndicators: {
                1: "Same speed regardless of command; can't control at speed",
                2: "Clear difference between fast/slow; ball escapes at high speed",
                3: "Three distinct speeds; maintains control at each",
                4: "Smooth transitions between speeds; always in control",
                5: "Instant speed changes; can add moves while changing speed",
              },
            },
            {
              skill: "Stopping the Ball",
              domain: "Technical",
              howItDevelops: "Clean stops with sole are fundamental - used before passes, shots, and direction changes.",
              levelIndicators: {
                1: "Ball rolls away on stop attempts",
                2: "Eventually stops but takes time",
                3: "Clean stops most of the time",
                4: "Instant stops from any speed",
                5: "Stops and immediately ready for next action",
              },
            },
          ],
          secondarySkills: [
            {
              skill: "Listening/Focus",
              domain: "Psychological",
              howItDevelops: "Must maintain focus to hear and respond to commands - builds concentration.",
            },
          ],
          physicalDevelopment: {
            speedControl: "Varying running speeds while dribbling",
            balance: "Stopping quickly requires good balance",
          },
          psychologicalDevelopment: {
            focus: "Sustained attention to hear commands",
            selfRegulation: "Controlling impulse to always go fast",
          },
        },

        developmentalContext: {
          whyThisActivity: "Traffic Lights teaches the most basic ball control skill: stopping the ball cleanly. This is required before passing, shooting, or changing direction. The game format makes repetitive practice fun and engaging.",
          whenToUseIt: {
            idealFor: [
              "Very beginning of practice (first warm-up)",
              "Younger or newer players (simple rules)",
              "Teaching ball control basics",
              "Large groups (everyone active)",
            ],
            avoidWhen: [
              "Players have mastered stopping (too easy)",
              "Very small space (need room to run)",
              "After high-energy games (too calm)",
            ],
          },
          progressionPath: {
            before: [
              { activity: "Ball Mastery Circle", reason: "Static ball touches before moving" },
            ],
            after: [
              { activity: "Gates Dribbling", reason: "Adds direction and obstacles" },
              { activity: "Shark Attack", reason: "Adds defensive pressure" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Pure fun, celebrate every stop",
              keyPhrases: ["Squash the bug!", "Freeze like a statue!", "Cheetah... turtle..."],
              duration: "4-5 minutes max",
              simplifications: ["Only 2 colors", "Visual aids", "Slow pace"],
            },
            "ages9to11": {
              approach: "Add complexity and competition",
              keyPhrases: ["Control the ball, control the game", "Quick feet, soft touch"],
              challenges: ["All 3 colors + reverse", "Whisper mode", "Weak foot rounds"],
            },
          },
        },

        parentCommunication: {
          ifAsked: "Traffic Lights teaches your child to control the ball at different speeds and stop it cleanly - these are the most basic dribbling skills that everything else builds on.",
          newsletter: "This week: Traffic Lights! We practiced dribbling at different speeds and stopping the ball with the sole of our foot. At home, play together - call out colors while they dribble!",
          whatToWatchFor: [
            "Can they stop the ball without it rolling away?",
            "Do they change speeds on command?",
            "Are they listening and responding quickly?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions during GREEN", prevention: "Emphasize 'explore the space' not 'race each other'", response: "Check players, remind about heads up and spacing" },
          ],
          inclusionConsiderations: {
            hearingDifficulties: "Use visual aids (colored cones/cards) in addition to verbal commands",
            motorDelays: "Allow more time to respond, celebrate any attempt to change speed",
          },
        },

        coachReflection: {
          afterActivity: [
            "Could all players stop the ball by the end?",
            "Did I vary the pace appropriately?",
            "Did I make it fun (tricks, whispers, etc.)?",
          ],
          forImprovement: [
            "What additional challenges could I add next time?",
            "Who might need extra practice with stopping?",
          ],
        },
      },
    },
  ];

  // Insert activities
  for (const activity of comprehensiveActivities) {
    await db.insert(activities).values(activity).onConflictDoNothing();
    console.log(`  ✓ ${activity.name}`);
  }

  console.log(`\nSeeded ${comprehensiveActivities.length} comprehensive activities`);
}

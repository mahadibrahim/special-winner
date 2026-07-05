// Soccer activities: v2 canonical (print-ready, comprehensive-guide-bearing)
// plus gen-1 fill, deduped by slug.
//
// Sources (reference only, .superpowers/curriculum-recovery/seeds/):
//   - curriculum-v2__soccer-fundamentals-activities.ts    (2 v2 activities)
//   - curriculum-v2__soccer-fundamentals-activities-2.ts  (3 v2 activities)
//   - curriculum-v2__soccer-skill-building-activities.ts  (4 v2 activities)
//   - activities-soccer.ts                                (49 gen-1 activities)
// Skipped per plan: activities-soccer-enhanced.ts, activities-comprehensive-example.ts
// (orphaned drafts).
//
// Dedupe rule: v2 wins on slug collision. The v2 seed suffixed every activity's
// slug with "-v2" (a batch-versioning convention, not meaningful content). Where
// stripping that suffix reveals a slug already used by a gen-1 activity, the v2
// content is kept under the CLEAN slug and the gen-1 duplicate is dropped:
//
//   consolidation: shark-attack        <- shark-attack-v2        (gen-1 "shark-attack" dropped)
//   consolidation: traffic-lights      <- traffic-lights-v2      (gen-1 "traffic-lights" dropped)
//   consolidation: ball-mastery-circle <- ball-mastery-circle-v2 (gen-1 "ball-mastery-circle" dropped)
//   consolidation: gates-dribbling     <- gates-dribbling-v2     (gen-1 "gates-dribbling" dropped)
//   consolidation: 1v1-to-goal         <- 1v1-to-goal-v2         (gen-1 "1v1-to-goal" dropped)
//
// The other 4 v2 activities keep their "-v2"-suffixed slugs verbatim (world-cup-v2,
// passing-combinations-v2, rondo-4v1-v2, small-sided-game-5v5-v2) because no gen-1
// activity occupies the clean form -- there is no collision to resolve, so the slug
// is transcribed as authored rather than invented.
//
// skillsDeveloped (top-level, skill-slug array): none of the six source files set
// this DB column directly. The v2 files' comprehensiveGuide.skillConnections.
// {primarySkills,secondarySkills}[].skill fields name a skill in prose (e.g.
// "Dribbling Under Pressure", "Ball Control"); these are resolved to Task 3's
// 34-slug soccer skill catalog by exact case-insensitive name match only (never
// invented/approximated). The following skill-connection names had NO exact match
// in the catalog and were dropped from skillsDeveloped (their prose stays intact,
// unchanged, inside comprehensiveGuide.skillConnections -- only the top-level
// skillsDeveloped derivation excludes them):
//   1v1 Attacking, Applying Technical Skills Under Pressure, Awareness / Scanning,
//   Ball Control at Speed, Ball Familiarity, Body Positioning / Orientation, Change of Direction,
//   Communication, Decision Making, Decision Making in Possession, Defending in Small Spaces,
//   Dribbling Under Pressure, Dribbling in Traffic, Dribbling with Head Up, Finishing Under Pressure,
//   Footwork / Coordination, Game Intelligence / Decision Making, Inside Foot Touch, Listening/Focus,
//   Off-Ball Movement, Passing Accuracy & Weight, Passing Under Pressure,
//   Positioning / Finding Space, Sole Control, Spatial Awareness, Stopping the Ball,
//   Support Play / Angles, Tackling Technique, Tactical Awareness / Positioning, Transition Play,
//   Wall Pass Execution
//
// Type note: ActivityContent (src/lib/curriculum/content/types.ts) was extended
// with three optional fields present in the v2/gen-1 source rows and already on the
// activities DB schema (src/lib/db/schema/practice-planning.ts): `diagram?: string`
// (ASCII-art setup diagram, only on some v2 activities), `featured?: boolean`, and
// `description?: string` (top-level activities.description column; all 53 activities
// below carry one, extracted verbatim from source -- for the 5 clean-slug collision
// winners, the V2 description is used, per the dedupe rule above).
// Mirrors the Task 3 precedent of extending DomainContent/StageContent for full
// reference-row fidelity.

import type { ActivityContent } from "../types";

export const SOCCER_ACTIVITIES: ActivityContent[] = [
  {
    slug: "shark-attack",
    name: "Shark Attack",
    description: "High-energy dribbling game where players protect their balls from 'sharks' who try to kick them out. Develops dribbling under pressure, awareness, and shielding in a fun, game-like environment.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 7,
    skillsDeveloped: ["ball-control"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player (except sharks)\n□ 4 cones for corners (bright colors)\n□ 2-3 pinnies for sharks\n\nSPACE: 20x20 paces (adjust based on numbers)\n\nSETUP STEPS\n1. Place 4 cones in a square, 20 paces apart\n2. Give every player a ball EXCEPT 1-2 sharks\n3. Sharks wear pinnies (1 shark per 5-6 dribblers)\n4. All dribblers start inside the grid with balls\n\nDIAGRAM\n┌────────────────────────────┐\n│  ▲                     ▲   │\n│     ○   ○                  │\n│         ●(shark)   ○       │  20 paces\n│     ○        ○    ○        │\n│  ▲                     ▲   │\n└────────────────────────────┘\n       20 paces\n▲=cone  ○=dribbler with ball  ●=shark (pinnie, no ball)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid\n\nSAY: "Everyone grab a ball and come into the square! Spread out - find your own space!"\n\nPick sharks: "Marcus and Lily, can you come help me? You\'re going to be our hungry sharks!"\nGive sharks pinnies, take their balls.\n\nSAY: "This is SHARK ATTACK! Dribblers - your job is to dribble around and PROTECT your ball from the sharks. Sharks - your job is to kick balls OUT of the square. Not steal them - kick them OUT!"\n\nSAY: "Dribblers - if your ball gets kicked out, do 5 toe taps on a ball outside, then come right back in. Questions? Let\'s GO!"\n\n\nPHASE 2: ROUND 1 (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Outside grid, moving around perimeter\n\nSAY: "Sharks, show me your mean shark faces! Dribblers, protect your ball! Ready... SHARKS ARE HUNGRY!"\n\nDURING PLAY - What to Watch For:\n□ Are dribblers looking up to see sharks?\n□ Are they using their body to shield?\n□ Are sharks being active (not standing)?\n\nPHRASES TO USE:\n• "Great escape!"\n• "Sharks, find the sleepy fish!"\n• "Head up - where\'s the shark?"\n• "Nice shielding!"\n\nWhen ball goes out: Point to toe tap area, "5 toe taps, back in!"\n\nCOUNTDOWN: "One minute left!... 10 seconds!... FREEZE!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid, all players frozen\n\nSAY: "Everyone freeze! Dribblers - point to where the sharks are RIGHT NOW."\nWatch: Can they find them without searching?\n\nASK: "What helped you keep your ball safe?"\nListen for: "Moving away," "Shielding," "Looking up"\n\nTEACH ONE THING:\nSAY: "I noticed some of you putting your body between the shark and the ball - like THIS."\nDemo: Quick shield demonstration\nSAY: "That\'s BRILLIANT. Try that this round. GO!"\n\n\nPHASE 4: ROUND 2 (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Sharks - how many balls can you kick out? Let\'s count!"\n\nReinforce teaching point:\n• When you see shielding: "YES! Body between shark and ball!"\n• When you see no shielding: "Turn your body - protect it!"\n\nEND: "FREEZE! Sharks, how many? Nice work!"\n\n\nPHASE 5: ROUND 3 + WRAP UP (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSWITCH SHARKS: "New sharks! Who hasn\'t been a shark yet?"\nTrade pinnies, run 45-second round.\n\nWRAP UP (15 seconds):\nSAY: "Great work! I saw great shielding and heads up looking for sharks. Water break, then we\'re moving to [next activity]."',
    diagram:
      "┌────────────────────────────┐\n│  ▲                     ▲   │\n│     ○   ○                  │\n│         ●(shark)   ○       │  20x20 paces\n│     ○        ○    ○        │\n│  ▲                     ▲   │\n└────────────────────────────┘",
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
      {
        name: "Freeze Sharks",
        description:
          "When coach yells 'FREEZE!' everyone stops. Last moving becomes shark.",
        difficulty: "beginner",
      },
      {
        name: "Ball Thief",
        description:
          "Sharks steal and dribble instead of kicking out. More 1v1 battles.",
        difficulty: "intermediate",
      },
      {
        name: "Shark Jail",
        description: "If caught, you become a shark too. Last dribbler wins!",
        difficulty: "intermediate",
      },
      {
        name: "Superhero Rescue",
        description:
          "Player with ball can 'rescue' frozen teammate by passing to them.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Most balls knocked out within 30 seconds\n• Players looking frustrated, not smiling\n• No one can escape sharks\n\nSOLUTIONS:\n• Make grid bigger (25x25 paces)\n• Fewer sharks (1 shark per 6-7 dribblers)\n• Sharks must hop instead of run\n• Allow 3 toe taps instead of 5\n• \"Safe zones\" in corners (can't be tagged for 3 seconds)",
    makeHarder:
      'SIGNS THEY\'RE READY:\n• Dribblers easily escaping sharks\n• Players looking bored or asking "what\'s next?"\n• Sharks can\'t catch anyone\n\nSOLUTIONS:\n• Make grid smaller (15x15 paces)\n• More sharks (1 shark per 4 dribblers)\n• Dribblers must stay moving (no standing)\n• Weak foot only for dribbling\n• Add "super shark" who can use hands to block',
    equipmentNeeded: ["1 ball per player", "4 cones", "2-3 pinnies"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "warmup",
      "dribbling",
      "awareness",
      "shielding",
      "high-energy",
      "fun",
      "no-lines",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Dribblers protect balls from sharks who kick them out; develops dribbling under pressure and awareness.",
        keyPhrases: [
          "Can you dribble AND see the shark?",
          "Body between shark and ball!",
          "Tiny touches - short leash!",
        ],
        setupDiagram:
          "20x20 pace grid, 4 corner cones, 1 shark per 5-6 dribblers with pinnies",
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
          mindset:
            "This is a HIGH ENERGY warmup. Your enthusiasm sets the tone. Be loud, move around, celebrate effort. Goal: players moving and smiling.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center of grid",
            script:
              "SAY: 'Everyone grab a ball and come into the square!' Pick sharks, give pinnies, explain rules: sharks kick balls OUT, dribblers protect and do 5 toe taps if caught.",
            anticipatedResponses: {
              "Kids arguing about who's shark":
                "Everyone will get a turn! Let's start with volunteers.",
              "Not enough balls":
                "Share with a partner - you'll both dribble soon.",
              "Kids already kicking wildly":
                "Freeze! Balls under feet, eyes on me.",
            },
          },
          {
            phase: "Round 1",
            duration: "2 minutes",
            coachPosition: "Outside grid, moving around",
            script:
              "SAY: 'Sharks, mean faces! Dribblers, protect! SHARKS ARE HUNGRY!' Watch for: heads up, shielding, shark activity. Encourage constantly.",
            troubleshooting: {
              "Sharks can't catch anyone": [
                "Add shark",
                "Make grid smaller",
                "No standing still for dribblers",
              ],
              "Balls out instantly": [
                "Remove shark",
                "Make grid bigger",
                "Sharks must hop",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone frozen",
            script:
              "SAY: 'Freeze! Point to sharks.' ASK: 'What helped keep your ball safe?' TEACH: Demo shielding - body between shark and ball.",
          },
          {
            phase: "Round 2",
            duration: "90 seconds",
            coachPosition: "Outside grid",
            script:
              "SAY: 'Sharks, how many can you get? Let's count!' Reinforce shielding. End with freeze and count.",
          },
          {
            phase: "Round 3 & Wrap",
            duration: "90 seconds",
            coachPosition: "Outside grid",
            script:
              "Switch sharks. Run 45-second round. WRAP: 'Great shielding and awareness! Water break.'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          sharksTooStrong: {
            symptoms: [
              "Most balls out in 30 seconds",
              "Frustrated dribblers",
              "No one escapes",
            ],
            solutions: [
              "Remove a shark",
              "Bigger grid (25x25)",
              "Sharks hop",
              "Add safe zone corners",
            ],
          },
          sharksTooWeak: {
            symptoms: [
              "No balls kicked out",
              "Frustrated sharks",
              "Dribblers cruising",
            ],
            solutions: [
              "Add a shark",
              "Smaller grid (15x15)",
              "No standing still",
              "Weak foot only",
            ],
          },
        },
        playerBehavior: {
          notParticipating: {
            symptoms: [
              "Standing at edge",
              "Not moving with ball",
              "Disengaged",
            ],
            approach:
              "Privately ask: 'Everything okay?' Offer alternative role: 'Help me count catches?' Wait it out - often join after watching.",
          },
          overlyAggressive: {
            symptoms: [
              "Pushing players",
              "Slide tackling",
              "Going for player not ball",
            ],
            approach:
              "IMMEDIATE pause if dangerous. SAY: 'We go for BALL, not person.' If continues: 'Take 1-minute break.'",
          },
          frustrated: {
            symptoms: ["Kicking ball in anger", "Saying 'I can't'", "Tears"],
            approach:
              "Quick private word. Offer easier role. Normalize: 'Everyone finds this hard.'",
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
            solutions: [
              "Odd player counts catches",
              "Permanent shark",
              "Uneven groups (5v1 and 6v1)",
            ],
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling Under Pressure",
            domain: "Technical",
            howItDevelops:
              "Players control ball while evading active defenders, replicating game pressure in fun context.",
            levelIndicators: {
              1: "Ball frequently kicked away; can't escape sharks",
              2: "Sometimes escapes but no shielding; reactive not proactive",
              3: "Uses body to shield; looks up occasionally; survives most rounds",
              4: "Proactively avoids sharks; uses direction changes; rarely caught",
              5: "Beats sharks easily; helps teammates; could coach others",
            },
            assessmentNotes:
              "Watch across multiple rounds. Early performance may not reflect true ability as they learn the game.",
          },
          {
            skill: "Awareness / Scanning",
            domain: "Tactical",
            howItDevelops:
              "Must know where sharks are to avoid them. Builds habit of looking up while dribbling.",
            levelIndicators: {
              1: "Only looks at ball; surprised when caught",
              2: "Occasional glances up; reactive to sharks",
              3: "Regularly looks up; knows where 1 shark is",
              4: "Scans continuously; knows where multiple sharks are",
              5: "Always aware; makes decisions before shark arrives",
            },
            assessmentNotes:
              "Ask 'point to sharks' while frozen. Their accuracy reveals awareness level.",
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
            howItDevelops:
              "Evading sharks requires quick turns and direction changes.",
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
        whyThisActivity:
          "Shark Attack develops dribbling under pressure in game-like context WITHOUT team tactical complexity. Players focus on: controlling ball, avoiding pressure, recovering from failure. This mirrors receiving ball in games when defender closes down.",
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
            {
              activity: "Traffic Lights",
              reason: "Ball control at speeds without defenders",
            },
            {
              activity: "Gates Dribbling",
              reason: "Dribbling through spaces without pressure",
            },
          ],
          after: [
            {
              activity: "1v1 to Goal",
              reason: "Dribbling under pressure with scoring",
            },
            {
              activity: "3v3 to Small Goals",
              reason: "Applies skills in team context",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Maximum fun, minimum correction",
            keyPhrases: [
              "Be a sneaky fish!",
              "Hide your ball!",
              "Sharks are coming!",
            ],
            avoidSaying: [
              "You need to shield better (too abstract)",
              "Scan the field",
            ],
            duration: "5 minutes max",
            simplifications: ["Bigger grid", "Fewer sharks", "No weak foot"],
          },
          ages9to11: {
            approach: "Introduce technique, maintain fun",
            keyPhrases: ["Body position!", "Small touches!", "Eyes up!"],
            challenges: ["Weak foot rounds", "Must use a move to escape"],
            duration: "7-8 minutes with teaching",
          },
          ages12to14: {
            approach: "Game realism, player-led",
            keyPhrases: [
              "When do you see this in games?",
              "What technique helps?",
            ],
            challenges: [
              "Smaller grid",
              "Communicating sharks",
              "Points for assists",
            ],
            coachRole: "Facilitate discussion about game application",
          },
        },
        commonMisconceptions: {
          "Just a game, not real training":
            "This IS training - game-like pressure transfers to matches better than drills.",
          "Weaker players always lose":
            "Design so everyone succeeds: enough sharks that weak aren't targeted, celebrate longest survivor.",
          "Not learning technique":
            "Learning to APPLY technique under pressure is harder than isolated technique.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We play Shark Attack because it develops dribbling under pressure in a fun, game-like context. Your child learns to control the ball while someone tries to take it - exactly what happens in games.",
        newsletter:
          "This week: Shark Attack! This game teaches ball control under pressure. Watch for your child using their body to 'shield' the ball at home or in games!",
        whatToWatchFor: [
          "Does your child protect ball with their body? (shielding)",
          "Do they look up while dribbling? (awareness)",
          "Can they change direction quickly? (agility)",
          "Do they keep ball close to feet? (control)",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Player collisions",
            prevention: "Emphasize 'heads up', adequate space",
            response: "Check both players, pause to reinforce awareness",
          },
          {
            risk: "Slide tackling",
            prevention: "State 'no sliding' before game",
            response: "Immediate stop, reminder, repeat = sit out",
          },
          {
            risk: "Ball to face",
            prevention: "Sharks kick LOW toward feet",
            response: "Check player, ice if needed, remind about safe kicks",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Pair faster dribblers with slower sharks, or give immunity for first 30 seconds",
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
  {
    slug: "traffic-lights",
    name: "Traffic Lights",
    description: "Dribbling game where players respond to color commands. Red=stop, Yellow=slow, Green=fast. Develops listening skills, ball control at different speeds, and the foundational ability to stop a ball on command.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 30,
    durationMinutes: 5,
    skillsDeveloped: ["ball-control", "dribbling"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ 4 cones for corners (optional but helpful)\n□ Optional: colored cones/cards (red, yellow, green) as visual aids\n\nSPACE: As large as available (minimum 20x25 paces)\n\nSETUP STEPS\n1. Players spread out in large area\n2. Every player has ball at feet\n3. Coach stands where everyone can see/hear\n\nDIAGRAM\n┌─────────────────────────────────┐\n│                                 │\n│    ○    ○    ○    ○    ○       │\n│                                 │  20+ paces\n│    ○    ○   COACH  ○    ○      │\n│                                 │\n│    ○    ○    ○    ○    ○       │\n└─────────────────────────────────┘\n       25+ paces",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (40 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone grab a ball and find your own space - spread out so you can\'t touch anyone!"\n\nSAY: "We\'re playing Traffic Lights! When I say GREEN, dribble as fast as you can control. When I say YELLOW, super slow motion! When I say RED, stop your ball completely with the bottom of your foot."\n\nDEMO: "Watch me - GREEN (fast dribble)... YELLOW (slow)... RED (stop with sole). Your turn!"\n\n\nPHASE 2: ROUND 1 - BASIC (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Find a space... GREEN!"\n\nCall colors randomly:\n• GREEN: Hold 5-8 seconds\n• YELLOW: Hold 3-5 seconds\n• RED: Hold 3-4 seconds (check clean stops)\n\nWATCH FOR:\n□ Quick response to commands?\n□ Ball stopping without rolling away?\n□ Different speeds for green vs yellow?\n\nPRAISE: "Great stop!" "Love that speed!" "Nice slow control!"\n\n\nPHASE 3: COACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Freeze on red! Show me how you stopped. What part of your foot?"\n\nWait for: "Bottom" / "Sole"\n\nSAY: "Right - your SOLE! Like squashing a bug. Let\'s go again!"\n\n\nPHASE 4: ROUND 2 - ADD CHALLENGE (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same game, but now on RED, see how FAST you can freeze. Slowest person does 3 jumping jacks! Ready... GREEN!"\n\n\nPHASE 5: ROUND 3 - MIX IT UP (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOptions:\n• "REVERSE!" - Green means stop, Red means go\n• "Red light... Red light... RED LIGHT!" (trick them)\n• Whisper colors so they must really listen\n\nWRAP UP: "Great listening! Who can tell me which foot part stops the ball? Water break!"',
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
      {
        name: "Add Orange/Amber",
        description: "Orange = medium speed. Now 4 speeds to control.",
        difficulty: "beginner",
      },
      {
        name: "Traffic Cop",
        description:
          "Player becomes traffic cop, calls colors. Rotate every 30 seconds.",
        difficulty: "beginner",
      },
      {
        name: "Body Part Stop",
        description: "On RED, call body part (knee, elbow) to touch ball.",
        difficulty: "intermediate",
      },
      {
        name: "Direction Colors",
        description: "BLUE = turn left, ORANGE = turn right while moving.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Most can't stop on red\n• Confusion about colors\n• Collisions from lack of control\n\nSOLUTIONS:\n• Slow down color calls\n• Only green and red first (add yellow later)\n• Let ball stop naturally (don't require sole)\n• More time between calls",
    makeHarder:
      'SIGNS THEY\'RE READY:\n• Instant responses\n• Perfect stops every time\n• Asking "what else?"\n\nSOLUTIONS:\n• Call colors faster\n• Whisper colors\n• Add reverse mode\n• Weak foot only on yellow\n• Add movements (jumping jacks on red)',
    equipmentNeeded: ["1 ball per player", "4 cones (optional)"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: [
      "warmup",
      "dribbling",
      "listening",
      "ball-control",
      "beginner-friendly",
      "no-lines",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Color commands control dribbling speed - RED=stop, YELLOW=slow, GREEN=fast - develops listening and ball control.",
        keyPhrases: [
          "Squash the ball like a bug!",
          "Green is cheetah, Yellow is turtle!",
          "Ears open, eyes up!",
        ],
        setupDiagram:
          "Large open space, 1 ball per player, everyone spread out",
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
          mindset:
            "This is about LISTENING and CONTROL. Your voice is the main tool - vary volume, speed, and add playfulness (whispers, tricks). Celebrate the stops!",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "40 seconds",
            coachPosition: "Center where all can see",
            script:
              "SAY: 'Find your own space!' Explain: GREEN=fast, YELLOW=slow, RED=stop with sole. Demo each briefly.",
            anticipatedResponses: {
              "What if I forget the colors?":
                "Just watch what others do and you'll remember!",
              "Can I go really really fast?":
                "As fast as you can CONTROL the ball!",
            },
          },
          {
            phase: "Round 1 - Basic",
            duration: "90 seconds",
            coachPosition: "Center, visible to all",
            script:
              "Call colors randomly. GREEN 5-8 sec, YELLOW 3-5 sec, RED 3-4 sec. Praise good stops and speed control.",
            troubleshooting: {
              "Can't stop on RED": [
                "Give more warning",
                "Slower approach speed",
                "Don't require sole yet",
              ],
              "Same speed all colors": [
                "Exaggerate demos",
                "Use animal comparisons",
                "Side-by-side race",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "FREEZE! 'Show me how you stopped. What part of foot?' Teach: SOLE = bottom, like squashing bug.",
          },
          {
            phase: "Round 2 - Challenge",
            duration: "90 seconds",
            coachPosition: "Center",
            script:
              "Add competition: 'Slowest to stop does 3 jumping jacks!' Makes RED stops more urgent.",
          },
          {
            phase: "Round 3 - Fun",
            duration: "60 seconds",
            coachPosition: "Center",
            script:
              "Mix it up: Reverse mode, trick calls ('Red... Red... RED!'), whisper colors. End with celebration.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Perfect stops instantly",
              "Players bored",
              "Asking for more",
            ],
            solutions: [
              "Faster calls",
              "Add reverse",
              "Whisper commands",
              "Weak foot requirement",
            ],
          },
          tooHard: {
            symptoms: ["Constant rolling balls", "Confusion", "Frustration"],
            solutions: [
              "Slower calls",
              "Only 2 colors",
              "Let balls stop naturally first",
            ],
          },
        },
        playerBehavior: {
          notListening: {
            symptoms: [
              "Missing color calls",
              "Delayed responses",
              "Doing own thing",
            ],
            approach:
              "Move closer to them. Use their name before color: 'Marcus, ready? GREEN!' Praise when they respond.",
          },
          showingOff: {
            symptoms: [
              "Excessive speed",
              "Crashes into others",
              "Ignoring control",
            ],
            approach:
              "Challenge: 'Can you go fast AND stop perfectly?' Channel energy into precision.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Ball Control at Speed",
            domain: "Technical",
            howItDevelops:
              "Players learn to modulate touch weight based on desired speed - foundation for all dribbling.",
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
            howItDevelops:
              "Clean stops with sole are fundamental - used before passes, shots, and direction changes.",
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
            howItDevelops:
              "Must maintain focus to hear and respond to commands - builds concentration.",
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
        whyThisActivity:
          "Traffic Lights teaches the most basic ball control skill: stopping the ball cleanly. This is required before passing, shooting, or changing direction. The game format makes repetitive practice fun and engaging.",
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
            {
              activity: "Ball Mastery Circle",
              reason: "Static ball touches before moving",
            },
          ],
          after: [
            {
              activity: "Gates Dribbling",
              reason: "Adds direction and obstacles",
            },
            {
              activity: "Shark Attack",
              reason: "Adds defensive pressure",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Pure fun, celebrate every stop",
            keyPhrases: [
              "Squash the bug!",
              "Freeze like a statue!",
              "Cheetah... turtle...",
            ],
            duration: "4-5 minutes max",
            simplifications: ["Only 2 colors", "Visual aids", "Slow pace"],
          },
          ages9to11: {
            approach: "Add complexity and competition",
            keyPhrases: [
              "Control the ball, control the game",
              "Quick feet, soft touch",
            ],
            challenges: [
              "All 3 colors + reverse",
              "Whisper mode",
              "Weak foot rounds",
            ],
          },
        },
      },
      parentCommunication: {
        ifAsked:
          "Traffic Lights teaches your child to control the ball at different speeds and stop it cleanly - these are the most basic dribbling skills that everything else builds on.",
        newsletter:
          "This week: Traffic Lights! We practiced dribbling at different speeds and stopping the ball with the sole of our foot. At home, play together - call out colors while they dribble!",
        whatToWatchFor: [
          "Can they stop the ball without it rolling away?",
          "Do they change speeds on command?",
          "Are they listening and responding quickly?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions during GREEN",
            prevention: "Emphasize 'explore the space' not 'race each other'",
            response: "Check players, remind about heads up and spacing",
          },
        ],
        inclusionConsiderations: {
          hearingDifficulties:
            "Use visual aids (colored cones/cards) in addition to verbal commands",
          motorDelays:
            "Allow more time to respond, celebrate any attempt to change speed",
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
  {
    slug: "ball-mastery-circle",
    name: "Ball Mastery Circle",
    description: "Players form a circle around the coach who demonstrates ball mastery moves. Everyone practices together, building foundational touches and footwork in a supportive, follow-the-leader format.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 8,
    skillsDeveloped: ["ball-mastery-toe-taps", "ball-control", "agility-coordination"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ Optional: 1 cone to mark coach spot\n\nSPACE: Open area large enough for circle (8-12 paces diameter)\n\nSETUP STEPS\n1. Coach stands in center with ball\n2. Players form circle around coach (2 arm lengths apart)\n3. Each player has ball at feet\n4. Everyone can see coach clearly\n\nDIAGRAM\n              ○\n          ○       ○\n        ○           ○\n            COACH\n        ○     ●     ○\n          ○       ○\n              ○\n\n○ = player with ball (circle formation)\n● = coach in center with ball",
    howToPlay:
      'PHASE 1: GATHER & SETUP (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of area\n\nSAY: "Everyone grab a ball and make a big circle around me! Make sure you can stretch your arms without touching your neighbor!"\n\nWait for circle to form.\n\nSAY: "Perfect! Ball at your feet, eyes on me. We\'re going to learn some cool moves together. Watch first, then copy!"\n\n\nPHASE 2: TOE TAPS (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "First move - TOE TAPS! Watch..."\n\nDEMO: Alternate tapping top of ball with each foot, ball stays still.\n\nSAY: "See how the ball doesn\'t move? Light touches on top. Your turn - GO!"\n\nCount out loud: "1-2-1-2-1-2..." for 15-20 taps.\n\nPRAISE: "Great rhythm!" "Light touches!" "Ball not moving - perfect!"\n\nVARIATION: "Can you go faster? Speed it up!"\n\nThen: "FREEZE! Shake out your legs."\n\n\nPHASE 3: SOLE ROLLS (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Next move - SOLE ROLLS! Watch..."\n\nDEMO: Roll ball forward and back with sole of one foot.\n\nSAY: "Use the bottom of your foot - roll it out, pull it back. Like you\'re petting a dog. GO!"\n\nLet them practice 15 seconds.\n\nSAY: "Switch feet!" Practice other foot.\n\nPRAISE: "Nice control!" "Smooth rolling!" "Great balance!"\n\nVARIATION: "Now side to side! Roll it left, roll it right!"\n\nThen: "FREEZE! Other foot shake."\n\n\nPHASE 4: TICK-TOCKS (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This one is called TICK-TOCK - like a clock! Watch..."\n\nDEMO: Tap ball gently side to side with inside of each foot.\n\nSAY: "Inside of foot, back and forth. The ball goes tick... tock... tick... tock. GO!"\n\nHelp with rhythm: "Tick... tock... tick... tock..."\n\nPRAISE: "Great rhythm!" "Nice soft touches!" "Like a clock!"\n\nVARIATION: "Can you make the tick-tock bigger? Wider steps!"\n\n\nPHASE 5: CIRCLES (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Last move - CIRCLES! Watch..."\n\nDEMO: Use sole to roll ball in a circle around standing foot.\n\nSAY: "Keep your other foot planted. Roll the ball all the way around it. GO!"\n\nLet them try. This is harder!\n\nSAY: "Other direction now! Reverse circle!"\n\nPRAISE: "That\'s tricky! Great try!" "You got it!" "Beautiful circles!"\n\n\nPHASE 6: COMBO CHALLENGE & WRAP (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Now the challenge - can you do them in order when I call them out?"\n\nCall out: "Toe taps!... Sole rolls!... Tick-tocks!... Circles!"\n\nIncrease speed of calls.\n\nWRAP UP: "Amazing footwork! Those moves help you control the ball better in games. Which was your favorite? Practice that one at home!"',
    diagram:
      "              ○\n          ○       ○\n        ○           ○\n            COACH\n        ○     ●     ○\n          ○       ○\n              ○",
    coachingPoints: [
      "LIGHT TOUCHES → Say: 'Touch the ball like it's a balloon - too hard and it pops!'",
      "BALL STAYS STILL → Say: 'The ball should stay in your space, not roll away!'",
      "BALANCE ON STANDING FOOT → Say: 'Strong tree trunk leg! The other foot dances!'",
      "EYES UP OCCASIONALLY → Say: 'Can you do it without looking? Sneaky feet!'",
    ],
    questionsToAsk: [
      "'Which foot feels easier?' → Develops awareness of dominant foot",
      "'What part of your foot touches for toe taps?' → Top of foot / laces",
      "'Can you do tick-tocks with your eyes closed?' → Challenge and body awareness",
      "'Where do you think you'd use these moves in a game?' → Connect to real soccer",
    ],
    commonMistakes: [
      "BALL ROLLING AWAY → Say: 'Softer touch! Pretend the ball is a sleeping baby'",
      "LOSING BALANCE → Say: 'Arms out like an airplane for balance!'",
      "WRONG FOOT SURFACE → Say: 'Let me see that part of your foot touch - yes! The bottom!'",
      "GOING TOO FAST → Say: 'Slow is smooth, smooth is fast. Start slow, speed up later!'",
    ],
    variations: [
      {
        name: "Mirror Partners",
        description:
          "Pair up - one leads, one copies. Switch every 30 seconds.",
        difficulty: "beginner",
      },
      {
        name: "Music Moves",
        description: "Play music - when it stops, freeze with ball under foot.",
        difficulty: "beginner",
      },
      {
        name: "Player Demo",
        description: "Ask a player to show their favorite move to the group.",
        difficulty: "beginner",
      },
      {
        name: "Combo Sequences",
        description: "Create patterns: 3 toe taps, 2 sole rolls, 4 tick-tocks.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Balls constantly rolling away\n• Falling off balance frequently\n• Frustrated expressions\n• Not keeping up with demos\n\nSOLUTIONS:\n• Slow down demonstrations significantly\n• Only teach 2 moves instead of 4\n• Allow ball to move a little (don't require stationary)\n• Let them sit on ball to practice balance first\n• Use larger, slightly deflated balls (easier control)",
    makeHarder:
      'SIGNS THEY\'RE READY:\n• Completing all moves perfectly\n• Looking bored\n• Asking "what else can we do?"\n• Finishing before others\n\nSOLUTIONS:\n• Speed up the moves\n• Add weak foot requirement\n• Eyes closed challenge\n• Combine moves into sequences\n• Add movement (circle while doing toe taps)\n• Player becomes demonstrator',
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: [
      "warmup",
      "ball-mastery",
      "footwork",
      "beginner-friendly",
      "no-lines",
      "technique",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Coach demonstrates ball mastery moves in center while players in circle copy - builds foundational touches and footwork.",
        keyPhrases: [
          "Light touches - like a balloon!",
          "Ball stays in your space!",
          "Slow is smooth, smooth is fast!",
        ],
        setupDiagram:
          "Circle formation around coach, 1 ball per player, 2 arm lengths apart",
        quickProgression: {
          easier: "Fewer moves, slower pace, allow ball movement",
          harder: "Faster pace, weak foot, eyes closed, combinations",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Practice the 4 moves yourself until smooth",
            "Ensure enough balls for all players",
            "Clear space for circle formation",
            "Plan order: toe taps → sole rolls → tick-tocks → circles",
          ],
          mindset:
            "This is TECHNICAL work disguised as follow-the-leader. Energy should be calm and focused. Your clear demonstrations are the key - make them obvious and slow. Celebrate effort, not perfection.",
        },
        segments: [
          {
            phase: "Gather & Setup",
            duration: "45 seconds",
            coachPosition: "Center of circle",
            script:
              "SAY: 'Make a big circle around me!' Wait for formation. 'Ball at feet, eyes on me. Watch first, then copy!'",
            anticipatedResponses: {
              "I already know these moves":
                "Great! Help me demonstrate. Can you show the others?",
              "This is hard":
                "That's perfect - hard means we're learning! Start slow.",
              "I can't do it": "Watch me again. Everyone starts somewhere!",
            },
            troubleshooting: {
              "Circle too tight": ["Step back two big steps everyone!"],
              "Can't see coach": [
                "Taller friends kneel, shorter friends stand",
              ],
            },
          },
          {
            phase: "Toe Taps",
            duration: "90 seconds",
            coachPosition: "Center, demonstrating",
            script:
              "Demo toe taps with ball still. SAY: 'Light touches on top, ball doesn't move.' Count rhythm: '1-2-1-2-1-2.' Add speed variation.",
            troubleshooting: {
              "Ball rolling forward": ["Softer touch! Just tap the very top."],
              "Only using one foot": ["Now the other foot! 1-2-1-2!"],
            },
          },
          {
            phase: "Sole Rolls",
            duration: "90 seconds",
            coachPosition: "Center, demonstrating",
            script:
              "Demo sole roll forward and back. SAY: 'Bottom of foot, like petting a dog.' Practice both feet. Add side-to-side variation.",
            troubleshooting: {
              "Using toe instead of sole": [
                "Show me the bottom of your foot - that part!",
              ],
              "Ball escaping": ["Smaller rolls! Keep it close."],
            },
          },
          {
            phase: "Tick-Tocks",
            duration: "90 seconds",
            coachPosition: "Center, demonstrating",
            script:
              "Demo tick-tock side to side. SAY: 'Inside of foot, like a clock - tick... tock...' Help with rhythm verbally.",
            troubleshooting: {
              "Ball going forward not side": [
                "Push sideways! Like a clock pendulum.",
              ],
              "No rhythm": ["Slow it down. Tick... wait... tock... wait..."],
            },
          },
          {
            phase: "Circles",
            duration: "60 seconds",
            coachPosition: "Center, demonstrating",
            script:
              "Demo circle around standing foot. SAY: 'Roll it all the way around your planted foot.' Try both directions. This is the hardest!",
            troubleshooting: {
              "Planted foot moving": [
                "Glue that foot down! Only the ball moves.",
              ],
              "Can't complete circle": [
                "Try half circles first. Half, then switch direction.",
              ],
            },
          },
          {
            phase: "Combo Challenge & Wrap",
            duration: "45 seconds",
            coachPosition: "Center",
            script:
              "Call out moves randomly, players execute. Speed up calls. End with 'Which was your favorite? Practice at home!'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Bored expressions",
              "Perfect execution",
              "Side conversations",
            ],
            solutions: [
              "Add speed",
              "Weak foot only",
              "Eyes closed",
              "Create sequences",
              "Let players demo",
            ],
          },
          tooHard: {
            symptoms: [
              "Constant ball loss",
              "Frustration",
              "Giving up",
              "Sitting down",
            ],
            solutions: [
              "Slow down",
              "Fewer moves",
              "Allow imperfect",
              "Pair struggling with successful player",
            ],
          },
        },
        playerBehavior: {
          notParticipating: {
            symptoms: [
              "Standing still",
              "Not attempting moves",
              "Looking elsewhere",
            ],
            approach:
              "Move next to them while continuing. Quietly say 'Just try with me.' Celebrate any attempt. If truly unwilling, let them watch - often they'll join after.",
          },
          showingOff: {
            symptoms: [
              "Adding unnecessary moves",
              "Going way too fast",
              "Distracting others",
            ],
            approach:
              "Channel it: 'You've got great skills! Can you help your neighbor who's struggling?' Or: 'Show me that move slower so everyone can learn.'",
          },
          frustrated: {
            symptoms: ["Kicking ball away", "Saying 'I can't'", "Tearing up"],
            approach:
              "Private moment: 'This is tricky! I'll tell you a secret - just do it slowly and it works.' Lower the challenge for them specifically.",
          },
        },
        environmentalIssues: {
          unevenSurface: {
            symptoms: ["Balls rolling unpredictably", "Can't keep ball still"],
            solution:
              "Find flattest area. Or acknowledge: 'This bumpy ground makes it extra challenging!'",
          },
          tooManyPlayers: {
            symptoms: [
              "Can't see coach",
              "Crowded circle",
              "Bumping neighbors",
            ],
            solution:
              "Split into 2 circles, assistant coaches one or experienced player leads second group.",
          },
          distractions: {
            symptoms: ["Players looking at other fields", "Not focused"],
            solution:
              "Move circle to face away from distractions. Increase energy and enthusiasm in your voice.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Ball Familiarity",
            domain: "Technical",
            howItDevelops:
              "Repeated touches with different foot surfaces builds comfort and control. Players learn how ball responds to different touches.",
            levelIndicators: {
              1: "Ball escapes frequently; uses only one foot surface",
              2: "Can maintain ball proximity; inconsistent surfaces",
              3: "Completes all moves with ball in control; uses multiple surfaces",
              4: "Smooth transitions between moves; comfortable with both feet",
              5: "Can perform moves at speed, eyes up, while moving",
            },
            assessmentNotes:
              "Watch progression across sessions, not single session. Look for increasing smoothness and confidence.",
          },
          {
            skill: "Footwork / Coordination",
            domain: "Technical",
            howItDevelops:
              "Alternating feet, using different surfaces, and balance challenges develop neuromuscular coordination fundamental to all soccer skills.",
            levelIndicators: {
              1: "Clumsy, loses balance, can't alternate feet smoothly",
              2: "Basic alternation possible but slow and deliberate",
              3: "Smooth footwork at moderate speed; maintains balance",
              4: "Quick, light footwork; stable throughout",
              5: "Effortless footwork; can add moves and complexity",
            },
            assessmentNotes:
              "Look at fluidity of movement, not just completion. Is it jerky or smooth?",
          },
        ],
        secondarySkills: [
          {
            skill: "Sole Control",
            domain: "Technical",
            howItDevelops:
              "Sole rolls specifically train this critical surface for trapping, turning, and ball manipulation.",
            levelIndicators: {
              1: "Can't maintain sole contact with moving ball",
              2: "Sole contact possible but loses ball frequently",
              3: "Consistent sole control for basic moves",
              4: "Confident sole use for rolls, turns, stops",
              5: "Uses sole creatively in game situations",
            },
          },
          {
            skill: "Inside Foot Touch",
            domain: "Technical",
            howItDevelops:
              "Tick-tocks develop the inside foot surface used for most passes and dribbling.",
          },
        ],
        physicalDevelopment: {
          balance: "Single-leg balance during sole rolls and circles",
          coordination: "Bilateral coordination alternating feet",
          proprioception: "Awareness of foot position without looking",
        },
        psychologicalDevelopment: {
          concentration: "Focus on coach demonstrations and execution",
          patience: "Slow, repetitive practice requires patience",
          selfAwareness:
            "Noticing which foot is stronger, what feels difficult",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Ball Mastery Circle builds the fundamental foot-ball relationship that underlies all technical skills. Before players can dribble past opponents, pass accurately, or shoot with power, they need comfortable, confident touches. This activity provides high repetition in a supportive, follow-along format where mistakes are invisible and everyone succeeds together.",
        whenToUseIt: {
          idealFor: [
            "Beginning of practice (technical warm-up)",
            "Young or new players (simple, supportive format)",
            "Building foundational technique",
            "When focus and calm are needed",
            "Teaching specific foot surfaces",
          ],
          avoidWhen: [
            "Players are high energy and need to run",
            "Very advanced players (too basic)",
            "Immediately after arrival (may need active warm-up first)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Free Dribbling",
              reason: "Get comfortable moving with ball first",
            },
          ],
          after: [
            {
              activity: "Traffic Lights",
              reason: "Apply touches while moving at different speeds",
            },
            {
              activity: "Gates Dribbling",
              reason: "Apply control through obstacles",
            },
            {
              activity: "Shark Attack",
              reason: "Apply control under pressure",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Fun, follow-along, celebrate all attempts",
            keyPhrases: [
              "Copy me!",
              "Light like a feather!",
              "Tickle the ball!",
            ],
            avoidSaying: ["You're doing it wrong", "Watch your technique"],
            duration: "6-8 minutes maximum",
            simplifications: [
              "Only 2-3 moves",
              "Very slow pace",
              "Lots of praise",
            ],
          },
          ages9to11: {
            approach: "Add precision and challenge",
            keyPhrases: [
              "Clean touches",
              "Both feet equal",
              "Can you feel the difference?",
            ],
            challenges: [
              "Weak foot focus",
              "Speed variations",
              "Eyes up challenge",
            ],
            duration: "8-10 minutes with progressions",
          },
          ages12to14: {
            approach: "Player-led, connect to game application",
            keyPhrases: [
              "When would you use this?",
              "What makes a touch 'good'?",
            ],
            challenges: [
              "Moving while performing",
              "Create your own sequences",
              "Teach younger players",
            ],
            coachRole: "Facilitate rather than demonstrate; let players lead",
          },
        },
        commonMisconceptions: {
          "This is boring for advanced players":
            "Add speed, complexity, and challenges. Advanced players benefit from refinement.",
          "Players should do this alone not in circle":
            "Circle provides modeling and social support. Mistakes are less visible.",
          "Ball mastery doesn't transfer to games":
            "Every game touch uses these fundamental surfaces and movements.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Ball Mastery Circle teaches your child to be comfortable with the ball using different parts of their feet. We practice toe taps, sole rolls, tick-tocks, and circles - these are the building blocks for all dribbling and ball control in games.",
        newsletter:
          "This week we practiced Ball Mastery! Ask your child to show you toe taps (tapping top of ball) and tick-tocks (side to side with inside of foot). These can be practiced at home - try 50 touches before dinner!",
        whatToWatchFor: [
          "Does your child use different parts of their foot comfortably?",
          "Can they keep the ball close without it rolling away?",
          "Do they practice ball touches at home?",
          "Are they getting more confident with both feet?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Tripping on ball",
            prevention: "Adequate spacing between players",
            response: "Check player, ensure they're okay, reinforce spacing",
          },
          {
            risk: "Ankle strain",
            prevention: "Dynamic warm-up before activity",
            response: "Rest, ice if needed, modify to sitting if can continue",
          },
          {
            risk: "Collisions reaching for rolling ball",
            prevention: "Emphasize 'let it go, get a new one' if ball escapes",
            response: "Check both players, reinforce rule",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Allow seated participation for balance issues; modify moves as needed",
          visualImpairments:
            "Position close to coach; verbal cues instead of visual only",
          attentionChallenges:
            "Shorter segments; frequent changes; individual attention",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did all players complete at least some of each move?",
          "Was my demonstration clear enough?",
          "Did I praise effort, not just success?",
          "Was the pace appropriate for this group?",
          "Which move was hardest for most players?",
        ],
        forImprovement: [
          "Should I add/remove moves based on skill level?",
          "How can I better help struggling players without stopping the group?",
          "What phrases resonated most?",
          "Should I let players demonstrate next time?",
        ],
      },
    },
  },
  {
    slug: "gates-dribbling",
    name: "Gates Dribbling",
    description: "Players dribble through randomly scattered cone 'gates' throughout a playing area. Develops dribbling with head up, direction changes, spatial awareness, and decision-making about which gate to attack next.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 8,
    skillsDeveloped: ["dribbling", "agility-coordination"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ 10-16 cones (2 per gate, minimum 5-8 gates)\n□ Pinnies (optional for variations)\n\nSPACE: 25x25 paces (adjust based on numbers)\n\nSETUP STEPS\n1. Create gates by placing 2 cones about 2 paces apart\n2. Scatter 5-8 gates RANDOMLY throughout area (not in lines!)\n3. Gates should face different directions\n4. Leave space between gates for dribbling\n5. Each player has a ball\n\nDIAGRAM\n┌────────────────────────────────┐\n│     ⊏⊐                        │\n│              ⊏⊐          ⊏⊐   │\n│    ⊏⊐                         │\n│                   ⊏⊐          │  25 paces\n│         ⊏⊐              ⊏⊐   │\n│                                │\n│    ⊏⊐          ⊏⊐             │\n└────────────────────────────────┘\n        25 paces\n\n⊏⊐ = gate (2 cones, 2 paces apart)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid\n\nSAY: "Everyone grab a ball and come into our gate area! Look at all these gates - your job is to dribble through as many as you can!"\n\nDEMO: Dribble through nearest gate.\n\nSAY: "The ball must go through the gate with you - no kicking ahead! Head up, find the next gate, and go! How many can you get in 1 minute? Ready... GO!"\n\n\nPHASE 2: ROUND 1 - FREE EXPLORATION (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "GO! Count your gates! Head up, find the next one!"\n\nCoach Position: Outside area, moving around perimeter\n\nWATCH FOR:\n□ Are they looking up to find gates?\n□ Are they keeping ball close through gates?\n□ Are they spreading out or all going to same gate?\n\nPHRASES TO USE:\n• "Eyes up - where\'s your next gate?"\n• "Great control through that one!"\n• "Find an empty gate!"\n• "Don\'t stop - keep going!"\n\nCOUNTDOWN: "30 seconds!... 10 seconds!... 3-2-1 FREEZE!"\n\nASK: "Who got more than 5? More than 8? More than 10?"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone come to this gate. Watch me."\n\nDEMO: Dribble through gate while looking ahead at next gate.\n\nSAY: "See how I\'m looking for my NEXT gate WHILE going through this one? Not looking at my feet! That\'s how you go faster!"\n\nDEMO: Also show changing direction smoothly toward next gate.\n\n\nPHASE 4: ROUND 2 - BEAT YOUR SCORE (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This time, try to beat YOUR score! Remember - head up, looking for the next gate! Ready... GO!"\n\nCoach moves around, giving specific feedback:\n• "Nice - already looking for your next one!"\n• "Pick your head up! There\'s an empty gate over there!"\n• "Beautiful direction change!"\n\nEnd: "FREEZE! Did anyone beat their score? Nice!"\n\n\nPHASE 5: CHALLENGE ROUND (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE challenge:\n\nOption A - Weak Foot Only:\nSAY: "This round, ONLY your weak foot can touch the ball! This is hard - it\'s okay to go slower!"\n\nOption B - Different Exits:\nSAY: "You must exit each gate a DIFFERENT direction than you entered! Can\'t go straight through!"\n\nOption C - Called Gates:\nSAY: "I\'ll call out a gate - everyone race to THAT gate! First one through gets a point!"\n\nRun challenge. Celebrate effort!\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great work! What helped you go through more gates?"\n\nListen for: "Looking up," "Planning ahead," "Finding empty ones"\n\nSAY: "That\'s exactly what you need in games - finding space, knowing where to go next! Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│     ⊏⊐                        │\n│              ⊏⊐          ⊏⊐   │\n│    ⊏⊐                         │\n│                   ⊏⊐          │\n│         ⊏⊐              ⊏⊐   │\n│                                │\n│    ⊏⊐          ⊏⊐             │\n└────────────────────────────────┘",
    coachingPoints: [
      "HEAD UP → Say: 'Eyes up! Where's your next gate?'",
      "BALL CLOSE THROUGH GATE → Say: 'Ball stays with you through the gate - like walking your dog through a door!'",
      "CHANGE DIRECTION → Say: 'Don't just go straight - curve toward your next gate!'",
      "PLAN AHEAD → Say: 'Look for your next gate WHILE going through this one!'",
    ],
    questionsToAsk: [
      "'How did you find empty gates?' → Develops awareness and vision",
      "'What's easier - looking at your feet or looking up?' → Looking up, even if it feels harder",
      "'Which way do you go through when two people want the same gate?' → Decision making",
      "'How is this like a real soccer game?' → Finding space, seeing the field",
    ],
    commonMistakes: [
      "STARING AT BALL → Say: 'Quick peeks at the ball, long looks ahead!'",
      "KICKING THROUGH AND CHASING → Say: 'Ball stays at your feet - don't kick ahead!'",
      "ALL GOING TO SAME GATE → Say: 'Find your own gate! Look for empty ones!'",
      "GOING BACK THROUGH SAME GATE → Say: 'New gate each time! Explore everywhere!'",
    ],
    variations: [
      {
        name: "Partner Gates",
        description:
          "Work in pairs - pass ball through gate to partner. Count combined gates.",
        difficulty: "beginner",
      },
      {
        name: "Color Gates",
        description:
          "Different colored cone gates worth different points. Red=3, Yellow=2, Green=1.",
        difficulty: "beginner",
      },
      {
        name: "Gate Keeper",
        description:
          "1-2 players defend gates. Dribblers score by going through unguarded gates.",
        difficulty: "intermediate",
      },
      {
        name: "Sequence Gates",
        description:
          "Must go through gates in order (numbered or colored sequence).",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Ball always escaping through gates\n• Can't find gates (head down)\n• Collisions at gates\n• Low gate counts (less than 3 per minute)\n\nSOLUTIONS:\n• Make gates wider (3 paces instead of 2)\n• Fewer gates but more spread out\n• Walk-through allowed (not just dribble)\n• Coach stands at gate calling them over\n• Allow ball to go through slightly ahead",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Easily getting 10+ gates per minute\n• Head always up\n• No collisions\n• Looking bored\n\nSOLUTIONS:\n• Narrower gates (1.5 paces)\n• Must go AROUND cone not between sometimes\n• Weak foot only\n• Add a gate keeper defender\n• Can't use same gate twice in a row\n• Specify exit directions",
    equipmentNeeded: ["1 ball per player", "10-16 cones"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "warmup",
      "dribbling",
      "awareness",
      "decision-making",
      "beginner-friendly",
      "no-lines",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Dribble through scattered cone gates while keeping head up to find next gate - develops vision and dribbling.",
        keyPhrases: [
          "Head up - find your next gate!",
          "Ball stays with you through the gate!",
          "Plan ahead - see your next one!",
        ],
        setupDiagram:
          "25x25 grid, 5-8 gates scattered randomly, 2 cones per gate 2 paces apart",
        quickProgression: {
          easier: "Wider gates, fewer gates, walking allowed",
          harder: "Narrower gates, weak foot, add defenders",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up 5-8 gates scattered randomly (not in lines!)",
            "Ensure gates face different directions",
            "Count cones needed: 2 per gate = 10-16 cones",
            "Mark boundary of playing area",
          ],
          mindset:
            "This is about VISION while dribbling. Your main job is getting them to pick their head up. Be a broken record: 'Head up! Where's your next gate?' Celebrate finding empty gates and planning ahead.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Center of grid",
            script:
              "SAY: 'Dribble through as many gates as you can! Ball goes with you - no kicking ahead!' Demo one gate. 'Count your gates - GO!'",
            anticipatedResponses: {
              "What if someone else is at my gate?":
                "Find an empty one! That's why you look up!",
              "Can I go through the same gate twice?":
                "Try to find new gates each time - explore everywhere!",
              "I kicked it too far":
                "Keep it close! The ball is your pet following you.",
            },
            troubleshooting: {
              "Gates too close together": [
                "Spread them out mid-activity - just move cones",
              ],
              "Gates all facing same way": [
                "Quickly rotate some gates to face different directions",
              ],
            },
          },
          {
            phase: "Round 1 - Free Exploration",
            duration: "90 seconds",
            coachPosition: "Outside grid, moving around",
            script:
              "Call encouragement: 'Head up!' 'Find empty gates!' 'Keep going!' End with freeze and score check.",
            troubleshooting: {
              "Everyone at same gates": [
                "Spread out! There are empty gates over here!",
              ],
              "Ball escaping on all passes through": [
                "Slow down! Control first, speed later.",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "At one gate, everyone gathered",
            script:
              "Demo: Look for next gate WHILE going through current gate. 'See how I'm already planning? Eyes up, not on feet!'",
          },
          {
            phase: "Round 2 - Beat Your Score",
            duration: "90 seconds",
            coachPosition: "Roaming inside grid",
            script:
              "Personal challenge: beat your own score. Give specific feedback about vision and planning ahead.",
          },
          {
            phase: "Challenge Round",
            duration: "90 seconds",
            coachPosition: "Roaming",
            script:
              "Pick one challenge: weak foot only, different exit directions, or called gates. Celebrate effort on difficult challenge.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What helped you get more gates?' Connect to game: finding space, seeing the field. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Everyone getting 15+ gates",
              "No challenge visible",
              "Players adding own tricks",
            ],
            solutions: [
              "Narrow gates",
              "Weak foot only",
              "Add gate keeper",
              "Can't repeat gates",
              "Exit direction requirement",
            ],
          },
          tooHard: {
            symptoms: [
              "Few gates completed",
              "Constant ball loss",
              "Collisions",
              "Frustration",
            ],
            solutions: [
              "Wider gates",
              "Fewer gates",
              "Walking allowed",
              "Coach guides to gates",
            ],
          },
        },
        playerBehavior: {
          crowding: {
            symptoms: [
              "Everyone at 2-3 popular gates",
              "Arguments over gates",
              "Ignoring empty gates",
            ],
            approach:
              "SAY: 'Look - there are 3 empty gates over there! Smart players find empty gates!' Point out empty areas.",
          },
          competitiveConflicts: {
            symptoms: [
              "Pushing at gates",
              "Arguing about who was first",
              "Blocking gates",
            ],
            approach:
              "SAY: 'If someone's there, find an empty gate! That's the smart move!' Praise those finding empty gates.",
          },
          notTrying: {
            symptoms: ["Walking through gates", "Low effort", "Not counting"],
            approach:
              "Add individual challenge: 'Can you beat 8 this time?' Or add variation to re-engage.",
          },
        },
        environmentalIssues: {
          windBlowingCones: {
            symptoms: ["Gates falling apart", "Cones moving"],
            solution:
              "Use heavier cones or place in sheltered area. Or switch to disc cones.",
          },
          unevenNumbers: {
            symptoms: ["Some areas crowded"],
            solution:
              "Add more gates to spread players out. Ensure 1 gate per 2-3 players minimum.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling with Head Up",
            domain: "Technical/Tactical",
            howItDevelops:
              "Finding gates requires looking up while dribbling - exactly what's needed in games to find teammates and space.",
            levelIndicators: {
              1: "Always looking at ball; can't find gates without stopping",
              2: "Occasional glances up; loses ball when looking up",
              3: "Regular head up; maintains control while scanning",
              4: "Constant scanning; never loses ball; plans 2 gates ahead",
              5: "Peripheral vision for ball; full field awareness",
            },
            assessmentNotes:
              "Watch eye position during dribbling. How far ahead are they looking? Can they tell you where empty gates are?",
          },
          {
            skill: "Change of Direction",
            domain: "Technical",
            howItDevelops:
              "Gates are scattered - players must turn and curve toward next gate, building turning ability.",
            levelIndicators: {
              1: "Only goes straight; wide, slow turns",
              2: "Turns but loses ball or takes many touches",
              3: "Controlled turns; ball stays close",
              4: "Sharp turns at speed; seamless direction changes",
              5: "Can change direction while scanning; unpredictable",
            },
            assessmentNotes:
              "Watch transitions between gates. Are turns sharp or wide arcs?",
          },
        ],
        secondarySkills: [
          {
            skill: "Decision Making",
            domain: "Tactical",
            howItDevelops:
              "Must choose which gate to attack next based on what's open, where others are, and current position.",
            levelIndicators: {
              1: "Goes to nearest gate regardless of traffic",
              2: "Sometimes chooses empty gate over crowded",
              3: "Consistently finds empty gates",
              4: "Anticipates where others going; finds best options",
              5: "Reads whole field; always in right place",
            },
          },
          {
            skill: "Spatial Awareness",
            domain: "Tactical",
            howItDevelops:
              "Knowing where gates and other players are develops field sense.",
          },
        ],
        physicalDevelopment: {
          agility: "Quick direction changes between gates",
          coordination: "Ball control while navigating gates",
          cardiovascular: "Continuous movement for duration",
        },
        psychologicalDevelopment: {
          decisionMaking: "Choosing which gate to attack",
          persistence: "Continuing to find gates even when others are crowded",
          goalSetting: "Trying to beat personal score",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Gates Dribbling forces players to pick their head up - the single biggest improvement most young players need. Looking for gates while dribbling directly translates to looking for teammates and space in games. The individual format means high touches and continuous movement.",
        whenToUseIt: {
          idealFor: [
            "Early in practice (warm-up with purpose)",
            "After ball mastery (adds movement to technique)",
            "When working on vision/awareness",
            "Before passing activities (seeing targets)",
          ],
          avoidWhen: [
            "Very windy conditions (cones blow over)",
            "Not enough cones for gates",
            "Players need stationary technique work",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Ball Mastery Circle",
              reason: "Basic ball comfort before movement",
            },
            {
              activity: "Traffic Lights",
              reason: "Ball control at speeds",
            },
          ],
          after: [
            {
              activity: "Shark Attack",
              reason: "Adds defensive pressure",
            },
            {
              activity: "1v1 to Gates",
              reason: "Competitive dribbling through gates",
            },
            {
              activity: "Passing Gates",
              reason: "Gate concept with passing",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Exploration and fun, count as celebration not pressure",
            keyPhrases: [
              "How many doors can you go through?",
              "Find the empty ones!",
              "Eyes up, adventurer!",
            ],
            avoidSaying: ["You need to look up more", "That was wrong"],
            duration: "6-7 minutes",
            simplifications: [
              "Wider gates",
              "Fewer gates",
              "No weak foot requirement",
            ],
          },
          ages9to11: {
            approach: "Add challenge and competition",
            keyPhrases: [
              "Plan two gates ahead",
              "What's your strategy?",
              "Beat your record",
            ],
            challenges: [
              "Weak foot rounds",
              "Exit direction requirements",
              "Add gate keeper",
            ],
            duration: "8-10 minutes",
          },
          ages12to14: {
            approach: "Game connection and self-coaching",
            keyPhrases: [
              "Where do you see gates in a real game?",
              "How does this help your game?",
            ],
            challenges: [
              "Competitive races",
              "Team gates",
              "Complex sequences",
            ],
            coachRole: "Facilitate discussion about game application",
          },
        },
        commonMisconceptions: {
          "Just running around aimlessly":
            "The gate targets create purpose and require planning - this is structured chaos.",
          "Doesn't translate to games":
            "Finding and dribbling to 'gates' (passing lanes, space, goals) is exactly what happens in games.",
          "Players should go faster":
            "Speed without control and vision is useless. Emphasize quality over quantity.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Gates Dribbling teaches your child to look up while dribbling - finding gates is like finding teammates and space in games. They're learning to make decisions and control the ball at the same time.",
        newsletter:
          "This week: Gates Dribbling! We scattered cone gates around and challenged players to dribble through as many as possible. The key skill is looking UP to find the next gate while keeping the ball close. You can practice at home with shoes or toys as gates!",
        whatToWatchFor: [
          "Does your child look up while dribbling or stare at the ball?",
          "Can they dribble and change direction smoothly?",
          "Do they find open space rather than crowded areas?",
          "Are they planning ahead or just reacting?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions at popular gates",
            prevention:
              "Emphasize finding empty gates; adequate spacing between gates",
            response: "Check players; reinforce gate choice skills",
          },
          {
            risk: "Tripping over cones",
            prevention:
              "Remind to go THROUGH gates not around; spaced out cones",
            response: "Check for injury; ensure cones visible",
          },
          {
            risk: "Rolling ankles on direction changes",
            prevention: "Adequate warm-up; reasonable speed expectations",
            response: "Rest; ice if needed; reduce intensity",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences:
            "Allow walking; larger gates; fewer direction changes required",
          visionImpairments:
            "Use bright colored cones; partner assistance; verbal guidance",
          attentionChallenges:
            "Shorter rounds; frequent breaks; individual gates to find",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players looking up while dribbling?",
          "Did I repeat 'head up' enough?",
          "Were gates appropriately challenging?",
          "Did players spread out or crowd?",
          "Was the progression appropriate?",
        ],
        forImprovement: [
          "Should I add more or fewer gates?",
          "Which variation should I try next time?",
          "Who needs extra help with head-up dribbling?",
          "How can I better connect this to game situations?",
        ],
      },
    },
  },
  {
    slug: "world-cup-v2",
    name: "World Cup",
    description: "Classic playground shooting game where all players start together, everyone for themselves, trying to score in a central goal with multiple balls in play. Every goal scores a point - do a quick task and jump right back in, so everyone stays active the whole round. Develops shooting, dribbling in traffic, and decision-making. (The classic sit-out, last-player-standing elimination format is available as a 'Championship Knockout' variation for older or highly competitive groups.)",
    sport: "soccer",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 12,
    skillsDeveloped: ["shooting"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball only (coach holds extras for quick replacement)\n□ 2 cones or 1 small goal (3-4 paces wide)\n□ Optional: pinnies for later rounds\n□ Spare balls nearby for quick restarts\n\nSPACE: Open area with shooting area (minimum 20x30 paces)\n\nSETUP STEPS\n1. Set up one small goal (2 cones, 3-4 paces apart) OR use existing small goal\n2. Mark a shooting line about 8-10 paces from goal (optional but helpful)\n3. All players start spread around the goal area\n4. ONE ball in play\n\nDIAGRAM\n            ALL PLAYERS SPREAD OUT\n            ○    ○    ○    ○    ○\n              ○    ○    ○    ○\n                    ⚽\n\n     - - - - - - - - - - - - - - (shooting line optional)\n\n                  ⊏⊐\n                 GOAL\n\n○ = player  ⚽ = single ball  ⊏⊐ = goal (3-4 paces)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: By the goal\n\nSAY: "This is WORLD CUP - the most famous playground game ever! Everyone plays for themselves. Your goal is to SCORE. Every goal is a point - and when you score, do 5 quick toe taps and jump RIGHT BACK IN. Nobody sits out!"\n\nSAY: "There are SEVERAL BALLS in play so everyone stays busy. You can steal a loose ball from anyone, dribble, shoot - anything goes! But NO GOALKEEPERS and NO grabbing with hands. Ready?"\n\nPICK COUNTRY NAMES (makes it fun):\nSAY: "Pick a country to be! Who\'s Brazil? Germany? USA? Argentina?"\n\nLet them pick countries quickly.\n\n\nPHASE 2: ROUND 1 (3-4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Find a spot, spread out! Ready... WORLD CUP!"\n\nDrop 2-3 balls in around the area, step back.\n\nCoach Position: Near goal but out of play\n\nDURING PLAY:\n□ When someone scores: "GOAL! [Country name] - that\'s a point! 5 toe taps, then get back in!"\n□ Ball out of bounds: Throw in new ball quickly (keep spares ready)\n□ Players bunching: "Spread out! Find space!"\n□ No one shooting: "Have a go! Take your shot!"\n\nEnd the round on time, not on elimination:\nSAY: "FREEZE! Let\'s count goals - who scored the most this round?"\n\n\nPHASE 3: QUICK DEBRIEF (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Who scored first? What did you do differently than others?"\n\nListen for: "Found space," "Got to loose ball," "Took my chance"\n\nSAY: "Let\'s go again! Maybe change your strategy this time!"\n\n\nPHASE 4: ROUND 2 (3-4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOPTIONAL VARIATION - Choose one:\n• "Weak foot goals count DOUBLE"\n• "Must beat someone 1v1 before shooting"\n• "Goal only counts from inside shooting line"\n\nSAY: "Same game, new round! Same rule - score, quick toe taps, right back in. Different country this time? GO!"\n\nRun same format.\n\n\nPHASE 5: ROUND 3 - BONUS ROUND (3-4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "BONUS ROUND! Same rules - score, tap, jump back in - but every goal this round is worth DOUBLE points! Let\'s see who finishes on top!"\n\nIncrease intensity with your voice and energy.\n\nAdd up points across all three rounds and crown a WORLD CUP CHAMPION based on total points - everyone played the whole time to get there!\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Amazing World Cup! What did you learn works?"\n\nListen for: "Get to the ball first," "Find space," "Take your shot when you can"\n\nSAY: "Those are the exact skills you need in real games! Great work everyone! Water break!"',
    diagram:
      "            ○    ○    ○    ○    ○\n              ○    ○    ○    ○\n                    ⚽\n\n     - - - - - - - - - - - - - -\n\n                  ⊏⊐\n                 GOAL",
    coachingPoints: [
      "FIND SPACE AWAY FROM CROWD → Say: 'Where is the ball going to pop out? Be there!'",
      "TAKE YOUR SHOT → Say: 'If you have a chance, shoot! Don't wait!'",
      "WIN THE BALL → Say: 'Get there first! Be hungry for the ball!'",
      "QUICK DECISIONS → Say: 'Shoot, dribble, or pass to yourself - decide fast!'",
    ],
    questionsToAsk: [
      "'Where did you find the ball most often?' → Away from the crowd, on the edges",
      "'What made the first scorer successful?' → Quick, decisive, in good position",
      "'Should you always chase the ball into the crowd?' → No - sometimes wait for it to come out",
      "'What would you do differently next round?' → Develops reflection and strategy",
    ],
    commonMistakes: [
      "EVERYONE CHASING BALL IN A BUNCH → Say: 'Find space! The ball will pop out - be ready!'",
      "NOT SHOOTING WHEN THEY HAVE A CHANCE → Say: 'Shoot! You won't score if you don't try!'",
      "ONLY TRYING TO STEAL → Say: 'Get your own ball - dribble and shoot!'",
      "GETTING FRUSTRATED → Say: 'Stay calm - your chance will come!'",
    ],
    variations: [
      {
        name: "World Cup Pairs",
        description:
          "Play in pairs (teams of 2). Must combine to score. Both safe when team scores.",
        difficulty: "beginner",
      },
      {
        name: "Comeback World Cup",
        description:
          "Eliminated players do 5 juggles then return. No permanent elimination.",
        difficulty: "beginner",
      },
      {
        name: "Two Goal World Cup",
        description:
          "Add second goal opposite the first. More chances, less crowding.",
        difficulty: "beginner",
      },
      {
        name: "Keeper World Cup",
        description:
          "Scorers become keepers in goal for a round instead of sitting out. Makes scoring progressively harder while keeping everyone moving.",
        difficulty: "intermediate",
      },
      {
        name: "Championship Knockout",
        description:
          "The classic sit-out-and-eliminate format, for older or highly competitive groups ready for real stakes: ONE ball only, no rejoin after scoring. Score and you're SAFE (sit down to watch); last player(s) without a goal are eliminated for the rest of that round. Crown a true last-player-standing champion. Best for ages 12+ or teams that thrive on stakes - younger or mixed-ability groups should stick with the points-based default so nobody sits out the whole round.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      'SIGNS THEY\'RE STRUGGLING:\n• Nobody scoring, frustration building\n• Balls stuck with one crowd\n• Weaker players never getting a touch\n\nSOLUTIONS:\n• Add even more balls (1 per 3-4 players)\n• Bigger goal or a second goal to spread play out\n• Shrink the return task to 2-3 toe taps so players get back in faster\n• Coach feeds an easy rolling ball toward players who haven\'t scored yet\n• Pair up weaker with stronger as a two-person "country"',
    makeHarder:
      'SIGNS THEY\'RE READY:\n• Everyone scoring easily, game feels too easy\n• Asking for more competition or stakes\n• Quick rounds, want a real winner\n\nSOLUTIONS:\n• Must beat someone 1v1 before shooting\n• Weak foot only\n• Must score from shooting line\n• Smaller goal\n• CHAMPIONSHIP KNOCKOUT (see variations) - for older/competitive groups ready for it: drop to ONE ball, score-and-sit-out, last without a goal is eliminated for the round. Save this for groups where sitting out won\'t sour the fun.',
    equipmentNeeded: ["1 ball (extras nearby)", "2 cones for goal"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "shooting", "dribbling", "competition", "fun", "classic"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "All players compete for one ball; score to be safe; last without a goal is eliminated - develops shooting and decision-making.",
        keyPhrases: [
          "Find space - be where the ball goes!",
          "Take your shot when you have it!",
          "Stay calm - your chance will come!",
        ],
        setupDiagram:
          "One small goal, one ball, all players spread around shooting area",
        quickProgression: {
          easier: "Multiple balls, no permanent elimination, team up players",
          harder: "Must beat defender first, weak foot only, smaller goal",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up small goal (2 cones, 3-4 paces wide)",
            "Have 2-3 spare balls ready for quick restarts",
            "Consider shooting line for organization",
            "Think about how to handle elimination fairly",
          ],
          mindset:
            "This is HIGH ENERGY competition. Your job is to keep it moving fast, restart quickly when ball goes out, and manage emotions around elimination. Celebrate all goals equally. Watch for dominant players and discouraged players.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "By the goal",
            script:
              "Explain: everyone for themselves, score = safe, last players eliminated. Pick country names. 'ONE BALL, NO HANDS, NO KEEPERS!'",
            anticipatedResponses: {
              "What if I never get the ball?":
                "Find space away from the crowd! The ball always pops out.",
              "That's not fair, they're bigger":
                "Smart players don't always chase - they wait for chances!",
              "Can we have teams?":
                "Not this version, but we can try pairs next round!",
            },
            troubleshooting: {
              "Players don't understand elimination": [
                "It's okay! Everyone plays every round anyway. If you're out, you play again next round!",
              ],
              "Arguments about countries": [
                "Pick fast or I'll pick for you! It's just for fun!",
              ],
            },
          },
          {
            phase: "Round 1",
            duration: "3-4 minutes",
            coachPosition: "Near goal, out of play",
            script:
              "Drop ball in center, step back. Call out 'GOAL! [Country] is safe!' when scores happen. Quick restarts on out balls. End when 2-3 left.",
            troubleshooting: {
              "Ball constantly out of bounds": [
                "Have spare ball ready - throw in immediately",
              ],
              "One player dominating": [
                "'Nice! Let's see if others can catch up!'",
              ],
              "Everyone bunched on ball": [
                "'Spread out! The ball will pop out - be ready!'",
              ],
            },
          },
          {
            phase: "Quick Debrief",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What did first scorers do differently?' Listen for: space, quick shot, position. 'Try something new this round!'",
          },
          {
            phase: "Round 2",
            duration: "3-4 minutes",
            coachPosition: "Near goal",
            script:
              "Add variation if desired (weak foot double, 1v1 required, etc.). Everyone plays again, even if eliminated before.",
            troubleshooting: {
              "Same players eliminated again": [
                "Consider pairing up or adding multiple balls",
              ],
              "Players giving up": [
                "Encourage: 'Stay with it! Your chance is coming!'",
              ],
            },
          },
          {
            phase: "Round 3 - Championship",
            duration: "3-4 minutes",
            coachPosition: "Near goal, high energy",
            script:
              "Real elimination this round. Build drama with your voice. Crown champion at end. Make it special!",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What works in World Cup?' Connect to real games: finding space, taking chances, quick decisions.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          dominantPlayers: {
            symptoms: [
              "Same 2-3 always score first",
              "Others never touch ball",
              "Visible frustration",
            ],
            solutions: [
              "Require weak foot for dominant players",
              "Must beat someone before shooting",
              "Pair up for 2v2 World Cup",
              "Multiple balls in play",
            ],
          },
          noOneScoring: {
            symptoms: [
              "Long rounds without goals",
              "Too much bunching",
              "No one shooting",
            ],
            solutions: [
              "Larger goal",
              "Two goals",
              "Encourage shooting: 'Have a go!'",
              "Award near misses",
            ],
          },
        },
        playerBehavior: {
          eliminatedUpset: {
            symptoms: [
              "Crying or angry when eliminated",
              "Refusing to sit out",
              "Saying game is unfair",
            ],
            approach:
              "Private word: 'I know it's hard. You'll be back in for Round 2! Watch the others and learn their tricks.' Always bring eliminated back quickly.",
          },
          overlyPhysical: {
            symptoms: ["Pushing", "Grabbing", "Playing the player not ball"],
            approach:
              "Stop immediately. SAY: 'We play the BALL, not the person. Next time is a sit-out.' Be consistent.",
          },
          notTrying: {
            symptoms: [
              "Standing still",
              "Not going for ball",
              "Already given up",
            ],
            approach:
              "Quiet encouragement: 'Watch where the ball goes - go meet it!' Or pair them with an active player.",
          },
        },
        environmentalIssues: {
          unevenNumbers: {
            symptoms: ["Too many players for one ball"],
            solution:
              "Split into two games with two goals. Or add second ball.",
          },
          goalTooSmall: {
            symptoms: ["Many shots, few goals", "Frustration at missing"],
            solution: "Widen goal. Or any shot on target = safe.",
          },
          ballConstantlyOut: {
            symptoms: ["More time chasing balls than playing"],
            solution:
              "Add boundaries. Or have assistant catching stray balls and throwing in quickly.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Shooting",
            domain: "Technical",
            howItDevelops:
              "Game requires scoring to survive - creates urgency and decision-making around when/how to shoot.",
            levelIndicators: {
              1: "Rarely shoots; shots miss goal entirely",
              2: "Shoots when obvious opportunity; inconsistent accuracy",
              3: "Creates own shooting opportunities; hits target regularly",
              4: "Scores consistently; varies shot type to situation",
              5: "Clinical finisher; scores under pressure; helps others score",
            },
            assessmentNotes:
              "Look at both shot selection (when) and execution (how). Does player create chances or wait for them?",
          },
          {
            skill: "Dribbling in Traffic",
            domain: "Technical",
            howItDevelops:
              "Chaotic environment with many players requires close control to keep ball in crowd.",
            levelIndicators: {
              1: "Loses ball immediately in traffic",
              2: "Survives briefly but can't escape crowd",
              3: "Maintains possession; can emerge with ball",
              4: "Comfortable in traffic; creates space for self",
              5: "Thrives in chaos; beats multiple players",
            },
            assessmentNotes:
              "Watch when player gets ball in crowded area. Can they protect it? Escape? Create shooting chance?",
          },
        ],
        secondarySkills: [
          {
            skill: "Positioning / Finding Space",
            domain: "Tactical",
            howItDevelops:
              "Smart players position where ball will pop out, not where it is. Develops game intelligence.",
            levelIndicators: {
              1: "Always chases ball into crowd",
              2: "Sometimes finds space but doesn't use it",
              3: "Positions in good areas; ready for loose balls",
              4: "Anticipates play; always in good position",
              5: "Reads game like a chess player; creates own luck",
            },
          },
          {
            skill: "Decision Making",
            domain: "Tactical",
            howItDevelops:
              "Shoot? Dribble? Wait? Constant decisions under pressure.",
          },
        ],
        physicalDevelopment: {
          acceleration: "Short bursts to loose balls",
          agility: "Navigating congested areas",
          endurance: "Sustained effort over multiple rounds",
        },
        psychologicalDevelopment: {
          competitiveness: "Desire to win in individual competition",
          resilience: "Bouncing back from elimination",
          decisionMaking: "Constant choices under pressure",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "World Cup replicates game chaos in concentrated form. Players must find space, win balls, make decisions, and finish - all under time pressure with consequences. The elimination element adds urgency that transfers to game situations. Plus, kids LOVE it.",
        whenToUseIt: {
          idealFor: [
            "End of practice (high engagement reward)",
            "Working on shooting mentality",
            "Building competitive drive",
            "When players need fun after technical work",
          ],
          avoidWhen: [
            "Beginning of practice (too intense)",
            "After losses or emotional sessions",
            "Very uneven skill levels (frustration for weaker)",
            "Very young players who can't handle elimination",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Shooting Stations",
              reason: "Technique before pressure",
            },
            {
              activity: "1v1 to Goal",
              reason: "Smaller scale competition",
            },
          ],
          after: [
            {
              activity: "Small-Sided Game",
              reason: "Team application of skills",
            },
            {
              activity: "Shooting Under Pressure",
              reason: "More structured finishing work",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Maximum fun, minimize elimination stress",
            keyPhrases: [
              "Have a go!",
              "Great try!",
              "You'll get it next round!",
            ],
            avoidSaying: ["You're out!", "That was a bad shot"],
            duration: "8-10 minutes maximum",
            simplifications: [
              "No permanent elimination",
              "Multiple balls",
              "Big goals",
              "All praised",
            ],
          },
          ages9to11: {
            approach: "Competition with learning",
            keyPhrases: [
              "What's your strategy?",
              "Find the space!",
              "Clinical finish!",
            ],
            challenges: [
              "Real elimination for final round",
              "Weak foot challenge",
              "Smaller goals",
            ],
            duration: "12-15 minutes",
          },
          ages12to14: {
            approach: "Intense competition, player-managed",
            keyPhrases: [
              "Create your chance",
              "Be clinical",
              "Smart positioning",
            ],
            challenges: [
              "1v1 before shooting",
              "Time limits",
              "Keeper in goal",
            ],
            coachRole: "Referee role; let players manage their game",
          },
        },
        commonMisconceptions: {
          "Too chaotic to be learning":
            "Chaos is the learning! Games are chaotic. Controlled chaos develops game intelligence.",
          "Only good players benefit":
            "Adjust rules so all can succeed - weak foot requirements, multiple balls, pairing up.",
          "Elimination is too harsh":
            "Make it temporary or remove for young ages. The urgency still works even without real elimination.",
        },
      },
      parentCommunication: {
        ifAsked:
          "World Cup is a classic soccer game where players compete to score and stay 'alive.' It teaches shooting, finding space, and making quick decisions - all in a fun, game-like environment. We make sure everyone gets chances and no one feels left out.",
        newsletter:
          "We played WORLD CUP this week - the famous playground game where everyone competes for one ball! Ask your child about it: What country were they? Did they score? What strategy worked best? This game develops shooting, positioning, and competitive spirit!",
        whatToWatchFor: [
          "Does your child take shooting chances or hesitate?",
          "Do they find space away from the crowd?",
          "How do they handle not scoring - resilience or frustration?",
          "Are they learning from each round and adjusting strategy?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions when multiple players going for ball",
            prevention: "Emphasize playing the ball not person; adequate space",
            response:
              "Check both players; brief pause if needed; reinforce rules",
          },
          {
            risk: "Kicked while shooting in crowded goal area",
            prevention: "Encourage spreading out; no crowd in front of goal",
            response: "Check player; ensure not dangerous; continue",
          },
          {
            risk: "Frustration-related incidents",
            prevention:
              "Quick rounds; bring eliminated back fast; multiple balls",
            response:
              "Private word; break if needed; adjust rules to reduce frustration",
          },
        ],
        inclusionConsiderations: {
          skillDifferences:
            "Pair weaker with stronger; weak foot for advanced; multiple balls for equal chances",
          physicalDifferences:
            "Larger goal; longer shooting range allowed; different elimination criteria",
          emotionalSensitivity:
            "No permanent elimination for anxious players; comeback rule; pair with supportive player",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did all players get shooting opportunities?",
          "Was elimination handled sensitively?",
          "Did I keep the game moving with quick restarts?",
          "Was the competitive balance right?",
          "Did players show game intelligence (finding space, timing)?",
        ],
        forImprovement: [
          "How could I adjust for different skill levels?",
          "Which variation would add the most learning?",
          "Who struggled emotionally and how can I support them?",
          "How can I better connect this to real game situations?",
        ],
      },
    },
  },
  {
    slug: "passing-combinations-v2",
    name: "Passing Combinations",
    description: "Technical passing activity focused on wall passes (give-and-go) and combination play patterns. Players learn to execute quick one-two exchanges, understand timing of runs, and develop the technical foundation for penetrating defenses through combination play.",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 12,
    skillsDeveloped: ["passing-short", "support-play", "receiving-first-touch"],
    setupInstructions:
      'EQUIPMENT CHECKLIST\n□ 8-12 balls (1 per pair minimum)\n□ 12 cones (various colors if available)\n□ 4 flat markers for start positions\n□ 4 tall cones/poles for targets (optional)\n\nSPACE: 30x20 paces with two parallel channels\n\nSETUP STEPS\n1. Create two parallel channels, each 25x8 paces\n2. Place start cone at one end of each channel\n3. Place "wall player" cone 10 paces from start\n4. Place "finishing" cone 10 paces past wall player\n5. Set up mannequin/pole as "defender" near wall player\n6. Position spare balls at start cones\n\nDIAGRAM - TOP VIEW\n┌─────────────────────────────────────────┐\n│  START      WALL PLAYER      FINISH     │\n│    ▲            ●               ○       │\n│    A ─────────────────────────────→     │  Channel 1\n│              [D]                        │  (8 paces wide)\n├─────────────────────────────────────────┤\n│    ▲            ●               ○       │\n│    A ─────────────────────────────→     │  Channel 2\n│              [D]                        │  (8 paces wide)\n└─────────────────────────────────────────┘\n        25 paces total\n\n▲=Start cone  ●=Wall player position  ○=Finish  [D]=Defender cone/mannequin\nA=Player with ball path',
    howToPlay:
      'PHASE 1: GATHER & DEMONSTRATE (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Between the two channels\n\nSAY: "Today we\'re learning wall passes - also called give-and-go. This is one of the most effective ways to beat a defender in a game."\n\nDEMONSTRATE with one player as wall:\n1. "I have the ball. I see a defender [point to cone]. I can\'t dribble through."\n2. "I pass to my teammate [firm pass to feet] and IMMEDIATELY sprint past the defender."\n3. "My teammate LAYS IT OFF into my path [one-touch return] - they\'re a WALL, the ball bounces back."\n4. "Now I collect the ball behind where the defender was."\n\nKEY TEACHING POINTS during demo:\n• "Notice: The first pass is FIRM to their feet"\n• "Notice: I move the INSTANT I pass - not after"\n• "Notice: The return pass is ONE TOUCH into space ahead of me"\n\nASK: "Why does this beat a defender?"\nListen for: Defender can\'t follow ball AND player / Creates 2v1 moment\n\nSAY: "Let\'s break this down step by step."\n\n\nPHASE 2: WALKING REHEARSAL (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nPair players: One starts at START cone, one at WALL PLAYER cone.\n\nSAY: "Walk through it. Passer - walk toward wall player, pass, then walk your run past the defender cone. Wall - receive and lay off."\n\nEach pair walks through 3 reps each direction.\n\nCORRECTIONS TO MAKE:\n□ "Don\'t wait to see if your pass arrives - MOVE as you pass"\n□ "Wall player - open your body toward where they\'re running"\n□ "Lay off IN FRONT of them, not behind"\n\n\nPHASE 3: DRILL AT PACE (5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Now game speed! Player A starts, passes to B, sprints past defender, receives return, and dribbles to finish. Then B gets a ball and becomes the new A. Rotate through."\n\nRun continuous rotation:\n- Lines at START cone\n- One player always at WALL position\n- After finishing, jog back to start line\n- After being wall, become next attacker\n\nCOACH POSITION: Side of channel, watching angles and timing\n\nPHRASES TO USE:\n• "Move as you pass!"\n• "Firm pass to feet!"\n• "One touch - into their path!"\n• "Angle your body toward the finish!"\n• "Check your shoulder before you receive!"\n\nEvery 90 seconds: "SWITCH CHANNELS!" - keeps it fresh\n\n\nPHASE 4: PROGRESSION - ADD DECISIONS (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Now the wall player has a choice. If the passer makes a good run, lay it off. If the passer is slow or the pass is bad, TURN and go yourself."\n\nDEMO: Show bad pass scenario where wall player turns and dribbles instead of laying off.\n\nNow wall player makes decisions:\n- Good timing = wall pass\n- Bad timing = turn and go\n\nSAY: "This is real soccer! You must READ the situation."\n\n\nWRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nGather group.\n\nASK: "When in a game would you use this?"\nListen for: Near goal, when defender closes you down, in tight spaces\n\nSAY: "Three things to remember: Firm pass, move immediately, one-touch return into space. Water break, then we\'re using this in 1v1!"',
    diagram:
      "WALL PASS PATTERN\n┌─────────────────────────────────────┐\n│                                     │\n│    A ───pass──→ B                   │\n│     \\                              │\n│      \\ (run)    [Defender]         │\n│       \\                            │\n│        \\←─return─┘                 │\n│         \\                          │\n│          ○ (receives behind def)   │\n│                                     │\n└─────────────────────────────────────┘\n\nSETUP VIEW\n┌─────────────────────────────────────────┐\n│  START      WALL          FINISH        │\n│    ▲──────────●─────────────○           │\n│              [D]                        │\n├─────────────────────────────────────────┤\n│    ▲──────────●─────────────○           │\n│              [D]                        │\n└─────────────────────────────────────────┘",
    coachingPoints: [
      "PASS WEIGHT - Firm enough to reach, soft enough to control → Say: 'Pass like you mean it - firm to their feet!'",
      "TIMING OF RUN - Sprint as ball leaves foot, not after → Say: 'The pass and your first step are the same moment!'",
      "WALL PLAYER BODY SHAPE - Open stance, see field → Say: 'Show me your hips pointing to where they're running!'",
      "RETURN PASS PLACEMENT - Into path, not at feet → Say: 'Play it where they're going, not where they are!'",
      "FIRST TOUCH AFTER WALL - Out of feet toward goal → Say: 'Touch it forward in stride - don't slow down to receive!'",
    ],
    questionsToAsk: [
      "'Why do we pass FIRM to the wall player?' → So they can one-touch it; soft pass can't be returned quickly",
      "'What happens if you run BEFORE passing?' → Ball goes to where you were, defender intercepts",
      "'Why must the wall player open their body?' → To see the runner and play into space; closed body = blind",
      "'Where should you look before receiving the return?' → Check shoulder for defender position",
      "'When wouldn't you play a wall pass in a game?' → When there's space to dribble, no teammate available, or defender backs off",
    ],
    commonMistakes: [
      "WAITING TO SEE IF PASS ARRIVES BEFORE RUNNING → Say: 'Trust your pass! Move as it leaves your foot'",
      "SOFT/WEAK INITIAL PASS → Say: 'That's a muffin - give them something to work with!'",
      "RETURN PASS BEHIND THE RUNNER → Say: 'In front! Make them accelerate to it, not slow down'",
      "WALL PLAYER FACING WRONG WAY → Say: 'Open up! I should see your belly button facing the finish'",
      "RUNNER SLOWING DOWN TO RECEIVE → Say: 'Maintain your speed - touch it in stride'",
      "LOOKING DOWN WHILE RUNNING → Say: 'Head up - where's the goal? Where's the defender?'",
    ],
    variations: [
      {
        name: "Double Wall Pass",
        description:
          "Add third player. A passes to B, runs, B lays off, A passes to C, runs, receives from C. Two combinations in sequence.",
        difficulty: "advanced",
      },
      {
        name: "Overlap Combination",
        description:
          "Instead of wall pass, A passes to B, overlaps around B, receives return. Different running pattern.",
        difficulty: "intermediate",
      },
      {
        name: "Third Man Run",
        description:
          "A passes to B, B passes to C, C plays A who continued their run. Introduces third-man concepts.",
        difficulty: "advanced",
      },
      {
        name: "Finish with Shot",
        description:
          "After receiving return pass, player must finish on goal within 2 touches. Adds end product pressure.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      'SIGNS THEY\'RE STRUGGLING:\n• Return passes constantly behind runner\n• Runners not timing movement\n• Passes too weak to one-touch\n\nSOLUTIONS:\n• Slow down - do at 50% pace first\n• Increase distance between cones (more time)\n• Allow two touches for wall player\n• Remove "defender" cone (less pressure)\n• Demo repeatedly with verbal cues',
    makeHarder:
      "SIGNS THEY'RE READY:\n• Executing cleanly at pace\n• Making good decisions\n• Asking for more challenge\n\nSOLUTIONS:\n• Add real defender (passive, then active)\n• Decrease space between cones\n• Require weak foot passes\n• Time pressure: Must complete in X seconds\n• Competition: Points for clean combinations",
    equipmentNeeded: [
      "8-12 balls",
      "12 cones",
      "4 flat markers",
      "4 tall cones or poles (optional)",
    ],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building"],
    tags: [
      "passing",
      "combination-play",
      "wall-pass",
      "give-and-go",
      "technical",
      "tactical",
      "skill-building",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Players learn wall passes (give-and-go) through progressive practice, developing timing, weight of pass, and movement off the ball.",
        keyPhrases: [
          "Pass and move immediately!",
          "Firm pass to feet!",
          "One touch into their path!",
          "Open your body to see the field!",
        ],
        setupDiagram:
          "Two 25x8 pace channels with start, wall player, and finish positions",
        quickProgression: {
          easier: "Walk through first, more space, two touches for wall",
          harder: "Add defender, smaller space, weak foot only, timed",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up both channels before players arrive",
            "Have extra balls at each start position",
            "Review wall pass technique in your head",
            "Plan your demonstration with one player",
          ],
          mindset:
            "This is TACTICAL teaching, not just technical. Help players understand WHY wall passes work, not just HOW to execute them. Connect everything to game situations.",
        },
        segments: [
          {
            phase: "Demonstration",
            duration: "2 minutes",
            coachPosition: "Between channels, visible to all",
            script:
              "Explain concept: 'Wall passes beat defenders by moving ball AND player.' Demo full pattern. Highlight: firm pass, immediate movement, one-touch return into space.",
            anticipatedResponses: {
              "What if the defender follows my run?":
                "Then your teammate is free! The defender can't guard both.",
              "What if they don't pass it back?":
                "Great question - that's why we communicate. Call for it!",
              "Can I just dribble past?":
                "Sometimes! But when defender is tight, wall pass is your tool.",
            },
          },
          {
            phase: "Walking Rehearsal",
            duration: "2 minutes",
            coachPosition: "Moving between pairs",
            script:
              "Pairs walk through pattern. Focus on sequence: pass, move, receive. Correct body position of wall player. 3 reps each.",
            troubleshooting: {
              "Runner goes too early": [
                "Explain: ball must leave foot first, then you move",
              ],
              "Wall player wrong body shape": [
                "Demo: 'Show me your belly button toward the finish'",
              ],
            },
          },
          {
            phase: "Drill at Pace",
            duration: "5 minutes",
            coachPosition: "Side of channel",
            script:
              "Now game speed. Continuous rotation. Coach position: side view. Call out corrections. Switch channels every 90 seconds.",
            troubleshooting: {
              "Passes consistently bad": [
                "Stop drill, re-demo pass weight",
                "Create target: 'Hit their front foot'",
              ],
              "No one moving after passing": [
                "'Freeze!' Check who moved. 'Pass = first step. Same moment.'",
              ],
            },
          },
          {
            phase: "Progression with Decisions",
            duration: "3 minutes",
            coachPosition: "End of channel",
            script:
              "Wall player now decides: lay off if timing is good, turn and go if timing is bad. Demo bad timing scenario. Make it game-realistic.",
          },
        ],
      },
      troubleshooting: {
        technicalIssues: {
          poorPassWeight: {
            symptoms: [
              "Passes too soft to one-touch",
              "Passes too hard, bouncing off",
            ],
            solutions: [
              "Practice striking through center of ball",
              "Target: firm enough to travel, soft enough to control",
              "Demo repeatedly with verbal 'firm but friendly'",
            ],
          },
          badTiming: {
            symptoms: [
              "Runner arrives too early/late",
              "Ball and player never meet",
            ],
            solutions: [
              "Walk through slowly first",
              "Verbal cue: 'As the ball leaves your foot, you leave too'",
              "Reduce distance for more time",
            ],
          },
          poorBodyShape: {
            symptoms: [
              "Wall player facing wrong way",
              "Can't see runner",
              "Return passes blind",
            ],
            solutions: [
              "'Hips toward target!'",
              "Demo side-on body position",
              "Use cones to mark where feet should point",
            ],
          },
        },
        playerBehavior: {
          frustration: {
            symptoms: ["Giving up", "Blaming partner", "Disengaged"],
            approach:
              "Pair with more skilled partner temporarily. Simplify - just work on the pass. Celebrate small wins.",
          },
          overComplicating: {
            symptoms: [
              "Adding unnecessary touches",
              "Dribbling instead of passing",
              "Ignoring pattern",
            ],
            approach:
              "Constrain: 'Maximum 2 touches each.' Explain why simplicity works.",
          },
        },
        groupIssues: {
          unevenNumbers: {
            symptoms: ["Someone always waiting"],
            solutions: [
              "Odd player becomes permanent wall player",
              "Coach joins in",
              "Three-person rotation",
            ],
          },
          mixedAbilityLevels: {
            symptoms: [
              "Strong players frustrated",
              "Weaker players overwhelmed",
            ],
            solutions: [
              "Pair similar abilities",
              "Different channels for different levels",
              "Different progressions per group",
            ],
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Wall Pass Execution",
            domain: "Technical",
            howItDevelops:
              "Players learn the complete mechanics: pass weight, timing of run, body shape, return pass placement, receiving on the move.",
            levelIndicators: {
              1: "Cannot coordinate pass and movement; frequently miscues",
              2: "Sometimes executes at walking pace; breaks down at speed",
              3: "Executes wall pass at game pace with stationary defender",
              4: "Executes wall pass against moving pressure; good decisions",
              5: "Instinctively uses wall passes in games; varies based on situation",
            },
            assessmentNotes:
              "Watch for the complete sequence. Partial execution (good pass, poor run) is common. All elements must connect.",
          },
          {
            skill: "Passing Under Pressure",
            domain: "Technical",
            howItDevelops:
              "Firm passes to moving targets while also preparing to run. Multi-tasking technical challenge.",
            levelIndicators: {
              1: "Passes inaccurate or mis-weighted",
              2: "Can pass or move, but not both smoothly",
              3: "Accurate passes, then moves as separate actions",
              4: "Passes and moves as one flowing action",
              5: "Disguises passes; varies weight based on context",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "Off-Ball Movement",
            domain: "Tactical",
            howItDevelops:
              "Running into space at the right moment, understanding when and where to move.",
            levelIndicators: {
              1: "Stands still after passing",
              2: "Moves but timing is off",
              3: "Makes run, but path is predictable",
              4: "Times run well, takes effective angle",
              5: "Varies runs, checks shoulder, adjusts to defender",
            },
          },
          {
            skill: "Decision Making in Possession",
            domain: "Tactical",
            howItDevelops:
              "Choosing when to play wall pass vs. other options based on defender position.",
            levelIndicators: {
              1: "No awareness of options",
              2: "Recognizes wall pass option but can't execute",
              3: "Chooses appropriately in practice",
              4: "Reads situations quickly in game-like scenarios",
              5: "Consistently makes right choice at speed in games",
            },
          },
        ],
        physicalDevelopment: {
          acceleration: "Quick bursts after passing",
          agility: "Changing direction to receive return",
          coordination: "Passing while moving, receiving while running",
        },
        psychologicalDevelopment: {
          trust: "Relying on teammate to complete the combination",
          anticipation: "Reading where ball will be played",
          gameIntelligence: "Understanding why wall passes work tactically",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Wall passes are fundamental to breaking down organized defenses. At ages 9-11, players begin to face defenders who don't dive in, making combination play essential. This activity teaches the most basic attacking combination and develops the habit of moving after passing.",
        whenToUseIt: {
          idealFor: [
            "Teaching combination play concepts (introduce or reinforce)",
            "Before small-sided games focused on penetration",
            "When team struggles to break down defenses",
            "Building passing technique under pressure",
          ],
          avoidWhen: [
            "Very beginning of practice (need warm-up first)",
            "Players have no passing foundation (too advanced)",
            "Very limited time (needs adequate practice)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Passing Pairs",
              reason: "Basic passing technique without movement",
            },
            {
              activity: "Triangle Passing",
              reason: "Passing in patterns, moving to next spot",
            },
          ],
          after: [
            {
              activity: "3v2 to Goal",
              reason: "Apply combinations with numbers advantage",
            },
            {
              activity: "Small-Sided Games",
              reason: "Use combinations in game context",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Not recommended - too complex",
            keyPhrases: [],
            avoidSaying: [],
            duration: "N/A",
            simplifications: [
              "Focus on basic passing first",
              "Wall pass too many elements",
            ],
          },
          ages9to11: {
            approach: "Primary teaching age - build foundation",
            keyPhrases: [
              "Pass and go!",
              "Be a wall!",
              "Firm and fast!",
              "Move as you pass!",
            ],
            challenges: [
              "Add defender cone",
              "Competition for speed",
              "Require weak foot",
            ],
            duration: "10-15 minutes with progressions",
          },
          ages12to14: {
            approach: "Refine and apply to game situations",
            keyPhrases: [
              "When would you use this?",
              "Read the defender",
              "Create the 2v1",
            ],
            challenges: [
              "Live defenders",
              "Combined with finishing",
              "Identify opportunities",
            ],
            coachRole: "Facilitate game-scenario discussions",
          },
        },
        commonMisconceptions: {
          "It's just a passing drill":
            "It's a tactical concept that teaches movement, timing, and creating overloads - core attacking principles.",
          "Players will figure it out in games":
            "Wall passes require specific training. The timing and weight of pass don't develop naturally.",
          "Only for advanced players":
            "Ages 9-11 are perfect to introduce. Start simple, build complexity.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We're teaching 'wall passes' or 'give-and-go' - a way to beat defenders by passing to a teammate and immediately running to receive it back. It's like using your teammate as a wall the ball bounces off. This combination play is used at every level of soccer.",
        newsletter:
          "This week: Passing Combinations! We learned wall passes (give-and-go) - one of soccer's most effective ways to beat defenders. Ask your child to explain it: pass, move, receive. Watch for it when you watch soccer on TV - you'll see it constantly!",
        whatToWatchFor: [
          "Does your child move after they pass? (key habit)",
          "Are they looking for teammates to combine with?",
          "Can they explain why wall passes work?",
          "Do they communicate with teammates during combinations?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collision between runner and wall player",
            prevention:
              "Clear lanes, wall player stays in position until ball returned",
            response: "Check both, reinforce positions",
          },
          {
            risk: "Ball striking player not ready",
            prevention: "Communication: 'Playing!' before pass",
            response: "Emphasize verbal cues",
          },
          {
            risk: "Running into cones/poles",
            prevention:
              "Ensure clear finishing area, remove obstacles after pattern",
            response: "Adjust setup for safety",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Adjust distances for different speeds, allow more time for passes",
          newPlayers:
            "Pair with patient partner, walk through multiple times before pace",
          anxiousPlayers:
            "Start as wall player (less pressure), build confidence before initiating",
        },
      },
      coachReflection: {
        afterActivity: [
          "Could players execute the complete sequence at pace?",
          "Did I effectively explain WHY wall passes work?",
          "Were the progressions appropriately challenging?",
          "Did I connect this to game situations?",
        ],
        forImprovement: [
          "What demonstration would be clearer?",
          "How could I better address timing issues?",
          "Which players need extra practice?",
          "How can I ensure this transfers to games?",
        ],
      },
    },
  },
  {
    slug: "1v1-to-goal",
    name: "1v1 to Goal",
    description: "Competitive 1v1 activity where an attacker attempts to beat a defender and score on goal. Develops individual attacking skills (dribbling, moves, finishing), defending technique (body position, patience, tackling), and the ability to perform under direct pressure.",
    sport: "soccer",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 15,
    skillsDeveloped: ["1v1-dribbling-moves", "1v1-defending"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 goal (full-size, mini, or cones)\n□ 8-12 balls at coach position\n□ 8 cones for playing area\n□ 2 different colored pinnies (one per pair)\n□ Optional: second goal for simultaneous games\n\nSPACE: 15x20 paces (narrow encourages 1v1, not running around)\n\nSETUP STEPS\n1. Set up goal at one end\n2. Create playing area 15 wide x 20 long in front of goal\n3. Attacker start position: 20 paces from goal, centered\n4. Defender start position: 10 paces from goal, centered\n5. Coach position: Behind attacker start with balls\n6. Two lines: attackers and defenders\n\nDIAGRAM\n┌──────────────────────────────────────┐\n│                                      │\n│           ┌─────────────┐            │\n│           │    GOAL     │            │\n│           └─────────────┘            │\n│                                      │\n│                 ●                    │  Defender starts here\n│                 D                    │  (10 paces from goal)\n│                                      │\n│                                      │\n│                                      │\n│                 ○                    │  Attacker starts here\n│                 A                    │  (20 paces from goal)\n│                                      │\n│            [COACH + BALLS]           │\n└──────────────────────────────────────┘\n         15 paces wide",
    howToPlay:
      'PHASE 1: EXPLAIN RULES & DEMO (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Side of playing area\n\nSET UP TWO LINES: Attackers behind attacker start, defenders behind defender start.\n\nSAY: "This is 1v1 to Goal - one attacker, one defender, who wins?"\n\nRULES:\n1. Coach plays ball to attacker - game starts immediately\n2. Attacker\'s goal: Score\n3. Defender\'s goal: Win ball and dribble out of area OR kick out of bounds\n4. If ball goes out: restart with new players\n5. After each rep: Attacker goes to defender line, defender to attacker line\n\nDEMO with two players:\n- "Watch - I play the ball... defender closes down... attacker must make a decision... GO!"\n- Let them play to completion\n\nSAY: "Attackers - your job is to beat them and SCORE. Defenders - get tight, be patient, don\'t dive in!"\n\n\nPHASE 2: ROUND 1 - BASIC 1v1 (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Behind attacker line with balls\n\nSTART EACH REP:\n- "Attacker ready? Defender ready? GO!" [play ball to attacker]\n- Ball slightly in front of attacker to create running start\n\nPHRASES FOR ATTACKERS:\n• "Attack the defender!"\n• "Commit them - make them choose!"\n• "Take them on!"\n• "Eyes up - see the goal!"\n\nPHRASES FOR DEFENDERS:\n• "Close the space!"\n• "Get side-on - don\'t square up!"\n• "Patience - don\'t dive in!"\n• "Force them wide!"\n\nKeep pace HIGH - next pair ready as soon as ball is dead.\n\n\nPHASE 3: COACHING MOMENT - ATTACKING (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nGather attackers (defenders get water).\n\nSAY: "Attackers - what\'s working to beat the defender?"\nListen for: Speed, moves, fakes, going at them\n\nTEACH: "The best attackers do THREE things:\n1. Run AT the defender - make them backpedal\n2. Change speed OR direction - make them commit\n3. Accelerate into the space you created"\n\nDEMO: Show slow-slow-FAST rhythm, or dip shoulder one way, go other.\n\nSAY: "Try one of those this round!"\n\n\nPHASE 4: ROUND 2 - FOCUS ON ATTACKING (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nResume 1v1s. Coach specifically watches for and reinforces attacking concepts:\n\n• "Nice change of speed!"\n• "Good - you made them commit first!"\n• "Attack them - don\'t wait!"\n\n\nPHASE 5: COACHING MOMENT - DEFENDING (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nGather defenders (attackers get water).\n\nSAY: "Defenders - what made it hard to stop them?"\nListen for: Speed, moves, when I dove in\n\nTEACH: "Best defenders do THREE things:\n1. Get there FAST, then SLOW DOWN (don\'t fly past)\n2. Stay side-on, one foot ahead (show)\n3. BE PATIENT - wait for bad touch, don\'t dive in"\n\nDEMO: Show approach - fast-slow transition, body position.\n\nSAY: "Your goal: delay them long enough to force a bad touch."\n\n\nPHASE 6: ROUND 3 - FOCUS ON DEFENDING (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nResume 1v1s. Coach specifically watches defenders:\n\n• "Great patience!"\n• "Nice approach - fast then slow!"\n• "Good angle - forcing them wide!"\n\n\nWRAP UP (1 minute)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nQuick tournament option: Count personal wins. "Who scored most? Who defended best?"\n\nGATHER:\nSAY: "1v1 is where games are won and lost. Attackers - commit the defender, change speed, accelerate. Defenders - approach fast, slow down, be patient. Water break!"',
    diagram:
      "SETUP\n┌──────────────────────────────────────┐\n│           ┌───────────┐              │\n│           │   GOAL    │              │\n│           └───────────┘              │\n│                                      │\n│                 ●D (defender)        │\n│                                      │\n│                                      │\n│                                      │\n│                 ○A (attacker)        │\n│                                      │\n│            [COACH + BALLS]           │\n└──────────────────────────────────────┘\n\nDEFENDING BODY POSITION\n          Bad              Good\n     ┌─────────┐      ┌─────────┐\n     │    ●    │      │   ●     │  ● = defender\n     │   ═╪═   │      │  ╱╲     │  Side-on, one\n     │   ╱ ╲   │      │ ╱  ╲    │  foot ahead\n     │         │      │    ↓    │\n     │ Square  │      │ Can     │\n     │ Can go  │      │ only    │\n     │ either  │      │ go one  │\n     │ way     │      │ way     │\n     └─────────┘      └─────────┘",
    coachingPoints: [
      "ATTACKING - Run at defender to force backpedal → Say: 'Attack them! Make them go backward!'",
      "ATTACKING - Change of speed beats defenders → Say: 'Slow-slow-FAST! Change gears!'",
      "ATTACKING - Commit defender before moving → Say: 'Make them choose - then go the other way!'",
      "DEFENDING - Fast approach, slow arrival → Say: 'Sprint to them, then slow your feet!'",
      "DEFENDING - Side-on body position → Say: 'One foot ahead, show them outside!'",
      "DEFENDING - Patience - wait for bad touch → Say: 'Don't dive in! Wait for the mistake!'",
    ],
    questionsToAsk: [
      "'Attackers - what makes a defender easy to beat?' → Diving in, square body position, too much space",
      "'Defenders - when is the best time to tackle?' → Bad touch, head down, off balance",
      "'Why do we get side-on as defenders?' → Force attacker one direction, can't go past on both sides",
      "'What's the danger of diving in?' → Attacker goes around you, easy goal",
      "'How does change of speed help attackers?' → Defender shifts weight, can't react to new direction",
    ],
    commonMistakes: [
      "ATTACKER: Running around defender, not at them → Say: 'Go AT them - make them choose!'",
      "ATTACKER: Doing a move too far from defender → Say: 'Wait until you're close - make them react!'",
      "ATTACKER: Head down, can't see goal → Say: 'Peek up - where are you trying to score?'",
      "DEFENDER: Diving in immediately → Say: 'Patience! One bad touch, then go!'",
      "DEFENDER: Standing square → Say: 'Side-on! One foot ahead, show them outside!'",
      "DEFENDER: Giving too much space → Say: 'Close the gap - make them uncomfortable!'",
      "DEFENDER: Running past attacker → Say: 'Slow your feet as you arrive!'",
    ],
    variations: [
      {
        name: "Counter Attack",
        description:
          "If defender wins ball, they can score on a mini goal behind attacker. Now defender has incentive to win AND go forward.",
        difficulty: "intermediate",
      },
      {
        name: "Timed",
        description:
          "Attacker has 8 seconds to score. Forces quicker decisions, more aggressive attacking.",
        difficulty: "intermediate",
      },
      {
        name: "Different Entry Passes",
        description:
          "Coach varies pass - in air, bouncing, rolling, to feet, to space. More realistic.",
        difficulty: "advanced",
      },
      {
        name: "2v1 Option",
        description:
          "Attacker can call in teammate for support. Develops when to use help vs. go alone.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Attackers never score\n• Defenders never win ball\n• Frustration from one role\n\nSOLUTIONS:\n• Make area wider (more space to attack)\n• Defender starts further from goal\n• Allow attacker small head start\n• Play passive defense first (50% effort)\n• Celebrate effort not just outcome",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Attackers consistently scoring\n• Defenders comfortable\n• Clean executions\n\nSOLUTIONS:\n• Make area narrower (less space)\n• Add time limit (8 seconds)\n• Counter-attack for defender\n• Require specific move to score\n• Add goalkeeper",
    equipmentNeeded: ["1 goal", "8-12 balls", "8 cones", "2 colors of pinnies"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building"],
    tags: [
      "1v1",
      "attacking",
      "defending",
      "dribbling",
      "tackling",
      "finishing",
      "game-based",
      "competitive",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Attacker vs defender to goal - develops individual attacking skills and 1v1 defending technique in competitive, game-realistic scenarios.",
        keyPhrases: [
          "Attack them - make them backpedal!",
          "Slow-slow-FAST!",
          "Side-on, one foot ahead!",
          "Don't dive in - wait for the bad touch!",
        ],
        setupDiagram:
          "15x20 pace area, goal at one end, defender 10 paces from goal, attacker 20 paces",
        quickProgression: {
          easier: "Wider area, passive defense, head start",
          harder: "Narrower area, time limit, counter goal for defender",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up goal and playing area",
            "Have balls easily accessible at your position",
            "Plan pairs to start - mix abilities somewhat",
            "Know your coaching points for attack and defense",
          ],
          mindset:
            "This is COMPETITIVE and should feel like a game. Keep energy high, pace fast. Both attackers and defenders need positive reinforcement - everyone struggles at first.",
        },
        segments: [
          {
            phase: "Explain & Demo",
            duration: "2 minutes",
            coachPosition: "Side of playing area",
            script:
              "Two lines - attackers and defenders. Explain: Coach plays ball, attacker scores, defender wins ball out. Demo with two players. Keep explanation short, let them learn by doing.",
            anticipatedResponses: {
              "What if it goes out?": "Dead ball - next pair, new rep.",
              "Can defender score?": "Not yet - but we'll add that soon!",
              "Who wins if time runs out?":
                "Defender wins - attacker must score.",
            },
          },
          {
            phase: "Round 1 - Basic 1v1",
            duration: "4 minutes",
            coachPosition: "Behind attacker line with balls",
            script:
              "Serve balls to attackers. 'Ready? GO!' Keep pace high - next pair immediately ready. General encouragement both sides.",
            troubleshooting: {
              "Attackers always losing": [
                "Make area wider",
                "Defender starts deeper",
                "Passive defense",
              ],
              "Defenders always losing": [
                "Narrower area",
                "Defender starts closer",
                "Focus on patience message",
              ],
            },
          },
          {
            phase: "Coaching Moment - Attacking",
            duration: "90 seconds",
            coachPosition: "Gathered with attackers",
            script:
              "Three keys: Run AT defender, change speed/direction, accelerate into space. Demo the slow-slow-FAST. Challenge them to try one.",
          },
          {
            phase: "Round 2 - Attacking Focus",
            duration: "3 minutes",
            coachPosition: "Behind attacker line",
            script:
              "Resume 1v1s. Specifically praise attacking concepts: 'Nice change of speed!' 'Good - attacked them!'",
          },
          {
            phase: "Coaching Moment - Defending",
            duration: "90 seconds",
            coachPosition: "Gathered with defenders",
            script:
              "Three keys: Fast approach then slow, side-on position, patience for bad touch. Demo body position. Challenge them.",
          },
          {
            phase: "Round 3 - Defending Focus",
            duration: "3 minutes",
            coachPosition: "Behind attacker line",
            script:
              "Resume 1v1s. Specifically praise defending concepts: 'Great patience!' 'Nice approach!'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          attackersDominating: {
            symptoms: [
              "Goals every time",
              "Defenders frustrated",
              "No challenge",
            ],
            solutions: [
              "Narrower area",
              "Defender starts closer",
              "Add time pressure",
              "Better attacker serves worse defender",
            ],
          },
          defendersDominating: {
            symptoms: [
              "No goals",
              "Attackers frustrated",
              "Defenders diving in winning",
            ],
            solutions: [
              "Wider area",
              "Defender starts deeper",
              "Require passive defense first",
              "Allow head start",
            ],
          },
        },
        playerBehavior: {
          afraidToAttack: {
            symptoms: [
              "Passing back to coach",
              "Running around not at",
              "Hesitant",
            ],
            approach:
              "Pair with passive defender first. Celebrate ANY attempt to take on. Build confidence gradually.",
          },
          overlyAggressive: {
            symptoms: ["Slide tackling", "Dangerous play", "Fouls constantly"],
            approach:
              "Immediate stop. Demonstrate legal defending. 'Hard and fair, not hard and foul.' Repeat offense = sit out.",
          },
          gettingFrustrated: {
            symptoms: [
              "Giving up",
              "Emotional reactions",
              "Blaming partner/coach",
            ],
            approach:
              "Quick private word. Switch role that's easier. Pair with supportive opponent. Focus on one small success.",
          },
        },
        environmentalIssues: {
          spaceTooSmall: {
            symptoms: ["No room to attack", "Defender always wins"],
            solution: "Expand area. If space limited, reduce to fewer pairs.",
          },
          noGoal: {
            symptoms: ["No clear target"],
            solution:
              "Create cone goal 3 paces wide. Ball must go through below knee height.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "1v1 Attacking",
            domain: "Technical",
            howItDevelops:
              "Players learn to take on defenders using moves, changes of pace, and body feints in realistic game situations.",
            levelIndicators: {
              1: "Cannot beat a defender; predictable; no confidence",
              2: "Occasionally beats passive defenders; limited repertoire",
              3: "Has 1-2 moves; can beat defenders in favorable situations",
              4: "Multiple moves; reads defender; consistent success",
              5: "Beats defenders at will; can score under pressure; creates own chances",
            },
            assessmentNotes:
              "Look for variety in approach, not just success rate. A player with multiple options is developing even if not always succeeding.",
          },
          {
            skill: "1v1 Defending",
            domain: "Technical/Tactical",
            howItDevelops:
              "Players learn approach speed, body positioning, patience, and timing of tackle in realistic pressure.",
            levelIndicators: {
              1: "Dives in constantly; easily beaten; no technique",
              2: "Understands patience but can't execute; poor position",
              3: "Good approach; side-on; sometimes wins ball cleanly",
              4: "Consistent technique; forces attacker wide; wins most",
              5: "Reads attacker; wins ball and transitions; excellent timing",
            },
            assessmentNotes:
              "Patience is the hardest skill. Players who wait for the right moment show tactical understanding even if they don't always win.",
          },
        ],
        secondarySkills: [
          {
            skill: "Finishing Under Pressure",
            domain: "Technical",
            howItDevelops:
              "Must finish after beating defender - composure and technique in decisive moment.",
            levelIndicators: {
              1: "Panics near goal; misses badly",
              2: "Sometimes finishes when calm",
              3: "Finishes well with time",
              4: "Composed finishing under pressure",
              5: "Clinical finisher; picks corners; variety of finishes",
            },
          },
          {
            skill: "Tackling Technique",
            domain: "Technical",
            howItDevelops:
              "Legal, effective tackling - poke tackles, block tackles, timing.",
          },
        ],
        physicalDevelopment: {
          acceleration: "Explosive bursts to beat defender or close space",
          agility: "Quick direction changes for both roles",
          balance: "Maintaining control during moves and tackles",
        },
        psychologicalDevelopment: {
          confidence: "Willingness to take on players",
          resilience: "Bouncing back from getting beaten",
          competitiveness: "Drive to win individual battles",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "1v1 situations are the moments that decide games. This activity isolates the key skills - attacking ability to create chances, defending ability to prevent them - in high-repetition, game-realistic format. Both skills are essential and players must practice both roles.",
        whenToUseIt: {
          idealFor: [
            "Middle of practice (main activity)",
            "After warm-up and technical work",
            "Before small-sided games (apply skills)",
            "When team needs more individual confidence",
          ],
          avoidWhen: [
            "Very beginning of practice (too intense)",
            "After very demanding activity (need recovery)",
            "When players are already frustrated",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Shark Attack",
              reason: "Dribbling under pressure without goal",
            },
            {
              activity: "Cone Moves",
              reason: "Technical moves without defender",
            },
          ],
          after: [
            {
              activity: "2v2 to Goals",
              reason: "Apply skills with teammate support",
            },
            {
              activity: "Small-Sided Games",
              reason: "Full game context",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep playful, celebrate all attempts",
            keyPhrases: [
              "Try to get past!",
              "Superheroes defend!",
              "Can you score?",
            ],
            avoidSaying: [
              "You need to work on your moves (too abstract)",
              "Stay side-on (too technical)",
            ],
            duration: "5-7 minutes max (short attention)",
            simplifications: [
              "Passive defense",
              "Wide area",
              "Praise all attempts",
            ],
          },
          ages9to11: {
            approach: "Technical focus, develop vocabulary",
            keyPhrases: [
              "Change speed!",
              "Side-on body position!",
              "Patience!",
            ],
            challenges: [
              "Time pressure",
              "Counter-attack",
              "Specific moves required",
            ],
            duration: "12-15 minutes with coaching breaks",
          },
          ages12to14: {
            approach: "Game-realistic pressure, self-analysis",
            keyPhrases: [
              "What did the defender give you?",
              "When was the right moment to tackle?",
            ],
            challenges: ["Smaller space", "Higher pressure", "Self-evaluation"],
            coachRole: "Ask questions, let them solve problems",
          },
        },
        commonMisconceptions: {
          "Some players are just not 1v1 players":
            "All players need 1v1 skills. Midfielders face 1v1s constantly. It's trainable.",
          "1v1 drills encourage selfish play":
            "Players learn WHEN to take on and when to pass. 1v1 is a tool, not a style.",
          "Focus on attack or defense, not both":
            "Players need both. Game situations require both. Always rotate roles.",
        },
      },
      parentCommunication: {
        ifAsked:
          "1v1 to Goal teaches your child how to beat defenders and how to stop attackers - both essential soccer skills. Every game has dozens of 1v1 moments. We practice both attacking (using moves, changes of speed) and defending (patience, body position, timing).",
        newsletter:
          "This week: 1v1 to Goal! Your child practiced taking on defenders and stopping attackers. Watch for them trying new moves in games - they might not work every time, but that willingness to take on players is exactly what we want to develop!",
        whatToWatchFor: [
          "Does your child attempt to dribble past defenders? (confidence)",
          "Do they stay patient when defending or dive in?",
          "Can they change speed or direction to beat players?",
          "Do they get frustrated when beaten, or try again?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Slide tackles causing injury",
            prevention: "No slide tackles rule - stay on feet",
            response:
              "Immediate stop if occurs, yellow card warning, repeat = out",
          },
          {
            risk: "Collision at speed",
            prevention: "Adequate space, awareness emphasis",
            response: "Check both players, review safer approach",
          },
          {
            risk: "Ball to face at close range",
            prevention:
              "Shooting from distance, awareness of opponent position",
            response: "Ice if needed, review shooting safety",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Pair similar physical abilities when possible, or give smaller player advantages (head start, passive defense)",
          newPlayers:
            "Start against experienced but supportive opponent, passive defense first round",
          anxiousPlayers:
            "Start as defender (reactive role), transition to attacker once confident",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did both attackers and defenders have success?",
          "Did I coach both roles equally?",
          "Was the pace high enough to maintain engagement?",
          "Did players try the techniques I taught?",
        ],
        forImprovement: [
          "What adjustments to area size would help balance?",
          "Which players need more work on attack vs. defense?",
          "How can I better communicate body position concepts?",
          "What variations would add challenge for advanced players?",
        ],
      },
    },
  },
  {
    slug: "rondo-4v1-v2",
    name: "Rondo 4v1",
    description: "Classic possession game with four players keeping the ball from one defender in a confined space. Develops passing accuracy, receiving technique, body positioning, support angles, and the fundamental ability to keep possession under pressure.",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 5,
    maxPlayers: 20,
    durationMinutes: 12,
    skillsDeveloped: ["receiving-first-touch", "passing-short", "support-play"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per group\n□ 4 cones per group (different color from other groups)\n□ 1 pinnie per defender\n□ Space for multiple groups (recommended: 3-4 groups)\n\nSPACE: 8x8 paces per group (adjust based on ability)\n\nSETUP STEPS\n1. Create 8x8 pace squares with cones\n2. Four players on corners/edges, one defender in middle\n3. Defender wears pinnie\n4. Groups spaced so balls don't interfere\n5. Spare balls nearby for quick restarts\n\nDIAGRAM\n┌─────────────────────────────────────────────────────┐\n│                                                     │\n│    ▲──────────▲         ▲──────────▲               │\n│    │    ●     │         │    ●     │               │\n│    │  ○   ○   │         │  ○   ○   │               │  Two groups\n│    │    ○     │         │    ○     │               │  shown\n│    ▲──────────▲         ▲──────────▲               │\n│       8x8                  8x8                      │\n│       paces                paces                    │\n│                                                     │\n└─────────────────────────────────────────────────────┘\n\n▲=cone  ○=possession player  ●=defender (pinnie)",
    howToPlay:
      'PHASE 1: EXPLAIN & DEMONSTRATE (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: At one rondo grid, other groups watching\n\nSAY: "This is Rondo - the most famous soccer training game in the world. Barcelona, Manchester City, every top team does this."\n\nSETUP ONE GROUP and demonstrate:\n\nSAY: "Four players keep the ball. One defender tries to win it. Simple rules:\n1. If defender wins ball or it goes out: Whoever made the mistake becomes defender\n2. Maximum 2 touches (start with unlimited)\n3. You CAN\'T pass to person next to you through the middle - the defender would intercept"\n\nDEMONSTRATE with 4 players:\n- Show good passing\n- Show body position to receive\n- Show what happens when defender wins it\n\nKEY POINTS during demo:\n• "See how they\'re OPEN to receive - not facing the passer?"\n• "Notice the pass is firm enough to reach but not too hard"\n• "Watch how quickly they move the ball when pressure comes"\n\n\nPHASE 2: FREE PLAY ROUND (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSplit into groups of 5. "GO - let\'s see what happens!"\n\nCoach Position: Moving between groups\n\nOBSERVE FOR:\n□ Are possessors opening their body or back to play?\n□ Is defender working or standing in middle?\n□ Is ball moving quickly or slowly?\n□ Quality of first touch - under control or bouncing away?\n\nKEEP TRACK: Who\'s struggling as defender too long? (Group not supporting properly or their own skill?)\n\n\nPHASE 3: COACHING MOMENT - RECEIVING (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "FREEZE! Everyone come in."\n\nASK: "When you have the ball, can you see everyone?"\nKey point: Body position when receiving determines options.\n\nTEACH: "Before the ball arrives, OPEN YOUR BODY - hips facing the field, not the passer. Now you can see everyone AND pass either direction."\n\nDEMO: Show closed (can only pass back) vs open (can pass anywhere).\n\nSAY: "Watch me receive... closed [show limited options]... open [show all options]. HUGE difference."\n\n\nPHASE 4: PLAY WITH BODY POSITION FOCUS (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nResume rondos. Coach moves between groups praising:\n\n• "Great body position!"\n• "I can see your chest - that\'s open!"\n• "Check your hips before the ball comes!"\n\nSPECIFIC CORRECTION: When you see closed body position: "OPEN! Show me your belly button toward the middle!"\n\n\nPHASE 5: COACHING MOMENT - DEFENDER (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Defenders - how do you win the ball?"\nListen for: Go toward ball, cut passing lanes, wait for bad touch\n\nTEACH: "Best defenders in rondo do TWO things:\n1. Cut off one passing lane (eliminate one option)\n2. SPRINT when the ball is traveling (that\'s when possessor can\'t escape)"\n\nDEMO: Show cutting passing lane, then bursting as ball travels.\n\nSAY: "Don\'t jog in the middle - be a pest! Make them uncomfortable!"\n\n\nPHASE 6: PLAY WITH DEFENDER FOCUS (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nResume rondos. Now praise defenders:\n\n• "Great pressure on the ball!"\n• "Yes! You cut that lane!"\n• "Good burst while ball was moving!"\n\n\nWRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nGather quickly.\n\nSAY: "Rondo teaches possession soccer - quick passes, good body position, moving the ball faster than defender can move. The best teams in the world warm up with this every single day. Remember: OPEN body, FIRM passes, MOVE the defender. Water break!"',
    diagram:
      "BODY POSITION\n    CLOSED (Bad)          OPEN (Good)\n    ┌─────────┐          ┌─────────┐\n    │    ↑    │          │ ←  ●  → │\n    │    ●    │          │    ↑    │\n    │    ↓    │          │    ↓    │\n    │Can only │          │Can pass │\n    │pass back│          │anywhere │\n    └─────────┘          └─────────┘\n\nSUPPORT POSITIONS\n        ○ ←─ can receive\n        │\n    ○───●───○\n        │\n        ○ ←─ can receive\n\nAll 4 should be available options, not in defender's shadow",
    coachingPoints: [
      "BODY POSITION - Open to field before receiving → Say: 'Show me your belly button toward the middle!'",
      "FIRST TOUCH - Out of feet, away from pressure → Say: 'Touch it where you want to pass next!'",
      "PASS WEIGHT - Firm enough to get there, soft enough to control → Say: 'Firm but friendly!'",
      "SUPPORT ANGLE - Don't hide behind defender → Say: 'Can the passer see you? Move to show yourself!'",
      "PLAY QUICKLY - Move ball faster than defender moves → Say: 'Quick! Make the ball do the work!'",
      "DEFENDER WORK - Cut lanes, burst when ball travels → Say: 'Don't jog - hunt! Pressure when ball moves!'",
    ],
    questionsToAsk: [
      "'Why do we open our body before receiving?' → To see all options, can pass anywhere",
      "'When should the defender sprint?' → When ball is traveling, receiver can't escape",
      "'Why not pass to the player next to you through the middle?' → Defender can intercept, too risky",
      "'What's a good first touch?' → Away from pressure, toward where you'll pass",
      "'How do you make space as a possessor?' → Move to angle where defender can't cover you",
    ],
    commonMistakes: [
      "BACK TO PLAY WHEN RECEIVING → Say: 'Open before the ball arrives! Show me your hips!'",
      "SOFT PASSES THAT DON'T ARRIVE → Say: 'Firm pass! The ball should be begging to be passed again!'",
      "STANDING STILL AFTER PASSING → Say: 'After you pass, adjust your position!'",
      "DEFENDER JOGGING IN MIDDLE → Say: 'Hunt! Pressure! Make them uncomfortable!'",
      "PASSING INTO DEFENDER → Say: 'Look before you pass - where's the defender?'",
      "POOR FIRST TOUCH GIVES BALL AWAY → Say: 'Soft first touch, away from danger'",
    ],
    variations: [
      {
        name: "3v1 (Easier)",
        description:
          "Three possessors, one defender. Larger grid (10x10). Easier to maintain possession.",
        difficulty: "beginner",
      },
      {
        name: "4v2",
        description:
          "Four possessors, two defenders. Same grid. Much harder - requires quicker decisions.",
        difficulty: "advanced",
      },
      {
        name: "5v2",
        description:
          "Five possessors in larger grid, two defenders. More game-realistic numbers.",
        difficulty: "advanced",
      },
      {
        name: "Two Touch Maximum",
        description:
          "Can only take two touches - forces quicker decisions and better body position.",
        difficulty: "intermediate",
      },
      {
        name: "One Touch Bonus",
        description:
          "Count consecutive one-touch passes. High score wins. Develops quick play.",
        difficulty: "advanced",
      },
      {
        name: "Transition Rondo",
        description:
          "If defender wins, they immediately become attacker and previous passer becomes defender. Quicker transitions.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Defender wins constantly\n• Possessors stressed, not enjoying\n• Poor technique breaking down\n\nSOLUTIONS:\n• Make grid bigger (10x10 instead of 8x8)\n• Do 3v1 instead of 4v1\n• Allow unlimited touches\n• Let defender only walk (no running)\n• Coach plays as 5th possessor temporarily",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Possessors keeping ball easily\n• Defender can't get near ball\n• Players asking for more challenge\n\nSOLUTIONS:\n• Make grid smaller (6x6)\n• Two touch maximum\n• Add second defender (4v2)\n• One touch bonus points\n• Timed: How many passes in 60 seconds?",
    equipmentNeeded: [
      "1 ball per group",
      "4 cones per group",
      "1 pinnie per defender",
    ],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building"],
    tags: [
      "rondo",
      "possession",
      "passing",
      "receiving",
      "body-position",
      "support",
      "tactical",
      "game-based",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Four players keep ball from one defender in small grid - develops passing, receiving, body position, and possession under pressure.",
        keyPhrases: [
          "Open your body - show me your belly button!",
          "Firm but friendly passes!",
          "Move the ball faster than they move!",
          "Hunt! Don't jog!",
        ],
        setupDiagram:
          "8x8 pace grid, 4 corners with players, 1 defender in middle with pinnie",
        quickProgression: {
          easier: "Bigger grid, 3v1, unlimited touches",
          harder: "Smaller grid, 4v2, two touch max",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up multiple grids (1 per 5 players)",
            "Have pinnies ready for defenders",
            "Spare balls at each grid",
            "Know your groupings in advance",
          ],
          mindset:
            "Rondo is about QUALITY of technique, not just keeping possession. Coach the details: body position, touch, pass weight. Celebrate good technique even when ball is lost.",
        },
        segments: [
          {
            phase: "Explain & Demo",
            duration: "2 minutes",
            coachPosition: "At one grid, others watching",
            script:
              "Frame it: 'Every top team does this.' Demo with 4 players. Show: passing, body position, what happens when defender wins. Highlight open vs closed body.",
            anticipatedResponses: {
              "What if ball goes out?":
                "Same as defender winning - whoever hit it out becomes defender.",
              "Can I pass to anyone?":
                "Yes! But not through the middle to neighbor - too risky.",
              "What if defender never gets it?":
                "Then you're doing great! We'll add challenges.",
            },
          },
          {
            phase: "Free Play",
            duration: "3 minutes",
            coachPosition: "Moving between groups",
            script:
              "Let them play. Observe: body position, defender effort, ball speed, first touch quality. Note who needs coaching.",
            troubleshooting: {
              "One group losing ball constantly": [
                "Make their grid bigger",
                "Coach steps in as 5th",
                "Check body positions",
              ],
              "Defender stuck too long": [
                "Rotate defender after 60 seconds regardless",
                "Coach possession quality",
              ],
            },
          },
          {
            phase: "Coaching Moment - Receiving",
            duration: "90 seconds",
            coachPosition: "Center, all groups listening",
            script:
              "FREEZE! Teach body position: open = belly button to middle = all options. Demo closed vs open. Huge difference in options.",
          },
          {
            phase: "Play with Body Focus",
            duration: "3 minutes",
            coachPosition: "Moving between groups",
            script:
              "Resume play. Specifically coach body position. 'Open up!' 'Check your hips!' 'Great body position!'",
          },
          {
            phase: "Coaching Moment - Defender",
            duration: "90 seconds",
            coachPosition: "Center",
            script:
              "Teach defender: cut lanes, burst when ball travels. Demo cutting lane then sprinting. 'Don't jog - be a pest!'",
          },
          {
            phase: "Play with Defender Focus",
            duration: "2 minutes",
            coachPosition: "Moving between groups",
            script:
              "Resume play. Now praise defenders: 'Great pressure!' 'You cut that lane!' 'Good burst!'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          possessorsDominating: {
            symptoms: [
              "Defender never touches ball",
              "Too easy",
              "Players disengaged",
            ],
            solutions: [
              "Smaller grid",
              "Add second defender",
              "Two touch limit",
              "Better defender in",
            ],
          },
          defenderDominating: {
            symptoms: ["Constant turnovers", "Frustration", "No rhythm"],
            solutions: [
              "Bigger grid",
              "Remove to 3v1",
              "Unlimited touches",
              "Defender must hop",
            ],
          },
        },
        playerBehavior: {
          notTrying: {
            symptoms: ["Lazy passes", "Not moving", "Disengaged"],
            approach:
              "Add competition: 'Which group can get 10 passes?' Give defender points for wins.",
          },
          tooCompetitive: {
            symptoms: [
              "Arguments about rules",
              "Excessive celebrating",
              "Teasing stuck defender",
            ],
            approach:
              "Remind: 'It's training, not tournament.' Rotate groups. Remove points if needed.",
          },
          defenderGivingUp: {
            symptoms: ["Standing in middle", "Not trying", "Wants out"],
            approach:
              "Time limit: 'Defender switches every 30 seconds regardless.' Teach defender technique.",
          },
        },
        technicalIssues: {
          poorFirstTouch: {
            symptoms: [
              "Ball bouncing away",
              "Giving defender time",
              "Losing control",
            ],
            solutions: [
              "Practice receiving warm-up first",
              "Bigger grid (more time)",
              "Emphasize cushion",
            ],
          },
          poorPassWeight: {
            symptoms: [
              "Passes too soft (intercepted)",
              "Passes too hard (can't control)",
            ],
            solutions: [
              "Demo 'firm but friendly'",
              "Practice passing pairs first",
              "Verbal cue on each pass",
            ],
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Receiving / First Touch",
            domain: "Technical",
            howItDevelops:
              "Constant receiving under pressure develops quality first touch and body positioning habits.",
            levelIndicators: {
              1: "Ball bounces away; can't control under pressure",
              2: "Controls eventually but slow; gives defender time",
              3: "Clean first touch most of time; occasional error under pressure",
              4: "Excellent touch; sets up next action; rarely loses control",
              5: "Perfect touch every time; can receive any ball; under any pressure",
            },
            assessmentNotes:
              "Watch the moment of reception. Where does the ball go? Can they pass immediately after?",
          },
          {
            skill: "Passing Accuracy & Weight",
            domain: "Technical",
            howItDevelops:
              "Every pass must be perfect or defender wins. Develops precise, firm passing.",
            levelIndicators: {
              1: "Passes frequently miss target or wrong weight",
              2: "Hits target but inconsistent weight",
              3: "Accurate passes, appropriate weight most times",
              4: "Consistently accurate; varies weight based on context",
              5: "Perfect passes; can disguise; can vary to create advantages",
            },
          },
          {
            skill: "Body Positioning / Orientation",
            domain: "Tactical",
            howItDevelops:
              "Must open body before receiving to have options - develops scanning and awareness.",
            levelIndicators: {
              1: "Back to play; no awareness",
              2: "Sometimes opens but inconsistent",
              3: "Usually open; sees 2-3 options",
              4: "Always open; reads defender; chooses best option",
              5: "Perfect positioning; manipulates defender; creates advantages",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "Support Play / Angles",
            domain: "Tactical",
            howItDevelops:
              "Players learn to position where they can receive - not hidden behind defender.",
            levelIndicators: {
              1: "Stands behind defender; hidden",
              2: "Shows for ball but poor angle",
              3: "Usually in good support position",
              4: "Constantly adjusts to create angles",
              5: "Perfect support; creates 2v1 moments; facilitates flow",
            },
          },
          {
            skill: "Defending in Small Spaces",
            domain: "Tactical",
            howItDevelops:
              "Defender learns to read passing lanes, close quickly, and pressure ball.",
          },
        ],
        physicalDevelopment: {
          agility: "Quick turns to receive from different angles",
          quickness: "Fast feet to move ball",
          spatialAwareness: "Understanding space in tight area",
        },
        psychologicalDevelopment: {
          composure: "Staying calm under pressure",
          concentration: "Constant focus required",
          resilience: "Getting beaten and continuing to work",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Rondo is the foundational possession exercise. It teaches the core skills - receiving, passing, positioning - in a game-realistic pressure environment. The small space forces quality. The constant repetition builds habits. There's a reason every top team uses it daily.",
        whenToUseIt: {
          idealFor: [
            "Warm-up (after initial movement)",
            "Technical focus on passing/receiving",
            "Teaching possession concepts",
            "Before passing-focused practice",
          ],
          avoidWhen: [
            "Very beginning (need movement warm-up first)",
            "When space is extremely limited",
            "When group has no passing foundation",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Passing Pairs",
              reason: "Basic technique without pressure",
            },
            {
              activity: "Triangle Passing",
              reason: "Movement after passing, no defender",
            },
          ],
          after: [
            {
              activity: "5v5 Small-Sided Game",
              reason: "Apply possession in game",
            },
            {
              activity: "Possession Games 6v4",
              reason: "Numbers advantage possession with goals",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Modified - bigger space, simpler rules",
            keyPhrases: ["Keep away!", "Pass it quick!", "Can you get it?"],
            avoidSaying: ["Open your body (too abstract)", "Support angle"],
            duration: "5-6 minutes max",
            simplifications: [
              "12x12 grid",
              "3v1",
              "Unlimited touches",
              "No middle pass rule",
            ],
          },
          ages9to11: {
            approach: "Full rondo with technical coaching",
            keyPhrases: [
              "Open your body!",
              "Firm pass!",
              "Move it quick!",
              "Hunt!",
            ],
            challenges: ["Standard 8x8", "Two touch max", "One-touch bonus"],
            duration: "10-12 minutes with coaching stops",
          },
          ages12to14: {
            approach: "High intensity, player-led",
            keyPhrases: ["Why did you lose it?", "What did defender do well?"],
            challenges: [
              "Small grid (6x6)",
              "4v2",
              "Competition: passes in 60 seconds",
            ],
            coachRole: "Observe, ask questions, let players problem-solve",
          },
        },
        commonMisconceptions: {
          "It's just keep away":
            "Rondo teaches specific technical and tactical skills - body position, pass weight, support - not just keeping possession.",
          "Defender just runs around":
            "Good rondo coaches BOTH roles. Defender learns pressing, lane cutting, reading. Both roles matter.",
          "Too small to be realistic":
            "The tight space FORCES quality. Game situations have tight moments. Rondo prepares for them.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Rondo is the most famous soccer training game in the world - Barcelona, Manchester City, every top team does it. Four players keep the ball from one defender in a small space. It teaches quick passing, good first touch, and body positioning. Your child is learning how the pros train!",
        newsletter:
          "This week: Rondo! This classic game teaches possession soccer - quick passes, good body position, moving the ball faster than defenders can move. Watch Barcelona warm up on YouTube and you'll see them playing rondo!",
        whatToWatchFor: [
          "Does your child 'open up' to receive (body facing field, not passer)?",
          "Are their passes firm enough to get there?",
          "Do they stay calm under pressure or panic?",
          "Are they hunting when defending or just jogging?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions in small space",
            prevention: "Appropriate grid size, awareness emphasis",
            response: "Check players, adjust grid if needed",
          },
          {
            risk: "Ankle injuries from quick turns",
            prevention: "Proper warm-up before rondo, good surface",
            response: "Rest, ice if needed, return only when ready",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Adjust grid size, pair similar abilities in groups",
          newPlayers:
            "Place with supportive players, allow more touches, celebrate any success",
          anxiousPlayers:
            "Start as possessor (more support), ensure encouraging group",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did I coach body position effectively?",
          "Were the grids appropriate size for ability?",
          "Did defenders also improve?",
          "Did all players get reps in both roles?",
        ],
        forImprovement: [
          "What adjustments to grid size needed?",
          "How can I better explain body position concept?",
          "Which players need individual work on first touch?",
          "Should I add/reduce progression challenges?",
        ],
      },
    },
  },
  {
    slug: "small-sided-game-5v5-v2",
    name: "Small-Sided Game 5v5",
    description: "Structured 5v5 game with specific tactical constraints to develop game intelligence. Uses conditions like limited touches, directional play, or transition rules to focus players on specific learning outcomes while maintaining game realism.",
    sport: "soccer",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 10,
    maxPlayers: 14,
    durationMinutes: 20,
    skillsDeveloped: ["support-play", "when-to-dribble-vs-pass", "finding-space"],
    setupInstructions:
      'EQUIPMENT CHECKLIST\n□ 2 goals (mini goals 4-5 feet work best, or cones)\n□ 8 cones for boundaries\n□ 2 sets of pinnies (different colors)\n□ 4-6 balls (for quick restart)\n□ Optional: 2 different colored cones to mark special zones\n\nSPACE: 40x30 paces (length x width)\n\nSETUP STEPS\n1. Place goals at each end of 40x30 area\n2. Mark boundaries with corner cones\n3. Split into two teams of 5 (or 5v5 + subs)\n4. Give pinnies to one team\n5. Place balls behind each goal for quick restarts\n6. Optional: Mark "end zones" if using that variation\n\nDIAGRAM\n┌────────────────────────────────────────────────────┐\n│    ┌───┐                               ┌───┐      │\n│    │ G │                               │ G │      │\n│    └───┘                               └───┘      │\n│ ▲                                             ▲   │\n│                                                   │\n│                                                   │\n│                    40 paces                       │\n│                                                   │\n│                                                   │\n│                                                   │\n│ ▲                                             ▲   │\n└────────────────────────────────────────────────────┘\n              30 paces\n\n▲=corner cones  G=goal  (4-5 feet wide)\n5v5 in this space, or 6v6 if numbers allow',
    howToPlay:
      'PHASE 1: FREE PLAY OBSERVATION (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Sideline, middle of field\n\nSAY: "5v5! Regular game rules. Out of bounds = throw-in or goal kick. Let\'s see what you\'ve got. GO!"\n\nOBSERVE WITHOUT COACHING. Watch for:\n□ Do they look to pass or only dribble?\n□ Do they support the ball or watch?\n□ Do they spread out or bunch?\n□ How do they transition (attack → defense)?\n\nThis free play reveals what they understand and what needs coaching.\n\nAFTER 4 MINUTES: "FREEZE! Come in for a minute."\n\n\nPHASE 2: COACHING MOMENT #1 (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nBased on what you observed, choose ONE thing to teach:\n\nOPTION A - If bunching / not spreading:\nSAY: "When we have the ball, where should players without the ball go?"\nWait for: "Space" / "Away from defenders"\nTEACH: "Width and length! Imagine you\'re stretching the field. Make yourself available to help."\n\nOPTION B - If only dribbling / not passing:\nSAY: "What\'s faster - you dribbling or the ball being passed?"\nWait for: "Passing"\nTEACH: "Move the ball! When you have options, play quickly. Dribble when there\'s no pass, pass when there is."\n\nOPTION C - If poor transition:\nSAY: "What should we do the INSTANT we lose the ball?"\nWait for: "Get it back" / "Defend"\nTEACH: "WIN IT BACK! 3 seconds - everyone pressure for 3 seconds when we lose it."\n\nPick ONE focus. Don\'t overwhelm with multiple concepts.\n\n\nPHASE 3: CONDITIONED GAME - ROUND 1 (5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nAdd a CONDITION related to your coaching point:\n\nCONDITION A - Spreading:\n"Goals only count if ALL attacking players are in opponent\'s half when goal is scored."\nThis forces width/length to create space.\n\nCONDITION B - Passing:\n"Maximum 4 touches per player. Take more than 4 and other team gets ball."\nThis forces looking up and passing.\n\nCONDITION C - Transition:\n"If you win the ball and score within 5 seconds, it counts as 2 goals."\nThis rewards quick transition play.\n\nSAY: "Same game, but now [explain condition]. Let\'s see how it changes things. GO!"\n\nCOACH DURING PLAY:\n• Reinforce the focus: "Great - you spread the field!"\n• Remind of condition: "Remember - 4 touch max!"\n• Celebrate when condition is met: "DOUBLE GOAL! Great transition!"\n\n\nPHASE 4: COACHING MOMENT #2 (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "FREEZE! Come in."\n\nASK: "How did the condition change how you played?"\nListen for their understanding of WHY the condition helped.\n\nTEACH: Connect to real game:\n• "That spreading you did? That\'s exactly what to do in your games on Saturday."\n• "Looking up to find the pass? That\'s game intelligence."\n• "Winning it back quickly? That\'s how championship teams play."\n\nAdd or modify condition for next round:\n\nPROGRESSION OPTIONS:\n• Keep same condition but smaller space (harder)\n• Change to different condition\n• Remove condition but challenge them to keep the habit\n\n\nPHASE 5: CONDITIONED GAME - ROUND 2 (5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nRun second round with same or modified condition.\n\nCOACHING CONTINUES:\n• Stay focused on ONE concept\n• Celebrate good decisions\n• Question poor decisions: "Was there a pass there?"\n\nKeep score - competition matters!\n\n\nPHASE 6: FREE PLAY FINISH (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Last 3 minutes - NO CONDITIONS. Regular game. But I want to see you KEEP the habit we practiced. Show me you learned something!"\n\nOBSERVE: Are they maintaining the behavior without the condition?\n\nThis tests if learning has stuck.\n\n\nWRAP UP (1 minute)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Freeze! Great session."\n\nASK: "What\'s ONE thing you\'ll remember from this game?"\nListen for: Focus concept (spreading, passing, transition)\n\nSAY: "I saw [specific example of good play]. That\'s GAME INTELLIGENCE - making good decisions under pressure. That\'s what separates good players from great ones. Water break!"',
    diagram:
      "FIELD LAYOUT\n┌────────────────────────────────────────────────────┐\n│         ┌───┐                      ┌───┐          │\n│         │ G │                      │ G │          │\n│         └───┘                      └───┘          │\n│                                                   │\n│    TEAM A                          TEAM B         │\n│    (5 players)                     (5 players)    │\n│                                                   │\n│                  40 x 30 paces                    │\n│                                                   │\n│    Formation suggestions:                         │\n│    1-2-2 (diamond)                               │\n│    or 1-3-1                                      │\n│                                                   │\n└────────────────────────────────────────────────────┘\n\nSPACING CONCEPT\n    Good (spread)           Bad (bunched)\n┌────────────────────┐   ┌────────────────────┐\n│  ○           ○     │   │                    │\n│       ○            │   │     ○○○○○          │\n│  ○           ○     │   │      (ball)        │\n│                    │   │                    │\n│ Uses whole field   │   │ Easy to defend     │\n└────────────────────┘   └────────────────────┘",
    coachingPoints: [
      "SPACING - Use width and length → Say: 'Stretch the field - make yourself available!'",
      "SUPPORT - Give options to ball carrier → Say: 'Can they pass to you? Show yourself!'",
      "PASSING vs DRIBBLING - Ball moves faster → Say: 'Move the ball! Pass is faster than dribbling!'",
      "TRANSITION - Quick reaction to losing ball → Say: '3 seconds! Win it back NOW!'",
      "DECISION MAKING - Choose right action → Say: 'What's the best option right now?'",
      "COMMUNICATION - Talk to teammates → Say: 'Use your voice! Call for it, give directions!'",
    ],
    questionsToAsk: [
      "'When you have the ball, what are you looking for?' → Open teammates, space to dribble, goal",
      "'Where should teammates without the ball be?' → In space, available to receive, not hiding",
      "'What do we do the instant we lose possession?' → Win it back, pressure ball, get organized",
      "'Why does spacing help our team?' → More passing options, harder to defend, creates 1v1s",
      "'How does the condition change how you play?' → Forces good habits, makes you think differently",
    ],
    commonMistakes: [
      "BALL WATCHING - not moving without ball → Say: 'If you don't have the ball, you're not on vacation - move to help!'",
      "BUNCHING AROUND BALL → Say: 'Spread out! You're making it easy for them!'",
      "ONLY DRIBBLING, NEVER PASSING → Say: 'Is there a pass? Ball moves faster than you!'",
      "SLOW TRANSITION → Say: 'We lost it - 3 seconds to win it back! NOW!'",
      "NOT COMMUNICATING → Say: 'Use your words! Call for it! Tell them where to go!'",
      "STANDING STILL WHEN TEAMMATE HAS BALL → Say: 'Move to help! Give them an option!'",
    ],
    variations: [
      {
        name: "Touch Restriction",
        description:
          "Maximum touches (4, 3, or 2 touch). Forces quick play and looking up.",
        difficulty: "intermediate",
      },
      {
        name: "Transition Goals",
        description:
          "Goals within 5 seconds of winning ball count double. Rewards quick transition.",
        difficulty: "intermediate",
      },
      {
        name: "All In To Score",
        description:
          "Goal only counts if all attackers in opponent's half. Forces forward support.",
        difficulty: "intermediate",
      },
      {
        name: "End Zone Game",
        description:
          "Score by dribbling into end zone (not goals). Encourages penetrating dribble.",
        difficulty: "intermediate",
      },
      {
        name: "Target Player",
        description:
          "Must play through target player before shooting. Develops build-up patterns.",
        difficulty: "advanced",
      },
      {
        name: "Counter-Attack",
        description:
          "One team defends deep, wins ball, and attacks. Practice defensive organization and transitions.",
        difficulty: "advanced",
      },
      {
        name: "Numerical Overload",
        description:
          "5v4 or 6v4 to practice playing with/against advantage. Possession team must finish quickly.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Can't maintain possession at all\n• Condition too confusing\n• Chaotic, no shape or purpose\n\nSOLUTIONS:\n• Bigger field (more time on ball)\n• Remove condition temporarily\n• Play 5v4 (possession advantage)\n• Slow the game down (walking soccer)\n• Add neutral player who plays for whoever has ball",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Executing condition easily\n• Good decisions, good spacing\n• Asking for more challenge\n\nSOLUTIONS:\n• Smaller field (less time/space)\n• Stricter touch limit (2 touch)\n• Multiple conditions combined\n• Equal numbers or down a player\n• Time pressure on goals",
    equipmentNeeded: ["2 goals", "8 cones", "2 sets of pinnies", "4-6 balls"],
    spaceRequired: "large",
    indoorSuitable: false,
    appropriateStages: ["skill-building"],
    tags: [
      "game",
      "5v5",
      "small-sided",
      "tactical",
      "decision-making",
      "transition",
      "possession",
      "conditioned",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Structured 5v5 game with specific conditions that force players to practice tactical concepts in game-realistic environment.",
        keyPhrases: [
          "Stretch the field!",
          "Move the ball!",
          "3 seconds - win it back!",
          "What's the best option?",
        ],
        setupDiagram: "40x30 pace field, goals at each end, 5v5 with pinnies",
        quickProgression: {
          easier: "Bigger field, remove conditions, play 5v4",
          harder: "Smaller field, 2-touch limit, multiple conditions",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up field with goals and boundaries",
            "Have pinnies ready for teams",
            "Place spare balls behind each goal",
            "Decide on potential conditions based on team needs",
          ],
          mindset:
            "This is a GAME with teaching moments, not a drill that looks like a game. Let them play. Observe. Coach deliberately. One concept at a time. Conditions should HELP them, not confuse them.",
        },
        segments: [
          {
            phase: "Free Play Observation",
            duration: "4 minutes",
            coachPosition: "Sideline, middle of field",
            script:
              "Let them play - no coaching. Watch: passing vs dribbling, spacing, transition, communication. This reveals what to teach.",
            anticipatedResponses: {
              "What are the rules?":
                "Regular soccer. Out = throw-in or goal kick. Play!",
              "Do we have positions?":
                "Figure it out together. Just don't all stand in one spot.",
            },
          },
          {
            phase: "Coaching Moment #1",
            duration: "90 seconds",
            coachPosition: "Center, teams gathered",
            script:
              "Based on observation, teach ONE concept. Spacing: 'Stretch the field.' Passing: 'Ball faster than dribbling.' Transition: 'Win it back in 3 seconds.' Choose based on what you saw.",
            troubleshooting: {
              "Can't decide what to coach": [
                "Pick most obvious issue",
                "When in doubt, coach spacing",
              ],
              "Players disagree with feedback": [
                "Show them: 'Watch this' and point out example",
                "Ask questions instead of telling",
              ],
            },
          },
          {
            phase: "Conditioned Game Round 1",
            duration: "5 minutes",
            coachPosition: "Sideline, moving",
            script:
              "Add condition matching your coaching point. Play game. Coach during play: reinforce focus, celebrate good decisions, remind of condition.",
          },
          {
            phase: "Coaching Moment #2",
            duration: "90 seconds",
            coachPosition: "Center",
            script:
              "'How did condition change play?' Connect to real games. Decide: same condition (harder space), new condition, or remove.",
          },
          {
            phase: "Conditioned Game Round 2",
            duration: "5 minutes",
            coachPosition: "Sideline",
            script:
              "Continue with same or modified condition. Keep coaching same concept. Competition matters - keep score!",
          },
          {
            phase: "Free Play Finish",
            duration: "3 minutes",
            coachPosition: "Sideline",
            script:
              "Remove all conditions. 'Show me you learned something!' Watch if behaviors stick without condition forcing it.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          unevenTeams: {
            symptoms: [
              "One team dominating",
              "Score very lopsided",
              "Weaker team disengaged",
            ],
            solutions: [
              "Swap players to balance",
              "Add condition favoring weaker team",
              "Play rolling subs",
              "Coach joins weaker team briefly",
            ],
          },
          chaosNoStructure: {
            symptoms: ["Ball watching", "No positions", "Random running"],
            solutions: [
              "Pause and set simple formation (1-2-2)",
              "Assign roles briefly",
              "Start slower",
              "Condition that requires structure",
            ],
          },
        },
        playerBehavior: {
          dominantPlayers: {
            symptoms: [
              "One player keeps ball",
              "Others don't touch it",
              "Ball hog complaints",
            ],
            approach:
              "Touch restriction: 3 or 2 touch max. 'Goals only count if 3 different players touch ball.' Celebrate passing.",
          },
          disengagedPlayers: {
            symptoms: [
              "Standing watching",
              "Not getting involved",
              "Looks bored",
            ],
            approach:
              "Direct role: 'You're our outlet - always available.' Praise when they're in good position. Condition requiring everyone involved.",
          },
          overlyPhysical: {
            symptoms: ["Pushing", "Dangerous tackles", "Injury risk"],
            approach:
              "Immediate stop. Clear rule: 'Hard and fair.' Remove player briefly if continues. No tolerance for dangerous play.",
          },
        },
        conditionIssues: {
          conditionTooConfusing: {
            symptoms: ["Constant questions", "Not following", "Frustration"],
            solution:
              "Simplify. One simple rule. Demo it. If still confusing, remove condition.",
          },
          conditionNotWorking: {
            symptoms: ["No change in behavior", "Ignoring condition"],
            solution:
              "Make consequence clear. Or choose different condition. Maybe players need prerequisite skills first.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Game Intelligence / Decision Making",
            domain: "Tactical",
            howItDevelops:
              "Game situations force quick decisions. Conditions focus attention on specific decision types. Repetition builds pattern recognition.",
            levelIndicators: {
              1: "Random decisions; no awareness of options",
              2: "Sometimes makes good decisions but inconsistent",
              3: "Usually chooses appropriate action; reads basic situations",
              4: "Consistently good decisions; anticipates play; creates advantages",
              5: "Excellent game reader; manipulates opponents; makes others better",
            },
            assessmentNotes:
              "Watch pattern of decisions over time, not individual moments. Good decisions sometimes fail; bad decisions sometimes succeed.",
          },
          {
            skill: "Tactical Awareness / Positioning",
            domain: "Tactical",
            howItDevelops:
              "Conditions like 'all in half' or spacing emphasis develop understanding of where to be.",
            levelIndicators: {
              1: "Follows ball; no understanding of space",
              2: "Basic positioning but loses it under pressure",
              3: "Maintains position; supports appropriately",
              4: "Intelligent movement; creates space for others",
              5: "Excellent spacing; manipulates defense; organizes others",
            },
          },
          {
            skill: "Transition Play",
            domain: "Tactical",
            howItDevelops:
              "Conditions rewarding quick transition develop habits of reacting to turnovers.",
            levelIndicators: {
              1: "Slow reaction to turnovers; ball watching",
              2: "Recognizes transition but slow to act",
              3: "Quick reaction; presses or supports immediately",
              4: "Leads transition; organizes teammates",
              5: "Anticipates transition; positions pre-emptively",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "Communication",
            domain: "Psychological/Social",
            howItDevelops:
              "Game pressure requires verbal and non-verbal communication with teammates.",
            levelIndicators: {
              1: "Silent; no communication",
              2: "Occasional calls but inconsistent",
              3: "Regular communication; calls for ball",
              4: "Directs teammates; gives information",
              5: "Constant communication; organizes team",
            },
          },
          {
            skill: "Applying Technical Skills Under Pressure",
            domain: "Technical",
            howItDevelops:
              "All technical skills used in game context with time/space/opponent pressure.",
          },
        ],
        physicalDevelopment: {
          endurance: "Continuous play for 20 minutes",
          agility: "Quick reactions and direction changes",
          acceleration: "Bursts during transitions",
        },
        psychologicalDevelopment: {
          competitiveness: "Desire to win within team structure",
          composure: "Staying calm under game pressure",
          teamwork: "Working together toward shared goal",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Small-sided games are where learning transfers to match play. Technical and tactical skills mean nothing if they can't be applied in games. The controlled environment (conditions, coaching, appropriate numbers) accelerates game intelligence development while maintaining realism.",
        whenToUseIt: {
          idealFor: [
            "End of practice (apply what was learned)",
            "Main activity (teach through the game)",
            "When technical work needs game application",
            "Weekly game-like experience",
          ],
          avoidWhen: [
            "Very beginning (need warm-up)",
            "Immediately after high-intensity activity",
            "When team chemistry is poor (fix in smaller activities first)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Rondo 4v1",
              reason: "Possession concepts in smaller context",
            },
            {
              activity: "3v2 Transition",
              reason: "Attacking/defending with advantage",
            },
          ],
          after: [
            {
              activity: "7v7 Games",
              reason: "Larger numbers, more complexity",
            },
            {
              activity: "11v11 Scrimmage",
              reason: "Full game application",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Smaller numbers (3v3, 4v4), simple conditions only",
            keyPhrases: ["Spread out!", "Help your friend!", "Great teamwork!"],
            avoidSaying: ["Tactical terms they won't understand"],
            duration: "10-12 minutes max",
            simplifications: [
              "4v4 on smaller field",
              "One simple condition max",
              "Lots of praise",
            ],
          },
          ages9to11: {
            approach: "Full 5v5 with deliberate conditions",
            keyPhrases: [
              "What's the best option?",
              "Why did that work?",
              "Read the game!",
            ],
            challenges: [
              "Multiple conditions",
              "Stricter touch limits",
              "Position-specific challenges",
            ],
            duration: "15-20 minutes with coaching stops",
          },
          ages12to14: {
            approach: "Player-led with complex conditions",
            keyPhrases: [
              "Solve this problem:",
              "What do you see?",
              "How can you adjust?",
            ],
            challenges: [
              "Player-designed conditions",
              "Self-coaching between points",
              "Video review",
            ],
            coachRole:
              "Facilitate analysis, ask questions, minimal direct instruction",
          },
        },
        commonMisconceptions: {
          "Just let them play - they'll figure it out":
            "Guided discovery through conditions accelerates learning. Free play alone can reinforce bad habits.",
          "Conditions are artificial":
            "Conditions isolate specific learning outcomes. They're training wheels that develop habits that persist without them.",
          "Win at all costs":
            "Development > Results at this age. Use conditions that might sacrifice winning for learning.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Our 5v5 games use 'conditions' - special rules that force players to practice specific skills. For example, limiting touches forces passing. These conditions develop game intelligence - the ability to make good decisions quickly. It's how professional academies train.",
        newsletter:
          "This week: Small-Sided Games with conditions! We played 5v5 but added rules like 'touch limits' and 'transition goals' that force good habits. Ask your child what condition they played with and why it helped them improve!",
        whatToWatchFor: [
          "Does your child move when they don't have the ball?",
          "Do they look for passes or only dribble?",
          "Do they react quickly when their team loses possession?",
          "Are they communicating with teammates?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions from opposite directions",
            prevention: "Appropriate space, heads up emphasis",
            response: "Check players, review spacing",
          },
          {
            risk: "Slide tackles",
            prevention: "No sliding rule, stay on feet",
            response: "Immediate stop, remove player if repeated",
          },
          {
            risk: "Goal post collisions",
            prevention: "Padded posts if possible, awareness around goal",
            response: "Check player, adjust goal position if needed",
          },
          {
            risk: "Overexertion",
            prevention: "Water breaks, subs if available",
            response: "Rest player, hydrate, monitor return",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Balance teams for fair competition, give meaningful roles to all abilities",
          newPlayers:
            "Team with supportive experienced players, simple conditions first",
          anxiousPlayers:
            "Positive team environment, start with easier conditions, praise effort",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did the condition achieve its purpose?",
          "Did players maintain the behavior when condition was removed?",
          "Was my coaching focused on ONE concept?",
          "Did all players get meaningful involvement?",
        ],
        forImprovement: [
          "What condition would work better next time?",
          "How could I better balance the teams?",
          "Which players need more individual attention?",
          "How do I connect this to their weekend games?",
        ],
      },
    },
  },
  {
    slug: "wall-pass-combinations",
    name: "Wall Pass Combinations",
    description: "Practice one-two passing patterns with a partner or group",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 12,
    skillsDeveloped: ["passing-short", "support-play", "receiving-first-touch"],
    setupInstructions:
      "Set up pairs of cones 10-12 yards apart. Groups of 3 work together.",
    howToPlay:
      "1. Player A passes to Player B (the 'wall')\n2. Player A sprints forward\n3. Player B plays one-touch pass into A's path\n4. Player A receives and dribbles to the end\n5. Rotate positions after each repetition",
    coachingPoints: [
      "Quality first pass to the wall",
      "Sprint immediately after passing",
      "Wall player: open body position",
      "Return pass should be in front of runner",
    ],
    questionsToAsk: [
      "Where should your first touch be?",
      "When do you start your run?",
      "How does the wall player know where to pass?",
    ],
    commonMistakes: [
      "Not sprinting after first pass",
      "Wall pass behind the runner",
      "Poor first touch stopping momentum",
    ],
    variations: [
      {
        name: "Third Man Run",
        description: "Add third player making overlapping run",
        difficulty: "advanced",
      },
      {
        name: "Double Wall",
        description: "Two wall passes in sequence",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Two-touch for wall player, shorter distance",
    makeHarder: "Add passive defender, require weak foot",
    equipmentNeeded: ["Cones", "1 ball per group"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["passing", "combination play", "one-two", "movement"],
    featured: true,
  },
  {
    slug: "receiving-under-pressure",
    name: "Receiving Under Pressure",
    description: "Practice first touch with defender applying pressure",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 18,
    durationMinutes: 12,
    skillsDeveloped: ["receiving-first-touch", "ball-control"],
    setupInstructions:
      "Create a 10x10 yard box. Groups of 3: passer, receiver, defender.",
    howToPlay:
      "1. Receiver starts in box with passive defender behind\n2. Server passes to receiver\n3. Receiver must control ball and dribble out any side\n4. Defender can close down but stays passive initially\n5. Rotate after 4 repetitions",
    coachingPoints: [
      "Check shoulder before receiving",
      "First touch away from pressure",
      "Body position to shield ball",
      "Accelerate after first touch",
    ],
    questionsToAsk: [
      "Where is the defender?",
      "Which way is the space?",
      "How do you decide which foot to use?",
    ],
    commonMistakes: [
      "Not checking shoulder",
      "First touch into defender",
      "Standing still after receiving",
    ],
    variations: [
      {
        name: "Active Defender",
        description: "Defender can try to win ball",
        difficulty: "advanced",
      },
      {
        name: "Two Gates",
        description: "Must exit through specific gate for bonus point",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Larger box, defender starts farther away",
    makeHarder: "Smaller box, fully active defender, add second defender",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["receiving", "first touch", "1v1", "pressure"],
    featured: false,
  },
  {
    slug: "coerver-moves-circuit",
    name: "Coerver Moves Circuit",
    description: "Practice classic dribbling moves at different stations",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 15,
    skillsDeveloped: ["1v1-dribbling-moves", "turning-with-ball"],
    setupInstructions:
      "Set up 4-5 stations with cones. Each station practices a different move.",
    howToPlay:
      "Station 1: Scissors - step over ball, take with outside of other foot\nStation 2: Step-over turn - fake to go one way, pull back\nStation 3: Matthews cut - inside-outside quick change\nStation 4: Cruyff turn - drag ball behind standing leg\nStation 5: La Croqueta - inside to inside quick switch\n\nSpend 2 minutes at each station, then rotate.",
    coachingPoints: [
      "Sell the fake with body movement",
      "Accelerate after the move",
      "Practice both sides",
      "Keep ball close during the move",
    ],
    questionsToAsk: [
      "When would you use this move in a game?",
      "How do you sell the fake?",
      "Which is your best move?",
    ],
    commonMistakes: [
      "No change of pace after move",
      "Ball too far from body",
      "Only practicing dominant foot",
    ],
    variations: [
      {
        name: "Add Cone Defender",
        description: "Do move around a cone 'defender'",
        difficulty: "intermediate",
      },
      {
        name: "Chain Moves",
        description: "Do 2-3 moves in combination",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Fewer moves, more time per station",
    makeHarder: "Add passive defender, require combo moves",
    equipmentNeeded: ["Cones", "1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["dribbling", "moves", "1v1", "technique"],
    featured: true,
  },
  {
    slug: "4v4-small-goals",
    name: "4v4 to Small Goals",
    description: "Small-sided game focusing on combination play and quick decisions",
    sport: "soccer",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 12,
    durationMinutes: 15,
    skillsDeveloped: ["support-play", "finding-space"],
    setupInstructions:
      "Create a 30x25 yard field with small goals (pugg goals) at each end. No goalkeepers.",
    howToPlay:
      "1. Play 4v4 (or 4v4+2 neutral players)\n2. Score by passing or dribbling through small goal\n3. After a goal, play restarts from the other team's goal\n4. Play 3-4 minute games, then rotate teams",
    coachingPoints: [
      "Keep width and depth",
      "Quick ball movement",
      "Support the ball carrier",
      "Find the open player",
    ],
    questionsToAsk: [
      "Where is the open goal?",
      "Who is your support?",
      "What happens when we lose the ball?",
    ],
    commonMistakes: [
      "Everyone going to the ball",
      "Holding ball too long",
      "Not spreading out",
    ],
    variations: [
      {
        name: "Two-Touch Limit",
        description: "Maximum two touches per player",
        difficulty: "advanced",
      },
      {
        name: "Four Goals",
        description: "Teams can score on either goal for added decision-making",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Add neutral players, no touch limit",
    makeHarder: "One-touch finish required, smaller field",
    equipmentNeeded: ["Cones", "Small goals or pugg goals", "Pinnies", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "small-sided", "tactical", "decision-making"],
    featured: true,
  },
  {
    slug: "3v1-rondo",
    name: "3v1 Rondo",
    description: "Classic possession game to develop quick passing and movement",
    sport: "soccer",
    activityType: "tactical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 10,
    skillsDeveloped: ["passing-short", "creating-passing-angles", "support-play"],
    setupInstructions:
      "Create 8x8 yard squares. Groups of 4 players, 3 on outside, 1 in middle.",
    howToPlay:
      "1. Three players on outside try to keep the ball\n2. Defender in middle tries to win ball or force it out\n3. If defender wins ball, they swap with player who lost it\n4. Count consecutive passes - try to beat your record",
    coachingPoints: [
      "Move after you pass",
      "Create passing angles",
      "Play one or two-touch",
      "Communicate with teammates",
    ],
    questionsToAsk: [
      "How can you help the ball carrier?",
      "Where should you move after passing?",
      "When do you play one-touch vs two-touch?",
    ],
    commonMistakes: [
      "Standing still after passing",
      "Passing to feet instead of space",
      "Taking too many touches",
    ],
    variations: [
      {
        name: "4v1",
        description: "Four outside players for easier possession",
        difficulty: "beginner",
      },
      {
        name: "3v2",
        description: "Two defenders for more pressure",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Larger box, 4v1 instead of 3v1",
    makeHarder: "Smaller box, 3v2, one-touch only",
    equipmentNeeded: ["Cones", "Balls", "Pinnies optional"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["possession", "passing", "rondo", "movement"],
    featured: true,
  },
  {
    slug: "end-zone-game",
    name: "End Zone Game",
    description: "Possession game where teams score by dribbling into end zone",
    sport: "soccer",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 16,
    durationMinutes: 15,
    skillsDeveloped: ["when-to-dribble-vs-pass", "finding-space", "support-play"],
    setupInstructions:
      "Create a 35x25 yard field with 5-yard end zones at each end. Two equal teams.",
    howToPlay:
      "1. Teams try to dribble ball under control into opponent's end zone\n2. Must be in control of ball when entering end zone to score\n3. After a score, other team gets ball from their end zone\n4. No goalkeepers - all outfield players",
    coachingPoints: [
      "Width in attack",
      "Quick ball circulation",
      "Recognize when to dribble vs pass",
      "Support the ball carrier",
    ],
    questionsToAsk: [
      "When should you try to score vs keep possession?",
      "How do you create space to dribble into the zone?",
      "Where should you be when your teammate has the ball?",
    ],
    commonMistakes: [
      "Rushing into end zone without control",
      "Not spreading out",
      "Everyone chasing the ball",
    ],
    variations: [
      {
        name: "Receive in End Zone",
        description: "Must receive pass in end zone (not dribble) to score",
        difficulty: "intermediate",
      },
      {
        name: "Time Limit",
        description: "Must score within 30 seconds or lose possession",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Wider field, larger end zones",
    makeHarder: "Smaller end zones, add neutral player for defending team",
    equipmentNeeded: ["Cones", "Pinnies", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "possession", "dribbling", "tactical"],
    featured: true,
  },
  {
    slug: "ball-tag",
    name: "Ball Tag",
    description: "Fun conditioning game where everyone dribbles while playing tag",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 8,
    skillsDeveloped: ["ball-control", "agility-change-of-direction"],
    setupInstructions:
      "Use a 25x25 yard grid. Everyone has a ball. Select 2-3 taggers who wear pinnies.",
    howToPlay:
      "1. Everyone dribbles inside the grid, including taggers\n2. Taggers try to tag other players while dribbling\n3. If tagged, do 10 ball taps and return to the game\n4. Rotate taggers every 90 seconds",
    coachingPoints: [
      "Keep ball close while looking around",
      "Change direction suddenly to escape",
      "Use your body to shield",
      "Stay alert - know where taggers are",
    ],
    questionsToAsk: [
      "How do you escape the taggers?",
      "How do you keep control while running?",
    ],
    commonMistakes: ["Losing the ball while running", "Not keeping head up"],
    variations: [
      {
        name: "Freeze Ball Tag",
        description:
          "Tagged players freeze, can be freed by another player passing through their legs",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Fewer taggers, larger grid",
    makeHarder: "More taggers, smaller grid",
    equipmentNeeded: ["Cones", "1 ball per player", "Pinnies"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["conditioning", "dribbling", "fun", "agility"],
    featured: false,
  },
  {
    slug: "passing-pairs",
    name: "Passing Pairs",
    description: "Simple partner passing to cool down and focus on technique",
    sport: "soccer",
    activityType: "cooldown",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 6,
    skillsDeveloped: ["passing-short", "receiving-first-touch"],
    setupInstructions: "Partners stand 10-15 yards apart. One ball per pair.",
    howToPlay:
      "1. Pass back and forth, focusing on technique\n2. Receive with inside of foot, pass with inside\n3. Two touches: one to control, one to pass\n4. Switch to different passes: outside of foot, driven pass",
    coachingPoints: [
      "Lock ankle when passing",
      "Follow through to target",
      "Soft first touch",
      "Communicate with partner",
    ],
    questionsToAsk: [
      "What makes a good pass?",
      "Where should your first touch go?",
    ],
    commonMistakes: ["Ankle not locked", "Toe poking the ball"],
    variations: [
      {
        name: "One Touch",
        description: "Challenge to play one-touch passes",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Closer together",
    makeHarder: "Farther apart, one-touch only",
    equipmentNeeded: ["1 ball per pair"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["cooldown", "passing", "technique", "partners"],
    featured: false,
  },
  {
    slug: "world-cup-game",
    name: "World Cup",
    description: "Fast-paced shooting game that kids love, where everyone competes to score the most goals",
    sport: "soccer",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 12,
    skillsDeveloped: ["shooting", "ball-control"],
    setupInstructions:
      "One goal with goalkeeper. All other players start at the top of the box.",
    howToPlay:
      "1. Coach serves balls randomly into the box - keep 2-3 balls going at once\n2. Everyone is for themselves - score in the goal\n3. Each goal is worth 1 point - keep your own running count\n4. If the goalkeeper saves your shot, do 3 quick toe taps and jump right back into the action - nobody sits out\n5. Can steal a loose ball from anyone\n6. When time's up, whoever has the most goals wins that round",
    coachingPoints: [
      "Be first to the ball",
      "Shoot when you have a chance",
      "Shield the ball",
      "Stay alert",
    ],
    questionsToAsk: [
      "When should you shoot vs dribble?",
      "How do you get free from others?",
    ],
    commonMistakes: ["Taking too long to shoot", "Not being aware of others"],
    variations: [
      {
        name: "Must One-Touch",
        description: "First touch must be a shot",
        difficulty: "advanced",
      },
      {
        name: "Headers Only",
        description: "Coach throws balls for headers only",
        difficulty: "intermediate",
      },
      {
        name: "Championship Knockout",
        description:
          "The classic elimination format, for older or highly competitive groups: if the goalkeeper saves your shot and calls your name, you're out for the rest of the round - sit and watch until the next round starts. Last player(s) without a goal lose. Higher stakes but less playing time, so save it for groups ready for that trade-off.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "More balls in play",
    makeHarder:
      "Fewer balls, smaller goal. For older/competitive groups ready for real stakes, try Championship Knockout (see variations) for a true elimination format.",
    equipmentNeeded: ["Goal", "Many balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["fun", "shooting", "game", "competitive"],
    featured: true,
  },
  {
    slug: "musical-balls",
    name: "Musical Balls",
    description: "Soccer version of musical chairs - when music stops, find a ball and show a skill! Everyone keeps playing every round.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 7,
    skillsDeveloped: ["agility-coordination", "ball-mastery-toe-taps"],
    setupInstructions:
      "Scatter balls in a 25x25 grid - one fewer ball than players.",
    howToPlay:
      "1. Players jog/skip around the grid while music plays\n2. When music stops, find a ball and perform a move (10 toe taps)\n3. Player without a ball does 5 jumping jacks, then jogs right back in for the next round - nobody sits out\n4. Keep the same number of balls (one fewer than players) every round so the challenge stays constant instead of eliminating players\n5. Track how many times each player ends up without a ball as a fun personal best - fewest misses 'wins' bragging rights",
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
      {
        name: "Skills Challenge",
        description: "Must complete 10 toe taps to 'claim' the ball",
        difficulty: "intermediate",
      },
      {
        name: "Knockout Musical Balls",
        description:
          "The classic elimination format, for older or highly competitive groups: remove one ball each round; the player(s) left without a ball are out until only two players remain. Higher stakes but a lot of sitting out for younger or mixed-ability groups.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "More balls in the grid so misses are rare",
    makeHarder:
      "Smaller grid, faster music changes. For older/competitive groups ready for real stakes, try Knockout Musical Balls (see variations) for classic progressive elimination.",
    equipmentNeeded: ["Balls (one fewer than players)", "Music speaker"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["warmup", "fun", "agility", "awareness"],
    featured: false,
  },
  {
    slug: "copy-cat-dribbling",
    name: "Copy Cat Dribbling",
    description: "Follow the leader dribbling game where players mirror the coach or leader",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 6,
    skillsDeveloped: ["dribbling", "agility-coordination"],
    setupInstructions:
      "Open space, each player has a ball. Coach leads from the front.",
    howToPlay:
      "1. Players dribble following the leader\n2. Leader performs different moves - players copy\n3. Include: speed changes, direction changes, stops, turns\n4. Rotate leader every 60-90 seconds",
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
      {
        name: "Freeze Copy",
        description: "Must freeze in exact same position as leader",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Slower pace, simpler moves",
    makeHarder: "Faster pace, complex combinations",
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "dribbling", "following", "fun"],
    featured: false,
  },
  {
    slug: "volcano-dribble",
    name: "Volcano Dribble",
    description: "Dribble around 'volcanos' (cones) without touching them",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 6,
    skillsDeveloped: ["dribbling", "ball-control"],
    setupInstructions:
      "Set up 15-20 cones randomly in a 30x30 grid. Each player has a ball.",
    howToPlay:
      "1. Players dribble freely avoiding the 'volcanos' (cones)\n2. If you touch a volcano, it 'erupts' - do 5 toe taps\n3. Coach can call 'Lava flow!' - everyone must freeze\n4. Keep count of how many times you touched a volcano",
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
      {
        name: "Moving Volcanos",
        description: "Some players are 'volcanos' that slowly move",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Fewer volcanos, larger spaces",
    makeHarder: "More volcanos, smaller spaces, faster pace",
    equipmentNeeded: ["Cones (15-20)", "1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["warmup", "dribbling", "awareness", "fun"],
    featured: false,
  },
  {
    slug: "numbers-game-warmup",
    name: "Numbers Game Warmup",
    description: "Coach calls numbers for different movements while dribbling",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 7,
    skillsDeveloped: ["dribbling", "agility-coordination"],
    setupInstructions:
      "30x30 grid, each player has a ball. Review number commands first.",
    howToPlay:
      "Number commands:\n1 = Stop ball with sole\n2 = Speed dribble\n3 = Turn around (any turn)\n4 = Change direction (cut)\n5 = Do a skill move\nPlayers dribble freely, coach calls numbers.",
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
      {
        name: "Player Caller",
        description: "A player becomes the number caller",
        difficulty: "beginner",
      },
      {
        name: "Add Colors",
        description: "Use both numbers and colors for different actions",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Fewer numbers (1-3 only)",
    makeHarder: "More numbers, faster calling, add combinations",
    equipmentNeeded: ["1 ball per player", "Cones for grid"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "dribbling", "listening", "reactions"],
    featured: false,
  },
  {
    slug: "partner-mirror-warmup",
    name: "Partner Mirror Warmup",
    description: "Partners face each other, one leads dribbling moves and other mirrors",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 8,
    skillsDeveloped: ["agility-coordination", "dribbling"],
    setupInstructions:
      "Partners 3-4 yards apart, each with a ball, facing each other.",
    howToPlay:
      "1. One partner is the leader, performs moves\n2. Other partner mirrors (opposite direction)\n3. Include: side-to-side, forward-back, turns, skills\n4. Switch leader every 45 seconds",
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
      {
        name: "No Ball Mirror",
        description: "Start without balls, just movement",
        difficulty: "beginner",
      },
      {
        name: "Add Passes",
        description: "Include passing back and forth in the mirror",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Slower movements, no ball first",
    makeHarder: "Faster movements, add skills",
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["warmup", "coordination", "reactions", "partners"],
    featured: false,
  },
  {
    slug: "passing-accuracy-challenge",
    name: "Passing Accuracy Challenge",
    description: "Hit targets with passes to score points",
    sport: "soccer",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["passing-short"],
    setupInstructions:
      "Set up 5-6 cone gates of varying widths at 10-20 yards distance.",
    howToPlay:
      "1. Players line up with balls\n2. Pass through gates to score points\n3. Narrow gate = 3 points, medium = 2 points, wide = 1 point\n4. Each player gets 5 attempts, most points wins",
    coachingPoints: [
      "Plant foot pointing at target",
      "Lock ankle, strike through middle of ball",
      "Follow through toward target",
    ],
    questionsToAsk: [
      "Where do you look when passing?",
      "How do you adjust for different distances?",
    ],
    commonMistakes: [
      "Toe poking",
      "Not following through",
      "Looking up too early",
    ],
    variations: [
      {
        name: "Moving Target",
        description: "Partner moves side to side as target",
        difficulty: "intermediate",
      },
      {
        name: "Weak Foot Only",
        description: "All passes with non-dominant foot",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Wider gates, closer distances",
    makeHarder: "Narrower gates, further distances, add time limit",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["passing", "accuracy", "technique", "competition"],
    featured: false,
  },
  {
    slug: "first-touch-box",
    name: "First Touch Box",
    description: "Receive passes and control ball within a small box",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["receiving-first-touch"],
    setupInstructions:
      "Create 3x3 yard boxes. One receiver in box, partners around perimeter.",
    howToPlay:
      "1. Servers pass to receiver from different angles\n2. Receiver must control ball inside the box\n3. First touch must keep ball in the box\n4. If ball leaves box, that's a point against\n5. Rotate receiver every 8-10 passes",
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
      {
        name: "Smaller Box",
        description: "2x2 yard box for more precision",
        difficulty: "advanced",
      },
      {
        name: "Air Balls",
        description: "Servers throw/chip balls in the air",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Larger box, softer passes",
    makeHarder: "Smaller box, faster passes, add time pressure",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["first touch", "receiving", "control", "technique"],
    featured: true,
  },
  {
    slug: "turn-and-face",
    name: "Turn and Face",
    description: "Receive ball with back to goal, turn and attack",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 12,
    skillsDeveloped: ["turning-with-ball", "receiving-first-touch"],
    setupInstructions:
      "Line of servers with balls, receivers 15 yards away, goal behind receivers.",
    howToPlay:
      "1. Receiver checks toward server, receives ball\n2. Turn using a skill move (Cruyff, drag back, spin)\n3. Attack the goal and finish\n4. Focus on different turn types each round",
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
    commonMistakes: [
      "Not checking shoulder",
      "Slow turn execution",
      "Poor first touch",
    ],
    variations: [
      {
        name: "Add Defender",
        description: "Passive defender on receiver's back",
        difficulty: "advanced",
      },
      {
        name: "Specific Turns Only",
        description: "Coach calls which turn to use",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "No pressure, choose any turn",
    makeHarder: "Active defender, limited touch count",
    equipmentNeeded: ["Cones", "Balls", "Goal"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["turning", "receiving", "attacking", "technique"],
    featured: true,
  },
  {
    slug: "heading-progression",
    name: "Heading Progression",
    description: "Safe heading technique from basic to game-like situations",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["heading-defensive"],
    setupInstructions:
      "Partners facing each other, 5 yards apart. Use appropriate size ball.",
    howToPlay:
      "Progression:\n1. Sit and head (partner tosses gently)\n2. Kneel and head\n3. Stand and head\n4. Jump and head\n5. Running jump and head",
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
      {
        name: "Target Headers",
        description: "Head ball back through cone gate",
        difficulty: "advanced",
      },
      {
        name: "Defensive Headers",
        description: "Head ball high and far",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Start with lighter ball, seated position",
    makeHarder: "Moving service, add competition",
    equipmentNeeded: ["Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["heading", "technique", "aerial"],
    featured: false,
  },
  {
    slug: "juggling-challenge",
    name: "Juggling Challenge",
    description: "Progressive juggling skills building ball control",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 10,
    skillsDeveloped: ["ball-control"],
    setupInstructions: "Each player with a ball, spread out in space.",
    howToPlay:
      "Challenge progression:\n1. Drop and catch (one bounce between)\n2. Two touches then catch\n3. Thigh, foot, catch\n4. Non-stop foot juggles (count personal best)\n5. Alternating feet only",
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
      {
        name: "Partner Juggling",
        description: "Juggle back and forth with partner",
        difficulty: "advanced",
      },
      {
        name: "Sit and Juggle",
        description: "Seated juggling with feet only",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Allow bounces between touches",
    makeHarder: "No bounces, add thigh/head, movement while juggling",
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["juggling", "ball control", "individual", "technique"],
    featured: false,
  },
  {
    slug: "crossing-and-finishing",
    name: "Crossing and Finishing",
    description: "Practice delivering and scoring from crosses",
    sport: "soccer",
    activityType: "technical",
    difficulty: "advanced",
    minPlayers: 6,
    maxPlayers: 14,
    durationMinutes: 15,
    skillsDeveloped: ["shooting", "finding-space"],
    setupInstructions:
      "Wide players on each side, finishers in central areas, goalkeeper in goal.",
    howToPlay:
      "1. Wide player receives, dribbles to crossing position\n2. Delivers cross to near post, far post, or penalty spot\n3. Finishers attack the cross\n4. Rotate positions after each attempt",
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
    commonMistakes: [
      "Poor cross quality",
      "Static in the box",
      "Poor timing of runs",
    ],
    variations: [
      {
        name: "Add Defender",
        description: "Defender in box challenging finishers",
        difficulty: "advanced",
      },
      {
        name: "Low Cross Only",
        description: "All crosses must be driven low",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "No defenders, static finishers",
    makeHarder: "Active defenders, one-touch finish required",
    equipmentNeeded: ["Goals", "Balls", "Cones"],
    spaceRequired: "large",
    indoorSuitable: false,
    appropriateStages: ["development"],
    tags: ["crossing", "finishing", "attacking", "technique"],
    featured: true,
  },
  {
    slug: "long-passing-grid",
    name: "Long Passing Grid",
    description: "Develop long range passing accuracy and technique",
    sport: "soccer",
    activityType: "technical",
    difficulty: "advanced",
    minPlayers: 8,
    maxPlayers: 16,
    durationMinutes: 12,
    skillsDeveloped: ["long-passing"],
    setupInstructions:
      "Create a 40x40 yard grid divided into four 20x20 sections. Groups in opposite corners.",
    howToPlay:
      "1. Player drives long pass to partner in opposite corner\n2. Partner receives and plays back\n3. Alternate: driven pass, lofted pass, chipped pass\n4. Score points for first-touch control",
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
    commonMistakes: [
      "Leaning back too much",
      "Poor weight on pass",
      "Not following through",
    ],
    variations: [
      {
        name: "Moving Targets",
        description: "Receiver makes run to receive",
        difficulty: "advanced",
      },
      {
        name: "Switching Play",
        description: "Simulate switching the point of attack",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Shorter distances, stationary targets",
    makeHarder: "Longer distances, moving receivers, add pressure",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "large",
    indoorSuitable: false,
    appropriateStages: ["development"],
    tags: ["passing", "long range", "technique", "switching play"],
    featured: false,
  },
  {
    slug: "shooting-technique-stations",
    name: "Shooting Technique Stations",
    description: "Practice different shooting techniques at multiple stations",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 16,
    durationMinutes: 15,
    skillsDeveloped: ["shooting"],
    setupInstructions:
      "Set up 4 stations around a goal area. Groups rotate through stations.",
    howToPlay:
      "Station 1: Power shots from 18 yards\nStation 2: Finesse shots (inside foot curl)\nStation 3: One-touch finishes (partner pass)\nStation 4: Volleys (self-toss or partner toss)\n2-3 minutes each station, then rotate.",
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
    commonMistakes: [
      "Leaning back on shots",
      "Poor plant foot position",
      "Looking at goalkeeper not goal",
    ],
    variations: [
      {
        name: "Add Goalkeeper",
        description: "Full goalkeeper at each station",
        difficulty: "advanced",
      },
      {
        name: "Weak Foot Stations",
        description: "Some stations require weak foot",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Closer to goal, no goalkeeper",
    makeHarder: "Further from goal, active goalkeeper, add time pressure",
    equipmentNeeded: ["Goals", "Balls", "Cones"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["shooting", "finishing", "technique", "stations"],
    featured: true,
  },
  {
    slug: "speed-dribbling-relay",
    name: "Speed Dribbling Relay",
    description: "Dribbling at speed through cones in team relay format",
    sport: "soccer",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 10,
    skillsDeveloped: ["dribbling-with-speed", "agility-coordination"],
    setupInstructions:
      "Two or more teams. Set up cone course - zigzag, straight line, or combination.",
    howToPlay:
      "1. First player dribbles through course and back\n2. Tags next player who goes\n3. First team to finish wins\n4. Vary the dribbling technique required",
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
      {
        name: "Weak Foot Only",
        description: "Must use non-dominant foot",
        difficulty: "intermediate",
      },
      {
        name: "Skill Move Required",
        description: "Must do a move at each cone",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Wider cone spacing, shorter course",
    makeHarder: "Tighter cones, longer course, add penalties for errors",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["dribbling", "speed", "relay", "competition"],
    featured: false,
  },
  {
    slug: "combination-play-circuit",
    name: "Combination Play Circuit",
    description: "Practice give-and-go, overlap, and third man run patterns",
    sport: "soccer",
    activityType: "technical",
    difficulty: "advanced",
    minPlayers: 9,
    maxPlayers: 18,
    durationMinutes: 15,
    skillsDeveloped: ["support-play", "passing-short"],
    setupInstructions:
      "Set up three stations with cones showing passing patterns. Groups of 3-4 at each.",
    howToPlay:
      "Station 1: Give-and-go (wall pass)\nStation 2: Overlap run and cross\nStation 3: Third man combination\nPlayers perform pattern and rotate positions.",
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
    commonMistakes: [
      "Slow after passing",
      "Poor timing of runs",
      "Pass too hard or soft",
    ],
    variations: [
      {
        name: "Add Defenders",
        description: "Passive defenders at each station",
        difficulty: "advanced",
      },
      {
        name: "Finish Required",
        description: "Each pattern ends with a shot on goal",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Walk through patterns first, no pressure",
    makeHarder: "Add defenders, increase pace, add finishing",
    equipmentNeeded: ["Cones", "Balls", "Goals optional"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["development"],
    tags: ["combination play", "passing", "movement", "attacking"],
    featured: true,
  },
  {
    slug: "5v2-rondo",
    name: "5v2 Rondo",
    description: "Classic possession game with larger group and two defenders",
    sport: "soccer",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 7,
    maxPlayers: 14,
    durationMinutes: 12,
    skillsDeveloped: ["passing-short", "creating-passing-angles", "support-play"],
    setupInstructions:
      "Create 12x12 yard box. 5 players on outside/inside, 2 defenders in middle.",
    howToPlay:
      "1. Five players try to keep possession\n2. Two defenders try to win ball\n3. If defenders win, they swap with last two passers\n4. Count consecutive passes - try to beat record\n5. Can play one or two-touch",
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
    commonMistakes: [
      "Standing still after passing",
      "Hiding from ball",
      "Poor communication",
    ],
    variations: [
      {
        name: "4v2",
        description: "Smaller group, more pressure",
        difficulty: "advanced",
      },
      {
        name: "5v2 with Middle Player",
        description: "One player can move inside the box",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Larger box, 6v2",
    makeHarder: "Smaller box, one-touch only, 4v2",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["possession", "rondo", "passing", "movement"],
    featured: true,
  },
  {
    slug: "positional-rondo",
    name: "Positional Rondo",
    description: "Rondo with position-specific setup simulating real game situations",
    sport: "soccer",
    activityType: "tactical",
    difficulty: "advanced",
    minPlayers: 10,
    maxPlayers: 14,
    durationMinutes: 15,
    skillsDeveloped: ["positional-awareness", "creating-passing-angles"],
    setupInstructions:
      "Set up shape matching team formation (e.g., 4-3-3). Defenders in zones they would occupy.",
    howToPlay:
      "1. Players maintain positions (CB, FB, CM, etc.)\n2. Build out from back vs 3-4 defenders\n3. Complete a set number of passes to 'score'\n4. Reset when ball is won or limit reached",
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
    commonMistakes: [
      "Leaving position",
      "Rushed play under pressure",
      "Not switching play",
    ],
    variations: [
      {
        name: "Target Player",
        description: "Must find striker to score",
        difficulty: "advanced",
      },
      {
        name: "Transition",
        description: "Defenders can counter-attack if they win ball",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Fewer defenders, more space",
    makeHarder: "More defenders, must reach target in X passes",
    equipmentNeeded: ["Cones", "Balls", "Pinnies"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["development"],
    tags: ["possession", "positional", "build-up", "tactical"],
    featured: true,
  },
  {
    slug: "defending-in-pairs",
    name: "Defending in Pairs",
    description: "Learn to defend together with a partner",
    sport: "soccer",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 16,
    durationMinutes: 12,
    skillsDeveloped: ["1v1-defending", "teamwork"],
    setupInstructions:
      "Create 20x15 yard box with goal at one end. 2 attackers vs 2 defenders.",
    howToPlay:
      "1. Attackers start with ball at top of box\n2. Defenders work together to prevent goal\n3. First defender (pressure) closes down ball carrier\n4. Second defender (cover) provides backup\n5. Switch roles after each attack",
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
    commonMistakes: [
      "Both going to ball",
      "Flat defensive line",
      "Ball watching",
    ],
    variations: [
      {
        name: "3v2",
        description: "Add third attacker for overload",
        difficulty: "advanced",
      },
      {
        name: "2v2+GK",
        description: "Add goalkeeper for realistic finishing",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Attackers limited to 2 touches",
    makeHarder: "Add attackers, reduce defending space",
    equipmentNeeded: ["Cones", "Goals", "Balls"],
    spaceRequired: "small",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["defending", "pairs", "pressure", "cover"],
    featured: true,
  },
  {
    slug: "transition-game",
    name: "Transition Game",
    description: "Quick transition from attack to defense and vice versa",
    sport: "soccer",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 12,
    maxPlayers: 18,
    durationMinutes: 15,
    skillsDeveloped: ["support-play", "speed"],
    setupInstructions:
      "30x40 yard field with goals at each end. Two teams of 5-6.",
    howToPlay:
      "1. Normal game, but when possession changes, teams have 6 seconds to score\n2. If no goal in 6 seconds, ball goes back to team that lost it\n3. Encourages quick counter-attacks\n4. Emphasizes immediate transition",
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
    commonMistakes: [
      "Slow reaction to transition",
      "Not sprinting back on turnovers",
      "Too many touches",
    ],
    variations: [
      {
        name: "3-Second Rule",
        description: "Only 3 seconds to score - even faster",
        difficulty: "advanced",
      },
      {
        name: "Counter Points",
        description: "Goals within 6 seconds worth 2 points",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Longer time limit (8-10 seconds)",
    makeHarder: "Shorter time limit (4-5 seconds)",
    equipmentNeeded: ["Goals", "Balls", "Pinnies"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["transition", "game", "attacking", "defending"],
    featured: true,
  },
  {
    slug: "overload-game",
    name: "Overload Game",
    description: "Small-sided game with numerical advantages in zones",
    sport: "soccer",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 12,
    maxPlayers: 18,
    durationMinutes: 15,
    skillsDeveloped: ["finding-space", "passing-short"],
    setupInstructions:
      "Divide field into thirds. Each team has players who must stay in their zone.",
    howToPlay:
      "1. Team A has 2 players in zone 1, 3 in zone 2, 2 in zone 3\n2. Team B has 3 players in zone 1, 2 in zone 2, 3 in zone 3\n3. Creates overloads and underloads in different areas\n4. Must work ball through zones to score",
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
    commonMistakes: [
      "Not recognizing overloads",
      "Slow play into crowded zones",
      "Poor positioning in zone",
    ],
    variations: [
      {
        name: "Floater",
        description: "One player can move between all zones",
        difficulty: "advanced",
      },
      {
        name: "Touch Limits",
        description: "Different touch limits per zone",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Clearer overloads (3v1 in zone)",
    makeHarder: "Closer numbers, add touch restrictions",
    equipmentNeeded: ["Cones", "Goals", "Pinnies", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["overloads", "zones", "tactical", "game"],
    featured: false,
  },
  {
    slug: "counter-attack-game",
    name: "Counter Attack Game",
    description: "Focus on quick transitions after winning ball",
    sport: "soccer",
    activityType: "game",
    difficulty: "advanced",
    minPlayers: 12,
    maxPlayers: 18,
    durationMinutes: 15,
    skillsDeveloped: ["speed", "finding-space"],
    setupInstructions:
      "Large field (50x35 yards) with full goals. Two teams of 5-6 plus goalkeepers.",
    howToPlay:
      "1. One team attacks with 5 players\n2. Other team defends with only 3 (2 waiting at halfway line)\n3. When defending team wins ball, 2 waiting players join in\n4. Now it's 5v3 counter-attack the other way\n5. Roles switch each possession",
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
    commonMistakes: [
      "Too slow to transition",
      "Poor decision on counter",
      "Not spreading out",
    ],
    variations: [
      {
        name: "3-Second Counter",
        description: "Must shoot within 3 seconds of winning ball",
        difficulty: "advanced",
      },
      {
        name: "Through Ball Counter",
        description: "Counter must include a through ball",
        difficulty: "advanced",
      },
    ],
    makeEasier: "More counter-attackers (3 instead of 2)",
    makeHarder: "Fewer counter-attackers, time limit",
    equipmentNeeded: ["Goals", "Pinnies", "Balls"],
    spaceRequired: "large",
    indoorSuitable: false,
    appropriateStages: ["development"],
    tags: ["counter attack", "transition", "finishing", "game"],
    featured: true,
  },
  {
    slug: "3v3-line-soccer",
    name: "3v3 Line Soccer",
    description: "Score by dribbling over end line instead of into goal",
    sport: "soccer",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 12,
    durationMinutes: 12,
    skillsDeveloped: ["when-to-dribble-vs-pass", "finding-space"],
    setupInstructions:
      "25x20 yard field. No goals - score by stopping ball on opponent's end line.",
    howToPlay:
      "1. 3v3 teams try to dribble across opponent's end line\n2. Ball must be under control when crossing line\n3. After goal, other team starts with ball\n4. Encourages dribbling and width",
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
    commonMistakes: [
      "Too narrow - everyone in middle",
      "Forcing through defenders",
      "Slow transition",
    ],
    variations: [
      {
        name: "Wide Zones",
        description: "Create wide channels worth bonus points",
        difficulty: "intermediate",
      },
      {
        name: "Must Receive",
        description: "Must receive pass over line (not dribble)",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Wider field, larger end zones",
    makeHarder: "Narrower field, must receive in end zone",
    equipmentNeeded: ["Cones", "Pinnies", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "dribbling", "small-sided", "width"],
    featured: false,
  },
  {
    slug: "2v2-mini-goals",
    name: "2v2 with Mini Goals",
    description: "Intense 2v2 game with goals at each end",
    sport: "soccer",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 12,
    skillsDeveloped: ["support-play", "1v1-dribbling-moves"],
    setupInstructions:
      "20x15 yard field with mini goals (pugg or cones) at each end. Pairs compete.",
    howToPlay:
      "1. 2v2 games to 3 goals\n2. Winners stay on, losers rotate\n3. Or play round robin tournament\n4. Focus on individual skills and basic combinations",
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
    commonMistakes: [
      "Both going to ball",
      "Not supporting partner",
      "Forcing shots",
    ],
    variations: [
      {
        name: "Four Goals",
        description: "Each team can score in two goals",
        difficulty: "intermediate",
      },
      {
        name: "Touch Limit",
        description: "Maximum 3 touches per player",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Larger field, bigger goals",
    makeHarder: "Smaller field, touch restrictions",
    equipmentNeeded: ["Mini goals or cones", "Pinnies", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["game", "2v2", "small-sided", "competition"],
    featured: true,
  },
  {
    slug: "6v6-half-field",
    name: "6v6 Half Field Game",
    description: "Larger small-sided game with more positional structure",
    sport: "soccer",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 12,
    maxPlayers: 14,
    durationMinutes: 20,
    skillsDeveloped: ["positional-awareness", "finding-space"],
    setupInstructions:
      "Half of full field (55x40 yards). Full goal at one end, two mini goals at the other.",
    howToPlay:
      "1. One team attacks the full goal\n2. Other team attacks the two mini goals (counter-attack)\n3. Encourages realistic attacking and defending patterns\n4. Switch roles every 5-7 minutes",
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
    commonMistakes: [
      "Rushing attacks",
      "Poor positioning",
      "Lack of communication",
    ],
    variations: [
      {
        name: "Neutral Players",
        description: "Add 2 neutral players to support team in possession",
        difficulty: "intermediate",
      },
      {
        name: "Zones",
        description: "Add zones with player requirements",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Add neutral players",
    makeHarder: "Add touch restrictions, specific pass requirements",
    equipmentNeeded: ["Goals", "Mini goals", "Pinnies", "Balls"],
    spaceRequired: "large",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "6v6", "attacking", "defending"],
    featured: false,
  },
  {
    slug: "king-of-the-ring",
    name: "King of the Ring",
    description: "1v1 competition to knock opponents' balls out of circle",
    sport: "soccer",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["ball-control", "agility-coordination"],
    setupInstructions:
      "Create a circle (15-20 yards diameter). All players with a ball inside.",
    howToPlay:
      "1. Everyone dribbles in the circle\n2. Try to kick others' balls out while protecting yours\n3. If your ball goes out, do 10 toe taps and return\n4. Last one with ball in circle is 'King'",
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
    commonMistakes: [
      "Ball too far from body",
      "Only focused on attacking",
      "Not shielding",
    ],
    variations: [
      {
        name: "No Re-entry",
        description: "If knocked out, you're out for round",
        difficulty: "intermediate",
      },
      {
        name: "Partners",
        description: "Play as pairs - protect each other",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Larger circle, must stop ball before returning",
    makeHarder: "Smaller circle, no re-entry",
    equipmentNeeded: ["Cones", "1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "1v1", "shielding", "fun", "competition"],
    featured: true,
  },
  {
    slug: "target-goals-game",
    name: "Target Goals Game",
    description: "Small-sided game with multiple goal options to encourage decision making",
    sport: "soccer",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 14,
    durationMinutes: 15,
    skillsDeveloped: ["finding-space", "passing-short"],
    setupInstructions:
      "35x25 yard field. Each team has 3 small goals to defend (spread across end line).",
    howToPlay:
      "1. 4v4 or 5v5 game\n2. Can score in any of opponent's 3 goals\n3. Goals in corner goals worth 2 points\n4. Encourages width and switching play",
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
    commonMistakes: [
      "Only attacking central goal",
      "Not switching play",
      "Defenders bunched in middle",
    ],
    variations: [
      {
        name: "Must Switch",
        description: "Must pass to other side of field before scoring",
        difficulty: "intermediate",
      },
      {
        name: "Moving Goals",
        description: "Coach moves one goal during play",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Fewer goals (2 per team)",
    makeHarder: "Smaller goals, add touch restrictions",
    equipmentNeeded: ["Mini goals or cones", "Pinnies", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "decision-making", "width", "tactical"],
    featured: false,
  },
  {
    slug: "dribble-sprints",
    name: "Dribble Sprints",
    description: "Sprint conditioning with the ball at feet",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 10,
    skillsDeveloped: ["dribbling-with-speed", "speed"],
    setupInstructions:
      "Set up start line and finish line 30-40 yards apart. Each player has a ball.",
    howToPlay:
      "1. Sprint with ball from start to finish\n2. Walk back to start\n3. Rest time equals work time\n4. Repeat 6-8 times",
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
      {
        name: "With Turn",
        description: "Sprint out, turn around cone, sprint back",
        difficulty: "intermediate",
      },
      {
        name: "Relay Race",
        description: "Teams compete in dribble relay",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Shorter distance, more rest",
    makeHarder: "Longer distance, less rest, add finish at end",
    equipmentNeeded: ["Cones", "1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["conditioning", "dribbling", "speed", "fitness"],
    featured: false,
  },
  {
    slug: "box-to-box-runs",
    name: "Box to Box Runs",
    description: "Shuttle runs simulating midfielder workload",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "advanced",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 12,
    skillsDeveloped: ["speed"],
    setupInstructions: "Full field available, or marked 60-yard course.",
    howToPlay:
      "1. Start on penalty box line\n2. Sprint to opposite penalty box line\n3. Jog back\n4. Immediately sprint again\n5. Repeat 6-10 times with 60-second rest between sets",
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
    commonMistakes: [
      "Going too hard too early",
      "Walking instead of jogging back",
    ],
    variations: [
      {
        name: "With Ball",
        description: "Dribble on the way back",
        difficulty: "advanced",
      },
      {
        name: "Partner Work",
        description: "Partner passes to you at each end",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Shorter distance, more rest between reps",
    makeHarder: "Add ball work, less rest, more reps",
    equipmentNeeded: ["Cones"],
    spaceRequired: "large",
    indoorSuitable: false,
    appropriateStages: ["development"],
    tags: ["conditioning", "running", "endurance", "fitness"],
    featured: false,
  },
  {
    slug: "soccer-tennis-conditioning",
    name: "Soccer Tennis Conditioning",
    description: "Fun conditioning through soccer tennis rallies",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 12,
    skillsDeveloped: ["ball-control", "agility-coordination"],
    setupInstructions:
      "Court area 15x30 feet, divided in half. Net (or cones/rope) at waist height.",
    howToPlay:
      "1. Teams of 2-3 on each side\n2. Volleyball rules with feet (allow one bounce)\n3. Rally until ball bounces twice or goes out\n4. Continuous movement keeps heart rate up\n5. Losing team does 5 burpees before next point",
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
    commonMistakes: [
      "Flat-footed waiting",
      "No communication",
      "Poor first touch",
    ],
    variations: [
      {
        name: "No Bounce",
        description: "Ball cannot bounce",
        difficulty: "advanced",
      },
      {
        name: "Headers Only",
        description: "Can use head as well",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Two bounces allowed, larger court",
    makeHarder: "No bounces, smaller court, singles",
    equipmentNeeded: ["Cones", "Ball", "Net or rope"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["conditioning", "fun", "technique", "agility"],
    featured: true,
  },
  {
    slug: "pressing-game-fitness",
    name: "Pressing Game Fitness",
    description: "High-intensity pressing drill combining tactics and fitness",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "advanced",
    minPlayers: 12,
    maxPlayers: 18,
    durationMinutes: 12,
    skillsDeveloped: ["1v1-defending", "speed"],
    setupInstructions:
      "30x25 yard grid. Two teams, one possessing, one pressing.",
    howToPlay:
      "1. Team A keeps possession, team B presses for 60 seconds\n2. If Team B wins ball, they score a point and Team A gets it back\n3. After 60 seconds, switch roles\n4. Three rounds each team\n5. Most ball wins by pressing team wins",
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
      {
        name: "Counter Goals",
        description: "Pressing team can score in mini goals when they win",
        difficulty: "advanced",
      },
      {
        name: "Touch Limit",
        description: "Possession team limited to 2 touches",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Larger grid, 45-second rounds",
    makeHarder: "Smaller grid, 90-second rounds",
    equipmentNeeded: ["Cones", "Pinnies", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["development"],
    tags: ["conditioning", "pressing", "tactical", "high-intensity"],
    featured: false,
  },
  {
    slug: "soccer-bowling",
    name: "Soccer Bowling",
    description: "Knock down cones by passing/shooting - bowling with a soccer ball",
    sport: "soccer",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["shooting"],
    setupInstructions:
      "Set up 10 cones in bowling pin formation. Teams line up 15 yards away.",
    howToPlay:
      "1. Each player gets two 'rolls' (shots) to knock down cones\n2. One point per cone knocked down\n3. Spare (all cones in two shots) = 15 points\n4. Strike (all cones in one shot) = 20 points\n5. Teams take turns bowling",
    coachingPoints: [
      "Aim for the lead cone",
      "Strike through the ball",
      "Follow through to target",
    ],
    questionsToAsk: ["Where do you aim?", "How do you get power and accuracy?"],
    commonMistakes: ["Aiming too high", "Toe poking", "Not following through"],
    variations: [
      {
        name: "Long Distance Bowling",
        description: "Bowl from further away",
        difficulty: "intermediate",
      },
      {
        name: "Weak Foot Bowling",
        description: "Must use non-dominant foot",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Closer to pins, fewer pins",
    makeHarder: "Further from pins, weak foot only",
    equipmentNeeded: ["Cones (10)", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["fun", "shooting", "accuracy", "game"],
    featured: false,
  },
  {
    slug: "dribblers-vs-defenders",
    name: "Dribblers vs Defenders",
    description: "Mass 1v1 game where dribblers try to cross the field",
    sport: "soccer",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 10,
    maxPlayers: 24,
    durationMinutes: 12,
    skillsDeveloped: ["1v1-dribbling-moves", "finding-space"],
    setupInstructions:
      "30x40 yard field. Dribblers on one end line, 2-4 defenders in middle zone.",
    howToPlay:
      "1. All dribblers try to reach the other end line\n2. Defenders try to kick balls out\n3. If your ball is kicked out, you join the defenders\n4. Last dribbler remaining is the winner\n5. Play multiple rounds",
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
    commonMistakes: [
      "Running into defenders",
      "Not shielding",
      "Going too fast without control",
    ],
    variations: [
      {
        name: "British Bulldog",
        description: "If tagged (not ball kicked), you become defender",
        difficulty: "beginner",
      },
      {
        name: "Safe Zones",
        description: "Add 'safe zones' where defenders can't enter",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Wider field, fewer defenders",
    makeHarder: "Narrower field, more defenders",
    equipmentNeeded: ["Cones", "1 ball per dribbler"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["fun", "dribbling", "1v1", "game"],
    featured: true,
  },
  {
    slug: "four-goals-chaos",
    name: "Four Goals Chaos",
    description: "Scrimmage with four goals - anyone can score in any goal",
    sport: "soccer",
    activityType: "fun",
    difficulty: "intermediate",
    minPlayers: 10,
    maxPlayers: 16,
    durationMinutes: 15,
    skillsDeveloped: ["finding-space", "positional-awareness"],
    setupInstructions: "40x40 yard square. Small goal at each side. Two teams.",
    howToPlay:
      "1. Each team can score in any of the four goals\n2. After scoring, other team gets ball\n3. Emphasizes vision, switching play, and chaos\n4. Most goals in 10 minutes wins",
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
    commonMistakes: [
      "Tunnel vision on one goal",
      "Poor defensive organization",
      "Not scanning",
    ],
    variations: [
      {
        name: "Assigned Goals",
        description: "Each team has two goals to attack",
        difficulty: "intermediate",
      },
      {
        name: "Moving Goals",
        description: "Players can pick up and move one goal each minute",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Fewer goals, assigned attack goals",
    makeHarder: "More chaos, no goalkeepers",
    equipmentNeeded: ["4 small goals", "Pinnies", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["fun", "game", "chaos", "decision-making"],
    featured: true,
  },
  {
    slug: "partner-stretching",
    name: "Partner Stretching",
    description: "Cool down with partner-assisted stretching",
    sport: "soccer",
    activityType: "cooldown",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 8,
    skillsDeveloped: ["teamwork"],
    setupInstructions:
      "Partners find space. One ball per pair (optional for some stretches).",
    howToPlay:
      "Stretch each 30 seconds:\n1. Seated hamstring (partner gently pushes back)\n2. Calf stretch against partner\n3. Quad stretch with partner balance\n4. Groin stretch (soles together, partner presses knees)\n5. Back twist with partner support\n6. Shoulder stretch with partner assist",
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
    commonMistakes: [
      "Pushing too hard",
      "Bouncing stretches",
      "Holding breath",
    ],
    variations: [
      {
        name: "Ball Stretches",
        description: "Use ball in some stretches",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Less time per stretch",
    makeHarder: "Longer holds, more stretches",
    equipmentNeeded: ["None required"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["cooldown", "stretching", "recovery", "partners"],
    featured: false,
  },
  {
    slug: "keep-it-up-circle",
    name: "Keep It Up Circle",
    description: "Team juggling challenge to end practice",
    sport: "soccer",
    activityType: "cooldown",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 6,
    skillsDeveloped: ["ball-control", "teamwork"],
    setupInstructions:
      "Team forms a circle, standing close together. One ball per group.",
    howToPlay:
      "1. Keep the ball up using any body part except hands\n2. Each player can touch maximum twice\n3. Count consecutive touches as a team\n4. Try to beat your team record\n5. If ball drops, restart count",
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
    commonMistakes: [
      "Kicking too hard",
      "Not communicating",
      "Same players doing all touches",
    ],
    variations: [
      {
        name: "Feet Only",
        description: "Only feet allowed",
        difficulty: "advanced",
      },
      {
        name: "Two Balls",
        description: "Keep two balls up at once",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Allow unlimited touches per player",
    makeHarder: "One touch per player, feet only",
    equipmentNeeded: ["Ball"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["cooldown", "juggling", "teamwork", "fun"],
    featured: false,
  },
];

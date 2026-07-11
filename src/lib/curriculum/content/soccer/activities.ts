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
      "EQUIPMENT CHECKLIST\n□ 2-3 balls in play (coach holds extras for quick replacement; note: one ball only for the Championship Knockout variation)\n□ 2 cones or 1 small goal (3-4 paces wide)\n□ Optional: pinnies for later rounds\n□ Spare balls nearby for quick restarts\n\nSPACE: Open area with shooting area (minimum 20x30 paces)\n\nSETUP STEPS\n1. Set up one small goal (2 cones, 3-4 paces apart) OR use existing small goal\n2. Mark a shooting line about 8-10 paces from goal (optional but helpful)\n3. All players start spread around the goal area\n4. 2-3 balls in play\n\nDIAGRAM\n            ALL PLAYERS SPREAD OUT\n            ○    ○    ○    ○    ○\n              ○    ○    ○    ○\n                    ⚽ ⚽\n\n     - - - - - - - - - - - - - - (shooting line optional)\n\n                  ⊏⊐\n                 GOAL\n\n○ = player  ⚽⚽ = 2-3 balls in play  ⊏⊐ = goal (3-4 paces)",
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
          "When running the Championship Knockout variation, let knocked-out players do 5 juggles to re-enter. This softens the stakes of the sit-out format so they stay engaged.",
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
          "The classic sit-out-and-eliminate format, for older or highly competitive groups ready for real stakes: ONE ball only, no rejoin after scoring. Score and you're SAFE (sit down to watch); last player(s) without a goal are eliminated for the rest of that round. Crown a true last-player-standing champion. Best for the oldest/most competitive groups this activity is used with, or teams that thrive on stakes - younger or mixed-ability groups should stick with the points-based default so nobody sits out the whole round.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      'SIGNS THEY\'RE STRUGGLING:\n• Nobody scoring, frustration building\n• Balls stuck with one crowd\n• Weaker players never getting a touch\n\nSOLUTIONS:\n• Add even more balls (1 per 3-4 players)\n• Bigger goal or a second goal to spread play out\n• Shrink the return task to 2-3 toe taps so players get back in faster\n• Coach feeds an easy rolling ball toward players who haven\'t scored yet\n• Pair up weaker with stronger as a two-person "country"',
    makeHarder:
      'SIGNS THEY\'RE READY:\n• Everyone scoring easily, game feels too easy\n• Asking for more competition or stakes\n• Quick rounds, want a real winner\n\nSOLUTIONS:\n• Must beat someone 1v1 before shooting\n• Weak foot only\n• Must score from shooting line\n• Smaller goal\n• CHAMPIONSHIP KNOCKOUT (see variations) - for older/competitive groups ready for it: drop to ONE ball, score-and-sit-out, last without a goal is eliminated for the round. Save this for groups where sitting out won\'t sour the fun.',
    equipmentNeeded: ["2-3 balls in play (extras nearby; 1 ball for the Championship Knockout variation)", "2 cones for goal"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "shooting", "dribbling", "competition", "fun", "classic"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "All players compete with several balls in play; score a point and jump right back in after a quick task - develops shooting and decision-making while everyone keeps playing.",
        keyPhrases: [
          "Find space - be where the ball goes!",
          "Take your shot when you have it!",
          "Stay calm - your chance will come!",
        ],
        setupDiagram:
          "One small goal, 2-3 balls in play, all players spread around shooting area",
        quickProgression: {
          easier: "Even more balls in play, a shorter rejoin task, team up weaker players",
          harder: "Must beat defender first, weak foot only, smaller goal",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up small goal (2 cones, 3-4 paces wide)",
            "Have 2-3 spare balls ready for quick restarts",
            "Consider shooting line for organization",
            "Think about how to keep the rejoin task quick so nobody waits long",
          ],
          mindset:
            "This is HIGH ENERGY competition. Your job is to keep it moving fast, restart quickly when ball goes out, and make sure nobody stands around after a miss - the toe-tap-and-rejoin keeps everyone active. Celebrate all goals equally. Watch for dominant players and discouraged players.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "By the goal",
            script:
              "Explain: everyone for themselves, every goal is a point - score, do 5 quick toe taps, jump right back in. Nobody sits out. Pick country names. 'SEVERAL BALLS, NO HANDS, NO KEEPERS!'",
            anticipatedResponses: {
              "What if I never get the ball?":
                "Find space away from the crowd! The ball always pops out.",
              "That's not fair, they're bigger":
                "Smart players don't always chase - they wait for chances!",
              "Can we have teams?":
                "Not this version, but we can try pairs next round!",
            },
            troubleshooting: {
              "Players don't understand the toe-tap-and-rejoin rule": [
                "You never sit out in this version! Score, do your 5 taps, jump right back in.",
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
              "Drop 2-3 balls in around the area, step back. Call out 'GOAL! [Country] - that's a point! Toe taps, then back in!' when scores happen. Quick restarts on out balls. End on time, then count goals scored.",
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
              "Add variation if desired (weak foot double, 1v1 required, etc.). Same points-based rule - everyone keeps playing the whole round.",
            troubleshooting: {
              "Same players not scoring again": [
                "Consider pairing up or adding multiple balls",
              ],
              "Players giving up": [
                "Encourage: 'Stay with it! Your chance is coming!'",
              ],
            },
          },
          {
            phase: "Round 3 - Bonus Round",
            duration: "3-4 minutes",
            coachPosition: "Near goal, high energy",
            script:
              "Same rules - score, tap, jump back in - but every goal this round is worth DOUBLE points. Build drama with your voice. Add up total points across all three rounds and crown a champion at the end!",
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
          knockoutVariationUpset: {
            symptoms: [
              "Crying or angry when eliminated (Championship Knockout variation only)",
              "Refusing to sit out",
              "Saying the game is unfair",
            ],
            approach:
              "This only comes up if you're running the Championship Knockout variation - the default points-based format has no sit-out. If it happens: private word: 'I know it's hard. You'll be back in for Round 2! Watch the others and learn their tricks.' Or switch back to the points-based default for this group.",
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
              "Game rewards scoring with points and a fast return to play - creates urgency and decision-making around when/how to shoot.",
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
          resilience: "Bouncing back after a scoreless stretch",
          decisionMaking: "Constant choices under pressure",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "World Cup replicates game chaos in concentrated form. Players must find space, win balls, make decisions, and finish - all under time pressure with consequences. The points-based scoring adds urgency that transfers to game situations without anyone sitting out; the optional Championship Knockout variation raises the stakes further for groups ready for real elimination. Plus, kids LOVE it.",
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
            "Championship Knockout variation with very young players who can't handle real elimination - stick to the points-based default instead",
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
            approach: "Maximum fun, everyone stays moving",
            keyPhrases: [
              "Have a go!",
              "Great try!",
              "Score and jump right back in!",
            ],
            avoidSaying: ["You're out!", "That was a bad shot"],
            duration: "8-10 minutes maximum",
            simplifications: [
              "Extra balls so nobody waits long for a touch",
              "Shorten the rejoin task to 2-3 toe taps",
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
              "Bonus round worth double points",
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
              "Championship Knockout variation for real stakes",
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
            "The default format already has no elimination - score, tap, rejoin. The urgency still works without real elimination; save Championship Knockout for older or highly competitive groups who want the stakes.",
        },
      },
      parentCommunication: {
        ifAsked:
          "World Cup is a classic soccer game where players compete to score the most points while several balls are in play. It teaches shooting, finding space, and making quick decisions - all in a fun, game-like environment. Everyone keeps playing the whole time, so no one feels left out.",
        newsletter:
          "We played WORLD CUP this week - the famous playground game where everyone competes to score the most points! Ask your child about it: What country were they? Did they score? What strategy worked best? This game develops shooting, positioning, and competitive spirit - and everyone kept playing the whole time!",
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
              "Quick toe-tap-and-rejoin so nobody waits long; multiple balls in play; save full elimination for the optional Championship Knockout variation",
            response:
              "Private word; break if needed; adjust rules to reduce frustration",
          },
        ],
        inclusionConsiderations: {
          skillDifferences:
            "Pair weaker with stronger; weak foot for advanced; multiple balls for equal chances",
          physicalDifferences:
            "Larger goal; longer shooting range allowed; adjust the rejoin task instead of elimination criteria",
          emotionalSensitivity:
            "Skip the Championship Knockout variation for anxious players; keep the default points-based format; pair with supportive player",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did all players get shooting opportunities?",
          "If using Championship Knockout, was elimination handled sensitively?",
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
    description:
      "Groups of three practice the classic 'give-and-go': the mover passes to a wall player, sprints into space, and receives a first-time return pass into their path. Builds one-touch passing technique, disguised support angles, and the timing between passing and moving that unlocks combination play in games.",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 12,
    skillsDeveloped: ["passing-short", "support-play", "receiving-first-touch"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per group of 3\n□ 2 cones per group (start cone and end/target cone)\n□ Optional: 1 pinny per group to mark the 'wall' player\n\nSPACE: 10-12 pace channel per group, plus 3-4 paces of width for the wall player's angle\n\nSETUP STEPS\n1. Place a start cone and an end cone 10-12 paces apart for each group\n2. Wall player (B) stands 3-4 paces off the direct line, roughly halfway between the cones, angled so they can see both the ball and the target\n3. Player A begins at the start cone with the ball; Player C waits at the end cone as the target\n4. Space groups at least 5 paces apart if running several channels at once\n5. After each repetition, rotate: A becomes the new wall, B becomes the new target, C becomes the new mover\n\nDIAGRAM\n┌──────────────────────────────────────┐\n│ ▲ A(⚽)                        ▲ C   │\n│   \\                             |    │  10-12\n│    \\                            |    │  paces\n│     ○ B (wall, 3-4 paces off)   |    │\n└──────────────────────────────────────┘\n\n▲ = cone   ○ = wall player   ⚽ = ball\nA passes to B, sprints toward C; B one-touches into A's path; A collects and dribbles to C",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Beside one demo group\n\nSAY: "This is a wall pass - also called a give-and-go. You\'ll pass to your teammate, then sprint past them like they\'re a wall you bounced the ball off of!"\n\nDEMO with two players: A passes to B, sprints forward, B one-touches it into A\'s path, A runs onto it and dribbles to the end cone.\n\nSAY: "Three jobs: pass and SPRINT immediately, wall player plays it FIRST TIME into the runner\'s path, runner collects and drives to the end. Let\'s try it!"\n\n\nPHASE 2: ROUND 1 - BUILD THE PATTERN (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Groups of three, get in your channels! A starts with the ball. Go slow first - we want a good pattern before we add speed."\n\nCoach Position: Walking between groups\n\nLOOK FOR:\n□ Does A sprint immediately after passing, or stand and watch?\n□ Is B\'s return pass one touch, played INTO A\'s path (not at A\'s feet)?\n□ Is A\'s first touch after receiving under control?\n\nPHRASES TO USE:\n• "Pass and GO - don\'t admire your pass!"\n• "Wall player - one touch, into the space ahead of the runner!"\n• "Nice angle, B - I can see the passer AND the target!"\n\nRotate after every 2 reps: A→wall, wall→target, target→A.\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch this group."\n\nDEMO: Show a return pass played AT the runner\'s feet (runner has to slow down) vs. a return pass played INTO the space ahead (runner runs onto it at full speed).\n\nSAY: "See the difference? A pass to feet makes you stop. A pass to SPACE lets you keep sprinting. That\'s the whole point of the wall pass - beat a defender with speed, not just skill!"\n\n\nPHASE 4: ROUND 2 - ADD SPRINT TIMING (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same pattern, but now full speed sprint after your pass. Wall player, lead them into space!"\n\nCoach Position: Roaming, giving 1-on-1 feedback\n\nPHRASES TO USE:\n• "Explode after that pass!"\n• "Open your body to the field before you receive!"\n• "First touch forward, into your stride!"\n\n\nPHASE 5: CHALLENGE ROUND (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE challenge:\n\nOption A - Weak Foot Wall:\nSAY: "This round, the wall player must use their weak foot for the return pass!"\n\nOption B - Passive Defender:\nSAY: "One player jogs alongside as a passive defender - just enough pressure to make your timing sharp."\n\nOption C - Finish It:\nSAY: "After A collects the return pass, take one more touch and finish into an imaginary goal at the end cone!"\n\nRun challenge. Celebrate good combinations loudly.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great combination play! What made your best wall pass work?"\n\nListen for: "Sprinting right after the pass," "One-touch return," "Pass to space not feet"\n\nSAY: "That\'s exactly how you beat defenders in a real game - two players working together beat one defender working alone. Water break!"',
    diagram:
      "┌──────────────────────────────────────┐\n│ ▲ A(⚽)                        ▲ C   │\n│   \\                             |    │\n│    \\                            |    │\n│     ○ B (wall, 3-4 paces off)   |    │\n└──────────────────────────────────────┘\n\n▲ = cone   ○ = wall player   ⚽ = ball",
    coachingPoints: [
      "SPRINT IMMEDIATELY AFTER PASSING → Say: 'Pass and GO - don't admire your pass!'",
      "ONE-TOUCH RETURN INTO SPACE → Say: 'Wall player - play it into the space ahead, not at their feet!'",
      "OPEN BODY SHAPE ON THE WALL → Say: 'Angle yourself so you can see both the passer and the target before the ball arrives!'",
      "FIRST TOUCH FORWARD → Say: 'Push your first touch into your next stride - don't stop the ball dead!'",
    ],
    questionsToAsk: [
      "'Where should your first pass go?' → To the wall player's strong foot, so they can play it first time",
      "'When do you start your sprint?' → The instant the ball leaves your foot, not after watching it arrive",
      "'How does the wall player know where to pass?' → By watching the runner's angle and speed before the ball arrives",
      "'Why is this called a give-and-go?' → You give (pass) then go (sprint) - two players beating one defender",
    ],
    commonMistakes: [
      "WATCHING THE PASS INSTEAD OF SPRINTING → Say: 'Pass and go - your legs should already be moving!'",
      "WALL PASS PLAYED BEHIND THE RUNNER → Say: 'Lead them! Play it into the space they're running into.'",
      "TAKING TOO MANY TOUCHES ON THE WALL PASS → Say: 'One touch if you can - that's what makes it fast!'",
      "POOR FIRST TOUCH STOPS MOMENTUM → Say: 'Push your first touch forward, into your run!'",
    ],
    variations: [
      {
        name: "Third Man Run",
        description:
          "Add a fourth player making an overlapping run from behind as A plays the wall pass - A now has two options and must read which run is on.",
        difficulty: "advanced",
      },
      {
        name: "Double Wall",
        description:
          "Chain two wall passes in sequence with two different wall players before reaching the end cone - tests timing and communication over a longer sequence.",
        difficulty: "advanced",
      },
      {
        name: "Defended Wall Pass",
        description:
          "A passive defender (from another group) jogs alongside the runner to add just enough pressure that the combination has to be quick and accurate to beat them.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Wall player needs 2-3 touches to return the pass\n• Runner stops or walks after passing instead of sprinting\n• Return pass consistently goes behind or wide of the runner\n• First touch after receiving knocks the ball too far away\n\nSOLUTIONS:\n• Allow the wall player two touches instead of one\n• Shorten the channel to 6-8 paces\n• Coach stands at the wall spot and models the pass timing\n• Walk through the pattern at half speed before adding the sprint",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Consistent one-touch return passes into the runner's path\n• Runner sprints immediately without prompting\n• First touch after receiving keeps the ball moving forward\n• Pattern looks smooth and automatic\n\nSOLUTIONS:\n• Require the wall player's weak foot on the return\n• Add a passive then active defender\n• Chain two wall passes in a row (Double Wall variation)\n• Finish with a shot at the end cone under time pressure",
    equipmentNeeded: ["Cones", "1 ball per group of 3", "Pinnies (optional)"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["passing", "combination play", "one-two", "movement"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Pass to a 'wall' player, sprint into space, and receive a one-touch return pass into your path - the give-and-go that beats a defender with movement, not just skill.",
        keyPhrases: [
          "Pass and GO - don't admire your pass!",
          "Wall player - into the space, not to the feet!",
          "First touch forward, into your stride!",
        ],
        setupDiagram:
          "10-12 pace channel per group of 3; wall player stands 3-4 paces off the line, roughly halfway",
        quickProgression: {
          easier: "Two touches for the wall player, shorter channel, walk through at half speed",
          harder: "Weak foot wall pass, add a defender, chain two wall passes (Double Wall)",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up start/end cone channels 10-12 paces apart, one per group of 3-4",
            "Decide where wall players will stand before players arrive",
            "Have pinnies ready if you want the wall player visually marked",
            "Plan your rotation order so every player gets every role",
          ],
          mindset:
            "This is a timing drill disguised as a passing drill. The pass quality matters, but the SPRINT after the pass is what most players skip. Be relentless about 'pass and go' - that habit is what makes this translate to games.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Beside one demo group",
            script:
              "SAY: 'Pass to your teammate, then sprint past them like they're a wall you bounced the ball off of!' Demo the full pattern once. 'Pass and sprint, wall plays it first time, runner collects and drives forward.'",
            anticipatedResponses: {
              "Which foot do I pass with?":
                "Whichever gets the cleanest pass to the wall player - usually your strong foot to start.",
              "Do I have to run in a straight line?":
                "Run toward where the ball is going to be, not straight ahead - read the return pass.",
            },
          },
          {
            phase: "Round 1 - Build the Pattern",
            duration: "3 minutes",
            coachPosition: "Walking between groups",
            script:
              "Let groups walk through the pattern slowly first. Reinforce: pass and sprint immediately, one-touch return into space, controlled first touch.",
            troubleshooting: {
              "Runner stands still after passing": [
                "Physically point where they should be running as they pass",
              ],
              "Wall player needs multiple touches": [
                "Move the wall player closer to the passer to shorten the pass",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "At one group, everyone gathered",
            script:
              "Demo a pass to feet (runner has to stop) vs. a pass to space (runner keeps sprinting). 'That's the whole point of the wall pass - beat a defender with speed!'",
          },
          {
            phase: "Round 2 - Add Sprint Timing",
            duration: "3 minutes",
            coachPosition: "Roaming, 1-on-1 feedback",
            script:
              "Push for full-speed sprints and earlier body-opening by the wall player. Individual feedback on timing, not just technique.",
          },
          {
            phase: "Challenge Round",
            duration: "3 minutes",
            coachPosition: "Roaming",
            script:
              "Pick one: weak foot wall pass, passive defender, or finish with a shot. Celebrate clean combinations loudly.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center, groups gathered",
            script:
              "ASK: 'What made your best wall pass work?' Connect to games: two players working together beat one defender working alone.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Consistent one-touch returns without thinking",
              "Runners sprinting automatically",
              "Pattern looks effortless",
            ],
            solutions: [
              "Weak foot wall pass",
              "Add a passive defender",
              "Chain two wall passes (Double Wall)",
              "Finish with a shot under time pressure",
            ],
          },
          tooHard: {
            symptoms: [
              "Wall player needs several touches",
              "Runners stop instead of sprinting",
              "Return passes consistently miss the runner's path",
            ],
            solutions: [
              "Shorten the channel",
              "Allow two touches for the wall player",
              "Walk through at half speed before adding sprint",
              "Coach demonstrates the wall player's role directly",
            ],
          },
        },
        playerBehavior: {
          notSprinting: {
            symptoms: [
              "Runner walks or jogs after passing",
              "Runner watches the pass instead of moving",
            ],
            approach:
              "SAY: 'Pass and GO - your legs should already be moving before the ball arrives at the wall!' Point to where they should run.",
          },
          confusionOverRotation: {
            symptoms: ["Players unsure whose turn it is", "Standing around between reps"],
            approach:
              "Call out the rotation out loud each time: 'A becomes wall, wall becomes target, target becomes runner - go!'",
          },
        },
        environmentalIssues: {
          groupsTooClose: {
            symptoms: ["Balls from different groups colliding", "Runners cutting through other channels"],
            solution: "Space channels at least 5-6 paces apart, or stagger start times between groups.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Passing (Short)",
            domain: "technical",
            howItDevelops:
              "The wall player must play an accurate, well-weighted one-touch pass into a moving target's path - a much harder demand than passing to a stationary partner.",
            levelIndicators: {
              1: "Needs multiple touches before passing; pass often inaccurate",
              2: "One-touch pass sometimes clean but often to feet, not space",
              3: "Consistent one-touch pass, usually into the runner's path",
              4: "Reads the runner's speed and adjusts pace/weight of pass",
              5: "Disguises the pass and times it perfectly for the runner's stride",
            },
            assessmentNotes:
              "Watch the wall player's touch count and where the ball ends up relative to the runner's path.",
          },
          {
            skill: "Support Play",
            domain: "tactical",
            howItDevelops:
              "The wall player has to find an angle where they can see both the ball and the target before it arrives - the foundation of good supporting positioning in games.",
            levelIndicators: {
              1: "Stands directly on the line; no real angle",
              2: "Some angle but reacts late to the ball",
              3: "Consistently finds a supporting angle before the pass arrives",
              4: "Adjusts angle based on where the runner is heading",
              5: "Positions to make the next pass easy before being asked",
            },
            assessmentNotes: "Watch body orientation before the ball arrives at the wall player.",
          },
        ],
        secondarySkills: [
          {
            skill: "Receiving / First Touch",
            domain: "technical",
            howItDevelops:
              "The runner must control the return pass at speed and push it forward into their next stride - a first touch under time pressure.",
          },
          {
            skill: "Speed",
            domain: "physical",
            howItDevelops:
              "Sprinting immediately after passing trains the explosive first steps needed to beat a defender in games.",
          },
        ],
        physicalDevelopment: {
          agility: "Change of pace from a standing pass to a full sprint",
          coordination: "Passing accurately while preparing to move",
        },
        psychologicalDevelopment: {
          teamwork: "Success depends entirely on the wall player's timing and awareness of a teammate",
          confidence: "Executing a clean combination builds belief in playing quick, purposeful soccer",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "The give-and-go is one of the most effective ways to beat a defender in real games because it uses two players' movement instead of one player's dribbling skill. Practicing it as a repeatable pattern builds the passing technique, timing, and support angles that combination play depends on.",
        whenToUseIt: {
          idealFor: [
            "After players are comfortable with basic passing technique (Passing Pairs, Passing Accuracy Challenge)",
            "Building toward small-sided games that reward combination play",
            "Mid-practice technical block once players are warmed up",
          ],
          avoidWhen: [
            "Players haven't yet developed a reliable inside-of-foot pass",
            "Very early practice before technique work has happened",
          ],
        },
        progressionPath: {
          before: [
            { activity: "Passing Pairs", reason: "Establishes basic passing and receiving technique" },
            { activity: "Passing Accuracy Challenge", reason: "Builds pass accuracy under a simple target" },
          ],
          after: [
            { activity: "Rondo 4v1", reason: "Applies quick one-touch passing under pressure" },
            { activity: "4v4 to Small Goals", reason: "Combination play now has to happen against real defenders" },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Not typically used before ages 9-10 - the timing demands (one-touch pass into a moving target) are usually too advanced. If used with an advanced group, simplify heavily.",
            keyPhrases: ["Pass then run to your friend!", "Catch the ball with your feet!"],
            avoidSaying: ["You need to one-touch this", "That was too slow"],
            duration: "Not recommended; substitute Passing Pairs instead",
            simplifications: ["Allow unlimited touches for the wall player", "Walk instead of sprint"],
          },
          ages9to11: {
            approach: "Introduce the pattern with two touches allowed for the wall player, build toward one touch",
            keyPhrases: ["Pass and go!", "Into the space, not the feet!"],
            avoidSaying: ["You should already know this"],
            duration: "8-10 minutes",
            simplifications: ["Two touches allowed for the wall player", "Shorter channel (8 paces)"],
          },
          ages12to14: {
            approach: "Full one-touch demand, add defenders and chained combinations",
            keyPhrases: ["Disguise your pass", "Read the defender's weight before you go"],
            duration: "12-15 minutes",
            challenges: ["Weak foot wall pass", "Passive then active defender", "Double Wall combination"],
          },
        },
        commonMisconceptions: {
          "The wall player just stands there and taps it back":
            "The wall player is actively reading the runner's speed and angle to time and weight the return pass correctly - it's an active role, not a passive one.",
          "This only works with fast players":
            "Timing and disguise matter more than raw speed - a well-timed wall pass beats a faster defender who reacts late.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We're working on the 'give-and-go' - a classic soccer combination where your child passes to a teammate and sprints into space to receive it right back. It teaches quick decision-making and teamwork, not just individual skill.",
        newsletter:
          "This week: Wall Pass Combinations! Players practiced the give-and-go in groups of three - pass, sprint, and receive a one-touch return pass. This is one of the most useful patterns in real games because it uses teamwork to beat a defender.",
        whatToWatchFor: [
          "Does your child sprint immediately after passing, or stand and watch?",
          "Can they receive a moving pass and keep it under control at speed?",
          "Are they starting to look for a teammate to combine with during games?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions between groups running in adjacent channels",
            prevention: "Space channels at least 5-6 paces apart; stagger start times",
            response: "Check players for injury; widen spacing before continuing",
          },
          {
            risk: "Sprained ankle from a hard cut while sprinting onto the return pass",
            prevention: "Proper warm-up before this activity; remind players to accelerate under control",
            response: "Rest and assess; ice if needed",
          },
        ],
        inclusionConsiderations: {
          speedDifferences: "Allow players who move at different paces to walk the pattern while others sprint - the passing and timing lesson still applies",
          skillGaps: "Pair less confident passers with a strong wall player initially, then rotate everyone through all three roles",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players sprinting immediately after their pass?",
          "Was the wall player's return pass consistently one touch and into space?",
          "Did the rotation keep everyone engaged in all three roles?",
        ],
        forImprovement: [
          "Which groups need the channel shortened next time?",
          "Who is ready for the weak-foot or defended challenge?",
          "How can I connect this more explicitly to today's small-sided game?",
        ],
      },
    },
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
    description:
      "A possession game where teams score by dribbling the ball under control into the opponent's end zone instead of shooting at a goal - rewards spacing, quick decisions between dribbling and passing, and supporting the ball carrier.",
    sport: "soccer",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 16,
    durationMinutes: 15,
    skillsDeveloped: ["when-to-dribble-vs-pass", "finding-space", "support-play"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ Cones to mark the field and end zones\n□ Pinnies for two teams\n□ 1-2 balls (spare nearby for quick restarts)\n\nSPACE: 35x25 paces, with a 5-pace end zone at each end\n\nSETUP STEPS\n1. Mark a 35x25 pace field\n2. Mark a 5-pace end zone across the full width at each end\n3. Split into two even teams with pinnies\n4. All players are outfield - no goalkeepers\n5. Start with the ball in the middle of the field\n\nDIAGRAM\n┌───────┬───────────────────┬───────┐\n│ END   │                   │ END   │\n│ ZONE  │      35x25         │ ZONE  │\n│ (5pc) │      paces         │ (5pc) │\n└───────┴───────────────────┴───────┘\n\n○ = players spread across the middle, attacking either end zone",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of the field\n\nSAY: "This is End Zone Game! Instead of a goal, you score by dribbling the ball UNDER CONTROL into your opponent\'s end zone - that\'s this strip at their end!"\n\nSAY: "You have to be in control of the ball when you cross the line - if you just kick it in and chase, it doesn\'t count! After a score, the other team restarts from their own end zone. No goalkeepers - everyone plays!"\n\n\nPHASE 2: ROUND 1 - FREE PLAY (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Play ball! Work it forward and find a way into their end zone!"\n\nCoach Position: Outside the field, moving to see both end zones\n\nWATCH FOR:\n□ Are players spreading across the width, or bunching in the middle?\n□ Are they rushing into the end zone without control?\n□ Is anyone supporting the ball carrier, or standing and watching?\n\nPHRASES TO USE:\n• "Spread out - use the whole width!"\n• "Slow down - control it before you cross the line!"\n• "Get close to support your teammate!"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze! Watch this - if I sprint the ball toward the end zone with no control, what happens?"\n\nDEMO: Kick the ball ahead too far and lose it before the line.\n\nSAY: "See? No score! Now watch when I keep it close and controlled..."\n\nDEMO: Dribble in with the ball tight, cross the line in control.\n\nSAY: "That counts! Sometimes that means passing to a teammate in space instead of trying to dribble through everyone yourself!"\n\n\nPHASE 4: ROUND 2 - APPLY THE LESSON (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same game - but now think about when to dribble and when to pass. Play on!"\n\nCoach Position: Roaming, calling out good decisions\n\nPHRASES TO USE:\n• "Great decision - passing when you were surrounded!"\n• "Nice controlled run into the zone!"\n• "Good support - you gave your teammate an option!"\n\n\nPHASE 5: CHALLENGE ROUND (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE:\n\nOption A - Receive in End Zone:\nSAY: "New rule - you can only score by RECEIVING a pass in the end zone, not dribbling in yourself! This forces you to find a teammate!"\n\nOption B - Time Limit:\nSAY: "Once your team has the ball, you have 30 seconds to score or you lose possession! Keep it moving!"\n\nRun the challenge for the remaining time.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great game! What helped you score - dribbling in, or passing to a teammate?"\n\nListen for: "Passing when I was surrounded," "Dribbling when I had space," "Staying spread out"\n\nSAY: "Reading when to dribble and when to pass is one of the biggest decisions in real games. Awesome work - water break!"',
    diagram:
      "┌───────┬───────────────────┬───────┐\n│ END   │                   │ END   │\n│ ZONE  │      35x25         │ ZONE  │\n│ (5pc) │      paces         │ (5pc) │\n└───────┴───────────────────┴───────┘\n\n○ = players spread across the middle, attacking either end zone",
    coachingPoints: [
      "WIDTH IN ATTACK → Say: 'Spread out across the whole field - use all the space you have!'",
      "QUICK BALL CIRCULATION → Say: 'Move the ball fast - don't let defenders set up!'",
      "DRIBBLE VS PASS → Say: 'If you're surrounded, look for the pass - if you've got space, take it yourself!'",
      "SUPPORT THE BALL CARRIER → Say: 'Get close and give your teammate an easy option!'",
    ],
    questionsToAsk: [
      "'When should you try to score versus keep possession?' → Looking for: when you have control and space vs. when you should recycle the ball",
      "'How do you create space to dribble into the zone?' → Spreading out, drawing defenders away, using width",
      "'Where should you be when your teammate has the ball?' → Close enough to support, in space they could actually pass to",
      "'What made that last score work?' → Develops reflection on the dribble-vs-pass decision that just happened",
    ],
    commonMistakes: [
      "RUSHING INTO THE END ZONE WITHOUT CONTROL → Say: 'Slow down - it only counts if you're in control when you cross!'",
      "NOT SPREADING OUT → Say: 'Use the whole width of the field - don't bunch up!'",
      "EVERYONE CHASING THE BALL → Say: 'If you're not near the ball, find open space instead!'",
      "DRIBBLING WHEN SURROUNDED → Say: 'Look up - is a teammate open for a pass?'",
    ],
    variations: [
      {
        name: "Receive in End Zone",
        description:
          "Players must receive a pass inside the end zone to score rather than dribbling in - forces teams to find a target player instead of running the ball in solo.",
        difficulty: "intermediate",
      },
      {
        name: "Time Limit",
        description:
          "Once a team wins the ball, they must score within 30 seconds or possession turns over - speeds up decision-making and ball circulation.",
        difficulty: "advanced",
      },
      {
        name: "Two-Touch End Zone",
        description:
          "Limit every player to two touches maximum, rewarding quick combination play to break into the end zone.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Nobody reaching the end zone in control\n• Constant bunching around the ball\n• Same few players touching the ball every time\n\nSOLUTIONS:\n• Widen the field or enlarge the end zones to 8-10 paces\n• Allow a score even with a slightly loose touch at first, tightening the rule as they improve\n• Add a rule that every player must touch the ball before a team can score\n• Coach pauses play to point out open space and easy passing options",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Scoring regularly with clean, controlled entries\n• Good spacing and quick decisions between dribble and pass\n• Asking for more challenge\n\nSOLUTIONS:\n• Shrink the end zones to 3 paces\n• Add a neutral player who always supports the defending team\n• Add the Time Limit variation to speed up decisions\n• Require a pass before any score counts (Receive in End Zone)",
    equipmentNeeded: ["Cones", "Pinnies", "1-2 balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "possession", "dribbling", "tactical"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "A possession game where teams score by dribbling under control into the opponent's end zone - builds spacing, quick dribble-vs-pass decisions, and support play.",
        keyPhrases: [
          "Spread out - use the whole width!",
          "Slow down - control it before you cross!",
          "Get close and support the ball carrier!",
        ],
        setupDiagram: "35x25 pace field with a 5-pace end zone at each end, two teams, no goalkeepers",
        quickProgression: {
          easier: "Wider field, larger end zones, everyone-touches rule",
          harder: "Smaller end zones, neutral defender, time limit",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a 35x25 pace field with a 5-pace end zone at each end",
            "Split into two even teams with pinnies",
            "Confirm all players understand there are no goalkeepers - everyone attacks and defends",
            "Have a spare ball ready for instant restarts after a score",
          ],
          mindset:
            "The 'control required to score' rule is the whole lesson - it punishes rushing and rewards exactly the decision-making (dribble vs. pass, when to go, when to support) that shows up in real games. Resist the urge to referee every close call strictly at first; let the teaching moment introduce the standard, then hold it consistently.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center of the field",
            script:
              "SAY: 'Dribble under control into their end zone to score - no control, no score!' Point out both end zones and confirm no goalkeepers.",
            anticipatedResponses: {
              "What if I kick it in and chase it?": "Doesn't count - you have to be in control when you cross the line.",
              "Can I pass into the end zone?": "Yes, if a teammate is there to receive it in control!",
            },
            troubleshooting: {
              "Confusion about the end zone boundary": ["Walk the line with them before starting"],
            },
          },
          {
            phase: "Round 1 - Free Play",
            duration: "4 minutes",
            coachPosition: "Outside the field, moving to see both end zones",
            script:
              "Let it play. Call out: 'Spread out!' 'Control it before you cross!' Watch for bunching and rushed entries.",
            troubleshooting: {
              "Everyone bunching in the middle": [
                "Pause briefly: 'Two players go stand near an end zone - see the space open up?'",
              ],
              "Rushed, uncontrolled entries": [
                "Call it out kindly: 'Close, but you lost control - try again slower next time!'",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "Center, everyone gathered",
            script:
              "Demo a rushed, out-of-control entry (no score) vs. a controlled dribble-in (scores). 'Sometimes that control comes from passing to an open teammate instead of forcing it yourself.'",
          },
          {
            phase: "Round 2 - Apply the Lesson",
            duration: "4 minutes",
            coachPosition: "Roaming, calling out good decisions",
            script: "Play resumes. Praise good dribble-vs-pass reads and supportive positioning.",
          },
          {
            phase: "Challenge Round",
            duration: "4 minutes",
            coachPosition: "Roaming",
            script:
              "Pick one: Receive in End Zone (forces passing) or Time Limit (forces tempo). Match the choice to what Round 2 revealed.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What helped you score - dribbling in or passing to a teammate?' Connect to reading the game in real matches. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Scoring very easily with little defensive resistance",
              "No real decision-making required",
            ],
            solutions: [
              "Shrink the end zones",
              "Add a neutral player supporting the defense",
              "Add the Time Limit variation",
              "Require a pass before any score counts",
            ],
          },
          tooHard: {
            symptoms: [
              "Nobody controlling the ball into the zone",
              "Constant loose touches and turnovers before the line",
            ],
            solutions: [
              "Widen the field or enlarge the end zones",
              "Loosen the control standard temporarily, tightening as they improve",
              "Require every player to touch the ball before scoring, spreading possession",
            ],
          },
        },
        playerBehavior: {
          bunchingInMiddle: {
            symptoms: ["All players clustered around the ball regardless of position"],
            approach:
              "Pause briefly and physically walk two players toward an end zone: 'See how much space just opened up?'",
          },
          oneOrTwoPlayersDominatingBall: {
            symptoms: ["Same players touching the ball on nearly every possession"],
            approach:
              "Add a rule that every player must touch the ball before a team can score in the end zone.",
          },
          arguingOverControlCalls: {
            symptoms: ["Disputes about whether a player was 'in control' crossing the line"],
            approach:
              "Coach makes the call and moves on quickly; explain the standard once clearly rather than re-litigating each time.",
          },
        },
        environmentalIssues: {
          unclearEndZoneBoundary: {
            symptoms: ["Disputes about whether the ball crossed into the end zone"],
            solution: "Use brightly colored or extra cones to make the end zone line unmistakable.",
          },
          unevenTeamSizes: {
            symptoms: ["One team dominating possession due to a numbers advantage"],
            solution: "Rebalance teams immediately, or add a neutral player to the smaller team.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "When to Dribble vs Pass",
            domain: "Tactical",
            howItDevelops:
              "The control-required-to-score rule directly punishes forcing a dribble through defenders and rewards recognizing when passing to an open teammate is the better option.",
            levelIndicators: {
              1: "Always tries to dribble in regardless of pressure, losing the ball often",
              2: "Occasionally passes when surrounded, but usually after already losing control",
              3: "Regularly reads pressure and chooses dribble or pass appropriately",
              4: "Makes quick, mostly correct decisions under moderate pressure",
              5: "Consistently picks the higher-percentage option and executes it under real defensive pressure",
            },
            assessmentNotes:
              "Watch what happens when a dribbler meets 2+ defenders - do they force it, or find the pass?",
          },
          {
            skill: "Finding Space",
            domain: "Tactical",
            howItDevelops:
              "Because the whole width of the field is usable and there's no fixed goal to crowd around, players must actively find space to receive and to attack the end zone.",
            levelIndicators: {
              1: "Stays near the ball regardless of space elsewhere",
              2: "Occasionally moves to open space but inconsistently",
              3: "Regularly finds space to support or receive",
              4: "Proactively creates space by moving before the ball arrives",
              5: "Consistently exploits the most valuable open space on the field",
            },
            assessmentNotes: "Watch off-ball movement, not just what happens on the ball.",
          },
        ],
        secondarySkills: [
          {
            skill: "Support Play",
            domain: "Tactical",
            howItDevelops:
              "Because a controlled entry often requires a pass, players learn to position themselves as a genuine passing option for the ball carrier.",
          },
          {
            skill: "Teamwork",
            domain: "Psychological",
            howItDevelops:
              "Scoring depends on combining with teammates rather than solo dribbling, reinforcing collaborative attacking play.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "Replacing a goal with a control-required end zone strips away shooting mechanics and isolates the exact decision that separates good attacking play from rushed attacking play: dribble or pass, and when. It's an ideal format for teaching spacing and decision-making before adding shooting into the mix.",
        whenToUseIt: {
          idealFor: [
            "Introducing the dribble-vs-pass decision in a game context",
            "Reinforcing width and spacing principles",
            "A main activity for fundamentals or skill-building groups building game understanding",
          ],
          avoidWhen: [
            "The session's focus is specifically on shooting technique",
            "Group size is too small to create meaningful width (fewer than 8 players)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Passing Combinations",
              reason: "Builds the passing execution this game requires under game pressure",
            },
            {
              activity: "Gates Dribbling",
              reason: "Establishes head-up dribbling awareness before adding decision-making pressure",
            },
          ],
          after: [
            {
              activity: "Small-Sided Game 5v5",
              reason: "Reintroduces shooting and a fixed goal, applying the spacing and decision habits just built",
            },
            {
              activity: "4v4 to Small Goals",
              reason: "Keeps the small-goal, no-goalkeeper format while adding a finishing dimension",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Simplify the control rule to be forgiving early on, and keep the field smaller so the game stays fast and fun.",
            keyPhrases: ["Keep the ball close as you go in!", "Find your open teammate!"],
            avoidSaying: ["That didn't count, you weren't in control"],
            duration: "8-10 minutes",
            simplifications: [
              "Smaller field, larger end zones",
              "Loosen the control standard for the first few sessions",
              "Fewer players per team (4v4) for more touches",
            ],
          },
          ages9to11: {
            approach:
              "Enforce the control rule consistently and start introducing the dribble-vs-pass question directly in the debrief.",
            keyPhrases: ["Control it before you cross!", "Dribble or pass - what's the smarter choice?"],
            avoidSaying: ["You should always pass" ,"You should always dribble"],
            duration: "12-15 minutes",
            challenges: ["Receive in End Zone", "Time Limit"],
          },
          ages12to14: {
            approach:
              "Use the full format with tactical debriefs on spacing, tempo, and reading defensive shape.",
            keyPhrases: ["What did the defense give you?", "How did you create that space?"],
            avoidSaying: ["Just play, don't overthink it"],
            duration: "15 minutes",
            challenges: ["Time Limit", "Two-Touch End Zone", "Neutral defender"],
          },
        },
        commonMisconceptions: {
          "This is just dribbling practice":
            "The control-required rule makes passing just as valid a path to scoring as dribbling - it's really a decision-making game, not a dribbling drill.",
          "No goalkeepers means no defense matters":
            "Without goalkeepers, every outfield player has to contribute to defending the full width of the end zone, actually increasing defensive responsibility for everyone.",
        },
      },
      parentCommunication: {
        ifAsked:
          "End Zone Game replaces the goal with a strip of field your child has to dribble into under control - it strips away shooting and isolates the decision of when to dribble and when to pass, which is one of the most important reads in real games.",
        newsletter:
          "This week: End Zone Game! Instead of scoring in a goal, players had to dribble the ball under control into the opponent's end zone - and it only counted if they were truly in control when they crossed the line. This built spacing, quick decisions between dribbling and passing, and supporting teammates.",
        whatToWatchFor: [
          "Does your child slow down and control the ball before entering the end zone, or rush it?",
          "Are they spreading out across the field, or bunching near the ball?",
          "Do they recognize when to pass to an open teammate instead of forcing a dribble?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions near the end zone line as multiple players converge",
            prevention: "Keep end zones a reasonable width (5+ paces) so entries aren't overly congested",
            response: "Check players involved; briefly pause play if needed",
          },
          {
            risk: "Overexertion from continuous open play without natural stoppages",
            prevention: "Build in water breaks between rounds; sub players if the roster allows",
            response: "Pull a tired player out for a short rest, then rotate back in",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow a walking or reduced-speed version; assign a role with a shorter running distance",
          attentionChallenges: "Use clear, consistent restart cues so transitions after a score don't cause confusion",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players controlling the ball before entering the end zone, or rushing it?",
          "Did teams use the full width of the field, or stay bunched?",
          "Were dribble-vs-pass decisions improving as the session went on?",
          "Did the control rule need to be enforced more loosely or more strictly for this group?",
        ],
        forImprovement: [
          "Should I adjust field or end zone size next time?",
          "Which players need more encouragement to pass rather than force a dribble?",
          "Which challenge variation fit this group's readiness?",
          "How can I connect this more explicitly to shooting-based games in the next session?",
        ],
      },
    },
  },
  {
    slug: "ball-tag",
    name: "Ball Tag",
    description:
      "Everyone dribbles a ball while 2-3 taggers try to tag them - also dribbling their own ball. A high-energy conditioning game that forces players to keep the ball close while scanning for danger, changing direction, and shielding under pressure.",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 8,
    skillsDeveloped: ["ball-control", "agility-change-of-direction"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ 4 cones (grid corners)\n□ 2-3 pinnies (taggers)\n\nSPACE: 25x25 paces (shrink for fewer players, expand for more)\n\nSETUP STEPS\n1. Mark a 25x25 pace grid with 4 corner cones\n2. Choose 2-3 taggers and give them pinnies\n3. Everyone else spreads out inside the grid, each with a ball\n4. Taggers ALSO have a ball - they dribble while tagging, they don't chase empty-handed\n5. On 'GO', taggers try to tag any player with a light touch on the shoulder or back\n\nDIAGRAM\n┌────────────────────────────────┐\n│  ○     ○        ●(pinny)   ○   │\n│      ○      ○         ○        │\n│  ○        ●(pinny)      ○      │\n│      ○         ○     ○         │  25 paces\n│  ○      ●(pinny)    ○      ○   │\n└────────────────────────────────┘\n            25 paces\n\n○ = player dribbling   ●(pinny) = tagger dribbling",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid\n\nSAY: "Everyone grab a ball! I need 2-3 taggers to wear a pinny. Taggers - you ALSO have a ball, so you\'re dribbling while you tag, just like everyone else!"\n\nSAY: "If you get tagged, don\'t stop moving - do 10 quick toe taps right where you are, then jump back into the game! Nobody sits out."\n\nSAY: "Keep your ball close and your head up - the taggers could be anywhere. Ready... GO!"\n\n\nPHASE 2: ROUND 1 (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Outside the grid, moving around the perimeter\n\nLOOK FOR:\n□ Are players keeping the ball close while scanning for taggers?\n□ Are they changing direction to escape, or just running in straight lines?\n□ Are taggers actually dribbling, or abandoning their ball to chase?\n\nPHRASES TO USE:\n• "Eyes up - where are the taggers?"\n• "Small touches - keep that ball close!"\n• "Nice change of direction to get away!"\n\nAfter 90 seconds: "New taggers! Pinnies over here!" - rotate to fresh taggers.\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and watch this."\n\nDEMO: Show shielding the ball with your body while changing direction away from an approaching tagger, using the foot farthest from the tagger to touch the ball.\n\nSAY: "See how I put my body BETWEEN the tagger and my ball? That protects it while I get away!"\n\n\nPHASE 4: ROUND 2 - NEW TAGGERS (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New taggers, everyone else keep dribbling! Remember - shield your ball, change direction, stay alert!"\n\nCoach Position: Roaming, giving specific feedback\n\nPHRASES TO USE:\n• "Great shielding - body between the ball and the tagger!"\n• "Keep scanning - don\'t just watch your feet!"\n• "Nice escape - sudden direction change!"\n\n\nPHASE 5: CHALLENGE ROUND (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Last round - shrinking grid! I\'m going to make the space smaller, so you\'ll need even better control and awareness!"\n\nMove cones in to shrink the grid by a few paces. Add one more tagger if the group handles it well.\n\nSAY: "Ready... GO! Stay calm, keep the ball close!"\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great energy! What helped you avoid the taggers?"\n\nListen for: "Watching around me," "Changing direction," "Keeping the ball close"\n\nSAY: "That\'s exactly what keeps the ball safe in a real game too - close control and awareness. Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│  ○     ○        ●(pinny)   ○   │\n│      ○      ○         ○        │\n│  ○        ●(pinny)      ○      │\n│      ○         ○     ○         │\n│  ○      ●(pinny)    ○      ○   │\n└────────────────────────────────┘\n\n○ = player dribbling   ●(pinny) = tagger dribbling",
    coachingPoints: [
      "KEEP THE BALL CLOSE → Say: 'Small touches - keep that ball close so nobody can poke it away!'",
      "SCAN FOR TAGGERS → Say: 'Eyes up! Where are the taggers right now?'",
      "SHIELD WITH YOUR BODY → Say: 'Put your body between the ball and the tagger!'",
      "CHANGE DIRECTION TO ESCAPE → Say: 'Don't just run straight - cut away suddenly!'",
    ],
    questionsToAsk: [
      "'How do you escape a tagger who's close behind you?' → Sudden change of direction, using your body to shield",
      "'What happens if you only look at your feet?' → You can't see the taggers coming - looking up matters more",
      "'How is this like protecting the ball in a real game?' → Shielding, close control, and awareness under pressure",
      "'What did you do differently as a tagger?' → Still had to control your own ball while chasing - harder than it looks!",
    ],
    commonMistakes: [
      "BIG TOUCHES THAT PUSH THE BALL AWAY → Say: 'Smaller touches - keep it close to your feet!'",
      "STARING AT THE BALL INSTEAD OF SCANNING → Say: 'Quick peeks at the ball, longer looks around you!'",
      "TAGGERS ABANDONING THEIR BALL TO CHASE → Say: 'Taggers, your ball stays with you too - dribble while you tag!'",
      "RUNNING IN STRAIGHT LINES → Say: 'Cut and change direction - straight lines are easy to catch!'",
    ],
    variations: [
      {
        name: "Freeze Ball Tag",
        description:
          "Tagged players freeze in place with legs apart, and can be freed by another player passing their ball through the frozen player's legs.",
        difficulty: "intermediate",
      },
      {
        name: "Team Ball Tag",
        description:
          "Split into two teams - one team of taggers, one team dribbling. Switch roles halfway through and compare how long each team lasted before all being tagged once.",
        difficulty: "beginner",
      },
      {
        name: "Shrinking Grid Tag",
        description:
          "Gradually shrink the grid every 30-45 seconds throughout the round, forcing tighter control and quicker decisions as space disappears.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Ball constantly getting knocked away or lost\n• Players freezing instead of moving when a tagger is near\n• Collisions between players\n• Frustration or players avoiding the game\n\nSOLUTIONS:\n• Reduce to 1-2 taggers\n• Make the grid larger (30x30 paces)\n• Allow players to freeze safely and call 'safe!' for a 3-second break\n• Slow the pace - walking dribble only for a round",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Ball rarely lost even under pressure\n• Players comfortably scanning while dribbling\n• Easily escaping taggers with direction changes\n• Looking for more challenge\n\nSOLUTIONS:\n• Add more taggers (up to 4-5)\n• Shrink the grid\n• Require weak-foot touches only\n• No pinnies - taggers blend in, so everyone must stay alert to anyone",
    equipmentNeeded: ["Cones (4 for grid)", "1 ball per player", "Pinnies (2-3)"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["conditioning", "dribbling", "fun", "agility"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Everyone dribbles inside a grid while 2-3 taggers (also dribbling) try to tag them - builds close control, scanning, and shielding under pressure.",
        keyPhrases: [
          "Small touches - keep it close!",
          "Eyes up - where are the taggers?",
          "Shield with your body!",
        ],
        setupDiagram:
          "25x25 pace grid, 2-3 taggers in pinnies, everyone (including taggers) dribbles their own ball",
        quickProgression: {
          easier: "Fewer taggers, larger grid, allow a safe call",
          harder: "More taggers, smaller grid, weak foot only, no pinnies",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a 25x25 pace grid with 4 cones",
            "Have pinnies ready for 2-3 taggers",
            "Count balls - every player, including taggers, needs one",
            "Decide your rotation schedule (every 90 seconds works well)",
          ],
          mindset:
            "This is conditioning wrapped in fun - the real teaching point is close control while scanning. Every time you say 'eyes up' or 'small touches' you're reinforcing the exact habits that protect the ball in a real game.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Center of grid",
            script:
              "SAY: 'Everyone grab a ball, 2-3 taggers wear pinnies. Taggers dribble too! Tagged? 10 toe taps and jump back in.' Ready... GO!",
            anticipatedResponses: {
              "What if I get tagged a lot?":
                "That's okay! More toe taps, more touches on the ball - it's still practice.",
              "Can taggers just chase without dribbling?":
                "No - taggers keep their ball too, that's what makes it fair and fun for everyone.",
            },
          },
          {
            phase: "Round 1",
            duration: "2 minutes",
            coachPosition: "Outside grid, moving around perimeter",
            script:
              "Call out encouragement: 'Eyes up!' 'Small touches!' 'Nice escape!' Rotate taggers at 90 seconds.",
            troubleshooting: {
              "Taggers abandoning their ball": [
                "Remind loudly: 'Taggers, your ball stays with you too!'",
              ],
              "Players bunching in a corner": [
                "Call out: 'Spread out - use the whole grid!'",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone gathered",
            script:
              "Demo shielding: body between the ball and an approaching tagger, using the far foot to touch the ball. 'That protects the ball while you get away!'",
          },
          {
            phase: "Round 2 - New Taggers",
            duration: "2 minutes",
            coachPosition: "Roaming",
            script:
              "Fresh taggers rotate in. Give individual feedback on shielding and scanning.",
          },
          {
            phase: "Challenge Round",
            duration: "2 minutes",
            coachPosition: "Roaming",
            script:
              "Shrink the grid a few paces, optionally add a tagger. 'Stay calm, keep the ball close!'",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What helped you avoid the taggers?' Connect to games: close control and awareness keep the ball safe. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Nobody getting tagged",
              "Players not even looking for taggers",
              "Low energy",
            ],
            solutions: [
              "Add more taggers",
              "Shrink the grid",
              "Remove pinnies so taggers blend in",
              "Require weak-foot touches",
            ],
          },
          tooHard: {
            symptoms: [
              "Constant ball loss",
              "Players freezing in fear of being tagged",
              "Frustration or tears",
            ],
            solutions: [
              "Reduce to 1-2 taggers",
              "Enlarge the grid",
              "Allow a 'safe' call for a 3-second breather",
              "Slow to walking-pace dribble for a round",
            ],
          },
        },
        playerBehavior: {
          taggersNotDribbling: {
            symptoms: ["Taggers leave their ball to chase with hands or feet free"],
            approach:
              "SAY: 'Taggers keep their ball too - that's the whole game!' Pause and restart if it keeps happening.",
          },
          avoidingTheGame: {
            symptoms: ["A player hugging the edge of the grid to avoid taggers"],
            approach:
              "SAY: 'Everyone needs the whole grid - come play in the middle with us!' Pair a hesitant player with a confident one briefly.",
          },
        },
        environmentalIssues: {
          crowdedGrid: {
            symptoms: ["Frequent collisions", "Balls tangling together"],
            solution: "Enlarge the grid or reduce the number of players per grid; run two smaller grids side by side.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Ball Control",
            domain: "technical",
            howItDevelops:
              "Players must keep the ball tight to their feet with small touches while under the added stress of being chased - building the close control needed in traffic during games.",
            levelIndicators: {
              1: "Ball frequently rolls away, especially when scanning for taggers",
              2: "Reasonable control when moving straight, loses it on direction changes",
              3: "Consistent close control while scanning and changing direction",
              4: "Tight control even under direct pressure from a tagger",
              5: "Full control while simultaneously tracking multiple taggers",
            },
            assessmentNotes: "Watch touch size and how often the ball gets more than a stride away from the player's feet.",
          },
          {
            skill: "Agility - Change of Direction",
            domain: "physical",
            howItDevelops:
              "Escaping taggers requires sudden, sharp cuts while maintaining ball control - the same movement pattern used to lose a defender in games.",
            levelIndicators: {
              1: "Only runs in straight lines; rarely cuts to escape",
              2: "Attempts direction changes but loses the ball",
              3: "Controlled cuts that keep the ball close",
              4: "Sharp, fast direction changes under pressure",
              5: "Anticipates the tagger's angle and cuts before being caught",
            },
            assessmentNotes: "Watch how players respond when a tagger closes in - do they cut, or just speed up in the same direction?",
          },
        ],
        secondarySkills: [
          {
            skill: "Confidence",
            domain: "psychological",
            howItDevelops:
              "Successfully evading taggers repeatedly builds belief in one's ability to keep the ball under pressure.",
          },
        ],
        physicalDevelopment: {
          cardiovascular: "Continuous movement for the full duration builds aerobic conditioning",
          agility: "Constant direction changes to evade taggers",
        },
        psychologicalDevelopment: {
          resilience: "Being tagged and immediately re-entering the game (no sitting out) builds a bounce-back mindset",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Ball Tag disguises conditioning and close-control practice as a chase game young players love. Because taggers also dribble, everyone - tagger and dribbler alike - is practicing ball control simultaneously, and the constant scanning for danger builds the same head-up awareness needed to protect the ball in a crowded game.",
        whenToUseIt: {
          idealFor: [
            "Early in practice as an energetic warm-up",
            "When the group needs a conditioning boost disguised as fun",
            "Reinforcing close control after a technical block",
          ],
          avoidWhen: [
            "Space is too small or crowded for safe running",
            "Group is very young and easily overwhelmed by chase games",
          ],
        },
        progressionPath: {
          before: [
            { activity: "Traffic Lights", reason: "Establishes basic dribbling control at different speeds" },
            { activity: "Musical Balls", reason: "Introduces reacting quickly while moving among others" },
          ],
          after: [
            { activity: "Gates Dribbling", reason: "Applies head-up dribbling with a clearer objective" },
            { activity: "Shark Attack", reason: "Raises the stakes with defenders actively hunting the ball" },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep it playful - frame taggers as friendly monsters or animals, celebrate every escape",
            keyPhrases: ["Keep your ball safe!", "Look around you!", "Great escape!"],
            avoidSaying: ["You got tagged too much", "Try harder"],
            duration: "5-6 minutes",
            simplifications: ["1-2 taggers only", "Larger grid", "Allow a 'safe zone' cone in the corner"],
          },
          ages9to11: {
            approach: "Add competitive framing and specific technical feedback on shielding",
            keyPhrases: ["Shield with your body!", "Cut away, don't just sprint!"],
            duration: "7-8 minutes",
            challenges: ["Shrinking grid", "More taggers", "Weak-foot touches"],
          },
          ages12to14: {
            approach: "Use as a high-intensity conditioning finisher with technical demands layered in",
            keyPhrases: ["Control under fatigue counts too", "Scan constantly, not just when a tagger is close"],
            duration: "8-10 minutes",
            challenges: ["No pinnies (taggers blend in)", "Weak-foot only", "Team-based tag"],
          },
        },
        commonMisconceptions: {
          "It's just running around, not real soccer training":
            "Close control under pressure while scanning the environment is exactly what protects the ball in games - this activity trains that instinct directly.",
          "Taggers aren't really practicing anything":
            "Taggers are dribbling the entire time too, so they get the same touches and control demands as everyone else, plus the added challenge of doing it while pursuing.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Ball Tag is a fun chase game where everyone - including the taggers - dribbles a ball the whole time. It builds close ball control and the habit of looking up to scan for danger, which is exactly what keeps the ball safe in a real game.",
        newsletter:
          "This week: Ball Tag! Every player dribbled a ball while 2-3 'taggers' (also dribbling) tried to tag them. The skill underneath the fun: keeping the ball close while scanning your surroundings - a habit that protects the ball in crowded games.",
        whatToWatchFor: [
          "Does your child keep the ball close with small touches, or let it roll away?",
          "Do they look up to scan for danger, or only watch their feet?",
          "Can they change direction quickly without losing control?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions between players moving in different directions",
            prevention: "Adequate grid size for the number of players; remind players to keep their heads up",
            response: "Check for injury; consider enlarging the grid if collisions repeat",
          },
          {
            risk: "Rolled ankles on sharp direction changes",
            prevention: "Proper warm-up before this activity; encourage controlled rather than reckless cuts",
            response: "Rest and assess; ice if needed",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow walking instead of running; designate a smaller personal zone within the grid",
          anxietyAroundBeingChased: "Offer a 'safe' call option or a corner cone where a player can pause briefly without penalty",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players keeping the ball close, or losing it frequently?",
          "Did taggers stay engaged and keep dribbling their own ball?",
          "Was the energy level and enjoyment high throughout?",
        ],
        forImprovement: [
          "Was the grid size right for this group's skill level?",
          "Which players need more direct coaching on shielding?",
          "Should I rotate taggers more or less often next time?",
        ],
      },
    },
  },
  {
    slug: "passing-pairs",
    name: "Passing Pairs",
    description:
      "Partners pass back and forth at a calm, controlled pace to close out practice - a technique-focused cooldown that reinforces clean passing and receiving mechanics without the intensity of a game.",
    sport: "soccer",
    activityType: "cooldown",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 6,
    skillsDeveloped: ["passing-short", "receiving-first-touch"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per pair\n□ Optional: 2 cones per pair to mark standing spots\n\nSPACE: 10-15 paces between partners\n\nSETUP STEPS\n1. Split into pairs\n2. Partners stand 10-15 paces apart, facing each other\n3. One ball per pair\n4. Plenty of room between pairs so passes don't cross paths\n\nDIAGRAM\nA                                    B\n○ ⚽ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ → ○\n\n     10-15 paces apart\n\n○ = player   ⚽ = ball",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Walking between pairs\n\nSAY: "Let\'s bring the energy down and finish with some clean passing. Find a partner, 10-15 paces apart. This is about QUALITY, not speed."\n\nSAY: "Inside of your foot to pass, inside of your foot to receive. Two touches: one to control, one to pass back. Let\'s go!"\n\n\nPHASE 2: ROUND 1 - TWO-TOUCH PASSING (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Pass and receive, nice and calm. Focus on your technique, not how fast you can go."\n\nCoach Position: Walking slowly between pairs\n\nLOOK FOR:\n□ Is the passing foot locked at the ankle?\n□ Is the first touch soft, staying close for the next pass?\n□ Are players following through toward their target?\n\nPHRASES TO USE:\n• "Lock that ankle - firm surface for the ball!"\n• "Soft touch to control, then pass."\n• "Follow through toward your partner\'s feet."\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch this pair for a second."\n\nDEMO: Show a toe-poked pass that wobbles off target, then a locked-ankle inside-of-foot pass that rolls smoothly and accurately.\n\nSAY: "See the difference? Locked ankle, flat surface of your foot - that\'s what makes the ball go exactly where you want it."\n\n\nPHASE 4: ROUND 2 - DIFFERENT PASSES (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same calm pace, but now mix it up - try a pass with the outside of your foot, then a firmer driven pass with the laces."\n\nCoach Position: Roaming, quiet individual feedback\n\nPHRASES TO USE:\n• "Talk to your partner - call for it!"\n• "Nice and soft on that first touch."\n• "Good - I saw you use your other foot too!"\n\n\nPHASE 5: CHALLENGE ROUND - ONE TOUCH (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "For our last minute and a half, see if you can play one-touch passes back and forth. If you lose the rhythm, that\'s okay - just restart with two touches."\n\nRun challenge calmly. Praise good technique over speed.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Nice calm finish, everyone. What made your passes accurate today?"\n\nListen for: "Locking my ankle," "Following through," "Soft first touch"\n\nSAY: "Exactly - clean technique is what makes passing look easy in games. Great practice today, everyone - see you next time!"',
    diagram:
      "A                                    B\n○ ⚽ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ → ○\n\n     10-15 paces apart\n\n○ = player   ⚽ = ball",
    coachingPoints: [
      "LOCK YOUR ANKLE → Say: 'Lock that ankle - give the ball a firm, flat surface!'",
      "FOLLOW THROUGH TO TARGET → Say: 'Follow your foot toward your partner's feet after you pass!'",
      "SOFT FIRST TOUCH → Say: 'Cushion the ball with a soft touch, keep it close for your next pass!'",
      "COMMUNICATE WITH YOUR PARTNER → Say: 'Call for the ball and tell them where you want it!'",
    ],
    questionsToAsk: [
      "'What makes a good pass?' → Locked ankle, inside of foot, follows through to the target",
      "'Where should your first touch go?' → Close to your feet, set up for your next pass",
      "'Why does calm, slow practice still help you in a fast game?' → Clean technique becomes automatic, so it holds up under speed",
      "'How do you know your partner is ready for the pass?' → Eye contact, calling for it, body facing you",
    ],
    commonMistakes: [
      "ANKLE NOT LOCKED → Say: 'Lock it firm - a loose ankle sends the ball off target!'",
      "TOE POKING THE BALL → Say: 'Use the inside of your foot, not your toe - bigger surface, more control!'",
      "FIRST TOUCH TOO HEAVY → Say: 'Softer touch - cushion it like catching an egg!'",
      "NOT COMMUNICATING → Say: 'Call for it! Let your partner know you're ready!'",
    ],
    variations: [
      {
        name: "One Touch",
        description:
          "Challenge partners to play one-touch passes back and forth without controlling first - tests technique and timing under a calm, controlled version of game speed.",
        difficulty: "intermediate",
      },
      {
        name: "Moving Pairs",
        description:
          "Partners slowly shuffle side to side or forward/backward while passing, requiring the passer to adjust the weight and angle of each pass to a moving target.",
        difficulty: "intermediate",
      },
      {
        name: "Weak Foot Only",
        description:
          "Both passing and receiving must be done with the weak foot only - keeps the pace calm while adding a real technical challenge.",
        difficulty: "beginner",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Passes consistently miss the partner\n• Ball bounces or wobbles instead of rolling smoothly\n• First touch sends the ball too far away\n\nSOLUTIONS:\n• Move partners closer together (6-8 paces)\n• Allow unlimited touches instead of two-touch\n• Coach demonstrates the locked-ankle technique up close\n• Use a slightly deflated or softer ball if available",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Passes consistently accurate and well-weighted\n• First touch is soft and sets up the next pass smoothly\n• Comfortable switching between inside and outside of foot\n\nSOLUTIONS:\n• Increase distance to 15-20 paces\n• Require one-touch passing\n• Weak foot only\n• Add gentle movement (Moving Pairs variation)",
    equipmentNeeded: ["1 ball per pair", "Cones (optional, to mark spots)"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["cooldown", "passing", "technique", "partners"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Calm partner passing to close out practice - locked ankle, soft first touch, and communication, without the intensity of a game.",
        keyPhrases: [
          "Lock that ankle!",
          "Soft touch to control, then pass.",
          "Call for it - communicate with your partner!",
        ],
        setupDiagram: "Partners stand 10-15 paces apart, one ball per pair, calm and controlled pace",
        quickProgression: {
          easier: "Closer together, unlimited touches, coach demonstrates up close",
          harder: "Farther apart, one-touch only, weak foot only, add movement",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Pair players up, ideally by similar passing ability",
            "Set standing distance at 10-15 paces, adjustable per pair",
            "Have one ball ready per pair",
            "Plan this as the calm-down close to practice, after the higher-intensity work",
          ],
          mindset:
            "This is a cooldown - the pace should feel noticeably calmer than the rest of practice. Your job is to reinforce clean technique in a low-pressure setting, not to push intensity. Quiet, specific feedback works better here than big energetic calls.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "30 seconds",
            coachPosition: "Walking between pairs",
            script:
              "SAY: 'Let's bring the energy down and finish with clean passing. Inside of foot, two touches, quality over speed.'",
            anticipatedResponses: {
              "Can we go faster?":
                "Not yet - let's get the technique clean first, then we can add speed later in the round.",
            },
          },
          {
            phase: "Round 1 - Two-Touch Passing",
            duration: "90 seconds",
            coachPosition: "Walking slowly between pairs",
            script:
              "Reinforce locked ankle, soft first touch, follow through. Keep the tone calm and encouraging.",
            troubleshooting: {
              "Passes going wide or short": [
                "Move the pair closer together temporarily to rebuild accuracy",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "At one pair, everyone watching",
            script:
              "Show a toe-poked pass vs. a locked-ankle inside-of-foot pass. 'That's what makes the ball go exactly where you want it.'",
          },
          {
            phase: "Round 2 - Different Passes",
            duration: "90 seconds",
            coachPosition: "Roaming, quiet feedback",
            script:
              "Introduce outside-of-foot and driven passes at the same calm pace. Encourage communication between partners.",
          },
          {
            phase: "Challenge Round - One Touch",
            duration: "90 seconds",
            coachPosition: "Roaming",
            script:
              "Invite one-touch passing for those ready. 'If you lose the rhythm, restart with two touches - no pressure.'",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center, calling everyone in",
            script:
              "ASK: 'What made your passes accurate today?' Close practice on a positive, calm note.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Consistently accurate passes with no effort",
              "Players asking to speed up or add competition",
            ],
            solutions: [
              "Increase distance",
              "Require one-touch",
              "Weak foot only",
              "Add gentle movement while passing",
            ],
          },
          tooHard: {
            symptoms: [
              "Frequent missed or wobbly passes",
              "Ball bouncing away from the receiver",
              "Frustration building at the end of practice",
            ],
            solutions: [
              "Shorten the distance",
              "Allow unlimited touches",
              "Slow down and demonstrate technique up close",
            ],
          },
        },
        playerBehavior: {
          rushingThePace: {
            symptoms: ["Players kicking the ball hard or racing through reps"],
            approach:
              "SAY: 'This is our calm finish - slow it down, focus on technique.' Model the pace you want by demonstrating a slow, clean pass yourself.",
          },
          sideConversations: {
            symptoms: ["Pairs chatting instead of passing"],
            approach:
              "Gently redirect: 'Let's get a few more clean passes in before we chat - you can talk while you pass!'",
          },
        },
        environmentalIssues: {
          crossingPasses: {
            symptoms: ["Balls from different pairs colliding"],
            solution: "Space pairs further apart or stagger their facing direction.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Passing (Short)",
            domain: "technical",
            howItDevelops:
              "Repetition at a calm pace lets players focus entirely on locking the ankle and following through, building muscle memory for clean technique that holds up when the game speeds up.",
            levelIndicators: {
              1: "Toe-pokes the ball; inconsistent direction",
              2: "Uses inside of foot but ankle is loose; passes wobble",
              3: "Locked ankle, consistent accuracy at short range",
              4: "Accurate with both feet; can vary pass weight",
              5: "Disguises intent and varies pass type while staying accurate",
            },
            assessmentNotes: "Watch foot surface (inside vs. toe) and whether the ankle looks locked at contact.",
          },
          {
            skill: "Receiving / First Touch",
            domain: "technical",
            howItDevelops:
              "Controlling the ball with a soft first touch and setting it up for the next pass builds the cushioning technique needed to receive under any speed.",
            levelIndicators: {
              1: "First touch sends the ball far away, needing extra steps",
              2: "Ball stays roughly nearby but not set up for the next action",
              3: "Consistent soft touch, ball ready for the next pass",
              4: "First touch already angled toward the next intended pass",
              5: "Can receive on either foot with equal quality",
            },
            assessmentNotes: "Watch how far the ball travels after the first touch and whether it's still under control.",
          },
        ],
        secondarySkills: [
          {
            skill: "Confidence",
            domain: "psychological",
            howItDevelops:
              "Ending practice with a low-pressure activity where technique clearly improves builds a sense of progress and competence.",
          },
        ],
        physicalDevelopment: {
          coordination: "Fine motor control of foot placement for accurate passing",
        },
        psychologicalDevelopment: {
          teamwork: "Simple communication with a partner about timing and target",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Passing Pairs works as a cooldown because it lowers physical intensity while keeping players technically engaged. The calm pace is exactly what allows players to isolate and correct small technique errors - locked ankle, follow-through, soft touch - that get lost in the speed of a game or a high-intensity drill.",
        whenToUseIt: {
          idealFor: [
            "End of practice, after higher-intensity games or conditioning",
            "Early technical sessions when first introducing passing mechanics",
            "Any time a calm, low-pressure passing reset is useful",
          ],
          avoidWhen: [
            "Players are still highly energized and need to burn off energy first",
            "Used as the main technical focus of a session (better as a bookend)",
          ],
        },
        progressionPath: {
          before: [
            { activity: "4v4 to Small Goals", reason: "A higher-intensity activity that this cooldown follows" },
            { activity: "World Cup", reason: "High-energy game that benefits from a calm technical close" },
          ],
          after: [
            { activity: "Wall Pass Combinations", reason: "Builds on clean passing technique with movement and timing" },
            { activity: "Rondo 4v1", reason: "Applies the same passing technique under pressure and decision-making" },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep instructions simple and playful; focus on just two things - inside of foot, soft touch",
            keyPhrases: ["Push the ball gently to your friend!", "Catch it soft with your foot!"],
            avoidSaying: ["Lock your ankle", "That was wrong"],
            duration: "4-5 minutes",
            simplifications: ["Closer distance (6-8 paces)", "Unlimited touches", "Bigger, softer ball if available"],
          },
          ages9to11: {
            approach: "Introduce specific technical language and two-touch discipline",
            keyPhrases: ["Lock that ankle!", "Soft touch, then pass"],
            duration: "5-6 minutes",
            simplifications: ["10-12 paces apart", "Two-touch standard"],
          },
          ages12to14: {
            approach: "Push toward one-touch precision and varied pass types as a genuine technical challenge",
            keyPhrases: ["Disguise your pass", "Vary the weight to control the tempo"],
            duration: "6-8 minutes",
            challenges: ["One-touch passing", "Weak foot only", "Moving pairs"],
          },
        },
        commonMisconceptions: {
          "A cooldown activity doesn't need real coaching":
            "The calm pace is actually an ideal teaching environment - players can hear and apply technical feedback without the distraction of speed or competition.",
          "Passing is a solved skill once players can do it at all":
            "Even experienced players benefit from returning to slow, deliberate reps - it's how professionals maintain technique too.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We finish most practices with Passing Pairs - a calm, partner passing activity that lets players focus purely on technique: locking the ankle, following through, and receiving softly. It's how we reinforce clean fundamentals without the pressure of a game.",
        newsletter:
          "This week we closed practice with Passing Pairs - simple partner passing at a calm pace, focused entirely on technique. Locked ankle, soft first touch, and clear communication with a partner. A great one to practice in the backyard!",
        whatToWatchFor: [
          "Does your child use the inside of their foot, or poke with their toe?",
          "Is their first touch soft and controlled, or does the ball bounce away?",
          "Do they communicate with their partner about when they're ready?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Balls from neighboring pairs colliding",
            prevention: "Space pairs generously apart, especially with larger groups",
            response: "Pause, reset spacing, resume",
          },
        ],
        inclusionConsiderations: {
          skillGaps: "Pair players of similar passing ability, or place a stronger passer with a developing one and shorten the distance",
          fatigueConsiderations: "Because this is a cooldown, it's naturally low-impact - a good fit for players managing fatigue late in practice",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did the pace genuinely feel calmer than the rest of practice?",
          "Were players locking their ankle and following through consistently?",
          "Did communication between partners improve over the activity?",
        ],
        forImprovement: [
          "Which pairs need closer distance or more touches allowed next time?",
          "Who is ready for one-touch or weak-foot challenges?",
          "Is this the right length to close out practice, or does it need to be shorter/longer?",
        ],
      },
    },
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
      "One goal with goalkeeper. All other players start at the top of the box. Rotate the goalkeeper each round so nobody is locked out of open play.",
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
      "1. Players jog/skip around the grid while music plays\n2. When music stops, find a ball and perform a move (10 toe taps)\n3. Player without a ball does 5 jumping jacks, then jogs right back in for the next round - nobody sits out\n4. Keep the same number of balls (one fewer than players) every round so the challenge stays constant instead of eliminating players\n5. Track how many times you end up without a ball as your own personal best to try to beat next time",
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
          "The classic elimination format, for highly competitive groups only - note this activity is fundamentals-tagged, so prefer the default format for most groups: remove one ball each round; the player(s) left without a ball are out until only two players remain. Higher stakes but a lot of sitting out for younger or mixed-ability groups.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "More balls in the grid so misses are rare",
    makeHarder:
      "Smaller grid, faster music changes. For highly competitive groups only (this activity is fundamentals-tagged - prefer the default format for most groups), try Knockout Musical Balls (see variations) for classic progressive elimination.",
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
    description:
      "A follow-the-leader dribbling warmup where players mirror the coach (or a rotating player leader) through speed changes, direction changes, stops, and turns - all while keeping their own ball under control. Builds dribbling touch and the habit of watching ahead while still handling the ball.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 6,
    skillsDeveloped: ["dribbling", "agility-coordination"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ Optional: 4 cones to mark boundary\n\nSPACE: 20x20 paces (expand for larger groups)\n\nSETUP STEPS\n1. Mark a loose 20x20 pace area (cones optional for younger groups)\n2. Leader (coach first, then rotating players) stands at the front where everyone can see\n3. Players spread out behind and around the leader, each with a ball, leaving 1-2 paces of space to move\n4. Leader dribbles forward with the group following and copying every move\n\nDIAGRAM\n┌────────────────────────────────┐\n│           ★ LEADER              │\n│                                  │\n│    ○   ○   ○   ○   ○           │\n│      ○   ○   ○   ○             │  20 paces\n│    ○   ○   ○   ○   ○           │\n└────────────────────────────────┘\n            20 paces\n\n★ = leader (dribbling)   ○ = followers (each with a ball)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Front of the group\n\nSAY: "I\'m the leader - everyone spread out behind me with your ball. Whatever I do, you copy! Speed changes, turns, stops - watch me and match it!"\n\nDEMO: Dribble forward slowly, then speed up, then stop with your foot on the ball.\n\nSAY: "Ready? Stay close enough to see me, but give yourself room to move. Let\'s go!"\n\n\nPHASE 2: ROUND 1 - FOLLOW THE LEADER (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Leading from the front, dribbling\n\nMix in: slow dribble, fast dribble, sudden stop (foot on ball), turn and change direction, zigzag.\n\nLOOK FOR:\n□ Are players watching the leader, or only staring at their own ball?\n□ Are they keeping the ball close while reacting to changes?\n□ Are they staying in the group, or falling behind?\n\nPHRASES TO USE:\n• "Eyes on me - what am I doing next?"\n• "Quick reactions - match my speed!"\n• "Great stop - foot right on top of the ball!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and watch."\n\nDEMO: Show dribbling with quick glances up at the leader instead of staring down at the ball the whole time.\n\nSAY: "See how I take quick peeks at the ball but mostly watch what\'s happening ahead? That\'s how you copy fast without losing your own ball!"\n\n\nPHASE 4: ROUND 2 - NEW LEADER (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Who wants to be the leader now? Pick someone - everyone else, follow and copy their moves!"\n\nRotate leader every 60-90 seconds so multiple players get a turn.\n\nCoach Position: Alongside the group, coaching from within\n\nPHRASES TO USE:\n• "Nice creative move, leader!"\n• "Great copying - right with them!"\n• "Use different parts of your foot - inside, outside, sole!"\n\n\nPHASE 5: CHALLENGE ROUND - FREEZE COPY (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This time, when the leader freezes, everyone freezes in the EXACT same position - ball trapped under your foot, body shape and all!"\n\nRun a few rounds of the leader moving and freezing suddenly. Celebrate players who match the freeze closely.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great following, everyone! What helped you copy so quickly?"\n\nListen for: "Watching ahead," "Quick touches," "Staying close to the leader"\n\nSAY: "That\'s exactly the skill you need in games - watching what\'s happening around you while still controlling the ball. Let\'s get started with today\'s practice!"',
    diagram:
      "┌────────────────────────────────┐\n│           ★ LEADER              │\n│                                  │\n│    ○   ○   ○   ○   ○           │\n│      ○   ○   ○   ○             │\n│    ○   ○   ○   ○   ○           │\n└────────────────────────────────┘\n\n★ = leader (dribbling)   ○ = followers (each with a ball)",
    coachingPoints: [
      "KEEP BALL CLOSE WHILE WATCHING LEADER → Say: 'Small touches on your ball, big eyes on the leader!'",
      "QUICK REACTIONS TO CHANGES → Say: 'The second the leader changes, you change too!'",
      "USE DIFFERENT PARTS OF YOUR FOOT → Say: 'Try the inside, outside, and sole of your foot, just like the leader!'",
      "STAY CLOSE BUT GIVE YOURSELF ROOM → Say: 'Close enough to see, far enough to have space to move!'",
    ],
    questionsToAsk: [
      "'How do you watch the leader and dribble your own ball at the same time?' → Quick glances down, mostly eyes up",
      "'Which moves were hardest to copy?' → Usually sudden stops or fast direction changes - normal to find those tricky",
      "'What happens if you only look at your ball?' → You fall behind because you can't see what the leader does next",
      "'How is this like watching the game around you?' → Awareness of what's happening while still controlling the ball",
    ],
    commonMistakes: [
      "WATCHING ONLY THE BALL → Say: 'Quick peeks down, mostly eyes on the leader!'",
      "GETTING TOO FAR BEHIND → Say: 'Stay close to the group - hustle to catch up!'",
      "BIG TOUCHES THAT LOSE CONTROL → Say: 'Small touches - keep that ball close while you move!'",
      "COPYING LATE INSTEAD OF RIGHT AWAY → Say: 'React the moment you see the change, not a few seconds later!'",
    ],
    variations: [
      {
        name: "Freeze Copy",
        description:
          "When the leader freezes, everyone must freeze in the exact same body position and foot-on-ball position - adds a fun precision challenge.",
        difficulty: "intermediate",
      },
      {
        name: "Leader Says",
        description:
          "Simon-Says twist: players only copy the move if the leader says 'Copy cat!' first. If they copy a move without the phrase, they do 3 toe taps as a fun reset.",
        difficulty: "intermediate",
      },
      {
        name: "Small Group Leaders",
        description:
          "Split into groups of 4-5, each with their own player leader, so more players get leadership turns and reaction times increase with more frequent rotations.",
        difficulty: "beginner",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Constantly losing the ball while trying to watch the leader\n• Falling far behind the group\n• Confused or frustrated by fast changes\n\nSOLUTIONS:\n• Slow the leader's pace and simplify moves (just speed changes and stops first)\n• Shrink the group size or space so the leader is easier to see\n• Coach leads more slowly and calls out moves out loud as a verbal cue\n• Allow a beat of delay before copying is expected",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Copying moves almost instantly with the ball still under control\n• Comfortable with speed changes, turns, and stops\n• Looking for more challenge or getting bored\n\nSOLUTIONS:\n• Faster pace and more complex combinations of moves\n• Add Freeze Copy or Leader Says variations\n• Require weak-foot touches during certain segments\n• Rotate leaders more frequently so reading a new leader's style becomes part of the challenge",
    equipmentNeeded: ["1 ball per player", "Cones (optional, for boundary)"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "dribbling", "following", "fun"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Players dribble while copying a leader's speed changes, turns, and stops - building dribbling touch and the habit of watching ahead instead of down at the ball.",
        keyPhrases: [
          "Small touches, big eyes on the leader!",
          "React the second things change!",
          "Close enough to see, room enough to move!",
        ],
        setupDiagram: "20x20 pace open area; leader at front, players spread out behind with a ball each",
        quickProgression: {
          easier: "Slower pace, simpler moves, coach calls out moves verbally",
          harder: "Faster pace, complex combinations, weak foot, Freeze Copy or Leader Says",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a loose 20x20 pace area, cones optional",
            "Decide your opening sequence of moves as the first leader (slow, fast, stop, turn)",
            "Plan roughly when you'll hand leadership to players",
            "Have the group spread with enough space to move without colliding",
          ],
          mindset:
            "This is a fun opener that quietly trains the 'watch ahead while controlling the ball' habit players need in games. Keep energy high and playful - the learning happens through repetition, not lecturing.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "30 seconds",
            coachPosition: "Front of the group",
            script:
              "SAY: 'I'm the leader - copy whatever I do!' Demo a slow dribble, speed up, then stop. 'Stay close enough to see, room enough to move. Go!'",
            anticipatedResponses: {
              "What if I can't see you?":
                "Move to where you can - staying visible to the leader is part of the game!",
            },
          },
          {
            phase: "Round 1 - Follow the Leader",
            duration: "90 seconds",
            coachPosition: "Leading from the front",
            script:
              "Mix slow/fast dribble, sudden stops, turns, zigzags. Call out encouragement: 'Eyes on me!' 'Quick reactions!'",
            troubleshooting: {
              "Group falling behind": [
                "Slow down and simplify moves until the group catches up",
              ],
              "Players staring only at the ball": [
                "Remind loudly: 'Quick peeks down, mostly eyes up!'",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Front, everyone gathered",
            script:
              "Demo quick glances at the ball vs. staring down constantly. 'That's how you copy fast without losing your own ball!'",
          },
          {
            phase: "Round 2 - New Leader",
            duration: "90 seconds",
            coachPosition: "Coaching from within the group",
            script:
              "Rotate leadership among players every 60-90 seconds. Praise creative moves and good copying.",
          },
          {
            phase: "Challenge Round - Freeze Copy",
            duration: "60 seconds",
            coachPosition: "Leading or watching player-leader",
            script:
              "When the leader freezes, everyone freezes in the same position. Celebrate close matches.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What helped you copy so quickly?' Connect to games: watching around you while controlling the ball. Move into practice.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Copying instantly with no ball control issues",
              "Players adding their own extra flair",
              "Looking bored or asking for more challenge",
            ],
            solutions: [
              "Faster pace and complex move combinations",
              "Add Freeze Copy or Leader Says variation",
              "Require weak-foot touches",
              "More frequent leader rotation",
            ],
          },
          tooHard: {
            symptoms: [
              "Losing the ball frequently while trying to watch the leader",
              "Falling far behind the group",
              "Frustration or giving up on copying",
            ],
            solutions: [
              "Slow the pace and simplify moves",
              "Shrink the group size or space",
              "Call out moves verbally as an extra cue",
              "Allow a short delay before copying is expected",
            ],
          },
        },
        playerBehavior: {
          fallingBehind: {
            symptoms: ["One or more players consistently trailing the group"],
            approach:
              "SAY: 'Hustle to catch up - stay part of the group!' Consider slowing the pace briefly for everyone.",
          },
          reluctantLeaders: {
            symptoms: ["Players hesitant to take a turn leading"],
            approach:
              "Offer a simple starting move ('just try a slow dribble and a stop') to lower the pressure of leading.",
          },
        },
        environmentalIssues: {
          crowdingBehindLeader: {
            symptoms: ["Players bunched too close, balls colliding"],
            solution: "Remind players to keep 1-2 paces of personal space; widen the area if needed.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling",
            domain: "technical",
            howItDevelops:
              "Constantly reacting to a leader's speed and direction changes forces players to control the ball with varied touches rather than one repetitive pattern.",
            levelIndicators: {
              1: "Loses the ball whenever the leader changes speed or direction",
              2: "Keeps some control but reacts late to changes",
              3: "Reacts promptly and keeps the ball close through most changes",
              4: "Smooth, controlled touches through fast transitions",
              5: "Anticipates the leader's next move and adjusts touch before it happens",
            },
            assessmentNotes: "Watch touch frequency and ball distance from feet during leader transitions.",
          },
          {
            skill: "Agility & Coordination",
            domain: "physical",
            howItDevelops:
              "Copying sudden stops, turns, and speed changes while controlling a ball trains the coordination between eyes, feet, and body needed for quick game decisions.",
            levelIndicators: {
              1: "Slow, delayed reactions to leader's changes",
              2: "Reacts but body control is stiff or off-balance",
              3: "Smooth, timely reactions with good balance",
              4: "Quick, fluid movement matching the leader closely",
              5: "Anticipates and moves with minimal delay, fully balanced",
            },
            assessmentNotes: "Watch balance and timing on stops and direction changes.",
          },
        ],
        secondarySkills: [
          {
            skill: "Coachability",
            domain: "psychological",
            howItDevelops:
              "Following a leader's instructions and adjusting quickly builds the habit of responding to cues from a coach or teammate.",
          },
        ],
        physicalDevelopment: {
          coordination: "Eye-body-foot coordination while reacting to visual cues",
          agility: "Sudden stops and direction changes",
        },
        psychologicalDevelopment: {
          confidence: "Taking a turn as leader builds comfort being watched and setting the pace for others",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Copy Cat Dribbling turns 'watch and react' into a fun game rather than a lecture. Because players must track the leader while still controlling their own ball, it directly builds the head-up awareness that separates players who see the game from those who only see their own feet.",
        whenToUseIt: {
          idealFor: [
            "Opening warmup at the very start of practice",
            "Getting a new or younger group comfortable with the ball early",
            "A quick energizer between more structured activities",
          ],
          avoidWhen: [
            "Space is too tight for a group to move together safely",
            "Group is very large (over 20) - consider Small Group Leaders variation instead",
          ],
        },
        progressionPath: {
          before: [
            { activity: "Ball Mastery Circle", reason: "Builds basic ball comfort before adding a following/reacting demand" },
          ],
          after: [
            { activity: "Traffic Lights", reason: "Applies similar reactive dribbling with specific speed cues" },
            { activity: "Gates Dribbling", reason: "Shifts from following a leader to independently scanning for targets" },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep it playful and imaginative - frame moves as 'animal walks' or silly actions",
            keyPhrases: ["Watch me and copy!", "Great job matching me!"],
            avoidSaying: ["You're too slow", "Pay attention"],
            duration: "4-5 minutes",
            simplifications: ["Slower pace", "Simple moves only (walk, stop, turn)", "Coach stays as leader the whole time"],
          },
          ages9to11: {
            approach: "Let players take leadership turns and introduce Freeze Copy",
            keyPhrases: ["React fast!", "Nice creative move!"],
            duration: "6 minutes",
            challenges: ["Freeze Copy", "Weak foot segments", "Faster leader rotation"],
          },
          ages12to14: {
            approach: "Use as a quick, competitive-feeling opener with Leader Says or small-group leaders",
            keyPhrases: ["Anticipate, don't just react", "Push the pace"],
            duration: "5-6 minutes",
            challenges: ["Leader Says", "Small Group Leaders", "Weak foot only rounds"],
          },
        },
        commonMisconceptions: {
          "It's just a fun game, not real training":
            "The reactive, head-up dribbling this builds is exactly what players need to handle the ball while tracking teammates, opponents, and space in games.",
          "Only the leader is really practicing":
            "Every follower is dribbling and reacting the entire time - the leader is simply setting the pattern everyone practices against.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Copy Cat Dribbling is our follow-the-leader warmup - everyone dribbles a ball while copying speed changes, turns, and stops from a leader. It's a fun way to build ball control and the habit of watching ahead instead of staring down at their feet.",
        newsletter:
          "This week we opened practice with Copy Cat Dribbling - players followed a leader (coach, then teammates) through speed changes, turns, and freezes, all while controlling their own ball. It's a playful way to build the head-up dribbling habit that helps in games.",
        whatToWatchFor: [
          "Does your child keep the ball close while watching the leader, or lose it when reacting?",
          "Can they react quickly to sudden changes in speed or direction?",
          "Are they comfortable taking a turn as the leader?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions between players following closely behind the leader",
            prevention: "Remind players to keep 1-2 paces of personal space",
            response: "Check for injury; widen spacing before continuing",
          },
          {
            risk: "Tripping during sudden stops or direction changes",
            prevention: "Encourage controlled rather than reckless movements",
            response: "Rest and assess; slow the pace if it recurs",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow walking instead of running; a player leader can adjust pace naturally when leading",
          visualProcessingNeeds: "Pair with a buddy who calls out the leader's moves verbally as an extra cue",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players watching the leader, or mostly staring at their own ball?",
          "Did the group stay together, or did players fall behind?",
          "Did player-leaders get a genuine turn to lead confidently?",
        ],
        forImprovement: [
          "Was the pace right for this group, or did I need to slow down/speed up?",
          "Which players need more direct encouragement to take a leader turn?",
          "Should I introduce Freeze Copy or Leader Says sooner next time?",
        ],
      },
    },
  },
  {
    slug: "volcano-dribble",
    name: "Volcano Dribble",
    description:
      "Players dribble freely through a field scattered with cone 'volcanoes,' keeping their head up to avoid setting them off. A playful, imaginative warmup that builds close ball control and spatial awareness for young players.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 6,
    skillsDeveloped: ["dribbling", "ball-control"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 15-20 cones ('volcanoes')\n□ 1 ball per player\n\nSPACE: 30x30 paces\n\nSETUP STEPS\n1. Scatter 15-20 cones RANDOMLY throughout a 30x30 pace grid (not in rows or lines!)\n2. Leave enough space between cones for players to dribble through safely\n3. Each player starts with a ball, spread out around the edges of the grid\n4. Explain the 'volcano' theme before starting - cones are volcanoes that erupt if touched\n\nDIAGRAM\n┌────────────────────────────────┐\n│  ▲      ▲        ▲     ▲       │\n│      ▲       ▲        ▲        │\n│  ▲       ▲         ▲     ▲     │\n│      ▲        ▲       ▲        │  30 paces\n│  ▲      ▲        ▲     ▲       │\n└────────────────────────────────┘\n            30 paces\n\n▲ = volcano (cone)   players dribble freely between them, each with a ball",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid\n\nSAY: "Welcome to the volcano field! Each cone is a sleeping volcano. Your job is to dribble your ball anywhere you want, but DON\'T wake up the volcanoes!"\n\nSAY: "If you touch a volcano with your ball or your foot, it erupts - you do 5 quick toe taps right there, then keep exploring. Ready, explorers? GO!"\n\n\nPHASE 2: ROUND 1 - FREE DRIBBLING (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Walking around the outside of the grid\n\nLOOK FOR:\n□ Are players looking up to spot volcanoes, or staring only at the ball?\n□ Are they using small touches to steer around cones?\n□ Are they spreading out across the whole grid?\n\nPHRASES TO USE:\n• "Heads up, explorers - where are the volcanoes?"\n• "Small touches to steer around them!"\n• "Great save - you almost woke that one up!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and watch me."\n\nDEMO: Show a big, careless touch that sends the ball straight into a cone, then a small controlled touch that curves smoothly around it.\n\nSAY: "See how a SMALL touch lets me turn quickly? Big touches send your ball right into trouble!"\n\n\nPHASE 4: ROUND 2 - LAVA FLOW FREEZE (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New rule - when I shout \'LAVA FLOW!\' everyone freezes instantly with the ball under your foot! Last one to freeze does 3 toe taps!"\n\nRun free dribbling, calling "Lava flow!" every 15-20 seconds.\n\nCoach Position: Roaming, calling out the freeze\n\nPHRASES TO USE:\n• "Fast feet, fast freeze!"\n• "Ball trapped and still - nice!"\n\n\nPHASE 5: CHALLENGE ROUND (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Last round! Try to make it the WHOLE time without waking a single volcano. Count how many times you avoid one - that\'s your explorer score!"\n\nRun a final calmer, focused round. Celebrate anyone with a clean run or a big personal improvement.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Amazing exploring! What helped you avoid the volcanoes?"\n\nListen for: "Looking up," "Small touches," "Going slow near them"\n\nSAY: "That\'s exactly what helps you control the ball around defenders in a real game too! Let\'s keep that same head-up dribbling going into practice!"',
    diagram:
      "┌────────────────────────────────┐\n│  ▲      ▲        ▲     ▲       │\n│      ▲       ▲        ▲        │\n│  ▲       ▲         ▲     ▲     │\n│      ▲        ▲       ▲        │\n│  ▲      ▲        ▲     ▲       │\n└────────────────────────────────┘\n\n▲ = volcano (cone)   players dribble freely between them, each with a ball",
    coachingPoints: [
      "HEAD UP TO SEE THE VOLCANOES → Say: 'Eyes up, explorer - where are the volcanoes around you?'",
      "SMALL TOUCHES TO CHANGE DIRECTION → Say: 'Little touches let you steer around them quickly!'",
      "USE DIFFERENT SURFACES OF YOUR FOOT → Say: 'Try the inside, outside, even the bottom of your foot!'",
      "SLOW DOWN NEAR VOLCANOES → Say: 'Go a little slower when you're close - more control, fewer eruptions!'",
    ],
    questionsToAsk: [
      "'How do you avoid the volcanoes?' → Looking up and taking small touches to steer around them",
      "'What part of your foot helps you turn quickly?' → Inside or outside of the foot for a quick change of direction",
      "'What happens when you take a big touch near a volcano?' → The ball goes too far and often bumps the cone",
      "'How is dodging volcanoes like avoiding a defender?' → Small touches and head-up awareness keep the ball safe either way",
    ],
    commonMistakes: [
      "LOOKING DOWN AT THE BALL → Say: 'Quick peeks at your ball, longer looks at the volcanoes around you!'",
      "BIG TOUCHES THAT LOSE CONTROL → Say: 'Smaller touches - keep that ball close so you can steer!'",
      "ALL CROWDING IN ONE EMPTY AREA → Say: 'Explore the WHOLE volcano field - there's room everywhere!'",
      "PANICKING NEAR A VOLCANO → Say: 'Stay calm, slow down, and take a small touch around it!'",
    ],
    variations: [
      {
        name: "Moving Volcanoes",
        description:
          "One or two players become 'volcanoes' themselves, slowly walking through the grid - everyone else must now dodge both cones and moving volcano-players.",
        difficulty: "intermediate",
      },
      {
        name: "Color-Coded Volcanoes",
        description:
          "Use two cone colors - touching one color means 5 toe taps, touching the other means a quick 360-degree turn with the ball before continuing.",
        difficulty: "beginner",
      },
      {
        name: "Partner Volcano Watch",
        description:
          "Players pair up and call out warnings to their partner ('Volcano on your left!') as they both dribble - adds a communication and teamwork layer.",
        difficulty: "beginner",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Constantly bumping volcanoes even at a slow pace\n• Ball frequently rolling away from their feet\n• Frustration or avoiding parts of the grid entirely\n\nSOLUTIONS:\n• Use fewer volcanoes (8-10) with more space between them\n• Enlarge the grid\n• Allow walking pace only for a round\n• Coach calls out 'volcano ahead!' as an extra warning cue",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Weaving through volcanoes smoothly with no eruptions\n• Comfortable keeping head up most of the time\n• Looking bored or asking to go faster\n\nSOLUTIONS:\n• Add more volcanoes (up to 25) and shrink the grid\n• Faster overall pace\n• Add Moving Volcanoes variation\n• Require weak-foot touches only near volcanoes",
    equipmentNeeded: ["Cones (15-20)", "1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["warmup", "dribbling", "awareness", "fun"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Dribble freely through a field of cone 'volcanoes' without setting them off - builds close control and head-up awareness through imaginative play.",
        keyPhrases: [
          "Eyes up, explorer!",
          "Small touches to steer around them!",
          "Slow down when you're close!",
        ],
        setupDiagram: "30x30 pace grid with 15-20 cones scattered randomly (not in rows); 1 ball per player",
        quickProgression: {
          easier: "Fewer volcanoes, larger grid, walking pace",
          harder: "More volcanoes, smaller grid, faster pace, Moving Volcanoes",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Scatter 15-20 cones randomly across a 30x30 pace grid - avoid rows or patterns",
            "Leave enough gaps between cones for safe dribbling lanes",
            "Have a ball ready for every player",
            "Decide when you'll call 'Lava flow!' during Round 2",
          ],
          mindset:
            "This is imaginative play doing technical work - lean into the volcano theme with enthusiasm. Young players engage far more with 'don't wake the volcano' than 'avoid the cone,' and the fun framing is what keeps them dribbling with their head up the whole time.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "30 seconds",
            coachPosition: "Center of grid",
            script:
              "SAY: 'Each cone is a sleeping volcano - don't wake them up!' Explain the eruption consequence (5 toe taps). 'Ready, explorers? GO!'",
            anticipatedResponses: {
              "What if I touch a lot of volcanoes?":
                "That's okay! Just do your toe taps and keep exploring - every explorer wakes one up sometimes.",
            },
          },
          {
            phase: "Round 1 - Free Dribbling",
            duration: "90 seconds",
            coachPosition: "Walking around the outside of the grid",
            script:
              "Encourage: 'Heads up!' 'Small touches!' Celebrate near-misses and good control.",
            troubleshooting: {
              "Players bunching in one open area": [
                "Call out: 'Explore the whole volcano field!'",
              ],
              "Frequent big touches into cones": [
                "Demonstrate small touches up close with a struggling player",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone gathered",
            script:
              "Demo a big careless touch into a cone vs. a small controlled touch around it. 'Small touches let me turn quickly!'",
          },
          {
            phase: "Round 2 - Lava Flow Freeze",
            duration: "90 seconds",
            coachPosition: "Roaming, calling the freeze",
            script:
              "Call 'Lava flow!' every 15-20 seconds; players freeze with the ball trapped underfoot. Praise fast, controlled freezes.",
          },
          {
            phase: "Challenge Round",
            duration: "60 seconds",
            coachPosition: "Roaming, quietly observing",
            script:
              "Final calmer round - challenge players to go the whole time without an eruption. Celebrate clean runs and personal improvement.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What helped you avoid the volcanoes?' Connect to games: head-up control keeps the ball safe from defenders too.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "No eruptions at all, even moving quickly",
              "Players weaving effortlessly",
              "Looking for more challenge",
            ],
            solutions: [
              "Add more volcanoes and shrink the grid",
              "Increase pace",
              "Add Moving Volcanoes variation",
              "Require weak-foot touches near volcanoes",
            ],
          },
          tooHard: {
            symptoms: [
              "Frequent eruptions even at a slow pace",
              "Ball control breaking down often",
              "Frustration or avoidance of busy areas",
            ],
            solutions: [
              "Fewer volcanoes with more spacing",
              "Enlarge the grid",
              "Walking pace only for a round",
              "Coach calls out warnings as an extra cue",
            ],
          },
        },
        playerBehavior: {
          avoidingBusyAreas: {
            symptoms: ["Players clustering in the one open corner of the grid"],
            approach:
              "SAY: 'There's room everywhere - be a brave explorer and try a busier part of the field!' Guide by example, dribbling into a denser area yourself.",
          },
          frustrationAfterEruptions: {
            symptoms: ["A player upset or discouraged after repeated eruptions"],
            approach:
              "Reframe positively: 'Every explorer wakes up a volcano sometimes - that's how you learn where they are!' Offer a simpler section of the grid.",
          },
        },
        environmentalIssues: {
          conesTooClose: {
            symptoms: ["Very little room to dribble between volcanoes", "Frequent unavoidable touches"],
            solution: "Quickly spread cones further apart mid-activity, or remove a few volcanoes.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling",
            domain: "technical",
            howItDevelops:
              "Navigating a dense, randomly scattered obstacle field forces constant small adjustments in touch and direction - core dribbling control under a fun, low-pressure constraint.",
            levelIndicators: {
              1: "Frequent eruptions even moving slowly; ball often escapes control",
              2: "Occasional eruptions; touches still often too big",
              3: "Consistent small touches; navigates most of the field cleanly",
              4: "Smooth, controlled dribbling through dense volcano clusters",
              5: "Weaves confidently at speed with minimal eruptions, head mostly up",
            },
            assessmentNotes: "Watch touch size and how close the ball stays to the feet near volcanoes.",
          },
          {
            skill: "Ball Control",
            domain: "technical",
            howItDevelops:
              "Freezing the ball instantly under the foot during 'Lava Flow' calls builds the stopping and trapping technique used constantly in games.",
            levelIndicators: {
              1: "Ball rolls away when trying to stop",
              2: "Stops the ball but takes an extra touch to control it",
              3: "Consistent, quick stop with foot on ball",
              4: "Instant, balanced stop even mid-dribble",
              5: "Stops instantly while maintaining full body balance and awareness",
            },
            assessmentNotes: "Watch how quickly and cleanly players trap the ball on the 'Lava flow!' call.",
          },
        ],
        secondarySkills: [
          {
            skill: "Agility & Coordination",
            domain: "physical",
            howItDevelops:
              "Constant small direction changes to avoid cones build coordinated, controlled movement.",
          },
          {
            skill: "Enjoyment of Play",
            domain: "psychological",
            howItDevelops:
              "The imaginative volcano theme keeps repetitive touches feeling like play rather than a drill.",
          },
        ],
        physicalDevelopment: {
          coordination: "Fine foot-eye coordination while navigating a dense obstacle field",
          agility: "Frequent small direction changes",
        },
        psychologicalDevelopment: {
          enjoyment: "Imaginative framing keeps young players engaged through repetition",
          resilience: "Recovering positively from an 'eruption' and continuing to explore",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Volcano Dribble uses imaginative play to get young players doing hundreds of quality touches without it feeling like repetitive drilling. The randomly scattered cones (rather than a fixed pattern) force genuine head-up scanning and reactive touch adjustments, both foundational for later dribbling under pressure.",
        whenToUseIt: {
          idealFor: [
            "Opening warmup with younger or newer players",
            "Building comfort with close control in a low-pressure, playful setting",
            "Sessions that benefit from an imaginative, high-engagement start",
          ],
          avoidWhen: [
            "Working with older or more advanced players who need a sharper technical challenge",
            "Very limited space where 15-20 cones can't be spread out safely",
          ],
        },
        progressionPath: {
          before: [
            { activity: "Ball Mastery Circle", reason: "Establishes basic close control before adding obstacles" },
          ],
          after: [
            { activity: "Gates Dribbling", reason: "Shifts from avoiding obstacles to purposefully seeking targets" },
            { activity: "Inside-Outside Slalom", reason: "Introduces a structured cone pattern and specific foot-surface technique" },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Lean fully into the imaginative volcano theme - use excited, playful narration throughout",
            keyPhrases: ["Don't wake the volcano!", "Great exploring!", "Careful, lava!"],
            avoidSaying: ["You keep messing up", "Be more careful"],
            duration: "5-6 minutes",
            simplifications: ["Fewer volcanoes (8-10)", "Larger grid", "Walking pace allowed"],
          },
          ages9to11: {
            approach: "Usable occasionally as a fun changeup, but simplify the theme and shorten - most groups this age are ready for Gates Dribbling or Inside-Outside Slalom instead",
            keyPhrases: ["Small touches, quick eyes!", "Beat your own eruption count!"],
            duration: "4-5 minutes if used",
            simplifications: ["Fewer explanatory cues needed", "Can add Moving Volcanoes for extra challenge"],
          },
          ages12to14: {
            approach: "Not typically used at this age - the obstacle-avoidance format is usually too simple; substitute Gates Dribbling or Inside-Outside Slalom for a comparable warmup with more technical demand",
            keyPhrases: ["N/A - use an age-appropriate alternative"],
            duration: "Not recommended",
          },
        },
        commonMisconceptions: {
          "It's just running around cones, not real skill work":
            "The random scatter forces genuine head-up scanning and reactive small touches - the same demands as dribbling around defenders, just framed playfully for young players.",
          "The theme doesn't matter, only the cones do":
            "For this age group, the imaginative framing is what sustains focus and effort through dozens of repetitive touches - the theme is part of what makes the training work.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Volcano Dribble is an imaginative warmup where cones become 'volcanoes' your child dribbles around without touching. It's a playful way to build close ball control and get them looking up while they dribble, instead of staring down at their feet.",
        newsletter:
          "This week: Volcano Dribble! Cones became sleeping volcanoes scattered across the field, and players dribbled around them without setting them off. A fun, imaginative way to build ball control and head-up awareness - ask your child to show you their 'volcano dodge' move at home!",
        whatToWatchFor: [
          "Does your child look up while dribbling, or only watch the ball?",
          "Are they using small touches to change direction, or big ones that lose control?",
          "Do they stay engaged and positive even after an 'eruption'?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Tripping over cones scattered throughout the grid",
            prevention: "Use low-profile cones; ensure adequate spacing between them",
            response: "Check for injury; adjust cone spacing if tripping is frequent",
          },
          {
            risk: "Collisions between players dribbling in a dense area",
            prevention: "Encourage spreading out across the whole grid; remind players to keep heads up",
            response: "Check players; redirect toward less crowded areas",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow walking instead of dribbling at speed; assign a personal 'zone' with fewer volcanoes",
          visionImpairments: "Use bright, high-contrast cones and consider a buddy system for extra awareness",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players looking up and scanning, or mostly watching the ball?",
          "Did the volcano theme keep energy and engagement high?",
          "Was the cone density right for this group's skill level?",
        ],
        forImprovement: [
          "Should I add or remove volcanoes next time?",
          "Which players need extra encouragement after eruptions?",
          "Is this group ready to progress to Gates Dribbling or Inside-Outside Slalom?",
        ],
      },
    },
  },
  {
    slug: "numbers-game-warmup",
    name: "Numbers Game Warmup",
    description:
      "Coach calls numbers for different dribbling movements - players react instantly while keeping the ball under control. Builds close control, reaction speed, and listening skills in a fast-moving warm-up.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 7,
    skillsDeveloped: ["dribbling", "agility-coordination"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ 4 cones for grid corners\n□ Whistle or loud voice for calling numbers\n\nSPACE: 30x30 paces (shrink for fewer players)\n\nSETUP STEPS\n1. Mark a 30x30 pace grid with 4 corner cones\n2. Each player brings a ball into the grid\n3. Teach the 5 number commands before starting - walk through each one slowly\n4. Players spread out with a ball each, ready to dribble freely\n\nDIAGRAM\n┌────────────────────────────────┐\n│  ○      ○         ○      ○    │\n│      ○        ○         ○     │\n│  ○        ○         ○         │  30 paces\n│      ○         ○        ○     │\n│  ○      ○         ○      ○    │\n└────────────────────────────────┘\n        30 paces\n\n○ = player with own ball, dribbling freely inside the grid",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid, ball at feet\n\nSAY: "Grab a ball and find your own space in the grid! I\'m going to call out numbers, and each number means a different move. Let\'s learn them first."\n\nDEMO each command slowly:\nSAY: "Number 1 - stop the ball dead with the SOLE of your foot, like a stop sign! Number 2 - SPEED dribble, push it and run! Number 3 - turn all the way around, any turn you know! Number 4 - change direction, cut the ball sharply! Number 5 - do your best skill move!"\n\nSAY: "Everyone dribble around now - when I call a number, do that move as fast as you can!"\n\n\nPHASE 2: ROUND 1 - SLOW CALLING (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center, turning to see the whole grid\n\nCall numbers slowly with a few seconds between each: "1!... 2!... 3!..."\n\nLOOK FOR:\n□ Are players keeping their heads up to hear the call?\n□ Is the ball staying close on the sole-stop (number 1)?\n□ Are they actually changing direction on number 4, not just slowing down?\n\nPHRASES TO USE:\n• "Nice and quick - I like that reaction!"\n• "Ball close, ball close!"\n• "Big turn - all the way around!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and watch me for number 5."\n\nDEMO a simple skill move (step-over or scissor) slowly, then at speed.\n\nSAY: "Number 5 doesn\'t have to be fancy - any move that gets past an imaginary defender counts! Pick ONE move and get really good at it today."\n\n\nPHASE 4: ROUND 2 - MIXED SPEED (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same numbers, but now I\'ll mix up how fast I call them! Stay ready!"\n\nCall numbers with varying pace - some quick back-to-back, some with a pause.\n\nCoach Position: Roam through the grid, calling from different spots\n\nWATCH FOR:\n□ Players who freeze or hesitate when calls come fast\n□ Ball control breaking down under quicker calling\n\nPHRASES TO USE:\n• "Stay light on your feet - ready for anything!"\n• "Great job staying under control!"\n\n\nPHASE 5: CHALLENGE ROUND (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Challenge round! This time I might call TWO numbers in a row - do them both, in order!"\n\nCall combinations like "3, then 5!" or "2, then 1!"\n\nSAY: "If you mess up, no big deal - just reset and keep going. I want to see you trying hard moves!"\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great listening and great feet! Which number was hardest for you?"\n\nListen for specific answers, validate: "That\'s a tough one - keep practicing it!"\n\nSAY: "That quick reaction is exactly what you need in a game when things change fast. Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│  ○      ○         ○      ○    │\n│      ○        ○         ○     │\n│  ○        ○         ○         │\n│      ○         ○        ○     │\n│  ○      ○         ○      ○    │\n└────────────────────────────────┘",
    coachingPoints: [
      "QUICK REACTION → Say: 'Ears open - react the moment you hear the number!'",
      "BALL STAYS CLOSE → Say: 'Ball close, ball close - like it's tied to your shoelaces!'",
      "SOLE STOP UNDER CONTROL → Say: 'Trap it dead - sole on top, ball stops still!'",
      "COMMIT TO THE MOVE → Say: 'Big turn, sharp cut - don't do it halfway!'",
    ],
    questionsToAsk: [
      "'Which number is hardest for you?' → Builds self-awareness of weaker skills",
      "'What move do you do for number 5?' → Encourages having a go-to move ready",
      "'How did you keep your ball close during the speed dribble?' → Looking for: small, quick touches",
      "'What happens if you don't react fast enough?' → Looking for: ball control breaks down or you fall behind the group",
    ],
    commonMistakes: [
      "FORGETTING THE NUMBERS → Say: 'No worries - watch a friend and jump back in!'",
      "SLOW REACTIONS → Say: 'Ears up! The second you hear it, go!'",
      "BALL DRIFTING AWAY ON THE STOP → Say: 'Sole comes down soft but firm - trap it right under you!'",
      "HALF-HEARTED SKILL MOVES → Say: 'Sell it! Big move, like you're beating a real defender!'",
    ],
    variations: [
      {
        name: "Player Caller",
        description:
          "A player becomes the number caller for a round instead of the coach. Builds confidence and keeps engagement high.",
        difficulty: "beginner",
      },
      {
        name: "Add Colors",
        description:
          "Layer in cone colors around the grid - number tells the move, color tells which direction to dribble toward.",
        difficulty: "intermediate",
      },
      {
        name: "Elimination Freeze",
        description:
          "Anyone who reacts to the wrong number or loses control does 3 toe taps before rejoining - keeps stakes low while adding a consequence.",
        difficulty: "intermediate",
      },
      {
        name: "Partner Numbers",
        description:
          "Players pair up; one calls numbers for their partner for 30 seconds, then switch roles.",
        difficulty: "beginner",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Forgetting which number means which move\n• Losing the ball on every call\n• Freezing instead of reacting\n\nSOLUTIONS:\n• Drop to 3 numbers only (1-3) until comfortable\n• Slow the calling pace, longer pause between calls\n• Post a visual reminder (call out the move name alongside the number for a round)\n• Let them watch a stronger player once before trying",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Reacting instantly with no ball loss\n• Numbers 1-5 all look clean and controlled\n• Getting bored or asking to go faster\n\nSOLUTIONS:\n• Call numbers faster or back-to-back\n• Call two-number combinations in order\n• Add weak-foot-only rounds\n• Introduce new numbers (6 = sit on ball, 7 = 360 with a specific turn)",
    equipmentNeeded: ["1 ball per player", "4 cones for grid corners"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "dribbling", "listening", "reactions"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Players dribble freely and instantly react to coach-called numbers, each tied to a specific ball-control move - builds reaction speed and close control.",
        keyPhrases: [
          "Ears open - react the moment you hear it!",
          "Ball close, ball close!",
          "Commit to the move - sell it!",
        ],
        setupDiagram:
          "30x30 pace grid, 1 ball per player, spread out and dribbling freely",
        quickProgression: {
          easier: "Fewer numbers, slower calling, visual/verbal reminders",
          harder: "Faster calling, two-number combinations, weak foot only",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a 30x30 pace grid with 4 corner cones",
            "Decide the 5 number commands ahead of time so calling is automatic",
            "Have a loud, clear calling voice or a whistle ready",
            "Scan for open space - players need room to speed dribble on number 2",
          ],
          mindset:
            "This is a listening-and-reacting warm-up first, technique second. Keep your calling energetic and varied in pace - the value comes from unpredictability. Praise fast reactions loudly; technique polish comes later in practice.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center of grid",
            script:
              "Teach all 5 numbers with a slow demo of each. 'Number 1 stop, 2 speed, 3 turn, 4 cut, 5 skill move.' Have them dribble freely, then start calling.",
            anticipatedResponses: {
              "I forget which number is which":
                "That's okay - watch a friend and copy them, you'll remember by round 2!",
              "What if I don't know a skill move for number 5?":
                "Any move works - even just a quick fake one way and go the other!",
            },
            troubleshooting: {
              "Players bunching in the middle": [
                "Remind them to find their own space before starting",
              ],
            },
          },
          {
            phase: "Round 1 - Slow Calling",
            duration: "90 seconds",
            coachPosition: "Center, turning to see the whole grid",
            script:
              "Call numbers slowly with gaps between. Praise fast reactions and controlled sole-stops.",
            troubleshooting: {
              "Ball drifting away on stops": [
                "Cue 'soft but firm sole' and demo again quickly",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone watching",
            script:
              "Demo number 5 skill move slowly then at speed. 'Pick one move and get good at it today.'",
          },
          {
            phase: "Round 2 - Mixed Speed",
            duration: "90 seconds",
            coachPosition: "Roaming through the grid",
            script:
              "Vary calling pace - quick bursts and pauses. Watch for hesitation under faster calling.",
          },
          {
            phase: "Challenge Round",
            duration: "90 seconds",
            coachPosition: "Roaming",
            script:
              "Call two-number combinations in order. Normalize mistakes: 'reset and keep going.'",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'Which number was hardest?' Connect to games: reacting fast when things change. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Zero ball loss on any call",
              "Instant reactions every time",
              "Players asking to go faster",
            ],
            solutions: [
              "Call faster",
              "Add two-number combinations",
              "Weak foot only",
              "Add new numbers (6, 7)",
            ],
          },
          tooHard: {
            symptoms: [
              "Frequent freezing",
              "Ball lost on most calls",
              "Numbers mixed up constantly",
            ],
            solutions: [
              "Reduce to 3 numbers",
              "Slow the calling pace",
              "Say the move name alongside the number",
            ],
          },
        },
        playerBehavior: {
          notReacting: {
            symptoms: ["Delayed response", "Copying neighbors instead of reacting"],
            approach:
              "SAY: 'Ears up - you've got this! Listen for YOUR cue.' Call their name before the number for a round to rebuild confidence.",
          },
          losingBallControl: {
            symptoms: ["Ball bouncing away", "Chasing the ball instead of controlling it"],
            approach:
              "SAY: 'Slow your feet down, keep the ball close - speed comes after control.' Praise any improvement immediately.",
          },
        },
        environmentalIssues: {
          noisyEnvironment: {
            symptoms: ["Players not hearing the call"],
            solution: "Use a whistle plus a hand signal for each number as backup.",
          },
          overcrowdedGrid: {
            symptoms: ["Frequent collisions", "No room to speed dribble"],
            solution: "Widen the grid or split into two smaller groups running simultaneously.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling",
            domain: "technical",
            howItDevelops:
              "Constant switching between control moves (stop, speed, turn, cut, skill) builds the toolbox players draw on in real games when situations change instantly.",
            levelIndicators: {
              1: "Loses ball on most number calls; needs to look down constantly",
              2: "Can execute simple numbers (1, 2) but struggles with turns and cuts",
              3: "Executes all 5 numbers with control at moderate speed",
              4: "Reacts instantly and cleanly even with fast, mixed calling",
              5: "Combines numbers fluidly, adds personal flair to skill moves",
            },
            assessmentNotes:
              "Watch how many touches it takes to regain control after each call, and whether reaction time shortens as the round progresses.",
          },
          {
            skill: "Agility & Coordination",
            domain: "physical",
            howItDevelops:
              "Rapid, unpredictable direction and speed changes on command build the same quick-reaction footwork needed to react to opponents and the ball in games.",
            levelIndicators: {
              1: "Stiff, delayed movements; loses balance on turns",
              2: "Moves but with noticeable lag between hearing and reacting",
              3: "Smooth transitions between moves at moderate speed",
              4: "Quick, balanced reactions even at fast calling pace",
              5: "Anticipates and reacts with minimal lag, stays balanced throughout",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "Coachability",
            domain: "psychological",
            howItDevelops:
              "Listening for a verbal cue and translating it into immediate action builds the habit of processing and acting on coaching instructions quickly.",
          },
        ],
        physicalDevelopment: {
          agility: "Rapid direction and speed changes on command",
          coordination: "Foot-eye coordination adjusting touch to each move",
          cardiovascular: "Continuous light movement throughout the warm-up",
        },
        psychologicalDevelopment: {
          listening: "Processing a verbal cue and reacting instantly",
          confidence: "Successfully executing moves builds comfort with the ball",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Numbers Game Warmup packs reaction training, listening skills, and a review of core dribbling moves into a short, high-energy opener. It gets every player touching the ball constantly while training them to react to a cue rather than just free-dribble - a habit that transfers directly to reacting to teammates, opponents, and coaches in games.",
        whenToUseIt: {
          idealFor: [
            "First activity of practice (raises heart rate, reviews technique)",
            "Reviewing multiple dribbling moves quickly",
            "Days when attention needs a fast-paced, game-like warm-up",
          ],
          avoidWhen: [
            "Players haven't yet learned basic ball control (introduce Ball Mastery Circle first)",
            "Very large groups without enough space to speed dribble safely",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Ball Mastery Circle",
              reason: "Builds the basic touches (stop, turn) this activity calls on",
            },
          ],
          after: [
            {
              activity: "Gates Dribbling",
              reason: "Applies the same close control while adding spatial decision-making",
            },
            {
              activity: "Copy Cat Dribbling",
              reason: "Extends reactive dribbling into a partner-following format",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Keep it playful - frame numbers as a fun game, not a test. Use only 3 numbers to start.",
            keyPhrases: [
              "Let's play the numbers game!",
              "You've got this - just react!",
              "Great try, that was fast!",
            ],
            avoidSaying: ["You got that wrong", "Too slow"],
            duration: "5-6 minutes",
            simplifications: [
              "Start with 3 numbers instead of 5",
              "Slower calling pace",
              "Demo each number again mid-activity if needed",
            ],
          },
          ages9to11: {
            approach: "Add speed and combinations once all 5 numbers are solid.",
            keyPhrases: [
              "Stay ready for anything!",
              "Can you do two in a row?",
              "Nice quick reaction!",
            ],
            challenges: [
              "Two-number combinations",
              "Faster calling pace",
              "Weak foot rounds",
            ],
            duration: "7-8 minutes",
          },
          ages12to14: {
            approach: "Use as a fast technical review; add competitive or fitness elements.",
            keyPhrases: [
              "React and go - no hesitation!",
              "How does this help you in a game?",
            ],
            challenges: [
              "Player-led calling",
              "New/invented numbers",
              "Combined with light conditioning",
            ],
            coachRole: "Facilitate self-directed practice; hand off calling duties",
          },
        },
        commonMisconceptions: {
          "It's just a memory game":
            "The memory piece is secondary - the real training is instant reaction while maintaining ball control under a surprise cue.",
          "Doesn't need to be taken seriously since it's a warm-up":
            "Warm-ups set the tone and touch count for the whole practice; sloppy technique here becomes sloppy technique later.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Numbers Game Warmup gets your child listening for a cue and instantly reacting with the ball - it's training the same quick decision-making they need when the game situation suddenly changes.",
        newsletter:
          "This week's warm-up: Numbers Game! Players dribble freely and react instantly to called-out numbers, each tied to a different move - stopping, speed dribbling, turning, cutting, and skill moves. Great for building quick reactions and ball control at home too - just call out a number and see how fast they react!",
        whatToWatchFor: [
          "Does your child react quickly or hesitate before moving?",
          "Can they keep the ball close during the speed dribble?",
          "Do they have a go-to skill move they're proud of for number 5?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions during speed dribbling in a crowded grid",
            prevention: "Size the grid to the group; remind players to scan for space",
            response: "Check players for injury; widen the grid if collisions recur",
          },
          {
            risk: "Rolled ankles on sharp direction changes (number 4)",
            prevention: "Ensure a proper warm-up has happened before this activity if used mid-practice",
            response: "Rest, check for swelling, reduce intensity for the rest of the session",
          },
        ],
        inclusionConsiderations: {
          hearingDifferences:
            "Pair a hand signal with each number so players who struggle to hear the call still have a visual cue",
          processingSpeedDifferences:
            "Allow extra reaction time or fewer numbers for players who need it; never single out slower reactions",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players reacting quickly or lagging behind the calls?",
          "Did I vary my calling pace enough to keep it engaging?",
          "Was the grid the right size for the group?",
          "Which number needs more review before next practice?",
        ],
        forImprovement: [
          "Should I add or remove a number command next time?",
          "Who would benefit from being the caller to build confidence?",
          "How can I connect this more explicitly to in-game reactions?",
        ],
      },
    },
  },
  {
    slug: "partner-mirror-warmup",
    name: "Partner Mirror Warmup",
    description:
      "Partners face each other with a ball each - one leads dribbling moves, the other mirrors them in real time. Builds close control, balance, and the habit of reading a body rather than a ball, with a full role-reversal to work both directions.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 8,
    skillsDeveloped: ["agility-coordination", "dribbling"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player (2 per pair)\n□ Cones to mark pair spots (optional)\n\nSPACE: small - each pair needs roughly a 4x4 pace box\n\nSETUP STEPS\n1. Split into pairs, matched roughly by size/ability where possible\n2. Each pair finds their own 4x4 pace space, spread out from other pairs\n3. Partners face each other 3-4 paces apart, each with a ball\n4. Decide who leads first - the other partner mirrors\n\nDIAGRAM\n┌────────────────────────────────┐\n│   ○ ⚽        ⚽ ○              │\n│                                │\n│        ○ ⚽    ⚽ ○            │  4 paces\n│                                │\n│   ○ ⚽        ⚽ ○              │\n└────────────────────────────────┘\n     3-4 paces between partners\n\n○ ⚽ = player with ball, facing partner across the gap",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center, demoing with an assistant or a player\n\nSAY: "Find a partner and grab a ball each! You\'re going to face each other like a mirror. One of you LEADS - you make dribbling moves. The other one MIRRORS - copies the move like you\'re looking in a mirror!"\n\nDEMO: Side-to-side taps, partner mirrors opposite direction.\n\nSAY: "Watch your partner\'s HIPS, not their ball - that\'s the secret. Hips tell you where they\'re about to go before the ball does!"\n\n\nPHASE 2: ROUND 1 - LEADER PRACTICE (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Leaders, start slow - side to side, forward and back. Followers, mirror it! Ready... GO!"\n\nCoach Position: Walk between pairs, watching hip-reading\n\nLOOK FOR:\n□ Is the follower watching hips or ball?\n□ Are both partners staying balanced, low center of gravity?\n□ Is the leader going too fast for their partner to follow?\n\nPHRASES TO USE:\n• "Leaders - slow enough that your partner can follow!"\n• "Followers - eyes on their hips!"\n• "Nice and smooth, not jerky!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and watch us."\n\nDEMO with an assistant: exaggerate a hip fake one direction then go the other. Show how watching the ball would fool the follower, but watching hips reveals the real move.\n\nSAY: "See how the hips moved BEFORE the ball? That\'s what you\'re reading!"\n\n\nPHASE 4: SWITCH LEADER (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Switch! Followers, now YOU lead. Leaders, now YOU mirror!"\n\n\nPHASE 5: ROUND 2 - ADD TURNS AND SKILLS (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This time, leaders can add turns and skill moves, not just side to side! Followers, stay balanced and ready to react!"\n\nCoach moves between pairs with specific feedback:\n• "Great read on that turn!"\n• "Leader - give your partner a chance, not too fast!"\n\nSwitch leader again halfway through this round.\n\n\nPHASE 6: CHALLENGE ROUND (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Challenge round - leaders, try to trick your partner with a fake! Followers, stay sharp!"\n\nRun briefly, celebrate good reads and good fakes both.\n\n\nPHASE 7: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Nice work! How did you know what your partner was about to do?"\n\nListen for: "Watched their hips," "Watched their body, not the ball"\n\nSAY: "That\'s exactly how you read opponents and teammates in a real game! Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│   ○ ⚽        ⚽ ○              │\n│                                │\n│        ○ ⚽    ⚽ ○            │\n│                                │\n│   ○ ⚽        ⚽ ○              │\n└────────────────────────────────┘",
    coachingPoints: [
      "READ THE HIPS → Say: 'Watch their hips, not their ball - hips tell you what's coming!'",
      "STAY BALANCED → Say: 'Low and light on your toes, ready to move any direction!'",
      "LEADER SETS THE PACE → Say: 'Go slow enough your partner can actually follow you!'",
      "SMOOTH MOVEMENTS → Say: 'Controlled and smooth, not jerky - like a real mirror!'",
    ],
    questionsToAsk: [
      "'How do you anticipate what your partner will do?' → Looking for: watching hips/shoulders, not the ball",
      "'Which movements are hardest to mirror?' → Builds self-awareness of coordination gaps",
      "'What happens if the leader goes too fast?' → Looking for: the follower falls behind or loses ball control",
      "'How is reading your partner like reading an opponent in a game?' → Connects to 1v1 defending and anticipation",
    ],
    commonMistakes: [
      "WATCHING THE BALL INSTEAD OF PARTNER → Say: 'Eyes up on their hips - the ball is a distraction!'",
      "SLOW REACTIONS → Say: 'Stay light on your toes, ready to move the instant they do!'",
      "LEADER GOING TOO FAST → Say: 'Slow down - give your partner a real chance to mirror you!'",
      "STANDING TOO UPRIGHT → Say: 'Bend your knees, get low - that's how you move quickly!'",
    ],
    variations: [
      {
        name: "No Ball Mirror",
        description:
          "Start without balls, just body movement mirroring - isolates the hip-reading skill before adding ball control on top.",
        difficulty: "beginner",
      },
      {
        name: "Add Passes",
        description:
          "Include a pass back and forth mixed into the mirrored movements - leader dribbles, then passes, follower must mirror the movement and receive.",
        difficulty: "advanced",
      },
      {
        name: "Three-Person Mirror",
        description:
          "Groups of 3 - one leader, two followers must both mirror simultaneously. Adds awareness of others.",
        difficulty: "intermediate",
      },
      {
        name: "Silent Signal Switch",
        description:
          "Leader and follower switch roles on a coach signal (whistle or clap) without stopping movement - keeps both partners alert throughout.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Constantly looking at the ball instead of their partner\n• Falling badly out of sync\n• Losing ball control while trying to mirror\n\nSOLUTIONS:\n• Drop the ball entirely for a round (No Ball Mirror variation)\n• Slow the leader's pace way down\n• Shrink movements to just side-to-side taps before adding turns/skills\n• Pair a stronger player as leader with a developing player as follower first",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Mirroring smoothly even with turns and skill moves\n• Anticipating direction changes before they fully happen\n• Staying balanced and in control throughout\n\nSOLUTIONS:\n• Leader adds fakes and change-of-pace to test the follower's read\n• Add passing into the mirrored sequence\n• Faster switching between leader and follower roles\n• Move to Three-Person Mirror for a harder tracking challenge",
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["warmup", "coordination", "reactions", "partners"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Partners face off with a ball each - one leads dribbling moves, the other mirrors by reading hips and body position rather than the ball.",
        keyPhrases: [
          "Watch their hips, not their ball!",
          "Stay low and light on your toes!",
          "Smooth and controlled, like a real mirror!",
        ],
        setupDiagram:
          "Pairs 3-4 paces apart, each with a ball, in their own 4x4 pace space",
        quickProgression: {
          easier: "No ball first, slower leader pace, side-to-side only",
          harder: "Add fakes, passing, faster role switches, three-person groups",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Pair players, roughly matching size/ability where possible",
            "Space pairs at least 2-3 paces apart from other pairs",
            "Plan a demo with an assistant coach or a confident player",
            "Decide your switch-leader timing (every 45 seconds is a good default)",
          ],
          mindset:
            "This is about reading a body, not a ball - the core skill of anticipating an opponent. Keep repeating 'watch the hips' until it becomes automatic. Leaders should be coached to set a fair pace, not to try to 'beat' their partner.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center, demoing with an assistant",
            script:
              "Demo leader/follower roles. 'Watch their hips, not their ball - hips tell you what's coming.' Assign initial leader in each pair.",
            anticipatedResponses: {
              "What if I can't guess what they'll do?":
                "That's normal at first - keep watching hips, it gets easier fast!",
            },
          },
          {
            phase: "Round 1 - Leader Practice",
            duration: "90 seconds",
            coachPosition: "Walking between pairs",
            script:
              "Leaders go slow and simple (side-to-side, forward-back). Coach reminds followers to watch hips, leaders to set a fair pace.",
            troubleshooting: {
              "Leader going too fast": [
                "Cue: 'Slow down - give your partner a real chance!'",
              ],
              "Follower staring at the ball": [
                "Cue: 'Eyes up on their hips, not the ball!'",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone watching",
            script:
              "Demo a hip fake with an assistant. 'See how the hips moved before the ball? That's what you're reading.'",
          },
          {
            phase: "Switch Leader",
            duration: "30 seconds",
            coachPosition: "Center",
            script: "Call the switch clearly so both partners get equal leader time.",
          },
          {
            phase: "Round 2 - Add Turns and Skills",
            duration: "90 seconds",
            coachPosition: "Roaming between pairs",
            script:
              "Leaders add turns and skill moves. Coach gives specific feedback on reads and pacing, switches leader again mid-round.",
          },
          {
            phase: "Challenge Round",
            duration: "60 seconds",
            coachPosition: "Roaming",
            script:
              "Leaders try one fake to test their partner's read. Celebrate both good fakes and good reads.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'How did you know what your partner would do?' Connect to reading opponents in games. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Perfect mirroring even with fakes and turns",
              "Followers anticipating before the leader fully moves",
              "Pairs asking for more challenge",
            ],
            solutions: [
              "Add fakes and change-of-pace",
              "Faster leader-follower switching",
              "Move to Three-Person Mirror",
              "Add passing into the sequence",
            ],
          },
          tooHard: {
            symptoms: [
              "Constant desync between partners",
              "Ball control breaking down while trying to mirror",
              "Frustration or giving up on mirroring",
            ],
            solutions: [
              "Drop the ball for a round (No Ball Mirror)",
              "Slow the leader way down",
              "Simplify to side-to-side only",
              "Re-pair for a better ability match",
            ],
          },
        },
        playerBehavior: {
          mismatchedPairs: {
            symptoms: ["One partner dominating, other disengaged"],
            approach:
              "SAY: 'Leaders, this is about teamwork, not showing off - help your partner succeed.' Re-pair if the gap is too wide.",
          },
          racingInsteadOfMirroring: {
            symptoms: ["Leader speeding up to try to 'beat' the follower"],
            approach:
              "SAY: 'This isn't a race - the goal is a perfect mirror, not going fast.' Re-demo at a fair pace.",
          },
        },
        environmentalIssues: {
          crowdedSpace: {
            symptoms: ["Pairs bumping into neighboring pairs"],
            solution: "Widen spacing between pairs or reduce group size dribbling at once.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Agility & Coordination",
            domain: "physical",
            howItDevelops:
              "Mirroring a partner's dribbling moves in real time trains quick, balanced reactions and body control under a moving visual cue.",
            levelIndicators: {
              1: "Consistently out of sync; loses balance mirroring simple moves",
              2: "Mirrors basic side-to-side movement but lags on turns",
              3: "Mirrors most movements smoothly with occasional delay",
              4: "Mirrors turns and skill moves in near-real time",
              5: "Anticipates the leader's move before it fully develops",
            },
            assessmentNotes:
              "Watch the gap in timing between leader and follower - does it shrink as the round goes on?",
          },
          {
            skill: "Dribbling",
            domain: "technical",
            howItDevelops:
              "Both leader and follower must keep the ball under close control while performing varied moves and reacting to a partner, reinforcing touch quality under distraction.",
            levelIndicators: {
              1: "Ball control breaks down whenever attention shifts to the partner",
              2: "Can dribble simple moves while mirroring, loses control on turns",
              3: "Maintains control through most mirrored movements",
              4: "Controls ball smoothly even during fakes and skill moves",
              5: "Full control while also disguising own movement as leader",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "1v1 Defending",
            domain: "tactical",
            howItDevelops:
              "Reading a partner's hips and body shape to anticipate movement is the same visual read used to defend a dribbler 1v1.",
          },
          {
            skill: "Teamwork",
            domain: "psychological",
            howItDevelops:
              "Leaders must set a pace their partner can follow, building an early sense of working with a teammate rather than against them.",
          },
        ],
        physicalDevelopment: {
          agility: "Quick, balanced reactions to a partner's changing movement",
          coordination: "Ball control while visually tracking another person",
        },
        psychologicalDevelopment: {
          teamwork: "Leader adjusts pace to help partner succeed",
          confidence: "Successfully reading and mirroring builds visual-processing confidence",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Partner Mirror Warmup trains players to read a body instead of a ball - the exact visual skill used to anticipate an opponent's move in 1v1 defending or to read a teammate's run in support play. Doing it with a ball each keeps touches high while building this awareness.",
        whenToUseIt: {
          idealFor: [
            "Warm-up before defending or 1v1 focused sessions",
            "Building partner communication and teamwork early in practice",
            "Groups that already have solid individual ball control",
          ],
          avoidWhen: [
            "Players haven't yet built basic dribbling control (introduce Ball Mastery Circle first)",
            "Group has an odd number and no way to form pairs or a trio",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Ball Mastery Circle",
              reason: "Establishes basic close control needed to mirror while dribbling",
            },
          ],
          after: [
            {
              activity: "1v1 to Goal",
              reason: "Applies the same hip-reading skill against a live, competitive opponent",
            },
            {
              activity: "Copy Cat Dribbling",
              reason: "Extends reactive mirroring into a chase-and-follow dribbling format",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Keep it playful and simple - frame it as a literal mirror game. Skip the ball at first if coordination is still developing.",
            keyPhrases: [
              "Be a mirror - copy your friend!",
              "Watch their tummy button, not the ball!",
              "Nice copying!",
            ],
            avoidSaying: ["You're out of sync", "That was wrong"],
            duration: "5-6 minutes",
            simplifications: [
              "No ball mirror first",
              "Side-to-side movement only",
              "Longer leader turns so followers aren't rushed to switch",
            ],
          },
          ages9to11: {
            approach: "Add turns, skill moves, and quicker role switching.",
            keyPhrases: [
              "Read their hips before they move!",
              "Can you copy this turn?",
              "Great anticipation!",
            ],
            challenges: [
              "Add turns and skill moves",
              "Faster leader-follower switches",
              "Leader fakes to test the follower",
            ],
            duration: "8 minutes",
          },
          ages12to14: {
            approach: "Connect explicitly to defending; add competitive elements.",
            keyPhrases: [
              "This is exactly how you read a dribbler in a game!",
              "What cues tell you the move before it happens?",
            ],
            challenges: [
              "Three-person mirror groups",
              "Combine with passing sequences",
              "Fastest-reaction mini competitions",
            ],
            coachRole: "Facilitate discussion linking this to defending and reading play",
          },
        },
        commonMisconceptions: {
          "It's just a coordination game, not soccer-specific":
            "Reading hips instead of the ball is the exact visual skill elite defenders use to anticipate a dribbler - it's directly transferable.",
          "The ball is the important part to watch":
            "The ball moves last - hips and shoulders reveal intent first, which is the whole teaching point.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Partner Mirror Warmup pairs kids up to copy each other's dribbling moves - it trains them to read a person's body instead of just the ball, which is exactly how good defenders anticipate an opponent in games.",
        newsletter:
          "This week's warm-up: Partner Mirror! Players paired up, one leading dribbling moves and the other mirroring in real time. The big lesson: watch hips, not the ball, to predict what's coming next. A fun one to try at home - stand across from your child and take turns leading a simple mirror game, no ball needed!",
        whatToWatchFor: [
          "Does your child watch their partner's body or the ball?",
          "Are they staying balanced and low, ready to move?",
          "Do they set a fair pace for their partner when leading?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions between pairs in a crowded space",
            prevention: "Space pairs well apart; size the area to the group",
            response: "Check players; increase spacing if it recurs",
          },
          {
            risk: "Ankle rolls on quick direction changes",
            prevention: "Ensure players are properly warmed up first; keep leader pace reasonable",
            response: "Rest and check for swelling; reduce intensity",
          },
        ],
        inclusionConsiderations: {
          coordinationDifferences:
            "Start without a ball and with slow, simple movements; pair thoughtfully so both partners can succeed",
          visionImpairments:
            "Use verbal cues alongside movement; allow closer partner spacing",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were followers watching hips or still tracking the ball?",
          "Did leaders set a fair, followable pace?",
          "Were pairs well-matched in ability?",
          "Did I switch leaders often enough for both to get equal reps?",
        ],
        forImprovement: [
          "Should I re-pair anyone next time for a better match?",
          "Which variation fits this group's current level?",
          "How can I connect this more explicitly to defending in a scrimmage later in practice?",
        ],
      },
    },
  },
  {
    slug: "passing-accuracy-challenge",
    name: "Passing Accuracy Challenge",
    description:
      "Players pass through cone gates of varying widths to score points, rewarding precise inside-of-foot technique over power. Builds passing accuracy, weight of pass, and the discipline to hit a specific target.",
    sport: "soccer",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["passing-short"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 10-12 cones (2 per gate for 5-6 gates)\n□ 1 ball per player (or shared between a line)\n□ Cone or marker for the passing line\n\nSPACE: 20x25 paces\n\nSETUP STEPS\n1. Set up 5-6 cone gates at varying widths: narrow (1 pace), medium (2 paces), wide (3 paces)\n2. Place gates 10-20 paces from the passing line, spread across the width of the area\n3. Mark a passing line with a cone or line on the ground\n4. Players line up behind the passing line with balls, one at a time\n\nDIAGRAM\n┌────────────────────────────────┐\n│  ⊏⊐    ⊏──⊐   ⊏────⊐   ⊏⊐   ⊏──⊐   │  10-20 paces\n│  (3pt)  (2pt)   (1pt)  (3pt) (2pt) │\n│                                │\n│                                │\n│  - - - - - - - - - - - - - -  │  passing line\n│        ○  ○  ○  ○  ○          │\n└────────────────────────────────┘\n\n⊏⊐ = narrow gate (1 pace, 3 points)  ⊏──⊐ = medium gate (2 paces, 2 points)  ⊏────⊐ = wide gate (3 paces, 1 point)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: By the passing line\n\nSAY: "See these gates? The narrow ones are worth 3 points, medium gates are 2 points, and the wide ones are 1 point. Your job is to pass the ball THROUGH a gate using the inside of your foot!"\n\nDEMO: Plant foot pointing at the target gate, lock your ankle, strike through the middle of the ball with the inside of your foot, follow through toward the target.\n\nSAY: "Lock your ankle - foot stays firm, like a hockey stick. Point your belly button at the gate you\'re aiming for!"\n\n\nPHASE 2: ROUND 1 - FREE ATTEMPTS (2-3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone gets 5 passes. Pick your gates, call out your target before you pass, and let\'s count points! Next player up when the ball is struck."\n\nCoach Position: Beside the line, calling out scores\n\nLOOK FOR:\n□ Is the plant foot pointing at the target?\n□ Is the ankle locked (inside of foot, not toe)?\n□ Are they following through toward the gate?\n\nPHRASES TO USE:\n• "Nice, lock that ankle!"\n• "Point your belly button at the gate!"\n• "Follow through - finish toward your target!"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone come watch this one pass."\n\nDEMO: Show a toe-poked pass (ball skips unpredictably) vs. a locked-ankle inside-of-foot pass (ball rolls true).\n\nSAY: "See the difference? Toe poke - the ball bounces all over. Inside of the foot, ankle locked - it rolls straight and true. That\'s your target technique!"\n\n\nPHASE 4: ROUND 2 - CALL YOUR SHOT (2-3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This round, call out which gate you\'re aiming for BEFORE you strike - narrow, medium, or wide. Try to beat your Round 1 score!"\n\nCoach moves along the line with specific feedback:\n• "Great plant foot - right at the target!"\n• "Slow down, set your foot first, then strike"\n\n\nPHASE 5: CHALLENGE ROUND (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE challenge:\n\nOption A - Weak Foot Only:\nSAY: "This round, every pass must be with your weak foot! It\'s okay if it feels harder - focus on the technique!"\n\nOption B - Only Narrow Gates Count:\nSAY: "This round, only narrow gates score points - go for precision!"\n\nRun challenge, celebrate effort and improvement.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great passing! What helped you hit more gates?"\n\nListen for: "Locking my ankle," "Pointing my foot at the target," "Following through"\n\nSAY: "That\'s exactly the technique you need to find a teammate in a game! Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│  ⊏⊐    ⊏──⊐   ⊏────⊐   ⊏⊐   ⊏──⊐   │\n│  (3pt)  (2pt)   (1pt)  (3pt) (2pt) │\n│                                │\n│  - - - - - - - - - - - - - -  │\n│        ○  ○  ○  ○  ○          │\n└────────────────────────────────┘",
    coachingPoints: [
      "LOCK THE ANKLE → Say: 'Ankle locked firm, like a hockey stick - not floppy!'",
      "PLANT FOOT AIMS THE PASS → Say: 'Point your belly button and your plant foot right at the gate!'",
      "INSIDE OF THE FOOT → Say: 'Use the flat part - show me your inside of the foot like a high-five!'",
      "FOLLOW THROUGH → Say: 'Finish your swing toward the target - don't stab and stop!'",
    ],
    questionsToAsk: [
      "'Where do you look when passing?' → Looking for: at the target/gate, with a quick check of the ball before striking",
      "'How do you adjust for different distances?' → Looking for: more follow-through and hip drive for longer passes, softer touch for closer ones",
      "'Why does the narrow gate score more points?' → Looking for: it takes more precision and control to hit",
      "'What's the difference between a toe poke and an inside-of-foot pass?' → Looking for: inside-of-foot is more accurate and controlled",
    ],
    commonMistakes: [
      "TOE POKING → Say: 'Turn your foot sideways - use the inside, not the toe!'",
      "NOT FOLLOWING THROUGH → Say: 'Don't stop at contact - swing your leg through toward the gate!'",
      "LOOKING UP TOO EARLY → Say: 'Eyes on the ball through contact, then look up to check your target!'",
      "RUSHING THE SHOT → Say: 'Take a breath, plant your foot, then strike - no need to rush!'",
    ],
    variations: [
      {
        name: "Moving Target",
        description:
          "A partner stands in the gate and moves side to side; players must time and place the pass to reach the moving target through the gate.",
        difficulty: "intermediate",
      },
      {
        name: "Weak Foot Only",
        description:
          "All passes must be struck with the non-dominant foot, isolating two-footed development.",
        difficulty: "intermediate",
      },
      {
        name: "Partner Passing Gates",
        description:
          "Pairs pass back and forth through a shared gate from either side, combining accuracy with receiving and giving continuous reps.",
        difficulty: "beginner",
      },
      {
        name: "Beat the Clock",
        description:
          "Players get 30 seconds to score as many points as possible across all gates, adding a time-pressure element to the accuracy challenge.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Consistently missing every gate\n• Toe-poking instead of using inside of foot\n• Ball skipping or bouncing unpredictably\n\nSOLUTIONS:\n• Widen all gates or remove the narrow ones temporarily\n• Move the passing line closer (5-8 paces)\n• Let them walk through the strike in slow motion first\n• Focus feedback on ONE cue at a time (start with 'lock your ankle')",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Consistently hitting medium and wide gates\n• Clean inside-of-foot technique with good follow-through\n• Asking to try farther gates or harder challenges\n\nSOLUTIONS:\n• Move the passing line farther back (20-25 paces)\n• Only narrow gates count for points\n• Add the Moving Target variation\n• Weak foot only, or add a time limit (Beat the Clock)",
    equipmentNeeded: ["10-12 cones", "1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["passing", "accuracy", "technique", "competition"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Players pass through cone gates of varying widths - narrow gates score more points - to build accurate inside-of-foot passing technique.",
        keyPhrases: [
          "Lock your ankle - firm like a hockey stick!",
          "Point your belly button at the target!",
          "Follow through toward the gate!",
        ],
        setupDiagram:
          "20x25 paces, 5-6 gates of varying widths (1-3 paces) at 10-20 paces from the passing line",
        quickProgression: {
          easier: "Wider gates, closer distance, one cue at a time",
          harder: "Farther distance, narrow gates only, weak foot, time limit",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up 5-6 gates with clearly different widths (narrow/medium/wide)",
            "Mark point values for each gate width before starting",
            "Mark a clear passing line",
            "Have balls ready so the line keeps moving quickly",
          ],
          mindset:
            "This is about rewarding CONTROL over power. Keep circling back to 'lock your ankle' and 'point your foot at the target' - these two cues fix most passing errors. Praise a well-struck pass that misses over a lucky toe-poke that scores.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "By the passing line",
            script:
              "Explain gate point values. Demo the technique: plant foot at target, lock ankle, inside of foot, follow through. 'Lock your ankle, point your belly button at the gate.'",
            anticipatedResponses: {
              "Which gate should I aim for?":
                "Try a mix - go for the big points sometimes, safe points other times!",
              "My pass keeps going sideways":
                "Check your plant foot - is it pointing at the gate?",
            },
          },
          {
            phase: "Round 1 - Free Attempts",
            duration: "2-3 minutes",
            coachPosition: "Beside the line, calling scores",
            script:
              "Each player gets 5 attempts. Coach calls out points scored and gives one technique cue per player.",
            troubleshooting: {
              "Line moving too slowly": [
                "Have 2 lines/gates running at once if space allows",
              ],
              "Toe-poking common": [
                "Pause and re-demo the inside-of-foot cue individually",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "By the passing line, everyone gathered",
            script:
              "Demo toe poke vs. locked-ankle inside-of-foot pass side by side. 'See the difference? That's your target technique.'",
          },
          {
            phase: "Round 2 - Call Your Shot",
            duration: "2-3 minutes",
            coachPosition: "Along the line",
            script:
              "Players call their target gate before striking. Coach gives feedback tied to plant foot and follow-through.",
          },
          {
            phase: "Challenge Round",
            duration: "2 minutes",
            coachPosition: "Along the line",
            script:
              "Pick one challenge: weak foot only or narrow-gates-only. Celebrate effort and technique over final score.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "By the passing line",
            script:
              "ASK: 'What helped you hit more gates?' Connect to finding a teammate in a game. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Everyone consistently hitting narrow gates",
              "Perfect technique on every attempt",
              "Players asking for a bigger challenge",
            ],
            solutions: [
              "Move the line farther back",
              "Only narrow gates score",
              "Weak foot only",
              "Add a time limit",
            ],
          },
          tooHard: {
            symptoms: [
              "Missing every gate",
              "Frustration building",
              "Reverting to kicking as hard as possible",
            ],
            solutions: [
              "Widen the gates",
              "Move the line closer",
              "Slow-motion technique walk-throughs",
              "Focus on one cue at a time",
            ],
          },
        },
        playerBehavior: {
          rushingShots: {
            symptoms: ["Striking without setting up", "Off-balance passes"],
            approach:
              "SAY: 'No rush - take a breath, plant your foot, then strike.' Have them pause and check plant-foot position before every attempt for a round.",
          },
          discouragedByMisses: {
            symptoms: ["Giving up after a few misses", "Blaming the gate width"],
            approach:
              "SAY: 'Even the pros miss - I care about your technique, not just the score.' Praise well-struck misses specifically.",
          },
        },
        environmentalIssues: {
          longLineWaitTimes: {
            symptoms: ["Players standing around bored between turns"],
            solution: "Run two lines to two sets of gates simultaneously, or give players a ball each and rotate quickly.",
          },
          windyConditions: {
            symptoms: ["Balls curving off target unpredictably"],
            solution: "Widen gates slightly to account for wind, or move to a more sheltered area.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Passing (Short)",
            domain: "technical",
            howItDevelops:
              "Direct, repeated practice striking a ball with the inside of the foot at a specific target builds the exact technique needed to accurately find a teammate in games.",
            levelIndicators: {
              1: "Passes lack direction; uses toe or random foot surface",
              2: "Can hit wide gates consistently, misses medium/narrow",
              3: "Hits medium gates regularly with locked-ankle technique",
              4: "Consistently threads narrow gates; appropriate weight for distance",
              5: "Can call and hit any gate on demand, including with weak foot",
            },
            assessmentNotes:
              "Watch plant-foot direction and ankle lock at contact - these two cues predict accuracy better than watching the ball's path alone.",
          },
        ],
        secondarySkills: [
          {
            skill: "Creating Passing Angles",
            domain: "tactical",
            howItDevelops:
              "Choosing which gate to attack based on point value and difficulty builds early decision-making about pass selection.",
          },
          {
            skill: "Confidence",
            domain: "psychological",
            howItDevelops:
              "Visible, countable success (points scored) on a repeatable technical task builds confidence in passing ability.",
          },
        ],
        physicalDevelopment: {
          coordination: "Foot-eye coordination striking a stationary ball at a specific target",
        },
        psychologicalDevelopment: {
          focus: "Maintaining technique precision under simple competitive pressure",
          goalSetting: "Trying to beat a personal point total",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Passing Accuracy Challenge isolates the single most important passing technique - locked ankle, inside of the foot, plant foot aimed at target - and gives players immediate, visible feedback (did it go through the gate?) on whether they executed it. The point-value system rewards precision over just kicking the ball hard.",
        whenToUseIt: {
          idealFor: [
            "Early technical block of practice, after a dribbling warm-up",
            "Introducing or reinforcing short passing technique",
            "Building two-footed passing ability (via weak-foot rounds)",
          ],
          avoidWhen: [
            "Very large groups without enough space for multiple gate sets (lines get too long)",
            "Players need live, game-like passing under pressure (use Passing Combinations or Rondo instead)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Passing Pairs",
              reason: "Introduces basic inside-of-foot passing technique with a live partner",
            },
          ],
          after: [
            {
              activity: "Passing Combinations",
              reason: "Applies accurate passing within moving, game-like combination play",
            },
            {
              activity: "Wall Pass Combinations",
              reason: "Adds a second player and timing to the accuracy skill built here",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Emphasize fun and effort over precise point totals; celebrate any pass that goes through a gate.",
            keyPhrases: [
              "Point your foot at the gate!",
              "Nice and smooth - flat part of your foot!",
              "You got one through - great job!",
            ],
            avoidSaying: ["That was way off", "You need to be more accurate"],
            duration: "6-8 minutes",
            simplifications: [
              "Wider gates only",
              "Closer passing distance (6-8 paces)",
              "Fewer gates so the line moves fast",
            ],
          },
          ages9to11: {
            approach: "Introduce the point-scoring system fully and encourage calling the shot.",
            keyPhrases: [
              "Call your gate before you strike!",
              "Lock that ankle!",
              "Beat your last score!",
            ],
            challenges: [
              "Call your shot before passing",
              "Weak foot rounds",
              "Narrow-gate-only scoring",
            ],
            duration: "10 minutes",
          },
          ages12to14: {
            approach: "Add time pressure and connect explicitly to game passing decisions.",
            keyPhrases: [
              "Why would you pick a low-point safe pass in a game?",
              "Precision under time pressure - go!",
            ],
            challenges: [
              "Beat the Clock variation",
              "Moving Target variation",
              "Combine with a defender closing down the passer",
            ],
            coachRole: "Facilitate discussion on when precision vs. speed matters in real passing decisions",
          },
        },
        commonMisconceptions: {
          "Harder passes are always better":
            "In a real game, the right pass is often the SAFE one (wide gate) - precision and decision-making matter more than always going for the hardest option.",
          "Power matters more than technique":
            "A well-struck, controlled pass with a locked ankle is more accurate and more useful to a teammate than a hard, uncontrolled one.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Passing Accuracy Challenge has your child pass a ball through cone gates - the narrower the gate, the more points it's worth. It rewards controlled, technically correct passing over just kicking the ball hard, which is exactly what makes a pass useful to a teammate in a real game.",
        newsletter:
          "This week: Passing Accuracy Challenge! Players tried to thread passes through cone gates of different widths, scoring more points for narrower gates. The key technique: lock your ankle, use the inside of your foot, and point your plant foot at the target. A great one to recreate in the backyard with two chairs or shoes as a gate!",
        whatToWatchFor: [
          "Is your child using the inside of their foot, or toe-poking the ball?",
          "Does their plant foot point toward the target before they strike?",
          "Are they following through toward where they're aiming?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Players struck by stray balls from adjacent gates or lines",
            prevention: "Space gates and lines well apart; angle gates away from other groups",
            response: "Check for injury; adjust spacing if it recurs",
          },
          {
            risk: "Overuse strain from repeated kicking on one foot",
            prevention: "Include weak-foot reps to balance load between both legs",
            response: "Rest if any discomfort is reported",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences:
            "Allow a stationary or shorter run-up to the ball; adjust distance to the gate as needed",
          visionImpairments:
            "Use bright, high-contrast cones for gates; consider verbal distance/direction cues",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players locking their ankle and using the inside of the foot?",
          "Did the point-value system motivate without causing frustration?",
          "Was the passing distance appropriate for this group's skill level?",
          "Did I give each player individual technique feedback, not just a score?",
        ],
        forImprovement: [
          "Should gate distances or widths change for next time?",
          "Who needs closer one-on-one technique coaching?",
          "How can I connect this more to live passing under pressure next session?",
        ],
      },
    },
  },
  {
    slug: "first-touch-box",
    name: "First Touch Box",
    description:
      "A receiver stands inside a small marked box while servers around the perimeter pass in from different angles - every first touch must keep the ball inside the box. Builds cushioned, controlled receiving under angle and speed variation.",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["receiving-first-touch"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 4 cones per box (3x3 pace box)\n□ 1 ball\n□ Extra cones if running multiple boxes at once\n\nSPACE: 3x3 paces per box, plus room around the perimeter for servers\n\nSETUP STEPS\n1. Mark a 3x3 pace box with 4 cones\n2. One receiver stands inside the box\n3. Remaining players (servers) spread around the perimeter, 4-6 paces from the box, at different angles\n4. First server starts with the ball\n\nDIAGRAM\n┌────────────────────────────────┐\n│        ○ (server)              │\n│                                │\n│   ○              ○            │  3x3 pace box\n│ (server)    ┌───┐   (server)  │  in the middle\n│             │ ○ │              │\n│             └───┘              │\n│   ○              ○            │\n│ (server)    ○    (server)      │\n│          (server)              │\n└────────────────────────────────┘\n\n┌───┐ = box (3x3 paces)  ○ inside = receiver  ○ around = servers passing in from different angles",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Beside the box\n\nSAY: "One player stands in the box - that\'s the receiver. Everyone else spreads around outside and passes the ball IN to the receiver, one at a time, from different angles!"\n\nSAY: "Receiver - your job is to control the ball with your FIRST touch and keep it INSIDE the box. If it rolls out, that\'s a point against you!"\n\nDEMO: Cushion a pass with the inside of the foot, ball stays in a small area.\n\nSAY: "Soft feet, like the ball is landing on a pillow! Get your body behind it and cushion, don\'t stab at it!"\n\n\nPHASE 2: ROUND 1 - RECEIVER 1 (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "First receiver in the box! Servers, pass it in whenever you\'re ready, mix up your angles! Ready... GO!"\n\nCoach Position: Just outside the box, watching the receiver\'s body position\n\nLOOK FOR:\n□ Is the receiver checking their shoulder before the ball arrives?\n□ Is the touch cushioned or does the ball bounce away?\n□ Is their body opening toward where they want to go?\n\nPHRASES TO USE:\n• "Soft touch - like a pillow!"\n• "Check your shoulder before it arrives!"\n• "Nice - that stayed right in the box!"\n\nCount points against, rotate to next receiver after 8-10 passes.\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch this touch."\n\nDEMO: Show a stiff-leg touch (ball bounces out) vs. a cushioned touch with body behind the ball (ball stays put).\n\nSAY: "See how my leg went soft and gave with the ball? That absorbs the pace. A stiff leg just bounces it right back out!"\n\n\nPHASE 4: ROUND 2 - ROTATE THROUGH RECEIVERS (3-4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New receiver in! Same job - cushion it, keep it in the box. Servers, keep mixing up your angles and pace!"\n\nRotate every 8-10 passes so everyone gets receiver reps.\n\nCoach moves around the box giving individual feedback:\n• "Great - body was already open before it arrived!"\n• "Get lower, bend those knees to cushion it!"\n\n\nPHASE 5: CHALLENGE ROUND (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Challenge round! Servers, add a bit more pace to your passes now. Receiver, stay calm and soft with your touch!"\n\nRun briefly, celebrate composed touches under the extra pace.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great work! What helped you keep the ball in the box?"\n\nListen for: "Soft touch," "Getting my body behind it," "Checking before it arrived"\n\nSAY: "That first touch is the most important touch in soccer - it sets up everything you do next! Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│        ○ (server)              │\n│                                │\n│   ○              ○            │\n│ (server)    ┌───┐   (server)  │\n│             │ ○ │              │\n│             └───┘              │\n│   ○              ○            │\n│ (server)    ○    (server)      │\n│          (server)              │\n└────────────────────────────────┘",
    coachingPoints: [
      "BODY BEHIND THE BALL → Say: 'Get in line with it - body behind, ready to cushion!'",
      "CUSHION, DON'T STAB → Say: 'Soft feet, like the ball is landing on a pillow!'",
      "FIRST TOUCH AWAY FROM PRESSURE → Say: 'Touch it into space, not stuck right at your feet!'",
      "CHECK YOUR SHOULDER EARLY → Say: 'Look before it arrives - know what you'll do with your touch!'",
    ],
    questionsToAsk: [
      "'Where should your first touch go?' → Looking for: into open space inside the box, away from where a defender would be",
      "'How do you prepare your body before the ball arrives?' → Looking for: checking shoulder, opening body, getting on toes",
      "'Why does a stiff leg make the ball bounce away?' → Looking for: no give/cushion means the ball's pace transfers straight back out",
      "'What would happen if you didn't move your feet before the pass arrived?' → Looking for: you'd be flat-footed and slow to react",
    ],
    commonMistakes: [
      "STIFF LEG ON RECEPTION → Say: 'Relax that ankle and knee - let it give a little to cushion the ball!'",
      "LETTING BALL BOUNCE TOO HIGH → Say: 'Get low and get there early - meet the ball, don't wait for it!'",
      "STANDING STILL AND FLAT-FOOTED → Say: 'Stay on your toes, ready to move any direction!'",
      "NOT CHECKING SHOULDER FIRST → Say: 'Peek before it arrives - know where you're touching it before the ball gets there!'",
    ],
    variations: [
      {
        name: "Smaller Box",
        description:
          "Shrink to a 2x2 pace box, demanding a tighter, more precise first touch with less room for error.",
        difficulty: "advanced",
      },
      {
        name: "Air Balls",
        description:
          "Servers throw or chip balls into the air instead of rolling passes, adding a bouncing/aerial cushioning challenge.",
        difficulty: "advanced",
      },
      {
        name: "Two-Touch Finish",
        description:
          "After controlling with touch one, receiver must play a clean second touch to a named server - links first touch to a purposeful next action.",
        difficulty: "intermediate",
      },
      {
        name: "Passive Pressure",
        description:
          "One server stands just outside the box as a light passive defender, so the receiver must also decide which direction to open their body to shield the ball.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Ball constantly bouncing out of the box\n• Stiff-legged, flinching touches\n• Standing flat-footed, not moving to the ball\n\nSOLUTIONS:\n• Enlarge the box to 4x4 or 5x5 paces\n• Servers use slower, softer passes\n• Reduce servers to 2-3 angles instead of a full perimeter\n• Coach demos the cushioning touch again up close, 1-on-1",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Consistently keeping the ball in the box with a calm first touch\n• Opening their body toward space before the ball arrives\n• Asking for more challenge\n\nSOLUTIONS:\n• Shrink to the Smaller Box variation\n• Add Air Balls for aerial control\n• Add Passive Pressure from one server\n• Require a purposeful second touch (Two-Touch Finish)",
    equipmentNeeded: ["4 cones per box", "1 ball"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["first touch", "receiving", "control", "technique"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "A receiver in a small box must control passes from servers at different angles with a cushioned first touch that stays inside the box.",
        keyPhrases: [
          "Soft feet, like a pillow!",
          "Body behind the ball, ready to cushion!",
          "Check your shoulder before it arrives!",
        ],
        setupDiagram:
          "3x3 pace box, one receiver inside, servers spread around the perimeter at different angles",
        quickProgression: {
          easier: "Bigger box, softer passes, fewer server angles",
          harder: "Smaller box, air balls, passive pressure, two-touch requirement",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a clear 3x3 pace box with 4 cones",
            "Position servers around the full perimeter for varied angles",
            "Plan rotation order so every player gets receiver reps",
            "Have a demo ready showing cushioned vs. stiff-leg touches side by side",
          ],
          mindset:
            "This is about quality of touch, not quantity of passes. Slow the pace down if touches are sloppy - a good first touch under control matters more than rushing through reps. Rotate frequently so nobody gets stuck as a server the whole time.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Beside the box",
            script:
              "Explain receiver and server roles. Demo a cushioned touch. 'Soft feet, like the ball is landing on a pillow.'",
            anticipatedResponses: {
              "What if the ball bounces out?":
                "No worries - that's how we learn! Reset and try again.",
              "Can I use any part of my foot?":
                "Try the inside of your foot first - it gives you the most control.",
            },
          },
          {
            phase: "Round 1 - Receiver 1",
            duration: "90 seconds",
            coachPosition: "Just outside the box",
            script:
              "First receiver in. Servers pass from varied angles. Coach cues 'soft touch' and 'check your shoulder.' Count points against, rotate after 8-10 passes.",
            troubleshooting: {
              "Ball bouncing out often": [
                "Slow server pace and shrink the passing distance temporarily",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "Beside the box, everyone watching",
            script:
              "Demo stiff-leg touch vs. cushioned touch. 'See how my leg gave with the ball? That absorbs the pace.'",
          },
          {
            phase: "Round 2 - Rotate Through Receivers",
            duration: "3-4 minutes",
            coachPosition: "Moving around the box",
            script:
              "Rotate receivers every 8-10 passes so everyone gets reps. Give individual feedback on body position and touch quality.",
          },
          {
            phase: "Challenge Round",
            duration: "2 minutes",
            coachPosition: "Beside the box",
            script:
              "Servers add pace. Receiver stays calm and composed. Celebrate controlled touches under the extra speed.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Beside the box",
            script:
              "ASK: 'What helped you keep the ball in the box?' Connect to the first touch being the most important touch in soccer. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Ball never leaves the box regardless of pass speed",
              "Receiver looks bored, not challenged",
              "Perfect control on every touch",
            ],
            solutions: [
              "Shrink to Smaller Box",
              "Add Air Balls",
              "Add Passive Pressure",
              "Require a controlled second touch out",
            ],
          },
          tooHard: {
            symptoms: [
              "Ball leaves the box on nearly every pass",
              "Visible frustration or flinching",
              "Receiver avoiding eye contact with incoming passes",
            ],
            solutions: [
              "Enlarge the box",
              "Slow down server pace",
              "Reduce to 2-3 server angles",
              "1-on-1 demo repetition with the coach",
            ],
          },
        },
        playerBehavior: {
          serversRushingPasses: {
            symptoms: ["Passes too hard or too fast for the group's level"],
            approach:
              "SAY: 'Match your pass speed to what your receiver can handle - we're building control, not testing power.'",
          },
          receiverFlinching: {
            symptoms: ["Pulling leg away from the ball", "Closing eyes on contact"],
            approach:
              "SAY: 'Watch it all the way onto your foot - it won't hurt, I promise! Let's slow it down and try again.'",
          },
        },
        environmentalIssues: {
          multipleBoxesInterfering: {
            symptoms: ["Balls from one box rolling into another"],
            solution: "Space boxes at least 5-6 paces apart, or stagger activity timing between groups.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Receiving / First Touch",
            domain: "technical",
            howItDevelops:
              "Repeated reception from varied angles under a constraint (stay in the box) forces players to cushion the ball and control its pace rather than just stopping it under their feet.",
            levelIndicators: {
              1: "Ball bounces off foot or out of the box on most touches",
              2: "Can control the ball but it stays trapped directly underfoot",
              3: "Controls ball into open space within the box; body opens toward play",
              4: "First touch sets up an immediate next action even under varied pace/angle",
              5: "Creative, disguised first touch; controls air balls and pressure equally well",
            },
            assessmentNotes:
              "Watch whether the receiver checks their shoulder before the ball arrives, and whether the touch moves the ball into space rather than stopping it dead.",
          },
        ],
        secondarySkills: [
          {
            skill: "Finding Space",
            domain: "tactical",
            howItDevelops:
              "Deciding where inside the small box to direct the first touch mirrors finding the best space to receive in a real game.",
          },
          {
            skill: "Confidence",
            domain: "psychological",
            howItDevelops:
              "Successfully controlling passes from multiple angles under a visible constraint (the box) builds trust in one's own first touch.",
          },
        ],
        physicalDevelopment: {
          coordination: "Foot-eye coordination adjusting to varied pass speed and angle",
          balance: "Staying balanced on toes, ready to move and cushion in any direction",
        },
        psychologicalDevelopment: {
          composure: "Staying calm and controlled even as pace and pressure increase",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "First Touch Box isolates receiving technique from everything else - no dribbling, no shooting, just repeated reps of cushioning a ball under varied angle and pace. The small box gives instant, visible feedback: did the ball stay in or roll out? That immediate feedback loop accelerates learning the most important touch in soccer.",
        whenToUseIt: {
          idealFor: [
            "Technical block after a dribbling-focused warm-up",
            "Introducing or reinforcing first-touch fundamentals",
            "Small groups where every player needs frequent receiver reps",
          ],
          avoidWhen: [
            "Players haven't yet built basic passing technique among the servers (weak passes make the drill hard to run)",
            "Very large groups without room for multiple boxes",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Passing Pairs",
              reason: "Builds the passing technique the servers rely on in this activity",
            },
          ],
          after: [
            {
              activity: "Turn and Face",
              reason: "Adds turning and attacking after the first touch, building on control developed here",
            },
            {
              activity: "Receiving Under Pressure",
              reason: "Introduces a live defender to the receiving skill built in the box",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Keep the box large and passes gentle; celebrate any successful controlled touch.",
            keyPhrases: [
              "Soft, soft feet - like a pillow!",
              "Nice catch with your foot!",
              "You kept it in - great job!",
            ],
            avoidSaying: ["That went out again", "You need to be better at this"],
            duration: "6-7 minutes",
            simplifications: [
              "Larger box (5x5 paces)",
              "Slow, rolling passes only",
              "Fewer server angles (2-3)",
            ],
          },
          ages9to11: {
            approach: "Introduce the point-against system and rotate briskly through receivers.",
            keyPhrases: [
              "Check your shoulder before it arrives!",
              "Where's the open space in the box?",
              "Great cushion on that one!",
            ],
            challenges: [
              "Full perimeter of servers",
              "Slightly faster pace passes",
              "Two-Touch Finish variation",
            ],
            duration: "10 minutes",
          },
          ages12to14: {
            approach: "Add pressure and speed; connect explicitly to receiving under a marker in games.",
            keyPhrases: [
              "How does this first touch set up your next move?",
              "Stay composed even with someone close!",
            ],
            challenges: [
              "Smaller Box variation",
              "Air Balls variation",
              "Passive Pressure variation",
            ],
            coachRole: "Facilitate discussion linking first touch quality to tempo of play",
          },
        },
        commonMisconceptions: {
          "The first touch should just stop the ball":
            "A great first touch moves the ball into useful space for the next action, not just dead at the receiver's feet.",
          "This only matters for skilled/older players":
            "First touch quality is foundational at every age - poor first touch is the single biggest cause of turnovers in youth games.",
        },
      },
      parentCommunication: {
        ifAsked:
          "First Touch Box has your child receive passes from different angles inside a small square, and their first touch has to keep the ball inside it. It's training the single most important touch in soccer - the one that sets up everything that happens next.",
        newsletter:
          "This week: First Touch Box! One player stood in a small square while teammates passed in from all around - the challenge was to control every pass with a soft, cushioned first touch that stayed inside the box. You can recreate this at home against a wall: cushion the return pass so it doesn't bounce away!",
        whatToWatchFor: [
          "Does your child's touch cushion the ball or does it bounce away?",
          "Are they checking over their shoulder before the pass arrives?",
          "Do they stay on their toes, ready to move, or stand flat-footed?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Receiver struck by a server pass from an unexpected angle",
            prevention: "Servers pass one at a time, in a clear rotation, not simultaneously",
            response: "Check for injury; slow the rotation pace",
          },
          {
            risk: "Ankle strain from awkward reaching for a mis-hit pass",
            prevention: "Keep pass pace appropriate to the group's skill level",
            response: "Rest and check for swelling if discomfort is reported",
          },
        ],
        inclusionConsiderations: {
          visionImpairments:
            "Use a brightly colored or audible ball; verbal cue from the server before passing ('coming to your left foot')",
          mobilityDifferences:
            "Enlarge the box and allow the receiver more time between passes",
        },
      },
      coachReflection: {
        afterActivity: [
          "Was the box sized appropriately for this group's skill level?",
          "Did every player get enough receiver reps through rotation?",
          "Were touches cushioned or still stiff/stabbing?",
          "Did servers vary their angles and pace enough to challenge receivers?",
        ],
        forImprovement: [
          "Should the box size change for next session?",
          "Who needs individual reception coaching before the next practice?",
          "Is this group ready for a variation like Air Balls or Passive Pressure?",
        ],
      },
    },
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
    description:
      "A carefully staged progression from seated to running headers, building safe technique - forehead contact, eyes open, firm neck - before ball speed or player movement increases. Designed to match the introduction age for defensive heading and never rush players into contact before technique is solid.",
    sport: "soccer",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["heading-defensive"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per pair (use a size-appropriate, properly inflated ball - lighter/softer for younger or newer players)\n□ Cones to mark pair spots (optional)\n\nSPACE: small - each pair needs roughly a 5x5 pace box\n\nSETUP STEPS\n1. Split into pairs\n2. Partners face each other 5 paces apart, each pair with its own space\n3. One partner is the tosser, the other is the header, to start\n4. Review the 5-stage progression before starting - NEVER skip straight to jumping headers\n\nDIAGRAM\n┌────────────────────────────────┐\n│   ○ (header)      ○ (tosser)   │\n│                                │  5 paces\n│   ○ (header)      ○ (tosser)   │\n└────────────────────────────────┘\n\n○ = player  5 paces between partners  tosser gently underhand-tosses the ball to the header's forehead height",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center, with an assistant or player for demo\n\nSAY: "We\'re going to build heading step by step - we NEVER jump straight to hard headers. Today\'s rule: forehead only, eyes open the whole time, and we go through every stage before moving on."\n\nDEMO: Show forehead contact point, eyes open, neck firm - "watch the ball onto your forehead."\n\nSAY: "Toss gently and UNDERHAND to your partner\'s forehead - never a hard throw!"\n\n\nPHASE 2: STAGE 1 - SIT AND HEAD (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Headers, sit down. Tossers, gently toss so the ball drops right onto their forehead. Headers, meet it with your forehead - eyes open the whole time!"\n\nCoach Position: Walking between pairs\n\nLOOK FOR:\n□ Are eyes staying open through contact?\n□ Is contact on the forehead, not the top of the head?\n□ Is the neck firm, not floppy?\n\nPHRASES TO USE:\n• "Watch it all the way onto your forehead!"\n• "Firm neck - like you\'re saying no with your whole head!"\n• "Nice, eyes open the whole time!"\n\n\nPHASE 3: STAGE 2 - KNEEL AND HEAD (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Up onto your knees now - same technique, just a bit higher!"\n\nRun briefly with the same cues as Stage 1.\n\n\nPHASE 4: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch this."\n\nDEMO: Show top-of-head contact (wobbly, no control) vs. forehead contact with firm neck (controlled, directed). \n\nSAY: "See the difference? Forehead and firm neck - that\'s what gives you control over where the header goes."\n\n\nPHASE 5: STAGE 3 - STAND AND HEAD (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Now standing! Same technique - forehead, eyes open, firm neck. Tossers, keep it gentle and accurate to their forehead height."\n\nCoach moves through pairs with feedback:\n• "Great firm neck on that one!"\n• "Keep those eyes open - I saw them close!"\n\n\nPHASE 6: STAGE 4 - JUMP AND HEAD, IF READY (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nONLY progress here if Stages 1-3 look clean and controlled for this group.\n\nSAY: "If your technique has been solid, let\'s add a small jump - time your jump so you meet the ball at the TOP, not after it drops!"\n\nSAY: "Small jumps only - this is about timing, not power!"\n\n\nPHASE 7: SWITCH ROLES & CHALLENGE (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Switch! Tossers become headers!"\n\nRun through the stages again for the new header, at whatever stage is appropriate for this group.\n\nOptional for advanced/older groups only: brief running jump and head with a longer, gentle toss - forehead technique must still be clean.\n\n\nPHASE 8: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great, careful work today! What part of your head should contact the ball?"\n\nListen for: "Forehead," "Eyes open," "Firm neck"\n\nSAY: "That\'s exactly right - technique first, always. We build power and speed only once that\'s automatic. Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│   ○ (header)      ○ (tosser)   │\n│                                │\n│   ○ (header)      ○ (tosser)   │\n└────────────────────────────────┘",
    coachingPoints: [
      "FOREHEAD, NOT TOP OF HEAD → Say: 'Watch the ball onto your forehead - not the crown of your head!'",
      "EYES OPEN THROUGH CONTACT → Say: 'Keep your eyes open the whole time - watch it all the way in!'",
      "FIRM NECK → Say: 'Firm neck, like you're saying no with your whole head - don't let it wobble!'",
      "MEET THE BALL, DON'T WAIT → Say: 'Go get it - attack the ball, don't let it hit you!'",
    ],
    questionsToAsk: [
      "'What part of your head contacts the ball?' → Looking for: the forehead, not the top or side of the head",
      "'How do you generate power?' → Looking for: firm neck and driving the whole upper body through the ball, not just snapping the neck",
      "'Why do we go through every stage instead of jumping straight to running headers?' → Looking for: technique has to be solid and safe before adding speed or height",
      "'What would happen if your eyes were closed at contact?' → Looking for: you'd mistime it or hit the wrong part of your head",
    ],
    commonMistakes: [
      "CLOSING EYES → Say: 'Eyes open the whole way - I promise it won't hurt if you watch it in!'",
      "USING TOP OF HEAD → Say: 'Forehead, not the top - tilt your chin down slightly to find it!'",
      "NECK TOO LOOSE → Say: 'Firm it up - tighten your neck like you're bracing for it!'",
      "WAITING FOR THE BALL INSTEAD OF MEETING IT → Say: 'Step in and meet it - don't just stand there and let it arrive!'",
    ],
    variations: [
      {
        name: "Target Headers",
        description:
          "Once standing headers are clean and controlled, header directs the ball back through a cone gate to practice accuracy and direction.",
        difficulty: "advanced",
      },
      {
        name: "Defensive Headers",
        description:
          "Header practices heading the ball high and far (as if clearing danger from their own goal), reinforcing the defensive heading technique this activity builds toward.",
        difficulty: "advanced",
      },
      {
        name: "Balloon Warm-Up",
        description:
          "For younger or first-time headers, practice the forehead-contact motion against a balloon before ever using a real ball - removes any fear of impact while technique is learned.",
        difficulty: "beginner",
      },
      {
        name: "Partner Count Challenge",
        description:
          "Once technique is solid at the standing stage, partners count how many clean, forehead-contact headers they can complete in a row without ball loss - keeps focus on control rather than power.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Flinching or closing eyes before contact\n• Contact on top of head or off-center\n• Visible fear or reluctance to attempt headers\n\nSOLUTIONS:\n• Stay at the seated or kneeling stage longer - do not progress until technique is clean\n• Use a lighter/softer ball, or the Balloon Warm-Up variation with no ball contact at all\n• Tosser stands closer and tosses even more gently\n• Never force a header - let a hesitant player toss only, and reintroduce heading gradually across future sessions",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Clean forehead contact, eyes open, firm neck at the standing stage\n• Comfortable and confident, asking to try more\n• Coach has directly observed correct technique repeatedly, not just once\n\nSOLUTIONS:\n• Progress to the jump-and-head stage, with a strict focus on timing the jump to meet the ball at its highest point\n• Add Target Headers for directional accuracy\n• Add Defensive Headers for the high-and-far clearing technique\n• Only for older, technically ready groups: a brief, gentle running jump and head",
    equipmentNeeded: ["1 ball per pair"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["development"],
    tags: ["heading", "technique", "aerial"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "A staged progression from seated to standing (and, only when ready, jumping) headers that builds safe forehead-contact technique before adding speed or height.",
        keyPhrases: [
          "Forehead, not the top of your head!",
          "Eyes open the whole time!",
          "Firm neck - like saying no with your whole head!",
        ],
        setupDiagram:
          "Pairs 5 paces apart, one tosser and one header, each pair with its own small space",
        quickProgression: {
          easier: "Stay at seated/kneeling stage, softer ball, or Balloon Warm-Up with no ball contact",
          harder: "Progress to jump-and-head only once standing technique is clean, then add Target/Defensive Headers",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Confirm the ball is appropriately sized and inflated for the age group",
            "Pair players and space them 5 paces apart in their own area",
            "Decide in advance how far this group is likely ready to progress today (many groups should stop before jumping headers)",
            "Have a demo partner ready to show forehead vs. top-of-head contact",
          ],
          mindset:
            "This is a technique-first, safety-first activity - never let enthusiasm push the group past a stage where technique isn't yet clean and controlled. It is completely fine, and often correct, to spend the whole session at the seated and kneeling stages. Repeat 'forehead, eyes open, firm neck' constantly - these three cues are the whole activity.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center, with a demo partner",
            script:
              "Demo forehead contact, eyes open, firm neck. 'We never jump straight to hard headers - toss gently, underhand, to the forehead.'",
            anticipatedResponses: {
              "Does this hurt?":
                "Not with good technique - forehead and firm neck, and it's just a gentle toss to start.",
              "Can we skip to jumping?":
                "Not yet - we earn each stage by showing clean technique first!",
            },
          },
          {
            phase: "Stage 1 - Sit and Head",
            duration: "90 seconds",
            coachPosition: "Walking between pairs",
            script:
              "Headers seated, tossers gently drop the ball to forehead height. Coach cues eyes open and firm neck throughout.",
            troubleshooting: {
              "Player flinching or turning away": [
                "Pause, reassure, and consider the Balloon Warm-Up variation instead of a real ball",
              ],
              "Tosses too hard or inaccurate": [
                "Coach demos a proper gentle underhand toss and has the tosser mirror it",
              ],
            },
          },
          {
            phase: "Stage 2 - Kneel and Head",
            duration: "60 seconds",
            coachPosition: "Walking between pairs",
            script: "Same technique from kneeling. Reinforce the same three cues.",
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "Center, everyone watching",
            script:
              "Demo top-of-head contact (wobbly, uncontrolled) vs. forehead with firm neck (controlled). 'That's what gives you control over where it goes.'",
          },
          {
            phase: "Stage 3 - Stand and Head",
            duration: "90 seconds",
            coachPosition: "Moving through pairs",
            script:
              "Standing headers with the same technique. Individual feedback on neck firmness and eye contact through the header.",
          },
          {
            phase: "Stage 4 - Jump and Head (if ready)",
            duration: "90 seconds",
            coachPosition: "Moving through pairs, closely observing",
            script:
              "Only for pairs with clean standing technique. Small jumps, timed to meet the ball at its highest point. 'This is about timing, not power.'",
            troubleshooting: {
              "Technique breaking down under the jump": [
                "Drop that pair back to the standing stage for the rest of the session",
              ],
            },
          },
          {
            phase: "Switch Roles & Challenge",
            duration: "60 seconds",
            coachPosition: "Roaming",
            script:
              "Switch tosser and header. Repeat the appropriate stage for the new header. Optional brief running header only for advanced, technically clean groups.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What part of your head contacts the ball?' Reinforce technique-first mindset. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Clean forehead contact at every stage with no hesitation",
              "Confident, controlled jump-and-head technique",
              "Asking for more challenge",
            ],
            solutions: [
              "Add Target Headers for accuracy",
              "Add Defensive Headers for power and distance",
              "Progress to a brief, gentle running header for older/ready groups only",
            ],
          },
          tooHard: {
            symptoms: [
              "Flinching, eyes closing, or turning away from the ball",
              "Off-center or top-of-head contact repeatedly",
              "Visible reluctance or anxiety",
            ],
            solutions: [
              "Drop back a stage (or all the way to Balloon Warm-Up)",
              "Use a softer/lighter ball",
              "Slow the toss and shorten the distance",
              "Never force it - let a hesitant player toss only today",
            ],
          },
        },
        playerBehavior: {
          rushingStages: {
            symptoms: ["Players asking to skip ahead to jumping/running headers"],
            approach:
              "SAY: 'We earn each stage - once your seated and standing technique is clean every time, we move on.' Hold the line on progression.",
          },
          fearOfContact: {
            symptoms: ["Turning head away", "Using hands instead", "Refusing to attempt"],
            approach:
              "SAY: 'No pressure - let's try the balloon first, or you can toss for your partner today.' Never force a header; reintroduce gradually over future sessions.",
          },
        },
        environmentalIssues: {
          overinflatedOrHeavyBall: {
            symptoms: ["Players wincing on contact", "Reluctance to head the ball"],
            solution: "Use a properly inflated, age-appropriate size ball; switch to a lighter ball if available.",
          },
          crowdedPairs: {
            symptoms: ["Balls from neighboring pairs interfering"],
            solution: "Space pairs at least 2-3 paces apart from each other.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Heading - Defensive",
            domain: "technical",
            howItDevelops:
              "The staged progression builds forehead contact, open eyes, and neck firmness in a low-risk, low-speed environment before ever adding jump timing or game speed - directly building toward safely clearing a ball away from danger.",
            levelIndicators: {
              1: "Afraid of ball, closes eyes",
              2: "Makes contact but poor direction/power",
              3: "Consistent contact, can direct header",
              4: "Good power and direction, wins aerial duels",
              5: "Dominant in the air, heads to teammates",
            },
            assessmentNotes:
              "Watch eye behavior at the moment of contact and whether the header times a jump to meet the ball at its highest point rather than waiting for it to drop - these predict readiness for the next stage better than raw confidence does.",
          },
        ],
        secondarySkills: [
          {
            skill: "Confidence",
            domain: "psychological",
            howItDevelops:
              "Succeeding at each low-pressure stage before advancing builds genuine confidence in heading rather than forced bravado around a skill many players are initially nervous about.",
          },
        ],
        physicalDevelopment: {
          coordination: "Timing head-to-ball contact and, at later stages, timing a jump to meet the ball",
          balance: "Maintaining balance on landing after jump headers",
        },
        psychologicalDevelopment: {
          courage: "Building comfort with heading gradually rather than through forced exposure",
          patience: "Learning that mastering a stage comes before earning the next one",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Heading Progression exists to slow down a skill that's easy to rush and easy to get wrong. Heading is a technical, aerial skill with real safety considerations, and this activity's entire structure - seated, then kneeling, then standing, and only then jumping - is designed to build correct forehead-contact technique at low speed before any element of pace, height, or contact risk is added. It matches the recommended introduction age for defensive heading and should never be compressed to save time.",
        whenToUseIt: {
          idealFor: [
            "First formal introduction to heading technique",
            "Technical block with a group that has the appropriate introduction age and readiness for heading",
            "Refreshing/reinforcing technique before a season begins",
          ],
          avoidWhen: [
            "Group is below the appropriate introduction age for heading - use the Balloon Warm-Up variation or skip heading entirely for younger groups",
            "Any player reports recent head injury or concussion symptoms - exclude them from all heading that session",
            "Balls are overinflated, oversized, or otherwise not appropriately sized for the group",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Ball Mastery Circle",
              reason: "Builds general ball comfort and body control before introducing head contact",
            },
          ],
          after: [
            {
              activity: "Crossing and Finishing",
              reason: "Applies aerial technique to a game-like crossing and attacking header context",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Heading is not typically introduced at this age - the technique and safety demands are beyond most 6-8 year-olds' readiness. Where a version of this activity is used, keep it entirely no-contact: teach the concept (forehead, eyes open) using a balloon or very light foam ball, purely as familiarization, not a heading drill.",
            keyPhrases: [
              "You'll learn real heading when you're a bit older!",
              "Let's practice with the balloon - watch it onto your forehead!",
              "Great watching - eyes open the whole time!",
            ],
            avoidSaying: ["Head it hard", "Everyone needs to head the ball today"],
            duration: "3-5 minutes, Balloon Warm-Up only",
            simplifications: [
              "Balloon or very light foam ball only - no real ball contact",
              "No jumping or standing headers",
              "Frame entirely as a future skill they're getting a preview of",
            ],
          },
          ages9to11: {
            approach:
              "This is close to the recommended introduction age for defensive heading (typically around 11) - move through the seated, kneeling, and standing stages carefully and patiently. Most groups at this age should stay at or below the standing stage; only progress to jump-and-head for players who are clearly ready and have shown clean technique repeatedly.",
            keyPhrases: [
              "Forehead, eyes open, firm neck - every single time!",
              "We earn the next stage by showing clean technique!",
              "No rush - this is about doing it right!",
            ],
            challenges: [
              "Standing headers with consistent technique",
              "Jump-and-head only for clearly ready players",
            ],
            duration: "8-10 minutes",
          },
          ages12to14: {
            approach:
              "Full progression is appropriate, including jump and light running headers, once technique is confirmed. Connect explicitly to using headers to defend or attack in games.",
            keyPhrases: [
              "Time your jump to meet it at the top!",
              "How would you use this to clear danger in a real game?",
            ],
            challenges: [
              "Target Headers for accuracy",
              "Defensive Headers for power and distance",
              "Brief running headers for technically clean players",
            ],
            coachRole: "Facilitate discussion on when and why to head the ball in game situations",
          },
        },
        commonMisconceptions: {
          "Heading is just about being brave enough to do it":
            "Heading is a technical skill built on correct forehead contact and timing - courage without technique leads to poor contact and unnecessary risk.",
          "More power always means a better header":
            "Control and correct technique matter more than power, especially for younger and newer players - direction and timing come before force.",
          "Every player should progress through all 5 stages in one session":
            "Many groups, especially younger or first-time headers, should stay at the seated, kneeling, or standing stage for multiple sessions before ever adding a jump.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Heading Progression is a slow, staged introduction to heading technique - we start seated with gentle tosses and only add standing, and eventually jumping, once your child shows correct forehead contact, open eyes, and a firm neck every time. We never rush this skill, and younger or first-time headers may stay at the early, no-jump stages for a while - that's expected and correct.",
        newsletter:
          "This week (for our older groups): Heading Progression. We build heading technique in careful stages - seated, kneeling, standing, and only then jumping - always with a gentle, controlled toss and a focus on forehead contact, open eyes, and a firm neck. Younger groups are not doing live heading yet; we introduce this skill at the age-appropriate stage.",
        whatToWatchFor: [
          "Does your child keep their eyes open through contact, or do they flinch/close their eyes?",
          "Are they making contact with their forehead, not the top of their head?",
          "Do they seem comfortable and confident, or hesitant - and are we respecting that pace?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Incorrect technique (top-of-head contact, closed eyes) increasing discomfort or injury risk",
            prevention: "Strict stage-by-stage progression; never advance a player whose technique isn't clean",
            response: "Stop, re-demo technique 1-on-1, drop back a stage",
          },
          {
            risk: "Heading introduced before appropriate readiness or age",
            prevention: "Follow the introduction-age guidance; use no-contact alternatives (Balloon Warm-Up) for younger groups",
            response: "Substitute a non-heading variation for that player or group",
          },
          {
            risk: "Head/neck strain from a ball that is overinflated, oversized, or thrown too hard",
            prevention: "Use a properly sized, correctly inflated ball; tossers always use a gentle underhand toss",
            response: "Stop and reset the toss technique; check the player for discomfort",
          },
          {
            risk: "Undisclosed recent head injury",
            prevention: "Ask before the session if anyone has had a recent head knock or concussion",
            response: "Exclude that player from heading for the session; refer to standard concussion protocol",
          },
        ],
        inclusionConsiderations: {
          concussionHistoryOrMedicalConcerns:
            "Any player with a recent head injury, concussion history, or parent/guardian request should be excluded from live heading and given a non-contact role (tosser, or the Balloon Warm-Up alternative)",
          anxietyAroundContact:
            "Never force a hesitant player to head a ball; let them toss and progress at their own pace across future sessions",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did every player show clean forehead contact before progressing to the next stage?",
          "Did I hold the line on not rushing to jumping/running headers?",
          "Were any players hesitant, and did I respect that pace without pressure?",
          "Was the ball appropriately sized and inflated for this group?",
        ],
        forImprovement: [
          "Which players need more seated/standing reps before their next heading session?",
          "Should I check in with parents about any player's comfort level with heading?",
          "Is this group ready for Target Headers or Defensive Headers next time?",
        ],
      },
    },
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
      "EQUIPMENT CHECKLIST\n□ 1 ball per team\n□ 12-16 cones (6-8 per lane, 2 paces apart)\n□ Pinnies to mark teams (optional)\n□ 1 spare ball per lane (in case one goes flat or rolls off)\n\nSPACE: 20x8 paces per lane (two or more lanes, at least 8 paces apart so lanes don't cross)\n\nSETUP STEPS\n1. Split players into teams of 4-6\n2. Set up one zigzag lane per team - 6-8 cones, 2 paces apart\n3. Place a start/tag cone at the near end of each lane\n4. Line each team up single file behind their lane's start cone\n5. Give the first dribbler on each team a ball\n\nDIAGRAM\n┌──────────────────────────────────────┐\n│ Team A                                │\n│ ○○○○  ▲  ▲  ▲  ▲  ▲  ▲                │  8 paces\n│                                        │\n│ Team B                                │\n│ ○○○○  ▲  ▲  ▲  ▲  ▲  ▲                │\n└──────────────────────────────────────┘\n        20 paces (zigzag lane, cones 2 paces apart)\n\n○ = waiting teammates, ▲ = cone, ball starts with front player",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Between the two lanes, visible to both teams\n\nSAY: "Line up behind your team\'s cones! First person has the ball. When I say go, dribble through every cone, then sprint the ball straight back and tag the next player\'s hand!"\n\nDEMO: Walk the zigzag slowly, touching the ball at every cone with inside and outside of the foot.\n\nSAY: "The ball has to go through every gap - no skipping cones! Tag hands - don\'t throw the ball!"\n\n\nPHASE 2: PRACTICE RUN & TEACHING MOMENT (105 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone gets one practice run - no racing yet. Just find your rhythm with the cones."\n\nCoach Position: Walking the lanes, one at a time\n\nWATCH FOR:\n□ Are they using both feet or just their strong foot?\n□ Is the ball staying within a step of them at each cone?\n□ Are they slowing all the way to a stop, or keeping some pace?\n\nPHRASES TO USE:\n• "Small touches through the cones!"\n• "A little speed is okay - just stay in control!"\n• "Nice - you used your other foot there!"\n\nGather everyone at the last cone: "Watch this." DEMO: small, tight touches between cones, then one bigger touch with the outside of the foot to push into the open space after the last cone.\n\nSAY: "Small touches in the tight spots. Bigger touches once you\'re clear. That\'s how you go fast AND stay in control."\n\n\nPHASE 3: ROUND 1 - RELAY RACE (2-3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Now we race! Same rules - every cone gap, tag the next hand. Ready... GO!"\n\nCoach Position: At the finish/tag line, calling out both lanes\n\nWATCH FOR: Ball getting kicked too far ahead at cones; players cutting corners instead of weaving through\n\nPHRASES TO USE:\n• "Slow down through the cones, speed up after!"\n• "Great tag - go go go!"\n• "Cheer your teammate home!"\n\nEnd when both teams finish: "Great effort both teams! Reset and go again."\n\n\nPHASE 4: ROUND 2 - SKILL MOVE RELAY (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This time, at the very last cone, do one skill move - a step-over or a cut - before you sprint home!"\n\nCoach Position: Near the last cone in each lane\n\nPHRASES TO USE:\n• "Nice move - now go!"\n• "Doesn\'t have to be fancy - just controlled!"\n\n\nPHASE 5: CHALLENGE ROUND - WEAK FOOT (1-2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Final round - only your weak foot touches the ball through the cones! This is hard - it\'s okay to slow way down."\n\nCoach Position: Roaming between lanes\n\nPHRASES TO USE:\n• "Slower is fine - just control it with that foot!"\n• "That\'s a tough skill - nice effort!"\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "What helped you go fast AND keep the ball close?"\n\nListen for: "small touches," "using both feet," "looking ahead"\n\nSAY: "Exactly - close control lets you actually use your speed. Water break!"',
    diagram:
      "┌──────────────────────────────────────┐\n│ Team A                                │\n│ ○○○○  ▲  ▲  ▲  ▲  ▲  ▲                │\n│                                        │\n│ Team B                                │\n│ ○○○○  ▲  ▲  ▲  ▲  ▲  ▲                │\n└──────────────────────────────────────┘\n        20 paces (zigzag lane, cones 2 paces apart)",
    coachingPoints: [
      "CLOSE CONTROL THROUGH CONES → Say: 'Small touches - keep the ball close through the tight spots!'",
      "ACCELERATE IN THE OPEN → Say: 'Once you're clear of the last cone, push it out and sprint!'",
      "USE BOTH FEET → Say: 'Try the outside of your foot on that side, inside coming back!'",
      "HEAD UP WHEN YOU CAN → Say: 'Quick glances at your teammate waiting to tag - not just down at the ball!'",
    ],
    questionsToAsk: [
      "'How do you go faster without losing the ball?' → Looking for: smaller touches near cones, bigger touches in open space",
      "'What part of your foot works best for speed?' → Outside of the foot for longer touches in open ground",
      "'What happened when you rushed through the cones?' → Looking for: they notice the ball got away from them",
      "'How does cheering for your teammate help the team?' → Builds effort and belonging, not just individual speed",
    ],
    commonMistakes: [
      "BALL TOO FAR AHEAD → Say: 'Bring it back close - the ball should never get more than a step away!'",
      "SLOWING TO A CRAWL AT EVERY CONE → Say: 'You can keep some speed - just shorten your touches!'",
      "CUTTING CONES INSTEAD OF WEAVING → Say: 'Ball has to go through every gap - no shortcuts!'",
      "THROWING THE BALL TO THE NEXT PLAYER → Say: 'Hand tag only - the ball stays with the runner!'",
    ],
    variations: [
      {
        name: "Weak Foot Only",
        description:
          "Must use non-dominant foot for the entire lane. Slower is expected - reward control over speed.",
        difficulty: "intermediate",
      },
      {
        name: "Skill Move Required",
        description:
          "Must complete a step-over, cut, or scissor at the final cone before sprinting home.",
        difficulty: "intermediate",
      },
      {
        name: "Called Technique",
        description:
          "Coach calls out 'inside foot!' or 'outside foot!' mid-run and players must switch immediately, without stopping the ball.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Ball rolling away at almost every cone\n• Walking instead of dribbling\n• Team frustration building during slow runs\n• Running around cones instead of weaving through\n\nSOLUTIONS:\n• Widen cone spacing to 3 paces\n• Shorten the lane to 4-5 cones\n• Allow a 'reset touch' if the ball gets away\n• Run one technique-only round with no racing\n• Pair a stronger dribbler with a struggling one for a combined run",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Ball always within a step, even at speed\n• Racing without slowing dramatically at cones\n• Asking to go again or race a friend\n\nSOLUTIONS:\n• Narrow cone spacing to 1.5 paces\n• Add a second lap for each runner\n• Weak foot only for the whole lane\n• Require a specific skill move at a marked cone\n• Add a jogging defender who applies light pressure without tackling",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["dribbling", "speed", "relay", "competition"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Team relay dribbling through a zigzag cone course - builds close control at speed and the discipline to slow down in tight spots and accelerate in open space.",
        keyPhrases: [
          "Small touches through the cones, big touches after!",
          "Keep it close - never more than a step away!",
          "Cheer your teammate home!",
        ],
        setupDiagram:
          "Two or more parallel 20-pace zigzag lanes, 6-8 cones per lane 2 paces apart, teams lined up single file at the start",
        quickProgression: {
          easier: "Wider cone spacing, shorter lane, allow reset touches",
          harder: "Narrower cones, weak foot only, add a required skill move",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up one zigzag lane per team, at least 8 paces apart so lanes don't cross",
            "Count cones needed: 6-8 per lane, 2 paces apart",
            "Split into even teams of 4-6 players",
            "Have a spare ball ready per lane in case one goes flat or rolls off",
          ],
          mindset:
            "This is a technical activity wearing a relay costume - the racing makes it fun, but your job is close control under speed pressure. Praise controlled dribbling over raw speed; a player who finishes third with the ball glued to their feet is doing it right.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Between the two lanes, visible to both teams",
            script:
              "SAY: 'Dribble through every cone, then sprint back and tag the next hand!' Demo the zigzag slowly. 'Ball touches every gap - no skipping!'",
            anticipatedResponses: {
              "Can I just run around the cones?":
                "The ball has to weave through every gap - that's the whole point!",
              "What if I drop the ball?":
                "Grab it, get it back close, and keep going - no penalty for a mistake.",
            },
          },
          {
            phase: "Practice Run & Teaching Moment",
            duration: "105 seconds",
            coachPosition: "Walking the lanes, then gathering both teams at the last cone",
            script:
              "One practice run, no racing. Then demo: small touches between cones, one bigger touch to accelerate after the last cone. 'Small in the tight spots, bigger once you're clear.'",
            troubleshooting: {
              "Everyone racing on the practice run": [
                "Stop and reset: 'This one's for finding your rhythm - no racing yet!'",
              ],
            },
          },
          {
            phase: "Round 1 - Relay Race",
            duration: "2-3 minutes",
            coachPosition: "At the finish/tag line, calling out both lanes",
            script:
              "'Ready... GO!' Call encouragement to both lanes equally. End with a shared cheer regardless of which team finished first.",
            troubleshooting: {
              "Ball flying off at cones": [
                "Slow down through the cones - speed up after!",
              ],
              "Players cutting corners": [
                "Ball has to go through every gap - no shortcuts!",
              ],
            },
          },
          {
            phase: "Round 2 - Skill Move Relay",
            duration: "2 minutes",
            coachPosition: "Near the last cone in each lane",
            script:
              "'One skill move at the last cone before you sprint home!' Praise attempts even if the move is rough.",
          },
          {
            phase: "Challenge Round - Weak Foot",
            duration: "1-2 minutes",
            coachPosition: "Roaming between lanes",
            script:
              "'Only your weak foot touches the ball!' Expect - and normalize - a much slower pace. 'It's okay to slow way down for this one.'",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Between both teams",
            script:
              "ASK: 'What helped you go fast AND keep the ball close?' Connect to games: close control lets you actually use your speed. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Finishing the lane without slowing down at all",
              "Perfect control at full speed",
              "Asking to race again immediately",
            ],
            solutions: [
              "Narrow cone spacing",
              "Weak foot only",
              "Add a required skill move",
              "Add a second lap",
              "Add a light-pressure jogging defender",
            ],
          },
          tooHard: {
            symptoms: [
              "Ball escaping at almost every cone",
              "Walking instead of dribbling",
              "Team members frustrated waiting for slow runs",
            ],
            solutions: [
              "Widen cone spacing",
              "Shorten the lane",
              "Allow reset touches",
              "Run a technique-only round with no racing",
            ],
          },
        },
        playerBehavior: {
          racingReckless: {
            symptoms: [
              "Kicking the ball far ahead and chasing it",
              "Knocking over cones",
              "Ignoring teammates waiting to tag",
            ],
            approach:
              "SAY: 'A fast time with the ball gone doesn't count - control first!' Slow the pace for one round if needed.",
          },
          impatientWaiting: {
            symptoms: [
              "Team members wandering off while waiting to run",
              "Not cheering for the runner",
              "Arguing about turn order",
            ],
            approach:
              "Give waiting players a job: 'Everyone not running is cheering loud for your teammate!'",
          },
        },
        environmentalIssues: {
          wetOrSlickGround: {
            symptoms: ["Players slipping on tight turns near cones"],
            solution: "Widen cone spacing and reduce racing intensity; emphasize control over speed.",
          },
          unevenTeamSizes: {
            symptoms: ["One team finishing rounds much faster or slower"],
            solution: "Rebalance teams, or have a faster team run an extra lap to even out total reps.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling with Speed",
            domain: "Technical",
            howItDevelops:
              "The relay format forces players to find the balance between close control at the cones and pushing pace in open space - the core skill of dribbling at speed in a real game.",
            levelIndicators: {
              1: "Loses the ball at most cones; walks the whole lane",
              2: "Gets through the lane but ball drifts a step or more away",
              3: "Ball stays close through cones; some acceleration after",
              4: "Clear speed change between tight and open sections",
              5: "Full speed with tight control throughout; uses both feet fluidly",
            },
            assessmentNotes:
              "Watch the gap between player and ball at each cone, and whether they actually accelerate once clear of the last cone.",
          },
          {
            skill: "Agility & Coordination",
            domain: "Physical",
            howItDevelops:
              "Rapid, repeated direction changes around cones at increasing speed build footwork coordination and body control.",
            levelIndicators: {
              1: "Stiff, wide turns; stumbles at direction changes",
              2: "Completes turns but slows dramatically each time",
              3: "Smooth turns with minor speed loss",
              4: "Fluid direction changes at near-full speed",
              5: "No visible speed loss through turns; balanced and quick",
            },
            assessmentNotes:
              "Watch footwork and balance through the zigzag, not just ball control.",
          },
        ],
        secondarySkills: [
          {
            skill: "Teamwork",
            domain: "Psychological",
            howItDevelops:
              "Relay format ties individual performance to team outcome, and cheering teammates on builds a shared sense of effort.",
          },
          {
            skill: "Confidence",
            domain: "Psychological",
            howItDevelops:
              "Racing in front of teammates, especially on the weak-foot challenge round, builds comfort performing skills under mild social pressure.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "Most young dribblers default to one speed - either cautious and slow everywhere, or fast and out of control everywhere. Speed Dribbling Relay forces the specific skill of modulating pace: small controlled touches in tight spaces, bigger accelerating touches in the open. The relay format adds fun competitive pressure that mimics the urgency of a real match without adding an opponent yet.",
        whenToUseIt: {
          idealFor: [
            "Mid-practice, after a technical warm-up, before small-sided games",
            "When players have solid dribbling basics but play at one speed",
            "Building team energy and enthusiasm mid-session",
          ],
          avoidWhen: [
            "Very first activity of a session (players need some ball-touch warm-up first)",
            "Group has fewer than 8 players (relay needs real teams)",
            "Slick or wet ground where turning at speed is unsafe",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Gates Dribbling",
              reason: "Builds head-up, controlled dribbling before adding a speed and racing element",
            },
            {
              activity: "Traffic Lights",
              reason: "Introduces controlling the ball at different speeds on command",
            },
          ],
          after: [
            {
              activity: "Inside-Outside Slalom",
              reason: "Adds tighter, more technical cone work once speed control is solid",
            },
            {
              activity: "Dribble Sprints",
              reason: "Isolates pure straight-line speed dribbling without the turning element",
            },
            {
              activity: "Coerver Moves Circuit",
              reason: "Adds specific skill moves at speed, building on the skill-move variation here",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Frame as a fun race with a partner - focus on finishing, not winning",
            keyPhrases: [
              "Can you keep the ball close the WHOLE way?",
              "Cheer for your team!",
              "Great try - go again!",
            ],
            avoidSaying: ["You're too slow", "Your team lost because of you"],
            duration: "6-7 minutes, fewer rounds",
            simplifications: [
              "Wider cone spacing",
              "Shorter lane (4 cones)",
              "Skip the weak-foot challenge round",
            ],
          },
          ages9to11: {
            approach: "Introduce the speed-vs-control tradeoff explicitly, add the skill move round",
            keyPhrases: [
              "Small touches, then big touches - what's the difference?",
              "Beat your own time first, then race",
            ],
            duration: "8-10 minutes, full progression",
            challenges: [
              "Skill move requirement",
              "Weak foot challenge round",
              "Called technique variation",
            ],
          },
          ages12to14: {
            approach:
              "This activity is typically used at younger stages; for older or mixed-ability groups, run it briefly as a technical warm-up with the harder variations layered in immediately",
            keyPhrases: [
              "How does this transfer to breaking away on a counter-attack?",
              "What's your top speed with full control?",
            ],
            duration: "5-6 minutes as a warm-up, move quickly to challenge variations",
            challenges: [
              "Called Technique variation from the start",
              "Add a light-pressure defender",
            ],
          },
        },
        commonMisconceptions: {
          "Faster is always better":
            "Uncontrolled speed that loses the ball is slower in a real game than controlled pace - the relay rewards the balance, not raw sprinting.",
          "This is just a fitness drill":
            "The primary goal is technical: modulating touch size and speed while keeping the ball close, which directly transfers to breaking away with the ball in games.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Speed Dribbling Relay teaches your child to control the ball at different speeds - small touches in tight spaces, bigger touches to accelerate in open ground. It's the skill that lets a player actually use their speed with the ball instead of losing it when they try to go fast.",
        newsletter:
          "This week: Speed Dribbling Relay! Teams raced through zigzag cone courses, tagging teammates relay-style. The coaching focus was 'small touches in the tight spots, bigger touches once you're clear' - the exact skill that lets kids dribble fast without losing the ball. Ask your child to show you their fastest controlled dribble at home!",
        whatToWatchFor: [
          "Does your child slow down through tight spaces and speed up in open ones, or dribble at one speed the whole time?",
          "Can they keep the ball close even when going fast?",
          "Are they starting to use their weaker foot without being asked?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Rolled ankles on sharp turns at speed",
            prevention: "Adequate warm-up beforehand; reasonable cone spacing for the group's skill level",
            response: "Stop the activity, check the player, rest and ice if needed",
          },
          {
            risk: "Collisions between adjacent lanes",
            prevention: "Keep lanes at least 8 paces apart; mark lane boundaries clearly",
            response: "Check both players for injury before resuming",
          },
          {
            risk: "Tripping over cones during the sprint-back",
            prevention: "Keep the tag/return path clear of cones; use low-profile cones",
            response: "Check for injury; adjust the return path if it happens more than once",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow walking the lane instead of running; shorten the lane; pair for a combined run",
          attentionChallenges: "Shorter rounds, clear single-instruction cues, assign a consistent tag partner",
          skillGaps: "Mix stronger and weaker dribblers across teams so no team is consistently last",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players actually changing speed, or dribbling at one pace the whole time?",
          "Did the relay format add energy without causing recklessness?",
          "Was cone spacing appropriate for this group's skill level?",
          "Did every player get roughly equal reps?",
        ],
        forImprovement: [
          "Should lanes be longer or shorter next time?",
          "Which variation got the best mix of effort and control?",
          "Who needs individual work on weak-foot dribbling before the next relay?",
        ],
      },
    },
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
      "EQUIPMENT CHECKLIST\n□ 4 corner cones\n□ Pinnies, 2 colors\n□ 3-4 balls (games restart often early on)\n\nSPACE: 25x20 paces\n\nSETUP STEPS\n1. Mark a 25x20 pace rectangle with a cone at each corner\n2. The two short 20-pace ends are the scoring lines - no goals needed\n3. Split into two teams of 3, different colored pinnies\n4. Each team defends one end line and attacks the other\n5. Start the ball in the center with a coach roll-in\n\nDIAGRAM\n┌────────────────────────────────────┐  ← Team B scores here\n│  ▲                              ▲   │     (dribble across w/ control)\n│                                      │\n│              ●                      │  20 paces\n│                                      │\n│  ▲                              ▲   │\n└────────────────────────────────────┘  ← Team A scores here\n              25 paces\n\n▲ = corner cone, ● = ball start (center)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Sideline, both teams gathered\n\nSAY: "No goals today - you score by dribbling the ball all the way across your opponent\'s end line with control. If it\'s not under control when it crosses, no goal!"\n\nDEMO: Walk a ball across a line, stopping it just past.\n\nSAY: "After a goal, the other team gets the ball and we restart from the middle. Ready? Let\'s go!"\n\n\nPHASE 2: ROUND 1 - FREE PLAY (3-4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Play! Find the space!"\n\nCoach Position: Sideline, moving along the length of the field\n\nWATCH FOR:\n□ Are players spreading across the full width, or bunching in the middle?\n□ Are they dribbling into defenders instead of around them?\n□ Are teams transitioning quickly after a goal or turnover?\n\nPHRASES TO USE:\n• "Use the WHOLE field - side to side!"\n• "Is there a defender there, or is there space?"\n• "Quick restart - go go go!"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and look here."\n\nDEMO: Show a player dribbling straight into a crowd of defenders versus dribbling toward the open side of the field.\n\nSAY: "See how much easier it is to get to the line when there\'s nobody there? Attack the SPACE, not the defender!"\n\n\nPHASE 4: ROUND 2 - APPLY THE LESSON (3-4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same game - this time, really use the width. Find the open side!"\n\nCoach Position: Roaming along the sideline, giving specific feedback\n\nPHRASES TO USE:\n• "Great - you found the open space!"\n• "Could you have passed there instead of dribbling into traffic?"\n• "Nice quick restart!"\n\n\nPHASE 5: CHALLENGE ROUND - WIDE ZONES (2-3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New rule - if you score in the outside third of the line, it\'s worth 2 points! Middle is still 1."\n\nRun the round, tally points out loud to keep energy up.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "What made it easier to get across the line?"\n\nListen for: "Space," "spreading out," "passing instead of dribbling into a crowd"\n\nSAY: "Exactly - finding space and knowing when to pass instead of dribble. That\'s real soccer thinking! Water break!"',
    diagram:
      "┌────────────────────────────────────┐  ← Team B scores here\n│  ▲                              ▲   │\n│                                      │\n│              ●                      │\n│                                      │\n│  ▲                              ▲   │\n└────────────────────────────────────┘  ← Team A scores here\n              25 paces",
    coachingPoints: [
      "USE THE FULL WIDTH → Say: 'Spread out side to side - don't all crowd the middle!'",
      "DRIBBLE VS PASS DECISION → Say: 'Is a defender right there? Then look for a pass instead of dribbling into them!'",
      "ATTACK SPACE, NOT DEFENDERS → Say: 'Run at the open grass, not the player guarding it!'",
      "TRANSITION QUICKLY → Say: 'Ball changes hands - get moving right away, don't wait!'",
    ],
    questionsToAsk: [
      "'Where is the open space?' → Looking for: scanning the width of the field, not just straight ahead",
      "'When should you take on a defender?' → When there's clear space to beat them into, not when they're the only path forward",
      "'How do you create space for teammates?' → Spreading wide pulls defenders away from the middle",
      "'What changed after we added the wide zone bonus?' → Looking for: players noticing they spread out more on their own",
    ],
    commonMistakes: [
      "TOO NARROW - EVERYONE IN THE MIDDLE → Say: 'Spread out! Use the sidelines - that's open space!'",
      "FORCING THROUGH DEFENDERS → Say: 'If they're right there, look for a teammate instead!'",
      "SLOW TRANSITION AFTER A GOAL → Say: 'New ball, new attack - get moving fast!'",
      "STANDING STILL WAITING FOR THE BALL → Say: 'Keep moving to open space so your teammate can find you!'",
    ],
    variations: [
      {
        name: "Wide Zones",
        description:
          "Mark the outer thirds of each end line as bonus zones worth 2 points instead of 1, rewarding width and switching the point of attack.",
        difficulty: "intermediate",
      },
      {
        name: "Must Receive",
        description:
          "A goal only counts if the scorer receives a pass before crossing the line under control (no solo dribble-through goals) - forces at least one pass per attack.",
        difficulty: "intermediate",
      },
      {
        name: "Two-Touch Limit",
        description:
          "Players get a maximum of two touches before they must pass or the ball is turned over - speeds up decision-making and combination play.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• No goals scored in several minutes\n• Everyone bunched in the center chasing the ball\n• Same player dribbling into 3 defenders repeatedly\n• Frustration or players disengaging\n\nSOLUTIONS:\n• Widen the field to give more space to spread out\n• Enlarge the scoring line into a full end zone (a few paces deep) instead of a thin line\n• Reduce to 2v2 temporarily if numbers allow\n• Coach calls out 'Look for the space over there!' during play",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Goals coming easily and often\n• Players naturally spreading to use full width\n• Making passing decisions without prompting\n\nSOLUTIONS:\n• Narrow the field to reduce space\n• Require a pass before the ball can cross the line (Must Receive variation)\n• Add a two-touch limit\n• Play first to a target score for added stakes",
    equipmentNeeded: ["Cones", "Pinnies", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "dribbling", "small-sided", "width"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "3v3 game where you score by dribbling under control across the opponent's end line - no goals needed, and the wide-open field rewards width and smart dribble-vs-pass decisions.",
        keyPhrases: [
          "Use the whole field - side to side!",
          "Attack the space, not the defender!",
          "Quick restart after every goal!",
        ],
        setupDiagram:
          "25x20 pace rectangle, cone at each corner, both short ends are scoring lines, 3v3 teams",
        quickProgression: {
          easier: "Wider field, deeper scoring zone, drop to 2v2",
          harder: "Narrower field, require a pass before scoring, two-touch limit",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a 25x20 pace rectangle with corner cones",
            "Confirm both short ends are clearly the scoring lines",
            "Split into even teams of 3 with different colored pinnies",
            "Have 3-4 balls ready since restarts happen often early on",
          ],
          mindset:
            "Removing the goal changes everything - without a fixed target, players must actually read where the open space is. Your job is to keep pointing at space, not just praising goals. A team that spreads out and moves the ball well but doesn't score yet is doing the skill correctly.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Sideline, both teams gathered",
            script:
              "SAY: 'Dribble the ball under control all the way across the opponent's end line to score - no goals needed!' Demo stopping the ball just past the line. 'Quick restart after every goal!'",
            anticipatedResponses: {
              "What if the ball crosses but I don't have control?":
                "No goal - the ball has to be with you, under control, when it crosses.",
              "Can we pass across the line?":
                "Not in the base game - you have to dribble it across yourself. We'll add passing goals in a later round.",
            },
          },
          {
            phase: "Round 1 - Free Play",
            duration: "3-4 minutes",
            coachPosition: "Sideline, moving along the length of the field",
            script:
              "Let them play with minimal interruption. Call out width and space cues as they arise.",
            troubleshooting: {
              "Everyone crowding the middle": [
                "Spread out! There's open space on the sides!",
              ],
              "One player dribbling into every defender": [
                "Is there a teammate open? Look before you dribble in!",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "Center of the field, both teams gathered",
            script:
              "Demo dribbling into a crowd versus dribbling toward open space. 'Attack the space, not the defender!'",
          },
          {
            phase: "Round 2 - Apply the Lesson",
            duration: "3-4 minutes",
            coachPosition: "Roaming the sideline",
            script:
              "'Really use the width this time!' Give individual feedback on space recognition and pass-vs-dribble choices.",
          },
          {
            phase: "Challenge Round - Wide Zones",
            duration: "2-3 minutes",
            coachPosition: "Sideline, calling out the score",
            script:
              "'Outside third of the line is worth 2 points now!' Keep energy high by announcing scores as they happen.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center, both teams gathered",
            script:
              "ASK: 'What made it easier to get across the line?' Connect to real games: finding space and choosing pass vs. dribble. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Goals scored almost every possession",
              "Defenders never getting close to the ball carrier",
              "Players looking unchallenged or bored",
            ],
            solutions: [
              "Narrow the field",
              "Require a pass before scoring (Must Receive)",
              "Add a two-touch limit",
              "Play to a target score for stakes",
            ],
          },
          tooHard: {
            symptoms: [
              "No goals scored in several minutes",
              "Same player getting stripped of the ball repeatedly",
              "Visible frustration",
            ],
            solutions: [
              "Widen the field",
              "Deepen the scoring line into a zone",
              "Temporarily drop to 2v2",
              "Coach points out open space verbally during play",
            ],
          },
        },
        playerBehavior: {
          ballHogging: {
            symptoms: [
              "Same player dribbling every possession",
              "Teammates standing and watching",
              "Frustration from players not getting touches",
            ],
            approach:
              "SAY: 'Everyone needs the ball this round - if you've scored twice, look to pass this time!' Praise assists as much as goals.",
          },
          bunchingInMiddle: {
            symptoms: [
              "All 6 players clustered in the center of the field",
              "Wide space going completely unused",
            ],
            approach:
              "SAY: 'I see open space on both sides - who's going to use it?' Point out the empty zones out loud.",
          },
        },
        environmentalIssues: {
          unevenFieldSurface: {
            symptoms: ["Ball bouncing unpredictably, affecting first touch"],
            solution: "Shrink the field slightly to the flattest available area, or slow the pace of play.",
          },
          notEnoughSpaceForField: {
            symptoms: ["25x20 paces doesn't fit the available area"],
            solution: "Shrink proportionally (e.g., 18x14 paces) and drop to 2v2 if needed to keep the game open.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "When to Dribble vs Pass",
            domain: "Tactical",
            howItDevelops:
              "With no fixed goal to aim at, players must constantly judge whether dribbling forward or passing to a teammate is the better option based on where defenders and space are.",
            levelIndicators: {
              1: "Always dribbles, regardless of pressure",
              2: "Occasionally passes, usually only when completely stuck",
              3: "Passes under clear pressure; dribbles into open space",
              4: "Reads pressure before it fully arrives and decides early",
              5: "Consistently makes the higher-percentage choice under pressure",
            },
            assessmentNotes:
              "Watch what a player does when a defender closes in - do they force a dribble or look for an outlet?",
          },
          {
            skill: "Finding Space",
            domain: "Tactical",
            howItDevelops:
              "The wide field and lack of a fixed goal reward players who spread out and attack open areas rather than converging on the ball.",
            levelIndicators: {
              1: "Clusters near the ball regardless of position",
              2: "Occasionally moves to open space when reminded",
              3: "Positions in open space without prompting most of the time",
              4: "Actively repositions to create width and depth",
              5: "Constantly adjusts position to stay useful and open",
            },
            assessmentNotes:
              "Watch off-ball movement, not just what the ball carrier does.",
          },
        ],
        secondarySkills: [
          {
            skill: "Support Play",
            domain: "Tactical",
            howItDevelops:
              "Teammates must offer passing options in open space to make the 'when to pass' decision available at all.",
          },
          {
            skill: "Teamwork",
            domain: "Psychological",
            howItDevelops:
              "Scoring requires recognizing and using teammates, not just individual dribbling - reinforces shared success.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "Removing the goal is a small change with a big effect: players can no longer aim at a fixed target, so they have to actually read the game to find where scoring is possible. This makes 3v3 Line Soccer an excellent bridge between individual dribbling and true tactical decision-making about when to dribble and when to pass.",
        whenToUseIt: {
          idealFor: [
            "After dribbling technical work, to apply it in a game context",
            "Introducing the dribble-vs-pass decision for the first time",
            "Small groups (6-12) where a full small-sided game isn't practical",
          ],
          avoidWhen: [
            "Group doesn't yet have basic dribbling control (do technical work first)",
            "Space is too cramped for a 25x20 pace rectangle even scaled down",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Gates Dribbling",
              reason: "Builds purposeful, head-up dribbling before adding opponents and a scoring decision",
            },
            {
              activity: "1v1 to Goal",
              reason: "Introduces the basic 1v1 decision-making this game scales up to 3v3",
            },
          ],
          after: [
            {
              activity: "2v2 with Mini Goals",
              reason: "Adds real goals and tighter combination play once space-finding is solid",
            },
            {
              activity: "4v4 to Small Goals",
              reason: "Scales up numbers and adds more structured attacking patterns",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep it playful - celebrate any goal, don't over-coach the tactics yet",
            keyPhrases: [
              "Can you find the open space?",
              "Great teamwork on that one!",
              "Everybody gets a turn with the ball!",
            ],
            avoidSaying: ["You should have passed there", "That was the wrong choice"],
            duration: "8-9 minutes, mostly free play with light guidance",
            simplifications: [
              "Wider field or deeper scoring zone",
              "Skip the Must Receive and Two-Touch variations",
              "Drop to 2v2 if a team is short",
            ],
          },
          ages9to11: {
            approach: "Name the dribble-vs-pass decision explicitly and reinforce it with the teaching moment",
            keyPhrases: [
              "Is that a dribble or a pass situation?",
              "Where's the open space right now?",
            ],
            duration: "10-12 minutes, full progression including Wide Zones",
            challenges: [
              "Wide Zones bonus scoring",
              "Must Receive variation",
            ],
          },
          ages12to14: {
            approach: "Focus on tactical patterns - switching play, exploiting overloads created by width",
            keyPhrases: [
              "How did spreading wide create the goal?",
              "What patterns is the other team using?",
            ],
            duration: "10-12 minutes, add Two-Touch Limit for tempo",
            challenges: [
              "Two-Touch Limit variation",
              "Play to a target score with a tactical debrief between games",
            ],
          },
        },
        commonMisconceptions: {
          "Without a goal, it's not real soccer practice":
            "Removing the goal isolates the exact decision - dribble or pass - that a fixed goal often lets players skip by just kicking toward it.",
          "Wide Zones just makes it a scoring gimmick":
            "The bonus zones create a real tactical incentive to use the width of the field, which is a core attacking principle in the full game.",
        },
      },
      parentCommunication: {
        ifAsked:
          "3v3 Line Soccer removes the goal - kids score by dribbling the ball under control across the other team's end line. Without a fixed target, they have to actually look for open space and decide whether to dribble or pass, which is exactly the decision-making real games demand.",
        newsletter:
          "This week: 3v3 Line Soccer! No goals - just wide open end lines to dribble across under control. The focus was using the WHOLE field and deciding when to dribble versus pass to a teammate. Ask your child which is usually the smarter choice when a defender is right in front of them!",
        whatToWatchFor: [
          "Does your child spread out to open space, or cluster near the ball?",
          "Are they starting to pass when a defender is in the way instead of forcing a dribble?",
          "Do they restart quickly after a goal, or need reminders?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions near the end lines during close races to score",
            prevention: "Ensure adequate space beyond the end lines to slow down safely",
            response: "Check players involved; remind about controlled stops near boundaries",
          },
          {
            risk: "Ankle rolls on quick direction changes in open space",
            prevention: "Confirm even playing surface before starting; adequate warm-up",
            response: "Rest and assess; ice if needed",
          },
          {
            risk: "Overexertion from constant running in a small, fast-paced game",
            prevention: "Build in the wrap-up water break; watch for signs of fatigue during rounds",
            response: "Substitute or pause the game for a breather",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow a designated 'safe zone' where a player can receive without being closely marked; adjust field size",
          attentionChallenges: "Shorter rounds with frequent restarts already built in; clear, single-cue reminders during play",
          skillGaps: "Mix experience levels across both teams so no team is consistently overwhelmed",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players spreading out to use the width, or clustering in the middle?",
          "Did I see improved dribble-vs-pass decisions between Round 1 and Round 2?",
          "Was the field size appropriate for this group's numbers and skill level?",
          "Did every player get meaningful touches on the ball?",
        ],
        forImprovement: [
          "Should the field be wider or narrower next time?",
          "Which variation created the best decision-making pressure?",
          "Who needs individual reps on recognizing open space before the next game?",
        ],
      },
    },
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
      "EQUIPMENT CHECKLIST\n□ 2 mini goals (pugg goals or 2 cones per goal)\n□ Pinnies, 2 colors\n□ 2-3 balls\n\nSPACE: 20x15 paces\n\nSETUP STEPS\n1. Set up one mini goal at each short end of a 20x15 pace field\n2. Split into pairs (2v2), different colored pinnies\n3. Extra pairs wait on the sideline to rotate in (winners stay on, or round robin)\n4. Start with a kickoff from the center\n\nDIAGRAM\n┌──────────────────────────────────┐\n│      ⊏⊐                          │  15 paces\n│                                    │\n│                    ●               │\n│                                    │\n│                          ⊏⊐        │\n└──────────────────────────────────┘\n              20 paces\n\n⊏⊐ = mini goal, ● = kickoff spot",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Sideline, both pairs gathered\n\nSAY: "2v2, first team to 3 goals! Winners stay on, next pair rotates in. You and your partner have to work together - one of you can\'t do it alone!"\n\nDEMO: Show a quick give-and-go between two coaches or players.\n\nSAY: "When your partner has the ball, don\'t just stand there - give them somewhere to pass! Ready... KICKOFF!"\n\n\nPHASE 2: ROUND 1 - GAMES TO 3 (4-5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Play! First to 3 wins - next pair\'s on deck!"\n\nCoach Position: Sideline, moving to stay level with the ball\n\nWATCH FOR:\n□ Are both players chasing the ball at once?\n□ Is the player without the ball finding space to receive?\n□ Are players talking to each other?\n\nPHRASES TO USE:\n• "Where\'s your support?"\n• "Talk to your partner - call for it!"\n• "Nice - you gave them an option!"\n\nRotate pairs in as games finish.\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch this."\n\nDEMO: Show two players both chasing the ball into a corner (bad), then show one player holding width to give the ball carrier an easy pass (good).\n\nSAY: "See how much easier that is? One of you goes to the ball, the other finds space to help. That\'s support!"\n\n\nPHASE 4: ROUND 2 - APPLY THE LESSON (4-5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same games - this time, remember: one to the ball, one to space!"\n\nCoach Position: Roaming sideline, giving pair-specific feedback\n\nPHRASES TO USE:\n• "Great support run!"\n• "Could you have passed instead of forcing that shot?"\n• "Nice - you two are talking to each other!"\n\n\nPHASE 5: CHALLENGE ROUND - FOUR GOALS (2-3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New rule - each team now has TWO goals to attack! Scan for whichever one is open."\n\nRun the round with two mini goals per end.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "What made it easier to score?"\n\nListen for: "Passing," "supporting," "talking to my partner"\n\nSAY: "Exactly - even in a small game, you\'re never really alone out there. Water break!"',
    diagram:
      "┌──────────────────────────────────┐\n│      ⊏⊐                          │\n│                                    │\n│                    ●               │\n│                                    │\n│                          ⊏⊐        │\n└──────────────────────────────────┘\n              20 paces",
    coachingPoints: [
      "SUPPORT YOUR PARTNER → Say: 'If they've got the ball, find space to give them an option!'",
      "QUICK DECISIONS → Say: 'Shoot, pass, or dribble - decide fast, don't hold it too long!'",
      "TAKE ON 1V1 SITUATIONS → Say: 'If there's space to beat your defender, go for it!'",
      "COMMUNICATE → Say: 'Call for the ball - your partner can't read your mind!'",
    ],
    questionsToAsk: [
      "'When should you pass vs dribble?' → When a defender is committed to you and your partner is open",
      "'How do you help your partner?' → Looking for: moving to open space, not standing still",
      "'What do you do when you don't have the ball?' → Find space, offer a passing option, don't just watch",
      "'What happened when you both went to the ball at once?' → Looking for: they notice it left the goal undefended and no one open to pass to",
    ],
    commonMistakes: [
      "BOTH PLAYERS GOING TO THE BALL → Say: 'One of you goes, one of you gives an option somewhere else!'",
      "NOT SUPPORTING YOUR PARTNER → Say: 'Move to space - give them someone to pass to!'",
      "FORCING SHOTS FROM BAD ANGLES → Say: 'Is there a better angle, or a pass to your partner?'",
      "STANDING STILL OFF THE BALL → Say: 'Keep moving - find the space where you'd help most!'",
    ],
    variations: [
      {
        name: "Four Goals",
        description:
          "Each team defends and attacks two mini goals instead of one, forcing constant scanning for the open target.",
        difficulty: "intermediate",
      },
      {
        name: "Touch Limit",
        description:
          "Maximum 3 touches per player before passing or shooting - speeds up decisions and rewards early support.",
        difficulty: "intermediate",
      },
      {
        name: "3v2 Overload",
        description:
          "One team plays with an extra attacker to practice recognizing and exploiting a numbers-up situation; rotate the extra player between teams.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Both players chasing the ball every time\n• No goals scored in several minutes\n• Partner never receives a pass\n• Frustration or disengagement\n\nSOLUTIONS:\n• Widen the field and enlarge the goals\n• Coach freezes play to point out an open pass\n• Assign roles for a round: one player stays 'home' near the goal, one attacks\n• Allow an extra touch or two before requiring a pass",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Goals coming from combination play, not just individual dribbling\n• Off-ball player consistently finding space\n• Making quick decisions under light pressure\n\nSOLUTIONS:\n• Add the Touch Limit variation\n• Narrow the field to increase pressure\n• Add Four Goals to demand more scanning\n• Play first-to-5 instead of first-to-3 for longer possessions to defend",
    equipmentNeeded: ["Mini goals or cones", "Pinnies", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["game", "2v2", "small-sided", "competition"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Fast-paced 2v2 to mini goals - the smallest number where 'support your partner' actually matters, teaching players they're never alone with the ball.",
        keyPhrases: [
          "One to the ball, one to space!",
          "Talk to your partner!",
          "Quick decision - shoot, pass, or dribble!",
        ],
        setupDiagram:
          "20x15 pace field, one mini goal at each short end, 2v2 with extra pairs rotating in from the sideline",
        quickProgression: {
          easier: "Bigger field and goals, assign a 'home' and 'attacker' role for a round",
          harder: "Touch limit, narrower field, Four Goals variation",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up a 20x15 pace field with a mini goal at each end",
            "Split players into pairs with different colored pinnies",
            "Plan rotation: winners stay on, or a round-robin schedule if more than 4 players",
            "Have 2-3 balls ready near the field",
          ],
          mindset:
            "2v2 is the smallest number of players where support actually changes the game - with just one teammate, players quickly feel the cost of both chasing the ball. Your job is to make 'support' concrete: point at the exact spot the off-ball player should be standing.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Sideline, both pairs gathered",
            script:
              "SAY: 'First to 3 goals wins, winners stay on!' Demo a quick give-and-go. 'Don't just stand there when your partner has it - give them an option!'",
            anticipatedResponses: {
              "What if we lose - do we sit out the whole time?":
                "You rotate right back in for the next game - everyone plays a lot.",
              "Can I just dribble the whole way?":
                "You can try, but watch how much easier it is when your partner helps.",
            },
          },
          {
            phase: "Round 1 - Games to 3",
            duration: "4-5 minutes",
            coachPosition: "Sideline, moving to stay level with the ball",
            script:
              "Let pairs play with light guidance. Prompt off-ball movement and communication as it comes up.",
            troubleshooting: {
              "Both players chasing the ball": [
                "One of you goes to the ball, one of you finds space!",
              ],
              "No one scoring": [
                "Widen the goal or field slightly for that pair if it's a big skill gap",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "Center of the field, all players gathered",
            script:
              "Demo two players both chasing the ball versus one going to the ball while the other holds width. 'One to the ball, one to space!'",
          },
          {
            phase: "Round 2 - Apply the Lesson",
            duration: "4-5 minutes",
            coachPosition: "Roaming sideline",
            script:
              "'Remember - one to the ball, one to space!' Give pair-specific feedback on support runs and communication.",
          },
          {
            phase: "Challenge Round - Four Goals",
            duration: "2-3 minutes",
            coachPosition: "Sideline, calling out both goals",
            script:
              "'Two goals each now - find the open one!' Praise players who scan before committing to a shot.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center, both pairs gathered",
            script:
              "ASK: 'What made it easier to score?' Connect to games: you're never really alone with the ball. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Goals scored on nearly every possession",
              "No real defensive resistance",
              "Pairs looking unchallenged",
            ],
            solutions: [
              "Add Touch Limit",
              "Narrow the field",
              "Add Four Goals to increase decision demands",
              "Play first-to-5 for longer defensive stretches",
            ],
          },
          tooHard: {
            symptoms: [
              "No goals scored across multiple rotations",
              "Same pair dominating every game",
              "Visible frustration from weaker pairs",
            ],
            solutions: [
              "Widen the field and enlarge the goals",
              "Rebalance pairs for skill level",
              "Assign a 'home' and 'attacker' role to simplify decisions",
            ],
          },
        },
        playerBehavior: {
          bothChasingBall: {
            symptoms: [
              "Both teammates converging on the ball at once",
              "Goal left completely open",
              "No passing options ever available",
            ],
            approach:
              "SAY: 'Freeze! Where's your open teammate right now?' Point out the space they should be using.",
          },
          notCommunicating: {
            symptoms: [
              "Players surprised when a pass comes to them",
              "No calling for the ball",
              "Missed connections on easy passes",
            ],
            approach:
              "SAY: 'Call your partner's name when you want the ball!' Model it yourself from the sideline.",
          },
        },
        environmentalIssues: {
          goalsMovingOrTippingOver: {
            symptoms: ["Mini goals shifting position or falling during play"],
            solution: "Use weighted or pugg-style goals if available, or anchor cone goals with extra cones.",
          },
          unevenPairSkill: {
            symptoms: ["One pair winning every single game"],
            solution: "Re-pair players so skill is balanced across all pairs, or add a handicap (must complete 2 passes before shooting) for the stronger pair.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Support Play",
            domain: "Tactical",
            howItDevelops:
              "With only one teammate, the cost of not supporting is immediate and obvious - players quickly learn that moving to open space is what makes their partner's job possible.",
            levelIndicators: {
              1: "Always chases the ball regardless of partner's position",
              2: "Occasionally moves to space, usually by accident",
              3: "Regularly finds space to support the ball carrier",
              4: "Times support runs to arrive exactly when needed",
              5: "Anticipates and creates support angles before they're needed",
            },
            assessmentNotes:
              "Watch the off-ball player, not the ball carrier - are they moving with purpose or standing still?",
          },
          {
            skill: "1v1 Dribbling Moves",
            domain: "Technical",
            howItDevelops:
              "The small field and open space regularly create 1v1 moments where a player must beat a defender individually to create a scoring chance.",
            levelIndicators: {
              1: "Avoids 1v1 situations, always looks to pass immediately",
              2: "Attempts a move but loses the ball most of the time",
              3: "Successfully beats a defender with a basic move sometimes",
              4: "Reads which move fits the defender's positioning",
              5: "Confidently creates and finishes 1v1 opportunities",
            },
            assessmentNotes:
              "Watch decision quality in 1v1 moments - do they know when to take on a defender versus pass?",
          },
        ],
        secondarySkills: [
          {
            skill: "Finding Space",
            domain: "Tactical",
            howItDevelops:
              "The off-ball partner must continuously reposition to stay useful, reinforcing the habit of finding open space.",
          },
          {
            skill: "Teamwork",
            domain: "Psychological",
            howItDevelops:
              "Success is tied directly to one other person - players learn that communicating and cooperating with a partner produces better outcomes than playing alone.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "2v2 is the smallest game format where support play truly matters - in 1v1 there's no partner to support, but in 2v2 every player immediately feels the difference between having help and not. The mini goals keep scoring frequent and fun, and the fast rotation keeps everyone engaged even in a large group.",
        whenToUseIt: {
          idealFor: [
            "After players have basic 1v1 dribbling and passing skills",
            "Introducing the concept of off-ball support for the first time",
            "Large groups needing high-repetition small-sided games with quick rotation",
          ],
          avoidWhen: [
            "Players don't yet have any dribbling or passing basics (build those first)",
            "Space is too small to fit even a compact 20x15 pace field",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "3v3 Line Soccer",
              reason: "Introduces small-sided dribble-vs-pass decisions before adding a scoring target",
            },
            {
              activity: "1v1 to Goal",
              reason: "Builds the individual dribbling foundation this game's 1v1 moments rely on",
            },
          ],
          after: [
            {
              activity: "4v4 to Small Goals",
              reason: "Scales the support-play concept up to a bigger group with more combinations",
            },
            {
              activity: "Positional Rondo",
              reason: "Refines support angles and passing under pressure in a possession-focused format",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep it fun and simple - celebrate goals and passes equally, don't over-explain positioning",
            keyPhrases: [
              "Can you find a space to help your partner?",
              "Great pass!",
              "Everybody scores, everybody helps!",
            ],
            avoidSaying: ["You should have passed", "That was a bad shot"],
            duration: "8-9 minutes, mostly free play",
            simplifications: [
              "Bigger goals and field",
              "Skip Touch Limit and 3v2 Overload variations",
              "Assign simple roles (one stays back, one attacks) if needed",
            ],
          },
          ages9to11: {
            approach: "Name the support concept explicitly and reinforce with the teaching moment",
            keyPhrases: [
              "One to the ball, one to space - whose job is which right now?",
              "What's the fastest way to score - dribble or pass?",
            ],
            duration: "10-12 minutes, full progression including Four Goals",
            challenges: [
              "Four Goals variation",
              "Touch Limit variation",
            ],
          },
          ages12to14: {
            approach: "Focus on quick combination play and reading overloads",
            keyPhrases: [
              "How did that give-and-go create the goal?",
              "What did you see before you made that pass?",
            ],
            duration: "10-12 minutes, add 3v2 Overload for tactical reads",
            challenges: [
              "3v2 Overload variation",
              "Touch Limit for tempo under pressure",
            ],
          },
        },
        commonMisconceptions: {
          "2v2 is just a smaller version of a real game":
            "Its small size is exactly the point - it isolates the support-play decision in a way that's harder to see clearly in a bigger, busier game.",
          "The player without the ball isn't doing anything important":
            "The off-ball player's positioning directly determines whether their partner has a good option - it's an active job, not a passive one.",
        },
      },
      parentCommunication: {
        ifAsked:
          "2v2 with Mini Goals is a fast small-sided game where your child learns that soccer isn't just about the player with the ball. With only one teammate, they quickly feel what happens when both players chase the ball versus when one moves to open space to help.",
        newsletter:
          "This week: 2v2 with Mini Goals! Pairs competed to score on mini goals, with the coaching focus on 'one to the ball, one to space.' It's a fast way for kids to feel the value of supporting a teammate instead of both chasing the ball. Ask your child what their job was when they didn't have the ball!",
        whatToWatchFor: [
          "Does your child move to open space when their partner has the ball, or just watch?",
          "Are they starting to pass to an open teammate instead of forcing every shot themselves?",
          "Do they communicate with their partner during play?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions near the mini goals during close scoring attempts",
            prevention: "Ensure goals aren't right against a wall or fence; leave run-off space behind them",
            response: "Check players involved; remind about controlled shots near the goal",
          },
          {
            risk: "Overexertion from the fast, near-constant movement of small-sided play",
            prevention: "Rotate pairs regularly; keep the water break at the end predictable",
            response: "Pull a visibly tired player for an extra rotation off",
          },
          {
            risk: "Ankle rolls on quick cuts in the confined space",
            prevention: "Confirm even playing surface; adequate warm-up before starting",
            response: "Rest and assess; ice if needed",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Enlarge the field slightly for that pairing, or pair with a supportive, communicative partner",
          attentionChallenges: "Shorter games (first to 2 instead of 3), clear single-instruction cues between rotations",
          skillGaps: "Pair thoughtfully so no pairing is dramatically mismatched; rotate partners between games",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players finding support positions, or both chasing the ball?",
          "Did communication between partners improve across rounds?",
          "Was the field and goal size appropriate for this group?",
          "Did rotation keep everyone playing enough without long waits?",
        ],
        forImprovement: [
          "Should the field be bigger or smaller next time?",
          "Which variation created the best support-play learning?",
          "Which pairings need to be reshuffled for better balance?",
        ],
      },
    },
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
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ 8-10 cones to mark the circle boundary\n\nSPACE: 15-20 paces diameter (scale to group size - more players need a bigger circle)\n\nSETUP STEPS\n1. Place cones in a large circle, 15-20 paces across\n2. Every player starts inside the circle with their own ball\n3. Explain the 'ball goes out → 10 toe taps and return' rule before starting\n4. On the whistle, everyone begins dribbling and shielding\n\nDIAGRAM\n          ▲    ▲    ▲\n       ▲    ○●   ○●    ▲\n      ▲    ○●  ○●  ○●    ▲    18 paces\n       ▲    ○●   ○●    ▲\n          ▲    ▲    ▲\n              18 paces\n\n▲ = boundary cone, ○● = player with ball, all inside the circle",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Edge of the circle\n\nSAY: "Everyone in the circle with your ball! Your job: keep your ball inside while trying to knock other balls out. If your ball goes out, do 10 toe taps and hop right back in - you\'re never out of the game!"\n\nDEMO: Show shielding the ball with your body while another ball approaches.\n\nSAY: "We\'ll play in rounds. When I blow the whistle, the round ends - if your ball never left the circle, you score a point! Ready... GO!"\n\n\nPHASE 2: ROUND 1 - FREE PLAY (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Protect your ball, look for opportunities to knock out someone else\'s!"\n\nCoach Position: Just outside the circle, walking the perimeter\n\nWATCH FOR:\n□ Are players keeping the ball close, or leaving it exposed?\n□ Are they using their body to shield, or just their feet?\n□ Are they watching for approaching challengers?\n\nPHRASES TO USE:\n• "Ball close, body between the ball and danger!"\n• "Nice recovery - right back in!"\n• "Heads up - who\'s coming for you?"\n\nWHISTLE: "Freeze! Whose ball stayed in the whole time? That\'s a point!"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch this."\n\nDEMO: Show shielding with the body sideways to an approaching opponent, ball on the far foot, versus standing square with the ball exposed.\n\nSAY: "See how my body is BETWEEN my ball and the challenge? That\'s shielding - use your whole body, not just your foot!"\n\n\nPHASE 4: ROUND 2 - APPLY THE LESSON (2-3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New round! Use your body to shield this time. First to 3 points is doing great!"\n\nCoach Position: Roaming the perimeter, calling out specific technique\n\nPHRASES TO USE:\n• "Great shielding - your body\'s in the way!"\n• "Nice recovery after that one - back in fast!"\n• "Smart - you picked a good moment to challenge!"\n\nWHISTLE at the end: tally points.\n\n\nPHASE 5: CHALLENGE ROUND - PARTNERS (2-3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This round, you\'ve got a partner - protect each other\'s balls as a team!"\n\nRun the round in pairs, tally combined points.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "What helped you protect your ball the longest?"\n\nListen for: "Shielding with my body," "keeping it close," "watching for people"\n\nSAY: "Exactly - protecting the ball under pressure is a game skill you\'ll use constantly! Water break!"',
    diagram:
      "          ▲    ▲    ▲\n       ▲    ○●   ○●    ▲\n      ▲    ○●  ○●  ○●    ▲\n       ▲    ○●   ○●    ▲\n          ▲    ▲    ▲\n              18 paces",
    coachingPoints: [
      "PROTECT YOUR BALL WITH YOUR BODY → Say: 'Body between the ball and the danger - like a shield!'",
      "HEAD UP TO SEE OPPONENTS → Say: 'Quick glances around - who's coming for your ball?'",
      "TIME YOUR CHALLENGES → Say: 'Wait for the right moment - don't just chase every ball you see!'",
      "USE YOUR BODY TO SHIELD → Say: 'Turn sideways so your body is a wall between the ball and them!'",
    ],
    questionsToAsk: [
      "'How do you protect your ball?' → Looking for: body positioning, keeping the ball on the far foot from a challenger",
      "'When should you attack vs defend?' → Attack when your ball is safe and an opponent's is exposed; defend when someone's closing in",
      "'What part of your foot do you use to shield?' → Whichever foot is farthest from the challenger, with your body blocking the approach",
      "'What happened when you tried to attack and protect at the same time?' → Looking for: they notice it's hard to do both - sometimes you have to choose",
    ],
    commonMistakes: [
      "BALL TOO FAR FROM THE BODY → Say: 'Keep it close - an exposed ball is an easy target!'",
      "ONLY FOCUSED ON ATTACKING → Say: 'Check on your own ball first - is it safe right now?'",
      "NOT SHIELDING → Say: 'Turn your body so it's between the ball and the challenge!'",
      "GIVING UP AFTER LOSING THE BALL → Say: 'Quick toe taps and right back in - every round is a fresh start!'",
    ],
    variations: [
      {
        name: "No Re-entry",
        description:
          "The elimination format, for the oldest/most competitive groups this activity is used with - note this activity is fundamentals-tagged, so prefer the default format for fundamentals groups: if knocked out, you're out for the round.",
        difficulty: "intermediate",
      },
      {
        name: "Partners",
        description: "Play as pairs - protect each other",
        difficulty: "intermediate",
      },
      {
        name: "Double Ball",
        description:
          "Each player protects two balls at once instead of one, dramatically raising the ball-control and body-shielding challenge while keeping the constant-participation, no-elimination format.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Ball going out almost immediately, every round\n• Standing frozen instead of moving/shielding\n• Frustration building after repeated toe-tap penalties\n• Low point totals across rounds\n\nSOLUTIONS:\n• Make the circle larger to give more room\n• Require the ball to stop fully before returning (slows the pace)\n• Shorten rounds to build confidence with quick wins\n• Coach calls out 'shield!' as a reminder during play",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Easily keeping their ball in for full rounds\n• Actively and successfully challenging others\n• Looking for more of a test\n\nSOLUTIONS:\n• Shrink the circle\n• Use the No Re-entry variation with older/more competitive groups\n• Add Double Ball for a tougher control challenge\n• Require a specific shielding technique (weak foot only) each round",
    equipmentNeeded: ["Cones", "1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "1v1", "shielding", "fun", "competition"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Free-for-all in a circle where everyone protects their own ball while trying to knock out others' - builds shielding, close control, and bounce-back resilience since a lost ball is just a quick toe-tap penalty, not elimination.",
        keyPhrases: [
          "Body between the ball and the danger!",
          "Quick toe taps and right back in!",
          "Protect first, attack second!",
        ],
        setupDiagram:
          "15-20 pace circle marked with cones, every player inside with their own ball",
        quickProgression: {
          easier: "Larger circle, require the ball to stop before returning, shorter rounds",
          harder: "Smaller circle, Double Ball, No Re-entry for older/competitive groups",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a 15-20 pace circle with cones, sized to the group (bigger group, bigger circle)",
            "Confirm every player has their own ball",
            "Decide round length in advance (60-90 seconds works well)",
            "Have a whistle or clear verbal signal ready for round starts/ends",
          ],
          mindset:
            "This activity is built around bouncing back - losing your ball is a quick toe-tap penalty, not being knocked out, which is deliberate. Praise recoveries as much as successful shielding; a player who loses their ball three times but gets right back in each time is showing exactly the resilience this game is designed to build.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Edge of the circle",
            script:
              "SAY: 'Protect your ball, try to knock out others! Ball goes out - 10 toe taps and back in!' Demo shielding. 'We play in rounds - keep your ball in the whole round for a point!'",
            anticipatedResponses: {
              "What if I never touch anyone else's ball?":
                "That's fine! Protecting your own ball the whole round still earns you a point.",
              "Can I just run away with my ball?":
                "You have to stay inside the circle boundary - shielding, not hiding.",
            },
          },
          {
            phase: "Round 1 - Free Play",
            duration: "2 minutes",
            coachPosition: "Just outside the circle, walking the perimeter",
            script:
              "Observe and lightly coach. Whistle to end: 'Whose ball stayed in the whole time? Point!'",
            troubleshooting: {
              "Ball exposed and unshielded": [
                "Keep it close - body between the ball and danger!",
              ],
              "Player frozen and not moving": [
                "Keep dribbling - staying still makes you an easy target!",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "Center of the circle, all players gathered",
            script:
              "Demo shielding with body sideways to a challenger versus standing square and exposed. 'Body between the ball and the challenge!'",
          },
          {
            phase: "Round 2 - Apply the Lesson",
            duration: "2-3 minutes",
            coachPosition: "Roaming the perimeter",
            script:
              "'Use your body to shield this round!' Call out specific technique praise as it happens.",
          },
          {
            phase: "Challenge Round - Partners",
            duration: "2-3 minutes",
            coachPosition: "Perimeter, tallying pairs' combined points",
            script:
              "'Protect each other's balls as a team this round!' Praise pairs who communicate and cover for each other.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center of the circle",
            script:
              "ASK: 'What helped you protect your ball the longest?' Connect to games: shielding under pressure. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Almost nobody's ball ever leaves the circle",
              "Players look unchallenged or bored",
              "No real challenges happening",
            ],
            solutions: [
              "Shrink the circle",
              "Add Double Ball",
              "Use No Re-entry with an older/competitive group",
              "Require weak-foot shielding for a round",
            ],
          },
          tooHard: {
            symptoms: [
              "Balls going out constantly, every few seconds",
              "Players spending more time doing toe taps than playing",
              "Visible frustration",
            ],
            solutions: [
              "Enlarge the circle",
              "Require the ball to stop before returning to slow the pace",
              "Shorten rounds so points come more often",
              "Temporarily reduce numbers in the circle if it's overcrowded",
            ],
          },
        },
        playerBehavior: {
          onlyAttacking: {
            symptoms: [
              "Players chasing others' balls while leaving their own completely exposed",
              "Frequent complaints about being 'ganged up on'",
            ],
            approach:
              "SAY: 'Check on your own ball first - is it safe right now?' Praise players who balance attack and defense.",
          },
          overlyPhysical: {
            symptoms: [
              "Pushing or using arms instead of the ball to challenge",
              "Contact that goes beyond a fair kick at the ball",
            ],
            approach:
              "Stop play immediately: 'Feet only, no hands or pushing - shield with your body, not your arms.' Reset and continue.",
          },
        },
        environmentalIssues: {
          circleTooSmallForNumbers: {
            symptoms: ["Constant congestion, balls colliding immediately"],
            solution: "Enlarge the circle or split into two smaller circles running simultaneously.",
          },
          conesGettingKicked: {
            symptoms: ["Boundary cones scattered mid-round from stray touches"],
            solution: "Use larger, more visible cones and periodically reset boundary lines between rounds.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Ball Control",
            domain: "Technical",
            howItDevelops:
              "Constant close-quarters dribbling while under threat forces tight, controlled touches - the ball has to stay glued to the feet or it becomes an easy target.",
            levelIndicators: {
              1: "Ball frequently a step or more away; easily knocked out",
              2: "Ball usually close but escapes under any pressure",
              3: "Maintains close control under mild pressure",
              4: "Keeps tight control even while actively shielding and scanning",
              5: "Effortless close control while simultaneously assessing threats and opportunities",
            },
            assessmentNotes:
              "Watch how close the ball stays during both calm moments and active challenges.",
          },
          {
            skill: "Agility & Coordination",
            domain: "Physical",
            howItDevelops:
              "Constant small adjustments - turning, shielding, pivoting away from challengers - build reactive footwork and balance in tight space.",
            levelIndicators: {
              1: "Stiff, slow to react to approaching challengers",
              2: "Reacts but often loses balance or the ball",
              3: "Turns and repositions smoothly under moderate pressure",
              4: "Quick, balanced adjustments even with multiple nearby challengers",
              5: "Fluid, anticipatory movement that avoids challenges before they fully develop",
            },
            assessmentNotes:
              "Watch footwork and balance specifically during shielding turns, not just straight-line dribbling.",
          },
        ],
        secondarySkills: [
          {
            skill: "1v1 Defending",
            domain: "Tactical",
            howItDevelops:
              "Choosing when and how to challenge for another player's ball builds early defensive timing and decision-making.",
          },
          {
            skill: "Resilience",
            domain: "Psychological",
            howItDevelops:
              "The quick toe-tap-and-return rule means losing the ball has an immediate, low-stakes recovery built in - players practice bouncing back rather than dwelling on a mistake.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "King of the Ring packs close control, shielding, and 1v1 awareness into one high-energy, low-setup game - and its built-in 'toe taps and back in' rule means no player is ever sitting out after a mistake. That resilience-by-design is why this activity stays in the no-elimination default even though a competitive elimination variation exists for older groups.",
        whenToUseIt: {
          idealFor: [
            "After ball mastery work, to add pressure and opponents",
            "Building shielding technique before introducing 1v1 to a goal",
            "High-energy activity mid-practice that keeps every player constantly involved",
          ],
          avoidWhen: [
            "Group is very young or new to soccer and doesn't yet have basic close control",
            "Space is too small to fit a circle proportional to the group size",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Ball Mastery Circle",
              reason: "Builds basic ball comfort before adding opponents and pressure",
            },
            {
              activity: "Traffic Lights",
              reason: "Introduces ball control at different speeds needed for shielding under pressure",
            },
          ],
          after: [
            {
              activity: "Shark Attack",
              reason: "Adds a designated active defender concept building on shielding skills here",
            },
            {
              activity: "1v1 to Goal",
              reason: "Transitions shielding and close control into a directional, goal-scoring 1v1",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Frame entirely as fun and forgiving - the toe-tap penalty is a game, not a punishment",
            keyPhrases: [
              "Keep your ball safe like a treasure!",
              "Quick taps and you're back in!",
              "Great protecting!",
            ],
            avoidSaying: ["You lost", "You're bad at protecting your ball"],
            duration: "6-7 minutes, shorter rounds",
            simplifications: [
              "Larger circle",
              "Skip Double Ball and No Re-entry entirely",
              "Emphasize protecting over attacking",
            ],
          },
          ages9to11: {
            approach: "Introduce shielding technique explicitly and add the Partners variation",
            keyPhrases: [
              "Show me your shielding body position",
              "When's a smart moment to challenge?",
            ],
            duration: "8-10 minutes, full progression through Partners",
            challenges: [
              "Weak-foot shielding rounds",
              "Partners variation",
            ],
          },
          ages12to14: {
            approach:
              "This is the group where No Re-entry can be introduced if the group is competitive and mixed-ability concerns don't apply - otherwise keep the default constant-participation format",
            keyPhrases: [
              "How does shielding here connect to holding the ball up front in a game?",
              "What's your strategy - protect first or attack first?",
            ],
            duration: "8-10 minutes, Double Ball or (selectively) No Re-entry",
            challenges: [
              "Double Ball variation",
              "No Re-entry, only for competitive, similarly-matched groups",
            ],
          },
        },
        commonMisconceptions: {
          "It's just chaotic running around":
            "The circle boundary and toe-tap rule create real structure - players are constantly making shielding and timing decisions, not just running.",
          "Losing your ball means you're out":
            "In the default format, losing the ball is a brief penalty, not elimination - the game is designed to keep everyone playing and to build resilience after a mistake.",
        },
      },
      parentCommunication: {
        ifAsked:
          "King of the Ring has every player protecting their own ball inside a circle while trying to knock out others'. If your child's ball gets knocked out, they do a quick set of toe taps and hop right back in - nobody sits out. It builds ball control, shielding with the body, and bouncing back from a mistake without it being a big deal.",
        newsletter:
          "This week: King of the Ring! Every player had their own ball to protect inside a circle, shielding it with their body while looking for chances to knock out others. If a ball got knocked out, a quick set of toe taps got that player right back in - nobody sat out. Ask your child to show you their best shielding stance!",
        whatToWatchFor: [
          "Does your child use their body to shield the ball, or leave it exposed?",
          "Do they bounce back quickly after losing the ball, or get discouraged?",
          "Are they balancing protecting their own ball with challenging for others'?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions between players in the crowded circle",
            prevention: "Size the circle appropriately for the number of players; remind about controlled movement",
            response: "Check both players; briefly pause to reset spacing if collisions repeat",
          },
          {
            risk: "Overly physical challenges (pushing, using arms/hands)",
            prevention: "Set the 'feet only' rule clearly before starting; watch closely in early rounds",
            response: "Stop play immediately, reset the rule, resume calmly",
          },
          {
            risk: "Tripping over stray balls from outside the immediate play area",
            prevention: "Keep the toe-tap penalty zone clear and close to the boundary, not scattered",
            response: "Check for injury; tidy stray balls between rounds",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow walking instead of running; assign a slightly larger personal space within the circle",
          attentionChallenges: "Shorter rounds with frequent whistle resets already built in; clear single-cue reminders",
          confidenceConcerns: "Emphasize the toe-tap-and-return rule heavily so no player feels singled out or eliminated",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players shielding with their bodies, or just their feet?",
          "Did players recover quickly and re-engage after losing their ball?",
          "Was the circle size appropriate for this group?",
          "Did the Partners round build cooperation without slowing the pace too much?",
        ],
        forImprovement: [
          "Should the circle be bigger or smaller next time?",
          "Is this group ready for Double Ball, or should we stay at the base format?",
          "Who needs individual reps on shielding technique before the next game?",
        ],
      },
    },
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
      "EQUIPMENT CHECKLIST\n□ 6 mini goals (3 per team) or 12 cones\n□ Pinnies, 2 colors\n□ 3-4 balls\n\nSPACE: 35x25 paces\n\nSETUP STEPS\n1. Mark a 35x25 pace field\n2. Place 3 small goals along each end line - one center, two in the corners\n3. Split into two teams of 4-5, different colored pinnies\n4. Corner goals are worth 2 points, the center goal is worth 1\n5. Kickoff from the center\n\nDIAGRAM\n⊏⊐          ⊏⊐          ⊏⊐   ← Team B's goals (corners = 2 pts, middle = 1 pt)\n                                  25 paces\n                    ●\n⊏⊐          ⊏⊐          ⊏⊐   ← Team A's goals\n            35 paces\n\n⊏⊐ = mini goal, ● = kickoff spot",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Sideline, both teams gathered\n\nSAY: "You\'ve got THREE goals to attack - the corner goals are worth 2 points, the middle goal is worth 1. Same for your own goals - defend all three!"\n\nDEMO: Point out all three goals on each end.\n\nSAY: "Scan before you shoot - which goal is open? Ready... KICKOFF!"\n\n\nPHASE 2: ROUND 1 - FREE PLAY (4-5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Play! Look for the open goal!"\n\nCoach Position: Sideline, positioned to see all three goals on the attacking end\n\nWATCH FOR:\n□ Are players only attacking the center goal, ignoring the corners?\n□ Are defenders bunched in the middle, leaving corners open?\n□ Are teams switching the ball side to side, or forcing everything through the middle?\n\nPHRASES TO USE:\n• "Scan all three goals before you shoot!"\n• "Corner\'s open - worth more too!"\n• "Switch it - other side\'s open!"\n\n\nPHASE 3: TEACHING MOMENT (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and look here."\n\nDEMO: Show attacking the crowded center goal versus switching the ball to the far side where a corner goal is undefended.\n\nSAY: "See how switching the point of attack opened up that corner goal? When one side is crowded, the other side usually has space - and it\'s worth more!"\n\n\nPHASE 4: ROUND 2 - APPLY THE LESSON (4-5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same game - this time really look to switch the ball and find the open goal, especially the corners!"\n\nCoach Position: Roaming the sideline, giving team-specific feedback\n\nPHRASES TO USE:\n• "Great switch - that opened the corner!"\n• "Who\'s defending the middle goal right now?"\n• "Nice - you created a 2v1 on that side!"\n\n\nPHASE 5: CHALLENGE ROUND - MUST SWITCH (3-4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New rule - you must pass the ball to the other side of the field at least once before you can score!"\n\nRun the round, praise successful switches even if the resulting shot misses.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "How did you find the open goal?"\n\nListen for: "Switching the ball," "scanning," "looking at the corners"\n\nSAY: "Exactly - reading which side is open and switching the ball there is real game-winning tactics! Water break!"',
    diagram:
      "⊏⊐          ⊏⊐          ⊏⊐\n                                  25 paces\n                    ●\n⊏⊐          ⊏⊐          ⊏⊐\n            35 paces",
    coachingPoints: [
      "SCAN FOR THE OPEN GOAL → Say: 'Check all three before you decide - which one's undefended?'",
      "SWITCH THE POINT OF ATTACK → Say: 'One side crowded? Switch it to the open side!'",
      "CREATE OVERLOADS ON THE WEAK SIDE → Say: 'Get numbers over where the defense is thin!'",
      "DEFEND IN NUMBERS → Say: 'Don't leave a goal alone - cover for each other!'",
    ],
    questionsToAsk: [
      "'Which goal is easiest to score in?' → Looking for: the one with fewer or no defenders, not just the nearest one",
      "'How do you create a 2v1 on a goal?' → Overloading one side with an extra attacker while the ball is still central",
      "'How do you defend three goals with four defenders?' → Looking for: compact shape, quick shifting, communication about who covers what",
      "'What happened after we added the Must Switch rule?' → Looking for: they notice the far side opens up once the ball moves there",
    ],
    commonMistakes: [
      "ONLY ATTACKING THE CENTRAL GOAL → Say: 'Check the corners - they're worth more and often more open!'",
      "NOT SWITCHING PLAY → Say: 'This side's crowded - can you get it to the other side?'",
      "DEFENDERS BUNCHED IN THE MIDDLE → Say: 'Spread out - you've got three goals to cover, not one!'",
      "FORCING A SHOT INTO A DEFENDED GOAL → Say: 'Is there an open goal, or should you switch the ball first?'",
    ],
    variations: [
      {
        name: "Must Switch",
        description:
          "Team must complete at least one pass to the opposite side of the field before a goal counts, forcing deliberate switching of play.",
        difficulty: "intermediate",
      },
      {
        name: "Moving Goals",
        description:
          "Coach relocates one goal along the end line during play, requiring teams to constantly rescan rather than memorize a fixed layout.",
        difficulty: "advanced",
      },
      {
        name: "Numbered Goals",
        description:
          "Coach calls out a number (1, 2, or 3) mid-game - only that goal counts for the next 30 seconds, forcing immediate tactical adjustment from both teams.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Constant scoring on only the center goal, ignoring corners entirely\n• No passes switching sides at all\n• Defenders never adjusting position\n• Frustration from a team that can't find any opening\n\nSOLUTIONS:\n• Reduce to 2 goals per team instead of 3\n• Enlarge the goals\n• Coach calls out 'Check the far side!' during play as a reminder\n• Pause play briefly to point out an open goal",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Regularly switching the point of attack without prompting\n• Scoring in corner goals as often as the center\n• Defense adjusting shape to cover the open side\n\nSOLUTIONS:\n• Add touch restrictions (2-touch maximum)\n• Shrink the goals\n• Add Must Switch or Numbered Goals\n• Require a minimum number of passes before any shot",
    equipmentNeeded: ["Mini goals or cones", "Pinnies", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "decision-making", "width", "tactical"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Small-sided game with three goals per team (corners worth more) that rewards scanning, switching the point of attack, and exploiting the side the defense has left thin.",
        keyPhrases: [
          "Scan all three before you shoot!",
          "Crowded side? Switch it!",
          "Get numbers where the defense is thin!",
        ],
        setupDiagram:
          "35x25 pace field, 3 mini goals per end (1 center worth 1 point, 2 corners worth 2 points each), 4v4 or 5v5",
        quickProgression: {
          easier: "Fewer goals (2 per team), bigger goals, coach cues about open sides",
          harder: "Touch restrictions, smaller goals, Must Switch or Numbered Goals variations",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a 35x25 pace field",
            "Place 3 small goals per end line: center (1 point) and two corners (2 points each)",
            "Split into balanced teams of 4-5",
            "Have 3-4 balls ready near the field",
          ],
          mindset:
            "The point of three goals with different values isn't just variety - it's forcing a real tactical read every single possession: where is the defense thin, and is it worth the extra points to attack there? Keep asking 'which goal, and why' rather than just praising any goal scored.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Sideline, both teams gathered",
            script:
              "SAY: 'Three goals each end - corners worth 2, middle worth 1. Defend all three!' Point out all six goals. 'Scan before you shoot!'",
            anticipatedResponses: {
              "Do we have to defend all three goals equally?":
                "You choose how to cover them, but leaving one wide open is risky - especially the corners.",
              "Can we just always shoot at the corner for more points?":
                "You can try, but if it's defended, a switch to the open goal is usually the smarter play.",
            },
          },
          {
            phase: "Round 1 - Free Play",
            duration: "4-5 minutes",
            coachPosition: "Sideline, positioned to see all three attacking goals",
            script:
              "Let teams play with light guidance. Prompt scanning and switching cues as patterns emerge.",
            troubleshooting: {
              "Only attacking the center goal": [
                "Check the corners - they're worth more and often open!",
              ],
              "No switching happening": [
                "This side's crowded - can you get it across?",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "60 seconds",
            coachPosition: "Center of the field, both teams gathered",
            script:
              "Demo attacking a crowded center goal versus switching to an open corner. 'Switching the point of attack opened that goal - and it's worth more!'",
          },
          {
            phase: "Round 2 - Apply the Lesson",
            duration: "4-5 minutes",
            coachPosition: "Roaming the sideline",
            script:
              "'Really look to switch and find the open goal!' Give team-specific feedback on scanning and defensive shifting.",
          },
          {
            phase: "Challenge Round - Must Switch",
            duration: "3-4 minutes",
            coachPosition: "Sideline, tracking whether the switch happened before each goal",
            script:
              "'Must pass to the other side before you can score!' Praise good switches even when the resulting shot misses.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center, both teams gathered",
            script:
              "ASK: 'How did you find the open goal?' Connect to real games: switching play to exploit the weak side. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Goals scored almost every possession without real defensive resistance",
              "No real decision-making visible - just shooting at whatever's closest",
              "Players looking unchallenged",
            ],
            solutions: [
              "Add touch restrictions",
              "Shrink the goals",
              "Add Must Switch or Numbered Goals",
              "Require a minimum pass count before shooting",
            ],
          },
          tooHard: {
            symptoms: [
              "No goals scored across several minutes",
              "Teams unable to create any opening",
              "Visible frustration from both teams",
            ],
            solutions: [
              "Reduce to 2 goals per team",
              "Enlarge the goals",
              "Coach calls out open-side cues during play",
              "Pause briefly to point out the open goal",
            ],
          },
        },
        playerBehavior: {
          tunnelVision: {
            symptoms: [
              "Every attack aimed at the same single goal regardless of coverage",
              "Ignoring open corners entirely",
            ],
            approach:
              "SAY: 'Freeze - which of the three goals is actually open right now?' Point it out if needed.",
          },
          defendersBunching: {
            symptoms: [
              "All defenders clustered in front of the center goal",
              "Corner goals left completely uncovered",
            ],
            approach:
              "SAY: 'You've got three goals to cover, not one - who's got the corners?' Encourage verbal defensive communication.",
          },
        },
        environmentalIssues: {
          goalsShiftingOutOfPosition: {
            symptoms: ["Cone or mini goals knocked out of place during play"],
            solution: "Use weighted goals if available, or briefly reset positions between rounds.",
          },
          fieldTooLargeForGroup: {
            symptoms: ["Players spread too thin, long gaps between plays"],
            solution: "Shrink the field proportionally and reduce to 2 goals per team if numbers are on the smaller end.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Finding Space",
            domain: "Tactical",
            howItDevelops:
              "With three scoring targets to defend, the attacking team must constantly identify which area of the field the defense has left open and move the ball or their bodies there.",
            levelIndicators: {
              1: "Attacks the same goal regardless of defensive coverage",
              2: "Occasionally notices an open goal after prompting",
              3: "Regularly identifies the open goal without prompting",
              4: "Actively repositions teammates and the ball to create openings",
              5: "Reads and exploits defensive shape before it's even settled",
            },
            assessmentNotes:
              "Watch whether a player's first look is at the nearest goal or a genuine scan of all three.",
          },
          {
            skill: "Passing (Short)",
            domain: "Technical",
            howItDevelops:
              "Switching the point of attack and building 2v1 overloads both require accurate, well-timed short passing under the pressure of a live game.",
            levelIndicators: {
              1: "Passes are inconsistent in accuracy and often mistimed",
              2: "Completes simple passes but rarely switches sides",
              3: "Reliable short passing, including occasional switches",
              4: "Confidently switches play and links passes to create overloads",
              5: "Combines passing with movement to consistently unlock the defense",
            },
            assessmentNotes:
              "Watch pass accuracy specifically on switch-of-play attempts, which are technically harder than short combination passes.",
          },
        ],
        secondarySkills: [
          {
            skill: "Creating Passing Angles",
            domain: "Tactical",
            howItDevelops:
              "Off-ball players must position themselves to receive a switch pass, reinforcing the skill of offering a clear passing angle.",
          },
          {
            skill: "Positional Awareness",
            domain: "Tactical",
            howItDevelops:
              "Defending three goals with fewer defenders than goals requires constant awareness of where teammates are covering and where gaps remain.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "A single goal lets players get away with predictable, direct attacking - there's only one target, so there's only one real decision. Adding three goals with different point values forces a genuine tactical read on every possession: where is space, and is it worth the extra reward to go there? This is one of the clearest ways to teach switching the point of attack in a game-realistic format.",
        whenToUseIt: {
          idealFor: [
            "Groups that already have basic passing and off-ball movement",
            "Introducing the tactical concept of switching play",
            "Mid-to-late practice, after technical work on passing and receiving",
          ],
          avoidWhen: [
            "Group doesn't yet have reliable short passing (build that first)",
            "Field space can't accommodate a 35x25 pace area even scaled down",
            "Very young or first-season players who need simpler single-goal games first",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "2v2 with Mini Goals",
              reason: "Introduces multi-goal decision-making at a smaller, simpler scale before adding a third goal and bigger numbers",
            },
            {
              activity: "Positional Rondo",
              reason: "Builds passing under pressure and scanning the field before applying it in a scoring context",
            },
          ],
          after: [
            {
              activity: "6v6 Half Field Game",
              reason: "Scales the switching-play concept into a larger, more structured attacking and defending game",
            },
            {
              activity: "Small-Sided Game 5v5",
              reason: "Applies the tactical reads from this game in a standard-goal, full-tactics context",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "This activity is typically introduced later, once players have basic passing; for an advanced younger group, simplify heavily and keep the focus purely on 'which goal is open?' without scoring value differences",
            keyPhrases: [
              "Which goal has nobody in front of it?",
              "Great look - you found the open one!",
            ],
            duration: "6-8 minutes if used at all, with 2 equal-value goals instead of 3",
            simplifications: [
              "Two goals of equal value instead of three",
              "Skip all variations",
              "Coach actively points out open goals",
            ],
          },
          ages9to11: {
            approach: "Introduce the concept of point values and switching play explicitly",
            keyPhrases: [
              "Corner's worth more - is it open?",
              "Where's the switch pass?",
            ],
            duration: "10-12 minutes, full progression through Must Switch",
            challenges: [
              "Must Switch variation",
              "Coach-called reminders about corner values",
            ],
          },
          ages12to14: {
            approach: "Focus on quick tactical reads and defensive shape under changing conditions",
            keyPhrases: [
              "How did the defense's shape create that opening?",
              "What's the fastest way to exploit an overload?",
            ],
            duration: "12-15 minutes, full progression including advanced variations",
            challenges: [
              "Moving Goals variation",
              "Numbered Goals variation",
            ],
          },
        },
        commonMisconceptions: {
          "More goals just means more chaos":
            "The different point values give every possession a real tactical decision - it's structured decision-making, not chaos.",
          "Corner goals are always the right choice because they're worth more":
            "If a corner goal is heavily defended, the lower-value open goal is still the smarter, higher-percentage choice - the lesson is reading the defense, not just chasing points.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Target Goals Game gives each team three goals to attack, with the corner goals worth more points. Your child has to scan the field, decide which goal is actually open, and often pass the ball to the other side to get there. It's a fun way to teach the tactical idea of 'switching play' that's central to real soccer.",
        newsletter:
          "This week: Target Goals Game! Each team defended three goals - two corners worth 2 points, one middle goal worth 1. The coaching focus was scanning the field and switching the ball to the open side instead of always attacking the same spot. Ask your child which goal was usually easiest to score in and why!",
        whatToWatchFor: [
          "Does your child check all the options before attacking, or always go to the same spot?",
          "Are they starting to pass the ball across the field to find open space?",
          "Do they communicate with teammates about which goals to defend?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions near corner goals during crowded attacking moments",
            prevention: "Ensure adequate space around each goal; avoid placing goals too close to field boundaries or obstacles",
            response: "Check players involved; remind about controlled play near goals",
          },
          {
            risk: "Overexertion from covering a wider field with three goals to defend",
            prevention: "Monitor fatigue, especially in the later challenge rounds; rotate substitutes if available",
            response: "Substitute a visibly tired player or add a brief pause",
          },
          {
            risk: "Ankle rolls from quick direction changes while switching to cover open goals",
            prevention: "Confirm even outdoor playing surface before starting; adequate warm-up",
            response: "Rest and assess; ice if needed",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Assign a fixed goal to defend rather than requiring full-field coverage; adjust field size",
          attentionChallenges: "Use consistent goal numbering/coloring to reduce cognitive load; shorter rounds with clear cues",
          skillGaps: "Mix passing ability across both teams so no team is consistently unable to complete a switch",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players genuinely scanning all three goals, or defaulting to the same one?",
          "Did switching play increase between Round 1 and Round 2?",
          "Was the field and goal setup appropriately challenging for this group?",
          "Did defenders adjust their shape to cover the open side?",
        ],
        forImprovement: [
          "Should goal values or placement change next time?",
          "Which variation produced the clearest switching-play behavior?",
          "Who needs individual work on scanning before shooting?",
        ],
      },
    },
  },
  {
    slug: "dribble-sprints",
    name: "Dribble Sprints",
    description:
      "Sprint conditioning with the ball pushed just ahead of the feet - players chase down their own push, sprint through the line, and repeat under growing fatigue. Builds speed dribbling and the discipline to keep touches controlled when tired.",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 10,
    skillsDeveloped: ["dribbling-with-speed", "speed"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ 2 cones per lane (start + finish)\n□ Extra cones if marking multiple parallel lanes\n\nSPACE: 30-35 paces long, 3 paces wide per lane\n\nSETUP STEPS\n1. Place a start cone and a finish cone 30-35 paces apart\n2. If running more than 6 players, mark 2-3 parallel lanes 3 paces apart so sprinters do not collide\n3. Line players up behind the start cone, one ball each\n4. Decide your rep count in advance - start at 6, build to 8\n\nDIAGRAM\nSTART                                          FINISH\n▲                                                   ▲\n○●   ○●   ○●   ○●   ○●   ○●\n\n◄──────────────── 30-35 paces ────────────────►\n\n▲ = cone   ○ = player   ● = ball",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: At the start line\n\nSAY: "Grab a ball and a spot behind this cone! This is Dribble Sprints - push the ball ahead and race yourself to the finish line!"\n\nDEMO: Push the ball 2-3 paces ahead, sprint onto it, push again, sprint through the finish.\n\nSAY: "See how I\'m not tapping it every step? I\'m pushing it ahead so I can actually run, then catching up. Close enough nobody can steal it, far enough that you can sprint!"\n\n\nPHASE 2: ROUND 1 - FIND YOUR SPEED (3 minutes, 3 reps)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "One at a time - GO! Sprint to the finish, then WALK back to start. That walk is your rest - use all of it!"\n\nSend players off five seconds apart so the lane stays clear.\n\nCoach Position: Beside the lane, watching touches\n\nWATCH FOR:\n□ Are they pushing the ball ahead or tapping it every step?\n□ Is the ball staying inside 2-3 paces, not drifting away?\n□ Are they using the full walk back, or rushing the next rep?\n\nPHRASES TO USE:\n• "Push it ahead - now sprint onto it!"\n• "Bigger touch, more speed!"\n• "Full walk back - that\'s your rest!"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch. Fresh legs, my touches are big and confident. Now watch what happens when I get tired..."\n\nDEMO: Show a tired-legs rep where the ball drifts too far, then correct it with a bigger, more purposeful touch.\n\nSAY: "See how it almost got away? Tired is exactly when you have to think MORE about your touch, not less. Controlled touches even with heavy legs - that\'s the whole point!"\n\n\nPHASE 4: ROUND 2 - STAY CONTROLLED WHEN TIRED (3 minutes, 3 reps)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same thing - sprint, walk back, rest fully. This time, compete with YOURSELF. Can rep 6 look as sharp as rep 1?"\n\nCoach Position: Moving along the lane, calling out individual reps\n\nPHRASES TO USE:\n• "That rep looked as sharp as your first one!"\n• "Stay tall - don\'t let tired legs round your shoulders!"\n• "Big touch - don\'t let it get away from you!"\n\n\nPHASE 5: CHALLENGE ROUND (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE challenge:\n\nOption A - With Turn:\nSAY: "This time, sprint out, turn tight around the finish cone, and sprint all the way back to start!"\n\nOption B - Relay Race:\nSAY: "Split into two teams! Sprint down, back, tag the next player. Fastest team wins!"\n\nRun the challenge. Celebrate effort, not just raw speed.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great sprints! What got harder as we went - your legs, your touch, or both?"\n\nListen for: "My touch got sloppy when I was tired," "Legs were heavy but I kept pushing"\n\nSAY: "That\'s exactly why we train this - so your first touch is still sharp in the second half of a game, even when you\'re gassed. Water break!"',
    diagram:
      "▲                                                   ▲\n○●   ○●   ○●   ○●   ○●   ○●\n\n◄──────────────── 30-35 paces ────────────────►\n\n▲ = cone   ○ = player   ● = ball",
    coachingPoints: [
      "PUSH AHEAD, DON'T TAP → Say: 'Push it ahead 2-3 paces, then sprint onto it - don't tap every step!'",
      "USE THE FULL REST → Say: 'Walk all the way back - that rest is what lets you sprint full speed again!'",
      "STAY CONTROLLED WHEN TIRED → Say: 'Big touch, tall posture - don't let tired legs shrink your touch!'",
      "COMPETE WITH YOURSELF → Say: 'Try to make your last rep look just as sharp as your first!'",
    ],
    questionsToAsk: [
      "'How far ahead should the ball be?' → Far enough to sprint, close enough nobody can steal it - about 2-3 paces",
      "'How do you stay fast when you're tired?' → Looking for: bigger, more purposeful touches instead of giving up on technique",
      "'Why walk back instead of jog?' → Full recovery lets the next rep be a real sprint, which is the point",
      "'What position runs the most repeat sprints in a real game?' → Connects the drill to actual match demands",
    ],
    commonMistakes: [
      "BALL TOO CLOSE AT SPEED → Say: 'You can't sprint if you're tapping every step - push it further ahead!'",
      "SLOWING DOWN TOO MUCH LATE IN THE SET → Say: 'One more full effort, then real rest!'",
      "JOGGING INSTEAD OF WALKING BACK → Say: 'Walk it back - you need that rest to sprint your best next time!'",
      "BALL DRIFTING SIDEWAYS → Say: 'Push it straight ahead - chasing sideways wastes your sprint!'",
    ],
    variations: [
      {
        name: "With Turn",
        description:
          "Sprint out, turn tight around the finish cone, and sprint all the way back to start without stopping.",
        difficulty: "intermediate",
      },
      {
        name: "Relay Race",
        description:
          "Split into teams of 3-4. Each player sprints down and back with the ball before tagging the next teammate; fastest team wins.",
        difficulty: "beginner",
      },
      {
        name: "Gassers",
        description:
          "Extend to three lengths in a row (down-back-down) before the walk-back rest, building repeat-sprint endurance for older or fitter groups.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Ball getting away from them at speed\n• Gasping, unable to complete all reps\n• Touches falling apart by rep 3-4\n• Skipping the walk-back rest because they're winded\n\nSOLUTIONS:\n• Shorten the distance to 15-20 paces\n• Add more rest between reps\n• Reduce to 4-5 total reps\n• Allow a bigger first touch out so the ball is easier to chase\n• Run in smaller groups so nobody feels rushed by the line behind them",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Touches stay sharp through all 6-8 reps\n• Recovering quickly, asking for more\n• Barely breathing hard by the end\n\nSOLUTIONS:\n• Extend distance to 40-50 paces\n• Shorten the rest - jog back instead of walk\n• Add the turn variation every rep\n• Increase to 8-10 reps\n• Add a defender chasing the last 10 paces to simulate game pressure",
    equipmentNeeded: ["Cones", "1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["conditioning", "dribbling", "speed", "fitness"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Sprint with the ball pushed ahead, walk back to recover, and repeat - builds speed dribbling and the discipline to keep touches controlled under fatigue.",
        keyPhrases: [
          "Push it ahead, then sprint onto it!",
          "Big touch, tall posture when you're tired!",
          "Full walk back - that's your rest!",
        ],
        setupDiagram:
          "30-35 pace straight lane(s), start cone and finish cone, 1 ball per player",
        quickProgression: {
          easier: "Shorter distance, more rest, fewer reps",
          harder:
            "Longer distance, shorter rest, add the turn or a chasing defender",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Measure and cone off a 30-35 pace lane (add parallel lanes if running more than 6 at once)",
            "Confirm every player has their own ball",
            "Decide the rep count in advance - start at 6, build to 8",
            "Plan a five-second send-off gap between players so lanes stay clear",
          ],
          mindset:
            "This is a conditioning drill wearing a technical disguise. Your main job is protecting quality of touch as fatigue sets in - it's tempting to let form slip once legs get heavy, but that's exactly when the training value lives. Be a broken record: 'push it ahead, big touch, stay tall.'",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "At the start line",
            script:
              "SAY: 'Push the ball ahead, sprint onto it, repeat to the finish!' Demo 2-3 pushes. 'Ball stays close enough nobody can steal it, far enough that you can sprint.'",
            anticipatedResponses: {
              "How far should I push it?":
                "About 2-3 paces - far enough to run onto, close enough to control.",
              "Do I run back too?": "No - walk back, that's your rest!",
            },
            troubleshooting: {
              "Players bunching at the start cone": [
                "Send them off one at a time with a five-second gap",
              ],
            },
          },
          {
            phase: "Round 1 - Find Your Speed",
            duration: "3 minutes (3 reps)",
            coachPosition: "Beside the lane, watching touches",
            script:
              "Send one player at a time. Call out: 'Push it ahead - sprint onto it!' Confirm the full walk-back rest between reps.",
            troubleshooting: {
              "Ball drifting too far ahead": [
                "Smaller pushes - just enough to sprint onto",
              ],
              "Players jogging instead of walking back": [
                "Remind them the walk IS the rest - jogging cuts recovery short",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "At the start line, everyone gathered",
            script:
              "Demo a tired-legs rep where the touch gets sloppy, then correct it. 'When you're tired is exactly when you have to think MORE about your touch, not less.'",
          },
          {
            phase: "Round 2 - Stay Controlled When Tired",
            duration: "3 minutes (3 reps)",
            coachPosition: "Moving along the lane",
            script:
              "Challenge players to match rep 1's quality by rep 6. Call out individual reps by name for specific feedback.",
          },
          {
            phase: "Challenge Round",
            duration: "2 minutes",
            coachPosition: "At the finish cone, or splitting teams for the relay",
            script:
              "Pick one: With Turn (sprint-turn-sprint back) or Relay Race (teams of 3-4). Celebrate effort over raw speed.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "At the start line",
            script:
              "ASK: 'What got harder as we went - legs, touch, or both?' Connect to game fitness: sharp touch in the second half even when tired. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Touches stay perfect through all reps",
              "Barely breathing hard",
              "Asking for more reps",
            ],
            solutions: [
              "Extend the distance",
              "Shorten the rest",
              "Add the turn variation",
              "Add a chasing defender on the last stretch",
            ],
          },
          tooHard: {
            symptoms: [
              "Ball escaping on multiple reps",
              "Unable to complete the full set",
              "Touches falling apart early",
            ],
            solutions: [
              "Shorten the distance",
              "Add rest between reps",
              "Reduce total reps",
              "Allow a bigger first push so the ball is easier to chase",
            ],
          },
        },
        playerBehavior: {
          racingEachOther: {
            symptoms: [
              "Players sprinting off before their turn",
              "Crowding the start cone",
            ],
            approach:
              "Assign a clear send-off order and a five-second gap; praise the player who waits their turn and still sprints hard.",
          },
          cuttingRestShort: {
            symptoms: ["Jogging back instead of walking", "Starting the next rep early"],
            approach:
              "SAY: 'The walk back is part of the drill - use all of it so your next sprint is a real sprint.'",
          },
          sloppyTouchesLate: {
            symptoms: ["Ball drifting wide or too far ahead on later reps"],
            approach:
              "Call it out kindly in the moment: 'Big touch, stay tall!' and praise the next rep when it improves.",
          },
        },
        environmentalIssues: {
          wetOrSlickGround: {
            symptoms: ["Players slipping on turns or sprints"],
            solution: "Shorten distance, reduce speed expectations, or move indoors if suitable.",
          },
          notEnoughSpaceForLanes: {
            symptoms: ["Only one lane possible, long wait between turns"],
            solution:
              "Run reps individually with a shorter rest interval, or split the group into two smaller sets.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling with Speed",
            domain: "Technical",
            howItDevelops:
              "Pushing the ball ahead and sprinting onto it builds the touch weight and running rhythm needed to carry the ball at pace in open space.",
            levelIndicators: {
              1: "Taps the ball every step; cannot sprint at real speed",
              2: "Occasional bigger touches, but ball often drifts away",
              3: "Consistent 2-3 pace pushes; sprints at close to full speed",
              4: "Adjusts touch size to speed; controlled even at top pace",
              5: "Sprints at full speed with the ball tight enough to beat a chasing defender",
            },
            assessmentNotes:
              "Watch touch spacing at full speed. Does the ball stay retrievable, or does it get away on 2+ reps?",
          },
          {
            skill: "Speed",
            domain: "Physical",
            howItDevelops:
              "Repeated maximal sprints with brief recovery build acceleration and top-end speed, and teach players to sustain effort across multiple reps.",
            levelIndicators: {
              1: "Cannot maintain top speed past rep 2-3",
              2: "Noticeable drop-off in speed by rep 4-5",
              3: "Holds close to top speed through most reps",
              4: "Consistent speed across all reps with proper recovery use",
              5: "Minimal drop-off even under a shortened-rest challenge",
            },
            assessmentNotes:
              "Time or eyeball the last rep against the first - a big gap signals a fitness or pacing issue.",
          },
        ],
        secondarySkills: [
          {
            skill: "Resilience",
            domain: "Psychological",
            howItDevelops:
              "Holding technique together on the later, tiring reps builds the mental toughness to maintain quality under fatigue.",
          },
          {
            skill: "Agility & Coordination",
            domain: "Physical",
            howItDevelops:
              "The turn variation demands a controlled change of direction at speed, reinforcing balance and body control.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "Most conditioning drills sacrifice technique for effort. Dribble Sprints keeps the ball involved so players practice exactly the skill that breaks down late in games: controlling the ball while tired. It builds real fitness while reinforcing that a big, confident touch beats a nervous, tight one.",
        whenToUseIt: {
          idealFor: [
            "Mid-to-late practice, after a full warm-up",
            "Building toward game-speed conditioning",
            "Reinforcing that technique should not disappear under fatigue",
          ],
          avoidWhen: [
            "Players have not warmed up (injury risk)",
            "Space cannot fit at least one safe 30-pace lane",
            "The group needs low-intensity technical work that day",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Speed Dribbling Relay",
              reason: "Introduces dribbling at pace in a lower-fatigue, game-like format first",
            },
            {
              activity: "Gates Dribbling",
              reason: "Builds comfort dribbling with purpose before adding sprint conditioning",
            },
          ],
          after: [
            {
              activity: "Box to Box Runs",
              reason: "Extends the conditioning demand to a longer, ball-optional shuttle format",
            },
            {
              activity: "Dribblers vs Defenders",
              reason: "Adds a chasing defender so speed dribbling happens under real pressure",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Not typically used at this age - 6-8 year olds get better conditioning value from games with a built-in chase, like Ball Tag or Shark Attack, than from structured sprint reps. If used at all, keep it short and playful.",
            keyPhrases: ["Race the ball to the line!", "Can you beat your own time?"],
            avoidSaying: ["This is your fitness test", "You're too slow"],
            duration: "3-4 minutes if used at all",
            simplifications: [
              "Shorten to 15 paces",
              "Frame every rep as a fun race, not a fitness rep",
              "3-4 reps maximum",
            ],
          },
          ages9to11: {
            approach:
              "Introduce the format with clear technique cues; keep the competitive frame light - beat your own time rather than compare to teammates.",
            keyPhrases: ["Push it ahead, sprint onto it!", "Beat your last rep!"],
            avoidSaying: ["You're the slowest one", "That was a bad rep"],
            duration: "8-10 minutes, 5-6 reps",
            challenges: ["Add the turn variation", "Relay teams for fun competition"],
          },
          ages12to14: {
            approach:
              "Full conditioning intent - connect explicitly to game fitness demands and let players self-monitor their own effort and quality.",
            keyPhrases: [
              "Where does this show up in a real game?",
              "Match your rep 1 quality on rep 8",
            ],
            avoidSaying: ["Just get through it"],
            duration: "10-12 minutes, 6-8 reps",
            challenges: [
              "Extend the distance",
              "Add a chasing defender on the last 10 paces",
              "Shorten recovery to build repeat-sprint ability",
            ],
          },
        },
        commonMisconceptions: {
          "This is just running, not soccer training":
            "Dribbling at speed under fatigue is exactly what happens in transition moments in real games - it's conditioning and a technical skill at once.",
          "Faster reps are always better":
            "A fast rep with the ball drifting away teaches bad habits; controlled speed beats reckless speed.",
          "Walking back is wasted time":
            "The walk-back is the recovery that allows a full-effort sprint next time - cutting it short lowers the quality of every following rep.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Dribble Sprints builds your child's speed while keeping the ball under control - it's conditioning that also sharpens their first touch under fatigue, which shows up in the closing minutes of real games.",
        newsletter:
          "This week: Dribble Sprints! Players sprinted with the ball pushed just ahead of their feet, walked back to recover, and repeated. We're building game fitness and teaching players to keep their touch sharp even when tired - exactly what shows up late in a match.",
        whatToWatchFor: [
          "Does your child push the ball ahead to actually sprint, or tap it every step?",
          "Do they use the full walk-back to recover, or rush the next rep?",
          "Does their touch stay controlled on the later reps, or fall apart when tired?",
          "Are they competing with themselves rather than comparing to teammates?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Hamstring or muscle strain from sprinting without a warm-up",
            prevention:
              "Always run this after a full dynamic warm-up, never as the first activity of practice",
            response:
              "Stop the player immediately, rest, ice if needed, and do not return to sprinting that session",
          },
          {
            risk: "Collisions between adjacent lanes",
            prevention:
              "Space lanes at least 3 paces apart; send players off with a gap, not simultaneously",
            response: "Pause the drill, check players, widen lanes before resuming",
          },
          {
            risk: "Rolled ankle on the turn variation",
            prevention:
              "Require a controlled, wide turn around the cone rather than a sharp cut at full speed",
            response: "Rest, ice if needed, reduce intensity for the remainder of the session",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences:
            "Allow a fast walk or jog instead of a sprint; shorten the distance so effort level matches, not literal speed",
          enduranceDifferences:
            "Reduce rep count or add extra rest for players still building fitness; frame success as effort, not finishing time",
          attentionChallenges:
            "Keep reps short with a clear individual send-off cue so waiting time doesn't lead to wandering",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did touches stay controlled through the later reps, or fall apart under fatigue?",
          "Was the walk-back rest actually being used, or were players rushing?",
          "Did the rep count match this group's conditioning level?",
          "Were lanes spaced safely with no near-collisions?",
        ],
        forImprovement: [
          "Should I adjust distance or rep count next time?",
          "Who needs an easier version to keep their technique intact?",
          "Which challenge variation fit this group best?",
          "How can I tie this more explicitly to game moments in the debrief?",
        ],
      },
    },
  },
  {
    slug: "box-to-box-runs",
    name: "Box to Box Runs",
    description:
      "Full-length shuttle runs between penalty boxes that simulate a box-to-box midfielder's workload - sprint the length of the field, jog back, and go again. Builds top-end speed, repeat-sprint endurance, and the mental toughness to keep pushing late in a match.",
    sport: "soccer",
    activityType: "conditioning",
    difficulty: "advanced",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 12,
    skillsDeveloped: ["speed"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 4 cones (mark each penalty box line if the field is not already marked)\n□ Stopwatch or phone timer for rest intervals\n□ Optional: 1 ball per player for the With Ball variation\n\nSPACE: Full field length (about 60-70 paces box-to-box), or a marked 60-pace course\n\nSETUP STEPS\n1. Use the two penalty box lines as start/finish, or mark two lines 60 paces apart with cones\n2. Line players up along the starting line\n3. Set a rest interval - start at 60 seconds between reps\n4. Decide rep count in advance based on the group's conditioning level (start at 6)\n\nDIAGRAM\nBOX LINE                                              BOX LINE\n▲───────────────────────────────────────────────────▲\n○  ○  ○  ○  ○  ○\n\n◄──────────────── 60-70 paces ────────────────►\n\n▲ = cone/box line   ○ = player",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: At one box line\n\nSAY: "This is Box to Box Runs - sprint the full length of the field, jog back, and go again. This is exactly what a box-to-box midfielder does in a real game, over and over!"\n\nSAY: "Sprint means SPRINT - full effort. Jog back means an actual jog, not a walk, not another sprint. That jog is your recovery AND your transition back to ready position."\n\nSAY: "We\'ll do sets of 6, with 60 seconds rest after each. Pace yourself - this is a marathon of sprints, not one all-out effort!"\n\n\nPHASE 2: ROUND 1 - BUILD THE RHYTHM (4 minutes, 3 reps)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone on the line. Ready... SPRINT!"\n\nSend the group together (or in a tight wave if the group is large).\n\nCoach Position: At the far line, timing rest\n\nWATCH FOR:\n□ Are they sprinting the full distance, or easing up early?\n□ Is the jog back an actual jog, not a walk?\n□ Are arms driving, or hanging low and loose?\n\nPHRASES TO USE:\n• "All the way through the line - don\'t slow down early!"\n• "Drive those arms!"\n• "Jog it back - keep moving!"\n\nRun 3 reps with the 60-second rest between each.\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone gather up. Watch my arms when I sprint - driving hard, elbows back. That\'s what pulls your legs along when they get tired."\n\nDEMO: Show a sprint with strong arm drive, then a lazy-arm sprint for comparison.\n\nSAY: "And on the jog back - shoulders relaxed, breathing controlled. That jog is where you get ready for the NEXT sprint. Don\'t waste it by walking, but don\'t waste your legs by sprinting it either!"\n\n\nPHASE 4: ROUND 2 - HOLD YOUR PACE (4 minutes, 3 reps)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same as before - but I want rep 6 to look just as strong as rep 1. That\'s mental toughness!"\n\nCoach Position: Alternating ends, calling out effort\n\nPHRASES TO USE:\n• "That\'s a strong finish - keep it up!"\n• "I see you slowing early - one more gear!"\n• "Great jog pace - controlled and ready!"\n\n\nPHASE 5: CHALLENGE ROUND (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE:\n\nOption A - With Ball:\nSAY: "This time, dribble the ball on your way back instead of jogging empty-handed. Controlled touches - this is still recovery, not a race!"\n\nOption B - Partner Work:\nSAY: "Partner up! Your partner passes you the ball as you arrive at each end - one touch to control, then go again!"\n\nRun the challenge for the remaining reps.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Tough work! What was harder - the sprinting or staying mentally locked in on rep 6?"\n\nListen for: "Staying focused was hard," "My legs were fine but my mind wanted to quit"\n\nSAY: "That mental piece is exactly what separates players in the last 15 minutes of a real game. Great effort - water break!"',
    diagram:
      "▲───────────────────────────────────────────────────▲\n○  ○  ○  ○  ○  ○\n\n◄──────────────── 60-70 paces ────────────────►\n\n▲ = cone/box line   ○ = player",
    coachingPoints: [
      "PACE YOURSELF → Say: 'This is a marathon of sprints - hold something back for rep 6, not just rep 1!'",
      "DRIVE WITH YOUR ARMS → Say: 'Elbows back, arms pumping - that's what pulls tired legs along!'",
      "JOG MEANS JOG → Say: 'Keep moving on the way back - a real jog, not a walk, not a second sprint!'",
      "STAY LOCKED IN LATE → Say: 'Make your last rep look just as strong as your first - that's mental toughness!'",
    ],
    questionsToAsk: [
      "'How do you recover during the jog back?' → Controlled breathing, relaxed shoulders, staying ready to sprint again",
      "'What position runs the most distance in a real game?' → Central midfielders - box-to-box running is literally their job",
      "'Why not just walk back instead of jogging?' → Looking for: jogging keeps the body warm and transitions faster into the next sprint",
      "'What's harder by rep 5 or 6 - your legs or your focus?' → Builds self-awareness about mental fatigue, not just physical",
    ],
    commonMistakes: [
      "GOING TOO HARD TOO EARLY → Say: 'Save something - this is 6 sprints, not 1!'",
      "WALKING INSTEAD OF JOGGING BACK → Say: 'Keep jogging - walking wastes the recovery rhythm!'",
      "SLOWING DOWN BEFORE THE LINE → Say: 'Run through the line, not to it - finish every rep!'",
      "LETTING ARMS GO LIMP WHEN TIRED → Say: 'Drive your arms - they'll pull your legs along!'",
    ],
    variations: [
      {
        name: "With Ball",
        description:
          "Dribble the ball under control on the jog back instead of running empty-handed - keeps technical touches involved in the conditioning.",
        difficulty: "advanced",
      },
      {
        name: "Partner Work",
        description:
          "Partner passes the ball to you as you arrive at each line; take one controlled touch before turning to go again.",
        difficulty: "advanced",
      },
      {
        name: "Timed Splits",
        description:
          "Time each sprint and challenge players to stay within 2 seconds of their fastest rep by rep 6 - makes the mental toughness goal concrete and measurable.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Sprints getting visibly slower by rep 3-4\n• Walking instead of jogging back\n• Gasping, unable to hold form\n• Skipping full effort on later reps\n\nSOLUTIONS:\n• Shorten the distance to 40-45 paces\n• Extend rest to 90 seconds between reps\n• Reduce to 4-5 total reps\n• Allow a slower jog-back pace\n• Split into smaller groups so nobody feels pressured by faster teammates",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Rep 6 looks nearly as fast as rep 1\n• Recovering quickly during the jog\n• Asking to add more reps\n\nSOLUTIONS:\n• Add ball work on the return jog\n• Shorten rest to 45 seconds\n• Increase to 8-10 reps\n• Add a competitive element - fastest average time wins\n• Combine with the Partner Work variation for a technical-conditioning blend",
    equipmentNeeded: ["Cones", "Stopwatch or timer"],
    spaceRequired: "large",
    indoorSuitable: false,
    appropriateStages: ["development"],
    tags: ["conditioning", "running", "endurance", "fitness"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Full-field shuttle sprints between penalty boxes with a jog-back recovery - builds the repeat-sprint speed and mental toughness of a box-to-box midfielder.",
        keyPhrases: [
          "Sprint through the line, not to it!",
          "Drive your arms - they pull tired legs along!",
          "Make rep 6 look like rep 1!",
        ],
        setupDiagram: "Full field length or a marked 60-70 pace course between two lines",
        quickProgression: {
          easier: "Shorter distance, longer rest, fewer reps",
          harder: "Longer distance or more reps, shorter rest, add ball work",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Confirm both box lines or mark a 60-70 pace course with cones",
            "Bring a stopwatch or phone timer to enforce consistent rest intervals",
            "Decide the rep count in advance based on this group's fitness level",
            "This activity is for the development stage and older - confirm the group has the conditioning base for repeat maximal sprints",
          ],
          mindset:
            "This is pure conditioning with a soccer-specific shape. Your job is pacing and honesty - players will want to sprint rep 1 all-out and coast by rep 4. Push for consistency across the whole set, not just a fast start. Reinforce that finishing strong is the actual skill being trained.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "At one box line",
            script:
              "SAY: 'Sprint the full length, jog back, repeat. Pace yourself - this is 6 sprints, not 1.' Explain the 60-second rest between reps.",
            anticipatedResponses: {
              "How hard should I go?":
                "Full effort every sprint - but save enough that rep 6 looks like rep 1.",
              "Can I walk back instead of jog?":
                "No - jog keeps you warm and ready for the next sprint.",
            },
            troubleshooting: {
              "Group bunching at the start line": [
                "Send off in a staggered line or small waves",
              ],
            },
          },
          {
            phase: "Round 1 - Build the Rhythm",
            duration: "4 minutes (3 reps)",
            coachPosition: "At the far line, timing rest",
            script:
              "Send the group together. Call out: 'All the way through the line!' Time the 60-second rest strictly.",
            troubleshooting: {
              "Players slowing before the line": [
                "Move the finish cone a pace or two further so they run through it",
              ],
              "Walking instead of jogging back": [
                "Remind them jog keeps the rhythm - walking breaks it",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "At the start line, everyone gathered",
            script:
              "Demo strong arm drive vs. lazy arms. 'Driving arms pull tired legs along - that's free speed.'",
          },
          {
            phase: "Round 2 - Hold Your Pace",
            duration: "4 minutes (3 reps)",
            coachPosition: "Alternating ends",
            script:
              "Challenge players to match rep 1's effort on rep 6. Call out individual effort by name.",
          },
          {
            phase: "Challenge Round",
            duration: "2 minutes",
            coachPosition: "Roaming between lines",
            script:
              "Pick one: With Ball (dribble the jog back) or Partner Work (receive a pass at each end). Keep the intensity of the sprint itself unchanged.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "At one line",
            script:
              "ASK: 'What was harder - your legs or staying mentally locked in?' Connect to game moments late in a match. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Rep 6 nearly as fast as rep 1",
              "Barely breathing hard by the end",
              "Asking for more reps",
            ],
            solutions: [
              "Add more reps",
              "Shorten the rest interval",
              "Add ball work on the jog back",
              "Introduce timed splits with a target",
            ],
          },
          tooHard: {
            symptoms: [
              "Sprints falling apart by rep 3-4",
              "Walking instead of jogging",
              "Unable to complete the full set",
            ],
            solutions: [
              "Shorten the distance",
              "Extend the rest interval",
              "Reduce total reps",
              "Split into smaller groups by fitness level",
            ],
          },
        },
        playerBehavior: {
          pacingTooAggressively: {
            symptoms: ["All-out effort on rep 1, big drop-off by rep 3"],
            approach:
              "SAY: 'Save something - imagine you have to do this 6 times, because you do!' Praise even pacing after the fact.",
          },
          cuttingTheJogShort: {
            symptoms: ["Walking or stopping during the recovery jog"],
            approach:
              "Remind them the jog is part of the drill, not optional rest - keep the legs moving to stay ready.",
          },
          racingTeammatesUnsafely: {
            symptoms: ["Players veering into each other's lanes to compete"],
            approach:
              "Assign lanes or staggered starts; redirect competitiveness toward beating their own previous rep time.",
          },
        },
        environmentalIssues: {
          heatOrHumidity: {
            symptoms: ["Players fatiguing much faster than usual", "Excessive sweating, flushed faces"],
            solution: "Extend rest intervals, reduce total reps, and ensure water breaks between sets.",
          },
          hardOrUnevenSurface: {
            symptoms: ["Complaints of shin or joint discomfort"],
            solution: "Reduce total volume for the session or move to a softer surface if available.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Speed",
            domain: "Physical",
            howItDevelops:
              "Repeated maximal-effort sprints over a long distance with structured recovery build both top-end speed and the ability to repeat sprints without significant drop-off - the core physical demand of central midfield play.",
            levelIndicators: {
              1: "Cannot complete the full rep count at a sprint effort",
              2: "Completes the set but with major speed drop-off by the final reps",
              3: "Holds reasonably consistent pace across most reps",
              4: "Minimal drop-off across the full set; recovers well during the jog",
              5: "Maintains near-identical pace from rep 1 to rep 6+ even under a shortened-rest challenge",
            },
            assessmentNotes:
              "Compare the pace of the first and last rep. A large, consistent gap signals a conditioning base that needs building.",
          },
        ],
        secondarySkills: [
          {
            skill: "Resilience",
            domain: "Psychological",
            howItDevelops:
              "Staying mentally locked in and finishing each rep strong when legs are heavy builds the toughness needed for the closing stages of real matches.",
          },
          {
            skill: "Agility & Coordination",
            domain: "Physical",
            howItDevelops:
              "Transitioning cleanly from sprint to jog to sprint again reinforces body control and running mechanics under fatigue.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "Central midfielders in particular cover enormous distance at high intensity across a match. Box to Box Runs trains that exact physical profile - repeated maximal sprints with incomplete recovery - while the arm-drive and pacing cues keep it technically informative, not just exhausting.",
        whenToUseIt: {
          idealFor: [
            "Development-stage players building a genuine fitness base",
            "Pre-season or early-season conditioning blocks",
            "Reinforcing pacing and mental toughness under physical fatigue",
          ],
          avoidWhen: [
            "Players have not been conditioned gradually toward this volume",
            "Extreme heat or humidity without adjusted rest",
            "The session already contains heavy sprint volume elsewhere",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Dribble Sprints",
              reason: "Builds sprint conditioning at a shorter distance with the ball involved first",
            },
            {
              activity: "Pressing Game Fitness",
              reason: "Introduces repeat-effort conditioning inside a game context before pure running volume",
            },
          ],
          after: [
            {
              activity: "6v6 Half Field Game",
              reason: "Applies the repeat-sprint fitness just built to a game with real transition moments",
            },
            {
              activity: "Transition Game",
              reason: "Tests whether the conditioning translates to quick defensive-to-attacking sprints",
            },
          ],
        },
        ageAdaptations: {
          ages9to11: {
            approach:
              "Not typically used in this full form - if introducing the concept early, shorten distance dramatically and frame it as a game, not a fitness test.",
            keyPhrases: ["Race to the line and back!", "Can you beat your own time?"],
            avoidSaying: ["This is your fitness test", "You have to finish all the reps"],
            duration: "Shorten to 25-30 pace distance, 3-4 reps, if used at all",
            simplifications: [
              "Much shorter distance",
              "Longer rest between reps",
              "Frame it as a race, not conditioning",
            ],
          },
          ages12to14: {
            approach:
              "Full conditioning intent for the development stage - introduce pacing strategy and connect explicitly to specific positions and match minutes.",
            keyPhrases: [
              "Where does this show up in the last 15 minutes of a game?",
              "Pace yourself like it's 6 sprints, not 1",
            ],
            avoidSaying: ["Just push through it", "Last place has to run again"],
            duration: "10-12 minutes, 6-8 reps",
            challenges: [
              "Add ball work on the return jog",
              "Shorten rest to build repeat-sprint ability",
              "Introduce timed splits",
            ],
          },
        },
        commonMisconceptions: {
          "This is just running, not real training":
            "Repeat-sprint ability with incomplete recovery is one of the most match-specific fitness qualities in soccer, especially for central midfielders.",
          "Going all-out every rep is the goal":
            "An all-out rep 1 followed by a collapsed rep 4 is worse training than steady, sustainable effort across the whole set - pacing is part of the skill.",
          "Walking back is fine as long as you sprint hard":
            "Walking breaks the physiological rhythm the jog is designed to build - it changes what the drill is training.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Box to Box Runs builds the repeat-sprint fitness players need to keep working hard for a full match, not just the first 20 minutes - it's specifically designed around what midfielders do most in a real game.",
        newsletter:
          "This week: Box to Box Runs! Players sprinted the length of the field, jogged back, and repeated it six times - simulating the running demands of a real match. We're building the fitness and mental toughness to still be sharp in the closing minutes of a game.",
        whatToWatchFor: [
          "Does your child's pace stay consistent across all the reps, or fall off sharply?",
          "Are they jogging back with purpose, or walking?",
          "Do they finish the set with effort still intact, or fade early?",
          "Are they pacing themselves smartly rather than sprinting rep 1 and quitting on rep 3?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Hamstring, calf, or groin strain from repeated maximal sprints",
            prevention:
              "Require a complete dynamic warm-up before this activity; never run it cold",
            response:
              "Stop the player immediately, rest, ice if needed, and do not continue sprinting that session",
          },
          {
            risk: "Heat exhaustion from a high-volume running activity",
            prevention:
              "Adjust rep count and rest to conditions; ensure water is available and breaks are taken in hot weather",
            response:
              "Move the player to shade, provide water, monitor closely, and seek medical attention if symptoms persist",
          },
          {
            risk: "Overuse injury from too much volume too soon in a season",
            prevention:
              "Build up rep count and distance gradually over several weeks rather than starting at maximum volume",
            response: "Reduce volume immediately if players report joint or shin discomfort",
          },
        ],
        inclusionConsiderations: {
          fitnessDifferences:
            "Group players by current conditioning level where possible; reduce reps or extend rest for those still building their base",
          enduranceDifferences:
            "Allow a slower jog-back pace and longer rest without singling anyone out",
          attentionChallenges:
            "Use a visible countdown or clear verbal cues for start/stop so transitions between sprint and jog are unambiguous",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did pace stay reasonably consistent from rep 1 to the final rep?",
          "Was the rest interval actually enforced, or did it drift shorter or longer?",
          "Did the rep count match this group's current conditioning level?",
          "Were there any signs of heat stress or overexertion I should note for next time?",
        ],
        forImprovement: [
          "Should I adjust distance, rep count, or rest interval next time?",
          "Who needs a gradual build-up before running the full version?",
          "Which challenge variation fit this group's needs?",
          "How can I connect this more explicitly to specific match moments in the debrief?",
        ],
      },
    },
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
    description:
      "Bowling with a soccer ball - players strike shots at ten cones set up in a bowling-pin triangle, scoring points for knockdowns and bonus points for a spare or strike. A fun, low-pressure way to build shooting accuracy and technique.",
    sport: "soccer",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    skillsDeveloped: ["shooting"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 10 cones (bowling pins)\n□ 1-2 balls\n□ 1 marker cone for the shooting line\n\nSPACE: 15 paces long, 5 paces wide\n\nSETUP STEPS\n1. Set up 10 cones in a bowling-pin triangle: 4 cones in the back row, then 3, then 2, then 1 lead cone in front, each row 1 pace apart\n2. Place a shooting line marker 15 paces from the lead cone\n3. Split players into small groups or a line behind the shooting marker\n4. Keep spare cones and a ball supply nearby for quick resets\n\nDIAGRAM\n              ▲ ▲ ▲ ▲\n               ▲ ▲ ▲\n                ▲ ▲\n                 ▲\n\n\n\n                 ○●\n            SHOOTING LINE\n\n▲ = cone (pin)   ○ = shooter   ● = ball   (15 paces from lead cone)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Beside the shooting line\n\nSAY: "This is Soccer Bowling! Just like real bowling - ten pins, two rolls, and you\'re trying to knock them all down!"\n\nDEMO: Take one shot from the line at the lead cone.\n\nSAY: "Each cone you knock down is a point. Knock them ALL down in your two shots, that\'s a SPARE - 15 points! Knock them ALL down in ONE shot, that\'s a STRIKE - 20 points!"\n\n\nPHASE 2: ROUND 1 - FIRST FRAME (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone gets two shots. First shot, then we reset any standing cones for shot two. Let\'s go - who\'s up first?"\n\nRun through the group, one bowler at a time, resetting cones between players.\n\nCoach Position: Beside the pins, resetting and counting\n\nWATCH FOR:\n□ Are they aiming at the lead cone or just kicking randomly?\n□ Are they striking through the ball or toe-poking?\n□ Is everyone getting a turn quickly so nobody waits too long?\n\nPHRASES TO USE:\n• "Aim right at that front cone!"\n• "Big swing through the ball!"\n• "Nice knockdown - count it up!"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone watch. I\'m aiming at the LEAD cone - if I hit that one dead center, it can knock down the ones behind it too!"\n\nDEMO: Strike the lead cone, showing the follow-through toward the target.\n\nSAY: "See my foot keeps going AFTER I hit the ball? That follow-through is what gives you both power and accuracy!"\n\n\nPHASE 4: ROUND 2 - FULL FRAME WITH SCORING (3 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New frame! Keep track of your score - can you beat your first frame?"\n\nRun through the group again, tracking scores out loud.\n\nPHRASES TO USE:\n• "That\'s a spare! 15 points!"\n• "So close to a strike - great aim!"\n• "Nice follow-through - that\'s why it had power!"\n\n\nPHASE 5: CHALLENGE ROUND (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE:\n\nOption A - Long Distance Bowling:\nSAY: "Move the line back! Same rules, longer shots!"\n\nOption B - Weak Foot Bowling:\nSAY: "This frame, only your weak foot can shoot! It\'s okay if it\'s not as accurate yet!"\n\nRun the challenge frame. Celebrate every knockdown.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great bowling! What helped you knock down more pins?"\n\nListen for: "Aiming at the front one," "Following through," "Keeping my head down over the ball"\n\nSAY: "Those are the exact same things that make you accurate shooting at a real goal! Nice work - water break!"',
    diagram:
      "              ▲ ▲ ▲ ▲\n               ▲ ▲ ▲\n                ▲ ▲\n                 ▲\n\n\n\n                 ○●\n            SHOOTING LINE\n\n▲ = cone (pin)   ○ = shooter   ● = ball   (15 paces from lead cone)",
    coachingPoints: [
      "AIM FOR THE LEAD CONE → Say: 'Hit the front pin dead center - it can take down the ones behind it too!'",
      "STRIKE THROUGH THE BALL → Say: 'Big swing through the middle of the ball, not a little poke!'",
      "FOLLOW THROUGH TO TARGET → Say: 'Let your foot keep going toward the pins after you strike it!'",
      "HEAD DOWN, EYES ON THE BALL → Say: 'Watch the ball right up until you strike it!'",
    ],
    questionsToAsk: [
      "'Where do you aim?' → The lead cone, dead center, so it can topple others behind it",
      "'How do you get power and accuracy at the same time?' → Looking for: a full swing with a strong follow-through, not just a hard kick",
      "'What's the difference between a spare and a strike?' → Spare = all pins in two shots, strike = all pins in one shot",
      "'How is this like shooting on a real goal?' → Picking a target and striking through the ball cleanly",
    ],
    commonMistakes: [
      "AIMING TOO HIGH → Say: 'Keep it low - a rolling shot knocks down pins better than one that flies over them!'",
      "TOE POKING → Say: 'Use your laces or the inside of your foot - a bigger surface means more control!'",
      "NOT FOLLOWING THROUGH → Say: 'Let your foot keep swinging toward the pins after contact!'",
      "RUSHING THE SHOT → Say: 'Take a breath, pick your target, then shoot!'",
    ],
    variations: [
      {
        name: "Long Distance Bowling",
        description:
          "Move the shooting line back to 20-25 paces for a bigger power and accuracy challenge.",
        difficulty: "intermediate",
      },
      {
        name: "Weak Foot Bowling",
        description:
          "Every shot must be taken with the non-dominant foot - keep expectations light since accuracy naturally drops.",
        difficulty: "intermediate",
      },
      {
        name: "Team Bowling League",
        description:
          "Split into teams of 2-3 who combine their frame scores across several rounds; highest team total after 3 frames wins.",
        difficulty: "beginner",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Shots consistently missing all cones\n• Ball flying well over the pins\n• Frustration building after a few misses\n\nSOLUTIONS:\n• Move the shooting line closer, to 8-10 paces\n• Use fewer, more spread-out cones so a hit is easier\n• Allow a rolling start-up touch before the shot\n• Widen the pin triangle so more shots make contact",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Regularly getting spares or strikes\n• Shots consistently hitting the intended target\n• Asking for a bigger challenge\n\nSOLUTIONS:\n• Move the shooting line back to 20-25 paces\n• Weak foot only\n• Require calling which cone they are aiming for before shooting\n• Add a time limit per shot to build quick decision-making",
    equipmentNeeded: ["10 cones", "1-2 balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["fun", "shooting", "accuracy", "game"],
    featured: false,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Bowling with a soccer ball - strike shots at ten cones set in a pin triangle, scoring points for knockdowns and bonuses for a spare or strike.",
        keyPhrases: [
          "Aim for the lead cone!",
          "Strike through the ball, then follow through!",
          "Head down, eyes on the ball!",
        ],
        setupDiagram: "10 cones in a bowling-pin triangle, shooting line 15 paces away",
        quickProgression: {
          easier: "Closer shooting line, fewer or wider-spread cones",
          harder: "Longer distance, weak foot only, call your target",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Set up 10 cones in a bowling-pin triangle (4-3-2-1 rows, 1 pace apart)",
            "Mark a shooting line 15 paces from the lead cone",
            "Have spare cones ready for quick resets between shooters",
            "Decide turn order so waiting time stays short",
          ],
          mindset:
            "This is a shooting technique activity wearing a game costume. The scoring keeps it fun, but your coaching focus should stay on strike technique and follow-through - the score is just the hook that keeps them engaged with a repetitive, high-touch shooting task.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Beside the shooting line",
            script:
              "SAY: 'Ten pins, two rolls - knock them all down!' Demo one shot. Explain spare (15 points) and strike (20 points).",
            anticipatedResponses: {
              "What if I miss everything?": "That's okay - zero this frame, try again next frame!",
              "Do I have to use my strong foot?": "For now yes - we'll try weak foot in the challenge round!",
            },
            troubleshooting: {
              "Cones scattering unevenly": ["Reset to the triangle formation before each new shooter"],
            },
          },
          {
            phase: "Round 1 - First Frame",
            duration: "3 minutes",
            coachPosition: "Beside the pins, resetting and counting",
            script:
              "Run through the group one at a time. Call out: 'Aim at the front cone!' Reset cones between shots.",
            troubleshooting: {
              "Long wait between turns": ["Run two lines with two pin setups if space allows"],
              "Toe-poking shots": ["Cue: 'Use your laces - bigger surface, more control!'"],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "At the shooting line, everyone gathered",
            script:
              "Demo striking the lead cone with a full follow-through. 'My foot keeps going after contact - that's power AND accuracy.'",
          },
          {
            phase: "Round 2 - Full Frame with Scoring",
            duration: "3 minutes",
            coachPosition: "Beside the pins, tracking scores aloud",
            script:
              "Run a second frame. Call out scores and celebrate spares and strikes enthusiastically.",
          },
          {
            phase: "Challenge Round",
            duration: "2 minutes",
            coachPosition: "Beside the shooting line",
            script:
              "Pick one: Long Distance Bowling or Weak Foot Bowling. Celebrate every knockdown, not just spares and strikes.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Beside the pins",
            script:
              "ASK: 'What helped you knock down more pins?' Connect to real shooting: picking a target, striking through, following through. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Everyone striking or getting spares regularly",
              "No real challenge left",
            ],
            solutions: [
              "Move the shooting line back",
              "Weak foot only",
              "Require calling the target cone before shooting",
              "Add a time limit per shot",
            ],
          },
          tooHard: {
            symptoms: [
              "Shots consistently missing all cones",
              "Frustration building after repeated misses",
            ],
            solutions: [
              "Move the shooting line closer",
              "Use fewer, wider-spread cones",
              "Allow a rolling start-up touch before the shot",
              "Widen the pin triangle",
            ],
          },
        },
        playerBehavior: {
          longWaitBetweenTurns: {
            symptoms: ["Players losing focus while waiting", "Side conversations, wandering"],
            approach: "Run two lines with two pin setups if space allows, or shorten each turn to one shot per pass.",
          },
          arguingOverScore: {
            symptoms: ["Disputes about how many cones fell or who touched the ball first"],
            approach: "Coach calls the official count; keep it light and move on quickly to the next shooter.",
          },
          rushingShots: {
            symptoms: ["Shooting without setting up, poor technique on most attempts"],
            approach: "SAY: 'Take a breath, pick your target, then shoot!' Slow the pace down deliberately.",
          },
        },
        environmentalIssues: {
          windyConditions: {
            symptoms: ["Cones blowing over between shots", "Ball drifting off line"],
            solution: "Use heavier cones, move to a sheltered area, or switch to disc cones.",
          },
          unevenSurfaceAffectingRoll: {
            symptoms: ["Ball bouncing or curving unpredictably before reaching the pins"],
            solution: "Move to a flatter section of the field, or shorten the shooting distance.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Shooting",
            domain: "Technical",
            howItDevelops:
              "Repeated shots at a fixed target build strike technique, accuracy, and the follow-through habit that carries directly to shooting at goal.",
            levelIndicators: {
              1: "Inconsistent contact; ball often misses all cones",
              2: "Occasionally hits the target area but lacks power or accuracy",
              3: "Regularly strikes cleanly and hits the intended area",
              4: "Consistently aims for and hits specific cones with a strong follow-through",
              5: "Reliably produces spares and strikes by placing shots precisely",
            },
            assessmentNotes:
              "Watch the plant foot, contact point, and follow-through direction - not just whether cones fall.",
          },
        ],
        secondarySkills: [
          {
            skill: "Confidence",
            domain: "Psychological",
            howItDevelops:
              "Frequent, low-pressure scoring opportunities in a fun format build shooting confidence that carries into game situations.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "Young players often avoid shooting practice that feels repetitive or high-pressure. Soccer Bowling disguises pure shooting repetition as a fun, scorable game, giving players dozens of shots at a fixed target with instant, visible feedback.",
        whenToUseIt: {
          idealFor: [
            "Introducing or reinforcing shooting technique in a low-pressure format",
            "Building shooting confidence in younger or newer players",
            "A fun station within a rotation of skill stations",
          ],
          avoidWhen: [
            "The group needs game-realistic shooting under defensive pressure",
            "Space cannot fit a safe 15-pace shooting lane",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Shooting Technique Stations",
              reason: "Introduces the basic strike mechanics this activity then reinforces through repetition",
            },
            {
              activity: "Passing Accuracy Challenge",
              reason: "Builds the same target-striking accuracy with a lower-stakes passing action first",
            },
          ],
          after: [
            {
              activity: "World Cup",
              reason: "Moves shooting technique into a live, game-realistic scoring environment",
            },
            {
              activity: "Crossing and Finishing",
              reason: "Applies accurate striking technique to first-time finishes under more game-like conditions",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach:
              "Keep it playful and celebratory - the scoring system (spare, strike) is exciting at this age. Focus feedback on effort and contact, not accuracy.",
            keyPhrases: ["Can you knock down the front one?", "Big swing through the ball!"],
            avoidSaying: ["You missed again", "That wasn't a real strike"],
            duration: "6-7 minutes",
            simplifications: [
              "Move the line closer, 8-10 paces",
              "Use fewer, larger-spaced cones",
              "Skip strict scoring - just celebrate knockdowns",
            ],
          },
          ages9to11: {
            approach: "Introduce the full scoring system and technique cues about follow-through and target selection.",
            keyPhrases: ["Aim for the lead cone!", "Can you beat your last frame?"],
            avoidSaying: ["You should be better at this by now"],
            duration: "8-10 minutes",
            challenges: ["Long Distance Bowling", "Weak Foot Bowling"],
          },
          ages12to14: {
            approach: "Add precision demands - calling targets, competing on consistency, connecting to real shooting scenarios.",
            keyPhrases: ["Call your target before you shoot", "Where would this shot go on a real goal?"],
            avoidSaying: ["This is too easy for you"],
            duration: "10 minutes",
            challenges: ["Team Bowling League", "Call-your-target rule", "Time limit per shot"],
          },
        },
        commonMisconceptions: {
          "This is just a fun game, not real training":
            "Every shot is a genuine repetition of shooting technique - the fun format just increases how many quality reps players willingly take.",
          "Power matters more than accuracy":
            "A well-placed shot at the lead cone often topples several pins; a hard shot that misses scores nothing - accuracy and technique matter more than raw power.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Soccer Bowling is shooting practice in disguise - your child gets dozens of repetitions striking a target, which builds the technique and confidence they need to shoot accurately at a real goal.",
        newsletter:
          "This week: Soccer Bowling! Players took turns striking shots at ten cones set up like bowling pins, scoring points for every knockdown and bonus points for a spare or strike. It's a fun way to build shooting accuracy and follow-through technique.",
        whatToWatchFor: [
          "Does your child follow through toward the target after striking the ball?",
          "Are they aiming at a specific cone, or just kicking generally in that direction?",
          "Is their confidence building shot to shot, even after a miss?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Tripping over cones set up in the shooting lane",
            prevention: "Keep cones clearly visible and only in the pin area, not the shooter's approach path",
            response: "Check the player, reset the area, and remind players to stay behind the shooting line",
          },
          {
            risk: "Players standing too close to the pins during someone else's shot",
            prevention: "Establish a clear waiting area away from the pin zone and shooting lane",
            response: "Pause play, reposition players, and reinforce the waiting area before continuing",
          },
          {
            risk: "Ball rebounding unpredictably off cones toward bystanders",
            prevention: "Keep non-shooting players behind the shooter or well off to the side, not downrange",
            response: "Check for injury; adjust standing positions before the next shot",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Allow a stationary or walking approach to the shot rather than a running strike",
          visionImpairments: "Use brightly colored cones and verbal guidance on target direction",
          attentionChallenges: "Keep turns short and frequent so waiting time between shots stays brief",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players following through toward the target, or just poking at the ball?",
          "Was the shooting distance appropriately challenging for this group?",
          "Did everyone get enough turns given the group size and time available?",
          "Were players building confidence, or getting frustrated by misses?",
        ],
        forImprovement: [
          "Should I adjust the shooting distance next time?",
          "Who needs extra encouragement or a closer distance to build confidence?",
          "Which variation would fit this group's skill level best next time?",
          "How can I connect the scoring more explicitly to real shooting technique in the debrief?",
        ],
      },
    },
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
    description:
      "A small-sided scrimmage with a goal on each side of the square - either team can score in any of the four, so the picture is always changing. Forces constant scanning, quick decisions, and switching the point of attack to find the open goal.",
    sport: "soccer",
    activityType: "fun",
    difficulty: "intermediate",
    minPlayers: 10,
    maxPlayers: 16,
    durationMinutes: 15,
    skillsDeveloped: ["finding-space", "positional-awareness"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 4 small goals (2 cones each, 3 paces wide) or 8 cones\n□ Pinnies for two teams\n□ 2-3 balls (one in play, spares nearby)\n\nSPACE: 40x40 paces\n\nSETUP STEPS\n1. Mark a 40x40 pace square\n2. Place one small goal (3 paces wide) at the midpoint of each of the four sides\n3. Split into two even teams with pinnies\n4. Both teams can attack and defend ALL four goals - there are no assigned sides\n\nDIAGRAM\n┌─────────────⊏⊐─────────────┐\n│                             │\n│                             │\n⊏⊐          40x40           ⊏⊐\n│           paces             │\n│                             │\n└─────────────⊏⊐─────────────┘\n\n⊏⊐ = goal (3 paces wide, one per side)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of the square\n\nSAY: "Welcome to Four Goals Chaos! There\'s a goal on every side - and BOTH teams can score in ANY of them. No assigned goals, no offside, just find the open one!"\n\nSAY: "After a goal, the other team gets the ball right away and we keep playing. Most goals after 10 minutes of play wins. Ready? Let\'s go!"\n\n\nPHASE 2: ROUND 1 - OPEN CHAOS (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Play ball! Find the open goal!"\n\nCoach Position: Outside the square, moving to see all four goals\n\nWATCH FOR:\n□ Are players fixated on one goal even when it\'s crowded?\n□ Is anyone scanning before receiving the ball?\n□ Is defending organized, or is everyone chasing the ball?\n\nPHRASES TO USE:\n• "Check over your shoulder - what\'s open?"\n• "Nice switch to the open side!"\n• "Who\'s covering the far goal?"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze! Look around - right now, which goal is the MOST open?"\n\nLet players point and answer.\n\nSAY: "That\'s the skill! You can\'t just run at the first goal you see - scan ALL FOUR, then attack the one with the fewest defenders. Same in a real game - scan for space before you decide!"\n\n\nPHASE 4: ROUND 2 - APPLY THE LESSON (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same game - but now I want to see you SWITCH the point of attack when a goal gets crowded. Play on!"\n\nCoach Position: Roaming, calling out good scanning\n\nPHRASES TO USE:\n• "Great switch - found the open one!"\n• "Talk to each other on defense - who has who?"\n• "Quick decision - don\'t hold it too long!"\n\n\nPHASE 5: CHALLENGE ROUND (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE:\n\nOption A - Assigned Goals:\nSAY: "New rule - each team now defends two specific goals and attacks the other two. More structure, still fast!"\n\nOption B - Moving Goals:\nSAY: "Once a minute, I\'ll have one player from each team move their goal to a new spot! Stay aware - the picture keeps changing!"\n\nRun the challenge for the remaining time.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great chaos! What did you have to do differently with four goals instead of one?"\n\nListen for: "Look around more," "Talk to my teammates on defense," "Switch the ball to the open side"\n\nSAY: "That constant scanning is exactly what the best players do in every real game - even with just one goal to defend! Nice work - water break!"',
    diagram:
      "┌─────────────⊏⊐─────────────┐\n│                             │\n│                             │\n⊏⊐          40x40           ⊏⊐\n│           paces             │\n│                             │\n└─────────────⊏⊐─────────────┘\n\n⊏⊐ = goal (3 paces wide, one per side)",
    coachingPoints: [
      "SCAN CONSTANTLY → Say: 'Check over your shoulder - which goal is open right now?'",
      "QUICK DECISIONS → Say: 'See it, decide, go - don't hold the ball while you think!'",
      "SWITCH TO THE OPEN GOAL → Say: 'If this side is crowded, switch the point of attack!'",
      "TALK ON DEFENSE → Say: 'Call out who you have - four goals means everyone has to communicate!'",
    ],
    questionsToAsk: [
      "'Which goal is most open right now?' → Develops constant scanning habits",
      "'How do you defend four goals with one team?' → Looking for: communication, covering the nearest threat, and quick recovery runs",
      "'What do you look for before deciding where to attack?' → Space, numbers, and which goal has the fewest defenders",
      "'How is this like a real game with only one goal?' → Scanning for space and open passing lanes never stops, even with one target",
    ],
    commonMistakes: [
      "TUNNEL VISION ON ONE GOAL → Say: 'Lift your head - there are three other goals to check!'",
      "POOR DEFENSIVE ORGANIZATION → Say: 'Talk to each other - who's covering which goal?'",
      "NOT SCANNING BEFORE RECEIVING → Say: 'Check your shoulder before the ball arrives, not after!'",
      "HOLDING THE BALL TOO LONG → Say: 'See the open goal, then go - quick decisions win this game!'",
    ],
    variations: [
      {
        name: "Assigned Goals",
        description:
          "Each team defends two specific goals and attacks the other two - adds structure while keeping the switching-play demand.",
        difficulty: "intermediate",
      },
      {
        name: "Moving Goals",
        description:
          "Once a minute, one player per team relocates their team's goal to a new spot on the square, keeping the picture constantly changing.",
        difficulty: "advanced",
      },
      {
        name: "Two-Touch Chaos",
        description:
          "Limit every player to two touches maximum, forcing faster scanning and quicker decisions about which goal to attack.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Constant confusion about which goal to attack or defend\n• Nobody scoring, low-quality chances\n• Players standing still, overwhelmed by options\n\nSOLUTIONS:\n• Reduce to two goals instead of four\n• Assign each team specific goals to attack and defend\n• Enlarge the goals to 4-5 paces wide\n• Coach calls out the open goal periodically to guide decisions",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Quickly identifying and switching to open goals\n• Organized, communicating defense\n• Asking for more challenge\n\nSOLUTIONS:\n• Remove goalkeepers if currently used\n• Add the Moving Goals variation\n• Limit touches to two per player\n• Shrink the goals to 2 paces wide for a bigger accuracy demand",
    equipmentNeeded: ["4 small goals", "Pinnies", "2-3 balls"],
    spaceRequired: "medium",
    indoorSuitable: false,
    appropriateStages: ["skill-building", "development"],
    tags: ["fun", "game", "chaos", "decision-making"],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "A four-goal scrimmage where either team can score anywhere - forces constant scanning, quick decisions, and switching play to find the open goal.",
        keyPhrases: [
          "Check over your shoulder - what's open?",
          "Switch to the open side!",
          "Talk to each other on defense!",
        ],
        setupDiagram:
          "40x40 pace square, one small goal on each side, two teams, both can score in any goal",
        quickProgression: {
          easier: "Fewer goals, assigned attacking goals, bigger goals",
          harder: "Moving goals, two-touch limit, no goalkeepers",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a 40x40 pace square and place a small goal at the midpoint of each side",
            "Split into two even teams with pinnies",
            "Have 2-3 balls ready so restarts after a goal are instant",
            "Decide your time cap in advance (10 minutes of play is standard)",
          ],
          mindset:
            "The chaos is the point - resist the urge to over-organize it early. Let players feel the disorientation of four goals first, then use the teaching moment to introduce scanning and switching as the solution they discover, not a rule you hand them.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center of the square",
            script:
              "SAY: 'Four goals, either team can score in any of them! After a goal, the other team restarts immediately.' Point out all four goals.",
            anticipatedResponses: {
              "Which goal is mine?": "All of them - and you have to defend all four too!",
              "What happens after a goal?": "Other team gets the ball right away - keep playing!",
            },
            troubleshooting: {
              "Confusion about which goal to defend": [
                "Let the first minute of chaos play out before correcting - it's the learning moment",
              ],
            },
          },
          {
            phase: "Round 1 - Open Chaos",
            duration: "4 minutes",
            coachPosition: "Outside the square, moving to see all four goals",
            script:
              "Let it play. Call out: 'What's open?' 'Nice switch!' Watch for tunnel vision and disorganized defending.",
            troubleshooting: {
              "Everyone chasing the ball in a pack": [
                "Point out an open goal: 'Look - nobody's defending that one!'",
              ],
              "One goal never attacked": ["Highlight it: 'That goal's wide open the whole time!'"],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "Center, everyone gathered",
            script:
              "Freeze play. ASK: 'Which goal is most open right now?' Let them point and answer. 'Scan all four, then attack the least-defended one.'",
          },
          {
            phase: "Round 2 - Apply the Lesson",
            duration: "4 minutes",
            coachPosition: "Roaming, calling out good scanning",
            script: "Play resumes. Praise switches of play and organized defensive calls.",
          },
          {
            phase: "Challenge Round",
            duration: "4 minutes",
            coachPosition: "Roaming",
            script:
              "Pick one: Assigned Goals (more structure) or Moving Goals (more chaos). Match the choice to how the group handled Round 2.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'What did four goals make you do differently?' Connect to scanning and communication in any real game. Water break!",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Goals coming very easily with little resistance",
              "No real defensive organization needed",
            ],
            solutions: [
              "Remove goalkeepers",
              "Add the Moving Goals variation",
              "Limit touches to two per player",
              "Shrink goal size",
            ],
          },
          tooHard: {
            symptoms: [
              "Nobody scoring across multiple minutes",
              "Total confusion about roles",
              "Players standing still, overwhelmed",
            ],
            solutions: [
              "Reduce to two goals",
              "Assign attacking goals per team",
              "Enlarge the goals",
              "Coach calls out the open goal periodically",
            ],
          },
        },
        playerBehavior: {
          ballWatching: {
            symptoms: ["Players following the ball instead of tracking open goals"],
            approach:
              "SAY: 'Don't just watch the ball - watch the goals too!' Point out an open goal mid-play.",
          },
          oneGoalIgnored: {
            symptoms: ["One goal never gets attacked or defended the whole round"],
            approach: "Highlight it out loud: 'That goal's been open the entire time - who's going to use it?'",
          },
          argumentsOverWhichGoal: {
            symptoms: ["Players disputing who should be defending which goal"],
            approach:
              "Keep it simple: 'Everyone defends the nearest threat - if you're closest, you're responsible.'",
          },
        },
        environmentalIssues: {
          unevenGoalSpacing: {
            symptoms: ["One or two goals much easier to reach than others"],
            solution: "Re-measure and re-center all four goals on their sides before continuing.",
          },
          notEnoughBallsForQuickRestarts: {
            symptoms: ["Long pauses after goals while chasing down the ball"],
            solution: "Keep 2-3 spare balls at the halfway point for instant restarts.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Finding Space",
            domain: "Tactical",
            howItDevelops:
              "With four possible scoring targets, players must constantly identify which space and which goal offer the best opportunity, sharpening their ability to read open space under pressure.",
            levelIndicators: {
              1: "Attacks the nearest goal regardless of defensive numbers",
              2: "Occasionally recognizes an open goal but reacts slowly",
              3: "Regularly identifies and moves toward open space and goals",
              4: "Anticipates where space will open and positions early",
              5: "Consistently exploits the least-defended goal before defenders can react",
            },
            assessmentNotes:
              "Watch decision speed after receiving the ball - do they scan before or after they already have possession?",
          },
          {
            skill: "Positional Awareness",
            domain: "Tactical",
            howItDevelops:
              "Defending four goals at once forces players to understand their position relative to teammates, opponents, and multiple targets simultaneously.",
            levelIndicators: {
              1: "Ball-watches; unaware of goals behind or beside them",
              2: "Aware of the nearest goal only",
              3: "Tracks 2-3 goals and adjusts position accordingly",
              4: "Maintains awareness of all four goals and communicates coverage",
              5: "Organizes teammates' positioning proactively based on the full picture",
            },
            assessmentNotes:
              "Listen for communication - are players calling out coverage, or reacting silently and late?",
          },
        ],
        secondarySkills: [
          {
            skill: "Teamwork",
            domain: "Psychological",
            howItDevelops:
              "Defending four goals is impossible without communication and shared responsibility, building collaborative defensive habits.",
          },
          {
            skill: "Support Play",
            domain: "Tactical",
            howItDevelops:
              "Attackers must support the ball carrier toward whichever goal is open, reinforcing off-ball movement in service of a fluid target.",
          },
        ],
      },
      developmentalContext: {
        whyThisActivity:
          "Most small-sided games have one clear target, which lets players get away with tunnel vision. Four Goals Chaos removes that crutch - with four live targets, scanning and quick decision-making become necessary just to function, not optional extras.",
        whenToUseIt: {
          idealFor: [
            "Reinforcing scanning habits built in warm-up activities like Gates Dribbling",
            "Building communication and organization on defense",
            "A high-energy, high-fun main activity for skill-building or development groups",
          ],
          avoidWhen: [
            "The group is brand new to small-sided games and needs a single clear target first",
            "Fewer than 10 players are available (the chaos needs enough bodies to matter)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Small-Sided Game 5v5",
              reason: "Builds comfort with basic small-sided game structure and a single goal before adding chaos",
            },
            {
              activity: "Gates Dribbling",
              reason: "Establishes the head-up scanning habit this game then demands under game pressure",
            },
          ],
          after: [
            {
              activity: "6v6 Half Field Game",
              reason: "Returns to a single-goal format so players apply their sharpened scanning to standard game shape",
            },
            {
              activity: "Positional Rondo",
              reason: "Reinforces the same scanning and quick-decision demands in a possession-focused format",
            },
          ],
        },
        ageAdaptations: {
          ages9to11: {
            approach:
              "Introduce with a walkthrough of all four goals before playing; keep early rounds untimed so players adjust to the format without pressure.",
            keyPhrases: ["Which goal is open?", "Look before you decide!"],
            avoidSaying: ["You should already know which goal to defend"],
            duration: "10-12 minutes",
            simplifications: ["Start with two goals, add the other two once comfortable", "Bigger goals"],
          },
          ages12to14: {
            approach:
              "Run the full four-goal chaos format with organized defensive expectations and tactical debriefs between rounds.",
            keyPhrases: ["Talk to your teammates - who's covering what?", "Switch the point of attack!"],
            avoidSaying: ["Just figure it out yourselves"],
            duration: "15 minutes",
            challenges: ["Moving Goals", "Two-Touch Chaos", "No goalkeepers"],
          },
        },
        commonMisconceptions: {
          "This is just disorganized fun, not real tactics":
            "Scanning four live targets and organizing defensive coverage on the fly is advanced tactical thinking - the chaos is the training stimulus, not a bug.",
          "More goals means less defense matters":
            "Defending four goals actually demands MORE communication and organization than defending one, not less.",
        },
      },
      parentCommunication: {
        ifAsked:
          "Four Goals Chaos gives your child four possible scoring targets at once, which forces them to constantly look around and make quick decisions - exactly the awareness that separates players who see the whole game from players who only see the ball.",
        newsletter:
          "This week: Four Goals Chaos! With a goal on every side of the field and both teams able to score anywhere, players had to scan constantly and communicate on defense. This game builds the vision and quick decision-making that carries into every real match, even with just one goal.",
        whatToWatchFor: [
          "Does your child scan around before deciding where to attack?",
          "Are they communicating with teammates about defensive coverage?",
          "Do they switch the point of attack when their first option is crowded?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions near crowded goals",
            prevention: "Keep goals adequately spaced and remind players to play under control near the goal mouth",
            response: "Check players involved; briefly pause play if needed",
          },
          {
            risk: "Disorientation leading to running into another play near a different goal",
            prevention: "Ensure the square is large enough for the number of players (40x40 paces for 10-16 players)",
            response: "Pause and reset positioning if the space feels too crowded",
          },
        ],
        inclusionConsiderations: {
          cognitiveLoad:
            "Some players may find tracking four goals overwhelming at first - start with two goals and add the other two once they're comfortable",
          attentionChallenges:
            "Assign a single goal to focus on initially, expanding to full awareness of all four as confidence builds",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players scanning before receiving the ball, or only after?",
          "Was defensive communication happening, or was it disorganized chasing?",
          "Did the group need more or less structure (fewer goals, assigned goals) than I planned for?",
          "Which players showed the biggest improvement in decision speed over the session?",
        ],
        forImprovement: [
          "Should I start with fewer goals next time and build up?",
          "Which challenge variation fit this group's readiness level?",
          "How can I make the defensive communication expectation clearer next time?",
          "Who needs individual follow-up on scanning habits?",
        ],
      },
    },
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
  {
    slug: "inside-outside-slalom",
    name: "Inside-Outside Slalom",
    description: "Players weave through their own lane of cones, alternating inside and outside touches on every step to build the two-surface control that lets them change direction without stopping the ball.",
    sport: "soccer",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 8,
    skillsDeveloped: ["dribbling-with-inside-outside", "ball-control"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ 5 cones per lane (4-6 lanes depending on group size)\n□ Pinnies (optional, for partner variation)\n\nSPACE: 20x15 paces (adjust lane count to group size)\n\nSETUP STEPS\n1. Lay out 4-6 parallel lanes, each with 5 cones spaced 2 paces apart\n2. Mark a START line at one end of every lane and a FINISH line at the other\n3. Put 1-2 players per lane with a ball each\n4. If more players than lane space, pair up and alternate turns quickly - keep waits under 10 seconds\n\nDIAGRAM\n┌──────────────────────────────────────┐\nSTART ▲   ▲   ▲   ▲   ▲  FINISH   Lane 1\nSTART ▲   ▲   ▲   ▲   ▲  FINISH   Lane 2\nSTART ▲   ▲   ▲   ▲   ▲  FINISH   Lane 3\nSTART ▲   ▲   ▲   ▲   ▲  FINISH   Lane 4\n└──────────────────────────────────────┘\n        2 paces between cones",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Front of the lanes, ball at feet\n\nSAY: "Everyone grab a ball and stand at the start of your lane! Today we\'re using TWO parts of your foot - the inside and the outside - like two doors that open different ways."\n\nDEMO: Touch the ball with the inside of your foot - it rolls toward your other leg. Touch with the outside - it rolls away.\n\nSAY: "Inside pulls it in, outside pushes it out. We\'re going to use both to weave through the cones without stopping!"\n\n\nPHASE 2: ROUND 1 - WALK IT THROUGH (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "First time through, go slow. At every cone, touch with inside, then outside, then inside again - inside, outside, inside, outside!"\n\nCoach Position: Walk alongside a lane, then move to the next\n\nWATCH FOR:\n□ Are they using both surfaces, or just the inside?\n□ Is the ball staying within a small pocket near their feet?\n□ Are they stopping to switch feet?\n\nPHRASES TO USE:\n• "Small touches - the ball is right there with you!"\n• "Which part of your foot just touched it?"\n• "Don\'t stop - keep the rhythm going!"\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone come here and watch." \n\nDEMO: Go through 2 cones slowly, narrating: "Inside touch - ball moves this way. Outside touch - ball moves that way. See how I never stop moving?"\n\nSAY: "The ball should feel like it\'s glued to your feet the whole time - not way out in front."\n\n\nPHASE 4: ROUND 2 - BEAT YOUR TIME (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "This time, go as fast as you can while staying in control. I\'ll count how long it takes you. Ready... GO!"\n\nCoach Position: Roaming, timing individuals\n\nFEEDBACK:\n• "Nice - I saw inside AND outside that time!"\n• "Slow down just a touch so you don\'t lose it around cone 3!"\n• "Great rhythm - inside, outside, inside, outside!"\n\n\nPHASE 5: CHALLENGE ROUND (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE challenge:\n\nOption A - Weak Foot Only:\nSAY: "This time, ONLY your weaker foot touches the ball - both inside and outside on that same foot. It\'s okay to go slower!"\n\nOption B - Called Touches:\nSAY: "I\'ll call out \'inside\' or \'outside\' as you go - you touch with whichever I call!"\n\nRun the challenge. Celebrate every attempt, especially on the weak foot.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great work! Which touch felt easier today - inside or outside?"\n\nListen for: "inside" (most common at this age) - normalize it\n\nSAY: "That\'s totally normal - outside just needs more practice, and every practice you do makes it feel more natural. In a game, having both means a defender never knows which way you\'re going. Water break!"',
    diagram:
      "┌──────────────────────────────────────┐\nSTART ▲   ▲   ▲   ▲   ▲  FINISH   Lane 1\nSTART ▲   ▲   ▲   ▲   ▲  FINISH   Lane 2\nSTART ▲   ▲   ▲   ▲   ▲  FINISH   Lane 3\n└──────────────────────────────────────┘",
    coachingPoints: [
      "ALTERNATE SURFACES → Say: 'Inside, outside, inside, outside - like a rhythm!'",
      "SMALL TOUCHES → Say: 'The ball stays close, like it's glued to your feet!'",
      "NO STOPPING → Say: 'Keep moving through the whole lane - don't pause to switch feet!'",
      "BOTH FEET EVENTUALLY → Say: 'Your strong foot first, then let's try your other one too!'",
    ],
    questionsToAsk: [
      "'Which touch pulls the ball toward you, and which pushes it away?' → Builds the mental model of inside vs. outside",
      "'What happens to the ball if your touch is too big?' → It escapes the lane / rolls into a cone",
      "'Why would a defender have a harder time if you can use both feet surfaces?' → Unpredictability, more directions to go",
      "'How is this like changing direction in a real game?' → Beating a defender by cutting a different way",
    ],
    commonMistakes: [
      "ONLY USING INSIDE → Say: 'Now show me the outside of your foot - point your toes in and roll it out!'",
      "BIG TOUCHES THAT LOSE THE BALL → Say: 'Tiny touches - just enough to keep moving!'",
      "STOPPING TO SWITCH FEET → Say: 'Keep your feet moving even between touches - no full stops!'",
      "LOOKING ONLY AT THE BALL → Say: 'Quick peek at the ball, then peek at the next cone!'",
    ],
    variations: [
      {
        name: "Called Touches",
        description: "Coach or a teammate calls 'inside' or 'outside' as the player approaches each cone, forcing a quick decision instead of a memorized pattern.",
        difficulty: "intermediate",
      },
      {
        name: "Weak Foot Lane",
        description: "Entire lane must be completed using only the non-dominant foot for both inside and outside touches.",
        difficulty: "intermediate",
      },
      {
        name: "Partner Shadow",
        description: "A partner without a ball mirrors the dribbler's footwork one step behind, reinforcing the movement pattern.",
        difficulty: "beginner",
      },
      {
        name: "Race Lanes",
        description: "Two players in parallel lanes race side by side, first to a controlled finish wins.",
        difficulty: "advanced",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Ball rolls away or hits cones repeatedly\n• Only ever uses inside of foot\n• Stops completely between every cone\n• Frustrated or wants to skip cones\n\nSOLUTIONS:\n• Widen cone spacing to 3 paces\n• Remove alternating requirement - let them use any foot part first, add inside/outside later\n• Reduce to 3 cones per lane\n• Coach walks beside them narrating each touch\n• Let them dribble around cones instead of directly at them at first",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Smooth, unbroken rhythm through the whole lane\n• Comfortable with both surfaces on strong foot\n• Getting bored or asking to go faster\n\nSOLUTIONS:\n• Narrow cone spacing to 1.5 paces\n• Require weak foot for the whole lane\n• Add a timed element (beat your best)\n• Add a defender at the end of the lane to beat with a final move\n• Combine with a finish (shoot after the last cone)",
    equipmentNeeded: ["1 ball per player", "5 cones per lane (20-30 total)"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "technical",
      "dribbling",
      "inside-outside",
      "ball-control",
      "beginner-friendly",
      "individual",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Dribble through a personal cone lane alternating inside and outside touches on every step - the foundation move for changing direction with the ball.",
        keyPhrases: [
          "Inside, outside, inside, outside - like a rhythm!",
          "Small touches - the ball stays with you!",
          "Keep moving - no stopping to switch feet!",
        ],
        setupDiagram: "4-6 lanes of 5 cones, 2 paces apart, one ball per player",
        quickProgression: {
          easier: "Wider cone spacing, drop the strict alternating pattern, fewer cones",
          harder: "Narrower spacing, weak foot only, timed races, called touches",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Lay out 4-6 lanes of 5 cones each, 2 paces apart",
            "Count cones needed: 5 per lane",
            "Decide pairing if group is larger than available lanes",
            "Have a ball ready per player",
          ],
          mindset:
            "This is a technique activity, not a race - at least not yet. Your job is to get players feeling the difference between inside and outside touches. Most players default to inside only; your repeated cue is simply 'now the outside' until it becomes automatic. Celebrate any attempt at the outside touch, even a clumsy one.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Front of the lanes",
            script:
              "SAY: 'Inside pulls the ball in, outside pushes it away. We're going to use both to weave through the cones.' Demo one touch of each.",
            anticipatedResponses: {
              "Which foot do I use?":
                "Start with your strong foot - we'll try the other one later!",
              "What if I miss a cone?":
                "Keep going - just get back in the rhythm at the next one.",
            },
            troubleshooting: {
              "Players don't know left from right foot instinctively": [
                "Point to the ball: 'touch it with THIS side' while demonstrating",
              ],
            },
          },
          {
            phase: "Round 1 - Walk It Through",
            duration: "90 seconds",
            coachPosition: "Walking alongside a lane",
            script:
              "Encourage slow, deliberate alternation: 'Inside, outside, inside, outside.' Praise any outside-foot attempt.",
            troubleshooting: {
              "Ball escaping the lane": [
                "Have them slow down further or widen the lane temporarily",
              ],
              "Only using inside foot": [
                "Stand at one cone and say 'outside' as they arrive at it",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "At the front cone, everyone gathered",
            script:
              "Demo two cones slowly, narrating each touch: 'Inside - ball moves this way. Outside - ball moves that way. I never stop moving.'",
          },
          {
            phase: "Round 2 - Beat Your Time",
            duration: "90 seconds",
            coachPosition: "Roaming, timing individuals informally",
            script:
              "Personal challenge to go faster while staying controlled. Specific feedback on which surfaces you saw them use.",
          },
          {
            phase: "Challenge Round",
            duration: "90 seconds",
            coachPosition: "Roaming",
            script:
              "Pick one challenge: weak foot only, or called touches (you or a partner calls 'inside'/'outside' as they approach each cone).",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Front of lanes",
            script:
              "ASK: 'Which touch felt easier today?' Normalize that inside usually feels easier at first. Connect to games: two options means a defender can't guess which way you're going.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Smooth, fast laps with no ball loss",
              "Asking to go faster or add something",
            ],
            solutions: [
              "Narrow the cone spacing",
              "Require weak foot",
              "Add a timed race",
              "Add a finishing move or shot after the last cone",
            ],
          },
          tooHard: {
            symptoms: [
              "Ball repeatedly hits cones or rolls away",
              "Frequent full stops",
              "Visible frustration",
            ],
            solutions: [
              "Widen cone spacing to 3-4 paces",
              "Drop the strict alternating requirement temporarily",
              "Reduce to 3 cones",
              "Coach walks alongside narrating each touch",
            ],
          },
        },
        playerBehavior: {
          avoidingOutsideFoot: {
            symptoms: [
              "Uses inside touch for every cone, including ones that should be outside",
              "Turns their body awkwardly to use inside instead",
            ],
            approach:
              "SAY: 'Show me the outside of your foot!' and physically point to the outside edge of their shoe if needed. Keep it light - this is genuinely a harder skill and takes reps.",
          },
          rushing: {
            symptoms: ["Sprinting through and losing the ball constantly"],
            approach:
              "SAY: 'Control first, speed is round 2!' Slow the whole group down together.",
          },
        },
        environmentalIssues: {
          notEnoughSpaceForLanes: {
            symptoms: ["Lanes overlapping or too short"],
            solution:
              "Reduce to 3 cones per lane and run more players through fewer lanes with quick rotations.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling with Inside/Outside",
            domain: "Technical",
            howItDevelops:
              "This is the most direct, isolated repetition of the exact touch pattern the skill requires - alternating inside and outside surfaces at a controlled pace before adding speed or defenders.",
            levelIndicators: {
              1: "Uses only inside touch; ball escapes lane frequently; must stop between cones",
              2: "Attempts outside touch but it's heavy; alternates slowly and inconsistently",
              3: "Smooth inside/outside alternation at a jogging pace through the whole lane",
              4: "Fast, controlled alternation with minimal touches; comfortable on both feet",
              5: "Effortless rhythm at speed; could add a move or finish without losing control",
            },
            assessmentNotes:
              "Watch whether the outside touch is present at all, not just how clean it is. Presence before precision.",
          },
        ],
        secondarySkills: [
          {
            skill: "Ball Control",
            domain: "Technical",
            howItDevelops:
              "Keeping the ball in a tight pocket near the feet through repeated small touches builds the same close control needed in traffic during games.",
          },
        ],
        physicalDevelopment: {
          coordination: "Foot-eye coordination alternating between two touch surfaces",
          balance: "Weight transfer between touches while moving forward",
        },
        psychologicalDevelopment: {
          persistence: "Continuing to attempt the harder outside touch instead of reverting to only inside",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Inside/outside dribbling was a known gap - players had no dedicated repetition for the outside-of-foot touch. This activity isolates the exact touch pattern in a low-pressure, no-defender setting so players can build the motor pattern before applying it in games or 1v1 situations.",
        whenToUseIt: {
          idealFor: [
            "Early in practice as a technical warm-up",
            "Right before Gates Dribbling or 1v1-focused activities",
            "When players default to only using their inside foot in games",
          ],
          avoidWhen: [
            "Very limited space for multiple lanes",
            "Group needs pure fun/game format that day (pair with a game like Volcano Dribble instead)",
          ],
        },
        progressionPath: {
          before: [
            { activity: "Ball Mastery Circle", reason: "General ball comfort before an isolated touch pattern" },
            { activity: "Volcano Dribble", reason: "Free dribbling with light obstacle awareness" },
          ],
          after: [
            { activity: "Gates Dribbling", reason: "Applies inside/outside touches while also scanning for gates" },
            { activity: "Copy Cat Dribbling", reason: "Reinforces both surfaces in a reactive, playful format" },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep it playful - frame inside/outside as 'two doors' rather than technical terms",
            keyPhrases: [
              "Open the inside door, open the outside door!",
              "Can you feel the difference?",
            ],
            avoidSaying: ["You're doing it wrong", "That's the wrong foot"],
            duration: "6-7 minutes",
            simplifications: ["Wider spacing", "3 cones instead of 5", "No strict alternating pattern required"],
          },
          ages9to11: {
            approach: "Add the language of 'surfaces' and connect explicitly to beating a defender",
            keyPhrases: ["Which surface fools a defender the most?", "Beat your last time"],
            challenges: ["Weak foot lane", "Called touches", "Timed races"],
            duration: "8-10 minutes",
          },
          ages12to14: {
            approach: "Connect directly to game application and let them self-assess weak-foot gaps",
            keyPhrases: ["Where would this beat a real defender?", "What's your weaker surface - let's target it"],
            challenges: ["Add a defender at lane's end", "Combine with a finish"],
            coachRole: "Facilitate self-assessment of which surface needs more work",
          },
        },
        commonMisconceptions: {
          "This is just a warm-up, not real training":
            "Isolated touch repetition is exactly how the motor pattern for changing direction gets built - it directly transfers to 1v1 and game situations.",
          "Kids should go straight to game speed":
            "Speed without the correct touch surfaces just reinforces the inside-only habit. Slow, correct reps first.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We worked on using both the inside AND outside of the foot to dribble - most kids naturally default to only the inside, so this builds the second 'gear' that lets them change direction quickly and become harder to defend.",
        newsletter:
          "This week: Inside-Outside Slalom! Players wove through cone lanes alternating touches with the inside and outside of their foot. At home, set up two shoes or water bottles a few steps apart and practice touching the ball with each side of the foot in turn - no pressure, just feel for the difference.",
        whatToWatchFor: [
          "Does your child use only their inside foot, or are they starting to try the outside too?",
          "Can they keep the ball close while changing direction, or does it get away from them?",
          "Are they willing to practice with their weaker foot?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Tripping over cones when rushing",
            prevention: "Keep cone spacing appropriate to age/skill; remind to control speed before racing",
            response: "Check for injury; reset cones if knocked over",
          },
          {
            risk: "Ankle rolls on quick direction changes",
            prevention: "Ensure a proper warm-up before this activity; don't start at maximum speed",
            response: "Rest, ice if needed, reduce intensity for the rest of the session",
          },
        ],
        inclusionConsiderations: {
          mobilityDifferences: "Widen spacing and allow walking pace; focus on touch quality over speed",
          coordinationChallenges: "Start with only 2-3 cones and build up; pair with a peer buddy",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did most players attempt the outside touch, even imperfectly?",
          "Was the ball staying close, or drifting away from players?",
          "Did the challenge round match the group's readiness?",
        ],
        forImprovement: [
          "Who needs more 1-on-1 attention on the outside touch next practice?",
          "Should lane spacing change next time?",
          "How can I connect this more directly to the upcoming game activity?",
        ],
      },
    },
  },
  {
    slug: "traffic-cop-dribble",
    name: "Traffic Cop Dribble",
    description: "A fast-reaction dribbling game where players freely dribble in open space and must instantly switch to whichever touch - inside or outside - the 'Traffic Cop' calls out, building automatic use of both surfaces under game-like pressure to react.",
    sport: "soccer",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 7,
    skillsDeveloped: ["dribbling-with-inside-outside", "agility-coordination"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 ball per player\n□ Cones to mark a grid boundary\n□ Pinnie or whistle for the 'Traffic Cop' (optional, for fun)\n\nSPACE: 20x20 paces (adjust to group size)\n\nSETUP STEPS\n1. Mark a grid boundary with cones\n2. Everyone starts inside the grid with a ball\n3. Coach begins as the 'Traffic Cop' - a player can take over later\n4. Review the calls before starting: 'Inside!', 'Outside!', 'Freeze!'\n\nDIAGRAM\n┌────────────────────────────────┐\n│   ○●     ○●        ○●          │\n│         ○●    ○●               │\n│   ○●          ○●     ○●        │  20 paces\n│        ○●          ○●          │\n│   ○●        ○●         ○●      │\n└────────────────────────────────┘\n        20 paces\n○● = player with ball, spread throughout",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid, ball at feet\n\nSAY: "Everyone spread out with your ball and dribble around gently. I\'m the Traffic Cop! When I call \'Inside!\' your very next touch is with the inside of your foot. When I call \'Outside!\' your next touch is with the outside. When I call \'Freeze!\' stop the ball dead!"\n\nDEMO: Call each one yourself and show the touch.\n\nSAY: "Ready? Spread out - here we go!"\n\n\nPHASE 2: ROUND 1 - SLOW CALLS (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Dribbling free - listen for my call!"\n\nCoach Position: Center or edge, calling every 4-5 seconds\n\nCall pattern: "Inside!" ... pause ... "Outside!" ... pause ... "Freeze!" ... pause ... "Inside!"\n\nWATCH FOR:\n□ Are they touching with the correct surface, or just touching the ball at all?\n□ Is the ball staying close enough to react quickly?\n□ Are they colliding with others - heads up?\n\nPHRASES TO USE:\n• "Which part of your foot did that call ask for?"\n• "Keep the ball close so you\'re ready!"\n• "Nice reaction!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone freeze and look at me. If I call \'Inside\' and you touch it with the outside, that\'s okay - this is hard! Let\'s all try one \'Inside\' together." Call it, everyone does it together, check the touch.\n\n\nPHASE 4: ROUND 2 - FASTER CALLS (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same game, but I\'ll call faster now. Stay ready!"\n\nCoach Position: Roaming through the grid\n\nCall every 2-3 seconds, mixing up the order. Give specific praise for correct surface use.\n\n\nPHASE 5: CHALLENGE ROUND (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nChoose ONE challenge:\n\nOption A - Player Traffic Cop:\nSAY: "Who wants to be the Traffic Cop?" Pick a player to make the calls - great for confidence and it lets you watch the whole group.\n\nOption B - Color Cop (see Variations):\nUse colored cones instead of words - hold up a color, players respond with the matching touch.\n\nRun the challenge. Rotate the Cop role if using Option A so several kids get a turn.\n\n\nPHASE 6: WRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great listening and reacting! Which call tricked you the most today?"\n\nListen for: "Outside" (most common) - normalize it as the harder one\n\nSAY: "That reacting-fast feeling is exactly what happens in a game when a defender is closing you down - you don\'t have time to think, your feet just know what to do. That\'s what we\'re building. Water break!"',
    diagram:
      "┌────────────────────────────────┐\n│   ○●     ○●        ○●          │\n│         ○●    ○●               │\n│   ○●          ○●     ○●        │\n│        ○●          ○●          │\n│   ○●        ○●         ○●      │\n└────────────────────────────────┘",
    coachingPoints: [
      "MATCH THE CALL → Say: 'The touch has to match the word - inside means inside!'",
      "STAY REACTION-READY → Say: 'Keep the ball close so you can react the instant you hear the call!'",
      "HEADS UP FOR TEAMMATES → Say: 'Eyes up so you don't bump into anyone while you're listening!'",
      "IT'S OKAY TO MISS → Say: 'If you touch the wrong side, just get the next one right - keep going!'",
    ],
    questionsToAsk: [
      "'How did you know which part of your foot to use?' → Builds conscious awareness of the two surfaces",
      "'Which call tricked you the most?' → Most players will say 'outside' - normalizes it as the harder skill",
      "'How is this like a game, when a defender is right next to you?' → Fast decisions under pressure, not planned moves",
      "'What happens if your ball drifts too far away while you're listening?' → You can't react fast enough",
    ],
    commonMistakes: [
      "TOUCHING WITH THE WRONG SURFACE → Say: 'Freeze - which side did I call? Try that touch now.'",
      "BALL TOO FAR TO REACT → Say: 'Keep it in your bubble so you're always ready!'",
      "NOT REACTING AT ALL → Say: 'Every call needs a touch - even a small one counts!'",
      "WATCHING THE COP INSTEAD OF THE BALL → Say: 'Ears on me, eyes mostly on your ball and the space around you!'",
    ],
    variations: [
      {
        name: "Color Cop",
        description: "Coach holds up colored cones instead of calling words - red cone means inside, blue means outside - adding a visual reaction element.",
        difficulty: "beginner",
      },
      {
        name: "Opposite Day",
        description: "For an older or more advanced group only: the calls are reversed - 'Inside' means touch with the outside, and vice versa. Genuinely tricky; use sparingly and expect lots of laughing mistakes.",
        difficulty: "advanced",
      },
      {
        name: "Partner Cop",
        description: "Partners take turns calling for each other one-on-one instead of a single group-wide caller.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "Slow the calls down to every 5-6 seconds, use a larger grid so there's less collision risk, and let players glance down at their feet before reacting.",
    makeHarder:
      "Speed up the calls to every 1-2 seconds, shrink the grid, and introduce Opposite Day (see Variations) for a group ready for real confusion and laughter.",
    equipmentNeeded: ["1 ball per player", "Cones for grid boundary", "Colored cones (optional, for Color Cop)"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "warmup",
      "dribbling",
      "inside-outside",
      "reactions",
      "fun",
      "listening",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Free-dribble in open space and instantly switch to whichever touch - inside or outside - the Traffic Cop calls, building automatic reactions with both surfaces.",
        keyPhrases: [
          "The touch has to match the call!",
          "Keep the ball close so you can react!",
          "It's okay to miss - just get the next one!",
        ],
        setupDiagram: "20x20 paces open grid, one ball per player, coach or player calling from center",
        quickProgression: {
          easier: "Slower calls, bigger grid, glance-down allowed",
          harder: "Rapid calls, smaller grid, Opposite Day",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Mark a grid boundary sized to the group",
            "Decide who calls first (usually the coach for round 1)",
            "Review the three calls out loud before starting",
          ],
          mindset:
            "This activity is about automaticity, not perfection - players won't get every call right, and that's fine. The goal is that both surfaces start to feel available to them under time pressure, not just the comfortable inside touch. Keep energy high and treat wrong touches as funny, not wrong.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Center of grid",
            script:
              "SAY: 'Inside means touch with the inside, Outside means touch with the outside, Freeze means stop it dead.' Demo each call.",
            anticipatedResponses: {
              "What if I mess up?":
                "Totally fine - just get the next one right!",
              "Can I choose which foot?":
                "Yes, either foot is fine, as long as it's the right side of the foot.",
            },
            troubleshooting: {
              "Players freeze up and don't move at all": [
                "Simplify to just two calls (Inside/Outside) until they're comfortable",
              ],
            },
          },
          {
            phase: "Round 1 - Slow Calls",
            duration: "90 seconds",
            coachPosition: "Center, calling every 4-5 seconds",
            script:
              "Call each option with a pause between. Praise correct surface use specifically, not just 'good job'.",
            troubleshooting: {
              "Players colliding": ["Remind everyone to keep heads up between calls"],
              "Everyone using inside regardless of call": [
                "Slow down further and isolate 'Outside' calls only for a few reps",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone gathered",
            script:
              "Do one call together as a group and check everyone's touch matches. Normalize mistakes on the outside touch.",
          },
          {
            phase: "Round 2 - Faster Calls",
            duration: "90 seconds",
            coachPosition: "Roaming through the grid",
            script:
              "Speed up to every 2-3 seconds. Mix the order unpredictably.",
          },
          {
            phase: "Challenge Round",
            duration: "90 seconds",
            coachPosition: "Roaming or handing off the caller role",
            script:
              "Pick a player Traffic Cop, or switch to Color Cop. Rotate the caller role so multiple kids get a turn leading.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "ASK: 'Which call tricked you most?' Connect to games: reacting fast to a defender without time to think.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: ["Everyone reacting correctly and quickly", "Asking for faster calls"],
            solutions: ["Speed up call frequency", "Shrink the grid", "Introduce Opposite Day"],
          },
          tooHard: {
            symptoms: ["Frequent wrong touches on every call", "Players stopping instead of reacting", "Frustration"],
            solutions: ["Slow calls down", "Drop to only two calls (Inside/Outside)", "Allow a glance down at the ball"],
          },
        },
        playerBehavior: {
          alwaysUsingInside: {
            symptoms: ["Touches with inside regardless of the call"],
            approach:
              "SAY: 'Freeze - show me the outside of your foot!' Isolate 'Outside' calls for a stretch until it starts to register.",
          },
          collisions: {
            symptoms: ["Players bumping into each other while reacting to calls"],
            approach:
              "Widen the grid temporarily and remind players to keep their heads up between touches, not just at the call.",
          },
        },
        environmentalIssues: {
          tooLoudToHearCalls: {
            symptoms: ["Players missing calls due to noise or distance"],
            solution: "Use a whistle plus hand signal (point down for Freeze, sweep in for Inside, sweep out for Outside) alongside the verbal call.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribbling with Inside/Outside",
            domain: "Technical",
            howItDevelops:
              "Reacting to an unpredictable external call forces players to retrieve both touch surfaces under time pressure, moving the skill from a memorized pattern (like a slalom) toward the instinctive, game-speed decision-making the skill ultimately requires.",
            levelIndicators: {
              1: "Touches the ball on any call but rarely matches the correct surface",
              2: "Matches the correct surface roughly half the time, mostly on inside calls",
              3: "Matches the correct surface consistently at a moderate call pace",
              4: "Reacts correctly even at fast call pace without looking down",
              5: "Reacts instantly and can also react to the Player Cop / Opposite Day variations",
            },
            assessmentNotes:
              "Watch specifically for outside-touch accuracy under pressure - that's the harder half of this skill and the best signal of real progress.",
          },
        ],
        secondarySkills: [
          {
            skill: "Agility & Coordination",
            domain: "Physical",
            howItDevelops:
              "Rapid reaction to an auditory cue while managing a ball and other moving players builds reactive agility alongside the technical touch.",
          },
        ],
        physicalDevelopment: {
          reactionTime: "Responding to an unpredictable verbal cue while moving",
          coordination: "Foot-eye-ear coordination under time pressure",
        },
        psychologicalDevelopment: {
          resilience: "Recovering quickly and cheerfully from a wrong-surface touch",
          confidence: "Volunteering to be the Traffic Cop in front of the group",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Inside-Outside Slalom builds the touch pattern in a controlled, predictable order. Traffic Cop Dribble is the necessary next step: it strips away the predictability so players have to retrieve the correct surface on demand, which is much closer to what a real defender forces them to do. It's also a pure fundamentals-stage game format - no lines, constant touches, high fun.",
        whenToUseIt: {
          idealFor: [
            "Right after Inside-Outside Slalom, in the same session",
            "As an energizing warm-up before a technical or game segment",
            "When players show the pattern in isolation but revert to inside-only in games",
          ],
          avoidWhen: [
            "Space is too tight for players to move and react safely",
            "Group is brand new to inside/outside touches with zero prior exposure (start with the Slalom first)",
          ],
        },
        progressionPath: {
          before: [
            { activity: "Inside-Outside Slalom", reason: "Introduces the touch pattern in a controlled, predictable order first" },
            { activity: "Volcano Dribble", reason: "General free-dribbling comfort in open space" },
          ],
          after: [
            { activity: "Gates Dribbling", reason: "Applies both touches while also scanning for targets" },
            { activity: "1v1 to Goal", reason: "Live defender pressure where both surfaces become genuinely useful" },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Keep the Traffic Cop framing playful - it's a game, not a test",
            keyPhrases: ["Freeze like a statue!", "Which door did I open - inside or outside?"],
            avoidSaying: ["You got it wrong", "Pay attention"],
            duration: "5-6 minutes",
            simplifications: ["Only two calls (Inside/Outside), drop Freeze", "Slower call pace", "Bigger grid"],
          },
          ages9to11: {
            approach: "Let a player take the Cop role early - builds ownership and leadership",
            keyPhrases: ["Cop's in charge - listen up!", "React, don't think!"],
            challenges: ["Faster call pace", "Color Cop", "Smaller grid"],
            duration: "7-8 minutes",
          },
          ages12to14: {
            approach: "Introduce Opposite Day and connect explicitly to reading a defender's body language",
            keyPhrases: ["A defender gives you way less warning than I do - stay ready", "What made Opposite Day so hard?"],
            challenges: ["Opposite Day", "Very fast call pace", "Smaller grid with more players"],
            coachRole: "Facilitate discussion connecting reaction speed to real defensive pressure",
          },
        },
        commonMisconceptions: {
          "This is just a fun filler game":
            "The unpredictable, fast-reaction format is exactly what closes the gap between a memorized cone pattern and using both touches instinctively in a real game.",
          "Getting the call wrong means they're behind":
            "Wrong touches are expected and useful information for the coach, not a sign of failure - this is a genuinely harder skill (the outside touch) still being built.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We played a reaction game where kids had to instantly switch between touching the ball with the inside or outside of their foot on a call - it builds the same 'two gears' skill as our cone slalom, but under game-like time pressure instead of a predictable pattern.",
        newsletter:
          "This week: Traffic Cop Dribble! Kids dribbled freely and had to react instantly to calls of 'Inside!' or 'Outside!' - a fun way to build the reflexes for using both sides of the foot. At home, you can be the Traffic Cop yourself with a ball in the yard - just call out the two words while they dribble.",
        whatToWatchFor: [
          "Does your child react quickly, or do they need to stop and think first?",
          "Are they starting to use the outside touch as readily as the inside?",
          "Do they enjoy the reactive, game-like format more than a structured drill?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions between players focused on listening rather than looking",
            prevention: "Adequate grid size for the group; remind players to keep heads up between calls",
            response: "Check players involved; reinforce spacing before resuming",
          },
          {
            risk: "Ankle rolls on quick reactive direction changes",
            prevention: "Ensure a general warm-up happened earlier in the session",
            response: "Rest, ice if needed, reduce call speed for the rest of the activity",
          },
        ],
        inclusionConsiderations: {
          hearingDifferences: "Pair verbal calls with a hand signal or use Color Cop instead of words",
          attentionChallenges: "Shorter rounds, slower call pace, pair with a peer buddy for extra cueing",
        },
      },
      coachReflection: {
        afterActivity: [
          "Were players starting to react correctly to 'Outside' calls, or still defaulting to inside?",
          "Did the call pace match the group's readiness?",
          "Did letting a player be the Traffic Cop go well - who should get a turn next time?",
        ],
        forImprovement: [
          "Should I slow down or speed up the calls next time?",
          "Who specifically needs more outside-touch reps 1-on-1?",
          "How well did this connect to the game activity that followed?",
        ],
      },
    },
  },
];

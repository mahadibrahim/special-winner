// Basketball activities content.
//
// Transcribed verbatim from the recovered curriculum seeds under
// `.superpowers/curriculum-recovery/seeds/` (REFERENCE ONLY -- never imported
// from src/). Sources:
//   - `curriculum-v2__basketball-fundamentals-activities.ts` (5 v2 activities,
//     print-ready guides with comprehensiveGuide)
//   - `activities-basketball.ts` (49 gen-1 activities)
//
// Dedupe rule (mirrors Task 4's soccer precedent exactly): the v2 file
// suffixes every one of its 5 slugs with "-v2". Comparing the clean
// (suffix-stripped) form against all 49 gen-1 slugs found exactly 3 exact
// collisions. v2 wins on collision and keeps the CLEAN slug; the gen-1
// duplicate is dropped:
//
//   "dribble-tag"   <- v2's "dribble-tag-v2"   (gen-1 "dribble-tag" dropped)
//   "knockout"      <- v2's "knockout-v2"       (gen-1 "knockout" dropped)
//   "layup-lines"   <- v2's "layup-lines-v2"    (gen-1 "layup-lines" dropped)
//
// The other 2 v2 activities ("traffic-lights-basketball-v2",
// "shark-attack-basketball-v2") have NO clean-slug collision against any of
// the 49 gen-1 slugs, so they keep their "-v2"-suffixed slug verbatim (same
// as soccer's non-colliding v2 activities).
//
// Net count: 51 basketball activities (5 v2 + 49 gen-1 - 3 dropped
// duplicates).
//
// skillsDeveloped -- resolving skill references by name (same method as
// Task 4's soccer activities): none of the two source files set
// `skillsDeveloped` directly. The only place skill names appear in prose is
// inside the v2 activities' `comprehensiveGuide.skillConnections.
// {primarySkills,secondarySkills}[].skill` fields. Matched EXACT
// case-insensitive name against this file's basketball skill catalog
// (../skills.ts) only -- no fuzzy/semantic matching. Of 16 distinct
// skill-connection names across the 5 v2 activities, only 1 exact match was
// found ("Passing", on layup-lines' secondarySkills, resolving to slug
// "passing-basketball"). The remaining 15 names had no exact
// match and were dropped from the top-level `skillsDeveloped` array (their
// prose is untouched inside comprehensiveGuide.skillConnections):
//   Ball Control, Ball Protection/Shielding, Change of Direction, Court Awareness / Scanning, Court Awareness / Vision, Dribble Speed Control, Dribbling Under Pressure, Layup Finishing, Layup Footwork, Layups, Listening/Focus, Quick Shot Release, Rebounding, Shooting Under Pressure, Stationary Dribbling

import type { ActivityContent } from "../types";

export const BASKETBALL_ACTIVITIES: ActivityContent[] = [
  {
    sport: "basketball",
    name: "Dribble Tag",
    slug: "dribble-tag",
    description:
      "High-energy tag game where ALL players must dribble a basketball while playing tag. Taggers and runners both dribble, developing ball handling under pressure, court awareness, and cardiovascular fitness in a fun, game-like environment.",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 8,
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 basketball per player\n□ 4 cones for corners (bright colors)\n□ 2-3 pinnies for taggers\n\nSPACE: Half court or 25x25 paces (adjust based on numbers)\n\nSETUP STEPS\n1. Place 4 cones in a square to define playing area\n2. Give every player a basketball\n3. Select 2-3 taggers (1 tagger per 5-6 players)\n4. Taggers wear pinnies to be easily identified\n5. All players start spread out inside the grid\n\nDIAGRAM\n┌────────────────────────────────┐\n│  ▲                         ▲   │\n│     ○   ○                      │\n│         ●(tagger)    ○         │  25 paces\n│     ○        ○       ○         │\n│  ▲                         ▲   │\n└────────────────────────────────┘\n       25 paces\n▲=cone  ○=dribbler with ball  ●=tagger (pinnie, also dribbling)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of playing area\n\nSAY: "Everyone grab a ball and come into the square! Spread out and start dribbling - keep that ball bouncing!"\n\nPick taggers: "Jordan and Maya, can you come help me? You\'re going to be our taggers!"\nGive taggers pinnies.\n\nSAY: "This is DRIBBLE TAG! Here\'s the twist - EVERYONE must dribble the whole time, including taggers! If you stop dribbling or lose your ball, you\'re frozen until someone high-fives you back in."\n\nSAY: "Taggers - try to tag other players while dribbling. If you get tagged, freeze with your ball and wait for a high-five. Questions? Let\'s GO!"\n\n\nPHASE 2: ROUND 1 (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Outside grid, moving around perimeter\n\nSAY: "Taggers, start counting your tags! Everyone else, protect yourself! Ready... GO!"\n\nDURING PLAY - What to Watch For:\n□ Are players keeping their dribble alive?\n□ Are they looking up to see taggers?\n□ Are they using their body to shield while dribbling?\n\nPHRASES TO USE:\n• "Eyes up while you dribble!"\n• "Change directions to escape!"\n• "Low and quick dribble!"\n• "Great escape!"\n\nWhen tagged: "Freeze right there! Wait for that high-five!"\n\nCOUNTDOWN: "One minute left!... 10 seconds!... FREEZE EVERYONE!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid, all players frozen\n\nSAY: "Everyone freeze! Taggers, how many did you get? Nice work!"\n\nASK: "What helped you get away from taggers?"\nListen for: "Changing direction," "Going faster," "Looking up"\n\nTEACH ONE THING:\nSAY: "I noticed some of you changing hands when you changed direction - like THIS."\nDemo: Quick crossover or hand switch\nSAY: "That\'s how you protect the ball while escaping. Try it this round. GO!"\n\n\nPHASE 4: ROUND 2 (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New challenge - when you change direction, try to switch your dribbling hand!"\n\nReinforce teaching point:\n• When you see hand switches: "YES! Protect that ball with your body!"\n• When you see head down: "Peek up! Where are the taggers?"\n\nEND: "FREEZE! Taggers, new count? Great energy!"\n\n\nPHASE 5: ROUND 3 + WRAP UP (2.5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSWITCH TAGGERS: "New taggers! Who hasn\'t been a tagger yet?"\nTrade pinnies, run 90-second round.\n\nWRAP UP (30 seconds):\nSAY: "Awesome work! I saw great dribbling and heads-up play. Remember - in a real game, you have to dribble AND watch for defenders just like this! Water break, then we\'re moving to [next activity]."',
    diagram:
      "┌────────────────────────────────┐\n│  ▲                         ▲   │\n│     ○   ○                      │\n│         ●(tagger)    ○         │  Half court\n│     ○        ○       ○         │\n│  ▲                         ▲   │\n└────────────────────────────────┘",
    coachingPoints: [
      "EYES UP while dribbling → Say: 'Can you dribble AND see the tagger at the same time?'",
      "LOW DRIBBLE when pressured → Say: 'Get low! Low dribble is harder to steal!'",
      "CHANGE HANDS to protect → Say: 'Put your body between the tagger and your ball!'",
      "CHANGE SPEEDS → Say: 'Speed up or slow down to trick them!'",
    ],
    questionsToAsk: [
      "'Where are the taggers right now?' → Develops court awareness without stopping play",
      "'Which hand should you dribble with if the tagger is on your right?' → Develops protection awareness",
      "'What helps you keep your dribble alive while moving fast?' → Develops technique awareness",
      "'How did you escape that time?' → Develops reflection",
    ],
    commonMistakes: [
      "WATCHING ONLY THE BALL → Say: 'Quick peeks up! Look at ball, look up, look at ball, look up'",
      "STANDING STILL → Say: 'Keep moving! A still target is easy to tag!'",
      "HIGH BOUNCY DRIBBLE → Say: 'Push the ball down, waist height or lower!'",
      "TAGGERS FORGETTING TO DRIBBLE → Say: 'Taggers, your dribble has to stay alive too!'",
    ],
    variations: [
      {
        name: "Weak Hand Only",
        description: "Everyone must dribble with their non-dominant hand only.",
        difficulty: "intermediate",
      },
      {
        name: "Speed Dribble",
        description:
          "Players must stay in constant motion - no standing allowed.",
        difficulty: "beginner",
      },
      {
        name: "Freeze Tag",
        description:
          "Tagged players freeze until someone dribbles around them in a circle.",
        difficulty: "beginner",
      },
      {
        name: "Chain Tag",
        description: "Tagged players become taggers too. Last dribbler wins!",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Players constantly losing their dribble\n• Taggers catching everyone in 30 seconds\n• Players looking frustrated, not smiling\n\nSOLUTIONS:\n• Make grid bigger (30x30 paces)\n• Fewer taggers (1 tagger per 7-8 dribblers)\n• Allow stationary dribbling when tagged (instead of freeze)\n• Taggers must skip instead of run\n• \"Safe zones\" in corners (can't be tagged for 5 seconds)",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Dribblers easily escaping taggers\n• Players looking bored or asking \"what's next?\"\n• Taggers can't catch anyone\n\nSOLUTIONS:\n• Make grid smaller (20x20 paces)\n• More taggers (1 tagger per 4 dribblers)\n• Weak hand only for everyone\n• Must complete a crossover before changing direction\n• Add second ball - both hands dribbling",
    equipmentNeeded: ["1 basketball per player", "4 cones", "2-3 pinnies"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "warmup",
      "dribbling",
      "ball-handling",
      "awareness",
      "high-energy",
      "fun",
      "no-lines",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Tag game where everyone dribbles; develops ball handling under pressure and court awareness.",
        keyPhrases: [
          "Eyes up while you dribble!",
          "Change hands to protect!",
          "Low and quick dribble!",
        ],
        setupDiagram:
          "25x25 pace grid, 4 corner cones, 1 ball per player, 1 tagger per 5-6 players with pinnies",
        quickProgression: {
          easier: "Bigger grid, fewer taggers, taggers must skip",
          harder: "Smaller grid, more taggers, weak hand only",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Arrive 5 minutes early to set up grid",
            "Count players to determine taggers (1 per 5-6 dribblers)",
            "Ensure every player has a properly inflated basketball",
            "Pick 2-3 enthusiastic volunteers for first taggers",
          ],
          mindset:
            "This is a HIGH ENERGY warmup. Your enthusiasm sets the tone. Be loud, move around, celebrate effort and ball handling. Goal: players dribbling, moving, and smiling.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center of grid",
            script:
              "SAY: 'Everyone grab a ball and come into the square!' Pick taggers, give pinnies, explain rules: everyone dribbles, tagged = freeze until high-fived.",
            anticipatedResponses: {
              "Kids arguing about who's tagger":
                "Everyone will get a turn! Let's start with volunteers.",
              "Not enough balls": "Partner up - take turns being the dribbler.",
              "Kids already bouncing wildly":
                "Freeze! Balls in hands, eyes on me.",
            },
          },
          {
            phase: "Round 1",
            duration: "2 minutes",
            coachPosition: "Outside grid, moving around",
            script:
              "SAY: 'Taggers, start counting! Everyone else, protect yourself! GO!' Watch for: dribble control, heads up, movement patterns. Encourage constantly.",
            troubleshooting: {
              "Taggers can't catch anyone": [
                "Add tagger",
                "Make grid smaller",
                "No standing still for dribblers",
              ],
              "Everyone getting tagged instantly": [
                "Remove tagger",
                "Make grid bigger",
                "Taggers must skip",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone frozen",
            script:
              "SAY: 'Freeze! Taggers, how many?' ASK: 'What helped you escape?' TEACH: Demo hand switch/crossover when changing direction.",
          },
          {
            phase: "Round 2",
            duration: "2 minutes",
            coachPosition: "Outside grid",
            script:
              "SAY: 'Try switching hands when you change direction!' Reinforce teaching. End with freeze and count.",
          },
          {
            phase: "Round 3 & Wrap",
            duration: "2.5 minutes",
            coachPosition: "Outside grid",
            script:
              "Switch taggers. Run 90-second round. WRAP: 'Great dribbling and awareness! In real games, you dribble AND watch defenders just like this. Water break!'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          taggersTooStrong: {
            symptoms: [
              "Most players frozen in 30 seconds",
              "Frustrated dribblers",
              "No one escapes",
            ],
            solutions: [
              "Remove a tagger",
              "Bigger grid (30x30)",
              "Taggers skip",
              "Add safe zone corners",
            ],
          },
          taggersTooWeak: {
            symptoms: [
              "No one getting tagged",
              "Frustrated taggers",
              "Dribblers standing around",
            ],
            solutions: [
              "Add a tagger",
              "Smaller grid (20x20)",
              "No standing still",
              "Weak hand only",
            ],
          },
        },
        playerBehavior: {
          notParticipating: {
            symptoms: ["Standing at edge", "Not dribbling", "Disengaged"],
            approach:
              "Privately ask: 'Everything okay?' Offer alternative role: 'Help me count tags?' Wait it out - often join after watching.",
          },
          overlyAggressive: {
            symptoms: [
              "Pushing players",
              "Slapping at balls",
              "Going for player not tag",
            ],
            approach:
              "IMMEDIATE pause if dangerous. SAY: 'We tag shoulders gently!' If continues: 'Take 1-minute break.'",
          },
          frustrated: {
            symptoms: [
              "Slamming ball",
              "Saying 'I can't dribble'",
              "Giving up",
            ],
            approach:
              "Quick private word. Offer to be helper. Normalize: 'Dribbling while moving is hard! You're getting better.'",
          },
        },
        environmentalIssues: {
          spaceTooBig: {
            symptoms: ["Can't see all players", "Game feels slow"],
            solution: "Move corner cones in. No shame adjusting mid-game.",
          },
          spaceTooSmall: {
            symptoms: ["Constant collisions", "Balls bouncing into each other"],
            solution: "Move cones out, or split into two games.",
          },
          unevenNumbers: {
            symptoms: ["Odd player always left out"],
            solutions: [
              "Odd player counts tags",
              "Permanent tagger",
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
              "Players must maintain dribble while evading active taggers, replicating game pressure when defenders approach.",
            levelIndicators: {
              1: "Loses dribble frequently; can't move and dribble",
              2: "Sometimes maintains dribble but has to stop to control",
              3: "Keeps dribble alive while moving; occasional losses when pressured",
              4: "Confident dribble while moving; uses direction changes effectively",
              5: "Beats taggers easily with moves; could demonstrate for others",
            },
            assessmentNotes:
              "Watch across multiple rounds. Early performance may not reflect true ability as they learn the game.",
          },
          {
            skill: "Court Awareness / Vision",
            domain: "Tactical",
            howItDevelops:
              "Must know where taggers are to avoid them. Builds habit of keeping head up while dribbling.",
            levelIndicators: {
              1: "Only looks at ball; surprised when tagged",
              2: "Occasional glances up; reactive to taggers",
              3: "Regularly looks up; knows where 1 tagger is",
              4: "Scans continuously; knows where multiple taggers are",
              5: "Always aware; makes decisions before tagger arrives",
            },
            assessmentNotes:
              "Ask 'point to taggers' while frozen. Their accuracy reveals awareness level.",
          },
        ],
        secondarySkills: [
          {
            skill: "Ball Control",
            domain: "Technical",
            howItDevelops:
              "Must keep dribble low and controlled while moving at speed.",
            levelIndicators: {
              1: "High bouncy dribble; ball gets away",
              2: "Inconsistent dribble height",
              3: "Generally controlled dribble while moving",
              4: "Consistently low dribble at various speeds",
              5: "Perfect control; can speed up/slow at will",
            },
          },
          {
            skill: "Change of Direction",
            domain: "Technical",
            howItDevelops:
              "Evading taggers requires quick cuts and direction changes while maintaining dribble.",
          },
        ],
        physicalDevelopment: {
          agility: "Quick direction changes, stops, starts",
          spatialAwareness: "Understanding space relative to others on court",
          cardiovascular: "Continuous movement for 8 minutes",
        },
        psychologicalDevelopment: {
          resilience: "Getting tagged and coming back in",
          competitiveness: "Desire to avoid being tagged",
          enjoyment: "Fun activity builds love of basketball",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Dribble Tag develops ball handling under pressure in a game-like context WITHOUT offensive/defensive complexity. Players focus on: maintaining dribble, avoiding pressure, moving with the ball. This mirrors bringing the ball up court when defenders pressure.",
        whenToUseIt: {
          idealFor: [
            "Early in practice (warmup) - gets energy up",
            "When players need dribbling confidence",
            "After technical work - applies skills under pressure",
            "When energy is low - competition re-engages",
          ],
          avoidWhen: [
            "End of practice when tired (too intense)",
            "Very uneven dribbling abilities (frustration)",
            "Less than 6 players (dynamics don't work)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Stationary Ball Handling",
              reason: "Ball control without movement",
            },
            {
              activity: "Traffic Lights (Basketball)",
              reason: "Dribbling at different speeds without defenders",
            },
          ],
          after: [
            {
              activity: "1v1 Dribbling",
              reason: "Dribbling against specific defender",
            },
            {
              activity: "3v3 Half Court",
              reason: "Applies skills in team context",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Maximum fun, minimum correction",
            keyPhrases: [
              "Keep that ball bouncing!",
              "Be sneaky!",
              "Escape the taggers!",
            ],
            avoidSaying: [
              "You need to crossover (too advanced)",
              "Scan the court",
            ],
            duration: "6 minutes max",
            simplifications: [
              "Bigger grid",
              "Fewer taggers",
              "No hand switch requirement",
            ],
          },
          ages9to11: {
            approach: "Introduce technique, maintain fun",
            keyPhrases: [
              "Protect with your body!",
              "Low dribble!",
              "Switch hands!",
            ],
            challenges: ["Weak hand rounds", "Must crossover to escape"],
            duration: "8 minutes with teaching",
          },
          ages12to14: {
            approach: "Game realism, player-led",
            keyPhrases: [
              "When do you see this in games?",
              "What move would help here?",
            ],
            challenges: [
              "Smaller grid",
              "Two-ball dribbling",
              "Specific moves required to escape",
            ],
            coachRole: "Facilitate discussion about game application",
          },
        },
        commonMisconceptions: {
          "Just a game, not real training":
            "This IS training - dribbling under pressure transfers to games better than stationary drills.",
          "Weaker dribblers always get tagged":
            "Design so everyone succeeds: enough taggers that weak aren't singled out.",
          "Not learning technique":
            "Learning to APPLY technique under pressure is harder than isolated technique.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We play Dribble Tag because it develops ball handling under pressure in a fun, game-like context. Your child learns to dribble while someone tries to catch them - exactly what happens in games when defenders pressure.",
        newsletter:
          "This week: Dribble Tag! This game teaches ball handling under pressure. Watch for your child keeping their head up while dribbling at home!",
        whatToWatchFor: [
          "Does your child look up while dribbling? (court awareness)",
          "Can they change direction without losing the ball? (control)",
          "Do they switch hands to protect the ball? (ball protection)",
          "Do they keep the dribble low when pressured? (technique)",
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
            risk: "Aggressive tagging",
            prevention: "State 'gentle shoulder tags only' before game",
            response: "Immediate stop, reminder, repeat = sit out",
          },
          {
            risk: "Tripping over balls",
            prevention: "If dribble is lost, pick up ball quickly",
            response: "Check player, remind about ball control",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Pair faster dribblers with each other, give slower dribblers head start",
          newPlayers:
            "Partner with experienced player first round, or start as tagger (easier)",
          anxiousPlayers: "Start as tagger (less pressure) before being chased",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did all players have fun and stay engaged?",
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
    sport: "basketball",
    name: "Traffic Lights (Basketball)",
    slug: "traffic-lights-basketball-v2",
    description:
      "Dribbling game where players respond to color commands while dribbling. Red=stop (but keep dribbling in place), Yellow=slow dribble, Green=speed dribble. Develops listening skills, dribble control at different speeds, and the fundamental ability to change pace with the ball.",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 30,
    durationMinutes: 6,
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 basketball per player\n□ 4 cones for corners (optional but helpful)\n□ Optional: colored cones/cards (red, yellow, green) as visual aids\n\nSPACE: As large as available (minimum half court or 25x30 paces)\n\nSETUP STEPS\n1. Players spread out in large area\n2. Every player has ball and is dribbling\n3. Coach stands where everyone can see/hear\n\nDIAGRAM\n┌─────────────────────────────────┐\n│                                 │\n│    ○    ○    ○    ○    ○       │\n│                                 │  25+ paces\n│    ○    ○   COACH  ○    ○      │\n│                                 │\n│    ○    ○    ○    ○    ○       │\n└─────────────────────────────────┘\n       30+ paces",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Everyone grab a ball and find your own space - spread out so you can\'t touch anyone! Start dribbling!"\n\nSAY: "We\'re playing Traffic Lights! When I say GREEN, dribble as fast as you can control - speed dribble! When I say YELLOW, super slow dribble, like you\'re sneaking! When I say RED, stop your feet BUT keep dribbling in place!"\n\nDEMO: "Watch me - GREEN (fast dribble across space)... YELLOW (slow dribble)... RED (stop feet, dribble in place). Your turn!"\n\n\nPHASE 2: ROUND 1 - BASIC (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Find a space, start dribbling... GREEN!"\n\nCall colors randomly:\n• GREEN: Hold 5-8 seconds\n• YELLOW: Hold 3-5 seconds\n• RED: Hold 3-4 seconds (check they keep dribbling!)\n\nWATCH FOR:\n□ Quick response to commands?\n□ Dribble continuing on RED?\n□ Different speeds for green vs yellow?\n\nPRAISE: "Great control!" "Love that speed!" "Nice stationary dribble on red!"\n\n\nPHASE 3: COACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Red! Freeze your feet! Keep that dribble going!"\n\nSAY: "Look at your dribble - is it at your waist or lower? In basketball, we want the ball below our waist so defenders can\'t steal it."\n\nDEMO: Quick high dribble vs low dribble comparison.\n\nSAY: "Let\'s go - keep it LOW! GREEN!"\n\n\nPHASE 4: ROUND 2 - ADD CHALLENGE (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Same game, but now on RED, switch hands every 3 bounces! Ready... GREEN!"\n\nCall colors. On RED, count out loud: "1, 2, 3, switch! 1, 2, 3, switch!"\n\n\nPHASE 5: ROUND 3 - MIX IT UP (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOptions:\n• "REVERSE!" - Green means stop, Red means go fast\n• "Red light... Red light... RED LIGHT!" (trick them)\n• Whisper colors so they must really listen\n• Add "BLUE!" = crossover (switch hands while moving)\n\nWRAP UP: "Great dribbling! Who can show me a low, controlled dribble? Water break!"',
    coachingPoints: [
      "KEEP DRIBBLE ALIVE → Say: 'The ball never stops bouncing - red means feet stop, not hands!'",
      "GREEN = SPEED DRIBBLE → Say: 'Push the ball out in front, let it lead you!'",
      "YELLOW = CONTROL DRIBBLE → Say: 'Slow and sneaky, ball stays close!'",
      "LOW DRIBBLE → Say: 'Waist height or lower - protect that ball!'",
    ],
    questionsToAsk: [
      "'Why do we keep dribbling on red?' → In games, you can't just stop - defenders will steal it!",
      "'Is it easier to control at fast or slow speed?' → Slow - more control",
      "'Why do we dribble low?' → Harder for defenders to steal",
      "'What helps you hear colors - looking down or up?' → Looking up!",
    ],
    commonMistakes: [
      "STOPPING DRIBBLE ON RED → Say: 'Feet stop, hands don't! Keep it bouncing!'",
      "SAME SPEED GREEN/YELLOW → Say: 'Show the difference! Green=race car, Yellow=turtle'",
      "HIGH BOUNCY DRIBBLE → Say: 'Push it down! Waist height or lower!'",
      "NOT SPREADING OUT → Say: 'Find space where you can swing arms without touching anyone'",
    ],
    variations: [
      {
        name: "Add Blue",
        description: "BLUE = crossover to opposite hand while moving.",
        difficulty: "intermediate",
      },
      {
        name: "Traffic Cop",
        description:
          "Player becomes traffic cop, calls colors. Rotate every 30 seconds.",
        difficulty: "beginner",
      },
      {
        name: "Body Part Red",
        description:
          "On RED, call body part (left hand, right hand, between legs) for how to dribble.",
        difficulty: "intermediate",
      },
      {
        name: "Direction Colors",
        description:
          "PURPLE = move backward while dribbling, ORANGE = shuffle sideways.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Losing dribble on color changes\n• Confusion about colors\n• Can't dribble and listen\n\nSOLUTIONS:\n• Slow down color calls\n• Only green and red first (add yellow later)\n• Allow catch and restart on RED\n• More time between calls",
    makeHarder:
      'SIGNS THEY\'RE READY:\n• Instant responses\n• Perfect dribble control\n• Asking "what else?"\n\nSOLUTIONS:\n• Call colors faster\n• Whisper colors\n• Add reverse mode\n• Weak hand only on yellow\n• Add movements (jumping jacks while dribbling on red)',
    equipmentNeeded: ["1 basketball per player", "4 cones (optional)"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: [
      "warmup",
      "dribbling",
      "ball-handling",
      "listening",
      "beginner-friendly",
      "no-lines",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Color commands control dribbling speed - RED=stop feet but keep dribbling, YELLOW=slow, GREEN=fast - develops listening and ball control.",
        keyPhrases: [
          "Feet stop, hands don't!",
          "Green is race car, Yellow is turtle!",
          "Low dribble - waist or below!",
        ],
        setupDiagram:
          "Large open space, 1 ball per player, everyone spread out dribbling",
        quickProgression: {
          easier: "Slower calls, only 2 colors, allow catch on red",
          harder: "Faster calls, whisper, reverse mode, weak hand",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Ensure enough basketballs for all players",
            "Check that balls are properly inflated",
            "Mark out area with corner cones if helpful",
            "Position yourself where all can see and hear",
          ],
          mindset:
            "This is about LISTENING and BALL CONTROL. Your voice is the main tool - vary volume, speed, and add playfulness (whispers, tricks). Celebrate the smooth transitions!",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "45 seconds",
            coachPosition: "Center where all can see",
            script:
              "SAY: 'Find your own space and start dribbling!' Explain: GREEN=fast, YELLOW=slow, RED=stop feet but keep dribbling. Demo each briefly.",
            anticipatedResponses: {
              "What if I lose my dribble?":
                "Pick it up and keep going! Everyone loses it sometimes.",
              "Can I go really really fast?":
                "As fast as you can CONTROL the ball!",
            },
          },
          {
            phase: "Round 1 - Basic",
            duration: "90 seconds",
            coachPosition: "Center, visible to all",
            script:
              "Call colors randomly. GREEN 5-8 sec, YELLOW 3-5 sec, RED 3-4 sec. Praise good control and speed changes.",
            troubleshooting: {
              "Stopping dribble on RED": [
                "Remind: feet stop, hands don't!",
                "Demo stationary dribble",
                "Count bounces out loud",
              ],
              "Same speed all colors": [
                "Exaggerate demos",
                "Use animal comparisons",
                "Race car vs turtle",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center",
            script:
              "Call RED. 'Look at your dribble - waist height or lower?' Teach low dribble for protection.",
          },
          {
            phase: "Round 2 - Challenge",
            duration: "90 seconds",
            coachPosition: "Center",
            script:
              "Add hand-switch challenge on RED: 'Switch hands every 3 bounces!' Count out loud with them.",
          },
          {
            phase: "Round 3 - Fun",
            duration: "90 seconds",
            coachPosition: "Center",
            script:
              "Mix it up: Reverse mode, trick calls, whisper colors, add BLUE for crossover. End with celebration.",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          tooEasy: {
            symptoms: [
              "Perfect responses instantly",
              "Players bored",
              "Asking for more",
            ],
            solutions: [
              "Faster calls",
              "Add reverse",
              "Whisper commands",
              "Weak hand requirement",
              "Add crossover",
            ],
          },
          tooHard: {
            symptoms: ["Constantly losing dribble", "Confusion", "Frustration"],
            solutions: [
              "Slower calls",
              "Only 2 colors",
              "Allow catch and restart on RED",
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
              "Fancy moves instead of colors",
              "Ignoring commands",
            ],
            approach:
              "Challenge: 'Can you go fast AND change perfectly on command?' Channel energy into precision.",
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Dribble Speed Control",
            domain: "Technical",
            howItDevelops:
              "Players learn to modulate dribble force and frequency based on desired speed - foundation for game situations.",
            levelIndicators: {
              1: "Same speed regardless of command; can't control at speed",
              2: "Clear difference between fast/slow; ball escapes at high speed",
              3: "Three distinct speeds; maintains control at each",
              4: "Smooth transitions between speeds; always in control",
              5: "Instant speed changes; can add moves while changing speed",
            },
          },
          {
            skill: "Stationary Dribbling",
            domain: "Technical",
            howItDevelops:
              "On RED, players practice keeping dribble alive without moving - used when protecting ball or waiting for play to develop.",
            levelIndicators: {
              1: "Can't keep dribble going without moving",
              2: "Stationary dribble but high and loose",
              3: "Controlled stationary dribble, waist height",
              4: "Low, tight stationary dribble with either hand",
              5: "Can add moves (between legs, crossover) while stationary",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "Listening/Focus",
            domain: "Psychological",
            howItDevelops:
              "Must maintain focus to hear and respond to commands while dribbling - builds concentration.",
          },
        ],
        physicalDevelopment: {
          handEyeCoordination:
            "Maintaining dribble while processing verbal commands",
          speedControl: "Varying movement speeds while dribbling",
        },
        psychologicalDevelopment: {
          focus: "Sustained attention to hear commands",
          selfRegulation: "Controlling impulse to always go fast",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Traffic Lights teaches speed control while dribbling - essential for basketball. Players learn when to push the ball and attack (green), when to slow down and read the defense (yellow), and when to protect the ball in place (red). The game format makes repetitive practice fun.",
        whenToUseIt: {
          idealFor: [
            "Very beginning of practice (first warm-up)",
            "Younger or newer players (simple rules)",
            "Teaching dribble speed concepts",
            "Large groups (everyone active)",
          ],
          avoidWhen: [
            "Players have mastered speed control (too easy)",
            "Very small space (need room to move)",
            "After high-energy games (may need calmer activity)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Stationary Ball Handling",
              reason: "Ball control without movement",
            },
          ],
          after: [
            {
              activity: "Dribble Tag",
              reason: "Adds defensive pressure",
            },
            {
              activity: "Cone Dribbling",
              reason: "Adds obstacles and direction",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Pure fun, celebrate every attempt",
            keyPhrases: [
              "Race car! Turtle!",
              "Feet freeze, hands bounce!",
              "Keep it bouncing!",
            ],
            duration: "5 minutes max",
            simplifications: [
              "Only 2 colors",
              "Allow catch on RED",
              "Slow pace",
            ],
          },
          ages9to11: {
            approach: "Add complexity and hand switching",
            keyPhrases: [
              "Control the speed, control the game",
              "Quick hands, soft touch",
            ],
            challenges: [
              "All 3 colors + reverse",
              "Hand switch on RED",
              "Weak hand rounds",
            ],
          },
          ages12to14: {
            approach: "Game application focus",
            keyPhrases: [
              "When do you use each speed in games?",
              "Attack speed vs protect speed",
            ],
            challenges: [
              "Add specific moves on colors",
              "Blindfold stationary dribble",
              "Two balls",
            ],
          },
        },
      },
      parentCommunication: {
        ifAsked:
          "Traffic Lights teaches your child to control dribbling speed - pushing fast to attack, slowing to read the game, and protecting the ball in place. These are the foundational dribbling skills.",
        newsletter:
          "This week: Traffic Lights (Basketball)! We practiced dribbling at different speeds and keeping the dribble alive while stopped. At home, play together - call out colors while they dribble!",
        whatToWatchFor: [
          "Can they change dribbling speed on command?",
          "Do they keep dribbling even when stopped?",
          "Is the dribble low (waist height or below)?",
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
          {
            risk: "Ball hitting others",
            prevention: "Maintain spacing, low dribble",
            response: "Check affected player, remind about control",
          },
        ],
        inclusionConsiderations: {
          hearingDifficulties:
            "Use visual aids (colored cones/cards) in addition to verbal commands",
          motorDelays:
            "Allow more time to respond, celebrate any attempt to change speed, allow two-hand dribble",
        },
      },
      coachReflection: {
        afterActivity: [
          "Could all players maintain dribble on RED by the end?",
          "Did I vary the pace appropriately?",
          "Did I make it fun (tricks, whispers, etc.)?",
        ],
        forImprovement: [
          "What additional challenges could I add next time?",
          "Who might need extra practice with stationary dribbling?",
        ],
      },
    },
  },
  {
    sport: "basketball",
    name: "Shark Attack (Basketball)",
    slug: "shark-attack-basketball-v2",
    description:
      "High-energy dribbling game where players protect their basketballs from 'sharks' who try to knock them away. Develops dribbling under pressure, ball protection, court awareness, and shielding in a fun, game-like environment.",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 8,
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 basketball per player (except sharks)\n□ 4 cones for corners (bright colors)\n□ 2-3 pinnies for sharks\n□ Extra balls on sideline for quick restarts\n\nSPACE: Half court or 25x25 paces (adjust based on numbers)\n\nSETUP STEPS\n1. Place 4 cones in a square, 25 paces apart\n2. Give every player a ball EXCEPT 1-2 sharks\n3. Sharks wear pinnies (1 shark per 5-6 dribblers)\n4. All dribblers start inside the grid dribbling\n\nDIAGRAM\n┌────────────────────────────────┐\n│  ▲                         ▲   │\n│     ○   ○                      │\n│         ●(shark)    ○          │  25 paces\n│     ○        ○       ○         │\n│  ▲                         ▲   │\n└────────────────────────────────┘\n       25 paces\n▲=cone  ○=dribbler with ball  ●=shark (pinnie, no ball)",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid\n\nSAY: "Everyone grab a ball and come into the square! Spread out and start dribbling!"\n\nPick sharks: "Jaylen and Sophia, can you come help me? You\'re going to be our hungry sharks!"\nGive sharks pinnies, take their balls.\n\nSAY: "This is SHARK ATTACK! Dribblers - your job is to dribble around and PROTECT your ball from the sharks. Sharks - your job is to knock balls away - make them lose their dribble!"\n\nSAY: "Dribblers - if your ball gets knocked away, do 5 ball slaps outside the square, then come right back in. Questions? Let\'s GO!"\n\n\nPHASE 2: ROUND 1 (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Outside grid, moving around perimeter\n\nSAY: "Sharks, show me your mean shark faces! Dribblers, protect your ball! Ready... SHARKS ARE HUNGRY!"\n\nDURING PLAY - What to Watch For:\n□ Are dribblers looking up to see sharks?\n□ Are they using their body to shield?\n□ Are sharks being active (not standing)?\n\nPHRASES TO USE:\n• "Great escape!"\n• "Sharks, find the sleepy fish!"\n• "Head up - where\'s the shark?"\n• "Body between shark and ball!"\n\nWhen ball is knocked away: Point to sideline, "5 ball slaps, back in!"\n\nCOUNTDOWN: "One minute left!... 10 seconds!... FREEZE!"\n\n\nPHASE 3: TEACHING MOMENT (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Center of grid, all players frozen\n\nSAY: "Everyone freeze! Dribblers - point to where the sharks are RIGHT NOW."\nWatch: Can they find them without searching?\n\nASK: "What helped you keep your ball safe?"\nListen for: "Moving away," "Using my body," "Looking up"\n\nTEACH ONE THING:\nSAY: "I noticed some of you putting your body between the shark and the ball - like THIS."\nDemo: Low dribble, arm bar out, body sideways between defender and ball\nSAY: "That\'s called SHIELDING. Try that this round. GO!"\n\n\nPHASE 4: ROUND 2 (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Sharks - how many balls can you knock away? Let\'s count!"\n\nReinforce teaching point:\n• When you see shielding: "YES! Body between shark and ball!"\n• When you see no shielding: "Turn sideways - protect it!"\n\nEND: "FREEZE! Sharks, how many? Nice work!"\n\n\nPHASE 5: ROUND 3 + WRAP UP (2.5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSWITCH SHARKS: "New sharks! Who hasn\'t been a shark yet?"\nTrade pinnies, run 90-second round.\n\nWRAP UP (30 seconds):\nSAY: "Great work! I saw awesome shielding and heads-up dribbling. In a real game, defenders try to steal just like our sharks - now you know how to protect! Water break, then we\'re moving to [next activity]."',
    diagram:
      "┌────────────────────────────────┐\n│  ▲                         ▲   │\n│     ○   ○                      │\n│         ●(shark)    ○          │  25x25 paces\n│     ○        ○       ○         │\n│  ▲                         ▲   │\n└────────────────────────────────┘",
    coachingPoints: [
      "HEAD UP while dribbling → Say: 'Can you dribble AND see the shark at the same time?'",
      "USE BODY to shield → Say: 'Put your body between the shark and your ball - like protecting your lunch!'",
      "LOW DRIBBLE → Say: 'Keep the ball low - harder for sharks to reach!'",
      "CHANGE DIRECTION → Say: 'When the shark gets close, spin away!'",
    ],
    questionsToAsk: [
      "'Where are the sharks right now?' → Develops awareness without stopping play",
      "'Which hand should you dribble with if shark is on your left?' → Right hand, body protects",
      "'If a shark is coming from your right, which way should you turn?' → Develops decision making",
      "'How did you protect your ball that time?' → Develops reflection",
    ],
    commonMistakes: [
      "DRIBBLING TOO HIGH → Say: 'Low dribble! Sharks can't reach low balls!'",
      "ONLY WATCHING BALL → Say: 'Quick peeks up! Look at ball, look up, look at ball, look up'",
      "RUNNING WITHOUT DRIBBLE → Say: 'Take your dribble with you when you escape!'",
      "SHARKS REACHING FOR BODY → Say: 'Sharks, go for the BALL not the player!'",
    ],
    variations: [
      {
        name: "Freeze Sharks",
        description:
          "When coach yells 'FREEZE!' everyone stops. Last one moving becomes shark.",
        difficulty: "beginner",
      },
      {
        name: "Ball Stealer",
        description:
          "Sharks try to steal and dribble the ball instead of just knocking it away.",
        difficulty: "intermediate",
      },
      {
        name: "Shark Jail",
        description: "If caught, you become a shark too. Last dribbler wins!",
        difficulty: "intermediate",
      },
      {
        name: "Partner Sharks",
        description:
          "Sharks work in pairs holding hands - must coordinate to trap dribblers.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Most balls knocked away within 30 seconds\n• Players looking frustrated, not smiling\n• No one can escape sharks\n\nSOLUTIONS:\n• Make grid bigger (30x30 paces)\n• Fewer sharks (1 shark per 7-8 dribblers)\n• Sharks must crab walk instead of run\n• Allow 3 ball slaps instead of 5\n• \"Safe zones\" in corners (can't be attacked for 5 seconds)",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Dribblers easily escaping sharks\n• Players looking bored or asking \"what's next?\"\n• Sharks can't knock anyone's ball away\n\nSOLUTIONS:\n• Make grid smaller (20x20 paces)\n• More sharks (1 shark per 4 dribblers)\n• Dribblers must stay moving (no standing)\n• Weak hand only for dribbling\n• Add \"super shark\" who can use both hands",
    equipmentNeeded: ["1 basketball per player", "4 cones", "2-3 pinnies"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "warmup",
      "dribbling",
      "ball-protection",
      "awareness",
      "high-energy",
      "fun",
      "no-lines",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Dribblers protect balls from sharks who try to knock them away; develops dribbling under pressure and ball protection.",
        keyPhrases: [
          "Can you dribble AND see the shark?",
          "Body between shark and ball!",
          "Low dribble - protect it!",
        ],
        setupDiagram:
          "25x25 pace grid, 4 corner cones, 1 shark per 5-6 dribblers with pinnies",
        quickProgression: {
          easier: "Bigger grid, fewer sharks, sharks must crab walk",
          harder: "Smaller grid, more sharks, weak hand only",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Arrive 5 minutes early to set up grid",
            "Count players to determine sharks (1 per 5-6 dribblers)",
            "Have extra balls on sideline for quick restarts",
            "Pick 1-2 enthusiastic volunteers for first sharks",
          ],
          mindset:
            "This is a HIGH ENERGY warmup. Your enthusiasm sets the tone. Be loud, move around, celebrate effort. Goal: players protecting their dribble and smiling.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "Center of grid",
            script:
              "SAY: 'Everyone grab a ball and come into the square!' Pick sharks, give pinnies, explain rules: sharks knock balls away, dribblers protect and do 5 ball slaps if caught.",
            anticipatedResponses: {
              "Kids arguing about who's shark":
                "Everyone will get a turn! Let's start with volunteers.",
              "Not enough balls":
                "Share with a partner - you'll both dribble soon.",
              "Kids already bouncing wildly":
                "Freeze! Balls in hands, eyes on me.",
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
              "Balls knocked away instantly": [
                "Remove shark",
                "Make grid bigger",
                "Sharks must crab walk",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "30 seconds",
            coachPosition: "Center, everyone frozen",
            script:
              "SAY: 'Freeze! Point to sharks.' ASK: 'What helped keep your ball safe?' TEACH: Demo shielding - body between shark and ball, low dribble.",
          },
          {
            phase: "Round 2",
            duration: "2 minutes",
            coachPosition: "Outside grid",
            script:
              "SAY: 'Sharks, how many can you get? Let's count!' Reinforce shielding. End with freeze and count.",
          },
          {
            phase: "Round 3 & Wrap",
            duration: "2.5 minutes",
            coachPosition: "Outside grid",
            script:
              "Switch sharks. Run 90-second round. WRAP: 'Great shielding and awareness! In games, defenders try to steal - now you know how to protect! Water break!'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          sharksTooStrong: {
            symptoms: [
              "Most balls knocked away in 30 seconds",
              "Frustrated dribblers",
              "No one escapes",
            ],
            solutions: [
              "Remove a shark",
              "Bigger grid (30x30)",
              "Sharks crab walk",
              "Add safe zone corners",
            ],
          },
          sharksTooWeak: {
            symptoms: [
              "No balls knocked away",
              "Frustrated sharks",
              "Dribblers cruising",
            ],
            solutions: [
              "Add a shark",
              "Smaller grid (20x20)",
              "No standing still",
              "Weak hand only",
            ],
          },
        },
        playerBehavior: {
          notParticipating: {
            symptoms: ["Standing at edge", "Not dribbling", "Disengaged"],
            approach:
              "Privately ask: 'Everything okay?' Offer alternative role: 'Help me count catches?' Wait it out - often join after watching.",
          },
          overlyAggressive: {
            symptoms: [
              "Pushing players",
              "Going for body not ball",
              "Dangerous reaches",
            ],
            approach:
              "IMMEDIATE pause if dangerous. SAY: 'We go for BALL, not person.' If continues: 'Take 1-minute break.'",
          },
          frustrated: {
            symptoms: ["Slamming ball", "Saying 'I can't'", "Tears"],
            approach:
              "Quick private word. Offer easier role. Normalize: 'Everyone finds this hard at first.'",
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
              1: "Ball frequently knocked away; can't escape sharks",
              2: "Sometimes escapes but no shielding; reactive not proactive",
              3: "Uses body to shield; looks up occasionally; survives most rounds",
              4: "Proactively avoids sharks; uses direction changes; rarely caught",
              5: "Beats sharks easily; helps teammates; could coach others",
            },
            assessmentNotes:
              "Watch across multiple rounds. Early performance may not reflect true ability as they learn the game.",
          },
          {
            skill: "Court Awareness / Scanning",
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
            skill: "Ball Protection/Shielding",
            domain: "Technical",
            howItDevelops:
              "Using body position and arm bar to protect the dribble from defenders.",
            levelIndicators: {
              1: "No awareness of body positioning",
              2: "Occasionally uses body when reminded",
              3: "Consistently turns body to protect",
              4: "Uses arm bar and body together naturally",
              5: "Protects while maintaining offensive threat",
            },
          },
          {
            skill: "Change of Direction",
            domain: "Technical",
            howItDevelops:
              "Evading sharks requires quick turns and direction changes while maintaining dribble.",
          },
        ],
        physicalDevelopment: {
          agility: "Quick direction changes, stops, starts",
          spatialAwareness: "Understanding space relative to others",
          cardiovascular: "Continuous movement for 8 minutes",
        },
        psychologicalDevelopment: {
          resilience: "Getting caught and coming back in",
          competitiveness: "Desire to survive",
          enjoyment: "Fun activity builds love of basketball",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Shark Attack develops dribbling under pressure in game-like context WITHOUT team tactical complexity. Players focus on: controlling ball, avoiding pressure, recovering from failure. This mirrors having the ball in games when defenders close down.",
        whenToUseIt: {
          idealFor: [
            "Early in practice (warmup) - gets energy up",
            "When players need ball protection practice",
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
              activity: "Traffic Lights (Basketball)",
              reason: "Ball control at speeds without defenders",
            },
            {
              activity: "Cone Dribbling",
              reason: "Dribbling through spaces without pressure",
            },
          ],
          after: [
            {
              activity: "1v1 to Basket",
              reason: "Dribbling under pressure with scoring",
            },
            {
              activity: "3v3 Half Court",
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
              "Scan the court",
            ],
            duration: "6 minutes max",
            simplifications: ["Bigger grid", "Fewer sharks", "No weak hand"],
          },
          ages9to11: {
            approach: "Introduce technique, maintain fun",
            keyPhrases: ["Body position!", "Low dribble!", "Eyes up!"],
            challenges: ["Weak hand rounds", "Must use a spin move to escape"],
            duration: "8 minutes with teaching",
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
            "Design so everyone succeeds: enough sharks that weak aren't targeted.",
          "Not learning technique":
            "Learning to APPLY technique under pressure is harder than isolated technique.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We play Shark Attack because it develops dribbling under pressure in a fun, game-like context. Your child learns to protect the ball while someone tries to take it - exactly what happens in games.",
        newsletter:
          "This week: Shark Attack! This game teaches ball protection under pressure. Watch for your child using their body to 'shield' the ball at home or in games!",
        whatToWatchFor: [
          "Does your child protect ball with their body? (shielding)",
          "Do they look up while dribbling? (awareness)",
          "Can they change direction quickly? (agility)",
          "Do they keep the dribble low? (technique)",
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
            risk: "Reaching for body",
            prevention: "State 'go for ball only' before game",
            response: "Immediate stop, reminder, repeat = sit out",
          },
          {
            risk: "Falling while protecting",
            prevention: "Emphasize control over speed",
            response: "Check player, remind about balance",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences: "Pair faster dribblers with faster sharks",
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
    sport: "basketball",
    name: "Knockout",
    slug: "knockout",
    description:
      "Classic basketball shooting game where players race to make a shot before the person behind them. Develops shooting under pressure, rebounding, and quick shot execution in a competitive, high-energy format loved by players of all ages.",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 15,
    durationMinutes: 10,
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 2 basketballs\n□ 1 basketball hoop\n□ Floor tape or cone to mark free throw line (optional)\n\nSPACE: One basket with space for a line behind free throw line\n\nSETUP STEPS\n1. All players line up behind the free throw line (or closer for younger players)\n2. First two players in line each have a ball\n3. Everyone else waits in line without a ball\n4. Mark shooting spot if needed (closer for ages 6-8)\n\nDIAGRAM\n                    [BASKET]\n                       │\n                       │\n    ─────────────────────────────  Free throw line\n                       │\n                       │\n           ○ ○ ○ ○ ○ ○ ○ ○ ○      (Line of players)\n           ▲ ▲\n       Ball Ball                  First 2 have balls",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (60 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: At the free throw line\n\nSAY: "Everyone line up behind this line! First two players, grab a ball!"\n\nSAY: "This is KNOCKOUT! Here\'s how it works: First player shoots. If you make it, pass the ball to the next person without a ball and go to the back of the line. If you miss, you have to rebound and make a shot before the person behind you does!"\n\nSAY: "Here\'s the twist - if the person behind you makes their shot before you make yours, you\'re KNOCKED OUT and sit down to cheer. Last person standing wins!"\n\nDEMO: Walk through with first two players showing what happens on a make and a miss.\n\n\nPHASE 2: FIRST GAME (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "First shooter, ready? GO!"\n\nDURING PLAY - What to Watch For:\n□ Are players rebounding their own misses?\n□ Are they shooting quickly or hesitating?\n□ Are knocked out players staying engaged?\n\nPHRASES TO USE:\n• "Rebound! Get that ball!"\n• "Quick shot! Don\'t wait!"\n• "Nice make! Pass it back!"\n• "Great hustle!"\n\nWHEN SOMEONE IS KNOCKED OUT:\nSAY: "Great effort! Have a seat and cheer for your friends! You\'re back in next round."\n\nContinue until one player remains.\n\n\nPHASE 3: TEACHING MOMENT (45 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: At the free throw line with all players\n\nSAY: "Great round! Quick question - after you missed, where was the easiest place to make a shot?"\nListen for: "Close to the basket," "Under the hoop"\n\nSAY: "Exactly! When you rebound, get as close as you can before shooting. Don\'t shoot from far away - get a LAYUP if you can!"\n\nDEMO: Miss intentionally, rebound, show getting close for easy shot.\n\n\nPHASE 4: SECOND GAME (4 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "New game! Remember - after you rebound, get CLOSE before you shoot!"\n\nOptions to keep eliminated players engaged:\n• "Knocked out players - count how many layups you see!"\n• "Rebounders for people still in!"\n• "Start a second game at another basket"\n\nContinue until winner is crowned.\n\n\nWRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great games! Remember - in Knockout, the best players don\'t just shoot fast, they get CLOSE after rebounds and make easy shots. That\'s smart basketball! Water break!"',
    diagram:
      "                [BASKET]\n                   │\n    ─────────────────────  Free throw line\n                   │\n       ○ ○ ○ ○ ○ ○ ○ ○      (Line of players)\n       ▲ ▲                  First 2 have balls",
    coachingPoints: [
      "QUICK RELEASE → Say: 'As soon as you get the ball, shoot! No hesitation!'",
      "REBOUND YOUR MISS → Say: 'Miss = chase! Get that ball before it hits the ground twice!'",
      "GET CLOSE AFTER REBOUND → Say: 'Don't shoot from far - get a layup!'",
      "STAY READY IN LINE → Say: 'Watch the shooter ahead of you - be ready!'",
    ],
    questionsToAsk: [
      "'After you miss, where should you shoot from?' → As close as possible!",
      "'Why do we shoot quickly in this game?' → Someone is trying to knock us out!",
      "'What makes a good rebound?' → Go where the ball will bounce!",
      "'How can you help teammates who are out?' → Cheer and stay engaged!",
    ],
    commonMistakes: [
      "SHOOTING FROM FAR AFTER REBOUND → Say: 'Get close! A layup is your best friend!'",
      "NOT REBOUNDING OWN MISS → Say: 'Your ball, your rebound! Chase it!'",
      "WAITING TOO LONG TO SHOOT → Say: 'Quick release! Don't let them catch you!'",
      "GETTING UPSET WHEN KNOCKED OUT → Say: 'Everyone gets knocked out sometimes! You're in next round!'",
    ],
    variations: [
      {
        name: "Lightning",
        description:
          "Same game, different name - some regions call it Lightning or Bump.",
        difficulty: "beginner",
      },
      {
        name: "Comeback Knockout",
        description:
          "Knocked out players shoot from side. If they make it, they're back in!",
        difficulty: "beginner",
      },
      {
        name: "21 Knockout",
        description:
          "First shot worth 2, second worth 1. First to 21 wins instead of elimination.",
        difficulty: "intermediate",
      },
      {
        name: "Reverse Knockout",
        description:
          "Start under basket, move back to free throw line with each make.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Players can't make shots from free throw line\n• Games end too quickly (everyone knocked out fast)\n• Frustration and tears\n\nSOLUTIONS:\n• Move shooting line closer (8 feet instead of 15)\n• Allow two free throw attempts before runner can shoot\n• Use lower basket if available\n• \"No knockout\" version - just track who makes most in 2 minutes\n• Allow anyone knocked out to come back after 2 players are out",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Players making most first shots\n• Games drag on\n• Asking for challenge\n\nSOLUTIONS:\n• Move line back\n• First shot must be a swish (no rim)\n• Weak hand only for close shots\n• Must make two in a row to survive (if you make one, shoot again)\n• Add third ball to increase pressure",
    equipmentNeeded: ["2 basketballs", "1 basketball hoop"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "game",
      "shooting",
      "rebounding",
      "competitive",
      "high-energy",
      "fun",
      "classic",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Players race to make a shot before the person behind them; develops shooting under pressure and quick execution.",
        keyPhrases: [
          "Quick release - don't wait!",
          "Rebound your miss!",
          "Get close for the easy shot!",
        ],
        setupDiagram:
          "Single file line at free throw line, first 2 players have balls",
        quickProgression: {
          easier:
            "Move line closer, allow two free throw attempts, lower basket",
          harder:
            "Move line back, must swish first shot, weak hand close shots",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Ensure 2 game-ready basketballs",
            "Mark shooting line appropriate for age (closer for 6-8)",
            "Plan how to keep eliminated players engaged",
            "Consider multiple games if you have 15+ players and 2 baskets",
          ],
          mindset:
            "Knockout is about FUN and COMPETITION. Keep energy high, celebrate makes and effort, manage eliminated players so they stay engaged. This game should feel special.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "60 seconds",
            coachPosition: "At the free throw line",
            script:
              "Line players up, give first 2 balls. Explain: make = pass ball back, miss = rebound and make before person behind you. Demo with first 2 players.",
            anticipatedResponses: {
              "What if I always miss?":
                "Everyone misses! Get close for an easy shot after you rebound.",
              "Can I knock out on purpose?":
                "Your goal is to make YOUR shot - let the game happen naturally.",
            },
          },
          {
            phase: "First Game",
            duration: "4 minutes",
            coachPosition: "Near basket to see action",
            script:
              "SAY: 'First shooter, GO!' Encourage rebounding, quick shots, hustle. Manage knockouts with positivity.",
            troubleshooting: {
              "No one can make shots": [
                "Move line closer",
                "Allow two attempts",
                "Lower basket",
              ],
              "Same players always win": [
                "Handicap: good shooters start from further back",
                "Different starting order",
              ],
            },
          },
          {
            phase: "Teaching Moment",
            duration: "45 seconds",
            coachPosition: "At free throw line, all players",
            script:
              "ASK: 'After a miss, where's the easiest shot?' TEACH: Get close - layup is your friend! Demo: miss, rebound, get close, make.",
          },
          {
            phase: "Second Game",
            duration: "4 minutes",
            coachPosition: "Near basket",
            script:
              "New game emphasizing getting close after rebounds. Keep eliminated players engaged with counting tasks or second game.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "Center with all players",
            script:
              "SAY: 'Best players get CLOSE after rebounds - that's smart basketball! Water break!'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          gamesEndTooFast: {
            symptoms: [
              "Everyone knocked out in 1 minute",
              "Not enough touches",
              "Frustration",
            ],
            solutions: [
              "Move line closer",
              "Allow two free throw attempts",
              "Comeback rule: make a side shot to get back in",
            ],
          },
          gamesDragOn: {
            symptoms: [
              "Same players left forever",
              "Others bored waiting",
              "Loses energy",
            ],
            solutions: [
              "Add third ball",
              "Time limit (2 minutes) then sudden death",
              "Weak hand requirement",
            ],
          },
        },
        playerBehavior: {
          upsetWhenKnockedOut: {
            symptoms: ["Tears", "Anger", "Saying 'not fair'"],
            approach:
              "Normalize: 'Everyone gets knocked out - that's the game! You're in next round.' Give them a job: 'Count makes for me?'",
          },
          notTrying: {
            symptoms: ["Not chasing rebounds", "Slow shots", "Distracted"],
            approach:
              "Private encouragement. Maybe the game is too hard - adjust difficulty. Or ask: 'What's up? Not feeling it today?'",
          },
          overlyCompetitive: {
            symptoms: [
              "Celebrating others' misses meanly",
              "Arguing calls",
              "Ball hogging",
            ],
            approach:
              "SAY: 'We celebrate our own makes, not others' misses.' If continues: 'Take a round off.'",
          },
        },
        environmentalIssues: {
          onlyOneBasket: {
            symptoms: ["Long wait times", "Players distracted"],
            solutions: [
              "Smaller games (max 8 per game)",
              "Shooting practice for those waiting",
              "Rotate groups",
            ],
          },
          unevenSkillLevels: {
            symptoms: [
              "Same players always win",
              "Weaker players always first out",
            ],
            solutions: [
              "Better shooters start further back",
              "Pair weak/strong for team knockout",
              "Multiple games by level",
            ],
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Shooting Under Pressure",
            domain: "Technical",
            howItDevelops:
              "Players must execute shots while someone is racing to knock them out - mirrors game pressure.",
            levelIndicators: {
              1: "Panics, rushes shot badly, usually misses",
              2: "Sometimes makes under pressure, inconsistent",
              3: "Maintains form under moderate pressure",
              4: "Composed shooter, makes most pressure shots",
              5: "Thrives under pressure, clutch performer",
            },
            assessmentNotes:
              "Watch how shooting form changes as person behind gets closer. Composure reveals level.",
          },
          {
            skill: "Rebounding",
            domain: "Technical",
            howItDevelops:
              "Players learn to anticipate where missed shots go and pursue the ball aggressively.",
            levelIndicators: {
              1: "Watches miss, doesn't pursue",
              2: "Goes after ball but often beaten to it",
              3: "Rebounds own miss consistently",
              4: "Anticipates ball direction, quick to ball",
              5: "Natural rebounder, always in position",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "Quick Shot Release",
            domain: "Technical",
            howItDevelops:
              "Must shoot quickly to avoid being knocked out - builds fast but controlled release.",
            levelIndicators: {
              1: "Very slow release, lots of wasted motion",
              2: "Average speed, some hesitation",
              3: "Quick release, maintains form",
              4: "Very quick with good form",
              5: "Lightning release without sacrificing accuracy",
            },
          },
          {
            skill: "Layups",
            domain: "Technical",
            howItDevelops:
              "After rebounds, close shots/layups are the smart play - reinforces layup importance.",
          },
        ],
        physicalDevelopment: {
          explosiveness: "Quick starts to chase rebounds",
          handEyeCoordination: "Shooting and rebounding",
          cardiovascular: "Continuous activity when in the game",
        },
        psychologicalDevelopment: {
          resilience: "Being knocked out and returning next game",
          clutchPerformance: "Executing under pressure",
          sportsmanship: "Handling winning and losing gracefully",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Knockout develops shooting under pressure in a competitive format that players LOVE. The pressure of someone trying to knock you out mirrors game situations. The rebounding aspect teaches players to follow their shot and finish at the rim.",
        whenToUseIt: {
          idealFor: [
            "End of practice (fun reward)",
            "When you need high engagement quickly",
            "Shooting practice with competition",
            "Building team culture (players love this game)",
          ],
          avoidWhen: [
            "Beginning of practice (need proper warmup first)",
            "Players can't make shots from available distance",
            "Only one basket with 20+ players",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Form Shooting",
              reason: "Build shooting mechanics",
            },
            {
              activity: "Layup Lines",
              reason: "Close finishing ability",
            },
          ],
          after: [
            {
              activity: "Free Throw Practice",
              reason: "Transfer pressure handling to free throws",
            },
            {
              activity: "Game Situations",
              reason: "Apply clutch shooting to team play",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Fun first, close distance, lots of encouragement",
            keyPhrases: [
              "Chase that ball!",
              "Get close for an easy one!",
              "You'll be back next round!",
            ],
            duration: "8 minutes max (attention span)",
            simplifications: [
              "Shoot from 6-8 feet",
              "Lower basket if available",
              "Comeback rule after 2 outs",
            ],
          },
          ages9to11: {
            approach: "Real competition, teach strategy",
            keyPhrases: [
              "After your rebound, get CLOSE!",
              "Quick release!",
              "Read where the ball bounces!",
            ],
            challenges: ["Full free throw distance", "Swish first shot rule"],
            duration: "10 minutes",
          },
          ages12to14: {
            approach: "High competition, strategic thinking",
            keyPhrases: ["Where's the smart shot?", "Manage the pressure!"],
            challenges: [
              "Extended range",
              "Weak hand close shots",
              "Three-ball version",
            ],
            coachRole:
              "Let them run it, intervene only for safety/sportsmanship",
          },
        },
        commonMisconceptions: {
          "It's just a game":
            "Knockout develops real skills - shooting under pressure, rebounding, quick execution.",
          "Better shooters always win":
            "Rebounding and close finishing often matter more than initial shooting.",
          "Gets kids upset":
            "When managed well with comeback rules and positivity, even knocked-out players stay engaged.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We play Knockout because it teaches shooting under pressure, rebounding, and quick decision-making. Your child learns to perform when it matters - just like in real games.",
        newsletter:
          "This week: Knockout! This classic basketball game teaches pressure shooting and rebounding. After a miss, the best strategy is to get close for an easy shot. Practice at home - just need 2 balls and a hoop!",
        whatToWatchFor: [
          "Does your child chase their rebound quickly?",
          "Do they get close before shooting after a miss?",
          "Can they handle the pressure of someone shooting behind them?",
          "Are they a good sport when knocked out?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions chasing rebounds",
            prevention: "Emphasize YOUR ball, YOUR space",
            response: "Check players, remind about awareness",
          },
          {
            risk: "Balls hitting waiting players",
            prevention: "Line stands back from basket",
            response: "Move line further back",
          },
          {
            risk: "Slipping on court",
            prevention: "Clear any water/sweat",
            response: "Check player, dry floor",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Adjust shooting distance individually, allow sitting for those who need it",
          newPlayers:
            "Explain rules clearly, pair with experienced player, start them in middle of line (not first)",
          anxiousPlayers:
            "Practice round first, emphasize everyone gets knocked out, use comeback rule",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did eliminated players stay engaged?",
          "Was the difficulty appropriate for the group?",
          "Did I manage sportsmanship well?",
          "Did I teach the 'get close' strategy?",
        ],
        forImprovement: [
          "How could I keep eliminated players more engaged?",
          "What distance works best for this group?",
          "Were any players consistently first out? How can I help them?",
        ],
      },
    },
  },
  {
    sport: "basketball",
    name: "Layup Lines",
    slug: "layup-lines",
    description:
      "Classic basketball warm-up drill where players practice layups from both sides with continuous rotation. Develops proper layup footwork, finishing at the rim, rebounding, and passing fundamentals in a flowing, game-like format.",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 8,
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 2-4 basketballs\n□ 1 basketball hoop\n□ Optional: cones to mark lines\n\nSPACE: One basket with enough space for two lines\n\nSETUP STEPS\n1. Form two lines at half court or top of key\n2. Right side line = shooters (balls start here)\n3. Left side line = rebounders/passers\n4. First 2 players in right line have balls\n\nDIAGRAM\n                    [BASKET]\n                       │\n                       │\n                       │\n         Rebounders    │    Shooters\n              ○ ○ ○ ○  │  ○ ○ ○ ○\n                       │  ▲ ▲\n                       │  Balls\n                       │\n──────────────────────────────────────  Half court",
    howToPlay:
      'PHASE 1: GATHER & EXPLAIN (90 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Near the basket\n\nSAY: "Everyone come in! We\'re doing Layup Lines. Split into two lines - right side are SHOOTERS, left side are REBOUNDERS. Shooters, first two get a ball!"\n\nEXPLAIN THE ROTATION:\nSAY: "Here\'s how it works: Shooter dribbles in, makes a layup. Rebounder follows, gets the ball, and passes to the next shooter. Then - and this is important - SHOOTER goes to REBOUND line, REBOUNDER goes to SHOOTING line."\n\nDEMO with two players:\n1. Shooter dribbles right, makes layup\n2. Rebounder catches, passes to next shooter\n3. Show them switching lines\n\nSAY: "Right side layups use right hand, left side layups use left hand. Let\'s start on the right. Ready? GO!"\n\n\nPHASE 2: RIGHT SIDE LAYUPS (2.5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCoach Position: Near the basket to see footwork\n\nSAY: "Right side - that means RIGHT HAND layup! Go!"\n\nWATCH FOR:\n□ Correct hand (right side = right hand)?\n□ Jumping off correct foot (left foot)?\n□ Passing after rebound (not throwing)?\n\nPHRASES TO USE:\n• "Right hand!"\n• "Jump off your left foot!"\n• "Nice soft touch!"\n• "Good pass!"\n\nAFTER 90 SECONDS - TEACHING MOMENT:\nSAY: "Freeze! Watch the footwork: dribble with right, last step is LEFT foot, reach up with RIGHT hand."\nDemo slowly, then at speed.\nSAY: "Keep going!"\n\n\nPHASE 3: SWITCH TO LEFT SIDE (2.5 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Now we\'re going LEFT SIDE! Shooters switch to the left line, rebounders to the right. LEFT HAND layups now!"\n\nWATCH FOR:\n□ Using left hand (this is hard for many)?\n□ Jumping off right foot?\n□ Soft touch on the glass?\n\nPHRASES TO USE:\n• "Left hand! Challenge yourself!"\n• "Right foot jump!"\n• "Use the backboard - it\'s your friend!"\n\nAFTER 90 SECONDS - TEACHING MOMENT:\nSAY: "Left hand is tricky! If it feels weird, that\'s normal. The more we practice, the easier it gets. One more minute, let\'s go!"\n\n\nPHASE 4: COMPETITION ROUND (2 minutes)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Challenge time! Let\'s count how many layups we make in 2 minutes. I\'ll count - you just keep flowing!"\n\nAlternate sides every 30 seconds:\n"30 seconds on right... SWITCH to left... 30 on left... SWITCH..."\n\nCount makes out loud. Celebrate effort.\n\nSAY: "We made [X]! Can we beat that next time? Water break!"\n\n\nWRAP UP (30 seconds)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nSAY: "Great work! Remember: right side = right hand, left foot jump. Left side = left hand, right foot jump. In games, you need both! Water break, then [next activity]."',
    diagram:
      "                [BASKET]\n                   │\n       Rebounders  │  Shooters\n            ○ ○ ○  │  ○ ○ ○\n                   │  ▲ ▲\n                   │  Balls\n──────────────────────────────────  Half court\n\nRotation: Shooter → Rebound line\n          Rebounder → Shooting line",
    coachingPoints: [
      "CORRECT HAND → Say: 'Right side, right hand! Left side, left hand!'",
      "CORRECT TAKEOFF FOOT → Say: 'Right hand layup = jump off left foot. Like a dance!'",
      "USE THE BACKBOARD → Say: 'Aim for the square on the backboard - it's your target!'",
      "SOFT TOUCH → Say: 'Gentle finish - don't throw it at the basket!'",
    ],
    questionsToAsk: [
      "'Which hand do we use on the right side?' → Right hand",
      "'Which foot do we jump off for a right hand layup?' → Left foot",
      "'Why do we use the backboard?' → Easier to aim, softer bounce",
      "'Why do we need to practice left hand?' → Defenders can block if we only use right",
    ],
    commonMistakes: [
      "WRONG HAND FOR SIDE → Say: 'Stop! Which side are you on? Right side = right hand!'",
      "WRONG TAKEOFF FOOT → Say: 'Switch feet! Right hand = LEFT foot jump!'",
      "TOO HARD ON THE GLASS → Say: 'Soft touch! Like you're placing it on a shelf!'",
      "NOT SWITCHING LINES → Say: 'Remember - shooter becomes rebounder, rebounder becomes shooter!'",
    ],
    variations: [
      {
        name: "Reverse Layups",
        description: "Come from under the basket, finish on the other side.",
        difficulty: "intermediate",
      },
      {
        name: "Power Layups",
        description: "Two-foot jump stop before the layup. More control.",
        difficulty: "beginner",
      },
      {
        name: "Mikan Drill",
        description:
          "Under basket, alternating hands without dribble. Builds touch.",
        difficulty: "beginner",
      },
      {
        name: "Full Court Layups",
        description:
          "Start from opposite baseline, full court dribble into layup.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "SIGNS THEY'RE STRUGGLING:\n• Missing most layups\n• Can't coordinate footwork\n• Left hand seems impossible\n\nSOLUTIONS:\n• Start closer to basket (no dribble, just layup)\n• Don't require specific foot - just get the ball in\n• Allow right hand on both sides at first\n• Slower pace - make each one count\n• Use smaller/lighter ball if available",
    makeHarder:
      "SIGNS THEY'RE READY:\n• Making most layups both sides\n• Footwork is automatic\n• Looking bored\n\nSOLUTIONS:\n• Add defender trailing (no block, just pressure)\n• Must use floater instead of layup\n• Reverse layups only\n• Add a pass before the layup\n• Time challenge - make 10 as fast as possible",
    equipmentNeeded: ["2-4 basketballs", "1 basketball hoop"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: [
      "warmup",
      "layups",
      "finishing",
      "fundamentals",
      "rotation",
      "classic",
    ],
    featured: true,
    comprehensiveGuide: {
      quickReference: {
        oneSentence:
          "Two-line layup drill with continuous rotation; develops finishing at the rim with both hands and proper footwork.",
        keyPhrases: [
          "Right side, right hand!",
          "Left foot jump for right hand!",
          "Use the backboard!",
        ],
        setupDiagram:
          "Two lines - right side shoots, left side rebounds. Shooter goes to rebound line, rebounder goes to shooting line.",
        quickProgression: {
          easier:
            "Closer to basket, no footwork requirement, dominant hand only",
          harder: "Add defender, reverse layups, time challenges",
        },
      },
      completeScript: {
        beforeYouStart: {
          preparation: [
            "Have 2-4 balls ready (more balls = less waiting)",
            "Consider ability level - adjust distance accordingly",
            "Plan whether to enforce footwork or just focus on makes",
            "Know how you'll manage the rotation",
          ],
          mindset:
            "Layup Lines are about RHYTHM and REPETITION. Keep it flowing, give quick feedback, celebrate makes. Don't stop the drill for long explanations - talk while they move.",
        },
        segments: [
          {
            phase: "Gather & Explain",
            duration: "90 seconds",
            coachPosition: "Near the basket",
            script:
              "SAY: 'Two lines - right side shoots, left side rebounds. Shooter becomes rebounder, rebounder becomes shooter.' Demo full rotation with 2 players.",
            anticipatedResponses: {
              "Which line do I start in?":
                "Pick one! You'll do both every round.",
              "What if I miss?":
                "Rebounder still gets it and passes. Try to make it next time!",
            },
          },
          {
            phase: "Right Side Layups",
            duration: "2.5 minutes",
            coachPosition: "Near basket for footwork view",
            script:
              "SAY: 'Right side = right hand! Go!' Watch for: correct hand, left foot takeoff, soft touch. Teaching moment at 90 seconds for footwork.",
            troubleshooting: {
              "Using wrong hand": [
                "Stop individual, 'Which side?' Correct and continue",
              ],
              "Can't coordinate footwork": [
                "Let them make it any way first, add footwork later",
              ],
            },
          },
          {
            phase: "Left Side Layups",
            duration: "2.5 minutes",
            coachPosition: "Near basket",
            script:
              "SAY: 'Switch to LEFT side! Left hand layups!' Acknowledge difficulty: 'If it feels weird, that's normal!' Teaching moment at 90 seconds.",
          },
          {
            phase: "Competition Round",
            duration: "2 minutes",
            coachPosition: "Near basket counting",
            script:
              "SAY: 'Let's count! How many in 2 minutes?' Alternate sides every 30 seconds. Count out loud. Celebrate total.",
          },
          {
            phase: "Wrap Up",
            duration: "30 seconds",
            coachPosition: "With group",
            script:
              "SAY: 'Right side = right hand, left foot. Left side = left hand, right foot. You need both in games! Water break!'",
          },
        ],
      },
      troubleshooting: {
        gameBalance: {
          drillTooSlow: {
            symptoms: [
              "Long waits between turns",
              "Players distracted",
              "Low energy",
            ],
            solutions: [
              "Add more balls",
              "Split into two groups at different baskets",
              "Shorter lines",
            ],
          },
          drillTooFast: {
            symptoms: ["Chaos", "Collisions", "Can't process feedback"],
            solutions: [
              "Fewer balls",
              "Require each finish before next starts",
              "Slow down and emphasize quality",
            ],
          },
        },
        playerBehavior: {
          notSwitchingLines: {
            symptoms: ["Same kids shooting", "Confusion about rotation"],
            approach:
              "Stop drill. Walk through rotation again. Assign someone to direct traffic.",
          },
          skippingWeakHand: {
            symptoms: [
              "Using right hand on left side",
              "Avoiding left side line",
            ],
            approach:
              "Normalize struggle: 'Left hand is supposed to be hard! That's why we practice.' Celebrate attempts.",
          },
          notRebounding: {
            symptoms: ["Ball drops to floor", "Slow restarts"],
            approach:
              "SAY: 'Rebounders - catch it before it bounces! Be ready!' Make it a mini-competition.",
          },
        },
        environmentalIssues: {
          tooManyPlayers: {
            symptoms: ["Lines too long", "Too much waiting"],
            solutions: [
              "Split to 2 baskets",
              "Add third line for ball handling while waiting",
              "Rotate groups",
            ],
          },
          mixedSkillLevels: {
            symptoms: ["Some make every layup, some miss all"],
            solutions: [
              "Group by ability",
              "Adjust distance for individuals",
              "Pair strong with developing in same line for peer help",
            ],
          },
        },
      },
      skillConnections: {
        primarySkills: [
          {
            skill: "Layup Finishing",
            domain: "Technical",
            howItDevelops:
              "Repetitive practice of layups from both sides builds muscle memory and confidence at the rim.",
            levelIndicators: {
              1: "Misses most layups, no clear technique",
              2: "Makes some layups with dominant hand, struggles with footwork",
              3: "Consistent dominant hand layups with correct footwork",
              4: "Can make layups with both hands, good touch",
              5: "Finishes with either hand naturally, can add variations",
            },
            assessmentNotes:
              "Assess both sides separately. Most players will be 1-2 levels lower on weak hand.",
          },
          {
            skill: "Layup Footwork",
            domain: "Technical",
            howItDevelops:
              "Correct foot-hand coordination (opposite foot, same hand) becomes automatic through repetition.",
            levelIndicators: {
              1: "No awareness of footwork, random approach",
              2: "Knows the rule but can't execute consistently",
              3: "Correct footwork on dominant side, struggles on weak",
              4: "Correct footwork both sides most of the time",
              5: "Automatic correct footwork, can adjust on the fly",
            },
          },
        ],
        secondarySkills: [
          {
            skill: "Rebounding",
            domain: "Technical",
            howItDevelops:
              "Players in rebound line practice catching made/missed shots and making quick outlets.",
            levelIndicators: {
              1: "Lets ball drop, slow reaction",
              2: "Catches most rebounds after bounce",
              3: "Catches before bounce consistently",
              4: "Anticipates shot, in position early",
              5: "Catches and outlets in one motion",
            },
          },
          {
            skill: "Passing",
            domain: "Technical",
            howItDevelops:
              "Quick outlet pass to next shooter develops passing accuracy under time pressure.",
          },
        ],
        physicalDevelopment: {
          coordination: "Foot-hand coordination for layups",
          balance: "Single-leg takeoff and control",
          touch: "Soft finishing at the rim",
        },
        psychologicalDevelopment: {
          persistence: "Continuing to try weak hand despite misses",
          confidence: "Building belief in finishing ability",
        },
      },
      developmentalContext: {
        whyThisActivity:
          "Layups are the highest percentage shot in basketball. Layup Lines provide massive repetition in a game-like flow. Learning both hands is essential - defenders will take away the strong hand. The rotation teaches rebounding and passing in context.",
        whenToUseIt: {
          idealFor: [
            "Beginning of practice after dynamic warmup",
            "Teaching layup technique",
            "High-rep finishing practice",
            "Team warmup before games",
          ],
          avoidWhen: [
            "Players have never attempted a layup (teach technique first)",
            "Only one basket with 20+ players",
            "End of practice when tired (form breaks down)",
          ],
        },
        progressionPath: {
          before: [
            {
              activity: "Stationary Layup Form",
              reason: "Teach the motion without movement",
            },
            {
              activity: "Mikan Drill",
              reason: "Build touch at rim without approach",
            },
          ],
          after: [
            {
              activity: "Layups off the Pass",
              reason: "Receive and finish",
            },
            {
              activity: "Layups with Defender",
              reason: "Add game-like pressure",
            },
          ],
        },
        ageAdaptations: {
          ages6to8: {
            approach: "Fun, lots of makes, don't stress footwork initially",
            keyPhrases: ["Get it in!", "Nice shot!", "Try the other hand!"],
            duration: "6 minutes max",
            simplifications: [
              "Lower basket if available",
              "Closer starting point",
              "Don't require specific footwork",
            ],
          },
          ages9to11: {
            approach: "Teach correct technique, expect development",
            keyPhrases: [
              "Right side, right hand!",
              "Off your left foot!",
              "Soft touch!",
            ],
            challenges: ["Require correct footwork", "Count makes per minute"],
            duration: "8 minutes",
          },
          ages12to14: {
            approach: "Polish technique, add variations",
            keyPhrases: [
              "Make it automatic!",
              "Game speed!",
              "Read the defender!",
            ],
            challenges: ["Add trailing defender", "Reverse layups", "Floaters"],
            coachRole: "Occasional feedback, let them self-organize",
          },
        },
        commonMisconceptions: {
          "Just get it in, doesn't matter how":
            "Good habits now make clutch layups later. Footwork matters.",
          "Left hand will develop naturally":
            "Must deliberately practice weak hand - it won't develop without intentional work.",
          "This is boring/basic":
            "NBA players do layup lines every day. Fundamentals never get old.",
        },
      },
      parentCommunication: {
        ifAsked:
          "We do Layup Lines because layups are the most important shot in basketball - they're the highest percentage. We practice both hands because in games, defenders will take away your strong hand.",
        newsletter:
          "This week: Layup Lines! We practiced finishing at the rim with both right and left hands. At home, practice the footwork: right hand layup = jump off left foot. Left hand = jump off right foot!",
        whatToWatchFor: [
          "Can your child make a layup with their dominant hand?",
          "Are they attempting left hand layups? (It's okay if they miss!)",
          "Do they use the backboard?",
          "Is their touch soft or do they throw it hard?",
        ],
      },
      safety: {
        commonRisks: [
          {
            risk: "Collisions at basket",
            prevention: "Clear rotation - shooter finishes before next goes",
            response: "Check players, reinforce timing",
          },
          {
            risk: "Rolled ankles on landing",
            prevention: "Land on two feet when possible, proper footwear",
            response: "Ice, evaluate severity",
          },
          {
            risk: "Ball hitting waiting players",
            prevention: "Waiting lines stand clear of basket area",
            response: "Move lines further back",
          },
        ],
        inclusionConsiderations: {
          physicalDifferences:
            "Adjust basket height if possible, allow closer starting point",
          newPlayers: "Pair with experienced player who can help with rotation",
          anxiousPlayers:
            "Start them in rebound line (less pressure), move to shooting when comfortable",
        },
      },
      coachReflection: {
        afterActivity: [
          "Did all players get enough repetitions?",
          "Was the pace appropriate - not too slow or chaotic?",
          "Did I give enough feedback on technique?",
          "Did I celebrate weak hand attempts?",
        ],
        forImprovement: [
          "How can I speed up the rotation?",
          "Who needs more help with footwork?",
          "What variation should I add next time?",
        ],
      },
    },
    skillsDeveloped: ["passing-basketball"],
  },
  {
    sport: "basketball",
    name: "Ball Handling Circuit",
    slug: "ball-handling-circuit",
    description: "Stationary ball handling series to develop touch and control",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 8,
    setupInstructions:
      "Players spread out, each with a ball. Enough space for movement.",
    howToPlay:
      "Each exercise 30 seconds:\n1. Ball slaps - rapid slaps on ball\n2. Fingertip taps - quick taps using fingertips only\n3. Around the waist - circle ball around waist both directions\n4. Around the knees - circle ball around knees\n5. Figure 8 - weave ball through legs in figure 8\n6. One hand dribble (right)\n7. One hand dribble (left)\n8. Crossover dribbles",
    coachingPoints: [
      "Quick hands, soft touch",
      "Eyes up - don't look at ball",
      "Athletic stance - knees bent",
      "Challenge yourself to go faster",
    ],
    questionsToAsk: [
      "Can you do it without looking?",
      "Which hand feels weaker?",
      "How low can you keep your dribble?",
    ],
    commonMistakes: [
      "Looking down at ball",
      "Standing straight up",
      "Slapping ball instead of controlling it",
    ],
    variations: [
      {
        name: "Eyes Closed",
        description: "Try exercises with eyes closed",
        difficulty: "advanced",
      },
      {
        name: "Moving Circuit",
        description: "Do exercises while walking forward",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Slower pace, fewer exercises",
    makeHarder: "Faster pace, eyes closed, add complexity",
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["warmup", "ball handling", "individual", "technique"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Dynamic Stretching Lines",
    slug: "dynamic-stretching-lines",
    description: "Movement-based warmup traveling down the court",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 6,
    setupInstructions:
      "Players line up on baseline. Travel to half-court and back.",
    howToPlay:
      "Each movement to half-court and back:\n1. Jog\n2. High knees\n3. Butt kicks\n4. Lateral slides (both directions)\n5. Carioca/Grapevine\n6. Backpedal\n7. Lunge walk\n8. Skip with arm circles",
    coachingPoints: [
      "Full range of motion",
      "Stay low in defensive stance movements",
      "Quick feet on agility movements",
      "Get heart rate up gradually",
    ],
    questionsToAsk: ["Why do we warm up?", "How does your body feel?"],
    commonMistakes: [
      "Going through motions without effort",
      "Standing too tall on slides",
    ],
    variations: [
      {
        name: "With Ball",
        description: "Add ball handling to some movements",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Shorter distance, simpler movements",
    makeHarder: "Full court, add complexity",
    equipmentNeeded: ["None"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["warmup", "movement", "agility", "stretching"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Triple Threat Moves",
    slug: "triple-threat-moves",
    description: "Practice attacking from triple threat position",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    setupInstructions:
      "Partners with one ball. One player is defender (passive at first).",
    howToPlay:
      "From triple threat position, practice:\n1. Jab step and shoot\n2. Jab step and drive right\n3. Jab step and drive left\n4. Shot fake and drive\n5. Shot fake, jab, crossover drive\n\nDefender gradually increases pressure over repetitions.",
    coachingPoints: [
      "Strong athletic triple threat stance",
      "Sell the fake with eyes and body",
      "Protect the ball",
      "Read the defender's reaction",
    ],
    questionsToAsk: [
      "What does the defender do when you jab?",
      "When should you shoot vs drive?",
      "How do you keep the ball protected?",
    ],
    commonMistakes: [
      "Weak jab step",
      "Not reading the defender",
      "Picking up dribble too early",
    ],
    variations: [
      {
        name: "Live Defense",
        description: "Defender tries to steal on catch",
        difficulty: "advanced",
      },
      {
        name: "Closeout",
        description: "Defender closes out, player reads and reacts",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Passive defense, slower pace",
    makeHarder: "Active defense, add shot clock",
    equipmentNeeded: ["1 ball per pair"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["offense", "triple threat", "1v1", "footwork"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Form Shooting Progression",
    slug: "form-shooting-progression",
    description: "Build proper shooting mechanics from foundation up",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 12,
    setupInstructions:
      "Each player at a basket (can share). Start close to basket.",
    howToPlay:
      "Progress through each stage (10 reps each):\n1. One-hand form shooting (3 feet from basket)\n2. Add guide hand (3 feet)\n3. One-dribble pull-up (5 feet)\n4. Catch and shoot (8 feet)\n5. Move to 10-12 feet\n6. Move to 3-point line (older players only)",
    coachingPoints: [
      "BEEF: Balance, Eyes, Elbow, Follow-through",
      "Elbow under the ball",
      "Snap the wrist - 'reach into the cookie jar'",
      "Hold follow-through until ball hits rim",
    ],
    questionsToAsk: [
      "Where are you aiming?",
      "How does your release feel?",
      "What does your follow-through look like?",
    ],
    commonMistakes: [
      "Elbow out to the side",
      "Not using legs",
      "Guide hand pushing the ball",
      "Not holding follow-through",
    ],
    variations: [
      {
        name: "Partner Checking",
        description: "Partners check each other's form",
        difficulty: "beginner",
      },
      {
        name: "Competition",
        description: "Make 5 from each spot to advance",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Stay closer to basket, more time",
    makeHarder: "Move back faster, add defender",
    equipmentNeeded: ["1 ball per player", "Baskets"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["shooting", "form", "technique", "individual"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Cone Dribbling Course",
    slug: "cone-dribbling-course",
    description: "Navigate through cones using different dribble moves",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    setupInstructions:
      "Set up 5-6 cones in a zigzag pattern, 3-4 yards apart. Multiple lines if needed.",
    howToPlay:
      "Round 1: Crossover at each cone\nRound 2: Between the legs at each cone\nRound 3: Behind the back at each cone\nRound 4: Player's choice - mix moves\n\nTime each run. Try to improve your time while maintaining control.",
    coachingPoints: [
      "Change of pace with each move",
      "Keep ball low",
      "Protect ball as you go by cone",
      "Eyes up, see the next cone",
    ],
    questionsToAsk: [
      "What move works best for you?",
      "How low can you keep the ball?",
      "When would you use each move in a game?",
    ],
    commonMistakes: [
      "Ball too high",
      "No change of speed",
      "Looking down at ball",
    ],
    variations: [
      {
        name: "Add Finish",
        description: "End with layup or pull-up jumper",
        difficulty: "intermediate",
      },
      {
        name: "Defender",
        description: "Passive defender trails behind",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Fewer cones, slower pace",
    makeHarder: "More cones, timed competition, add defender",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["dribbling", "moves", "agility", "technique"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "3v3 Half Court",
    slug: "3v3-half-court",
    description: "Small-sided game focusing on spacing and decision making",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 12,
    durationMinutes: 15,
    setupInstructions: "Half court with one basket. Teams of 3.",
    howToPlay:
      "1. Play 3v3 games to 7 points (1s and 2s)\n2. Make it, take it\n3. Check ball at top of key after scores and turnovers\n4. Call your own fouls\n5. Losers stay, winners rotate out",
    coachingPoints: [
      "Space the floor - don't bunch up",
      "Cut with purpose - don't stand",
      "Move the ball - don't hold",
      "Play help defense",
    ],
    questionsToAsk: [
      "Where should you be when a teammate drives?",
      "How do you create space?",
      "What does your help look like?",
    ],
    commonMistakes: [
      "Standing and watching",
      "Everyone going to the ball",
      "Not moving without the ball",
    ],
    variations: [
      {
        name: "Must Score Inside",
        description: "All scores must be in paint",
        difficulty: "intermediate",
      },
      {
        name: "3 Passes",
        description: "Must make 3 passes before shooting",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "No defense initially, add rules to help offense",
    makeHarder: "Shot clock, limited dribbles",
    equipmentNeeded: ["Balls", "Pinnies"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "small-sided", "tactical", "decision-making"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Shell Defense",
    slug: "shell-defense",
    description: "Foundation drill for team defensive positioning",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 12,
    durationMinutes: 10,
    setupInstructions:
      "4 offensive players around perimeter, 4 defenders. No basket needed initially.",
    howToPlay:
      "1. Offense passes the ball around the perimeter (no drives initially)\n2. Defense moves on every pass:\n   - On-ball: Up in stance\n   - One pass away: Deny position\n   - Two passes away: Help position\n3. Defenders call out position changes",
    coachingPoints: [
      "Move on the flight of the ball",
      "See man, see ball",
      "Jump to the ball on passes",
      "Communicate constantly",
    ],
    questionsToAsk: [
      "Where should you be when ball is two passes away?",
      "What do you call out?",
      "How do you help your teammate?",
    ],
    commonMistakes: ["Moving late", "Ball watching", "Not in proper stance"],
    variations: [
      {
        name: "Add Drives",
        description: "Allow offense to drive and kick",
        difficulty: "advanced",
      },
      {
        name: "Add Post",
        description: "Put fifth offensive player in post",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Slow ball movement, pause to check positions",
    makeHarder: "Faster ball movement, allow drives and cuts",
    equipmentNeeded: ["1 ball", "Cones optional"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["defense", "team", "positioning", "tactical"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "1v1 From Wing",
    slug: "1v1-from-wing",
    description: "Isolation game to develop attacking and defending skills",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 12,
    setupInstructions:
      "Offensive player on wing, defender guarding. Basket available.",
    howToPlay:
      "1. Coach passes to wing player\n2. Defender closes out properly\n3. Offensive player attacks to score (3 dribble limit)\n4. Play until score, miss, or turnover\n5. Rotate: offense to defense, defense out, new player on offense",
    coachingPoints: [
      "Closeout under control - short choppy steps",
      "Attack the defender's front foot",
      "Read the defense - shoot if open, drive if defender too close",
      "Play through contact",
    ],
    questionsToAsk: [
      "What did the defender give you?",
      "How did you attack their weak spot?",
      "What could you have done better?",
    ],
    commonMistakes: [
      "Not reading the defense",
      "Predictable - always going same direction",
      "Picking up dribble too early",
    ],
    variations: [
      {
        name: "Must Score in Paint",
        description: "Can only score layups or close shots",
        difficulty: "intermediate",
      },
      {
        name: "5-Dribble Limit",
        description: "More time to work but still limited",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "More dribbles allowed, passive defense",
    makeHarder: "2-dribble limit, full contact defense",
    equipmentNeeded: ["Balls", "Basket"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["1v1", "offense", "defense", "attacking"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Give and Go Game",
    slug: "give-and-go-game",
    description: "2v2 game focusing on passing and cutting fundamentals",
    activityType: "tactical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 10,
    setupInstructions:
      "Half court. Two offensive players, two defensive players. Coach at top of key.",
    howToPlay:
      "1. Coach passes to either offensive player\n2. Receiver must pass to partner immediately\n3. After passing, cut hard to basket\n4. Partner can:\n   - Pass to cutter for layup\n   - Take one dribble and shoot\n   - Pass back out and reset\n5. Play to 5 points, then switch offense/defense",
    coachingPoints: [
      "Pass and cut - don't stand",
      "Cut with purpose - sell it",
      "See the cutter",
      "Time the pass",
    ],
    questionsToAsk: [
      "When should you cut backdoor?",
      "How do you lose your defender?",
      "Where do you want the pass?",
    ],
    commonMistakes: [
      "Standing after passing",
      "Lazy cuts",
      "Not looking for cutter",
    ],
    variations: [
      {
        name: "Must Give and Go",
        description: "Every score must come from give and go",
        difficulty: "beginner",
      },
      {
        name: "Add Third Player",
        description: "3v3 with same rules",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Passive defense",
    makeHarder: "Active switching defense",
    equipmentNeeded: ["Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["passing", "cutting", "movement", "tactical"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "5v5 Controlled Scrimmage",
    slug: "5v5-controlled-scrimmage",
    description: "Full court scrimmage with coaching points and stops",
    activityType: "scrimmage",
    difficulty: "intermediate",
    minPlayers: 10,
    maxPlayers: 15,
    durationMinutes: 20,
    setupInstructions: "Full court, two teams of 5. Standard basketball rules.",
    howToPlay:
      "1. Play full 5v5 scrimmage\n2. Coach stops play to make teaching points\n3. Focus on specific concepts being worked on\n4. Can add restrictions (no 3s, must pass before shoot, etc.)",
    coachingPoints: [
      "Apply what we practiced",
      "Communicate on defense",
      "Move without the ball",
      "Execute together",
    ],
    questionsToAsk: [
      "What was the right play there?",
      "What could we have done better?",
      "Who should have helped?",
    ],
    commonMistakes: [
      "Reverting to bad habits",
      "Not communicating",
      "Selfish play",
    ],
    variations: [
      {
        name: "Two Pass Minimum",
        description: "Must make two passes before shooting",
        difficulty: "intermediate",
      },
      {
        name: "Post Touches",
        description: "Must get ball into post before shooting",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Stop more often to teach",
    makeHarder: "Let them play through mistakes",
    equipmentNeeded: ["Balls", "Pinnies"],
    spaceRequired: "large",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["scrimmage", "game", "team", "full court"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "21",
    slug: "21-game",
    description: "Free-for-all scoring game to 21 points",
    activityType: "fun",
    difficulty: "intermediate",
    minPlayers: 3,
    maxPlayers: 8,
    durationMinutes: 15,
    setupInstructions: "One basket. One ball. All players vs each other.",
    howToPlay:
      "1. First player shoots from top of key\n2. If make: shoot free throws (1 point each) until miss\n3. If miss: everyone rebounds - whoever gets it attacks\n4. Made shot from field = 2 points, then go to line for free throws\n5. If you foul, fouled player shoots free throws\n6. First to exactly 21 wins (must hit exact, or go back to 15)",
    coachingPoints: [
      "Box out for rebounds",
      "Attack quick on rebounds",
      "Make your free throws count",
    ],
    questionsToAsk: [
      "What's your strategy when you're close to 21?",
      "How do you create space to score?",
    ],
    commonMistakes: ["Not boxing out", "Forcing shots"],
    variations: [
      {
        name: "Taps",
        description: "Can score by tipping in miss off backboard",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "To 11 points",
    makeHarder: "Must go back to zero if over 21",
    equipmentNeeded: ["1 ball", "Basket"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["fun", "shooting", "rebounding", "competitive"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Partner Passing",
    slug: "partner-passing",
    description: "Cool down with fundamental passing practice",
    activityType: "cooldown",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 6,
    setupInstructions: "Partners 10-15 feet apart. One ball per pair.",
    howToPlay:
      "Practice different passes, 10 of each:\n1. Chest pass\n2. Bounce pass\n3. Overhead pass\n4. One-hand push pass (both hands)\n5. Baseball pass (longer distance)",
    coachingPoints: [
      "Step into your pass",
      "Snap the wrist for rotation",
      "Hit your target",
      "Give a target to your partner",
    ],
    questionsToAsk: ["When do you use each pass?", "What makes a good pass?"],
    commonMistakes: ["Not stepping into pass", "Telegraphing the pass"],
    variations: [
      {
        name: "Add Defender",
        description: "Third player guards passer",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Closer together",
    makeHarder: "Move while passing",
    equipmentNeeded: ["1 ball per pair"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["cooldown", "passing", "technique", "partners"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Red Light Green Light Dribble",
    slug: "red-light-green-light-dribble",
    description: "Classic game with dribbling - stop on red, go on green",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 6,
    setupInstructions:
      "Players line up on baseline with balls. Coach at opposite baseline.",
    howToPlay:
      "1. Coach turns back and calls 'Green light!' - players dribble forward\n2. Coach turns around and calls 'Red light!' - players must stop and control ball\n3. If caught moving or losing ball, go back to start\n4. First to reach coach wins",
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
    commonMistakes: [
      "Ball bouncing when stopped",
      "Looking down while dribbling",
    ],
    variations: [
      {
        name: "Weak Hand Only",
        description: "Must use non-dominant hand",
        difficulty: "intermediate",
      },
      {
        name: "Add Colors",
        description: "Yellow = slow dribble, Blue = crossovers",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Slower pace, longer distance",
    makeHarder: "Faster commands, add trick commands",
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "dribbling", "fun", "control"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Passing Partner Warmup",
    slug: "passing-partner-warmup",
    description: "Moving warmup while passing with a partner",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 6,
    setupInstructions:
      "Partners 10 feet apart, one ball per pair. Line up on sideline.",
    howToPlay:
      "1. Partners move down the court while passing back and forth\n2. Chest passes down\n3. Bounce passes back\n4. Overhead passes down\n5. One-hand push passes back",
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
      {
        name: "Add Defender",
        description: "Third player in middle tries to intercept",
        difficulty: "intermediate",
      },
      {
        name: "One-Touch",
        description: "Catch and pass in one motion",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Walking pace, shorter distance",
    makeHarder: "Running pace, longer distance, add defender",
    equipmentNeeded: ["1 ball per pair"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["warmup", "passing", "movement", "partners"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Four Corners Dribbling",
    slug: "four-corners-dribbling",
    description: "Dribbling through four stations with different moves at each",
    activityType: "warmup",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 8,
    setupInstructions:
      "Set up four cones in a square (20x20 yards). Split players into four groups.",
    howToPlay:
      "Corner 1 to 2: Right hand only\nCorner 2 to 3: Left hand only\nCorner 3 to 4: Crossovers\nCorner 4 to 1: Between the legs\nRotate continuously for time.",
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
      {
        name: "Add Reverse",
        description: "Go backwards from corner 4 to corner 1",
        difficulty: "advanced",
      },
      {
        name: "Race Format",
        description: "First to complete 2 laps wins",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Slower pace, simpler moves",
    makeHarder: "Faster pace, add behind-the-back, time it",
    equipmentNeeded: ["Cones", "1 ball per player"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["warmup", "dribbling", "moves", "conditioning"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Circle Passing",
    slug: "circle-passing",
    description: "Team passing game in a circle formation",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 20,
    durationMinutes: 6,
    setupInstructions:
      "Players form a circle. Start with one ball, add more as players improve.",
    howToPlay:
      "1. Pass around the circle (chest passes)\n2. Add second ball going opposite direction\n3. Call name before passing\n4. Try different passes: bounce, overhead\n5. Count consecutive passes without drop",
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
      {
        name: "Cross Circle",
        description: "Pass across the circle, not around",
        difficulty: "intermediate",
      },
      {
        name: "Three Balls",
        description: "Add third ball for chaos",
        difficulty: "advanced",
      },
    ],
    makeEasier: "One ball, slower pace",
    makeHarder: "Multiple balls, faster pace, must sit if you drop",
    equipmentNeeded: ["1-3 balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "passing", "teamwork", "focus"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Mikan Drill",
    slug: "mikan-drill",
    description: "Classic drill for developing soft touch around the rim",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 1,
    maxPlayers: 16,
    durationMinutes: 8,
    setupInstructions: "Players at basket. Can share baskets (2-3 per basket).",
    howToPlay:
      "1. Start under basket on right side\n2. Layup with right hand\n3. Rebound and go immediately to left side\n4. Layup with left hand\n5. Continue alternating, don't let ball touch ground\n6. Do 10 on each side, then rest",
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
    commonMistakes: [
      "Ball hitting ground between shots",
      "Not using backboard",
    ],
    variations: [
      {
        name: "Reverse Mikan",
        description: "Reverse layups instead",
        difficulty: "intermediate",
      },
      {
        name: "Jump Hook",
        description: "Use jump hooks instead of layups",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Allow ball to bounce between attempts",
    makeHarder: "Time it - most in 30 seconds, add jump",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["layups", "finishing", "technique", "individual"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Pound Dribble Series",
    slug: "pound-dribble-series",
    description: "Hard dribble exercises to build strength and control",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 10,
    setupInstructions: "Players spread out, each with a ball.",
    howToPlay:
      "Each exercise 30 seconds:\n1. Right hand pound (hard, low dribbles)\n2. Left hand pound\n3. Alternating pound\n4. Crossover pounds (in and out)\n5. Between legs pounds\n6. Behind back pounds",
    coachingPoints: [
      "Pound the ball into the floor",
      "Keep it below knee level",
      "Strong stance - stay balanced",
      "Eyes up when possible",
    ],
    questionsToAsk: ["Why do we pound the ball hard?", "How low should it be?"],
    commonMistakes: ["Dribbling too high", "Slapping instead of pushing"],
    variations: [
      {
        name: "Moving Pounds",
        description: "Do while walking forward",
        difficulty: "advanced",
      },
      {
        name: "Partner Challenge",
        description: "Partner tries to steal while you pound",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Slower pace, simpler moves",
    makeHarder: "Faster pace, add movement, partner defense",
    equipmentNeeded: ["1 ball per player"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["dribbling", "strength", "ball handling", "technique"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Elbow Shooting",
    slug: "elbow-shooting",
    description: "Mid-range shooting from the elbow areas",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 12,
    setupInstructions:
      "Groups at each basket. Shooters at elbows, rebounders under basket.",
    howToPlay:
      "1. Catch and shoot from right elbow (5 shots)\n2. Move to left elbow (5 shots)\n3. Add one-dribble pull-up from each elbow\n4. Track makes - goal is 7/10\n5. Rotate shooter/rebounder",
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
      {
        name: "Off Screen",
        description: "Partner sets screen before catch",
        difficulty: "advanced",
      },
      {
        name: "Shot Fake First",
        description: "Shot fake, one dribble, shoot",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Closer to basket, no time pressure",
    makeHarder: "Add defender, shot clock",
    equipmentNeeded: ["Baskets", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["shooting", "mid-range", "technique", "elbow"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Post Moves Circuit",
    slug: "post-moves-circuit",
    description: "Practice post moves against passive defense",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 12,
    setupInstructions: "Groups of 3: post player, defender (passive), passer.",
    howToPlay:
      "Practice each move 4 times:\n1. Drop step baseline\n2. Drop step middle\n3. Up and under\n4. Turnaround jumper\n5. Dream shake (advanced)",
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
      {
        name: "Live Defense",
        description: "Defender plays active",
        difficulty: "advanced",
      },
      {
        name: "Double Team",
        description: "Second defender comes to help",
        difficulty: "advanced",
      },
    ],
    makeEasier: "No defender, focus on footwork",
    makeHarder: "Active defender, must score",
    equipmentNeeded: ["Basket", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["post", "moves", "footwork", "technique"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Defensive Slide Course",
    slug: "defensive-slide-course",
    description: "Defensive positioning and footwork through cone course",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 10,
    setupInstructions:
      "Set up zigzag cone pattern down the court. 4-5 cones per lane.",
    howToPlay:
      "1. Start in defensive stance\n2. Slide to first cone\n3. Drop step and slide to next cone\n4. Continue zigzag pattern down court\n5. Sprint back, next person goes",
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
    commonMistakes: [
      "Standing up during slides",
      "Crossing feet",
      "Hands down",
    ],
    variations: [
      {
        name: "With Ball",
        description: "Offensive player dribbles, defender mirrors",
        difficulty: "advanced",
      },
      {
        name: "Closeout Start",
        description: "Start with closeout then slides",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Fewer cones, slower pace",
    makeHarder: "More cones, add ball, time it",
    equipmentNeeded: ["Cones"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["defense", "footwork", "slides", "technique"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Free Throw Routine",
    slug: "free-throw-routine",
    description: "Develop consistent free throw mechanics and routine",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 10,
    setupInstructions: "Players at free throw lines. 2-3 per basket.",
    howToPlay:
      "1. Develop your routine (3 dribbles, deep breath, etc.)\n2. Shoot 10 free throws\n3. Track your makes\n4. Shoot 5 more 'pressure' free throws (must make 3)\n5. Do light conditioning if miss pressure shots",
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
      {
        name: "Pressure Free Throws",
        description: "Run if you miss (game simulation)",
        difficulty: "intermediate",
      },
      {
        name: "Eyes Closed",
        description: "Shoot with eyes closed to feel the form",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "No pressure component",
    makeHarder: "More pressure, team total needed",
    equipmentNeeded: ["Baskets", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["shooting", "free throws", "routine", "technique"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Pick and Roll Basics",
    slug: "pick-and-roll-basics",
    description: "Learn fundamental pick and roll mechanics",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 12,
    setupInstructions:
      "Groups of 3: ball handler, screener, passive defender. Work on wing or top of key.",
    howToPlay:
      "1. Screener sets solid screen\n2. Ball handler uses screen to create advantage\n3. Screener rolls to basket after contact\n4. Ball handler reads - pass to roller or score\n5. Rotate positions after each rep",
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
    commonMistakes: [
      "Moving screen",
      "Ball handler not using screen",
      "Lazy roll",
    ],
    variations: [
      {
        name: "Pick and Pop",
        description: "Screener pops out for jumper instead of roll",
        difficulty: "intermediate",
      },
      {
        name: "Add Second Defender",
        description: "Play 2v2 off the screen",
        difficulty: "advanced",
      },
    ],
    makeEasier: "No defender, focus on footwork",
    makeHarder: "Active defenders, must score",
    equipmentNeeded: ["Baskets", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["pick and roll", "offense", "screening", "technique"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Outlet Pass Drill",
    slug: "outlet-pass-drill",
    description: "Practice rebounding and throwing quick outlet passes",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 10,
    setupInstructions:
      "Rebounder under basket, outlet receiver at sideline near half court.",
    howToPlay:
      "1. Coach shoots and misses\n2. Rebounder secures ball with two hands\n3. Pivot outside and locate outlet\n4. Throw baseball pass to outlet\n5. Outlet catches and attacks opposite basket",
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
    commonMistakes: [
      "Bringing ball down (gets stolen)",
      "Slow pivot",
      "Inaccurate pass",
    ],
    variations: [
      {
        name: "Add Defender",
        description: "Defender tries to intercept outlet",
        difficulty: "advanced",
      },
      {
        name: "Full Court",
        description: "Outlet attacks for layup",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "No defense, closer outlet",
    makeHarder: "Active defense, further outlet, must finish with layup",
    equipmentNeeded: ["Baskets", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["rebounding", "outlet", "passing", "transition"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Catch and Face",
    slug: "catch-and-face",
    description:
      "Practice receiving the ball and immediately facing the basket",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 10,
    setupInstructions:
      "Groups of 2-3 at each basket. Passer at top, receiver on wing.",
    howToPlay:
      "1. Receiver V-cuts to get open\n2. Catch the pass\n3. Immediately pivot to face basket (triple threat)\n4. Read: open for shot? Drive? Pass?\n5. Attack based on read",
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
    commonMistakes: [
      "Not facing basket",
      "Picking up dribble too early",
      "Standing straight up",
    ],
    variations: [
      {
        name: "Add Defender",
        description: "Close out on the catch",
        difficulty: "intermediate",
      },
      {
        name: "Must Attack",
        description: "Every catch leads to a drive or shot",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "No defense, focus on footwork",
    makeHarder: "Live defense, quick decisions",
    equipmentNeeded: ["Baskets", "Balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["catching", "footwork", "triple threat", "technique"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Euro Step Progression",
    slug: "euro-step-progression",
    description: "Learn the Euro step finish from basic to game speed",
    activityType: "technical",
    difficulty: "advanced",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 12,
    setupInstructions: "Groups at each basket. Cones to simulate defenders.",
    howToPlay:
      "Progression:\n1. Walk through footwork (no ball)\n2. Add ball, walk through\n3. Jog with ball\n4. Full speed off cone\n5. Full speed vs defender",
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
    commonMistakes: [
      "Traveling",
      "Second step not far enough",
      "Not protecting ball",
    ],
    variations: [
      {
        name: "Left Side",
        description: "Practice from left side of basket",
        difficulty: "advanced",
      },
      {
        name: "Live Defense",
        description: "Defender plays active",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Slower pace, no defense",
    makeHarder: "Active defense, must finish every time",
    equipmentNeeded: ["Baskets", "Cones", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["development"],
    tags: ["layups", "finishing", "footwork", "Euro step"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Spot Up Shooting",
    slug: "spot-up-shooting",
    description: "Practice catch-and-shoot from various spots on the floor",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 12,
    setupInstructions:
      "5 spots around the 3-point arc. Shooter rotates through spots.",
    howToPlay:
      "1. Start in corner\n2. Receive pass, shoot immediately\n3. Move to next spot\n4. Shoot 2 from each spot\n5. Track makes - goal is 7/10",
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
      {
        name: "Closeout",
        description: "Defender closes out before shot",
        difficulty: "advanced",
      },
      {
        name: "Shot Fake Option",
        description: "Can shot fake and drive",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Inside the arc, no time pressure",
    makeHarder: "Add defense, shot clock, must make X before moving",
    equipmentNeeded: ["Baskets", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["shooting", "spot up", "catch and shoot", "technique"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "2v1 Fast Break",
    slug: "2v1-fast-break",
    description: "Practice converting 2v1 advantages in transition",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 15,
    durationMinutes: 12,
    setupInstructions:
      "Two offensive players at half court, one defender at free throw line.",
    howToPlay:
      "1. Two attackers start at half court with ball\n2. Defender at free throw line extended\n3. Attackers attack to score\n4. If stopped, defense wins\n5. Rotate: attackers to defense, new attackers",
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
    commonMistakes: [
      "Getting too close together",
      "Slow attack",
      "Fancy passes",
    ],
    variations: [
      {
        name: "3v2",
        description: "Three attackers vs two defenders",
        difficulty: "intermediate",
      },
      {
        name: "Trail Defender",
        description: "Second defender trails from behind",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Start closer to basket",
    makeHarder: "Start further, add trailing defender",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["fast break", "transition", "2v1", "tactical"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Help Defense Drill",
    slug: "help-defense-drill",
    description: "Learn to help and recover in team defense",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 8,
    maxPlayers: 14,
    durationMinutes: 12,
    setupInstructions: "3 offensive players around the arc. 3 defenders.",
    howToPlay:
      "1. Ball starts on wing\n2. Ball handler drives to basket\n3. Help defender jumps to stop penetration\n4. Ball handler kicks out\n5. Defenders rotate - closest to ball recovers\n6. Play out the possession",
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
      {
        name: "4v4",
        description: "Add fourth player for more complexity",
        difficulty: "advanced",
      },
      {
        name: "Post Help",
        description: "Help on post entry instead",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Offense plays slow",
    makeHarder: "Offense goes hard, add fourth player",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["defense", "help", "rotations", "tactical"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Motion Offense Basics",
    slug: "motion-offense-basics",
    description: "Introduction to motion offense principles",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 10,
    maxPlayers: 15,
    durationMinutes: 15,
    setupInstructions:
      "5 offensive players in 3-out, 2-in formation. Start with no defense.",
    howToPlay:
      "Rules:\n1. Pass and cut (basket cut or away)\n2. Fill behind the cutter\n3. Screen away or down after passing\n4. Read the defense - take what they give\nPractice at walk-through speed first.",
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
      {
        name: "Add Defense",
        description: "Play 5v5 with motion rules",
        difficulty: "advanced",
      },
      {
        name: "4-Out",
        description: "Run motion from 4-out, 1-in set",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Walk through, no defense",
    makeHarder: "Live defense, play until score",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["offense", "motion", "team", "tactical"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Box Out and Rebound",
    slug: "box-out-and-rebound",
    description: "Team rebounding with proper box out technique",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 12,
    durationMinutes: 10,
    setupInstructions:
      "3 defensive players, 3 offensive players around the lane. Coach shoots.",
    howToPlay:
      "1. Coach shoots the ball\n2. Defenders MUST make contact and box out\n3. Fight for the rebound\n4. Offensive players try to get the board\n5. Whoever gets rebound gets a point",
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
    commonMistakes: [
      "Looking for ball before boxing out",
      "Weak box out",
      "Giving up on rebound",
    ],
    variations: [
      {
        name: "4v4",
        description: "Add fourth player to each side",
        difficulty: "intermediate",
      },
      {
        name: "Outlet Required",
        description: "Must throw outlet pass after rebound",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Start closer to basket",
    makeHarder: "Longer shots (longer rebounds), more players",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["rebounding", "box out", "defense", "tactical"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Press Break Basics",
    slug: "press-break-basics",
    description: "Learn to break full court press with composure",
    activityType: "tactical",
    difficulty: "advanced",
    minPlayers: 10,
    maxPlayers: 15,
    durationMinutes: 15,
    setupInstructions:
      "5 offensive players inbounding vs 5 defenders in press.",
    howToPlay:
      "1. Inbounder slaps ball to start\n2. Players execute press break alignment\n3. Goal: get ball to half court in 8 seconds\n4. Once across, play continues to basket",
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
    commonMistakes: [
      "Panic dribbling",
      "Standing instead of moving",
      "Throwing long passes when not open",
    ],
    variations: [
      {
        name: "1-2-2 Press",
        description: "Break specific press formation",
        difficulty: "advanced",
      },
      {
        name: "Must Score",
        description: "Play continues until score or turnover",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Light press, walk through first",
    makeHarder: "Aggressive trapping, must score",
    equipmentNeeded: ["Full court", "Ball"],
    spaceRequired: "large",
    indoorSuitable: true,
    appropriateStages: ["development"],
    tags: ["press break", "offense", "inbound", "tactical"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "2v2 Full Court",
    slug: "2v2-full-court",
    description: "Full court game with only two players per side",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 12,
    durationMinutes: 15,
    setupInstructions: "Full court, two teams of 2. Game to 7 points.",
    howToPlay:
      "1. 2v2 full court - live transitions\n2. Make it, take it (keep ball if you score)\n3. Must check ball at top of arc after scores\n4. Winners stay, losers rotate out",
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
    commonMistakes: [
      "Ball watching on defense",
      "Poor conditioning",
      "One-on-one only",
    ],
    variations: [
      {
        name: "Must Pass First",
        description: "Must pass before you can score",
        difficulty: "intermediate",
      },
      {
        name: "2s and 3s",
        description: "Count 2s and 3s separately",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Half court instead",
    makeHarder: "Longer games, conditioning penalties for losers",
    equipmentNeeded: ["Full court", "Ball"],
    spaceRequired: "large",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "2v2", "full court", "conditioning"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "5v5 with Constraints",
    slug: "5v5-with-constraints",
    description: "Full scrimmage with specific rules to emphasize skills",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 10,
    maxPlayers: 15,
    durationMinutes: 20,
    setupInstructions:
      "Full court 5v5. Coach chooses constraint for each game.",
    howToPlay:
      "Possible constraints:\n1. No dribble game (passing only)\n2. Must make 3 passes before shooting\n3. Everyone touches ball before shot\n4. No 3-pointers (must score inside)\n5. Extra point for assists\nPlay games with different constraints.",
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
    commonMistakes: [
      "Forgetting the constraint",
      "Selfish play",
      "Poor communication",
    ],
    variations: [
      {
        name: "Defense Constraint",
        description: "Must switch all screens",
        difficulty: "advanced",
      },
      {
        name: "Zone Only",
        description: "Defense must play zone",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Simpler constraints",
    makeHarder: "Multiple constraints at once",
    equipmentNeeded: ["Full court", "Ball", "Pinnies"],
    spaceRequired: "large",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "5v5", "constraints", "scrimmage"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Around the World",
    slug: "around-the-world",
    description: "Classic shooting game hitting spots around the court",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 2,
    maxPlayers: 8,
    durationMinutes: 10,
    setupInstructions:
      "5-7 spots around the basket (layup, right block, elbow, etc.)",
    howToPlay:
      "1. Make shot from first spot to advance\n2. Miss - you can take a 'chance' shot\n3. Make the chance - advance; miss - go back to start\n4. Or just stay and try again next turn\n5. First to make all spots wins",
    coachingPoints: [
      "Good form on every shot",
      "Know when to take the chance",
      "Focus on making the shot",
    ],
    questionsToAsk: [
      "When should you take the chance?",
      "What's your toughest spot?",
    ],
    commonMistakes: [
      "Rushing shots",
      "Taking bad chances",
      "Inconsistent form",
    ],
    variations: [
      {
        name: "All 3-pointers",
        description: "All spots are behind the 3-point line",
        difficulty: "advanced",
      },
      {
        name: "No Chances",
        description: "Must make each shot, no risky chances",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Closer spots, more chances",
    makeHarder: "Further spots, no chances allowed",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["game", "shooting", "fun", "competition"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "King of the Court",
    slug: "king-of-the-court-basketball",
    description: "Competitive 1v1 game with continuous challenger format",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 10,
    durationMinutes: 12,
    setupInstructions:
      "Half court. One king starts on offense, challengers wait at half court.",
    howToPlay:
      "1. King starts with ball vs first challenger\n2. Play 1v1 to one basket\n3. If king scores, they stay - next challenger comes in\n4. If challenger stops them, challenger becomes new king\n5. Track consecutive wins",
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
      {
        name: "2v2 Kings",
        description: "Play with partners",
        difficulty: "intermediate",
      },
      {
        name: "Point System",
        description: "Track total points instead",
        difficulty: "beginner",
      },
    ],
    makeEasier: "King gets ball at free throw line",
    makeHarder: "King must start from 3-point line",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "1v1", "competition", "intensity"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Hot Shot Challenge",
    slug: "hot-shot-challenge",
    description: "Timed shooting game from multiple spots",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 2,
    maxPlayers: 16,
    durationMinutes: 10,
    setupInstructions:
      "5 spots around the arc. Balls at each spot. 60 seconds per player.",
    howToPlay:
      "1. Start at spot 1, shoot until you make it\n2. Move to spot 2, repeat\n3. After making at spot 5, return to spot 1\n4. Count total makes in 60 seconds\n5. Compare scores to determine winner",
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
      {
        name: "Layup Start",
        description: "Start with a layup from under basket",
        difficulty: "intermediate",
      },
      {
        name: "Partner Rebound",
        description: "Partner rebounds for faster attempts",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Fewer spots, more time",
    makeHarder: "More spots, less time, further distance",
    equipmentNeeded: ["Baskets", "Multiple balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["game", "shooting", "timed", "competition"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "17s",
    slug: "seventeen-drill",
    description: "Classic conditioning drill - sideline to sideline",
    activityType: "conditioning",
    difficulty: "advanced",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 10,
    setupInstructions: "Players on sideline. Time each rep.",
    howToPlay:
      "1. Sprint sideline to sideline (17 touches in 60 seconds)\n2. Each foot touch on sideline counts as 1\n3. Must complete 17 touches per rep\n4. Rest 90 seconds between reps\n5. Complete 3-5 reps",
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
      {
        name: "14s",
        description: "Easier version - 14 touches in 60 seconds",
        difficulty: "intermediate",
      },
      {
        name: "Team 17s",
        description: "Whole team must finish or repeat",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Fewer touches required, more rest",
    makeHarder: "More touches, less rest, more reps",
    equipmentNeeded: ["Court"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["development"],
    tags: ["conditioning", "sprinting", "endurance", "mental"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Full Court Layups",
    slug: "full-court-layups",
    description: "Continuous layups with full court running",
    activityType: "conditioning",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 8,
    setupInstructions: "Two lines at each basket. One ball per line.",
    howToPlay:
      "1. Player 1 makes layup, sprints to opposite basket\n2. Receives outlet pass from line 2 at half court\n3. Makes layup, joins line\n4. Next player goes when layup is made\n5. Continuous for time",
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
    commonMistakes: [
      "Missed layups",
      "Jogging instead of sprinting",
      "Poor passes",
    ],
    variations: [
      {
        name: "Alternating Hands",
        description: "Must alternate finishing hands",
        difficulty: "intermediate",
      },
      {
        name: "Add Finish",
        description: "Different finish each time (reverse, power)",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Walking pace first, shorter time",
    makeHarder: "Sprint pace, longer time, missed layup = restart count",
    equipmentNeeded: ["Full court", "Balls"],
    spaceRequired: "large",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["conditioning", "layups", "sprinting", "cardio"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Defensive Slides Conditioning",
    slug: "defensive-slides-conditioning",
    description: "Defensive conditioning through continuous slides",
    activityType: "conditioning",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 8,
    setupInstructions: "Players on baseline in defensive stance.",
    howToPlay:
      "1. Slide to free throw line\n2. Drop step, slide to opposite elbow\n3. Drop step, slide to half court\n4. Backpedal to baseline\n5. Repeat 3-5 times with rest between",
    coachingPoints: [
      "Stay low the entire time",
      "Push off back foot",
      "Hands active",
      "Don't cross feet",
    ],
    questionsToAsk: ["How do your legs feel?", "Why is staying low so hard?"],
    commonMistakes: ["Standing up", "Crossing feet", "Slow transitions"],
    variations: [
      {
        name: "Add Closeouts",
        description: "Closeout at each spot before sliding",
        difficulty: "advanced",
      },
      {
        name: "Mirror Partner",
        description: "Partner leads with ball, you mirror",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Fewer reps, more rest",
    makeHarder: "More reps, less rest, add ball to mirror",
    equipmentNeeded: ["Court"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["skill-building", "development"],
    tags: ["conditioning", "defense", "slides", "legs"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "HORSE",
    slug: "horse-game",
    description: "Classic trick shot matching game",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 2,
    maxPlayers: 6,
    durationMinutes: 12,
    setupInstructions: "One basket, one ball per group.",
    howToPlay:
      "1. First player attempts any shot they want\n2. If they make it, others must match the exact shot\n3. If you miss the match shot, you get a letter (H-O-R-S-E)\n4. Spell HORSE and you're out\n5. Last player standing wins",
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
      {
        name: "PIG",
        description: "Shorter version with 3 letters",
        difficulty: "beginner",
      },
      {
        name: "BASKETBALL",
        description: "Longer version for more challenge",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Closer shots, PIG instead",
    makeHarder: "Must be behind 3-point line, creative shots",
    equipmentNeeded: ["Basket", "Ball"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["fun", "shooting", "game", "creativity"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Musical Basketballs",
    slug: "musical-basketballs",
    description: "Basketball version of musical chairs with dribbling",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 8,
    setupInstructions: "One fewer ball than players. Music ready to play.",
    howToPlay:
      "1. Balls scattered around the gym\n2. Players jog/skip while music plays\n3. When music stops, grab a ball and do 5 crossovers\n4. Player without ball is out (or does task and rejoins)\n5. Remove one ball each round",
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
      {
        name: "Skills Challenge",
        description: "Must complete specific skill to stay in",
        difficulty: "intermediate",
      },
      {
        name: "No Elimination",
        description: "Everyone does task, just for fun",
        difficulty: "beginner",
      },
    ],
    makeEasier: "No elimination, everyone does task",
    makeHarder: "More complex skills required",
    equipmentNeeded: ["Balls (one fewer than players)", "Music"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["fun", "game", "dribbling", "warmup"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Bump Out",
    slug: "bump-out",
    description: "Competitive layup game with elimination",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 15,
    durationMinutes: 10,
    setupInstructions: "One line at free throw line. Two balls.",
    howToPlay:
      "1. First two players have balls\n2. First player shoots free throw, then rebounds and shoots layup\n3. Second player shoots immediately after\n4. If second player makes layup before first player, first player is OUT\n5. Pass ball to next in line, go to back of line",
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
      {
        name: "3-Point Bump",
        description: "Start from 3-point line",
        difficulty: "advanced",
      },
      {
        name: "No Layups",
        description: "Any shot counts, no layup required",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Start closer, more attempts before out",
    makeHarder: "Start from 3, must make 2 layups",
    equipmentNeeded: ["Basket", "2 balls"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["fun", "game", "competition", "shooting"],
    featured: true,
  },
  {
    sport: "basketball",
    name: "Dribble Relay Races",
    slug: "dribble-relay-races",
    description: "Team relay races incorporating dribbling skills",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 10,
    setupInstructions: "Two or more teams. Cone course set up.",
    howToPlay:
      "1. First player dribbles through course\n2. Returns and tags next player\n3. First team to finish wins\n4. Variety: crossovers at each cone, weak hand only, etc.",
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
      {
        name: "Backward Dribble",
        description: "Must dribble backward on return",
        difficulty: "intermediate",
      },
      {
        name: "Partner Relay",
        description: "Pass to partner at half, they finish",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Simpler course, no move requirements",
    makeHarder: "Complex course, specific moves required",
    equipmentNeeded: ["Cones", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["fun", "relay", "dribbling", "competition"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Free Throw Shooting Contest",
    slug: "free-throw-contest",
    description: "Cool down with friendly free throw competition",
    activityType: "cooldown",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 24,
    durationMinutes: 8,
    setupInstructions: "Groups at each basket. Track makes per player.",
    howToPlay:
      "1. Each player shoots 10 free throws\n2. Track your makes\n3. Team total determines winner (if teams)\n4. Or individual with most makes wins\n5. Loser does 10 push-ups (optional)",
    coachingPoints: [
      "Establish your routine",
      "Same form every time",
      "Deep breaths between shots",
      "Focus on the back of the rim",
    ],
    questionsToAsk: ["What's your personal best?", "What helps you focus?"],
    commonMistakes: ["Rushing", "Inconsistent routine", "Not focusing"],
    variations: [
      {
        name: "Pressure Free Throws",
        description: "Must make last 2 or run",
        difficulty: "intermediate",
      },
      {
        name: "Team Total",
        description: "Team must hit combined 15/20",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "No pressure, just practice",
    makeHarder: "Pressure shots, consequences for misses",
    equipmentNeeded: ["Baskets", "Balls"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["cooldown", "free throws", "competition", "shooting"],
    featured: false,
  },
  {
    sport: "basketball",
    name: "Team Stretching Circle",
    slug: "team-stretching-circle",
    description: "Team-led stretching to cool down after practice",
    activityType: "cooldown",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 8,
    setupInstructions: "Team forms a circle. Captain leads stretches.",
    howToPlay:
      "Each stretch 20-30 seconds:\n1. Quad stretch (standing, each leg)\n2. Hamstring stretch (seated pike)\n3. Groin stretch (butterfly)\n4. Calf stretch\n5. Shoulder stretches\n6. Hip flexor stretch",
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
    commonMistakes: [
      "Bouncing",
      "Not holding long enough",
      "Skipping stretches",
    ],
    variations: [
      {
        name: "Player Led",
        description: "Different player leads each practice",
        difficulty: "beginner",
      },
      {
        name: "Partner Stretches",
        description: "Help each other stretch",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Shorter holds, fewer stretches",
    makeHarder: "Longer holds, more stretches, add core work",
    equipmentNeeded: ["None"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building", "development"],
    tags: ["cooldown", "stretching", "recovery", "team"],
    featured: false,
  },
];

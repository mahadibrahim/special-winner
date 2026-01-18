/**
 * Comprehensive Basketball Activities - Fundamentals Stage (Ages 6-8)
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

export async function seedBasketballFundamentalsActivities() {
  console.log("Seeding comprehensive basketball activities (Fundamentals)...");

  const [basketball] = await db.select().from(sports).where(eq(sports.slug, "basketball"));
  if (!basketball) throw new Error("Basketball sport must be seeded first");

  const stages = await db.select().from(developmentStages);
  const fundamentals = stages.find((s) => s.slug === "fundamentals");
  const skillBuilding = stages.find((s) => s.slug === "skill-building");

  if (!fundamentals) throw new Error("Development stages must be seeded first");

  const comprehensiveActivities: NewActivity[] = [
    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 1: DRIBBLE TAG
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: basketball.id,
      name: "Dribble Tag",
      slug: "dribble-tag-v2",
      description: "High-energy tag game where ALL players must dribble a basketball while playing tag. Taggers and runners both dribble, developing ball handling under pressure, court awareness, and cardiovascular fitness in a fun, game-like environment.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 20,
      durationMinutes: 8,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 basketball per player
□ 4 cones for corners (bright colors)
□ 2-3 pinnies for taggers

SPACE: Half court or 25x25 paces (adjust based on numbers)

SETUP STEPS
1. Place 4 cones in a square to define playing area
2. Give every player a basketball
3. Select 2-3 taggers (1 tagger per 5-6 players)
4. Taggers wear pinnies to be easily identified
5. All players start spread out inside the grid

DIAGRAM
┌────────────────────────────────┐
│  ▲                         ▲   │
│     ○   ○                      │
│         ●(tagger)    ○         │  25 paces
│     ○        ○       ○         │
│  ▲                         ▲   │
└────────────────────────────────┘
       25 paces
▲=cone  ○=dribbler with ball  ●=tagger (pinnie, also dribbling)`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (60 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of playing area

SAY: "Everyone grab a ball and come into the square! Spread out and start dribbling - keep that ball bouncing!"

Pick taggers: "Jordan and Maya, can you come help me? You're going to be our taggers!"
Give taggers pinnies.

SAY: "This is DRIBBLE TAG! Here's the twist - EVERYONE must dribble the whole time, including taggers! If you stop dribbling or lose your ball, you're frozen until someone high-fives you back in."

SAY: "Taggers - try to tag other players while dribbling. If you get tagged, freeze with your ball and wait for a high-five. Questions? Let's GO!"


PHASE 2: ROUND 1 (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Outside grid, moving around perimeter

SAY: "Taggers, start counting your tags! Everyone else, protect yourself! Ready... GO!"

DURING PLAY - What to Watch For:
□ Are players keeping their dribble alive?
□ Are they looking up to see taggers?
□ Are they using their body to shield while dribbling?

PHRASES TO USE:
• "Eyes up while you dribble!"
• "Change directions to escape!"
• "Low and quick dribble!"
• "Great escape!"

When tagged: "Freeze right there! Wait for that high-five!"

COUNTDOWN: "One minute left!... 10 seconds!... FREEZE EVERYONE!"


PHASE 3: TEACHING MOMENT (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of grid, all players frozen

SAY: "Everyone freeze! Taggers, how many did you get? Nice work!"

ASK: "What helped you get away from taggers?"
Listen for: "Changing direction," "Going faster," "Looking up"

TEACH ONE THING:
SAY: "I noticed some of you changing hands when you changed direction - like THIS."
Demo: Quick crossover or hand switch
SAY: "That's how you protect the ball while escaping. Try it this round. GO!"


PHASE 4: ROUND 2 (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "New challenge - when you change direction, try to switch your dribbling hand!"

Reinforce teaching point:
• When you see hand switches: "YES! Protect that ball with your body!"
• When you see head down: "Peek up! Where are the taggers?"

END: "FREEZE! Taggers, new count? Great energy!"


PHASE 5: ROUND 3 + WRAP UP (2.5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SWITCH TAGGERS: "New taggers! Who hasn't been a tagger yet?"
Trade pinnies, run 90-second round.

WRAP UP (30 seconds):
SAY: "Awesome work! I saw great dribbling and heads-up play. Remember - in a real game, you have to dribble AND watch for defenders just like this! Water break, then we're moving to [next activity]."`,

      diagram: `┌────────────────────────────────┐
│  ▲                         ▲   │
│     ○   ○                      │
│         ●(tagger)    ○         │  Half court
│     ○        ○       ○         │
│  ▲                         ▲   │
└────────────────────────────────┘`,

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
        { name: "Weak Hand Only", description: "Everyone must dribble with their non-dominant hand only.", difficulty: "intermediate" },
        { name: "Speed Dribble", description: "Players must stay in constant motion - no standing allowed.", difficulty: "beginner" },
        { name: "Freeze Tag", description: "Tagged players freeze until someone dribbles around them in a circle.", difficulty: "beginner" },
        { name: "Chain Tag", description: "Tagged players become taggers too. Last dribbler wins!", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Players constantly losing their dribble
• Taggers catching everyone in 30 seconds
• Players looking frustrated, not smiling

SOLUTIONS:
• Make grid bigger (30x30 paces)
• Fewer taggers (1 tagger per 7-8 dribblers)
• Allow stationary dribbling when tagged (instead of freeze)
• Taggers must skip instead of run
• "Safe zones" in corners (can't be tagged for 5 seconds)`,

      makeHarder: `SIGNS THEY'RE READY:
• Dribblers easily escaping taggers
• Players looking bored or asking "what's next?"
• Taggers can't catch anyone

SOLUTIONS:
• Make grid smaller (20x20 paces)
• More taggers (1 tagger per 4 dribblers)
• Weak hand only for everyone
• Must complete a crossover before changing direction
• Add second ball - both hands dribbling`,

      equipmentNeeded: ["1 basketball per player", "4 cones", "2-3 pinnies"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id, skillBuilding?.id].filter(Boolean) as string[],
      tags: ["warmup", "dribbling", "ball-handling", "awareness", "high-energy", "fun", "no-lines"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Tag game where everyone dribbles; develops ball handling under pressure and court awareness.",
          keyPhrases: [
            "Eyes up while you dribble!",
            "Change hands to protect!",
            "Low and quick dribble!",
          ],
          setupDiagram: "25x25 pace grid, 4 corner cones, 1 ball per player, 1 tagger per 5-6 players with pinnies",
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
            mindset: "This is a HIGH ENERGY warmup. Your enthusiasm sets the tone. Be loud, move around, celebrate effort and ball handling. Goal: players dribbling, moving, and smiling.",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "60 seconds",
              coachPosition: "Center of grid",
              script: "SAY: 'Everyone grab a ball and come into the square!' Pick taggers, give pinnies, explain rules: everyone dribbles, tagged = freeze until high-fived.",
              anticipatedResponses: {
                "Kids arguing about who's tagger": "Everyone will get a turn! Let's start with volunteers.",
                "Not enough balls": "Partner up - take turns being the dribbler.",
                "Kids already bouncing wildly": "Freeze! Balls in hands, eyes on me.",
              },
            },
            {
              phase: "Round 1",
              duration: "2 minutes",
              coachPosition: "Outside grid, moving around",
              script: "SAY: 'Taggers, start counting! Everyone else, protect yourself! GO!' Watch for: dribble control, heads up, movement patterns. Encourage constantly.",
              troubleshooting: {
                "Taggers can't catch anyone": ["Add tagger", "Make grid smaller", "No standing still for dribblers"],
                "Everyone getting tagged instantly": ["Remove tagger", "Make grid bigger", "Taggers must skip"],
              },
            },
            {
              phase: "Teaching Moment",
              duration: "30 seconds",
              coachPosition: "Center, everyone frozen",
              script: "SAY: 'Freeze! Taggers, how many?' ASK: 'What helped you escape?' TEACH: Demo hand switch/crossover when changing direction.",
            },
            {
              phase: "Round 2",
              duration: "2 minutes",
              coachPosition: "Outside grid",
              script: "SAY: 'Try switching hands when you change direction!' Reinforce teaching. End with freeze and count.",
            },
            {
              phase: "Round 3 & Wrap",
              duration: "2.5 minutes",
              coachPosition: "Outside grid",
              script: "Switch taggers. Run 90-second round. WRAP: 'Great dribbling and awareness! In real games, you dribble AND watch defenders just like this. Water break!'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            taggersTooStrong: {
              symptoms: ["Most players frozen in 30 seconds", "Frustrated dribblers", "No one escapes"],
              solutions: ["Remove a tagger", "Bigger grid (30x30)", "Taggers skip", "Add safe zone corners"],
            },
            taggersTooWeak: {
              symptoms: ["No one getting tagged", "Frustrated taggers", "Dribblers standing around"],
              solutions: ["Add a tagger", "Smaller grid (20x20)", "No standing still", "Weak hand only"],
            },
          },
          playerBehavior: {
            notParticipating: {
              symptoms: ["Standing at edge", "Not dribbling", "Disengaged"],
              approach: "Privately ask: 'Everything okay?' Offer alternative role: 'Help me count tags?' Wait it out - often join after watching.",
            },
            overlyAggressive: {
              symptoms: ["Pushing players", "Slapping at balls", "Going for player not tag"],
              approach: "IMMEDIATE pause if dangerous. SAY: 'We tag shoulders gently!' If continues: 'Take 1-minute break.'",
            },
            frustrated: {
              symptoms: ["Slamming ball", "Saying 'I can't dribble'", "Giving up"],
              approach: "Quick private word. Offer to be helper. Normalize: 'Dribbling while moving is hard! You're getting better.'",
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
              solutions: ["Odd player counts tags", "Permanent tagger", "Uneven groups (5v1 and 6v1)"],
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Dribbling Under Pressure",
              domain: "Technical",
              howItDevelops: "Players must maintain dribble while evading active taggers, replicating game pressure when defenders approach.",
              levelIndicators: {
                1: "Loses dribble frequently; can't move and dribble",
                2: "Sometimes maintains dribble but has to stop to control",
                3: "Keeps dribble alive while moving; occasional losses when pressured",
                4: "Confident dribble while moving; uses direction changes effectively",
                5: "Beats taggers easily with moves; could demonstrate for others",
              },
              assessmentNotes: "Watch across multiple rounds. Early performance may not reflect true ability as they learn the game.",
            },
            {
              skill: "Court Awareness / Vision",
              domain: "Tactical",
              howItDevelops: "Must know where taggers are to avoid them. Builds habit of keeping head up while dribbling.",
              levelIndicators: {
                1: "Only looks at ball; surprised when tagged",
                2: "Occasional glances up; reactive to taggers",
                3: "Regularly looks up; knows where 1 tagger is",
                4: "Scans continuously; knows where multiple taggers are",
                5: "Always aware; makes decisions before tagger arrives",
              },
              assessmentNotes: "Ask 'point to taggers' while frozen. Their accuracy reveals awareness level.",
            },
          ],
          secondarySkills: [
            {
              skill: "Ball Control",
              domain: "Technical",
              howItDevelops: "Must keep dribble low and controlled while moving at speed.",
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
              howItDevelops: "Evading taggers requires quick cuts and direction changes while maintaining dribble.",
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
          whyThisActivity: "Dribble Tag develops ball handling under pressure in a game-like context WITHOUT offensive/defensive complexity. Players focus on: maintaining dribble, avoiding pressure, moving with the ball. This mirrors bringing the ball up court when defenders pressure.",
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
              { activity: "Stationary Ball Handling", reason: "Ball control without movement" },
              { activity: "Traffic Lights (Basketball)", reason: "Dribbling at different speeds without defenders" },
            ],
            after: [
              { activity: "1v1 Dribbling", reason: "Dribbling against specific defender" },
              { activity: "3v3 Half Court", reason: "Applies skills in team context" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Maximum fun, minimum correction",
              keyPhrases: ["Keep that ball bouncing!", "Be sneaky!", "Escape the taggers!"],
              avoidSaying: ["You need to crossover (too advanced)", "Scan the court"],
              duration: "6 minutes max",
              simplifications: ["Bigger grid", "Fewer taggers", "No hand switch requirement"],
            },
            "ages9to11": {
              approach: "Introduce technique, maintain fun",
              keyPhrases: ["Protect with your body!", "Low dribble!", "Switch hands!"],
              challenges: ["Weak hand rounds", "Must crossover to escape"],
              duration: "8 minutes with teaching",
            },
            "ages12to14": {
              approach: "Game realism, player-led",
              keyPhrases: ["When do you see this in games?", "What move would help here?"],
              challenges: ["Smaller grid", "Two-ball dribbling", "Specific moves required to escape"],
              coachRole: "Facilitate discussion about game application",
            },
          },
          commonMisconceptions: {
            "Just a game, not real training": "This IS training - dribbling under pressure transfers to games better than stationary drills.",
            "Weaker dribblers always get tagged": "Design so everyone succeeds: enough taggers that weak aren't singled out.",
            "Not learning technique": "Learning to APPLY technique under pressure is harder than isolated technique.",
          },
        },

        parentCommunication: {
          ifAsked: "We play Dribble Tag because it develops ball handling under pressure in a fun, game-like context. Your child learns to dribble while someone tries to catch them - exactly what happens in games when defenders pressure.",
          newsletter: "This week: Dribble Tag! This game teaches ball handling under pressure. Watch for your child keeping their head up while dribbling at home!",
          whatToWatchFor: [
            "Does your child look up while dribbling? (court awareness)",
            "Can they change direction without losing the ball? (control)",
            "Do they switch hands to protect the ball? (ball protection)",
            "Do they keep the dribble low when pressured? (technique)",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Player collisions", prevention: "Emphasize 'heads up', adequate space", response: "Check both players, pause to reinforce awareness" },
            { risk: "Aggressive tagging", prevention: "State 'gentle shoulder tags only' before game", response: "Immediate stop, reminder, repeat = sit out" },
            { risk: "Tripping over balls", prevention: "If dribble is lost, pick up ball quickly", response: "Check player, remind about ball control" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Pair faster dribblers with each other, give slower dribblers head start",
            newPlayers: "Partner with experienced player first round, or start as tagger (easier)",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 2: TRAFFIC LIGHTS (BASKETBALL)
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: basketball.id,
      name: "Traffic Lights (Basketball)",
      slug: "traffic-lights-basketball-v2",
      description: "Dribbling game where players respond to color commands while dribbling. Red=stop (but keep dribbling in place), Yellow=slow dribble, Green=speed dribble. Develops listening skills, dribble control at different speeds, and the fundamental ability to change pace with the ball.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 30,
      durationMinutes: 6,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 basketball per player
□ 4 cones for corners (optional but helpful)
□ Optional: colored cones/cards (red, yellow, green) as visual aids

SPACE: As large as available (minimum half court or 25x30 paces)

SETUP STEPS
1. Players spread out in large area
2. Every player has ball and is dribbling
3. Coach stands where everyone can see/hear

DIAGRAM
┌─────────────────────────────────┐
│                                 │
│    ○    ○    ○    ○    ○       │
│                                 │  25+ paces
│    ○    ○   COACH  ○    ○      │
│                                 │
│    ○    ○    ○    ○    ○       │
└─────────────────────────────────┘
       30+ paces`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (45 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Everyone grab a ball and find your own space - spread out so you can't touch anyone! Start dribbling!"

SAY: "We're playing Traffic Lights! When I say GREEN, dribble as fast as you can control - speed dribble! When I say YELLOW, super slow dribble, like you're sneaking! When I say RED, stop your feet BUT keep dribbling in place!"

DEMO: "Watch me - GREEN (fast dribble across space)... YELLOW (slow dribble)... RED (stop feet, dribble in place). Your turn!"


PHASE 2: ROUND 1 - BASIC (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Find a space, start dribbling... GREEN!"

Call colors randomly:
• GREEN: Hold 5-8 seconds
• YELLOW: Hold 3-5 seconds
• RED: Hold 3-4 seconds (check they keep dribbling!)

WATCH FOR:
□ Quick response to commands?
□ Dribble continuing on RED?
□ Different speeds for green vs yellow?

PRAISE: "Great control!" "Love that speed!" "Nice stationary dribble on red!"


PHASE 3: COACHING MOMENT (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Red! Freeze your feet! Keep that dribble going!"

SAY: "Look at your dribble - is it at your waist or lower? In basketball, we want the ball below our waist so defenders can't steal it."

DEMO: Quick high dribble vs low dribble comparison.

SAY: "Let's go - keep it LOW! GREEN!"


PHASE 4: ROUND 2 - ADD CHALLENGE (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Same game, but now on RED, switch hands every 3 bounces! Ready... GREEN!"

Call colors. On RED, count out loud: "1, 2, 3, switch! 1, 2, 3, switch!"


PHASE 5: ROUND 3 - MIX IT UP (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Options:
• "REVERSE!" - Green means stop, Red means go fast
• "Red light... Red light... RED LIGHT!" (trick them)
• Whisper colors so they must really listen
• Add "BLUE!" = crossover (switch hands while moving)

WRAP UP: "Great dribbling! Who can show me a low, controlled dribble? Water break!"`,

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
        { name: "Add Blue", description: "BLUE = crossover to opposite hand while moving.", difficulty: "intermediate" },
        { name: "Traffic Cop", description: "Player becomes traffic cop, calls colors. Rotate every 30 seconds.", difficulty: "beginner" },
        { name: "Body Part Red", description: "On RED, call body part (left hand, right hand, between legs) for how to dribble.", difficulty: "intermediate" },
        { name: "Direction Colors", description: "PURPLE = move backward while dribbling, ORANGE = shuffle sideways.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Losing dribble on color changes
• Confusion about colors
• Can't dribble and listen

SOLUTIONS:
• Slow down color calls
• Only green and red first (add yellow later)
• Allow catch and restart on RED
• More time between calls`,

      makeHarder: `SIGNS THEY'RE READY:
• Instant responses
• Perfect dribble control
• Asking "what else?"

SOLUTIONS:
• Call colors faster
• Whisper colors
• Add reverse mode
• Weak hand only on yellow
• Add movements (jumping jacks while dribbling on red)`,

      equipmentNeeded: ["1 basketball per player", "4 cones (optional)"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id],
      tags: ["warmup", "dribbling", "ball-handling", "listening", "beginner-friendly", "no-lines"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Color commands control dribbling speed - RED=stop feet but keep dribbling, YELLOW=slow, GREEN=fast - develops listening and ball control.",
          keyPhrases: [
            "Feet stop, hands don't!",
            "Green is race car, Yellow is turtle!",
            "Low dribble - waist or below!",
          ],
          setupDiagram: "Large open space, 1 ball per player, everyone spread out dribbling",
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
            mindset: "This is about LISTENING and BALL CONTROL. Your voice is the main tool - vary volume, speed, and add playfulness (whispers, tricks). Celebrate the smooth transitions!",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "45 seconds",
              coachPosition: "Center where all can see",
              script: "SAY: 'Find your own space and start dribbling!' Explain: GREEN=fast, YELLOW=slow, RED=stop feet but keep dribbling. Demo each briefly.",
              anticipatedResponses: {
                "What if I lose my dribble?": "Pick it up and keep going! Everyone loses it sometimes.",
                "Can I go really really fast?": "As fast as you can CONTROL the ball!",
              },
            },
            {
              phase: "Round 1 - Basic",
              duration: "90 seconds",
              coachPosition: "Center, visible to all",
              script: "Call colors randomly. GREEN 5-8 sec, YELLOW 3-5 sec, RED 3-4 sec. Praise good control and speed changes.",
              troubleshooting: {
                "Stopping dribble on RED": ["Remind: feet stop, hands don't!", "Demo stationary dribble", "Count bounces out loud"],
                "Same speed all colors": ["Exaggerate demos", "Use animal comparisons", "Race car vs turtle"],
              },
            },
            {
              phase: "Teaching Moment",
              duration: "30 seconds",
              coachPosition: "Center",
              script: "Call RED. 'Look at your dribble - waist height or lower?' Teach low dribble for protection.",
            },
            {
              phase: "Round 2 - Challenge",
              duration: "90 seconds",
              coachPosition: "Center",
              script: "Add hand-switch challenge on RED: 'Switch hands every 3 bounces!' Count out loud with them.",
            },
            {
              phase: "Round 3 - Fun",
              duration: "90 seconds",
              coachPosition: "Center",
              script: "Mix it up: Reverse mode, trick calls, whisper colors, add BLUE for crossover. End with celebration.",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            tooEasy: {
              symptoms: ["Perfect responses instantly", "Players bored", "Asking for more"],
              solutions: ["Faster calls", "Add reverse", "Whisper commands", "Weak hand requirement", "Add crossover"],
            },
            tooHard: {
              symptoms: ["Constantly losing dribble", "Confusion", "Frustration"],
              solutions: ["Slower calls", "Only 2 colors", "Allow catch and restart on RED"],
            },
          },
          playerBehavior: {
            notListening: {
              symptoms: ["Missing color calls", "Delayed responses", "Doing own thing"],
              approach: "Move closer to them. Use their name before color: 'Marcus, ready? GREEN!' Praise when they respond.",
            },
            showingOff: {
              symptoms: ["Excessive speed", "Fancy moves instead of colors", "Ignoring commands"],
              approach: "Challenge: 'Can you go fast AND change perfectly on command?' Channel energy into precision.",
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Dribble Speed Control",
              domain: "Technical",
              howItDevelops: "Players learn to modulate dribble force and frequency based on desired speed - foundation for game situations.",
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
              howItDevelops: "On RED, players practice keeping dribble alive without moving - used when protecting ball or waiting for play to develop.",
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
              howItDevelops: "Must maintain focus to hear and respond to commands while dribbling - builds concentration.",
            },
          ],
          physicalDevelopment: {
            handEyeCoordination: "Maintaining dribble while processing verbal commands",
            speedControl: "Varying movement speeds while dribbling",
          },
          psychologicalDevelopment: {
            focus: "Sustained attention to hear commands",
            selfRegulation: "Controlling impulse to always go fast",
          },
        },

        developmentalContext: {
          whyThisActivity: "Traffic Lights teaches speed control while dribbling - essential for basketball. Players learn when to push the ball and attack (green), when to slow down and read the defense (yellow), and when to protect the ball in place (red). The game format makes repetitive practice fun.",
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
              { activity: "Stationary Ball Handling", reason: "Ball control without movement" },
            ],
            after: [
              { activity: "Dribble Tag", reason: "Adds defensive pressure" },
              { activity: "Cone Dribbling", reason: "Adds obstacles and direction" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Pure fun, celebrate every attempt",
              keyPhrases: ["Race car! Turtle!", "Feet freeze, hands bounce!", "Keep it bouncing!"],
              duration: "5 minutes max",
              simplifications: ["Only 2 colors", "Allow catch on RED", "Slow pace"],
            },
            "ages9to11": {
              approach: "Add complexity and hand switching",
              keyPhrases: ["Control the speed, control the game", "Quick hands, soft touch"],
              challenges: ["All 3 colors + reverse", "Hand switch on RED", "Weak hand rounds"],
            },
            "ages12to14": {
              approach: "Game application focus",
              keyPhrases: ["When do you use each speed in games?", "Attack speed vs protect speed"],
              challenges: ["Add specific moves on colors", "Blindfold stationary dribble", "Two balls"],
            },
          },
        },

        parentCommunication: {
          ifAsked: "Traffic Lights teaches your child to control dribbling speed - pushing fast to attack, slowing to read the game, and protecting the ball in place. These are the foundational dribbling skills.",
          newsletter: "This week: Traffic Lights (Basketball)! We practiced dribbling at different speeds and keeping the dribble alive while stopped. At home, play together - call out colors while they dribble!",
          whatToWatchFor: [
            "Can they change dribbling speed on command?",
            "Do they keep dribbling even when stopped?",
            "Is the dribble low (waist height or below)?",
            "Are they listening and responding quickly?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions during GREEN", prevention: "Emphasize 'explore the space' not 'race each other'", response: "Check players, remind about heads up and spacing" },
            { risk: "Ball hitting others", prevention: "Maintain spacing, low dribble", response: "Check affected player, remind about control" },
          ],
          inclusionConsiderations: {
            hearingDifficulties: "Use visual aids (colored cones/cards) in addition to verbal commands",
            motorDelays: "Allow more time to respond, celebrate any attempt to change speed, allow two-hand dribble",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 3: SHARK ATTACK (BASKETBALL)
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: basketball.id,
      name: "Shark Attack (Basketball)",
      slug: "shark-attack-basketball-v2",
      description: "High-energy dribbling game where players protect their basketballs from 'sharks' who try to knock them away. Develops dribbling under pressure, ball protection, court awareness, and shielding in a fun, game-like environment.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 24,
      durationMinutes: 8,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 basketball per player (except sharks)
□ 4 cones for corners (bright colors)
□ 2-3 pinnies for sharks
□ Extra balls on sideline for quick restarts

SPACE: Half court or 25x25 paces (adjust based on numbers)

SETUP STEPS
1. Place 4 cones in a square, 25 paces apart
2. Give every player a ball EXCEPT 1-2 sharks
3. Sharks wear pinnies (1 shark per 5-6 dribblers)
4. All dribblers start inside the grid dribbling

DIAGRAM
┌────────────────────────────────┐
│  ▲                         ▲   │
│     ○   ○                      │
│         ●(shark)    ○          │  25 paces
│     ○        ○       ○         │
│  ▲                         ▲   │
└────────────────────────────────┘
       25 paces
▲=cone  ○=dribbler with ball  ●=shark (pinnie, no ball)`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (60 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of grid

SAY: "Everyone grab a ball and come into the square! Spread out and start dribbling!"

Pick sharks: "Jaylen and Sophia, can you come help me? You're going to be our hungry sharks!"
Give sharks pinnies, take their balls.

SAY: "This is SHARK ATTACK! Dribblers - your job is to dribble around and PROTECT your ball from the sharks. Sharks - your job is to knock balls away - make them lose their dribble!"

SAY: "Dribblers - if your ball gets knocked away, do 5 ball slaps outside the square, then come right back in. Questions? Let's GO!"


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
• "Body between shark and ball!"

When ball is knocked away: Point to sideline, "5 ball slaps, back in!"

COUNTDOWN: "One minute left!... 10 seconds!... FREEZE!"


PHASE 3: TEACHING MOMENT (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of grid, all players frozen

SAY: "Everyone freeze! Dribblers - point to where the sharks are RIGHT NOW."
Watch: Can they find them without searching?

ASK: "What helped you keep your ball safe?"
Listen for: "Moving away," "Using my body," "Looking up"

TEACH ONE THING:
SAY: "I noticed some of you putting your body between the shark and the ball - like THIS."
Demo: Low dribble, arm bar out, body sideways between defender and ball
SAY: "That's called SHIELDING. Try that this round. GO!"


PHASE 4: ROUND 2 (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Sharks - how many balls can you knock away? Let's count!"

Reinforce teaching point:
• When you see shielding: "YES! Body between shark and ball!"
• When you see no shielding: "Turn sideways - protect it!"

END: "FREEZE! Sharks, how many? Nice work!"


PHASE 5: ROUND 3 + WRAP UP (2.5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SWITCH SHARKS: "New sharks! Who hasn't been a shark yet?"
Trade pinnies, run 90-second round.

WRAP UP (30 seconds):
SAY: "Great work! I saw awesome shielding and heads-up dribbling. In a real game, defenders try to steal just like our sharks - now you know how to protect! Water break, then we're moving to [next activity]."`,

      diagram: `┌────────────────────────────────┐
│  ▲                         ▲   │
│     ○   ○                      │
│         ●(shark)    ○          │  25x25 paces
│     ○        ○       ○         │
│  ▲                         ▲   │
└────────────────────────────────┘`,

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
        { name: "Freeze Sharks", description: "When coach yells 'FREEZE!' everyone stops. Last one moving becomes shark.", difficulty: "beginner" },
        { name: "Ball Stealer", description: "Sharks try to steal and dribble the ball instead of just knocking it away.", difficulty: "intermediate" },
        { name: "Shark Jail", description: "If caught, you become a shark too. Last dribbler wins!", difficulty: "intermediate" },
        { name: "Partner Sharks", description: "Sharks work in pairs holding hands - must coordinate to trap dribblers.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Most balls knocked away within 30 seconds
• Players looking frustrated, not smiling
• No one can escape sharks

SOLUTIONS:
• Make grid bigger (30x30 paces)
• Fewer sharks (1 shark per 7-8 dribblers)
• Sharks must crab walk instead of run
• Allow 3 ball slaps instead of 5
• "Safe zones" in corners (can't be attacked for 5 seconds)`,

      makeHarder: `SIGNS THEY'RE READY:
• Dribblers easily escaping sharks
• Players looking bored or asking "what's next?"
• Sharks can't knock anyone's ball away

SOLUTIONS:
• Make grid smaller (20x20 paces)
• More sharks (1 shark per 4 dribblers)
• Dribblers must stay moving (no standing)
• Weak hand only for dribbling
• Add "super shark" who can use both hands`,

      equipmentNeeded: ["1 basketball per player", "4 cones", "2-3 pinnies"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id, skillBuilding?.id].filter(Boolean) as string[],
      tags: ["warmup", "dribbling", "ball-protection", "awareness", "high-energy", "fun", "no-lines"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Dribblers protect balls from sharks who try to knock them away; develops dribbling under pressure and ball protection.",
          keyPhrases: [
            "Can you dribble AND see the shark?",
            "Body between shark and ball!",
            "Low dribble - protect it!",
          ],
          setupDiagram: "25x25 pace grid, 4 corner cones, 1 shark per 5-6 dribblers with pinnies",
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
            mindset: "This is a HIGH ENERGY warmup. Your enthusiasm sets the tone. Be loud, move around, celebrate effort. Goal: players protecting their dribble and smiling.",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "60 seconds",
              coachPosition: "Center of grid",
              script: "SAY: 'Everyone grab a ball and come into the square!' Pick sharks, give pinnies, explain rules: sharks knock balls away, dribblers protect and do 5 ball slaps if caught.",
              anticipatedResponses: {
                "Kids arguing about who's shark": "Everyone will get a turn! Let's start with volunteers.",
                "Not enough balls": "Share with a partner - you'll both dribble soon.",
                "Kids already bouncing wildly": "Freeze! Balls in hands, eyes on me.",
              },
            },
            {
              phase: "Round 1",
              duration: "2 minutes",
              coachPosition: "Outside grid, moving around",
              script: "SAY: 'Sharks, mean faces! Dribblers, protect! SHARKS ARE HUNGRY!' Watch for: heads up, shielding, shark activity. Encourage constantly.",
              troubleshooting: {
                "Sharks can't catch anyone": ["Add shark", "Make grid smaller", "No standing still for dribblers"],
                "Balls knocked away instantly": ["Remove shark", "Make grid bigger", "Sharks must crab walk"],
              },
            },
            {
              phase: "Teaching Moment",
              duration: "30 seconds",
              coachPosition: "Center, everyone frozen",
              script: "SAY: 'Freeze! Point to sharks.' ASK: 'What helped keep your ball safe?' TEACH: Demo shielding - body between shark and ball, low dribble.",
            },
            {
              phase: "Round 2",
              duration: "2 minutes",
              coachPosition: "Outside grid",
              script: "SAY: 'Sharks, how many can you get? Let's count!' Reinforce shielding. End with freeze and count.",
            },
            {
              phase: "Round 3 & Wrap",
              duration: "2.5 minutes",
              coachPosition: "Outside grid",
              script: "Switch sharks. Run 90-second round. WRAP: 'Great shielding and awareness! In games, defenders try to steal - now you know how to protect! Water break!'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            sharksTooStrong: {
              symptoms: ["Most balls knocked away in 30 seconds", "Frustrated dribblers", "No one escapes"],
              solutions: ["Remove a shark", "Bigger grid (30x30)", "Sharks crab walk", "Add safe zone corners"],
            },
            sharksTooWeak: {
              symptoms: ["No balls knocked away", "Frustrated sharks", "Dribblers cruising"],
              solutions: ["Add a shark", "Smaller grid (20x20)", "No standing still", "Weak hand only"],
            },
          },
          playerBehavior: {
            notParticipating: {
              symptoms: ["Standing at edge", "Not dribbling", "Disengaged"],
              approach: "Privately ask: 'Everything okay?' Offer alternative role: 'Help me count catches?' Wait it out - often join after watching.",
            },
            overlyAggressive: {
              symptoms: ["Pushing players", "Going for body not ball", "Dangerous reaches"],
              approach: "IMMEDIATE pause if dangerous. SAY: 'We go for BALL, not person.' If continues: 'Take 1-minute break.'",
            },
            frustrated: {
              symptoms: ["Slamming ball", "Saying 'I can't'", "Tears"],
              approach: "Quick private word. Offer easier role. Normalize: 'Everyone finds this hard at first.'",
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
                1: "Ball frequently knocked away; can't escape sharks",
                2: "Sometimes escapes but no shielding; reactive not proactive",
                3: "Uses body to shield; looks up occasionally; survives most rounds",
                4: "Proactively avoids sharks; uses direction changes; rarely caught",
                5: "Beats sharks easily; helps teammates; could coach others",
              },
              assessmentNotes: "Watch across multiple rounds. Early performance may not reflect true ability as they learn the game.",
            },
            {
              skill: "Court Awareness / Scanning",
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
              skill: "Ball Protection/Shielding",
              domain: "Technical",
              howItDevelops: "Using body position and arm bar to protect the dribble from defenders.",
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
              howItDevelops: "Evading sharks requires quick turns and direction changes while maintaining dribble.",
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
          whyThisActivity: "Shark Attack develops dribbling under pressure in game-like context WITHOUT team tactical complexity. Players focus on: controlling ball, avoiding pressure, recovering from failure. This mirrors having the ball in games when defenders close down.",
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
              { activity: "Traffic Lights (Basketball)", reason: "Ball control at speeds without defenders" },
              { activity: "Cone Dribbling", reason: "Dribbling through spaces without pressure" },
            ],
            after: [
              { activity: "1v1 to Basket", reason: "Dribbling under pressure with scoring" },
              { activity: "3v3 Half Court", reason: "Applies skills in team context" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Maximum fun, minimum correction",
              keyPhrases: ["Be a sneaky fish!", "Hide your ball!", "Sharks are coming!"],
              avoidSaying: ["You need to shield better (too abstract)", "Scan the court"],
              duration: "6 minutes max",
              simplifications: ["Bigger grid", "Fewer sharks", "No weak hand"],
            },
            "ages9to11": {
              approach: "Introduce technique, maintain fun",
              keyPhrases: ["Body position!", "Low dribble!", "Eyes up!"],
              challenges: ["Weak hand rounds", "Must use a spin move to escape"],
              duration: "8 minutes with teaching",
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
            "Weaker players always lose": "Design so everyone succeeds: enough sharks that weak aren't targeted.",
            "Not learning technique": "Learning to APPLY technique under pressure is harder than isolated technique.",
          },
        },

        parentCommunication: {
          ifAsked: "We play Shark Attack because it develops dribbling under pressure in a fun, game-like context. Your child learns to protect the ball while someone tries to take it - exactly what happens in games.",
          newsletter: "This week: Shark Attack! This game teaches ball protection under pressure. Watch for your child using their body to 'shield' the ball at home or in games!",
          whatToWatchFor: [
            "Does your child protect ball with their body? (shielding)",
            "Do they look up while dribbling? (awareness)",
            "Can they change direction quickly? (agility)",
            "Do they keep the dribble low? (technique)",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Player collisions", prevention: "Emphasize 'heads up', adequate space", response: "Check both players, pause to reinforce awareness" },
            { risk: "Reaching for body", prevention: "State 'go for ball only' before game", response: "Immediate stop, reminder, repeat = sit out" },
            { risk: "Falling while protecting", prevention: "Emphasize control over speed", response: "Check player, remind about balance" },
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 4: KNOCKOUT
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: basketball.id,
      name: "Knockout",
      slug: "knockout-v2",
      description: "Classic basketball shooting game where players race to make a shot before the person behind them. Develops shooting under pressure, rebounding, and quick shot execution in a competitive, high-energy format loved by players of all ages.",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 15,
      durationMinutes: 10,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 2 basketballs
□ 1 basketball hoop
□ Floor tape or cone to mark free throw line (optional)

SPACE: One basket with space for a line behind free throw line

SETUP STEPS
1. All players line up behind the free throw line (or closer for younger players)
2. First two players in line each have a ball
3. Everyone else waits in line without a ball
4. Mark shooting spot if needed (closer for ages 6-8)

DIAGRAM
                    [BASKET]
                       │
                       │
    ─────────────────────────────  Free throw line
                       │
                       │
           ○ ○ ○ ○ ○ ○ ○ ○ ○      (Line of players)
           ▲ ▲
       Ball Ball                  First 2 have balls`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (60 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: At the free throw line

SAY: "Everyone line up behind this line! First two players, grab a ball!"

SAY: "This is KNOCKOUT! Here's how it works: First player shoots. If you make it, pass the ball to the next person without a ball and go to the back of the line. If you miss, you have to rebound and make a shot before the person behind you does!"

SAY: "Here's the twist - if the person behind you makes their shot before you make yours, you're KNOCKED OUT and sit down to cheer. Last person standing wins!"

DEMO: Walk through with first two players showing what happens on a make and a miss.


PHASE 2: FIRST GAME (4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "First shooter, ready? GO!"

DURING PLAY - What to Watch For:
□ Are players rebounding their own misses?
□ Are they shooting quickly or hesitating?
□ Are knocked out players staying engaged?

PHRASES TO USE:
• "Rebound! Get that ball!"
• "Quick shot! Don't wait!"
• "Nice make! Pass it back!"
• "Great hustle!"

WHEN SOMEONE IS KNOCKED OUT:
SAY: "Great effort! Have a seat and cheer for your friends! You're back in next round."

Continue until one player remains.


PHASE 3: TEACHING MOMENT (45 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: At the free throw line with all players

SAY: "Great round! Quick question - after you missed, where was the easiest place to make a shot?"
Listen for: "Close to the basket," "Under the hoop"

SAY: "Exactly! When you rebound, get as close as you can before shooting. Don't shoot from far away - get a LAYUP if you can!"

DEMO: Miss intentionally, rebound, show getting close for easy shot.


PHASE 4: SECOND GAME (4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "New game! Remember - after you rebound, get CLOSE before you shoot!"

Options to keep eliminated players engaged:
• "Knocked out players - count how many layups you see!"
• "Rebounders for people still in!"
• "Start a second game at another basket"

Continue until winner is crowned.


WRAP UP (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Great games! Remember - in Knockout, the best players don't just shoot fast, they get CLOSE after rebounds and make easy shots. That's smart basketball! Water break!"`,

      diagram: `                [BASKET]
                   │
    ─────────────────────  Free throw line
                   │
       ○ ○ ○ ○ ○ ○ ○ ○      (Line of players)
       ▲ ▲                  First 2 have balls`,

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
        { name: "Lightning", description: "Same game, different name - some regions call it Lightning or Bump.", difficulty: "beginner" },
        { name: "Comeback Knockout", description: "Knocked out players shoot from side. If they make it, they're back in!", difficulty: "beginner" },
        { name: "21 Knockout", description: "First shot worth 2, second worth 1. First to 21 wins instead of elimination.", difficulty: "intermediate" },
        { name: "Reverse Knockout", description: "Start under basket, move back to free throw line with each make.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Players can't make shots from free throw line
• Games end too quickly (everyone knocked out fast)
• Frustration and tears

SOLUTIONS:
• Move shooting line closer (8 feet instead of 15)
• Allow two free throw attempts before runner can shoot
• Use lower basket if available
• "No knockout" version - just track who makes most in 2 minutes
• Allow anyone knocked out to come back after 2 players are out`,

      makeHarder: `SIGNS THEY'RE READY:
• Players making most first shots
• Games drag on
• Asking for challenge

SOLUTIONS:
• Move line back
• First shot must be a swish (no rim)
• Weak hand only for close shots
• Must make two in a row to survive (if you make one, shoot again)
• Add third ball to increase pressure`,

      equipmentNeeded: ["2 basketballs", "1 basketball hoop"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id, skillBuilding?.id].filter(Boolean) as string[],
      tags: ["game", "shooting", "rebounding", "competitive", "high-energy", "fun", "classic"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Players race to make a shot before the person behind them; develops shooting under pressure and quick execution.",
          keyPhrases: [
            "Quick release - don't wait!",
            "Rebound your miss!",
            "Get close for the easy shot!",
          ],
          setupDiagram: "Single file line at free throw line, first 2 players have balls",
          quickProgression: {
            easier: "Move line closer, allow two free throw attempts, lower basket",
            harder: "Move line back, must swish first shot, weak hand close shots",
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
            mindset: "Knockout is about FUN and COMPETITION. Keep energy high, celebrate makes and effort, manage eliminated players so they stay engaged. This game should feel special.",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "60 seconds",
              coachPosition: "At the free throw line",
              script: "Line players up, give first 2 balls. Explain: make = pass ball back, miss = rebound and make before person behind you. Demo with first 2 players.",
              anticipatedResponses: {
                "What if I always miss?": "Everyone misses! Get close for an easy shot after you rebound.",
                "Can I knock out on purpose?": "Your goal is to make YOUR shot - let the game happen naturally.",
              },
            },
            {
              phase: "First Game",
              duration: "4 minutes",
              coachPosition: "Near basket to see action",
              script: "SAY: 'First shooter, GO!' Encourage rebounding, quick shots, hustle. Manage knockouts with positivity.",
              troubleshooting: {
                "No one can make shots": ["Move line closer", "Allow two attempts", "Lower basket"],
                "Same players always win": ["Handicap: good shooters start from further back", "Different starting order"],
              },
            },
            {
              phase: "Teaching Moment",
              duration: "45 seconds",
              coachPosition: "At free throw line, all players",
              script: "ASK: 'After a miss, where's the easiest shot?' TEACH: Get close - layup is your friend! Demo: miss, rebound, get close, make.",
            },
            {
              phase: "Second Game",
              duration: "4 minutes",
              coachPosition: "Near basket",
              script: "New game emphasizing getting close after rebounds. Keep eliminated players engaged with counting tasks or second game.",
            },
            {
              phase: "Wrap Up",
              duration: "30 seconds",
              coachPosition: "Center with all players",
              script: "SAY: 'Best players get CLOSE after rebounds - that's smart basketball! Water break!'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            gamesEndTooFast: {
              symptoms: ["Everyone knocked out in 1 minute", "Not enough touches", "Frustration"],
              solutions: ["Move line closer", "Allow two free throw attempts", "Comeback rule: make a side shot to get back in"],
            },
            gamesDragOn: {
              symptoms: ["Same players left forever", "Others bored waiting", "Loses energy"],
              solutions: ["Add third ball", "Time limit (2 minutes) then sudden death", "Weak hand requirement"],
            },
          },
          playerBehavior: {
            upsetWhenKnockedOut: {
              symptoms: ["Tears", "Anger", "Saying 'not fair'"],
              approach: "Normalize: 'Everyone gets knocked out - that's the game! You're in next round.' Give them a job: 'Count makes for me?'",
            },
            notTrying: {
              symptoms: ["Not chasing rebounds", "Slow shots", "Distracted"],
              approach: "Private encouragement. Maybe the game is too hard - adjust difficulty. Or ask: 'What's up? Not feeling it today?'",
            },
            overlyCompetitive: {
              symptoms: ["Celebrating others' misses meanly", "Arguing calls", "Ball hogging"],
              approach: "SAY: 'We celebrate our own makes, not others' misses.' If continues: 'Take a round off.'",
            },
          },
          environmentalIssues: {
            onlyOneBasket: {
              symptoms: ["Long wait times", "Players distracted"],
              solutions: ["Smaller games (max 8 per game)", "Shooting practice for those waiting", "Rotate groups"],
            },
            unevenSkillLevels: {
              symptoms: ["Same players always win", "Weaker players always first out"],
              solutions: ["Better shooters start further back", "Pair weak/strong for team knockout", "Multiple games by level"],
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Shooting Under Pressure",
              domain: "Technical",
              howItDevelops: "Players must execute shots while someone is racing to knock them out - mirrors game pressure.",
              levelIndicators: {
                1: "Panics, rushes shot badly, usually misses",
                2: "Sometimes makes under pressure, inconsistent",
                3: "Maintains form under moderate pressure",
                4: "Composed shooter, makes most pressure shots",
                5: "Thrives under pressure, clutch performer",
              },
              assessmentNotes: "Watch how shooting form changes as person behind gets closer. Composure reveals level.",
            },
            {
              skill: "Rebounding",
              domain: "Technical",
              howItDevelops: "Players learn to anticipate where missed shots go and pursue the ball aggressively.",
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
              howItDevelops: "Must shoot quickly to avoid being knocked out - builds fast but controlled release.",
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
              howItDevelops: "After rebounds, close shots/layups are the smart play - reinforces layup importance.",
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
          whyThisActivity: "Knockout develops shooting under pressure in a competitive format that players LOVE. The pressure of someone trying to knock you out mirrors game situations. The rebounding aspect teaches players to follow their shot and finish at the rim.",
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
              { activity: "Form Shooting", reason: "Build shooting mechanics" },
              { activity: "Layup Lines", reason: "Close finishing ability" },
            ],
            after: [
              { activity: "Free Throw Practice", reason: "Transfer pressure handling to free throws" },
              { activity: "Game Situations", reason: "Apply clutch shooting to team play" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Fun first, close distance, lots of encouragement",
              keyPhrases: ["Chase that ball!", "Get close for an easy one!", "You'll be back next round!"],
              duration: "8 minutes max (attention span)",
              simplifications: ["Shoot from 6-8 feet", "Lower basket if available", "Comeback rule after 2 outs"],
            },
            "ages9to11": {
              approach: "Real competition, teach strategy",
              keyPhrases: ["After your rebound, get CLOSE!", "Quick release!", "Read where the ball bounces!"],
              challenges: ["Full free throw distance", "Swish first shot rule"],
              duration: "10 minutes",
            },
            "ages12to14": {
              approach: "High competition, strategic thinking",
              keyPhrases: ["Where's the smart shot?", "Manage the pressure!"],
              challenges: ["Extended range", "Weak hand close shots", "Three-ball version"],
              coachRole: "Let them run it, intervene only for safety/sportsmanship",
            },
          },
          commonMisconceptions: {
            "It's just a game": "Knockout develops real skills - shooting under pressure, rebounding, quick execution.",
            "Better shooters always win": "Rebounding and close finishing often matter more than initial shooting.",
            "Gets kids upset": "When managed well with comeback rules and positivity, even knocked-out players stay engaged.",
          },
        },

        parentCommunication: {
          ifAsked: "We play Knockout because it teaches shooting under pressure, rebounding, and quick decision-making. Your child learns to perform when it matters - just like in real games.",
          newsletter: "This week: Knockout! This classic basketball game teaches pressure shooting and rebounding. After a miss, the best strategy is to get close for an easy shot. Practice at home - just need 2 balls and a hoop!",
          whatToWatchFor: [
            "Does your child chase their rebound quickly?",
            "Do they get close before shooting after a miss?",
            "Can they handle the pressure of someone shooting behind them?",
            "Are they a good sport when knocked out?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions chasing rebounds", prevention: "Emphasize YOUR ball, YOUR space", response: "Check players, remind about awareness" },
            { risk: "Balls hitting waiting players", prevention: "Line stands back from basket", response: "Move line further back" },
            { risk: "Slipping on court", prevention: "Clear any water/sweat", response: "Check player, dry floor" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Adjust shooting distance individually, allow sitting for those who need it",
            newPlayers: "Explain rules clearly, pair with experienced player, start them in middle of line (not first)",
            anxiousPlayers: "Practice round first, emphasize everyone gets knocked out, use comeback rule",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 5: LAYUP LINES
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: basketball.id,
      name: "Layup Lines",
      slug: "layup-lines-v2",
      description: "Classic basketball warm-up drill where players practice layups from both sides with continuous rotation. Develops proper layup footwork, finishing at the rim, rebounding, and passing fundamentals in a flowing, game-like format.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 20,
      durationMinutes: 8,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 2-4 basketballs
□ 1 basketball hoop
□ Optional: cones to mark lines

SPACE: One basket with enough space for two lines

SETUP STEPS
1. Form two lines at half court or top of key
2. Right side line = shooters (balls start here)
3. Left side line = rebounders/passers
4. First 2 players in right line have balls

DIAGRAM
                    [BASKET]
                       │
                       │
                       │
         Rebounders    │    Shooters
              ○ ○ ○ ○  │  ○ ○ ○ ○
                       │  ▲ ▲
                       │  Balls
                       │
──────────────────────────────────────  Half court`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Near the basket

SAY: "Everyone come in! We're doing Layup Lines. Split into two lines - right side are SHOOTERS, left side are REBOUNDERS. Shooters, first two get a ball!"

EXPLAIN THE ROTATION:
SAY: "Here's how it works: Shooter dribbles in, makes a layup. Rebounder follows, gets the ball, and passes to the next shooter. Then - and this is important - SHOOTER goes to REBOUND line, REBOUNDER goes to SHOOTING line."

DEMO with two players:
1. Shooter dribbles right, makes layup
2. Rebounder catches, passes to next shooter
3. Show them switching lines

SAY: "Right side layups use right hand, left side layups use left hand. Let's start on the right. Ready? GO!"


PHASE 2: RIGHT SIDE LAYUPS (2.5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Near the basket to see footwork

SAY: "Right side - that means RIGHT HAND layup! Go!"

WATCH FOR:
□ Correct hand (right side = right hand)?
□ Jumping off correct foot (left foot)?
□ Passing after rebound (not throwing)?

PHRASES TO USE:
• "Right hand!"
• "Jump off your left foot!"
• "Nice soft touch!"
• "Good pass!"

AFTER 90 SECONDS - TEACHING MOMENT:
SAY: "Freeze! Watch the footwork: dribble with right, last step is LEFT foot, reach up with RIGHT hand."
Demo slowly, then at speed.
SAY: "Keep going!"


PHASE 3: SWITCH TO LEFT SIDE (2.5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Now we're going LEFT SIDE! Shooters switch to the left line, rebounders to the right. LEFT HAND layups now!"

WATCH FOR:
□ Using left hand (this is hard for many)?
□ Jumping off right foot?
□ Soft touch on the glass?

PHRASES TO USE:
• "Left hand! Challenge yourself!"
• "Right foot jump!"
• "Use the backboard - it's your friend!"

AFTER 90 SECONDS - TEACHING MOMENT:
SAY: "Left hand is tricky! If it feels weird, that's normal. The more we practice, the easier it gets. One more minute, let's go!"


PHASE 4: COMPETITION ROUND (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Challenge time! Let's count how many layups we make in 2 minutes. I'll count - you just keep flowing!"

Alternate sides every 30 seconds:
"30 seconds on right... SWITCH to left... 30 on left... SWITCH..."

Count makes out loud. Celebrate effort.

SAY: "We made [X]! Can we beat that next time? Water break!"


WRAP UP (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Great work! Remember: right side = right hand, left foot jump. Left side = left hand, right foot jump. In games, you need both! Water break, then [next activity]."`,

      diagram: `                [BASKET]
                   │
       Rebounders  │  Shooters
            ○ ○ ○  │  ○ ○ ○
                   │  ▲ ▲
                   │  Balls
──────────────────────────────────  Half court

Rotation: Shooter → Rebound line
          Rebounder → Shooting line`,

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
        { name: "Reverse Layups", description: "Come from under the basket, finish on the other side.", difficulty: "intermediate" },
        { name: "Power Layups", description: "Two-foot jump stop before the layup. More control.", difficulty: "beginner" },
        { name: "Mikan Drill", description: "Under basket, alternating hands without dribble. Builds touch.", difficulty: "beginner" },
        { name: "Full Court Layups", description: "Start from opposite baseline, full court dribble into layup.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Missing most layups
• Can't coordinate footwork
• Left hand seems impossible

SOLUTIONS:
• Start closer to basket (no dribble, just layup)
• Don't require specific foot - just get the ball in
• Allow right hand on both sides at first
• Slower pace - make each one count
• Use smaller/lighter ball if available`,

      makeHarder: `SIGNS THEY'RE READY:
• Making most layups both sides
• Footwork is automatic
• Looking bored

SOLUTIONS:
• Add defender trailing (no block, just pressure)
• Must use floater instead of layup
• Reverse layups only
• Add a pass before the layup
• Time challenge - make 10 as fast as possible`,

      equipmentNeeded: ["2-4 basketballs", "1 basketball hoop"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id, skillBuilding?.id].filter(Boolean) as string[],
      tags: ["warmup", "layups", "finishing", "fundamentals", "rotation", "classic"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Two-line layup drill with continuous rotation; develops finishing at the rim with both hands and proper footwork.",
          keyPhrases: [
            "Right side, right hand!",
            "Left foot jump for right hand!",
            "Use the backboard!",
          ],
          setupDiagram: "Two lines - right side shoots, left side rebounds. Shooter goes to rebound line, rebounder goes to shooting line.",
          quickProgression: {
            easier: "Closer to basket, no footwork requirement, dominant hand only",
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
            mindset: "Layup Lines are about RHYTHM and REPETITION. Keep it flowing, give quick feedback, celebrate makes. Don't stop the drill for long explanations - talk while they move.",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "90 seconds",
              coachPosition: "Near the basket",
              script: "SAY: 'Two lines - right side shoots, left side rebounds. Shooter becomes rebounder, rebounder becomes shooter.' Demo full rotation with 2 players.",
              anticipatedResponses: {
                "Which line do I start in?": "Pick one! You'll do both every round.",
                "What if I miss?": "Rebounder still gets it and passes. Try to make it next time!",
              },
            },
            {
              phase: "Right Side Layups",
              duration: "2.5 minutes",
              coachPosition: "Near basket for footwork view",
              script: "SAY: 'Right side = right hand! Go!' Watch for: correct hand, left foot takeoff, soft touch. Teaching moment at 90 seconds for footwork.",
              troubleshooting: {
                "Using wrong hand": ["Stop individual, 'Which side?' Correct and continue"],
                "Can't coordinate footwork": ["Let them make it any way first, add footwork later"],
              },
            },
            {
              phase: "Left Side Layups",
              duration: "2.5 minutes",
              coachPosition: "Near basket",
              script: "SAY: 'Switch to LEFT side! Left hand layups!' Acknowledge difficulty: 'If it feels weird, that's normal!' Teaching moment at 90 seconds.",
            },
            {
              phase: "Competition Round",
              duration: "2 minutes",
              coachPosition: "Near basket counting",
              script: "SAY: 'Let's count! How many in 2 minutes?' Alternate sides every 30 seconds. Count out loud. Celebrate total.",
            },
            {
              phase: "Wrap Up",
              duration: "30 seconds",
              coachPosition: "With group",
              script: "SAY: 'Right side = right hand, left foot. Left side = left hand, right foot. You need both in games! Water break!'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            drillTooSlow: {
              symptoms: ["Long waits between turns", "Players distracted", "Low energy"],
              solutions: ["Add more balls", "Split into two groups at different baskets", "Shorter lines"],
            },
            drillTooFast: {
              symptoms: ["Chaos", "Collisions", "Can't process feedback"],
              solutions: ["Fewer balls", "Require each finish before next starts", "Slow down and emphasize quality"],
            },
          },
          playerBehavior: {
            notSwitchingLines: {
              symptoms: ["Same kids shooting", "Confusion about rotation"],
              approach: "Stop drill. Walk through rotation again. Assign someone to direct traffic.",
            },
            skippingWeakHand: {
              symptoms: ["Using right hand on left side", "Avoiding left side line"],
              approach: "Normalize struggle: 'Left hand is supposed to be hard! That's why we practice.' Celebrate attempts.",
            },
            notRebounding: {
              symptoms: ["Ball drops to floor", "Slow restarts"],
              approach: "SAY: 'Rebounders - catch it before it bounces! Be ready!' Make it a mini-competition.",
            },
          },
          environmentalIssues: {
            tooManyPlayers: {
              symptoms: ["Lines too long", "Too much waiting"],
              solutions: ["Split to 2 baskets", "Add third line for ball handling while waiting", "Rotate groups"],
            },
            mixedSkillLevels: {
              symptoms: ["Some make every layup, some miss all"],
              solutions: ["Group by ability", "Adjust distance for individuals", "Pair strong with developing in same line for peer help"],
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Layup Finishing",
              domain: "Technical",
              howItDevelops: "Repetitive practice of layups from both sides builds muscle memory and confidence at the rim.",
              levelIndicators: {
                1: "Misses most layups, no clear technique",
                2: "Makes some layups with dominant hand, struggles with footwork",
                3: "Consistent dominant hand layups with correct footwork",
                4: "Can make layups with both hands, good touch",
                5: "Finishes with either hand naturally, can add variations",
              },
              assessmentNotes: "Assess both sides separately. Most players will be 1-2 levels lower on weak hand.",
            },
            {
              skill: "Layup Footwork",
              domain: "Technical",
              howItDevelops: "Correct foot-hand coordination (opposite foot, same hand) becomes automatic through repetition.",
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
              howItDevelops: "Players in rebound line practice catching made/missed shots and making quick outlets.",
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
              howItDevelops: "Quick outlet pass to next shooter develops passing accuracy under time pressure.",
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
          whyThisActivity: "Layups are the highest percentage shot in basketball. Layup Lines provide massive repetition in a game-like flow. Learning both hands is essential - defenders will take away the strong hand. The rotation teaches rebounding and passing in context.",
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
              { activity: "Stationary Layup Form", reason: "Teach the motion without movement" },
              { activity: "Mikan Drill", reason: "Build touch at rim without approach" },
            ],
            after: [
              { activity: "Layups off the Pass", reason: "Receive and finish" },
              { activity: "Layups with Defender", reason: "Add game-like pressure" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Fun, lots of makes, don't stress footwork initially",
              keyPhrases: ["Get it in!", "Nice shot!", "Try the other hand!"],
              duration: "6 minutes max",
              simplifications: ["Lower basket if available", "Closer starting point", "Don't require specific footwork"],
            },
            "ages9to11": {
              approach: "Teach correct technique, expect development",
              keyPhrases: ["Right side, right hand!", "Off your left foot!", "Soft touch!"],
              challenges: ["Require correct footwork", "Count makes per minute"],
              duration: "8 minutes",
            },
            "ages12to14": {
              approach: "Polish technique, add variations",
              keyPhrases: ["Make it automatic!", "Game speed!", "Read the defender!"],
              challenges: ["Add trailing defender", "Reverse layups", "Floaters"],
              coachRole: "Occasional feedback, let them self-organize",
            },
          },
          commonMisconceptions: {
            "Just get it in, doesn't matter how": "Good habits now make clutch layups later. Footwork matters.",
            "Left hand will develop naturally": "Must deliberately practice weak hand - it won't develop without intentional work.",
            "This is boring/basic": "NBA players do layup lines every day. Fundamentals never get old.",
          },
        },

        parentCommunication: {
          ifAsked: "We do Layup Lines because layups are the most important shot in basketball - they're the highest percentage. We practice both hands because in games, defenders will take away your strong hand.",
          newsletter: "This week: Layup Lines! We practiced finishing at the rim with both right and left hands. At home, practice the footwork: right hand layup = jump off left foot. Left hand = jump off right foot!",
          whatToWatchFor: [
            "Can your child make a layup with their dominant hand?",
            "Are they attempting left hand layups? (It's okay if they miss!)",
            "Do they use the backboard?",
            "Is their touch soft or do they throw it hard?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions at basket", prevention: "Clear rotation - shooter finishes before next goes", response: "Check players, reinforce timing" },
            { risk: "Rolled ankles on landing", prevention: "Land on two feet when possible, proper footwear", response: "Ice, evaluate severity" },
            { risk: "Ball hitting waiting players", prevention: "Waiting lines stand clear of basket area", response: "Move lines further back" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Adjust basket height if possible, allow closer starting point",
            newPlayers: "Pair with experienced player who can help with rotation",
            anxiousPlayers: "Start them in rebound line (less pressure), move to shooting when comfortable",
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
    },
  ];

  // Insert activities
  for (const activity of comprehensiveActivities) {
    await db.insert(activities).values(activity).onConflictDoNothing();
    console.log(`  ✓ ${activity.name}`);
  }

  console.log(`\nSeeded ${comprehensiveActivities.length} comprehensive basketball activities`);
}

/**
 * Comprehensive Soccer Activities - Skill Building Stage (Ages 9-11)
 *
 * Print-ready activities with complete coaching guides including:
 * - Quick reference cards
 * - Minute-by-minute scripts
 * - Troubleshooting guides
 * - Skill connections
 * - Developmental context
 * - Parent communication
 * - Safety considerations
 *
 * These activities are MORE TECHNICAL than fundamentals, with emphasis on:
 * - Tactical understanding
 * - Combination play
 * - Decision making under pressure
 * - Game-realistic scenarios
 */

import { db } from "../../index";
import { activities } from "../../schema/practice-planning";
import { sports } from "../../schema/sports";
import { developmentStages } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

export async function seedSoccerSkillBuildingActivities() {
  console.log("Seeding comprehensive soccer activities (Skill Building)...");

  const [soccer] = await db.select().from(sports).where(eq(sports.slug, "soccer"));
  if (!soccer) throw new Error("Soccer sport must be seeded first");

  const stages = await db.select().from(developmentStages);
  const skillBuilding = stages.find((s) => s.slug === "skill-building");
  const gameReadiness = stages.find((s) => s.slug === "game-readiness");

  if (!skillBuilding) throw new Error("Development stages must be seeded first");

  const comprehensiveActivities = [
    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 1: PASSING COMBINATIONS
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Passing Combinations",
      slug: "passing-combinations-v2",
      description: "Technical passing activity focused on wall passes (give-and-go) and combination play patterns. Players learn to execute quick one-two exchanges, understand timing of runs, and develop the technical foundation for penetrating defenses through combination play.",
      activityType: "skill-drill" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 12,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 8-12 balls (1 per pair minimum)
□ 12 cones (various colors if available)
□ 4 flat markers for start positions
□ 4 tall cones/poles for targets (optional)

SPACE: 30x20 paces with two parallel channels

SETUP STEPS
1. Create two parallel channels, each 25x8 paces
2. Place start cone at one end of each channel
3. Place "wall player" cone 10 paces from start
4. Place "finishing" cone 10 paces past wall player
5. Set up mannequin/pole as "defender" near wall player
6. Position spare balls at start cones

DIAGRAM - TOP VIEW
┌─────────────────────────────────────────┐
│  START      WALL PLAYER      FINISH     │
│    ▲            ●               ○       │
│    A ─────────────────────────────→     │  Channel 1
│              [D]                        │  (8 paces wide)
├─────────────────────────────────────────┤
│    ▲            ●               ○       │
│    A ─────────────────────────────→     │  Channel 2
│              [D]                        │  (8 paces wide)
└─────────────────────────────────────────┘
        25 paces total

▲=Start cone  ●=Wall player position  ○=Finish  [D]=Defender cone/mannequin
A=Player with ball path`,

      howToPlay: `PHASE 1: GATHER & DEMONSTRATE (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Between the two channels

SAY: "Today we're learning wall passes - also called give-and-go. This is one of the most effective ways to beat a defender in a game."

DEMONSTRATE with one player as wall:
1. "I have the ball. I see a defender [point to cone]. I can't dribble through."
2. "I pass to my teammate [firm pass to feet] and IMMEDIATELY sprint past the defender."
3. "My teammate LAYS IT OFF into my path [one-touch return] - they're a WALL, the ball bounces back."
4. "Now I collect the ball behind where the defender was."

KEY TEACHING POINTS during demo:
• "Notice: The first pass is FIRM to their feet"
• "Notice: I move the INSTANT I pass - not after"
• "Notice: The return pass is ONE TOUCH into space ahead of me"

ASK: "Why does this beat a defender?"
Listen for: Defender can't follow ball AND player / Creates 2v1 moment

SAY: "Let's break this down step by step."


PHASE 2: WALKING REHEARSAL (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pair players: One starts at START cone, one at WALL PLAYER cone.

SAY: "Walk through it. Passer - walk toward wall player, pass, then walk your run past the defender cone. Wall - receive and lay off."

Each pair walks through 3 reps each direction.

CORRECTIONS TO MAKE:
□ "Don't wait to see if your pass arrives - MOVE as you pass"
□ "Wall player - open your body toward where they're running"
□ "Lay off IN FRONT of them, not behind"


PHASE 3: DRILL AT PACE (5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Now game speed! Player A starts, passes to B, sprints past defender, receives return, and dribbles to finish. Then B gets a ball and becomes the new A. Rotate through."

Run continuous rotation:
- Lines at START cone
- One player always at WALL position
- After finishing, jog back to start line
- After being wall, become next attacker

COACH POSITION: Side of channel, watching angles and timing

PHRASES TO USE:
• "Move as you pass!"
• "Firm pass to feet!"
• "One touch - into their path!"
• "Angle your body toward the finish!"
• "Check your shoulder before you receive!"

Every 90 seconds: "SWITCH CHANNELS!" - keeps it fresh


PHASE 4: PROGRESSION - ADD DECISIONS (3 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Now the wall player has a choice. If the passer makes a good run, lay it off. If the passer is slow or the pass is bad, TURN and go yourself."

DEMO: Show bad pass scenario where wall player turns and dribbles instead of laying off.

Now wall player makes decisions:
- Good timing = wall pass
- Bad timing = turn and go

SAY: "This is real soccer! You must READ the situation."


WRAP UP (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gather group.

ASK: "When in a game would you use this?"
Listen for: Near goal, when defender closes you down, in tight spaces

SAY: "Three things to remember: Firm pass, move immediately, one-touch return into space. Water break, then we're using this in 1v1!"`,

      diagram: `WALL PASS PATTERN
┌─────────────────────────────────────┐
│                                     │
│    A ───pass──→ B                   │
│     \\                              │
│      \\ (run)    [Defender]         │
│       \\                            │
│        \\←─return─┘                 │
│         \\                          │
│          ○ (receives behind def)   │
│                                     │
└─────────────────────────────────────┘

SETUP VIEW
┌─────────────────────────────────────────┐
│  START      WALL          FINISH        │
│    ▲──────────●─────────────○           │
│              [D]                        │
├─────────────────────────────────────────┤
│    ▲──────────●─────────────○           │
│              [D]                        │
└─────────────────────────────────────────┘`,

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
        { name: "Double Wall Pass", description: "Add third player. A passes to B, runs, B lays off, A passes to C, runs, receives from C. Two combinations in sequence.", difficulty: "advanced" },
        { name: "Overlap Combination", description: "Instead of wall pass, A passes to B, overlaps around B, receives return. Different running pattern.", difficulty: "intermediate" },
        { name: "Third Man Run", description: "A passes to B, B passes to C, C plays A who continued their run. Introduces third-man concepts.", difficulty: "advanced" },
        { name: "Finish with Shot", description: "After receiving return pass, player must finish on goal within 2 touches. Adds end product pressure.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Return passes constantly behind runner
• Runners not timing movement
• Passes too weak to one-touch

SOLUTIONS:
• Slow down - do at 50% pace first
• Increase distance between cones (more time)
• Allow two touches for wall player
• Remove "defender" cone (less pressure)
• Demo repeatedly with verbal cues`,

      makeHarder: `SIGNS THEY'RE READY:
• Executing cleanly at pace
• Making good decisions
• Asking for more challenge

SOLUTIONS:
• Add real defender (passive, then active)
• Decrease space between cones
• Require weak foot passes
• Time pressure: Must complete in X seconds
• Competition: Points for clean combinations`,

      equipmentNeeded: ["8-12 balls", "12 cones", "4 flat markers", "4 tall cones or poles (optional)"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [skillBuilding.id, gameReadiness?.id].filter(Boolean) as string[],
      tags: ["passing", "combination-play", "wall-pass", "give-and-go", "technical", "tactical", "skill-building"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Players learn wall passes (give-and-go) through progressive practice, developing timing, weight of pass, and movement off the ball.",
          keyPhrases: [
            "Pass and move immediately!",
            "Firm pass to feet!",
            "One touch into their path!",
            "Open your body to see the field!",
          ],
          setupDiagram: "Two 25x8 pace channels with start, wall player, and finish positions",
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
            mindset: "This is TACTICAL teaching, not just technical. Help players understand WHY wall passes work, not just HOW to execute them. Connect everything to game situations.",
          },
          segments: [
            {
              phase: "Demonstration",
              duration: "2 minutes",
              coachPosition: "Between channels, visible to all",
              script: "Explain concept: 'Wall passes beat defenders by moving ball AND player.' Demo full pattern. Highlight: firm pass, immediate movement, one-touch return into space.",
              anticipatedResponses: {
                "What if the defender follows my run?": "Then your teammate is free! The defender can't guard both.",
                "What if they don't pass it back?": "Great question - that's why we communicate. Call for it!",
                "Can I just dribble past?": "Sometimes! But when defender is tight, wall pass is your tool.",
              },
            },
            {
              phase: "Walking Rehearsal",
              duration: "2 minutes",
              coachPosition: "Moving between pairs",
              script: "Pairs walk through pattern. Focus on sequence: pass, move, receive. Correct body position of wall player. 3 reps each.",
              troubleshooting: {
                "Runner goes too early": ["Explain: ball must leave foot first, then you move"],
                "Wall player wrong body shape": ["Demo: 'Show me your belly button toward the finish'"],
              },
            },
            {
              phase: "Drill at Pace",
              duration: "5 minutes",
              coachPosition: "Side of channel",
              script: "Now game speed. Continuous rotation. Coach position: side view. Call out corrections. Switch channels every 90 seconds.",
              troubleshooting: {
                "Passes consistently bad": ["Stop drill, re-demo pass weight", "Create target: 'Hit their front foot'"],
                "No one moving after passing": ["'Freeze!' Check who moved. 'Pass = first step. Same moment.'"],
              },
            },
            {
              phase: "Progression with Decisions",
              duration: "3 minutes",
              coachPosition: "End of channel",
              script: "Wall player now decides: lay off if timing is good, turn and go if timing is bad. Demo bad timing scenario. Make it game-realistic.",
            },
          ],
        },

        troubleshooting: {
          technicalIssues: {
            poorPassWeight: {
              symptoms: ["Passes too soft to one-touch", "Passes too hard, bouncing off"],
              solutions: ["Practice striking through center of ball", "Target: firm enough to travel, soft enough to control", "Demo repeatedly with verbal 'firm but friendly'"],
            },
            badTiming: {
              symptoms: ["Runner arrives too early/late", "Ball and player never meet"],
              solutions: ["Walk through slowly first", "Verbal cue: 'As the ball leaves your foot, you leave too'", "Reduce distance for more time"],
            },
            poorBodyShape: {
              symptoms: ["Wall player facing wrong way", "Can't see runner", "Return passes blind"],
              solutions: ["'Hips toward target!'", "Demo side-on body position", "Use cones to mark where feet should point"],
            },
          },
          playerBehavior: {
            frustration: {
              symptoms: ["Giving up", "Blaming partner", "Disengaged"],
              approach: "Pair with more skilled partner temporarily. Simplify - just work on the pass. Celebrate small wins.",
            },
            overComplicating: {
              symptoms: ["Adding unnecessary touches", "Dribbling instead of passing", "Ignoring pattern"],
              approach: "Constrain: 'Maximum 2 touches each.' Explain why simplicity works.",
            },
          },
          groupIssues: {
            unevenNumbers: {
              symptoms: ["Someone always waiting"],
              solutions: ["Odd player becomes permanent wall player", "Coach joins in", "Three-person rotation"],
            },
            mixedAbilityLevels: {
              symptoms: ["Strong players frustrated", "Weaker players overwhelmed"],
              solutions: ["Pair similar abilities", "Different channels for different levels", "Different progressions per group"],
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Wall Pass Execution",
              domain: "Technical",
              howItDevelops: "Players learn the complete mechanics: pass weight, timing of run, body shape, return pass placement, receiving on the move.",
              levelIndicators: {
                1: "Cannot coordinate pass and movement; frequently miscues",
                2: "Sometimes executes at walking pace; breaks down at speed",
                3: "Executes wall pass at game pace with stationary defender",
                4: "Executes wall pass against moving pressure; good decisions",
                5: "Instinctively uses wall passes in games; varies based on situation",
              },
              assessmentNotes: "Watch for the complete sequence. Partial execution (good pass, poor run) is common. All elements must connect.",
            },
            {
              skill: "Passing Under Pressure",
              domain: "Technical",
              howItDevelops: "Firm passes to moving targets while also preparing to run. Multi-tasking technical challenge.",
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
              howItDevelops: "Running into space at the right moment, understanding when and where to move.",
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
              howItDevelops: "Choosing when to play wall pass vs. other options based on defender position.",
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
          whyThisActivity: "Wall passes are fundamental to breaking down organized defenses. At ages 9-11, players begin to face defenders who don't dive in, making combination play essential. This activity teaches the most basic attacking combination and develops the habit of moving after passing.",
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
              { activity: "Passing Pairs", reason: "Basic passing technique without movement" },
              { activity: "Triangle Passing", reason: "Passing in patterns, moving to next spot" },
            ],
            after: [
              { activity: "3v2 to Goal", reason: "Apply combinations with numbers advantage" },
              { activity: "Small-Sided Games", reason: "Use combinations in game context" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Not recommended - too complex",
              keyPhrases: [],
              avoidSaying: [],
              duration: "N/A",
              simplifications: ["Focus on basic passing first", "Wall pass too many elements"],
            },
            "ages9to11": {
              approach: "Primary teaching age - build foundation",
              keyPhrases: ["Pass and go!", "Be a wall!", "Firm and fast!", "Move as you pass!"],
              challenges: ["Add defender cone", "Competition for speed", "Require weak foot"],
              duration: "10-15 minutes with progressions",
            },
            "ages12to14": {
              approach: "Refine and apply to game situations",
              keyPhrases: ["When would you use this?", "Read the defender", "Create the 2v1"],
              challenges: ["Live defenders", "Combined with finishing", "Identify opportunities"],
              coachRole: "Facilitate game-scenario discussions",
            },
          },
          commonMisconceptions: {
            "It's just a passing drill": "It's a tactical concept that teaches movement, timing, and creating overloads - core attacking principles.",
            "Players will figure it out in games": "Wall passes require specific training. The timing and weight of pass don't develop naturally.",
            "Only for advanced players": "Ages 9-11 are perfect to introduce. Start simple, build complexity.",
          },
        },

        parentCommunication: {
          ifAsked: "We're teaching 'wall passes' or 'give-and-go' - a way to beat defenders by passing to a teammate and immediately running to receive it back. It's like using your teammate as a wall the ball bounces off. This combination play is used at every level of soccer.",
          newsletter: "This week: Passing Combinations! We learned wall passes (give-and-go) - one of soccer's most effective ways to beat defenders. Ask your child to explain it: pass, move, receive. Watch for it when you watch soccer on TV - you'll see it constantly!",
          whatToWatchFor: [
            "Does your child move after they pass? (key habit)",
            "Are they looking for teammates to combine with?",
            "Can they explain why wall passes work?",
            "Do they communicate with teammates during combinations?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collision between runner and wall player", prevention: "Clear lanes, wall player stays in position until ball returned", response: "Check both, reinforce positions" },
            { risk: "Ball striking player not ready", prevention: "Communication: 'Playing!' before pass", response: "Emphasize verbal cues" },
            { risk: "Running into cones/poles", prevention: "Ensure clear finishing area, remove obstacles after pattern", response: "Adjust setup for safety" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Adjust distances for different speeds, allow more time for passes",
            newPlayers: "Pair with patient partner, walk through multiple times before pace",
            anxiousPlayers: "Start as wall player (less pressure), build confidence before initiating",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 2: 1v1 TO GOAL
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "1v1 to Goal",
      slug: "1v1-to-goal-v2",
      description: "Competitive 1v1 activity where an attacker attempts to beat a defender and score on goal. Develops individual attacking skills (dribbling, moves, finishing), defending technique (body position, patience, tackling), and the ability to perform under direct pressure.",
      activityType: "game-based" as const,
      difficulty: "intermediate" as const,
      minPlayers: 6,
      maxPlayers: 16,
      durationMinutes: 15,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 goal (full-size, mini, or cones)
□ 8-12 balls at coach position
□ 8 cones for playing area
□ 2 different colored pinnies (one per pair)
□ Optional: second goal for simultaneous games

SPACE: 15x20 paces (narrow encourages 1v1, not running around)

SETUP STEPS
1. Set up goal at one end
2. Create playing area 15 wide x 20 long in front of goal
3. Attacker start position: 20 paces from goal, centered
4. Defender start position: 10 paces from goal, centered
5. Coach position: Behind attacker start with balls
6. Two lines: attackers and defenders

DIAGRAM
┌──────────────────────────────────────┐
│                                      │
│           ┌─────────────┐            │
│           │    GOAL     │            │
│           └─────────────┘            │
│                                      │
│                 ●                    │  Defender starts here
│                 D                    │  (10 paces from goal)
│                                      │
│                                      │
│                                      │
│                 ○                    │  Attacker starts here
│                 A                    │  (20 paces from goal)
│                                      │
│            [COACH + BALLS]           │
└──────────────────────────────────────┘
         15 paces wide`,

      howToPlay: `PHASE 1: EXPLAIN RULES & DEMO (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Side of playing area

SET UP TWO LINES: Attackers behind attacker start, defenders behind defender start.

SAY: "This is 1v1 to Goal - one attacker, one defender, who wins?"

RULES:
1. Coach plays ball to attacker - game starts immediately
2. Attacker's goal: Score
3. Defender's goal: Win ball and dribble out of area OR kick out of bounds
4. If ball goes out: restart with new players
5. After each rep: Attacker goes to defender line, defender to attacker line

DEMO with two players:
- "Watch - I play the ball... defender closes down... attacker must make a decision... GO!"
- Let them play to completion

SAY: "Attackers - your job is to beat them and SCORE. Defenders - get tight, be patient, don't dive in!"


PHASE 2: ROUND 1 - BASIC 1v1 (4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Behind attacker line with balls

START EACH REP:
- "Attacker ready? Defender ready? GO!" [play ball to attacker]
- Ball slightly in front of attacker to create running start

PHRASES FOR ATTACKERS:
• "Attack the defender!"
• "Commit them - make them choose!"
• "Take them on!"
• "Eyes up - see the goal!"

PHRASES FOR DEFENDERS:
• "Close the space!"
• "Get side-on - don't square up!"
• "Patience - don't dive in!"
• "Force them wide!"

Keep pace HIGH - next pair ready as soon as ball is dead.


PHASE 3: COACHING MOMENT - ATTACKING (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gather attackers (defenders get water).

SAY: "Attackers - what's working to beat the defender?"
Listen for: Speed, moves, fakes, going at them

TEACH: "The best attackers do THREE things:
1. Run AT the defender - make them backpedal
2. Change speed OR direction - make them commit
3. Accelerate into the space you created"

DEMO: Show slow-slow-FAST rhythm, or dip shoulder one way, go other.

SAY: "Try one of those this round!"


PHASE 4: ROUND 2 - FOCUS ON ATTACKING (3 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resume 1v1s. Coach specifically watches for and reinforces attacking concepts:

• "Nice change of speed!"
• "Good - you made them commit first!"
• "Attack them - don't wait!"


PHASE 5: COACHING MOMENT - DEFENDING (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gather defenders (attackers get water).

SAY: "Defenders - what made it hard to stop them?"
Listen for: Speed, moves, when I dove in

TEACH: "Best defenders do THREE things:
1. Get there FAST, then SLOW DOWN (don't fly past)
2. Stay side-on, one foot ahead (show)
3. BE PATIENT - wait for bad touch, don't dive in"

DEMO: Show approach - fast-slow transition, body position.

SAY: "Your goal: delay them long enough to force a bad touch."


PHASE 6: ROUND 3 - FOCUS ON DEFENDING (3 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resume 1v1s. Coach specifically watches defenders:

• "Great patience!"
• "Nice approach - fast then slow!"
• "Good angle - forcing them wide!"


WRAP UP (1 minute)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Quick tournament option: Count personal wins. "Who scored most? Who defended best?"

GATHER:
SAY: "1v1 is where games are won and lost. Attackers - commit the defender, change speed, accelerate. Defenders - approach fast, slow down, be patient. Water break!"`,

      diagram: `SETUP
┌──────────────────────────────────────┐
│           ┌───────────┐              │
│           │   GOAL    │              │
│           └───────────┘              │
│                                      │
│                 ●D (defender)        │
│                                      │
│                                      │
│                                      │
│                 ○A (attacker)        │
│                                      │
│            [COACH + BALLS]           │
└──────────────────────────────────────┘

DEFENDING BODY POSITION
          Bad              Good
     ┌─────────┐      ┌─────────┐
     │    ●    │      │   ●     │  ● = defender
     │   ═╪═   │      │  ╱╲     │  Side-on, one
     │   ╱ ╲   │      │ ╱  ╲    │  foot ahead
     │         │      │    ↓    │
     │ Square  │      │ Can     │
     │ Can go  │      │ only    │
     │ either  │      │ go one  │
     │ way     │      │ way     │
     └─────────┘      └─────────┘`,

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
        { name: "Counter Attack", description: "If defender wins ball, they can score on a mini goal behind attacker. Now defender has incentive to win AND go forward.", difficulty: "intermediate" },
        { name: "Timed", description: "Attacker has 8 seconds to score. Forces quicker decisions, more aggressive attacking.", difficulty: "intermediate" },
        { name: "Different Entry Passes", description: "Coach varies pass - in air, bouncing, rolling, to feet, to space. More realistic.", difficulty: "advanced" },
        { name: "2v1 Option", description: "Attacker can call in teammate for support. Develops when to use help vs. go alone.", difficulty: "advanced" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Attackers never score
• Defenders never win ball
• Frustration from one role

SOLUTIONS:
• Make area wider (more space to attack)
• Defender starts further from goal
• Allow attacker small head start
• Play passive defense first (50% effort)
• Celebrate effort not just outcome`,

      makeHarder: `SIGNS THEY'RE READY:
• Attackers consistently scoring
• Defenders comfortable
• Clean executions

SOLUTIONS:
• Make area narrower (less space)
• Add time limit (8 seconds)
• Counter-attack for defender
• Require specific move to score
• Add goalkeeper`,

      equipmentNeeded: ["1 goal", "8-12 balls", "8 cones", "2 colors of pinnies"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuilding.id, gameReadiness?.id].filter(Boolean) as string[],
      tags: ["1v1", "attacking", "defending", "dribbling", "tackling", "finishing", "game-based", "competitive"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Attacker vs defender to goal - develops individual attacking skills and 1v1 defending technique in competitive, game-realistic scenarios.",
          keyPhrases: [
            "Attack them - make them backpedal!",
            "Slow-slow-FAST!",
            "Side-on, one foot ahead!",
            "Don't dive in - wait for the bad touch!",
          ],
          setupDiagram: "15x20 pace area, goal at one end, defender 10 paces from goal, attacker 20 paces",
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
            mindset: "This is COMPETITIVE and should feel like a game. Keep energy high, pace fast. Both attackers and defenders need positive reinforcement - everyone struggles at first.",
          },
          segments: [
            {
              phase: "Explain & Demo",
              duration: "2 minutes",
              coachPosition: "Side of playing area",
              script: "Two lines - attackers and defenders. Explain: Coach plays ball, attacker scores, defender wins ball out. Demo with two players. Keep explanation short, let them learn by doing.",
              anticipatedResponses: {
                "What if it goes out?": "Dead ball - next pair, new rep.",
                "Can defender score?": "Not yet - but we'll add that soon!",
                "Who wins if time runs out?": "Defender wins - attacker must score.",
              },
            },
            {
              phase: "Round 1 - Basic 1v1",
              duration: "4 minutes",
              coachPosition: "Behind attacker line with balls",
              script: "Serve balls to attackers. 'Ready? GO!' Keep pace high - next pair immediately ready. General encouragement both sides.",
              troubleshooting: {
                "Attackers always losing": ["Make area wider", "Defender starts deeper", "Passive defense"],
                "Defenders always losing": ["Narrower area", "Defender starts closer", "Focus on patience message"],
              },
            },
            {
              phase: "Coaching Moment - Attacking",
              duration: "90 seconds",
              coachPosition: "Gathered with attackers",
              script: "Three keys: Run AT defender, change speed/direction, accelerate into space. Demo the slow-slow-FAST. Challenge them to try one.",
            },
            {
              phase: "Round 2 - Attacking Focus",
              duration: "3 minutes",
              coachPosition: "Behind attacker line",
              script: "Resume 1v1s. Specifically praise attacking concepts: 'Nice change of speed!' 'Good - attacked them!'",
            },
            {
              phase: "Coaching Moment - Defending",
              duration: "90 seconds",
              coachPosition: "Gathered with defenders",
              script: "Three keys: Fast approach then slow, side-on position, patience for bad touch. Demo body position. Challenge them.",
            },
            {
              phase: "Round 3 - Defending Focus",
              duration: "3 minutes",
              coachPosition: "Behind attacker line",
              script: "Resume 1v1s. Specifically praise defending concepts: 'Great patience!' 'Nice approach!'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            attackersDominating: {
              symptoms: ["Goals every time", "Defenders frustrated", "No challenge"],
              solutions: ["Narrower area", "Defender starts closer", "Add time pressure", "Better attacker serves worse defender"],
            },
            defendersDominating: {
              symptoms: ["No goals", "Attackers frustrated", "Defenders diving in winning"],
              solutions: ["Wider area", "Defender starts deeper", "Require passive defense first", "Allow head start"],
            },
          },
          playerBehavior: {
            afraidToAttack: {
              symptoms: ["Passing back to coach", "Running around not at", "Hesitant"],
              approach: "Pair with passive defender first. Celebrate ANY attempt to take on. Build confidence gradually.",
            },
            overlyAggressive: {
              symptoms: ["Slide tackling", "Dangerous play", "Fouls constantly"],
              approach: "Immediate stop. Demonstrate legal defending. 'Hard and fair, not hard and foul.' Repeat offense = sit out.",
            },
            gettingFrustrated: {
              symptoms: ["Giving up", "Emotional reactions", "Blaming partner/coach"],
              approach: "Quick private word. Switch role that's easier. Pair with supportive opponent. Focus on one small success.",
            },
          },
          environmentalIssues: {
            spaceTooSmall: {
              symptoms: ["No room to attack", "Defender always wins"],
              solution: "Expand area. If space limited, reduce to fewer pairs.",
            },
            noGoal: {
              symptoms: ["No clear target"],
              solution: "Create cone goal 3 paces wide. Ball must go through below knee height.",
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "1v1 Attacking",
              domain: "Technical",
              howItDevelops: "Players learn to take on defenders using moves, changes of pace, and body feints in realistic game situations.",
              levelIndicators: {
                1: "Cannot beat a defender; predictable; no confidence",
                2: "Occasionally beats passive defenders; limited repertoire",
                3: "Has 1-2 moves; can beat defenders in favorable situations",
                4: "Multiple moves; reads defender; consistent success",
                5: "Beats defenders at will; can score under pressure; creates own chances",
              },
              assessmentNotes: "Look for variety in approach, not just success rate. A player with multiple options is developing even if not always succeeding.",
            },
            {
              skill: "1v1 Defending",
              domain: "Technical/Tactical",
              howItDevelops: "Players learn approach speed, body positioning, patience, and timing of tackle in realistic pressure.",
              levelIndicators: {
                1: "Dives in constantly; easily beaten; no technique",
                2: "Understands patience but can't execute; poor position",
                3: "Good approach; side-on; sometimes wins ball cleanly",
                4: "Consistent technique; forces attacker wide; wins most",
                5: "Reads attacker; wins ball and transitions; excellent timing",
              },
              assessmentNotes: "Patience is the hardest skill. Players who wait for the right moment show tactical understanding even if they don't always win.",
            },
          ],
          secondarySkills: [
            {
              skill: "Finishing Under Pressure",
              domain: "Technical",
              howItDevelops: "Must finish after beating defender - composure and technique in decisive moment.",
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
              howItDevelops: "Legal, effective tackling - poke tackles, block tackles, timing.",
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
          whyThisActivity: "1v1 situations are the moments that decide games. This activity isolates the key skills - attacking ability to create chances, defending ability to prevent them - in high-repetition, game-realistic format. Both skills are essential and players must practice both roles.",
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
              { activity: "Shark Attack", reason: "Dribbling under pressure without goal" },
              { activity: "Cone Moves", reason: "Technical moves without defender" },
            ],
            after: [
              { activity: "2v2 to Goals", reason: "Apply skills with teammate support" },
              { activity: "Small-Sided Games", reason: "Full game context" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Keep playful, celebrate all attempts",
              keyPhrases: ["Try to get past!", "Superheroes defend!", "Can you score?"],
              avoidSaying: ["You need to work on your moves (too abstract)", "Stay side-on (too technical)"],
              duration: "5-7 minutes max (short attention)",
              simplifications: ["Passive defense", "Wide area", "Praise all attempts"],
            },
            "ages9to11": {
              approach: "Technical focus, develop vocabulary",
              keyPhrases: ["Change speed!", "Side-on body position!", "Patience!"],
              challenges: ["Time pressure", "Counter-attack", "Specific moves required"],
              duration: "12-15 minutes with coaching breaks",
            },
            "ages12to14": {
              approach: "Game-realistic pressure, self-analysis",
              keyPhrases: ["What did the defender give you?", "When was the right moment to tackle?"],
              challenges: ["Smaller space", "Higher pressure", "Self-evaluation"],
              coachRole: "Ask questions, let them solve problems",
            },
          },
          commonMisconceptions: {
            "Some players are just not 1v1 players": "All players need 1v1 skills. Midfielders face 1v1s constantly. It's trainable.",
            "1v1 drills encourage selfish play": "Players learn WHEN to take on and when to pass. 1v1 is a tool, not a style.",
            "Focus on attack or defense, not both": "Players need both. Game situations require both. Always rotate roles.",
          },
        },

        parentCommunication: {
          ifAsked: "1v1 to Goal teaches your child how to beat defenders and how to stop attackers - both essential soccer skills. Every game has dozens of 1v1 moments. We practice both attacking (using moves, changes of speed) and defending (patience, body position, timing).",
          newsletter: "This week: 1v1 to Goal! Your child practiced taking on defenders and stopping attackers. Watch for them trying new moves in games - they might not work every time, but that willingness to take on players is exactly what we want to develop!",
          whatToWatchFor: [
            "Does your child attempt to dribble past defenders? (confidence)",
            "Do they stay patient when defending or dive in?",
            "Can they change speed or direction to beat players?",
            "Do they get frustrated when beaten, or try again?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Slide tackles causing injury", prevention: "No slide tackles rule - stay on feet", response: "Immediate stop if occurs, yellow card warning, repeat = out" },
            { risk: "Collision at speed", prevention: "Adequate space, awareness emphasis", response: "Check both players, review safer approach" },
            { risk: "Ball to face at close range", prevention: "Shooting from distance, awareness of opponent position", response: "Ice if needed, review shooting safety" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Pair similar physical abilities when possible, or give smaller player advantages (head start, passive defense)",
            newPlayers: "Start against experienced but supportive opponent, passive defense first round",
            anxiousPlayers: "Start as defender (reactive role), transition to attacker once confident",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 3: RONDO 4v1
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Rondo 4v1",
      slug: "rondo-4v1-v2",
      description: "Classic possession game with four players keeping the ball from one defender in a confined space. Develops passing accuracy, receiving technique, body positioning, support angles, and the fundamental ability to keep possession under pressure.",
      activityType: "skill-drill" as const,
      difficulty: "intermediate" as const,
      minPlayers: 5,
      maxPlayers: 20,
      durationMinutes: 12,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 ball per group
□ 4 cones per group (different color from other groups)
□ 1 pinnie per defender
□ Space for multiple groups (recommended: 3-4 groups)

SPACE: 8x8 paces per group (adjust based on ability)

SETUP STEPS
1. Create 8x8 pace squares with cones
2. Four players on corners/edges, one defender in middle
3. Defender wears pinnie
4. Groups spaced so balls don't interfere
5. Spare balls nearby for quick restarts

DIAGRAM
┌─────────────────────────────────────────────────────┐
│                                                     │
│    ▲──────────▲         ▲──────────▲               │
│    │    ●     │         │    ●     │               │
│    │  ○   ○   │         │  ○   ○   │               │  Two groups
│    │    ○     │         │    ○     │               │  shown
│    ▲──────────▲         ▲──────────▲               │
│       8x8                  8x8                      │
│       paces                paces                    │
│                                                     │
└─────────────────────────────────────────────────────┘

▲=cone  ○=possession player  ●=defender (pinnie)`,

      howToPlay: `PHASE 1: EXPLAIN & DEMONSTRATE (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: At one rondo grid, other groups watching

SAY: "This is Rondo - the most famous soccer training game in the world. Barcelona, Manchester City, every top team does this."

SETUP ONE GROUP and demonstrate:

SAY: "Four players keep the ball. One defender tries to win it. Simple rules:
1. If defender wins ball or it goes out: Whoever made the mistake becomes defender
2. Maximum 2 touches (start with unlimited)
3. You CAN'T pass to person next to you through the middle - the defender would intercept"

DEMONSTRATE with 4 players:
- Show good passing
- Show body position to receive
- Show what happens when defender wins it

KEY POINTS during demo:
• "See how they're OPEN to receive - not facing the passer?"
• "Notice the pass is firm enough to reach but not too hard"
• "Watch how quickly they move the ball when pressure comes"


PHASE 2: FREE PLAY ROUND (3 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Split into groups of 5. "GO - let's see what happens!"

Coach Position: Moving between groups

OBSERVE FOR:
□ Are possessors opening their body or back to play?
□ Is defender working or standing in middle?
□ Is ball moving quickly or slowly?
□ Quality of first touch - under control or bouncing away?

KEEP TRACK: Who's struggling as defender too long? (Group not supporting properly or their own skill?)


PHASE 3: COACHING MOMENT - RECEIVING (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "FREEZE! Everyone come in."

ASK: "When you have the ball, can you see everyone?"
Key point: Body position when receiving determines options.

TEACH: "Before the ball arrives, OPEN YOUR BODY - hips facing the field, not the passer. Now you can see everyone AND pass either direction."

DEMO: Show closed (can only pass back) vs open (can pass anywhere).

SAY: "Watch me receive... closed [show limited options]... open [show all options]. HUGE difference."


PHASE 4: PLAY WITH BODY POSITION FOCUS (3 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resume rondos. Coach moves between groups praising:

• "Great body position!"
• "I can see your chest - that's open!"
• "Check your hips before the ball comes!"

SPECIFIC CORRECTION: When you see closed body position: "OPEN! Show me your belly button toward the middle!"


PHASE 5: COACHING MOMENT - DEFENDER (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Defenders - how do you win the ball?"
Listen for: Go toward ball, cut passing lanes, wait for bad touch

TEACH: "Best defenders in rondo do TWO things:
1. Cut off one passing lane (eliminate one option)
2. SPRINT when the ball is traveling (that's when possessor can't escape)"

DEMO: Show cutting passing lane, then bursting as ball travels.

SAY: "Don't jog in the middle - be a pest! Make them uncomfortable!"


PHASE 6: PLAY WITH DEFENDER FOCUS (2 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resume rondos. Now praise defenders:

• "Great pressure on the ball!"
• "Yes! You cut that lane!"
• "Good burst while ball was moving!"


WRAP UP (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Gather quickly.

SAY: "Rondo teaches possession soccer - quick passes, good body position, moving the ball faster than defender can move. The best teams in the world warm up with this every single day. Remember: OPEN body, FIRM passes, MOVE the defender. Water break!"`,

      diagram: `BODY POSITION
    CLOSED (Bad)          OPEN (Good)
    ┌─────────┐          ┌─────────┐
    │    ↑    │          │ ←  ●  → │
    │    ●    │          │    ↑    │
    │    ↓    │          │    ↓    │
    │Can only │          │Can pass │
    │pass back│          │anywhere │
    └─────────┘          └─────────┘

SUPPORT POSITIONS
        ○ ←─ can receive
        │
    ○───●───○
        │
        ○ ←─ can receive

All 4 should be available options, not in defender's shadow`,

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
        { name: "3v1 (Easier)", description: "Three possessors, one defender. Larger grid (10x10). Easier to maintain possession.", difficulty: "beginner" },
        { name: "4v2", description: "Four possessors, two defenders. Same grid. Much harder - requires quicker decisions.", difficulty: "advanced" },
        { name: "5v2", description: "Five possessors in larger grid, two defenders. More game-realistic numbers.", difficulty: "advanced" },
        { name: "Two Touch Maximum", description: "Can only take two touches - forces quicker decisions and better body position.", difficulty: "intermediate" },
        { name: "One Touch Bonus", description: "Count consecutive one-touch passes. High score wins. Develops quick play.", difficulty: "advanced" },
        { name: "Transition Rondo", description: "If defender wins, they immediately become attacker and previous passer becomes defender. Quicker transitions.", difficulty: "advanced" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Defender wins constantly
• Possessors stressed, not enjoying
• Poor technique breaking down

SOLUTIONS:
• Make grid bigger (10x10 instead of 8x8)
• Do 3v1 instead of 4v1
• Allow unlimited touches
• Let defender only walk (no running)
• Coach plays as 5th possessor temporarily`,

      makeHarder: `SIGNS THEY'RE READY:
• Possessors keeping ball easily
• Defender can't get near ball
• Players asking for more challenge

SOLUTIONS:
• Make grid smaller (6x6)
• Two touch maximum
• Add second defender (4v2)
• One touch bonus points
• Timed: How many passes in 60 seconds?`,

      equipmentNeeded: ["1 ball per group", "4 cones per group", "1 pinnie per defender"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [skillBuilding.id, gameReadiness?.id].filter(Boolean) as string[],
      tags: ["rondo", "possession", "passing", "receiving", "body-position", "support", "tactical", "game-based"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Four players keep ball from one defender in small grid - develops passing, receiving, body position, and possession under pressure.",
          keyPhrases: [
            "Open your body - show me your belly button!",
            "Firm but friendly passes!",
            "Move the ball faster than they move!",
            "Hunt! Don't jog!",
          ],
          setupDiagram: "8x8 pace grid, 4 corners with players, 1 defender in middle with pinnie",
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
            mindset: "Rondo is about QUALITY of technique, not just keeping possession. Coach the details: body position, touch, pass weight. Celebrate good technique even when ball is lost.",
          },
          segments: [
            {
              phase: "Explain & Demo",
              duration: "2 minutes",
              coachPosition: "At one grid, others watching",
              script: "Frame it: 'Every top team does this.' Demo with 4 players. Show: passing, body position, what happens when defender wins. Highlight open vs closed body.",
              anticipatedResponses: {
                "What if ball goes out?": "Same as defender winning - whoever hit it out becomes defender.",
                "Can I pass to anyone?": "Yes! But not through the middle to neighbor - too risky.",
                "What if defender never gets it?": "Then you're doing great! We'll add challenges.",
              },
            },
            {
              phase: "Free Play",
              duration: "3 minutes",
              coachPosition: "Moving between groups",
              script: "Let them play. Observe: body position, defender effort, ball speed, first touch quality. Note who needs coaching.",
              troubleshooting: {
                "One group losing ball constantly": ["Make their grid bigger", "Coach steps in as 5th", "Check body positions"],
                "Defender stuck too long": ["Rotate defender after 60 seconds regardless", "Coach possession quality"],
              },
            },
            {
              phase: "Coaching Moment - Receiving",
              duration: "90 seconds",
              coachPosition: "Center, all groups listening",
              script: "FREEZE! Teach body position: open = belly button to middle = all options. Demo closed vs open. Huge difference in options.",
            },
            {
              phase: "Play with Body Focus",
              duration: "3 minutes",
              coachPosition: "Moving between groups",
              script: "Resume play. Specifically coach body position. 'Open up!' 'Check your hips!' 'Great body position!'",
            },
            {
              phase: "Coaching Moment - Defender",
              duration: "90 seconds",
              coachPosition: "Center",
              script: "Teach defender: cut lanes, burst when ball travels. Demo cutting lane then sprinting. 'Don't jog - be a pest!'",
            },
            {
              phase: "Play with Defender Focus",
              duration: "2 minutes",
              coachPosition: "Moving between groups",
              script: "Resume play. Now praise defenders: 'Great pressure!' 'You cut that lane!' 'Good burst!'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            possessorsDominating: {
              symptoms: ["Defender never touches ball", "Too easy", "Players disengaged"],
              solutions: ["Smaller grid", "Add second defender", "Two touch limit", "Better defender in"],
            },
            defenderDominating: {
              symptoms: ["Constant turnovers", "Frustration", "No rhythm"],
              solutions: ["Bigger grid", "Remove to 3v1", "Unlimited touches", "Defender must hop"],
            },
          },
          playerBehavior: {
            notTrying: {
              symptoms: ["Lazy passes", "Not moving", "Disengaged"],
              approach: "Add competition: 'Which group can get 10 passes?' Give defender points for wins.",
            },
            tooCompetitive: {
              symptoms: ["Arguments about rules", "Excessive celebrating", "Teasing stuck defender"],
              approach: "Remind: 'It's training, not tournament.' Rotate groups. Remove points if needed.",
            },
            defenderGivingUp: {
              symptoms: ["Standing in middle", "Not trying", "Wants out"],
              approach: "Time limit: 'Defender switches every 30 seconds regardless.' Teach defender technique.",
            },
          },
          technicalIssues: {
            poorFirstTouch: {
              symptoms: ["Ball bouncing away", "Giving defender time", "Losing control"],
              solutions: ["Practice receiving warm-up first", "Bigger grid (more time)", "Emphasize cushion"],
            },
            poorPassWeight: {
              symptoms: ["Passes too soft (intercepted)", "Passes too hard (can't control)"],
              solutions: ["Demo 'firm but friendly'", "Practice passing pairs first", "Verbal cue on each pass"],
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Receiving / First Touch",
              domain: "Technical",
              howItDevelops: "Constant receiving under pressure develops quality first touch and body positioning habits.",
              levelIndicators: {
                1: "Ball bounces away; can't control under pressure",
                2: "Controls eventually but slow; gives defender time",
                3: "Clean first touch most of time; occasional error under pressure",
                4: "Excellent touch; sets up next action; rarely loses control",
                5: "Perfect touch every time; can receive any ball; under any pressure",
              },
              assessmentNotes: "Watch the moment of reception. Where does the ball go? Can they pass immediately after?",
            },
            {
              skill: "Passing Accuracy & Weight",
              domain: "Technical",
              howItDevelops: "Every pass must be perfect or defender wins. Develops precise, firm passing.",
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
              howItDevelops: "Must open body before receiving to have options - develops scanning and awareness.",
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
              howItDevelops: "Players learn to position where they can receive - not hidden behind defender.",
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
              howItDevelops: "Defender learns to read passing lanes, close quickly, and pressure ball.",
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
          whyThisActivity: "Rondo is the foundational possession exercise. It teaches the core skills - receiving, passing, positioning - in a game-realistic pressure environment. The small space forces quality. The constant repetition builds habits. There's a reason every top team uses it daily.",
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
              { activity: "Passing Pairs", reason: "Basic technique without pressure" },
              { activity: "Triangle Passing", reason: "Movement after passing, no defender" },
            ],
            after: [
              { activity: "5v5 Small-Sided Game", reason: "Apply possession in game" },
              { activity: "Possession Games 6v4", reason: "Numbers advantage possession with goals" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Modified - bigger space, simpler rules",
              keyPhrases: ["Keep away!", "Pass it quick!", "Can you get it?"],
              avoidSaying: ["Open your body (too abstract)", "Support angle"],
              duration: "5-6 minutes max",
              simplifications: ["12x12 grid", "3v1", "Unlimited touches", "No middle pass rule"],
            },
            "ages9to11": {
              approach: "Full rondo with technical coaching",
              keyPhrases: ["Open your body!", "Firm pass!", "Move it quick!", "Hunt!"],
              challenges: ["Standard 8x8", "Two touch max", "One-touch bonus"],
              duration: "10-12 minutes with coaching stops",
            },
            "ages12to14": {
              approach: "High intensity, player-led",
              keyPhrases: ["Why did you lose it?", "What did defender do well?"],
              challenges: ["Small grid (6x6)", "4v2", "Competition: passes in 60 seconds"],
              coachRole: "Observe, ask questions, let players problem-solve",
            },
          },
          commonMisconceptions: {
            "It's just keep away": "Rondo teaches specific technical and tactical skills - body position, pass weight, support - not just keeping possession.",
            "Defender just runs around": "Good rondo coaches BOTH roles. Defender learns pressing, lane cutting, reading. Both roles matter.",
            "Too small to be realistic": "The tight space FORCES quality. Game situations have tight moments. Rondo prepares for them.",
          },
        },

        parentCommunication: {
          ifAsked: "Rondo is the most famous soccer training game in the world - Barcelona, Manchester City, every top team does it. Four players keep the ball from one defender in a small space. It teaches quick passing, good first touch, and body positioning. Your child is learning how the pros train!",
          newsletter: "This week: Rondo! This classic game teaches possession soccer - quick passes, good body position, moving the ball faster than defenders can move. Watch Barcelona warm up on YouTube and you'll see them playing rondo!",
          whatToWatchFor: [
            "Does your child 'open up' to receive (body facing field, not passer)?",
            "Are their passes firm enough to get there?",
            "Do they stay calm under pressure or panic?",
            "Are they hunting when defending or just jogging?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions in small space", prevention: "Appropriate grid size, awareness emphasis", response: "Check players, adjust grid if needed" },
            { risk: "Ankle injuries from quick turns", prevention: "Proper warm-up before rondo, good surface", response: "Rest, ice if needed, return only when ready" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Adjust grid size, pair similar abilities in groups",
            newPlayers: "Place with supportive players, allow more touches, celebrate any success",
            anxiousPlayers: "Start as possessor (more support), ensure encouraging group",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 4: SMALL-SIDED GAME 5v5
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Small-Sided Game 5v5",
      slug: "small-sided-game-5v5-v2",
      description: "Structured 5v5 game with specific tactical constraints to develop game intelligence. Uses conditions like limited touches, directional play, or transition rules to focus players on specific learning outcomes while maintaining game realism.",
      activityType: "game-based" as const,
      difficulty: "intermediate" as const,
      minPlayers: 10,
      maxPlayers: 14,
      durationMinutes: 20,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 2 goals (mini goals 4-5 feet work best, or cones)
□ 8 cones for boundaries
□ 2 sets of pinnies (different colors)
□ 4-6 balls (for quick restart)
□ Optional: 2 different colored cones to mark special zones

SPACE: 40x30 paces (length x width)

SETUP STEPS
1. Place goals at each end of 40x30 area
2. Mark boundaries with corner cones
3. Split into two teams of 5 (or 5v5 + subs)
4. Give pinnies to one team
5. Place balls behind each goal for quick restarts
6. Optional: Mark "end zones" if using that variation

DIAGRAM
┌────────────────────────────────────────────────────┐
│    ┌───┐                               ┌───┐      │
│    │ G │                               │ G │      │
│    └───┘                               └───┘      │
│ ▲                                             ▲   │
│                                                   │
│                                                   │
│                    40 paces                       │
│                                                   │
│                                                   │
│                                                   │
│ ▲                                             ▲   │
└────────────────────────────────────────────────────┘
              30 paces

▲=corner cones  G=goal  (4-5 feet wide)
5v5 in this space, or 6v6 if numbers allow`,

      howToPlay: `PHASE 1: FREE PLAY OBSERVATION (4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Sideline, middle of field

SAY: "5v5! Regular game rules. Out of bounds = throw-in or goal kick. Let's see what you've got. GO!"

OBSERVE WITHOUT COACHING. Watch for:
□ Do they look to pass or only dribble?
□ Do they support the ball or watch?
□ Do they spread out or bunch?
□ How do they transition (attack → defense)?

This free play reveals what they understand and what needs coaching.

AFTER 4 MINUTES: "FREEZE! Come in for a minute."


PHASE 2: COACHING MOMENT #1 (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Based on what you observed, choose ONE thing to teach:

OPTION A - If bunching / not spreading:
SAY: "When we have the ball, where should players without the ball go?"
Wait for: "Space" / "Away from defenders"
TEACH: "Width and length! Imagine you're stretching the field. Make yourself available to help."

OPTION B - If only dribbling / not passing:
SAY: "What's faster - you dribbling or the ball being passed?"
Wait for: "Passing"
TEACH: "Move the ball! When you have options, play quickly. Dribble when there's no pass, pass when there is."

OPTION C - If poor transition:
SAY: "What should we do the INSTANT we lose the ball?"
Wait for: "Get it back" / "Defend"
TEACH: "WIN IT BACK! 3 seconds - everyone pressure for 3 seconds when we lose it."

Pick ONE focus. Don't overwhelm with multiple concepts.


PHASE 3: CONDITIONED GAME - ROUND 1 (5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add a CONDITION related to your coaching point:

CONDITION A - Spreading:
"Goals only count if ALL attacking players are in opponent's half when goal is scored."
This forces width/length to create space.

CONDITION B - Passing:
"Maximum 4 touches per player. Take more than 4 and other team gets ball."
This forces looking up and passing.

CONDITION C - Transition:
"If you win the ball and score within 5 seconds, it counts as 2 goals."
This rewards quick transition play.

SAY: "Same game, but now [explain condition]. Let's see how it changes things. GO!"

COACH DURING PLAY:
• Reinforce the focus: "Great - you spread the field!"
• Remind of condition: "Remember - 4 touch max!"
• Celebrate when condition is met: "DOUBLE GOAL! Great transition!"


PHASE 4: COACHING MOMENT #2 (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "FREEZE! Come in."

ASK: "How did the condition change how you played?"
Listen for their understanding of WHY the condition helped.

TEACH: Connect to real game:
• "That spreading you did? That's exactly what to do in your games on Saturday."
• "Looking up to find the pass? That's game intelligence."
• "Winning it back quickly? That's how championship teams play."

Add or modify condition for next round:

PROGRESSION OPTIONS:
• Keep same condition but smaller space (harder)
• Change to different condition
• Remove condition but challenge them to keep the habit


PHASE 5: CONDITIONED GAME - ROUND 2 (5 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Run second round with same or modified condition.

COACHING CONTINUES:
• Stay focused on ONE concept
• Celebrate good decisions
• Question poor decisions: "Was there a pass there?"

Keep score - competition matters!


PHASE 6: FREE PLAY FINISH (3 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Last 3 minutes - NO CONDITIONS. Regular game. But I want to see you KEEP the habit we practiced. Show me you learned something!"

OBSERVE: Are they maintaining the behavior without the condition?

This tests if learning has stuck.


WRAP UP (1 minute)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Freeze! Great session."

ASK: "What's ONE thing you'll remember from this game?"
Listen for: Focus concept (spreading, passing, transition)

SAY: "I saw [specific example of good play]. That's GAME INTELLIGENCE - making good decisions under pressure. That's what separates good players from great ones. Water break!"`,

      diagram: `FIELD LAYOUT
┌────────────────────────────────────────────────────┐
│         ┌───┐                      ┌───┐          │
│         │ G │                      │ G │          │
│         └───┘                      └───┘          │
│                                                   │
│    TEAM A                          TEAM B         │
│    (5 players)                     (5 players)    │
│                                                   │
│                  40 x 30 paces                    │
│                                                   │
│    Formation suggestions:                         │
│    1-2-2 (diamond)                               │
│    or 1-3-1                                      │
│                                                   │
└────────────────────────────────────────────────────┘

SPACING CONCEPT
    Good (spread)           Bad (bunched)
┌────────────────────┐   ┌────────────────────┐
│  ○           ○     │   │                    │
│       ○            │   │     ○○○○○          │
│  ○           ○     │   │      (ball)        │
│                    │   │                    │
│ Uses whole field   │   │ Easy to defend     │
└────────────────────┘   └────────────────────┘`,

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
        { name: "Touch Restriction", description: "Maximum touches (4, 3, or 2 touch). Forces quick play and looking up.", difficulty: "intermediate" },
        { name: "Transition Goals", description: "Goals within 5 seconds of winning ball count double. Rewards quick transition.", difficulty: "intermediate" },
        { name: "All In To Score", description: "Goal only counts if all attackers in opponent's half. Forces forward support.", difficulty: "intermediate" },
        { name: "End Zone Game", description: "Score by dribbling into end zone (not goals). Encourages penetrating dribble.", difficulty: "intermediate" },
        { name: "Target Player", description: "Must play through target player before shooting. Develops build-up patterns.", difficulty: "advanced" },
        { name: "Counter-Attack", description: "One team defends deep, wins ball, and attacks. Practice defensive organization and transitions.", difficulty: "advanced" },
        { name: "Numerical Overload", description: "5v4 or 6v4 to practice playing with/against advantage. Possession team must finish quickly.", difficulty: "advanced" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Can't maintain possession at all
• Condition too confusing
• Chaotic, no shape or purpose

SOLUTIONS:
• Bigger field (more time on ball)
• Remove condition temporarily
• Play 5v4 (possession advantage)
• Slow the game down (walking soccer)
• Add neutral player who plays for whoever has ball`,

      makeHarder: `SIGNS THEY'RE READY:
• Executing condition easily
• Good decisions, good spacing
• Asking for more challenge

SOLUTIONS:
• Smaller field (less time/space)
• Stricter touch limit (2 touch)
• Multiple conditions combined
• Equal numbers or down a player
• Time pressure on goals`,

      equipmentNeeded: ["2 goals", "8 cones", "2 sets of pinnies", "4-6 balls"],
      spaceRequired: "large",
      indoorSuitable: false,
      appropriateStageIds: [skillBuilding.id, gameReadiness?.id].filter(Boolean) as string[],
      tags: ["game", "5v5", "small-sided", "tactical", "decision-making", "transition", "possession", "conditioned"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Structured 5v5 game with specific conditions that force players to practice tactical concepts in game-realistic environment.",
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
            mindset: "This is a GAME with teaching moments, not a drill that looks like a game. Let them play. Observe. Coach deliberately. One concept at a time. Conditions should HELP them, not confuse them.",
          },
          segments: [
            {
              phase: "Free Play Observation",
              duration: "4 minutes",
              coachPosition: "Sideline, middle of field",
              script: "Let them play - no coaching. Watch: passing vs dribbling, spacing, transition, communication. This reveals what to teach.",
              anticipatedResponses: {
                "What are the rules?": "Regular soccer. Out = throw-in or goal kick. Play!",
                "Do we have positions?": "Figure it out together. Just don't all stand in one spot.",
              },
            },
            {
              phase: "Coaching Moment #1",
              duration: "90 seconds",
              coachPosition: "Center, teams gathered",
              script: "Based on observation, teach ONE concept. Spacing: 'Stretch the field.' Passing: 'Ball faster than dribbling.' Transition: 'Win it back in 3 seconds.' Choose based on what you saw.",
              troubleshooting: {
                "Can't decide what to coach": ["Pick most obvious issue", "When in doubt, coach spacing"],
                "Players disagree with feedback": ["Show them: 'Watch this' and point out example", "Ask questions instead of telling"],
              },
            },
            {
              phase: "Conditioned Game Round 1",
              duration: "5 minutes",
              coachPosition: "Sideline, moving",
              script: "Add condition matching your coaching point. Play game. Coach during play: reinforce focus, celebrate good decisions, remind of condition.",
            },
            {
              phase: "Coaching Moment #2",
              duration: "90 seconds",
              coachPosition: "Center",
              script: "'How did condition change play?' Connect to real games. Decide: same condition (harder space), new condition, or remove.",
            },
            {
              phase: "Conditioned Game Round 2",
              duration: "5 minutes",
              coachPosition: "Sideline",
              script: "Continue with same or modified condition. Keep coaching same concept. Competition matters - keep score!",
            },
            {
              phase: "Free Play Finish",
              duration: "3 minutes",
              coachPosition: "Sideline",
              script: "Remove all conditions. 'Show me you learned something!' Watch if behaviors stick without condition forcing it.",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            unevenTeams: {
              symptoms: ["One team dominating", "Score very lopsided", "Weaker team disengaged"],
              solutions: ["Swap players to balance", "Add condition favoring weaker team", "Play rolling subs", "Coach joins weaker team briefly"],
            },
            chaosNoStructure: {
              symptoms: ["Ball watching", "No positions", "Random running"],
              solutions: ["Pause and set simple formation (1-2-2)", "Assign roles briefly", "Start slower", "Condition that requires structure"],
            },
          },
          playerBehavior: {
            dominantPlayers: {
              symptoms: ["One player keeps ball", "Others don't touch it", "Ball hog complaints"],
              approach: "Touch restriction: 3 or 2 touch max. 'Goals only count if 3 different players touch ball.' Celebrate passing.",
            },
            disengagedPlayers: {
              symptoms: ["Standing watching", "Not getting involved", "Looks bored"],
              approach: "Direct role: 'You're our outlet - always available.' Praise when they're in good position. Condition requiring everyone involved.",
            },
            overlyPhysical: {
              symptoms: ["Pushing", "Dangerous tackles", "Injury risk"],
              approach: "Immediate stop. Clear rule: 'Hard and fair.' Remove player briefly if continues. No tolerance for dangerous play.",
            },
          },
          conditionIssues: {
            conditionTooConfusing: {
              symptoms: ["Constant questions", "Not following", "Frustration"],
              solution: "Simplify. One simple rule. Demo it. If still confusing, remove condition.",
            },
            conditionNotWorking: {
              symptoms: ["No change in behavior", "Ignoring condition"],
              solution: "Make consequence clear. Or choose different condition. Maybe players need prerequisite skills first.",
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Game Intelligence / Decision Making",
              domain: "Tactical",
              howItDevelops: "Game situations force quick decisions. Conditions focus attention on specific decision types. Repetition builds pattern recognition.",
              levelIndicators: {
                1: "Random decisions; no awareness of options",
                2: "Sometimes makes good decisions but inconsistent",
                3: "Usually chooses appropriate action; reads basic situations",
                4: "Consistently good decisions; anticipates play; creates advantages",
                5: "Excellent game reader; manipulates opponents; makes others better",
              },
              assessmentNotes: "Watch pattern of decisions over time, not individual moments. Good decisions sometimes fail; bad decisions sometimes succeed.",
            },
            {
              skill: "Tactical Awareness / Positioning",
              domain: "Tactical",
              howItDevelops: "Conditions like 'all in half' or spacing emphasis develop understanding of where to be.",
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
              howItDevelops: "Conditions rewarding quick transition develop habits of reacting to turnovers.",
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
              howItDevelops: "Game pressure requires verbal and non-verbal communication with teammates.",
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
              howItDevelops: "All technical skills used in game context with time/space/opponent pressure.",
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
          whyThisActivity: "Small-sided games are where learning transfers to match play. Technical and tactical skills mean nothing if they can't be applied in games. The controlled environment (conditions, coaching, appropriate numbers) accelerates game intelligence development while maintaining realism.",
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
              { activity: "Rondo 4v1", reason: "Possession concepts in smaller context" },
              { activity: "3v2 Transition", reason: "Attacking/defending with advantage" },
            ],
            after: [
              { activity: "7v7 Games", reason: "Larger numbers, more complexity" },
              { activity: "11v11 Scrimmage", reason: "Full game application" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Smaller numbers (3v3, 4v4), simple conditions only",
              keyPhrases: ["Spread out!", "Help your friend!", "Great teamwork!"],
              avoidSaying: ["Tactical terms they won't understand"],
              duration: "10-12 minutes max",
              simplifications: ["4v4 on smaller field", "One simple condition max", "Lots of praise"],
            },
            "ages9to11": {
              approach: "Full 5v5 with deliberate conditions",
              keyPhrases: ["What's the best option?", "Why did that work?", "Read the game!"],
              challenges: ["Multiple conditions", "Stricter touch limits", "Position-specific challenges"],
              duration: "15-20 minutes with coaching stops",
            },
            "ages12to14": {
              approach: "Player-led with complex conditions",
              keyPhrases: ["Solve this problem:", "What do you see?", "How can you adjust?"],
              challenges: ["Player-designed conditions", "Self-coaching between points", "Video review"],
              coachRole: "Facilitate analysis, ask questions, minimal direct instruction",
            },
          },
          commonMisconceptions: {
            "Just let them play - they'll figure it out": "Guided discovery through conditions accelerates learning. Free play alone can reinforce bad habits.",
            "Conditions are artificial": "Conditions isolate specific learning outcomes. They're training wheels that develop habits that persist without them.",
            "Win at all costs": "Development > Results at this age. Use conditions that might sacrifice winning for learning.",
          },
        },

        parentCommunication: {
          ifAsked: "Our 5v5 games use 'conditions' - special rules that force players to practice specific skills. For example, limiting touches forces passing. These conditions develop game intelligence - the ability to make good decisions quickly. It's how professional academies train.",
          newsletter: "This week: Small-Sided Games with conditions! We played 5v5 but added rules like 'touch limits' and 'transition goals' that force good habits. Ask your child what condition they played with and why it helped them improve!",
          whatToWatchFor: [
            "Does your child move when they don't have the ball?",
            "Do they look for passes or only dribble?",
            "Do they react quickly when their team loses possession?",
            "Are they communicating with teammates?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions from opposite directions", prevention: "Appropriate space, heads up emphasis", response: "Check players, review spacing" },
            { risk: "Slide tackles", prevention: "No sliding rule, stay on feet", response: "Immediate stop, remove player if repeated" },
            { risk: "Goal post collisions", prevention: "Padded posts if possible, awareness around goal", response: "Check player, adjust goal position if needed" },
            { risk: "Overexertion", prevention: "Water breaks, subs if available", response: "Rest player, hydrate, monitor return" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Balance teams for fair competition, give meaningful roles to all abilities",
            newPlayers: "Team with supportive experienced players, simple conditions first",
            anxiousPlayers: "Positive team environment, start with easier conditions, praise effort",
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
  ];

  // Insert activities
  for (const activity of comprehensiveActivities) {
    await db.insert(activities).values(activity).onConflictDoNothing();
    console.log(`  ✓ ${activity.name}`);
  }

  console.log(`\nSeeded ${comprehensiveActivities.length} comprehensive skill-building activities`);
}

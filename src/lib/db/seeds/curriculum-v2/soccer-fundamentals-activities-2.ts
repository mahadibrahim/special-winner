/**
 * Comprehensive Soccer Activities - Fundamentals Stage (Ages 6-8) - Part 2
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
import { activities } from "../../schema/practice-planning";
import { sports } from "../../schema/sports";
import { developmentStages } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

export async function seedSoccerFundamentalsActivities2() {
  console.log("Seeding comprehensive soccer activities (Fundamentals) - Part 2...");

  const [soccer] = await db.select().from(sports).where(eq(sports.slug, "soccer"));
  if (!soccer) throw new Error("Soccer sport must be seeded first");

  const stages = await db.select().from(developmentStages);
  const fundamentals = stages.find((s) => s.slug === "fundamentals");
  const skillBuilding = stages.find((s) => s.slug === "skill-building");

  if (!fundamentals) throw new Error("Development stages must be seeded first");

  const comprehensiveActivities = [
    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 1: BALL MASTERY CIRCLE
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Ball Mastery Circle",
      slug: "ball-mastery-circle-v2",
      description: "Players form a circle around the coach who demonstrates ball mastery moves. Everyone practices together, building foundational touches and footwork in a supportive, follow-the-leader format.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 20,
      durationMinutes: 8,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 ball per player
□ Optional: 1 cone to mark coach spot

SPACE: Open area large enough for circle (8-12 paces diameter)

SETUP STEPS
1. Coach stands in center with ball
2. Players form circle around coach (2 arm lengths apart)
3. Each player has ball at feet
4. Everyone can see coach clearly

DIAGRAM
              ○
          ○       ○
        ○           ○
            COACH
        ○     ●     ○
          ○       ○
              ○

○ = player with ball (circle formation)
● = coach in center with ball`,

      howToPlay: `PHASE 1: GATHER & SETUP (45 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of area

SAY: "Everyone grab a ball and make a big circle around me! Make sure you can stretch your arms without touching your neighbor!"

Wait for circle to form.

SAY: "Perfect! Ball at your feet, eyes on me. We're going to learn some cool moves together. Watch first, then copy!"


PHASE 2: TOE TAPS (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "First move - TOE TAPS! Watch..."

DEMO: Alternate tapping top of ball with each foot, ball stays still.

SAY: "See how the ball doesn't move? Light touches on top. Your turn - GO!"

Count out loud: "1-2-1-2-1-2..." for 15-20 taps.

PRAISE: "Great rhythm!" "Light touches!" "Ball not moving - perfect!"

VARIATION: "Can you go faster? Speed it up!"

Then: "FREEZE! Shake out your legs."


PHASE 3: SOLE ROLLS (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Next move - SOLE ROLLS! Watch..."

DEMO: Roll ball forward and back with sole of one foot.

SAY: "Use the bottom of your foot - roll it out, pull it back. Like you're petting a dog. GO!"

Let them practice 15 seconds.

SAY: "Switch feet!" Practice other foot.

PRAISE: "Nice control!" "Smooth rolling!" "Great balance!"

VARIATION: "Now side to side! Roll it left, roll it right!"

Then: "FREEZE! Other foot shake."


PHASE 4: TICK-TOCKS (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "This one is called TICK-TOCK - like a clock! Watch..."

DEMO: Tap ball gently side to side with inside of each foot.

SAY: "Inside of foot, back and forth. The ball goes tick... tock... tick... tock. GO!"

Help with rhythm: "Tick... tock... tick... tock..."

PRAISE: "Great rhythm!" "Nice soft touches!" "Like a clock!"

VARIATION: "Can you make the tick-tock bigger? Wider steps!"


PHASE 5: CIRCLES (60 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Last move - CIRCLES! Watch..."

DEMO: Use sole to roll ball in a circle around standing foot.

SAY: "Keep your other foot planted. Roll the ball all the way around it. GO!"

Let them try. This is harder!

SAY: "Other direction now! Reverse circle!"

PRAISE: "That's tricky! Great try!" "You got it!" "Beautiful circles!"


PHASE 6: COMBO CHALLENGE & WRAP (45 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Now the challenge - can you do them in order when I call them out?"

Call out: "Toe taps!... Sole rolls!... Tick-tocks!... Circles!"

Increase speed of calls.

WRAP UP: "Amazing footwork! Those moves help you control the ball better in games. Which was your favorite? Practice that one at home!"`,

      diagram: `              ○
          ○       ○
        ○           ○
            COACH
        ○     ●     ○
          ○       ○
              ○`,

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
        { name: "Mirror Partners", description: "Pair up - one leads, one copies. Switch every 30 seconds.", difficulty: "beginner" },
        { name: "Music Moves", description: "Play music - when it stops, freeze with ball under foot.", difficulty: "beginner" },
        { name: "Player Demo", description: "Ask a player to show their favorite move to the group.", difficulty: "beginner" },
        { name: "Combo Sequences", description: "Create patterns: 3 toe taps, 2 sole rolls, 4 tick-tocks.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Balls constantly rolling away
• Falling off balance frequently
• Frustrated expressions
• Not keeping up with demos

SOLUTIONS:
• Slow down demonstrations significantly
• Only teach 2 moves instead of 4
• Allow ball to move a little (don't require stationary)
• Let them sit on ball to practice balance first
• Use larger, slightly deflated balls (easier control)`,

      makeHarder: `SIGNS THEY'RE READY:
• Completing all moves perfectly
• Looking bored
• Asking "what else can we do?"
• Finishing before others

SOLUTIONS:
• Speed up the moves
• Add weak foot requirement
• Eyes closed challenge
• Combine moves into sequences
• Add movement (circle while doing toe taps)
• Player becomes demonstrator`,

      equipmentNeeded: ["1 ball per player"],
      spaceRequired: "small",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id],
      tags: ["warmup", "ball-mastery", "footwork", "beginner-friendly", "no-lines", "technique"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Coach demonstrates ball mastery moves in center while players in circle copy - builds foundational touches and footwork.",
          keyPhrases: [
            "Light touches - like a balloon!",
            "Ball stays in your space!",
            "Slow is smooth, smooth is fast!",
          ],
          setupDiagram: "Circle formation around coach, 1 ball per player, 2 arm lengths apart",
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
            mindset: "This is TECHNICAL work disguised as follow-the-leader. Energy should be calm and focused. Your clear demonstrations are the key - make them obvious and slow. Celebrate effort, not perfection.",
          },
          segments: [
            {
              phase: "Gather & Setup",
              duration: "45 seconds",
              coachPosition: "Center of circle",
              script: "SAY: 'Make a big circle around me!' Wait for formation. 'Ball at feet, eyes on me. Watch first, then copy!'",
              anticipatedResponses: {
                "I already know these moves": "Great! Help me demonstrate. Can you show the others?",
                "This is hard": "That's perfect - hard means we're learning! Start slow.",
                "I can't do it": "Watch me again. Everyone starts somewhere!",
              },
              troubleshooting: {
                "Circle too tight": ["Step back two big steps everyone!"],
                "Can't see coach": ["Taller friends kneel, shorter friends stand"],
              },
            },
            {
              phase: "Toe Taps",
              duration: "90 seconds",
              coachPosition: "Center, demonstrating",
              script: "Demo toe taps with ball still. SAY: 'Light touches on top, ball doesn't move.' Count rhythm: '1-2-1-2-1-2.' Add speed variation.",
              troubleshooting: {
                "Ball rolling forward": ["Softer touch! Just tap the very top."],
                "Only using one foot": ["Now the other foot! 1-2-1-2!"],
              },
            },
            {
              phase: "Sole Rolls",
              duration: "90 seconds",
              coachPosition: "Center, demonstrating",
              script: "Demo sole roll forward and back. SAY: 'Bottom of foot, like petting a dog.' Practice both feet. Add side-to-side variation.",
              troubleshooting: {
                "Using toe instead of sole": ["Show me the bottom of your foot - that part!"],
                "Ball escaping": ["Smaller rolls! Keep it close."],
              },
            },
            {
              phase: "Tick-Tocks",
              duration: "90 seconds",
              coachPosition: "Center, demonstrating",
              script: "Demo tick-tock side to side. SAY: 'Inside of foot, like a clock - tick... tock...' Help with rhythm verbally.",
              troubleshooting: {
                "Ball going forward not side": ["Push sideways! Like a clock pendulum."],
                "No rhythm": ["Slow it down. Tick... wait... tock... wait..."],
              },
            },
            {
              phase: "Circles",
              duration: "60 seconds",
              coachPosition: "Center, demonstrating",
              script: "Demo circle around standing foot. SAY: 'Roll it all the way around your planted foot.' Try both directions. This is the hardest!",
              troubleshooting: {
                "Planted foot moving": ["Glue that foot down! Only the ball moves."],
                "Can't complete circle": ["Try half circles first. Half, then switch direction."],
              },
            },
            {
              phase: "Combo Challenge & Wrap",
              duration: "45 seconds",
              coachPosition: "Center",
              script: "Call out moves randomly, players execute. Speed up calls. End with 'Which was your favorite? Practice at home!'",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            tooEasy: {
              symptoms: ["Bored expressions", "Perfect execution", "Side conversations"],
              solutions: ["Add speed", "Weak foot only", "Eyes closed", "Create sequences", "Let players demo"],
            },
            tooHard: {
              symptoms: ["Constant ball loss", "Frustration", "Giving up", "Sitting down"],
              solutions: ["Slow down", "Fewer moves", "Allow imperfect", "Pair struggling with successful player"],
            },
          },
          playerBehavior: {
            notParticipating: {
              symptoms: ["Standing still", "Not attempting moves", "Looking elsewhere"],
              approach: "Move next to them while continuing. Quietly say 'Just try with me.' Celebrate any attempt. If truly unwilling, let them watch - often they'll join after.",
            },
            showingOff: {
              symptoms: ["Adding unnecessary moves", "Going way too fast", "Distracting others"],
              approach: "Channel it: 'You've got great skills! Can you help your neighbor who's struggling?' Or: 'Show me that move slower so everyone can learn.'",
            },
            frustrated: {
              symptoms: ["Kicking ball away", "Saying 'I can't'", "Tearing up"],
              approach: "Private moment: 'This is tricky! I'll tell you a secret - just do it slowly and it works.' Lower the challenge for them specifically.",
            },
          },
          environmentalIssues: {
            unevenSurface: {
              symptoms: ["Balls rolling unpredictably", "Can't keep ball still"],
              solution: "Find flattest area. Or acknowledge: 'This bumpy ground makes it extra challenging!'",
            },
            tooManyPlayers: {
              symptoms: ["Can't see coach", "Crowded circle", "Bumping neighbors"],
              solution: "Split into 2 circles, assistant coaches one or experienced player leads second group.",
            },
            distractions: {
              symptoms: ["Players looking at other fields", "Not focused"],
              solution: "Move circle to face away from distractions. Increase energy and enthusiasm in your voice.",
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Ball Familiarity",
              domain: "Technical",
              howItDevelops: "Repeated touches with different foot surfaces builds comfort and control. Players learn how ball responds to different touches.",
              levelIndicators: {
                1: "Ball escapes frequently; uses only one foot surface",
                2: "Can maintain ball proximity; inconsistent surfaces",
                3: "Completes all moves with ball in control; uses multiple surfaces",
                4: "Smooth transitions between moves; comfortable with both feet",
                5: "Can perform moves at speed, eyes up, while moving",
              },
              assessmentNotes: "Watch progression across sessions, not single session. Look for increasing smoothness and confidence.",
            },
            {
              skill: "Footwork / Coordination",
              domain: "Technical",
              howItDevelops: "Alternating feet, using different surfaces, and balance challenges develop neuromuscular coordination fundamental to all soccer skills.",
              levelIndicators: {
                1: "Clumsy, loses balance, can't alternate feet smoothly",
                2: "Basic alternation possible but slow and deliberate",
                3: "Smooth footwork at moderate speed; maintains balance",
                4: "Quick, light footwork; stable throughout",
                5: "Effortless footwork; can add moves and complexity",
              },
              assessmentNotes: "Look at fluidity of movement, not just completion. Is it jerky or smooth?",
            },
          ],
          secondarySkills: [
            {
              skill: "Sole Control",
              domain: "Technical",
              howItDevelops: "Sole rolls specifically train this critical surface for trapping, turning, and ball manipulation.",
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
              howItDevelops: "Tick-tocks develop the inside foot surface used for most passes and dribbling.",
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
            selfAwareness: "Noticing which foot is stronger, what feels difficult",
          },
        },

        developmentalContext: {
          whyThisActivity: "Ball Mastery Circle builds the fundamental foot-ball relationship that underlies all technical skills. Before players can dribble past opponents, pass accurately, or shoot with power, they need comfortable, confident touches. This activity provides high repetition in a supportive, follow-along format where mistakes are invisible and everyone succeeds together.",
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
              { activity: "Free Dribbling", reason: "Get comfortable moving with ball first" },
            ],
            after: [
              { activity: "Traffic Lights", reason: "Apply touches while moving at different speeds" },
              { activity: "Gates Dribbling", reason: "Apply control through obstacles" },
              { activity: "Shark Attack", reason: "Apply control under pressure" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Fun, follow-along, celebrate all attempts",
              keyPhrases: ["Copy me!", "Light like a feather!", "Tickle the ball!"],
              avoidSaying: ["You're doing it wrong", "Watch your technique"],
              duration: "6-8 minutes maximum",
              simplifications: ["Only 2-3 moves", "Very slow pace", "Lots of praise"],
            },
            "ages9to11": {
              approach: "Add precision and challenge",
              keyPhrases: ["Clean touches", "Both feet equal", "Can you feel the difference?"],
              challenges: ["Weak foot focus", "Speed variations", "Eyes up challenge"],
              duration: "8-10 minutes with progressions",
            },
            "ages12to14": {
              approach: "Player-led, connect to game application",
              keyPhrases: ["When would you use this?", "What makes a touch 'good'?"],
              challenges: ["Moving while performing", "Create your own sequences", "Teach younger players"],
              coachRole: "Facilitate rather than demonstrate; let players lead",
            },
          },
          commonMisconceptions: {
            "This is boring for advanced players": "Add speed, complexity, and challenges. Advanced players benefit from refinement.",
            "Players should do this alone not in circle": "Circle provides modeling and social support. Mistakes are less visible.",
            "Ball mastery doesn't transfer to games": "Every game touch uses these fundamental surfaces and movements.",
          },
        },

        parentCommunication: {
          ifAsked: "Ball Mastery Circle teaches your child to be comfortable with the ball using different parts of their feet. We practice toe taps, sole rolls, tick-tocks, and circles - these are the building blocks for all dribbling and ball control in games.",
          newsletter: "This week we practiced Ball Mastery! Ask your child to show you toe taps (tapping top of ball) and tick-tocks (side to side with inside of foot). These can be practiced at home - try 50 touches before dinner!",
          whatToWatchFor: [
            "Does your child use different parts of their foot comfortably?",
            "Can they keep the ball close without it rolling away?",
            "Do they practice ball touches at home?",
            "Are they getting more confident with both feet?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Tripping on ball", prevention: "Adequate spacing between players", response: "Check player, ensure they're okay, reinforce spacing" },
            { risk: "Ankle strain", prevention: "Dynamic warm-up before activity", response: "Rest, ice if needed, modify to sitting if can continue" },
            { risk: "Collisions reaching for rolling ball", prevention: "Emphasize 'let it go, get a new one' if ball escapes", response: "Check both players, reinforce rule" },
          ],
          inclusionConsiderations: {
            physicalDifferences: "Allow seated participation for balance issues; modify moves as needed",
            visualImpairments: "Position close to coach; verbal cues instead of visual only",
            attentionChallenges: "Shorter segments; frequent changes; individual attention",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 2: GATES DRIBBLING
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "Gates Dribbling",
      slug: "gates-dribbling-v2",
      description: "Players dribble through randomly scattered cone 'gates' throughout a playing area. Develops dribbling with head up, direction changes, spatial awareness, and decision-making about which gate to attack next.",
      activityType: "warmup" as const,
      difficulty: "beginner" as const,
      minPlayers: 4,
      maxPlayers: 24,
      durationMinutes: 8,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 ball per player
□ 10-16 cones (2 per gate, minimum 5-8 gates)
□ Pinnies (optional for variations)

SPACE: 25x25 paces (adjust based on numbers)

SETUP STEPS
1. Create gates by placing 2 cones about 2 paces apart
2. Scatter 5-8 gates RANDOMLY throughout area (not in lines!)
3. Gates should face different directions
4. Leave space between gates for dribbling
5. Each player has a ball

DIAGRAM
┌────────────────────────────────┐
│     ⊏⊐                        │
│              ⊏⊐          ⊏⊐   │
│    ⊏⊐                         │
│                   ⊏⊐          │  25 paces
│         ⊏⊐              ⊏⊐   │
│                                │
│    ⊏⊐          ⊏⊐             │
└────────────────────────────────┘
        25 paces

⊏⊐ = gate (2 cones, 2 paces apart)`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (45 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: Center of grid

SAY: "Everyone grab a ball and come into our gate area! Look at all these gates - your job is to dribble through as many as you can!"

DEMO: Dribble through nearest gate.

SAY: "The ball must go through the gate with you - no kicking ahead! Head up, find the next gate, and go! How many can you get in 1 minute? Ready... GO!"


PHASE 2: ROUND 1 - FREE EXPLORATION (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "GO! Count your gates! Head up, find the next one!"

Coach Position: Outside area, moving around perimeter

WATCH FOR:
□ Are they looking up to find gates?
□ Are they keeping ball close through gates?
□ Are they spreading out or all going to same gate?

PHRASES TO USE:
• "Eyes up - where's your next gate?"
• "Great control through that one!"
• "Find an empty gate!"
• "Don't stop - keep going!"

COUNTDOWN: "30 seconds!... 10 seconds!... 3-2-1 FREEZE!"

ASK: "Who got more than 5? More than 8? More than 10?"


PHASE 3: TEACHING MOMENT (45 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Everyone come to this gate. Watch me."

DEMO: Dribble through gate while looking ahead at next gate.

SAY: "See how I'm looking for my NEXT gate WHILE going through this one? Not looking at my feet! That's how you go faster!"

DEMO: Also show changing direction smoothly toward next gate.


PHASE 4: ROUND 2 - BEAT YOUR SCORE (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "This time, try to beat YOUR score! Remember - head up, looking for the next gate! Ready... GO!"

Coach moves around, giving specific feedback:
• "Nice - already looking for your next one!"
• "Pick your head up! There's an empty gate over there!"
• "Beautiful direction change!"

End: "FREEZE! Did anyone beat their score? Nice!"


PHASE 5: CHALLENGE ROUND (90 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Choose ONE challenge:

Option A - Weak Foot Only:
SAY: "This round, ONLY your weak foot can touch the ball! This is hard - it's okay to go slower!"

Option B - Different Exits:
SAY: "You must exit each gate a DIFFERENT direction than you entered! Can't go straight through!"

Option C - Called Gates:
SAY: "I'll call out a gate - everyone race to THAT gate! First one through gets a point!"

Run challenge. Celebrate effort!


PHASE 6: WRAP UP (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Great work! What helped you go through more gates?"

Listen for: "Looking up," "Planning ahead," "Finding empty ones"

SAY: "That's exactly what you need in games - finding space, knowing where to go next! Water break!"`,

      diagram: `┌────────────────────────────────┐
│     ⊏⊐                        │
│              ⊏⊐          ⊏⊐   │
│    ⊏⊐                         │
│                   ⊏⊐          │
│         ⊏⊐              ⊏⊐   │
│                                │
│    ⊏⊐          ⊏⊐             │
└────────────────────────────────┘`,

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
        { name: "Partner Gates", description: "Work in pairs - pass ball through gate to partner. Count combined gates.", difficulty: "beginner" },
        { name: "Color Gates", description: "Different colored cone gates worth different points. Red=3, Yellow=2, Green=1.", difficulty: "beginner" },
        { name: "Gate Keeper", description: "1-2 players defend gates. Dribblers score by going through unguarded gates.", difficulty: "intermediate" },
        { name: "Sequence Gates", description: "Must go through gates in order (numbered or colored sequence).", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Ball always escaping through gates
• Can't find gates (head down)
• Collisions at gates
• Low gate counts (less than 3 per minute)

SOLUTIONS:
• Make gates wider (3 paces instead of 2)
• Fewer gates but more spread out
• Walk-through allowed (not just dribble)
• Coach stands at gate calling them over
• Allow ball to go through slightly ahead`,

      makeHarder: `SIGNS THEY'RE READY:
• Easily getting 10+ gates per minute
• Head always up
• No collisions
• Looking bored

SOLUTIONS:
• Narrower gates (1.5 paces)
• Must go AROUND cone not between sometimes
• Weak foot only
• Add a gate keeper defender
• Can't use same gate twice in a row
• Specify exit directions`,

      equipmentNeeded: ["1 ball per player", "10-16 cones"],
      spaceRequired: "medium",
      indoorSuitable: true,
      appropriateStageIds: [fundamentals.id, skillBuilding?.id].filter(Boolean) as string[],
      tags: ["warmup", "dribbling", "awareness", "decision-making", "beginner-friendly", "no-lines"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "Dribble through scattered cone gates while keeping head up to find next gate - develops vision and dribbling.",
          keyPhrases: [
            "Head up - find your next gate!",
            "Ball stays with you through the gate!",
            "Plan ahead - see your next one!",
          ],
          setupDiagram: "25x25 grid, 5-8 gates scattered randomly, 2 cones per gate 2 paces apart",
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
            mindset: "This is about VISION while dribbling. Your main job is getting them to pick their head up. Be a broken record: 'Head up! Where's your next gate?' Celebrate finding empty gates and planning ahead.",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "45 seconds",
              coachPosition: "Center of grid",
              script: "SAY: 'Dribble through as many gates as you can! Ball goes with you - no kicking ahead!' Demo one gate. 'Count your gates - GO!'",
              anticipatedResponses: {
                "What if someone else is at my gate?": "Find an empty one! That's why you look up!",
                "Can I go through the same gate twice?": "Try to find new gates each time - explore everywhere!",
                "I kicked it too far": "Keep it close! The ball is your pet following you.",
              },
              troubleshooting: {
                "Gates too close together": ["Spread them out mid-activity - just move cones"],
                "Gates all facing same way": ["Quickly rotate some gates to face different directions"],
              },
            },
            {
              phase: "Round 1 - Free Exploration",
              duration: "90 seconds",
              coachPosition: "Outside grid, moving around",
              script: "Call encouragement: 'Head up!' 'Find empty gates!' 'Keep going!' End with freeze and score check.",
              troubleshooting: {
                "Everyone at same gates": ["Spread out! There are empty gates over here!"],
                "Ball escaping on all passes through": ["Slow down! Control first, speed later."],
              },
            },
            {
              phase: "Teaching Moment",
              duration: "45 seconds",
              coachPosition: "At one gate, everyone gathered",
              script: "Demo: Look for next gate WHILE going through current gate. 'See how I'm already planning? Eyes up, not on feet!'",
            },
            {
              phase: "Round 2 - Beat Your Score",
              duration: "90 seconds",
              coachPosition: "Roaming inside grid",
              script: "Personal challenge: beat your own score. Give specific feedback about vision and planning ahead.",
            },
            {
              phase: "Challenge Round",
              duration: "90 seconds",
              coachPosition: "Roaming",
              script: "Pick one challenge: weak foot only, different exit directions, or called gates. Celebrate effort on difficult challenge.",
            },
            {
              phase: "Wrap Up",
              duration: "30 seconds",
              coachPosition: "Center",
              script: "ASK: 'What helped you get more gates?' Connect to game: finding space, seeing the field. Water break!",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            tooEasy: {
              symptoms: ["Everyone getting 15+ gates", "No challenge visible", "Players adding own tricks"],
              solutions: ["Narrow gates", "Weak foot only", "Add gate keeper", "Can't repeat gates", "Exit direction requirement"],
            },
            tooHard: {
              symptoms: ["Few gates completed", "Constant ball loss", "Collisions", "Frustration"],
              solutions: ["Wider gates", "Fewer gates", "Walking allowed", "Coach guides to gates"],
            },
          },
          playerBehavior: {
            crowding: {
              symptoms: ["Everyone at 2-3 popular gates", "Arguments over gates", "Ignoring empty gates"],
              approach: "SAY: 'Look - there are 3 empty gates over there! Smart players find empty gates!' Point out empty areas.",
            },
            competitiveConflicts: {
              symptoms: ["Pushing at gates", "Arguing about who was first", "Blocking gates"],
              approach: "SAY: 'If someone's there, find an empty gate! That's the smart move!' Praise those finding empty gates.",
            },
            notTrying: {
              symptoms: ["Walking through gates", "Low effort", "Not counting"],
              approach: "Add individual challenge: 'Can you beat 8 this time?' Or add variation to re-engage.",
            },
          },
          environmentalIssues: {
            windBlowingCones: {
              symptoms: ["Gates falling apart", "Cones moving"],
              solution: "Use heavier cones or place in sheltered area. Or switch to disc cones.",
            },
            unevenNumbers: {
              symptoms: ["Some areas crowded"],
              solution: "Add more gates to spread players out. Ensure 1 gate per 2-3 players minimum.",
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Dribbling with Head Up",
              domain: "Technical/Tactical",
              howItDevelops: "Finding gates requires looking up while dribbling - exactly what's needed in games to find teammates and space.",
              levelIndicators: {
                1: "Always looking at ball; can't find gates without stopping",
                2: "Occasional glances up; loses ball when looking up",
                3: "Regular head up; maintains control while scanning",
                4: "Constant scanning; never loses ball; plans 2 gates ahead",
                5: "Peripheral vision for ball; full field awareness",
              },
              assessmentNotes: "Watch eye position during dribbling. How far ahead are they looking? Can they tell you where empty gates are?",
            },
            {
              skill: "Change of Direction",
              domain: "Technical",
              howItDevelops: "Gates are scattered - players must turn and curve toward next gate, building turning ability.",
              levelIndicators: {
                1: "Only goes straight; wide, slow turns",
                2: "Turns but loses ball or takes many touches",
                3: "Controlled turns; ball stays close",
                4: "Sharp turns at speed; seamless direction changes",
                5: "Can change direction while scanning; unpredictable",
              },
              assessmentNotes: "Watch transitions between gates. Are turns sharp or wide arcs?",
            },
          ],
          secondarySkills: [
            {
              skill: "Decision Making",
              domain: "Tactical",
              howItDevelops: "Must choose which gate to attack next based on what's open, where others are, and current position.",
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
              howItDevelops: "Knowing where gates and other players are develops field sense.",
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
          whyThisActivity: "Gates Dribbling forces players to pick their head up - the single biggest improvement most young players need. Looking for gates while dribbling directly translates to looking for teammates and space in games. The individual format means high touches and continuous movement.",
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
              { activity: "Ball Mastery Circle", reason: "Basic ball comfort before movement" },
              { activity: "Traffic Lights", reason: "Ball control at speeds" },
            ],
            after: [
              { activity: "Shark Attack", reason: "Adds defensive pressure" },
              { activity: "1v1 to Gates", reason: "Competitive dribbling through gates" },
              { activity: "Passing Gates", reason: "Gate concept with passing" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Exploration and fun, count as celebration not pressure",
              keyPhrases: ["How many doors can you go through?", "Find the empty ones!", "Eyes up, adventurer!"],
              avoidSaying: ["You need to look up more", "That was wrong"],
              duration: "6-7 minutes",
              simplifications: ["Wider gates", "Fewer gates", "No weak foot requirement"],
            },
            "ages9to11": {
              approach: "Add challenge and competition",
              keyPhrases: ["Plan two gates ahead", "What's your strategy?", "Beat your record"],
              challenges: ["Weak foot rounds", "Exit direction requirements", "Add gate keeper"],
              duration: "8-10 minutes",
            },
            "ages12to14": {
              approach: "Game connection and self-coaching",
              keyPhrases: ["Where do you see gates in a real game?", "How does this help your game?"],
              challenges: ["Competitive races", "Team gates", "Complex sequences"],
              coachRole: "Facilitate discussion about game application",
            },
          },
          commonMisconceptions: {
            "Just running around aimlessly": "The gate targets create purpose and require planning - this is structured chaos.",
            "Doesn't translate to games": "Finding and dribbling to 'gates' (passing lanes, space, goals) is exactly what happens in games.",
            "Players should go faster": "Speed without control and vision is useless. Emphasize quality over quantity.",
          },
        },

        parentCommunication: {
          ifAsked: "Gates Dribbling teaches your child to look up while dribbling - finding gates is like finding teammates and space in games. They're learning to make decisions and control the ball at the same time.",
          newsletter: "This week: Gates Dribbling! We scattered cone gates around and challenged players to dribble through as many as possible. The key skill is looking UP to find the next gate while keeping the ball close. You can practice at home with shoes or toys as gates!",
          whatToWatchFor: [
            "Does your child look up while dribbling or stare at the ball?",
            "Can they dribble and change direction smoothly?",
            "Do they find open space rather than crowded areas?",
            "Are they planning ahead or just reacting?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions at popular gates", prevention: "Emphasize finding empty gates; adequate spacing between gates", response: "Check players; reinforce gate choice skills" },
            { risk: "Tripping over cones", prevention: "Remind to go THROUGH gates not around; spaced out cones", response: "Check for injury; ensure cones visible" },
            { risk: "Rolling ankles on direction changes", prevention: "Adequate warm-up; reasonable speed expectations", response: "Rest; ice if needed; reduce intensity" },
          ],
          inclusionConsiderations: {
            mobilityDifferences: "Allow walking; larger gates; fewer direction changes required",
            visionImpairments: "Use bright colored cones; partner assistance; verbal guidance",
            attentionChallenges: "Shorter rounds; frequent breaks; individual gates to find",
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

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIVITY 3: WORLD CUP
    // ═══════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      name: "World Cup",
      slug: "world-cup-v2",
      description: "Classic playground elimination game where all players start together, everyone for themselves, trying to score in a central goal. When you score, you're safe. Last players without a goal are eliminated. Develops shooting, dribbling in traffic, and decision-making.",
      activityType: "game" as const,
      difficulty: "beginner" as const,
      minPlayers: 6,
      maxPlayers: 20,
      durationMinutes: 12,

      setupInstructions: `EQUIPMENT CHECKLIST
□ 1 ball only (coach holds extras for quick replacement)
□ 2 cones or 1 small goal (3-4 paces wide)
□ Optional: pinnies for later rounds
□ Spare balls nearby for quick restarts

SPACE: Open area with shooting area (minimum 20x30 paces)

SETUP STEPS
1. Set up one small goal (2 cones, 3-4 paces apart) OR use existing small goal
2. Mark a shooting line about 8-10 paces from goal (optional but helpful)
3. All players start spread around the goal area
4. ONE ball in play

DIAGRAM
            ALL PLAYERS SPREAD OUT
            ○    ○    ○    ○    ○
              ○    ○    ○    ○
                    ⚽

     - - - - - - - - - - - - - - (shooting line optional)

                  ⊏⊐
                 GOAL

○ = player  ⚽ = single ball  ⊏⊐ = goal (3-4 paces)`,

      howToPlay: `PHASE 1: GATHER & EXPLAIN (60 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Coach Position: By the goal

SAY: "This is WORLD CUP - the most famous playground game ever! Everyone plays for themselves. Your goal is to SCORE. When you score, you're SAFE and you sit down to watch. Last 2-3 players without a goal? Eliminated!"

SAY: "There's ONLY ONE BALL. You can steal it from anyone, dribble, shoot - anything goes! But NO GOALKEEPERS and NO grabbing with hands. Ready?"

PICK COUNTRY NAMES (makes it fun):
SAY: "Pick a country to be! Who's Brazil? Germany? USA? Argentina?"

Let them pick countries quickly.


PHASE 2: ROUND 1 (3-4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Find a spot, spread out! Ready... WORLD CUP!"

Drop ball in center, step back.

Coach Position: Near goal but out of play

DURING PLAY:
□ When someone scores: "GOAL! [Country name] is safe! Sit down!"
□ Ball out of bounds: Throw in new ball quickly (keep one ready)
□ Players bunching: "Spread out! Find space!"
□ No one shooting: "Have a go! Take your shot!"

When 2-3 players left without goals:
SAY: "FREEZE! These players are eliminated this round. But don't worry - everyone plays again!"


PHASE 3: QUICK DEBRIEF (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Who scored first? What did you do differently than others?"

Listen for: "Found space," "Got to loose ball," "Took my chance"

SAY: "Let's go again! Maybe change your strategy this time!"


PHASE 4: ROUND 2 (3-4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPTIONAL VARIATION - Choose one:
• "Weak foot goals count DOUBLE"
• "Must beat someone 1v1 before shooting"
• "Goal only counts from inside shooting line"

SAY: "Same game, new round! Everyone back in - even eliminated players! Different country this time? GO!"

Run same format.


PHASE 5: ROUND 3 - CHAMPIONSHIP (3-4 minutes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "CHAMPIONSHIP ROUND! This time, once you're eliminated, you're out for real. Last player standing is WORLD CUP CHAMPION!"

Increase intensity with your voice and energy.

Crown a champion at end!


PHASE 6: WRAP UP (30 seconds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAY: "Amazing World Cup! What did you learn works?"

Listen for: "Get to the ball first," "Find space," "Take your shot when you can"

SAY: "Those are the exact skills you need in real games! Great work everyone! Water break!"`,

      diagram: `            ○    ○    ○    ○    ○
              ○    ○    ○    ○
                    ⚽

     - - - - - - - - - - - - - -

                  ⊏⊐
                 GOAL`,

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
        { name: "World Cup Pairs", description: "Play in pairs (teams of 2). Must combine to score. Both safe when team scores.", difficulty: "beginner" },
        { name: "Comeback World Cup", description: "Eliminated players do 5 juggles then return. No permanent elimination.", difficulty: "beginner" },
        { name: "Two Goal World Cup", description: "Add second goal opposite the first. More chances, less crowding.", difficulty: "beginner" },
        { name: "Keeper World Cup", description: "Eliminated players become keepers in goal. Makes scoring progressively harder.", difficulty: "intermediate" },
      ],

      makeEasier: `SIGNS THEY'RE STRUGGLING:
• Same players always eliminated
• Weaker players never touch ball
• Frustration/tears from repeated elimination
• Game dominated by 2-3 strong players

SOLUTIONS:
• Multiple balls in play
• Weak foot goals = instant safe
• 2 goals to spread play out
• "Comeback" - eliminated do 5 ball taps, return
• No permanent elimination (everyone plays every round)
• Pair up weaker with stronger as team`,

      makeHarder: `SIGNS THEY'RE READY:
• Players scoring easily
• Not enough competition for ball
• Players want more challenge
• Quick rounds

SOLUTIONS:
• Must beat someone 1v1 before shooting
• Weak foot only
• Must score from shooting line
• Eliminated become goalkeepers (progressively harder)
• Smaller goal
• Add time limit ("Score in 2 minutes or eliminated")`,

      equipmentNeeded: ["1 ball (extras nearby)", "2 cones for goal"],
      spaceRequired: "medium",
      indoorSuitable: false,
      appropriateStageIds: [fundamentals.id, skillBuilding?.id].filter(Boolean) as string[],
      tags: ["game", "shooting", "dribbling", "competition", "fun", "classic"],
      featured: true,

      comprehensiveGuide: {
        quickReference: {
          oneSentence: "All players compete for one ball; score to be safe; last without a goal is eliminated - develops shooting and decision-making.",
          keyPhrases: [
            "Find space - be where the ball goes!",
            "Take your shot when you have it!",
            "Stay calm - your chance will come!",
          ],
          setupDiagram: "One small goal, one ball, all players spread around shooting area",
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
            mindset: "This is HIGH ENERGY competition. Your job is to keep it moving fast, restart quickly when ball goes out, and manage emotions around elimination. Celebrate all goals equally. Watch for dominant players and discouraged players.",
          },
          segments: [
            {
              phase: "Gather & Explain",
              duration: "60 seconds",
              coachPosition: "By the goal",
              script: "Explain: everyone for themselves, score = safe, last players eliminated. Pick country names. 'ONE BALL, NO HANDS, NO KEEPERS!'",
              anticipatedResponses: {
                "What if I never get the ball?": "Find space away from the crowd! The ball always pops out.",
                "That's not fair, they're bigger": "Smart players don't always chase - they wait for chances!",
                "Can we have teams?": "Not this version, but we can try pairs next round!",
              },
              troubleshooting: {
                "Players don't understand elimination": ["It's okay! Everyone plays every round anyway. If you're out, you play again next round!"],
                "Arguments about countries": ["Pick fast or I'll pick for you! It's just for fun!"],
              },
            },
            {
              phase: "Round 1",
              duration: "3-4 minutes",
              coachPosition: "Near goal, out of play",
              script: "Drop ball in center, step back. Call out 'GOAL! [Country] is safe!' when scores happen. Quick restarts on out balls. End when 2-3 left.",
              troubleshooting: {
                "Ball constantly out of bounds": ["Have spare ball ready - throw in immediately"],
                "One player dominating": ["'Nice! Let's see if others can catch up!'"],
                "Everyone bunched on ball": ["'Spread out! The ball will pop out - be ready!'"],
              },
            },
            {
              phase: "Quick Debrief",
              duration: "30 seconds",
              coachPosition: "Center",
              script: "ASK: 'What did first scorers do differently?' Listen for: space, quick shot, position. 'Try something new this round!'",
            },
            {
              phase: "Round 2",
              duration: "3-4 minutes",
              coachPosition: "Near goal",
              script: "Add variation if desired (weak foot double, 1v1 required, etc.). Everyone plays again, even if eliminated before.",
              troubleshooting: {
                "Same players eliminated again": ["Consider pairing up or adding multiple balls"],
                "Players giving up": ["Encourage: 'Stay with it! Your chance is coming!'"],
              },
            },
            {
              phase: "Round 3 - Championship",
              duration: "3-4 minutes",
              coachPosition: "Near goal, high energy",
              script: "Real elimination this round. Build drama with your voice. Crown champion at end. Make it special!",
            },
            {
              phase: "Wrap Up",
              duration: "30 seconds",
              coachPosition: "Center",
              script: "ASK: 'What works in World Cup?' Connect to real games: finding space, taking chances, quick decisions.",
            },
          ],
        },

        troubleshooting: {
          gameBalance: {
            dominantPlayers: {
              symptoms: ["Same 2-3 always score first", "Others never touch ball", "Visible frustration"],
              solutions: ["Require weak foot for dominant players", "Must beat someone before shooting", "Pair up for 2v2 World Cup", "Multiple balls in play"],
            },
            noOneScoring: {
              symptoms: ["Long rounds without goals", "Too much bunching", "No one shooting"],
              solutions: ["Larger goal", "Two goals", "Encourage shooting: 'Have a go!'", "Award near misses"],
            },
          },
          playerBehavior: {
            eliminatedUpset: {
              symptoms: ["Crying or angry when eliminated", "Refusing to sit out", "Saying game is unfair"],
              approach: "Private word: 'I know it's hard. You'll be back in for Round 2! Watch the others and learn their tricks.' Always bring eliminated back quickly.",
            },
            overlyPhysical: {
              symptoms: ["Pushing", "Grabbing", "Playing the player not ball"],
              approach: "Stop immediately. SAY: 'We play the BALL, not the person. Next time is a sit-out.' Be consistent.",
            },
            notTrying: {
              symptoms: ["Standing still", "Not going for ball", "Already given up"],
              approach: "Quiet encouragement: 'Watch where the ball goes - go meet it!' Or pair them with an active player.",
            },
          },
          environmentalIssues: {
            unevenNumbers: {
              symptoms: ["Too many players for one ball"],
              solution: "Split into two games with two goals. Or add second ball.",
            },
            goalTooSmall: {
              symptoms: ["Many shots, few goals", "Frustration at missing"],
              solution: "Widen goal. Or any shot on target = safe.",
            },
            ballConstantlyOut: {
              symptoms: ["More time chasing balls than playing"],
              solution: "Add boundaries. Or have assistant catching stray balls and throwing in quickly.",
            },
          },
        },

        skillConnections: {
          primarySkills: [
            {
              skill: "Shooting",
              domain: "Technical",
              howItDevelops: "Game requires scoring to survive - creates urgency and decision-making around when/how to shoot.",
              levelIndicators: {
                1: "Rarely shoots; shots miss goal entirely",
                2: "Shoots when obvious opportunity; inconsistent accuracy",
                3: "Creates own shooting opportunities; hits target regularly",
                4: "Scores consistently; varies shot type to situation",
                5: "Clinical finisher; scores under pressure; helps others score",
              },
              assessmentNotes: "Look at both shot selection (when) and execution (how). Does player create chances or wait for them?",
            },
            {
              skill: "Dribbling in Traffic",
              domain: "Technical",
              howItDevelops: "Chaotic environment with many players requires close control to keep ball in crowd.",
              levelIndicators: {
                1: "Loses ball immediately in traffic",
                2: "Survives briefly but can't escape crowd",
                3: "Maintains possession; can emerge with ball",
                4: "Comfortable in traffic; creates space for self",
                5: "Thrives in chaos; beats multiple players",
              },
              assessmentNotes: "Watch when player gets ball in crowded area. Can they protect it? Escape? Create shooting chance?",
            },
          ],
          secondarySkills: [
            {
              skill: "Positioning / Finding Space",
              domain: "Tactical",
              howItDevelops: "Smart players position where ball will pop out, not where it is. Develops game intelligence.",
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
              howItDevelops: "Shoot? Dribble? Wait? Constant decisions under pressure.",
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
          whyThisActivity: "World Cup replicates game chaos in concentrated form. Players must find space, win balls, make decisions, and finish - all under time pressure with consequences. The elimination element adds urgency that transfers to game situations. Plus, kids LOVE it.",
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
              { activity: "Shooting Stations", reason: "Technique before pressure" },
              { activity: "1v1 to Goal", reason: "Smaller scale competition" },
            ],
            after: [
              { activity: "Small-Sided Game", reason: "Team application of skills" },
              { activity: "Shooting Under Pressure", reason: "More structured finishing work" },
            ],
          },
          ageAdaptations: {
            "ages6to8": {
              approach: "Maximum fun, minimize elimination stress",
              keyPhrases: ["Have a go!", "Great try!", "You'll get it next round!"],
              avoidSaying: ["You're out!", "That was a bad shot"],
              duration: "8-10 minutes maximum",
              simplifications: ["No permanent elimination", "Multiple balls", "Big goals", "All praised"],
            },
            "ages9to11": {
              approach: "Competition with learning",
              keyPhrases: ["What's your strategy?", "Find the space!", "Clinical finish!"],
              challenges: ["Real elimination for final round", "Weak foot challenge", "Smaller goals"],
              duration: "12-15 minutes",
            },
            "ages12to14": {
              approach: "Intense competition, player-managed",
              keyPhrases: ["Create your chance", "Be clinical", "Smart positioning"],
              challenges: ["1v1 before shooting", "Time limits", "Keeper in goal"],
              coachRole: "Referee role; let players manage their game",
            },
          },
          commonMisconceptions: {
            "Too chaotic to be learning": "Chaos is the learning! Games are chaotic. Controlled chaos develops game intelligence.",
            "Only good players benefit": "Adjust rules so all can succeed - weak foot requirements, multiple balls, pairing up.",
            "Elimination is too harsh": "Make it temporary or remove for young ages. The urgency still works even without real elimination.",
          },
        },

        parentCommunication: {
          ifAsked: "World Cup is a classic soccer game where players compete to score and stay 'alive.' It teaches shooting, finding space, and making quick decisions - all in a fun, game-like environment. We make sure everyone gets chances and no one feels left out.",
          newsletter: "We played WORLD CUP this week - the famous playground game where everyone competes for one ball! Ask your child about it: What country were they? Did they score? What strategy worked best? This game develops shooting, positioning, and competitive spirit!",
          whatToWatchFor: [
            "Does your child take shooting chances or hesitate?",
            "Do they find space away from the crowd?",
            "How do they handle not scoring - resilience or frustration?",
            "Are they learning from each round and adjusting strategy?",
          ],
        },

        safety: {
          commonRisks: [
            { risk: "Collisions when multiple players going for ball", prevention: "Emphasize playing the ball not person; adequate space", response: "Check both players; brief pause if needed; reinforce rules" },
            { risk: "Kicked while shooting in crowded goal area", prevention: "Encourage spreading out; no crowd in front of goal", response: "Check player; ensure not dangerous; continue" },
            { risk: "Frustration-related incidents", prevention: "Quick rounds; bring eliminated back fast; multiple balls", response: "Private word; break if needed; adjust rules to reduce frustration" },
          ],
          inclusionConsiderations: {
            skillDifferences: "Pair weaker with stronger; weak foot for advanced; multiple balls for equal chances",
            physicalDifferences: "Larger goal; longer shooting range allowed; different elimination criteria",
            emotionalSensitivity: "No permanent elimination for anxious players; comeback rule; pair with supportive player",
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
  ];

  // Insert activities
  for (const activity of comprehensiveActivities) {
    await db.insert(activities).values(activity).onConflictDoNothing();
    console.log(`  ✓ ${activity.name}`);
  }

  console.log(`\nSeeded ${comprehensiveActivities.length} comprehensive activities (Part 2)`);
}

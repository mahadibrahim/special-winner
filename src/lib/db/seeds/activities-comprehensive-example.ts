/**
 * Comprehensive Activity Example
 *
 * This file demonstrates the full depth of content needed for
 * print-ready coaching guides that work for all experience levels.
 *
 * Each activity has:
 * 1. Quick Reference Card (scannable for experienced coaches)
 * 2. Complete Coaching Script (for beginners)
 * 3. Troubleshooting Guide (if X, then Y)
 * 4. Skill Connections (linked to assessments)
 * 5. Anticipated Player Responses
 * 6. Developmental Context
 */

// This is the comprehensive content structure for ONE activity
// It demonstrates the depth we want for ALL activities

const EXAMPLE_COMPREHENSIVE_ACTIVITY = {
  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC METADATA
  // ═══════════════════════════════════════════════════════════════════════════
  name: "Shark Attack",
  slug: "shark-attack-comprehensive",
  activityType: "warmup",
  difficulty: "beginner",
  minPlayers: 6,
  maxPlayers: 24,
  durationMinutes: 7,
  appropriateStages: ["fundamentals", "skill-building"],

  // ═══════════════════════════════════════════════════════════════════════════
  // QUICK REFERENCE CARD
  // For experienced coaches who just need the essentials
  // ═══════════════════════════════════════════════════════════════════════════
  quickReference: {
    oneSentence:
      "Dribblers protect balls from sharks who try to kick them out; develops dribbling under pressure and awareness.",

    atAGlance: {
      time: "7 minutes",
      players: "6-24",
      space: "20x20 paces",
      equipment: ["1 ball per player (minus sharks)", "4 cones", "2-3 pinnies"],
      skills: ["Dribbling", "Shielding", "Awareness", "Changes of direction"],
    },

    setupDiagram: `
┌────────────────────────────┐
│  ▲                     ▲   │
│     ○   ○                  │
│         ●(shark)   ○       │  20 paces
│     ○        ○    ○        │
│  ▲                     ▲   │
└────────────────────────────┘
       20 paces
▲=cone  ○=dribbler  ●=shark`,

    keyPhrases: [
      '"Can you dribble AND see the shark?"',
      '"Put your body between the shark and your ball!"',
      '"Tiny touches - ball on a short leash!"',
    ],

    quickProgression: {
      easier: "Bigger grid, fewer sharks, sharks must hop",
      harder: "Smaller grid, more sharks, weak foot only",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLETE COACHING SCRIPT
  // Minute-by-minute guide for first-time coaches
  // ═══════════════════════════════════════════════════════════════════════════
  completeScript: {
    beforeYouStart: {
      preparation: [
        "Arrive 5 minutes early to set up the grid",
        "Count players to determine number of sharks (1 shark per 5-6 dribblers)",
        "Have extra balls nearby for quick replacement",
        "Pick 1-2 players to be sharks first (enthusiastic volunteers work well)",
      ],
      mindset:
        "This is a HIGH ENERGY warmup. Your energy sets the tone. Be enthusiastic, move around, and celebrate effort. The goal is getting players moving and smiling.",
    },

    minute0to1: {
      phase: "Setup & Gather",
      duration: "60 seconds",
      coachPosition: "Stand in the middle of the grid",
      script: `
SAY: "Everyone grab a ball and come into the square! Spread out - find your own space!"

WHILE THEY GATHER:
- Help stragglers find balls
- Remind them to spread out
- Pick your sharks: "Marcus and Lily, can you come help me? You're going to be our sharks!"

SAY to sharks: "Hand me your balls. You're going to be the hungry sharks trying to kick balls OUT of the square."

GIVE sharks pinnies.
      `,
      anticipatedResponses: {
        "Kids arguing about who's shark":
          "Say: 'Everyone will get a turn! Let's start with volunteers, then we'll rotate.'",
        "Not enough balls":
          "Say: 'Share with a partner for now - you'll both be dribbling soon.'",
        "Kids already kicking balls around wildly":
          "Say: 'Freeze! Balls under feet, eyes on me for 30 seconds.'",
      },
    },

    minute1to2: {
      phase: "Explain Rules",
      duration: "45 seconds",
      coachPosition: "Middle of grid, sharks beside you",
      script: `
SAY: "This is SHARK ATTACK! Here's how it works..."

POINT to dribblers: "You are the fish. Your job is to dribble around and PROTECT your ball from the sharks."

POINT to sharks: "You are the HUNGRY sharks. Your job is to kick balls OUT of the square. Not steal them - kick them OUT!"

SAY: "Fish - if your ball gets kicked out, do 5 toe taps on a ball outside the square, then come right back in."

CHECK understanding: "Fish, what do you do if your ball goes out?" (Wait for: "Toe taps, come back in")

SAY: "Any questions? No? Let's GO!"
      `,
      anticipatedResponses: {
        "Can we steal the balls?":
          "Say: 'Sharks kick balls OUT. You don't keep them. Kick and look for the next one!'",
        "What if I kick someone else's ball out by accident?":
          "Say: 'That counts! Good awareness!'",
        "This is too easy / I never get caught":
          "Say: 'We'll make it harder - I promise! Let's see how you do first.'",
      },
    },

    minute2to4: {
      phase: "Round 1",
      duration: "2 minutes",
      coachPosition: "Outside the grid, moving around perimeter",
      script: `
SAY: "Sharks - show me your mean shark faces! Grrr! Dribblers - protect your ball! Ready... SHARKS ARE HUNGRY, GO!"

DURING THE ROUND:
Move around outside the grid. Watch for:
□ Are dribblers looking up to see sharks coming?
□ Are they using their body to shield?
□ Are sharks being active (not just standing)?

ENCOURAGE constantly:
- "Great escape!"
- "Sharks, find the sleepy fish!"
- "Head up - where's the shark?"
- "Nice shielding!"

IF a ball goes out:
- Point to where toe taps should happen
- "5 toe taps then back in!"

COUNT DOWN:
At 1:30 - "One minute left!"
At 1:50 - "10 seconds!"
At 2:00 - "FREEZE! Everyone stop!"
      `,
      troubleshooting: {
        "Sharks can't kick any balls out": [
          "Add another shark",
          "Make the grid smaller",
          "Tell dribblers they must keep moving (no standing still)",
        ],
        "Balls going out instantly": [
          "Remove a shark",
          "Make the grid bigger",
          "Tell sharks they must hop instead of run",
        ],
        "Kids colliding with each other": [
          "Remind them: 'Head up! See each other!'",
          "Make the grid bigger",
          "Briefly pause to reinforce awareness",
        ],
        "One child refusing to participate": [
          "Ask: 'Would you like to help me count how many balls the sharks get?'",
          "Let them observe for a round, then invite in",
          "Never force - participation comes with comfort",
        ],
      },
    },

    minute4to430: {
      phase: "Teaching Moment",
      duration: "30 seconds",
      coachPosition: "Middle of grid, all players frozen",
      script: `
SAY: "Freeze! Everyone stay where you are."

ASK: "Dribblers - point to where the sharks are RIGHT NOW."
WATCH: Are they aware? Can they find them without looking around?

ASK: "What helped you keep your ball safe?"
LISTEN for: "Moving away," "Shielding," "Looking up," "Changing direction"

TEACH one thing:
SAY: "I noticed some of you putting your body between the shark and the ball - like THIS."
DEMO: Quick shield demo with a player.
SAY: "That's BRILLIANT. Try that this round."

SAY: "New round in 5 seconds... GO!"
      `,
    },

    minute430to6: {
      phase: "Round 2",
      duration: "90 seconds",
      coachPosition: "Outside grid, moving",
      script: `
SAME as Round 1, but:

ADD competitive element:
SAY: "Sharks - how many balls can you kick out in 90 seconds? Let's count at the end!"

REINFORCE the teaching point:
When you see shielding: "YES! Body between shark and ball!"
When you see no shielding: "Turn your body - protect it!"

AT END:
SAY: "FREEZE! Sharks, how many did you get? [Count] Nice work!"
      `,
    },

    minute6to7: {
      phase: "Round 3 + Wrap Up",
      duration: "60 seconds",
      coachPosition: "Outside grid",
      script: `
SWITCH sharks:
SAY: "New sharks! Who hasn't been a shark yet? [Pick 2] Trade pinnies and let's go!"

RUN final 45-second round.

WRAP UP (15 seconds):
SAY: "Freeze! Great work everyone!
- I saw lots of you keeping your head up
- I saw great shielding
- Sharks, you were HUNGRY out there!
Grab some water, we're moving to [next activity]."
      `,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TROUBLESHOOTING MASTER GUIDE
  // If X happens, do Y
  // ═══════════════════════════════════════════════════════════════════════════
  troubleshooting: {
    gameBalance: {
      sharksTooStrong: {
        symptoms: [
          "Most balls knocked out within 30 seconds",
          "Dribblers looking frustrated",
          "No one can escape",
        ],
        solutions: [
          "Remove one shark",
          "Make grid bigger (25x25 paces)",
          "Sharks must hop instead of run",
          "Sharks count to 3 before chasing each new ball",
        ],
      },
      sharksTooWeak: {
        symptoms: [
          "No balls getting kicked out",
          "Sharks looking frustrated or giving up",
          "Dribblers easily cruising around",
        ],
        solutions: [
          "Add one shark",
          "Make grid smaller (15x15 paces)",
          "Dribblers must use weak foot only",
          "Dribblers must stay moving (no standing still)",
        ],
      },
    },

    playerBehavior: {
      notParticipating: {
        symptoms: [
          "Standing at edge of grid",
          "Not moving with ball",
          "Looking disengaged",
        ],
        approach: `
DON'T: Force them, single them out, or show frustration

DO:
1. Privately ask: "Everything okay? Want to jump in?"
2. Offer alternative role: "Want to help me count shark catches?"
3. Wait it out - often they join after watching a round
4. Check in after practice if pattern continues
        `,
      },
      overlyAggressive: {
        symptoms: [
          "Pushing other players",
          "Slide tackling (dangerous)",
          "Not going for ball, going for player",
        ],
        approach: `
IMMEDIATE: Brief pause if dangerous

SAY: "Quick freeze! Remember - we go for the BALL, not the person. Shoulder to shoulder is OK. Pushing or sliding is not safe."

IF continues: "Take a break on the side for 1 minute. You can come back in when you're ready to play safely."

PRIVATE follow-up after practice if pattern continues.
        `,
      },
      frustratedPlayer: {
        symptoms: ["Kicking ball away in anger", "Saying 'I can't do this'", "Tears"],
        approach: `
QUICK private word: "Hey, this is tough! What's frustrating you?"

LISTEN first.

OPTIONS:
- Offer easier role: "Want to be a shark for a bit?"
- Lower the challenge: "Just focus on not getting caught once"
- Normalize struggle: "Everyone finds this hard. That's how we get better."
        `,
      },
    },

    environmentalIssues: {
      spaceTooBig: {
        symptoms: ["Can't see all players", "Game feels slow", "Players spread too thin"],
        solution: "Move corner cones in. No shame in adjusting mid-game.",
      },
      spaceTooSmall: {
        symptoms: ["Constant collisions", "No room to dribble", "Chaos"],
        solution: "Move corner cones out. Or split into two smaller games.",
      },
      unevenNumbers: {
        symptom: "Odd number of players, one always left out",
        solutions: [
          "Rotate the 'odd' player as shark assistant (counts catches)",
          "Have permanent shark who's always in",
          "Split into uneven groups that work (5v1 and 6v1)",
        ],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL CONNECTIONS
  // How this activity connects to formal skill assessment
  // ═══════════════════════════════════════════════════════════════════════════
  skillConnections: {
    primarySkills: [
      {
        skill: "Dribbling Under Pressure",
        domain: "Technical",
        howItDevelops:
          "Players must control ball while evading active defenders. This replicates game-like pressure in a fun context.",
        levelIndicators: {
          level1: "Ball frequently kicked away; can't escape sharks",
          level2: "Sometimes escapes but no shielding; reactive not proactive",
          level3: "Uses body to shield; looks up occasionally; survives most rounds",
          level4: "Proactively avoids sharks; uses changes of direction; rarely caught",
          level5: "Beats sharks at will; helps teammates; could coach others",
        },
        assessmentNotes:
          "Watch across multiple rounds. Early round performance may not reflect true ability as they learn the game.",
      },
      {
        skill: "Awareness / Scanning",
        domain: "Tactical",
        howItDevelops:
          "Players must know where sharks are to avoid them. This builds the habit of looking up while dribbling.",
        levelIndicators: {
          level1: "Looks only at ball; surprised when caught",
          level2: "Occasional glances up; reactive to sharks",
          level3: "Regularly looks up; knows where 1 shark is",
          level4: "Scans continuously; knows where multiple sharks are",
          level5: "Always aware; makes decisions before shark arrives",
        },
        assessmentNotes:
          "Ask players to 'point to the sharks' while frozen. Their accuracy reveals awareness level.",
      },
    ],

    secondarySkills: [
      {
        skill: "Ball Control",
        domain: "Technical",
        howItDevelops:
          "Close touches required to keep ball from sharks. Can't take big touches or ball is vulnerable.",
        levelIndicators: {
          level1: "Big kicks; ball far from feet",
          level2: "Inconsistent touch distance",
          level3: "Generally keeps ball close while moving",
          level4: "Consistently close control at various speeds",
          level5: "Perfect close control; can speed up/slow down at will",
        },
      },
      {
        skill: "Change of Direction",
        domain: "Technical",
        howItDevelops: "Evading sharks requires quick turns and direction changes.",
        levelIndicators: {
          level1: "Only runs straight; can't turn with ball",
          level2: "Slow turns; often loses ball during turn",
          level3: "Can turn away from pressure; needs time",
          level4: "Quick turns; variety of turn types",
          level5: "Instant direction changes; sharks can't predict",
        },
      },
    ],

    physicalDevelopment: {
      agility: "Quick direction changes, stops, and starts",
      spatialAwareness: "Understanding of space relative to others",
      cardiovascular: "Continuous movement for 7 minutes",
    },

    psychologicalDevelopment: {
      resilience: "Getting caught and coming back in",
      competitiveness: "Desire to survive and not be caught",
      enjoyment: "Fun, game-like activity builds love of sport",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVELOPMENTAL CONTEXT
  // Where this fits in the bigger picture
  // ═══════════════════════════════════════════════════════════════════════════
  developmentalContext: {
    whyThisActivity: `
Shark Attack is a foundational activity because it develops dribbling under pressure
in a game-like context WITHOUT the complexity of team tactics. Players focus solely on:
1. Controlling their ball
2. Avoiding pressure
3. Recovering when they fail

This is exactly what young players face in games when they receive the ball and
a defender closes them down. By practicing in this fun, low-stakes environment,
they build confidence and skill before facing it in matches.
    `,

    whenToUseIt: {
      idealFor: [
        "Early in practice (warmup) - gets energy up",
        "When players need confidence boost - high success for most",
        "After technical work - applies skills in pressure",
        "When energy is low - the competition re-engages",
      ],
      avoidWhen: [
        "End of practice when players are tired (too intense)",
        "If players are very uneven in ability (frustration for weaker players)",
        "If you have less than 6 players (dynamics don't work)",
      ],
    },

    progressionPath: {
      before: [
        {
          activity: "Traffic Lights",
          reason: "Builds ball control at different speeds without defensive pressure",
        },
        {
          activity: "Gates Dribbling",
          reason: "Builds dribbling through spaces without live pressure",
        },
      ],
      after: [
        {
          activity: "1v1 to Goal",
          reason: "Takes dribbling under pressure into scoring context",
        },
        {
          activity: "3v3 to Small Goals",
          reason: "Applies skills in team game context",
        },
      ],
    },

    ageAdaptations: {
      ages6to8: {
        approach: "Maximum fun, minimum correction",
        keyPhrases: [
          "Be a sneaky fish!",
          "Hide your ball behind your body!",
          "Sharks are coming!",
        ],
        avoidSaying: [
          "You need to shield better (too abstract)",
          "Scan the field (they don't know what this means)",
        ],
        duration: "5 minutes max - attention spans are short",
        simplifications: [
          "Bigger grid",
          "Fewer sharks",
          "No weak foot requirements",
        ],
      },
      ages9to11: {
        approach: "Introduce technique, maintain fun",
        keyPhrases: [
          "Body position - get between the shark and your ball",
          "Small touches keep the ball close",
          "Eyes up - where's the danger?",
        ],
        challenges: [
          "Weak foot only rounds",
          "Must use a move to escape",
          "Sharks in pairs must work together",
        ],
        duration: "7-8 minutes with teaching moments",
      },
      ages12to14: {
        approach: "Game realism, player-led learning",
        keyPhrases: [
          "When do you see this in a real game?",
          "What technique helps you escape?",
          "How can you use this in the match?",
        ],
        challenges: [
          "Smaller grid for less time on ball",
          "Multiple sharks who communicate",
          "Points for 'assisting' a shark (working together)",
        ],
        coachRole: "Facilitate discussion about real game application",
      },
    },

    commonMisconceptions: {
      "This is just a game, not real training": `
This IS real training disguised as a game. Every second, players are making
decisions under pressure, controlling their ball, and experiencing game-like
situations. Games like this transfer to matches better than isolated drills.
      `,
      "Weaker players always lose": `
Design the game so everyone succeeds sometimes:
- Use enough sharks that even weak dribblers aren't targeted constantly
- Celebrate "longest survivor" even if they eventually get caught
- Rotate sharks frequently so everyone plays both roles
      `,
      "Players aren't learning technique": `
They're learning to APPLY technique under pressure, which is harder than
learning technique in isolation. The technique comes from ball mastery work;
this activity helps them use it when it matters.
      `,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PARENT COMMUNICATION
  // What to tell parents about why you use this activity
  // ═══════════════════════════════════════════════════════════════════════════
  parentCommunication: {
    ifAsked:
      "We play Shark Attack because it develops dribbling under pressure in a fun, game-like context. Your child is learning to control the ball while someone is trying to take it - exactly what happens in a real game. The smiles mean they're enjoying it; the improvement means they're learning.",

    newsletter:
      "This week we played Shark Attack as our warmup. This game teaches ball control under pressure - a crucial game skill. Watch for your child using their body to 'shield' the ball at home or in games!",

    whatToWatchFor: [
      "Does your child protect the ball with their body? (shielding)",
      "Do they look up while dribbling? (awareness)",
      "Can they change direction quickly? (agility)",
      "Do they keep the ball close to their feet? (control)",
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY CONSIDERATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  safety: {
    commonRisks: [
      {
        risk: "Collisions between players",
        prevention:
          "Emphasize 'heads up' throughout. Adequate space between cones.",
        response:
          "If collision occurs, check both players. Brief pause to reinforce awareness.",
      },
      {
        risk: "Slide tackling (dangerous on turf/indoors)",
        prevention: "Explicitly state 'no sliding' before the game starts.",
        response: "Immediate stop, reminder of rule, serious repeat = sit out.",
      },
      {
        risk: "Ball kicked into face",
        prevention: "Remind sharks to kick LOW toward feet, not high.",
        response: "Check player, ice if needed, brief pause to remind about safe kicks.",
      },
    ],

    inclusionConsiderations: {
      physicalDifferences:
        "Pair faster players as dribblers with slower sharks. Or give certain players 'immunity' for the first 30 seconds.",
      newPlayers:
        "Partner new players with experienced ones for first round to learn the game.",
      anxiousPlayers:
        "Start them as sharks (less pressure) before they become dribblers.",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REFLECTION QUESTIONS
  // For coach development
  // ═══════════════════════════════════════════════════════════════════════════
  coachReflection: {
    afterActivity: [
      "Did all players have multiple turns before getting caught?",
      "Were there moments where I should have made the game easier/harder?",
      "Did I recognize and name specific skills I saw?",
      "Was my energy level appropriate?",
    ],
    forImprovement: [
      "What would I change about my setup?",
      "What phrases worked well that I should use again?",
      "Were there players who needed more support?",
      "How could I better connect this to game situations?",
    ],
  },
};

export default EXAMPLE_COMPREHENSIVE_ACTIVITY;

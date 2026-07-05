// Hockey activities: wave-2 original build-out (refinery/refine-2026-07-05-wave2).
//
// Unlike hockey/skills.ts (a byte-for-byte transcription of a recovered seed),
// this file has no prior source -- there is no hockey activities seed anywhere
// in the recovery set (see the comment this replaces in ../index.ts). These 20
// activities are authored fresh against docs/curriculum/content-architecture.md
// (Activity Card Format) and docs/curriculum/research/2026-07-05-brief.md §1,
// targeting the "fundamentals" stage (ages 6-8) with a handful tagged for
// "skill-building" too, and hold to the fundamentals stage's keyPrinciples
// (reference.ts: "games over drills", "all players touch equipment
// constantly", "equal playing time for all", no-lines format).
//
// Evidence base (brief §1, paraphrased/adapted -- never copied verbatim):
//   - USA Hockey ADM: 8U practices are station-based, cross-ice, small-area
//     games; roughly 70% individual skill work / 20% small-area games / 10%
//     team tactics; stations run ~4-10 min. 6U uses 3v3 mini-net cross-ice,
//     no goalies.
//   - IIHF-hosted Sweden/Finland small-area-games (SAG) study: small-ice games
//     produce 5-8x more shot attempts per player than full-ice 5v5 -- the
//     rationale behind every small-area/cross-ice design below.
//   - Adapted game concepts, credited per-activity below where a named concept
//     is the origin: Sharks & Minnows, Clean Your Room, Toy Finder, Corner
//     Tires, 1v1v1 mini nets, King/Queen of the Hill, Musical Pucks, Border Tag
//     (USA Hockey ADM's own 8U station pick). Each is reworked into our own
//     wording, structure, and card format -- concepts only, not transcribed
//     text.
//
// Elimination-free default (hard rule, mirrors soccer's world-cup-v2 /
// musical-balls precedent in ../../soccer/activities.ts): any concept from a
// knockout/elimination family (Musical Pucks, King of the Rink) defaults to a
// points-or-rejoin format so nobody sits out for fundamentals-age groups. A
// true elimination format is offered ONLY as an explicitly-gated variation for
// older/skill-building or highly competitive groups, named and scoped the same
// way "Championship Knockout" is scoped on World Cup.
//
// skillsDeveloped values are hockey skill slugs from ./skills.ts ONLY (the 13
// extracted there: skating-forward, skating-backward, puck-control,
// passing-hockey, shooting-wrist, positioning-hockey, defensive-play,
// transition-breakout, edge-work-balance, speed-acceleration,
// confidence-hockey, hockey-iq, competitiveness). Every one of the 13 appears
// in at least one activity below.

import type { ActivityContent } from "../types";

export const HOCKEY_ACTIVITIES: ActivityContent[] = [
  // ─── TECHNICAL (8) ──────────────────────────────────────────────────────
  {
    slug: "sharks-and-minnows-hockey",
    name: "Sharks & Minnows",
    description:
      "Cross-ice warmup adapted from the classic pool game (concept per USA Hockey ADM small-area-game staples): every 'minnow' skates with their own puck while 1-2 pinnie-wearing 'sharks' try to poke pucks away. Poked minnows do a quick skill task and jump right back in - nobody sits out.",
    sport: "hockey",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 20,
    durationMinutes: 6,
    skillsDeveloped: ["puck-control", "skating-forward"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per minnow\n□ 2-3 pinnies for sharks\n□ 4 cones to mark the zone corners\n\nSPACE: cross-ice zone, blue line to blue line or roughly 25x30 paces\n\nSETUP STEPS\n1. Mark the cross-ice zone with cones at the corners\n2. Every player except 1-2 sharks gets a puck\n3. Sharks wear pinnies and start empty-handed (1 shark per 6-7 minnows)\n4. Minnows spread out inside the zone with their pucks",
    howToPlay:
      "1. SAY: 'Everyone grab a puck and spread out - you're minnows! Our sharks are going to try to poke your puck away.'\n2. Sharks (no puck) try to poke-check a minnow's puck out of the zone using only their stick blade - no body contact.\n3. If a minnow's puck gets poked out, they do 3 quick toe drags on a puck at the edge, then skate right back in.\n4. Run 90-second rounds, then rotate sharks so everyone gets a turn.\n5. SAY between rounds: 'Sharks, who's still got 3 fish left after this round?'",
    coachingPoints: [
      "HEAD UP → Say: 'Can you handle the puck and still see the shark coming?'",
      "KEEP IT CLOSE → Say: 'Short leash on that puck - not more than a stick's length away!'",
      "USE YOUR BODY → Say: 'Turn your shoulder between the shark and the puck!'",
      "SHARKS STAY ACTIVE → Say: 'Sharks, keep moving - find the sleepy fish!'",
    ],
    questionsToAsk: [
      "'Where's the shark right now?' → Builds scanning without stopping play",
      "'What helped you keep your puck safe that round?' → Develops reflection",
    ],
    commonMistakes: [
      "PUCK TOO FAR OUT FRONT → Say: 'Cushion it in close, like it's on a string!'",
      "SHARKS STANDING STILL → Say: 'Hunt for pucks - don't wait for one to come to you!'",
    ],
    variations: [
      {
        name: "Two-Puck Minnows",
        description:
          "Confident groups carry two pucks (one per hand of the stick blade, alternating) to raise the control demand.",
        difficulty: "intermediate",
      },
      {
        name: "Backward Sharks",
        description:
          "Sharks must defend while skating backward, turning the warmup into light backward-skating work too.",
        difficulty: "intermediate",
      },
    ],
    makeEasier:
      "Bigger zone, fewer sharks (1 per 8-10 minnows), sharks must poke-check only (no skating fast at minnows).",
    makeHarder:
      "Smaller zone, more sharks (1 per 4-5 minnows), minnows must keep skating (no standing still to shield).",
    equipmentNeeded: ["1 puck per player", "2-3 pinnies", "4 cones"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "puck-control", "cross-ice", "small-area-game", "fun", "no-lines"],
    featured: true,
  },
  {
    slug: "toy-finder-hockey",
    name: "Toy Finder",
    description:
      "Scavenger-style skating and puck-handling game (concept adapted from Weiss Tech Hockey-style 'toy finder' station drills): colored pucks are scattered across the zone and players skate to collect matching colors while cushioning their own puck the whole time.",
    sport: "hockey",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 18,
    durationMinutes: 8,
    skillsDeveloped: ["skating-forward", "puck-control"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per player (their 'home' puck)\n□ 15-20 extra pucks/cones in 3-4 colors scattered across the zone\n□ Small bin or bucket per color at the boards\n\nSPACE: cross-ice zone, roughly 25x30 paces",
    howToPlay:
      "1. SAY: 'You're each carrying your own puck the whole game - don't lose it! Your job is to also collect matching-colored toys and bring them home.'\n2. On 'GO', each player skates with their own puck while scanning for a scattered colored puck/cone.\n3. When they spot one, they skate to it, pick it up (carrying puck in the free hand or glove, stick-handled puck stays on the blade), and drop it in the matching bucket.\n4. Repeat for 90 seconds, then count how many each color bucket collected as a team.\n5. SAY: 'Team total - how many toys did we find together?'",
    coachingPoints: [
      "CUSHION WHILE SCANNING → Say: 'Soft hands on the puck even while your eyes are somewhere else!'",
      "HEAD UP TO SPOT COLORS → Say: 'Look up between touches - where's the next toy?'",
      "SKATE, DON'T WALK → Say: 'Full strides getting there - push and glide!'",
    ],
    questionsToAsk: [
      "'How did you find toys without losing your own puck?' → Develops dual-task awareness",
    ],
    commonMistakes: [
      "STOPPING TO LOOK DOWN AT PUCK → Say: 'Quick peek down, then eyes up again!'",
      "RACING WITHOUT PUCK CONTROL → Say: 'Slow down just enough to keep your puck close!'",
    ],
    variations: [
      {
        name: "Team Toy Finder",
        description:
          "Split into 2-3 small teams; whichever team's bucket fills first each color wins that round (points, no elimination).",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Fewer colors, bigger zone, allow leaving home puck at a cone while collecting.",
    makeHarder: "Must carry home puck the entire time (no setting it down), add a 4th color, shrink the zone.",
    equipmentNeeded: ["1 puck per player", "15-20 colored pucks/cones", "3-4 buckets"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["technical", "skating", "puck-control", "scanning", "fun", "no-lines"],
  },
  {
    slug: "protect-your-pond",
    name: "Protect Your Pond",
    description:
      "Every player gets their own small 'pond' (a hoop or circle of cones) and a puck to guard while trying to poke pucks out of others' ponds. Builds shielding, body positioning, and the confidence to compete for a puck without fear of losing it.",
    sport: "hockey",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 7,
    skillsDeveloped: ["puck-control", "confidence-hockey"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck + 1 hoop/small cone circle per player (their 'pond')\n□ Space ponds 3-4 paces apart in a loose circle or grid\n\nSPACE: medium open area, ponds spread across roughly 20x20 paces",
    howToPlay:
      "1. SAY: 'Your puck lives in your pond. Your job: keep your puck in YOUR pond, and try to poke someone else's puck out of THEIRS.'\n2. On 'GO', players stickhandle their puck inside their own pond while reaching to poke at nearby ponds.\n3. If your puck gets poked out, retrieve it and bring it straight back to your pond (no penalty - just get back in).\n4. Every 60 seconds, SAY: 'Freeze! How many of you still have your puck in your pond right now?' - count as a team celebration, not elimination.\n5. Run 3 short rounds, mixing up pond neighbors between rounds.",
    coachingPoints: [
      "BODY BETWEEN → Say: 'Put your shoulder between your pond and anyone reaching in!'",
      "STAY LOW → Say: 'Bend your knees - low players are harder to poke off the puck!'",
      "GO GET IT BACK → Say: 'Puck got away? No big deal - go get it and jump right back in!'",
    ],
    questionsToAsk: [
      "'What did you do with your body to protect your puck?' → Develops shielding awareness",
    ],
    commonMistakes: [
      "STANDING STRAIGHT UP → Say: 'Sit down into your stance - low and wide!'",
      "GIVING UP AFTER LOSING PUCK → Say: 'Everyone loses a puck sometimes - hustle back and get it!'",
    ],
    variations: [
      {
        name: "Shared Pond Battles",
        description:
          "Two players share one larger pond and one puck, taking turns protecting it from a rotating group of 'raiders.'",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Bigger ponds, more spacing between ponds, coach calls out freezes more often to reset.",
    makeHarder: "Smaller ponds closer together, allow players to leave their pond briefly to raid two neighbors.",
    equipmentNeeded: ["1 puck per player", "hoops or cones for ponds"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["technical", "puck-control", "shielding", "confidence", "no-lines"],
  },
  {
    slug: "clean-your-corner",
    name: "Clean Your Corner",
    description:
      "Adapted from the 'Clean Your Room' small-area-game concept: two teams start with an even split of pucks scattered on their own side of the zone and race to shovel pucks across the center line onto the opponent's side. Whoever has fewer pucks on their side when time is called wins the round.",
    sport: "hockey",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 20,
    durationMinutes: 8,
    skillsDeveloped: ["passing-hockey", "puck-control"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per player, split evenly across both halves\n□ Center line (use the red line or a row of cones)\n□ Pinnies for two teams\n\nSPACE: full cross-ice zone split in half by the center line, roughly 40x30 paces total",
    howToPlay:
      "1. SAY: 'Your side is messy - too many pucks! Clean it up by passing or shooting pucks over the line to the other team's side.'\n2. On 'GO', each team works only on their own side, using passes (not just slaps) to move as many pucks across the line as possible.\n3. Players may not cross the center line themselves - pucks only.\n4. After 60-90 seconds, SAY: 'Freeze! Count the pucks on your side.' Fewer pucks on your side = your team scores a point for that round.\n5. Reset and run 3 rounds total, tallying points.",
    coachingPoints: [
      "SWEEP, DON'T SLAP → Say: 'Push through the puck with a smooth pass, not a wild slap!'",
      "AIM FOR THE OPEN SIDE → Say: 'Look for the empty space over there before you pass!'",
      "KEEP MOVING → Say: 'Grab the next puck right away - don't stand and watch!'",
    ],
    questionsToAsk: [
      "'Is it faster to pass one at a time or work together?' → Develops teamwork thinking",
    ],
    commonMistakes: [
      "PASSES GO OUT OF BOUNDS → Say: 'Keep it flat and controlled - accuracy over power!'",
      "CROWDING ONE PILE OF PUCKS → Say: 'Spread out - everybody needs their own puck to clear!'",
    ],
    variations: [
      {
        name: "Backhand Only Round",
        description: "One round where every clearing pass must be a backhand, to build the weaker side.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Fewer total pucks, bigger goal area (whole opposite side counts), no backhand requirement.",
    makeHarder: "Add a rule that passes must be below knee height, or require every third clear to be a backhand.",
    equipmentNeeded: ["1 puck per player", "pinnies for two teams", "cones for center line if no red line"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "passing", "puck-control", "team", "small-area-game"],
  },
  {
    slug: "pass-and-follow",
    name: "Pass & Follow",
    description:
      "Simple partner passing progression where the passer skates to the back of the receiving line after every pass, keeping everyone moving and touching the puck constantly instead of standing in a line.",
    sport: "hockey",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 20,
    durationMinutes: 8,
    skillsDeveloped: ["passing-hockey"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per pair of stations\n□ Cones to mark two facing spots, 8-10 paces apart\n\nSPACE: small, can run several stations side by side",
    howToPlay:
      "1. Pairs (or small groups of 3-4 rotating through 2 spots) face each other 8-10 paces apart, one puck between them.\n2. SAY: 'Sweep the puck to your partner, then skate and follow your pass to their spot.'\n3. Passer sweeps a flat pass to the partner, then immediately skates forward to take their place; the receiver controls the pass and repeats back.\n4. After 2 minutes, SAY: 'Switch - backhand passes only!' and repeat.\n5. Increase distance gradually as accuracy improves.",
    coachingPoints: [
      "SWEEP, POINT, FOLLOW THROUGH → Say: 'Push through the puck and point your blade at your target!'",
      "SOFT HANDS RECEIVING → Say: 'Cushion it like catching an egg!'",
      "KEEP MOVING → Say: 'Follow your pass every single time - no standing still!'",
    ],
    questionsToAsk: ["'What makes a pass easy to receive?' → Develops accuracy/weight awareness"],
    commonMistakes: [
      "SLAPPING AT THE PUCK → Say: 'Smooth sweep, not a slap!'",
      "STANDING STILL AFTER PASSING → Say: 'Feet moving - go follow your pass!'",
    ],
    variations: [
      {
        name: "Moving Targets",
        description: "Receiver skates side to side; passer must lead them with the pass.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Shorten distance, allow the puck to be received and passed back with extra time.",
    makeHarder: "Add a third station in a triangle so players must decide which partner to pass to.",
    equipmentNeeded: ["1 puck per pair", "cones"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["technical", "passing", "partners", "no-lines"],
  },
  {
    slug: "shootout-showdown",
    name: "Shootout Showdown",
    description:
      "Station-based shooting game where every player gets rapid-fire reps at a mini net with a rotating target, and the team total (not any one shooter's miss) is tracked - keeping the focus on attempts and improvement rather than individual pressure.",
    sport: "hockey",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 18,
    durationMinutes: 8,
    skillsDeveloped: ["shooting-wrist"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1-2 mini nets or shooting targets\n□ 6-8 pucks per shooting station\n□ Cones marking 2-3 shooting stations at varying distances\n\nSPACE: small, can run multiple stations at once so nobody waits in a long line",
    howToPlay:
      "1. Small groups of 2-3 rotate through a station: shoot 5 pucks each at the net, then jump to the next station (rebound retrieval, extra reps, etc.) - never a long line.\n2. SAY: 'Pull it back, snap your wrist, follow through at the target - not just at the net, but a SPOT in the net.'\n3. Coach or a teammate calls out a target spot (top corner, bottom corner) before each shot.\n4. Track a team tally: every puck that hits the called target spot is a team point.\n5. Rotate stations every 2 minutes so everyone shoots from every distance.",
    coachingPoints: [
      "PULL AND SNAP → Say: 'Heel to toe, then snap your wrists to get it up!'",
      "PICK YOUR SPOT → Say: 'Aim for the spot, not just the whole net!'",
      "QUICK RELEASE → Say: 'Don't wind up - quick and sharp!'",
    ],
    questionsToAsk: ["'What did you change to hit the corner that time?' → Develops self-correction"],
    commonMistakes: [
      "PUCK STAYS ON THE ICE → Say: 'Roll your wrists over at the end to lift it!'",
      "NO WEIGHT TRANSFER → Say: 'Push off your back foot into the shot!'",
    ],
    variations: [
      {
        name: "Partner Rebounds",
        description: "A partner feeds passes for one-timers instead of shooting off a stationary puck.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Move stations closer, use a bigger empty-net target, no called spot - just aim for the net.",
    makeHarder: "Move back, require the called-spot shot every time, add a passer feeding a one-timer.",
    equipmentNeeded: ["1-2 mini nets or targets", "6-8 pucks per station", "cones"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["technical", "shooting", "stations", "no-lines"],
  },
  {
    slug: "brave-shooter-challenge",
    name: "Brave Shooter Challenge",
    description:
      "Low-pressure shooting game built around trying and effort rather than results: every player takes a turn shooting while a partner announces something they did well before anything about the result, building the confidence to keep shooting after a miss.",
    sport: "hockey",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 7,
    skillsDeveloped: ["shooting-wrist", "confidence-hockey"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 mini net or empty net\n□ 1 puck per shooter\n\nSPACE: small, one shooting lane",
    howToPlay:
      "1. Pair players up; one shoots, one is the 'hype partner' standing beside the net.\n2. SAY: 'Before your partner tells you where it went, they have to tell you ONE thing you did well - your stance, your release, anything.'\n3. Shooter takes 3 shots in a row; hype partner calls out something good after each one before mentioning the result.\n4. Switch roles after 3 shots.\n5. SAY at the end: 'Who heard something new about their shot today?'",
    coachingPoints: [
      "CELEBRATE THE TRY → Say: 'Every shot is a rep - misses teach you something too!'",
      "NAME SOMETHING SPECIFIC → Say: 'Not just \"good job\" - what exactly did you see?'",
      "NEXT SHOT MINDSET → Say: 'Miss or score, next puck - here we go!'",
    ],
    questionsToAsk: [
      "'What's one thing your partner said you're doing well?' → Builds self-belief through peer feedback",
    ],
    commonMistakes: [
      "PARTNER ONLY TALKS ABOUT THE RESULT → Say: 'Result later - what did they do well first?'",
      "SHOOTER GETS DOWN AFTER A MISS → Say: 'Next puck! Everyone misses - what matters is the next one.'",
    ],
    variations: [
      {
        name: "Team Cheer Line",
        description: "Whole group lines up beside the net and cheers for every shooter, miss or goal, before rotating through.",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Move closer to net, use an empty net with no goalie, shorter sets of 2 shots.",
    makeHarder: "Add a passive goalie/pad in net, require a called target spot, longer sets of 5 shots.",
    equipmentNeeded: ["1 mini or empty net", "1 puck per shooter"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["fun", "shooting", "confidence", "partners", "no-lines"],
  },
  {
    slug: "c-cut-caterpillar-relay",
    name: "C-Cut Caterpillar Relay",
    description:
      "Backward-skating relay where a line of 3-4 players holds sticks end-to-end and must all C-cut backward together as one 'caterpillar' - a fun way to force full-power C-cuts and shared rhythm instead of the usual solo backward-skating drill.",
    sport: "hockey",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 6,
    skillsDeveloped: ["skating-backward"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ Cones marking a start and finish line, roughly 15-20 paces apart\n□ No pucks needed\n\nSPACE: small, can run 2-3 caterpillar lines side by side so nobody waits long",
    howToPlay:
      "1. Groups of 3-4 line up facing the same direction (backward direction of travel), each holding the stick blade of the player behind them.\n2. SAY: 'You're one caterpillar - everyone C-cuts backward together, same rhythm!'\n3. On 'GO', the whole line skates backward together using C-cuts to the finish cones.\n4. Switch which player leads the line each trip so everyone feels different positions.\n5. Run several short trips, celebrating smooth group rhythm over speed.",
    coachingPoints: [
      "C-CUTS, NOT SHUFFLING → Say: 'Push out with your inside edge, not little shuffle steps!'",
      "STAY LOW TOGETHER → Say: 'Bend those knees - the whole caterpillar stays low!'",
      "SWIVEL YOUR HEAD → Say: 'Check over your shoulder so nobody bumps the wall!'",
    ],
    questionsToAsk: ["'What happens if one person goes too fast?' → Builds rhythm and teamwork awareness"],
    commonMistakes: [
      "STANDING TOO UPRIGHT → Say: 'Sit down into it - low and athletic!'",
      "TURNING AROUND TO SKATE FORWARD → Say: 'Trust your C-cuts - stay facing this way!'",
    ],
    variations: [
      {
        name: "Solo C-Cut Sprints",
        description: "Once caterpillars are smooth, let confident groups race individually over the same distance.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Shorten the distance, groups of 2 instead of 3-4, allow a coach or helper to anchor the front.",
    makeHarder: "Lengthen the distance, add a gentle curve to the path, require a full stop-and-restart at the midpoint.",
    equipmentNeeded: ["cones"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["technical", "skating", "backward-skating", "relay", "no-lines"],
  },

  // ─── TACTICAL (5) ───────────────────────────────────────────────────────
  {
    slug: "corner-battle-tires",
    name: "Corner Tires",
    description:
      "Board-battle station adapted from the 'Corner Tires' concept (per Hockey Canada Drill Hub-style small-area battle drills): pairs compete for a puck settled against a cone or marker in the corner, learning to win 50-50 battles safely before the puck squirts to a mini net.",
    sport: "hockey",
    activityType: "tactical",
    difficulty: "beginner",
    minPlayers: 4,
    maxPlayers: 16,
    durationMinutes: 8,
    skillsDeveloped: ["defensive-play", "puck-control"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per pair\n□ Cones marking 2-4 'corner' stations\n□ 1 mini net per station\n\nSPACE: small, corner areas of the rink or marked zones",
    howToPlay:
      "1. Two players start shoulder to shoulder facing a puck placed against a cone in the corner.\n2. SAY: 'On my whistle, win the puck and get a shot on the mini net - stick on puck, feet moving!'\n3. Both players battle for possession using stick and body positioning (no slashing or tripping); whoever comes away with the puck tries to get a shot on the mini net.\n4. Reset with a new puck and rotate opponents after each battle.\n5. Track team points for wins, not individual records, to keep it low-pressure.",
    coachingPoints: [
      "STICK ON PUCK → Say: 'Get your blade on it first - active stick!'",
      "STAY LOW AND WIDE → Say: 'Wide base, low center of gravity - hard to move!'",
      "WIN IT, THEN DECIDE → Say: 'Win the battle first - THEN look for the net!'",
    ],
    questionsToAsk: ["'What helped you win that battle?' → Develops body-positioning awareness"],
    commonMistakes: [
      "REACHING WITH ONE HAND → Say: 'Two hands on the stick, full body into it!'",
      "GIVING UP AFTER LOSING FIRST TOUCH → Say: 'Battles aren't over after one touch - keep working!'",
    ],
    variations: [
      {
        name: "Support Battle",
        description: "Add a third player as a supporting outlet each corner player can pass to once they win the puck.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Softer battles (push only, no full stick contact), bigger corner area, coach places puck loosely rather than pinned.",
    makeHarder: "Add a mini net for each player (two possible outcomes), require a pass out before shooting.",
    equipmentNeeded: ["1 puck per pair", "cones", "mini nets"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["tactical", "battles", "defense", "compete", "small-area-game"],
  },
  {
    slug: "mini-net-1v1v1",
    name: "1v1v1 Mini Nets",
    description:
      "Three players, two mini nets set up back to back, one puck: everyone attacks one net and defends the other at the same time. A staple small-area-game format from USA Hockey ADM-style cross-ice stations that forces constant puck decisions and positional awareness with no waiting in line.",
    sport: "hockey",
    activityType: "game",
    difficulty: "intermediate",
    minPlayers: 3,
    maxPlayers: 18,
    durationMinutes: 8,
    skillsDeveloped: ["positioning-hockey", "shooting-wrist", "defensive-play"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 2 mini nets placed back-to-back, 10-12 paces apart\n□ 1 puck per group of 3\n\nSPACE: small, can run several triangles at once across the cross-ice zone",
    howToPlay:
      "1. Groups of 3 each get 2 mini nets facing opposite directions with one puck dropped between them.\n2. SAY: 'Every net you attack is also a net someone else is defending - and one of THOSE nets is yours to protect!'\n3. Whoever ends up with the puck can shoot at either net; the other two react - one becomes the immediate defender of whichever net is under attack.\n4. Play continuous 90-second shifts, tallying goals; whoever scored resumes with the puck for a face-off style drop.\n5. Rotate groups of 3 every couple of shifts.",
    coachingPoints: [
      "KNOW BOTH NETS → Say: 'Always know which net is yours to defend AND which one you can attack!'",
      "QUICK DECISIONS → Say: 'Shoot, protect, or battle - decide fast!'",
      "GAP CONTROL → Say: 'Close the space down before they get a clean shot!'",
    ],
    questionsToAsk: ["'How did you know which net to defend?' → Develops game-reading and positioning"],
    commonMistakes: [
      "BALL-WATCHING BOTH NETS AT ONCE → Say: 'Puck first - react to where it actually goes!'",
      "NOT SHOOTING WHEN OPEN → Say: 'If the net's open, take it - don't wait!'",
    ],
    variations: [
      {
        name: "2v1v1",
        description: "Add a 4th player so two attack one net while the others share defensive duty - a gentle step toward small-area 2v1 reads.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Wider nets, more space between nets, allow a 'safe' 3-second hold before anyone can check.",
    makeHarder: "Smaller nets, closer together, one-touch shots only near the net.",
    equipmentNeeded: ["2 mini nets per group of 3", "1 puck per group"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "small-area-game", "positioning", "shooting", "cross-ice"],
    featured: true,
  },
  {
    slug: "king-of-the-rink",
    name: "King (or Queen) of the Rink",
    description:
      "Adapted from the King/Queen of the Hill small-area-game concept: a central marked zone holds one puck at a time, and players race in to gain control and hold it for a 3-count to score a point before passing it back to the middle for the next round. Points-based by default - nobody is knocked out of the game.",
    sport: "hockey",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 8,
    skillsDeveloped: ["positioning-hockey", "puck-control", "confidence-hockey"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck\n□ Cones marking a small center circle (4-5 paces across)\n□ Cones marking each player's starting spot around the circle\n\nSPACE: small, center-ice circle or a marked zone works well",
    howToPlay:
      "1. All players start spread evenly around the marked center circle; one puck sits in the middle.\n2. SAY: 'Race in, win the puck, and control it inside the circle for a 3-count - that's your point! Then it goes back to the middle for the next round.'\n3. On 'GO', players race to the puck and battle to gain clean control inside the circle boundary.\n4. Whoever holds it for a coach's 3-count scores a point and returns to their spot; puck resets to the middle for the next round.\n5. Play several short rounds, tallying total points per player - everyone stays in the game the whole time.",
    coachingPoints: [
      "GET LOW AND WIDE → Say: 'Wide stance, low center of gravity - own that space!'",
      "PROTECT ONCE YOU HAVE IT → Say: 'Body between the puck and everyone else!'",
      "EVERY ROUND IS A FRESH START → Say: 'Didn't get it that time? Next round - go again!'",
    ],
    questionsToAsk: ["'What worked to win the puck that round?' → Develops competitive problem-solving"],
    commonMistakes: [
      "STANDING OUTSIDE THE CIRCLE WATCHING → Say: 'Get in there - go compete for it!'",
      "LOSING THE PUCK RIGHT AWAY AFTER WINNING IT → Say: 'Once you have it, get low and protect it!'",
    ],
    variations: [
      {
        name: "Throne Challenge (advanced/skill-building only)",
        description:
          "For older or highly competitive skill-building groups ready for real stakes: switch to a true king-of-the-hill format where the current point leader must be dethroned to score, and a running leaderboard is kept visible. Keep the points-based default above for fundamentals-age or mixed-ability groups so nobody feels 'out.'",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Bigger circle, longer control window before checking is allowed (soft-touch rule), shorter hold count (2-count).",
    makeHarder: "Smaller circle, immediate contact allowed within the rules, longer hold count (5-count), add a second puck for two simultaneous battles.",
    equipmentNeeded: ["1 puck", "cones"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "puck-control", "positioning", "confidence", "small-area-game"],
  },
  {
    slug: "gap-control-gauntlet",
    name: "Gap Control Gauntlet",
    description:
      "1v1 skating-backward defense drill through a short gauntlet of attackers, teaching defenders to maintain the right gap distance instead of either turning and fleeing or overcommitting and getting beat.",
    sport: "hockey",
    activityType: "tactical",
    difficulty: "intermediate",
    minPlayers: 6,
    maxPlayers: 18,
    durationMinutes: 8,
    skillsDeveloped: ["defensive-play", "positioning-hockey"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ Pucks for attackers\n□ Cones marking a lane roughly 15 paces long\n□ Pinnies to tell defenders and attackers apart\n\nSPACE: small, one lane per group of 4-6, can run several at once",
    howToPlay:
      "1. One defender starts at the top of the lane facing an attacker with a puck at the far end.\n2. SAY: 'Stay a stick's length away the whole time - too close and they blow by you, too far and they've got all the room in the world.'\n3. Attacker skates at the defender and tries to get past into the lane; defender skates backward, matching speed and maintaining gap, trying to angle the attacker wide.\n4. Whether the attacker gets by or the defender pins them wide, both skate to the back of the opposite line and go again.\n5. Rotate attacker/defender roles every few reps.",
    coachingPoints: [
      "MATCH THEIR SPEED → Say: 'Don't backpedal faster or slower than they're coming!'",
      "ANGLE, DON'T CHASE → Say: 'Push them toward the boards, not straight backward!'",
      "STICK ON PUCK → Say: 'Active stick the whole time - make them deal with it!'",
    ],
    questionsToAsk: ["'What happens if you get too close too early?' → Builds gap-control understanding"],
    commonMistakes: [
      "TURNING TO SKATE FORWARD TOO SOON → Say: 'Stay facing them - trust your backward skating!'",
      "STANDING STILL WAITING → Say: 'Keep your feet moving even before they get close!'",
    ],
    variations: [
      {
        name: "2v1 Gauntlet",
        description: "Add a passing option for the attacker so the defender must also read a pass, not just the puck carrier.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Longer lane for more reaction time, attacker starts slower, no angling requirement (just stay in front).",
    makeHarder: "Shorter lane, attacker gets a head start, require the defender to angle all the way to the boards.",
    equipmentNeeded: ["pucks", "cones", "pinnies"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["skill-building"],
    tags: ["tactical", "defense", "positioning", "1v1", "skill-building"],
  },
  {
    slug: "breakout-relay-race",
    name: "Breakout Relay Race",
    description:
      "Simplified breakout relay that teaches the 'get to your spot' habit at the heart of transition play: teams race to complete a very simple 3-pass breakout pattern from their own zone before sprinting to a finish line, without any of the complexity of a full system.",
    sport: "hockey",
    activityType: "tactical",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 18,
    durationMinutes: 8,
    skillsDeveloped: ["transition-breakout", "skating-forward"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per team of 3\n□ Cones marking 3 breakout spots (behind net, along the wall, at the blue line) and a finish line\n\nSPACE: medium, one defensive zone to blue line per team",
    howToPlay:
      "1. Teams of 3 line up at 3 marked spots: one behind the net with the puck, one at the wall, one past the blue line.\n2. SAY: 'Get to your spot fast, then move the puck through all three of you before anyone crosses the finish line!'\n3. On 'GO', the puck carrier passes to the wall player, who passes up to the blue-line player, who carries it across the finish line.\n4. Time each team's run (or just race them side by side); everyone rotates through all three spots across several runs.\n5. SAY: 'What made that breakout fast?' after each heat.",
    coachingPoints: [
      "GET TO YOUR SPOT FIRST → Say: 'Don't wait for the puck to come to you - get there early!'",
      "GIVE AN OPTION → Say: 'Show your teammate you're ready - stick on the ice, call for it!'",
      "MOVE YOUR FEET THROUGH THE PASS → Say: 'Keep skating even as you receive it!'",
    ],
    questionsToAsk: ["'Why does getting to your spot early help?' → Builds transition-game understanding"],
    commonMistakes: [
      "STANDING STILL WAITING FOR THE PUCK → Say: 'Keep moving - be a moving target, not a statue!'",
      "EVERYONE BUNCHING AT ONE SPOT → Say: 'Spread out - three different spots, remember?'",
    ],
    variations: [
      {
        name: "Pressure Breakout",
        description: "Add one passive forechecker who can only intercept passes (no body contact) to add mild decision pressure.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Reduce to 2 passes instead of 3, widen the lane, let the same player repeat a spot if needed.",
    makeHarder: "Add the passive forechecker variation, require a specific forehand/backhand pass at each spot.",
    equipmentNeeded: ["1 puck per team", "cones"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["tactical", "transition", "breakout", "team", "no-lines"],
  },

  // ─── PHYSICAL (3) ───────────────────────────────────────────────────────
  {
    slug: "border-tag-hockey",
    name: "Border Tag",
    description:
      "USA Hockey ADM's own 8U station pick, adapted here: a continuous, no-elimination tag game inside a marked zone where 'it' players try to tag others, but tagged players simply do a quick balance task and rejoin - pure open-ice edge work and acceleration with everyone moving the whole time.",
    sport: "hockey",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 6,
    skillsDeveloped: ["edge-work-balance", "speed-acceleration"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 2-3 pinnies for 'it' players\n□ Cones marking the zone border\n\nSPACE: medium open zone, roughly 30x30 paces, no pucks or sticks needed for this one",
    howToPlay:
      "1. SAY: 'This is Border Tag - stay inside the cones! If you get tagged, do a quick 2-foot glide and a hockey stop, then you're back in.'\n2. 2-3 taggers wear pinnies and try to tag anyone inside the zone by touching their shoulder.\n3. Tagged players immediately do one balance move (a glide, a hockey stop, or a tight turn around a cone) and rejoin - no sitting out.\n4. Rotate taggers every 60-90 seconds so everyone gets a turn.\n5. SAY: 'Taggers, how many tags can you get this round?'",
    coachingPoints: [
      "QUICK FEET TO ESCAPE → Say: 'Short, sharp strides to change direction fast!'",
      "STAY LOW → Say: 'Bend your knees - you're harder to catch when you're low!'",
      "USE YOUR EDGES → Say: 'Lean into that turn - trust your edges to grip!'",
    ],
    questionsToAsk: ["'What edge move helped you escape a tagger?' → Builds edge-awareness vocabulary"],
    commonMistakes: [
      "RUNNING STRAIGHT LINES ONLY → Say: 'Cut and change direction - don't just skate straight away!'",
      "STANDING UP TOO TALL → Say: 'Get low - harder to tag and quicker to turn!'",
    ],
    variations: [
      {
        name: "Puck Border Tag",
        description: "Everyone carries a puck while playing, adding a light puck-control layer to the tag game.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Bigger zone, fewer taggers (1 per 10-12 players), simpler rejoin task (just a glide).",
    makeHarder: "Smaller zone, more taggers (1 per 5-6 players), require a hockey stop on both sides to rejoin.",
    equipmentNeeded: ["2-3 pinnies", "cones"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["warmup", "edge-work", "agility", "fun", "no-lines"],
    featured: true,
  },
  {
    slug: "crossover-cone-course",
    name: "Crossover Cone Course",
    description:
      "Simple figure-eight cone course that turns crossover practice into a game: pairs race side by side through mirrored cone patterns, focusing on smooth 'cross over, not under' technique rather than pure speed.",
    sport: "hockey",
    activityType: "technical",
    difficulty: "intermediate",
    minPlayers: 4,
    maxPlayers: 18,
    durationMinutes: 7,
    skillsDeveloped: ["edge-work-balance"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 6-8 cones per course, set in a figure-eight pattern\n□ 2+ identical courses side by side for racing pairs\n\nSPACE: small, one course roughly 10x15 paces",
    howToPlay:
      "1. SAY: 'Follow the figure-eight - crossover around each loop, don't just turn your feet flat.'\n2. Players take turns skating the figure-eight, using crossovers (not just turning) around each loop of cones.\n3. Run in pairs on matching courses so it feels like a friendly race, not a solo drill.\n4. After each pass, SAY one thing you saw: 'Nice cross-over on that first loop!'\n5. Repeat 4-6 times, gradually asking for tighter turns as technique improves.",
    coachingPoints: [
      "CROSS OVER, NOT UNDER → Say: 'One skate crosses cleanly over the other - not tangled underneath!'",
      "STAY LOW THROUGH THE TURN → Say: 'Knees bent the whole way around!'",
      "OUTSIDE-INSIDE EDGES → Say: 'Feel the edge change as you go around!'",
    ],
    questionsToAsk: ["'Which loop felt smoothest and why?' → Builds self-awareness of edge technique"],
    commonMistakes: [
      "STANDING UP THROUGH THE TURN → Say: 'Stay down - low the whole way around!'",
      "FEET TANGLING ON THE CROSSOVER → Say: 'Slow it down - clean crossover before speed!'",
    ],
    variations: [
      {
        name: "Puck Crossover Course",
        description: "Confident groups run the same course while carrying a puck.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Widen the loops, fewer cones, allow a regular turn before introducing the crossover requirement.",
    makeHarder: "Tighten the loops, add a second figure-eight back to back, add the puck-carrying variation.",
    equipmentNeeded: ["6-8 cones per course"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["technical", "edge-work", "crossovers", "course"],
  },
  {
    slug: "sprint-to-the-puck",
    name: "Sprint to the Puck",
    description:
      "Simple race-based warmup where pairs sprint from a stationary start to a puck placed at varying distances, turning raw acceleration work into a fun, low-stakes competition rather than a straight-line fitness sprint.",
    sport: "hockey",
    activityType: "conditioning",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 20,
    durationMinutes: 6,
    skillsDeveloped: ["speed-acceleration", "skating-forward"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per pair of racers\n□ Cones marking the starting line\n\nSPACE: medium, open straightaway roughly 20-30 paces",
    howToPlay:
      "1. Pairs line up at the starting cone; one puck is placed at a marked distance ahead.\n2. SAY: 'Explode on my whistle - first to gain control of the puck wins that round!'\n3. On the whistle, both racers sprint to the puck; whoever gets clean control first wins the round (no contact - first touch wins).\n4. Vary the distance each round (short, medium, long) so different starts and top-speed strides both get practiced.\n5. Rotate racing partners so everyone faces a range of speeds.",
    coachingPoints: [
      "EXPLODE FIRST THREE STRIDES → Say: 'Powerful first steps - dig in!'",
      "DRIVE YOUR ARMS → Say: 'Pump those arms for extra power!'",
      "STAY LOW ACCELERATING → Say: 'Low and driving, then rise up as you hit top speed!'",
    ],
    questionsToAsk: ["'What helped you get there first that round?' → Builds effort-and-technique awareness"],
    commonMistakes: [
      "STANDING TOO UPRIGHT AT THE START → Say: 'Lean into it - low and explosive off the line!'",
      "GIVING UP WHEN BEHIND → Say: 'Chase it down - keep pushing to the very end!'",
    ],
    variations: [
      {
        name: "Shot Finish",
        description: "Whoever wins the puck immediately takes a shot on a mini net to add a finishing element.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Shorter distances, pair players of similar speed, allow a rolling start instead of a standstill.",
    makeHarder: "Longer distances, add the shot-finish variation, stagger starts so a slower skater gets a head start to chase down.",
    equipmentNeeded: ["1 puck per pair", "cones"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["conditioning", "speed", "acceleration", "races", "fun"],
  },

  // ─── PSYCHOLOGICAL (4) ──────────────────────────────────────────────────
  {
    slug: "musical-pucks",
    name: "Musical Pucks",
    description:
      "Adapted from the 'Musical Pucks' small-area-game concept, reworked to our elimination-free default: one fewer puck than players sits in the middle, music (or a coach clap) starts and stops skating, and whoever ends up without a puck simply does a quick skill task and earns a point-recovery chance rather than being knocked out.",
    sport: "hockey",
    activityType: "fun",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 16,
    durationMinutes: 6,
    skillsDeveloped: ["competitiveness", "skating-forward"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ One fewer puck than players, placed in a circle in the middle\n□ Cones marking a skating loop around the pucks\n□ Music/whistle to start and stop\n\nSPACE: small, a circle roughly 15 paces across",
    howToPlay:
      "1. SAY: 'Skate around the circle while the music plays. When it stops, race in and grab a puck!'\n2. Players skate a loop around the center pucks while music plays (or the coach claps a rhythm).\n3. When the music/clap stops, everyone races to grab a puck - there's one fewer puck than players.\n4. Whoever doesn't get a puck does a quick task (3 toe taps, or naming one thing they'll try differently) and STAYS IN for the next round - a puck is added back so the group total stays one under the player count.\n5. Play several rounds; track who grabs the most pucks across the whole game as a fun tally, not a cut.",
    coachingPoints: [
      "LISTEN AND WATCH → Say: 'Keep an ear out - the music could stop any second!'",
      "QUICK REACTION → Say: 'First move when it stops - go!'",
      "NO PUCK THIS TIME? NO PROBLEM → Say: 'Quick task, and you're right back in for the next round!'",
    ],
    questionsToAsk: ["'How did it feel to miss a puck and jump right back in?' → Builds resilience"],
    commonMistakes: [
      "SKATING TOO FAST/RECKLESS NEAR THE CENTER → Say: 'Control your speed coming into the circle - safety first!'",
      "GETTING DISCOURAGED AFTER MISSING → Say: 'Everyone misses sometimes - quick task, then you're back!'",
    ],
    variations: [
      {
        name: "Elimination Musical Pucks (skill-building/advanced only)",
        description:
          "For older or highly competitive skill-building groups who want real stakes: run the classic sit-out version where whoever misses a puck is out until one champion remains. Keep the points/rejoin default above for fundamentals-age or mixed-ability groups so nobody spends the round on the bench.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "Bigger circle, slower music tempo, only remove a puck every third round instead of every round.",
    makeHarder: "Smaller circle, remove two pucks at a time, require players to skate backward during the music.",
    equipmentNeeded: ["pucks (one fewer than players)", "cones", "music or whistle"],
    spaceRequired: "small",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["fun", "competitiveness", "skating", "no-lines"],
  },
  {
    slug: "read-and-react-hockey",
    name: "Read & React",
    description:
      "Simple color/number cue game that builds early decision-making: players skate freely with a puck and must react instantly to a called cue (shoot, pass, protect, freeze), building the habit of reading a signal and choosing the right response under mild time pressure.",
    sport: "hockey",
    activityType: "tactical",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 18,
    durationMinutes: 7,
    skillsDeveloped: ["hockey-iq"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 1 puck per player\n□ 2-3 mini nets scattered in the zone\n□ Cones marking the zone\n\nSPACE: medium, cross-ice zone",
    howToPlay:
      "1. SAY: 'Skate around with your puck. When I call something out, react as fast as you can!'\n2. Players skate freely, cushioning their own puck, listening for a called cue: 'SHOOT' (find the nearest mini net and shoot), 'PASS' (find a nearby teammate and pass), 'PROTECT' (stop and shield the puck from an imaginary defender), or 'FREEZE' (stop completely, puck under control).\n3. Call cues every 10-15 seconds in random order; watch who reacts fastest and correctly.\n4. After a few rounds, SAY: 'What made that easy or hard to decide fast?'\n5. Increase cue speed as the group gets comfortable.",
    coachingPoints: [
      "LISTEN WHILE SKATING → Say: 'Ears open even while you're moving and handling the puck!'",
      "REACT, DON'T FREEZE UP → Say: 'Trust your first read - go with it!'",
      "SCAN FOR OPTIONS EARLY → Say: 'Know where the nearest net or teammate is BEFORE the cue!'",
    ],
    questionsToAsk: [
      "'How did you know where to pass so fast?' → Develops anticipation and scanning habits",
    ],
    commonMistakes: [
      "FREEZING UP ON THE CUE → Say: 'Any decision is better than no decision - go with your gut!'",
      "NOT SCANNING BEFOREHAND → Say: 'Look around between cues so you're ready when it comes!'",
    ],
    variations: [
      {
        name: "Partner Read & React",
        description: "Run in pairs so 'PASS' always has a guaranteed partner, simplifying the read for younger groups.",
        difficulty: "beginner",
      },
    ],
    makeEasier: "Fewer cue types (just SHOOT and FREEZE), slower calling pace, run in partner pairs.",
    makeHarder: "Add more cue types, call cues faster, require players to name WHY they chose that option out loud.",
    equipmentNeeded: ["1 puck per player", "2-3 mini nets", "cones"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["tactical", "hockey-iq", "decision-making", "fun"],
  },
  {
    slug: "clash-of-corners",
    name: "Clash of Corners",
    description:
      "Small-team points game where two or three teams battle for loose pucks scattered across marked zones, banking points for their team's bucket - built to reward hustle and effort (competitiveness) without any single player or team ever being knocked out.",
    sport: "hockey",
    activityType: "game",
    difficulty: "beginner",
    minPlayers: 8,
    maxPlayers: 24,
    durationMinutes: 9,
    skillsDeveloped: ["competitiveness", "defensive-play"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ 15-20 pucks scattered across the zone\n□ Pinnies for 2-3 teams\n□ 1 bucket/net per team along the boards\n\nSPACE: medium, full cross-ice zone",
    howToPlay:
      "1. SAY: 'Loose pucks everywhere - race, battle, and bring them back to YOUR bucket. Whoever's team banks the most wins!'\n2. On 'GO', players from every team race to loose pucks; if two players from different teams reach one at the same time, it's a quick stick-on-puck battle (no slashing) for possession.\n3. Whoever wins the puck carries or passes it back to their own team's bucket/net for a point.\n4. Once all pucks are collected, coach dumps them back into the middle and play continues.\n5. Run 2-3 rounds of 2-3 minutes; total the team points at the end.",
    coachingPoints: [
      "RACE FOR EVERY LOOSE PUCK → Say: 'First one there wins it - hustle!'",
      "COMPETE, DON'T QUIT → Say: 'Lost that battle? Next puck - go again!'",
      "SUPPORT YOUR TEAMMATES → Say: 'Help a teammate who's in a battle - be an outlet!'",
    ],
    questionsToAsk: ["'What did your team do well to win more pucks?' → Builds team-effort awareness"],
    commonMistakes: [
      "ONE PLAYER TRYING TO DO EVERYTHING → Say: 'Spread out - cover more ground as a team!'",
      "STANDING NEAR THE BUCKET WAITING → Say: 'Go get pucks - don't just wait for them to come to you!'",
    ],
    variations: [
      {
        name: "Golden Puck Sudden Death (skill-building/advanced only)",
        description:
          "For older or highly competitive skill-building groups: after the regular rounds, mark one puck as the 'golden puck' worth 3 points and let the tied leaders battle for it as a decisive finish. Keep the standard bucket-total format above as the default so every team's effort counts the whole game.",
        difficulty: "advanced",
      },
    ],
    makeEasier: "More pucks than players so battles are rare, bigger buckets/nets, softer 'first touch wins' rule instead of a stick battle.",
    makeHarder: "Fewer pucks so battles are frequent, buckets farther from the action, require a pass (not a carry) into the bucket.",
    equipmentNeeded: ["15-20 pucks", "pinnies for 2-3 teams", "buckets or small nets"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals", "skill-building"],
    tags: ["game", "competitiveness", "team", "battles", "small-area-game"],
  },
  {
    slug: "red-light-green-light-on-ice",
    name: "Red Light, Green Light on Ice",
    description:
      "The classic playground game on skates: players skate forward on 'green light' and must stop under full control on 'red light,' building the confidence to skate at full speed while still trusting their stops - a low-pressure way to reward both speed and control equally.",
    sport: "hockey",
    activityType: "warmup",
    difficulty: "beginner",
    minPlayers: 6,
    maxPlayers: 24,
    durationMinutes: 6,
    skillsDeveloped: ["confidence-hockey", "skating-forward"],
    setupInstructions:
      "EQUIPMENT CHECKLIST\n□ Cones marking a start line and a finish line, 20-25 paces apart\n□ No pucks needed\n\nSPACE: medium, one straightaway, can run several lines side by side",
    howToPlay:
      "1. All players line up along the start cone facing the coach at the finish end.\n2. SAY: 'GREEN LIGHT!' - everyone skates forward at full speed.\n3. SAY: 'RED LIGHT!' - everyone must stop completely under control (a hockey stop or snowplow, whichever they've got); anyone who slides past their stop just resets a step back and keeps playing - no elimination.\n4. First few to reach the finish line under a 'green light' call are cheered as that round's finishers; everyone keeps playing every round.\n5. Mix in 'YELLOW LIGHT' (slow skate) for extra fun and control practice.",
    coachingPoints: [
      "FULL SPEED ON GREEN → Say: 'Really go for it - trust your speed!'",
      "CONTROLLED STOP ON RED → Say: 'Bend your knees and dig those edges in!'",
      "IT'S OKAY TO SLIDE A LITTLE → Say: 'No big deal - reset and keep playing!'",
    ],
    questionsToAsk: ["'What helped you stop faster that time?' → Builds stopping-technique awareness"],
    commonMistakes: [
      "NOT GOING FULL SPEED (holding back) → Say: 'Green light means GO - full speed!'",
      "STANDING STRAIGHT UP TO STOP → Say: 'Bend your knees to stop quickly and safely!'",
    ],
    variations: [
      {
        name: "Puck Red Light Green Light",
        description: "Confident groups carry a puck the whole game, adding a light puck-control layer.",
        difficulty: "intermediate",
      },
    ],
    makeEasier: "Shorter distance, allow a snowplow stop instead of requiring a hockey stop, more frequent green lights.",
    makeHarder: "Longer distance, require a hockey stop on the whistle-called side (left or right), add the puck-carrying variation.",
    equipmentNeeded: ["cones"],
    spaceRequired: "medium",
    indoorSuitable: true,
    appropriateStages: ["fundamentals"],
    tags: ["warmup", "skating", "confidence", "fun", "no-lines"],
  },
];

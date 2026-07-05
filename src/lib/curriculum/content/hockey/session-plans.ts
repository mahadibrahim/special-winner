// Hockey session plans: wave-2 original build-out (refinery/refine-2026-07-05-wave2).
//
// Like hockey/activities.ts, there is no prior source for hockey session plans
// anywhere in the recovery set -- these 4 plans are authored fresh against:
//   - docs/curriculum/content-architecture.md (Session Plan Format)
//   - docs/curriculum/research/2026-07-05-brief.md §1 (USA Hockey ADM station
//     structure, 70/20/10 skills/small-area-games/team mix, Hockey Canada
//     weekly rhythm of 1 skills session + 1 small-area-games session + 1 game)
//
// Design: the 4 plans form a progression across a fundamentals-stage (ages
// 6-8) team's early season, each built as ADM-style station rotations rather
// than lines:
//   1. First Skate Comfort        -- comfort/confidence on skates & with a puck
//   2. Puck Control Stations       -- individual puck-control skill focus
//   3. Passing & Support           -- moving the puck with a partner/team
//   4. Small-Area Games Day        -- mostly small-area games + light team play,
//                                     mirroring Hockey Canada's SAG-day rhythm
//
// In technical/tactical/game segments, every activity named in
// activitySuggestions/coachingScript is a real entry from ./activities.ts
// (name matched exactly) -- no invented activity names. Warmup and cooldown
// segments may instead use informal labels for free-play or routine moments
// (e.g. "Free skating with a puck", "Team huddle", "Light stretching") that
// are not ./activities.ts catalog entries -- they describe what's happening,
// not a named drill. Segment durations are the session's own pacing and do
// not need to equal the referenced activity's standalone durationMinutes;
// ADM materials describe stations as flexible 4-10 minute blocks depending on
// group size and rotation overhead, which is what these totals reflect.
//
// Every plan sets stage: "fundamentals" per the task directive. Total plan
// durations land at 49-53 minutes, inside the ~50-60 min band and matching
// the brief's "50-minute usable ice" convention (Zamboni cuts, late arrivals,
// and gear-up time eat the rest of a typical 60-minute ice slot).

import type { SessionPlanContent } from "../types";

export const HOCKEY_SESSION_PLANS: SessionPlanContent[] = [
  {
    name: "First Skate Comfort - Cross-Ice Confidence Day",
    sport: "hockey",
    stage: "fundamentals",
    durationMinutes: 50,
    structure: [
      {
        name: "Arrival & Free Skate",
        type: "warmup",
        durationMinutes: 5,
        description:
          "As players arrive and get gear on, they free-skate in the cross-ice zone with a puck - no instructions, just comfort time.",
        activitySuggestions: ["Free skating with a puck"],
        coachingScript:
          "SETUP (arrive 10 min early):\n- Mark the cross-ice zone with cones at all four corners (blue line to blue line, or roughly 25x30 paces)\n- Put a puck bucket at the bench door\n\nAS PLAYERS ARRIVE:\n- Greet each player at the bench: \"Hey [Name]! Grab a puck and skate around - see how many times you can touch it with your stick before you get to the far blue line!\"\n- Let nervous players hang on the boards and push off if needed - no pressure to skate fast\n- Skate a lap yourself near the newest or shyest players\n\nWATCH FOR:\n- Players who are hesitant to leave the boards - skate alongside them, don't rush\n- Players who look confident already - let them explore, this is diagnostic time for you\n- Anyone who arrived without full gear on properly (helmet strap, etc.) - fix safety issues immediately, quietly",
      },
      {
        name: "Red Light, Green Light on Ice",
        type: "warmup",
        durationMinutes: 8,
        description:
          "Whole-group stop/start game that gets everyone skating forward and stopping under control, with confidence-building energy.",
        activitySuggestions: ["Red Light, Green Light on Ice"],
        coachingScript:
          "GATHER (0:05):\n- Whistle or wave your stick overhead: \"Everyone come to me - bring your puck!\"\n- \"We're playing Red Light, Green Light! GREEN means skate, RED means stop - any way you can, even if it's a big wobbly stop!\"\n\nRUN THE GAME (7 minutes):\n- \"GREEN LIGHT!\" (let them go 5-8 seconds)\n- \"RED LIGHT!\" - celebrate every stop, wobbly or not: \"[Name], you stopped! That counts!\"\n- Mix in \"YELLOW LIGHT\" for slow skating between reds\n- Every few rounds add: \"This time, RED LIGHT means show me your best snowplow stop!\"\n- Let 2-3 confident players call out the colors themselves\n\nCOACHING POINTS:\n- BENT KNEES → Say: \"Sit down into your skates like you're sitting on a stool!\"\n- ARMS OUT FOR BALANCE → Say: \"Wings out if you feel wobbly!\"\n- ANY STOP COUNTS → Say: \"Skates stopped moving? That's a stop - great job!\"\n\nWATCH FOR:\n- Players stopping only by falling or grabbing the boards - gently demo a two-foot snowplow next to them\n- Players who never fully stop (keep gliding) - shorten the green-light bursts for them specifically\n- Rising confidence - if the whole group is stopping cleanly, speed up the color changes\n\nTRANSITION TO NEXT:\n\"Great stopping, everyone! Now let's split into two groups for some puck games!\"",
      },
      {
        name: "Comfort Stations: Toy Finder + Caterpillar Relay",
        type: "technical",
        durationMinutes: 15,
        description:
          "Two parallel stations players rotate through - Toy Finder (puck-carrying + scanning) and C-Cut Caterpillar Relay (backward skating in a fun group format). Split the group in half; each half gets ~7 minutes per station with a quick switch.",
        activitySuggestions: ["Toy Finder", "C-Cut Caterpillar Relay"],
        coachingScript:
          "SETUP (during previous activity's last minute):\n- Station A (one end of the zone): scatter 15-20 colored pucks/cones in 3-4 colors with a bucket per color - this is Toy Finder\n- Station B (other end): cones marking a 15-20 pace start/finish lane - this is C-Cut Caterpillar Relay, run 2-3 lines side by side so nobody waits\n\nSPLIT THE GROUP (0:13):\n- \"Count off - 1s go to the colorful station with [assistant coach], 2s come with me for caterpillar relays!\"\n\nSTATION A - TOY FINDER:\n- \"Keep your own puck the whole time, and go collect matching-colored toys into the buckets!\"\n- Walk the group through Toy Finder's play pattern (skate + carry own puck, scan for colors, drop in matching bucket)\n- Key phrase: \"Look up between touches - where's the next toy?\"\n\nSTATION B - C-CUT CATERPILLAR RELAY:\n- Groups of 3-4 hold sticks blade-to-blade, facing backward direction of travel\n- \"You're one caterpillar - everyone C-cuts backward together, same rhythm!\"\n- Key phrase: \"Push out with your inside edge, not little shuffle steps!\"\n- Rotate who leads the line each trip\n\nSWITCH (0:20):\n- \"Freeze! Groups, switch stations - go!\" (30-second transition)\n- Repeat both stations with the other half\n\nWATCH FOR:\n- Toy Finder: players stopping completely to look down at their puck (say: \"Quick peek down, then eyes up!\")\n- Caterpillar Relay: players standing too upright (say: \"Sit down into it - low and athletic, whole caterpillar together!\")\n- Either station: a player checked out or standing still - bring them in with a specific, easy job (\"Can you be the caterpillar leader this trip?\")\n\nTRANSITION TO NEXT:\n\"Everybody back to the middle - great work at both stations! Time for a fun game.\"",
      },
      {
        name: "Small-Area Game: Musical Pucks",
        type: "game",
        durationMinutes: 8,
        description:
          "Points-based musical-pucks game (no elimination for this age group) - keeps everyone moving, listening, and grabbing a puck with a smile.",
        activitySuggestions: ["Musical Pucks"],
        coachingScript:
          "TRANSITION (0:35):\n- \"New game - Musical Pucks! But everybody stays in, nobody sits out.\"\n- Scatter one fewer puck than players in the center circle\n\nEXPLAIN & PLAY:\n- \"Skate around the circle while the music/whistle goes. When it stops, grab ANY puck - if you don't get one, do 3 quick stick taps and jump into the next round!\"\n- Run 4-5 short rounds, removing one puck each round but keeping everyone playing (missed-puck players do a quick task and rejoin immediately)\n- SAY between rounds: \"Who got a puck that time? High stick taps for everyone who's still smiling!\"\n\nCOACHING POINTS:\n- HEAD UP → Say: \"Skate and look for open pucks, not just straight ahead!\"\n- QUICK REACTION → Say: \"Whistle blows - fastest stick wins that puck!\"\n- NO SULKING → Say: \"Missed one? 3 taps and you're right back in!\"\n\nWATCH FOR:\n- Anyone getting discouraged after missing a puck a few times in a row - quietly angle the next round so a puck lands near them\n- Players bumping/reaching unsafely for a puck - remind: \"Stick on the ice, no pushing!\"\n\nTRANSITION TO NEXT:\n\"Great energy! Last game - time to protect your pond!\"",
      },
      {
        name: "Small-Area Game: Protect Your Pond",
        type: "game",
        durationMinutes: 9,
        description:
          "Every player guards their own small puck-control zone while trying to poke pucks out of neighboring zones - builds shielding and the confidence to compete without fear of losing the puck.",
        activitySuggestions: ["Protect Your Pond"],
        coachingScript:
          "SETUP (0:43):\n- One hoop/cone circle + one puck per player, spaced 3-4 paces apart in a loose grid\n\nEXPLAIN & PLAY:\n- \"Your puck lives in your pond. Keep it in YOUR pond, and try to poke someone else's out of theirs!\"\n- Run 3 short 60-second rounds, mixing up pond neighbors between rounds\n- Every round, SAY: \"Freeze! Who still has their puck in their pond right now?\" - celebrate as a team, not individually\n\nCOACHING POINTS:\n- BODY BETWEEN → Say: \"Shoulder between your pond and anyone reaching in!\"\n- STAY LOW → Say: \"Bend your knees - low is hard to poke off the puck!\"\n- NO BIG DEAL → Say: \"Puck got away? Go get it and jump right back in!\"\n\nWATCH FOR:\n- Players standing straight up and getting poked easily - remind them to sit low into their stance\n- A player giving up after losing their puck once - specifically encourage them by name next round\n\nTRANSITION TO NEXT:\n\"Bring it in! Everybody did such a great job protecting their pond today.\"",
      },
      {
        name: "Team Cheer & Cooldown",
        type: "cooldown",
        durationMinutes: 5,
        description:
          "Gather, recap what was learned, light stretching, team cheer, and a note for parents at the door.",
        activitySuggestions: ["Team huddle", "Light stretching"],
        coachingScript:
          "GATHER (0:45):\n- \"Everyone glide in and take a knee around me!\"\n\nRECAP (2 min):\n- \"What did we work on today?\" - let a few kids answer (stopping, skating backward, protecting the puck)\n- \"I saw some AWESOME stops and some great puck protection today.\"\n\nLIGHT STRETCH (1 min):\n- Quad stretch holding the boards, ankle rolls, big arm circles\n\nTEAM CHEER (1 min):\n- \"Sticks in the middle! On three - 1, 2, 3, [TEAM NAME]!\"\n\nPARENT NOTE (1 min, as players exit):\n- \"We worked on stopping and puck protection today - ask [Name] to show you their snowplow stop!\"\n- Remind next practice's time and any equipment needs\n\nWATCH FOR:\n- Kids who look tired vs. still buzzing with energy - note it for next practice's intensity\n- Any equipment issues to flag for parents on the way out",
      },
    ],
    description:
      "A 50-minute first-in-the-progression session for fundamentals-stage skaters (ages 6-8) built entirely around comfort and confidence: stopping, backward skating basics, and puck control games with zero elimination. Station-rotation format keeps every player moving and touching a puck the whole practice - no lines.",
    equipmentNeeded: [
      "1 puck per player (plus extras)",
      "8-10 cones",
      "Hoops or small cone circles (1 per player) for Protect Your Pond",
      "15-20 colored pucks/cones + 3-4 buckets for Toy Finder",
      "First aid kit",
      "Water available",
    ],
    coachingNotes:
      "# First Skate Comfort - Coach's Guide\n\n## Before Ice Time (arrive 10-15 min early)\n- Mark the cross-ice zone (blue line to blue line or ~25x30 paces)\n- Set up Toy Finder colors/buckets at one end, Caterpillar Relay lanes at the other\n- Stage Protect Your Pond hoops for the second half of practice\n- Bring extra pucks - a few always end up over the boards\n\n## Ice Setup\n```\n[Bench]---------------------------------------------\n         (Toy Finder colors)      (Caterpillar lanes)\n              zone A                    zone B\n                         (center circle:\n                         Musical Pucks / Protect Your Pond)\n---------------------------------------------------[Bench]\n```\n\n## Flex Points\nIF YOU HAVE EXTRA TIME:\n- Add a second round of Musical Pucks\n- Let confident skaters try the C-Cut Caterpillar Relay solo-sprint variation\n\nIF RUNNING SHORT ON TIME:\n- Cut: the second Protect Your Pond round\n- Keep: Red Light/Green Light and the station rotation - these are the comfort-building core\n\nIF PLAYERS ARE STRUGGLING TODAY (tired legs, low energy, big group of first-timers):\n- Shorten every station by 2 minutes and add a 2-minute free-skate break in the middle\n- Skip the \"switch stations\" transition drama - just let both groups try both stations informally\n\n## Post-Practice Reflection\nEnergy level:      Low   Medium   High\nPlayer engagement:  Low   Medium   High\nSkill progress:     Low   Medium   High\n\nNotes for next time: ________________________________\nPlayers who need extra attention: ___________________\n\n## Parent Communication\nIf a parent asks \"How did my child do?\": \"[Name] is getting more comfortable stopping and handling the puck every week - today they [specific moment]. Next practice we start working on puck control!\"",
    isDefault: false,
  },
  {
    name: "Puck Control Stations - Building Comfort with the Puck",
    sport: "hockey",
    stage: "fundamentals",
    durationMinutes: 53,
    structure: [
      {
        name: "Arrival & Puck Touches",
        type: "warmup",
        durationMinutes: 5,
        description:
          "Free puck-handling as players arrive - toe drags, simple stickhandling, no instruction.",
        activitySuggestions: ["Free stickhandling"],
        coachingScript:
          "AS PLAYERS ARRIVE:\n- \"Grab a puck and start moving it around - side to side, forward and back, however feels good!\"\n- Skate around greeting players by name, checking gear\n\nWATCH FOR:\n- Players who look comfortable already vs. players who need a confidence boost - note for station grouping later\n- Anyone whose stick is the wrong length/flex for comfortable puck control - flag for a parent conversation, not mid-practice",
      },
      {
        name: "Border Tag",
        type: "warmup",
        durationMinutes: 6,
        description:
          "Continuous, no-elimination tag game inside the zone - builds edge work and acceleration with everyone moving the whole time.",
        activitySuggestions: ["Border Tag"],
        coachingScript:
          "GATHER (0:05):\n- \"Everyone in the zone - no pucks for this one! We're playing Border Tag.\"\n- Pick 2 players to start as \"it\" (pinnies on)\n\nPLAY (5 min):\n- \"'It' players tag with a gentle tap - tagged players do 3 quick edge pushes on the spot, then you're back in!\"\n- Rotate who's \"it\" every 90 seconds so everyone gets a turn\n- SAY: \"Quick feet! Change direction before they even get close!\"\n\nCOACHING POINTS:\n- QUICK EDGES → Say: \"Push hard off your inside edge to cut away!\"\n- HEAD UP → Say: \"Know where 'it' is without staring straight at them!\"\n\nWATCH FOR:\n- Players skating in straight lines only (easy to tag) - encourage a direction change: \"Try cutting the OTHER way this time!\"\n- Low-confidence skaters staying near the boards - invite them toward open ice with you\n\nTRANSITION TO NEXT:\n\"Great hustle! Grab your pucks - stations time!\"",
      },
      {
        name: "Puck Control Stations: Sharks & Minnows + Toy Finder",
        type: "technical",
        durationMinutes: 16,
        description:
          "Two rotating stations focused on carrying a puck while managing pressure or distraction - Sharks & Minnows (evasion) and Toy Finder (scanning while carrying). Split the group; ~8 minutes per station.",
        activitySuggestions: ["Sharks & Minnows", "Toy Finder"],
        coachingScript:
          "SETUP (during Border Tag's last minute):\n- Station A: mark a zone for Sharks & Minnows, 2-3 pinnie'd \"sharks\" ready\n- Station B: scatter colored pucks/cones with buckets for Toy Finder\n\nSPLIT (0:11):\n- \"Count off 1s and 2s - 1s with me at Sharks & Minnows, 2s with [assistant] at Toy Finder!\"\n\nSTATION A - SHARKS & MINNOWS:\n- \"Minnows, keep your puck close - sharks are going to try to poke it away!\"\n- Poked minnows do 3 quick toe drags at the edge, then jump right back in\n- Key phrase: \"Cushion it in close, like it's on a string!\"\n- Rotate sharks every 90 seconds\n\nSTATION B - TOY FINDER:\n- \"Carry your own puck the whole time and collect matching colors into the buckets!\"\n- Key phrase: \"Look up between touches - where's the next toy?\"\n\nSWITCH (0:19):\n- \"Freeze - switch stations!\" (30-second transition, water sip allowed)\n\nWATCH FOR:\n- Sharks & Minnows: minnows leaving the puck too far out front (say: \"Short leash on that puck!\")\n- Toy Finder: players stopping to stare at the puck instead of scanning (say: \"Quick peek down, eyes up!\")\n- Sharks standing still waiting for a puck to come to them - remind them to hunt\n\nTRANSITION TO NEXT:\n\"Everybody did great managing pressure on that puck! Bring it to the middle for pond battles.\"",
      },
      {
        name: "Small-Area Game: Protect Your Pond",
        type: "game",
        durationMinutes: 9,
        description:
          "Every player guards their own puck-control zone while trying to poke pucks out of neighboring zones - direct application of the pressure-management work from stations.",
        activitySuggestions: ["Protect Your Pond"],
        coachingScript:
          "SETUP (0:27):\n- One hoop + one puck per player, spaced 3-4 paces apart\n\nPLAY:\n- \"Keep your puck in YOUR pond, poke others' pucks out of theirs!\"\n- Run 3 rounds of ~90 seconds, mixing neighbors each time\n- Freeze-and-count between rounds: \"Who still has their puck? Nice work team!\"\n\nCOACHING POINTS:\n- BODY BETWEEN → Say: \"Shoulder between your pond and anyone reaching in!\"\n- STAY LOW → Say: \"Bend those knees - low and wide!\"\n\nWATCH FOR:\n- Players standing tall and getting poked off easily\n- Anyone reluctant to compete for a puck - pair them with a patient, encouraging partner next round\n\nTRANSITION TO NEXT:\n\"Last game - let's put it all together with some mini nets!\"",
      },
      {
        name: "Small-Area Game: 1v1v1 Mini Nets",
        type: "game",
        durationMinutes: 12,
        description:
          "Three players, two mini nets back-to-back, one puck - a cross-ice small-area game that puts today's puck-control and pressure work into a live, decision-making context.",
        activitySuggestions: ["1v1v1 Mini Nets"],
        coachingScript:
          "SETUP (0:36):\n- Groups of 3, each with 2 mini nets 10-12 paces apart facing opposite directions, one puck dropped between them\n\nPLAY:\n- \"Every net you attack is also a net someone else is defending - and one of THOSE nets is yours to protect!\"\n- Play continuous 90-second shifts, tally goals informally, rotate groups of 3 every couple of shifts\n\nCOACHING POINTS:\n- KNOW BOTH NETS → Say: \"Which net is yours to defend, which one can you attack?\"\n- QUICK DECISIONS → Say: \"Shoot, protect, or battle - decide fast!\"\n\nWATCH FOR:\n- Players watching both nets and freezing instead of reacting to the puck - remind: \"Puck first!\"\n- A player never getting a shot off - rotate them into a fresh group with more space\n\nTRANSITION TO NEXT:\n\"Bring it in - awesome puck battles today!\"",
      },
      {
        name: "Cooldown & Reflection",
        type: "cooldown",
        durationMinutes: 5,
        description:
          "Gather, quick recap of the day's puck-control theme, light stretch, team cheer.",
        activitySuggestions: ["Team huddle", "Light stretching"],
        coachingScript:
          "GATHER (0:48):\n- \"Glide in and take a knee!\"\n\nRECAP (2 min):\n- \"What did we practice keeping close to us today?\" (the puck!)\n- \"I saw some great puck protection in the ponds and some smart decisions at the mini nets.\"\n\nSTRETCH (1 min):\n- Quad stretch, ankle rolls, shoulder rolls\n\nCHEER (1 min):\n- \"Sticks in! 1, 2, 3, [TEAM NAME]!\"\n\nPARENT NOTE (1 min):\n- \"We worked on puck control and protecting the puck under pressure today - ask [Name] about their 'pond'!\"\n\nWATCH FOR:\n- Which players are ready for more contested puck battles next time vs. who still needs lower-pressure reps",
      },
    ],
    description:
      "A 53-minute session building directly on First Skate Comfort: individual puck-control stations, small-area pressure games, and a first taste of live decision-making at mini nets. Station-rotation format, no lines, every player gets constant puck touches.",
    equipmentNeeded: [
      "1 puck per player (plus extras)",
      "Pinnies (2-3 for sharks/border-tag \"it\")",
      "15-20 colored pucks/cones + 3-4 buckets for Toy Finder",
      "Hoops or cone circles (1 per player) for Protect Your Pond",
      "4-6 mini nets",
      "First aid kit",
    ],
    coachingNotes:
      "# Puck Control Stations - Coach's Guide\n\n## Before Ice Time\n- Set up Sharks & Minnows zone and Toy Finder colors/buckets at opposite ends before players arrive\n- Stage mini nets for the second half but keep them out of the way during stations\n- Bring 2-3 extra pinnies for rotating \"sharks\"/taggers\n\n## Flex Points\nIF YOU HAVE EXTRA TIME:\n- Add a third rotation through the puck-control stations with roles swapped\n- Run one more shift of 1v1v1 Mini Nets - it's the highest-engagement segment\n\nIF RUNNING SHORT ON TIME:\n- Cut: the second half of Protect Your Pond (2 rounds instead of 3)\n- Keep: both puck-control stations and at least one full 1v1v1 shift per group\n\nIF PLAYERS ARE STRUGGLING TODAY:\n- Widen Sharks & Minnows zone and reduce sharks to 1 per 8-10 players\n- Give Protect Your Pond bigger ponds and more spacing\n\n## Post-Practice Reflection\nEnergy level:      Low   Medium   High\nPlayer engagement:  Low   Medium   High\nSkill progress:     Low   Medium   High\n\nNotes for next time: ________________________________\nPlayers who need extra attention: ___________________\n\n## Parent Communication\n\"Today's focus was puck control under a little pressure - poke-checks, distractions, and small battles. Ask [Name] to show you how they protect a puck!\"",
    isDefault: false,
  },
  {
    name: "Passing & Support - Moving the Puck as a Team",
    sport: "hockey",
    stage: "fundamentals",
    durationMinutes: 51,
    structure: [
      {
        name: "Arrival & Passing Touches",
        type: "warmup",
        durationMinutes: 5,
        description:
          "Free passing with a partner as players arrive - no instruction, just touches and a chance to say hi.",
        activitySuggestions: ["Free partner passing"],
        coachingScript:
          "AS PLAYERS ARRIVE:\n- \"Find a partner and start passing back and forth - nice and easy!\"\n- Pair up any odd-numbered or new players yourself\n\nWATCH FOR:\n- Pairs standing too close (not really passing) or too far (chasing pucks constantly) - nudge spacing to a comfortable range",
      },
      {
        name: "C-Cut Caterpillar Relay",
        type: "warmup",
        durationMinutes: 6,
        description:
          "Group backward-skating relay to wake up edges and legs before passing work.",
        activitySuggestions: ["C-Cut Caterpillar Relay"],
        coachingScript:
          "GATHER (0:05):\n- \"Groups of 3-4, hold sticks blade to blade facing backward - you're one caterpillar!\"\n\nPLAY (5 min):\n- \"Everyone C-cuts backward together, same rhythm - to the far cones and back!\"\n- Rotate leaders each trip; run 2-3 caterpillar lines side by side\n\nCOACHING POINTS:\n- C-CUTS NOT SHUFFLES → Say: \"Push out with your inside edge!\"\n- STAY LOW TOGETHER → Say: \"Whole caterpillar stays low and athletic!\"\n\nWATCH FOR:\n- One player rushing ahead and breaking the group's rhythm - remind: \"Same speed as your caterpillar!\"\n\nTRANSITION TO NEXT:\n\"Great teamwork already! Grab a puck - time to move it around with a partner.\"",
      },
      {
        name: "Passing Stations: Pass & Follow + Clean Your Corner",
        type: "technical",
        durationMinutes: 18,
        description:
          "Two rotating stations - Pass & Follow (partner passing with constant movement, no standing in line) and Clean Your Corner (team passing race). Split the group; ~9 minutes per station.",
        activitySuggestions: ["Pass & Follow", "Clean Your Corner"],
        coachingScript:
          "SETUP (during Caterpillar Relay's last minute):\n- Station A: 3-4 pairs of cones 8-10 paces apart for Pass & Follow\n- Station B: split the far zone in half with a center line for Clean Your Corner, pucks scattered evenly on both sides\n\nSPLIT (0:11):\n- \"1s with me at Pass & Follow, 2s with [assistant] at Clean Your Corner!\"\n\nSTATION A - PASS & FOLLOW:\n- \"Sweep the puck to your partner, then skate and follow your pass to their spot!\"\n- Key phrase: \"Cushion it like catching an egg!\"\n- After a few minutes: \"Switch - backhand passes only!\"\n\nSTATION B - CLEAN YOUR CORNER:\n- Two teams, pucks scattered on each side of the center line\n- \"Clean up your side by passing pucks over the line - no crossing yourself, pucks only!\"\n- Freeze-and-count every 60-90 seconds to see whose side is cleaner\n\nSWITCH (0:20):\n- \"Freeze - switch stations!\"\n\nWATCH FOR:\n- Pass & Follow: players slapping instead of sweeping the puck (say: \"Smooth sweep, not a slap!\")\n- Pass & Follow: players standing still after passing (say: \"Follow your pass every time!\")\n- Clean Your Corner: passes flying out of bounds (say: \"Flat and controlled - accuracy over power!\")\n\nTRANSITION TO NEXT:\n\"Awesome passing! Now let's use it in a real breakout.\"",
      },
      {
        name: "Breakout Relay Race",
        type: "tactical",
        durationMinutes: 9,
        description:
          "Simplified 3-pass breakout relay - teaches the habit of getting to your spot early, directly applying the passing work into a team-transition context.",
        activitySuggestions: ["Breakout Relay Race"],
        coachingScript:
          "SETUP (0:29):\n- Teams of 3, cones marking 3 spots: behind the net, along the wall, at the blue line, plus a finish line\n\nPLAY:\n- \"Get to your spot fast, then move the puck through all three of you before anyone crosses the finish line!\"\n- Puck carrier passes to the wall player, who passes to the blue-line player, who carries it to the finish\n- Run several heats, rotating everyone through all three spots\n\nCOACHING POINTS:\n- GET TO YOUR SPOT FIRST → Say: \"Don't wait for the puck - get there early!\"\n- GIVE AN OPTION → Say: \"Show you're ready - stick on the ice, call for it!\"\n\nWATCH FOR:\n- Players bunching at one spot instead of spreading to all three (say: \"Spread out - three different spots!\")\n- Standing still waiting for a pass (say: \"Keep moving - be a moving target!\")\n\nTRANSITION TO NEXT:\n\"Great breakouts! One more team game before we cool down.\"",
      },
      {
        name: "Read & React",
        type: "tactical",
        durationMinutes: 8,
        description:
          "Simple 2-3 player passing-and-decision game that builds on today's passing/support theme by asking players to read a teammate's position before moving the puck.",
        activitySuggestions: ["Read & React"],
        coachingScript:
          "SETUP (0:38):\n- Small groups of 2-3 spread across the zone with one puck each group\n\nPLAY:\n- Walk the group through Read & React's core pattern: puck carrier reads where support is open before passing, receiver reads the passing lane before moving into it\n- Rotate groups every 2-3 minutes so players read different teammates\n\nCOACHING POINTS:\n- LOOK BEFORE YOU PASS → Say: \"Where's your open teammate right now?\"\n- MOVE TO GET OPEN → Say: \"Don't stand still - find the open ice!\"\n\nWATCH FOR:\n- Players passing to wherever a teammate WAS standing rather than where they're moving to\n- A group that's mastering it quickly - challenge them with a passive defender\n\nTRANSITION TO NEXT:\n\"Bring it in - you all moved that puck like a team today!\"",
      },
      {
        name: "Cooldown & Team Talk",
        type: "cooldown",
        durationMinutes: 5,
        description:
          "Gather, recap the passing/support theme, light stretch, team cheer.",
        activitySuggestions: ["Team huddle", "Light stretching"],
        coachingScript:
          "GATHER (0:46):\n- \"Glide in, take a knee!\"\n\nRECAP (2 min):\n- \"What's the most important thing when you pass to a teammate?\" - let a few answer (accuracy, being ready, moving to get open)\n- \"I saw great teamwork in the breakouts and the passing stations today!\"\n\nSTRETCH (1 min):\n- Quad stretch, shoulder rolls, ankle circles\n\nCHEER (1 min):\n- \"Sticks in! 1, 2, 3, [TEAM NAME]!\"\n\nPARENT NOTE (1 min):\n- \"We worked on passing and supporting each other today - ask [Name] about the 'caterpillar' and the breakout race!\"\n\nWATCH FOR:\n- Pairs/groups that clicked especially well together - worth keeping together next practice for continuity",
      },
    ],
    description:
      "A 51-minute session moving the team from individual puck control into passing and support play - partner passing, a team-clearing race, a breakout relay, and a read-and-react decision game. Station-rotation format, no lines.",
    equipmentNeeded: [
      "1 puck per player (plus extras)",
      "12-16 cones",
      "Pinnies (2 colors) for Clean Your Corner",
      "First aid kit",
      "Water available",
    ],
    coachingNotes:
      "# Passing & Support - Coach's Guide\n\n## Before Ice Time\n- Split the far end of the zone with a visible center line (red line or a row of cones) for Clean Your Corner\n- Set up 3-4 Pass & Follow cone pairs at the near end\n- Stage the 3 breakout spots (behind net, wall, blue line) for later in practice\n\n## Flex Points\nIF YOU HAVE EXTRA TIME:\n- Add the Pass & Follow \"Moving Targets\" variation (receiver skates side to side)\n- Run a second full round of Breakout Relay Race with roles swapped\n\nIF RUNNING SHORT ON TIME:\n- Cut: the second half of the passing stations (6 min instead of 9 each)\n- Keep: Breakout Relay Race - it's the segment that ties passing to team play\n\nIF PLAYERS ARE STRUGGLING TODAY:\n- Shorten passing distances at Pass & Follow\n- Reduce Clean Your Corner to 2 rounds and use fewer total pucks\n\n## Post-Practice Reflection\nEnergy level:      Low   Medium   High\nPlayer engagement:  Low   Medium   High\nSkill progress:     Low   Medium   High\n\nNotes for next time: ________________________________\nPlayers who need extra attention: ___________________\n\n## Parent Communication\n\"Today was all about passing and supporting teammates - not just individual puck skills. Ask [Name] about the breakout relay race!\"",
    isDefault: false,
  },
  {
    name: "Small-Area Games Day - Everything Together",
    sport: "hockey",
    stage: "fundamentals",
    durationMinutes: 53,
    structure: [
      {
        name: "Arrival & Warmup Game: Musical Pucks",
        type: "warmup",
        durationMinutes: 6,
        description:
          "Fast, fun warmup game to get everyone moving and smiling before the small-area games start - points-based, no elimination.",
        activitySuggestions: ["Musical Pucks"],
        coachingScript:
          "GATHER AS PLAYERS ARRIVE:\n- \"Grab a puck and skate around the circle - when I whistle, grab ANY puck!\"\n- Scatter one fewer puck than players, run 3-4 quick rounds while stragglers join in\n\nCOACHING POINTS:\n- HEAD UP → Say: \"Look for open pucks, not just straight ahead!\"\n- NO SULKING → Say: \"Missed one? 3 taps and right back in!\"\n\nWATCH FOR:\n- Late arrivals joining smoothly without disrupting the group's energy\n- Anyone needing an extra confidence boost before today's bigger small-area games\n\nTRANSITION TO NEXT:\n\"Great energy! Quick skill tune-up before our games today.\"",
      },
      {
        name: "Skill Tune-Up: Shootout Showdown",
        type: "technical",
        durationMinutes: 8,
        description:
          "Brief shooting-technique refresher at mini nets/targets before the games block - the day's only pure-skill segment, kept short since today emphasizes small-area games and team play over individual stations.",
        activitySuggestions: ["Shootout Showdown"],
        coachingScript:
          "SETUP (0:06):\n- 2-3 shooting stations with mini nets or targets at varying distances, 6-8 pucks per station\n\nPLAY:\n- Small groups rotate through: shoot 5 pucks each, call a target spot (top corner, bottom corner) before each shot\n- Rotate stations every 2 minutes - no long lines\n\nCOACHING POINTS:\n- PULL AND SNAP → Say: \"Heel to toe, then snap your wrists!\"\n- PICK YOUR SPOT → Say: \"Aim for the spot, not just the whole net!\"\n\nWATCH FOR:\n- Pucks staying flat on the ice (say: \"Roll your wrists over at the end to lift it!\")\n- Players not transferring weight into the shot (say: \"Push off your back foot!\")\n\nTRANSITION TO NEXT:\n\"Nice shooting - now let's put everything into some real small-area games!\"",
      },
      {
        name: "Small-Area Game 1: Clash of Corners",
        type: "game",
        durationMinutes: 12,
        description:
          "Competitive small-area team game emphasizing puck battles and defensive play - the first of three back-to-back small-area games that make up today's core focus.",
        activitySuggestions: ["Clash of Corners"],
        coachingScript:
          "SETUP (0:14):\n- Two teams, cross-ice zone split into corner battle areas per Clash of Corners' setup\n\nPLAY:\n- Run the game's standard rounds, tallying points for the whole team rather than individuals\n- Rotate matchups between rounds so everyone battles different teammates\n\nCOACHING POINTS:\n- STICK ON PUCK → Say: \"Active stick - get in on that battle!\"\n- STAY LOW AND WIDE → Say: \"Wide base, hard to move!\"\n\nWATCH FOR:\n- A player avoiding every battle - give them a specific, simple job (\"You're first in on the next one!\")\n- Overly physical play - remind: \"Sticks and body position only, no pushing!\"\n\nTRANSITION TO NEXT:\n\"Great battles! Quick water, then onto mini nets.\"",
      },
      {
        name: "Small-Area Game 2: 1v1v1 Mini Nets",
        type: "game",
        durationMinutes: 12,
        description:
          "Three-player, two-mini-net small-area game forcing constant attack/defend decisions - the highest-repetition game of the day for shooting and positioning.",
        activitySuggestions: ["1v1v1 Mini Nets"],
        coachingScript:
          "SETUP (0:26):\n- Groups of 3, each with 2 mini nets back-to-back, one puck per group\n\nPLAY:\n- \"Every net you attack is also a net someone else is defending!\"\n- Continuous 90-second shifts, rotate groups every couple of shifts\n\nCOACHING POINTS:\n- QUICK DECISIONS → Say: \"Shoot, protect, or battle - decide fast!\"\n- GAP CONTROL → Say: \"Close the space before they get a clean shot!\"\n\nWATCH FOR:\n- Players puck-watching both nets instead of reacting to the puck\n- Groups where one player dominates - rebalance groupings for the next shift\n\nTRANSITION TO NEXT:\n\"Awesome mini-net battles! Last game of the day.\"",
      },
      {
        name: "Small-Area Game 3: King (or Queen) of the Rink",
        type: "game",
        durationMinutes: 10,
        description:
          "Points-based center-circle battle game to close out the small-area games block with high energy and equal chances for everyone.",
        activitySuggestions: ["King (or Queen) of the Rink"],
        coachingScript:
          "SETUP (0:38):\n- One puck in the middle of a marked center circle, players spread evenly around it\n\nPLAY:\n- \"Race in, win the puck, control it for a 3-count - that's your point! Then it resets to the middle.\"\n- Run several short rounds, tallying points per player as a fun team-wide leaderboard (not eliminating anyone)\n\nCOACHING POINTS:\n- GET LOW AND WIDE → Say: \"Own that space!\"\n- PROTECT ONCE YOU HAVE IT → Say: \"Body between the puck and everyone else!\"\n\nWATCH FOR:\n- Players hanging back outside the circle instead of competing - invite them in specifically\n- Anyone frustrated after a few rounds without winning the puck - engineer the next drop to bounce their way\n\nTRANSITION TO NEXT:\n\"Bring it in - what a day of games!\"",
      },
      {
        name: "Team Celebration & Cooldown",
        type: "cooldown",
        durationMinutes: 5,
        description:
          "Gather, celebrate the day's games, light stretch, team cheer - closing out the progression's small-area games day.",
        activitySuggestions: ["Team huddle", "Light stretching"],
        coachingScript:
          "GATHER (0:48):\n- \"Glide in, take a knee - great games today!\"\n\nRECAP (2 min):\n- \"Which game was your favorite today?\" - let several kids answer\n- \"You used your skating, your puck control, AND your passing today - all in real games!\"\n\nSTRETCH (1 min):\n- Quad stretch, shoulder rolls, ankle circles\n\nCHEER (1 min):\n- \"Sticks in! 1, 2, 3, [TEAM NAME]!\"\n\nPARENT NOTE (1 min):\n- \"Today was all small-area games - ask [Name] about King of the Rink and the mini-net battles!\"\n\nWATCH FOR:\n- Overall progression check: are players applying skating/puck-control/passing from the last three practices naturally in game play? Note names for individual follow-up",
      },
    ],
    description:
      "A 53-minute session capping the fundamentals progression: a brief skill tune-up followed by three back-to-back small-area games, mirroring Hockey Canada's weekly rhythm of pairing a skills day and a passing day with a dedicated small-area-games/game day. Every station and game is no-elimination and station-rotation based - no lines.",
    equipmentNeeded: [
      "1 puck per player (plus extras)",
      "6-8 mini nets/targets total across stations and games",
      "Pinnies (2+ colors)",
      "Cones for the center circle and corner zones",
      "First aid kit",
      "Water available",
    ],
    coachingNotes:
      "# Small-Area Games Day - Coach's Guide\n\n## Before Ice Time\n- Stage all three game setups (Clash of Corners corners, 1v1v1 mini net pairs, King of the Rink center circle) so transitions between games are fast\n- Keep the Shootout Showdown skill tune-up short on purpose - today's ratio favors games over stations, unlike the first three plans in this progression\n\n## Flex Points\nIF YOU HAVE EXTRA TIME:\n- Add a second King of the Rink round with a running team leaderboard\n- Give one more shift of 1v1v1 Mini Nets - it's usually the highest-engagement game\n\nIF RUNNING SHORT ON TIME:\n- Cut: the Shootout Showdown tune-up down to 5 minutes\n- Keep: all three small-area games at full length - they're the point of today's practice\n\nIF PLAYERS ARE STRUGGLING TODAY (tired legs from a long week, big group):\n- Shorten each game by 2 minutes and add a 2-minute water/regroup break at the halfway point\n- Simplify Clash of Corners to its gentlest ruleset variation\n\n## Post-Practice Reflection\nEnergy level:      Low   Medium   High\nPlayer engagement:  Low   Medium   High\nSkill progress:     Low   Medium   High\n\nNotes for next time: ________________________________\nPlayers who need extra attention: ___________________\n\n## Parent Communication\n\"Today was a small-area games day - less station work, more live games putting everything from the last few practices into action. Ask [Name] which game was their favorite!\"",
    isDefault: false,
  },
];

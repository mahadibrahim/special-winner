// Soccer session plans: v2's 4 print-ready plans (Fundamentals stage) plus the
// soccer subset of the gen-1 session-plan-library templates that don't duplicate
// a v2 plan by name.
//
// Sources (reference only, .superpowers/curriculum-recovery/seeds/):
//   - curriculum-v2__soccer-session-plans.ts (4 v2 plans, coachingScript per segment)
//   - session-plan-library.ts (gen-1; 8 soccer plans total in the library, of which
//     7 are included here -- see consolidation note below)
//
// consolidation: gen-1's "Dribbling Adventures" is dropped -- it duplicates v2's
// "Dribbling Adventures - Learning to Move with the Ball" by name (the gen-1 title
// is an exact prefix of the v2 title before its " - " subtitle, the same naming
// convention v2 uses elsewhere).
//
// Shape notes (container-only transforms, no content invented or altered):
//   - gen-1's per-segment `coachingScript` is authored as a string[] (one bullet
//     per script line/question); SessionPlanContent.structure[].coachingScript is a
//     single string, so array entries are newline-joined verbatim, in order.
//   - 3 gen-1 segments carry an extra `stations` string[] not in the segment type;
//     folded into that segment's `description` as a trailing "Stations:" bullet
//     list rather than dropped or given a new type field (used in only 3 of ~90
//     segments across the whole gen-1 library).
//
// Type note: SessionPlanContent was extended with `description?: string`,
// `equipmentNeeded?: string[]`, and `isDefault?: boolean` -- all present on every
// source row and already columns on practiceTemplates (src/lib/db/schema/
// practice-planning.ts), same rationale as the ActivityContent extension above.

import type { SessionPlanContent } from "../types";

export const SOCCER_SESSION_PLANS: SessionPlanContent[] = [
  {
    name: "First Day of Season - Getting Started Right",
    sport: "soccer",
    stage: "fundamentals",
    durationMinutes: 45,
    structure: [
      {
        name: "Welcome & Name Game",
        type: "warmup",
        durationMinutes: 8,
        description:
          "Gather the team, introduce yourself, learn names through a fun ball activity",
        activitySuggestions: ["Name Ball Toss", "Circle Introduction"],
        coachingScript:
          'ARRIVAL (as players arrive):\n- Stand at the field entrance with a smile\n- Greet each child AND parent by name if possible\n- "Hi! I\'m Coach [Name]. What\'s your name? Awesome, grab a ball from the bag and start kicking around!"\n\nGATHER THE TEAM (0:00):\n- Whistle or clap pattern to gather: "Everyone bring your ball and make a circle around me!"\n- Wait for silence, make eye contact with each child\n- "Welcome to our soccer team! I\'m SO excited to be your coach this season."\n- "Before we play, I want to learn everyone\'s name. When I roll the ball to you, say your name loud so we can all hear!"\n\nNAME BALL ACTIVITY (3 minutes):\n- Roll ball to each player, they say name, roll back\n- After going around once: "Now let\'s try this - say YOUR name, then roll to someone else and say THEIR name!"\n- Celebrate when kids remember names: "You remembered! High five!"\n\nTEAM CHANT SETUP (2 minutes):\n- "Every great team needs a team name. What should we be called?" (Let them vote)\n- "And we need a chant! On three, everyone yell our team name: 1, 2, 3, [TEAM NAME]!"\n- Practice 2-3 times with increasing energy',
      },
      {
        name: "Follow the Leader Warmup",
        type: "warmup",
        durationMinutes: 7,
        description:
          "Get bodies moving with a fun follow-the-leader game that requires a ball",
        activitySuggestions: ["Follow the Leader", "Simon Says with Balls"],
        coachingScript:
          'TRANSITION (0:08):\n- "Okay team, now we\'re going to warm up our bodies! Everyone get your ball."\n- "We\'re playing Follow the Leader. I\'m the leader first - copy EVERYTHING I do!"\n\nFOLLOW THE LEADER (5 minutes):\nRound 1 - Coach leads (2 min):\n- Walk with ball, stop and go\n- Hop over ball\n- Run around ball in circles\n- Sit on ball, stand up\n- Roll ball with foot slowly\n- "You\'re all GREAT followers!"\n\nRound 2 - Pick player leaders (3 min):\n- "Who wants to be the leader? Marcus, you\'re up! Everyone follow Marcus!"\n- Let 3-4 kids be leader for 30-45 seconds each\n- Celebrate creative moves: "Ooh, I love that one!"\n\nSAFETY CHAT (2 minutes):\n- Gather in close: "Quick team huddle!"\n- "Two important rules for our team: 1) Have FUN! 2) Be SAFE - no pushing, no hands on other players. Can everyone say \'FUN AND SAFE\'?"\n- Get them to repeat it back',
      },
      {
        name: "Traffic Lights Introduction",
        type: "technical",
        durationMinutes: 10,
        description:
          "Introduce basic ball control through the Traffic Lights game - simple commands, lots of success",
        activitySuggestions: [
          "Traffic Lights",
          "Red Light Green Light with Balls",
        ],
        coachingScript:
          'TRANSITION (0:15):\n- "Spread out so you can\'t touch anyone - find your own space!"\n- Wait until everyone is spread: "Perfect! Now, who knows what a traffic light does?"\n\nEXPLAIN THE GAME:\n- "GREEN means GO - dribble your ball fast!"\n- "YELLOW means SLOW - dribble like a turtle!"\n- "RED means STOP - freeze like a statue with your foot on the ball!"\n- "Let\'s practice. Everyone freeze. Ready... GREEN!"\n\nPLAY TRAFFIC LIGHTS (7 minutes):\nRound 1 (2 min): Basic colors, slow calls\n- "GREEN!" (let them go 5-7 seconds)\n- "YELLOW!" (praise slow dribblers)\n- "RED!" (check - is foot on ball?)\n- Praise every correct stop: "Great freeze Marcus! Lily, love that slow turtle dribble!"\n\nRound 2 (2 min): Faster calls\n- Speed up the color changes\n- Add countdown: "RED in 3... 2... 1... RED!"\n\nRound 3 (3 min): Fun variations\n- Whisper the colors\n- "Red... red... red... GREEEEN!"\n- Let a player be the traffic light\n\nTEACHING MOMENT:\n- "Freeze on red! Show me your foot on the ball. What part of your foot is touching?"\n- "That\'s called your SOLE - the bottom of your foot. Like squashing a bug!"',
      },
      {
        name: "Partner Ball Fun",
        type: "technical",
        durationMinutes: 8,
        description:
          "Simple partner activities to start building passing basics and teamwork",
        activitySuggestions: ["Partner Passing", "Ball Swap Game"],
        coachingScript:
          'TRANSITION (0:25):\n- "Find a partner! Someone you haven\'t played with yet. Give them a high five!"\n- "One ball per pair - put the extra one on the side."\n\nPARTNER ACTIVITY 1 - PASSING BACK AND FORTH (3 min):\n- "Stand 5 giant steps apart from your partner."\n- "Pass the ball using the INSIDE of your foot - like this" (demo)\n- "See how many passes you can do without the ball getting away. Count together!"\n- Walk around, encourage: "Great pass! 6, 7, 8 - nice counting!"\n- Challenge: "Can any pair get to 10 without missing?"\n\nPARTNER ACTIVITY 2 - BALL SWAP GAME (3 min):\n- "Now both partners have a ball. Stand apart."\n- "On GO, dribble toward each other, high five in the middle, then keep going to where your partner started!"\n- "Ready... GO!"\n- Do 3-4 rounds\n- Add variation: "This time, when you meet in the middle, swap balls without stopping!"\n\nPARTNER ACTIVITY 3 - SHADOW DRIBBLING (2 min):\n- "One partner is the leader, one is the shadow. Shadow copies everything!"\n- "Leaders, keep your ball close so your shadow can follow."\n- "Switch after 1 minute!"',
      },
      {
        name: "Fun Scrimmage Game",
        type: "game",
        durationMinutes: 10,
        description:
          "Simple small-sided game with cones for goals - first taste of 'real' soccer",
        activitySuggestions: ["3v3 to Cone Goals", "End Zone Game"],
        coachingScript:
          'TRANSITION (0:33):\n- "Now for the best part - a real game!"\n- Split into two teams quickly (count off 1-2 or use pinnies by color)\n- "Greens on this side, Reds on this side!"\n\nSET UP (1 minute):\n- Two cone goals about 4 steps wide\n- Small field (20x15 paces max)\n- "Score by kicking the ball through those cones!"\n\nPLAY THE GAME (8 minutes):\nFirst half (4 min):\n- "GO!" - Let them play\n- Don\'t over-coach! Only intervene for:\n  - Safety issues\n  - Ball going way out\n  - Major confusion\n- Celebrate EVERY goal from both teams: "GOOOAL! Nice shot!"\n- NO keeping score officially (they will anyway, that\'s fine)\n\nHalf time (30 sec):\n- "Switch sides! Now go the other way!"\n- Quick water sips if nearby\n\nSecond half (4 min):\n- Keep energy high: "I love how hard everyone is trying!"\n- Make sure everyone touches the ball - if someone hasn\'t: "Maya, here it comes!" and roll it to them\n\nCOACHING TIPS:\n- If one team is dominating, quietly add yourself to the other team\n- If ball hogs: "Count your passes - 3 passes, then you can shoot!"\n- If no one can score: Make goals wider\n- If goals are too easy: Make goals smaller',
      },
      {
        name: "Celebration & Goodbye",
        type: "cooldown",
        durationMinutes: 2,
        description:
          "Bring it in, celebrate the first practice, set expectations for next time",
        activitySuggestions: ["Team Chant", "High Five Tunnel"],
        coachingScript:
          'GATHER THE TEAM (0:43):\n- "Everyone bring it in! Hands in the middle!"\n- Wait for everyone to arrive and settle\n\nCELEBRATION:\n- "That was an AMAZING first practice!"\n- "I learned all your names" (prove it - go around quickly saying names)\n- "You learned how to stop the ball, pass to a partner, and play a game!"\n- "I\'m so excited for this season. We\'re going to have SO much fun."\n\nLOOKING AHEAD:\n- "Next practice we\'ll learn some cool dribbling moves."\n- "Make sure to practice at home - kick the ball around in your backyard!"\n\nTEAM CHANT:\n- "Okay, team name on three! 1... 2... 3... [TEAM NAME]!"\n- "High fives on the way out - come get one from me!"\n\nPARENT COMMUNICATION:\n- Be available for parents for a few minutes\n- "Great first day! Your child did great with [specific thing]."\n- Remind: "Next practice is [day/time]. Water bottle and shin guards, please!"',
      },
    ],
    description:
      "A 45-minute session designed for the very first practice of the season. Focus on fun, meeting teammates, learning names, and establishing a positive tone. Zero pressure, maximum smiles.",
    equipmentNeeded: [
      "1 ball per player (plus extras)",
      "8-12 cones",
      "Pinnies (2 colors, enough for half the team each)",
      "Whistle (optional)",
      "First aid kit",
      "Water available",
    ],
    coachingNotes:
      '# First Day of Season - Complete Coach\'s Guide\n\n## Before You Arrive (15 minutes early)\n\n### Equipment Checklist\n- [ ] Bag of balls (1 per player + 3 extras)\n- [ ] Cones (8-12)\n- [ ] Pinnies (2 colors)\n- [ ] First aid kit\n- [ ] Roster with player names\n- [ ] Emergency contact information\n- [ ] Whistle (optional)\n- [ ] This session plan (printed!)\n\n### Field Setup\n1. Mark out a small playing area (30x20 paces)\n2. Set up two cone goals (4 paces wide each)\n3. Place ball bag where it\'s accessible\n4. Identify where parents will wait (not too close!)\n\n### Mental Preparation\n- Review player names one more time\n- Take a deep breath - these kids just want to have fun!\n- Your energy sets the tone - be enthusiastic!\n\n---\n\n## Minute-by-Minute Breakdown\n\n### 0:00-0:08 | Welcome & Name Game (8 min)\n**Your Goal:** Learn every name, establish yourself as friendly and fun\n\n**Exactly What to Say:**\n- As kids arrive: "Hi! I\'m Coach [Name]. What\'s your name? [Repeat it] Great to meet you [Name]! Grab a ball and start kicking around!"\n- Gathering: "Everyone bring your ball and make a circle! When I roll the ball to you, say your name so loud I can hear it!"\n- After names: "Now let\'s pick a team name! What should we be called?"\n\n**Watch For:**\n- Shy kids hanging back (go to them individually)\n- Kids who can\'t remember names (that\'s okay! Make it fun)\n- Over-excited kids (channel energy: "Save that energy for the games!")\n\n### 0:08-0:15 | Follow the Leader (7 min)\n**Your Goal:** Get bodies moving, start building team spirit\n\n**Exactly What to Say:**\n- "We\'re playing Follow the Leader! Copy everything I do with your ball!"\n- After your turn: "Who wants to be leader? [Pick someone] Everyone follow [Name]!"\n\n**Watch For:**\n- Kids who do creative moves (celebrate them!)\n- Kids struggling to follow (simplify your movements)\n\n### 0:15-0:25 | Traffic Lights (10 min)\n**Your Goal:** First real skill - stopping the ball\n\n**Exactly What to Say:**\n- "GREEN means go fast! YELLOW means slow like a turtle! RED means freeze with foot on ball!"\n- Teaching point: "What part of your foot is on the ball? That\'s your SOLE!"\n\n**Watch For:**\n- Ball rolling away on RED (say: "Foot on TOP of ball, like squashing a bug!")\n- Kids not changing speeds (say: "Show me the difference! Cheetah... turtle...")\n\n### 0:25-0:33 | Partner Ball Fun (8 min)\n**Your Goal:** First partner work, basic passing\n\n**Exactly What to Say:**\n- "Find a partner you haven\'t played with! One ball per pair."\n- "Inside of foot, nice and easy. Count your passes!"\n\n**Watch For:**\n- Pairs not counting (encourage: "I heard 5! Can you get to 10?")\n- Kids kicking too hard (say: "Soft pass so your partner can get it!")\n\n### 0:33-0:43 | Fun Scrimmage (10 min)\n**Your Goal:** Let them play! Minimal coaching.\n\n**Exactly What to Say:**\n- "Score by kicking through the cone goal! GO!"\n- Only: "Great shot!" "Nice try!" "GOOOAL!"\n\n**Watch For:**\n- Ball hogs (say: "3 passes before you shoot!")\n- Kids not involved (roll ball to them: "Here [Name], it\'s yours!")\n- One team dominating (quietly join losing team)\n\n### 0:43-0:45 | Celebration (2 min)\n**Your Goal:** End on high note, connect with parents\n\n**Exactly What to Say:**\n- "Hands in middle! That was AMAZING! On three... 1, 2, 3, [TEAM NAME]!"\n- "High fives on the way out!"\n\n---\n\n## Troubleshooting Guide\n\n### "A child won\'t leave their parent"\n1. Don\'t force it - let them watch from parent\'s side\n2. Invite them: "[Name], want to help me roll balls?"\n3. Often they join after seeing others have fun\n4. Tell parent: "Totally normal! They\'ll join when ready."\n\n### "Two kids won\'t stop fighting/arguing"\n1. Separate immediately: "Marcus, you\'re on greens. Tyler, you\'re on reds."\n2. Redirect energy: "Who can show me the fastest dribble?"\n3. If continues: "We have two rules: Fun and Safe. Fighting isn\'t safe."\n4. Talk to parents after if needed\n\n### "A child is crying"\n1. Quick safety check: "Are you hurt?"\n2. If yes: First aid, parent involvement\n3. If no: "It\'s okay to feel upset. Want to take a break?"\n4. Give them a job: "Can you help me count cones?"\n5. They usually rejoin on their own\n\n### "A child is way more skilled than others"\n1. Give them extra challenges: "Can you do it with your other foot?"\n2. Make them a helper: "Can you show Marcus that move?"\n3. They\'ll still have fun - don\'t hold them back too much\n\n### "A child is struggling with everything"\n1. Private encouragement: "You\'re doing great, keep trying!"\n2. Pair them with patient partner\n3. Simplify tasks: "Just touch the ball with your foot - nice!"\n4. Celebrate EFFORT: "I love how hard you\'re trying!"\n\n### "It\'s raining/cold/hot"\n- Light rain: Keep going (kids love it!) but watch for slipping\n- Heavy rain/lightning: Cancel or move to covered area\n- Cold: Shorter water breaks, more movement\n- Hot: More water breaks, shade when available, watch for flushed faces\n\n### "I\'m running out of time"\n- Cut the scrimmage short (5 min instead of 10)\n- Never cut the celebration - that\'s how they remember practice\n- Note what to cut next time\n\n### "We have too much time"\n- Extend the scrimmage\n- Play another round of Traffic Lights\n- Free play at the end\n\n---\n\n## Skill Teaching Points\n\n### Stopping the Ball (Traffic Lights)\n**Correct:** Sole (bottom) of foot on top of ball, knee slightly bent\n**Incorrect:** Toe poke stop, ball rolling away\n**Key Phrase:** "Squash the ball like a bug!"\n\n### Passing (Partner Work)\n**Correct:** Inside of foot, plant foot next to ball, follow through\n**Incorrect:** Toe poke, no follow through\n**Key Phrase:** "Use your inside, nice and easy to your partner!"\n\n---\n\n## Post-Session Reflection\n\nAfter practice, take 5 minutes to answer:\n\n1. Did every child smile at some point? Who might need extra attention?\n2. Did I learn and use every child\'s name?\n3. What worked really well that I should do again?\n4. What was confusing or didn\'t work?\n5. Is there a parent who could help next time?\n\n---\n\n## Parent Communication\n\n### If a parent asks "How did my child do?"\n"[Name] did great! I loved seeing them [specific moment - trying hard, making a friend, scoring a goal, learning to stop the ball]. Looking forward to next practice!"\n\n### Email/Text to send after practice\n"Hi Team Families! Great first practice today! The kids learned a new game called Traffic Lights (ask them to teach you - green means go, yellow means slow, red means STOP!). Next practice is [date/time]. Please bring: water bottle, shin guards, comfortable clothes. Let me know if you have any questions! - Coach [Name]"\n\n### For the Team Newsletter/Group\n"Week 1 Highlights: We became a team today! The kids chose our team name ([name]), learned each other\'s names, and played their first game together. Ask your child: What color means STOP in Traffic Lights? (Answer: Red - with foot on TOP of the ball!) See everyone at practice!"\n',
    isDefault: false,
  },
  {
    name: "Ball Mastery Session - Individual Ball Control",
    sport: "soccer",
    stage: "fundamentals",
    durationMinutes: 60,
    structure: [
      {
        name: "Free Play Arrival",
        type: "warmup",
        durationMinutes: 5,
        description:
          "As players arrive, they grab a ball and play freely within the marked area",
        activitySuggestions: [
          "Free dribbling",
          "Juggling attempts",
          "Shooting at cones",
        ],
        coachingScript:
          'SETUP (arrive 10 min early):\n- Mark a large playing area with cones (30x30 paces)\n- Place balls in a visible spot\n- Set up some cone targets for shooting\n\nAS PLAYERS ARRIVE:\n- Greet each player: "Hey [Name]! Grab a ball and start dribbling around. See if you can knock over a cone!"\n- Let them explore - no instructions needed\n- This gives late arrivals time without holding up practice\n\nOBSERVATION:\n- Watch how players interact with the ball\n- Notice who is comfortable, who is hesitant\n- Mental notes for pairing/grouping later',
      },
      {
        name: "Dynamic Warmup - Ball Mastery Circle",
        type: "warmup",
        durationMinutes: 8,
        description:
          "Guided ball touches in a circle formation - toe taps, sole rolls, foundations",
        activitySuggestions: ["Ball Mastery Circle", "Toe Taps", "Sole Rolls"],
        coachingScript:
          'GATHER THE TEAM (0:05):\n- Clap pattern or whistle\n- "Everyone make a big circle! Ball under your foot."\n- Wait for circle to form, make eye contact around\n\nEXPLAIN:\n- "We\'re going to learn some ball MASTERY moves today. Mastery means you\'re the BOSS of the ball."\n- "Copy me - keep your ball under your foot the whole time!"\n\nTOE TAPS (2 minutes):\n- Demo: alternating feet tapping top of ball\n- "Tap, tap, tap, tap - like a drum beat!"\n- Count together: "1, 2, 3, 4... faster! ...5, 6, 7, 8!"\n- Challenge: "Can you go for 20 without the ball rolling away?"\n- Praise: "Great rhythm [Name]! [Name], keep your eyes up!"\n\nSOLE ROLLS (2 minutes):\n- Demo: roll ball side to side using sole of foot\n- "Roll it across, pull it back. Like a windshield wiper!"\n- "Left foot only... now right foot only... now switch every time!"\n- Challenge: "Can you do it without looking at the ball?"\n\nTICK TOCKS (2 minutes):\n- Demo: ball taps between inside of feet\n- "Inside, inside, inside - like a clock tick-tock!"\n- Speed variations: "Slow tick-tock... now FAST tick-tock!"\n- Challenge: "Move forward while tick-tocking!"\n\nBONUS - PUT IT TOGETHER (2 minutes):\n- "4 toe taps... 4 sole rolls... 4 tick-tocks... GO!"\n- Coach counts: "Tap tap tap tap, roll roll roll roll, tick tock tick tock!"\n- Do 2-3 rounds',
      },
      {
        name: "Ball Mastery Stations",
        type: "technical",
        durationMinutes: 12,
        description: "Rotating stations for focused ball mastery practice",
        activitySuggestions: [
          "Toe Tap Station",
          "Sole Roll Station",
          "Tick Tock Station",
          "Pull Back Station",
        ],
        coachingScript:
          'SETUP (prep during previous activity or before practice):\nCreate 4 stations with cone markers:\n\nSTATION 1 - TOE TAP CHALLENGE\n- One cone\n- Challenge: How many toe taps in 20 seconds?\n\nSTATION 2 - SOLE ROLL MAZE\n- 4 cones in a line (2 feet apart)\n- Sole roll through the cones without touching them\n\nSTATION 3 - TICK TOCK BOX\n- 4 cones in a 3-foot square\n- Tick tock while moving around the box\n\nSTATION 4 - PULL BACK ALLEY\n- 2 cones marking a straight line\n- Dribble forward, pull back with sole, dribble forward\n\nEXPLAIN THE ROTATION (0:13):\n- "We have 4 stations! You\'ll get 3 minutes at each station."\n- Walk them through each station quickly (30 seconds each)\n- "When I yell SWITCH, move to the next station clockwise!"\n- Divide into 4 groups: "1s go here, 2s go here..."\n\nRUN THE STATIONS:\n- Timer on phone: 3 minutes per station\n- Walk around encouraging and giving tips\n- Specific feedback: "Nice rhythm!" "Keep the ball closer!" "Great control!"\n\nSTATION COACHING TIPS:\n- Station 1: "Can you beat your last score?"\n- Station 2: "Soft touches, no rushing!"\n- Station 3: "Stay inside the box!"\n- Station 4: "Sole pull back, inside of foot forward!"\n\nTRANSITIONS:\n- "3... 2... 1... SWITCH!"\n- Quick transitions (30 seconds max)\n- "Find your new station, start right away!"',
      },
      {
        name: "Traffic Lights Plus",
        type: "technical",
        durationMinutes: 8,
        description:
          "Traffic Lights with added ball mastery challenges on each stop",
        activitySuggestions: [
          "Traffic Lights with Challenges",
          "Traffic Lights Plus",
        ],
        coachingScript:
          'TRANSITION (0:25):\n- "Stations are done! Everyone spread out in the big area."\n- "We\'re playing Traffic Lights, but today we\'re adding challenges!"\n\nEXPLAIN:\n- "GREEN = dribble fast, YELLOW = dribble slow, RED = STOP"\n- "But THIS time, when I call RED, I\'ll also call a ball mastery move!"\n- "RED + TOE TAPS means stop and do toe taps until I say GREEN!"\n\nROUND 1 - BASIC (3 minutes):\n- "GREEN!" (5-7 seconds)\n- "RED + TOE TAPS!" (count to 10 out loud with them)\n- "GREEN!"\n- "YELLOW!" (3-4 seconds)\n- "RED + SOLE ROLLS!" (count to 8)\n- Continue pattern\n\nROUND 2 - FASTER + MORE MOVES (3 minutes):\n- Faster transitions\n- Add "RED + TICK TOCKS!"\n- Add "RED + PULL BACKS!"\n- Mix in yellows between\n\nROUND 3 - PLAYER CHOICE (2 minutes):\n- "RED + YOUR CHOICE!" - they pick their move\n- "I want to see your BEST move when I call red!"\n- Celebrate creativity: "Ooh, what\'s that move called [Name]?"\n\nWRAP UP:\n- "Freeze! Show me the move you\'re best at now. Hold it... NICE!"',
      },
      {
        name: "Cone Knockout Game",
        type: "game",
        durationMinutes: 10,
        description:
          "Dribbling game where players try to knock over cones while protecting their own",
        activitySuggestions: ["Cone Knockout", "Dribble & Destroy"],
        coachingScript:
          'SETUP (0:33):\n- Place 15-20 cones standing up randomly throughout the playing area\n- "Everyone has a ball. Your job: knock over cones by DRIBBLING your ball into them!"\n- "BUT - you must stay on your feet. No hands, no kicking the ball from far away!"\n\nEXPLAIN RULES:\n1. Must dribble to the cone and tap it over\n2. Must use your ball (not your body)\n3. Can\'t kick ball from far away - must be close control\n4. When a cone is down, leave it down\n\nROUND 1 - EVERYONE KNOCKS DOWN (3 minutes):\n- "Ready... GO!"\n- Walk around encouraging: "Nice dribble to that one!" "Close control!"\n- "Last 5 cones! Who can get them?"\n- Count down together when almost done\n\nRESET & INTRODUCE DEFENDERS:\n- "Everyone help me set the cones back up - quick quick quick!"\n- Pick 2-3 players: "[Names], you\'re CONE DEFENDERS. Your job: protect the cones!"\n- "Defenders can block with your body but can\'t push anyone."\n\nROUND 2 - WITH DEFENDERS (4 minutes):\n- Much harder now! Dribblers have to be clever\n- "Defenders, which cones will you protect?"\n- "Dribblers, can you trick the defenders?"\n- Celebrate clever plays: "Great fake!" "Nice protection!"\n\nROUND 3 - SWITCH ROLES (3 minutes):\n- New defenders\n- "Last round! Can the dribblers get all the cones this time?"\n\nCOACHING POINTS:\n- "Close control to sneak past defenders!"\n- "Look for unguarded cones!"\n- "Defenders - move your feet, don\'t reach!"',
      },
      {
        name: "Small-Sided Scrimmage",
        type: "game",
        durationMinutes: 12,
        description:
          "3v3 or 4v4 scrimmage applying ball mastery skills in game context",
        activitySuggestions: ["3v3 to Small Goals", "4v4 End Zone"],
        coachingScript:
          'TRANSITION (0:43):\n- "Game time! Let\'s play a real game using our ball mastery skills!"\n- Quickly divide into teams (count off or by pinnie color)\n\nSETUP:\n- Small field (25x20 paces)\n- Small goals (cones, 4 paces wide)\n- 3v3 or 4v4 depending on numbers\n\nSPECIAL RULE:\n- "Before you can shoot, your team must do a BALL MASTERY MOVE!"\n- "Toe taps, sole rolls, tick tocks - something we practiced!"\n- "I\'ll watch for it. If you shoot without a move, no goal!"\n\nPLAY THE GAME:\n\nFirst half (5 minutes):\n- "GO!"\n- Let them play - minimal coaching\n- Only intervene for safety or rule confusion\n- Watch for ball mastery moves: "I saw that sole roll! Now you can shoot!"\n- Celebrate goals and attempts\n\nQuick break (1 minute):\n- "Water sips! What ball mastery moves have you tried?"\n- "Second half, try a move you haven\'t done yet!"\n\nSecond half (5 minutes):\n- Remove the special rule halfway through if they\'re doing well naturally\n- "Free play now - just have fun!"\n- Keep energy up: "Great game! Nice shot!"\n\nCOACHING PHRASES:\n- "Can you use a move to get past them?"\n- "I loved that tick-tock [Name]!"\n- "Soft touch to control, then pass!"\n- "Keep the ball close!"',
      },
      {
        name: "Cool Down & Ball Mastery Challenge",
        type: "cooldown",
        durationMinutes: 5,
        description:
          "Light activity, personal challenge setting, and celebration",
        activitySuggestions: ["Juggling Attempts", "Personal Best Challenge"],
        coachingScript:
          'GATHER (0:55):\n- "Bring it in! Make our circle again."\n- Wait for everyone, catch breath\n\nJUGGLING CHALLENGE (3 minutes):\n- "Let\'s try something tricky - juggling!"\n- Demo: drop ball, let it bounce, kick it up, catch it\n- "How many times can you kick it before it hits the ground?"\n- Let them try for 2 minutes\n- Celebrate ANY success: "One! That counts!" "TWO! Amazing!"\n- "Your homework: practice juggling at home!"\n\nREFLECTION (1 minute):\n- "What was your favorite move we learned today?"\n- Let 3-4 kids share\n- "You\'re all becoming ball masters! I could see your control getting better."\n\nCHALLENGE FOR THE WEEK:\n- "This week, practice toe taps at home. See if you can do 30 without stopping!"\n- "Show your parents! Teach them the moves!"\n\nTEAM CHEER (1 minute):\n- "Hands in. 1, 2, 3, [TEAM NAME]!"\n- "High fives! Great practice everyone!"\n\nPARENT NOTES:\n- "We worked on ball mastery today - toe taps, sole rolls, tick tocks."\n- "Ask your child to teach you a move!"',
      },
    ],
    description:
      "A 60-minute session focused on developing individual ball control through fun, engaging activities. Players work on toe taps, sole rolls, and basic touches in game-like environments. High repetition, maximum touches on the ball.",
    equipmentNeeded: [
      "1 ball per player (plus extras)",
      "20-25 cones",
      "Pinnies (2 colors)",
      "Timer/phone",
      "First aid kit",
    ],
    coachingNotes:
      '# Ball Mastery Session - Complete Coach\'s Guide\n\n## Before You Arrive (15 minutes early)\n\n### Equipment Checklist\n- [ ] Balls - 1 per player + 3 extras\n- [ ] Cones - 20-25 (various colors if available)\n- [ ] Pinnies - 2 colors\n- [ ] Phone/timer for station rotations\n- [ ] First aid kit\n- [ ] This session plan (printed!)\n- [ ] Water available\n\n### Field Setup Diagram\n```\n┌──────────────────────────────────────────────┐\n│                                              │\n│   [Station 1]          [Station 2]           │\n│   Toe Taps             Sole Roll Maze        │\n│      ▲                  ▲   ▲   ▲   ▲        │\n│                                              │\n│                                              │\n│              FREE PLAY AREA                  │\n│           (30x30 pace square)                │\n│                                              │\n│                                              │\n│   [Station 3]          [Station 4]           │\n│   Tick Tock Box        Pull Back Alley       │\n│    ▲ ▲                   ▲──────▲            │\n│    ▲ ▲                                       │\n│                                              │\n│     [Scrimmage Area - 25x20]                 │\n│        ▲ ▲           ▲ ▲                     │\n│       (goal)        (goal)                   │\n│                                              │\n└──────────────────────────────────────────────┘\n```\n\n### Station Setup Details\n**Station 1 - Toe Tap Challenge:** Single cone for reference\n**Station 2 - Sole Roll Maze:** 4 cones in a line, 2 feet apart\n**Station 3 - Tick Tock Box:** 4 cones making a 3-foot square\n**Station 4 - Pull Back Alley:** 2 cones 10 feet apart in a line\n\n---\n\n## Minute-by-Minute Breakdown\n\n### 0:00-0:05 | Free Play Arrival (5 min)\n**Your Goal:** Let players warm up naturally while you greet everyone\n\n**Exactly What to Say:**\n- "Grab a ball and start dribbling around! See if you can knock over a cone!"\n\n**What to Watch:** Who is comfortable with the ball? Who needs encouragement?\n\n### 0:05-0:13 | Ball Mastery Circle (8 min)\n**Your Goal:** Teach three fundamental ball mastery moves\n\n**Move 1: Toe Taps (2 min)**\n- Demo: Alternate tapping top of ball with each foot\n- SAY: "Tap, tap, tap, tap - like a drum beat!"\n- Count: "1, 2, 3, 4... faster! ...5, 6, 7, 8!"\n- Challenge: "20 without the ball rolling away!"\n\n**Move 2: Sole Rolls (2 min)**\n- Demo: Roll ball side to side with bottom of foot\n- SAY: "Roll it across, pull it back. Like a windshield wiper!"\n- Variations: Left only, right only, alternate\n\n**Move 3: Tick Tocks (2 min)**\n- Demo: Tap ball between inside of feet\n- SAY: "Inside, inside, inside - like a clock tick-tock!"\n- Add movement: "Move forward while tick-tocking!"\n\n**Combination (2 min)**\n- "4 toe taps, 4 sole rolls, 4 tick tocks - GO!"\n\n### 0:13-0:25 | Ball Mastery Stations (12 min)\n**Your Goal:** Focused practice with high repetitions\n\n**Key Points:**\n- 3 minutes per station\n- Walk around giving individual feedback\n- "3... 2... 1... SWITCH!" for transitions\n- Keep transitions under 30 seconds\n\n**Coaching Cues by Station:**\n- Station 1: "Can you beat your last score?"\n- Station 2: "Soft touches, no rushing through the cones!"\n- Station 3: "Stay inside the box while tick-tocking!"\n- Station 4: "Sole pulls it back, inside pushes forward!"\n\n### 0:25-0:33 | Traffic Lights Plus (8 min)\n**Your Goal:** Apply ball mastery in a dynamic, fun game\n\n**Exactly What to Say:**\n- "GREEN = dribble fast, YELLOW = slow, RED = STOP + a ball mastery move!"\n- "RED + TOE TAPS!" (do 10 together)\n- "RED + YOUR CHOICE!" (let them pick)\n\n### 0:33-0:43 | Cone Knockout Game (10 min)\n**Your Goal:** Apply close control in a competitive game\n\n**Round 1 (3 min):** Everyone knocks down cones\n**Round 2 (4 min):** Add cone defenders\n**Round 3 (3 min):** New defenders\n\n**Key Phrases:**\n- "Close control to sneak past!"\n- "Look for unguarded cones!"\n\n### 0:43-0:55 | Small-Sided Scrimmage (12 min)\n**Your Goal:** Apply skills in real game situation\n\n**Special Rule:** Must do a ball mastery move before shooting\n**Key Phrases:**\n- "I saw that sole roll - now you can shoot!"\n- "Can you use a move to get past them?"\n\n### 0:55-1:00 | Cool Down & Challenge (5 min)\n**Your Goal:** Light activity, set homework, end positively\n\n**Juggling Intro:**\n- Drop ball, let bounce, kick up, catch\n- "How many kicks before it hits the ground?"\n\n**Homework:** "Practice toe taps at home - try to do 30!"\n\n---\n\n## Troubleshooting Guide\n\n### "Kids can\'t do toe taps - ball keeps rolling away"\n- Have them start with ball against a wall\n- Slow down the tempo\n- SAY: "Lighter touches! Pretend the ball is an egg."\n\n### "Stations are chaotic"\n- Walk to the chaotic station and coach there\n- Add a challenge to focus them: "Can you do it with eyes closed?"\n- If still chaotic, bring everyone together for group demo\n\n### "One kid is way ahead of the others"\n- Give them extra challenges: "Now weak foot only!"\n- Make them a helper: "Can you coach your station?"\n- Personal challenge: "Can you do all 3 moves while moving backward?"\n\n### "A kid says \'I can\'t do it\'"\n- Private encouragement: "You CAN. Watch me. Now try."\n- Simplify: "Just one toe tap. Nice! Now two."\n- Celebrate small wins: "See? You just did it!"\n\n### "Not enough time for everything"\n- Cut one station rotation (9 min instead of 12)\n- Shorten scrimmage to 8 minutes\n- Never cut the celebration/cool down\n\n### "Too much time"\n- Extend scrimmage\n- Add more juggling practice\n- Run an extra round of Traffic Lights Plus\n\n---\n\n## Ball Mastery Skill Teaching Points\n\n### Toe Taps\n**Correct:** Ball in place, alternating feet, tapping top of ball, rhythm steady\n**Incorrect:** Ball moving around, stepping ON the ball, losing balance\n**Key Phrase:** "Light taps, like a drum beat!"\n\n### Sole Rolls\n**Correct:** Bottom of foot on top of ball, rolling side to side, controlled\n**Incorrect:** Using toes instead of sole, ball getting away\n**Key Phrase:** "Windshield wiper - roll it across!"\n\n### Tick Tocks\n**Correct:** Inside of foot, ball going side to side, rhythm consistent\n**Incorrect:** Kicking ball too hard, ball going forward instead of sideways\n**Key Phrase:** "Tick tock like a clock!"\n\n### Pull Backs\n**Correct:** Sole pulls ball backward, inside of foot pushes forward\n**Incorrect:** Stepping on ball, ball going sideways\n**Key Phrase:** "Pull it back with your sole, push with your inside!"\n\n---\n\n## Post-Session Reflection\n\nAfter practice, take 5 minutes to answer:\n\n1. Could all players do at least 10 toe taps by the end?\n2. Did the station rotations run smoothly? What would I change?\n3. Which move was hardest for the group?\n4. Did everyone get to play in the scrimmage?\n5. What was the energy like at the end?\n\n---\n\n## Parent Communication\n\n### If a parent asks "What did you work on today?"\n"We focused on ball mastery - the fundamental moves that help players control the ball. [Name] worked on toe taps, sole rolls, and tick tocks. Ask them to show you at home!"\n\n### Email/Text to send after practice\n"Hi Team! Great practice today working on ball mastery! We learned three key moves: toe taps, sole rolls, and tick tocks. These are the building blocks for all ball control. Challenge for the week: can your child do 30 toe taps without the ball rolling away? Practice makes perfect! See everyone next practice. - Coach [Name]"\n\n### For the Team Newsletter/Group\n"This Week: Ball Mastery! Your young soccer players learned the foundation moves that professionals use every day. Ask your child to teach YOU: 1) Toe taps (alternating feet on top of ball), 2) Sole rolls (rolling ball side to side), 3) Tick tocks (tapping between inside of feet). These moves help develop close control - keeping the ball glued to their feet!"\n',
    isDefault: false,
  },
  {
    name: "Dribbling Adventures - Learning to Move with the Ball",
    sport: "soccer",
    stage: "fundamentals",
    durationMinutes: 60,
    structure: [
      {
        name: "The Jungle Warmup",
        type: "warmup",
        durationMinutes: 8,
        description:
          "Adventure-themed warmup where players dribble like different animals",
        activitySuggestions: ["Animal Dribbling", "Jungle Adventure"],
        coachingScript:
          'ARRIVAL & SETUP:\n- As players arrive: "Welcome to the JUNGLE! Grab a ball - you\'re an explorer today!"\n- Let them dribble freely for 2-3 minutes\n\nGATHER THE TEAM (0:03):\n- "Explorers, come to base camp!" (center of area)\n- "Today we\'re going on a DRIBBLING ADVENTURE through the jungle!"\n- "But first, we need to practice moving like jungle animals!"\n\nANIMAL DRIBBLING (5 minutes):\nEach animal = different dribbling style\n\nCHEETAH (1 min):\n- "CHEETAH! Fast dribbling - go go go!"\n- Let them sprint with ball\n- "Cheetahs are FAST but they stay in control!"\n\nELEPHANT (1 min):\n- "ELEPHANT! Slow and powerful - big heavy steps!"\n- Slow dribbling, strong touches\n- "Stomp stomp stomp with your ball!"\n\nSNAKE (1 min):\n- "SNAKE! Slither side to side!"\n- Dribbling in zig-zag patterns\n- "Sssssslither through the jungle!"\n\nMONKEY (1 min):\n- "MONKEY! Quick direction changes, stop and go!"\n- Dribble, stop suddenly, change direction\n- "Monkeys are tricky!"\n\nFREEZE ANIMAL (1 min):\n- "When I call an animal, show me that dribble!"\n- "CHEETAH!" ... "SNAKE!" ... "ELEPHANT!" ... "MONKEY!"\n- Rapid changes between animals',
      },
      {
        name: "Dribbling Through Gates",
        type: "technical",
        durationMinutes: 10,
        description:
          "Players dribble through cone gates scattered around the area - different points for different gates",
        activitySuggestions: ["Gates Dribbling", "Gate Challenges"],
        coachingScript:
          'SETUP (before practice or during warmup):\n- Create 8-10 cone gates scattered around the playing area\n- Gates = 2 cones, 3 feet apart\n- Some gates tighter than others (harder = more points)\n\nEXPLAIN (0:08):\n- "In the jungle, there are MAGIC GATES!"\n- "Your mission: dribble through as many gates as you can!"\n- Point to different gates: "Some gates are easy (wide) - 1 point. Some are tricky (narrow) - 2 points!"\n- "You MUST go through with your ball under control. No kicking and chasing!"\n\nROUND 1 - FREE EXPLORATION (3 min):\n- "How many gates can you go through in 2 minutes? Count your points! GO!"\n- Walk around encouraging: "Nice control through that one!" "3 points now!"\n- Call out halfway: "1 minute left!"\n- "FREEZE! How many points? Anyone get 10? 15?"\n\nTEACHING MOMENT (1 min):\n- "Show me - what part of your foot guides the ball through the gate?"\n- Look for: inside of foot, laces, outside of foot\n- Demo: "I like to use my INSIDE for control, or my LACES to push straight through."\n\nROUND 2 - CHALLENGE ROUND (3 min):\n- "This time, you can only use ONE FOOT! Pick your favorite!"\n- Walk around checking for one-foot use\n- "Now switch - OTHER FOOT ONLY!"\n\nROUND 3 - TRAFFIC GATES (3 min):\n- "Now there\'s TRAFFIC! You might meet someone at the gate!"\n- "If someone else is going through, you have to wait or find another gate!"\n- "This is like a real game - there\'s other players around!"\n- Encourage awareness: "Eyes up! Who else is near that gate?"',
      },
      {
        name: "Treasure Island",
        type: "technical",
        durationMinutes: 10,
        description:
          "Dribbling game where players collect 'treasures' (cones/objects) while dribbling",
        activitySuggestions: ["Treasure Island", "Collect the Cones"],
        coachingScript:
          'SETUP (0:18):\n- Scatter 20-25 small objects (extra cones, small discs, bean bags) around the area\n- Create a "Treasure Chest" area with cones at each end\n\nEXPLAIN:\n- "TREASURE ISLAND! There\'s treasure scattered all around!"\n- "Your mission: dribble to a treasure, pick it up, dribble back to your treasure chest!"\n- "You MUST be dribbling when you pick up treasure - no parking your ball!"\n- Point to treasure chests: "This team\'s chest is here, this team\'s chest is here!"\n\nROUND 1 - TEAM TREASURE HUNT (4 min):\n- Divide into 2 teams\n- "Which team can collect the most treasure? GO!"\n- Encourage keeping ball close while bending to pick up treasure\n- "That\'s tricky! Ball close, scoop the treasure!"\n- Count treasures at end: "Team 1 has 12! Team 2 has 13! Great collecting!"\n\nRESET treasures, pick 2-3 pirates:\n\nROUND 2 - PIRATE ATTACK! (4 min):\n- "[Names], you\'re PIRATES! You try to kick dribblers\' balls out!"\n- "Treasure hunters - if your ball gets kicked out, do 5 toe taps then come back!"\n- "Pirates - kick balls OUT, don\'t steal the treasure!"\n- Creates pressure while dribbling\n- "Protect your ball AND grab the treasure!"\n\nCOACHING POINTS:\n- "Keep the ball close so pirates can\'t get it!"\n- "Which way is a pirate coming? Turn the OTHER way!"\n- "Quick - scoop and go!"\n\nFINAL COUNT:\n- "FREEZE! Count your treasure! Amazing treasure hunting!"',
      },
      {
        name: "Shark Attack",
        type: "game",
        durationMinutes: 10,
        description:
          "Classic dribbling game - sharks try to kick balls out while dribblers protect",
        activitySuggestions: ["Shark Attack", "Protect Your Ball"],
        coachingScript:
          'TRANSITION (0:28):\n- "Now we\'re leaving the jungle and going to... THE OCEAN!"\n- "But watch out - there are SHARKS!"\n\nSETUP:\n- 20x20 pace grid\n- 1-2 sharks with pinnies (no ball)\n- Everyone else has a ball\n\nEXPLAIN:\n- "Dribblers - protect your ball from the sharks!"\n- "Sharks - kick balls OUT of the ocean!"\n- "If your ball gets kicked out, 5 toe taps on the side, then swim back in!"\n\nROUND 1 (3 min):\n- "Sharks, show me your shark faces! Dribblers ready? SHARKS ARE HUNGRY!"\n- Walk around the outside\n- Encourage: "Great escape!" "Nice protecting!" "Sharks - find the sleepy fish!"\n- "FREEZE! Dribblers, point to where the sharks are right now!"\n\nTEACHING MOMENT:\n- "How do you protect your ball from a shark?"\n- Look for: "Put my body between the shark and ball"\n- Demo: "YES! This is called SHIELDING. Body between shark and ball!"\n\nROUND 2 (3 min):\n- "Now when you shield, the shark has to go around!"\n- Reinforce: "Beautiful shield!" "Turn away from the shark!"\n\nROUND 3 - NEW SHARKS (3 min):\n- "New sharks! Who wants to be a shark?"\n- Trade pinnies\n- "Last round - can the sharks catch everyone?"\n\nWRAP UP:\n- "Great ocean survival! Remember - SHIELD to protect your ball!"',
      },
      {
        name: "Adventure Scrimmage",
        type: "game",
        durationMinutes: 15,
        description:
          "Small-sided game with special 'adventure points' for dribbling moves",
        activitySuggestions: [
          "3v3 Adventure Game",
          "Dribbling Points Scrimmage",
        ],
        coachingScript:
          'TRANSITION (0:38):\n- "Final adventure - a REAL GAME with adventure points!"\n- Split into two teams quickly\n\nSETUP:\n- 25x20 pace field\n- Cone goals (4 paces wide)\n- 3v3 or 4v4\n\nSPECIAL RULES:\n- "Goal = 1 point (normal)"\n- "ADVENTURE POINT = 2 points if you dribble past a defender before scoring!"\n- "Dribbling past someone means you had the ball, they tried to get it, you kept it and went past!"\n- "I\'ll be watching for adventure points!"\n\nFIRST HALF (6 min):\n- "GO!"\n- Watch for dribbling attempts\n- Call out adventure points: "That\'s an adventure point! [Name] dribbled past them!"\n- Celebrate attempts even if not successful: "Great try to dribble past!"\n\nHALF TIME (1 min):\n- "Water sips! What\'s working? How can you earn adventure points?"\n- Quick tips: "Remember your moves - change direction like a monkey!"\n\nSECOND HALF (6 min):\n- "GO! Hunt for those adventure points!"\n- Keep energy high\n- If one team is dominating, quietly join the other team\n\nCOACHING PHRASES:\n- "Can you use a move to get past?"\n- "Remember the snake - slither past them!"\n- "Shield! Then turn away!"\n- "Beautiful adventure dribble!"\n\nFINAL WHISTLE:\n- "GAME OVER! Great adventure game!"\n- Quick count: "Did we earn any adventure points? How many?"',
      },
      {
        name: "Adventure Recap & Challenge",
        type: "cooldown",
        durationMinutes: 7,
        description:
          "Cool down with adventure recap, skill challenge, and celebration",
        activitySuggestions: ["Juggling Challenge", "Adventure Badge Review"],
        coachingScript:
          'GATHER (0:53):\n- "Adventurers, bring it in! Make our explorer circle!"\n- Wait for everyone, catch breath\n\nADVENTURE RECAP (2 min):\n- "What adventures did we go on today?"\n- Let them answer: Jungle, Treasure Island, Ocean with sharks, Adventure game\n- "What dribbling skills did we learn?"\n- Look for: different speeds, going through gates, shielding, dribbling past people\n\nJUGGLING CHALLENGE (3 min):\n- "Every great adventurer can juggle! Let\'s practice."\n- Demo: drop, bounce, kick, catch\n- "How many can you do? Start practicing!"\n- Walk around encouraging\n- Celebrate successes: "One!" "That was TWO!"\n\nADVENTURE CHALLENGE FOR THE WEEK:\n- "Your adventure mission for this week:"\n- "Find things to dribble around at home - toys, shoes, anything!"\n- "Practice dribbling through gates - use shoes or bottles as cones!"\n- "See if you can dribble like all 4 animals we learned!"\n\nTEAM CHEER (1 min):\n- "Hands in! Adventurers on three!"\n- "1... 2... 3... ADVENTURERS!"\n- "High fives! Great adventure today!"\n\nPARENT NOTES:\n- Available for parents\n- "We went on dribbling adventures today! [Name] did great at [specific skill]."\n- "Ask them about the animals we dribbled like!"',
      },
    ],
    description:
      "A 60-minute session focused on dribbling skills through adventure-themed games. Players learn to dribble with different parts of the foot, change direction, and dribble under pressure. High engagement through storytelling and imagination.",
    equipmentNeeded: [
      "1 ball per player (plus extras)",
      "25-30 cones",
      "20-25 small objects for treasure (extra cones, discs, bean bags)",
      "Pinnies (2-3 for sharks)",
      "First aid kit",
    ],
    coachingNotes:
      '# Dribbling Adventures - Complete Coach\'s Guide\n\n## Before You Arrive (15 minutes early)\n\n### Equipment Checklist\n- [ ] Balls - 1 per player + 3 extras\n- [ ] Cones - 25-30 (for gates, goals, boundaries)\n- [ ] Small objects for "treasure" - 20-25 items (extra cones, discs, bean bags)\n- [ ] Pinnies - 3-4 for sharks and teams\n- [ ] First aid kit\n- [ ] This session plan (printed!)\n- [ ] Water available\n\n### Field Setup Diagram\n```\n┌──────────────────────────────────────────────────┐\n│                                                  │\n│    ▲ ▲    ▲ ▲       ▲ ▲      ▲ ▲                │\n│   (gate) (gate)    (gate)   (gate)              │\n│                                                  │\n│        ●   ●   ●   ●   ●   ●                    │\n│     ●   ●   ●   ●   ●   ●   ●                   │\n│        (scattered treasure)                      │\n│    ▲ ▲       ▲ ▲        ▲ ▲      ▲ ▲            │\n│   (gate)    (gate)     (gate)   (gate)          │\n│                                                  │\n│                                                  │\n│  [Treasure Chest 1]        [Treasure Chest 2]   │\n│      ▲ ▲ ▲ ▲                   ▲ ▲ ▲ ▲          │\n│                                                  │\n│              SCRIMMAGE AREA                      │\n│        ▲ ▲                    ▲ ▲                │\n│       (goal)                 (goal)              │\n│                                                  │\n└──────────────────────────────────────────────────┘\n```\n\n### Gate Setup Details\n- Create 8-10 gates scattered randomly\n- Each gate = 2 cones, 3 feet apart\n- Make 3-4 narrow gates (harder, worth 2 points)\n- Make 4-5 wider gates (easier, worth 1 point)\n\n---\n\n## Minute-by-Minute Breakdown\n\n### 0:00-0:08 | The Jungle Warmup (8 min)\n**Your Goal:** Get moving, introduce adventure theme, different dribbling speeds\n\n**Animals & Dribbling Styles:**\n| Animal | Dribbling Style | Key Phrase |\n|--------|-----------------|------------|\n| CHEETAH | Fast, sprint | "Fast but in control!" |\n| ELEPHANT | Slow, powerful | "Stomp stomp stomp!" |\n| SNAKE | Zig-zag, slither | "Sssslither side to side!" |\n| MONKEY | Stop-start, direction changes | "Tricky monkeys!" |\n\n**Exactly What to Say:**\n- "CHEETAH! Fast dribbling - go go go!"\n- "ELEPHANT! Slow and powerful - big heavy steps!"\n- "SNAKE! Slither side to side!"\n- "MONKEY! Quick direction changes!"\n\n### 0:08-0:18 | Dribbling Through Gates (10 min)\n**Your Goal:** Practice close control, introduce different feet\n\n**Round 1 (3 min):** Free gate exploration - count points\n**Teaching moment (1 min):** "What part of foot guides through?"\n**Round 2 (3 min):** One foot only, then switch\n**Round 3 (3 min):** Traffic gates - awareness of others\n\n**Key Phrases:**\n- "Inside of foot for control!"\n- "Laces to push straight through!"\n- "Eyes up - who else is near that gate?"\n\n### 0:18-0:28 | Treasure Island (10 min)\n**Your Goal:** Dribble while doing another task, add pressure\n\n**Round 1 (4 min):** Team treasure collection\n**Round 2 (4 min):** Add pirates (defenders)\n\n**Key Phrases:**\n- "Ball close while you pick up treasure!"\n- "Protect your ball AND grab the treasure!"\n- "Which way is a pirate? Turn the OTHER way!"\n\n### 0:28-0:38 | Shark Attack (10 min)\n**Your Goal:** Dribbling under pressure, introduce shielding\n\n**Round 1 (3 min):** Basic shark attack\n**Teaching moment:** Introduce shielding - body between shark and ball\n**Round 2 (3 min):** Reinforce shielding\n**Round 3 (3 min):** New sharks\n\n**Key Phrases:**\n- "Put your body between the shark and the ball!"\n- "This is called SHIELDING!"\n- "Turn away from the shark!"\n\n### 0:38-0:53 | Adventure Scrimmage (15 min)\n**Your Goal:** Apply dribbling in game context\n\n**Special Rule:** 2 points for "adventure point" (dribbling past a defender)\n\n**First half (6 min):** Watch for adventure attempts\n**Half time (1 min):** Quick tips\n**Second half (6 min):** Keep encouraging dribbling moves\n\n**Key Phrases:**\n- "Adventure point! You dribbled past them!"\n- "Can you use a move to get past?"\n- "Remember the snake - slither past!"\n\n### 0:53-1:00 | Adventure Recap & Challenge (7 min)\n**Your Goal:** Reflect on learning, set homework\n\n**Activities:**\n- Adventure recap (2 min)\n- Juggling challenge (3 min)\n- Weekly challenge & team cheer (2 min)\n\n**Weekly Challenge:** "Practice dribbling around objects at home!"\n\n---\n\n## Troubleshooting Guide\n\n### "Kids aren\'t going through gates - just dribbling randomly"\n- Stand by a gate and call kids over: "[Name], can you come through THIS gate?"\n- Add competition: "Who can get the most points?"\n- Make it more dramatic: "These are MAGIC gates!"\n\n### "Sharks catching everyone immediately"\n- Make the area bigger\n- Remove a shark\n- Sharks must hop instead of run\n- Add safe zones (3 seconds safe in corners)\n\n### "No one is getting adventure points in scrimmage"\n- Lower the bar: "Adventure point if you TRY to dribble past!"\n- Demo what it looks like\n- Add yourself to game and earn one, then celebrate\n\n### "Kids are frustrated with dribbling"\n- Simplify: "Just keep the ball close!"\n- Use animals: "Be a turtle - slow and steady!"\n- Private encouragement: "You\'re getting it!"\n\n### "Treasure hunt is chaotic"\n- Give each player specific treasure color to collect\n- Assign regions of the field\n- Add rule: "Walk, don\'t run!"\n\n### "One player always wants to be shark"\n- "Everyone will get a turn!"\n- Use fair selection: "Who hasn\'t been a shark yet?"\n- Rotate every round\n\n---\n\n## Dribbling Skill Teaching Points\n\n### Using Inside of Foot\n**Correct:** Inside of foot pushes ball, body sideways to direction\n**Incorrect:** Toe poke, ball going too far\n**Key Phrase:** "Turn your foot sideways, push with the inside!"\n\n### Using Laces (Instep)\n**Correct:** Laces contact middle of ball, foot points down\n**Incorrect:** Kicking with toe, ball going high\n**Key Phrase:** "Point your toe down, push with your laces!"\n\n### Shielding\n**Correct:** Body between ball and defender, ball on far foot\n**Incorrect:** Facing defender, ball exposed\n**Key Phrase:** "Body is a wall between the shark and your treasure!"\n\n### Changing Direction\n**Correct:** Inside/outside of foot cuts ball, body follows\n**Incorrect:** Stopping, then turning, then starting\n**Key Phrase:** "One smooth motion - cut and go!"\n\n---\n\n## The Adventure Theme\n\n### Why Use the Adventure Theme?\n- Kids ages 6-8 respond to imagination and storytelling\n- Makes repetitive skill work feel like play\n- Creates memorable associations with skills\n- Kids remember "Cheetah dribbling" better than "fast dribbling"\n\n### Theme Connections\n| Theme Element | Skill Being Taught |\n|---------------|-------------------|\n| Jungle animals | Speed control |\n| Magic gates | Close control, parts of foot |\n| Treasure Island | Dribbling while multitasking |\n| Shark Attack | Dribbling under pressure |\n| Adventure points | Dribbling past opponents |\n\n### If a Kid Doesn\'t Want to Play Pretend\n- That\'s okay! Just give them the skill instruction\n- "Instead of being a cheetah, dribble really fast!"\n- They\'ll often join in once they see others having fun\n\n---\n\n## Post-Session Reflection\n\nAfter practice, take 5 minutes to answer:\n\n1. Did the adventure theme engage the kids?\n2. Which animal dribbling style did kids do best?\n3. Did kids understand the shielding concept?\n4. Were the gates the right difficulty?\n5. Did everyone earn at least one adventure point (or try to)?\n\n---\n\n## Parent Communication\n\n### If a parent asks "What did you work on today?"\n"We went on dribbling adventures! [Name] learned to dribble at different speeds (like jungle animals!), went through obstacle gates, protected their ball from \'sharks,\' and played a game. Ask them to show you \'cheetah dribbling\' vs \'elephant dribbling\'!"\n\n### Email/Text to send after practice\n"Hi Team! What an adventure today! We practiced dribbling through jungle-themed games. Your child learned: 1) Speed control (fast like a cheetah, slow like an elephant), 2) Dribbling through tight spaces, 3) SHIELDING - protecting the ball from defenders. Ask them to teach you the animal dribbles! See everyone next practice. - Coach [Name]"\n\n### For the Team Newsletter/Group\n"This Week\'s Adventure: Dribbling Skills! Our team became jungle explorers, treasure hunters, and ocean survivors today! We learned that great dribblers can go fast (cheetah), slow (elephant), zig-zag (snake), and stop-start (monkey). The big skill of the day: SHIELDING - putting your body between the defender and the ball. Challenge for home: Set up some \'gates\' with shoes or water bottles and practice dribbling through them!"\n',
    isDefault: false,
  },
  {
    name: "Game Day Warmup - Pre-Game Routine",
    sport: "soccer",
    stage: "fundamentals",
    durationMinutes: 20,
    structure: [
      {
        name: "Arrival & Ball Touches",
        type: "warmup",
        durationMinutes: 5,
        description:
          "Free ball play while team assembles, gentle ball touches to settle nerves",
        activitySuggestions: ["Free dribbling", "Gentle passing with partner"],
        coachingScript:
          'ARRIVAL (start 20 min before game):\nWhen each player arrives:\n- "Hey [Name]! Grab a ball and start dribbling around. Nice and easy!"\n- "Find a partner and pass back and forth when you\'re ready."\n\nPURPOSE OF THIS TIME:\n- Let energy settle naturally\n- No pressure, no instructions\n- Kids who are nervous can calm down\n- Kids who are excited can burn off energy\n- Coach can handle logistics (lineup, parents, etc.)\n\nWHAT TO SAY:\n- "How are you feeling? Excited?"\n- "Nice passes!"\n- "Keep the ball moving, get those feet warmed up!"\n- Don\'t over-coach - let them be\n\nLOGISTICS DURING THIS TIME:\n- Check roster/attendance\n- Confirm lineup in your head\n- Touch base with any parents who need info\n- Have extra balls ready for warm-up',
      },
      {
        name: "Team Circle Ball Mastery",
        type: "warmup",
        durationMinutes: 4,
        description:
          "Group ball mastery to synchronize the team and build rhythm together",
        activitySuggestions: ["Toe Taps", "Sole Rolls", "Tick Tocks"],
        coachingScript:
          'GATHER THE TEAM (0:05):\n- Clap pattern: "Everyone in! Make a circle!"\n- Wait for quiet, eye contact with each player\n- "Okay team, let\'s get our feet ready! Ball under your foot."\n\nTOE TAPS (1 min):\n- "Toe taps together! We\'ll count to 20 as a team!"\n- Count out loud together: "1, 2, 3, 4..." up to 20\n- "Nice rhythm! Your feet are waking up!"\n\nSOLE ROLLS (1 min):\n- "Now sole rolls - left foot only... now right foot only..."\n- "Feel the ball under your foot!"\n- "Switch every time I clap!"\n\nTICK TOCKS (1 min):\n- "Tick tocks - inside to inside!"\n- "Start slow... a little faster... nice!"\n\nQUICK STRETCH WITH BALL (1 min):\n- "Put ball between your feet, reach for the sky... and touch your toes!"\n- "Roll ball under one foot, stretch that leg..."\n- "Shake out your legs!"\n\nENERGY CHECK:\n- "How\'s everyone feeling? Ready? Let\'s go!"',
      },
      {
        name: "Dynamic Movement",
        type: "warmup",
        durationMinutes: 4,
        description:
          "Jogging and dynamic movements to raise heart rate and loosen muscles",
        activitySuggestions: [
          "Jog and move",
          "Dynamic stretches",
          "Light running",
        ],
        coachingScript:
          'LINE UP (0:09):\n- "Put your balls on the side. Line up on this line!"\n- Mark a straight line about 15-20 paces\n\nMOVEMENT SEQUENCE:\nDo each movement across and back (30 seconds each):\n\nJOG (30 sec):\n- "Light jog across, jog back!"\n- "Easy pace, wake up those legs!"\n\nHIGH KNEES (30 sec):\n- "High knees! Knees to your hands!"\n- Demonstrate, jog with them\n- "Pump those arms!"\n\nBUTT KICKS (30 sec):\n- "Butt kicks! Heels to your bottom!"\n- "Quick feet, quick feet!"\n\nSIDE SHUFFLE (30 sec):\n- "Side shuffle! Face me, shuffle across!"\n- "Stay low, quick feet!"\n- "Other way back!"\n\nKARAOKE/GRAPEVINE (30 sec):\n- "Grapevine! Cross your feet as you go!"\n- Demo first - some kids won\'t know this\n- "Don\'t worry if it\'s tricky - just try!"\n\nSKIP (30 sec):\n- "Skip across! Big skips!"\n- "Swing those arms!"\n- "And skip back!"\n\nSPRINT (30 sec):\n- "Last one - SPRINT across... jog back easy!"\n- "Fast fast fast!"\n- "Nice work! Grab your water!"\n\nQUICK WATER (30 sec):\n- "Quick sips, then back! We\'re almost ready!"',
      },
      {
        name: "Passing Pairs",
        type: "technical",
        durationMinutes: 4,
        description:
          "Partner passing to warm up touch and get game-ready connections",
        activitySuggestions: ["Partner passing", "Two-touch passing"],
        coachingScript:
          'SETUP (0:13):\n- "Find a partner, one ball, spread out!"\n- "Stand about 5 big steps apart."\n\nPASSING SEQUENCE:\n\nTWO-TOUCH PASSING (90 sec):\n- "Pass back and forth - first touch to control, second touch to pass!"\n- "Call your partner\'s name when you pass!"\n- Walk around, encourage: "Nice pass!" "Great control!"\n- "Try to hit your partner\'s feet!"\n\nONE-TOUCH PASSING (60 sec):\n- "Now try one-touch - pass it right back!"\n- "Soft pass so they can one-touch it!"\n- "If one-touch is too hard, go back to two-touch - that\'s totally fine!"\n\nMOVING PASSING (60 sec):\n- "Now move side to side while you pass!"\n- "Pass, then shuffle to a new spot!"\n- "Keep the ball moving, keep your feet moving!"\n\nCOACHING POINTS:\n- "Inside of foot!"\n- "Soft touch!"\n- "Eyes on your partner!"\n- "Nice weight on that pass!"',
      },
      {
        name: "Team Huddle & Lineup",
        type: "cooldown",
        durationMinutes: 3,
        description:
          "Final team huddle, starting lineup announcement, team chant for confidence",
        activitySuggestions: ["Team huddle", "Starting lineup", "Team chant"],
        coachingScript:
          'GATHER (0:17):\n- "Bring it in! Huddle up!"\n- Wait for everyone, tight circle\n\nTEAM TALK (1 min):\n- Keep it SHORT and POSITIVE\n- "Okay team, we\'re ready! Here\'s what I want to see today:"\n- Pick ONE simple focus: "Have fun!" or "Try your hardest!" or "Support each other!"\n- DON\'T: Long tactical talks, lists of things to remember\n\nExamples of good pre-game messages:\n- "One thing today: Have FUN! That\'s it. Have fun."\n- "Remember: We\'re a TEAM. Cheer for each other!"\n- "Play hard, support your teammates, have fun!"\n\nSTARTING LINEUP (1 min):\n- If you use subs, announce simply\n- "Starting: [Names]. Everyone else, you\'ll go in soon. Everyone plays!"\n- Keep it matter-of-fact, not dramatic\n- "And remember - everyone gets to play lots today!"\n\nTEAM CHANT (1 min):\n- "Hands in the middle!"\n- "On three - [team name]! 1... 2... 3... [TEAM NAME]!"\n- "Let\'s GO!"\n\nPOSITIONS:\n- Walk starters to their positions\n- Show them where to stand for kickoff\n- "You\'re starting here. When the whistle blows, let\'s play!"\n\nFINAL WORDS:\n- "Have fun out there! I believe in you!"',
      },
    ],
    description:
      "A focused 20-minute pre-game warmup routine for young players. Gets bodies warm, minds focused, and energy levels right. Simple, consistent routine that becomes familiar throughout the season. Builds confidence before kickoff.",
    equipmentNeeded: [
      "1 ball per player",
      "4 cones for warmup line",
      "Water bottles (remind parents)",
      "This warmup plan",
    ],
    coachingNotes:
      '# Game Day Warmup - Complete Coach\'s Guide\n\n## Before You Arrive (30 minutes before game)\n\n### Equipment Checklist\n- [ ] Balls - 1 per player + extras\n- [ ] Cones - 4 for warmup line\n- [ ] Lineup written down\n- [ ] This warmup plan\n- [ ] First aid kit at bench\n- [ ] Team water/snacks coordinated with parent\n\n### Field Check\n- Where is your team\'s warmup area? (Usually a space behind your goal or on the side)\n- Where are parents sitting? (Direct them to spectator area)\n- Where is the team bench?\n- Introduce yourself to ref if possible\n\n### Mental Preparation\n- Review lineup (who starts, substitution plan)\n- Take a breath - your calm energy helps the team\n- Remember: This is supposed to be FUN for them!\n\n---\n\n## Minute-by-Minute Breakdown\n\n### 20:00-15:00 before kickoff | Arrival & Ball Touches (5 min)\n**Your Goal:** Let team gather naturally, settle nerves\n\n**Exactly What to Say:**\n- "Hey [Name]! Grab a ball, start dribbling, nice and easy!"\n- "Find a partner and pass around!"\n- "How are you feeling? Excited for the game?"\n\n**What to Watch:**\n- Nervous kids (extra encouragement, give them a job)\n- Over-excited kids (channel energy: "Save it for the game!")\n- Late arrivals (no stress, direct them to join warmup)\n\n**Coach Tasks:**\n- Check attendance\n- Finalize lineup\n- Direct parents to spectator area\n\n### 15:00-11:00 before kickoff | Team Circle Ball Mastery (4 min)\n**Your Goal:** Synchronize team, build rhythm and focus\n\n**Exactly What to Say:**\n- "Everyone in! Make a circle, ball under foot!"\n- "Toe taps together - let\'s count to 20! 1, 2, 3, 4..."\n- "Nice! Now sole rolls..."\n\n**Sequence:**\n1. Toe taps (count to 20)\n2. Sole rolls (left foot, then right)\n3. Tick tocks (slow to fast)\n4. Quick stretch with ball\n\n### 11:00-7:00 before kickoff | Dynamic Movement (4 min)\n**Your Goal:** Raise heart rate, loosen muscles\n\n**Exactly What to Say:**\n- "Balls on the side! Line up on this line!"\n- "Light jog across, back!"\n- "High knees! Butt kicks! Side shuffle!"\n\n**Movement Sequence (30 sec each):**\n1. Light jog\n2. High knees\n3. Butt kicks\n4. Side shuffle (both ways)\n5. Karaoke/Grapevine\n6. Skip\n7. Sprint (jog back easy)\n8. Quick water\n\n### 7:00-3:00 before kickoff | Passing Pairs (4 min)\n**Your Goal:** Warm up passing touch, partner connections\n\n**Exactly What to Say:**\n- "Partner up, one ball, 5 steps apart!"\n- "Two-touch passing - control, then pass! Call their name!"\n- "Now try one-touch - pass it right back!"\n- "Now move while you pass!"\n\n**Sequence:**\n1. Two-touch passing (90 sec)\n2. One-touch passing (60 sec)\n3. Moving while passing (60 sec)\n\n### 3:00-0:00 before kickoff | Team Huddle & Lineup (3 min)\n**Your Goal:** Focus, confidence, send them out ready\n\n**Team Talk (keep SHORT):**\n- Pick ONE simple message\n- "One thing today: Have FUN!"\n- "We\'re a TEAM - cheer for each other!"\n- "Play hard and support your teammates!"\n\n**Do NOT:**\n- Give long tactical talks\n- List multiple things to remember\n- Create pressure or stress\n\n**Lineup:**\n- Announce starters simply\n- "Everyone plays lots today!"\n- Walk them to positions\n\n**Team Chant:**\n- "Hands in! 1, 2, 3, [TEAM NAME]!"\n- "Let\'s GO!"\n\n---\n\n## Pre-Game Anxiety Guide\n\n### Signs a Child is Nervous\n- Unusually quiet\n- Fidgeting more than normal\n- Not wanting to participate in warmup\n- Saying "I don\'t want to play"\n- Stomach complaints\n\n### How to Help\n1. **Don\'t force it** - "It\'s okay to feel nervous. That means you care!"\n2. **Give a job** - "Can you help me count the balls?"\n3. **Pair with buddy** - Put them with a confident friend\n4. **Simple focus** - "Just try to touch the ball. That\'s your only goal today."\n5. **Physical grounding** - "Take 3 deep breaths with me."\n\n### What to Say\n- "Butterflies are normal! Even professional players get them."\n- "Once the game starts, the nervous feeling usually goes away."\n- "Just do your best and have fun - that\'s all I ask!"\n- "I\'ll be right here cheering for you!"\n\n### If They Really Don\'t Want to Play\n- Don\'t force them onto the field\n- Let them sit with you on the bench first\n- Invite them to join when ready\n- Talk to parents calmly after the game\n\n---\n\n## Weather Adjustments\n\n### Cold Day\n- Extend dynamic movement section\n- Add jumping jacks and arm circles\n- Shorter water breaks\n- Keep them moving constantly\n\n### Hot Day\n- More water breaks (add one after ball mastery)\n- Shade if available\n- Watch for flushed faces, heavy breathing\n- Slightly shorter warmup if very hot\n\n### Wet/Slippery\n- Emphasize controlled movements\n- No sharp turns or sprints\n- Watch footing\n- "Careful on turns - it\'s slippery!"\n\n### Wind\n- Adjust passing direction (pass into wind = harder)\n- Tighter control work\n- Keep balls in circle (they roll away)\n\n---\n\n## Game Day Energy Management\n\n### If Team Seems Flat/Low Energy\n- Add competition: "Who can do 30 toe taps fastest?"\n- Increase your own energy\n- Sprint challenge at end of dynamic warmup\n- Call-and-response: "Are we ready?!" "YES!"\n\n### If Team Seems Over-Excited/Chaotic\n- Slow down your voice\n- Ball mastery circle is calming\n- Deep breaths as a team\n- Focus exercise: "Show me your game face. Focused and ready."\n\n### Finding the Right Energy\n- Not too sleepy (won\'t compete)\n- Not too hyper (won\'t focus)\n- Alert, excited, but controlled\n- They should be smiling but attentive\n\n---\n\n## Starting Lineup Notes\n\n### How to Announce\n- Keep it simple and matter-of-fact\n- "Starting today: Marcus, Lily, Sarah, Jake. Everyone else goes in really soon!"\n- Don\'t make it dramatic\n- Emphasize that EVERYONE PLAYS\n\n### If a Kid is Upset About Not Starting\n- Private moment: "Hey, you\'re going in soon. I need you ready!"\n- Give them a job: "Watch from here and tell me what you see!"\n- Reassure: "You\'ll play lots today, promise."\n- Follow through - get them in early\n\n### Substitution Tips for Young Ages\n- Sub frequently (every 5-8 minutes)\n- Keep track on paper or phone\n- Equal playing time for all\n- Don\'t wait for natural stoppages - create them\n\n---\n\n## Post-Warmup Checklist\n\nBefore the whistle blows, confirm:\n- [ ] All players have had water\n- [ ] Starters know their positions\n- [ ] Subs know they\'ll play soon\n- [ ] Team has done their chant\n- [ ] Coach is calm and positive\n- [ ] Parent situation is handled (they\'re in right spot)\n\n---\n\n## Quick Reference Card\n\nPrint this on a small card for your pocket:\n\n```\nGAME DAY WARMUP (20 min)\n\n5 min - Free arrival + ball touches\n4 min - Circle: Toe taps, Sole rolls, Tick tocks\n4 min - Movement: Jog, High knees, Butt kicks, Shuffle, Skip, Sprint\n4 min - Partner passing: 2-touch, 1-touch, Moving\n3 min - Huddle, Lineup, TEAM CHANT!\n\nMessage: "HAVE FUN!"\n```\n\n---\n\n## Parent Communication\n\n### Pre-Game Text to Send (day before)\n"Hi Team! Game tomorrow at [time/place]. Please arrive 25 minutes early for warmup. Bring: water bottle, shin guards, proper shoes. Looking forward to a fun game! - Coach [Name]"\n\n### What to Tell Parents Before Game\n- "We\'ll warm up for 20 minutes, then it\'s game time!"\n- "Please stay in the spectator area - kids focus better!"\n- "Cheer for ALL the kids, both teams!"\n- "Stay positive - they can hear you!"\n\n### If Parents Ask About the Lineup\n- "Everyone plays equally - I rotate throughout the game."\n- "At this age, development is more important than winning."\n- "I\'ll make sure [Name] gets plenty of playing time!"\n',
    isDefault: true,
  },
  {
    name: "Ball Mastery Fun Session",
    sport: "soccer",
    stage: "fundamentals",
    durationMinutes: 60,
    structure: [
      {
        name: "Free Play Arrival",
        type: "warmup",
        durationMinutes: 5,
        description:
          "Let players arrive and play freely with balls. Coach greets each player by name.",
        activitySuggestions: ["free-play"],
      },
      {
        name: "Warmup: Volcano Dribble",
        type: "warmup",
        durationMinutes: 7,
        description:
          "Players dribble around 'volcanos' (cones) without touching them. If they touch a volcano, it 'erupts' - 5 toe taps!",
        activitySuggestions: ["volcano-dribble"],
        coachingScript:
          "Can everyone find their own volcano-free space?\nWhat happens if you look down at the ball? You might hit a volcano!\nTry using different parts of your foot - inside, outside, sole",
      },
      {
        name: "Ball Mastery Circuit",
        type: "technical",
        durationMinutes: 12,
        description:
          "Stations with different ball mastery moves. 2 minutes per station.\n\nStations:\n- Station 1: Toe taps (count to 20)\n- Station 2: Inside-inside touches (side to side)\n- Station 3: Pull-push with sole\n- Station 4: Around the world (circles around ball)\n- Station 5: Tick-tocks (pendulum between feet)",
        activitySuggestions: ["ball-mastery-circle"],
        coachingScript:
          "How many touches can you get without stopping?\nCan you do it faster? What about slower with more control?\nWatch me first, then try it yourself",
      },
      {
        name: "Shark Attack Game",
        type: "game",
        durationMinutes: 12,
        description:
          "Dribblers try to keep ball while 1-2 'sharks' try to kick balls out of the grid.",
        activitySuggestions: ["shark-attack"],
        coachingScript:
          "If you're a dribbler, where should your body be to protect the ball?\nSharks - how can you work together?\nWhat if I add more sharks?",
      },
      {
        name: "Passing Partners",
        type: "technical",
        durationMinutes: 8,
        description: "Simple passing with a partner, focus on technique.",
        activitySuggestions: ["passing-pairs"],
        coachingScript:
          "Where does your plant foot point?\nShow me your 'ping' - lock that ankle!\nCan you pass and receive with one touch?",
      },
      {
        name: "World Cup",
        type: "fun",
        durationMinutes: 12,
        description:
          "Everyone starts. Score = stay in. Miss = out and practice on side. Final 4 = World Cup Final!",
        activitySuggestions: ["world-cup"],
        coachingScript:
          "Pick a country to represent!\nCan you hit the target? Where do you aim?\nThose eliminated - see how many juggles you can get while waiting",
      },
      {
        name: "Team High Fives",
        type: "cooldown",
        durationMinutes: 4,
        description: "Gather team, celebrate wins, give high-fives.",
        coachingScript:
          "What did you learn today?\nWho did something great that we should celebrate?\nPractice 10 toe taps every day at home!",
      },
    ],
    description:
      "Focus on individual ball control through fun games. Perfect for beginning of season or younger players.",
    equipmentNeeded: ["1 ball per player", "20+ cones", "2 mini goals"],
    coachingNotes:
      "\n## Before Practice\n- Arrive 10 minutes early to set up\n- Have water available\n- Prepare all stations before players arrive\n\n## Key Principles for Fundamentals Stage\n1. Every player has a ball as much as possible\n2. Keep instructions short (30 seconds max)\n3. More playing time, less standing time\n4. Praise effort, not just results\n5. Use questions, not commands\n\n## Parent Communication\n- Let parents know practice is play-based\n- Encourage parents to stay and watch\n- Brief check-in at pickup: one positive thing about each player\n      ",
    isDefault: true,
  },
  {
    name: "First Passing Session",
    sport: "soccer",
    stage: "fundamentals",
    durationMinutes: 60,
    structure: [
      {
        name: "Copy Cat Dribbling",
        type: "warmup",
        durationMinutes: 7,
        description:
          "Coach leads, players copy. Include stops, turns, speed changes.",
        activitySuggestions: ["copy-cat-dribbling"],
      },
      {
        name: "Traffic Lights",
        type: "warmup",
        durationMinutes: 6,
        description:
          "Red = stop, Yellow = slow dribble, Green = fast dribble. Add moves on colors.",
        activitySuggestions: ["traffic-lights"],
      },
      {
        name: "Partner Passing Intro",
        type: "technical",
        durationMinutes: 10,
        description:
          "Partners 5 yards apart. Focus on: plant foot, locked ankle, follow through.",
        activitySuggestions: ["passing-pairs"],
        coachingScript:
          "Watch me first - plant foot points to partner\nLock your ankle like a hammer\nPush through the middle of the ball\nHow many passes can you make without it going past your partner?",
      },
      {
        name: "Passing Accuracy Challenge",
        type: "technical",
        durationMinutes: 10,
        description:
          "Pass through gates of different sizes. Narrow = 3 points, wide = 1 point.",
        activitySuggestions: ["passing-accuracy-challenge"],
      },
      {
        name: "3v1 Rondo Intro",
        type: "tactical",
        durationMinutes: 12,
        description:
          "Introduce the concept of keep-away. Rotate defender frequently.",
        activitySuggestions: ["3v1-rondo"],
        coachingScript:
          "Move after you pass - don't stand still!\nWhere should you be to help your teammate?\nCan you play with just 2 touches?",
      },
      {
        name: "3v3 to Small Goals",
        type: "game",
        durationMinutes: 12,
        description:
          "Small-sided game focusing on passing. Award bonus point for 3-pass goal.",
        activitySuggestions: ["4v4-to-small-goals"],
      },
      {
        name: "Stretch Circle",
        type: "cooldown",
        durationMinutes: 3,
        description:
          "Simple stretches in a circle. Each player picks a stretch.",
        activitySuggestions: ["passing-pairs"],
      },
    ],
    description:
      "Introduction to passing with partners. Emphasis on fun and success, not perfection.",
    equipmentNeeded: ["1 ball per player", "Cones", "4 mini goals"],
    coachingNotes:
      "\n## Focus for This Session\n- Plant foot technique\n- Locked ankle\n- Follow through to target\n\n## Common Mistakes to Watch For\n- Toe poking (not using inside of foot)\n- Plant foot too far from ball\n- Not following through\n\n## Differentiation\n- Struggling players: move closer together\n- Advanced players: add one-touch requirement\n      ",
    isDefault: false,
  },
  {
    name: "Technical Skills: Receiving",
    sport: "soccer",
    stage: "skill-building",
    durationMinutes: 75,
    structure: [
      {
        name: "Partner Mirror Warmup",
        type: "warmup",
        durationMinutes: 8,
        description:
          "Partners face each other, one leads moves, other mirrors.",
        activitySuggestions: ["partner-mirror-warmup"],
      },
      {
        name: "First Touch Box",
        type: "technical",
        durationMinutes: 15,
        description:
          "Control ball within a 3x3 yard box. First touch must stay in box.",
        activitySuggestions: ["first-touch-box"],
        coachingScript:
          "What part of your body receives the ball?\nHow do you prepare before the ball arrives?\nWhere should your first touch go?",
      },
      {
        name: "Receiving Under Pressure",
        type: "technical",
        durationMinutes: 12,
        description:
          "Add passive defender on receiver's back. Teach checking shoulder.",
        activitySuggestions: ["receiving-under-pressure"],
      },
      {
        name: "Turn and Face",
        type: "technical",
        durationMinutes: 12,
        description:
          "Receive with back to goal, turn using moves (Cruyff, drag back), attack.",
        activitySuggestions: ["turn-and-face"],
      },
      {
        name: "5v2 Rondo",
        type: "tactical",
        durationMinutes: 12,
        description: "Quality first touch is key. Move after passing.",
        activitySuggestions: ["5v2-rondo"],
      },
      {
        name: "4v4 to Goals",
        type: "game",
        durationMinutes: 12,
        description:
          "Small-sided game. Observe first touch quality in game situations.",
        activitySuggestions: ["4v4-to-small-goals"],
      },
      {
        name: "Stretching",
        type: "cooldown",
        durationMinutes: 4,
        description: "Partner stretching with discussion of session.",
        activitySuggestions: ["partner-stretching"],
      },
    ],
    description:
      "Master receiving the ball under pressure with good first touch.",
    equipmentNeeded: ["Balls", "Cones", "2 goals", "Pinnies"],
    coachingNotes:
      "\n## Key Teaching Points\n1. Check your shoulder BEFORE the ball arrives\n2. Open your body to see the field\n3. First touch should go where the space is\n4. Cushion the ball - don't let it bounce away\n\n## Progression\nWeek 1: Ground passes only\nWeek 2: Add air balls\nWeek 3: Add active defender\n      ",
    isDefault: true,
  },
  {
    name: "Attacking Combinations",
    sport: "soccer",
    stage: "skill-building",
    durationMinutes: 75,
    structure: [
      {
        name: "Dynamic Warmup with Ball",
        type: "warmup",
        durationMinutes: 8,
        description: "Jog with ball, dynamic stretches, dribbling patterns.",
        activitySuggestions: ["dynamic-stretching-lines"],
      },
      {
        name: "Wall Pass Practice",
        type: "technical",
        durationMinutes: 12,
        description: "Partner passing: pass, run, receive. Focus on timing.",
        activitySuggestions: ["wall-pass-combinations"],
        coachingScript:
          "When should you start your run?\nWhere does the return pass go?\nHow do you time your movement?",
      },
      {
        name: "Combination Play Circuit",
        type: "technical",
        durationMinutes: 15,
        description:
          "Three stations: give-and-go, overlap, third-man combination.",
        activitySuggestions: ["combination-play-circuit"],
      },
      {
        name: "2v1 Attacking",
        type: "tactical",
        durationMinutes: 12,
        description: "Use combination to beat single defender.",
        activitySuggestions: ["4v4-to-small-goals"],
      },
      {
        name: "5v4 to Goal",
        type: "game",
        durationMinutes: 15,
        description: "Attacking team uses combinations to break through.",
        activitySuggestions: ["4v4-to-small-goals"],
      },
      {
        name: "Passing Pairs Cooldown",
        type: "cooldown",
        durationMinutes: 5,
        description: "Light passing while heart rate drops.",
        activitySuggestions: ["passing-pairs"],
      },
    ],
    description: "Learn give-and-go, overlap, and third-man runs.",
    equipmentNeeded: ["Balls", "Cones", "1 full goal", "Pinnies"],
    coachingNotes:
      "\n## Combinations to Teach\n1. Give-and-go (wall pass)\n2. Overlap run\n3. Third-man run\n\n## Coaching Emphasis\n- Weight of pass (not too hard!)\n- Timing of runs\n- Communication\n- Quick decision making\n      ",
    isDefault: false,
  },
  {
    name: "Defending Principles",
    sport: "soccer",
    stage: "skill-building",
    durationMinutes: 75,
    structure: [
      {
        name: "Defensive Warmup",
        type: "warmup",
        durationMinutes: 8,
        description: "Jockeying practice, defensive stance, footwork.",
        activitySuggestions: ["dynamic-stretching-lines"],
      },
      {
        name: "1v1 Defending",
        type: "technical",
        durationMinutes: 12,
        description:
          "Learn to delay, show attacker one direction, stay goal-side.",
        activitySuggestions: ["1v1-to-goal"],
        coachingScript:
          "Can you poke the ball away? Or should you delay?\nWhich direction are you showing the attacker?\nWhat's your body position?",
      },
      {
        name: "Defending in Pairs",
        type: "tactical",
        durationMinutes: 15,
        description: "First defender (pressure), second defender (cover).",
        activitySuggestions: ["defending-in-pairs"],
      },
      {
        name: "Transition Game",
        type: "tactical",
        durationMinutes: 15,
        description: "Immediate defensive reaction when you lose the ball.",
        activitySuggestions: ["transition-game"],
      },
      {
        name: "5v5 Scrimmage",
        type: "game",
        durationMinutes: 15,
        description:
          "Apply defensive principles. Award points for good defensive plays.",
        activitySuggestions: ["4v4-to-small-goals"],
      },
      {
        name: "Stretching Circle",
        type: "cooldown",
        durationMinutes: 5,
        description: "Discuss what worked well defensively today.",
        activitySuggestions: ["partner-stretching"],
      },
    ],
    description: "Learn to defend as individuals and pairs.",
    equipmentNeeded: ["Balls", "Cones", "Goals", "Pinnies"],
    coachingNotes:
      "\n## Defensive Principles\n1. First defender: pressure, delay, show one way\n2. Second defender: cover, communicate, depth\n3. Team: compact, organized, goal-side\n\n## Key Questions\n- Who is the first defender?\n- Where is your cover?\n- Are we compact?\n      ",
    isDefault: false,
  },
  {
    name: "Playing Out from the Back",
    sport: "soccer",
    stage: "development",
    durationMinutes: 90,
    structure: [
      {
        name: "Positional Warmup",
        type: "warmup",
        durationMinutes: 10,
        description: "Players in positions, light passing patterns.",
        activitySuggestions: ["passing-pairs"],
      },
      {
        name: "Positional Rondo",
        type: "tactical",
        durationMinutes: 18,
        description:
          "4-3-3 shape vs 3-4 defenders. Build from back, complete passes to 'score'.",
        activitySuggestions: ["positional-rondo"],
        coachingScript:
          "Where is the space?\nWhen should we switch play?\nHow do we attract pressure then release it?",
      },
      {
        name: "GK Distribution Patterns",
        type: "technical",
        durationMinutes: 15,
        description:
          "Goalkeeper to center backs, full backs, midfielders. Various scenarios.",
        activitySuggestions: ["long-passing-grid"],
      },
      {
        name: "Build-Up vs Press",
        type: "tactical",
        durationMinutes: 20,
        description: "7v7 half-field. Team A builds out, Team B presses.",
        activitySuggestions: ["pressing-game-fitness"],
      },
      {
        name: "Full Scrimmage",
        type: "game",
        durationMinutes: 20,
        description:
          "Apply build-up principles. Restart with GK when ball goes out.",
        activitySuggestions: ["4v4-to-small-goals"],
      },
      {
        name: "Cool Down",
        type: "cooldown",
        durationMinutes: 7,
        description: "Light jog, stretching, video review of key moments.",
        activitySuggestions: ["partner-stretching"],
      },
    ],
    description: "Build-up play from goalkeeper through midfield.",
    equipmentNeeded: ["Balls", "Full field", "Goals", "Pinnies"],
    coachingNotes:
      "\n## Build-Up Principles\n1. Create numerical advantage (overloads)\n2. Play through lines when possible\n3. Switch play to relieve pressure\n4. Goalkeeper as extra outfield player\n\n## Formations to Cover\n- 4-3-3 vs high press\n- 3-2-5 build-up shape\n- GK involvement\n      ",
    isDefault: true,
  },
  {
    name: "Finishing Session",
    sport: "soccer",
    stage: "development",
    durationMinutes: 90,
    structure: [
      {
        name: "Dynamic Warmup",
        type: "warmup",
        durationMinutes: 8,
        description: "Jog, dynamic stretches, light shooting to warm up legs.",
        activitySuggestions: ["dynamic-stretching-lines"],
      },
      {
        name: "Shooting Technique Stations",
        type: "technical",
        durationMinutes: 20,
        description: "Four stations: power shots, finesse, one-touch, volleys.",
        activitySuggestions: ["shooting-technique-stations"],
      },
      {
        name: "Crossing and Finishing",
        type: "technical",
        durationMinutes: 18,
        description: "Cross from wing, attack the cross, finish.",
        activitySuggestions: ["crossing-and-finishing"],
      },
      {
        name: "Counter Attack Game",
        type: "game",
        durationMinutes: 18,
        description: "Quick transitions, limited time to score.",
        activitySuggestions: ["counter-attack-game"],
      },
      {
        name: "Full Scrimmage",
        type: "game",
        durationMinutes: 18,
        description:
          "Apply finishing in game. Track shots, goals, shot quality.",
        activitySuggestions: ["4v4-to-small-goals"],
      },
      {
        name: "Cool Down",
        type: "cooldown",
        durationMinutes: 8,
        description: "Light jog, stretching.",
        activitySuggestions: ["partner-stretching"],
      },
    ],
    description: "Various shooting and finishing techniques.",
    equipmentNeeded: ["Many balls", "Full goals", "Cones", "Pinnies"],
    coachingNotes:
      "\n## Finishing Principles\n1. Placement over power (usually)\n2. Hit the target - make GK save it\n3. Early shot when space allows\n4. Composure in the box\n\n## Track These Metrics\n- Shots on target %\n- First-touch finishes\n- Goals from crosses\n      ",
    isDefault: false,
  },
];

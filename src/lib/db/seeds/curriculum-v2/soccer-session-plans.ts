/**
 * Soccer Session Plans - Fundamentals Stage (Ages 6-8)
 *
 * Complete, print-ready session plans for volunteer parent coaches.
 * Each plan includes:
 * - Detailed structure with segments
 * - Minute-by-minute coaching scripts
 * - Equipment checklists
 * - Troubleshooting guides
 * - Parent communication templates
 */

import { getDb } from "../../index";
import { practiceTemplates } from "../../schema/practice-planning";
import { sports } from "../../schema/sports";
import { developmentStages } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

// Extended structure type with coaching script
interface SessionSegment {
  name: string;
  type: "warmup" | "technical" | "tactical" | "game" | "scrimmage" | "conditioning" | "cooldown" | "fun";
  durationMinutes: number;
  description?: string;
  activitySuggestions?: string[];
  coachingScript?: string;
}

export async function seedSoccerSessionPlans() {
  console.log("Seeding Soccer Session Plans (Fundamentals - Ages 6-8)...");

  const [soccer] = await getDb().select().from(sports).where(eq(sports.slug, "soccer"));
  if (!soccer) throw new Error("Soccer sport must be seeded first");

  const stages = await getDb().select().from(developmentStages);
  const fundamentals = stages.find((s) => s.slug === "fundamentals");

  if (!fundamentals) throw new Error("Development stages must be seeded first");

  const sessionPlans = [
    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION PLAN 1: FIRST DAY OF SEASON
    // ═══════════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      stageId: fundamentals.id,
      name: "First Day of Season - Getting Started Right",
      description:
        "A 45-minute session designed for the very first practice of the season. Focus on fun, meeting teammates, learning names, and establishing a positive tone. Zero pressure, maximum smiles.",
      totalDurationMinutes: 45,
      structure: [
        {
          name: "Welcome & Name Game",
          type: "warmup",
          durationMinutes: 8,
          description: "Gather the team, introduce yourself, learn names through a fun ball activity",
          activitySuggestions: ["Name Ball Toss", "Circle Introduction"],
          coachingScript: `ARRIVAL (as players arrive):
- Stand at the field entrance with a smile
- Greet each child AND parent by name if possible
- "Hi! I'm Coach [Name]. What's your name? Awesome, grab a ball from the bag and start kicking around!"

GATHER THE TEAM (0:00):
- Whistle or clap pattern to gather: "Everyone bring your ball and make a circle around me!"
- Wait for silence, make eye contact with each child
- "Welcome to our soccer team! I'm SO excited to be your coach this season."
- "Before we play, I want to learn everyone's name. When I roll the ball to you, say your name loud so we can all hear!"

NAME BALL ACTIVITY (3 minutes):
- Roll ball to each player, they say name, roll back
- After going around once: "Now let's try this - say YOUR name, then roll to someone else and say THEIR name!"
- Celebrate when kids remember names: "You remembered! High five!"

TEAM CHANT SETUP (2 minutes):
- "Every great team needs a team name. What should we be called?" (Let them vote)
- "And we need a chant! On three, everyone yell our team name: 1, 2, 3, [TEAM NAME]!"
- Practice 2-3 times with increasing energy`,
        },
        {
          name: "Follow the Leader Warmup",
          type: "warmup",
          durationMinutes: 7,
          description: "Get bodies moving with a fun follow-the-leader game that requires a ball",
          activitySuggestions: ["Follow the Leader", "Simon Says with Balls"],
          coachingScript: `TRANSITION (0:08):
- "Okay team, now we're going to warm up our bodies! Everyone get your ball."
- "We're playing Follow the Leader. I'm the leader first - copy EVERYTHING I do!"

FOLLOW THE LEADER (5 minutes):
Round 1 - Coach leads (2 min):
- Walk with ball, stop and go
- Hop over ball
- Run around ball in circles
- Sit on ball, stand up
- Roll ball with foot slowly
- "You're all GREAT followers!"

Round 2 - Pick player leaders (3 min):
- "Who wants to be the leader? Marcus, you're up! Everyone follow Marcus!"
- Let 3-4 kids be leader for 30-45 seconds each
- Celebrate creative moves: "Ooh, I love that one!"

SAFETY CHAT (2 minutes):
- Gather in close: "Quick team huddle!"
- "Two important rules for our team: 1) Have FUN! 2) Be SAFE - no pushing, no hands on other players. Can everyone say 'FUN AND SAFE'?"
- Get them to repeat it back`,
        },
        {
          name: "Traffic Lights Introduction",
          type: "technical",
          durationMinutes: 10,
          description: "Introduce basic ball control through the Traffic Lights game - simple commands, lots of success",
          activitySuggestions: ["Traffic Lights", "Red Light Green Light with Balls"],
          coachingScript: `TRANSITION (0:15):
- "Spread out so you can't touch anyone - find your own space!"
- Wait until everyone is spread: "Perfect! Now, who knows what a traffic light does?"

EXPLAIN THE GAME:
- "GREEN means GO - dribble your ball fast!"
- "YELLOW means SLOW - dribble like a turtle!"
- "RED means STOP - freeze like a statue with your foot on the ball!"
- "Let's practice. Everyone freeze. Ready... GREEN!"

PLAY TRAFFIC LIGHTS (7 minutes):
Round 1 (2 min): Basic colors, slow calls
- "GREEN!" (let them go 5-7 seconds)
- "YELLOW!" (praise slow dribblers)
- "RED!" (check - is foot on ball?)
- Praise every correct stop: "Great freeze Marcus! Lily, love that slow turtle dribble!"

Round 2 (2 min): Faster calls
- Speed up the color changes
- Add countdown: "RED in 3... 2... 1... RED!"

Round 3 (3 min): Fun variations
- Whisper the colors
- "Red... red... red... GREEEEN!"
- Let a player be the traffic light

TEACHING MOMENT:
- "Freeze on red! Show me your foot on the ball. What part of your foot is touching?"
- "That's called your SOLE - the bottom of your foot. Like squashing a bug!"`,
        },
        {
          name: "Partner Ball Fun",
          type: "technical",
          durationMinutes: 8,
          description: "Simple partner activities to start building passing basics and teamwork",
          activitySuggestions: ["Partner Passing", "Ball Swap Game"],
          coachingScript: `TRANSITION (0:25):
- "Find a partner! Someone you haven't played with yet. Give them a high five!"
- "One ball per pair - put the extra one on the side."

PARTNER ACTIVITY 1 - PASSING BACK AND FORTH (3 min):
- "Stand 5 giant steps apart from your partner."
- "Pass the ball using the INSIDE of your foot - like this" (demo)
- "See how many passes you can do without the ball getting away. Count together!"
- Walk around, encourage: "Great pass! 6, 7, 8 - nice counting!"
- Challenge: "Can any pair get to 10 without missing?"

PARTNER ACTIVITY 2 - BALL SWAP GAME (3 min):
- "Now both partners have a ball. Stand apart."
- "On GO, dribble toward each other, high five in the middle, then keep going to where your partner started!"
- "Ready... GO!"
- Do 3-4 rounds
- Add variation: "This time, when you meet in the middle, swap balls without stopping!"

PARTNER ACTIVITY 3 - SHADOW DRIBBLING (2 min):
- "One partner is the leader, one is the shadow. Shadow copies everything!"
- "Leaders, keep your ball close so your shadow can follow."
- "Switch after 1 minute!"`,
        },
        {
          name: "Fun Scrimmage Game",
          type: "game",
          durationMinutes: 10,
          description: "Simple small-sided game with cones for goals - first taste of 'real' soccer",
          activitySuggestions: ["3v3 to Cone Goals", "End Zone Game"],
          coachingScript: `TRANSITION (0:33):
- "Now for the best part - a real game!"
- Split into two teams quickly (count off 1-2 or use pinnies by color)
- "Greens on this side, Reds on this side!"

SET UP (1 minute):
- Two cone goals about 4 steps wide
- Small field (20x15 paces max)
- "Score by kicking the ball through those cones!"

PLAY THE GAME (8 minutes):
First half (4 min):
- "GO!" - Let them play
- Don't over-coach! Only intervene for:
  - Safety issues
  - Ball going way out
  - Major confusion
- Celebrate EVERY goal from both teams: "GOOOAL! Nice shot!"
- NO keeping score officially (they will anyway, that's fine)

Half time (30 sec):
- "Switch sides! Now go the other way!"
- Quick water sips if nearby

Second half (4 min):
- Keep energy high: "I love how hard everyone is trying!"
- Make sure everyone touches the ball - if someone hasn't: "Maya, here it comes!" and roll it to them

COACHING TIPS:
- If one team is dominating, quietly add yourself to the other team
- If ball hogs: "Count your passes - 3 passes, then you can shoot!"
- If no one can score: Make goals wider
- If goals are too easy: Make goals smaller`,
        },
        {
          name: "Celebration & Goodbye",
          type: "cooldown",
          durationMinutes: 2,
          description: "Bring it in, celebrate the first practice, set expectations for next time",
          activitySuggestions: ["Team Chant", "High Five Tunnel"],
          coachingScript: `GATHER THE TEAM (0:43):
- "Everyone bring it in! Hands in the middle!"
- Wait for everyone to arrive and settle

CELEBRATION:
- "That was an AMAZING first practice!"
- "I learned all your names" (prove it - go around quickly saying names)
- "You learned how to stop the ball, pass to a partner, and play a game!"
- "I'm so excited for this season. We're going to have SO much fun."

LOOKING AHEAD:
- "Next practice we'll learn some cool dribbling moves."
- "Make sure to practice at home - kick the ball around in your backyard!"

TEAM CHANT:
- "Okay, team name on three! 1... 2... 3... [TEAM NAME]!"
- "High fives on the way out - come get one from me!"

PARENT COMMUNICATION:
- Be available for parents for a few minutes
- "Great first day! Your child did great with [specific thing]."
- Remind: "Next practice is [day/time]. Water bottle and shin guards, please!"`,
        },
      ] as SessionSegment[],
      equipmentNeeded: [
        "1 ball per player (plus extras)",
        "8-12 cones",
        "Pinnies (2 colors, enough for half the team each)",
        "Whistle (optional)",
        "First aid kit",
        "Water available",
      ],
      coachingNotes: `# First Day of Season - Complete Coach's Guide

## Before You Arrive (15 minutes early)

### Equipment Checklist
- [ ] Bag of balls (1 per player + 3 extras)
- [ ] Cones (8-12)
- [ ] Pinnies (2 colors)
- [ ] First aid kit
- [ ] Roster with player names
- [ ] Emergency contact information
- [ ] Whistle (optional)
- [ ] This session plan (printed!)

### Field Setup
1. Mark out a small playing area (30x20 paces)
2. Set up two cone goals (4 paces wide each)
3. Place ball bag where it's accessible
4. Identify where parents will wait (not too close!)

### Mental Preparation
- Review player names one more time
- Take a deep breath - these kids just want to have fun!
- Your energy sets the tone - be enthusiastic!

---

## Minute-by-Minute Breakdown

### 0:00-0:08 | Welcome & Name Game (8 min)
**Your Goal:** Learn every name, establish yourself as friendly and fun

**Exactly What to Say:**
- As kids arrive: "Hi! I'm Coach [Name]. What's your name? [Repeat it] Great to meet you [Name]! Grab a ball and start kicking around!"
- Gathering: "Everyone bring your ball and make a circle! When I roll the ball to you, say your name so loud I can hear it!"
- After names: "Now let's pick a team name! What should we be called?"

**Watch For:**
- Shy kids hanging back (go to them individually)
- Kids who can't remember names (that's okay! Make it fun)
- Over-excited kids (channel energy: "Save that energy for the games!")

### 0:08-0:15 | Follow the Leader (7 min)
**Your Goal:** Get bodies moving, start building team spirit

**Exactly What to Say:**
- "We're playing Follow the Leader! Copy everything I do with your ball!"
- After your turn: "Who wants to be leader? [Pick someone] Everyone follow [Name]!"

**Watch For:**
- Kids who do creative moves (celebrate them!)
- Kids struggling to follow (simplify your movements)

### 0:15-0:25 | Traffic Lights (10 min)
**Your Goal:** First real skill - stopping the ball

**Exactly What to Say:**
- "GREEN means go fast! YELLOW means slow like a turtle! RED means freeze with foot on ball!"
- Teaching point: "What part of your foot is on the ball? That's your SOLE!"

**Watch For:**
- Ball rolling away on RED (say: "Foot on TOP of ball, like squashing a bug!")
- Kids not changing speeds (say: "Show me the difference! Cheetah... turtle...")

### 0:25-0:33 | Partner Ball Fun (8 min)
**Your Goal:** First partner work, basic passing

**Exactly What to Say:**
- "Find a partner you haven't played with! One ball per pair."
- "Inside of foot, nice and easy. Count your passes!"

**Watch For:**
- Pairs not counting (encourage: "I heard 5! Can you get to 10?")
- Kids kicking too hard (say: "Soft pass so your partner can get it!")

### 0:33-0:43 | Fun Scrimmage (10 min)
**Your Goal:** Let them play! Minimal coaching.

**Exactly What to Say:**
- "Score by kicking through the cone goal! GO!"
- Only: "Great shot!" "Nice try!" "GOOOAL!"

**Watch For:**
- Ball hogs (say: "3 passes before you shoot!")
- Kids not involved (roll ball to them: "Here [Name], it's yours!")
- One team dominating (quietly join losing team)

### 0:43-0:45 | Celebration (2 min)
**Your Goal:** End on high note, connect with parents

**Exactly What to Say:**
- "Hands in middle! That was AMAZING! On three... 1, 2, 3, [TEAM NAME]!"
- "High fives on the way out!"

---

## Troubleshooting Guide

### "A child won't leave their parent"
1. Don't force it - let them watch from parent's side
2. Invite them: "[Name], want to help me roll balls?"
3. Often they join after seeing others have fun
4. Tell parent: "Totally normal! They'll join when ready."

### "Two kids won't stop fighting/arguing"
1. Separate immediately: "Marcus, you're on greens. Tyler, you're on reds."
2. Redirect energy: "Who can show me the fastest dribble?"
3. If continues: "We have two rules: Fun and Safe. Fighting isn't safe."
4. Talk to parents after if needed

### "A child is crying"
1. Quick safety check: "Are you hurt?"
2. If yes: First aid, parent involvement
3. If no: "It's okay to feel upset. Want to take a break?"
4. Give them a job: "Can you help me count cones?"
5. They usually rejoin on their own

### "A child is way more skilled than others"
1. Give them extra challenges: "Can you do it with your other foot?"
2. Make them a helper: "Can you show Marcus that move?"
3. They'll still have fun - don't hold them back too much

### "A child is struggling with everything"
1. Private encouragement: "You're doing great, keep trying!"
2. Pair them with patient partner
3. Simplify tasks: "Just touch the ball with your foot - nice!"
4. Celebrate EFFORT: "I love how hard you're trying!"

### "It's raining/cold/hot"
- Light rain: Keep going (kids love it!) but watch for slipping
- Heavy rain/lightning: Cancel or move to covered area
- Cold: Shorter water breaks, more movement
- Hot: More water breaks, shade when available, watch for flushed faces

### "I'm running out of time"
- Cut the scrimmage short (5 min instead of 10)
- Never cut the celebration - that's how they remember practice
- Note what to cut next time

### "We have too much time"
- Extend the scrimmage
- Play another round of Traffic Lights
- Free play at the end

---

## Skill Teaching Points

### Stopping the Ball (Traffic Lights)
**Correct:** Sole (bottom) of foot on top of ball, knee slightly bent
**Incorrect:** Toe poke stop, ball rolling away
**Key Phrase:** "Squash the ball like a bug!"

### Passing (Partner Work)
**Correct:** Inside of foot, plant foot next to ball, follow through
**Incorrect:** Toe poke, no follow through
**Key Phrase:** "Use your inside, nice and easy to your partner!"

---

## Post-Session Reflection

After practice, take 5 minutes to answer:

1. Did every child smile at some point? Who might need extra attention?
2. Did I learn and use every child's name?
3. What worked really well that I should do again?
4. What was confusing or didn't work?
5. Is there a parent who could help next time?

---

## Parent Communication

### If a parent asks "How did my child do?"
"[Name] did great! I loved seeing them [specific moment - trying hard, making a friend, scoring a goal, learning to stop the ball]. Looking forward to next practice!"

### Email/Text to send after practice
"Hi Team Families! Great first practice today! The kids learned a new game called Traffic Lights (ask them to teach you - green means go, yellow means slow, red means STOP!). Next practice is [date/time]. Please bring: water bottle, shin guards, comfortable clothes. Let me know if you have any questions! - Coach [Name]"

### For the Team Newsletter/Group
"Week 1 Highlights: We became a team today! The kids chose our team name ([name]), learned each other's names, and played their first game together. Ask your child: What color means STOP in Traffic Lights? (Answer: Red - with foot on TOP of the ball!) See everyone at practice!"
`,
      isDefault: false,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION PLAN 2: BALL MASTERY SESSION
    // ═══════════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      stageId: fundamentals.id,
      name: "Ball Mastery Session - Individual Ball Control",
      description:
        "A 60-minute session focused on developing individual ball control through fun, engaging activities. Players work on toe taps, sole rolls, and basic touches in game-like environments. High repetition, maximum touches on the ball.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Free Play Arrival",
          type: "warmup",
          durationMinutes: 5,
          description: "As players arrive, they grab a ball and play freely within the marked area",
          activitySuggestions: ["Free dribbling", "Juggling attempts", "Shooting at cones"],
          coachingScript: `SETUP (arrive 10 min early):
- Mark a large playing area with cones (30x30 paces)
- Place balls in a visible spot
- Set up some cone targets for shooting

AS PLAYERS ARRIVE:
- Greet each player: "Hey [Name]! Grab a ball and start dribbling around. See if you can knock over a cone!"
- Let them explore - no instructions needed
- This gives late arrivals time without holding up practice

OBSERVATION:
- Watch how players interact with the ball
- Notice who is comfortable, who is hesitant
- Mental notes for pairing/grouping later`,
        },
        {
          name: "Dynamic Warmup - Ball Mastery Circle",
          type: "warmup",
          durationMinutes: 8,
          description: "Guided ball touches in a circle formation - toe taps, sole rolls, foundations",
          activitySuggestions: ["Ball Mastery Circle", "Toe Taps", "Sole Rolls"],
          coachingScript: `GATHER THE TEAM (0:05):
- Clap pattern or whistle
- "Everyone make a big circle! Ball under your foot."
- Wait for circle to form, make eye contact around

EXPLAIN:
- "We're going to learn some ball MASTERY moves today. Mastery means you're the BOSS of the ball."
- "Copy me - keep your ball under your foot the whole time!"

TOE TAPS (2 minutes):
- Demo: alternating feet tapping top of ball
- "Tap, tap, tap, tap - like a drum beat!"
- Count together: "1, 2, 3, 4... faster! ...5, 6, 7, 8!"
- Challenge: "Can you go for 20 without the ball rolling away?"
- Praise: "Great rhythm [Name]! [Name], keep your eyes up!"

SOLE ROLLS (2 minutes):
- Demo: roll ball side to side using sole of foot
- "Roll it across, pull it back. Like a windshield wiper!"
- "Left foot only... now right foot only... now switch every time!"
- Challenge: "Can you do it without looking at the ball?"

TICK TOCKS (2 minutes):
- Demo: ball taps between inside of feet
- "Inside, inside, inside - like a clock tick-tock!"
- Speed variations: "Slow tick-tock... now FAST tick-tock!"
- Challenge: "Move forward while tick-tocking!"

BONUS - PUT IT TOGETHER (2 minutes):
- "4 toe taps... 4 sole rolls... 4 tick-tocks... GO!"
- Coach counts: "Tap tap tap tap, roll roll roll roll, tick tock tick tock!"
- Do 2-3 rounds`,
        },
        {
          name: "Ball Mastery Stations",
          type: "technical",
          durationMinutes: 12,
          description: "Rotating stations for focused ball mastery practice",
          activitySuggestions: ["Toe Tap Station", "Sole Roll Station", "Tick Tock Station", "Pull Back Station"],
          coachingScript: `SETUP (prep during previous activity or before practice):
Create 4 stations with cone markers:

STATION 1 - TOE TAP CHALLENGE
- One cone
- Challenge: How many toe taps in 20 seconds?

STATION 2 - SOLE ROLL MAZE
- 4 cones in a line (2 feet apart)
- Sole roll through the cones without touching them

STATION 3 - TICK TOCK BOX
- 4 cones in a 3-foot square
- Tick tock while moving around the box

STATION 4 - PULL BACK ALLEY
- 2 cones marking a straight line
- Dribble forward, pull back with sole, dribble forward

EXPLAIN THE ROTATION (0:13):
- "We have 4 stations! You'll get 3 minutes at each station."
- Walk them through each station quickly (30 seconds each)
- "When I yell SWITCH, move to the next station clockwise!"
- Divide into 4 groups: "1s go here, 2s go here..."

RUN THE STATIONS:
- Timer on phone: 3 minutes per station
- Walk around encouraging and giving tips
- Specific feedback: "Nice rhythm!" "Keep the ball closer!" "Great control!"

STATION COACHING TIPS:
- Station 1: "Can you beat your last score?"
- Station 2: "Soft touches, no rushing!"
- Station 3: "Stay inside the box!"
- Station 4: "Sole pull back, inside of foot forward!"

TRANSITIONS:
- "3... 2... 1... SWITCH!"
- Quick transitions (30 seconds max)
- "Find your new station, start right away!"`,
        },
        {
          name: "Traffic Lights Plus",
          type: "technical",
          durationMinutes: 8,
          description: "Traffic Lights with added ball mastery challenges on each stop",
          activitySuggestions: ["Traffic Lights with Challenges", "Traffic Lights Plus"],
          coachingScript: `TRANSITION (0:25):
- "Stations are done! Everyone spread out in the big area."
- "We're playing Traffic Lights, but today we're adding challenges!"

EXPLAIN:
- "GREEN = dribble fast, YELLOW = dribble slow, RED = STOP"
- "But THIS time, when I call RED, I'll also call a ball mastery move!"
- "RED + TOE TAPS means stop and do toe taps until I say GREEN!"

ROUND 1 - BASIC (3 minutes):
- "GREEN!" (5-7 seconds)
- "RED + TOE TAPS!" (count to 10 out loud with them)
- "GREEN!"
- "YELLOW!" (3-4 seconds)
- "RED + SOLE ROLLS!" (count to 8)
- Continue pattern

ROUND 2 - FASTER + MORE MOVES (3 minutes):
- Faster transitions
- Add "RED + TICK TOCKS!"
- Add "RED + PULL BACKS!"
- Mix in yellows between

ROUND 3 - PLAYER CHOICE (2 minutes):
- "RED + YOUR CHOICE!" - they pick their move
- "I want to see your BEST move when I call red!"
- Celebrate creativity: "Ooh, what's that move called [Name]?"

WRAP UP:
- "Freeze! Show me the move you're best at now. Hold it... NICE!"`,
        },
        {
          name: "Cone Knockout Game",
          type: "game",
          durationMinutes: 10,
          description: "Dribbling game where players try to knock over cones while protecting their own",
          activitySuggestions: ["Cone Knockout", "Dribble & Destroy"],
          coachingScript: `SETUP (0:33):
- Place 15-20 cones standing up randomly throughout the playing area
- "Everyone has a ball. Your job: knock over cones by DRIBBLING your ball into them!"
- "BUT - you must stay on your feet. No hands, no kicking the ball from far away!"

EXPLAIN RULES:
1. Must dribble to the cone and tap it over
2. Must use your ball (not your body)
3. Can't kick ball from far away - must be close control
4. When a cone is down, leave it down

ROUND 1 - EVERYONE KNOCKS DOWN (3 minutes):
- "Ready... GO!"
- Walk around encouraging: "Nice dribble to that one!" "Close control!"
- "Last 5 cones! Who can get them?"
- Count down together when almost done

RESET & INTRODUCE DEFENDERS:
- "Everyone help me set the cones back up - quick quick quick!"
- Pick 2-3 players: "[Names], you're CONE DEFENDERS. Your job: protect the cones!"
- "Defenders can block with your body but can't push anyone."

ROUND 2 - WITH DEFENDERS (4 minutes):
- Much harder now! Dribblers have to be clever
- "Defenders, which cones will you protect?"
- "Dribblers, can you trick the defenders?"
- Celebrate clever plays: "Great fake!" "Nice protection!"

ROUND 3 - SWITCH ROLES (3 minutes):
- New defenders
- "Last round! Can the dribblers get all the cones this time?"

COACHING POINTS:
- "Close control to sneak past defenders!"
- "Look for unguarded cones!"
- "Defenders - move your feet, don't reach!"`,
        },
        {
          name: "Small-Sided Scrimmage",
          type: "game",
          durationMinutes: 12,
          description: "3v3 or 4v4 scrimmage applying ball mastery skills in game context",
          activitySuggestions: ["3v3 to Small Goals", "4v4 End Zone"],
          coachingScript: `TRANSITION (0:43):
- "Game time! Let's play a real game using our ball mastery skills!"
- Quickly divide into teams (count off or by pinnie color)

SETUP:
- Small field (25x20 paces)
- Small goals (cones, 4 paces wide)
- 3v3 or 4v4 depending on numbers

SPECIAL RULE:
- "Before you can shoot, your team must do a BALL MASTERY MOVE!"
- "Toe taps, sole rolls, tick tocks - something we practiced!"
- "I'll watch for it. If you shoot without a move, no goal!"

PLAY THE GAME:

First half (5 minutes):
- "GO!"
- Let them play - minimal coaching
- Only intervene for safety or rule confusion
- Watch for ball mastery moves: "I saw that sole roll! Now you can shoot!"
- Celebrate goals and attempts

Quick break (1 minute):
- "Water sips! What ball mastery moves have you tried?"
- "Second half, try a move you haven't done yet!"

Second half (5 minutes):
- Remove the special rule halfway through if they're doing well naturally
- "Free play now - just have fun!"
- Keep energy up: "Great game! Nice shot!"

COACHING PHRASES:
- "Can you use a move to get past them?"
- "I loved that tick-tock [Name]!"
- "Soft touch to control, then pass!"
- "Keep the ball close!"`,
        },
        {
          name: "Cool Down & Ball Mastery Challenge",
          type: "cooldown",
          durationMinutes: 5,
          description: "Light activity, personal challenge setting, and celebration",
          activitySuggestions: ["Juggling Attempts", "Personal Best Challenge"],
          coachingScript: `GATHER (0:55):
- "Bring it in! Make our circle again."
- Wait for everyone, catch breath

JUGGLING CHALLENGE (3 minutes):
- "Let's try something tricky - juggling!"
- Demo: drop ball, let it bounce, kick it up, catch it
- "How many times can you kick it before it hits the ground?"
- Let them try for 2 minutes
- Celebrate ANY success: "One! That counts!" "TWO! Amazing!"
- "Your homework: practice juggling at home!"

REFLECTION (1 minute):
- "What was your favorite move we learned today?"
- Let 3-4 kids share
- "You're all becoming ball masters! I could see your control getting better."

CHALLENGE FOR THE WEEK:
- "This week, practice toe taps at home. See if you can do 30 without stopping!"
- "Show your parents! Teach them the moves!"

TEAM CHEER (1 minute):
- "Hands in. 1, 2, 3, [TEAM NAME]!"
- "High fives! Great practice everyone!"

PARENT NOTES:
- "We worked on ball mastery today - toe taps, sole rolls, tick tocks."
- "Ask your child to teach you a move!"`,
        },
      ] as SessionSegment[],
      equipmentNeeded: [
        "1 ball per player (plus extras)",
        "20-25 cones",
        "Pinnies (2 colors)",
        "Timer/phone",
        "First aid kit",
      ],
      coachingNotes: `# Ball Mastery Session - Complete Coach's Guide

## Before You Arrive (15 minutes early)

### Equipment Checklist
- [ ] Balls - 1 per player + 3 extras
- [ ] Cones - 20-25 (various colors if available)
- [ ] Pinnies - 2 colors
- [ ] Phone/timer for station rotations
- [ ] First aid kit
- [ ] This session plan (printed!)
- [ ] Water available

### Field Setup Diagram
\`\`\`
┌──────────────────────────────────────────────┐
│                                              │
│   [Station 1]          [Station 2]           │
│   Toe Taps             Sole Roll Maze        │
│      ▲                  ▲   ▲   ▲   ▲        │
│                                              │
│                                              │
│              FREE PLAY AREA                  │
│           (30x30 pace square)                │
│                                              │
│                                              │
│   [Station 3]          [Station 4]           │
│   Tick Tock Box        Pull Back Alley       │
│    ▲ ▲                   ▲──────▲            │
│    ▲ ▲                                       │
│                                              │
│     [Scrimmage Area - 25x20]                 │
│        ▲ ▲           ▲ ▲                     │
│       (goal)        (goal)                   │
│                                              │
└──────────────────────────────────────────────┘
\`\`\`

### Station Setup Details
**Station 1 - Toe Tap Challenge:** Single cone for reference
**Station 2 - Sole Roll Maze:** 4 cones in a line, 2 feet apart
**Station 3 - Tick Tock Box:** 4 cones making a 3-foot square
**Station 4 - Pull Back Alley:** 2 cones 10 feet apart in a line

---

## Minute-by-Minute Breakdown

### 0:00-0:05 | Free Play Arrival (5 min)
**Your Goal:** Let players warm up naturally while you greet everyone

**Exactly What to Say:**
- "Grab a ball and start dribbling around! See if you can knock over a cone!"

**What to Watch:** Who is comfortable with the ball? Who needs encouragement?

### 0:05-0:13 | Ball Mastery Circle (8 min)
**Your Goal:** Teach three fundamental ball mastery moves

**Move 1: Toe Taps (2 min)**
- Demo: Alternate tapping top of ball with each foot
- SAY: "Tap, tap, tap, tap - like a drum beat!"
- Count: "1, 2, 3, 4... faster! ...5, 6, 7, 8!"
- Challenge: "20 without the ball rolling away!"

**Move 2: Sole Rolls (2 min)**
- Demo: Roll ball side to side with bottom of foot
- SAY: "Roll it across, pull it back. Like a windshield wiper!"
- Variations: Left only, right only, alternate

**Move 3: Tick Tocks (2 min)**
- Demo: Tap ball between inside of feet
- SAY: "Inside, inside, inside - like a clock tick-tock!"
- Add movement: "Move forward while tick-tocking!"

**Combination (2 min)**
- "4 toe taps, 4 sole rolls, 4 tick tocks - GO!"

### 0:13-0:25 | Ball Mastery Stations (12 min)
**Your Goal:** Focused practice with high repetitions

**Key Points:**
- 3 minutes per station
- Walk around giving individual feedback
- "3... 2... 1... SWITCH!" for transitions
- Keep transitions under 30 seconds

**Coaching Cues by Station:**
- Station 1: "Can you beat your last score?"
- Station 2: "Soft touches, no rushing through the cones!"
- Station 3: "Stay inside the box while tick-tocking!"
- Station 4: "Sole pulls it back, inside pushes forward!"

### 0:25-0:33 | Traffic Lights Plus (8 min)
**Your Goal:** Apply ball mastery in a dynamic, fun game

**Exactly What to Say:**
- "GREEN = dribble fast, YELLOW = slow, RED = STOP + a ball mastery move!"
- "RED + TOE TAPS!" (do 10 together)
- "RED + YOUR CHOICE!" (let them pick)

### 0:33-0:43 | Cone Knockout Game (10 min)
**Your Goal:** Apply close control in a competitive game

**Round 1 (3 min):** Everyone knocks down cones
**Round 2 (4 min):** Add cone defenders
**Round 3 (3 min):** New defenders

**Key Phrases:**
- "Close control to sneak past!"
- "Look for unguarded cones!"

### 0:43-0:55 | Small-Sided Scrimmage (12 min)
**Your Goal:** Apply skills in real game situation

**Special Rule:** Must do a ball mastery move before shooting
**Key Phrases:**
- "I saw that sole roll - now you can shoot!"
- "Can you use a move to get past them?"

### 0:55-1:00 | Cool Down & Challenge (5 min)
**Your Goal:** Light activity, set homework, end positively

**Juggling Intro:**
- Drop ball, let bounce, kick up, catch
- "How many kicks before it hits the ground?"

**Homework:** "Practice toe taps at home - try to do 30!"

---

## Troubleshooting Guide

### "Kids can't do toe taps - ball keeps rolling away"
- Have them start with ball against a wall
- Slow down the tempo
- SAY: "Lighter touches! Pretend the ball is an egg."

### "Stations are chaotic"
- Walk to the chaotic station and coach there
- Add a challenge to focus them: "Can you do it with eyes closed?"
- If still chaotic, bring everyone together for group demo

### "One kid is way ahead of the others"
- Give them extra challenges: "Now weak foot only!"
- Make them a helper: "Can you coach your station?"
- Personal challenge: "Can you do all 3 moves while moving backward?"

### "A kid says 'I can't do it'"
- Private encouragement: "You CAN. Watch me. Now try."
- Simplify: "Just one toe tap. Nice! Now two."
- Celebrate small wins: "See? You just did it!"

### "Not enough time for everything"
- Cut one station rotation (9 min instead of 12)
- Shorten scrimmage to 8 minutes
- Never cut the celebration/cool down

### "Too much time"
- Extend scrimmage
- Add more juggling practice
- Run an extra round of Traffic Lights Plus

---

## Ball Mastery Skill Teaching Points

### Toe Taps
**Correct:** Ball in place, alternating feet, tapping top of ball, rhythm steady
**Incorrect:** Ball moving around, stepping ON the ball, losing balance
**Key Phrase:** "Light taps, like a drum beat!"

### Sole Rolls
**Correct:** Bottom of foot on top of ball, rolling side to side, controlled
**Incorrect:** Using toes instead of sole, ball getting away
**Key Phrase:** "Windshield wiper - roll it across!"

### Tick Tocks
**Correct:** Inside of foot, ball going side to side, rhythm consistent
**Incorrect:** Kicking ball too hard, ball going forward instead of sideways
**Key Phrase:** "Tick tock like a clock!"

### Pull Backs
**Correct:** Sole pulls ball backward, inside of foot pushes forward
**Incorrect:** Stepping on ball, ball going sideways
**Key Phrase:** "Pull it back with your sole, push with your inside!"

---

## Post-Session Reflection

After practice, take 5 minutes to answer:

1. Could all players do at least 10 toe taps by the end?
2. Did the station rotations run smoothly? What would I change?
3. Which move was hardest for the group?
4. Did everyone get to play in the scrimmage?
5. What was the energy like at the end?

---

## Parent Communication

### If a parent asks "What did you work on today?"
"We focused on ball mastery - the fundamental moves that help players control the ball. [Name] worked on toe taps, sole rolls, and tick tocks. Ask them to show you at home!"

### Email/Text to send after practice
"Hi Team! Great practice today working on ball mastery! We learned three key moves: toe taps, sole rolls, and tick tocks. These are the building blocks for all ball control. Challenge for the week: can your child do 30 toe taps without the ball rolling away? Practice makes perfect! See everyone next practice. - Coach [Name]"

### For the Team Newsletter/Group
"This Week: Ball Mastery! Your young soccer players learned the foundation moves that professionals use every day. Ask your child to teach YOU: 1) Toe taps (alternating feet on top of ball), 2) Sole rolls (rolling ball side to side), 3) Tick tocks (tapping between inside of feet). These moves help develop close control - keeping the ball glued to their feet!"
`,
      isDefault: false,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION PLAN 3: DRIBBLING ADVENTURES
    // ═══════════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      stageId: fundamentals.id,
      name: "Dribbling Adventures - Learning to Move with the Ball",
      description:
        "A 60-minute session focused on dribbling skills through adventure-themed games. Players learn to dribble with different parts of the foot, change direction, and dribble under pressure. High engagement through storytelling and imagination.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "The Jungle Warmup",
          type: "warmup",
          durationMinutes: 8,
          description: "Adventure-themed warmup where players dribble like different animals",
          activitySuggestions: ["Animal Dribbling", "Jungle Adventure"],
          coachingScript: `ARRIVAL & SETUP:
- As players arrive: "Welcome to the JUNGLE! Grab a ball - you're an explorer today!"
- Let them dribble freely for 2-3 minutes

GATHER THE TEAM (0:03):
- "Explorers, come to base camp!" (center of area)
- "Today we're going on a DRIBBLING ADVENTURE through the jungle!"
- "But first, we need to practice moving like jungle animals!"

ANIMAL DRIBBLING (5 minutes):
Each animal = different dribbling style

CHEETAH (1 min):
- "CHEETAH! Fast dribbling - go go go!"
- Let them sprint with ball
- "Cheetahs are FAST but they stay in control!"

ELEPHANT (1 min):
- "ELEPHANT! Slow and powerful - big heavy steps!"
- Slow dribbling, strong touches
- "Stomp stomp stomp with your ball!"

SNAKE (1 min):
- "SNAKE! Slither side to side!"
- Dribbling in zig-zag patterns
- "Sssssslither through the jungle!"

MONKEY (1 min):
- "MONKEY! Quick direction changes, stop and go!"
- Dribble, stop suddenly, change direction
- "Monkeys are tricky!"

FREEZE ANIMAL (1 min):
- "When I call an animal, show me that dribble!"
- "CHEETAH!" ... "SNAKE!" ... "ELEPHANT!" ... "MONKEY!"
- Rapid changes between animals`,
        },
        {
          name: "Dribbling Through Gates",
          type: "technical",
          durationMinutes: 10,
          description: "Players dribble through cone gates scattered around the area - different points for different gates",
          activitySuggestions: ["Gates Dribbling", "Gate Challenges"],
          coachingScript: `SETUP (before practice or during warmup):
- Create 8-10 cone gates scattered around the playing area
- Gates = 2 cones, 3 feet apart
- Some gates tighter than others (harder = more points)

EXPLAIN (0:08):
- "In the jungle, there are MAGIC GATES!"
- "Your mission: dribble through as many gates as you can!"
- Point to different gates: "Some gates are easy (wide) - 1 point. Some are tricky (narrow) - 2 points!"
- "You MUST go through with your ball under control. No kicking and chasing!"

ROUND 1 - FREE EXPLORATION (3 min):
- "How many gates can you go through in 2 minutes? Count your points! GO!"
- Walk around encouraging: "Nice control through that one!" "3 points now!"
- Call out halfway: "1 minute left!"
- "FREEZE! How many points? Anyone get 10? 15?"

TEACHING MOMENT (1 min):
- "Show me - what part of your foot guides the ball through the gate?"
- Look for: inside of foot, laces, outside of foot
- Demo: "I like to use my INSIDE for control, or my LACES to push straight through."

ROUND 2 - CHALLENGE ROUND (3 min):
- "This time, you can only use ONE FOOT! Pick your favorite!"
- Walk around checking for one-foot use
- "Now switch - OTHER FOOT ONLY!"

ROUND 3 - TRAFFIC GATES (3 min):
- "Now there's TRAFFIC! You might meet someone at the gate!"
- "If someone else is going through, you have to wait or find another gate!"
- "This is like a real game - there's other players around!"
- Encourage awareness: "Eyes up! Who else is near that gate?"`,
        },
        {
          name: "Treasure Island",
          type: "technical",
          durationMinutes: 10,
          description: "Dribbling game where players collect 'treasures' (cones/objects) while dribbling",
          activitySuggestions: ["Treasure Island", "Collect the Cones"],
          coachingScript: `SETUP (0:18):
- Scatter 20-25 small objects (extra cones, small discs, bean bags) around the area
- Create a "Treasure Chest" area with cones at each end

EXPLAIN:
- "TREASURE ISLAND! There's treasure scattered all around!"
- "Your mission: dribble to a treasure, pick it up, dribble back to your treasure chest!"
- "You MUST be dribbling when you pick up treasure - no parking your ball!"
- Point to treasure chests: "This team's chest is here, this team's chest is here!"

ROUND 1 - TEAM TREASURE HUNT (4 min):
- Divide into 2 teams
- "Which team can collect the most treasure? GO!"
- Encourage keeping ball close while bending to pick up treasure
- "That's tricky! Ball close, scoop the treasure!"
- Count treasures at end: "Team 1 has 12! Team 2 has 13! Great collecting!"

RESET treasures, pick 2-3 pirates:

ROUND 2 - PIRATE ATTACK! (4 min):
- "[Names], you're PIRATES! You try to kick dribblers' balls out!"
- "Treasure hunters - if your ball gets kicked out, do 5 toe taps then come back!"
- "Pirates - kick balls OUT, don't steal the treasure!"
- Creates pressure while dribbling
- "Protect your ball AND grab the treasure!"

COACHING POINTS:
- "Keep the ball close so pirates can't get it!"
- "Which way is a pirate coming? Turn the OTHER way!"
- "Quick - scoop and go!"

FINAL COUNT:
- "FREEZE! Count your treasure! Amazing treasure hunting!"`,
        },
        {
          name: "Shark Attack",
          type: "game",
          durationMinutes: 10,
          description: "Classic dribbling game - sharks try to kick balls out while dribblers protect",
          activitySuggestions: ["Shark Attack", "Protect Your Ball"],
          coachingScript: `TRANSITION (0:28):
- "Now we're leaving the jungle and going to... THE OCEAN!"
- "But watch out - there are SHARKS!"

SETUP:
- 20x20 pace grid
- 1-2 sharks with pinnies (no ball)
- Everyone else has a ball

EXPLAIN:
- "Dribblers - protect your ball from the sharks!"
- "Sharks - kick balls OUT of the ocean!"
- "If your ball gets kicked out, 5 toe taps on the side, then swim back in!"

ROUND 1 (3 min):
- "Sharks, show me your shark faces! Dribblers ready? SHARKS ARE HUNGRY!"
- Walk around the outside
- Encourage: "Great escape!" "Nice protecting!" "Sharks - find the sleepy fish!"
- "FREEZE! Dribblers, point to where the sharks are right now!"

TEACHING MOMENT:
- "How do you protect your ball from a shark?"
- Look for: "Put my body between the shark and ball"
- Demo: "YES! This is called SHIELDING. Body between shark and ball!"

ROUND 2 (3 min):
- "Now when you shield, the shark has to go around!"
- Reinforce: "Beautiful shield!" "Turn away from the shark!"

ROUND 3 - NEW SHARKS (3 min):
- "New sharks! Who wants to be a shark?"
- Trade pinnies
- "Last round - can the sharks catch everyone?"

WRAP UP:
- "Great ocean survival! Remember - SHIELD to protect your ball!"`,
        },
        {
          name: "Adventure Scrimmage",
          type: "game",
          durationMinutes: 15,
          description: "Small-sided game with special 'adventure points' for dribbling moves",
          activitySuggestions: ["3v3 Adventure Game", "Dribbling Points Scrimmage"],
          coachingScript: `TRANSITION (0:38):
- "Final adventure - a REAL GAME with adventure points!"
- Split into two teams quickly

SETUP:
- 25x20 pace field
- Cone goals (4 paces wide)
- 3v3 or 4v4

SPECIAL RULES:
- "Goal = 1 point (normal)"
- "ADVENTURE POINT = 2 points if you dribble past a defender before scoring!"
- "Dribbling past someone means you had the ball, they tried to get it, you kept it and went past!"
- "I'll be watching for adventure points!"

FIRST HALF (6 min):
- "GO!"
- Watch for dribbling attempts
- Call out adventure points: "That's an adventure point! [Name] dribbled past them!"
- Celebrate attempts even if not successful: "Great try to dribble past!"

HALF TIME (1 min):
- "Water sips! What's working? How can you earn adventure points?"
- Quick tips: "Remember your moves - change direction like a monkey!"

SECOND HALF (6 min):
- "GO! Hunt for those adventure points!"
- Keep energy high
- If one team is dominating, quietly join the other team

COACHING PHRASES:
- "Can you use a move to get past?"
- "Remember the snake - slither past them!"
- "Shield! Then turn away!"
- "Beautiful adventure dribble!"

FINAL WHISTLE:
- "GAME OVER! Great adventure game!"
- Quick count: "Did we earn any adventure points? How many?"`,
        },
        {
          name: "Adventure Recap & Challenge",
          type: "cooldown",
          durationMinutes: 7,
          description: "Cool down with adventure recap, skill challenge, and celebration",
          activitySuggestions: ["Juggling Challenge", "Adventure Badge Review"],
          coachingScript: `GATHER (0:53):
- "Adventurers, bring it in! Make our explorer circle!"
- Wait for everyone, catch breath

ADVENTURE RECAP (2 min):
- "What adventures did we go on today?"
- Let them answer: Jungle, Treasure Island, Ocean with sharks, Adventure game
- "What dribbling skills did we learn?"
- Look for: different speeds, going through gates, shielding, dribbling past people

JUGGLING CHALLENGE (3 min):
- "Every great adventurer can juggle! Let's practice."
- Demo: drop, bounce, kick, catch
- "How many can you do? Start practicing!"
- Walk around encouraging
- Celebrate successes: "One!" "That was TWO!"

ADVENTURE CHALLENGE FOR THE WEEK:
- "Your adventure mission for this week:"
- "Find things to dribble around at home - toys, shoes, anything!"
- "Practice dribbling through gates - use shoes or bottles as cones!"
- "See if you can dribble like all 4 animals we learned!"

TEAM CHEER (1 min):
- "Hands in! Adventurers on three!"
- "1... 2... 3... ADVENTURERS!"
- "High fives! Great adventure today!"

PARENT NOTES:
- Available for parents
- "We went on dribbling adventures today! [Name] did great at [specific skill]."
- "Ask them about the animals we dribbled like!"`,
        },
      ] as SessionSegment[],
      equipmentNeeded: [
        "1 ball per player (plus extras)",
        "25-30 cones",
        "20-25 small objects for treasure (extra cones, discs, bean bags)",
        "Pinnies (2-3 for sharks)",
        "First aid kit",
      ],
      coachingNotes: `# Dribbling Adventures - Complete Coach's Guide

## Before You Arrive (15 minutes early)

### Equipment Checklist
- [ ] Balls - 1 per player + 3 extras
- [ ] Cones - 25-30 (for gates, goals, boundaries)
- [ ] Small objects for "treasure" - 20-25 items (extra cones, discs, bean bags)
- [ ] Pinnies - 3-4 for sharks and teams
- [ ] First aid kit
- [ ] This session plan (printed!)
- [ ] Water available

### Field Setup Diagram
\`\`\`
┌──────────────────────────────────────────────────┐
│                                                  │
│    ▲ ▲    ▲ ▲       ▲ ▲      ▲ ▲                │
│   (gate) (gate)    (gate)   (gate)              │
│                                                  │
│        ●   ●   ●   ●   ●   ●                    │
│     ●   ●   ●   ●   ●   ●   ●                   │
│        (scattered treasure)                      │
│    ▲ ▲       ▲ ▲        ▲ ▲      ▲ ▲            │
│   (gate)    (gate)     (gate)   (gate)          │
│                                                  │
│                                                  │
│  [Treasure Chest 1]        [Treasure Chest 2]   │
│      ▲ ▲ ▲ ▲                   ▲ ▲ ▲ ▲          │
│                                                  │
│              SCRIMMAGE AREA                      │
│        ▲ ▲                    ▲ ▲                │
│       (goal)                 (goal)              │
│                                                  │
└──────────────────────────────────────────────────┘
\`\`\`

### Gate Setup Details
- Create 8-10 gates scattered randomly
- Each gate = 2 cones, 3 feet apart
- Make 3-4 narrow gates (harder, worth 2 points)
- Make 4-5 wider gates (easier, worth 1 point)

---

## Minute-by-Minute Breakdown

### 0:00-0:08 | The Jungle Warmup (8 min)
**Your Goal:** Get moving, introduce adventure theme, different dribbling speeds

**Animals & Dribbling Styles:**
| Animal | Dribbling Style | Key Phrase |
|--------|-----------------|------------|
| CHEETAH | Fast, sprint | "Fast but in control!" |
| ELEPHANT | Slow, powerful | "Stomp stomp stomp!" |
| SNAKE | Zig-zag, slither | "Sssslither side to side!" |
| MONKEY | Stop-start, direction changes | "Tricky monkeys!" |

**Exactly What to Say:**
- "CHEETAH! Fast dribbling - go go go!"
- "ELEPHANT! Slow and powerful - big heavy steps!"
- "SNAKE! Slither side to side!"
- "MONKEY! Quick direction changes!"

### 0:08-0:18 | Dribbling Through Gates (10 min)
**Your Goal:** Practice close control, introduce different feet

**Round 1 (3 min):** Free gate exploration - count points
**Teaching moment (1 min):** "What part of foot guides through?"
**Round 2 (3 min):** One foot only, then switch
**Round 3 (3 min):** Traffic gates - awareness of others

**Key Phrases:**
- "Inside of foot for control!"
- "Laces to push straight through!"
- "Eyes up - who else is near that gate?"

### 0:18-0:28 | Treasure Island (10 min)
**Your Goal:** Dribble while doing another task, add pressure

**Round 1 (4 min):** Team treasure collection
**Round 2 (4 min):** Add pirates (defenders)

**Key Phrases:**
- "Ball close while you pick up treasure!"
- "Protect your ball AND grab the treasure!"
- "Which way is a pirate? Turn the OTHER way!"

### 0:28-0:38 | Shark Attack (10 min)
**Your Goal:** Dribbling under pressure, introduce shielding

**Round 1 (3 min):** Basic shark attack
**Teaching moment:** Introduce shielding - body between shark and ball
**Round 2 (3 min):** Reinforce shielding
**Round 3 (3 min):** New sharks

**Key Phrases:**
- "Put your body between the shark and the ball!"
- "This is called SHIELDING!"
- "Turn away from the shark!"

### 0:38-0:53 | Adventure Scrimmage (15 min)
**Your Goal:** Apply dribbling in game context

**Special Rule:** 2 points for "adventure point" (dribbling past a defender)

**First half (6 min):** Watch for adventure attempts
**Half time (1 min):** Quick tips
**Second half (6 min):** Keep encouraging dribbling moves

**Key Phrases:**
- "Adventure point! You dribbled past them!"
- "Can you use a move to get past?"
- "Remember the snake - slither past!"

### 0:53-1:00 | Adventure Recap & Challenge (7 min)
**Your Goal:** Reflect on learning, set homework

**Activities:**
- Adventure recap (2 min)
- Juggling challenge (3 min)
- Weekly challenge & team cheer (2 min)

**Weekly Challenge:** "Practice dribbling around objects at home!"

---

## Troubleshooting Guide

### "Kids aren't going through gates - just dribbling randomly"
- Stand by a gate and call kids over: "[Name], can you come through THIS gate?"
- Add competition: "Who can get the most points?"
- Make it more dramatic: "These are MAGIC gates!"

### "Sharks catching everyone immediately"
- Make the area bigger
- Remove a shark
- Sharks must hop instead of run
- Add safe zones (3 seconds safe in corners)

### "No one is getting adventure points in scrimmage"
- Lower the bar: "Adventure point if you TRY to dribble past!"
- Demo what it looks like
- Add yourself to game and earn one, then celebrate

### "Kids are frustrated with dribbling"
- Simplify: "Just keep the ball close!"
- Use animals: "Be a turtle - slow and steady!"
- Private encouragement: "You're getting it!"

### "Treasure hunt is chaotic"
- Give each player specific treasure color to collect
- Assign regions of the field
- Add rule: "Walk, don't run!"

### "One player always wants to be shark"
- "Everyone will get a turn!"
- Use fair selection: "Who hasn't been a shark yet?"
- Rotate every round

---

## Dribbling Skill Teaching Points

### Using Inside of Foot
**Correct:** Inside of foot pushes ball, body sideways to direction
**Incorrect:** Toe poke, ball going too far
**Key Phrase:** "Turn your foot sideways, push with the inside!"

### Using Laces (Instep)
**Correct:** Laces contact middle of ball, foot points down
**Incorrect:** Kicking with toe, ball going high
**Key Phrase:** "Point your toe down, push with your laces!"

### Shielding
**Correct:** Body between ball and defender, ball on far foot
**Incorrect:** Facing defender, ball exposed
**Key Phrase:** "Body is a wall between the shark and your treasure!"

### Changing Direction
**Correct:** Inside/outside of foot cuts ball, body follows
**Incorrect:** Stopping, then turning, then starting
**Key Phrase:** "One smooth motion - cut and go!"

---

## The Adventure Theme

### Why Use the Adventure Theme?
- Kids ages 6-8 respond to imagination and storytelling
- Makes repetitive skill work feel like play
- Creates memorable associations with skills
- Kids remember "Cheetah dribbling" better than "fast dribbling"

### Theme Connections
| Theme Element | Skill Being Taught |
|---------------|-------------------|
| Jungle animals | Speed control |
| Magic gates | Close control, parts of foot |
| Treasure Island | Dribbling while multitasking |
| Shark Attack | Dribbling under pressure |
| Adventure points | Dribbling past opponents |

### If a Kid Doesn't Want to Play Pretend
- That's okay! Just give them the skill instruction
- "Instead of being a cheetah, dribble really fast!"
- They'll often join in once they see others having fun

---

## Post-Session Reflection

After practice, take 5 minutes to answer:

1. Did the adventure theme engage the kids?
2. Which animal dribbling style did kids do best?
3. Did kids understand the shielding concept?
4. Were the gates the right difficulty?
5. Did everyone earn at least one adventure point (or try to)?

---

## Parent Communication

### If a parent asks "What did you work on today?"
"We went on dribbling adventures! [Name] learned to dribble at different speeds (like jungle animals!), went through obstacle gates, protected their ball from 'sharks,' and played a game. Ask them to show you 'cheetah dribbling' vs 'elephant dribbling'!"

### Email/Text to send after practice
"Hi Team! What an adventure today! We practiced dribbling through jungle-themed games. Your child learned: 1) Speed control (fast like a cheetah, slow like an elephant), 2) Dribbling through tight spaces, 3) SHIELDING - protecting the ball from defenders. Ask them to teach you the animal dribbles! See everyone next practice. - Coach [Name]"

### For the Team Newsletter/Group
"This Week's Adventure: Dribbling Skills! Our team became jungle explorers, treasure hunters, and ocean survivors today! We learned that great dribblers can go fast (cheetah), slow (elephant), zig-zag (snake), and stop-start (monkey). The big skill of the day: SHIELDING - putting your body between the defender and the ball. Challenge for home: Set up some 'gates' with shoes or water bottles and practice dribbling through them!"
`,
      isDefault: false,
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION PLAN 4: GAME DAY WARMUP
    // ═══════════════════════════════════════════════════════════════════════════
    {
      sportId: soccer.id,
      stageId: fundamentals.id,
      name: "Game Day Warmup - Pre-Game Routine",
      description:
        "A focused 20-minute pre-game warmup routine for young players. Gets bodies warm, minds focused, and energy levels right. Simple, consistent routine that becomes familiar throughout the season. Builds confidence before kickoff.",
      totalDurationMinutes: 20,
      structure: [
        {
          name: "Arrival & Ball Touches",
          type: "warmup",
          durationMinutes: 5,
          description: "Free ball play while team assembles, gentle ball touches to settle nerves",
          activitySuggestions: ["Free dribbling", "Gentle passing with partner"],
          coachingScript: `ARRIVAL (start 20 min before game):
When each player arrives:
- "Hey [Name]! Grab a ball and start dribbling around. Nice and easy!"
- "Find a partner and pass back and forth when you're ready."

PURPOSE OF THIS TIME:
- Let energy settle naturally
- No pressure, no instructions
- Kids who are nervous can calm down
- Kids who are excited can burn off energy
- Coach can handle logistics (lineup, parents, etc.)

WHAT TO SAY:
- "How are you feeling? Excited?"
- "Nice passes!"
- "Keep the ball moving, get those feet warmed up!"
- Don't over-coach - let them be

LOGISTICS DURING THIS TIME:
- Check roster/attendance
- Confirm lineup in your head
- Touch base with any parents who need info
- Have extra balls ready for warm-up`,
        },
        {
          name: "Team Circle Ball Mastery",
          type: "warmup",
          durationMinutes: 4,
          description: "Group ball mastery to synchronize the team and build rhythm together",
          activitySuggestions: ["Toe Taps", "Sole Rolls", "Tick Tocks"],
          coachingScript: `GATHER THE TEAM (0:05):
- Clap pattern: "Everyone in! Make a circle!"
- Wait for quiet, eye contact with each player
- "Okay team, let's get our feet ready! Ball under your foot."

TOE TAPS (1 min):
- "Toe taps together! We'll count to 20 as a team!"
- Count out loud together: "1, 2, 3, 4..." up to 20
- "Nice rhythm! Your feet are waking up!"

SOLE ROLLS (1 min):
- "Now sole rolls - left foot only... now right foot only..."
- "Feel the ball under your foot!"
- "Switch every time I clap!"

TICK TOCKS (1 min):
- "Tick tocks - inside to inside!"
- "Start slow... a little faster... nice!"

QUICK STRETCH WITH BALL (1 min):
- "Put ball between your feet, reach for the sky... and touch your toes!"
- "Roll ball under one foot, stretch that leg..."
- "Shake out your legs!"

ENERGY CHECK:
- "How's everyone feeling? Ready? Let's go!"`,
        },
        {
          name: "Dynamic Movement",
          type: "warmup",
          durationMinutes: 4,
          description: "Jogging and dynamic movements to raise heart rate and loosen muscles",
          activitySuggestions: ["Jog and move", "Dynamic stretches", "Light running"],
          coachingScript: `LINE UP (0:09):
- "Put your balls on the side. Line up on this line!"
- Mark a straight line about 15-20 paces

MOVEMENT SEQUENCE:
Do each movement across and back (30 seconds each):

JOG (30 sec):
- "Light jog across, jog back!"
- "Easy pace, wake up those legs!"

HIGH KNEES (30 sec):
- "High knees! Knees to your hands!"
- Demonstrate, jog with them
- "Pump those arms!"

BUTT KICKS (30 sec):
- "Butt kicks! Heels to your bottom!"
- "Quick feet, quick feet!"

SIDE SHUFFLE (30 sec):
- "Side shuffle! Face me, shuffle across!"
- "Stay low, quick feet!"
- "Other way back!"

KARAOKE/GRAPEVINE (30 sec):
- "Grapevine! Cross your feet as you go!"
- Demo first - some kids won't know this
- "Don't worry if it's tricky - just try!"

SKIP (30 sec):
- "Skip across! Big skips!"
- "Swing those arms!"
- "And skip back!"

SPRINT (30 sec):
- "Last one - SPRINT across... jog back easy!"
- "Fast fast fast!"
- "Nice work! Grab your water!"

QUICK WATER (30 sec):
- "Quick sips, then back! We're almost ready!"`,
        },
        {
          name: "Passing Pairs",
          type: "technical",
          durationMinutes: 4,
          description: "Partner passing to warm up touch and get game-ready connections",
          activitySuggestions: ["Partner passing", "Two-touch passing"],
          coachingScript: `SETUP (0:13):
- "Find a partner, one ball, spread out!"
- "Stand about 5 big steps apart."

PASSING SEQUENCE:

TWO-TOUCH PASSING (90 sec):
- "Pass back and forth - first touch to control, second touch to pass!"
- "Call your partner's name when you pass!"
- Walk around, encourage: "Nice pass!" "Great control!"
- "Try to hit your partner's feet!"

ONE-TOUCH PASSING (60 sec):
- "Now try one-touch - pass it right back!"
- "Soft pass so they can one-touch it!"
- "If one-touch is too hard, go back to two-touch - that's totally fine!"

MOVING PASSING (60 sec):
- "Now move side to side while you pass!"
- "Pass, then shuffle to a new spot!"
- "Keep the ball moving, keep your feet moving!"

COACHING POINTS:
- "Inside of foot!"
- "Soft touch!"
- "Eyes on your partner!"
- "Nice weight on that pass!"`,
        },
        {
          name: "Team Huddle & Lineup",
          type: "cooldown",
          durationMinutes: 3,
          description: "Final team huddle, starting lineup announcement, team chant for confidence",
          activitySuggestions: ["Team huddle", "Starting lineup", "Team chant"],
          coachingScript: `GATHER (0:17):
- "Bring it in! Huddle up!"
- Wait for everyone, tight circle

TEAM TALK (1 min):
- Keep it SHORT and POSITIVE
- "Okay team, we're ready! Here's what I want to see today:"
- Pick ONE simple focus: "Have fun!" or "Try your hardest!" or "Support each other!"
- DON'T: Long tactical talks, lists of things to remember

Examples of good pre-game messages:
- "One thing today: Have FUN! That's it. Have fun."
- "Remember: We're a TEAM. Cheer for each other!"
- "Play hard, support your teammates, have fun!"

STARTING LINEUP (1 min):
- If you use subs, announce simply
- "Starting: [Names]. Everyone else, you'll go in soon. Everyone plays!"
- Keep it matter-of-fact, not dramatic
- "And remember - everyone gets to play lots today!"

TEAM CHANT (1 min):
- "Hands in the middle!"
- "On three - [team name]! 1... 2... 3... [TEAM NAME]!"
- "Let's GO!"

POSITIONS:
- Walk starters to their positions
- Show them where to stand for kickoff
- "You're starting here. When the whistle blows, let's play!"

FINAL WORDS:
- "Have fun out there! I believe in you!"`,
        },
      ] as SessionSegment[],
      equipmentNeeded: [
        "1 ball per player",
        "4 cones for warmup line",
        "Water bottles (remind parents)",
        "This warmup plan",
      ],
      coachingNotes: `# Game Day Warmup - Complete Coach's Guide

## Before You Arrive (30 minutes before game)

### Equipment Checklist
- [ ] Balls - 1 per player + extras
- [ ] Cones - 4 for warmup line
- [ ] Lineup written down
- [ ] This warmup plan
- [ ] First aid kit at bench
- [ ] Team water/snacks coordinated with parent

### Field Check
- Where is your team's warmup area? (Usually a space behind your goal or on the side)
- Where are parents sitting? (Direct them to spectator area)
- Where is the team bench?
- Introduce yourself to ref if possible

### Mental Preparation
- Review lineup (who starts, substitution plan)
- Take a breath - your calm energy helps the team
- Remember: This is supposed to be FUN for them!

---

## Minute-by-Minute Breakdown

### 20:00-15:00 before kickoff | Arrival & Ball Touches (5 min)
**Your Goal:** Let team gather naturally, settle nerves

**Exactly What to Say:**
- "Hey [Name]! Grab a ball, start dribbling, nice and easy!"
- "Find a partner and pass around!"
- "How are you feeling? Excited for the game?"

**What to Watch:**
- Nervous kids (extra encouragement, give them a job)
- Over-excited kids (channel energy: "Save it for the game!")
- Late arrivals (no stress, direct them to join warmup)

**Coach Tasks:**
- Check attendance
- Finalize lineup
- Direct parents to spectator area

### 15:00-11:00 before kickoff | Team Circle Ball Mastery (4 min)
**Your Goal:** Synchronize team, build rhythm and focus

**Exactly What to Say:**
- "Everyone in! Make a circle, ball under foot!"
- "Toe taps together - let's count to 20! 1, 2, 3, 4..."
- "Nice! Now sole rolls..."

**Sequence:**
1. Toe taps (count to 20)
2. Sole rolls (left foot, then right)
3. Tick tocks (slow to fast)
4. Quick stretch with ball

### 11:00-7:00 before kickoff | Dynamic Movement (4 min)
**Your Goal:** Raise heart rate, loosen muscles

**Exactly What to Say:**
- "Balls on the side! Line up on this line!"
- "Light jog across, back!"
- "High knees! Butt kicks! Side shuffle!"

**Movement Sequence (30 sec each):**
1. Light jog
2. High knees
3. Butt kicks
4. Side shuffle (both ways)
5. Karaoke/Grapevine
6. Skip
7. Sprint (jog back easy)
8. Quick water

### 7:00-3:00 before kickoff | Passing Pairs (4 min)
**Your Goal:** Warm up passing touch, partner connections

**Exactly What to Say:**
- "Partner up, one ball, 5 steps apart!"
- "Two-touch passing - control, then pass! Call their name!"
- "Now try one-touch - pass it right back!"
- "Now move while you pass!"

**Sequence:**
1. Two-touch passing (90 sec)
2. One-touch passing (60 sec)
3. Moving while passing (60 sec)

### 3:00-0:00 before kickoff | Team Huddle & Lineup (3 min)
**Your Goal:** Focus, confidence, send them out ready

**Team Talk (keep SHORT):**
- Pick ONE simple message
- "One thing today: Have FUN!"
- "We're a TEAM - cheer for each other!"
- "Play hard and support your teammates!"

**Do NOT:**
- Give long tactical talks
- List multiple things to remember
- Create pressure or stress

**Lineup:**
- Announce starters simply
- "Everyone plays lots today!"
- Walk them to positions

**Team Chant:**
- "Hands in! 1, 2, 3, [TEAM NAME]!"
- "Let's GO!"

---

## Pre-Game Anxiety Guide

### Signs a Child is Nervous
- Unusually quiet
- Fidgeting more than normal
- Not wanting to participate in warmup
- Saying "I don't want to play"
- Stomach complaints

### How to Help
1. **Don't force it** - "It's okay to feel nervous. That means you care!"
2. **Give a job** - "Can you help me count the balls?"
3. **Pair with buddy** - Put them with a confident friend
4. **Simple focus** - "Just try to touch the ball. That's your only goal today."
5. **Physical grounding** - "Take 3 deep breaths with me."

### What to Say
- "Butterflies are normal! Even professional players get them."
- "Once the game starts, the nervous feeling usually goes away."
- "Just do your best and have fun - that's all I ask!"
- "I'll be right here cheering for you!"

### If They Really Don't Want to Play
- Don't force them onto the field
- Let them sit with you on the bench first
- Invite them to join when ready
- Talk to parents calmly after the game

---

## Weather Adjustments

### Cold Day
- Extend dynamic movement section
- Add jumping jacks and arm circles
- Shorter water breaks
- Keep them moving constantly

### Hot Day
- More water breaks (add one after ball mastery)
- Shade if available
- Watch for flushed faces, heavy breathing
- Slightly shorter warmup if very hot

### Wet/Slippery
- Emphasize controlled movements
- No sharp turns or sprints
- Watch footing
- "Careful on turns - it's slippery!"

### Wind
- Adjust passing direction (pass into wind = harder)
- Tighter control work
- Keep balls in circle (they roll away)

---

## Game Day Energy Management

### If Team Seems Flat/Low Energy
- Add competition: "Who can do 30 toe taps fastest?"
- Increase your own energy
- Sprint challenge at end of dynamic warmup
- Call-and-response: "Are we ready?!" "YES!"

### If Team Seems Over-Excited/Chaotic
- Slow down your voice
- Ball mastery circle is calming
- Deep breaths as a team
- Focus exercise: "Show me your game face. Focused and ready."

### Finding the Right Energy
- Not too sleepy (won't compete)
- Not too hyper (won't focus)
- Alert, excited, but controlled
- They should be smiling but attentive

---

## Starting Lineup Notes

### How to Announce
- Keep it simple and matter-of-fact
- "Starting today: Marcus, Lily, Sarah, Jake. Everyone else goes in really soon!"
- Don't make it dramatic
- Emphasize that EVERYONE PLAYS

### If a Kid is Upset About Not Starting
- Private moment: "Hey, you're going in soon. I need you ready!"
- Give them a job: "Watch from here and tell me what you see!"
- Reassure: "You'll play lots today, promise."
- Follow through - get them in early

### Substitution Tips for Young Ages
- Sub frequently (every 5-8 minutes)
- Keep track on paper or phone
- Equal playing time for all
- Don't wait for natural stoppages - create them

---

## Post-Warmup Checklist

Before the whistle blows, confirm:
- [ ] All players have had water
- [ ] Starters know their positions
- [ ] Subs know they'll play soon
- [ ] Team has done their chant
- [ ] Coach is calm and positive
- [ ] Parent situation is handled (they're in right spot)

---

## Quick Reference Card

Print this on a small card for your pocket:

\`\`\`
GAME DAY WARMUP (20 min)

5 min - Free arrival + ball touches
4 min - Circle: Toe taps, Sole rolls, Tick tocks
4 min - Movement: Jog, High knees, Butt kicks, Shuffle, Skip, Sprint
4 min - Partner passing: 2-touch, 1-touch, Moving
3 min - Huddle, Lineup, TEAM CHANT!

Message: "HAVE FUN!"
\`\`\`

---

## Parent Communication

### Pre-Game Text to Send (day before)
"Hi Team! Game tomorrow at [time/place]. Please arrive 25 minutes early for warmup. Bring: water bottle, shin guards, proper shoes. Looking forward to a fun game! - Coach [Name]"

### What to Tell Parents Before Game
- "We'll warm up for 20 minutes, then it's game time!"
- "Please stay in the spectator area - kids focus better!"
- "Cheer for ALL the kids, both teams!"
- "Stay positive - they can hear you!"

### If Parents Ask About the Lineup
- "Everyone plays equally - I rotate throughout the game."
- "At this age, development is more important than winning."
- "I'll make sure [Name] gets plenty of playing time!"
`,
      isDefault: true,
    },
  ];

  // Insert session plans as practice templates
  for (const plan of sessionPlans) {
    await getDb().insert(practiceTemplates).values(plan).onConflictDoNothing();
    console.log(`  Created: ${plan.name}`);
  }

  console.log(`\nSeeded ${sessionPlans.length} Soccer Session Plans (Fundamentals)`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedSoccerSessionPlans()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

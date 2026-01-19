import { getDb } from "../index";
import { practiceTemplates } from "../schema/practice-planning";
import { developmentStages } from "../schema/curriculum";
import { sports } from "../schema/sports";
import { eq } from "drizzle-orm";

export async function seedSessionPlanLibrary() {
  console.log("Seeding session plan library...");

  // Get sports
  const [soccer] = await getDb().select().from(sports).where(eq(sports.slug, "soccer"));
  const [basketball] = await getDb().select().from(sports).where(eq(sports.slug, "basketball"));

  if (!soccer || !basketball) {
    console.log("  ⚠ Soccer or Basketball sport not found, skipping session plan library");
    return;
  }

  // Get development stages
  const stages = await getDb().select().from(developmentStages);
  const fundamentalsStage = stages.find((s) => s.slug === "fundamentals");
  const skillBuildingStage = stages.find((s) => s.slug === "skill-building");
  const developmentStage = stages.find((s) => s.slug === "development");

  if (!fundamentalsStage || !skillBuildingStage || !developmentStage) {
    console.log("  ⚠ Development stages not found, skipping session plan library");
    return;
  }

  // ============================================================
  // SOCCER SESSION PLANS
  // ============================================================

  const soccerSessionPlans = [
    // === FUNDAMENTALS STAGE (Ages 6-8) ===
    {
      sportId: soccer.id,
      stageId: fundamentalsStage.id,
      name: "Ball Mastery Fun Session",
      description: "Focus on individual ball control through fun games. Perfect for beginning of season or younger players.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Free Play Arrival",
          type: "warmup",
          durationMinutes: 5,
          description: "Let players arrive and play freely with balls. Coach greets each player by name.",
          activitySuggestions: ["free-play"],
        },
        {
          name: "Warmup: Volcano Dribble",
          type: "warmup",
          durationMinutes: 7,
          description: "Players dribble around 'volcanos' (cones) without touching them. If they touch a volcano, it 'erupts' - 5 toe taps!",
          activitySuggestions: ["volcano-dribble"],
          coachingScript: [
            "Can everyone find their own volcano-free space?",
            "What happens if you look down at the ball? You might hit a volcano!",
            "Try using different parts of your foot - inside, outside, sole",
          ],
        },
        {
          name: "Ball Mastery Circuit",
          type: "technical",
          durationMinutes: 12,
          description: "Stations with different ball mastery moves. 2 minutes per station.",
          activitySuggestions: ["ball-mastery-circle"],
          stations: [
            "Station 1: Toe taps (count to 20)",
            "Station 2: Inside-inside touches (side to side)",
            "Station 3: Pull-push with sole",
            "Station 4: Around the world (circles around ball)",
            "Station 5: Tick-tocks (pendulum between feet)",
          ],
          coachingScript: [
            "How many touches can you get without stopping?",
            "Can you do it faster? What about slower with more control?",
            "Watch me first, then try it yourself",
          ],
        },
        {
          name: "Shark Attack Game",
          type: "game",
          durationMinutes: 12,
          description: "Dribblers try to keep ball while 1-2 'sharks' try to kick balls out of the grid.",
          activitySuggestions: ["shark-attack"],
          coachingScript: [
            "If you're a dribbler, where should your body be to protect the ball?",
            "Sharks - how can you work together?",
            "What if I add more sharks?",
          ],
        },
        {
          name: "Passing Partners",
          type: "technical",
          durationMinutes: 8,
          description: "Simple passing with a partner, focus on technique.",
          activitySuggestions: ["passing-pairs"],
          coachingScript: [
            "Where does your plant foot point?",
            "Show me your 'ping' - lock that ankle!",
            "Can you pass and receive with one touch?",
          ],
        },
        {
          name: "World Cup",
          type: "fun",
          durationMinutes: 12,
          description: "Everyone starts. Score = stay in. Miss = out and practice on side. Final 4 = World Cup Final!",
          activitySuggestions: ["world-cup"],
          coachingScript: [
            "Pick a country to represent!",
            "Can you hit the target? Where do you aim?",
            "Those eliminated - see how many juggles you can get while waiting",
          ],
        },
        {
          name: "Team High Fives",
          type: "cooldown",
          durationMinutes: 4,
          description: "Gather team, celebrate wins, give high-fives.",
          coachingScript: [
            "What did you learn today?",
            "Who did something great that we should celebrate?",
            "Practice 10 toe taps every day at home!",
          ],
        },
      ],
      equipmentNeeded: ["1 ball per player", "20+ cones", "2 mini goals"],
      coachingNotes: `
## Before Practice
- Arrive 10 minutes early to set up
- Have water available
- Prepare all stations before players arrive

## Key Principles for Fundamentals Stage
1. Every player has a ball as much as possible
2. Keep instructions short (30 seconds max)
3. More playing time, less standing time
4. Praise effort, not just results
5. Use questions, not commands

## Parent Communication
- Let parents know practice is play-based
- Encourage parents to stay and watch
- Brief check-in at pickup: one positive thing about each player
      `,
      isDefault: true,
      featured: true,
    },
    {
      sportId: soccer.id,
      stageId: fundamentalsStage.id,
      name: "First Passing Session",
      description: "Introduction to passing with partners. Emphasis on fun and success, not perfection.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Copy Cat Dribbling",
          type: "warmup",
          durationMinutes: 7,
          description: "Coach leads, players copy. Include stops, turns, speed changes.",
          activitySuggestions: ["copy-cat-dribbling"],
        },
        {
          name: "Traffic Lights",
          type: "warmup",
          durationMinutes: 6,
          description: "Red = stop, Yellow = slow dribble, Green = fast dribble. Add moves on colors.",
          activitySuggestions: ["traffic-lights"],
        },
        {
          name: "Partner Passing Intro",
          type: "technical",
          durationMinutes: 10,
          description: "Partners 5 yards apart. Focus on: plant foot, locked ankle, follow through.",
          activitySuggestions: ["passing-pairs"],
          coachingScript: [
            "Watch me first - plant foot points to partner",
            "Lock your ankle like a hammer",
            "Push through the middle of the ball",
            "How many passes can you make without it going past your partner?",
          ],
        },
        {
          name: "Passing Accuracy Challenge",
          type: "technical",
          durationMinutes: 10,
          description: "Pass through gates of different sizes. Narrow = 3 points, wide = 1 point.",
          activitySuggestions: ["passing-accuracy-challenge"],
        },
        {
          name: "3v1 Rondo Intro",
          type: "tactical",
          durationMinutes: 12,
          description: "Introduce the concept of keep-away. Rotate defender frequently.",
          activitySuggestions: ["3v1-rondo"],
          coachingScript: [
            "Move after you pass - don't stand still!",
            "Where should you be to help your teammate?",
            "Can you play with just 2 touches?",
          ],
        },
        {
          name: "3v3 to Small Goals",
          type: "game",
          durationMinutes: 12,
          description: "Small-sided game focusing on passing. Award bonus point for 3-pass goal.",
          activitySuggestions: ["4v4-to-small-goals"],
        },
        {
          name: "Stretch Circle",
          type: "cooldown",
          durationMinutes: 3,
          description: "Simple stretches in a circle. Each player picks a stretch.",
          activitySuggestions: ["passing-pairs"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones", "4 mini goals"],
      coachingNotes: `
## Focus for This Session
- Plant foot technique
- Locked ankle
- Follow through to target

## Common Mistakes to Watch For
- Toe poking (not using inside of foot)
- Plant foot too far from ball
- Not following through

## Differentiation
- Struggling players: move closer together
- Advanced players: add one-touch requirement
      `,
      isDefault: false,
      featured: true,
    },
    {
      sportId: soccer.id,
      stageId: fundamentalsStage.id,
      name: "Dribbling Adventures",
      description: "Creative dribbling session with imaginative games.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Musical Balls",
          type: "warmup",
          durationMinutes: 8,
          description: "Soccer musical chairs - when music stops, find a ball!",
          activitySuggestions: ["musical-balls"],
        },
        {
          name: "Numbers Game Warmup",
          type: "warmup",
          durationMinutes: 7,
          description: "Coach calls numbers, each triggers different move (1=stop, 2=turn, etc.)",
          activitySuggestions: ["numbers-game-warmup"],
        },
        {
          name: "Gates Dribbling",
          type: "technical",
          durationMinutes: 10,
          description: "Dribble through as many gates as possible in 60 seconds.",
          activitySuggestions: ["gates-dribbling"],
        },
        {
          name: "1v1 King of the Ring",
          type: "game",
          durationMinutes: 10,
          description: "Protect your ball while trying to knock others' balls out.",
          activitySuggestions: ["king-of-the-ring"],
        },
        {
          name: "Dribblers vs Defenders",
          type: "fun",
          durationMinutes: 10,
          description: "Can you dribble past the defenders to reach the other side?",
          activitySuggestions: ["dribblers-vs-defenders"],
        },
        {
          name: "3v3 Line Soccer",
          type: "game",
          durationMinutes: 12,
          description: "Score by dribbling over end line, not into a goal.",
          activitySuggestions: ["3v3-line-soccer"],
        },
        {
          name: "Keep It Up Circle",
          type: "cooldown",
          durationMinutes: 3,
          description: "Team juggling to end practice.",
          activitySuggestions: ["keep-it-up-circle"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "20+ cones", "Pinnies"],
      coachingNotes: `
## Session Theme: Dribbling with Confidence

Focus on:
- Close control
- Using different parts of the foot
- Protecting the ball with body

Questions to Ask:
- What part of your foot keeps the ball closest?
- How do you change direction quickly?
- When do you use speed vs control?
      `,
      isDefault: false,
      featured: false,
    },

    // === SKILL BUILDING STAGE (Ages 9-11) ===
    {
      sportId: soccer.id,
      stageId: skillBuildingStage.id,
      name: "Technical Skills: Receiving",
      description: "Master receiving the ball under pressure with good first touch.",
      totalDurationMinutes: 75,
      structure: [
        {
          name: "Partner Mirror Warmup",
          type: "warmup",
          durationMinutes: 8,
          description: "Partners face each other, one leads moves, other mirrors.",
          activitySuggestions: ["partner-mirror-warmup"],
        },
        {
          name: "First Touch Box",
          type: "technical",
          durationMinutes: 15,
          description: "Control ball within a 3x3 yard box. First touch must stay in box.",
          activitySuggestions: ["first-touch-box"],
          coachingScript: [
            "What part of your body receives the ball?",
            "How do you prepare before the ball arrives?",
            "Where should your first touch go?",
          ],
        },
        {
          name: "Receiving Under Pressure",
          type: "technical",
          durationMinutes: 12,
          description: "Add passive defender on receiver's back. Teach checking shoulder.",
          activitySuggestions: ["receiving-under-pressure"],
        },
        {
          name: "Turn and Face",
          type: "technical",
          durationMinutes: 12,
          description: "Receive with back to goal, turn using moves (Cruyff, drag back), attack.",
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
          description: "Small-sided game. Observe first touch quality in game situations.",
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
      equipmentNeeded: ["Balls", "Cones", "2 goals", "Pinnies"],
      coachingNotes: `
## Key Teaching Points
1. Check your shoulder BEFORE the ball arrives
2. Open your body to see the field
3. First touch should go where the space is
4. Cushion the ball - don't let it bounce away

## Progression
Week 1: Ground passes only
Week 2: Add air balls
Week 3: Add active defender
      `,
      isDefault: true,
      featured: true,
    },
    {
      sportId: soccer.id,
      stageId: skillBuildingStage.id,
      name: "Attacking Combinations",
      description: "Learn give-and-go, overlap, and third-man runs.",
      totalDurationMinutes: 75,
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
          coachingScript: [
            "When should you start your run?",
            "Where does the return pass go?",
            "How do you time your movement?",
          ],
        },
        {
          name: "Combination Play Circuit",
          type: "technical",
          durationMinutes: 15,
          description: "Three stations: give-and-go, overlap, third-man combination.",
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
      equipmentNeeded: ["Balls", "Cones", "1 full goal", "Pinnies"],
      coachingNotes: `
## Combinations to Teach
1. Give-and-go (wall pass)
2. Overlap run
3. Third-man run

## Coaching Emphasis
- Weight of pass (not too hard!)
- Timing of runs
- Communication
- Quick decision making
      `,
      isDefault: false,
      featured: true,
    },
    {
      sportId: soccer.id,
      stageId: skillBuildingStage.id,
      name: "Defending Principles",
      description: "Learn to defend as individuals and pairs.",
      totalDurationMinutes: 75,
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
          description: "Learn to delay, show attacker one direction, stay goal-side.",
          activitySuggestions: ["1v1-to-goal"],
          coachingScript: [
            "Can you poke the ball away? Or should you delay?",
            "Which direction are you showing the attacker?",
            "What's your body position?",
          ],
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
          description: "Apply defensive principles. Award points for good defensive plays.",
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
      equipmentNeeded: ["Balls", "Cones", "Goals", "Pinnies"],
      coachingNotes: `
## Defensive Principles
1. First defender: pressure, delay, show one way
2. Second defender: cover, communicate, depth
3. Team: compact, organized, goal-side

## Key Questions
- Who is the first defender?
- Where is your cover?
- Are we compact?
      `,
      isDefault: false,
      featured: false,
    },

    // === DEVELOPMENT STAGE (Ages 12-14) ===
    {
      sportId: soccer.id,
      stageId: developmentStage.id,
      name: "Playing Out from the Back",
      description: "Build-up play from goalkeeper through midfield.",
      totalDurationMinutes: 90,
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
          description: "4-3-3 shape vs 3-4 defenders. Build from back, complete passes to 'score'.",
          activitySuggestions: ["positional-rondo"],
          coachingScript: [
            "Where is the space?",
            "When should we switch play?",
            "How do we attract pressure then release it?",
          ],
        },
        {
          name: "GK Distribution Patterns",
          type: "technical",
          durationMinutes: 15,
          description: "Goalkeeper to center backs, full backs, midfielders. Various scenarios.",
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
          description: "Apply build-up principles. Restart with GK when ball goes out.",
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
      equipmentNeeded: ["Balls", "Full field", "Goals", "Pinnies"],
      coachingNotes: `
## Build-Up Principles
1. Create numerical advantage (overloads)
2. Play through lines when possible
3. Switch play to relieve pressure
4. Goalkeeper as extra outfield player

## Formations to Cover
- 4-3-3 vs high press
- 3-2-5 build-up shape
- GK involvement
      `,
      isDefault: true,
      featured: true,
    },
    {
      sportId: soccer.id,
      stageId: developmentStage.id,
      name: "Finishing Session",
      description: "Various shooting and finishing techniques.",
      totalDurationMinutes: 90,
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
          description: "Apply finishing in game. Track shots, goals, shot quality.",
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
      equipmentNeeded: ["Many balls", "Full goals", "Cones", "Pinnies"],
      coachingNotes: `
## Finishing Principles
1. Placement over power (usually)
2. Hit the target - make GK save it
3. Early shot when space allows
4. Composure in the box

## Track These Metrics
- Shots on target %
- First-touch finishes
- Goals from crosses
      `,
      isDefault: false,
      featured: true,
    },
  ];

  // ============================================================
  // BASKETBALL SESSION PLANS
  // ============================================================

  const basketballSessionPlans = [
    // === FUNDAMENTALS STAGE (Ages 6-8) ===
    {
      sportId: basketball.id,
      stageId: fundamentalsStage.id,
      name: "Basketball Basics Fun",
      description: "Introduction to dribbling and passing through fun games.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Dribble Tag",
          type: "warmup",
          durationMinutes: 8,
          description: "Everyone dribbles, 2-3 taggers. Get tagged = toe taps until freed.",
          activitySuggestions: ["dribble-tag"],
        },
        {
          name: "Ball Handling Circuit",
          type: "technical",
          durationMinutes: 10,
          description: "Stationary ball handling: around waist, figure 8, etc.",
          activitySuggestions: ["ball-handling-circuit"],
          coachingScript: [
            "Can you do it without looking?",
            "Fingertips, not palms!",
            "Make the ball dance!",
          ],
        },
        {
          name: "Red Light Green Light Dribble",
          type: "fun",
          durationMinutes: 8,
          description: "Classic game with dribbling.",
          activitySuggestions: ["red-light-green-light-dribble"],
        },
        {
          name: "Passing Partners",
          type: "technical",
          durationMinutes: 10,
          description: "Chest pass, bounce pass basics.",
          activitySuggestions: ["partner-passing"],
          coachingScript: [
            "Step into your pass",
            "Thumbs down on the follow through",
            "Give your partner a target",
          ],
        },
        {
          name: "Knockout",
          type: "fun",
          durationMinutes: 12,
          description: "Classic shooting game. Make your shot before person in front!",
          activitySuggestions: ["knockout"],
        },
        {
          name: "Layup Lines",
          type: "technical",
          durationMinutes: 8,
          description: "Basic layup technique from both sides.",
          activitySuggestions: ["layup-lines"],
        },
        {
          name: "Cool Down",
          type: "cooldown",
          durationMinutes: 4,
          description: "Free throw shooting, stretching.",
          activitySuggestions: ["free-throw-contest"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones", "2 baskets"],
      coachingNotes: `
## Key Principles for Young Players
1. Everyone has a ball
2. Short instructions, lots of activity
3. Praise effort and improvement
4. Make it fun!

## Focus Today
- Dribbling with fingertips
- Eyes up while dribbling
- Basic passing technique
      `,
      isDefault: true,
      featured: true,
    },
    {
      sportId: basketball.id,
      stageId: fundamentalsStage.id,
      name: "Shooting Fundamentals",
      description: "Introduce proper shooting form through fun activities.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Circle Passing",
          type: "warmup",
          durationMinutes: 6,
          description: "Pass around circle, add second ball.",
          activitySuggestions: ["circle-passing"],
        },
        {
          name: "Form Shooting",
          type: "technical",
          durationMinutes: 12,
          description: "BEEF: Balance, Eyes, Elbow, Follow-through. Close to basket.",
          activitySuggestions: ["form-shooting-progression"],
          coachingScript: [
            "Balance - are your feet set?",
            "Eyes - where are you looking?",
            "Elbow - is it tucked in?",
            "Follow-through - snap your wrist like reaching into a cookie jar!",
          ],
        },
        {
          name: "Around the World",
          type: "game",
          durationMinutes: 10,
          description: "Spots around the basket. Make it, move on.",
          activitySuggestions: ["around-the-world"],
        },
        {
          name: "Partner Shooting Game",
          type: "fun",
          durationMinutes: 10,
          description: "Partners compete - one rebounds, one shoots. Switch after 5.",
          activitySuggestions: ["form-shooting-progression"],
        },
        {
          name: "Musical Basketballs",
          type: "fun",
          durationMinutes: 8,
          description: "When music stops, grab a ball and shoot!",
          activitySuggestions: ["musical-basketballs"],
        },
        {
          name: "2v2 Half Court",
          type: "game",
          durationMinutes: 10,
          description: "Apply shooting in game. Celebrate makes!",
          activitySuggestions: ["3v3-half-court"],
        },
        {
          name: "Free Throw Finish",
          type: "cooldown",
          durationMinutes: 4,
          description: "Everyone shoots 5 free throws. Track makes.",
          activitySuggestions: ["free-throw-routine"],
        },
      ],
      equipmentNeeded: ["Balls", "Cones", "Baskets", "Music speaker"],
      coachingNotes: `
## BEEF Shooting Form
- **B**alance: Feet shoulder-width, slight bend in knees
- **E**yes: Focus on back of rim
- **E**lbow: Tucked in, under the ball
- **F**ollow-through: Snap wrist, hold it up

## Common Mistakes
- Pushing the ball (use legs!)
- Elbow out to the side
- Not following through
      `,
      isDefault: false,
      featured: true,
    },

    // === SKILL BUILDING STAGE (Ages 9-11) ===
    {
      sportId: basketball.id,
      stageId: skillBuildingStage.id,
      name: "Ball Handling Development",
      description: "Advanced dribbling moves and using them in games.",
      totalDurationMinutes: 75,
      structure: [
        {
          name: "Dynamic Warmup",
          type: "warmup",
          durationMinutes: 8,
          description: "Jog with ball handling moves.",
          activitySuggestions: ["dynamic-stretching-lines"],
        },
        {
          name: "Pound Dribble Series",
          type: "technical",
          durationMinutes: 12,
          description: "Hard, low dribbles. Build strength and control.",
          activitySuggestions: ["pound-dribble-series"],
        },
        {
          name: "Four Corners Dribbling",
          type: "technical",
          durationMinutes: 10,
          description: "Different moves at each corner.",
          activitySuggestions: ["four-corners-dribbling"],
        },
        {
          name: "1v1 from Triple Threat",
          type: "tactical",
          durationMinutes: 12,
          description: "Use moves to beat defender one-on-one.",
          activitySuggestions: ["1v1-from-wing"],
        },
        {
          name: "King of the Court",
          type: "game",
          durationMinutes: 12,
          description: "Competitive 1v1. Winners stay.",
          activitySuggestions: ["king-of-the-court-basketball"],
        },
        {
          name: "3v3 Half Court",
          type: "game",
          durationMinutes: 15,
          description: "Apply moves in team setting.",
          activitySuggestions: ["3v3-half-court"],
        },
        {
          name: "Free Throw Cooldown",
          type: "cooldown",
          durationMinutes: 6,
          description: "Shoot free throws, stretch.",
          activitySuggestions: ["free-throw-routine"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones", "Baskets"],
      coachingNotes: `
## Ball Handling Priorities
1. Protect the ball
2. Keep it low (knee height)
3. Eyes up
4. Use both hands equally

## Moves to Develop
- Crossover
- Between the legs
- Behind the back
- Hesitation
      `,
      isDefault: true,
      featured: true,
    },
    {
      sportId: basketball.id,
      stageId: skillBuildingStage.id,
      name: "Team Offense Basics",
      description: "Introduction to motion offense concepts.",
      totalDurationMinutes: 75,
      structure: [
        {
          name: "Passing Partner Warmup",
          type: "warmup",
          durationMinutes: 6,
          description: "Moving while passing with partner.",
          activitySuggestions: ["passing-partner-warmup"],
        },
        {
          name: "Catch and Face",
          type: "technical",
          durationMinutes: 10,
          description: "V-cut, catch, face basket in triple threat.",
          activitySuggestions: ["catch-and-face"],
        },
        {
          name: "Pick and Roll Basics",
          type: "tactical",
          durationMinutes: 15,
          description: "Set screen, roll to basket, read defense.",
          activitySuggestions: ["pick-and-roll-basics"],
        },
        {
          name: "Motion Offense Basics",
          type: "tactical",
          durationMinutes: 15,
          description: "Pass and cut, fill behind, screen away.",
          activitySuggestions: ["motion-offense-basics"],
        },
        {
          name: "5v5 with Constraints",
          type: "game",
          durationMinutes: 18,
          description: "Must make 3 passes before shooting.",
          activitySuggestions: ["5v5-with-constraints"],
        },
        {
          name: "Team Stretching",
          type: "cooldown",
          durationMinutes: 6,
          description: "Team stretching circle.",
          activitySuggestions: ["team-stretching-circle"],
        },
      ],
      equipmentNeeded: ["Balls", "Court", "Pinnies"],
      coachingNotes: `
## Motion Offense Rules
1. Pass and cut (basket or away)
2. Fill behind the cutter
3. Screen away after passing
4. Read the defense

## Key Teaching Points
- Spacing is everything
- Cut hard, screen hard
- Move with purpose (not wandering)
      `,
      isDefault: false,
      featured: true,
    },
    {
      sportId: basketball.id,
      stageId: skillBuildingStage.id,
      name: "Defense Development",
      description: "Learn individual and team defensive principles.",
      totalDurationMinutes: 75,
      structure: [
        {
          name: "Defensive Slides Warmup",
          type: "warmup",
          durationMinutes: 8,
          description: "Slide patterns, closeouts.",
          activitySuggestions: ["defensive-slides-conditioning"],
        },
        {
          name: "Defensive Slide Course",
          type: "technical",
          durationMinutes: 10,
          description: "Zigzag slides through cones.",
          activitySuggestions: ["defensive-slide-course"],
        },
        {
          name: "Shell Defense",
          type: "tactical",
          durationMinutes: 15,
          description: "4 defenders, 4 offensive. Focus on help and recover.",
          activitySuggestions: ["shell-defense"],
        },
        {
          name: "Help Defense Drill",
          type: "tactical",
          durationMinutes: 12,
          description: "3v3 help and rotate.",
          activitySuggestions: ["help-defense-drill"],
        },
        {
          name: "Box Out and Rebound",
          type: "tactical",
          durationMinutes: 10,
          description: "Defensive rebounding technique.",
          activitySuggestions: ["box-out-and-rebound"],
        },
        {
          name: "5v5 Defense Focus",
          type: "game",
          durationMinutes: 14,
          description: "Award points for stops, steals, rebounds.",
          activitySuggestions: ["5v5-with-constraints"],
        },
        {
          name: "Cool Down",
          type: "cooldown",
          durationMinutes: 6,
          description: "Light shooting, stretching.",
          activitySuggestions: ["team-stretching-circle"],
        },
      ],
      equipmentNeeded: ["Balls", "Court", "Pinnies"],
      coachingNotes: `
## Defensive Principles
1. Stay low, stay active
2. Ball-you-man positioning
3. Help and recover
4. Communicate!

## Key Phrases
- "Ball!" (I'm on ball)
- "Help!" (I'm in help position)
- "Screen left/right!"
- "Box out!"
      `,
      isDefault: false,
      featured: false,
    },

    // === DEVELOPMENT STAGE (Ages 12-14) ===
    {
      sportId: basketball.id,
      stageId: developmentStage.id,
      name: "Transition Offense",
      description: "Fast break and early offense concepts.",
      totalDurationMinutes: 90,
      structure: [
        {
          name: "Full Court Layups",
          type: "warmup",
          durationMinutes: 8,
          description: "Continuous layup drill for conditioning and warm up.",
          activitySuggestions: ["full-court-layups"],
        },
        {
          name: "Outlet Pass Drill",
          type: "technical",
          durationMinutes: 10,
          description: "Rebound, outlet, run the floor.",
          activitySuggestions: ["outlet-pass-drill"],
        },
        {
          name: "2v1 Fast Break",
          type: "tactical",
          durationMinutes: 12,
          description: "Convert 2v1 advantages.",
          activitySuggestions: ["2v1-fast-break"],
        },
        {
          name: "3v2 Continuous",
          type: "tactical",
          durationMinutes: 15,
          description: "3v2 to 2v1 back. Non-stop action.",
          activitySuggestions: ["2v1-fast-break"],
        },
        {
          name: "5v5 Transition",
          type: "game",
          durationMinutes: 20,
          description: "Full court 5v5. Emphasize running on makes and misses.",
          activitySuggestions: ["5v5-with-constraints"],
        },
        {
          name: "Free Throws Under Fatigue",
          type: "conditioning",
          durationMinutes: 10,
          description: "Sprint, shoot 2 free throws, repeat.",
          activitySuggestions: ["free-throw-routine"],
        },
        {
          name: "Stretch",
          type: "cooldown",
          durationMinutes: 8,
          description: "Full body stretching.",
          activitySuggestions: ["team-stretching-circle"],
        },
      ],
      equipmentNeeded: ["Balls", "Full court"],
      coachingNotes: `
## Fast Break Principles
1. Outlet to sideline
2. Fill the lanes (wide)
3. Ball in the middle
4. Attack before defense sets

## Numbers Advantage
- 2v1: Make the easy pass
- 3v2: Attack the gap
- 4v3: Find the open man
      `,
      isDefault: true,
      featured: true,
    },
    {
      sportId: basketball.id,
      stageId: developmentStage.id,
      name: "Advanced Shooting",
      description: "Game-like shooting situations and shot selection.",
      totalDurationMinutes: 90,
      structure: [
        {
          name: "Form Shooting Review",
          type: "warmup",
          durationMinutes: 8,
          description: "Close range form shooting to warm up.",
          activitySuggestions: ["form-shooting-progression"],
        },
        {
          name: "Spot Up Shooting",
          type: "technical",
          durationMinutes: 12,
          description: "Catch and shoot from 5 spots.",
          activitySuggestions: ["spot-up-shooting"],
        },
        {
          name: "Elbow Shooting",
          type: "technical",
          durationMinutes: 10,
          description: "Mid-range from elbows with pull-ups.",
          activitySuggestions: ["elbow-shooting"],
        },
        {
          name: "Coming Off Screens",
          type: "tactical",
          durationMinutes: 15,
          description: "Curl, fade, straight cut off screens.",
          activitySuggestions: ["spot-up-shooting"],
        },
        {
          name: "Hot Shot Challenge",
          type: "game",
          durationMinutes: 10,
          description: "Timed shooting from multiple spots.",
          activitySuggestions: ["hot-shot-challenge"],
        },
        {
          name: "5v5 Shooting Focus",
          type: "game",
          durationMinutes: 20,
          description: "Full game. Track shot selection and makes.",
          activitySuggestions: ["5v5-with-constraints"],
        },
        {
          name: "Free Throw Finish",
          type: "cooldown",
          durationMinutes: 8,
          description: "25 team free throws. Must make 17.",
          activitySuggestions: ["free-throw-routine"],
        },
      ],
      equipmentNeeded: ["Balls", "Baskets", "Cones"],
      coachingNotes: `
## Shot Selection Principles
1. Good shot = open, in rhythm, in range
2. Great shots beat good shots
3. Don't shoot falling away (unless designed)
4. Know your range

## Track These Numbers
- Shot attempts by zone
- Make percentage by zone
- Assisted vs unassisted
      `,
      isDefault: false,
      featured: true,
    },
  ];

  // Insert all session plans
  const allPlans = [...soccerSessionPlans, ...basketballSessionPlans];

  for (const plan of allPlans) {
    try {
      await getDb().insert(practiceTemplates).values(plan).onConflictDoNothing();
      console.log(`  ✓ ${plan.name}`);
    } catch (error) {
      console.error(`  ✗ Error inserting ${plan.name}:`, error);
    }
  }

  console.log(`Seeded ${allPlans.length} session plan templates`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedSessionPlanLibrary()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

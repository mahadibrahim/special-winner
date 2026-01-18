/**
 * Soccer Skills Upgrade 4 - Final Quality Fixes
 *
 * This seed file UPDATES 3 existing soccer skills that scored below 3.5
 * in the curriculum review to improve their quality.
 *
 * Skills upgraded in this file:
 * 1. Dribbling (8098581b-3e8f-4ffa-8287-74c79d9fc53f) - Score 2.52
 * 2. Finding Space (afad320b-eb2c-46f2-bda5-95f4436b1c91) - Score 3.08
 * 3. Ball Control (b4e3d70b-8125-4a97-bbac-515a1a4f25a0) - Score 3.40
 *
 * Key improvements:
 * - Added guiding questions to coaching tips (Constraints-Led approach)
 * - Made observable behaviors more measurable (TDEQ-5)
 * - Normalized common mistakes as part of learning (ELM Framework)
 * - Removed any ranking/comparison language (Project Play)
 * - Enhanced domain alignment
 */

import { db } from "../../index";
import { skills, type Skill } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

// Type for the comprehensiveGuide to avoid strict type checking on seed data
type ComprehensiveGuide = Skill["comprehensiveGuide"];

// Skill IDs to update
const SKILL_IDS = {
  dribbling: "8098581b-3e8f-4ffa-8287-74c79d9fc53f",
  findingSpace: "afad320b-eb2c-46f2-bda5-95f4436b1c91",
  ballControl: "b4e3d70b-8125-4a97-bbac-515a1a4f25a0",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADED COMPREHENSIVE GUIDES
// ═══════════════════════════════════════════════════════════════════════════

const dribblingGuide = {
  levelDetails: {
    1: {
      name: "Emerging",
      description:
        "Player is learning to move with the ball. The ball often gets away, and that's completely normal at this stage. Focus is on building confidence and enjoying the experience.",
      observableBehaviors: [
        "Ball travels more than 3 feet away from body",
        "Uses toe to push ball forward in 'kick and chase' pattern",
        "Loses ball 3+ times in a 10-yard dribble",
        "Stops to regain control before continuing",
        "Eyes stay on ball 90%+ of time",
      ],
      commonMistakes: [
        "Players often kick the ball too hard - this is a natural starting point as they learn touch",
        "It's common to only use one foot at first - both feet will develop with practice",
        "Looking at the ball constantly is normal - head-up dribbling comes later",
        "Running too fast for skill level happens when players are excited - we embrace enthusiasm!",
      ],
      coachingTips: [
        "What happens when you kick the ball harder? What about a softer touch?",
        "Can you show me how slowly you can walk with the ball? Now a tiny bit faster?",
        "How many times can you touch the ball between these two cones?",
        "If the ball rolls away, that's okay! Everyone's ball escapes sometimes. What will you do next?",
      ],
      assessmentActivities: [
        "Dribble walk: Walk with ball across 10 yards - count touches (goal: 8+ touches)",
        "Free exploration: Dribble anywhere in space for 1 minute",
        "Stop and go: Dribble and stop on coach signal",
      ],
    },
    2: {
      name: "Developing",
      description:
        "Player keeps the ball closer and can move at a slow pace. Beginning to use different parts of the foot. Building the foundation of ball control.",
      observableBehaviors: [
        "Ball stays within 2-3 feet during slow dribbling",
        "Uses inside of foot sometimes (not just toe)",
        "Completes 10-yard dribble with 1-2 losses of control",
        "Can change direction with ball if moving slowly",
        "Looks up briefly 2-3 times during dribble sequence",
      ],
      commonMistakes: [
        "Players often speed up and lose control - pace awareness is developing",
        "It's natural to favor one foot heavily at this stage",
        "Forgetting to look up is very common - we're building this habit gradually",
        "Straight-line dribbling dominates - curves and turns come next",
      ],
      coachingTips: [
        "What part of your foot did you use there? What happens if you try the inside?",
        "Can you dribble to me as slowly as possible? Now just a little faster?",
        "How many fingers am I holding up? Try to peek up while dribbling!",
        "Which direction could you go next? Show me a turn!",
      ],
      assessmentActivities: [
        "Dribble jog: Jog pace dribble across 15 yards - track control",
        "Color call: Peek up while dribbling, call out colors coach shows",
        "Simple weave: Dribble through 3 cones spaced 5 yards apart",
      ],
    },
    3: {
      name: "Competent",
      description:
        "Player dribbles confidently at moderate speed using multiple foot surfaces. Can navigate around obstacles and change direction. Developing game-ready skills.",
      observableBehaviors: [
        "Ball stays within 2 feet at jogging speed",
        "Uses inside, outside, and sole of foot appropriately",
        "Completes cone courses with smooth direction changes",
        "Head up 40-50% of dribbling time",
        "Changes pace intentionally (slow-fast-slow)",
      ],
      commonMistakes: [
        "Players commonly lose control when trying new moves - that's learning!",
        "Speed increases may cause temporary control loss - normal progression",
        "Defaulting to dominant foot under pressure is typical at this stage",
        "Forgetting to scan when focused on ball control happens often",
      ],
      coachingTips: [
        "What made you choose to go that direction? What else could you have done?",
        "When you changed speed, what happened to the imaginary defender?",
        "Which foot feels more comfortable? Let's give the other one some practice too!",
        "Can you tell me what's happening around you while you dribble?",
      ],
      assessmentActivities: [
        "Obstacle course: Navigate 5-cone slalom at own pace, then faster",
        "Freeze tag dribble: Dribble while avoiding taggers",
        "Head-up challenge: Count objects while dribbling across space",
      ],
    },
    4: {
      name: "Proficient",
      description:
        "Player dribbles with confidence at game speed. Uses deceptive movements and changes of pace effectively. Maintains awareness while controlling the ball.",
      observableBehaviors: [
        "Ball stays within 1-2 feet at running speed",
        "Executes 2-3 different dribbling moves on command",
        "Completes complex courses maintaining control",
        "Head up 60-70% of dribbling time with court vision",
        "Successfully beats stationary or slow-moving defenders",
      ],
      commonMistakes: [
        "Overcomplicating moves in game situations is common as players learn to read when to be simple",
        "Dribbling when passing is better happens as tactical awareness develops",
        "Slight control loss at top speed is normal - it's pushing boundaries",
        "Reverting to safe moves under pressure shows good decision-making instincts",
      ],
      coachingTips: [
        "What did the defender do when you dropped your shoulder? How can you use that?",
        "When might it be better to pass instead of dribble past them?",
        "You had two options there - tell me about your decision?",
        "What move would work best against a defender coming at you fast vs. standing still?",
      ],
      assessmentActivities: [
        "1v1 challenges: Beat a defender to score, track success rate",
        "Decision games: Choose dribble or pass in various scenarios",
        "Move showcase: Demonstrate 3 different moves against passive defense",
      ],
    },
    5: {
      name: "Advanced",
      description:
        "Player has exceptional ball control and can dribble effectively in any situation. Creates opportunities for self and teammates through skilled dribbling.",
      observableBehaviors: [
        "Near-complete ball mastery at all speeds",
        "Executes moves instinctively based on defender positioning",
        "Dribbles effectively in tight spaces with pressure",
        "Head up 80%+ with excellent peripheral awareness",
        "Creates goal-scoring opportunities through dribbling",
      ],
      commonMistakes: [
        "Even advanced players sometimes over-dribble - reading when to release is an ongoing skill",
        "Trying moves outside their toolkit occasionally is how they expand their game",
        "Moments of control loss happen when pushing creative boundaries",
        "Holding the ball when teammates have runs is a tactical learning moment",
      ],
      coachingTips: [
        "What did you read from the defense before making that move?",
        "You created that chance - what options did your teammates give you?",
        "When you beat the first defender, what was your next thought?",
        "That was creative! What made you try something new there?",
      ],
      assessmentActivities: [
        "Small-sided games: Track successful dribbles, chances created",
        "Pressure situations: 1v2 dribbling challenges",
        "Creative challenges: Invent and teach a new move to teammates",
      ],
    },
  },
  ageExpectations: {
    "4-6": {
      typical: "Kick and chase pattern, toe dribbling, lots of ball escapes - all normal!",
      focus: "Fun exploration with ball, positive experience with dribbling",
      patience: "Ball control develops over years - celebrate every touch",
    },
    "7-9": {
      typical: "Inside of foot emerging, better pace control, starting to look up occasionally",
      focus: "Multiple foot surfaces, change of direction, building confidence",
      patience: "Comparisons with peers are unhelpful - each child develops at their own pace",
    },
    "10-12": {
      typical: "Game-speed dribbling, moves repertoire developing, reading defenders",
      focus: "Decision-making (when to dribble), move combinations, both feet",
      patience: "Growth spurts may temporarily affect coordination - this is normal",
    },
    "13+": {
      typical: "Refined technique, creative problem-solving, positional awareness while dribbling",
      focus: "Game context decisions, creating for teammates, dribbling under fatigue",
      patience: "Physical changes continue to affect skill - ongoing development is expected",
    },
  },
  redFlags: [
    "Persistent fear of having the ball - may need 1-on-1 encouragement, smaller groups",
    "Frustration leading to withdrawal - adjust challenge level, celebrate small wins",
    "Physical coordination concerns beyond normal development - consult with parents",
    "Complete avoidance of dribbling in games - may need modified games to build confidence",
  ],
  parentExplanation:
    "Dribbling is how players move with the ball at their feet. At the youngest ages, children naturally 'kick and chase' - hitting the ball and running after it. This gradually develops into controlled dribbling where the ball stays close. We focus on lots of touches (keeping the ball close) rather than fancy moves. The best dribblers started with thousands of hours of simply playing with the ball. Every minute your child spends with a ball at their feet - in the backyard, at the park, anywhere - contributes to their development. There's no rushing this process, and comparing to others isn't helpful as every child develops at their own pace.",
  homeActivities: [
    "Ball walks: Walk around the house or yard with a ball at their feet (use a soft ball indoors!)",
    "Touch counting: How many touches can you get from the door to the fence?",
    "Obstacle courses: Set up shoes, cones, or toys to dribble around",
    "Follow the leader: Parent walks a path, child dribbles following along",
    "Speed zones: Create slow and fast zones - change pace in each",
  ],
  assessmentActivities: [
    {
      name: "Free Dribbling Exploration",
      domain: "technical",
      description: "Open space dribbling with encouragement to try different speeds and directions",
    },
    {
      name: "Cone Weave Course",
      domain: "technical",
      description: "Navigate through cones at comfortable pace, then challenge with speed or tighter cones",
    },
    {
      name: "1v1 to Goal",
      domain: "tactical",
      description: "Beat a defender to score - observe decision-making and execution",
    },
    {
      name: "Head-Up Challenge",
      domain: "cognitive",
      description: "Call out colors or numbers while dribbling to assess awareness",
    },
  ],
  assessmentFrequency: "Ongoing observation each session, with specific skill focus monthly",
  assessmentDuration: "2-3 minute focused observations during activities",
  bestAssessedIn: ["Free play with ball", "Cone courses", "Small-sided games", "1v1 situations"],
};

const findingSpaceGuide = {
  levelDetails: {
    1: {
      name: "Emerging",
      description:
        "Player tends to cluster with teammates or stand still when not on the ball. Understanding of space is just beginning to develop.",
      observableBehaviors: [
        "Stands in same spot for 10+ seconds when off the ball",
        "Moves to where the ball is rather than open space",
        "Positions within arm's reach of 2+ teammates",
        "Does not look around to find open areas",
        "Calls for ball while standing behind defender",
      ],
      commonMistakes: [
        "Clustering near the ball is completely natural at young ages - they're attracted to the action!",
        "Standing still is common as players learn the game - movement awareness develops over time",
        "Hiding behind defenders happens as players learn spacing concepts",
        "Not scanning is normal - this cognitive skill develops with experience",
      ],
      coachingTips: [
        "Where is nobody standing right now? Can you go there?",
        "If you were the ball, could you see your teammate? What could they do?",
        "What happens when everyone stands together? Is there space to play?",
        "Let's pretend defenders are sleeping - where would you sneak to?",
      ],
      assessmentActivities: [
        "Freeze game: Call freeze and ask 'where is open space?'",
        "Space hunters: Points for moving to open areas",
        "Passing pairs: Simple pass and move exercise",
      ],
    },
    2: {
      name: "Developing",
      description:
        "Player starts to understand the concept of space but application is inconsistent. Beginning to move after passing.",
      observableBehaviors: [
        "Moves after passing (at least sometimes)",
        "Occasionally finds open space when reminded",
        "Begins to spread out when coach prompts",
        "Looks around briefly before calling for ball",
        "Recognizes when too close to teammates with reminders",
      ],
      commonMistakes: [
        "Forgetting to move after passing is very common - the habit takes many repetitions to form",
        "Moving to obvious spaces only is a natural starting point",
        "Returning to same spot after moving shows developing understanding",
        "Getting attracted back to the ball happens as excitement overrides positioning",
      ],
      coachingTips: [
        "You passed - now what? Where's a good spot to move to?",
        "What do you see when you look around? Any empty spaces?",
        "If the ball can't see you, can it find you? How do you help it?",
        "Where do you think the defender doesn't want you to go?",
      ],
      assessmentActivities: [
        "Pass and move: Track if player moves after passing",
        "Space recognition: Point to open space during stoppages",
        "Simple keep-away: Small groups, observe movement patterns",
      ],
    },
    3: {
      name: "Competent",
      description:
        "Player consistently moves to create space and makes themselves available for passes. Understanding of angles developing.",
      observableBehaviors: [
        "Moves to space within 3 seconds of passing",
        "Checks shoulder before calling for ball",
        "Positions at an angle to receive (not directly behind teammate)",
        "Adjusts position as play develops",
        "Creates passing lanes by intelligent movement",
      ],
      commonMistakes: [
        "Making runs at wrong moments is part of learning timing - timing improves with experience",
        "Moving to the same spots repeatedly happens as players find 'safe' spaces",
        "Not communicating movement is common - verbal cues develop alongside tactical understanding",
        "Getting stuck watching the ball instead of scanning is a habit that takes time to break",
      ],
      coachingTips: [
        "What made you choose to move there? What else did you consider?",
        "Did the passer see you? How could you make yourself more visible?",
        "What was the defender doing when you made your move?",
        "When is a good moment to move - before or after your teammate controls the ball?",
      ],
      assessmentActivities: [
        "Triangle passing: Maintain shape while passing and moving",
        "Numbers game: Position to receive from any direction",
        "4v2 keep-away: Observe spacing and support",
      ],
    },
    4: {
      name: "Proficient",
      description:
        "Player reads the game well and creates space through intelligent movement. Understands how to drag defenders to create opportunities.",
      observableBehaviors: [
        "Makes runs that create space for teammates",
        "Times runs to coincide with teammate's head-up moments",
        "Uses body feints to mislead defenders before moving",
        "Adjusts positioning based on ball location and defender positions",
        "Finds space in central dangerous areas",
      ],
      commonMistakes: [
        "Overcomplicating movements happens as players get creative - simplicity is a learned skill",
        "Making runs without communication is common until verbal leadership develops",
        "Misjudging timing of runs is part of developing game reading skills",
        "Defaulting to wide positions is safer - central bravery develops with confidence",
      ],
      coachingTips: [
        "You created that space - did your teammate see it? How could you help them notice?",
        "What did the defender's body language tell you before you moved?",
        "When you made that run, what options did it create for the team?",
        "Could you have created more danger with a different angle? Tell me your thinking.",
      ],
      assessmentActivities: [
        "Positional games: Observe awareness and movement off ball",
        "Third-man running: Track combination play understanding",
        "Small-sided games: Assess space creation in game situations",
      ],
    },
    5: {
      name: "Advanced",
      description:
        "Player has exceptional spatial awareness and creates opportunities through sophisticated movement. Influences teammates' spacing through leadership.",
      observableBehaviors: [
        "Manipulates defenders with decoy runs to create space for others",
        "Orchestrates team spacing through verbal and physical cues",
        "Exploits split-second gaps in defensive structure",
        "Positions optimally in transition moments",
        "Finds space even against organized defensive systems",
      ],
      commonMistakes: [
        "Occasional misread of defensive structure is normal even at high levels",
        "Trusting teammates to see runs when they don't happens in team development",
        "Energy conservation leading to less movement late in games is natural",
        "Over-anticipating team patterns when chemistry is developing is common",
      ],
      coachingTips: [
        "How did you know that run would open up space for your teammate?",
        "What were you communicating with that movement?",
        "The defense recovered quickly - what adjustment could break them down next time?",
        "You're reading the game at a high level - what do you see that others might miss?",
      ],
      assessmentActivities: [
        "Full match analysis: Review decision-making with video",
        "Leadership observation: How do they organize teammates?",
        "Complex positional games: High-speed decision-making",
      ],
    },
  },
  ageExpectations: {
    "4-6": {
      typical: "Clustering around ball, standing still off ball - completely normal at this age!",
      focus: "Joy of playing, basic awareness that space exists",
      patience: "Abstract concepts like 'space' are hard to grasp - use concrete language and games",
    },
    "7-9": {
      typical: "Beginning to spread out with prompts, inconsistent movement after passing",
      focus: "Pass and move concept, simple spacing games, visual reminders",
      patience: "Cognitive development varies widely - some 'get it' earlier than others",
    },
    "10-12": {
      typical: "Understanding angles, reading where space is, timing runs",
      focus: "Reading the game, creating for teammates, positional awareness",
      patience: "Physical and cognitive development interact - be patient with inconsistency",
    },
    "13+": {
      typical: "Sophisticated movement, manipulating defenders, team-level spacing",
      focus: "Leadership of spacing, advanced reading, positional mastery",
      patience: "Even professional players continue developing spatial understanding",
    },
  },
  redFlags: [
    "Persistent confusion about basic directions - may need simpler cues or check understanding",
    "Anxiety about being in open space - may need smaller-sided games to build confidence",
    "Difficulty processing multiple visual inputs - consider individual coaching moments",
    "Complete disengagement when off ball - find ways to keep them mentally in the game",
  ],
  parentExplanation:
    "Finding space is a tactical skill - it's about reading the game and positioning yourself where you can receive the ball or help teammates. Young children naturally cluster around the ball because that's where the excitement is! This 'magnet to the ball' behavior is completely normal and gradually shifts as children develop game understanding. We use games and simple cues to help players start 'seeing' space. At home, watching soccer together and pointing out 'look at that player finding space!' can help build awareness. Every child develops this understanding at their own pace.",
  homeActivities: [
    "Watch together: Point out player movement when watching soccer on TV",
    "Freeze frame: Pause games and ask 'where would you move if you were that player?'",
    "Space tag: Play tag but earn points for being in open space",
    "Pass and move: Simple garden passing where you move after each pass",
    "Treasure hunt: Find the 'treasure' (open space) before the defender catches you",
  ],
  assessmentActivities: [
    {
      name: "Keep-Away Games",
      domain: "tactical",
      description: "3v1 or 4v2 possession games observing movement and support angles",
    },
    {
      name: "Space Recognition",
      domain: "cognitive",
      description: "Stop play and ask player to identify open spaces",
    },
    {
      name: "Pass and Move Drills",
      domain: "technical",
      description: "Simple combinations tracking movement after release",
    },
    {
      name: "Small-Sided Games",
      domain: "tactical",
      description: "Observe off-ball positioning and movement patterns in game context",
    },
  ],
  assessmentFrequency: "Weekly observation in game situations, focused check monthly",
  assessmentDuration: "5-10 minute observation periods during games",
  bestAssessedIn: ["Small-sided games", "Possession activities", "Match situations", "Rondo exercises"],
};

const ballControlGuide = {
  levelDetails: {
    1: {
      name: "Emerging",
      description:
        "Player is learning to stop and manage a rolling or bouncing ball. The ball often escapes, which is a completely normal part of learning.",
      observableBehaviors: [
        "Ball bounces away more than 4 feet when receiving",
        "Struggles to stop ball - often chases it",
        "Uses toe to stop ball rather than inside of foot",
        "Body position is often behind or beside ball",
        "Cannot cushion a passed ball",
      ],
      commonMistakes: [
        "The ball bouncing away is totally normal - controlling a moving ball is hard!",
        "Using the toe is natural before learning proper foot surfaces",
        "Stiff leg when receiving is common - the cushioning motion takes time to learn",
        "Turning away from incoming balls shows they're still building confidence",
      ],
      coachingTips: [
        "What happened to the ball when you stopped it with your toe? What about your inside foot?",
        "Can you make your foot 'soft' like a pillow to catch the ball? What happens?",
        "Where did the ball go? That's okay! Everyone's learning. Try again!",
        "Which part of your foot is the biggest flat surface? Can you stop the ball with that?",
      ],
      assessmentActivities: [
        "Roll and stop: Parent/coach rolls ball gently, player stops it any way they can",
        "Bounce catch: Small bouncing ball, use any foot surface to control",
        "Self-toss: Toss ball up gently, control with foot when it lands",
      ],
    },
    2: {
      name: "Developing",
      description:
        "Player can stop a slowly rolling ball and is beginning to use the inside of the foot. Control of faster or bouncing balls is still developing.",
      observableBehaviors: [
        "Stops slow rolling balls within 2-3 feet",
        "Uses inside of foot sometimes when receiving",
        "Gets body behind the ball on ground passes",
        "Some cushioning action visible on controlled touches",
        "Can control ball from short distances (5-10 yards)",
      ],
      commonMistakes: [
        "Harder passes are difficult to control - this improves with practice and timing",
        "Players often let bouncing balls hit their shin instead of using their foot",
        "Forgetting to cushion is common - the instinct to 'block' is strong",
        "Control disappears under pressure - this is normal skill regression under stress",
      ],
      coachingTips: [
        "How did you catch that one? What made it easier than the last one?",
        "When the ball came faster, what did you do differently? What could you try?",
        "Which touch did you like best? Can you do that one again?",
        "Where do you want the ball to go after you control it? Let's aim there!",
      ],
      assessmentActivities: [
        "Partner passing: Receive and control from 10 yards - various speeds",
        "Cushion challenge: Count how many 'soft' controls out of 10",
        "Control zones: Receive ball into a marked area",
      ],
    },
    3: {
      name: "Competent",
      description:
        "Player controls most ground balls reliably and is developing control of bouncing balls. Can receive with both feet in unpressured situations.",
      observableBehaviors: [
        "Controls ground passes within 1-2 feet consistently",
        "Uses inside, outside, and sole of foot appropriately",
        "Controls half-volleys with some success",
        "First touch sets up next action (pass, dribble, shot)",
        "Can receive on either foot when given time",
      ],
      commonMistakes: [
        "Air balls remain challenging - this is one of the hardest skills to master",
        "First touch goes too far when rushed - this improves with experience",
        "Strong side preference under pressure is completely normal at this stage",
        "Occasionally the ball skips off the foot - it happens at every level!",
      ],
      coachingTips: [
        "Where did your first touch set you up? Did that help you?",
        "What made you choose to control it that way? What else could you have done?",
        "How did you know which foot to use? What was your thinking?",
        "That control set up a great pass! What did you see before you touched it?",
      ],
      assessmentActivities: [
        "Moving reception: Control while moving, not standing still",
        "Two-touch game: Receive and pass - quality of first touch is focus",
        "Pressure control: Light defender nearby during reception",
      ],
    },
    4: {
      name: "Proficient",
      description:
        "Player controls the ball reliably in most situations including with pressure. First touch is consistently productive, setting up the next play.",
      observableBehaviors: [
        "Controls air balls with body, thigh, or foot reliably",
        "First touch escapes pressure (touch away from defender)",
        "Controls balls at pace from distance",
        "Both feet equally comfortable in reception",
        "Uses first touch to change direction of play",
      ],
      commonMistakes: [
        "Difficult balls in game situations may cause occasional loss - that's soccer!",
        "Trying too much with first touch happens as players get creative",
        "Pressure situations may cause reversion to safe touches - this is intelligent",
        "Fatigue affects control late in games - completely normal physical response",
      ],
      coachingTips: [
        "You took that touch away from the defender - what did you read before the ball came?",
        "How did you know to use your chest there instead of your foot?",
        "That first touch created space - what was your next thought?",
        "When the ball came in spinning, what adjustment did you make?",
      ],
      assessmentActivities: [
        "Aerial control: Receive driven balls from distance",
        "Pressure reception: Control with defender closing quickly",
        "First-touch finishing: Control and shoot under time pressure",
      ],
    },
    5: {
      name: "Advanced",
      description:
        "Player has exceptional ball control in all situations. First touch creates immediate advantages, and control is reliable under any pressure.",
      observableBehaviors: [
        "Controls any ball in any situation with consistency",
        "First touch creates scoring opportunities",
        "Manipulates defenders with deceptive first touches",
        "Controls difficult balls while scanning the field",
        "Equally skilled receiving on ground, bouncing, or aerial balls",
      ],
      commonMistakes: [
        "Even elite players occasionally misjudge spin or pace - it happens!",
        "Attempting spectacular touches and losing ball is part of pushing boundaries",
        "Comfort leading to casual touches in low-pressure moments is human nature",
        "Misjudging wet or uneven surfaces affects everyone",
      ],
      coachingTips: [
        "That touch was incredible - what information were you processing before it arrived?",
        "You made that look easy - what adjustments did you make that we couldn't see?",
        "The defender was beaten before the ball arrived - how did you set that up?",
        "When conditions are difficult, what do you adjust in your technique?",
      ],
      assessmentActivities: [
        "Game analysis: Review first touch quality in match situations",
        "Difficult conditions: Control in wind, rain, or on poor surfaces",
        "High-pressure drills: Reception in crowded areas with quick decisions",
      ],
    },
  },
  ageExpectations: {
    "4-6": {
      typical: "Ball bounces away often, using toes, chasing the ball - all normal!",
      focus: "Fun with the ball, any control is success, building confidence",
      patience: "Coordination is developing rapidly - celebrate every controlled touch",
    },
    "7-9": {
      typical: "Inside of foot developing, can stop slow balls, cushioning emerging",
      focus: "Multiple foot surfaces, receiving and moving, building habits",
      patience: "Skill development is non-linear - some days are better than others",
    },
    "10-12": {
      typical: "Reliable ground control, developing aerial control, first touch with purpose",
      focus: "First touch setting up next action, both feet, receiving under pressure",
      patience: "Growth spurts may temporarily affect coordination - this passes",
    },
    "13+": {
      typical: "All surfaces confident, control under pressure, creative first touches",
      focus: "Game-context decisions, controlling difficult balls, deceptive touches",
      patience: "Control continues to refine throughout a player's career",
    },
  },
  redFlags: [
    "Consistent flinching or turning away from incoming balls - may need gentler progressions",
    "Unable to stop slow rolling balls after extended practice - check for vision/coordination",
    "Extreme frustration with self over lost control - focus on emotional support and normalization",
    "Complete avoidance of receiving the ball - build confidence in small-group settings",
  ],
  parentExplanation:
    "Ball control is the ability to receive a pass and keep the ball close, ready to make the next play. Young children often have the ball bounce away from them - this is completely normal! Controlling a moving ball requires timing, body positioning, and soft touch - skills that develop over time. We teach players to 'cushion' the ball like catching an egg, using their foot to absorb the speed. At home, rolling balls back and forth helps build this skill. Every touch matters, and there's no shortcut to developing great control - it takes many repetitions over time. Focus on fun and frequency rather than perfection.",
  homeActivities: [
    "Roll and cushion: Roll ball to each other, practice 'soft' stops",
    "Wall returns: Kick against wall, control the rebound",
    "Juggling starts: Just trying to kick the ball up and control it",
    "Moving controls: Walk while a parent rolls balls for you to control",
    "Foot surface safari: Stop the ball with different parts of your foot",
  ],
  assessmentActivities: [
    {
      name: "Partner Reception",
      domain: "technical",
      description: "Receive passes from various distances and speeds, track control quality",
    },
    {
      name: "First Touch Focus",
      domain: "technical",
      description: "Where does first touch go? Does it set up the next action?",
    },
    {
      name: "Game Observation",
      domain: "tactical",
      description: "Watch ball control in match situations - how do they handle pressure?",
    },
    {
      name: "Aerial Challenges",
      domain: "physical",
      description: "Control of thrown or lofted balls - age-appropriate progressions",
    },
  ],
  assessmentFrequency: "Ongoing observation each session, focused assessment monthly",
  assessmentDuration: "2-3 minute focused observations during passing activities",
  bestAssessedIn: ["Passing activities", "Warm-up rondos", "Game situations", "Technical circuits"],
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN UPDATE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function upgradeSoccerSkillsFinal() {
  console.log("Starting final soccer skills upgrade (3 low-scoring skills)...");

  // SKILL 1: Dribbling
  console.log("\nUpgrading: Dribbling (2.52 → target 4.0+)...");
  await db
    .update(skills)
    .set({
      // Update top-level fields with question-based coaching tips
      coachingTips: [
        "What happens when you kick the ball harder? What about a softer touch?",
        "Can you peek up and tell me what color shirt I'm wearing while you dribble?",
        "Which part of your foot are you using? What happens if you try a different part?",
        "Where's an open space you could dribble to? Show me!",
        "The ball got away - no problem! What will you try differently next time?",
      ],
      observableBehaviors: [
        "Ball stays within 2 feet of body while moving at comfortable pace",
        "Uses inside, outside, or sole of foot (not just toe) to control ball",
        "Changes direction at least once without losing control over 10 yards",
        "Looks up at least 2-3 times during a 15-yard dribble",
        "Adjusts pace (faster or slower) on command or by choice",
      ],
      commonMistakes: [
        "It's common for the ball to escape - every player works on this throughout their career!",
        "Players often use only their toe at first - other foot surfaces develop with practice",
        "Looking at the ball constantly is natural - head-up dribbling builds over time",
        "Running faster than skill allows happens when players are excited - we channel that energy!",
        "Favoring one foot is normal - both feet develop through consistent practice",
      ],
      comprehensiveGuide: dribblingGuide as unknown as ComprehensiveGuide,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.dribbling));
  console.log("  ✓ Dribbling upgraded");

  // SKILL 2: Finding Space
  console.log("\nUpgrading: Finding Space (3.08 → target 4.0+)...");
  await db
    .update(skills)
    .set({
      coachingTips: [
        "Where is nobody standing right now? Can you go there?",
        "If you were the ball, could you see your teammate from there?",
        "What happens when everyone bunches together? Is there room to play?",
        "You passed the ball - now what? Where's a good spot to move to?",
        "What did you notice about where the defenders were? Where didn't they want you to go?",
      ],
      observableBehaviors: [
        "Moves to open space within 3 seconds of passing the ball",
        "Positions at least 5 yards away from nearest teammate in possession games",
        "Checks over shoulder at least once before calling for the ball",
        "Adjusts position as the ball moves to maintain passing angle",
        "Finds space to receive rather than running toward the ball carrier",
      ],
      commonMistakes: [
        "Clustering around the ball is completely natural for young players - they're drawn to the action!",
        "Standing still when off the ball is common - movement awareness develops with experience",
        "Moving to obvious spaces only is a natural starting point - reading space develops over time",
        "Forgetting to scan is very normal - this cognitive habit takes many repetitions to build",
        "Returning to the same spot after moving shows developing understanding of space",
      ],
      comprehensiveGuide: findingSpaceGuide as unknown as ComprehensiveGuide,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.findingSpace));
  console.log("  ✓ Finding Space upgraded");

  // SKILL 3: Ball Control
  console.log("\nUpgrading: Ball Control (3.40 → target 4.0+)...");
  await db
    .update(skills)
    .set({
      coachingTips: [
        "What happened when you stopped the ball with your toe? What about your inside foot?",
        "Can you make your foot 'soft like a pillow' to catch the ball? What did you notice?",
        "Where did you want the ball to go after you controlled it? Did it go there?",
        "Which part of your foot did you use? What made you choose that one?",
        "That control bounced away - no problem! What could you try next time?",
      ],
      observableBehaviors: [
        "Keeps ball within 2 feet when receiving a pass rolling at moderate speed",
        "Uses inside of foot (not toe) to cushion incoming balls",
        "Gets body behind the ball's path when preparing to receive",
        "First touch sets up next action (doesn't need multiple touches to settle ball)",
        "Controls balls from 10+ yards with consistency appropriate for age",
      ],
      commonMistakes: [
        "The ball bouncing away is totally normal - controlling a moving ball is genuinely difficult!",
        "Using the toe is natural at first - the inside foot habit develops with practice",
        "Stiff-legged receiving is common - the cushioning motion takes time to learn",
        "Control gets worse under pressure - this is normal skill regression under stress",
        "Air balls are extra challenging - this is one of the hardest skills to master",
      ],
      comprehensiveGuide: ballControlGuide as unknown as ComprehensiveGuide,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.ballControl));
  console.log("  ✓ Ball Control upgraded");

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("FINAL SOCCER SKILLS UPGRADE COMPLETE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("\nUpgraded 3 skills:");
  console.log("  - Dribbling (technical, Fundamentals)");
  console.log("  - Finding Space (tactical, Fundamentals)");
  console.log("  - Ball Control (technical, Fundamentals)");
  console.log("\nKey improvements made:");
  console.log("  ✓ Added guiding questions to coaching tips");
  console.log("  ✓ Made observable behaviors more measurable");
  console.log("  ✓ Normalized common mistakes as part of learning");
  console.log("  ✓ Removed ranking/comparison language");
  console.log("  ✓ Enhanced comprehensive guides with question-based approach");
}

// Run if executed directly
upgradeSoccerSkillsFinal()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

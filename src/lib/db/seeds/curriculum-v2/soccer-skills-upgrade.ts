/**
 * Soccer Skills Upgrade - Comprehensive Assessment Guides
 *
 * This seed file UPDATES existing soccer skills with comprehensive assessment guides.
 *
 * Skills upgraded (Fundamentals stage, technical domain):
 * 1. Ball Mastery - Toe Taps (29d35d07-734b-448a-aa14-5294eb8d67d1)
 * 2. Inside of Foot Pass (d4c83a26-3761-4e09-95b2-b2e53b06fc4f)
 * 3. Dribbling with Inside/Outside (611b29b2-7b0f-4465-9db4-6718636635c5)
 * 4. Receiving with Inside of Foot (ea942817-b6a5-4320-849a-29b7a266cc2b)
 * 5. Shooting with Laces (c89a2491-c2a8-4f23-867a-8880eb016489)
 * 6. Ball Control (100d4595-9e66-406d-8dd1-c9180c1276f4)
 * 7. Passing (b3e3748e-a287-450f-a409-84c7b607f577)
 * 8. Receiving (db39f600-0b84-4020-903b-d90933269d02)
 * 9. Shooting (5d123552-30d4-4e4e-ad13-baafa74f7d42)
 *
 * Each guide includes:
 * - levelDetails with 5 levels, each having observable behaviors, common mistakes,
 *   coaching tips (with guiding questions), and assessment activities
 * - ageExpectations for ages6to8, ages9to11, ages12to14
 * - redFlags array
 * - parentExplanation string
 * - homeActivities array
 * - bestAssessedIn array
 * - assessmentFrequency string
 * - assessmentDuration string
 *
 * Research-based guidelines applied:
 * - Guiding questions (not just commands) in coaching tips
 * - ELM framework language (Effort, Learning, Mistakes)
 * - Observable and measurable behaviors
 * - Age-appropriate expectations
 * - Holistic development connections (psychological/social)
 */

import { db } from "../../index";
import { skills } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

// Skill IDs to upgrade
const SKILL_IDS = {
  ballMasteryToeTaps: "29d35d07-734b-448a-aa14-5294eb8d67d1",
  insideOfFootPass: "d4c83a26-3761-4e09-95b2-b2e53b06fc4f",
  dribblingInsideOutside: "611b29b2-7b0f-4465-9db4-6718636635c5",
  receivingInsideOfFoot: "ea942817-b6a5-4320-849a-29b7a266cc2b",
  shootingWithLaces: "c89a2491-c2a8-4f23-867a-8880eb016489",
  ballControl: "100d4595-9e66-406d-8dd1-c9180c1276f4",
  passing: "b3e3748e-a287-450f-a409-84c7b607f577",
  receiving: "db39f600-0b84-4020-903b-d90933269d02",
  shooting: "5d123552-30d4-4e4e-ad13-baafa74f7d42",
};

// Comprehensive guides for each skill
const skillUpgrades = {
  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 1: Ball Mastery - Toe Taps
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.ballMasteryToeTaps]: {
    progressionLevels: {
      1: "Struggles to tap ball; loses balance frequently; ball rolls away after each attempt",
      2: "Can perform slow toe taps; needs to stop and reset often; rhythm inconsistent",
      3: "Performs toe taps with steady rhythm; maintains balance; can sustain for 20+ seconds",
      4: "Quick, rhythmic toe taps with eyes up; can move around the ball; confident alternating feet",
      5: "Effortless toe taps at high speed; incorporates variations; maintains rhythm while scanning",
    },

    observableBehaviors: [
      "Alternates feet smoothly on top of ball",
      "Maintains athletic stance with knees bent",
      "Ball stays relatively stationary under control",
      "Eyes can look up periodically during taps",
      "Demonstrates consistent rhythm without pausing",
    ],

    commonMistakes: [
      "Stepping on ball instead of tapping top",
      "Standing too upright (losing balance)",
      "Looking down at feet throughout",
      "Tapping too hard (ball rolls away)",
      "Using same foot repeatedly instead of alternating",
    ],

    coachingTips: [
      "What happens to your balance when you bend your knees a little more?",
      "Can you feel the top of the ball with your toes without looking?",
      "How light can you make your touches while still staying in control?",
      "What do you notice when you try to tap faster - where does the ball go?",
      "Can you count out loud while tapping - does that help your rhythm?",
    ],

    tags: ["core", "technical", "fundamental", "ball-mastery", "coordination", "foundation"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is exploring the toe tap movement. Balance is challenging and the ball frequently escapes. This is a normal starting point - every mistake is a learning opportunity.",
          observableBehaviors: [
            "Loses balance after 2-3 taps",
            "Ball rolls away from foot",
            "Uses one foot predominantly",
            "Must watch feet constantly",
            "Long pauses between tap attempts",
          ],
          commonMistakes: [
            "Stepping flat on ball (slipping risk)",
            "Standing straight up without knee bend",
            "Tapping too forcefully",
            "Feet too close together for balance",
          ],
          coachingTips: [
            "What happens if you try tapping next to a wall for balance support?",
            "Can you show me your best statue pose before we add the ball?",
            "Celebrate the effort! How many taps can you do today versus yesterday?",
            "What does the top of the ball feel like under your foot?",
            "Let's see if you can beat your personal best - that's what matters most!",
          ],
          assessmentActivities: [
            "Count maximum consecutive taps (any count is success)",
            "Toe tap for 10 seconds with wall support",
            "Alternate foot tapping at own pace",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can perform toe taps but needs frequent resets. Rhythm is developing and effort is evident. The learning process is visible in their concentration.",
          observableBehaviors: [
            "Completes 5-10 consecutive taps",
            "Begins alternating feet intentionally",
            "Balance improving but still wobbly",
            "Can sustain 10-15 seconds",
            "Starting to find personal rhythm",
          ],
          commonMistakes: [
            "Rhythm speeds up then breaks down",
            "Dominant foot does more work",
            "Ball drifts slowly in one direction",
            "Tension in shoulders and upper body",
          ],
          coachingTips: [
            "What speed feels most comfortable for you right now?",
            "Can you relax your shoulders while tapping - what changes?",
            "How many taps with just your left foot? Now your right? What did you notice?",
            "What if you whispered 'left-right-left-right' while tapping?",
            "Where is your balance best - try moving your feet a bit wider apart",
          ],
          assessmentActivities: [
            "Toe taps for 20 seconds (count total)",
            "Alternating feet for 15 seconds",
            "Toe taps while counting out loud",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player maintains consistent toe taps with good rhythm. Balance is reliable and they demonstrate the persistence and focus to sustain the movement.",
          observableBehaviors: [
            "Sustains 20+ seconds without stopping",
            "Smooth alternating between feet",
            "Ball stays in consistent position",
            "Can occasionally glance up",
            "Consistent rhythm maintained",
          ],
          commonMistakes: [
            "Rhythm becomes robotic (no variation)",
            "Still looks down when challenged",
            "Speed plateaus - afraid to go faster",
            "Upper body movement excessive",
          ],
          coachingTips: [
            "What happens if you try to tap just a little bit faster?",
            "Can you do toe taps while I hold up fingers - how many did you see?",
            "What if you moved in a small circle while tapping?",
            "How does it feel when you challenge yourself to try something new?",
            "When you make a mistake, what helps you restart quickly?",
          ],
          assessmentActivities: [
            "Toe taps for 30 seconds at steady pace",
            "Toe taps with head up - identify colors coach shows",
            "Toe taps moving around the ball (360 degrees)",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player demonstrates confident, quick toe taps with awareness of surroundings. Shows willingness to challenge themselves and try variations.",
          observableBehaviors: [
            "Quick taps with eyes up frequently",
            "Can move around ball while tapping",
            "Maintains control at increased speed",
            "Demonstrates tap variations",
            "Recovers quickly from small errors",
          ],
          commonMistakes: [
            "May sacrifice control for speed",
            "Variations sometimes disrupt rhythm",
            "Could be more creative with movements",
          ],
          coachingTips: [
            "What new variation can you invent with toe taps?",
            "How fast can you go while still feeling in control?",
            "Can you toe tap while moving forward? Backward?",
            "What challenges have you overcome to get this good?",
            "How could you help a teammate who is still learning toe taps?",
          ],
          assessmentActivities: [
            "Speed toe taps for 20 seconds (count total)",
            "Toe taps while moving in different directions",
            "Create and demonstrate a toe tap combo",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player exhibits mastery with effortless toe taps. Demonstrates creativity, leadership in helping others, and genuine love for the skill challenge.",
          observableBehaviors: [
            "Effortless high-speed taps",
            "Seamless transitions between variations",
            "Full field awareness during taps",
            "Creates own challenges and combos",
            "Helps teammates improve",
          ],
          commonMistakes: [
            "May get bored without new challenges",
            "Could over-complicate simple situations",
          ],
          coachingTips: [
            "What new challenge can you set for yourself?",
            "How would you teach this to someone just starting?",
            "Can you combine toe taps with other ball mastery moves?",
            "What does it mean to be a leader in practice?",
            "How can you help make our team better at ball mastery?",
          ],
          assessmentActivities: [
            "Create and perform a 30-second ball mastery routine including toe taps",
            "Teach toe taps to a less experienced player",
            "Toe taps in dynamic game-like situations",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Toe taps are challenging for this age due to coordination development. Focus on effort and fun, not perfection. Celebrate every attempt - falling down and getting back up is part of learning! Short practice bursts (30-60 seconds) work best. Make it playful: 'Can you tap like a bunny?'",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Coordination allows for more consistent toe taps. Players can sustain longer practice and understand rhythm concepts. Introduce the idea of 'personal bests' - competing against yourself builds healthy confidence. Begin adding head-up challenges.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect competent toe taps with the ability to add variations. Challenge them to integrate toe taps into warm-ups they design. Encourage leadership - teaching younger players reinforces their own learning and builds social skills.",
        },
      },

      redFlags: [
        "Consistent balance issues after multiple sessions (may need physical assessment)",
        "Frustration leading to giving up rather than trying again",
        "Avoidance of ball mastery activities entirely",
        "No improvement over 4-6 weeks with regular practice",
        "Excessive anxiety or negative self-talk during attempts",
      ],

      parentExplanation:
        "Toe taps build the foundation for all soccer skills - they develop balance, coordination, and 'feel' for the ball. Your child is learning that getting better takes practice and patience. At home, encourage them to practice for short periods (1-2 minutes) rather than long sessions. Celebrate effort and improvement, not just success. When they make mistakes (and they will!), that's when the best learning happens. Ask them 'What did you learn?' rather than 'How many did you do?'",

      homeActivities: [
        "Toe tap challenge: beat yesterday's personal best",
        "Toe taps during TV commercials (makes it fun!)",
        "Practice on different surfaces (grass, carpet, pavement)",
        "Toe tap counting game with family members",
        "Video record and watch back together (great for self-reflection)",
        "Create a toe tap obstacle course",
      ],

      bestAssessedIn: [
        "Warm-up routines",
        "Ball mastery stations",
        "Individual skill challenges",
        "Partner counting activities",
      ],
      assessmentFrequency: "Weekly observation during training, formal assessment monthly",
      assessmentDuration: "30-60 seconds of observation is sufficient",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 2: Inside of Foot Pass
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.insideOfFootPass]: {
    progressionLevels: {
      1: "Passes miss target consistently; uses wrong surface of foot; no follow-through",
      2: "Can pass to stationary partner at close range; accuracy inconsistent; technique developing",
      3: "Accurate passes to moving teammates at medium range; proper technique; reads partner movement",
      4: "Crisp, weighted passes in game situations; disguises intentions; leads receivers effectively",
      5: "Elite passing vision and execution; creates opportunities; makes teammates better",
    },

    observableBehaviors: [
      "Plants foot beside ball pointing at target",
      "Strikes ball with inside of foot (large surface area)",
      "Follow-through extends toward target",
      "Passes arrive at correct pace for receiver",
      "Body opens toward target before pass",
    ],

    commonMistakes: [
      "Planting foot too far from ball",
      "Using toe instead of inside of foot",
      "No follow-through (stabbing at ball)",
      "Passing behind moving teammates",
      "Body closed off from target",
    ],

    coachingTips: [
      "Where is your standing foot pointing - is it aimed at your target?",
      "Can you lock your ankle and make your foot like a hockey stick?",
      "What happens to the ball when you follow through toward your partner?",
      "How does your partner want to receive the ball - to which foot?",
      "Can you pass so your partner doesn't have to stretch or chase?",
    ],

    tags: ["core", "technical", "fundamental", "passing", "teamwork"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning the basic passing motion. Passes often miss the target and technique is inconsistent. Every attempt is building the foundation for improvement.",
          observableBehaviors: [
            "Ball goes in unintended directions",
            "Uses toe or wrong part of foot",
            "No awareness of target during pass",
            "Passes are weak or overhit",
            "Standing foot position random",
          ],
          commonMistakes: [
            "Kicking with toe (ball spins unpredictably)",
            "Looking at ball instead of target",
            "Standing foot pointing wrong direction",
            "Rushing the pass without preparation",
          ],
          coachingTips: [
            "Show me the inside of your foot - that's your passing surface!",
            "Can you point your belly button at your partner before you pass?",
            "What if you took a little pause to aim before passing?",
            "Where does the ball go when you follow through toward your friend?",
            "Mistakes help us learn - what did you notice that time?",
          ],
          assessmentActivities: [
            "Pass to stationary partner 5 feet away",
            "Pass through cones (gate) 3 feet wide",
            "Pass and follow your pass",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player makes passes to stationary targets with growing accuracy. Technique is developing and they show persistence in improving.",
          observableBehaviors: [
            "Uses inside of foot more consistently",
            "Passes reach close targets",
            "Beginning to show follow-through",
            "Can pass with dominant foot reliably",
            "Shows awareness of partner position",
          ],
          commonMistakes: [
            "Accuracy drops at longer distances",
            "Weak foot passes very inconsistent",
            "Passes behind moving partners",
            "Weight of pass often wrong",
          ],
          coachingTips: [
            "How hard do you need to kick for the ball to reach your partner?",
            "Can you pass so the ball stops at your partner's feet?",
            "What changes when you try passing with your other foot?",
            "Where should you aim when your partner is walking toward you?",
            "What part of the ball do you hit for a straight pass?",
          ],
          assessmentActivities: [
            "Pass through gates at increasing distances",
            "Partner passing - count consecutive successful passes",
            "Pass to moving partner (walking pace)",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player passes accurately to moving targets at medium range. Shows understanding of timing and weight of pass. Demonstrates teamwork through communication.",
          observableBehaviors: [
            "Passes reach moving partners",
            "Appropriate weight on passes",
            "Leads receivers correctly",
            "Can pass with either foot",
            "Communicates before receiving",
          ],
          commonMistakes: [
            "Struggles with one-touch passing",
            "Under pressure accuracy drops",
            "Doesn't always disguise intentions",
            "Timing slightly off on quick combinations",
          ],
          coachingTips: [
            "What happens to the defender when you look one way and pass another?",
            "Can you pass first-time when your partner needs it quickly?",
            "How can you tell where your teammate wants the ball?",
            "What does your body position tell the defender?",
            "When is the best moment to release the pass?",
          ],
          assessmentActivities: [
            "3v1 rondo (keep away)",
            "Wall passing combinations",
            "Pass and move patterns",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player makes crisp, well-weighted passes in game situations. Disguises intentions and makes intelligent decisions. Shows leadership in build-up play.",
          observableBehaviors: [
            "Passes arrive perfectly weighted",
            "Disguises passing intentions",
            "Creates passing lanes",
            "Executes under pressure",
            "Helps teammates by calling for ball",
          ],
          commonMistakes: [
            "May try too ambitious passes",
            "Could simplify in certain situations",
            "Occasionally holds ball too long",
          ],
          coachingTips: [
            "When is the simple pass better than the creative one?",
            "How can you help your teammates find good positions?",
            "What do you see before you even receive the ball?",
            "How does your passing change the game for your team?",
            "Can you recognize when your teammate is ready to receive?",
          ],
          assessmentActivities: [
            "5v2 rondo under pressure",
            "Small-sided games (focus on passing sequences)",
            "Combination play patterns with third player",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player demonstrates elite passing ability that elevates team play. Sees passes before they develop and consistently makes teammates better.",
          observableBehaviors: [
            "Vision beyond immediate play",
            "Perfectly weighted every time",
            "Creates chances from nothing",
            "Leads team's build-up play",
            "Makes difficult passes look simple",
          ],
          commonMistakes: [
            "May overestimate teammates' abilities",
            "Could become frustrated with less skilled partners",
          ],
          coachingTips: [
            "How can you adjust your passes to help different teammates succeed?",
            "What can you teach others about passing?",
            "How do you stay patient when the perfect pass isn't available?",
            "What do elite passers do that others don't?",
            "How can your leadership lift the whole team's passing?",
          ],
          assessmentActivities: [
            "Game observation - passing accuracy and assist potential",
            "Complex rondos (6v2, 7v3)",
            "Positional play exercises",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Focus on the fun of playing with friends - passing is sharing! Technique is secondary to enjoyment and effort. Use games where passing helps the team succeed. Keep distances short (5-10 feet). Celebrate passes that reach partners regardless of perfect technique.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and apply passing technique more consistently. Introduce the concept of 'helping your teammate' - pass so they can control easily. Work on both feet. Begin small-sided games where passing creates advantages.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect accurate, purposeful passing. Challenge players to pass with intent - every pass should have a reason. Introduce tactical concepts: when to play short vs. long, creating triangles, switching play. Emphasize how passing builds team cohesion.",
        },
      },

      redFlags: [
        "Consistently avoids passing even when teammates are open",
        "Shows no improvement in accuracy over 6-8 weeks",
        "Becomes upset with teammates when passes aren't returned",
        "Physical discomfort when striking ball with inside of foot",
        "Refuses to attempt passes with weaker foot after extended time",
      ],

      parentExplanation:
        "Passing with the inside of the foot is soccer's most important skill - it connects teammates and builds the team game. We teach players to 'lock their ankle' and use the flat part of the inside of their foot for accuracy. At home, passing against a wall or with family members helps develop this skill. Encourage your child to use both feet. When they pass to you, receive it the way they should - under control. The best thing you can say: 'Nice pass!' when they connect with a teammate.",

      homeActivities: [
        "Wall passing - how many in a row?",
        "Target practice through cones or objects",
        "Family passing circle in the backyard",
        "Pass and follow game with parent or sibling",
        "Two-touch passing challenge",
        "Watch professional games together - count great passes",
      ],

      bestAssessedIn: [
        "Partner passing warm-ups",
        "Rondo games (keep away)",
        "Small-sided games",
        "Possession exercises",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across multiple passing situations (5-10 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 3: Dribbling with Inside/Outside
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.dribblingInsideOutside]: {
    progressionLevels: {
      1: "Ball escapes frequently; uses only one surface; cannot change direction; stops to control",
      2: "Can dribble slowly using inside; beginning to use outside; changes direction with difficulty",
      3: "Smooth inside/outside touch at jogging pace; changes direction fluidly; maintains ball close",
      4: "Quick direction changes using both surfaces; beats defenders; executes at speed under pressure",
      5: "Elite close control with deceptive touches; creates space effortlessly; artistic ball manipulation",
    },

    observableBehaviors: [
      "Alternates between inside and outside of foot smoothly",
      "Ball stays within playing distance during direction changes",
      "Uses both feet for inside/outside touches",
      "Maintains body balance during quick changes",
      "Head up to scan while dribbling",
    ],

    commonMistakes: [
      "Only using inside of foot",
      "Pushing ball too far when changing direction",
      "Stopping to switch from inside to outside",
      "Looking down constantly during dribbling",
      "Standing upright instead of athletic stance",
    ],

    coachingTips: [
      "Can you feel the difference between touching with the inside versus outside?",
      "What happens to the defender when you quickly change the direction of the ball?",
      "How close can you keep the ball while still moving forward?",
      "Which foot feels more comfortable - let's practice the other one too!",
      "Can you look up and still know where the ball is?",
    ],

    tags: ["core", "technical", "fundamental", "dribbling", "ball-control", "1v1"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is discovering how different parts of the foot move the ball differently. Control is developing and mistakes are plentiful - all part of the learning journey.",
          observableBehaviors: [
            "Ball frequently rolls away",
            "Uses only one surface (usually inside)",
            "Must stop to change direction",
            "Watches ball constantly",
            "Stiff body movement",
          ],
          commonMistakes: [
            "Kicking ball instead of pushing with foot",
            "Reaching for ball instead of moving to it",
            "No awareness of body position",
            "Forgetting to use outside of foot",
          ],
          coachingTips: [
            "Can you push the ball gently with the inside of your foot like petting a cat?",
            "Now try with the outside - how does it feel different?",
            "What happens when you bend your knees a little more?",
            "Mistakes are how we learn - what did you discover that time?",
            "Can you dribble as slowly as possible without losing the ball?",
          ],
          assessmentActivities: [
            "Dribble across small grid using inside of foot only",
            "Dribble using outside of foot only (short distance)",
            "Stop ball with inside, then push with outside",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can dribble using inside of foot and is beginning to incorporate outside touches. Shows effort and determination to try both surfaces.",
          observableBehaviors: [
            "Comfortable dribbling with inside",
            "Attempts outside touches",
            "Can change direction (slowly)",
            "Ball control improving",
            "Beginning to use both feet",
          ],
          commonMistakes: [
            "Reverts to inside only under pressure",
            "Outside touch is heavy",
            "Direction changes are slow and obvious",
            "Only uses dominant foot",
          ],
          coachingTips: [
            "How many different ways can you touch the ball to change direction?",
            "What if you alternated inside-outside-inside without stopping?",
            "Can you feel when your outside touch is too hard?",
            "Which direction change fools your partner - inside or outside?",
            "Let's count: how many outside touches can you make in one minute?",
          ],
          assessmentActivities: [
            "Cone slalom using inside/outside alternating",
            "Dribble and change direction on whistle",
            "Partner follow-the-leader dribbling",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player smoothly transitions between inside and outside touches. Can change direction fluidly while maintaining control. Shows growing confidence.",
          observableBehaviors: [
            "Smooth inside/outside transitions",
            "Fluid direction changes",
            "Ball stays close to body",
            "Can look up periodically",
            "Both feet becoming reliable",
          ],
          commonMistakes: [
            "Speed causes control problems",
            "Predictable patterns in direction changes",
            "Head drops under pressure",
            "May telegraph intentions",
          ],
          coachingTips: [
            "What happens to the defender when you change direction quickly?",
            "Can you vary your rhythm - slow, slow, then QUICK?",
            "How can you use your body to hide which way you're going?",
            "When the defender is close, what touch helps you escape?",
            "What do you notice about your balance when you change direction?",
          ],
          assessmentActivities: [
            "Dribble through cone course at increasing speed",
            "1v1 in small grid",
            "Inside/outside moves to beat passive defender",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player executes quick direction changes under pressure. Uses inside/outside effectively to beat defenders and create space. Demonstrates confidence and creativity.",
          observableBehaviors: [
            "Quick changes beat defenders",
            "Executes at game speed",
            "Creates space effectively",
            "Unpredictable movement patterns",
            "Head up even under pressure",
          ],
          commonMistakes: [
            "May over-dribble when pass is better",
            "Occasionally takes unnecessary risks",
            "Could be more efficient in certain situations",
          ],
          coachingTips: [
            "When do you dribble to beat a player versus dribble to keep possession?",
            "How do you decide when to take on a defender?",
            "What's your favorite move to create space - can you develop another?",
            "How can your dribbling help your teammates?",
            "When has a risky dribble paid off? When hasn't it?",
          ],
          assessmentActivities: [
            "1v1 attacking situations",
            "Small-sided games (watch for purposeful dribbling)",
            "Beat defender and finish challenges",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player demonstrates elite close control with artistic ball manipulation. Creates space effortlessly and uses dribbling to unlock defenses. A joy to watch.",
          observableBehaviors: [
            "Artistic ball manipulation",
            "Creates chances through dribbling",
            "Unpredictable and deceptive",
            "Maintains control at any speed",
            "Dribbling is a weapon",
          ],
          commonMistakes: [
            "May try to beat too many players",
            "Could frustrate teammates by not releasing ball",
          ],
          coachingTips: [
            "When does your dribbling serve the team best?",
            "How can you use your skill to create opportunities for others?",
            "What can you teach teammates about dribbling confidence?",
            "How do you stay humble while being so skilled?",
            "What new move are you working on?",
          ],
          assessmentActivities: [
            "Game observation - successful take-ons",
            "1v1, 1v2 challenges",
            "Creative dribbling in game situations",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Make dribbling playful! Games like 'sharks and minnows' or 'traffic lights' build skills without pressure. Focus on ball touches rather than beating defenders. At this age, the ball is their friend to explore with. Celebrate all attempts to try new touches.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand inside versus outside touches and practice deliberately. Introduce the idea of 'moves' that combine touches. Lots of repetition in fun games builds the muscle memory needed. Both feet should be developing.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect players to dribble with purpose - to beat defenders or maintain possession. Challenge them to develop signature moves. Discuss decision-making: when to dribble, when to pass. 1v1 confidence is important psychologically at this age.",
        },
      },

      redFlags: [
        "Refuses to attempt dribbling in games (always passes immediately)",
        "Cannot use outside of foot after extended practice",
        "Extreme frustration when losing ball",
        "Physical discomfort or avoiding using one leg",
        "No improvement in close control over multiple months",
      ],

      parentExplanation:
        "Dribbling with the inside and outside of the foot gives players two 'gears' to change direction. The inside of the foot pulls the ball across the body; the outside pushes it away. Together, they allow quick direction changes that can beat defenders. At home, dribbling through cones or household objects (gently!) helps develop this skill. Encourage using both feet - the 'magic' happens when both are comfortable. Let them watch skilled dribblers on TV and try to copy moves they see.",

      homeActivities: [
        "Cone slalom in backyard (inside/outside required)",
        "Dribble figure-8s around two objects",
        "Copy moves from YouTube tutorials",
        "Dribble tag with family members",
        "Practice signature moves repeatedly",
        "Wall touches: inside-push, outside-push patterns",
      ],

      bestAssessedIn: [
        "Dribbling relay activities",
        "1v1 situations",
        "Small-sided games",
        "Technical warm-up circuits",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across varied dribbling situations (5-10 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 4: Receiving with Inside of Foot
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.receivingInsideOfFoot]: {
    progressionLevels: {
      1: "Ball bounces off foot uncontrolled; cannot cushion; requires multiple touches to stop ball",
      2: "Can stop slowly rolling balls; cushioning developing; struggles with pace on pass",
      3: "Controls firm passes with first touch; cushions into space; prepares for next action",
      4: "Excellent first touch in all directions; receives under pressure; touch sets up play",
      5: "Elite receiving - first touch is a weapon; controls any ball; creates time and space instantly",
    },

    observableBehaviors: [
      "Presents inside of foot early to receive",
      "Withdraws foot on contact to cushion ball",
      "Body position open to see field",
      "First touch moves ball into space for next action",
      "Selects receiving foot based on next intended action",
    ],

    commonMistakes: [
      "Stiff ankle on contact (ball bounces away)",
      "Foot arrives late (rushed touch)",
      "Body closed - cannot see options",
      "Touch is too heavy or too soft",
      "Always receives to same foot regardless of situation",
    ],

    coachingTips: [
      "Can you catch the ball with your foot like you catch with your hands?",
      "What happens to the ball when you pull your foot back as it arrives?",
      "Where do you want the ball to go after your first touch?",
      "Before the ball comes, where are you looking - ball or space?",
      "How does your body position help you see your options?",
    ],

    tags: ["core", "technical", "fundamental", "receiving", "first-touch", "control"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning to receive the ball with their foot. Timing and cushioning are developing. The ball often escapes, which is normal and part of learning.",
          observableBehaviors: [
            "Ball bounces away from foot",
            "Needs 3+ touches to control",
            "Reaches toward ball (off balance)",
            "No cushioning motion",
            "Loses possession frequently",
          ],
          commonMistakes: [
            "Stabbing at ball instead of receiving",
            "Ankle locked instead of relaxed",
            "Standing flat-footed waiting for ball",
            "Eyes only on ball, not surroundings",
          ],
          coachingTips: [
            "Pretend your foot is a pillow - can you make the ball land softly?",
            "What happens when you relax your ankle as the ball arrives?",
            "Can you move your foot back like a drawbridge lowering?",
            "Show me how you catch a ball with your hands - can your foot do the same?",
            "Where does the ball go when it bounces? What could you try differently?",
          ],
          assessmentActivities: [
            "Receive rolled ball from 5 feet",
            "Self-toss and receive with inside of foot",
            "Partner feed and stop on line",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can receive slower balls and shows developing cushioning technique. Demonstrates effort to improve and control is growing.",
          observableBehaviors: [
            "Stops slowly rolled balls",
            "Beginning to cushion on contact",
            "1-2 touches to control",
            "Shows correct foot surface",
            "Growing confidence receiving",
          ],
          commonMistakes: [
            "Pace on pass causes trouble",
            "Touch goes directly down (no direction)",
            "Still reaching instead of moving",
            "Only comfortable one side",
          ],
          coachingTips: [
            "How can you receive so the ball is ready for your next touch?",
            "What happens if you take a small step to meet the ball?",
            "Can you receive and look up before your second touch?",
            "Where would you like the ball to go - can your first touch send it there?",
            "What's different about receiving on your left foot versus right?",
          ],
          assessmentActivities: [
            "Receive and pass back (varied pace)",
            "Receive and turn drill",
            "Receive across body to other foot",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player controls firm passes with a quality first touch. Can cushion ball into space and prepare for the next action. Shows good decision-making.",
          observableBehaviors: [
            "Controls firm passes cleanly",
            "Cushions into chosen direction",
            "First touch sets up next action",
            "Body open to field",
            "Uses both feet to receive",
          ],
          commonMistakes: [
            "Touch under pressure can be heavy",
            "Sometimes receives to wrong side",
            "Could be quicker with touch",
            "Predictable in where touch goes",
          ],
          coachingTips: [
            "Before the ball arrives, where do you want it to end up?",
            "What tells you which direction to take your first touch?",
            "How can your first touch beat the defender without dribbling?",
            "Can you receive while already knowing your next pass?",
            "What do the best players do with their first touch?",
          ],
          assessmentActivities: [
            "Receive under passive pressure",
            "First touch into space and finish",
            "Receive and play combination",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player's first touch is excellent in all directions, even under pressure. Touch sets up play and creates advantages. Demonstrates composure and intelligence.",
          observableBehaviors: [
            "First touch beats pressure",
            "Receives in any direction needed",
            "Creates time and space",
            "Knows options before receiving",
            "Touch leads to positive play",
          ],
          commonMistakes: [
            "May be too ambitious with touch occasionally",
            "Could be simpler in certain situations",
          ],
          coachingTips: [
            "When is a safe touch better than a creative one?",
            "How do you read the defender to choose your touch direction?",
            "What can you see before the ball arrives?",
            "How does your first touch affect your teammates' runs?",
            "When has your first touch created a chance?",
          ],
          assessmentActivities: [
            "Receive under active pressure",
            "Small-sided games (watch receiving quality)",
            "Receive and shoot challenges",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player's receiving ability is a weapon. First touch creates time, space, and opportunities that don't exist for others. Controls any ball with apparent ease.",
          observableBehaviors: [
            "First touch is a weapon",
            "Controls any ball effortlessly",
            "Creates chances with receiving",
            "Calm under any pressure",
            "Makes receiving look easy",
          ],
          commonMistakes: [
            "May make it look too easy (teammates don't understand the skill)",
          ],
          coachingTips: [
            "How can you help teammates improve their first touch?",
            "What do you think about before the ball arrives?",
            "How did you develop such a great first touch?",
            "What's the hardest ball to control and how do you handle it?",
            "Can you explain your receiving process to help others?",
          ],
          assessmentActivities: [
            "Game observation - first touch quality",
            "Receiving in tight spaces",
            "Difficult ball control challenges",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "First touch is one of the hardest skills to develop - be patient! Use games where controlling the ball earns points. Roll balls gently to start; firm passes come later. Make it playful: 'Can you make the ball stop like magic?' The repetition of receiving balls develops the neural pathways needed.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and practice cushioning technique. Introduce receiving into space rather than just stopping the ball. Challenge them to look up after receiving. Both feet should be developing. Partner work builds social connections while developing skill.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect players to have a plan before they receive. First touch should set up the next action. Challenge them with game-realistic pressure. Discuss how elite players 'know' what to do before the ball arrives. Receiving under pressure builds confidence.",
        },
      },

      redFlags: [
        "Consistently avoids receiving the ball in games",
        "No improvement in cushioning after extended practice",
        "Flinches or pulls away from incoming balls",
        "Shows anxiety when ball is passed to them",
        "Physical discomfort when receiving",
      ],

      parentExplanation:
        "Receiving with the inside of the foot is about 'cushioning' - withdrawing the foot as the ball arrives, like catching an egg. This soft touch keeps the ball close for the next action. At home, rolling or passing balls for your child to receive helps enormously. Start gently and increase pace as they improve. The key phrase: 'soft feet' or 'catch it with your foot.' When they control a ball well, notice it: 'Great first touch!'",

      homeActivities: [
        "Wall rebounds - receive the return",
        "Partner roll and cushion practice",
        "Self-toss and control challenges",
        "Receive with eyes closed (builds touch sensitivity)",
        "Receive and turn in different directions",
        "Watch pros - notice their first touch in slow motion",
      ],

      bestAssessedIn: [
        "Passing and receiving warm-ups",
        "Small-sided games",
        "Technical circuits",
        "Game observation",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across multiple receiving situations (5-10 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 5: Shooting with Laces
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.shootingWithLaces]: {
    progressionLevels: {
      1: "Shots weak and inaccurate; uses toe or wrong surface; cannot strike moving ball",
      2: "Can strike stationary ball with laces; power developing; accuracy inconsistent",
      3: "Shoots with power and reasonable accuracy; can strike rolling ball; proper technique",
      4: "Powerful, accurate shots in game situations; shoots quickly; varies technique",
      5: "Elite finishing - clinical with either foot; creates scoring chances; confident finisher",
    },

    observableBehaviors: [
      "Approaches ball at angle (not straight on)",
      "Planting foot beside ball, pointing at target",
      "Strikes through center of ball with laces",
      "Ankle locked, toe pointing down",
      "Follow-through toward target",
    ],

    commonMistakes: [
      "Using toe instead of laces",
      "Planting foot too far from ball",
      "Leaning back (ball goes high)",
      "No follow-through",
      "Approaching straight at the ball",
    ],

    coachingTips: [
      "Where is your planting foot pointing - is it aiming at the goal?",
      "Can you lock your ankle and point your toe down?",
      "What happens to the ball when you lean over it versus lean back?",
      "Can you strike through the ball, not just hit it?",
      "What do you see in the goal before you shoot?",
    ],

    tags: ["core", "technical", "fundamental", "shooting", "finishing", "attacking"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning the shooting motion. Shots are weak and often miss the target. Every attempt builds confidence and understanding of the technique.",
          observableBehaviors: [
            "Uses toe frequently",
            "Shots go in random directions",
            "Little power on shots",
            "Struggles to contact ball cleanly",
            "Stops to shoot (cannot strike moving ball)",
          ],
          commonMistakes: [
            "Toe-poke habit",
            "Looking down at ball not goal",
            "Standing foot position random",
            "Swinging leg instead of striking through",
          ],
          coachingTips: [
            "Can you show me your laces? That's your shooting surface!",
            "Before you shoot, take a peek at the goal - where is the goalkeeper?",
            "What happens when you point your toe down like a dancer?",
            "Can you kick through the ball, like you're kicking it far?",
            "Every shot is practice - where did that one go? Where do you want the next one?",
          ],
          assessmentActivities: [
            "Stationary ball shots from 8 yards",
            "Laces contact practice (without goal)",
            "Slow roll and shoot",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can strike a stationary ball with the laces. Power is developing and they show effort to improve technique. Accuracy is inconsistent but improving.",
          observableBehaviors: [
            "Uses laces more consistently",
            "Some power developing",
            "Can hit target (not corners)",
            "Strikes stationary ball cleanly",
            "Proper approach angle emerging",
          ],
          commonMistakes: [
            "Moving ball is difficult",
            "Leans back (balls go high)",
            "Power inconsistent",
            "Only shoots with dominant foot",
          ],
          coachingTips: [
            "What happens when you stay over the ball as you shoot?",
            "Can you shoot a slow-rolling ball the same way?",
            "Where should your chest be - over the ball or behind it?",
            "What do you notice when you follow through toward the goal?",
            "Can you hit the target 5 times in a row?",
          ],
          assessmentActivities: [
            "Shoot at targets in goal",
            "Slowly rolling ball finishing",
            "Shooting from different angles",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player shoots with power and reasonable accuracy. Can strike moving balls and shows proper technique. Demonstrates composure when shooting.",
          observableBehaviors: [
            "Powerful shots on target",
            "Strikes moving balls cleanly",
            "Proper technique consistent",
            "Can shoot from various angles",
            "Both feet developing",
          ],
          commonMistakes: [
            "Pressure affects technique",
            "May blast when placement is better",
            "Weak foot significantly weaker",
            "Sometimes shoots when pass is better",
          ],
          coachingTips: [
            "When do you blast it versus place it?",
            "What do you see in the goal before you decide where to shoot?",
            "How can you score more often - power or accuracy?",
            "What changes when a defender is running at you?",
            "Can you practice with your other foot this week?",
          ],
          assessmentActivities: [
            "Shooting under passive pressure",
            "Receive and shoot drills",
            "Weak foot shooting practice",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player shoots powerfully and accurately in game situations. Makes good decisions about when and how to shoot. Shows confidence and composure.",
          observableBehaviors: [
            "Powerful, accurate in games",
            "Shoots quickly when needed",
            "Varies power and placement",
            "Good shooting decisions",
            "Confident in front of goal",
          ],
          commonMistakes: [
            "May force shots occasionally",
            "Could be more clinical in pressure moments",
          ],
          coachingTips: [
            "When do you know it's the right time to shoot?",
            "What do you think about in that split second before shooting?",
            "How do you stay calm when scoring matters most?",
            "What can you do to become even more clinical?",
            "How does your shooting help the team?",
          ],
          assessmentActivities: [
            "Shooting under active pressure",
            "Finishing in small-sided games",
            "1v1 with goalkeeper",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player is an elite finisher. Clinical with either foot, creates scoring chances, and shows ice-cold composure. A genuine goal-scoring threat.",
          observableBehaviors: [
            "Clinical finishing",
            "Scores with either foot",
            "Creates chances through movement",
            "Calm under pressure",
            "Natural goal-scorer instincts",
          ],
          commonMistakes: [
            "May become selfish for goals occasionally",
          ],
          coachingTips: [
            "How do you stay so calm when shooting?",
            "What do you see that others don't?",
            "How can you help teammates become better finishers?",
            "What's your routine before a big shooting moment?",
            "When is the assist better than the shot?",
          ],
          assessmentActivities: [
            "Game goal/chance statistics",
            "High-pressure finishing scenarios",
            "Variety of finishing challenges",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Scoring is the most fun part of soccer! Focus on contact and direction before power. Use small goals and let them score often - success breeds confidence. Don't worry about perfect technique; the joy of scoring builds love for the game. Celebrate all goals equally.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and apply shooting technique. Introduce the concept of 'picking your spot' - where in the goal. Work on both feet. Finishing games and competitions make practice fun. Help them understand that missing is part of scoring.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect proper shooting technique and good decisions about when to shoot. Challenge them with game-realistic scenarios. Discuss the mental side: confidence, composure, bouncing back from misses. Weak foot development is important.",
        },
      },

      redFlags: [
        "Avoids shooting even when open on goal",
        "Persistent toe-poking despite coaching",
        "Extreme frustration when missing",
        "Physical discomfort when striking ball",
        "No power development over extended time",
      ],

      parentExplanation:
        "Shooting with the laces creates power and allows control. We teach players to lock their ankle, point their toe down, and strike through the middle of the ball. The planting foot should point at the target. At home, shooting at targets (cones, corners of goal) helps develop accuracy. Remember: missing is part of learning to score! The best strikers miss plenty but keep shooting with confidence. Encourage them to try their weaker foot too.",

      homeActivities: [
        "Target shooting in backyard or park",
        "Wall shooting (mark targets)",
        "Shooting contests with family",
        "Practice striking technique without ball",
        "Watch goals on YouTube - study technique",
        "Weak foot shooting challenges",
      ],

      bestAssessedIn: [
        "Shooting drills",
        "Finishing games",
        "Small-sided games",
        "1v1 with keeper",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across multiple shooting opportunities (5-10 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 6: Ball Control (General)
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.ballControl]: {
    progressionLevels: {
      1: "Ball frequently escapes; requires multiple touches to control; often loses possession",
      2: "Can control ball when stationary; loses control when moving; inconsistent touch",
      3: "Maintains control while jogging; can change direction with ball; occasional loss of control under pressure",
      4: "Controls ball at speed; uses both feet; maintains control with defender nearby",
      5: "Exceptional close control in tight spaces; creative touches; rarely loses possession",
    },

    observableBehaviors: [
      "Ball stays within playing distance (1-2 feet)",
      "Eyes can look up while controlling",
      "Uses appropriate surface of foot for situation",
      "Body position stays balanced over ball",
      "Can shield ball from pressure",
    ],

    commonMistakes: [
      "Kicking ball too far ahead",
      "Only using dominant foot",
      "Looking down constantly at ball",
      "Standing too upright (poor balance)",
      "Touching ball with toe instead of proper surfaces",
    ],

    coachingTips: [
      "What happens when you bend your knees and get lower?",
      "Can you feel where the ball is without looking?",
      "How close can you keep the ball and still move forward?",
      "What surface of your foot gives you the most control?",
      "Where are your eyes - can you peek up while the ball is at your feet?",
    ],

    tags: ["core", "technical", "fundamental", "ball-mastery", "close-control"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is developing their relationship with the ball. Control is inconsistent and the ball frequently escapes. This is the foundation stage where every touch builds future skill.",
          observableBehaviors: [
            "Ball rolls away after most touches",
            "Needs multiple touches to stop ball",
            "Uses only one foot",
            "Must stop completely to control",
            "Eyes on ball 100% of time",
          ],
          commonMistakes: [
            "Using toe to control",
            "Reaching for ball instead of moving feet",
            "Kicking at ball instead of guiding it",
            "Standing on heels not balls of feet",
          ],
          coachingTips: [
            "Can you touch the ball gently, like it's a small animal?",
            "What happens when you move your feet to the ball instead of reaching?",
            "Every touch is practice - what did you learn from that one?",
            "Can you keep the ball in a little circle around you?",
            "Mistakes help us learn - let's try again!",
          ],
          assessmentActivities: [
            "Ball touch counting (30 seconds)",
            "Red light/green light with balls",
            "Keep ball in a hula hoop sized area",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player controls the ball when stationary but struggles with movement. Touch is improving and effort is evident. Shows determination to keep the ball close.",
          observableBehaviors: [
            "Stops rolling balls with 1-2 touches",
            "Controls while standing still",
            "Loses ball when moving quickly",
            "Beginning to use different foot surfaces",
            "Occasionally looks up",
          ],
          commonMistakes: [
            "Pushes ball too far when starting to move",
            "Only comfortable with dominant side",
            "Panics when ball bounces",
            "Stops moving to control ball",
          ],
          coachingTips: [
            "Can you walk with the ball before jogging?",
            "What happens when you take smaller touches?",
            "How does it feel different when you try your other foot?",
            "Can you touch the ball with every step you take?",
            "What helps you keep the ball close - small touches or big ones?",
          ],
          assessmentActivities: [
            "Dribble through wide gates",
            "Stop ball on line on command",
            "Walk with ball, counting touches",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player maintains control while moving at moderate pace. Can change direction and uses both feet. Demonstrates growing confidence and persistence.",
          observableBehaviors: [
            "Dribbles at jogging pace with control",
            "Changes direction without losing ball",
            "Uses both feet (dominant more confident)",
            "Looks up periodically",
            "Basic shielding when challenged",
          ],
          commonMistakes: [
            "Ball escapes at full speed",
            "Weak foot touch is heavier",
            "Loses control when pressured from behind",
            "Takes too many touches in tight spaces",
          ],
          coachingTips: [
            "What happens when you slow down before the ball gets away?",
            "Can you dribble using only your weaker foot for this drill?",
            "How do you protect the ball from someone trying to take it?",
            "When do you need fewer touches versus more?",
            "What do you notice about your control when you're tired?",
          ],
          assessmentActivities: [
            "Cone slalom at jogging pace",
            "1v1 keep-away (passive defender)",
            "Dribble with head up calling out numbers",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player shows confident ball control at speed and under pressure. Uses both feet effectively and can manipulate the ball creatively. Demonstrates composure.",
          observableBehaviors: [
            "Controls ball at full speed",
            "Comfortable using either foot",
            "Maintains control with defender pressing",
            "Creative ball manipulation",
            "Quick directional changes",
          ],
          commonMistakes: [
            "May over-complicate simple situations",
            "Occasionally holds ball too long",
          ],
          coachingTips: [
            "When is simple control better than fancy moves?",
            "How do you decide when to release the ball?",
            "What helps you stay calm when pressured?",
            "Can you create space with just your control?",
            "How does your control help your teammates?",
          ],
          assessmentActivities: [
            "1v1 with active defender",
            "Small-sided game observation",
            "Control under fatigue drills",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player exhibits exceptional close control in tight spaces. Creative and rarely loses possession. Control is a weapon that creates advantages.",
          observableBehaviors: [
            "Elite close control",
            "Creative, unexpected touches",
            "Rarely dispossessed",
            "Controls in any situation",
            "Makes difficult look easy",
          ],
          commonMistakes: [
            "May try to do too much alone",
          ],
          coachingTips: [
            "How can your control help teammates be better?",
            "What new skill are you working on?",
            "How do you teach someone to control like you?",
            "When does the team need your control most?",
            "What separates good control from great control?",
          ],
          assessmentActivities: [
            "Game observation - possession retention",
            "Tight space control challenges",
            "Control under high pressure",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Ball control is developing rapidly at this age. Make it playful - the ball is their friend! Focus on lots of touches rather than perfect technique. Games like 'how many touches in 30 seconds' or 'keep it in the circle' build skills while having fun. Celebrate effort over outcome.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and apply control concepts. Challenge them to use both feet regularly. Introduce the idea of 'controlling with a purpose' - where do you want the ball next? This is an excellent age for building strong ball mastery foundations.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect players to maintain control under pressure. Challenge them with game-realistic situations. Discuss how ball control creates time and space. The psychological aspect - staying calm when pressured - becomes as important as the technical skill.",
        },
      },

      redFlags: [
        "No improvement in control after extended practice",
        "Persistent avoidance of having the ball",
        "Extreme frustration leading to giving up",
        "Physical issues affecting balance or coordination",
        "Cannot control stationary ball after multiple months of practice",
      ],

      parentExplanation:
        "Ball control is the foundation of all soccer skills. We teach players to use 'soft feet' - cushioning the ball and keeping it close. At home, any time with a ball at their feet helps: dribbling in the yard, rolling against a wall, even juggling attempts. The key is lots of touches. Don't worry about perfection - comfort with the ball comes from repetition. Ask them to show you what they practiced; this builds their confidence and helps them teach you!",

      homeActivities: [
        "Free dribbling in yard or park",
        "Obstacle course around household items",
        "Ball mastery routines (toe taps, etc.)",
        "Juggling practice (any number counts!)",
        "Wall ball: control the rebound",
        "Dribble while watching TV (commercial breaks)",
      ],

      bestAssessedIn: [
        "Warm-up ball mastery",
        "Dribbling activities",
        "Small-sided games",
        "1v1 situations",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across multiple ball control situations (5-10 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 7: Passing (General)
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.passing]: {
    progressionLevels: {
      1: "Passes inaccurate and weak; wrong part of foot; cannot complete short passes consistently",
      2: "Can complete short passes to stationary targets; technique developing; accuracy inconsistent",
      3: "Accurate short and medium passes; leads moving players; uses inside and outside of foot",
      4: "Crisp passing in game situations; excellent weight; creates advantages with passing",
      5: "Elite passer; sees plays developing; makes teammates better; passing is a weapon",
    },

    observableBehaviors: [
      "Uses inside of foot for short/medium passes",
      "Passes arrive at teammate-friendly pace",
      "Leads moving receivers appropriately",
      "Body opens toward target before pass",
      "Selects correct passing technique for situation",
    ],

    commonMistakes: [
      "Using toe instead of proper surface",
      "No follow-through toward target",
      "Passing behind moving teammates",
      "Same power for all distances",
      "Looking only at ball not target",
    ],

    coachingTips: [
      "Where is your teammate going - can you pass where they will be?",
      "How hard do you need to kick for the ball to reach your partner?",
      "What part of your foot gives you the most accuracy?",
      "Can you show your teammate you're about to pass?",
      "What do you see before you pass - the ball or the target?",
    ],

    tags: ["core", "technical", "fundamental", "passing", "teamwork", "connection"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning that passing connects teammates. Accuracy is developing and passes often miss. Every attempt builds understanding of teamwork and technique.",
          observableBehaviors: [
            "Passes frequently miss target",
            "Uses toe or incorrect surface",
            "Weak passes don't reach partner",
            "No awareness of target during pass",
            "Standing foot position random",
          ],
          commonMistakes: [
            "Kicking with toe",
            "Looking at ball not partner",
            "Standing foot pointing wrong way",
            "Rushing without preparation",
          ],
          coachingTips: [
            "Passing is sharing - can you share the ball with your friend?",
            "Show me the inside of your foot - that's for passing!",
            "Can you look at your partner's feet before you pass?",
            "What happens when you push the ball instead of kick it?",
            "Great effort! Where did that one go? Let's try again!",
          ],
          assessmentActivities: [
            "Partner passing at 5 feet",
            "Pass through a gate",
            "Pass to different partners in circle",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can pass to stationary partners at close range. Shows effort to improve and understands passing as teamwork. Technique is developing.",
          observableBehaviors: [
            "Passes reach close stationary targets",
            "Uses inside of foot more often",
            "Beginning to follow through",
            "Some awareness of partner",
            "Dominant foot more accurate",
          ],
          commonMistakes: [
            "Struggles with distance",
            "Moving targets are difficult",
            "Weak foot very inconsistent",
            "Weight of pass often wrong",
          ],
          coachingTips: [
            "Can you pass so the ball stops at your partner's feet?",
            "What changes when you try your other foot?",
            "Where should you aim when your partner is walking?",
            "How does the ball travel when you follow through?",
            "Can you count how many passes in a row you complete?",
          ],
          assessmentActivities: [
            "Pass through gates at various distances",
            "Consecutive pass counting",
            "Pass to slowly moving partner",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player passes accurately at short and medium range. Leads moving teammates and shows good decision-making. Demonstrates connection with partners.",
          observableBehaviors: [
            "Accurate short/medium passes",
            "Leads moving receivers",
            "Appropriate weight on passes",
            "Uses both feet",
            "Body position opens to target",
          ],
          commonMistakes: [
            "Under pressure accuracy drops",
            "Long passes less reliable",
            "May telegraph intentions",
            "Timing occasionally off",
          ],
          coachingTips: [
            "How can you disguise where you're passing?",
            "When is the perfect moment to release the pass?",
            "Can you pass first-time when your partner needs it?",
            "What tells you where your teammate wants the ball?",
            "How does quick passing beat the defender?",
          ],
          assessmentActivities: [
            "Rondo keep-away games",
            "Wall passing combinations",
            "Passing in small-sided games",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player makes crisp, well-weighted passes in game situations. Creates advantages through passing and shows excellent vision. A connector for the team.",
          observableBehaviors: [
            "Crisp passes in games",
            "Excellent weight and timing",
            "Creates advantages for team",
            "Sees options before receiving",
            "Passes under pressure",
          ],
          commonMistakes: [
            "May try too difficult passes",
            "Could be simpler sometimes",
          ],
          coachingTips: [
            "When is the simple pass the best pass?",
            "How do you create passing options for your teammates?",
            "What do you see before the ball even arrives?",
            "How does your passing change how we attack?",
            "Can you recognize the perfect pass versus a good pass?",
          ],
          assessmentActivities: [
            "Complex rondos",
            "Positional possession games",
            "Game observation - passing sequences",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player is an elite passer who sees plays developing and makes teammates better. Passing is a weapon that unlocks defenses. A true playmaker.",
          observableBehaviors: [
            "Elite vision and execution",
            "Sees plays before they develop",
            "Makes teammates better",
            "Creates chances from nothing",
            "Passing unlocks defenses",
          ],
          commonMistakes: [
            "May overestimate teammates",
            "Could become frustrated with less skilled partners",
          ],
          coachingTips: [
            "How do you adjust for different teammates' abilities?",
            "What can you teach others about passing and vision?",
            "How do you stay patient when the perfect pass isn't there?",
            "What do elite passers do differently?",
            "How can your leadership improve our team's passing?",
          ],
          assessmentActivities: [
            "Game observation - assists and key passes",
            "Complex positional play",
            "Playing with less experienced teammates",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Passing is about playing with friends! Focus on the fun of connecting with teammates. Keep distances short and celebrate completed passes. Games where passing earns points make it exciting. Don't worry about perfect technique - the joy of teamwork comes first.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand passing concepts and apply technique. Introduce passing as a team strategy - good teams pass well! Both feet should develop. Rondos and keep-away games build passing skills while teaching teamwork and communication.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect purposeful passing with good technique. Challenge players to pass with intent - every pass should have a reason. Discuss vision: seeing passes before they happen. The social aspect of passing - connecting with teammates - remains important.",
        },
      },

      redFlags: [
        "Consistently refuses to pass even when teammates are open",
        "No improvement in accuracy over several weeks",
        "Becomes very upset when passes are missed",
        "Shows no interest in playing with teammates",
        "Physical discomfort when striking ball",
      ],

      parentExplanation:
        "Passing is the most important team skill in soccer - it connects players and builds the team. We teach using the inside of the foot for accuracy and following through toward the target. At home, passing with family members or against a wall helps develop this skill. Encourage your child to pass with both feet. When watching games together, notice the passing: 'Did you see how they moved the ball?' The best praise: 'Great pass!' when they connect with a teammate.",

      homeActivities: [
        "Family passing in the yard",
        "Wall passing - count consecutive",
        "Pass through targets (cones, chairs)",
        "Passing while walking/jogging",
        "Two-touch passing games",
        "Watch games together - notice great passes",
      ],

      bestAssessedIn: [
        "Partner warm-up passing",
        "Rondo/keep-away games",
        "Small-sided games",
        "Possession exercises",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across multiple passing situations (5-10 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 8: Receiving (General)
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.receiving]: {
    progressionLevels: {
      1: "Ball bounces away on most attempts; cannot cushion; needs multiple touches to control",
      2: "Can receive slow balls; cushioning developing; struggles with firm passes",
      3: "Receives with good first touch; cushions into space; prepares for next action",
      4: "Excellent first touch in all directions; receives under pressure; touch creates advantages",
      5: "Elite receiving - first touch is a weapon; controls any ball; creates time and space instantly",
    },

    observableBehaviors: [
      "Moves to meet the ball (doesn't wait)",
      "Presents receiving surface early",
      "Cushions on contact (withdraws foot)",
      "First touch sets up next action",
      "Body position allows view of field",
    ],

    commonMistakes: [
      "Standing still waiting for ball",
      "Stiff ankle (ball bounces)",
      "Body closed off from field",
      "First touch random in direction",
      "Only receiving to one foot",
    ],

    coachingTips: [
      "Can you catch the ball with your foot like catching with your hands?",
      "Where do you want the ball to go after you receive it?",
      "What happens when you move toward the ball instead of waiting?",
      "Before the ball arrives, where are you looking?",
      "Can you receive so you're ready to pass immediately?",
    ],

    tags: ["core", "technical", "fundamental", "receiving", "first-touch", "control"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning to control incoming balls. The ball often escapes and multiple touches are needed. Every attempt builds the foundation for a good first touch.",
          observableBehaviors: [
            "Ball bounces away from foot",
            "Needs 3+ touches to control",
            "Reaches toward ball (off balance)",
            "No cushioning motion visible",
            "Stands waiting for ball",
          ],
          commonMistakes: [
            "Stabbing at ball",
            "Ankle locked stiff",
            "Flat-footed waiting",
            "Eyes only on ball",
          ],
          coachingTips: [
            "Pretend you're catching a water balloon - soft!",
            "What happens when you pull your foot back as the ball arrives?",
            "Can you move to meet the ball like greeting a friend?",
            "Show me how you catch with your hands - now try with your foot!",
            "Where did the ball bounce? What could we try next time?",
          ],
          assessmentActivities: [
            "Receive gently rolled balls",
            "Self-toss and receive",
            "Stop ball on a line",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can receive slower balls and shows developing technique. Effort to control is evident and cushioning is beginning to emerge.",
          observableBehaviors: [
            "Stops slowly rolled balls",
            "Beginning cushioning motion",
            "1-2 touches to control",
            "Uses correct foot surface",
            "Growing confidence",
          ],
          commonMistakes: [
            "Firm passes bounce away",
            "Touch goes straight down",
            "Still reaching sometimes",
            "Only comfortable one side",
          ],
          coachingTips: [
            "Can you receive so the ball is ready for your next touch?",
            "What happens if you take a small step toward the ball?",
            "Where do you want the ball to go after you receive?",
            "Can you look up after your first touch?",
            "How is receiving on your left different from your right?",
          ],
          assessmentActivities: [
            "Receive and pass back",
            "Receive and turn",
            "Receive across body",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player receives with a quality first touch. Cushions into space and prepares for the next action. Shows growing awareness and decision-making.",
          observableBehaviors: [
            "Controls firm passes",
            "Cushions into chosen direction",
            "First touch sets up next action",
            "Body open to field",
            "Uses both feet",
          ],
          commonMistakes: [
            "Touch under pressure heavier",
            "Sometimes wrong direction",
            "Could be quicker",
            "Predictable touch direction",
          ],
          coachingTips: [
            "Before the ball arrives, where do you want it to go?",
            "What tells you which direction to take your touch?",
            "How can your first touch beat the defender?",
            "Can you already know your next pass before receiving?",
            "What do great players do with their first touch?",
          ],
          assessmentActivities: [
            "Receive under passive pressure",
            "First touch and finish",
            "Receive and combination play",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player's first touch is excellent in all directions. Creates time and space even under pressure. Demonstrates composure and intelligence.",
          observableBehaviors: [
            "First touch beats pressure",
            "Receives any direction",
            "Creates time and space",
            "Knows options before receiving",
            "Touch leads to positive play",
          ],
          commonMistakes: [
            "Occasionally too ambitious",
            "Could be simpler sometimes",
          ],
          coachingTips: [
            "When is a safe touch better than a creative one?",
            "How do you read the defender to choose your direction?",
            "What can you see before the ball arrives?",
            "How does your touch affect your teammates' runs?",
            "When has your first touch created a scoring chance?",
          ],
          assessmentActivities: [
            "Receive under active pressure",
            "Small-sided games - first touch quality",
            "Receive and shoot",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player's first touch is a weapon. Creates opportunities that don't exist for others. Controls any ball with apparent ease and elegance.",
          observableBehaviors: [
            "First touch is a weapon",
            "Controls any ball effortlessly",
            "Creates chances with touch",
            "Calm under any pressure",
            "Makes receiving look easy",
          ],
          commonMistakes: [
            "May make it look too easy for others to understand",
          ],
          coachingTips: [
            "How can you help teammates improve their touch?",
            "What do you think about before the ball arrives?",
            "How did you develop such a great first touch?",
            "What's the hardest ball to control?",
            "Can you explain your receiving to help others?",
          ],
          assessmentActivities: [
            "Game observation - first touch quality",
            "Tight space receiving",
            "Difficult ball control challenges",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "First touch takes years to develop - be patient! Use gentle passes and celebrate all successful controls. Make it playful: 'Can you catch the ball with your foot?' Games where stopping the ball earns points build motivation. Short practice bursts work best.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand cushioning technique. Introduce receiving into space - not just stopping the ball. Challenge them to look up after receiving. Both feet should develop. Partner work is both skill-building and socially valuable.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect players to receive with purpose. First touch should set up the next action. Add game-realistic pressure. Discuss what elite players see before receiving. The composure aspect becomes as important as technique.",
        },
      },

      redFlags: [
        "Avoids receiving the ball in games",
        "No improvement in cushioning after extended time",
        "Flinches or pulls away from incoming balls",
        "Anxiety when ball is passed to them",
        "Physical discomfort when receiving",
      ],

      parentExplanation:
        "Receiving is about 'cushioning' the ball - pulling your foot back as the ball arrives, like catching an egg. This keeps the ball close for the next action. At home, rolling or passing balls gently helps enormously. Start easy and increase pace as they improve. Key phrase: 'soft feet.' Notice when they control a ball well: 'Nice touch!' The goal is comfort with incoming balls - this comes from lots of practice in a pressure-free environment.",

      homeActivities: [
        "Wall rebounds - receive the return",
        "Partner pass and cushion",
        "Self-toss and control",
        "Receive with eyes closed (builds feel)",
        "Receive and turn different directions",
        "Watch pros - notice first touches",
      ],

      bestAssessedIn: [
        "Passing and receiving warm-ups",
        "Small-sided games",
        "Technical circuits",
        "Game observation",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across multiple receiving situations (5-10 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 9: Shooting (General)
  // ═══════════════════════════════════════════════════════════════════════════
  [SKILL_IDS.shooting]: {
    progressionLevels: {
      1: "Shots weak and inaccurate; often misses target completely; technique inconsistent",
      2: "Can shoot on target from close range; power developing; technique improving",
      3: "Shoots with power and accuracy; can shoot moving ball; makes good decisions",
      4: "Powerful, accurate shots in game situations; variety of techniques; confident finisher",
      5: "Elite finishing ability; clinical with both feet; creates and converts chances; natural scorer",
    },

    observableBehaviors: [
      "Strikes ball with appropriate surface (laces for power, inside for placement)",
      "Plants foot beside ball pointing at target",
      "Head down over ball at contact",
      "Follow-through toward target",
      "Selects appropriate technique for situation",
    ],

    commonMistakes: [
      "Using toe to shoot",
      "Leaning back (ball goes high)",
      "Planting foot too far from ball",
      "No follow-through",
      "Shooting without looking at goal",
    ],

    coachingTips: [
      "Where is the goal - did you look before you shot?",
      "What happens to the ball when you lean over it versus lean back?",
      "Can you pick your spot before shooting?",
      "Which part of your foot gives you power? Which gives placement?",
      "What do you see in the goal before deciding where to shoot?",
    ],

    tags: ["core", "technical", "fundamental", "shooting", "finishing", "attacking", "scoring"],

    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player is learning to strike the ball with intent. Shots are often off target and technique is developing. Scoring is the most fun part - keep it positive!",
          observableBehaviors: [
            "Shots miss target often",
            "Little power generated",
            "Uses toe frequently",
            "Must stop to shoot",
            "No awareness of goal position",
          ],
          commonMistakes: [
            "Toe-poking habit",
            "Looking down during shot",
            "Standing foot pointing wrong way",
            "No approach angle",
          ],
          coachingTips: [
            "Can you show me your laces? That's for shooting!",
            "Before you shoot, take a quick peek at the goal!",
            "What happens when you kick through the ball?",
            "Can you point your toe down like a ballerina?",
            "Great try! Let's see where that one goes next time!",
          ],
          assessmentActivities: [
            "Shoot at large goal from 8 yards",
            "Strike stationary ball at targets",
            "Slow approach and shoot",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can hit the target from close range. Power is developing and technique is improving. Shows desire to score and celebrates successes.",
          observableBehaviors: [
            "Hits target from close range",
            "Uses laces more often",
            "Some power developing",
            "Shoots stationary ball well",
            "Shows enthusiasm to shoot",
          ],
          commonMistakes: [
            "Moving ball is harder",
            "Leans back sometimes",
            "Only uses dominant foot",
            "Accuracy from distance poor",
          ],
          coachingTips: [
            "What happens when you stay over the ball?",
            "Can you shoot a rolling ball the same way?",
            "Where should your chest be when you shoot?",
            "How does the ball fly when you follow through high versus low?",
            "Can you hit the same spot three times in a row?",
          ],
          assessmentActivities: [
            "Shoot at target zones",
            "Rolling ball finishing",
            "Shooting from angles",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player shoots with power and accuracy. Can shoot moving balls and makes reasonable decisions about when to shoot. Growing confidence.",
          observableBehaviors: [
            "Powerful shots on target",
            "Strikes moving ball well",
            "Good technique consistent",
            "Shoots from various positions",
            "Both feet developing",
          ],
          commonMistakes: [
            "Technique suffers under pressure",
            "Sometimes blasts when placement better",
            "Weak foot noticeably weaker",
            "May shoot when pass is better",
          ],
          coachingTips: [
            "When do you power it versus place it?",
            "What do you see before deciding where to shoot?",
            "Is scoring more about power or accuracy?",
            "How do you stay calm when the shot matters?",
            "Can you focus on your weaker foot this week?",
          ],
          assessmentActivities: [
            "Shooting with passive defender",
            "Receive and shoot",
            "Weak foot shooting",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Player shoots powerfully and accurately in games. Uses variety of techniques and makes smart decisions. Confident and composed finisher.",
          observableBehaviors: [
            "Consistent in game situations",
            "Variety of shooting techniques",
            "Smart shooting decisions",
            "Comfortable both feet",
            "Confident near goal",
          ],
          commonMistakes: [
            "May force shots occasionally",
            "Could be more clinical in key moments",
          ],
          coachingTips: [
            "How do you know when it's the right time to shoot?",
            "What goes through your mind just before shooting?",
            "How do you stay calm when the game is on the line?",
            "What can make you even more clinical?",
            "When is passing to a teammate in better position the right choice?",
          ],
          assessmentActivities: [
            "Shooting under pressure",
            "Game finishing observation",
            "1v1 with goalkeeper",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Player is an elite finisher. Clinical with both feet and creates scoring chances. Shows ice-cold composure and natural scoring instincts.",
          observableBehaviors: [
            "Clinical finishing",
            "Scores with both feet",
            "Creates own chances",
            "Calm in pressure moments",
            "Natural goal-scoring instinct",
          ],
          commonMistakes: [
            "May become overly focused on personal scoring",
          ],
          coachingTips: [
            "How do you stay so composed?",
            "What do you see that others might miss?",
            "How can you help teammates become better finishers?",
            "What's your routine before a big moment?",
            "When is setting up a teammate better than shooting?",
          ],
          assessmentActivities: [
            "Goal statistics in games",
            "High-pressure finishing",
            "Creating and finishing",
          ],
        },
      },

      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Scoring goals is the highlight of soccer! Focus on fun and celebration over technique. Use larger goals and let them score often - success builds love for the game. Don't worry about perfect form; the joy of seeing the ball hit the net is what matters most.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can understand shooting technique. Introduce 'picking your spot' in the goal. Work on both feet regularly. Shooting games and competitions make practice engaging. Help them understand that missing is part of the journey to scoring.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Expect good technique and smart decisions about when to shoot. Challenge with realistic pressure. Discuss the mental game: confidence after missing, composure in big moments. Weak foot competence becomes important.",
        },
      },

      redFlags: [
        "Avoids shooting even when clearly open",
        "Persistent toe-poking despite instruction",
        "Extreme negative reaction to missing",
        "Physical discomfort when shooting",
        "No power development over time",
      ],

      parentExplanation:
        "Shooting is about striking through the ball with the laces for power, or inside of foot for accuracy. We teach: plant foot beside ball pointing at target, lock ankle, toe down, follow through. At home, any shooting practice helps - targets on a wall, shooting at cones. Remember: the best scorers miss a lot! They keep shooting with confidence. Encourage using their weaker foot too. When they score: celebrate! When they miss: 'Good try, keep shooting!'",

      homeActivities: [
        "Target shooting at cones or markers",
        "Wall shooting with target zones",
        "Shooting competitions with family",
        "Practice striking motion without ball",
        "Watch goal compilations - study technique",
        "Weak foot shooting challenge",
      ],

      bestAssessedIn: [
        "Shooting drills",
        "Finishing games",
        "Small-sided games",
        "1v1 with keeper",
      ],
      assessmentFrequency: "Weekly observation, formal assessment monthly",
      assessmentDuration: "Observe across multiple shooting situations (5-10 minutes)",
    },
  },
};

export async function upgradeSoccerSkills() {
  console.log("Upgrading soccer skills with comprehensive assessment guides...");

  let upgraded = 0;
  let errors = 0;

  for (const [skillId, upgradeData] of Object.entries(skillUpgrades)) {
    try {
      console.log(`  Upgrading skill: ${skillId}...`);

      await db
        .update(skills)
        .set({
          progressionLevels: upgradeData.progressionLevels,
          observableBehaviors: upgradeData.observableBehaviors,
          commonMistakes: upgradeData.commonMistakes,
          coachingTips: upgradeData.coachingTips,
          tags: upgradeData.tags,
          comprehensiveGuide: upgradeData.comprehensiveGuide,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, skillId));

      upgraded++;
      console.log(`    Updated successfully.`);
    } catch (error) {
      errors++;
      console.error(`    Error updating skill ${skillId}:`, error);
    }
  }

  console.log(`\nSoccer skills upgrade complete!`);
  console.log(`  Upgraded: ${upgraded}`);
  console.log(`  Errors: ${errors}`);

  return { upgraded, errors };
}

// Export for use in seed runner
export default upgradeSoccerSkills;

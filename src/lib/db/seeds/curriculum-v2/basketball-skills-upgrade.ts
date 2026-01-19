/**
 * Basketball Skills Upgrade - Comprehensive Assessment Guides
 *
 * This seed file UPDATES existing basketball skills with comprehensive assessment guides.
 * Each skill is upgraded with:
 * - Detailed 5-level progression definitions
 * - Observable behaviors at each level
 * - Common mistakes and corrections
 * - Age-appropriate expectations
 * - Red flags for additional support
 * - Parent communication templates
 * - Home activities for skill development
 *
 * Skills upgraded (Fundamentals stage):
 * TECHNICAL: Stationary Ball Handling, Two-Hand Chest Pass, Two-Hand Bounce Pass, Form Shooting, Layups - Dominant Hand
 * PHYSICAL: Athletic Stance
 * TACTICAL: Spacing Awareness
 * PSYCHOLOGICAL: Effort & Hustle
 *
 * Guidelines followed:
 * - Uses guiding questions (not just commands) in coaching tips
 * - Includes ELM framework language (Effort, Learning, Mistakes)
 * - Makes behaviors observable and measurable
 * - Uses age-appropriate expectations
 * - Includes holistic development connections (psychological/social)
 */

import { getDb } from "../../index";
import { skills } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

// Skill IDs to update
const SKILL_IDS = {
  stationaryBallHandling: "bb6768e3-621c-476a-b31e-dc53889f8fae",
  twoHandChestPass: "1da2901e-8ae4-4842-88ea-03984207f714",
  twoHandBouncePass: "bb84d4c2-29aa-42c6-b42e-f2a143c85e79",
  formShooting: "a7164350-0153-4fd7-81e7-790dc944f768",
  layupsDominantHand: "532efce6-e5b5-4772-a2fc-f40aa0480774",
  athleticStance: "2fef335b-e69b-46ae-9ac3-11b853d9bdf4",
  spacingAwareness: "240cb5c7-dafd-4434-a115-8a0e470d2be1",
  effortAndHustle: "4b847463-4db4-4237-9101-b5ef485b040c",
} as const;

export async function upgradeBasketballSkills() {
  console.log("Upgrading basketball skills with comprehensive assessment guides...");

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 1: Stationary Ball Handling (technical)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Stationary Ball Handling...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Loses ball frequently when stationary; slaps at ball with palm; watches ball constantly; cannot maintain rhythm",
        2: "Can maintain basic stationary dribble with dominant hand; some fingertip control developing; still looks at ball often",
        3: "Confident stationary dribble with both hands; uses fingertips consistently; can look up occasionally while dribbling",
        4: "Excellent stationary control with both hands; performs moves like crossovers and between legs; head up most of time",
        5: "Elite stationary ball handling; creative combinations; full court vision while handling; ambidextrous mastery",
      },
      observableBehaviors: [
        "Uses fingertips rather than palm to control ball",
        "Maintains consistent dribble rhythm without losing ball",
        "Keeps ball at or below waist height",
        "Demonstrates ability to dribble with both hands",
        "Shows head-up position while maintaining dribble",
      ],
      commonMistakes: [
        "Slapping ball with flat palm instead of fingertips",
        "Dribbling too high (above waist)",
        "Looking down at the ball constantly",
        "Standing straight up without athletic bend",
        "Using only dominant hand exclusively",
      ],
      coachingTips: [
        "What part of your hand is touching the ball - palm or fingertips?",
        "Can you feel the ball with your fingertips like you're playing piano?",
        "How low can you keep your dribble while staying in control?",
        "What do you see when you look up? Can you tell me what's happening around you?",
        "Mistakes are learning opportunities - what did you notice when the ball got away?",
      ],
      tags: ["core", "technical", "fundamental", "ball-handling", "dribbling", "stationary"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is just beginning to learn ball control. The ball frequently bounces away and the player must watch it constantly to maintain any control.",
            observableBehaviors: [
              "Ball escapes within 5-10 dribbles",
              "Eyes fixed on the ball throughout",
              "Uses palm/flat hand to hit ball",
              "Stands upright without athletic stance",
              "Only attempts dominant hand",
              "Appears frustrated when ball escapes",
            ],
            commonMistakes: [
              "Hitting ball downward instead of pushing",
              "Fingers together instead of spread",
              "No rhythm or timing to dribbles",
              "Body tense and stiff",
            ],
            coachingTips: [
              "Let's start simple - can you bounce the ball and catch it 5 times?",
              "Spread your fingers wide like a starfish - now feel the ball",
              "It's okay when the ball bounces away - that's how we learn! What can you try differently?",
              "Push the ball down like you're pushing on a spring",
              "Celebrate effort: 'You kept trying even when it was hard!'",
            ],
            assessmentActivities: [
              "Count consecutive stationary dribbles (target: 10)",
              "Fingertip check - can they show spread fingers on ball?",
              "Ball slap drill - alternating hands on top of ball",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can maintain a stationary dribble with dominant hand for extended periods. Fingertip control is developing but inconsistent.",
            observableBehaviors: [
              "Maintains 20+ consecutive dribbles with dominant hand",
              "Beginning to use fingertips more consistently",
              "Glances up occasionally then back to ball",
              "Shows some rhythm in dribble",
              "Weak hand very inconsistent",
              "More relaxed body position",
            ],
            commonMistakes: [
              "Reverts to palm when tired or challenged",
              "Dribble height creeps up over time",
              "Weak hand attempts result in lost ball",
              "Stops dribbling to look up",
            ],
            coachingTips: [
              "What happens to your dribble when you get tired? How can you stay focused?",
              "Can you dribble 10 times with your other hand? What feels different?",
              "Try looking at my fingers - how many am I holding up while you dribble?",
              "Learning happens when we challenge ourselves - your weak hand needs practice too!",
              "What's one thing you're doing better than last week?",
            ],
            assessmentActivities: [
              "Timed stationary dribble - 30 seconds each hand",
              "Look-up challenge - identify colors/numbers while dribbling",
              "Weak hand count - how many before losing control?",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Confident stationary dribbler with both hands. Consistently uses fingertips and can maintain control while looking up.",
            observableBehaviors: [
              "Both hands can maintain 30+ dribbles",
              "Fingertip control is consistent",
              "Head up 50%+ of time",
              "Can answer questions while dribbling",
              "Attempts basic moves (crossover)",
              "Shows confidence and enjoyment",
            ],
            commonMistakes: [
              "Crossovers still telegraphed and slow",
              "Weak hand still noticeably weaker",
              "Ball control decreases when attempting moves",
              "May rush moves instead of staying controlled",
            ],
            coachingTips: [
              "What move could you add to keep a defender guessing?",
              "When you do a crossover, where should your eyes be looking?",
              "How does it feel when you use your weak hand now versus a month ago?",
              "Mistakes during practice mean you're pushing yourself - that's growth!",
              "Can you teach a younger player what you've learned about fingertip control?",
            ],
            assessmentActivities: [
              "Crossover drill - 10 controlled crossovers",
              "Conversation dribble - maintain while talking to coach",
              "Alternating hand drill - switch every 5 dribbles",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Excellent stationary ball handler who uses both hands effectively. Performs multiple moves and maintains court vision.",
            observableBehaviors: [
              "Both hands nearly equal in control",
              "Executes crossovers, between legs, behind back",
              "Head up 80%+ of time",
              "Can read and react while handling",
              "Smooth transitions between moves",
              "Demonstrates creativity and confidence",
            ],
            commonMistakes: [
              "May over-dribble when simpler is better",
              "Some moves still more comfortable than others",
              "Speed of moves could improve",
            ],
            coachingTips: [
              "When is the right time to use a fancy move versus keeping it simple?",
              "What's your go-to move? What's your least comfortable move?",
              "How can you help teammates who are still developing their handles?",
              "Challenge yourself: What new combination can you create?",
            ],
            assessmentActivities: [
              "Combo move challenge - create 3-move sequence",
              "Speed handling drill with quality check",
              "React and handle - respond to visual cues while dribbling",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite stationary ball handler with creative, ambidextrous control. Can perform any move with either hand while maintaining full awareness.",
            observableBehaviors: [
              "Ambidextrous mastery - both hands equal",
              "Creates unique move combinations",
              "Full court vision while handling",
              "Performs moves at game speed",
              "Ball is extension of hand",
              "Leadership in handling drills",
            ],
            commonMistakes: [
              "May try to do too much in game situations",
              "Could simplify when appropriate",
            ],
            coachingTips: [
              "How can you use your skills to make your teammates better?",
              "What new challenge can keep you growing?",
              "Can you mentor younger players on ball handling fundamentals?",
              "Remember: the best handlers know when NOT to use fancy moves",
            ],
            assessmentActivities: [
              "Freestyle handling showcase",
              "Teaching demonstration to younger players",
              "Game situation decision-making observation",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Stationary ball handling is challenging for young players due to developing hand-eye coordination. Focus on fun and lots of touches rather than perfection. Celebrate effort over outcome. Use smaller balls (size 4 or 5) to build confidence. Most important: make it enjoyable so they want to practice at home!",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "This is the golden age for developing ball handling. Players can now understand and apply fingertip control. Introduce weak hand work consistently. Use games and challenges to maintain engagement. Connect effort to improvement - help them see their progress. Most will show significant improvement with regular practice.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Players should show competent control with both hands. Focus on adding moves and combinations. Emphasize quality over quantity of moves. Connect ball handling to game situations. Encourage creativity while maintaining fundamentals. This age can handle more detailed technical feedback.",
          },
        },
        redFlags: [
          "No improvement in consecutive dribbles after 4+ weeks of practice",
          "Persistent palm-hitting despite consistent coaching",
          "Extreme frustration that impacts willingness to practice",
          "Physical coordination issues affecting multiple motor skills",
          "Avoidance of ball handling activities entirely",
        ],
        parentExplanation:
          "Stationary ball handling is the foundation for all basketball dribbling skills. We focus on 'fingertip control' - using spread fingers rather than the palm to push and guide the ball. This takes thousands of touches to develop! Your child is learning that mistakes are part of the process. The best thing you can do at home: provide opportunities to handle a basketball. Any time with a ball in their hands helps - dribbling while watching TV, bouncing in the driveway, or just carrying a ball around builds comfort and control.",
        homeActivities: [
          "Dribble while watching TV (commercial break challenges)",
          "Two-ball dribbling for advanced challenge",
          "Dribble on different surfaces (grass is harder!)",
          "Fingertip push-ups on the basketball",
          "Count how many dribbles in 30 seconds each hand",
          "Ball squeeze exercises for hand strength",
        ],
        bestAssessedIn: [
          "Warm-up handling drills",
          "Stationary skill stations",
          "Individual practice time",
          "At-home practice videos",
        ],
        assessmentFrequency: "Every 2-3 weeks observation, formal assessment monthly",
        assessmentDuration: "30-60 seconds of focused observation per assessment activity",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.stationaryBallHandling));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 2: Two-Hand Chest Pass (technical)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Two-Hand Chest Pass...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Pass lacks power and accuracy; incorrect hand position; ball floats or bounces unpredictably",
        2: "Can make short chest passes to stationary target; inconsistent accuracy; developing proper form",
        3: "Accurate chest passes at medium distance; proper thumbs-down follow-through; can hit moving target",
        4: "Crisp, accurate passes at various distances; good decision-making; leads receivers appropriately",
        5: "Elite passing vision and execution; creates scoring opportunities; perfectly weighted passes",
      },
      observableBehaviors: [
        "Holds ball at chest level with fingers spread on sides",
        "Steps toward target when passing",
        "Thumbs point down on follow-through",
        "Ball arrives at receiver's chest level",
        "Pass has appropriate speed - not too hard or soft",
      ],
      commonMistakes: [
        "Holding ball too high or too low",
        "Pushing with palms instead of fingers",
        "No step toward target",
        "Thumbs up instead of down on release",
        "Passing behind or at feet of moving teammate",
      ],
      coachingTips: [
        "Where should the ball be when you start - can you show me chest level?",
        "What direction do your thumbs point when you finish the pass?",
        "Where is your teammate going to be, not where they are now?",
        "Every pass is a chance to help a teammate - what makes an easy catch?",
        "If the pass wasn't perfect, what would you try differently?",
      ],
      tags: ["core", "technical", "fundamental", "passing", "teamwork"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is learning the basic motion of a chest pass. Passes lack power and direction, often bouncing or floating unpredictably.",
            observableBehaviors: [
              "Ball held incorrectly (too high, too low, wrong grip)",
              "No stepping motion with pass",
              "Ball bounces multiple times or floats high",
              "Passes miss target by significant margin",
              "Receiver has difficulty catching pass",
              "Little to no follow-through",
            ],
            commonMistakes: [
              "Throwing like a shot put",
              "Fingers pointing forward instead of behind ball",
              "Standing flat-footed",
              "Releasing ball at wrong height",
            ],
            coachingTips: [
              "Let's start by holding the ball together - where are your thumbs?",
              "Can you step toward me like you're taking a big step to say hello?",
              "Push the ball to your partner like you're opening a door",
              "When the ball doesn't go where you wanted, that's information! What can you adjust?",
              "Nice effort! I can see you're really trying to step and push",
            ],
            assessmentActivities: [
              "Partner passing at 6 feet - count catches out of 10",
              "Wall passing - see if ball returns to chest",
              "Grip check - can they show proper hand position?",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can complete short chest passes to a stationary partner. Form is developing but inconsistent, especially under any pressure.",
            observableBehaviors: [
              "Makes 5-6 of 10 passes at short distance",
              "Beginning to step toward target",
              "Thumbs-down follow-through sometimes",
              "Passes catchable but not always at chest",
              "Can describe proper technique",
              "More confident with familiar partners",
            ],
            commonMistakes: [
              "Inconsistent starting position",
              "Step too small or absent when rushed",
              "Variable pass height",
              "Accuracy decreases with distance",
            ],
            coachingTips: [
              "What's your checklist before you pass? Ball at chest, thumbs behind, step and push!",
              "Try passing to a spot on the wall - can you hit the same spot 5 times?",
              "When the pass goes high, what might have happened with your release?",
              "You're getting more consistent - what feels different now?",
              "Learning means trying, adjusting, trying again. You're doing that!",
            ],
            assessmentActivities: [
              "Partner passing at 10 feet - accuracy check",
              "Target passing - hit marked spot on wall",
              "Moving receiver introduction - slow walk",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Makes accurate chest passes at medium distances. Shows proper form consistently and can pass to moving teammates.",
            observableBehaviors: [
              "Accurate 8+ of 10 passes at 15 feet",
              "Consistent thumbs-down follow-through",
              "Leads moving receivers appropriately",
              "Pass speed matches situation",
              "Can complete passes in drills",
              "Adjusts to different receivers",
            ],
            commonMistakes: [
              "May struggle under defensive pressure",
              "Decision-making still developing",
              "Long passes less accurate",
              "Can be predictable with timing",
            ],
            coachingTips: [
              "When you have a defender nearby, what changes about your pass?",
              "Where does your teammate need the ball to catch it in stride?",
              "What tells you when to pass versus when to hold the ball?",
              "Your form is solid - now let's work on reading the game. What do you see before you pass?",
              "Great adjustment on that pass! You noticed they were moving faster",
            ],
            assessmentActivities: [
              "Moving partner passing drill",
              "Pass with passive defender present",
              "Decision game - pass or hold based on cue",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Executes crisp, accurate passes in game situations. Shows good vision and makes appropriate decisions about when and where to pass.",
            observableBehaviors: [
              "Accurate in game situations",
              "Good pass fakes",
              "Reads defenders well",
              "Consistent under pressure",
              "Creates passing angles",
              "Supports teammates' positioning",
            ],
            commonMistakes: [
              "Occasional forced pass into traffic",
              "May try difficult pass when simple works",
              "Can be too unselfish at times",
            ],
            coachingTips: [
              "When is the right time to make the flashy pass versus the simple one?",
              "How can you help your teammate get open for your pass?",
              "What do you look for before deciding to pass?",
              "Your passing makes teammates better - how does that feel?",
              "You're becoming someone others want to play with. That's real impact!",
            ],
            assessmentActivities: [
              "Game observation - passing decisions",
              "2v1 passing drill",
              "Full-court passing accuracy test",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite passer with exceptional vision and execution. Creates scoring opportunities for teammates and makes everyone around them better.",
            observableBehaviors: [
              "Sees passing lanes others miss",
              "Perfect weight on every pass",
              "Creates easy baskets for teammates",
              "Rarely turns ball over on passes",
              "Leads team in assists in games",
              "Teammates seek to play with them",
            ],
            commonMistakes: [
              "May expect teammates to read plays the same way",
              "High expectations of others' hands",
            ],
            coachingTips: [
              "How can you help teammates understand where you'll look to pass?",
              "What can you teach younger players about passing?",
              "Your gift is making others better. How do you want to use that?",
              "Continue challenging yourself - what pass can't you make yet?",
            ],
            assessmentActivities: [
              "Game assist tracking",
              "Teaching demonstration",
              "Advanced passing combinations",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Chest passing requires coordination and strength that young players are still developing. Use lighter balls and shorter distances. Focus on the fun of connecting with a partner rather than perfect technique. Celebrate successful catches, not just successful passes. Partner games make passing enjoyable and social.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players can now understand and apply passing technique. Increase distances gradually as strength improves. Introduce passing to moving targets. Emphasize teamwork aspect - 'A great pass makes your teammate look good.' Connect passing to basketball's team nature. This is prime time for building passing habits.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect competent chest passes in practice situations. Focus on decision-making and game application. Introduce pass fakes and reading defenders. Discuss court vision and anticipation. Connect passing excellence to team success and being a good teammate.",
          },
        },
        redFlags: [
          "Cannot complete basic pass to stationary partner at 6 feet after multiple sessions",
          "Persistent incorrect grip despite repeated instruction",
          "Fear of having ball thrown to them (may indicate past negative experience)",
          "Significant arm/shoulder weakness affecting all throwing motions",
          "Frustration that prevents continued effort and learning",
        ],
        parentExplanation:
          "The two-hand chest pass is basketball's most fundamental pass - it's how players share the ball and work together. We teach 'step and push' with thumbs ending down. Passing is really about teamwork and communication. When your child makes a good pass, they're learning to help others succeed. At home, playing catch with any ball develops passing skills. Ask them to show you the 'thumbs down' follow-through - they love teaching what they've learned!",
        homeActivities: [
          "Wall passing practice (ball should return to chest height)",
          "Partner passing in the driveway (count consecutive catches)",
          "Pass to targets on wall (draw a square at chest height)",
          "Play catch while discussing how practice went",
          "Watch basketball games and notice passing",
          "Pass and move games with family",
        ],
        bestAssessedIn: [
          "Partner passing drills",
          "Small-sided games (2v2, 3v3)",
          "Transition drills",
          "Game observation",
        ],
        assessmentFrequency: "Every 2-3 weeks observation, formal assessment monthly",
        assessmentDuration: "Observe across multiple passing situations over 10-15 minutes",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.twoHandChestPass));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 3: Two-Hand Bounce Pass (technical)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Two-Hand Bounce Pass...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot control where ball bounces; incorrect bounce point; pass either too hard or too soft",
        2: "Can make short bounce pass to stationary target; bounce point inconsistent; developing feel for distance",
        3: "Accurate bounce passes at medium distance; hits proper bounce point (2/3 to receiver); leads moving targets",
        4: "Executes bounce passes in traffic; uses pass to avoid defenders' hands; good touch and timing",
        5: "Elite bounce pass execution; perfect timing through traffic; creates scoring chances with precision",
      },
      observableBehaviors: [
        "Ball bounces approximately 2/3 of the way to receiver",
        "Pass arrives at receiver's waist to chest level",
        "Uses bounce pass to go under defender's reach",
        "Appropriate force - ball reaches target with one bounce",
        "Steps toward target with pass",
      ],
      commonMistakes: [
        "Bouncing ball too close (arrives at feet)",
        "Bouncing ball too far (difficult catch)",
        "Pass too hard (bounces too high)",
        "Pass too soft (ball dies short)",
        "Using bounce pass when chest pass is better option",
      ],
      coachingTips: [
        "Where should the ball hit the floor - closer to you or closer to your partner?",
        "What happens to the ball if you push it harder versus softer?",
        "When is a bounce pass better than a chest pass? What problem does it solve?",
        "When the pass didn't reach your partner well, what would you adjust?",
        "Nice problem-solving! You saw the defender's hands up and went underneath",
      ],
      tags: ["core", "technical", "fundamental", "passing", "teamwork"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player is learning the bounce pass concept. Cannot yet control where the ball bounces or how it arrives at the target.",
            observableBehaviors: [
              "Ball bounces randomly - too close or too far",
              "Pass arrives at feet or way off target",
              "No understanding of bounce point",
              "Force is inconsistent - too hard or too soft",
              "Often reverts to chest pass or gives up",
              "Surprised by where ball goes",
            ],
            commonMistakes: [
              "Aiming at partner instead of floor",
              "Not bending knees",
              "Releasing ball too early or late",
              "No follow-through toward floor",
            ],
            coachingTips: [
              "Let's find the bounce spot together - can you bounce the ball so it comes up to your partner's hands?",
              "What happens when you bounce it here versus here? (demonstrate different spots)",
              "Every bounce that doesn't work teaches us something. What did that one tell us?",
              "Try pushing the ball toward the floor like you're pushing a ball down a slide",
              "Good effort experimenting! You're figuring out how the bounce works",
            ],
            assessmentActivities: [
              "Target on floor - can they hit the spot?",
              "Partner passing at 6 feet - 10 attempts",
              "Compare chest pass to bounce pass - when to use each?",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Can complete short bounce passes to stationary targets. Understanding the concept but inconsistent with execution.",
            observableBehaviors: [
              "Makes 4-5 of 10 passes catchable",
              "Beginning to find consistent bounce point",
              "Can explain where to bounce it",
              "Some passes arrive at good height",
              "More comfortable at close range",
              "Shows adjustment after misses",
            ],
            commonMistakes: [
              "Bounce point drifts during drill",
              "Force varies from pass to pass",
              "Struggles with longer distances",
              "Doesn't always step toward target",
            ],
            coachingTips: [
              "What's your target on the floor before you pass?",
              "When that pass arrived at their knees, what needed to change?",
              "Can you bounce pass to that spot 3 times in a row?",
              "You're getting more consistent! What are you doing differently now?",
              "Learning means adjusting. You're doing that every time you try again!",
            ],
            assessmentActivities: [
              "Marked spot on floor - hit 5 of 10",
              "Partner passing at 10 feet",
              "Pass height check - waist to chest arrivals",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Executes accurate bounce passes at medium distance. Understands and hits proper bounce point and can lead moving receivers.",
            observableBehaviors: [
              "7+ of 10 passes accurate and catchable",
              "Consistently hits 2/3 distance bounce point",
              "Passes arrive at appropriate height",
              "Can lead moving teammates",
              "Chooses bounce pass over chest pass appropriately",
              "Adjusts force for distance",
            ],
            commonMistakes: [
              "May struggle with defensive pressure",
              "Timing with moving targets still developing",
              "Occasionally wrong pass selection",
              "Speed of execution could improve",
            ],
            coachingTips: [
              "When you see a defender between you and your teammate, what does that tell you about which pass to use?",
              "How far ahead of your teammate should the bounce be when they're running?",
              "What do you look at to decide bounce pass or chest pass?",
              "Great decision! You recognized when to use the bounce pass",
              "Your understanding is growing. Now let's add game pressure",
            ],
            assessmentActivities: [
              "Moving target bounce pass drill",
              "Decision drill - bounce or chest?",
              "Passive defender in passing lane",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Makes effective bounce passes in game situations with defenders present. Good touch and decision-making.",
            observableBehaviors: [
              "Effective in game settings",
              "Uses bounce pass to beat defenders",
              "Quick execution",
              "Reads situations well",
              "Consistent touch and accuracy",
              "Good pass fakes setup bounce passes",
            ],
            commonMistakes: [
              "Occasional forced pass",
              "May over-rely on bounce pass",
              "Could vary speed more",
            ],
            coachingTips: [
              "What tells you the bounce pass is open versus another option?",
              "How can you use pass fakes to create the bounce pass lane?",
              "When is the bounce pass the wrong choice even if it's open?",
              "You make the right pass most of the time now. What helps you decide?",
              "Your decision-making makes the team better",
            ],
            assessmentActivities: [
              "Game observation - bounce pass effectiveness",
              "2v1 drill with decision emphasis",
              "Entry passes to post player",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite bounce passer who threads passes through traffic with perfect timing. Creates scoring opportunities for teammates.",
            observableBehaviors: [
              "Threading passes through multiple defenders",
              "Perfect touch for every situation",
              "Creates easy baskets for teammates",
              "Excellent timing with cutters",
              "Makes difficult passes look easy",
              "Team's go-to passer in key moments",
            ],
            commonMistakes: [
              "May expect too much from receivers",
              "Occasionally attempts very high difficulty pass",
            ],
            coachingTips: [
              "How can you help teammates anticipate where you'll pass?",
              "What can you teach others about reading the defense?",
              "When should you take the simple pass even when the flashy one is open?",
              "Your passing vision is a gift. How can you continue to grow it?",
            ],
            assessmentActivities: [
              "Game impact observation",
              "Complex passing patterns",
              "Teaching younger players",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Bounce passing is conceptually challenging at this age. Players are still developing spatial awareness needed to hit a bounce point. Keep distances short (6-8 feet) and use visual targets on the floor. Focus on the fun of making the ball bounce to a friend. Don't worry about perfect technique - build comfort with the concept first.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players can now understand and apply bounce pass mechanics. Introduce the 2/3 rule for bounce point. Practice with moving receivers. Connect bounce pass to game situations - 'Use this when there's a tall defender!' This age shows good improvement with focused practice.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect competent bounce passing with understanding of when to use it. Focus on execution under pressure and quick decision-making. Introduce post entry passes and passes to cutting teammates. Connect passing to team offensive concepts.",
          },
        },
        redFlags: [
          "Cannot make ball bounce in general area of target after multiple sessions",
          "No improvement in accuracy over 4+ weeks",
          "Refuses to attempt bounce passes (may indicate frustration or confusion)",
          "Cannot adjust force appropriately despite clear feedback",
          "Difficulty understanding concept of bounce point",
        ],
        parentExplanation:
          "The bounce pass is used to get the ball past defenders - it goes under their outstretched hands! We teach players to bounce the ball about 2/3 of the way to their teammate so it arrives at a catchable height. This requires learning to control both the location and force of the pass. At home, you can practice with any bouncy ball. Set up a target on the ground and see if your child can hit it consistently. The coordination they develop transfers to many other sports and activities.",
        homeActivities: [
          "Chalk target on driveway - hit the X",
          "Partner bounce pass catch game",
          "Wall bounce passing at target height",
          "Bounce pass bowling - knock down targets",
          "One-handed bounce pass practice (advanced)",
          "Count consecutive good bounce passes",
        ],
        bestAssessedIn: [
          "Partner passing drills",
          "Entry pass practice to post area",
          "Small-sided games with emphasis on pass selection",
          "Game observation",
        ],
        assessmentFrequency: "Every 2-3 weeks observation, formal assessment monthly",
        assessmentDuration: "10-15 minutes across multiple passing situations",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.twoHandBouncePass));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 4: Form Shooting (technical)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Form Shooting...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Throws ball toward basket without form; two-handed push; no arc; misses badly most attempts",
        2: "Developing one-hand shot form; inconsistent release; some arc; makes occasional close shots",
        3: "Proper BEEF form (Balance, Eyes, Elbow, Follow-through); consistent arc; makes 40%+ close range",
        4: "Smooth, consistent form from various distances; good arc and rotation; makes 50%+ mid-range",
        5: "Textbook shooting form; high percentage shooter; form maintained under pressure",
      },
      observableBehaviors: [
        "Balanced stance with feet shoulder-width apart",
        "Eyes focused on target (rim or backboard)",
        "Shooting elbow under ball and pointing at target",
        "Follows through with wrist snap - 'reach into the cookie jar'",
        "Ball has proper arc and backspin",
      ],
      commonMistakes: [
        "Two-handed push instead of one-hand release",
        "Shooting elbow out to side ('chicken wing')",
        "No follow-through - shot stops at release",
        "Flat trajectory with no arc",
        "Guide hand influencing the shot",
      ],
      coachingTips: [
        "Can you show me 'shooting hand in the cookie jar' follow-through?",
        "Where is your elbow pointing - at the basket or to the side?",
        "What does BEEF stand for? Let's check each part of your shot",
        "When the shot went left/right, what might your guide hand have done?",
        "Shooting takes thousands of repetitions - every practice is a step forward!",
      ],
      tags: ["core", "technical", "fundamental", "shooting", "scoring"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player throws the ball toward the basket without proper shooting form. Uses two hands equally and ball has little arc.",
            observableBehaviors: [
              "Two-handed push/throw toward basket",
              "No consistent stance or balance",
              "Eyes wander during shot",
              "Ball goes flat without arc",
              "Rarely comes close to basket",
              "No follow-through visible",
            ],
            commonMistakes: [
              "Shooting from chest level",
              "Both hands pushing equally",
              "No leg power involvement",
              "Looking at defender instead of rim",
            ],
            coachingTips: [
              "Let's start with no basket - just shoot up to the sky! Can you make it spin?",
              "Put the ball in your shooting hand only - can you push it straight up?",
              "Where are you looking when you shoot? Find the rim and stay there!",
              "Every shot that doesn't go in teaches us something. What can you adjust?",
              "Great effort! I see you're trying to reach up high on your follow-through",
            ],
            assessmentActivities: [
              "Ball spin drill - can they make ball spin backward?",
              "Close range form shooting (3-5 feet from basket)",
              "Self-pass and catch in shooting position",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Developing one-handed shooting form. Some components present but inconsistent. Makes occasional close shots.",
            observableBehaviors: [
              "Attempting one-hand release",
              "Some follow-through present",
              "Ball has some arc sometimes",
              "Makes 2-3 of 10 from close range",
              "Can describe BEEF components",
              "Guide hand stabilizing ball",
            ],
            commonMistakes: [
              "Guide hand still influencing shot",
              "Elbow often out to side",
              "Inconsistent release point",
              "Balance issues on release",
            ],
            coachingTips: [
              "Let's check your elbow - is it under the ball like a shelf?",
              "What does your guide hand do? It just holds, then waves goodbye!",
              "After you shoot, can you hold your follow-through and show me?",
              "You're making progress! What feels different when the shot goes in?",
              "Mistakes are data. That miss told us something - what was it?",
            ],
            assessmentActivities: [
              "Form shooting at 5-7 feet - 10 shots",
              "BEEF checklist - demonstrate each component",
              "Follow-through hold drill",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Shows proper BEEF form consistently. Good arc and makes 40%+ from close range. Form mostly holds under light pressure.",
            observableBehaviors: [
              "BEEF components present consistently",
              "Good arc on most shots",
              "Makes 4+ of 10 from close range",
              "Follow-through automatic",
              "Balance maintained through shot",
              "Backspin visible on ball",
            ],
            commonMistakes: [
              "Form breaks at longer distances",
              "Rushed shots lose technique",
              "May fade away unnecessarily",
              "Confidence varies by location",
            ],
            coachingTips: [
              "What's the farthest distance where your form stays perfect?",
              "When you miss, is it usually short, long, left, or right? What does that tell us?",
              "How can you keep the same form when you're tired?",
              "Your form is looking consistent. Now let's build range slowly",
              "Great self-correction! You noticed the elbow and fixed it",
            ],
            assessmentActivities: [
              "Form shooting from multiple spots",
              "Game-speed catch and shoot",
              "Shooting after movement",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Smooth, consistent shooting form from various distances. High percentage from mid-range. Form holds under defensive pressure.",
            observableBehaviors: [
              "Consistent form at all distances",
              "Makes 50%+ from mid-range",
              "Good shot selection",
              "Form maintained when contested",
              "Quick release",
              "Confident body language",
            ],
            commonMistakes: [
              "May force difficult shots",
              "Three-point range still developing",
              "Could create more space sometimes",
            ],
            coachingTips: [
              "What's your shooting routine before each game?",
              "How do you maintain form when a defender is close?",
              "When should you pass instead of shoot?",
              "Your shooting makes you valuable to the team. What's next for your development?",
              "You've put in the work. Trust your form!",
            ],
            assessmentActivities: [
              "Contested shooting drill",
              "Game shooting percentage tracking",
              "Various distance consistency test",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Textbook shooting form with high percentage from all areas. Maintains form under game pressure. Team's go-to scorer.",
            observableBehaviors: [
              "Near-perfect form every shot",
              "High percentage shooter",
              "Makes clutch shots",
              "Creates own shot when needed",
              "Form never breaks",
              "Confidence inspires teammates",
            ],
            commonMistakes: [
              "May take too many shots at times",
              "Could involve teammates more occasionally",
            ],
            coachingTips: [
              "How can you help teammates improve their shooting?",
              "What mental routines help you in big moments?",
              "When does the team need you to score versus facilitate?",
              "Continue working to extend range and maintain percentage",
              "Your work ethic is a model for others",
            ],
            assessmentActivities: [
              "Game scoring analysis",
              "Clutch shooting situations",
              "Teaching demonstration",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Shooting is very challenging for young players due to strength requirements. Use lower baskets (8 feet) and smaller balls. Focus on the motion and form rather than making shots. Celebrate proper follow-through regardless of result. Making baskets will come as strength develops - don't sacrifice form for makes.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "This is the critical age for developing proper shooting form. BEEF fundamentals should be taught and reinforced constantly. Strength is improving so more shots will go in. Keep basket height appropriate - better to use a lower basket with good form than a high basket with bad form. Volume of proper repetitions matters most.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Players should have consistent form and be working on range extension. Focus on shooting under pressure and off movement. Introduce shot selection concepts. This age can handle detailed technical feedback. Connect shooting practice to game situations.",
          },
        },
        redFlags: [
          "Persistent two-handed push after extended form work",
          "No improvement in arc/form after 6+ weeks of instruction",
          "Physical limitations preventing proper arm positioning",
          "Extreme frustration that prevents willingness to practice",
          "Fear of shooting that wasn't present before (may indicate negative experience)",
        ],
        parentExplanation:
          "Form shooting is about building the proper mechanics that allow players to shoot accurately and consistently. We use 'BEEF' - Balance, Eyes on target, Elbow under ball, Follow-through. This is a long-term development skill - it takes thousands of repetitions to build muscle memory. At home, you can help by providing a ball and hoop (even a toy hoop for young players). Focus praise on effort and proper form, not whether shots go in. A great follow-through with a miss is better than a made shot with poor form!",
        homeActivities: [
          "Lying down shooting - shoot straight up, catch, repeat (builds form)",
          "Form shooting on mini hoop or lowered basket",
          "Self-pass and shoot drill",
          "Watch favorite players' shooting form in slow motion",
          "Count makes out of 10 from favorite spot",
          "Wall shooting for follow-through practice",
        ],
        bestAssessedIn: [
          "Individual shooting drills",
          "Catch and shoot situations",
          "Game free throw attempts",
          "Warm-up shooting observation",
        ],
        assessmentFrequency: "Weekly observation during shooting drills, formal assessment monthly",
        assessmentDuration: "Observe 10-15 shots from various distances",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.formShooting));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 5: Layups - Dominant Hand (technical)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Layups - Dominant Hand...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot coordinate footwork and shot; wrong foot/hand combination; ball doesn't reach rim",
        2: "Developing footwork; occasional correct foot takeoff; some made layups from close range",
        3: "Consistent footwork; uses backboard effectively; makes 50%+ from short approach",
        4: "Smooth layup from various angles; good finish touch; makes 70%+ in drills",
        5: "Elite finishing; makes layups under contact; creative finishes; ambidextrous capability",
      },
      observableBehaviors: [
        "Takes off from opposite foot (right hand = left foot takeoff)",
        "Drives knee up on shooting side",
        "Uses backboard at proper angle",
        "Soft touch on release",
        "Eyes focused on target throughout",
      ],
      commonMistakes: [
        "Same foot/same hand takeoff",
        "Running too fast, out of control",
        "Shooting directly at rim instead of using backboard",
        "No knee drive - flat jump",
        "Ball released too early or too late",
      ],
      coachingTips: [
        "Which foot should you jump from when shooting with your right hand?",
        "Can you drive your knee up like you're marching in a parade?",
        "Where on the backboard are you aiming - can you show me the spot?",
        "When you missed, was it too hard or too soft? What can you adjust?",
        "The footwork feels awkward at first - that's normal! Keep practicing and it will click",
      ],
      tags: ["core", "technical", "fundamental", "shooting", "layup", "finishing"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player cannot coordinate layup footwork and shooting motion. Uses wrong foot/hand combination and rarely gets ball to rim.",
            observableBehaviors: [
              "Same foot/same hand takeoff",
              "Throws ball at basket without control",
              "No clear footwork pattern",
              "Jumps from both feet or wrong foot",
              "Ball rarely reaches rim",
              "Looks confused about what to do",
            ],
            commonMistakes: [
              "Running through the basket",
              "No jump at all",
              "Two-handed push at basket",
              "Eyes looking everywhere except target",
            ],
            coachingTips: [
              "Let's slow way down - can you take one step and jump?",
              "Which hand is your shooting hand? Now, what's the opposite foot?",
              "Pretend you're stepping over a puddle with your shooting-side knee!",
              "This is tricky at first - everyone struggles. Let's break it into pieces",
              "Great effort! You're getting closer. What felt different on that one?",
            ],
            assessmentActivities: [
              "One step layup (starting close to basket)",
              "Knee drive without ball",
              "Opposite foot/hand identification",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Footwork developing with occasional correct foot takeoff. Makes some layups from close range but inconsistent.",
            observableBehaviors: [
              "Sometimes correct footwork",
              "Getting ball to backboard",
              "Makes 2-3 of 10 layups",
              "Slowing down appropriately",
              "Beginning to use backboard",
              "Can describe proper footwork",
            ],
            commonMistakes: [
              "Reverts to wrong foot under pressure",
              "Inconsistent touch on finish",
              "Approach angle limits options",
              "Still thinking about footwork (not automatic)",
            ],
            coachingTips: [
              "What's your step pattern? Let's say it out loud: step-step-jump!",
              "Which foot did you take off from that time? Was it the right one?",
              "Where should the ball hit the backboard - high, low, or middle of the square?",
              "You're making progress! The footwork is starting to feel more natural, right?",
              "Mistakes help us learn. What did that miss teach you?",
            ],
            assessmentActivities: [
              "Two-step layup drill from both sides",
              "Footwork check - count correct takeoffs of 10",
              "Backboard targeting drill",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Consistent layup footwork and technique. Uses backboard effectively and makes 50%+ from short approach.",
            observableBehaviors: [
              "Footwork automatic/correct",
              "Effective backboard use",
              "Makes 5+ of 10 layups",
              "Good touch and control",
              "Approaches from different angles",
              "Confident at the rim",
            ],
            commonMistakes: [
              "May struggle with speed dribble to layup",
              "Off-angle layups less consistent",
              "Contested layups challenging",
              "Non-dominant hand layup weak",
            ],
            coachingTips: [
              "Can you finish the layup after dribbling at game speed?",
              "What happens when there's a defender at the rim?",
              "How might you finish differently coming from the baseline versus the wing?",
              "Your dominant hand layup is solid. Ready to start working on the other side?",
              "Great finish! You stayed in control all the way through",
            ],
            assessmentActivities: [
              "Dribble-to-layup from three-point line",
              "Layups from various angles",
              "Transition layup drill",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Smooth layups from various angles and situations. Good finishing touch even with defense present. High percentage in drills.",
            observableBehaviors: [
              "Makes 7+ of 10 in drills",
              "Finishes with either hand",
              "Adapts finish to defense",
              "Good body control",
              "Various finishes (regular, reverse, floater)",
              "Confident under pressure",
            ],
            commonMistakes: [
              "May force difficult finishes",
              "Could use more variety occasionally",
              "Contact sometimes disrupts finish",
            ],
            coachingTips: [
              "What finish options do you have when the defender cuts off your angle?",
              "When is a floater better than a traditional layup?",
              "How do you finish through contact without losing control?",
              "Your finishing ability creates problems for defenses. Keep expanding your options!",
              "You've worked hard to develop this. Trust your ability at the rim",
            ],
            assessmentActivities: [
              "Contested layup drills",
              "Game finishing percentage tracking",
              "Various finish demonstration",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite finisher at the rim. Makes layups under contact with creative finishes. Truly ambidextrous around the basket.",
            observableBehaviors: [
              "Makes contested layups consistently",
              "Multiple creative finishes",
              "Both hands equally effective",
              "Adjusts mid-air when needed",
              "Elite body control",
              "Makes difficult finishes look easy",
            ],
            commonMistakes: [
              "May attempt very difficult finishes",
              "Could pass out sometimes when appropriate",
            ],
            coachingTips: [
              "What new finish can you add to your game?",
              "How can you help teammates improve their finishing?",
              "When should you pass out versus force a tough finish?",
              "Your finishing ability is elite. Continue challenging yourself!",
              "Your creativity at the rim inspires teammates",
            ],
            assessmentActivities: [
              "Game finishing analysis",
              "Creative finish showcase",
              "Teaching demonstration to others",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Layup coordination is challenging at this age. Use lower baskets to allow proper technique development. Focus on the footwork pattern without worrying about makes. The opposite foot/opposite hand concept is confusing - be patient! Make it fun with games and challenges. Celebrate proper steps even when shots miss.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "This is the ideal age to cement proper layup technique. Footwork should become automatic with repetition. Introduce finishing from different angles. Begin working on non-dominant hand layups. Connect layups to game situations with simple drives. Most players show significant improvement at this age.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect consistent layup mechanics with game application. Focus on finishing under pressure and with defense. Introduce various finishes (reverse, floater). Both hands should be developing. Connect finishing to team offense concepts.",
          },
        },
        redFlags: [
          "Cannot identify correct takeoff foot after multiple explanations",
          "Persistent same-foot/same-hand takeoff despite consistent practice",
          "Fear of going to the basket (may indicate previous injury or negative experience)",
          "No improvement in footwork over 6+ weeks",
          "Physical coordination issues affecting running and jumping combination",
        ],
        parentExplanation:
          "Layups require coordinating running, jumping, and shooting all at once - it's actually quite complex! We teach 'opposite foot, opposite hand' - when shooting with the right hand, jump off the left foot. This is counterintuitive at first but becomes natural with practice. Using the backboard ('the shooter's best friend') increases accuracy. At home, practice the footwork pattern without a ball, then add the ball. Patience is key - this skill clicks suddenly after lots of practice!",
        homeActivities: [
          "Footwork practice without ball (step-step-jump pattern)",
          "Layups on lowered hoop or playground basket",
          "Knee drive practice against wall",
          "Watch NBA layups in slow motion",
          "Mikan drill (alternating layups) on low hoop",
          "Practice approach from different angles",
        ],
        bestAssessedIn: [
          "Layup lines during practice",
          "Transition drills",
          "Game fast break situations",
          "Individual skill work",
        ],
        assessmentFrequency: "Weekly observation during drills, formal assessment monthly",
        assessmentDuration: "Observe 10 layup attempts from various situations",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.layupsDominantHand));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 6: Athletic Stance (physical)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Athletic Stance...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Stands upright; feet together; not ready to move in any direction; unaware of body position",
        2: "Beginning to understand stance concept; inconsistent knee bend; feet sometimes apart",
        3: "Consistent athletic stance when reminded; good knee bend and foot width; can maintain briefly",
        4: "Automatic athletic stance in most situations; quick to get low; maintains through movements",
        5: "Elite body control; perfect stance is instinctive; adjusts stance for different situations",
      },
      observableBehaviors: [
        "Feet shoulder-width apart or slightly wider",
        "Knees bent, not locked straight",
        "Weight on balls of feet, not heels",
        "Hips back, chest up, back straight",
        "Hands ready position (varies by situation)",
      ],
      commonMistakes: [
        "Standing straight up with locked knees",
        "Feet too close together",
        "Weight on heels (falling backward)",
        "Bent at waist instead of knees",
        "Looking down instead of forward",
      ],
      coachingTips: [
        "Can you sit in an invisible chair? That's our stance!",
        "Where is your weight right now - on your heels or on the balls of your feet?",
        "If I pushed you gently, would you fall over? Let's test your base!",
        "What do you notice about how you can move from this position?",
        "Great stance! I can tell you're ready to move any direction",
      ],
      tags: ["core", "physical", "fundamental", "stance", "balance", "movement-prep"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player stands upright with little awareness of athletic positioning. Not prepared to move quickly in any direction.",
            observableBehaviors: [
              "Stands straight up with locked knees",
              "Feet close together",
              "Weight back on heels",
              "Falls off balance easily",
              "Slow to react to movement cues",
              "Unaware of body positioning",
            ],
            commonMistakes: [
              "Looking at ground",
              "Arms hanging at sides",
              "Leaning backward",
              "No muscle engagement",
            ],
            coachingTips: [
              "Let's play 'invisible chair' - can you sit down without a chair?",
              "Can you show me a superhero pose? Now bend your knees a little!",
              "How wide apart should your feet be? Try shoulder-width and see how that feels",
              "Push against my hands - are you strong from this position?",
              "Good effort! When you bend your knees, you're ready for anything",
            ],
            assessmentActivities: [
              "Stance check - can they hold position for 5 seconds?",
              "Push test - gentle push from various angles",
              "Movement burst - can they move quickly from stance?",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to understand and attempt athletic stance. Position inconsistent but showing improvement when reminded.",
            observableBehaviors: [
              "Sometimes shows knee bend",
              "Feet apart but not consistent width",
              "Can achieve stance when cued",
              "Holds position briefly",
              "Starting to understand purpose",
              "Returns to standing upright when not focused",
            ],
            commonMistakes: [
              "Stance not maintained during activity",
              "Forgets to get low in games",
              "Still tends to stand when waiting",
              "Position deteriorates with fatigue",
            ],
            coachingTips: [
              "Before we start, let's check - are you in your athletic stance?",
              "What should your body look like when you're ready to move?",
              "After each play, can you reset to your ready position?",
              "You're remembering more often! What helps you remember?",
              "Good self-correction - you noticed and fixed your stance!",
            ],
            assessmentActivities: [
              "Stance to movement drill",
              "Game observation - how often in stance?",
              "Defensive slides from stance",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Consistent athletic stance when prompted. Good fundamental position and can maintain while performing basic movements.",
            observableBehaviors: [
              "Proper stance when reminded",
              "Good knee bend and width",
              "Maintains during defensive slides",
              "Can move quickly from stance",
              "Understands stance importance",
              "Beginning to use automatically",
            ],
            commonMistakes: [
              "Still needs reminders sometimes",
              "Stance varies by drill type",
              "May stand up during games",
              "Fatigue affects stance maintenance",
            ],
            coachingTips: [
              "How can you remind yourself to stay low without me saying anything?",
              "What do you notice about your defense when you stay in stance?",
              "When do you find yourself standing up? What's happening in those moments?",
              "Your stance is becoming automatic. What helps you stay ready?",
              "I notice you're getting into stance without being told now!",
            ],
            assessmentActivities: [
              "Full drill observation - stance maintenance",
              "Defensive game assessment",
              "Fatigue test - maintain stance in late drill",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Athletic stance is automatic in most situations. Player gets low instinctively and maintains position through various movements.",
            observableBehaviors: [
              "Stance automatic in drills",
              "Low position in games",
              "Maintains through fatigue",
              "Quick stance recovery",
              "Adjusts depth for situation",
              "Role model for teammates",
            ],
            commonMistakes: [
              "Occasional standing in transition",
              "May drop too low in some situations",
              "Could be lower in closeouts",
            ],
            coachingTips: [
              "What situations still challenge your stance?",
              "How can you help teammates remember their stance?",
              "When do you need to be in a deeper stance versus lighter?",
              "Your stance sets a great example. Others watch what you do!",
              "You've developed a habit that will help you forever in basketball",
            ],
            assessmentActivities: [
              "Game stance audit",
              "Transition defense observation",
              "Peer teaching assessment",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite body control and positioning. Athletic stance is instinctive and adjusts automatically for different game situations.",
            observableBehaviors: [
              "Perfect stance is instinctive",
              "Adjusts for every situation",
              "Never caught standing up",
              "Elite body control",
              "Leads by example",
              "Helps others develop",
            ],
            commonMistakes: [
              "May expect same from all teammates",
            ],
            coachingTips: [
              "What subtle adjustments do you make for different situations?",
              "How can you help younger players develop this habit?",
              "Your stance discipline is elite. What made it click for you?",
              "Continue to refine - there's always room to get better",
            ],
            assessmentActivities: [
              "Teaching demonstration",
              "Game situation analysis",
              "Leadership observation",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Athletic stance is a new concept that requires constant reinforcement. Use fun analogies like 'superhero pose' or 'gorilla stance.' Don't expect maintenance during play - celebrate any attempt. Build body awareness through various movement activities. Make stance practice a game!",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players can now understand WHY stance matters - explain the connection to quick movement and defense. Consistent practice builds the habit. Use reminders but help them develop self-awareness. Connect stance to successful plays they make. This age shows good progression with reinforcement.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect automatic stance in most drill situations. Focus on game application and maintenance under fatigue. Introduce position-specific stance adjustments. Connect stance discipline to defensive effectiveness. This age can self-monitor and correct.",
          },
        },
        redFlags: [
          "Cannot achieve basic athletic position despite instruction",
          "Physical limitations preventing knee bend",
          "No improvement in stance awareness over several weeks",
          "Consistent balance issues affecting all activities",
          "Appears uncomfortable or in pain when in stance position",
        ],
        parentExplanation:
          "Athletic stance is basketball's 'ready position' - feet shoulder-width apart, knees bent, weight on the balls of the feet. From this position, players can move quickly in any direction. We use cues like 'invisible chair' or 'ready to jump.' This fundamental position applies to ALL sports, so developing it now creates benefits beyond basketball. At home, you can practice 'stance holds' or play games where your child has to react quickly from athletic position.",
        homeActivities: [
          "Stance hold challenge - how long can they maintain?",
          "Reaction games - move quickly from stance on parent's signal",
          "Mirror drill - copy movements while staying in stance",
          "Stance during TV commercials",
          "Defensive slide races in the driveway",
          "Any sport/activity that reinforces low, ready position",
        ],
        bestAssessedIn: [
          "Defensive drills and slides",
          "Transition situations",
          "Game defense observation",
          "Rest periods between activities",
        ],
        assessmentFrequency: "Ongoing observation every session, formal check monthly",
        assessmentDuration: "Brief checks throughout practice (5-10 second observations)",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.athleticStance));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 7: Spacing Awareness (tactical)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Spacing Awareness...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Clusters with ball/other players; no awareness of court space; follows ball like magnet",
        2: "Beginning to understand spacing concept; can space when reminded but drifts back to ball",
        3: "Maintains appropriate spacing in drills; understands 12-15 foot rule; starting to self-correct",
        4: "Good court awareness; finds open space; spacing helps create offensive opportunities",
        5: "Elite spacing intelligence; creates advantages for self and teammates; manipulates defense with positioning",
      },
      observableBehaviors: [
        "Maintains 12-15 feet from nearest teammate",
        "Finds open space away from the ball",
        "Recognizes and fills gaps in the offense",
        "Adjusts position as ball moves",
        "Creates passing lanes through spacing",
      ],
      commonMistakes: [
        "Standing next to ball handler ('ball watching')",
        "Clustering with other players in same area",
        "Not moving when ball moves",
        "Standing behind defender (no passing lane)",
        "Drifting into corners and staying stuck",
      ],
      coachingTips: [
        "How far away should you be from your closest teammate?",
        "When the ball moves, what should you do?",
        "Can your teammate pass to you right now? What's in the way?",
        "Look around - where is there empty space on the court?",
        "Good spacing! You gave your teammate room to work",
      ],
      tags: ["core", "tactical", "fundamental", "spacing", "court-awareness", "teamwork"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player clusters with teammates and follows the ball. No understanding of court spacing or how position affects team offense.",
            observableBehaviors: [
              "Follows ball like a magnet",
              "Stands next to ball handler",
              "Groups with other players",
              "No awareness of open space",
              "Doesn't move without ball",
              "Ends up on top of teammates",
            ],
            commonMistakes: [
              "All 5 players in one area",
              "Standing directly behind defender",
              "Running toward every pass",
              "No concept of passing lanes",
            ],
            coachingTips: [
              "Can you find an empty space on the court? Go stand there!",
              "Let's play 'stay apart' - try to be far from everyone else",
              "When you're near the ball, the defender can guard both of you. What might help?",
              "Where is the empty space right now? Can you go fill it?",
              "Good job finding your own spot! That helps your team",
            ],
            assessmentActivities: [
              "Freeze game - stop and show spacing",
              "Cone spacing drill - stay at cone distance from partners",
              "Simple 3v0 with spacing focus",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Beginning to understand spacing concept. Can maintain distance when reminded but naturally drifts back toward the ball.",
            observableBehaviors: [
              "Understands concept when explained",
              "Maintains space briefly when cued",
              "Drifts toward ball over time",
              "Can identify when others are too close",
              "Starting to notice open space",
              "Needs regular reminders",
            ],
            commonMistakes: [
              "Forgets spacing when ball moves",
              "Watches ball instead of finding space",
              "Spacing deteriorates in games",
              "Doesn't adjust when teammates move",
            ],
            coachingTips: [
              "Before you move, ask yourself: where's the empty space?",
              "When you see everyone bunched up, what should you do?",
              "Can you be the one who stays spread out even when others don't?",
              "You remembered to spread out! What helped you remember?",
              "Your spacing made that pass possible. Did you notice?",
            ],
            assessmentActivities: [
              "3v0 spacing maintenance",
              "Spot checks during scrimmage",
              "Partner spacing mirrors",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Maintains appropriate spacing in drills and beginning to self-correct. Understands 12-15 foot spacing rule.",
            observableBehaviors: [
              "Maintains spacing in drills",
              "Self-corrects when too close",
              "Moves when ball moves",
              "Finds open areas",
              "Creates passing lanes",
              "Understands spacing purpose",
            ],
            commonMistakes: [
              "Game spacing not as good as drill spacing",
              "Forgets when action speeds up",
              "May space to same spot repeatedly",
              "Reading defense still developing",
            ],
            coachingTips: [
              "In games, what makes you forget your spacing?",
              "What do you look at to decide where to move?",
              "How does your spacing affect what your teammate can do?",
              "Great awareness! You moved to space before I said anything",
              "Your spacing is creating easier opportunities for everyone",
            ],
            assessmentActivities: [
              "Game observation - spacing maintenance %",
              "4v0 shell spacing",
              "Space and replace drill",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "Good court awareness and finds open space consistently. Spacing contributes to creating offensive opportunities for self and teammates.",
            observableBehaviors: [
              "Consistent game spacing",
              "Reads and reacts to defense",
              "Creates advantages through position",
              "Helps teammates with spacing",
              "Adjusts to different situations",
              "Rarely bunches up",
            ],
            commonMistakes: [
              "May space too predictably",
              "Could attack more from good position",
              "Occasionally over-helps on spacing",
            ],
            coachingTips: [
              "How can you use your spacing to create your own shot?",
              "What does the defense do when you're well-spaced?",
              "How can you help teammates understand spacing?",
              "Your court awareness is strong. Now let's make it a weapon!",
              "You make the game easier for everyone around you",
            ],
            assessmentActivities: [
              "Game film review of spacing",
              "Teaching spacing to younger players",
              "Complex offensive sets spacing",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite spacing intelligence. Creates advantages through positioning and manipulates defense with movement and spacing.",
            observableBehaviors: [
              "Elite court vision",
              "Manipulates defense with position",
              "Creates opportunities constantly",
              "Perfect spacing instincts",
              "Leads team in this area",
              "Coaches others during play",
            ],
            commonMistakes: [
              "May get frustrated when others don't space well",
            ],
            coachingTips: [
              "How can you communicate spacing to teammates during play?",
              "What do you see that others might miss?",
              "Your basketball IQ is advanced. How can you elevate teammates?",
              "Continue studying how elite teams use spacing",
            ],
            assessmentActivities: [
              "Game impact analysis",
              "Peer coaching observation",
              "Strategic spacing discussion",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Spacing awareness is very challenging at this age - children naturally cluster and follow the ball. Don't expect game spacing; focus on building the concept in simple drills. Use visual aids (cones, spots) to show where to stand. Make spacing games fun, not punitive. 'Magnet ball' is normal - be patient!",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players can now understand WHY spacing matters. Teach the 12-15 foot rule. Use freeze drills to show good versus bad spacing. Connect spacing to easier passes and shots. This age shows good improvement when spacing is consistently reinforced. Help them see how spacing affects teammates.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect spacing awareness to translate to games. Introduce more complex offensive concepts that require spacing. Discuss how spacing affects defensive rotations. Connect individual spacing to team offense success. This age can understand and apply tactical spacing concepts.",
          },
        },
        redFlags: [
          "Complete inability to stay away from ball after extended instruction",
          "Cannot identify when spacing is good versus bad",
          "Persistent clustering despite consistent reminders",
          "No improvement over a full season of emphasis",
          "Difficulty understanding spatial concepts in general",
        ],
        parentExplanation:
          "Spacing is about staying spread out on the court - keeping 12-15 feet from teammates. When players bunch up, one defender can guard multiple players. Good spacing creates passing lanes and driving lanes, making offense much easier. This is a TEAM skill - everyone has to do it for it to work. At home, watch basketball with your child and notice when teams have good versus bad spacing. You can see the difference in how the offense flows!",
        homeActivities: [
          "Watch games and identify good/bad spacing",
          "Play 2v0 or 3v0 focusing only on staying spread",
          "Draw/diagram where players should be spaced",
          "Freeze frame video to analyze spacing",
          "Discuss how spacing helps at dinner conversation",
          "Practice moving to open space in any activity",
        ],
        bestAssessedIn: [
          "Small-sided games (3v3, 4v4)",
          "Offensive shell drills",
          "Full game observation",
          "Transition offense situations",
        ],
        assessmentFrequency: "Every scrimmage/game observation, formal assessment monthly",
        assessmentDuration: "5-10 minute observation periods during game play",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.spacingAwareness));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 8: Effort & Hustle (psychological)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Effort & Hustle...");
  await getDb()
    .update(skills)
    .set({
      progressionLevels: {
        1: "Minimal effort; gives up when challenged; doesn't pursue loose balls; walks during play",
        2: "Inconsistent effort; hustles sometimes but not consistently; affected by score/situation",
        3: "Consistent effort in drills; pursues loose balls; beginning to understand effort's impact",
        4: "High effort is standard; inspires teammates; maintains effort when tired or behind",
        5: "Elite effort every possession; team leader in hustle; effort is unaffected by any circumstance",
      },
      observableBehaviors: [
        "Sprints during transitions (not jogging)",
        "Dives/hustles for loose balls",
        "Contests every shot attempt",
        "Gets back on defense without reminder",
        "Maintains effort throughout entire practice/game",
      ],
      commonMistakes: [
        "Jogging when sprinting is appropriate",
        "Letting loose balls go without pursuing",
        "Standing and watching when ball is loose",
        "Effort drops when tired or team is losing",
        "Taking plays off on defense",
      ],
      coachingTips: [
        "What's something that doesn't require any talent - just effort?",
        "When you're tired, what tells you to keep pushing?",
        "How does your effort affect your teammates?",
        "What did you notice about your energy level compared to last week?",
        "Effort is a choice - and you made a great choice on that play!",
      ],
      tags: ["core", "psychological", "fundamental", "effort", "hustle", "character", "ELM"],
      comprehensiveGuide: {
        levelDetails: {
          1: {
            name: "Emerging",
            description:
              "Player shows minimal consistent effort. Gives up when challenged and doesn't pursue loose balls or hustle during play.",
            observableBehaviors: [
              "Walks during live play",
              "Doesn't chase loose balls",
              "Gives up when tired or challenged",
              "Last to arrive at drills",
              "Lets others do the work",
              "Body language shows disengagement",
            ],
            commonMistakes: [
              "Conserving energy unnecessarily",
              "Giving up before trying",
              "Comparing effort to others negatively",
              "Not understanding effort's importance",
            ],
            coachingTips: [
              "What's one thing you can do that shows me you're trying hard?",
              "Let's set a small effort goal for today - what could it be?",
              "I noticed you worked hard on that one play. What felt different?",
              "Effort is something YOU control. What will you choose?",
              "Everyone has times when it's hard to try. What might help you push through?",
            ],
            assessmentActivities: [
              "Effort observation - count hustle plays",
              "Transition sprint tracking",
              "Loose ball response observation",
            ],
          },
          2: {
            name: "Developing",
            description:
              "Shows effort inconsistently. Hustles in some situations but effort varies based on score, fatigue, or perceived importance.",
            observableBehaviors: [
              "Hustles sometimes",
              "Effort tied to scoreboard",
              "Better early in practice, fades",
              "Sprints when motivated",
              "Responds to encouragement",
              "Inconsistent across situations",
            ],
            commonMistakes: [
              "Selective effort based on situation",
              "Effort drops when team struggles",
              "Waits to see if ball comes to them",
              "Sprints in drills, jogs in games",
            ],
            coachingTips: [
              "What makes you hustle hard? Can we find more of those moments?",
              "I notice your effort is different in different situations. What's going on?",
              "What if we decided effort was the same no matter the score?",
              "When you got that loose ball, you were hustling! What was your mindset?",
              "Building consistent effort is a process. You're getting better at it!",
            ],
            assessmentActivities: [
              "Effort tracking across full practice",
              "Situational effort comparison (ahead vs. behind)",
              "Late-game/practice effort observation",
            ],
          },
          3: {
            name: "Competent",
            description:
              "Shows consistent effort in practice drills. Pursues loose balls and is beginning to understand how effort impacts self and team.",
            observableBehaviors: [
              "Consistent drill effort",
              "Pursues loose balls",
              "Gets back on defense",
              "Understands effort importance",
              "Sprints transitions usually",
              "Beginning to encourage others",
            ],
            commonMistakes: [
              "Game effort may lag drill effort",
              "Effort dips in blowout situations",
              "May not be vocal leader yet",
              "Sometimes waits for others to hustle first",
            ],
            coachingTips: [
              "Your effort in practice is consistent. How can we bring that same energy to games?",
              "What does it feel like when everyone on the team hustles together?",
              "How can you help a teammate who's struggling with effort?",
              "Your effort makes a difference. I see it, and your teammates see it too!",
              "Effort is contagious. You can spread it to others!",
            ],
            assessmentActivities: [
              "Game hustle play counting",
              "Team effort leadership observation",
              "Fatigue-state effort assessment",
            ],
          },
          4: {
            name: "Proficient",
            description:
              "High effort is the standard, not the exception. Maintains effort when tired or team is behind. Beginning to inspire teammates through effort.",
            observableBehaviors: [
              "High effort is default",
              "Maintains when tired",
              "Maintains when behind",
              "Inspires teammates",
              "First to loose balls",
              "Never takes plays off",
            ],
            commonMistakes: [
              "May judge others' effort",
              "Could be more vocal in leadership",
              "Rare effort lapses possible",
            ],
            coachingTips: [
              "Your effort is a gift to your team. How can you bring others up?",
              "What do you do mentally to maintain effort when you're exhausted?",
              "When you see a teammate's effort drop, how can you help?",
              "Your effort makes you stand out. It's a competitive advantage!",
              "Leaders influence through effort. You're becoming that leader",
            ],
            assessmentActivities: [
              "Late-game effort observation",
              "Team influence observation",
              "Effort in adversity assessment",
            ],
          },
          5: {
            name: "Advanced",
            description:
              "Elite effort on every possession regardless of circumstance. Team leader in hustle whose effort elevates everyone around them.",
            observableBehaviors: [
              "Elite effort every possession",
              "Unaffected by score, time, fatigue",
              "Team follows their example",
              "Gets teammates to hustle",
              "Known for effort by opponents",
              "Effort is automatic",
            ],
            commonMistakes: [
              "High standards may create tension occasionally",
            ],
            coachingTips: [
              "How can you lead effort without making teammates feel bad about themselves?",
              "What's your secret to sustaining this effort?",
              "Your effort legacy will be remembered. What do you want it to be?",
              "Continue to grow as a leader while maintaining your hustle standard",
              "You show what's possible when effort is a non-negotiable",
            ],
            assessmentActivities: [
              "Season-long effort consistency",
              "Peer nomination for effort",
              "Leadership impact assessment",
            ],
          },
        },
        ageExpectations: {
          ages6to8: {
            typicalLevel: "1-2",
            notes:
              "Effort at this age is tied to engagement and fun. If they're having fun, they hustle; if not, they don't. Don't punish low effort - make activities engaging! Celebrate effort attempts, not just successful ones. Use effort as a positive ('I love how hard you tried!') not a negative ('You're not trying!'). Short bursts of high effort with rest are appropriate.",
          },
          ages9to11: {
            typicalLevel: "2-3",
            notes:
              "Players can now understand effort as a choice and connect it to outcomes. Teach that effort is controllable - one of the few things fully in their control. Use ELM language: 'Effort is what we can control.' Reinforce that mistakes made while trying hard are good. Connect effort to improvement and team success.",
          },
          ages12to14: {
            typicalLevel: "3-4",
            notes:
              "Expect more consistent effort as players mature. Discuss mental toughness and effort in difficult moments. Connect effort to character development beyond basketball. Peer influence is strong - effort culture matters. Help them see effort as identity: 'I'm someone who hustles.'",
          },
        },
        redFlags: [
          "Persistent minimal effort despite engaging activities and environment",
          "Effort issues only in certain settings (may indicate anxiety or social concerns)",
          "Significant drop in effort from previous levels",
          "Physical complaints that disappear when activity is appealing",
          "Giving up immediately when challenged (may indicate fear of failure or perfectionism)",
        ],
        parentExplanation:
          "Effort and hustle are the great equalizers in basketball - they don't require special talent, just choice. We teach that effort is one of the few things completely in a player's control using the ELM framework (Effort, Learning, Mistakes). When your child gives great effort, they're developing a life skill that transfers everywhere. At home, praise effort over results: 'I loved how hard you worked on that!' helps more than 'Great job winning!' Effort is built by recognizing it, not by punishing its absence.",
        homeActivities: [
          "Notice and praise effort in any activity",
          "Play high-effort games together (races, active play)",
          "Discuss effort heroes (athletes known for hustle)",
          "Set effort goals, not outcome goals",
          "Model effort in your own activities",
          "Talk about times effort led to good outcomes",
        ],
        bestAssessedIn: [
          "Late in practice when tired",
          "When team is losing in scrimmage",
          "Loose ball situations",
          "Transition defense opportunities",
          "Any situation where effort is a choice",
        ],
        assessmentFrequency: "Ongoing observation every session",
        assessmentDuration: "Continuous throughout all activities",
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.effortAndHustle));

  console.log("Successfully upgraded 8 basketball skills with comprehensive assessment guides!");
}

// Export for use in seed runner
export { upgradeBasketballSkills as default };

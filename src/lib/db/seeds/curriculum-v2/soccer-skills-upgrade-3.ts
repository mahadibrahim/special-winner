/**
 * Soccer Skills Upgrade - Comprehensive Assessment Guides (Batch 3)
 *
 * Upgrades existing soccer skills with comprehensive assessment guides including:
 * - Detailed 5-level progression definitions (Emerging, Developing, Competent, Proficient, Advanced)
 * - Observable behaviors at each level
 * - Common mistakes and corrections
 * - Age-appropriate expectations
 * - Red flags for additional support
 * - Parent communication templates
 * - Home activities for skill development
 *
 * Skills upgraded:
 * TECHNICAL:
 * 1. Dribbling with Speed (f7bc397a-ed08-47e1-a4e6-988de350fb94) - Skill Building
 * 2. Turning with Ball (5bd9d4d5-f0f7-4464-bd64-794fde0a07c5) - Skill Building
 * 3. 1v1 Moves (06047b03-395d-4a0d-9e1b-33b865d2198e) - Skill Building
 *
 * TACTICAL:
 * 4. Finding Space (a97eeb7d-2eb0-44a2-a75a-33be2b6eb055) - Fundamentals
 * 5. Creating Passing Angles (2346893b-c288-42e8-aab5-10ee840edd93) - Skill Building
 * 6. Defending 1v1 (eab6dba8-7ce4-42f6-8d13-a3e917cb4de4) - Skill Building
 *
 * PHYSICAL:
 * 7. Agility (d7f39b8d-0333-4605-b3b4-d2ff2eb035f2) - Fundamentals
 *
 * PSYCHOLOGICAL:
 * 8. Enjoyment of Play (7149478f-ac84-472f-8c97-1f9961b10a02) - Fundamentals
 * 9. Resilience (e525b9a7-be10-46ec-b90c-e01b7ece1cf6) - Fundamentals
 *
 * Research-based guidelines applied:
 * - Guiding questions (not just commands) in coaching tips
 * - ELM framework language (Effort, Learning, Mistakes)
 * - Observable and measurable behaviors
 * - Age-appropriate expectations aligned with European/American best practices
 * - Holistic development connections (psychological/social)
 */

import { db } from "../../index";
import { skills } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

// Type matching the schema definition
type ComprehensiveGuide = {
  levelDetails: {
    [level: number]: {
      name: string;
      description: string;
      observableBehaviors: string[];
      commonMistakes: string[];
      coachingTips: string[];
      assessmentActivities: string[];
    };
  };
  ageExpectations: {
    ages6to8: { typicalLevel: string; notes: string };
    ages9to11: { typicalLevel: string; notes: string };
    ages12to14: { typicalLevel: string; notes: string };
  };
  redFlags: string[];
  parentExplanation: string;
  homeActivities: string[];
  bestAssessedIn: string[];
  assessmentFrequency: string;
  assessmentDuration: string;
};

// Skill upgrade definitions
const skillUpgrades: Array<{
  id: string;
  name: string;
  domain: string;
  stage: string;
  comprehensiveGuide: ComprehensiveGuide;
}> = [
  // ═══════════════════════════════════════════════════════════════════════════
  // TECHNICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 1: Dribbling with Speed
  // Domain: Technical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "f7bc397a-ed08-47e1-a4e6-988de350fb94",
    name: "Dribbling with Speed",
    domain: "technical",
    stage: "Skill Building",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot maintain ball control while running. Speed and control are mutually exclusive - they either run fast and lose the ball, or maintain control but move slowly. Touches are erratic and unpredictable.",
          observableBehaviors: [
            "Ball escapes control as soon as pace increases",
            "Must stop completely to regain control",
            "Takes many small touches even when space is available",
            "Head down 100% of time while dribbling",
            "Cannot run in a straight line with ball",
            "Kicks ball too far ahead and chases it",
          ],
          commonMistakes: [
            "Using inside of foot for speed dribbling (should use laces/outside)",
            "Taking too many touches when space is open",
            "Looking down at ball instead of scanning space ahead",
            "Running without rhythm - choppy movements",
          ],
          coachingTips: [
            "ELM - Effort: 'I love seeing you try to go fast! What happens when you push the ball further?'",
            "ELM - Mistakes: 'Losing the ball at speed is how we find our limits!'",
            "Question: 'What part of your foot helps you run fastest with the ball?'",
            "Let's start at 50% speed and build up - where does your control break?",
          ],
          assessmentActivities: [
            "Speed dribble over 20 yards - time and assess control",
            "Dribble through wide cone corridor at increasing speeds",
            "Simple breakaway: dribble to goal before walking defender catches up",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to combine speed with control in open space. Can dribble at moderate pace but loses ball when accelerating quickly. Shows understanding that bigger touches allow faster movement.",
          observableBehaviors: [
            "Can dribble at jogging pace with control",
            "Attempts to push ball into space but often too far",
            "Beginning to use laces for longer touches",
            "Some head-up moments during dribbling",
            "Control breaks down at about 70% speed",
            "Can dribble in straight lines at moderate pace",
          ],
          commonMistakes: [
            "Pushes ball too far ahead when accelerating",
            "Reverts to small touches when should push into space",
            "Same touch weight regardless of space available",
            "Slows down to regain control rather than adjusting touch",
          ],
          coachingTips: [
            "ELM - Learning: 'What did you learn from that attempt? The ball went far - what could you try next?'",
            "Question: 'How far can you push the ball before you can't catch up to it?'",
            "Try using the top of your foot like the fast players you watch!",
            "Imagine you're a race car - smooth acceleration, not jerky starts!",
          ],
          assessmentActivities: [
            "Timed dribble race vs. previous personal best",
            "Dribble through speed zones: slow-medium-fast marked areas",
            "Breakaway with passive defender chasing from behind",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Dribbles at good speed with reliable control in most situations. Can accelerate with ball and maintain possession. Uses appropriate touch weight for available space.",
          observableBehaviors: [
            "Maintains control at 80-90% running speed",
            "Pushes ball appropriately for space available",
            "Uses laces effectively for speed dribbling",
            "Scans environment while dribbling at speed",
            "Can change speed while maintaining control",
            "Recovers well from slight control errors",
          ],
          commonMistakes: [
            "May lose control when fatigued",
            "Occasionally pushes too far in tight spaces",
            "Sometimes telegraphs when about to accelerate",
            "May favor one foot for speed dribbling",
          ],
          coachingTips: [
            "When you get tired, what's the first thing that changes in your dribbling?",
            "Can you accelerate with your other foot just as well?",
            "What do you see when you look up while dribbling fast?",
            "How do you decide when to push the ball versus keep it close?",
          ],
          assessmentActivities: [
            "Speed dribble with head-up challenges (call out numbers)",
            "Dribble races with direction changes at speed",
            "Game observation: breakaway success rate",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent speed dribbling with consistent control even under pressure. Can burst past defenders and maintain ball throughout. Touch weight is almost always appropriate.",
          observableBehaviors: [
            "Explodes into space with ball under control",
            "Maintains control at near-maximum speed",
            "Uses speed dribbling to beat defenders",
            "Excellent spatial awareness while at speed",
            "Can decelerate rapidly without losing ball",
            "Adjusts touch for different surfaces instantly",
          ],
          commonMistakes: [
            "May over-rely on speed when other solutions exist",
            "Occasionally takes risks in dangerous areas",
          ],
          coachingTips: [
            "When is speed dribbling the best choice versus passing?",
            "How can your speed help the team, not just yourself?",
            "What adjustments do you make on wet versus dry fields?",
            "Can you help teammates develop their speed dribbling?",
          ],
          assessmentActivities: [
            "1v1 breakaway situations with active defenders",
            "Speed dribble and finish under pressure",
            "Game observation: creating chances through speed",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite speed dribbling that creates consistent attacking advantages. Ball seems attached to foot even at full sprint. Speed with ball is nearly as fast as without.",
          observableBehaviors: [
            "Full speed dribbling appears effortless",
            "Creates breakaways through speed dribbling",
            "Maintains total control in tight spaces at speed",
            "Changes direction at speed without losing control",
            "Speed dribbling is a primary attacking weapon",
            "Reads defensive positioning while at full speed",
          ],
          commonMistakes: [
            "May attempt speed dribbles when simpler solutions exist",
          ],
          coachingTips: [
            "How do you use your elite speed to make teammates better?",
            "What can you teach others about speed dribbling?",
            "When do you choose to slow down rather than sprint?",
            "Your speed changes games - how do you decide when to use it?",
          ],
          assessmentActivities: [
            "Elite competition performance observation",
            "Speed and control testing vs. running without ball",
            "Analysis of chances created through speed dribbling",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Speed dribbling develops after basic control is established. At this age, focus on comfort with the ball first. Speed will come naturally as coordination develops. Short, fun races with the ball build the foundation without pressure on technique.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is an excellent window for developing speed dribbling. Players have basic control and can begin pushing the ball further. Teach the concept of touch weight matching space available. Competitive races and games make practice engaging.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Players can execute speed dribbling in game situations. Focus on decision-making: when to accelerate versus other options. Physical development increases speed capacity. Work on maintaining technique when fatigued.",
        },
      },
      redFlags: [
        "Cannot dribble faster than walking pace after extended practice",
        "Consistent fear of losing ball prevents any acceleration attempts",
        "Physical coordination issues affecting running gait with ball",
        "Avoids any situation requiring speed with ball",
        "Ball contact causes pain or discomfort when dribbling fast",
      ],
      parentExplanation:
        "Dribbling with speed is about moving fast while keeping the ball under control. It's how players break through defenses and create scoring chances. We teach players to use the top of their foot (laces) or outside of foot for bigger touches when they have space, then adjust touch size based on how much room they have. This skill takes lots of practice because players need to find the balance between speed and control. At home, any fast dribbling practice helps - racing with the ball, timed dribbles, or just sprinting with the ball in open space.",
      homeActivities: [
        "Speed dribble sprints: set up cones 20-30 yards apart and time yourself",
        "Breakaway practice: have someone chase you while you dribble to goal",
        "Touch counting: dribble a set distance as fast as possible while counting touches - fewer is better!",
        "Race your shadow: on sunny days, try to dribble fast enough to stay ahead of your shadow",
        "Different surfaces: practice speed dribbling on grass, pavement, and other surfaces",
        "Video yourself dribbling and watch to see when you lose control",
      ],
      bestAssessedIn: [
        "Open-field dribbling exercises",
        "Breakaway situations in training",
        "Small-sided games with space to run",
        "1v1 situations with room behind defender",
      ],
      assessmentFrequency: "Weekly observation during training, formal assessment monthly",
      assessmentDuration: "Observe across multiple speed dribbling opportunities (5-10 minutes)",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 2: Turning with Ball
  // Domain: Technical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "5bd9d4d5-f0f7-4464-bd64-794fde0a07c5",
    name: "Turning with Ball",
    domain: "technical",
    stage: "Skill Building",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot turn effectively with the ball. Multiple touches required, ball often escapes during turn attempts. No variety in turning technique and cannot turn under any pressure.",
          observableBehaviors: [
            "Takes 4+ touches to complete a turn",
            "Ball rolls away during turn attempts",
            "Stops completely before changing direction",
            "Only attempts to turn one direction",
            "Cannot execute any named turn (Cruyff, drag-back, etc.)",
            "Never checks shoulder before receiving",
          ],
          commonMistakes: [
            "Not checking shoulder before receiving - turns into pressure",
            "Ball gets away from body during turn",
            "Standing upright during turn instead of lowering center of gravity",
            "No use of body to shield ball",
          ],
          coachingTips: [
            "Can you keep the ball close as you spin around?",
            "What happens if you use the inside of your foot?",
            "Try to make your body a shield between ball and defender!",
            "Every turn attempt helps you learn - keep trying!",
          ],
          assessmentActivities: [
            "Turn and dribble to cone (no pressure)",
            "Receive ball and turn drill with targets",
            "Counting touches needed to complete turn",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can complete basic turns in unpressured situations. Beginning to learn specific turn techniques but execution is slow and sometimes unsuccessful. Shows understanding of need to check shoulder.",
          observableBehaviors: [
            "Completes inside cut turns with 2-3 touches",
            "Attempts drag-back turns with mixed success",
            "Beginning to shield ball during turns",
            "Sometimes checks shoulder before receiving",
            "Can turn both directions but one is clearly weaker",
            "Loses ball when any pressure is applied during turn",
          ],
          commonMistakes: [
            "Turn is slow and predictable",
            "Telegraphing turn direction with body shape",
            "No acceleration after completing turn",
            "Limited turn variety - same turn every time",
          ],
          coachingTips: [
            "What can you see before you receive to know where to turn?",
            "How can you make your turn quicker?",
            "Can you try using the outside of your foot too?",
            "What happens if you lean your body during the turn?",
          ],
          assessmentActivities: [
            "Turn under light pressure from walking defender",
            "Practice different turn types in sequence",
            "Turn and accelerate into space exercise",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Executes multiple turn types with reliability. Can turn away from light pressure. Checks shoulder regularly and makes appropriate turn selection based on defender position.",
          observableBehaviors: [
            "Executes 3-4 different turn types effectively",
            "Single touch turns becoming consistent",
            "Shields ball effectively during turns",
            "Regularly checks shoulder before receiving",
            "Can turn both directions with competence",
            "Accelerates out of turns into space",
          ],
          commonMistakes: [
            "May default to favorite turn type",
            "Occasionally caught by quick pressure",
            "Could be sharper in execution",
            "Sometimes turns into pressure unnecessarily",
          ],
          coachingTips: [
            "What tells you which type of turn to use?",
            "How can you turn even sharper and quicker?",
            "When would a Cruyff turn work better than a drag-back?",
            "Can you help a teammate improve their turns?",
          ],
          assessmentActivities: [
            "Turn against semi-active defender",
            "Turn variety in rondo situations",
            "Game observation for turn success rate",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent turning ability with variety and deception. Can turn under pressure and in tight spaces. Turn selection is instinctive and appropriate to situation.",
          observableBehaviors: [
            "Full repertoire of turns executed at speed",
            "Uses body feints to disguise turn direction",
            "Turns create space and attacking opportunities",
            "Can turn in tight spaces under pressure",
            "First touch often sets up the turn",
            "Reads defender position to select optimal turn",
          ],
          commonMistakes: [
            "May attempt ambitious turns when simple is better",
            "Could distribute quicker after turns sometimes",
          ],
          coachingTips: [
            "How do your turns help the team build attacks?",
            "When is turning necessary vs. playing direct?",
            "What do you look for when choosing your turn?",
            "Elite turning comes from preparation - keep scanning!",
          ],
          assessmentActivities: [
            "High-pressure rondo with focus on turns",
            "Game impact analysis - turns leading to chances",
            "Turn success rate statistics",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite turning ability that creates consistent advantages. Can escape any pressure through turning. Turns are deceptive, quick, and lead to dangerous attacking positions.",
          observableBehaviors: [
            "Turns out of pressure from any position",
            "Creates chances through turning ability",
            "Combines turns with other skills seamlessly",
            "Performs elite turns (Zidane turn, etc.) effectively",
            "Turning is unpredictable - defenders cannot read",
            "Turns at maximum speed without losing control",
          ],
          commonMistakes: [
            "Teammates may not expect quick turn and play forward",
          ],
          coachingTips: [
            "Your turning ability changes games - how do you create that?",
            "What can you teach others about preparing to receive?",
            "Continue challenging yourself in tighter spaces!",
            "Model the scanning habits that make this possible!",
          ],
          assessmentActivities: [
            "Performance in elite competition",
            "Statistical impact of turning on team attack",
            "Comparison to professional standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Turning with the ball is challenging at this age. Focus on comfort with the ball first. Simple turns without pressure are appropriate. Make it playful - 'spin like a top!' Don't expect smooth execution yet.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin teaching specific turn types (inside cut, outside cut, drag-back). Focus on one turn at a time. Add light pressure gradually. This is a great age for technical development through repetition.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players should have multiple turns in their toolkit. Work on turn selection and execution under pressure. Emphasize checking shoulder before receiving. Can introduce more advanced turns like Cruyff and spin turns.",
        },
      },
      redFlags: [
        "Cannot turn at all after extended practice",
        "Always loses ball when attempting any turn",
        "Fear of receiving ball with back to goal",
        "Physical limitations preventing turning motion",
        "No improvement in any turn type over extended time",
      ],
      parentExplanation:
        "Turning with the ball is how players change direction while keeping possession. It's crucial for playing out of pressure and creating attacking opportunities. We teach different turn types: inside cut, outside cut, drag-back, and more advanced turns. The key is checking over the shoulder BEFORE receiving to know where pressure is coming from. At home, practicing individual turns against a wall or with a parent playing passive defender helps build this skill.",
      homeActivities: [
        "Wall turn practice: pass against wall, receive and execute turn, repeat",
        "Shoulder check game: before every touch, look over shoulder - parent holds up fingers to call",
        "Defender shadow turns: parent acts as slow-motion defender, player turns away",
        "Turn competition: time how quickly you can receive, turn, and dribble 5 yards",
        "Practice specific turns in slow motion, then speed up",
        "Watch professionals turn on video and try to copy their technique",
      ],
      bestAssessedIn: [
        "Rondo and possession activities",
        "Receiving exercises with back to goal",
        "Game situations receiving under pressure",
        "Technical training circuits",
      ],
      assessmentFrequency: "Weekly observation during training, formal assessment monthly",
      assessmentDuration: "Observe across multiple receiving and turning situations (5-10 minutes)",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 3: 1v1 Moves
  // Domain: Technical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "06047b03-395d-4a0d-9e1b-33b865d2198e",
    name: "1v1 Moves",
    domain: "technical",
    stage: "Skill Building",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player has no effective moves to beat defenders. Dribbles directly into defenders, kicks ball past and chases, or simply stops when challenged. No deception or change of pace.",
          observableBehaviors: [
            "Runs straight at defender with no change",
            "Loses ball immediately when engaged",
            "No attempt at body feints or fakes",
            "Kicks ball past defender hoping to win race",
            "Stops and looks for pass when defender approaches",
            "No change of pace before or during move attempts",
          ],
          commonMistakes: [
            "Attempting moves from too far away - defender has time to react",
            "No change of pace - same speed before, during, and after move",
            "Telegraphing the move with eyes or body position",
            "Not selling the fake - defender doesn't commit",
          ],
          coachingTips: [
            "Can you pretend to go one way and then go the other?",
            "What happens if you slow down before speeding up?",
            "Watch the defender - where are they moving?",
            "Every attempt teaches you something - keep trying!",
          ],
          assessmentActivities: [
            "1v1 in tight space with passive defender",
            "Cone dribbling with direction changes",
            "Move execution without defender present",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to attempt moves but execution is slow or predictable. Can occasionally beat passive defenders. Learning one or two basic moves but not yet effective in games.",
          observableBehaviors: [
            "Attempts basic moves (step-over, scissors) slowly",
            "Sometimes beats passive defenders",
            "Move is telegraphed - defender can read it",
            "Beginning to use change of pace",
            "One dominant move, no variety",
            "Loses balance during move execution",
          ],
          commonMistakes: [
            "Move is too slow - defender recovers",
            "Attempting same move repeatedly - becomes predictable",
            "Not exploding after the move - defender catches up",
            "Attempting moves when pass is clearly better option",
          ],
          coachingTips: [
            "How can you make that move quicker?",
            "What does the defender's body position tell you?",
            "After your move, where do you explode?",
            "Can you try the move to your other side?",
          ],
          assessmentActivities: [
            "1v1 with semi-active defenders",
            "Timed move execution drills",
            "Success rate tracking against defenders",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Has 2-3 reliable moves executed at reasonable speed. Can beat defenders in game situations. Uses change of pace and body feints effectively. Selects appropriate move for situation.",
          observableBehaviors: [
            "Executes 2-3 moves at game speed",
            "Uses change of pace to unbalance defenders",
            "Reads defender position before selecting move",
            "Accelerates explosively after successful move",
            "Can perform moves to either side",
            "Success rate of 40-50% against peer defenders",
          ],
          commonMistakes: [
            "Relies too heavily on favorite move",
            "May force 1v1 when pass is better option",
            "Inconsistent success against physical defenders",
            "Move selection sometimes inappropriate",
          ],
          coachingTips: [
            "What's your go-to move? What's your backup?",
            "What does the defender's weight distribution tell you?",
            "When does 1v1 dribbling help the team most?",
            "Can you combine two moves together?",
          ],
          assessmentActivities: [
            "1v1 competitions with scoring",
            "Game observation for moves attempted and successful",
            "Move variety assessment across different situations",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent repertoire of moves executed with deception and speed. Can chain moves together. Creates chances regularly through 1v1 ability. Reads defenders instinctively.",
          observableBehaviors: [
            "Multiple moves executed with deception",
            "Chains moves together fluidly",
            "Exploits defender's weight and positioning",
            "Creates team opportunities through dribbling",
            "Success rate of 50-60% against peer defenders",
            "Can beat defender to either side with equal skill",
          ],
          commonMistakes: [
            "May over-dribble in team contexts",
            "Could be more direct when appropriate",
          ],
          coachingTips: [
            "How can your 1v1 ability help teammates?",
            "When is the simple option better than the move?",
            "What makes elite dribblers different?",
            "Balance creativity with team responsibility!",
          ],
          assessmentActivities: [
            "Elite 1v1 competitions",
            "Game impact statistics - chances created",
            "Assessment of teaching ability to others",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite 1v1 ability that creates consistent attacking advantages. Can beat defenders at will in most situations. Moves are explosive, deceptive, and unpredictable.",
          observableBehaviors: [
            "Beats defenders consistently",
            "Creates chances from seemingly nothing",
            "Moves are instinctive and perfectly timed",
            "Draws multiple defenders to create space for others",
            "Performs under highest pressure moments",
            "Success rate above 60% against peer defenders",
          ],
          commonMistakes: [
            "Teammates may become too reliant on individual skill",
          ],
          coachingTips: [
            "How can you use your ability to make others better?",
            "What do you see that others don't?",
            "Continue innovating - what's the next move to master?",
            "Your skill inspires others - keep working!",
          ],
          assessmentActivities: [
            "Performance in high-stakes matches",
            "Statistical impact analysis - goals and assists from dribbles",
            "Comparison to elite youth standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "At this age, let players experiment freely with the ball. Don't worry about specific moves - encourage creativity and trying different things. Ball familiarity is the foundation. Make it fun and celebrate attempts!",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin introducing basic moves (scissors, step-over, cut). Focus on one move at a time until comfortable. This is a great age for technical development. Lots of repetition in fun contexts builds the foundation.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players can develop a repertoire of moves. Work on selecting the right move for the situation. Introduce chaining moves together. Challenge them to beat defenders consistently in practice.",
        },
      },
      redFlags: [
        "Complete avoidance of 1v1 situations in games",
        "Severe anxiety about attempting moves on defenders",
        "No improvement in any move after extended practice",
        "Physical limitations preventing move execution",
        "Gives up immediately after unsuccessful attempt",
      ],
      parentExplanation:
        "1v1 moves are the tricks and fakes players use to get past defenders. We teach specific moves like scissors (stepping over the ball), step-overs, body feints, and cuts. But the real skill is in the timing, selling the fake, and the explosive change of direction. Players need confidence to attempt moves and resilience when they get tackled. At home, free dribbling and practicing individual moves builds the comfort needed. Watch skill videos together and encourage trying new moves!",
      homeActivities: [
        "Cone defender practice: set up cone as imaginary defender and practice moves",
        "YouTube move learning: watch tutorials and practice one move at a time",
        "Family 1v1: play in small space with parent adjusting pressure level",
        "Move portfolio: film yourself attempting different moves and review technique",
        "Backyard creativity: just dribble and try different things without pressure",
        "Challenge: learn one new move each week",
      ],
      bestAssessedIn: [
        "1v1 training activities",
        "Small-sided games with space to dribble",
        "Match situations with opportunity to take on defenders",
        "Individual skill sessions",
      ],
      assessmentFrequency: "Weekly observation during training, formal assessment monthly",
      assessmentDuration: "Observe across multiple 1v1 opportunities in training and games (10-15 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TACTICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 4: Finding Space
  // Domain: Tactical | Stage: Fundamentals
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "a97eeb7d-2eb0-44a2-a75a-33be2b6eb055",
    name: "Finding Space",
    domain: "tactical",
    stage: "Fundamentals",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player gravitates toward the ball regardless of positioning. No understanding of space on the field. Clusters with teammates and creates congestion. Static when not near ball.",
          observableBehaviors: [
            "Follows ball like a magnet (ball watching)",
            "Stands directly next to teammates",
            "Never checks shoulder for space or defenders",
            "Remains stationary when ball is far away",
            "Runs toward player with ball instead of into space",
            "Creates clusters of players in same area",
          ],
          commonMistakes: [
            "Standing still and expecting ball to find them",
            "Moving toward player with ball instead of into space",
            "Hiding behind defenders when should be finding gaps",
            "Only moving after teammate starts looking for pass",
          ],
          coachingTips: [
            "What happens when everyone stands together - is it easy to pass?",
            "Can you find a space where no one else is standing?",
            "If you were the player with the ball, where would you want a friend to be?",
            "Great effort moving! Each time you find space, you're learning!",
          ],
          assessmentActivities: [
            "3v1 keep-away with focus on positioning",
            "Freeze game - stop play and discuss spacing",
            "Color zone game - stay in your color area",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand concept of space. Sometimes moves away from crowded areas but timing and positioning are inconsistent. Can find space when directly coached.",
          observableBehaviors: [
            "Occasionally moves away from crowds",
            "Beginning to check shoulder before receiving",
            "Can find space when specifically told to",
            "Recognizes when area is too congested",
            "Sometimes anticipates where play is going",
            "Movement often too late to be useful",
          ],
          commonMistakes: [
            "Moving to good space but arriving too late",
            "Finding space but not communicating availability",
            "Moving away from ball but not into useful positions",
            "Checking shoulder but not adjusting based on what's seen",
          ],
          coachingTips: [
            "You found great space - now how can you let your teammate know?",
            "What did you see when you checked over your shoulder?",
            "If you move earlier, what happens to your options?",
            "Can you think one pass ahead - where will the ball go next?",
          ],
          assessmentActivities: [
            "4v2 possession with movement requirements",
            "Numbered passing game with positional switches",
            "Small-sided game with spacing bonus points",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Consistently finds space in basic game situations. Understands timing of movement and creates passing angles. May struggle in complex or high-pressure situations.",
          observableBehaviors: [
            "Regularly creates passing angles",
            "Moves before teammate needs option",
            "Checks shoulder to assess space regularly",
            "Adjusts position as ball moves",
            "Opens body to receive facing forward",
            "Understands when to stay vs. when to move",
          ],
          commonMistakes: [
            "Finding space but not facing the right direction",
            "Good positioning but closed body shape",
            "Struggling to find space against organized defenses",
            "Occasionally drifting into offside positions",
          ],
          coachingTips: [
            "How can your body position help you see more of the field?",
            "What do you notice about how defenders react to your movement?",
            "Can you find space that helps you play forward, not just sideways?",
            "When the defense shifts, where does the new space appear?",
          ],
          assessmentActivities: [
            "Positional rondo with central player",
            "Phase of play exercises",
            "Game observation for off-ball movement quality",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent spatial awareness and movement quality. Creates space for self and teammates. Manipulates defenders through intelligent movement.",
          observableBehaviors: [
            "Movement creates passing options consistently",
            "Drags defenders to open space for teammates",
            "Times runs to stay onside while threatening",
            "Uses check-away movements to lose markers",
            "Finds pockets of space between defensive lines",
            "Communicates availability through movement and voice",
          ],
          commonMistakes: [
            "May make runs teammates aren't ready for",
            "Occasionally over-complicates movement",
          ],
          coachingTips: [
            "How can your movement help a teammate who's struggling?",
            "You're reading the game well - can you help others see what you see?",
            "When is simple movement better than creative movement?",
            "Leadership: how can you organize spacing for others?",
          ],
          assessmentActivities: [
            "11v11 positional play exercises",
            "Game observation for space creation",
            "Video analysis of movement patterns",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite spatial awareness. Constantly creates and exploits space. Movement is a weapon that disrupts defenses. Reads game several moves ahead.",
          observableBehaviors: [
            "Instinctively finds dangerous pockets of space",
            "Movement creates goal-scoring chances",
            "Manipulates defensive shape through runs",
            "Positions to receive in half-spaces and channels",
            "Organizes teammates' spacing through communication",
            "Creates numerical advantages through positioning",
          ],
          commonMistakes: [
            "Teammates may not match their level of vision",
          ],
          coachingTips: [
            "How can you communicate your vision to help teammates understand?",
            "What patterns can you teach to younger players?",
            "Continue studying the game - what do elite players do differently?",
            "Your movement intelligence is a gift to the team - keep sharing it!",
          ],
          assessmentActivities: [
            "Complex tactical exercises",
            "Game statistics for chances created from movement",
            "Video analysis comparison to elite players",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Ball magnetism is completely normal and developmentally appropriate at this age. Use fun games to introduce the concept of spreading out. Don't expect consistent spatial awareness - the cognitive development isn't there yet. Celebrate any attempt to find space!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players begin to understand space conceptually. Use freeze games to highlight good and poor spacing. Small-sided games help reinforce spatial concepts. Players can start to anticipate where they should move, but consistency takes time.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Tactical understanding accelerates. Can work on more complex movement concepts like checking away, creating space for others, and reading defensive lines. Video analysis can be very effective at this age.",
        },
      },
      redFlags: [
        "No improvement in spatial awareness after a full season of coaching",
        "Cannot grasp basic concept of spreading out",
        "Extreme anxiety about being in open space with ball",
        "Unable to divide attention between ball and surroundings",
        "Consistent difficulty understanding position relative to others",
      ],
      parentExplanation:
        "Finding space is one of soccer's most important skills - it's about moving to positions where teammates can pass to you effectively. Young players naturally want to run toward the ball, but as they develop, they learn to spread out and create passing angles. This requires awareness of teammates, opponents, and the ball all at once - a complex skill that develops over years. Watch professional games together and point out how players without the ball are always moving to create options!",
      homeActivities: [
        "TV analysis: pause during games and ask 'Where would you move to help the player with ball?'",
        "Backyard triangle: with two family members, always form a triangle with the ball",
        "Watch professional players without the ball and discuss their movement",
        "Position mapping: after watching a game, draw where you would position in different scenarios",
        "3v1 keep-away in the yard focusing on finding space",
        "Play 'find the empty space' - move to open areas as fast as possible",
      ],
      bestAssessedIn: [
        "Small-sided games (4v4, 5v5)",
        "Possession exercises and rondos",
        "Phase of play activities",
        "Full game observation of off-ball movement",
      ],
      assessmentFrequency: "Ongoing observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple game situations over several sessions",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 5: Creating Passing Angles
  // Domain: Tactical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "2346893b-c288-42e8-aab5-10ee840edd93",
    name: "Creating Passing Angles",
    domain: "tactical",
    stage: "Skill Building",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player has no understanding of passing angles. Positions directly behind defenders or teammates, making themselves unpassable. Static positioning regardless of ball location.",
          observableBehaviors: [
            "Stands in direct line behind defender",
            "Hides behind teammates when ball is near",
            "Never adjusts position based on ball movement",
            "Positions too close or too far from ball carrier",
            "Body closed off rather than open to receive",
            "No understanding of passing lanes",
          ],
          commonMistakes: [
            "Hiding behind the defender - can't receive pass",
            "Positioning too close to ball carrier - reduces passing lanes",
            "Standing in same line as other teammates",
            "Body closed to field when receiving",
          ],
          coachingTips: [
            "Can you see a straight line between you and the ball? If not, move!",
            "What happens when you stand where the defender isn't?",
            "Show me where you need to be for me to pass to you!",
            "Every time you move to an open space, you're learning!",
          ],
          assessmentActivities: [
            "3v1 with focus on angle creation",
            "Freeze and discuss: who can receive right now?",
            "Simple passing gates - find the open gate",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand need to be 'passable.' Sometimes adjusts position but often not far enough or at wrong angle. Inconsistent awareness of blocking defenders.",
          observableBehaviors: [
            "Occasionally moves to get clear of defender",
            "Beginning to recognize when they're blocked",
            "Sometimes shows for ball at correct angle",
            "Movement often too small to create clear lane",
            "May create angle but body position closed",
            "Understands concept when coached directly",
          ],
          commonMistakes: [
            "Creating angle but standing still - defender adjusts",
            "Only creating angle on one side - predictable",
            "Finding angle but not communicating availability",
            "Moving too early or too late to create angle",
          ],
          coachingTips: [
            "You found a gap - how can you show your teammate you're open?",
            "What happens if you move just a little bit wider?",
            "Can you create an angle so you can play forward after receiving?",
            "Great learning! What made that movement work?",
          ],
          assessmentActivities: [
            "4v1 rondo with angle requirements",
            "Pass and move exercises with targets",
            "Angle recognition quiz during freeze moments",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Consistently positions to create passing angles. Understands relationship between self, ball, and defender. Opens body appropriately to receive and play forward.",
          observableBehaviors: [
            "Regularly adjusts to create clear passing lane",
            "Positions at appropriate distance from ball carrier",
            "Opens body to receive facing forward",
            "Adjusts angle as ball or defender moves",
            "Understands when to stay vs. when to move",
            "Creates options for ball carrier consistently",
          ],
          commonMistakes: [
            "Movement becoming predictable to defenders",
            "Occasionally creating angle but at wrong depth",
            "May struggle against compact defenses",
            "Sometimes slow to adjust when ball moves quickly",
          ],
          coachingTips: [
            "How can your body position help you play forward after receiving?",
            "What do you notice about the defender's position when you move?",
            "Can you create an angle that splits two defenders?",
            "You're developing great awareness - what patterns do you see?",
          ],
          assessmentActivities: [
            "Rondo with central player option",
            "Positional games with angle scoring bonus",
            "Game observation for angle quality",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent understanding of passing angles. Creates angles that enable progression. Can create angle while also manipulating defender's position.",
          observableBehaviors: [
            "Creates angles that bypass multiple defenders",
            "Uses movement to drag defender and open lane",
            "Timing of movements creates perfect passing windows",
            "Receives in positions that enable forward play",
            "Helps teammates find angles through communication",
            "Recognizes and exploits defender's blind side",
          ],
          commonMistakes: [
            "May overcomplicate when simple angle works",
            "Teammates may not recognize created opportunities",
          ],
          coachingTips: [
            "How can you help teammates understand the angles you're creating?",
            "You're reading the game well - what tells you where to move?",
            "When is a simple angle better than a creative one?",
            "Leadership: can you organize teammates into better angles?",
          ],
          assessmentActivities: [
            "Complex positional exercises",
            "Game analysis for progressive passing success",
            "Video review of angle creation",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite understanding of passing geometry. Creates angles that others don't see. Movement creates passing opportunities that unlock defenses.",
          observableBehaviors: [
            "Creates angles that lead directly to chances",
            "Anticipates where angles will open before ball arrives",
            "Movement manipulates multiple defenders simultaneously",
            "Receives in half-spaces and dangerous areas",
            "Organizes team shape to create collective angles",
            "Finds receiving positions that split defensive lines",
          ],
          commonMistakes: [
            "Teammates may not execute at the level required",
          ],
          coachingTips: [
            "How do you process where to move so quickly?",
            "What can you teach others about reading the game?",
            "Your understanding elevates everyone - keep sharing it!",
            "Continue studying the game at the highest levels.",
          ],
          assessmentActivities: [
            "Elite tactical exercises",
            "Statistical analysis of progressive passes received",
            "Comparison to professional movement patterns",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Passing angles are conceptually difficult at this age. Focus on basic spreading out and being visible to teammates. Don't expect understanding of geometric relationships. Simple games work better than tactical instruction.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Players can begin understanding that they need to be 'open' to receive. Use freeze games to show good and poor angles. Visual demonstrations are powerful. Consistent practice in rondos helps develop this instinct.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Tactical understanding accelerates rapidly. Can work on more nuanced concepts like depth, width, and body shape. Video analysis becomes useful. Challenge players to create angles that enable forward play.",
        },
      },
      redFlags: [
        "Cannot understand concept of passing lanes after extended coaching",
        "Consistently hides from ball in game situations",
        "No adjustment of position regardless of ball movement",
        "Anxiety about receiving ball even in open positions",
        "Unable to recognize when blocked from receiving",
      ],
      parentExplanation:
        "Creating passing angles is about positioning to receive a pass. Players need to understand that defenders block passing lanes, so they must move to where the ball can actually reach them. We teach players to imagine a straight line between themselves and the ball - if a defender is in that line, they need to move! Good angles also mean being positioned to play forward after receiving, not just receiving and having to turn. Watch games together and notice how professional players constantly adjust their positions.",
      homeActivities: [
        "Passing lane freeze: while watching soccer, pause and ask who can receive right now",
        "Triangle passing game: three family members form triangle, move to stay 'open'",
        "Angle adjustment drill: parent with ball, child creates angle to receive, parent moves, child adjusts",
        "Video analysis: record a game and review your movement and positioning",
        "3v1 in backyard: focus on finding angles to stay open",
        "Discuss: why was that pass blocked? Where could they have moved?",
      ],
      bestAssessedIn: [
        "Possession games and rondos",
        "Small-sided games with focus on passing",
        "Technical passing exercises with defenders",
        "Game observation for off-ball positioning",
      ],
      assessmentFrequency: "Weekly observation during training, formal assessment monthly",
      assessmentDuration: "Observe across multiple passing situations in rondos and games (10-15 minutes)",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 6: Defending 1v1
  // Domain: Tactical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "eab6dba8-7ce4-42f6-8d13-a3e917cb4de4",
    name: "Defending 1v1",
    domain: "tactical",
    stage: "Skill Building",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot defend 1v1 effectively. Dives in immediately, gets beaten easily, or stands off too far. No understanding of body position, angle, or timing.",
          observableBehaviors: [
            "Lunges at ball immediately (diving in)",
            "Gets beaten by simple moves or pace",
            "Stands flat-footed - not on balls of feet",
            "No understanding of jockeying",
            "Turns back to attacker and runs away",
            "Stands too far away or too close to attacker",
          ],
          commonMistakes: [
            "Diving in - committing before right moment",
            "Standing too upright - can't move quickly",
            "Watching ball instead of attacker's hips/body",
            "Giving attacker too much space to accelerate",
          ],
          coachingTips: [
            "Can you stay on your feet instead of diving in?",
            "What happens when you bend your knees and get low?",
            "Watch the attacker's belly button - that tells you where they're going!",
            "Every time you stay patient, you're learning!",
          ],
          assessmentActivities: [
            "1v1 defending in wide channel - can they delay?",
            "Shadow defender drill without ball",
            "Simple keep attacker away from goal exercise",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand defensive principles but execution is inconsistent. Can jockey slowly but gets beaten by quick movements. Knows not to dive in but unsure when to tackle.",
          observableBehaviors: [
            "Attempts to jockey but often too slowly",
            "Sometimes shows correct body position",
            "Beginning to delay attacker",
            "Gets beaten by changes of pace or direction",
            "Attempts tackles at wrong moments",
            "Can show attacker away from goal sometimes",
          ],
          commonMistakes: [
            "Getting too tight - easy to go past",
            "Showing attacker inside toward goal",
            "Not getting goal-side when beaten",
            "Tackling with wrong foot - off balance",
          ],
          coachingTips: [
            "Which way do you want to show the attacker - inside or outside?",
            "Can you feel when the right moment to tackle arrives?",
            "What happens when you stay low and on your toes?",
            "You're being patient - that's great! What helps you decide when to tackle?",
          ],
          assessmentActivities: [
            "1v1 defending with recovery zone",
            "Jockeying races (lateral movement)",
            "Tackle timing exercises",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Can defend 1v1 with reasonable success. Maintains good body position, delays attacker, and shows them away from goal. Makes tackles at appropriate moments.",
          observableBehaviors: [
            "Maintains low athletic stance consistently",
            "Jockeys effectively showing attacker outside",
            "Delays attacker until help arrives",
            "Times tackles well - wins ball cleanly",
            "Recovers when beaten initially",
            "Understands defensive angles",
          ],
          commonMistakes: [
            "May get beaten by very quick attackers",
            "Could read body language better",
            "Occasionally shows wrong side",
            "Recovery speed could improve",
          ],
          coachingTips: [
            "What part of the attacker should you watch to know where they're going?",
            "When is the right moment to make your tackle?",
            "How do you recover when you get beaten?",
            "You're winning duels - what's working well?",
          ],
          assessmentActivities: [
            "1v1 competitions with scoring",
            "Defending in small-sided games",
            "Recovery run exercises after being beaten",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong 1v1 defender who wins duels regularly. Reads attacker's intentions, forces mistakes, and times tackles perfectly. Can defend in various situations.",
          observableBehaviors: [
            "Reads attacker's body language to anticipate moves",
            "Forces attacker into mistakes or poor touches",
            "Wins tackles without fouling",
            "Can defend 1v1 in all areas of pitch",
            "Shows attacker onto weak foot",
            "Recovery speed when beaten is excellent",
          ],
          commonMistakes: [
            "May be overaggressive occasionally",
            "Could communicate with teammates more",
          ],
          coachingTips: [
            "What tells you the attacker is about to make their move?",
            "How can your 1v1 defending help the whole team?",
            "Can you force attackers where you want them?",
            "You're reading the game well - can you help teammates?",
          ],
          assessmentActivities: [
            "Elite 1v1 defending challenges",
            "Game statistics for tackles won",
            "Defending in overload situations",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite 1v1 defender who dominates attackers. Rarely beaten, anticipates everything, and turns defense into attack. Defending 1v1 is a weapon for the team.",
          observableBehaviors: [
            "Wins vast majority of 1v1 duels",
            "Anticipates attacker moves before they happen",
            "Creates turnovers that lead to attacks",
            "Defends against elite attackers successfully",
            "Communicates to organize teammates",
            "Adapts defensive approach to different attackers",
          ],
          commonMistakes: [
            "Teammates may over-rely on their defending",
          ],
          coachingTips: [
            "What do you see that tells you what the attacker will do?",
            "How can you help others develop their 1v1 defending?",
            "Your defending changes games - how do you stay focused?",
            "Continue studying elite attackers to stay ahead!",
          ],
          assessmentActivities: [
            "Performance against elite attackers",
            "Statistical analysis of duels won",
            "Leadership in defensive organization",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Young players naturally dive in for the ball. Focus on fun 1v1 games without too much technique instruction. The concept of patience is hard at this age. Celebrate staying on feet and trying to shadow the attacker.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin teaching body position and jockeying. Introduce the concept of delaying and showing attackers away from goal. Small-sided games naturally develop 1v1 defending. Focus on staying on feet first, tackling timing comes later.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and apply defensive principles consistently. Work on reading attackers and timing tackles. Introduce recovery runs and defensive transitions. Competition-based 1v1 activities are motivating.",
        },
      },
      redFlags: [
        "Refuses to engage in 1v1 defensive situations",
        "Severe anxiety about physical contact in tackling",
        "Cannot stay with attacker even at slow pace",
        "No improvement in defensive technique after extended practice",
        "Gives up after being beaten once - no recovery effort",
      ],
      parentExplanation:
        "Defending 1v1 is about stopping an attacker from getting past you. We teach players to stay on their feet, adopt a low athletic stance, and jockey the attacker (staying between them and the goal while showing them away from danger). The key is patience - not diving in for the ball until the moment is right. Good defenders watch the attacker's hips (not the ball or feet) to anticipate movement. At home, playing 1v1 with family members helps develop this skill - even as the attacker, you learn what defenders find hard to handle!",
      homeActivities: [
        "Shadow mirror game: without ball, mirror attacker movements",
        "Guard the castle: set up cone goal, defender stops attacker dribbling through",
        "Competitive 1v1s with parent or sibling - keep score!",
        "Watch great defenders on video - notice body position and patience",
        "Practice staying low and on toes - defensive stance contest",
        "Recovery runs: if beaten, sprint to recover goal-side",
      ],
      bestAssessedIn: [
        "1v1 training activities and competitions",
        "Small-sided games with focus on defending",
        "Match situations in defensive third",
        "Recovery and transition exercises",
      ],
      assessmentFrequency: "Weekly observation during training, formal assessment monthly",
      assessmentDuration: "Observe across multiple 1v1 defensive situations (10-15 minutes)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHYSICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 7: Agility
  // Domain: Physical | Stage: Fundamentals
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "d7f39b8d-0333-4605-b3b4-d2ff2eb035f2",
    name: "Agility",
    domain: "physical",
    stage: "Fundamentals",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player shows limited ability to change direction quickly. Movements are slow, off-balance, and lack coordination. Wide, sweeping turns rather than sharp cuts.",
          observableBehaviors: [
            "Takes wide arcs when changing direction",
            "Stumbles or loses balance during direction changes",
            "Needs multiple steps to slow down before turning",
            "Body remains upright without proper lean",
            "Arms don't assist in balance or momentum",
            "Slow first step after direction change",
          ],
          commonMistakes: [
            "Standing too tall - can't change direction quickly",
            "Crossing feet during direction changes",
            "Looking at feet instead of target direction",
            "No knee bend to lower center of gravity",
          ],
          coachingTips: [
            "What happens to your balance when you bend your knees?",
            "Can you feel the difference when you stay low versus standing tall?",
            "Try pushing off your outside foot - what changes?",
            "Every direction change makes your body smarter - keep going!",
          ],
          assessmentActivities: [
            "Simple cone touch and return",
            "Left-right shuffle between markers",
            "Follow the leader with direction changes",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can change direction with noticeable deceleration and hesitation. Shows some understanding of body position but execution is inconsistent. Improving balance.",
          observableBehaviors: [
            "Can change direction with 2-3 step preparation",
            "Shows some knee bend before direction change",
            "Beginning to plant outside foot for cuts",
            "Starts using arms for balance",
            "Occasional sharp direction changes",
            "Better on one side than the other",
          ],
          commonMistakes: [
            "Planting with wrong foot (inside instead of outside)",
            "Arms static rather than assisting movement",
            "Only comfortable changing direction one way",
            "Slow first step after the cut",
          ],
          coachingTips: [
            "Which foot do you push off when you want to go right?",
            "What happens if you push harder off your outside foot?",
            "How quickly can you get your eyes looking where you want to go?",
            "Each wobble teaches your body something new - keep exploring!",
          ],
          assessmentActivities: [
            "T-drill at moderate pace",
            "React to whistle and change direction",
            "Partner shadow drill at slow speed",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Demonstrates reliable direction changes with proper technique in most situations. Can execute cuts effectively but may lose efficiency when fatigued or under pressure.",
          observableBehaviors: [
            "Plants and drives effectively in most situations",
            "Maintains low center of gravity through changes",
            "Eyes and head lead the direction change",
            "Can change direction without significant speed loss",
            "Arms swing opposite to legs for balance",
            "Consistent technique in both directions",
          ],
          commonMistakes: [
            "Technique breaks down when fatigued",
            "May telegraph intended direction",
            "Slower direction changes under defensive pressure",
            "Inconsistent first step explosiveness after cut",
          ],
          coachingTips: [
            "What adjustments help you change direction faster to your weaker side?",
            "How can you disguise where you're about to go?",
            "When you get tired, what's the first thing that changes in your technique?",
            "What does it feel like when you nail a sharp cut? Let's recreate that!",
          ],
          assessmentActivities: [
            "Timed agility ladder with direction changes",
            "1v1 keep-away with limited space",
            "Reaction drill with visual cues",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Executes sharp, explosive direction changes consistently in game situations. Maintains technique under pressure and fatigue. Links multiple direction changes fluidly.",
          observableBehaviors: [
            "Explosive first step out of direction changes",
            "Seamlessly links multiple direction changes",
            "Maintains technique when fatigued",
            "Equal proficiency changing direction either way",
            "Uses deceptive body movements before cuts",
            "Creates separation from opponents through agility",
          ],
          commonMistakes: [
            "May over-rely on agility when simpler solutions exist",
            "Occasionally too predictable in timing of cuts",
          ],
          coachingTips: [
            "How can you use your agility to create space for teammates?",
            "What patterns do defenders look for? How can you break those patterns?",
            "When is the best moment to make your move?",
            "Can you help teammates improve their footwork?",
          ],
          assessmentActivities: [
            "Complex agility course with decision-making",
            "1v1 attacking in tight spaces",
            "Game observation during high-pressure moments",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite agility that creates consistent advantages. Combines explosive direction changes with deception. Agility is a weapon that makes all other skills more effective.",
          observableBehaviors: [
            "Changes direction with minimal speed loss",
            "Instinctively reads and reacts to situations",
            "Combines agility with ball skills seamlessly",
            "Maintains elite movement quality for full game",
            "Creates space and chances through movement alone",
            "Agility appears effortless at maximum intensity",
          ],
          commonMistakes: [
            "May attempt too many direction changes when direct approach is better",
          ],
          coachingTips: [
            "How can you use your elite movement to make the whole team better?",
            "What can you teach others about reading defensive movements?",
            "Continue challenging yourself - what's the next level?",
            "Model the effort and learning mindset for younger players!",
          ],
          assessmentActivities: [
            "Elite speed and agility testing",
            "Game observation for separation created",
            "Performance under tournament pressure",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Young players are still developing coordination and body awareness. Focus on fun movement games rather than technical drills. Celebrate effort and improvement over outcomes. Balance and basic coordination are developing rapidly at this age.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is a critical window for agility development - the nervous system is highly adaptable. Introduce more structured footwork activities while keeping them playful. Players can begin understanding how body position affects movement quality.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Players going through growth spurts may temporarily lose coordination - this is normal. Focus on maintaining technique even as bodies change. Can work on more advanced deception and combining agility with game situations.",
        },
      },
      redFlags: [
        "Consistent balance issues not improving with practice",
        "Significant difference between left and right sides persisting over time",
        "Pain or discomfort during direction changes",
        "Fear of quick movements not decreasing with exposure",
        "Physical limitation preventing proper movement patterns",
      ],
      parentExplanation:
        "Agility is the ability to change direction quickly and efficiently. It's fundamental to soccer - players constantly need to cut, turn, and react. We teach players to stay low (knees bent), plant their outside foot, and explode in the new direction. It's not just about speed - it's about control and body awareness. Home activities that involve quick movements, balance challenges, and directional changes all help. Even games like tag develop agility! This skill develops naturally through active play but can be enhanced with focused practice.",
      homeActivities: [
        "Tag games with family - requires constant direction changes",
        "Cone weave: set up cones and weave through as fast as possible",
        "Reaction game: parent calls direction, player cuts that way quickly",
        "Jump rope: builds foot quickness and coordination",
        "Hopscotch and similar playground games",
        "Dancing: great for coordination and rhythm",
      ],
      bestAssessedIn: [
        "Agility drills and ladder work",
        "1v1 situations during training",
        "Small-sided games with limited space",
        "Warm-up activities with direction changes",
      ],
      assessmentFrequency: "Weekly observation during training, formal assessment quarterly",
      assessmentDuration: "Observe across multiple training sessions and games (ongoing)",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PSYCHOLOGICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 8: Enjoyment of Play
  // Domain: Psychological | Stage: Fundamentals
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "7149478f-ac84-472f-8c97-1f9961b10a02",
    name: "Enjoyment of Play",
    domain: "psychological",
    stage: "Fundamentals",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player shows limited enjoyment during soccer activities. May appear reluctant, disengaged, or anxious. Participation feels like an obligation rather than something wanted.",
          observableBehaviors: [
            "Reluctant to join activities or needs coaxing",
            "Body language shows disengagement (slouching, looking away)",
            "Frequently asks when practice ends",
            "Doesn't smile or show positive emotions during play",
            "Avoids involvement - stands on edges of activities",
            "May express wanting to quit or not wanting to attend",
          ],
          commonMistakes: [
            "Adults applying excessive pressure removing fun",
            "Focus only on winning diminishing joy in playing",
            "Comparing to others reducing personal enjoyment",
            "Not allowing free play and creativity",
          ],
          coachingTips: [
            "What would make this more fun for you?",
            "Show me your favorite thing to do with the ball!",
            "Let's play a game - you choose what we do!",
            "I just want you to enjoy being here - no pressure!",
          ],
          assessmentActivities: [
            "Free play observation - what do they choose?",
            "Informal conversation about feelings about soccer",
            "Body language observation throughout session",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Shows enjoyment in some situations but not consistently. May enjoy games but not drills, or fun activities but not challenging ones. Enjoyment depends on external factors.",
          observableBehaviors: [
            "Enjoys certain activities but not others",
            "Smiles during games or scrimmages",
            "Enjoyment depends on who they're with",
            "May disengage when challenged or when mistakes happen",
            "Needs external motivation to participate fully",
            "Inconsistent energy and enthusiasm",
          ],
          commonMistakes: [
            "Over-scheduling leading to burnout",
            "Fear of failure preventing trying new things",
            "Adult expectations overshadowing child's experience",
            "Too much focus on results rather than experience",
          ],
          coachingTips: [
            "What parts of training do you enjoy most?",
            "How can we make the drills more fun?",
            "It's okay to not love everything - what helps you get through the tough parts?",
            "Your effort is what matters most to me - have fun with it!",
          ],
          assessmentActivities: [
            "Track which activities produce most engagement",
            "Note enjoyment patterns across different situations",
            "Informal check-ins about how they're feeling",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Generally enjoys soccer most of the time. Positive attitude toward practice and games. Can maintain enjoyment even when activities are challenging or less preferred.",
          observableBehaviors: [
            "Approaches practice with positive attitude",
            "Maintains engagement through various activities",
            "Shows enjoyment through body language and expressions",
            "Bounces back from disappointments relatively quickly",
            "Talks positively about soccer to others",
            "Eager to play and participate in activities",
          ],
          commonMistakes: [
            "Taking enjoyment for granted without nurturing it",
            "Increasing pressure as skill develops",
            "Forgetting to celebrate the fun moments",
          ],
          coachingTips: [
            "What makes soccer fun for you?",
            "I love seeing you enjoy this - what keeps it fun?",
            "Even when it's challenging, you seem to find the fun - how?",
            "Your positive energy helps the whole team!",
          ],
          assessmentActivities: [
            "Regular informal conversations about enjoyment",
            "Observation of attitude across different activities",
            "Check-in with parents about enjoyment at home",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong love for the game evident in all situations. Finds joy in practice, games, challenges, and even setbacks. Brings positive energy that influences teammates.",
          observableBehaviors: [
            "Radiates enthusiasm in all situations",
            "Finds enjoyment even in drills or conditioning",
            "Maintains positivity when losing or struggling",
            "Helps create fun environment for teammates",
            "Seeks extra soccer opportunities voluntarily",
            "Talks about soccer with genuine passion",
          ],
          commonMistakes: [
            "Over-commitment leading to eventual burnout",
            "Others projecting expectations onto their passion",
          ],
          coachingTips: [
            "Your love for the game inspires others - keep sharing it!",
            "How do you stay positive even when things are tough?",
            "Can you help a teammate who's not enjoying things as much?",
            "Make sure to balance your passion with rest!",
          ],
          assessmentActivities: [
            "Observe influence on team atmosphere",
            "Note how they respond to challenges and setbacks",
            "Discussion about what they love about soccer",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Deep, intrinsic love for soccer that transcends outcomes. Finds joy in all aspects of the game. Passion is contagious and elevates entire team environment.",
          observableBehaviors: [
            "Joy is independent of results or external factors",
            "Celebrates others' success as much as own",
            "Creates culture of enjoyment for whole team",
            "Finds meaning and satisfaction in improvement process",
            "Remains passionate through setbacks and challenges",
            "Soccer brings genuine happiness and fulfillment",
          ],
          commonMistakes: [
            "Others may not understand depth of their passion",
          ],
          coachingTips: [
            "Your passion is a gift to the team - thank you for sharing it!",
            "How did you develop such a deep love for the game?",
            "You make soccer better for everyone around you!",
            "Continue to nurture this - it will serve you your whole life!",
          ],
          assessmentActivities: [
            "Long-term observation of sustained enjoyment",
            "Impact on team culture and atmosphere",
            "Reflection discussions about meaning of soccer",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "2-4",
          notes:
            "Young players often have natural enthusiasm for play. The key is protecting this enjoyment rather than diminishing it with pressure or excessive instruction. Let them play, explore, and have fun. If enjoyment is low, investigate causes carefully.",
        },
        ages9to11: {
          typicalLevel: "2-4",
          notes:
            "Enjoyment can vary as players become more aware of comparison and competition. Balance skill development with fun activities. Watch for signs of pressure affecting enjoyment. Positive team culture is very important.",
        },
        ages12to14: {
          typicalLevel: "2-4",
          notes:
            "Adolescence brings complexity to enjoyment - social factors, self-consciousness, and increased pressure can all impact. Maintain focus on development over results. Create safe environment for players to enjoy the game.",
        },
      },
      redFlags: [
        "Consistently expresses not wanting to play or attend",
        "Crying or emotional distress before, during, or after soccer",
        "Complete disengagement - stands still, doesn't participate",
        "Physical symptoms (stomach ache, etc.) before soccer",
        "Significant personality change when at soccer activities",
      ],
      parentExplanation:
        "Enjoyment of play is the foundation of long-term soccer development. When kids enjoy playing, they practice more, persist through challenges, and develop lasting love for the game. We monitor enjoyment carefully and adjust when needed. Warning signs include reluctance to attend, negative body language, or expressing desire to quit. The research is clear: fun predicts development better than early intensity. If your child isn't enjoying soccer, we need to understand why and make changes. Your observations at home are valuable - let us know if you see changes in how they talk about or anticipate soccer.",
      homeActivities: [
        "Backyard free play: unstructured play with the ball, no coaching",
        "Watch age-appropriate soccer together and share excitement",
        "Create fun games with the ball - make up silly rules",
        "Let them lead: ask what they want to do with the ball",
        "Celebrate their enjoyment - 'I love seeing you have fun!'",
        "Never use soccer as punishment or reward",
      ],
      bestAssessedIn: [
        "Informal observation during all activities",
        "Free play periods",
        "Before and after practice conversations",
        "Parent feedback about home discussions",
      ],
      assessmentFrequency: "Observe at every session, formal check-in monthly",
      assessmentDuration: "Ongoing observation - enjoyment is assessed constantly",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL 9: Resilience
  // Domain: Psychological | Stage: Fundamentals
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "e525b9a7-be10-46ec-b90c-e01b7ece1cf6",
    name: "Resilience",
    domain: "psychological",
    stage: "Fundamentals",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player struggles significantly after setbacks. Mistakes, failures, or criticism lead to extended negative responses. Difficulty bouncing back within the same session.",
          observableBehaviors: [
            "Cries or becomes very upset after mistakes",
            "Shuts down or withdraws after errors",
            "Cannot continue playing normally after setback",
            "Negative self-talk visible or audible",
            "Blames others when things go wrong",
            "Gives up when challenged or frustrated",
          ],
          commonMistakes: [
            "Interpreting feedback as personal criticism",
            "Catastrophizing small setbacks",
            "Taking mistakes personally rather than as part of learning",
            "Comparing self negatively to others",
          ],
          coachingTips: [
            "Mistakes are how we learn - can you try again?",
            "What's one small thing you could try differently?",
            "I make mistakes too - watch me! What matters is trying again.",
            "Let's take a breath together - you've got this!",
          ],
          assessmentActivities: [
            "Observe response to making errors in practice",
            "Note body language during feedback",
            "Watch willingness to retry after correction",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Shows initial negative response to setbacks but can recover with support. Bounces back within the session but may carry frustration. Beginning to understand setbacks are normal.",
          observableBehaviors: [
            "Initial frustration but recovers with encouragement",
            "Can continue playing after mistakes with support",
            "Understands mistakes happen to everyone",
            "May need cool-down period after setback",
            "Recovery time is decreasing over time",
            "Beginning to try again after failures",
          ],
          commonMistakes: [
            "Applying feedback for short periods only then reverting",
            "Needing repeated reminders of same corrections",
            "Struggling with feedback during competition",
            "Hiding mistakes rather than learning from them",
          ],
          coachingTips: [
            "You tried to apply that - what happened?",
            "Learning takes time - you're making progress!",
            "What questions do you have about what we worked on?",
            "I noticed you bounced back faster that time - great job!",
          ],
          assessmentActivities: [
            "Track recovery time from setbacks",
            "Observe response to feedback in different contexts",
            "Note improvement in resilience over time",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Generally bounces back from setbacks quickly. Can process frustration and continue playing. Views mistakes as learning opportunities most of the time.",
          observableBehaviors: [
            "Brief frustration then re-engagement",
            "Tries again after unsuccessful attempts",
            "Can articulate what to do differently",
            "Maintains effort when things aren't going well",
            "Asks for help rather than giving up",
            "Keeps positive attitude most of the time",
          ],
          commonMistakes: [
            "May become discouraged with slow progress",
            "Sometimes focuses on too many corrections at once",
            "Occasionally reverts under game pressure",
            "Could be more proactive in seeking feedback",
          ],
          coachingTips: [
            "What feedback has been most helpful for you lately?",
            "How do you feel about your progress in this area?",
            "You're showing real growth - what's helping you learn?",
            "Can you teach what you've learned to a teammate?",
          ],
          assessmentActivities: [
            "Track application of feedback over multiple sessions",
            "Observe self-correction without prompting",
            "Note resilience in competitive situations",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong resilience - uses setbacks as fuel for improvement. Remains positive and engaged even during significant challenges. Models resilience for others.",
          observableBehaviors: [
            "Quickly redirects after mistakes",
            "Sees setbacks as opportunities to learn",
            "Maintains performance level under adversity",
            "Encourages teammates who are struggling",
            "Persistent in face of repeated challenges",
            "Talks positively about overcoming struggles",
          ],
          commonMistakes: [
            "May over-focus on improvement and lose natural play",
            "Could be more patient with own development",
          ],
          coachingTips: [
            "What areas are you most curious to improve?",
            "How do you prioritize the feedback you receive?",
            "Can you help others develop their resilience?",
            "You model great learning behavior - keep it up!",
          ],
          assessmentActivities: [
            "Observe leadership in receiving feedback",
            "Note influence on team resilience culture",
            "Track self-directed improvement efforts",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite resilience that thrives under pressure and adversity. Major setbacks are processed quickly and used constructively. Resilience inspires and elevates entire team.",
          observableBehaviors: [
            "Adversity brings out best performance",
            "Processes major setbacks constructively",
            "Creates culture of resilience on team",
            "Helps others develop coping strategies",
            "Remains confident through sustained challenges",
            "Views failures as essential to growth",
          ],
          commonMistakes: [
            "May set unrealistically high standards for self",
          ],
          coachingTips: [
            "You model elite resilience - how can you spread this?",
            "What's your process for applying feedback?",
            "Continue seeking challenging environments!",
            "Your resilience is a superpower - share it with others!",
          ],
          assessmentActivities: [
            "Leadership assessment in challenging situations",
            "Impact on team resilience culture",
            "Self-directed development plan quality",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Young children are still developing emotional regulation and may struggle to bounce back from setbacks. Keep things light and fun. Normalize mistakes constantly. Model your own mistakes and how you recover. Patience is essential.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can receive more nuanced feedback about resilience. Use stories and examples of famous athletes bouncing back. Help players develop simple strategies for recovering from mistakes. Celebrate bounce-back moments.",
        },
        ages12to14: {
          typicalLevel: "2-4",
          notes:
            "Wide range at this age based on personality and experience. Players can engage in deeper discussions about mindset and resilience. Involve them in developing their own coping strategies. Adolescent emotions add complexity.",
        },
      },
      redFlags: [
        "Unable to continue playing after minor setbacks",
        "Consistent crying or emotional distress in response to normal challenges",
        "Complete avoidance of challenging situations",
        "Negative self-talk that is extreme or concerning",
        "No improvement in coping despite consistent support",
      ],
      parentExplanation:
        "Resilience is the ability to bounce back from setbacks - mistakes, failures, disappointments. It's one of the most important psychological skills, not just for soccer but for life. We help players develop resilience by normalizing mistakes, celebrating effort over outcome, and teaching that failure is part of learning. At home, you can help by responding to their soccer struggles with curiosity ('What did you learn?') rather than disappointment, and by sharing your own stories of bouncing back from setbacks. The goal is for them to see challenges as opportunities, not threats.",
      homeActivities: [
        "Share family stories about bouncing back from failures",
        "After setbacks, play the 'What did we learn?' game",
        "Celebrate effort and persistence, not just results",
        "Model resilience in your own life and discuss it",
        "Ask 'What did you learn today?' instead of 'Did you win?'",
        "Praise specific moments when they bounced back: 'I saw you recover from that mistake - great job!'",
      ],
      bestAssessedIn: [
        "Response to in-training feedback and mistakes",
        "Recovery from errors during games",
        "Behavior during halftime when losing",
        "Reactions after difficult losses or poor performances",
      ],
      assessmentFrequency: "Observe at every session, formal assessment quarterly",
      assessmentDuration: "Ongoing observation across multiple situations over time",
    },
  },
];

export async function upgradeSoccerSkillsBatch3() {
  console.log(
    "Upgrading soccer skills with comprehensive assessment guides (Batch 3)..."
  );
  console.log(`Skills to upgrade: ${skillUpgrades.length}`);
  console.log("");

  let successCount = 0;
  let errorCount = 0;

  for (const skillUpgrade of skillUpgrades) {
    try {
      console.log(`  Updating: ${skillUpgrade.name} (${skillUpgrade.domain})`);

      await db
        .update(skills)
        .set({
          comprehensiveGuide: skillUpgrade.comprehensiveGuide,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, skillUpgrade.id));

      console.log(`    ID: ${skillUpgrade.id}`);
      console.log(`    Status: Success`);
      successCount++;
    } catch (error) {
      console.error(`    Error updating skill ${skillUpgrade.id}:`, error);
      errorCount++;
    }
  }

  console.log("");
  console.log("═".repeat(60));
  console.log("Upgrade Summary:");
  console.log(`  Successful: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log("═".repeat(60));

  return { successCount, errorCount };
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  upgradeSoccerSkillsBatch3()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed to upgrade skills:", error);
      process.exit(1);
    });
}

// Default export for use in seed runners
export default upgradeSoccerSkillsBatch3;

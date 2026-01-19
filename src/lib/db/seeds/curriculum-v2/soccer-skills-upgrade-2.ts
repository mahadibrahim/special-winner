/**
 * Soccer Skills Upgrade - Comprehensive Assessment Guides (Batch 2)
 *
 * Upgrades existing soccer skills with comprehensive assessment guides including:
 * - Detailed 5-level progression definitions
 * - Observable behaviors at each level
 * - Common mistakes and corrections
 * - Age-appropriate expectations
 * - Red flags for additional support
 * - Parent communication templates
 * - Home activities for skill development
 *
 * Skills upgraded:
 * PHYSICAL: Agility - Change of Direction
 * TACTICAL: Finding Space, When to Dribble vs Pass, Positional Awareness
 * PSYCHOLOGICAL: Coachability
 * TECHNICAL: 1v1 Dribbling Moves, Turning with Ball, Long Passing, Heading - Defensive
 *
 * Research-based guidelines applied:
 * - Guiding questions (not just commands) in coaching tips
 * - ELM framework language (Effort, Learning, Mistakes)
 * - Observable and measurable behaviors
 * - Age-appropriate expectations
 * - Holistic development connections (psychological/social)
 */

import { getDb } from "../../index";
import { skills } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

// Type for comprehensive guide structure
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
  comprehensiveGuide: ComprehensiveGuide;
}> = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PHYSICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: Agility - Change of Direction
  // Domain: Physical | Stage: Fundamentals
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "a0b1642c-5b5a-4fb7-8e7b-acb3baaddc39",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player shows limited ability to change direction. Movements are slow, off-balance, and lack coordination. Often loses balance or stumbles when attempting direction changes.",
          observableBehaviors: [
            "Takes wide, sweeping arcs when changing direction",
            "Often stumbles or loses balance during direction changes",
            "Needs multiple steps to slow down before turning",
            "Body remains upright without proper lean",
            "Arms do not assist in balance or momentum",
          ],
          commonMistakes: [
            "Standing too tall without athletic stance",
            "Crossing feet during direction changes",
            "Looking at feet instead of target direction",
            "Not bending knees to lower center of gravity",
            "Momentum carrying player past intended direction",
          ],
          coachingTips: [
            "What happens to your balance when you bend your knees more?",
            "Can you feel yourself getting lower before you turn?",
            "Let's celebrate every attempt - mistakes help us learn!",
            "What do you notice about how your feet feel on the ground?",
            "Try turning like you're in a small box - small steps are powerful!",
          ],
          assessmentActivities: [
            "Cone touch and return (short distance)",
            "Simple left-right shuffle between markers",
            "Follow the leader with direction changes",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Player can change direction but with noticeable deceleration and hesitation. Shows understanding of body position but execution is inconsistent.",
          observableBehaviors: [
            "Can change direction with 2-3 step preparation",
            "Shows some knee bend before direction change",
            "Occasionally maintains balance through turns",
            "Beginning to plant outside foot for cuts",
            "Starts using arms for balance",
          ],
          commonMistakes: [
            "Slowing down too much before changing direction",
            "Inconsistent foot placement on cuts",
            "Upper body lags behind lower body",
            "Hesitating before committing to new direction",
            "Reverting to upright stance under pressure",
          ],
          coachingTips: [
            "What happens if you push harder off your outside foot?",
            "How quickly can you get your eyes looking where you want to go?",
            "Notice how your body feels when you stay low - is it more powerful?",
            "Each wobble teaches your body something new - keep exploring!",
            "Can you feel the difference between a slow turn and a sharp cut?",
          ],
          assessmentActivities: [
            "T-drill at moderate pace",
            "React and change direction on whistle",
            "Partner shadow drill (slow speed)",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Player demonstrates reliable direction changes with proper technique in controlled settings. Can execute cuts effectively but may lose efficiency when fatigued or under pressure.",
          observableBehaviors: [
            "Plants and drives effectively in most situations",
            "Maintains low center of gravity through changes",
            "Eyes and head lead the direction change",
            "Arms swing opposite to legs for balance",
            "Can change direction without significant speed loss",
          ],
          commonMistakes: [
            "Technique breaks down when fatigued",
            "Slower direction changes under defensive pressure",
            "Occasionally telegraphs intended direction",
            "May favor one side over the other",
            "Inconsistent first step explosiveness after cut",
          ],
          coachingTips: [
            "What adjustments help you change direction faster to your weaker side?",
            "How can you disguise where you're about to go?",
            "When you get tired, what's the first thing that changes in your technique?",
            "Can you make the defender guess wrong about your next move?",
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
            "Player executes sharp, explosive direction changes consistently in game situations. Maintains technique under pressure and fatigue. Can deceive opponents with body feints.",
          observableBehaviors: [
            "Explosive first step out of direction changes",
            "Seamlessly links multiple direction changes",
            "Uses deceptive body movements before cuts",
            "Maintains technique when fatigued",
            "Equal proficiency changing direction either way",
          ],
          commonMistakes: [
            "May over-rely on agility when simpler solutions exist",
            "Occasionally too predictable in timing of cuts",
          ],
          coachingTips: [
            "How can you use your agility to create space for teammates?",
            "What patterns do defenders look for? How can you break those patterns?",
            "Leadership opportunity: can you help teammates improve their footwork?",
            "When is the best moment to make your move?",
            "How does your agility combine with your technical skills?",
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
            "Elite agility that creates consistent advantages. Player combines explosive direction changes with deception to beat defenders reliably. Agility is a weapon in their game.",
          observableBehaviors: [
            "Creates separation from defenders at will",
            "Changes direction with minimal speed loss",
            "Instinctively reads and reacts to defensive movements",
            "Combines agility with ball skills seamlessly",
            "Maintains elite movement quality for full game",
          ],
          commonMistakes: [
            "May attempt too many direction changes when direct approach is better",
          ],
          coachingTips: [
            "How can you use your elite movement to make the whole team better?",
            "What can you teach others about reading defensive movements?",
            "Continue challenging yourself - what's the next level?",
            "How do you maintain this quality over a full season?",
            "Model the effort and learning mindset for younger players",
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
        "Significant difference in ability between left and right sides persisting over time",
        "Pain or discomfort during direction changes",
        "Fear of quick movements not decreasing with exposure",
        "Unable to learn basic footwork patterns after extended practice",
      ],
      parentExplanation:
        "Agility - the ability to change direction quickly and efficiently - is fundamental to soccer. We work on teaching players to stay low, plant their outside foot, and explode in a new direction. It's not just about speed, but about control and body awareness. Every player develops at their own pace, and we celebrate effort and improvement. Home activities that involve quick movements and balance help reinforce what we work on in practice!",
      homeActivities: [
        "Play tag games that require quick direction changes",
        "Set up simple cone courses in the backyard",
        "Balance activities like standing on one foot while brushing teeth",
        "Hopscotch and similar playground games",
        "Dancing - great for coordination and rhythm",
        "Jump rope - builds foot quickness and coordination",
      ],
      bestAssessedIn: [
        "Agility drills and ladder work",
        "1v1 situations during training",
        "Small-sided games with limited space",
        "Warm-up activities with direction changes",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple training sessions and games",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TACTICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: Finding Space
  // Domain: Tactical | Stage: Fundamentals
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "0d7226f4-dc84-425b-97ee-4fb28fa701b2",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player gravitates toward the ball regardless of other players. Limited awareness of space on the field. Often stands in same area as teammates, creating clusters.",
          observableBehaviors: [
            "Follows the ball like a magnet (ball watching)",
            "Stands directly next to teammates",
            "Rarely moves when not near the ball",
            "Does not check over shoulder for space",
            "Waits for ball to come rather than moving to receive",
          ],
          commonMistakes: [
            "Running toward teammate with the ball",
            "Standing still expecting play to come to them",
            "Hiding behind defenders instead of finding gaps",
            "Moving only after teammate starts looking for pass",
            "Bunching up with other players",
          ],
          coachingTips: [
            "What happens when everyone stands together - is it easy to pass?",
            "Can you find a space where no one else is standing?",
            "If you were the player with the ball, where would you want a friend to be?",
            "Let's play a game - try to always be able to see the ball AND your teammate!",
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
            "Beginning to understand concept of space. Sometimes moves away from clusters but timing and positioning are inconsistent. Shows awareness but often moves too late.",
          observableBehaviors: [
            "Occasionally moves away from crowded areas",
            "Starting to check shoulder before receiving",
            "Can find space when directly coached",
            "Sometimes anticipates where play is going",
            "Recognizes when area is too crowded",
          ],
          commonMistakes: [
            "Moving to good space but arriving too late",
            "Finding space but not communicating availability",
            "Moving away from ball but not into useful positions",
            "Checking shoulder but not adjusting based on what's seen",
            "Standing still after finding initial space",
          ],
          coachingTips: [
            "You found great space - now how can you let your teammate know?",
            "What did you see when you checked over your shoulder?",
            "If you move earlier, what happens to your options?",
            "Great learning! What made that movement work?",
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
            "Consistently finds space in basic game situations. Understands timing of movement and can maintain good positions. May struggle in complex or high-pressure situations.",
          observableBehaviors: [
            "Consistently creates passing angles",
            "Moves before teammate needs to pass",
            "Checks shoulder regularly",
            "Adjusts position based on ball movement",
            "Understands when to stay and when to move",
          ],
          commonMistakes: [
            "Finding space but not facing the right direction",
            "Good positioning but not open body shape",
            "Struggling to find space against organized defenses",
            "Occasionally drifting into offside positions",
            "Movement becoming predictable to defenders",
          ],
          coachingTips: [
            "How can your body position help you see more of the field?",
            "What do you notice about how defenders react to your movement?",
            "Can you find space that helps you play forward, not just sideways?",
            "When the defense shifts, where does the new space appear?",
            "You're developing great awareness - what patterns do you see?",
          ],
          assessmentActivities: [
            "Positional rondo with central player",
            "Phase of play exercises",
            "Game observation for off-ball movement",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent spatial awareness and movement quality. Creates space for self and teammates. Understands how to manipulate defenders with movement.",
          observableBehaviors: [
            "Creates space through intelligent movement",
            "Drags defenders to open space for teammates",
            "Times runs to stay onside while threatening",
            "Uses check-away movements effectively",
            "Reads game flow and positions accordingly",
          ],
          commonMistakes: [
            "May make runs teammates aren't ready for",
            "Occasionally over-complicates movement",
          ],
          coachingTips: [
            "How can your movement help a teammate who's struggling?",
            "What does the team need from you in different game situations?",
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
            "Elite spatial awareness. Constantly finds and creates space. Movement is a weapon that disrupts defenses and creates chances. Reads game several moves ahead.",
          observableBehaviors: [
            "Instinctively finds pockets of space",
            "Movement creates chances for team regularly",
            "Manipulates defensive shape through runs",
            "Positions to receive in dangerous areas",
            "Organizes teammates' spacing through communication",
          ],
          commonMistakes: [
            "Teammates may not match their level of vision",
          ],
          coachingTips: [
            "How can you communicate your vision to help teammates understand?",
            "What patterns can you teach to younger players?",
            "Continue studying the game - what do elite players do differently?",
            "Model the effort required to maintain this level",
            "Your movement intelligence is a gift to the team - keep sharing it!",
          ],
          assessmentActivities: [
            "Complex tactical exercises",
            "Game statistics for space created",
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
        "Unable to grasp basic concept of spreading out",
        "Consistent difficulty understanding position in relation to others",
        "Anxiety about being in open space receiving ball",
        "Unable to divide attention between ball and surroundings",
      ],
      parentExplanation:
        "Finding space is one of the most important tactical skills in soccer. It means moving to areas where your teammate can pass to you effectively. Young players naturally want to run toward the ball, but as they develop, they learn to spread out and create passing options. This requires awareness of teammates, opponents, and the ball all at once - a complex skill that develops over years. We use games and activities to help players see and feel what good spacing looks like!",
      homeActivities: [
        "Watch soccer together and point out players without the ball",
        "Play 'find the space' in the backyard - spread out and pass",
        "Discuss where players could move during TV games",
        "Play catch while moving - adjust position for thrower",
        "Video games like FIFA can reinforce spatial concepts",
        "Board games that require spatial thinking",
      ],
      bestAssessedIn: [
        "Small-sided games (4v4, 5v5)",
        "Possession exercises",
        "Phase of play activities",
        "Full game observation",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple game situations",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: When to Dribble vs Pass
  // Domain: Tactical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "3578044a-66cb-4cf0-b1dc-18bcb259fe94",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player defaults to one option regardless of situation - either always dribbles or always passes. No recognition of cues that should influence the decision.",
          observableBehaviors: [
            "Dribbles into pressure when pass is open",
            "Passes immediately when dribbling space exists",
            "Head down, not scanning for options",
            "Panics when pressed - rushes decision",
            "No recognition of defensive positioning",
          ],
          commonMistakes: [
            "Not looking before receiving to assess options",
            "Making decision before receiving ball",
            "Ignoring open teammates to dribble",
            "Passing backward when forward dribble is available",
            "Taking too many touches before deciding",
          ],
          coachingTips: [
            "Before the ball comes, what can you look at?",
            "If a defender is far away, what option do you have?",
            "When you lost the ball there, what might have worked better?",
            "Great effort! Learning when to dribble takes lots of tries!",
            "Can you show me what you saw when you made that choice?",
          ],
          assessmentActivities: [
            "2v1 decisions with guided questions",
            "Freeze and discuss during small-sided games",
            "Shadow play to practice scanning",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to recognize some cues but execution is inconsistent. Can make correct decision in simple situations but struggles with speed of play or multiple options.",
          observableBehaviors: [
            "Sometimes looks up before receiving",
            "Can identify open pass in simple situations",
            "Recognizes when pressed and when free",
            "Occasionally chooses appropriate action",
            "Starting to understand risk vs. safety",
          ],
          commonMistakes: [
            "Correct read but slow execution",
            "Good decision on easy situations, poor on complex",
            "Reverting to habits under pressure",
            "Seeing options too late to use them",
            "Choosing appropriate action but poor technique",
          ],
          coachingTips: [
            "You saw that space perfectly - how can you act on it quicker?",
            "What told you that was the right moment to dribble?",
            "When you're feeling rushed, what can help you slow down mentally?",
            "That's a tough situation - what are your options?",
            "You're learning to read the game - mistakes are part of that!",
          ],
          assessmentActivities: [
            "Directional possession games",
            "3v2 attacking scenarios",
            "Decision-making exercises with visual cues",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Makes appropriate decisions in most game situations. Understands basic principles but may struggle in complex or rapid situations. Good judgment in moderate tempo.",
          observableBehaviors: [
            "Scans before receiving consistently",
            "Chooses appropriate action most of the time",
            "Recognizes when to take on vs. when to combine",
            "Understands risk based on field position",
            "Can verbalize why a choice was made",
          ],
          commonMistakes: [
            "Struggles with quick decision sequences",
            "May overthink in critical moments",
            "Inconsistent decision-making when fatigued",
            "Sometimes too safe when risk is appropriate",
            "Occasionally too risky in dangerous areas",
          ],
          coachingTips: [
            "What information helped you make that decision so quickly?",
            "In that situation, what made you choose to pass instead of dribble?",
            "When the game speeds up, how can you keep making good choices?",
            "Can you recognize the moment of decision earlier?",
            "You're developing great game sense - trust your instincts!",
          ],
          assessmentActivities: [
            "Full-pressure scrimmages with decision focus",
            "Video review of decision moments",
            "Phase of play with positional rules",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent decision-making at game speed. Chooses optimal action in most situations. Can make decisions under pressure and adjust based on game state.",
          observableBehaviors: [
            "Quick, appropriate decisions consistently",
            "Reads defensive body language to choose action",
            "Adjusts decision based on game context",
            "Takes calculated risks in appropriate moments",
            "Creates advantages through smart decisions",
          ],
          commonMistakes: [
            "May occasionally misread complex defensive schemes",
            "Could communicate decisions better to teammates",
          ],
          coachingTips: [
            "How can you help teammates understand your decision-making?",
            "What do you see that tells you to take that risk?",
            "In tight games, how do you balance risk and safety?",
            "You have great instincts - how did you develop them?",
            "Leadership: can you help others see the cues you see?",
          ],
          assessmentActivities: [
            "High-pressure game scenarios",
            "Competitive match analysis",
            "Leadership in tactical discussions",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite decision-maker who consistently makes optimal choices at speed. Anticipates situations before they develop. Decision-making is a competitive advantage.",
          observableBehaviors: [
            "Sees passes and dribbles before they're obvious",
            "Manipulates defenders through decision variety",
            "Makes difficult decisions look easy",
            "Teammates trust and follow their decisions",
            "Adjusts game plan based on opponent weaknesses",
          ],
          commonMistakes: [
            "Teammates may not execute at the same level",
          ],
          coachingTips: [
            "How do you process so much information so quickly?",
            "What can you teach others about reading the game?",
            "Continue studying the game at the highest levels",
            "Your decision-making elevates everyone - keep modeling it!",
            "What's the next frontier in your tactical development?",
          ],
          assessmentActivities: [
            "Elite competition performance",
            "Tactical leadership assessment",
            "Video comparison to professional standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "At this age, focus on having fun with the ball. Don't worry about perfect decisions - let them explore dribbling and passing. Simple 2v1 situations introduce the concept gently. Avoid over-coaching decisions; let them play and learn!",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Players can start understanding basic principles: dribble when free, pass when pressed. Use freeze games to discuss options. Keep explanations simple and visual. This is the beginning of tactical awareness.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Tactical understanding accelerates significantly. Can work on reading defensive cues and making quicker decisions. Video analysis becomes useful. Players should be able to explain their choices.",
        },
      },
      redFlags: [
        "Unable to identify any passing options after extended coaching",
        "Persistent panic when receiving the ball",
        "No improvement in decision-making over a full season",
        "Completely ignoring coaching cues about options",
        "Severe anxiety affecting ability to process information",
      ],
      parentExplanation:
        "Learning when to dribble and when to pass is like learning when to share - it takes time and lots of practice! Young players often default to one or the other. We teach them to look up, see their options, and choose based on the situation. A good rule: dribble when you have space, pass when you're under pressure. But really, this skill develops through playing lots of soccer and making lots of decisions - both good ones and mistakes. Both teach valuable lessons!",
      homeActivities: [
        "Watch games together and discuss player decisions",
        "Play 2v1 in the yard with decision discussions",
        "Ask 'what would you do?' during soccer on TV",
        "Video games that require tactical decisions",
        "Backyard soccer with 'freeze and discuss' moments",
        "Encourage multiple solutions to game scenarios",
      ],
      bestAssessedIn: [
        "Small-sided games with realistic pressure",
        "Phase of play exercises",
        "Full-sided competitive matches",
        "2v1 and 3v2 attacking scenarios",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple game situations with varied pressure",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: Positional Awareness
  // Domain: Tactical | Stage: Development
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "caf0f95c-0c54-4bf8-9e0f-cd4925ee137b",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Limited understanding of positional structure. Wanders away from assigned area. No awareness of how position relates to teammates or team shape.",
          observableBehaviors: [
            "Consistently found out of position",
            "Chases ball regardless of role",
            "Leaves large gaps in team shape",
            "Cannot identify own position's area",
            "No adjustment when teammates move",
          ],
          commonMistakes: [
            "Following the ball like a magnet",
            "Standing still in wrong area",
            "Leaving defensive responsibilities",
            "Bunching with other positions",
            "Not returning to position after attacking",
          ],
          coachingTips: [
            "Can you find your home area on the field?",
            "If you go there, who protects your space?",
            "Where would you stand to help your teammate?",
            "Every position is important - what's your job?",
            "Let's explore your area together - where are the boundaries?",
          ],
          assessmentActivities: [
            "Cone-marked position zones",
            "Freeze game to check positions",
            "Walking through team shape",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to understand positional area. Can maintain position in static situations but loses it during dynamic play. Needs frequent reminders.",
          observableBehaviors: [
            "Knows general area for their position",
            "Can return to position when reminded",
            "Starting to see relationships with nearby players",
            "Maintains position in slow moments",
            "Beginning to adjust based on ball location",
          ],
          commonMistakes: [
            "Losing position when ball moves quickly",
            "Only adjusting in one direction",
            "Forgetting to recover after pressing",
            "Not communicating with adjacent positions",
            "Position good off ball but poor with ball",
          ],
          coachingTips: [
            "When the ball moves there, how does your position change?",
            "What do you notice about where your teammates are?",
            "If you were the coach, where would you want yourself?",
            "You're learning the shape - it takes time and that's okay!",
            "Can you feel when you're connected to the team vs. isolated?",
          ],
          assessmentActivities: [
            "Shadow play without opposition",
            "Ball movement with positional shifting",
            "Partner connection maintaining distance",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Maintains positional discipline in most situations. Understands how position relates to team shape. Can adjust based on ball and teammate positions.",
          observableBehaviors: [
            "Consistently stays in appropriate area",
            "Adjusts position as ball moves",
            "Maintains connection with nearby teammates",
            "Recovers to position after transitions",
            "Understands defensive and attacking shape",
          ],
          commonMistakes: [
            "Occasional positional lapses in long games",
            "May drift when attention lapses",
            "Struggles with complex tactical adjustments",
            "Slow to adapt when formation changes",
            "Better in one phase (attack/defense) than other",
          ],
          coachingTips: [
            "How does your position change between attack and defense?",
            "What triggers you to shift your position?",
            "Can you stay positionally connected even when tired?",
            "What's your relationship with the players closest to you?",
            "You're reading the game well - what patterns do you notice?",
          ],
          assessmentActivities: [
            "11v11 with positional focus",
            "Video review of positioning",
            "Defensive shape exercises",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent positional discipline and understanding. Organizes self within team structure. Can adapt position based on game state and opponent behavior.",
          observableBehaviors: [
            "Instinctively maintains correct position",
            "Helps organize teammates positionally",
            "Adapts to different formations quickly",
            "Reads game to anticipate positional needs",
            "Positions to support multiple phases of play",
          ],
          commonMistakes: [
            "May become too rigid in positioning",
            "Occasionally sacrifices creativity for structure",
          ],
          coachingTips: [
            "How can you help teammates understand their positions?",
            "When should you break from position to create chances?",
            "You're a positional leader - how can you organize others?",
            "What do you notice about opponent positioning?",
            "Balance structure with creativity - when do you take risks?",
          ],
          assessmentActivities: [
            "Tactical leadership evaluation",
            "Game observation for positioning influence",
            "Organizing team shape exercises",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite positional intelligence. Organizes team shape and anticipates tactical needs. Position becomes a weapon through intelligent movement and organization.",
          observableBehaviors: [
            "Commands team organization vocally",
            "Anticipates opponent patterns to position",
            "Creates overloads through positioning",
            "Adapts position to exploit weaknesses",
            "Maintains shape under extreme pressure",
          ],
          commonMistakes: [
            "Teammates may not match tactical understanding",
          ],
          coachingTips: [
            "How do you see the game differently than others?",
            "What can you teach about reading positions?",
            "Continue studying elite tactical organization",
            "Your understanding benefits everyone - keep sharing it!",
            "What's next in your tactical education?",
          ],
          assessmentActivities: [
            "Captaincy/leadership assessment",
            "Video analysis of organizational impact",
            "Performance against elite opponents",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Strict positions are not developmentally appropriate at this age. Let players experience all areas of the field. Basic ideas of 'your area' can be introduced gently, but expect players to chase the ball. Focus on having fun and experiencing different roles!",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin introducing positional concepts more formally. Players start to understand team shape and their role within it. Still allow flexibility - rigid positions can limit development. Use visual aids and freeze games to teach positioning.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players can understand and maintain positions more consistently. Can work on connections between positions and how shape changes in different phases. Video analysis becomes very useful for teaching positional concepts.",
        },
      },
      redFlags: [
        "Complete inability to understand positional area after extended coaching",
        "Cannot maintain position even when game is stopped",
        "No improvement in positional awareness over a season",
        "Significant anxiety about positional responsibilities",
        "Unable to see relationship between self and teammates",
      ],
      parentExplanation:
        "Positional awareness is about understanding where to be on the field and how that relates to teammates and opponents. Young players naturally chase the ball - that's completely normal! As they develop, they learn about team shape and their role within it. We teach positions gradually, always balancing structure with the freedom to explore. A player who understands positioning makes the whole team better because they know how to support teammates and cover space. This develops over years of playing and learning!",
      homeActivities: [
        "Watch professional games and track one player's movement",
        "Discuss team shapes visible on TV broadcasts",
        "Draw position maps after watching games",
        "Play video games that show tactical formations",
        "Have conversations about different positions and roles",
        "Watch tactical analysis videos appropriate for their age",
      ],
      bestAssessedIn: [
        "Full-sided games with focus on shape",
        "Phase of play exercises",
        "Transition moments in games",
        "Defensive organization activities",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across a full game or multiple sessions",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PSYCHOLOGICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: Coachability
  // Domain: Psychological | Stage: Fundamentals
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "23f96a07-004a-4e22-9c2d-407c1a2de230",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player struggles to receive or apply coaching feedback. May resist instruction, become defensive, or ignore suggestions. Limited ability to implement changes.",
          observableBehaviors: [
            "Defensive or argumentative when receiving feedback",
            "Ignores or forgets coaching instructions quickly",
            "Does not attempt to apply corrections",
            "Body language shows disengagement (crossed arms, looking away)",
            "Makes excuses rather than attempting change",
          ],
          commonMistakes: [
            "Interpreting feedback as personal criticism",
            "Shutting down emotionally when corrected",
            "Not asking for clarification when confused",
            "Comparing self negatively to others",
            "Giving up after unsuccessful attempts",
          ],
          coachingTips: [
            "What's one small thing you could try differently?",
            "Mistakes are how we learn - can you try again?",
            "I'm going to help you get better - are you ready?",
            "Let's focus on effort, not perfection!",
            "How do you feel when you're learning something new?",
          ],
          assessmentActivities: [
            "Give simple instruction and observe response",
            "Note body language during feedback",
            "Observe willingness to retry after correction",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Shows willingness to receive feedback but struggles to implement it consistently. Can accept coaching in positive moments but may become frustrated when challenged.",
          observableBehaviors: [
            "Listens to feedback without strong resistance",
            "Attempts to apply corrections but inconsistently",
            "Accepts feedback better from trusted coaches",
            "Shows frustration but continues trying",
            "Beginning to ask questions about feedback",
          ],
          commonMistakes: [
            "Applying feedback for short periods only",
            "Reverting to old habits under pressure",
            "Accepting feedback but not fully understanding it",
            "Needing repeated reminders of same corrections",
            "Struggling with feedback during competition",
          ],
          coachingTips: [
            "What part of that feedback makes sense to you?",
            "How can we remember this for next time?",
            "You tried to apply that - what happened?",
            "Learning takes time - you're making progress!",
            "What questions do you have about what we worked on?",
          ],
          assessmentActivities: [
            "Provide multi-step instruction and observe",
            "Check retention of coaching after short break",
            "Observe response to feedback during games",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Receives feedback positively and makes genuine attempts to implement it. Can sustain changes over multiple sessions. Open to learning and shows growth mindset.",
          observableBehaviors: [
            "Listens actively with positive body language",
            "Attempts corrections immediately",
            "Retains coaching from session to session",
            "Asks clarifying questions appropriately",
            "Shows visible effort to improve",
          ],
          commonMistakes: [
            "May become discouraged with slow progress",
            "Sometimes focuses on too many corrections at once",
            "Could be more proactive in seeking feedback",
            "Occasionally reverts under game pressure",
            "May need help prioritizing what to work on",
          ],
          coachingTips: [
            "What feedback has been most helpful for you lately?",
            "How do you feel about your progress in this area?",
            "Let's pick one thing to focus on today - what's most important?",
            "You're showing real growth - what's helping you learn?",
            "Can you teach what you've learned to a teammate?",
          ],
          assessmentActivities: [
            "Track application of feedback over multiple sessions",
            "Observe self-correction without prompting",
            "Note frequency of seeking feedback",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Actively seeks feedback and applies it quickly. Views coaching as opportunity for growth. Can receive feedback from multiple sources and prioritize what to work on.",
          observableBehaviors: [
            "Proactively asks for feedback",
            "Applies corrections quickly and retains them",
            "Welcomes challenging feedback",
            "Self-corrects based on previous coaching",
            "Helps teammates receive and apply feedback",
          ],
          commonMistakes: [
            "May over-focus on feedback and lose natural play",
            "Could be more patient with own development",
          ],
          coachingTips: [
            "What areas are you most curious to improve?",
            "How do you prioritize the feedback you receive?",
            "Can you help others develop their coachability?",
            "Balance analysis with trusting your instincts!",
            "You model great learning behavior - keep it up!",
          ],
          assessmentActivities: [
            "Observe leadership in receiving feedback",
            "Note influence on team learning culture",
            "Track self-directed improvement efforts",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite learner who maximizes every coaching interaction. Creates learning opportunities for self and others. Models coachability for the entire team.",
          observableBehaviors: [
            "Transforms feedback into immediate improvement",
            "Creates team culture of learning",
            "Seeks feedback from multiple sources",
            "Processes feedback at game speed",
            "Mentors teammates in receiving coaching",
          ],
          commonMistakes: [
            "May set unrealistically high standards for self",
          ],
          coachingTips: [
            "You model elite coachability - how can you spread this?",
            "What's your process for applying feedback?",
            "Continue seeking challenging coaching environments!",
            "Balance growth mindset with self-compassion",
            "Your coachability is a superpower - share it with others!",
          ],
          assessmentActivities: [
            "Leadership assessment in learning situations",
            "Impact on team learning culture",
            "Self-directed development plan quality",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Young children are still developing emotional regulation and may struggle with feedback. Keep instructions simple and positive. Celebrate effort over outcome. Avoid public corrections when possible. Make learning feel like play!",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Players can receive more detailed feedback but still need it delivered positively. Model how to receive feedback. Use 'I notice... I wonder...' language. Help players see feedback as helpful, not critical.",
        },
        ages12to14: {
          typicalLevel: "2-4",
          notes:
            "Wide range at this age based on personality and experience. Players can engage in deeper discussions about their development. Involve them in goal-setting. Adolescents may have more complex emotional responses to feedback - be patient and supportive.",
        },
      },
      redFlags: [
        "Complete refusal to accept any feedback",
        "Severe emotional reactions to correction",
        "Consistent blame of others for own mistakes",
        "No improvement in receptiveness over extended time",
        "Anxiety or fear responses to coaching situations",
      ],
      parentExplanation:
        "Coachability is the ability to receive feedback positively and use it to improve. It's one of the most important skills for long-term development in any area of life! We use the ELM framework: celebrate Effort, embrace Learning, and see Mistakes as opportunities. Young players are still developing emotional regulation, so we're patient and positive. At home, you can model coachability by showing how you receive feedback in your own life and talking about mistakes as learning opportunities!",
      homeActivities: [
        "Model receiving feedback positively in your own life",
        "Talk about mistakes as learning opportunities",
        "Ask 'What did you learn today?' instead of 'Did you win?'",
        "Celebrate effort and improvement, not just results",
        "Share stories of famous people who learned from feedback",
        "Practice giving and receiving feedback as a family game",
      ],
      bestAssessedIn: [
        "Response to in-training feedback",
        "Application of coaching in games",
        "Behavior during halftime team talks",
        "Recovery from mistakes",
      ],
      assessmentFrequency: "Ongoing observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple interactions over time",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TECHNICAL SKILLS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: 1v1 Dribbling Moves
  // Domain: Technical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "17890974-275f-4f13-b3cb-86db57977868",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player has no effective moves to beat a defender. Dribbles directly into defenders or kicks ball past and chases. No deceptive body movements.",
          observableBehaviors: [
            "Dribbles straight at defender with no change",
            "Loses ball immediately when defender engages",
            "No attempt at feints or body movements",
            "Kicks ball past defender and chases",
            "Stops with ball when defender approaches",
          ],
          commonMistakes: [
            "No change of pace before or after move",
            "Eyes only on ball, not defender",
            "Body weight prevents quick direction change",
            "Telegraphing intentions to defender",
            "Attempting moves from too far away",
          ],
          coachingTips: [
            "Can you pretend to go one way and then go the other?",
            "What happens if you slow down before speeding up?",
            "Watch the defender - where are they moving?",
            "Every attempt teaches you something - keep trying!",
            "Let's start with one simple move and practice it lots!",
          ],
          assessmentActivities: [
            "1v1 in tight space with passive defender",
            "Cone dribbling with direction changes",
            "Move execution without defender",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Beginning to attempt moves but execution is slow or predictable. Can occasionally beat passive defenders but struggles against active pressure.",
          observableBehaviors: [
            "Attempts one or two basic moves",
            "Sometimes successful against passive defenders",
            "Move execution is slow",
            "Beginning to use change of pace",
            "Starting to watch defender's movements",
          ],
          commonMistakes: [
            "Move is telegraphed or slow to execute",
            "Only one move attempted regardless of situation",
            "Loses balance during move execution",
            "No acceleration after successful move",
            "Attempting moves in wrong situations",
          ],
          coachingTips: [
            "How can you make that move quicker?",
            "What does the defender's body tell you?",
            "After your move, where do you explode?",
            "You're getting it! What felt good about that attempt?",
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
            "Has 2-3 reliable moves that can beat defenders in game situations. Uses change of pace and body feints. Can select appropriate move for the situation.",
          observableBehaviors: [
            "Executes 2-3 moves effectively",
            "Uses change of pace to unbalance defenders",
            "Reads defender position before selecting move",
            "Accelerates effectively after successful move",
            "Can perform moves at game speed",
          ],
          commonMistakes: [
            "Relies too heavily on favorite move",
            "May force 1v1 when pass is better option",
            "Inconsistent success against physical defenders",
            "Move selection sometimes inappropriate",
            "Struggling to chain moves together",
          ],
          coachingTips: [
            "What's your go-to move? What's your backup?",
            "What does the defender's weight distribution tell you?",
            "When does 1v1 dribbling help the team most?",
            "Can you combine two moves together?",
            "You're becoming dangerous - what's next to learn?",
          ],
          assessmentActivities: [
            "1v1 competitions with scoring",
            "Game observation for moves attempted/successful",
            "Move variety assessment",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent repertoire of moves executed at speed. Can chain moves together. Creates chances regularly through 1v1 ability. Reads defenders instinctively.",
          observableBehaviors: [
            "Multiple moves executed at high speed",
            "Chains moves together fluidly",
            "Reads and exploits defender weaknesses",
            "Uses moves to create team opportunities",
            "Consistent success rate against good defenders",
          ],
          commonMistakes: [
            "May over-dribble in team contexts",
            "Could be more direct when appropriate",
          ],
          coachingTips: [
            "How can your 1v1 ability help teammates?",
            "When is the simple option better than the move?",
            "Can you help others develop their moves?",
            "What makes elite dribblers different?",
            "Balance creativity with team responsibility!",
          ],
          assessmentActivities: [
            "Elite 1v1 competitions",
            "Game impact statistics",
            "Teaching ability assessment",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite dribbler who can beat defenders consistently in any situation. Moves are explosive and deceptive. 1v1 ability is a significant team weapon.",
          observableBehaviors: [
            "Beats defenders at will",
            "Creates chances from nothing",
            "Moves executed instinctively",
            "Draws multiple defenders to create space",
            "Performs under highest pressure moments",
          ],
          commonMistakes: [
            "Teammates may become too reliant on individual skill",
          ],
          coachingTips: [
            "How can you use your ability to make others better?",
            "What do you see that others don't?",
            "Continue innovating - what's the next move to master?",
            "Model the practice habits that built this skill!",
            "Your skill inspires others - keep working!",
          ],
          assessmentActivities: [
            "Performance in high-stakes matches",
            "Statistical impact analysis",
            "Comparison to elite standards",
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
        "Complete avoidance of 1v1 situations",
        "No improvement in any move after extended practice",
        "Fear of attempting moves in games",
        "Physical limitations preventing move execution",
        "Severe frustration blocking learning",
      ],
      parentExplanation:
        "1v1 dribbling moves are the tricks and fakes players use to get past defenders. We teach basic moves like scissors, step-overs, and cuts, but the real skill is in the timing, body movement, and change of pace. Players need lots of practice to make moves instinctive. At home, any time with the ball helps! Encourage creative dribbling in the backyard - the more comfortable they are with the ball, the better their moves will become.",
      homeActivities: [
        "Free dribbling in the yard - just play with the ball!",
        "Watch skill videos together and try to copy moves",
        "Set up cones to dribble around",
        "Practice moves in slow motion then speed up",
        "Play 1v1 with family members",
        "Challenge: how many moves can you learn?",
      ],
      bestAssessedIn: [
        "1v1 training activities",
        "Small-sided games",
        "Match situations with space to dribble",
        "Individual skill sessions",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple 1v1 opportunities",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: Turning with Ball
  // Domain: Technical | Stage: Skill Building
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "a49bc09a-d834-41e2-a2c8-70c492fd1930",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot turn effectively with the ball. Takes multiple touches, loses control, or must stop completely to change direction.",
          observableBehaviors: [
            "Stops ball completely before turning",
            "Takes 4+ touches to change direction",
            "Loses ball during turn attempts",
            "Cannot turn under any pressure",
            "Only turns in one direction",
          ],
          commonMistakes: [
            "Ball gets away from body during turn",
            "No use of body to shield ball",
            "Standing upright during turn",
            "Looking down at ball entire time",
            "Turning into pressure instead of away",
          ],
          coachingTips: [
            "Can you keep the ball close as you spin around?",
            "What happens if you use the inside of your foot?",
            "Try to make your body a shield between ball and defender!",
            "Every turn attempt helps you learn - keep trying!",
            "Let's start with turns when no one is there, then add challenge!",
          ],
          assessmentActivities: [
            "Turn and dribble to cone (no pressure)",
            "Receive ball and turn drill",
            "Counting touches needed to turn",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can execute basic turns in controlled situations but struggles with speed and pressure. Turn technique is developing but not reliable.",
          observableBehaviors: [
            "Completes basic turns with 2-3 touches",
            "Can turn when given time",
            "Uses inside of foot for most turns",
            "Beginning to shield ball during turn",
            "Can turn both directions (slowly)",
          ],
          commonMistakes: [
            "Turn is slow and predictable",
            "Loses ball when pressed during turn",
            "Doesn't check shoulder before turning",
            "Limited turn variety",
            "Turn lacks fluidity - stop-start motion",
          ],
          coachingTips: [
            "What can you see before you receive to know where to turn?",
            "How can you make your turn quicker?",
            "Can you try using the outside of your foot too?",
            "You're getting smoother - what's helping?",
            "What happens if you lean your body during the turn?",
          ],
          assessmentActivities: [
            "Turn under light pressure",
            "Different turn types drill",
            "Turn and accelerate exercise",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Executes multiple turn types effectively in game situations. Can turn away from pressure and maintain possession. Checks shoulder before receiving.",
          observableBehaviors: [
            "Uses multiple turn types appropriately",
            "Checks shoulder before receiving",
            "Shields ball effectively during turn",
            "Accelerates out of turns",
            "Turns both directions with competence",
          ],
          commonMistakes: [
            "May default to favorite turn type",
            "Occasionally caught by quick pressure",
            "Could be sharper in execution",
            "Sometimes turns into pressure unnecessarily",
            "Turn selection occasionally poor",
          ],
          coachingTips: [
            "What tells you which type of turn to use?",
            "How can you turn even sharper and quicker?",
            "When would a Cruyff turn work better than a drag-back?",
            "You're reading pressure well - can you punish it?",
            "Can you help a teammate improve their turns?",
          ],
          assessmentActivities: [
            "Turn against active defender",
            "Turn variety in rondo",
            "Game observation for turn success",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent turning ability with variety and speed. Creates space and time through turns. Can turn under pressure and in tight spaces.",
          observableBehaviors: [
            "Turns create space and opportunities",
            "Multiple turns executed at speed",
            "Exploits defender positioning with turn choice",
            "Turns in tight spaces effectively",
            "Turns become attacking weapons",
          ],
          commonMistakes: [
            "May attempt ambitious turns when simple is better",
            "Could distribute quicker after turns",
          ],
          coachingTips: [
            "How do your turns help the team build attacks?",
            "When is turning necessary vs. playing direct?",
            "Can you teach your turn variety to others?",
            "What do you look for when choosing your turn?",
            "Elite turning comes from preparation - keep scanning!",
          ],
          assessmentActivities: [
            "High-pressure rondo",
            "Game impact analysis",
            "Turn success rate statistics",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite turning ability that creates consistent advantages. Turns out of any pressure. Turn selection and execution are instinctive weapons.",
          observableBehaviors: [
            "Turns out of pressure consistently",
            "Creates chances through turning ability",
            "Instinctive turn selection",
            "Performs elite turns under highest pressure",
            "Turns are unpredictable and effective",
          ],
          commonMistakes: [
            "Teammates may not expect quick turn and play forward",
          ],
          coachingTips: [
            "Your turning ability changes games - how do you create that?",
            "What can you teach others about preparing to receive?",
            "Continue challenging yourself in tighter spaces!",
            "Model the scanning habits that make this possible!",
            "Your turns inspire creativity - keep innovating!",
          ],
          assessmentActivities: [
            "Performance in elite competition",
            "Statistical impact of turning",
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
        "No improvement in any turn type over time",
      ],
      parentExplanation:
        "Turning with the ball is how players change direction while maintaining possession. It's essential for playing out of pressure and creating attacking opportunities. We teach different turn types: inside cut, outside cut, drag-back, and more advanced turns. The key is checking over the shoulder before receiving to know where the pressure is coming from. At home, any ball work helps - practicing turns in the yard builds the comfort and touch needed!",
      homeActivities: [
        "Practice drag-backs against a wall",
        "Set up cone to receive and turn around",
        "Watch professionals turn and discuss what they do",
        "Play 'turn and score' in backyard",
        "Practice checking shoulder (just turning head to look)",
        "Slow motion turn practice then speed up",
      ],
      bestAssessedIn: [
        "Rondo and possession activities",
        "Receiving exercises with back to goal",
        "Game situations receiving under pressure",
        "Technical training circuits",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple receiving situations",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: Long Passing
  // Domain: Technical | Stage: Development
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "554ee789-6110-48d0-9bee-206b0f48eb6e",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player cannot execute long passes effectively. Ball stays on ground, goes wrong direction, or has no power. Technique is incorrect.",
          observableBehaviors: [
            "Ball does not get airborne",
            "Passes lack distance (under 15 yards)",
            "No accuracy - ball goes anywhere",
            "Incorrect body position and contact",
            "Often whiffs or mis-hits the ball",
          ],
          commonMistakes: [
            "Striking with toe instead of instep/laces",
            "Standing too upright at contact",
            "Non-kicking foot placement incorrect",
            "No follow-through on strike",
            "Eyes not on ball at contact",
          ],
          coachingTips: [
            "Can you point your toe down when you kick?",
            "Where should your non-kicking foot be?",
            "Watch the ball all the way onto your foot!",
            "Every attempt helps you learn - that was brave to try!",
            "Let's work on just getting it in the air first!",
          ],
          assessmentActivities: [
            "Stationary long pass attempts",
            "Distance measurement exercises",
            "Technique breakdown practice",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can get ball airborne but with limited accuracy and distance. Technique improving but inconsistent. Struggles with weight of pass.",
          observableBehaviors: [
            "Gets ball airborne occasionally",
            "Passes reach 15-25 yards sometimes",
            "Direction generally correct",
            "Technique inconsistent",
            "Some proper body mechanics showing",
          ],
          commonMistakes: [
            "Inconsistent contact point on ball",
            "Leaning back too much (ball goes too high)",
            "Or leaning forward (ball stays low)",
            "Run-up inconsistent",
            "Weight of pass varies widely",
          ],
          coachingTips: [
            "What happens when you lean back vs. stay over the ball?",
            "Can you feel the difference when you strike it cleanly?",
            "How's your approach - is it the same each time?",
            "You're getting height! Now how about accuracy?",
            "What part of your foot makes the best contact?",
          ],
          assessmentActivities: [
            "Target practice at various distances",
            "Switching play exercises",
            "Technique video analysis",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Executes long passes with reasonable accuracy and distance in training. Can switch play and hit longer passes in games with moderate success.",
          observableBehaviors: [
            "Consistent technique and contact",
            "Passes reach 25-40 yards accurately",
            "Can switch play effectively",
            "Appropriate weight on most passes",
            "Uses both instep and driven techniques",
          ],
          commonMistakes: [
            "Accuracy decreases under pressure",
            "May struggle with moving ball long passes",
            "Inconsistent in windy conditions",
            "Could improve weak foot long passing",
            "Timing of release sometimes off",
          ],
          coachingTips: [
            "How does your long passing help the team tactically?",
            "What adjustments help in different conditions?",
            "Can you hit that pass first time off a moving ball?",
            "When is a long pass the right choice?",
            "You're developing a weapon - how else can you use it?",
          ],
          assessmentActivities: [
            "Long pass accuracy tests",
            "Switching play under pressure",
            "Game observation for long pass success",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Excellent long passing ability with accuracy and variety. Can execute diagonal balls, switches, and long balls into space. Creates chances through distribution.",
          observableBehaviors: [
            "Accurate long passes consistently",
            "Creates chances through distribution",
            "Can hit different types of long balls",
            "Comfortable in game pressure",
            "Uses weak foot for long passes",
          ],
          commonMistakes: [
            "May over-rely on long passing when short is better",
            "Could time passes more precisely",
          ],
          coachingTips: [
            "How do you read when a long pass will break the defense?",
            "What long passing patterns most help the team?",
            "Can you help teammates improve their technique?",
            "When does the simple ball work better?",
            "Your range changes the game - when do you use it?",
          ],
          assessmentActivities: [
            "Distribution impact in games",
            "Long pass assist statistics",
            "Accuracy under pressure testing",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite long passing ability that creates consistent advantages. Can hit any type of long ball with precision. Distribution is a key weapon for the team.",
          observableBehaviors: [
            "Creates chances from deep through passing",
            "Hits targets at any distance",
            "Switches play instantly",
            "Passes perfectly weighted for runners",
            "Long passing opens up games",
          ],
          commonMistakes: [
            "Teammates may not make runs for exceptional passes",
          ],
          coachingTips: [
            "Your passing range is elite - how did you develop it?",
            "What can you teach others about technique?",
            "Continue perfecting variety and disguise!",
            "How do you communicate your vision to runners?",
            "Model the practice habits that built this skill!",
          ],
          assessmentActivities: [
            "Distribution statistics analysis",
            "Impact on team attacking patterns",
            "Comparison to professional standards",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "Long passing is not developmentally appropriate at this age due to strength limitations. Focus on short passing technique. Any long kicking is just for fun, not for assessment. Let them explore without pressure.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Can begin introducing long passing technique as strength develops. Focus on proper mechanics over distance. Don't expect game-ready long passes yet. Make it playful - 'how far can you kick?'",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players have more strength for long passing. Focus on accuracy and weight. Can begin using long passes tactically. Weak foot development becomes important. Video analysis can help with technique.",
        },
      },
      redFlags: [
        "Cannot get ball airborne after extended technique work",
        "Pain or discomfort when striking",
        "Dramatic difference between feet not improving",
        "Fear of attempting long passes in games",
        "No improvement in distance over extended period",
      ],
      parentExplanation:
        "Long passing is the ability to accurately send the ball over longer distances (25+ yards). It's a crucial skill for switching play, hitting forwards with through balls, and goal kicks. The technique involves striking through the bottom half of the ball with a locked ankle, proper body position, and follow-through. It takes strength that develops over time, so younger players shouldn't be expected to hit long passes yet. Practice kicking at targets helps develop the technique!",
      homeActivities: [
        "Practice kicking at targets in open spaces",
        "Work on technique with standing ball first",
        "Watch professional long passes and discuss technique",
        "Kick toward targets at increasing distances",
        "Practice with both feet",
        "Video your technique to review",
      ],
      bestAssessedIn: [
        "Switching play exercises",
        "Target practice activities",
        "Game situations requiring distribution",
        "Set piece delivery",
      ],
      assessmentFrequency: "Monthly observation, formal assessment quarterly",
      assessmentDuration: "Observe across multiple long passing opportunities",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SKILL: Heading - Defensive
  // Domain: Technical | Stage: Development
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "6bf53e73-6cfa-4219-867f-8356e7965a06",
    comprehensiveGuide: {
      levelDetails: {
        1: {
          name: "Emerging",
          description:
            "Player avoids heading or closes eyes before contact. Cannot direct the ball with their head. Fear or discomfort with heading.",
          observableBehaviors: [
            "Avoids heading attempts",
            "Closes eyes before ball arrives",
            "Lets ball hit top of head passively",
            "Cannot time jump for aerial balls",
            "Shows visible fear or reluctance",
          ],
          commonMistakes: [
            "Closing eyes before contact",
            "Letting ball hit instead of attacking ball",
            "Using top of head instead of forehead",
            "No jump or mistimed jump",
            "Not watching ball all the way",
          ],
          coachingTips: [
            "Can you keep your eyes open and watch the ball?",
            "Let's start with very soft serves - no pressure!",
            "You control the ball, not the other way around!",
            "Every attempt builds bravery - great effort!",
            "What does it feel like on your forehead vs. top of head?",
          ],
          assessmentActivities: [
            "Self-serve and head drill",
            "Partner soft toss heading",
            "Comfort level observation",
          ],
        },
        2: {
          name: "Developing",
          description:
            "Can head the ball when served but with limited power and accuracy. Beginning to time jumps. Still uncomfortable but willing to attempt.",
          observableBehaviors: [
            "Attempts headers when required",
            "Makes contact with forehead sometimes",
            "Basic timing developing",
            "Can head stationary serves",
            "Power is limited",
          ],
          commonMistakes: [
            "Waiting for ball instead of attacking it",
            "Neck stiff instead of generating power",
            "Poor timing on aerial challenges",
            "Direction of header unpredictable",
            "Losing aerial duels to more aggressive players",
          ],
          coachingTips: [
            "Can you go TO the ball instead of waiting for it?",
            "What part of your forehead should hit the ball?",
            "How does your neck movement affect power?",
            "You're getting braver! What's helping your confidence?",
            "Can you direct it toward a target?",
          ],
          assessmentActivities: [
            "Heading accuracy to target",
            "Timing and jump drills",
            "Heading for distance",
          ],
        },
        3: {
          name: "Competent",
          description:
            "Heads the ball with decent power and direction in game situations. Can win some aerial duels. Comfortable with heading technique.",
          observableBehaviors: [
            "Attacks the ball with forehead",
            "Generates power through neck snap",
            "Times jumps reasonably well",
            "Clears ball with distance",
            "Wins some aerial duels",
          ],
          commonMistakes: [
            "May lose duels against stronger opponents",
            "Direction could be more precise",
            "Heading under pressure less effective",
            "Could be more commanding in the air",
            "Positioning for aerial duels needs work",
          ],
          coachingTips: [
            "What helps you win aerial duels against bigger players?",
            "How can you attack the ball at its highest point?",
            "Where should your header go to help the team?",
            "You're comfortable heading - now how about commanding?",
            "Can you read where the ball will be served?",
          ],
          assessmentActivities: [
            "Aerial duel competitions",
            "Defensive heading clearances",
            "Heading under game pressure",
          ],
        },
        4: {
          name: "Proficient",
          description:
            "Strong defensive heading with power, timing, and direction. Commands aerial duels. Can head away from danger in all situations.",
          observableBehaviors: [
            "Dominates aerial situations",
            "Clears with distance and direction",
            "Excellent timing on all deliveries",
            "Commands box on defensive set pieces",
            "Heads under maximum pressure",
          ],
          commonMistakes: [
            "May go for every ball even when not needed",
            "Could communicate aerial intentions better",
          ],
          coachingTips: [
            "How do you organize others in aerial situations?",
            "When should you leave it vs. attack it?",
            "Your heading gives confidence to teammates - keep it up!",
            "Can you help others develop heading comfort?",
            "What positioning helps you dominate aerially?",
          ],
          assessmentActivities: [
            "Set piece defensive organization",
            "Aerial duel statistics",
            "Leadership in aerial situations",
          ],
        },
        5: {
          name: "Advanced",
          description:
            "Elite defensive heading ability. Dominates aerially in all situations. Heading is a major defensive weapon. Organizes team defensive heading.",
          observableBehaviors: [
            "Wins vast majority of aerial duels",
            "Clears danger consistently",
            "Heads from difficult positions effectively",
            "Commands entire defensive aerial game",
            "Creates confidence through dominance",
          ],
          commonMistakes: [
            "Teammates may over-rely on heading ability",
          ],
          coachingTips: [
            "Your aerial dominance changes games - how?",
            "What can you teach about heading bravery?",
            "Continue challenging yourself against elite opponents!",
            "How do you prepare to win aerial duels?",
            "Model the preparation habits that make this possible!",
          ],
          assessmentActivities: [
            "Performance against elite attackers",
            "Statistical aerial duel analysis",
            "Defensive impact assessment",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1",
          notes:
            "SAFETY FIRST: No heading for players under age 10 in most organizations due to brain development concerns. If heading is part of your program, use only soft, light balls and very gentle serves. Focus on tracking the ball and proper contact point. Never force reluctant players to head.",
        },
        ages9to11: {
          typicalLevel: "1-2",
          notes:
            "Follow your organization's heading guidelines carefully. If introducing heading, use appropriate balls and limited practice. Focus on technique with soft serves. Build confidence gradually. Never shame reluctance to head.",
        },
        ages12to14: {
          typicalLevel: "2-3",
          notes:
            "Players can begin more regular heading practice with proper technique emphasis. Focus on attacking the ball and proper contact point. Build confidence through progressive challenges. Defensive heading becomes more relevant at this age.",
        },
      },
      redFlags: [
        "Severe anxiety or fear around heading not improving",
        "Pain or headaches after heading practice",
        "Complete avoidance despite supportive environment",
        "Dizziness or disorientation after heading",
        "Any signs of concussion - seek medical attention immediately",
      ],
      parentExplanation:
        "Defensive heading is the ability to clear the ball from danger using your head. SAFETY is paramount - we follow all organizational guidelines about heading for different age groups. When teaching heading, we emphasize proper technique (forehead contact, eyes open, attacking the ball) and build confidence gradually. We never force players to head if they're uncomfortable. If your child has any headaches or discomfort after heading, please let us know immediately.",
      homeActivities: [
        "Practice heading with very soft balls (beach balls, balloons)",
        "Work on tracking ball flight without heading",
        "Watch professional heading technique",
        "Strengthen neck muscles with appropriate exercises",
        "Build comfort with ball coming toward head gradually",
        "Never practice heading alone without proper balls",
      ],
      bestAssessedIn: [
        "Controlled heading drills",
        "Aerial duel exercises",
        "Set piece defending",
        "Game situations (crosses, long balls)",
      ],
      assessmentFrequency: "Monthly observation when age-appropriate",
      assessmentDuration: "Observe across multiple aerial situations",
    },
  },
];

export async function upgradeSoccerSkillsBatch2() {
  console.log("Upgrading soccer skills with comprehensive assessment guides (Batch 2)...");
  console.log("Skills to upgrade: 9");

  let successCount = 0;
  let errorCount = 0;

  for (const skillUpgrade of skillUpgrades) {
    try {
      const result = await getDb()
        .update(skills)
        .set({
          comprehensiveGuide: skillUpgrade.comprehensiveGuide,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, skillUpgrade.id));

      console.log(`  Updated skill: ${skillUpgrade.id}`);
      successCount++;
    } catch (error) {
      console.error(`  Error updating skill ${skillUpgrade.id}:`, error);
      errorCount++;
    }
  }

  console.log(`\nUpgrade complete!`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  return { successCount, errorCount };
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  upgradeSoccerSkillsBatch2()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Failed to upgrade skills:", error);
      process.exit(1);
    });
}

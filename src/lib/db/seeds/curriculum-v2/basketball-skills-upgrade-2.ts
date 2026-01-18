/**
 * Basketball Skills Upgrade 2 - Comprehensive Assessment Guides
 *
 * This seed file UPDATES existing basketball skills with comprehensive assessment guides.
 * Each skill is upgraded with:
 * - Detailed 5-level progression definitions (Emerging, Developing, Competent, Proficient, Advanced)
 * - Observable behaviors at each level
 * - Common mistakes and corrections
 * - Age-appropriate expectations
 * - Red flags for additional support
 * - Parent communication templates
 * - Home activities for skill development
 * - ELM framework coaching tips (Effort, Learning, Mistakes)
 *
 * Skills upgraded in this file:
 * TECHNICAL: Dribbling on the Move, Layups - Weak Hand, Pull-Up Jump Shot, Crossover Dribble (x2),
 *            Shooting Form (x2), Ball Handling (x2), Chest Pass, Layup, Pull-Up Jumper
 * TACTICAL: Give and Go, Help Defense, Spacing, Pick and Roll (Ball Handler)
 * PHYSICAL: Coordination
 * PSYCHOLOGICAL: Confidence
 *
 * Guidelines followed:
 * - Uses guiding questions (not just commands) in coaching tips
 * - Includes ELM framework language (Effort, Learning, Mistakes)
 * - Makes behaviors observable and measurable
 * - Uses age-appropriate expectations
 * - Includes holistic development connections (psychological/social)
 * - Aligned with European/American youth basketball best practices
 */

import { db } from "../../index";
import { skills } from "../../schema/curriculum";
import { eq } from "drizzle-orm";

// Skill IDs to update
const SKILL_IDS = {
  dribblingOnTheMove: "e46b7e89-bbb5-40c7-9493-4db35afac361",
  layupsWeakHand: "3355dd4e-b140-411a-a94c-8642884b0a53",
  giveAndGo: "879b49ab-95e6-4771-8a4c-0742af76bf91",
  pullUpJumpShot: "c2968515-cc69-4c92-93f8-25ad6eedfc59",
  crossoverDribbleDev: "c270d9a0-9480-4e9e-99c2-4dc70c77e81b",
  helpDefense: "77284e7c-abe6-46b0-a53d-609137505209",
  shootingFormFund1: "c67c01d9-ecd5-4e0b-8834-5c29ef8d01e4",
  shootingFormFund2: "ba118141-7d39-43ee-8d94-f55c8d4116c1",
  ballHandlingFund1: "8391932d-9fe9-4020-b663-af525174a414",
  ballHandlingFund2: "710294a1-71a5-4c34-a5ca-52685c7f77d3",
  chestPass: "d5e387e1-ee10-4436-8c40-18c7049d8735",
  layup: "ce23245f-da78-40ea-8805-61f907858829",
  crossoverDribbleSkill: "aed398c7-13bc-4e5b-8d99-5d5f32c13545",
  pullUpJumper: "d862da93-44f4-4a9a-bf45-d993e41c42a5",
  spacing: "64cbb89d-0bff-455a-bddb-560322ede769",
  pickAndRollBallHandler: "6d89cb24-dfee-4c38-8870-53fb65177e31",
  coordination: "518c7fad-81df-402c-8a02-b91e29967217",
  confidence: "71aade8f-ed5a-40c9-9a8d-2735d1fb91b8",
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE GUIDE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

const dribblingOnTheMoveGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Player struggles to maintain ball control while moving. Frequently loses the ball, stops to dribble, or watches the ball constantly while walking.",
      observableBehaviors: [
        "Ball escapes within 3-5 dribbles while moving",
        "Stops moving to regain control of dribble",
        "Eyes fixed on ball, cannot see court",
        "Uses only dominant hand",
        "Runs into obstacles or other players",
        "Cannot change direction while dribbling"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Can maintain a basic dribble while walking or jogging slowly. Control decreases significantly when speed increases or direction changes are required.",
      observableBehaviors: [
        "Maintains dribble while walking for 10+ seconds",
        "Can jog slowly with ball for short distances",
        "Glances up occasionally while moving",
        "Beginning to use weak hand in controlled settings",
        "Slows down to maintain control",
        "Can change direction if given time"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Comfortable dribbling at moderate speed with either hand. Can change direction and navigate around obstacles while maintaining reasonable control.",
      observableBehaviors: [
        "Dribbles at jogging speed with control",
        "Changes direction without losing ball",
        "Head up 50%+ of the time while moving",
        "Uses both hands depending on direction",
        "Navigates around cones/obstacles",
        "Can speed up or slow down on command"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Strong dribbling at game speed with either hand. Maintains control through traffic, changes pace effectively, and keeps head up to see the court.",
      observableBehaviors: [
        "Dribbles at full speed with control",
        "Protects ball with body while moving",
        "Head up 80%+ of time, sees teammates",
        "Changes pace to beat defenders",
        "Comfortable in traffic",
        "Both hands nearly equal"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite ball handler on the move. Can navigate any situation at any speed while maintaining complete court vision and creating opportunities for self and teammates.",
      observableBehaviors: [
        "Elite control at all speeds",
        "Full court vision while handling",
        "Creates scoring opportunities while moving",
        "Beats defenders with pace changes",
        "Ambidextrous mastery",
        "Leads fast breaks effectively"
      ]
    }
  ],
  commonMistakes: [
    "Dribbling too high while running (ball bounces away)",
    "Looking down at ball instead of up at court",
    "Using only dominant hand regardless of direction",
    "Running faster than dribble control allows",
    "Failing to protect ball from defenders",
    "Stopping forward momentum to regain control"
  ],
  coachingTips: [
    "What happens to your dribble when you try to run faster? How can you stay in control?",
    "Which hand should you use when a defender is on your right side? Why?",
    "Can you tell me how many fingers I'm holding up while you dribble down the court?",
    "When the ball gets away, that's learning! What did you notice right before you lost it?",
    "Effort on your weak hand now will make you unstoppable later. Keep pushing through the mistakes!",
    "What's one thing you can do to protect the ball from a defender while moving?"
  ],
  assessmentActivities: [
    {
      name: "Speed Dribble Relay",
      domain: "technical",
      description: "Timed dribble from baseline to baseline, focusing on control and speed balance"
    },
    {
      name: "Obstacle Course",
      domain: "technical",
      description: "Navigate through cones at increasing speeds while maintaining dribble"
    },
    {
      name: "Heads Up Challenge",
      domain: "tactical",
      description: "Coach shows numbers/colors while player dribbles full court - must identify while maintaining control"
    },
    {
      name: "Defensive Pressure Dribble",
      domain: "physical",
      description: "Dribble through light defensive pressure, assessing body positioning and protection"
    }
  ],
  redFlags: [
    "Cannot dribble while walking after 4+ weeks of practice",
    "Consistently runs into obstacles or other players",
    "Extreme frustration leading to refusal to practice",
    "No improvement in weak hand usage over extended period",
    "Physical coordination issues affecting running and dribbling combination"
  ],
  parentExplanation: "Dribbling on the move is essential for playing real basketball - players must be able to advance the ball while running and looking for teammates. We teach players to keep the ball low (knee height), use the hand away from defenders, and look up to see the court. This skill takes many hours of practice! At home, any dribbling practice helps - even dribbling while walking around the house or down the driveway builds the necessary coordination.",
  homeActivities: [
    "Dribble walks around the neighborhood (safe areas)",
    "Dribble through backyard obstacle courses",
    "Dribble while a parent calls out numbers to identify",
    "Weak hand only dribble walks",
    "Speed control practice - slow, medium, fast on command",
    "Dribble tag games with siblings or parents"
  ],
  assessmentFrequency: "Every 2-3 weeks observation, formal assessment monthly",
  assessmentGuidance: "Observe across multiple speed levels and directions. Note differences between dominant and weak hand control."
};

const layupsWeakHandGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Player cannot coordinate weak hand layup. Uses wrong footwork, wrong hand, or reverts to dominant hand at the basket.",
      observableBehaviors: [
        "Switches to dominant hand before shooting",
        "Same foot/same hand takeoff (incorrect)",
        "Ball rarely reaches rim with weak hand",
        "Looks confused about footwork",
        "No confidence approaching weak side",
        "Avoids weak hand layup attempts"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Attempting weak hand layups with developing footwork. Success rate is low but showing understanding of the technique.",
      observableBehaviors: [
        "Occasionally correct footwork",
        "Gets ball to backboard sometimes",
        "Makes 1-2 of 10 attempts",
        "Thinking through each step",
        "More willing to try weak side",
        "Can describe proper technique"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Consistent weak hand layup form with moderate success rate. Footwork is automatic and player shows confidence on weak side.",
      observableBehaviors: [
        "Correct footwork 80%+ of attempts",
        "Makes 4-5 of 10 layups",
        "Uses backboard effectively",
        "Approaches from various angles",
        "Smooth transition from dribble",
        "Growing confidence on weak side"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Strong weak hand finishing with high success rate. Can finish weak side layups under light pressure and in game situations.",
      observableBehaviors: [
        "Makes 7+ of 10 in drills",
        "Finishes under light contest",
        "Various finish options",
        "Game-speed execution",
        "Attacks weak side confidently",
        "Weak side becoming a weapon"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite weak hand finishing that mirrors dominant hand. Can score creatively from weak side under heavy pressure.",
      observableBehaviors: [
        "Equal proficiency both hands",
        "Finishes through contact",
        "Multiple creative finishes",
        "Attacks weak side by choice",
        "Defenders cannot overplay",
        "Makes difficult finishes look easy"
      ]
    }
  ],
  commonMistakes: [
    "Switching to dominant hand at last moment",
    "Using same-foot/same-hand takeoff (should be opposite)",
    "Approaching from wrong angle for weak hand",
    "No knee drive - flat jump",
    "Releasing ball too early or too late",
    "Not using backboard when appropriate"
  ],
  coachingTips: [
    "Which foot do you jump from when shooting with your left hand? (Right foot for left hand shot)",
    "What happens to your options if you can only finish with one hand? Defenders love that!",
    "Can you drive your opposite knee up high like a marching soldier?",
    "Mistakes on your weak hand are expected - that's exactly how you develop it!",
    "Every weak hand attempt makes you a better player, even the misses. Keep the effort high!",
    "Where on the backboard should you aim from this angle?"
  ],
  assessmentActivities: [
    {
      name: "Mikan Drill Weak Side",
      domain: "technical",
      description: "Continuous weak hand layups from both sides of basket, counting makes in 60 seconds"
    },
    {
      name: "Full Court Weak Hand Finish",
      domain: "technical",
      description: "Dribble full court with weak hand, finish with weak hand layup"
    },
    {
      name: "Read and Finish",
      domain: "tactical",
      description: "Coach indicates which side to finish - player must use appropriate hand"
    },
    {
      name: "Contested Weak Side Layup",
      domain: "physical",
      description: "Finish weak hand layup with passive defender present"
    }
  ],
  redFlags: [
    "Complete avoidance of weak side approaches after extended practice",
    "Persistent same-foot/same-hand pattern despite correction",
    "No improvement in makes after 6+ weeks of focused practice",
    "Frustration leading to refusal to attempt weak hand",
    "Physical limitation preventing opposite foot takeoff"
  ],
  parentExplanation: "Weak hand layups are crucial because defenders will try to force your child to their weak side. If they can only finish with one hand, opponents will take that away! We teach opposite foot takeoff (left hand = right foot jump) which feels awkward at first but becomes natural. At home, encourage any weak hand practice - even bouncing a ball with their non-dominant hand builds coordination. Be patient - this skill takes time but is incredibly valuable.",
  homeActivities: [
    "Weak hand ball bouncing and catching games",
    "Footwork practice without ball (step-step-jump pattern)",
    "Mini hoop weak hand layups",
    "Mikan drill on lowered hoop",
    "Watch NBA players finish with both hands",
    "Brush teeth, eat with non-dominant hand (builds general coordination)"
  ],
  assessmentFrequency: "Weekly observation during drills, formal assessment bi-weekly",
  assessmentGuidance: "Compare weak hand success rate to dominant hand. Look for footwork consistency and willingness to attempt weak side."
};

const giveAndGoGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Player does not understand give and go concept. Stands still after passing or runs away from the ball instead of toward the basket.",
      observableBehaviors: [
        "Passes and stands watching",
        "No cut after the pass",
        "Runs to wrong location",
        "Cannot time the cut",
        "Doesn't expect return pass",
        "Unaware of defender position"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Beginning to understand pass-and-cut concept. Attempts to cut after passing but timing and execution are inconsistent.",
      observableBehaviors: [
        "Attempts cut after passing",
        "Timing is off - too early or late",
        "Cut direction sometimes wrong",
        "Sometimes ready for return pass",
        "Beginning to read defender",
        "Needs reminders to cut"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Executes basic give and go with proper timing. Reads defender position and makes appropriate cuts.",
      observableBehaviors: [
        "Cuts immediately after passing",
        "Proper cut direction most of time",
        "Ready hands for return pass",
        "Reads defender's overplay",
        "Finishes when receiving pass",
        "Beginning to sell the cut"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Effective give and go player who creates scoring opportunities. Uses fakes, reads defense well, and finishes consistently.",
      observableBehaviors: [
        "Uses pass fakes before giving",
        "Explosive cut after pass",
        "Reads multiple defenders",
        "Finishes in traffic",
        "Creates for self and teammates",
        "Communicates with passer"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite give and go execution that creates easy baskets. Masters timing, reads the entire defense, and makes the right decision every time.",
      observableBehaviors: [
        "Perfect timing on cuts",
        "Manipulates defenders with fakes",
        "Reads help defense",
        "Finishes creatively",
        "Creates easy baskets for team",
        "Teaches teammates the action"
      ]
    }
  ],
  commonMistakes: [
    "Standing and watching after making the pass",
    "Cutting before the pass is caught (too early)",
    "Cutting away from the basket instead of toward it",
    "Not having hands ready for return pass",
    "Running the same predictable cut every time",
    "Not reading the defender before deciding cut direction"
  ],
  coachingTips: [
    "What should happen immediately after you pass the ball? (Cut to basket!)",
    "Where is your defender looking right now - at you or the ball? What opportunity does that create?",
    "Can you show me 'give' with a fake before you actually pass?",
    "When the timing wasn't right, what information did that give you for next time?",
    "Great effort on that cut! Even when you don't get the ball, you're creating space for teammates",
    "What tells you to cut backdoor versus straight to the basket?"
  ],
  assessmentActivities: [
    {
      name: "Partner Give and Go",
      domain: "technical",
      description: "Basic give and go with partner, counting successful completions and finishes"
    },
    {
      name: "Read the Defender",
      domain: "tactical",
      description: "Defender plays different positions - cutter must read and adjust cut direction"
    },
    {
      name: "3v3 Give and Go Emphasis",
      domain: "tactical",
      description: "Small-sided game where give and go baskets count double"
    },
    {
      name: "Timed Cutting Drill",
      domain: "physical",
      description: "Continuous give and go cuts for conditioning - tests explosiveness after multiple reps"
    }
  ],
  redFlags: [
    "Cannot understand pass-then-cut sequence after multiple explanations",
    "Persistent standing after passing despite reminders",
    "Unable to time cut with partner's catch",
    "No improvement in cut direction reading over 4+ weeks",
    "Physical inability to make explosive cut"
  ],
  parentExplanation: "Give and go is one of basketball's oldest and most effective plays - pass the ball and immediately cut toward the basket for a return pass. It works because defenders often watch the ball, not their player, creating an easy scoring opportunity. We teach players to pass, cut hard, have hands ready, and finish. At home, watch basketball together and spot give and go plays - they happen all the time once you know what to look for!",
  homeActivities: [
    "Watch games and identify give and go plays",
    "Practice passing and cutting with a parent or sibling",
    "Shadow cutting footwork without ball",
    "Discuss 'what would you do next?' during game watching",
    "Explosive start practice from standing position",
    "Hand-eye coordination games for catching on the move"
  ],
  assessmentFrequency: "Every scrimmage observation, formal assessment monthly",
  assessmentGuidance: "Observe both the timing of cuts and the decision-making about cut direction. Note finishing success when pass is received."
};

const pullUpJumpShotGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Cannot transition from dribble to jump shot. Stops completely, travels, or throws ball without proper shooting form.",
      observableBehaviors: [
        "Travels when attempting to stop",
        "Cannot gather the ball properly",
        "Off-balance on jump",
        "Shot form breaks down completely",
        "Ball rarely reaches rim",
        "Avoids pull-up attempts"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Beginning to coordinate stop and shot. Footwork is developing but shot consistency and balance are limited.",
      observableBehaviors: [
        "Sometimes stops legally",
        "Gathers ball with control occasionally",
        "Balance improving on jump",
        "Some shots reach rim",
        "Better from dominant side",
        "Attempts more frequently"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Executes pull-up with proper footwork and reasonable form. Can make open pull-ups from mid-range.",
      observableBehaviors: [
        "Legal footwork consistently",
        "Proper gather and jump",
        "Balanced at release",
        "Makes 30-40% from mid-range",
        "Uses from either direction",
        "Shot form mostly maintained"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Effective pull-up jump shot from various distances and angles. Can create and make this shot against defenders.",
      observableBehaviors: [
        "Makes 40-50% from mid-range",
        "Quick release",
        "Effective against closeouts",
        "Uses off screens and drives",
        "Good shot selection",
        "Creates separation"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite pull-up shooter who can score from anywhere on the court. Creates own shot consistently against tight defense.",
      observableBehaviors: [
        "Makes 50%+ from mid-range",
        "Unguardable release",
        "Range extends to three-point",
        "Scores against any defense",
        "Go-to scorer for team",
        "Clutch in big moments"
      ]
    }
  ],
  commonMistakes: [
    "Traveling during the gather and stop",
    "Leaning forward or backward during shot",
    "Rushing the shot without proper balance",
    "Jumping too far forward instead of straight up",
    "Losing shot form due to defender pressure",
    "Attempting from too far before ready"
  ],
  coachingTips: [
    "What does your body feel like when you stop - are you balanced or falling?",
    "Can you show me how to gather the ball while your last dribble is happening?",
    "Where should your momentum go - forward toward defender or straight up?",
    "That attempt wasn't balanced - what can you adjust? That's learning!",
    "The effort to develop this shot will make you very hard to guard. Keep working!",
    "What tells you it's time to pull up versus continue driving?"
  ],
  assessmentActivities: [
    {
      name: "Cone Pull-Up Drill",
      domain: "technical",
      description: "Dribble to cone, pull up and shoot - count makes of 10 from various spots"
    },
    {
      name: "Closeout Pull-Up",
      domain: "tactical",
      description: "Defender closes out, player reads and pulls up or drives based on closeout"
    },
    {
      name: "Off-Screen Pull-Up",
      domain: "tactical",
      description: "Come off screen, catch and pull up in one motion"
    },
    {
      name: "Fatigue Pull-Up Test",
      domain: "physical",
      description: "Pull-up attempts after conditioning - tests form maintenance when tired"
    }
  ],
  redFlags: [
    "Cannot stop without traveling after extended practice",
    "Persistent balance issues despite footwork corrections",
    "Shot form completely different from stationary form",
    "No improvement in accuracy over 6+ weeks",
    "Fear of attempting pull-up with defender present"
  ],
  parentExplanation: "The pull-up jump shot is when a player dribbles, stops quickly, and shoots - it's a crucial weapon because defenders can't easily block it. We teach proper footwork (1-2 step or jump stop), gathering the ball during the stop, and shooting with the same form as a set shot. This is an advanced skill that requires mastering dribbling and shooting separately first. At home, your child can practice the footwork and gather without a basket.",
  homeActivities: [
    "Footwork practice - dribble and stop without shooting",
    "Stationary form shooting to maintain mechanics",
    "Watch elite players' pull-up technique in slow motion",
    "Balance board or single leg exercises",
    "Shadow dribble-stop-shoot motion",
    "Practice on lowered or mini hoop if available"
  ],
  assessmentFrequency: "Weekly observation during shooting drills, formal assessment monthly",
  assessmentGuidance: "Assess footwork legality, balance at release, and shot form maintenance separately before evaluating makes."
};

const crossoverDribbleGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Cannot execute basic crossover. Ball bounces too high, goes out of control, or player loses ball attempting the move.",
      observableBehaviors: [
        "Ball bounces away on crossover attempt",
        "Crossover too high (easy to steal)",
        "Loses balance during move",
        "Ball goes wrong direction",
        "No change of pace",
        "Avoids crossover attempts"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Can perform stationary crossover with some control. Move is slow and telegraphed but ball stays with player.",
      observableBehaviors: [
        "Completes stationary crossover",
        "Ball control improving",
        "Still looks at ball during move",
        "Move is slow/predictable",
        "Some success when stationary",
        "Struggles with crossover while moving"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Executes crossover with control while moving. Uses move to change direction effectively in drills.",
      observableBehaviors: [
        "Crossover while moving",
        "Ball stays low and protected",
        "Head up more during move",
        "Changes direction effectively",
        "Uses in breakdown drills",
        "Beginning to sell the move"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Quick, deceptive crossover that beats defenders. Uses pace change and sets up crossover with hesitation.",
      observableBehaviors: [
        "Beats defenders with crossover",
        "Quick change of direction",
        "Sets up with hesitation",
        "Uses in games effectively",
        "Protects ball during move",
        "Creates driving lanes"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite crossover that breaks down defenders consistently. Uses multiple setups, speeds, and combinations.",
      observableBehaviors: [
        "Elite quickness and deception",
        "Multiple crossover variations",
        "Creates at will against any defender",
        "Combines with other moves",
        "Signature move repertoire",
        "Unguardable in isolation"
      ]
    }
  ],
  commonMistakes: [
    "Crossing ball too high (should be below knee)",
    "No change of pace before crossover",
    "Telegraphing the move (defender knows it's coming)",
    "Eyes on ball during crossover",
    "Not selling the initial direction",
    "Losing balance or momentum during move"
  ],
  coachingTips: [
    "How low can you keep the ball during your crossover? Lower = harder to steal!",
    "What can you do to make the defender think you're going the other direction first?",
    "Can you do the crossover without looking at the ball? What do you see?",
    "That crossover was stolen - what made it easy for the defender? Learning moment!",
    "Keep pushing your speed on the crossover. Mistakes mean you're challenging yourself!",
    "What happens if you hesitate right before the crossover? Try it!"
  ],
  assessmentActivities: [
    {
      name: "Stationary Crossover Speed Test",
      domain: "technical",
      description: "Count controlled crossovers in 30 seconds while maintaining good form"
    },
    {
      name: "Full Court Crossover",
      domain: "technical",
      description: "Dribble full court using crossover at each cone, timed with quality check"
    },
    {
      name: "1v1 Crossover Attack",
      domain: "tactical",
      description: "Use crossover to beat defender in live 1v1 situation"
    },
    {
      name: "Reaction Crossover",
      domain: "physical",
      description: "Coach points direction, player crosses over opposite way - tests reaction speed"
    }
  ],
  redFlags: [
    "Cannot execute stationary crossover after multiple weeks of practice",
    "Persistent high dribble despite correction",
    "No improvement in speed of move over 4+ weeks",
    "Balance issues affecting all lateral movements",
    "Frustration leading to avoidance of move"
  ],
  parentExplanation: "The crossover dribble is a fundamental move where the player quickly bounces the ball from one hand to the other to change direction and beat a defender. We teach players to keep the ball low (knee height or below), sell the initial direction to freeze the defender, then cross quickly. At home, any crossover practice helps - between the legs of a chair, around cones, or just stationary in the driveway. The key is thousands of repetitions!",
  homeActivities: [
    "Stationary crossover practice (100 reps daily goal)",
    "Crossover around cones or household objects",
    "Watch favorite players' crossover in slow motion",
    "Crossover while walking, then jogging",
    "Two-ball dribbling for advanced challenge",
    "Crossover games with family members"
  ],
  assessmentFrequency: "Every 2-3 weeks observation, formal assessment monthly",
  assessmentGuidance: "Observe ball height, speed of execution, and head position. Compare stationary versus moving crossover success."
};

const helpDefenseGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Player only guards their assigned player. No awareness of teammates' defensive situations or when help is needed.",
      observableBehaviors: [
        "Watches only their player",
        "No help when teammate beaten",
        "Doesn't see ball when guarding",
        "Out of position to help",
        "No communication on defense",
        "Surprised when asked to help"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Beginning to understand help concept. Will help when reminded but positioning and timing are inconsistent.",
      observableBehaviors: [
        "Helps when coach calls for it",
        "Starting to see ball and player",
        "Help positioning developing",
        "Sometimes rotates correctly",
        "Beginning to communicate",
        "Returns to player late"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Understands and executes basic help defense. Positions in correct spots and rotates when drives occur.",
      observableBehaviors: [
        "Proper help side position",
        "Rotates on drives correctly",
        "Sees ball and player",
        "Communicates 'help' calls",
        "Recovers to own player",
        "Contests shots in paint"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Strong help defender who reads plays before they happen. Disrupts offense with active help and recovery.",
      observableBehaviors: [
        "Anticipates drives before they happen",
        "Excellent help positioning",
        "Quick rotations",
        "Draws charges occasionally",
        "Leads defensive communication",
        "Helps and recovers quickly"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite help defender who anchors team defense. Reads entire offense, helps teammates, and recovers without giving up easy baskets.",
      observableBehaviors: [
        "Quarterback of team defense",
        "Helps without giving up corner 3s",
        "Multiple rotations per possession",
        "Consistent charge drawing",
        "Makes teammates better defenders",
        "Creates steals from help position"
      ]
    }
  ],
  commonMistakes: [
    "Ball-watching without maintaining player awareness",
    "Helping too late when drive is already at the rim",
    "Leaving corner shooter to help unnecessarily",
    "Not recovering to own player after helping",
    "Helping from wrong position (too far away)",
    "Not communicating help to teammates"
  ],
  coachingTips: [
    "Where should you be standing when your teammate is guarding the ball? (One pass away = deny, two passes away = help position)",
    "Can you see both the ball and your player right now? Show me your vision",
    "When your teammate gets beat, what should you do? What happens to your player?",
    "That time you didn't help - what information would have helped you know to help?",
    "Great help! Even though they scored, your effort disrupted the play. That's team defense!",
    "What do you yell to tell your teammates you're helping?"
  ],
  assessmentActivities: [
    {
      name: "Shell Drill Positioning",
      domain: "tactical",
      description: "4v4 shell drill observing help side positioning as ball moves"
    },
    {
      name: "Drive and Help",
      domain: "tactical",
      description: "Offense attacks, helper must stop the ball and recover - count successful rotations"
    },
    {
      name: "Communication Check",
      domain: "psychological",
      description: "Count verbal defensive calls during scrimmage play"
    },
    {
      name: "Closeout and Recover",
      domain: "physical",
      description: "Sprint from help to closeout, tests conditioning and footwork"
    }
  ],
  redFlags: [
    "Cannot understand see ball/see player concept after multiple explanations",
    "Never helps teammates despite repeated instruction",
    "Cannot physically get to help position in time",
    "Consistently in wrong position despite practice",
    "Refuses to communicate on defense"
  ],
  parentExplanation: "Help defense means being ready to stop an opponent who beats your teammate while still being aware of your own player. We teach 'see ball, see player' - one foot to ball, one foot to player, so you can react to both. It's like being a lifeguard watching the whole pool, not just one swimmer! At home, watch basketball and notice how defenders position themselves away from the ball - they're in help position, ready to stop drives to the basket.",
  homeActivities: [
    "Watch games and identify help defense",
    "Discuss 'what would you do?' scenarios",
    "Practice defensive stance with vision training",
    "Study NBA help defense in slow motion",
    "Defensive slide races for conditioning",
    "Talk through help responsibilities for each position"
  ],
  assessmentFrequency: "Every scrimmage observation, formal assessment bi-weekly",
  assessmentGuidance: "Observe positioning when ball is two passes away, rotation timing on drives, and recovery to own player."
};

const shootingFormGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Player throws ball at basket without consistent form. Two-handed push, no arc, minimal control over where ball goes.",
      observableBehaviors: [
        "Two-handed push shot",
        "No consistent stance",
        "Ball has no arc",
        "Eyes not on target",
        "No follow-through",
        "Misses by significant margin"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Developing one-hand shooting motion. Some BEEF elements present but inconsistent. Makes occasional close shots.",
      observableBehaviors: [
        "Attempting one-hand release",
        "Some follow-through visible",
        "Ball has some arc sometimes",
        "Makes 2-3 of 10 close range",
        "Can describe proper form",
        "Guide hand improving"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Proper BEEF form (Balance, Eyes, Elbow, Follow-through) is consistent. Good arc and 40%+ from close range.",
      observableBehaviors: [
        "BEEF components present",
        "Good arc consistently",
        "Makes 4+ of 10 close range",
        "Follow-through automatic",
        "Balance maintained",
        "Backspin on ball"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Smooth, consistent form from various distances. High percentage from mid-range. Form maintained under pressure.",
      observableBehaviors: [
        "Consistent form all distances",
        "Makes 50%+ mid-range",
        "Good shot selection",
        "Form holds under pressure",
        "Quick release",
        "Confident shooter"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Textbook shooting form with high percentage. Maintains form in all situations. Team's reliable scorer.",
      observableBehaviors: [
        "Near-perfect form every shot",
        "High percentage shooter",
        "Clutch in big moments",
        "Creates own shot",
        "Form never breaks",
        "Model for teammates"
      ]
    }
  ],
  commonMistakes: [
    "Two-handed push instead of one-hand release",
    "Shooting elbow out to side (chicken wing)",
    "No follow-through - shot stops at release",
    "Flat trajectory without arc",
    "Guide hand influencing shot direction",
    "Looking at defender instead of rim"
  ],
  coachingTips: [
    "Can you show me 'cookie jar' follow-through? Reach up and in like grabbing a cookie!",
    "Where is your elbow pointing right now - at the basket or out to the side?",
    "What does BEEF stand for? Let's check each part of your shot",
    "That shot missed left - what might your guide hand have done? That's good information!",
    "Shooting takes thousands of reps. Every practice shot is building your muscle memory!",
    "Hold your follow-through and show me - is your hand in the cookie jar?"
  ],
  assessmentActivities: [
    {
      name: "Form Shooting Close Range",
      domain: "technical",
      description: "10 shots from 5 feet - assess form on each shot and count makes"
    },
    {
      name: "BEEF Checklist",
      domain: "technical",
      description: "Demonstrate and explain each BEEF component properly"
    },
    {
      name: "Catch and Shoot",
      domain: "tactical",
      description: "Receive pass and shoot in game-like rhythm - assess form maintenance"
    },
    {
      name: "Fatigue Shooting Test",
      domain: "physical",
      description: "Form shooting after conditioning - tests form maintenance when tired"
    }
  ],
  redFlags: [
    "Persistent two-handed push after extended form work",
    "No improvement in arc after 6+ weeks",
    "Physical limitations preventing proper arm position",
    "Extreme frustration preventing willingness to practice",
    "Fear of shooting that wasn't present before"
  ],
  parentExplanation: "Shooting form is about building proper mechanics - BEEF stands for Balance, Eyes on target, Elbow under ball, Follow-through. This takes thousands of repetitions to develop into muscle memory. At home, focus praise on effort and form, not whether shots go in. A great follow-through with a miss is better than a made shot with poor form! Use lower baskets for young players to develop proper mechanics without straining.",
  homeActivities: [
    "Lying down shooting - shoot straight up and catch",
    "Form shooting on mini or lowered hoop",
    "Self-pass and shoot drill",
    "Watch favorite players' form in slow motion",
    "Count makes from favorite spot (track progress)",
    "Wall shooting for follow-through practice"
  ],
  assessmentFrequency: "Weekly observation during shooting drills, formal assessment monthly",
  assessmentGuidance: "Prioritize form evaluation over make percentage. Observe across multiple shots and distances."
};

const ballHandlingGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Loses ball frequently. Palm-dribbles with poor control. Cannot maintain dribble for extended period.",
      observableBehaviors: [
        "Ball escapes within 5-10 dribbles",
        "Uses palm instead of fingertips",
        "Eyes fixed on ball",
        "Stands upright while dribbling",
        "Only attempts dominant hand",
        "Appears frustrated with ball"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Can maintain basic stationary dribble with dominant hand. Fingertip control developing but inconsistent.",
      observableBehaviors: [
        "20+ dribbles with dominant hand",
        "Beginning fingertip control",
        "Glances up occasionally",
        "Some rhythm developing",
        "Weak hand inconsistent",
        "More relaxed with ball"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Confident with both hands stationary. Uses fingertips consistently and can look up while dribbling.",
      observableBehaviors: [
        "Both hands 30+ dribbles",
        "Fingertip control consistent",
        "Head up 50%+ of time",
        "Can answer questions while dribbling",
        "Attempts crossovers",
        "Shows confidence"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Excellent control with both hands. Performs multiple moves and maintains court vision.",
      observableBehaviors: [
        "Both hands nearly equal",
        "Multiple moves executed",
        "Head up 80%+ of time",
        "Reads and reacts while handling",
        "Smooth move transitions",
        "Creative and confident"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite ball handler with creative, ambidextrous control. Can perform any move while maintaining full awareness.",
      observableBehaviors: [
        "Ambidextrous mastery",
        "Creates unique combinations",
        "Full court vision",
        "Game-speed execution",
        "Ball is extension of hand",
        "Leads handling drills"
      ]
    }
  ],
  commonMistakes: [
    "Slapping ball with palm instead of fingertips",
    "Dribbling too high (above waist)",
    "Looking down at ball constantly",
    "Standing upright without athletic bend",
    "Using only dominant hand",
    "No rhythm or timing to dribbles"
  ],
  coachingTips: [
    "What part of your hand is touching the ball - palm or fingertips?",
    "Can you feel the ball with fingertips like playing piano?",
    "How low can you keep the dribble while staying in control?",
    "What do you see when you look up? Tell me what's happening around you!",
    "Mistakes mean you're challenging yourself. What did you notice when the ball got away?",
    "Your weak hand needs extra love - every attempt builds skill!"
  ],
  assessmentActivities: [
    {
      name: "Consecutive Dribble Count",
      domain: "technical",
      description: "Count consecutive stationary dribbles with each hand before losing control"
    },
    {
      name: "Fingertip Control Check",
      domain: "technical",
      description: "Demonstrate spread fingers on ball and push with fingertips"
    },
    {
      name: "Heads Up Challenge",
      domain: "tactical",
      description: "Identify numbers/colors coach shows while dribbling"
    },
    {
      name: "Ball Handling Sequence",
      domain: "physical",
      description: "Complete handling routine (crossover, between legs, behind back) for time"
    }
  ],
  redFlags: [
    "No improvement in consecutive dribbles after 4+ weeks",
    "Persistent palm-hitting despite consistent coaching",
    "Extreme frustration affecting willingness to practice",
    "Physical coordination issues affecting multiple motor skills",
    "Complete avoidance of ball handling activities"
  ],
  parentExplanation: "Ball handling is the foundation for all basketball dribbling. We focus on 'fingertip control' - using spread fingers rather than the palm to push and guide the ball. This takes thousands of touches to develop! At home, any time with a ball in their hands helps - dribbling while watching TV, bouncing in the driveway, or just carrying a ball around. The key is lots of touches!",
  homeActivities: [
    "Dribble while watching TV (commercial break challenges)",
    "Two-ball dribbling for advanced challenge",
    "Dribble on different surfaces (grass is harder!)",
    "Fingertip push-ups on the basketball",
    "Count dribbles in 30 seconds each hand",
    "Ball squeeze exercises for hand strength"
  ],
  assessmentFrequency: "Every 2-3 weeks observation, formal assessment monthly",
  assessmentGuidance: "Compare dominant and weak hand control. Note fingertip usage and head position."
};

const chestPassGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Pass lacks power and direction. Incorrect hand position and ball floats or bounces unpredictably.",
      observableBehaviors: [
        "Ball held incorrectly",
        "No stepping motion",
        "Ball bounces multiple times or floats",
        "Misses target significantly",
        "Receiver struggles to catch",
        "Little to no follow-through"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Can make short chest passes to stationary target. Form developing but inconsistent.",
      observableBehaviors: [
        "5-6 of 10 passes catchable at short range",
        "Beginning to step toward target",
        "Thumbs-down follow-through sometimes",
        "Passes not always at chest height",
        "Can describe technique",
        "Better with familiar partners"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Accurate chest passes at medium distance. Proper thumbs-down follow-through and can hit moving target.",
      observableBehaviors: [
        "8+ of 10 passes accurate at 15 feet",
        "Consistent thumbs-down",
        "Leads moving receivers",
        "Pass speed matches situation",
        "Completes passes in drills",
        "Adjusts to different receivers"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Crisp, accurate passes in game situations. Good vision and decision-making.",
      observableBehaviors: [
        "Accurate in games",
        "Good pass fakes",
        "Reads defenders",
        "Consistent under pressure",
        "Creates passing angles",
        "Supports teammates' positioning"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite passer with exceptional vision. Creates scoring opportunities for teammates.",
      observableBehaviors: [
        "Sees passing lanes others miss",
        "Perfect weight on every pass",
        "Creates easy baskets",
        "Rarely turns ball over",
        "Leads team in assists",
        "Teammates want to play with them"
      ]
    }
  ],
  commonMistakes: [
    "Holding ball too high or too low to start",
    "Pushing with palms instead of fingers",
    "No step toward target",
    "Thumbs up instead of down on release",
    "Passing behind or at feet of moving teammate",
    "Ball arrives at receiver's feet or over head"
  ],
  coachingTips: [
    "Where should the ball be when you start - can you show me chest level?",
    "What direction do your thumbs point when you finish the pass?",
    "Where is your teammate going to be, not where they are now?",
    "Every pass is a chance to help a teammate. What makes an easy catch?",
    "If the pass wasn't perfect, what would you try differently? That's learning!",
    "Step toward your target like you're stepping to say hello!"
  ],
  assessmentActivities: [
    {
      name: "Partner Passing Accuracy",
      domain: "technical",
      description: "10 passes at 15 feet - count catches at chest height"
    },
    {
      name: "Wall Target Passing",
      domain: "technical",
      description: "Hit marked target on wall repeatedly from 10 feet"
    },
    {
      name: "Moving Target Passing",
      domain: "tactical",
      description: "Pass to partner running across - lead appropriately"
    },
    {
      name: "Passing Under Pressure",
      domain: "psychological",
      description: "Complete passes with passive defender contesting"
    }
  ],
  redFlags: [
    "Cannot complete pass to stationary partner at 6 feet after multiple sessions",
    "Persistent incorrect grip despite repeated instruction",
    "Fear of having ball thrown to them",
    "Significant arm weakness affecting all throwing",
    "Frustration preventing continued effort"
  ],
  parentExplanation: "The chest pass is basketball's fundamental pass - it's how players share the ball effectively. We teach 'step and push' with thumbs ending down. Passing is about teamwork and communication. At home, playing catch with any ball develops passing skills. Ask your child to show you the 'thumbs down' follow-through - they love teaching what they've learned!",
  homeActivities: [
    "Wall passing practice (ball returns to chest height)",
    "Partner passing in driveway (count catches)",
    "Pass to targets on wall",
    "Play catch while discussing practice",
    "Watch basketball and notice passing",
    "Pass and move games with family"
  ],
  assessmentFrequency: "Every 2-3 weeks observation, formal assessment monthly",
  assessmentGuidance: "Observe grip, step, and follow-through mechanics. Note accuracy to stationary and moving targets."
};

const layupGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Cannot coordinate running, jumping, and shooting. Wrong foot/hand combination, ball rarely reaches rim.",
      observableBehaviors: [
        "Same foot/same hand takeoff",
        "Throws ball at basket",
        "No clear footwork pattern",
        "Jumps from wrong foot",
        "Ball rarely reaches rim",
        "Looks confused"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Developing footwork with occasional correct takeoff. Makes some layups from close range.",
      observableBehaviors: [
        "Sometimes correct footwork",
        "Gets ball to backboard",
        "Makes 2-3 of 10",
        "Slowing down appropriately",
        "Using backboard",
        "Can describe footwork"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Consistent footwork and technique. Uses backboard effectively, makes 50%+ from short approach.",
      observableBehaviors: [
        "Footwork automatic",
        "Effective backboard use",
        "Makes 5+ of 10",
        "Good touch and control",
        "Various approach angles",
        "Confident at rim"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Smooth layups from various angles. Good finish touch even with defense present.",
      observableBehaviors: [
        "Makes 7+ of 10 in drills",
        "Finishes with either hand",
        "Adapts to defense",
        "Good body control",
        "Multiple finish types",
        "Confident under pressure"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite finisher making layups through contact. Creative finishes, truly ambidextrous.",
      observableBehaviors: [
        "Makes contested layups",
        "Multiple creative finishes",
        "Both hands equal",
        "Adjusts mid-air",
        "Elite body control",
        "Difficult finishes look easy"
      ]
    }
  ],
  commonMistakes: [
    "Same foot/same hand takeoff (should be opposite)",
    "Running too fast, out of control",
    "Shooting directly at rim instead of using backboard",
    "No knee drive - flat jump",
    "Releasing ball too early or too late",
    "Not looking at target"
  ],
  coachingTips: [
    "Which foot should you jump from with your right hand? (Left foot!)",
    "Can you drive your knee up like marching in a parade?",
    "Where on the backboard are you aiming - can you show me?",
    "When you missed, was it too hard or too soft? What can you adjust?",
    "The footwork feels awkward at first - that's normal! Keep practicing!",
    "Great effort on the footwork! Even though it missed, the steps were right"
  ],
  assessmentActivities: [
    {
      name: "Standing Layup Drill",
      domain: "technical",
      description: "Layups from standing position close to basket - count makes of 10"
    },
    {
      name: "Two-Step Layup",
      domain: "technical",
      description: "Take two steps and layup - assess footwork correctness"
    },
    {
      name: "Dribble to Layup",
      domain: "tactical",
      description: "Dribble from three-point line and finish with layup"
    },
    {
      name: "Transition Layup",
      domain: "physical",
      description: "Sprint full court and finish with layup - tests coordination at speed"
    }
  ],
  redFlags: [
    "Cannot identify correct takeoff foot after multiple explanations",
    "Persistent same-foot/same-hand despite consistent practice",
    "Fear of going to basket",
    "No footwork improvement over 6+ weeks",
    "Coordination issues affecting running and jumping"
  ],
  parentExplanation: "Layups require coordinating running, jumping, and shooting - it's complex! We teach 'opposite foot, opposite hand' - right hand shot means left foot takeoff. This is counterintuitive at first but becomes natural with practice. Using the backboard increases accuracy. At home, practice footwork without a ball, then add the ball. Patience is key - this skill clicks after lots of practice!",
  homeActivities: [
    "Footwork practice without ball (step-step-jump)",
    "Layups on lowered hoop or playground basket",
    "Knee drive practice against wall",
    "Watch NBA layups in slow motion",
    "Mikan drill on low hoop",
    "Practice from different angles"
  ],
  assessmentFrequency: "Weekly observation during drills, formal assessment monthly",
  assessmentGuidance: "Assess footwork legality first, then finish touch. Compare dominant and weak side."
};

const pullUpJumperGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Cannot stop from dribble into jump shot. Travels, loses balance, or has no shooting form.",
      observableBehaviors: [
        "Travels on stop",
        "Cannot gather ball properly",
        "Off-balance on jump",
        "Form breaks down",
        "Ball rarely reaches rim",
        "Avoids attempting"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Beginning to coordinate stop and shot. Footwork developing, shot consistency limited.",
      observableBehaviors: [
        "Sometimes legal footwork",
        "Gathers with control occasionally",
        "Balance improving",
        "Some shots reach rim",
        "Better from one side",
        "Attempts more often"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Proper footwork and reasonable form. Makes open pull-ups from mid-range.",
      observableBehaviors: [
        "Legal footwork consistently",
        "Proper gather and jump",
        "Balanced at release",
        "Makes 30-40% mid-range",
        "Uses from either side",
        "Form mostly maintained"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Effective pull-up from various spots. Creates this shot against defenders.",
      observableBehaviors: [
        "Makes 40-50% mid-range",
        "Quick release",
        "Effective against closeouts",
        "Uses off screens",
        "Good shot selection",
        "Creates separation"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite pull-up shooter. Scores from anywhere against any defense.",
      observableBehaviors: [
        "Makes 50%+ mid-range",
        "Unguardable release",
        "Range to three-point",
        "Scores against anyone",
        "Go-to scorer",
        "Clutch shooter"
      ]
    }
  ],
  commonMistakes: [
    "Traveling during gather and stop",
    "Leaning forward or backward",
    "Rushing without proper balance",
    "Jumping forward instead of straight up",
    "Form breaks under pressure",
    "Attempting from too far before ready"
  ],
  coachingTips: [
    "What does your body feel like when you stop - balanced or falling?",
    "Show me how to gather the ball during your last dribble",
    "Where should your momentum go - forward or straight up?",
    "That wasn't balanced - what can you adjust? Great learning moment!",
    "Developing this shot will make you very hard to guard. Keep at it!",
    "When do you pull up versus continue to the basket?"
  ],
  assessmentActivities: [
    {
      name: "Pull-Up from Cones",
      domain: "technical",
      description: "Dribble to cone, pull up - count makes from various spots"
    },
    {
      name: "Closeout Read",
      domain: "tactical",
      description: "Defender closes out, player reads to pull up or drive"
    },
    {
      name: "Off-Screen Pull-Up",
      domain: "tactical",
      description: "Come off screen into pull-up motion"
    },
    {
      name: "Tired Pull-Up Test",
      domain: "physical",
      description: "Pull-up attempts after conditioning to test form"
    }
  ],
  redFlags: [
    "Cannot stop without traveling after extended practice",
    "Persistent balance issues despite correction",
    "Form completely different from set shot",
    "No accuracy improvement over 6+ weeks",
    "Fear of attempting with defender"
  ],
  parentExplanation: "The pull-up jumper is stopping from a dribble to shoot - crucial because defenders can't block it easily. We teach proper footwork, gathering the ball while stopping, and shooting with the same form as a set shot. At home, your child can practice the footwork and stop without a basket. This is advanced - mastering dribbling and shooting separately comes first!",
  homeActivities: [
    "Footwork - dribble and stop without shooting",
    "Stationary shooting to maintain form",
    "Watch elite players' technique",
    "Balance exercises",
    "Shadow dribble-stop-shoot",
    "Mini hoop pull-up practice"
  ],
  assessmentFrequency: "Weekly observation, formal assessment monthly",
  assessmentGuidance: "Assess footwork, balance, and form separately before evaluating makes."
};

const spacingGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Clusters with ball and teammates. No awareness of court space, follows ball like a magnet.",
      observableBehaviors: [
        "Follows ball constantly",
        "Stands next to ball handler",
        "Groups with other players",
        "No awareness of open space",
        "Doesn't move without ball",
        "Ends up on top of teammates"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Beginning to understand spacing. Can space when reminded but drifts back to ball.",
      observableBehaviors: [
        "Understands concept when explained",
        "Maintains space when reminded",
        "Drifts toward ball over time",
        "Can identify crowded areas",
        "Starting to notice open space",
        "Needs regular reminders"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Maintains appropriate spacing in drills. Understands 12-15 foot rule, self-corrects.",
      observableBehaviors: [
        "Maintains spacing in drills",
        "Self-corrects when too close",
        "Moves when ball moves",
        "Finds open areas",
        "Creates passing lanes",
        "Understands purpose"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Good court awareness, finds space consistently. Creates offensive opportunities.",
      observableBehaviors: [
        "Consistent game spacing",
        "Reads and reacts to defense",
        "Creates advantages through position",
        "Helps teammates space",
        "Adjusts to situations",
        "Rarely bunches up"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite spacing intelligence. Creates advantages for self and teammates through positioning.",
      observableBehaviors: [
        "Elite court vision",
        "Manipulates defense with position",
        "Creates opportunities constantly",
        "Perfect spacing instincts",
        "Leads team in this area",
        "Coaches others during play"
      ]
    }
  ],
  commonMistakes: [
    "Standing next to ball handler (ball watching)",
    "Clustering in same area as teammates",
    "Not moving when ball moves",
    "Standing behind defender (no passing lane)",
    "Drifting to corners and staying stuck",
    "Running toward every pass"
  ],
  coachingTips: [
    "How far should you be from your closest teammate? (12-15 feet!)",
    "When the ball moves, what should you do?",
    "Can your teammate pass to you right now? What's blocking the lane?",
    "Look around - where is empty space on the court?",
    "Good spacing! You gave your teammate room to work!",
    "Where should you be to help spread the defense?"
  ],
  assessmentActivities: [
    {
      name: "Freeze Frame Spacing",
      domain: "tactical",
      description: "Stop play randomly, evaluate player positions and distances"
    },
    {
      name: "4v0 Shell Movement",
      domain: "tactical",
      description: "Move ball around perimeter, all players maintain proper spacing"
    },
    {
      name: "Spacing in 3v3",
      domain: "tactical",
      description: "Small-sided game focused on maintaining space throughout"
    },
    {
      name: "Ball Movement Adjustment",
      domain: "psychological",
      description: "Observe if player adjusts position each time ball moves"
    }
  ],
  redFlags: [
    "Complete inability to stay away from ball after instruction",
    "Cannot identify good versus bad spacing",
    "Persistent clustering despite reminders",
    "No improvement over full season",
    "Difficulty understanding spatial concepts"
  ],
  parentExplanation: "Spacing means staying spread out - 12-15 feet from teammates. When players bunch up, one defender can guard multiple people. Good spacing creates passing and driving lanes. At home, watch basketball and notice when teams space well versus when they bunch up. You can see how the offense flows better with good spacing!",
  homeActivities: [
    "Watch games and identify spacing",
    "Play 2v0 or 3v0 focusing on staying spread",
    "Draw where players should be spaced",
    "Freeze frame video to analyze",
    "Discuss spacing at dinner",
    "Practice moving to open space"
  ],
  assessmentFrequency: "Every scrimmage, formal assessment monthly",
  assessmentGuidance: "Observe positioning throughout possessions, not just at start. Note self-correction."
};

const pickAndRollBallHandlerGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Does not understand pick and roll. Runs into screens, cannot use screens, or ignores screener.",
      observableBehaviors: [
        "Runs into the screen",
        "Doesn't wait for screen to be set",
        "Ignores screener after pick",
        "Cannot read defender",
        "Drives into traffic",
        "No understanding of concept"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Beginning to understand using screens. Can use screen but reads and decisions are slow.",
      observableBehaviors: [
        "Waits for screen sometimes",
        "Uses screen occasionally",
        "Slow to read defense",
        "Sometimes sees roll man",
        "Decision-making delayed",
        "Better with reminders"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Uses screens effectively to create advantage. Reads basic defensive coverage.",
      observableBehaviors: [
        "Sets up defender before using screen",
        "Uses screen with good angle",
        "Reads hedge/switch",
        "Finds roll man sometimes",
        "Makes good decisions in drills",
        "Understands multiple options"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Strong pick and roll player who reads all coverage and makes good decisions consistently.",
      observableBehaviors: [
        "Reads all defensive coverage",
        "Attacks or passes appropriately",
        "Finds roll man consistently",
        "Creates for self and others",
        "Effective in games",
        "Makes defense uncomfortable"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite pick and roll handler who manipulates defense. Creates advantages at will.",
      observableBehaviors: [
        "Makes all reads instantly",
        "Manipulates defense pre-screen",
        "Perfect pocket passes to roll man",
        "Scores at will from PnR",
        "Defense cannot solve them",
        "Runs team pick and roll"
      ]
    }
  ],
  commonMistakes: [
    "Not setting up defender before using screen",
    "Running into screen instead of shoulder-to-shoulder",
    "Ignoring the roll man after screen",
    "Not reading how defense is playing it",
    "Going too fast into the screen",
    "Picking up dribble too early after screen"
  ],
  coachingTips: [
    "Before you use the screen, what can you do to get your defender to follow you?",
    "How close should you be to the screener when you come off? (Shoulder to shoulder!)",
    "After you come off the screen, where is your screener? What's the defense doing?",
    "That read wasn't right - what did the defense do? What should you have done?",
    "Great patience waiting for the screen! Your effort to set it up correctly paid off",
    "What are your three options when you use a pick and roll?"
  ],
  assessmentActivities: [
    {
      name: "2v0 Pick and Roll",
      domain: "technical",
      description: "Practice pick and roll without defense - assess spacing and timing"
    },
    {
      name: "2v2 Pick and Roll",
      domain: "tactical",
      description: "Live pick and roll with defense - assess reads and decisions"
    },
    {
      name: "Read the Coverage",
      domain: "tactical",
      description: "Defense plays different coverage, ball handler must make correct read"
    },
    {
      name: "Continuous Pick and Roll",
      domain: "physical",
      description: "Multiple pick and rolls in a row - tests conditioning and decision-making"
    }
  ],
  redFlags: [
    "Cannot understand screen concept after multiple explanations",
    "Consistently runs into screens instead of using them",
    "Never sees roll man despite drilling",
    "No improvement in reads over 4+ weeks",
    "Cannot execute basic 2v0 pick and roll"
  ],
  parentExplanation: "Pick and roll is basketball's most common play - one player sets a screen for the ball handler, then rolls to the basket. The ball handler must read the defense to decide: attack, pass to the roller, or pass to an open shooter. We teach setup (make defender follow), use (shoulder-to-shoulder), and read (what is defense doing?). Watch any NBA game and you'll see dozens of pick and rolls!",
  homeActivities: [
    "Watch NBA games and count pick and rolls",
    "Discuss what options ball handler had",
    "Practice footwork of coming off screen",
    "Watch highlights of great PnR players",
    "Draw up pick and roll options",
    "2v0 practice with parent as screener"
  ],
  assessmentFrequency: "Every practice with tactical drills, formal assessment bi-weekly",
  assessmentGuidance: "Assess screen setup, usage angle, and decision-making separately. Look for improvement in reads."
};

const coordinationGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Struggles with basic movement coordination. Running, jumping, and catching are inconsistent and uncontrolled.",
      observableBehaviors: [
        "Awkward running form",
        "Difficulty catching balls",
        "Uncoordinated jumping",
        "Trips or falls frequently",
        "Cannot combine movements",
        "Appears uncomfortable moving"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Basic movements improving but combining movements is challenging. Shows improvement with practice.",
      observableBehaviors: [
        "Running form improving",
        "Catches closer throws",
        "Basic jumping ability",
        "Falls less frequently",
        "Simple combinations possible",
        "Growing confidence in movement"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Good basic coordination for age. Can combine multiple movements smoothly in practice situations.",
      observableBehaviors: [
        "Smooth running form",
        "Catches thrown balls consistently",
        "Controlled jumping",
        "Rarely trips or falls",
        "Combines 2-3 movements",
        "Confident in most activities"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Strong coordination that supports basketball skill development. Moves fluidly in game situations.",
      observableBehaviors: [
        "Athletic movement patterns",
        "Catches in various situations",
        "Powerful controlled jumping",
        "Excellent body control",
        "Complex movement combinations",
        "Moves efficiently"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite coordination that enables high-level basketball performance. Movement is effortless and efficient.",
      observableBehaviors: [
        "Elite athletic movement",
        "Catches anything thrown",
        "Explosive yet controlled",
        "Never off-balance",
        "Any movement combination",
        "Makes difficult look easy"
      ]
    }
  ],
  commonMistakes: [
    "Rushing movements before ready",
    "Not watching ball when catching",
    "Stiff body instead of relaxed",
    "Poor timing on jumps and catches",
    "Not bending knees for balance",
    "Trying complex movements before mastering basics"
  ],
  coachingTips: [
    "Can you show me slow and controlled before we try fast?",
    "Where should your eyes be when catching the ball? Watch it into your hands!",
    "What happens to your body when you relax your shoulders? Feels better, right?",
    "That was a bit awkward - let's try it slower. Mistakes help us learn!",
    "Great effort working on your balance! Coordination takes time and practice",
    "What part of your body helps you stay balanced? (Bent knees, low center!)"
  ],
  assessmentActivities: [
    {
      name: "Catch and Move",
      domain: "technical",
      description: "Catch ball and immediately perform movement - assess transition smoothness"
    },
    {
      name: "Ladder Drills",
      domain: "physical",
      description: "Agility ladder patterns - assess foot coordination and timing"
    },
    {
      name: "Multi-Movement Sequence",
      domain: "physical",
      description: "Complete sequence of run, jump, catch, land - assess flow between movements"
    },
    {
      name: "Mirror Movement",
      domain: "psychological",
      description: "Copy coach's movements in real-time - tests body awareness and reaction"
    }
  ],
  redFlags: [
    "No improvement in basic coordination over extended period",
    "Significant difficulty with all motor tasks",
    "Frequently injured during normal activities",
    "Extreme frustration with movement activities",
    "Possible motor development concerns - consider specialist evaluation"
  ],
  parentExplanation: "Coordination is the foundation for all athletic skills - the ability to move body parts together smoothly. At this age, coordination varies widely and improves rapidly with practice. We develop coordination through varied movement activities, not just basketball drills. At home, any active play helps - climbing, running, throwing, catching, jumping. The more movement experiences, the better coordination develops!",
  homeActivities: [
    "Playground activities (climbing, swinging, jumping)",
    "Catch with various sized balls",
    "Jump rope",
    "Obstacle courses in yard",
    "Dance or movement games",
    "Any multi-sport activities"
  ],
  assessmentFrequency: "Ongoing observation, formal assessment quarterly",
  assessmentGuidance: "Observe across various activities, not just basketball. Note improvement trends over time."
};

const confidenceGuide = {
  levelDescriptions: [
    {
      level: 1,
      name: "Emerging",
      description: "Lacks confidence in basketball situations. Hesitates, avoids attempting skills, or gives up quickly.",
      observableBehaviors: [
        "Avoids attempting skills",
        "Gives up after mistakes",
        "Negative self-talk visible",
        "Hesitates in decisions",
        "Body language shows defeat",
        "Reluctant to participate"
      ]
    },
    {
      level: 2,
      name: "Developing",
      description: "Growing confidence but inconsistent. Better in comfortable situations, struggles when challenged.",
      observableBehaviors: [
        "Attempts skills sometimes",
        "Recovers from some mistakes",
        "Better with encouragement",
        "Confidence varies by skill",
        "Body language improving",
        "Participates with prompting"
      ]
    },
    {
      level: 3,
      name: "Competent",
      description: "Generally confident in practice situations. Can recover from mistakes and maintain effort.",
      observableBehaviors: [
        "Attempts most skills willingly",
        "Bounces back from mistakes",
        "Positive or neutral self-talk",
        "Confident in familiar drills",
        "Good body language usually",
        "Volunteers for activities"
      ]
    },
    {
      level: 4,
      name: "Proficient",
      description: "Strong confidence that transfers to games. Seeks challenges and supports teammates' confidence.",
      observableBehaviors: [
        "Attempts all challenges",
        "Mistakes don't affect effort",
        "Positive self-talk evident",
        "Confident in games",
        "Strong body language",
        "Encourages teammates"
      ]
    },
    {
      level: 5,
      name: "Advanced",
      description: "Elite confidence that elevates self and team. Thrives under pressure and helps others build confidence.",
      observableBehaviors: [
        "Seeks biggest challenges",
        "Turns mistakes into motivation",
        "Leads positive team culture",
        "Clutch in big moments",
        "Unwavering body language",
        "Builds others' confidence"
      ]
    }
  ],
  commonMistakes: [
    "Negative self-talk after mistakes",
    "Comparing self to others negatively",
    "Avoiding challenges to prevent failure",
    "Giving up before really trying",
    "Letting one mistake ruin entire practice",
    "Body language that shows defeat"
  ],
  coachingTips: [
    "What would you tell a friend who made that same mistake? Now tell yourself!",
    "What's one thing you did well today? Let's build on that!",
    "Mistakes mean you're trying hard enough to challenge yourself. That's growth!",
    "I noticed you kept trying even when it was hard. That takes courage!",
    "What can you control in that situation? Focus on what you CAN do!",
    "Your effort and attitude are choices. You're making great choices!"
  ],
  assessmentActivities: [
    {
      name: "Challenge Acceptance",
      domain: "psychological",
      description: "Observe willingness to attempt difficult skills or drills"
    },
    {
      name: "Mistake Recovery",
      domain: "psychological",
      description: "Note effort level and attitude after making a mistake"
    },
    {
      name: "Body Language Check",
      domain: "psychological",
      description: "Observe posture, facial expression, and engagement throughout practice"
    },
    {
      name: "Peer Interaction",
      domain: "psychological",
      description: "Note if player encourages or discourages teammates"
    }
  ],
  redFlags: [
    "Persistent negative self-talk despite intervention",
    "Consistent avoidance of all challenging activities",
    "Crying or emotional distress regularly at practice",
    "No improvement in confidence over extended period",
    "Signs of anxiety beyond normal nervousness"
  ],
  parentExplanation: "Confidence in basketball comes from positive experiences, effort recognition, and learning to handle mistakes. We build confidence by focusing on what players CAN control - effort, attitude, and trying their best. At home, praise effort over outcome. Avoid comparing to other players. When they make mistakes, help them see it as learning. Ask 'What did you learn?' instead of 'Did you win?' Your response to their struggles shapes their confidence!",
  homeActivities: [
    "Praise effort, not just results",
    "Share your own stories of learning from mistakes",
    "Avoid comparing to siblings or friends",
    "Celebrate trying hard things even if unsuccessful",
    "Ask 'What did you enjoy?' after practice",
    "Model positive self-talk in your own activities"
  ],
  assessmentFrequency: "Ongoing observation every session",
  assessmentGuidance: "Observe across entire practice, not just during skills. Note improvement trends and triggers for confidence changes."
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN UPGRADE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export async function upgradeBasketballSkills2() {
  console.log("Upgrading 18 basketball skills with comprehensive assessment guides (Batch 2)...\n");

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 1: Dribbling on the Move (technical, Skill Building)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Dribbling on the Move...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Loses ball frequently while moving; stops to dribble; watches ball constantly; cannot change direction",
        2: "Can dribble while walking slowly; control decreases with speed; beginning weak hand work",
        3: "Comfortable dribbling at moderate speed with both hands; can change direction; head up more often",
        4: "Strong dribbling at game speed; protects ball; maintains court vision; changes pace effectively",
        5: "Elite ball handling on the move; creates opportunities; full court vision; ambidextrous mastery",
      },
      observableBehaviors: [
        "Maintains dribble while running without losing control",
        "Uses appropriate hand based on direction and defender",
        "Keeps head up to see teammates and court",
        "Protects ball with body positioning",
        "Changes pace and direction without losing control",
      ],
      commonMistakes: dribblingOnTheMoveGuide.commonMistakes,
      coachingTips: dribblingOnTheMoveGuide.coachingTips,
      tags: ["technical", "ball-handling", "dribbling", "movement", "skill-building"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          dribblingOnTheMoveGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: dribblingOnTheMoveGuide.redFlags,
        parentExplanation: dribblingOnTheMoveGuide.parentExplanation,
        homeActivities: dribblingOnTheMoveGuide.homeActivities,
        assessmentFrequency: dribblingOnTheMoveGuide.assessmentFrequency,
        assessmentDuration: dribblingOnTheMoveGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.dribblingOnTheMove));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 2: Layups - Weak Hand (technical, Skill Building)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Layups - Weak Hand...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot coordinate weak hand layup; uses wrong footwork or switches to dominant hand",
        2: "Attempting weak hand with developing footwork; success rate low but improving",
        3: "Consistent weak hand form with moderate success; footwork automatic; growing confidence",
        4: "Strong weak hand finishing; can finish under light pressure; weak side becoming weapon",
        5: "Elite weak hand that mirrors dominant; finishes through contact; defenders cannot overplay",
      },
      observableBehaviors: [
        "Takes off from correct foot (opposite of shooting hand)",
        "Completes layup with non-dominant hand",
        "Uses backboard effectively from weak side angles",
        "Drives knee up on shooting side",
        "Shows confidence approaching basket from weak side",
      ],
      commonMistakes: layupsWeakHandGuide.commonMistakes,
      coachingTips: layupsWeakHandGuide.coachingTips,
      tags: ["technical", "finishing", "layup", "weak-hand", "skill-building"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          layupsWeakHandGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: layupsWeakHandGuide.redFlags,
        parentExplanation: layupsWeakHandGuide.parentExplanation,
        homeActivities: layupsWeakHandGuide.homeActivities,
        assessmentFrequency: layupsWeakHandGuide.assessmentFrequency,
        assessmentDuration: layupsWeakHandGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.layupsWeakHand));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 3: Give and Go (tactical, Skill Building)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Give and Go...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Stands still after passing; no understanding of cut concept; runs away from basket",
        2: "Beginning to understand pass-and-cut; timing inconsistent; sometimes ready for return pass",
        3: "Executes basic give and go; reads defender position; makes appropriate cuts",
        4: "Effective give and go player; uses fakes; reads defense; finishes consistently",
        5: "Elite give and go execution; masters timing; reads entire defense; creates easy baskets",
      },
      observableBehaviors: [
        "Cuts immediately after making a pass",
        "Cuts toward the basket, not away from it",
        "Has hands ready to receive return pass",
        "Reads defender to determine cut direction",
        "Finishes or makes good decision after receiving return pass",
      ],
      commonMistakes: giveAndGoGuide.commonMistakes,
      coachingTips: giveAndGoGuide.coachingTips,
      tags: ["tactical", "teamwork", "cutting", "offensive-concepts", "skill-building"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          giveAndGoGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: giveAndGoGuide.redFlags,
        parentExplanation: giveAndGoGuide.parentExplanation,
        homeActivities: giveAndGoGuide.homeActivities,
        assessmentFrequency: giveAndGoGuide.assessmentFrequency,
        assessmentDuration: giveAndGoGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.giveAndGo));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 4: Pull-Up Jump Shot (technical, Development)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Pull-Up Jump Shot...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot transition from dribble to shot; travels or loses balance; form breaks down",
        2: "Beginning to coordinate stop and shot; footwork developing; limited consistency",
        3: "Executes pull-up with proper footwork; makes open shots from mid-range",
        4: "Effective pull-up from various distances; creates shot against defenders",
        5: "Elite pull-up shooter; scores from anywhere; creates own shot consistently",
      },
      observableBehaviors: [
        "Gathers ball legally while stopping dribble",
        "Maintains balance through the stop and shot",
        "Keeps same shooting form as stationary shot",
        "Jumps straight up rather than drifting",
        "Makes good decisions about when to pull up",
      ],
      commonMistakes: pullUpJumpShotGuide.commonMistakes,
      coachingTips: pullUpJumpShotGuide.coachingTips,
      tags: ["technical", "shooting", "scoring", "mid-range", "development"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          pullUpJumpShotGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: pullUpJumpShotGuide.redFlags,
        parentExplanation: pullUpJumpShotGuide.parentExplanation,
        homeActivities: pullUpJumpShotGuide.homeActivities,
        assessmentFrequency: pullUpJumpShotGuide.assessmentFrequency,
        assessmentDuration: pullUpJumpShotGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.pullUpJumpShot));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 5: Crossover Dribble (Development stage)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Crossover Dribble (Development)...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot execute crossover; ball bounces away or goes wrong direction",
        2: "Can perform stationary crossover; move is slow and telegraphed",
        3: "Executes crossover while moving; uses to change direction effectively",
        4: "Quick, deceptive crossover that beats defenders; sets up with hesitation",
        5: "Elite crossover that breaks down any defender; multiple variations and combinations",
      },
      observableBehaviors: [
        "Keeps ball low during crossover (below knee height)",
        "Changes direction quickly after crossover",
        "Sells initial direction before crossing",
        "Maintains balance through the move",
        "Uses crossover to beat defender in game situations",
      ],
      commonMistakes: crossoverDribbleGuide.commonMistakes,
      coachingTips: crossoverDribbleGuide.coachingTips,
      tags: ["technical", "ball-handling", "dribbling", "moves", "development"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          crossoverDribbleGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: crossoverDribbleGuide.redFlags,
        parentExplanation: crossoverDribbleGuide.parentExplanation,
        homeActivities: crossoverDribbleGuide.homeActivities,
        assessmentFrequency: crossoverDribbleGuide.assessmentFrequency,
        assessmentDuration: crossoverDribbleGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.crossoverDribbleDev));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 6: Help Defense (tactical, Development)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Help Defense...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Only guards assigned player; no awareness of help opportunities; doesn't see ball",
        2: "Beginning to understand help concept; helps when reminded; positioning inconsistent",
        3: "Understands and executes basic help; proper positioning; rotates on drives",
        4: "Strong help defender; anticipates plays; disrupts offense; recovers quickly",
        5: "Elite help defender who anchors team defense; reads entire offense; makes teammates better",
      },
      observableBehaviors: [
        "Maintains proper help side position (sees ball and player)",
        "Rotates to stop ball when teammate is beaten",
        "Communicates 'help' calls to teammates",
        "Recovers to own player after helping",
        "Contests shots in the paint when in position",
      ],
      commonMistakes: helpDefenseGuide.commonMistakes,
      coachingTips: helpDefenseGuide.coachingTips,
      tags: ["tactical", "defense", "team-defense", "rotations", "development"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          helpDefenseGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: helpDefenseGuide.redFlags,
        parentExplanation: helpDefenseGuide.parentExplanation,
        homeActivities: helpDefenseGuide.homeActivities,
        assessmentFrequency: helpDefenseGuide.assessmentFrequency,
        assessmentDuration: helpDefenseGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.helpDefense));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 7: Shooting Form (Fundamentals - ID 1)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Shooting Form (Fundamentals 1)...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Throws ball without form; two-handed push; no arc; misses by significant margin",
        2: "Developing one-hand motion; some BEEF elements present; makes occasional close shots",
        3: "Proper BEEF form consistent; good arc; makes 40%+ from close range",
        4: "Smooth consistent form from various distances; 50%+ mid-range; form holds under pressure",
        5: "Textbook form with high percentage; clutch shooter; model for teammates",
      },
      observableBehaviors: [
        "Balanced stance with feet shoulder-width",
        "Eyes focused on target throughout shot",
        "Elbow under ball pointing at basket",
        "Follow-through with wrist snap (cookie jar)",
        "Ball has proper arc and backspin",
      ],
      commonMistakes: shootingFormGuide.commonMistakes,
      coachingTips: shootingFormGuide.coachingTips,
      tags: ["technical", "shooting", "form", "fundamentals", "core"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          shootingFormGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: shootingFormGuide.redFlags,
        parentExplanation: shootingFormGuide.parentExplanation,
        homeActivities: shootingFormGuide.homeActivities,
        assessmentFrequency: shootingFormGuide.assessmentFrequency,
        assessmentDuration: shootingFormGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.shootingFormFund1));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 8: Shooting Form (Fundamentals - ID 2)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Shooting Form (Fundamentals 2)...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Throws ball without form; two-handed push; no arc; misses by significant margin",
        2: "Developing one-hand motion; some BEEF elements present; makes occasional close shots",
        3: "Proper BEEF form consistent; good arc; makes 40%+ from close range",
        4: "Smooth consistent form from various distances; 50%+ mid-range; form holds under pressure",
        5: "Textbook form with high percentage; clutch shooter; model for teammates",
      },
      observableBehaviors: [
        "Balanced stance with feet shoulder-width",
        "Eyes focused on target throughout shot",
        "Elbow under ball pointing at basket",
        "Follow-through with wrist snap (cookie jar)",
        "Ball has proper arc and backspin",
      ],
      commonMistakes: shootingFormGuide.commonMistakes,
      coachingTips: shootingFormGuide.coachingTips,
      tags: ["technical", "shooting", "form", "fundamentals", "core"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          shootingFormGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: shootingFormGuide.redFlags,
        parentExplanation: shootingFormGuide.parentExplanation,
        homeActivities: shootingFormGuide.homeActivities,
        assessmentFrequency: shootingFormGuide.assessmentFrequency,
        assessmentDuration: shootingFormGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.shootingFormFund2));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 9: Ball Handling (Fundamentals - ID 1)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Ball Handling (Fundamentals 1)...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Loses ball frequently; palm-dribbles; eyes on ball; only dominant hand",
        2: "Maintains basic dribble with dominant hand; fingertip control developing",
        3: "Confident with both hands; fingertips consistent; head up while dribbling",
        4: "Excellent control with both hands; performs multiple moves; court vision",
        5: "Elite handling with creative combinations; full court vision; ambidextrous mastery",
      },
      observableBehaviors: [
        "Uses fingertips rather than palm",
        "Maintains consistent rhythm without losing ball",
        "Keeps ball at or below waist height",
        "Dribbles with both hands",
        "Shows head-up position while dribbling",
      ],
      commonMistakes: ballHandlingGuide.commonMistakes,
      coachingTips: ballHandlingGuide.coachingTips,
      tags: ["technical", "ball-handling", "dribbling", "fundamentals", "core"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          ballHandlingGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: ballHandlingGuide.redFlags,
        parentExplanation: ballHandlingGuide.parentExplanation,
        homeActivities: ballHandlingGuide.homeActivities,
        assessmentFrequency: ballHandlingGuide.assessmentFrequency,
        assessmentDuration: ballHandlingGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.ballHandlingFund1));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 10: Ball Handling (Fundamentals - ID 2)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Ball Handling (Fundamentals 2)...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Loses ball frequently; palm-dribbles; eyes on ball; only dominant hand",
        2: "Maintains basic dribble with dominant hand; fingertip control developing",
        3: "Confident with both hands; fingertips consistent; head up while dribbling",
        4: "Excellent control with both hands; performs multiple moves; court vision",
        5: "Elite handling with creative combinations; full court vision; ambidextrous mastery",
      },
      observableBehaviors: [
        "Uses fingertips rather than palm",
        "Maintains consistent rhythm without losing ball",
        "Keeps ball at or below waist height",
        "Dribbles with both hands",
        "Shows head-up position while dribbling",
      ],
      commonMistakes: ballHandlingGuide.commonMistakes,
      coachingTips: ballHandlingGuide.coachingTips,
      tags: ["technical", "ball-handling", "dribbling", "fundamentals", "core"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          ballHandlingGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: ballHandlingGuide.redFlags,
        parentExplanation: ballHandlingGuide.parentExplanation,
        homeActivities: ballHandlingGuide.homeActivities,
        assessmentFrequency: ballHandlingGuide.assessmentFrequency,
        assessmentDuration: ballHandlingGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.ballHandlingFund2));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 11: Chest Pass (technical, Fundamentals)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Chest Pass...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Pass lacks power and direction; incorrect grip; ball floats or bounces unpredictably",
        2: "Short passes to stationary target; form developing; inconsistent accuracy",
        3: "Accurate at medium distance; proper thumbs-down follow-through; hits moving targets",
        4: "Crisp passes in game situations; good vision and decision-making",
        5: "Elite passer with exceptional vision; creates scoring opportunities; makes teammates better",
      },
      observableBehaviors: [
        "Holds ball at chest with fingers spread on sides",
        "Steps toward target when passing",
        "Thumbs point down on follow-through",
        "Ball arrives at receiver's chest level",
        "Pass speed appropriate for situation",
      ],
      commonMistakes: chestPassGuide.commonMistakes,
      coachingTips: chestPassGuide.coachingTips,
      tags: ["technical", "passing", "fundamentals", "teamwork", "core"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          chestPassGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: chestPassGuide.redFlags,
        parentExplanation: chestPassGuide.parentExplanation,
        homeActivities: chestPassGuide.homeActivities,
        assessmentFrequency: chestPassGuide.assessmentFrequency,
        assessmentDuration: chestPassGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.chestPass));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 12: Layup (technical, Fundamentals)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Layup...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot coordinate footwork and shot; wrong foot/hand; ball rarely reaches rim",
        2: "Developing footwork; occasional correct takeoff; makes some from close range",
        3: "Consistent footwork; uses backboard effectively; makes 50%+ from short approach",
        4: "Smooth layups from various angles; good finish touch; 70%+ in drills",
        5: "Elite finishing through contact; creative finishes; truly ambidextrous",
      },
      observableBehaviors: [
        "Takes off from opposite foot (right hand = left foot)",
        "Drives knee up on shooting side",
        "Uses backboard at proper angle",
        "Soft touch on release",
        "Eyes focused on target throughout",
      ],
      commonMistakes: layupGuide.commonMistakes,
      coachingTips: layupGuide.coachingTips,
      tags: ["technical", "finishing", "layup", "fundamentals", "core"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          layupGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: layupGuide.redFlags,
        parentExplanation: layupGuide.parentExplanation,
        homeActivities: layupGuide.homeActivities,
        assessmentFrequency: layupGuide.assessmentFrequency,
        assessmentDuration: layupGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.layup));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 13: Crossover Dribble (Skill Building stage)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Crossover Dribble (Skill Building)...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot execute crossover; ball bounces away or goes wrong direction",
        2: "Can perform stationary crossover; move is slow and telegraphed",
        3: "Executes crossover while moving; uses to change direction effectively",
        4: "Quick, deceptive crossover that beats defenders; sets up with hesitation",
        5: "Elite crossover that breaks down any defender; multiple variations and combinations",
      },
      observableBehaviors: [
        "Keeps ball low during crossover (below knee height)",
        "Changes direction quickly after crossover",
        "Sells initial direction before crossing",
        "Maintains balance through the move",
        "Uses crossover to beat defender in game situations",
      ],
      commonMistakes: crossoverDribbleGuide.commonMistakes,
      coachingTips: crossoverDribbleGuide.coachingTips,
      tags: ["technical", "ball-handling", "dribbling", "moves", "skill-building"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          crossoverDribbleGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: crossoverDribbleGuide.redFlags,
        parentExplanation: crossoverDribbleGuide.parentExplanation,
        homeActivities: crossoverDribbleGuide.homeActivities,
        assessmentFrequency: crossoverDribbleGuide.assessmentFrequency,
        assessmentDuration: crossoverDribbleGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.crossoverDribbleSkill));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 14: Pull-Up Jumper (technical, Skill Building)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Pull-Up Jumper...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Cannot stop from dribble into shot; travels or loses balance; form breaks",
        2: "Beginning to coordinate stop and shot; footwork developing; limited consistency",
        3: "Proper footwork and form; makes open pull-ups from mid-range",
        4: "Effective pull-up from various spots; creates shot against defenders",
        5: "Elite pull-up shooter; scores from anywhere; go-to scorer",
      },
      observableBehaviors: [
        "Gathers ball legally while stopping",
        "Maintains balance through stop and shot",
        "Same shooting form as stationary shot",
        "Jumps straight up",
        "Good shot selection",
      ],
      commonMistakes: pullUpJumperGuide.commonMistakes,
      coachingTips: pullUpJumperGuide.coachingTips,
      tags: ["technical", "shooting", "scoring", "mid-range", "skill-building"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          pullUpJumperGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: pullUpJumperGuide.redFlags,
        parentExplanation: pullUpJumperGuide.parentExplanation,
        homeActivities: pullUpJumperGuide.homeActivities,
        assessmentFrequency: pullUpJumperGuide.assessmentFrequency,
        assessmentDuration: pullUpJumperGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.pullUpJumper));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 15: Spacing (tactical, Fundamentals)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Spacing...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Clusters with ball and teammates; follows ball like magnet; no court awareness",
        2: "Beginning to understand; spaces when reminded; drifts back to ball",
        3: "Maintains spacing in drills; understands 12-15 foot rule; self-corrects",
        4: "Good court awareness; finds space consistently; creates opportunities",
        5: "Elite spacing intelligence; manipulates defense through positioning",
      },
      observableBehaviors: [
        "Maintains 12-15 feet from nearest teammate",
        "Finds open space away from ball",
        "Recognizes and fills gaps in offense",
        "Adjusts position as ball moves",
        "Creates passing lanes through spacing",
      ],
      commonMistakes: spacingGuide.commonMistakes,
      coachingTips: spacingGuide.coachingTips,
      tags: ["tactical", "spacing", "court-awareness", "fundamentals", "teamwork"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          spacingGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: spacingGuide.redFlags,
        parentExplanation: spacingGuide.parentExplanation,
        homeActivities: spacingGuide.homeActivities,
        assessmentFrequency: spacingGuide.assessmentFrequency,
        assessmentDuration: spacingGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.spacing));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 16: Pick and Roll Ball Handler (tactical, Skill Building)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Pick and Roll (Ball Handler)...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Does not understand pick and roll; runs into screens; ignores screener",
        2: "Beginning to understand; uses screen but reads and decisions slow",
        3: "Uses screens effectively; reads basic defensive coverage",
        4: "Strong pick and roll player; reads all coverage; makes good decisions",
        5: "Elite pick and roll handler; manipulates defense; creates advantages at will",
      },
      observableBehaviors: [
        "Sets up defender before using screen",
        "Uses screen at proper angle (shoulder to shoulder)",
        "Reads how defense is playing the screen",
        "Finds roll man when open",
        "Makes good decisions based on coverage",
      ],
      commonMistakes: pickAndRollBallHandlerGuide.commonMistakes,
      coachingTips: pickAndRollBallHandlerGuide.coachingTips,
      tags: ["tactical", "offensive-concepts", "pick-and-roll", "skill-building", "decision-making"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          pickAndRollBallHandlerGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: pickAndRollBallHandlerGuide.redFlags,
        parentExplanation: pickAndRollBallHandlerGuide.parentExplanation,
        homeActivities: pickAndRollBallHandlerGuide.homeActivities,
        assessmentFrequency: pickAndRollBallHandlerGuide.assessmentFrequency,
        assessmentDuration: pickAndRollBallHandlerGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.pickAndRollBallHandler));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 17: Coordination (physical, Fundamentals)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Coordination...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Struggles with basic movement; awkward running, jumping, catching",
        2: "Basic movements improving; combining movements still challenging",
        3: "Good coordination for age; combines multiple movements smoothly",
        4: "Strong coordination supporting skill development; moves fluidly in games",
        5: "Elite coordination enabling high-level performance; movement is effortless",
      },
      observableBehaviors: [
        "Runs with smooth, efficient form",
        "Catches balls thrown from various distances",
        "Jumps and lands with control",
        "Combines running, jumping, and catching",
        "Moves confidently in all activities",
      ],
      commonMistakes: coordinationGuide.commonMistakes,
      coachingTips: coordinationGuide.coachingTips,
      tags: ["physical", "coordination", "fundamentals", "movement", "athletic-development"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          coordinationGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: coordinationGuide.redFlags,
        parentExplanation: coordinationGuide.parentExplanation,
        homeActivities: coordinationGuide.homeActivities,
        assessmentFrequency: coordinationGuide.assessmentFrequency,
        assessmentDuration: coordinationGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.coordination));

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL 18: Confidence (psychological, Fundamentals)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Upgrading: Confidence...");
  await db
    .update(skills)
    .set({
      progressionLevels: {
        1: "Lacks confidence; hesitates; avoids skills; gives up quickly after mistakes",
        2: "Growing but inconsistent; better in comfortable situations; struggles when challenged",
        3: "Generally confident in practice; recovers from mistakes; maintains effort",
        4: "Strong confidence in games; seeks challenges; supports teammates",
        5: "Elite confidence; thrives under pressure; elevates self and team",
      },
      observableBehaviors: [
        "Willingly attempts challenging skills",
        "Recovers effort and attitude after mistakes",
        "Shows positive or neutral body language",
        "Volunteers for activities and challenges",
        "Encourages and supports teammates",
      ],
      commonMistakes: confidenceGuide.commonMistakes,
      coachingTips: confidenceGuide.coachingTips,
      tags: ["psychological", "confidence", "fundamentals", "mental-skills", "ELM"],
      comprehensiveGuide: {
        levelDetails: Object.fromEntries(
          confidenceGuide.levelDescriptions.map((l) => [
            l.level,
            {
              name: l.name,
              description: l.description,
              observableBehaviors: l.observableBehaviors,
              commonMistakes: [] as string[],
              coachingTips: [] as string[],
              assessmentActivities: [] as string[],
            },
          ])
        ),
        redFlags: confidenceGuide.redFlags,
        parentExplanation: confidenceGuide.parentExplanation,
        homeActivities: confidenceGuide.homeActivities,
        assessmentFrequency: confidenceGuide.assessmentFrequency,
        assessmentDuration: confidenceGuide.assessmentGuidance,
      },
      updatedAt: new Date(),
    })
    .where(eq(skills.id, SKILL_IDS.confidence));

  console.log("\nSuccessfully upgraded 18 basketball skills with comprehensive assessment guides!");
  console.log("Skills upgraded:");
  console.log("  - Dribbling on the Move (Skill Building)");
  console.log("  - Layups - Weak Hand (Skill Building)");
  console.log("  - Give and Go (Skill Building)");
  console.log("  - Pull-Up Jump Shot (Development)");
  console.log("  - Crossover Dribble (Development)");
  console.log("  - Help Defense (Development)");
  console.log("  - Shooting Form (Fundamentals x2)");
  console.log("  - Ball Handling (Fundamentals x2)");
  console.log("  - Chest Pass (Fundamentals)");
  console.log("  - Layup (Fundamentals)");
  console.log("  - Crossover Dribble (Skill Building)");
  console.log("  - Pull-Up Jumper (Skill Building)");
  console.log("  - Spacing (Fundamentals)");
  console.log("  - Pick and Roll Ball Handler (Skill Building)");
  console.log("  - Coordination (Fundamentals)");
  console.log("  - Confidence (Fundamentals)");
}

// Export for use in seed runner
export { upgradeBasketballSkills2 as default };

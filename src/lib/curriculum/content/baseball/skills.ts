// Baseball skills content.
//
// RECONSTRUCTION NOTE (gen-0/gen-1, "Throwing Mechanics" only): baseball has
// no v2-canonical skills file and no gen-0 rows in
// `src/lib/db/seed-curriculum.ts` (that file seeds only soccer and
// basketball) -- the ONLY pre-wave-2 baseball source is
// `.superpowers/curriculum-recovery/seeds/curriculum-v2__baseball-skills-upgrade.ts`,
// which UPDATEs a single pre-existing skill row ("Throwing Mechanics") by a
// hardcoded uuid rather than inserting a full row. The "Throwing Mechanics"
// entry below is transcribed byte-for-byte from that update payload (via a
// scratch tsx extraction script -- see the Task 6 report at
// .superpowers/sdd/cr-task-6-report.md for method); its `sport` / `domain` /
// `stage` / `name` / `slug` / `assessmentMethod` / `isCore` / `sortOrder`
// were reconstructed from context as documented in that report.
//
// WAVE-2 BUILD-OUT (2026-07-05): the remaining 11 skills were newly authored
// to bring baseball fundamentals to parity with the other three sports,
// anchored on the four core competencies -- throwing, catching, running,
// hitting (USA Baseball LTAD's core motor competencies, taught as an
// unordered set, not a ranking) -- and its "keep rules minimal" principle
// (which base, where to stand, what an out is), both cited in
// docs/curriculum/research/2026-07-05-brief.md §2. The teaching sequence used
// below (throw, catch, run, hit) is our own editorial choice, not an
// LTAD-specified order. Domain shape mirrors
// hockey's 5/3/2/3 scale (here: 5 technical / 2 tactical / 2 physical / 3
// psychological = 12 total). All 12 skills sit at "fundamentals" except
// "Fielding Ground Balls" and "Focus at the Plate", which are pushed to
// "skill-building" because both require a coordination/attention baseline
// (glove-to-hand transfer under motion; sustained at-bat focus) that is not
// realistic to expect at the 6-8 fundamentals band per the brief's
// maturation-anchored-heuristics guidance (§3) -- everything else here holds
// to the brief's explicit 6-8 scope.
//
// Net count: 12 baseball skills (5 technical, 2 tactical, 2 physical, 3
// psychological), asserted in registry.test.ts.

import type { SkillContent } from "../types";

export const BASEBALL_SKILLS: SkillContent[] = [
  {
    sport: "baseball",
    domain: "technical",
    stage: "fundamentals",
    name: "Throwing Mechanics",
    slug: "throwing-mechanics",
    description:
      "The full-body throwing sequence -- grip, arm path, hip rotation, and follow-through -- used to throw a baseball accurately and with good velocity, taught alongside the arm-care habits that keep a young throwing arm healthy.",
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 1,
    progressionLevels: {
      "1": "Throws with minimal body involvement; ball pushed rather than thrown; no hip rotation; inconsistent release point; ball trajectory unpredictable",
      "2": "Beginning to use legs and trunk; developing arm path; some throws accurate at short distances; grip inconsistent; learning separation concept",
      "3": "Consistent arm action with proper elbow height; uses hip rotation; accurate throws at medium distances; developing 4-seam grip; follows through across body",
      "4": "Fluid mechanics with full kinetic chain engagement; consistent release point; accurate throws at various distances; multiple grip options; arm care habits established",
      "5": "Elite throwing mechanics optimized for position; exceptional accuracy and arm strength; adjusts mechanics for game situations; models proper arm care; leadership in fundamentals",
    },
    observableBehaviors: [
      "Demonstrates proper 4-seam grip with fingers across seams",
      "Shows good arm path with elbow at or above shoulder height",
      "Rotates hips before arm comes through (kinetic chain)",
      "Follows through completely across body toward target",
      "Steps directly toward target with front foot",
      "Maintains balance throughout throwing motion",
      "Shows consistent release point on repeated throws",
    ],
    commonMistakes: [
      "Short-arming: Elbow stays low, arm doesn't get full extension",
      "Pushing the ball: No separation between arm and body",
      "Opening early: Hips and shoulders rotate together instead of sequentially",
      "Poor grip: Fingers on side of ball or palm-heavy contact",
      "No follow-through: Arm stops at release instead of decelerating naturally",
      "Landing closed or open: Front foot not pointed at target",
      "Head pulling off: Eyes leave target before release",
    ],
    coachingTips: [
      "Can you show me where your fingers sit on the ball? Let's find those four seams!",
      "When you throw, does your elbow get up to shoulder height? Let's check in the mirror",
      "What rotates first - your hips or your shoulders? Your hips should lead the way!",
      "Where does your throwing hand end up after you release? It should finish by your opposite hip",
      "Every throw is practice for game situations - even warm-up tosses. How would you throw this in a game?",
      "If that throw was off target, what's one thing you could adjust? That's learning!",
      "How does your arm feel today? It's important to listen to your body - that's part of being a great player",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "throwing",
      "arm-action",
      "mechanics",
      "arm-care",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is learning the fundamental concept of throwing. Movements are segmented and ball is pushed rather than thrown with proper mechanics. Accuracy is inconsistent and arm action is developing.",
          observableBehaviors: [
            "Throws with mostly arm, little body involvement",
            "Ball is pushed from chest area rather than thrown with arm path",
            "No visible hip rotation - upper and lower body move together",
            "Elbow stays below shoulder during throw",
            "Grip is inconsistent - sometimes palm, sometimes fingers",
            "Throws miss target significantly at even short distances",
            "Limited follow-through - arm stops abruptly at release",
            "Steps with wrong foot or doesn't step at all",
          ],
          commonMistakes: [
            "Short-arming - elbow stays low, reducing velocity",
            "Pushing the ball instead of throwing with proper arm action",
            "No visible hip rotation - upper and lower body move together",
          ],
          coachingTips: [
            "Focus on fun - games and challenges work better than drills at this stage",
            "Use lighter balls and shorter distances to build proper patterns",
            "Celebrate effort and improvement, not just accuracy",
          ],
          assessmentActivities: [
            "Catch play observation from multiple angles",
            "Simple target throwing at short distances",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player is beginning to incorporate body rotation and proper arm path. Some throws show correct mechanics, but consistency varies. Starting to understand the kinetic chain concept.",
          observableBehaviors: [
            "Beginning to step toward target with opposite foot",
            "Shows some hip rotation before arm comes through",
            "Arm gets higher - elbow approaching shoulder height sometimes",
            "Can grip ball correctly when reminded",
            "Accurate at 30-40 feet about 50% of time",
            "Follow-through present but inconsistent",
            "Can describe what good throwing looks like",
            "Shows effort to improve mechanics when coached",
          ],
          commonMistakes: [
            "Opening the front side early - hips and shoulders rotate together",
            "Improper grip - ball held in palm rather than fingers",
            "Inconsistent follow-through",
          ],
          coachingTips: [
            "What does your arm feel like today? (Check-in for arm care)",
            "Can you show me where your fingers sit on the ball?",
            "When you throw, does your elbow get up to shoulder height?",
          ],
          assessmentActivities: [
            "Catch play observation with feedback",
            "Target throwing from 30-40 feet",
            "Grip checks during warm-up",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player demonstrates consistent arm action with proper elbow height and hip rotation. Throws are accurate at medium distances and mechanics hold up in most practice situations.",
          observableBehaviors: [
            "Consistent 4-seam grip without reminder",
            "Elbow at or above shoulder height on most throws",
            "Clear hip rotation before shoulder rotation",
            "Follows through across body to opposite hip",
            "Accurate throws at 60-90 feet consistently",
            "Maintains balance throughout motion",
            "Adjusts effort based on distance",
            "Self-corrects after errant throws",
            "Participates in arm care routine without prompting",
          ],
          commonMistakes: [
            "Opening early under pressure or fatigue",
            "Reduced follow-through when aiming",
            "Mechanics break down during game situations",
          ],
          coachingTips: [
            "When that throw sailed, what do you think happened?",
            "Can you feel the difference when your hips lead versus your arm?",
            "Every throw is practice for game situations - even warm-up tosses",
          ],
          assessmentActivities: [
            "Target throwing at 60-90 feet",
            "Game situation throws during practice",
            "Self-assessment and correction observation",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player exhibits fluid mechanics with full kinetic chain engagement. Throws are consistently accurate with good velocity. Has internalized arm care habits and can adjust mechanics for different throwing situations.",
          observableBehaviors: [
            "Seamless kinetic chain from ground up",
            "Consistent release point throw after throw",
            "Accurate throws from all positions and distances",
            "Uses different arm angles when appropriate",
            "Demonstrates multiple grips (4-seam, 2-seam)",
            "Throws accurately while moving",
            "Leads daily arm care and warm-up routines",
            "Recognizes and corrects mechanical breakdowns",
            "Manages workload awareness",
          ],
          commonMistakes: [
            "Overworking without adequate rest",
            "Forcing throws in game situations",
            "Neglecting arm care routine",
          ],
          coachingTips: [
            "Show me how you would warm up your arm - teach me your routine",
            "I noticed you kept throwing well when tired. How did you do that?",
            "Let's make sure mechanics are automatic before adding distance",
          ],
          assessmentActivities: [
            "Game situation assessment during scrimmages",
            "Arm care knowledge check",
            "Multiple distance accuracy test",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player has elite throwing mechanics optimized for their position. Exceptional accuracy and arm strength combined with deep understanding of mechanics and arm care. Serves as a model for younger players.",
          observableBehaviors: [
            "Position-specific throwing excellence",
            "Throws accurately under game pressure",
            "Adjusts mechanics for game situations (quick release, throw on run)",
            "Elite arm strength with maintained accuracy",
            "Mentors teammates on throwing fundamentals",
            "Champions arm care culture",
            "Makes difficult throws look effortless",
            "Understands and can explain mechanical principles",
            "Zero mechanical regression under fatigue",
          ],
          commonMistakes: [
            "Overconfidence leading to rushed throws",
            "Not communicating arm fatigue until too late",
          ],
          coachingTips: [
            "How can you help younger players develop their throwing?",
            "What adjustments do you make for different game situations?",
            "How do you maintain mechanics when fatigued?",
          ],
          assessmentActivities: [
            "Full game observation under pressure",
            "Peer mentoring assessment",
            "Position-specific throwing evaluation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Arm strength and coordination are still developing rapidly. Use softer, lighter balls when possible. Keep throwing distances short (30-50 feet max). Focus on basic concepts: grip, step toward target, follow-through. Don't expect consistent mechanics - muscle memory takes thousands of repetitions. Make throwing FUN - games and challenges work better than drills. CRITICAL: Never allow through pain. Arm care habits start NOW.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "This is the critical window for developing proper mechanics. Players can now understand and apply coaching. Video feedback is effective at this age. Introduce full kinetic chain concept. Follow Little League pitch count guidelines strictly. Watch for signs of overuse - this is the age group most at risk for youth arm injuries. Encourage multi-sport participation to avoid overuse.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Mechanics should be fairly consistent in practice situations. Focus shifts to maintaining mechanics under game pressure and fatigue. Growth spurts may temporarily affect coordination. Continue strict adherence to pitch count guidelines - MLB Pitch Smart recommends specific limits by age. Introduce position-specific throwing (quick release for middle infielders, crow hop for outfielders). Arm care becomes even more critical as throwing velocity increases.",
        },
      },
      redFlags: [
        "Persistent elbow or shoulder pain that doesn't resolve with rest",
        "Loss of velocity or accuracy that was previously present",
        "Visible 'wincing' or hesitation during throwing motion",
        "Dramatic mechanical changes appearing suddenly (may indicate compensation for pain)",
        "Avoidance of throwing activities they previously enjoyed",
        "Complaints of arm being 'tired' or 'dead' early in activity",
        "Inability to raise arm to shoulder height during motion",
        "Swelling or tenderness in elbow or shoulder",
        "Reports of numbness or tingling in throwing hand/fingers",
        "No improvement in mechanics after 6+ weeks of consistent coaching",
      ],
      parentExplanation:
        "Throwing a baseball uses the entire body in a coordinated sequence called the 'kinetic chain' - power starts from the legs, transfers through the hips and trunk, and finally out through the arm and hand. Proper mechanics not only make throws more accurate and powerful, they also protect your child's arm from injury.\n\nWe focus on several key elements: proper grip (fingers on top of ball, not in palm), arm path (elbow should reach shoulder height), hip rotation (hips turn before shoulders), and follow-through (arm continues across the body after release).\n\nMost importantly, we emphasize ARM CARE. Young arms are still developing and are vulnerable to overuse injuries. We follow research-based guidelines from Little League and MLB's Pitch Smart program. Please support this at home by:\n\n1. Never allowing throwing through pain - pain is a signal to stop\n2. Supporting rest days between throwing activities\n3. Not having your child pitch for multiple teams simultaneously\n4. Limiting pitching and catching positions (both stress the arm)\n5. Encouraging variety in activities rather than year-round baseball\n\nThe goal is a healthy arm that allows your child to enjoy baseball for years to come, whether that's through high school, college, or just recreational play as an adult.",
      homeActivities: [
        "Wall Ball (Mirror Drill): Stand 3-4 feet from wall and throw into it, catching return. Focus on feeling proper arm path. Great for repetitions without needing a partner. Keep throws short - focus on mechanics, not power. (Arm Care: Keep total throws under 25-30. Stop if arm feels tired.)",
        "Towel Drill: Hold a small towel in throwing hand. Go through throwing motion trying to snap the towel at the end. Develops arm speed and proper follow-through without ball stress. (Arm Care: No ball means no arm stress. Good for working on mechanics on rest days.)",
        "Balance Point Holds: Practice lifting leg and holding balance position for 3-5 seconds before stepping to throw. Develops the base of the kinetic chain. Can do without throwing. (Arm Care: Builds leg strength that takes stress off arm. No throwing required.)",
        "4-Seam Grip Practice: Practice finding 4-seam grip quickly. Close eyes, rotate ball, find grip. Make it a game - how fast can you find it? Can you find it 10 times in a row? (Arm Care: No throwing - pure grip work. Great for car rides or TV time.)",
        "Catch with Parent/Sibling: Simple catch develops throwing naturally. Start close (20-30 feet for young players), focus on targets and mechanics. Keep sessions short (10-15 minutes) and fun. (Arm Care: Limit to every other day. Stop if arm feels tired. Quality over quantity. No more than 30-40 throws at this age range.)",
        "Arm Care Stretches: Learn and practice thrower's stretches: sleeper stretch, cross-body stretch, wrist flexor/extensor stretches. Should feel gentle stretch, never pain. (Arm Care: Essential for long-term arm health. Best done after throwing, not before - dynamic warm-up before, static stretching after.)",
      ],
      bestAssessedIn: [
        "Catch play warm-up (early in practice before fatigue)",
        "Target throwing drills",
        "Game situation throws during scrimmages",
      ],
      assessmentFrequency:
        "Informal observation every practice during catch play. Formal mechanical assessment monthly. Arm care check-in at every session.",
      assessmentDuration:
        "5-10 minutes for catch play observation, 5-7 minutes for target throwing, 10-15 minutes for game situation assessment",
    },
  },
  {
    sport: "baseball",
    domain: "technical",
    stage: "fundamentals",
    name: "Catching & Receiving",
    slug: "catching-baseball",
    description:
      "Two-handed catching technique -- glove positioning (fingers up above the belt, fingers down below the belt), tracking the ball all the way into the glove, and the catch-to-transfer separation that turns a catch into a throw. One of USA Baseball LTAD's four core motor competencies for ages 6-8 (throwing, catching, running, hitting -- an unordered set); we introduce it second in our own teaching sequence, right after throwing.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 2,
    progressionLevels: {
      "1": "Catches with body more than glove; flinches or turns away from the ball; traps against chest or uses one hand; frequent drops even on easy tosses",
      "2": "Beginning to track the ball with eyes into the glove; attempts two hands but bare hand arrives late; glove position not adjusted for ball height; more reliable on slow rollers than fly balls",
      "3": "Consistently gets two hands to the glove; correctly flips glove fingers-up above the belt and fingers-down below; tracks moderate-speed throws and grounders; begins separating catch from transfer instead of catching-and-freezing",
      "4": "Smooth catch-to-transfer separation (secures ball, then pulls it to throwing hand); adjusts glove angle instinctively for throw height; catches most throws and balls hit directly at them; recovers from off-target throws",
      "5": "Catches confidently at game speed including throws slightly off-line; transfer is quick enough to support an immediate throw; tracks the ball into the glove under pressure; helps teammates with catching cues",
    },
    observableBehaviors: [
      "Brings glove up (fingers up) for chest-height and higher throws",
      "Brings glove down (fingers down) for waist-height throws and grounders",
      "Uses the bare hand to secure/cover the ball right after it lands in the glove",
      "Watches the ball all the way into the glove instead of looking at the target early",
      "Gives with the glove slightly on contact to absorb the throw",
      "Moves the feet to get the body in front of the ball rather than reaching to the side",
      "Treats the catch and the transfer as two distinct steps, not one motion",
    ],
    commonMistakes: [
      "Basket catching: Catching with the glove palm-up across the body instead of squared to the throw",
      "One-handed catching: Bare hand stays at the side instead of coming in to secure the ball",
      "Turning away: Flinching or turning the head or body away from an incoming ball",
      "Wrong glove angle: Fingers pointed down on a chest-high throw (or up on a grounder), so the ball skips off the glove",
      "Catch-and-freeze: Securing the ball but not moving it toward the throwing hand until told to",
      "Reaching instead of moving the feet: Stabbing at the ball with the glove rather than shuffling the body in front of it",
    ],
    coachingTips: [
      "Is this throw coming above your belt or below? Let's flip your glove to match",
      "Can your bare hand meet the ball right as it lands in your glove? Show me the 'clap'",
      "Where are your eyes right now? Watch the ball all the way into the glove",
      "Can you get your feet moving so the ball meets you in the middle of your body?",
      "Nice catch! Now what's the very next thing your hands do?",
      "If that one got by you, was it your glove angle or your feet? Let's check together",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "catching",
      "glove-work",
      "receiving",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is still learning that the glove -- not the body -- is what catches the ball. Reactions to an incoming ball are often protective (flinching, turning away) rather than technical.",
          observableBehaviors: [
            "Turns body or face away from the incoming ball",
            "Catches (or traps) against the chest instead of in the glove",
            "Uses only the glove hand, bare hand stays down",
            "Drops easy tosses thrown directly to them",
            "Needs the ball tossed very soft and very close to attempt a catch",
          ],
          commonMistakes: [
            "Flinching or turning away from the ball",
            "Trapping the ball against the body instead of catching it in the glove",
            "Closing eyes at the moment of the catch",
          ],
          coachingTips: [
            "Use a soft, oversized, or tennis-type ball so success comes quickly",
            "Toss from very close range and underhand at first",
            "Celebrate every attempt, not just successful catches",
          ],
          assessmentActivities: [
            "Soft-toss catching from 5-8 feet",
            "Observation of willingness to track the ball with the eyes",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player is attempting two-hand mechanics and tracking the ball with their eyes, but glove positioning and timing are still inconsistent.",
          observableBehaviors: [
            "Attempts to bring both hands together but bare hand is late",
            "Tracks the ball with eyes most of the way to the glove",
            "Glove position doesn't always match ball height",
            "Catches slow rollers and soft tosses more reliably than fly balls",
            "Shows less flinching than before",
          ],
          commonMistakes: [
            "Bare hand arrives after the catch instead of with it",
            "Glove fingers pointed the wrong direction for the throw height",
            "Reaches with the glove rather than moving the feet",
          ],
          coachingTips: [
            "Fingers up or fingers down? Call it out before every toss",
            "Let's practice the clap - both hands meet the ball together",
            "Watch it all the way in, even after you know you'll catch it",
          ],
          assessmentActivities: [
            "Two-hand catching drill with call-outs (fingers up/down)",
            "Short-distance catch play with feedback",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player catches consistently with two hands and correct glove position, and is beginning to separate the catch from the transfer.",
          observableBehaviors: [
            "Correctly flips glove fingers-up or fingers-down without reminder",
            "Two hands arrive together on most catches",
            "Tracks moderate-speed throws and grounders reliably",
            "Begins pulling the ball toward the throwing hand after securing it",
            "Recovers from a slightly off-target toss",
          ],
          commonMistakes: [
            "Freezes after the catch instead of starting the transfer",
            "Struggles with throws that arrive off to one side",
            "Transfer speed lags well behind catch consistency",
          ],
          coachingTips: [
            "Nice catch - now what's the very next thing your hands do?",
            "Can you catch and pull it to your throwing hand in one smooth move?",
            "What do you do when the throw isn't right at you?",
          ],
          assessmentActivities: [
            "Catch-and-transfer reps at game speed",
            "Grounder fielding to a target throw",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player has smooth, largely automatic catch-to-transfer mechanics and adjusts glove angle instinctively for the throw.",
          observableBehaviors: [
            "Catch-to-transfer separation is smooth and fast",
            "Adjusts glove angle instinctively without being told",
            "Catches most throws and batted balls hit directly at them",
            "Recovers well from off-line throws",
            "Rarely needs a verbal cue for fingers up/down",
          ],
          commonMistakes: [
            "Occasionally rushes the transfer and bobbles the exchange",
            "May still struggle with true bad-hop grounders",
          ],
          coachingTips: [
            "How quickly can you catch and get rid of it - like there's a runner going?",
            "What's different about how you field a hop versus a line throw?",
          ],
          assessmentActivities: [
            "Game-speed transfer drills",
            "Scrimmage fielding observation",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player catches confidently at game speed, including imperfect throws, and their transfer supports an immediate throw of their own.",
          observableBehaviors: [
            "Catches off-line throws without hesitation",
            "Transfer is fast enough to support a strong throw right after",
            "Tracks the ball into the glove even in pressure situations",
            "Helps teammates with catching cues and glove position",
          ],
          commonMistakes: [
            "May occasionally rush an easy catch out of habit",
          ],
          coachingTips: [
            "How would you help a teammate who's still flinching at the ball?",
            "What's the difference in your catch when there's a play to make after it?",
          ],
          assessmentActivities: [
            "Full scrimmage defensive observation",
            "Peer-coaching observation during catch play",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "USA Baseball LTAD frames catching as one of four core motor competencies (with throwing, running, and hitting) rather than a strict sequence; we introduce it second in our own teaching order, right after throwing. Use soft, oversized, or tennis-type balls at close range so success comes quickly and fear of the ball doesn't take hold. Two-hand catching (fingers up above the belt, fingers down below) is the only technical cue that matters this young -- skip transfer speed entirely and let it develop later.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Catch-to-transfer separation becomes teachable now. Increase throw speed and distance gradually and introduce game-speed catching reps.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Catching should hold up under game pressure and off-line throws. Transfer speed becomes a real differentiator for defensive value; position-specific footwork (e.g., double-play feeds) can be layered on.",
        },
      },
      redFlags: [
        "Persistent flinching or turning away from thrown balls well past the fundamentals stage",
        "Refuses to attempt a catch without extensive coaxing",
        "Consistent one-handed or basket catching that doesn't improve with cueing",
        "Visible fear response (crying, backing away) to routine catch play",
        "No improvement in two-hand mechanics after repeated, patient coaching over several sessions",
      ],
      parentExplanation:
        "Fear of the ball is normal and common at this age -- catching is genuinely the harder half of catch play, since it means letting something come at you rather than sending it away. We build catching in tiny steps: soft balls, short distances, and a simple two-word cue system (fingers up for high throws, fingers down for low ones and grounders).\n\nA properly sized glove matters more than most parents expect -- a glove that's too big or too stiff makes every catch harder. At home, keep it low-pressure: soft tosses, short distances, and lots of praise for trying, not just for catching cleanly.",
      homeActivities: [
        "Two-Hand Catch with a Tennis Ball: Toss a soft tennis ball back and forth from 10-15 feet, calling out 'fingers up!' or 'fingers down!' before each toss so the child pre-sets the glove.",
        "Wall Bounce Catching: Bounce a soft ball off a wall or the ground and catch the rebound -- builds tracking without needing a throwing partner.",
        "Grounder Rolls: Roll (don't throw) a ball along the ground for the child to field with two hands, glove down, body in front of the ball.",
        "Catch & Clap Game: After every catch, call 'clap!' as the cue for the bare hand to meet the ball in the glove -- turns the transfer habit into a game.",
        "Balloon or Beach Ball Catch: For the most hesitant catchers, start with a slow-moving balloon or beach ball to remove all fear before moving to a real ball.",
      ],
      bestAssessedIn: [
        "Catch play warm-up",
        "Soft-toss / short-distance catching drills",
        "Grounder fielding reps",
      ],
      assessmentFrequency:
        "Informal observation every practice during catch play; formal check monthly.",
      assessmentDuration: "5-10 minutes during warm-up catch play",
    },
  },
  {
    sport: "baseball",
    domain: "technical",
    stage: "fundamentals",
    name: "Base Running Basics",
    slug: "base-running",
    description:
      "Running the bases correctly -- knowing which base to run to, running through first base without slowing down, and basic awareness of when to keep going or hold. One of USA Baseball LTAD's four core motor competencies for ages 6-8 (throwing, catching, running, hitting -- an unordered set); we introduce it third in our own teaching sequence.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 3,
    progressionLevels: {
      "1": "Unsure which base to run to; may run to the wrong base or stop partway; needs a coach pointing the direction on every play; wanders rather than taking a direct path",
      "2": "Knows to run to first base after contact; runs the correct direction with an occasional reminder; slows down or stops before reaching the base instead of running through it",
      "3": "Runs directly to first without prompting and runs straight through the bag on a routine play; knows the basic base order (first-second-third-home); starts to recognize that continuing on to second instead calls for a different route -- bowing out with a slight outward angle (banana turn) before the bag -- rather than running straight through",
      "4": "Reads simple situations (ball gets past the fielder = keep going, ball fielded cleanly = stop at the base); rounds bases under control; watches the coach or ball for advance-or-hold cues",
      "5": "Makes smart independent decisions about taking an extra base; uses a proper turn at each bag; picks up signals from a base coach; helps teammates know where to go",
    },
    observableBehaviors: [
      "Runs directly toward first base immediately after contact",
      "Runs through first base without slowing down before the bag",
      "Can state the order of the bases when asked",
      "Looks for the ball or a coach's signal before deciding to advance",
      "When continuing on to second, takes a slight outward angle (banana turn) approaching first instead of running straight through -- a different route than the run-through used on a routine single",
      "Stays inside the running lane / on the direct line to the base",
    ],
    commonMistakes: [
      "Freezing after contact: Standing at home plate watching the hit instead of running",
      "Running to the wrong base: Confusion about which direction is theirs",
      "Slowing before the bag: Decelerating a step or two before first base instead of running through it",
      "Running out of the baseline: Cutting far inside or outside the direct line to the base",
      "Not watching the play: Running with the head down instead of picking up where the ball is",
      "Standing on the bag: Stopping directly on top of the base instead of just beyond it",
      "Wrong route for the situation: Bowing out toward second on a play where they should have run straight through and stopped, or running straight through when they meant to continue on to second -- these are two different, situation-dependent routes, not one combined technique",
    ],
    coachingTips: [
      "As soon as you hit the ball, what's the very first thing your feet should do?",
      "Which base are we running to on this play? Point to it with me",
      "Do we stop on first base or run through it? Show me running through!",
      "Can you find the ball with your eyes while you're running?",
      "What base comes after first? Let's say the order together: first, second, third, home",
      "If the ball gets past the fielder, what should you do next?",
      "Are we stopping at first on this one, or trying to stretch it to second? That decides whether you run straight through or bow outside the line",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "base-running",
      "game-awareness",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player does not yet reliably know where to run. Direction and purpose after contact are unclear without a coach pointing the way.",
          observableBehaviors: [
            "Needs a coach to point toward first base on nearly every at-bat",
            "May run toward the wrong base or stand still after contact",
            "Wanders off the direct line to the base",
            "Loses track of the ball while running",
          ],
          commonMistakes: [
            "Freezing at home plate after contact",
            "Running toward the wrong base",
            "Stopping partway to the bag",
          ],
          coachingTips: [
            "Stand at first base and wave the runner in on every play",
            "Use a cone or bright marker at each base as a visual target",
            "Keep the only rule simple: 'hit it, run to first'",
          ],
          assessmentActivities: [
            "Live at-bats with a coach positioned at first base",
            "Simple 'run to the base' cue drills without contact",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player knows to run to first base but mechanics and confidence around the base itself are still developing.",
          observableBehaviors: [
            "Runs the correct direction with occasional reminders",
            "Slows down before reaching first base rather than running through it",
            "Can name first base as the target but not always the full order",
          ],
          commonMistakes: [
            "Decelerating before the bag",
            "Uncertain about what happens after reaching first",
          ],
          coachingTips: [
            "Do we stop on the base, or run right through it?",
            "Let's practice running through first base without a ball at all",
          ],
          assessmentActivities: [
            "Running-through-first drills (no ball)",
            "Live at-bats with feedback after each",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player runs to first without prompting, runs straight through the bag on a routine play, and knows the base order. Starting to recognize that continuing to second calls for a different route than stopping at first.",
          observableBehaviors: [
            "Runs directly to first without a reminder",
            "Runs through the bag consistently on a routine play",
            "States the base order correctly",
            "Begins bowing out with a slight angle before the bag when continuing to second, instead of running straight through",
          ],
          commonMistakes: [
            "Still uncertain when to hold versus advance further",
            "Uses the wrong route for the situation -- bows out when they should have run straight through and stopped, or vice versa",
          ],
          coachingTips: [
            "What tells you whether to stop at first or keep going?",
            "If we're stretching this to second, do we run straight through the bag or bow outside the line?",
          ],
          assessmentActivities: [
            "Live at-bats focused on the turn toward second",
            "Simple advance-or-hold scenario reps",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player reads simple game situations and rounds bases under control, watching for cues from the ball or coach.",
          observableBehaviors: [
            "Reads whether the ball got past the fielder",
            "Rounds bases under control, not out of control",
            "Watches the coach or ball for advance/hold decisions",
          ],
          commonMistakes: [
            "Occasionally over-aggressive on a close read",
            "May not pick up a coach's signal in time",
          ],
          coachingTips: [
            "What did you see that made you decide to keep going?",
            "How do you find the coach's signal without slowing down?",
          ],
          assessmentActivities: [
            "Scrimmage base running with live reads",
            "Coach-signal recognition drills",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player makes smart, largely independent base running decisions and helps teammates with directional awareness.",
          observableBehaviors: [
            "Takes smart extra bases on clear reads",
            "Uses a proper turn at each bag",
            "Reliably picks up base coach signals",
            "Helps younger or newer teammates know where to go",
          ],
          commonMistakes: ["May occasionally be too aggressive on a borderline read"],
          coachingTips: [
            "How would you explain 'where to go' to a brand-new teammate?",
            "What's the risk/reward on that extra base you took?",
          ],
          assessmentActivities: [
            "Full scrimmage observation",
            "Peer-teaching observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "USA Baseball LTAD frames running as one of four core motor competencies (with throwing, catching, and hitting) rather than a strict sequence; we introduce it third in our own teaching order. Keep the rules minimal: which base, and running through first base -- nothing more. Most confusion at this age is directional, not physical; a cone or a coach standing at the base to point the way solves most of it. 'Run the Bases' style cue games work better than isolated running drills.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Introduce the full base order, tag-up basics, and simple advance/hold reads. Live-game reps matter more than drills now.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Base running becomes a skill that can create real advantages -- secondary leads, reading the ball off the bat, and coach signals belong here.",
        },
      },
      redFlags: [
        "Consistently runs to the wrong base after repeated, patient correction",
        "Freezes at home plate on contact more often than not, well past the fundamentals stage",
        "Unable to state the order of the bases after a full season of exposure",
        "Shows anxiety severe enough to avoid batting because of what happens after contact",
      ],
      parentExplanation:
        "At this age the only rule that matters is 'hit it, run to first, and run through the base.' Everything else -- tagging up, advancing on a passed ball, reading the outfield -- comes later. Most of what looks like a running mistake at 6-8 is really a directional mix-up, not a running-ability problem, so a visible marker at first base and a coach pointing the way solves it quickly. At home, simple games that make 'find the right base' fun (rather than lecturing about rules) build this skill fastest.",
      homeActivities: [
        "Run the Bases Cue Game: Set up cones or markers as bases in the yard and call out 'go!' after a toss or hit, cueing which direction to run -- an adapted version of the classic Run-the-Bases game.",
        "Through-the-Bag Sprints: Practice running full speed through a marker (not stopping on it) from about 40 feet away, focusing purely on not decelerating early.",
        "Base Order Chant: Say the base order together (first, second, third, home) as a rhythm or chant during car rides or downtime.",
        "Freeze & Point: Play catch or hit off a tee, then freeze and have the child point to the correct base before running -- separates the decision from the sprint.",
      ],
      bestAssessedIn: [
        "Live at-bats during scrimmages",
        "Run the Bases cue games",
        "Base running relay drills",
      ],
      assessmentFrequency: "Informal observation every scrimmage; formal check per season.",
      assessmentDuration: "5-10 minutes of live base running observation",
    },
  },
  {
    sport: "baseball",
    domain: "technical",
    stage: "fundamentals",
    name: "Hitting Off the Tee",
    slug: "hitting-off-tee",
    description:
      "The fundamental swing mechanics for hitting a stationary ball off a batting tee -- stance, grip, level swing path, and contact point -- the entry point for hitting before live pitching is introduced. One of USA Baseball LTAD's four core motor competencies for ages 6-8 (throwing, catching, running, hitting -- an unordered set); we introduce it last in our own teaching sequence.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 4,
    progressionLevels: {
      "1": "Grip and stance need constant resetting; swing is a downward chop or an upward scoop; frequently misses the ball entirely or tops it; no consistent contact point",
      "2": "Holds a stance and grip with occasional reminders; swing path is inconsistent but contact is more frequent; tee height often causes popping up or chopping down",
      "3": "Consistent stance and two-hand grip; swing path is mostly level; makes contact reliably when the tee is set at the correct height; begins driving the ball rather than just tapping it",
      "4": "Level, repeatable swing with good hip/trunk rotation; consistent hard contact; adjusts stance and tee height appropriately; tracks the ball to the contact point",
      "5": "Consistent, powerful, level swing with good extension; drives the ball to all fields off the tee; mechanics transfer visibly to soft-toss and early live pitching work",
    },
    observableBehaviors: [
      "Sets an athletic, balanced stance with feet about shoulder width apart",
      "Uses a proper two-hand grip on an appropriately sized bat",
      "Keeps eyes on the ball through the point of contact",
      "Swings on a level path rather than chopping down or scooping up",
      "Rotates hips and trunk through the swing rather than swinging with arms alone",
      "Makes contact at a consistent point out in front of the body",
    ],
    commonMistakes: [
      "Dropping the back shoulder: Swinging up and under the ball instead of level, causing pop-ups",
      "Chopping down: Swinging down on top of the ball, causing weak grounders",
      "Stepping out (bailing): Front foot steps away from the plate instead of toward the pitcher",
      "Arms-only swing: No hip or trunk rotation powering the swing",
      "Flinching at contact: Closing the eyes or pulling the head away right before the bat meets the ball",
      "Wrong tee height: Tee set too high or low for the player, forcing a bad swing path to reach it",
    ],
    coachingTips: [
      "Can you show me your ready stance before every swing?",
      "Is the tee at your belt? Let's check the height together",
      "Where are your eyes right now - can you watch the ball all the way to the bat?",
      "Does your swing feel like it's going straight across, or up and down?",
      "What moves first in your swing - your hips or your hands?",
      "That one popped up - was the tee too high, or did your back shoulder drop?",
    ],
    tags: [
      "core",
      "technical",
      "fundamental",
      "hitting",
      "tee-work",
      "swing-mechanics",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is learning the basic stance, grip, and idea of swinging at a stationary ball. Contact is inconsistent and mechanics are still being formed.",
          observableBehaviors: [
            "Stance and grip need resetting before most swings",
            "Swing path is a chop or a scoop rather than level",
            "Frequently misses the ball or tops it weakly",
            "Little to no hip involvement in the swing",
          ],
          commonMistakes: [
            "Chopping down on the ball",
            "Dropping the back shoulder and swinging up",
            "Closing eyes or flinching at contact",
          ],
          coachingTips: [
            "Use a lighter, appropriately sized bat so mechanics aren't fighting equipment",
            "Set the tee at belt height and keep reminding gently, not correcting every swing",
            "Celebrate solid contact, not just where the ball goes",
          ],
          assessmentActivities: [
            "Tee work with a soft or reduced-injury ball",
            "Simple stance/grip check before swings",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player holds a stance and grip with occasional reminders and makes contact more often, though the swing path is still inconsistent.",
          observableBehaviors: [
            "Holds stance and grip with occasional correction",
            "Contact is more frequent but inconsistent in quality",
            "Tee height issues (too high/low) still cause mis-hits",
          ],
          commonMistakes: [
            "Tee set at the wrong height for the player",
            "Stepping out toward the dugout instead of the pitcher",
          ],
          coachingTips: [
            "Let's check the tee height together before we start",
            "Where's your front foot stepping - toward me, or away?",
          ],
          assessmentActivities: [
            "Tee work with height-adjustment checks",
            "Stance/stride observation over several swings",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player has a consistent stance and grip, a mostly level swing path, and reliable contact at the correct tee height.",
          observableBehaviors: [
            "Consistent stance and two-hand grip without reminders",
            "Swing path is mostly level",
            "Makes contact reliably at correct tee height",
            "Beginning to drive the ball rather than just tap it",
          ],
          commonMistakes: [
            "Occasional pop-ups on a slightly high tee",
            "Swing power still mostly from arms",
          ],
          coachingTips: [
            "What's different about your swing when you really drive the ball?",
            "Let's add a little hip turn and see what happens to your contact",
          ],
          assessmentActivities: [
            "Tee work focused on contact quality, not just contact",
            "Live-look comparison: tee vs. soft toss",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player has a level, repeatable swing with good rotation and consistently hard contact, adjusting the tee and stance appropriately.",
          observableBehaviors: [
            "Level, repeatable swing path",
            "Good hip and trunk rotation powering the swing",
            "Consistent hard contact",
            "Adjusts stance and tee height without being told",
          ],
          commonMistakes: [
            "May start rushing the swing when trying to hit harder",
          ],
          coachingTips: [
            "What does a smooth, unrushed swing feel like versus a rushed one?",
            "How does this swing transfer to when the ball is tossed instead of on a tee?",
          ],
          assessmentActivities: [
            "Tee-to-soft-toss transition work",
            "Contact-quality tracking over multiple sessions",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player has a consistent, powerful, level swing with good extension, driving the ball to all fields off the tee, with mechanics that visibly transfer to live pitching work.",
          observableBehaviors: [
            "Consistent, powerful, level swing with extension",
            "Drives the ball to all fields off the tee",
            "Mechanics hold up moving from tee to soft toss to early live pitching",
          ],
          commonMistakes: ["May need reminders to stay balanced against faster pitching"],
          coachingTips: [
            "What carries over from your tee swing to hitting a moving ball?",
            "How would you help a teammate whose swing chops down on the ball?",
          ],
          assessmentActivities: [
            "Tee-to-live-pitch mechanics comparison",
            "Peer-coaching observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "We introduce hitting last in our own teaching sequence at this age -- USA Baseball LTAD frames it as one of four core motor competencies (with throwing, catching, and running) rather than a strict order, but throwing and catching reps are easy to lose to hitting time if a coach isn't deliberate about protecting them. Use an appropriately sized, lightweight bat and a soft or reduced-injury ball so mechanics aren't fighting equipment. Set the tee at belt height as the default and keep the only real coaching point simple: swing level. Skip live pitching entirely at this age; tee and soft toss are the whole diet.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Swing mechanics become more coachable now -- rotation, hip involvement, and contact point can be layered in. Begin blending tee work with soft toss and, later in the band, slow live pitching.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Mechanics should transfer from tee work to live pitching. Focus shifts to timing, pitch recognition, and maintaining mechanics against game-speed pitching.",
        },
      },
      redFlags: [
        "No improvement in consistent contact after many sessions of patient tee work",
        "Persistent flinching or eye-closing at contact well past the fundamentals stage",
        "Refuses to swing or shows anxiety specifically around batting",
        "Equipment (bat weight/length) clearly mismatched to the player and not addressed",
      ],
      parentExplanation:
        "Tee work is where every hitter starts -- it isolates the swing from the added challenge of timing a moving ball. The single biggest lever at this age is equipment fit: a bat that's too heavy or too long forces bad mechanics no matter how well a child is coached, and a tee set at the wrong height (it should sit around belt height) causes most pop-ups and weak grounders. At home, keep it simple: a level swing, a comfortable stance, and lots of low-pressure reps with a soft ball.",
      homeActivities: [
        "Tee Work in the Yard/Garage: Short daily sessions (10-15 swings) with a soft or reduced-injury ball, focused only on a level swing path.",
        "Tape-Line Stance Check: Put a strip of tape or chalk on the ground to mark foot position so the stance resets consistently every time.",
        "Freeze-Swing Drill: Have the child stop mid-swing at the point of contact and check bat position, hip rotation, and eye focus.",
        "Height-Check Game: Let the child adjust the tee themselves before each round and explain why they picked that height -- builds ownership of the fundamentals.",
      ],
      bestAssessedIn: [
        "Regular tee work during practice",
        "Tee-to-soft-toss transition drills",
        "Contact-quality tracking over a season",
      ],
      assessmentFrequency: "Every practice during batting stations; formal check monthly.",
      assessmentDuration: "5-10 minutes of tee work observation",
    },
  },
  {
    sport: "baseball",
    domain: "technical",
    stage: "skill-building",
    name: "Fielding Ground Balls",
    slug: "fielding-ground-balls",
    description:
      "Getting the body in front of a ground ball, fielding it with two hands out in front in a ready position, and squaring up to make an accurate throw -- the readiness skill that turns a catch into a defensive out.",
    introductionAge: 7,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 5,
    progressionLevels: {
      "1": "Waits for the ball rather than moving to it; fields (or misses) off to one side of the body; stands upright with a stiff, high glove instead of getting low",
      "2": "Begins moving the feet toward the ball; gets the glove down but often not far enough in front of the body; inconsistent about squaring the shoulders to the target after fielding",
      "3": "Gets in front of most ground balls hit directly at them; fields with two hands and a low, ready position; begins the throwing footwork (shuffle/crow-hop) after fielding",
      "4": "Reads the hop and adjusts footwork to balls hit to either side; smooth field-to-throw transition; low, athletic ready position becomes the default rather than an effort",
      "5": "Fields balls hit well to either side with confident range and footwork; transitions to an accurate throw with minimal wasted motion; helps teach ready position to less experienced fielders",
    },
    observableBehaviors: [
      "Gets into a low, athletic ready position before the ball is put in play",
      "Moves the feet to get the body in front of the ball rather than reaching",
      "Fields with two hands, glove out in front, fingers down",
      "Watches the ball into the glove rather than looking up early",
      "Squares shoulders toward the target after fielding, before throwing",
      "Uses proper footwork (shuffle or crow-hop) to transition from fielding to throwing",
    ],
    commonMistakes: [
      "Standing tall: Fielding from an upright stance instead of a low, athletic position",
      "Reaching to the side: Stabbing at the ball with the glove instead of moving the feet in front of it",
      "Peeking up early: Looking toward the target before the ball is secured, causing it to skip under the glove",
      "One-handed pickup: Glove only, no bare-hand support on the field",
      "Rushed throw: Throwing before squaring up, causing wild or weak throws",
      "Playing it safe on hops: Freezing rather than committing to charge a slow roller or backing off a big hop",
    ],
    coachingTips: [
      "Show me your ready position before the ball is even hit",
      "Can you get your feet moving so the ball meets you in front of your body?",
      "Where are your eyes right now? Watch it all the way into the glove",
      "What's the first thing your feet do after you field it?",
      "Was that throw rushed, or did you get squared up first?",
      "On a big hop like that, do we charge it or wait for it to come down?",
    ],
    tags: [
      "core",
      "technical",
      "skill-building",
      "fielding",
      "ground-balls",
      "infield",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is still learning to move toward a ground ball rather than waiting for it, and often fields from an upright, unready stance.",
          observableBehaviors: [
            "Waits for the ball to arrive rather than moving toward it",
            "Fields off to one side of the body",
            "Stands upright with a stiff, high glove",
          ],
          commonMistakes: [
            "Standing tall instead of getting low",
            "Reaching to the side instead of moving the feet",
          ],
          coachingTips: [
            "Use slow rolls, not hard hits, so there's time to react",
            "Model the low ready position and have them mirror it before every rep",
          ],
          assessmentActivities: [
            "Slow-roll fielding reps directly at the player",
            "Ready-position check before each roll",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player is beginning to move toward the ball and get the glove down, though positioning in front of the body and the throwing transition are inconsistent.",
          observableBehaviors: [
            "Moves feet toward the ball with some consistency",
            "Gets the glove down but not always far enough in front",
            "Squaring to the target after fielding is inconsistent",
          ],
          commonMistakes: [
            "Glove too close to the body instead of out in front",
            "Forgets to square up before throwing",
          ],
          coachingTips: [
            "Can you get the glove out in front, away from your feet?",
            "After you field it, what do your shoulders need to do?",
          ],
          assessmentActivities: [
            "Moderate-speed ground ball reps with a target throw",
            "Field-and-square drills",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player gets in front of most ground balls hit directly at them and is starting to add proper throwing footwork after the field.",
          observableBehaviors: [
            "Gets in front of most balls hit directly at them",
            "Fields with two hands in a low, ready position",
            "Begins shuffle/crow-hop footwork into the throw",
          ],
          commonMistakes: [
            "Struggles more with balls hit to either side",
            "Footwork into the throw still a bit slow",
          ],
          coachingTips: [
            "What changes when the ball is hit a step to your left or right?",
            "Let's speed up that shuffle into your throw",
          ],
          assessmentActivities: [
            "Ground balls hit slightly left/right of the fielder",
            "Field-to-throw timed reps",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player reads the hop, adjusts footwork for balls to either side, and has a smooth field-to-throw transition as the default, not an effort.",
          observableBehaviors: [
            "Reads the hop and adjusts footwork accordingly",
            "Smooth, largely automatic field-to-throw transition",
            "Low, athletic ready position is now the default",
          ],
          commonMistakes: [
            "May occasionally misjudge a bad hop under game pressure",
          ],
          coachingTips: [
            "What did that hop tell you about how to adjust?",
            "How does your prep change with a runner going versus not?",
          ],
          assessmentActivities: [
            "Bad-hop reaction drills",
            "Scrimmage infield defense observation",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player fields with confident range to either side and transitions to an accurate throw with minimal wasted motion, and can teach ready position to newer players.",
          observableBehaviors: [
            "Confident range to either side",
            "Minimal wasted motion from field to throw",
            "Can explain and demonstrate ready position to others",
          ],
          commonMistakes: ["May occasionally over-rush an easy, routine play"],
          coachingTips: [
            "How would you teach ready position to a first-year player?",
            "What's the tempo difference between a routine play and a close one?",
          ],
          assessmentActivities: [
            "Full scrimmage infield defense observation",
            "Peer-teaching observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1 (introductory only)",
          notes:
            "Ground ball fielding asks for more coordination and sequencing (get low, field, square, throw) than most 6-8s can reliably chain together -- this skill is best introduced late in this band or held for skill-building, using very slow rolls and games like 'Defend the Castle' rather than technical drilling.",
        },
        ages9to11: {
          typicalLevel: "1-3",
          notes:
            "This is the core window for building ground ball mechanics -- ready position, two-hand fielding, and the field-to-throw transition all become teachable and improvable with repetition.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Range to either side, bad-hop reactions, and quick transitions become the focus as ball speed off the bat increases. Position-specific footwork can be introduced.",
        },
      },
      redFlags: [
        "Consistently flinches or backs away from ground balls rather than fielding them",
        "No improvement in getting the glove out in front of the body after extended coaching",
        "Avoids infield positions or drills specifically due to fear of the ball",
        "Persistent one-handed fielding that doesn't respond to cueing",
      ],
      parentExplanation:
        "Fielding a ground ball chains several small skills together -- get low, get in front of it, use two hands, then turn and throw. That's a lot for a young player to sequence, so we build it in slow layers: first just getting low and in front (no glove pressure), then adding the two-hand catch, then adding the throw. Slow rolls at home are more useful than hard-hit grounders while this is being learned.",
      homeActivities: [
        "Slow Roll Fielding: Roll (don't throw or hit) a ball for the child to field with two hands from a low ready position, no throw required yet.",
        "Defend the Castle: Set up a small target ('castle') behind the fielder and roll balls that must be fielded before they reach it -- an adapted fielding-readiness game.",
        "Ready Position Freeze: Practice snapping into the low, athletic ready position on a 'go!' cue, without a ball at all, to build the habit.",
        "Field-and-Point: After fielding a slow roll, have the child point their glove and body at an imaginary target before adding an actual throw.",
      ],
      bestAssessedIn: [
        "Ground ball fielding drills",
        "Infield stations during practice",
        "Scrimmage defensive plays",
      ],
      assessmentFrequency: "Every practice during infield work; formal check monthly.",
      assessmentDuration: "5-10 minutes of fielding reps",
    },
  },
  {
    sport: "baseball",
    domain: "tactical",
    stage: "fundamentals",
    name: "Field Positioning & Where to Go",
    slug: "field-positioning-baseball",
    description:
      "Knowing where to stand on defense and where to move before and after the ball is put in play -- the minimal, rules-light tactical foundation for young players: know your spot, and know which base to cover or back up.",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 6,
    progressionLevels: {
      "1": "Doesn't know their defensive spot without being walked there; wanders off position during play; unaware there's anywhere else to be",
      "2": "Finds and holds their assigned spot with occasional reminders; still needs to be told where to go when the ball is hit elsewhere",
      "3": "Holds position reliably; moves toward the ball when it's hit near them; beginning to understand covering a nearby base",
      "4": "Positions appropriately before the pitch based on the situation; moves to back up a play or cover a base without being told every time",
      "5": "Consistently in the right place before and after contact across different situations; anticipates where they're needed; helps position less experienced teammates",
    },
    observableBehaviors: [
      "Stands in their assigned defensive spot before the pitch",
      "Moves toward the ball when it is hit in their area",
      "Moves to back up a nearby play when appropriate",
      "Returns to position after each play without being re-directed",
      "Can point to or name their spot when asked",
      "Recognizes when they should cover a base that another fielder has vacated",
    ],
    commonMistakes: [
      "Ball-watching from the wrong spot: Standing far from their position to watch the play instead of holding their spot",
      "Freezing when the ball isn't hit to them: Not knowing there's a job to do (back up, cover) when they aren't the primary fielder",
      "Drifting during the game: Slowly wandering out of position between pitches",
      "Bunching up: Multiple fielders converging on one spot instead of spreading to cover the field",
      "Not returning to position: Staying near where the last play happened instead of resetting",
    ],
    coachingTips: [
      "Where's your spot? Can you show me before every pitch?",
      "The ball wasn't hit to you - what's your job right now?",
      "If your teammate leaves first base to field this, who covers it?",
      "Let's reset - where do you go after every single play?",
      "Are we bunched up together, or spread out to cover the field?",
    ],
    tags: [
      "core",
      "tactical",
      "fundamental",
      "positioning",
      "field-awareness",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player does not yet reliably know their defensive spot and needs to be physically walked there or reminded on nearly every play.",
          observableBehaviors: [
            "Needs to be walked to their spot before most plays",
            "Wanders away from position during live play",
            "Doesn't yet understand that different spots exist for a reason",
          ],
          commonMistakes: [
            "Standing far from assigned spot to watch the play",
            "No awareness of a job when the ball isn't hit to them",
          ],
          coachingTips: [
            "Use a cone, chalk mark, or hula hoop to mark each fielder's spot",
            "Keep it to one job per player: 'stand here until the ball comes to you'",
          ],
          assessmentActivities: [
            "Marked-spot fielding drills",
            "Simple positional walk-throughs before scrimmage",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player finds and holds their spot with occasional reminders but still needs direction when the ball is hit elsewhere.",
          observableBehaviors: [
            "Holds assigned spot with occasional reminders",
            "Needs direction when the ball goes to another area",
          ],
          commonMistakes: [
            "Drifts out of position between pitches",
            "Doesn't yet move to back up nearby plays",
          ],
          coachingTips: [
            "Where do you go if the ball doesn't come to you?",
            "Let's practice resetting to your spot after every play",
          ],
          assessmentActivities: [
            "Positional reset drills between reps",
            "Live scrimmage observation with light coaching",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player holds position reliably, moves toward balls hit near them, and is beginning to understand covering a nearby base.",
          observableBehaviors: [
            "Reliably holds assigned spot",
            "Moves toward the ball when hit nearby",
            "Beginning to cover a nearby base when appropriate",
          ],
          commonMistakes: [
            "Covering assignments still need a verbal reminder",
          ],
          coachingTips: [
            "Your teammate just left first base - who covers it now?",
            "Nice job holding your spot - what's next if the ball comes your way?",
          ],
          assessmentActivities: [
            "Live scrimmage with backing-up scenarios",
            "Simple cover-the-base reps",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player positions appropriately before the pitch based on the situation and moves to back up or cover without being told every time.",
          observableBehaviors: [
            "Adjusts positioning before the pitch based on the situation",
            "Moves to back up a play unprompted",
            "Covers a vacated base without being told",
          ],
          commonMistakes: [
            "May occasionally misread which situation calls for which adjustment",
          ],
          coachingTips: [
            "What made you move over before that pitch?",
            "How did you know you needed to back that play up?",
          ],
          assessmentActivities: [
            "Scrimmage positioning observation across situations",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player is consistently in the right place before and after contact across different situations, anticipates needs, and helps position teammates.",
          observableBehaviors: [
            "Anticipates where they're needed before the play develops",
            "Consistently correct positioning across varied situations",
            "Helps direct less experienced teammates to their spots",
          ],
          commonMistakes: ["Occasionally over-anticipates and moves too early"],
          coachingTips: [
            "How would you explain positioning to a brand-new teammate?",
            "What tips you off early that you'll need to cover or back up?",
          ],
          assessmentActivities: [
            "Full scrimmage observation",
            "Peer-teaching observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Keep positioning rules deliberately minimal at this age -- per the brief's keep-rules-minimal principle, 'where to stand' is one of the only three things that matter tactically (alongside which base and what an out is). A physical marker (cone, hoop) at each spot does more than verbal explanation.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Backing up plays and covering vacated bases become teachable concepts. Positioning starts to shift slightly based on the batter or situation.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Positioning becomes situational -- depth and angle adjustments based on the count, score, and batter tendencies can be introduced.",
        },
      },
      redFlags: [
        "Unable to find or hold their defensive spot after a full season of repetition",
        "No awareness of having a defensive job when the ball isn't hit to them, well past the fundamentals stage",
        "Consistent bunching with teammates despite repeated, patient coaching",
      ],
      parentExplanation:
        "At this age, defensive positioning is kept intentionally simple: know your spot, and know that if the ball isn't hit to you, you might still have a job (backing up a play, covering a base). We use visual markers like cones so kids don't have to remember an abstract rule -- they just go stand by their cone. This is one of only a few tactical rules we teach at this age, on purpose.",
      homeActivities: [
        "Spot-the-Cone Game: Set up cones in the yard representing field positions and practice running to the correct one on a call-out.",
        "Backup Buddy: Practice the idea of 'if your friend leaves their spot, someone covers it' using a simple two-person yard game.",
        "Freeze & Point: Freeze play at random moments and have the child point to where they should be standing right now.",
      ],
      bestAssessedIn: [
        "Scrimmage defensive positioning",
        "Marked-spot fielding drills",
        "Backing-up and covering reps",
      ],
      assessmentFrequency: "Every scrimmage; formal check per season.",
      assessmentDuration: "5-10 minutes of positional observation during live play",
    },
  },
  {
    sport: "baseball",
    domain: "tactical",
    stage: "fundamentals",
    name: "Situational Awareness (Outs & Bases)",
    slug: "situational-awareness-baseball",
    description:
      "Understanding the small set of rules that matter at this age -- how many outs there are, what counts as an out, and which base a batted or thrown ball is going to -- so players can react to the game instead of freezing or asking a coach on every play.",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 7,
    progressionLevels: {
      "1": "Doesn't track outs or know what counts as one; unaware of which base a play is developing toward; relies entirely on a coach to say what to do",
      "2": "Can state what an out is when asked but doesn't track the count during play; recognizes 'we got him out' after the fact but not the live situation",
      "3": "Tracks the out count during a game with occasional reminders; understands the basic idea of a force play; knows which base a routine play is going to",
      "4": "Tracks outs independently; recognizes force versus tag situations in simple terms; reacts appropriately to the live situation without a coach prompt",
      "5": "Fully tracks game situation (outs, baserunners, which play is live) and communicates it to teammates; anticipates what happens next before the ball is put in play",
    },
    observableBehaviors: [
      "Can state the current number of outs when asked",
      "Knows what counts as an out (caught fly ball, tag, force at a base, strikeout)",
      "Identifies which base a batted or thrown ball is headed toward",
      "Reacts to the situation (e.g., which base to throw to) rather than needing to be told every time",
      "Communicates the situation to teammates ('one out!', 'force at second!') as understanding develops",
    ],
    commonMistakes: [
      "Losing track of outs: Not knowing how many outs there are mid-inning",
      "Confusing force and tag plays: Trying to tag a base runner on a force-out situation or vice versa",
      "Freezing on a live ball: Not knowing where to throw because the situation wasn't processed in time",
      "Celebrating too early: Assuming a play is over before the ball is dead",
      "Needing a coach's call on every routine play: Relying on outside direction rather than reading the simple, known rules",
    ],
    coachingTips: [
      "How many outs are there right now? Let's check together",
      "Was that an out because of a tag, or because it was a force play?",
      "If the ball is hit to you right now, where's the play?",
      "Can you call out the number of outs to your teammates?",
      "What's still live right now - is the play over or not?",
    ],
    tags: [
      "core",
      "tactical",
      "fundamental",
      "game-awareness",
      "rules-literacy",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player does not yet track outs or understand what constitutes one, and relies entirely on the coach to direct every play.",
          observableBehaviors: [
            "Cannot state the current out count",
            "Doesn't recognize what just happened as an out",
            "Needs full direction from a coach on every live-ball situation",
          ],
          commonMistakes: [
            "No awareness of the out count during play",
            "Confusion about whether a play is still live",
          ],
          coachingTips: [
            "Keep the rules to exactly three things: outs, which base, what's an out",
            "Call out the out count loudly and often as a model",
          ],
          assessmentActivities: [
            "Simple out-count check-ins during scrimmage",
            "Post-play 'was that an out?' quiz",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player can define an out when asked directly but doesn't yet track the live count or situation during play.",
          observableBehaviors: [
            "Can define what an out is when asked",
            "Recognizes an out after the fact but not in real time",
          ],
          commonMistakes: [
            "Doesn't track the count as the inning goes on",
            "Still relies on a coach's call for where the play is going",
          ],
          coachingTips: [
            "Let's count together out loud after every out",
            "Where do you think this ball is going before it's even hit?",
          ],
          assessmentActivities: [
            "Out-count tracking prompts during scrimmage",
            "Simple 'which base' prediction game before a pitch",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player tracks outs with occasional reminders, understands basic force plays, and knows which base a routine play is headed to.",
          observableBehaviors: [
            "Tracks the out count with occasional reminders",
            "Understands the basic idea of a force play",
            "Knows which base a routine ball is going to",
          ],
          commonMistakes: [
            "Occasionally mixes up force versus tag situations",
          ],
          coachingTips: [
            "Was that a force, or did we need to tag the runner?",
            "How many outs now, and what changes with the next play?",
          ],
          assessmentActivities: [
            "Live scrimmage situational quizzing",
            "Force-vs-tag scenario walkthroughs",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player independently tracks outs, recognizes force versus tag situations, and reacts appropriately to the live situation without a coach prompt.",
          observableBehaviors: [
            "Tracks outs independently",
            "Distinguishes force versus tag situations",
            "Reacts to the live situation without being told",
          ],
          commonMistakes: [
            "May occasionally misjudge a more complex situation",
          ],
          coachingTips: [
            "What told you that was a force play and not a tag?",
            "How did you know where to go with that ball before it was hit?",
          ],
          assessmentActivities: [
            "Scrimmage situational observation",
            "Live-ball decision reps",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player fully tracks the game situation and communicates it to teammates, anticipating what happens next before the ball is put in play.",
          observableBehaviors: [
            "Tracks outs, baserunners, and live situation fully",
            "Communicates the situation to teammates proactively",
            "Anticipates the next play before it develops",
          ],
          commonMistakes: ["May over-communicate in low-stakes moments"],
          coachingTips: [
            "How would you explain 'what's live right now' to a new teammate?",
            "What are you thinking about before this next pitch?",
          ],
          assessmentActivities: [
            "Full scrimmage situational leadership observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Per the brief's keep-rules-minimal principle, this age band should learn exactly three things: which base to run to, where to stand, and what an out is -- everything else (force vs. tag nuance, infield fly, etc.) is unnecessary noise. Teach it through repetition and coach narration during live play, not lecture.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Force versus tag distinctions and out-count tracking become teachable and expected. This is a good age to start asking players to call out the situation themselves.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Full situational awareness (outs, runners, count, defensive alignment) should be developing. Players can begin anticipating plays before they happen.",
        },
      },
      redFlags: [
        "Cannot state the out count after being asked repeatedly across a season",
        "Persistent confusion about what constitutes an out well past the fundamentals stage",
        "Consistently unaware the ball is still live after a play",
      ],
      parentExplanation:
        "We intentionally keep game rules simple at this age -- your child only needs to know three things: which base to run to, where to stand on defense, and what counts as an out. Trying to teach infield-fly rules or force-versus-tag nuance to a 6-8-year-old adds noise without adding understanding. At home, the best thing you can do is narrate simply during games ('that's one out now') rather than explaining every rule in detail.",
      homeActivities: [
        "Count-the-Outs Game: While watching or playing catch, practice counting out loud together every time a hypothetical out happens.",
        "What's an Out? Flashcards: Simple picture or phrase cards (caught fly ball, tag, strikeout, force at base) to reinforce the concept away from the field.",
        "Freeze & Ask: During backyard play, freeze the action and ask 'how many outs?' or 'which base is this going to?'",
      ],
      bestAssessedIn: [
        "Live scrimmage situational check-ins",
        "Post-play quick quizzes",
        "Game observation over a season",
      ],
      assessmentFrequency: "Every scrimmage; informal check-ins throughout.",
      assessmentDuration: "5 minutes of situational quizzing during a scrimmage",
    },
  },
  {
    sport: "baseball",
    domain: "physical",
    stage: "fundamentals",
    name: "Speed & Agility",
    slug: "speed-agility-baseball",
    description:
      "General running speed, quick first-step acceleration, and change-of-direction ability applied to baseball -- sprinting to first base, breaking on a batted ball, and changing direction to field or cover a base.",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 8,
    progressionLevels: {
      "1": "Slow to react and get moving; runs with an inefficient or stiff stride; struggles to change direction without stopping fully first",
      "2": "Reacts to a cue with a short delay; developing a more efficient running stride; can change direction but loses significant speed doing so",
      "3": "Quick, consistent first-step reaction; efficient running stride over short distances; changes direction with only modest speed loss",
      "4": "Fast first-step reaction; efficient acceleration to top short-distance speed; changes direction fluidly with minimal speed loss",
      "5": "Elite first-step quickness and acceleration for their age group; changes direction explosively; applies speed and agility instinctively to game situations",
    },
    observableBehaviors: [
      "Reacts quickly to a starting cue (pitch, batted ball, coach signal)",
      "Uses an efficient running stride (arms and legs working together, not stiff or flailing)",
      "Accelerates smoothly rather than needing several steps to get up to speed",
      "Changes direction with bent knees and a low center of gravity rather than stopping upright first",
      "Maintains balance and control while decelerating and redirecting",
    ],
    commonMistakes: [
      "Slow reaction: Standing flat-footed for a beat before starting to move",
      "Stiff, upright running: Running tall with short, choppy steps instead of a relaxed, efficient stride",
      "Full stop before changing direction: Coming to a complete stop rather than redirecting with bent knees",
      "Overstriding: Reaching too far with each step, which slows acceleration",
      "Losing balance on cuts: Falling or stumbling when changing direction quickly",
    ],
    coachingTips: [
      "What's the very first move your body makes when you hear 'go'?",
      "Can you feel your arms and legs working together as you run?",
      "When you need to change direction, do you stop first, or bend and go?",
      "Let's practice quick, small steps to get moving faster",
      "How did you stay balanced on that quick turn?",
    ],
    tags: [
      "core",
      "physical",
      "fundamental",
      "speed",
      "agility",
      "athleticism",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is slow to react to a starting cue and runs with an inefficient stride; changing direction usually means stopping fully first.",
          observableBehaviors: [
            "Noticeable delay before starting to move on a cue",
            "Stiff, choppy running stride",
            "Stops completely before attempting to change direction",
          ],
          commonMistakes: [
            "Flat-footed reaction to the starting cue",
            "Coming to a full stop before redirecting",
          ],
          coachingTips: [
            "Use fun reaction games (freeze tag style) rather than isolated sprint drills",
            "Model a relaxed, arm-driven running stride for them to copy",
          ],
          assessmentActivities: [
            "Reaction-and-sprint games from a stationary start",
            "Simple change-of-direction tag games",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player reacts to a cue with a short delay and is developing a more efficient stride, but loses significant speed changing direction.",
          observableBehaviors: [
            "Short delay before reacting to a cue",
            "More efficient stride developing",
            "Noticeable speed loss when changing direction",
          ],
          commonMistakes: [
            "Overstriding when trying to run faster",
            "Standing upright rather than bending the knees on a cut",
          ],
          coachingTips: [
            "Let's work on quick, small first steps instead of one big reach",
            "Bend those knees a little before you change direction",
          ],
          assessmentActivities: [
            "Short sprint reaction drills",
            "Simple cone change-of-direction courses",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player reacts quickly and consistently, runs efficiently over short distances, and changes direction with only modest speed loss.",
          observableBehaviors: [
            "Quick, consistent first-step reaction",
            "Efficient stride over short distances",
            "Modest speed loss on direction changes",
          ],
          commonMistakes: [
            "Occasional balance loss on sharper cuts",
          ],
          coachingTips: [
            "What helps you stay balanced on a sharp turn?",
            "How much speed do you feel like you lose when you change direction?",
          ],
          assessmentActivities: [
            "Timed short-distance sprints",
            "Cone agility courses with sharper turns",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player has a fast first-step reaction, efficient acceleration, and fluid direction changes with minimal speed loss.",
          observableBehaviors: [
            "Fast, consistent first-step reaction",
            "Smooth acceleration to top short-distance speed",
            "Fluid direction changes with minimal speed loss",
          ],
          commonMistakes: ["May occasionally overrun a tight angle"],
          coachingTips: [
            "How does your acceleration change when it really matters, like beating out a throw?",
            "What's the difference in your turn on a wide cut versus a sharp one?",
          ],
          assessmentActivities: [
            "Game-speed sprint-and-cut reps",
            "Position-specific agility drills",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player shows elite first-step quickness and acceleration for their age group and applies speed/agility instinctively in game situations.",
          observableBehaviors: [
            "Elite first-step quickness for their age",
            "Explosive, controlled direction changes",
            "Applies speed and agility instinctively during live play",
          ],
          commonMistakes: ["May occasionally take an overly aggressive angle"],
          coachingTips: [
            "How do you read a situation to know when to really turn it on?",
            "What would you tell a teammate about getting a faster first step?",
          ],
          assessmentActivities: [
            "Full scrimmage speed/agility observation",
            "Peer-coaching observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "High-neural-demand coordination and reaction work (quick starts, simple change-of-direction games) is well suited to this age and should be delivered through games, not isolated sprint drills. Keep sessions short and playful; formal speed testing isn't useful yet.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Reaction time, running efficiency, and change-of-direction control all become more coachable. Short-distance sprint and agility games can become slightly more structured.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Growth-spurt-related coordination dips ('adolescent awkwardness') are common in this band -- maintain training frequency through the spurt rather than backing off, and expect some temporary regression in agility as a normal part of the process, not a skill failure.",
        },
      },
      redFlags: [
        "Persistent, significant lag in reaction time relative to peers despite repeated game-based practice",
        "Chronic loss of balance on simple direction changes well past the fundamentals stage",
        "Physical discomfort or pain associated with running or cutting that should be evaluated rather than coached through",
      ],
      parentExplanation:
        "Speed and agility at this age come almost entirely from fun, game-based movement -- tag games, reaction games, and simple obstacle courses -- rather than formal sprint training, which isn't useful or appropriate yet. The goal is a quick first step and the ability to change direction without falling over, both of which develop naturally through active, varied play.",
      homeActivities: [
        "Reaction Tag: Play simple tag or 'freeze' games that reward a quick first step off a starting cue.",
        "Cone Zig-Zag: Set up a few cones in the yard for a simple zig-zag running course, emphasizing bent knees on the turns.",
        "Mirror Drill: Face the child and have them mirror your side-to-side movements as fast as they can -- builds reactive agility.",
        "Simon Says (Movement Version): Use movement commands (sprint, freeze, turn) as a fun way to build quick reactions.",
      ],
      bestAssessedIn: [
        "Base running and fielding drills",
        "Reaction and agility games",
        "Live scrimmage movement observation",
      ],
      assessmentFrequency: "Ongoing observation during warm-ups and scrimmages; formal check per season.",
      assessmentDuration: "5-10 minutes of movement-focused observation",
    },
  },
  {
    sport: "baseball",
    domain: "physical",
    stage: "fundamentals",
    name: "Hand-Eye Coordination",
    slug: "hand-eye-coordination-baseball",
    description:
      "The visual-motor coordination underlying catching, hitting, and fielding -- tracking a moving ball with the eyes and timing the hands or bat to meet it. A foundational physical skill that supports every technical skill in the sport.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 9,
    progressionLevels: {
      "1": "Struggles to track a moving ball with the eyes; hands and bat are frequently mistimed relative to the ball's path; simple toss-and-catch tasks are inconsistent",
      "2": "Tracks slower-moving balls reasonably well; timing improves with soft tosses and rolled balls but breaks down with more speed or a bat involved",
      "3": "Tracks moderate-speed balls consistently; timing between eyes and hands (or bat) is generally accurate for age-appropriate speeds",
      "4": "Tracks faster or less predictable ball paths well; timing is consistent across catching, fielding, and hitting tasks",
      "5": "Excellent tracking and timing across all baseball tasks, including off-speed or unpredictable ball paths; coordination looks effortless",
    },
    observableBehaviors: [
      "Keeps eyes on the ball from release/contact to the hands or bat",
      "Times the hands or swing to meet the ball rather than reacting late or early",
      "Adjusts hand or body position smoothly as the ball's path changes",
      "Shows consistent improvement in catch/tee-hit success rate with repetition",
      "Handles simple tracking tasks (tossed balls, rolled balls) with minimal misses",
    ],
    commonMistakes: [
      "Losing the ball early: Looking away from the ball before it arrives at the hands or bat",
      "Late timing: Swinging or reaching after the ball has already passed the contact point",
      "Early timing: Committing the hands or swing before the ball is close enough",
      "Overcorrecting: Large, jerky adjustments instead of small, smooth ones when the ball's path changes",
    ],
    coachingTips: [
      "Can you watch the ball the whole way, even after you know where it's going?",
      "Did your hands get there too early, or too late that time?",
      "What does it feel like when the timing is just right?",
      "Let's slow it down and track just the ball, no glove or bat yet",
    ],
    tags: [
      "core",
      "physical",
      "fundamental",
      "coordination",
      "hand-eye",
      "tracking",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player struggles to visually track a moving ball and reliably time hands or bat to meet it, even in simple, slow tasks.",
          observableBehaviors: [
            "Loses track of the ball frequently during simple toss tasks",
            "Hands or bat are often mistimed relative to the ball",
            "Simple catch or tee tasks are inconsistent",
          ],
          commonMistakes: [
            "Looking away from the ball before it arrives",
            "Large mistiming (early or late) on simple tasks",
          ],
          coachingTips: [
            "Use bigger, slower, brightly colored balls to make tracking easier",
            "Remove the bat/glove entirely at first - just practice tracking and reaching",
          ],
          assessmentActivities: [
            "Simple ball-tracking tasks (no catch required, just eyes)",
            "Soft-toss tracking with a large, slow ball",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player tracks slower-moving balls reasonably well; timing improves with soft tosses and rolled balls but breaks down at higher speeds or with a bat.",
          observableBehaviors: [
            "Tracks slow-moving balls with reasonable consistency",
            "Timing improves for rolled/soft-tossed balls",
            "Timing breaks down with more speed or when swinging",
          ],
          commonMistakes: [
            "Mistiming increases as ball speed increases",
            "Struggles more when a bat is added to the task",
          ],
          coachingTips: [
            "Let's practice tracking without swinging first, then add the bat back",
            "What do you notice about the ball right before you swing?",
          ],
          assessmentActivities: [
            "Soft toss tracking drills",
            "Tee work with a focus on eyes, not outcome",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player tracks moderate-speed balls consistently, with generally accurate timing for age-appropriate speeds across tasks.",
          observableBehaviors: [
            "Consistent tracking of moderate-speed balls",
            "Generally accurate timing across catching and hitting tasks",
          ],
          commonMistakes: [
            "Some mistiming still shows up under time pressure or fatigue",
          ],
          coachingTips: [
            "What's different about your timing when you're tired versus fresh?",
            "How does adding speed change what your eyes need to do?",
          ],
          assessmentActivities: [
            "Moderate-speed soft toss and catch reps",
            "Tee-to-soft-toss transition observation",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player tracks faster or less predictable ball paths well, with consistent timing across catching, fielding, and hitting tasks.",
          observableBehaviors: [
            "Tracks faster, less predictable ball paths well",
            "Consistent timing across multiple baseball tasks",
          ],
          commonMistakes: [
            "May occasionally struggle with a truly erratic bounce or spin",
          ],
          coachingTips: [
            "What tips you off early about where an unpredictable ball is going?",
            "How does your tracking change between catching and hitting?",
          ],
          assessmentActivities: [
            "Varied-speed and varied-path tracking drills",
            "Live scrimmage coordination observation",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player shows excellent, seemingly effortless tracking and timing across all baseball tasks, including unpredictable ball paths.",
          observableBehaviors: [
            "Excellent tracking and timing across all tasks",
            "Handles unpredictable or off-speed ball paths well",
            "Coordination appears effortless and automatic",
          ],
          commonMistakes: ["Rarely mistimed even under pressure"],
          coachingTips: [
            "How would you describe good tracking to a younger player?",
            "What do you focus on when the ball's path is unusual?",
          ],
          assessmentActivities: [
            "Full scrimmage coordination observation across roles",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "This is a high-value age for coordination work -- pre-adolescent players respond well to high-neural-demand tracking and timing tasks. Keep it playful (tracking games, soft-toss variety) rather than technical; coordination develops through varied repetition, not correction.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Timing and tracking should improve steadily with more varied, slightly faster tasks. This is a good age to blend tracking work into hitting and fielding drills rather than isolating it.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Coordination may dip temporarily during growth spurts ('adolescent awkwardness') -- maintaining varied practice through this period, rather than reducing it, blunts the decline.",
        },
      },
      redFlags: [
        "Significant, persistent difficulty tracking even slow-moving objects across many sessions",
        "No improvement in basic tracking tasks despite repeated, varied, low-pressure practice",
        "Coordination difficulty severe enough to raise a broader developmental or vision concern -- consider a vision screening",
      ],
      parentExplanation:
        "Hand-eye coordination is the foundation underneath catching, hitting, and fielding -- it's simply the skill of watching a moving object and timing your hands (or a bat) to meet it. It develops through varied, playful repetition rather than correction or drilling, and young kids typically improve quickly with exposure to different ball speeds, sizes, and games.",
      homeActivities: [
        "Balloon Tap: Keep a balloon in the air with hands only, focusing on watching it the whole way.",
        "Bounce & Catch: Bounce a ball off a wall or the ground at varying speeds and angles and catch it, building tracking variety.",
        "Juggling Scarves: Simple juggling with soft scarves (which fall slowly) builds tracking without the pressure of a fast-moving ball.",
        "Reaction Ball Games: Toss a ball with an irregular bounce (a reaction ball, if available) for extra tracking challenge in a fun format.",
      ],
      bestAssessedIn: [
        "Catch play and soft-toss drills",
        "Tee and soft-toss hitting work",
        "Ground ball fielding reps",
      ],
      assessmentFrequency: "Ongoing observation across all skill stations; formal check per season.",
      assessmentDuration: "Builds picture over multiple sessions rather than a single test",
    },
  },
  {
    sport: "baseball",
    domain: "psychological",
    stage: "fundamentals",
    name: "Confidence With the Ball",
    slug: "confidence-baseball",
    description:
      "The belief in one's own ability to catch, throw, and hit without hesitation or fear of the ball -- a foundational mental skill in a sport where nearly every fundamental (catching, batting) involves something coming directly at you.",
    introductionAge: 5,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 10,
    progressionLevels: {
      "1": "Hesitant or fearful around the ball; avoids catching or batting turns; gives up easily after a miss; needs constant encouragement to participate",
      "2": "Will try with support and encouragement; noticeably affected by misses or errors; confidence is inconsistent from rep to rep",
      "3": "Participates willingly in catching, throwing, and batting; recovers from most mistakes without shutting down; generally positive attitude",
      "4": "Confident and willing to try harder or less familiar tasks; recovers quickly from mistakes; believes in their own ability most of the time",
      "5": "Consistently confident even in new or pressure situations; recovers immediately from mistakes; encourages less confident teammates",
    },
    observableBehaviors: [
      "Volunteers or steps up for catching, throwing, and batting turns without being pushed",
      "Continues trying after a miss, drop, or strikeout rather than shutting down",
      "Shows positive body language (relaxed posture, engaged attention) around the ball",
      "Attempts new or slightly harder tasks (a faster toss, a live pitch) when offered",
      "Encourages or supports teammates rather than only focusing on their own performance",
    ],
    commonMistakes: [
      "Avoiding the ball: Hanging back from catch play, fielding, or batting turns",
      "Giving up after a miss: Shutting down, disengaging, or refusing to try again after an error",
      "Negative self-talk: Saying things like 'I can't do this' before even attempting a task",
      "Hiding: Positioning themselves (physically or socially) to avoid being involved in the play",
    ],
    coachingTips: [
      "That miss doesn't erase everything good you did today - what's the next play?",
      "I saw you go for that ball without hesitating - that's exactly the confidence we want",
      "What's one small thing you tried today that felt a little scary?",
      "Everyone on this team, even the pros, misses sometimes - what matters is trying again",
      "How did it feel to catch/hit that one? Let's remember that feeling",
    ],
    tags: [
      "core",
      "psychological",
      "fundamental",
      "confidence",
      "mental",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is hesitant or fearful around the ball and often avoids catching, throwing, or batting opportunities. Needs consistent encouragement and a low-pressure environment.",
          observableBehaviors: [
            "Avoids catching, throwing, or batting turns when possible",
            "Gives up quickly after a miss or error",
            "Needs constant encouragement to participate",
          ],
          commonMistakes: [
            "Hanging back from involvement in play",
            "Negative self-talk before attempting a task",
          ],
          coachingTips: [
            "Build the relationship first; find small, guaranteed successes",
            "Use soft equipment and short distances to reduce fear of the ball itself",
            "Celebrate trying, not just succeeding",
          ],
          assessmentActivities: [
            "Observation of willingness to participate during warm-up",
            "Response to a missed catch or throw",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player will try with support and encouragement, but confidence is inconsistent and noticeably affected by mistakes.",
          observableBehaviors: [
            "Tries tasks with encouragement from a coach",
            "Visibly affected by misses or errors",
            "Confidence fluctuates rep to rep",
          ],
          commonMistakes: [
            "Confidence dips sharply after a single mistake",
            "Compares themselves unfavorably to teammates",
          ],
          coachingTips: [
            "Build on recent successes before introducing a harder task",
            "Reduce the fear of failure by lowering stakes (no score, just reps)",
          ],
          assessmentActivities: [
            "Observation of response to consecutive misses",
            "Willingness to attempt a slightly harder task",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player participates willingly across catching, throwing, and batting and recovers from most mistakes without disengaging.",
          observableBehaviors: [
            "Participates willingly in all core tasks",
            "Recovers from most mistakes without shutting down",
            "Generally positive attitude during practice and games",
          ],
          commonMistakes: [
            "Confidence may still dip in unfamiliar or higher-pressure situations",
          ],
          coachingTips: [
            "What helped you bounce back so quickly from that last miss?",
            "Let's try something a little new today - I think you're ready",
          ],
          assessmentActivities: [
            "Observation across a full practice of varied tasks",
            "Response to a new or slightly harder challenge",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player is confident and willing to try harder or less familiar tasks, recovering quickly from mistakes most of the time.",
          observableBehaviors: [
            "Willingly attempts harder or unfamiliar tasks",
            "Recovers quickly from mistakes",
            "Believes in their own ability in most situations",
          ],
          commonMistakes: [
            "May occasionally become overconfident and take on too much risk",
          ],
          coachingTips: [
            "How do you stay confident when a task is brand new to you?",
            "What would you tell a teammate who's nervous about trying something?",
          ],
          assessmentActivities: [
            "Observation during first exposure to a new drill or task",
            "Response to game-situation pressure",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player is consistently confident even in new or pressure situations, recovers immediately from mistakes, and helps build confidence in teammates.",
          observableBehaviors: [
            "Consistently confident in new or pressure situations",
            "Immediate recovery from mistakes",
            "Actively encourages less confident teammates",
          ],
          commonMistakes: ["May occasionally need to balance confidence with humility"],
          coachingTips: [
            "How can you help a teammate who's struggling with confidence right now?",
            "What does staying confident look like when things aren't going your way?",
          ],
          assessmentActivities: [
            "Observation of peer support and leadership behaviors",
            "Response to sustained pressure across a game",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Confidence varies enormously at this age, and fear of the ball is common and expected, not a sign of a deeper problem. Baseball is genuinely hard at first -- catching and hitting both involve something coming at you. Create a safe environment where trying is celebrated more than outcomes, and never embarrass a hesitant player in front of the group.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Confidence should be stabilizing. Social comparison to teammates increases at this age -- build confidence through achievable challenges and process-focused praise rather than outcome comparisons.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Social awareness and performance pressure both increase in this band. A supportive team culture matters more than ever; help players manage expectations realistically, especially around batting, where even elite players fail most of the time.",
        },
      },
      redFlags: [
        "Severe anxiety that meaningfully affects willingness to participate",
        "Complete withdrawal from catching, throwing, or batting activities",
        "Persistent, harsh negative self-talk that doesn't respond to encouragement",
        "Signs of deeper emotional distress beyond typical sports nervousness",
      ],
      parentExplanation:
        "Confidence with the ball affects everything in baseball -- willingness to catch, to swing, to keep trying after a strikeout or an error. Baseball is uniquely hard on confidence because even the best players in the world fail at the plate most of the time. The most important thing you can do at home is focus on effort and enjoyment, not results, and avoid comparing your child's performance to teammates. How you react to their mistakes shapes how they react to their own mistakes.",
      homeActivities: [
        "Celebrate effort, not just outcomes: praise trying to catch a hard one even if it's dropped",
        "Share your own failure stories: normalize missing, striking out, and making errors",
        "Ask what they enjoyed, not just how they did",
        "Avoid comparisons to siblings or teammates",
        "Focus conversations on one small improvement, not the scoreboard",
      ],
      bestAssessedIn: [
        "Catch play and batting practice willingness",
        "Response to mistakes during scrimmages",
        "General participation observation across a season",
      ],
      assessmentFrequency: "Ongoing observation throughout the season.",
      assessmentDuration: "Builds a picture over multiple practices, not a single session",
    },
  },
  {
    sport: "baseball",
    domain: "psychological",
    stage: "skill-building",
    name: "Focus at the Plate",
    slug: "focus-at-bat",
    description:
      "The ability to concentrate on the ball -- not the outcome, teammates, or crowd -- for the several seconds of an at-bat. Sustained attention under this kind of pressure is developmentally harder at 6-8, so this skill is introduced once focused attention becomes realistically achievable.",
    introductionAge: 8,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 11,
    progressionLevels: {
      "1": "Easily distracted before or during an at-bat (crowd, teammates, prior outcome); attention drifts away from the ball; rushes or freezes rather than settling in",
      "2": "Can focus briefly with a coach reminder before the at-bat but attention drifts as the at-bat goes on; visibly affected by the previous pitch or at-bat",
      "3": "Settles into a consistent pre-pitch routine; maintains focus on the ball for most of an at-bat; occasional lapses under bigger moments",
      "4": "Maintains focus on the ball through a full at-bat, including after a bad pitch or strike; uses a simple process goal (e.g., 'see the ball') rather than fixating on outcome",
      "5": "Sustains strong focus through high-pressure at-bats; resets quickly between pitches regardless of the previous result; models focus habits for teammates",
    },
    observableBehaviors: [
      "Uses a consistent routine before stepping into the box (deep breath, practice swing, etc.)",
      "Keeps attention on the pitcher/ball rather than the crowd, coach, or scoreboard",
      "Resets attention after a ball, strike, or foul rather than carrying frustration into the next pitch",
      "Talks about the process (seeing the ball, a good swing) rather than fixating only on the result",
      "Maintains composure and attention across a full at-bat, not just the first pitch",
    ],
    commonMistakes: [
      "Outcome fixation: Thinking about getting a hit or not striking out instead of just seeing the ball",
      "Carrying the last pitch: Letting a called strike or a foul ball rattle focus on the next pitch",
      "External distraction: Looking at parents, the scoreboard, or teammates instead of the pitcher",
      "Rushing: Stepping in and swinging without a moment to settle focus first",
    ],
    coachingTips: [
      "What's your one job right now - just see the ball. Nothing else matters this pitch",
      "That last pitch is over - what's your routine to reset before the next one?",
      "Where should your eyes be right now?",
      "What does your focus routine look like before you step in?",
      "Good miss - what will you focus on differently next pitch?",
    ],
    tags: [
      "core",
      "psychological",
      "skill-building",
      "focus",
      "mental",
      "hitting",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is easily distracted before and during an at-bat, with attention drifting away from the ball toward the crowd, teammates, or the outcome.",
          observableBehaviors: [
            "Looks around at the crowd, coach, or teammates instead of the pitcher",
            "Rushes into the box without settling first",
            "Visibly rattled by a prior pitch or outcome",
          ],
          commonMistakes: [
            "Fixates on the outcome rather than the process",
            "Carries frustration from one pitch into the next",
          ],
          coachingTips: [
            "Keep the instruction to one simple cue: 'see the ball'",
            "Model a short, consistent pre-pitch routine for them to copy",
          ],
          assessmentActivities: [
            "Observation of attention during live at-bats",
            "Response to a called strike or foul ball",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player can focus briefly with a reminder before the at-bat but attention drifts as the at-bat continues, and is visibly affected by the previous pitch.",
          observableBehaviors: [
            "Focuses with a coach's reminder before stepping in",
            "Attention drifts as the at-bat goes on",
            "Visibly affected by the previous pitch or at-bat",
          ],
          commonMistakes: [
            "Loses focus by the second or third pitch of an at-bat",
            "Struggles to reset after a strike",
          ],
          coachingTips: [
            "Let's practice your routine before every single pitch, not just the first",
            "What's one thing you can do to reset after a strike?",
          ],
          assessmentActivities: [
            "Multi-pitch at-bat observation",
            "Reset-routine practice reps",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player settles into a consistent pre-pitch routine and maintains focus for most of an at-bat, with occasional lapses in bigger moments.",
          observableBehaviors: [
            "Consistent pre-pitch routine",
            "Maintains focus for most of the at-bat",
            "Occasional focus lapse in higher-pressure moments",
          ],
          commonMistakes: [
            "Bigger moments (close game, full count) still occasionally break focus",
          ],
          coachingTips: [
            "What's different about your focus in a big moment versus a normal one?",
            "How does your routine change, if at all, when it matters more?",
          ],
          assessmentActivities: [
            "High-leverage at-bat observation",
            "Routine consistency tracking across a game",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player maintains focus on the ball through a full at-bat, including after a bad pitch or strike, and uses a simple process goal rather than fixating on outcome.",
          observableBehaviors: [
            "Maintains focus through a full at-bat",
            "Uses a process cue ('see the ball') rather than outcome fixation",
            "Recovers well after a bad pitch or called strike",
          ],
          commonMistakes: ["May occasionally slip into outcome thinking in a close game"],
          coachingTips: [
            "What process goal are you using right now, instead of just 'get a hit'?",
            "How did you stay locked in after that last strike?",
          ],
          assessmentActivities: [
            "Full at-bat focus observation across a game",
            "Process-goal articulation check-ins",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player sustains strong focus through high-pressure at-bats, resets quickly regardless of prior results, and models focus habits for teammates.",
          observableBehaviors: [
            "Sustains focus through high-pressure at-bats",
            "Resets immediately regardless of previous result",
            "Models focus routines for teammates",
          ],
          commonMistakes: ["Rarely loses focus even in high-stakes moments"],
          coachingTips: [
            "How would you teach a younger teammate to focus at the plate?",
            "What does your routine look like in the biggest moments of a game?",
          ],
          assessmentActivities: [
            "High-pressure game observation",
            "Peer-teaching observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "not typically assessed",
          notes:
            "Sustained attention through a multi-pitch at-bat is developmentally difficult at this age; this skill is intentionally introduced at skill-building rather than fundamentals. At 6-8, the only relevant cue is 'watch the ball,' delivered playfully, without an expectation of sustained focus across a full at-bat.",
        },
        ages9to11: {
          typicalLevel: "1-3",
          notes:
            "Teach process goals over outcome goals and simple preparatory self-talk at this age -- research supports process-focused cueing as more effective than outcome pressure for this developmental stage. A short, repeatable pre-pitch routine is the anchor skill.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Focus should hold up across a full at-bat and through adversity (a strike, a bad pitch to swing at). Building autonomy over the routine -- letting the player own it rather than imposing it -- protects motivation and reduces burnout risk.",
        },
      },
      redFlags: [
        "Persistent, severe distraction that prevents any meaningful engagement with an at-bat",
        "Visible distress or shutdown after a strike or miss that doesn't improve with support",
        "No development of any pre-pitch routine despite repeated, patient coaching",
      ],
      parentExplanation:
        "Focus at the plate is a learnable skill, not a fixed trait -- it's built through a simple, repeatable routine (like a breath and a practice swing) and a process-focused cue ('see the ball') rather than outcome pressure ('get a hit'). Research on youth sport psychology supports teaching process goals over outcome goals at this age, since outcome pressure tends to increase anxiety without improving performance. At home, avoid outcome-focused feedback ('did you get a hit?') in favor of process-focused questions ('did you feel like you saw the ball well?').",
      homeActivities: [
        "Routine Practice (No Ball): Practice the physical pre-pitch routine (step in, breath, practice swing) without even hitting anything, to build the habit.",
        "See-the-Ball Toss: Soft toss where the only instruction is to call out the color or a mark on the ball as it arrives -- forces visual focus.",
        "Reset Cue Practice: After a missed swing in tee or toss work, practice a simple physical reset cue (step out, breath, step back in) before the next rep.",
        "Process Talk: After practice, ask about what they focused on, not just what happened -- reinforces process over outcome.",
      ],
      bestAssessedIn: [
        "Live at-bats during scrimmages or games",
        "Multi-pitch batting practice",
        "High-pressure game situations",
      ],
      assessmentFrequency: "Every game; informal check-ins during batting practice.",
      assessmentDuration: "Observed across a full at-bat, several times per game",
    },
  },
  {
    sport: "baseball",
    domain: "psychological",
    stage: "fundamentals",
    name: "Resilience After Mistakes",
    slug: "resilience-baseball",
    description:
      "Bouncing back from strikeouts, errors, and dropped balls -- essential in a sport where even elite players fail most of the time at the plate -- staying engaged and ready for the next play rather than dwelling on the last one.",
    introductionAge: 6,
    assessmentMethod: "observation",
    isCore: true,
    sortOrder: 12,
    progressionLevels: {
      "1": "Visibly upset or shuts down after a mistake; needs significant time and support to re-engage; may avoid the next opportunity to try",
      "2": "Recovers with coach support but takes a noticeable moment; sometimes still affected by a mistake on the next play",
      "3": "Recovers from most mistakes within a play or two without support; generally re-engages appropriately; occasional lingering frustration",
      "4": "Recovers quickly from mistakes and stays engaged for the next play; frustration, when it appears, is brief and doesn't affect performance",
      "5": "Recovers immediately from any mistake; treats errors as normal and expected; helps teammates recover from their own mistakes",
    },
    observableBehaviors: [
      "Returns to a ready, engaged posture shortly after a mistake",
      "Continues participating fully in the next play rather than disengaging",
      "Shows appropriate, brief frustration rather than prolonged upset",
      "Offers or accepts encouragement from teammates and coaches after an error",
      "Talks about a mistake constructively ('I'll get the next one') rather than catastrophically",
    ],
    commonMistakes: [
      "Shutting down: Withdrawing from play or refusing to engage after a strikeout or error",
      "Carrying it forward: Letting one mistake visibly affect the next play (next at-bat, next fielding chance)",
      "Self-criticism: Harsh self-talk that goes beyond normal frustration",
      "Avoiding the next opportunity: Hanging back rather than being ready for the next ball or at-bat",
    ],
    coachingTips: [
      "Even the best players in the world miss most of the time at the plate - what's the next play?",
      "That's baseball - what do you want to focus on right now?",
      "I saw you get right back to ready position after that - that's exactly it",
      "What's one thing that will help you shake that off?",
      "Every player on this team makes outs - how do we respond?",
    ],
    tags: [
      "core",
      "psychological",
      "fundamental",
      "resilience",
      "mental",
    ],
    comprehensiveGuide: {
      levelDetails: {
        "1": {
          name: "Emerging",
          description:
            "Player is visibly upset or shuts down after a mistake and needs significant time and support to re-engage, sometimes avoiding the next opportunity to try.",
          observableBehaviors: [
            "Visibly upset (tears, anger, withdrawal) after a mistake",
            "Needs significant coach support to re-engage",
            "May avoid the next at-bat or fielding chance",
          ],
          commonMistakes: [
            "Shuts down rather than continuing to participate",
            "Harsh self-criticism beyond normal frustration",
          ],
          coachingTips: [
            "Give space and a simple, warm acknowledgment before asking them to move on",
            "Normalize mistakes constantly and visibly, including your own",
            "Avoid asking them to 'just get over it' - offer a concrete next step instead",
          ],
          assessmentActivities: [
            "Observation of response immediately following an error or strikeout",
            "Re-engagement time after a mistake",
          ],
        },
        "2": {
          name: "Developing",
          description:
            "Player recovers with coach support but takes a noticeable moment, and is sometimes still affected on the next play.",
          observableBehaviors: [
            "Recovers with a coach's support and encouragement",
            "Takes a noticeable moment before re-engaging",
            "Occasionally still affected on the immediate next play",
          ],
          commonMistakes: [
            "Next play sometimes still shows the residue of the mistake",
          ],
          coachingTips: [
            "What's one thing that helps you reset after a tough play?",
            "Let's practice a quick reset routine together",
          ],
          assessmentActivities: [
            "Observation across two consecutive plays after a mistake",
          ],
        },
        "3": {
          name: "Competent",
          description:
            "Player recovers from most mistakes within a play or two without support and generally re-engages appropriately, with occasional lingering frustration.",
          observableBehaviors: [
            "Recovers from most mistakes without needing support",
            "Re-engages appropriately for the next play",
            "Occasional but brief lingering frustration",
          ],
          commonMistakes: [
            "Bigger mistakes (a costly error) may still take longer to shake off",
          ],
          coachingTips: [
            "That one seemed tougher to shake - what helped you get back to ready?",
            "How do you want to handle a bigger mistake differently next time?",
          ],
          assessmentActivities: [
            "Observation following a higher-stakes mistake",
          ],
        },
        "4": {
          name: "Proficient",
          description:
            "Player recovers quickly from mistakes and stays engaged for the next play; frustration, when present, is brief and doesn't affect performance.",
          observableBehaviors: [
            "Quick recovery from mistakes",
            "Stays fully engaged for the next play",
            "Brief frustration that doesn't carry into performance",
          ],
          commonMistakes: ["May occasionally need a reminder after an especially costly mistake"],
          coachingTips: [
            "What's your process for letting go of a mistake so quickly?",
            "How would you help a teammate who's struggling to move past an error?",
          ],
          assessmentActivities: [
            "Observation across a full game including high-stakes mistakes",
          ],
        },
        "5": {
          name: "Advanced",
          description:
            "Player recovers immediately from any mistake, treats errors as a normal part of the game, and helps teammates recover from their own mistakes.",
          observableBehaviors: [
            "Immediate recovery from any mistake",
            "Treats errors as normal and expected",
            "Actively helps teammates recover from mistakes",
          ],
          commonMistakes: ["Rarely shows any lingering effect from a mistake"],
          coachingTips: [
            "How do you help a teammate who just made a tough error?",
            "What would you tell a younger player about handling strikeouts?",
          ],
          assessmentActivities: [
            "Peer-support observation after a teammate's mistake",
            "Full-season resilience observation",
          ],
        },
      },
      ageExpectations: {
        ages6to8: {
          typicalLevel: "1-2",
          notes:
            "Mistakes should be treated matter-of-factly and immediately reframed toward the next play. Given baseball's high natural failure rate (even at the plate), this is one of the most important mental skills to model calmly and consistently from the very start.",
        },
        ages9to11: {
          typicalLevel: "2-3",
          notes:
            "Introduce simple, concrete reset routines (a breath, a phrase) that the player can use themselves rather than relying entirely on coach support. Process-focused feedback continues to support recovery better than outcome-focused feedback.",
        },
        ages12to14: {
          typicalLevel: "3-4",
          notes:
            "Social pressure and self-comparison increase in this band, making resilience harder to sustain without a supportive team culture. Building the player's own ownership of their recovery routine (rather than an imposed one) protects motivation and reduces burnout risk.",
        },
      },
      redFlags: [
        "Severe, prolonged distress after routine mistakes that doesn't ease with support",
        "Consistent avoidance of batting or fielding opportunities due to fear of making a mistake",
        "Harsh self-criticism that goes well beyond normal frustration and doesn't respond to reassurance",
        "Signs of anxiety or distress that seem disproportionate to a youth sports context",
      ],
      parentExplanation:
        "Baseball has one of the highest built-in failure rates of any sport -- even the best hitters in the world make an out most of the time. Teaching kids that a strikeout or an error is a normal, expected part of the game (not a personal failure) is one of the most valuable things we do. At home, the most helpful thing is to model this yourself: react calmly to your child's mistakes, normalize your own mistakes out loud, and focus conversations on the next opportunity rather than dwelling on what went wrong.",
      homeActivities: [
        "Model mistakes out loud: narrate your own small errors calmly ('Oops, missed that one - next time!')",
        "Practice a simple reset phrase together ('next play') to use after any miss",
        "Avoid replaying a bad at-bat or error in detail after the game - ask what they're looking forward to next time instead",
        "Celebrate a quick bounce-back specifically when you see it happen",
      ],
      bestAssessedIn: [
        "Response to strikeouts and errors during games",
        "Recovery time after a mistake during scrimmages",
        "General demeanor across a full season",
      ],
      assessmentFrequency: "Ongoing observation throughout the season.",
      assessmentDuration: "Builds a picture over multiple games rather than a single moment",
    },
  },
];

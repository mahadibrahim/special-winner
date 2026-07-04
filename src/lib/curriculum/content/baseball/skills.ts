// Baseball skills content.
//
// RECONSTRUCTION NOTE: baseball has no v2-canonical skills file and no gen-0
// rows in `src/lib/db/seed-curriculum.ts` (that file seeds only soccer and
// basketball) -- the ONLY baseball source is
// `.superpowers/curriculum-recovery/seeds/curriculum-v2__baseball-skills-upgrade.ts`,
// which UPDATEs a single pre-existing skill row ("Throwing Mechanics") by a
// hardcoded uuid rather than inserting a full row. This file reconstructs the
// one full `SkillContent` row: `progressionLevels`, `observableBehaviors`,
// `commonMistakes`, `coachingTips`, `tags`, and `comprehensiveGuide` are
// transcribed byte-for-byte from that update payload (via a scratch tsx
// extraction script -- see the Task 6 report at
// .superpowers/sdd/cr-task-6-report.md for method); `sport` / `domain` /
// `stage` / `name` / `slug` / `assessmentMethod` / `isCore` / `sortOrder`
// are NOT present in the source object (it's a targeted UPDATE by hardcoded
// uuid, not an INSERT) and are reconstructed from context:
//   - domain: "technical" -- from the file's own header comment
//     ("Skills upgraded: TECHNICAL: Throwing Mechanics").
//   - stage: "fundamentals" -- every other v2-canonical skill file (soccer,
//     basketball, hockey) places its core/fundamental-tagged skills at the
//     "fundamentals" stage regardless of introductionAge; this skill carries
//     the same "core"/"fundamental" tags and its ageExpectations start at the
//     "ages6to8" bracket (the fundamentals age band), so "fundamentals" is
//     used by the same precedent.
//   - assessmentMethod: "observation" -- all bestAssessedIn entries ("Catch
//     play warm-up", "Target throwing drills", "Game situation throws") are
//     coach-observed, matching every other technical skill's "observation"
//     method across sports.
//   - isCore: true -- "core" is the first tag in the extracted tags array,
//     matching the convention used for isCore:true skills elsewhere (e.g.
//     hockey's Skating (Forward)).
//   - name/slug: "Throwing Mechanics" / "throwing-mechanics" -- the skill
//     name used throughout the source's comments and console.log lines;
//     slug is the kebab-case form (same derivation rule used for every other
//     sport's gen-0-shelled skills).
//   - sortOrder: 1 -- only baseball skill in the registry.
//
// Net count: 1 baseball skill (the task brief's floor is >= 1; the true
// total, asserted directly in registry.test.ts, is 1).

import type { SkillContent } from "../types";

export const BASEBALL_SKILLS: SkillContent[] = [
  {
    sport: "baseball",
    domain: "technical",
    stage: "fundamentals",
    name: "Throwing Mechanics",
    slug: "throwing-mechanics",
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
];

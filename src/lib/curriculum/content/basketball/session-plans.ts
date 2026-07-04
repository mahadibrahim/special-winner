// Basketball session plans.
//
// Source: the basketball subset of `session-plan-library.ts`'s gen-1 template
// library (there is no `curriculum-v2__basketball-session-plans.ts` -- the
// only basketball session-plan source in the recovered seeds is this one
// file, unlike soccer which has both a v2-canonical file AND a gen-1 library
// subset). All 7 basketball plans in that library are included verbatim; no
// dedup pass was needed since there is no v2-canonical set to collide with.
//
// Shape notes (container-only transforms, no content invented or altered):
//   - 3 of the 7 plans' segments carry `coachingScript` as a string[] (one
//     bullet per line); SessionPlanContent.structure[].coachingScript is a
//     single string, so array entries are newline-joined verbatim, in order
//     (same transform as soccer/session-plans.ts).
//   - No segment in this set carries the extra `stations` field soccer's
//     library had in 3 places, so no special-casing was needed here.
//   - Source-level `featured` is dropped (not part of SessionPlanContent --
//     same precedent as soccer/session-plans.ts, which also drops it).

import type { SessionPlanContent } from "../types";

export const BASKETBALL_SESSION_PLANS: SessionPlanContent[] = [
  {
    name: "Basketball Basics Fun",
    sport: "basketball",
    stage: "fundamentals",
    durationMinutes: 60,
    structure: [
      {
        name: "Dribble Tag",
        type: "warmup",
        durationMinutes: 8,
        description:
          "Everyone dribbles, 2-3 taggers. Get tagged = toe taps until freed.",
        activitySuggestions: ["dribble-tag"],
      },
      {
        name: "Ball Handling Circuit",
        type: "technical",
        durationMinutes: 10,
        description: "Stationary ball handling: around waist, figure 8, etc.",
        activitySuggestions: ["ball-handling-circuit"],
        coachingScript:
          "Can you do it without looking?\nFingertips, not palms!\nMake the ball dance!",
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
        coachingScript:
          "Step into your pass\nThumbs down on the follow through\nGive your partner a target",
      },
      {
        name: "Knockout",
        type: "fun",
        durationMinutes: 12,
        description:
          "Classic shooting game. Make your shot before person in front!",
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
    description: "Introduction to dribbling and passing through fun games.",
    equipmentNeeded: ["1 ball per player", "Cones", "2 baskets"],
    isDefault: true,
    coachingNotes:
      "\n## Key Principles for Young Players\n1. Everyone has a ball\n2. Short instructions, lots of activity\n3. Praise effort and improvement\n4. Make it fun!\n\n## Focus Today\n- Dribbling with fingertips\n- Eyes up while dribbling\n- Basic passing technique\n      ",
  },
  {
    name: "Shooting Fundamentals",
    sport: "basketball",
    stage: "fundamentals",
    durationMinutes: 60,
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
        description:
          "BEEF: Balance, Eyes, Elbow, Follow-through. Close to basket.",
        activitySuggestions: ["form-shooting-progression"],
        coachingScript:
          "Balance - are your feet set?\nEyes - where are you looking?\nElbow - is it tucked in?\nFollow-through - snap your wrist like reaching into a cookie jar!",
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
        description:
          "Partners compete - one rebounds, one shoots. Switch after 5.",
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
    description: "Introduce proper shooting form through fun activities.",
    equipmentNeeded: ["Balls", "Cones", "Baskets", "Music speaker"],
    isDefault: false,
    coachingNotes:
      "\n## BEEF Shooting Form\n- **B**alance: Feet shoulder-width, slight bend in knees\n- **E**yes: Focus on back of rim\n- **E**lbow: Tucked in, under the ball\n- **F**ollow-through: Snap wrist, hold it up\n\n## Common Mistakes\n- Pushing the ball (use legs!)\n- Elbow out to the side\n- Not following through\n      ",
  },
  {
    name: "Ball Handling Development",
    sport: "basketball",
    stage: "skill-building",
    durationMinutes: 75,
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
    description: "Advanced dribbling moves and using them in games.",
    equipmentNeeded: ["1 ball per player", "Cones", "Baskets"],
    isDefault: true,
    coachingNotes:
      "\n## Ball Handling Priorities\n1. Protect the ball\n2. Keep it low (knee height)\n3. Eyes up\n4. Use both hands equally\n\n## Moves to Develop\n- Crossover\n- Between the legs\n- Behind the back\n- Hesitation\n      ",
  },
  {
    name: "Team Offense Basics",
    sport: "basketball",
    stage: "skill-building",
    durationMinutes: 75,
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
    description: "Introduction to motion offense concepts.",
    equipmentNeeded: ["Balls", "Court", "Pinnies"],
    isDefault: false,
    coachingNotes:
      "\n## Motion Offense Rules\n1. Pass and cut (basket or away)\n2. Fill behind the cutter\n3. Screen away after passing\n4. Read the defense\n\n## Key Teaching Points\n- Spacing is everything\n- Cut hard, screen hard\n- Move with purpose (not wandering)\n      ",
  },
  {
    name: "Defense Development",
    sport: "basketball",
    stage: "skill-building",
    durationMinutes: 75,
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
    description: "Learn individual and team defensive principles.",
    equipmentNeeded: ["Balls", "Court", "Pinnies"],
    isDefault: false,
    coachingNotes:
      '\n## Defensive Principles\n1. Stay low, stay active\n2. Ball-you-man positioning\n3. Help and recover\n4. Communicate!\n\n## Key Phrases\n- "Ball!" (I\'m on ball)\n- "Help!" (I\'m in help position)\n- "Screen left/right!"\n- "Box out!"\n      ',
  },
  {
    name: "Transition Offense",
    sport: "basketball",
    stage: "development",
    durationMinutes: 90,
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
    description: "Fast break and early offense concepts.",
    equipmentNeeded: ["Balls", "Full court"],
    isDefault: true,
    coachingNotes:
      "\n## Fast Break Principles\n1. Outlet to sideline\n2. Fill the lanes (wide)\n3. Ball in the middle\n4. Attack before defense sets\n\n## Numbers Advantage\n- 2v1: Make the easy pass\n- 3v2: Attack the gap\n- 4v3: Find the open man\n      ",
  },
  {
    name: "Advanced Shooting",
    sport: "basketball",
    stage: "development",
    durationMinutes: 90,
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
    description: "Game-like shooting situations and shot selection.",
    equipmentNeeded: ["Balls", "Baskets", "Cones"],
    isDefault: false,
    coachingNotes:
      "\n## Shot Selection Principles\n1. Good shot = open, in rhythm, in range\n2. Great shots beat good shots\n3. Don't shoot falling away (unless designed)\n4. Know your range\n\n## Track These Numbers\n- Shot attempts by zone\n- Make percentage by zone\n- Assisted vs unassisted\n      ",
  },
];

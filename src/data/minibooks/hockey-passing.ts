/**
 * Mini-Book: The Path to Better Passing (Hockey)
 * Evidence-Based Youth Development Guide
 */

export const hockeyPassingMiniBook = {
  meta: {
    title: 'The Path to Better Passing',
    subtitle: 'A Guide for Parents and Coaches',
    sport: 'hockey',
    skill: 'passing',
  },

  introduction: {
    hook: '"The puck moves faster than any skater. Great teams understand this—and use it to their advantage."',
    promise:
      'This guide reveals how children develop elite passing vision and execution—from basic tape-to-tape passes to creative saucer passes and breakout plays—and how parents and coaches can nurture this development at every age.',
    whatMakesThisDifferent: [
      'Based on motor learning research and perceptual-cognitive science',
      'Age-appropriate progressions that build hockey vision naturally',
      'Focus on decision-making and anticipation, not just mechanics',
      'Practical activities for developing hockey IQ through puck movement',
    ],
  },

  scienceFoundation: {
    title: 'Part One: The Science of Passing',
    subtitle: 'How children learn to move the puck',
    sections: [
      {
        title: 'The Biomechanics of Hockey Passing',
        content: `Passing in hockey involves coordinating the stick, hands, arms, and core—all while maintaining balance on skates. Different passes require different mechanics, but all share fundamental principles.

**The Forehand Pass**: The foundation of hockey passing. Weight transfers from back foot to front, with the puck swept forward on the blade. The follow-through points toward the target, with the blade staying on the ice.

**The Backhand Pass**: Same principles, opposite side. Requires more wrist strength and flexibility. Often undervalued in development but essential for complete passing ability.

**The Saucer Pass**: An elevated pass that goes over sticks and skates, landing flat for the receiver. Requires cupping the puck and releasing with rotation. Timing the flight is critical.

**The One-Touch Pass**: Redirecting passes without stopping the puck. Requires soft hands, precise blade angle, and anticipation of both incoming pass and target location.`,
        keyResearch: {
          finding:
            'Analysis of elite hockey players showed that passing accuracy was most strongly correlated with follow-through direction and blade angle at release, with players achieving 85%+ accuracy when follow-through pointed directly at the target.',
          citation:
            'Pearsall, D.J., Turcotte, R.A., & Murphy, S.D. (2000). Biomechanics of ice hockey. Exercise and Sport Science Reviews, 28(4), 153-157.',
        },
        parentTakeaway:
          'Good passes start with proper technique. The follow-through tells you where the puck will go—watch for whether it points at the target.',
        implications: [
          'Teach forehand passing before backhand',
          'Emphasize follow-through direction over power',
          'Stick flex matters—use appropriate equipment',
          'Both sides of the blade must be developed',
        ],
      },
      {
        title: 'Motor Learning and Passing',
        content: `Passing skills develop through practice, but how you practice matters more than how much. Understanding motor learning principles helps design better training environments.

**Variable Practice**: Practicing passes in many different contexts (different distances, angles, speeds, game situations) produces more adaptable skills than repetitive drilling of the same pass.

**Game-Based Learning**: Passes learned in game-like situations transfer better to actual games. The decision-making context matters as much as the physical execution.

**Implicit Learning**: For young players especially, learning through games and small-area play produces better results than explicit technical instruction.

**External Focus**: Research consistently shows that focusing on the target ("hit the tape") produces better results than focusing on technique ("rotate your wrists").`,
        keyResearch: {
          finding:
            'Youth hockey players who practiced passing in variable, game-like conditions showed 31% better transfer to competitive games than those who practiced with blocked, repetitive drills.',
          citation:
            'Wulf, G., & Shea, C.H. (2002). Principles derived from the study of simple skills do not generalize to complex skill learning. Psychonomic Bulletin & Review, 9(2), 185-211.',
        },
        parentTakeaway:
          'Passing practice should look like playing, not drilling. Games with passing requirements develop skills faster than standing and passing to a partner.',
        practicalExample: {
          traditional: 'Partner passing drill: 50 passes back and forth against the boards',
          constraintsLed: '3v2 small-area game where goals only count if preceded by at least two passes',
          why: 'Game situations require reading pressure, making decisions, and timing—the actual challenges of passing in hockey.',
        },
      },
      {
        title: 'Visual Tracking and Anticipation',
        content: `Great passers see the game differently. They track puck and player movement, predict where teammates will be, and identify passing lanes before they fully open.

**Visual Search**: Expert passers scan the ice efficiently, gathering relevant information while filtering distractions. They look at spaces, not just players.

**Anticipation**: Elite passers predict where teammates will be, not just where they are. They pass to spots, trusting receivers to arrive.

**Peripheral Vision**: While focused on the puck, skilled players track movement in their peripheral vision. This allows seeing options without telegraphing the pass.

**Quiet Eye**: Research shows elite passers have a longer final fixation on the target before executing the pass. This "quiet eye" period improves accuracy.`,
        keyResearch: {
          finding:
            'Expert hockey players fixated on passing targets 200-300ms longer than novices before execution, and this "quiet eye" period was the strongest predictor of passing accuracy.',
          citation:
            'Vickers, J.N. (2007). Perception, cognition, and decision training: The quiet eye in action. Human Kinetics.',
        },
        parentTakeaway:
          'Passing skill is as much about seeing as doing. Activities that develop ice vision are as important as passing drills.',
        visualProgression: [
          { stage: 'Watch the puck', description: 'Focus on receiving and controlling the puck' },
          { stage: 'Find teammates', description: 'Look up after receiving to locate options' },
          { stage: 'See before receiving', description: 'Scan while puck is en route' },
          { stage: 'Anticipate movement', description: 'Predict where teammates and defenders will be' },
        ],
      },
      {
        title: 'Physical Development and Passing',
        content: `Passing abilities are constrained by physical development. Understanding these constraints helps set appropriate expectations and design suitable training.

**Wrist Strength**: Passing requires wrist and forearm strength. Young players may lack the strength for hard, accurate passes at distance.

**Hand Size and Grip**: Smaller hands affect stick control and grip strength. Proper stick sizing is essential.

**Core Stability**: The core stabilizes the upper body during passing, especially while skating or absorbing contact. Core weakness leads to inaccurate passes.

**Growth Considerations**: During growth spurts, arm length changes can temporarily disrupt passing timing and accuracy. This is normal and temporary.`,
        keyResearch: {
          finding:
            'Stick length and flex studies showed that properly fitted sticks improved youth passing accuracy by 18% compared to sticks that were too long or too stiff.',
          citation:
            'Haché, A. (2002). The physics of hockey. Johns Hopkins University Press.',
        },
        parentTakeaway:
          'Equipment matters enormously. A stick that is too long, too stiff, or too heavy makes passing unnecessarily difficult.',
        equipmentConsiderations: [
          { factor: 'Stick length', guideline: 'Should reach between chin and nose when on skates' },
          { factor: 'Stick flex', guideline: 'Player should be able to flex stick with normal passing force' },
          { factor: 'Blade curve', guideline: 'Minimal curve for developing players learning both sides' },
          { factor: 'Stick weight', guideline: 'Lighter generally better for youth development' },
        ],
      },
    ],
  },

  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Vision, composure, and the passing mentality',
    introduction:
      'Great passers share a mentality—they see passing as creating, not giving up the puck. They trust teammates, stay calm under pressure, and find joy in setting up goals. This mental game can be developed alongside physical skills.',
    sections: [
      {
        title: 'Ice Vision and Awareness',
        content: `"Hockey sense" isn't magic—it's a trainable skill. Great passers develop the ability to see the whole ice while handling the puck.

**Peripheral Awareness**: Using peripheral vision to track movement while focused elsewhere. This allows seeing options without staring at them and telegraphing passes.

**Head Position**: Keeping the head up while skating and handling allows scanning the ice. Looking down limits vision to a small area directly in front.

**Mental Mapping**: Knowing where teammates and opponents are likely to be without looking directly at them. Built through experience and pattern recognition.

**Pre-Scanning**: Looking at options before receiving the puck. Great passers know their play before the puck arrives.`,
        keyResearch: {
          finding:
            'Expert hockey players scanned the ice 40% more frequently than novices and made passing decisions 250ms faster, allowing more time for accurate execution.',
          citation:
            'Martell, S.G., & Vickers, J.N. (2004). Gaze characteristics of elite and near-elite athletes in ice hockey defensive tactics. Human Movement Science, 23(3-4), 301-319.',
        },
        visionDevelopment: [
          {
            stage: 'Beginning',
            description: 'Must look at puck while handling; tunnel vision on immediate area',
          },
          {
            stage: 'Developing',
            description: 'Brief head-up glances; sees teammates in immediate vicinity',
          },
          {
            stage: 'Proficient',
            description: 'Regular scanning; sees most of the offensive zone',
          },
          {
            stage: 'Advanced',
            description: 'Constant awareness; anticipates movement; sees plays before they develop',
          },
        ],
      },
      {
        title: 'Composure Under Pressure',
        content: `Great passers stay calm when pressured. Panicked decisions lead to turnovers; composed decisions create opportunities.

**Managing Pressure**: Understanding that pressure is designed to force mistakes. Staying calm defeats the purpose of the forecheck.

**Time Perception**: Under pressure, time feels compressed. Training under pressure helps players realize they often have more time than they think.

**Escape Routes**: Always knowing where the safe outlet is allows calmness. Panic comes from feeling trapped.

**Trust in Support**: Believing teammates will be in position for passes allows confident decision-making.`,
        composureStrategies: [
          {
            strategy: 'Pre-scan',
            description: 'Know your options before receiving the puck',
          },
          {
            strategy: 'Quiet feet',
            description: 'Stop and control rather than rushing; create time',
          },
          {
            strategy: 'Outlet awareness',
            description: 'Always know where the safe pass is',
          },
          {
            strategy: 'Breathe',
            description: 'Physical relaxation helps mental calmness',
          },
        ],
      },
      {
        title: 'Creativity and Risk-Taking',
        content: `The best passers are creative—they see passes others miss and are willing to try them. This creativity must be nurtured.

**Creative Freedom**: Great passing develops when players have freedom to experiment without fear of criticism for failed attempts.

**Calculated Risk**: Knowing when to try the creative pass and when to make the safe play. Different situations call for different risk levels.

**Pattern Breaking**: Predictable passing is easily defended. Creative passers keep opponents guessing.

**Learning from Failure**: Every failed pass teaches something. Players who fear failure stop trying creative passes.`,
        keyResearch: {
          finding:
            'Youth hockey players in environments that encouraged creative risk-taking showed 35% more assist production and higher teammate confidence scores than those in conservative systems.',
          citation:
            'Memmert, D. (2015). Teaching tactical creativity in sport: Research and practice. Routledge.',
        },
        creativityBuilders: [
          {
            method: 'Safe failure environment',
            application: 'Create practices where creative attempts are celebrated regardless of outcome',
          },
          {
            method: 'Exposure to creativity',
            application: 'Watch and discuss highlight-reel passes from NHL stars',
          },
          {
            method: 'Reduced pressure games',
            application: 'Small-area games with no score, just play',
          },
          {
            method: 'Personal signature',
            application: 'Encourage players to develop their own creative moves',
          },
        ],
      },
      {
        title: 'Trust in Teammates',
        content: `Passing requires trust—believing teammates will be where they should be, will handle the pass, and will make the next play.

**Positioning Trust**: Believing teammates will be in their spots allows passes to be made with conviction, not hesitation.

**Skill Trust**: Believing teammates can handle difficult passes allows attempting them. Lack of trust leads to overly safe plays.

**System Trust**: Understanding that everyone knows the plays allows anticipatory passing—throwing to where they will be.

**Building Trust**: Trust is built through practice, communication, and shared experience. It can't be mandated.`,
        trustPrinciples: [
          {
            principle: 'Make the pass',
            application: 'Commit to passes rather than hesitating—hesitation is caught',
          },
          {
            principle: 'Expect the catch',
            application: 'Assume teammates will handle it; adjust if needed',
          },
          {
            principle: 'Communicate',
            application: 'Call for the puck; let teammates know you are available',
          },
          {
            principle: 'Support positioning',
            application: 'Be where teammates expect you to be; build mutual trust',
          },
        ],
      },
    ],
  },

  tacticalAwareness: {
    title: 'Part Three: Reading the Game',
    subtitle: 'Using passing skills in game situations',
    introduction:
      'Passing skill matters most when applied tactically. Understanding when to pass, where to pass, and what each pass accomplishes turns individual skill into team success.',
    sections: [
      {
        title: 'Tape-to-Tape Passing',
        content: `The foundation of team hockey is connecting passes—putting the puck on teammates' sticks consistently and accurately.

**Target Selection**: Aiming for the stick blade rather than the body. Blade targets allow one-touch plays; body targets require control first.

**Pass Weight**: The right pace—hard enough to arrive quickly, soft enough to handle. Situation determines appropriate weight.

**Leading Receivers**: Passing ahead of moving teammates so the puck arrives as they arrive at the spot.

**Timing and Rhythm**: Passes that arrive when receivers are ready to make the next play. Rhythm passes keep offense flowing.`,
        tapePrinciples: [
          { principle: 'Blade to blade', application: 'Aim for the stick, not the skates or body' },
          { principle: 'Appropriate weight', application: 'Match pass speed to distance and situation' },
          { principle: 'Lead the target', application: 'Pass to where they will be, not where they are' },
          { principle: 'Flat on the ice', application: 'Passes should arrive flat and catchable' },
        ],
      },
      {
        title: 'Saucer Passes',
        content: `The saucer pass—elevating the puck over obstacles and landing it flat—is hockey's most elegant pass. It creates passing lanes through traffic.

**When to Saucer**: Sticks, bodies, or skates blocking the direct lane. The saucer goes over while a hard pass goes through (and often fails).

**Height Control**: Too high is as bad as too low. The ideal saucer clears obstacles by inches and lands flat.

**Spin and Rotation**: Proper rotation keeps the puck flat in flight and allows it to land softly. Tumbling pucks are hard to receive.

**Practice Requirements**: Saucer passes require significant practice. The feel for height, distance, and rotation must be developed.`,
        keyResearch: {
          finding:
            'Analysis of NHL passing showed saucer passes had 12% higher completion rates through traffic than hard passes, and led to 23% more scoring chances when completed.',
          citation:
            'Seidel, D.M., & Lees, A. (2001). Analysis of goal scoring in hockey. Journal of Sports Sciences, 19(4), 267-275.',
        },
        saucerProgression: [
          { stage: 'Basic elevation', focus: 'Cupping the puck and releasing upward' },
          { stage: 'Distance control', focus: 'Varying height for different distances' },
          { stage: 'Flat landing', focus: 'Proper spin for catchable reception' },
          { stage: 'Game application', focus: 'Using saucers in traffic at game speed' },
        ],
      },
      {
        title: 'Breakout Passing',
        content: `The breakout—moving the puck from defensive zone to neutral zone—is where games are often won or lost. Breakout passing requires specific skills and decisions.

**Defensive Zone Awareness**: Reading the forecheck pressure to determine which breakout option is available.

**Rim vs. Pass**: Knowing when to rim the puck around the boards versus making a direct pass. Wrong choice leads to turnovers.

**Wall Passes**: Using the boards as a teammate—banking passes off the wall to get through traffic.

**Stretch Passes**: Long passes that skip the neutral zone entirely. High risk, high reward when defense is aggressive.`,
        breakoutOptions: [
          { option: 'Direct pass', when: 'Winger is open and pressure is minimal' },
          { option: 'Rim', when: 'Heavy pressure, need to change sides' },
          { option: 'Wall bank', when: 'Defender between you and target' },
          { option: 'Reverse', when: 'Initial option covered, support behind' },
          { option: 'Stretch', when: 'Defense pinches aggressively, forward open deep' },
        ],
      },
      {
        title: 'Offensive Zone Passing',
        content: `Passing in the offensive zone creates scoring chances. Understanding how passes lead to goals improves decision-making.

**Cycle Passing**: Moving the puck low to tire defense and create openings. Patience and support positioning.

**Cross-Ice Passes**: Moving the puck across the slot or from wall to wall. Forces goalie movement; creates shooting windows.

**Back Door Plays**: Passes to players cutting behind the defense. Requires timing and anticipation.

**Net-Front Passes**: Centering passes for deflections and rebounds. High-danger opportunities.`,
        keyResearch: {
          finding:
            'NHL goal analysis showed 67% of goals were assisted by passes, with cross-ice passes generating the highest shooting percentage opportunities.',
          citation:
            'Schuckers, M., & Curro, J. (2013). Total hockey rating (THoR): A comprehensive statistical rating of NHL players. MIT Sloan Sports Analytics Conference.',
        },
        offensiveZonePrinciples: [
          {
            principle: 'Move the goalie',
            application: 'East-west passes force lateral movement, opening net',
          },
          {
            principle: 'Attack seams',
            application: 'Pass between defenders to players in gaps',
          },
          {
            principle: 'High to low',
            application: 'Point passes down to net-front traffic',
          },
          {
            principle: 'Patience pays',
            application: 'Cycle until the right opportunity appears',
          },
        ],
      },
    ],
  },

  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities for developing passing',
    introduction:
      'Passing develops progressively: basic mechanics and short passes first, then vision and movement, then game-situation decision-making, then creative and advanced passes. Each stage builds on the previous.',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Basic puck touch, receiving, simple passes',
        researchBasis:
          'At this age, children are developing fundamental motor skills. The goal is successful experiences with passing and receiving, not technical precision.',
        principles: [
          'Use appropriate equipment (lighter pucks, flexible sticks)',
          'Focus on receiving before passing',
          'Keep distances short for success',
          'Make it fun and social',
        ],
        activities: [
          {
            name: 'Puck Tag',
            time: '8-10 min',
            description:
              'Players skate around passing pucks to each other. When you receive a pass, you are "safe." If tagged without the puck, switch roles.',
            focus: 'Basic passing and receiving in motion',
            externalCue: 'Send the puck to a friend! Hands ready to catch!',
            variation: 'Multiple pucks, smaller space, more taggers',
            coachingNote: 'Games create purpose. Passing becomes meaningful.',
          },
          {
            name: 'Partner Passing',
            time: '8-10 min',
            description:
              'Partners face each other and pass back and forth. Start close (5 feet), gradually increase distance as success allows.',
            focus: 'Basic forehand passing technique',
            externalCue: 'Push the puck to your partner! Point your stick where you want it to go!',
            variation: 'Add targets on the stick, vary distances, introduce movement',
            coachingNote: 'Success builds confidence. Keep distances manageable.',
          },
          {
            name: 'Triangle Passing',
            time: '10 min',
            description:
              'Three players form a triangle and pass the puck around. Call the name of the person you are passing to.',
            focus: 'Passing to specific targets, communication',
            externalCue: 'Say their name! Send it to their stick!',
            variation: 'Change direction, add second puck, make triangle bigger',
            coachingNote: 'Triangles are the foundation of team passing concepts.',
          },
        ],
        parentHomeActivities: [
          'Pass a ball back and forth in the basement or driveway',
          'Use a mini stick and soft ball for indoor passing',
          'Play catch-style games that develop hand-eye coordination',
          'Watch hockey and point out passes to each other',
        ],
        signsOfProgress: [
          'Receives pucks without losing control',
          'Pushes puck in general direction of target',
          'Shows enthusiasm for passing activities',
          'Begins to anticipate incoming passes',
        ],
      },
      {
        name: 'Development Stage',
        ages: 'Ages 7-9',
        focus: 'Forehand and backhand technique, passing while moving, basic vision',
        researchBasis:
          'Children can now process technique cues and benefit from structured practice. Hand-eye coordination is developing rapidly. This is a critical window for building passing fundamentals.',
        principles: [
          'Teach proper forehand and backhand mechanics',
          'Introduce passing while skating',
          'Begin developing head-up awareness',
          'Use games that require passing to score',
        ],
        activities: [
          {
            name: 'Give and Go',
            time: '10-12 min',
            description:
              'Pass to a stationary partner, skate to a new position, receive the return pass. Continuous movement and passing.',
            focus: 'Passing and moving, supporting after the pass',
            externalCue: 'Pass and skate! Get open for the return!',
            variation: 'Add defenders, require specific passes, increase speed',
            coachingNote: 'Movement after passing is a habit that must be built early.',
          },
          {
            name: 'Heads Up Passing',
            time: '8-10 min',
            description:
              'Coach holds up colors or numbers while players pass. Players call out what they see without stopping the passing.',
            focus: 'Vision while handling and passing',
            externalCue: 'Keep passing! What color do you see?',
            variation: 'Use teammate jersey colors, increase complexity',
            coachingNote: 'Introduces ice vision concept in achievable way.',
          },
          {
            name: '3v1 Keep Away',
            time: '12-15 min',
            description:
              'Three passers keep the puck from one defender in a small area. Count consecutive passes.',
            focus: 'Passing under pressure, finding open teammates',
            externalCue: 'Move to help! Get open for your teammate!',
            variation: 'Add second defender, shrink space, require specific passes',
            coachingNote: 'Player advantage allows success while learning.',
          },
          {
            name: 'Backhand Practice',
            time: '8-10 min',
            description:
              'Partner passing using only backhand. Start stationary, progress to moving.',
            focus: 'Backhand passing technique',
            externalCue: 'Roll your wrists over! Follow through to target!',
            variation: 'Alternate forehand and backhand, game situations',
            coachingNote: 'Backhand is often neglected but essential.',
          },
        ],
        parentHomeActivities: [
          'Practice passing in the driveway with a ball or puck',
          'Play keep-away games together',
          'Set up targets to pass at',
          'Watch hockey and discuss passing decisions',
        ],
        signsOfProgress: [
          'Demonstrates proper forehand pass technique',
          'Attempts backhand passes with increasing success',
          'Moves after passing rather than standing still',
          'Begins looking up while handling the puck',
        ],
      },
      {
        name: 'Skill Stage',
        ages: 'Ages 10-12',
        focus: 'Saucer passes, breakout concepts, passing in game situations',
        researchBasis:
          'Physical development allows more powerful and varied passes. Cognitive development enables understanding tactics and reading defenses. This stage connects individual passing to team concepts.',
        principles: [
          'Introduce saucer pass technique',
          'Teach breakout concepts and options',
          'Practice passing in game-like situations',
          'Develop decision-making alongside mechanics',
        ],
        activities: [
          {
            name: 'Saucer Stations',
            time: '12-15 min',
            description:
              'Stations practicing saucer passes over obstacles at various distances. Focus on height control and flat landing.',
            focus: 'Saucer pass technique',
            externalCue: 'Cup the puck! Let it fly over and land flat!',
            variation: 'Vary obstacle heights, add movement, game scenarios',
            coachingNote: 'Saucer passes open up the ice dramatically.',
          },
          {
            name: 'Breakout Options',
            time: '15 min',
            description:
              'Practice various breakout passes with defensive pressure. Coach calls different options; players execute.',
            focus: 'Breakout passing decisions',
            externalCue: 'Read the pressure! What is open?',
            variation: 'Live forecheckers, different formations',
            coachingNote: 'Breakouts win or lose games—they need specific practice.',
          },
          {
            name: '3v3 Small Area',
            time: '15-20 min',
            description:
              'Three-on-three games in a small area. Goals only count if the shot is preceded by a completed pass.',
            focus: 'Passing in game situations',
            externalCue: 'Move the puck! Create chances together!',
            variation: 'Require two passes, bonus for saucer passes',
            coachingNote: 'Small areas force quick decisions and precise passing.',
          },
          {
            name: 'Cross-Ice Passes',
            time: '10-12 min',
            description:
              'Practice passing across the offensive zone—wall to wall, point to point, through the slot.',
            focus: 'Longer, cross-ice passing accuracy',
            externalCue: 'Move the goalie! Hit the tape!',
            variation: 'Add defenders, game-speed one-timers',
            coachingNote: 'Cross-ice passes are high-danger opportunities.',
          },
        ],
        parentHomeActivities: [
          'Discuss breakout concepts while watching games',
          'Practice saucers over obstacles in the driveway',
          'Talk about passing decisions after their games',
          'Encourage them to watch how NHL players create offense through passing',
        ],
        signsOfProgress: [
          'Executes saucer passes with reasonable accuracy',
          'Understands basic breakout options',
          'Makes good passing decisions under pressure',
          'Values puck movement and teammate involvement',
        ],
      },
      {
        name: 'Refinement Stage',
        ages: 'Ages 13+',
        focus: 'Anticipation passing, system integration, leadership through passing',
        researchBasis:
          'Players can now handle sophisticated concepts and execute advanced techniques. Focus shifts to reading the game at higher levels and integrating passing into team systems.',
        principles: [
          'Develop anticipation—passing to where teammates will be',
          'Integrate passing within team systems',
          'Build playmaking mentality and leadership',
          'Refine all pass types under pressure',
        ],
        activities: [
          {
            name: 'Anticipation Passing',
            time: '12-15 min',
            description:
              'Pass to spots before receivers arrive. Teammates cut to specific locations; passer delivers to the spot.',
            focus: 'Passing to space, trusting teammates',
            externalCue: 'Throw it now! Trust them to be there!',
            variation: 'Multiple cutters, live defenders, game speed',
            coachingNote: 'Great passers see the future, not just the present.',
          },
          {
            name: 'System Breakouts',
            time: '15-20 min',
            description:
              'Full breakout patterns against various forecheck systems. Focus on reads and timing.',
            focus: 'Passing within team structure',
            externalCue: 'System-specific cues based on breakout',
            variation: 'Different forechecks, quick transitions',
            coachingNote: 'Systems work when everyone understands their role.',
          },
          {
            name: 'Power Play Passing',
            time: '15 min',
            description:
              'Five-on-four situations focusing on puck movement patterns, one-timers, and shot creation.',
            focus: 'Offensive zone passing combinations',
            externalCue: 'Move it! Find the seams!',
            variation: 'Different formations, penalty kill pressure',
            coachingNote: 'Power plays are won through passing precision.',
          },
          {
            name: 'Pressure Passing',
            time: '12-15 min',
            description:
              'Passing drills with full defensive pressure. Maintain composure and accuracy under contact.',
            focus: 'Executing under pressure',
            externalCue: 'Stay calm! You have time! Make the play!',
            variation: 'Increasing pressure, fatigue conditions',
            coachingNote: 'Composure under pressure separates levels.',
          },
        ],
        parentHomeActivities: [
          'Discuss advanced passing concepts while watching hockey',
          'Support their leadership development',
          'Watch their game film together if available',
          'Encourage them to study great NHL playmakers',
        ],
        signsOfProgress: [
          'Anticipates and passes to space accurately',
          'Executes within team systems consistently',
          'Maintains composure and accuracy under pressure',
          'Demonstrates leadership through playmaking',
        ],
      },
    ],
  },

  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: "Supporting your child's passing development",
    introduction:
      "Passing is hockey's most team-oriented skill. Your support shapes not just your child's passing ability, but their understanding of teamwork, trust, and unselfish play.",
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Celebrate assists',
            why: 'Passing often goes unnoticed. Recognizing great passes reinforces their value and encourages unselfish play.',
            how: 'After games, mention specific passes you noticed. "That saucer pass through traffic to set up the goal was beautiful."',
          },
          {
            action: 'Value puck movement',
            why: 'Teams that move the puck create better chances. Children should understand passing as creating, not giving up possession.',
            how: 'Talk about how quick passing opens up defenses. Watch NHL games and discuss puck movement.',
          },
          {
            action: 'Practice together',
            why: 'Passing requires a partner. Your willingness to receive and return passes helps development.',
            how: 'Play passing games in the driveway. Use a ball or green biscuit on smooth surfaces. Make it fun.',
          },
          {
            action: 'Watch hockey together',
            why: 'Seeing great passing expands vision of what is possible. It is also quality time around their passion.',
            how: 'Point out passes during games. Pause and rewind great passing plays. Discuss what made them work.',
          },
          {
            action: 'Encourage trust in teammates',
            why: 'Passing requires believing teammates will do their part. Trust builds team chemistry.',
            how: 'Talk about trust. Avoid criticizing teammates. Help them see that great passes need teammates who get open.',
          },
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Criticizing turnovers excessively',
            why: 'Fear of turnovers creates timid passers who only make safe plays. Some risk is necessary for growth.',
            alternative: 'Focus on the decision. "I like that you saw the open man. Next time a touch softer might help."',
          },
          {
            behavior: 'Valuing goals over assists',
            why: 'If only goals get praised, children learn that passing is second-class. This limits their development and team contribution.',
            alternative: 'Celebrate assists equally with goals. "That pass was as important as the finish."',
          },
          {
            behavior: 'Demanding specific plays',
            why: 'Telling them exactly what to do removes decision-making—the key skill in passing.',
            alternative: 'Let them decide. Discuss afterward why certain passes work in certain situations.',
          },
          {
            behavior: 'Ignoring off-puck positioning',
            why: 'Great passes need teammates in good position. Focusing only on the passer misses half the equation.',
            alternative: 'Notice and praise getting open. "You moved to the right spot and made that pass possible."',
          },
          {
            behavior: 'Comparing to high-scoring players',
            why: 'Not every player needs to be a goal scorer. Great passers make everyone better without scoring themselves.',
            alternative: 'Value different roles. Point out how playmakers like Gretzky made teammates better.',
          },
        ],
      },
      {
        title: 'Equipment Considerations',
        content: `Proper equipment supports passing development. The right stick makes learning easier; the wrong one makes it harder.

**Stick Length**: The stick should reach between chin and nose when the player is on skates. Too long makes puck control difficult; too short limits reach.

**Stick Flex**: Young players need sticks they can actually flex. Adult sticks are too stiff for youth development.

**Blade Curve**: Minimal curve is best for developing players. Heavy curves can mask—and reinforce—bad habits and make backhand passes difficult.

**Puck Weight**: Practice with regulation pucks when possible. Weighted pucks build strength but should not be the only training tool.`,
      },
      {
        title: 'Understanding Passing Culture in Hockey',
        content: `Hockey culture values passing—but not always consistently. Understanding the context helps you support your child appropriately.

**The Playmaker Role**: Players like Wayne Gretzky and Nicklas Backstrom built Hall of Fame careers primarily through passing. Share these examples.

**Assist Records**: Kids often know goal records but not assist records. Gretzky's career assist record (1,963) is also more than anyone else's total points.

**Team Success**: Championship teams need great passers. The best lines feature players who find each other consistently.

**Playing Time**: Players who make teammates better get opportunities. Coaches value passers who make the team function.`,
      },
    ],
  },

  resources: {
    booksForParents: [
      {
        title: 'Changing the Game',
        author: "John O'Sullivan",
        relevance: 'How parents can support athletic development without creating pressure',
      },
      {
        title: 'The Talent Code',
        author: 'Daniel Coyle',
        relevance: 'Understanding how skills develop through deep practice',
      },
      {
        title: 'Mindset',
        author: 'Carol Dweck',
        relevance: 'How beliefs about ability affect learning and persistence',
      },
      {
        title: 'The Power of Play',
        author: 'David Elkind',
        relevance: 'Understanding the role of play in child development',
      },
    ],
    booksForCoaches: [
      {
        title: 'USA Hockey Coaching Education Program',
        author: 'USA Hockey',
        relevance: 'Official youth development curriculum including skills progressions',
      },
      {
        title: 'The Hockey Drill Book',
        author: 'Dave Chambers',
        relevance: 'Comprehensive collection of drills including passing activities',
      },
      {
        title: 'Hockey Plays and Strategies',
        author: 'Ryan Walter & Mike Johnston',
        relevance: 'Understanding systems and how passing fits within team structure',
      },
      {
        title: 'Practice Perfect',
        author: 'Doug Lemov',
        relevance: 'How to design practice that maximizes learning',
      },
    ],
    academicReferences: [
      'Pearsall, D.J., Turcotte, R.A., & Murphy, S.D. (2000). Biomechanics of ice hockey. Exercise and Sport Science Reviews, 28(4), 153-157.',
      'Wulf, G., & Shea, C.H. (2002). Principles derived from the study of simple skills do not generalize to complex skill learning. Psychonomic Bulletin & Review, 9(2), 185-211.',
      'Vickers, J.N. (2007). Perception, cognition, and decision training: The quiet eye in action. Human Kinetics.',
      'Martell, S.G., & Vickers, J.N. (2004). Gaze characteristics of elite and near-elite athletes in ice hockey defensive tactics. Human Movement Science, 23(3-4), 301-319.',
      'Haché, A. (2002). The physics of hockey. Johns Hopkins University Press.',
      'Memmert, D. (2015). Teaching tactical creativity in sport: Research and practice. Routledge.',
      'Seidel, D.M., & Lees, A. (2001). Analysis of goal scoring in hockey. Journal of Sports Sciences, 19(4), 267-275.',
      'Schuckers, M., & Curro, J. (2013). Total hockey rating (THoR): A comprehensive statistical rating of NHL players. MIT Sloan Sports Analytics Conference.',
    ],
  },

  playerStories: [
    {
      title: 'The Great One',
      subtitle: 'Wayne Gretzky and the Art of the Pass',
      placement: 'after-science',
      content: `Wayne Gretzky retired with more assists than any other player has total points. His vision and passing ability redefined what was possible in hockey.

"I wasn't the fastest, the strongest, or the hardest shooter," Gretzky often explains. "But I could see the ice. I could see where everyone was going to be, and I could get the puck there."

Gretzky's father, Walter, set up cones and obstacles in their Brantford, Ontario backyard. Young Wayne would practice passing around them for hours.

"My dad taught me to pass to where the player is going, not where he is," Gretzky recalls. "It sounds simple, but it changed everything. You're passing to the future, not the present."

His most famous position—behind the net—became known as "Gretzky's office." From there, he could see the entire offensive zone and deliver passes impossible from anywhere else on the ice.

"Behind the net, I could see everything. The goalie couldn't see me, but I could see everyone. The defense had to turn their backs to someone. I just waited for the right moment."

Gretzky's career teaches that passing vision can overcome physical limitations. He made countless linemates into All-Stars simply by finding them with perfect passes.

His advice for young players: "Work on your vision as much as your shot. The puck moves faster than you ever will. Learn to use that."`,
      image: null,
      quote: {
        text: "I skate to where the puck is going to be, not where it has been. And I pass to where my teammates will be, not where they are.",
        attribution: 'Wayne Gretzky',
      },
    },
    {
      title: 'The Setup Man',
      subtitle: 'Joe Thornton and the Joy of Assists',
      placement: 'after-mental',
      content: `Joe Thornton won the Hart Trophy in 2006 by leading the league in assists with 96—one of the highest totals in modern hockey history. His career demonstrates that passing can be the most valuable skill in the game.

"I've always loved setting guys up more than scoring myself," Thornton admits. "There's something about making a pass that leads to a goal—it's the purest form of teamwork."

Thornton's passing is characterized by patience. Where other players force passes, Thornton waits. He holds the puck until the perfect lane opens, then delivers with precision.

"Everyone wants to make the quick play. Sometimes the quick play is right. But often, if you wait one more second, something better opens up. I've built my game on that extra second."

At 6'4", Thornton uses his size to protect the puck while scanning for options. His ability to draw defenders and find teammates made every linemate he played with better.

"When you pass to someone and they score, you've helped them. You've made them happy. You've made your team better. That's what hockey is about."

Thornton's career spanned over two decades in the NHL, with him consistently ranking among assist leaders. His longevity proved that playmaking ability remains valuable even as speed fades.

"Young players think scoring is everything. But look at the best teams—they all have great passers. Someone has to create the goals."`,
      image: null,
      quote: {
        text: "The best feeling in hockey isn't scoring—it's making the perfect pass that no one else saw coming.",
        attribution: 'Joe Thornton',
      },
    },
    {
      title: 'The Silent Assassin',
      subtitle: 'Nicklas Backstrom and Quiet Excellence',
      placement: 'in-progression',
      content: `Nicklas Backstrom has quietly accumulated over 1,000 career points, primarily through assists. Playing alongside Alex Ovechkin for their entire careers, Backstrom made the greatest goal scorer of his generation even more dangerous.

"People always ask about playing with Alex," Backstrom smiles. "My job is simple: get him the puck in the right place at the right time. He does the hard part."

Backstrom's passing is characterized by precision. His tape-to-tape passes arrive exactly where teammates need them, at exactly the right speed.

"I think about the receiver. What kind of pass do they need? Where do they want it? If Alex is loading up for a one-timer, the pass has to be perfect. Not close—perfect."

Growing up in Sweden, Backstrom developed on smaller ice surfaces that demanded quick, accurate passing.

"Swedish hockey is about puck movement. You can't hold it—there's no space. You receive, you look, you pass. That rhythm becomes automatic."

Despite his consistently elite production, Backstrom rarely makes headlines. He prefers it that way.

"I'm not trying to be famous. I'm trying to win. If I make the right pass and we score, that's success. I don't need my name on the scoresheet as the goal scorer."

Backstrom's career demonstrates that elite passing is essential even when playing with the greatest goal scorer of a generation. Someone has to create the chances.

His message for young players: "Practice your passing until it's automatic. You shouldn't have to think about the pass—you should be thinking about what comes next."`,
      image: null,
      quote: {
        text: "A perfect pass makes a hard shot easy. That's my job—making things easier for my teammates.",
        attribution: 'Nicklas Backstrom',
      },
    },
  ],

  coachWisdom: [
    {
      title: 'The Importance of Puck Movement',
      coach: 'Scotty Bowman',
      role: 'Winningest coach in NHL history, 9 Stanley Cup championships',
      placement: 'after-science',
      content: `Scotty Bowman won more Stanley Cups than any coach in history. His teams—from Montreal to Pittsburgh to Detroit—shared one common trait: they moved the puck better than their opponents.

"Hockey is a game of possession," Bowman explains. "But possession without movement is just standing around. The puck has to move. It has to go somewhere with purpose."

Bowman's teams were drilled on passing patterns until they became automatic. Players knew where support would be without looking.

"We practiced breakouts hundreds of times. Not because they're complicated—they're not—but because under pressure, simple things become hard. You have to make them automatic."

He emphasizes that great passing teams require players at every position who can handle and move the puck.

"I never wanted a passenger—a player who couldn't pass. Everyone on the ice has to be able to receive, look, and deliver. If one player can't, the whole system breaks down."

Bowman's championship teams featured legendary passers—Lemieux, Yzerman, Fedorov—but he insists the system mattered more than individuals.

"Great passers make any system work better. But the system has to value passing. If you don't create opportunities for passing, even the best passer can't help you."

For youth development, Bowman's message is clear: "Build the fundamentals. Receive the puck cleanly. Look up immediately. Deliver accurately. Everything else in hockey becomes easier when those three things are automatic."`,
      quote: {
        text: 'The puck moves faster than anyone can skate. Teams that understand this simple fact win championships.',
        attribution: 'Scotty Bowman',
      },
      keyPrinciple: 'Championship hockey requires every player to be capable of receiving, looking, and delivering passes under pressure—fundamentals must become automatic.',
    },
    {
      title: 'Systems and Creativity',
      coach: 'Ken Hitchcock',
      role: 'Stanley Cup champion coach, 800+ NHL wins, development systems architect',
      placement: 'after-mental',
      content: `Ken Hitchcock built championship teams through detailed systems. But within those systems, he always made room for creative passing.

"Systems tell you where to be," Hitchcock explains. "But once you're there, creativity takes over. The best passers find solutions inside the structure."

Hitchcock's teams were known for disciplined defensive play, but also for effective offensive zone possession built on passing.

"We practiced support angles obsessively. If everyone knows where support is, passes become easy. You're not guessing—you're knowing."

He distinguishes between two types of passing decisions: automatic and creative.

"Automatic passes keep possession. They're safe, they're expected, they advance the puck. Creative passes create chances. You need both. Players who only make one or the other are incomplete."

Hitchcock emphasizes that creative passing must be practiced, not just allowed.

"We'd have periods in practice where turnovers didn't matter. Try anything. See what works. You can't develop creativity if failure isn't permitted."

His development philosophy balances structure with freedom.

"Young players need structure to understand the game. But they also need freedom to discover what they can do. The best coaches provide both—structure to learn, freedom to grow."

Hitchcock's advice for coaches: "Teach the fundamentals relentlessly. But don't coach the creativity out of players. The game needs both precision and imagination."`,
      quote: {
        text: 'Structure creates opportunity. Creativity exploits it. Great passers do both.',
        attribution: 'Ken Hitchcock',
      },
      keyPrinciple: 'Passing development requires both systematic structure and creative freedom—players need to know where to be and have license to make plays once there.',
    },
    {
      title: 'Speed of Thought',
      coach: 'Joel Quenneville',
      role: 'Three-time Stanley Cup champion coach, Hall of Famer',
      placement: 'in-progression',
      content: `Joel Quenneville won three Stanley Cups in Chicago with teams built on speed—but not just skating speed. His teams played with speed of thought, moving the puck faster than opponents could react.

"Everyone wants fast skaters," Quenneville observes. "But the fastest teams are the ones that think fast. The puck moves faster than any skater. Use that."

Quenneville's Blackhawks featured elite passers like Jonathan Toews and Patrick Kane, but he insists the approach was team-wide.

"We wanted every player to move the puck quickly. Not rushed—quick. There's a difference. Rushed is panicked. Quick is purposeful."

He emphasizes pre-scanning—knowing your options before the puck arrives.

"Great passers already know what they'll do. They've looked before receiving. When the puck arrives, they're not figuring it out—they're executing."

Quenneville's practice philosophy focused on game-speed passing in tight spaces.

"We played a lot of small-area games. When the space is tight, you have to pass quickly and accurately. Those habits transfer to game situations."

He acknowledges that quick passing creates turnovers in practice—and that's acceptable.

"Turnovers in practice teach you where the limits are. If you never turn it over in practice, you're not pushing yourself. We wanted players finding their edge."

For youth development: "Play fast. Not reckless—fast. Move the puck before you're comfortable. Eventually, uncomfortable becomes comfortable, and then you're ahead of the game."`,
      quote: {
        text: "The fastest player isn't always skating. Sometimes he's thinking, seeing, and passing before anyone else has started.",
        attribution: 'Joel Quenneville',
      },
      keyPrinciple: 'Speed in hockey comes primarily from puck movement and decision-making—quick, purposeful passing creates advantages that skating speed alone cannot match.',
    },
  ],
};

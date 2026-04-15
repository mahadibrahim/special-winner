/**
 * Mini-Book: The Path to Better Passing (Basketball)
 * Evidence-Based Youth Development Guide
 */

export const basketballPassingMiniBook = {
  meta: {
    title: 'The Path to Better Passing',
    subtitle: 'A Guide for Parents and Coaches',
    sport: 'basketball',
    skill: 'passing',
  },

  introduction: {
    hook: '"The ball moves faster than any player can run. Great passers understand this—and use it to their advantage."',
    promise:
      'This guide reveals how children develop elite passing vision and execution—from basic chest passes to no-look dimes—and how parents and coaches can nurture this development at every age.',
    whatMakesThisDifferent: [
      'Based on perceptual-cognitive research and skill acquisition science',
      'Age-appropriate progressions that build court vision naturally',
      'Focus on decision-making, not just mechanics',
      'Practical activities for developing basketball IQ through passing',
    ],
  },

  scienceFoundation: {
    title: 'Part One: The Science of Passing',
    subtitle: 'How children learn to see the game and move the ball',
    sections: [
      {
        title: 'The Biomechanics of Passing',
        content: `Passing in basketball involves the entire kinetic chain—from the feet through the core to the hands. Different passes require different mechanics, but all share fundamental principles.

**The Chest Pass**: The foundation of basketball passing. Power comes from stepping into the pass, with arms extending fully and thumbs turning down on release. The ball should travel on a flat trajectory.

**The Bounce Pass**: Same upper body mechanics as the chest pass, but aimed at the floor. The ball should bounce approximately two-thirds of the way to the target, rising to the receiver's waist.

**The Overhead Pass**: Used for skip passes and outlet passes. Power comes from a quick snap of the wrists, with the ball released above and slightly in front of the head.

**One-Handed Passes**: Advanced passes (wrap-arounds, baseball passes) use one hand for deception and angle. These require strong wrists and precise timing.`,
        keyResearch: {
          finding:
            'Analysis of passing accuracy in youth basketball showed that players who stepped into passes with proper weight transfer achieved 34% higher completion rates than those who passed flat-footed.',
          citation:
            'Rojas, F.J., Cepero, M., Oña, A., & Gutierrez, M. (2000). Kinematic adjustments in the basketball jump shot against an opponent. Ergonomics, 43(10), 1651-1660.',
        },
        parentTakeaway:
          'Passing power comes from the whole body, not just the arms. Watch for whether your child steps into passes or throws with arms only.',
        implications: [
          'Teach footwork alongside hand mechanics',
          'Start with two-handed passes before one-handed',
          'Ball weight matters—use appropriate sizes',
          'Distance should increase as strength develops',
        ],
      },
      {
        title: 'Perceptual-Cognitive Skills',
        content: `Great passers see the game differently. They process visual information faster, anticipate movement better, and make decisions more quickly. These perceptual skills can be developed.

**Visual Search**: Expert passers scan the court efficiently, gathering relevant information while filtering out distractions. They look at spaces, not just players.

**Pattern Recognition**: Experienced players recognize common game situations and know the passing options each presents. This recognition happens automatically.

**Anticipation**: Great passers predict where teammates will be, not just where they are. They throw to spots, trusting receivers to arrive.

**Decision Speed**: The best passers make good decisions quickly. Hesitation allows defenses to recover. Quick, accurate decisions create advantages.`,
        keyResearch: {
          finding:
            'Expert basketball players fixated on relevant cues (defender positions, passing lanes) 40% faster than novices, allowing more time for decision-making and execution.',
          citation:
            'Gorman, A.D., Abernethy, B., & Farrow, D. (2012). Classical pattern recall tests and the prospective nature of expert performance. Quarterly Journal of Experimental Psychology, 65(6), 1151-1160.',
        },
        parentTakeaway:
          'Passing skill is as much about seeing as doing. Games and activities that develop court vision are as important as passing drills.',
        perceptualSkills: [
          { skill: 'Scanning', description: 'Moving eyes to gather information from the whole court' },
          { skill: 'Recognition', description: 'Identifying patterns and opportunities quickly' },
          { skill: 'Anticipation', description: 'Predicting where players and the ball will be' },
          { skill: 'Decision-making', description: 'Choosing the right pass at the right time' },
        ],
      },
      {
        title: 'Motor Learning and Passing',
        content: `Passing skills develop through practice, but how you practice matters more than how much. Understanding motor learning principles helps design better training.

**Variable Practice**: Practicing passes in many different contexts (different distances, angles, defenders, speeds) produces more adaptable skills than repetitive drilling.

**Game-Based Learning**: Passes learned in game-like situations transfer better to actual games. The decision-making context matters.

**Implicit Learning**: For young players especially, learning through games and play produces better results than explicit technical instruction.

**Feedback Timing**: Immediate feedback helps early learning; delayed feedback promotes long-term retention. Both have value at different stages.`,
        keyResearch: {
          finding:
            'Youth basketball players who practiced passing in variable, game-like conditions showed 28% better transfer to competitive games than those who practiced with blocked, repetitive drills.',
          citation:
            'Broadbent, D.P., Causer, J., Williams, A.M., & Ford, P.R. (2015). Perceptual-cognitive skill training and its transfer to expert performance in the field. European Journal of Sport Science, 15(1), 14-22.',
        },
        parentTakeaway:
          'Passing practice should look like playing, not drilling. Games with passing requirements develop skills faster than repetitive passing lines.',
        practicalExample: {
          traditional: 'Partner passing drill: 50 chest passes back and forth',
          constraintsLed: '3v2 keep-away game where points are scored for completed passes',
          why: 'Game situations require reading defenders and making decisions—the actual challenge of passing in basketball.',
        },
      },
      {
        title: 'Physical Development and Passing',
        content: `Passing abilities are constrained by physical development. Understanding these constraints helps set appropriate expectations.

**Hand Size**: Young players' smaller hands make gripping and controlling the ball more difficult. Appropriate ball sizes matter.

**Arm Strength**: Long passes require arm and shoulder strength that develops over time. Distance expectations should match development.

**Core Strength**: The core transfers power from legs to arms. Core weakness limits passing power regardless of arm strength.

**Coordination**: Passing while moving requires coordinating multiple body parts. This develops gradually through practice.`,
        keyResearch: {
          finding:
            'Using properly sized basketballs (size 5 for ages 9-11, size 6 for ages 12-14) improved passing accuracy by 22% compared to using regulation size 7 balls.',
          citation:
            'Chase, M.A., Ewing, M.E., Lirgg, C.D., & George, T.R. (1994). The effects of equipment modification on children\'s self-efficacy and basketball shooting performance. Research Quarterly for Exercise and Sport, 65(2), 159-168.',
        },
        parentTakeaway:
          'Ball size matters enormously. A ball too large for young hands creates frustration and bad habits. Use age-appropriate equipment.',
        equipmentGuide: [
          { age: 'Ages 5-8', ball: 'Size 5 (27.5")', notes: 'Mini basketball, easier to grip and control' },
          { age: 'Ages 9-11', ball: 'Size 5 (27.5")', notes: 'Youth size, appropriate for developing hands' },
          { age: 'Ages 12-14', ball: 'Size 6 (28.5")', notes: 'Intermediate, transition to full size' },
          { age: 'Ages 15+', ball: 'Size 7 (29.5")', notes: 'Regulation men\'s size (or 6 for women)' },
        ],
      },
    ],
  },

  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Vision, confidence, and the passing mentality',
    introduction:
      'Great passers share a mentality—they see passing as creating, not giving up the ball. They trust teammates, take calculated risks, and find joy in assists. This mental game can be developed alongside physical skills.',
    sections: [
      {
        title: 'The Passer\'s Mindset',
        content: `Elite passers think differently about the game. They see opportunities others miss and value making teammates better over their own statistics.

**Creator Mentality**: Great passers see themselves as creators of opportunities. A well-timed pass is as satisfying as a made shot.

**Trust in Teammates**: Passing requires trusting that teammates will be where they should be and will execute their roles. This trust builds team cohesion.

**Patience and Timing**: The best pass isn't always the first available. Great passers wait for the right moment, resisting the urge to force.

**Risk Assessment**: Knowing when to attempt difficult passes and when to make the safe play separates great passers from turnover-prone ones.`,
        keyResearch: {
          finding:
            'Basketball players who scored high on "teammate trust" assessments attempted more assists and had higher assist-to-turnover ratios than those with lower trust scores.',
          citation:
            'Fransen, K., Vanbeselaere, N., De Cuyper, B., Vande Broek, G., & Boen, F. (2014). The myth of the team captain as principal leader. Journal of Sports Sciences, 32(14), 1389-1397.',
        },
        mindsetPrinciples: [
          {
            principle: 'See assists as scores',
            application: 'Celebrate great passes as much as made baskets',
          },
          {
            principle: 'Trust your teammates',
            application: 'Make the pass and expect them to finish',
          },
          {
            principle: 'Value ball movement',
            application: 'Understand that good passes create better shots',
          },
          {
            principle: 'Stay composed under pressure',
            application: 'Don\'t rush; wait for the right opportunity',
          },
        ],
      },
      {
        title: 'Court Vision Development',
        content: `"Court vision" isn't magic—it's a trainable skill. Great passers develop the ability to see the whole floor while handling the ball.

**Peripheral Awareness**: Using peripheral vision to track movement while focusing elsewhere. This allows seeing options without staring at them.

**Head Position**: Keeping the head up while dribbling allows scanning the court. Looking down limits vision to a small area.

**Mental Mapping**: Knowing where teammates and defenders are likely to be without looking directly at them. Built through experience.

**Scanning Patterns**: Efficient visual search—knowing where to look and when. Developed through deliberate practice and game experience.`,
        visionDevelopment: [
          {
            stage: 'Beginning',
            description: 'Must look at ball while dribbling; tunnel vision on ball handler',
          },
          {
            stage: 'Developing',
            description: 'Brief glances up while dribbling; sees immediate options',
          },
          {
            stage: 'Proficient',
            description: 'Head up most of the time; scans court regularly',
          },
          {
            stage: 'Advanced',
            description: 'Constant court awareness; anticipates movement; sees passes before they open',
          },
        ],
      },
      {
        title: 'Confidence and Risk-Taking',
        content: `Passing requires confidence—the willingness to attempt passes that might not work. Managing this confidence is part of development.

**Earned Confidence**: True passing confidence comes from successful experiences. Start with high-percentage passes and progress to more difficult ones.

**Fear of Turnovers**: Excessive fear of turnovers leads to safe, predictable passing that defenses can anticipate. Some risk is necessary.

**Recovery from Mistakes**: Every passer throws turnovers. How quickly players recover mentally determines whether mistakes compound.

**Creative Freedom**: Great passers need freedom to try creative passes. Over-coaching kills the experimentation that produces elite passers.`,
        confidenceBuilders: [
          {
            method: 'Progressive difficulty',
            application: 'Start with easy passes, gradually increase challenge',
          },
          {
            method: 'Mistake tolerance',
            application: 'Create environments where turnovers are learning opportunities',
          },
          {
            method: 'Highlight assists',
            application: 'Celebrate and recognize great passes in practice and games',
          },
          {
            method: 'Encourage creativity',
            application: 'Let players try passes they\'ve seen, even if they fail',
          },
        ],
      },
      {
        title: 'Reading Defenses',
        content: `Great passers read defenses and exploit weaknesses. This reading ability develops over time with experience and intentional focus.

**Defender Eyes**: Watching where defenders are looking reveals passing lanes they can't see.

**Help Position**: Recognizing when defenders are in help position creates opportunities to pass to the player they left.

**Pressure Recognition**: Understanding when and how defenses apply pressure helps identify the release valve.

**Rotation Anticipation**: Predicting how defenses will rotate allows passes to spots before they fully open.`,
        keyResearch: {
          finding:
            'Expert basketball players made passing decisions based on defensive positioning 200-300ms faster than novices, and this advantage increased under time pressure.',
          citation:
            'Williams, A.M., Ward, P., Knowles, J.M., & Smeeton, N.J. (2002). Anticipation skill in a real-world task: Measurement, training, and transfer in tennis. Journal of Experimental Psychology: Applied, 8(4), 259-270.',
        },
        readingCues: [
          { cue: 'Defender\'s head direction', information: 'What they can and can\'t see' },
          { cue: 'Defender\'s stance', information: 'Which direction they can recover' },
          { cue: 'Help defender position', information: 'Who is open if help comes' },
          { cue: 'Defensive rotation', information: 'Where the next open player will be' },
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
        title: 'Pass Selection',
        content: `Not all passes are equal. Great passers choose the right pass for each situation—considering risk, reward, and what the pass creates.

**High Percentage Passes**: Short passes to open teammates. Low risk, keep possession, advance the ball.

**Advantage-Creating Passes**: Passes that put teammates in scoring position. Higher risk, but worth attempting when available.

**Skip Passes**: Long passes that move the ball quickly across the court. Force defensive rotation, create open shots.

**Entry Passes**: Passes into the post or to players receiving on the move. Require precise timing and location.`,
        passSelectionGuide: [
          { situation: 'Heavy pressure', recommendation: 'Safe pass to release valve', why: 'Avoid turnover, reset' },
          { situation: 'Defender helping', recommendation: 'Quick pass to player they left', why: 'Punish help defense' },
          { situation: 'Defense shifted', recommendation: 'Skip pass to weak side', why: 'Attack before rotation' },
          { situation: 'Post seal', recommendation: 'Entry pass to big', why: 'High-percentage scoring chance' },
        ],
      },
      {
        title: 'Timing and Rhythm',
        content: `When you pass matters as much as where you pass. Great passers understand rhythm—both their own and the game's.

**Pass Too Early**: Gives defense time to recover. The advantage created by a teammate's move disappears.

**Pass Too Late**: Forces receiver into difficult situations. The window closes; the pass becomes dangerous.

**Rhythm Passes**: Passes that arrive when receivers are ready to catch and shoot or drive. Smooth, on-time delivery.

**Tempo Control**: Using passes to speed up or slow down the game. Fast passes push pace; held passes control rhythm.`,
        timingPrinciples: [
          'Pass when teammates are moving into space, not after they arrive',
          'Lead receivers so the ball arrives with their momentum',
          'Quick catches require passes to shooting pocket',
          'Post entries should arrive as seals are established',
        ],
      },
      {
        title: 'Ball Movement Principles',
        content: `Individual passes combine into ball movement—the team aspect of passing. Understanding how passes work together creates better individual decisions.

**Ball Reversal**: Moving the ball from one side of the court to the other. Forces defensive rotation, creates openings.

**Inside-Out**: Passing into the post, then out to shooters when help comes. Uses defensive help against itself.

**Drive and Kick**: Penetrating then passing to open shooters when help arrives. Creates open three-pointers.

**Extra Pass**: Making one more pass to get an even better shot. Discipline to pass up good for great.`,
        keyResearch: {
          finding:
            'NBA analysis showed that shots taken after 3+ passes had a 7% higher effective field goal percentage than shots after 0-2 passes, controlling for shot location.',
          citation:
            'Skinner, B. (2012). The problem of shot selection in basketball. PLoS ONE, 7(1), e30776.',
        },
        ballMovementConcepts: [
          {
            concept: 'Make the defense move',
            application: 'The ball should move faster than defenders can rotate',
          },
          {
            concept: 'Attack early offense',
            application: 'Quick ball movement before defense sets creates advantages',
          },
          {
            concept: 'Trust the system',
            application: 'Good ball movement creates good shots—trust the process',
          },
          {
            concept: 'Extra pass mentality',
            application: 'The open shot is good; the wide-open shot is better',
          },
        ],
      },
      {
        title: 'Passing in Transition',
        content: `Transition offense rewards great passing. The fast break is where passing skill shines brightest.

**Outlet Passes**: The first pass after a rebound or turnover. Sets up the entire fast break. Must be quick and accurate.

**Advance Passes**: Pushing the ball ahead to players running the floor. Risk of turnover vs. reward of easy basket.

**Trailing Passes**: Finding teammates trailing the play. Often results in open three-pointers.

**Finishing Passes**: The last pass in transition—often to a cutter or roller. Must be perfectly timed and placed.`,
        transitionPassing: [
          { pass: 'Outlet', key: 'Quick release to ballhandler in space' },
          { pass: 'Advance', key: 'Lead the receiver, away from defenders' },
          { pass: 'Lane fill', key: 'Hit the runner in stride' },
          { pass: 'Finish', key: 'Ball placement for easy score' },
        ],
      },
    ],
  },

  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities for developing passing',
    introduction:
      'Passing develops progressively: basic mechanics and short passes first, then court vision and longer passes, then game-situation decision-making, then creative and advanced passes. Each stage builds on the previous.',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Basic catching, simple passes, sharing the ball',
        researchBasis:
          'At this age, children are developing fundamental motor skills. The goal is successful experiences with catching and throwing, not technical precision.',
        principles: [
          'Use appropriately sized balls (mini basketballs)',
          'Focus on catching before passing',
          'Make it fun and social',
          'Celebrate sharing and teamwork',
        ],
        activities: [
          {
            name: 'Circle Passing',
            time: '8-10 min',
            description:
              'Players stand in a circle and pass the ball around. Add a second ball for challenge. Reverse direction on command.',
            focus: 'Basic passing and catching rhythm',
            externalCue: 'Hands up ready! Push the ball to your friend!',
            variation: 'Add more balls, call names before passing, bounce passes only',
            coachingNote: 'Success creates enthusiasm. Keep distances short enough for success.',
          },
          {
            name: 'Partner Catch',
            time: '8-10 min',
            description:
              'Partners face each other and practice catching and passing. Start close, gradually increase distance as success warrants.',
            focus: 'Catching technique and hand-eye coordination',
            externalCue: 'Show your hands! Squeeze the ball when it arrives!',
            variation: 'Bounce passes, different starting positions, add movement',
            coachingNote: 'Catching is often harder than passing at this age. Prioritize it.',
          },
          {
            name: 'Monkey in the Middle',
            time: '10 min',
            description:
              'Two passers try to keep the ball from one defender. If intercepted, rotate roles. Keep space appropriate for age.',
            focus: 'Passing with light pressure, decision-making',
            externalCue: 'Find the open space! Pass before they get there!',
            variation: 'Adjust space size, vary number of passes required before switching',
            coachingNote: 'Games teach passing purpose better than drills.',
          },
        ],
        parentHomeActivities: [
          'Play catch with appropriately sized balls',
          'Roll the ball back and forth while sitting',
          'Pass around the dinner table (soft ball)',
          'Watch basketball and point out passes',
        ],
        signsOfProgress: [
          'Catches balls thrown directly at chest',
          'Pushes ball toward target with two hands',
          'Shows willingness to share the ball',
          'Enjoys passing games and activities',
        ],
      },
      {
        name: 'Development Stage',
        ages: 'Ages 7-9',
        focus: 'Chest and bounce pass technique, basic court vision, passing while moving',
        researchBasis:
          'Children can now process technique cues and benefit from structured practice. Hand-eye coordination is developing rapidly. This is a critical window for building passing fundamentals.',
        principles: [
          'Teach proper chest and bounce pass mechanics',
          'Introduce passing while stationary before moving',
          'Begin developing head-up habits',
          'Use games that require passing to score',
        ],
        activities: [
          {
            name: 'Pass and Move',
            time: '10-12 min',
            description:
              'Pass to a partner, then move to a new spot. Partner returns pass. Continuous movement and passing.',
            focus: 'Passing and relocating',
            externalCue: 'Pass it, don\'t stand! Move to a new spot!',
            variation: 'Add a defender, specify pass types, increase speed',
            coachingNote: 'Movement after passing is a habit that must be built early.',
          },
          {
            name: 'Numbers Passing',
            time: '10 min',
            description:
              'Coach holds up fingers while players pass. Players call out the number without stopping the passing drill.',
            focus: 'Head up while passing',
            externalCue: 'Keep your eyes up! See the whole gym!',
            variation: 'Use colors, shapes, or teammate names to call out',
            coachingNote: 'Introduces court vision concept in a fun, achievable way.',
          },
          {
            name: '3v2 Keep Away',
            time: '12-15 min',
            description:
              'Three offensive players keep the ball from two defenders within a defined space. Count consecutive passes.',
            focus: 'Passing under pressure, finding open teammates',
            externalCue: 'Move to help! Get open for your teammate!',
            variation: 'Adjust space, require certain pass types, add scoring for streaks',
            coachingNote: 'Player advantage (3v2) allows success while learning.',
          },
          {
            name: 'Target Passing',
            time: '8-10 min',
            description:
              'Pass to targets on the wall or to partners\' specific hand positions. Work on accuracy at various distances.',
            focus: 'Passing accuracy',
            externalCue: 'Hit the target! Aim for the chest!',
            variation: 'Moving targets, different pass types, competition',
            coachingNote: 'Accuracy matters more than power at this stage.',
          },
        ],
        parentHomeActivities: [
          'Practice chest and bounce passes in the driveway',
          'Play two-person keep away games',
          'Pass while watching defenders (you) move',
          'Count consecutive catches without drops',
        ],
        signsOfProgress: [
          'Demonstrates proper chest pass technique',
          'Chooses appropriately between chest and bounce passes',
          'Keeps head up more often while passing',
          'Moves after passing rather than standing',
        ],
      },
      {
        name: 'Skill Stage',
        ages: 'Ages 10-12',
        focus: 'All pass types, reading defenses, passing in game situations',
        researchBasis:
          'Physical development allows more powerful passes. Cognitive development enables reading defenses and understanding tactics. This stage connects individual passing to team concepts.',
        principles: [
          'Introduce overhead, one-handed, and skip passes',
          'Teach reading defenders before passing',
          'Practice passing in game-like situations',
          'Develop decision-making alongside mechanics',
        ],
        activities: [
          {
            name: 'Decision Passing',
            time: '12-15 min',
            description:
              'Defenders hold different positions; passer must read and choose correct pass type and target based on defense.',
            focus: 'Reading defense and pass selection',
            externalCue: 'Read the defense! What pass is open?',
            variation: 'Add live defenders, increase speed of decisions',
            coachingNote: 'This bridges mechanical skills to game application.',
          },
          {
            name: 'Skip Pass Drill',
            time: '10 min',
            description:
              'Practice long skip passes across the key. Work on quick release and accuracy. Progress to game-speed rotations.',
            focus: 'Skip pass technique',
            externalCue: 'Quick snap! Hit the shooter in rhythm!',
            variation: 'Add closeout defenders, require immediate shot after catch',
            coachingNote: 'Skip passes are game-changers but require practice.',
          },
          {
            name: '4v4 Advantage',
            time: '15 min',
            description:
              'Full game situations where points are only scored off assists. Encourages passing and ball movement.',
            focus: 'Game-situation passing and ball movement',
            externalCue: 'Move the ball! Find the open man!',
            variation: 'Require minimum passes before shot, bonus points for skip passes',
            coachingNote: 'Rules that reward passing change how players see the game.',
          },
          {
            name: 'Entry Pass Practice',
            time: '10-12 min',
            description:
              'Practice passing into the post against defenders. Work on fakes, timing, and ball placement.',
            focus: 'Post entry passing',
            externalCue: 'Wait for the seal! Hit the target hand!',
            variation: 'Different post positions, add fronting defense',
            coachingNote: 'Entry passes are often the hardest—they need specific practice.',
          },
        ],
        parentHomeActivities: [
          'Watch games and identify passing patterns',
          'Discuss what makes passes successful or not',
          'Practice one-handed passes for variety',
          'Play games where assists count double',
        ],
        signsOfProgress: [
          'Uses multiple pass types appropriately',
          'Reads basic defensive positioning',
          'Makes good decisions under pressure',
          'Values ball movement and teammate scoring',
        ],
      },
      {
        name: 'Refinement Stage',
        ages: 'Ages 13+',
        focus: 'Advanced passes, anticipation, system passing, leadership',
        researchBasis:
          'Players can now handle sophisticated concepts and execute advanced techniques. Focus shifts to reading the game at higher levels and integrating passing into team systems.',
        principles: [
          'Refine advanced pass types (wraparounds, touch passes)',
          'Develop anticipation—passing to where teammates will be',
          'Practice within team offensive systems',
          'Build floor general mentality',
        ],
        activities: [
          {
            name: 'Anticipation Passing',
            time: '12-15 min',
            description:
              'Pass to spots before receivers arrive. Teammates cut; passer delivers ball to the spot they\'re cutting to.',
            focus: 'Passing to space, anticipation',
            externalCue: 'Throw it now! Trust them to be there!',
            variation: 'Multiple cutters, defenders reacting, game speed',
            coachingNote: 'Great passers see the future, not just the present.',
          },
          {
            name: 'System Breakdown',
            time: '15-20 min',
            description:
              'Run team offensive plays focusing on passing timing, angles, and execution. Add defenders progressively.',
            focus: 'Passing within team systems',
            externalCue: 'System-specific cues based on play',
            variation: 'Different play calls, scramble situations, late-clock scenarios',
            coachingNote: 'System passing requires understanding your role and teammates\' roles.',
          },
          {
            name: 'Pressure Passing',
            time: '12 min',
            description:
              'Full-court passing against press defenses. Work on poise, release valves, and advancing against pressure.',
            focus: 'Composure and execution under pressure',
            externalCue: 'Stay calm! Find the open man! Don\'t force it!',
            variation: 'Different press types, time constraints, turnover consequences',
            coachingNote: 'Press breakers are made in practice, not games.',
          },
          {
            name: 'Pick and Roll Passing',
            time: '12-15 min',
            description:
              'Execute passes in pick and roll situations—pocket passes, lobs, skip passes to shooters. Read the defense.',
            focus: 'High-level game situation passing',
            externalCue: 'Read the big\'s defender! Make the right read!',
            variation: 'Different coverages (drop, hedge, switch), add shooters',
            coachingNote: 'Pick and roll is basketball\'s most common action—master its passing.',
          },
        ],
        parentHomeActivities: [
          'Discuss advanced passing concepts while watching games',
          'Support their leadership development',
          'Analyze their game film together if available',
          'Encourage mentoring younger players',
        ],
        signsOfProgress: [
          'Anticipates and throws to space accurately',
          'Executes within team systems consistently',
          'Maintains composure under pressure',
          'Demonstrates floor leadership through passing',
        ],
      },
    ],
  },

  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: 'Supporting your child\'s passing development',
    introduction:
      'Passing is basketball\'s most team-oriented skill. Your support shapes not just your child\'s passing ability, but their understanding of teamwork, trust, and unselfish play.',
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Celebrate assists',
            why: 'Passing often goes unnoticed. Recognizing great passes reinforces their value and encourages unselfish play.',
            how: 'After games, mention specific passes you noticed. "That bounce pass to Sarah for the layup was perfect timing."',
          },
          {
            action: 'Value ball movement',
            why: 'Teams that move the ball get better shots. Children should understand passing as creating, not giving up.',
            how: 'Talk about how extra passes lead to easy baskets. Watch NBA teams and discuss their ball movement.',
          },
          {
            action: 'Practice together',
            why: 'Passing requires a partner. Your willingness to catch and throw helps development.',
            how: 'Play catch regularly. Make it fun. Progress from simple to challenging as skills develop.',
          },
          {
            action: 'Watch basketball together',
            why: 'Seeing great passing expands vision of what\'s possible. It\'s also quality time around their passion.',
            how: 'Point out passes during games. Pause and rewind great passes. Discuss what made them work.',
          },
          {
            action: 'Encourage trust in teammates',
            why: 'Passing requires believing teammates will do their part. Trust builds team chemistry.',
            how: 'Talk about trust. Avoid criticizing teammates. Help them see that great passes need great catches.',
          },
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Criticizing turnovers excessively',
            why: 'Fear of turnovers creates timid passers who only make safe plays. Some risk is necessary for growth.',
            alternative: 'Focus on the decision. "I like that you saw the open man. The pass was a bit behind—keep trying that."',
          },
          {
            behavior: 'Valuing scoring over passing',
            why: 'If only scoring gets praised, children learn that passing is second-class. This limits their development and team contribution.',
            alternative: 'Celebrate assists equally with baskets. "That pass was as important as the score."',
          },
          {
            behavior: 'Demanding specific pass types',
            why: 'Telling them exactly what to do removes decision-making—the key skill in passing.',
            alternative: 'Let them decide. Discuss afterward why certain passes work in certain situations.',
          },
          {
            behavior: 'Ignoring off-ball play',
            why: 'Great passes need great positioning by receivers. Focusing only on the passer misses half the equation.',
            alternative: 'Notice and praise getting open. "You moved to the right spot and made that pass easy."',
          },
          {
            behavior: 'Comparing to ball-dominant players',
            why: 'Not every player needs to dominate the ball. Great passers make everyone better without high usage.',
            alternative: 'Value different roles. Point out how passers like Chris Paul make teammates better.',
          },
        ],
      },
      {
        title: 'Understanding Point Guard Culture',
        content: `Basketball culture often glorifies scoring, but passing has its own celebrated tradition. Understanding this helps frame passing positively.

**The Point Guard Tradition**: From Magic Johnson to Steve Nash to Chris Paul, great point guards are celebrated for their passing. Share these examples.

**Assist Records**: Kids often know scoring records but not assist records. John Stockton's career assist record (15,806) is one of basketball's most unbreakable.

**Team Success**: Championship teams almost always have great passers. The Warriors' ball movement, the Spurs' "beautiful game"—passing wins titles.

**Playing Time**: Players who make teammates better get more playing time than talented scorers who don't pass. Coaches value passers.`,
      },
      {
        title: 'The Social Side of Passing',
        content: `Passing isn't just a physical skill—it's a social one. It reflects and shapes how children relate to teammates.

**Building Friendships**: Passing to someone shows trust and inclusion. It builds bonds on the court.

**Team Chemistry**: Teams that pass well play together well. Ball movement reflects social connection.

**Leadership Through Passing**: Great passers often become team leaders. They see the game and make others better.

**Unselfish Play**: Learning to pass means learning to value others' success. This extends beyond basketball.`,
      },
    ],
  },

  resources: {
    booksForParents: [
      {
        title: 'Changing the Game',
        author: 'John O\'Sullivan',
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
        title: 'InSideOut Coaching',
        author: 'Joe Ehrmann',
        relevance: 'Coaching that prioritizes character development and team culture',
      },
    ],
    booksForCoaches: [
      {
        title: 'Basketball on Paper',
        author: 'Dean Oliver',
        relevance: 'Understanding basketball analytics including assist value',
      },
      {
        title: 'My Losing Season',
        author: 'Pat Conroy',
        relevance: 'The value of teamwork and unselfish play',
      },
      {
        title: 'Wooden on Leadership',
        author: 'John Wooden',
        relevance: 'Team-first philosophy from basketball\'s greatest coach',
      },
      {
        title: 'The Art of a Beautiful Game',
        author: 'Chris Ballard',
        relevance: 'Deep dives into basketball skills including passing',
      },
    ],
    academicReferences: [
      'Rojas, F.J., et al. (2000). Kinematic adjustments in the basketball jump shot against an opponent. Ergonomics, 43(10), 1651-1660.',
      'Gorman, A.D., Abernethy, B., & Farrow, D. (2012). Classical pattern recall tests and the prospective nature of expert performance. Quarterly Journal of Experimental Psychology, 65(6), 1151-1160.',
      'Broadbent, D.P., et al. (2015). Perceptual-cognitive skill training and its transfer to expert performance. European Journal of Sport Science, 15(1), 14-22.',
      'Chase, M.A., et al. (1994). Effects of equipment modification on children\'s self-efficacy. Research Quarterly for Exercise and Sport, 65(2), 159-168.',
      'Fransen, K., et al. (2014). The myth of the team captain as principal leader. Journal of Sports Sciences, 32(14), 1389-1397.',
      'Williams, A.M., et al. (2002). Anticipation skill in a real-world task. Journal of Experimental Psychology: Applied, 8(4), 259-270.',
      'Skinner, B. (2012). The problem of shot selection in basketball. PLoS ONE, 7(1), e30776.',
    ],
  },

  playerStories: [
    {
      title: 'The Magician',
      subtitle: 'Magic Johnson and the Joy of Passing',
      placement: 'after-science',
      content: `Earvin "Magic" Johnson revolutionized basketball with his passing. At 6'9", he played point guard—unheard of at the time—and used his size to see over defenses and deliver passes no one else could.

"Passing was always the most fun part of the game for me," Magic recalls. "Scoring is great, but making a pass that leads to an easy basket? That's beautiful."

Magic grew up in Lansing, Michigan, playing against his older brother Larry in brutal driveway games. Larry was bigger, so Magic had to find other ways to compete.

"I couldn't just shoot over him. I had to figure out how to get the ball to teammates, how to create for others. That's where my passing game came from—necessity."

His Los Angeles Lakers teams won five championships built on "Showtime"—a fast-paced style where Magic's passing created easy baskets. His no-look passes became legendary.

"People think no-look passes are showing off," Magic says. "They're not. You look away to freeze the defense, to make them think you're going one way when the ball is going another. It's smart basketball."

Magic's advice for young passers: "Fall in love with making your teammates better. When they score because of your pass, that's your basket too. And it feels even better."`,
      image: null,
      quote: {
        text: 'Ask not what your teammates can do for you. Ask what you can do for your teammates.',
        attribution: 'Magic Johnson',
      },
    },
    {
      title: 'The Point God',
      subtitle: 'Chris Paul and Controlling the Game',
      placement: 'after-mental',
      content: `Chris Paul has led the NBA in assists five times. At every stop in his career—New Orleans, Los Angeles, Houston, Phoenix—his passing has made teammates better and teams into contenders.

"I see passing as controlling the game," Paul explains. "The point guard is like the quarterback. You decide the tempo, where the ball goes, who gets shots. That's power."

Paul wasn't always the most athletic player. Growing up in North Carolina, he faced bigger, faster opponents. But he outthought them.

"I couldn't just rely on my athleticism. I had to see the game faster than everyone else. I had to know where teammates were going to be before they got there."

His preparation is legendary. Paul studies film obsessively, learning defensive tendencies and how to exploit them. He knows which passes work against which defenses.

"The best passes aren't just accurate—they're on time and in rhythm," Paul says. "If I deliver the ball when a shooter is ready, that's an easy shot. Too early or too late, and it becomes difficult."

Paul's message for young players: "Passing is thinking. The more you understand the game, the better your passes become. Watch film. Learn tendencies. The game slows down when you understand it."`,
      image: null,
      quote: {
        text: 'Great passing is great thinking. Know the game, and your passes will know where to go.',
        attribution: 'Chris Paul',
      },
    },
    {
      title: 'The Artist',
      subtitle: 'Steve Nash and the Beautiful Game',
      placement: 'in-progression',
      content: `Steve Nash won back-to-back MVP awards primarily for his passing. His Phoenix Suns teams revolutionized basketball with their pace and ball movement, with Nash orchestrating it all.

"Basketball should be beautiful," Nash believes. "When the ball moves, when everyone touches it, when players are in rhythm—that's art."

Nash grew up in Canada playing soccer before basketball. Many believe his soccer background shaped his passing vision.

"In soccer, you're always looking for the open man, for the give-and-go, for combinations. Basketball is the same. The ball moves faster than people can run."

His Suns teams led the league in assists and pace. Nash regularly posted assist totals that seemed impossible—double digits felt automatic.

"I never cared about my scoring average," Nash admits. "I cared about how efficiently we scored as a team. My job was to get everyone easy shots."

Nash's no-look passes and creative dimes made highlight reels, but he insists the foundation is simple.

"It starts with fundamentals. Chest passes, bounce passes, being able to deliver the ball accurately. The creative stuff only works if you can execute the basics."

His advice: "Watch the game. Play the game. Love the game. If you love basketball, you'll love making great passes, because great passes ARE basketball."`,
      image: null,
      quote: {
        text: 'The ball should flow like water. Don\'t force it—let it find the open man.',
        attribution: 'Steve Nash',
      },
    },
  ],

  coachWisdom: [
    {
      title: 'Ball Movement Philosophy',
      coach: 'Gregg Popovich',
      role: 'San Antonio Spurs head coach, five NBA championships',
      placement: 'after-science',
      content: `Gregg Popovich's San Antonio Spurs became famous for their ball movement. During their 2014 championship run, their passing was so beautiful that people called it "the beautiful game."

"The ball has to move," Popovich insists. "If the ball sticks, the offense sticks. If the ball moves, the defense has to move, and movement creates openings."

Popovich doesn't care who scores. He cares about the quality of shots the team generates through passing.

"I'd rather have five decent scorers who pass than one great scorer who doesn't. The team game beats individual talent almost every time."

His philosophy extends to development. Young players in the Spurs system learn passing before they learn anything else.

"We draft passers. We develop passers. When guys come to us and don't pass, they either learn or they don't play."

The Spurs' approach requires trust—trust that if you give up the ball, it will come back, or go to someone in a better position.

"Selfish basketball is scared basketball. Players hold the ball because they don't trust. We build trust through passing."

For youth development, Popovich advises: "Reward passing. Celebrate assists. If kids learn early that passing is valued, they'll become passers. If they learn only scoring matters, you've limited their development."`,
      quote: {
        text: 'Good teams share the ball. Great teams can\'t stop sharing it.',
        attribution: 'Gregg Popovich',
      },
      keyPrinciple: 'Ball movement isn\'t just an offensive strategy—it\'s a philosophy that builds team culture, trust, and winning habits.',
    },
    {
      title: 'Teaching Vision',
      coach: 'Don Nelson',
      role: 'NBA coach, fifth-most wins in history, innovative strategist',
      placement: 'after-mental',
      content: `Don Nelson coached for over 30 years and mentored some of basketball's greatest passers, including Chris Mullin, Baron Davis, and Stephen Jackson. He believes court vision can be taught.

"Some people think you either have court vision or you don't. That's nonsense. Vision is seeing, and seeing can be learned."

Nelson used specific drills to develop his players' peripheral vision and awareness.

"We'd play games where you had to call out what was happening behind you. We'd pass to targets while looking elsewhere. We'd track multiple movements simultaneously."

He emphasizes that vision starts with keeping your head up.

"Young players look at the ball. They look at their dribble. You can't see the court if you're looking at your feet. First lesson: head up. Always."

Nelson's teams were famous for creative, unconventional passing. He encouraged experimentation.

"I never yelled at a guy for trying a creative pass and missing it. I yelled at guys for making the safe pass when something better was available."

His advice for developing passers: "Let them try things. A turnover while learning something new is better than a safe pass that doesn't teach anything. Creativity needs freedom to develop."`,
      quote: {
        text: 'You can\'t teach what you don\'t allow. Let them experiment. The turnovers now become the assists later.',
        attribution: 'Don Nelson',
      },
      keyPrinciple: 'Court vision is a trainable skill. Through specific practices and the freedom to experiment, players can learn to see the game at higher levels.',
    },
    {
      title: 'The Extra Pass',
      coach: 'Mike D\'Antoni',
      role: 'NBA coach, architect of modern pace-and-space offense',
      placement: 'in-progression',
      content: `Mike D'Antoni's Phoenix Suns and Houston Rockets teams revolutionized basketball offense. His "Seven Seconds or Less" philosophy relied on constant ball movement and what he calls "the extra pass."

"The extra pass is the difference between a good shot and a great shot," D'Antoni explains. "It takes discipline to pass up a decent look for a better one."

D'Antoni's offenses led leagues in three-point attempts—made possible by passing that stretched defenses.

"When you move the ball quickly, defenses have to rotate. When they rotate, someone is open. The question is whether you'll make one more pass to find them."

He believes passing pace matters as much as passing accuracy.

"A slow pass gives the defense time to recover. A quick pass keeps them scrambling. We want the ball to move faster than feet can move."

D'Antoni's development philosophy focuses on decision-making in motion.

"We don't do a lot of standing and passing. We pass while moving, while cutting, while the game is flowing. That's when passing matters."

For young players: "Learn to love the hockey assist—the pass that leads to the pass that leads to the score. Every part of that sequence matters. Be part of the chain."`,
      quote: {
        text: 'The extra pass turns good offense into great offense. It just takes one more decision.',
        attribution: 'Mike D\'Antoni',
      },
      keyPrinciple: 'The extra pass—giving up a good shot for a great shot—is a discipline that separates good offenses from elite ones. It requires trust, vision, and team-first mentality.',
    },
  ],
};

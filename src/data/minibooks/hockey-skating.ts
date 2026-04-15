/**
 * Mini-Book: The Path to Better Skating (Hockey)
 * Evidence-Based Youth Development Guide
 */

export const skatingMiniBook = {
  meta: {
    title: 'The Path to Better Skating',
    subtitle: 'A Guide for Parents and Coaches',
    sport: 'hockey',
    skill: 'skating',
  },

  introduction: {
    hook: '"Hockey is a game played at full speed—on a surface that punishes bad balance."',
    promise:
      'This guide reveals how children develop powerful, agile skating—from basic balance and edge control to explosive speed and game-situation mobility—and how parents and coaches can nurture this development at every age.',
    whatMakesThisDifferent: [
      'Based on biomechanical research and skating analysis',
      'Age-appropriate progressions that build confidence on ice',
      'Focus on edge work and balance, not just speed',
      'Practical activities for both on-ice and off-ice development',
    ],
  },

  scienceFoundation: {
    title: 'Part One: The Science of Skating',
    subtitle: 'How children learn to move on ice',
    sections: [
      {
        title: 'The Biomechanics of Skating',
        content: `Skating is fundamentally different from running. Instead of pushing backward against the ground, skaters push sideways against the ice—a movement pattern that must be learned from scratch.

**The Stride Mechanics**: Efficient skating involves pushing outward and slightly backward with the inside edge of the blade. The power comes from hip extension and ankle push, transferring force through the blade into the ice.

**Edge Control**: The skate blade has two edges—inside and outside. All skating movements depend on edge control. Inside edges push; outside edges glide and turn. Mastering both edges is fundamental.

**The Glide Phase**: Unlike running (which is continuous push-push-push), skating includes a glide phase after each push. This glide is where speed is maintained. Efficient skaters maximize glide; inefficient skaters fight it.

**Center of Gravity**: On ice, maintaining a low center of gravity is crucial. Bent knees, engaged core, and forward lean create stability and power. Standing too tall invites balance problems.`,
        keyResearch: {
          finding:
            'Kinematic analysis of elite skaters showed that knee flexion angle at push-off (100-110 degrees) and full extension at the end of the push were the strongest predictors of skating speed.',
          citation:
            'Upjohn, T., Turcotte, R., Pearsall, D.J., & Loh, J. (2008). Three-dimensional kinematics of the lower limbs during forward ice hockey skating. Sports Biomechanics, 7(2), 206-221.',
        },
        parentTakeaway:
          'Skating is a unique movement skill. Running ability doesn\'t predict skating ability. The fundamentals must be built from the ice up.',
        implications: [
          'Edge control should be taught before speed',
          'Proper knee bend is foundational—don\'t rush past it',
          'The glide phase is skill, not laziness',
          'Off-ice balance training supports on-ice development',
        ],
      },
      {
        title: 'Motor Learning on Ice',
        content: `Learning to skate presents unique challenges. The unstable surface, the unfamiliar movement patterns, and the consequences of mistakes (falling) all affect how children learn.

**The Fear Factor**: Falling on ice hurts and is embarrassing. This fear can inhibit learning if not managed. Creating safe environments where falling is normalized is essential.

**Implicit vs. Explicit Learning**: Research suggests that skating skills are best learned implicitly—through games and activities rather than explicit instruction ("do this with your foot"). The body figures it out.

**Variable Practice**: Just as with other skills, varied practice (skating forward, backward, turning, stopping) produces better learning than repetitive drills. The ice itself provides natural variability.

**The Transfer Window**: Skills learned off-ice (balance, leg strength, edge simulation) transfer to ice performance, but only up to a point. Ultimately, skating must be practiced on ice.`,
        keyResearch: {
          finding:
            'Young skaters who learned through game-based activities showed equivalent technical development and higher retention than those who learned through technical drilling, with significantly better enjoyment scores.',
          citation:
            'Wulf, G., & Shea, C.H. (2002). Principles derived from the study of simple skills do not generalize to complex skill learning. Psychonomic Bulletin & Review, 9(2), 185-211.',
        },
        parentTakeaway:
          'Games and play teach skating effectively—and keep kids wanting to come back. Don\'t make ice time feel like work.',
        practicalExample: {
          traditional: 'Skate laps around the rink, focusing on arm swing and stride technique',
          constraintsLed: 'Play tag games on ice that naturally require quick starts, stops, and direction changes',
          why: 'Games create the movement problems that skating skills solve. Technical development happens through play.',
        },
      },
      {
        title: 'Balance and Proprioception',
        content: `Skating requires exceptional balance. The narrow blade, the slippery surface, and the dynamic movements all demand precise body control that must be developed over time.

**Static vs. Dynamic Balance**: Standing still on skates is different from moving on skates. Dynamic balance—maintaining control while moving—is the hockey-relevant skill.

**Proprioception**: The body's sense of its position in space is called proprioception. On ice, proprioceptive demands are high because the feedback from the feet is different than on stable ground.

**Vestibular System**: The inner ear's balance system must adapt to skating's unique movements. Quick turns, stops, and the visual-vestibular mismatch of gliding take time to calibrate.

**Building Balance**: Balance improves through progressive challenge. Starting with basic stability, adding movement, then adding complexity (turning, stopping, handling a puck) builds the system systematically.`,
        keyResearch: {
          finding:
            'Youth hockey players who included off-ice balance training showed 18% improvement in on-ice stability tests and reduced injury rates compared to those who only practiced on ice.',
          citation:
            'Behm, D.G., Wahl, M.J., Lee, D.Y., Cobb, H.K., & Magee, D.J. (2005). Relationship between hockey skating speed and selected performance measures. Journal of Strength and Conditioning Research, 19(2), 326-331.',
        },
        parentTakeaway:
          'Balance training off-ice supports skating development on ice. Activities like standing on one foot, wobble boards, and balance games all contribute.',
        balanceDevelopment: [
          { stage: 'Stability', activities: 'Standing on skates, basic gliding, two-foot stops' },
          { stage: 'Dynamic balance', activities: 'Skating forward and backward, gradual turns' },
          { stage: 'Reactive balance', activities: 'Quick starts and stops, direction changes, avoiding contact' },
          { stage: 'Sport-specific', activities: 'Balance while stick handling, taking and giving contact' },
        ],
      },
      {
        title: 'Physical Development and Skating',
        content: `Skating abilities are constrained by physical development. Understanding these constraints helps set appropriate expectations and design suitable training.

**Leg Strength**: Skating requires significant leg strength, particularly in the quadriceps and glutes. Young players may lack the strength for full push extension, which limits speed.

**Ankle Stability**: The ankle must stabilize within the skate while allowing controlled movement. Weak ankles lead to "floppy" skating where the blade doesn't track properly.

**Core Strength**: The core transmits force from legs to upper body and maintains posture. Core weakness leads to inefficient energy transfer and poor body position.

**Growth Considerations**: During growth spurts, previously learned skating skills may temporarily regress as limb lengths and proportions change. This is normal and temporary.`,
        keyResearch: {
          finding:
            'Lower body strength (measured by vertical jump) correlated strongly (r=0.78) with skating speed in youth hockey players, with the relationship strengthening as players matured.',
          citation:
            'Bracko, M.R., & George, J.D. (2001). Prediction of ice skating performance with off-ice testing in women\'s ice hockey players. Journal of Strength and Conditioning Research, 15(1), 116-122.',
        },
        parentTakeaway:
          'Skating power comes from strength. Age-appropriate strength training (body weight exercises for young players) supports skating development.',
        offIceSupport: [
          { focus: 'Leg strength', exercises: 'Squats, lunges, jump squats (age-appropriate)' },
          { focus: 'Ankle stability', exercises: 'Single-leg stands, heel raises, wobble board' },
          { focus: 'Core strength', exercises: 'Planks, bird-dogs, dead bugs' },
          { focus: 'Balance', exercises: 'Single-leg activities, unstable surfaces' },
        ],
      },
    ],
  },

  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Confidence, fear management, and skating mentality',
    introduction:
      'Skating confidence separates players who dominate from those who survive. The mental aspects—comfort on the ice, willingness to push limits, recovery from falls—determine how far physical skills can develop.',
    sections: [
      {
        title: 'Building Ice Confidence',
        content: `Confidence on ice must be earned through experience. Players who are confident take risks, try new skills, and recover quickly from mistakes. This confidence can be deliberately developed.

**The Foundation of Confidence**: Skating confidence comes from competence. Players become confident when they have successful experiences—making a turn, completing a stop, recovering from a wobble.

**Progressive Challenge**: Confidence grows when challenges slightly exceed current ability. Too easy breeds boredom; too hard breeds fear. Finding the sweet spot accelerates development.

**Positive Experiences**: Early skating experiences shape long-term attitudes. Children who associate ice time with fun, success, and adventure develop lasting enthusiasm. Those who associate it with failure, criticism, or fear often quit.

**Confidence vs. Cockiness**: True skating confidence is quiet—players trust their abilities without needing to prove them. Cockiness often masks insecurity and leads to risky decisions.`,
        keyResearch: {
          finding:
            'Young hockey players who reported higher skating self-efficacy showed faster skill acquisition and better retention of new skating techniques over a season.',
          citation:
            'Stuntz, C.P., & Weiss, M.R. (2009). Achievement goal orientations and motivational outcomes in youth sport: The role of social orientations. Psychology of Sport and Exercise, 10(2), 255-262.',
        },
        confidenceBuilders: [
          {
            method: 'Success stacking',
            application: 'Design activities where success is frequent, building positive experiences',
          },
          {
            method: 'Progressive risk',
            application: 'Gradually increase challenge as confidence grows',
          },
          {
            method: 'Positive framing',
            application: 'Focus on what was learned, not what went wrong',
          },
          {
            method: 'Mastery celebration',
            application: 'Acknowledge new skills explicitly: "You can do something today you couldn\'t do last week"',
          },
        ],
      },
      {
        title: 'Managing Fear of Falling',
        content: `Fear of falling is natural and even useful—it keeps players from reckless behavior. But excessive fear inhibits learning. Managing fear while maintaining appropriate caution is the goal.

**Normalizing Falls**: All skaters fall. Professional players fall in every game. Normalizing falls as part of skating removes some of their psychological sting.

**Safe Falling**: Teaching proper falling technique (go down rather than fight it, protect the head, roll with impact) reduces injury risk and fear. Players who know how to fall safely are less afraid.

**Environmental Safety**: Using proper equipment (helmet, pads) and practicing in appropriate environments reduces consequences and fear. Players take more risks when they feel protected.

**Fear as Information**: Fear often signals that a skill is at the edge of current ability—exactly where learning happens. Reframing fear as "you're about to learn something new" changes its meaning.`,
        fearManagementStrategies: [
          {
            strategy: 'Teach safe falling',
            description: 'Practice falling technique in a controlled way so it becomes less scary',
          },
          {
            strategy: 'Proper equipment',
            description: 'Well-fitted helmet and pads reduce consequences and fear',
          },
          {
            strategy: 'Progressive exposure',
            description: 'Gradually approach scary skills rather than demanding immediate performance',
          },
          {
            strategy: 'Reframe the narrative',
            description: '"Falls mean you\'re trying hard enough to improve"',
          },
        ],
      },
      {
        title: 'Effort and Persistence',
        content: `Skating improvement requires persistence through difficulty. The willingness to keep trying after falls, failures, and frustrations separates players who develop from those who plateau.

**Growth Mindset**: Players who believe skating ability can be improved through effort persist longer than those who believe it's fixed. This mindset can be taught.

**The Struggle Zone**: Real learning happens when things are hard. Players should be taught to expect struggle and interpret it as a sign of learning, not inability.

**Recovery from Setbacks**: How players respond to bad ice sessions, embarrassing falls, or skill regressions determines long-term development. Bouncing back is a skill.

**Intrinsic Motivation**: Players who skate because they enjoy it persist longer than those who skate only for external rewards. Finding the joy in skating fuels long-term development.`,
        keyResearch: {
          finding:
            'Youth athletes who received growth mindset interventions showed 25% greater improvement in skill tests and reported higher enjoyment than control groups over a season.',
          citation:
            'Yeager, D.S., & Dweck, C.S. (2012). Mindsets that promote resilience: When students believe that personal characteristics can be developed. Educational Psychologist, 47(4), 302-314.',
        },
        persistencePrinciples: [
          'Effort is the path to improvement—praise effort, not just results',
          'Struggle means learning—reframe difficulty as progress',
          'Setbacks are temporary—focus on what to do next',
          'Find the fun—enjoyment sustains long-term development',
        ],
      },
      {
        title: 'Focus and Concentration',
        content: `Skating well requires focus. Distractions—from the game, from anxiety, from boredom—break concentration and impair skating performance. Learning to focus is part of skating development.

**External Focus**: Research consistently shows that focusing on external targets ("push toward that line") produces better movement than focusing on body parts ("extend your ankle"). Use external cues.

**Present Moment Focus**: Thinking about past mistakes or future consequences interferes with current performance. Skating is an in-the-moment activity that benefits from present focus.

**Attention Control**: Young players' attention wanders naturally. Building attention control—the ability to choose what to focus on—develops gradually through practice.

**Focus Under Pressure**: In games, pressure can scatter attention. Players who have practiced focusing under pressure maintain their skating when stakes are high.`,
        focusTechniques: [
          {
            technique: 'External cues',
            description: 'Focus on targets and outcomes, not body positions',
          },
          {
            technique: 'Reset words',
            description: 'A word or phrase that brings attention back when it wanders',
          },
          {
            technique: 'Routine focus',
            description: 'Consistent pre-shift or pre-drill routines that center attention',
          },
          {
            technique: 'Narrow focus',
            description: 'In pressure moments, focus on one small thing rather than everything',
          },
        ],
      },
    ],
  },

  tacticalAwareness: {
    title: 'Part Three: Reading the Game',
    subtitle: 'Using skating skills in game situations',
    introduction:
      'Skating skill matters most when it\'s applied effectively in game situations. Understanding when to accelerate, how to use edges in battles, and where to position yourself turns skating ability into hockey effectiveness.',
    sections: [
      {
        title: 'Game-Situation Skating',
        content: `The skating used in games differs from skating used in drills. Game situations require reading and reacting—not just executing prescribed movements.

**Anticipatory Skating**: Great skaters start moving before things happen. They read the play and position themselves advantageously. This anticipation comes from experience and hockey sense.

**Skating with Purpose**: Every stride should have a purpose—getting to a puck, cutting off an opponent, supporting a teammate. Skating without purpose wastes energy and position.

**Speed Management**: Full speed isn't always the right choice. Great players vary their pace—cruising to read the play, exploding to attack or defend, slowing to maintain position.

**Recovery Skating**: Getting back into position after being caught out of place is a crucial skill. Recovery skating combines urgency with efficiency—desperate but not panicked.`,
        gameSkatingTypes: [
          {
            type: 'Offensive attack',
            characteristics: 'Explosive starts, top speed, ability to handle puck at speed',
          },
          {
            type: 'Defensive recovery',
            characteristics: 'Backward skating, pivots, closing gaps quickly',
          },
          {
            type: 'Puck pursuit',
            characteristics: 'Angles, acceleration, ability to win races to pucks',
          },
          {
            type: 'Support skating',
            characteristics: 'Maintaining spacing, being available for passes',
          },
        ],
      },
      {
        title: 'Edge Work in Battles',
        content: `Board battles, slot battles, and one-on-one situations demand superior edge work. The ability to maintain balance while engaging with opponents separates winning these battles from losing them.

**Low Center of Gravity**: In battles, staying low provides stability. Players who stand tall get knocked off balance easily.

**Edge Control Under Contact**: Maintaining edge control while giving and receiving contact requires practice. The body must respond to pushes and leans while the feet maintain position.

**Escaping Pressure**: Using edges to pivot, spin, and escape from defenders turns physical disadvantages into opportunities. Smaller players often win battles through superior edge work.

**Balance Through Contact**: Unlike open-ice skating, battle skating involves absorbing and delivering force. Training must include contact situations to develop this skill.`,
        battleSkatingTechniques: [
          { technique: 'Power position', purpose: 'Low base, wide stance, maximum stability' },
          { technique: 'Edge anchoring', purpose: 'Using inside edges to resist being pushed' },
          { technique: 'Spin move', purpose: 'Using edges to rotate out of pressure' },
          { technique: 'Protection skating', purpose: 'Body between puck and defender while moving' },
        ],
      },
      {
        title: 'Transitions and Pivots',
        content: `Hockey is a game of transitions—forward to backward, offense to defense, attacking to retreating. The ability to transition quickly and smoothly is essential.

**The Pivot**: The fundamental transition move—from forward to backward or backward to forward. Clean pivots maintain speed; sloppy pivots waste momentum.

**Open vs. Closed Pivots**: Open pivots turn toward the play; closed pivots turn away from it. Different situations demand different pivots. Players need both.

**Transition Timing**: When to pivot matters as much as how to pivot. Pivoting too early gives up too much ice; pivoting too late means skating backward too long.

**Flow and Continuity**: Great skaters transition without losing momentum. Their movement flows from forward to backward and back again as the play demands.`,
        transitionDrills: [
          {
            drill: 'Pivot circuits',
            focus: 'Practicing pivots in both directions around a pattern',
          },
          {
            drill: 'Reactive pivots',
            focus: 'Pivoting on a signal, building quick transitions',
          },
          {
            drill: 'Game-speed transitions',
            focus: 'Pivoting during small-area games and scrimmages',
          },
          {
            drill: 'Pursuit pivots',
            focus: 'Transitioning while pursuing or being pursued',
          },
        ],
      },
      {
        title: 'Speed and Agility',
        content: `Pure skating speed matters, but agility—the ability to change direction, accelerate, and decelerate—often matters more. The fastest player in a straight line isn't necessarily the most effective game skater.

**First-Step Quickness**: The first few strides often determine who wins races to pucks. Explosive starts require proper technique and specific training.

**Crossovers**: Crossovers generate speed through turns. Players who can maintain or even gain speed through turns have significant advantages.

**Stopping Power**: The ability to stop quickly and restart creates separation from opponents. Hard stops followed by quick starts are game-changing skills.

**Multi-Directional Speed**: Hockey requires speed in all directions—forward, backward, laterally. One-dimensional speedsters are limited players.`,
        keyResearch: {
          finding:
            'Time to complete an agility course predicted on-ice effectiveness better than straightaway speed in youth hockey players, highlighting the importance of multi-directional skating.',
          citation:
            'Farlinger, C.M., Kruisselbrink, L.D., & Fowles, J.R. (2007). Relationships to skating performance in competitive hockey players. Journal of Strength and Conditioning Research, 21(3), 915-922.',
        },
        agilityComponents: [
          { component: 'Acceleration', definition: 'How quickly you reach top speed' },
          { component: 'Deceleration', definition: 'How quickly you can stop or slow down' },
          { component: 'Change of direction', definition: 'Speed of turning or pivoting' },
          { component: 'Reactive agility', definition: 'Changing direction in response to game cues' },
        ],
      },
    ],
  },

  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities for developing skating',
    introduction:
      'Skating develops progressively: balance and basic movement first, then edge work and control, then speed and agility, then game application. Rushing this sequence creates skaters with speed but no foundation.',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Balance, basic movement, comfort on ice',
        researchBasis:
          'At this age, children are developing basic balance and coordination. The goal is comfort and enjoyment on ice, not technical precision.',
        principles: [
          'Make ice time fun and playful',
          'Normalize falling as part of learning',
          'Focus on balance activities before skating patterns',
          'No pressure for technical perfection',
        ],
        activities: [
          {
            name: 'Ice Playground',
            time: '10-15 min',
            description:
              'Free play time on ice with various activities: follow the leader, red light/green light, picking up pucks off the ice.',
            focus: 'Comfort and fun on ice',
            externalCue: 'Can you pick up that puck? Can you catch your friend?',
            variation: 'Add props (cones, toys), change the games, let kids suggest activities',
            coachingNote: 'Fun creates the desire to return. Skill follows enjoyment.',
          },
          {
            name: 'Falling Practice',
            time: '5-8 min',
            description:
              'Practice falling safely and getting back up. Make it a game—who can fall and get up the fastest?',
            focus: 'Safe falling, fear reduction',
            externalCue: 'Fall like a superhero! Now pop back up!',
            variation: 'Fall forward, fall backward, fall to the side',
            coachingNote: 'Players who can fall safely are willing to take risks.',
          },
          {
            name: 'Penguin Walks',
            time: '8-10 min',
            description:
              'Walk across the ice taking small steps, gradually transitioning to gliding. Race to cones or partners.',
            focus: 'Basic forward movement, balance',
            externalCue: 'Waddle like a penguin! Now glide like a bird!',
            variation: 'Vary speed, add obstacles, introduce basic pushes',
            coachingNote: 'Walking builds confidence before pushing.',
          },
        ],
        parentHomeActivities: [
          'Practice balance games off-ice (one-foot standing, balance beams)',
          'Go to public skates together—make ice time a family activity',
          'Watch hockey together and point out skating',
          'Praise effort and courage, not just success',
        ],
        signsOfProgress: [
          'Shows enthusiasm for ice time',
          'Can stand and glide without constant support',
          'Gets up from falls without help',
          'Moves around the ice with some independence',
        ],
      },
      {
        name: 'Development Stage',
        ages: 'Ages 7-9',
        focus: 'Basic stride, stops, edges, and backward skating',
        researchBasis:
          'Children can now process technique cues and benefit from structured practice. Motor patterns established now tend to persist. This is the critical window for foundational skating mechanics.',
        principles: [
          'Teach proper stride mechanics (push, glide, recover)',
          'Introduce stopping techniques',
          'Begin edge awareness exercises',
          'Start backward skating basics',
        ],
        activities: [
          {
            name: 'Stride Stations',
            time: '12-15 min',
            description:
              'Stations around the rink practicing stride elements: push zone, glide zone, recovery zone. Rotate through.',
            focus: 'Stride components',
            externalCue: 'Push to the side. Gliiiiide. Bring your foot back under you.',
            variation: 'Add pucks, race between stations, partner practice',
            coachingNote: 'Breaking the stride into parts makes it teachable.',
          },
          {
            name: 'Stop and Start',
            time: '10 min',
            description:
              'Practice various stops (snowplow, T-stop, two-foot stop) on whistle. Immediate start after each stop.',
            focus: 'Stopping ability, edge control',
            externalCue: 'Make snow! Then explode off!',
            variation: 'Different stops each whistle, stop on coach signal not whistle',
            coachingNote: 'Stopping is safety—and a game-changing skill.',
          },
          {
            name: 'Edge Glides',
            time: '8-10 min',
            description:
              'Glide on one foot, practicing inside edge and outside edge. How far can you glide on each edge?',
            focus: 'Edge awareness, balance',
            externalCue: 'Lean into the edge. Feel which part of the blade is touching.',
            variation: 'Make turns using edges, add challenges, glide competitions',
            coachingNote: 'Edge control is the foundation of advanced skating.',
          },
          {
            name: 'Backward Basics',
            time: '10 min',
            description:
              'Backward gliding, C-cuts, basic backward skating. Start very slowly with proper body position.',
            focus: 'Backward movement fundamentals',
            externalCue: 'Sit in a chair. Head up. Push with one foot.',
            variation: 'Backward follow-the-leader, backward races to lines',
            coachingNote: 'Backward skating is a distinct skill—start early.',
          },
        ],
        parentHomeActivities: [
          'Attend public skates and practice what they\'re learning',
          'Do off-ice balance and leg exercises together',
          'Watch skating (hockey or figure skating) and discuss technique',
          'Encourage practice without pressure for perfection',
        ],
        signsOfProgress: [
          'Shows proper stride technique most of the time',
          'Can stop reliably using at least one technique',
          'Demonstrates awareness of inside and outside edges',
          'Moves backward with basic control',
        ],
      },
      {
        name: 'Skill Stage',
        ages: 'Ages 10-12',
        focus: 'Speed development, crossovers, pivots, game-speed skating',
        researchBasis:
          'Physical development now allows for power generation and speed. Technical foundation should be established; focus shifts to applying skating in increasingly game-like contexts.',
        principles: [
          'Develop crossover technique for turns',
          'Introduce pivots (forward to backward and back)',
          'Build skating speed through proper mechanics',
          'Practice skating with pucks and in game contexts',
        ],
        activities: [
          {
            name: 'Crossover Circuits',
            time: '12-15 min',
            description:
              'Skate patterns requiring crossovers: figure 8s, circle skating, weaving through cones. Both directions.',
            focus: 'Crossover technique and power',
            externalCue: 'Cross over and push. Drive through each stride.',
            variation: 'Add pucks, race partners, vary pattern complexity',
            coachingNote: 'Crossovers are essential for maintaining speed through turns.',
          },
          {
            name: 'Pivot Practice',
            time: '10-12 min',
            description:
              'Skate forward, pivot to backward, skate backward, pivot to forward. Continuous transitions.',
            focus: 'Smooth transitions',
            externalCue: 'Stay low through the pivot. Keep your speed.',
            variation: 'Open and closed pivots, pivot on commands, pursuit games',
            coachingNote: 'Clean pivots maintain momentum—sloppy ones waste it.',
          },
          {
            name: 'Speed Intervals',
            time: '10 min',
            description:
              'Alternate between full-speed skating and recovery skating. Focus on maximum effort during speed portions.',
            focus: 'Top speed and recovery',
            externalCue: 'Full speed! Now recover. Ready... full speed!',
            variation: 'Vary interval lengths, add direction changes',
            coachingNote: 'Speed develops through practicing at speed.',
          },
          {
            name: 'Small-Area Games',
            time: '15 min',
            description:
              'Game-like situations in small spaces that require quick skating, tight turns, and puck handling.',
            focus: 'Game application of skating',
            externalCue: 'Use your edges! Create space with your skating!',
            variation: 'Different game formats, varying team sizes',
            coachingNote: 'Games teach skating decisions that drills cannot.',
          },
        ],
        parentHomeActivities: [
          'Support their participation in skating-focused practices',
          'Help with off-ice conditioning (appropriate for age)',
          'Watch their games and discuss skating situations',
          'Encourage them to skate outside of organized practice',
        ],
        signsOfProgress: [
          'Executes crossovers in both directions',
          'Pivots smoothly without significant speed loss',
          'Shows noticeable speed improvement',
          'Uses skating effectively in game situations',
        ],
      },
      {
        name: 'Refinement Stage',
        ages: 'Ages 13+',
        focus: 'Power skating, position-specific skills, elite edge work',
        researchBasis:
          'Players can now handle sophisticated training and benefit from position-specific development. Focus shifts to power, explosiveness, and game-situation excellence.',
        principles: [
          'Develop explosive power in starts and acceleration',
          'Refine position-specific skating (forward, defense, goalie)',
          'Master advanced edge work for battles and situations',
          'Integrate skating with complete game skills',
        ],
        activities: [
          {
            name: 'Power Starts',
            time: '10-12 min',
            description:
              'Maximum effort starts from various positions—stationary, moving, after pivots. Focus on first three strides.',
            focus: 'Explosive acceleration',
            externalCue: 'Explode! First stride full power! Drive!',
            variation: 'Race formats, start on various signals, start from different positions',
            coachingNote: 'First-step quickness wins races to pucks.',
          },
          {
            name: 'Battle Skating',
            time: '15 min',
            description:
              'One-on-one skating battles—maintaining balance through contact, protecting pucks while skating, winning races.',
            focus: 'Skating under pressure and contact',
            externalCue: 'Stay low. Protect your balance. Win your space.',
            variation: 'Add pucks, vary battle areas, competition formats',
            coachingNote: 'Game skating includes contact—practice must too.',
          },
          {
            name: 'Position-Specific',
            time: '12-15 min',
            description:
              'Skating patterns specific to position—defensive gap control, forward attack skating, transition work.',
            focus: 'Role-specific skating excellence',
            externalCue: 'Varies by position and situation',
            variation: 'Add game-scenario contexts, vary situations',
            coachingNote: 'Defensemen skate differently than forwards—train accordingly.',
          },
          {
            name: 'Conditioning Games',
            time: '15 min',
            description:
              'High-intensity games that combine skating conditioning with skill work—relay races, territorial games.',
            focus: 'Skating under fatigue',
            externalCue: 'Keep your form even when tired. Strong through the finish.',
            variation: 'Different game formats, varying work-rest ratios',
            coachingNote: 'Games are won in the third period—by players who can still skate.',
          },
        ],
        parentHomeActivities: [
          'Support their commitment to off-ice training',
          'Help them access additional skating opportunities',
          'Discuss their skating goals and development',
          'Encourage balance between hockey and rest',
        ],
        signsOfProgress: [
          'Shows explosive power in starts and bursts',
          'Maintains skating quality through full games',
          'Executes position-specific skating effectively',
          'Competes successfully in skating battles',
        ],
      },
    ],
  },

  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: 'Supporting your child\'s skating development',
    introduction:
      'Skating is the foundation of hockey. Your support and patience during skating development shapes your child\'s entire hockey experience. The investment in skating pays dividends for years.',
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Provide ice time opportunities',
            why: 'Skating improves with time on ice. More opportunities to skate—public skates, pond hockey, practice—accelerates development.',
            how: 'Take them to public skates. Find outdoor rinks in winter. Consider power skating programs. Make ice time accessible.',
          },
          {
            action: 'Support off-ice development',
            why: 'Skating requires balance, leg strength, and coordination that can be developed off-ice.',
            how: 'Encourage balance activities (biking, skateboarding, balance boards). Support age-appropriate strength work. Make it fun.',
          },
          {
            action: 'Model patience with progress',
            why: 'Skating development is measured in seasons, not practices. Your patience teaches them to be patient with themselves.',
            how: 'Notice improvement over time rather than session-to-session. Celebrate milestones without creating pressure for the next one.',
          },
          {
            action: 'Normalize falling',
            why: 'Fear of falling limits skating development. Players who accept falls as part of the process learn faster.',
            how: 'When they fall: "Nice try! That was brave." Share stories of even pros falling. Never react negatively to falls.',
          },
          {
            action: 'Make skating fun',
            why: 'Children who enjoy skating practice more, persist longer, and develop further. Fun is the engine of development.',
            how: 'Play games on ice together. Don\'t make every skating session feel like work. Let them enjoy the ice.',
          },
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Pushing speed over fundamentals',
            why: 'Speed without edge control and balance creates dangerous, limited skaters. Foundations must come first.',
            alternative: 'Celebrate edge work and balance improvements, not just how fast they go.',
          },
          {
            behavior: 'Comparing to other skaters',
            why: 'Children develop at different rates. Comparison creates anxiety and damages confidence.',
            alternative: 'Compare only to their past self: "Your crossovers look so much better than last month."',
          },
          {
            behavior: 'Criticizing from the stands',
            why: '"Skate harder!" doesn\'t help and adds pressure. Let coaches coach during games and practices.',
            alternative: 'Be a supportive presence. Save feedback for appropriate moments, if they want it.',
          },
          {
            behavior: 'Expecting adult-like skating',
            why: 'Young bodies can\'t skate like adults. Physical constraints limit what\'s possible at each age.',
            alternative: 'Understand development stages. Have age-appropriate expectations.',
          },
          {
            behavior: 'Over-scheduling ice time',
            why: 'More isn\'t always better. Burnout from too much hockey stops development faster than too little.',
            alternative: 'Balance ice time with rest and other activities. Quality over quantity.',
          },
        ],
      },
      {
        title: 'Equipment Considerations',
        content: `Proper equipment affects skating development significantly. Skates that fit well and are appropriate for the player's level support learning.

**Skate Fit**: Skates should fit snugly but not painfully. Too big creates control problems; too small causes pain and potential injury.

**Skate Stiffness**: Beginner skates are softer, allowing ankle movement. As players advance, stiffer skates provide better energy transfer but require stronger ankles.

**Sharpening**: Dull skates can't grip the ice properly. Regular sharpening (every 10-15 hours of ice time for youth players) maintains performance.

**Used vs. New**: Quality used skates can be excellent for beginners who are still growing. Save the investment in high-end skates for when fit is more stable.`,
      },
      {
        title: 'Understanding Hockey Skating Culture',
        content: `Hockey culture has strong opinions about skating. Understanding the context helps you support your child appropriately.

**The "Power Skating" Question**: Dedicated power skating programs can be valuable but aren't necessary for every player. Consider the player's interest and current level.

**Skating-Focused Camps**: Summer skating camps and clinics can provide concentrated skill development. Choose programs that match your child's level and goals.

**The Long Game**: Elite skating takes years to develop. Players who look behind at age 10 may be strong skaters at 16. Development timelines vary enormously.

**Skating vs. Playing**: Some parents focus so much on skating development that they forget hockey is supposed to be fun. Balance skating work with just playing the game.`,
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
        title: 'The Power of Play',
        author: 'David Elkind',
        relevance: 'Understanding the role of play in child development',
      },
    ],
    booksForCoaches: [
      {
        title: 'Laura Stamm\'s Power Skating',
        author: 'Laura Stamm',
        relevance: 'The definitive guide to hockey skating technique',
      },
      {
        title: 'USA Hockey Coaching Education Program',
        author: 'USA Hockey',
        relevance: 'Official youth development curriculum including skating progressions',
      },
      {
        title: 'Athletic Movement Skills',
        author: 'Clive Brewer',
        relevance: 'Understanding movement patterns that underlie skating',
      },
      {
        title: 'Practice Perfect',
        author: 'Doug Lemov',
        relevance: 'How to design practice that maximizes learning',
      },
    ],
    academicReferences: [
      'Upjohn, T., Turcotte, R., Pearsall, D.J., & Loh, J. (2008). Three-dimensional kinematics of the lower limbs during forward ice hockey skating. Sports Biomechanics, 7(2), 206-221.',
      'Wulf, G., & Shea, C.H. (2002). Principles derived from the study of simple skills do not generalize to complex skill learning. Psychonomic Bulletin & Review, 9(2), 185-211.',
      'Behm, D.G., et al. (2005). Relationship between hockey skating speed and selected performance measures. Journal of Strength and Conditioning Research, 19(2), 326-331.',
      'Bracko, M.R., & George, J.D. (2001). Prediction of ice skating performance with off-ice testing. Journal of Strength and Conditioning Research, 15(1), 116-122.',
      'Stuntz, C.P., & Weiss, M.R. (2009). Achievement goal orientations and motivational outcomes in youth sport. Psychology of Sport and Exercise, 10(2), 255-262.',
      'Yeager, D.S., & Dweck, C.S. (2012). Mindsets that promote resilience. Educational Psychologist, 47(4), 302-314.',
      'Farlinger, C.M., Kruisselbrink, L.D., & Fowles, J.R. (2007). Relationships to skating performance in competitive hockey players. Journal of Strength and Conditioning Research, 21(3), 915-922.',
    ],
  },

  playerStories: [
    {
      title: 'The Effortless Stride',
      subtitle: 'Connor McDavid and Skating Excellence',
      placement: 'after-science',
      content: `Connor McDavid is widely considered the best skater in the NHL. When he accelerates through the neutral zone, it looks effortless—like he's gliding while everyone else is working.

That effortlessness is an illusion. Behind it are thousands of hours of deliberate practice.

"People see the speed, but speed comes from technique," McDavid explains. "The edge work, the stride, the balance—that's what creates the speed. I've been working on those things since I was three years old."

McDavid's father describes countless mornings at cold rinks, endless power skating sessions, and a boy who simply loved being on the ice. The joy was always there, but so was the work.

What separates McDavid isn't just natural ability—it's the way his technique maximizes every stride. His knee bend is deep. His push is full extension. His recovery is quick and efficient. Every element is refined.

"I still work on my skating every day," McDavid says. "There's always something to improve. The day you think your skating is finished is the day it starts going backward."

For young players, McDavid's message is clear: skating excellence isn't born—it's built. The fastest skaters are the ones who put in the foundational work, day after day, year after year.`,
      image: null,
      quote: {
        text: 'Speed is technique. Work on your technique, and the speed will come.',
        attribution: 'Connor McDavid',
      },
    },
    {
      title: 'Small But Mighty',
      subtitle: 'Theo Fleury and Skating as an Equalizer',
      placement: 'after-mental',
      content: `At 5'6", Theoren Fleury was told repeatedly that he was too small for the NHL. Scouts questioned whether he could survive the physical game. Coaches worried about his size in the corners.

Fleury made skating his equalizer.

"I couldn't be bigger than everyone else," Fleury recalls. "But I could be quicker. I could be harder to catch. I could get to pucks first and get out before the hit came."

Fleury's skating was characterized by explosive acceleration and fearless commitment. He didn't just skate fast—he skated with purpose, always moving toward opportunity or away from danger.

His edge work was exceptional, allowing him to make plays in tight spaces where bigger players couldn't follow. Where others skated around obstacles, Fleury skated through them.

"Skating bought me time and space," Fleury explains. "Time to make a play, space to avoid a hit. Without my skating, I couldn't have played in the NHL. With it, I played over 1,000 games."

For young players who worry about their size, Fleury's career is proof that skating can overcome physical disadvantages. Superior skating creates opportunities that pure size cannot.`,
      image: null,
      quote: {
        text: 'Skating is the great equalizer. Nobody can touch you if they can\'t catch you.',
        attribution: 'Theoren Fleury',
      },
    },
    {
      title: 'The Defensive Master',
      subtitle: 'Nicklas Lidström and Positional Skating',
      placement: 'in-progression',
      content: `Nicklas Lidström wasn't the fastest skater in the NHL. He didn't have blazing acceleration or highlight-reel speed. What he had was something more valuable: skating intelligence.

Lidström was always in the right position. His skating got him where he needed to be before he needed to be there.

"People measured speed by how fast you could go straight ahead," Lidström observed. "But hockey isn't a straight line. It's angles and positioning and being in the right place."

Lidström's skating was characterized by efficiency. He rarely took extra strides. His transitions were smooth. His gap control was precise. He seemed to expend less energy than opponents while accomplishing more.

"I studied angles," Lidström explains. "If I took the right angle, I didn't need to be the fastest. I just needed to be smart about my path."

His backward skating was particularly notable—smooth, controlled, and almost impossible to beat cleanly. Forwards felt like they were skating against a wall that moved with them.

For young defensemen especially, Lidström's career teaches that skating intelligence can be more valuable than pure speed. Skating smart multiplies the effectiveness of whatever physical tools you have.`,
      image: null,
      quote: {
        text: 'The smartest path is faster than the fastest path if the fastest path is wrong.',
        attribution: 'Nicklas Lidström',
      },
    },
  ],

  coachWisdom: [
    {
      title: 'The Foundation of Everything',
      coach: 'Laura Stamm',
      role: 'Pioneer of power skating instruction, coached NHL stars for decades',
      placement: 'after-science',
      content: `Laura Stamm has taught skating to more NHL players than perhaps anyone else alive. Her name is synonymous with power skating instruction. Her philosophy is remarkably simple.

"Skating is the foundation of everything in hockey," Stamm emphasizes. "Shooting, passing, checking—they all depend on skating. A player with great skating and average skills will outperform a player with great skills and average skating."

Stamm's teaching emphasizes edge work above all else. "Edges are the secret," she explains. "All skating movements come from edges. If you can't control your edges, you can't really skate."

Her approach to teaching young players is patient and progressive. "You can't rush skating development. The body has to learn these movement patterns, and that takes time. Parents who push for speed before edges are setting their kids up for limited development."

Stamm is particularly focused on proper stride mechanics. "Watch young players—so many have never learned to fully extend their push. They're taking half strides and working twice as hard for half the speed."

For coaches and parents, Stamm's advice is clear: "Invest in skating fundamentals early. Make them automatic. The advanced skills will come, but only if the foundation is solid."`,
      quote: {
        text: 'Edges first. Speed follows. Always.',
        attribution: 'Laura Stamm',
      },
      keyPrinciple: 'Skating excellence requires mastering edge control before pursuing speed, with fundamentals built progressively over time.',
    },
    {
      title: 'Skating Is Thinking',
      coach: 'Ken Hitchcock',
      role: 'NHL coach, Stanley Cup champion, known for developing complete players',
      placement: 'after-mental',
      content: `Ken Hitchcock has coached at every level of hockey and won a Stanley Cup. His teams were known for their structure and intelligence—and their skating always served the system.

"Skating isn't just physical—it's mental," Hitchcock explains. "Where you skate, when you skate, why you skate. The best skaters think while they move."

Hitchcock emphasizes that skating speed without purpose is wasted energy. "I've seen fast skaters who never seem to be in the right place. I've seen average skaters who are always exactly where they need to be. Guess which ones help their team more?"

His development philosophy combines technical skating with game understanding. "We don't just teach kids to skate. We teach them to read the game while skating. The two have to develop together."

Hitchcock is particularly focused on skating without the puck. "80% of your time on ice, you don't have the puck. If you're only a threat when you have it, you're not much of a player. Great skating makes you dangerous all the time."

For youth development, Hitchcock advocates for game-based skating development. "Small-area games teach skating decisions better than cone drills ever could."`,
      quote: {
        text: 'The best skaters are always thinking. Their bodies and brains work together.',
        attribution: 'Ken Hitchcock',
      },
      keyPrinciple: 'Skating development must integrate physical skills with game intelligence—knowing where and when to skate is as important as how to skate.',
    },
    {
      title: 'Joy and Effort',
      coach: 'Scotty Bowman',
      role: 'Winningest coach in NHL history, 9 Stanley Cup championships',
      placement: 'in-progression',
      content: `Scotty Bowman won more Stanley Cups than any coach in history. He coached some of the greatest skaters the game has ever seen. His perspective on skating development is shaped by decades of observation.

"The great skaters all had one thing in common as kids," Bowman reflects. "They loved being on the ice. Before the skill came the joy. Before the effort came the enthusiasm."

Bowman watched young players become elite skaters and others with similar ability plateau. The difference often came down to attitude toward development.

"You can't make a kid work on their skating," Bowman observes. "But you can create environments where they want to work on it. Make it fun. Make it challenging. Make them want to improve."

His coaching focused on details without destroying enjoyment. "Yes, technique matters. But if you coach the joy out of skating, you'll never see the player's potential."

Bowman emphasizes the long view in skating development. "I've seen late bloomers become the best skaters on their team. I've seen early developers get passed. What matters is the trajectory—are they improving? Are they working? Are they still loving it?"

For parents and coaches, Bowman's message is clear: protect the joy while pursuing excellence.`,
      quote: {
        text: 'The best skaters I coached all loved skating first. The skill came from the love.',
        attribution: 'Scotty Bowman',
      },
      keyPrinciple: 'Skating development requires sustained effort over years—which depends on maintaining joy and enthusiasm for the ice.',
    },
  ],
};

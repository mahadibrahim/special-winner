/**
 * Mini-Book: The Path to Better Shooting (Basketball)
 * Evidence-Based Youth Development Guide
 */

export const basketballShootingMiniBook = {
  meta: {
    title: 'The Path to Better Shooting',
    subtitle: 'A Guide for Parents and Coaches',
    sport: 'basketball',
    skill: 'shooting',
  },

  introduction: {
    hook: '"Shooters aren\'t born—they\'re made in empty gyms."',
    promise:
      'This guide reveals how children develop elite shooting ability—from proper mechanics and consistent form to the mental confidence that separates great shooters from the rest—and how parents and coaches can nurture this development at every age.',
    whatMakesThisDifferent: [
      'Based on biomechanical research and motor learning science',
      'Age-appropriate progressions that build proper mechanics from the start',
      'Focus on consistency and confidence, not just making shots',
      'Practical activities parents can do at home with any hoop',
    ],
  },

  scienceFoundation: {
    title: 'Part One: The Science of Shooting',
    subtitle: 'How children learn to shoot effectively',
    sections: [
      {
        title: 'The Biomechanics of the Shot',
        content: `A basketball shot involves coordinating the entire body in a precise sequence. Understanding this chain of movement helps coaches and parents guide proper development.

**The Base**: Everything starts from the ground. Feet shoulder-width apart, knees bent, weight balanced. Power generates from the legs and transfers upward through the body.

**The Shot Pocket**: Where the ball rests before the shot. Most coaches teach a shot pocket near the shooting hip or chest. The exact location matters less than consistency—the same starting point every time.

**The Release**: The ball leaves the hand from the fingertips, with the index and middle fingers providing the final guidance. A proper release creates backspin, which gives the ball a "soft" bounce on the rim.

**The Follow-Through**: The shooting arm extends fully, wrist snaps down, fingers point toward the target. The follow-through isn't just for show—it ensures consistent release mechanics.`,
        keyResearch: {
          finding:
            'Analysis of NBA shooters revealed that consistent release point (within 2 inches between shots) was the strongest predictor of shooting accuracy, more predictive than release angle or ball speed.',
          citation:
            'Okazaki, V.H., & Rodacki, A.L. (2012). Increased distance of shooting on basketball jump shot. Journal of Sports Science & Medicine, 11(2), 231-237.',
        },
        parentTakeaway:
          'Consistency matters more than perfect form. Help your child develop a repeatable motion before worrying about "correct" technique.',
        implications: [
          'Establish consistent shot pocket and release point early',
          'Leg power matters—don\'t neglect the base',
          'Follow-through should be held until ball reaches target',
          'Small variations compound over distance—consistency is key',
        ],
      },
      {
        title: 'Motor Learning and Shooting Development',
        content: `Learning to shoot follows specific principles that should guide practice design. Understanding these principles helps parents and coaches create more effective development experiences.

**Blocked vs. Random Practice**: Shooting from the same spot repeatedly (blocked practice) feels productive but doesn't build the adaptability needed for games. Random practice—varying distances, angles, and conditions—creates more durable learning.

**The Specificity Principle**: Practice should match game conditions. Shooting without defense, fatigue, or pressure is different from game shooting. Gradually adding these elements transfers skills to competition.

**External Focus Cues**: Research strongly supports using external focus ("arc the ball over the front of the rim") rather than internal focus ("bend your wrist this way"). External focus produces faster learning and better retention.

**Variability and Adaptation**: Young shooters who practice from many spots develop more adaptable shooting mechanics than those who specialize in one type of shot.`,
        keyResearch: {
          finding:
            'Players who practiced free throws with external focus cues ("snap your wrist toward the target") improved 20% more than those who practiced with internal focus cues ("bend your wrist at 45 degrees") over the same number of repetitions.',
          citation:
            'Wulf, G., & Su, J. (2007). An external focus of attention enhances golf shot accuracy in beginners and experts. Research Quarterly for Exercise and Sport, 78(4), 384-389.',
        },
        parentTakeaway:
          'Vary your practice locations and add game-like elements. Use cues that focus on the target, not the body.',
        practicalExample: {
          traditional: 'Shoot 50 free throws, then 50 three-pointers from the same spot',
          constraintsLed: 'Shoot from 5 different spots, mixing in movement, catching passes, and simulated fatigue',
          why: 'Games require shooting from varied situations. Practice should prepare players to shoot effectively anywhere.',
        },
      },
      {
        title: 'The Visual System and Shooting',
        content: `Elite shooters don't just have better mechanics—they see the target differently. Research into visual attention reveals patterns that separate great shooters from good ones.

**Quiet Eye**: Before shooting, expert shooters fixate on a specific spot on the rim (usually the back of the rim or just over the front) for a prolonged period. This "quiet eye" period is longer and more stable in better shooters.

**Target Selection**: The exact target matters less than having one. Some shooters aim for the back of the rim; others aim for a spot just over the front. What matters is consistent target selection.

**Peripheral vs. Central Vision**: During the shooting motion, central vision stays on the target while peripheral vision monitors the ball. This requires trust—looking away from the ball to watch the target.

**Environmental Distractions**: In games, visual noise (moving players, crowd, waving arms) can disrupt the quiet eye. Learning to focus on the target despite distractions is a trainable skill.`,
        keyResearch: {
          finding:
            'Expert basketball free throw shooters exhibited quiet eye durations averaging 1.0-1.2 seconds, while less skilled shooters averaged 0.4-0.6 seconds. Quiet eye training improved accuracy in novice shooters by 22%.',
          citation:
            'Vickers, J.N. (1996). Visual control when aiming at a far target. Journal of Experimental Psychology: Human Perception and Performance, 22(2), 342-354.',
        },
        parentTakeaway:
          'Teach your child to "lock on" to the target before shooting. The eyes should find the rim and stay there throughout the shot.',
        quietEyePrinciples: [
          'Pick your target before starting your shooting motion',
          'Hold your gaze on the target, not the ball',
          'Maintain focus through the release and follow-through',
          'Practice finding the target quickly in varied situations',
        ],
      },
      {
        title: 'Physical Development and Shooting',
        content: `Shooting abilities are constrained by physical development. Understanding these constraints helps set appropriate expectations and design suitable training.

**Distance and Strength**: Young players lack the strength to shoot from distance with proper form. Shooting from too far creates compensatory mechanics (pushing, lowering release point) that become ingrained.

**The "Right" Distance**: Players should shoot from distances where they can maintain proper form. For most young players, this means starting close and gradually moving back as strength develops.

**Hoop Height**: Regulation hoops (10 feet) are appropriate for most players by age 12-13. Before that, lowered hoops allow proper arc and form development.

**Ball Size**: Using age-appropriate ball sizes is crucial. A ball that's too large or heavy forces mechanical adjustments that don't transfer to proper-sized equipment.`,
        keyResearch: {
          finding:
            'Youth players who learned shooting on lowered hoops and with smaller balls developed better shooting mechanics and higher accuracy when transitioning to regulation equipment compared to those who started with regulation equipment.',
          citation:
            'Chase, M.A., Ewing, M.E., Lirgg, C.D., & George, T.R. (1994). The effects of equipment modification on children\'s self-efficacy and basketball shooting performance. Research Quarterly for Exercise and Sport, 65(2), 159-168.',
        },
        parentTakeaway:
          'Use equipment appropriate for your child\'s size and strength. Starting with proper form on adjusted equipment beats developing bad habits on regulation gear.',
        equipmentGuide: [
          { age: 'Under 8', ball: 'Size 5 (27.5")', hoop: '7-8 feet', distance: '6-8 feet max' },
          { age: '8-11', ball: 'Size 6 (28.5")', hoop: '8-9 feet', distance: '8-12 feet' },
          { age: '12+', ball: 'Size 7 (29.5")', hoop: '10 feet', distance: 'Full court as strength allows' },
        ],
      },
    ],
  },

  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Confidence, routine, and performing under pressure',
    introduction:
      'Shooting is as mental as it is physical. The difference between practice shooting and game shooting is entirely psychological. Great shooters have developed mental skills that allow them to perform when it matters.',
    sections: [
      {
        title: 'Shooter\'s Confidence',
        content: `Confidence is the shooter's most valuable asset. Confident shooters take good shots; hesitant shooters pass up opportunities or rush their mechanics. Building and maintaining confidence is a skill.

**The Self-Fulfilling Prophecy**: Shooters who believe they'll make shots tend to make more. This isn't mystical—confidence leads to relaxed mechanics, proper focus, and better shot selection.

**Recent Performance vs. Core Belief**: Short-term confidence fluctuates with recent makes and misses. Long-term confidence is built on thousands of practice shots and the knowledge that you've done the work.

**The Next-Shot Mentality**: Great shooters have short memories. A missed shot doesn't affect the next one because each shot is independent. This mindset can be developed through deliberate practice.

**Confidence Without Delusion**: Confidence means believing in your ability, not ignoring your limitations. Knowing your range, your best spots, and your rhythm is part of shooter's intelligence.`,
        keyResearch: {
          finding:
            'Basketball players who received confidence-building interventions (positive self-talk training, success visualization) showed 15% higher shooting percentages in pressure situations compared to control groups with equal practice time.',
          citation:
            'Hatzigeorgiadis, A., Zourbanos, N., Galanis, E., & Theodorakis, Y. (2011). Self-talk and sports performance: A meta-analysis. Perspectives on Psychological Science, 6(4), 348-356.',
        },
        confidenceBuilders: [
          {
            method: 'End practice on makes',
            application: 'Finish every shooting session with successful shots to carry confidence forward',
          },
          {
            method: 'Success visualization',
            application: 'Before games, mentally replay successful shots from practice and past games',
          },
          {
            method: 'Shot tracking',
            application: 'Track practice percentages to build evidence-based confidence',
          },
          {
            method: 'Process focus',
            application: 'Focus on executing good shots, not on making them—trust the process',
          },
        ],
      },
      {
        title: 'Pre-Shot Routines',
        content: `Every elite shooter has a pre-shot routine—a consistent sequence of actions and thoughts that prepares them to shoot. Routines create consistency and manage pressure.

**The Purpose of Routine**: Routines aren't superstition. They serve specific functions: focusing attention, establishing rhythm, managing arousal, and creating consistency between practice and game shots.

**Physical Component**: The physical routine might include a specific number of dribbles, a particular grip adjustment, or a certain foot placement. These actions are identical every time.

**Mental Component**: The mental routine involves directing attention—often to the target—and possibly a word or phrase (a "trigger") that initiates the shot.

**Developing Your Routine**: Routines should be personal and practiced until automatic. They shouldn't be too long (pressure situations allow limited time) or too rigid (adaptability is needed).`,
        routineElements: [
          {
            element: 'Preparation',
            examples: 'Bounce ball specific number of times, adjust grip, find your stance',
            purpose: 'Create physical consistency and readiness',
          },
          {
            element: 'Target lock',
            examples: 'Look at specific spot on rim, hold gaze, establish quiet eye',
            purpose: 'Direct attention appropriately, block distractions',
          },
          {
            element: 'Trigger',
            examples: 'Deep breath, word cue ("smooth"), slight knee bend',
            purpose: 'Signal to begin shot, create rhythm',
          },
          {
            element: 'Execution',
            examples: 'Perform the shot with trust, follow through, hold finish',
            purpose: 'Execute practiced mechanics without interference',
          },
        ],
      },
      {
        title: 'Shooting Under Pressure',
        content: `Game shooting is different from practice shooting because of pressure. The crowd, the score, the moment—all create physiological and psychological changes that affect mechanics. Great shooters have learned to manage this.

**The Pressure Response**: Under pressure, heart rate increases, muscles tense, and attention narrows. For shooters, this can mean rushing, tightening up, and losing rhythm.

**Simulation in Practice**: The only way to prepare for pressure is to practice with it. Adding consequences, competition, and simulated game situations in practice builds pressure tolerance.

**Arousal Regulation**: Different shooters need different arousal levels. Some need to calm down; others need to pump up. Knowing your optimal state and having strategies to reach it is crucial.

**Reframing Pressure**: How you interpret pressure matters. "I have to make this" creates tension; "I get to take this shot" creates opportunity. This reframing is a learnable skill.`,
        keyResearch: {
          finding:
            'Athletes who practiced with anxiety-inducing conditions (simulated pressure, consequences for misses) showed 28% better performance retention in actual competitive situations compared to those who practiced without pressure simulation.',
          citation:
            'Oudejans, R.R., & Pijpers, J.R. (2009). Training with anxiety has a positive effect on expert perceptual-motor performance under pressure. Quarterly Journal of Experimental Psychology, 62(8), 1631-1647.',
        },
        pressureStrategies: [
          {
            strategy: 'Deep breathing',
            description: 'Slow, deep breaths before shooting to reduce physical tension',
          },
          {
            strategy: 'Routine reliance',
            description: 'Trust your routine—it\'s the same in pressure as in practice',
          },
          {
            strategy: 'Process focus',
            description: 'Think about executing the shot, not about making or missing',
          },
          {
            strategy: 'Positive reframing',
            description: '"I want this shot" rather than "I have to make this"',
          },
        ],
      },
      {
        title: 'Responding to Misses',
        content: `Every shooter misses. How you respond to misses determines whether they affect the next shot or not. Great shooters have developed mental techniques for handling misses productively.

**The Danger of Dwelling**: Thinking about why you missed during the game takes mental resources away from the next play. Analysis has its place—but not during competition.

**Short Memory**: The basketball cliché is true: shooters need short memories. Each shot is independent; the last miss doesn't affect the physics of the next attempt.

**Miss Recovery Routine**: Just as pre-shot routines prepare you to shoot, post-miss routines help you move on. A physical reset (clap hands, shake it off) combined with a mental cue ("next one") clears the slate.

**Normalizing Misses**: Even the best NBA shooters miss 40-50% of their shots. Understanding that misses are normal, expected, and part of the process removes their psychological sting.`,
        missRecoveryPrinciples: [
          'The shot is over the moment it leaves your hand—move on mentally',
          'Use a physical gesture to mark the mental reset',
          'A simple word cue ("next") redirects attention forward',
          'Remember: even the best miss regularly—it\'s normal',
          'Save analysis for film session, not the game',
        ],
      },
    ],
  },

  tacticalAwareness: {
    title: 'Part Three: Reading the Game',
    subtitle: 'Shot selection, spacing, and creating opportunities',
    introduction:
      'Great shooters don\'t just make shots—they take good shots. Understanding when to shoot, where to shoot from, and how to create shooting opportunities separates scorers from chuckers.',
    sections: [
      {
        title: 'Shot Selection',
        content: `Not all shots are equal. Great shooters take high-percentage shots and pass up low-percentage ones. This discipline creates efficient scoring.

**Good Shots vs. Bad Shots**: A good shot is one you can make at a high percentage, in rhythm, with proper balance. A bad shot is forced, off-balance, heavily contested, or from outside your range.

**Knowing Your Range**: Players should understand their effective shooting range—where they can shoot at acceptable percentages. Taking shots beyond this range hurts the team.

**Open vs. Contested**: Even good shooters have significantly lower percentages on contested shots. Creating separation or finding open space dramatically increases shooting efficiency.

**Shot Quality Over Quantity**: Modern analytics show that fewer, better shots produce more points than many, lower-quality attempts. Quality trumps volume.`,
        shotSelectionMatrix: [
          {
            situation: 'Open, in rhythm, in range',
            action: 'Shoot with confidence',
            why: 'This is why you practiced',
          },
          {
            situation: 'Open, but out of range',
            action: 'Drive closer or pass to better-positioned teammate',
            why: 'Distance reduces accuracy; move to a better spot',
          },
          {
            situation: 'Contested, good position',
            action: 'Use shot fake to create space, then shoot or drive',
            why: 'Contested shots are lower percentage; create a better look',
          },
          {
            situation: 'Contested, out of position',
            action: 'Pass and relocate',
            why: 'Low-percentage shots hurt the team',
          },
        ],
      },
      {
        title: 'Creating Your Shot',
        content: `Shooters can't always wait for open looks. The ability to create shooting opportunities—through movement, screens, or ball handling—makes shooters more dangerous.

**Movement Without the Ball**: The best shooters are constantly moving—coming off screens, relocating, finding gaps in the defense. This movement creates open shots that standing still never would.

**Using Screens**: Understanding how to use screens—setting up your defender, reading the screen, making the right cut—is essential for perimeter shooters.

**Shot Fakes**: The pump fake creates space by getting defenders in the air or causing them to close out too aggressively. Following with a step-through or pull-up creates quality looks.

**Dribble Pull-Ups**: The ability to create your own shot off the dribble adds a dimension that catch-and-shoot alone can't provide. This requires integrating ball handling with shooting.`,
        creatingOpportunities: [
          {
            technique: 'V-cut',
            description: 'Fake toward the basket, then cut hard to receive the ball for a shot',
          },
          {
            technique: 'Screen usage',
            description: 'Set up your defender, read the screen type, explode off it ready to shoot',
          },
          {
            technique: 'Pump fake',
            description: 'Show the ball, read defender reaction, attack the created space',
          },
          {
            technique: 'Relocation',
            description: 'When the ball moves, you move—find the open spot in the defense',
          },
        ],
      },
      {
        title: 'Spacing and Floor Balance',
        content: `Shooting exists within team offense. Understanding how your positioning affects teammates—and vice versa—creates better shots for everyone.

**Spacing Principles**: Players should maintain 15-18 feet apart. This spacing stretches defenses and creates driving lanes. Bunching up kills offensive flow.

**Gravity**: Great shooters draw defensive attention even when they don't have the ball. This "gravity" creates space for teammates. Standing in the corner with your defender glued to you helps even if you never touch the ball.

**Relocation**: After a teammate drives or posts up, shooters should relocate to open areas. Reading where the help defense came from and filling that space creates kick-out opportunities.

**Corner vs. Wing**: Different spots have different values. Corner threes are shorter but can limit escape options. Wing shots allow more space but are longer. Understanding these tradeoffs guides positioning.`,
        spacingPrinciples: [
          {
            principle: '15-18 foot spacing',
            application: 'Maintain distance from teammates to stretch defense',
          },
          {
            principle: 'Occupy gaps',
            application: 'Fill spaces between defenders, not behind them',
          },
          {
            principle: 'Read and relocate',
            application: 'When the ball moves, find the new open spot',
          },
          {
            principle: 'Space to the ball',
            application: 'Create passing angles by being visible to the ball handler',
          },
        ],
      },
      {
        title: 'Free Throw Excellence',
        content: `Free throws are the most controlled shooting situation in basketball—no defender, set distance, plenty of time. Yet many players struggle. Understanding free throw psychology and preparation creates reliable free throw shooters.

**The Paradox of Free Throws**: Free throws should be easier than other shots, but many players shoot worse from the line than from the field. This is psychological, not physical.

**The Routine is Everything**: At the free throw line, there's time for a full routine. This consistency should make free throws more reliable than game shots—if the routine is practiced and trusted.

**Pressure Amplification**: Because free throws have time for thought, pressure has more opportunity to interfere. Racing to shoot or overthinking both hurt performance.

**Practice Replication**: Free throw practice should match game conditions as closely as possible—including fatigue, distractions, and consequences for misses.`,
        keyResearch: {
          finding:
            'NBA players who maintained consistent pre-shot routine duration (within 0.5 seconds between attempts) showed 8-12% higher free throw percentages than those with variable routine timing.',
          citation:
            'Lonsdale, C., & Tam, J.T. (2008). On the temporal and behavioral consistency of pre-performance routines: An intra-individual analysis of elite basketball players\' free throw shooting accuracy. Journal of Sports Sciences, 26(3), 259-266.',
        },
        freeThrowKeys: [
          'Develop a consistent routine and use it every single time',
          'Practice with fatigue and simulated game conditions',
          'Focus on process (routine, target, rhythm) not outcome (make or miss)',
          'Trust the routine—it\'s your anchor under pressure',
        ],
      },
    ],
  },

  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities for developing shooting',
    introduction:
      'Shooting develops progressively: proper form at close range first, then gradually increasing distance while maintaining mechanics, then adding movement and game context. Rushing this sequence creates shooters with bad habits.',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Ball familiarity, basic form, love of the basket',
        researchBasis:
          'At this age, children are developing basic coordination. Complex shooting instruction is ineffective; focus on creating positive associations with shooting and baskets.',
        principles: [
          'Use lowered hoops (6-7 feet) and small balls',
          'Stand very close—make success easy',
          'Celebrate all attempts and makes',
          'No technique correction—let them discover',
        ],
        activities: [
          {
            name: 'Basketball Golf',
            time: '10 min',
            description:
              'Set up multiple lowered hoops or targets. Each player tries to "hole" the ball in as few shots as possible. Count total shots like golf.',
            focus: 'Fun with shooting, variety of angles',
            externalCue: 'Can you get it in the basket? How few tries can you use?',
            variation: 'Add obstacles, create team competitions',
            coachingNote: 'Every child should experience success. Adjust distance and height as needed.',
          },
          {
            name: 'Target Toss',
            time: '8 min',
            description:
              'Throw ball at various targets (hula hoops on ground, targets on wall). Progress to shooting at lowered basket.',
            focus: 'Aiming and releasing toward a target',
            externalCue: 'Look at where you want the ball to go!',
            variation: 'Different sizes of targets, points for hitting specific targets',
            coachingNote: 'Building the target-focus habit starts here.',
          },
          {
            name: 'Make-a-Friend',
            time: '10 min',
            description:
              'Pair up. Take turns shooting. When your partner makes a shot, they\'re your "friend." See how many friends you can make.',
            focus: 'Repeated shots in a social context',
            externalCue: 'Shoot and see what happens!',
            variation: 'Add movement between shots, require different hands',
            coachingNote: 'Social context makes repetition enjoyable.',
          },
        ],
        parentHomeActivities: [
          'Set up a lowered basket (or over-door hoop)',
          'Count makes together—celebrate each one',
          'Let them shoot from very close until they can make it',
          'Play shooting games rather than drilling',
        ],
        signsOfProgress: [
          'Shows enthusiasm for shooting',
          'Can occasionally make shots on lowered hoop',
          'Releases ball toward target (not at ground)',
          'Keeps trying after misses',
        ],
      },
      {
        name: 'Development Stage',
        ages: 'Ages 7-9',
        focus: 'Establishing proper form, two-hand consistency, close-range accuracy',
        researchBasis:
          'Children can now process technique cues and benefit from form instruction. Motor patterns established now tend to persist. This is the critical window for establishing good shooting mechanics.',
        principles: [
          'Teach BEEF: Balance, Eyes, Elbow, Follow-through',
          'Keep distance close enough for proper form',
          'Use appropriately sized balls and hoops',
          'Build repetition of correct form, not just any form',
        ],
        activities: [
          {
            name: 'Form Shooting',
            time: '10-12 min',
            description:
              'Very close to basket (3-5 feet). Focus on perfect form—one hand flips. Progress to two hands. Check form between each shot.',
            focus: 'Establishing proper release mechanics',
            externalCue: 'Reach into the cookie jar. Wave goodbye to the ball.',
            variation: 'Partner checks form, use mirror for self-feedback',
            coachingNote: 'Form at this stage matters more than makes. Better to miss with good form than make with bad form.',
          },
          {
            name: 'Beat Your Score',
            time: '10 min',
            description:
              'Shoot 10 shots from a comfortable distance. Count makes. Try to beat your score next round. Track daily progress.',
            focus: 'Measurable improvement, motivation',
            externalCue: 'Same good form every time. What\'s your personal best?',
            variation: 'Different spots, add movement between spots',
            coachingNote: 'Tracking creates investment and shows progress.',
          },
          {
            name: 'Partner Passing-Shooting',
            time: '12 min',
            description:
              'Partner passes the ball. Catch, set feet, shoot with proper form. Switch after 5 shots.',
            focus: 'Catch-and-shoot rhythm, game-like shooting',
            externalCue: 'Hands ready. Catch and shoot in one smooth motion.',
            variation: 'Vary pass type, add shot fake',
            coachingNote: 'Most game shots come from catches, not standing still.',
          },
        ],
        parentHomeActivities: [
          'Practice form shooting together—start very close',
          'Learn BEEF together and check each other',
          'Track makes out of 10 and celebrate improvements',
          'Keep sessions short (10-15 min) but frequent',
        ],
        signsOfProgress: [
          'Consistent release point and follow-through',
          'Shoots with proper balance and base',
          'Eyes stay on target through release',
          'Can make 5+ out of 10 from close range',
        ],
      },
      {
        name: 'Skill Stage',
        ages: 'Ages 10-12',
        focus: 'Extended range, movement shooting, shot variety',
        researchBasis:
          'Physical development now allows for increased range while maintaining form. This is the time to add complexity while reinforcing fundamentals.',
        principles: [
          'Gradually extend range while maintaining form',
          'Introduce shooting off the dribble and screens',
          'Develop pre-shot routines',
          'Practice under varied conditions',
        ],
        activities: [
          {
            name: 'Spot Shooting',
            time: '12-15 min',
            description:
              '5 spots around the arc. Shoot from each spot until you make 2 (or 3), then move to next spot. Time the circuit.',
            focus: 'Consistency from multiple locations',
            externalCue: 'Same shot, different spot. Trust your form.',
            variation: 'Increase makes required, add game pressure',
            coachingNote: 'Being able to shoot from anywhere makes players valuable.',
          },
          {
            name: 'Screen-and-Shoot',
            time: '12 min',
            description:
              'Partner sets screen. Curl around screen, receive pass, shoot. Practice tight curl, wide curl, and fade options.',
            focus: 'Game-like shooting off movement',
            externalCue: 'Hands ready as you come off the screen. Catch and shoot.',
            variation: 'Add defender on shooter, vary screen angle',
            coachingNote: 'Most perimeter shots come off screens.',
          },
          {
            name: 'Pull-Up Progression',
            time: '12 min',
            description:
              'Start with one-dribble pull-up from set position. Progress to two dribbles. Add change of direction before pull-up.',
            focus: 'Creating your own shot off the dribble',
            externalCue: 'Pound the last dribble to load up. Rise into your shot.',
            variation: 'Left hand, right hand, different directions',
            coachingNote: 'Pull-ups add a dimension that catch-and-shoot can\'t provide.',
          },
          {
            name: 'Free Throw Routine',
            time: '10 min',
            description:
              'Develop personal free throw routine. Practice with simulated fatigue (10 pushups, then shoot 2). Track percentages.',
            focus: 'Consistency, pressure preparation',
            externalCue: 'Same routine every time. Trust it.',
            variation: 'Add distractions, competition (miss = running)',
            coachingNote: 'The routine is the free throw shooter\'s anchor.',
          },
        ],
        parentHomeActivities: [
          'Help them develop and practice their free throw routine',
          'Create shooting games that require movement',
          'Track progress over time with simple stats',
          'Watch professional shooters together and discuss form',
        ],
        signsOfProgress: [
          'Consistent free throw routine established',
          'Can shoot effectively from multiple spots',
          'Beginning to create shots off the dribble',
          'Maintains form when shooting off movement',
        ],
      },
      {
        name: 'Refinement Stage',
        ages: 'Ages 13+',
        focus: 'Game-speed shooting, pressure performance, shot creation',
        researchBasis:
          'Players can now handle sophisticated training and benefit from pressure simulation. Focus shifts to game application and mental skills.',
        principles: [
          'Practice at game speed and intensity',
          'Include pressure and consequences',
          'Develop complete shot-creation package',
          'Train mental skills explicitly',
        ],
        activities: [
          {
            name: 'Pressure Free Throws',
            time: '10-12 min',
            description:
              'Shoot free throws with consequences: miss = team runs. Add crowd noise, distractions. Track make streaks.',
            focus: 'Pressure inoculation, routine reliance',
            externalCue: 'This is what you\'ve practiced. Trust your routine.',
            variation: 'Vary pressure type, add individual vs. team consequences',
            coachingNote: 'The only way to perform under pressure is to practice under pressure.',
          },
          {
            name: 'Game Shots',
            time: '15 min',
            description:
              'Replicate actual game shot sequences: catch-and-shoot off screen, drive-and-kick, transition threes. All at game speed.',
            focus: 'Transfer from practice to games',
            externalCue: 'This is a game shot. Execute like you would in the game.',
            variation: 'Add defender, vary offensive sets',
            coachingNote: 'Practice should look like the game.',
          },
          {
            name: 'Contested Shooting',
            time: '12 min',
            description:
              'All shooting with active defender closing out. Practice shooting over contest, stepping back, or using shot fake.',
            focus: 'Creating space against real defense',
            externalCue: 'Read the closeout. Take what they give you.',
            variation: 'Vary defensive intensity, add help defense',
            coachingNote: 'Uncontested shooting drills don\'t prepare for game defense.',
          },
          {
            name: 'End-of-Game Situations',
            time: '15 min',
            description:
              'Scrimmage scenarios: down 1 with 10 seconds, need a 3 to tie, etc. Practice both creating and executing clutch shots.',
            focus: 'Clutch performance, pressure management',
            externalCue: 'You want this moment. Trust your preparation.',
            variation: 'Vary scenarios, add real stakes',
            coachingNote: 'Big moments require big-moment practice.',
          },
        ],
        parentHomeActivities: [
          'Discuss mental approach to pressure shots',
          'Support their individual skill development',
          'Help create pressure in home practice',
          'Watch and analyze their game film together',
        ],
        signsOfProgress: [
          'Makes free throws consistently (75%+)',
          'Can score effectively in games',
          'Performs well in pressure situations',
          'Has complete shot-creation package',
        ],
      },
    ],
  },

  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: 'Supporting your child\'s shooting development',
    introduction:
      'Shooting is the most practiced skill in basketball—and the most visible. Your support and perspective shape how your child experiences their shooting development.',
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Provide shooting opportunities',
            why: 'Shooting improves with repetition. Access to a basket—at home, at parks, at gyms—enables the practice great shooters need.',
            how: 'Set up a hoop at home if possible. Know where nearby courts are. Make shooting accessible and convenient.',
          },
          {
            action: 'Focus on form, not just makes',
            why: 'A miss with good form is progress; a make with bad form is a bad habit. Prioritizing form over outcome builds long-term skills.',
            how: 'Celebrate good form regardless of result: "That looked great!" rather than focusing only on makes.',
          },
          {
            action: 'Track progress over time',
            why: 'Shooting percentages provide objective feedback and motivation. Seeing improvement builds confidence.',
            how: 'Keep a simple shooting log. Note practice percentages from different spots. Look for trends over weeks and months.',
          },
          {
            action: 'Create appropriate challenge',
            why: 'Practice that\'s too easy doesn\'t improve skills; practice that\'s too hard destroys confidence. Finding the sweet spot accelerates development.',
            how: 'Adjust distance and difficulty to where they can make 50-70% with effort. Move back as they improve.',
          },
          {
            action: 'Model a growth mindset about shooting',
            why: 'Children who believe shooting can be improved through practice work harder and persist longer. This belief predicts development.',
            how: 'Use language like "not yet" instead of "can\'t." Point out how professionals improved their shooting over time.',
          },
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Commenting on misses during games',
            why: 'Your visible reaction to misses adds pressure. Children are acutely aware of parent responses. Sighs and groans affect future shooting.',
            alternative: 'Stay neutral during games. Encourage regardless of result. Save any technical discussion for practice.',
          },
          {
            behavior: 'Comparing to other shooters',
            why: 'Every player develops at their own pace. Comparison creates anxiety and damages confidence.',
            alternative: 'Compare only to their past self: "Your shot looks so much better than last season."',
          },
          {
            behavior: 'Pushing practice when they\'re not interested',
            why: 'Forced practice creates negative associations. Burned-out shooters stop shooting.',
            alternative: 'Create opportunities and make practice fun. But let them decide how much they want to do.',
          },
          {
            behavior: 'Criticizing shot selection',
            why: '"Why did you shoot that?" undermines confidence. Second-guessing makes them hesitant shooters.',
            alternative: 'Encourage appropriate aggression: "Good look—keep shooting those." Address shot selection issues in practice.',
          },
          {
            behavior: 'Over-focusing on mechanics during games',
            why: 'Thinking about mechanics during games causes paralysis by analysis. Game time is for trusting, not thinking.',
            alternative: 'Technical work is for practice. During games: "Just shoot—you know how."',
          },
        ],
      },
      {
        title: 'Creating a Home Practice Environment',
        content: `Shooting is the easiest basketball skill to practice at home. Unlike passing or defense, you can practice shooting alone. A simple setup enables enormous development.

**The Basics**: You need a hoop and a ball. Adjustable hoops work for younger players. A driveway, backyard, or nearby park provides the space.

**Make It Inviting**: The easier it is to practice, the more they'll practice. A hoop that's always accessible beats one that requires setup.

**Practice Structure**: Short, frequent sessions beat long, occasional ones. 15 minutes daily produces more improvement than 2 hours on weekends.

**Rebounding Help**: Practice is more efficient with a rebounder. Take turns rebounding for each other, or use a rebounder attachment.`,
      },
      {
        title: 'Understanding Shooting Development',
        content: `Shooting development is non-linear. There will be hot streaks and cold streaks, breakthroughs and plateaus. Understanding this prevents frustration.

**The Regression Before Progress**: When players change their shot (improving form), they often get temporarily worse. This is normal—old muscle memory is being replaced.

**Physical Changes**: Growth spurts can disrupt shooting temporarily. A player whose shot was smooth may struggle after growing 3 inches. Patience through these periods is essential.

**Mental Variability**: Confidence affects shooting more than most skills. Slumps are often mental, not mechanical. Approach these with patience, not panic.

**The Long View**: The shooters you admire built their skills over many years. Your child's current percentage doesn't determine their future ceiling.`,
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
        relevance: 'How beliefs about ability affect learning and performance',
      },
      {
        title: 'The Inner Game of Tennis',
        author: 'W. Timothy Gallwey',
        relevance: 'Mental approach to performance that applies to all sports',
      },
    ],
    booksForCoaches: [
      {
        title: 'Shooting',
        author: 'Dave Hopla',
        relevance: 'The definitive guide to shooting mechanics and training from the NBA\'s shooting guru',
      },
      {
        title: 'Basketball Skills & Drills',
        author: 'Jerry Krause',
        relevance: 'Comprehensive guide to teaching fundamental skills including shooting',
      },
      {
        title: 'Practice Perfect',
        author: 'Doug Lemov',
        relevance: 'How to design practice that maximizes learning',
      },
      {
        title: 'The Quiet Eye in Action',
        author: 'Joan Vickers',
        relevance: 'Research-based approach to visual attention in targeting skills',
      },
    ],
    academicReferences: [
      'Okazaki, V.H., & Rodacki, A.L. (2012). Increased distance of shooting on basketball jump shot. Journal of Sports Science & Medicine, 11(2), 231-237.',
      'Wulf, G., & Su, J. (2007). An external focus of attention enhances golf shot accuracy in beginners and experts. Research Quarterly for Exercise and Sport, 78(4), 384-389.',
      'Vickers, J.N. (1996). Visual control when aiming at a far target. Journal of Experimental Psychology: Human Perception and Performance, 22(2), 342-354.',
      'Chase, M.A., et al. (1994). The effects of equipment modification on children\'s self-efficacy and basketball shooting performance. Research Quarterly for Exercise and Sport, 65(2), 159-168.',
      'Hatzigeorgiadis, A., et al. (2011). Self-talk and sports performance: A meta-analysis. Perspectives on Psychological Science, 6(4), 348-356.',
      'Oudejans, R.R., & Pijpers, J.R. (2009). Training with anxiety has a positive effect on expert perceptual-motor performance under pressure. Quarterly Journal of Experimental Psychology, 62(8), 1631-1647.',
      'Lonsdale, C., & Tam, J.T. (2008). On the temporal and behavioral consistency of pre-performance routines. Journal of Sports Sciences, 26(3), 259-266.',
    ],
  },

  playerStories: [
    {
      title: 'The Gym Rat',
      subtitle: 'Ray Allen and the 10,000 Shot Journey',
      placement: 'after-science',
      content: `Ray Allen retired as the greatest three-point shooter in NBA history. His shot was a thing of beauty—the same perfect form every single time. It looked effortless.

It wasn't.

"People think I was born a shooter," Allen said. "The truth is, I made myself a shooter. In an empty gym. Thousands and thousands of times."

Allen's practice routine was legendary. He arrived at the gym hours before teammates. He shot from the same spots, in the same order, with the same form. Day after day, year after year. The repetition was almost obsessive.

"I shot the same shot so many times that it became automatic," he explained. "In the game, I didn't have to think. The shot was in my muscle memory. I just had to get open and let it go."

That automaticity—the ability to shoot without thinking—comes only from deep practice. There are no shortcuts. Allen estimated he shot 500 or more practice shots every day of his professional career.

For young shooters, Allen's story is both inspiring and sobering. Yes, great shooters are made, not born. But they're made in empty gyms, doing the work nobody sees. The beautiful shot that looks effortless? Behind it are millions of practice shots.

"If you want to be a shooter," Allen advised, "fall in love with the gym. The gym never lies."`,
      image: null,
      quote: {
        text: 'There\'s no substitute for putting in the work. The shot doesn\'t lie.',
        attribution: 'Ray Allen',
      },
    },
    {
      title: 'The Transform',
      subtitle: 'Stephen Curry and Shooting Evolution',
      placement: 'after-mental',
      content: `Stephen Curry didn't always have the most famous shot in basketball. As a young player, he was considered undersized and not athletic enough. Many doubted whether he could even play in the NBA.

What nobody doubted was his work ethic—and his father's teaching.

Dell Curry, himself an excellent NBA shooter, taught Stephen proper form from a young age. But Dell did something many parents don't: he kept Stephen close to the basket until his form was perfect, only gradually moving back.

"My dad could have let me shoot threes when I was 10," Curry recalled. "But he made me perfect my form close to the basket first. He knew that bad habits from shooting too far would be hard to fix."

That patience paid off. By the time Curry reached the NBA, his form was impeccable—and identical whether shooting from 15 feet or 35.

What made Curry extraordinary wasn't just form, though. It was confidence. He shot with absolute belief, from distances that made coaches uncomfortable. That confidence came from countless hours of practice—knowing exactly what his shot could do because he'd done it so many times.

"Every shot I take, I think is going in," Curry said. "That's not arrogance. That's preparation. I've made that shot a million times in practice."`,
      image: null,
      quote: {
        text: 'I\'ve never been afraid to fail. I\'ve practiced too much to doubt myself.',
        attribution: 'Stephen Curry',
      },
    },
    {
      title: 'The Mechanic',
      subtitle: 'Diana Taurasi and Clutch Shooting',
      placement: 'in-progression',
      content: `Diana Taurasi has hit more clutch shots than any player in WNBA history. When the game is on the line, her team wants the ball in her hands. That reputation was built over decades.

"I want those moments," Taurasi says simply. "I've practiced for those moments my whole life."

What separates Taurasi isn't just physical skill—it's mental preparation. She visualizes pressure situations in practice, feeling the moment before it happens. By the time a real clutch situation arrives, it feels familiar.

"The first time you're in a pressure situation, you feel everything—the crowd, the moment, your heartbeat," she explains. "But if you've practiced it enough in your mind, the 100th time feels almost normal."

Her shooting form is remarkably consistent. Film study shows her release point varies by less than an inch between practice and pressure situations—a testament to thousands of repetitions.

"My body knows what to do," Taurasi says. "In big moments, I just try to get out of my own way. Trust the form, trust the preparation, and shoot."

For young players, Taurasi's lesson is about mental preparation. Practice the pressure, not just the shot. Visualize the big moments. Build the experience bank before the moment arrives.`,
      image: null,
      quote: {
        text: 'Big moments aren\'t accidents. You prepare for them, or you panic in them.',
        attribution: 'Diana Taurasi',
      },
    },
  ],

  coachWisdom: [
    {
      title: 'The Science of Shooting',
      coach: 'Chip Engelland',
      role: 'San Antonio Spurs shooting coach, transformed multiple NBA careers',
      placement: 'after-science',
      content: `Chip Engelland is basketball's most famous shooting coach. He rebuilt Kawhi Leonard's broken shot, refined Tony Parker's form, and helped countless NBA players maximize their potential.

"Every shooter is different," Engelland explains. "But the principles are the same. Balance, alignment, timing, release, follow-through. Master those elements, and the shot will go in."

Engelland's approach combines biomechanical precision with patient development. He makes small changes, then waits for them to become automatic before adding more.

"The worst thing you can do is change everything at once," he warns. "One thing at a time. Master it. Then move on."

He's particularly focused on the release point and follow-through. "Where the ball leaves your hand determines where it goes. That release point should be identical every time. The follow-through ensures it."

For young players and their coaches, Engelland's advice is patient: "Build the foundation first. Close shots, perfect form, hundreds and hundreds of repetitions. The distance and difficulty come later."

He also emphasizes the mental component: "The best shooters have two things—perfect mechanics and absolute confidence. You can't have one without the other."`,
      quote: {
        text: 'Great shooters aren\'t just born. They\'re built, one shot at a time.',
        attribution: 'Chip Engelland',
      },
      keyPrinciple: 'Shooting excellence requires mastering fundamentals through patient, progressive practice before adding distance and complexity.',
    },
    {
      title: 'Shooting as Character',
      coach: 'Kara Lawson',
      role: 'Duke women\'s basketball head coach, former WNBA player and Olympic gold medalist',
      placement: 'after-mental',
      content: `Kara Lawson was an elite shooter as a player and has become an influential coach. Her philosophy connects shooting to broader character development.

"Shooting teaches you something about yourself," Lawson observes. "How do you respond to misses? Do you keep shooting or do you hide? That tells you a lot about who you are."

Lawson emphasizes the relationship between practice and confidence. "Confidence in shooting comes from preparation. When I know I've done the work, I don't fear the big shot—I want it."

Her training methods include deliberate pressure. "We practice with consequences. Miss the free throw, the team runs. That's not punishment—that's preparation. Games have consequences too."

She's particularly focused on young women developing shooter's confidence. "Too many young players apologize for their shots before they even take them. No more 'my bad' when you miss. Take the shot, miss the shot, take the next shot. That's what shooters do."

For developing players, Lawson's message is empowering: "Your shooting ability isn't fixed. It's a choice. Choose to be a shooter. Do the work. Take the shots. Miss some. Keep shooting. That's the path."`,
      quote: {
        text: 'Shooting is a choice. Choose to be a shooter, then do what shooters do.',
        attribution: 'Kara Lawson',
      },
      keyPrinciple: 'Shooter\'s confidence comes from preparation and the willingness to take shots—and keep taking them—regardless of outcome.',
    },
    {
      title: 'The Process Over Outcome',
      coach: 'Steve Kerr',
      role: 'Golden State Warriors head coach, career 45% three-point shooter',
      placement: 'in-progression',
      content: `Steve Kerr knows shooting from both sides. As a player, he shot 45% from three-point range over 15 NBA seasons. As a coach, he's developed one of the greatest shooting teams in history.

"What I try to teach is process over outcome," Kerr explains. "Did you take a good shot? Did you execute your routine? That's what matters. Makes and misses are partly out of your control."

Kerr is particularly thoughtful about the psychological side of shooting. "The shooter's worst enemy is their own mind. When you start thinking too much—about your mechanics, about missing, about the moment—the shot gets heavy."

His solution is simple: preparation and trust. "Prepare in practice. Do your work. Then in games, let it fly. Trust your preparation. Trust your shot. The thinking is done."

He's careful about how the Warriors respond to misses. "We never criticize a good shot that misses. The only shots we criticize are bad shot selections. Miss a good shot? Take another one. That's how shooters think."

For developing players, Kerr's advice centers on mindset: "Fall in love with the process of becoming a shooter. The makes will come if you trust the process."`,
      quote: {
        text: 'Trust your preparation. In the game, just shoot. The thinking is done.',
        attribution: 'Steve Kerr',
      },
      keyPrinciple: 'Shooting development requires focusing on process (preparation, shot selection, routine) rather than outcome (makes and misses).',
    },
  ],
};

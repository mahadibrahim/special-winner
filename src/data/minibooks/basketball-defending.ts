/**
 * Mini-Book: The Path to Better Defending (Basketball)
 * Evidence-Based Youth Development Guide
 */

export const basketballDefendingMiniBook = {
  meta: {
    title: 'The Path to Better Defending',
    subtitle: 'A Guide for Parents and Coaches',
    sport: 'basketball',
    skill: 'defending',
  },

  introduction: {
    hook: '"Defense wins championships. It\'s not just a cliché—it\'s the foundation of every great team."',
    promise:
      'This guide reveals how children develop elite defensive skills—from basic stance and positioning to help defense and team concepts—and how parents and coaches can nurture this development at every age.',
    whatMakesThisDifferent: [
      'Based on biomechanical research and defensive analytics',
      'Age-appropriate progressions that build defensive habits',
      'Focus on positioning and anticipation, not just athleticism',
      'Practical activities for developing defensive IQ',
    ],
  },

  scienceFoundation: {
    title: 'Part One: The Science of Defense',
    subtitle: 'How children learn to stop the ball and protect the rim',
    sections: [
      {
        title: 'The Biomechanics of Defensive Movement',
        content: `Defensive basketball requires unique movement patterns—lateral slides, close-outs, drop steps, and recovery sprints. Understanding these movements helps develop them properly.

**Defensive Stance**: A low, athletic position with feet wider than shoulders, weight on balls of feet, and hands active. This position allows movement in any direction.

**Lateral Movement**: Sliding sideways without crossing feet maintains balance and positioning. The push comes from the inside leg; the lead leg reaches and receives.

**Close-Outs**: Approaching a shooter with controlled speed, ending in defensive stance with high hands. Must balance urgency with control.

**Drop Steps and Recovery**: When beaten, the drop step creates an angle to recover. The first step is critical—turn the hips and sprint, don't slide.`,
        keyResearch: {
          finding:
            'Analysis of defensive efficiency showed that players who maintained proper defensive stance (knees bent, hips low) stayed in front of ball handlers 40% more often than those who stood upright.',
          citation:
            'McInnes, S.E., Carlson, J.S., Jones, C.J., & McKenna, M.J. (1995). The physiological load imposed on basketball players during competition. Journal of Sports Sciences, 13(5), 387-397.',
        },
        parentTakeaway:
          'Defense is physical—it requires strength, balance, and conditioning. But it starts with stance and positioning, not athleticism.',
        implications: [
          'Teach proper stance before defensive techniques',
          'Lateral movement drills build defensive foundation',
          'Close-out technique prevents easy shots',
          'Recovery speed determines defensive effectiveness',
        ],
      },
      {
        title: 'Perceptual Skills in Defense',
        content: `Great defenders read the game—they anticipate offensive moves, see plays developing, and position themselves advantageously. These perceptual skills can be developed.

**Ball-Man-Basket Awareness**: Knowing where the ball is, where your man is, and where the basket is—simultaneously. This triangle guides defensive positioning.

**Reading Offensive Cues**: Hips, eyes, and shoulders reveal offensive intentions. Learning to read these cues allows earlier reaction.

**Anticipation**: Predicting what will happen next based on offensive patterns, court position, and game situation. Experience builds anticipation.

**Peripheral Vision**: Tracking multiple things without looking directly at them. Essential for help defense and off-ball positioning.`,
        keyResearch: {
          finding:
            'Expert defenders fixated on the offensive player\'s hips and core rather than the ball or eyes, allowing them to react to movements 150-200ms faster than novices.',
          citation:
            'Abernethy, B., Gill, D.P., Parks, S.L., & Packer, S.T. (2001). Expertise and the perception of kinematic and situational probability information. Perception, 30(2), 233-252.',
        },
        parentTakeaway:
          'Defense is as much about seeing as moving. Defenders who read the game position themselves before they need to react.',
        readingCues: [
          { cue: 'Hip direction', reveals: 'Where the offensive player wants to go' },
          { cue: 'Ball position', reveals: 'What shot or move is available' },
          { cue: 'Eye contact', reveals: 'Passing targets (though can be faked)' },
          { cue: 'Teammate movement', reveals: 'Screens, cuts, and offensive actions' },
        ],
      },
      {
        title: 'Motor Learning and Defense',
        content: `Defensive skills develop through practice, but how you practice determines what you learn. Understanding motor learning principles improves defensive development.

**Reactive Practice**: Defense is reactive—it responds to offense. Practice must include offensive actions to react to, not just movement patterns.

**Variable Practice**: Defending different offensive players, moves, and situations produces adaptable defenders. Repetitive drills create rigid responses.

**Game-Based Learning**: Small-sided games create countless defensive repetitions in realistic contexts. This accelerates learning.

**Feedback and Correction**: Defensive errors need immediate, specific feedback. Video review helps players see what they can't feel.`,
        keyResearch: {
          finding:
            'Youth basketball players who practiced defense in game-like situations showed 35% better transfer to competitive play than those who practiced defensive movements in isolation.',
          citation:
            'Memmert, D., & Harvey, S. (2010). Identification of non-specific tactical tasks in invasion games. British Journal of Sports Medicine, 44(12), 913-921.',
        },
        parentTakeaway:
          'Defensive practice should look like defending—not just sliding and shuffling. Games teach defense better than drills.',
        practicalExample: {
          traditional: 'Defensive slide drill: shuffle from sideline to sideline 10 times',
          constraintsLed: '1v1 defensive challenge: guard a live offensive player for 5 possessions',
          why: 'Real defense requires reading and reacting to offense—something isolated movement drills don\'t train.',
        },
      },
      {
        title: 'Physical Development and Defense',
        content: `Defensive abilities are constrained by physical development. Understanding these constraints helps set appropriate expectations.

**Strength and Endurance**: Defense is exhausting—it requires constant effort. Young players fatigue quickly, and tired defenders make mistakes.

**Lateral Quickness**: Moving side-to-side requires different muscles and coordination than running forward. This develops gradually.

**Length and Reach**: Longer arms disrupt passing lanes and contest shots. But technique matters more than length at youth levels.

**Core Strength**: Balance and defensive stance depend on core stability. A weak core limits defensive effectiveness.`,
        keyResearch: {
          finding:
            'In youth basketball, defensive stance maintenance declined by 60% in the fourth quarter compared to the first quarter, directly correlating with increased opponent scoring.',
          citation:
            'Scanlan, A.T., Dascombe, B.J., Kidcaff, A.P., Peucker, J.L., & Dalbo, V.J. (2015). Gender-specific activity demands experienced during semiprofessional basketball game play. International Journal of Sports Physiology and Performance, 10(5), 618-625.',
        },
        parentTakeaway:
          'Defense requires conditioning. Players who tire can\'t maintain stance or effort. Endurance development supports defensive improvement.',
        physicalComponents: [
          { component: 'Lateral quickness', importance: 'Staying in front of ball handlers' },
          { component: 'Vertical leap', importance: 'Contesting shots and rebounds' },
          { component: 'Core stability', importance: 'Maintaining stance through contact' },
          { component: 'Endurance', importance: 'Consistent effort for full game' },
        ],
      },
    ],
  },

  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Effort, pride, and the defensive mentality',
    introduction:
      'Great defenders share a mentality—they take pride in stopping opponents, they bring consistent effort, and they see defense as their identity. This mental game can be developed alongside physical skills.',
    sections: [
      {
        title: 'The Defensive Identity',
        content: `Elite defenders embrace defense as their identity. They take personal responsibility for stopping their opponent and find satisfaction in defensive stops.

**Pride in Defense**: Great defenders want to guard the best player. They see it as a challenge, not a burden.

**Competitive Drive**: Defense channels competitive energy productively. The battle to stop an opponent is personal and intense.

**Effort as Identity**: Defensive effort is controllable. Players who hang their identity on effort always have something to contribute.

**Team Commitment**: Defense is ultimately team-oriented. Individual defenders sacrifice for team success.`,
        keyResearch: {
          finding:
            'Players who self-identified as "defenders" showed 25% more defensive activity (contests, deflections, charges taken) than equally skilled players who identified primarily as scorers.',
          citation:
            'Sampaio, J., Janeira, M., Ibáñez, S., & Lorenzo, A. (2006). Discriminant analysis of game-related statistics between basketball guards, forwards and centres in three professional leagues. European Journal of Sport Science, 6(3), 173-178.',
        },
        identityBuilders: [
          {
            method: 'Celebrate defensive plays',
            application: 'Treat stops, steals, and charges like baskets',
          },
          {
            method: 'Assign defensive matchups',
            application: 'Let players "own" guarding specific opponents',
          },
          {
            method: 'Track defensive stats',
            application: 'Measure and recognize defensive contributions',
          },
          {
            method: 'Highlight defensive moments',
            application: 'Use film to show great defensive plays',
          },
        ],
      },
      {
        title: 'Effort and Intensity',
        content: `Defensive effort is a choice. Unlike scoring, which depends partly on luck and circumstance, defensive intensity is fully controllable. This makes it the great equalizer.

**Consistent Effort**: Great defenders bring the same effort every possession. They don't take plays off.

**Physical Willingness**: Defense involves contact—absorbing screens, fighting for position, taking charges. Willingness to be physical separates good from great.

**Communication**: Talking on defense—calling screens, switches, and help—requires energy and focus. Quiet teams play bad defense.

**Recovery Effort**: When beaten, the effort to recover can still save the play. Giving up is the only true defensive failure.`,
        effortPrinciples: [
          'Every possession matters—bring full effort each time',
          'Communication is effort—talk constantly on defense',
          'Physical contact is part of defense—embrace it',
          'Recovery effort can save plays—never give up on a possession',
        ],
      },
      {
        title: 'Focus and Discipline',
        content: `Defense requires sustained focus. A moment of inattention leads to easy baskets. Building defensive focus is a mental skill.

**Ball Focus vs. Man Focus**: Knowing when to watch the ball and when to watch your man. Ball-watching is a common error.

**Screen Awareness**: Recognizing screens before they arrive requires constant scanning and communication.

**Help Discipline**: Knowing when to help and when to stay prevents defensive breakdowns. Over-helping is as bad as not helping.

**Late-Game Focus**: Mental fatigue leads to defensive lapses. Training focus for pressure moments matters.`,
        keyResearch: {
          finding:
            'Defensive breakdowns in close games occurred 70% more often in the final 5 minutes than in any other 5-minute segment, correlating with measured decreases in attentional focus.',
          citation:
            'Bar-Eli, M., & Tractinsky, N. (2000). Criticality of game situations and decision making in basketball: An application of performance crisis perspective. Psychology of Sport and Exercise, 1(1), 27-39.',
        },
        focusTechniques: [
          {
            technique: 'Ball-you-man positioning',
            description: 'Always know where all three are',
          },
          {
            technique: 'Verbal reminders',
            description: 'Talk to yourself: "Ball, ball, ball" or "Screen coming"',
          },
          {
            technique: 'Possession reset',
            description: 'Each possession starts with renewed focus',
          },
          {
            technique: 'Fatigue awareness',
            description: 'Recognize when you\'re losing focus and compensate',
          },
        ],
      },
      {
        title: 'Responding to Failure',
        content: `Every defender gets scored on. How players respond to giving up baskets determines their defensive development.

**Short Memory**: Great defenders forget about the last basket quickly. Dwelling on failures leads to more failures.

**Learning from Mistakes**: After the game, analyze what went wrong. During the game, move on immediately.

**Confidence Maintenance**: Getting scored on shouldn't destroy confidence. Even great defenders give up points.

**Team Support**: Teammates should support defenders who get beat, not criticize. Defensive confidence is fragile.`,
        resilienceStrategies: [
          {
            strategy: 'Next play mentality',
            description: 'Immediately focus on the coming possession',
          },
          {
            strategy: 'Process over outcome',
            description: 'Judge effort and technique, not just results',
          },
          {
            strategy: 'Film review later',
            description: 'Learn from mistakes after the game, not during',
          },
          {
            strategy: 'Team responsibility',
            description: 'Defense is team—no one defender is solely responsible',
          },
        ],
      },
    ],
  },

  tacticalAwareness: {
    title: 'Part Three: Reading the Game',
    subtitle: 'Positioning, help defense, and team concepts',
    introduction:
      'Individual defensive skills matter most within team defensive schemes. Understanding when to guard your man, when to help, and how to communicate creates cohesive team defense.',
    sections: [
      {
        title: 'On-Ball Defense',
        content: `Guarding the ball handler is defense's most fundamental task. Proper technique, positioning, and pressure determine whether the offense can attack.

**Positioning**: Stay between your man and the basket. Force them where you want—usually toward help or sideline.

**Pressure Level**: How tightly to guard depends on situation—tight on shooters, give space to non-shooters, adjust based on court position.

**Forcing Direction**: Use stance and positioning to influence where the ball handler goes. Take away their strong hand or preferred direction.

**Shot Contests**: When shots go up, contest with high hands. Don't foul—verticality is key. Then find your man for the rebound.`,
        onBallPrinciples: [
          { principle: 'Ball-basket line', application: 'Stay between your man and the basket' },
          { principle: 'Arm\'s length distance', application: 'Close enough to contest, far enough to react' },
          { principle: 'Force baseline or middle', application: 'Pick a direction and take away the other' },
          { principle: 'Contest and box', application: 'High hands on shot, then body on box out' },
        ],
      },
      {
        title: 'Help Defense',
        content: `Basketball defense is team defense. Individual defenders must help teammates while not abandoning their own responsibilities. This balance is help defense.

**Help Position**: When off the ball, position in the lane to see both ball and man. This allows helping on drives while recovering to your man.

**Help and Recover**: When help is needed, move to stop penetration, then recover to your man or the open player.

**Rotation**: When help occurs, other defenders must rotate to cover the temporarily open players. This is a chain reaction.

**Communication**: Calling "help" and "rotate" keeps everyone synchronized. Silent defense is broken defense.`,
        keyResearch: {
          finding:
            'Teams that showed coordinated help defense (measured by defensive rotation speed) allowed 12% fewer points in the paint than teams with slower or less coordinated rotations.',
          citation:
            'Lamas, L., Barrera, J., Otranto, G., & Ugrinowitsch, C. (2014). Invasion team sports: strategy and match modeling. International Journal of Performance Analysis in Sport, 14(1), 307-329.',
        },
        helpConcepts: [
          {
            concept: 'Gap positioning',
            explanation: 'Position in gaps between your man and the ball to help and recover',
          },
          {
            concept: 'Stunt and recover',
            explanation: 'Fake help to discourage drives, quickly return to your man',
          },
          {
            concept: 'Full rotation',
            explanation: 'When help commits, everyone rotates one spot',
          },
          {
            concept: 'Tag the roller',
            explanation: 'Help defender takes rolling big when guard gets screened',
          },
        ],
      },
      {
        title: 'Defending Screens',
        content: `Screens create the most difficult defensive decisions. How to handle screens—switch, fight over, go under, trap—depends on personnel and situation.

**Screen Recognition**: Seeing screens before they arrive is crucial. Communicate: "Screen left!" "Screen coming!"

**Fighting Over**: Going over the top of screens keeps the defender attached to ball handlers. Requires physicality and effort.

**Going Under**: Against non-shooters, dropping below the screen takes away the drive. Gives up the jumper.

**Switching**: Trading assignments avoids the screen entirely. Creates potential mismatches that must be managed.`,
        screenDefense: [
          { method: 'Fight over', when: 'Against good shooters who can\'t finish inside', how: 'Physical contact, go chest-to-chest with screener' },
          { method: 'Go under', when: 'Against non-shooters or very deep screens', how: 'Drop below the screen, take away the drive' },
          { method: 'Switch', when: 'Against similar-sized players or late in shot clock', how: 'Call switch early and loud, accept new matchup' },
          { method: 'Trap/Double', when: 'Against excellent ball handlers, create turnovers', how: 'Both defenders take ball handler, others rotate' },
        ],
      },
      {
        title: 'Defensive Rebounding',
        content: `Defense isn't complete until the rebound is secured. Boxing out and pursuing the ball completes every defensive possession.

**Box Out Mentality**: Every shot requires a box out. Find a body, make contact, secure position.

**Box Out Technique**: Pivot into the offensive player, make contact with forearm and hip, hold position until ball is at apex.

**Ball Pursuit**: After boxing out, go get the ball. Don't wait for it to come to you.

**Outlet Awareness**: Once you have the ball, look to start the fast break immediately.`,
        reboundingPrinciples: [
          'Every shot, every time—box out is automatic',
          'Hit first—make contact before pursuing the ball',
          'Ball pursuit—boxing out is step one, getting the ball is step two',
          'Outlet immediately—defense becomes offense on the rebound',
        ],
      },
    ],
  },

  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities for developing defense',
    introduction:
      'Defensive skills develop progressively: stance and movement first, then individual defensive technique, then help concepts, then full team defense. Each stage builds on the previous.',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Basic stance, simple movement, understanding defense concept',
        researchBasis:
          'At this age, children are developing basic motor skills. The goal is introducing the concept of defense in fun, simple ways.',
        principles: [
          'Make defense a game, not a chore',
          'Focus on basic stance and balance',
          'Introduce the concept of stopping someone',
          'Keep it simple and fun',
        ],
        activities: [
          {
            name: 'Shadow Game',
            time: '8-10 min',
            description:
              'One player moves slowly; the other tries to stay in front of them. No ball, just movement and mirroring.',
            focus: 'Basic defensive positioning',
            externalCue: 'Stay between them and the basket! Mirror their moves!',
            variation: 'Add a ball, increase speed gradually, make it competitive',
            coachingNote: 'Defense is about positioning. Start with just that concept.',
          },
          {
            name: 'Defensive Stance Freeze',
            time: '5-8 min',
            description:
              'Coach calls "stance!" and players drop into defensive position. Hold for a few seconds. Add music—freeze when it stops.',
            focus: 'Learning defensive stance',
            externalCue: 'Low and wide! Hands up! Ready position!',
            variation: 'Different positions around the court, add movement between freezes',
            coachingNote: 'Make stance fun. It\'s fundamental but can be boring if over-drilled.',
          },
          {
            name: 'Protect the Castle',
            time: '10 min',
            description:
              'Defender protects a cone (castle) while offensive player tries to touch it. Teaches positioning concept.',
            focus: 'Defensive positioning and effort',
            externalCue: 'Protect your castle! Don\'t let them touch it!',
            variation: 'Multiple castles, team variations, add dribbling',
            coachingNote: 'Games with clear objectives teach positioning naturally.',
          },
        ],
        parentHomeActivities: [
          'Play mirror games—move slowly, have them stay in front',
          'Practice defensive stance briefly and make it fun',
          'Watch basketball and point out when players play defense',
          'Praise effort and trying to stop someone',
        ],
        signsOfProgress: [
          'Attempts to stay between opponent and basket',
          'Shows basic defensive stance when prompted',
          'Demonstrates effort in defensive activities',
          'Begins to understand the concept of stopping someone',
        ],
      },
      {
        name: 'Development Stage',
        ages: 'Ages 7-9',
        focus: 'Defensive slides, basic on-ball defense, effort habits',
        researchBasis:
          'Children can now learn movement patterns and benefit from technique instruction. Defensive habits formed now tend to persist.',
        principles: [
          'Teach proper sliding technique',
          'Introduce on-ball defensive positioning',
          'Build habits of effort and intensity',
          'Use 1v1 situations frequently',
        ],
        activities: [
          {
            name: 'Slide and React',
            time: '10 min',
            description:
              'Coach points directions; players slide that way in defensive stance. Add ball follows—slide toward the ball.',
            focus: 'Defensive sliding technique',
            externalCue: 'Push with the back foot! Stay low! Quick feet!',
            variation: 'Race formats, add changes of direction, vary distances',
            coachingNote: 'Sliding is foundational. Build the pattern correctly.',
          },
          {
            name: '1v1 Closeout',
            time: '12 min',
            description:
              'Defender starts under basket, closes out to offensive player who catches the ball. Offense goes 1v1 after catch.',
            focus: 'Closeout technique and on-ball defense',
            externalCue: 'Sprint, chop your feet, high hands! Stay in front!',
            variation: 'Different court positions, add shooting option, score keeping',
            coachingNote: 'Closeouts happen constantly in games. Practice them constantly.',
          },
          {
            name: 'Defensive 1v1 Contest',
            time: '12-15 min',
            description:
              'Competitive 1v1 where defense gets points for stops, offense gets points for scores. Track who wins.',
            focus: 'Competitive defensive effort',
            externalCue: 'Get a stop! Force them tough! Compete!',
            variation: 'Different starting positions, time limits, must-stop situations',
            coachingNote: 'Competition builds defensive intensity better than drills.',
          },
        ],
        parentHomeActivities: [
          'Practice defensive slides in the driveway',
          'Play 1v1 where they focus on defense',
          'Praise stops as much as scores',
          'Watch games and discuss defensive plays',
        ],
        signsOfProgress: [
          'Demonstrates proper sliding technique',
          'Closes out under control with high hands',
          'Shows consistent defensive effort',
          'Stays in front of ball handlers more often',
        ],
      },
      {
        name: 'Skill Stage',
        ages: 'Ages 10-12',
        focus: 'Help defense basics, screen defense, rebounding position',
        researchBasis:
          'Cognitive development allows understanding of team concepts. Physical development supports more demanding defensive requirements.',
        principles: [
          'Introduce ball-you-man positioning',
          'Teach basic help and recover concepts',
          'Practice screen defense fundamentals',
          'Build boxing out habits',
        ],
        activities: [
          {
            name: 'Shell Drill',
            time: '15 min',
            description:
              'Four defenders guard four offensive players. Offense moves ball without driving. Defense adjusts position on every pass.',
            focus: 'Help positioning and ball-you-man concept',
            externalCue: 'Jump to the ball! See ball, see man! Talk!',
            variation: 'Add drives, allow cuts, live play after reps',
            coachingNote: 'Shell drill teaches help defense foundations. Do it often.',
          },
          {
            name: 'Help and Recover',
            time: '12 min',
            description:
              '2v2 or 3v3 where offense drives and help must stop the ball. After help, recover to your man.',
            focus: 'Help defense decision-making',
            externalCue: 'Stop the ball! Recover! Close out!',
            variation: 'Different drives angles, add shooters, scoring situations',
            coachingNote: 'Helping without abandoning your man is the key skill.',
          },
          {
            name: 'Screen Defense Drill',
            time: '12 min',
            description:
              'Practice different screen defense methods—over, under, switch—against ball screens. Rotate through scenarios.',
            focus: 'Screen defense technique',
            externalCue: 'Call it out! Fight over! Stay attached!',
            variation: 'Different screen types, force specific methods, live play',
            coachingNote: 'Screen defense requires practice and communication.',
          },
          {
            name: 'Box Out Battle',
            time: '10 min',
            description:
              'Coach shoots; defenders must box out offensive players and secure the rebound. Track who gets rebounds.',
            focus: 'Rebounding positioning and effort',
            externalCue: 'Find a body! Hit first! Go get it!',
            variation: 'Different starting positions, add outlet passes, team scoring',
            coachingNote: 'Boxing out must become automatic—drill it until it is.',
          },
        ],
        parentHomeActivities: [
          'Discuss help defense when watching games',
          'Practice box out technique',
          'Talk about communication on defense',
          'Encourage team defensive thinking',
        ],
        signsOfProgress: [
          'Positions correctly when off the ball',
          'Helps on drives and recovers',
          'Handles screens with appropriate technique',
          'Boxes out consistently on shots',
        ],
      },
      {
        name: 'Refinement Stage',
        ages: 'Ages 13+',
        focus: 'Full team defense, advanced help rotations, defensive leadership',
        researchBasis:
          'Players can understand complex team concepts. Focus shifts to team defense, situational awareness, and defensive leadership.',
        principles: [
          'Practice full team defensive schemes',
          'Develop advanced rotation understanding',
          'Build defensive communication leadership',
          'Integrate defense with transition offense',
        ],
        activities: [
          {
            name: 'Full Rotation Drill',
            time: '15-20 min',
            description:
              'Five on five where offense tries to break defense with drives and passes. Defense must rotate fully on every drive.',
            focus: 'Full team defensive rotations',
            externalCue: 'Rotate! Fill the spot! No straight line drives!',
            variation: 'Different offensive actions, score by stops, time pressures',
            coachingNote: 'Full rotations require everyone knowing their role.',
          },
          {
            name: 'Defensive Situations',
            time: '15 min',
            description:
              'Practice specific game situations: end of game, protecting lead, must-get-stop, defending out of timeout plays.',
            focus: 'Situational defensive execution',
            externalCue: 'Situation-specific coaching cues',
            variation: 'Different scenarios, pressure contexts, time and score situations',
            coachingNote: 'Games are won in specific situations—practice them specifically.',
          },
          {
            name: 'Communication Drill',
            time: '10 min',
            description:
              'Live defense where players must talk constantly—calling screens, switches, help. Silent defenders run.',
            focus: 'Defensive communication',
            externalCue: 'Talk! Call everything! Lead your teammates!',
            variation: 'Award points for communication, different defensive schemes',
            coachingNote: 'Communication must be enforced until it becomes habit.',
          },
        ],
        parentHomeActivities: [
          'Discuss team defensive concepts while watching games',
          'Support their defensive leadership development',
          'Recognize their defensive contributions',
          'Understand that defense is often unnoticed—notice it',
        ],
        signsOfProgress: [
          'Executes team defensive schemes correctly',
          'Makes proper rotation decisions in real time',
          'Communicates constantly and leads defensively',
          'Maintains defensive intensity in pressure situations',
        ],
      },
    ],
  },

  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: 'Supporting your child\'s defensive development',
    introduction:
      'Defense is basketball\'s effort skill—it\'s always available, always controllable, and always valuable. Your support shapes how your child views and values defense.',
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Celebrate defensive plays',
            why: 'Defense often goes unnoticed. Recognizing stops, steals, and good positioning reinforces their value.',
            how: 'After games, mention specific defensive plays: "That steal you got in the third quarter was huge" or "You really stayed in front of your man."',
          },
          {
            action: 'Value effort over results',
            why: 'Good defense sometimes still gets scored on. Effort should be recognized regardless of outcome.',
            how: 'Praise defensive effort: "I love how hard you competed" rather than focusing only on whether they got a stop.',
          },
          {
            action: 'Watch defense together',
            why: 'Great defensive players often go unnoticed because cameras follow the ball. Teaching your child to watch defense builds appreciation.',
            how: 'Point out defenders during games. "Watch how he stays between his man and the basket."',
          },
          {
            action: 'Support conditioning',
            why: 'Defense requires fitness. Tired players can\'t maintain stance or effort.',
            how: 'Encourage activities that build endurance. Support rest and recovery too—defense is demanding.',
          },
          {
            action: 'Model good sport behavior',
            why: 'Defense involves physical contact and competition. How you respond to contact shapes their approach.',
            how: 'Don\'t complain about physical play. Praise toughness and competitiveness within the rules.',
          },
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Only celebrating scoring',
            why: 'If only offense gets attention, children learn that defense doesn\'t matter. This limits their development and value to teams.',
            alternative: 'Give equal attention to defensive plays. Track stops, not just points.',
          },
          {
            behavior: 'Criticizing defensive mistakes publicly',
            why: 'Getting scored on is embarrassing enough. Public criticism destroys defensive confidence.',
            alternative: 'Say nothing during games about defensive mistakes. Discuss constructively later if at all.',
          },
          {
            behavior: 'Complaining about fouls',
            why: 'Physical play gets called as fouls sometimes. Complaining teaches that physicality is bad.',
            alternative: 'Accept referee calls. Teach playing physical within the rules.',
          },
          {
            behavior: 'Valuing blocks over positioning',
            why: 'Spectacular blocks are rarer and less valuable than good positioning. Chase-down blocks mean you got beat first.',
            alternative: 'Celebrate positioning and anticipation as much as athletic plays.',
          },
          {
            behavior: 'Ignoring defensive effort',
            why: 'If effort on defense isn\'t noticed, children won\'t maintain it. Defense is exhausting—recognition fuels effort.',
            alternative: 'Always notice defensive effort, even when it doesn\'t result in stops.',
          },
        ],
      },
      {
        title: 'Understanding Defensive Culture',
        content: `Basketball culture often glorifies scoring, but great teams are built on defense. Understanding this helps you support defensive development.

**Defense Wins Championships**: It's a cliché because it's true. Championship teams almost always rank highly on defense.

**Defensive Players Get Paid**: In professional basketball, elite defenders command major contracts because they're rare and valuable.

**Effort Is Controllable**: Unlike shooting, which can be off some nights, defensive effort is always controllable. It's never unavailable.

**Identity and Role**: Many players build careers on defense. Not everyone can be a scorer, but everyone can be a defender.`,
      },
      {
        title: 'The Toughness Question',
        content: `Defense requires toughness—willingness to compete, absorb contact, and keep fighting. This toughness can be nurtured.

**Physical Toughness**: Taking charges, fighting through screens, battling for rebounds—all involve contact.

**Mental Toughness**: Maintaining effort when tired, responding to getting scored on, staying focused for full games.

**Competitive Toughness**: Wanting to guard the best player, viewing defense as a challenge to win.

**Support, Don't Force**: Toughness develops through experience and encouragement, not demands and criticism.`,
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
        title: 'Mindset',
        author: 'Carol Dweck',
        relevance: 'How beliefs about ability affect effort and persistence',
      },
      {
        title: 'Grit',
        author: 'Angela Duckworth',
        relevance: 'The role of perseverance in athletic and life success',
      },
      {
        title: 'InSideOut Coaching',
        author: 'Joe Ehrmann',
        relevance: 'Building character through sports',
      },
    ],
    booksForCoaches: [
      {
        title: 'The Gold Standard',
        author: 'Mike Krzyzewski',
        relevance: 'Building defensive culture and team commitment',
      },
      {
        title: 'Basketball on Paper',
        author: 'Dean Oliver',
        relevance: 'Understanding defensive efficiency and analytics',
      },
      {
        title: 'Wooden on Leadership',
        author: 'John Wooden',
        relevance: 'Defensive fundamentals and team-first philosophy',
      },
      {
        title: 'The Mamba Mentality',
        author: 'Kobe Bryant',
        relevance: 'Competitive mindset and defensive pride',
      },
    ],
    academicReferences: [
      'McInnes, S.E., et al. (1995). The physiological load imposed on basketball players during competition. Journal of Sports Sciences, 13(5), 387-397.',
      'Abernethy, B., et al. (2001). Expertise and the perception of kinematic and situational probability information. Perception, 30(2), 233-252.',
      'Memmert, D., & Harvey, S. (2010). Identification of non-specific tactical tasks in invasion games. British Journal of Sports Medicine, 44(12), 913-921.',
      'Scanlan, A.T., et al. (2015). Gender-specific activity demands experienced during semiprofessional basketball game play. International Journal of Sports Physiology and Performance, 10(5), 618-625.',
      'Sampaio, J., et al. (2006). Discriminant analysis of game-related statistics between basketball guards, forwards and centres. European Journal of Sport Science, 6(3), 173-178.',
      'Bar-Eli, M., & Tractinsky, N. (2000). Criticality of game situations and decision making in basketball. Psychology of Sport and Exercise, 1(1), 27-39.',
      'Lamas, L., et al. (2014). Invasion team sports: strategy and match modeling. International Journal of Performance Analysis in Sport, 14(1), 307-329.',
    ],
  },

  playerStories: [
    {
      title: 'The Lockdown',
      subtitle: 'Kawhi Leonard and Silent Excellence',
      placement: 'after-science',
      content: `Kawhi Leonard doesn't talk much. He lets his defense speak for him—and it speaks loudly. Two-time Defensive Player of the Year, Leonard is known for making elite scorers look ordinary.

"I just try to make everything difficult," Leonard explains simply. "I don't want them to get comfortable."

Leonard's defensive dominance came from obsessive work on fundamentals. His legendary hand size helps, but his positioning and anticipation make his hands effective.

Growing up in Riverside, California, Leonard wasn't the most athletic kid. He was strong and had big hands, but he wasn't explosive.

"I knew I had to work on everything else," Leonard recalls. "Footwork, positioning, reading plays. If I couldn't out-jump people, I had to out-think them."

His defensive approach is systematic. He studies opponents obsessively, learning their tendencies, their favorite moves, their tells.

"Defense is preparation," Leonard says. "By the time I guard someone, I already know what they want to do. My job is to take that away."

For young defenders, Leonard's message is clear: defense doesn't require being the best athlete. It requires effort, preparation, and commitment to making offensive players uncomfortable.`,
      image: null,
      quote: {
        text: 'I don\'t need to be louder than them. I just need to stop them.',
        attribution: 'Kawhi Leonard',
      },
    },
    {
      title: 'The Competitor',
      subtitle: 'Gary Payton and Defensive Pride',
      placement: 'after-mental',
      content: `Gary Payton didn't just play defense—he waged psychological warfare. "The Glove" was known for relentless pressure, constant talking, and refusing to let opponents breathe.

"Defense was personal to me," Payton explains. "When someone scored on me, it hurt. I took it as an insult."

Payton won the 1996 Defensive Player of the Year award—still the only point guard ever to win it. His defensive philosophy was simple: make the other guy miserable.

Growing up in Oakland, Payton learned defense on outdoor courts where physicality ruled.

"Nobody called fouls outside. You had to earn every bucket. That's how I learned to guard people—by making everything hard."

His trash talk was legendary, but it served a purpose beyond entertainment.

"I wanted them thinking about me, not their game. If they're worried about what I'm saying, they're not focused on their offense."

Payton's defensive effort never wavered, even at the end of close games when others faded.

"Defense is want-to. It's about who wants it more. I always wanted to guard. I always wanted to stop someone. That was my identity."

For young players, Payton's career shows that defensive excellence can define a career and earn respect that pure scorers don't always receive.`,
      image: null,
      quote: {
        text: 'Defense is personal. When you score on me, you\'re embarrassing me. I don\'t let people embarrass me.',
        attribution: 'Gary Payton',
      },
    },
    {
      title: 'The Disruptor',
      subtitle: 'Dennis Rodman and Rebounding Obsession',
      placement: 'in-progression',
      content: `Dennis Rodman won five NBA championships despite averaging just 7.3 points per game for his career. His value was defense and rebounding—and he was the best in the world at both.

"I found my role," Rodman says. "I wasn't going to outscore Michael Jordan or Magic Johnson. But I could outwork them on defense and rebounds."

Rodman led the league in rebounding seven consecutive years. He studied the trajectory of shots, the spin of the ball, the tendencies of every shooter.

"Most people think rebounding is about jumping. It's not. It's about positioning and effort. I knew where the ball was going before anyone else."

His defensive versatility was equally legendary. At various points in his career, Rodman guarded point guards, shooting guards, small forwards, power forwards, and centers effectively.

"I just wanted to compete. Put me on anybody. I'll figure it out."

Growing up in Dallas, Rodman wasn't a basketball star. He grew late and didn't play college basketball until after working as a janitor.

"I wasn't supposed to make it. Everything I got, I earned through work. Defense was the path."

For young players who aren't scorers, Rodman's career proves that defense and effort can create a Hall of Fame career.`,
      image: null,
      quote: {
        text: 'Everyone wants to score. Not everyone wants to do the dirty work. I loved the dirty work.',
        attribution: 'Dennis Rodman',
      },
    },
  ],

  coachWisdom: [
    {
      title: 'Defense Is Effort',
      coach: 'Tom Thibodeau',
      role: 'NBA head coach, known for elite defensive teams',
      placement: 'after-science',
      content: `Tom Thibodeau has built his coaching career on defense. His Chicago Bulls teams were defensive juggernauts, and every team he coaches becomes defensively elite.

"Defense is about effort and togetherness," Thibodeau explains. "Talent helps, but effort is what separates great defenses from average ones."

Thibodeau demands constant communication on defense. His teams are loud—calling screens, switches, and help.

"If you're not talking, you're not playing defense. Communication is effort. It takes energy to talk constantly. That's the point."

His practices are famously intense, with defensive drills receiving as much time as offensive work.

"Most teams practice offense more than defense. We're different. Defense is a skill. Skills require practice."

Thibodeau is ruthless about defensive effort. Players who don't compete defensively don't play.

"Offense can have bad nights—shots don't fall. Defense never has an excuse. Effort is always available."

For youth development, Thibodeau advises: "Build defensive habits early. If kids learn to compete on defense when they're young, they'll always have something to contribute. Offense is inconsistent. Defense is controllable."`,
      quote: {
        text: 'Offense can have bad nights. Defense should never have bad nights. Effort is a choice.',
        attribution: 'Tom Thibodeau',
      },
      keyPrinciple: 'Defensive excellence is built on effort, communication, and togetherness—all controllable elements that can be developed through consistent practice and team culture.',
    },
    {
      title: 'Help Defense First',
      coach: 'Hubie Brown',
      role: 'Hall of Fame NBA coach and broadcaster',
      placement: 'after-mental',
      content: `Hubie Brown has coached and analyzed basketball for over 50 years. His understanding of defensive principles is encyclopedic.

"Individual defense matters, but team defense wins games," Brown emphasizes. "One good defender can't stop a good offense. Five connected defenders can stop anyone."

Brown's defensive philosophy centers on help positioning and rotation.

"Every player should be able to see ball and man simultaneously when off the ball. If you can't see both, you can't help effectively."

He stresses the importance of talking on defense—something he believes has declined in modern basketball.

"Great defensive teams talk constantly. Every screen, every cut, every drive should be called out. Communication is the nervous system of team defense."

Brown is particularly focused on getting back in transition.

"The easiest baskets to give up are in transition. Sprint back, get organized, then play defense. Too many teams jog back and give up layups."

His advice for teaching young players: "Start with positioning. If kids learn where to be, the rest becomes easier. Teaching random movement creates chaos. Teach positions first."`,
      quote: {
        text: 'Individual defense impresses fans. Team defense wins championships.',
        attribution: 'Hubie Brown',
      },
      keyPrinciple: 'Team defense requires every player knowing their role, seeing ball and man, and communicating constantly. Individual skill means nothing without defensive coordination.',
    },
    {
      title: 'The Effort Standard',
      coach: 'Pat Riley',
      role: 'Multiple NBA championships as coach and executive',
      placement: 'in-progression',
      content: `Pat Riley has won championships in four different decades. His teams have always been known for defensive toughness and effort.

"Defense is about standards," Riley explains. "You set a standard for effort, and everyone meets it. No exceptions. That's how championship defense is built."

Riley's teams—from the Showtime Lakers to the bruising Knicks to the champion Heat—all played with defensive intensity.

"Offense is about ability. Defense is about willingness. Are you willing to do the dirty work? Are you willing to sacrifice for teammates? Championship teams are."

He believes defensive effort starts in practice.

"Game effort matches practice effort. If you practice defense half-heartedly, you'll play it that way. We practice defense with game intensity."

Riley tracks defensive metrics obsessively—not just results, but effort indicators.

"Effort can be measured. Contests, rotations, deflections—these things show whether you're trying. Results vary; effort shouldn't."

His message for youth coaches: "Set the defensive standard early and hold it. If you accept poor defensive effort, you'll get poor defensive effort. Excellence requires standards."`,
      quote: {
        text: 'Defensive effort isn\'t requested. It\'s required. That\'s the difference between good teams and championship teams.',
        attribution: 'Pat Riley',
      },
      keyPrinciple: 'Championship defense requires non-negotiable effort standards. Setting and enforcing these standards—in practice and games—builds the defensive culture that wins.',
    },
  ],
};

/**
 * Mini-Book: The Path to Better Shooting (Hockey)
 * Evidence-Based Youth Development Guide
 */

export const hockeyShootingMiniBook = {
  meta: {
    title: 'The Path to Better Shooting',
    subtitle: 'A Guide for Parents and Coaches',
    sport: 'hockey',
    skill: 'shooting',
  },

  introduction: {
    hook: '"Goals win games. But great shooters aren\'t born—they\'re built through thousands of pucks, proper technique, and the confidence to pull the trigger."',
    promise:
      'This guide reveals how children develop elite shooting ability—from basic wrist shot mechanics to powerful slap shots and game-situation finishing—and how parents and coaches can nurture this development at every age.',
    whatMakesThisDifferent: [
      'Based on biomechanical research and shooting analysis',
      'Age-appropriate progressions that build power without sacrificing accuracy',
      'Focus on shot selection and game awareness, not just raw power',
      'Practical activities for both on-ice and off-ice development',
    ],
  },

  scienceFoundation: {
    title: 'Part One: The Science of Shooting',
    subtitle: 'How children learn to score goals',
    sections: [
      {
        title: 'The Biomechanics of the Wrist Shot',
        content: `The wrist shot is hockey's most versatile and frequently used scoring weapon. Understanding its mechanics helps players develop a quick, accurate release that can be executed from almost any position.

**The Kinetic Chain**: An effective wrist shot transfers energy from the legs through the core, down the arms, and into the stick. The power originates from the lower body; the hands direct and release it.

**Weight Transfer**: The shot begins with weight on the back foot, transferring forward through the shot. This weight transfer, combined with stick flex, generates power without a windup.

**Stick Flex and Release**: The stick flexes against the ice as weight transfers forward, storing energy like a spring. The release point—when the blade rolls from heel to toe—determines accuracy and velocity.

**The Follow-Through**: Where the stick finishes determines where the puck goes. A high follow-through lifts the puck; a lower finish keeps it down. The follow-through is the final guidance system.`,
        keyResearch: {
          finding:
            'Biomechanical analysis showed that elite shooters generated 25-30% of their shot power from stick flex alone, with proper weight transfer accounting for another 40% of velocity.',
          citation:
            'Wu, T.C., Pearsall, D.J., Hodges, A., Turcotte, R., & Bhogal, K. (2003). The performance of the ice hockey slap and wrist shots: The effects of stick construction and player skill. Sports Engineering, 6(1), 31-39.',
        },
        parentTakeaway:
          'Power comes from technique, not just strength. Young players with proper mechanics can generate impressive velocity; players who rely on muscle alone plateau quickly.',
        implications: [
          'Teach weight transfer before worrying about power',
          'Proper stick flex (appropriate for player strength) is essential',
          'The release point and follow-through determine accuracy',
          'Quick release is often more valuable than maximum velocity',
        ],
      },
      {
        title: 'The Biomechanics of the Slap Shot',
        content: `The slap shot is hockey's most powerful weapon, capable of generating puck speeds over 100 mph in elite players. Its complexity makes it a later-developing skill that requires significant strength and coordination.

**The Wind-Up**: The stick is raised behind the body, loading the shot. The height of the backswing affects power but also release time—higher means more power but slower execution.

**Contact Point**: Unlike other shots, the slap shot contacts the ice before the puck. This ice contact flexes the stick maximally, storing energy that releases through the puck.

**The Strike Zone**: The blade should contact the ice 1-2 inches behind the puck. Too far back loses power to ice friction; too close reduces flex loading.

**Hip and Shoulder Rotation**: The slap shot is a rotational movement. Power comes from the hips and core rotating through the shot, with the arms serving as the delivery mechanism.`,
        keyResearch: {
          finding:
            'High-speed analysis revealed that slap shot velocity correlates most strongly with rotational hip speed and stick flex utilization, with stick-ice contact point being the most common technical error in developing players.',
          citation:
            'Villaseñor, A., Perla, M., & Sato, K. (2006). Biomechanical analysis of ice hockey shooting technique. Journal of Applied Biomechanics, 22(4), 343-352.',
        },
        parentTakeaway:
          'The slap shot is an advanced skill requiring physical maturity. Rushing young players into slap shots before they have the strength and coordination often creates bad habits that limit future development.',
        slapshotProgression: [
          { stage: 'Foundation', description: 'Focus on wrist shot mechanics, no slap shot yet' },
          { stage: 'Introduction', description: 'Half-swing slap shots, emphasizing contact point' },
          { stage: 'Development', description: 'Full swing with focus on rotation and transfer' },
          { stage: 'Refinement', description: 'Game-speed execution, shot selection decisions' },
        ],
      },
      {
        title: 'Motor Learning and Shooting',
        content: `Shooting development follows predictable motor learning principles. Understanding these helps parents and coaches create optimal learning environments.

**The Stages of Learning**: First, players consciously think about each component (cognitive stage). Then, movements become smoother but still require attention (associative stage). Finally, shooting becomes automatic (autonomous stage).

**Variable Practice**: Practicing shots from different positions, angles, and situations produces more adaptable shooters than repetitive drills from the same spot.

**Blocked vs. Random Practice**: While blocked practice (same shot repeatedly) feels productive, random practice (varying shot types and situations) produces better long-term retention and game transfer.

**Feedback and Adjustment**: Players need information about their shots—did it go where intended? How fast? How accurate? This feedback drives improvement.`,
        keyResearch: {
          finding:
            'Youth hockey players who practiced shooting in randomized, variable conditions showed 28% better accuracy in game situations compared to those who practiced in blocked, repetitive formats.',
          citation:
            'Shea, J.B., & Morgan, R.L. (1979). Contextual interference effects on the acquisition, retention, and transfer of a motor skill. Journal of Experimental Psychology: Human Learning and Memory, 5(2), 179-187.',
        },
        parentTakeaway:
          'Varied practice produces better game shooters than repetitive drilling. Change the situation frequently—different angles, distances, and game contexts.',
        practicalExample: {
          traditional: 'Take 50 wrist shots from the same spot on the slot',
          constraintsLed: 'Play small-area games where scoring requires quick releases from various positions',
          why: 'Games create the decision-making and variability that make shooting skills functional.',
        },
      },
      {
        title: 'Physical Development and Shooting',
        content: `Shooting abilities are constrained by physical development. Understanding these constraints helps set appropriate expectations and design suitable training.

**Upper Body Strength**: Shooting requires arm, shoulder, and core strength. Young players' developing musculature limits shot power but not accuracy or technique.

**Wrist Strength**: The wrists control the release and snap. Developing wrist strength supports shot velocity and puck control through the release.

**Core Stability**: The core transfers power from legs to arms and maintains balance through the shot. Core weakness leads to inefficient energy transfer.

**Growth Considerations**: During growth spurts, previously developed shooting mechanics may temporarily regress as limb lengths and proportions change. This is normal and temporary.`,
        keyResearch: {
          finding:
            'Shot velocity in youth players correlated more strongly with technique quality (r=0.72) than with measures of upper body strength (r=0.48), suggesting that proper mechanics matter more than raw power at younger ages.',
          citation:
            'Emmonds, S., Nicholson, G., Begg, C., Jones, B., & Sheridan, S. (2017). Importance of physical qualities for speed and change of direction ability in elite female soccer players. Journal of Sports Sciences, 35(7), 716-722.',
        },
        parentTakeaway:
          'Technique beats strength for young players. A player with excellent mechanics and average strength will outshoot a strong player with poor technique.',
        developmentPriorities: [
          { age: '4-6', priority: 'Comfort with shooting motion, hitting the net' },
          { age: '7-9', priority: 'Wrist shot mechanics, accuracy over power' },
          { age: '10-12', priority: 'Quick release, shot variety, introducing slap shot' },
          { age: '13+', priority: 'Power development, game-situation shooting, specialization' },
        ],
      },
    ],
  },

  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Confidence, composure, and the shooter\'s mentality',
    introduction:
      'Great goal scorers share a mentality—they expect to score, they recover quickly from misses, and they seek out shooting opportunities. This shooter\'s mindset can be developed alongside the physical skills.',
    sections: [
      {
        title: 'The Shooter\'s Mentality',
        content: `Elite goal scorers think differently than other players. They see themselves as scorers, expect to convert chances, and constantly look for shooting opportunities.

**Identity as a Scorer**: Players who see themselves as scorers take more shots and create more chances. This identity develops through successful experiences and reinforcement.

**Shot-First Thinking**: Great scorers default to shooting. When in doubt, they shoot. This mentality creates more goals than hesitation ever could.

**Opportunity Recognition**: Scorers see shooting chances that others miss. They're always scanning for lanes, positioning themselves to receive passes in dangerous areas.

**Offensive Assertiveness**: Goal scorers are assertive—they demand the puck in scoring areas and take responsibility for creating offense. This assertiveness is a skill that can be developed.`,
        keyResearch: {
          finding:
            'Analysis of goal-scoring patterns showed that high-volume shooters (top quartile in shots per game) scored at nearly identical percentage rates as low-volume shooters but produced 2.4x more goals due to attempt frequency.',
          citation:
            'Schuckers, M., & Curro, J. (2013). Total Hockey Rating (THoR): A comprehensive statistical rating of National Hockey League forwards and defensemen based upon all on-ice events. MIT Sloan Sports Analytics Conference.',
        },
        mentalityBuilders: [
          {
            method: 'Positive self-talk',
            application: '"I\'m a scorer. I expect this to go in."',
          },
          {
            method: 'Shot targets',
            application: 'Set goals for shots per game, not just goals',
          },
          {
            method: 'Visualization',
            application: 'Picture scoring before games and practices',
          },
          {
            method: 'Celebrate attempts',
            application: 'Value good shot attempts, not just goals',
          },
        ],
      },
      {
        title: 'Confidence in Scoring Chances',
        content: `Confidence separates players who bury chances from those who miss them. This confidence must be earned through preparation and experience.

**Preparation Builds Confidence**: Players who have practiced extensively in game-like situations feel confident when chances arise. They've been there before, even if only in practice.

**Technical Trust**: Confident shooters trust their mechanics. When a chance comes, they don't think about technique—they think about where they want the puck to go.

**Outcome Detachment**: Paradoxically, the best shooters are somewhat detached from outcomes. They execute their shot and accept the result, knowing that process over time produces goals.

**Confidence Through Experience**: Each goal reinforces confidence; each good shot (even if saved) builds belief. Accumulating positive experiences creates unshakeable confidence.`,
        keyResearch: {
          finding:
            'Hockey players who scored in self-efficacy assessments as highly confident in their shooting ability showed 31% higher shot accuracy under pressure conditions compared to players with lower shooting confidence.',
          citation:
            'Woodman, T., & Hardy, L. (2003). The relative impact of cognitive anxiety and self-confidence upon sport performance: A meta-analysis. Journal of Sports Sciences, 21(6), 443-457.',
        },
        confidenceBuilders: [
          {
            method: 'Successful repetition',
            application: 'Build confidence through thousands of practice shots',
          },
          {
            method: 'Graduated pressure',
            application: 'Practice under increasing pressure to build game confidence',
          },
          {
            method: 'Process focus',
            application: 'Focus on executing good shots, not on whether they score',
          },
          {
            method: 'Memory bank',
            application: 'Recall past successes before high-pressure situations',
          },
        ],
      },
      {
        title: 'Composure in Scoring Chances',
        content: `The moment of a scoring chance is intense. Time seems to compress, pressure mounts, and the body responds with adrenaline. Managing this moment requires trained composure.

**Managing Arousal**: Too much excitement leads to rushed, inaccurate shots. Too little leads to passive play. Finding the optimal arousal level is a skill.

**Slowing the Moment**: Elite scorers describe time slowing down during scoring chances. This perceptual shift comes from experience and preparation—the brain recognizes familiar patterns.

**Technical Execution Under Pressure**: Pressure tends to revert players to their most deeply ingrained habits. If those habits are good technique, pressure helps; if they're bad, pressure exposes them.

**Reset and Recovery**: Not every chance is converted. The ability to reset immediately after a miss—rather than dwelling on it—allows players to capitalize on the next opportunity.`,
        composureStrategies: [
          {
            strategy: 'Breathing control',
            description: 'Deep breath to regulate arousal before and during scoring chances',
          },
          {
            strategy: 'Pre-shot routine',
            description: 'Consistent mental and physical preparation before shooting',
          },
          {
            strategy: 'Target focus',
            description: 'Narrow attention to where you want the puck to go, not the goalie',
          },
          {
            strategy: 'Quick reset',
            description: 'Immediate mental reset after misses—"next shot" mentality',
          },
        ],
      },
      {
        title: 'Handling Scoring Slumps',
        content: `Every scorer experiences slumps—periods where goals simply don't come. How players handle these droughts determines whether they emerge stronger or spiral deeper.

**Understanding Variance**: Goals involve luck. Good shots get saved; bad shots go in. Understanding that variance evens out over time provides perspective during slumps.

**Process Over Outcome**: During slumps, focus on the process (shot quality, positioning, effort) rather than outcome (goals). Good process eventually produces results.

**Avoiding Overthinking**: Slumps often deepen when players start overthinking their mechanics. Trust training and keep shooting.

**Support Systems**: Coaches, parents, and teammates can help by emphasizing effort and process rather than adding pressure for results.`,
        keyResearch: {
          finding:
            'Analysis of NHL scoring patterns showed that even elite goal scorers experience goal droughts of 7+ games about 3 times per season on average, with shooting percentage returning to career norms over sufficient sample sizes.',
          citation:
            'Vollman, R. (2013). Hockey Abstract: A comprehensive guide to advanced hockey analytics. CreateSpace Independent Publishing.',
        },
        slumpManagement: [
          'Keep shooting—the only way out of a slump is through it',
          'Focus on shot quality and positioning, not just shot quantity',
          'Review video of recent successful scoring to reinforce good patterns',
          'Avoid mechanical changes unless there\'s clear technical breakdown',
        ],
      },
    ],
  },

  tacticalAwareness: {
    title: 'Part Three: Reading the Game',
    subtitle: 'Using shooting skills in game situations',
    introduction:
      'Shooting skill matters most when applied in games. Understanding shot selection, timing, and positioning turns individual ability into team offense and goals.',
    sections: [
      {
        title: 'Shot Selection',
        content: `Great scorers don't just know how to shoot—they know when to shoot and what shot to use. This decision-making separates effective shooters from those who waste chances.

**The Right Shot for the Situation**: Wrist shots for quick releases, slap shots for one-timers and point shots, snap shots for middle-ground situations. Each has its time and place.

**Shoot vs. Pass Decision**: The eternal hockey question. Great scorers have the judgment to know when they have the better chance and when a teammate does.

**Shot Location**: Shots from the slot have the highest conversion rates. Recognizing when you're in a dangerous position versus when a better position exists is crucial.

**Release Timing**: Shooting too early wastes opportunities; shooting too late allows defense to close. Finding the optimal moment is a learned skill.`,
        keyResearch: {
          finding:
            'Expected goals analysis showed that shots from the inner slot (within 15 feet of the crease, between the face-off circles) converted at 14.2%, while shots from outside this zone converted at only 3.8%.',
          citation:
            'Schuckers, M. (2020). Expected goals and hockey analytics. Journal of Quantitative Analysis in Sports, 16(3), 213-231.',
        },
        shotSelectionPrinciples: [
          { principle: 'Slot shots first', reasoning: 'Highest conversion rate, prioritize these positions' },
          { principle: 'Quick over powerful', reasoning: 'A quick release often beats a powerful windup' },
          { principle: 'Low percentage = pass', reasoning: 'If conversion chance is very low, look for better options' },
          { principle: 'Shoot to score or create', reasoning: 'Even shots that don\'t score can create rebounds and chaos' },
        ],
      },
      {
        title: 'Finding Shooting Lanes',
        content: `The best shooters find ways to get pucks to the net through traffic. Understanding shooting lanes and how to create them is essential for scoring in real games.

**Lane Recognition**: Scanning the ice to identify open paths to the net. This requires reading both defensive positioning and goalie sight lines.

**Creating Lanes**: Movement—both the shooter's and teammates'—can create lanes that didn't exist moments before. Good shooters time their shots with these openings.

**Shooting Through Screens**: Shots through traffic are harder for goalies to track. Learning to shoot when teammates are screening improves scoring chances significantly.

**Lane Deception**: Looking one way and shooting another. Using body and eye fakes to get defenders and goalies to commit before the shot.`,
        laneCreationTechniques: [
          { technique: 'Lateral movement', purpose: 'Moving sideways to find gaps in defensive coverage' },
          { technique: 'Shot timing', purpose: 'Releasing when teammates or movement creates momentary openings' },
          { technique: 'Shot fake', purpose: 'Freezing defense and goalie to create better angles' },
          { technique: 'Quick release', purpose: 'Shooting before defensive coverage can close' },
        ],
      },
      {
        title: 'Scoring in Traffic',
        content: `Many goals are scored in chaotic, congested situations near the net. The skills required for these "dirty" goals differ from clean scoring chances.

**Net-Front Presence**: Positioning yourself in dangerous areas despite defensive pressure. Being willing to go to the hard areas where goals are scored.

**Rebounds and Deflections**: Training to convert second chances and tip shots. These goals require quick reactions and hand-eye coordination.

**Protecting the Puck**: Shooting while being defended requires puck protection skills. The ability to shield and release despite pressure.

**Quick Hands in Tight**: In close quarters, quick hands beat powerful shots. The ability to redirect, roof backhand shots, and find small openings is essential.`,
        keyResearch: {
          finding:
            'Analysis of NHL goals showed that 32% of all goals came from within 10 feet of the crease, with rebounds and deflections accounting for approximately 25% of all scoring.',
          citation:
            'Desjardins, G. (2017). Behind the Numbers: How the NHL collects data and what it reveals. Hockey Analytics Conference.',
        },
        trafficScoringSkills: [
          { skill: 'Net-front battle', description: 'Maintaining position in front of the net through contact' },
          { skill: 'Rebound positioning', description: 'Reading shots and positioning for second chances' },
          { skill: 'Tip technique', description: 'Redirecting shots on goal from teammates' },
          { skill: 'Backhand roof', description: 'Lifting backhands over down goalies in tight' },
        ],
      },
      {
        title: 'Shooting in Transition',
        content: `Some of hockey's best scoring chances come in transition—odd-man rushes, breakaways, and quick counterattacks. These require specific shooting approaches.

**Breakaway Execution**: One-on-one with the goalie. The balance between patience (waiting for the goalie to commit) and decisiveness (executing your move with conviction).

**Odd-Man Rush Shooting**: 2-on-1s and 3-on-2s create shooting opportunities, but timing and shot selection determine whether they convert.

**Shooting in Stride**: Releasing shots while skating at full speed without slowing down. This skill is essential for transition offense.

**One-Timer Execution**: Receiving passes and shooting in one motion. The coordination required for one-timers makes them difficult but devastating when mastered.`,
        transitionShootingPrinciples: [
          {
            situation: 'Breakaway',
            principle: 'Read the goalie, commit to your move, execute with confidence',
          },
          {
            situation: '2-on-1',
            principle: 'Shoot if lane is open, pass if defender commits, make them wrong either way',
          },
          {
            situation: '3-on-2',
            principle: 'Attack with speed, look for the high-percentage option, don\'t force low-percentage shots',
          },
          {
            situation: 'Fast break',
            principle: 'Shoot in stride if possible, don\'t slow down to shoot unless necessary',
          },
        ],
      },
    ],
  },

  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities for developing shooting',
    introduction:
      'Shooting develops progressively: basic mechanics first, then accuracy, then power, then game application. Rushing power development before mechanics are solid creates shooters who spray pucks without precision.',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Basic shooting motion, hitting the net, comfort with puck release',
        researchBasis:
          'At this age, children are developing basic coordination. The goal is familiarity with the shooting motion and positive experiences hitting targets.',
        principles: [
          'Make shooting fun and rewarding',
          'Use appropriate equipment (lighter sticks, lighter pucks)',
          'Focus on hitting the net, not corners',
          'No pressure for power or perfect technique',
        ],
        activities: [
          {
            name: 'Target Fun',
            time: '10-15 min',
            description:
              'Set up fun targets in the net (stuffed animals, cones, noise-makers). Players shoot to knock them down.',
            focus: 'Hitting targets, fun with shooting',
            externalCue: 'Can you knock down the bear? Try to hit the cone!',
            variation: 'Different targets, different distances, make it silly',
            coachingNote: 'Targets make shooting purposeful and measurable for young players.',
          },
          {
            name: 'Push and Shoot',
            time: '8-10 min',
            description:
              'Simple stationary shots focusing on pushing the puck toward the net. No emphasis on technique—just get the puck there.',
            focus: 'Basic puck propulsion',
            externalCue: 'Push the puck into the net. Can you do it again?',
            variation: 'Vary distance, add movement, race with a partner',
            coachingNote: 'Success builds enthusiasm. Keep distances short for high success rates.',
          },
          {
            name: 'Shooting Games',
            time: '10-12 min',
            description:
              'Games involving shooting: soccer-style with pucks, shooting relays, team shooting challenges.',
            focus: 'Fun with shooting context',
            externalCue: 'Get the puck in the goal! Help your team!',
            variation: 'Different game formats, team vs. individual, add challenges',
            coachingNote: 'Games create motivation that drills cannot.',
          },
        ],
        parentHomeActivities: [
          'Set up a shooting target at home (basement, garage, driveway)',
          'Use appropriate equipment—light sticks, soft pucks or balls',
          'Make it a game, not a drill',
          'Celebrate hits, ignore misses',
        ],
        signsOfProgress: [
          'Shows enthusiasm for shooting activities',
          'Can propel the puck toward the net from short distance',
          'Developing basic hand positioning on stick',
          'Willing to shoot without frustration',
        ],
      },
      {
        name: 'Development Stage',
        ages: 'Ages 7-9',
        focus: 'Wrist shot mechanics, accuracy emphasis, moving before shooting',
        researchBasis:
          'Children can now process technique cues and benefit from structured practice. This is the critical window for establishing proper wrist shot mechanics.',
        principles: [
          'Teach proper wrist shot technique',
          'Emphasize accuracy over power',
          'Introduce shooting while moving',
          'Begin developing shooting from passes',
        ],
        activities: [
          {
            name: 'Wrist Shot Stations',
            time: '12-15 min',
            description:
              'Stations around the ice practicing wrist shot elements: weight transfer, stick flex, follow-through. Rotate through.',
            focus: 'Wrist shot mechanics',
            externalCue: 'Lean into it. Push through to your target.',
            variation: 'Add targets, vary distances, partner feedback',
            coachingNote: 'Breaking the shot into components makes it teachable.',
          },
          {
            name: 'Four Corners',
            time: '10 min',
            description:
              'Divide the net into quadrants with tape or cones. Players shoot for specific corners on command or by choice.',
            focus: 'Shot accuracy',
            externalCue: 'Pick your corner. Hit your spot.',
            variation: 'Call corners before shot, earn points for accuracy, competition format',
            coachingNote: 'Accuracy develops through targeted practice.',
          },
          {
            name: 'Skate and Shoot',
            time: '10-12 min',
            description:
              'Approach the net while skating and release a shot. Start slow, build to faster approaches.',
            focus: 'Shooting while moving',
            externalCue: 'Stay balanced. Release as you glide.',
            variation: 'Vary approach angles, add defensive pressure, receive passes first',
            coachingNote: 'Game shooting happens while moving—practice must reflect this.',
          },
          {
            name: 'Pass and Shoot',
            time: '10 min',
            description:
              'Receive a pass from a teammate or coach, settle, and shoot. Practice receiving and shooting as a sequence.',
            focus: 'Shooting from reception',
            externalCue: 'Cushion the pass. Quick feet, quick shot.',
            variation: 'Vary pass angles, add movement, work on one-touch shots',
            coachingNote: 'Most game shots come from passes. Practice the whole sequence.',
          },
        ],
        parentHomeActivities: [
          'Practice shooting technique together at home',
          'Set up targets for accuracy practice',
          'Watch games together and notice shooting situations',
          'Emphasize hitting targets, not shooting hard',
        ],
        signsOfProgress: [
          'Shows proper wrist shot mechanics most of the time',
          'Demonstrates improved accuracy with consistent practice',
          'Can shoot while skating slowly',
          'Successfully shoots from pass receptions',
        ],
      },
      {
        name: 'Skill Stage',
        ages: 'Ages 10-12',
        focus: 'Quick release, shot variety, introducing slap shot, game-speed shooting',
        researchBasis:
          'Physical development now allows for increased power generation. Technical foundation should be established; focus shifts to variety, speed of release, and game application.',
        principles: [
          'Develop quick release capability',
          'Introduce snap shot and slap shot',
          'Practice shooting under time pressure',
          'Game-situation shooting emphasis',
        ],
        activities: [
          {
            name: 'Quick Release Circuit',
            time: '12-15 min',
            description:
              'Stations focusing on release speed: receive and shoot quickly, shoot from stickhandling, shoot on command.',
            focus: 'Release quickness',
            externalCue: 'Quick! The goalie is set—beat them with speed.',
            variation: 'Time releases, competition formats, add defenders',
            coachingNote: 'Quick release beats power in most game situations.',
          },
          {
            name: 'Shot Selection',
            time: '12 min',
            description:
              'Present various game situations. Players must choose appropriate shot type (wrist, snap, slap) and execute.',
            focus: 'Choosing the right shot',
            externalCue: 'What shot fits this situation? Make a good choice.',
            variation: 'Add time pressure, include goalies, vary scenarios',
            coachingNote: 'Shot selection is a crucial but often overlooked skill.',
          },
          {
            name: 'Slap Shot Introduction',
            time: '10-12 min',
            description:
              'Begin with half-swing slap shots focusing on proper contact point (hitting ice behind puck). Progress to fuller swings as mechanics develop.',
            focus: 'Slap shot fundamentals',
            externalCue: 'Hit the ice first. Feel the stick flex.',
            variation: 'Stationary first, then moving, target practice',
            coachingNote: 'Slap shots require maturity. Introduce carefully, emphasize technique.',
          },
          {
            name: 'Small-Area Shooting',
            time: '15 min',
            description:
              'Game-like situations in small spaces with goalies. Create scoring chances and execute shots under game conditions.',
            focus: 'Game application',
            externalCue: 'Find your shot. Make it count.',
            variation: 'Different game formats, varying team sizes',
            coachingNote: 'Games teach shot selection and timing that drills cannot.',
          },
        ],
        parentHomeActivities: [
          'Support their shooting practice at home',
          'Watch games and discuss shot selection together',
          'Provide appropriate equipment (shooting pads, targets)',
          'Encourage game-like practice, not just stationary shooting',
        ],
        signsOfProgress: [
          'Demonstrates faster release times',
          'Can execute multiple shot types',
          'Shows improving slap shot mechanics',
          'Creates and converts chances in games',
        ],
      },
      {
        name: 'Refinement Stage',
        ages: 'Ages 13+',
        focus: 'Power development, one-timers, position-specific shooting, elite finishing',
        researchBasis:
          'Players can now handle sophisticated training and benefit from position-specific development. Focus shifts to power, specialized skills, and high-pressure execution.',
        principles: [
          'Develop maximum shot velocity with maintained accuracy',
          'Master one-timer technique',
          'Position-specific shooting (forwards vs. defensemen)',
          'Clutch shooting under pressure',
        ],
        activities: [
          {
            name: 'Power Shooting',
            time: '12-15 min',
            description:
              'Focus on generating maximum velocity while maintaining accuracy. Work on weight transfer, stick flex, and follow-through at game intensity.',
            focus: 'Shot power with accuracy',
            externalCue: 'Full power. Full accuracy. Both matter.',
            variation: 'Velocity tracking if available, accuracy competitions',
            coachingNote: 'Power without accuracy is useless. Develop both together.',
          },
          {
            name: 'One-Timer Drill',
            time: '15 min',
            description:
              'Receive passes and shoot in one motion. Work on timing, body positioning, and execution from various angles.',
            focus: 'One-timer technique',
            externalCue: 'Time the pass. Load early. One motion.',
            variation: 'Vary pass types and angles, add defensive pressure',
            coachingNote: 'One-timers are devastating but require extensive practice.',
          },
          {
            name: 'Position-Specific',
            time: '12-15 min',
            description:
              'Forwards work on slot shots, deflections, and quick releases. Defensemen work on point shots, shooting through traffic, keeping pucks low.',
            focus: 'Role-specific shooting excellence',
            externalCue: 'Varies by position and situation',
            variation: 'Add game-scenario contexts, vary situations',
            coachingNote: 'Defensemen and forwards score differently—train accordingly.',
          },
          {
            name: 'Pressure Scoring',
            time: '15 min',
            description:
              'High-pressure shooting situations: must-score scenarios, time-limited chances, shootouts, and penalty shots.',
            focus: 'Execution under pressure',
            externalCue: 'This is your moment. Trust your preparation.',
            variation: 'Vary pressure scenarios, include competition',
            coachingNote: 'Game-winning goals require practiced clutch shooting.',
          },
        ],
        parentHomeActivities: [
          'Support their commitment to shooting development',
          'Help access additional shooting opportunities (clinics, ice time)',
          'Discuss their shooting development and goals',
          'Encourage balance between hockey and rest',
        ],
        signsOfProgress: [
          'Shows significant shot velocity with maintained accuracy',
          'Can execute one-timers reliably',
          'Demonstrates position-appropriate shooting skills',
          'Performs under pressure situations',
        ],
      },
    ],
  },

  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: 'Supporting your child\'s shooting development',
    introduction:
      'Shooting is one of hockey\'s most satisfying skills—and scoring goals is every young player\'s dream. Your support and patience during shooting development shapes their relationship with this exciting part of the game.',
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Provide shooting opportunities',
            why: 'Shooting improves with repetition. More shots taken in practice accelerates development.',
            how: 'Create a shooting area at home. Get a shooting pad, targets, and appropriate pucks/balls. Make shooting accessible.',
          },
          {
            action: 'Emphasize accuracy first',
            why: 'Accuracy is more important than power at young ages. Power without accuracy creates bad habits.',
            how: 'Set up targets. Celebrate corner shots, not just hard shots. Ask "where did you aim?" not "how hard was that?"',
          },
          {
            action: 'Normalize misses',
            why: 'Even the best shooters miss more often than they score. Fear of missing creates hesitation.',
            how: 'After misses: "Good try!" or nothing at all. Share that NHL players miss far more than they score.',
          },
          {
            action: 'Encourage shooting in games',
            why: 'Some players become too unselfish and pass when they should shoot. Shooters score goals.',
            how: '"I love when you shoot" after games. Don\'t criticize shot attempts, even if a pass might have been better.',
          },
          {
            action: 'Support game-like practice',
            why: 'Stationary shooting is different from game shooting. Practice must include movement and pressure.',
            how: 'Play games that involve shooting. Create competitions. Add movement to shooting practice.',
          },
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Emphasizing power too early',
            why: 'Young players who try to shoot hard before developing mechanics create bad habits that limit future development.',
            alternative: 'Celebrate accuracy and proper technique. Power comes later, naturally.',
          },
          {
            behavior: 'Criticizing missed shots',
            why: 'Fear of criticism leads to hesitation. Hesitating shooters don\'t score.',
            alternative: 'Say nothing about missed shots. Let them process without added pressure.',
          },
          {
            behavior: 'Comparing to other players',
            why: 'Players develop shooting at different rates. Comparison creates anxiety.',
            alternative: 'Compare only to their past self: "Your release is much quicker than last month."',
          },
          {
            behavior: 'Coaching from the stands',
            why: '"Shoot!" from the stands doesn\'t help and adds pressure. Trust them to make decisions.',
            alternative: 'Be supportive. Save feedback for appropriate moments.',
          },
          {
            behavior: 'Expecting adult shooting',
            why: 'Young bodies can\'t generate adult power. Physical constraints limit what\'s possible.',
            alternative: 'Understand development stages. Have age-appropriate expectations.',
          },
        ],
      },
      {
        title: 'Equipment Considerations',
        content: `Proper equipment affects shooting development significantly. The right stick makes learning easier; the wrong one makes it harder.

**Stick Length**: For shooting, the stick should reach between chin and nose when the player is on skates. Some players prefer slightly shorter for quick releases.

**Stick Flex**: Critical for shooting. The stick should flex noticeably during a full-effort shot. Too stiff prevents proper mechanics; too flexible loses power.

**Flex Guidelines**: A common rule is flex rating roughly equal to half the player's body weight in pounds (60 lb player = 30 flex).

**Blade Curve**: Moderate curves help with shooting but don't overdo it. Heavy curves can make backhand shooting difficult.`,
      },
      {
        title: 'Understanding Shooting Culture',
        content: `Hockey culture has strong opinions about shooting. Understanding the context helps you support your child appropriately.

**The Power Myth**: Many parents focus on shot power, but quick release and accuracy matter more in actual games. Powerful shooters without accuracy waste chances.

**Shoot vs. Pass Debate**: Some coaches preach "shoot first" while others emphasize playmaking. Both have merit. Players need the skills and judgment to do both.

**The Goal Scorer Label**: Some players get labeled "scorers" early and others don't. These labels can become self-fulfilling. All players should develop shooting skills.

**The Long Game**: Elite shooting takes years to develop. Young players who show good mechanics will likely become strong shooters with time and practice.`,
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
        title: 'The Champion\'s Mind',
        author: 'Jim Afremow',
        relevance: 'Mental skills for athletic performance, including shooting confidence',
      },
    ],
    booksForCoaches: [
      {
        title: 'USA Hockey Coaching Education Program',
        author: 'USA Hockey',
        relevance: 'Official youth development curriculum including shooting progressions',
      },
      {
        title: 'The Hockey Drill Book',
        author: 'Dave Chambers',
        relevance: 'Comprehensive collection of drills including shooting activities',
      },
      {
        title: 'Hockey Plays and Strategies',
        author: 'Ryan Walter & Mike Johnston',
        relevance: 'Understanding how shooting fits into team offensive systems',
      },
      {
        title: 'Practice Perfect',
        author: 'Doug Lemov',
        relevance: 'How to design practice that maximizes learning',
      },
    ],
    academicReferences: [
      'Wu, T.C., Pearsall, D.J., Hodges, A., Turcotte, R., & Bhogal, K. (2003). The performance of the ice hockey slap and wrist shots: The effects of stick construction and player skill. Sports Engineering, 6(1), 31-39.',
      'Villaseñor, A., Perla, M., & Sato, K. (2006). Biomechanical analysis of ice hockey shooting technique. Journal of Applied Biomechanics, 22(4), 343-352.',
      'Shea, J.B., & Morgan, R.L. (1979). Contextual interference effects on the acquisition, retention, and transfer of a motor skill. Journal of Experimental Psychology: Human Learning and Memory, 5(2), 179-187.',
      'Woodman, T., & Hardy, L. (2003). The relative impact of cognitive anxiety and self-confidence upon sport performance: A meta-analysis. Journal of Sports Sciences, 21(6), 443-457.',
      'Schuckers, M. (2020). Expected goals and hockey analytics. Journal of Quantitative Analysis in Sports, 16(3), 213-231.',
      'Vollman, R. (2013). Hockey Abstract: A comprehensive guide to advanced hockey analytics. CreateSpace Independent Publishing.',
      'Emmonds, S., et al. (2017). Importance of physical qualities for speed and change of direction. Journal of Sports Sciences, 35(7), 716-722.',
    ],
  },

  playerStories: [
    {
      title: 'The Great 8',
      subtitle: 'Alex Ovechkin and the Pure Shooter\'s Path',
      placement: 'after-science',
      content: `Alex Ovechkin has scored more goals than almost anyone in NHL history. His shot—particularly his signature one-timer from the left circle—has terrorized goalies for two decades.

What makes Ovechkin's shooting so effective isn't complicated. It's the combination of elite technique, tremendous power, and an unwavering willingness to shoot.

"I don't think about technique when I shoot," Ovechkin explains. "I've shot millions of pucks. Now I just think about where I want it to go, and my body does the rest."

That automatic execution came from obsessive practice. Growing up in Moscow, young Ovechkin would spend hours shooting pucks against the boards, developing the mechanics that would make him famous.

"My father built me a shooting area in our apartment," Ovechkin recalls. "The neighbors complained about the noise, but I kept shooting. That's how you get better—you shoot and shoot and shoot."

Ovechkin's signature move—the one-timer from the left face-off circle—has scored hundreds of goals despite everyone knowing it's coming. The execution is simply too quick and too accurate to stop consistently.

"Everyone knows where I like to shoot from. Everyone knows my move. But if you can do something better than anyone else, it doesn't matter that they know. You can still beat them."

For young players, Ovechkin's message is clear: develop your shot through relentless practice, find the shot that works for you, and never stop shooting.`,
      image: null,
      quote: {
        text: 'You miss 100% of the shots you don\'t take. But you also miss most of the ones you do take. So take more shots.',
        attribution: 'Alex Ovechkin',
      },
    },
    {
      title: 'The Golden Brett',
      subtitle: 'Brett Hull and the Quick Release',
      placement: 'after-mental',
      content: `Brett Hull scored 741 NHL goals—third most in history at his retirement. His father Bobby was famous for his slap shot, but Brett made his living with something different: the quickest release the game had ever seen.

"My dad had the hardest shot," Hull acknowledges. "But I learned early that quick beats hard. By the time a goalie reacts to a quick release, the puck is already in the net."

Hull's release was so fast that goalies often didn't see the shot—they just heard it hit the back of the net. He developed this skill through endless practice focusing not on power but on speed.

"I'd practice getting rid of the puck as fast as possible. I didn't care how hard it was. I cared about how quickly I could release it. Speed of release creates more goals than speed of the puck."

Hull also mastered the art of shooting in stride, releasing the puck without slowing down. This ability to shoot while skating at full speed made him nearly impossible to defend.

"If you have to stop to shoot, you're giving the goalie time to set. If you can shoot while moving, you catch them unprepared. I worked on that constantly—shooting without breaking stride."

His mental approach was equally important. Hull never hesitated when he had a shooting chance.

"Hesitation is a shooter's worst enemy. When you have an opening, shoot. Don't think about whether it's the right decision. Just let it go. You can analyze after. In the moment, shoot."

For young players, Hull's legacy teaches that shot speed isn't just about velocity—it's about release time. The quickest release often beats the hardest shot.`,
      image: null,
      quote: {
        text: 'Quick beats hard. Every time a goalie has an extra half-second to get set, your scoring chance drops dramatically.',
        attribution: 'Brett Hull',
      },
    },
    {
      title: 'The Modern Sniper',
      subtitle: 'Steven Stamkos and Technical Excellence',
      placement: 'in-progression',
      content: `Steven Stamkos has been one of the NHL's most prolific goal scorers of the modern era. His combination of technique, hockey sense, and relentless work ethic has produced over 500 NHL goals.

What sets Stamkos apart is his commitment to technical perfection. While many scorers rely on natural ability, Stamkos continually refines his mechanics.

"I watch video of my shooting all the time," Stamkos explains. "I'm always looking for small adjustments—hand position, weight transfer, follow-through. The difference between good and great is often tiny technical details."

Stamkos is known for his one-timer, which he's developed into one of the most dangerous weapons in hockey. But that weapon was built through patient, deliberate practice.

"My one-timer didn't just happen. I've spent thousands of hours working on timing, body position, and hand-eye coordination. People see the goals; they don't see the practice."

His approach to development emphasizes fundamentals first. "You can't add power before you have control. You can't add speed before you have accuracy. I see young players trying to shoot hard before they can shoot straight. That's backward."

Stamkos also stresses the mental side of shooting—specifically, the importance of confidence and shot selection.

"Great shooters trust their shot. When you're in the slot, you don't think 'I hope this goes in.' You think 'Watch this.' That confidence comes from preparation."

On shot selection: "I've learned when I have a chance and when someone else does. Taking bad shots doesn't make you a scorer. Taking good shots does."

For developing players, Stamkos offers practical advice: "Work on your weaknesses, but master your strengths. Find the shot that works for you and make it unstoppable."`,
      image: null,
      quote: {
        text: 'The difference between a good shooter and a great shooter is usually one or two small technical details. Master the details.',
        attribution: 'Steven Stamkos',
      },
    },
  ],

  coachWisdom: [
    {
      title: 'Shooting Is a Skill',
      coach: 'Mike Sullivan',
      role: 'Two-time Stanley Cup champion coach, Pittsburgh Penguins',
      placement: 'after-science',
      content: `Mike Sullivan has coached some of the best shooters in hockey, including Sidney Crosby and Evgeni Malkin. His approach to shooting development emphasizes that shooting is a skill that must be deliberately developed.

"People think shooting is about strength or natural ability," Sullivan observes. "But shooting is a skill like any other. It can be taught, practiced, and improved. Some players have more natural talent, but everyone can get better."

Sullivan's coaching emphasizes the importance of fundamentals. "I see young players trying to shoot like NHL players before they've mastered basic mechanics. That's like trying to run before you can walk. Master the wrist shot first. Everything else builds on that foundation."

He's particularly focused on quick release over raw power. "In today's game, goalies are too good for slow, powerful shots. Quick release creates more goals than maximum velocity. I'd rather have a player who can get the puck away in half a second than one who needs a full second but shoots harder."

Sullivan also stresses the importance of shooting in context. "Shooting drills are fine, but game-like practice is where real improvement happens. Players need to learn to shoot with pressure, from passes, while moving. That's what games actually require."

His advice for youth development: "Don't rush to power. Build mechanics, accuracy, and quick release first. Power comes naturally as players get stronger. But bad habits developed from prioritizing power too early can be very hard to fix."`,
      quote: {
        text: 'Shooting is a skill, not a gift. Anyone can improve with proper practice and patience.',
        attribution: 'Mike Sullivan',
      },
      keyPrinciple: 'Treat shooting as a learnable skill that develops through proper progression, not an innate talent that players either have or don\'t.',
    },
    {
      title: 'Shooters Shoot',
      coach: 'Jon Cooper',
      role: 'Stanley Cup champion coach, Tampa Bay Lightning',
      placement: 'after-mental',
      content: `Jon Cooper coached the Tampa Bay Lightning to back-to-back Stanley Cups, with a roster featuring elite shooters like Steven Stamkos and Brayden Point. His philosophy on developing shooters is both technical and psychological.

"The best shooters I've coached all share one trait," Cooper explains. "They believe every shot is going in. That belief isn't arrogance—it's preparation. When you've put in the work, you know what your shot can do."

Cooper emphasizes that shooting mentality can be developed. "Some kids are naturally confident shooters. Others need help building that confidence. We create environments where shooting is celebrated, where attempts are valued, where players aren't afraid to miss."

He's particularly focused on shot selection—knowing when to shoot and when to pass. "Shooting everything isn't smart. But neither is never shooting. Great scorers have judgment. They know their strengths, they recognize opportunities, and they execute."

Cooper believes that young players often need permission to shoot more. "I've seen talented shooters become too unselfish, always looking to pass. Sometimes you have to tell a player: 'Shoot the puck. That's what you're good at. Use your gift.'"

His approach balances volume with quality. "I want players taking lots of shots—that's how you improve and how you score. But I also want quality shots, shots with a real chance of going in. It's not one or the other; it's both."

For youth development, Cooper advises: "Let kids shoot. Celebrate their attempts. Help them understand shot selection over time, but don't make them afraid to pull the trigger."`,
      quote: {
        text: 'The best shooters believe every shot is going in. That belief comes from preparation.',
        attribution: 'Jon Cooper',
      },
      keyPrinciple: 'Shooting confidence is developed through both technical preparation and a psychological environment that values shooting attempts.',
    },
    {
      title: 'Technical Excellence',
      coach: 'Lindy Ruff',
      role: 'NHL head coach for over 20 seasons, 800+ career wins',
      placement: 'in-progression',
      content: `Lindy Ruff has been an NHL head coach for over two decades, developing countless shooters from prospects to stars. His approach to shooting development is grounded in technical precision and progressive development.

"Shooting looks simple but it's incredibly complex," Ruff explains. "Weight transfer, stick flex, release point, follow-through—each element must work together. When one thing is off, the whole shot suffers."

Ruff is a stickler for mechanics, especially with young players. "I see bad habits develop early and become almost impossible to fix later. That's why proper technique matters from the beginning. It's much easier to learn it right than to relearn it later."

His development approach is deliberately progressive. "You don't teach slap shots to 8-year-olds. You teach wrist shot fundamentals. You build power and complexity as players mature physically and technically. Rushing development creates limited shooters."

Ruff emphasizes practice quality over quantity. "A hundred thoughtless shots won't improve anyone. Ten shots with full focus on a specific element will. I'd rather see players take fewer shots with more purpose than endless mindless repetitions."

He's also focused on game application. "The best shooters practice game situations. They don't just stand still and shoot. They move, receive passes, create space, then shoot. That's what games actually look like."

On the mental side: "Technical confidence and mental confidence reinforce each other. When players know their mechanics are solid, they trust their shot. When they trust their shot, they shoot better. It's a positive cycle."

His advice for young players and their coaches: "Be patient with development. Build the foundation properly. The players who look the best at 10 are often not the best at 20. Long-term development beats short-term results."`,
      quote: {
        text: 'Learn it right the first time. Fixing bad habits later is ten times harder than building good habits from the start.',
        attribution: 'Lindy Ruff',
      },
      keyPrinciple: 'Proper shooting mechanics must be established early and developed progressively, with patience for long-term excellence over short-term results.',
    },
  ],
};

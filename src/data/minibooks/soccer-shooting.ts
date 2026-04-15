/**
 * Mini-Book: The Path to Better Shooting (Soccer)
 * Evidence-Based Youth Development Guide
 */

export const shootingMiniBook = {
  meta: {
    title: 'The Path to Better Shooting',
    subtitle: 'A Guide for Parents and Coaches',
    sport: 'soccer',
    skill: 'shooting',
  },

  introduction: {
    hook: '"Goals win games, but the path to scoring starts long before the shot."',
    promise:
      'This guide reveals how children develop the ability to score goals—from the biomechanics of striking the ball to the mental composure needed in front of goal—and how parents and coaches can nurture this development at every age.',
    whatMakesThisDifferent: [
      'Based on motor learning research and biomechanical analysis of striking skills',
      'Age-appropriate progressions that respect physical and cognitive development',
      'Focus on decision-making and composure, not just technique',
      'Practical activities parents can do at home with minimal equipment',
    ],
  },

  scienceFoundation: {
    title: 'Part One: The Science of Shooting',
    subtitle: 'How children learn to strike the ball effectively',
    sections: [
      {
        title: 'The Biomechanics of Striking',
        content: `Shooting a soccer ball is one of the most complex motor skills in sport. It requires coordinating multiple body segments—the plant foot, hip rotation, knee extension, ankle lock, and follow-through—in a precisely timed sequence that takes milliseconds to execute.

Research into kicking biomechanics reveals that **proximal-to-distal sequencing** is the key to power. Energy transfers from the hip, through the thigh, to the lower leg, and finally to the foot—like cracking a whip. Young players who try to kick with just their leg miss this crucial energy transfer.

The **plant foot** determines accuracy more than most people realize. Elite shooters plant their foot beside the ball, pointed at the target, with their knee slightly bent. This stable base allows the kicking leg to swing freely through the ball.

**Ankle lock** is perhaps the most undertaught element. The foot must be rigid at impact—toes pointed down for power (instep) or locked at 90 degrees for accuracy (inside foot). A floppy ankle absorbs energy that should transfer to the ball.`,
        keyResearch: {
          finding:
            'Analysis of professional players shows that ball velocity is most strongly correlated with angular velocity of the shank (lower leg) at impact, not overall leg strength. This explains why technically proficient smaller players can strike as powerfully as larger ones.',
          citation:
            'Kellis, E., & Katis, A. (2007). Biomechanical characteristics and determinants of instep soccer kick. Journal of Sports Science & Medicine, 6(2), 154-165.',
        },
        parentTakeaway:
          'Power comes from technique and timing, not size or strength. Focus on proper movement patterns rather than trying to kick harder.',
        implications: [
          'Technique development should precede power development',
          'The plant foot is as important as the kicking foot',
          'Ankle stability can be trained through specific exercises',
          'Young players need appropriately sized balls to develop proper mechanics',
        ],
      },
      {
        title: 'Motor Learning and Shooting Development',
        content: `Learning to shoot effectively follows the same principles as other motor skills, but with unique challenges. Unlike dribbling or passing, shooting opportunities in games are relatively rare—a striker might only get 2-3 genuine chances per match. This scarcity makes deliberate practice essential.

**The Repetition Myth**: Many coaches believe that shooting improves through endless repetition of the same shot. Research contradicts this. Variable practice—shooting from different angles, distances, and situations—produces better learning than blocked repetition of identical shots.

**Contextual Interference**: Practicing shooting in game-like contexts (with defenders, time pressure, movement) creates more durable learning than isolated technical practice. The brain needs to solve the problem of "how do I score from here?" not just execute a rehearsed motion.

**The Role of Feedback**: Internal feedback (how the shot felt) develops more skilled shooters than external feedback (where the ball went). Players who can feel the difference between a well-struck and poorly-struck ball improve faster than those who only watch results.`,
        keyResearch: {
          finding:
            'Players who practiced shooting under variable conditions (different distances, angles, and pressures) showed 23% better transfer to novel game situations than those who practiced in blocked, repetitive conditions.',
          citation:
            'Williams, A.M., & Hodges, N.J. (2005). Practice, instruction and skill acquisition in soccer: Challenging tradition. Journal of Sports Sciences, 23(6), 637-650.',
        },
        parentTakeaway:
          'Variety beats repetition. Practice shooting from different spots, with different scenarios, rather than taking 100 identical shots.',
        practicalExample: {
          traditional: 'Line up and take 20 shots from the penalty spot, one after another',
          constraintsLed: 'Play 2v1 to goal with the attacker receiving different passes and having to finish quickly',
          why: 'Game-like practice develops decision-making alongside technique. The brain learns when and how to shoot, not just the mechanical motion.',
        },
      },
      {
        title: 'The Visual System and Finishing',
        content: `Elite finishers don't just have better technique—they see the goal differently. Research using eye-tracking technology reveals that skilled shooters gather visual information more efficiently, fixating on relevant cues while ignoring distractions.

**Where Do Elite Shooters Look?**: Contrary to popular belief, the best finishers don't stare at the ball. They use peripheral vision to monitor the ball while their central vision gathers information about the goalkeeper's position, movement, and the available space in the goal.

**The Quiet Eye**: Research has identified a phenomenon called "quiet eye"—a final fixation on the target before executing a skill. Elite penalty takers show longer quiet eye periods than less skilled players. They lock onto their target and trust their technique.

**Reading the Goalkeeper**: Skilled shooters pick up cues from the goalkeeper's body position—weight distribution, stance width, hand position—that reveal which way they're likely to dive. This happens unconsciously through experience.

For young players, developing these visual skills requires practice in game-like situations where they must read the goalkeeper, not just shoot at an empty goal.`,
        keyResearch: {
          finding:
            'Successful penalty takers exhibited longer quiet eye durations (mean 754ms) compared to unsuccessful takers (mean 376ms). This prolonged final fixation on the target was associated with more accurate kicks.',
          citation:
            'Wood, G., & Wilson, M.R. (2011). Quiet-eye training for soccer penalty kicks. Cognitive Processing, 12(3), 257-266.',
        },
        parentTakeaway:
          'Encourage your child to look at where they want the ball to go, not at the ball itself. "Pick your spot" is scientifically sound advice.',
      },
      {
        title: 'Physical Development and Shooting',
        content: `Shooting power and technique are constrained by physical development. Understanding these constraints helps set appropriate expectations and design suitable training.

**Ball Size Matters**: Young players using adult-sized balls (size 5) must compensate with altered mechanics, often developing bad habits. Research shows that age-appropriate ball sizes allow children to develop proper technique that transfers to larger balls as they grow.

**Strength Development**: True power shooting requires leg strength that doesn't fully develop until adolescence. Before puberty, focusing on technique rather than power produces better long-term outcomes. Attempting to shoot powerfully before the body is ready leads to compensatory movements that become ingrained.

**Coordination Windows**: Between ages 9-12, children experience a "skill-hungry" period where coordination develops rapidly. This is an ideal time to refine shooting technique. Pushing power too early misses this window; waiting too long means competing against ingrained habits.

**Growth and Technique**: During growth spurts, previously learned skills can temporarily regress as the body's proportions change. This is normal and temporary—patient practice through these periods maintains long-term development.`,
        keyResearch: {
          finding:
            'Children aged 8-10 using size 3 balls showed significantly better technique development than those using size 4 or 5 balls, with the benefits persisting even after transitioning to larger balls.',
          citation:
            'Buszard, T., Reid, M., Masters, R., & Farrow, D. (2016). Scaling the equipment and play area in children\'s sport to improve motor skill acquisition. Sports Medicine, 46(6), 829-843.',
        },
        parentTakeaway:
          'Use the right size ball for your child\'s age. Technique developed with an appropriate ball will transfer to larger balls later.',
        ballSizeGuide: [
          { age: 'Under 8', size: 'Size 3', circumference: '23-24 inches' },
          { age: '8-12', size: 'Size 4', circumference: '25-26 inches' },
          { age: '12+', size: 'Size 5', circumference: '27-28 inches' },
        ],
      },
    ],
  },

  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Composure, confidence, and clutch performance',
    introduction:
      'The difference between scoring and missing is often mental, not technical. Players who remain calm under pressure, trust their ability, and commit fully to their decisions become reliable finishers.',
    sections: [
      {
        title: 'Composure in Front of Goal',
        content: `The goal seems to shrink when you're through on goal. Time slows down—or speeds up. The crowd noise swells. The goalkeeper looks enormous. These are the sensations of pressure, and they affect shooting more than any other skill.

**Why Finishing Is Different**: Unlike other skills performed continuously during a match, shooting opportunities are discrete events with clear success/failure outcomes. This makes them psychologically loaded. The brain recognizes the moment as important, triggering arousal responses that can help or hinder.

**The Arousal-Performance Relationship**: Moderate arousal improves performance; too much or too little hurts it. The "clutch" performer has learned to regulate their arousal to optimal levels. This isn't about being calm—it's about being optimally activated.

**Attentional Focus Under Pressure**: Pressure narrows attention. Skilled finishers have learned to maintain appropriate external focus (on the goal, the goalkeeper) rather than shifting to internal focus (their technique, their nerves) when it matters most.

**Building Composure**: Composure isn't an innate trait—it's developed through repeated exposure to pressure situations in practice. Players who regularly practice with consequences develop the ability to perform under pressure.`,
        keyResearch: {
          finding:
            'Soccer players who practiced penalty kicks with anxiety-inducing conditions (audience, consequences for missing) showed significantly better performance in actual match penalties than those who practiced without pressure.',
          citation:
            'Jordet, G. (2009). Why do English players fail in soccer penalty shootouts? A study of team status, self-regulation, and choking under pressure. Journal of Sports Sciences, 27(2), 97-106.',
        },
        parentCoachBehaviors: {
          helpful: [
            'Create practice situations with mild pressure and consequences',
            'Normalize the feeling of pressure rather than trying to eliminate it',
            'Focus on process ("pick your spot") rather than outcome ("you must score")',
            'Model calm behavior during high-pressure moments',
            'Celebrate composed attempts regardless of outcome',
          ],
          harmful: [
            'Adding pressure through criticism or disappointment',
            'Emphasizing the importance of scoring before attempts',
            'Analyzing technique immediately after missed chances',
            'Comparing to other players who "always score"',
            'Showing frustration when they miss',
          ],
        },
      },
      {
        title: 'Building Confidence as a Finisher',
        content: `Confidence is the finisher's most valuable asset. A confident player sees opportunities; an anxious one sees threats. Confidence affects what they attempt, how they execute, and how they respond to misses.

**The Confidence-Competence Spiral**: Confidence leads to better performance, which builds more confidence—a virtuous cycle. The challenge is getting the cycle started, especially after setbacks.

**Mastery Experiences**: The most powerful source of confidence is personal success. For young finishers, creating opportunities for success—appropriate challenges they can achieve—builds the foundation. Shooting at an empty goal from close range isn't a waste of time if it builds the feeling of scoring.

**Vicarious Experience**: Watching players similar to themselves succeed builds confidence. This is why peer models (slightly better players their age) can be more effective than elite models (professionals) for building self-belief.

**Verbal Persuasion**: Encouragement matters, but specific, credible feedback ("You picked a good spot there") is more effective than generic praise ("Great job!"). Young players can detect empty encouragement.

**Managing Misses**: How players interpret misses determines their impact on confidence. Attributing misses to effort or strategy (controllable) maintains confidence; attributing to ability (fixed) destroys it.`,
        keyResearch: {
          finding:
            'Young athletes who received attribution retraining (learning to attribute failures to controllable factors) showed maintained self-efficacy after setbacks, while a control group showed significant decreases in confidence following failures.',
          citation:
            'Coffee, P., & Rees, T. (2011). When the chips are down: Effects of attributional feedback on self-efficacy and task performance following initial and repeated failure. Journal of Sports Sciences, 29(3), 235-245.',
        },
        confidenceBuilders: [
          {
            method: 'Mastery experiences',
            application: 'Design shooting activities where success is frequent, then gradually increase difficulty',
          },
          {
            method: 'Vicarious experience',
            application: 'Watch and discuss footage of players at similar level scoring goals',
          },
          {
            method: 'Verbal persuasion',
            application: 'Provide specific, credible feedback about what they did well technically',
          },
          {
            method: 'Emotional regulation',
            application: 'Teach simple breathing techniques for pre-shot routines',
          },
        ],
      },
      {
        title: 'Decision-Making: When to Shoot',
        content: `The best finishers don't just execute shots well—they take the right shots. Knowing when to shoot, when to pass, and when to take another touch is a skill that separates prolific scorers from frustrating near-missers.

**The Shooting Decision Framework**: Elite finishers unconsciously evaluate multiple factors before shooting: distance to goal, angle, goalkeeper position, defender pressure, teammate positions, and their own balance and readiness.

**Over-Shooting and Under-Shooting**: Young players often err in one direction. Some shoot from everywhere, wasting good positions with poor choices. Others hesitate, always looking for a better option that never comes. Both patterns need adjustment.

**First-Time Finishing**: The ability to shoot without taking a controlling touch is valuable but risky. It requires reading the play early and trusting technique. Some situations demand it; others allow time to set up.

**The "Selfish" Myth**: Youth coaches often criticize players for shooting instead of passing. But research shows that elite scorers are decisive—they commit to shooting and execute. Hesitation kills more chances than "selfishness."`,
        keyResearch: {
          finding:
            'Analysis of goal-scoring opportunities in professional soccer found that chances converted decreased by 15% for every additional touch taken inside the penalty area. First-time finishes had the highest conversion rate.',
          citation:
            'Pollard, R., & Reep, C. (1997). Measuring the effectiveness of playing strategies at soccer. Journal of the Royal Statistical Society: Series D, 46(4), 541-550.',
        },
        decisionTree: {
          space: {
            question: 'Do I have space to shoot?',
            yes: 'Consider shooting—do I need a touch to set it up?',
            no: 'Can I create space with a touch, or is a pass better?',
          },
          angle: {
            question: 'Is the angle good enough?',
            yes: 'Shoot with conviction',
            no: 'Can I improve it, or find a teammate with a better angle?',
          },
          goalkeeper: {
            question: 'Is the goalkeeper set?',
            yes: 'Pick a corner and commit',
            no: 'Shoot early before they set',
          },
        },
      },
      {
        title: 'Handling Missed Chances',
        content: `Every striker misses. Every prolific goal-scorer has experienced droughts, missed sitters, and crucial penalties sent wide. What separates great finishers is their response to misses.

**The Short Memory**: Elite strikers have notoriously short memories. They don't dwell on misses during games. This isn't denial—it's a trained response that keeps them ready for the next chance.

**Post-Game Processing**: There's a time to analyze misses—after the game, with distance and calm. During the game, rumination is destructive. Developing this separation is a learnable skill.

**The Next-Ball Mentality**: In tennis, they call it "next ball." The last point is gone; only the current one matters. Finishers need this mentality. The miss is information for later, not a weight to carry now.

**Normalizing Misses**: Young players need to understand that even the best miss regularly. Showing them statistics—that elite strikers convert only 15-20% of their chances—removes the stigma from missing and the pressure of "must score."`,
        keyResearch: {
          finding:
            'Professional strikers who quickly disengaged attention from missed chances (measured by gaze behavior) showed higher conversion rates in subsequent opportunities compared to those who showed prolonged attention to misses.',
          citation:
            'Jordet, G., & Hartman, E. (2008). Avoidance motivation and choking under pressure in soccer penalty shootouts. Journal of Sport and Exercise Psychology, 30(4), 450-457.',
        },
        missRecoveryStrategies: [
          {
            strategy: 'Physical reset',
            description: 'A brief physical ritual (adjust socks, take a breath) to mark the transition',
          },
          {
            strategy: 'Verbal cue',
            description: 'A word or phrase that signals moving on ("Next one", "Here we go")',
          },
          {
            strategy: 'Refocus point',
            description: 'Something external to look at (the goal, a teammate) to shift attention',
          },
          {
            strategy: 'Process focus',
            description: 'Think about what to do next, not what just happened',
          },
        ],
      },
    ],
  },

  tacticalAwareness: {
    title: 'Part Three: Reading the Game',
    subtitle: 'Finding and creating shooting opportunities',
    introduction:
      'Goals don\'t come from nowhere. Understanding how to find shooting positions, when to make runs, and how to read defensive weaknesses turns average players into regular scorers.',
    sections: [
      {
        title: 'Movement to Create Chances',
        content: `The best finishers don't wait for the ball to find them—they actively create scoring opportunities through intelligent movement. This "movement without the ball" is often the difference between a player who scores regularly and one who doesn't.

**The Three Types of Movement**:
1. **Movement to receive**: Getting into position to receive a pass in a dangerous area
2. **Movement to create space**: Pulling defenders away to create room for yourself or teammates
3. **Movement to attack**: Timing runs to arrive in the right place as the ball does

**Anticipation Over Reaction**: Great finishers start moving before the pass is played. They read their teammate's body language, the defender's positioning, and the game situation to predict where opportunities will emerge.

**The Back Post Run**: One of the most effective movements in soccer—arriving at the far post as a cross comes in. It's hard to defend because the attacker sees the whole play develop while defenders must track both ball and runner.

**Checking Away to Come Back**: Creating space by moving away from where you want to receive, then sharply changing direction. Defenders have to commit to following or risk losing you.`,
        movementPrinciples: [
          {
            principle: 'Move early',
            explanation: 'Start your run before the passer is ready—arrive as the ball does',
          },
          {
            principle: 'Stay on the defender\'s blind side',
            explanation: 'Position so they can\'t watch you and the ball simultaneously',
          },
          {
            principle: 'Vary your runs',
            explanation: 'If you always go near post, defenders learn to expect it',
          },
          {
            principle: 'Communicate with body language',
            explanation: 'Show your teammate where you want the ball with your movement',
          },
        ],
      },
      {
        title: 'Reading the Goalkeeper',
        content: `The goalkeeper is the final obstacle, and reading them is an art. Great finishers process information about the goalkeeper and make decisions in fractions of a second.

**Goalkeeper Positioning**: Where is the goalkeeper standing? Are they cheating to one side? Have they come too far off their line? Each positioning decision creates vulnerabilities.

**Goalkeeper Body Language**: Set stance (ready to dive) vs. transitional stance (caught moving). A goalkeeper caught moving is vulnerable; a set goalkeeper requires placement or power.

**The Chip and the Dink**: When goalkeepers come off their line aggressively, the chip (lifting the ball over them) or dink (soft finish around them) become available. Recognizing these moments requires reading their movement early.

**Disguising Your Intentions**: Elite finishers show the goalkeeper one thing and do another. They shape to go one way, then finish the other. This deception starts in practice.`,
        goalkeeperReads: [
          {
            situation: 'Goalkeeper off their line',
            read: 'Are they set or moving?',
            options: 'Chip if moving forward; low finish if set but far out',
          },
          {
            situation: 'Goalkeeper on their line',
            read: 'Which way are they favoring?',
            options: 'Shoot to the far side; use power or placement based on angle',
          },
          {
            situation: 'Goalkeeper closing down',
            read: 'How quickly are they closing? What\'s their body position?',
            options: 'Round them if time; slot past them if they\'ve committed',
          },
          {
            situation: '1v1 breakaway',
            read: 'Are they staying or coming?',
            options: 'Dink early if they commit; wait and place if they stay',
          },
        ],
      },
      {
        title: 'Angles and Positioning',
        content: `The angle to goal determines what's possible. Understanding angles transforms decision-making—some positions demand certain finishes; others offer choices.

**Central vs. Wide Angles**: From directly in front of goal, the whole goal is available. From wide angles, the near post becomes difficult and the far post becomes the primary target. Players must recognize which angle they're at.

**The Near Post Myth**: Youth coaches often shout "near post!" as universal advice. But research shows that from wide angles, near-post shots have very low conversion rates. The far post is often the better choice.

**Creating Better Angles**: A single touch can dramatically improve shooting angle. Recognizing when to take a touch inside (to open up the goal) vs. shooting first time is a crucial skill.

**Shooting Across Goal**: When finishing from wide positions, shooting across the goalkeeper (to the far post) is generally more effective than shooting at the near post. The ball travels across the goalkeeper's body, making saves harder.`,
        keyResearch: {
          finding:
            'Analysis of goals scored from wide positions showed that 73% were scored at the far post, contradicting the common coaching instruction to target the near post.',
          citation:
            'Ensum, J., Pollard, R., & Taylor, S. (2005). Applications of logistic regression to shots at goal in association football. In Science and Football V (pp. 211-218). Routledge.',
        },
        angleGuidelines: [
          {
            angle: 'Central (0-15 degrees)',
            target: 'Either corner—pick early and commit',
            technique: 'Power or placement both work',
          },
          {
            angle: 'Inside (15-30 degrees)',
            target: 'Far corner is higher percentage',
            technique: 'Placement with inside or across body',
          },
          {
            angle: 'Wide (30+ degrees)',
            target: 'Far post strongly preferred',
            technique: 'Driven shot across goalkeeper',
          },
        ],
      },
      {
        title: 'Combination Play and One-Twos',
        content: `Many goals come from combination play—quick interchanges that unlock defenses. Understanding these patterns helps players both create and finish chances.

**The Give-and-Go**: The simplest combination—pass and immediately move to receive the return. Works because defenders struggle to track the ball and the runner simultaneously.

**Third-Man Runs**: Player A passes to Player B, who sets for Player C making a run from deep. The third-man runner often arrives unmarked because defenders focus on A and B.

**Overlap Runs**: A supporting player runs past the ball carrier on the outside, creating a 2v1 and opening shooting opportunities for either player.

**Wall Passes in the Box**: Quick combinations in and around the penalty area are devastating. Defenders can't hold their position and track runners. One-touch interchanges create clear looks at goal.`,
        combinationActivities: [
          {
            pattern: 'Give-and-go to goal',
            setup: 'Player A passes to B on the edge of the box, then runs onto the return for a shot',
            focus: 'Timing of run, weight of passes, finishing on the move',
          },
          {
            pattern: 'Third-man shooting',
            setup: 'A passes to B, who sets back for C running from midfield to shoot',
            focus: 'Timing, communication, shooting in stride',
          },
          {
            pattern: 'Overlap and cross/shoot',
            setup: 'Wide player receives, overlapping fullback creates option—cross or cut in to shoot',
            focus: 'Decision-making, recognizing when each option is best',
          },
        ],
      },
    ],
  },

  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities for developing shooting',
    introduction:
      'Shooting development follows a clear progression: coordination and contact quality first, then accuracy, then power, then decision-making under pressure. Rushing this sequence produces players with power but no control.',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Ball contact, basic striking motion, love of scoring',
        researchBasis:
          'At this age, children are developing fundamental movement patterns. Complex technique instruction is ineffective; learning happens through play and repetition.',
        principles: [
          'Make scoring easy and frequent',
          'Use appropriately sized balls (size 3) and goals',
          'Celebrate all attempts, not just goals',
          'No technique instruction—let them discover',
        ],
        activities: [
          {
            name: 'Goal Frenzy',
            time: '8-10 min',
            description:
              'Multiple small goals scattered around. Players dribble and shoot at any goal. Count total goals as a team challenge.',
            focus: 'Frequent shooting, joy of scoring',
            externalCue: 'How many goals can we score together?',
            variation: 'Add more goals, make some goals worth more points',
            coachingNote: 'Every child should score multiple times. Success breeds interest.',
          },
          {
            name: 'Cone Crash',
            time: '5-8 min',
            description:
              'Cones set up as targets inside a goal area. Players take turns trying to knock over cones with their shots.',
            focus: 'Accuracy, contact quality',
            externalCue: 'Can you knock over the cone?',
            variation: 'Move cones further away, use fewer cones, add points for specific cones',
            coachingNote: 'The concrete target makes the goal clear and measurable.',
          },
          {
            name: 'Shark Attack',
            time: '8-10 min',
            description:
              'Players dribble in an area with goals at each end. On "Shark Attack!" they must score in any goal before the shark (coach) catches them.',
            focus: 'Quick shooting decisions, shooting while moving',
            externalCue: 'Find a goal and shoot before the shark gets you!',
            variation: 'Add more sharks, fewer goals, require shooting with specific foot',
            coachingNote: 'The time pressure naturally encourages quick, committed shots.',
          },
        ],
        parentHomeActivities: [
          'Set up targets (cones, toys) to knock over with shots',
          'Create a goal from any two objects—shoot together',
          'Kick the ball against a wall and control the rebound',
          'Celebrate every goal with a special celebration',
        ],
        signsOfProgress: [
          'Contacts the ball with laces (not toes) most of the time',
          'Keeps eye on the ball through contact',
          'Shows excitement about shooting and scoring',
          'Attempts shots without prompting',
        ],
      },
      {
        name: 'Development Stage',
        ages: 'Ages 7-9',
        focus: 'Technique refinement, accuracy, both-foot development',
        researchBasis:
          'Children can now process basic technique cues and benefit from structured practice. Motor patterns established now tend to persist, making quality repetition important.',
        principles: [
          'Introduce basic technique cues (plant foot, ankle lock)',
          'Emphasize accuracy over power',
          'Develop both feet (but don\'t force it)',
          'Practice from different angles and distances',
        ],
        activities: [
          {
            name: 'Target Practice',
            time: '10-12 min',
            description:
              'Goal divided into zones with different point values. Players shoot from various positions, tracking their scores.',
            focus: 'Accuracy, picking targets',
            externalCue: 'Pick your spot before you shoot. Where do you want the ball to go?',
            variation: 'Add time pressure, require alternating feet, add a passive goalkeeper',
            coachingNote: 'The scoring system makes accuracy concrete without pressure.',
          },
          {
            name: 'First-Time Finishing',
            time: '10 min',
            description:
              'Server plays balls into the shooter from different angles. Shooter must finish first time.',
            focus: 'Adjusting body quickly, shooting without preparation',
            externalCue: 'Watch the ball onto your foot. Quick feet, quick shot.',
            variation: 'Add a goalkeeper, vary serve speed and angle',
            coachingNote: 'First-time finishing requires reading the ball early—a key skill.',
          },
          {
            name: '2v1 to Goal',
            time: '12-15 min',
            description:
              'Two attackers vs one defender, playing to goal. Attackers decide when to combine and when to shoot.',
            focus: 'Decision-making, shooting in game context',
            externalCue: 'Can you score? If yes, shoot! If not, find your teammate.',
            variation: 'Add a goalkeeper, make it 3v2, add time limit',
            coachingNote: 'Game context develops decision-making alongside technique.',
          },
          {
            name: 'Weak Foot Challenge',
            time: '8 min',
            description:
              'All shooting must be with the weaker foot. Start close and easy, gradually increase difficulty.',
            focus: 'Developing the weaker foot',
            externalCue: 'Same technique as your strong foot. Plant, lock, strike.',
            variation: 'Make it a game—strong foot goal = 1 point, weak foot = 3 points',
            coachingNote: 'Early investment in the weak foot pays dividends later.',
          },
        ],
        parentHomeActivities: [
          'Wall shooting—aim for specific spots on the wall',
          'Rebound practice—pass against wall, shoot the return',
          'Watch professional games and count shots/goals',
          'Challenge them to score with their weaker foot',
        ],
        signsOfProgress: [
          'Consistent plant foot beside the ball',
          'Can lock ankle on contact',
          'Shows accuracy from 10-12 yards',
          'Willing to shoot with weaker foot',
          'Picks a target before shooting',
        ],
      },
      {
        name: 'Skill Stage',
        ages: 'Ages 10-12',
        focus: 'Power development, variety of finishes, game-like shooting',
        researchBasis:
          'Physical development now allows for power generation. Technical foundation should be established; focus shifts to applying technique in game contexts and developing multiple finishing options.',
        principles: [
          'Add power to established technique',
          'Develop multiple finishing techniques (driven, placed, chipped)',
          'Practice under increasing pressure and fatigue',
          'Introduce tactical elements (movement, reading goalkeeper)',
        ],
        activities: [
          {
            name: 'Crossing and Finishing',
            time: '15 min',
            description:
              'Wide players deliver crosses; central players make runs to finish. Rotate positions.',
            focus: 'Timing runs, finishing crosses',
            externalCue: 'Read the crosser. Time your run to meet the ball.',
            variation: 'Add defenders, vary cross types (early, cutback, driven)',
            coachingNote: 'Heading can be introduced here if players are ready.',
          },
          {
            name: 'Finishing Under Fatigue',
            time: '10 min',
            description:
              'Player performs 10 seconds of high intensity work (sprints, jumps), then receives a pass and must finish.',
            focus: 'Maintaining technique when tired',
            externalCue: 'Catch your breath with your eyes. Look at the goal.',
            variation: 'Vary the physical demands, add decision-making elements',
            coachingNote: 'Games are won and lost by finishing when tired. Train for it.',
          },
          {
            name: 'Chip and Lob Practice',
            time: '10 min',
            description:
              'Goalkeeper starts off their line. Attacker must chip them from various distances.',
            focus: 'The chipped finish technique',
            externalCue: 'Get under the ball. Lift it over them like you\'re scooping ice cream.',
            variation: 'Moving goalkeeper, attacker approaching at speed',
            coachingNote: 'The chip is a valuable tool against aggressive goalkeepers.',
          },
          {
            name: '1v1 with Goalkeeper',
            time: '12 min',
            description:
              'Attacker starts with ball, must beat the goalkeeper in a 1v1. Focus on reading and reacting.',
            focus: 'Reading goalkeeper, selecting finish',
            externalCue: 'Watch the keeper. What are they showing you?',
            variation: 'Start from different positions, add time pressure',
            coachingNote: 'The most game-realistic finishing practice.',
          },
        ],
        parentHomeActivities: [
          'Video analysis—watch professional finishes together',
          'Discuss what makes certain finishes effective',
          'Practice different finish types together',
          'Set up 1v1 situations in the backyard',
        ],
        signsOfProgress: [
          'Can strike the ball with power AND accuracy',
          'Shows multiple finishing techniques',
          'Reads goalkeeper position and responds appropriately',
          'Maintains technique under fatigue',
          'Makes good shooting decisions in games',
        ],
      },
      {
        name: 'Refinement Stage',
        ages: 'Ages 13+',
        focus: 'Advanced finishes, pressure performance, position-specific development',
        researchBasis:
          'Players can now handle complex tactical instruction and benefit from specialized training. Mental skills become increasingly important as pressure increases.',
        principles: [
          'Master specialty finishes (volleys, headers, one-touch)',
          'Train mental skills explicitly (composure, confidence)',
          'Position-specific finishing patterns',
          'Competition and pressure in all shooting practice',
        ],
        activities: [
          {
            name: 'Penalty Shootout Training',
            time: '15 min',
            description:
              'Full penalty shootout format with stakes (consequences for missing, rewards for scoring). Practice the routine, not just the kick.',
            focus: 'Penalty technique and mental routine',
            externalCue: 'Trust your routine. Pick your spot. Commit.',
            variation: 'Vary the pressure, add crowd noise, require different targets',
            coachingNote: 'Penalty success is 80% mental. Train the routine, not just the kick.',
          },
          {
            name: 'Volley and Half-Volley Circuit',
            time: '15 min',
            description:
              'Servers deliver balls for volleys and half-volleys. Track success rate from each type.',
            focus: 'Advanced striking techniques',
            externalCue: 'Let the ball drop. Stay over it. Strike through the middle.',
            variation: 'Add goalkeepers, create game scenarios requiring these finishes',
            coachingNote: 'These are match-winning techniques worth dedicated practice.',
          },
          {
            name: 'Position-Specific Finishing',
            time: '20 min',
            description:
              'Strikers, wingers, and midfielders each practice finishes typical for their position with realistic service.',
            focus: 'Role-specific finishing patterns',
            externalCue: 'Varies by position and situation',
            variation: 'Add defenders, create position-specific scenarios from match footage',
            coachingNote: 'A striker\'s finishing needs differ from a winger\'s—train accordingly.',
          },
          {
            name: 'High-Pressure Shooting',
            time: '12 min',
            description:
              'Competition format where misses have consequences (running, next group shoots first). Simulate end-of-game pressure.',
            focus: 'Performing under pressure',
            externalCue: 'This is what you train for. Trust yourself.',
            variation: 'Vary the stakes and pressure types',
            coachingNote: 'The only way to perform under pressure is to practice under pressure.',
          },
        ],
        parentHomeActivities: [
          'Discuss mental approach to big moments',
          'Help them develop a pre-shot routine',
          'Watch and analyze their game footage together',
          'Support without adding pressure',
        ],
        signsOfProgress: [
          'Executes volleys and half-volleys with confidence',
          'Has a reliable penalty routine',
          'Maintains composure in high-pressure moments',
          'Makes quick, confident shooting decisions',
          'Can finish with either foot in any situation',
        ],
      },
    ],
  },

  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: 'Supporting your child\'s development as a finisher',
    introduction:
      'Scoring goals is emotionally loaded—for parents as much as players. Your response to goals and misses shapes your child\'s relationship with finishing more than any coaching.',
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Celebrate effort and process, not just goals',
            why: 'Goals depend partly on luck and circumstances. A well-executed shot that\'s saved is still progress. Celebrating process keeps them motivated through inevitable dry spells.',
            how: 'Notice and comment on good decisions, composure, and technique: "You picked a great spot there" matters more than "Great goal!"',
          },
          {
            action: 'Provide shooting opportunities at home',
            why: 'Shooting requires repetition to develop comfort and confidence. Game opportunities are limited; home practice fills the gap.',
            how: 'Set up a goal in the backyard. Create targets. Rebound for them. Make it a daily habit.',
          },
          {
            action: 'Help them develop a pre-shot routine',
            why: 'Routines create consistency and manage pressure. Professional shooters all have routines.',
            how: 'Discuss what helps them feel ready. Let them develop their own routine, then support them in practicing it.',
          },
          {
            action: 'Normalize misses',
            why: 'Fear of missing is the biggest barrier to confident finishing. When misses are treated as normal learning experiences, confidence grows.',
            how: 'Share statistics about professional miss rates. Point out when great players miss. Focus on what they learned.',
          },
          {
            action: 'Watch and discuss professional finishing',
            why: 'Visual learning is powerful. Seeing effective finishing builds mental models.',
            how: 'Watch games together. Point out movement, decision-making, and technique. Ask what they notice.',
          },
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Reacting negatively to missed chances',
            why: 'Your visible frustration adds pressure. Children are highly attuned to parent emotions. A sigh or head shake after a miss can create anxiety that compounds over time.',
            alternative: 'Stay neutral during games. Process your own emotions away from your child.',
          },
          {
            behavior: 'Instructing during games',
            why: '"Shoot!" from the sideline adds pressure and disrupts decision-making. They know they should shoot—adding your voice doesn\'t help.',
            alternative: 'Let them make their own decisions. Discuss choices later if they want to.',
          },
          {
            behavior: 'Comparing to prolific scorers',
            why: 'Comparison creates pressure and implies inadequacy. Every player develops at their own pace.',
            alternative: 'Compare only to their past self: "You\'re picking better spots than last month."',
          },
          {
            behavior: 'Overemphasizing goal tallies',
            why: 'When goals are the measure of success, misses become failures. This creates fear and hesitation.',
            alternative: 'Ask about effort, decisions, and enjoyment—not just whether they scored.',
          },
          {
            behavior: 'Technical criticism after misses',
            why: 'In the immediate aftermath of a miss, the last thing they need is a technique lesson. It adds shame to disappointment.',
            alternative: 'If technical discussion is needed, have it later, framed positively, and only if they want to.',
          },
        ],
      },
      {
        title: 'The Car Ride Home',
        content: `The minutes after a game are emotionally charged. How you handle this time affects your child's long-term relationship with competing and scoring.

**The 24-Hour Rule**: Avoid detailed game discussion for 24 hours. Emotions need time to settle—yours and theirs. Questions about specific misses or decisions feel like interrogation.

**Let Them Lead**: If they want to talk about the game, listen. If they don't, respect that. "How was it?" is enough.

**Avoid the Goal Count**: "Did you score?" shouldn't be your first question. It signals that scoring is what matters to you.

**Separate Food from Performance**: Getting ice cream shouldn't depend on scoring. Rewards tied to goals add pressure and imply that not scoring is disappointing.`,
      },
      {
        title: 'Managing Your Own Emotions',
        content: `Watching your child miss chances is hard. Your emotions are valid. But managing them is essential—their confidence depends partly on your calm.

**Recognize the Transfer**: Children absorb parent emotions. Your anxiety becomes their anxiety. Your disappointment feels like their failure.

**Create Distance**: If you can't control your reactions, create physical distance during games. Watch from further away. Step away during tense moments.

**Reframe the Situation**: A missed chance is a learning opportunity, proof they're getting into scoring positions, and part of every scorer's journey.

**Find Your Own Support**: Talk to other parents about the challenges. Don't process your frustrations through your child.`,
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
        title: 'Relentless Optimism',
        author: 'Darrin Donnelly',
        relevance: 'Building mental toughness and confidence in young athletes',
      },
    ],
    booksForCoaches: [
      {
        title: 'Soccer Finishing Curriculum',
        author: 'USSF',
        relevance: 'Official US Soccer guide to teaching finishing by age group',
      },
      {
        title: 'The Soccer Academy',
        author: 'Michael Matkovich',
        relevance: 'Technical development progressions for youth players',
      },
      {
        title: 'Practice Perfect',
        author: 'Doug Lemov',
        relevance: 'How to design practice that maximizes learning',
      },
      {
        title: 'Developing Youth Football Players',
        author: 'Horst Wein',
        relevance: 'Comprehensive approach to youth development from a pioneering coach',
      },
    ],
    academicReferences: [
      'Kellis, E., & Katis, A. (2007). Biomechanical characteristics and determinants of instep soccer kick. Journal of Sports Science & Medicine, 6(2), 154-165.',
      'Williams, A.M., & Hodges, N.J. (2005). Practice, instruction and skill acquisition in soccer: Challenging tradition. Journal of Sports Sciences, 23(6), 637-650.',
      'Wood, G., & Wilson, M.R. (2011). Quiet-eye training for soccer penalty kicks. Cognitive Processing, 12(3), 257-266.',
      'Buszard, T., Reid, M., Masters, R., & Farrow, D. (2016). Scaling the equipment and play area in children\'s sport. Sports Medicine, 46(6), 829-843.',
      'Jordet, G. (2009). Why do English players fail in soccer penalty shootouts? Journal of Sports Sciences, 27(2), 97-106.',
      'Coffee, P., & Rees, T. (2011). When the chips are down: Effects of attributional feedback on self-efficacy. Journal of Sports Sciences, 29(3), 235-245.',
      'Pollard, R., & Reep, C. (1997). Measuring the effectiveness of playing strategies at soccer. Journal of the Royal Statistical Society: Series D, 46(4), 541-550.',
      'Jordet, G., & Hartman, E. (2008). Avoidance motivation and choking under pressure in soccer penalty shootouts. Journal of Sport and Exercise Psychology, 30(4), 450-457.',
      'Ensum, J., Pollard, R., & Taylor, S. (2005). Applications of logistic regression to shots at goal in association football. Science and Football V, 211-218.',
    ],
  },

  playerStories: [
    {
      title: 'The Poacher',
      subtitle: 'Miroslav Klose and the Art of Being in the Right Place',
      placement: 'after-science',
      content: `Miroslav Klose didn't have the hardest shot. He wasn't the fastest or the most skillful. Yet he retired as the all-time leading scorer in World Cup history, with 16 goals across four tournaments.

His secret was simple: he was always in the right place.

"I wasn't born with special talent," Klose once said. "I just learned to read where the ball would go."

Watch Klose's goals, and you'll see a pattern. He rarely shoots from distance. He doesn't beat three defenders. Instead, he anticipates where the ball will land and arrives there—often just a yard or two from goal—with perfect timing.

This wasn't luck. It was thousands of hours of studying patterns, reading movements, and training his instincts. Klose watched goalkeepers' tendencies, learned how balls deflected off defenders, and practiced being in the "second ball" positions that other strikers ignored.

For young players, Klose's career is a reminder that scoring goals isn't just about striking the ball hard. Sometimes the best finish is a simple tap-in—but getting into position for that tap-in is an art form in itself.

He called it "the hard work nobody sees"—the runs that don't receive the ball, the movement that creates the space, the anticipation that puts you where the goal becomes easy.`,
      image: null,
      quote: {
        text: 'The goal is only the last step. The work that gets you there is invisible.',
        attribution: 'Miroslav Klose',
      },
    },
    {
      title: 'Ice in His Veins',
      subtitle: 'Thierry Henry and Composure Under Pressure',
      placement: 'after-mental',
      content: `Thierry Henry had speed, technique, and power. But what separated him from other great strikers was something psychological: complete calm when one-on-one with the goalkeeper.

Watch Henry's goals, particularly his 1v1 finishes, and notice his face. No tension. No rush. He approaches the goalkeeper with the demeanor of someone taking a walk in the park.

"When I'm through on goal," Henry explained, "time slows down for me. I see everything clearly. I know exactly what I'm going to do."

This composure wasn't accidental. Henry practiced 1v1 situations obsessively, training his nervous system to recognize these moments as familiar rather than threatening. What felt like pressure to others felt like routine to him.

His finishing technique reflected this calm. Rather than blasting the ball, Henry often side-footed finishes past the goalkeeper with precision. He trusted that accuracy and timing would beat the goalkeeper's dive.

For young players, Henry's example shows that finishing composure can be developed. The key is making pressure situations familiar through practice. When you've finished a thousand 1v1s in training, the one in the cup final doesn't feel so different.

Henry's advice to young strikers was simple: "Don't try to hit it harder. Try to be calmer. The goal doesn't move."`,
      image: null,
      quote: {
        text: 'When you\'re calm, you see more. When you see more, scoring becomes simple.',
        attribution: 'Thierry Henry',
      },
    },
    {
      title: 'The Complete Finisher',
      subtitle: 'Cristiano Ronaldo and the Obsession with Improvement',
      placement: 'in-progression',
      content: `By any statistical measure, Cristiano Ronaldo is one of the greatest goal-scorers in football history. Over 900 career goals, scored with his right foot, left foot, and head, from inside the box and from distance, from open play and set pieces.

But Ronaldo wasn't always this complete. Early in his career at Manchester United, he was known more for stepovers and showboating than for efficient finishing. His transformation came through obsessive practice.

"When I arrived at Madrid," Ronaldo recalled, "I decided to become the best finisher in the world. I practiced every type of finish, every day, until they all became natural."

Teammates described his training routine with amazement. While others rested, Ronaldo took extra shooting practice. He practiced penalties until he had a routine he trusted absolutely. He worked on his heading until he could hang in the air and direct the ball with precision.

Perhaps most importantly, Ronaldo worked on finishes he rarely used. "You practice the chip not because you'll use it often," he explained, "but because when you need it, you must be ready."

This completeness made him unpredictable and effective. Goalkeepers couldn't prepare for one type of finish because Ronaldo could beat them in any way.

For young players, Ronaldo's journey shows that elite finishing is built, not born. He developed every aspect of his game through deliberate, focused practice over many years.`,
      image: null,
      quote: {
        text: 'Talent without practice is nothing. I worked for everything I have.',
        attribution: 'Cristiano Ronaldo',
      },
    },
  ],

  coachWisdom: [
    {
      title: 'The Psychology of Scoring',
      coach: 'Arsène Wenger',
      role: 'Arsenal FC, 22-year tenure as manager',
      placement: 'after-science',
      content: `Arsène Wenger managed some of the most prolific strikers in Premier League history—Thierry Henry, Ian Wright, Robin van Persie. He understood that finishing was as much mental as technical.

"The fear of missing is the striker's enemy," Wenger observed. "You see it in their body language. Tension in the shoulders. Rushing the shot. Looking at the goalkeeper instead of the target."

Wenger's solution was to remove the stigma from missing. In training, misses were analyzed without criticism. The question was always "What did you see? What did you try?" rather than "Why did you miss?"

He also created training environments where finishing felt natural. "We don't just practice shooting," he explained. "We practice arriving in front of goal feeling confident. The shooting is the easy part."

Wenger believed that confidence came from understanding. Players who understood their own technique—why they scored when they scored, why they missed when they missed—developed stable self-belief. Those who relied on form were vulnerable to collapses.

His advice for developing young finishers: "Let them score a lot when they're young. Empty goals, easy chances—it doesn't matter. What matters is that they learn to expect the ball to go in."`,
      quote: {
        text: 'A striker who thinks is a striker who scores. A striker who worries is a striker who misses.',
        attribution: 'Arsène Wenger',
      },
      keyPrinciple: 'Finishing confidence comes from understanding technique and removing the fear of missing.',
    },
    {
      title: 'Finishing Is Problem-Solving',
      coach: 'Jürgen Klopp',
      role: 'Liverpool FC, Borussia Dortmund, Champions League winner',
      placement: 'after-mental',
      content: `Jürgen Klopp's Liverpool became known for attacking football and clinical finishing. His approach combined intensity with intelligence.

"Finishing is not just technique," Klopp explains. "It's solving a problem. Every shooting situation is different. The player must read the situation and find the solution."

In Klopp's training sessions, shooting is always contextual. Players rarely take shots without movement, decision-making, or defensive pressure. "We want them to think and execute at the same time," he says. "That's what the game demands."

Klopp is famous for his emotional touchline presence, but his approach to finishing is analytical. He uses data to show players their best finishing positions, the types of chances they convert most often, and the patterns that lead to goals.

"When a player understands their own game," Klopp notes, "they stop trying to be someone else. They focus on what they do well."

He's particularly focused on the moment just before the shot. "The last decision is the most important. Do I shoot now? Do I take a touch? Do I pass? Players who make that decision quickly and confidently score more goals."

His advice: "Don't just practice shooting. Practice the whole sequence—the movement, the decision, the execution. They cannot be separated."`,
      quote: {
        text: 'The goal is the answer to a question. Great finishers are great problem-solvers.',
        attribution: 'Jürgen Klopp',
      },
      keyPrinciple: 'Finishing must be trained in context, with decision-making as integral as technique.',
    },
    {
      title: 'Patience and Repetition',
      coach: 'Carlo Ancelotti',
      role: 'Real Madrid, AC Milan, Chelsea; 4-time Champions League winner',
      placement: 'in-progression',
      content: `Carlo Ancelotti has worked with some of the greatest finishers in football history: Andriy Shevchenko, Karim Benzema, Filippo Inzaghi, Cristiano Ronaldo. He speaks about finishing with the patience of someone who has seen it develop thousands of times.

"You cannot rush finishing development," Ancelotti says calmly. "Some players take years to become reliable in front of goal. You must trust the process."

Ancelotti believes in repetition—but intelligent repetition. "It's not about taking 100 shots the same way. It's about taking 100 shots with attention, with purpose, with awareness of what you're doing."

He pays particular attention to the mental side of finishing. "The technique can be perfect in training but disappear in the game. This is a mental problem. The brain needs to trust what the body can do."

His solution is gradual exposure to pressure. "Start with no goalkeeper. Then add a goalkeeper. Then add a defender. Then add consequence. Build the pressure slowly so the player grows with it."

Ancelotti has seen many talented players fail to fulfill their potential as finishers. The common thread: impatience. "They wanted to be great scorers immediately. They didn't respect the time it takes."

His message to young players and their parents: "Trust the development. The goals will come if the work is right. Chasing goals creates pressure that makes them harder to score."`,
      quote: {
        text: 'Development takes time. Trust the process. The goals are coming.',
        attribution: 'Carlo Ancelotti',
      },
      keyPrinciple: 'Patient, purposeful practice builds reliable finishers; rushing creates anxiety.',
    },
  ],
};

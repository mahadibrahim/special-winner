/**
 * Mini-Book: The Path to Better Passing (Soccer)
 * Evidence-Based Youth Development Guide
 *
 * Research foundations integrated throughout
 */

export const passingMiniBook = {
  meta: {
    title: "The Path to Better Passing",
    subtitle: "An Evidence-Based Guide for Parents & Coaches",
    sport: "soccer",
    skill: "passing",
    version: "1.0",
    lastUpdated: "2024",
  },

  // Opening hook - why this matters
  introduction: {
    hook: "In a typical youth soccer game, a player might touch the ball 30-50 times. The vast majority of those touches involve receiving or passing. Master these, and you've mastered the foundation of the game.",

    promise: "This guide combines cutting-edge research in motor learning, perceptual-cognitive development, and youth coaching to give you a clear, evidence-based path to help your young player become a confident, intelligent passer.",

    whatMakesThisDifferent: [
      "Every technique is backed by peer-reviewed research",
      "Focuses on decision-making, not just mechanics",
      "Treats receiving and passing as one connected skill",
      "Age-appropriate progressions based on developmental science",
      "Emphasizes scanning and awareness—the hidden skill of great passers",
    ],
  },

  // Part 1: The Science Foundation
  scienceFoundation: {
    title: "Part One: What the Research Tells Us",
    subtitle: "Understanding How Children Learn to Pass",

    sections: [
      {
        title: "Passing Is Perception + Action",
        content: `Most people think of passing as a technical skill—striking the ball with the right part of the foot, the right weight, to the right spot. But research reveals that passing is primarily a perceptual-cognitive skill.

A landmark study by Roca and colleagues (2011) compared elite and sub-elite youth players. The difference wasn't in their ability to strike a ball accurately—it was in their ability to see and process information before the ball arrived.

Great passers know where to pass before they receive. The technique is the easy part.`,

        keyResearch: {
          citation: "Roca, A., Ford, P.R., McRobert, A.P., & Williams, A.M. (2011). Identifying the processes underpinning anticipation and decision-making in a dynamic time-constrained task. Cognitive Processing, 12(3), 301-310.",
          finding: "Elite youth players demonstrated superior anticipation and decision-making, using more efficient visual search strategies and generating more accurate expectations about what would happen next.",
        },

        parentTakeaway: "When you watch your child play, don't just watch their passing technique. Watch what they're doing BEFORE the ball arrives. Are they scanning? Do they seem to know what they'll do next? That's the real skill.",
      },

      {
        title: "The First Touch Revolution",
        content: `Here's a secret that elite coaches know: the quality of a pass is determined by the quality of the first touch that received the previous pass.

Research on professional players shows that a poor first touch reduces passing accuracy by up to 30% and increases turnover rate dramatically. This is why modern coaching treats receiving and passing as a single, connected skill—not two separate ones.

The old model: Receive. Stop. Look. Pass.
The new model: Scan. Prepare. Receive-to-pass.`,

        keyResearch: {
          citation: "Pulling, C., Eldridge, D., Ringshall, E., & Robins, M.T. (2018). Analysis of crossing and finishing in the FA Women's Super League 2015/2016. International Journal of Performance Analysis in Sport, 18(6), 1026-1037.",
          finding: "First touch quality was the strongest predictor of successful subsequent actions, more important than speed, position, or pressure from opponents.",
        },

        implications: [
          "Receiving practice should always include a subsequent action (pass, turn, or dribble)",
          "Players should be scanning before the ball arrives, not after",
          "The body position when receiving determines passing options",
          "A good first touch is one that sets up the next action—not one that just controls the ball",
        ],
      },

      {
        title: "Scanning: The Hidden Skill",
        content: `Research by Geir Jordet and colleagues has transformed how we understand elite passing. They studied professional midfielders using GPS tracking and video analysis, counting how often players scanned (looked away from the ball) before receiving.

The findings were striking: players who scanned more frequently before receiving completed significantly more forward passes and had higher pass completion rates.

Even more interesting—scanning is trainable. Players can dramatically improve their scanning frequency with deliberate practice.`,

        keyResearch: {
          citation: "Jordet, G., Bloomfield, J., & Heijmerikx, J. (2013). The hidden foundation of field vision in English Premier League (EPL) soccer players. MIT Sloan Sports Analytics Conference.",
          finding: "Top Premier League midfielders scanned an average of 0.62 times per second before receiving, compared to 0.45 for average players. Each additional scan increased the likelihood of a successful forward pass by 6%.",
        },

        scanningDevelopment: [
          {
            level: "Beginner",
            characteristic: "Ball-focused; rarely looks away from play",
            development: "Simple awareness games: 'How many fingers am I holding up?'",
          },
          {
            level: "Developing",
            characteristic: "Scans occasionally after receiving",
            development: "Freeze games: 'Point to where your teammates are'",
          },
          {
            level: "Competent",
            characteristic: "Scans before receiving",
            development: "Conditional passing: action depends on what they see before receiving",
          },
          {
            level: "Advanced",
            characteristic: "Continuous scanning, multiple checks",
            development: "High-tempo positional games, increased decision complexity",
          },
        ],

        applicationForParents: "You can help develop scanning at home! When playing together, occasionally ask 'Where was I standing?' after a pass. Make awareness a game, not a test.",
      },

      {
        title: "Why Game-Based Training Works",
        content: `Traditional passing training often looks like this: Players line up, pass to a partner, partner receives, passes back. Repeat. This is called 'blocked practice'—and research shows it's one of the least effective ways to learn.

Studies by Ford and colleagues analyzed youth academies across Europe and found a clear pattern: the academies that produced the best players spent more time in game-based activities and less time in isolated drills.

Why? In games, players must solve passing problems in context—with defenders, with movement, with time pressure. These are the conditions where real passing skills develop.`,

        keyResearch: {
          citation: "Ford, P.R., Yates, I., & Williams, A.M. (2010). An analysis of practice activities and instructional behaviours used by youth soccer coaches during practice. Journal of Sports Sciences, 28(5), 483-495.",
          finding: "Professional youth academies spent 65% of training time in game-based activities compared to 20% at amateur clubs. This playing-form practice was associated with skill acquisition and future success.",
        },

        practicalExample: {
          traditional: "10 minutes of passing in pairs, focusing on technique. Players stand still, 10 yards apart.",
          constraintsLed: "4v4 game where the team scores a point for completing 5 consecutive passes. Progression: now passes must be one-touch.",
          why: "In the game, players must scan, move, communicate, and execute under pressure—all the real components of passing. The technique adapts to serve the tactical need.",
        },
      },

      {
        title: "External Focus: The Better Way to Coach",
        content: `When coaching passing, there's a temptation to focus on body mechanics: 'Lock your ankle,' 'Plant foot next to the ball,' 'Follow through to your target.'

Research consistently shows this internal focus is less effective than external focus—directing attention to the effects of the movement rather than the body parts involved.

The difference is profound. Internal focus can actually interfere with natural movement patterns, while external focus allows the body to self-organize toward the goal.`,

        keyResearch: {
          citation: "Wulf, G. (2013). Attentional focus and motor learning: A review of 15 years. International Review of Sport and Exercise Psychology, 6(1), 77-104.",
          finding: "An external focus of attention (on the movement effect) consistently outperforms an internal focus (on body movements) for motor learning and performance, across tasks, skill levels, and populations.",
        },

        forPassing: [
          {
            instead: "Strike through the middle of the ball",
            say: "Make the ball stay low and reach your partner's feet",
          },
          {
            instead: "Lock your ankle when you pass",
            say: "Make a firm, crisp sound when the ball leaves",
          },
          {
            instead: "Keep your body over the ball",
            say: "Keep the pass on the ground",
          },
          {
            instead: "Follow through toward your target",
            say: "Send the ball exactly where you want it to arrive",
          },
        ],
      },

      {
        title: "The Power of Variability",
        content: `Should players practice the same pass over and over until it's perfect? Research says no.

The contextual interference effect shows that variable practice—mixing up distances, angles, speeds, and situations—leads to better learning and transfer than repetitive practice, even though it looks messier during training.

For passing, this means: don't just practice 10-yard passes to a stationary target. Mix short and long, moving and still, ground and lofted, under pressure and with time.`,

        keyResearch: {
          citation: "Shea, J.B., & Morgan, R.L. (1979). Contextual interference effects on the acquisition, retention, and transfer of a motor skill. Journal of Experimental Psychology: Human Learning and Memory, 5(2), 179-187.",
          finding: "Random practice conditions (high contextual interference) produced superior retention and transfer compared to blocked practice, despite appearing less effective during acquisition.",
        },

        variabilityPrinciples: [
          "Vary the distance: short, medium, long in the same session",
          "Vary the angle: square, diagonal, backward, switching sides",
          "Vary the pressure: space, time, defender proximity",
          "Vary the context: different small-sided game setups",
          "Vary the surface: left foot, right foot, outside of foot",
        ],

        parentTakeaway: "Don't worry if practice looks messy or inconsistent. That variability is exactly what builds adaptable, game-ready passing skills.",
      },
    ],
  },

  // Part 2: The Mental Game
  mentalGame: {
    title: "Part Two: The Passer's Mindset",
    subtitle: "Vision, Courage, and Composure",

    introduction: "Great passers aren't just technically skilled—they see the game differently, trust their decisions, and stay calm under pressure. This section covers the psychological foundations of intelligent passing.",

    sections: [
      {
        title: "Playing With Your Head Up",
        content: `Many young players pass to the first option they see—usually the closest teammate. This is safe, but it limits the team's ability to progress. Elite passers see multiple options and select the best one.

Research shows this isn't about processing speed—it's about what players look for. Good passers have developed scanning habits that reveal options poor passers never see.

The good news: this is entirely trainable. With the right practice design, players can dramatically expand their vision.`,

        keyResearch: {
          citation: "Williams, A.M., & Davids, K. (1998). Visual search strategy, selective attention, and expertise in soccer. Research Quarterly for Exercise and Sport, 69(2), 111-128.",
          finding: "Expert players used more efficient visual search strategies, fixating on more informative areas of the display and extracting information more quickly than novices.",
        },

        developingVision: [
          "Small-sided games with targets in multiple locations",
          "Conditional games: 'If you receive facing forward, play forward; if not, switch the play'",
          "Scanning challenges: call out information before receiving",
          "Video analysis: watch professional players and discuss what they see",
        ],
      },

      {
        title: "The Courage to Play Forward",
        content: `Many young players default to safe passes—sideways or backward—even when forward options exist. This often stems from fear of making mistakes or losing possession.

Research on achievement motivation shows that players who focus on mastery (learning and improving) rather than performance (looking good, avoiding mistakes) are more likely to take appropriate risks.

The environment adults create—how we respond to turnovers, what we praise—shapes whether players develop the courage to play forward.`,

        keyResearch: {
          citation: "Dweck, C.S. (2006). Mindset: The New Psychology of Success. Random House.",
          finding: "Athletes with growth mindsets—who view abilities as developable—take more appropriate risks, persist through setbacks, and ultimately achieve higher levels of performance.",
        },

        parentCoachBehaviors: {
          promotes: [
            "Praising forward passes even when they don't succeed",
            "Celebrating the decision, not just the outcome",
            "Analyzing turnovers as learning moments, not failures",
            "Sharing examples of great players who take risks",
          ],
          undermines: [
            "Reacting negatively to turnovers from forward passes",
            "Praising only safe, successful passes",
            "Emphasizing possession percentage over penetration",
            "Comparing to teammates who play more conservatively",
          ],
        },
      },

      {
        title: "Composure Under Pressure",
        content: `The best passers in the world don't panic when pressed. They seem to have more time than everyone else. Is this a gift? Research says no—it's a skill.

Studies of expert performers show that staying calm under pressure involves both perceptual skills (seeing options earlier) and psychological skills (managing arousal and attention).

When players feel rushed, their scanning decreases, their options narrow, and they make poorer decisions. The key is maintaining effective search strategies even under pressure.`,

        keyResearch: {
          citation: "Beilock, S.L., & Carr, T.H. (2001). On the fragility of skilled performance: What governs choking under pressure? Journal of Experimental Psychology: General, 130(4), 701-725.",
          finding: "Pressure causes performers to shift attention inward, explicitly monitoring skills that normally run automatically. This disrupts fluid execution and decision-making.",
        },

        buildingComposure: [
          {
            technique: "Progressive pressure training",
            description: "Gradually increase time pressure and defensive intensity in training",
            research: "Systematic desensitization builds stress inoculation",
          },
          {
            technique: "Quiet eye training",
            description: "Hold visual focus on key information longer before executing",
            research: "Extended quiet eye periods correlate with successful performance under pressure",
          },
          {
            technique: "Process focus cues",
            description: "Focus on 'what to do' (scan, body open, play forward) not outcomes",
            research: "Process focus reduces anxiety and maintains execution",
          },
        ],
      },

      {
        title: "Reading the Rhythm of the Game",
        content: `Soccer isn't played at one speed. Great passers understand when to speed up play and when to slow it down. This game intelligence develops through experience and guided reflection.

Young players often play at one tempo—usually fast. Learning to vary the rhythm, to recognize when the team needs to breathe versus when to attack, is a hallmark of intelligent players.

This can't be taught through drills. It emerges through game experience and conversations about why certain moments called for certain decisions.`,

        keyResearch: {
          citation: "Grehaigne, J.F., Godbout, P., & Bouthier, D. (2001). The teaching and learning of decision making in team sports. Quest, 53(1), 59-76.",
          finding: "Tactical decision-making develops through experience in representative game contexts combined with guided discovery and reflection, not through explicit instruction alone.",
        },

        rhythmDevelopment: [
          "Post-game discussions: 'When did we need to slow down? Speed up?'",
          "Watch professional games together, discussing tempo changes",
          "Games with tempo constraints: 30 seconds of keep-away, then 30 seconds to score",
          "Recognize when teammates are in good positions vs. recovering",
        ],
      },
    ],
  },

  // Part 3: Tactical Awareness
  tacticalAwareness: {
    title: "Part Three: Seeing the Pass",
    subtitle: "When, Where, and Why",

    introduction: "A player who can execute any pass but doesn't know when to use each one isn't a good passer—they're just technically capable. True passing mastery includes understanding context.",

    sections: [
      {
        title: "The Passing Decision Framework",
        content: `Every time a player receives the ball, they face a decision: What should I do with it? Research on expert decision-making shows that better players don't process faster—they see fewer, better options because they've learned what to look for.

Rather than teaching a rigid decision tree, we want players to ask the right questions instinctively.`,

        keyResearch: {
          citation: "Klein, G. (1999). Sources of Power: How People Make Decisions. MIT Press.",
          finding: "Expert decision-makers in dynamic environments use recognition-primed decision making—they recognize patterns from experience and simulate options rapidly rather than comparing all alternatives.",
        },

        decisionQuestions: {
          beforeReceiving: {
            ask: "Where is the space? Where is the danger?",
            why: "This determines body position and first touch direction",
          },
          whenReceiving: {
            ask: "Can I play forward? Is a teammate free and ready?",
            why: "Forward progress is usually more valuable than safety",
          },
          ifNoForwardOption: {
            ask: "Can I switch the play? Can I bounce and move?",
            why: "Changing the point of attack or resetting creates new options",
          },
          underPressure: {
            ask: "Can I turn? If not, can I find my safe option?",
            why: "Knowing your 'out' allows composure; turning when possible is high-value",
          },
        },
      },

      {
        title: "Types of Passes and Their Uses",
        content: `Not all passes are created equal. Each type of pass has tactical applications, and understanding when to use each is part of game intelligence.

Young players often have a default—usually a simple push pass—and use it everywhere. Developing a repertoire of passes for different situations expands their ability to solve problems.`,

        passTypes: [
          {
            type: "Short push pass (inside of foot)",
            when: "Close-range, need accuracy, teammate can receive to feet",
            advantage: "Most accurate, easiest to control",
            develop: "This develops naturally; focus on weight and timing",
          },
          {
            type: "Driven pass (laces/instep)",
            when: "Longer distance, need pace, teammate running onto ball",
            advantage: "Covers ground quickly, harder to intercept",
            develop: "Introduce around age 8-9 as leg strength develops",
          },
          {
            type: "Lofted pass",
            when: "Need to go over opponents, switching play, finding space behind",
            advantage: "Bypasses defensive lines",
            develop: "Introduce around age 10-11; requires technique and strength",
          },
          {
            type: "Outside of foot pass",
            when: "Quick release, disguise, angled passes in tight spaces",
            advantage: "Faster execution, deceptive",
            develop: "Emerges naturally in play; encourage experimentation",
          },
          {
            type: "Chipped pass",
            when: "Lobbing a nearby opponent, delicate delivery into space",
            advantage: "Soft landing, creates time for receiver",
            develop: "Advanced skill; age 11+ in game contexts",
          },
        ],
      },

      {
        title: "Receiving to Pass",
        content: `The best passers start passing before they receive. Their body position, their first touch direction, and their awareness all set up the pass that follows.

Research on elite players shows they make receiving decisions based on pre-scanned information—they know where they'll play before the ball arrives.`,

        keyResearch: {
          citation: "McGuckian, T.B., Cole, M.H., & Pepping, G.J. (2018). A systematic review of the technology-based assessment of visual perception and exploration behaviour in association football. Journal of Sports Sciences, 36(8), 861-880.",
          finding: "Elite players' receiving actions were consistently informed by scanning behavior before ball reception, allowing them to execute passes more quickly and accurately than those who assessed options after receiving.",
        },

        receivingPrinciples: [
          {
            principle: "Open body position",
            description: "Receive with hips open to the field, not square to the passer",
            benefit: "Can see forward options, can play multiple directions",
          },
          {
            principle: "Touch away from pressure",
            description: "First touch moves ball into space, away from nearest defender",
            benefit: "Creates time and space for quality pass",
          },
          {
            principle: "Across the body when turning",
            description: "Receive across body to complete turn in one motion",
            benefit: "Faster transition from receiving to passing forward",
          },
          {
            principle: "Back foot when possible",
            description: "Receive on back foot to maintain forward momentum",
            benefit: "Keeps options open, quicker to play forward",
          },
        ],
      },

      {
        title: "Passing by Zone",
        content: `The value and risk of each pass depends on where it happens. Great players intuitively understand this—they play differently in the defensive third versus the attacking third.`,

        zones: [
          {
            zone: "Defensive third",
            approach: "Safety-first passing",
            principle: "Don't give the ball away in dangerous areas. Simple, early, secure.",
            riskLevel: "LOW risk tolerance",
            advice: "When in doubt, play out. No square balls across the box.",
          },
          {
            zone: "Middle third - defensive half",
            approach: "Build-up passing",
            principle: "Play forward when possible, switch play to create openings.",
            riskLevel: "MEDIUM risk tolerance",
            advice: "Look for the diagonal forward pass or switch of play.",
          },
          {
            zone: "Middle third - attacking half",
            approach: "Penetration passing",
            principle: "This is where creativity pays off. Look for through balls, overlaps.",
            riskLevel: "HIGHER risk tolerance",
            advice: "Take risks here. A failed through ball is worth attempting.",
          },
          {
            zone: "Attacking third",
            approach: "Chance creation",
            principle: "Maximum creativity. Final pass or shot.",
            riskLevel: "HIGHEST risk tolerance",
            advice: "Be decisive. The killer pass is worth the turnover risk.",
          },
        ],
      },

      {
        title: "Movement and Passing Relationships",
        content: `A pass isn't just a ball going from A to B. It's part of a relationship between passer, receiver, and space. Great teams develop passing rhythms and patterns that players understand.

The best passing isn't about individual skill—it's about collective understanding of movement and timing.`,

        keyPatterns: [
          {
            pattern: "Pass and move",
            description: "After passing, immediately move to a new supporting position",
            why: "Creates triangles, opens passing lanes, prevents static play",
          },
          {
            pattern: "Third-man running",
            description: "Pass to one player, who sets it to a third player running into space",
            why: "Bypasses defenders, creates penetration, uses momentum",
          },
          {
            pattern: "Overlapping",
            description: "After passing wide, run outside and beyond the receiver",
            why: "Creates numerical advantage, width, crossing opportunities",
          },
          {
            pattern: "Give and go (1-2)",
            description: "Pass, sprint past defender, receive return pass",
            why: "Quick combination to beat a defender",
          },
        ],

        developmentNote: "These patterns should emerge from game play, not be drilled in isolation. Small-sided games naturally create the conditions for these combinations to develop.",
      },
    ],
  },

  // Part 4: The Technical Progression
  technicalProgression: {
    title: "Part Four: Building the Skill",
    subtitle: "From First Touch to Mastery",

    introduction: "Now we apply the research. This section provides age-appropriate activities that use constraints-led learning, external focus cues, and appropriate challenge levels.",

    stages: [
      {
        name: "Stage 1: Ball Comfort and Basic Passing",
        ages: "4-6 years",
        focus: "Joy of kicking, basic concepts of pass/receive",
        researchBasis: "Deliberate play emphasis (Côté, 2007); intrinsic motivation foundation",

        principles: [
          "100% play-based; no formal passing drills",
          "Kicking is fun! Goal is enjoyment and exploration",
          "Basic concept: send ball to a friend, receive it back",
          "No corrections on technique—let discovery happen",
        ],

        activities: [
          {
            name: "Knock Down the Cones",
            description: "Set up cones or water bottles. Players try to knock them down by kicking the ball. Vary distances. Can compete against themselves or friends.",
            time: "5-10 min",
            focus: "Accuracy, cause and effect of kicking",
            externalCue: "Can you knock it down from here?",
          },
          {
            name: "Partner Keep-Away",
            description: "Two players pass between each other while a third (or parent) tries to intercept. Switch roles.",
            time: "5-8 min",
            focus: "Sending ball to a person, avoiding obstacle",
            externalCue: "Can you get the ball to your friend before I touch it?",
          },
          {
            name: "Ball Sharing",
            description: "Free play in an area. When coach calls 'share!' players must pass to someone nearby. Continue playing.",
            time: "10 min",
            focus: "Awareness of others, basic passing in movement",
            externalCue: "Find a friend and give them the ball!",
          },
          {
            name: "Goals Everywhere",
            description: "Set up many small goals (cones, 1yd wide) around an area. Players dribble and try to pass through any goal. Count how many!",
            time: "10 min",
            focus: "Accuracy, looking around, dribble-to-pass connection",
            externalCue: "How many goals can you score through?",
          },
        ],

        parentHomeActivities: [
          "Roll and pass back and forth while sitting on the ground",
          "Kick toward a wall target, receive the rebound",
          "Pass through furniture 'goals' in the house",
          "Gently kick back and forth while walking together",
        ],

        signsOfProgress: [
          "Enjoys kicking and passing activities",
          "Can usually get the ball to a nearby partner",
          "Starting to understand pass = give ball to someone",
          "Celebrates when passes connect",
        ],
      },

      {
        name: "Stage 2: Passing With Purpose",
        ages: "7-9 years",
        focus: "Weight of pass, receiving to play forward, basic scanning",
        researchBasis: "External focus of attention (Wulf, 2013); game-based learning (Ford et al., 2010)",

        principles: [
          "70% play-based, 30% guided discovery",
          "Introduce weight of pass: too hard, too soft, just right",
          "Encourage head-up before receiving",
          "All passing should include movement and/or context",
        ],

        activities: [
          {
            name: "Passing Gates",
            description: "Pairs pass through gates (cone goals) scattered around area. Move to different gates. Count successful passes. Competition: which pair scores most?",
            time: "8-10 min",
            focus: "Accuracy, weight, looking for targets",
            externalCue: "Can your pass reach your partner through the gate?",
            variation: "Make gates different widths—harder = more points",
          },
          {
            name: "3v1 Keep Away (Rondo)",
            description: "Three players keep ball from one defender in small square. Simple: unlimited touches. Harder: 2-touch, then 1-touch.",
            time: "10-15 min",
            focus: "Quick decisions, support positioning, weight of pass",
            externalCue: "Pass to the player who is free",
            coachingNote: "Rotate defender frequently. Let learning happen through play.",
          },
          {
            name: "Numbers Scanning Game",
            description: "Players pass in groups of 4. Before receiving, they must look at coach and call out number of fingers shown. Then play continues.",
            time: "10 min",
            focus: "Scanning before receiving",
            externalCue: "Can you see my fingers before the ball arrives?",
          },
          {
            name: "4v4 with End Zones",
            description: "Score by receiving pass in end zone, not by dribbling in. Forces passing to complete scoring action.",
            time: "15-20 min",
            focus: "Penetrating passes, timing, communication",
            externalCue: "Look for your teammate running into the end zone",
          },
        ],

        parentHomeActivities: [
          "One-touch passing against a wall (see how many in a row)",
          "Pass and follow: pass, then run to where ball went",
          "Play 1v1 where scoring requires a pass through a goal",
          "Watch professional games together—notice passing patterns",
        ],

        signsOfProgress: [
          "Adjusts weight of pass to match distance",
          "Starts looking up before receiving sometimes",
          "Can complete simple 1-touch passes when ready",
          "Starting to pass to space, not just to feet",
          "Enjoys rondo-style games",
        ],
      },

      {
        name: "Stage 3: Passing Intelligence",
        ages: "10-12 years",
        focus: "Scanning habits, decision-making, receiving to play forward",
        researchBasis: "Perceptual-cognitive development (Williams & Ward, 2003); scanning research (Jordet, 2013)",

        principles: [
          "50% play-based, 50% structured (game-realistic)",
          "Scanning is explicitly developed and reinforced",
          "Every practice includes small-sided games",
          "Passing decisions are discussed, not just techniques",
        ],

        activities: [
          {
            name: "Scanning Rondo (4v1 + Target)",
            description: "4v1 keep away, but there's a target player outside the square. Before playing to target, passer must call out their shirt color or name. Target plays back in.",
            time: "12-15 min",
            focus: "Scanning for forward option, playing forward when possible",
            externalCue: "Check the target before the ball arrives",
            progression: "Add second target; must pick correct one based on visual cue",
          },
          {
            name: "Directional Passing Game",
            description: "5v5 with directional goals (can only attack one way). Team scores by passing to teammate in end zone. Encourages forward passing and movement.",
            time: "20 min",
            focus: "Forward passing, combination play, movement off ball",
            externalCue: "Can you find the forward pass?",
            coachingNote: "Debrief: What made passes forward possible? Movement? Body shape?",
          },
          {
            name: "Switch Play Challenge",
            description: "4v4+2 (two neutral wide players). Team earns bonus point for switching play from one side to other. Full field width.",
            time: "15-20 min",
            focus: "Vision, changing point of attack, lofted passes",
            externalCue: "Can you see the other side when it's open?",
          },
          {
            name: "Receive to Play Forward",
            description: "3v3 in tight area. One end has 'forward goal' (passing to player in zone). Players practice receiving open, turning when possible.",
            time: "15 min",
            focus: "Body shape when receiving, turning under pressure",
            externalCue: "Can you receive facing forward?",
            debrief: "When could you turn? When did you need to go back?",
          },
        ],

        videoAnalysisIntro: {
          activity: "Watch 5-10 clips of professional midfielders receiving and distributing. For each, note: body position, head movement before receiving, choice of pass.",
          players: ["Pedri (body positioning)", "Kevin De Bruyne (vision and weight)", "Joshua Kimmich (scanning)", "Toni Kroos (composure and precision)"],
          frequency: "Every 2 weeks",
        },

        signsOfProgress: [
          "Scans before receiving as a habit",
          "Body position when receiving allows multiple options",
          "Plays forward when the option exists",
          "Can explain why they chose a particular pass",
          "Shows different passes for different situations",
        ],
      },

      {
        name: "Stage 4: Mastery and Game Intelligence",
        ages: "13+ years",
        focus: "Refined technique, advanced decisions, pressure performance",
        researchBasis: "Expertise development (Ericsson); pressure training (Beilock)",

        principles: [
          "Training intensity matches or exceeds game demands",
          "Technical refinement in context, not isolation",
          "Mental skills integrated into passing practice",
          "Individual style development within team principles",
        ],

        activities: [
          {
            name: "High-Tempo Possession",
            description: "7v7 or larger with possession targets (e.g., 10 passes = 1 point, or pass to each player = 1 point). Time limit creates urgency.",
            time: "20-25 min",
            focus: "Quick decisions, one-touch play, scanning under time pressure",
            format: "Multiple rounds, track scores to increase stakes",
          },
          {
            name: "Playing Out Under Press",
            description: "6v6 with one team pressing high. Team in possession builds from back and scores in mini-goals at halfway line.",
            time: "20 min",
            focus: "Composure, passing under pressure, finding free player",
            coachRole: "Freeze and discuss decision points",
          },
          {
            name: "Position-Specific Passing",
            description: "Based on player's position, focus on relevant passing scenarios: center backs' distribution, midfielder's forward passes, wingers' switches.",
            time: "15 min",
            focus: "Role-specific decision-making",
            individualization: "Different stations based on position",
          },
          {
            name: "Combination Play Finishing",
            description: "Groups of 3-4 work on specific combinations (overlaps, 1-2s, third-man runs) progressing to shot. Competition for goals scored.",
            time: "20 min",
            focus: "Passing rhythm, timing, finishing under game-like pressure",
            variation: "Add passive then active defenders",
          },
        ],

        mentalSkillsIntegration: [
          {
            skill: "Pre-reception routine",
            application: "Consistent scan pattern before every touch: check shoulder, assess, receive",
          },
          {
            skill: "Composure cues",
            application: "Self-talk under pressure: 'I have time,' 'Find the simple ball,' 'Trust it'",
          },
          {
            skill: "Post-mistake routine",
            application: "Quick reset after turnover—next action focus, not dwelling on error",
          },
        ],
      },
    ],
  },

  // Part 5: For Parents
  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: "Supporting Development Without Coaching",

    introduction: "Your reactions, questions, and the environment you create at home all shape your child's development as a passer—and as a player who enjoys the game.",

    sections: [
      {
        title: "The Research on Parent Influence",
        content: `Studies consistently show that parent behavior significantly impacts both skill development and enjoyment. Key findings:

Children whose parents emphasize effort and learning (rather than outcomes) develop better, persist longer, and enjoy the game more.

Sideline coaching from parents increases anxiety and often contradicts the coach's instructions.

The most supportive parents are calm, positive, and let the game belong to the child.`,

        keyResearch: {
          citation: "Knight, C.J., Berrow, S.R., & Harwood, C.G. (2017). Parenting in sport. Current Opinion in Psychology, 16, 93-97.",
          finding: "Positive parental involvement characterized by support, appropriate expectations, and child-focused (rather than outcome-focused) behavior is associated with continued participation and healthy development.",
        },
      },

      {
        title: "What to Do",
        items: [
          {
            action: "Create opportunities for play",
            why: "Unstructured play—especially small-sided games with friends—is where passing skills develop naturally",
            how: "Organize informal games, take them to the park, have balls available at home",
          },
          {
            action: "Play with them",
            why: "Passing requires a partner! Playing together builds skill and relationship",
            how: "Simple passing in the backyard, wall work together, watching games and discussing",
          },
          {
            action: "Ask questions instead of instructing",
            why: "Self-reflection builds deeper understanding than being told what to do",
            how: "'What did you notice when you had time?' not 'You should have looked up'",
          },
          {
            action: "Praise the process",
            why: "Praising effort, decision-making, and improvement builds growth mindset",
            how: "'I noticed you were looking up more today' rather than 'Nice assist'",
          },
          {
            action: "Be a calm presence",
            why: "Your emotional state transfers to them; calm parents = calmer players",
            how: "Watch with interest, not anxiety. Clap for effort, not just successful passes",
          },
        ],
      },

      {
        title: "What to Avoid",
        items: [
          {
            behavior: "Coaching from the sideline",
            why: "Creates confusion, undermines the coach, increases anxiety",
            alternative: "Save observations for calm conversations later",
          },
          {
            behavior: "Commenting on every pass",
            why: "Heightens self-consciousness, reduces enjoyment",
            alternative: "Let them play. They know when passes work or don't",
          },
          {
            behavior: "Comparing to teammates",
            why: "Creates unhealthy comparison, reduces intrinsic motivation",
            alternative: "Focus only on their own development",
          },
          {
            behavior: "Overemphasizing possession stats",
            why: "Safe passing isn't always good passing; risk-taking is important",
            alternative: "Value forward passes that don't work as learning opportunities",
          },
          {
            behavior: "Car ride debriefs",
            why: "The drive home becomes associated with evaluation anxiety",
            alternative: "'Did you have fun?' Let them bring up the game if they want",
          },
        ],
      },

      {
        title: "Home Activities by Age",
        note: "These should feel like play, not training sessions",
        activities: {
          ages4to6: [
            "Roll ball back and forth on the floor together",
            "Kick toward a wall and collect the rebound",
            "Set up 'goals' with household items; pass through them",
            "Simply play with them—kicking around in any open space",
          ],
          ages7to9: [
            "Wall passing: see how many in a row without losing control",
            "1v1 games where scoring requires passing through a target",
            "Watch games together, discuss what players do",
            "Informal games with friends, siblings, neighbors",
          ],
          ages10to12: [
            "More advanced wall work: one-touch, alternating feet",
            "Play 2v2 or 3v3 with friends/family",
            "Watch specific players known for passing; discuss what makes them good",
            "Support their own practice goals",
          ],
        },
      },

      {
        title: "Conversation Starters",
        alternatives: [
          {
            instead: "Why did you pass it backwards?",
            try: "What were your options on that play?",
          },
          {
            instead: "You should have passed to Jake",
            try: "What did you see when you got the ball there?",
          },
          {
            instead: "Your passing was good/bad today",
            try: "What did you work on today? What was fun?",
          },
          {
            instead: "Did you get any assists?",
            try: "Did you try anything new today?",
          },
          {
            instead: "You need to look up more",
            try: "What's something you want to work on next time?",
          },
        ],
      },
    ],
  },

  // Interludes: Player Stories
  playerStories: [
    {
      title: "The Boy Who Saw Everything",
      subtitle: "Xavi Hernández and the Art of Vision",
      placement: "after-science", // After Part 1
      content: `In the youth academy of FC Barcelona, there was a boy who didn't run faster than anyone else. He wasn't particularly tall or strong. But the coaches noticed something unusual: he always seemed to know what was going to happen next.

His name was Xavi Hernández, and by the time he retired, many considered him the greatest passer in the history of football.

"I'm always looking, always moving my head," Xavi explained in an interview. "Before I get the ball, I've already checked my shoulder four, five, six times. I know where everyone is."

Watch any video of Xavi playing, and you'll see it: the constant scanning, the head moving like a periscope, gathering information. By the time the ball arrived at his feet, he had already made his decision.

What made Xavi special wasn't natural talent—it was a habit developed over thousands of hours at La Masia, Barcelona's academy. The coaches there didn't just teach technique. They taught players to think, to see, to understand the game.

"The first thing I look for is the diagonal pass forward," Xavi said. "If it's there, I play it. If not, I look for the switch. If not, I go back. But I see it all before the ball comes."

For young players, Xavi's story isn't about being born with special vision. It's about developing a habit of scanning, of always knowing your options, of preparing to play before the ball arrives.

The next time your child watches a professional game, have them watch a midfielder's head instead of the ball. They'll see the secret that Xavi mastered—the game is won in the moments before the pass, not during it.`,
      image: null,
      quote: {
        text: "Think quickly, look for spaces. That's what I do: look for spaces. All day. I'm always looking.",
        attribution: "Xavi Hernández",
      },
    },
    {
      title: "The Calm in the Storm",
      subtitle: "Andrea Pirlo and the Power of Composure",
      placement: "after-mental", // After Part 2
      content: `In the 2006 World Cup Final, with the weight of Italy on his shoulders, Andrea Pirlo did something remarkable: he played as if he were in his backyard.

While others rushed and panicked under the pressure of the biggest game in football, Pirlo glided across the pitch, stroking passes with perfect weight, always finding the right option. Italy won, and Pirlo was named the tournament's best player.

"I don't feel pressure," Pirlo once said, in his characteristically understated way. "People who feel pressure don't know how to play football."

But this composure wasn't something Pirlo was born with. It was built through a specific kind of development.

As a young player at Brescia, Pirlo's coaches noticed his technical ability but also his tendency to overcomplicate things. They gave him a simple instruction that would shape his entire career: "See the simple pass. Play it."

Pirlo learned that composure comes from clarity. When you see the game clearly—when you've scanned, when you know your options—there's no reason to panic. The solution is already there.

"The best pass is the right pass," Pirlo explained. "Sometimes that's a 40-yard diagonal. Sometimes it's a five-yard square ball. The important thing is to know which is which."

For young players, Pirlo's lesson is powerful: composure isn't the absence of pressure, it's the presence of preparation. When you know what you're going to do before the ball arrives, the situation feels manageable. When you don't, everything feels rushed.

His famous quote captures it perfectly: "I'm not a fast player. But the ball, it's fast."`,
      image: null,
      quote: {
        text: "I don't have to run. The ball does the work.",
        attribution: "Andrea Pirlo",
      },
    },
    {
      title: "The Machine with a Heart",
      subtitle: "Toni Kroos and the Beauty of Consistency",
      placement: "after-tactical", // After Part 3
      content: `When Toni Kroos retired in 2024, he did so with one of the most remarkable records in football history: six Champions League titles, a World Cup, and passing accuracy statistics that seemed almost impossible.

Throughout his career, Kroos completed approximately 92% of his passes. In some games, he touched the ball over 150 times. In the 2014 World Cup semifinal, he touched it 142 times and misplaced only three passes.

But here's what made Kroos truly special: it was never just about safe passes.

"People say I just pass sideways," Kroos noted in response to critics. "But if you watch, you'll see I pass forward constantly—I just don't give the ball away doing it."

The secret was in his preparation. Former teammates described how Kroos would walk through the stadium before games, visualizing the spaces he would find, the passes he would make. In training, he was obsessive about body position, always receiving in a way that allowed him to play forward.

His coach at Bayern Munich, Pep Guardiola, called him "the most reliable player I've ever worked with. You know exactly what you'll get, every single game. He sees the game three moves ahead."

For young players, Kroos represents the power of mastering the fundamentals. He didn't have the flair of some players or the pace of others. What he had was an extraordinary command of the basics—body position, weight of pass, awareness—executed with absolute consistency.

His career proved that you don't need to be flashy to be world-class. Sometimes the most beautiful thing in football is a perfectly-weighted pass that finds its target, again and again and again.`,
      image: null,
      quote: {
        text: "I try to play simple. The most simple is often the most effective.",
        attribution: "Toni Kroos",
      },
    },
  ],

  // Interludes: Coach Wisdom
  coachWisdom: [
    {
      title: "Building a Passing Culture",
      coach: "Pep Guardiola",
      role: "Former Barcelona, Bayern Munich, and Manchester City Manager",
      placement: "after-science", // Can appear alongside player story
      content: `When Pep Guardiola took over Barcelona in 2008, he inherited a squad full of talented players. His first message to them was simple and surprising: "We are going to pass the ball more than any team in history."

Not score more goals. Not win more trophies. Pass more.

Guardiola understood something profound about passing: it isn't just a way to move the ball, it's a way of controlling the game. When you have the ball, the opponent cannot score. When you pass it well, you dictate the rhythm, the space, the entire flow of the match.

"For me, the definition of a good team is one that can pass the ball in every situation," Guardiola explained. "Under pressure, in tight spaces, when tired—they still pass correctly."

His training sessions reflected this philosophy. Every exercise included passing under pressure. Players were constantly asked: "Why did you pass there? What did you see?"

But Guardiola's genius wasn't just tactical—it was psychological. He made players believe that passing well was the highest form of football intelligence. It wasn't something for players who couldn't dribble or shoot. It was the art form that made everything else possible.

For youth coaches, Guardiola's approach offers a powerful framework: create an environment where passing is celebrated, where ball retention is valued, where players understand that the best teams are the ones who keep the ball.`,
      quote: {
        text: "In the end, the ball is the most important thing. The team that controls the ball controls the game.",
        attribution: "Pep Guardiola",
      },
      keyPrinciple: "Passing isn't a limitation—it's a superpower.",
    },
    {
      title: "Seeing the Game Through Passing",
      coach: "Johan Cruyff",
      role: "Barcelona Legend, Revolutionary Coach",
      placement: "before-progression", // Before Part 4
      content: `Johan Cruyff changed football twice—first as a player, then as a coach. His philosophy at Barcelona's La Masia academy created a generation of passers: Xavi, Iniesta, Messi, and countless others.

Cruyff's insight was radical for its time: technique without understanding is worthless.

"What is skill?" Cruyff once asked rhetorically. "Skill is passing at the right time, at the right speed, to the right foot. It is not juggling or doing tricks."

At La Masia, young players didn't practice passing in lines. They played games—rondos, positional games, small-sided matches—where passing was necessary to solve problems. The technique developed in service of the game, not separate from it.

Cruyff was famous for his "rondo"—the keep-away circle that has since become standard at clubs worldwide. But his innovation wasn't the exercise itself; it was what he demanded of players during it.

"One touch is faster than two," Cruyff taught. "But only play one touch if you've already looked. Otherwise, two touches is not slow—it's smart."

He taught players to make decisions before the ball arrived: if you know what you're going to do, one touch is possible. If you don't, take two and stay in control.

For coaches at any level, Cruyff's message is clear: don't teach passing in isolation. Create games where good passing is the solution to a problem. Let the players discover why passing matters, not just how to do it.`,
      quote: {
        text: "Playing football is very simple, but playing simple football is the hardest thing there is.",
        attribution: "Johan Cruyff",
      },
      keyPrinciple: "Technique serves understanding, not the other way around.",
    },
    {
      title: "The Patience to Develop Passers",
      coach: "Arsène Wenger",
      role: "Former Arsenal Manager, Pioneer of Youth Development",
      placement: "in-progression", // During Part 4
      content: `When Arsène Wenger arrived at Arsenal in 1996, English football was known for physicality, not passing. Wenger changed that—not just at Arsenal, but across the country.

His approach was built on patience and belief.

"A player who can pass," Wenger said, "is a player who can think. And thinking can be developed."

Wenger famously took players others had given up on—players told they were too small, too slow, too weak—and developed them into world-class passers. Cesc Fàbregas arrived at Arsenal as a 16-year-old and became one of the league's best passers within two years.

The secret? Wenger's training emphasized decision-making over repetition. "I never wanted players to pass for the sake of passing," he explained. "I wanted them to understand why a pass was right or wrong. The execution follows the understanding."

His teams became known for their flowing, passing football—a style that seemed almost too beautiful for the rough Premier League. But it worked because Wenger understood something essential: technique without intelligence is just tricks, but intelligence with good enough technique can dominate games.

For parents watching their children develop, Wenger's career is a reminder that the best passers are often made, not born. The small player who can't outrun defenders might become the one who doesn't need to—because they always know where the ball should go.`,
      quote: {
        text: "A football team is like an orchestra. Every player must know when to play and when to let others play.",
        attribution: "Arsène Wenger",
      },
      keyPrinciple: "Intelligence can be developed. Patience makes it possible.",
    },
  ],

  // Resources
  resources: {
    title: "Resources and References",

    booksForParents: [
      {
        title: "Mindset: The New Psychology of Success",
        author: "Carol Dweck",
        relevance: "Understanding how to develop growth mindset in young athletes",
      },
      {
        title: "Changing the Game",
        author: "John O'Sullivan",
        relevance: "Creating positive youth sports experiences",
      },
      {
        title: "The Talent Code",
        author: "Daniel Coyle",
        relevance: "How deep practice develops skill",
      },
      {
        title: "InSideOut Coaching",
        author: "Joe Ehrmann",
        relevance: "Purpose-driven coaching and parenting in sport",
      },
    ],

    booksForCoaches: [
      {
        title: "The Constraints-Led Approach",
        author: "Ian Renshaw et al.",
        relevance: "The science of skill acquisition through game-based learning",
      },
      {
        title: "Practice Design in Football",
        author: "Matt Crocker & FA Learning",
        relevance: "Applying motor learning research to football training",
      },
      {
        title: "Creating a Positive Youth Sports Environment",
        author: "Positive Coaching Alliance",
        relevance: "Practical strategies for development-focused coaching",
      },
    ],

    videosAndChannels: [
      {
        name: "Tifo Football",
        platform: "YouTube",
        type: "Tactical analysis, including passing patterns",
      },
      {
        name: "The Coaches' Voice",
        platform: "YouTube/Website",
        type: "Elite coaches explaining their methods",
      },
    ],

    academicReferences: [
      "Ford, P.R., Yates, I., & Williams, A.M. (2010). An analysis of practice activities and instructional behaviours used by youth soccer coaches. Journal of Sports Sciences, 28(5), 483-495.",
      "Jordet, G., Bloomfield, J., & Heijmerikx, J. (2013). The hidden foundation of field vision in English Premier League soccer players. MIT Sloan Sports Analytics Conference.",
      "McGuckian, T.B., Cole, M.H., & Pepping, G.J. (2018). A systematic review of the technology-based assessment of visual perception and exploration behaviour in association football. Journal of Sports Sciences, 36(8), 861-880.",
      "Roca, A., Ford, P.R., McRobert, A.P., & Williams, A.M. (2011). Identifying the processes underpinning anticipation and decision-making in a dynamic time-constrained task. Cognitive Processing, 12(3), 301-310.",
      "Williams, A.M., & Davids, K. (1998). Visual search strategy, selective attention, and expertise in soccer. Research Quarterly for Exercise and Sport, 69(2), 111-128.",
      "Wulf, G. (2013). Attentional focus and motor learning: A review of 15 years. International Review of Sport and Exercise Psychology, 6(1), 77-104.",
      "Shea, J.B., & Morgan, R.L. (1979). Contextual interference effects on the acquisition, retention, and transfer of a motor skill. Journal of Experimental Psychology: Human Learning and Memory, 5(2), 179-187.",
      "Dweck, C.S. (2006). Mindset: The New Psychology of Success. Random House.",
      "Beilock, S.L., & Carr, T.H. (2001). On the fragility of skilled performance. Journal of Experimental Psychology: General, 130(4), 701-725.",
      "Knight, C.J., Berrow, S.R., & Harwood, C.G. (2017). Parenting in sport. Current Opinion in Psychology, 16, 93-97.",
    ],
  },
};

export default passingMiniBook;

/**
 * Coaching Philosophy Data
 *
 * Research-based coaching principles shared across all sport guides.
 * Based on European and American best practices including:
 * - Double-Goal Coach (PCA)
 * - ELM Framework (Effort, Learning, Mistakes)
 * - TDEQ-5 Youth Development Model
 * - US Soccer Player Development Initiative
 */

export const coachingPhilosophy = {
  coreBeliefs: [
    {
      title: "Development Over Winning",
      description: "At youth levels, the scoreboard is the least important measure of success. We measure success by effort, improvement, and enjoyment.",
      quote: "Winning takes care of itself when athletes develop properly.",
    },
    {
      title: "Every Child Can Improve",
      description: "There is no such thing as a 'non-athletic' child. With the right environment, encouragement, and practice, every young athlete can develop their abilities.",
      quote: "Talent is developed, not discovered.",
    },
    {
      title: "Long-Term Athlete Development",
      description: "Skills developed properly in childhood create a foundation for lifelong athletic enjoyment. We never sacrifice long-term development for short-term results.",
      quote: "We're building athletes for age 25, not just age 8.",
    },
    {
      title: "Holistic Growth",
      description: "Sports develop the whole child: technical skills, tactical understanding, physical literacy, and psychological resilience. We nurture all four domains.",
      quote: "Great athletes are made, not born—and they're made through more than just physical practice.",
    },
  ],

  doubleGoalCoach: {
    title: "The Double-Goal Coach",
    subtitle: "Winning AND Developing Young Athletes",
    description: `The Double-Goal Coach has two objectives: striving to win while developing the character and competence of every player. When these goals conflict, character development comes first.

This doesn't mean winning doesn't matter—competition is valuable and striving to win teaches important lessons. But the ultimate goal is helping young athletes become their best selves, not just their best players.`,
    principles: [
      {
        name: "Redefine 'Winner'",
        description: "A winner is someone who gives maximum effort, continues to learn and improve, and doesn't let mistakes or fear of mistakes stop them. The scoreboard is not the definition of success.",
      },
      {
        name: "Fill the Emotional Tank",
        description: "Athletes perform best when their 'emotional tank' is full. Use encouragement, recognition of effort, and specific praise to fill tanks. Criticism empties tanks quickly.",
      },
      {
        name: "Honor the Game",
        description: "Respect the rules, opponents, officials, teammates, and the game itself. Model and teach that integrity matters more than any result.",
      },
    ],
  },

  elmFramework: {
    title: "The ELM Framework",
    subtitle: "Effort, Learning, Mistakes",
    description: `ELM is a powerful feedback approach that focuses on what athletes can control, rather than outcomes they cannot. When giving feedback, emphasize:`,
    components: [
      {
        letter: "E",
        name: "Effort",
        description: "Praise and recognize effort. 'I love how hard you're working!' is more valuable than 'Great goal!' because effort is something athletes control. Effort-based praise builds resilience.",
        examples: [
          "I noticed you sprinted back on defense even when you were tired.",
          "You didn't give up when that pass didn't connect. That's exactly the effort we want!",
          "Your hustle on that play shows real commitment.",
        ],
      },
      {
        letter: "L",
        name: "Learning",
        description: "Frame everything as an opportunity to learn. When things go wrong, ask 'What can we learn from this?' rather than assigning blame. Learning happens through experience.",
        examples: [
          "What did you notice about that play? What might you try differently?",
          "Every practice is a chance to learn something new.",
          "That didn't work out, but now you know! What will you try next time?",
        ],
      },
      {
        letter: "M",
        name: "Mistakes",
        description: "Normalize mistakes as part of learning. Athletes who fear mistakes play tentatively. Athletes who embrace mistakes as learning opportunities play freely and develop faster.",
        examples: [
          "Mistakes are just proof that you're trying new things.",
          "Every great player has made that same mistake hundreds of times.",
          "I'd rather see you try something new and make a mistake than play it safe.",
        ],
      },
    ],
    magicRatio: {
      ratio: "5:1",
      description: "Research shows that high-performing teams have at least 5 positive interactions for every 1 corrective interaction. Before criticizing, make sure you've filled the emotional tank with encouragement.",
    },
  },

  ageGuidelines: {
    title: "Age-Appropriate Expectations",
    stages: [
      {
        name: "Discovery",
        ages: "4-6 years",
        focus: "Fun, movement, basic motor skills",
        principles: [
          "Play is the primary teaching method",
          "Every child touches the ball constantly",
          "No positions or complex tactics",
          "Celebrate participation over performance",
          "Keep activities to 30-45 minutes maximum",
        ],
        avoid: [
          "Score-keeping or standings",
          "Criticism of any kind",
          "Sitting players out",
          "Complex instructions",
          "Comparison between children",
        ],
        coachRole: "Enthusiastic play leader who makes everything fun and celebrates every attempt.",
      },
      {
        name: "Fundamentals",
        ages: "7-9 years",
        focus: "Basic techniques, love of the sport",
        principles: [
          "Focus on fundamental skills, not strategy",
          "Let children play and figure things out",
          "Praise effort and improvement",
          "Rotate all positions in games",
          "Keep practice to 60 minutes maximum",
        ],
        avoid: [
          "Specializing in one position",
          "Result-focused coaching",
          "Criticizing mistakes publicly",
          "Over-coaching during games",
          "Complex offensive/defensive systems",
        ],
        coachRole: "Patient teacher who breaks skills into small steps and celebrates progress.",
      },
      {
        name: "Skill Building",
        ages: "10-12 years",
        focus: "Skill refinement, introduction to tactics",
        principles: [
          "Begin position-specific development",
          "Introduce basic tactical concepts",
          "Use guided discovery (questions, not answers)",
          "Encourage trying new skills in games",
          "Practice can extend to 75 minutes",
        ],
        avoid: [
          "Yelling instructions during play",
          "Playing only 'best' players",
          "Winning at expense of development",
          "Comparison with other children",
          "Pressure to specialize in one sport",
        ],
        coachRole: "Mentor who asks questions, guides discovery, and builds confidence alongside skills.",
      },
      {
        name: "Development",
        ages: "13-15 years",
        focus: "Advanced skills, tactical understanding",
        principles: [
          "More sophisticated tactical work",
          "Position-specific training appropriate",
          "Athletes begin self-assessment",
          "Increased training intensity",
          "More competitive environment acceptable",
        ],
        avoid: [
          "Early talent identification/labeling",
          "Overtraining (more hours than age)",
          "Ignoring burnout signs",
          "Eliminating fun from training",
          "Single-sport specialization pressure",
        ],
        coachRole: "Coach and mentor who balances technical development with psychological support.",
      },
    ],
  },

  sessionStructure: {
    title: "Structuring Effective Practice Sessions",
    principles: [
      "70% of practice time should be active (playing, not waiting)",
      "Every player should have a ball or be in small groups",
      "Use games and activities, not drills in lines",
      "Questions develop thinking; commands develop robots",
      "Always end on a positive note",
    ],
    template: {
      warmup: {
        duration: "10-15 min",
        purpose: "Get bodies moving, minds engaged",
        tips: [
          "Include ball/equipment from the start",
          "Make it fun and game-based",
          "Dynamic stretching, not static",
          "Set the positive tone for practice",
        ],
      },
      technical: {
        duration: "15-20 min",
        purpose: "Skill development in fun activities",
        tips: [
          "Focus on 1-2 skills maximum",
          "Use activities, not drills",
          "High repetition, high success rate",
          "Coach during water breaks, not during play",
        ],
      },
      gamePlay: {
        duration: "20-30 min",
        purpose: "Apply skills in game-like situations",
        tips: [
          "Small-sided games (3v3, 4v4) maximize touches",
          "Let them play! Resist over-coaching",
          "Use 'freeze' moments sparingly for teaching",
          "Celebrate when you see the session's skill used",
        ],
      },
      cooldown: {
        duration: "5-10 min",
        purpose: "Recovery and positive reinforcement",
        tips: [
          "Bring energy down gradually",
          "Ask players what they learned",
          "Highlight efforts and improvements",
          "Build excitement for next practice",
        ],
      },
    },
  },

  parentCommunication: {
    title: "Communicating with Parents",
    principles: [
      "Set expectations early in the season",
      "Focus on development, not standings",
      "Share what you're working on, not who's 'best'",
      "Provide specific things to practice at home",
      "Welcome questions and concerns",
    ],
    templates: {
      seasonStart: `Dear Families,

Welcome to our [SPORT] season! I'm excited to work with your children over the coming weeks.

My coaching philosophy centers on development, effort, and fun. While we'll always compete hard, my primary goal is helping every child improve their skills, build confidence, and fall in love with the game.

You can support your child by:
- Praising their effort, not just outcomes
- Asking "Did you have fun?" after games
- Avoiding coaching from the sidelines
- Celebrating improvement over results
- Ensuring they come ready to learn and play

I'll send regular updates about what we're working on. Please reach out anytime with questions.

Let's have a great season!`,

      weeklyUpdate: `This Week in Practice:

We focused on [SKILL] this week. Players worked on [SPECIFIC ASPECT].

What you can do at home:
- [ACTIVITY 1]
- [ACTIVITY 2]

Remember: keep it fun and brief (10-15 min)!

Highlight: [POSITIVE TEAM/EFFORT OBSERVATION]

See everyone at practice!`,

      positiveProgress: `Quick update on [CHILD]:

I wanted to share that [CHILD] has shown real improvement in [SKILL AREA]. I've noticed:
- [SPECIFIC OBSERVATION 1]
- [SPECIFIC OBSERVATION 2]

This comes from their consistent effort and willingness to try new things. Keep encouraging that growth mindset at home!`,

      concernAddressing: `Hi [PARENT],

Thanks for reaching out about [CONCERN]. I appreciate you sharing this with me.

Here's what I've observed: [OBSERVATION]

Here's our plan: [APPROACH]

Let's stay in touch about [CHILD]'s progress. Please don't hesitate to reach out again.`,
    },
  },

  redFlagsAndSupport: {
    title: "Recognizing When Athletes Need Support",
    signs: [
      {
        category: "Physical",
        indicators: [
          "Persistent fatigue or injury",
          "Coordination concerns beyond normal development",
          "Avoiding physical activity they previously enjoyed",
        ],
        response: "Consult with parents, suggest medical evaluation if persistent.",
      },
      {
        category: "Emotional",
        indicators: [
          "Excessive anxiety before or during practice/games",
          "Withdrawal from teammates",
          "Crying frequently or extreme frustration",
          "Loss of enjoyment they previously had",
        ],
        response: "Private conversation, reduce pressure, inform parents, consider referral.",
      },
      {
        category: "Social",
        indicators: [
          "Bullying or being bullied",
          "Isolation from team",
          "Conflict with teammates that doesn't resolve",
        ],
        response: "Address directly, involve parents, create team-building opportunities.",
      },
      {
        category: "Developmental",
        indicators: [
          "Significant lag in skill development despite effort",
          "Difficulty understanding instructions",
          "Attention challenges beyond normal range",
        ],
        response: "Adapt coaching approach, discuss with parents, consider learning differences.",
      },
    ],
    generalPrinciple: "When in doubt, communicate with parents. They know their child best, and partnership between coach and parent serves the child well.",
  },
};

export const sportSpecificNotes = {
  soccer: {
    name: "Soccer",
    icon: "⚽",
    primaryColor: "#16a34a",
    uniqueConsiderations: [
      "Encourage both-feet development from earliest ages",
      "Small-sided games maximize ball touches",
      "Don't assign goalkeepers until age 10+",
      "Let players solve problems; don't yell positions",
    ],
    keyPhilosophy: "Let them play. The best coaches create the environment and then step back.",
  },
  basketball: {
    name: "Basketball",
    icon: "🏀",
    primaryColor: "#ea580c",
    uniqueConsiderations: [
      "Ball handling with both hands from day one",
      "Lower baskets for younger players (8-foot for U8)",
      "Smaller balls appropriate for hand size",
      "Motion and cutting over set plays",
    ],
    keyPhilosophy: "Skills over schemes. A player who can dribble, pass, and shoot will figure out the game.",
  },
  hockey: {
    name: "Hockey",
    icon: "🏒",
    primaryColor: "#2563eb",
    uniqueConsiderations: [
      "Skating fundamentals are everything",
      "Equipment comfort affects performance",
      "Ice time is precious—maximize activity",
      "Cross-ice games for more touches",
    ],
    keyPhilosophy: "Skating is the foundation. Everything else is built on blade confidence.",
  },
  baseball: {
    name: "Baseball",
    icon: "⚾",
    primaryColor: "#dc2626",
    uniqueConsiderations: [
      "Arm care is paramount (pitch counts, rest)",
      "All players should experience all positions",
      "Batting practice should be frequent and fun",
      "Fear of the ball is normal—address patiently",
    ],
    keyPhilosophy: "Protect young arms, develop all-around players, and make batting practice the highlight of practice.",
  },
};

export type SportKey = keyof typeof sportSpecificNotes;

/**
 * Program Structures
 * Templates for different types of youth sports programs
 */
export const programStructures = {
  league: {
    title: "Recreational League Season",
    subtitle: "8-10 Week Seasonal Format",
    icon: "🏆",
    description: "A typical recreational league balances weekly practices with weekend games, emphasizing development and fun over winning.",

    byAge: {
      discovery: {
        name: "Discovery League",
        ages: "4-6 years",
        format: {
          duration: "6-8 weeks",
          practicesPerWeek: 1,
          practiceDuration: "45 min",
          gamesPerWeek: 1,
          gameDuration: "4x8 min quarters with breaks",
          playersOnField: "3v3 or 4v4",
          fieldSize: "25x20 yards (scaled)",
        },
        keyPrinciples: [
          "No score-keeping or standings",
          "Everyone plays equal time",
          "No goalkeeper position",
          "Focus on ball contact and fun",
          "Parents on field if needed",
        ],
        seasonFlow: [
          { week: "1-2", focus: "Getting comfortable with ball/equipment, making friends" },
          { week: "3-4", focus: "Basic movement with ball, simple games" },
          { week: "5-6", focus: "Introduction to team play, mini-games" },
          { week: "7-8", focus: "Celebration games, showing what we learned" },
        ],
      },
      fundamentals: {
        name: "Fundamentals League",
        ages: "7-9 years",
        format: {
          duration: "8-10 weeks",
          practicesPerWeek: 1,
          practiceDuration: "60 min",
          gamesPerWeek: 1,
          gameDuration: "2x20 min halves",
          playersOnField: "5v5 or 6v6",
          fieldSize: "40x30 yards",
        },
        keyPrinciples: [
          "Standings de-emphasized, development celebrated",
          "All players rotate all positions",
          "50% playing time minimum for all",
          "No all-star selections or MVP awards",
          "Post-game focus on effort, not score",
        ],
        seasonFlow: [
          { week: "1-2", focus: "Team building, fundamental skills introduction" },
          { week: "3-4", focus: "Core technique development, first games" },
          { week: "5-6", focus: "Building on fundamentals, position rotation" },
          { week: "7-8", focus: "Applying skills in games, team cohesion" },
          { week: "9-10", focus: "Celebration of growth, season wrap-up" },
        ],
      },
      development: {
        name: "Development League",
        ages: "10-12 years",
        format: {
          duration: "10-12 weeks",
          practicesPerWeek: 2,
          practiceDuration: "75 min",
          gamesPerWeek: 1,
          gameDuration: "2x25 min halves",
          playersOnField: "7v7 or 9v9",
          fieldSize: "60x40 yards",
        },
        keyPrinciples: [
          "Standings exist but are secondary to development",
          "All players get meaningful playing time",
          "Position exploration continues",
          "Individual skill goals alongside team goals",
          "Post-game reflection discussions",
        ],
        seasonFlow: [
          { week: "1-2", focus: "Skill assessment, team building, goal setting" },
          { week: "3-4", focus: "Technical fundamentals, introduction to tactics" },
          { week: "5-6", focus: "Position-specific work, small-sided games" },
          { week: "7-8", focus: "Tactical concepts, game application" },
          { week: "9-10", focus: "Refinement, individual improvement focus" },
          { week: "11-12", focus: "Season celebration, individual recognition" },
        ],
      },
    },

    coachChecklist: [
      "Confirm practice and game schedule with all families",
      "Prepare equipment list and verify availability",
      "Create contact list for team communication",
      "Set up team meeting to discuss philosophy and expectations",
      "Plan first 3 practices in advance",
      "Establish playing time rotation system",
      "Create simple way to track individual skill progress",
      "Plan end-of-season celebration",
    ],
  },

  developmentClass: {
    title: "Skills Development Class",
    subtitle: "4-6 Week Focused Sessions",
    icon: "📚",
    description: "Intensive skill-building sessions designed for players who want extra development outside of league play. Focus on specific skill areas.",

    byAge: {
      discovery: {
        name: "Little Movers",
        ages: "4-6 years",
        format: {
          duration: "4-5 weeks",
          sessionsPerWeek: 1,
          sessionDuration: "45 min",
          classSize: "8-10 max",
          coachRatio: "1:4",
        },
        skillFocus: [
          "Fundamental movement patterns (running, jumping, balancing)",
          "Basic ball/equipment familiarity",
          "Following simple instructions through games",
          "Social skills and teamwork basics",
        ],
        sampleSession: {
          warmup: "10 min: Movement games, animal walks, fun activities",
          activity1: "10 min: Ball exploration with guided discovery",
          activity2: "10 min: Simple skill games (stop/start, find space)",
          gamePlay: "10 min: Fun mini-game with no score",
          cooldown: "5 min: Celebration circle, stickers/high-fives",
        },
      },
      fundamentals: {
        name: "Skill Builders",
        ages: "7-9 years",
        format: {
          duration: "5-6 weeks",
          sessionsPerWeek: 1,
          sessionDuration: "60 min",
          classSize: "10-12 max",
          coachRatio: "1:5",
        },
        skillFocus: [
          "Sport-specific fundamental techniques",
          "Both-side development (both feet, both hands)",
          "Introduction to decision-making",
          "Building confidence through repetition",
        ],
        sampleSession: {
          warmup: "10 min: Dynamic warmup with ball, skill-based tag games",
          activity1: "15 min: Focused skill work (high repetition)",
          activity2: "15 min: Skill application in small games",
          gamePlay: "15 min: Modified games emphasizing week's skill",
          cooldown: "5 min: Review, Q&A, at-home challenge",
        },
      },
      development: {
        name: "Performance Academy",
        ages: "10-12 years",
        format: {
          duration: "6 weeks",
          sessionsPerWeek: "1-2",
          sessionDuration: "75 min",
          classSize: "12-14 max",
          coachRatio: "1:6",
        },
        skillFocus: [
          "Advanced technique refinement",
          "Position-specific skills",
          "Tactical decision-making",
          "Self-assessment and goal-setting",
        ],
        sampleSession: {
          warmup: "12 min: Dynamic warmup, juggling/ball mastery",
          activity1: "20 min: Technical focus with progressions",
          activity2: "18 min: Tactical situation training",
          gamePlay: "20 min: Conditioned games applying concepts",
          cooldown: "5 min: Self-reflection, journaling, homework",
        },
      },
    },

    curriculumThemes: [
      { name: "Ball Mastery", weeks: 4, focus: "Control, touch, comfort on the ball" },
      { name: "Passing & Receiving", weeks: 5, focus: "Technique, timing, decision-making" },
      { name: "Attacking Skills", weeks: 5, focus: "Dribbling, shooting, creating space" },
      { name: "Defensive Fundamentals", weeks: 4, focus: "Positioning, tackling, teamwork" },
      { name: "Game Intelligence", weeks: 6, focus: "Reading play, decision-making" },
    ],
  },

  childcareProgram: {
    title: "Childcare Sports Program",
    subtitle: "8-Week After-School or Before-School Format",
    icon: "🏫",
    description: "Sports programming integrated into childcare settings. Designed for mixed age groups with limited equipment and space.",

    format: {
      duration: "8 weeks",
      sessionsPerWeek: "2-3",
      sessionDuration: "30-45 min",
      groupSize: "Mixed ages, 10-15 children",
      spaceNeeded: "Gym or outdoor space 30x30 yards minimum",
    },

    adaptations: [
      "Modifications for mixed age groups working together",
      "Activities that work with limited equipment",
      "Indoor alternatives for weather",
      "Inclusive activities for varying skill levels",
      "Quick setup/cleanup for facility constraints",
    ],

    eightWeekPlan: [
      {
        week: 1,
        theme: "Getting Started",
        focus: "Introductions, basic rules, fundamental movement",
        activities: ["Name games with ball", "Simple dribbling exploration", "Freeze tag variations"],
      },
      {
        week: 2,
        theme: "Ball Friends",
        focus: "Ball familiarity, control basics",
        activities: ["Ball to body parts", "Dribble and freeze", "Sharks and minnows"],
      },
      {
        week: 3,
        theme: "Moving Together",
        focus: "Spatial awareness, moving with purpose",
        activities: ["Traffic light game", "Follow the leader with ball", "Musical balls"],
      },
      {
        week: 4,
        theme: "Passing Partners",
        focus: "Basic passing, receiving",
        activities: ["Partner passing challenges", "Pass and move", "Keep away intro"],
      },
      {
        week: 5,
        theme: "Shooting Stars",
        focus: "Shooting/scoring basics",
        activities: ["Target practice games", "Mini-goal games", "Score celebration"],
      },
      {
        week: 6,
        theme: "Team Play",
        focus: "Simple teamwork concepts",
        activities: ["2v1 situations", "Small-sided games", "Cooperative challenges"],
      },
      {
        week: 7,
        theme: "Game Time",
        focus: "Putting it together",
        activities: ["Modified games", "Position exploration", "Mini-tournament"],
      },
      {
        week: 8,
        theme: "Celebration",
        focus: "Showcasing growth",
        activities: ["Skills showcase", "Fun games", "Awards and recognition"],
      },
    ],

    mixedAgeStrategies: [
      "Pair older children with younger as 'coaches' for some activities",
      "Use handicaps (non-dominant hand, hopping) to level playing field",
      "Create activities with different roles suited to different ages",
      "Small group rotations so similar ages work together sometimes",
      "Celebrate different types of success (effort, improvement, helping others)",
    ],
  },

  summerCamp: {
    title: "Summer Sports Camp",
    subtitle: "Full-Day or Half-Day Multi-Week Format",
    icon: "☀️",
    description: "Intensive summer programming that combines skill development, games, and character building in a fun camp environment.",

    formats: {
      halfDay: {
        name: "Half-Day Camp",
        duration: "3 hours",
        schedule: [
          { time: "9:00-9:15", activity: "Arrival, team meeting" },
          { time: "9:15-9:45", activity: "Dynamic warmup, skill games" },
          { time: "9:45-10:30", activity: "Technical session #1" },
          { time: "10:30-10:45", activity: "Water break, snack" },
          { time: "10:45-11:15", activity: "Technical session #2" },
          { time: "11:15-11:50", activity: "Scrimmages and games" },
          { time: "11:50-12:00", activity: "Cool down, recap, dismissal" },
        ],
      },
      fullDay: {
        name: "Full-Day Camp",
        duration: "6-7 hours",
        schedule: [
          { time: "9:00-9:15", activity: "Arrival, team meeting" },
          { time: "9:15-9:45", activity: "Dynamic warmup, movement games" },
          { time: "9:45-10:45", activity: "Technical session #1 (skill focus)" },
          { time: "10:45-11:00", activity: "Water break" },
          { time: "11:00-11:45", activity: "Small-sided games" },
          { time: "11:45-12:30", activity: "Lunch break" },
          { time: "12:30-1:15", activity: "Camp games, team building" },
          { time: "1:15-2:00", activity: "Technical session #2 (new skill)" },
          { time: "2:00-2:15", activity: "Water break, snack" },
          { time: "2:15-3:00", activity: "Position play, tactical games" },
          { time: "3:00-3:45", activity: "Tournament/World Cup games" },
          { time: "3:45-4:00", activity: "Awards, recap, dismissal" },
        ],
      },
    },

    weeklyThemes: [
      {
        week: "Week 1",
        theme: "Foundation Week",
        technical: "Ball mastery and control",
        characterTrait: "Effort",
        fridayEvent: "Skills Olympics",
      },
      {
        week: "Week 2",
        theme: "Creative Week",
        technical: "Dribbling and moves",
        characterTrait: "Creativity",
        fridayEvent: "Move-of-the-Week Contest",
      },
      {
        week: "Week 3",
        theme: "Connection Week",
        technical: "Passing and receiving",
        characterTrait: "Teamwork",
        fridayEvent: "Passing Relay Championship",
      },
      {
        week: "Week 4",
        theme: "Finishing Week",
        technical: "Shooting and scoring",
        characterTrait: "Confidence",
        fridayEvent: "Goal-Scoring Challenge",
      },
      {
        week: "Week 5",
        theme: "Defense Week",
        technical: "Defending principles",
        characterTrait: "Resilience",
        fridayEvent: "Defensive Wars Tournament",
      },
      {
        week: "Week 6",
        theme: "Championship Week",
        technical: "Complete player",
        characterTrait: "Sportsmanship",
        fridayEvent: "World Cup Tournament",
      },
    ],

    ageGroupScheduling: {
      littleKickers: {
        ages: "4-6",
        recommendedFormat: "Half-day only",
        groupSize: "8-10 per coach",
        notes: "Shorter attention spans require frequent activity changes (every 8-10 min)",
      },
      juniors: {
        ages: "7-9",
        recommendedFormat: "Half-day or full-day",
        groupSize: "10-12 per coach",
        notes: "Can handle longer sessions but still need variety and water breaks",
      },
      intermediates: {
        ages: "10-12",
        recommendedFormat: "Full-day recommended",
        groupSize: "12-14 per coach",
        notes: "Ready for more tactical work, competition, and position-specific training",
      },
    },

    essentialEquipment: [
      { item: "Balls (age-appropriate sizes)", quantity: "1 per player + extras" },
      { item: "Cones", quantity: "50+ (mixed colors)" },
      { item: "Pinnies/bibs", quantity: "2 per player" },
      { item: "Portable goals", quantity: "4-8 depending on field size" },
      { item: "First aid kit", quantity: "1 per field" },
      { item: "Water cooler", quantity: "1 per group" },
      { item: "Whistle", quantity: "1 per coach" },
      { item: "Clipboard/roster", quantity: "1 per group" },
    ],

    campCulture: [
      "Establish camp values on Day 1 and reference daily",
      "Create camp cheers and traditions",
      "Daily awards for character (not just skill)",
      "Mixed-age group activities to build community",
      "Friday celebrations to mark progress",
      "Parent showcase at end of camp",
    ],
  },
};

export type ProgramType = keyof typeof programStructures;

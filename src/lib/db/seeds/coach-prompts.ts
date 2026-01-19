import { getDb } from "../index";
import { coachPrompts, coachingPrinciples } from "../schema/coach-guidance";
import { sports } from "../schema/sports";
import { developmentStages } from "../schema/curriculum";
import { eq } from "drizzle-orm";

export async function seedCoachPrompts() {
  console.log("Seeding coach prompts...");

  // Get reference data
  const allSports = await getDb().select().from(sports);
  const stages = await getDb().select().from(developmentStages);

  const soccerId = allSports.find((s) => s.name === "Soccer")?.id;
  const basketballId = allSports.find((s) => s.name === "Basketball")?.id;

  const discoveryStage = stages.find((s) => s.slug === "discovery")?.id;
  const fundamentalsStage = stages.find((s) => s.slug === "fundamentals")?.id;
  const skillBuildingStage = stages.find((s) => s.slug === "skill-building")?.id;

  // Pre-practice prompts - Questions to get coaches thinking
  const prePracticePrompts = [
    // General - All sports
    {
      triggerContext: "pre_practice" as const,
      promptType: "question" as const,
      title: "Today's Focus",
      content: "What's the ONE skill you want every player to improve today? Keep it simple and measurable.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Session planning and focus",
      tags: ["planning", "focus", "goals"],
    },
    {
      triggerContext: "pre_practice" as const,
      promptType: "reminder" as const,
      title: "Equipment Check",
      content: "Do you have enough equipment for everyone? Players waiting = players disengaged.",
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Preparation",
      tags: ["equipment", "preparation"],
    },
    {
      triggerContext: "pre_practice" as const,
      promptType: "tip" as const,
      title: "European Coaching Insight",
      content: "In European academies, coaches arrive 30 minutes early to set up. When players arrive, practice begins immediately - no standing around.",
      priority: 7,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "Preparation",
      tags: ["european", "preparation", "efficiency"],
    },
    {
      triggerContext: "pre_practice" as const,
      promptType: "question" as const,
      title: "Individual Attention",
      content: "Which 2-3 players need extra attention today? What specific feedback will you give them?",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Individualization",
      tags: ["individual", "feedback", "planning"],
    },
    {
      triggerContext: "pre_practice" as const,
      promptType: "reminder" as const,
      title: "Positive Start",
      content: "Greet every player by name as they arrive. A simple 'Hey [Name], glad you're here!' sets the tone for the whole session.",
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Relationship building",
      tags: ["relationships", "positivity", "greeting"],
    },

    // Discovery stage specific
    {
      stageId: discoveryStage,
      triggerContext: "pre_practice" as const,
      promptType: "reminder" as const,
      title: "Fun First",
      content: "At this age, FUN is the #1 priority. If players aren't smiling and laughing, adjust your plan.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Age-appropriate coaching",
      tags: ["fun", "discovery", "engagement"],
    },
    {
      stageId: discoveryStage,
      triggerContext: "pre_practice" as const,
      promptType: "tip" as const,
      title: "Short Activities",
      content: "Young players have ~5-7 minute attention spans. Plan for frequent activity changes with minimal instruction time.",
      priority: 9,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "Age-appropriate coaching",
      tags: ["attention", "discovery", "activities"],
    },

    // Fundamentals stage specific
    {
      stageId: fundamentalsStage,
      triggerContext: "pre_practice" as const,
      promptType: "question" as const,
      title: "Skill Progression",
      content: "What skill from last practice are you building on today? Players learn through repetition with variation.",
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Progressive development",
      tags: ["progression", "fundamentals", "repetition"],
    },
  ];

  // During practice prompts
  const duringPracticePrompts = [
    {
      triggerContext: "during_practice" as const,
      promptType: "question" as const,
      title: "Ask, Don't Tell",
      content: "Instead of correcting, try asking: 'What happened there?' or 'What could you try differently?' Let players discover the answer.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Guided discovery",
      tags: ["questioning", "european", "discovery-learning"],
    },
    {
      triggerContext: "during_practice" as const,
      promptType: "reminder" as const,
      title: "Watch the Quiet Ones",
      content: "The loudest players get the most attention. Scan for players who are disengaged or struggling silently.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Inclusive coaching",
      tags: ["inclusion", "awareness", "all-players"],
    },
    {
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Praise Effort, Not Outcome",
      content: "Say 'Great effort on that run!' instead of 'Good goal!' Effort-based praise builds resilience and growth mindset.",
      priority: 9,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "Growth mindset",
      tags: ["praise", "effort", "mindset"],
    },
    {
      triggerContext: "during_practice" as const,
      promptType: "warning" as const,
      title: "Avoid Long Lines",
      content: "If players are standing in lines for more than 30 seconds, they're not learning. More stations, smaller groups.",
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Maximizing engagement",
      tags: ["engagement", "efficiency", "organization"],
    },
    {
      triggerContext: "during_practice" as const,
      promptType: "encouragement" as const,
      title: "Celebrate Mistakes",
      content: "When a player makes a mistake trying something new, say 'I love that you tried that!' Mistakes mean they're learning.",
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Safe learning environment",
      tags: ["mistakes", "encouragement", "learning"],
    },
    {
      triggerContext: "during_practice" as const,
      promptType: "question" as const,
      title: "Check Understanding",
      content: "Ask a player to explain the activity to the group. If they can't, your instructions weren't clear enough.",
      priority: 7,
      frequency: "weekly" as const,
      isQuestionBased: true,
      targetedBehavior: "Clear communication",
      tags: ["communication", "understanding", "instructions"],
    },
    {
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Freeze & Question",
      content: "Occasionally freeze the action: 'Everyone stop! [Player], what do you see right now? What are your options?'",
      priority: 8,
      frequency: "weekly" as const,
      isQuestionBased: true,
      targetedBehavior: "Game understanding",
      tags: ["freeze", "questioning", "tactical-awareness"],
    },

    // Stage-specific during practice
    {
      stageId: discoveryStage,
      triggerContext: "during_practice" as const,
      promptType: "reminder" as const,
      title: "Movement Over Perfection",
      content: "At ages 3-5, focus on MOVEMENT not technique. Are they running, jumping, throwing? That's success!",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Age-appropriate expectations",
      tags: ["discovery", "movement", "expectations"],
    },
    {
      stageId: skillBuildingStage,
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Add Decision-Making",
      content: "At this age, add choices to drills: 'Defender steps left, what do you do?' Build game intelligence.",
      priority: 9,
      frequency: "weekly" as const,
      isQuestionBased: true,
      targetedBehavior: "Decision-making development",
      tags: ["decisions", "game-intelligence", "skill-building"],
    },
  ];

  // Post-practice prompts
  const postPracticePrompts = [
    {
      triggerContext: "post_practice" as const,
      promptType: "question" as const,
      title: "Self-Reflection",
      content: "What's one thing YOU would do differently next time? Great coaches constantly improve.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Coach development",
      tags: ["reflection", "improvement", "self-assessment"],
    },
    {
      triggerContext: "post_practice" as const,
      promptType: "reminder" as const,
      title: "End on a High",
      content: "Did you end with something fun and successful? Players remember how they FELT at the end.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Positive endings",
      tags: ["ending", "fun", "memory"],
    },
    {
      triggerContext: "post_practice" as const,
      promptType: "tip" as const,
      title: "Parent Connection",
      content: "Take 30 seconds to tell one parent something positive their child did today. Builds trust and community.",
      priority: 8,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "Parent engagement",
      tags: ["parents", "communication", "community"],
    },
    {
      triggerContext: "post_practice" as const,
      promptType: "question" as const,
      title: "Player Progress",
      content: "Which player showed the most improvement today? Have you recorded it for their development journey?",
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Progress tracking",
      tags: ["progress", "tracking", "individual"],
    },
    {
      triggerContext: "post_practice" as const,
      promptType: "reminder" as const,
      title: "Next Session Prep",
      content: "While it's fresh: What will you do NEXT practice based on what you saw today?",
      priority: 7,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Continuity planning",
      tags: ["planning", "continuity", "improvement"],
    },
  ];

  // Assessment context prompts
  const assessmentPrompts = [
    {
      triggerContext: "assessment" as const,
      promptType: "reminder" as const,
      title: "Observe, Don't Judge",
      content: "Assessments capture where they ARE, not where they SHOULD be. No player should feel they failed.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Non-judgmental assessment",
      tags: ["assessment", "observation", "mindset"],
    },
    {
      triggerContext: "assessment" as const,
      promptType: "tip" as const,
      title: "Natural Environment",
      content: "The best assessments happen during games, not isolated tests. Watch for skills in context.",
      priority: 9,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "Contextual assessment",
      tags: ["assessment", "games", "context"],
    },
    {
      triggerContext: "assessment" as const,
      promptType: "question" as const,
      title: "Growth Focus",
      content: "Compare this player to THEMSELVES last month, not to other players. What's their personal growth?",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "Individual progress",
      tags: ["assessment", "growth", "individual"],
    },
  ];

  // Game day prompts
  const gamePrompts = [
    {
      triggerContext: "pre_game" as const,
      promptType: "reminder" as const,
      title: "Equal Playing Time",
      content: "At youth level, EVERY player deserves meaningful playing time. Winning isn't the goal—development is.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Equal opportunity",
      tags: ["game-day", "playing-time", "development"],
    },
    {
      triggerContext: "during_game" as const,
      promptType: "tip" as const,
      title: "Let Them Play",
      content: "Resist the urge to coach every moment. Let players make decisions—that's where learning happens.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Player autonomy",
      tags: ["game-day", "autonomy", "decisions"],
    },
    {
      triggerContext: "during_game" as const,
      promptType: "warning" as const,
      title: "Sideline Behavior",
      content: "Your sideline energy affects players. Stay calm and positive—they're watching you more than you think.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "Coach composure",
      tags: ["game-day", "composure", "behavior"],
    },
    {
      triggerContext: "post_game" as const,
      promptType: "tip" as const,
      title: "The Car Ride Home",
      content: "Remind parents: After a game, just say 'I love watching you play.' No coaching, no critique, just support.",
      priority: 9,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "Parent education",
      tags: ["game-day", "parents", "support"],
    },
  ];

  // Combine all prompts
  const allPrompts = [
    ...prePracticePrompts,
    ...duringPracticePrompts,
    ...postPracticePrompts,
    ...assessmentPrompts,
    ...gamePrompts,
  ].map((prompt) => ({
    ...prompt,
    active: true,
  }));

  // Insert prompts
  await getDb().insert(coachPrompts).values(allPrompts);
  console.log(`Inserted ${allPrompts.length} coach prompts`);

  // Seed coaching principles
  const principles = [
    {
      title: "Development Over Winning",
      principle: "The primary goal of youth sports is player development, not winning games.",
      explanation:
        "Research consistently shows that early winning focus leads to player burnout, narrow skill development, and early dropout. European academies prioritize long-term development even at the cost of short-term results.",
      doExamples: [
        "Play all players equal time regardless of score",
        "Celebrate effort and improvement over wins",
        "Focus practice on skill development, not game tactics",
        "Rotate positions to build well-rounded players",
      ],
      dontExamples: [
        "Bench weaker players in close games",
        "Run plays designed just to win",
        "Specialize players in single positions too early",
        "Measure success by win-loss record",
      ],
      europeanInsight:
        "Ajax Amsterdam famously doesn't track win-loss records until U16. Their measure of success is how many players develop to the next level.",
      sortOrder: 1,
    },
    {
      title: "Questions Over Instructions",
      principle: "Guide players to discover solutions rather than telling them what to do.",
      explanation:
        "When players figure things out themselves, they understand more deeply and retain longer. This approach builds problem-solvers and creative thinkers.",
      doExamples: [
        "Ask 'What do you see?' instead of 'Look left!'",
        "Ask 'What happened there?' instead of 'You should have passed!'",
        "Let players try solutions before correcting",
        "Praise the thinking process, not just correct answers",
      ],
      dontExamples: [
        "Give step-by-step instructions for every situation",
        "Stop play constantly to correct mistakes",
        "Tell players exactly what to do in games",
        "Praise only correct outcomes",
      ],
      europeanInsight:
        "German coaching methodology emphasizes 'guided discovery' where coaches ask questions that lead players to understand concepts themselves.",
      sortOrder: 2,
    },
    {
      title: "Game-Based Learning",
      principle: "Learn skills in game-like contexts, not isolated drills.",
      explanation:
        "Players develop faster when skills are practiced in situations that mirror real games. Isolated drills create 'practice players' who can't transfer skills to competition.",
      doExamples: [
        "Use small-sided games as the primary teaching tool",
        "Add decision-making elements to every drill",
        "Create game situations in practice activities",
        "Let players experience why a skill matters",
      ],
      dontExamples: [
        "Run lines of players taking turns at drills",
        "Practice skills without any opposition",
        "Spend entire practices on technique without games",
        "Separate 'skill work' from 'game play'",
      ],
      europeanInsight:
        "Spanish academies use 'rondos' (keep-away games) because they teach passing, receiving, and decision-making all at once in a game context.",
      sortOrder: 3,
    },
    {
      title: "Psychological Safety",
      principle: "Create an environment where players feel safe to make mistakes and take risks.",
      explanation:
        "Learning requires mistakes. Players who fear failure play cautiously, avoid risks, and develop more slowly. The best learning environments celebrate creative attempts.",
      doExamples: [
        "Celebrate players who try new things (even if they fail)",
        "Share your own mistakes as a coach",
        "Use failure as a teaching moment without criticism",
        "Praise effort and creativity, not just success",
      ],
      dontExamples: [
        "Show frustration when players make mistakes",
        "Single out errors in front of the team",
        "Pull players for making mistakes in games",
        "Create pressure situations for young players",
      ],
      europeanInsight:
        "Dutch academies have a saying: 'The player who makes no mistakes makes nothing.' Creative players need permission to fail.",
      sortOrder: 4,
    },
    {
      title: "Individual Development Paths",
      principle: "Every player develops at their own pace and in their own way.",
      explanation:
        "Development is not linear. Early developers often plateau while late developers catch up. Comparing players to each other ignores natural development variation.",
      doExamples: [
        "Track individual progress, not peer comparisons",
        "Set personalized goals for each player",
        "Recognize different learning styles",
        "Be patient with late developers",
      ],
      dontExamples: [
        "Rank players against each other",
        "Cut late-developing players",
        "Apply same standards regardless of relative age",
        "Assume current ability predicts future potential",
      ],
      europeanInsight:
        "FC Barcelona considers birthdates when evaluating players—a January-born 8-year-old has up to 12 months more development than a December-born teammate.",
      sortOrder: 5,
    },
  ];

  await getDb().insert(coachingPrinciples).values(principles);
  console.log(`Inserted ${principles.length} coaching principles`);

  console.log("Coach prompts seeding complete!");
}

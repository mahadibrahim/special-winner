/**
 * Coach Training Modules Seed
 *
 * Phase 7: Content Expansion - Coach Training
 *
 * Seeds:
 * - Coach prompts (just-in-time guidance during practice)
 * - Coach resources (educational articles and guides)
 * - Coaching principles (core principles by stage)
 */

import { db } from "../index";
import { sports } from "../schema/sports";
import { developmentStages } from "../schema/curriculum";
import { coachPrompts, coachResources, coachingPrinciples } from "../schema/coach-guidance";
import { eq } from "drizzle-orm";

export async function seedCoachTrainingModules() {
  console.log("Seeding coach training modules...");

  // Get sports
  const [soccer] = await db.select().from(sports).where(eq(sports.slug, "soccer"));
  const [basketball] = await db.select().from(sports).where(eq(sports.slug, "basketball"));

  if (!soccer || !basketball) {
    throw new Error("Sports must be seeded first");
  }

  // Get development stages
  const stages = await db.select().from(developmentStages);
  const fundamentals = stages.find((s) => s.name === "Fundamentals");
  const skillBuilding = stages.find((s) => s.name === "Skill Building");
  const development = stages.find((s) => s.name === "Development");

  if (!fundamentals || !skillBuilding || !development) {
    throw new Error("Development stages must be seeded first");
  }

  // ============================================================
  // COACH PROMPTS - Just-in-time coaching guidance
  // ============================================================

  const promptsData = [
    // ==========================================
    // PRE-PRACTICE PROMPTS (General)
    // ==========================================
    {
      sportId: null,
      stageId: null,
      triggerContext: "pre_practice" as const,
      promptType: "reminder" as const,
      title: "Arrival Preparation",
      content:
        "Arrive 10-15 minutes before practice starts. Use this time to set up equipment, greet players individually, and observe their mood and energy levels.",
      priority: 10,
      frequency: "first_time" as const,
      isQuestionBased: false,
      targetedBehavior: "preparation",
      tags: ["preparation", "arrival", "setup"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "pre_practice" as const,
      promptType: "question" as const,
      title: "Session Goals",
      content:
        "What are 2-3 specific skills you want players to improve today? Can you describe what success looks like in simple terms?",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "goal setting",
      tags: ["planning", "goals", "focus"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "pre_practice" as const,
      promptType: "tip" as const,
      title: "Equipment Check",
      content:
        "Ensure you have: enough balls for all players, visible cones/markers, any safety equipment, and a first aid kit nearby. Running out of equipment disrupts the learning flow.",
      priority: 8,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "organization",
      tags: ["equipment", "preparation", "safety"],
    },

    // ==========================================
    // PRE-PRACTICE PROMPTS (By Stage)
    // ==========================================
    {
      sportId: null,
      stageId: fundamentals.id,
      triggerContext: "pre_practice" as const,
      promptType: "reminder" as const,
      title: "Fun First at Fundamentals",
      content:
        "For ages 6-8, fun is the #1 priority. If players aren't smiling and laughing, reconsider your activity choices. Technical perfection can wait - falling in love with the sport cannot.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "age-appropriate coaching",
      tags: ["fundamentals", "fun", "engagement"],
    },
    {
      sportId: null,
      stageId: skillBuilding.id,
      triggerContext: "pre_practice" as const,
      promptType: "tip" as const,
      title: "Skill Building Balance",
      content:
        "Ages 9-11 can handle more technical instruction, but still need 70% of practice time in game-like activities. Drills should be short (5-7 min max) before returning to play.",
      priority: 9,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "training design",
      tags: ["skill-building", "structure", "balance"],
    },
    {
      sportId: null,
      stageId: development.id,
      triggerContext: "pre_practice" as const,
      promptType: "reminder" as const,
      title: "Development Stage Autonomy",
      content:
        "Players 12-14 are ready for more responsibility. Let them help with warmup leadership, activity selection, and peer feedback. Autonomy builds intrinsic motivation.",
      priority: 9,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "player autonomy",
      tags: ["development", "autonomy", "leadership"],
    },

    // ==========================================
    // DURING PRACTICE PROMPTS
    // ==========================================
    {
      sportId: null,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Question Over Tell",
      content:
        'Instead of telling players what to do, ask questions: "What happened there?", "What could you try differently?", "Where is the space?" This develops thinking players.',
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "guided discovery",
      tags: ["questions", "discovery", "european-style"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "reminder" as const,
      title: "Let Them Play",
      content:
        "Resist the urge to stop play frequently. Most learning happens during the activity itself. Save detailed feedback for breaks or transitions.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "coach silence",
      tags: ["play", "flow", "minimal-intervention"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "encouragement" as const,
      title: "Effort Over Outcome",
      content:
        'Praise effort and process: "Great try!", "I love that you kept going", "Good decision to look up first". Avoid outcome-only praise like "Nice goal" which they can\'t always control.',
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "growth mindset",
      tags: ["praise", "effort", "growth-mindset"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "warning" as const,
      title: "Watch for Fatigue",
      content:
        "Signs of mental fatigue: increased mistakes, decreased effort, looking away, fidgeting. When you see these, change the activity or take a water break. Tired players don't learn well.",
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "player welfare",
      tags: ["fatigue", "attention", "breaks"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Positive to Constructive Ratio",
      content:
        "Aim for 4-5 positive comments for every constructive correction. Players who feel encouraged are more willing to take risks and try new skills.",
      priority: 7,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "feedback balance",
      tags: ["feedback", "positivity", "encouragement"],
    },

    // ==========================================
    // DURING PRACTICE - STAGE SPECIFIC
    // ==========================================
    {
      sportId: null,
      stageId: fundamentals.id,
      triggerContext: "during_practice" as const,
      promptType: "reminder" as const,
      title: "One Thing at a Time",
      content:
        "Young players (6-8) can only focus on one coaching point at a time. Pick ONE thing to improve and stick with it for the whole activity. Too much instruction overwhelms them.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "focused instruction",
      tags: ["fundamentals", "focus", "simplicity"],
    },
    {
      sportId: null,
      stageId: fundamentals.id,
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Use Imagery",
      content:
        'Young players respond to imagery: "Be a cheetah!", "Sticky feet like glue", "Eyes like an owl". Abstract concepts like "keep your body low" don\'t land as well.',
      priority: 8,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "communication",
      tags: ["imagery", "communication", "young-players"],
    },
    {
      sportId: null,
      stageId: skillBuilding.id,
      triggerContext: "during_practice" as const,
      promptType: "question" as const,
      title: "Problem Solving",
      content:
        'At ages 9-11, challenge players to solve problems: "The defender keeps winning - what can you change?", "How can you create more space?"',
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "tactical thinking",
      tags: ["problem-solving", "tactical", "thinking"],
    },

    // ==========================================
    // POST PRACTICE PROMPTS
    // ==========================================
    {
      sportId: null,
      stageId: null,
      triggerContext: "post_practice" as const,
      promptType: "question" as const,
      title: "Self Reflection",
      content:
        "Before leaving: What went well today? What would you do differently? Did every player get individual attention? Were there players who struggled that need extra support?",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "coach reflection",
      tags: ["reflection", "improvement", "self-assessment"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "post_practice" as const,
      promptType: "reminder" as const,
      title: "Individual Notes",
      content:
        "Take 2 minutes to record notes on 2-3 players - their progress, challenges, or something specific you noticed. These notes build into meaningful development insights over time.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "documentation",
      tags: ["notes", "tracking", "development"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "post_practice" as const,
      promptType: "tip" as const,
      title: "Parent Communication",
      content:
        'End practice with parents present. Share one positive highlight: "Today we worked on... and I saw some great effort from everyone." Parents appreciate seeing what their child is learning.',
      priority: 7,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "parent engagement",
      tags: ["parents", "communication", "transparency"],
    },

    // ==========================================
    // ASSESSMENT PROMPTS
    // ==========================================
    {
      sportId: null,
      stageId: null,
      triggerContext: "assessment" as const,
      promptType: "reminder" as const,
      title: "Assessment Is Observation",
      content:
        "Assessment should happen naturally during play, not through formal testing. Watch players in game-like situations to see their true ability level.",
      priority: 10,
      frequency: "first_time" as const,
      isQuestionBased: false,
      targetedBehavior: "assessment approach",
      tags: ["assessment", "observation", "authentic"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "assessment" as const,
      promptType: "tip" as const,
      title: "Focus on Progress",
      content:
        "Compare each player to their own past performance, not to teammates. Development happens at different rates. A player at Level 2 who improved from Level 1 deserves celebration.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "growth mindset",
      tags: ["progress", "individual", "growth"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "assessment" as const,
      promptType: "question" as const,
      title: "Holistic View",
      content:
        "Beyond technical skills, consider: Is this player enjoying practice? Are they a good teammate? Do they show resilience when things get hard? Development is multi-dimensional.",
      priority: 8,
      frequency: "weekly" as const,
      isQuestionBased: true,
      targetedBehavior: "holistic development",
      tags: ["psychological", "social", "whole-player"],
    },

    // ==========================================
    // SPORT-SPECIFIC PROMPTS - SOCCER
    // ==========================================
    {
      sportId: soccer.id,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Ball Mastery Time",
      content:
        "Start every soccer practice with 5-7 minutes of individual ball mastery. Every player, every ball, every surface. This builds the technical foundation for everything else.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "technical development",
      tags: ["soccer", "ball-mastery", "technical"],
    },
    {
      sportId: soccer.id,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "question" as const,
      title: "Soccer Vision",
      content:
        '"Can you see your teammates before you receive the ball?" - The best players scan before receiving. Encourage players to "take a picture" of the field before the ball arrives.',
      priority: 8,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "awareness",
      tags: ["soccer", "scanning", "awareness"],
    },
    {
      sportId: soccer.id,
      stageId: fundamentals.id,
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Small Sided Games",
      content:
        "For ages 6-8, 3v3 or 4v4 maximum. Smaller games mean more touches, more decisions, more goals. Big games create spectators, not players.",
      priority: 10,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "game format",
      tags: ["soccer", "small-sided", "fundamentals"],
    },

    // ==========================================
    // SPORT-SPECIFIC PROMPTS - BASKETBALL
    // ==========================================
    {
      sportId: basketball.id,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "tip" as const,
      title: "Eyes Up",
      content:
        'Young basketball players watch the ball while dribbling. Use "eyes up" games where players must identify colors or numbers while handling the ball to develop court vision.',
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "ball handling",
      tags: ["basketball", "dribbling", "vision"],
    },
    {
      sportId: basketball.id,
      stageId: null,
      triggerContext: "during_practice" as const,
      promptType: "reminder" as const,
      title: "Form Over Distance",
      content:
        "Shooting form is built close to the basket. Move players back gradually only as their form stays consistent. Bad habits from shooting too far are hard to fix.",
      priority: 8,
      frequency: "weekly" as const,
      isQuestionBased: false,
      targetedBehavior: "shooting mechanics",
      tags: ["basketball", "shooting", "technique"],
    },
    {
      sportId: basketball.id,
      stageId: fundamentals.id,
      triggerContext: "pre_practice" as const,
      promptType: "reminder" as const,
      title: "Lower Hoops",
      content:
        "Use 8-foot hoops for ages 6-8 if available. Standard 10-foot hoops force poor shooting form. Players should be able to make layups and close shots with proper technique.",
      priority: 9,
      frequency: "first_time" as const,
      isQuestionBased: false,
      targetedBehavior: "equipment adaptation",
      tags: ["basketball", "equipment", "fundamentals"],
    },

    // ==========================================
    // GAME DAY PROMPTS
    // ==========================================
    {
      sportId: null,
      stageId: null,
      triggerContext: "pre_game" as const,
      promptType: "reminder" as const,
      title: "Equal Playing Time",
      content:
        "For development ages (under 12), every player should get roughly equal playing time. Development happens through playing, not watching. Winning is secondary to development.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "player rotation",
      tags: ["game-day", "playing-time", "development"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "during_game" as const,
      promptType: "tip" as const,
      title: "Sideline Behavior",
      content:
        "During games, limit your instructions to encouragement. Players need to learn to make their own decisions. Constant coaching from the sideline creates dependent players.",
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "coach silence",
      tags: ["game-day", "sideline", "autonomy"],
    },
    {
      sportId: null,
      stageId: null,
      triggerContext: "post_game" as const,
      promptType: "question" as const,
      title: "Game Reflection",
      content:
        'Ask players: "Did you have fun?", "What did you try that worked?", "What do you want to work on at practice?" Focus on effort and learning, not score.',
      priority: 9,
      frequency: "always" as const,
      isQuestionBased: true,
      targetedBehavior: "player reflection",
      tags: ["game-day", "reflection", "learning"],
    },
    {
      sportId: null,
      stageId: fundamentals.id,
      triggerContext: "post_game" as const,
      promptType: "reminder" as const,
      title: "Score Doesn't Matter",
      content:
        "For ages 6-8, never mention the score in post-game talks. Ask about fun moments, good tries, and teamwork. Building love for the sport matters more than any result.",
      priority: 10,
      frequency: "always" as const,
      isQuestionBased: false,
      targetedBehavior: "outcome vs process",
      tags: ["game-day", "fundamentals", "enjoyment"],
    },
  ];

  // Insert prompts
  for (const prompt of promptsData) {
    await db
      .insert(coachPrompts)
      .values(prompt)
      .onConflictDoNothing();
  }

  console.log(`Seeded ${promptsData.length} coach prompts`);

  // ============================================================
  // COACH RESOURCES - Educational content
  // ============================================================

  const resourcesData = [
    // ==========================================
    // GIVING FEEDBACK RESOURCES
    // ==========================================
    {
      sportId: null,
      stageId: null,
      resourceType: "article" as const,
      title: "The Art of the Question: Guided Discovery in Youth Sports",
      description:
        "Learn how to use questions instead of commands to develop thinking athletes. Based on European coaching methodologies.",
      content: `# The Art of the Question: Guided Discovery in Youth Sports

## Why Questions Matter

Traditional coaching often relies on direct instruction: "Do this", "Don't do that", "Move here". While this approach can produce short-term results, it creates players who depend on coaches for every decision.

European academies have pioneered a different approach: **Guided Discovery**. Instead of telling players what to do, coaches ask questions that help players discover solutions themselves.

## The Science Behind It

When players solve problems themselves:
- Neural pathways strengthen through active processing
- Confidence increases (they found the solution)
- Transfer improves (they understand the "why")
- Intrinsic motivation grows (ownership of learning)

## Types of Coaching Questions

### 1. Observation Questions
Help players become aware of what's happening.
- "What did you notice there?"
- "Where was the space?"
- "What happened when you slowed down?"

### 2. Solution Questions
Guide players toward discovering answers.
- "What could you try differently?"
- "How else might you solve this?"
- "What worked last time?"

### 3. Reflection Questions
Encourage self-assessment and learning.
- "How did that feel?"
- "What would you do again?"
- "What was the hardest part?"

## Practical Tips

**Wait for answers.** Silence is uncomfortable, but give players 5-10 seconds to think. Don't answer your own questions.

**Accept wrong answers gracefully.** "Interesting - let's see what happens if you try that." Let players learn from testing their ideas.

**Build on responses.** "You said you needed more space. How might you create it?"

**Keep questions simple.** One question at a time, especially for younger players.

## Age Adaptations

**Ages 6-8:** Use simple, concrete questions. "Where are the sharks?" (defenders). "Can you find the empty space?"

**Ages 9-11:** Introduce tactical questions. "Why did that pass work?" "What makes the defender turn?"

**Ages 12+:** Challenge with complex scenarios. "When would you NOT make that run?" "What's the defender thinking?"

## Remember

The goal isn't to never give instruction. Sometimes direct coaching is appropriate. But if you find yourself telling more than asking, pause and convert your next instruction into a question.

**Instead of:** "Get your head up when you dribble."
**Try:** "What could you see if you looked up while dribbling?"

The best coaching creates players who don't need coaches.`,
      topic: "feedback",
      tags: ["questions", "guided-discovery", "feedback", "european-style"],
      featured: true,
    },
    {
      sportId: null,
      stageId: null,
      resourceType: "article" as const,
      title: "Positive Sandwich vs. Authentic Feedback",
      description:
        "Why the 'positive-negative-positive' approach can backfire, and what works better for youth athletes.",
      content: `# Positive Sandwich vs. Authentic Feedback

## The Positive Sandwich Problem

Many coaches learn to give feedback as a "sandwich":
1. Say something positive
2. Give the correction
3. End with something positive

Example: "Great effort, but you need to keep your head up, and I love your energy!"

Sounds good, right? Here's the problem: **players stop trusting your positive feedback**.

When every correction comes wrapped in compliments, players learn that "great job" really means "here comes the critique." Your genuine praise loses its power.

## What Research Shows

Studies on feedback show:
- Immediate, specific feedback is more effective than delayed, general feedback
- Authenticity matters more than positivity ratio
- Players prefer honest coaches over "nice" coaches
- Growth mindset develops from effort recognition, not empty praise

## Better Approaches

### 1. Separate Your Feedback

Let positive observations stand alone:
- "Nice turn away from pressure there."
- (Later, unrelated moment) "On that last play, check your shoulder before receiving."

### 2. Be Specific

**Vague:** "Good job!"
**Specific:** "You looked over your shoulder before the ball came - that's how you knew where to go."

**Vague:** "You need to communicate more."
**Specific:** "Calling for the ball earlier would help your teammate see you."

### 3. Focus on Process, Not Outcome

**Outcome-based:** "Great goal!" (Player got lucky, defender slipped)
**Process-based:** "Great decision to shoot early before the defender closed down."

**Outcome-based:** "Unlucky miss."
**Process-based:** "Good body shape on that shot - the technique was right."

### 4. Use "AND" Instead of "BUT"

"But" negates everything before it.

**With but:** "You dribbled well, BUT you should have passed earlier."
(Player hears: I should have passed earlier)

**With and:** "You dribbled well, AND passing earlier is something to work on."
(Player hears: Both things are true)

### 5. Make Corrections Forward-Looking

**Backward:** "You shouldn't have passed there."
**Forward:** "Next time, check if the space is there before passing."

## Age Considerations

**Ages 6-8:** Keep feedback mostly positive and about effort. Technical corrections should be minimal and playful.

**Ages 9-11:** Can handle more specific feedback. Still emphasize effort and improvement over mistakes.

**Ages 12+:** Ready for direct, honest feedback. They'll respect you more for it.

## The Bottom Line

Authenticity beats formula. Players know when you're genuine. Give honest praise when deserved, specific corrections when needed, and skip the manufactured positivity sandwich.`,
      topic: "feedback",
      tags: ["feedback", "communication", "positive-coaching", "praise"],
      featured: false,
    },

    // ==========================================
    // AGE-APPROPRIATE COACHING RESOURCES
    // ==========================================
    {
      sportId: null,
      stageId: fundamentals.id,
      resourceType: "article" as const,
      title: "Coaching 6-8 Year Olds: The Fundamentals Stage",
      description:
        "Understanding child development and adapting your coaching for the youngest athletes.",
      content: `# Coaching 6-8 Year Olds: The Fundamentals Stage

## Understanding This Age

Children aged 6-8 are in the "sampling years" - they should be trying many sports and activities. Your job is to make their experience so positive that they want to keep playing, regardless of which sport they ultimately focus on.

### Cognitive Development
- Attention span: 8-15 minutes maximum per activity
- Concrete thinkers: can't process abstract concepts
- Egocentric: difficulty understanding others' perspectives
- Memory: need frequent repetition of instructions

### Physical Development
- Developing fundamental motor skills
- Poor spatial awareness
- Limited hand-eye coordination
- Easily fatigued but recover quickly

### Emotional Development
- Sensitive to criticism
- Need lots of encouragement
- Learn through play, not lecture
- Want to belong and have fun

## Coaching Implications

### Session Design
- **Keep activities to 5-7 minutes max**
- **Minimize time in lines** (everyone has a ball)
- **Use games over drills** (they can't distinguish anyway)
- **Build in movement breaks** (drink water, switch activities)
- **End while they're still having fun** (leave them wanting more)

### Communication
- **One instruction at a time** ("Kick with your laces" - not "kick with your laces and follow through")
- **Use imagery** ("Be a cheetah" not "run fast")
- **Demonstrate don't explain** (show, don't tell)
- **Get on their level** (kneel when talking to them)
- **Names matter** (use their names frequently)

### Feedback
- **Effort over outcome** ("Great try!" even when they miss)
- **5:1 positive ratio** (five encouragements per correction)
- **No sarcasm** (they take everything literally)
- **Celebrate small wins** (touching the ball counts!)

### Common Mistakes to Avoid
- ❌ Stopping play too often to correct
- ❌ Long explanations or tactical talks
- ❌ Expecting focus during water breaks
- ❌ Competition based on ability (they all want to win)
- ❌ Scorekeeping and standings

## What Success Looks Like

At this age, success is NOT:
- Winning games
- Perfect technique
- Understanding formations

Success IS:
- Players excited to come back
- Everyone active and moving
- Smiles and laughter during practice
- Players trying their best
- Nobody standing around
- Basic love for movement and sport

## Sample Session Structure (45-50 min)

1. **Free play arrival (5 min):** Let them touch balls, play with friends
2. **Warmup game (7 min):** Tag or movement game with theme
3. **Ball familiarity (7 min):** Everyone has a ball, simple challenges
4. **Technical game (8 min):** Game that develops one skill
5. **Water break (3 min):** Keep it short, they'll lose focus
6. **Small-sided game (12 min):** 3v3 or 4v4 with modified rules
7. **Cool down (5 min):** Gentle activity, group circle

## Remember

At 6-8, you are not coaching a sport. You are **coaching movement literacy and love of activity**. Technical and tactical development comes later. Right now, make it fun.`,
      topic: "age-appropriate",
      tags: ["fundamentals", "6-8", "development", "fun"],
      featured: true,
    },
    {
      sportId: null,
      stageId: skillBuilding.id,
      resourceType: "article" as const,
      title: "Coaching 9-11 Year Olds: The Skill Building Stage",
      description:
        "How to leverage the 'golden age of learning' for skill development while maintaining enjoyment.",
      content: `# Coaching 9-11 Year Olds: The Skill Building Stage

## The Golden Age of Learning

Ages 9-11 are often called the "golden age" for skill acquisition. Children at this stage can:
- Learn motor skills quickly
- Handle more complex instructions
- Begin understanding basic tactics
- Benefit from repetition without boredom

This is your window to develop technical foundations that will serve them for life.

### Cognitive Development
- Attention span: 15-25 minutes per activity
- Beginning abstract thought
- Can understand cause and effect
- Ready for basic tactical concepts
- Can process 2-3 instructions at once

### Physical Development
- Improved coordination and balance
- Better spatial awareness
- Pre-puberty: similar abilities across genders
- Motor learning at peak sensitivity

### Emotional Development
- Growing social awareness
- Peer relationships matter more
- Beginning self-comparison to others
- Can handle constructive feedback

## Coaching Implications

### Session Design
- **Longer activities possible** (8-12 minutes per activity)
- **Introduce structured repetition** (but still game-like)
- **Challenge with progressions** (make it harder, make it easier)
- **Include small-sided games** (5v5 or 6v6 work well)
- **Add some decision-making** (choices within activities)

### Communication
- **Explain the "why"** (they can understand reasons now)
- **Use tactical vocabulary** (space, support, pressure)
- **Ask questions** (begin guided discovery approach)
- **Let them problem-solve** (give them time to figure it out)
- **Group discussions work** (brief team huddles)

### Technical Development
- **Focus on quality** (technique matters now)
- **Both feet/hands** (develop weak side)
- **Speed with skill** (add time pressure gradually)
- **Movement combinations** (not isolated skills)
- **Match-realistic practice** (skills used as in games)

### Tactical Introduction
- **Simple concepts first** (width, depth, support)
- **Use questions** ("Where is the space?")
- **Let games teach** (they'll discover patterns)
- **Avoid rigid positions** (rotation and experience)
- **Individual tactics before team** (1v1 before 5v5)

## Training Session Structure (60-75 min)

1. **Warmup with ball (10 min):** Technical warmup, ball mastery
2. **Technical block (12 min):** Skill focus with progressions
3. **Tactical activity (12 min):** Small group problem-solving game
4. **Water break (3 min)**
5. **Conditioned game (15 min):** Modified game emphasizing session theme
6. **Free game (15 min):** Uninterrupted play
7. **Cool down/review (5 min):** Quick reflection questions

## Skill Building Priorities

### Technical Focus Areas
- Sport-specific fundamentals at game speed
- Weak foot/hand development
- Receiving and controlling under pressure
- 1v1 attacking and defending
- First touch quality

### Tactical Introduction
- What to do with the ball (immediate options)
- What to do without the ball (movement off ball)
- Basic defensive concepts (pressure, cover)
- Transition awareness (attack to defense, defense to attack)

## Balancing Development and Competition

At this age, there's tension between development and results. Remember:
- **Still about development** (winning is secondary)
- **Equal playing time** (all positions)
- **Rotate positions** (don't specialize)
- **Process over outcome** (celebrate good play regardless of result)

## Signs of Good Coaching

✓ Players trying new skills without fear of failure
✓ Players making decisions without looking at coach
✓ Improvement visible over the season
✓ Players still enjoying practice and games
✓ Players from all ability levels engaged
✓ Questions being asked by players`,
      topic: "age-appropriate",
      tags: ["skill-building", "9-11", "technique", "golden-age"],
      featured: true,
    },
    {
      sportId: null,
      stageId: development.id,
      resourceType: "article" as const,
      title: "Coaching 12-14 Year Olds: The Development Stage",
      description:
        "Navigating puberty, growing tactical understanding, and maintaining motivation during the crucial development years.",
      content: `# Coaching 12-14 Year Olds: The Development Stage

## The Challenging Years

Ages 12-14 bring significant changes. Puberty creates uneven development - some players shoot up in height, others mature early in strength. Managing these differences while continuing development requires thoughtful coaching.

### Physical Changes
- Puberty onset varies (11-15 for most)
- Temporary loss of coordination during growth spurts
- Strength and speed develop at different rates
- Gender differences begin to emerge
- Greater injury risk during rapid growth

### Cognitive Development
- Full abstract thinking develops
- Can understand complex tactics
- Capable of self-reflection
- Can analyze performance
- Ready for position-specific learning

### Emotional Development
- Identity formation in progress
- Peer influence at maximum
- Sensitive to embarrassment
- Beginning to question authority
- Need for autonomy growing

## Coaching Implications

### Managing Physical Diversity

Within one team you might have:
- A physically mature player who looks 16
- An early bloomer who's peaked
- A late developer who hasn't started growing

**Critical principle:** Never select or evaluate based on current physical attributes. The late developers often become the best players.

Tips:
- **Adjust training for individuals** (not one-size-fits-all)
- **Monitor growth spurts** (reduce load during rapid growth)
- **Value technique over power** (the fast, strong kid who can't control a ball has no advantage)
- **Praise skill, not size** (recognize technical excellence regardless of physical build)

### Session Design
- **Longer activities** (15-20 minutes possible)
- **More game-like** (80% of practice in game situations)
- **Player input** (let them influence session content)
- **Tactical complexity** (formations, systems, set plays)
- **Position-specific** (beginning specialization - but not complete)

### Communication
- **Treat them as young adults** (respectful, not childish)
- **Explain rationale** (they need to understand why)
- **Accept questions and pushback** (it's healthy)
- **Private corrections preferred** (avoid public embarrassment)
- **Give responsibility** (leadership roles, warmup leads)

### Motivation
- **Autonomy matters** (choice and input)
- **Competence grows** (help them see their improvement)
- **Relatedness counts** (team culture, belonging)
- **Avoid external pressure** (intrinsic motivation is fragile)

## Training Session Structure (75-90 min)

1. **Player-led warmup (10 min):** Give players ownership
2. **Technical development (15 min):** Position-relevant skills
3. **Tactical block (20 min):** Phase of play or game situations
4. **Conditioned games (25 min):** Modified games with focus
5. **Full game (15 min):** Realistic game scenario
6. **Debrief (5 min):** Player-led discussion

## Development Priorities

### Technical Refinement
- Skills at match speed and under pressure
- Position-specific techniques
- Weak foot/hand to 70% of dominant
- Combination play execution
- Set piece execution

### Tactical Development
- Understanding of team system
- Position-specific responsibilities
- Reading the game (anticipation)
- Decision-making under pressure
- Leadership and communication

### Physical Development
- Introduce structured conditioning
- Movement quality and injury prevention
- Speed and agility (appropriate to growth)
- Strength foundations (bodyweight first)

### Psychological Development
- Resilience and dealing with setbacks
- Focus and concentration
- Competitive mindset (healthy competition)
- Self-reflection and goal-setting

## The Dropout Risk

Ages 12-14 see the highest dropout rate in youth sports. Common reasons:
- Not fun anymore
- Too much pressure
- Coach relationships
- Other interests competing
- Early specialization burnout

**Prevention:**
- Keep enjoyment central
- Reduce pressure
- Build genuine relationships
- Allow multi-sport participation
- Value process over outcomes

## Signs of Success

✓ Players want to be there
✓ Improvement visible in all players
✓ Players solve problems independently
✓ Team culture is positive
✓ Players taking leadership
✓ Late developers are thriving`,
      topic: "age-appropriate",
      tags: ["development", "12-14", "puberty", "tactical"],
      featured: true,
    },

    // ==========================================
    // PARENT COMMUNICATION RESOURCES
    // ==========================================
    {
      sportId: null,
      stageId: null,
      resourceType: "article" as const,
      title: "Partnering with Parents: Building Trust and Alignment",
      description:
        "How to communicate your development philosophy to parents and get them on board with the journey.",
      content: `# Partnering with Parents: Building Trust and Alignment

## The Parent Challenge

Many parents approach youth sports with good intentions but misguided expectations. They may:
- Overvalue winning and outcomes
- Compare their child to more developed peers
- Provide well-meaning but counterproductive feedback
- Focus on playing time over development
- Project their own sports dreams onto their child

Your job is to **educate and align** parents with a development-focused philosophy.

## Start with Transparency

### Pre-Season Meeting
Hold a mandatory pre-season meeting to establish expectations:

1. **Your philosophy** (development over winning)
2. **What practices look like** (play-based, age-appropriate)
3. **Playing time expectations** (equal at young ages)
4. **Your communication approach** (how and when you're available)
5. **Their role** (support, not coach)

### Provide Resources
Share documents on:
- Age-appropriate development
- What to say (and not say) on the ride home
- How to watch games supportively
- Signs of burnout to watch for

## Ongoing Communication

### Regular Updates
- Weekly email with practice themes and what you worked on
- Monthly development focuses
- Positive highlights (rotate through all players)

### Progress Conversations
- Schedule 1-2 individual player conversations per season
- Focus on development, not outcomes
- Include the player when appropriate (ages 10+)

### Game Day Guidance
Before games, remind parents:
- "We're working on [specific focus]. Look for players trying this."
- "Today's success is effort and teamwork, regardless of score."
- "Let them play - no coaching from the sidelines."

## Handling Difficult Conversations

### "My child isn't playing enough"
"I understand your concern. At this age, equal participation is how players develop. [Child] is getting the same opportunity as everyone else, and I'm seeing growth in [specific area]."

### "Why aren't we trying to win?"
"Winning is fun, and we're not trying to lose. But research shows that focusing on development produces better players AND more winning in the long run. Short-term results can hide long-term problems."

### "My child is better than others"
"[Child] is doing well in [specific area]. At this age, physical maturity can mask technical gaps. I'm focused on making sure [Child] has the skills needed for the next level, which sometimes means working on weaknesses."

### "I disagree with your coaching"
"I'm happy to explain my approach. Can we set up a time to talk this week? I want you to understand why I'm doing what I'm doing."

## Setting Boundaries

### Sideline Behavior
Be clear about expectations:
- Cheering for effort: ✓
- Coaching from sidelines: ✗
- Criticizing referees: ✗
- Negative comments about players: ✗

### The 24-Hour Rule
Establish a cooling-off period for post-game discussions. Emotions run high; decisions are made better with perspective.

### What You Won't Discuss
- Other players
- Playing time comparisons
- Team selection decisions
- In-game tactical decisions

## The Ride Home

Share research on "The Car Ride Home":
- Ask: "Did you have fun?"
- Ask: "What did you enjoy most?"
- Avoid: Analysis of performance
- Avoid: What they did wrong
- Avoid: What coach should have done

Players whose parents say "I love watching you play" report higher enjoyment and stay in sports longer.

## Converting Skeptics

Some parents take time to buy in. Strategies:
- Invite them to watch practice (see your methods)
- Share player improvement stories
- Connect them with aligned parents
- Be patient - results over time win them over

## Remember

Parents want what's best for their child. When they trust that you do too, most difficulties dissolve. Build that trust through consistent communication, visible care for players, and genuine expertise.`,
      topic: "parent-communication",
      tags: ["parents", "communication", "alignment", "philosophy"],
      featured: true,
    },
    {
      sportId: null,
      stageId: null,
      resourceType: "article" as const,
      title: "The Post-Game Conversation: What Parents Should Say",
      description:
        "Research-backed guidance on how parents can support their child athlete after competition.",
      content: `# The Post-Game Conversation: What Parents Should Say

## The Most Important Six Words

Research by Bruce Brown and Rob Miller surveyed hundreds of college athletes about their youth sports experiences. The most impactful thing parents can say?

**"I love watching you play."**

That's it. Not advice. Not analysis. Just unconditional enjoyment of seeing their child compete.

## What Athletes Don't Want to Hear

The same research revealed what caused the most negative memories:
- Criticism of their performance
- Criticism of the coach
- Criticism of teammates
- Analysis of what they should have done
- Comparisons to other players

## The Optimal Post-Game Conversation

### Immediately After the Game
**Say:** "Did you have fun?"
**Purpose:** Reinforces that enjoyment matters most

**Say:** "Are you hungry/thirsty?"
**Purpose:** Takes care of their physical needs, changes focus

**Say:** "I'm proud of how hard you worked out there."
**Purpose:** Reinforces effort over outcome

### Later (If They Want to Talk)
Let the child lead. If they want to discuss the game, ask open-ended questions:
- "What was your favorite moment?"
- "What do you want to work on for next time?"
- "How did the team do together?"

### What to Avoid
- Detailed analysis of their play
- Comparison to other players
- "Constructive" criticism
- Questions about the coach's decisions
- Your disappointment (even if hidden)

## Why This Matters

### Performance Anxiety
When children expect post-game criticism, they develop performance anxiety. They play not to fail rather than playing to succeed.

### Intrinsic Motivation
Children who receive unconditional support maintain love for the sport longer. Those whose parental approval seems conditional on performance often burn out or quit.

### Parent-Child Relationship
Sports should enhance the parent-child bond, not strain it. When games are followed by criticism, children associate the sport with negative emotions.

## Common Parent Mistakes

### "I'm just trying to help them improve"
**Reality:** Improvement happens at practice with coaches. The car ride home isn't coaching time.

### "They need to hear tough feedback"
**Reality:** They get plenty of feedback at practice. They need unconditional support at home.

### "I played at a high level and know what they need"
**Reality:** Your expertise doesn't change their emotional needs. Your role now is parent, not coach.

### "They seemed upset, I wanted to explain what went wrong"
**Reality:** Let them process. Being a listening ear beats being an analyst.

## The Exception

If your child asks for your feedback or analysis, you can provide it thoughtfully:
- Ask permission: "Do you want my thoughts, or do you just want to vent?"
- Start positive: What they did well
- Be specific and actionable: One thing to work on
- End supportive: Express confidence in them

## For Coaches: Help Parents Succeed

Share this guidance with parents:
- Pre-season meeting discussion
- Handout for game day
- Reminder in weekly emails

Parents want to do right by their kids. Many just don't know what that looks like.

## Final Thought

Children have the rest of their lives to analyze, strategize, and optimize. For now, they need to feel loved unconditionally while they play a game.

**"I love watching you play."**`,
      topic: "parent-communication",
      tags: ["parents", "post-game", "car-ride", "emotional-support"],
      featured: false,
    },

    // ==========================================
    // PLAYER DEVELOPMENT RESOURCES
    // ==========================================
    {
      sportId: null,
      stageId: null,
      resourceType: "article" as const,
      title: "Long-Term Athletic Development: The European Model",
      description:
        "Understanding the LTAD framework and how European academies develop elite athletes over decades, not seasons.",
      content: `# Long-Term Athletic Development: The European Model

## The Fundamental Shift

American youth sports often operate on a **"win now"** model:
- Early specialization
- Year-round single-sport training
- Best players get most playing time
- Selection based on current ability
- Results-focused evaluation

European academies operate on a **"develop for later"** model:
- Multi-sport foundation
- Phased development over decades
- Equal development opportunities
- Selection based on potential
- Process-focused evaluation

## The LTAD Framework

Long-Term Athletic Development (LTAD) structures development into phases:

### 1. Active Start (Ages 0-6)
- Fundamental movement (run, jump, throw, catch)
- Play-based learning
- Multiple activities
- **Goal:** Love of movement

### 2. FUNdamentals (Ages 6-9)
- Basic sport skills across many sports
- ABC's of athleticism (Agility, Balance, Coordination, Speed)
- Minimal competition focus
- **Goal:** Movement literacy

### 3. Learn to Train (Ages 9-12)
- Sport-specific skill development
- "Golden age" of motor learning
- Still multi-sport recommended
- **Goal:** Technical foundation

### 4. Train to Train (Ages 12-16)
- Building the "engine"
- Increasing training volume
- Beginning specialization (late in phase)
- **Goal:** Physical and tactical capacity

### 5. Train to Compete (Ages 16-18)
- Competition-specific training
- Position specialization
- Periodization introduction
- **Goal:** Competition readiness

### 6. Train to Win (Ages 18+)
- Elite performance focus
- Full-time training
- Peak performance management
- **Goal:** Winning

## Why America Gets It Wrong

### Early Specialization
American youth often specialize by age 8-10. Research shows:
- Higher injury rates
- Earlier burnout
- Narrower athletic base
- Lower peak performance ceiling

### Selection Based on Maturity
America selects "best" players young, often based on physical maturity. Early developers dominate youth sports but plateau. Late developers, passed over, often have more long-term potential.

### Year-Round Single-Sport
Playing one sport year-round creates:
- Overuse injuries
- Skill imbalances
- Mental fatigue
- Social isolation from broader peer groups

## The European Approach

### Multi-Sport Foundation
Ajax Academy in Amsterdam requires young players to play other sports. Barcelona's La Masia has players do gymnastics and swimming. This builds complete athletes.

### Development Over Results
German youth football banned standings and league tables for under-11s. Development happens when pressure is removed.

### Late Selection
European academies delay selection decisions. They know the 12-year-old who's behind physically might be the 18-year-old with the best skills.

### Training Quality Over Quantity
More is not better. European academies focus on deliberate practice quality, not just hours.

## Practical Applications

### For Coaches
- Encourage multi-sport participation
- Don't over-train (more rest, less drilling)
- Focus on skill quality over game results
- Give late developers time and opportunity
- Celebrate improvement, not just current ability

### For Parents
- Resist pressure to specialize early
- Value development over trophies
- Support participation in multiple sports
- Trust the long-term process
- Avoid "scholarship" thinking at young ages

### For Organizations
- Delay competitive selections
- Remove or minimize standings for young ages
- Train coaches in development philosophy
- Evaluate on development metrics, not just wins
- Partner with other sports programs

## The Payoff

Countries using LTAD frameworks (Germany, Belgium, France) have seen:
- Increased player pools at elite levels
- Lower youth dropout rates
- Fewer overuse injuries
- More creative, well-rounded players
- Better long-term competitive success

## Remember

The goal is not to produce the best 10-year-old. The goal is to produce the best 25-year-old. Every decision should serve that end.`,
      topic: "development",
      tags: ["LTAD", "development", "european", "long-term"],
      featured: true,
    },

    // ==========================================
    // SAFETY RESOURCES
    // ==========================================
    {
      sportId: null,
      stageId: null,
      resourceType: "article" as const,
      title: "Recognizing Burnout: When to Pull Back",
      description:
        "Signs of athlete burnout and how coaches can create sustainable development environments.",
      content: `# Recognizing Burnout: When to Pull Back

## What Is Burnout?

Burnout is a state of physical and emotional exhaustion resulting from prolonged stress. In youth athletes, it manifests as:
- Decreased enjoyment
- Reduced sense of accomplishment
- Emotional and physical exhaustion
- Often leads to dropout from sport

## Warning Signs

### Behavioral Changes
- Arriving late or making excuses to miss practice
- Reduced effort during training
- Increased conflicts with teammates or coaches
- Isolation from team activities
- Talking negatively about the sport they used to love

### Physical Signs
- Chronic fatigue not explained by physical load
- Frequent minor illnesses
- Lingering injuries that don't heal
- Decreased performance despite training
- Sleep problems

### Emotional Signs
- Mood changes (irritability, sadness)
- Anxiety about training or competition
- Loss of confidence
- Feelings of being trapped
- Pressure feels overwhelming

## Risk Factors

### Training Load
- Year-round single-sport participation
- Excessive training hours
- Inadequate recovery time
- Playing on multiple teams simultaneously

### Environment
- Win-at-all-costs culture
- Excessive parental pressure
- Fear-based coaching
- Social isolation from non-sport peers
- Early specialization

### Individual
- Perfectionism
- High need for external validation
- Poor coping skills
- Lack of autonomy
- Sport-only identity

## Prevention Strategies

### Training Design
- Build in rest periods (off-season matters)
- Vary activities to prevent monotony
- Balance challenge with achievable success
- Include player input in training design

### Culture
- Celebrate effort, not just outcomes
- Foster intrinsic motivation
- Create positive social environment
- Support multi-sport participation
- Model healthy work-life balance

### Communication
- Regular check-ins on how players are feeling
- Open door for concerns
- Notice and address changes in behavior
- Involve parents in wellness monitoring

## When You See Signs

### Immediate Actions
1. **Talk privately** - Express concern without judgment
2. **Listen more than speak** - Understand their experience
3. **Reduce load** - Decrease training temporarily
4. **Connect with parents** - Align on approach

### Medium-Term Actions
- Take a break from competition
- Encourage other activities
- Consider professional support if needed
- Re-evaluate development path

### Long-Term Actions
- Examine and adjust team culture
- Reduce unnecessary pressure sources
- Build sustainable training models
- Create systems for early detection

## The Larger Issue

Burnout is often a symptom of systemic problems:
- Youth sports that mirror professional models
- Adults' dreams projected onto children
- Pressure to specialize for scholarships
- Fear of falling behind peers

Coaches can only do so much. But modeling healthy approaches and protecting player welfare is within your control.

## Remember

The child who burns out at 12 will never become the elite athlete at 22. Sustainability beats intensity. Fun drives longevity. The sport should enrich their life, not consume it.

If you're unsure, ask: "Will this child still love this sport in 5 years?" If the answer isn't a clear yes, something needs to change.`,
      topic: "welfare",
      tags: ["burnout", "welfare", "prevention", "sustainability"],
      featured: false,
    },
  ];

  // Insert resources
  for (const resource of resourcesData) {
    await db
      .insert(coachResources)
      .values(resource)
      .onConflictDoNothing();
  }

  console.log(`Seeded ${resourcesData.length} coach resources`);

  // ============================================================
  // COACHING PRINCIPLES - Core principles by stage
  // ============================================================

  const principlesData = [
    // ==========================================
    // GENERAL PRINCIPLES (All Stages)
    // ==========================================
    {
      sportId: null,
      stageId: null,
      title: "Development Over Winning",
      principle:
        "Prioritize individual player development over team results. A successful season is measured by player improvement and enjoyment, not win-loss record.",
      explanation:
        "Youth sports exist to develop people, not to produce trophies. Research shows that development-focused programs produce better players AND more long-term success than win-focused programs.",
      doExamples: [
        "Celebrate improvement regardless of game outcome",
        "Give equal playing time at young ages",
        "Focus practice on skill development, not just game tactics",
        "Ask 'Are players getting better?' not 'Are we winning?'",
      ],
      dontExamples: [
        "Reduce playing time for weaker players",
        "Skip skill work to practice set plays",
        "Judge success solely by standings",
        "Prioritize winning over player welfare",
      ],
      europeanInsight:
        "German youth football banned league standings for under-11s. This removed win pressure and increased development focus. Participation and skill development increased.",
      sortOrder: 1,
    },
    {
      sportId: null,
      stageId: null,
      title: "Ask, Don't Tell",
      principle:
        "Use questions to guide player learning rather than giving direct commands. Players who discover solutions develop deeper understanding.",
      explanation:
        "The European coaching approach uses guided discovery. When coaches ask questions instead of giving answers, players develop problem-solving skills and retain learning better.",
      doExamples: [
        "Ask 'What did you see?' after a play",
        "Ask 'What could you try differently?'",
        "Let players experiment before correcting",
        "Guide with 'What if...' questions",
      ],
      dontExamples: [
        "Give constant play-by-play instructions",
        "Answer your own questions immediately",
        "Correct every mistake as it happens",
        "Lecture during water breaks",
      ],
      europeanInsight:
        "Dutch coaching philosophy emphasizes 'coaching without a whistle' - letting the game teach and using questions to prompt reflection rather than stopping play to instruct.",
      sortOrder: 2,
    },
    {
      sportId: null,
      stageId: null,
      title: "Play is the Teacher",
      principle:
        "Games and play-based activities develop skills more effectively than isolated drills. The best learning happens within game contexts.",
      explanation:
        "Skills learned in isolation don't transfer well to games. Skills learned in game-like situations transfer directly. Additionally, play is intrinsically motivating while drills are not.",
      doExamples: [
        "Use small-sided games as primary teaching tool",
        "Design activities that look like the game",
        "Keep players playing, not waiting in lines",
        "Adjust games to emphasize target skills",
      ],
      dontExamples: [
        "Run drills for half of practice",
        "Have players standing in lines",
        "Practice skills without opposition",
        "Separate technical work from tactical work",
      ],
      europeanInsight:
        "Barcelona's La Masia uses 'rondos' (keep-away games) as the foundation of technical training. Game-like pressure creates game-ready skills.",
      sortOrder: 3,
    },

    // ==========================================
    // FUNDAMENTALS STAGE PRINCIPLES (6-8)
    // ==========================================
    {
      sportId: null,
      stageId: fundamentals.id,
      title: "Fun is Non-Negotiable",
      principle:
        "At ages 6-8, every session must be fun first. If players aren't enjoying themselves, nothing else matters - you'll lose them before skills develop.",
      explanation:
        "Children at this age are sampling activities. They'll continue with what's enjoyable and drop what isn't. Your job is to make them fall in love with the sport.",
      doExamples: [
        "Observe faces - are they smiling?",
        "Use games and competitions they find exciting",
        "Include silly elements and celebrations",
        "End on a high note, leaving them wanting more",
      ],
      dontExamples: [
        "Prioritize technical perfection over engagement",
        "Run serious, adult-like training sessions",
        "Spend time on tactics or formations",
        "Criticize performance in front of peers",
      ],
      europeanInsight:
        "Ajax Amsterdam's youth philosophy states: 'If a child isn't enjoying it, we're doing something wrong.' Fun is considered a prerequisite for development, not a distraction from it.",
      sortOrder: 10,
    },
    {
      sportId: null,
      stageId: fundamentals.id,
      title: "Movement First",
      principle:
        "Focus on general movement literacy (running, jumping, throwing, catching, balancing) before sport-specific skills. Athletic foundations transfer across all sports.",
      explanation:
        "The best athletes have broad movement vocabularies. Early years should develop coordination, agility, balance, and spatial awareness through varied movements.",
      doExamples: [
        "Include activities from other sports",
        "Use animal movements and crawling patterns",
        "Incorporate jumping, hopping, skipping",
        "Challenge balance in fun ways",
      ],
      dontExamples: [
        "Focus exclusively on sport-specific skills",
        "Neglect non-ball activities",
        "Assume movement skills are already developed",
        "Skip warmups that build coordination",
      ],
      europeanInsight:
        "German sport schools teach 'ABC's of Athleticism' (Agility, Balance, Coordination, Speed) across multiple sports before any specialization occurs.",
      sortOrder: 11,
    },
    {
      sportId: null,
      stageId: fundamentals.id,
      title: "Every Ball, Every Player",
      principle:
        "Maximize touches and minimize waiting. Every player should have a ball whenever possible. Lines and waiting kill learning.",
      explanation:
        "Skill development requires repetition. Waiting in lines means missed repetitions. Young players also lose focus when passive.",
      doExamples: [
        "Provide enough equipment for all players",
        "Design activities where everyone moves simultaneously",
        "Use multiple small groups over one large group",
        "Keep ball-to-player ratio high",
      ],
      dontExamples: [
        "Have half the team watching",
        "Run passing lines with waiting",
        "Share balls between many players",
        "Use activities with long inactive periods",
      ],
      europeanInsight:
        "Spanish youth academies use 'technical circuits' where all players work simultaneously on different stations, rotating frequently to maintain engagement and maximize touches.",
      sortOrder: 12,
    },

    // ==========================================
    // SKILL BUILDING STAGE PRINCIPLES (9-11)
    // ==========================================
    {
      sportId: null,
      stageId: skillBuilding.id,
      title: "The Golden Age",
      principle:
        "Ages 9-11 are the peak years for motor skill acquisition. Use this window to develop technical foundations that will last a lifetime.",
      explanation:
        "Neurological research shows this age has exceptional capacity for learning complex motor skills. Skills developed now become automatic; those missed are harder to develop later.",
      doExamples: [
        "Focus practice time on technique",
        "Develop both sides (weak hand/foot)",
        "Add complexity gradually",
        "Repeat skills in varied contexts",
      ],
      dontExamples: [
        "Skip technical work for tactics",
        "Only use dominant hand/foot",
        "Allow sloppy technique for results",
        "Reduce skill work as season progresses",
      ],
      europeanInsight:
        "Ajax identifies 'moments of learning' at each age. For ages 9-11, technical excellence is the primary focus, knowing that tactical understanding develops more readily later.",
      sortOrder: 20,
    },
    {
      sportId: null,
      stageId: skillBuilding.id,
      title: "Challenge with Care",
      principle:
        "Players this age can handle more challenge and repetition than younger players, but still need success to stay motivated. Find the sweet spot.",
      explanation:
        "The zone of proximal development - challenging enough to grow, achievable enough to succeed. Too easy breeds boredom; too hard breeds frustration.",
      doExamples: [
        "Use progressions that increase difficulty",
        "Provide variations for different ability levels",
        "Celebrate effort when tasks are hard",
        "Adjust on the fly based on success rate",
      ],
      dontExamples: [
        "Give everyone the same challenge",
        "Push past frustration point",
        "Keep activities too easy for too long",
        "Ignore struggling players",
      ],
      europeanInsight:
        "Belgian youth development emphasizes 'individual development plans' where training is customized to each player's current ability and growth areas.",
      sortOrder: 21,
    },

    // ==========================================
    // DEVELOPMENT STAGE PRINCIPLES (12-14)
    // ==========================================
    {
      sportId: null,
      stageId: development.id,
      title: "Manage the Transition",
      principle:
        "Puberty creates temporary skill regression as bodies change. Be patient with awkward phases and focus on maintaining enjoyment through physical transition.",
      explanation:
        "Players who grew 4 inches may temporarily lose coordination. Previously coordinated players may struggle. This is normal and temporary.",
      doExamples: [
        "Recognize growth-related changes",
        "Reduce physical load during growth spurts",
        "Focus on technique maintenance not perfection",
        "Provide encouragement through awkward phases",
      ],
      dontExamples: [
        "Judge current ability as permanent",
        "Push through overuse injuries",
        "Compare to peers at different maturity",
        "Increase pressure during difficult transitions",
      ],
      europeanInsight:
        "French Football Federation tracks biological age separately from chronological age, adjusting training loads and expectations based on physical development, not birth year.",
      sortOrder: 30,
    },
    {
      sportId: null,
      stageId: development.id,
      title: "Build Thinking Players",
      principle:
        "Players 12-14 can understand complex tactics. Develop their game intelligence through questions, film, and tactical challenges, not just instructions.",
      explanation:
        "Abstract thinking develops in this phase. Players can now understand why, not just what. Use this capacity to develop decision-makers.",
      doExamples: [
        "Discuss tactical scenarios",
        "Ask 'Why did that work?'",
        "Give decision-making responsibility",
        "Use video analysis together",
      ],
      dontExamples: [
        "Give all tactical instructions",
        "Dictate every decision from sideline",
        "Remove all player autonomy",
        "Ignore their tactical suggestions",
      ],
      europeanInsight:
        "Dutch academies create 'street football players' - intelligent, creative players who can solve problems independently rather than dependent on coach direction.",
      sortOrder: 31,
    },
    {
      sportId: null,
      stageId: development.id,
      title: "Autonomy and Ownership",
      principle:
        "Give players voice and choice. Involve them in goal-setting, activity selection, and team culture. Autonomy builds intrinsic motivation.",
      explanation:
        "Self-determination theory shows autonomy is a core human need. Players who feel ownership over their development are more motivated and resilient.",
      doExamples: [
        "Let players lead warmups",
        "Ask for activity preferences",
        "Involve in team goal-setting",
        "Give leadership opportunities",
      ],
      dontExamples: [
        "Control every aspect of training",
        "Ignore player input",
        "Use fear or punishment as motivation",
        "Treat players as passive recipients",
      ],
      europeanInsight:
        "German youth programs have 'player councils' where athletes contribute to team decisions, building leadership and investment in the team's success.",
      sortOrder: 32,
    },

    // ==========================================
    // SPORT-SPECIFIC: SOCCER
    // ==========================================
    {
      sportId: soccer.id,
      stageId: null,
      title: "Small-Sided is Superior",
      principle:
        "Use small-sided games (3v3 to 7v7) for development. They produce more touches, more decisions, and more scoring opportunities than full-field games.",
      explanation:
        "Research shows small-sided games (SSG) create 200-500% more skill execution opportunities than 11v11. They're also more age-appropriate for young players.",
      doExamples: [
        "Use 3v3 for 6-8 year olds",
        "Use 5v5 to 7v7 for 9-12 year olds",
        "Multiple small games over one big game",
        "Adjust field size to player age",
      ],
      dontExamples: [
        "Play 11v11 with young players",
        "Use adult-sized goals and fields",
        "Have half the team as subs watching",
        "Prioritize positions over play",
      ],
      europeanInsight:
        "All major European leagues mandate small-sided games for youth. The English FA requires 5v5 until U10, 7v7 until U12, 9v9 until U14.",
      sortOrder: 100,
    },
    {
      sportId: soccer.id,
      stageId: fundamentals.id,
      title: "Ball Mastery First",
      principle:
        "Individual ball work (touches, control, moves) is the foundation. Every practice should include dedicated ball mastery time with one ball per player.",
      explanation:
        "Technical excellence starts with comfort on the ball. European academies spend years developing individual technique before tactical complexity.",
      doExamples: [
        "Start each session with ball mastery",
        "One ball per player minimum",
        "All surfaces (laces, inside, sole, outside)",
        "Both feet development",
      ],
      dontExamples: [
        "Skip individual work for team drills",
        "Share balls between players",
        "Only use dominant foot",
        "Rush to passing/shooting activities",
      ],
      europeanInsight:
        "Brazilian futsal produces some of the world's most technically skilled players because youth spend years in small spaces with constant ball contact.",
      sortOrder: 101,
    },

    // ==========================================
    // SPORT-SPECIFIC: BASKETBALL
    // ==========================================
    {
      sportId: basketball.id,
      stageId: null,
      title: "Lower the Hoop",
      principle:
        "Use age-appropriate equipment. Lower hoops, smaller balls, and shorter courts develop proper mechanics that transfer to regulation equipment later.",
      explanation:
        "Players shooting at 10-foot hoops with regulation balls must use improper form to generate enough power. This creates habits that are difficult to correct.",
      doExamples: [
        "8-foot hoops for ages 6-8",
        "9-foot hoops for ages 9-11",
        "Size appropriate balls (27.5 inch for youth)",
        "Shorter free throw distance",
      ],
      dontExamples: [
        "Use 10-foot hoops for young players",
        "Expect range before strength develops",
        "Allow 'heaving' shot form",
        "Prioritize makes over mechanics",
      ],
      europeanInsight:
        "European basketball federations mandate lower hoops and smaller balls for youth. This is why European shooting mechanics are often considered superior.",
      sortOrder: 110,
    },
    {
      sportId: basketball.id,
      stageId: fundamentals.id,
      title: "Handle Before Shoot",
      principle:
        "Ball handling and court awareness come before shooting. Players who can control the ball and see the court become complete players; pure shooters are limited.",
      explanation:
        "Every player should be able to handle, pass, and make decisions. Early positional specialization limits development.",
      doExamples: [
        "All players practice ball handling",
        "Include court vision in dribbling work",
        "Teach all players to pass under pressure",
        "Rotate positions regardless of size",
      ],
      dontExamples: [
        "Specialize positions based on size",
        "Let tall players skip ball handling",
        "Only post players in the low block",
        "Point guard only handles the ball",
      ],
      europeanInsight:
        "European basketball produces 'positionless' players who can handle, pass, and shoot regardless of size. This is why European players adapt well to modern NBA styles.",
      sortOrder: 111,
    },
  ];

  // Insert principles
  for (const principle of principlesData) {
    await db
      .insert(coachingPrinciples)
      .values(principle)
      .onConflictDoNothing();
  }

  console.log(`Seeded ${principlesData.length} coaching principles`);

  console.log("Coach training modules seeding complete!");
}

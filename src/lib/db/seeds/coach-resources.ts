import { getDb } from "../index";
import { coachResources } from "../schema/coach-guidance";
import { sports } from "../schema/sports";
import { developmentStages } from "../schema/curriculum";

export async function seedCoachResources() {
  console.log("Seeding coach resources...");

  // Get reference data
  const allSports = await getDb().select().from(sports);
  const stages = await getDb().select().from(developmentStages);

  const soccerId = allSports.find((s) => s.name === "Soccer")?.id;
  const basketballId = allSports.find((s) => s.name === "Basketball")?.id;

  const discoveryStage = stages.find((s) => s.slug === "discovery")?.id;
  const fundamentalsStage = stages.find((s) => s.slug === "fundamentals")?.id;
  const skillBuildingStage = stages.find((s) => s.slug === "skill-building")?.id;

  const resources = [
    // General Coaching Resources
    {
      resourceType: "article" as const,
      title: "The Art of Questioning in Coaching",
      description:
        "Learn how to use questions instead of instructions to develop players who think for themselves. The European approach to guided discovery.",
      content: `# The Art of Questioning in Coaching

## Why Questions Work Better Than Instructions

When you tell a player what to do, they follow instructions. When you ask them what they see, they learn to think. This fundamental shift—from instructing to questioning—is at the heart of European coaching methodology.

## The Question Framework

### Open Questions
- "What do you see?"
- "What are your options?"
- "What happened there?"

### Guided Questions
- "Where is the space?"
- "What did your teammate expect?"
- "How could you create more time?"

### Reflection Questions
- "What would you do differently?"
- "Why did that work?"
- "What surprised you?"

## Practical Application

**Instead of:** "Pass the ball earlier!"
**Ask:** "When did you decide to pass? Was there an earlier moment?"

**Instead of:** "You should have shot!"
**Ask:** "What options did you see there?"

**Instead of:** "Move to space!"
**Ask:** "Where was the space? How could you get there?"

## Key Principles

1. **Wait Time**: After asking, give players 3-5 seconds to think
2. **No Wrong Answers**: Every answer reveals their thinking
3. **Follow Up**: "Tell me more about that..."
4. **Celebrate Thinking**: "I love that you saw that option!"

## Remember

The goal isn't to get the "right" answer. It's to develop players who constantly scan, think, and make decisions. The thinking process matters more than the answer.`,
      topic: "coaching-methodology",
      tags: ["questioning", "european", "methodology", "communication"],
      featured: true,
    },
    {
      resourceType: "article" as const,
      title: "Creating Psychologically Safe Training Environments",
      description:
        "Research-backed strategies for creating an environment where players feel safe to take risks, make mistakes, and develop creativity.",
      content: `# Creating Psychologically Safe Training Environments

## What is Psychological Safety?

Psychological safety is the belief that you won't be punished or humiliated for speaking up, asking questions, or making mistakes. In youth sports, it's the foundation for learning and creativity.

## Why It Matters

- Players who feel safe take more creative risks
- Mistakes become learning opportunities, not shame experiences
- Players develop intrinsic motivation and love for the sport
- Retention rates dramatically improve

## Warning Signs of Unsafe Environments

- Players look at the coach after making mistakes
- Risk-averse play (only safe passes, no creative attempts)
- Quiet, disengaged players
- Fear of trying new skills
- Decreased effort over time

## Building Safety: Practical Strategies

### 1. Reframe Mistakes
"Mistakes mean you're trying something new—that's exactly what I want!"

### 2. Model Vulnerability
Share your own mistakes: "When I played, I struggled with this too..."

### 3. Praise Risk-Taking
"I love that you tried that! Even though it didn't work, the attempt was great!"

### 4. Private Corrections
Pull players aside for individual feedback rather than public correction.

### 5. Question, Don't Critique
Instead of "That was wrong," ask "What happened there? What might you try next time?"

## Team Culture Builders

- "We celebrate effort, not just success"
- "Mistakes help us learn"
- "We support each other"
- "Everyone belongs here"

## Remember

The safest environments often produce the boldest players. When failure isn't scary, players are free to be creative.`,
      topic: "psychology",
      tags: ["safety", "psychology", "culture", "mistakes"],
      featured: true,
    },
    {
      resourceType: "article" as const,
      title: "Age-Appropriate Coaching: The Science of Development",
      description:
        "Understanding cognitive, physical, and emotional development stages to match your coaching to where players actually are.",
      content: `# Age-Appropriate Coaching: The Science of Development

## The Development Reality

Children are not mini-adults. Their brains, bodies, and emotional capacity develop at predictable stages. Effective coaching matches methods to developmental reality.

## Ages 3-5: Discovery Stage

### Physical Development
- Large muscle control developing
- Fine motor skills limited
- Coordination improving but inconsistent
- Tire quickly, recover quickly

### Cognitive Development
- Attention span: 5-7 minutes max
- Egocentric (can't see others' perspectives)
- Concrete thinkers (abstract concepts don't work)
- Learn through DOING, not listening

### Coaching Implications
- Maximum activity, minimum instruction
- Lots of breaks (water, rest, silly breaks)
- Simple rules, simple games
- Success = participation and smiling
- No positions, no complex tactics

## Ages 6-8: Fundamentals Stage

### Physical Development
- Improved coordination
- Still developing spatial awareness
- Can sustain activity longer
- Growth spurts may cause clumsiness

### Cognitive Development
- Attention span: 10-12 minutes
- Beginning to understand others' views
- Can follow multi-step instructions
- Learning cause and effect

### Coaching Implications
- Introduce basic techniques
- Use demonstrations, not just words
- Small-sided games (3v3, 4v4)
- Still prioritize fun and participation
- Begin teaching teamwork concepts

## Ages 9-12: Skill Building Stage

### Physical Development
- "Skill-hungry years" - rapid learning
- Good coordination
- Varied growth (some early, some late)
- Can handle more physical demands

### Cognitive Development
- Attention span: 15-20 minutes
- Understand tactics and strategy
- Can self-reflect
- Beginning abstract thinking

### Coaching Implications
- Technique refinement
- Introduce decision-making
- More complex game concepts
- Individual feedback matters
- Still development over winning

## Golden Rules for All Ages

1. **Shorten talking, increase doing**
2. **Match expectations to development**
3. **Remember late developers catch up**
4. **Fun remains essential at every age**
5. **Relationships before results**`,
      topic: "development",
      tags: ["age-appropriate", "development", "stages", "science"],
      featured: true,
    },
    {
      resourceType: "article" as const,
      title: "Effective Feedback: The 4:1 Ratio",
      description:
        "Learn the research-backed approach to feedback that builds confidence while still developing skills.",
      content: `# Effective Feedback: The 4:1 Ratio

## The Research

Studies show that the optimal feedback ratio for development is 4:1 positive to corrective. This isn't about being soft—it's about how brains learn best.

## Why 4:1 Works

- Positive feedback releases dopamine, enhancing learning
- Players remain open to correction
- Confidence builds alongside skill
- Players take more risks

## Types of Positive Feedback

### 1. Effort Praise
"You worked so hard on that drill!"
"I saw you running back on defense—great effort!"

### 2. Improvement Recognition
"Your left foot is so much better than last month!"
"That pass was way more accurate than before!"

### 3. Behavior Acknowledgment
"I love how you encouraged your teammate!"
"Great job staying positive when that didn't work!"

### 4. Specific Skill Praise
"Your body position was perfect there!"
"That first touch set up everything!"

## The Corrective Feedback Part

### When It's Needed
- After establishing safety through positive feedback
- Focused on one thing at a time
- Delivered as information, not judgment

### How to Deliver It
**Format:** Acknowledge → Suggest → Encourage

"That pass showed great vision. What if you opened your body more to see both options? Try it again—you've got this!"

## Common Mistakes

❌ "Good job, BUT..." (the but erases the praise)
❌ Praising only outcomes (goals, wins)
❌ Generic praise ("Nice work!")
❌ Delayed feedback (save it for later)

## Remember

Players don't remember what you said. They remember how you made them feel. The 4:1 ratio creates players who love coming to practice.`,
      topic: "feedback",
      tags: ["feedback", "communication", "praise", "correction"],
      featured: false,
    },
    {
      resourceType: "article" as const,
      title: "Small-Sided Games: The Heart of Modern Coaching",
      description:
        "Why small-sided games develop better players faster, and how to design effective game-based activities.",
      content: `# Small-Sided Games: The Heart of Modern Coaching

## The Research is Clear

Players in small-sided games get:
- 4x more touches on the ball
- 3x more 1v1 situations
- 2x more passing decisions
- More goals/shots (building confidence)
- Constant cognitive engagement

## Why They Work

### More Repetition
In 11v11, a player might touch the ball 20 times in an hour.
In 4v4, they might touch it 100+ times.

### Game-Real Learning
Skills are practiced in context, with opposition, under pressure—just like real games.

### Constant Decision-Making
Every touch requires a decision: dribble? pass? shoot? where?

### Self-Organizing
Players naturally learn spacing, support, movement without explicit instruction.

## Designing Effective Small-Sided Games

### The Formula
**Small space + Few players + Simple rules = Maximum engagement**

### Key Principles
1. **Quick restart** - No waiting, ball out = ball in immediately
2. **Multiple balls** - Keep one on the field at all times
3. **Play, then coach** - Let them play before stopping
4. **Constraints, not instructions** - Change the game, not the player

### Example Constraints
- "You must complete 3 passes before shooting"
- "Goals only count if team is in attacking half"
- "Score double points for weak foot goals"
- "Can only score from a one-touch finish"

## Game Sizes by Age

| Age | Recommended Size |
|-----|------------------|
| 3-5 | 1v1, 2v2 |
| 6-8 | 3v3, 4v4 |
| 9-12 | 4v4, 5v5, 7v7 |

## Remember

The best practice looks like the best playground soccer: constant action, kids fully engaged, having fun, getting better without realizing it.`,
      topic: "methodology",
      tags: ["small-sided-games", "games", "methodology", "engagement"],
      featured: true,
    },

    // Sport-Specific Resources
    {
      sportId: soccerId,
      resourceType: "article" as const,
      title: "Teaching the First Touch",
      description: "How to develop players who can control the ball in any situation, using game-based methods.",
      content: `# Teaching the First Touch

## Why First Touch Matters

In modern soccer, the first touch determines everything. A good first touch creates time, space, and options. A poor first touch means pressure, panic, and lost possession.

## The European Approach

Don't drill first touch in isolation. Develop it through games where first touch matters.

## Game-Based Activities

### 1. Receive and Turn (4v4)
- Goals on all 4 sides of square
- Extra point for receiving, turning, and scoring on opposite goal
- Forces players to receive facing away from pressure

### 2. Two-Touch Maximum
- Normal small-sided game
- Maximum 2 touches
- Players must prepare their first touch for the second

### 3. The Pressure Game
- 3v1 in a square
- Player who receives ball becomes defender
- Forces quality first touch under pressure

## Coaching Points (delivered as questions)

- "Where is the defender? Where do you want your first touch?"
- "What part of your foot gives you the most control?"
- "Can you receive the ball so you're already facing your next action?"

## Common Mistakes (and what causes them)

| Mistake | Usually caused by |
|---------|-------------------|
| Ball bounces off | Standing flat-footed, tense body |
| Touch too heavy | Not cushioning, kicking instead of receiving |
| Touch too close | Not looking before receiving |
| Touch backward | Body not open to the field |

## Remember

The best first touch isn't always perfect control—it's the touch that solves the problem. Sometimes that's a touch into space, sometimes it's a first-time pass.`,
      topic: "technique",
      tags: ["soccer", "first-touch", "receiving", "technique"],
      featured: false,
    },
    {
      sportId: basketballId,
      resourceType: "article" as const,
      title: "Ball Handling Development",
      description: "Progressive approach to developing ball handling skills that transfer to game situations.",
      content: `# Ball Handling Development

## Philosophy

Ball handling isn't about fancy moves—it's about being comfortable with the ball so your eyes and mind can focus on the game.

## Progression

### Stage 1: Comfort (Ages 5-7)
Goal: Ball feels natural in hands
- Pound dribbles (hard, loud dribbles)
- Figure 8s around legs (no dribble)
- Dribble while sitting, kneeling, standing
- Games: Dribble tag, knockout

### Stage 2: Control (Ages 8-10)
Goal: Maintain dribble while doing other things
- Dribble with eyes up
- Change speeds
- Change hands
- Games: 1v1, dribble relay races

### Stage 3: Decision-Making (Ages 11+)
Goal: Read defense and react
- Attack space
- Use moves to create advantage
- When to dribble vs when to pass
- Games: 2v2, 3v3 with dribble constraints

## Key Moves to Teach

### Crossover
The foundation. Change direction with one dribble.
- Low, quick, ball below knee
- Sell the direction first

### Hesitation
Change of pace to freeze defender.
- Slow down like you're stopping
- Accelerate past

### Between the Legs
Protect the ball while changing direction.
- Ball crosses under the leg
- Used when defender is reaching

## Game-Based Practice

**Sharks and Minnows**
Everyone dribbles. 1-2 "sharks" try to knock balls away.
Develops: protecting the ball, head up, using body

**1v1 Full Court**
Start at baseline, score at opposite basket.
Develops: attacking, decision-making, conditioning

## Remember

The best ball handlers look like they're barely dribbling—the ball is just part of them. That comfort comes from thousands of repetitions in game-like situations.`,
      topic: "technique",
      tags: ["basketball", "ball-handling", "dribbling", "technique"],
      featured: false,
    },

    // External Video Resources (placeholder URLs - would be real in production)
    {
      resourceType: "video" as const,
      title: "The Changing Room: Coach Communication",
      description: "How top European coaches communicate with young players before, during, and after training.",
      url: "https://www.youtube.com/watch?v=example1",
      durationMinutes: 12,
      topic: "communication",
      tags: ["video", "communication", "european", "methodology"],
      source: "UEFA Coaching Education",
      featured: false,
    },
    {
      resourceType: "video" as const,
      title: "Small-Sided Games in Action",
      description: "Watch how FC Barcelona's La Masia academy uses small-sided games to develop world-class players.",
      url: "https://www.youtube.com/watch?v=example2",
      durationMinutes: 18,
      topic: "methodology",
      tags: ["video", "small-sided-games", "barcelona", "academy"],
      source: "FC Barcelona",
      featured: true,
    },
    {
      resourceType: "video" as const,
      title: "Age-Appropriate Coaching Demonstration",
      description: "See the difference between coaching 6-year-olds vs 12-year-olds with the same activity.",
      url: "https://www.youtube.com/watch?v=example3",
      durationMinutes: 15,
      topic: "development",
      tags: ["video", "age-appropriate", "demonstration", "comparison"],
      source: "US Soccer Development Academy",
      featured: false,
    },

    // Stage-Specific Resources
    {
      stageId: discoveryStage,
      resourceType: "article" as const,
      title: "Coaching the Discovery Stage (Ages 3-5)",
      description: "Everything you need to know about coaching the youngest athletes. Focus: fun, movement, and falling in love with activity.",
      content: `# Coaching the Discovery Stage (Ages 3-5)

## Your #1 Goal

Get them to come back next week. That's it. Everything else is secondary.

## What They Need

- Movement in all directions
- Success (lots of it)
- Fun (constant fun)
- Connection with you and friends
- Short bursts of activity
- Zero pressure

## What They Don't Need

- Technique correction
- Positions
- Competition focus
- Long explanations
- Standing still
- Complex rules

## Session Structure (30-45 minutes)

1. **Free Play** (5 min) - Let them explore with equipment
2. **Movement Game** (8 min) - Sharks and minnows, tag, etc.
3. **Water Break** (3 min) - They need lots of these
4. **Activity 2** (8 min) - Simple skill game
5. **Water Break** (2 min)
6. **Activity 3** (8 min) - Different movement challenge
7. **Fun Game** (5 min) - End on a high

## Language to Use

✅ "Let's see who can..." (makes it a game)
✅ "Show me how you..." (celebrates individuality)
✅ "Who's ready to..." (builds excitement)
✅ "Great job trying!" (praises effort)

## Language to Avoid

❌ "No, do it like this..."
❌ "You need to..."
❌ "That's wrong..."
❌ "Watch how I do it..."

## Remember

A 4-year-old who loves coming to practice will become a 14-year-old who's still playing. A 4-year-old who feels pressured won't make it to age 6.`,
      topic: "age-appropriate",
      tags: ["discovery", "young-children", "fun", "development"],
      featured: false,
    },
    {
      stageId: fundamentalsStage,
      resourceType: "article" as const,
      title: "Coaching the Fundamentals Stage (Ages 6-8)",
      description: "Building the foundation: basic techniques, simple tactics, and maintaining the love of the game.",
      content: `# Coaching the Fundamentals Stage (Ages 6-8)

## The Sweet Spot

Old enough to learn basic techniques, young enough that fun still trumps everything. This is where foundations are laid.

## Your Goals

1. Maintain their love of the sport
2. Develop basic movement skills
3. Introduce sport-specific fundamentals
4. Build social connections
5. Create confident, happy athletes

## What's Developmentally Appropriate

### Physical
- Can sustain activity for 10-15 minutes
- Coordination improving rapidly
- Still learning body awareness
- Growth spurts may cause clumsiness

### Cognitive
- Can follow 2-3 step instructions
- Beginning to understand cause/effect
- Starting to see others' perspectives
- Attention span: ~10-12 minutes

### Emotional
- Want to please adults
- Sensitive to criticism
- Need frequent encouragement
- Compare themselves to peers

## Session Structure (45-60 minutes)

1. **Dynamic Warm-Up** (8 min) - Fun movement games
2. **Technical Block** (12 min) - One skill focus
3. **Water Break** (3 min)
4. **Game-Based Activity** (12 min) - Skill in game context
5. **Water Break** (3 min)
6. **Small-Sided Game** (15 min) - Free play with minimal rules
7. **Cool-Down** (5 min) - Team cheer, positive send-off

## Technique Teaching Approach

1. **Demonstrate** - Quick visual (10 seconds)
2. **Play** - Let them try immediately
3. **Observe** - Watch what happens
4. **Question** - "What did you notice?"
5. **Play Again** - Apply what they discovered

## Remember

They're still discovering if they LIKE this sport. Your job is to make sure they do.`,
      topic: "age-appropriate",
      tags: ["fundamentals", "technique", "foundation", "development"],
      featured: false,
    },
  ];

  // Insert resources
  await getDb().insert(coachResources).values(
    resources.map((r) => ({
      ...r,
      active: true,
      viewCount: 0,
    }))
  );

  console.log(`Inserted ${resources.length} coach resources`);
  console.log("Coach resources seeding complete!");
}

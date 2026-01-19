import { getDb } from "../index";
import { practiceTemplates, developmentStages } from "../schema";
import { sports } from "../schema/sports";
import { eq } from "drizzle-orm";

export async function seedPracticeTemplates() {
  if (false) {
    console.error("Database not available");
    return;
  }

  console.log("Seeding practice templates...");

  // Get sports
  const [soccer] = await getDb()
    .select()
    .from(sports)
    .where(eq(sports.name, "Soccer"));
  const [basketball] = await getDb()
    .select()
    .from(sports)
    .where(eq(sports.name, "Basketball"));

  if (!soccer || !basketball) {
    console.error("Sports not found. Run seed.ts first.");
    return;
  }

  // Get development stages
  const stages = await getDb().select().from(developmentStages);
  const stageMap = new Map(stages.map((s) => [s.slug, s.id]));

  const fundamentalsId = stageMap.get("fundamentals");
  const skillBuildingId = stageMap.get("skill-building");
  const developmentId = stageMap.get("development");

  if (!fundamentalsId || !skillBuildingId || !developmentId) {
    console.error("Development stages not found. Run seed-curriculum.ts first.");
    return;
  }

  const templates = [
    // === SOCCER TEMPLATES ===
    // Fundamentals (Ages 6-8)
    {
      sportId: soccer.id,
      stageId: fundamentalsId,
      name: "Fundamentals: 60-Minute Ball Mastery",
      description: "Focus on individual ball skills, fun games, and building love of the game. High activity ratio with minimal standing.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Arrival Activity",
          type: "warmup",
          durationMinutes: 5,
          description: "Free play with ball as players arrive",
          activitySuggestions: ["Free dribbling", "Ball juggling attempts"],
        },
        {
          name: "Dynamic Warmup",
          type: "warmup",
          durationMinutes: 8,
          description: "Active game to get heart rate up and engage players",
          activitySuggestions: ["Shark Attack", "Traffic Lights", "Ball Tag"],
        },
        {
          name: "Ball Mastery",
          type: "technical",
          durationMinutes: 10,
          description: "Individual ball skills - foundation touches",
          activitySuggestions: ["Ball Mastery Circle", "Toe taps", "Sole rolls"],
        },
        {
          name: "Technical Focus",
          type: "technical",
          durationMinutes: 12,
          description: "Dribbling or passing activity with clear objective",
          activitySuggestions: ["Gates Dribbling", "Partner passing"],
        },
        {
          name: "Small-Sided Game",
          type: "game",
          durationMinutes: 20,
          description: "Game play with small numbers - lots of touches",
          activitySuggestions: ["End Zone Game", "4v4 to Small Goals"],
        },
        {
          name: "Cool Down & Recap",
          type: "cooldown",
          durationMinutes: 5,
          description: "Light activity and celebrate successes",
          activitySuggestions: ["Passing Pairs", "Juggling challenge"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones (20+)", "Pinnies", "Small goals or cones for goals"],
      coachingNotes: `Key principles for this age:
- Keep every player moving - avoid lines
- Praise effort, not just results
- Use guided discovery - ask questions
- Make it fun! If they're not smiling, change the activity
- Focus on ball mastery over tactics
- Every child should touch the ball hundreds of times`,
      isDefault: true,
    },
    {
      sportId: soccer.id,
      stageId: fundamentalsId,
      name: "Fundamentals: 45-Minute Fun Session",
      description: "Shorter session ideal for younger players or limited time. Heavy emphasis on fun games.",
      totalDurationMinutes: 45,
      structure: [
        {
          name: "Warmup Game",
          type: "warmup",
          durationMinutes: 7,
          description: "Fun game to engage players immediately",
          activitySuggestions: ["Shark Attack", "Dribble Tag"],
        },
        {
          name: "Ball Skills",
          type: "technical",
          durationMinutes: 10,
          description: "Individual ball mastery activities",
          activitySuggestions: ["Ball Mastery Circle", "Traffic Lights"],
        },
        {
          name: "Skill Game",
          type: "game",
          durationMinutes: 10,
          description: "Competitive activity applying the skill",
          activitySuggestions: ["Gates Dribbling", "World Cup"],
        },
        {
          name: "Free Play Game",
          type: "game",
          durationMinutes: 15,
          description: "Small-sided game with minimal coaching",
          activitySuggestions: ["End Zone Game", "4v4 to Small Goals"],
        },
        {
          name: "Celebration",
          type: "cooldown",
          durationMinutes: 3,
          description: "Cheer, high fives, and see you next time!",
          activitySuggestions: [],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones", "Pinnies"],
      coachingNotes: `Shorter session principles:
- Keep transitions quick
- Have backup activities ready
- End on a high note
- Less is more at this age`,
      isDefault: false,
    },

    // Skill Building (Ages 9-11)
    {
      sportId: soccer.id,
      stageId: skillBuildingId,
      name: "Skill Building: 75-Minute Technical Focus",
      description: "Balanced session developing technical skills through purposeful practice and game-like situations.",
      totalDurationMinutes: 75,
      structure: [
        {
          name: "Dynamic Warmup",
          type: "warmup",
          durationMinutes: 8,
          description: "Active warmup with ball - prepare body and mind",
          activitySuggestions: ["Ball Mastery Circle", "Traffic Lights"],
        },
        {
          name: "Technical Block 1",
          type: "technical",
          durationMinutes: 12,
          description: "Focused skill work with high repetition",
          activitySuggestions: ["Coerver Moves Circuit", "Wall Pass Combinations"],
        },
        {
          name: "Technical Block 2",
          type: "technical",
          durationMinutes: 12,
          description: "Progress skill into game-like pressure",
          activitySuggestions: ["Receiving Under Pressure", "1v1 to Goal"],
        },
        {
          name: "Possession Game",
          type: "tactical",
          durationMinutes: 10,
          description: "Keep ball in tight spaces",
          activitySuggestions: ["3v1 Rondo", "4v2 Rondo"],
        },
        {
          name: "Small-Sided Game",
          type: "game",
          durationMinutes: 25,
          description: "Application in game environment",
          activitySuggestions: ["4v4 to Small Goals", "5v5 with specific focus"],
        },
        {
          name: "Cool Down",
          type: "cooldown",
          durationMinutes: 8,
          description: "Light activity, stretching, team discussion",
          activitySuggestions: ["Passing Pairs", "Light stretching"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones (30+)", "Pinnies", "Small goals", "Full goal if available"],
      coachingNotes: `Key principles for Skill Building stage:
- Introduce basic tactics through games
- Develop both feet
- Encourage creative problem-solving
- Begin introducing competition and winning/losing
- Technical quality over speed initially
- Let them make decisions in games`,
      isDefault: true,
    },

    // Development (Ages 12-14)
    {
      sportId: soccer.id,
      stageId: developmentId,
      name: "Development: 90-Minute Complete Session",
      description: "Comprehensive session with technical, tactical, and game components. Higher intensity.",
      totalDurationMinutes: 90,
      structure: [
        {
          name: "Activation",
          type: "warmup",
          durationMinutes: 10,
          description: "Dynamic warmup with ball - athletic movements",
          activitySuggestions: ["Ball Mastery Circle", "Dynamic stretching with ball"],
        },
        {
          name: "Technical Excellence",
          type: "technical",
          durationMinutes: 15,
          description: "High-repetition skill work at pace",
          activitySuggestions: ["Coerver Moves Circuit", "First Touch Progression"],
        },
        {
          name: "Tactical Understanding",
          type: "tactical",
          durationMinutes: 15,
          description: "Position-specific or team tactical work",
          activitySuggestions: ["Wall Pass Combinations", "Positional Play"],
        },
        {
          name: "Functional Practice",
          type: "game",
          durationMinutes: 15,
          description: "Game-realistic situation with coaching",
          activitySuggestions: ["1v1 to Goal", "2v2 with GK", "Crossing and finishing"],
        },
        {
          name: "Phase of Play",
          type: "scrimmage",
          durationMinutes: 15,
          description: "Larger game with specific focus",
          activitySuggestions: ["7v7 with objectives", "Attack vs Defense"],
        },
        {
          name: "Full Game",
          type: "scrimmage",
          durationMinutes: 15,
          description: "Free play scrimmage - minimal intervention",
          activitySuggestions: ["Full field game", "Scrimmage"],
        },
        {
          name: "Recovery",
          type: "cooldown",
          durationMinutes: 5,
          description: "Cool down, stretch, team meeting",
          activitySuggestions: ["Light jogging", "Static stretching"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones (40+)", "Pinnies", "Full goals", "Training poles"],
      coachingNotes: `Key principles for Development stage:
- Increase intensity and competition
- Develop tactical understanding
- Introduce sport-specific fitness
- Encourage leadership and communication
- Allow players to problem-solve
- Quality and speed together
- Begin specialization discussions`,
      isDefault: true,
    },

    // === BASKETBALL TEMPLATES ===
    // Fundamentals (Ages 6-8)
    {
      sportId: basketball.id,
      stageId: fundamentalsId,
      name: "Fundamentals: 60-Minute Skills & Fun",
      description: "Foundation basketball session emphasizing ball handling, fun activities, and positive experiences.",
      totalDurationMinutes: 60,
      structure: [
        {
          name: "Arrival Activity",
          type: "warmup",
          durationMinutes: 5,
          description: "Free shooting or dribbling as players arrive",
          activitySuggestions: ["Free play", "Shooting practice"],
        },
        {
          name: "Warmup Game",
          type: "warmup",
          durationMinutes: 7,
          description: "Active game to engage and prepare",
          activitySuggestions: ["Dribble Tag", "Relay races"],
        },
        {
          name: "Ball Handling",
          type: "technical",
          durationMinutes: 10,
          description: "Stationary and moving ball handling",
          activitySuggestions: ["Ball Handling Circuit", "Dribble moves"],
        },
        {
          name: "Shooting",
          type: "technical",
          durationMinutes: 10,
          description: "Form shooting and layups",
          activitySuggestions: ["Form Shooting Progression", "Layup Lines"],
        },
        {
          name: "Fun Competition",
          type: "game",
          durationMinutes: 8,
          description: "Competitive shooting or dribbling game",
          activitySuggestions: ["Knockout", "Dribble Relay"],
        },
        {
          name: "Small-Sided Game",
          type: "game",
          durationMinutes: 15,
          description: "Modified game with small teams",
          activitySuggestions: ["3v3 Half Court", "2v2"],
        },
        {
          name: "Team Cheer",
          type: "cooldown",
          durationMinutes: 5,
          description: "Bring it in, celebrate, discuss next practice",
          activitySuggestions: [],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones", "Pinnies"],
      coachingNotes: `Key principles for young basketball:
- Adjust basket height if possible
- Use smaller balls if available
- Celebrate effort and improvement
- Make it fun - lots of games
- Focus on ball handling and footwork
- Minimize standing in lines`,
      isDefault: true,
    },

    // Skill Building (Ages 9-11)
    {
      sportId: basketball.id,
      stageId: skillBuildingId,
      name: "Skill Building: 75-Minute Complete Practice",
      description: "Comprehensive practice developing individual skills and team concepts.",
      totalDurationMinutes: 75,
      structure: [
        {
          name: "Dynamic Warmup",
          type: "warmup",
          durationMinutes: 6,
          description: "Athletic movement preparation",
          activitySuggestions: ["Dynamic Stretching Lines", "Ball handling while moving"],
        },
        {
          name: "Ball Handling",
          type: "technical",
          durationMinutes: 10,
          description: "Stationary and moving drills",
          activitySuggestions: ["Ball Handling Circuit", "Cone Dribbling Course"],
        },
        {
          name: "Shooting",
          type: "technical",
          durationMinutes: 12,
          description: "Form shooting and game shots",
          activitySuggestions: ["Form Shooting Progression", "Spot shooting"],
        },
        {
          name: "Skill Application",
          type: "tactical",
          durationMinutes: 10,
          description: "Skills in game-like situations",
          activitySuggestions: ["Triple Threat Moves", "1v1 From Wing"],
        },
        {
          name: "Team Concept",
          type: "tactical",
          durationMinutes: 10,
          description: "Basic offensive or defensive concept",
          activitySuggestions: ["Give and Go Game", "Shell Defense"],
        },
        {
          name: "Competitive Game",
          type: "game",
          durationMinutes: 20,
          description: "Small-sided or full game",
          activitySuggestions: ["3v3 Half Court", "5v5 Controlled Scrimmage"],
        },
        {
          name: "Cool Down",
          type: "cooldown",
          durationMinutes: 7,
          description: "Free throws, stretch, team meeting",
          activitySuggestions: ["Free throw contest", "Partner Passing"],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones", "Pinnies"],
      coachingNotes: `Key principles for Skill Building:
- Develop both hands
- Introduce team concepts simply
- Competition is okay - learn to win and lose
- Emphasize fundamentals under pressure
- Basketball IQ through questioning
- Let them make decisions in games`,
      isDefault: true,
    },

    // Development (Ages 12-14)
    {
      sportId: basketball.id,
      stageId: developmentId,
      name: "Development: 90-Minute Intensive Practice",
      description: "High-intensity practice with technical, tactical, and conditioning components.",
      totalDurationMinutes: 90,
      structure: [
        {
          name: "Pre-Practice Shooting",
          type: "warmup",
          durationMinutes: 5,
          description: "Players shoot individually as they arrive",
          activitySuggestions: ["Form shooting"],
        },
        {
          name: "Dynamic Warmup",
          type: "warmup",
          durationMinutes: 8,
          description: "Athletic movement with basketball movements",
          activitySuggestions: ["Dynamic Stretching Lines", "Defensive slides"],
        },
        {
          name: "Skill Development",
          type: "technical",
          durationMinutes: 15,
          description: "Intensive individual skill work",
          activitySuggestions: ["Ball Handling Circuit", "Cone Dribbling Course", "Advanced moves"],
        },
        {
          name: "Shooting",
          type: "technical",
          durationMinutes: 12,
          description: "Game-specific shooting",
          activitySuggestions: ["Catch and shoot", "Off-dribble shots"],
        },
        {
          name: "Competitive Drill",
          type: "game",
          durationMinutes: 10,
          description: "1v1, 2v2, or 3v3 competition",
          activitySuggestions: ["1v1 From Wing", "3v3 Half Court"],
        },
        {
          name: "Team Offense/Defense",
          type: "tactical",
          durationMinutes: 15,
          description: "Team concept installation or review",
          activitySuggestions: ["Shell Defense", "Motion offense", "Set plays"],
        },
        {
          name: "Scrimmage",
          type: "scrimmage",
          durationMinutes: 18,
          description: "Full court 5v5 with teaching points",
          activitySuggestions: ["5v5 Controlled Scrimmage"],
        },
        {
          name: "Conditioning & Free Throws",
          type: "conditioning",
          durationMinutes: 5,
          description: "Sprint work or conditioning games",
          activitySuggestions: ["Suicide sprints", "17s"],
        },
        {
          name: "Cool Down",
          type: "cooldown",
          durationMinutes: 2,
          description: "Quick team meeting",
          activitySuggestions: [],
        },
      ],
      equipmentNeeded: ["1 ball per player", "Cones", "Pinnies"],
      coachingNotes: `Key principles for Development:
- Higher intensity and pace
- Introduce sport-specific conditioning
- Develop basketball IQ
- Allow competition - stakes matter
- Position-specific development begins
- Video review when possible
- Leadership development`,
      isDefault: true,
    },
  ];

  // Insert templates
  for (const template of templates) {
    try {
      await getDb().insert(practiceTemplates).values(template).onConflictDoNothing();
      console.log(`  ✓ ${template.name}`);
    } catch (error) {
      console.error(`  ✗ Error inserting ${template.name}:`, error);
    }
  }

  console.log(`Seeded ${templates.length} practice templates`);
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedPracticeTemplates()
    .then(() => {
      console.log("Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

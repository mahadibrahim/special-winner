import { getDb } from "./index";
import { programs, seasons } from "./schema/programs";
import { sports, ageGroups } from "./schema/sports";
import { locations } from "./schema/organizations";
import { eq } from "drizzle-orm";

async function seedPrograms() {
  console.log("🏆 Seeding programs and seasons...");

  // Get existing data
  const [location] = await getDb().select().from(locations).limit(1);
  const allSports = await getDb().select().from(sports);
  const allAgeGroups = await getDb().select().from(ageGroups);

  if (!location) {
    console.error("❌ No location found. Run db:seed first.");
    process.exit(1);
  }

  if (allSports.length === 0) {
    console.error("❌ No sports found. Run db:seed first.");
    process.exit(1);
  }

  const soccerSport = allSports.find((s) => s.slug === "soccer");
  const basketballSport = allSports.find((s) => s.slug === "basketball");
  const baseballSport = allSports.find((s) => s.slug === "baseball");
  const footballSport = allSports.find((s) => s.slug === "football");

  const u6 = allAgeGroups.find((a) => a.name === "U6");
  const u8 = allAgeGroups.find((a) => a.name === "U8");
  const u10 = allAgeGroups.find((a) => a.name === "U10");
  const u12 = allAgeGroups.find((a) => a.name === "U12");

  console.log("Creating programs...");

  // Soccer Programs
  const [soccerLeague] = await getDb()
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: soccerSport!.id,
      name: "Youth Soccer League",
      slug: "youth-soccer-league",
      description:
        "Our flagship youth soccer program focusing on skill development, teamwork, and fun. Players learn fundamentals through age-appropriate training and competitive matches.",
      programType: "league",
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  const [soccerCamp] = await getDb()
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: soccerSport!.id,
      name: "Summer Soccer Camp",
      slug: "summer-soccer-camp",
      description:
        "Intensive week-long camp for players looking to take their game to the next level. Daily training sessions with professional coaches.",
      programType: "camp",
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  // Basketball Programs
  const [basketballLeague] = await getDb()
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: basketballSport!.id,
      name: "Youth Basketball League",
      slug: "youth-basketball-league",
      description:
        "Competitive basketball league with weekly games and practices. Focus on fundamentals, teamwork, and sportsmanship.",
      programType: "league",
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  const [basketballClinic] = await getDb()
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: basketballSport!.id,
      name: "Basketball Skills Clinic",
      slug: "basketball-skills-clinic",
      description:
        "Weekend clinics focusing on specific skills like shooting, ball handling, and defense. Perfect for players wanting extra training.",
      programType: "clinic",
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  // Baseball Program
  const [baseballLeague] = await getDb()
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: baseballSport!.id,
      name: "Spring Baseball League",
      slug: "spring-baseball-league",
      description:
        "Traditional spring baseball with emphasis on fundamentals, fair play, and player development at all skill levels.",
      programType: "league",
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  // Flag Football Program
  const [flagFootball] = await getDb()
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: footballSport!.id,
      name: "Flag Football League",
      slug: "flag-football-league",
      description:
        "Safe, non-contact flag football introducing kids to the fundamentals of football in a fun, inclusive environment.",
      programType: "league",
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  console.log("Creating seasons...");

  // Current date for season calculations
  const now = new Date();
  const currentYear = now.getFullYear();

  // Helper to create date strings
  const dateStr = (month: number, day: number, year = currentYear) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Soccer League Seasons (Spring 2025)
  if (soccerLeague) {
    await getDb()
      .insert(seasons)
      .values([
        {
          programId: soccerLeague.id,
          ageGroupId: u6?.id,
          name: "Spring 2025 - U6",
          slug: "spring-2025-u6",
          startDate: dateStr(3, 15, 2025),
          endDate: dateStr(5, 31, 2025),
          registrationOpens: new Date("2025-01-15T00:00:00Z"),
          registrationCloses: new Date("2025-03-10T23:59:59Z"),
          earlyBirdDeadline: new Date("2025-02-15T23:59:59Z"),
          maxParticipants: 48,
          minParticipants: 16,
          priceCents: 15000, // $150
          earlyBirdPriceCents: 12500, // $125
          depositCents: 5000, // $50
          allowDeposit: true,
          status: "open",
          scheduleNotes: "Saturdays 9:00-10:00 AM",
        },
        {
          programId: soccerLeague.id,
          ageGroupId: u8?.id,
          name: "Spring 2025 - U8",
          slug: "spring-2025-u8",
          startDate: dateStr(3, 15, 2025),
          endDate: dateStr(5, 31, 2025),
          registrationOpens: new Date("2025-01-15T00:00:00Z"),
          registrationCloses: new Date("2025-03-10T23:59:59Z"),
          earlyBirdDeadline: new Date("2025-02-15T23:59:59Z"),
          maxParticipants: 64,
          minParticipants: 24,
          priceCents: 17500, // $175
          earlyBirdPriceCents: 15000, // $150
          depositCents: 5000,
          allowDeposit: true,
          status: "open",
          scheduleNotes: "Saturdays 10:30-11:45 AM",
        },
        {
          programId: soccerLeague.id,
          ageGroupId: u10?.id,
          name: "Spring 2025 - U10",
          slug: "spring-2025-u10",
          startDate: dateStr(3, 15, 2025),
          endDate: dateStr(5, 31, 2025),
          registrationOpens: new Date("2025-01-15T00:00:00Z"),
          registrationCloses: new Date("2025-03-10T23:59:59Z"),
          maxParticipants: 72,
          minParticipants: 24,
          priceCents: 19500, // $195
          depositCents: 7500,
          allowDeposit: true,
          status: "open",
          scheduleNotes: "Saturdays 12:00-1:30 PM",
        },
      ])
      .onConflictDoNothing();
  }

  // Soccer Camp Seasons (Summer 2025)
  if (soccerCamp) {
    await getDb()
      .insert(seasons)
      .values([
        {
          programId: soccerCamp.id,
          ageGroupId: u8?.id,
          name: "Summer Camp Week 1",
          slug: "summer-camp-week-1",
          startDate: dateStr(6, 16, 2025),
          endDate: dateStr(6, 20, 2025),
          registrationOpens: new Date("2025-03-01T00:00:00Z"),
          registrationCloses: new Date("2025-06-10T23:59:59Z"),
          maxParticipants: 30,
          minParticipants: 10,
          priceCents: 29900, // $299
          earlyBirdPriceCents: 24900, // $249
          earlyBirdDeadline: new Date("2025-05-01T23:59:59Z"),
          depositCents: 10000,
          allowDeposit: true,
          status: "open",
          scheduleNotes: "Monday-Friday 9:00 AM - 3:00 PM",
        },
        {
          programId: soccerCamp.id,
          ageGroupId: u10?.id,
          name: "Summer Camp Week 2",
          slug: "summer-camp-week-2",
          startDate: dateStr(6, 23, 2025),
          endDate: dateStr(6, 27, 2025),
          registrationOpens: new Date("2025-03-01T00:00:00Z"),
          registrationCloses: new Date("2025-06-17T23:59:59Z"),
          maxParticipants: 30,
          minParticipants: 10,
          priceCents: 29900,
          earlyBirdPriceCents: 24900,
          earlyBirdDeadline: new Date("2025-05-01T23:59:59Z"),
          depositCents: 10000,
          allowDeposit: true,
          status: "open",
          scheduleNotes: "Monday-Friday 9:00 AM - 3:00 PM",
        },
      ])
      .onConflictDoNothing();
  }

  // Basketball League Seasons
  if (basketballLeague) {
    await getDb()
      .insert(seasons)
      .values([
        {
          programId: basketballLeague.id,
          ageGroupId: u8?.id,
          name: "Winter 2025 - U8",
          slug: "winter-2025-u8",
          startDate: dateStr(1, 6, 2025),
          endDate: dateStr(3, 15, 2025),
          registrationOpens: new Date("2024-11-01T00:00:00Z"),
          registrationCloses: new Date("2025-01-03T23:59:59Z"),
          maxParticipants: 48,
          minParticipants: 16,
          priceCents: 16500, // $165
          depositCents: 5000,
          allowDeposit: true,
          status: "active",
          scheduleNotes: "Saturdays 9:00-10:30 AM at Community Center",
        },
        {
          programId: basketballLeague.id,
          ageGroupId: u10?.id,
          name: "Winter 2025 - U10",
          slug: "winter-2025-u10",
          startDate: dateStr(1, 6, 2025),
          endDate: dateStr(3, 15, 2025),
          registrationOpens: new Date("2024-11-01T00:00:00Z"),
          registrationCloses: new Date("2025-01-03T23:59:59Z"),
          maxParticipants: 60,
          minParticipants: 20,
          priceCents: 18500, // $185
          depositCents: 7500,
          allowDeposit: true,
          status: "active",
          scheduleNotes: "Saturdays 11:00 AM - 12:30 PM at Community Center",
        },
        {
          programId: basketballLeague.id,
          ageGroupId: u12?.id,
          name: "Winter 2025 - U12",
          slug: "winter-2025-u12",
          startDate: dateStr(1, 6, 2025),
          endDate: dateStr(3, 15, 2025),
          registrationOpens: new Date("2024-11-01T00:00:00Z"),
          registrationCloses: new Date("2025-01-03T23:59:59Z"),
          maxParticipants: 60,
          minParticipants: 20,
          priceCents: 19500, // $195
          depositCents: 7500,
          allowDeposit: true,
          status: "active",
          scheduleNotes: "Saturdays 1:00-2:30 PM at Community Center",
        },
      ])
      .onConflictDoNothing();
  }

  // Basketball Clinic
  if (basketballClinic) {
    await getDb()
      .insert(seasons)
      .values({
        programId: basketballClinic.id,
        ageGroupId: u10?.id,
        name: "Shooting Clinic - February",
        slug: "shooting-clinic-february",
        startDate: dateStr(2, 8, 2025),
        endDate: dateStr(2, 8, 2025),
        registrationOpens: new Date("2025-01-15T00:00:00Z"),
        registrationCloses: new Date("2025-02-06T23:59:59Z"),
        maxParticipants: 20,
        minParticipants: 8,
        priceCents: 4500, // $45
        allowDeposit: false,
        status: "open",
        scheduleNotes: "Saturday 2:00-4:00 PM",
      })
      .onConflictDoNothing();
  }

  // Baseball League
  if (baseballLeague) {
    await getDb()
      .insert(seasons)
      .values([
        {
          programId: baseballLeague.id,
          ageGroupId: u8?.id,
          name: "Spring 2025 - T-Ball",
          slug: "spring-2025-tball",
          startDate: dateStr(4, 5, 2025),
          endDate: dateStr(6, 14, 2025),
          registrationOpens: new Date("2025-02-01T00:00:00Z"),
          registrationCloses: new Date("2025-03-28T23:59:59Z"),
          earlyBirdDeadline: new Date("2025-03-01T23:59:59Z"),
          maxParticipants: 48,
          minParticipants: 20,
          priceCents: 14500, // $145
          earlyBirdPriceCents: 12500, // $125
          depositCents: 5000,
          allowDeposit: true,
          status: "open",
          scheduleNotes: "Saturdays 9:00-10:00 AM",
        },
        {
          programId: baseballLeague.id,
          ageGroupId: u10?.id,
          name: "Spring 2025 - Coach Pitch",
          slug: "spring-2025-coach-pitch",
          startDate: dateStr(4, 5, 2025),
          endDate: dateStr(6, 14, 2025),
          registrationOpens: new Date("2025-02-01T00:00:00Z"),
          registrationCloses: new Date("2025-03-28T23:59:59Z"),
          earlyBirdDeadline: new Date("2025-03-01T23:59:59Z"),
          maxParticipants: 60,
          minParticipants: 24,
          priceCents: 16500, // $165
          earlyBirdPriceCents: 14500, // $145
          depositCents: 5000,
          allowDeposit: true,
          status: "open",
          scheduleNotes: "Saturdays 10:30 AM - 12:00 PM",
        },
      ])
      .onConflictDoNothing();
  }

  // Flag Football
  if (flagFootball) {
    await getDb()
      .insert(seasons)
      .values([
        {
          programId: flagFootball.id,
          ageGroupId: u6?.id,
          name: "Fall 2025 - Rookie",
          slug: "fall-2025-rookie",
          startDate: dateStr(9, 6, 2025),
          endDate: dateStr(11, 8, 2025),
          registrationOpens: new Date("2025-07-01T00:00:00Z"),
          registrationCloses: new Date("2025-08-30T23:59:59Z"),
          earlyBirdDeadline: new Date("2025-08-01T23:59:59Z"),
          maxParticipants: 40,
          minParticipants: 16,
          priceCents: 13500, // $135
          earlyBirdPriceCents: 11500, // $115
          depositCents: 5000,
          allowDeposit: true,
          status: "draft",
          scheduleNotes: "Saturdays 9:00-10:00 AM",
        },
        {
          programId: flagFootball.id,
          ageGroupId: u8?.id,
          name: "Fall 2025 - Junior",
          slug: "fall-2025-junior",
          startDate: dateStr(9, 6, 2025),
          endDate: dateStr(11, 8, 2025),
          registrationOpens: new Date("2025-07-01T00:00:00Z"),
          registrationCloses: new Date("2025-08-30T23:59:59Z"),
          earlyBirdDeadline: new Date("2025-08-01T23:59:59Z"),
          maxParticipants: 48,
          minParticipants: 20,
          priceCents: 14500, // $145
          earlyBirdPriceCents: 12500, // $125
          depositCents: 5000,
          allowDeposit: true,
          status: "draft",
          scheduleNotes: "Saturdays 10:30-11:45 AM",
        },
      ])
      .onConflictDoNothing();
  }

  // Get counts for summary
  const programCount = await getDb().select().from(programs);
  const seasonCount = await getDb().select().from(seasons);

  console.log("✅ Sample programs and seasons created!");
  console.log("");
  console.log(`📊 Summary:`);
  console.log(`   Programs: ${programCount.length}`);
  console.log(`   Seasons: ${seasonCount.length}`);
  console.log("");
  console.log("🏈 Programs created:");
  console.log("   - Youth Soccer League (3 seasons)");
  console.log("   - Summer Soccer Camp (2 weeks)");
  console.log("   - Youth Basketball League (3 seasons)");
  console.log("   - Basketball Skills Clinic (1 clinic)");
  console.log("   - Spring Baseball League (2 seasons)");
  console.log("   - Flag Football League (2 seasons)");
}

seedPrograms()
  .catch((error) => {
    console.error("❌ Failed to seed programs:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

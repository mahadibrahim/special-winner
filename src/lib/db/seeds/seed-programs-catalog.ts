/**
 * Seed realistic programs catalog
 *
 * Creates a convincing set of seasons across sports, age groups,
 * and price points so the "Find Your Program" section feels alive.
 *
 * Run with: npx tsx src/lib/db/seeds/seed-programs-catalog.ts
 */
import "dotenv/config";
import { getDb } from "../index";
import {
  organizations,
  locations,
  sports,
  programs,
  seasons,
  ageGroups,
} from "../schema";
import { eq } from "drizzle-orm";

async function seedProgramsCatalog() {
  console.log("🏟️  Seeding programs catalog...\n");
  const db = getDb();

  // Get org and location
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .limit(1);
  if (!org) throw new Error("Run seed.ts first");

  const [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, org.id))
    .limit(1);
  if (!location) throw new Error("No location found");

  // Get sports
  const allSports = await db
    .select()
    .from(sports)
    .where(eq(sports.organizationId, org.id));
  const sportMap = Object.fromEntries(allSports.map((s) => [s.slug, s]));
  console.log(`   Found ${allSports.length} sports: ${allSports.map((s) => s.name).join(", ")}`);

  // Get age groups
  const allAgeGroups = await db.select().from(ageGroups);
  const agMap = Object.fromEntries(allAgeGroups.map((a) => [a.name, a]));
  console.log(`   Found ${allAgeGroups.length} age groups: ${allAgeGroups.map((a) => a.name).join(", ")}\n`);

  // Create programs if they don't exist
  const programDefs = [
    { name: "Youth Soccer League", slug: "youth-soccer-league", sportSlug: "soccer", type: "league" as const },
    { name: "Soccer Skills Camp", slug: "soccer-skills-camp", sportSlug: "soccer", type: "camp" as const },
    { name: "Youth Basketball League", slug: "youth-basketball-league", sportSlug: "basketball", type: "league" as const },
    { name: "Basketball Skills Clinic", slug: "basketball-skills-clinic", sportSlug: "basketball", type: "clinic" as const },
    { name: "Youth Baseball League", slug: "youth-baseball-league", sportSlug: "baseball", type: "league" as const },
    { name: "T-Ball Introduction", slug: "t-ball-intro", sportSlug: "baseball", type: "clinic" as const },
    { name: "Flag Football League", slug: "flag-football-league", sportSlug: "football", type: "league" as const },
  ];

  const programIds: Record<string, string> = {};
  for (const def of programDefs) {
    const sport = sportMap[def.sportSlug];
    if (!sport) {
      console.log(`   ⚠ Skipping ${def.name} — sport "${def.sportSlug}" not found`);
      continue;
    }

    const [existing] = await db
      .select()
      .from(programs)
      .where(eq(programs.slug, def.slug))
      .limit(1);

    if (existing) {
      programIds[def.slug] = existing.id;
      console.log(`   ✓ Program exists: ${def.name}`);
    } else {
      const [created] = await db
        .insert(programs)
        .values({
          locationId: location.id,
          sportId: sport.id,
          name: def.name,
          slug: def.slug,
          description: `${def.name} at ${location.name}`,
          programType: def.type,
          active: true,
        })
        .returning();
      programIds[def.slug] = created.id;
      console.log(`   + Created program: ${def.name}`);
    }
  }

  // Create seasons — the real catalog parents will browse
  const now = new Date();
  const summer2026Start = new Date("2026-06-01");
  const summer2026End = new Date("2026-08-15");
  const fall2026Start = new Date("2026-09-06");
  const fall2026End = new Date("2026-12-13");
  const regOpen = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
  const regClose = new Date(summer2026Start.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week before start

  const seasonDefs = [
    // Soccer
    {
      programSlug: "youth-soccer-league",
      name: "U6 Soccer — Summer 2026",
      slug: "u6-soccer-summer-2026",
      ageGroup: "U6",
      startDate: summer2026Start,
      endDate: summer2026End,
      priceCents: 12500,
      depositCents: 2500,
      maxParticipants: 40,
      scheduleNotes: "Saturdays 9:00–10:00am",
    },
    {
      programSlug: "youth-soccer-league",
      name: "U8 Soccer — Summer 2026",
      slug: "u8-soccer-summer-2026",
      ageGroup: "U8",
      startDate: summer2026Start,
      endDate: summer2026End,
      priceCents: 15000,
      depositCents: 3000,
      maxParticipants: 50,
      scheduleNotes: "Saturdays 10:15–11:30am",
    },
    {
      programSlug: "youth-soccer-league",
      name: "U10 Soccer — Fall 2026",
      slug: "u10-soccer-fall-2026",
      ageGroup: "U10",
      startDate: fall2026Start,
      endDate: fall2026End,
      priceCents: 17500,
      depositCents: 3500,
      maxParticipants: 48,
      scheduleNotes: "Wednesdays 5:30–7:00pm",
    },
    {
      programSlug: "soccer-skills-camp",
      name: "Summer Soccer Camp — Week 1",
      slug: "soccer-camp-week1-2026",
      ageGroup: "U10",
      startDate: new Date("2026-06-15"),
      endDate: new Date("2026-06-19"),
      priceCents: 22500,
      depositCents: 5000,
      maxParticipants: 30,
      scheduleNotes: "Mon–Fri 9:00am–12:00pm",
    },
    // Basketball
    {
      programSlug: "youth-basketball-league",
      name: "U8 Basketball — Summer 2026",
      slug: "u8-basketball-summer-2026",
      ageGroup: "U8",
      startDate: summer2026Start,
      endDate: summer2026End,
      priceCents: 16000,
      depositCents: 3000,
      maxParticipants: 36,
      scheduleNotes: "Tuesdays & Thursdays 5:00–6:15pm",
    },
    {
      programSlug: "youth-basketball-league",
      name: "U12 Basketball — Fall 2026",
      slug: "u12-basketball-fall-2026",
      ageGroup: "U12",
      startDate: fall2026Start,
      endDate: fall2026End,
      priceCents: 19500,
      depositCents: 4000,
      maxParticipants: 40,
      scheduleNotes: "Mondays & Wednesdays 6:00–7:30pm",
    },
    {
      programSlug: "basketball-skills-clinic",
      name: "Basketball Shooting Clinic",
      slug: "basketball-shooting-clinic-2026",
      ageGroup: "U10",
      startDate: new Date("2026-07-11"),
      endDate: new Date("2026-07-12"),
      priceCents: 7500,
      depositCents: null,
      maxParticipants: 24,
      scheduleNotes: "Sat & Sun 10:00am–1:00pm",
    },
    // Baseball
    {
      programSlug: "youth-baseball-league",
      name: "U10 Baseball — Summer 2026",
      slug: "u10-baseball-summer-2026",
      ageGroup: "U10",
      startDate: summer2026Start,
      endDate: summer2026End,
      priceCents: 17500,
      depositCents: 3500,
      maxParticipants: 44,
      scheduleNotes: "Tuesdays & Thursdays 6:00–7:30pm",
    },
    {
      programSlug: "t-ball-intro",
      name: "T-Ball Introduction — Summer 2026",
      slug: "t-ball-intro-summer-2026",
      ageGroup: "U6",
      startDate: summer2026Start,
      endDate: new Date("2026-07-31"),
      priceCents: 9500,
      depositCents: 2000,
      maxParticipants: 32,
      scheduleNotes: "Saturdays 9:00–10:00am",
    },
    // Football
    {
      programSlug: "flag-football-league",
      name: "Flag Football — Fall 2026",
      slug: "flag-football-fall-2026",
      ageGroup: "U10",
      startDate: fall2026Start,
      endDate: fall2026End,
      priceCents: 16500,
      depositCents: 3000,
      maxParticipants: 48,
      scheduleNotes: "Saturdays 11:00am–12:30pm",
    },
  ];

  let created = 0;
  let skipped = 0;
  for (const def of seasonDefs) {
    const programId = programIds[def.programSlug];
    if (!programId) {
      console.log(`   ⚠ Skipping season "${def.name}" — program not found`);
      skipped++;
      continue;
    }

    const ag = agMap[def.ageGroup];

    // Check if already exists
    const [existing] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.slug, def.slug))
      .limit(1);

    if (existing) {
      console.log(`   ✓ Season exists: ${def.name}`);
      skipped++;
      continue;
    }

    await db.insert(seasons).values({
      programId,
      ageGroupId: ag?.id || null,
      name: def.name,
      slug: def.slug,
      startDate: def.startDate.toISOString().split("T")[0],
      endDate: def.endDate.toISOString().split("T")[0],
      registrationOpens: regOpen,
      registrationCloses: regClose,
      priceCents: def.priceCents,
      depositCents: def.depositCents,
      allowDeposit: def.depositCents !== null,
      maxParticipants: def.maxParticipants,
      status: "open",
      scheduleNotes: def.scheduleNotes,
    });
    console.log(`   + Created season: ${def.name} — $${def.priceCents / 100}`);
    created++;
  }

  console.log(`\n✅ Programs catalog seeded: ${created} new seasons, ${skipped} existing/skipped`);
}

seedProgramsCatalog()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });

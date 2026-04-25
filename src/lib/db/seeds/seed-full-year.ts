/**
 * Seed a Full Year of Realistic Operations
 *
 * Creates 12 months of realistic data for testing reports, payments,
 * registrations, games, attendance, and all admin features.
 *
 * Timeline: Fall 2025 → Summer 2026 (past + current + future)
 *
 * Run with: npx tsx src/lib/db/seeds/seed-full-year.ts
 */
import "dotenv/config";
import { getDb } from "../index";
import {
  organizations, locations, sports, programs, seasons, ageGroups,
  users, roles, userRoles, familyMembers,
  registrations, payments, teams, rosters, games, standings,
  attendance, venues, coachNotes,
} from "../schema";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "../../auth/password";

// Helpers
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFrom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const dateStr = (d: Date) => d.toISOString().split("T")[0];
const uuid = () => crypto.randomUUID();

// First & last names for generating realistic family data
const firstNames = {
  parents: ["Sarah", "Michael", "Jennifer", "David", "Emily", "James", "Jessica", "Robert", "Amanda", "William", "Ashley", "Christopher", "Stephanie", "Matthew", "Nicole", "Daniel", "Elizabeth", "Andrew", "Megan", "Joshua"],
  boys: ["Ethan", "Liam", "Noah", "Lucas", "Mason", "Oliver", "Aiden", "Elijah", "Logan", "Carter", "Jackson", "Sebastian", "Jack", "Owen", "Henry", "Alexander", "Jayden", "Dylan", "Gabriel", "Ryan"],
  girls: ["Emma", "Olivia", "Ava", "Sophia", "Isabella", "Mia", "Charlotte", "Harper", "Evelyn", "Abigail", "Ella", "Scarlett", "Grace", "Chloe", "Lily", "Aria", "Zoey", "Riley", "Layla", "Nora"],
};
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White", "Harris", "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright", "Hill", "Scott", "Adams"];

async function seedFullYear() {
  console.log("📅 Seeding a full year of realistic data...\n");
  const db = getDb();

  // Get existing org, location, sports, age groups
  const [org] = await db.select().from(organizations).limit(1);
  if (!org) throw new Error("Run seed.ts and seed-e2e-tests.ts first");

  const [location] = await db.select().from(locations).where(eq(locations.organizationId, org.id)).limit(1);
  const allSports = await db.select().from(sports).where(eq(sports.organizationId, org.id));
  const sportMap = Object.fromEntries(allSports.map(s => [s.slug, s]));
  const allAgeGroups = await db.select().from(ageGroups);
  const agMap = Object.fromEntries(allAgeGroups.map(a => [a.name, a]));
  const allRoles = await db.select().from(roles);
  const roleMap = Object.fromEntries(allRoles.map(r => [r.name, r]));

  // Get or create venue
  let [venue] = await db.select().from(venues).limit(1);
  if (!venue) {
    [venue] = await db.insert(venues).values({
      locationId: location.id,
      name: "Powell Sports Complex",
      addressLine1: "123 Main St",
      city: "Powell",
      state: "OH",
      zipCode: "43065",
      fieldCount: 6,
      surfaceType: "outdoor",
      active: true,
    }).returning();
  }

  console.log(`   Org: ${org.name}, Location: ${location.name}`);
  console.log(`   Sports: ${allSports.map(s => s.name).join(", ")}`);
  console.log(`   Venue: ${venue.name}\n`);

  // ──────────────────────────────────────────────
  // Step 1: Create 30 parent accounts with children
  // ──────────────────────────────────────────────
  console.log("1. Creating parent accounts and families...");
  const parentUsers: any[] = [];
  const allChildren: any[] = [];
  const pwHash = await hashPassword("TestParent123!");

  for (let i = 0; i < 30; i++) {
    const firstName = firstNames.parents[i % firstNames.parents.length];
    const lastName = lastNames[i];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;

    // Check if exists
    let [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!existing) {
      [existing] = await db.insert(users).values({
        email,
        firstName,
        lastName,
        passwordHash: pwHash,
        emailVerified: true,
      }).returning();

      await db.insert(userRoles).values({
        userId: existing.id,
        roleId: roleMap.parent.id,
      }).onConflictDoNothing();
    }
    parentUsers.push(existing);

    // Create 1-3 children per parent
    const numChildren = randomInt(1, 3);
    for (let c = 0; c < numChildren; c++) {
      const isBoy = Math.random() > 0.5;
      const childFirst = isBoy
        ? firstNames.boys[randomInt(0, firstNames.boys.length - 1)]
        : firstNames.girls[randomInt(0, firstNames.girls.length - 1)];
      const age = randomInt(4, 14);
      const birthDate = new Date(2026 - age, randomInt(0, 11), randomInt(1, 28));

      let [existingChild] = await db.select().from(familyMembers)
        .where(and(
          eq(familyMembers.parentUserId, existing.id),
          eq(familyMembers.firstName, childFirst),
          eq(familyMembers.lastName, lastName),
        )).limit(1);

      if (!existingChild) {
        [existingChild] = await db.insert(familyMembers).values({
          parentUserId: existing.id,
          firstName: childFirst,
          lastName,
          birthDate: dateStr(birthDate),
          gender: isBoy ? "male" : "female",
        }).returning();
      }
      allChildren.push({ ...existingChild, parentUser: existing, age });
    }
  }
  console.log(`   ✓ ${parentUsers.length} parents, ${allChildren.length} children\n`);

  // ──────────────────────────────────────────────
  // Step 2: Create 3 coach accounts
  // ──────────────────────────────────────────────
  console.log("2. Creating coach accounts...");
  const coachData = [
    { first: "Mike", last: "Reynolds", email: "mike.reynolds@aspiresports.com" },
    { first: "Sarah", last: "Chen", email: "sarah.chen@aspiresports.com" },
    { first: "Tom", last: "Garcia", email: "tom.garcia@aspiresports.com" },
  ];
  const coachUsers: any[] = [];
  const coachPwHash = await hashPassword("TestCoach123!");

  for (const c of coachData) {
    let [existing] = await db.select().from(users).where(eq(users.email, c.email)).limit(1);
    if (!existing) {
      [existing] = await db.insert(users).values({
        email: c.email,
        firstName: c.first,
        lastName: c.last,
        passwordHash: coachPwHash,
        emailVerified: true,
      }).returning();
      await db.insert(userRoles).values({
        userId: existing.id,
        roleId: roleMap.coach.id,
      }).onConflictDoNothing();
    }
    coachUsers.push(existing);
  }
  console.log(`   ✓ ${coachUsers.length} coaches\n`);

  // ──────────────────────────────────────────────
  // Step 3: Create completed Fall 2025 season
  // ──────────────────────────────────────────────
  console.log("3. Creating Fall 2025 season (completed)...");

  // Get or create the soccer league program
  let [soccerLeague] = await db.select().from(programs)
    .where(eq(programs.slug, "youth-soccer-league")).limit(1);
  if (!soccerLeague) {
    [soccerLeague] = await db.insert(programs).values({
      organizationId: org.id,
      locationId: location.id,
      sportId: sportMap.soccer.id,
      name: "Youth Soccer League",
      slug: "youth-soccer-league",
      description: "Competitive youth soccer league",
      programType: "league",
      status: "active",
    }).returning();
  }

  const fall2025Slug = "u10-soccer-fall-2025";
  let [fall2025] = await db.select().from(seasons).where(eq(seasons.slug, fall2025Slug)).limit(1);
  if (!fall2025) {
    [fall2025] = await db.insert(seasons).values({
      programId: soccerLeague.id,
      ageGroupId: agMap.U10?.id,
      name: "U10 Soccer — Fall 2025",
      slug: fall2025Slug,
      startDate: "2025-09-06",
      endDate: "2025-12-13",
      registrationOpens: new Date("2025-07-01"),
      registrationCloses: new Date("2025-08-30"),
      priceCents: 17500,
      depositCents: 3500,
      allowDeposit: true,
      maxParticipants: 48,
      status: "completed",
      scheduleNotes: "Saturdays 10:00–11:30am",
    }).returning();
  }
  console.log(`   ✓ Season: ${fall2025.name}`);

  // Create 4 teams for Fall 2025
  const teamNames = ["Lightning", "Thunder", "Wolves", "Hawks"];
  const teamColors = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b"];
  const fall2025Teams: any[] = [];

  for (let t = 0; t < 4; t++) {
    const tSlug = `${teamNames[t].toLowerCase()}-fall-2025`;
    let [existingTeam] = await db.select().from(teams)
      .where(and(eq(teams.seasonId, fall2025.id), eq(teams.name, teamNames[t]))).limit(1);
    if (!existingTeam) {
      [existingTeam] = await db.insert(teams).values({
        seasonId: fall2025.id,
        name: teamNames[t],
        color: teamColors[t],
        coachUserId: coachUsers[t % coachUsers.length].id,
        maxRosterSize: 12,
        division: "U10 Fall League",
      }).returning();
    }
    fall2025Teams.push(existingTeam);
  }
  console.log(`   ✓ ${fall2025Teams.length} teams: ${teamNames.join(", ")}`);

  // Register children (ages 8-10) into Fall 2025 and create rosters
  const eligibleU10 = allChildren.filter(c => c.age >= 8 && c.age <= 10).slice(0, 44);
  let regCount = 0;
  const rosterEntries: any[] = [];

  for (let i = 0; i < eligibleU10.length; i++) {
    const child = eligibleU10[i];
    const team = fall2025Teams[i % 4];

    // Check if already registered
    let [existingReg] = await db.select().from(registrations)
      .where(and(
        eq(registrations.seasonId, fall2025.id),
        eq(registrations.familyMemberId, child.id),
      )).limit(1);

    if (!existingReg) {
      [existingReg] = await db.insert(registrations).values({
        seasonId: fall2025.id,
        familyMemberId: child.id,
        registeredByUserId: child.parentUser.id,
        status: "confirmed",
        paymentStatus: "paid",
        amountPaidCents: 17500,
        amountDueCents: 0,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedAt: new Date("2025-08-15"),
        waiverSignedBy: `${child.parentUser.firstName} ${child.parentUser.lastName}`,
      }).returning();

      // Create payment
      await db.insert(payments).values({
        registrationId: existingReg.id,
        userId: child.parentUser.id,
        amountCents: 17500,
        paymentType: "full",
        status: "succeeded",
        stripePaymentIntentId: `pi_test_${uuid().substring(0, 8)}`,
        createdAt: new Date("2025-08-15"),
      });
      regCount++;
    }

    // Add to roster
    let [existingRoster] = await db.select().from(rosters)
      .where(and(eq(rosters.teamId, team.id), eq(rosters.registrationId, existingReg.id))).limit(1);
    if (!existingRoster) {
      const positions = ["Forward", "Midfielder", "Defender", "Goalkeeper"];
      [existingRoster] = await db.insert(rosters).values({
        teamId: team.id,
        registrationId: existingReg.id,
        jerseyNumber: String(i + 1),
        position: positions[i % positions.length],
        status: "active",
      }).returning();
    }
    rosterEntries.push(existingRoster);
  }
  console.log(`   ✓ ${regCount} new registrations, ${rosterEntries.length} roster entries`);

  // Create games for Fall 2025 (round-robin: each team plays each other twice)
  console.log("   Creating games...");
  let gameCount = 0;
  const gameDate = new Date("2025-09-13T10:00:00");
  const matchups: [number, number][] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      matchups.push([a, b]);
      matchups.push([b, a]); // reverse for home/away
    }
  }

  for (let m = 0; m < matchups.length; m++) {
    const [home, away] = matchups[m];
    const gDate = new Date(gameDate.getTime() + m * 7 * 24 * 60 * 60 * 1000);
    const homeScore = randomInt(0, 5);
    const awayScore = randomInt(0, 5);

    const [existingGame] = await db.select().from(games)
      .where(and(
        eq(games.seasonId, fall2025.id),
        eq(games.homeTeamId, fall2025Teams[home].id),
        eq(games.awayTeamId, fall2025Teams[away].id),
      )).limit(1);

    if (!existingGame) {
      await db.insert(games).values({
        seasonId: fall2025.id,
        homeTeamId: fall2025Teams[home].id,
        awayTeamId: fall2025Teams[away].id,
        venueId: venue.id,
        fieldNumber: `Field ${randomInt(1, 4)}`,
        scheduledAt: gDate,
        durationMinutes: 60,
        status: "completed",
        homeScore,
        awayScore,
      });
      gameCount++;
    }
  }
  console.log(`   ✓ ${gameCount} games with scores`);

  // Create standings for Fall 2025
  console.log("   Computing standings...");
  const allGames = await db.select().from(games).where(eq(games.seasonId, fall2025.id));

  for (const team of fall2025Teams) {
    let wins = 0, losses = 0, ties = 0, pf = 0, pa = 0;
    for (const g of allGames) {
      if (g.homeTeamId === team.id) {
        pf += g.homeScore || 0;
        pa += g.awayScore || 0;
        if ((g.homeScore || 0) > (g.awayScore || 0)) wins++;
        else if ((g.homeScore || 0) < (g.awayScore || 0)) losses++;
        else ties++;
      } else if (g.awayTeamId === team.id) {
        pf += g.awayScore || 0;
        pa += g.homeScore || 0;
        if ((g.awayScore || 0) > (g.homeScore || 0)) wins++;
        else if ((g.awayScore || 0) < (g.homeScore || 0)) losses++;
        else ties++;
      }
    }

    await db.insert(standings).values({
      seasonId: fall2025.id,
      teamId: team.id,
      division: "U10 Fall League",
      wins, losses, ties,
      pointsFor: pf,
      pointsAgainst: pa,
      gamesPlayed: wins + losses + ties,
    }).onConflictDoNothing();
  }
  console.log(`   ✓ Standings computed`);

  // Create attendance records for Fall 2025 (practices + games)
  console.log("   Creating attendance records...");
  let attendanceCount = 0;
  for (const team of fall2025Teams) {
    const teamRosters = rosterEntries.filter(r => r.teamId === team.id);
    // 12 weeks of practices
    for (let week = 0; week < 12; week++) {
      const practiceDate = new Date("2025-09-10T16:00:00");
      practiceDate.setDate(practiceDate.getDate() + week * 7);

      for (const roster of teamRosters) {
        const present = Math.random() > 0.15; // 85% attendance rate
        await db.insert(attendance).values({
          teamId: team.id,
          rosterId: roster.id,
          eventDate: practiceDate,
          eventType: "practice",
          status: present ? "present" : "absent",
          recordedByUserId: coachUsers[0].id,
        }).onConflictDoNothing();
        attendanceCount++;
      }
    }
  }
  console.log(`   ✓ ${attendanceCount} attendance records\n`);

  // ──────────────────────────────────────────────
  // Step 4: Create some Spring 2026 registrations (current season)
  // ──────────────────────────────────────────────
  console.log("4. Creating Spring 2026 registrations...");

  // Register some children in the already-seeded Spring/Summer 2026 seasons
  const openSeasons = await db.select().from(seasons).where(eq(seasons.status, "open"));
  let springRegCount = 0;

  for (const season of openSeasons.slice(0, 5)) {
    // Get age group range
    let minAge = 4, maxAge = 18;
    if (season.ageGroupId) {
      const [ag] = await db.select().from(ageGroups).where(eq(ageGroups.id, season.ageGroupId)).limit(1);
      if (ag) { minAge = ag.minAge; maxAge = ag.maxAge; }
    }

    const eligible = allChildren.filter(c => c.age >= minAge && c.age <= maxAge);
    const toRegister = eligible.slice(0, randomInt(5, Math.min(15, eligible.length)));

    for (const child of toRegister) {
      const [existing] = await db.select().from(registrations)
        .where(and(eq(registrations.seasonId, season.id), eq(registrations.familyMemberId, child.id)))
        .limit(1);
      if (existing) continue;

      const isPaid = Math.random() > 0.3;
      const isDeposit = !isPaid && Math.random() > 0.5;
      const amountPaid = isPaid ? season.priceCents : isDeposit ? (season.depositCents || 0) : 0;
      const amountDue = Math.max(0, season.priceCents - amountPaid);

      const [reg] = await db.insert(registrations).values({
        seasonId: season.id,
        familyMemberId: child.id,
        registeredByUserId: child.parentUser.id,
        status: isPaid ? "confirmed" : "pending",
        paymentStatus: isPaid ? "paid" : isDeposit ? "deposit_paid" : "unpaid",
        amountPaidCents: amountPaid,
        amountDueCents: amountDue,
        registrationType: isDeposit ? "deposit" : "full",
        waiverSigned: isPaid,
        waiverSignedAt: isPaid ? new Date() : null,
        waiverSignedBy: isPaid ? `${child.parentUser.firstName} ${child.parentUser.lastName}` : null,
      }).returning();

      if (amountPaid > 0) {
        await db.insert(payments).values({
          registrationId: reg.id,
          userId: child.parentUser.id,
          amountCents: amountPaid,
          paymentType: "full",
          status: "succeeded",
          stripePaymentIntentId: `pi_test_${uuid().substring(0, 8)}`,
          createdAt: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000),
        });
      }
      springRegCount++;
    }
  }
  console.log(`   ✓ ${springRegCount} new registrations across ${openSeasons.length} open seasons\n`);

  // ──────────────────────────────────────────────
  // Step 5: Create a few cancelled registrations with refunds
  // ──────────────────────────────────────────────
  console.log("5. Creating cancelled registrations with refund requests...");
  const confirmedRegs = await db.select().from(registrations)
    .where(eq(registrations.status, "confirmed")).limit(5);

  let refundCount = 0;
  for (const reg of confirmedRegs.slice(0, 3)) {
    await db.update(registrations).set({
      status: "cancelled",
      cancelledAt: new Date(Date.now() - randomInt(1, 14) * 24 * 60 * 60 * 1000),
      cancelledReason: randomFrom(["Schedule conflict", "Moving out of area", "Child no longer interested"]),
      refundStatus: randomFrom(["pending_approval", "approved", "processed"]),
      refundAmountCents: reg.amountPaidCents,
    }).where(eq(registrations.id, reg.id));
    refundCount++;
  }
  console.log(`   ✓ ${refundCount} cancellations with refund requests\n`);

  // ──────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────
  const totalRegs = await db.select().from(registrations);
  const totalPayments = await db.select().from(payments);
  const totalGames = await db.select().from(games);
  const totalAttendance = await db.select().from(attendance);

  console.log("✅ Full year seed complete!");
  console.log(`   📊 ${totalRegs.length} registrations`);
  console.log(`   💳 ${totalPayments.length} payments`);
  console.log(`   ⚽ ${totalGames.length} games`);
  console.log(`   📋 ${totalAttendance.length} attendance records`);
  console.log(`   👨‍👩‍👧‍👦 ${parentUsers.length} families, ${allChildren.length} children`);
}

seedFullYear()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });

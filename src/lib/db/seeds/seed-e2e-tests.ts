/**
 * E2E Test Seed Data
 *
 * Creates test users with known credentials and all necessary data
 * for comprehensive end-to-end testing.
 *
 * Run with: npx tsx src/lib/db/seeds/seed-e2e-tests.ts
 */

// Load environment variables from .env file if present
import "dotenv/config";

import { getDb } from "../index";
import { hashPassword } from "../../auth/password";
import {
  users,
  roles,
  userRoles,
  organizations,
  locations,
  sports,
  programs,
  seasons,
  ageGroups,
  teams,
  familyMembers,
  registrations,
  venues,
} from "../schema";
import { eq, and } from "drizzle-orm";

// Test user credentials - use these in E2E tests
export const TEST_USERS = {
  admin: {
    email: "admin@test.aspiresports.com",
    password: "TestAdmin123!",
    firstName: "Test",
    lastName: "Admin",
  },
  coach: {
    email: "coach@test.aspiresports.com",
    password: "TestCoach123!",
    firstName: "Test",
    lastName: "Coach",
  },
  parent: {
    email: "parent@test.aspiresports.com",
    password: "TestParent123!",
    firstName: "Test",
    lastName: "Parent",
  },
  newUser: {
    email: "newuser@test.aspiresports.com",
    password: "TestNew123!",
    firstName: "New",
    lastName: "User",
  },
};

async function seedE2ETests() {
  console.log("🧪 Seeding E2E test data...\n");
  const db = getDb();

  // Get or create organization
  console.log("1. Setting up organization...");
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "aspire-sports"))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        name: "Aspire Sports",
        slug: "aspire-sports",
        status: "active",
      })
      .returning();
  }
  console.log(`   ✓ Organization: ${org.name} (${org.id})`);

  // Get or create location
  let [location] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, org.id))
    .limit(1);

  if (!location) {
    [location] = await db
      .insert(locations)
      .values({
        organizationId: org.id,
        name: "Powell",
        slug: "powell",
        city: "Powell",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
      })
      .returning();
  }
  console.log(`   ✓ Location: ${location.name} (${location.id})`);

  // Create roles if they don't exist (needed for fresh CI databases)
  console.log("\n   Creating roles if needed...");
  await db
    .insert(roles)
    .values([
      {
        name: "super_admin",
        description: "Full system access, manage all organizations",
        permissions: ["*"],
      },
      {
        name: "location_admin",
        description: "Manage specific location(s), programs, and registrations",
        permissions: [
          "programs:read",
          "programs:write",
          "seasons:read",
          "seasons:write",
          "registrations:read",
          "registrations:write",
          "teams:read",
          "teams:write",
          "users:read",
        ],
      },
      {
        name: "coach",
        description: "View assigned teams, rosters, enter scores",
        permissions: [
          "teams:read",
          "rosters:read",
          "games:read",
          "games:write_score",
        ],
      },
      {
        name: "parent",
        description: "Register children, view schedules, make payments",
        permissions: [
          "programs:read",
          "seasons:read",
          "registrations:read",
          "registrations:write_own",
          "family:read",
          "family:write",
          "payments:read_own",
        ],
      },
      {
        name: "player",
        description: "View own schedule and team information",
        permissions: ["schedules:read_own", "teams:read_own"],
      },
      {
        name: "media_staff",
        description:
          "Photographer/videographer assigned to shoots; uploads assets to their sessions",
        permissions: [
          "media_jobs:read_own",
          "media_jobs:check_in",
          "media_jobs:upload",
          "rosters:read_assigned",
        ],
      },
      {
        name: "media_editor",
        description:
          "Offshore or in-house tagger; sees only assets in sessions scoped to their service locations",
        permissions: ["media_assets:read_scoped", "media_tags:write_scoped"],
      },
    ])
    .onConflictDoNothing();

  // Get roles
  const allRoles = await db.select().from(roles);
  const roleMap = Object.fromEntries(allRoles.map((r) => [r.name, r]));
  console.log(`   ✓ Roles loaded: ${allRoles.length}`);

  // Create test users
  console.log("\n2. Creating test users...");

  // Admin user - always update password to ensure it's correct
  const adminPasswordHash = await hashPassword(TEST_USERS.admin.password);
  let [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.admin.email))
    .limit(1);

  if (!adminUser) {
    [adminUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.admin.email,
        passwordHash: adminPasswordHash,
        firstName: TEST_USERS.admin.firstName,
        lastName: TEST_USERS.admin.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    // Update existing user's password and ensure email is verified
    await db.update(users)
      .set({ passwordHash: adminPasswordHash, emailVerified: true })
      .where(eq(users.id, adminUser.id));
  }
  // Always ensure super_admin role is assigned (delete other roles first)
  await db.delete(userRoles).where(eq(userRoles.userId, adminUser.id));
  await db.insert(userRoles).values({
    userId: adminUser.id,
    roleId: roleMap.super_admin.id,
    scopeType: "global",
  });
  console.log(`   ✓ Admin: ${adminUser.email}`);

  // Coach user - always update password to ensure it's correct
  const coachPasswordHash = await hashPassword(TEST_USERS.coach.password);
  let [coachUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.coach.email))
    .limit(1);

  if (!coachUser) {
    [coachUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.coach.email,
        passwordHash: coachPasswordHash,
        firstName: TEST_USERS.coach.firstName,
        lastName: TEST_USERS.coach.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    // Update existing user's password and ensure email is verified
    await db.update(users)
      .set({ passwordHash: coachPasswordHash, emailVerified: true })
      .where(eq(users.id, coachUser.id));
  }
  // Always ensure coach role is assigned (delete other roles first)
  await db.delete(userRoles).where(eq(userRoles.userId, coachUser.id));
  await db.insert(userRoles).values({
    userId: coachUser.id,
    roleId: roleMap.coach.id,
    scopeType: "organization",
    scopeId: org.id,
  });
  console.log(`   ✓ Coach: ${coachUser.email}`);

  // Parent user - always update password to ensure it's correct
  const parentPasswordHash = await hashPassword(TEST_USERS.parent.password);
  let [parentUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.parent.email))
    .limit(1);

  if (!parentUser) {
    [parentUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.parent.email,
        passwordHash: parentPasswordHash,
        firstName: TEST_USERS.parent.firstName,
        lastName: TEST_USERS.parent.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    // Update existing user's password and ensure email is verified
    await db.update(users)
      .set({ passwordHash: parentPasswordHash, emailVerified: true })
      .where(eq(users.id, parentUser.id));
  }
  // Always ensure parent role is assigned (delete other roles first)
  await db.delete(userRoles).where(eq(userRoles.userId, parentUser.id));
  await db.insert(userRoles).values({
    userId: parentUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });
  console.log(`   ✓ Parent: ${parentUser.email}`);

  // Get or create sport
  console.log("\n3. Setting up programs...");
  let [soccer] = await db
    .select()
    .from(sports)
    .where(and(eq(sports.organizationId, org.id), eq(sports.slug, "soccer")))
    .limit(1);

  if (!soccer) {
    [soccer] = await db
      .insert(sports)
      .values({
        organizationId: org.id,
        name: "Soccer",
        slug: "soccer",
        icon: "⚽",
        color: "#22c55e",
      })
      .returning();
  }

  // Get or create age group
  let [u8AgeGroup] = await db
    .select()
    .from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "U8")))
    .limit(1);

  if (!u8AgeGroup) {
    [u8AgeGroup] = await db
      .insert(ageGroups)
      .values({
        organizationId: org.id,
        name: "U8",
        minAge: 6,
        maxAge: 8,
        description: "Ages 6-8",
      })
      .returning();
  }

  // Get or create venue
  let [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.locationId, location.id))
    .limit(1);

  if (!venue) {
    [venue] = await db
      .insert(venues)
      .values({
        locationId: location.id,
        name: "Test Soccer Field",
        address: "123 Test St, Powell, OH 43065",
        fieldCount: 2,
        indoor: false,
      })
      .returning();
  }

  // Create program
  let [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, "e2e-test-soccer"))
    .limit(1);

  if (!program) {
    [program] = await db
      .insert(programs)
      .values({
        locationId: location.id,
        sportId: soccer.id,
        name: "E2E Test Soccer Program",
        slug: "e2e-test-soccer",
        description: "Soccer program for E2E testing",
        programType: "league",
        active: true,
      })
      .returning();
  }
  console.log(`   ✓ Program: ${program.name}`);

  // Create season (open for registration)
  const seasonStartDate = new Date();
  seasonStartDate.setMonth(seasonStartDate.getMonth() + 1);
  const seasonEndDate = new Date(seasonStartDate);
  seasonEndDate.setMonth(seasonEndDate.getMonth() + 3);
  const registrationEnd = new Date(seasonStartDate);
  registrationEnd.setDate(registrationEnd.getDate() - 7);

  // Format dates as strings for the date columns
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  let [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "e2e-test-spring-2026"))
    .limit(1);

  if (!season) {
    [season] = await db
      .insert(seasons)
      .values({
        programId: program.id,
        ageGroupId: u8AgeGroup.id,
        name: "E2E Test Spring 2026",
        slug: "e2e-test-spring-2026",
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        registrationOpens: new Date(), // Open now
        registrationCloses: registrationEnd,
        status: "open",
        priceCents: 15000, // $150
        depositCents: 5000, // $50 deposit
        allowDeposit: true,
        maxParticipants: 20,
      })
      .returning();
  }
  console.log(`   ✓ Season: ${season.name} (registration open)`);

  // Create teams assigned to coach — need at least two so Games tests can
  // schedule home vs away.
  console.log("\n4. Setting up teams...");
  let [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.name, "E2E Test Team"))
    .limit(1);

  if (!team) {
    [team] = await db
      .insert(teams)
      .values({
        seasonId: season.id,
        name: "E2E Test Team",
        coachUserId: coachUser.id,
        color: "#22c55e",
        maxRosterSize: 12,
        division: "U8",
      })
      .returning();
  }
  console.log(`   ✓ Team: ${team.name} (Coach: ${coachUser.firstName})`);

  let [team2] = await db
    .select()
    .from(teams)
    .where(eq(teams.name, "E2E Test Team 2"))
    .limit(1);

  if (!team2) {
    [team2] = await db
      .insert(teams)
      .values({
        seasonId: season.id,
        name: "E2E Test Team 2",
        coachUserId: coachUser.id,
        color: "#3b82f6",
        maxRosterSize: 12,
        division: "U8",
      })
      .returning();
  }
  console.log(`   ✓ Team: ${team2.name}`);

  // Create family members for parent
  console.log("\n5. Setting up family members...");
  let [child1] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, parentUser.id),
        eq(familyMembers.firstName, "Tommy")
      )
    )
    .limit(1);

  if (!child1) {
    [child1] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parentUser.id,
        firstName: "Tommy",
        lastName: "Test",
        birthDate: "2018-05-15",
        gender: "male",
      })
      .returning();
  }
  console.log(`   ✓ Child: ${child1.firstName} ${child1.lastName}`);

  let [child2] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, parentUser.id),
        eq(familyMembers.firstName, "Sarah")
      )
    )
    .limit(1);

  if (!child2) {
    [child2] = await db
      .insert(familyMembers)
      .values({
        parentUserId: parentUser.id,
        firstName: "Sarah",
        lastName: "Test",
        birthDate: "2019-08-22",
        gender: "female",
      })
      .returning();
  }
  console.log(`   ✓ Child: ${child2.firstName} ${child2.lastName}`);

  // Create a confirmed registration for one child
  console.log("\n6. Setting up registrations...");
  let [existingReg] = await db
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.familyMemberId, child1.id),
        eq(registrations.seasonId, season.id)
      )
    )
    .limit(1);

  if (!existingReg) {
    [existingReg] = await db
      .insert(registrations)
      .values({
        seasonId: season.id,
        familyMemberId: child1.id,
        registeredByUserId: parentUser.id,
        status: "confirmed",
        paymentStatus: "paid",
        registrationType: "full",
        amountDueCents: 15000,
        amountPaidCents: 15000,
      })
      .returning();

  }
  console.log(`   ✓ Registration: ${child1.firstName} - ${season.name} (confirmed)`);

  console.log("\n✅ E2E test data seeded successfully!");
  console.log("\n📋 Test Credentials:");
  console.log("─".repeat(50));
  console.log(`Admin:  ${TEST_USERS.admin.email} / ${TEST_USERS.admin.password}`);
  console.log(`Coach:  ${TEST_USERS.coach.email} / ${TEST_USERS.coach.password}`);
  console.log(`Parent: ${TEST_USERS.parent.email} / ${TEST_USERS.parent.password}`);
  console.log("─".repeat(50));
}

// Run if executed directly
seedE2ETests()
  .catch((error) => {
    console.error("❌ E2E seeding failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

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
import {
  mediaStaffProfiles,
  shootSessions,
  mediaAssets,
} from "../schema/media";
import { rosters, games } from "../schema";
import { asc, eq, ne, and, or } from "drizzle-orm";

// Test user credentials - use these in E2E tests
export const TEST_USERS = {
  admin: {
    email: "admin@test.aspiresports.com",
    password: "TestAdmin123!",
    firstName: "Test",
    lastName: "Admin",
  },
  adminOrgB: {
    email: "admin-orgb@test.aspiresports.com",
    password: "TestAdmin123!",
    firstName: "OrgB",
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
  mediaStaff: {
    email: "media_staff@test.aspiresports.com",
    password: "TestMedia123!",
    firstName: "Test",
    lastName: "MediaStaff",
  },
  mediaEditor: {
    email: "media_editor@test.aspiresports.com",
    password: "TestMedia123!",
    firstName: "Test",
    lastName: "MediaEditor",
  },
  adultSelf: {
    email: "adult-self@test.aspiresports.com",
    password: "TestParent123!",
    firstName: "Adult",
    lastName: "Self",
    birthDate: "1985-06-15",
  },
};

/**
 * Returns the adult open soccer season slug — used by self-registration tests
 * to look up the season ID at runtime.
 */
export const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

async function seedE2ETests() {
  console.log("🧪 Seeding E2E test data...\n");
  const db = getDb();

  // Get or create organization. The domain-resolver's default-org logic
  // (lib/organization/domain-resolver.ts > resolveDefaultOrganization) picks
  // the oldest active headquarters org, else the oldest active org. To keep
  // the seed and runtime in lockstep we upsert aspire-sports as an active
  // headquarters so it is unambiguously what middleware will return on
  // localhost/CI. Pre-existing rows from earlier seed versions may have
  // status='pending' or organizationType='franchise' — we fix those here.
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
        organizationType: "headquarters",
      })
      .returning();
  } else if (
    org.status !== "active" ||
    org.organizationType !== "headquarters"
  ) {
    [org] = await db
      .update(organizations)
      .set({ status: "active", organizationType: "headquarters" })
      .where(eq(organizations.id, org.id))
      .returning();
  }
  console.log(`   ✓ Organization: ${org.name} (${org.id})`);

  // Demote any OTHER headquarters/active orgs so aspire-sports is the
  // unambiguous default org on shared CI databases. Without this, prior
  // test runs that created additional HQ/active orgs (e.g., via the admin
  // organizations API) can win the resolveDefaultOrganization tiebreaker
  // and cause admin's API calls to miss seeded fixtures.
  const candidates = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      or(
        eq(organizations.organizationType, "headquarters"),
        eq(organizations.status, "active")
      )
    );
  let demotedCount = 0;
  for (const row of candidates) {
    if (row.id === org.id) continue;
    await db
      .update(organizations)
      .set({ organizationType: "franchise", status: "inactive" })
      .where(eq(organizations.id, row.id));
    demotedCount++;
  }
  if (demotedCount > 0) {
    console.log(`   ✓ Demoted ${demotedCount} other HQ/active org(s) to franchise/inactive`);
  }

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

  // Adult self-registration test user
  const adultSelfPasswordHash = await hashPassword(TEST_USERS.adultSelf.password);
  let [adultSelfUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.adultSelf.email))
    .limit(1);

  if (!adultSelfUser) {
    [adultSelfUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.adultSelf.email,
        passwordHash: adultSelfPasswordHash,
        firstName: TEST_USERS.adultSelf.firstName,
        lastName: TEST_USERS.adultSelf.lastName,
        birthDate: TEST_USERS.adultSelf.birthDate,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({
        passwordHash: adultSelfPasswordHash,
        birthDate: TEST_USERS.adultSelf.birthDate,
        emailVerified: true,
      })
      .where(eq(users.id, adultSelfUser.id));
  }
  // Assign parent role (adults who self-register use the parent role)
  await db.delete(userRoles).where(eq(userRoles.userId, adultSelfUser.id));
  await db.insert(userRoles).values({
    userId: adultSelfUser.id,
    roleId: roleMap.parent.id,
    scopeType: "organization",
    scopeId: org.id,
  });
  console.log(`   ✓ AdultSelf: ${adultSelfUser.email}`);

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

  // Adult age group (18+) for self-registration tests
  let [adultAgeGroup] = await db
    .select()
    .from(ageGroups)
    .where(and(eq(ageGroups.organizationId, org.id), eq(ageGroups.name, "Adult 18+")))
    .limit(1);

  if (!adultAgeGroup) {
    [adultAgeGroup] = await db
      .insert(ageGroups)
      .values({
        organizationId: org.id,
        name: "Adult 18+",
        minAge: 18,
        maxAge: 99,
        description: "Ages 18 and up",
      })
      .returning();
  }

  // Adult Open Soccer program
  let [adultProgram] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, "e2e-adult-open-soccer"))
    .limit(1);

  if (!adultProgram) {
    [adultProgram] = await db
      .insert(programs)
      .values({
        locationId: location.id,
        sportId: soccer.id,
        name: "Adult Open Soccer",
        slug: "e2e-adult-open-soccer",
        description: "Adult open soccer league for E2E testing",
        programType: "league",
        active: true,
      })
      .returning();
  }
  console.log(`   ✓ Adult Program: ${adultProgram.name}`);

  // Adult Open Soccer season (open for registration)
  let [adultSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
    .limit(1);

  if (!adultSeason) {
    [adultSeason] = await db
      .insert(seasons)
      .values({
        programId: adultProgram.id,
        ageGroupId: adultAgeGroup.id,
        name: "Adult Open Soccer 2026",
        slug: ADULT_OPEN_SEASON_SLUG,
        startDate: formatDate(seasonStartDate),
        endDate: formatDate(seasonEndDate),
        registrationOpens: new Date(), // Open now
        registrationCloses: registrationEnd,
        status: "open",
        priceCents: 10000, // $100
        depositCents: 3000, // $30 deposit
        allowDeposit: true,
        maxParticipants: 30,
      })
      .returning();
  }
  console.log(`   ✓ Adult Season: ${adultSeason.name} (id: ${adultSeason.id})`);

  // -------------------------------------------------------------------------
  // Org B — second tenant for cross-tenant isolation tests.
  // This org has its own admin, location, sport, program and season.
  // It must remain status='inactive' + organizationType='franchise' so the
  // domain-resolver does NOT pick it up as the default org on CI.
  // Tests reach it by signing in as the adminOrgB user (location_admin scoped
  // to orgB) and sending requests with Host: orgb.localhost, which routes
  // the middleware to orgB via the subdomain slug match.
  // -------------------------------------------------------------------------
  console.log("\n3b. Setting up Org B (cross-tenant test fixture)...");

  let [orgB] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "orgb"))
    .limit(1);

  if (!orgB) {
    [orgB] = await db
      .insert(organizations)
      .values({
        name: "Org B (Test Only)",
        slug: "orgb",
        status: "active",
        organizationType: "franchise",
      })
      .returning();
  } else if (orgB.status !== "active") {
    [orgB] = await db
      .update(organizations)
      .set({ status: "active", organizationType: "franchise" })
      .where(eq(organizations.id, orgB.id))
      .returning();
  }
  console.log(`   ✓ Org B: ${orgB.name} (${orgB.id})`);

  let [orgBLocation] = await db
    .select()
    .from(locations)
    .where(eq(locations.organizationId, orgB.id))
    .limit(1);

  if (!orgBLocation) {
    [orgBLocation] = await db
      .insert(locations)
      .values({
        organizationId: orgB.id,
        name: "Org B HQ",
        slug: "orgb-hq",
        city: "Columbus",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
      })
      .returning();
  }
  console.log(`   ✓ Org B Location: ${orgBLocation.name} (${orgBLocation.id})`);

  // Org B sport
  let [orgBSport] = await db
    .select()
    .from(sports)
    .where(and(eq(sports.organizationId, orgB.id), eq(sports.slug, "basketball")))
    .limit(1);

  if (!orgBSport) {
    [orgBSport] = await db
      .insert(sports)
      .values({
        organizationId: orgB.id,
        name: "Basketball",
        slug: "basketball",
        icon: "🏀",
        color: "#f97316",
      })
      .returning();
  }
  console.log(`   ✓ Org B Sport: ${orgBSport.name}`);

  // Org B program
  let [orgBProgram] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, "orgb-basketball-league"))
    .limit(1);

  if (!orgBProgram) {
    [orgBProgram] = await db
      .insert(programs)
      .values({
        locationId: orgBLocation.id,
        sportId: orgBSport.id,
        name: "Org B Basketball League",
        slug: "orgb-basketball-league",
        programType: "league",
        active: true,
      })
      .returning();
  }
  console.log(`   ✓ Org B Program: ${orgBProgram.name} (${orgBProgram.id})`);

  // Org B season
  let [orgBSeason] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.slug, "orgb-basketball-fall-2026"))
    .limit(1);

  if (!orgBSeason) {
    [orgBSeason] = await db
      .insert(seasons)
      .values({
        programId: orgBProgram.id,
        name: "Org B Basketball Fall 2026",
        slug: "orgb-basketball-fall-2026",
        startDate: "2026-09-01",
        endDate: "2026-12-15",
        status: "draft",
        priceCents: 12000,
        allowDeposit: false,
      })
      .returning();
  }
  console.log(`   ✓ Org B Season: ${orgBSeason.name} (${orgBSeason.id})`);

  // Org B venue
  let [orgBVenue] = await db
    .select()
    .from(venues)
    .where(eq(venues.locationId, orgBLocation.id))
    .limit(1);

  if (!orgBVenue) {
    [orgBVenue] = await db
      .insert(venues)
      .values({
        locationId: orgBLocation.id,
        name: "Org B Arena",
        address: "456 Other St, Columbus, OH 43201",
        fieldCount: 1,
        indoor: true,
      })
      .returning();
  }
  console.log(`   ✓ Org B Venue: ${orgBVenue.name} (${orgBVenue.id})`);

  // Org B admin user (location_admin scoped to orgB)
  const adminOrgBPasswordHash = await hashPassword(TEST_USERS.adminOrgB.password);
  let [adminOrgBUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.adminOrgB.email))
    .limit(1);

  if (!adminOrgBUser) {
    [adminOrgBUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.adminOrgB.email,
        passwordHash: adminOrgBPasswordHash,
        firstName: TEST_USERS.adminOrgB.firstName,
        lastName: TEST_USERS.adminOrgB.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: adminOrgBPasswordHash, emailVerified: true })
      .where(eq(users.id, adminOrgBUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, adminOrgBUser.id));
  await db.insert(userRoles).values({
    userId: adminOrgBUser.id,
    roleId: roleMap.location_admin.id,
    scopeType: "organization",
    scopeId: orgB.id,
  });
  console.log(`   ✓ Org B Admin: ${adminOrgBUser.email}`);

  // Export Org B IDs — stored in a well-known key the tests can fetch at runtime
  // via GET /api/admin/seasons?include_test=1 (filtered by slug) or
  // GET /api/admin/programs (filtered by slug). Tests should not hard-code
  // UUIDs; they should look them up by slug from the appropriate endpoint.
  console.log(`   ✓ Org B fixture summary:`);
  console.log(`       orgId=${orgB.id}  programId=${orgBProgram.id}`);
  console.log(`       seasonId=${orgBSeason.id}  venueId=${orgBVenue.id}`);
  console.log(`       sportId=${orgBSport.id}  locationId=${orgBLocation.id}`);

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
        amountDueCents: 0,
        amountPaidCents: 15000,
      })
      .returning();
  } else if (
    existingReg.paymentStatus === "paid" &&
    existingReg.amountDueCents !== 0
  ) {
    // Heal stale rows from older seed runs that left amountDueCents=15000
    // on a fully-paid registration; the detail UI reads it as "Balance".
    [existingReg] = await db
      .update(registrations)
      .set({ amountDueCents: 0 })
      .where(eq(registrations.id, existingReg.id))
      .returning();
  }

  // Heal any other fully-paid rows in this org with non-zero amountDueCents.
  // Older seeds and the pre-fix Stripe webhook left amountDueCents at the
  // full season price even after payment landed, which renders as a wrong
  // "Balance $X.XX" on the new registration-detail page.
  await db
    .update(registrations)
    .set({ amountDueCents: 0 })
    .where(
      and(
        eq(registrations.paymentStatus, "paid"),
        ne(registrations.amountDueCents, 0)
      )
    );

  console.log(`   ✓ Registration: ${child1.firstName} - ${season.name} (confirmed)`);

  // --- Media staff user ---
  const mediaStaffPasswordHash = await hashPassword(
    TEST_USERS.mediaStaff.password
  );
  let [mediaStaffUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.mediaStaff.email))
    .limit(1);

  if (!mediaStaffUser) {
    [mediaStaffUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.mediaStaff.email,
        passwordHash: mediaStaffPasswordHash,
        firstName: TEST_USERS.mediaStaff.firstName,
        lastName: TEST_USERS.mediaStaff.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: mediaStaffPasswordHash, emailVerified: true })
      .where(eq(users.id, mediaStaffUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, mediaStaffUser.id));
  await db.insert(userRoles).values({
    userId: mediaStaffUser.id,
    roleId: roleMap.media_staff.id,
    scopeType: "location",
    scopeId: location.id,
  });
  console.log(`   ✓ MediaStaff: ${mediaStaffUser.email}`);

  // --- Media editor user ---
  const mediaEditorPasswordHash = await hashPassword(
    TEST_USERS.mediaEditor.password
  );
  let [mediaEditorUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, TEST_USERS.mediaEditor.email))
    .limit(1);

  if (!mediaEditorUser) {
    [mediaEditorUser] = await db
      .insert(users)
      .values({
        email: TEST_USERS.mediaEditor.email,
        passwordHash: mediaEditorPasswordHash,
        firstName: TEST_USERS.mediaEditor.firstName,
        lastName: TEST_USERS.mediaEditor.lastName,
        emailVerified: true,
      })
      .returning();
  } else {
    await db
      .update(users)
      .set({ passwordHash: mediaEditorPasswordHash, emailVerified: true })
      .where(eq(users.id, mediaEditorUser.id));
  }
  await db.delete(userRoles).where(eq(userRoles.userId, mediaEditorUser.id));
  await db.insert(userRoles).values({
    userId: mediaEditorUser.id,
    roleId: roleMap.media_editor.id,
    scopeType: "location",
    scopeId: location.id,
  });
  console.log(`   ✓ MediaEditor: ${mediaEditorUser.email}`);

  await db
    .insert(mediaStaffProfiles)
    .values({
      userId: mediaStaffUser.id,
      organizationId: org.id,
      serviceLocationIds: [location.id],
      active: true,
      onboardedAt: new Date(),
    })
    .onConflictDoNothing();
  console.log(`   ✓ MediaStaffProfile seeded for ${TEST_USERS.mediaStaff.email}`);

  await db
    .insert(mediaStaffProfiles)
    .values({
      userId: mediaEditorUser.id,
      organizationId: org.id,
      serviceLocationIds: [location.id],
      active: true,
      onboardedAt: new Date(),
    })
    .onConflictDoNothing();
  console.log(`   ✓ MediaStaffProfile seeded for ${TEST_USERS.mediaEditor.email}`);

  // --- Phase 2: roster + game + uploaded shoot sessions for the tagger ---
  console.log("\n8. Setting up tagger fixtures (Phase 2)...");

  let [rosterRow] = await db
    .select()
    .from(rosters)
    .where(
      and(eq(rosters.teamId, team.id), eq(rosters.registrationId, existingReg.id))
    )
    .limit(1);
  if (!rosterRow) {
    [rosterRow] = await db
      .insert(rosters)
      .values({
        teamId: team.id,
        registrationId: existingReg.id,
        jerseyNumber: "7",
        status: "active",
      })
      .returning();
  }
  console.log(`   ✓ Roster entry: #${rosterRow.jerseyNumber} on ${team.name}`);

  let [game] = await db
    .select()
    .from(games)
    .where(
      and(eq(games.homeTeamId, team.id), eq(games.awayTeamId, team2.id))
    )
    .limit(1);
  if (!game) {
    [game] = await db
      .insert(games)
      .values({
        seasonId: season.id,
        homeTeamId: team.id,
        awayTeamId: team2.id,
        scheduledAt: new Date(),
        status: "scheduled",
      })
      .returning();
  }
  console.log(`   ✓ Game: ${team.name} vs ${team2.name}`);

  // Cleanup pass: delete leftover 'uploaded' sessions from prior seed runs
  // so we don't accumulate hundreds of rows over time. Cascades through
  // mediaAssets and mediaTags via onDelete: "cascade". Only targets the
  // exact (org, game, status) tuple this seed creates — won't touch any
  // non-seed shoot session, and won't touch sessions that current CI
  // workers have already claimed (those are status='tagging' now).
  const deleted = await db
    .delete(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, org.id),
        eq(shootSessions.gameId, game.id),
        eq(shootSessions.status, "uploaded")
      )
    )
    .returning({ id: shootSessions.id });
  console.log(
    `   ✓ Cleared ${deleted.length} stale 'uploaded' fixtures (cascading to assets/tags)`
  );

  // API tests (test-api job) and Playwright tests (test job) run in parallel
  // against the same shared CI DB. tag-session.test.ts has 5 describe blocks
  // (each beforeAll claims queue[0]) plus inline claims, so test-api can
  // consume ~6 sessions on its own. Add 15 fresh fixtures every seed run.
  // Concurrent runs are safe: this delete only touches status='uploaded',
  // so any session another worker has already claimed (status='tagging')
  // is preserved.
  const needed = 15;
  for (let n = 0; n < needed; n++) {
    const [s] = await db
      .insert(shootSessions)
      .values({
        organizationId: org.id,
        locationId: location.id,
        gameId: game.id,
        assignedUserId: mediaStaffUser.id,
        assignedByUserId: adminUser.id,
        sessionType: "game",
        status: "uploaded",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
        rateType: "per_game",
        rateCents: 0,
        payoutStatus: "unearned",
      })
      .returning();

    const base = Date.now();
    for (let i = 0; i < 6; i++) {
      await db.insert(mediaAssets).values({
        shootSessionId: s.id,
        organizationId: org.id,
        assetType: "photo",
        storageKey: `seed/session-${s.id}/asset-${i}.jpg`,
        thumbnailKey: `seed/session-${s.id}/thumb-${i}.jpg`,
        originalFilename: `asset-${i}.jpg`,
        fileSizeBytes: 1024,
        mimeType: "image/jpeg",
        capturedAt: new Date(base + i * 800),
        uploadedAt: new Date(),
        status: "uploaded",
      });
    }
    console.log(`   ✓ Tagger fixture session ${s.id.slice(0, 8)} with 6 assets`);
  }
  console.log("\n✅ E2E test data seeded successfully!");
  console.log("\n📋 Test Credentials:");
  console.log("─".repeat(50));
  console.log(`Admin:      ${TEST_USERS.admin.email} / ${TEST_USERS.admin.password}`);
  console.log(`AdminOrgB:  ${TEST_USERS.adminOrgB.email} / ${TEST_USERS.adminOrgB.password}`);
  console.log(`Coach:      ${TEST_USERS.coach.email} / ${TEST_USERS.coach.password}`);
  console.log(`Parent:     ${TEST_USERS.parent.email} / ${TEST_USERS.parent.password}`);
  console.log(`AdultSelf:  ${TEST_USERS.adultSelf.email} / ${TEST_USERS.adultSelf.password}`);
  console.log(`MediaStaff: ${TEST_USERS.mediaStaff.email} / ${TEST_USERS.mediaStaff.password}`);
  console.log(`MediaEditor:${TEST_USERS.mediaEditor.email} / ${TEST_USERS.mediaEditor.password}`);
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

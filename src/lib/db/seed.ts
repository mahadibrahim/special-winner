import { getDb } from "./index";
import { roles, organizations, locations, sports, ageGroups } from "./schema";

async function seed() {
  console.log("🌱 Seeding database...");

  // Seed roles
  console.log("Creating roles...");
  await getDb()
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
    ])
    .onConflictDoNothing();

  // Seed default organization
  console.log("Creating default organization...");
  const [org] = await getDb()
    .insert(organizations)
    .values({
      name: "Aspire Sports",
      slug: "aspire-sports",
    })
    .onConflictDoNothing()
    .returning();

  if (org) {
    // Seed default location
    console.log("Creating default location...");
    const [location] = await getDb()
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
      .onConflictDoNothing()
      .returning();

    // Seed default sports
    console.log("Creating default sports...");
    await getDb()
      .insert(sports)
      .values([
        {
          organizationId: org.id,
          name: "Soccer",
          slug: "soccer",
          icon: "⚽",
          color: "#22c55e",
          sortOrder: 1,
        },
        {
          organizationId: org.id,
          name: "Basketball",
          slug: "basketball",
          icon: "🏀",
          color: "#f97316",
          sortOrder: 2,
        },
        {
          organizationId: org.id,
          name: "Football",
          slug: "football",
          icon: "🏈",
          color: "#8b4513",
          sortOrder: 3,
        },
        {
          organizationId: org.id,
          name: "Baseball",
          slug: "baseball",
          icon: "⚾",
          color: "#dc2626",
          sortOrder: 4,
        },
      ])
      .onConflictDoNothing();

    // Seed default age groups
    console.log("Creating default age groups...");
    await getDb()
      .insert(ageGroups)
      .values([
        {
          organizationId: org.id,
          name: "U6",
          minAge: 4,
          maxAge: 6,
          description: "Ages 4-6",
        },
        {
          organizationId: org.id,
          name: "U8",
          minAge: 6,
          maxAge: 8,
          description: "Ages 6-8",
        },
        {
          organizationId: org.id,
          name: "U10",
          minAge: 8,
          maxAge: 10,
          description: "Ages 8-10",
        },
        {
          organizationId: org.id,
          name: "U12",
          minAge: 10,
          maxAge: 12,
          description: "Ages 10-12",
        },
        {
          organizationId: org.id,
          name: "U14",
          minAge: 12,
          maxAge: 14,
          description: "Ages 12-14",
        },
        {
          organizationId: org.id,
          name: "Adult",
          minAge: 18,
          maxAge: 99,
          description: "Ages 18+",
        },
      ])
      .onConflictDoNothing();
  }

  console.log("✅ Database seeded successfully!");
}

seed()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

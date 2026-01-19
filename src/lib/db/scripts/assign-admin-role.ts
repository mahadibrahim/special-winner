/**
 * Script to assign super_admin role to a user by email
 * Run with: npx tsx src/lib/db/scripts/assign-admin-role.ts <email>
 */

import { getDb } from "../index";
import { users, userRoles, roles } from "../schema";
import { eq } from "drizzle-orm";

async function assignAdminRole(email: string) {
  console.log(`Assigning super_admin role to: ${email}`);

  // Find user
  const user = await getDb().query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  console.log(`Found user: ${user.firstName} ${user.lastName} (${user.id})`);

  // Find super_admin role
  const adminRole = await getDb().query.roles.findFirst({
    where: eq(roles.name, "super_admin"),
  });

  if (!adminRole) {
    console.error("super_admin role not found. Run: npm run db:seed");
    process.exit(1);
  }

  // Check if user already has this role
  const existingRole = await getDb().query.userRoles.findFirst({
    where: eq(userRoles.userId, user.id),
  });

  if (existingRole) {
    console.log("User already has a role assigned. Updating to super_admin...");
    await getDb()
      .update(userRoles)
      .set({ roleId: adminRole.id })
      .where(eq(userRoles.userId, user.id));
  } else {
    await getDb().insert(userRoles).values({
      userId: user.id,
      roleId: adminRole.id,
      scopeType: "global",
    });
  }

  console.log("✅ super_admin role assigned successfully!");
  console.log("Sign out and sign back in to see the change.");
  process.exit(0);
}

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx src/lib/db/scripts/assign-admin-role.ts <email>");
  process.exit(1);
}

assignAdminRole(email);

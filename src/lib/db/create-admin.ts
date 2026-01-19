import { getDb } from "./index";
import { users, roles, userRoles } from "./schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/password";

async function createAdmin() {
  const email = "admin@aspiresports.com";
  const password = "admin123"; // Test password - change in production!
  const firstName = "Test";
  const lastName = "Admin";

  console.log("🔐 Creating test admin user...");

  // Hash the password
  const passwordHash = await hashPassword(password);

  // Check if user already exists
  const existingUser = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: string;

  if (existingUser.length > 0) {
    console.log("User already exists, updating...");
    userId = existingUser[0].id;
    await getDb()
      .update(users)
      .set({ passwordHash, firstName, lastName, emailVerified: true })
      .where(eq(users.id, userId));
  } else {
    console.log("Creating new user...");
    const [newUser] = await getDb()
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName,
        lastName,
        emailVerified: true,
      })
      .returning();
    userId = newUser.id;
  }

  // Get the super_admin role
  const [superAdminRole] = await getDb()
    .select()
    .from(roles)
    .where(eq(roles.name, "super_admin"))
    .limit(1);

  if (!superAdminRole) {
    console.error("❌ super_admin role not found. Run db:seed first.");
    process.exit(1);
  }

  // Check if user already has the role
  const existingRole = await getDb()
    .select()
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
    .limit(1);

  if (existingRole.length === 0) {
    console.log("Assigning super_admin role...");
    await getDb().insert(userRoles).values({
      userId,
      roleId: superAdminRole.id,
      scopeType: "global",
    });
  } else {
    console.log("User already has a role assigned.");
  }

  console.log("✅ Test admin user created!");
  console.log("");
  console.log("📧 Email:", email);
  console.log("🔑 Password:", password);
  console.log("");
}

createAdmin()
  .catch((error) => {
    console.error("❌ Failed to create admin:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

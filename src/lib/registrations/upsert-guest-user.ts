import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";

export type UpsertGuestUserResult = {
  userRow: typeof users.$inferSelect;
  wasNewUser: boolean;
  normalizedEmail: string;
};

/**
 * Upsert a guest user by email, assigning the parent role to new users.
 * Returns the user row, a flag indicating if this was a new insert, and the
 * normalized email.
 */
export async function upsertGuestUser(
  db: Database,
  opts: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    birthDate?: string | null;
  },
): Promise<UpsertGuestUserResult> {
  const normalizedEmail = opts.email.toLowerCase().trim();
  let wasNewUser = false;

  const insertedUsers = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      passwordHash: null,
      firstName: opts.firstName,
      lastName: opts.lastName,
      phone: opts.phone ?? null,
      birthDate: opts.birthDate ?? null,
      emailVerified: false,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  let userRow: typeof users.$inferSelect;
  if (insertedUsers.length > 0) {
    userRow = insertedUsers[0];
    wasNewUser = true;

    // Assign global parent role (mirroring /api/auth/signup)
    const [parentRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, "parent"));
    if (parentRole) {
      await db.insert(userRoles).values({
        userId: userRow.id,
        roleId: parentRole.id,
        scopeType: "global",
      });
    }
  } else {
    // Either the email already existed or a concurrent insert won the race.
    // Either way, re-fetch the row that's now in the table.
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail));
    if (!existing) {
      // Should be impossible — log and 500
      throw new Error("User row vanished after upsert race");
    }
    userRow = existing;
  }

  return { userRow, wasNewUser, normalizedEmail };
}

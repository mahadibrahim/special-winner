import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";

export type UpsertGuestUserResult = {
  userRow: typeof users.$inferSelect;
  wasNewUser: boolean;
  normalizedEmail: string;
};

/**
 * Upsert a guest user by email, assigning the parent role to new users.
 * Returns the user row, a flag indicating if this was a new insert, and the
 * normalized email.
 *
 * De-dupes on the CANONICAL email (Gmail dot/+tag normalization — see
 * normalizeForUniqueness), the same key /api/auth/check-email and
 * /api/auth/signup use, so `johndoe@gmail.com` correctly collides with an
 * existing `john.doe@gmail.com` account instead of minting a duplicate.
 *
 * onConflictDoNothing is deliberately bare (no target): some rows created
 * before the email_canonical backfill (migration 0028) — or by this helper
 * prior to this fix — may still carry a NULL canonical, so a same-raw-email
 * insert could still collide on the `email` unique constraint rather than
 * `email_canonical`. Omitting the target lets Postgres treat a conflict on
 * *either* unique constraint as "do nothing", and the re-fetch below mirrors
 * signin.ts's canonical-first / raw-email-fallback + self-heal pattern.
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
  const emailCanonical = normalizeForUniqueness(opts.email);
  let wasNewUser = false;

  const insertedUsers = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      emailCanonical,
      passwordHash: null,
      firstName: opts.firstName,
      lastName: opts.lastName,
      phone: opts.phone ?? null,
      birthDate: opts.birthDate ?? null,
      emailVerified: false,
    })
    .onConflictDoNothing()
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
    // Either an account with this canonical email already existed, or a
    // concurrent insert won the race. Look up by canonical form first (the
    // real uniqueness key); fall back to raw email for pre-canonical rows
    // and self-heal the canonical column on match, mirroring signin.ts.
    let existing = await db
      .select()
      .from(users)
      .where(eq(users.emailCanonical, emailCanonical))
      .then((rows) => rows[0]);
    if (!existing) {
      existing = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .then((rows) => rows[0]);
      if (existing && existing.emailCanonical !== emailCanonical) {
        await db
          .update(users)
          .set({ emailCanonical })
          .where(eq(users.id, existing.id));
        existing = { ...existing, emailCanonical };
      }
    }
    if (!existing) {
      // Should be impossible — log and 500
      throw new Error("User row vanished after upsert race");
    }
    userRow = existing;
  }

  return { userRow, wasNewUser, normalizedEmail };
}

import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema/users";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import type { ConsentTx } from "@/lib/consents/marketing";

/**
 * Resolve-or-create the PASSWORDLESS user behind a marketing opt-in.
 *
 * No password hash, no session, no org role: this person opted into marketing,
 * they did not sign up for an account. Matching an existing account on the
 * canonical email is a MATCH, not an authentication — which is exactly why the
 * callers write `pending` consent and never clear an existing opt-out.
 */
export async function resolveMarketingUser(
  db: ConsentTx,
  person: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  },
): Promise<string> {
  const emailCanonical = normalizeForUniqueness(person.email);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailCanonical, emailCanonical))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      email: person.email,
      emailCanonical,
      firstName: person.firstName ?? null,
      lastName: person.lastName ?? null,
      phone: person.phone ?? null,
      passwordHash: null,
      emailVerified: false,
      phoneVerified: false,
    })
    .onConflictDoNothing({ target: users.emailCanonical })
    .returning({ id: users.id });
  if (created) return created.id;

  const [raced] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailCanonical, emailCanonical))
    .limit(1);
  if (!raced) throw new Error("Failed to resolve the marketing user record");
  return raced.id;
}

import { eq, and, sql, asc } from "drizzle-orm";
import { familyMembers } from "@/lib/db/schema";
import type { getDb } from "@/lib/db";
import type { FamilyMember } from "@/lib/db/schema/registrations";

// Accept both the top-level db handle and a transaction handle, so callers
// can run resolvePerson inside a db.transaction(...) block. The transaction
// type is derived from the db's own transaction() signature.
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Database = Db | Tx;

// Mirrors the `gender` pgEnum on family_members.
type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export type ResolvePersonInput =
  | {
      kind: "self";
      user: {
        id: string;
        firstName: string;
        lastName: string;
        birthDate: string;
        gender?: Gender | null;
      };
    }
  | {
      kind: "dependent";
      parentUserId: string;
      firstName: string;
      lastName: string;
      birthDate: string;
      gender?: Gender | null;
      medicalNotes?: string | null;
    };

/**
 * Find-or-create the family_members row this registration should point to.
 * For "self" inputs, returns the user's self-row (creates one if none exists).
 * For "dependent" inputs, dedupes by (parentUserId, lower(firstName),
 * lower(lastName), birthDate) — same logic the guest-checkout flow used inline.
 */
export async function resolvePerson(
  db: Database,
  input: ResolvePersonInput,
): Promise<FamilyMember> {
  if (input.kind === "self") {
    const existing = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.selfUserId, input.user.id))
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    if (existing[0]) return existing[0];

    const [created] = await db
      .insert(familyMembers)
      .values({
        selfUserId: input.user.id,
        firstName: input.user.firstName,
        lastName: input.user.lastName,
        birthDate: input.user.birthDate,
        gender: input.user.gender ?? null,
      })
      .returning();
    return created;
  }

  // dependent path — preserves existing dedupe logic from guest-checkout
  const firstLower = input.firstName.toLowerCase();
  const lastLower = input.lastName.toLowerCase();
  const existing = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.parentUserId, input.parentUserId),
        sql`lower(${familyMembers.firstName}) = ${firstLower}`,
        sql`lower(${familyMembers.lastName}) = ${lastLower}`,
        eq(familyMembers.birthDate, input.birthDate),
      ),
    )
    .orderBy(asc(familyMembers.createdAt))
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(familyMembers)
    .values({
      parentUserId: input.parentUserId,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      gender: input.gender ?? null,
      medicalNotes: input.medicalNotes ?? null,
    })
    .returning();
  return created;
}

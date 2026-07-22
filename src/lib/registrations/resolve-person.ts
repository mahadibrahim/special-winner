import { eq, and, sql, asc } from "drizzle-orm";
import { familyMembers, roles, userRoles } from "@/lib/db/schema";
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
        // Nullable: v2 adult self-registrants may defer their DOB to a
        // post-payment step. Self rows dedupe by selfUserId, not birthDate,
        // so a missing DOB here is not a dedupe hazard.
        birthDate: string | null;
        gender?: Gender | null;
      };
    }
  | {
      kind: "dependent";
      parentUserId: string;
      firstName: string;
      lastName: string;
      // Dependents always carry a DOB (v1 youth/COPPA flow, unchanged) — the
      // dedupe below matches on it, so it must be present.
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

  // Creating a first dependent is the actual signal of parenthood — grant
  // the (global-scoped, matching the old signup grant) parent role here
  // rather than at signup, where it mislabeled every adult. Idempotent and
  // best-effort: a grant failure must not fail the registration.
  try {
    await ensureParentRole(db, input.parentUserId);
  } catch (err) {
    console.error("[resolvePerson] parent role grant failed:", err);
  }

  return created;
}

async function ensureParentRole(db: Database, userId: string): Promise<void> {
  const [parentRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "parent"))
    .limit(1);
  if (!parentRole) return;

  const existing = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, parentRole.id)))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(userRoles).values({
    userId,
    roleId: parentRole.id,
    scopeType: "global",
  });
}

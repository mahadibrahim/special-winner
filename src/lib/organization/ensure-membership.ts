import { and, eq } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";

// Accept both the top-level db handle and a transaction handle.
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Database = Db | Tx;

/**
 * Record that a user is a customer of an organization. Idempotent.
 *
 * user_organization_access is the source of truth for "belongs to this org"
 * (admin directory visibility + the role-assignment membership gate). Organic
 * flows — season registration, drop-in booking — call this so self-signed-up
 * customers are visible to their org, matching what the invite, hire, and
 * walk-up flows already record.
 *
 * Note: the (user_id, organization_id, location_id) unique constraint does
 * not dedupe NULL-location rows (Postgres treats NULLs as distinct), hence
 * select-then-insert. A concurrent double-submit can produce a duplicate row;
 * membership checks are existence-only, so duplicates are harmless.
 */
export async function ensureCustomerOrgMembership(
  db: Database,
  userId: string,
  organizationId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: userOrganizationAccess.id })
    .from(userOrganizationAccess)
    .where(
      and(
        eq(userOrganizationAccess.userId, userId),
        eq(userOrganizationAccess.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (existing) return;

  await db.insert(userOrganizationAccess).values({
    userId,
    organizationId,
    role: "parent",
    acceptedAt: new Date(),
  });
}

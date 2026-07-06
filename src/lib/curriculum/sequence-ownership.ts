import { getDb } from "@/lib/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { curriculumSequences } from "@/lib/db/schema";

/**
 * Sequences with organizationId === null are global: every org admin can
 * read them (and attach them to their own seasons), but only super_admins
 * may mutate them — same model as practice templates. Cross-tenant ids
 * resolve to null; callers respond 404 via ownershipDeniedResponse()
 * (deliberately conflated with "not found", matching
 * src/lib/auth/require-resource-ownership.ts).
 *
 * No orderBy needed on the .limit(1): this is a primary-key eq lookup —
 * at most one row exists by construction.
 */
export async function loadSequenceForOrg(
  orgId: string,
  sequenceId: string,
): Promise<{
  id: string;
  organizationId: string | null;
  sportId: string;
  developmentStageId: string;
  name: string;
} | null> {
  const [row] = await getDb()
    .select({
      id: curriculumSequences.id,
      organizationId: curriculumSequences.organizationId,
      sportId: curriculumSequences.sportId,
      developmentStageId: curriculumSequences.developmentStageId,
      name: curriculumSequences.name,
    })
    .from(curriculumSequences)
    .where(
      and(
        eq(curriculumSequences.id, sequenceId),
        or(
          eq(curriculumSequences.organizationId, orgId),
          isNull(curriculumSequences.organizationId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

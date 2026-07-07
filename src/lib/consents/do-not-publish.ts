import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  mediaDoNotPublish,
  familyMembers,
  mediaTags,
  mediaAssets,
} from "@/lib/db/schema";

/**
 * Media individual opt-out / do-not-publish domain lib (product-backlog
 * build #3). Single chokepoint for reading/writing `media_do_not_publish` —
 * see `src/lib/db/schema/media-do-not-publish.ts` for the table shape and
 * the "individual only, teams can't opt out" framing.
 */

export interface DoNotPublishMatch {
  familyMemberId: string;
  firstName: string;
  lastName: string;
  reason: string | null;
}

export interface SetDoNotPublishInput {
  db: Database;
  organizationId: string;
  familyMemberId: string;
  reason?: string | null;
  setByUserId: string;
}

export interface ClearDoNotPublishInput {
  db: Database;
  organizationId: string;
  familyMemberId: string;
  removedByUserId: string;
}

/**
 * Marks a family_member as do-not-publish for the org. If an active row
 * already exists for (organizationId, familyMemberId), updates its reason
 * in place (the partial unique index `media_do_not_publish_one_active_per_org_fm`
 * makes this an upsert via onConflictDoUpdate — no read-then-write race).
 * If the only existing row(s) are inactive (previously cleared), inserts a
 * fresh active row rather than reviving the old one, preserving history.
 */
export async function setDoNotPublish(
  input: SetDoNotPublishInput,
): Promise<{ id: string }> {
  const [row] = await input.db
    .insert(mediaDoNotPublish)
    .values({
      organizationId: input.organizationId,
      familyMemberId: input.familyMemberId,
      reason: input.reason ?? null,
      active: true,
      setByUserId: input.setByUserId,
    })
    .onConflictDoUpdate({
      target: [mediaDoNotPublish.organizationId, mediaDoNotPublish.familyMemberId],
      targetWhere: sql`${mediaDoNotPublish.active}`,
      set: {
        reason: input.reason ?? null,
        setByUserId: input.setByUserId,
        updatedAt: new Date(),
      },
    })
    .returning({ id: mediaDoNotPublish.id });

  return { id: row.id };
}

/**
 * Clears the active opt-out for (organizationId, familyMemberId), if any.
 * Sets active=false and stamps removedByUserId/removedAt rather than
 * deleting — the row remains as a takedown-history record. Returns true if
 * an active row was found and cleared, false if there was nothing to clear.
 */
export async function clearDoNotPublish(
  input: ClearDoNotPublishInput,
): Promise<boolean> {
  const rows = await input.db
    .update(mediaDoNotPublish)
    .set({
      active: false,
      removedByUserId: input.removedByUserId,
      removedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(mediaDoNotPublish.organizationId, input.organizationId),
        eq(mediaDoNotPublish.familyMemberId, input.familyMemberId),
        eq(mediaDoNotPublish.active, true),
      ),
    )
    .returning({ id: mediaDoNotPublish.id });

  return rows.length > 0;
}

/**
 * True if the family_member has an active do-not-publish flag in the org.
 */
export async function isDoNotPublish(
  db: Database,
  organizationId: string,
  familyMemberId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: mediaDoNotPublish.id })
    .from(mediaDoNotPublish)
    .where(
      and(
        eq(mediaDoNotPublish.organizationId, organizationId),
        eq(mediaDoNotPublish.familyMemberId, familyMemberId),
        eq(mediaDoNotPublish.active, true),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * The org's active opt-out list — the photographer/editor "do not feature
 * these people" reference list. Ordered by name for stable pagination-free
 * display (explicit orderBy per the multi-tenant query-hazard convention).
 */
export async function getDoNotPublishForOrg(
  db: Database,
  organizationId: string,
): Promise<DoNotPublishMatch[]> {
  const rows = await db
    .select({
      familyMemberId: mediaDoNotPublish.familyMemberId,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
      reason: mediaDoNotPublish.reason,
    })
    .from(mediaDoNotPublish)
    .innerJoin(familyMembers, eq(mediaDoNotPublish.familyMemberId, familyMembers.id))
    .where(
      and(
        eq(mediaDoNotPublish.organizationId, organizationId),
        eq(mediaDoNotPublish.active, true),
      ),
    )
    .orderBy(familyMembers.lastName, familyMembers.firstName);

  return rows;
}

/**
 * Individuals face-tagged in the given shoot session who are ALSO on the
 * org's active opt-out list. This is the input to the publish gate's
 * face-tag suppression — see `checkSessionPublishConsent()` in
 * `src/lib/consents/publish-check.ts`. Deliberately scoped to face tags
 * (`mediaTags.familyMemberId IS NOT NULL`) — team tags never feed this
 * check, so a team/wide session with no face tags always returns [].
 */
export async function getFaceTaggedDoNotPublishForSession(
  db: Database,
  sessionId: string,
  organizationId: string,
): Promise<DoNotPublishMatch[]> {
  const rows = await db
    .selectDistinct({
      familyMemberId: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
      reason: mediaDoNotPublish.reason,
    })
    .from(mediaTags)
    .innerJoin(mediaAssets, eq(mediaTags.mediaAssetId, mediaAssets.id))
    .innerJoin(familyMembers, eq(mediaTags.familyMemberId, familyMembers.id))
    .innerJoin(
      mediaDoNotPublish,
      eq(mediaDoNotPublish.familyMemberId, familyMembers.id),
    )
    .where(
      and(
        eq(mediaAssets.shootSessionId, sessionId),
        isNotNull(mediaTags.familyMemberId),
        eq(mediaDoNotPublish.organizationId, organizationId),
        eq(mediaDoNotPublish.active, true),
      ),
    )
    .orderBy(familyMembers.lastName, familyMembers.firstName);

  return rows;
}

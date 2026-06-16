import { and, eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { shootSessions, mediaStaffProfiles } from "@/lib/db/schema/media";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";

export type TaggingQueueItem = {
  sessionId: string;
  sessionType: string;
  scheduledStart: Date;
  placeName: string;
};

/**
 * Sessions waiting for an editor to tag: status 'tagging', within the editor's
 * active service area. Effective location = session.locationId, else the
 * session's venue's locationId (matches tag-permissions.ts). Inactive/absent
 * profile, or empty service area → [].
 */
export async function getTaggingQueue(editorUserId: string): Promise<TaggingQueueItem[]> {
  const db = getDb();
  const profile = await db.query.mediaStaffProfiles.findFirst({
    where: eq(mediaStaffProfiles.userId, editorUserId),
    columns: { serviceLocationIds: true, active: true, organizationId: true },
    orderBy: (p, { asc: a }) => a(p.createdAt),
  });
  if (!profile || profile.active === false) return [];
  const serviceIds = profile.serviceLocationIds ?? [];
  if (serviceIds.length === 0) return [];

  const rows = await db
    .select({
      sessionId: shootSessions.id,
      sessionType: shootSessions.sessionType,
      scheduledStart: shootSessions.scheduledStart,
      updatedAt: shootSessions.updatedAt,
      sessionLocationId: shootSessions.locationId,
      venueLocationId: venues.locationId,
      venueName: venues.name,
      locationName: locations.name,
    })
    .from(shootSessions)
    .leftJoin(venues, eq(venues.id, shootSessions.venueId))
    .leftJoin(locations, eq(locations.id, shootSessions.locationId))
    .where(and(eq(shootSessions.organizationId, profile.organizationId), eq(shootSessions.status, "tagging")))
    .orderBy(asc(shootSessions.updatedAt));

  return rows
    .map((r) => ({ ...r, effectiveLocationId: r.sessionLocationId ?? r.venueLocationId }))
    .filter((r): r is typeof r & { effectiveLocationId: string } =>
      r.effectiveLocationId != null && serviceIds.includes(r.effectiveLocationId))
    .map((r) => ({
      sessionId: r.sessionId,
      sessionType: r.sessionType,
      scheduledStart: r.scheduledStart,
      placeName: r.locationName ?? r.venueName ?? "Unknown",
    }));
}

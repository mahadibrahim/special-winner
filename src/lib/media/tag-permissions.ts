import { getDb } from "@/lib/db";
import { shootSessions, mediaStaffProfiles } from "@/lib/db/schema/media";
import { venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserRoles, isAdmin } from "@/lib/auth/roles";

export type TagPermission =
  | { allowed: true; role: "admin" | "media_editor" }
  | { allowed: false; reason: string };

export async function canTagSession(
  userId: string,
  sessionId: string
): Promise<TagPermission> {
  const db = getDb();
  const session = await db.query.shootSessions.findFirst({
    where: eq(shootSessions.id, sessionId),
    columns: {
      id: true,
      locationId: true,
      venueId: true,
      status: true,
    },
    orderBy: (t, { asc }) => asc(t.createdAt),
  });
  if (!session) return { allowed: false, reason: "Session not found" };

  if (await isAdmin(userId)) {
    return { allowed: true, role: "admin" };
  }

  const roles = await getUserRoles(userId);
  const isEditor = roles.some((r) => r.name === "media_editor");
  if (!isEditor) return { allowed: false, reason: "Not a media editor" };

  if (session.status !== "tagging") {
    return {
      allowed: false,
      reason: "Editors may only tag sessions in 'tagging' state",
    };
  }

  let sessionLocationId = session.locationId;
  if (!sessionLocationId && session.venueId) {
    const v = await db.query.venues.findFirst({
      where: eq(venues.id, session.venueId),
      columns: { locationId: true },
      orderBy: (t, { asc }) => asc(t.createdAt),
    });
    sessionLocationId = v?.locationId ?? null;
  }
  if (!sessionLocationId) {
    return { allowed: false, reason: "Session has no location" };
  }

  const profile = await db.query.mediaStaffProfiles.findFirst({
    where: eq(mediaStaffProfiles.userId, userId),
    columns: { serviceLocationIds: true, active: true },
    // userId should be 1-to-1 with profiles; orderBy keeps this deterministic
    // if the uniqueness isn't enforced by schema.
    orderBy: (p, { asc }) => asc(p.createdAt),
  });
  if (!profile || profile.active === false) {
    return { allowed: false, reason: "No active media staff profile" };
  }
  const allowed = (profile.serviceLocationIds ?? []).includes(sessionLocationId);
  if (!allowed) {
    return {
      allowed: false,
      reason: "Session location not in editor's service area",
    };
  }
  return { allowed: true, role: "media_editor" };
}

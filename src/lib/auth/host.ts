import type { APIContext } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostProfiles, type HostProfile } from "@/lib/db/schema/hosts";
import { dropInSessions, type DropInSession } from "@/lib/db/schema/drop-in";

/**
 * Host authorization helpers (coach-helper pattern, src/lib/auth/roles.ts).
 * A "host" is not an RBAC role: authorization = an ACTIVE host_profiles row
 * in the request org, and per-session powers require additionally that
 * drop_in_sessions.host_user_id = the caller. 404 (not 403) on wrong-session
 * access, mirroring require-resource-ownership's cross-tenant convention.
 */

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function getHostProfile(
  userId: string,
  organizationId: string,
): Promise<HostProfile | null> {
  const [profile] = await getDb()
    .select()
    .from(hostProfiles)
    .where(
      and(
        eq(hostProfiles.userId, userId),
        eq(hostProfiles.organizationId, organizationId),
      ),
    )
    .orderBy(asc(hostProfiles.createdAt))
    .limit(1);
  return profile ?? null;
}

export type HostAuth =
  | {
      authorized: true;
      userId: string;
      organizationId: string;
      profile: HostProfile;
    }
  | { authorized: false; response: Response };

export async function requireActiveHost(context: APIContext): Promise<HostAuth> {
  const user = context.locals.user;
  if (!user) {
    return { authorized: false, response: json({ error: "Unauthorized" }, 401) };
  }
  const org = context.locals.organization;
  if (!org) {
    return {
      authorized: false,
      response: json({ error: "No organization context" }, 400),
    };
  }
  const profile = await getHostProfile(user.id, org.id);
  if (!profile || profile.status !== "active") {
    return {
      authorized: false,
      response: json(
        { error: "Not an active host", hostStatus: profile?.status ?? null },
        403,
      ),
    };
  }
  return { authorized: true, userId: user.id, organizationId: org.id, profile };
}

export type HostSessionAuth =
  | {
      authorized: true;
      userId: string;
      organizationId: string;
      profile: HostProfile;
      session: DropInSession;
    }
  | { authorized: false; response: Response };

export async function requireHostOfSession(
  context: APIContext,
  sessionId: string,
): Promise<HostSessionAuth> {
  const base = await requireActiveHost(context);
  if (!base.authorized) return base;

  const [session] = await getDb()
    .select()
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, sessionId),
        eq(dropInSessions.organizationId, base.organizationId),
        eq(dropInSessions.hostUserId, base.userId),
      ),
    )
    .limit(1);
  if (!session) {
    return {
      authorized: false,
      response: json({ error: "Session not found" }, 404),
    };
  }
  return { ...base, session };
}

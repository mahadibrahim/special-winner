import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { mediaStaffProfiles } from "@/lib/db/schema/media";
import { and, eq, or } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.avatarUrl,
      active: mediaStaffProfiles.active,
      serviceLocationIds: mediaStaffProfiles.serviceLocationIds,
      onboardedAt: mediaStaffProfiles.onboardedAt,
    })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    // Optional join to locations so location-scoped roles can be resolved to an org
    .leftJoin(locations, eq(locations.id, userRoles.scopeId))
    // True left join: pre-onboarding users with no profile row must still appear
    .leftJoin(mediaStaffProfiles, eq(mediaStaffProfiles.userId, users.id))
    .where(
      and(
        eq(roles.name, "media_staff"),
        // Scope guard: match either an org-scoped role (invite flow)
        // or a location-scoped role whose location belongs to this org (seed/legacy).
        // Filtering here — on userRoles, not on the optional mediaStaffProfiles —
        // preserves the true left-join semantics for pre-onboarding users.
        or(
          eq(userRoles.scopeId, org.organizationId),
          eq(locations.organizationId, org.organizationId)
        )
      )
    );

  return new Response(JSON.stringify({ staff: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

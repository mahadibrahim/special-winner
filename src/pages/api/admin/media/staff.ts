import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { mediaStaffProfiles } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
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
    .leftJoin(mediaStaffProfiles, eq(mediaStaffProfiles.userId, users.id))
    .where(
      and(
        eq(roles.name, "media_staff"),
        // organization scope on profile (or null if not onboarded yet)
        eq(mediaStaffProfiles.organizationId, org.organizationId)
      )
    );

  return new Response(JSON.stringify({ staff: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

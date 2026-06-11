/**
 * GET /api/admin/referees
 *
 * Users holding the referee role in this organization — feeds the
 * ref-assignment picker on /admin/games. Assign the role itself via
 * the existing /admin/users role dialog (Referee option).
 */
import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const rows = await getDb()
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(roles.name, "referee"),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, orgContext.organizationId),
      ),
    )
    .orderBy(asc(users.firstName), asc(users.lastName));

  return new Response(JSON.stringify({ referees: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

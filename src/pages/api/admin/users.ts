import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, userRoles, roles, locations, programs, teams, seasons } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { eq, asc, desc, ilike, or, and, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const updateUserSchema = z.object({
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleName: z.enum(["super_admin", "location_admin", "coach", "parent", "player"]),
  scopeType: z.enum(["global", "organization", "location", "program", "team"]).default("global"),
  scopeId: z.string().uuid().optional().nullable(),
});

// GET - List users with roles in this organization
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const search = url.searchParams.get("search");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Get locations, programs, and teams for this organization to determine valid scope IDs
    const orgLocations = await getDb()
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, orgContext.organizationId));
    const locationIds = orgLocations.map((l) => l.id);

    const orgPrograms = locationIds.length > 0
      ? await getDb()
          .select({ id: programs.id })
          .from(programs)
          .where(inArray(programs.locationId, locationIds))
      : [];
    const programIds = orgPrograms.map((p) => p.id);

    const orgSeasons = programIds.length > 0
      ? await getDb()
          .select({ id: seasons.id })
          .from(seasons)
          .where(inArray(seasons.programId, programIds))
      : [];
    const seasonIds = orgSeasons.map((s) => s.id);

    const orgTeams = seasonIds.length > 0
      ? await getDb()
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.seasonId, seasonIds))
      : [];
    const teamIds = orgTeams.map((t) => t.id);

    // Get user IDs who have roles tied to this organization or its entities.
    // Includes:
    //   - global-scoped role-holders (super-admins are visible in every org)
    //   - org-scoped roles for this org
    //   - location/program/team-scoped roles for entities under this org
    const orgUserRoles = await getDb()
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(
        or(
          // Global-scoped roles (super-admins) — they belong to every org's
          // view since they administer the whole platform.
          eq(userRoles.scopeType, "global"),
          // Organization-scoped roles
          and(
            eq(userRoles.scopeType, "organization"),
            eq(userRoles.scopeId, orgContext.organizationId)
          ),
          // Location-scoped roles
          ...(locationIds.length > 0
            ? [and(eq(userRoles.scopeType, "location"), inArray(userRoles.scopeId, locationIds))]
            : []),
          // Program-scoped roles
          ...(programIds.length > 0
            ? [and(eq(userRoles.scopeType, "program"), inArray(userRoles.scopeId, programIds))]
            : []),
          // Team-scoped roles
          ...(teamIds.length > 0
            ? [and(eq(userRoles.scopeType, "team"), inArray(userRoles.scopeId, teamIds))]
            : [])
        )
      );

    // Also include users explicitly granted access to this org via
    // user_organization_access (the legitimate non-role membership signal,
    // used for parents and players who have no role but belong to the org).
    const orgAccessRows = await getDb()
      .select({ userId: userOrganizationAccess.userId })
      .from(userOrganizationAccess)
      .where(eq(userOrganizationAccess.organizationId, orgContext.organizationId));

    const userIdsInOrg = [
      ...new Set([
        ...orgUserRoles.map((ur) => ur.userId),
        ...orgAccessRows.map((a) => a.userId),
      ]),
    ];

    if (userIdsInOrg.length === 0) {
      return new Response(
        JSON.stringify({
          users: [],
          pagination: { page, limit, totalCount: 0, totalPages: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build query filtered to users in this organization
    let conditions = [inArray(users.id, userIdsInOrg)];
    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.firstName, `%${search}%`),
          ilike(users.lastName, `%${search}%`)
        )!
      );
    }

    const allUsers = await getDb()
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const [countResult] = await getDb()
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(...conditions));
    const totalCount = Number(countResult.count);

    // Get roles for all users in one query instead of one query per user.
    const pageUserIds = allUsers.map((u) => u.id);
    const allRoleRows =
      pageUserIds.length > 0
        ? await getDb()
            .select({
              userId: userRoles.userId,
              id: userRoles.id,
              roleId: userRoles.roleId,
              scopeType: userRoles.scopeType,
              scopeId: userRoles.scopeId,
              roleName: roles.name,
            })
            .from(userRoles)
            .leftJoin(roles, eq(userRoles.roleId, roles.id))
            .where(inArray(userRoles.userId, pageUserIds))
        : [];

    const rolesByUser = new Map<string, Array<Omit<(typeof allRoleRows)[number], "userId">>>();
    for (const { userId, ...role } of allRoleRows) {
      const list = rolesByUser.get(userId) ?? [];
      list.push(role);
      rolesByUser.set(userId, list);
    }

    const usersWithRoles = allUsers.map((u) => ({
      ...u,
      roles: rolesByUser.get(u.id) ?? [],
    }));

    return new Response(
      JSON.stringify({
        users: usersWithRoles,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching users:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch users" }), { status: 500 });
  }
};

// PUT - Update user profile
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "User ID is required" }), { status: 400 });
    }

    // Verify user has a role in this organization
    const userOrgRole = await getDb()
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(
        eq(userRoles.userId, id),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, orgContext.organizationId)
      ))
      .limit(1);

    if (userOrgRole.length === 0) {
      // Also check for location/program/team scoped roles
      const orgLocations = await getDb()
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, orgContext.organizationId));

      if (orgLocations.length > 0) {
        const locationIds = orgLocations.map((l) => l.id);
        const locationRole = await getDb()
          .select({ id: userRoles.id })
          .from(userRoles)
          .where(and(
            eq(userRoles.userId, id),
            eq(userRoles.scopeType, "location"),
            inArray(userRoles.scopeId, locationIds)
          ))
          .limit(1);

        if (locationRole.length === 0) {
          return new Response(JSON.stringify({ error: "User not found in this organization" }), { status: 404 });
        }
      } else {
        return new Response(JSON.stringify({ error: "User not found in this organization" }), { status: 404 });
      }
    }

    const result = updateUserSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [updatedUser] = await getDb()
      .update(users)
      .set({
        ...result.data,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!updatedUser) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ user: updatedUser }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating user:", error);
    return new Response(JSON.stringify({ error: "Failed to update user" }), { status: 500 });
  }
};

// POST - Assign role to user
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = assignRoleSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the scope is valid for this organization
    const { scopeType } = result.data;
    // For org-scoped roles, default scopeId to the current org if missing —
    // the UI dialog doesn't expose a scope picker, so callers send the
    // role name only. Explicitly-provided scopeIds still get validated.
    let scopeId = result.data.scopeId ?? null;
    if (scopeType === "organization") {
      if (scopeId === null) {
        scopeId = orgContext.organizationId;
      } else if (scopeId !== orgContext.organizationId) {
        return new Response(JSON.stringify({ error: "Cannot assign roles to other organizations" }), { status: 403 });
      }
    }

    if (scopeType === "location" && scopeId) {
      const location = await getDb().query.locations.findFirst({
        where: and(eq(locations.id, scopeId), eq(locations.organizationId, orgContext.organizationId)),
        orderBy: (t, { asc }) => asc(t.createdAt),
      });
      if (!location) {
        return new Response(JSON.stringify({ error: "Location not found in this organization" }), { status: 404 });
      }
    }

    if (scopeType === "program" && scopeId) {
      const [program] = await getDb()
        .select({ id: programs.id })
        .from(programs)
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(eq(programs.id, scopeId), eq(locations.organizationId, orgContext.organizationId)));
      if (!program) {
        return new Response(JSON.stringify({ error: "Program not found in this organization" }), { status: 404 });
      }
    }

    if (scopeType === "team" && scopeId) {
      const [team] = await getDb()
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(eq(teams.id, scopeId), eq(locations.organizationId, orgContext.organizationId)));
      if (!team) {
        return new Response(JSON.stringify({ error: "Team not found in this organization" }), { status: 404 });
      }
    }

    // Only super-admins can promote another user to super_admin (the only
    // role that uses scopeType="global"). The auth check earlier in this
    // handler (requireAdminAccess) does NOT distinguish super_admin from
    // location_admin, so we have to re-check here.
    if (scopeType === "global") {
      const assignerRoles = (context.locals.userRoles ?? []).map((r) => r.name);
      if (!assignerRoles.includes("super_admin")) {
        return new Response(
          JSON.stringify({ error: "Only super-admins can assign global roles" }),
          { status: 403 },
        );
      }
      if (result.data.roleName !== "super_admin") {
        return new Response(
          JSON.stringify({ error: "Only super_admin uses global scope" }),
          { status: 400 },
        );
      }
    }

    // Find the role by name — explicit orderBy for CI determinism
    const role = await getDb().query.roles.findFirst({
      where: eq(roles.name, result.data.roleName),
      orderBy: (t, { asc }) => asc(t.id),
    });

    if (!role) {
      return new Response(JSON.stringify({ error: "Role not found" }), { status: 404 });
    }

    // Check if user already has this role with same scope
    const existingRole = await getDb().query.userRoles.findFirst({
      where: (ur) =>
        eq(ur.userId, result.data.userId) &&
        eq(ur.roleId, role.id) &&
        eq(ur.scopeType, result.data.scopeType),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    if (existingRole) {
      return new Response(
        JSON.stringify({ error: "User already has this role" }),
        { status: 409 }
      );
    }

    // Assign the role. Use the resolved scopeId (which may have been
    // filled in above when the caller omitted it for an org-scoped role).
    const [newUserRole] = await getDb()
      .insert(userRoles)
      .values({
        userId: result.data.userId,
        roleId: role.id,
        scopeType: result.data.scopeType,
        scopeId,
      })
      .returning();

    return new Response(JSON.stringify({ userRole: newUserRole }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error assigning role:", error);
    return new Response(JSON.stringify({ error: "Failed to assign role" }), { status: 500 });
  }
};

// DELETE - Remove role from user
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const userRoleId = url.searchParams.get("userRoleId");

    if (!userRoleId) {
      return new Response(JSON.stringify({ error: "User role ID is required" }), { status: 400 });
    }

    // Verify the role being deleted is scoped to this organization
    const roleToDelete = await getDb().query.userRoles.findFirst({
      where: eq(userRoles.id, userRoleId),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    if (!roleToDelete) {
      return new Response(JSON.stringify({ error: "User role not found" }), { status: 404 });
    }

    // Check if the role's scope is within this organization
    const { scopeType, scopeId } = roleToDelete;

    if (scopeType === "global") {
      return new Response(JSON.stringify({ error: "Cannot remove global roles" }), { status: 403 });
    }

    if (scopeType === "organization" && scopeId !== orgContext.organizationId) {
      return new Response(JSON.stringify({ error: "Role not found in this organization" }), { status: 404 });
    }

    if (scopeType === "location" && scopeId) {
      const location = await getDb().query.locations.findFirst({
        where: and(eq(locations.id, scopeId), eq(locations.organizationId, orgContext.organizationId)),
        orderBy: (t, { asc }) => asc(t.createdAt),
      });
      if (!location) {
        return new Response(JSON.stringify({ error: "Role not found in this organization" }), { status: 404 });
      }
    }

    if (scopeType === "program" && scopeId) {
      const [program] = await getDb()
        .select({ id: programs.id })
        .from(programs)
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(eq(programs.id, scopeId), eq(locations.organizationId, orgContext.organizationId)));
      if (!program) {
        return new Response(JSON.stringify({ error: "Role not found in this organization" }), { status: 404 });
      }
    }

    if (scopeType === "team" && scopeId) {
      const [team] = await getDb()
        .select({ id: teams.id })
        .from(teams)
        .innerJoin(seasons, eq(teams.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .where(and(eq(teams.id, scopeId), eq(locations.organizationId, orgContext.organizationId)));
      if (!team) {
        return new Response(JSON.stringify({ error: "Role not found in this organization" }), { status: 404 });
      }
    }

    await getDb().delete(userRoles).where(eq(userRoles.id, userRoleId));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error removing role:", error);
    return new Response(JSON.stringify({ error: "Failed to remove role" }), { status: 500 });
  }
};

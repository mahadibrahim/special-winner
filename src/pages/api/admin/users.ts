import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, userRoles, roles, locations, programs, teams, seasons, familyMembers } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { eq, asc, desc, ilike, or, and, sql, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { requireUserInOrg } from "@/lib/auth/require-resource-ownership";

const updateUserSchema = z.object({
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});

const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleName: z.enum(["super_admin", "location_admin", "coach", "parent", "player", "referee"]),
  scopeType: z.enum(["global", "organization", "location", "program", "team"]).default("global"),
  scopeId: z.string().uuid().optional().nullable(),
});

// GET - List users with roles in this organization
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const search = url.searchParams.get("search");
    // Directory filter: a staff role name, or the derived person types
    // "parent" (has dependents) / "player" (has a self family-member row).
    // Derived types deliberately ignore the legacy auto-granted parent
    // role — see resolvePerson for where the role is granted now.
    const filter = url.searchParams.get("filter");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Org entity scope IDs as lazy subqueries — these used to be four
    // sequential round trips (locations → programs → seasons → teams)
    // before the role query could even start. As subqueries they ship
    // inside the role query and Postgres resolves the chain in one trip.
    const db2 = getDb();
    const locationIdsQ = db2
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, auth.organizationId));
    const programIdsQ = db2
      .select({ id: programs.id })
      .from(programs)
      .where(inArray(programs.locationId, locationIdsQ));
    const seasonIdsQ = db2
      .select({ id: seasons.id })
      .from(seasons)
      .where(inArray(seasons.programId, programIdsQ));
    const teamIdsQ = db2
      .select({ id: teams.id })
      .from(teams)
      .where(inArray(teams.seasonId, seasonIdsQ));
    const superAdminRoleIdsQ = db2
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "super_admin"));

    // Get user IDs who have roles tied to this organization or its entities,
    // and users explicitly granted access via user_organization_access (the
    // legitimate non-role membership signal, used for parents and players
    // who have no role but belong to the org). Independent — run in parallel.
    const [orgUserRoles, orgAccessRows] = await Promise.all([
      // Role-holders:
      //   - global-scoped super_admins only (platform owners are visible in
      //     every org's view). Other global-scoped roles — the legacy parent
      //     grant from resolvePerson — must NOT leak users across tenants;
      //     customers appear via their user_organization_access row instead
      //     (granted at registration/booking, backfilled by migration 0082).
      //   - org-scoped roles for this org
      //   - location/program/team-scoped roles for entities under this org
      getDb()
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(
          or(
            and(
              eq(userRoles.scopeType, "global"),
              inArray(userRoles.roleId, superAdminRoleIdsQ)
            ),
            and(
              eq(userRoles.scopeType, "organization"),
              eq(userRoles.scopeId, auth.organizationId)
            ),
            and(eq(userRoles.scopeType, "location"), inArray(userRoles.scopeId, locationIdsQ)),
            and(eq(userRoles.scopeType, "program"), inArray(userRoles.scopeId, programIdsQ)),
            and(eq(userRoles.scopeType, "team"), inArray(userRoles.scopeId, teamIdsQ))
          )
        ),
      getDb()
        .select({ userId: userOrganizationAccess.userId })
        .from(userOrganizationAccess)
        .where(eq(userOrganizationAccess.organizationId, auth.organizationId)),
    ]);

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
    if (filter === "parent") {
      conditions.push(
        sql`exists (select 1 from family_members fm where fm.parent_user_id = ${users.id})`
      );
    } else if (filter === "player") {
      conditions.push(
        sql`exists (select 1 from family_members fm where fm.self_user_id = ${users.id})`
      );
    } else if (
      filter &&
      (roles.name.enumValues as readonly string[]).includes(filter)
    ) {
      const roleHoldersQ = db2
        .select({ id: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(roles.name, filter as (typeof roles.name.enumValues)[number]));
      conditions.push(inArray(users.id, roleHoldersQ));
    }
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

    // Derived person type for the page's users: parent beats player.
    const [dependentParents, selfPlayers] =
      pageUserIds.length > 0
        ? await Promise.all([
            getDb()
              .selectDistinct({ userId: familyMembers.parentUserId })
              .from(familyMembers)
              .where(inArray(familyMembers.parentUserId, pageUserIds)),
            getDb()
              .selectDistinct({ userId: familyMembers.selfUserId })
              .from(familyMembers)
              .where(inArray(familyMembers.selfUserId, pageUserIds)),
          ])
        : [[], []];
    const parentIds = new Set(dependentParents.map((r) => r.userId));
    const playerIds = new Set(selfPlayers.map((r) => r.userId));

    const usersWithRoles = allUsers.map((u) => ({
      ...u,
      roles: rolesByUser.get(u.id) ?? [],
      personType: parentIds.has(u.id)
        ? ("parent" as const)
        : playerIds.has(u.id)
          ? ("player" as const)
          : null,
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

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
        eq(userRoles.scopeId, auth.organizationId)
      ))
      .limit(1);

    if (userOrgRole.length === 0) {
      // Also check for location/program/team scoped roles
      const orgLocations = await getDb()
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, auth.organizationId));

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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = assignRoleSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const { scopeType } = result.data;

    if (scopeType === "global") {
      // Global-scope assignment (super_admin is the only global role) is a
      // platform-level operation, not a tenant one: only a super-admin caller
      // may perform it, and the recipient deliberately does NOT have to belong
      // to the caller's org — elevating someone to platform admin is
      // inherently cross-org. The org-membership gate below must not apply
      // here (it doesn't count global-scoped roles as membership, so it would
      // even reject existing super-admins). requireOrgAdminAccess above does
      // NOT distinguish super_admin from location_admin, so re-check.
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
    } else {
      // The recipient must already belong to this organization. The role's
      // SCOPE is validated against the caller's org below, but without this the
      // endpoint would attach an org-scoped role to ANY user account in the
      // system (e.g. someone who only belongs to a different org), pulling an
      // outsider into the tenant. Staff are added to the org first (invite /
      // membership); this endpoint only assigns or changes roles for existing
      // members.
      const membership = await requireUserInOrg(
        auth.organizationId,
        result.data.userId,
      );
      if (!membership.ok) {
        return new Response(
          JSON.stringify({ error: "User is not a member of this organization" }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Verify the scope is valid for this organization
    // For org-scoped roles, default scopeId to the current org if missing —
    // the UI dialog doesn't expose a scope picker, so callers send the
    // role name only. Explicitly-provided scopeIds still get validated.
    let scopeId = result.data.scopeId ?? null;
    if (scopeType === "organization") {
      if (scopeId === null) {
        scopeId = auth.organizationId;
      } else if (scopeId !== auth.organizationId) {
        return new Response(JSON.stringify({ error: "Cannot assign roles to other organizations" }), { status: 403 });
      }
    }

    if (scopeType === "location" && scopeId) {
      const location = await getDb().query.locations.findFirst({
        where: and(eq(locations.id, scopeId), eq(locations.organizationId, auth.organizationId)),
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
        .where(and(eq(programs.id, scopeId), eq(locations.organizationId, auth.organizationId)));
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
        .where(and(eq(teams.id, scopeId), eq(locations.organizationId, auth.organizationId)));
      if (!team) {
        return new Response(JSON.stringify({ error: "Team not found in this organization" }), { status: 404 });
      }
    }

    // Redundancy guards: don't stack roles a broader grant already covers.
    // (super_admin → super_admin deliberately falls through to the duplicate
    // check below so the caller gets "already has this role".)
    const targetRoles = await getDb()
      .select({
        name: roles.name,
        scopeType: userRoles.scopeType,
        scopeId: userRoles.scopeId,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, result.data.userId));

    const targetIsSuperAdmin = targetRoles.some(
      (r) => r.name === "super_admin" && r.scopeType === "global",
    );
    if (
      targetIsSuperAdmin &&
      !(result.data.roleName === "super_admin" && scopeType === "global")
    ) {
      return new Response(
        JSON.stringify({
          error: "User is a platform super admin — additional roles are redundant",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      result.data.roleName === "location_admin" &&
      scopeType === "location" &&
      targetRoles.some(
        (r) =>
          r.name === "location_admin" &&
          r.scopeType === "organization" &&
          r.scopeId === auth.organizationId,
      )
    ) {
      return new Response(
        JSON.stringify({
          error: "User is already an organization admin for this organization",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Find the role by name — explicit orderBy for CI determinism.
    // Roles rows are created lazily on first assignment (there is no
    // roles-table seed migration; newer enum values like "referee" won't
    // have a row until someone assigns them). The enum constrains the
    // value, so the insert can't create junk roles.
    let role = await getDb().query.roles.findFirst({
      where: eq(roles.name, result.data.roleName),
      orderBy: (t, { asc }) => asc(t.id),
    });

    if (!role) {
      await getDb()
        .insert(roles)
        .values({ name: result.data.roleName })
        .onConflictDoNothing({ target: roles.name });
      role = await getDb().query.roles.findFirst({
        where: eq(roles.name, result.data.roleName),
        orderBy: (t, { asc }) => asc(t.id),
      });
    }

    if (!role) {
      return new Response(JSON.stringify({ error: "Role not found" }), { status: 404 });
    }

    // Check if user already has this role with same scope. Compare against
    // the resolved scopeId (null for global roles) so the same role at a
    // different scope — e.g. coach in two orgs — is still assignable.
    const existingRole = await getDb().query.userRoles.findFirst({
      where: and(
        eq(userRoles.userId, result.data.userId),
        eq(userRoles.roleId, role.id),
        eq(userRoles.scopeType, result.data.scopeType),
        scopeId === null ? isNull(userRoles.scopeId) : eq(userRoles.scopeId, scopeId),
      ),
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
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

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

    if (scopeType === "organization" && scopeId !== auth.organizationId) {
      return new Response(JSON.stringify({ error: "Role not found in this organization" }), { status: 404 });
    }

    if (scopeType === "location" && scopeId) {
      const location = await getDb().query.locations.findFirst({
        where: and(eq(locations.id, scopeId), eq(locations.organizationId, auth.organizationId)),
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
        .where(and(eq(programs.id, scopeId), eq(locations.organizationId, auth.organizationId)));
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
        .where(and(eq(teams.id, scopeId), eq(locations.organizationId, auth.organizationId)));
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

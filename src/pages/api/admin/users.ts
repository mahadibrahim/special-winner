import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { eq, asc, desc, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess } from "@/lib/auth";

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

// GET - List all users with optional search
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const search = url.searchParams.get("search");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Build query with optional search
    let baseQuery = db
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users);

    if (search) {
      baseQuery = baseQuery.where(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.firstName, `%${search}%`),
          ilike(users.lastName, `%${search}%`)
        )
      ) as any;
    }

    const allUsers = await baseQuery
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);
    const totalCount = Number(countResult.count);

    // Get roles for each user
    const usersWithRoles = await Promise.all(
      allUsers.map(async (u) => {
        const userRolesData = await db
          .select({
            id: userRoles.id,
            roleId: userRoles.roleId,
            scopeType: userRoles.scopeType,
            scopeId: userRoles.scopeId,
            roleName: roles.name,
          })
          .from(userRoles)
          .leftJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, u.id));

        return {
          ...u,
          roles: userRolesData,
        };
      })
    );

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

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "User ID is required" }), { status: 400 });
    }

    const result = updateUserSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const [updatedUser] = await db
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

  try {
    const body = await context.request.json();
    const result = assignRoleSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Find the role by name
    const role = await db.query.roles.findFirst({
      where: eq(roles.name, result.data.roleName),
    });

    if (!role) {
      return new Response(JSON.stringify({ error: "Role not found" }), { status: 404 });
    }

    // Check if user already has this role with same scope
    const existingRole = await db.query.userRoles.findFirst({
      where: (ur) =>
        eq(ur.userId, result.data.userId) &&
        eq(ur.roleId, role.id) &&
        eq(ur.scopeType, result.data.scopeType),
    });

    if (existingRole) {
      return new Response(
        JSON.stringify({ error: "User already has this role" }),
        { status: 409 }
      );
    }

    // Assign the role
    const [newUserRole] = await db
      .insert(userRoles)
      .values({
        userId: result.data.userId,
        roleId: role.id,
        scopeType: result.data.scopeType,
        scopeId: result.data.scopeId,
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

  try {
    const url = new URL(context.request.url);
    const userRoleId = url.searchParams.get("userRoleId");

    if (!userRoleId) {
      return new Response(JSON.stringify({ error: "User role ID is required" }), { status: 400 });
    }

    const [deletedRole] = await db
      .delete(userRoles)
      .where(eq(userRoles.id, userRoleId))
      .returning();

    if (!deletedRole) {
      return new Response(JSON.stringify({ error: "User role not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error removing role:", error);
    return new Response(JSON.stringify({ error: "Failed to remove role" }), { status: 500 });
  }
};

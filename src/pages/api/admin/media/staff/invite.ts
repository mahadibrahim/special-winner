import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { mediaStaffProfiles } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  requireSuperAdminAccess,
  requireOrganizationContext,
} from "@/lib/auth";
import { logMediaAction } from "@/lib/media/audit";

const schema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  serviceLocationIds: z.array(z.string().uuid()).optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const body = await context.request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400 }
    );
  }

  const db = getDb();
  const [mediaRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, "media_staff"))
    .limit(1);
  if (!mediaRole) {
    return new Response(
      JSON.stringify({ error: "media_staff role missing — run seed" }),
      { status: 500 }
    );
  }

  // Find-or-create user shell (no password yet; onboarding sets it).
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);
  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        firstName: parsed.data.firstName ?? null,
        lastName: parsed.data.lastName ?? null,
      })
      .returning();
  }

  await db
    .insert(userRoles)
    .values({
      userId: user.id,
      roleId: mediaRole.id,
      scopeType: "organization",
      scopeId: org.organizationId,
    })
    .onConflictDoNothing();

  await db
    .insert(mediaStaffProfiles)
    .values({
      userId: user.id,
      organizationId: org.organizationId,
      serviceLocationIds: parsed.data.serviceLocationIds ?? [],
      active: true,
    })
    .onConflictDoNothing();

  await logMediaAction({
    actorUserId: auth.user.id,
    entityType: "session",
    entityId: user.id,
    action: "create",
    diff: { invited: parsed.data.email },
  });

  return new Response(
    JSON.stringify({ invite: { userId: user.id, email: user.email } }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
};

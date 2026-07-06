import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications, roles, userRoles, users } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendCoachInviteEmail } from "@/lib/email/send";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/admin/applications/[id]/hire
 *
 * Marks an application hired: creates a user for the applicant's email (or
 * links the existing account), grants an org-scoped `coach` role, records
 * org membership, stamps status='hired' + hiredUserId, and emails a 72-hour
 * magic-link invite that lands on /coach (mirrors api/admin/users/invite.ts).
 * Idempotent by application: a second call returns 409.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const db = getDb();

  // Pin the application to the caller's org (404 conflates cross-tenant
  // with not-found, per require-resource-ownership convention).
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.id, id),
        eq(jobApplications.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(jobApplications.createdAt))
    .limit(1);
  if (!application) return json(404, { error: "Resource not found" });
  if (application.hiredUserId) {
    return json(409, {
      error: "Application is already marked hired",
      hiredUserId: application.hiredUserId,
    });
  }

  const email = normalizeForUniqueness(application.email);

  // Link the existing account by canonical email, or create one with a
  // random unusable password — the invitee signs in via the emailed link.
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .orderBy(asc(users.createdAt))
    .limit(1);

  let hiredUser = existingUser;
  const createdNewUser = !existingUser;
  if (!hiredUser) {
    const passwordHash = await hashPassword(
      crypto.randomBytes(32).toString("base64url"),
    );
    [hiredUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName: application.firstName,
        lastName: application.lastName,
        phone: application.phone ?? null,
        emailVerified: false,
      })
      .returning();
  }

  // Org membership (idempotent) — mirrors api/admin/users/invite.ts.
  const [existingAccess] = await db
    .select({ userId: userOrganizationAccess.userId })
    .from(userOrganizationAccess)
    .where(
      and(
        eq(userOrganizationAccess.userId, hiredUser.id),
        eq(userOrganizationAccess.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(userOrganizationAccess.userId))
    .limit(1);
  if (!existingAccess) {
    await db.insert(userOrganizationAccess).values({
      userId: hiredUser.id,
      organizationId: auth.organizationId,
      role: "staff",
      invitedAt: new Date(),
    });
  }

  // Org-scoped coach role (idempotent).
  const [coachRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "coach"))
    .orderBy(asc(roles.id))
    .limit(1);
  if (!coachRole) {
    return json(500, { error: "coach role missing from roles table" });
  }
  const [existingRole] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, hiredUser.id),
        eq(userRoles.roleId, coachRole.id),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, auth.organizationId),
      ),
    )
    .orderBy(asc(userRoles.createdAt))
    .limit(1);
  if (!existingRole) {
    await db.insert(userRoles).values({
      userId: hiredUser.id,
      roleId: coachRole.id,
      scopeType: "organization",
      scopeId: auth.organizationId,
    });
  }

  await db
    .update(jobApplications)
    .set({ status: "hired", hiredUserId: hiredUser.id })
    .where(eq(jobApplications.id, application.id));

  // Invite email — reuse the magic-link login flow (72h window, same as the
  // generic staff invite). A send failure must not roll back the hire; the
  // admin can re-send via forgot-password.
  try {
    const { token } = await createMagicLink({
      userId: hiredUser.id,
      organizationId: auth.organizationId,
      purpose: "login",
      expiresInSeconds: 72 * 60 * 60,
      deliveredChannel: "email",
      deliveredTo: hiredUser.email,
      purposeContext: { redirectTo: "/coach" },
    });
    await sendCoachInviteEmail({
      userId: hiredUser.id,
      recipientEmail: hiredUser.email,
      name: application.firstName,
      inviteUrl: buildMagicLinkUrl(token, {
        origin: new URL(context.request.url).origin,
      }),
      expiresIn: "72 hours",
      brand: brandFromHost(context.request.headers.get("host") ?? ""),
    });
  } catch (err) {
    console.error("[admin/applications/hire] invite email failed:", err);
  }

  return json(200, {
    hired: true,
    userId: hiredUser.id,
    createdNewUser,
  });
};

import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendSignInLinkEmail } from "@/lib/email/send";

export const prerender = false;

// Staff roles an org admin may grant at invite time. super_admin is
// deliberately excluded — platform admins are provisioned by hand.
const INVITABLE_ROLES = [
  "location_admin",
  "coach",
  "referee",
  "media_staff",
  "media_editor",
] as const;

const inviteSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().email(),
  phone: z.string().trim().max(30).optional(),
  roleName: z.enum(INVITABLE_ROLES).optional(),
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/admin/users/invite
 *
 * Admin-creates an account: user row (random unusable password), org
 * membership via user_organization_access (so they appear in the
 * directory even role-less), optional org-scoped staff role, and a
 * 72-hour sign-in link emailed so the invitee finishes setup themselves —
 * no password ever passes through the admin.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = inviteSchema.safeParse(await context.request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) {
    return json(400, {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const db = getDb();
  const email = normalizeForUniqueness(parsed.data.email);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return json(409, { error: "A user with that email already exists" });
  }

  // Random unusable password — the invitee signs in via the emailed link
  // and can set a real password from their account settings.
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString("base64url"));

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone ?? null,
      emailVerified: false,
    })
    .returning();

  await db.insert(userOrganizationAccess).values({
    userId: newUser.id,
    organizationId: auth.organizationId,
    role: "staff",
    invitedAt: new Date(),
  });

  if (parsed.data.roleName) {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, parsed.data.roleName))
      .limit(1);
    if (role) {
      await db.insert(userRoles).values({
        userId: newUser.id,
        roleId: role.id,
        scopeType: "organization",
        scopeId: auth.organizationId,
      });
    }
  }

  // Fire the invite email; a send failure shouldn't roll back the account —
  // the admin can re-trigger a sign-in link from the auth flow.
  try {
    const { token } = await createMagicLink({
      userId: newUser.id,
      organizationId: auth.organizationId,
      purpose: "login",
      expiresInSeconds: 72 * 60 * 60,
      deliveredChannel: "email",
      deliveredTo: email,
    });
    await sendSignInLinkEmail({
      userId: newUser.id,
      recipientEmail: email,
      name: parsed.data.firstName,
      signInUrl: buildMagicLinkUrl(token, { origin: new URL(context.request.url).origin }),
      expiresIn: "72 hours",
    });
  } catch (err) {
    console.error("[admin/users/invite] sign-in link email failed:", err);
  }

  return json(201, {
    user: {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      roleName: parsed.data.roleName ?? null,
    },
  });
};

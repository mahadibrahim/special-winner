import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications, users } from "@/lib/db/schema";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";
import { sendEmail, fromForBrand, isEmailConfigured } from "@/lib/email";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { escapeHtml } from "@/lib/activity-tracking/messages/types";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/admin/applications/[id]/approve-host
 *
 * Host analog of hire.ts: creates/links the applicant's account, creates an
 * ACTIVE host_profiles row (bio/photo/preferred venue copied from the
 * application), stamps status='hired' + hiredUserId, and emails a 72-hour
 * magic-link invite landing on /host. Unlike coach hire, NO RBAC role and
 * NO staff org-membership is granted — hosts are community volunteers
 * (customer-tier membership only).
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const db = getDb();
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
  if (application.role !== "host") {
    return json(400, { error: "Not a host application — use hire instead" });
  }
  if (application.hiredUserId) {
    return json(409, {
      error: "Application already approved",
      hiredUserId: application.hiredUserId,
    });
  }

  const email = normalizeForUniqueness(application.email);
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .orderBy(asc(users.createdAt))
    .limit(1);

  let hostUser = existingUser;
  const createdNewUser = !existingUser;
  if (!hostUser) {
    const passwordHash = await hashPassword(
      crypto.randomBytes(32).toString("base64url"),
    );
    [hostUser] = await db
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

  // Customer-tier org membership (idempotent inside the helper).
  await ensureCustomerOrgMembership(db, hostUser.id, auth.organizationId);

  // Preferred venue: application stores a location slug; resolve to the
  // oldest venue at that location. "either"/unknown → null (all venues).
  let preferredVenueId: string | null = null;
  if (application.preferredLocation && application.preferredLocation !== "either") {
    const [venue] = await db
      .select({ id: venues.id })
      .from(venues)
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .where(
        and(
          eq(locations.organizationId, auth.organizationId),
          eq(locations.slug, application.preferredLocation),
        ),
      )
      .orderBy(asc(venues.createdAt))
      .limit(1);
    preferredVenueId = venue?.id ?? null;
  }

  // Idempotent per (user, org) — re-approval of a different application for
  // the same person reactivates rather than duplicating.
  const [existingProfile] = await db
    .select()
    .from(hostProfiles)
    .where(
      and(
        eq(hostProfiles.userId, hostUser.id),
        eq(hostProfiles.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(hostProfiles.createdAt))
    .limit(1);

  let hostProfileId: string;
  if (existingProfile) {
    hostProfileId = existingProfile.id;
    await db
      .update(hostProfiles)
      .set({
        status: "active",
        bio: application.experience,
        photoKey: application.photoKey,
        preferredVenueId,
        applicationId: application.id,
        approvedByUserId: auth.user.id,
        updatedAt: new Date(),
      })
      .where(eq(hostProfiles.id, existingProfile.id));
  } else {
    const [profile] = await db
      .insert(hostProfiles)
      .values({
        userId: hostUser.id,
        organizationId: auth.organizationId,
        status: "active",
        bio: application.experience,
        photoKey: application.photoKey,
        preferredVenueId,
        applicationId: application.id,
        approvedByUserId: auth.user.id,
      })
      .returning();
    hostProfileId = profile.id;
  }

  await db
    .update(jobApplications)
    .set({ status: "hired", hiredUserId: hostUser.id })
    .where(eq(jobApplications.id, application.id));

  // Welcome email with magic link to /host. Failure must not roll back.
  try {
    const brand = brandFromHost(context.request.headers.get("host") ?? "");
    if (isEmailConfigured()) {
      const { token } = await createMagicLink({
        userId: hostUser.id,
        organizationId: auth.organizationId,
        purpose: "login",
        expiresInSeconds: 72 * 60 * 60,
        deliveredChannel: "email",
        deliveredTo: hostUser.email,
        purposeContext: { redirectTo: "/host" },
      });
      await sendEmail({
        from: fromForBrand(brand),
        to: hostUser.email,
        subject: "You're approved to host pickup games 🎉",
        html: `<p>Hey ${escapeHtml(application.firstName)},</p>
<p>You're in — you're now an approved pickup host. Hosts play free in every game they host.</p>
<p><a href="${buildMagicLinkUrl(token, { origin: new URL(context.request.url).origin })}">Open your host dashboard</a> to claim your first game. This link works for 72 hours; after that, sign in normally.</p>`,
      });
    }
  } catch (err) {
    console.error("[admin/applications/approve-host] welcome email failed:", err);
  }

  return json(200, { approved: true, userId: hostUser.id, hostProfileId, createdNewUser });
};

import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  announcements,
  users,
  registrations,
  seasons,
  programs,
  locations,
  organizations,
} from "@/lib/db/schema";
import { eq, desc, and, or, isNull, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { sendAnnouncementEmail } from "@/lib/email/send";
import { formatEmailDate } from "@/lib/email/format";
import { env } from "@/lib/env";

// Per-location scoping (backlog #28):
//   - locationId === null → org-wide announcement; only super_admins
//                            may create, edit, or delete.
//   - locationId === <id> → scoped to that location; a venue manager
//                            may create/edit/delete it only if the
//                            location is in `getLocationIdsForUser`.
// Read access:
//   - super_admin sees every announcement in the current org (narrows
//     to one location when the venue picker is pinned).
//   - location_admin sees every org-wide announcement + every
//     announcement scoped to a location they have access to.

const announcementSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  content: z.string().min(1, "Content is required"),
  // Scope: omitted/null/empty-string → org-wide (super only).
  // Non-empty UUID → venue-scoped.
  locationId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  target: z.enum(["all", "parents", "coaches", "program", "team"]).default("all"),
  targetId: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  sendEmail: z.boolean().default(false),
  pinned: z.boolean().default(false),
  expiresAt: z.string().datetime().optional().nullable(),
});

// GET - List announcements
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const status = url.searchParams.get("status");
    const includeExpired = url.searchParams.get("includeExpired") === "true";
    // Bound the list — pinned-first, newest-first means the cap drops only
    // the oldest rows. Response shape is unchanged.
    const rawLimit = Number(url.searchParams.get("limit"));
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 100;

    const conditions = [eq(announcements.organizationId, orgContext.organizationId)];

    // Scope rule: org-wide rows (locationId IS NULL) are always visible
    // to every admin in the org. Venue-scoped rows are visible only if
    // the row's location is in the caller's effective set.
    const effectiveIds = await getEffectiveLocationIds({
      userId: auth.user.id,
      userRoles: auth.roles,
      activeLocationId: context.locals.activeLocationId,
    });
    if (effectiveIds !== null) {
      if (effectiveIds.length === 0) {
        // Non-super with no assigned locations — they can still see
        // org-wide announcements (NULL locationId), nothing else.
        conditions.push(isNull(announcements.locationId));
      } else {
        conditions.push(
          or(
            isNull(announcements.locationId),
            inArray(announcements.locationId, effectiveIds),
          )!,
        );
      }
    }

    if (status) {
      conditions.push(eq(announcements.status, status as any));
    }

    if (!includeExpired) {
      conditions.push(
        or(
          isNull(announcements.expiresAt),
          gte(announcements.expiresAt, new Date())
        )!
      );
    }

    const allAnnouncements = await getDb()
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        target: announcements.target,
        targetId: announcements.targetId,
        status: announcements.status,
        sendEmail: announcements.sendEmail,
        emailSentAt: announcements.emailSentAt,
        publishedAt: announcements.publishedAt,
        expiresAt: announcements.expiresAt,
        pinned: announcements.pinned,
        createdAt: announcements.createdAt,
        locationId: announcements.locationId,
        location: {
          id: locations.id,
          name: locations.name,
        },
        author: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.authorId, users.id))
      .leftJoin(locations, eq(announcements.locationId, locations.id))
      .where(and(...conditions))
      .orderBy(desc(announcements.pinned), desc(announcements.createdAt))
      .limit(limit);

    return new Response(JSON.stringify({ announcements: allAnnouncements }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching announcements:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch announcements" }), { status: 500 });
  }
};

// POST - Create announcement
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const result = announcementSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const isSuper = auth.roles.some((r) => r.name === "super_admin");
    const scopeError = await validateWriteScope({
      locationId: result.data.locationId,
      isSuper,
      userId: auth.user.id,
      organizationId: orgContext.organizationId,
    });
    if (scopeError) return scopeError;

    const publishedAt = result.data.status === "published" ? new Date() : null;

    const [newAnnouncement] = await getDb()
      .insert(announcements)
      .values({
        organizationId: orgContext.organizationId,
        authorId: auth.user.id,
        ...result.data,
        expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null,
        publishedAt,
      })
      .returning();

    // Fan out announcement email if requested AND the announcement is now
    // published. Drafts are not emailed. Fire-and-forget — we don't block
    // the API response on potentially-hundreds of recipient sends.
    if (
      newAnnouncement &&
      result.data.sendEmail &&
      result.data.status === "published"
    ) {
      // Don't await — let it run in the background.
      void fanOutAnnouncementEmails(newAnnouncement.id, auth.user).catch(
        (err) => console.error("[announcements] fan-out failed:", err),
      );
    }

    return new Response(JSON.stringify({ announcement: newAnnouncement }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error creating announcement:", error);
    return new Response(JSON.stringify({ error: "Failed to create announcement" }), { status: 500 });
  }
};

/**
 * Verify the caller is allowed to write an announcement at the given
 * scope. Used by both POST (new row) and PUT (target scope of an edit).
 *
 *   - locationId === null  → must be super_admin (org-wide is privileged)
 *   - locationId === <id>  → super OR location_admin scoped to that id
 *
 * Returns a Response on rejection, null on success.
 */
async function validateWriteScope(opts: {
  locationId: string | null;
  isSuper: boolean;
  userId: string;
  organizationId: string;
}): Promise<Response | null> {
  if (opts.locationId === null) {
    if (opts.isSuper) return null;
    return new Response(
      JSON.stringify({ error: "Only super-admins can post org-wide announcements" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify the target location belongs to the caller's org. Cheap guard
  // against pasting a UUID from another tenant.
  const [match] = await getDb()
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.id, opts.locationId),
        eq(locations.organizationId, opts.organizationId),
      ),
    )
    .limit(1);
  if (!match) {
    return new Response(JSON.stringify({ error: "Location not found in this organization" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (opts.isSuper) return null;

  const allowed = await getLocationIdsForUser(opts.userId);
  if (!allowed.includes(opts.locationId)) {
    return new Response(
      JSON.stringify({ error: "Not a venue you can post to" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}

/**
 * Fan out an announcement email.
 *
 *   - Org-wide announcement (locationId IS NULL): every user with at
 *     least one registration in any season at any location in the org.
 *     (Same recipient set as before #28.)
 *   - Venue-scoped announcement: only users with at least one
 *     registration whose program lives at that specific location.
 *
 * Done as fire-and-forget in batches of 50 with Promise.allSettled so a
 * failed send doesn't abort the batch.
 *
 * Recipient set is "users who registered a child for a season at the
 * relevant location(s)" — best proxy for "opted-in parents" until we
 * wire up a per-user email-announcement preference.
 */
async function fanOutAnnouncementEmails(
  announcementId: string,
  author: { id: string; firstName: string | null; email: string },
) {
  const db = getDb();

  // Reload the announcement (cheap; gives us the published copy of the row).
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1);

  if (!announcement) return;

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, announcement.organizationId))
    .limit(1);

  if (!org) return;

  // Recipient query — same shape, narrower WHERE for venue-scoped rows.
  const recipientConditions = [eq(locations.organizationId, org.id)];
  if (announcement.locationId) {
    recipientConditions.push(eq(locations.id, announcement.locationId));
  }
  const recipients = await db
    .selectDistinct({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
    })
    .from(users)
    .innerJoin(registrations, eq(registrations.registeredByUserId, users.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(programs.id, seasons.programId))
    .innerJoin(locations, eq(locations.id, programs.locationId))
    .where(and(...recipientConditions));

  if (recipients.length === 0) {
    await db
      .update(announcements)
      .set({ emailSentAt: new Date() })
      .where(eq(announcements.id, announcementId));
    return;
  }

  const authorName =
    author.firstName ??
    (author.email ? author.email.split("@")[0] : "Aspire Sports");
  const publishedAt = formatEmailDate(announcement.publishedAt ?? new Date());
  const dashboardUrl = `${env.PUBLIC_APP_URL}/dashboard`;

  const BATCH_SIZE = 50;
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map((r) =>
        sendAnnouncementEmail({
          userId: r.id,
          organizationId: org.id,
          recipientEmail: r.email,
          recipientName: r.firstName ?? r.email.split("@")[0],
          announcementTitle: announcement.title,
          announcementContent: announcement.content,
          authorName,
          publishedAt,
          organizationName: org.name,
          dashboardUrl,
        }),
      ),
    );
  }

  await db
    .update(announcements)
    .set({ emailSentAt: new Date() })
    .where(eq(announcements.id, announcementId));
}

// PUT - Update announcement
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const { id, ...data } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: "Announcement ID is required" }), { status: 400 });
    }

    const result = announcementSchema.safeParse(data);
    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    // Verify the row belongs to this org.
    const existing = await getDb().query.announcements.findFirst({
      where: and(eq(announcements.id, id), eq(announcements.organizationId, orgContext.organizationId)),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    if (!existing) {
      return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
    }

    // The caller must be allowed to write at BOTH the row's current scope
    // (otherwise they could edit a row they shouldn't see) AND the
    // requested new scope (otherwise they could promote a venue-scoped
    // row to org-wide).
    const isSuper = auth.roles.some((r) => r.name === "super_admin");
    const existingScopeError = await validateWriteScope({
      locationId: existing.locationId,
      isSuper,
      userId: auth.user.id,
      organizationId: orgContext.organizationId,
    });
    if (existingScopeError) {
      // Hide existence — return 404 rather than 403 so we don't leak
      // the row's ID via probing.
      return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
    }
    const newScopeError = await validateWriteScope({
      locationId: result.data.locationId,
      isSuper,
      userId: auth.user.id,
      organizationId: orgContext.organizationId,
    });
    if (newScopeError) return newScopeError;

    let publishedAt = existing.publishedAt;
    if (result.data.status === "published" && !existing.publishedAt) {
      publishedAt = new Date();
    }

    const [updatedAnnouncement] = await getDb()
      .update(announcements)
      .set({
        ...result.data,
        expiresAt: result.data.expiresAt ? new Date(result.data.expiresAt) : null,
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id))
      .returning();

    if (!updatedAnnouncement) {
      return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ announcement: updatedAnnouncement }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error updating announcement:", error);
    return new Response(JSON.stringify({ error: "Failed to update announcement" }), { status: 500 });
  }
};

// DELETE - Delete announcement
export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Announcement ID is required" }), { status: 400 });
    }

    const existing = await getDb().query.announcements.findFirst({
      where: and(eq(announcements.id, id), eq(announcements.organizationId, orgContext.organizationId)),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    if (!existing) {
      return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
    }

    // Same scope check as PUT — a venue manager must not delete an
    // org-wide row or a row at a venue they can't access.
    const isSuper = auth.roles.some((r) => r.name === "super_admin");
    const scopeError = await validateWriteScope({
      locationId: existing.locationId,
      isSuper,
      userId: auth.user.id,
      organizationId: orgContext.organizationId,
    });
    if (scopeError) {
      return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
    }

    await getDb().delete(announcements).where(eq(announcements.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error deleting announcement:", error);
    return new Response(JSON.stringify({ error: "Failed to delete announcement" }), { status: 500 });
  }
};

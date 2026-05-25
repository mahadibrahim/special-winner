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
import { eq, desc, and, or, isNull, gte } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { sendAnnouncementEmail } from "@/lib/email/send";
import { formatEmailDate } from "@/lib/email/format";
import { env } from "@/lib/env";

const announcementSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  content: z.string().min(1, "Content is required"),
  target: z.enum(["all", "parents", "coaches", "program", "team"]).default("all"),
  targetId: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  sendEmail: z.boolean().default(false),
  pinned: z.boolean().default(false),
  expiresAt: z.string().datetime().optional().nullable(),
});

// GET - List announcements
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  // Get organization context for multi-tenant filtering
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const status = url.searchParams.get("status");
    const includeExpired = url.searchParams.get("includeExpired") === "true";

    let query = getDb()
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
        author: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.authorId, users.id));

    // Always filter by organization
    const conditions = [eq(announcements.organizationId, orgContext.organizationId)];

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

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allAnnouncements = await query.orderBy(
      desc(announcements.pinned),
      desc(announcements.createdAt)
    );

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
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  // Get organization context for multi-tenant filtering
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
 * Fan out an announcement email to every parent in the org who has at least
 * one registration in any of the org's seasons. Done as fire-and-forget in
 * batches of 50 with Promise.allSettled so a failed send doesn't abort the
 * batch.
 *
 * Recipient set is "users who registered a child for any season at any
 * location in this organization." That's our best proxy for "opted-in
 * parents" until we wire up a per-user email-announcement preference.
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

  // Distinct recipient parents: users with at least one registration whose
  // season belongs to a location in this org.
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
    .where(eq(locations.organizationId, org.id));

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
  const auth = await requireSuperAdminAccess(context);
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

    // Verify announcement belongs to this organization
    const existing = await getDb().query.announcements.findFirst({
      where: and(eq(announcements.id, id), eq(announcements.organizationId, orgContext.organizationId)),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    if (!existing) {
      return new Response(JSON.stringify({ error: "Announcement not found" }), { status: 404 });
    }

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
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Announcement ID is required" }), { status: 400 });
    }

    // Verify announcement belongs to this organization before deleting
    const existing = await getDb().query.announcements.findFirst({
      where: and(eq(announcements.id, id), eq(announcements.organizationId, orgContext.organizationId)),
      orderBy: (t, { asc }) => asc(t.createdAt),
    });

    if (!existing) {
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

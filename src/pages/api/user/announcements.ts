import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { announcements, users, userOrganizationAccess } from "@/lib/db/schema";
import { eq, desc, and, or, isNull, gte, inArray } from "drizzle-orm";

// GET - Get announcements for the current user
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const db = getDb();

    // Get organizations the user belongs to
    const userOrgs = await getDb()
      .select({ organizationId: userOrganizationAccess.organizationId })
      .from(userOrganizationAccess)
      .where(
        and(
          eq(userOrganizationAccess.userId, user.id),
          eq(userOrganizationAccess.active, true)
        )
      );
    const orgIds = userOrgs.map((org) => org.organizationId);

    if (orgIds.length === 0) {
      return new Response(
        JSON.stringify({ announcements: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Fetch published, non-expired announcements targeting parents or all
    const userAnnouncements = await getDb()
      .select({
        id: announcements.id,
        title: announcements.title,
        content: announcements.content,
        target: announcements.target,
        pinned: announcements.pinned,
        publishedAt: announcements.publishedAt,
        expiresAt: announcements.expiresAt,
        author: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        },
      })
      .from(announcements)
      .leftJoin(users, eq(announcements.authorId, users.id))
      .where(
        and(
          inArray(announcements.organizationId, orgIds),
          eq(announcements.status, "published"),
          or(
            eq(announcements.target, "all"),
            eq(announcements.target, "parents")
          ),
          or(
            isNull(announcements.expiresAt),
            gte(announcements.expiresAt, new Date())
          )
        )
      )
      .orderBy(desc(announcements.pinned), desc(announcements.publishedAt))
      .limit(20);

    return new Response(
      JSON.stringify({ announcements: userAnnouncements }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching announcements:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

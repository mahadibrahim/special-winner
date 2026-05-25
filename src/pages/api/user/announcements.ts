import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  announcements,
  users,
  userOrganizationAccess,
  registrations,
  familyMembers,
  seasons,
  programs,
} from "@/lib/db/schema";
import { eq, desc, and, or, isNull, gte, inArray } from "drizzle-orm";

// GET - Get announcements for the current user
//
// Returns the union of:
//   - org-wide announcements (locationId IS NULL) for orgs the user
//     belongs to
//   - venue-scoped announcements at locations where the user has at
//     least one active or historical registration
//
// Backlog #28 added the location_id column. Before that, every
// announcement was effectively org-wide (NULL locationId), so behavior
// for pre-#28 rows is unchanged.
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

    // Organizations the user belongs to.
    const userOrgs = await db
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
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Locations the user has any registration at — for filtering
    // venue-scoped announcements. Joins through family_members to cover
    // both parent-of-child and self-as-adult registrations.
    const regLocations = await db
      .selectDistinct({ locationId: programs.locationId })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .where(
        or(
          eq(familyMembers.parentUserId, user.id),
          eq(familyMembers.selfUserId, user.id),
        )!,
      );
    const userLocationIds = regLocations
      .map((r) => r.locationId)
      .filter((id): id is string => !!id);

    // Scope clause: always include org-wide rows, plus venue-scoped
    // rows at locations the user is registered at.
    const scopeClause =
      userLocationIds.length > 0
        ? or(
            isNull(announcements.locationId),
            inArray(announcements.locationId, userLocationIds),
          )!
        : isNull(announcements.locationId);

    const userAnnouncements = await db
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
          ),
          scopeClause,
        )
      )
      .orderBy(desc(announcements.pinned), desc(announcements.publishedAt))
      .limit(20);

    return new Response(
      JSON.stringify({ announcements: userAnnouncements }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching announcements:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

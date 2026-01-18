import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, sports, users } from "@/lib/db/schema";
import { eq, asc, and, isNull, sql } from "drizzle-orm";
import { requireAdminAccess } from "@/lib/auth";

// GET - List all waitlisted registrations
export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const url = new URL(context.request.url);
    const seasonId = url.searchParams.get("seasonId");

    const conditions = [eq(registrations.status, "waitlisted")];
    if (seasonId) {
      conditions.push(eq(registrations.seasonId, seasonId));
    }

    const waitlistedRegs = await db
      .select({
        id: registrations.id,
        status: registrations.status,
        waitlistPosition: registrations.waitlistPosition,
        waitlistExpiresAt: registrations.waitlistExpiresAt,
        createdAt: registrations.createdAt,
        familyMember: {
          id: familyMembers.id,
          firstName: familyMembers.firstName,
          lastName: familyMembers.lastName,
          birthDate: familyMembers.birthDate,
        },
        parent: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
        season: {
          id: seasons.id,
          name: seasons.name,
        },
        program: {
          id: programs.id,
          name: programs.name,
        },
        sport: {
          id: sports.id,
          name: sports.name,
        },
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(users, eq(familyMembers.parentUserId, users.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .where(and(...conditions))
      .orderBy(asc(registrations.waitlistPosition), asc(registrations.createdAt));

    // Get season options for filter
    const seasonOptions = await db
      .select({
        id: seasons.id,
        name: seasons.name,
        programName: programs.name,
      })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .where(eq(seasons.isActive, true));

    return new Response(JSON.stringify({ waitlist: waitlistedRegs, seasons: seasonOptions }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching waitlist:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch waitlist" }), { status: 500 });
  }
};

// POST - Promote registration from waitlist
export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { registrationId, action } = body;

    if (!registrationId) {
      return new Response(JSON.stringify({ error: "Registration ID is required" }), { status: 400 });
    }

    const reg = await db.query.registrations.findFirst({
      where: eq(registrations.id, registrationId),
    });

    if (!reg) {
      return new Response(JSON.stringify({ error: "Registration not found" }), { status: 404 });
    }

    if (reg.status !== "waitlisted") {
      return new Response(JSON.stringify({ error: "Registration is not on waitlist" }), { status: 400 });
    }

    if (action === "promote") {
      // Promote to confirmed status
      const [updated] = await db
        .update(registrations)
        .set({
          status: "confirmed",
          waitlistPromotedAt: new Date(),
          waitlistPosition: null,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, registrationId))
        .returning();

      // Reorder remaining waitlist positions for this season
      await db.execute(sql`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position, created_at) as new_position
          FROM registrations
          WHERE season_id = ${reg.seasonId} AND status = 'waitlisted'
        )
        UPDATE registrations
        SET waitlist_position = ranked.new_position
        FROM ranked
        WHERE registrations.id = ranked.id
      `);

      return new Response(JSON.stringify({ registration: updated, message: "Registration promoted from waitlist" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else if (action === "remove") {
      // Remove from waitlist (cancel)
      const [updated] = await db
        .update(registrations)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledReason: "Removed from waitlist by admin",
          cancelledBy: user.id,
          waitlistPosition: null,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, registrationId))
        .returning();

      // Reorder remaining waitlist positions
      await db.execute(sql`
        WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position, created_at) as new_position
          FROM registrations
          WHERE season_id = ${reg.seasonId} AND status = 'waitlisted'
        )
        UPDATE registrations
        SET waitlist_position = ranked.new_position
        FROM ranked
        WHERE registrations.id = ranked.id
      `);

      return new Response(JSON.stringify({ registration: updated, message: "Registration removed from waitlist" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
  } catch (error) {
    console.error("Error processing waitlist action:", error);
    return new Response(JSON.stringify({ error: "Failed to process waitlist action" }), { status: 500 });
  }
};

// PUT - Reorder waitlist positions
export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const { registrationId, newPosition } = body;

    if (!registrationId || newPosition === undefined) {
      return new Response(JSON.stringify({ error: "Registration ID and new position are required" }), { status: 400 });
    }

    const reg = await db.query.registrations.findFirst({
      where: eq(registrations.id, registrationId),
    });

    if (!reg || reg.status !== "waitlisted") {
      return new Response(JSON.stringify({ error: "Registration not found or not on waitlist" }), { status: 404 });
    }

    const oldPosition = reg.waitlistPosition || 0;

    // Update positions for affected registrations
    if (newPosition > oldPosition) {
      // Moving down: decrement positions between old and new
      await db.execute(sql`
        UPDATE registrations
        SET waitlist_position = waitlist_position - 1
        WHERE season_id = ${reg.seasonId}
          AND status = 'waitlisted'
          AND waitlist_position > ${oldPosition}
          AND waitlist_position <= ${newPosition}
      `);
    } else if (newPosition < oldPosition) {
      // Moving up: increment positions between new and old
      await db.execute(sql`
        UPDATE registrations
        SET waitlist_position = waitlist_position + 1
        WHERE season_id = ${reg.seasonId}
          AND status = 'waitlisted'
          AND waitlist_position >= ${newPosition}
          AND waitlist_position < ${oldPosition}
      `);
    }

    // Set the new position
    const [updated] = await db
      .update(registrations)
      .set({
        waitlistPosition: newPosition,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId))
      .returning();

    return new Response(JSON.stringify({ registration: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error reordering waitlist:", error);
    return new Response(JSON.stringify({ error: "Failed to reorder waitlist" }), { status: 500 });
  }
};

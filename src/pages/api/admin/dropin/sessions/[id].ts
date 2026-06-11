/**
 * GET    /api/admin/dropin/sessions/:id  → session + roster + waitlist
 * PUT    /api/admin/dropin/sessions/:id  → edit session fields
 * DELETE /api/admin/dropin/sessions/:id  → soft-delete (status = cancelled);
 *                                          the dedicated /cancel endpoint
 *                                          also runs admin-cancel refunds.
 *                                          DELETE is safe-only (no roster).
 */
import type { APIRoute } from "astro";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { syncDropInSessionBlock } from "@/lib/scheduling/sync";
import { venueResources } from "@/lib/db/schema/scheduling";
import { BlockConflictError, removeSourceBlock } from "@/lib/scheduling/blocks";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function loadOrgScoped(sessionId: string, orgId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, sessionId),
        eq(dropInSessions.organizationId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  const session = await loadOrgScoped(id, orgId);
  if (!session) return json({ error: "Session not found" }, 404);

  const db = getDb();
  const [venue] = await db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(eq(venues.id, session.venueId))
    .limit(1);

  const bookings = await db
    .select({
      id: dropInBookings.id,
      userId: dropInBookings.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      gender: users.gender,
      status: dropInBookings.status,
      paymentMethod: dropInBookings.paymentMethod,
      amountPaidCents: dropInBookings.amountPaidCents,
      teamAssignment: dropInBookings.teamAssignment,
      checkedInAt: dropInBookings.checkedInAt,
      promotionExpiresAt: dropInBookings.promotionExpiresAt,
      createdAt: dropInBookings.createdAt,
    })
    .from(dropInBookings)
    .innerJoin(users, eq(users.id, dropInBookings.userId))
    .where(eq(dropInBookings.sessionId, id))
    .orderBy(asc(dropInBookings.createdAt));

  return json(
    {
      session,
      venue,
      roster: bookings.filter((b) => b.status === "confirmed"),
      waitlist: bookings.filter(
        (b) => b.status === "waitlisted" || b.status === "pending_claim",
      ),
      cancelled: bookings.filter(
        (b) => b.status === "cancelled" || b.status === "no_show",
      ),
    },
    200,
  );
};

interface PutBody {
  capacity?: number;
  capacityMale?: number | null;
  capacityFemale?: number | null;
  skillLevel?: "recreational" | "intermediate" | "advanced" | "all_levels";
  audience?: "adults" | "youth" | "all_ages";
  membersOnly?: boolean;
  sessionRateCents?: number | null;
  memberRateCents?: number | null;
  formatLabel?: string | null;
  startsAt?: string;
  endsAt?: string;
  venueId?: string;
  bookableResourceId?: string | null;
}

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  const session = await loadOrgScoped(id, orgId);
  if (!session) return json({ error: "Session not found" }, 404);

  let body: PutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const db = getDb();
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (body.capacity !== undefined) updates.capacity = body.capacity;
  if (body.capacityMale !== undefined) updates.capacityMale = body.capacityMale;
  if (body.capacityFemale !== undefined)
    updates.capacityFemale = body.capacityFemale;
  if (body.skillLevel !== undefined) updates.skillLevel = body.skillLevel;
  if (body.audience !== undefined) updates.audience = body.audience;
  if (body.membersOnly !== undefined) updates.membersOnly = body.membersOnly;
  if (body.sessionRateCents !== undefined)
    updates.sessionRateCents = body.sessionRateCents;
  if (body.memberRateCents !== undefined)
    updates.memberRateCents = body.memberRateCents;
  if (body.formatLabel !== undefined) updates.formatLabel = body.formatLabel;
  if (body.startsAt !== undefined) updates.startsAt = new Date(body.startsAt);
  if (body.endsAt !== undefined) updates.endsAt = new Date(body.endsAt);
  if (body.bookableResourceId !== undefined) {
    if (body.bookableResourceId) {
      // The field must belong to the session's venue (tenant + sanity).
      const targetVenueId =
        body.venueId !== undefined ? body.venueId : session.venueId;
      const [res] = await db
        .select({ id: venueResources.id })
        .from(venueResources)
        .where(
          and(
            eq(venueResources.id, body.bookableResourceId),
            eq(venueResources.venueId, targetVenueId),
          ),
        )
        .limit(1);
      if (!res) return json({ error: "Field not found at this venue" }, 404);
    }
    updates.bookableResourceId = body.bookableResourceId;
  }
  if (body.venueId !== undefined) updates.venueId = body.venueId;

  const [updated] = await db
    .update(dropInSessions)
    .set(updates)
    .where(eq(dropInSessions.id, id))
    .returning();

  // Field-time ledger re-sync (time/field moves, cancels). Conflict →
  // 409 with the blocking label; the row stays so the admin can adjust.
  try {
    await syncDropInSessionBlock(id);
  } catch (err) {
    if (err instanceof BlockConflictError) {
      return json({ session: updated, warning: err.message }, 409);
    }
    throw err;
  }

  return json({ session: updated }, 200);
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  const session = await loadOrgScoped(id, orgId);
  if (!session) return json({ error: "Session not found" }, 404);

  const db = getDb();

  // Refuse to hard-delete if any non-cancelled bookings exist — the
  // /cancel endpoint is the right tool when there's a roster.
  const [counts] = await db
    .select({
      n: sql<number>`COUNT(*) FILTER (WHERE status NOT IN ('cancelled','no_show'))::int`,
    })
    .from(dropInBookings)
    .where(eq(dropInBookings.sessionId, id));
  if ((counts?.n ?? 0) > 0) {
    return json(
      {
        error:
          "Session has bookings — use POST /cancel to cancel + refund instead.",
      },
      409,
    );
  }

  await db.delete(dropInSessions).where(eq(dropInSessions.id, id));
  await removeSourceBlock("drop_in", id);
  return json({ ok: true }, 200);
};

import type { APIRoute } from "astro";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { hostGameReports } from "@/lib/db/schema/hosts";
import { requireHostOfSession } from "@/lib/auth/host";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** GET /api/host/games/:id — game-day detail: session, roster, counts. */
export const GET: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  const db = getDb();
  const roster = await db
    .select({
      bookingId: dropInBookings.id,
      status: dropInBookings.status,
      paymentMethod: dropInBookings.paymentMethod,
      checkedInAt: dropInBookings.checkedInAt,
      teamAssignment: dropInBookings.teamAssignment,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(dropInBookings)
    .innerJoin(users, eq(users.id, dropInBookings.userId))
    .where(
      and(
        eq(dropInBookings.sessionId, id),
        sql`${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim', 'waitlisted', 'no_show')`,
      ),
    )
    .orderBy(asc(dropInBookings.createdAt));

  const [venue] = await db
    .select({ name: venues.name })
    .from(venues)
    .where(eq(venues.id, auth.session.venueId))
    .limit(1);

  const [existingReport] = await db
    .select({ id: hostGameReports.id })
    .from(hostGameReports)
    .where(eq(hostGameReports.sessionId, id))
    .limit(1);

  const seated = roster.filter((r) =>
    ["confirmed", "pending_payment", "pending_claim"].includes(r.status),
  );
  return json(
    {
      session: {
        id: auth.session.id,
        kind: auth.session.kind,
        status: auth.session.status,
        sportOrClassLabel: auth.session.sportOrClassLabel,
        formatLabel: auth.session.formatLabel,
        startsAt: auth.session.startsAt,
        endsAt: auth.session.endsAt,
        capacity: auth.session.capacity,
        teamCount: auth.session.teamCount,
        teamColors: auth.session.teamColors,
        venueName: venue?.name ?? null,
        confirmedCount: seated.length,
        reportSubmitted: !!existingReport,
      },
      roster,
      waitlistCount: roster.filter((r) => r.status === "waitlisted").length,
    },
    200,
  );
};

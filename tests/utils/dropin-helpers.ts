import { getDb } from "@/lib/db";
import { dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { and, asc, eq, sql } from "drizzle-orm";
import { createTestGameContext } from "./activity-tracking-helpers";

export interface CreateTestDropInSessionOpts {
  organizationId?: string;
  venueId?: string;
  capacity?: number;
  capacityMale?: number | null;
  capacityFemale?: number | null;
  membersOnly?: boolean;
  startsAt?: Date;
  endsAt?: Date;
  kind?: "pickup" | "class";
  teamCount?: number;
  teamColors?: string[];
  sportOrClassLabel?: string;
  sessionRateCents?: number | null;
  memberRateCents?: number | null;
}

/**
 * Insert a drop-in session row plus the org-level rate card it depends on.
 * Reuses `createTestGameContext` for the org+venue fixture when callers
 * don't provide their own.
 */
export async function createTestDropInSession(opts: CreateTestDropInSessionOpts = {}) {
  const db = getDb();
  const ctx =
    opts.organizationId && opts.venueId
      ? { organizationId: opts.organizationId, venueId: opts.venueId }
      : await createTestGameContext({});

  await db
    .insert(dropInRateCard)
    .values({ organizationId: ctx.organizationId })
    .onConflictDoNothing();

  const startsAt = opts.startsAt ?? new Date(Date.now() + 7 * 86400_000);
  const endsAt = opts.endsAt ?? new Date(startsAt.getTime() + 90 * 60_000);
  const kind = opts.kind ?? "pickup";

  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId: ctx.organizationId,
      venueId: ctx.venueId,
      kind,
      sportOrClassLabel: opts.sportOrClassLabel ?? "soccer",
      startsAt,
      endsAt,
      capacity: opts.capacity ?? 16,
      capacityMale: opts.capacityMale ?? null,
      capacityFemale: opts.capacityFemale ?? null,
      membersOnly: opts.membersOnly ?? false,
      sessionRateCents: opts.sessionRateCents ?? null,
      memberRateCents: opts.memberRateCents ?? null,
      teamCount: opts.teamCount ?? (kind === "class" ? 0 : 2),
      teamColors:
        opts.teamColors ?? (kind === "class" ? [] : ["orange", "black"]),
    })
    .returning();

  return { ...ctx, sessionId: session.id, session };
}

/**
 * Resolve the organization that HTTP requests to localhost actually hit.
 *
 * The middleware's domain resolver falls back to the oldest active
 * headquarters org (then the oldest active org) for unmapped hosts like
 * localhost. Tests that exercise org-guarded endpoints OVER HTTP must
 * create their fixtures under THIS org — a fresh createTestGameContext
 * org will 403 the multi-tenant guard. (Library-level tests don't care.)
 */
export async function resolveDefaultOrgForHttpTests(): Promise<{
  organizationId: string;
  venueId: string;
}> {
  const db = getDb();

  const [hq] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.organizationType, "headquarters"),
        eq(organizations.status, "active"),
      ),
    )
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  let organizationId = hq?.id;
  if (!organizationId) {
    const [oldest] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.status, "active"))
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    organizationId = oldest?.id;
  }
  if (!organizationId) {
    throw new Error("No active organization in the test database");
  }

  // Find (or create) a venue under that org for session fixtures.
  const [existingVenue] = await db
    .select({ id: venues.id })
    .from(venues)
    .innerJoin(locations, eq(venues.locationId, locations.id))
    .where(eq(locations.organizationId, organizationId))
    .orderBy(asc(venues.createdAt))
    .limit(1);
  if (existingVenue) {
    return { organizationId, venueId: existingVenue.id };
  }

  let [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, organizationId))
    .orderBy(asc(locations.createdAt))
    .limit(1);
  if (!loc) {
    const inserted = await db
      .insert(locations)
      .values({
        organizationId,
        name: "HTTP Test Location",
        slug: `http-test-loc-${Date.now()}`,
      })
      .returning({ id: locations.id });
    loc = inserted[0];
  }

  const [venue] = await db
    .insert(venues)
    .values({ locationId: loc.id, name: "HTTP Test Venue" })
    .returning({ id: venues.id });

  return { organizationId, venueId: venue.id };
}

/**
 * Convenience: count active bookings for a session in tests.
 */
export async function countSessionBookings(sessionId: string, status?: string) {
  const db = getDb();
  const condition = status
    ? sql`session_id = ${sessionId} AND status = ${status}`
    : sql`session_id = ${sessionId}`;
  const [row] = await db.execute<{ c: number }>(
    sql`SELECT COUNT(*)::int AS c FROM drop_in_bookings WHERE ${condition}`,
  );
  return row?.c ?? 0;
}

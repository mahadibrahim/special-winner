/**
 * createPickupSession
 *
 * Inserts a `drop_in_sessions` row for a pickup game that is starting now (or
 * at an explicit `nowIso`).  Mirrors the column set used by the existing
 * POST /api/admin/dropin/sessions handler with pickup-specific defaults:
 *
 *   kind          = "pickup"   (enum value)
 *   audience      = "adults"
 *   teamCount     = 0          (no pre-assigned sides; sides are assigned at
 *                               check-in time by the kiosk / staff)
 *   teamColors    = []         (empty — no colour sides for walk-up pickup)
 *   skillLevel    = "all_levels"
 *   membersOnly   = false
 *   status        = "scheduled"
 *   startsAt      = nowIso (or Date.now())
 *   endsAt        = startsAt + durationMinutes (default 120)
 *   capacity      = opts.capacity (default 30)
 *
 * Rate columns:
 *   sessionRateCents  = null   (pickup sessions do not charge a session fee)
 *   memberRateCents   = null   (same)
 *   walkUpRateCents   = opts.walkUpRateCents ?? null
 */
import type { Database } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";

export interface CreatePickupSessionOpts {
  organizationId: string;
  venueId: string;
  bookableResourceId: string | null;
  label: string;
  capacity?: number;
  walkUpRateCents?: number | null;
  durationMinutes?: number;
  createdByUserId: string;
  /** ISO string for the start time; defaults to now when omitted. */
  nowIso?: string;
}

export interface CreatePickupSessionResult {
  sessionId: string;
}

export async function createPickupSession(
  db: Database,
  opts: CreatePickupSessionOpts,
): Promise<CreatePickupSessionResult> {
  const now = opts.nowIso ? new Date(opts.nowIso) : new Date();
  const durationMs = (opts.durationMinutes ?? 120) * 60 * 1000;
  const endsAt = new Date(now.getTime() + durationMs);

  const [created] = await db
    .insert(dropInSessions)
    .values({
      organizationId: opts.organizationId,
      venueId: opts.venueId,
      bookableResourceId: opts.bookableResourceId,
      kind: "pickup",
      sportOrClassLabel: opts.label,
      formatLabel: null,
      startsAt: now,
      endsAt,
      capacity: opts.capacity ?? 30,
      capacityMale: null,
      capacityFemale: null,
      skillLevel: "all_levels",
      audience: "adults",
      membersOnly: false,
      sessionRateCents: null,
      memberRateCents: null,
      walkUpRateCents: opts.walkUpRateCents ?? null,
      teamCount: 0,
      teamColors: [],
      status: "scheduled",
      createdByUserId: opts.createdByUserId,
    })
    .returning({ id: dropInSessions.id });

  return { sessionId: created.id };
}

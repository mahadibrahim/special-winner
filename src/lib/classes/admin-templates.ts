/**
 * Admin class-slot-template support: input validation and the two orchestration
 * helpers the admin endpoints call — future-session cancellation (deactivation
 * with teeth) and schedule-change family notification.
 *
 * `templateInputSchema` mirrors `tier-units.ts`'s dollars↔cents-at-the-boundary
 * pattern: the wire format takes `*Dollars`, the DB stores `*Cents` — callers
 * convert with `dollarsToCents` from `@/lib/memberships/tier-units` right
 * before the insert/update.
 */
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { z } from "zod";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { classEnrollments } from "@/lib/db/schema/classes";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/classes/book-child";
import { processCancelRefund } from "@/lib/dropin/refund";
import { sendEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const startTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const templateInputSchema = z.object({
  name: z.string().trim().min(1),
  venueId: z.string().uuid(),
  sportLabel: z.string().trim().min(1).default("Soccer"),
  minAge: z.number().int().min(0).nullable().default(null),
  maxAge: z.number().int().min(0).nullable().default(null),
  /** 0=Sunday … 6=Saturday, matching classSlotTemplates.weekday / JS Date#getUTCDay. */
  weekday: z.number().int().min(0).max(6),
  /** Local wall-clock start, "HH:MM" 24h. */
  startTime: z.string().regex(startTimePattern, "startTime must be HH:MM (24h)"),
  durationMins: z.number().int().positive().default(55),
  capacity: z.number().int().min(1),
  sessionRateDollars: z.number().positive().nullable().default(null),
  memberRateDollars: z.number().positive().nullable().default(null),
  /** Per-session rate for BLOCK purchases of this template. Null falls back
   *  to sessionRateDollars at quote time — see classSlotTemplates.blockRateCents. */
  blockRateDollars: z.number().positive().nullable().default(null),
  active: z.boolean().default(true),
});

export type TemplateInput = z.infer<typeof templateInputSchema>;

/**
 * PUT body: the same fields as create, plus the deactivation flag. Kept as a
 * separate schema (rather than folding into `templateInputSchema`) so create
 * callers can't accidentally pass `cancelFutureSessions`.
 */
export const templateUpdateSchema = templateInputSchema.extend({
  cancelFutureSessions: z.boolean().optional(),
});

export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;

/** Normalizes a DB `time` column value ("16:00:00") or wire "HH:MM" down to
 *  "HH:MM" so the two are comparable regardless of source. */
export function normalizeStartTime(t: string): string {
  return t.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Deactivation with teeth: cancel this template's future scheduled sessions.
// ---------------------------------------------------------------------------

export interface CancelFutureSessionsResult {
  sessionsCancelled: number;
  bookingsRefunded: number;
}

/**
 * Cancels every future `scheduled` `drop_in_sessions` row materialized from
 * `templateId`. A session with zero active bookings flips to `cancelled`
 * directly; a session with active bookings runs each through the same
 * `processCancelRefund` refund pipeline the admin drop-in session cancel
 * endpoint uses (src/pages/api/admin/dropin/sessions/[id]/cancel.ts) before
 * flipping — this REUSES that refund logic rather than reimplementing it.
 *
 * Deliberately does not touch host assignment or the field-time-ledger block
 * removal that the pickup-session cancel endpoint also does: class sessions
 * always materialize with `hostUserId` null and `bookableResourceId` null
 * (src/lib/classes/materialize.ts), so neither applies here.
 */
export async function cancelFutureTemplateSessions(
  templateId: string,
  reason = "session_cancelled",
): Promise<CancelFutureSessionsResult> {
  const db = getDb();
  const now = new Date();

  const sessions = await db
    .select({ id: dropInSessions.id })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.classSlotTemplateId, templateId),
        eq(dropInSessions.status, "scheduled"),
        gt(dropInSessions.startsAt, now),
      ),
    );

  let sessionsCancelled = 0;
  let bookingsRefunded = 0;
  const REFUND_BATCH = 5;

  for (const session of sessions) {
    const activeBookings = await db
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(and(eq(dropInBookings.sessionId, session.id), ACTIVE_BOOKING_STATUSES));

    for (let i = 0; i < activeBookings.length; i += REFUND_BATCH) {
      const batch = activeBookings.slice(i, i + REFUND_BATCH);
      const results = await Promise.allSettled(
        batch.map((b) => processCancelRefund(b.id, { adminOverride: true, reason })),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.refunded) bookingsRefunded += 1;
      }
    }

    await db
      .update(dropInSessions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(dropInSessions.id, session.id));
    sessionsCancelled += 1;
  }

  return { sessionsCancelled, bookingsRefunded };
}

// ---------------------------------------------------------------------------
// Schedule-change family notification.
// ---------------------------------------------------------------------------

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function weekdayTimeLabel(weekday: number, startTime: string): string {
  return `${WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`} ${normalizeStartTime(startTime)}`;
}

/**
 * Emails every family with an ACTIVE enrollment on `templateId` a schedule
 * change notice. Called AFTER the template's PUT update has committed —
 * never blocks (or rolls back) the update itself. Each send is attempted
 * independently: one family's failure is logged via console.error and does
 * not stop the rest, and the function itself never throws.
 *
 * Returns the number of families actually notified (successful sends only),
 * grouped by parent email so a family with multiple enrolled children in
 * this template gets one email, not one per child.
 */
export async function notifyFamiliesOfScheduleChange(opts: {
  templateId: string;
  templateName: string;
  oldWeekday: number;
  oldStartTime: string;
  newWeekday: number;
  newStartTime: string;
}): Promise<number> {
  const db = getDb();

  const rows = await db
    .select({
      childFirstName: familyMembers.firstName,
      childLastName: familyMembers.lastName,
      parentEmail: users.email,
    })
    .from(classEnrollments)
    .innerJoin(familyMembers, eq(classEnrollments.familyMemberId, familyMembers.id))
    .innerJoin(users, eq(familyMembers.parentUserId, users.id))
    .where(
      and(
        eq(classEnrollments.slotTemplateId, opts.templateId),
        eq(classEnrollments.status, "active"),
      ),
    );

  const childNamesByEmail = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentEmail) continue;
    const names = childNamesByEmail.get(row.parentEmail) ?? [];
    names.push(`${row.childFirstName} ${row.childLastName}`);
    childNamesByEmail.set(row.parentEmail, names);
  }

  if (childNamesByEmail.size === 0) return 0;

  const appUrl = import.meta.env.PUBLIC_APP_URL || "http://localhost:4321";
  const oldLabel = weekdayTimeLabel(opts.oldWeekday, opts.oldStartTime);
  const newLabel = weekdayTimeLabel(opts.newWeekday, opts.newStartTime);
  const subject = `Schedule change: ${opts.templateName}`;

  let familiesNotified = 0;
  for (const [email, childNames] of childNamesByEmail) {
    const body = `The schedule for ${opts.templateName} (${childNames.join(", ")}) is changing from ${oldLabel} to ${newLabel}.`;
    try {
      const result = await sendEmail({
        to: email,
        subject,
        html: `<p>${body}</p><p><a href="${appUrl}/dashboard/classes">View in your dashboard</a></p>`,
        text: body,
      });
      if (result.success) {
        familiesNotified += 1;
      } else {
        console.error("[admin/classes/templates] schedule-change email not sent", {
          templateId: opts.templateId,
          email,
          error: result.error,
        });
      }
    } catch (err) {
      console.error("[admin/classes/templates] schedule-change email threw", {
        templateId: opts.templateId,
        email,
        err,
      });
    }
  }

  return familiesNotified;
}

/**
 * Trial-convert follow-up email — scan + orchestration.
 *
 * A child's ONE-PER-EVER trial class booking (`drop_in_bookings.payment_method
 * = 'trial'`, see the trial branch of `book-child.ts`) is an acquisition
 * offer: try one class before paying for a membership. This module finds
 * trial bookings whose session ended a few days ago, where the child STILL
 * has no live membership (i.e. they didn't convert), and nudges the parent
 * once — ever — toward the pricing page.
 *
 * Scan predicate (all conditions, org-scoped via the session join):
 *   - `drop_in_sessions.kind = 'class'`
 *   - `drop_in_bookings.payment_method = 'trial'`
 *   - `drop_in_bookings.status IN ('confirmed', 'no_show')`
 *   - `drop_in_sessions.ends_at` fell within [now - 3d, now - 1d] — long
 *     enough after the class for a parent to have decided, short enough
 *     that "how was it?" still reads as timely, not stale.
 *   - no prior non-failed `trial_convert` email already logged for this
 *     child (see the dedupe note below)
 *
 * The "child has no live membership NOW" check is NOT part of the SQL scan
 * — it has to be a live per-row lookup (`getActiveChildMembership`) done at
 * send time, not at query time, because it's the very thing this email
 * exists to react to: a child who converted between the class ending and
 * the cron running must NOT get a "come convert" nudge for a decision they
 * already made.
 *
 * Dedupe mechanism (documented choice): "one email per child EVER" needs a
 * per-CHILD key, but `email_logs` has no `family_member_id` column and
 * `recipient_email` is the PARENT's address — shared across siblings, so it
 * can't be the key (it would silently block a second child's trial-convert
 * email once the first sibling's had been logged). `email_logs.metadata`
 * is an existing, currently-unused jsonb column on the table `logEmail`
 * already writes to; this is the first caller to pass it a value:
 * `{ familyMemberId }`. Dedupe reads it back via a Postgres `->>` text
 * match. This is the "metadata stamp" option named in the task brief —
 * chosen over adding a new column (bigger migration for a single-cron
 * concern) or a new table (this is exactly what email_logs already is:
 * a send ledger; it just needed one more identifying field, which the
 * jsonb column was already there to hold). The SQL anti-join happens in
 * the scan query itself (mirrors `scanDropIns` in `feedback/dispatch.ts`)
 * so an already-emailed child never even gets counted as `scanned` on a
 * later run; `sendTrialConvertEmail` (src/lib/email/send.ts) ALSO
 * re-checks immediately before sending as a race guard, same shape as
 * `sendCaptureIncentiveEmail`/`sendInappRecaptureEmail`.
 *
 * Batch isolation: mirrors `materializeClassSessions` — each candidate is
 * wrapped in its own try/catch inside `runTrialConvertEmails` so one
 * child's unexpected failure (a bad membership-tier row, a Resend blip)
 * never stops the rest of the batch.
 */
import { and, asc, eq, gte, inArray, lte, ne, notExists, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInBookings,
  dropInSessions,
  emailLogs,
  familyMembers,
  membershipTiers,
  users,
} from "@/lib/db/schema";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
import { sendTrialConvertEmail, type TrialConvertTier } from "@/lib/email/send";
import { captureServerException } from "@/lib/observability/server-error";

/** The `email_logs.email_type` this cron logs under — also the dedupe key. */
export const TRIAL_CONVERT_EMAIL_TYPE = "trial_convert";

/** Scan window, in days-ago from `now`. */
export const TRIAL_CONVERT_MIN_DAYS_AGO = 1;
export const TRIAL_CONVERT_MAX_DAYS_AGO = 3;

const DAY_MS = 86_400_000;

export interface ScanWindow {
  /** Sessions must have ENDED at or before this instant (>= MIN_DAYS_AGO old). */
  endedBefore: Date;
  /** Sessions must have ENDED at or after this instant (<= MAX_DAYS_AGO old). */
  endedAfter: Date;
}

/**
 * The [now - MAX_DAYS_AGO, now - MIN_DAYS_AGO] instant range a session's
 * `ends_at` must fall inside to qualify. Both boundaries are inclusive —
 * mirrors `occurrenceInstants`'s inclusive-boundary convention in
 * materialize.ts.
 */
export function computeScanWindow(now: Date): ScanWindow {
  return {
    endedBefore: new Date(now.getTime() - TRIAL_CONVERT_MIN_DAYS_AGO * DAY_MS),
    endedAfter: new Date(now.getTime() - TRIAL_CONVERT_MAX_DAYS_AGO * DAY_MS),
  };
}

/**
 * Whether a membership tier's benefits grant class access at all — same
 * benefit-key test (`unlimited_classes` / `classes_per_month > 0`) already
 * duplicated in `get-child-membership.ts`, `allotment.ts`, and
 * `enrollment.ts` (and, client-side, `class-tiers.tsx`'s `isClassTier`).
 * Kept as its own small copy here rather than importing one of those:
 * none of them currently export it, and this is the established pattern
 * in this codebase for a two-line benefit-key predicate.
 */
export function hasClassBenefit(benefits: Record<string, unknown>): boolean {
  return benefits.unlimited_classes === true || (Number(benefits.classes_per_month) || 0) > 0;
}

/**
 * Pre-formatted monthly-price label for the email body. Mirrors the
 * fractional-cents handling in `buildTeamBackstopWarning` (send.ts) — whole
 * dollars render without decimals, fractional cents keep exactly two.
 */
export function formatMonthlyPriceCents(cents: number | null): string {
  if (cents == null) return "Ask us about pricing";
  const dollars = cents / 100;
  const formatted = dollars.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${formatted}/mo`;
}

export interface TrialConvertCandidate {
  familyMemberId: string;
  organizationId: string;
  parentUserId: string | null;
  parentEmail: string | null;
  parentFirstName: string | null;
  childFirstName: string;
  className: string;
  endsAt: Date;
}

/**
 * SQL scan for trial-convert candidates. See the module header for the
 * full predicate; the `notExists` clause is the SQL half of the dedupe
 * mechanism documented there.
 */
export async function scanTrialConvertCandidates(now: Date): Promise<TrialConvertCandidate[]> {
  const db = getDb();
  const { endedAfter, endedBefore } = computeScanWindow(now);

  const rows = await db
    .select({
      familyMemberId: dropInBookings.familyMemberId,
      organizationId: dropInSessions.organizationId,
      parentUserId: familyMembers.parentUserId,
      parentEmail: users.email,
      parentFirstName: users.firstName,
      childFirstName: familyMembers.firstName,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
      endsAt: dropInSessions.endsAt,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    // Every class_enrollments/trial booking is keyed to a CHILD
    // (family_members.parent_user_id set) — inner joins here naturally
    // drop any booking with a null family_member_id or a self-path row
    // (which shouldn't exist for kind='class' anyway; see materialize.ts).
    .innerJoin(familyMembers, eq(dropInBookings.familyMemberId, familyMembers.id))
    .innerJoin(users, eq(familyMembers.parentUserId, users.id))
    .where(
      and(
        eq(dropInSessions.kind, "class"),
        eq(dropInBookings.paymentMethod, "trial"),
        inArray(dropInBookings.status, ["confirmed", "no_show"]),
        gte(dropInSessions.endsAt, endedAfter),
        lte(dropInSessions.endsAt, endedBefore),
        notExists(
          db
            .select({ one: sql`1` })
            .from(emailLogs)
            .where(
              and(
                eq(emailLogs.emailType, TRIAL_CONVERT_EMAIL_TYPE),
                ne(emailLogs.status, "failed"),
                sql`${emailLogs.metadata} ->> 'familyMemberId' = ${dropInBookings.familyMemberId}::text`,
              ),
            ),
        ),
      ),
    );

  return rows.map((r) => ({
    familyMemberId: r.familyMemberId as string,
    organizationId: r.organizationId,
    parentUserId: r.parentUserId,
    parentEmail: r.parentEmail,
    parentFirstName: r.parentFirstName,
    childFirstName: r.childFirstName,
    // "The class they tried" — the template's own name when set (e.g.
    // "Soccer Skills 6-8"), falling back to the sport label. Same fallback
    // shape as checkout-line-item.ts's session display name.
    className: r.formatLabel ?? r.sportOrClassLabel,
    endsAt: r.endsAt,
  }));
}

/** Active CLASS-benefit tiers for an org, cheapest-first (displayOrder). */
async function getClassTiersForOrg(organizationId: string): Promise<TrialConvertTier[]> {
  const db = getDb();
  const rows = await db
    .select({
      name: membershipTiers.name,
      monthlyPriceCents: membershipTiers.monthlyPriceCents,
      benefits: membershipTiers.benefits,
    })
    .from(membershipTiers)
    .where(and(eq(membershipTiers.organizationId, organizationId), eq(membershipTiers.isActive, true)))
    .orderBy(asc(membershipTiers.displayOrder), asc(membershipTiers.name));

  return rows
    .filter((r) => hasClassBenefit((r.benefits as Record<string, unknown>) ?? {}))
    .map((r) => ({
      name: r.name,
      priceLabel: formatMonthlyPriceCents(r.monthlyPriceCents),
    }));
}

export interface TrialConvertResult {
  scanned: number;
  sent: number;
  skipped: number;
}

/**
 * Scan + send the trial-convert follow-up for every qualifying candidate.
 * Always returns the counter breakdown rather than throwing on a per-row
 * failure — see the module header's "batch isolation" note. A thrown error
 * out of this function means the SCAN query itself failed, not a per-child
 * send.
 */
export async function runTrialConvertEmails(now: Date): Promise<TrialConvertResult> {
  const counters: TrialConvertResult = { scanned: 0, sent: 0, skipped: 0 };
  const candidates = await scanTrialConvertCandidates(now);
  const tierCacheByOrg = new Map<string, TrialConvertTier[]>();

  for (const candidate of candidates) {
    counters.scanned += 1;
    try {
      // Defensive — the join already requires a non-null parentUserId, but
      // the column is nullable in the schema (self-path rows), so guard
      // rather than trust the join shape to hold forever.
      if (!candidate.parentUserId || !candidate.parentEmail) {
        counters.skipped += 1;
        continue;
      }

      // The live check this whole email exists to react to: skip anyone
      // who already converted.
      const activeMembership = await getActiveChildMembership(
        candidate.familyMemberId,
        candidate.organizationId,
      );
      if (activeMembership) {
        counters.skipped += 1;
        continue;
      }

      let tiers = tierCacheByOrg.get(candidate.organizationId);
      if (!tiers) {
        tiers = await getClassTiersForOrg(candidate.organizationId);
        tierCacheByOrg.set(candidate.organizationId, tiers);
      }
      if (tiers.length === 0) {
        // No live class-benefit tier to point at — sending would be a
        // dead-end CTA, so skip rather than send a pricing email with
        // nothing to price.
        counters.skipped += 1;
        continue;
      }

      const result = await sendTrialConvertEmail({
        familyMemberId: candidate.familyMemberId,
        parentUserId: candidate.parentUserId,
        parentEmail: candidate.parentEmail,
        parentFirstName: candidate.parentFirstName,
        childFirstName: candidate.childFirstName,
        className: candidate.className,
        tiers,
      });

      if (result.success && !result.deduped) {
        counters.sent += 1;
      } else {
        counters.skipped += 1;
      }
    } catch (err) {
      console.error(
        `[classes] trial-convert email failed for child ${candidate.familyMemberId}:`,
        err,
      );
      void captureServerException(err, {
        component: "classes/trial-convert",
        metadata: { family_member_id: candidate.familyMemberId },
      });
      counters.skipped += 1;
    }
  }

  return counters;
}

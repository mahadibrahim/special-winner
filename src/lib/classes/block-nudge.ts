/**
 * Block-abandon nudge — scan + orchestration.
 *
 * The materialization cron (`materializeClassSessions`, src/lib/classes/
 * materialize.ts) auto-books every ACTIVE class enrollment into its
 * template's upcoming sessions, but a credit-backed (block/pack) enrollment
 * can never get its first seat until the child has a valid guardian waiver
 * on file — the cron's own `skippedNoWaiver` counter is exactly this
 * cohort: a real, paid-for enrollment that the engine cannot seat because
 * nobody has been through the waiver-capturing booking flow yet (see that
 * counter's doc comment in materialize.ts, which named this email a
 * deliberate follow-up).
 *
 * This module finds that cohort — active credit-backed enrollments whose
 * child has NO valid waiver (`hasValidLiabilityWaiver`/Batch,
 * src/lib/consents/liability.ts) and NO booking at all yet on the
 * enrollment's template — and sends the parent ONE email ever, linking to
 * the choose-slot flow that captures the waiver and books the first seat in
 * one step (`/dashboard/family/choose-slot?child=X&block=success&slot=Y`,
 * see src/components/dashboard/choose-slot.tsx's BLOCK MODE).
 *
 * Scan predicate (all conditions):
 *   - `class_enrollments.status = 'active'`
 *   - `class_enrollments.credit_grant_id IS NOT NULL` (membership-backed
 *     enrollments have no grant to nudge and are excluded by the inner join)
 *   - the backing `class_credit_grants.nudge_sent_at IS NULL` — the one-shot
 *     gate, on the GRANT (not the enrollment): see the schema doc comment
 *     on `nudgeSentAt` for why the grant is the right home.
 *   - `class_credit_grants.expires_at > now` — a grant whose credits already
 *     expired has no weeks left for "pick up your booked weeks" to promise;
 *     nudging a dead grant would send a parent to sign a waiver for classes
 *     that no longer exist. (The enrollment itself isn't independently
 *     ended by expiry until the NEXT materialize-cron pass 0 sweep, so this
 *     can't be folded into the `status = 'active'` check above — it's a
 *     genuinely separate condition on the grant.)
 *   - NO `drop_in_bookings` row exists, in ANY status, for (this child, any
 *     session of this enrollment's template) — a booking row can only ever
 *     exist if a waiver was already established at booking time (fresh
 *     signature or on-file coverage; see book-child.ts), so "zero bookings"
 *     is the precise SQL shape of "never got past the waiver gate."
 *
 * The waiver check itself is NOT part of the SQL scan (unlike the booking
 * check) — `hasValidLiabilityWaiverBatch` has fallback logic across three
 * sources that isn't a single SQL predicate, and the design explicitly
 * wants it batched PER ORGANIZATION rather than one query per candidate, so
 * candidates are scanned first, then grouped by org and resolved with one
 * batched call per org.
 *
 * Dedupe / send ordering: STAMP-THEN-SEND (same shape as
 * `sendDuePaymentReminders`, src/lib/dropin/payment-reminder.ts, and the
 * fill-alert blast claim, src/lib/dropin/fill-alerts.ts). Every
 * still-eligible grant (post waiver-filter) is claimed in ONE
 * `UPDATE ... WHERE nudge_sent_at IS NULL RETURNING` before any email goes
 * out, so a crashed or slow send can never double-fire and a concurrent
 * cron tick can never re-claim the same grant. A stamped-but-unsent edge
 * (e.g. email not configured, or the send itself throws) is an accepted
 * trade-off, same as every other stamp-then-send cron in this codebase —
 * the alternative (send-then-stamp) reopens the double-send window a crash
 * between the two steps would create.
 *
 * Batch isolation: each candidate's send is wrapped in its own try/catch
 * (mirrors `runTrialConvertEmails`) so one child's unexpected failure never
 * stops the rest of the batch.
 */
import { and, eq, gt, inArray, isNull, notExists, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants, classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { hasValidLiabilityWaiverBatch } from "@/lib/consents/liability";
import { sendClassBlockNudgeEmail } from "@/lib/email/send";
import { captureServerException } from "@/lib/observability/server-error";

export interface BlockNudgeCandidate {
  grantId: string;
  organizationId: string;
  familyMemberId: string;
  slotTemplateId: string;
  templateName: string;
  parentUserId: string | null;
  parentEmail: string | null;
  parentFirstName: string | null;
  childFirstName: string;
}

/**
 * SQL scan for block-nudge candidates. See the module header for the full
 * predicate; the `notExists` clause is the "never got past the waiver gate"
 * check, and `nudge_sent_at IS NULL` is the one-shot gate. The waiver
 * predicate itself is applied by the caller, batched per organization.
 */
export async function scanBlockNudgeCandidates(
  now: Date = new Date(),
): Promise<BlockNudgeCandidate[]> {
  const db = getDb();

  const rows = await db
    .select({
      grantId: classCreditGrants.id,
      organizationId: classCreditGrants.organizationId,
      familyMemberId: classEnrollments.familyMemberId,
      slotTemplateId: classEnrollments.slotTemplateId,
      templateName: classSlotTemplates.name,
      parentUserId: familyMembers.parentUserId,
      parentEmail: users.email,
      parentFirstName: users.firstName,
      childFirstName: familyMembers.firstName,
    })
    .from(classEnrollments)
    .innerJoin(classCreditGrants, eq(classEnrollments.creditGrantId, classCreditGrants.id))
    .innerJoin(classSlotTemplates, eq(classEnrollments.slotTemplateId, classSlotTemplates.id))
    // Every class_enrollments row is keyed to a CHILD (family_members.
    // parent_user_id set) — classes have no adult self-enrollment path
    // (see materialize.ts's equivalent comment). The inner join to `users`
    // on parentUserId naturally drops any row where that's somehow null.
    .innerJoin(familyMembers, eq(classEnrollments.familyMemberId, familyMembers.id))
    .innerJoin(users, eq(familyMembers.parentUserId, users.id))
    .where(
      and(
        eq(classEnrollments.status, "active"),
        isNull(classCreditGrants.nudgeSentAt),
        gt(classCreditGrants.expiresAt, now),
        notExists(
          db
            .select({ one: sql`1` })
            .from(dropInBookings)
            .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
            .where(
              and(
                eq(dropInBookings.familyMemberId, classEnrollments.familyMemberId),
                eq(dropInSessions.classSlotTemplateId, classEnrollments.slotTemplateId),
              ),
            ),
        ),
      ),
    );

  return rows;
}

export interface BlockNudgeResult {
  scanned: number;
  sent: number;
  skipped: number;
}

/**
 * Scan + send the block-abandon nudge for every qualifying candidate. Always
 * returns the counter breakdown rather than throwing on a per-row failure —
 * see the module header's batch-isolation note. A thrown error out of this
 * function means the SCAN query (or a waiver-batch query) itself failed,
 * not a per-child send.
 */
export async function runBlockNudgeEmails(now: Date = new Date()): Promise<BlockNudgeResult> {
  const counters: BlockNudgeResult = { scanned: 0, sent: 0, skipped: 0 };
  const candidates = await scanBlockNudgeCandidates(now);
  counters.scanned = candidates.length;
  if (candidates.length === 0) return counters;

  // Batched waiver check, grouped by org — one call per organization, not
  // per candidate (the design's explicit requirement, and the whole reason
  // hasValidLiabilityWaiverBatch exists over the singular helper).
  const byOrg = new Map<string, BlockNudgeCandidate[]>();
  for (const candidate of candidates) {
    const group = byOrg.get(candidate.organizationId);
    if (group) group.push(candidate);
    else byOrg.set(candidate.organizationId, [candidate]);
  }

  const eligible: BlockNudgeCandidate[] = [];
  for (const [organizationId, group] of byOrg) {
    const verdicts = await hasValidLiabilityWaiverBatch(
      group.map((c) => c.familyMemberId),
      organizationId,
    );
    for (const candidate of group) {
      if (verdicts.get(candidate.familyMemberId)) {
        // Covered — the child picked up a valid waiver through some other
        // door since the last sweep. Nothing to nudge; the materialize cron
        // will auto-book them on its own next pass.
        counters.skipped += 1;
      } else if (!candidate.parentUserId || !candidate.parentEmail) {
        // Defensive — the join above already requires a non-null
        // parentUserId/email, but guard rather than trust the join shape to
        // hold forever (same posture as runTrialConvertEmails).
        counters.skipped += 1;
      } else {
        eligible.push(candidate);
      }
    }
  }
  if (eligible.length === 0) return counters;

  // Stamp-then-send: claim every still-eligible grant in ONE
  // UPDATE...RETURNING before sending anything. See the module header.
  const db = getDb();
  const claimed = await db
    .update(classCreditGrants)
    .set({ nudgeSentAt: now })
    .where(
      and(
        inArray(
          classCreditGrants.id,
          eligible.map((c) => c.grantId),
        ),
        isNull(classCreditGrants.nudgeSentAt),
      ),
    )
    .returning({ id: classCreditGrants.id });
  const claimedIds = new Set(claimed.map((row) => row.id));

  for (const candidate of eligible) {
    if (!claimedIds.has(candidate.grantId)) {
      // Raced by a concurrent tick between the scan above and this claim.
      counters.skipped += 1;
      continue;
    }
    try {
      const result = await sendClassBlockNudgeEmail({
        parentUserId: candidate.parentUserId as string,
        parentEmail: candidate.parentEmail as string,
        parentFirstName: candidate.parentFirstName,
        childFirstName: candidate.childFirstName,
        familyMemberId: candidate.familyMemberId,
        slotTemplateId: candidate.slotTemplateId,
        className: candidate.templateName,
      });
      if (result.success) {
        counters.sent += 1;
      } else {
        counters.skipped += 1;
      }
    } catch (err) {
      console.error(
        `[classes] block-nudge email failed for grant ${candidate.grantId}:`,
        err,
      );
      void captureServerException(err, {
        component: "classes/block-nudge",
        metadata: {
          grant_id: candidate.grantId,
          family_member_id: candidate.familyMemberId,
        },
      });
      counters.skipped += 1;
    }
  }

  return counters;
}

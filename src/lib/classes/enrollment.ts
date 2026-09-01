/**
 * Home-slot class enrollment library.
 *
 * A `class_enrollments` row is a child's STANDING weekly seat in a
 * `class_slot_templates` row (not a single booking) — the materialization
 * cron auto-books the child into each week's `drop_in_sessions` row while
 * the enrollment is `active` and the child's monthly allotment lasts (see
 * `createChildClassBooking` in book-child.ts for the per-week booking; this
 * file only manages the standing seat, never a `drop_in_bookings` row).
 *
 * Mirrors `createChildClassBooking`'s transaction shape (lock the row(s)
 * FOR UPDATE, gate-check inside the same tx, insert last) and error-result
 * convention (`{ ok, error: { code, message } }`).
 *
 * Org scoping: template lookups filter on `organizationId` so a
 * cross-org id 404s as `template_not_found` — never leak whether an id
 * exists in another tenant (matches the codebase's no-existence-leak
 * convention, e.g. POST /api/classes/book's session lookup).
 */
import { and, eq, gt, inArray, count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  classSlotTemplates,
  classEnrollments,
  classCreditGrants,
} from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
import { promoteNextWaitlister } from "@/lib/dropin/promotion";
import { getCreditBalances } from "./credits";
import { ageOnDate } from "./book-child";
import type { DropInTx } from "@/lib/dropin/booking";

export interface EnrollmentError {
  code:
    | "template_not_found"
    | "template_inactive"
    | "template_full"
    | "child_not_found"
    | "no_membership"
    | "already_enrolled"
    | "age_ineligible"
    // changeEnrollmentSlot-only: the enrollment id passed in doesn't exist
    // or isn't currently active. Not part of enrollChild's contract.
    | "enrollment_not_found"
    // changeEnrollmentSlot-only, CREDIT-BACKED enrollments only: the
    // destination slot costs more per session than the one the family paid
    // for. See the policy note at the check.
    | "rate_mismatch";
  message: string;
}

export type EnrollmentResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; error: EnrollmentError };

function err(code: EnrollmentError["code"], message: string): EnrollmentResult {
  return { ok: false, error: { code, message } };
}

/**
 * Whether a membership tier's benefits grant class access at all — the test
 * is on the BENEFIT KEYS, not the current `classAllotmentRemaining` count.
 * A child on a "4 classes/month" tier who has already used all 4 this month
 * still has `no_membership` be FALSE (they hold a valid class-benefit
 * membership; they're just out of seats for the month, which is a separate,
 * unenforced-here concern — enrollment is a standing seat, not a per-week
 * consumption; the weekly auto-booking is what actually draws on the
 * allotment and can leave a week unfilled once it's exhausted).
 */
function hasClassBenefit(benefits: Record<string, unknown>): boolean {
  return benefits.unlimited_classes === true || (Number(benefits.classes_per_month) || 0) > 0;
}

/**
 * Whether `birthDate` puts the child outside the template's age range.
 *
 * Uses the SAME age math as the per-session gate in book-child.ts
 * (`ageOnDate`, imported rather than re-derived — two implementations of
 * "how old is this child" would eventually disagree at a birthday
 * boundary). The reference date differs by design: the booking gate asks
 * "how old will they be at that session", while enrollment is a standing
 * seat with no single session to anchor on, so it asks "how old are they
 * now". A child who ages INTO range next month can simply enroll then; a
 * child who ages OUT mid-enrollment keeps their seat until the per-session
 * gate catches it, which is the kinder failure of the two.
 *
 * A template with no min/max, or a child with no DOB on file, skips the
 * gate — identical to the booking gate's conditions.
 *
 * Exported because the BLOCK PURCHASE endpoint has to run the same gate
 * before taking money (`POST /api/classes/blocks/purchase`) — see the note
 * there on why it anchors on the first remaining occurrence rather than
 * "now". One implementation, three call sites.
 *
 * Why this matters beyond a nicer error: without it, an out-of-range child
 * can hold an active enrollment forever, and the weekly materialization
 * cron re-attempts (and re-fails) their auto-booking with `age_ineligible`
 * on EVERY run — a permanent, silent contribution to the cron's `failed`
 * counter that nobody can act on, plus a family who thinks they have a
 * seat and never gets booked.
 */
export function isAgeIneligible(
  template: { minAge: number | null; maxAge: number | null },
  birthDate: string | null,
  onDate: Date,
): boolean {
  if (!birthDate) return false;
  if (template.minAge === null && template.maxAge === null) return false;
  const age = ageOnDate(birthDate, onDate);
  return (
    (template.minAge !== null && age < template.minAge) ||
    (template.maxAge !== null && age > template.maxAge)
  );
}

async function activeEnrollmentCount(tx: DropInTx, slotTemplateId: string): Promise<number> {
  const [row] = await tx
    .select({ c: count() })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.slotTemplateId, slotTemplateId),
        eq(classEnrollments.status, "active"),
      ),
    );
  return row?.c ?? 0;
}

export async function enrollChild(opts: {
  slotTemplateId: string;
  familyMemberId: string;
  parentUserId: string;
  organizationId: string;
}): Promise<EnrollmentResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    // Lock the template row, org-scoped.
    const [template] = await tx
      .select()
      .from(classSlotTemplates)
      .where(
        and(
          eq(classSlotTemplates.id, opts.slotTemplateId),
          eq(classSlotTemplates.organizationId, opts.organizationId),
        ),
      )
      .for("update");
    if (!template) return err("template_not_found", "Class not found");
    if (!template.active) return err("template_inactive", "Class is no longer offered");

    // Child ownership — the family_members row must belong to this parent
    // (classes are always a CHILD's standing seat; no adult self path).
    const [child] = await tx
      .select({ id: familyMembers.id, birthDate: familyMembers.birthDate })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, opts.familyMemberId),
          eq(familyMembers.parentUserId, opts.parentUserId),
        ),
      )
      .limit(1);
    if (!child) return err("child_not_found", "Child not found for this parent");

    // Age gate — see isAgeIneligible's doc comment.
    if (isAgeIneligible(template, child.birthDate, new Date())) {
      return err("age_ineligible", "Child is outside this class's age range");
    }

    // Membership + class-benefit gate.
    const membership = await getActiveChildMembership(
      opts.familyMemberId,
      opts.organizationId,
      tx,
    );
    if (!membership || membership.status !== "active" || !hasClassBenefit(membership.benefits)) {
      return err("no_membership", "Child has no active membership with a class benefit");
    }

    // Already-enrolled pre-check for a clean error code — the partial
    // unique index (class_enrollments_one_active_per_child_template)
    // backstops this against a concurrent duplicate insert.
    const [existing] = await tx
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.slotTemplateId, opts.slotTemplateId),
          eq(classEnrollments.familyMemberId, opts.familyMemberId),
          eq(classEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (existing) return err("already_enrolled", "Child is already enrolled in this class");

    // Capacity — the template row is already FOR-UPDATE-locked above, so
    // this count is consistent under concurrent enroll attempts on the same
    // template.
    const activeCount = await activeEnrollmentCount(tx, opts.slotTemplateId);
    if (activeCount >= template.capacity) return err("template_full", "Class is full");

    const [enrollment] = await tx
      .insert(classEnrollments)
      .values({
        slotTemplateId: opts.slotTemplateId,
        familyMemberId: opts.familyMemberId,
        membershipId: membership.id,
      })
      .returning();

    return { ok: true, enrollmentId: enrollment.id };
  });
}

/**
 * Cancels a child's already-materialized FUTURE `$0` seats on one slot
 * template, inside the caller's transaction, and returns the sessions whose
 * seat that freed (for the caller's POST-COMMIT waitlist promotion).
 *
 * THE one implementation, shared by all three paths that stop a standing
 * seat: `endEnrollment` (parent quits), `changeEnrollmentSlot` (parent moves
 * slot), and `endEnrollmentsForMembership` (Stripe cancels the subscription).
 * They strand exactly the same bookings — the materialization cron books up
 * to HORIZON_DAYS ahead, so every one of them otherwise leaves weeks of
 * auto-booked seats burning an allotment unit or a paid credit on a class
 * nobody will attend, while holding capacity a waitlisted family wants.
 *
 * SCOPE BOUNDARY — this cancels ONLY the `$0` seats an ENROLLMENT creates:
 * `member_allotment` and `pack_credit`. Everything else on those sessions is
 * left strictly alone, because this path cannot honour the obligations that
 * come with it:
 *   - `card_online` / `card_present` are PAID make-ups. Cancelling one here
 *     would void a real payment with no Stripe refund and no notification —
 *     every other cancellation route goes through `processCancelRefund`,
 *     which does both. A paid session stays attendable; if the family doesn't
 *     want it, they cancel it through the refund-capable endpoint.
 *   - `trial` is a one-off goodwill seat, not enrollment-owned.
 *   - `pending_payment` is a live hold with a customer-facing pay link, owned
 *     by the hold-expiry / refund machinery. Yanking it out from under a
 *     parent mid-payment is worse than letting it expire.
 * Widening this set means routing through the refund path instead.
 *
 * REASON CODE — always `user_request`, at all three call sites. The enum
 * (`drop_in_cancellation_reason`) offers user_request / no_show /
 * admin_override / session_cancelled / expired_promotion /
 * expired_payment_hold; only the first is remotely right. It is exact for the
 * two parent-driven paths, and defensible for the subscription-deleted one:
 * the customer cancelled their own subscription, and this seat release is a
 * direct consequence of that request. It is NOT `admin_override` (no staff
 * member acted) and NOT `session_cancelled` (the session still runs — only
 * this child's seat goes). The one case it flatters is an INVOLUNTARY
 * dunning cancellation, where "user_request" overstates the customer's
 * intent; a dedicated `membership_ended` enum value would be the honest fix
 * if that distinction ever needs to be reportable.
 */
async function releaseFutureEnrollmentSeats(
  tx: DropInTx,
  opts: { familyMemberId: string; slotTemplateId: string; now: Date },
): Promise<string[]> {
  const released = await tx
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancelledAt: opts.now,
      cancellationReason: "user_request",
    })
    .where(
      and(
        eq(dropInBookings.familyMemberId, opts.familyMemberId),
        inArray(dropInBookings.status, ["confirmed", "waitlisted", "pending_claim"]),
        inArray(dropInBookings.paymentMethod, ["member_allotment", "pack_credit"]),
        inArray(
          dropInBookings.sessionId,
          tx
            .select({ id: dropInSessions.id })
            .from(dropInSessions)
            .where(
              and(
                eq(dropInSessions.classSlotTemplateId, opts.slotTemplateId),
                gt(dropInSessions.startsAt, opts.now),
              ),
            ),
        ),
      ),
    )
    .returning({ sessionId: dropInBookings.sessionId });
  return released.map((r) => r.sessionId);
}

/**
 * Best-effort POST-COMMIT waitlist promotion over the sessions a release
 * freed. Shared by every caller of `releaseFutureEnrollmentSeats` for the
 * same reason the release itself is shared — and because the rule is subtle:
 * `promoteNextWaitlister` opens its OWN transaction, so calling it inside
 * ours would either deadlock on rows we still hold or promote against a state
 * that may still roll back. A promotion failure must never fail the
 * cancellation the family (or Stripe) asked for; the freed seat simply stays
 * open until the next cancellation or the expiry sweep runs.
 */
async function promoteReleasedSessions(sessionIds: Iterable<string>): Promise<void> {
  for (const sessionId of sessionIds) {
    try {
      await promoteNextWaitlister(sessionId);
    } catch (err) {
      console.error("[classes/enrollment] promote-next failed", { sessionId, err });
    }
  }
}

export interface EndEnrollmentResult {
  ended: boolean;
  /** Sessions left on the grant(s) this end set floating, counted AFTER the
   *  seat releases and filtered to SPENDABLE ones only (`remaining > 0` and
   *  not yet expired). 0 for membership-backed ends. */
  creditsFloated: number;
  /** EARLIEST unchanged expiry among the grants counted above — the date the
   *  first of those credits die, so the copy built from it can never promise
   *  a family more time than they have. Null when nothing floated. */
  creditsExpireAt: Date | null;
}

/**
 * Ends a standing enrollment (status → `ended`, `endedAt` stamped). Only
 * transitions a row currently `active` — calling it on an already-ended or
 * nonexistent id is a no-op, reported via `ended: false` so the caller (the
 * DELETE endpoint) can distinguish "nothing to do" from a hard failure.
 * Ownership/org checks are the caller's responsibility (the endpoint joins
 * to `familyMembers.parentUserId` before calling), matching the
 * `processCancelRefund(bookingId)` convention in refund.ts.
 *
 * Two things happen alongside the status flip, both mirroring
 * `changeEnrollmentSlot` (read its comments — this is deliberately the same
 * machinery, minus the destination half):
 *
 *   1. The child's already-materialized FUTURE $0 seats on this template are
 *      cancelled — `releaseFutureEnrollmentSeats`, shared with the slot
 *      change and the subscription-deleted webhook. Waitlisters on the freed
 *      sessions are promoted post-commit.
 *   2. The child's UNEXPIRED credit grants PINNED TO THIS TEMPLATE are
 *      un-pinned (`slotTemplateId → NULL`), so the sessions the family
 *      already paid for become credits spendable on any class until their
 *      unchanged `expiresAt` — owner decision 2 ("quitting a block mid-run
 *      converts remaining pinned credits to floating credits; no cash
 *      refunds"). `expiresAt` is deliberately never rewritten: these are the
 *      same credits, bought for the same window, not a new grant.
 *
 *      Keyed on (child, template) rather than on `enrollment.creditGrantId`,
 *      because those two can disagree. Buying a block on a slot the child
 *      ALREADY holds is a legitimate flow — `handleClassBlockPurchaseComplete`
 *      grants the pinned credits and its enrollment insert no-ops against the
 *      one-active-per-child-template index, leaving the surviving enrollment
 *      with `creditGrantId` NULL. A grant-keyed un-pin would strand exactly
 *      those credits (pinned to a slot the child no longer attends, hence
 *      unspendable anywhere) on quit. The (child, template) sweep is guarded
 *      on no OTHER active enrollment remaining for that pair, so a grant is
 *      only ever set floating once the seat it was pinned to is genuinely
 *      gone.
 *
 * Membership-backed enrollments get (1) only — their freed allotment units
 * return by the same count-derived arithmetic, and there is nothing pinned to
 * un-pin — and report `creditsFloated: 0 / creditsExpireAt: null`.
 */
export async function endEnrollment(id: string): Promise<EndEnrollmentResult> {
  const db = getDb();
  /** Sessions whose seat this end freed — promoted AFTER commit (below). */
  const releasedSessionIds = new Set<string>();

  const result = await db.transaction(async (tx): Promise<EndEnrollmentResult> => {
    const [enrollment] = await tx
      .select()
      .from(classEnrollments)
      .where(and(eq(classEnrollments.id, id), eq(classEnrollments.status, "active")))
      .for("update");
    if (!enrollment) return { ended: false, creditsFloated: 0, creditsExpireAt: null };

    const now = new Date();

    await tx
      .update(classEnrollments)
      .set({ status: "ended", endedAt: now })
      .where(eq(classEnrollments.id, id));

    for (const sessionId of await releaseFutureEnrollmentSeats(tx, {
      familyMemberId: enrollment.familyMemberId,
      slotTemplateId: enrollment.slotTemplateId,
      now,
    })) {
      releasedSessionIds.add(sessionId);
    }

    // GUARD: only float credits once the child holds NO active seat on this
    // template. Today the partial unique index
    // (class_enrollments_one_active_per_child_template) makes a second one
    // impossible, so this is belt-and-braces — but the alternative failure is
    // un-pinning the credits that pay for a seat the child still attends,
    // which is worth one cheap query to make structurally impossible rather
    // than index-dependent.
    const [stillEnrolled] = await tx
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.familyMemberId, enrollment.familyMemberId),
          eq(classEnrollments.slotTemplateId, enrollment.slotTemplateId),
          eq(classEnrollments.status, "active"),
        ),
      )
      .limit(1);

    /** Grants this end set floating — the (child, template) sweep, plus the
     *  enrollment's own backing grant, which is normally in that set anyway
     *  but is added explicitly so an already-floating one is still REPORTED
     *  (the family is giving up the seat those credits paid for either way). */
    const floatedGrantIds = new Set<string>();

    if (!stillEnrolled) {
      // Un-pin in the SAME transaction as the releases, so the balance read
      // below can never see a half-applied state. Expired grants are skipped:
      // floating a dead grant changes nothing a family can spend, and leaving
      // the pin is the smaller write.
      const unpinned = await tx
        .update(classCreditGrants)
        .set({ slotTemplateId: null })
        .where(
          and(
            eq(classCreditGrants.familyMemberId, enrollment.familyMemberId),
            eq(classCreditGrants.slotTemplateId, enrollment.slotTemplateId),
            gt(classCreditGrants.expiresAt, now),
          ),
        )
        .returning({ id: classCreditGrants.id });
      for (const row of unpinned) floatedGrantIds.add(row.id);
    }
    if (enrollment.creditGrantId) floatedGrantIds.add(enrollment.creditGrantId);

    if (floatedGrantIds.size === 0) {
      return { ended: true, creditsFloated: 0, creditsExpireAt: null };
    }

    // Org comes off the TEMPLATE, not a grant: `getCreditBalances` is
    // org-scoped and the enrollment row carries no organizationId, but the
    // template always exists (FK) even when no grant does.
    const [template] = await tx
      .select({ organizationId: classSlotTemplates.organizationId })
      .from(classSlotTemplates)
      .where(eq(classSlotTemplates.id, enrollment.slotTemplateId))
      .limit(1);
    if (!template) return { ended: true, creditsFloated: 0, creditsExpireAt: null };

    // Count-derived, like every other credit balance in this codebase — the
    // cancels above returned their credits with no counter to decrement, so
    // reading AFTER them is what makes `creditsFloated` the number the family
    // can actually spend.
    //
    // SPENDABLE only (`remaining > 0`, `expiresAt > now`) — the same filter
    // /api/classes/summary applies to the credits it renders. Without the
    // expiry half, a family quitting inside the last day of a block gets a
    // toast promising credits "until <a date already past>": the grant is
    // real, the balance is real, and not one session of it can be booked
    // (`selectRedeemableGrant` refuses `expiresAt <= at`).
    const balances = await getCreditBalances(
      enrollment.familyMemberId,
      template.organizationId,
      tx,
    );
    const spendable = balances.filter(
      (b) => floatedGrantIds.has(b.grantId) && b.remaining > 0 && b.expiresAt.getTime() > now.getTime(),
    );
    if (spendable.length === 0) {
      return { ended: true, creditsFloated: 0, creditsExpireAt: null };
    }
    return {
      ended: true,
      creditsFloated: spendable.reduce((sum, b) => sum + b.remaining, 0),
      // Earliest expiry across the floated grants — see the field's doc.
      creditsExpireAt: spendable.reduce(
        (earliest, b) => (b.expiresAt < earliest ? b.expiresAt : earliest),
        spendable[0].expiresAt,
      ),
    };
  });

  if (result.ended) await promoteReleasedSessions(releasedSessionIds);

  return result;
}

/**
 * Ends every ACTIVE standing enrollment backed by one membership, releasing
 * each child's future `$0` seats exactly as a parent-initiated quit does.
 *
 * The subscription-deleted webhook's cascade. It used to be a bare
 * `UPDATE class_enrollments SET status='ended'` inline in
 * `handleSubscriptionDeleted`, which stopped the cron booking NEW weeks but
 * left every seat already materialized inside the horizon standing — a
 * churned family kept up to HORIZON_DAYS of confirmed seats they no longer
 * pay for, holding capacity against waitlisted families. Same leak the slot
 * change had; same fix, same helper.
 *
 * Idempotent by construction: the `status = 'active'` filter means a webhook
 * retry (or a subscription id that never matched a membership) ends nothing,
 * releases nothing and promotes nothing.
 *
 * Credit grants are deliberately NOT touched here. A membership-backed
 * enrollment has no grant behind it, and a credit-backed one is not reachable
 * from a `membershipId` — `class_enrollments_membership_xor_grant` guarantees
 * exactly one of the two is set.
 */
export async function endEnrollmentsForMembership(
  membershipId: string,
): Promise<{ endedCount: number }> {
  const db = getDb();
  const releasedSessionIds = new Set<string>();

  const endedCount = await db.transaction(async (tx): Promise<number> => {
    const now = new Date();
    const ended = await tx
      .update(classEnrollments)
      .set({ status: "ended", endedAt: now })
      .where(
        and(
          eq(classEnrollments.membershipId, membershipId),
          eq(classEnrollments.status, "active"),
        ),
      )
      .returning({
        familyMemberId: classEnrollments.familyMemberId,
        slotTemplateId: classEnrollments.slotTemplateId,
      });

    for (const row of ended) {
      for (const sessionId of await releaseFutureEnrollmentSeats(tx, {
        familyMemberId: row.familyMemberId,
        slotTemplateId: row.slotTemplateId,
        now,
      })) {
        releasedSessionIds.add(sessionId);
      }
    }
    return ended.length;
  });

  // Post-commit, best-effort — same rule as every other caller. A webhook has
  // no request context to fail back to, so a promotion error here is logged
  // and swallowed rather than turning a successful cancellation into a 500
  // that Stripe would redeliver.
  await promoteReleasedSessions(releasedSessionIds);

  return { endedCount };
}

/**
 * Moves a child's standing enrollment to a different slot template — end
 * the old row and create the new one atomically in ONE transaction, so a
 * failed capacity check on the new slot leaves the old enrollment untouched
 * (no window where the child holds neither seat).
 *
 * The replacement row carries over whatever backed the old one — a
 * membership OR a credit grant — and, when it's a grant, re-pins that grant
 * to the destination template inside the same transaction (see the comments
 * at the insert). A block family that changes home slot takes their
 * remaining pinned credits with them, subject to the price guard below.
 *
 * The move also CANCELS the child's already-materialized future $0
 * (member_allotment / pack_credit) bookings on the old slot, so a credit or
 * allotment unit isn't burnt on a class they left — PAID bookings are left
 * alone (see the scope boundary at that UPDATE) — and promotes any waitlisters
 * into the freed seats once the transaction commits.
 *
 * Locks BOTH template rows FOR UPDATE, in a stable order (sorted by id)
 * rather than (old, new) — two concurrent swaps between the same pair of
 * templates in opposite directions would otherwise each hold one lock and
 * wait on the other, deadlocking. Sorting first guarantees every caller
 * acquires the pair in the same order.
 */
export async function changeEnrollmentSlot(
  id: string,
  newSlotTemplateId: string,
): Promise<EnrollmentResult> {
  const db = getDb();
  /** Old-slot sessions whose seat this move freed — promoted AFTER the
   *  transaction commits (see the loop below the transaction). */
  const releasedSessionIds = new Set<string>();

  // Explicit annotation: without it the callback's inferred return widens
  // `ok` to `boolean` and no longer satisfies the discriminated union.
  const result = await db.transaction(async (tx): Promise<EnrollmentResult> => {
    const [enrollment] = await tx
      .select()
      .from(classEnrollments)
      .where(and(eq(classEnrollments.id, id), eq(classEnrollments.status, "active")))
      .for("update");
    if (!enrollment) return err("enrollment_not_found", "Enrollment not found or not active");

    if (enrollment.slotTemplateId === newSlotTemplateId) {
      return err("already_enrolled", "Child is already enrolled in this class");
    }

    const templateIds = [enrollment.slotTemplateId, newSlotTemplateId].sort();
    const templateRows = await tx
      .select()
      .from(classSlotTemplates)
      .where(inArray(classSlotTemplates.id, templateIds))
      .orderBy(classSlotTemplates.id)
      .for("update");
    const oldTemplate = templateRows.find((t) => t.id === enrollment.slotTemplateId);
    const newTemplate = templateRows.find((t) => t.id === newSlotTemplateId);

    if (!oldTemplate) return err("template_not_found", "Current class not found");
    if (!newTemplate || newTemplate.organizationId !== oldTemplate.organizationId) {
      // Cross-org id (or nonexistent) — no-existence-leak: same code as a
      // plain missing template.
      return err("template_not_found", "New class not found");
    }
    if (!newTemplate.active) return err("template_inactive", "New class is no longer offered");

    // Age gate against the DESTINATION template only — the child already
    // holds the origin seat, and re-gating it here would strand a child who
    // aged out of their current class inside it (unable to move anywhere).
    // Same helper, same reference date as enrollChild.
    const [child] = await tx
      .select({ birthDate: familyMembers.birthDate })
      .from(familyMembers)
      .where(eq(familyMembers.id, enrollment.familyMemberId))
      .limit(1);
    if (isAgeIneligible(newTemplate, child?.birthDate ?? null, new Date())) {
      return err("age_ineligible", "Child is outside the new class's age range");
    }

    // PRICE GUARD, credit-backed (block) enrollments only.
    //
    // Credits are pinned to a slot and get re-pinned by this move (below), so
    // without a guard a family could buy the cheapest slot in the block and
    // immediately move to the most expensive one, keeping the cheap rate for
    // every remaining session. Membership-backed moves are unaffected: a
    // subscription doesn't buy a per-session rate, so there is nothing to
    // arbitrage.
    //
    // POLICY (safe default, owner-reviewable): allow the move when the
    // destination's effective block rate is <= the origin's — moving DOWN in
    // price costs the family money they already spent and is nobody's exploit.
    // A missing rate on either side is also refused: with nothing to compare,
    // "contact us" is the honest answer rather than a guess in either
    // direction. Revisit if the owner would rather charge the difference.
    if (enrollment.creditGrantId) {
      const effectiveRate = (t: { blockRateCents: number | null; sessionRateCents: number | null }) =>
        t.blockRateCents ?? t.sessionRateCents;
      const oldRate = effectiveRate(oldTemplate);
      const newRate = effectiveRate(newTemplate);
      if (oldRate === null || newRate === null || newRate > oldRate) {
        return err(
          "rate_mismatch",
          "This class has a different rate — contact us to switch.",
        );
      }
    }

    // Already-enrolled pre-check on the destination template (e.g. the
    // child already holds a separate active enrollment there).
    const [existing] = await tx
      .select({ id: classEnrollments.id })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.slotTemplateId, newSlotTemplateId),
          eq(classEnrollments.familyMemberId, enrollment.familyMemberId),
          eq(classEnrollments.status, "active"),
        ),
      )
      .limit(1);
    if (existing) return err("already_enrolled", "Child is already enrolled in the new class");

    const activeCount = await activeEnrollmentCount(tx, newSlotTemplateId);
    if (activeCount >= newTemplate.capacity) return err("template_full", "New class is full");

    const now = new Date();

    await tx
      .update(classEnrollments)
      .set({ status: "ended", endedAt: now })
      .where(eq(classEnrollments.id, id));

    // Release the seats the child already holds on the OLD slot's FUTURE
    // sessions — see `releaseFutureEnrollmentSeats` for the scope boundary
    // and the reason code. Both the allotment and the credit ledger are
    // COUNT-DERIVED over non-cancelled bookings, so cancelling here returns
    // the credit / allotment unit automatically; there is no counter to
    // decrement. Same transaction as the move, so a family never ends up
    // paying for the old slot and the new one at once.
    for (const sessionId of await releaseFutureEnrollmentSeats(tx, {
      familyMemberId: enrollment.familyMemberId,
      slotTemplateId: enrollment.slotTemplateId,
      now,
    })) {
      releasedSessionIds.add(sessionId);
    }

    // Carry BOTH backing columns, not just membershipId: a credit-backed
    // (block) enrollment has membershipId null, so copying only that would
    // insert a row with neither set and trip the
    // `class_enrollments_membership_xor_grant` CHECK — a 500 on every slot
    // change a block family makes. The CHECK guarantees exactly one of the
    // two is non-null on the source row, so copying both preserves it.
    const [created] = await tx
      .insert(classEnrollments)
      .values({
        slotTemplateId: newSlotTemplateId,
        familyMemberId: enrollment.familyMemberId,
        membershipId: enrollment.membershipId,
        creditGrantId: enrollment.creditGrantId,
      })
      .returning();

    // Re-pin the grant to the destination template, in the SAME transaction.
    // Block credits are pinned (`selectRedeemableGrant` refuses a grant whose
    // slotTemplateId doesn't match the session's), so a family that changes
    // home slot must take their remaining credits with them — otherwise the
    // seat moves and the credits paying for it become unspendable.
    //
    // The predicate also requires the grant still points at the OLD template,
    // which confines the update to genuinely pinned grants: a floating pack
    // grant (slotTemplateId null) is never re-pinned by a slot change.
    if (enrollment.creditGrantId) {
      await tx
        .update(classCreditGrants)
        .set({ slotTemplateId: newSlotTemplateId })
        .where(
          and(
            eq(classCreditGrants.id, enrollment.creditGrantId),
            eq(classCreditGrants.slotTemplateId, enrollment.slotTemplateId),
          ),
        );
    }

    return { ok: true, enrollmentId: created.id };
  });

  // Waitlist promotion, POST-COMMIT and best-effort — see
  // `promoteReleasedSessions` (same shape, and the same try/catch rationale,
  // as `processCancelRefund` in src/lib/dropin/refund.ts).
  if (result.ok) await promoteReleasedSessions(releasedSessionIds);

  return result;
}

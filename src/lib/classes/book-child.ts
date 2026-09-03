/**
 * Child class booking library — the engine's core.
 *
 * Mirrors `createConfirmedBookingFreePath` (src/lib/dropin/booking.ts)'s
 * transaction shape (lock the session row FOR UPDATE, gate-check inside the
 * same tx, insert last) but is class-specific:
 *
 * - Bookings are always keyed to a CHILD (`familyMemberId`), never a parent
 *   self-booking — pickup and class allotments must never contaminate each
 *   other, and `getActiveChildMembership` looks up membership BY CHILD.
 * - Two booking kinds, both $0 at this layer: `member` and `trial` (one per
 *   child EVER per org, no membership required — and NOT available to a
 *   child who already holds one; see the trial branch). `member` draws from
 *   the child's membership `classAllotmentRemaining` first and, when that is
 *   unavailable (no active membership, or the monthly allotment is used up),
 *   falls through to the class-credit ledger (src/lib/classes/credits.ts) —
 *   a pack or block credit the family ALREADY paid for, so the resulting row
 *   is still $0 with `paymentMethod: 'pack_credit'` and the spent grant
 *   recorded in `creditGrantId`. A BACKGROUND (`source: 'auto_enrollment'`)
 *   booking may only redeem PINNED block grants, never floating packs — see
 *   the comment in that branch. Paying for a class AT BOOKING TIME (the
 *   make-up checkout) remains a separate endpoint's concern — this library
 *   only ever inserts $0 rows.
 * - No team assignment, no gender caps, no `resolveRate` — classes have
 *   neither teams nor a rate card; every class booking here is $0.
 *
 * CALLER CONTRACT for `opts.dbOrTx`: when the caller passes its own tx (the
 * class-slot materialization cron auto-enrolling a child into a freshly
 * created session), this function runs ENTIRELY inside that tx and returns
 * before any post-commit side effect — it does not know when (or if) the
 * caller's tx actually commits, so calling `ensureDropInCustomerMembership`
 * or dispatching a confirmation here would fire before the row is durable.
 * The caller owns both side effects after its own tx commits. When
 * `dbOrTx` is omitted (the online-booking API route), this function opens
 * its own transaction and runs the post-commit side effects itself,
 * mirroring the free path's ordering exactly: membership grant, then an
 * awaited confirmation dispatch.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { classSlotTemplates, classEnrollments } from "@/lib/db/schema/classes";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
import { requiresTechnicalPremium } from "./technical-premium";
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  hasValidLiabilityWaiver,
  recordLiabilityWaiver,
} from "@/lib/consents/liability";
import { getCreditBalances, selectRedeemableGrant } from "@/lib/classes/credits";
import { checkSessionCapacityLocked, type DropInTx } from "@/lib/dropin/booking";
import { ensureDropInCustomerMembership } from "@/lib/organization/ensure-membership";
import { dispatchBookingConfirmation } from "@/lib/dropin/messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import type { BrandId } from "@/lib/branding/themes";

export type ChildBookingKind = "member" | "trial";

export interface ChildBookingError {
  code:
    | "session_not_found"
    | "session_not_class"
    | "session_not_scheduled"
    | "session_started"
    | "session_full"
    | "child_not_found"
    | "already_booked"
    | "no_membership"
    | "allotment_exhausted"
    | "technical_not_included"
    | "trial_already_used"
    | "member_child_no_trial"
    | "age_ineligible"
    | "waiver_required";
  message: string;
}

export type ChildBookingResult =
  | {
      ok: true;
      bookingId: string;
      paymentMethod: "member_allotment" | "trial" | "pack_credit";
    }
  | { ok: false; error: ChildBookingError };

/** Booking statuses that occupy a real seat / block a duplicate booking —
 *  matches the v3 unique index's WHERE clause on drop_in_bookings. The plain
 *  list is also exported so the cancel endpoint
 *  (src/pages/api/classes/bookings/[id]/cancel.ts) can gate on the same
 *  "still active" definition rather than duplicating the status list and
 *  risking drift. */
export const ACTIVE_BOOKING_STATUS_LIST = [
  "confirmed",
  "waitlisted",
  "pending_claim",
  "pending_payment",
] as const;
export const ACTIVE_BOOKING_STATUSES = inArray(
  dropInBookings.status,
  ACTIVE_BOOKING_STATUS_LIST,
);

/**
 * Cancellation cutoff predicate — pure, unit-testable. A booking may be
 * freely cancelled (seat/credit freed, no penalty) only when at least
 * `hours` hours separate `now` from the session's start.
 *
 * Applied UNIFORMLY to both booking kinds (member AND trial): a trial slot
 * occupies a real seat exactly like a member booking, so a late trial
 * cancel is just as disruptive to capacity planning as a late member
 * cancel — there is no reason to give trial bookings a laxer window.
 */
export function isBeforeCutoff(startsAt: Date, now: Date, hours = 24): boolean {
  return startsAt.getTime() - hours * 3_600_000 > now.getTime();
}

/**
 * Age in whole years on `onDate`, given a `YYYY-MM-DD` birth date string.
 * Exported as a pure helper for unit testing. A child who turns N on
 * `onDate` itself is N (the birthday has "been reached" that day).
 */
export function ageOnDate(birthDate: string, onDate: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  let age = onDate.getUTCFullYear() - by;
  const monthDiff = onDate.getUTCMonth() + 1 - bm;
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < bd)) {
    age -= 1;
  }
  return age;
}

function err(code: ChildBookingError["code"], message: string): ChildBookingResult {
  return { ok: false, error: { code, message } };
}

/**
 * Whether the child already holds ANY active `class_enrollments` row on a
 * technical template backed by THIS SAME membership — the definition of
 * "entitled to the technical add-on" for the per-session booking gate
 * (requiresTechnicalPremium decides whether the gate applies at all; this
 * decides whether it's already been paid for). One query, limit 1: an
 * enrollment implies entitlement by construction — `enrollChild` /
 * `changeEnrollmentSlot` already required `acknowledgeTechnicalPremium`
 * before creating or moving a technical-backed row, and the cron's
 * auto-materialized bookings (`source: "auto_enrollment"`) always come from
 * an existing enrollment, so this same check is what keeps that background
 * path unblocked for entitled kids without special-casing it here.
 */
async function hasActiveTechnicalEnrollment(
  tx: DropInTx,
  familyMemberId: string,
  membershipId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: classEnrollments.id })
    .from(classEnrollments)
    .innerJoin(classSlotTemplates, eq(classSlotTemplates.id, classEnrollments.slotTemplateId))
    .where(
      and(
        eq(classEnrollments.familyMemberId, familyMemberId),
        eq(classEnrollments.membershipId, membershipId),
        eq(classEnrollments.status, "active"),
        eq(classSlotTemplates.isTechnical, true),
      ),
    )
    .limit(1);
  return !!row;
}

export async function createChildClassBooking(opts: {
  sessionId: string;
  parentUserId: string;
  familyMemberId: string;
  kind: ChildBookingKind;
  source?: "online_booking" | "auto_enrollment";
  /** A signature captured in THIS request. `ipAddress`/`userAgent` are the
   *  signing audit trail and must be supplied by the HTTP layer from the
   *  request context (`clientAddress`, the `user-agent` header) — never read
   *  off the request body, which the client controls. Both optional so the
   *  cron and library callers (which never present a waiver) stay unchanged;
   *  they land as NULL, same as any other unattributable signature. */
  waiver?: {
    signedBy: string;
    consentText: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  brand?: BrandId;
  /** Cron passes its own tx — see the CALLER CONTRACT note above the import block. */
  dbOrTx?: DropInTx;
}): Promise<ChildBookingResult> {
  const db = getDb();
  const runInline = async (tx: DropInTx): Promise<ChildBookingResult> => {
    // Lock the session row.
    const [session] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, opts.sessionId))
      .for("update");

    if (!session) return err("session_not_found", "Session not found");
    if (session.kind !== "class") {
      return err("session_not_class", "Session is not a class session");
    }
    if (session.status !== "scheduled") {
      return err("session_not_scheduled", "Session is not open for booking");
    }
    if (session.startsAt <= new Date()) {
      return err("session_started", "Session has already started");
    }

    // Child ownership — the family_members row must belong to this parent.
    const [child] = await tx
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, opts.familyMemberId),
          eq(familyMembers.parentUserId, opts.parentUserId),
        ),
      )
      .limit(1);
    if (!child) return err("child_not_found", "Child not found for this parent");

    // Age gate — only when the session materialized from a template that
    // carries min/max age AND we know the child's birth date. No template
    // (one-off class) or no DOB on file both skip the gate.
    if (session.classSlotTemplateId && child.birthDate) {
      const [template] = await tx
        .select({ minAge: classSlotTemplates.minAge, maxAge: classSlotTemplates.maxAge })
        .from(classSlotTemplates)
        .where(eq(classSlotTemplates.id, session.classSlotTemplateId))
        .limit(1);
      if (template && (template.minAge !== null || template.maxAge !== null)) {
        const age = ageOnDate(child.birthDate, session.startsAt);
        if (
          (template.minAge !== null && age < template.minAge) ||
          (template.maxAge !== null && age > template.maxAge)
        ) {
          return err("age_ineligible", "Child is outside the class's age range");
        }
      }
    }

    // Duplicate guard, keyed on the PARTICIPANT (family_member_id) — matches
    // the drop_in_bookings_one_active_per_participant_session_v3 index.
    const [existing] = await tx
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, opts.sessionId),
          eq(dropInBookings.familyMemberId, opts.familyMemberId),
          ACTIVE_BOOKING_STATUSES,
        ),
      )
      .limit(1);
    if (existing) {
      return err("already_booked", "Child already has an active booking on this session");
    }

    // Kind-specific gate: membership allotment, or one-trial-ever.
    let paymentMethod: "member_allotment" | "trial" | "pack_credit";
    let membershipId: string | null = null;
    let creditGrantId: string | null = null;
    if (opts.kind === "member") {
      // The session's own band — technical slots need the gate below, a
      // one-off session with no template (classSlotTemplateId null) is
      // always standard. Kept as its own tiny lookup (rather than folded
      // into the age-gate select above) because that select only runs when
      // the child has a DOB on file; the technical band must be known
      // regardless.
      const isTechnicalSlot = session.classSlotTemplateId
        ? ((
            await tx
              .select({ isTechnical: classSlotTemplates.isTechnical })
              .from(classSlotTemplates)
              .where(eq(classSlotTemplates.id, session.classSlotTemplateId))
              .limit(1)
          )[0]?.isTechnical ?? false)
        : false;

      const membership = await getActiveChildMembership(
        opts.familyMemberId,
        session.organizationId,
        tx,
      );

      // Closes the leak this file exists to prevent: a member's monthly
      // allotment must never book a technical slot for free unless the tier
      // includes it (requiresTechnicalPremium's unlimited/no-premium
      // short-circuits) or the child already holds the paid-for add-on
      // (hasActiveTechnicalEnrollment). This does NOT block the credit
      // fallthrough below — a family that bought pinned block credits for
      // this exact technical slot still spends them normally; only the
      // ALLOTMENT path is gated.
      const technicalBlocked =
        membership !== null &&
        requiresTechnicalPremium({
          isTechnicalSlot,
          benefits: membership.benefits,
          technicalMonthlyCents: membership.technicalMonthlyCents,
        }) &&
        !(await hasActiveTechnicalEnrollment(tx, opts.familyMemberId, membership.id));

      if (
        membership &&
        membership.status === "active" &&
        membership.classAllotmentRemaining !== 0 &&
        !technicalBlocked
      ) {
        paymentMethod = "member_allotment";
        membershipId = membership.id;
      } else {
        // Credits fallthrough — pinned (this slot) first, then floating
        // packs, earliest expiry first. See src/lib/classes/credits.ts.
        const balances = await getCreditBalances(
          opts.familyMemberId,
          session.organizationId,
          tx,
        );
        // A BACKGROUND booking (the materialization cron auto-enrolling a
        // child into a freshly created session) may only ever redeem PINNED
        // grants. The two credit kinds mean different things:
        //   - A pinned BLOCK grant IS a standing commitment to this exact
        //     weekly slot — "my kid is in the Tuesday 4pm block" — so
        //     auto-booking it week after week is the feature, not a
        //     surprise.
        //   - A floating PACK grant is a wallet of parent-initiated spend
        //     ("use one whenever we can make it"), pinned to nothing. Left
        //     unrestricted, a child whose membership lapsed to paused/
        //     past_due while their enrollment stayed active would have that
        //     wallet silently drained by a background job — money spent
        //     with nobody asking. Before the credits ladder existed the
        //     cron simply skipped such a child; it still must.
        const redeemable =
          opts.source === "auto_enrollment"
            ? balances.filter((b) => b.slotTemplateId !== null)
            : balances;
        // Judged against the SESSION START, not the wall clock: a grant has
        // to still be alive when the session actually runs. See
        // selectRedeemableGrant's caller contract — this is what stops a
        // block credit being spent on a session past the block window
        // (the cron materializes HORIZON_DAYS ahead of any given run).
        const grant = selectRedeemableGrant(redeemable, {
          slotTemplateId: session.classSlotTemplateId,
          at: session.startsAt,
        });
        if (grant) {
          paymentMethod = "pack_credit";
          creditGrantId = grant.grantId;
        } else if (!membership || membership.status !== "active") {
          return err("no_membership", "Child has no active membership");
        } else if (membership.classAllotmentRemaining === 0) {
          return err("allotment_exhausted", "Child's monthly class allotment is used up");
        } else {
          // Reaching here means membership is active AND the allotment is
          // available (classAllotmentRemaining !== 0) — the only way the
          // first `if` above still didn't take this branch is
          // `technicalBlocked`. Distinct code so the client routes to the
          // membership-supplement upsell rather than a paid make-up quote.
          return err(
            "technical_not_included",
            "Technical classes need the technical supplement on the membership",
          );
        }
      }
    } else {
      // A trial is an ACQUISITION offer — "try one class before you
      // subscribe". A child who already holds a membership has nothing left
      // to try: their seat comes from the monthly allotment (or, once that's
      // used up, the paid make-up path), and letting them spend the
      // one-per-child-ever trial would burn a marketing credit to dodge the
      // allotment. Gate on ANY live membership status (active/paused/
      // past_due/incomplete — everything `getActiveChildMembership` returns),
      // not just `active`: a paused or past-due member family is still a
      // member family, and a lapsed-into-past_due subscription must be fixed
      // through billing, not routed around with a free trial.
      const membership = await getActiveChildMembership(
        opts.familyMemberId,
        session.organizationId,
        tx,
      );
      if (membership) {
        return err(
          "member_child_no_trial",
          "Child already has a membership — trial classes are for non-members",
        );
      }

      // Cross-session TOCTOU, accepted at launch scale: this check only
      // locks the SESSION row (above), not the child's other in-flight
      // bookings. Two concurrent trial-booking calls for the same child on
      // two DIFFERENT sessions can each read zero prior trials and both
      // insert — the same accepted-risk class as the allotment race
      // documented in src/lib/memberships/allotment.ts (over-granting by at
      // most the number of in-flight concurrent bookings). App-level guard
      // only; no DB uniqueness backstop by design at this scale.
      const [priorTrial] = await tx
        .select({ id: dropInBookings.id })
        .from(dropInBookings)
        .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
        .where(
          and(
            eq(dropInBookings.familyMemberId, opts.familyMemberId),
            eq(dropInBookings.paymentMethod, "trial"),
            eq(dropInSessions.organizationId, session.organizationId),
            ne(dropInBookings.status, "cancelled"),
          ),
        )
        .limit(1);
      if (priorTrial) {
        return err("trial_already_used", "Child has already used their trial class");
      }
      paymentMethod = "trial";
    }

    // Waiver-on-file: the canonical ANNUAL predicate (src/lib/consents/
    // liability.ts) — a granted, unexpired, org-scoped `consents` row, or a
    // legacy signature row inside the same 365-day window. Waivers are
    // per-organization legal releases (distinct legal entities,
    // organizations.legalName), so a signature on file at org A must not
    // silently waive liability at org B; the helper is org-scoped end to end.
    //
    // This replaced a local "any prior signed booking in this org" query with
    // NO date bound — under which a family that signed once in 2024 was never
    // asked again. Expiry is now the point: a lapsed veteran family re-signs,
    // and the dashboard nudge (/api/classes/summary's `hasWaiverOnFile`,
    // which calls this same helper) is what catches them before they hit
    // this gate.
    const waiverOnFile = await hasValidLiabilityWaiver(
      opts.familyMemberId,
      session.organizationId,
      tx,
    );

    let waiverSigned = false;
    let waiverSignedAt: Date | null = null;
    let waiverSignedBy: string | null = null;
    let waiverConsentVariant: string | null = null;
    let waiverConsentText: string | null = null;
    // A SIGNATURE FIRST, coverage second — the order is the rule, not a
    // detail. `waiverOnFile` decides whether this child had to be ASKED; only
    // the presence of `opts.waiver` decides what gets RECORDED (clause 3 of
    // recordLiabilityWaiver's caller contract). Checking coverage first, as
    // this used to, threw away every signature typed by an already-covered
    // family — a stale client, or a second tab that opened before the
    // dashboard's `hasWaiverOnFile` refreshed — and stamped the row as though
    // nobody had signed at all.
    if (opts.waiver) {
      waiverSigned = true;
      waiverSignedAt = new Date();
      // The classes engine only ever books a CHILD (see this file's header),
      // so the guardian variant is a correct hardcode here, not a default.
      waiverConsentVariant = "guardian";
      waiverSignedBy = opts.waiver.signedBy;
      waiverConsentText = opts.waiver.consentText;

      // …and the canonical consents row, written inside THIS tx so it lands
      // with the booking. recordLiabilityWaiver is append-only and does NOT
      // dedupe (consents is an audit log), so per its caller contract this
      // call lives ONLY on this branch — the one where a human signed. The
      // on-file branch below must never reach it, or every subsequent
      // booking would log a signature nobody gave.
      //
      // Deliberate: a `session_full` return below can still commit this row
      // (an `err()` return resolves the tx rather than rolling it back). The
      // human did sign the text they were shown, so logging that signature
      // is correct on its own terms — consents records SIGNATURES, not
      // bookings — and it spares them re-signing on the retry.
      await recordLiabilityWaiver(
        {
          familyMemberId: opts.familyMemberId,
          organizationId: session.organizationId,
          signedByUserId: opts.parentUserId,
          signedByName: opts.waiver.signedBy,
          consentVariant: "guardian",
          consentText: opts.waiver.consentText,
          // The signing audit trail, captured by the HTTP layer (see the
          // `waiver` field's doc comment). Once the legacy fallbacks age out
          // this consents row is the ONLY record of the signature, so it
          // carries the same ip/UA every other consent-writing surface does.
          ipAddress: opts.waiver.ipAddress ?? null,
          userAgent: opts.waiver.userAgent ?? null,
        },
        tx,
      );
    } else if (waiverOnFile) {
      waiverSigned = true;
      // Say WHY the row is marked signed. The shared attribution (owned by
      // consents/liability.ts) is the same one the paid drop-in door's webhook
      // fulfillment stamps, so the identical semantic state — "covered by the
      // annual waiver, nobody signed for this booking" — never renders two
      // different ways across the free and paid doors.
      //
      // `waiverSignedAt` deliberately stays NULL: hasValidLiabilityWaiver's
      // legacy fallbacks accept only DATED signature rows, so a dated derived
      // copy would let each booking renew the very window it was derived from.
      // `waiverConsentVariant`/`waiverConsentText` stay null too — no waiver
      // text was shown here, so there is nothing to name.
      waiverSignedBy = WAIVER_ON_FILE_ATTRIBUTION;
    } else {
      return err("waiver_required", "A signed guardian waiver is required");
    }

    // Capacity — the session row is already FOR-UPDATE-locked above.
    const capCheck = await checkSessionCapacityLocked(tx, opts.sessionId, session.capacity);
    if (capCheck.full) {
      return err("session_full", "Session is full");
    }

    const [booking] = await tx
      .insert(dropInBookings)
      .values({
        sessionId: opts.sessionId,
        userId: opts.parentUserId,
        familyMemberId: opts.familyMemberId,
        status: "confirmed",
        source: opts.source ?? "online_booking",
        paymentMethod,
        amountPaidCents: 0,
        membershipId,
        creditGrantId,
        waiverSigned,
        waiverSignedAt,
        waiverSignedBy,
        waiverConsentVariant,
        waiverConsentText,
        brand: opts.brand ?? "aspire",
      })
      .returning();

    return { ok: true, bookingId: booking.id, paymentMethod };
  };

  if (opts.dbOrTx) {
    // Caller (the class-slot cron) owns its own tx and post-commit side
    // effects — see the CALLER CONTRACT doc comment above.
    return await runInline(opts.dbOrTx);
  }

  const result = await db.transaction((tx) => runInline(tx));

  if (result.ok) {
    // Same post-commit ordering as the free path: membership grant, then an
    // awaited confirmation dispatch — both outside the tx so a messaging
    // failure can never roll back a confirmed booking.
    await ensureDropInCustomerMembership(db, opts.parentUserId, opts.sessionId);
    await awaitDispatch(
      "class booking confirmation",
      () => dispatchBookingConfirmation(result.bookingId, opts.brand),
      { bookingId: result.bookingId, brand: opts.brand },
    );
  }
  return result;
}

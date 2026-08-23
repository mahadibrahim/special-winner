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
 * - Two booking kinds, both $0 at this layer: `member` (draws from the
 *   child's membership `classAllotmentRemaining`) and `trial` (one per child
 *   EVER per org, no membership required). Paid class bookings (allotment
 *   exhausted, buy-a-class) are Task 5's checkout-endpoint concern — this
 *   library only ever inserts $0 rows.
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
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
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
    | "trial_already_used"
    | "age_ineligible"
    | "waiver_required";
  message: string;
}

export type ChildBookingResult =
  | { ok: true; bookingId: string; paymentMethod: "member_allotment" | "trial" }
  | { ok: false; error: ChildBookingError };

/** Booking statuses that occupy a real seat / block a duplicate booking —
 *  matches the v3 unique index's WHERE clause on drop_in_bookings. */
const ACTIVE_BOOKING_STATUSES = sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`;

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

export async function createChildClassBooking(opts: {
  sessionId: string;
  parentUserId: string;
  familyMemberId: string;
  kind: ChildBookingKind;
  source?: "online_booking" | "auto_enrollment";
  waiver?: { signedBy: string; consentText: string };
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
    let paymentMethod: "member_allotment" | "trial";
    let membershipId: string | null = null;
    if (opts.kind === "member") {
      const membership = await getActiveChildMembership(
        opts.familyMemberId,
        session.organizationId,
        tx,
      );
      if (!membership || membership.status !== "active") {
        return err("no_membership", "Child has no active membership");
      }
      if (membership.classAllotmentRemaining === 0) {
        return err("allotment_exhausted", "Child's monthly class allotment is used up");
      }
      paymentMethod = "member_allotment";
      membershipId = membership.id;
    } else {
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

    // Waiver-on-file: any prior signed booking for this child satisfies it;
    // otherwise the caller must supply one on this call.
    const [waiverOnFile] = await tx
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.familyMemberId, opts.familyMemberId),
          eq(dropInBookings.waiverSigned, true),
        ),
      )
      .limit(1);

    let waiverSigned = false;
    let waiverSignedAt: Date | null = null;
    let waiverSignedBy: string | null = null;
    let waiverConsentVariant: string | null = null;
    let waiverConsentText: string | null = null;
    if (waiverOnFile) {
      waiverSigned = true;
    } else if (opts.waiver) {
      waiverSigned = true;
      waiverSignedAt = new Date();
      waiverSignedBy = opts.waiver.signedBy;
      waiverConsentVariant = "guardian";
      waiverConsentText = opts.waiver.consentText;
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

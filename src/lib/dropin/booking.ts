/**
 * Drop-in booking orchestrator.
 *
 * Free-path entry point: confirms a member's $0 booking inside a single DB
 * transaction with `SELECT ... FOR UPDATE` on the session row to keep
 * concurrent bookings race-safe.
 *
 * Paid bookings (rate > 0) are handled separately via Stripe Checkout in
 * the API endpoint — we don't insert the booking row until the webhook
 * fires `checkout.session.completed`, to avoid orphan rows on Checkout
 * abandonment.
 *
 * Membership pricing is live: `getActiveMembershipForUser` delegates to the
 * shared `getActiveMembershipForOrg` lookup, which resolves the tier benefits
 * and the remaining `member_allotment` credits. Allotment is count-based —
 * inserting a confirmed `member_allotment` booking IS the decrement (the next
 * lookup counts it), so there is no separate counter to update here.
 */
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
  userSkillLevels,
} from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { and, eq, sql } from "drizzle-orm";
import { resolveRate, type ResolvedRate } from "./pricing";
import { checkMembersOnly, checkGenderCap } from "./gates";
import { assignTeam } from "./team-assignment";
import { dispatchBookingConfirmation } from "./messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";
import { ensureDropInCustomerMembership } from "@/lib/organization/ensure-membership";
import type { BrandId } from "@/lib/branding/themes";

export interface BookingError {
  code:
    | "members_only"
    | "session_full"
    | "gender_cap_full"
    | "session_not_found"
    | "session_not_scheduled"
    | "user_not_found"
    | "already_booked"
    | "rate_card_missing"
    | "non_free_rate";
  message: string;
}

export interface BookingResult {
  ok: true;
  bookingId: string;
  amountCents: number;
  paymentMethod: ResolvedRate["paymentMethod"];
  teamAssignment: string | null;
}

export interface BookingFailure {
  ok: false;
  error: BookingError;
}

export type CreateConfirmedBookingResult = BookingResult | BookingFailure;

export async function createConfirmedBookingFreePath(opts: {
  sessionId: string;
  userId: string;
  source: "online_booking" | "walk_up";
  waiverSigned?: boolean;
  waiverSignedAt?: Date;
  waiverSignedBy?: string;
  brand?: BrandId;
}): Promise<CreateConfirmedBookingResult> {
  const db = getDb();

  const bookingResult = await db.transaction(
    async (tx): Promise<CreateConfirmedBookingResult> => {
    // Lock the session row.
    const [session] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, opts.sessionId))
      .for("update");

    if (!session) {
      return {
        ok: false,
        error: { code: "session_not_found", message: "Session not found" },
      };
    }
    if (session.status !== "scheduled") {
      return {
        ok: false,
        error: {
          code: "session_not_scheduled",
          message: "Session is not open for booking",
        },
      };
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);
    if (!user) {
      return {
        ok: false,
        error: { code: "user_not_found", message: "User not found" },
      };
    }

    // Existing active booking? Bail before we try to insert (the partial
    // unique index would also catch it but we want a clean error code).
    // pending_payment (a kiosk walk-in hold) counts too — the free-path
    // orchestrator is the online-booking entry point, and a customer who
    // already holds a walk-in payment hold on this session shouldn't be
    // able to also grab a free-rate seat online.
    const existing = await tx
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, opts.sessionId),
          eq(dropInBookings.userId, opts.userId),
          sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
        ),
      );
    if (existing.length > 0) {
      return {
        ok: false,
        error: {
          code: "already_booked",
          message: "User already has an active booking on this session",
        },
      };
    }

    // Pass `tx` so the lookup reuses the transaction's connection — the
    // free-path orchestrator holds `SELECT FOR UPDATE` on the session row,
    // and grabbing a separate pool client here would contend / deadlock
    // under a small pool. See get-active-membership.ts.
    const membership = await getActiveMembershipForUser(
      opts.userId,
      session.organizationId,
      tx,
    );

    const [rateCard] = await tx
      .select()
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, session.organizationId))
      .limit(1);
    if (!rateCard) {
      return {
        ok: false,
        error: {
          code: "rate_card_missing",
          message:
            "Rate card not configured for organization — should have been seeded at org creation",
        },
      };
    }

    // Gates.
    const memGate = checkMembersOnly(session, membership);
    if (!memGate.ok) {
      return {
        ok: false,
        error: {
          code: memGate.reason,
          message: "Session is members-only",
        },
      };
    }

    // Capacity: confirmed + pending_payment (kiosk holds) + pending_claim
    // (promoted waitlisters mid-claim-window) all occupy a real seat — see
    // checkSessionCapacityLocked's doc comment. The session row is already
    // FOR-UPDATE-locked above, which is this helper's precondition.
    const capCheck = await checkSessionCapacityLocked(
      tx,
      opts.sessionId,
      session.capacity,
    );
    if (capCheck.full) {
      return {
        ok: false,
        error: { code: "session_full", message: "Session is full" },
      };
    }

    if (
      session.capacityMale !== null &&
      session.capacityFemale !== null &&
      user.gender !== null
    ) {
      const counts = await fetchGenderCounts(tx, opts.sessionId);
      const genderGate = checkGenderCap(session, user.gender, counts);
      if (!genderGate.ok) {
        return {
          ok: false,
          error: { code: genderGate.reason, message: "Gender cap full" },
        };
      }
    }

    // Resolve rate. The free-path orchestrator only handles $0 outcomes.
    const rate = resolveRate(session, { id: opts.userId }, membership, rateCard);
    if (rate.amountCents !== 0) {
      return {
        ok: false,
        error: {
          code: "non_free_rate",
          message:
            "Booking requires payment — use Stripe Checkout flow instead",
        },
      };
    }

    // Existing bookings for team-balance computation.
    const existingForTeam = await tx
      .select({
        teamAssignment: dropInBookings.teamAssignment,
        skillLevel: sql<string>`coalesce(usl.level::text, 'all_levels')`,
      })
      .from(dropInBookings)
      .leftJoin(
        sql`user_skill_levels usl`,
        sql`usl.user_id = ${dropInBookings.userId} AND usl.sport = ${session.sportOrClassLabel}`,
      )
      .where(
        and(
          eq(dropInBookings.sessionId, opts.sessionId),
          eq(dropInBookings.status, "confirmed"),
        ),
      );

    const userSkill = await fetchUserSkill(
      tx,
      opts.userId,
      session.sportOrClassLabel,
    );
    const team = assignTeam(session, userSkill, existingForTeam);

    const [booking] = await tx
      .insert(dropInBookings)
      .values({
        sessionId: opts.sessionId,
        userId: opts.userId,
        status: "confirmed",
        source: opts.source,
        paymentMethod: rate.paymentMethod,
        amountPaidCents: 0,
        membershipId: rate.membershipId,
        teamAssignment: team,
        waiverSigned: opts.waiverSigned ?? false,
        waiverSignedAt: opts.waiverSignedAt ?? null,
        waiverSignedBy: opts.waiverSignedBy ?? null,
        brand: opts.brand ?? "aspire",
      })
      .returning();

    // No explicit allotment decrement: the row we just inserted (payment
    // method `member_allotment`) is itself the unit of consumption — the next
    // getActiveMembershipForOrg lookup counts it against the monthly cap.

    // Confirmation is dispatched after the tx commits (see below) — an
    // un-awaited send here is dropped when the serverless function freezes.

    return {
      ok: true,
      bookingId: booking.id,
      amountCents: 0,
      paymentMethod: rate.paymentMethod,
      teamAssignment: team,
    };
  });

  // Confirmation email — awaited so the send completes before the function
  // freezes; outside the tx so a messaging failure can't roll back the booking.
  if (bookingResult.ok) {
    // Booking makes this user a customer of the org (directory visibility +
    // role-assignment gate). After the tx so it can never roll back a booking.
    await ensureDropInCustomerMembership(db, opts.userId, opts.sessionId);

    await awaitDispatch(
      "dropin confirmation",
      () => dispatchBookingConfirmation(bookingResult.bookingId, opts.brand),
      { bookingId: bookingResult.bookingId, brand: opts.brand },
    );
  }
  return bookingResult;
}

// ---- Helper -----------------------------------------------------------------
// The memberships schema is live — delegate to the shared lookup. Keep this
// re-export so existing call sites (the index endpoint, this orchestrator)
// do not need to change their import.

export async function getActiveMembershipForUser(
  userId: string,
  organizationId: string,
  /** Optional Drizzle tx — pass it when calling inside `db.transaction(...)`. */
  dbOrTx?: Parameters<typeof getActiveMembershipForOrg>[2],
): Promise<import("./pricing").MembershipForPricing | null> {
  return await getActiveMembershipForOrg(userId, organizationId, dbOrTx);
}

/** A Drizzle transaction handle, as passed into `db.transaction(async (tx) => ...)`. */
export type DropInTx = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

export interface SessionCapacityStatus {
  /** Bookings currently occupying a seat (see status list below). */
  taken: number;
  capacity: number;
  full: boolean;
}

/**
 * Shared capacity gate for every confirm point that can hand out a real
 * seat: the free-path orchestrator, the paid Checkout webhook, and the
 * walk-in kiosk hold. A seat is occupied by `confirmed` (booked),
 * `pending_payment` (a kiosk walk-in mid-payment — the physical person is
 * standing at the venue holding the slot), or `pending_claim` (a promoted
 * waitlister inside their claim window) — none of those should be sellable
 * to a second person.
 *
 * CALLER CONTRACT: the caller must already hold `SELECT ... FOR UPDATE` on
 * the `sessionId` row in the SAME transaction `tx` before calling this —
 * that lock is what makes the count-then-decide read consistent under
 * concurrent confirm attempts on the same session. This function does not
 * take the lock itself (a second, redundant `FOR UPDATE` here would still
 * be correct but wastes a round trip — every call site already locks the
 * session for its own team-assignment/rate-resolution logic first).
 *
 * `lockedCapacity`: optional — pass `.capacity` from the session row the
 * caller already locked above, to skip re-selecting a column this function
 * would otherwise re-fetch from the same locked row. Omit it (existing call
 * sites whose lock query didn't project `capacity`) and the function falls
 * back to its own SELECT, unchanged.
 */
export async function checkSessionCapacityLocked(
  tx: DropInTx,
  sessionId: string,
  lockedCapacity?: number,
): Promise<SessionCapacityStatus> {
  let capacity: number;
  if (lockedCapacity !== undefined) {
    capacity = lockedCapacity;
  } else {
    const [session] = await tx
      .select({ capacity: dropInSessions.capacity })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, sessionId))
      .limit(1);
    capacity = session?.capacity ?? 0;
  }

  const [row] = await tx
    .select({ c: sql<number>`count(*)::int` })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, sessionId),
        sql`${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim')`,
      ),
    );
  const taken = row?.c ?? 0;

  return { taken, capacity, full: taken >= capacity };
}

async function fetchGenderCounts(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  sessionId: string,
): Promise<{ male: number; female: number }> {
  const [row] = await tx.execute<{ male: number; female: number }>(
    sql`
      SELECT
        COUNT(*) FILTER (WHERE u.gender = 'male')::int AS male,
        COUNT(*) FILTER (WHERE u.gender = 'female')::int AS female
      FROM drop_in_bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.session_id = ${sessionId}
        AND b.status = 'confirmed'
    `,
  );
  return { male: row?.male ?? 0, female: row?.female ?? 0 };
}

async function fetchUserSkill(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  userId: string,
  sport: string,
): Promise<string> {
  const [row] = await tx
    .select({ level: userSkillLevels.level })
    .from(userSkillLevels)
    .where(
      and(eq(userSkillLevels.userId, userId), eq(userSkillLevels.sport, sport)),
    )
    .limit(1);
  return row?.level ?? "all_levels";
}

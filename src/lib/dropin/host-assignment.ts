import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { hostProfiles } from "@/lib/db/schema/hosts";

/**
 * Host↔session lifecycle. The ONLY writers of drop_in_sessions.host_user_id.
 *
 * Comp booking: assigning creates a confirmed $0 `host_comp` booking so the
 * host occupies a real seat in every capacity count — but creation BYPASSES
 * the capacity gate (owner decision: the host runs the game either way, so a
 * full game may overfill by exactly one). If the host already holds an
 * active booking on the session (booked as a player first), we keep that
 * booking and create nothing — compBookingId is null in that case.
 *
 * Both functions lock the session row FOR UPDATE: claim races resolve to
 * one winner, and remove-vs-assign can't interleave.
 */

export type AssignHostResult =
  | { ok: true; compBookingId: string | null }
  | {
      ok: false;
      code:
        | "session_not_found"
        | "session_not_scheduled"
        | "not_active_host"
        | "already_hosted";
      message: string;
    };

export async function assignHostToSession(opts: {
  sessionId: string;
  hostUserId: string;
  allowReplace?: boolean;
}): Promise<AssignHostResult> {
  const db = getDb();
  return await db.transaction(async (tx): Promise<AssignHostResult> => {
    const [session] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, opts.sessionId))
      .for("update");
    if (!session) {
      return { ok: false, code: "session_not_found", message: "Session not found" };
    }
    if (session.status !== "scheduled") {
      return {
        ok: false,
        code: "session_not_scheduled",
        message: "Session is not open for hosting",
      };
    }
    if (session.hostUserId && session.hostUserId !== opts.hostUserId) {
      if (!opts.allowReplace) {
        return {
          ok: false,
          code: "already_hosted",
          message: "Session already has a host",
        };
      }
      await cancelCompBookingTx(tx, opts.sessionId, session.hostUserId);
    }

    const [profile] = await tx
      .select({ id: hostProfiles.id, status: hostProfiles.status })
      .from(hostProfiles)
      .where(
        and(
          eq(hostProfiles.userId, opts.hostUserId),
          eq(hostProfiles.organizationId, session.organizationId),
        ),
      )
      .limit(1);
    if (!profile || profile.status !== "active") {
      return {
        ok: false,
        code: "not_active_host",
        message: "User is not an active host in this organization",
      };
    }

    await tx
      .update(dropInSessions)
      .set({ hostUserId: opts.hostUserId, updatedAt: new Date() })
      .where(eq(dropInSessions.id, opts.sessionId));

    // Comp booking — skip if the host already holds an active booking
    // (unique partial index would reject the insert anyway; this keeps the
    // player-then-host path clean).
    const existing = await tx
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, opts.sessionId),
          eq(dropInBookings.userId, opts.hostUserId),
          sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
        ),
      );
    if (existing.length > 0) {
      return { ok: true, compBookingId: null };
    }

    const [comp] = await tx
      .insert(dropInBookings)
      .values({
        sessionId: opts.sessionId,
        userId: opts.hostUserId,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "host_comp",
        amountPaidCents: 0,
      })
      .returning();
    return { ok: true, compBookingId: comp.id };
  });
}

export async function removeHostFromSession(opts: {
  sessionId: string;
  reason: "admin_removed" | "host_unclaimed" | "session_cancelled" | "host_revoked";
}): Promise<{ removedHostUserId: string | null; cancelledCompBookingId: string | null }> {
  const db = getDb();
  return await db.transaction(async (tx) => {
    const [session] = await tx
      .select({ hostUserId: dropInSessions.hostUserId })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, opts.sessionId))
      .for("update");
    if (!session?.hostUserId) {
      return { removedHostUserId: null, cancelledCompBookingId: null };
    }
    await tx
      .update(dropInSessions)
      .set({ hostUserId: null, updatedAt: new Date() })
      .where(eq(dropInSessions.id, opts.sessionId));
    const cancelledCompBookingId = await cancelCompBookingTx(
      tx,
      opts.sessionId,
      session.hostUserId,
    );
    return { removedHostUserId: session.hostUserId, cancelledCompBookingId };
  });
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Cancel the host's comp booking (only host_comp rows — a paid player
 * booking held by the same user is never touched). */
async function cancelCompBookingTx(
  tx: Tx,
  sessionId: string,
  hostUserId: string,
): Promise<string | null> {
  const [cancelled] = await tx
    .update(dropInBookings)
    .set({
      status: "cancelled",
      cancellationReason: "admin_override",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(dropInBookings.sessionId, sessionId),
        eq(dropInBookings.userId, hostUserId),
        eq(dropInBookings.paymentMethod, "host_comp"),
        sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
      ),
    )
    .returning({ id: dropInBookings.id });
  return cancelled?.id ?? null;
}

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";

export interface AttendanceEntry {
  bookingId: string;
  action: "check_in" | "no_show" | "undo_check_in";
}

/**
 * Bulk attendance core shared by the admin AttendancePanel endpoint and the
 * host game-day endpoint. Callers are responsible for AUTH; this function
 * only guarantees bookings outside `sessionId` are ignored.
 */
export async function applyAttendanceEntries(
  sessionId: string,
  entries: AttendanceEntry[],
): Promise<{ updated: number }> {
  const db = getDb();
  const ids = entries.map((e) => e.bookingId);
  if (ids.length === 0) return { updated: 0 };

  const ours = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(and(eq(dropInBookings.sessionId, sessionId), inArray(dropInBookings.id, ids)));
  const ourIds = new Set(ours.map((r) => r.id));

  const actionById = new Map<string, AttendanceEntry["action"]>();
  for (const entry of entries) {
    if (!ourIds.has(entry.bookingId)) continue;
    actionById.set(entry.bookingId, entry.action);
  }
  const idsFor = (action: AttendanceEntry["action"]) =>
    [...actionById.entries()].filter(([, a]) => a === action).map(([id]) => id);

  const now = new Date();
  const checkInIds = idsFor("check_in");
  const undoIds = idsFor("undo_check_in");
  const noShowIds = idsFor("no_show");

  if (checkInIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({ checkedInAt: now, updatedAt: now })
      .where(inArray(dropInBookings.id, checkInIds));
  }
  if (undoIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({ checkedInAt: null, updatedAt: now })
      .where(inArray(dropInBookings.id, undoIds));
  }
  if (noShowIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({
        status: "no_show",
        cancellationReason: "no_show",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(inArray(dropInBookings.id, noShowIds));
  }
  return { updated: actionById.size };
}

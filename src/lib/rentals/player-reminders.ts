/**
 * Reminder sweep for unsigned field-rental player waivers.
 *
 * Selects `pending` roster players whose rental is still upcoming and whose
 * `reminder_sent_at` is null or older than 24h, dispatches a reminder email
 * (Task 4's `dispatchPlayerWaiverReminder`), and stamps `reminder_sent_at`
 * regardless of send outcome — so a hard-bouncing address isn't retried
 * every run. Bounded to 200 rows per sweep.
 */
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalPlayers, fieldRentals } from "@/lib/db/schema/field-rentals";
import { dispatchPlayerWaiverReminder } from "@/lib/rentals/messages/player-waiver";

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function remindPendingRentalPlayers(): Promise<{ reminded: number }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - REMINDER_INTERVAL_MS);
  const rows = await getDb()
    .select({ id: fieldRentalPlayers.id })
    .from(fieldRentalPlayers)
    .innerJoin(fieldRentals, eq(fieldRentals.id, fieldRentalPlayers.rentalId))
    .where(
      and(
        eq(fieldRentalPlayers.status, "pending"),
        gt(fieldRentals.startsAt, now),
        or(isNull(fieldRentalPlayers.reminderSentAt), lt(fieldRentalPlayers.reminderSentAt, cutoff)),
      ),
    )
    .limit(200);

  let reminded = 0;
  for (const r of rows) {
    const res = await dispatchPlayerWaiverReminder(r.id).catch(() => ({ ok: false }));
    // Stamp regardless of send outcome so a hard-bouncing address isn't retried every run.
    await getDb().update(fieldRentalPlayers).set({ reminderSentAt: now }).where(eq(fieldRentalPlayers.id, r.id));
    if (res.ok) reminded++;
  }
  return { reminded };
}

/**
 * Conflict detection for a proposed rental, run INSIDE a transaction.
 *
 * Takes a Postgres transaction-scoped advisory lock keyed on
 * (venueId, fieldNumber) so concurrent booking attempts for the same field
 * serialize. Then checks for any overlapping confirmed/pending rental or
 * scheduled/in-progress game on that field. Returns null if clear, or an
 * error string if the slot is taken.
 *
 * The caller MUST be inside `db.transaction(...)` and pass the `tx` handle —
 * the advisory lock is transaction-scoped and releases on commit/rollback.
 */
import { and, eq, inArray, lt, gt, or, isNull, gte, ne, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { games } from "@/lib/db/schema/teams";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function assertNoRentalConflict(
  tx: Tx,
  params: {
    venueId: string;
    fieldNumber: number;
    startsAt: Date;
    endsAt: Date;
    /** When re-checking an existing row (e.g. admin edit), exclude it. */
    excludeRentalId?: string;
  },
): Promise<string | null> {
  const { venueId, fieldNumber, startsAt, endsAt, excludeRentalId } = params;

  // Transaction-scoped advisory lock. hashtext(uuid) → int4, fieldNumber is
  // already int4; the two-arg form locks on the pair.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${venueId}), ${fieldNumber})`,
  );

  const now = new Date();

  // Overlapping rental on the same field.
  const rentalConflicts = await tx
    .select({ id: fieldRentals.id })
    .from(fieldRentals)
    .where(
      and(
        eq(fieldRentals.venueId, venueId),
        eq(fieldRentals.fieldNumber, fieldNumber),
        lt(fieldRentals.startsAt, endsAt),
        gt(fieldRentals.endsAt, startsAt),
        excludeRentalId ? ne(fieldRentals.id, excludeRentalId) : undefined,
        or(
          eq(fieldRentals.status, "confirmed"),
          and(
            eq(fieldRentals.status, "pending_payment"),
            or(
              isNull(fieldRentals.paymentExpiresAt),
              gte(fieldRentals.paymentExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .limit(1);
  if (rentalConflicts.length > 0) {
    return "That field is already booked for part of the requested time.";
  }

  // Overlapping game on the same field. game end = scheduledAt + duration.
  // NOTE: games.fieldNumber is varchar in the schema; cast the integer param
  // to text for the comparison.
  const gameConflicts = await tx
    .select({ id: games.id })
    .from(games)
    .where(
      and(
        eq(games.venueId, venueId),
        eq(games.fieldNumber, String(fieldNumber)),
        inArray(games.status, ["scheduled", "in_progress"]),
        lt(games.scheduledAt, endsAt),
        gt(
          sql`${games.scheduledAt} + (COALESCE(${games.durationMinutes}, 0) * interval '1 minute')`,
          // A JS Date passed into a raw sql() context loses its pg type and must be cast explicitly.
          sql`${startsAt.toISOString()}::timestamptz`,
        ),
      ),
    )
    .limit(1);
  if (gameConflicts.length > 0) {
    return "A scheduled game occupies that field for part of the requested time.";
  }

  return null;
}

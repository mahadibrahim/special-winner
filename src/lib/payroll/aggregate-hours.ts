/**
 * Pure aggregation of hourly (coach / venue_manager) time_entries rows into
 * one summary row per (userId, role). Referee entries are per-match
 * stipends, not hourly labor — see gusto-csv.ts / referee-lines.ts for that
 * flavor.
 *
 * Rules (docs/superpowers/plans/2026-07-07-gusto-export.md):
 *   - A "closed" shift (clockOutAt set) contributes its duration to the
 *     hour sum, whether or not it was flagged out-of-range. Flagging is a
 *     geofence warning for the office to eyeball, not grounds to exclude
 *     hours worked.
 *   - Flagged closed shifts are additionally counted in flaggedShiftCount.
 *   - An "open" shift (clockOutAt still null — the coach never clocked
 *     out) is EXCLUDED from the hour sum (we don't know its duration) but
 *     is counted in openShiftCount so the payroll office can chase it down
 *     before running payroll.
 */

export interface HourlyShiftInput {
  userId: string;
  role: string;
  clockInAt: Date;
  clockOutAt: Date | null;
  flaggedOutOfRange: boolean;
}

export interface AggregatedLaborRow {
  userId: string;
  role: string;
  totalHours: number;
  closedShiftCount: number;
  flaggedShiftCount: number;
  openShiftCount: number;
}

const MS_PER_HOUR = 1000 * 60 * 60;

export function aggregateHourlyLabor(
  shifts: readonly HourlyShiftInput[],
): AggregatedLaborRow[] {
  const byKey = new Map<string, AggregatedLaborRow>();

  for (const shift of shifts) {
    const key = `${shift.userId}::${shift.role}`;
    let row = byKey.get(key);
    if (!row) {
      row = {
        userId: shift.userId,
        role: shift.role,
        totalHours: 0,
        closedShiftCount: 0,
        flaggedShiftCount: 0,
        openShiftCount: 0,
      };
      byKey.set(key, row);
    }

    if (shift.clockOutAt === null) {
      row.openShiftCount += 1;
      continue;
    }

    const durationMs = shift.clockOutAt.getTime() - shift.clockInAt.getTime();
    row.totalHours += durationMs / MS_PER_HOUR;
    row.closedShiftCount += 1;
    if (shift.flaggedOutOfRange) {
      row.flaggedShiftCount += 1;
    }
  }

  // Round to 2 decimal places (payroll-friendly precision) after summing
  // in full precision — rounding per-shift first would compound error.
  const rows = Array.from(byKey.values()).map((row) => ({
    ...row,
    totalHours: Math.round(row.totalHours * 100) / 100,
  }));

  // Deterministic order for CSV output: role, then userId.
  rows.sort((a, b) => {
    if (a.role !== b.role) return a.role < b.role ? -1 : 1;
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  return rows;
}

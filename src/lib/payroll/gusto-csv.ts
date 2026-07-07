import { toCsvRow } from "@/lib/csv/to-csv-row";
import type { AggregatedLaborRow } from "./aggregate-hours";

/**
 * Hourly W-2 labor CSV — one row per (employee, role) for the pay period.
 * No hourly rate column: Gusto's Smart Import multiplies these hours by
 * the rate it already holds per employee (see owner decision #1 in the
 * plan). Header-only output (no data rows) on an empty period — never
 * fail the download just because nobody clocked hours that week.
 */
export const HOURS_CSV_HEADER = [
  "employee_first_name",
  "employee_last_name",
  "employee_email",
  "role",
  "hours",
  "flagged_shift_count",
  "open_shift_count",
] as const;

export interface HourlyLaborCsvRow extends AggregatedLaborRow {
  firstName: string | null;
  lastName: string | null;
  email: string;
}

export function buildGustoHoursCsv(rows: readonly HourlyLaborCsvRow[]): string {
  const lines = [
    toCsvRow([...HOURS_CSV_HEADER]),
    ...rows.map((r) =>
      toCsvRow([
        r.firstName,
        r.lastName,
        r.email,
        r.role,
        r.totalHours,
        r.flaggedShiftCount,
        r.openShiftCount,
      ]),
    ),
  ];
  return lines.join("\n") + "\n";
}

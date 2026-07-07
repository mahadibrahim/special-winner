import { toCsvRow } from "@/lib/csv/to-csv-row";

/**
 * Per-match 1099 referee stipend CSV — one row per game_officials
 * assignment. `feeCents` is a stored dollar fee (not hours), so this is a
 * separate CSV flavor/import surface from the hourly W-2 sheet.
 *
 * The matchup column uses the REAL home/away team names — `games` has
 * homeTeamId/awayTeamId FKs into `teams`, which has a `name` column, so
 * the join is clean (unlike the plan draft's "Game <date>" placeholder).
 * Either side can be null for a TBD fixture (see `games_distinct_teams`
 * check — null ids are allowed); those render as "TBD".
 */
export const REFEREE_CSV_HEADER = [
  "referee_first_name",
  "referee_last_name",
  "referee_email",
  "game_date",
  "matchup",
  "fee_dollars",
  "payment_status",
] as const;

export interface RefereeFeeCsvRow {
  firstName: string | null;
  lastName: string | null;
  email: string;
  scheduledAt: Date;
  homeTeamName: string | null;
  awayTeamName: string | null;
  feeCents: number;
  paymentStatus: string;
}

export function formatMatchup(
  homeTeamName: string | null,
  awayTeamName: string | null,
): string {
  return `${homeTeamName ?? "TBD"} vs ${awayTeamName ?? "TBD"}`;
}

export function formatFeeDollars(feeCents: number): string {
  return (feeCents / 100).toFixed(2);
}

export function buildGustoRefereeCsv(rows: readonly RefereeFeeCsvRow[]): string {
  const lines = [
    toCsvRow([...REFEREE_CSV_HEADER]),
    ...rows.map((r) =>
      toCsvRow([
        r.firstName,
        r.lastName,
        r.email,
        r.scheduledAt,
        formatMatchup(r.homeTeamName, r.awayTeamName),
        formatFeeDollars(r.feeCents),
        r.paymentStatus,
      ]),
    ),
  ];
  return lines.join("\n") + "\n";
}

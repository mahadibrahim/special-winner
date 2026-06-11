import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

/**
 * TO_CHAR period-bucket expression for the admin report endpoints'
 * `groupBy` query param (day | week | month).
 *
 * SECURITY: the format string is interpolated with sql.raw, so it MUST
 * come from this closed map — never from request input. A bound
 * parameter would be preferable, but the same expression appears in
 * SELECT and GROUP BY, and Postgres only matches them when they are
 * structurally identical — two separate bind placeholders ($1/$2) are
 * not. Reuse the returned SQL object for SELECT, GROUP BY and ORDER BY.
 */
const DATE_FORMATS = {
  day: "YYYY-MM-DD",
  week: "IYYY-IW",
  month: "YYYY-MM",
} as const;

export function periodBucket(column: AnyColumn, groupBy: string): SQL<string> {
  const format =
    DATE_FORMATS[groupBy as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.month;
  return sql<string>`TO_CHAR(${column}, ${sql.raw(`'${format}'`)})`;
}

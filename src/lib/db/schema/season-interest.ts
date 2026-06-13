import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { seasons } from "./programs";

/**
 * Per-division interest capture for `forming` seasons. A person may be
 * interested in many divisions, so this is keyed by (season, email) — unlike
 * `newsletter_signups`, which is unique on email alone and therefore cannot
 * hold per-division interest. Free, email-only (no deposit); the deposit is a
 * registration-time feature. See the forming/interest-list design spec.
 */
export const seasonInterest = pgTable(
  "season_interest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("first_name", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("season_interest_season_idx").on(table.seasonId),
    uniqueIndex("season_interest_season_email_uniq").on(
      table.seasonId,
      sql`lower(${table.email})`,
    ),
  ],
);

export type SeasonInterest = typeof seasonInterest.$inferSelect;
export type NewSeasonInterest = typeof seasonInterest.$inferInsert;

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { seasons } from "./programs";

/**
 * A captain who reached the team deposit form and got a PaymentIntent minted
 * (POST /api/public/team-registrations/prepare) but hasn't paid. The deferred
 * team flow deliberately creates no user/team row until the deposit succeeds,
 * so without this record an abandoned captain leaves no trace to remind.
 *
 * One row per (season, captainEmail) — retries update the row rather than
 * stacking. `createdAt` anchors the reminder-touch windows (first attempt);
 * `updatedAt` moves on each retry. Completion is derived, not stored: a
 * team_registrations row for the same season+captainEmail (or a paid
 * registration by that email in the season) means they converted.
 */
export const teamReservationAttempts = pgTable(
  "team_reservation_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    captainEmail: varchar("captain_email", { length: 320 }).notNull(),
    captainName: varchar("captain_name", { length: 200 }).notNull(),
    teamName: varchar("team_name", { length: 200 }).notNull(),
    brand: varchar("brand", { length: 20 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("team_reservation_attempts_season_email_uniq").on(
      t.seasonId,
      t.captainEmail,
    ),
  ],
);

export type TeamReservationAttempt = typeof teamReservationAttempts.$inferSelect;
export type NewTeamReservationAttempt = typeof teamReservationAttempts.$inferInsert;

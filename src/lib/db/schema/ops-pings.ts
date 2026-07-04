import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const opsPingKindEnum = pgEnum("ops_ping_kind", [
  "registration_paid",
  "dropin_booked",
  "rental_confirmed",
  "membership_started",
  "payment_succeeded",
  "user_signup",
  "job_application",
  "test",
]);

export const opsPingChannelEnum = pgEnum("ops_ping_channel", [
  "whatsapp",
  "email",
  "suppressed",
]);

/**
 * One row per operational ping attempt. Insert-first-send-after: the row is
 * the dedupe key (webhook retries hit the unique index), the rate-cap window
 * source, and the digest's recap material.
 */
export const opsPings = pgTable(
  "ops_pings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: opsPingKindEnum("kind").notNull(),
    /** Natural id of the event (Stripe event id, booking id, user id). */
    eventId: varchar("event_id", { length: 255 }).notNull(),
    brand: varchar("brand", { length: 20 }).default("aspire").notNull(),
    message: text("message").notNull(),
    channel: opsPingChannelEnum("channel").notNull().default("suppressed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ops_pings_kind_event_uniq").on(table.kind, table.eventId),
    // Rate-cap window + digest queries.
    index("ops_pings_org_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export type OpsPing = typeof opsPings.$inferSelect;
export type NewOpsPing = typeof opsPings.$inferInsert;
export type OpsPingKind = (typeof opsPingKindEnum.enumValues)[number];
export type OpsPingChannel = (typeof opsPingChannelEnum.enumValues)[number];

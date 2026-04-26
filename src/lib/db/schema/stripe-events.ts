import {
  pgTable,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * stripe_events
 *
 * Webhook idempotency ledger. We insert one row per Stripe event id we
 * successfully process; subsequent webhook retries for the same event id
 * are short-circuited via a unique-constraint conflict.
 *
 * Insert pattern: `insert ... on conflict (event_id) do nothing returning id`.
 * If `returning id` is empty, the event was already processed — skip.
 */
export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").unique().notNull(),
    eventType: text("event_type").notNull(),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (table) => [
    index("stripe_events_event_type_idx").on(table.eventType),
  ],
);

export type StripeEvent = typeof stripeEvents.$inferSelect;
export type NewStripeEvent = typeof stripeEvents.$inferInsert;

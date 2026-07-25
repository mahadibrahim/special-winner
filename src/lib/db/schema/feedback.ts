import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { games, gameOfficials } from "./teams";

// === enums ===

export const feedbackRequestKindEnum = pgEnum("feedback_request_kind", [
  "nps_drop_in",
  "nps_field_rental",
  "nps_season",
  "referee_rating",
]);

export const feedbackRequestStatusEnum = pgEnum("feedback_request_status", [
  "pending",
  "sent",
  "responded",
  "expired",
]);

/**
 * Context captured at dispatch time so the public page, emails, and alerts
 * never need polymorphic joins back to the source booking/game.
 */
export interface FeedbackRequestMetadata {
  /** Human label for the experience, e.g. "Pickup Soccer — Mon, Jun 29". */
  eventLabel: string;
  /** referee_rating only — derived from the game's program type. */
  gameType?: "league" | "tournament";
  /** referee_rating only — display name shown on the rating form. */
  refereeName?: string;
  /**
   * Venue the experience happened at (NPS kinds; stamped by dispatch).
   * Lets the review funnel resolve per-venue Google review URLs at score
   * time without a polymorphic join back to the booking.
   */
  venueId?: string;
  /** nps_drop_in only — the session's community host, when one was assigned. */
  hostUserId?: string;
  /** nps_drop_in only — display name shown on the rating form. */
  hostName?: string;
}

// === tables ===

/**
 * The spine of the post-event feedback engine. One row = one ask sent to one
 * person about one event. `targetId` is polymorphic by kind (same pattern as
 * self_service_tokens): dropInBookings.id | fieldRentals.id | registrations.id
 * | games.id. Token follows the magic_links hashing pattern — only the SHA-256
 * hash is stored; plaintext exists once at dispatch time inside the outbound
 * message.
 */
export const feedbackRequests = pgTable(
  "feedback_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    brand: varchar("brand", { length: 20 }).default("aspire").notNull(),
    kind: feedbackRequestKindEnum("kind").notNull(),
    targetId: uuid("target_id").notNull(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // referee_rating only: which official is being rated.
    gameOfficialId: uuid("game_official_id").references(() => gameOfficials.id, {
      onDelete: "cascade",
    }),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    status: feedbackRequestStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<FeedbackRequestMetadata>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Dedupe: the cron can never double-create for the same event/recipient.
    // Two partial uniques because gameOfficialId is null for all NPS kinds.
    uniqueIndex("feedback_requests_dedupe_nps_uniq")
      .on(table.kind, table.targetId, table.recipientUserId)
      .where(sql`game_official_id IS NULL`),
    uniqueIndex("feedback_requests_dedupe_ref_uniq")
      .on(table.kind, table.targetId, table.recipientUserId, table.gameOfficialId)
      .where(sql`game_official_id IS NOT NULL`),
    // Cooldown / daily-cap lookups.
    index("feedback_requests_recipient_kind_sent_idx").on(
      table.recipientUserId,
      table.kind,
      table.sentAt,
    ),
    // Dashboard queries.
    index("feedback_requests_org_kind_created_idx").on(
      table.organizationId,
      table.kind,
      table.createdAt,
    ),
    // Pending-resend sweep + expiry.
    index("feedback_requests_status_expires_idx").on(table.status, table.expiresAt),
  ],
);

export const npsResponses = pgTable(
  "nps_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .unique()
      .references(() => feedbackRequests.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    comment: text("comment"),
    reviewLinkClickedAt: timestamp("review_link_clicked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("nps_responses_score_range", sql`${table.score} >= 0 AND ${table.score} <= 10`),
  ],
);

/**
 * Referee ratings. gameId + refereeUserId are denormalized from the request's
 * targetId / gameOfficial so the admin dashboard aggregates without joining
 * through feedback_requests. The rater's identity lives ONLY on the request
 * row — no read surface may join it back to a rating.
 */
export const refereeRatings = pgTable(
  "referee_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .unique()
      .references(() => feedbackRequests.id, { onDelete: "cascade" }),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    refereeUserId: uuid("referee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    overall: integer("overall").notNull(),
    gameControl: integer("game_control").notNull(),
    communication: integer("communication").notNull(),
    fairness: integer("fairness").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("referee_ratings_referee_created_idx").on(
      table.refereeUserId,
      table.createdAt,
    ),
    index("referee_ratings_game_idx").on(table.gameId),
    check(
      "referee_ratings_dimension_range",
      sql`${table.overall} BETWEEN 1 AND 5 AND ${table.gameControl} BETWEEN 1 AND 5 AND ${table.communication} BETWEEN 1 AND 5 AND ${table.fairness} BETWEEN 1 AND 5`,
    ),
  ],
);

// Type exports
export type FeedbackRequest = typeof feedbackRequests.$inferSelect;
export type NewFeedbackRequest = typeof feedbackRequests.$inferInsert;
export type NpsResponse = typeof npsResponses.$inferSelect;
export type NewNpsResponse = typeof npsResponses.$inferInsert;
export type RefereeRating = typeof refereeRatings.$inferSelect;
export type NewRefereeRating = typeof refereeRatings.$inferInsert;
export type FeedbackRequestKind = (typeof feedbackRequestKindEnum.enumValues)[number];
export type FeedbackRequestStatus =
  (typeof feedbackRequestStatusEnum.enumValues)[number];

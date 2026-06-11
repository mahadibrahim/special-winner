/**
 * Field-time ledger — the inventory model for field time.
 *
 * Spec: docs/superpowers/specs/2026-06-11-field-time-ledger-design.md
 *
 * venue_resources: the sellable units (fields), with parent/child support
 * for configurations (full field ⊃ halves). Full fields only are seeded
 * today; the hierarchy exists so the first split is a row insert, not a
 * schema change.
 *
 * resource_blocks: every claim on field time — games, drop-in sessions,
 * rentals, external partner bookings (Good Rec / email), maintenance —
 * one row each. A GiST exclusion constraint (added in the migration;
 * drizzle can't express EXCLUDE) makes same-resource overlaps impossible
 * at the database level. Parent/child conflicts are enforced by the
 * scheduling library (src/lib/scheduling/blocks.ts) under an advisory
 * lock.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { venues } from "./teams";
import { users } from "./users";

export const blockSourceEnum = pgEnum("block_source", [
  "game",
  "drop_in",
  "rental",
  "external",
  "maintenance",
  // Reserved: session plans carry no venue/field today. Becomes a real
  // writer if practices ever reserve field time.
  "practice",
]);

export const venueResources = pgTable(
  "venue_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venues.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    // Legacy bridge — matches games.fieldNumber (varchar, cast) and
    // field_rentals.fieldNumber (int) during the transition.
    fieldNumber: integer("field_number").notNull(),
    parentResourceId: uuid("parent_resource_id").references(
      (): AnyPgColumn => venueResources.id,
      { onDelete: "cascade" },
    ),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One top-level resource per (venue, field number); sub-field rows
    // (halves etc.) are exempt — they carry the parent's field number.
    uniqueIndex("venue_resources_venue_field_uniq")
      .on(table.venueId, table.fieldNumber)
      .where(sql`${table.parentResourceId} IS NULL`),
    index("venue_resources_venue_idx").on(table.venueId),
  ],
);

export const resourceBlocks = pgTable(
  "resource_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => venueResources.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    sourceType: blockSourceEnum("source_type").notNull(),
    // FK-less pointer to the source row (game/session/rental id).
    // Null for external + maintenance holds — they ARE the source.
    sourceId: uuid("source_id"),
    // What calendars render: "U10 vs Thunder", "Good Rec — Smith party".
    label: varchar("label", { length: 200 }).notNull(),
    notes: text("notes"),
    // Mirrors rental hold expiry. The scheduling library treats expired
    // hold-blocks as free (and deletes them) so an abandoned checkout
    // can't squat on a slot longer than its hold.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("resource_blocks_resource_starts_idx").on(table.resourceId, table.startsAt),
    index("resource_blocks_starts_idx").on(table.startsAt),
    // One block per source row — sync functions upsert against this.
    uniqueIndex("resource_blocks_source_uniq")
      .on(table.sourceType, table.sourceId)
      .where(sql`${table.sourceId} IS NOT NULL`),
    check("resource_blocks_valid_range", sql`${table.endsAt} > ${table.startsAt}`),
    // NOTE: the no-overlap EXCLUDE constraint lives in the migration —
    // drizzle has no EXCLUDE support:
    //   EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  ],
);

export type VenueResource = typeof venueResources.$inferSelect;
export type NewVenueResource = typeof venueResources.$inferInsert;
export type ResourceBlock = typeof resourceBlocks.$inferSelect;
export type NewResourceBlock = typeof resourceBlocks.$inferInsert;
export type BlockSource = (typeof blockSourceEnum.enumValues)[number];

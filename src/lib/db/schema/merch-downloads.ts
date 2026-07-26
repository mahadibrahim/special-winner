import {
  pgTable, uuid, varchar, integer, timestamp, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { merchOrderItems } from "./merch-orders";

/**
 * A time-limited download grant issued for a digital-goods order line
 * (merch Phase 3e). One row per grant; `token` is the opaque value handed
 * to the buyer in the delivery email / download link. Cascades with its
 * order item — grants have no independent lifecycle once the line is gone.
 */
export const merchDownloadGrants = pgTable(
  "merch_download_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => merchOrderItems.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull(),
    // snapshot — survives later catalog edits to the source product
    assetKey: varchar("asset_key", { length: 500 }).notNull(),
    assetName: varchar("asset_name", { length: 255 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    downloadCount: integer("download_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqToken: unique("uq_merch_download_grants_token").on(t.token),
    orderItemIdx: index("idx_merch_download_grants_order_item").on(t.orderItemId),
  }),
);

export const merchDownloadGrantsRelations = relations(merchDownloadGrants, ({ one }) => ({
  orderItem: one(merchOrderItems, {
    fields: [merchDownloadGrants.orderItemId],
    references: [merchOrderItems.id],
  }),
}));

export type MerchDownloadGrant = typeof merchDownloadGrants.$inferSelect;
export type NewMerchDownloadGrant = typeof merchDownloadGrants.$inferInsert;

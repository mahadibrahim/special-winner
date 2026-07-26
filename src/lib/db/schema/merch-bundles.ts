import {
  pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { merchStores } from "./merch-stores";
import { merchProducts, type MerchImage } from "./merch";
import { merchFulfillmentTypeEnum } from "./merch-orders";

export const merchBundleDiscountTypeEnum = pgEnum("merch_bundle_discount_type", [
  "percent",
  "fixed",
]);

/**
 * A curated multi-product bundle sold at a discount off the sum of its parts.
 * Store-scoped like merchProducts; fulfillmentType is bundle-level (all items
 * in a bundle ship together under one fulfillment path).
 */
export const merchBundles = pgTable(
  "merch_bundles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull().references(() => merchStores.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    images: jsonb("images").$type<MerchImage[]>(),
    discountType: merchBundleDiscountTypeEnum("discount_type").notNull(),
    discountValue: integer("discount_value").notNull(),
    fulfillmentType: merchFulfillmentTypeEnum("fulfillment_type").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSlug: unique("uq_merch_bundles_store_slug").on(t.storeId, t.slug),
    storeActiveIdx: index("idx_merch_bundles_store_active").on(t.storeId, t.active),
  }),
);

export const merchBundleItems = pgTable(
  "merch_bundle_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bundleId: uuid("bundle_id")
      .notNull()
      .references(() => merchBundles.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => merchProducts.id, { onDelete: "restrict" }),
    label: varchar("label", { length: 255 }),
    quantity: integer("quantity").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => ({
    bundleIdx: index("idx_merch_bundle_items_bundle").on(t.bundleId),
  }),
);

export const merchBundlesRelations = relations(merchBundles, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [merchBundles.organizationId],
    references: [organizations.id],
  }),
  store: one(merchStores, {
    fields: [merchBundles.storeId],
    references: [merchStores.id],
  }),
  items: many(merchBundleItems),
}));

export const merchBundleItemsRelations = relations(merchBundleItems, ({ one }) => ({
  bundle: one(merchBundles, {
    fields: [merchBundleItems.bundleId],
    references: [merchBundles.id],
  }),
  product: one(merchProducts, {
    fields: [merchBundleItems.productId],
    references: [merchProducts.id],
  }),
}));

export type MerchBundle = typeof merchBundles.$inferSelect;
export type NewMerchBundle = typeof merchBundles.$inferInsert;
export type MerchBundleItem = typeof merchBundleItems.$inferSelect;
export type NewMerchBundleItem = typeof merchBundleItems.$inferInsert;

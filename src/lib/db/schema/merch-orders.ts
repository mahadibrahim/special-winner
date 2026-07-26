import {
  pgTable, uuid, varchar, integer, jsonb, timestamp, pgEnum, index, unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { users } from "./users";
import { merchVariants } from "./merch";
import { merchStores, type OrderItemPersonalization } from "./merch-stores";

export const merchFulfillmentTypeEnum = pgEnum("merch_fulfillment_type", [
  "printful_pod",
  "self_shipped",
  "pickup",
  "digital",
  "lulu_pod",
]);

export const merchOrderStatusEnum = pgEnum("merch_order_status", [
  "pending",
  "paid",
  "submitted",
  "shipped",
  "cancelled",
  "failed",
  "awaiting_pickup",
  "collected",
  "delivered",
]);

export interface MerchShippingAddress {
  name: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string; // 2-letter for US
  zip: string;
  country: string; // ISO-2, e.g. "US"
}

export const merchOrders = pgTable(
  "merch_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull().references(() => merchStores.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    email: varchar("email", { length: 255 }).notNull(),
    status: merchOrderStatusEnum("status").notNull().default("pending"),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    printfulOrderId: varchar("printful_order_id", { length: 64 }),
    // Lulu POD (merch Lulu phase). luluPrintJobId doubles as the submission
    // idempotency guard and the status-poll key; luluShippingLevel is the
    // buyer-picked level, needed at print-job submission time.
    luluPrintJobId: varchar("lulu_print_job_id", { length: 64 }),
    luluShippingLevel: varchar("lulu_shipping_level", { length: 20 }),
    shippingAddress: jsonb("shipping_address").$type<MerchShippingAddress>().notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("usd"),
    shippingCarrier: varchar("shipping_carrier", { length: 60 }),
    shippingService: varchar("shipping_service", { length: 120 }),
    trackingNumber: varchar("tracking_number", { length: 120 }),
    trackingUrl: varchar("tracking_url", { length: 500 }),
    shippedAt: timestamp("shipped_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSession: unique("uq_merch_orders_session").on(t.stripeCheckoutSessionId),
    uniqPi: unique("uq_merch_orders_pi").on(t.stripePaymentIntentId),
    orgStatusIdx: index("idx_merch_orders_org_status").on(t.organizationId, t.status),
  }),
);

export const merchOrderItems = pgTable(
  "merch_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => merchOrders.id, { onDelete: "cascade" }),
    merchVariantId: uuid("merch_variant_id")
      .notNull()
      .references(() => merchVariants.id, { onDelete: "restrict" }),
    fulfillmentType: merchFulfillmentTypeEnum("fulfillment_type")
      .notNull()
      .default("printful_pod"),
    // snapshot — survives later catalog edits
    productName: varchar("product_name", { length: 255 }).notNull(),
    variantName: varchar("variant_name", { length: 255 }).notNull(),
    size: varchar("size", { length: 40 }),
    color: varchar("color", { length: 60 }),
    printfulSyncVariantId: varchar("printful_sync_variant_id", { length: 64 }), // nullable: manual/pickup lines have none
    personalization: jsonb("personalization").$type<OrderItemPersonalization>(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    // Bundle attribution snapshot (merch Phase 3d). Nullable, no FK: bundles
    // can be edited/removed after purchase without touching historical order
    // lines — bundleName preserves what the buyer saw at checkout.
    bundleId: uuid("bundle_id"),
    bundleName: varchar("bundle_name", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("idx_merch_order_items_order").on(t.orderId),
  }),
);

export const merchOrdersRelations = relations(merchOrders, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [merchOrders.organizationId],
    references: [organizations.id],
  }),
  store: one(merchStores, {
    fields: [merchOrders.storeId],
    references: [merchStores.id],
  }),
  items: many(merchOrderItems),
}));

export const merchOrderItemsRelations = relations(merchOrderItems, ({ one }) => ({
  order: one(merchOrders, {
    fields: [merchOrderItems.orderId],
    references: [merchOrders.id],
  }),
  variant: one(merchVariants, {
    fields: [merchOrderItems.merchVariantId],
    references: [merchVariants.id],
  }),
}));

export type MerchOrder = typeof merchOrders.$inferSelect;
export type NewMerchOrder = typeof merchOrders.$inferInsert;
export type MerchOrderItem = typeof merchOrderItems.$inferSelect;
export type NewMerchOrderItem = typeof merchOrderItems.$inferInsert;

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { productCategoryEnum } from "./products";

export interface MerchImage {
  url: string;
  alt?: string;
}

/**
 * Printful-backed merch catalog. Products are designed in Printful and synced
 * in via the store API; `printful_sync_product_id` is the join key back to
 * Printful. Org-scoped so team-specific stores can be added later without a
 * schema change. Reuses `product_category` enum from products.ts.
 */
export const merchProducts = pgTable(
  "merch_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    printfulSyncProductId: varchar("printful_sync_product_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    category: productCategoryEnum("category").notNull().default("other"),
    // mockup image URLs served by Printful's CDN; null == none yet
    images: jsonb("images").$type<MerchImage[]>(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    syncedAt: timestamp("synced_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSyncProduct: unique("uq_merch_products_org_sync").on(
      t.organizationId,
      t.printfulSyncProductId,
    ),
    uniqSlug: unique("uq_merch_products_org_slug").on(t.organizationId, t.slug),
    orgActiveIdx: index("idx_merch_products_org_active").on(t.organizationId, t.active),
  }),
);

export const merchVariants = pgTable(
  "merch_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => merchProducts.id, { onDelete: "cascade" }),
    printfulSyncVariantId: varchar("printful_sync_variant_id", { length: 64 }).notNull(),
    // Printful catalog variant id — the id Phase 2 passes to shipping-rate and
    // order-create calls. Distinct from the sync-variant id above.
    printfulVariantId: integer("printful_variant_id").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    size: varchar("size", { length: 40 }),
    color: varchar("color", { length: 60 }),
    sku: varchar("sku", { length: 100 }),
    retailPriceCents: integer("retail_price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSyncVariant: unique("uq_merch_variants_sync").on(t.printfulSyncVariantId),
    productActiveIdx: index("idx_merch_variants_product_active").on(t.productId, t.active),
  }),
);

export const merchProductsRelations = relations(merchProducts, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [merchProducts.organizationId],
    references: [organizations.id],
  }),
  variants: many(merchVariants),
}));

export const merchVariantsRelations = relations(merchVariants, ({ one }) => ({
  product: one(merchProducts, {
    fields: [merchVariants.productId],
    references: [merchProducts.id],
  }),
}));

export type MerchProduct = typeof merchProducts.$inferSelect;
export type NewMerchProduct = typeof merchProducts.$inferInsert;
export type MerchVariant = typeof merchVariants.$inferSelect;
export type NewMerchVariant = typeof merchVariants.$inferInsert;

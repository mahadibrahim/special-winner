import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";

export const productCategoryEnum = pgEnum("product_category", [
  "jersey",
  "shorts",
  "socks",
  "hoodie",
  "t_shirt",
  "hat",
  "bag",
  "accessory",
  "other",
]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    category: productCategoryEnum("category").notNull(),
    basePriceCents: integer("base_price_cents").notNull(),
    images: jsonb("images").$type<ProductImage[]>(),
    availablePostRegistration: boolean("available_post_registration")
      .default(true)
      .notNull(),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueOrgSlug: unique().on(table.organizationId, table.slug),
    orgActiveIdx: index("idx_products_org_active").on(
      table.organizationId,
      table.active,
    ),
  }),
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 100 }),
    size: varchar("size", { length: 20 }).notNull(),
    color: varchar("color", { length: 40 }),
    priceOverrideCents: integer("price_override_cents"),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueVariant: unique().on(table.productId, table.size, table.color),
    productActiveIdx: index("idx_product_variants_product_active").on(
      table.productId,
      table.active,
    ),
  }),
);

export interface ProductImage {
  url: string;
  alt?: string;
  sortOrder?: number;
}

export const productsRelations = relations(products, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [products.organizationId],
    references: [organizations.id],
  }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;

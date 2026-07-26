import {
  pgTable, uuid, varchar, text, timestamp, boolean, integer, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { teams } from "./teams";

export const merchStoreScopeEnum = pgEnum("merch_store_scope", ["general", "league", "team"]);
export const merchStoreVisibilityEnum = pgEnum("merch_store_visibility", ["public", "unlisted"]);
// Re-homed from the retired merch_team_kits module (outlives the kit table).
export const merchProductSourceEnum = pgEnum("merch_product_source", ["printful", "manual"]);

/** Product-level config: which personalization fields to collect at checkout. */
export interface ProductPersonalization { name?: boolean; number?: boolean }
/** Order-item snapshot: the personalization *values* the line was ordered with. */
export interface OrderItemPersonalization { name?: string; number?: string }

/**
 * A first-class storefront scoped to the whole org (general), a league (seam
 * only in 3b), or a team. Absorbs the former merch_team_kits: a team store
 * carries the order window, unlisted share token, and pickup location.
 */
export const merchStores = pgTable(
  "merch_stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    scope: merchStoreScopeEnum("scope").notNull(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    visibility: merchStoreVisibilityEnum("visibility").notNull().default("public"),
    shareToken: varchar("share_token", { length: 40 }),
    orderOpensAt: timestamp("order_opens_at"),
    orderClosesAt: timestamp("order_closes_at"),
    pickupLocation: text("pickup_location"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqSlug: unique("uq_merch_stores_org_slug").on(t.organizationId, t.slug),
    uniqToken: unique("uq_merch_stores_token").on(t.shareToken),
    orgScopeIdx: index("idx_merch_stores_org_scope").on(t.organizationId, t.scope),
  }),
);

export const merchStoresRelations = relations(merchStores, ({ one }) => ({
  organization: one(organizations, { fields: [merchStores.organizationId], references: [organizations.id] }),
  team: one(teams, { fields: [merchStores.teamId], references: [teams.id] }),
}));

export type MerchStore = typeof merchStores.$inferSelect;
export type NewMerchStore = typeof merchStores.$inferInsert;

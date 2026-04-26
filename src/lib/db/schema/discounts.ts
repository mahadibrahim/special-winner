import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { seasons } from "./programs";

// Enums
export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed_amount",
]);

// Discount Codes table
export const discountCodes = pgTable(
  "discount_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(),
    description: text("description"),
    discountType: discountTypeEnum("discount_type").default("percentage").notNull(),
    discountValue: integer("discount_value").notNull(), // Cents for fixed, percentage * 100 for percentage
    minPurchaseCents: integer("min_purchase_cents"), // Minimum purchase amount to apply
    maxDiscountCents: integer("max_discount_cents"), // Maximum discount amount (for percentage)
    maxUses: integer("max_uses"), // Total uses allowed (null = unlimited)
    usedCount: integer("used_count").default(0).notNull(),
    maxUsesPerUser: integer("max_uses_per_user").default(1),
    seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "set null" }), // Restrict to specific season
    active: boolean("active").default(true).notNull(),
    startsAt: timestamp("starts_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("discount_codes_org_code_unique").on(
      table.organizationId,
      table.code,
    ),
  ],
);

// Discount usage tracking
export const discountUsages = pgTable(
  "discount_usages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discountCodeId: uuid("discount_code_id")
      .notNull()
      .references(() => discountCodes.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    registrationId: uuid("registration_id"),
    discountAmountCents: integer("discount_amount_cents").notNull(),
    usedAt: timestamp("used_at").defaultNow().notNull(),
  },
  (table) => [
    index("discount_usages_discount_code_idx").on(table.discountCodeId),
    index("discount_usages_user_idx").on(table.userId),
    index("discount_usages_registration_idx").on(table.registrationId),
  ],
);

// Relations
export const discountCodesRelations = relations(discountCodes, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [discountCodes.organizationId],
    references: [organizations.id],
  }),
  season: one(seasons, {
    fields: [discountCodes.seasonId],
    references: [seasons.id],
  }),
  usages: many(discountUsages),
}));

export const discountUsagesRelations = relations(discountUsages, ({ one }) => ({
  discountCode: one(discountCodes, {
    fields: [discountUsages.discountCodeId],
    references: [discountCodes.id],
  }),
}));

// Type exports
export type DiscountCode = typeof discountCodes.$inferSelect;
export type NewDiscountCode = typeof discountCodes.$inferInsert;
export type DiscountUsage = typeof discountUsages.$inferSelect;
export type NewDiscountUsage = typeof discountUsages.$inferInsert;

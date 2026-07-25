import {
  pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { teams } from "./teams";

export const merchProductSourceEnum = pgEnum("merch_product_source", [
  "printful",
  "manual",
]);

/** Optional per-line personalization a manual product collects at checkout. */
export interface ProductPersonalization {
  name?: boolean;
  number?: boolean;
}

/**
 * A team's kit "campaign": owns the order window, the shareable link, and the
 * pickup location. Manual merch products belong to a kit via `kit_id`.
 */
export const merchTeamKits = pgTable(
  "merch_team_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    shareToken: varchar("share_token", { length: 40 }).notNull(),
    orderOpensAt: timestamp("order_opens_at"),
    orderClosesAt: timestamp("order_closes_at"),
    pickupLocation: text("pickup_location"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqToken: unique("uq_merch_team_kits_token").on(t.shareToken),
    orgIdx: index("idx_merch_team_kits_org").on(t.organizationId),
  }),
);

export const merchTeamKitsRelations = relations(merchTeamKits, ({ one }) => ({
  organization: one(organizations, {
    fields: [merchTeamKits.organizationId],
    references: [organizations.id],
  }),
  team: one(teams, { fields: [merchTeamKits.teamId], references: [teams.id] }),
}));

export type MerchTeamKit = typeof merchTeamKits.$inferSelect;
export type NewMerchTeamKit = typeof merchTeamKits.$inferInsert;

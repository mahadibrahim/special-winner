import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { products } from "./products";
import { programs, seasons } from "./programs";

export const programGear = pgTable(
  "program_gear",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "cascade",
    }),
    seasonId: uuid("season_id").references(() => seasons.id, {
      onDelete: "cascade",
    }),
    required: boolean("required").default(false).notNull(),
    priceCents: integer("price_cents"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    exactlyOneTarget: check(
      "program_gear_exactly_one_target",
      sql`(program_id IS NOT NULL)::int + (season_id IS NOT NULL)::int = 1`,
    ),
    programIdx: index("idx_program_gear_program").on(table.programId),
    seasonIdx: index("idx_program_gear_season").on(table.seasonId),
    productIdx: index("idx_program_gear_product").on(table.productId),
  }),
);

export const programGearRelations = relations(programGear, ({ one }) => ({
  product: one(products, {
    fields: [programGear.productId],
    references: [products.id],
  }),
  program: one(programs, {
    fields: [programGear.programId],
    references: [programs.id],
  }),
  season: one(seasons, {
    fields: [programGear.seasonId],
    references: [seasons.id],
  }),
}));

export type ProgramGear = typeof programGear.$inferSelect;
export type NewProgramGear = typeof programGear.$inferInsert;

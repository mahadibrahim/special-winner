import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const futsalInterest = pgTable(
  "futsal_interest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    emailCanonical: text("email_canonical").notNull().unique(),
    source: text("source").notNull().default("rent_page"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("futsal_interest_created_idx").on(t.createdAt)],
);

export type FutsalInterest = typeof futsalInterest.$inferSelect;

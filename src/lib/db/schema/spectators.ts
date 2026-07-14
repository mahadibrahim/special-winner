import { index, pgTable, text, timestamp, uuid, varchar, boolean } from "drizzle-orm/pg-core";
import { organizations, locations } from "./organizations";
import { users } from "./users";

/**
 * A liability waiver for someone ENTERING the facility, not playing in it.
 *
 * Deliberately NOT a booking: a spectator has no session, no capacity, no
 * payment, no self-serve token. Threading "no booking" special-cases through
 * the money-handling code would be the wrong trade.
 *
 * userId is nullable ON PURPOSE. Signing a waiver makes you a signature.
 * Ticking a marketing opt-in makes you a user. Someone who signs and walks in
 * without opting in never gets an account they did not ask for.
 */
export const spectatorWaivers = pgTable(
  "spectator_waivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),

    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    email: varchar("email", { length: 255 }),

    // A minor spectator (a sibling brought along to watch) is signed for by a
    // guardian — the same rule as a minor player. The child is named on the
    // document; the guardian signs it.
    isMinor: boolean("is_minor").notNull().default(false),
    guardianName: varchar("guardian_name", { length: 200 }),

    signedName: varchar("signed_name", { length: 200 }).notNull(),
    // The waiver text is brand-derived and will be revised. Store what they
    // actually signed — a document edited in August must not retroactively
    // change what someone agreed to in July.
    waiverTextShown: text("waiver_text_shown").notNull(),
    signedAt: timestamp("signed_at").notNull().defaultNow(),
    validUntil: timestamp("valid_until").notNull(),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    lookupIdx: index("idx_spectator_waivers_org_phone").on(t.organizationId, t.phone),
  }),
);

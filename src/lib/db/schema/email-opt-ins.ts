import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations } from "./organizations";

/**
 * Per-email, per-org marketing consent with its evidence — the email twin of
 * `phone_opt_ins`.
 *
 * Why it exists: consent needs EVIDENCE, and evidence must be written at
 * CAPTURE time, not at delivery time. Before this table, an email tick left no
 * trace anywhere — `recordMarketingConsent` deliberately writes nothing to
 * `users` for a pending (unauthenticated) email tick, because clearing
 * `users.marketing_opted_out_at` on a typed, unproven address would let a
 * stranger at the lobby kiosk undo someone's unsubscribe. The consequence was
 * that nothing recorded WHO ticked WHICH sentence, WHEN, from WHAT surface. If
 * the confirmation send failed or was never clicked, the intent evaporated.
 *
 * Same lifecycle as phone_opt_ins, and for the same reason:
 *
 *   pending   — an UNAUTHENTICATED surface captured the tick (the kiosk). It is
 *               INTENT. It authorises nothing.
 *   opted_in  — a VERIFIED ACT promoted it: the double-opt-in link delivered to
 *               THAT mailbox was clicked (see /api/consent/confirm/[token]).
 *               Only here may users.marketing_opted_out_at be cleared.
 *   opted_out — they unsubscribed. A kiosk tick must never flip this back, and
 *               neither may a confirmation click that was minted off it —
 *               promotion is scoped to `status = 'pending'`.
 */
export const emailOptIns = pgTable(
  "email_opt_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    email: varchar("email", { length: 255 }).notNull(),
    status: varchar("status", { length: 20 })
      .notNull()
      .$type<EmailOptInStatus>(),
    optedInAt: timestamp("opted_in_at"),
    optedOutAt: timestamp("opted_out_at"),
    optInSource: varchar("opt_in_source", { length: 50 }),
    /**
     * The literal sentence the customer saw when they ticked the box. A
     * reviewer compares the live form against the stored evidence; if they
     * disagree, the evidence proves nothing.
     */
    consentTextShown: text("consent_text_shown"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    orgEmailIdx: uniqueIndex("idx_email_opt_ins_org_email").on(
      table.organizationId,
      table.email,
    ),
  }),
);

export const emailOptInsRelations = relations(emailOptIns, ({ one }) => ({
  organization: one(organizations, {
    fields: [emailOptIns.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [emailOptIns.userId],
    references: [users.id],
  }),
}));

export const EMAIL_OPT_IN_STATUS = ["pending", "opted_in", "opted_out"] as const;
export type EmailOptInStatus = (typeof EMAIL_OPT_IN_STATUS)[number];

export type EmailOptIn = typeof emailOptIns.$inferSelect;
export type NewEmailOptIn = typeof emailOptIns.$inferInsert;

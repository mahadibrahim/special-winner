import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { emailOptIns } from "@/lib/db/schema/email-opt-ins";
import { users } from "@/lib/db/schema/users";
import { and, eq } from "drizzle-orm";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { recordMarketingConsent } from "@/lib/consents/marketing";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";

// Distinct phones per case so the (org, phone, channel) unique index never
// collides across unrelated assertions in this file.
const PHONE_TEXT_SHOWN = `557${Date.now().toString().slice(-7)}`;
const PHONE_CONFLICT = `558${Date.now().toString().slice(-7)}`;
const PHONE_COEXIST = `559${Date.now().toString().slice(-7)}`;

describe("recordMarketingConsent", () => {
  let userId: string;
  let userEmail: string;

  beforeAll(async () => {
    const db = getDb();
    userEmail = `record-marketing-consent-${Date.now()}@test.example`;
    const [u] = await db
      .insert(users)
      .values({
        email: userEmail,
        passwordHash: "x",
        firstName: "Consent",
        lastName: "Test",
      })
      .returning();
    userId = u.id;
  });

  afterAll(async () => {
    const db = getDb();
    await db
      .delete(phoneOptIns)
      .where(eq(phoneOptIns.phone, PHONE_TEXT_SHOWN));
    await db.delete(phoneOptIns).where(eq(phoneOptIns.phone, PHONE_CONFLICT));
    await db.delete(phoneOptIns).where(eq(phoneOptIns.phone, PHONE_COEXIST));
    await db.delete(emailOptIns).where(eq(emailOptIns.email, userEmail));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("writes an sms consent with the exact text shown", async () => {
    const db = getDb();
    await recordMarketingConsent({
      db,
      organizationId: E2E_ORG_ID,
      userId,
      channel: "sms",
      phone: PHONE_TEXT_SHOWN,
      source: "test",
      textShown: CONSENT_COPY.sms,
    });

    const [row] = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, E2E_ORG_ID),
          eq(phoneOptIns.phone, PHONE_TEXT_SHOWN),
          eq(phoneOptIns.channel, "sms"),
        ),
      );

    expect(row).toBeTruthy();
    expect(row.channel).toBe("sms");
    expect(row.status).toBe("opted_in");
    expect(row.optedInAt).not.toBeNull();
    expect(row.optInSource).toBe("test");
    // A carrier reviewer compares the stored evidence against the live form
    // — this is why the column exists.
    expect(row.consentTextShown).toBe(CONSENT_COPY.sms);
  });

  it("re-opting-in (the conflict path) upserts instead of throwing, leaving one row", async () => {
    const db = getDb();

    await recordMarketingConsent({
      db,
      organizationId: E2E_ORG_ID,
      userId,
      channel: "sms",
      phone: PHONE_CONFLICT,
      source: "first-opt-in",
      textShown: CONSENT_COPY.sms,
    });

    const [firstRow] = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, E2E_ORG_ID),
          eq(phoneOptIns.phone, PHONE_CONFLICT),
          eq(phoneOptIns.channel, "sms"),
        ),
      );

    // Simulate the person opting out, then later opting back in — the
    // conflict path only fires when a row for (org, phone, channel) already
    // exists.
    await db
      .update(phoneOptIns)
      .set({ status: "opted_out", optedOutAt: new Date() })
      .where(eq(phoneOptIns.id, firstRow.id));

    // This second call must hit onConflictDoUpdate on
    // (organizationId, phone, channel) — the actual unique index on
    // phone_opt_ins — not throw "no unique constraint matching ON CONFLICT".
    await recordMarketingConsent({
      db,
      organizationId: E2E_ORG_ID,
      userId,
      channel: "sms",
      phone: PHONE_CONFLICT,
      source: "re-opt-in",
      textShown: CONSENT_COPY.sms,
    });

    const rows = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, E2E_ORG_ID),
          eq(phoneOptIns.phone, PHONE_CONFLICT),
          eq(phoneOptIns.channel, "sms"),
        ),
      );

    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("opted_in");
    expect(rows[0].optedOutAt).toBeNull();
    expect(rows[0].optInSource).toBe("re-opt-in");
    expect(rows[0].optedInAt).not.toBeNull();
    expect(rows[0].optedInAt!.getTime()).toBeGreaterThanOrEqual(
      firstRow.optedInAt!.getTime(),
    );
  });

  it("sms and whatsapp consents on the same phone coexist without overwriting each other", async () => {
    const db = getDb();

    await recordMarketingConsent({
      db,
      organizationId: E2E_ORG_ID,
      userId,
      channel: "sms",
      phone: PHONE_COEXIST,
      source: "test",
      textShown: CONSENT_COPY.sms,
    });
    await recordMarketingConsent({
      db,
      organizationId: E2E_ORG_ID,
      userId,
      channel: "whatsapp",
      phone: PHONE_COEXIST,
      source: "test",
      textShown: CONSENT_COPY.whatsapp,
    });

    const rows = await db
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, E2E_ORG_ID),
          eq(phoneOptIns.phone, PHONE_COEXIST),
        ),
      );

    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.channel))).toEqual(
      new Set(["sms", "whatsapp"]),
    );
  });

  it("the email channel does NOT set users.emailVerified", async () => {
    const db = getDb();

    const [before] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(before.emailVerified).toBe(false);

    await recordMarketingConsent({
      db,
      organizationId: E2E_ORG_ID,
      userId,
      channel: "email",
      // The evidence row is keyed on the ADDRESS the consent was given for —
      // an email consent with no address is a consent we could never honour or
      // prove, so the channel now requires it.
      email: userEmail,
      source: "test",
      textShown: CONSENT_COPY.email,
    });

    const [after] = await db.select().from(users).where(eq(users.id, userId));
    // Only the double-opt-in click may set emailVerified. If
    // recordMarketingConsent ever set it, an unverified address could enter
    // the marketing list.
    expect(after.emailVerified).toBe(false);

    // ...and the evidence IS written: the sentence shown, the surface, the org.
    const [row] = await db
      .select()
      .from(emailOptIns)
      .where(
        and(
          eq(emailOptIns.organizationId, E2E_ORG_ID),
          eq(emailOptIns.email, userEmail),
        ),
      );
    expect(row, "an email consent must leave evidence").toBeTruthy();
    expect(row.consentTextShown).toBe(CONSENT_COPY.email);
    expect(row.optInSource).toBe("test");
  });
});

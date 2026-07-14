import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { and, eq } from "drizzle-orm";
import { E2E_ORG_ID } from "@/lib/db/seeds/seed-e2e-tests";
import { sendSms } from "@/lib/sms/send";

// sendSms() runs IN THIS PROCESS here (not over HTTP), so it needs the mock
// transport enabled or it short-circuits at "not_configured" before ever
// reaching the opt-in gate this test exists to exercise. No network is made:
// MESSAGING_MOCK swaps the provider call for an in-memory record.
process.env.MESSAGING_MOCK = "1";

const PHONE = `555${Date.now().toString().slice(-7)}`;

describe("consent is per-channel", () => {
  afterAll(async () => {
    await getDb().delete(phoneOptIns).where(eq(phoneOptIns.phone, PHONE));
  });

  it("a WhatsApp opt-in does NOT authorise an SMS send", async () => {
    // The ONLY consent on file is WhatsApp. SMS must still be refused.
    await getDb().insert(phoneOptIns).values({
      organizationId: E2E_ORG_ID,
      phone: PHONE,
      channel: "whatsapp",
      status: "opted_in",
      optedInAt: new Date(),
      optInSource: "test",
    });

    const res = await sendSms({
      organizationId: E2E_ORG_ID,
      to: PHONE,
      body: "should not send",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_opted_in");
  });

  it("both channels coexist on one phone without overwriting each other", async () => {
    await getDb().insert(phoneOptIns).values({
      organizationId: E2E_ORG_ID,
      phone: PHONE,
      channel: "sms",
      status: "opted_in",
      optedInAt: new Date(),
      optInSource: "test",
    });

    const rows = await getDb()
      .select()
      .from(phoneOptIns)
      .where(
        and(
          eq(phoneOptIns.organizationId, E2E_ORG_ID),
          eq(phoneOptIns.phone, PHONE),
        ),
      );

    // The old unique index on (org, phone) made this impossible.
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.channel))).toEqual(
      new Set(["sms", "whatsapp"]),
    );
  });
});

/**
 * SMS regression coverage using the dispatch-layer test mode
 * (src/lib/messaging/mock.ts, MESSAGING_MOCK=1). Before this suite, the SMS
 * channel had zero regression coverage — API tests either skipped assertions
 * on unconfigured-channel fail-soft paths (see tests/api/cron/payment-reminders.test.ts)
 * or never exercised SMS at all.
 *
 * Covers three SMS paths built this week:
 *   - payment-hold reminder: SMS-first channel order, driven end-to-end over
 *     HTTP via POST /api/cron/expire-pending-claims (the dispatch runs in the
 *     dev server, so the send lands in the dev server's mock ring and is
 *     asserted via GET /api/test/messaging-mock)
 *   - transactional-capacity-gate overflow refund (dispatchOverflowRefunded):
 *     email-first DEFAULT_CHANNEL_ORDER even for a phone-verified recipient.
 *     Called in-process (like tests/api/dropin/transactional-capacity-gate.test.ts
 *     calls the checkout handler in-process), so it's asserted against the
 *     in-process ring via getMockMessages() directly.
 *   - admin waiver-link resend (POST /api/admin/check-in/send-link): explicit
 *     sms/email channel selection — the server side of ActivityDetailPanel's
 *     "try SMS, fall back to email" resend button.
 *
 * Every test checks the mock is actually enabled BEFORE triggering any send,
 * and degrades to a skip-with-warning otherwise (the "Stripe not configured"
 * idiom from tests/api/rentals/bookings.test.ts) — so with the flag off this
 * file stays green AND fires no real Twilio/Resend traffic.
 */
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { eq } from "drizzle-orm";
import { dispatchOverflowRefunded } from "@/lib/dropin/messages/dispatch";
import { getMockMessages, isMessagingMockEnabled } from "@/lib/messaging/mock";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";

// Seeded in src/lib/db/seeds/seed-e2e-tests.ts (TEST_USERS.player) —
// verified phone so SMS-capable dispatch paths have a fixture to exercise.
const PLAYER_EMAIL = "player@test.aspiresports.com";
const PLAYER_PHONE_RAW = "6145550175";
const PLAYER_PHONE_E164 = "+16145550175";

interface MockInspectResult {
  enabled: boolean;
  messages: Array<{ to: string; subject: string | null; body: string }>;
}

async function getPlayerUserId(): Promise<string> {
  const [row] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, PLAYER_EMAIL))
    .limit(1);
  if (!row) {
    throw new Error(
      `Seed fixture missing: ${PLAYER_EMAIL} — run npm run db:seed:e2e`,
    );
  }
  return row.id;
}

/** Ensure the player's phone is opted in for the given org — sendSms gates
 *  on phone_opt_ins(org, phone). Idempotent upsert, mirrors the seed. Covers
 *  both representations: the gateway/dropin dispatcher normalizes to E.164
 *  before sendSms, while send-link passes users.phone verbatim. */
async function ensurePlayerOptIn(organizationId: string): Promise<void> {
  for (const phone of [PLAYER_PHONE_RAW, PLAYER_PHONE_E164]) {
    await getDb()
      .insert(phoneOptIns)
      .values({
        organizationId,
        phone,
        channel: "sms",
        status: "opted_in",
        optedInAt: new Date(),
        optInSource: "admin_added",
      })
      .onConflictDoUpdate({
        target: [
          phoneOptIns.organizationId,
          phoneOptIns.phone,
          phoneOptIns.channel,
        ],
        set: { status: "opted_in", optedInAt: new Date(), optedOutAt: null },
      });
  }
}

async function insertBooking(
  sessionId: string,
  userId: string,
  overrides: Partial<typeof dropInBookings.$inferInsert> = {},
) {
  const [row] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "confirmed",
      source: "walk_up",
      paymentMethod: "card_online",
      amountPaidCents: 1500,
      ...overrides,
    })
    .returning();
  return row;
}

/** Is the DEV SERVER's messaging mock on (and the test endpoint enabled)?
 *  Checked BEFORE triggering any HTTP-driven send so a flag-off run never
 *  fires real provider traffic from these tests. */
async function serverMockEnabled(): Promise<boolean> {
  const res = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent("probe@example.test")}`,
  );
  if (res.status !== 200) return false;
  const json = (await res.json()) as MockInspectResult;
  return json.enabled === true;
}

async function serverMockMessages(
  to: string,
  channel: "sms" | "email",
  since: string,
): Promise<MockInspectResult["messages"]> {
  const res = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent(to)}&channel=${channel}&since=${encodeURIComponent(since)}`,
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as MockInspectResult;
  return json.messages;
}

function warnDisabledAndSkip(where: string): void {
  console.warn(
    `[messaging-mock] MESSAGING_MOCK not enabled (${where}) — skipping strict assertions`,
  );
}

describe("Messaging mock: payment-hold reminder is SMS-first (cron-driven)", () => {
  it("reminds a phone-verified, opted-in holder via SMS, not email", async () => {
    if (!(await serverMockEnabled())) {
      return warnDisabledAndSkip("dev server");
    }
    const since = new Date().toISOString();
    const playerId = await getPlayerUserId();
    const ctx = await createTestDropInSession({ capacity: 4 });
    await ensurePlayerOptIn(ctx.organizationId);
    const hold = await insertBooking(ctx.sessionId, playerId, {
      status: "pending_payment",
      amountPaidCents: 0,
      promotionExpiresAt: new Date(Date.now() + 20 * 60_000),
    });

    const res = await apiFetch("/api/cron/expire-pending-claims", {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
    });
    expect(res.status).toBe(200);

    // Stamp is the DB contract (pre-existing coverage in
    // tests/api/cron/payment-reminders.test.ts); the mock lets us
    // additionally assert the actual channel + copy for the first time.
    const [after] = await getDb()
      .select({ reminderSentAt: dropInBookings.reminderSentAt })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, hold.id));
    expect(after.reminderSentAt).not.toBeNull();

    const smsSends = await serverMockMessages(PLAYER_PHONE_E164, "sms", since);
    expect(smsSends.length).toBeGreaterThanOrEqual(1);
    const msg = smsSends.at(-1)!;
    expect(msg.body).toContain("held until");
    expect(msg.body).toContain("Complete payment");

    // SMS-first means SMS only — no email fallback fired for this reminder.
    const emailSends = await serverMockMessages(PLAYER_EMAIL, "email", since);
    expect(emailSends.length).toBe(0);
  });
});

describe("Messaging mock: overflow-refund dispatch stays email-first by default", () => {
  // In-process dispatch → asserts the in-process ring, so this needs the
  // flag in THIS process's env (CI sets it globally; local runs pass it).
  // skipIf (not a silent return) so a flag-off run reports it as skipped.
  it.skipIf(!isMessagingMockEnabled())(
    "dispatches via email even though the recipient has a verified phone",
    async () => {
      const since = new Date().toISOString();
      const playerId = await getPlayerUserId();
      const ctx = await createTestDropInSession({ capacity: 4 });
      await ensurePlayerOptIn(ctx.organizationId);
      const booking = await insertBooking(ctx.sessionId, playerId);

      const result = await dispatchOverflowRefunded(booking.id);

      expect(result.ok).toBe(true);
      expect(result.channel).toBe("email");
      const emails = getMockMessages({
        to: PLAYER_EMAIL,
        channel: "email",
        since,
      });
      expect(emails.length).toBeGreaterThanOrEqual(1);
      const msg = emails.at(-1)!;
      expect(msg.subject).toContain("first in line");
      // Email-first means no SMS was attempted for this dispatch.
      expect(
        getMockMessages({ to: PLAYER_PHONE_E164, channel: "sms", since })
          .length,
      ).toBe(0);
    },
  );
});

describe("Messaging mock: admin waiver-link resend (send-link.ts server side)", () => {
  it("sends via SMS, then via email, recording both — mirrors ActivityDetailPanel's resendLink fallback", async () => {
    if (!(await serverMockEnabled())) {
      return warnDisabledAndSkip("dev server");
    }
    const adminCookie = await getAdminCookie();
    const playerId = await getPlayerUserId();
    const defaultOrg = await resolveDefaultOrgForHttpTests();
    await ensurePlayerOptIn(defaultOrg.organizationId);
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      capacity: 4,
    });
    const booking = await insertBooking(ctx.sessionId, playerId);

    const smsSince = new Date().toISOString();
    const smsRes = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        kind: "walkin_session",
        targetId: booking.id,
        channel: "sms",
      }),
    });
    expect(smsRes.status).toBe(200);
    const smsJson = await smsRes.json();
    expect(smsJson.channel).toBe("sms");

    // send-link passes users.phone verbatim (no E.164 normalization).
    const smsSends = await serverMockMessages(PLAYER_PHONE_RAW, "sms", smsSince);
    expect(smsSends.length).toBeGreaterThanOrEqual(1);
    expect(smsSends.at(-1)!.body).toContain("sign, add a photo, and pay");

    const emailSince = new Date().toISOString();
    const emailRes = await apiFetch("/api/admin/check-in/send-link", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        kind: "walkin_session",
        targetId: booking.id,
        channel: "email",
      }),
    });
    expect(emailRes.status).toBe(200);

    const emailSends = await serverMockMessages(PLAYER_EMAIL, "email", emailSince);
    expect(emailSends.length).toBeGreaterThanOrEqual(1);
    expect(emailSends.at(-1)!.subject).toContain("Complete payment");
  });
});

describe("Messaging mock inspection endpoint", () => {
  it("requires a `to` param (or 404s when E2E_TEST_ENDPOINTS is off)", async () => {
    const res = await apiFetch("/api/test/messaging-mock");
    expect([400, 404]).toContain(res.status);
  });
});

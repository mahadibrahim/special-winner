/**
 * "Needs players" fill-alert cron sweep — POST /api/cron/check-fill-alerts.
 *
 * Uses the messaging mock (MESSAGING_MOCK=1 on the dev server; see
 * src/pages/api/test/messaging-mock.ts and
 * tests/api/messaging/dispatch-mock.test.ts for the HTTP contract) to assert
 * the actual SMS body/recipient rather than only DB side effects.
 *
 * Isolation: every test builds its own org+venue (via createTestDropInSession
 * with no organizationId/venueId override, which delegates to
 * createTestGameContext — a fresh org per call). The sweep query scopes
 * subscribers to `session.organizationId`, so other suites' sessions/subs in
 * the shared staging DB can never match a subscriber created here. Each
 * subscriber also gets a unique phone number so mock-inbox assertions
 * (filtered by `to`) can't cross-contaminate between tests or with
 * concurrent runs.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
} from "@/lib/db/schema/drop-in";
import { pickupAlertSubscriptions, pickupAlertSends } from "@/lib/db/schema/hosts";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { venues } from "@/lib/db/schema/teams";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import { createTestUserWithPassword } from "../../utils/host-helpers";
import { apiFetch } from "../setup/test-helpers";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

interface MockInspectResult {
  enabled: boolean;
  messages: Array<{ to: string; subject: string | null; body: string }>;
}

function uniquePhone(): string {
  const rand = Math.floor(1_000_000 + Math.random() * 8_999_999);
  return `+1614${rand}`;
}

/**
 * A Date pinned to a dispatch-hour local time (America/New_York) that keeps
 * "today"'s UTC calendar date — 17:00 UTC is 1pm EDT / noon EST, comfortably
 * inside the 9am-8pm dispatch window regardless of DST. Using a fixed hour
 * (rather than raw `Date.now()`) makes every test in this file immune to the
 * quiet-hours gate no matter what wall-clock time the suite happens to run
 * at, while keeping the daily-cap UTC-day math (`dayStart` in
 * runFillAlertSweep) aligned with rows inserted via `new Date()` elsewhere
 * in this file (same UTC date, only the hour is pinned).
 */
function dispatchHourNow(): Date {
  const d = new Date();
  d.setUTCHours(17, 0, 0, 0);
  return d;
}

/** 06:00 UTC — 2am EDT / 1am EST, well outside the 9am-8pm dispatch window
 *  regardless of DST. Same UTC date as `dispatchHourNow()` so window/threshold
 *  math relative to a session's startsAt stays comparable between the two. */
function quietHourNow(): Date {
  const d = new Date();
  d.setUTCHours(6, 0, 0, 0);
  return d;
}

async function triggerSweep(now: Date = dispatchHourNow()) {
  const res = await apiFetch("/api/cron/check-fill-alerts", {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ now: now.toISOString() }),
  });
  expect(res.status).toBe(200);
  return res.json();
}

async function clearInbox(): Promise<boolean> {
  const del = await apiFetch("/api/test/messaging-mock", { method: "DELETE" });
  if (del.status !== 200) return false;
  const probe = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent("probe@example.test")}`,
  );
  if (probe.status !== 200) return false;
  const json = (await probe.json()) as MockInspectResult;
  return json.enabled === true;
}

async function inboxFor(phone: string): Promise<MockInspectResult["messages"]> {
  const res = await apiFetch(
    `/api/test/messaging-mock?to=${encodeURIComponent(phone)}&channel=sms`,
  );
  expect(res.status).toBe(200);
  const json = (await res.json()) as MockInspectResult;
  return json.messages;
}

/** Phone-verified, opted-in, subscribed user — ready to receive fill alerts. */
async function makeSubscriber(
  organizationId: string,
  opts: { venueId?: string | null; sport?: string | null } = {},
) {
  const phone = uniquePhone();
  const user = await createTestUserWithPassword({ phone });
  const db = getDb();
  await db.insert(phoneOptIns).values({
    organizationId,
    userId: user.userId,
    phone,
    status: "opted_in",
    optedInAt: new Date(),
    optInSource: "registration_form",
  });
  const [sub] = await db
    .insert(pickupAlertSubscriptions)
    .values({
      userId: user.userId,
      organizationId,
      venueId: opts.venueId ?? null,
      sport: opts.sport ?? null,
      active: true,
    })
    .returning();
  return { ...user, phone, subscriptionId: sub.id };
}

/** A fresh org/venue + a scheduled pickup session 2h out (relative to
 *  `referenceNow`, default the shared dispatch-hour "now"), capacity 10,
 *  0 bookings — the default "eligible" fixture used by most cases. Sessions
 *  are built relative to the same reference the sweep is triggered with so
 *  window/threshold eligibility never depends on real wall-clock skew. */
async function makeEligibleSession(referenceNow: Date = dispatchHourNow()) {
  return createTestDropInSession({
    startsAt: new Date(referenceNow.getTime() + 2 * 60 * 60_000),
    capacity: 10,
  });
}

describe("Fill-alert cron sweep (POST /api/cron/check-fill-alerts)", () => {
  let mockReady = true;

  beforeEach(async () => {
    mockReady = await clearInbox();
    if (!mockReady) {
      console.warn(
        "[fill-alerts] MESSAGING_MOCK/E2E_TEST_ENDPOINTS not enabled on dev server — skipping strict assertions",
      );
    }
  });

  it("sends one SMS to a matching subscriber, records a send row, and stamps fillAlertSentAt", async () => {
    if (!mockReady) return;
    const ctx = await makeEligibleSession();
    const subscriber = await makeSubscriber(ctx.organizationId);

    await triggerSweep();

    const messages = await inboxFor(subscriber.phone);
    expect(messages.length).toBe(1);
    expect(messages[0].body).toContain(`/dropin/${ctx.sessionId}`);
    expect(messages[0].body).toContain("?src=fill-alert");

    const db = getDb();
    const [sendRow] = await db
      .select()
      .from(pickupAlertSends)
      .where(
        and(
          eq(pickupAlertSends.sessionId, ctx.sessionId),
          eq(pickupAlertSends.userId, subscriber.userId),
        ),
      );
    expect(sendRow).toBeTruthy();

    const [session] = await db
      .select({ fillAlertSentAt: dropInSessions.fillAlertSentAt })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.fillAlertSentAt).not.toBeNull();
  });

  it("does not send again on a second sweep once fillAlertSentAt is set", async () => {
    if (!mockReady) return;
    const ctx = await makeEligibleSession();
    const subscriber = await makeSubscriber(ctx.organizationId);

    await triggerSweep();
    expect((await inboxFor(subscriber.phone)).length).toBe(1);

    await clearInbox();
    await triggerSweep();
    expect((await inboxFor(subscriber.phone)).length).toBe(0);
  });

  it("skips a subscriber who already has a confirmed booking on the session", async () => {
    if (!mockReady) return;
    const ctx = await makeEligibleSession();
    const subscriber = await makeSubscriber(ctx.organizationId);

    await getDb().insert(dropInBookings).values({
      sessionId: ctx.sessionId,
      userId: subscriber.userId,
      status: "confirmed",
      source: "walk_up",
      paymentMethod: "card_online",
      amountPaidCents: 1500,
    });

    await triggerSweep();
    expect((await inboxFor(subscriber.phone)).length).toBe(0);
  });

  it("skips a venue-scoped subscription for a different venue", async () => {
    if (!mockReady) return;
    const ctx = await makeEligibleSession();

    const db = getDb();
    const [venueRow] = await db
      .select({ locationId: venues.locationId })
      .from(venues)
      .where(eq(venues.id, ctx.venueId));
    const [otherVenue] = await db
      .insert(venues)
      .values({ locationId: venueRow.locationId, name: "Other Venue" })
      .returning();

    const subscriber = await makeSubscriber(ctx.organizationId, {
      venueId: otherVenue.id,
    });

    await triggerSweep();
    expect((await inboxFor(subscriber.phone)).length).toBe(0);
  });

  it("skips a sport-scoped subscription for a different sport", async () => {
    if (!mockReady) return;
    const ctx = await makeEligibleSession(); // sportOrClassLabel defaults to "soccer"
    const subscriber = await makeSubscriber(ctx.organizationId, {
      sport: "basketball",
    });

    await triggerSweep();
    expect((await inboxFor(subscriber.phone)).length).toBe(0);
  });

  it("enforces the daily cap: a user with 2 sends already today is skipped", async () => {
    if (!mockReady) return;
    const ctx = await makeEligibleSession();
    const subscriber = await makeSubscriber(ctx.organizationId);

    const db = getDb();
    await db.insert(pickupAlertSends).values([
      { sessionId: ctx.sessionId, userId: subscriber.userId, sentAt: new Date() },
      { sessionId: ctx.sessionId, userId: subscriber.userId, sentAt: new Date() },
    ]);

    await triggerSweep();
    expect((await inboxFor(subscriber.phone)).length).toBe(0);
  });

  it("does not alert a session outside the window or over the fill threshold", async () => {
    if (!mockReady) return;
    const db = getDb();

    // Case A: starts in 3 days — outside the default 24h window.
    const farCtx = await createTestDropInSession({
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      capacity: 10,
    });
    const farSubscriber = await makeSubscriber(farCtx.organizationId);

    // Case B: starts in 2h but 8/10 booked — over the default 60% threshold.
    const fullCtx = await makeEligibleSession();
    const fullSubscriber = await makeSubscriber(fullCtx.organizationId);
    for (let i = 0; i < 8; i++) {
      const filler = await createTestUserWithPassword();
      await db.insert(dropInBookings).values({
        sessionId: fullCtx.sessionId,
        userId: filler.userId,
        status: "confirmed",
        source: "walk_up",
        paymentMethod: "card_online",
        amountPaidCents: 1500,
      });
    }

    await triggerSweep();

    expect((await inboxFor(farSubscriber.phone)).length).toBe(0);
    expect((await inboxFor(fullSubscriber.phone)).length).toBe(0);

    const [farSession] = await db
      .select({ fillAlertSentAt: dropInSessions.fillAlertSentAt })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, farCtx.sessionId));
    expect(farSession.fillAlertSentAt).toBeNull();

    const [fullSession] = await db
      .select({ fillAlertSentAt: dropInSessions.fillAlertSentAt })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, fullCtx.sessionId));
    expect(fullSession.fillAlertSentAt).toBeNull();
  });

  it("does not stamp fillAlertSentAt when a session is eligible but has no matching subscriber", async () => {
    if (!mockReady) return;
    // Eligible in every other way, but nobody has subscribed at all — the
    // effective-recipient list is empty, so the sweep must not burn the
    // one-blast stamp (otherwise this session could never alert later once
    // a real subscriber shows up).
    const ctx = await makeEligibleSession();

    const result = await triggerSweep();
    expect(result.smsSent).toBe(0);

    const db = getDb();
    const [session] = await db
      .select({ fillAlertSentAt: dropInSessions.fillAlertSentAt })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.fillAlertSentAt).toBeNull();
  });

  it("does not dispatch or stamp outside the 9am-8pm America/New_York quiet-hours window", async () => {
    if (!mockReady) return;
    const quietNow = quietHourNow();
    const ctx = await makeEligibleSession(quietNow);
    const subscriber = await makeSubscriber(ctx.organizationId);

    await triggerSweep(quietNow);

    expect((await inboxFor(subscriber.phone)).length).toBe(0);

    const db = getDb();
    const [session] = await db
      .select({ fillAlertSentAt: dropInSessions.fillAlertSentAt })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, ctx.sessionId));
    expect(session.fillAlertSentAt).toBeNull();
  });
});

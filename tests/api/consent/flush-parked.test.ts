/**
 * Flushing parked consents — the cron that wakes a dormant channel's backlog.
 *
 * The consent feature deliberately lets intent SURVIVE a channel that cannot
 * deliver yet (SMS via Zernio dormant under 10DLC review; WhatsApp with no WABA).
 * A kiosk tick is captured as `status: "pending"`. When the channel wakes, this
 * cron sends the confirmation that prompts the verified act — it does NOT itself
 * grant consent.
 *
 * Three parked rows must resolve to exactly one outcome each:
 *   sent              — fresh (within the staleness window), channel awake.
 *   reconfirmRequired — older than CONSENT_STALE_AFTER_DAYS. Blasting a consent
 *                       ticked in July when the channel wakes in October is how a
 *                       sender gets flagged, so we DO NOT send — re-confirm instead.
 *   stillDormant      — the channel is still asleep. A dormant channel must NEVER
 *                       destroy consent: the row stays parked and is retried.
 *
 * Isolation on the shared CI/staging DB: each test seeds into its OWN throwaway
 * org and scopes the cron to that org (?organizationId=…), so the counts it
 * asserts reflect only its own seeded row, never another suite's parked consents.
 */
import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { organizations } from "@/lib/db/schema/organizations";
import { KIOSK_SPECTATOR_SOURCE } from "@/lib/consents/marketing";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import { normalizeUsPhone } from "@/lib/sms/send";
import { eq, inArray } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";
const ENDPOINT = "/api/cron/flush-parked-consents";

const DAY_MS = 86_400_000;

const createdOrgIds: string[] = [];
const createdPhones: string[] = [];

/**
 * Stand up an isolated org and park one phone_opt_ins row in it. Returns the org
 * id (to scope the cron) and the E.164 phone (to read the mock inbox).
 */
async function seedParkedConsent(opts: {
  channel: "sms" | "whatsapp";
  ageDays: number;
  areaPrefix: string;
}): Promise<{ organizationId: string; phoneE164: string }> {
  const db = getDb();
  const suffix = `${Date.now()}`.slice(-7);
  const rand = Math.random().toString(36).slice(2, 8);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Flush Test Org ${rand}`,
      slug: `flush-test-${rand}`,
      organizationType: "headquarters",
    })
    .returning({ id: organizations.id });
  createdOrgIds.push(org.id);

  const phoneE164 = normalizeUsPhone(`${opts.areaPrefix}${suffix}`)!;
  createdPhones.push(phoneE164);

  // A kiosk-captured intent: status "pending", optedInAt NULL. The capture
  // moment lives on createdAt, which is both the staleness anchor and the date
  // the confirmation message names.
  const capturedAt = new Date(Date.now() - opts.ageDays * DAY_MS);
  await db.insert(phoneOptIns).values({
    organizationId: org.id,
    userId: null,
    phone: phoneE164,
    channel: opts.channel,
    status: "pending",
    optedInAt: null,
    optInSource: KIOSK_SPECTATOR_SOURCE,
    consentTextShown: CONSENT_COPY[opts.channel],
    createdAt: capturedAt,
    updatedAt: capturedAt,
  });

  return { organizationId: org.id, phoneE164 };
}

async function runCron(organizationId: string) {
  const res = await fetch(
    `${BASE}${ENDPOINT}?organizationId=${encodeURIComponent(organizationId)}`,
    { method: "POST", headers: { "x-cron-secret": CRON_SECRET } },
  );
  return res;
}

async function readMockSms(phoneE164: string, since: string) {
  const res = await fetch(
    `${BASE}/api/test/messaging-mock?to=${encodeURIComponent(phoneE164)}` +
      `&channel=sms&since=${encodeURIComponent(since)}`,
  );
  expect(res.status, "messaging mock endpoint (needs E2E_TEST_ENDPOINTS=yes)").toBe(200);
  const body = (await res.json()) as {
    enabled: boolean;
    messages: { body: string }[];
  };
  expect(body.enabled, "MESSAGING_MOCK must be on for this suite").toBe(true);
  return body.messages;
}

describe("flushing parked consents", () => {
  afterAll(async () => {
    const db = getDb();
    if (createdPhones.length > 0) {
      await db.delete(phoneOptIns).where(inArray(phoneOptIns.phone, createdPhones));
    }
    for (const id of createdOrgIds) {
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it("sends the confirmation for a FRESH parked consent once the channel is awake", async () => {
    const since = new Date(Date.now() - 5_000).toISOString();
    const { organizationId, phoneE164 } = await seedParkedConsent({
      channel: "sms",
      ageDays: 10,
      areaPrefix: "602",
    });

    const res = await runCron(organizationId);
    const body = await res.json();
    expect(res.status, `cron said: ${JSON.stringify(body)}`).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.reconfirmRequired).toBe(0);
    expect(body.stillDormant).toBe(0);

    // The first message on a newly-live channel must NAME when and where they
    // opted in — a cold message with no context is what gets a sender flagged.
    const messages = await readMockSms(phoneE164, since);
    expect(messages.length, "a fresh awake channel must send exactly one confirmation").toBe(1);
    expect(messages[0].body).toContain("You signed up at");
    expect(messages[0].body).toContain("Reply STOP to opt out.");
  });

  it("does NOT blast a consent older than 90 days — it requires re-confirmation", async () => {
    // Ticked at a kiosk in July, channel approved in October. Messaging them
    // silently three months later is how a sender gets flagged.
    const since = new Date(Date.now() - 5_000).toISOString();
    const { organizationId, phoneE164 } = await seedParkedConsent({
      channel: "sms",
      ageDays: 120,
      areaPrefix: "603",
    });

    const body = await (await runCron(organizationId)).json();
    expect(body.sent).toBe(0);
    expect(body.reconfirmRequired).toBe(1);

    // Nothing may have gone out to a stale number.
    const messages = await readMockSms(phoneE164, since);
    expect(messages.length, "a stale consent must never be messaged").toBe(0);
  });

  it("leaves the consent parked (not failed) if the channel is still dormant", async () => {
    // A dormant channel must never DESTROY consent — it stays queued and is
    // retried next run. WhatsApp still cannot deliver at all (no WABA/templates),
    // so a whatsapp parked row is the deterministic still-dormant case: the cron
    // must count it and never attempt a send.
    const { organizationId, phoneE164 } = await seedParkedConsent({
      channel: "whatsapp",
      ageDays: 10,
      areaPrefix: "604",
    });

    const body = await (await runCron(organizationId)).json();
    expect(body.stillDormant).toBe(1);
    expect(body.sent).toBe(0);

    // The consent is NOT destroyed: it is still parked, ready for the next run.
    const db = getDb();
    const [row] = await db
      .select()
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, phoneE164));
    expect(row.status, "a dormant channel must never destroy consent").toBe("pending");
  });

  it("releases the claim when the send does not deliver, so the row is retryable", async () => {
    // Regression guard for the fix this test file is named for: the cron used
    // to send THEN stamp. If the stamp write failed after a successful send,
    // the row stayed unstamped and got re-sent next run — a duplicate
    // marketing message. The fix inverts the order (claim first, conditional
    // on confirmationLastSentAt IS NULL), and on any non-ok send result it
    // releases the claim back to NULL so the row is retried, never silently
    // stuck "claimed" with nothing ever delivered.
    //
    // sendSms's opt-in gate is bypassed for this cron (bypassOptInCheck), and
    // MESSAGING_MOCK short-circuits before the real provider call, so neither
    // lever can force a genuine non-ok result here. isValidPhone runs before
    // both of those, though, and is a real, non-mocked gate inside sendSms —
    // so an unnormalized/invalid phone in the row forces a real
    // `{ ok: false, reason: "invalid_phone" }` all the way through the actual
    // send path, exercising the claim-release branch for real (not faked).
    const db = getDb();
    const suffix = `${Date.now()}`.slice(-7);
    const rand = Math.random().toString(36).slice(2, 8);

    const [org] = await db
      .insert(organizations)
      .values({
        name: `Flush Test Org ${rand}`,
        slug: `flush-test-${rand}`,
        organizationType: "headquarters",
      })
      .returning({ id: organizations.id });
    createdOrgIds.push(org.id);

    // Deliberately NOT run through normalizeUsPhone — this string fails
    // sendSms's isValidPhone check, forcing a real (non-mocked) send failure.
    const invalidPhone = `not-a-phone-${suffix}`;
    createdPhones.push(invalidPhone);

    const capturedAt = new Date(Date.now() - 10 * DAY_MS);
    await db.insert(phoneOptIns).values({
      organizationId: org.id,
      userId: null,
      phone: invalidPhone,
      channel: "sms",
      status: "pending",
      optedInAt: null,
      optInSource: KIOSK_SPECTATOR_SOURCE,
      consentTextShown: CONSENT_COPY.sms,
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });

    const body = await (await runCron(org.id)).json();
    expect(body.sent, `cron said: ${JSON.stringify(body)}`).toBe(0);
    expect(body.errored, `cron said: ${JSON.stringify(body)}`).toBe(1);

    const [row] = await db
      .select()
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, invalidPhone));
    expect(
      row.confirmationLastSentAt,
      "a claim that did not result in a delivered message must be released back to NULL",
    ).toBeNull();

    // And it's genuinely retryable, not just "NULL but still stuck": running
    // the cron again against the same (still-broken) row claims and releases
    // it again, deterministically — never silently skipped as alreadyNudged.
    const secondBody = await (await runCron(org.id)).json();
    expect(secondBody.alreadyNudged, `cron said: ${JSON.stringify(secondBody)}`).toBe(0);
    expect(secondBody.errored, `cron said: ${JSON.stringify(secondBody)}`).toBe(1);
  });

  it("closes the loop: a second flush does NOT re-send an already-nudged row", async () => {
    // Regression guard for the exact bug this fix closes: with no memory of a
    // prior send, a fresh `pending` row on an awake channel got re-messaged
    // every 30-minute cron tick — an unsolicited repeat text on a marketing
    // channel — for as long as it sat unacted-on (up to the 90-day staleness
    // cutoff). One row must receive AT MOST ONE confirmation from this cron.
    const since = new Date(Date.now() - 5_000).toISOString();
    const { organizationId, phoneE164 } = await seedParkedConsent({
      channel: "sms",
      ageDays: 10,
      areaPrefix: "605",
    });

    const firstBody = await (await runCron(organizationId)).json();
    expect(firstBody.sent, "first flush must send the confirmation").toBe(1);

    const db = getDb();
    const [afterFirst] = await db
      .select()
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, phoneE164));
    expect(
      afterFirst.confirmationLastSentAt,
      "a sent confirmation must stamp confirmationLastSentAt",
    ).not.toBeNull();

    const secondBody = await (await runCron(organizationId)).json();
    expect(secondBody.sent, "second flush must NOT re-send an already-nudged row").toBe(0);
    expect(secondBody.alreadyNudged).toBe(1);

    // Exactly one confirmation must have gone out across both runs.
    const messages = await readMockSms(phoneE164, since);
    expect(
      messages.length,
      "a parked row must receive at most one confirmation, ever",
    ).toBe(1);
  });
});

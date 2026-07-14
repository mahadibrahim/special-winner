/**
 * In-memory test-mode message recorder.
 *
 * Active only when MESSAGING_MOCK=1 — mirrors R2_MOCK for object storage
 * (see src/lib/storage/r2.ts's `putObject`). When active, the leaf SMS and
 * email senders (`sendSms` in src/lib/sms/send.ts, `sendEmail` in
 * src/lib/email/index.ts) record the would-be message here instead of
 * calling Twilio/Zernio/Resend, and report a synthetic success back to
 * their caller — so upstream business logic (channel selection, opt-in
 * gating, SMS→email fallback ordering) runs completely unchanged and is
 * itself exercisable in tests.
 *
 * Test-only inspection is exposed via GET /api/test/messaging-mock, gated
 * by E2E_TEST_ENDPOINTS=yes — the same gate as every other /api/test/**
 * fixture endpoint (see src/pages/api/test/org-fixtures.ts).
 *
 * Zero behavior change when MESSAGING_MOCK is unset: every call site keeps
 * its real-transport path untouched.
 */

export type MockChannel = "sms" | "email";

export interface MockMessage {
  id: string;
  channel: MockChannel;
  /** Recipient exactly as passed to the leaf sender — a raw phone string
   *  for SMS (whatever the caller normalized or didn't) or an email
   *  address for email. Not itself normalized here. */
  to: string;
  subject: string | null;
  body: string;
  organizationId: string | null;
  createdAt: string; // ISO timestamp
}

// Bounded ring buffer — a long-running dev server used across many test
// files must not grow this unboundedly.
const RING_LIMIT = 500;
const ring: MockMessage[] = [];
let seq = 0;

/**
 * Real transport (Resend / Twilio / Zernio) is OPT-IN, and the opt-in is a
 * single env var set on exactly one deployment: the production Netlify site.
 *
 * It used to be the other way around — real sending was the default and
 * MESSAGING_MOCK=1 was the opt-out. That default is what let the following
 * happen, all of it with a live Resend key:
 *
 *   - Every local `npm run test:api` / `npm test` run really emailed the owner.
 *     The careers endpoint notifies HIRING_NOTIFY_EMAIL on each application, so
 *     the API and Playwright fixtures ("Api Applicant", "Playwright Applicant")
 *     landed in a real inbox on every run.
 *   - The staging Netlify site — which deploys from main and therefore runs
 *     every scheduled cron — drove those crons against the staging database and
 *     its thousands of seeded users, sending ~750 emails/day to addresses like
 *     `@test.example` and `@example.com`. Those domains are RFC-reserved and
 *     permanently undeliverable, so every one was a guaranteed hard bounce —
 *     the fastest way to wreck a sending domain's reputation and get the whole
 *     Resend account throttled, taking real receipts and confirmations with it.
 *
 * CI was the only environment that got this right (MESSAGING_MOCK=1 in ci.yml),
 * which is precisely the tell: safety depended on every environment remembering
 * to opt out. Now it depends on exactly one environment opting IN.
 *
 * Fail-safe direction matters here: the worst case of a missing flag is "prod
 * quietly stops sending", which is loud, obvious and instantly reversible. The
 * worst case of the old default was "every new environment silently spams real
 * people and burns the sending domain", which is neither.
 */
export function isMessagingLive(): boolean {
  return process.env.MESSAGING_LIVE === "yes";
}

export function isMessagingMockEnabled(): boolean {
  // Explicit legacy opt-out. Still honoured so ci.yml (and anything else
  // already setting it) keeps working unchanged.
  if (process.env.MESSAGING_MOCK === "1") return true;
  // Otherwise: mock unless this deployment has explicitly opted in to real
  // transport. Local dev, tests, previews and staging all land here.
  const live = isMessagingLive();
  if (!live) warnIfLiveHostIsNotLive();
  return !live;
}

/** Hosts where NOT sending is an outage, not a safety feature. */
const LIVE_HOSTS = ["aspiresportsohio.com", "gosoccerone.com"];
let warnedNotLive = false;

/**
 * The one real cost of a fail-safe default: a production site that forgets
 * MESSAGING_LIVE silently stops emailing customers. So make it un-silent —
 * if we're serving a real customer-facing host and still mocking, that is an
 * incident, and it should be screaming in the logs (and in PostHog, which
 * ingests console.error) rather than discovered from a support ticket.
 */
function warnIfLiveHostIsNotLive(): void {
  if (warnedNotLive) return;
  const appUrl = process.env.PUBLIC_APP_URL ?? "";
  if (!LIVE_HOSTS.some((h) => appUrl.includes(h))) return;
  warnedNotLive = true;
  console.error(
    `[messaging] MESSAGING_LIVE is not set, but PUBLIC_APP_URL is ${appUrl}. ` +
      `Email and SMS are being RECORDED, NOT SENT. If this is the production ` +
      `site, set MESSAGING_LIVE=yes in its Netlify environment.`,
  );
}

export function recordMockMessage(
  entry: Omit<MockMessage, "id" | "createdAt">,
): MockMessage {
  const msg: MockMessage = {
    ...entry,
    id: `mock-${entry.channel}-${Date.now()}-${++seq}`,
    createdAt: new Date().toISOString(),
  };
  ring.push(msg);
  if (ring.length > RING_LIMIT) ring.shift();
  return msg;
}

export interface MockMessageFilter {
  channel?: MockChannel;
  to?: string;
  organizationId?: string;
  /** Only messages recorded at or after this ISO timestamp. */
  since?: string;
}

export function getMockMessages(filter: MockMessageFilter = {}): MockMessage[] {
  const sinceMs = filter.since ? new Date(filter.since).getTime() : null;
  return ring.filter((m) => {
    if (filter.channel && m.channel !== filter.channel) return false;
    if (filter.to && m.to !== filter.to) return false;
    if (filter.organizationId && m.organizationId !== filter.organizationId) return false;
    if (sinceMs !== null && new Date(m.createdAt).getTime() < sinceMs) return false;
    return true;
  });
}

/** Test-only reset. Not called by production code paths. */
export function clearMockMessages(): void {
  ring.length = 0;
}

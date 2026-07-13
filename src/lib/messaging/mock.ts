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

export function isMessagingMockEnabled(): boolean {
  return process.env.MESSAGING_MOCK === "1";
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

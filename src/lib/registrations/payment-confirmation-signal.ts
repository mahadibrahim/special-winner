/**
 * Client-side bridge over the Stripe webhook-lag window.
 *
 * When a customer completes payment, Stripe confirms it in the browser
 * immediately, but the server only learns about it when the
 * `payment_intent.succeeded` webhook lands — payment rows are inserted there
 * (see src/lib/stripe/handle-registration-payment-succeeded.ts), and the
 * registration flips to confirmed in the same transaction. Until then the
 * registration still reads status=pending / paymentStatus=unpaid, and the
 * dashboard + nav would tell the customer they still owe money seconds after
 * they paid.
 *
 * During that window the browser that ran the confirmation is the ONLY party
 * that knows about the payment, so it records the fact here (localStorage)
 * and the dashboard/nav read it to present those registrations as
 * "Payment received — confirming" instead of pending/awaiting-payment.
 *
 * Entries expire: if the webhook genuinely never lands, the registration
 * falls back to the honest awaiting-payment presentation (with its
 * resume-payment CTA) rather than hiding the problem forever.
 *
 * Written from:
 *  - the registration wizard's embedded-payment success callback
 *  - /payment/return (SCA/ACH redirect path) via an inline script — keep the
 *    storage key + entry shape there in sync with this module.
 */

export const CONFIRMED_PAYMENTS_STORAGE_KEY = "aspire:confirmed-payments";

/** Card webhooks land within seconds; an hour covers pathological lag. */
const SUCCEEDED_TTL_MS = 60 * 60 * 1000;
/** ACH sits in "processing" for days before payment_intent.succeeded fires. */
const PROCESSING_TTL_MS = 72 * 60 * 60 * 1000;

export type ConfirmedPaymentStatus = "succeeded" | "processing";

interface ConfirmedPaymentEntry {
  status: ConfirmedPaymentStatus;
  /** Epoch ms when the client observed the confirmation. */
  at: number;
}

function ttlFor(status: ConfirmedPaymentStatus): number {
  return status === "processing" ? PROCESSING_TTL_MS : SUCCEEDED_TTL_MS;
}

function isValidEntry(e: unknown): e is ConfirmedPaymentEntry {
  if (typeof e !== "object" || e === null) return false;
  const entry = e as { status?: unknown; at?: unknown };
  return (
    typeof entry.at === "number" &&
    (entry.status === "succeeded" || entry.status === "processing")
  );
}

function isFresh(entry: ConfirmedPaymentEntry, now: number): boolean {
  return now - entry.at < ttlFor(entry.status);
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // Storage disabled (private mode / blocked third-party context).
    return null;
  }
}

function readAll(storage: Storage): Record<string, unknown> {
  try {
    const raw = storage.getItem(CONFIRMED_PAYMENTS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Record that Stripe confirmed a payment for this registration client-side. */
export function recordConfirmedPayment(
  registrationId: string,
  status: ConfirmedPaymentStatus,
  now: number = Date.now(),
): void {
  const storage = getStorage();
  if (!storage) return;
  const all = readAll(storage);
  // Prune stale/garbage entries while we're here so the map can't grow
  // unbounded across many registrations.
  for (const [id, entry] of Object.entries(all)) {
    if (!isValidEntry(entry) || !isFresh(entry, now)) delete all[id];
  }
  all[registrationId] = { status, at: now };
  try {
    storage.setItem(CONFIRMED_PAYMENTS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Quota/private-mode write failure — presentation falls back to pending.
  }
}

/**
 * True when this browser observed a Stripe-confirmed payment for the
 * registration recently enough that a still-pending/unpaid row should be
 * presented as "payment received — confirming" rather than awaiting payment.
 */
export function hasConfirmedPayment(
  registrationId: string,
  now: number = Date.now(),
): boolean {
  const storage = getStorage();
  if (!storage) return false;
  const entry = readAll(storage)[registrationId];
  return isValidEntry(entry) && isFresh(entry, now);
}

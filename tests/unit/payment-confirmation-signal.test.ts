import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CONFIRMED_PAYMENTS_STORAGE_KEY,
  recordConfirmedPayment,
  hasConfirmedPayment,
} from "@/lib/registrations/payment-confirmation-signal";

/**
 * Webhook-lag bridge: the browser records Stripe-confirmed payments in
 * localStorage so the dashboard/nav can present a still-pending/unpaid
 * registration as "Payment received — confirming" instead of nagging the
 * customer for a payment they just made. Entries expire so a genuinely
 * failed webhook falls back to the honest awaiting-payment presentation.
 */

const HOUR = 60 * 60 * 1000;

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

let storage: Storage;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal("window", { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("payment-confirmation-signal", () => {
  it("round-trips a recorded card payment", () => {
    recordConfirmedPayment("reg-1", "succeeded", 1000);
    expect(hasConfirmedPayment("reg-1", 1000)).toBe(true);
    expect(hasConfirmedPayment("reg-other", 1000)).toBe(false);
  });

  it("expires succeeded entries after an hour (webhook genuinely failed → honest fallback)", () => {
    recordConfirmedPayment("reg-1", "succeeded", 0);
    expect(hasConfirmedPayment("reg-1", HOUR - 1)).toBe(true);
    expect(hasConfirmedPayment("reg-1", HOUR)).toBe(false);
  });

  it("keeps ACH processing entries alive for days", () => {
    recordConfirmedPayment("reg-1", "processing", 0);
    expect(hasConfirmedPayment("reg-1", 24 * HOUR)).toBe(true);
    expect(hasConfirmedPayment("reg-1", 72 * HOUR)).toBe(false);
  });

  it("prunes expired entries on write", () => {
    recordConfirmedPayment("reg-old", "succeeded", 0);
    recordConfirmedPayment("reg-new", "succeeded", 2 * HOUR);
    const raw = JSON.parse(storage.getItem(CONFIRMED_PAYMENTS_STORAGE_KEY)!);
    expect(Object.keys(raw)).toEqual(["reg-new"]);
  });

  it("tolerates corrupted storage contents", () => {
    storage.setItem(CONFIRMED_PAYMENTS_STORAGE_KEY, "not json{");
    expect(hasConfirmedPayment("reg-1", 1000)).toBe(false);
    recordConfirmedPayment("reg-1", "succeeded", 1000);
    expect(hasConfirmedPayment("reg-1", 1000)).toBe(true);

    storage.setItem(CONFIRMED_PAYMENTS_STORAGE_KEY, JSON.stringify({ "reg-2": { bogus: true } }));
    expect(hasConfirmedPayment("reg-2", 1000)).toBe(false);
  });

  it("matches the inline-script entry shape used by /payment/return", () => {
    // Keep in sync with the is:inline script in src/pages/payment/return.astro.
    storage.setItem(
      CONFIRMED_PAYMENTS_STORAGE_KEY,
      JSON.stringify({ "reg-redirect": { status: "processing", at: 5000 } }),
    );
    expect(hasConfirmedPayment("reg-redirect", 6000)).toBe(true);
  });

  it("no-ops safely when window/localStorage is unavailable (SSR)", () => {
    vi.unstubAllGlobals();
    expect(() => recordConfirmedPayment("reg-1", "succeeded")).not.toThrow();
    expect(hasConfirmedPayment("reg-1")).toBe(false);
  });
});

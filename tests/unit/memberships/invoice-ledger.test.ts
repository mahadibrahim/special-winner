import { describe, it, expect } from "vitest";
import {
  invoiceToLedgerRow,
  membershipMarkerFromInvoice,
  subscriptionIdFromInvoice,
} from "@/lib/memberships/invoice-ledger";

const membership = { id: "mem-1", userId: "user-1" };

describe("invoiceToLedgerRow", () => {
  it("maps a paid invoice to a membership payment row", () => {
    const row = invoiceToLedgerRow(
      {
        id: "in_1",
        amount_paid: 16500,
        payment_intent: "pi_1",
        charge: "ch_1",
      } as never,
      membership,
    );
    expect(row).toEqual({
      membershipId: "mem-1",
      userId: "user-1",
      amountCents: 16500,
      paymentType: "membership",
      status: "succeeded",
      stripePaymentIntentId: "pi_1",
      stripeChargeId: "ch_1",
      metadata: { stripe_invoice_id: "in_1" },
    });
  });
  it("returns null for zero-amount invoices", () => {
    expect(
      invoiceToLedgerRow({ id: "in_2", amount_paid: 0 } as never, membership),
    ).toBeNull();
  });
});

// The decision that drives "return cleanly" vs "throw so Stripe retries"
// when invoice.paid finds no membership row. Getting this wrong either way
// is expensive: a false "not ours" silently drops first-invoice revenue
// (the event claim in handle-stripe-event.ts is consumed on a clean
// return), a false "ours" fails drop-league invoices forever.
describe("membershipMarkerFromInvoice", () => {
  it("reads the membership marker off parent.subscription_details.metadata", () => {
    expect(
      membershipMarkerFromInvoice({
        id: "in_1",
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: {
            subscription: "sub_1",
            metadata: { type: "membership_subscription", user_id: "u1" },
          },
        },
      } as never),
    ).toBe(true);
  });

  it("returns false for a drop-league subscription invoice", () => {
    expect(
      membershipMarkerFromInvoice({
        id: "in_2",
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: {
            subscription: "sub_2",
            metadata: { type: "drop_subscription" },
          },
        },
      } as never),
    ).toBe(false);
  });

  it("falls back to the legacy top-level subscription_details.metadata", () => {
    expect(
      membershipMarkerFromInvoice({
        id: "in_3",
        subscription_details: { metadata: { type: "membership_subscription" } },
      } as never),
    ).toBe(true);
  });

  it("falls back to an expanded subscription object's metadata", () => {
    expect(
      membershipMarkerFromInvoice({
        id: "in_4",
        subscription: { id: "sub_4", metadata: { type: "drop_subscription" } },
      } as never),
    ).toBe(false);
  });

  it("returns null (undecidable → caller must retrieve) when no metadata rides the payload", () => {
    expect(
      membershipMarkerFromInvoice({ id: "in_5", subscription: "sub_5" } as never),
    ).toBeNull();
  });

  it("treats an EMPTY metadata snapshot as undecidable, not as 'not ours'", () => {
    expect(
      membershipMarkerFromInvoice({
        id: "in_6",
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: { subscription: "sub_6", metadata: {} },
        },
      } as never),
    ).toBeNull();
  });
});

// The LIVE prod webhook is pinned to API version 2026-04-22.dahlia, which
// moved the subscription reference off the invoice's top level. Every
// subscription-id read from an invoice must go through this helper —
// reading only the legacy top-level field silently no-ops on real prod
// payloads.
describe("subscriptionIdFromInvoice", () => {
  it("reads a dahlia-shape string subscription id", () => {
    expect(
      subscriptionIdFromInvoice({
        id: "in_1",
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: { subscription: "sub_1", metadata: null },
        },
      } as never),
    ).toBe("sub_1");
  });

  it("reads a dahlia-shape expanded subscription object", () => {
    expect(
      subscriptionIdFromInvoice({
        id: "in_2",
        parent: {
          type: "subscription_details",
          quote_details: null,
          subscription_details: {
            subscription: { id: "sub_2" },
            metadata: null,
          },
        },
      } as never),
    ).toBe("sub_2");
  });

  it("falls back to a legacy top-level string subscription id", () => {
    expect(
      subscriptionIdFromInvoice({ id: "in_3", subscription: "sub_3" } as never),
    ).toBe("sub_3");
  });

  it("falls back to a legacy top-level expanded subscription object", () => {
    expect(
      subscriptionIdFromInvoice({
        id: "in_4",
        subscription: { id: "sub_4" },
      } as never),
    ).toBe("sub_4");
  });

  it("returns null when neither shape carries a subscription", () => {
    expect(subscriptionIdFromInvoice({ id: "in_5" } as never)).toBeNull();
  });
});

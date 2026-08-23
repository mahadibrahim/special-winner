import { describe, it, expect } from "vitest";
import { invoiceToLedgerRow } from "@/lib/memberships/invoice-ledger";

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

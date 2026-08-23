import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextFeeDueAt, buildFeeInvoiceItemParams } from "@/lib/memberships/annual-fee";

describe("nextFeeDueAt", () => {
  it("advances one calendar year", () => {
    expect(nextFeeDueAt(new Date("2026-09-01T12:00:00Z")).toISOString()).toBe(
      "2027-09-01T12:00:00.000Z",
    );
  });
  it("handles Feb 29 → Feb 28", () => {
    expect(nextFeeDueAt(new Date("2028-02-29T00:00:00Z")).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});

describe("buildFeeInvoiceItemParams", () => {
  it("builds the pricing.price shape (not a top-level `price` field) + the membershipId:fee:year idempotency key", () => {
    const { params, idempotencyKey } = buildFeeInvoiceItemParams(
      {
        id: "mem-1",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        feeNextDueAt: new Date("2027-09-01T12:00:00Z"),
      },
      { stripePriceIdFee: "price_fee" },
    );
    expect(params).toEqual({
      customer: "cus_1",
      subscription: "sub_1",
      pricing: { price: "price_fee" },
    });
    expect(params).not.toHaveProperty("price");
    expect(idempotencyKey).toBe("mem-1:fee:2027");
  });
});

// ---- processDueAnnualFees (batch loop) ----
//
// getDb() and membershipsStripe() are mocked so the batch logic — per-row
// failure isolation, the exact invoiceItems.create call shape, and the
// fee-less-tier feeNextDueAt-clearing branch — is testable without a live
// DB or Stripe client. Same vi.mock("@/lib/db", ...) pattern as
// tests/unit/referee/referee-queries.test.ts; `./stripe` inside
// annual-fee.ts resolves to the same module as "@/lib/memberships/stripe"
// (precedent: tests/unit/stripe/membership-event-routing.test.ts mocks
// "@/lib/memberships/webhook-handlers" the same way).
let dueRows: Array<{ m: Record<string, unknown>; t: Record<string, unknown> }> = [];
let updateCalls: Array<{ values: Record<string, unknown> }> = [];
const invoiceItemsCreate = vi.fn();
const invoiceItemsList = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: async () => dueRows,
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updateCalls.push({ values });
        },
      }),
    }),
  }),
}));

vi.mock("@/lib/memberships/stripe", () => ({
  membershipsStripe: () => ({
    invoiceItems: { create: invoiceItemsCreate, list: invoiceItemsList },
  }),
}));

import { processDueAnnualFees, invoiceItemPriceId } from "@/lib/memberships/annual-fee";

describe("invoiceItemPriceId", () => {
  it("reads the current pricing.price_details.price shape (string)", () => {
    expect(
      invoiceItemPriceId({ pricing: { price_details: { price: "price_fee" } } } as never),
    ).toBe("price_fee");
  });
  it("reads an expanded price object", () => {
    expect(
      invoiceItemPriceId({
        pricing: { price_details: { price: { id: "price_fee" } } },
      } as never),
    ).toBe("price_fee");
  });
  it("falls back to the legacy top-level price object", () => {
    expect(invoiceItemPriceId({ price: { id: "price_fee" } } as never)).toBe("price_fee");
  });
  it("returns null for an amount-only invoice item (never matches a fee price)", () => {
    expect(invoiceItemPriceId({ amount: 5000 } as never)).toBeNull();
  });
});

describe("processDueAnnualFees", () => {
  beforeEach(() => {
    dueRows = [];
    updateCalls = [];
    invoiceItemsCreate.mockReset();
    invoiceItemsList.mockReset();
    // Default: nothing already queued on the customer.
    invoiceItemsList.mockResolvedValue({ data: [] });
  });

  it("creates an invoice item with the exact pricing.price shape + idempotency key, and advances feeNextDueAt via nextFeeDueAt", async () => {
    dueRows = [
      {
        m: {
          id: "mem-1",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          feeNextDueAt: new Date("2026-09-01T12:00:00Z"),
        },
        t: { annualFeeCents: 5000, stripePriceIdFee: "price_fee" },
      },
    ];
    invoiceItemsCreate.mockResolvedValue({ id: "ii_1" });

    const result = await processDueAnnualFees(new Date("2026-09-02T00:00:00Z"));

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(invoiceItemsCreate).toHaveBeenCalledExactlyOnceWith(
      {
        customer: "cus_1",
        subscription: "sub_1",
        pricing: { price: "price_fee" },
      },
      { idempotencyKey: "mem-1:fee:2026" },
    );
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].values.feeNextDueAt as Date).toISOString()).toBe(
      "2027-09-01T12:00:00.000Z",
    );
  });

  it("isolates a per-row Stripe failure: the batch continues and the second row still processes", async () => {
    dueRows = [
      {
        m: {
          id: "mem-fail",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          feeNextDueAt: new Date("2026-09-01T00:00:00Z"),
        },
        t: { annualFeeCents: 5000, stripePriceIdFee: "price_fee" },
      },
      {
        m: {
          id: "mem-ok",
          stripeCustomerId: "cus_2",
          stripeSubscriptionId: "sub_2",
          feeNextDueAt: new Date("2026-09-01T00:00:00Z"),
        },
        t: { annualFeeCents: 5000, stripePriceIdFee: "price_fee" },
      },
    ];
    invoiceItemsCreate
      .mockRejectedValueOnce(new Error("stripe down"))
      .mockResolvedValueOnce({ id: "ii_2" });

    const result = await processDueAnnualFees(new Date("2026-09-02T00:00:00Z"));

    expect(result).toEqual({ processed: 1, failed: 1 });
    expect(invoiceItemsCreate).toHaveBeenCalledTimes(2);
    // Only the successful row's feeNextDueAt is advanced — the failed row
    // stays due (and its idempotency key protects against double-billing
    // on the next run's retry).
    expect(updateCalls).toHaveLength(1);
  });

  // The Stripe idempotency key only covers ~24h; this cron runs daily, so a
  // run that created the item and then failed to advance feeNextDueAt would
  // retry with an expired key and double-bill. The pending-item check is the
  // cross-run guard.
  it("skips the create when a fee item for the same price is already pending, but still advances feeNextDueAt", async () => {
    dueRows = [
      {
        m: {
          id: "mem-1",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          feeNextDueAt: new Date("2026-09-01T12:00:00Z"),
        },
        t: { annualFeeCents: 5000, stripePriceIdFee: "price_fee" },
      },
    ];
    invoiceItemsList.mockResolvedValue({
      data: [{ id: "ii_prev", pricing: { price_details: { price: "price_fee" } } }],
    });

    const result = await processDueAnnualFees(new Date("2026-09-02T00:00:00Z"));

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(invoiceItemsList).toHaveBeenCalledExactlyOnceWith({
      customer: "cus_1",
      pending: true,
      limit: 100,
    });
    expect(invoiceItemsCreate).not.toHaveBeenCalled();
    // The step the crashed run never reached still happens.
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].values.feeNextDueAt as Date).toISOString()).toBe(
      "2027-09-01T12:00:00.000Z",
    );
  });

  it("still creates when the customer's pending items are for a DIFFERENT price", async () => {
    dueRows = [
      {
        m: {
          id: "mem-1",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          feeNextDueAt: new Date("2026-09-01T12:00:00Z"),
        },
        t: { annualFeeCents: 5000, stripePriceIdFee: "price_fee" },
      },
    ];
    invoiceItemsList.mockResolvedValue({
      data: [{ id: "ii_other", pricing: { price_details: { price: "price_something_else" } } }],
    });
    invoiceItemsCreate.mockResolvedValue({ id: "ii_1" });

    const result = await processDueAnnualFees(new Date("2026-09-02T00:00:00Z"));

    expect(result).toEqual({ processed: 1, failed: 0 });
    expect(invoiceItemsCreate).toHaveBeenCalledOnce();
  });

  it("clears feeNextDueAt (no invoice item, no throw) when the tier no longer has a fee configured", async () => {
    dueRows = [
      {
        m: {
          id: "mem-nofee",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
          feeNextDueAt: new Date("2026-09-01T00:00:00Z"),
        },
        t: { annualFeeCents: null, stripePriceIdFee: null },
      },
    ];

    const result = await processDueAnnualFees(new Date("2026-09-02T00:00:00Z"));

    expect(result).toEqual({ processed: 0, failed: 0 });
    expect(invoiceItemsCreate).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values.feeNextDueAt).toBeNull();
  });
});

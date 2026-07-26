/**
 * handleMerchOrderCompleted's pending -> paid transition must be an atomic
 * conditional UPDATE, not a select-then-update: Stripe can (and does)
 * redeliver checkout.session.completed for the same session, and two
 * concurrent deliveries that both read status="pending" before either writes
 * must not both go on to submit a print job. This mocks @/lib/db so the
 * fake "paid" claim can only be won once — modeling exactly the race the
 * WHERE ... AND status = 'pending' guard defends against — without requiring
 * a real Postgres instance for a true concurrency test (that part is left to
 * the API-level checkout/webhook tests, run against the dev server).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";

const orderRow = {
  id: "order-1",
  status: "pending",
  stripePaymentIntentId: null,
  totalCents: 1000,
  taxCents: 0,
};

// Only one concurrent "delivery" may win the atomic claim — mirrors a DB's
// WHERE status = 'pending' guard actually rejecting the loser's UPDATE.
let claimed = false;

const fakeDb = {
  select: (_cols?: unknown) => ({
    from: (table: unknown) => ({
      where: (_cond: unknown) => {
        if (table === merchOrders) return { limit: async () => [orderRow] };
        if (table === merchOrderItems) return Promise.resolve([{ fulfillmentType: "self_shipped" }]);
        return Promise.resolve([]);
      },
    }),
  }),
  update: (_table: unknown) => ({
    set: (_vals: unknown) => ({
      where: (_cond: unknown) => ({
        returning: async (_ret: unknown) => {
          if (claimed) return [];
          claimed = true;
          return [{ id: orderRow.id }];
        },
      }),
    }),
  }),
};

vi.mock("@/lib/db", () => ({ getDb: () => fakeDb }));

const sendMerchOrderConfirmation = vi.fn(async (_orderId: string) => {});
vi.mock("@/lib/merch/order-confirmation-email", () => ({
  sendMerchOrderConfirmation: (orderId: string) => sendMerchOrderConfirmation(orderId),
  sendMerchPickupConfirmation: vi.fn(async () => {}),
  sendMerchDigitalDelivery: vi.fn(async () => {}),
}));

const { handleMerchOrderCompleted } = await import("@/lib/merch/fulfillment");

const session = {
  id: "cs_test_1",
  metadata: { order_id: "order-1" },
  payment_intent: "pi_test_1",
  amount_total: 1000,
  total_details: { amount_tax: 0 },
};

describe("handleMerchOrderCompleted — concurrent webhook dedup", () => {
  beforeEach(() => {
    claimed = false;
    sendMerchOrderConfirmation.mockClear();
  });

  it("only one of two concurrent-delivery calls wins the pending->paid claim and proceeds to fulfillment", async () => {
    const [first, second] = await Promise.all([
      handleMerchOrderCompleted(session),
      handleMerchOrderCompleted(session),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(["already-processed", "processed-self-shipped"]);
    // Only the winner reaches the confirmation-email step — the loser bails
    // out immediately after losing the atomic claim.
    expect(sendMerchOrderConfirmation).toHaveBeenCalledTimes(1);
  });
});

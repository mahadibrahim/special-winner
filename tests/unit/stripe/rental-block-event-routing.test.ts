/**
 * The block payment path is two `checkout.session.completed` variants that
 * differ only by `metadata.type`. Getting that routing wrong is silent - the
 * money lands, the dispatcher logs "unrecognized metadata.type", and the block
 * never confirms - so pin it here, where it runs without a DB or Stripe.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ledger DB so claimStripeEvent reports "first delivery" and dispatch runs.
vi.mock("@/lib/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: async () => [{ id: "evt_1" }] }),
      }),
    }),
    delete: () => ({ where: async () => undefined }),
  }),
}));

// Telemetry is fire-and-forget; stub it so no PostHog calls happen in CI.
vi.mock("@/lib/observability/webhook-telemetry", () => ({
  captureWebhookOutcome: vi.fn(),
  captureWebhookException: vi.fn(),
}));

vi.mock("@/lib/stripe/handle-rental-block-deposit-complete", () => ({
  handleRentalBlockDepositComplete: vi.fn(async () => ({
    status: "processed",
    blockId: "b_1",
    paidCents: 70_200,
  })),
}));

vi.mock("@/lib/stripe/handle-rental-block-balance-complete", () => ({
  handleRentalBlockBalanceComplete: vi.fn(async () => ({
    status: "processed",
    blockId: "b_1",
    paidCents: 210_600,
  })),
}));

// The field-rental handler shares the same event type and must NOT be reached
// by block metadata - it would confirm one session and ignore the block.
vi.mock("@/lib/stripe/handle-field-rental-checkout-complete", () => ({
  handleFieldRentalCheckoutComplete: vi.fn(async () => ({
    status: "skipped",
    reason: "test",
  })),
}));

import { handleStripeEvent } from "@/lib/stripe/handle-stripe-event";
import { handleRentalBlockDepositComplete } from "@/lib/stripe/handle-rental-block-deposit-complete";
import { handleRentalBlockBalanceComplete } from "@/lib/stripe/handle-rental-block-balance-complete";
import { handleFieldRentalCheckoutComplete } from "@/lib/stripe/handle-field-rental-checkout-complete";

/** Minimal Stripe.Event shape - only the fields dispatch reads. */
function evt(type: string, object: unknown, id = `e_${Math.random().toString(36).slice(2)}`) {
  return { id, type, data: { object } } as never;
}

describe("handleStripeEvent - rental block payments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes rental_block_deposit to the deposit handler", async () => {
    const session = {
      id: "cs_dep",
      metadata: { type: "rental_block_deposit", block_id: "b_1" },
    };
    await handleStripeEvent(evt("checkout.session.completed", session));
    expect(handleRentalBlockDepositComplete).toHaveBeenCalledWith(session);
    expect(handleRentalBlockBalanceComplete).not.toHaveBeenCalled();
    expect(handleFieldRentalCheckoutComplete).not.toHaveBeenCalled();
  });

  it("routes rental_block_balance to the balance handler", async () => {
    const session = {
      id: "cs_bal",
      metadata: { type: "rental_block_balance", block_id: "b_1" },
    };
    await handleStripeEvent(evt("checkout.session.completed", session));
    expect(handleRentalBlockBalanceComplete).toHaveBeenCalledWith(session);
    expect(handleRentalBlockDepositComplete).not.toHaveBeenCalled();
    expect(handleFieldRentalCheckoutComplete).not.toHaveBeenCalled();
  });

  it("leaves a single-session field_rental on its own handler", async () => {
    const session = { id: "cs_fr", metadata: { type: "field_rental", rental_id: "r_1" } };
    await handleStripeEvent(evt("checkout.session.completed", session));
    expect(handleFieldRentalCheckoutComplete).toHaveBeenCalledWith(session);
    expect(handleRentalBlockDepositComplete).not.toHaveBeenCalled();
    expect(handleRentalBlockBalanceComplete).not.toHaveBeenCalled();
  });

  it("ignores an unrecognized metadata.type without touching a block handler", async () => {
    await handleStripeEvent(
      evt("checkout.session.completed", { id: "cs_x", metadata: { type: "who_knows" } }),
    );
    expect(handleRentalBlockDepositComplete).not.toHaveBeenCalled();
    expect(handleRentalBlockBalanceComplete).not.toHaveBeenCalled();
  });
});

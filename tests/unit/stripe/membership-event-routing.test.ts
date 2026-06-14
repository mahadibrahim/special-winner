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

// The shared membership handlers — assert the platform dispatcher routes to them.
vi.mock("@/lib/memberships/webhook-handlers", () => ({
  handleCheckoutSessionCompleted: vi.fn(async () => undefined),
  handleSubscriptionUpdated: vi.fn(async () => undefined),
  handleSubscriptionDeleted: vi.fn(async () => undefined),
  handleInvoicePaymentFailed: vi.fn(async () => undefined),
}));

// Drop-league handlers are fanned out in the SAME platform dispatch cases
// (subscription + invoice events share one event stream). Mock them so this
// routing test doesn't execute their real DB writes — this suite asserts
// membership routing only. Without this, handleDropSubscriptionUpdated runs for
// real and calls db.update (which the minimal db mock above doesn't provide).
vi.mock("@/lib/drop-league/webhook-handlers", () => ({
  handleDropCheckoutCompleted: vi.fn(async () => undefined),
  handleDropSubscriptionUpdated: vi.fn(async () => undefined),
  handleDropSubscriptionDeleted: vi.fn(async () => undefined),
  handleDropInvoicePaymentFailed: vi.fn(async () => undefined),
}));

import { handleStripeEvent } from "@/lib/stripe/handle-stripe-event";
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaymentFailed,
} from "@/lib/memberships/webhook-handlers";

// Minimal Stripe.Event shape — only the fields dispatch reads.
function evt(type: string, object: unknown, id = `e_${Math.random().toString(36).slice(2)}`) {
  return { id, type, data: { object } } as never;
}

describe("handleStripeEvent — membership events on the PLATFORM endpoint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes a membership_subscription checkout.session.completed to the membership handler", async () => {
    const session = { id: "cs_1", mode: "subscription", metadata: { type: "membership_subscription" } };
    await handleStripeEvent(evt("checkout.session.completed", session));
    expect(handleCheckoutSessionCompleted).toHaveBeenCalledWith(session);
  });

  it("does NOT route a dropin checkout.session.completed to the membership handler", async () => {
    const session = { id: "cs_2", metadata: { type: "dropin_booking" } };
    await handleStripeEvent(evt("checkout.session.completed", session));
    expect(handleCheckoutSessionCompleted).not.toHaveBeenCalled();
  });

  it("routes customer.subscription.updated to handleSubscriptionUpdated", async () => {
    const sub = { id: "sub_1", status: "active" };
    await handleStripeEvent(evt("customer.subscription.updated", sub));
    expect(handleSubscriptionUpdated).toHaveBeenCalledWith(sub);
  });

  it("routes customer.subscription.created to handleSubscriptionUpdated", async () => {
    const sub = { id: "sub_2", status: "active" };
    await handleStripeEvent(evt("customer.subscription.created", sub));
    expect(handleSubscriptionUpdated).toHaveBeenCalledWith(sub);
  });

  it("routes customer.subscription.deleted to handleSubscriptionDeleted", async () => {
    const sub = { id: "sub_3" };
    await handleStripeEvent(evt("customer.subscription.deleted", sub));
    expect(handleSubscriptionDeleted).toHaveBeenCalledWith(sub);
  });

  it("routes invoice.payment_failed to handleInvoicePaymentFailed", async () => {
    const invoice = { id: "in_1", subscription: "sub_4" };
    await handleStripeEvent(evt("invoice.payment_failed", invoice));
    expect(handleInvoicePaymentFailed).toHaveBeenCalledWith(invoice);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendPurchaseEvent } from "@/lib/analytics/ga4-measurement-protocol";

const baseInput = {
  clientId: "1234567890.0987654321",
  transactionId: "pi_test_abc",
  valueCents: 7500,
  currency: "USD" as const,
  items: [
    {
      id: "season-1",
      name: "Summer Soccer - Worthington 2026",
      category: "Soccer",
      priceCents: 25000,
    },
  ],
  paymentType: "deposit" as const,
  coupon: "EARLYBIRD",
};

describe("sendPurchaseEvent", () => {
  beforeEach(() => {
    process.env.GA4_MEASUREMENT_ID = "G-TEST123";
    process.env.GA4_API_SECRET = "secret-test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  });

  afterEach(() => {
    delete process.env.GA4_MEASUREMENT_ID;
    delete process.env.GA4_API_SECRET;
    vi.unstubAllGlobals();
  });

  it("POSTs to mp/collect with correctly shaped body", async () => {
    await sendPurchaseEvent(baseInput);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe(
      "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=secret-test",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      client_id: "1234567890.0987654321",
      events: [
        {
          name: "purchase",
          params: {
            transaction_id: "pi_test_abc",
            value: 75,
            currency: "USD",
            payment_type: "deposit",
            coupon: "EARLYBIRD",
            items: [
              {
                item_id: "season-1",
                item_name: "Summer Soccer - Worthington 2026",
                item_category: "Soccer",
                price: 250,
                quantity: 1,
              },
            ],
          },
        },
      ],
    });
  });

  it("short-circuits when GA4_MEASUREMENT_ID is unset", async () => {
    delete process.env.GA4_MEASUREMENT_ID;
    await sendPurchaseEvent(baseInput);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("short-circuits when GA4_API_SECRET is unset", async () => {
    delete process.env.GA4_API_SECRET;
    await sendPurchaseEvent(baseInput);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("soft-fails on network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ENOTFOUND"); }));
    await expect(sendPurchaseEvent(baseInput)).resolves.toBeUndefined();
  });

  it("soft-fails on non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad", { status: 400 })));
    await expect(sendPurchaseEvent(baseInput)).resolves.toBeUndefined();
  });
});

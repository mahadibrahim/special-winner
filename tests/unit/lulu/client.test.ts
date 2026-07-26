import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import {
  isLuluConfigured, calculatePrintJobCost, createPrintJob, getPrintJob,
} from "@/lib/lulu/client";

const address = {
  name: "Test Buyer", street1: "123 Test St", city: "Columbus",
  stateCode: "OH", postcode: "43085", countryCode: "US",
};
const line = { podPackageId: "0600X0900BWSTDPB060UW444MXX", pageCount: 40, quantity: 2 };

describe("lulu client (LULU_MOCK)", () => {
  beforeAll(() => { process.env.LULU_MOCK = "1"; });

  it("isLuluConfigured true under mock", () => {
    expect(isLuluConfigured()).toBe(true);
  });
  it("cost calc returns per-level shipping cents and quantity-scaled print cents", async () => {
    const mail = await calculatePrintJobCost({ lineItems: [line], address, level: "MAIL" });
    const express = await calculatePrintJobCost({ lineItems: [line], address, level: "EXPRESS" });
    expect(mail.shippingCents).toBe(399);
    expect(express.shippingCents).toBe(2499);
    expect(mail.printCents).toBe(700 * 2);
  });
  it("createPrintJob echoes a deterministic mock id", async () => {
    const job = await createPrintJob({
      externalId: "order-1", contactEmail: "b@x.com",
      lineItems: [{ ...line, title: "Guide", interiorUrl: "https://x/i.pdf", coverUrl: "https://x/c.pdf" }],
      address, level: "MAIL",
    });
    expect(job.id).toBe("mock-lulu-order-1");
    expect(job.status).toBe("CREATED");
  });
  it("getPrintJob reports SHIPPED with tracking under mock", async () => {
    const job = await getPrintJob("mock-lulu-order-1");
    expect(job.status).toBe("SHIPPED");
    expect(job.tracking.trackingId).toBe("MOCK-TRACK-123");
    expect(job.tracking.carrier).toBe("USPS");
  });
});

describe("lulu client (401 retry, live API)", () => {
  let fetchCount = 0;
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchCount = 0;
    // Disable mock to force luluFetch code path
    process.env.LULU_MOCK = "";
    // Set dummy credentials so getToken() doesn't throw
    process.env.LULU_CLIENT_KEY = "test-key";
    process.env.LULU_CLIENT_SECRET = "test-secret";
    process.env.LULU_API_BASE = "https://api.sandbox.lulu.com";

    // Stub fetch: first call returns 401 (token refresh), second returns 200
    global.fetch = vi.fn(async (url, opts) => {
      fetchCount++;
      // Token endpoint always succeeds
      if (url?.toString().includes("/token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "test-token", expires_in: 3600 }),
        } as unknown as Response;
      }
      // First API call: 401 (stale token)
      if (fetchCount === 2) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({}),
        } as unknown as Response;
      }
      // Retry (fetchCount === 3) or later: 200 success
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "test-job-id", status: { name: "CREATED" } }),
      } as unknown as Response;
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.LULU_MOCK = "1";
    delete process.env.LULU_CLIENT_KEY;
    delete process.env.LULU_CLIENT_SECRET;
    delete process.env.LULU_API_BASE;
  });

  it("retries once on 401 and succeeds with fresh token", async () => {
    const job = await createPrintJob({
      externalId: "retry-test",
      contactEmail: "test@example.com",
      lineItems: [{
        podPackageId: "0600X0900BWSTDPB060UW444MXX",
        pageCount: 40,
        quantity: 1,
        title: "Test",
        interiorUrl: "https://example.com/i.pdf",
        coverUrl: "https://example.com/c.pdf",
      }],
      address: {
        name: "Test", street1: "123 St", city: "City",
        stateCode: "ST", postcode: "12345", countryCode: "US",
      },
      level: "MAIL",
    });
    // Token fetch (1) + initial API call 401 (2) + token fetch (3) + retry 200 (4)
    expect(fetchCount).toBe(4);
    expect(job.id).toBe("test-job-id");
    expect(job.status).toBe("CREATED");
  });
});

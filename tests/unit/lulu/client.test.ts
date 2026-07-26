import { describe, it, expect, beforeAll } from "vitest";
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

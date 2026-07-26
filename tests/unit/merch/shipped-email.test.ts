import { describe, it, expect } from "vitest";
import { buildShippedEmailHtml } from "@/lib/merch/order-confirmation-email";

describe("buildShippedEmailHtml", () => {
  it("includes the tracking number and a linked tracking URL", () => {
    const html = buildShippedEmailHtml({
      productRows: "<tr><td>Hoodie Black · M × 1</td><td>$46.50</td></tr>",
      carrier: "USPS",
      service: "Priority Mail",
      trackingNumber: "9400111899223197428431",
      trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428431",
    });
    expect(html).toContain("9400111899223197428431");
    expect(html).toContain(`<a href="https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428431">9400111899223197428431</a>`);
    expect(html).toContain("USPS");
    expect(html).toContain("Priority Mail");
    expect(html).toContain("Hoodie Black · M × 1");
  });

  it("shows a plain (unlinked) tracking number when no tracking URL is available", () => {
    const html = buildShippedEmailHtml({
      productRows: "<tr><td>Hoodie × 1</td></tr>",
      trackingNumber: "ABC123",
      trackingUrl: null,
    });
    expect(html).toContain("ABC123");
    expect(html).not.toContain("<a href=");
  });
});

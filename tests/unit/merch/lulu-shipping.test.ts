import { describe, it, expect, beforeAll } from "vitest";
import { resolveLuluShippingOptions, pickLuluOption } from "@/lib/merch/lulu-shipping";

const address = { name: "B", address1: "1 St", city: "Columbus", state: "OH", zip: "43085", country: "US" };
const bookLine = { luluPodPackageId: "0600X0900BWSTDPB060UW444MXX", luluPageCount: 40, quantity: 1, productName: "Guide" };

describe("resolveLuluShippingOptions (LULU_MOCK)", () => {
  beforeAll(() => { process.env.LULU_MOCK = "1"; });

  it("returns all 5 levels sorted cheapest-first with labels", async () => {
    const r = await resolveLuluShippingOptions(address, [bookLine]);
    if (!r.ok) throw new Error(r.error);
    expect(r.options.map((o) => o.level)).toEqual(["MAIL", "GROUND", "PRIORITY_MAIL", "EXPEDITED", "EXPRESS"]);
    expect(r.options[0]).toEqual({ level: "MAIL", label: "Mail", amountCents: 399 });
  });

  it("422s a book line missing its package id or page count", async () => {
    const r = await resolveLuluShippingOptions(address, [{ ...bookLine, luluPageCount: null }]);
    expect(r).toMatchObject({ ok: false, status: 422 });
  });
});

describe("pickLuluOption", () => {
  const opts = [
    { level: "MAIL" as const, label: "Mail", amountCents: 399 },
    { level: "EXPRESS" as const, label: "Express", amountCents: 2499 },
  ];
  it("defaults to cheapest (first)", () => {
    expect(pickLuluOption(opts, null)?.level).toBe("MAIL");
  });
  it("honors a named level", () => {
    expect(pickLuluOption(opts, "EXPRESS")?.amountCents).toBe(2499);
  });
  it("null for an unavailable level", () => {
    expect(pickLuluOption(opts, "GROUND")).toBeNull();
  });
});

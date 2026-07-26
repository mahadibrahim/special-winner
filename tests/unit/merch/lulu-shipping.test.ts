import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import type { Mock } from "vitest";
import { resolveLuluShippingOptions, pickLuluOption, toLuluAddress } from "@/lib/merch/lulu-shipping";
import { calculatePrintJobCost, LuluApiError } from "@/lib/lulu/client";

// Partial mock: keep the real isLuluConfigured()/LuluApiError (resolveLuluShippingOptions
// does `e instanceof LuluApiError`, so it must stay the real class), but wrap
// calculatePrintJobCost in a vi.fn so individual tests can force per-level
// failures without hitting the network. Default implementation delegates to
// the real (LULU_MOCK-aware) function, so unrelated tests are unaffected.
vi.mock("@/lib/lulu/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lulu/client")>();
  return { ...actual, calculatePrintJobCost: vi.fn(actual.calculatePrintJobCost) };
});

const mockedCalculatePrintJobCost = calculatePrintJobCost as unknown as Mock;

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

describe("resolveLuluShippingOptions (unconfigured)", () => {
  it("503s when Lulu isn't configured (mock off, no creds)", async () => {
    const prev = {
      mock: process.env.LULU_MOCK,
      key: process.env.LULU_CLIENT_KEY,
      secret: process.env.LULU_CLIENT_SECRET,
    };
    delete process.env.LULU_MOCK;
    delete process.env.LULU_CLIENT_KEY;
    delete process.env.LULU_CLIENT_SECRET;
    try {
      const r = await resolveLuluShippingOptions(address, [bookLine]);
      expect(r).toEqual({ ok: false, status: 503, error: "Shipping unavailable" });
    } finally {
      // Restore exactly what was there before (the LULU_MOCK describe above
      // sets it to "1" via beforeAll and later tests in this file rely on it).
      if (prev.mock === undefined) delete process.env.LULU_MOCK; else process.env.LULU_MOCK = prev.mock;
      if (prev.key === undefined) delete process.env.LULU_CLIENT_KEY; else process.env.LULU_CLIENT_KEY = prev.key;
      if (prev.secret === undefined) delete process.env.LULU_CLIENT_SECRET; else process.env.LULU_CLIENT_SECRET = prev.secret;
    }
  });
});

describe("resolveLuluShippingOptions (Lulu API failures, LULU_MOCK)", () => {
  beforeAll(() => { process.env.LULU_MOCK = "1"; });
  afterEach(() => { mockedCalculatePrintJobCost.mockClear(); });

  it("422s when every shipping level is rejected for the address", async () => {
    // One rejection queued per LULU_SHIPPING_LEVELS entry (5) — the loop
    // calls calculatePrintJobCost once per level, in order.
    mockedCalculatePrintJobCost
      .mockRejectedValueOnce(new LuluApiError(422, "no service"))
      .mockRejectedValueOnce(new LuluApiError(422, "no service"))
      .mockRejectedValueOnce(new LuluApiError(422, "no service"))
      .mockRejectedValueOnce(new LuluApiError(422, "no service"))
      .mockRejectedValueOnce(new LuluApiError(422, "no service"));
    const r = await resolveLuluShippingOptions(address, [bookLine]);
    expect(r).toEqual({ ok: false, status: 422, error: "We can't ship to that address" });
  });

  it("rethrows a non-LuluApiError instead of treating it as an unshippable level", async () => {
    mockedCalculatePrintJobCost.mockRejectedValueOnce(new Error("network down"));
    await expect(resolveLuluShippingOptions(address, [bookLine])).rejects.toThrow("network down");
  });

  it("omits a level whose cost response has non-positive shipping (malformed 200), keeping the rest", async () => {
    // First call is MAIL (LULU_SHIPPING_LEVELS[0]) — force a malformed-but-200
    // response (missing shipping_cost.total_cost_incl_tax collapses to 0
    // cents in the client). The other 4 levels fall through to the real
    // LULU_MOCK implementation and must still come back.
    mockedCalculatePrintJobCost.mockImplementationOnce(async () => ({ shippingCents: 0, printCents: 700 }));
    const r = await resolveLuluShippingOptions(address, [bookLine]);
    if (!r.ok) throw new Error(r.error);
    expect(r.options.map((o) => o.level)).not.toContain("MAIL");
    expect(r.options).toHaveLength(4);
  });

  it("422s when every shipping level returns non-positive shipping (malformed 200s)", async () => {
    mockedCalculatePrintJobCost
      .mockImplementationOnce(async () => ({ shippingCents: 0, printCents: 700 }))
      .mockImplementationOnce(async () => ({ shippingCents: 0, printCents: 700 }))
      .mockImplementationOnce(async () => ({ shippingCents: 0, printCents: 700 }))
      .mockImplementationOnce(async () => ({ shippingCents: 0, printCents: 700 }))
      .mockImplementationOnce(async () => ({ shippingCents: 0, printCents: 700 }));
    const r = await resolveLuluShippingOptions(address, [bookLine]);
    expect(r).toEqual({ ok: false, status: 422, error: "We can't ship to that address" });
  });
});

describe("toLuluAddress", () => {
  afterEach(() => { delete process.env.LULU_CONTACT_PHONE; });

  it("carries LULU_CONTACT_PHONE as phoneNumber when set", () => {
    process.env.LULU_CONTACT_PHONE = "+16145551234";
    expect(toLuluAddress(address).phoneNumber).toBe("+16145551234");
  });

  it("phoneNumber is null when LULU_CONTACT_PHONE is unset", () => {
    delete process.env.LULU_CONTACT_PHONE;
    expect(toLuluAddress(address).phoneNumber).toBeNull();
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

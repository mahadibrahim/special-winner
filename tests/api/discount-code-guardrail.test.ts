/**
 * Discount-code sanity guardrail (2026-08-04 incident: "$25 off" stored as
 * $2,500 and zeroed a paid registration).
 *
 * - fixed_amount discounts exceeding the org's most expensive offering → 400
 *   with a units hint, on both create and update
 * - sane fixed discounts and percentage discounts still work
 * - GET round-trips human dollars (the UI double-divide is fixed client-side;
 *   this pins the API contract the UI now trusts verbatim)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { discountCodes } from "@/lib/db/schema";
import { apiFetch, getAdminCookie } from "./setup/test-helpers";

let cookie: string;
const createdIds: string[] = [];
const CODE_PREFIX = "GUARDTEST";

beforeAll(async () => {
  cookie = await getAdminCookie();
});

afterAll(async () => {
  if (createdIds.length) {
    await getDb().delete(discountCodes).where(inArray(discountCodes.id, createdIds));
  }
});

async function createCode(body: Record<string, unknown>) {
  return apiFetch("/api/admin/discount-codes", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("fixed-amount discount guardrail", () => {
  it("rejects a fixed discount exceeding the most expensive offering", async () => {
    const res = await createCode({
      code: `${CODE_PREFIX}HUGE`,
      discountType: "fixed_amount",
      discountValue: 2500, // dollars — the exact cents-passed-as-dollars mistake
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/exceeds your most expensive offering/i);
    expect(json.error).toMatch(/dollars/i);
  });

  it("accepts a sane fixed discount and round-trips dollars on GET", async () => {
    const res = await createCode({
      code: `${CODE_PREFIX}OK`,
      discountType: "fixed_amount",
      discountValue: 25,
    });
    expect(res.status).toBe(201);
    const { discountCode } = await res.json();
    createdIds.push(discountCode.id);

    const list = await apiFetch("/api/admin/discount-codes", { headers: { cookie } });
    const mine = (await list.json()).discountCodes.find(
      (c: { id: string }) => c.id === discountCode.id,
    );
    // Human dollars in, human dollars out — the admin UI renders this
    // value verbatim now (no client-side /100).
    expect(mine.discountValue).toBe(25);
  });

  it("still accepts percentage discounts unaffected by the price cap", async () => {
    const res = await createCode({
      code: `${CODE_PREFIX}PCT`,
      discountType: "percentage",
      discountValue: 100, // 100% comp — legitimate
    });
    expect(res.status).toBe(201);
    createdIds.push((await res.json()).discountCode.id);
  });

  it("rejects the oversized value on update too", async () => {
    const create = await createCode({
      code: `${CODE_PREFIX}UPD`,
      discountType: "fixed_amount",
      discountValue: 25,
    });
    expect(create.status).toBe(201);
    const { discountCode } = await create.json();
    createdIds.push(discountCode.id);

    const update = await apiFetch("/api/admin/discount-codes", {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: discountCode.id,
        code: `${CODE_PREFIX}UPD`,
        discountType: "fixed_amount",
        discountValue: 2500,
      }),
    });
    expect(update.status).toBe(400);
    expect((await update.json()).error).toMatch(/exceeds your most expensive offering/i);
  });
});

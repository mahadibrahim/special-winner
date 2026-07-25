import { describe, it, expect } from "vitest";
import { syncMerchCatalog } from "@/lib/merch/sync";

describe("syncMerchCatalog signature", () => {
  it("requires an org name (arity 2)", () => {
    expect(syncMerchCatalog.length).toBe(2);
  });
});

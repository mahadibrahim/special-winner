import { describe, it, expect } from "vitest";
import { actionForLuluStatus } from "@/lib/merch/lulu-status";

describe("actionForLuluStatus", () => {
  it("ships on SHIPPED", () => expect(actionForLuluStatus("SHIPPED")).toBe("ship"));
  it("fails on REJECTED and CANCELED", () => {
    expect(actionForLuluStatus("REJECTED")).toBe("fail");
    expect(actionForLuluStatus("CANCELED")).toBe("fail");
  });
  it("waits on every in-flight status", () => {
    for (const s of ["CREATED", "UNPAID", "PAYMENT_IN_PROGRESS", "PRODUCTION_DELAYED", "PRODUCTION_READY", "IN_PRODUCTION", "UNKNOWN"]) {
      expect(actionForLuluStatus(s)).toBe("wait");
    }
  });
});

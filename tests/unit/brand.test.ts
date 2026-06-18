import { describe, it, expect } from "vitest";
import { brandFromDataAttr } from "@/lib/dashboard/brand";

describe("brandFromDataAttr", () => {
  it("returns soccerone only for the exact attribute value", () => {
    expect(brandFromDataAttr("soccerone")).toBe("soccerone");
  });
  it("defaults to aspire for null / unknown values", () => {
    expect(brandFromDataAttr(null)).toBe("aspire");
    expect(brandFromDataAttr("")).toBe("aspire");
    expect(brandFromDataAttr("aspire")).toBe("aspire");
    expect(brandFromDataAttr("SoccerOne")).toBe("aspire");
  });
});

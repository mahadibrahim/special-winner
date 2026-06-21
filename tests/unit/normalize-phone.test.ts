import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/venue/normalize-phone";

describe("normalizePhone", () => {
  it("strips formatting to digits", () => {
    expect(normalizePhone("(614) 555-0142")).toBe("6145550142");
  });
  it("drops a leading US country code", () => {
    expect(normalizePhone("+1 614 555 0142")).toBe("6145550142");
  });
  it("returns empty for no digits", () => {
    expect(normalizePhone("nope")).toBe("");
  });
});

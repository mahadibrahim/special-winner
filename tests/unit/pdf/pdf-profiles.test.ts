import { describe, expect, it } from "vitest";
import { PROFILES, profileFor, spineWidthInches } from "../../../scripts/pdf-profiles";

describe("pdf profiles", () => {
  it("letter profile keeps the existing Letter format", () => {
    expect(PROFILES["letter"].pdfOptions.format).toBe("Letter");
    expect(PROFILES["letter"].waitForPaged).toBe(false);
  });
  it("kdp-6x9 uses explicit trim size, CSS page size, and paged.js", () => {
    const p = profileFor("kdp-6x9");
    expect(p.pdfOptions.width).toBe("6in");
    expect(p.pdfOptions.height).toBe("9in");
    expect(p.pdfOptions.preferCSSPageSize).toBe(true);
    expect(p.waitForPaged).toBe(true);
  });
  it("throws on unknown profile", () => {
    expect(() => profileFor("a4")).toThrow(/unknown pdf profile/i);
  });
  it("computes KDP white-paper spine width", () => {
    expect(spineWidthInches(120)).toBeCloseTo(0.27024, 5);
  });
});

import { describe, it, expect } from "vitest";
import { toCsvRow } from "@/lib/csv/to-csv-row";

describe("toCsvRow", () => {
  it("joins plain fields with commas", () => {
    expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
  });

  it("quotes fields containing commas", () => {
    expect(toCsvRow(["a", "b,c", "d"])).toBe('a,"b,c",d');
  });

  it("doubles embedded quotes inside quoted fields", () => {
    expect(toCsvRow(['he said "hi"'])).toBe('"he said ""hi"""');
  });

  it("quotes fields containing newlines", () => {
    expect(toCsvRow(["a\nb"])).toBe('"a\nb"');
  });

  it("renders nulls and undefineds as empty strings", () => {
    expect(toCsvRow(["a", null, undefined, "b"])).toBe("a,,,b");
  });

  it("coerces numbers to strings without quoting", () => {
    expect(toCsvRow([1, 2.5, 0])).toBe("1,2.5,0");
  });

  it("renders Date as ISO string", () => {
    const d = new Date("2026-01-15T10:00:00Z");
    expect(toCsvRow([d])).toBe("2026-01-15T10:00:00.000Z");
  });
});

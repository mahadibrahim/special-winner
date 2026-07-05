import { describe, expect, it } from "vitest";
import { provenanceHeader, parseProvenance } from "@/lib/curriculum/provenance";

describe("provenance", () => {
  it("round-trips through a TS header", () => {
    const text = provenanceHeader("abc1234") + "export const x = 1;\n";
    expect(parseProvenance(text)).toBe("abc1234");
  });
  it("parses an HTML/astro comment form", () => {
    expect(parseProvenance("<!-- generated-from: deadbeef1 -->\n<html>")).toBe("deadbeef1");
  });
  it("returns null when absent", () => {
    expect(parseProvenance("export const x = 1;")).toBeNull();
  });
});

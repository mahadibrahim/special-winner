import { describe, it, expect } from "vitest";
import { LULU_FORMATS, podPackageIdForFormat, isLuluFormat } from "@/lib/lulu/formats";

describe("lulu formats", () => {
  it("maps both curated formats to 6x9 package ids", () => {
    expect(podPackageIdForFormat("6x9_bw")).toBe("0600X0900BWSTDPB060UW444MXX");
    expect(podPackageIdForFormat("6x9_color")).toBe("0600X0900FCSTDPB060UW444MXX");
  });
  it("labels are buyer-readable", () => {
    expect(LULU_FORMATS["6x9_bw"].label).toMatch(/black\s*&\s*white/i);
    expect(LULU_FORMATS["6x9_color"].label).toMatch(/color/i);
  });
  it("isLuluFormat guards unknown strings", () => {
    expect(isLuluFormat("6x9_bw")).toBe(true);
    expect(isLuluFormat("a4_glossy")).toBe(false);
  });
});

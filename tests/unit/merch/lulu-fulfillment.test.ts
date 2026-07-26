import { describe, it, expect } from "vitest";
import { buildLuluPrintJobLines } from "@/lib/merch/lulu-fulfillment";

const line = {
  productName: "Guide", quantity: 2,
  luluPodPackageId: "0600X0900BWSTDPB060UW444MXX", luluPageCount: 40,
  interiorUrl: "https://signed/i.pdf", coverUrl: "https://signed/c.pdf",
};

describe("buildLuluPrintJobLines", () => {
  it("maps order lines to print-job line items", () => {
    expect(buildLuluPrintJobLines([line])).toEqual([{
      title: "Guide", quantity: 2,
      podPackageId: "0600X0900BWSTDPB060UW444MXX", pageCount: 40,
      interiorUrl: "https://signed/i.pdf", coverUrl: "https://signed/c.pdf",
    }]);
  });
  it("throws loudly on a line missing book config", () => {
    expect(() => buildLuluPrintJobLines([{ ...line, luluPageCount: null }])).toThrow(/Guide/);
  });
});

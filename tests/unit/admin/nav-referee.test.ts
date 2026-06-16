import { describe, it, expect } from "vitest";
import { REFEREE_NAV } from "@/lib/admin/nav-referee";

const hrefs = REFEREE_NAV.flatMap((g) => g.items.map((i) => i.href));

describe("REFEREE_NAV", () => {
  it("has My matches and Pay", () => {
    expect(hrefs).toContain("/referee");
    expect(hrefs).toContain("/referee/pay");
  });
  it("My matches carries the reportsOwed badge", () => {
    const item = REFEREE_NAV.flatMap((g) => g.items).find((i) => i.href === "/referee");
    expect(item?.badgeKey).toBe("reportsOwed");
  });
});

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { VENUE_MANAGER_NAV } from "@/lib/admin/nav-venue-manager";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const hrefs = VENUE_MANAGER_NAV.flatMap((g) => g.items.map((i) => i.href));

function resolves(href: string): boolean {
  if (href === "/messages") return true;
  return (
    existsSync(path.join(PAGES, href.replace(/^\//, "") + ".astro")) ||
    existsSync(path.join(PAGES, href.replace(/^\//, ""), "index.astro"))
  );
}

describe("VENUE_MANAGER_NAV", () => {
  it("every href resolves to a real page", () => {
    expect(hrefs.filter((h) => !resolves(h))).toEqual([]);
  });
  it("has labeled groups", () => {
    const names = VENUE_MANAGER_NAV.map((g) => g.name);
    for (const g of ["Front desk", "Casual play", "People", "Comms", "Requests", "Reports"]) {
      expect(names).toContain(g);
    }
  });
  it("Refund requests carries the refundsPending badge", () => {
    const item = VENUE_MANAGER_NAV.flatMap((g) => g.items).find((i) => i.href === "/admin/refund-requests");
    expect(item?.badgeKey).toBe("refundsPending");
  });
});

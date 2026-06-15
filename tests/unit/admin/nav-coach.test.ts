import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COACH_NAV } from "@/lib/admin/nav-coach";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const hrefs = COACH_NAV.flatMap((g) => g.items.map((i) => i.href));

function resolves(href: string): boolean {
  if (href === "/messages") return true;
  return (
    existsSync(path.join(PAGES, href.replace(/^\//, "") + ".astro")) ||
    existsSync(path.join(PAGES, href.replace(/^\//, ""), "index.astro"))
  );
}

describe("COACH_NAV", () => {
  it("every href resolves to a real page", () => {
    expect(hrefs.filter((h) => !resolves(h))).toEqual([]);
  });
  it("has labeled groups", () => {
    const names = COACH_NAV.map((g) => g.name);
    for (const g of ["Teams", "Coaching", "Season", "Comms"]) {
      expect(names).toContain(g);
    }
  });
  it("Messages carries the inbox badge", () => {
    const item = COACH_NAV.flatMap((g) => g.items).find((i) => i.href === "/coach/messages");
    expect(item?.badgeKey).toBe("inbox");
  });
});

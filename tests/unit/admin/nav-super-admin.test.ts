import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { SUPER_ADMIN_NAV } from "@/lib/admin/nav-super-admin";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const hrefs = SUPER_ADMIN_NAV.flatMap((g) => g.items.map((i) => i.href));

function routeResolves(href: string): boolean {
  if (href === "/messages") return true;
  const a = path.join(PAGES, href.replace(/^\//, "") + ".astro");
  const b = path.join(PAGES, href.replace(/^\//, ""), "index.astro");
  return existsSync(a) || existsSync(b);
}

describe("SUPER_ADMIN_NAV", () => {
  it("every nav href resolves to a real page (no dead links)", () => {
    const dead = hrefs.filter((h) => !routeResolves(h));
    expect(dead).toEqual([]);
  });

  it("has no duplicate hrefs", () => {
    const dupes = hrefs.filter((h, i) => hrefs.indexOf(h) !== i);
    expect(dupes).toEqual([]);
  });

  it("surfaces the previously-orphaned routes", () => {
    for (const r of [
      "/admin/games",
      "/admin/teams",
      "/admin/registrations",
      "/admin/age-groups",
      "/admin/game-day/today",
      "/admin/broadcasts",
      "/admin/announcements",
      "/admin/re-registration-campaign",
      "/admin/media/shoots",
      "/admin/media/staff",
      "/admin/media/tag-queue",
      "/admin/reports",
    ]) {
      expect(hrefs).toContain(r);
    }
  });

  it("keeps the expected groups", () => {
    const groups = SUPER_ADMIN_NAV.map((g) => g.name);
    for (const g of ["Plan & Program", "Casual play", "Marketing", "People", "Money", "Media", "Setup", "Reports"]) {
      expect(groups).toContain(g);
    }
  });
});

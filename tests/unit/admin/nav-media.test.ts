import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MEDIA_NAV, getMediaNav } from "@/lib/admin/nav-media";

const PAGES = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const allHrefs = (nav: { items: { href: string }[] }[]) => nav.flatMap((g) => g.items.map((i) => i.href));

function resolves(href: string): boolean {
  return (
    existsSync(path.join(PAGES, href.replace(/^\//, "") + ".astro")) ||
    existsSync(path.join(PAGES, href.replace(/^\//, ""), "index.astro"))
  );
}

describe("MEDIA_NAV / getMediaNav", () => {
  it("the existing static pages resolve", () => {
    // /media/queue is created in a later task; the orphan-guard verifies it then.
    for (const h of ["/media/jobs", "/media/history"]) {
      expect(resolves(h)).toBe(true);
    }
  });
  it("media_staff sees jobs + history (not the queue)", () => {
    const hrefs = allHrefs(getMediaNav(["media_staff"]));
    expect(hrefs).toContain("/media/jobs");
    expect(hrefs).toContain("/media/history");
    expect(hrefs).not.toContain("/media/queue");
  });
  it("media_editor sees the queue + history (not jobs)", () => {
    const hrefs = allHrefs(getMediaNav(["media_editor"]));
    expect(hrefs).toContain("/media/queue");
    expect(hrefs).toContain("/media/history");
    expect(hrefs).not.toContain("/media/jobs");
  });
  it("a dual-role user sees all three", () => {
    const hrefs = allHrefs(getMediaNav(["media_staff", "media_editor"]));
    expect(hrefs).toEqual(expect.arrayContaining(["/media/jobs", "/media/queue", "/media/history"]));
  });
  it("the queue item carries the mediaQueue badge", () => {
    const item = getMediaNav(["media_editor"]).flatMap((g) => g.items).find((i) => i.href === "/media/queue");
    expect(item?.badgeKey).toBe("mediaQueue");
  });
});

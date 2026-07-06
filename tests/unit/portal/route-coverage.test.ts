import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PORTALS } from "@/lib/portal/registry";

const PAGES_DIR = fileURLToPath(new URL("../../../src/pages", import.meta.url));
const PORTAL_DIRS = ["admin", "coach", "media", "referee"];

/** All nav hrefs across every portal. */
const navHrefs = new Set(
  PORTALS.flatMap((p) => p.nav.flatMap((g) => g.items.map((i) => i.href))),
);

/**
 * Routes intentionally reached only via contextual links (not the sidebar),
 * or whose nav placement is owned by a later sub-project. Each entry MUST carry
 * a reason. Remove entries as Sub-projects 1–4 give these pages real nav homes.
 */
const CONTEXTUAL_ROUTES = new Set<string>([
  // Reached via contextual links (confirmed in the codebase) — keep contextual.
  "/admin/sports",        // from programs-list (also a /admin/programs tab)
  // Reached from a parent index/detail — contextual sub-pages.
  "/admin/dropin/rate-card",
  "/admin/dropin/sessions",
  "/admin/rentals/rate-card",
  "/admin/rentals/new",
  "/admin/memberships/new",
  "/admin/gear/products",
  "/admin/curriculum/activities",
  "/admin/curriculum/skills",
  "/admin/curriculum/templates",
  "/admin/curriculum/sequences", // from curriculum-manager's "Sequences" section card

  "/admin/media/shoots/bulk",
  "/admin/venue/walk-up",      // in venue nav as "Walk-up reg"
  "/admin/venue/check-in",     // in venue nav as "Check-in"
  // Always-reachable utility pages.
  "/admin/unauthorized",
  "/admin/organizations", // super-admin-only org switcher; intentionally unlinked
  "/admin/walk-up-registration", // 301 redirect stub
  // Contextual sub-pages reached from their parent index.
  "/admin/media/shoots/new",   // reached from /admin/media/shoots (new shoot form)
  "/admin/dropin/sessions/new", // reached from /admin/dropins (new session form)
  // Reached from /coach/practices (new practice form) — contextual.
  "/coach/practices/new",
]);

/** Recursively collect .astro files under a directory. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".astro")) out.push(full);
  }
  return out;
}

/** Map a .astro file path to its route, e.g. .../admin/seasons/index.astro -> /admin/seasons */
function fileToRoute(file: string): string {
  const rel = path.relative(PAGES_DIR, file).replace(/\\/g, "/");
  let route = "/" + rel.replace(/\.astro$/, "");
  route = route.replace(/\/index$/, "");
  return route === "" ? "/" : route;
}

const isDynamic = (route: string) => route.includes("[");

/** A redirect stub is a tiny file whose frontmatter calls Astro.redirect. */
function isRedirectStub(file: string): boolean {
  const src = readFileSync(file, "utf8");
  return /Astro\.redirect\(/.test(src) && src.length < 800;
}

describe("portal route coverage (orphan guard)", () => {
  const files = PORTAL_DIRS
    .map((d) => path.join(PAGES_DIR, d))
    .filter((d) => {
      try { return statSync(d).isDirectory(); } catch { return false; }
    })
    .flatMap(walk);

  const uncovered = files
    .map((file) => ({ file, route: fileToRoute(file) }))
    .filter(({ file, route }) =>
      !navHrefs.has(route) &&
      !CONTEXTUAL_ROUTES.has(route) &&
      !isDynamic(route) &&
      !isRedirectStub(file),
    )
    .map(({ route }) => route);

  it("has no orphaned portal pages", () => {
    expect(uncovered).toEqual([]);
  });
});

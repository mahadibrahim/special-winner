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
  "/admin/rentals/blocks", // reached from /admin/rentals (Blocks button)
  "/admin/rentals/calendar", // reached from /admin/rentals (Calendar button)
  "/admin/rentals/blocks/new", // reached from the Blocks tab (block builder)
  "/admin/memberships/new",
  "/admin/gear/products",
  "/admin/curriculum/activities",
  "/admin/curriculum/skills",
  "/admin/curriculum/templates",
  "/admin/curriculum/sequences", // from curriculum-manager's "Sequences" section card
  "/admin/curriculum/assessment-coverage", // from curriculum overview's Quick Links card

  "/admin/media/shoots/bulk",
  // /admin/venue/walk-up and /admin/venue/check-in were retired as separate
  // nav entries (Task 12, command-center-polish) — both are now 308-redirect
  // stubs to /admin/venue, so isRedirectStub() below excludes them without
  // needing an allowlist entry.
  // Always-reachable utility pages.
  "/admin/unauthorized",
  "/admin/organizations", // super-admin-only org switcher; intentionally unlinked
  "/admin/walk-up-registration", // 301 redirect stub
  // Contextual sub-pages reached from their parent index.
  "/admin/media/shoots/new",   // reached from /admin/media/shoots (new shoot form)
  "/admin/dropin/sessions/new", // reached from /admin/dropins (new session form)
  // Reached from /coach/practices (new practice form) — contextual.
  "/coach/practices/new",

  // Pre-existing gap (unrelated to the media-optout build, fixed while
  // touching this suite): the incident-reporting admin list/detail pages
  // (src/pages/admin/incidents/**) landed without a nav entry in
  // nav-super-admin.ts — same failure mode as assessment-coverage above.
  // Allowlisting rather than picking a nav placement here (that's a
  // product decision — likely alongside "Compliance" — out of scope for
  // this change). Remove once it gets a real nav home.
  "/admin/incidents",

  // Same failure mode as /admin/incidents above (build #1), now for
  // build #4 (ejection/suspension tracker): src/pages/admin/suspensions
  // landed without a nav entry. Deliberately not super-admin-only (see
  // the plan) so location_admin can reach it — but choosing where it
  // lives in the nav (likely near a future "Compliance"/incidents group)
  // is a product decision out of scope for this change. Remove once it
  // gets a real nav home.
  "/admin/suspensions",

  // Same failure mode again, now for build #5 (in-app time tracking):
  // src/pages/admin/labor (the flagged-clock-in review surface the
  // accuracy-aware anti-gaming geofence design relies on) landed without a
  // nav entry. Deliberately not super-admin-only — location_admin reviews
  // their own venues' time entries. Nav placement (likely alongside
  // incidents/suspensions, perhaps a future "Compliance"/"Labor" group) is
  // a product decision out of scope for this change. Remove once it gets a
  // real nav home.
  "/admin/labor",
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

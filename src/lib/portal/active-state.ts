/**
 * True when the nav item at `href` should render as the active item for the
 * current path. Exact match always wins; a nested route (e.g. /admin/seasons/1)
 * activates its parent item (/admin/seasons). The bare "/admin" home is special-
 * cased so it does NOT light up for every /admin/* route — it only matches
 * exactly. The trailing "/" guard prevents sibling-prefix false positives
 * (/admin/seasonal must not match /admin/seasons).
 */
export function isNavItemActive(currentPath: string, href: string): boolean {
  if (currentPath === href) return true;
  if (href === "/admin") return false;
  return currentPath.startsWith(href + "/");
}

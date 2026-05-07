/**
 * In-process cache around the YAML catalog loader.
 *
 * The catalog is large but immutable at runtime — load once per process
 * and reuse. Tests can call `_resetCatalogCacheForTests()` to force a
 * fresh load.
 */

import path from "node:path";
import { loadCatalog, type Catalog } from "../ops-catalog/loader";

const CATALOG_DIR = path.join(process.cwd(), "docs/operations/catalog");
let _cache: Promise<Catalog> | null = null;

export async function getCatalog(): Promise<Catalog> {
  if (!_cache) _cache = loadCatalog(CATALOG_DIR);
  return _cache;
}

export async function getActivityFromCatalog(activityId: string) {
  const catalog = await getCatalog();
  return catalog.activities.find((a) => a.id === activityId) ?? null;
}

export async function getArtifactTemplate(templateId: string) {
  const catalog = await getCatalog();
  return catalog.artifacts.find((a) => a.id === templateId) ?? null;
}

export async function getRole(roleId: string) {
  const catalog = await getCatalog();
  return catalog.roles.find((r) => r.id === roleId) ?? null;
}

// For tests only — not for production code paths.
export function _resetCatalogCacheForTests() {
  _cache = null;
}

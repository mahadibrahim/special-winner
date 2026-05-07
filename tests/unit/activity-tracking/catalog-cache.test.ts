import { describe, it, expect, beforeEach } from "vitest";
import { getCatalog, _resetCatalogCacheForTests } from "../../../src/lib/activity-tracking/catalog-cache";

describe("catalog-cache", () => {
  beforeEach(() => _resetCatalogCacheForTests());

  it("returns the catalog on first call", async () => {
    const c = await getCatalog();
    expect(c.activities.length).toBeGreaterThan(0);
    expect(c.roles.length).toBeGreaterThan(0);
  });

  it("returns the same instance on repeated calls (cached)", async () => {
    const a = await getCatalog();
    const b = await getCatalog();
    expect(a).toBe(b);
  });
});

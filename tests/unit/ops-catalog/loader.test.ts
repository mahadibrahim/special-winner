import { describe, it, expect } from "vitest";
import path from "node:path";
import { loadCatalog } from "../../../src/lib/ops-catalog/loader";

const fixturesDir = path.resolve(__dirname, "fixtures");

describe("loadCatalog", () => {
  it("loads roles, features, and artifacts from fixture dir", async () => {
    const catalog = await loadCatalog(path.join(fixturesDir, "sample"));

    expect(catalog.roles).toHaveLength(1);
    expect(catalog.roles[0].id).toBe("role.test_role");

    expect(catalog.features).toHaveLength(1);
    expect(catalog.features[0].id).toBe("feat.test");

    expect(catalog.artifacts).toHaveLength(1);
    expect(catalog.artifacts[0].id).toBe("chk.test");

    expect(catalog.activities).toHaveLength(0);
  });

  it("returns empty arrays for missing subdirectories", async () => {
    const catalog = await loadCatalog(path.join(fixturesDir, "empty"));

    expect(catalog.roles).toEqual([]);
    expect(catalog.features).toEqual([]);
    expect(catalog.artifacts).toEqual([]);
    expect(catalog.activities).toEqual([]);
  });
});

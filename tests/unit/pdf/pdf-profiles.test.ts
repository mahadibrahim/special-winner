import { describe, expect, it } from "vitest";
import { PROFILES, profileFor, resolveRunConfig, spineWidthInches } from "../../../scripts/pdf-profiles";

describe("pdf profiles", () => {
  it("letter profile keeps the existing Letter format", () => {
    expect(PROFILES["letter"].pdfOptions.format).toBe("Letter");
    expect(PROFILES["letter"].waitForPaged).toBe(false);
  });
  it("kdp-6x9 uses explicit trim size, CSS page size, and paged.js", () => {
    const p = profileFor("kdp-6x9");
    expect(p.pdfOptions.width).toBe("6in");
    expect(p.pdfOptions.height).toBe("9in");
    expect(p.pdfOptions.preferCSSPageSize).toBe(true);
    expect(p.waitForPaged).toBe(true);
  });
  it("throws on unknown profile", () => {
    expect(() => profileFor("a4")).toThrow(/unknown pdf profile/i);
  });
  it("computes KDP white-paper spine width", () => {
    expect(spineWidthInches(120)).toBeCloseTo(0.27024, 5);
  });
});

describe("resolveRunConfig", () => {
  it("minibooks mode defaults to letter profile", () => {
    const config = resolveRunConfig([]);
    expect(config.mode).toBe("minibooks");
    expect(config.profileName).toBe("letter");
    expect(config.bookSlug).toBeUndefined();
    expect(config.userSlugs).toBeUndefined();
  });

  it("book mode defaults to kdp-6x9 profile when no explicit --profile", () => {
    const config = resolveRunConfig(["--book", "my-book"]);
    expect(config.mode).toBe("book");
    expect(config.bookSlug).toBe("my-book");
    expect(config.profileName).toBe("kdp-6x9");
  });

  it("explicit --profile overrides book mode default", () => {
    const config = resolveRunConfig(["--book", "my-book", "--profile", "letter"]);
    expect(config.mode).toBe("book");
    expect(config.bookSlug).toBe("my-book");
    expect(config.profileName).toBe("letter");
  });

  it("explicit --profile overrides minibooks mode default", () => {
    const config = resolveRunConfig(["--profile", "kdp-6x9"]);
    expect(config.mode).toBe("minibooks");
    expect(config.profileName).toBe("kdp-6x9");
  });

  it("parses --slugs for minibooks mode", () => {
    const config = resolveRunConfig(["--slugs", "soccer-passing,basketball-shooting"]);
    expect(config.mode).toBe("minibooks");
    expect(config.userSlugs).toEqual(["soccer-passing", "basketball-shooting"]);
  });

  it("throws when both --book and --slugs are provided", () => {
    expect(() => resolveRunConfig(["--book", "my-book", "--slugs", "soccer-passing"])).toThrow(
      /--book and --slugs are mutually exclusive/
    );
  });

  it("throws on unknown profile", () => {
    expect(() => resolveRunConfig(["--profile", "unknown"])).toThrow(/unknown pdf profile/i);
  });
});

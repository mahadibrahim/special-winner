import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BRAND_THEMES,
  getBrandTheme,
  type BrandId,
} from "@/lib/branding/themes";

const BRAND_IDS: BrandId[] = ["aspire", "soccerone"];

/** Every custom property defined in globals.css (palette, semantic, font seams). */
function globalsCssVarNames(): Set<string> {
  const css = readFileSync(
    path.resolve(__dirname, "../../../src/styles/globals.css"),
    "utf-8",
  );
  return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

describe("brand themes", () => {
  it("defines a complete theme for every brand", () => {
    for (const id of BRAND_IDS) {
      const theme = getBrandTheme(id);
      expect(theme.id).toBe(id);
      expect(theme.displayName.length).toBeGreaterThan(0);
      expect(theme.favicon.startsWith("/")).toBe(true);
      expect(["aspire", "soccerone"]).toContain(theme.chrome);
    }
  });

  it("aspire is the identity theme — no overrides, no extra fonts", () => {
    const aspire = getBrandTheme("aspire");
    expect(aspire.cssVars).toBeNull();
    expect(aspire.fontsHref).toBeNull();
    expect(aspire.chrome).toBe("aspire");
  });

  it("soccerone overrides only custom properties that globals.css defines", () => {
    const allowed = globalsCssVarNames();
    const soccerone = getBrandTheme("soccerone");
    expect(soccerone.cssVars).not.toBeNull();
    for (const key of Object.keys(soccerone.cssVars!)) {
      expect([...allowed], `unknown css var ${key}`).toContain(key);
    }
  });

  it("soccerone theme carries the locked brand values", () => {
    const soccerone = getBrandTheme("soccerone");
    expect(soccerone.cssVars!["--primary-orange"]).toBe("#a3e635");
    expect(soccerone.cssVars!["--cream"]).toBe("#0a0a0d");
    expect(soccerone.chrome).toBe("soccerone");
    expect(soccerone.favicon).toBe("/soccerone-favicon.svg");
    expect(soccerone.fontsHref).toContain("Anton");
    expect(soccerone.fontsHref).toContain("DM+Sans");
  });

  it("BRAND_THEMES and getBrandTheme agree", () => {
    for (const id of BRAND_IDS) {
      expect(getBrandTheme(id)).toBe(BRAND_THEMES[id]);
    }
  });
});

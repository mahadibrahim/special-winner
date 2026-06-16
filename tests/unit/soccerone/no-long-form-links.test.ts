import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the SoccerOne short-URL cleanup.
 *
 * On a SoccerOne host the public URL is the SHORT form (`/leagues`,
 * `/rent`, …). The `src/pages/soccerone/*` files are only the internal
 * rewrite target — never a public surface — and a long-form request 301s
 * back to the short form (see getSoccerOneCanonicalRedirect + middleware).
 *
 * So no SoccerOne page/component may LINK to the long form: doing so sends
 * users through a needless 301 and resurrects the ugly `/soccerone/...` URL
 * we just retired. This test fails the build if a `/soccerone/...`,
 * `/soccerone"`, or `/soccerone#` href creeps back in.
 *
 * Allowed and intentionally NOT matched:
 *   - `favicon="/soccerone-favicon.svg"` and other `/soccerone-*` assets
 *     (hyphen, not a path segment)
 *   - `@/components/soccerone/...` import specifiers
 */
const SCAN_DIRS = ["src/components/soccerone", "src/pages/soccerone"];

// Matches a link/string value pointing at the long form:
//   href="/soccerone/...   href="/soccerone"   href="/soccerone#...
//   "/soccerone/..." or `/soccerone/...` used as a path string
// Crucially does NOT match `/soccerone-favicon.svg` (requires `/`, `"`, `#`,
// or backtick immediately after `soccerone`) nor `@/components/soccerone/`.
const LONG_FORM = /(?<![\w@])\/soccerone(?=["'`/#?])/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(astro|tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("SoccerOne pages link to short URLs only", () => {
  const files = SCAN_DIRS.flatMap(walk);

  it("scans a non-trivial number of SoccerOne files", () => {
    // Guards against the walk silently finding nothing (e.g. a moved dir),
    // which would make the assertion below vacuously pass.
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(SCAN_DIRS.flatMap(walk))(
    "%s has no long-form /soccerone/* links",
    (file) => {
      const offenders = readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        // Ignore import specifiers like `@/components/soccerone/...`
        .filter(({ line }) => !/^\s*import\b/.test(line))
        .filter(({ line }) => LONG_FORM.test(line));

      expect(
        offenders,
        offenders.length
          ? `Long-form /soccerone link(s) found — use the short form (the host rewrite serves it):\n` +
              offenders.map((o) => `  ${file}:${o.n}  ${o.line.trim()}`).join("\n")
          : "",
      ).toEqual([]);
    },
  );
});

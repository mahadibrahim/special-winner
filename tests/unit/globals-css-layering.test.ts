// Tailwind v4 emits every utility inside the `utilities` cascade layer, and
// unlayered author CSS beats ALL layered CSS regardless of specificity. So a
// bare class rule in globals.css silently overrides any Tailwind utility on
// the same property — the class "wins" with no error and the utility appears
// to do nothing (this cost real debugging time: the `.graded` / `absolute
// inset-0` incident, see globals.css "Fill variant" note).
//
// Convention: everything in globals.css after the token definitions must live
// inside an @layer block. Token/at-rule statements (:root, .dark, @theme,
// @custom-variant, @import) are exempt — they define variables, not competing
// declarations.
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const CSS_PATH = resolve(__dirname, "../../src/styles/globals.css")

/** Prelude prefixes allowed at the top level of the stylesheet. */
const ALLOWED_TOP_LEVEL = [
  "@import",
  "@custom-variant",
  "@layer",
  "@theme",
  ":root",
  ".dark",
]

/**
 * Returns the prelude (selector / at-rule text before `{` or `;`) of every
 * top-level statement in the stylesheet, comments stripped.
 */
function topLevelPreludes(css: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const preludes: string[] = []
  let depth = 0
  let buf = ""
  for (const ch of noComments) {
    if (ch === "{") {
      if (depth === 0) {
        preludes.push(buf.trim())
        buf = ""
      }
      depth++
    } else if (ch === "}") {
      depth--
    } else if (ch === ";" && depth === 0) {
      preludes.push(buf.trim())
      buf = ""
    } else if (depth === 0) {
      buf += ch
    }
  }
  return preludes.filter((p) => p.length > 0)
}

describe("globals.css cascade layering", () => {
  const preludes = topLevelPreludes(readFileSync(CSS_PATH, "utf8"))

  it("parses the stylesheet into top-level statements", () => {
    // Sanity: the parser saw the known structure, so an empty result can't
    // silently pass the guard below.
    expect(preludes.some((p) => p.startsWith("@layer"))).toBe(true)
    expect(preludes.some((p) => p === ":root")).toBe(true)
  })

  it("has no unlayered style rules (they would silently beat Tailwind utilities)", () => {
    const offenders = preludes.filter(
      (p) => !ALLOWED_TOP_LEVEL.some((a) => p === a || p.startsWith(`${a} `)),
    )
    expect(
      offenders,
      `Unlayered top-level rule(s) in globals.css: ${offenders.join(", ")}. ` +
        "Move them into @layer base (element defaults) or @layer components " +
        "(class rules) so Tailwind utilities keep winning.",
    ).toEqual([])
  })
})

# Brand-Skinned Booking Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SoccerOne customers see SoccerOne chrome, colors, fonts, and emails on every shared booking surface (`/register`, `/dropin/*`, rentals, `/signin`, `/dashboard/**`); the Aspire site renders byte-identically.

**Architecture:** Approach B from the approved spec (`docs/superpowers/specs/2026-06-11-brand-skinned-booking-flows-design.md`). A typed `BrandTheme` map in code, keyed by host-derived `BrandId`. BaseLayout applies the theme as a `html[data-brand]` CSS custom-property override block and swaps header/footer chrome. Emails get a parallel `EmailTheme` delivered through React context so all `@react-email` primitives re-theme from one `brand` prop.

**Tech Stack:** Astro 5 middleware/locals, Tailwind 4 `@theme inline` CSS-variable bridge, React 19 context (react-email), Vitest unit tests, Playwright e2e.

**Key mechanism (read before Task 1):** `globals.css` defines the editorial palette as custom properties on `:root` (`--cream`, `--ink`, `--primary-orange`, …) and the semantic shadcn vars as `var()` references to them (`--background: var(--cream)`). Tailwind's `@theme inline` block maps utilities onto those vars, so `bg-cream` compiles to `background-color: var(--cream)`. Custom properties resolve per-element at computed-value time and `:root` IS `html` — so overriding the **palette** vars with a higher-specificity `html[data-brand="soccerone"]` block re-themes both the named utilities (`bg-cream`, `text-ink`) and everything semantic that references them, in one place. Only semantic vars holding literal values (`--border`, `--input`, `--destructive`) and bad-on-dark resolutions (`--secondary-foreground`) need direct overrides. Fonts are the exception: `@theme inline` inlines font-family **values**, so Task 1 adds a `var()` indirection seam first.

**Branch/worktree:** This is a >2-file, multi-task plan. Per repo branch hygiene, execute on a new branch `feat/brand-skinned-booking` in a worktree (the main checkout is on `feat/ia-category-pages`). Known env caveats from memory: worktree creation needs `dangerouslyDisableSandbox`; worktrees have no `node_modules`/`.env` — symlink both from the main checkout (`ln -s ../web-app/node_modules`, `cp ../web-app/.env .`) so local tests run, and lean on CI as the final arbiter.

---

### Task 1: Font seam in globals.css

Make Tailwind font utilities resolve through runtime-overridable custom properties. Aspire output must be unchanged.

**Files:**
- Modify: `src/styles/globals.css` (the `:root` block ending line 88, and the `@theme inline` font lines 131–134)

- [ ] **Step 1: Add brand font vars to `:root`**

In `src/styles/globals.css`, immediately before the closing `}` of the `:root` block (after line 87 `--warning: var(--ochre);`), add:

```css
  /* ——————————— Brand font seams ——————————— */
  /* Tailwind's font utilities resolve through these at runtime so a
     brand override (html[data-brand]) can swap families. Values are
     the original Aspire stacks, unchanged. */
  --brand-font-sans: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif;
  --brand-font-display: "Newsreader", "Source Serif 4", Georgia, serif;
  --brand-font-serif: "Newsreader", "Source Serif 4", Georgia, serif;
  --brand-font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
```

- [ ] **Step 2: Point the `@theme inline` font lines at the seams**

Replace lines 131–134:

```css
  --font-sans: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: "Newsreader", "Source Serif 4", Georgia, serif;
  --font-serif: "Newsreader", "Source Serif 4", Georgia, serif;
  --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;
```

with:

```css
  --font-sans: var(--brand-font-sans);
  --font-display: var(--brand-font-display);
  --font-serif: var(--brand-font-serif);
  --font-mono: var(--brand-font-mono);
```

- [ ] **Step 3: Verify the build is clean**

Run: `npm run build`
Expected: build succeeds. (The `Astro.request.headers` prerender warnings are known noise — ignore.)

- [ ] **Step 4: Commit**

```bash
git add src/styles/globals.css
git commit -m "refactor(brand): route Tailwind font utilities through runtime-overridable vars"
```

---

### Task 2: Brand theme module

**Files:**
- Create: `src/lib/branding/themes.ts`
- Test: `tests/unit/branding/themes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/branding/themes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRAND_THEMES,
  getBrandTheme,
  type BrandId,
} from "@/lib/branding/themes";

const BRAND_IDS: BrandId[] = ["aspire", "soccerone"];

/** Every custom property defined in globals.css (palette, semantic, font seams). */
function globalsCssVarNames(): Set<string> {
  const css = readFileSync(
    join(__dirname, "../../../src/styles/globals.css"),
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
      expect(allowed, `unknown css var ${key}`).toContain(key);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/branding/themes.test.ts`
Expected: FAIL — cannot resolve `@/lib/branding/themes`

- [ ] **Step 3: Implement the theme module**

Create `src/lib/branding/themes.ts`:

```ts
/**
 * Brand themes — typed, code-reviewed visual identity per brand
 * (Approach B, spec 2026-06-11-brand-skinned-booking-flows-design.md).
 *
 * `brand_profiles` (DB, via Astro.locals.brand) supplies *content*
 * (displayName override, footer copy, logo media). This module supplies
 * the *look*: CSS custom-property overrides, chrome selection, fonts.
 *
 * SoccerOne values are lifted from src/styles/soccerone-tokens.css —
 * the locked source of truth for the marketing tree. Change them there
 * first, then mirror here (cross-reference comment in that file).
 */

export type BrandId = "aspire" | "soccerone";

export interface BrandTheme {
  id: BrandId;
  /** Fallback brand name when no brand_profiles row resolves. */
  displayName: string;
  /** Which header/footer pair BaseLayout renders on shared pages. */
  chrome: "aspire" | "soccerone";
  favicon: string;
  /** Google Fonts stylesheet for brand fonts; null = base layout fonts suffice. */
  fontsHref: string | null;
  /**
   * Custom-property overrides applied as `html[data-brand="<id>"] { … }`.
   * Override the *palette* vars (--cream, --ink, …) — the semantic vars in
   * globals.css are var() references to them and re-resolve automatically.
   * null = no override; the Aspire design system applies untouched.
   */
  cssVars: Record<string, string> | null;
}

const aspire: BrandTheme = {
  id: "aspire",
  displayName: "Aspire Sports",
  chrome: "aspire",
  favicon: "/favicon.svg",
  fontsHref: null,
  cssVars: null,
};

const soccerone: BrandTheme = {
  id: "soccerone",
  displayName: "SoccerOne",
  chrome: "soccerone",
  favicon: "/soccerone-favicon.svg",
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  cssVars: {
    // —— Editorial palette inversion (values from soccerone-tokens.css) ——
    "--cream": "#0a0a0d", // --so-ink: page background
    "--cream-2": "#131316",
    "--cream-3": "#1a1a1f",
    "--ink": "#ffffff",
    "--ink-2": "#e4e4e7",
    "--ink-muted": "#b8b8bf",
    "--ink-faint": "#8c8c95",
    "--navy": "#0a1929", // --so-navy
    "--navy-deep": "#080c18", // --so-navy-deep
    "--primary-orange": "#a3e635", // --so-lime
    "--primary-orange-bright": "#bef264", // --so-lime-bright
    "--primary-orange-soft": "rgba(163, 230, 53, 0.12)", // --so-lime-a12
    "--ochre": "#fbbf24", // --so-tier-founder
    "--sage": "#4ade80",
    "--paper": "#0e0e10", // --so-surface
    "--paper-shadow": "rgba(0, 0, 0, 0.45)",
    // —— Semantic vars with literal values in globals.css (don't cascade) ——
    "--border": "rgba(255, 255, 255, 0.14)",
    "--input": "rgba(255, 255, 255, 0.14)",
    "--destructive": "oklch(0.55 0.2 27)",
    // —— var()-defined semantics whose palette resolution lands wrong on dark ——
    "--secondary-foreground": "#ffffff", // default resolves to near-black via --cream
    // —— Brand fonts (Tailwind font utilities resolve through these seams) ——
    "--brand-font-sans": "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    "--brand-font-display": "'Anton', 'Arial Narrow', sans-serif",
    "--brand-font-serif": "'Anton', 'Arial Narrow', sans-serif",
    "--brand-font-mono": "'JetBrains Mono', ui-monospace, monospace",
  },
};

export const BRAND_THEMES: Record<BrandId, BrandTheme> = { aspire, soccerone };

export function getBrandTheme(id: BrandId | null | undefined): BrandTheme {
  return BRAND_THEMES[id ?? "aspire"] ?? BRAND_THEMES.aspire;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/branding/themes.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Add the cross-reference comment to soccerone-tokens.css**

In `src/styles/soccerone-tokens.css`, the header comment block already says "This file is the input to the future brand_profiles theme work". Replace that sentence (lines 11–13 of the comment:

```
 *  - This file is the input to the future brand_profiles theme work
 *    (multi-brand decision 2026-06-10): each token maps 1:1 to a
 *    brand_profiles key when that lands.
```

) with:

```
 *  - Shared booking surfaces consume these values via the typed theme
 *    in src/lib/branding/themes.ts (brand-skinned booking flows,
 *    2026-06-11). Change a value here FIRST, then mirror it there.
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/branding/themes.ts tests/unit/branding/themes.test.ts src/styles/soccerone-tokens.css
git commit -m "feat(brand): typed BrandTheme map for aspire + soccerone"
```

---

### Task 3: Host plumbing — `soccerone.localhost` + `locals.brandId`

**Files:**
- Modify: `src/lib/organization/soccerone-routing.ts:18-21` (SOCCERONE_HOSTS)
- Modify: `src/middleware.ts:77-86` (locals defaults) — also add the import
- Modify: `src/env.d.ts:17-25` (App.Locals)
- Test: `tests/unit/organization/soccerone-routing.test.ts` (existing file — add cases)

- [ ] **Step 1: Add failing test cases for the dev host**

In `tests/unit/organization/soccerone-routing.test.ts`, add inside the existing top-level `describe` (or at file scope matching the file's style):

```ts
describe("soccerone.localhost dev host", () => {
  it("is a SoccerOne host (browser-resolvable loopback for QA/e2e)", () => {
    expect(isSoccerOneHost("soccerone.localhost")).toBe(true);
    expect(isSoccerOneHost("soccerone.localhost:4321")).toBe(true);
    expect(brandFromHost("soccerone.localhost:4321")).toBe("soccerone");
  });

  it("plain localhost stays aspire", () => {
    expect(brandFromHost("localhost:4321")).toBe("aspire");
  });
});
```

(Import `isSoccerOneHost` / `brandFromHost` if the existing file doesn't already.)

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run tests/unit/organization/soccerone-routing.test.ts`
Expected: FAIL — `isSoccerOneHost("soccerone.localhost")` is false

- [ ] **Step 3: Add the host**

In `src/lib/organization/soccerone-routing.ts`, change:

```ts
export const SOCCERONE_HOSTS: readonly string[] = [
  "gosoccerone.com",
  "www.gosoccerone.com",
] as const;
```

to:

```ts
export const SOCCERONE_HOSTS: readonly string[] = [
  "gosoccerone.com",
  "www.gosoccerone.com",
  // Dev/e2e only: *.localhost resolves to loopback in Chromium and
  // modern OS resolvers, so the brand skin can be exercised in a real
  // browser and in Playwright without DNS or Host-header spoofing.
  // Never publicly routable — harmless in prod.
  "soccerone.localhost",
] as const;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/organization/soccerone-routing.test.ts`
Expected: PASS

- [ ] **Step 5: Set `locals.brandId` in middleware**

In `src/middleware.ts`, add to the imports from `@/lib/organization/soccerone-routing` (it already imports `isSoccerOneHost`, `rewriteSoccerOnePath`, `getAspireToSoccerOneRedirect`): `brandFromHost`.

Then after line 86 (`context.locals.activeLocationId = null;`), add:

```ts
  // Host-derived brand id — pure, no DB. Distinct from `locals.brand`
  // (the brand_profiles content row): brandId always resolves, and is
  // the key for the typed theme in src/lib/branding/themes.ts.
  context.locals.brandId = brandFromHost(
    context.request.headers.get("host") ?? "",
  );
```

- [ ] **Step 6: Declare the locals type**

In `src/env.d.ts`, inside `interface Locals` (next to line 25 `brand: BrandProfile | null;`), add:

```ts
      brandId: import("./lib/branding/themes").BrandId;
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/organization/soccerone-routing.ts src/middleware.ts src/env.d.ts tests/unit/organization/soccerone-routing.test.ts
git commit -m "feat(brand): locals.brandId + soccerone.localhost dev host"
```

---

### Task 4: BaseLayout brand integration + e2e

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Test: `tests/e2e/brand-skin.spec.ts` (new)

- [ ] **Step 1: Write the failing e2e spec**

Create `tests/e2e/brand-skin.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// soccerone.localhost resolves to loopback in Chromium without DNS setup
// (see SOCCERONE_HOSTS in src/lib/organization/soccerone-routing.ts).
const SOCCERONE_BASE = (
  process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4321"
).replace("localhost", "soccerone.localhost");

// No waitForHydration needed: these tests assert server-rendered chrome
// and computed CSS only — no clicks, no keyboard input.

test("SoccerOne host skins shared booking chrome", async ({ page }) => {
  await page.goto(`${SOCCERONE_BASE}/signin`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-brand",
    "soccerone",
  );
  // SoccerOne header replaces the Aspire nav
  await expect(page.locator(".so-wordmark")).toBeVisible();
  await expect(page.locator("nav#main-nav, header.site-header")).toHaveCount(
    0,
  );
  // Palette override is live: body bg-cream resolves to --so-ink
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  expect(bg).toBe("rgb(10, 10, 13)");
});

test("Aspire host renders unbranded-identical chrome (regression)", async ({
  page,
}) => {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-brand", "aspire");
  await expect(page.locator(".so-wordmark")).toHaveCount(0);
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  );
  // --cream: oklch(0.972 0.008 80) — assert it is NOT the SoccerOne ink
  expect(bg).not.toBe("rgb(10, 10, 13)");
});
```

Note: before running, check what selector the Aspire `Navigation` component actually renders (open `src/components/navigation.tsx`, find its root element/class) and fix the `nav#main-nav, header.site-header` locator to match the real root selector. This is the one selector in this spec written before reading that file.

- [ ] **Step 2: Run the spec to verify it fails**

With a dev server running (`npm run dev`):
Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/brand-skin.spec.ts`
Expected: FAIL — `data-brand` attribute missing

- [ ] **Step 3: Integrate the theme into BaseLayout**

Modify `src/layouts/BaseLayout.astro`. Frontmatter — add imports:

```ts
import SoccerOneHeader from '@/components/soccerone/SoccerOneHeader.astro';
import SoccerOneFooter from '@/components/soccerone/SoccerOneFooter.astro';
import { getBrandTheme } from '@/lib/branding/themes';
```

After the imports, before destructuring props:

```ts
const theme = getBrandTheme(Astro.locals.brandId);
```

Change the favicon default in the destructure from `favicon = "/favicon.svg"` to:

```ts
  favicon = theme.favicon,
```

After the GTM block (line 42), add:

```ts
// Brand skin: custom-property overrides win over globals.css :root via
// the higher-specificity html[data-brand] selector (same element).
const brandCss = theme.cssVars
  ? `html[data-brand="${theme.id}"]{${Object.entries(theme.cssVars)
      .map(([k, v]) => `${k}:${v}`)
      .join(";")}}`
  : null;
```

Template — change `<html lang="en">` to:

```astro
<html lang="en" data-brand={theme.id}>
```

In `<head>`, after the existing Aspire fonts `<link>` (line 60), add:

```astro
    {theme.fontsHref && <link href={theme.fontsHref} rel="stylesheet" />}
    {brandCss && <style is:inline set:html={brandCss} />}
```

In `<body>`, replace lines 68–71:

```astro
    {navigation && <RegistrationRibbon client:load />}
    {navigation && <Navigation client:load />}
    <slot />
    {footer && <Footer />}
```

with:

```astro
    {navigation && theme.chrome === "aspire" && <RegistrationRibbon client:load />}
    {navigation && (theme.chrome === "soccerone" ? <SoccerOneHeader /> : <Navigation client:load />)}
    <slot />
    {footer && (theme.chrome === "soccerone" ? <SoccerOneFooter /> : <Footer />)}
```

(The RegistrationRibbon is Aspire marketing chrome — it never renders on a SoccerOne-branded page. The GTM host check at lines 40–42 stays as-is; it predates `brandId` and already behaves identically.)

- [ ] **Step 4: Run the e2e spec to verify it passes**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/brand-skin.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Build + type-check**

Run: `npm run build && npx tsc --noEmit`
Expected: clean build, 0 type errors

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro tests/e2e/brand-skin.spec.ts
git commit -m "feat(brand): BaseLayout applies brand theme — tokens, fonts, chrome swap"
```

---

### Task 5: Email theme module

**Files:**
- Create: `src/lib/email/components/email-theme.tsx`
- Test: `tests/unit/email/email-theme.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/email/email-theme.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  emailThemeFor,
  ASPIRE_EMAIL_THEME,
  SOCCERONE_EMAIL_THEME,
} from "@/lib/email/components/email-theme";

describe("email themes", () => {
  it("resolves brand strings, defaulting to aspire", () => {
    expect(emailThemeFor("soccerone")).toBe(SOCCERONE_EMAIL_THEME);
    expect(emailThemeFor("aspire")).toBe(ASPIRE_EMAIL_THEME);
    expect(emailThemeFor(undefined)).toBe(ASPIRE_EMAIL_THEME);
    expect(emailThemeFor(null)).toBe(ASPIRE_EMAIL_THEME);
    expect(emailThemeFor("garbage")).toBe(ASPIRE_EMAIL_THEME);
  });

  it("aspire theme preserves the existing email design values", () => {
    expect(ASPIRE_EMAIL_THEME.tokens.cream).toBe("#F5EFE3");
    expect(ASPIRE_EMAIL_THEME.tokens.primary).toBe("#CC442C");
    expect(ASPIRE_EMAIL_THEME.logo.kind).toBe("img");
    expect(ASPIRE_EMAIL_THEME.brandName).toBe("Aspire Sports Ohio");
  });

  it("soccerone theme is dark/lime with a text wordmark", () => {
    expect(SOCCERONE_EMAIL_THEME.tokens.cream).toBe("#0a0a0d");
    expect(SOCCERONE_EMAIL_THEME.tokens.primary).toBe("#a3e635");
    expect(SOCCERONE_EMAIL_THEME.logo.kind).toBe("wordmark");
    expect(SOCCERONE_EMAIL_THEME.brandName).toBe("SoccerOne");
    expect(SOCCERONE_EMAIL_THEME.fonts.display).toContain("Anton");
  });

  it("both themes define the full token set (primitives depend on every key)", () => {
    const keys = Object.keys(ASPIRE_EMAIL_THEME.tokens).sort();
    expect(Object.keys(SOCCERONE_EMAIL_THEME.tokens).sort()).toEqual(keys);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/email/email-theme.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the email theme module**

Create `src/lib/email/components/email-theme.tsx`:

```tsx
import { createContext, useContext } from "react";

/**
 * Per-brand email theming. Token NAMES mirror the Aspire originals in
 * email-layout.tsx (cream/ink/navy/…) so every primitive works against
 * either theme — for SoccerOne the values are dark/lime, i.e. "cream"
 * is the dark page background. Names describe the ROLE, not the color.
 *
 * Known compromise (accepted in the spec): Gmail and some clients
 * rewrite colors in their own dark mode, which can mangle dark-designed
 * emails. SoccerOne's email is dark by founder decision; revisit if
 * rendering reports come in.
 */

export interface EmailTokens {
  cream: string; // page background
  cream2: string; // card/panel background
  cream3: string; // deeper panel background
  paper: string; // main container background
  ink: string; // primary text
  ink2: string; // body text
  inkMuted: string; // secondary text
  inkFaint: string; // faint text
  navy: string;
  navyDeep: string;
  primary: string; // brand accent (CTA buttons, accent stripe)
  primarySoft: string;
  ochre: string;
  ochreSoft: string;
  sage: string;
  sageSoft: string;
  border: string;
  borderStrong: string;
}

export interface EmailTheme {
  brand: "aspire" | "soccerone";
  brandName: string;
  tokens: EmailTokens;
  fonts: { display: string; body: string; mono: string };
  fontsHref: string;
  /** Aspire renders an <Img> wordmark; SoccerOne a styled text wordmark. */
  logo: { kind: "img"; path: string; alt: string } | { kind: "wordmark" };
  footerAddress: string;
}

export const ASPIRE_EMAIL_THEME: EmailTheme = {
  brand: "aspire",
  brandName: "Aspire Sports Ohio",
  tokens: {
    cream: "#F5EFE3",
    cream2: "#EEE7D4",
    cream3: "#E5DDC4",
    paper: "#FAF7ED",
    ink: "#1B1D27",
    ink2: "#2D2F3C",
    inkMuted: "#4F5158",
    inkFaint: "#8C8C95",
    navy: "#1F2547",
    navyDeep: "#131737",
    primary: "#CC442C",
    primarySoft: "#F2DCC9",
    ochre: "#C29E58",
    ochreSoft: "#F2E5C5",
    sage: "#5A8169",
    sageSoft: "#DDE7DC",
    border: "#DBD5C5",
    borderStrong: "#C7BFA9",
  },
  fonts: {
    display: '"Newsreader", Georgia, "Times New Roman", serif',
    body: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif',
    mono: '"IBM Plex Mono", "SF Mono", Menlo, Monaco, Consolas, monospace',
  },
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap",
  logo: { kind: "img", path: "/images/logo-black.png", alt: "Aspire Sports" },
  footerAddress: "3989 Presidential Pkwy · Powell, OH 43065",
};

export const SOCCERONE_EMAIL_THEME: EmailTheme = {
  brand: "soccerone",
  brandName: "SoccerOne",
  tokens: {
    cream: "#0a0a0d", // --so-ink
    cream2: "#131316",
    cream3: "#1a1a1f",
    paper: "#0e0e10", // --so-surface
    ink: "#ffffff",
    ink2: "#e4e4e7",
    inkMuted: "#b8b8bf",
    inkFaint: "#8c8c95",
    navy: "#0a1929",
    navyDeep: "#080c18",
    primary: "#a3e635", // --so-lime
    primarySoft: "rgba(163, 230, 53, 0.15)",
    ochre: "#fbbf24",
    ochreSoft: "rgba(251, 191, 36, 0.15)",
    sage: "#4ade80",
    sageSoft: "rgba(74, 222, 128, 0.15)",
    border: "rgba(255, 255, 255, 0.14)",
    borderStrong: "rgba(255, 255, 255, 0.25)",
  },
  fonts: {
    display: "'Anton', 'Arial Narrow', sans-serif",
    body: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
  logo: { kind: "wordmark" },
  footerAddress: "Worthington · Downtown — Columbus, OH",
};

const EmailThemeContext = createContext<EmailTheme>(ASPIRE_EMAIL_THEME);

export const EmailThemeProvider = EmailThemeContext.Provider;

export function useEmailTheme(): EmailTheme {
  return useContext(EmailThemeContext);
}

/** Resolve a brand string (e.g. Stripe metadata.brand) to a theme. */
export function emailThemeFor(
  brand: string | null | undefined,
): EmailTheme {
  return brand === "soccerone" ? SOCCERONE_EMAIL_THEME : ASPIRE_EMAIL_THEME;
}
```

Note: the SoccerOne `footerAddress` is a placeholder-quality line I chose ("Worthington · Downtown — Columbus, OH"). Check `src/components/soccerone/SoccerOneFooter.astro` for the real address/footer copy the live site uses and lift that exact string instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/email/email-theme.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/email-theme.tsx tests/unit/email/email-theme.test.ts
git commit -m "feat(email): per-brand EmailTheme with React context"
```

---

### Task 6: Theme the email layout primitives

Convert `email-layout.tsx` so every primitive reads the theme from context. Aspire emails must render identically.

**Files:**
- Modify: `src/lib/email/components/email-layout.tsx`
- Test: `tests/unit/email/email-layout-brand.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/email/email-layout-brand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { EmailLayout, P } from "@/lib/email/components/email-layout";

describe("EmailLayout brand rendering", () => {
  it("renders the Aspire image logo and cream palette by default", async () => {
    const { html } = await renderEmail(
      EmailLayout({ preview: "test", children: P({ children: "hello" }) }),
    );
    expect(html).toContain("/images/logo-black.png");
    expect(html).toContain("#F5EFE3"); // aspire body background
    expect(html).toContain("Aspire Sports Ohio");
  });

  it("renders the SoccerOne wordmark and dark palette for brand=soccerone", async () => {
    const { html } = await renderEmail(
      EmailLayout({
        preview: "test",
        brand: "soccerone",
        children: P({ children: "hello" }),
      }),
    );
    expect(html).not.toContain("/images/logo-black.png");
    expect(html).toContain("SOCCER"); // text wordmark
    expect(html).toContain("#0a0a0d"); // dark body background
    expect(html).toContain("#a3e635"); // lime accent stripe / wordmark
    expect(html).toContain("SoccerOne");
  });
});
```

(If `renderEmail`'s signature differs — check `src/lib/email/render.ts` — adapt the calls; `tests/unit/email/render.test.ts` shows the established usage.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/email/email-layout-brand.test.ts`
Expected: FAIL — `brand` prop not accepted / Aspire output only

- [ ] **Step 3: Refactor email-layout.tsx**

This is a mechanical conversion of `src/lib/email/components/email-layout.tsx`:

1. Add imports:
   ```tsx
   import {
     ASPIRE_EMAIL_THEME,
     EmailThemeProvider,
     emailThemeFor,
     useEmailTheme,
     type EmailTheme,
   } from "./email-theme";
   ```
2. Keep the existing `tokens` and `fonts` exports but alias them to the theme module so there's one source of truth:
   ```tsx
   /** @deprecated Aspire-only constants — kept for templates that haven't
    *  been made brand-aware. Brand-aware code uses useEmailTheme(). */
   export const tokens = ASPIRE_EMAIL_THEME.tokens;
   export const fonts = ASPIRE_EMAIL_THEME.fonts;
   ```
   Delete the old literal `tokens`/`fonts` object definitions and the `fontsHref` const (it moves into the theme).
3. Convert every module-level style const that references `tokens` or `fonts` into a function of the theme. Pattern — before:
   ```tsx
   const bodyStyle: CSSProperties = {
     backgroundColor: tokens.cream,
     fontFamily: fonts.body,
     ...
   };
   ```
   after:
   ```tsx
   const bodyStyle = (t: EmailTheme): CSSProperties => ({
     backgroundColor: t.tokens.cream,
     fontFamily: t.fonts.body,
     ...
   });
   ```
   Style consts that reference no token (none currently) may stay consts. Every usage site changes from `style={bodyStyle}` to `style={bodyStyle(t)}`.
4. `EmailLayout` gains the brand prop and provides context:
   ```tsx
   interface EmailLayoutProps {
     preview: string;
     appUrl?: string;
     brand?: "aspire" | "soccerone";
     children: ReactNode;
   }

   export function EmailLayout({
     preview,
     appUrl,
     brand = "aspire",
     children,
   }: EmailLayoutProps) {
     const t = emailThemeFor(brand);
     const resolvedAppUrl =
       appUrl ??
       (brand === "soccerone"
         ? "https://www.gosoccerone.com"
         : "https://aspiresportsohio.com");
     return (
       <EmailThemeProvider value={t}>
         <Html>
           <Head>
             <link rel="preconnect" href="https://fonts.googleapis.com" />
             <link
               rel="preconnect"
               href="https://fonts.gstatic.com"
               crossOrigin="anonymous"
             />
             <link href={t.fontsHref} rel="stylesheet" />
           </Head>
           <Preview>{preview}</Preview>
           <Body style={bodyStyle(t)}>
             <Container style={containerStyle(t)}>
               <div style={accentStripeStyle(t)} />
               <Section style={logoSectionStyle(t)}>
                 {t.logo.kind === "img" ? (
                   <Img
                     src={`${resolvedAppUrl}${t.logo.path}`}
                     alt={t.logo.alt}
                     width="140"
                     height="34"
                     style={logoImgStyle}
                   />
                 ) : (
                   <Text style={wordmarkStyle(t)}>
                     SOCCER
                     <span style={{ color: t.tokens.primary }}>ONE</span>
                   </Text>
                 )}
               </Section>
               {children}
               <Hr style={ruleStyle(t)} />
               <Section style={footerSectionStyle}>
                 <Text style={footerBrandStyle(t)}>{t.brandName}</Text>
                 <Text style={footerAddressStyle(t)}>{t.footerAddress}</Text>
                 <Text style={footerContactStyle(t)}>
                   Questions? Just reply to this email — a real person reads
                   it.
                 </Text>
               </Section>
             </Container>
           </Body>
         </Html>
       </EmailThemeProvider>
     );
   }
   ```
   Add the new wordmark style:
   ```tsx
   const wordmarkStyle = (t: EmailTheme): CSSProperties => ({
     fontFamily: t.fonts.display,
     fontSize: "26px",
     fontWeight: 400,
     letterSpacing: "0.06em",
     textTransform: "uppercase",
     color: t.tokens.ink,
     margin: 0,
   });
   ```
5. Every primitive that renders with token-derived styles (`Content`, `H1`, `H2`, `P`, `PMuted`, `SectionLabel`, `InfoCard`, `Detail`, `Button`, `DetailPanel`, `StatusPill`) calls `const t = useEmailTheme();` at the top and passes `t` to its style functions. Example:
   ```tsx
   export function H1({ children }: { children: ReactNode }) {
     const t = useEmailTheme();
     return <Text style={h1Style(t)}>{children}</Text>;
   }
   ```
   `InfoCard`/`StatusPill` palettes switch from `tokens.X` to `t.tokens.X` inside the component body.

- [ ] **Step 4: Run the new test + the full email unit suite**

Run: `npx vitest run tests/unit/email/`
Expected: ALL PASS — including the pre-existing `render.test.ts` (Aspire output unchanged)

- [ ] **Step 5: Sweep remaining direct `tokens`/`fonts` importers**

Run: `grep -rln "from \"@/lib/email/components/email-layout\"" src/lib/email/ | xargs grep -ln "tokens\.\|fonts\."`

For each file listed **other than** `templates/registration-confirmation.tsx` and `templates/payment-receipt.tsx` (handled in Task 7): no change needed — the deprecated `tokens`/`fonts` exports keep them rendering Aspire-style, which is correct for non-booking emails. Just confirm they still type-check in Step 6.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/email/components/email-layout.tsx tests/unit/email/email-layout-brand.test.ts
git commit -m "feat(email): EmailLayout + primitives theme via brand context"
```

---### Task 7: Brand-aware booking templates

**Files:**
- Modify: `src/lib/email/templates/registration-confirmation.tsx`
- Modify: `src/lib/email/templates/payment-receipt.tsx`
- Modify: `src/lib/email/components/status-banner.tsx` (if it uses `tokens.`/`fonts.` — check)
- Test: extend `tests/unit/email/email-layout-brand.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/email/email-layout-brand.test.ts`:

```ts
import { RegistrationConfirmationEmail } from "@/lib/email/templates/registration-confirmation";
import { PaymentReceiptEmail } from "@/lib/email/templates/payment-receipt";

const confirmationProps = {
  parentName: "Sam",
  childName: "Alex Doe",
  programName: "Adult Pickup",
  seasonName: "Summer 2026",
  startDate: "June 1, 2026",
  endDate: "Aug 1, 2026",
  locationName: "Worthington",
  amountDue: "$120.00",
  paymentStatus: "paid",
  registrationStatus: "confirmed",
  dashboardUrl: "https://www.gosoccerone.com/dashboard",
  hasLinkedTelegram: false,
  paymentUrl: "https://www.gosoccerone.com/pay",
  waitlistClaimHours: 48,
};

describe("booking templates accept a brand", () => {
  it("registration confirmation renders SoccerOne-themed", async () => {
    const { html } = await renderEmail(
      RegistrationConfirmationEmail({
        ...confirmationProps,
        brand: "soccerone",
      }),
    );
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("SoccerOne");
  });

  it("payment receipt renders SoccerOne-themed", async () => {
    const { html } = await renderEmail(
      PaymentReceiptEmail({
        parentName: "Sam",
        childName: "Alex Doe",
        programName: "Adult Pickup",
        seasonName: "Summer 2026",
        amountPaid: "$120.00",
        paymentDate: "June 11, 2026",
        paymentType: "full",
        receiptNumber: "abc123",
        dashboardUrl: "https://www.gosoccerone.com/dashboard",
        brand: "soccerone",
      }),
    );
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("SoccerOne");
  });

  it("both templates default to Aspire when brand is omitted", async () => {
    const { html } = await renderEmail(
      RegistrationConfirmationEmail(confirmationProps),
    );
    expect(html).toContain("#F5EFE3");
    expect(html).toContain("Aspire Sports Ohio");
  });
});
```

(Adapt prop objects to each template's actual props interface — read the two template files first; the lists above are from the send-layer call sites and may have optional extras.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/email/email-layout-brand.test.ts`
Expected: FAIL — templates don't accept `brand`

- [ ] **Step 3: Make the two templates brand-aware**

In each of `registration-confirmation.tsx` and `payment-receipt.tsx`:

1. Add to the props interface:
   ```tsx
   brand?: "aspire" | "soccerone";
   ```
2. Pass it through: `<EmailLayout preview={...} brand={brand}>`.
3. Replace every direct `tokens.X` / `fonts.X` usage (grep hits — reg-confirmation lines ~135, 196–234; receipt lines ~78, 112) with theme-context reads: add `const t = useEmailTheme();` (import from `@/lib/email/components/email-theme`) inside the component and use `t.tokens.X` / `t.fonts.X`. Any module-level style consts that reference tokens move inside the component or become `(t) => ({...})` functions, same pattern as Task 6.
4. Check `src/lib/email/components/status-banner.tsx`: if it imports `tokens`/`fonts` from email-layout, convert it to `useEmailTheme()` the same way (it renders inside the provider, so context is available).

- [ ] **Step 4: Run the full email suite**

Run: `npx vitest run tests/unit/email/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/templates/registration-confirmation.tsx src/lib/email/templates/payment-receipt.tsx src/lib/email/components/status-banner.tsx tests/unit/email/email-layout-brand.test.ts
git commit -m "feat(email): brand-aware registration confirmation + payment receipt"
```

---

### Task 8: Thread brand through the send layer and callers

**Files:**
- Modify: `src/lib/email/send.ts:140-258` (the two params interfaces + functions)
- Modify: `src/lib/stripe/handle-registration-payment-succeeded.ts:126-163`
- Modify: `src/lib/registrations/create-registration.ts` (input interface + email call ~line 143)
- Modify: `src/pages/api/registrations/index.ts` and `src/pages/api/registrations/guest-checkout.ts` (pass brand)
- (Not modified: `src/pages/api/admin/walk-up-registration.ts` — admin-side, Aspire default is correct)

- [ ] **Step 1: send.ts — brand param + origin fix**

In `src/lib/email/send.ts`, add the import:

```ts
import { originForBrand } from "@/lib/organization/soccerone-routing";
```

Add to BOTH `SendRegistrationConfirmationParams` and `SendPaymentReceiptParams`:

```ts
  /** Brand attribution for the purchase — from Stripe metadata.brand or
   *  the request host. Controls email template + link origin. Defaults
   *  to aspire. */
  brand?: "aspire" | "soccerone";
```

In `sendRegistrationConfirmationEmail`, replace `const appUrl = env.PUBLIC_APP_URL;` with:

```ts
  const appUrl = originForBrand(params.brand) ?? env.PUBLIC_APP_URL;
```

and add `brand: params.brand,` to the `RegistrationConfirmationEmail({...})` props.

Same two changes in `sendPaymentReceiptEmail` (origin line 228, `PaymentReceiptEmail({...})` props).

- [ ] **Step 2: Webhook handler passes Stripe metadata brand**

In `src/lib/stripe/handle-registration-payment-succeeded.ts`, add to BOTH the `sendRegistrationConfirmationEmail({...})` call (line 126) and the `sendPaymentReceiptEmail({...})` call (line 148):

```ts
        brand: paymentIntent.metadata?.brand === "soccerone" ? "soccerone" : "aspire",
```

- [ ] **Step 3: create-registration threads brand from its API callers**

In `src/lib/registrations/create-registration.ts`:

1. Add to `CreateRegistrationInput`:
   ```ts
   /** Host-derived brand of the request that created the registration. */
   brand?: "aspire" | "soccerone";
   ```
2. Destructure it where the other inputs are destructured, and add `brand,` to the `sendRegistrationConfirmationEmail({...})` call (~line 143). If the file has more than one `sendRegistrationConfirmationEmail` call, add it to each.

In `src/pages/api/registrations/index.ts` and `src/pages/api/registrations/guest-checkout.ts`: find the `createRegistration({...})` call, add:

```ts
      brand: brandFromHost(request.headers.get("host") ?? ""),
```

with the import `import { brandFromHost } from "@/lib/organization/soccerone-routing";` (both files already deal with checkout creation; check whether the import already exists before adding).

- [ ] **Step 4: Type-check + full unit suite**

Run: `npx tsc --noEmit && npx vitest run tests/unit/`
Expected: 0 errors, all unit tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/send.ts src/lib/stripe/handle-registration-payment-succeeded.ts src/lib/registrations/create-registration.ts src/pages/api/registrations/index.ts src/pages/api/registrations/guest-checkout.ts
git commit -m "feat(email): brand-correct origin + template on booking emails"
```

---

### Task 9: Full verification + visual QA

- [ ] **Step 1: Full local gate (pre-push checklist, no schema changes → no migration step)**

With dev server running (`R2_MOCK=1 CRON_SECRET=test npm run dev`):

```bash
npm run db:seed:e2e
CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api
PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test
npm run build
npx tsc --noEmit
```

Expected: everything green.

- [ ] **Step 2: Visual QA — SoccerOne skin**

In a browser against the dev server, walk `http://soccerone.localhost:4321` + each path and eyeball for contrast/readability rough spots (cream-designed pages now on ink):

- `/signin` — SoccerOne header, dark page, lime CTA
- `/register/<seasonId>` (grab a seasonId from `/api/public/seasons`) — full wizard pass
- `/dropin/<sessionId>` (from the pickup page) — list + detail
- `/dashboard` (sign in as `parent@test.aspiresports.com` / `TestParent123!`) — play/family/start pages, chrome + tokens only
- `/memberships`

Fix-ups go into `BRAND_THEMES.soccerone.cssVars` (semantic var adjustments), never per-component hacks.

- [ ] **Step 3: Visual QA — regressions**

- `http://localhost:4321/` + `/signin` + `/register/<seasonId>` — Aspire byte-identical (spot-check: cream bg, Newsreader headings, ribbon present)
- `http://soccerone.localhost:4321/` — the SoccerOne **marketing** homepage. The brand CSS override now also applies on marketing pages (they share BaseLayout-free chrome but the html[data-brand] block ships on shared pages only — marketing pages use their own header import; verify the homepage still renders exactly as before)

- [ ] **Step 4: Email preview QA**

Render both brands of both templates to static HTML and open them:

```bash
npx vitest run tests/unit/email/ # confirms render
```

Then use a scratch script or the react-email preview (if configured) to eyeball: Aspire confirmation unchanged; SoccerOne confirmation dark/lime with wordmark; links point at `https://www.gosoccerone.com/...` when brand=soccerone.

- [ ] **Step 5: Ship**

Invoke the `/ship` skill (runs migration-drift, env-drift, E2E-filter scans + build + tsc) and open the PR. One commit per PR is the repo norm for follow-ups, but this feature lands as its own multi-commit PR from `feat/brand-skinned-booking`.

PR body must note the founder-gated launch step from the spec: **verify gosoccerone.com in Resend** before SoccerOne emails can send from `hello@gosoccerone.com`; until then they send from the Aspire domain with the SoccerOne display name.

---

## Self-review notes (spec → plan coverage)

- Spec §1 brand plumbing → Task 3. §2 theme module → Tasks 1–2. §3 BaseLayout → Task 4. §4 emails → Tasks 5–8. §6 error handling → fallbacks in `getBrandTheme`/`emailThemeFor` (Tasks 2, 5). §7 testing → unit in Tasks 2/3/5/6/7, e2e in Task 4, visual QA in Task 9.
- Deviation from spec: `BrandTheme.emailTemplate` field dropped — email theming keys directly off `BrandId` via `emailThemeFor()`; a separate indirection field had no consumer (YAGNI).
- Deviation from spec: the e2e host signal is a real `soccerone.localhost` host entry rather than Host-header spoofing — Chromium resolves `*.localhost` to loopback, making both Playwright and manual browser QA possible with zero DNS setup.
- Two selectors/values flagged inline as needing a file-read before use: the Aspire nav root selector (Task 4 Step 1) and the SoccerOne footer address line (Task 5 Step 3).

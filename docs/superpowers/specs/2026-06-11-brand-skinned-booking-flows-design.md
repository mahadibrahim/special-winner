# Brand-skinned booking flows — design

**Date:** 2026-06-11
**Status:** approved (founder, this session)
**Context:** Single-org cutover (PR #168) made gosoccerone.com a host-keyed brand skin over the Aspire org. The money layer is already brand-correct (Stripe `metadata.brand`, success/cancel URLs via `url.origin`, magic-link origins via `originForBrand()`). What leaks: shared transactional pages (`/register`, `/dropin/*`, rentals, `/signin`, `/dashboard`) render Aspire chrome on the SoccerOne host, and registration-confirmation / payment-receipt emails hardcode `env.PUBLIC_APP_URL` and the Aspire visual layout.

## Decision summary

| Question | Decision |
|---|---|
| Depth | Build the brand theming system now (not a one-off host hack) |
| Marketing tree | Out of scope — `/soccerone/*` pages keep their hardcoded chrome; this effort covers shared booking/transactional surfaces only |
| Dashboard | Chrome + color tokens only; no brand-conditional copy |
| Emails | Full per-brand templates (SoccerOne dark/lime variant), plus the link-origin fix |
| Architecture | **Approach B** — typed themes in code keyed by brand id; `brand_profiles` supplies identity/content (displayName, footerCopy, logo), not tokens |

Rejected alternatives: (A) fully DB-driven `colorTokens` JSONB — theme correctness would live in prod data with no type-checking or CI net; (C) code defaults + zod-validated DB override — most machinery for no current benefit. C remains the natural future upgrade and requires only swapping the theme-lookup internals.

## 1. Brand identity plumbing

Middleware already resolves `locals.brand` (the `brand_profiles` row, nullable, non-blocking). Add alongside it:

```ts
locals.brandId = brandFromHost(hostname); // "aspire" | "soccerone"
```

`brandFromHost()` already exists in `src/lib/organization/soccerone-routing.ts`. `brandId` is pure/host-derived — no DB dependency, available to every page and API route, and has no failure mode.

## 2. Theme module — `src/lib/branding/themes.ts`

```ts
type BrandId = "aspire" | "soccerone";

interface BrandTheme {
  id: BrandId;
  displayName: string;            // fallback when no brand_profiles row
  chrome: "aspire" | "soccerone"; // which header/footer pair BaseLayout renders
  favicon: string;
  cssVars: Record<string, string> | null; // semantic-var overrides; null = none
  fonts: FontSpec[] | null;       // Anton + DM Sans for soccerone
  emailTemplate: BrandId;
}

const BRAND_THEMES: Record<BrandId, BrandTheme>;
function getBrandTheme(id: BrandId): BrandTheme;
```

- **Aspire:** `cssVars: null`, `fonts: null`, `chrome: "aspire"`. The Aspire site renders byte-identically by construction — no override path executes.
- **SoccerOne:** `cssVars` lift values from `src/styles/soccerone-tokens.css` (ink background, lime primary, navy accents) mapped onto the existing semantic variables in `globals.css` (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--card`, `--border`, `--muted`, …). The Tailwind 4 `@theme inline` block maps those vars to utility classes, so booking pages retheme without component changes (verified: registration components contain zero hardcoded hex).
- `soccerone-tokens.css` remains the source of truth for the marketing tree; `themes.ts` and the CSS file carry cross-reference comments. Divergence is a code-review concern, accepted for now (Approach C kills it later).

## 3. BaseLayout integration

BaseLayout reads `locals.brandId` → `getBrandTheme()`, then:

1. Sets `data-brand={id}` on `<html>` and injects an inline `<style>` overriding the semantic vars when `cssVars` is non-null (SSR — no flash of unbranded content).
2. Loads brand fonts when `fonts` is non-null.
3. Defaults the favicon from the theme; an explicit per-page `favicon` prop still wins.
4. When navigation is enabled and `theme.chrome === "soccerone"`, renders `SoccerOneHeader`/`SoccerOneFooter` instead of `Navigation`/`Footer`.

`/soccerone/*` marketing pages pass `navigation={false}` and own their chrome — untouched.

### Covered surfaces

The middleware shared-route passthrough list: `/register/[seasonId]`, `/dropin/[sessionId]` (including the `?booking=success|cancelled` states), rentals booking pages, `/signin` + magic-link landing, `/memberships`, `/dashboard/**` (chrome + tokens only).

### Known risk — dark retheme of cream-designed pages

Booking pages were designed on cream; ink/lime can surface contrast rough spots (shadows, borders, imagery). Mitigations: model the SoccerOne `cssVars` on the existing dark-mode variable block in `globals.css`; visual QA pass per surface before merge; fixes land in the theme's semantic vars, never as per-component hacks.

## 4. Emails — full per-brand templates

- Brand-keyed template registry: `getEmailLayout(brandId)`. Aspire layout unchanged; new SoccerOne layout (dark/lime to match the site). Email-client dark-rendering compromises (e.g. Gmail color rewriting) get flagged during implementation; the variant may be "SoccerOne-styled light" where dark is untenable.
- `sendRegistrationConfirmationEmail` and `sendPaymentReceiptEmail` gain a `brand` param. Link origin becomes `originForBrand(brand) ?? env.PUBLIC_APP_URL` — this also fixes the hardcoded-Aspire-links leak.
- Callers: webhook handlers read `metadata.brand` (already stamped on all four charge types: registration, drop-in, rental, membership); request-path callers use `brandFromHost(host)`.
- Unknown/missing brand falls back to the Aspire template and origin.

### Founder-gated launch step

Sending from `hello@gosoccerone.com` requires verifying gosoccerone.com in Resend. Until verified, SoccerOne emails send from the verified Aspire domain with a "SoccerOne" display name. Add to the launch checklist.

## 5. Out of scope / unchanged

- Stripe metadata, checkout success/cancel URLs, magic-link origins (already correct).
- The `/soccerone/*` marketing page tree and `soccerone-tokens.css`.
- Brand-conditional copy anywhere (dashboard says "your membership", not "your SoccerOne membership").
- DB-driven token overrides (Approach C, future).
- New brands beyond aspire/soccerone (the seam supports them; nothing is seeded).

## 6. Error handling

- `brandId` is host-derived and pure — no failure mode; unknown hosts resolve to `"aspire"` (existing `brandFromHost` behavior).
- `brand_profiles` lookup stays non-blocking; a missing row degrades to `theme.displayName` and theme-default content.
- Email brand param falls back to Aspire template + origin when absent/unknown.

## 7. Testing

- **Unit:** every `BrandId` has a complete theme; SoccerOne `cssVars` keys are a subset of the semantic vars defined in `globals.css`; email send functions produce links with the correct origin per brand; template registry falls back to Aspire on unknown brand.
- **E2E (Playwright):** on a SoccerOne-host request, `/register/[seasonId]` and `/dashboard` carry `data-brand="soccerone"` and SoccerOne chrome; on the Aspire host, the same pages carry no override (regression guard). Reuse the host-spoofing pattern from the PR #168 e2e tests.
- **Visual QA:** browser pass over each SoccerOne-skinned booking surface before merge.

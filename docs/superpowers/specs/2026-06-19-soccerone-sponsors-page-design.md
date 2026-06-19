# SoccerOne Sponsors Page — Design

**Date:** 2026-06-19
**Status:** Approved design, pending implementation plan
**Author:** brainstorming session (mahadibrahim + Claude)

## 1. Goal

Build a **sales/lead-gen** Sponsors page for the SoccerOne brand (`gosoccerone.com`)
that pitches local businesses on sponsoring SoccerOne's two indoor facilities
(Worthington + Downtown), shows real package pricing, and captures inquiries by
emailing the SoccerOne inbox.

This is a marketing page that **sells** sponsorships. It is **not**:
- a wall showcasing current sponsors (explicitly out of scope for v1),
- the Aspire `sponsors.astro` page (a discount-bar directory — unrelated concept),
- backed by any DB table or admin tooling.

### Decisions locked in brainstorming
- **Page job:** sell sponsorships (sales page).
- **Pricing:** show **real prices** publicly.
- **Lead capture:** **form → email only** (no DB table). Endpoint emails the
  SoccerOne inbox via Resend; lead lives in the inbox.
- **Tier lineup:** four cumulative tiers at **$300 / $1,000 / $2,500 / $5,000**
  plus à-la-carte add-ons, anchored on Resolute Athletic Complex's real Columbus
  indoor-soccer rate card (the closest comparable from the pricing research).
- **Tier names:** soccer-themed — **Supporter / Sideline / Center Circle / Title**.

### Pricing provenance (research, 2026-06-18 deep-research run)
- Resolute Athletic Complex (Columbus, OH indoor soccer): Digital **$300**/yr,
  Training-Field 4'×20' banner **$1,000**/field/yr, Giant-Wall 15'×29' **$2,500**/field/yr,
  10% multi-ad discount. ← primary anchor; same venue type as SoccerOne.
- Tournament/event Title tier ~**$5,000** (PVSC United Diamond): naming rights,
  logo in event branding, apparel, activation booth.
- Jersey front-of-shirt premium **$2,501–$5,000** (Ohio City SC) → informs the
  à-la-carte team-kit add-on.

## 2. Tier structure (page content)

Cumulative ladder — each tier includes everything below it. **1-year term.**
Sponsor supplies print-ready artwork; **10% discount** when buying multiple assets
or sponsoring both facilities.

| Tier | Price/yr | Adds on top of the tier below |
|------|----------|-------------------------------|
| **Supporter** | **$300** | Logo + link on the SoccerOne site, rotation on lobby TV screens, social shout-outs, newsletter mention |
| **Sideline** | **$1,000** | A 4'×20' wall banner at one facility |
| **Center Circle** | **$2,500** | Premium giant wall banner behind the player benches |
| **Title** | **$5,000** | Everything across **both** facilities + "presented by" billing on a league or event + activation booth + logo on team kits |

**À-la-carte add-ons** (single-asset buys for businesses who don't want a full tier):
- **Team / league kit sponsor** — ~$1,000–$2,500, front-of-jersey is the premium placement.
- **Tournament title sponsor** — ~$5,000, event naming + apparel + booth.

> **Open content item:** the "Why sponsor" section needs real reach numbers
> (players/families/weekly foot traffic across the two facilities). Build with
> clearly-marked placeholders; mahadibrahim to supply real figures. Prices may
> also be tweaked post-build — structure is fixed, numbers are editable in one place.

## 3. Page architecture

**File:** `src/pages/soccerone/sponsors.astro`
**Public URL:** `/sponsors` on a SoccerOne host (rewritten from `/soccerone/sponsors`).

Follows the established SoccerOne marketing-page pattern (cf. `pickup.astro`,
`leagues.astro`):
- Wraps `BaseLayout` with `navigation={false} footer={false}`,
  `favicon="/soccerone-favicon.svg"`, `bodyClass="… bg-[#0a0a0d] text-white …"`,
  and the Anton / DM Sans / JetBrains Mono font `<link>`s in the `head` slot.
- Renders `SoccerOneHeader` + `SoccerOneFooter` (not the Aspire chrome).
- All styling via **scoped `<style>` blocks** using `--so-*` tokens from
  `src/styles/soccerone-tokens.css`. No Tailwind utility classes on the page body.
  No new tokens unless a genuinely new shade is needed (then add to the token file).
- `<Toaster client:load richColors position="bottom-right" />` for form feedback.

**Prerender:** `export const prerender = false;` (SSR), matching the rest of the
`soccerone/*` subtree. Content is static, but SSR keeps brand/host resolution
uniform with sibling pages and avoids any prerender-time host-theming surprise.
The cost is negligible (no DB queries on this page).

### Page sections (top → bottom)
1. **Hero** — headline ("Put your brand on the pitch" or similar), lime accent,
   one-line value prop, a "Become a sponsor" button that scrolls to the form.
2. **Why sponsor SoccerOne** — 3–4 stat/value cards. *Placeholder stats, flagged.*
3. **Sponsorship tiers** — card grid, the four tiers with real prices and the
   cumulative "everything in X, plus…" framing. Title tier visually highlighted.
4. **À-la-carte add-ons** — the team-kit and tournament-title options.
5. **FAQ** — term length (1 yr), artwork specs/responsibility, multi-asset/both-
   facility discount, how digital + on-site recognition works, who to contact.
6. **Inquiry form** — "Become a sponsor" (see §4).

### Tier data shape
Define the tiers/add-ons/FAQ as **plain const arrays in the page frontmatter**
(or a small co-located `sponsors-data.ts`) so prices live in exactly one place and
are trivially editable. No DB, no schema.

## 4. Inquiry form + endpoint

### Component: `src/components/soccerone/SponsorInquiryForm.tsx`
- `"use client"` React island, rendered `client:load`.
- Calls `useHydrationBeacon()` (sets `data-hydrated` for any future Playwright run).
- Styling consistent with SoccerOne form fields; reuse field/markup conventions
  from `corporate-inquiry-form.tsx` but themed to the dark/lime palette.
- Fields:
  - `businessName` (required)
  - `contactName` (required)
  - `contactEmail` (required, email)
  - `contactPhone` (optional)
  - `website` (optional)
  - `tierInterest` (optional select: Supporter / Sideline / Center Circle / Title / Team kit / Tournament / Not sure)
  - `facility` (optional select: Worthington / Downtown / Both / No preference)
  - `message` (optional textarea)
- Posts JSON to `/api/public/sponsor-inquiry`.
- UX: disabled/loading state on submit; on `{ok:true}` show a success state
  (toast + inline confirmation, clear the form); on error show `toast.error` and,
  as a fallback, surface a direct mailto to the SoccerOne inbox so the lead is
  never silently lost.

### Endpoint: `src/pages/api/public/sponsor-inquiry.ts`
Modeled on `corporate-inquiry.ts`, but **emails instead of inserting to a DB table**:
- `POST` only. Zod-validated body matching the form fields (trim/length caps;
  `contactEmail` lowercased + email-validated; selects validated against enums).
- **Rate limit per IP** via `rateLimit("sponsor-inquiry:ip:<ip>", 5, 60_000)` →
  `rateLimitedResponse` on breach (same guard as corporate-inquiry).
- On valid input, send a notification email via `sendEmail()` from
  `@/lib/email/index`:
  - `from: fromForBrand("soccerone")`
  - `to:` SoccerOne inbox — new env var **`SOCCERONE_INQUIRY_INBOX`**, with a
    sensible hardcoded SoccerOne fallback address if unset.
  - `replyTo:` the sponsor's `contactEmail` (so a reply goes straight to them).
  - `subject:` e.g. `New SoccerOne sponsor inquiry — <businessName>`.
  - `html` + `text`: a simple, readable dump of all submitted fields. A minimal
    hand-built HTML body is fine; a branded React email template is **not**
    required for an internal notification (keep it light).
- **Response contract:**
  - `200 {ok:true}` when validation passes **and** the email sends, **or** when
    email is not configured locally/CI (`isEmailConfigured()` false → log a warning,
    still return ok; we don't fail a dev/CI submit over missing SMTP creds).
  - `400` on invalid JSON / failed validation.
  - `429` on rate-limit breach.
  - `502 {error}` when email **is** configured but the send returns an error —
    so the form shows its mailto fallback and the lead isn't dropped.
- No `locals.organization` requirement (unlike corporate-inquiry) — this endpoint
  writes nothing org-scoped; it just emails. Brand is hardcoded SoccerOne (the page
  only exists on the SoccerOne host).

### New env var
`SOCCERONE_INQUIRY_INBOX` — recipient for sponsor inquiry notifications. Feature-
gated/optional: unset → fallback address + the soft-success behavior above. Document
in the spec's env note; add to Netlify when the real inbox is known.

## 5. Routing

Add one entry to `SOCCERONE_MARKETING_REWRITES` in
`src/lib/organization/soccerone-routing.ts`:

```ts
"/sponsors": "/soccerone/sponsors",
```

This is the single source of truth; the inverse (long→short canonical redirect) is
derived from it automatically. The `/api/public/*` path is **not** rewritten (API
routes are shared and pass through unchanged), so the endpoint is reachable on both
hosts — fine, since it only emails.

**Footer link:** add a "Sponsors" link to `SoccerOneFooter.astro` (B2B page → footer
placement, not the primary consumer nav/header).

## 6. Testing

- **Unit** — extend `tests/unit/organization/soccerone-routing.test.ts`: assert
  `rewriteSoccerOnePath("/sponsors") === "/soccerone/sponsors"` and that the
  inverse canonical redirect maps `/soccerone/sponsors → /sponsors`.
- **API** — new `tests/api/sponsor-inquiry.test.ts`: 400 on missing required
  fields / bad email, 200 on a valid payload (email unconfigured in CI → soft
  success path), 429 after exceeding the per-IP burst. (No DB assertions — nothing
  is persisted.)
- **E2E** — optional. A Playwright spec that loads `/sponsors` on the SoccerOne
  host and submits the form would be nice, but SoccerOne e2e is not seeded in CI
  and these specs skip there; the page is static (no seed needed) so a local-only
  smoke test is acceptable. Not a blocker for v1.
- **Build + typecheck** — `npm run build` (catches SSR/prerender mistakes) and
  `npx tsc --noEmit` (zero errors) per the repo pre-push checklist. No migration
  (no schema change), so no `db:generate` step.

## 7. Files touched (summary)

**New:**
- `src/pages/soccerone/sponsors.astro` — the page.
- `src/components/soccerone/SponsorInquiryForm.tsx` — form island.
- `src/pages/api/public/sponsor-inquiry.ts` — email-only inquiry endpoint.
- `tests/api/sponsor-inquiry.test.ts` — endpoint tests.
- (optional) `src/pages/soccerone/sponsors-data.ts` — tier/add-on/FAQ content.

**Edited:**
- `src/lib/organization/soccerone-routing.ts` — add `/sponsors` rewrite.
- `tests/unit/organization/soccerone-routing.test.ts` — assert the new mapping.
- `src/components/soccerone/SoccerOneFooter.astro` — add Sponsors link.

**No** schema migration, **no** new DB table, **no** admin UI.

## 8. Out of scope (v1)
- Current-sponsors logo wall / recognition page.
- Persisting inquiries to a DB or admin pipeline (inbox-only by decision).
- Online checkout / paying for a sponsorship on the site.
- Per-facility differentiated pricing (single rate card covers both; "both
  facilities" is a Title-tier benefit and a discount lever, not separate SKUs).
- Branded React email template for the internal notification.

## 9. Risks / notes
- **Placeholder stats** in the "Why sponsor" section must be replaced with real
  numbers before this is shown to prospects. Flagged in copy.
- **Prices are editable** — kept in one const block so a tweak is a one-line change.
- `SOCCERONE_INQUIRY_INBOX` must be set in Netlify (with the real inbox) before
  go-live, or inquiries fall back to the hardcoded address.
- Build will emit the known `Astro.request.headers` prerender false-positive
  warnings (repo-wide, harmless) — not specific to this page.

# Join Page (Aspire + Soccer One) — Design Spec

**Date:** 2026-06-16
**Status:** Approved design, pending implementation plan

## Goal

A mobile-first "join" landing page, linked from QR codes on print and digital
flyers, that converts a flyer scan into:

1. **Email list signup** (the channel we own) — captured into our DB, with a
   discount-code incentive emailed back.
2. **WhatsApp** — one-tap link out to a shared group/contact.
3. **Social follows** — one-tap link out to each brand's social accounts.

Two brand variants: **Aspire Sports** and **Soccer One**. Soccer One is a brand
skin on the same underlying org (single-org cutover, 2026-06-11), distinguished
at runtime by request host.

## Scope decisions (from brainstorming)

| Decision | Choice |
| --- | --- |
| Channel mechanics | Email **captures** to our DB; social + WhatsApp **link out**. |
| Link configuration | Typed brand config in code (no admin UI, no DB). |
| Email signup | **Incentive** signup — emails back a discount code. |
| Incentive code | **Shared** across both brands (reuse existing `WELCOME15`/$15); email is brand-styled. Per-brand codes are a future option, not built now. |
| WhatsApp link | **Single shared link** for both brands. |
| Layout | **Channel cards** (layout C) — distinct Email / WhatsApp / Social cards. |
| URL | `/join` on both brand hosts. |

## Architecture

### Routing & pages

- `src/pages/join.astro` — Aspire. Served at `aspiresportsohio.com/join`.
- `src/pages/soccerone/join.astro` — Soccer One. Served at
  `gosoccerone.com/join` via the existing middleware rewrite.
- **Both SSR** (no `prerender` flag). The Soccer One page must be SSR for the
  host-based rewrite; the Aspire page is kept SSR for symmetry and so it can read
  request-time brand/org context.
- Each `.astro` page is a thin wrapper: `BaseLayout` + the shared React
  component, passing the brand id (`Astro.locals.brandId`).

**Middleware change:** add `"/join": "/soccerone/join"` to
`SOCCERONE_MARKETING_REWRITES` in
`src/lib/organization/soccerone-routing.ts` (the rewrite table is exact-match;
unlisted paths pass through unchanged). Update the corresponding unit test for
the routing map.

### Components

New directory `src/components/join/` (decomposed per the registration-wizard
convention — one concern per file):

- **`join-page.tsx`** — top-level `client:load` component. Calls
  `useHydrationBeacon()` for e2e. Renders the three channel cards (layout C).
  Takes `brand` + resolved brand config as props. Reads the `?src=` flyer tag
  from the URL for attribution/analytics.
- **`join-email-card.tsx`** — the email card containing the form. Single email
  field → incentive. Reuses the submit pattern from `CaptureBand`. States:
  - Inline validation/API errors via `<ErrorBanner />`.
  - Transient failures via `toast.error(...)`.
  - Success: inline confirmation ("You're on the list — check your email for
    your $15 code").
- WhatsApp card and Social card are simple link-outs rendered from config (no
  form state).

### Brand config (typed, in code)

New `src/lib/branding/join-config.ts`:

- A map keyed by `'aspire' | 'soccerone'`, each entry holding:
  - `headline`, `subcopy`
  - `socials` — `{ instagram?, facebook?, youtube?, tiktok?, ... }`
- A **shared** `WHATSAPP_URL` constant (one link, both brands).
- The incentive (`WELCOME15` / $15) is **not** duplicated here — it stays in
  `src/lib/marketing/capture-incentive.ts` (shared). `join-config.ts` only
  references the incentive amount for display copy via the existing
  `formatIncentiveAmount` / `CAPTURE_INCENTIVE`.

Placeholder values are used for any social/WhatsApp URL not yet provided; the
real URLs are dropped in when supplied.

### Endpoint & incentive (reuse `/api/public/newsletter`)

Extend the existing endpoint rather than add a new one — it already handles
rate-limiting, org-scoping, and email upsert into `newsletter_signups`.

`src/pages/api/public/newsletter.ts`:

- Accept an optional `brand` field (`"aspire" | "soccerone"`, validated) in the
  body schema.
- The join form posts `source = "join-page"`. Persist `source` as today
  (attribution). When a `?src=` flyer tag is present, store it in the existing
  `notes` column (e.g. `flyer:fall25-powell`) for campaign attribution.
- **Incentive trigger:** today the incentive email fires only when
  `source === CAPTURE_INCENTIVE_SOURCE` (`"home-incentive"`). Generalize this to
  a small helper (e.g. `sourceTriggersIncentive(source)`) covering both
  `"home-incentive"` and `"join-page"`, so the join page also delivers the code.

`src/lib/marketing/capture-incentive.ts` and the email send:

- The incentive code stays shared (`WELCOME15`). Pass `brand` through to
  `sendCaptureIncentiveEmail({ recipientEmail, brand })` so the email template /
  from-name / styling match the brand the visitor came from. Default `brand`
  to `"aspire"` for existing callers (the home capture band).

### Analytics (flyer measurement)

PostHog events emitted from `join-page.tsx`, each with a `brand` property and the
`?src=` flyer tag:

- `join_page_viewed`
- `join_email_submitted`
- `join_whatsapp_click`
- `join_social_click` (with which network)

This is what makes "which flyer drove signups" answerable. QR codes encode
`/join?src=<campaign>` (e.g. `?src=fall25-powell-flyer`).

## Data flow

1. Visitor scans flyer QR → lands on `/join?src=<campaign>` on the brand host.
2. Middleware sets `brandId` (and rewrites to `/soccerone/join` on Soccer One
   hosts).
3. Page renders channel cards from the resolved brand config.
4. **Email:** form POSTs `{ email, source: "join-page", brand }` →
   `/api/public/newsletter` → upsert into `newsletter_signups` → brand-styled
   incentive email sent → inline success state.
5. **WhatsApp / Social:** anchor link-outs; click fires a PostHog event.

## Error / loading / empty handling

- Form validation + API errors: `<ErrorBanner />` (inline).
- Transient send failures: `toast.error(...)`. Signup is already stored
  server-side even if the incentive email hiccups (existing behavior — the
  endpoint never 500s on Resend failure).
- No empty/loading-list states (no data fetching on the page).

## Testing

- **Unit** (`tests/unit/`):
  - `join-config` resolution per brand.
  - `sourceTriggersIncentive()` covers `home-incentive` + `join-page`.
  - `SOCCERONE_MARKETING_REWRITES` includes `/join → /soccerone/join`.
- **API** (`tests/api/`):
  - `/api/public/newsletter` accepts `brand` + `source="join-page"` and stores
    the signup; incentive path exercised for `join-page`.
- **E2E** (`tests/e2e/`):
  - Load `/join`, submit email → success state (use `waitForHydration`,
    click-driven interactions).
  - Soccer One variant (`soccerone.localhost`) renders its theme.

## Out of scope (follow-ups)

- Generating the actual QR code image assets.
- Flyer artwork / print design.
- Admin UI for editing social/WhatsApp links (links live in code by decision).
- Per-brand discount codes (shared code is used now).

## Open content items to supply before/at implementation

- Real social URLs per brand (Instagram, Facebook, YouTube, TikTok, others).
- The shared WhatsApp group invite / `wa.me` link.
- Final headline/subcopy per brand (placeholders used until provided).

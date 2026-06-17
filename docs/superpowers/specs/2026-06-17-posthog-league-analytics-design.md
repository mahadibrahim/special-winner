# PostHog League Analytics — Instrumentation Spec

**Date:** 2026-06-17
**Status:** Design validated in brainstorming (event catalog approved). Pending spec review → implementation plan.
**Scope:** "Comprehensive sweep" — the league-pages conversion funnel + registration-wizard step funnel + the gap fixes (brand on guest checkout, Drop League events, magic-link identify).

## Goal

Make the new adult-soccer funnel measurable end-to-end, so we can answer: which **brand / sport / skill level / venue / term** converts, where people **drop off** in registration, and what the lead-in pages drive — using the analytics infra that already exists.

## What already exists (reuse, don't rebuild)

- **Client:** `track(event, props)` in `src/lib/analytics/track.ts` (noop-safe when no key — so unit-testable + safe in CI). PostHog browser init in `src/components/posthog.astro` with a **`brand` super-property** (`aspire|soccerone` from host) on every event, `identify()` on SSR pages, and the `/ingest` reverse-proxy.
- **Server:** `getPostHogServer()` in `src/lib/posthog-server.ts`; `capturePaymentCompleted()` (revenue). Existing server events: `user_signed_in/up`, `registration_created/waitlisted/cancelled`, `checkout_initiated/zero_amount/create_failed`, `guest_checkout_started/completed`, `payment_completed`.

So the **back half** of the funnel (create → checkout → pay) is already server-side. This spec adds the **front half** (page/finder/register-intent) + wizard steps + the gaps.

## Architecture — a typed events module

Create `src/lib/analytics/events.ts`:
- **Client event-name constants** + thin typed wrappers that call `track()`, e.g.
  `trackDivisionRegisterClicked({ seasonId, level, gender, venue, mode, term })` → `track("division_register_clicked", {...})`.
- **Server event-name constants** (re-export the existing names + the new ones) so server callsites stop using string literals.
- A single place that documents the catalog → consistent names, no typos, **unit-testable** (assert each wrapper emits the right name + prop keys via a mocked `track`).
- **Privacy rule baked in:** wrappers accept ids/slugs/enums only — no name/email/PII params. Brand is NOT passed (it's the auto super-property).

## Event catalog (snake_case)

### League pages (client — via the typed wrappers)
| Event | Fired in | Props |
| --- | --- | --- |
| `league_landing_tab_viewed` | `soccer-landing-tabs.tsx` (on tab change + initial) | `sport`, `tab` (overview\|this\|upcoming\|past) |
| `league_landing_cta_clicked` | landing hero banner + overview season CTA | `term` |
| `league_season_viewed` | season page island (`season-tabs.tsx` mount) | `sport`, `term` |
| `division_filter_applied` | `divisions-finder.tsx` (on chip/ladder select) | `facet` (level\|format\|day\|venue), `value`, `term` |
| `division_register_clicked` | `divisions-finder.tsx` row Register/Notify | `season_id`, `level`, `gender`, `venue`, `mode` (team\|individual\|interest), `term` |
| `standings_division_selected` | `standings-panel.tsx` selector | `term`, `season_id` |
| `catalog_sport_tile_clicked` | `adult/leagues.astro` tiles (small inline script or wrapper) | `sport`, `state` (live\|coming_soon) |

### Registration wizard (client)
| Event | Fired in | Props |
| --- | --- | --- |
| `registration_step_viewed` | `registration-wizard.tsx` (on step change) | `step` (who\|agreements\|payment\|confirm), `season_id` |
| `registration_payment_method_selected` | `payment-step.tsx` | `method` (card\|bank\|…) |

### Gap fixes
- **Brand on guest checkout (server):** add `brand: brandFromHost(...)` to the existing `guest_checkout_started` / `guest_checkout_completed` captures in `src/pages/api/registrations/guest-checkout.ts` (the authed flows already tag brand; guest ones don't).
- **Drop League (server):** add `drop_register_submitted` `{ drop_season_id }` in `src/pages/api/public/drop-register.ts` (currently emits nothing).
- **Magic-link identify:** ensure the browser is `identify()`-ed after a magic-link login. Today `posthog.astro` identifies on SSR pages from `locals.user`; a magic-link redirect can land on a page where that runs — verify, and if the post-login landing doesn't carry the user, add an `identify()` on the email-link-signin success path. (Read `src/pages/email-link-signin.astro` + `posthog.astro` to pick the minimal fix.)

## Funnels (defined in the PostHog UI; documented here)

1. **League conversion:** `league_season_viewed` → `division_register_clicked` → `registration_created` → `payment_completed` — segment by `brand` / `sport` / `level` / `venue` / `term`.
2. **Lead-in → season:** `league_landing_tab_viewed` → `league_season_viewed` → `division_register_clicked`.
3. **Registration drop-off:** `registration_step_viewed` (who→agreements→payment→confirm) → `registration_created` → `payment_completed`.
4. **Catalog entry:** `catalog_sport_tile_clicked` → `league_landing_tab_viewed`.

## Privacy

Properties are **ids/slugs/enums only — never PII**. Brand stays the auto super-property. Respects the existing session-recording masking in `posthog.astro` (COPPA). No new identify of minors; identify only fires for the authenticating user (existing behavior).

## Testing

- **Unit (`tests/unit/`):** the typed wrappers in `events.ts` — mock `@/lib/analytics/track` and assert each wrapper calls `track` with the correct event name + property keys, and that no PII keys are present. (track is noop-safe, so this needs no PostHog.)
- **No `@critical` E2E:** PostHog is a noop in CI (no key), so events don't fire there — an E2E can't meaningfully assert them. Instrumentation correctness is covered by the unit tests; end-to-end firing is verified manually in PostHog Live Events post-deploy.
- **Server events:** light API assertion that the gap-fixed endpoints still return success (no behavior regression); event emission verified in PostHog.

## Out of scope (follow-ups)

- Dashboards/insights built in PostHog (config, not code).
- Backfilling historical events.
- "Coming soon" sport interest-capture wiring (the tile just emits a click event for now).
- Funnels for non-soccer sports (events are generic; light up with those pages).

## Open items to confirm in planning

- Whether `league_season_viewed` fires from the season page's React island mount (client) vs an SSR server event — spec assumes client island mount (simplest, brand super-property attaches).
- Exact wizard step identifiers — match the `registration-wizard.tsx` step constants (`STEP_PLAYER` etc.) when wiring `registration_step_viewed`.

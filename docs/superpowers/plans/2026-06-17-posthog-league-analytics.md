# PostHog League Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument the adult-soccer funnel end-to-end — league landing/season/finder/standings/catalog events + registration-wizard steps + gap fixes (brand on guest checkout, Drop League event, magic-link identify) — via a typed events module on top of the existing PostHog infra.

**Architecture:** A new `src/lib/analytics/events.ts` exposes name constants + thin typed `track*` wrappers (over the existing noop-safe `track()`); client call-sites import the wrappers. Server gap-fixes edit existing `posthog-server` capture calls. Brand rides the existing super-property; properties are ids/slugs/enums only (no PII).

**Tech Stack:** React 19 islands, Astro inline scripts, `posthog-js` (client) / `posthog-node` (server), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-posthog-league-analytics-design.md`.

**⚠️ Environment:** external volume — editor cache can diverge from disk. ABSOLUTE paths, no `cd` in Bash, verify with `git diff`, prove with `npx tsc --noEmit`. `@/`→`src/`.

---

## File Structure
**Create:** `src/lib/analytics/events.ts`, `tests/unit/analytics-events.test.ts`
**Modify (client):** `src/components/leagues/soccer-landing-tabs.tsx`, `divisions-finder.tsx`, `standings-panel.tsx`, `season-tabs.tsx`, `src/pages/adult/leagues.astro`, `src/components/registration/registration-wizard.tsx`
**Modify (server):** `src/pages/api/registrations/guest-checkout.ts`, `src/pages/api/public/drop-register.ts`

---

## Task 1: Typed events module + unit tests

**Files:** Create `src/lib/analytics/events.ts`, `tests/unit/analytics-events.test.ts`

- [ ] **Step 1: Failing test**
```ts
// tests/unit/analytics-events.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as track from "@/lib/analytics/track";
import {
  trackDivisionRegisterClicked, trackLandingTabViewed, trackRegistrationStepViewed,
  trackCatalogSportTileClicked, LEAGUE_EVENTS,
} from "@/lib/analytics/events";

describe("analytics events", () => {
  const spy = vi.spyOn(track, "track").mockImplementation(() => {});
  beforeEach(() => spy.mockClear());

  it("division_register_clicked uses snake_case props, no PII", () => {
    trackDivisionRegisterClicked({ seasonId: "s1", level: "c", gender: "coed", venue: "worthington", mode: "team", term: "fall-2026" });
    expect(spy).toHaveBeenCalledWith("division_register_clicked", { season_id: "s1", level: "c", gender: "coed", venue: "worthington", mode: "team", term: "fall-2026" });
    const props = spy.mock.calls[0][1] ?? {};
    for (const k of Object.keys(props)) expect(/email|name|phone/i.test(k)).toBe(false);
  });
  it("landing_tab_viewed passes sport + tab", () => {
    trackLandingTabViewed({ sport: "soccer", tab: "overview" });
    expect(spy).toHaveBeenCalledWith("league_landing_tab_viewed", { sport: "soccer", tab: "overview" });
  });
  it("registration_step_viewed maps seasonId → season_id", () => {
    trackRegistrationStepViewed({ step: "payment", seasonId: "s9" });
    expect(spy).toHaveBeenCalledWith("registration_step_viewed", { step: "payment", season_id: "s9" });
  });
  it("catalog_sport_tile_clicked carries sport + state", () => {
    trackCatalogSportTileClicked({ sport: "soccer", state: "live" });
    expect(spy).toHaveBeenCalledWith("catalog_sport_tile_clicked", { sport: "soccer", state: "live" });
  });
  it("exposes the event-name catalog", () => {
    expect(LEAGUE_EVENTS.divisionRegisterClicked).toBe("division_register_clicked");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run tests/unit/analytics-events.test.ts`

- [ ] **Step 3: Implement** `src/lib/analytics/events.ts`
```ts
// Typed event catalog over the noop-safe client track(). Props are ids/slugs/
// enums only — never PII. Brand is the auto super-property (posthog.astro).
import { track } from "@/lib/analytics/track";

export const LEAGUE_EVENTS = {
  landingTabViewed: "league_landing_tab_viewed",
  landingCtaClicked: "league_landing_cta_clicked",
  seasonViewed: "league_season_viewed",
  divisionFilterApplied: "division_filter_applied",
  divisionRegisterClicked: "division_register_clicked",
  standingsDivisionSelected: "standings_division_selected",
  catalogSportTileClicked: "catalog_sport_tile_clicked",
  registrationStepViewed: "registration_step_viewed",
  registrationPaymentMethodSelected: "registration_payment_method_selected",
} as const;

// Server-side event names (used by posthog-node callsites in Task 4).
export const SERVER_EVENTS = { dropRegisterSubmitted: "drop_register_submitted" } as const;

export type RegStep = "player" | "agreements" | "payment" | "confirm";

export const trackLandingTabViewed = (p: { sport: string; tab: "overview" | "this" | "upcoming" | "past" }) =>
  track(LEAGUE_EVENTS.landingTabViewed, { sport: p.sport, tab: p.tab });
export const trackLandingCtaClicked = (p: { term: string }) =>
  track(LEAGUE_EVENTS.landingCtaClicked, { term: p.term });
export const trackSeasonViewed = (p: { sport: string; term: string }) =>
  track(LEAGUE_EVENTS.seasonViewed, { sport: p.sport, term: p.term });
export const trackDivisionFilterApplied = (p: { facet: "level" | "format" | "day" | "venue"; value: string; term: string }) =>
  track(LEAGUE_EVENTS.divisionFilterApplied, { facet: p.facet, value: p.value, term: p.term });
export const trackDivisionRegisterClicked = (p: { seasonId: string; level: string; gender: string; venue: string; mode: "team" | "individual" | "interest"; term: string }) =>
  track(LEAGUE_EVENTS.divisionRegisterClicked, { season_id: p.seasonId, level: p.level, gender: p.gender, venue: p.venue, mode: p.mode, term: p.term });
export const trackStandingsDivisionSelected = (p: { term: string; seasonId: string }) =>
  track(LEAGUE_EVENTS.standingsDivisionSelected, { term: p.term, season_id: p.seasonId });
export const trackCatalogSportTileClicked = (p: { sport: string; state: "live" | "coming_soon" }) =>
  track(LEAGUE_EVENTS.catalogSportTileClicked, { sport: p.sport, state: p.state });
export const trackRegistrationStepViewed = (p: { step: RegStep; seasonId: string }) =>
  track(LEAGUE_EVENTS.registrationStepViewed, { step: p.step, season_id: p.seasonId });
export const trackRegistrationPaymentMethodSelected = (p: { method: "bank" | "card" }) =>
  track(LEAGUE_EVENTS.registrationPaymentMethodSelected, { method: p.method });
```

- [ ] **Step 4: Run → PASS.** `npx vitest run tests/unit/analytics-events.test.ts` (5 pass). `npx tsc --noEmit` (zero errors).
- [ ] **Step 5: Commit**
```bash
git add src/lib/analytics/events.ts tests/unit/analytics-events.test.ts
git commit -m "feat(analytics): typed league event catalog + wrappers"
```

---

## Task 2: Instrument the league React islands

**Files:** Modify `soccer-landing-tabs.tsx`, `season-tabs.tsx`, `divisions-finder.tsx`, `standings-panel.tsx` (all under `src/components/leagues/`)

- [ ] **Step 1: Landing tabs** — `soccer-landing-tabs.tsx`. Add import `import { trackLandingTabViewed, trackLandingCtaClicked } from "@/lib/analytics/events";`. In the component, fire on mount + tab change via an effect, and on the season CTAs:
```tsx
  // after `const [tab, setTab] = useState<Tab>("overview");`
  useEffect(() => { trackLandingTabViewed({ sport: "soccer", tab }); }, [tab]);
```
Add `import { useEffect } from "react";` (merge with the existing `useState` import). On the Overview season CTA `<a data-testid="overview-season-cta" ...>` and the "This Season" CTA, add `onClick={() => current && trackLandingCtaClicked({ term: current.slug })}`.

- [ ] **Step 2: Season view** — `season-tabs.tsx`. The island already calls `useHydrationBeacon()`. Add `import { trackSeasonViewed } from "@/lib/analytics/events";` and, once (mount), fire it. The component receives `divisions` (each has `term`? if not, derive from the first division's season term via props). Simplest: the season page passes a `term` + `sport` to `SeasonTabs`; add those props and:
```tsx
  useEffect(() => { trackSeasonViewed({ sport: "soccer", term }); }, [term]);
```
If `SeasonTabs` doesn't already take `term`, add a `term: string` prop and pass it from `[term].astro` (`Astro.params.term`). Add `useEffect` to the React import.

- [ ] **Step 3: Finder filter + register** — `divisions-finder.tsx`. Import `import { trackDivisionFilterApplied, trackDivisionRegisterClicked } from "@/lib/analytics/events";`. The finder needs the `term` — add a `term: string` prop (passed down from `SeasonTabs`/season page). In the `toggle(...)` filter handler, after updating state, fire:
```tsx
    trackDivisionFilterApplied({ facet: facetKeyToName(k), value: String(v), term });
```
where `facetKeyToName` maps the filter key (`level|gender|day|venue`) to the spec's facet names (`gender`→`format`). On each result row's Register/Notify `<a>`, add:
```tsx
    onClick={() => trackDivisionRegisterClicked({ seasonId: d.seasonId, level: d.level, gender: d.gender, venue: d.venueSlug, mode: d.status === "forming" ? "interest" : (d.signupModes.includes("team") ? "team" : "individual"), term })}
```

- [ ] **Step 4: Standings selector** — `standings-panel.tsx`. Import `trackStandingsDivisionSelected`. The panel takes `divisions` + `weekStart`; add a `term: string` prop. In the division-select `onClick={() => setActiveId(d.seasonId)}`, also fire `trackStandingsDivisionSelected({ term, seasonId: d.seasonId })`.

- [ ] **Step 5: Thread `term`/`sport` props.** Update `[term].astro` to pass `term={term}` to `<SeasonTabs>`, and `SeasonTabs` to pass `term` down to `<DivisionsFinder>` and `<StandingsPanel>`. (All three already render inside `SeasonTabs`.)

- [ ] **Step 6: tsc + build.** `npx tsc --noEmit` (zero errors); `npm run build` (success bar the known `guides/baseball.astro` no-DB error). Preserve all existing `data-testid` attributes.

- [ ] **Step 7: Commit**
```bash
git add src/components/leagues/*.tsx "src/pages/adult/leagues/soccer/[term].astro"
git commit -m "feat(analytics): instrument league landing/season/finder/standings"
```

---

## Task 3: Catalog tiles + registration wizard

**Files:** Modify `src/pages/adult/leagues.astro`, `src/components/registration/registration-wizard.tsx`

- [ ] **Step 1: Catalog sport tiles** — `adult/leagues.astro`. Add `data-sport-tile` + `data-sport` + `data-state` to the three tiles (Soccer: `data-sport="soccer" data-state="live"`; Basketball/Volleyball: their sport + `data-state="coming_soon"`). At the bottom of the file add an inline module script (mirrors `src/pages/index.astro`'s `track(...)` script):
```astro
<script>
  import { trackCatalogSportTileClicked } from "@/lib/analytics/events";
  document.querySelectorAll<HTMLElement>("[data-sport-tile]").forEach((el) => {
    el.addEventListener("click", () => trackCatalogSportTileClicked({
      sport: el.dataset.sport ?? "", state: (el.dataset.state as "live" | "coming_soon") ?? "live",
    }));
  });
</script>
```

- [ ] **Step 2: Wizard step-viewed** — `registration-wizard.tsx`. Import `import { trackRegistrationStepViewed } from "@/lib/analytics/events";`. There are step constants `STEP_PLAYER=1, STEP_AGREEMENTS=2, STEP_PAYMENT=3, STEP_CONFIRM=4` and `const [currentStep, setCurrentStep] = useState(1)`. Add a mapping + effect:
```tsx
const STEP_NAME: Record<number, "player" | "agreements" | "payment" | "confirm"> = {
  1: "player", 2: "agreements", 3: "payment", 4: "confirm",
};
// inside the component, near the other effects:
useEffect(() => {
  if (season) trackRegistrationStepViewed({ step: STEP_NAME[currentStep] ?? "player", seasonId: season.id });
}, [currentStep, season]);
```
(`season` and `currentStep` are already in scope — the existing effect at the `currentStep === STEP_PAYMENT` block confirms it. Reuse the existing `useEffect` import.)

- [ ] **Step 3: Payment method** — fire on method selection. The wizard passes `onMethodSelected(category)` to `<PaymentStep>`. In the wizard's handler that implements `onMethodSelected`, add `trackRegistrationPaymentMethodSelected({ method: category })` (import the wrapper). (Find the `onMethodSelected={...}` callback in `registration-wizard.tsx`; add the track call inside it. If the handler is inline, wrap it.)

- [ ] **Step 4: tsc + build.** `npx tsc --noEmit`; `npm run build` (success bar guides/baseball).
- [ ] **Step 5: Commit**
```bash
git add src/pages/adult/leagues.astro src/components/registration/registration-wizard.tsx
git commit -m "feat(analytics): catalog sport tiles + registration step/payment events"
```

---

## Task 4: Server gap fixes

**Files:** Modify `src/pages/api/registrations/guest-checkout.ts`, `src/pages/api/public/drop-register.ts`; verify `src/pages/email-link-signin.astro` + `src/components/posthog.astro`

- [ ] **Step 1: Brand on guest checkout.** In `guest-checkout.ts`, `brand` is already computed (`const brand = brandFromHost(...)` ~line 106). Add `brand` to the `properties` of all three captures — `guest_checkout_completed` (~309) and both `guest_checkout_started` (~347, ~390). E.g. change `properties: { $session_id: phSessionId, season_id: ..., ... }` to include `brand,`. (Confirm `brand` is in scope at each capture; if a `guest_checkout_started` capture is before line 106, move the `brand` computation up or recompute inline `brandFromHost(request.headers.get("host") ?? "")`.)

- [ ] **Step 2: Drop League event.** In `drop-register.ts`, before the success `return new Response(JSON.stringify({ ok: true }), ...)` (~line 136), capture the event. Get the server client + brand the same way the other endpoints do:
```ts
import { getPostHogServer } from "@/lib/posthog-server";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { SERVER_EVENTS } from "@/lib/analytics/events";
// ... just before the ok:true response (use the validated drop-season id from the request body — match the variable the handler already parsed, e.g. `data.dropSeasonId`):
try {
  getPostHogServer().capture({
    distinctId: (clientAddress ?? "anon"),
    event: SERVER_EVENTS.dropRegisterSubmitted,
    properties: { drop_season_id: data.dropSeasonId ?? null, brand: brandFromHost(request.headers.get("host") ?? "") },
  });
} catch { /* analytics must never block registration */ }
```
Read the handler first to use the correct parsed body variable for the drop-season id and the correct distinct id (mirror how `guest-checkout.ts` picks a distinctId — email/userId if available, else clientAddress).

- [ ] **Step 3: Magic-link identify — verify, fix only if needed.** Read `src/pages/email-link-signin.astro` (where a magic-link lands) and `src/components/posthog.astro` (the `identify()` logic). `posthog.astro` identifies from `locals.user` on any SSR page that includes it. Determine the magic-link **redirect target**:
  - If it redirects to an SSR page that renders `BaseLayout`/`posthog.astro` with the now-authenticated `locals.user` → identify already fires there; **no code change** — document this in the commit message.
  - If the success page itself shows content without a subsequent identify (e.g. it's the landing page and `locals.user` isn't yet populated) → add a minimal client `identify` on that page using the just-authenticated user id (no PII beyond what `posthog.astro` already sends: id + email/first/last, matching the existing identify call).
  Make the smallest correct change; if no change is needed, note "verified: magic-link lands on SSR `<target>` which identifies via posthog.astro" and skip.

- [ ] **Step 4: tsc.** `npx tsc --noEmit` (zero errors). (Server-event firing is verified in PostHog post-deploy, not in CI.)
- [ ] **Step 5: Commit**
```bash
git add src/pages/api/registrations/guest-checkout.ts src/pages/api/public/drop-register.ts
# include email-link-signin.astro only if Step 3 changed it
git commit -m "feat(analytics): brand on guest checkout, drop-register event, magic-link identify"
```

---

## Task 5: Verify + PR

- [ ] **Step 1:** `npx vitest run tests/unit/analytics-events.test.ts && npx tsc --noEmit` (pass + zero errors).
- [ ] **Step 2:** `npm run build` (success bar the known `guides/baseball.astro` no-DB error).
- [ ] **Step 3:** `git push -u origin <branch>` then `gh pr create --fill`.
- [ ] **Step 4: Watch CI to green** — `typecheck`, `build`, `test-api` (no regressions on the touched endpoints), `test-critical`. Not done until green. (No new `@critical` E2E — analytics is noop in CI per the spec.)

---

## Self-Review notes
- **Spec coverage:** typed module (T1), league-page events (T2: landing/season/finder/standings; T3: catalog tiles), wizard steps (T3), gap fixes (T4: guest-brand, drop event, magic-link), tests (T1 unit). Funnels are PostHog-UI config (documented in the spec, no code).
- **Threading:** `term` is added as a prop down `SeasonTabs → DivisionsFinder / StandingsPanel` (T2 step 5) so finder/standings events carry it — consistent across T2.
- **No-PII:** wrappers take ids/slugs/enums; the unit test asserts no `email|name|phone` prop keys.
- **Investigation-bounded task:** T4 step 3 (magic-link) is a verify-then-minimal-fix; the plan states both branches concretely so it's not a placeholder.
- **No E2E:** intentional (PostHog noop in CI) — stated in spec + T5.

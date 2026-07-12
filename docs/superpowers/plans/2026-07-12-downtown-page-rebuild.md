# Downtown (Starr Ave) Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Visual spec: `docs/design/2026-07-12-downtown-mockup-v2.html` (verbatim markup/CSS minus mockup chrome: review bar, `.anno*`, removed/slot notes). **Reference implementation: the merged Worthington page** `src/pages/soccerone/worthington/index.astro` — port its patterns (season fetch, derived dates, fall-row derivation, dedupe, analytics script, reduced-motion script, HomeSignupStrip mount) rather than reinventing.

**Goal:** Rebuild `src/pages/soccerone/downtown/index.astro` per approved mockup v2 — typographic field-motif hero (no footage exists), priority CTAs (Register → Play Pickup → Book the Field), live-only What's Happening, The Field (130×45 / 6v6 facts), Starr Ave social proof (reuses home-reviews.ts), fully live fall block, Good to Know, wayfinding-forward directions with derived map, signup strip, bottom CTA.

## Global Constraints

- No eyebrow text; no numerals; production header/footer untouched.
- **Downtown facts (owner-confirmed 2026-07-12):** one field, **130 × 45 ft, built for 6v6**; open 4pm–12am daily; address 980 E Starr Ave (Milo-Grogan); same account/membership as Worthington. Surface/boarding NOT confirmed — print no such claims. Old "FieldTurf Revolution 360"/"full-size" copy must not survive. **No corporate-league call-outs** (owner directive).
- Two facts render with visible-only-to-us uncertainty resolved as follows: parking = "Free lot at the building" (from owner's Google photos; if wrong the owner will correct in PR review — flag in PR body); 6v6 roster guidance "six on the field; rosters usually carry 9–10" (flag in PR body).
- Live-only data: season fetch `location=downtown` (bare prod slug convention — see [[worthington hazard]]: never `soccerone-*`), audience=adult; fall rows derived from dayOfWeek exactly like Worthington INCLUDING the dedupe/futsal-tag logic (port verbatim); NO static night rows for Downtown (no founder-documented rhythm) — only live rows; fall tab hidden without dayOfWeek data. Fall block fully live (heading kickoff date, date-range chip, closes dock, prices incl. deposit; NO early-bird row — that promo is Worthington's).
- Social proof: import HOME_GOOGLE_RATING/HOME_REVIEWS from `@/lib/soccerone/home-reviews` (this listing IS Starr Ave); render the same card pattern as the homepage proof section; hidden when empty.
- Directions map: mockup's SVG verbatim (I-71 west, E 5th Ave top, St Clair south, Starr east, rail+I-670 south, long-white-building landmark); Google Maps link `https://maps.google.com/?q=980+E+Starr+Ave,+Columbus,+OH+43201`.
- Media strip: DO NOT build — no Starr Ave collateral. Leave a `<!-- media strip lands when Starr Ave footage exists (see Worthington's for the pattern) -->` comment.
- Hero: no video; the field-motif SVG background from the mockup (130×45 proportions); keep an HTML comment marking where the `<video>` slot goes when footage arrives.
- Staging fixtures: extend seed stage 12 with a Downtown fall season carrying `dayOfWeek` (e.g. "Co-Ed 6v6 — Fall", `wed`, price/teamPrice/deposit/registrationCloses set) on the EXISTING Downtown fixture location — CHECK ITS SLUG first (likely `soccerone-downtown`; if so, rename in place to bare `downtown` exactly like the Worthington fix — org-scoped lookup, FK-preserving rename, idempotent).
- Commit trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Tasks

### Task 1: seed slug fix + fixtures, page rebuild (single implementation task — patterns established)
`src/lib/db/seeds/seed-e2e-tests.ts` + `src/pages/soccerone/downtown/index.astro`. Verify per section against live curls (Host: soccerone.localhost) after `./scripts/with-bws.sh npm run db:seed:e2e`.

### Task 2: e2e spec + sweep
`tests/e2e/soccerone-downtown.spec.ts` mirroring soccerone-worthington.spec.ts (structure unconditional: h1, field-motif svg present, "130" text, no "FieldTurf"/"full-size"/"typical week"/"Academy — Coming 2027"/"corporate" (case-insensitive on SoccerOne downtown page), What's Happening + toggle, proof section (reviews are populated so unconditional), map svg, signup strip; conditional register CTAs). Sweep: grep src/ for lingering `FieldTurf|Revolution 360|full-size` SoccerOne claims + any remaining `soccerone-downtown` slug references that should be bare (mind the fixture-org provisioning script — leave scripts/seed-soccerone-org.ts alone).

### Task 3: verification gate (controller) + review + PR
tsc, units, build (clear node_modules/.vite before restarting any dev server after builds — known hazard), targeted e2e (downtown + worthington + home), browser drive + screenshots, whole-branch review, PR.

## Deferred
- Media strip when Starr Ave footage lands (5-min phone shoot).
- Owner confirms: parking copy, roster guidance, map route sanity-check (flag all three in the PR body).

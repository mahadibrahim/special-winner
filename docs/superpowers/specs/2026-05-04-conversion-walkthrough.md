# Conversion Walkthrough — Customer Journey Findings

**Date:** 2026-05-04
**Author:** Walkthrough conducted via Chrome on aspiresportsohio.com
**Goal:** Identify the highest-leverage UX changes for converting an anonymous visitor into a registered family.

This document ranks issues by **impact on conversion** × **cost to fix**. The intent is to land the high-impact / low-cost batch first, then queue the higher-cost items behind a real design pass.

The companion PR (`chore/launch-readiness-pass`) ships three of the quick wins in parallel: the contact-page removal, the prod-DB cleanup script, and a redeploy. Everything else in this document is queued for follow-up PRs.

---

## P0 — Ship now (this PR or immediately after)

These are **launch-blockers** for a conversion-quality experience. None are subjective.

### 1. Prod DB has CI fixture residue

**Symptom:** The `/programs` sports filter renders entries like `Sport wpo9z215`, `Sport mt8e2zk1`. The location selector lists `Powell`, `Dublin`, `Delaware` — none of which are real Soccer One venues.

**Root cause:** The shared CI database accumulated rows from `seed-e2e-tests.ts` runs before the staging cutover (2026-05-04). Random-suffixed locations and sports leaked into the public catalog.

**Fix:** `scripts/cleanup-prod-pollution.ts` (this PR). Run with `--dry-run` first against prod, review the report, then commit. Cascade-deletes through programs/seasons that reference the polluted parents.

**Why P0:** A visitor's first impression of the catalog is gibberish names. They bounce.

### 2. "Spring 2026" copy throughout the site

**Symptom:** CTAs and hero microcopy say "Registration Open for Spring 2026". Today is **2026-05-03**. Spring is over.

**Files:** `src/components/cta-banner.tsx:132`, plus any other "Spring 2026" strings.

**Fix:** Global replace to "Summer 2026". Should be a 5-line PR. Do it before the next prod redeploy.

**Why P0:** Stale season label signals "this site isn't actively maintained" — a trust kill.

### 3. Contact page is dead weight

**Symptom:** A `/contact` page exists with a contact form. We are a self-serve registration platform, not a B2B sales site. Every minute a parent spends writing a form-mail asking "do you have a U10 league?" is a minute they didn't spend signing up.

**Fix:** Done in this PR — page deleted, navigation entry removed, all callsites switched to `mailto:hello@aspiresportsohio.com`.

**Why P0:** Removes a friction surface. The mailto is faster and more honest about who answers.

---

## P1 — Next PR (this week)

These are above-the-fold conversion levers. Each is its own focused PR.

### 4. Homepage hero is wasted real estate

**Symptom:** The hero shows an editorial pull quote and decorative chrome. A new visitor cannot answer "what is this?" or "should I register my kid?" without scrolling past the fold.

**What it should do:**
- Lead with the offer: "Soccer programs for kids ages 4–18 in Worthington and Downtown Columbus."
- One primary CTA: **Browse Programs**.
- Social proof or differentiator in 1 line ("10+ years coaching central Ohio youth").
- Move the editorial flourish to a secondary section.

**Cost:** Medium. Needs a small design pass — not just code.

### 5. Programs are hidden below the fold

**Symptom:** A motivated visitor has to scroll through the hero, "More Than Just Sports" generic copy, and a partners section before they can see a single program card.

**Fix:** Move the program grid (or at least a 3-card teaser) above or immediately after the hero. The partners section + community story can live below.

**Cost:** Low — section reorder in the homepage Astro template.

### 6. "More Than Just Sports" doesn't differentiate Soccer One

**Symptom:** The value-prop section reads like every other rec-league site. There's nothing here that distinguishes us from i9 Sports, US Sports Institute, or YMCA leagues.

**What's actually different about Soccer One** (per strategy docs):
- Two real fields in Worthington + Downtown — not borrowed church gyms
- Adult community leagues alongside youth
- Coaches who played the game seriously, not parent volunteers

**Fix:** Rewrite the section to lead with these three.

**Cost:** Medium — copy work, not just code.

### 7. Location selector still shows duplicates / non-venues

**Symptom:** Even after the data-driven refactor (PR #17), the dropdown can render "Soccer One Worthington" twice if there are duplicate location rows, or surface stale CI fixture entries until the cleanup runs.

**Fix:**
- Run the cleanup script (item 1).
- Audit `locations` for any duplicate `slug` rows post-cleanup.
- If duplicates persist, add a uniqueness check in the API response or a DB constraint.

**Cost:** Low after cleanup runs.

---

## P2 — Queued for a real design pass

These need a design partner, not just code. They're real but not on the launch critical path.

### 8. No corporate imagery anywhere on the site

The site is text + decorative gradients. No photos of kids playing, no field shots, no coach photos. This is the single biggest "feels like a placeholder" signal for a parent evaluating us.

**Path forward:**
- Short-term: license 6–10 stock photos that match the cream/editorial design system. Place 1 in hero, 2 in program cards, 1 in community story, 1 in partners.
- Medium-term: shoot real Soccer One field + coach photos (already in the future-video-media memory).
- Until either lands, the site reads as "we're not real yet."

### 9. Guides are PDFs but should be Astro pages

**Symptom:** `/guides/*` and `/minibooks/*` are link-to-download experiences. PDFs don't get indexed for SEO, can't be excerpted for share cards, and feel formal where the rest of the site is conversational.

**Fix:** Convert each guide to a proper Astro page using BaseLayout. Keep a "Download as PDF" affordance for parents who actually want one.

**Cost:** High — content migration for ~6–10 documents. Worth doing once the launch is stable, not before.

### 10. CTA-banner gradient is louder than the rest of the site

The CTA section uses an orange radial gradient that doesn't match the editorial cream system anywhere else on the site. It looks like it was lifted from a different template.

**Fix:** Re-style with the design system's primary tokens at the right opacity. Defer until the design pass.

---

## What ships in `chore/launch-readiness-pass` (this PR)

Concrete deliverables only:

- [x] Delete `src/pages/contact.astro` and replace 5 `/contact` callsites with `mailto:hello@aspiresportsohio.com`
- [x] `scripts/cleanup-prod-pollution.ts` — targeted, transactional, --dry-run-first cleanup of CI fixture residue (Loc/Sport random-suffix names, fixture sport slugs, fixture location slugs Powell/Dublin/Delaware)
- [x] `prod:cleanup` npm script
- [x] This findings doc

**What does NOT ship in this PR (deliberately):**
- Hero redesign (P1 #4) — needs design pass
- Programs above fold (P1 #5) — its own PR
- Differentiator copy (P1 #6) — needs copy work
- "Spring 2026" → "Summer 2026" (P0 #2) — its own one-line PR; doing it here would muddy the diff

---

## Operational steps for the cleanup script

```bash
# 1. Always preview first
DATABASE_URL="<prod>" ALLOW_PROD_CLEANUP=yes \
  npm run prod:cleanup -- --dry-run

# 2. Review the report. Confirm:
#    - polluted-locations list contains ONLY Loc XXXXX + powell/dublin/delaware
#    - polluted-sports list contains ONLY Sport XXXXX + the e2e fixture slugs
#    - cascade impact (programs + seasons) is non-zero only for the above

# 3. Commit
DATABASE_URL="<prod>" ALLOW_PROD_CLEANUP=yes npm run prod:cleanup
```

The script is idempotent — re-running after a clean DB exits with "Nothing to clean."

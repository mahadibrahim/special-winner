# Homepage Redesign — Design Spec

**Date:** 2026-05-14
**Status:** Approved — ready for implementation
**Implementation skill:** `frontend-design` (the path established by the `/adult` and `/youth` redesigns)
**Sibling specs:** `2026-05-14-adult-landing-redesign-design.md`, `2026-05-14-youth-landing-redesign-design.md`

## Problem

The homepage hasn't evolved with the rest of the site. Now that `/youth` and `/adult` are full self-sufficient finders, the homepage's job has changed — but it still routes its program preview to the de-emphasized `/programs` catalog, and it carried decorative chrome (the top/bottom rule bars, since removed). It needs to become a **showpiece for the business and a functional gateway** at the same time — the front door to the program, not a dead end.

## Goal

A homepage that (1) makes a striking, on-brand first impression and (2) routes every visitor cleanly to the finder that's theirs — `/youth` or `/adult` — while proving, with live inventory, that there are real programs to find.

## Approved design

### Hero — direction B: editorial hero, split as the CTA

A single magazine-cover hero that makes the brand impression, with the Youth/Adult choice as two strong CTAs inside it. (Chosen over "split-screen two doors" — all gateway, no room for the brand to breathe — and "immersive dark hero" — off the cream system and dependent on photography that doesn't exist.)

- Evergreen kicker: "Aspire Sports · Central Ohio".
- Headline: "Sports done with **conviction.**" — "conviction" set in the display italic accent, per the existing hero's treatment. Tightened from the current "Sports done with conviction. For kids. For adults." — the for-kids/for-adults idea moves into the sub-copy.
- Sub-copy: "Real coaches, real development — for the kid learning the game and the adult who never stopped playing."
- Two CTAs: **"For your kid →"** (green, → `/youth`) and **"For yourself →"** (dark, → `/adult`). These are the primary gateway action.
- Stays fully in the editorial cream system. The hero is a rework of the existing `dual-cta-hero.tsx`, not a new component — structurally it is already close (kicker + headline + sub-copy + dual CTA); this is a copy, CTA-label, and editorial-polish pass.

### Page flow (top to bottom): route → prove → convince → reassure → convert

1. **Hero (B)** — the showpiece and the gateway in one. (`dual-cta-hero.tsx`, reworked.)
2. **"What's open now"** — live inventory. A rebuild of `homepage-programs-preview.tsx` into **two audience-split scroll rows** — a Youth row and an Adult row — of real `ProgramCardV2` cards (each capped at ~6, fetched from `/api/public/seasons?status=open`, split by `deriveAudience`). Each row has a **"Browse all youth →" / "Browse all adult →"** link that routes into the matching **finder** (`/youth`, `/adult`) — NOT the old `/programs` catalog. A row self-hides if that audience has nothing open; the section keeps its header so the homepage's `#programs` anchor always has content (the existing Playwright homepage test depends on this).
3. **Why Aspire** — `why-aspire.tsx`, reused as-is. The four benefit cards are the brand substance — what makes the business worth choosing.
4. **Stats · Testimonials · Partners** — `stats-section.tsx`, `testimonials.tsx`, `partners-section.tsx`, reused as-is. All three already self-hide on empty data; they stay in the page as ready-to-populate slots and appear when real data lands.
5. **FAQ** — `faq-section.tsx`, reused unchanged.
6. **CTA banner** — `cta-banner.tsx`, modified: its call-to-action becomes the same **Youth/Adult split** (→ `/youth`, `/adult`) instead of a generic "browse", so the page opens and closes on the same gateway choice.

### Architecture

- **`src/pages/index.astro`** — rewritten section composition: Hero → HomepageProgramsPreview → WhyAspire → StatsSection → Testimonials → PartnersSection → FAQSection → CTABanner. Stays `prerender = true` (the homepage is anonymous static content; the program preview and other islands hydrate client-side, exactly as today).
- **`src/components/marketing/dual-cta-hero.tsx`** — reworked into Hero B: tightened headline, evergreen kicker (already done in the copy pass), updated sub-copy, CTA labels "For your kid →" / "For yourself →" pointing at `/youth` and `/adult` (the CTAs already point there from an earlier task — this confirms and relabels them).
- **`src/components/homepage-programs-preview.tsx`** — rebuilt: two audience-split rows instead of the current "Filling up" / "Starting soon" rows; each row's CTA routes into a finder. Keeps the client-side fetch pattern and the always-present section header.
- **`src/components/cta-banner.tsx`** — modify the CTA button(s) to the Youth/Adult split. The banner's visual treatment stays.
- **Reused unchanged:** `why-aspire.tsx`, `stats-section.tsx`, `testimonials.tsx`, `partners-section.tsx`, `faq-section.tsx`.
- **Analytics:** the hero CTAs and the CTA-banner CTAs should carry `data-landing-cta` attributes and fire the existing `track()` event, consistent with `/youth` and `/adult`.
- **No new API, no schema changes.** `/api/public/seasons` already provides everything.

### Decisions made during brainstorming

1. **Homepage job = gateway + live inventory.** It routes to the finders AND shows a curated strip of real programs as proof-of-life. (Rejected: pure gateway with no programs shown; and the status-quo of routing to the old `/programs` catalog.)
2. **Hero direction B** — editorial hero with the split as the CTA. (Rejected: split-screen "two doors" hero; immersive dark hero.)
3. **"What's open now" routes into the finders**, not `/programs`. Two audience-split rows reinforce the gateway's Youth/Adult split with live proof.
4. **Keep Stats / Testimonials / Partners as self-hiding slots** — design the showpiece with the full structure; the empty sections render nothing until real data exists.
5. **CTA banner closes on the same Youth/Adult choice** as the hero — the page brackets the gateway decision.
6. **Editorial cream system kept** — no new aesthetic; this is craft and composition within the established system.
7. **Implementation via `frontend-design`** — consistent with `/adult` and `/youth`.

## Non-goals

- No changes to `/youth`, `/adult`, `/programs`, or `/dropin`.
- No schema changes, no new API endpoints.
- No new social-proof *content* — Stats/Testimonials/Partners stay empty/self-hiding until the founder has real, consented data.
- Not deleting the empty section components — they're intentional slots.

## Testing

- **Playwright E2E** (`tests/e2e/`): the homepage loads; the hero renders with both CTAs pointing at `/youth` and `/adult`; the "What's open now" section renders its header even with no inventory (the existing homepage test already asserts the `#programs` anchor has content — keep that passing); the CTA-banner CTAs point at `/youth` and `/adult`. Islands call `useHydrationBeacon()` where the existing pattern expects it.
- **Build + type check:** `npm run build` and `npx tsc --noEmit` clean. Homepage stays `prerender = true`.
- **Browser verification** of the final homepage (hero, the two split rows with real data, the self-hiding slots, mobile reflow) before the work is called done — as was done for `/adult` and `/youth`.

## Open follow-ups (out of scope)

- `why-aspire.tsx`'s benefit cards use off-system accent gradients (rose/amber/violet/emerald) rather than the editorial cream palette. It's reused as-is here; bringing it onto the design system is a separate small polish pass worth doing for full showpiece cohesion.
- "Est. 2015" still appears in `/about` — the homepage instance was removed with the hero rule bars; the `/about` one remains a factual-accuracy question for the founder.

# Launch Readiness — Summer 2026

**Goal:** Get from "platform can take payments and bookings" to "public registration open for season 1" without silent failure modes burning the founder.

**Target dates:** Public registration opens ~6-8 weeks from 2026-05-24. Founders' tournament runs ~3-4 weeks before that. Working window: ~8-12 weeks.

**Owner:** Founder. This doc is the truth source for the launch sprint — it overrides anything in `MEMORY.md` if they disagree.

**How to use:** Each row has a status (`□`/`▣`/`✓`) and an owner. When a row needs more than a one-liner to execute, link to a per-feature plan in `docs/superpowers/plans/`. Update status inline as work lands.

**Pattern observed during the 2026-05-24 audit:** memory was significantly stale. Multiple items thought to be "build from scratch" were already 100% done in main (admin reg UI, `charge.refunded` handler + dispatcher + endpoint refactor, marketing welcome series). The audit pass below corrects each one against the live codebase.

---

## What's shippable on prod today (2026-05-24, verified)

- Live Stripe (since 2026-05-18), card-only payment methods.
- Magic-link auth + Cloudflare Turnstile (since 2026-05-20).
- Registration flow + drop-in checkout (two Stripe systems — PaymentIntents for registrations, Checkout Sessions for drop-ins/rentals).
- Phase 3 memberships, multi-tenant (PR #127 merged 2026-05-23).
- Transactional email overhaul (PR #109) — full redesign of confirmation, receipt, magic-link, verification, balance-reminder, waitlist-promotion, payment-failed, announcement, refund-notification templates.
- Marketing welcome series (PR #113) — HMAC unsubscribe-token, unsubscribe endpoint, welcome-series enroll + drip cron, daily scheduler, 3 templates, opt-out columns.
- Admin registration management (`/admin/registrations/[id]`): cancel + refund (partial, "also cancel") + delete (DELETE-typed confirm + force-override). Idempotency key on the Stripe refund. Refund-notification email fires.
- `charge.refunded` webhook handler (commit `060dbaf`) — runs in a transaction, fires the refund email, has idempotency belt-and-braces. The webhook endpoint is refactored to delegate to `handleStripeEvent()` (commit `b8c2f5b` and after); dispatcher includes the case.
- Stripe webhook idempotency via `stripe_events` ledger; failed dispatches release the claim so Stripe retries process.
- Stripe idempotency keys on PaymentIntent.create in centralized `src/lib/stripe/client.ts` + `connect.ts` + 3 endpoint sites (rentals, admin rentals, kiosk walk-in).
- Error capture via PostHog `captureException` in the Stripe webhook handler (deliberate replacement for Sentry per commit `4206526`).
- Multi-tenant admin endpoints with `requireSameOrg*` pattern.
- Scheduled functions code present (5 cron jobs: expire-pending-claims, expire-unverified-users, create-scheduled-team-groups, process-scheduled-broadcasts, expire-pending-rentals, send-welcome-series).
- SoccerOne launch checklist doc exists at `docs/ops/soccerone-launch-checklist.md`.

---

## Tier 1 — Silent failure modes (fix before high traffic)

These are gaps where money or trust is lost without a visible error. Highest priority.

| # | Item | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | `charge.refunded` webhook handler | ✓ code, □ Stripe config | Founder | **Code is fully done on main.** Handler at `src/lib/stripe/handle-charge-refunded.ts`, wired in `handle-stripe-event.ts`, called by the refactored endpoint. Tests cover full / partial / skip-no-match / idempotent re-delivery. **Outstanding: add `charge.refunded` to the prod Stripe webhook subscription event filter** (Stripe dashboard, 30 seconds). |
| 2 | Dispute / chargeback flow | ▣ code, □ Stripe + env config | Founder | **Minimal-scope implementation in PR.** Handler at `src/lib/stripe/handle-charge-dispute.ts` covering `charge.dispute.created` / `funds_withdrawn` / `closed`. Schema: 3 additive columns on `payments` (`stripe_dispute_id`, `dispute_status` enum, `dispute_reason_code`). Founder-alert email template + sender. Wired into the existing `handleStripeEvent` dispatcher. No admin UI (Stripe dashboard is the response surface — better than anything we'd build at launch volume). **Outstanding after merge: (a) add the three event types to the prod Stripe webhook subscription; (b) set `FOUNDER_ALERT_EMAIL` in Netlify.** |
| 3 | Webhook delivery monitoring | ▣ code, □ dashboard setup | Founder | **Code shipped:** both webhook endpoints (`stripe`, `stripe-connect`) fire structured `stripe_webhook_exception` + `stripe_webhook_outcome` PostHog events via `src/lib/observability/webhook-telemetry.ts`. Setup guide at `docs/ops/webhook-monitoring.md`. **Outstanding (10 min, founder):** (a) enable Stripe dashboard email alerts on both webhook endpoints; (b) configure two PostHog alert rules (one on `stripe_webhook_exception > 0`, one on `stripe_webhook_outcome` count dropping to 0 over a normally-busy window). Known follow-up: stripe-connect endpoint returns 400 (not 500) on internal errors, which stops Stripe retries — flagged in the ops doc, separate PR. |
| 4 | Resend domain auth confirmation | □ | Founder | `EMAIL_FROM=Aspire Sports <hello@aspiresportsohio.com>` is set. Verification of SPF/DKIM/DMARC in Resend dashboard is external — needs founder login. |
| 5 | Scheduled-functions verification in prod | □ | Founder | Code for all 6 cron jobs is present. Need to verify each fires on its cadence with non-error exit in Netlify Functions logs for the last 7 days. |
| 6 | Marketing welcome series — final wiring | ✓ code, □ env + founder copy | Founder | **PR #113 is fully merged.** Files at `src/lib/marketing/welcome-series.ts`, `src/lib/marketing/unsubscribe-token.ts`, `src/pages/api/marketing/unsubscribe.ts`, `src/pages/api/cron/send-welcome-series.ts`, 3 templates under `src/lib/email/templates/welcome-*.tsx`. `MARKETING_UNSUBSCRIBE_SECRET` is in `.env.example` with a stable-secret comment. **Outstanding: (a) set `MARKETING_UNSUBSCRIBE_SECRET` in Netlify prod env; (b) founder reviews/approves the 3 welcome-series email copies.** |

---

## Tier 2 — Pre-launch config + data

| # | Item | Status | Owner | Notes |
|---|---|---|---|---|
| 7 | SoccerOne launch checklist execution | ▣ doc, □ exec | Founder | Doc exists at `docs/ops/soccerone-launch-checklist.md` (+ Stage 6.5 addendum). Outstanding: walk it top-down — DNS, `domain_mappings` rows, Stripe Prices (live), tier rows, then smoke both sites end-to-end. |
| 8 | Production catalog seed | □ | Founder + Eng | Prod DB hard-reset 2026-05-16 to 1 org / 2 locations / 2 users. Need: founders' tournament + season 1 divisions, seasons with dates/pricing, age groups, waiver text, gear add-ons, venues. Founder drafts catalog spec; eng writes a branch-specific seed script (delete after merge per repo's "no one-off DB scripts" rule). |
| 9 | Bulk CSV export of registrations | □ | Eng | **Confirmed real gap.** No CSV/Excel anywhere — no endpoints, no admin UI download buttons, no CSV library installed. Minimal scope (1-2h): add `format=csv` to `/api/admin/registrations.ts` GET handler + simple string-concatenation CSV builder (no library). Ideal scope (4-6h): add a date-range filter + export button to `registrations-list.tsx`. |

---

## Engineering Hardening

| # | Item | Status | Owner | Notes |
|---|---|---|---|---|
| 10 | Audit: idempotency key coverage on every PaymentIntent.create site | ▣ | Eng | Verified centralized in `src/lib/stripe/client.ts` + `connect.ts` and used in 3 endpoint sites. Lightweight grep audit remaining to confirm no path bypasses the centralized helpers. |
| 11 | PostHog `captureException` coverage outside the webhook | ✓ | Eng | New `src/lib/observability/server-error.ts` helper (`captureServerException`) wired into all 12 cron-job catch blocks + the two stripe-handler fail-soft email catches (refund-email, dispute-alert-email). Emits a generic `server_exception` PostHog event with a free-form `component` label (`cron/<name>`, `stripe-handler/<purpose>`). Helper has 6 unit tests covering shape + fail-soft. API-route coverage deferred (large surface, low marginal value beyond cron + handler coverage that's now in place). |
| 12 | Mobile responsiveness audit — registration wizard + dashboard | □ | Founder | Walk through on iPhone Safari + Android Chrome. Note layout / tap-target / scroll problems. |
| 13 | Repository hygiene: tracked Finder-duplicate files | ✓ | Eng | **27 files removed in commit `edc377a` on the launch-readiness-tracker worktree.** Includes phantom API routes (`unsubscribe 2.ts`, `play/{games,standings,teams} 2.ts`), duplicate test files (vitest was running them as duplicates), duplicate components and templates. Verified no `from "... 2"` imports existed; safe deletion. |
| 14 | Stripe Connect Phase 3 prod-only ops | □ | Founder | Per memory: prod Stripe Prices + tier rows + Connect webhook events still need to land for SoccerOne path. Folds into #7. |
| 15 | Drop-in webhook on apex URL — confirm still working | □ | Founder | Memory notes Stripe webhook must hit apex (`aspiresportsohio.com`), not `www.` (308 redirect Stripe won't follow). Spot-check the live webhook URL in Stripe dashboard during #1 / #3 work. |

---

## Operations / Business backlog

These run in parallel with engineering; tracked in the ops repo's `<domain>/current/` files but mirrored here for the launch view.

| # | Item | Status | Owner | Notes |
|---|---|---|---|---|
| 16 | CPA intake conversation | □ | Founder | Columbus small business, sports/rec/fitness preferred. Entity structure, bookkeeping, sales tax exposure, quarterly estimateds. |
| 17 | Google Business Profile claims (downtown + Worthington) | □ | Founder | Local search lever #1 once live. |
| 18 | Columbus employment attorney → ICA template | □ | Founder | One-time $500-1K. Blocks contracting coaches/refs at scale. |
| 19 | Founders' tournament scope + date | □ | Founder | 6-team round-robin, downtown, free entry, prize = free season-1 team registration. Target: 6-8 weeks before season 1 launch. |
| 20 | Coach pool recruiting (5-10 refs/coordinators) | □ | Founder | Contracted 1099 via Stripe Connect. Needs ICA template (#18) first. |
| 21 | Zernio Phase 1 cadence test | □ | Founder | Per `marketing/decisions/social-tooling-zernio.md`. Connect IG + FB on free tier, run 2-4 week manual cadence, eval against the 4 criteria in the decision doc. |
| 22 | Captain outreach amplification | ▣ | Founder | Already underway in `marketing/current/`. Continues. |

---

## Proposed sequence (revised post-audit)

The audit collapsed several "build" items into "configure" items. Engineering surface is much smaller than the original tracker implied.

| Week | Engineering | Business / Founder |
|---|---|---|
| **Week 1 (this week)** | ✓ #13 hygiene cleanup (done). #9 CSV export minimal (1-2h). Begin #2 dispute webhook handler (minimal scope). | #1 Stripe dashboard: add `charge.refunded` event. #4 Resend domain check. #5 cron logs check. #6 set `MARKETING_UNSUBSCRIBE_SECRET` + approve welcome copy. #16 CPA intake scheduled. #17 GBP claim started. |
| **Week 2** | Complete #2 dispute handler + minimal alert UI. #3 webhook monitoring (PostHog egress). #11 PostHog coverage extension. | #18 attorney engaged. #19 tournament date locked. #7 SoccerOne checklist begin. |
| **Week 3** | #9 CSV export full scope (date filters + export button). #10 idempotency final audit. | #8 catalog spec drafted. #20 coach outreach starts. #21 Zernio Phase 1. Complete #7. |
| **Week 4** | #8 production catalog loaded (branch-specific seed script). #12 mobile audit follow-ups. | Founders' tournament prep. |
| **Week 5-6** | Buffer for items surfaced during tournament dry run. | Founders' tournament runs, captures 4 founding teams. |
| **Week 7-8** | Load test / log review / rollback drill. | Public registration opens. |

---

## Per-feature plans

As remaining Tier 1/2 build items get worked, link plans here:

- *(none yet — the next is likely a thin plan for #2 dispute-flow minimal scope.)*

---

## Related docs

- `MEMORY.md` — session-persistent context. **Notes:** the `admin-registration-management-gap` memory was stale (refreshed 2026-05-24); the `marketing-welcome-series` memory understates how complete that work is (also corrected here).
- `marketing/decisions/social-tooling-zernio.md` (ops repo) — #21 backing doc.
- `partnerships/decisions/facility-partnership-terms.md` (ops repo) — backdrop for #7.
- `docs/ops/soccerone-launch-checklist.md` — #7 execution.
- `docs/MULTI_TENANT_ARCHITECTURE.md` — relevant to #7.
- `docs/PHASE1_DEPLOYMENT.md` — historical reference.

---

## Update log

- **2026-05-24 (initial)** — Doc created. Initial first-pass audit found #1, #2, #3, #6, #7, #9 as real gaps; admin registration management UI confirmed already shipped; idempotency + PostHog error tracking partially in place.
- **2026-05-24 (refined)** — Deeper audit + parallel agent investigation revealed substantial "memory was wrong" pattern: #1 `charge.refunded` is fully done in code (only Stripe dashboard event needed); #6 marketing welcome series is fully done (only Netlify env + founder copy approval needed); #7 SoccerOne checklist doc exists. Real remaining engineering gaps narrowed to #2 (dispute), #3 (webhook monitoring), #9 (CSV export), #11 (PostHog coverage extension). #13 hygiene cleanup completed in this session (27 Finder duplicates removed, commit `edc377a`).
- **2026-05-24 (execution)** — #9 CSV export shipped (PR #131); #2 dispute flow minimal scope implemented in this PR (handler + schema + alert email + dispatcher wiring + 4 tests). Real engineering surface narrows further: #3 webhook delivery monitoring and #11 PostHog coverage extension are the remaining items.

# Post-Event Feedback: NPS Survey + Review Funnel & Referee Ratings

**Date:** 2026-07-02
**Status:** Approved design, pending implementation plan

## Purpose

Two customer-feedback features built on one shared engine:

1. **NPS survey + review funnel** (GatherUp-style): everyone who books receives a post-event NPS survey. High scorers (9–10) are prompted to leave a Google review; low scorers give private feedback, and detractors trigger an immediate staff alert.
2. **Referee rating system**: after a league or tournament game completes, the adults tied to both teams (parents of youth players, or adult self-registrants) receive a link to rate the referee. Ratings are admin-only and anonymous.

Both ship dark behind per-org feature flags.

## Decisions (settled during brainstorming)

| Question | Decision |
|---|---|
| NPS trigger scope | All three booking types, anchored to the event ending (not the purchase): drop-in sessions, field rentals, and season registrations (end of season) |
| Review destination | Google review URL, configured per brand (aspire / soccerone) in org settings |
| Low/mid scorers | 0–8 get a private "what could we do better?" box; 0–6 additionally fire an immediate alert email to staff |
| Frequency cap | One NPS survey per booking type per 90 days per person |
| Ref rating form | Overall 1–5 stars + three 1–5 dimensions: game control & safety, communication & professionalism, fairness/consistency; optional comment |
| Ref rating visibility | Admin-only. Refs do not see ratings in-app. Raters anonymous in all views |
| Delivery | Email always (channel of record, logged); SMS nudge when org has SMS enabled and recipient opted in |
| Architecture | Unified feedback engine: one request spine, two response tables, one cron, one public page |

## Data model

New schema module `src/lib/db/schema/feedback.ts`, shipped as a proper Drizzle migration (`db:generate`, idempotent `DO $$ ... duplicate_object` guards per the 0023/0024 convention).

### `feedback_requests` (the spine)

| column | type / notes |
|---|---|
| `id` | uuid pk |
| `organizationId` | FK organizations |
| `brand` | brand enum, matches existing convention |
| `kind` | enum `feedback_request_kind`: `nps_drop_in` \| `nps_field_rental` \| `nps_season` \| `referee_rating` |
| `targetId` | uuid, polymorphic by kind (no FK, same pattern as `self_service_tokens`): `dropInBookings.id`, `fieldRentals.id`, `registrations.id`, or `games.id` |
| `recipientUserId` | FK users — the purchaser / parent / adult player who receives the link |
| `gameOfficialId` | FK gameOfficials, nullable; set only for `referee_rating` (which official is being rated) |
| `tokenHash` | SHA-256 of a 32-byte base64url token, unique index. Follows the `magic_links` hashing pattern — plaintext is returned once at creation and only embedded in the outbound message. (Deliberately NOT the plaintext `self_service_tokens` pattern.) |
| `status` | enum: `pending` \| `sent` \| `responded` \| `expired` |
| `sentAt`, `respondedAt`, `expiresAt` | timestamps. Expiry: 14 days (NPS), 7 days (referee rating) |
| `metadata` | jsonb — e.g. `{ gameType: "league" \| "tournament" }` for ref ratings so the dashboard can segment without re-deriving |
| `createdAt` | timestamp |

**Unique index** on `(kind, targetId, recipientUserId, gameOfficialId)` (with a coalesced sentinel for null `gameOfficialId`) — the cron can never double-create for the same event/recipient.

### `nps_responses`

| column | notes |
|---|---|
| `requestId` | FK feedback_requests, **unique** (one response per request) |
| `score` | int 0–10 |
| `comment` | text, nullable |
| `reviewLinkClickedAt` | timestamp, nullable — set when a promoter taps the Google button |
| `createdAt` | |

Promoter (9–10) / passive (7–8) / detractor (0–6) is **derived at read time**, never stored.

### `referee_ratings`

| column | notes |
|---|---|
| `requestId` | FK feedback_requests, **unique** |
| `gameId` | FK games — denormalized so the dashboard aggregates without joining requests |
| `refereeUserId` | FK users — denormalized, same reason |
| `overall` | int 1–5 |
| `gameControl` | int 1–5 (game control & safety) |
| `communication` | int 1–5 (communication & professionalism) |
| `fairness` | int 1–5 (fairness / consistency) |
| `comment` | text, nullable |
| `createdAt` | |

The rater's identity lives **only** on the request row. Every read surface (admin dashboard, any export) renders ratings anonymously; no API response ever joins rater identity to a rating.

## Settings (jsonb — TS interface changes only, no migration)

- `OrganizationFeatures` (organizations.ts): add `enableNpsSurveys?: boolean` and `enableRefereeRatings?: boolean`. Both default off — the whole system ships dark and is flipped on per org.
- `OrganizationSettings`: add a `feedback` block:

```ts
feedback?: {
  googleReviewUrl?: Partial<Record<Brand, string>>; // per-brand review destinations
  detractorAlertEmail?: string; // falls back to settings.contact.supportEmail
};
```

## Dispatch

One cron endpoint `src/pages/api/cron/dispatch-feedback-requests.ts`, guarded by `x-cron-secret` / `CRON_SECRET` like the existing cron routes, triggered **hourly** by a thin Netlify scheduled function `netlify/functions/scheduled-dispatch-feedback-requests.ts` (copies the existing wrapper pattern — no app-lib imports, just `fetch` with the secret header).

Each run performs four eligibility scans (each gated on the org's feature flag):

1. **Drop-in NPS** — `dropInSessions.endsAt` ≥2h ago (or session `completed`), booking `status='confirmed'` and not `no_show` / `cancelled`. Recipient: `dropInBookings.userId`.
2. **Rental NPS** — rental slot ended ≥2h ago, paid/confirmed. Recipient: the renter.
3. **Season NPS** — season `endDate` has passed. One request per `registrations` row with `status='confirmed'`. Recipient: `registeredByUserId`.
4. **Referee rating** — `games.status='completed'` with ≥1 `gameOfficials` row. Recipients: distinct adults tied to both teams' rosters — `registeredByUserId` for youth players (COPPA path), the player's own user for adult self-registrants. The official being rated is excluded from recipients. `metadata.gameType` derived from the game's season → program `programType` (`tournament` → `tournament`, else `league`).

### Caps and dedupe

- **NPS**: before creating, check `feedback_requests` for the same `recipientUserId` + same `kind` with `sentAt` in the last 90 days → skip silently.
- **Referee ratings**: no 90-day cap (every game is ratable), but **max one ref-rating email per recipient per day** — on a multi-game day the recipient gets one request, anchored to their most recent completed game. Skipped games simply never get a request row.
- The unique index makes the cron idempotent: a crashed run re-picks eligible rows next hour without double-sending. A send failure leaves the row `pending` for retry; `sent` is only set after the email dispatches.

### Delivery

Through the existing `sendTransactionalEmail` path: React Email templates (`feedback-nps.tsx`, `feedback-referee-rating.tsx` under `src/lib/email/templates/`), brand-aware sender via `fromForBrand`, always logged to `email_logs`. SMS nudge via the existing gateway when `features.enableSMS` and the recipient has a `phone_opt_ins` record — short message, same link.

**Deliberate choice — no one-click score links in the email.** The email contains a single "How was it?" CTA button; the 0–10 tap happens on the page. Embedded per-score links (the classic GatherUp email) get auto-clicked by corporate mail scanners and Apple link prefetch, which fabricates responses.

## Public survey page

`/feedback/[token]` — SSR (no prerender), no auth required. Token is hashed and looked up in `feedback_requests`; page renders by `kind`.

**NPS flow:**
1. Tap a 0–10 score → **saved immediately** (capture the score even if they bounce).
2. Score 9–10 → thank-you + prominent brand-correct "Review us on Google" button (`reviewLinkClickedAt` recorded on tap) + optional comment box.
3. Score 0–8 → "What could we do better?" comment box.
4. Score 0–6 → additionally fires an immediate alert email to `feedback.detractorAlertEmail` (fallback `contact.supportEmail`) containing score, comment, and booking context. Alert failure never blocks the response save.

**Referee rating flow:** overall stars → three dimension taps → optional comment → single submit.

**States:** already-responded → thanks page; expired → friendly expiry page. Submission endpoints (`POST /api/feedback/[token]`, plus a small comment/review-click update route) are Zod-validated and atomically single-use (`respondedAt` check-and-set in one statement).

**Graceful degradation:** if the brand has no `googleReviewUrl` configured, promoters get a plain thank-you (no broken button) and the admin NPS dashboard shows a one-time "review URL not configured" warning.

## Admin surfaces

All admin APIs follow the canonical tenant-scoped pattern (`requireSuperAdminAccess` + `requireOrganizationContext`; resource reads pinned to the resolved org).

- **Settings**: extend the existing org settings page with the two feature toggles, per-brand Google review URL fields, and the detractor-alert email override.
- **`/admin/reports/nps`**: rolling 90-day NPS headline, trend over time, response rate, breakdown by booking type and brand, review-click count, recent-responses feed with detractor comments surfaced first.
- **`/admin/reports/referee-ratings`**: per-referee table — rating count, overall average, three dimension averages, league vs tournament split, recent anonymous comments. Averages built from fewer than 5 ratings render with a low-sample badge.

## Testing

- `tests/unit/`: eligibility-window logic, 90-day and daily cap logic, NPS category derivation, token hash round-trip.
- `tests/api/`: cron rejects missing/bad `CRON_SECRET`; dispatch creates correct requests from seeded fixtures (and respects caps); submit endpoint enforces single-use, expiry, validation; report endpoints enforce tenant scoping (multi-tenant `orderBy` hazard applies to any `findFirst`).
- `tests/e2e/`: NPS promoter path (score → review CTA) and referee rating submission. Components use `useHydrationBeacon`; specs call `waitForHydration` before interactions. **These run post-merge only (`test-full`)** — run locally before merging: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- <spec>`.
- Fixtures added to `src/lib/db/seeds/seed-e2e-tests.ts`.

## Build order

- **Phase 1 — engine + NPS end-to-end:** schema + migration, settings, cron (scans 1–3), email template, public page (NPS form), detractor alerts, review funnel, NPS dashboard, tests.
- **Phase 2 — referee ratings:** `referee_ratings` table usage, cron scan 4 (roster-derived recipients, daily cap), rating form variant, email template, referee dashboard, tests.

Both feature flags remain off in prod until explicitly enabled per org.

## Out of scope (YAGNI'd)

- Multiple review destinations (Facebook etc.) — settings shape is a per-brand map, so adding platforms later is an additive change.
- Refs seeing their own ratings — revisit only if refs ask and volume makes aggregates non-identifying.
- In-app (dashboard) survey prompts, QR-code feedback at venues, reminder/re-send emails for non-responders.
- Public display of testimonials from promoter comments (the static `testimonials.tsx` component is a natural future consumer, with consent flow — explicitly not part of this build).

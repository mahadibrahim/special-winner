# Waiver + Ladder Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issues #593, #594 (remaining), #596 — kiosk class pricing/eligibility, comp credits, end-enrollment credit float, the block-abandon nudge, the server-side waiver gate, signature-recording unification, batched predicate + staff surfaces, adult coverage display, and copy fixes.

**Architecture:** No new subsystems. Each item extends an existing seam: kiosk pricing reads the class session's own rates; comp credits ride the existing floating-credit redemption; end-enrollment reuses the slot-change cancel + a grant un-pin; the waiver items extend `src/lib/consents/liability.ts` (one batched implementation) and the established stamp/record contracts.

**Tech Stack:** unchanged (Drizzle/Postgres, Astro APIs, React islands, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-01-waiver-ladder-followups-design.md` (owner decisions §1-3 are binding).

## Global Constraints

- Worktree `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/youth-classes-ux`, branch `waiver-ladder-followups`. Absolute paths; never checkout/stash.
- Enum additions ship as standalone `ADD VALUE IF NOT EXISTS` migrations. Index rebuilds RENAME the index (db-migrate-bootstrap verifies by name only).
- Waiver contracts (unchanged, binding): `WAIVER_ON_FILE_ATTRIBUTION` imported never re-declared; derived on-file stamps keep `waiverSignedAt` NULL; fresh signatures thread ip/UA from the request context, never the body; covered-probes fail toward ASKING; capture paths fail toward RECORDING; `recordLiabilityWaiver` is append-only — gate on the read helper (except where Task 3's record-when-covered ruling explicitly says record).
- Class sessions NEVER price off `drop_in_rate_card` or `walkUpRateCents` — `class_rate_not_configured` posture (409 + ops visibility) when rates are null.
- Credits: balances stay count-derived; comp credits must redeem through the existing floating path with zero engine changes (floating = `slotTemplateId IS NULL`).
- Multi-tenant: `requireOrgAdminAccess`/org pinning on every admin endpoint; explicit orderBy on every `.limit(1)`.
- API tests via `./scripts/with-bws.sh env TEST_BASE_URL=http://localhost:4321 npx vitest run <file> --config vitest.config.ts --project api`; dev server env `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 CRON_SECRET=sdd-local-cron`; self-cleaning run-unique fixtures; never mutate the shared parent account's coverage state.
- `npx tsc --noEmit` zero before every commit; Claude trailer on every commit.

---

### Task 0: Comp-credit schema

**Files:**
- Modify: `src/lib/db/schema/classes.ts`
- Create: migrations 0141 (enum only) + 0142 (columns/index)

**Interfaces:**
- Produces: `classCreditSourceEnum` gains `"comp"` (0141, `ADD VALUE IF NOT EXISTS`, nothing else). Then (0142): `classCreditGrants.stripeCheckoutSessionId` nullable; unique index REPLACED by a renamed partial `class_credit_grants_checkout_session_uq_v2` on the column `WHERE stripe_checkout_session_id IS NOT NULL` (drop old by name, create new — rename-on-change rule); new nullable `grantedByUserId` uuid FK → users (set null) with comment "set on source='comp' rows; the admin who issued them".

- [ ] Steps: enum edit → `npm run db:generate` → verify 0141 is enum-only → commit. Column/index edits → generate 0142 → hand-verify the index drop+create carries the NEW name and the partial predicate → apply both to staging (`./scripts/with-bws.sh npm run db:migrate`) → confirm the pack/block webhook idempotency tests still pass (`tests/api/class-pack-purchase.test.ts`, `class-block-purchase.test.ts` — ON CONFLICT still targets the column and now the partial index arbiter; if drizzle's `onConflictDoNothing({ target })` needs the index predicate, adjust the webhook inserts accordingly and test replay) → `npx tsc --noEmit` → commit.

### Task 1: Kiosk/front-desk class pricing + eligibility (spec A)

**Files:**
- Modify: `src/pages/api/kiosk/[locationSlug]/walkin/start.ts` (pricing ~:230, listing filter), `src/pages/api/kiosk/[locationSlug]/walkin/payment.ts` (~:163), `src/lib/self-serve/build-context.ts` (~:157), `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts` (~:134)
- Test: new `tests/api/kiosk/walkin-class-pricing.test.ts` + extend the admin walk-up test file

**Interfaces:**
- Consumes: `classRateNotConfigured` helper from `src/lib/classes/class-rate.ts` (Task 5 of the ladder plan created it — reuse, don't duplicate); `isAgeIneligible` from `@/lib/classes/enrollment`.
- Produces: for `kind='class'` sessions in every walk-up path — price = `session.sessionRateCents` (member rate only if the CHILD holds an applicable membership via `getActiveChildMembership`; the parent's adult membership never discounts); null rate → session excluded from kiosk session listings and 409 `class_rate_not_configured` on direct attempts; eligibility — class walk-ups REQUIRE a child participant (booking with `familyMemberId`; adult-self attempt → 422 `class_requires_child` reusing the existing error string) and pass the template age gate when DOB is known.

- [ ] Steps: TDD (class walk-up priced at session rate; adult card never consulted — assert amount; adult-self refusal; age gate; null-rate exclusion + 409) → implement across the four paths (read each in full first; the DEFAULT_WALK_UP_RATE_CENTS mirrors must not gain a class branch — the class branch bypasses them entirely) → regression: kiosk + walk-up + self-serve suites → tsc → commit.

### Task 2: Session-detail display + badges + guardian sentence (spec B, C, M)

**Files:**
- Modify: `src/pages/api/dropin/sessions/[id].ts` (quote for class sessions), `src/components/dropin/SessionDetail.tsx` (pack_credit badge; guardian assent rendering + recorded text for child bookings)
- Test: extend `tests/api/dropin/waiver-sign.test.ts` + the sessions/[id] test file

**Interfaces:**
- Consumes: `waiverAssentSentence` from `@/lib/consents/waiver-consent-language`; the child-membership rate rules from Task 1 (same discrimination — never the parent's adult membership, never $0 from `unlimited_pickup`).
- Produces: class-session GET responses carry the class rate (or no quote when null); `paymentMethod: "pack_credit"` renders "Paid with class credit"; the card's waiver flow for a booking with `familyMemberId` shows and records the guardian sentence (consents `consentText` = what was rendered).

- [ ] Steps: TDD → implement → regression dropin suites → tsc → commit.

### Task 3: Server waiver gate + record-real-signatures (spec H, I)

**Files:**
- Modify: `src/pages/api/dropin/bookings/index.ts` (child-path 422 gate), `src/pages/api/rentals/bookings/index.ts` + `src/lib/registrations/create-registration.ts` + `src/pages/api/registrations/guest-checkout.ts` (record-when-covered)
- Test: extend paid-makeup, rentals bookings, registrations suites

**Interfaces:**
- Produces: (H) child paid booking with no valid waiver AND no signature fields → `422 { error: "waiver_required" }` before Stripe (clients already route it — E2E asserts the panel appears via the existing scenario-8 machinery; extend if needed). (I) when covered AND a genuine typed signature arrives: record it — dated local columns (real `waiverSignedAt`) + `recordLiabilityWaiver` append with ip/UA (kiosk posture; the self-serve endpoint's comment documents the precedent). The on-file attribution stamp remains ONLY for submissions with no signature.

- [ ] Steps: TDD both halves (gate: uncovered+no-fields → 422 pre-Stripe, covered+no-fields → 200 stamped, uncovered+fields → 200 dated; record-when-covered: covered rental/registration WITH typed signature → dated row + one appended consents row) → implement → regression across the three surfaces → tsc → commit. NOTE: recording-when-covered is a deliberate exception to "gate first" — update `recordLiabilityWaiver`'s CALLER CONTRACT doc to name it.

### Task 4: Batched predicate + staff surfaces (spec J, K)

**Files:**
- Modify: `src/lib/consents/liability.ts` (batch variant sharing internals), `src/pages/api/family-members/index.ts` (probe), `src/pages/api/classes/summary.ts`, `src/lib/check-in/day-view.ts` (drop-ins :85 + rentals :133), the roll-call data source (`PickupRollCall`'s feed — find it)
- Test: extend `tests/api/consents-liability.test.ts` (batch ≡ singular property test) + day-view/check-in suites

**Interfaces:**
- Produces: `hasValidLiabilityWaiverBatch(familyMemberIds: string[], organizationId, dbOrTx?): Promise<Map<string, boolean>>` — three set-based queries (consents IN, bookings IN via sessions join, registrations IN via the 4-table join), same windows/status rules, one shared implementation with the singular form. Adopters: family-members probe (cap removed or raised — state the choice), summary per-child fan-out replaced, day-view `waiversOutstanding` counts only people who are BOTH unstamped AND uncovered (rentals + drop-ins), roll-call chips likewise.

- [ ] Steps: TDD (property test: for N seeded people across all coverage sources/edges, batch map === singular results; day-view: covered-but-unstamped row not counted) → implement → regression (summary, family-members, check-in) → tsc → commit.

### Task 5: Adult session-page coverage (spec L)

**Files:**
- Modify: `src/pages/api/dropin/sessions/[id].ts` (adult resolution — read-only self-person lookup per W6's pattern), `src/pages/api/dropin/bookings/index.ts` + `src/lib/dropin/booking.ts` (adult bookings born-stamped when covered), `SessionDetail.tsx` (already keys on the response flag)
- Test: extend waiver-sign tests with DEDICATED adult accounts (never the shared parent)

**Interfaces:**
- Produces: adult (`familyMemberId` null) bookings: covered booker → booking born `waiverSigned: true / attribution / At NULL`; session-page hides the WaiverCard via the same `bookingWaiverOnFile` flag (extend its derivation to adult bookings through the self person, read-only).

- [ ] Steps: TDD → implement → regression → tsc → commit.

### Task 6: End-enrollment credit float (spec E, owner decision 2)

**Files:**
- Modify: `src/lib/classes/enrollment.ts` (`endEnrollment` — cancel future $0 bookings + un-pin grant, one tx, post-commit waitlist promotion mirroring `changeEnrollmentSlot`), `src/pages/api/classes/enrollments/[id].ts` (DELETE response gains `{ creditsFloated, expiresAt }`), `family-classes-card.tsx` (end-enrollment confirm copy: "remaining sessions become credits usable on any class until <date>")
- Test: extend the enrollments + credit-booking API files

**Interfaces:**
- Consumes: the slot-change cancel scope (`member_allotment`+`pack_credit`, future, user_request) and `promoteNextWaitlister` post-commit pattern — same file, mirror exactly.
- Produces: after end: grant `slotTemplateId` NULL (floats), `expiresAt` unchanged; freed credits redeemable on any class (assert via `selectRedeemableGrant` against a different template); paid bookings untouched.

- [ ] Steps: TDD → implement → regression (slot-change tests must stay green — shared internals) → tsc → commit.

### Task 7: Comp credit grants (spec F, owner decision 3)

**Files:**
- Create: `src/pages/api/admin/classes/credits/grant.ts`
- Modify: the admin person page's class section (find where a child's class/membership info renders in `src/components/admin/person/PersonSections.tsx` — add an "Issue credits" action + small form: sessions count, expiry days default 90, note)
- Test: new `tests/api/admin-comp-credits.test.ts`

**Interfaces:**
- Consumes: Task 0 schema. Redemption is untouched — VERIFY by grep that nothing filters `source` in the credits lib/booking engine in a way that excludes `'comp'`, and add one API assertion: comp grant → child books a class session on it (`paymentMethod: "pack_credit"`).
- Produces: `POST /api/admin/classes/credits/grant` `{ familyMemberId, sessions (int 1-50), expiresInDays? (default 90), note? }` → grant row `source: 'comp'`, `stripeCheckoutSessionId: null`, `grantedByUserId` = the admin, `pricePaidCents: 0`; `sendOpsPing` (reuse an existing kind or add via the established enum-migration pattern ONLY if none fits — prefer reuse); 404 cross-org child; 401 non-admin. Summary/dashboard display works unchanged (label falls back to "Class pack" — acceptable; use packName-null/blockName-null path; if the label renders confusingly, set label source for comps to "Credits" via the existing label chain in the summary — state what you did).

- [ ] Steps: TDD → implement endpoint → UI → browser-check the admin flow → regression admin suites → tsc → commit.

### Task 8: Block-abandon nudge + FAQ copy (spec D, G)

**Files:**
- Create: nudge email template (follow `src/lib/email/templates/trial-convert.tsx` conventions) + cron logic (extend the materialize cron's post-run or a sibling `src/pages/api/cron/` route per whichever pattern `trial-convert` uses — read it first)
- Modify: `src/pages/youth/classes.astro` (FAQ trial line)
- Test: API test for the cron (stamp-then-send idempotency; MESSAGING gating respected)

**Interfaces:**
- Produces: daily sweep: active credit-backed enrollments where the child has NO valid waiver and NO booking on the enrollment's template → one email ever (marker column or reuse an existing one-shot pattern — a nullable `nudgeSentAt` on `class_credit_grants` is acceptable if no better home exists; that's a plain column add, fine to bundle in a normal migration) linking to `/dashboard/family/choose-slot?child=X&block=success&slot=Y`. FAQ: "Your first class is a free trial for new families" (or equivalent member-aware phrasing consistent with the honest-copy rule).

- [ ] Steps: TDD (cron: eligible family gets exactly one send across two runs; booked/covered families excluded) → implement → tsc → commit.

### Task 9: E2E + ship gates + the dated issue (spec N)

- [ ] Extend `tests/e2e/class-pack-purchase.spec.ts` (or sibling): comp-credit grant seeded → parent books with it; server 422 gate drives the waiver panel (scenario-8 machinery).
- [ ] Ship gates: seed:e2e; full unit suite; the touched API suites; Playwright class + kiosk + rentals + dashboard specs; build; tsc; e2e sweep of changed surfaces.
- [ ] File the dated issue: "2027-09: remove legacy waiver fallback queries in consents/liability.ts + reassess drop_in_bookings_waiver_signature_idx".
- [ ] Commit.

## Orchestrator notes

- Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 (serial; 1-2 share rate logic, 3-5 share liability.ts, 6-7 share credits).
- Models: 0,1,3,4,6 Opus; 2,5,7,8,9 Sonnet.
- Start the dev server before Task 1 with the documented env; implementers must not restart it (stale-Vite lesson: if islands stop hydrating mid-task, clear `node_modules/.vite` and restart with identical env, then note it).

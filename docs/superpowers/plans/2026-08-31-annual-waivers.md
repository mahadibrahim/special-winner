# Annual Waiver Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One liability-waiver signature per person per org, valid 365 days, honored by every capture/ask surface — nobody re-asked while a valid signature exists.

**Architecture:** The existing `consents` table (type `liability`, per-`family_members` person, 365-day `expiresAt`, versioned `waivers` doc + contentHash + IP/UA audit) becomes the canonical record, gaining an `organizationId`. Two shared helpers in `src/lib/consents/liability.ts` — `recordLiabilityWaiver` (canonical write; surfaces keep their local columns as denormalized audit copies) and `hasValidLiabilityWaiver` (canonical read with a 365-day-windowed legacy fallback over `drop_in_bookings`/`registrations` signature rows so recent signers are never re-asked at cutover). Every capture surface writes through the helper; every ask-gate reads through it.

**Tech Stack:** Drizzle/Postgres, Astro API routes, React islands, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-31-annual-waiver-unification-design.md` — the scout map of all surfaces (tables, files, line refs) is reproduced in each task below; trust the task text.

## Global Constraints

- Worktree `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/youth-classes-ux`, branch `annual-waivers` (stacked on `classes-purchase-ladder`). Absolute paths; never checkout/stash.
- `WAIVER_VALID_DAYS = 365`, defined once in `src/lib/consents/liability.ts`. Validity predicate everywhere: `expiresAt > now` on consents; fallback window `waiverSignedAt > now − 365d` (strict).
- Org isolation is load-bearing: a waiver at org A NEVER satisfies org B. Every consents query in the new helpers filters `organizationId`.
- The legacy fallback anchors on SIGNATURE rows only (`waiverSignedAt IS NOT NULL`); derived copies (signed=true, signedAt NULL) never satisfy.
- Local waiver columns on bookings/registrations/rentals keep being written exactly as today (audit continuity); they stop being consulted as gates.
- Spectator waivers, media consent, waiver-text unification: OUT OF SCOPE.
- Every admin/API endpoint keeps existing tenant guards; every `.limit(1)` carries explicit orderBy; migrations idempotent (`ADD COLUMN IF NOT EXISTS`, backfill UPDATEs re-run-safe).
- API tests through `./scripts/with-bws.sh env TEST_BASE_URL=http://localhost:4321 npx vitest run <file> --config vitest.config.ts --project api`; dev server must run with `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 CRON_SECRET=sdd-local-cron`.
- `npx tsc --noEmit` zero errors before every commit; commit per task with the Claude trailer.

---

### Task 0: Schema — `consents.organizationId` + backfill

**Files:**
- Modify: `src/lib/db/schema/consents.ts` (column + index on the `consents` table)
- Create: generated `src/lib/db/migrations/0139_*.sql` (hand-append backfill UPDATEs)

**Interfaces:**
- Produces: `consents.organizationId` (nullable uuid FK → organizations, cascade); partial index `consents_liability_validity_idx` on `(family_member_id, organization_id, expires_at)` WHERE `type = 'liability'`.

- [ ] **Step 1:** Add to the `consents` table definition (after `familyMemberId`):

```ts
    /** Waivers are per-organization legal releases (distinct legal entities —
     *  organizations.legalName). Nullable for legacy rows; the canonical
     *  validity predicate (src/lib/consents/liability.ts) requires an org
     *  match, so rows left NULL after backfill never satisfy it. */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
```

and to the table's index array:

```ts
    index("consents_liability_validity_idx")
      .on(table.familyMemberId, table.organizationId, table.expiresAt)
      .where(sql`type = 'liability'`),
```

(Import `organizations`, `sql`, `index` as needed.)

- [ ] **Step 2:** `npm run db:generate`; then APPEND to the generated migration (idempotent, re-run-safe):

```sql
--> statement-breakpoint
UPDATE consents c SET organization_id = w.organization_id
FROM waivers w WHERE c.waiver_id = w.id AND c.organization_id IS NULL AND w.organization_id IS NOT NULL;
--> statement-breakpoint
UPDATE consents c SET organization_id = s.organization_id
FROM registrations r JOIN seasons s ON s.id = r.season_id
WHERE c.registration_id = r.id AND c.organization_id IS NULL;
```

Verify the generated part uses `ADD COLUMN IF NOT EXISTS` semantics or is otherwise safe on re-run (drizzle emits plain ADD COLUMN — wrap manually per the 0023/0024 pattern if needed). Confirm `registrations.seasonId`/`seasons.organizationId` column names by reading the schema files before trusting the SQL above; adjust to the real join path.

- [ ] **Step 3:** Apply to staging (`./scripts/with-bws.sh npm run db:migrate`), spot-check backfill coverage with one SQL count (report rows total / backfilled / still-NULL). `npx tsc --noEmit`. Commit: `feat(consents): org-scoped liability consents + backfill`.

---

### Task 1: Canonical helpers — `src/lib/consents/liability.ts`

**Files:**
- Create: `src/lib/consents/liability.ts`
- Test: `tests/unit/consents/liability.test.ts` (pure parts), `tests/api/consents-liability.test.ts` (DB predicate)

**Interfaces:**
- Consumes: `resolveActiveLiabilityWaiver` (`src/lib/consents/active-waiver.ts`), `resolvePerson` (`src/lib/registrations/resolve-person.ts`), schema tables. `DbClient` union copied from `src/lib/memberships/get-child-membership.ts:22-24`.
- Produces (exact — later tasks call these):

```ts
export const WAIVER_VALID_DAYS = 365;

export interface LiabilityWaiverSignature {
  familyMemberId: string;
  organizationId: string;
  signedByUserId: string | null;
  signedByName: string;
  consentVariant: "adult" | "guardian";
  consentText: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  registrationId?: string | null;
}

export async function recordLiabilityWaiver(
  sig: LiabilityWaiverSignature,
  dbOrTx?: DbClient,
): Promise<void>;

export async function hasValidLiabilityWaiver(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<boolean>;
```

- [ ] **Step 1 (TDD):** failing API tests: (a) fresh consents row → true; (b) row aged >365d (`expiresAt` past) → false; (c) valid row at org A, query org B → false; (d) NO consents row but a `drop_in_bookings` signature row (waiverSigned true, waiverSignedAt 30d ago, session in org) → true (legacy fallback); (e) same but signedAt 400d ago → false; (f) derived row (signed=true, signedAt NULL) only → false; (g) legacy `registrations` signature row within window (season → org) → true; (h) `recordLiabilityWaiver` writes a row with `expiresAt = signedAt + 365d`, org set, contentHash + waiverId from `resolveActiveLiabilityWaiver`, notes carrying the variant. Unit test: the window arithmetic as a pure function if extracted, else skip unit file.
- [ ] **Step 2:** Implement. `hasValidLiabilityWaiver` runs three cheap queries short-circuiting in order: consents (indexed) → drop_in_bookings fallback (join sessions for org, `waiverSignedAt > cutoff`) → registrations fallback (join seasons for org, same cutoff). `recordLiabilityWaiver` mirrors the consent-write shape in `src/lib/consents/record.ts` (read it; reuse its internals where exported) but always sets `organizationId` and liability expiry.
- [ ] **Step 3:** Green; tsc; commit `feat(consents): canonical annual liability-waiver helpers`.

---

### Task 2: Classes engine + summary + nudge

**Files:**
- Modify: `src/lib/classes/book-child.ts` (:318-380 — the on-file query and the fresh-signature branch), `src/pages/api/classes/summary.ts` (:89-106 — `hasWaiverOnFile`), `src/components/dashboard/family-classes-card.tsx` (nudge condition)
- Test: extend `tests/api/classes-credit-booking.test.ts` + the summary test file

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `book-child.ts` waiver gate = `hasValidLiabilityWaiver(familyMemberId, session.organizationId, tx)`; fresh-signature branch additionally calls `recordLiabilityWaiver` (same tx) with variant `"guardian"`, consentText from the submitted waiver, signedByUserId = parentUserId. Summary `hasWaiverOnFile` = helper (batched: it currently batches per-child — preserve the batching by adding a batched variant OR calling per child; per-child × ≤20 is acceptable, note which you chose). Nudge condition becomes `!child.hasWaiverOnFile` alone (drop `hasEverBooked`).

- [ ] **Step 1 (TDD):** failing tests: booking 422s for a child whose only signature is >365d old (seed legacy booking row with old signedAt); booking succeeds waiver-free with a fresh consents row and NO booking history; fresh signature creates a consents row (assert row exists post-booking); summary flags flip accordingly.
- [ ] **Step 2:** Implement; re-run the classes API suites (regression).
- [ ] **Step 3:** Green; tsc; commit `feat(classes): annual waiver validity in booking engine + summary`.

---

### Task 3: Paid drop-in door — server stamping + modal probe

**Files:**
- Modify: `src/pages/api/dropin/bookings/index.ts` (child paid path), `src/lib/stripe/handle-dropin-checkout-complete.ts` (:302-361 — fulfillment write), `src/components/youth/class-dropin-modal.tsx` (panel gating)
- Test: extend `tests/api/class-pack-purchase.test.ts` or the paid-makeup test file; E2E covered in Task 7

**Interfaces:**
- Consumes: Tasks 1-2. The modal's parent surfaces: family card path has `child.hasWaiverOnFile` from summary; the public `/youth/classes` modal must probe — add `waiverOnFile: boolean` per child to whatever authed endpoint the modal already hits for children (find it: the modal's child list source — likely `/api/family-members` or the summary; extend THAT response, do not create a new endpoint).
- Produces: when a child has a valid waiver, (a) the modal skips the waiver panel on BOTH the free 422 path (server won't 422 — engine change already landed) and the paid 403 path (client checks the probe flag; sends no waiver fields); (b) the paid endpoint consults `hasValidLiabilityWaiver` server-side and stamps the created booking `waiverSigned: true, waiverSignedBy: "On file (annual waiver)"` (metadata → fulfillment), and when a FRESH signature is client-supplied, fulfillment calls `recordLiabilityWaiver`.

- [ ] **Step 1 (TDD):** failing API tests: paid child booking with valid consents row + no client waiver fields → created booking row `waiverSigned: true`; expired-signature child + no fields → booking still created but `waiverSigned: false` (client would have shown the panel; server stays permissive — post-payment capture remains the backstop, matching today's adult posture); fresh client-supplied signature → consents row written at fulfillment.
- [ ] **Step 2:** Implement server + modal (probe flag; panel only when `!waiverOnFile`).
- [ ] **Step 3:** Green; tsc; commit `feat(dropin): annual-waiver aware paid door + fulfillment consent record`.

---

### Task 4: Post-payment WaiverCard + self-serve/kiosk endpoint + build-context

**Files:**
- Modify: `src/pages/api/dropin/bookings/[id]/waiver.ts`, `src/pages/api/self-serve/[token]/waiver.ts` (all signature branches; replace the inline 365-day math + hardcoded contentHash at :128-135 with the helper), `src/lib/self-serve/build-context.ts` (outstanding-waiver derivation :79-205)
- Test: extend the self-serve/kiosk API test files (find: `grep -rl "self-serve" tests/api/`)

**Interfaces:**
- Consumes: Task 1 helpers; `resolveSigner` (`src/lib/check-in/resolve-signer.ts`) supplies person + isMinor per target kind.
- Produces: every signature branch calls `recordLiabilityWaiver` (person from resolveSigner; skip silently when no `family_members` person resolves — e.g. anonymous guest bookings with no person row — and note that limitation in a comment); `build-context` marks `outstanding.waiver = false` when the resolved person has a valid waiver (including the `roster_entry` branch that today hardcodes `true`); the WaiverCard endpoint's `alreadySigned` short-circuit additionally returns `alreadySigned: true` when the person's waiver is valid even if THIS booking row is unsigned (stamp the row `waiverSigned: true, waiverSignedBy: "On file (annual waiver)"` in that case).

- [ ] **Step 1 (TDD):** failing tests per branch: kiosk-signed booking → consents row exists; person with valid waiver → build-context reports no outstanding waiver for a new booking token; WaiverCard endpoint on-file short-circuit stamps the row.
- [ ] **Step 2:** Implement; regression-run the kiosk/self-serve suites.
- [ ] **Step 3:** Green; tsc; commit `feat(waivers): self-serve + post-payment surfaces write/honor annual consent`.

---

### Task 5: Registration surfaces

**Files:**
- Modify: `src/lib/registrations/create-registration.ts` (:40-44, :495, :626 region), `src/pages/api/registrations/[id]/complete.ts` (:129-130 short-circuit + signature branch), `src/pages/api/admin/walk-up-registration.ts` (consents write → helper), `src/pages/api/cron/send-waiver-reminders.ts` (:81-87 predicate)
- Test: extend the registration + completion + reminder-cron API test files

**Interfaces:**
- Consumes: Task 1 helpers. Registrations already write `consents` rows — switch those writes to `recordLiabilityWaiver` (org from the season), keeping any non-liability consent writes untouched.
- Produces: at registration creation, when the participant has a valid waiver → `registrations.waiverSigned: true, waiverSignedBy: "On file (annual waiver)", waiverSignedAt: null` (**NEVER stamp a date on a derived on-file row** — the legacy registrations fallback in liability.ts accepts any dated signed row, so a dated copy would renew the very window it derives from; `isNotNull(waiverSignedAt)` is the exclusion mechanism); completion endpoint short-circuits `{ alreadySigned: true }` via the helper (and stamps the row) before rendering-state checks; a fresh completion signature records consent through the helper; reminder cron's candidate query additionally excludes registrations whose participant has a valid waiver (join or per-row check — pick the cheaper given the cron's batch size and say which).

- [ ] **Step 1 (TDD):** failing tests: create a registration for a child with a valid consents row → response/row shows waiver already satisfied and NO reminder is sent by the cron; expired-waiver child → waiver still owed; fresh completion signature → consents row written with org.
- [ ] **Step 2:** Implement; regression-run registration suites.
- [ ] **Step 3:** Green; tsc; commit `feat(registrations): honor annual waiver on file, skip redundant asks + reminders`.

---

### Task 6: Rentals

**Files:**
- Modify: `src/lib/rentals/validators.ts` (:98-130), `src/pages/api/rentals/bookings/index.ts` (:167-179), `src/lib/rentals/booking.ts` (insert sites), `src/lib/rentals/players.ts` (invite-time auto-sign)
- Test: extend rentals API test files

**Interfaces:**
- Consumes: Task 1 helpers; `resolvePerson` for the renter (adult self person).
- Produces: booking validator accepts a missing `waiverAccepted`/`waiverName` when the authed renter's person has a valid waiver (API layer resolves person + consults helper, passes a flag into the validator — the validator itself stays pure); the booking row then carries `waiverSigned: true, waiverSignedBy: "On file (annual waiver)"`; a fresh signature at booking records consent via the helper; `players.ts` invite creation marks a player `signed` (signer "On file (annual waiver)") when the player row matches a `family_members` person (by the linkage the players module already has — if none exists, auto-sign ONLY the renter-seeded player, and note the limitation) with a valid waiver.

- [ ] **Step 1 (TDD):** failing tests: renter with valid waiver books without waiver fields → 200 + row stamped; renter without → 422 as today; fresh signature → consents row.
- [ ] **Step 2:** Implement; regression rentals suites (NOTE: some rentals suites fail on local env for unrelated reasons — compare against the failure list in the PR #592 session context; only NEW failures are yours).
- [ ] **Step 3:** Green (relative to pre-existing baseline); tsc; commit `feat(rentals): honor annual waiver on file`.

---

### Task 7: E2E + ship checks

**Files:**
- Modify: `tests/e2e/class-pack-purchase.spec.ts` (waiver-gate scenario), seed if needed
- Test: full gates

**Interfaces:**
- Consumes: everything.
- Produces: E2E — child with a fresh seeded consents row goes through the drop-in door straight to payment (no waiver panel); the existing no-waiver child still sees the panel (regression kept). Ship gates: unit suite, class+registration+rentals-touched API files, affected Playwright specs, `npm run build`, `npx tsc --noEmit`, e2e sweep of specs touching registration completion/self-serve surfaces.

- [ ] **Step 1:** E2E scenarios (TDD-ish: write, watch fail for the right reason if the feature gap exists, then confirm green).
- [ ] **Step 2:** Run all gates; document outputs; fix only NEW failures.
- [ ] **Step 3:** Commit `test(waivers): annual-waiver E2E + ship gates`.

---

## Orchestrator notes

- Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (strictly serial; shared helper + overlapping test files).
- Models: 0-3 Opus (schema/engine/Stripe), 4-5 Opus (multi-branch endpoint surgery), 6 Sonnet, 7 Sonnet.
- The dev server must be started before Task 2 with the documented env; implementers must not restart it (Vite-cache incidents in the prior plan).
- Rentals local-failure baseline: 16 files documented in the #592 session (SMS/Lulu/rentals/kiosk env gaps) — only deltas count.

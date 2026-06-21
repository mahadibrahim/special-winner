# Pickup Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A fast path for the venue manager to quick-create an ad-hoc/pickup game and rapidly register + check-in walk-ups onto a live attendance list, deferring waiver/payment to a texted link.

**Architecture:** A pickup game is a `drop_in_session` of `kind:"pickup"` (no schema change, no teams/season). Two new admin endpoints (`pickup/start`, `pickup/[id]/add`) wrap the existing drop-in-session insert + `resolvePerson` + the kiosk walk-in token + send-link. The UI is a quick-create form and a rapid roll-call (name+mobile → instant checked-in booking + auto-texted link), with the existing roster panel as the live attendance list.

**Tech Stack:** Astro 5 + React 19, Drizzle (PostgreSQL), Zod, Tailwind, Vitest (unit + api), Playwright (e2e).

## Global Constraints

- **No new schema.** Pickup = `drop_in_sessions.kind = "pickup"`; attendance = `drop_in_bookings`. `teamAssignment` left null (no sides).
- **Adults only (v1):** walk-ups self-register with name + their own phone (`resolvePerson` `kind:"self"`). No minor/COPPA path.
- **Tenant scoping:** both endpoints are admin-gated + org/venue-scoped (mirror the scoping in `src/pages/api/admin/person/[id].ts` / the existing dropin admin endpoints). Never create/read cross-org.
- **Don't lose a registration over a texting blip:** if the link send fails, the person is STILL added + checked-in; surface a "resend" affordance.
- **Reuse, don't rebuild:** `resolvePerson` (`src/lib/registrations/resolve-person.ts`), the drop-in-session insert, the kiosk `walkin/start` token + `check-in/send-link`, `check-in/event` roster, `ActivityDetailPanel` rows + `StatusChip`, `Sheet`, `EmptyState`/`ErrorBanner`/`LoadingSkeleton`.
- **TDD** for pure logic + endpoints. Components have NO unit tests (Testing Library not installed) — covered by the Task 6 e2e. Ignore the pre-existing `tests/unit/soccerone/venues.test.ts` DATABASE_URL failure. Endpoints are slow against staging — give data-dependent e2e assertions realistic timeouts. lucide icons, not emoji. Money is integer cents.

---

### Task 1: `normalizePhone` (pure)

**Files:**
- Create: `src/lib/venue/normalize-phone.ts`
- Test: `tests/unit/normalize-phone.test.ts`

**Interfaces:**
- Produces: `normalizePhone(raw: string): string` — strips everything but digits; if 11 digits and leads with `1`, drops the leading `1`; returns the canonical digit string (used to match an existing account by phone). Returns `""` for input with no digits.

- [ ] **Step 1: Write the failing test.** `tests/unit/normalize-phone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/venue/normalize-phone";

describe("normalizePhone", () => {
  it("strips formatting to digits", () => {
    expect(normalizePhone("(614) 555-0142")).toBe("6145550142");
  });
  it("drops a leading US country code", () => {
    expect(normalizePhone("+1 614 555 0142")).toBe("6145550142");
  });
  it("returns empty for no digits", () => {
    expect(normalizePhone("nope")).toBe("");
  });
});
```

- [ ] **Step 2: Run it, watch it fail.** `npx vitest run --config vitest.config.ts --project unit tests/unit/normalize-phone.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/venue/normalize-phone.ts`:

```ts
export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}
```

- [ ] **Step 4: Run it, watch it pass.**
- [ ] **Step 5: Commit.** `git add … && git commit -m "feat(pickup): phone normalization helper"`

---

### Task 2: `createPickupSession` + `POST /api/admin/pickup/start`

**Files:**
- Create: `src/lib/venue/create-pickup-session.ts`
- Create: `src/pages/api/admin/pickup/start.ts`
- Test: `tests/api/pickup-start.test.ts`
- Reference (read): `src/lib/db/schema/drop-in.ts` (the `dropInSessions` columns + required NOT NULLs + the `kind` enum), the existing drop-in-session creation (search `src/pages/api/admin` and the offering wizard for where a `dropInSessions` row is inserted) for the exact insert shape + rate/venue resolution, and `src/pages/api/admin/person/[id].ts` for the admin gate + org scoping.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `createPickupSession(db, { organizationId, venueId, bookableResourceId, label, capacity, walkUpRateCents, durationMinutes, createdByUserId, nowIso })` → `{ sessionId: string }` (inserts a `dropInSessions` row, `kind:"pickup"`, `startsAt = nowIso`, `endsAt = now + durationMinutes`, `teamCount:1`/no sides). `POST /api/admin/pickup/start` body `{ spaceId, label, capacity?, walkUpRateCents?, durationMinutes? }` → `{ sessionId }`; admin-gated, org/venue-scoped; 400 bad body, 401, 404 venue/space not in org.

- [ ] **Step 1: Read the references.** Find an existing `dropInSessions` insert to copy the exact required columns (organizationId, venueId, bookableResourceId, kind, sportOrClassLabel/label, startsAt, endsAt, capacity, the rate columns, status, createdByUserId, teamCount/teamColors). Confirm the admin gate + how org/venue scoping is done for dropin admin endpoints.
- [ ] **Step 2: Write the failing api test.** `tests/api/pickup-start.test.ts` using the existing helpers (`getAdminCookie`/`apiFetch`/`expectJson`): POST with a valid `{ spaceId, label }` (discover a real `spaceId`/bookable resource for the seeded org — query an existing dropin admin listing endpoint, or skip-guard if none) → 200 `{ sessionId }`; POST without auth → 401; POST `{}` → 400.
- [ ] **Step 3: Run it, watch it fail** (route missing → 404). (Dev server up; CI runs it — do not chase a local DB run if a `spaceId` isn't discoverable, guard that assertion.)
- [ ] **Step 4: Implement** `create-pickup-session.ts` (the insert with now-defaults; `durationMinutes` default 120; `teamCount: 1`, `teamColors: []` — no sides; `status` = the active/scheduled value used by other sessions; `walkUpRateCents` default from the venue's drop-in rate config or 0) and the thin route `src/pages/api/admin/pickup/start.ts` (`prerender=false`, admin gate, validate the body with zod, verify `spaceId`/venue belong to the caller's org → else 404, call `createPickupSession`, return `{ sessionId }`).
- [ ] **Step 5: Run the test, watch it pass** (or pass the guarded subset).
- [ ] **Step 6: `npx tsc --noEmit` (0); commit** `feat(pickup): start a pickup session endpoint`.

---

### Task 3: `addWalkUpToPickup` + `POST /api/admin/pickup/[sessionId]/add`

**Files:**
- Create: `src/lib/venue/add-walkup-to-pickup.ts`
- Create: `src/pages/api/admin/pickup/[sessionId]/add.ts`
- Test: `tests/api/pickup-add.test.ts`
- Reference (read): `src/lib/registrations/resolve-person.ts` (`resolvePerson` signature), `src/pages/api/kiosk/[locationSlug]/walkin/start.ts` (how it creates a confirmed booking + mints the `walkin_session` token + the user stub), `src/pages/api/admin/dropin/sessions/[id]/walk-up.ts` (the confirmed-booking insert + `checkedInAt`), `src/pages/api/admin/check-in/send-link.ts` (dispatching the waiver+pay link for a `drop_in_booking`), the `users`/`drop_in_bookings` schema.

**Interfaces:**
- Consumes: `normalizePhone` (Task 1).
- Produces: `addWalkUpToPickup(db, { sessionId, firstName, lastName, phone, orgId, actorUserId, nowIso })` → `{ bookingId, personName, userId, linkResult: { sent: boolean; channel?: string; recipientMasked?: string } }`. Logic: find a `users` row whose normalized phone matches (reuse) else create a stub user with name+phone; `resolvePerson({kind:"self", user})`; if a confirmed booking for `(sessionId, userId)` already exists return it (no dup); else insert a **confirmed** `drop_in_booking` with `checkedInAt = nowIso`; then attempt the waiver+pay link send (failure → `linkResult.sent=false`, do NOT throw). `POST /api/admin/pickup/[sessionId]/add` body `{ firstName, lastName, phone }` → 200 the result; admin-gated, scoped to the session's org/venue; 400/401/404.

- [ ] **Step 1: Read the references** to learn the exact confirmed-booking insert (columns/status/`checkedInAt`), the user-stub creation, and how `send-link` is invoked for a `drop_in_booking` (kind + targetId = bookingId).
- [ ] **Step 2: Write the failing api test.** `tests/api/pickup-add.test.ts`: create a pickup session (via `/api/admin/pickup/start`) in `beforeAll`; POST `/add` with `{ firstName:"Pat", lastName:"Walkup", phone:"(614) 555-1212" }` → 200 with `bookingId` + `personName`; POST again with the SAME phone → 200 with the SAME `bookingId` (dedupe, no dup booking); POST without auth → 401; POST to a bad session id → 404. (Don't depend on the SMS actually sending — assert `linkResult` is present, not that `sent===true`.)
- [ ] **Step 3: Run it, watch it fail** (route missing).
- [ ] **Step 4: Implement** `add-walkup-to-pickup.ts` (use `normalizePhone` to match an existing user by phone; reuse the kiosk/walk-up booking + token + send-link building blocks — do NOT re-implement them; wrap link send in try/catch → `linkResult.sent=false` on failure) and the thin route `src/pages/api/admin/pickup/[sessionId]/add.ts` (admin gate; verify the session exists + belongs to the caller's org → else 404; zod-validate the body; call `addWalkUpToPickup`; return the result).
- [ ] **Step 5: Run the test, watch it pass.**
- [ ] **Step 6: `npx tsc --noEmit` (0); commit** `feat(pickup): rapid walk-up add (register + check-in + link)`.

---

### Task 4: `PickupRollCall` + `usePickupAdd`

**Files:**
- Create: `src/components/admin/venue/command/PickupRollCall.tsx`
- Create: `src/lib/hooks/use-pickup-add.ts`
- Reference (read): `src/components/admin/venue/command/ActivityDetailPanel.tsx` (reuse its roster list rendering for the attendance list, and the `RowData`/poll pattern), `WalkInFlow.tsx` (form styling), `src/components/ui/{error-banner,empty-state}`.

**Interfaces:**
- Consumes: `POST /api/admin/pickup/[sessionId]/add` (Task 3).
- Produces: `usePickupAdd(sessionId)` → `{ add(input: { firstName: string; lastName: string; phone: string }): Promise<{ ok: boolean; error?: string }>, isAdding }`. `<PickupRollCall sessionId={string} sessionTitle={string} onClose={() => void} />` — a `Sheet`/panel: an autofocused single-row **Name + mobile → Add** form that calls `add`, clears + refocuses on success (`toast` on add), and below it the live attendance list (reuse the roster rendering from `ActivityDetailPanel` for this session, hiding the team-color). Inline error on a bad add; a "resend link" affordance per row when the row's link wasn't sent.

- [ ] **Step 1: Build `use-pickup-add.ts`** — POST to `/api/admin/pickup/${sessionId}/add`; return `{ok}`/error; `isAdding` flag.
- [ ] **Step 2: Build `PickupRollCall.tsx`** — the autofocused add row (split a single "name" field into first/last on submit, or two fields — your call; phone field), submit → `add` → on success clear + refocus the name input + `toast.success`; render the attendance list by reusing the `ActivityDetailPanel` roster for `kind=drop_in_session`/this session (or its row components), with the team-color hidden. lucide icons. `useHydrationBeacon()` for e2e.
- [ ] **Step 3: `npx tsc --noEmit` (0); commit** `feat(pickup): rapid roll-call panel`.

---

### Task 5: `StartPickupGame` + command-center wiring

**Files:**
- Create: `src/components/admin/venue/command/StartPickupGame.tsx`
- Modify: `src/components/admin/venue/command/VenueCommandCenter.tsx`
- Reference (read): `VenueCommandCenter.tsx` (the header actions where `+ Walk-in`/`Find booking` live + the `VenueTodayPayload` spaces list), `WalkInSessionPicker.tsx` (Sheet form pattern).

**Interfaces:**
- Consumes: `POST /api/admin/pickup/start` (Task 2), `PickupRollCall` (Task 4).
- Produces: `<StartPickupGame spaces={{id,name}[]} onCreated={(sessionId, title) => void} onCancel={() => void} />` — a `Sheet` form (label, space dropdown, optional capacity, walk-up rate, duration default 120) → POST `/api/admin/pickup/start` → `onCreated`. In `VenueCommandCenter`: a **"Start pickup game"** header button opens `StartPickupGame`; on create, open `PickupRollCall` for the new session. Keep the existing calendar/now-strip/attention/walk-in/find-booking intact.

- [ ] **Step 1: Build `StartPickupGame.tsx`** (the quick-create form; spaces from the command-center payload).
- [ ] **Step 2: Wire into `VenueCommandCenter`** — add the "Start pickup game" button + state; create → open `PickupRollCall`.
- [ ] **Step 3: `npx tsc --noEmit` (0); `./scripts/with-bws.sh npm run build` (Complete!); commit** `feat(pickup): start-pickup-game create + command-center entry`.

---

### Task 6: E2E — pickup mode

**Files:**
- Create: `tests/e2e/pickup-mode.spec.ts`
- Reference (read): the built `StartPickupGame`/`PickupRollCall` for selectors, `tests/utils/test-helpers.ts`.

**Interfaces:**
- Consumes: the full feature.

- [ ] **Step 1: Write the spec.** Sign in as admin → `/admin/venue` (domcontentloaded) → `waitForHydration` → click "Start pickup game" → fill label + pick a space → create → in the roll call, type a name + phone → Add → assert the player appears on the attendance list **checked in**. `test.setTimeout(90_000)`, 60s data-assertion timeouts, `count()` guards for a thin seed, `getByRole`/`data-*` selectors. Add a `data-pickup-attendee` (or similar stable selector) to the roll-call row in Task 4 if needed.
- [ ] **Step 2: `npx playwright test tests/e2e/pickup-mode.spec.ts --list` (exit 0); `npx tsc --noEmit` (0); commit** `test(e2e): pickup mode — create + rapid add`.

---

## Self-Review

**Spec coverage:**
- No new schema / pickup = drop_in_session → Tasks 2,3 (kind:"pickup"). ✓
- Quick-create with now-defaults → Task 2 (+ Task 5 UI). ✓
- Rapid roll call (name+mobile → resolvePerson dedupe-by-phone → confirmed checked-in booking → auto-text link → refocus) → Tasks 1 (phone), 3 (add), 4 (UI). ✓
- Live attendance list = roster panel, team-color hidden → Task 4. ✓
- Don't lose a registration on a send failure → Task 3 (linkResult.sent=false, no throw) + Task 4 (resend affordance). ✓
- Dedupe by phone (person) + (session,person) (booking) → Task 3. ✓
- Adults only → Tasks 3 (resolvePerson kind:"self"). ✓
- Tenant scoping on both endpoints → Tasks 2,3. ✓
- Testing (unit/api/e2e) → Tasks 1,2,3,6. ✓

**Placeholder scan:** implementer notes point at concrete files to copy (drop-in-session insert, walkin/start token, send-link, ActivityDetailPanel roster) — reconciliation against real code, not missing logic. Component tasks intentionally have no unit tests (repo convention; Task 6 e2e covers them).

**Type consistency:** `normalizePhone`, `createPickupSession`/`{sessionId}`, `addWalkUpToPickup`/`{bookingId,personName,userId,linkResult}`, the `{firstName,lastName,phone}` add body, and `usePickupAdd` are consistent across Tasks 1–6.

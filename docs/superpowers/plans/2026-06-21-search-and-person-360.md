# Search & Person 360 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a command-center search/actions bar and one adaptive person-360 card (right slide-over) that re-shapes by person type, fed by a new `GET /api/admin/person/[id]` aggregation endpoint.

**Architecture:** Pure, unit-tested logic (person-type derivation, payment/balance summary) + a thin tenant-scoped aggregation endpoint (`buildPersonProfile`) that composes existing tables. A `usePerson` hook feeds a type-aware `PersonCard` Sheet; a `CommandSearchBar` reuses the existing `/api/admin/lookup` search. Components have no unit tests (repo convention) and are covered by a Playwright e2e. Reuses the check-in / send-link / walk-in flows and card primitives.

**Tech Stack:** Astro 5 + React 19, Drizzle (PostgreSQL), Zod, Tailwind, Vitest (unit + api), Playwright (e2e).

## Global Constraints

- **Scope:** command-center front desk only — NOT a global ⌘K, NOT a dedicated `/admin/people/[id]` page (the card links to it as a fast-follow), NOT card-present payment.
- **Three person shapes, one card:** child (`family_members` with `parent_user_id`; contact = parent), adult player (`family_members` with `self_user_id`; own contact), parent/account (`users`; family roster + billing). Clearly label children; surface the parent's contact; link family both ways.
- **Reuse, don't rebuild:** `GET /api/admin/lookup` (search), `Sheet` (`@/components/ui/sheet`), `AvatarUploader` + `SendLinkActions` (`@/components/admin/check-in/*`), the `StatusChip` pattern + `Badge`, and `/api/admin/check-in/{check-in,send-link,upload-photo}` + the walk-in flow.
- **Tenant scoping:** every read is org/location-scoped via the existing helpers (`getLocationIdsForUser` / `requireSameOrg*`) — never return cross-org data. Admin-gated.
- **UI primitives:** `ErrorBanner` / `LoadingSkeleton` / `EmptyState`. Money is integer cents.
- **TDD** for pure logic. Components have NO unit tests (Testing Library isn't installed) — covered by the Task 8 e2e. `npm run test:unit` has one pre-existing unrelated failure (`soccerone/venues.test.ts`, needs DATABASE_URL) — ignore it. The person endpoint is slow against the bloated staging DB in CI (same caveat CLAUDE.md notes); give data-dependent e2e assertions realistic timeouts.

---

### Task 1: `derivePersonType` + payload types

**Files:**
- Create: `src/lib/person/person-types.ts`
- Create: `src/lib/person/derive-person-type.ts`
- Test: `tests/unit/derive-person-type.test.ts`

**Interfaces:**
- Produces:
  - `person-types.ts`: `type PersonType = "child" | "adult" | "parent"`; `interface PersonContact { name: string; phone: string | null; email: string | null; isParentContact: boolean }`; `interface PersonTodayItem { sessionId: string; title: string; timeLabel: string; waiverSigned: boolean; hasPhoto: boolean; paid: boolean; checkedIn: boolean }`; `interface PersonRegistration { id: string; label: string; sublabel: string; status: string; paid: boolean }`; `interface PersonPaymentsSummary { totalPaidCents: number; outstandingCents: number; lastPayment: { dateIso: string; amountCents: number; method: string } | null }`; `interface PersonFamilyMember { familyMemberId: string; name: string; age: number | null; summary: string }`; `interface PersonProfile { type: PersonType; id: string; name: string; age: number | null; birthDate: string | null; contact: PersonContact; flags: string[]; today: PersonTodayItem[]; registrations: PersonRegistration[]; payments: PersonPaymentsSummary; membership: { plan: string; renewsIso: string | null } | null; consents: { kind: string; granted: boolean }[]; family: PersonFamilyMember[] }`.
  - `derive-person-type.ts`: `function derivePersonType(row: { parentUserId: string | null; selfUserId: string | null } | null, isUserRecord: boolean): PersonType` — a `users` record (`isUserRecord = true`) → `"parent"`; a `family_members` row with `parentUserId` set → `"child"`; with `selfUserId` set → `"adult"`.

- [ ] **Step 1: Write the types.** Create `src/lib/person/person-types.ts` with the interfaces above. No logic.

- [ ] **Step 2: Write the failing test.** Create `tests/unit/derive-person-type.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { derivePersonType } from "@/lib/person/derive-person-type";

describe("derivePersonType", () => {
  it("classifies a users record as a parent/account", () => {
    expect(derivePersonType(null, true)).toBe("parent");
  });
  it("classifies a family_member with a parent as a child", () => {
    expect(derivePersonType({ parentUserId: "u1", selfUserId: null }, false)).toBe("child");
  });
  it("classifies a self-linked family_member as an adult", () => {
    expect(derivePersonType({ parentUserId: null, selfUserId: "u2" }, false)).toBe("adult");
  });
});
```

- [ ] **Step 3: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/derive-person-type.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement.** Create `src/lib/person/derive-person-type.ts`:

```ts
import type { PersonType } from "./person-types";

export function derivePersonType(
  row: { parentUserId: string | null; selfUserId: string | null } | null,
  isUserRecord: boolean,
): PersonType {
  if (isUserRecord) return "parent";
  if (row?.parentUserId) return "child";
  return "adult";
}
```

- [ ] **Step 5: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/derive-person-type.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/person/person-types.ts src/lib/person/derive-person-type.ts tests/unit/derive-person-type.test.ts
git commit -m "feat(person): person types + type derivation"
```

---

### Task 2: `summarizePayments` (pure)

**Files:**
- Create: `src/lib/person/summarize-payments.ts`
- Test: `tests/unit/summarize-payments.test.ts`

**Interfaces:**
- Consumes: `PersonPaymentsSummary` (Task 1).
- Produces: `function summarizePayments(rows: { amountCents: number; status: string; createdAtIso: string; method: string }[]): PersonPaymentsSummary` — `totalPaidCents` = sum of rows with status `"succeeded"`/`"paid"`; `outstandingCents` = sum of rows with status `"due"`/`"failed"`; `lastPayment` = most recent row by `createdAtIso` (or null).

- [ ] **Step 1: Write the failing test.** Create `tests/unit/summarize-payments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizePayments } from "@/lib/person/summarize-payments";

describe("summarizePayments", () => {
  const rows = [
    { amountCents: 37500, status: "paid", createdAtIso: "2026-06-19T10:00:00Z", method: "Visa ••6411" },
    { amountCents: 9000, status: "paid", createdAtIso: "2026-05-01T10:00:00Z", method: "Visa ••6411" },
    { amountCents: 1500, status: "due", createdAtIso: "2026-06-20T10:00:00Z", method: "—" },
  ];
  it("sums paid, sums outstanding, and finds the most recent payment", () => {
    const s = summarizePayments(rows);
    expect(s.totalPaidCents).toBe(46500);
    expect(s.outstandingCents).toBe(1500);
    expect(s.lastPayment?.dateIso).toBe("2026-06-20T10:00:00Z");
  });
  it("returns zeros and null for no rows", () => {
    expect(summarizePayments([])).toEqual({ totalPaidCents: 0, outstandingCents: 0, lastPayment: null });
  });
});
```

- [ ] **Step 2: Run it, watch it fail.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/summarize-payments.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement.** Create `src/lib/person/summarize-payments.ts`:

```ts
import type { PersonPaymentsSummary } from "./person-types";

const PAID = new Set(["paid", "succeeded"]);
const OWED = new Set(["due", "failed"]);

export function summarizePayments(
  rows: { amountCents: number; status: string; createdAtIso: string; method: string }[],
): PersonPaymentsSummary {
  let totalPaidCents = 0;
  let outstandingCents = 0;
  let last: { dateIso: string; amountCents: number; method: string } | null = null;
  for (const r of rows) {
    if (PAID.has(r.status)) totalPaidCents += r.amountCents;
    if (OWED.has(r.status)) outstandingCents += r.amountCents;
    if (!last || r.createdAtIso > last.dateIso) {
      last = { dateIso: r.createdAtIso, amountCents: r.amountCents, method: r.method };
    }
  }
  return { totalPaidCents, outstandingCents, lastPayment: last };
}
```

- [ ] **Step 4: Run the test, watch it pass.**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/summarize-payments.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/person/summarize-payments.ts tests/unit/summarize-payments.test.ts
git commit -m "feat(person): payments/balance summary"
```

---

### Task 3: `GET /api/admin/person/[id]` aggregation endpoint

**Files:**
- Create: `src/pages/api/admin/person/[id].ts`
- Create: `src/lib/person/build-person-profile.ts`
- Test: `tests/api/person-profile.test.ts`
- Reference (read): `src/pages/api/admin/lookup.ts` (org-scoping pattern), `src/pages/api/admin/registrations/[id]/index.ts` (registration + payment joins), `src/lib/db/schema/registrations.ts` (`familyMembers`, `registrations`), `users.ts`, `payments.ts`, `consents` schema, `memberships` schema.

**Interfaces:**
- Consumes: `derivePersonType`, `summarizePayments`, `PersonProfile` (Tasks 1-2).
- Produces: `GET /api/admin/person/[id]?as=family_member|user` → `PersonProfile` (200), admin-gated, org/location-scoped. `buildPersonProfile(db, { id, as, orgId, allowedLocationIds })` returns `PersonProfile`. 401 unauth, 404 not-found/cross-org, 400 on bad `as`.

- [ ] **Step 1: Read the references.** Read `lookup.ts` for how it resolves the caller's org + the set of in-org user ids (the scoping gate). Read `registrations/[id]/index.ts` for the registration→payment join shape. Confirm the `consents` and `memberships` table column names by reading their schema files.

- [ ] **Step 2: Write the failing API test.** Create `tests/api/person-profile.test.ts` using the real helpers (`getAdminCookie`/`apiFetch`/`expectJson` from `tests/api/setup/test-helpers.ts`, as other admin api tests do). Discover a seeded family_member id via a search call (`GET /api/admin/lookup?q=<seeded name>`) in `beforeAll`, then:

```ts
import { describe, it, expect } from "vitest";
import { apiFetch, getAdminCookie, expectJson } from "./setup/test-helpers";

describe("GET /api/admin/person/[id]", () => {
  it("returns a type-discriminated, scoped profile for a family member", async () => {
    const cookie = await getAdminCookie();
    // discover a person id from the lookup endpoint (seeded data)
    const lk = await apiFetch(`/api/admin/lookup?q=a`, { cookie });
    const body = await expectJson(lk, 200);
    const personId = body.people?.[0]?.id;
    if (!personId) return; // tolerate a seed with no people
    const res = await apiFetch(`/api/admin/person/${personId}?as=family_member`, { cookie });
    const profile = await expectJson(res, 200);
    expect(["child", "adult"]).toContain(profile.type);
    expect(profile.contact).toBeTruthy();
    expect(Array.isArray(profile.registrations)).toBe(true);
    expect(profile.payments).toHaveProperty("totalPaidCents");
  });

  it("401s without auth", async () => {
    const res = await apiFetch(`/api/admin/person/00000000-0000-0000-0000-000000000000?as=family_member`);
    expect(res.status).toBe(401);
  });
});
```

> Implementer: confirm the exact `apiFetch` cookie-arg shape from `test-helpers.ts` (other admin tests show it) and match it.

- [ ] **Step 3: Run it, watch it fail.** (Dev server up.)

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/person-profile.test.ts`
Expected: FAIL — 404 (route missing).

- [ ] **Step 4: Implement.** Create `src/lib/person/build-person-profile.ts` (`buildPersonProfile`) that, for `as = "family_member"`: loads the `family_members` row (404 if not found / not in an org location the caller can see), resolves contact from the linked parent/self `users` row (`isParentContact = true` for a child), derives `type` via `derivePersonType`, loads registrations (`registrations` by `familyMemberId` joined to seasons/programs) + their payments (→ `summarizePayments`), consents (`consents` by `familyMemberId`), today's sessions (reuse the check-in roster query filtered to this `familyMemberId`), membership (for an adult via `selfUserId`), and `family = []`. For `as = "user"`: type `"parent"`, own contact, `family` = `family_members` where `parentUserId = id` (each with an age + short summary), account billing (aggregate payments across the family's registrations), `today = []`. Compute `flags` (medical from `family_members.medicalNotes`, membership, balance). Then create the thin route `src/pages/api/admin/person/[id].ts` (`prerender = false`, admin gate, org/location scope mirroring `lookup.ts`, validate `as` ∈ {family_member,user}, call `buildPersonProfile`, return JSON).

> Tenant scoping is mandatory: a child/adult must belong to a `users` record in the caller's org (mirror `lookup.ts`'s `userIdsInOrg` gate); a `user` target must be in the caller's org. Return 404 (not 403) on scope failure.

- [ ] **Step 5: Run the test, watch it pass.**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npx vitest run --config vitest.config.ts --project api tests/api/person-profile.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check + commit.**

```bash
npx tsc --noEmit   # expect 0
git add src/pages/api/admin/person/[id].ts src/lib/person/build-person-profile.ts tests/api/person-profile.test.ts
git commit -m "feat(person): person-360 aggregation endpoint"
```

---

### Task 4: `usePerson` hook

**Files:**
- Create: `src/lib/hooks/use-person.ts`

**Interfaces:**
- Consumes: `PersonProfile` (Task 1), `GET /api/admin/person/[id]` (Task 3).
- Produces: `usePerson(target: { id: string; as: "family_member" | "user" } | null): { data: PersonProfile | null; isLoading: boolean; error: string | null }` — fetches when `target` is non-null (and refetches when it changes); no polling.

- [ ] **Step 1: Write the hook.** Create `src/lib/hooks/use-person.ts`:

```ts
import { useEffect, useState } from "react";
import type { PersonProfile } from "@/lib/person/person-types";

export function usePerson(target: { id: string; as: "family_member" | "user" } | null) {
  const [data, setData] = useState<PersonProfile | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) { setData(null); setError(null); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/person/${target.id}?as=${target.as}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then((j: PersonProfile) => { if (alive) setData(j); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [target?.id, target?.as]);

  return { data, isLoading, error };
}
```

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit   # expect 0
git add src/lib/hooks/use-person.ts
git commit -m "feat(person): usePerson fetch hook"
```

---

### Task 5: `PersonCard` (adaptive slide-over)

**Files:**
- Create: `src/components/admin/person/PersonCard.tsx`
- Create: `src/components/admin/person/PersonSections.tsx`
- Reference (read): the approved mockups `/Volumes/MahadData/Aspire-Sports/web-app/.superpowers/brainstorm/84872-1782042829/content/person-360-card.html` and `person-card-variants.html`; `src/components/ui/sheet.tsx`; `src/components/admin/check-in/AvatarUploader.tsx` + `SendLinkActions.tsx`; the `StatusChip` pattern in `src/components/admin/venue/command/ActivityDetailPanel.tsx`.

**Interfaces:**
- Consumes: `usePerson` (Task 4), `PersonProfile` (Task 1).
- Produces: `<PersonCard target={{ id, as } | null} onClose={() => void} onWalkIn={(sessionId?: string) => void} />` — a `Sheet` (right side) rendering `PersonHeader` + the type-specific body from `PersonSections`. Children get the teal tint + "Child · age N" badge + "Parent · <name>" contact + "Send to parent" link actions + COPPA consents; adults get own contact + Membership; parents get the Family roster (each row clickable → opens that person's card) + Account/billing. Loading → skeleton in the Sheet; error → `ErrorBanner`.

- [ ] **Step 1: Build the components.** Use the mockups as the visual source of truth and the existing primitives. `PersonSections` exports the section components (`PersonHeader`, `TodaySection`, `RegistrationsSection`, `PaymentsSection`, `ConsentsSection`, `MembershipSection`, `FamilySection`); `PersonCard` composes them by `profile.type`. Reuse `AvatarUploader` for the header photo, `SendLinkActions` for link actions (label it "Send to parent" when `contact.isParentContact`), and the `StatusChip` pattern for the Today chips. Family rows call a passed `onOpenPerson(familyMemberId)` to re-target the card. Match the editorial cream/ink tokens.

- [ ] **Step 2: Type-check.**

Run: `npx tsc --noEmit`
Expected: exit 0. (No component unit test — covered by the Task 8 e2e.)

- [ ] **Step 3: Commit.**

```bash
git add src/components/admin/person/PersonCard.tsx src/components/admin/person/PersonSections.tsx
git commit -m "feat(person): adaptive person-360 card"
```

---

### Task 6: `CommandSearchBar`

**Files:**
- Create: `src/components/admin/venue/command/CommandSearchBar.tsx`
- Reference (read): `src/components/admin/lookup-search.tsx` (the debounced input + `/api/admin/lookup` call + result shapes).

**Interfaces:**
- Consumes: `GET /api/admin/lookup`.
- Produces: `<CommandSearchBar onOpenPerson={(target: { id: string; as: "family_member" | "user" }) => void} onWalkIn={() => void} onFindBooking={() => void} />` — a search input (debounced, 2-char min, reusing the lookup query) with grouped results (Players → `as: "family_member"`; Parents/accounts → `as: "user"`), a `⌘K` shortcut that focuses it, and persistent `+ Walk-in` / `Find booking` buttons. Selecting a result calls `onOpenPerson`.

- [ ] **Step 1: Build the component.** Copy the debounce + fetch pattern from `lookup-search.tsx` (don't re-implement the endpoint). Render results grouped as in the mockup; a keydown listener on `⌘K`/`Ctrl+K` focuses the input (attach on mount, clean up on unmount — window listeners need hydration, which the host page provides). Players rows pass `{ id: person.id, as: "family_member" }`; account rows pass `{ id: user.id, as: "user" }`.

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit   # expect 0
git add src/components/admin/venue/command/CommandSearchBar.tsx
git commit -m "feat(person): command-center search + actions bar"
```

---

### Task 7: Wire into the command center

**Files:**
- Modify: `src/components/admin/venue/command/VenueCommandCenter.tsx`
- Reference (read): the current `VenueCommandCenter.tsx` (its header + the existing `ActivityDetailPanel`/`WalkInFlow` wiring).

**Interfaces:**
- Consumes: `CommandSearchBar` (Task 6), `PersonCard` (Task 5).
- Produces: the command center renders `CommandSearchBar` in its header; `onOpenPerson` opens `<PersonCard target=... />`; `onWalkIn` opens the existing walk-in flow (session picker → `WalkInFlow`); a roster row's person (in `ActivityDetailPanel`) can also open the `PersonCard` (pass an `onOpenPerson` down if cheap; otherwise leave roster→card as a fast-follow and note it).

- [ ] **Step 1: Wire it.** Add `CommandSearchBar` to the `VenueCommandCenter` header with state for the open `PersonCard` target. `onOpenPerson(target)` sets the target (opens the card); `PersonCard`'s `onOpenPerson` (from a family row) re-targets it. `onWalkIn` reuses the existing walk-in entry. Keep the existing calendar/now-strip/attention layout intact.

- [ ] **Step 2: Type-check + build.**

Run: `npx tsc --noEmit && ./scripts/with-bws.sh npm run build`
Expected: tsc 0; build "Complete!" (the `Astro.request.headers` warnings are known noise).

- [ ] **Step 3: Commit.**

```bash
git add src/components/admin/venue/command/VenueCommandCenter.tsx
git commit -m "feat(person): wire search + person card into the command center"
```

---

### Task 8: E2E — search → person card

**Files:**
- Create: `tests/e2e/person-360.spec.ts`
- Reference (read): `tests/utils/test-helpers.ts` (`signInAsAdmin`/`waitForHydration`), the built `CommandSearchBar`/`PersonCard` for selectors.

**Interfaces:**
- Consumes: the full feature.

- [ ] **Step 1: Write the spec.** Create `tests/e2e/person-360.spec.ts`. Align selectors to the built components. Flow: sign in as admin → `/admin/venue` (domcontentloaded) → `waitForHydration` → type a seeded name into the search → click the first Players result → assert the person card (Sheet `role="dialog"`) opens and shows the **type badge** (e.g. /child|adult/i) and a contact line. Give data-dependent assertions a realistic timeout (the person endpoint is slow against staging — same caveat as the command center). Guard with `count()` so it passes on a thin seed.

```ts
import { test, expect } from "@playwright/test";
import { signInAsAdmin, waitForHydration } from "../utils/test-helpers";

test("search opens an adaptive person card", async ({ page }) => {
  test.setTimeout(90_000);
  await signInAsAdmin(page);
  await page.goto("/admin/venue", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  const search = page.getByPlaceholder(/search|find/i).first();
  await search.fill("a");
  const firstResult = page.getByRole("option").first().or(page.locator("[data-person-result]").first());
  if ((await firstResult.count()) > 0) {
    await firstResult.click();
    const card = page.getByRole("dialog");
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(card.getByText(/child|adult|parent/i).first()).toBeVisible();
  }
});
```

> Implementer: add a stable selector (`data-person-result` on result rows and/or `role="option"`) to `CommandSearchBar` (Task 6) so the e2e is robust; confirm the search input's placeholder text matches.

- [ ] **Step 2: Verify discovery + commit.**

```bash
npx playwright test tests/e2e/person-360.spec.ts --list   # exit 0
git add tests/e2e/person-360.spec.ts
git commit -m "test(e2e): search opens the person-360 card"
```

---

## Self-Review

**Spec coverage:**
- Search/actions bar (find person / walk-in / find booking / ⌘K) → Task 6, wired in Task 7. ✓
- Adaptive person-360 card, three shapes → Tasks 1 (type), 5 (card), driven by Task 3's payload. ✓
- Clear child labeling + parent contact + "send to parent" → Task 5 (uses `contact.isParentContact`). ✓
- Family linkage both ways → Task 3 (`family` for parents) + Task 5 (`onOpenPerson` re-target). ✓
- `GET /api/admin/person/[id]` aggregation, tenant-scoped → Task 3. ✓
- Reuse lookup/check-in/send-link/walk-in/primitives → Tasks 3, 5, 6, 7. ✓
- Payments/balance, membership, consents, today → Tasks 2 (summary), 3 (compose), 5 (render). ✓
- Non-goals (global ⌘K, full person page, card-present) → respected; the "Open full profile →" link points at a fast-follow page, not built here.

**Placeholder scan:** Implementer notes point at existing files/patterns to copy (lookup scoping, apiFetch cookie shape, mockups, selectors) — reconciliation against real code, not missing logic. Component tasks intentionally have no unit tests (repo convention; Task 8 e2e covers them).

**Type consistency:** `PersonType`, `PersonProfile` (+ its nested interfaces), `derivePersonType`, `summarizePayments`, the `{ id, as }` target shape, and `GET /api/admin/person/[id]?as=` are used consistently across Tasks 1, 3, 4, 5, 6, 7, 8.

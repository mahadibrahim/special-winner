# Pickup Page Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the Pickup page — drop membership pricing, make sessions location-first, and replace the account-gated notify card with a guest-friendly, compliant opt-in banner.

**Architecture:** Three parts. Parts 1–2 are pure frontend (remove a band; add location tabs). Part 3 reuses the sanctioned kiosk-spectator consent pattern to capture verified opt-ins without an account: a new public `POST /api/dropin/notify` resolve-or-creates a passwordless user, files `pending` marketing consent, and sends an OTP (SMS) / double-opt-in link (email). The **existing** `runFillAlertSweep` dispatcher then texts SMS opt-ins with no changes — the OTP flips the opt-in it already gates on.

**Tech Stack:** Astro 5 (SSR), React 19 islands, Drizzle/Postgres, Lucia auth, Cloudflare Turnstile, Zernio SMS, Resend email, Vitest (API + unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-07-20-pickup-page-cleanup-design.md`

## Global Constraints

- **Compliance doctrine (load-bearing):** an unauthenticated surface captures **intent, not consent**. Every consent row the guest path writes is `status: "pending"` with evidence (`optInSource`, `consentTextShown`, timestamps) stored at capture. Only a verified act promotes it — SMS OTP (`promotePendingPhoneConsents`) or email double-opt-in click (`promotePendingEmailConsents`). Never pre-check an opt-in box. A pending tick never clears an unsubscribe and never resurrects a STOPped number.
- **Consent copy is stored, not invented:** use `CONSENT_COPY[channel]` from `src/lib/consents/marketing-channels.ts` verbatim as `textShown`.
- **v1 channels: SMS + Email only.** No WhatsApp toggle. SMS = capacity alerts (existing dispatcher); Email = general "sessions & leagues" updates (no capacity-email dispatcher — do not imply otherwise).
- **`users.email` is NOT NULL** — the guest path always needs an email to create/resolve the user; `firstName`/`lastName`/`phone` are nullable.
- **Turnstile:** guest (unauthenticated) submissions to `/api/dropin/notify` must pass `verifyTurnstile`. Verify closed in prod when secret unset. Signed-in submissions skip it. The widget must work on both brand hostnames (aspire + gosoccerone).
- **Multi-tenant:** every query that picks one row from a set needs an explicit `orderBy` (CI DB is shared). All org-scoped rows carry `organizationId`.
- **Pickup finder island** must call `useHydrationBeacon()` and mount `client:load` (post-merge e2e depends on it).
- **Migrations:** this plan adds **no** schema changes. If any task appears to need one, stop and re-scope.

---

## File Structure

**Part 1 (remove band):**
- Modify: `src/pages/adult/pickup.astro`
- Delete: `src/components/landing/pickup-pricing-band.astro`
- Keep: `src/lib/landing/pickup-pricing.ts` (SoccerOne still uses `pricingTiers`)

**Part 2 (location tabs):**
- Create: `src/lib/landing/pickup-session-filters.ts` (pure filter/derivation helpers — unit-testable)
- Create: `tests/unit/pickup-session-filters.test.ts`
- Modify: `src/components/landing/pickup-finder-section.tsx`

**Part 3 backend:**
- Create: `src/lib/consents/resolve-marketing-user.ts` (extracted from the kiosk)
- Modify: `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts` (import the extracted helper)
- Modify: `src/lib/consents/marketing.ts` (add `PICKUP_NOTIFY_SOURCE`, `MARKETING_CONSENT_SOURCES`)
- Modify: `src/pages/api/auth/phone-verify/check.ts` (promote for any allowlisted source)
- Create: `src/pages/api/dropin/notify.ts`
- Create: `tests/api/dropin/notify.test.ts`

**Part 3 frontend:**
- Create: `src/components/dropin/PickupNotifyBanner.tsx`
- Modify: `src/pages/adult/pickup.astro`, `src/pages/soccerone/pickup.astro`, `src/pages/dropin/index.astro`
- Modify: `src/components/dropin/PickupAlertSignup.tsx` (delete the `PickupAlertSignup` capture export; keep `MyPickupAlerts`)

---

## Task 1: Remove the membership pricing band

**Files:**
- Modify: `src/pages/adult/pickup.astro`
- Delete: `src/components/landing/pickup-pricing-band.astro`

**Interfaces:**
- Consumes: nothing.
- Produces: `/adult/pickup` renders without the pricing band; per-session price still shows on `PickupCard`.

- [ ] **Step 1: Confirm the band component has no other consumer**

Run: `grep -rn "PickupPricingBand\|pickup-pricing-band" src`
Expected: matches only in `src/pages/adult/pickup.astro` and the component's own file. (If any other page imports it, STOP and keep the component; only remove the `/adult/pickup` usage.)

- [ ] **Step 2: Remove the band + its dead data fetch from `/adult/pickup`**

In `src/pages/adult/pickup.astro`, delete the `PickupPricingBand` import (line ~10), the `<PickupPricingBand rate={rate} />` render (line ~64), and the frontmatter block that computes `rate` (the `dropInRateCard` query, lines ~20–32) plus its now-unused imports (`eq`, `getDb`, `dropInRateCard`). Leave `tiles`, `CategoryHero`, `PickupLevels`, `PickupPageFinder`, `CTABanner`, and `setMarketingEdgeCache` intact.

Resulting frontmatter (verify against the file; keep the existing `HeroTile` import and `tiles` array):

```astro
---
// src/pages/adult/pickup.astro
// SSR — /api/dropin/sessions is org-scoped via the request host.
import BaseLayout from "@/layouts/BaseLayout.astro"
import CategoryHero from "@/components/landing/category-hero.astro"
import PickupLevels from "@/components/landing/pickup-levels.astro"
import PickupPageFinder from "@/components/landing/pickup-page-finder.tsx"
import { PickupNotifyBanner } from "@/components/dropin/PickupNotifyBanner"
import CTABanner from "@/components/cta-banner"
import type { HeroTile } from "@/lib/landing/hero-tiles"
import { setMarketingEdgeCache } from "@/lib/http/edge-cache"

const tiles: HeroTile[] = [
  { label: "Soccer", key: "soccer", state: "live", statusLabel: "● Open this week", meta: "Sessions most nights", color: "oklch(0.66 0.21 35)" },
  { label: "Basketball", key: "basketball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
  { label: "Volleyball", key: "volleyball", state: "coming_soon", statusLabel: "Coming soon", meta: "Interested? Notify me" },
]
setMarketingEdgeCache(Astro);
---
```

> Note: the `PickupNotifyBanner` import/usage lands in Task 7. For this task, if `PickupNotifyBanner` does not exist yet, keep the existing `PickupAlertSignup` import/usage untouched and only remove the pricing band. (Do not break the build.)

- [ ] **Step 3: Delete the now-orphaned component**

Run: `git rm src/components/landing/pickup-pricing-band.astro`

- [ ] **Step 4: Build to confirm nothing else referenced it**

Run: `npm run build`
Expected: build succeeds; no "PickupPricingBand is not defined" or missing-import errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pickup): remove membership pricing band from /adult/pickup"
```

---

## Task 2: Location tabs on the sessions list

**Files:**
- Create: `src/lib/landing/pickup-session-filters.ts`
- Create: `tests/unit/pickup-session-filters.test.ts`
- Modify: `src/components/landing/pickup-finder-section.tsx`

**Interfaces:**
- Produces:
  - `deriveVenueTabs(sessions: SessionCardData[]): VenueTab[]` where `VenueTab = { venueId: string; venueName: string; count: number }` — distinct venues in the set, each with a session count, sorted by count desc then name asc.
  - `filterPickupSessions(sessions, filters): SessionCardData[]` where `filters = { venueId?: string | null; date?: string | null; sport?: string | null; skill?: string | null; sportKey?: string | null }`.
  - `PickupFinderSection` renders a location tab row (All + one per venue) above the Date/Sport/Skill chips; Venue is no longer a chip.

- [ ] **Step 1: Write failing unit tests for the pure helpers**

Create `tests/unit/pickup-session-filters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveVenueTabs, filterPickupSessions } from "@/lib/landing/pickup-session-filters";
import type { SessionCardData } from "@/components/dropin/SessionCard";

function s(over: Partial<SessionCardData>): SessionCardData {
  return {
    id: over.id ?? "x",
    kind: "pickup",
    audience: "adult",
    sportOrClassLabel: "Coed Soccer",
    formatLabel: null,
    skillLevel: "intermediate",
    venueId: "v1",
    venueName: "Worthington",
    startsAt: "2026-07-21T23:00:00.000Z",
    endsAt: "2026-07-22T00:00:00.000Z",
    capacity: 12,
    confirmedCount: 3,
    sessionRateCents: 1500,
    ...over,
  } as SessionCardData;
}

describe("deriveVenueTabs", () => {
  it("returns distinct venues with counts, sorted by count desc then name asc", () => {
    const tabs = deriveVenueTabs([
      s({ id: "a", venueId: "v1", venueName: "Worthington" }),
      s({ id: "b", venueId: "v2", venueName: "Downtown" }),
      s({ id: "c", venueId: "v1", venueName: "Worthington" }),
    ]);
    expect(tabs).toEqual([
      { venueId: "v1", venueName: "Worthington", count: 2 },
      { venueId: "v2", venueName: "Downtown", count: 1 },
    ]);
  });

  it("skips sessions with no venue", () => {
    const tabs = deriveVenueTabs([s({ id: "a", venueId: null, venueName: null })]);
    expect(tabs).toEqual([]);
  });
});

describe("filterPickupSessions", () => {
  const data = [
    s({ id: "a", venueId: "v1", venueName: "Worthington", sportOrClassLabel: "Coed Soccer", skillLevel: "recreational" }),
    s({ id: "b", venueId: "v2", venueName: "Downtown", sportOrClassLabel: "Mens Soccer", skillLevel: "advanced" }),
  ];

  it("filters by venueId", () => {
    expect(filterPickupSessions(data, { venueId: "v2" }).map((x) => x.id)).toEqual(["b"]);
  });

  it("null/undefined venueId returns all", () => {
    expect(filterPickupSessions(data, { venueId: null })).toHaveLength(2);
  });

  it("filters by skill and exact sport", () => {
    expect(filterPickupSessions(data, { skill: "advanced" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterPickupSessions(data, { sport: "Coed Soccer" }).map((x) => x.id)).toEqual(["a"]);
  });

  it("sportKey matches as case-insensitive substring of the label", () => {
    expect(filterPickupSessions(data, { sportKey: "soccer" })).toHaveLength(2);
    expect(filterPickupSessions(data, { sportKey: "mens" }).map((x) => x.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/pickup-session-filters.test.ts`
Expected: FAIL — module `@/lib/landing/pickup-session-filters` not found.

- [ ] **Step 3: Implement the pure helpers**

Create `src/lib/landing/pickup-session-filters.ts`:

```ts
import type { SessionCardData } from "@/components/dropin/SessionCard";

export interface VenueTab {
  venueId: string;
  venueName: string;
  count: number;
}

/** Distinct venues present in the session set, each with a count. Sorted by
 * count desc, then venue name asc — the busiest location leads. */
export function deriveVenueTabs(sessions: SessionCardData[]): VenueTab[] {
  const acc = new Map<string, VenueTab>();
  for (const sesh of sessions) {
    if (!sesh.venueId || !sesh.venueName) continue;
    const existing = acc.get(sesh.venueId);
    if (existing) existing.count++;
    else acc.set(sesh.venueId, { venueId: sesh.venueId, venueName: sesh.venueName, count: 1 });
  }
  return [...acc.values()].sort(
    (a, b) => b.count - a.count || a.venueName.localeCompare(b.venueName),
  );
}

export interface PickupFilters {
  venueId?: string | null;
  date?: string | null;
  sport?: string | null;
  skill?: string | null;
  /** Hero-tile cross-filter: substring match on the free-text sport label. */
  sportKey?: string | null;
}

export function filterPickupSessions(
  sessions: SessionCardData[],
  filters: PickupFilters,
  dateBucketOf?: (startsAt: string) => string,
): SessionCardData[] {
  return sessions.filter((sesh) => {
    if (filters.venueId && sesh.venueId !== filters.venueId) return false;
    if (filters.sportKey && !sesh.sportOrClassLabel.toLowerCase().includes(filters.sportKey.toLowerCase())) return false;
    if (filters.sport && sesh.sportOrClassLabel !== filters.sport) return false;
    if (filters.skill && sesh.skillLevel !== filters.skill) return false;
    if (filters.date && dateBucketOf && dateBucketOf(sesh.startsAt) !== filters.date) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/pickup-session-filters.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Wire the helpers + location tab row into `PickupFinderSection`**

In `src/components/landing/pickup-finder-section.tsx`:
1. Import the helpers: `import { deriveVenueTabs, filterPickupSessions } from "@/lib/landing/pickup-session-filters"`.
2. Keep `activeVenue` state but render it as a **tab row**, not a chip. Compute `const venueTabs = useMemo(() => deriveVenueTabs(sessions), [sessions])`.
3. Replace the four-way inline `filtered` `useMemo` body with a call to `filterPickupSessions(sessions, { venueId: activeVenue, date: activeDate, sport: activeSport, skill: activeSkill, sportKey: externalSportKey }, dateBucket)`.
4. Remove the `<FilterChips label="Venue" ... />` line. Keep Date/Sport/Skill chips.
5. Render the tab row above the chips (only when `venueTabs.length > 1`):

```tsx
{!loading && venueTabs.length > 1 && (
  <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by location">
    <button
      type="button"
      onClick={() => setActiveVenue(null)}
      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
        activeVenue === null ? "bg-ink text-cream" : "bg-paper border border-border text-ink-muted hover:text-ink"
      }`}
    >
      All locations
    </button>
    {venueTabs.map((t) => (
      <button
        key={t.venueId}
        type="button"
        onClick={() => setActiveVenue(t.venueId)}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
          activeVenue === t.venueId ? "bg-ink text-cream" : "bg-paper border border-border text-ink-muted hover:text-ink"
        }`}
      >
        {t.venueName} <span className="opacity-60">({t.count})</span>
      </button>
    ))}
  </div>
)}
```

6. Improve the per-location empty state. When `filtered.length === 0` but `sessions.length > 0` and `activeVenue !== null`, show:

```tsx
<div className="bg-paper border border-border rounded-2xl py-12 px-6 text-center">
  <p className="font-display text-lg text-ink">Nothing at this location in the next two weeks.</p>
  <button type="button" onClick={clearFilters} className="mt-3 text-sm font-medium text-primary hover:underline">
    See all locations
  </button>
</div>
```

Keep the existing `clearFilters` (add `setActiveVenue(null)` — it's already there) and the `visible` pagination reset effect (add nothing; `activeVenue` is already in its dep array).

- [ ] **Step 6: Build + typecheck**

Run: `npm run build && npx tsc --noEmit`
Expected: both succeed, zero type errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(pickup): location tabs on the sessions list, venue chip removed"
```

---

## Task 3: Extract `resolveMarketingUser` to a shared module

**Files:**
- Create: `src/lib/consents/resolve-marketing-user.ts`
- Modify: `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts`

**Interfaces:**
- Produces: `resolveMarketingUser(db: ConsentTx, person: { email: string; firstName?: string | null; lastName?: string | null; phone?: string | null }): Promise<string>` — resolve-or-create a passwordless user by canonical email, returns the user id.
- Consumes: `ConsentTx` from `@/lib/consents/marketing`.

- [ ] **Step 1: Move the function verbatim into a shared file**

Create `src/lib/consents/resolve-marketing-user.ts` by copying the `resolveMarketingUser` function from `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts:426-476`, widening `firstName`/`lastName`/`phone` to optional-nullable (they map to nullable columns; the notify banner may omit them):

```ts
import { eq } from "drizzle-orm";
import { users } from "@/lib/db/schema/users";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import type { ConsentTx } from "@/lib/consents/marketing";

/**
 * Resolve-or-create the PASSWORDLESS user behind a marketing opt-in.
 *
 * No password hash, no session, no org role: this person opted into marketing,
 * they did not sign up for an account. Matching an existing account on the
 * canonical email is a MATCH, not an authentication — which is exactly why the
 * callers write `pending` consent and never clear an existing opt-out.
 */
export async function resolveMarketingUser(
  db: ConsentTx,
  person: {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  },
): Promise<string> {
  const emailCanonical = normalizeForUniqueness(person.email);

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailCanonical, emailCanonical))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(users)
    .values({
      email: person.email,
      emailCanonical,
      firstName: person.firstName ?? null,
      lastName: person.lastName ?? null,
      phone: person.phone ?? null,
      passwordHash: null,
      emailVerified: false,
      phoneVerified: false,
    })
    .onConflictDoNothing({ target: users.emailCanonical })
    .returning({ id: users.id });
  if (created) return created.id;

  const [raced] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.emailCanonical, emailCanonical))
    .limit(1);
  if (!raced) throw new Error("Failed to resolve the marketing user record");
  return raced.id;
}
```

- [ ] **Step 2: Delete the local copy in the kiosk endpoint and import the shared one**

In `src/pages/api/kiosk/[locationSlug]/spectator/sign.ts`: delete the `async function resolveMarketingUser(...)` definition (lines ~426–476) and add the import near the other consent imports:

```ts
import { resolveMarketingUser } from "@/lib/consents/resolve-marketing-user";
```

Leave the call site (`resolveMarketingUser(tx, {...})`) unchanged — it passes `firstName`/`lastName`/`phone` as strings, which satisfy the widened optional types.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors. (No `normalizeForUniqueness`/`users` unused-import warnings left behind in the kiosk file — remove them if they're now unused there. Check with `grep -n "normalizeForUniqueness\|emailCanonical" src/pages/api/kiosk/[locationSlug]/spectator/sign.ts` — if the only uses were inside the moved function, drop the import.)

- [ ] **Step 4: Run the kiosk consent tests — behavior must be unchanged**

Start the dev server if not running (`R2_MOCK=1 CRON_SECRET=test npm run dev`), then:
Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/kiosk/spectator.test.ts`
Expected: PASS (same as before the refactor).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(consents): extract resolveMarketingUser to a shared module"
```

---

## Task 4: Add the pickup-notify consent source + generalize OTP promotion

**Files:**
- Modify: `src/lib/consents/marketing.ts`
- Modify: `src/pages/api/auth/phone-verify/check.ts`
- Modify: `tests/api/kiosk/spectator.test.ts` (or a new `tests/api/consent/notify-promotion.test.ts`) — add a case proving `pickup_notify` promotion

**Interfaces:**
- Produces: `PICKUP_NOTIFY_SOURCE = "pickup_notify"`, `MARKETING_CONSENT_SOURCES: ReadonlySet<string>` from `@/lib/consents/marketing`.
- Consumes: `promotePendingPhoneConsents` (existing).

- [ ] **Step 1: Add the source constant + allowlist**

In `src/lib/consents/marketing.ts`, below `KIOSK_SPECTATOR_SOURCE`:

```ts
/** The pickup notify banner's opt-in surface — recorded on every consent row it writes. */
export const PICKUP_NOTIFY_SOURCE = "pickup_notify";

/** Sources whose pending phone consents an OTP verification may promote. A
 * source not in this set owns its own promotion path and must not be touched
 * by the generic phone-verify flow. */
export const MARKETING_CONSENT_SOURCES: ReadonlySet<string> = new Set([
  KIOSK_SPECTATOR_SOURCE,
  PICKUP_NOTIFY_SOURCE,
]);
```

- [ ] **Step 2: Generalize the promotion in `phone-verify/check.ts`**

In `src/pages/api/auth/phone-verify/check.ts`, replace the `KIOSK_SPECTATOR_SOURCE`-only block (lines ~108–121) so it promotes for any allowlisted source, using the source found in `purposeContext`:

```ts
import { MARKETING_CONSENT_SOURCES } from "@/lib/consents/marketing";
// (drop the KIOSK_SPECTATOR_SOURCE import if it's now unused here)

// ...
const ctx = (phoneRow[0]?.purposeContext ?? null) as {
  source?: string;
  organizationId?: string;
} | null;
if (ctx?.source && ctx.organizationId && MARKETING_CONSENT_SOURCES.has(ctx.source)) {
  try {
    await promotePendingPhoneConsents({
      db: getDb(),
      organizationId: ctx.organizationId,
      phone: verify.phone,
      source: ctx.source,
    });
  } catch (err) {
    console.error("[phone-verify/check] consent promotion failed:", err);
  }
}
```

`promotePendingPhoneConsents` is already scoped to `status = 'pending'` rows for that `(org, phone, source)`, so a STOPped row is still not resurrected — the guarantee is unchanged.

- [ ] **Step 3: Write a failing API test for pickup_notify promotion**

Add to `tests/api/dropin/notify.test.ts` (created fully in Task 5; if writing this before Task 5, put a focused case in `tests/api/consent/notify-promotion.test.ts`). The test: POST a guest SMS opt-in to `/api/dropin/notify`, read back the returned `phoneVerificationId`, fetch the OTP code from the test seam the kiosk tests use (see `tests/api/kiosk/spectator.test.ts` for how it reads the code — mirror that exactly), POST it to `/api/auth/phone-verify/check`, then assert the `phone_opt_ins` row for that number is `status = 'opted_in'` and its `channel = 'sms'`.

> Follow the existing kiosk test's mechanism for retrieving the plaintext OTP (it is never returned by the API). Do not invent a new seam.

- [ ] **Step 4: Run it — expect FAIL until Task 5's endpoint exists**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/dropin/notify.test.ts -t "promot"`
Expected: FAIL (endpoint 404 or promotion not applied). This is picked back up in Task 5 Step 6.

- [ ] **Step 5: Typecheck + commit the source/promotion change**

Run: `npx tsc --noEmit`
Expected: zero errors.

```bash
git add src/lib/consents/marketing.ts src/pages/api/auth/phone-verify/check.ts
git commit -m "feat(consents): add pickup_notify source and generalize OTP consent promotion"
```

---

## Task 5: `POST /api/dropin/notify` — the guest opt-in endpoint

**Files:**
- Create: `src/pages/api/dropin/notify.ts`
- Create/complete: `tests/api/dropin/notify.test.ts`

**Interfaces:**
- Consumes: `resolveMarketingUser` (Task 3), `PICKUP_NOTIFY_SOURCE` (Task 4), `recordMarketingConsent`, `CONSENT_COPY`, `createPhoneVerification`, `verifyTurnstile`, `mintToken`, `sendEmailConsentConfirmationEmail`, `normalizeUsPhone`, `rateLimit`/`rateLimitedResponse`, `pickupAlertSubscriptions`, `phoneOptIns`.
- Produces: `POST /api/dropin/notify` returning `{ ok: true; awaitingCode: ("sms"|"email")[]; pending: ("sms"|"email")[]; phoneVerificationId?: string }`.

**Request body:**
```
{
  channels: ("sms" | "email")[],   // ≥1
  phone?: string,                   // required iff "sms" ∈ channels
  email?: string,                   // required iff "email" ∈ channels; also required for guests (to create the user)
  venueId?: string | null,
  sport?: string | null,
  firstName?: string,
  turnstileToken?: string           // required for guests
}
```

- [ ] **Step 1: Write the endpoint**

Create `src/pages/api/dropin/notify.ts`:

```ts
/**
 * POST /api/dropin/notify — pickup alert opt-in, guest or signed-in.
 *
 * The public, waiver-free sibling of the kiosk spectator opt-in. It captures
 * INTENT and files evidence; only a verified act (SMS OTP / email double-opt-in)
 * grants consent. Every consent row it writes is `pending`. SMS opt-ins also get
 * a pickup_alert_subscriptions row so the existing fill-alert dispatcher texts
 * them once their number is verified — no dispatcher change needed.
 *
 * Channels (v1): "sms" (capacity alerts, real) and "email" (general updates).
 */
import type { APIRoute } from "astro";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { pickupAlertSubscriptions } from "@/lib/db/schema/hosts";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import {
  recordMarketingConsent,
  PICKUP_NOTIFY_SOURCE,
} from "@/lib/consents/marketing";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import { resolveMarketingUser } from "@/lib/consents/resolve-marketing-user";
import { normalizeUsPhone } from "@/lib/sms/send";
import { createPhoneVerification } from "@/lib/auth/phone-otp";
import { mintToken } from "@/lib/check-in/tokens-db";
import { sendEmailConsentConfirmationEmail } from "@/lib/email/send";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import { env } from "@/lib/env";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

type NotifyChannel = "sms" | "email";
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const schema = z
  .object({
    channels: z.array(z.enum(["sms", "email"])).min(1),
    phone: z.string().trim().min(7).max(20).optional(),
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    venueId: z.string().uuid().nullable().optional(),
    sport: z.string().trim().max(100).nullable().optional(),
    firstName: z.string().trim().max(100).optional(),
    turnstileToken: z.string().optional(),
  })
  .refine((v) => !v.channels.includes("sms") || !!v.phone, { message: "phone is required for SMS", path: ["phone"] })
  .refine((v) => !v.channels.includes("email") || !!v.email, { message: "email is required for email", path: ["email"] });

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const org = locals.organization;
  if (!org) return json({ error: "No organization context" }, 400);

  const ip = clientAddress || "unknown";
  const limit = rateLimit(`dropin-notify:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 422);
  const input = parsed.data;

  const signedIn = !!locals.user;

  // Guests must pass Turnstile (this endpoint sends SMS/email unauthenticated).
  if (!signedIn) {
    const ok = await verifyTurnstile(input.turnstileToken ?? "", {
      secret: import.meta.env.TURNSTILE_SECRET_KEY as string | undefined,
      isProd: Boolean(import.meta.env.PROD),
    });
    if (!ok) return json({ error: "Please complete the CAPTCHA challenge." }, 400);
  }

  // Email is the user key. Signed-in users fall back to their account email.
  const email = (locals.user?.email ?? input.email)?.trim().toLowerCase();
  if (!email) return json({ error: "An email is required" }, 422);

  const wantsSms = input.channels.includes("sms");
  const phoneE164 = wantsSms ? normalizeUsPhone(input.phone ?? "") : null;
  if (wantsSms && !phoneE164) return json({ error: "A valid US phone is required for texts" }, 422);

  const db = getDb();
  const venueId = input.venueId ?? null;
  const sport = input.sport?.trim().toLowerCase() || null;

  // Already-opted-in SMS for this number? Then no OTP is needed — consent exists.
  let smsAlreadyOptedIn = false;
  if (wantsSms && phoneE164) {
    const [row] = await db
      .select({ status: phoneOptIns.status })
      .from(phoneOptIns)
      .where(and(
        eq(phoneOptIns.organizationId, org.id),
        eq(phoneOptIns.phone, phoneE164),
        eq(phoneOptIns.channel, "sms"),
      ))
      .orderBy(asc(phoneOptIns.createdAt))
      .limit(1);
    smsAlreadyOptedIn = row?.status === "opted_in";
  }

  const pending: NotifyChannel[] = [];
  const awaitingCode: NotifyChannel[] = [];

  // user + subscription + consent as one fact (mirrors spectator/sign).
  let userId: string | null = null;
  try {
    userId = await db.transaction(async (tx) => {
      const resolvedId = locals.user?.id ?? await resolveMarketingUser(tx, {
        email,
        firstName: input.firstName ?? null,
        phone: phoneE164 ?? undefined,
      });

      if (wantsSms) {
        // Upsert (app-level) the alert subscription — reactivate an existing
        // (user, venue, sport) combo rather than duplicate. NULLs make a DB
        // unique index impractical, same as the subscriptions endpoint.
        const existing = await tx
          .select({ id: pickupAlertSubscriptions.id })
          .from(pickupAlertSubscriptions)
          .where(and(
            eq(pickupAlertSubscriptions.userId, resolvedId),
            eq(pickupAlertSubscriptions.organizationId, org.id),
            venueId ? eq(pickupAlertSubscriptions.venueId, venueId) : isNull(pickupAlertSubscriptions.venueId),
            sport ? eq(pickupAlertSubscriptions.sport, sport) : isNull(pickupAlertSubscriptions.sport),
          ))
          .orderBy(asc(pickupAlertSubscriptions.createdAt))
          .limit(1);
        if (existing.length > 0) {
          await tx.update(pickupAlertSubscriptions)
            .set({ active: true, unsubscribedAt: null, updatedAt: new Date() })
            .where(eq(pickupAlertSubscriptions.id, existing[0].id));
        } else {
          await tx.insert(pickupAlertSubscriptions)
            .values({ userId: resolvedId, organizationId: org.id, venueId, sport });
        }

        // pending SMS consent (setWhere guards keep an existing opted_in/opted_out row intact)
        await recordMarketingConsent({
          db: tx, organizationId: org.id, userId: resolvedId, channel: "sms",
          phone: phoneE164 ?? undefined, source: PICKUP_NOTIFY_SOURCE,
          textShown: CONSENT_COPY.sms, status: "pending",
        });
      }

      if (input.channels.includes("email")) {
        await recordMarketingConsent({
          db: tx, organizationId: org.id, userId: resolvedId, channel: "email",
          email, source: PICKUP_NOTIFY_SOURCE, textShown: CONSENT_COPY.email, status: "pending",
        });
      }
      return resolvedId;
    });
  } catch (err) {
    console.error("[dropin/notify] capture failed:", err);
    return json({ ok: true, awaitingCode: [], pending: input.channels }, 200);
  }

  // SMS confirmation: OTP proves the number and promotes the pending consent.
  let phoneVerificationId: string | undefined;
  if (wantsSms && phoneE164) {
    if (smsAlreadyOptedIn) {
      // Already consented — subscription is live now, nothing to confirm.
    } else {
      const otp = await createPhoneVerification({
        phone: phoneE164,
        organizationId: org.id,
        purpose: "registration",
        purposeContext: { source: PICKUP_NOTIFY_SOURCE, organizationId: org.id },
      });
      if (otp.ok) { phoneVerificationId = otp.verificationId; awaitingCode.push("sms"); }
      else pending.push("sms");
    }
  }

  // Email confirmation: the double-opt-in link is email's verified act.
  if (input.channels.includes("email") && userId) {
    let sent = false;
    try {
      const token = await mintToken({
        kind: "email_consent",
        targetId: userId,
        organizationId: org.id,
        venueId: null,
        sentVia: "email",
        recipientUserId: userId,
        recipientEmail: email,
        recipientPhone: phoneE164 ?? null,
        createdByUserId: null,
        ttlHours: 24 * 14,
      });
      const origin = originForBrand(locals.brandId) ?? env.PUBLIC_APP_URL;
      const result = await sendEmailConsentConfirmationEmail({
        userId,
        recipientEmail: email,
        name: input.firstName ?? null,
        confirmUrl: `${origin}/api/consent/confirm/${token.token}`,
        consentTextShown: CONSENT_COPY.email,
        brand: locals.brandId,
      });
      sent = result.success;
    } catch (err) {
      console.error("[dropin/notify] email confirmation send failed:", err);
    }
    if (sent) awaitingCode.push("email"); else pending.push("email");
  }

  return json({ ok: true, awaitingCode, pending, phoneVerificationId }, 200);
};
```

> Before running, verify each imported symbol's exact name/signature against its source (they were confirmed while writing this plan): `mintToken` fields (`src/lib/check-in/tokens-db.ts`), `sendEmailConsentConfirmationEmail` params incl. `name` nullable (`src/lib/email/send.ts`), `createPhoneVerification` returns `{ ok, verificationId }` (`src/lib/auth/phone-otp.ts`), `pickupAlertSubscriptions` columns (`src/lib/db/schema/hosts.ts`). Fix any drift before the tests.

- [ ] **Step 2: Write the API tests**

Create `tests/api/dropin/notify.test.ts`. Model HTTP/seed setup on an existing `tests/api/dropin/*` or `tests/api/kiosk/spectator.test.ts`. Cases:

```
- guest email-only opt-in → 200, awaitingCode or pending includes "email", NO pickup_alert_subscriptions row created, one pending email_opt_ins row with consentTextShown === CONSENT_COPY.email
- guest SMS opt-in → 200, phoneVerificationId present, a pickup_alert_subscriptions row exists for the resolved user with the given venue/sport, a pending phone_opt_ins (channel sms) row exists
- guest SMS opt-in then OTP verify (Task 4 Step 3 case) → phone_opt_ins row becomes opted_in
- missing Turnstile as guest (with secret configured / isProd path) → 400   [follow how other turnstile tests simulate this; in dev the verify fails-open, so assert the guard exists via a unit-level check or a prod-env harness if available — otherwise assert the happy path and note the prod gate in a comment]
- sms channel without phone → 422; email channel without email → 422
- signed-in user (session cookie) → no Turnstile required, uses account email
- duplicate submit (same user, venue, sport) → single active subscription row (reactivated, not duplicated)
- STOPped number + SMS opt-in + valid OTP → phone_opt_ins stays opted_out (not resurrected)
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/dropin/notify.test.ts`
Expected: FAIL (endpoint not built / assertions unmet) — some will 404 before Step 1's file is picked up by the running dev server.

- [ ] **Step 4: Restart dev server so the new route is served, then implement/fix until green**

Restart the dev server (new API files require a restart to be routed). Iterate on `src/pages/api/dropin/notify.ts` until:
Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/dropin/notify.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 6: Confirm the Task 4 promotion test now passes**

Run: `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/dropin/notify.test.ts -t "promot"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/api/dropin/notify.ts tests/api/dropin/notify.test.ts
git commit -m "feat(dropin): guest pickup-alert opt-in endpoint with verified consent"
```

---

## Task 6: `PickupNotifyBanner` component

**Files:**
- Create: `src/components/dropin/PickupNotifyBanner.tsx`

**Interfaces:**
- Consumes: `POST /api/dropin/notify`, `POST /api/auth/phone-verify/check`, `TurnstileWidget` (`@/components/auth/turnstile-widget`), `/api/auth/me` (for signed-in prefill), `/api/dropin/sessions` (venue/sport option lists), `useHydrationBeacon`.
- Produces: `export function PickupNotifyBanner(props: { signedIn?: boolean })`.

**Design intent:** editorial-cream, single banner (not a bulky form). One clear value prop ("Get a text when a game needs players"), phone-first (SMS is the channel that actually delivers capacity alerts), email as an optional "also keep me posted." Native `<select>` for Location/Sport (Radix portals break under the SoccerOne token re-pin — see the comment in `PickupAlertSignup.tsx`). No pre-checked boxes. States: idle → (awaiting OTP | awaiting email confirm) → confirmed; plus error.

- [ ] **Step 1: Build the component**

Create `src/components/dropin/PickupNotifyBanner.tsx`. Structure (fill in the editorial styling to match `PickupCard`/the cream design system; keep the compliance microcopy exact):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/auth/turnstile-widget";

interface SessionLite { venueId: string | null; venueName: string | null; sportOrClassLabel: string; }

type Phase = "idle" | "awaitingCode" | "awaitingEmail" | "done";

export function PickupNotifyBanner({ signedIn: signedInProp }: { signedIn?: boolean }) {
  useHydrationBeacon();

  const [signedIn, setSignedIn] = useState<boolean | null>(signedInProp ?? null);
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [sports, setSports] = useState<string[]>([]);

  const [venueId, setVenueId] = useState("all");
  const [sport, setSport] = useState("all");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wantSms, setWantSms] = useState(true);
  const [wantEmail, setWantEmail] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const turnstileToken = useRef<string | null>(null);

  // Resolve signed-in state (prop, else probe /api/auth/me like Navigation does)
  useEffect(() => {
    if (signedInProp !== undefined) return;
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => { if (!cancelled) setSignedIn(Boolean(d.user)); })
      .catch(() => { if (!cancelled) setSignedIn(false); });
    return () => { cancelled = true; };
  }, [signedInProp]);

  // Venue/sport option lists from the live schedule (same source as the finder)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dropin/sessions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((body: { sessions: SessionLite[] }) => {
        if (cancelled) return;
        const vmap = new Map<string, string>();
        const sset = new Set<string>();
        for (const s of body.sessions ?? []) {
          if (s.venueId && s.venueName) vmap.set(s.venueId, s.venueName);
          if (s.sportOrClassLabel) sset.add(s.sportOrClassLabel.toLowerCase());
        }
        setVenues(Array.from(vmap, ([id, name]) => ({ id, name })));
        setSports(Array.from(sset));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    setError(null);
    const channels: string[] = [];
    if (wantSms) channels.push("sms");
    if (wantEmail) channels.push("email");
    if (channels.length === 0) { setError("Pick at least one way to be notified."); return; }
    if (wantSms && !phone.trim()) { setError("Enter a phone number for texts."); return; }
    if (wantEmail && !email.trim()) { setError("Enter an email address."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dropin/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels,
          phone: wantSms ? phone.trim() : undefined,
          email: wantEmail ? email.trim() : undefined,
          venueId: venueId === "all" ? null : venueId,
          sport: sport === "all" ? null : sport,
          turnstileToken: turnstileToken.current ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't sign you up — try again."); return; }

      if (data.awaitingCode?.includes("sms") && data.phoneVerificationId) {
        setVerificationId(data.phoneVerificationId);
        setPhase("awaitingCode");
      } else if (data.awaitingCode?.includes("email")) {
        setPhase("awaitingEmail");
      } else {
        setPhase("done");
        toast.success("You're set — we'll text you when a game needs players.");
      }
    } catch {
      setError("Couldn't sign you up — try again.");
    } finally {
      setSubmitting(false);
      turnstileRef.current?.reset(); // tokens are single-use
    }
  }

  async function verifyCode() {
    if (!verificationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone-verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error ?? "That code didn't work — try again."); return; }
      setPhase("done");
      toast.success("You're on the list — we'll text you when a game needs players.");
    } catch {
      setError("Couldn't verify — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (signedIn === null) return null; // brief; avoids a flash

  // --- render (style to match the cream design system) ---
  return (
    <section className="rounded-2xl border border-border bg-paper p-6">
      {phase === "done" ? (
        <div className="text-center space-y-2">
          <h3 className="font-display text-lg text-ink">You're on the list</h3>
          <p className="text-sm text-ink-muted">We'll reach out when a pickup game needs players. Manage anytime from{" "}
            <a href="/dashboard/play" className="underline">My Play</a>.</p>
        </div>
      ) : phase === "awaitingEmail" ? (
        <div className="text-center space-y-2">
          <h3 className="font-display text-lg text-ink">Check your inbox</h3>
          <p className="text-sm text-ink-muted">Click the link we emailed to confirm. That's the last step.</p>
        </div>
      ) : phase === "awaitingCode" ? (
        <div className="space-y-3">
          <h3 className="font-display text-lg text-ink">Enter the code we texted you</h3>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink" placeholder="123456" />
          <Button onClick={verifyCode} disabled={submitting}>{submitting ? "Verifying…" : "Confirm"}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="font-display text-lg text-ink">Get a text when a game needs players</h3>
            <p className="text-sm text-ink-muted mt-1">We'll only reach out when a session near you is short — never spam.</p>
          </div>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-ink-muted mb-1">Location</span>
              <select value={venueId} onChange={(e) => setVenueId(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink">
                <option value="all">All locations</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-ink-muted mb-1">Sport</span>
              <select value={sport} onChange={(e) => setSport(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink">
                <option value="all">All sports</option>
                {sports.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </label>
          </div>

          {/* SMS (primary) */}
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={wantSms} onChange={(e) => setWantSms(e.target.checked)} className="mt-1" />
            <span className="text-sm text-ink">Text me about sessions, leagues and offers. Message and data rates may apply. Reply STOP to opt out.</span>
          </label>
          {wantSms && (
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Mobile number"
              className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink" />
          )}

          {/* Email (optional) */}
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={wantEmail} onChange={(e) => setWantEmail(e.target.checked)} className="mt-1" />
            <span className="text-sm text-ink">Email me about sessions, leagues and offers. I can unsubscribe any time.</span>
          </label>
          {wantEmail && (
            <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="Email address"
              className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink" />
          )}

          {signedIn === false && (
            <TurnstileWidget ref={turnstileRef} onToken={(t) => { turnstileToken.current = t; }} />
          )}

          <Button onClick={submit} disabled={submitting}>{submitting ? "Signing you up…" : "Notify me"}</Button>
        </div>
      )}
    </section>
  );
}
```

> The two SMS/email `<span>` sentences MUST stay character-identical to `CONSENT_COPY.sms` / `CONSENT_COPY.email` (`src/lib/consents/marketing-channels.ts`) — a carrier reviewer compares the live form against stored evidence. If that copy changes, change it in both places.

- [ ] **Step 2: Verify the TurnstileWidget prop/handle names**

Run: `grep -nE "onToken|onError|reset|TurnstileWidgetHandle|Props" src/components/auth/turnstile-widget.tsx`
Expected: confirm `onToken(token)`, optional `onError`, and a `reset()` handle. Adjust the component's usage to match the real names if they differ.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/dropin/PickupNotifyBanner.tsx
git commit -m "feat(dropin): editorial guest-friendly PickupNotifyBanner"
```

---

## Task 7: Swap the banner onto all three surfaces + retire the capture card

**Files:**
- Modify: `src/pages/adult/pickup.astro`, `src/pages/soccerone/pickup.astro`, `src/pages/dropin/index.astro`
- Modify: `src/components/dropin/PickupAlertSignup.tsx` (remove the `PickupAlertSignup` capture export; keep `MyPickupAlerts`)

**Interfaces:**
- Consumes: `PickupNotifyBanner` (Task 6).
- Produces: all three pickup capture surfaces render the new banner; `MyPickupAlerts` (dashboard) unchanged.

- [ ] **Step 1: `/adult/pickup`**

In `src/pages/adult/pickup.astro`, replace the `PickupAlertSignup` import + usage with `PickupNotifyBanner`:

```astro
import { PickupNotifyBanner } from "@/components/dropin/PickupNotifyBanner"
```
```astro
<div class="max-w-xl mx-auto px-4 mb-16">
  <PickupNotifyBanner client:load signedIn={!!Astro.locals.user} />
</div>
```

- [ ] **Step 2: `/dropin/index`**

In `src/pages/dropin/index.astro`, swap the import (line ~4) and usage (line ~18):

```astro
import { PickupNotifyBanner } from '@/components/dropin/PickupNotifyBanner';
```
```astro
<PickupNotifyBanner client:load signedIn={!!Astro.locals.user} />
```

- [ ] **Step 3: `/soccerone/pickup`**

In `src/pages/soccerone/pickup.astro`, swap the import (line ~10) and the usage inside the `.pas-panel` cream re-pin wrapper (line ~121). Keep the wrapper — the banner is editorial-cream and the SoccerOne page remaps tokens page-wide:

```astro
import { PickupNotifyBanner } from '@/components/dropin/PickupNotifyBanner';
```
```astro
<div class="pas-panel">
  <PickupNotifyBanner client:load signedIn={!!Astro.locals.user} />
</div>
```

- [ ] **Step 4: Remove the dead capture export**

In `src/components/dropin/PickupAlertSignup.tsx`, delete the `PickupAlertSignup` component/export and its now-unused helpers (`useSignedIn`, `redirectHref`, the subscribe flow) — but KEEP `MyPickupAlerts` and everything it uses. Run `grep -rn "PickupAlertSignup" src` and confirm the only remaining references are to `MyPickupAlerts` (from `src/pages/dashboard/play.astro`). If the file now only exports `MyPickupAlerts`, consider renaming later — out of scope; leave the filename.

- [ ] **Step 5: Grep for stragglers + typecheck + build**

Run: `grep -rn "PickupAlertSignup" src` → expect zero matches (only `MyPickupAlerts` remains).
Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build succeeds (no SSR/prerender warnings that are real — the pickup pages stay SSR).

- [ ] **Step 6: Update e2e specs that touch these pages**

Run: `grep -rln "pickup\|dropin\|Text me when\|pickup alerts" tests/e2e`
For any spec asserting the old pricing band or the old "Sign in to turn on pickup alerts" card, update the assertions to the new banner ("Get a text when a game needs players"). New banner island uses `useHydrationBeacon` + `client:load`, so `await waitForHydration(page)` before interacting. Remember the post-merge `test-full` gap — these specs won't gate the PR, so update them deliberately.

- [ ] **Step 7: Run affected e2e locally (if a pickup/dropin spec exists)**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- <matched-spec>`
Expected: PASS (or unchanged pre-existing failures per memory `staging-db-preexisting-test-failures` — triage by file overlap).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(pickup): swap PickupNotifyBanner onto all pickup surfaces, retire capture card"
```

---

## Final verification (before PR)

- [ ] `npx tsc --noEmit` → zero errors
- [ ] `npm run build` → succeeds
- [ ] `npx vitest run tests/unit/pickup-session-filters.test.ts` → pass
- [ ] With dev server up: `CRON_SECRET=<match> TEST_BASE_URL=http://localhost:4321 npm run test:api` → pass (notify + kiosk consent)
- [ ] Manual browser pass (per memory `verify-in-a-browser-not-just-tests`): `/adult/pickup`, `/dropin`, and a SoccerOne pickup URL — band gone, location tabs work, banner legible on BOTH brands (SoccerOne token re-pin intact), guest SMS opt-in shows the OTP step.
- [ ] No new migration was generated (this plan adds none): `git status src/lib/db/migrations` is clean.

---

## Self-Review Notes (author)

- **Spec coverage:** Part 1 → Task 1. Part 2 → Task 2. Part 3 backend → Tasks 3–5. Part 3 frontend → Tasks 6–7. Non-goals (WhatsApp delivery, new-games broadcast) intentionally excluded. Third capture surface `/dropin/index` covered in Task 7.
- **Compliance:** every guest consent row is `pending`; OTP/email double-opt-in are the only promoters; `phone-verify/check` generalization preserves the `status='pending'` scoping so STOPped numbers aren't resurrected (asserted in Task 5 tests).
- **Type consistency:** `resolveMarketingUser(db, {email, firstName?, lastName?, phone?})` defined in Task 3, consumed in Task 5. `PICKUP_NOTIFY_SOURCE`/`MARKETING_CONSENT_SOURCES` defined in Task 4, consumed in Tasks 4–5. `deriveVenueTabs`/`filterPickupSessions` defined in Task 2, consumed there. Endpoint response `{ awaitingCode, pending, phoneVerificationId }` produced in Task 5, consumed in Task 6.
- **Watch item for the implementer:** confirm `pickupAlertSubscriptions` column names (`unsubscribedAt`, `active`, `venueId`, `sport`, `userId`, `organizationId`) against `src/lib/db/schema/hosts.ts` before running Task 5 — the upsert mirrors `src/pages/api/dropin/alerts/subscriptions/index.ts`, which is the source of truth for the shape.

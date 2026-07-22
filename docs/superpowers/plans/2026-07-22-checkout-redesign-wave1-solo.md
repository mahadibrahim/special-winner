# Checkout Redesign Wave 1 (Solo Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the guest (anonymous) solo registration flow for paid mobile traffic: honor `?mode=individual`, cut the pre-payment player step to name+email, move waiver/DOB/phone to a post-payment completion step, kill the $200-deposit-on-$120 option, add the waiver-reminder email lifecycle, and extend PostHog eventing so the funnel survives.

**Architecture:** The v2 flow is gated to **adult-locked seasons only** (URL `?audience=adult` or `season.ageGroup.minAge >= 18`). Youth/ambiguous seasons keep the existing v1 flow untouched (COPPA/parental-consent path unchanged). Post-payment completion is an authed surface (guest checkout already creates a session); email deep-links ride the existing magic-link infra. Reminders are a new cron endpoint modeled byte-for-byte on `send-balance-reminders.ts`.

**Tech Stack:** Astro 5 + React 19, Drizzle/Postgres, Stripe Payment Element (already live), Resend email via `src/lib/email/`, PostHog (client `track()` + `posthog-node`), Netlify scheduled functions.

**Reference:** Approved proposal artifact "Registration Checkout — Redesign Proposal" (v4). Waves 2 (team: P1d/P1e) and 3 (wallets P2, in-app browser P3/P4) are separate follow-up plans; this plan must not block on them.

## Global Constraints

- **Worktree required.** Execute in a fresh worktree on branch `feat/checkout-redesign-solo`. The main checkout sits on `feat/seo-content-phase-a` — never switch it. Every subagent dispatch must use absolute worktree paths (see memory: subagents pin to main checkout).
- **v2 gating:** `flowVariant === "v2"` iff `audienceHint === "adult" || (season.ageGroup && season.ageGroup.minAge >= 18)`. All new behavior is behind this. v1 behavior must be byte-for-byte preserved (existing youth E2E specs must pass unmodified).
- **No PII in analytics props** — ids/slugs/enums/booleans only (existing rule, `src/lib/analytics/events.ts:1-2`).
- **Schema changes:** additive/loosening only; `npm run db:generate` after schema edits, review + commit the migration file. Never `db:push` against remote.
- **Event names never change** — only the `step` enum and new props extend; new events are new names.
- **All amounts in cents; UTC timestamps.**
- **Emails:** real sends are gated by `MESSAGING_LIVE=yes` (prod only). Local: `MESSAGING_MOCK`.
- **E2E:** any changed route/page requires a grep of `tests/e2e/` and updating affected specs in the same task — full Playwright runs only post-merge (`test-full`), they will not gate the PR.
- **Copy:** no eyebrow/kicker text (memory: no-eyebrow-text). Customer-facing copy in plain language, no internal jargon.

## File Structure (Wave 1 footprint)

```
src/pages/register/[seasonId].astro            # + read ?mode= param
src/components/registration/register-experience.tsx  # + initialMode prop
src/components/leagues/divisions-finder.tsx    # registerHref adds ?mode=individual
src/lib/registrations/deposit-policy.ts        # NEW: depositAllowed() pure helper
src/components/registration/payment-step.tsx   # deposit option uses depositAllowed
src/lib/registrations/create-registration.ts   # server-side deposit guard
src/lib/analytics/in-app-browser.ts            # NEW: isInAppBrowser()
src/lib/analytics/events.ts                    # step enum + flow/variant/in_app props
src/lib/db/schema/registrations.ts             # birth_date DROP NOT NULL; + age_review_needed
src/lib/db/migrations/NNNN_*.sql               # generated
src/components/registration/registration-wizard.tsx  # v2 step list, minimal guest submit
src/components/registration/guest-info-step.tsx      # minimal variant + input attrs (P5)
src/pages/api/registrations/guest-checkout.ts  # schema: birthDate/waiver optional (v2)
src/pages/api/registrations/[id]/complete.ts   # NEW: completion endpoint
src/components/registration/completion-form.tsx # NEW: shared post-payment form
src/components/registration/confirmation-step.tsx    # embeds CompletionForm
src/pages/account/complete/[registrationId].astro    # NEW: email resume page
src/lib/email/templates/registration-confirmation.tsx # + finish-registration CTA
src/lib/email/templates/waiver-reminder.tsx    # NEW
src/lib/email/send.ts                          # + sendWaiverReminderEmail
src/pages/api/cron/send-waiver-reminders.ts    # NEW cron
netlify/functions/scheduled-waiver-reminders.ts # NEW schedule shim
tests/unit/deposit-policy.test.ts              # NEW
tests/unit/in-app-browser.test.ts              # NEW
tests/api/registration-completion.test.ts      # NEW
tests/e2e/  (grep + update affected specs)
```

---

### Task 1: Honor `?mode=individual` end-to-end

**Files:**
- Modify: `src/pages/register/[seasonId].astro` (frontmatter reads `mode`, ~line 8)
- Modify: `src/components/registration/register-experience.tsx:13-36`
- Modify: `src/components/leagues/divisions-finder.tsx:31-34`
- Test: `tests/unit/register-href.test.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `RegisterExperience` gains prop `initialMode: "individual" | null`. `registerHref(d: Division): string` now returns `/register/{seasonId}?mode=individual` for open divisions.

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/register-href.test.ts
import { describe, it, expect } from "vitest";
import { registerHref } from "@/components/leagues/divisions-finder";

const base = { seasonId: "abc-123", status: "open" } as never;

describe("registerHref", () => {
  it("appends mode=individual for open divisions", () => {
    expect(registerHref({ ...base, status: "open" })).toBe(
      "/register/abc-123?mode=individual",
    );
  });
  it("keeps the interest link for forming divisions", () => {
    expect(registerHref({ ...base, status: "forming" })).toBe(
      "/api/public/season-interest?seasonId=abc-123",
    );
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run tests/unit/register-href.test.ts` → open-division assertion fails, no `?mode=individual` yet)

- [ ] **Step 3: Implement**

In `divisions-finder.tsx`:
```ts
export function registerHref(d: Division): string {
  if (d.status === "forming") return `/api/public/season-interest?seasonId=${d.seasonId}`;
  // Individual CTA — the register page skips the solo/team chooser when this
  // param is present. Team CTA (if added later) uses /register/team/{id}.
  return `/register/${d.seasonId}?mode=individual`;
}
```

In `[seasonId].astro` frontmatter (next to the existing `audience` read):
```ts
const modeParam = Astro.url.searchParams.get("mode"); // "individual" | null
```
and pass `initialMode={modeParam === "individual" ? "individual" : null}` on the `<RegisterExperience …>` element.

In `register-experience.tsx`, add the prop and use it in the mode initializer:
```ts
export default function RegisterExperience({
  seasonId, user, audienceHint, wasCancelled, teamToken,
  initialMode = null,
}: { /* existing props */ initialMode?: "individual" | null }) {
  // ?mode=individual comes from division cards' "Register" CTA — the visitor
  // already chose solo, so don't ask again via the ChooseMode screen.
  const [mode, setMode] = useState<"choose" | "solo" | "team">(
    teamToken ? "solo" : initialMode === "individual" ? "solo" : "choose",
  );
```

- [ ] **Step 4: Run test — expect PASS**; also `npx tsc --noEmit` clean.

- [ ] **Step 5: E2E sweep** — `grep -rn "How do you want to join\|choose-mode\|register/" tests/e2e/ | grep -iv team`. Update any spec that navigates to `/register/{id}?mode=individual` and expects the chooser. Add one assertion to the closest existing registration spec: navigating with `?mode=individual` lands directly on the player step (`h2` "Who are you registering?" or the guest form) with no "How do you want to join?" heading.

- [ ] **Step 6: Commit** — `git commit -m "feat(register): honor ?mode=individual, skip solo/team chooser"`

---

### Task 2: Deposit policy — never offer a deposit ≥ the price

**Files:**
- Create: `src/lib/registrations/deposit-policy.ts`
- Modify: `src/components/registration/registration-wizard.tsx` (where `allowDeposit` is passed to `PaymentStep`)
- Modify: `src/lib/registrations/create-registration.ts:378-383`
- Test: `tests/unit/deposit-policy.test.ts`

**Interfaces:**
- Produces: `depositAllowed(depositCents: number | null | undefined, priceCents: number): boolean` — true only when a deposit exists, is > 0, and is **strictly less** than the amount it defers.

- [ ] **Step 1: Failing test**

```ts
// tests/unit/deposit-policy.test.ts
import { describe, it, expect } from "vitest";
import { depositAllowed } from "@/lib/registrations/deposit-policy";

describe("depositAllowed", () => {
  it("rejects deposit >= price (the $200-on-$120 bug)", () => {
    expect(depositAllowed(20000, 12000)).toBe(false);
    expect(depositAllowed(12000, 12000)).toBe(false);
  });
  it("accepts a genuine partial deposit", () => {
    expect(depositAllowed(20000, 105000)).toBe(true);
  });
  it("rejects null/zero deposits", () => {
    expect(depositAllowed(null, 12000)).toBe(false);
    expect(depositAllowed(0, 12000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL** (module not found)

- [ ] **Step 3: Implement**

```ts
// src/lib/registrations/deposit-policy.ts
/**
 * A deposit is only a valid offer when it actually defers money — i.e. it is
 * strictly less than the price it holds a spot against. Fall-2026 seasons
 * carry a $200 team-oriented deposit next to a $120 solo price; offering that
 * "deposit" to a solo registrant charges MORE than paying in full.
 */
export function depositAllowed(
  depositCents: number | null | undefined,
  priceCents: number,
): boolean {
  return depositCents != null && depositCents > 0 && depositCents < priceCents;
}
```

- [ ] **Step 4: Wire client** — in `registration-wizard.tsx`, wherever `allowDeposit={...}` flows to `PaymentStep`, replace the raw season flag with:
```ts
import { depositAllowed } from "@/lib/registrations/deposit-policy";
// season.allowDeposit is the org's intent; depositAllowed() is the sanity gate.
const soloDepositOk =
  season.allowDeposit && depositAllowed(seasonDepositCents(season), fullPriceCents(season));
```
(`seasonDepositCents` = however the wizard currently derives deposit cents — reuse the existing accessor; do not invent a second one.)

- [ ] **Step 5: Wire server guard** — in `create-registration.ts` where `amountDue` is computed (line ~380):
```ts
let amountDue =
  input.registrationType === "deposit" && season.depositCents
    ? season.depositCents
    : effectivePriceCents(season);

if (
  input.registrationType === "deposit" &&
  !depositAllowed(season.depositCents, effectivePriceCents(season))
) {
  throw new RegistrationError(
    400,
    "Deposit is not available for this registration — pay in full instead.",
  );
}
```

- [ ] **Step 6: Run unit tests + `npx tsc --noEmit` — PASS.** Run `tests/api/` registration suites against the dev server to confirm no regression (deposit path on team-priced seasons must still work — those call with per-team totals where 200 < 1050).

- [ ] **Step 7: Commit** — `feat(payments): gate deposit option to deposits strictly below price`

---

### Task 3: Eventing groundwork — `in_app_browser`, flow/variant props, step enum

**Files:**
- Create: `src/lib/analytics/in-app-browser.ts`
- Modify: `src/lib/analytics/events.ts:20,36-37`
- Test: `tests/unit/in-app-browser.test.ts`

**Interfaces:**
- Produces:
  - `isInAppBrowser(ua?: string): boolean` (defaults to `navigator.userAgent`; safe in SSR — returns false when no UA).
  - `RegStep = "player" | "agreements" | "payment" | "confirm" | "completion"` (agreements stays — v1 still fires it).
  - `RegFlow = "solo" | "team_captain" | "team_member"`, `RegVariant = "v1" | "v2"`.
  - `trackRegistrationStepViewed(p: { step: RegStep; seasonId: string; flow: RegFlow; variant: RegVariant })` — auto-attaches `in_app_browser`.
  - `SERVER_EVENTS` gains `waiverSigned: "waiver_signed"`, `waiverReminderSent: "waiver_reminder_sent"`.

- [ ] **Step 1: Failing test**

```ts
// tests/unit/in-app-browser.test.ts
import { describe, it, expect } from "vitest";
import { isInAppBrowser } from "@/lib/analytics/in-app-browser";

const IG = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 334.0.4.32.98";
const FB = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/438.0.0.34.116;]";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("isInAppBrowser", () => {
  it("detects Instagram", () => expect(isInAppBrowser(IG)).toBe(true));
  it("detects Facebook (FBAN/FBAV)", () => expect(isInAppBrowser(FB)).toBe(true));
  it("passes real Safari", () => expect(isInAppBrowser(SAFARI)).toBe(false));
  it("is false with no UA (SSR)", () => expect(isInAppBrowser(undefined)).toBe(false));
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/analytics/in-app-browser.ts
/**
 * Meta's in-app webviews (Instagram / Facebook) break autofill, wallet
 * payments and OAuth. We stamp this on registration analytics (PostHog's
 * $browser is unreliable for webviews) and later use it for the escape
 * banner (Wave 3).
 */
const IN_APP_UA = /\b(Instagram|FBAN|FBAV|FB_IAB)\b/i;

export function isInAppBrowser(
  ua: string | undefined = typeof navigator !== "undefined" ? navigator.userAgent : undefined,
): boolean {
  return ua != null && IN_APP_UA.test(ua);
}
```

In `events.ts`:
```ts
export type RegStep = "player" | "agreements" | "payment" | "confirm" | "completion";
export type RegFlow = "solo" | "team_captain" | "team_member";
export type RegVariant = "v1" | "v2";

export const SERVER_EVENTS = {
  dropRegisterSubmitted: "drop_register_submitted",
  waiverSigned: "waiver_signed",
  waiverReminderSent: "waiver_reminder_sent",
} as const;

import { isInAppBrowser } from "@/lib/analytics/in-app-browser";

export const trackRegistrationStepViewed = (p: {
  step: RegStep; seasonId: string; flow: RegFlow; variant: RegVariant;
}) =>
  track(LEAGUE_EVENTS.registrationStepViewed, {
    step: p.step,
    season_id: p.seasonId,
    flow: p.flow,
    variant: p.variant,
    in_app_browser: isInAppBrowser(),
  });
```

- [ ] **Step 4: Fix the one existing call site** — `registration-wizard.tsx:451-453` now fails typecheck; pass `flow: "solo"` (guests joining via `?team=` pass `"team_member"`, captains via teamToken + captain match come in Wave 2 — for Wave 1: `flow: teamToken ? "team_member" : "solo"`) and `variant` from Task 5's `flowVariant` (until Task 5 lands, hardcode `"v1"` so this task compiles standalone).

- [ ] **Step 5: Tests + tsc PASS. Commit** — `feat(analytics): in-app detection + flow/variant/in_app_browser on step events`

---

### Task 4: Schema — nullable `birth_date`, `age_review_needed`

**Files:**
- Modify: `src/lib/db/schema/registrations.ts:66` (familyMembers.birthDate) and the `registrations` table block
- Create: generated `src/lib/db/migrations/NNNN_*.sql`

**Interfaces:**
- Produces: `familyMembers.birthDate: date | null`; `registrations.ageReviewNeeded: boolean` (default false, not null).

- [ ] **Step 1: Edit schema**

```ts
// familyMembers — DOB is deferred to post-payment for v2 adult flows, so
// self-rows may exist without one. Dependent rows still always carry a DOB
// (v1 youth flow unchanged); resolvePerson's dependent dedupe requires it.
birthDate: date("birth_date"),
```
and on `registrations`:
```ts
// Set when a post-payment DOB fails the season's age-group check — surfaces
// an admin badge instead of blocking the paid registration.
ageReviewNeeded: boolean("age_review_needed").notNull().default(false),
```

- [ ] **Step 2: Null-audit** — run `grep -rn "\.birthDate" src/ | grep -v "test\|spec"` and fix every site that assumes non-null on a **self/family-member** read. Known sites: `registration-wizard.tsx` (`calculateAge`, `isAgeEligible` — guard `if (!birthDate) return true` for eligibility "unknown yet"), `who-step.tsx` `computeMissing` (already treats falsy as missing — OK), `resolvePerson` dependent dedupe (dependent path keeps requiring DOB — assert/throw if missing), admin/dashboard renderers (render "—" for null). Every touched call site gets the null branch, not a `!` assertion.

- [ ] **Step 3: Generate migration** — `npm run db:generate`; verify the SQL is exactly a `DROP NOT NULL` + `ADD COLUMN age_review_needed boolean DEFAULT false NOT NULL` (both idempotent-safe on re-run per repo convention — wrap `ADD COLUMN` as `ADD COLUMN IF NOT EXISTS` if the generator didn't).

- [ ] **Step 4: `npx tsc --noEmit` — zero errors. Commit** — `feat(schema): nullable family_members.birth_date + registrations.age_review_needed` (schema + migration + null-audit in one commit; CI runs db:migrate).

---

### Task 5: v2 wizard — minimal guest step, no pre-payment agreements

**Files:**
- Modify: `src/components/registration/registration-wizard.tsx` (step model, canProceed, guest submit payload, step tracking)
- Modify: `src/components/registration/guest-info-step.tsx` (minimal variant + P5 input attributes)
- Test: e2e (Step 6) — the wizard is a client component; its logic is exercised through Playwright + the API test in Task 7.

**Interfaces:**
- Consumes: `depositAllowed` (Task 2), `RegFlow/RegVariant` (Task 3).
- Produces:
  - `flowVariant: "v1" | "v2"` computed as `audienceHint === "adult" || (season?.ageGroup?.minAge ?? 0) >= 18 ? "v2" : "v1"`.
  - Step lists: v1 `[player, agreements, payment, confirm]` (unchanged); v2 `[player, payment, confirm]`.
  - v2 guest POST body to `/api/registrations/guest-checkout`: `{ seasonId, registrant: { firstName, lastName, email, isSelf: true }, registrationType: "full", waiverSigned: false, teamToken?, smsConsent: false }` — **no** `birthDate`, **no** `waiverSignedBy`.
  - `GuestInfoStep` gains `minimal?: boolean` — renders only first/last/email + the sign-in link when true.

- [ ] **Step 1: Replace fixed step ids with a step list.** Keep the existing `STEP_*` constants for v1. Introduce:

```ts
type WizardStepName = "player" | "agreements" | "payment" | "confirm";
const STEP_LISTS: Record<RegVariant, WizardStepName[]> = {
  v1: ["player", "agreements", "payment", "confirm"],
  v2: ["player", "payment", "confirm"],
};
const stepList = STEP_LISTS[flowVariant];
const stepName = stepList[currentStep - 1]; // currentStep stays 1-based
```
All `currentStep === STEP_AGREEMENTS`-style branches become `stepName === "agreements"` etc. The progress header (`STEPS` array with icons) derives from `stepList` so v2 shows "Step 1 of 3". The step-viewed effect fires `trackRegistrationStepViewed({ step: stepName, seasonId: season.id, flow: teamToken ? "team_member" : "solo", variant: flowVariant })`.

- [ ] **Step 2: v2 guest validation.** In `canProceed()`, the guest player-step branch becomes:
```ts
if (isGuest) {
  const baseValid =
    guestParentFirstName.trim().length > 0 &&
    guestParentLastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestParentEmail);
  if (flowVariant === "v2") return baseValid; // name + email, nothing else
  /* v1 branches unchanged */
}
```
The v2 guest submit builds the payload in the Interfaces block above (`waiverSigned: false`, no birthDate). v1 payloads unchanged.

- [ ] **Step 3: Minimal GuestInfoStep.** Add `minimal?: boolean`; when true render exactly: heading "Claim your spot", first name, last name, email (+ collision hint), the "Already have an account? Sign in" link — no phone, no DOB, no gender, no mode toggle. Wizard passes `minimal={flowVariant === "v2"}`.

- [ ] **Step 4: P5 input attributes** on all guest inputs (both variants — pure attribute additions):
`autocomplete="given-name" / "family-name" / "email" / "tel" / "bday"`, `inputMode="email"` on email, `inputMode="tel"` on phone, `enterKeyHint="next"` (last field `"done"`), `autocapitalize="words"` on names.

- [ ] **Step 5: v2 copy.** Player step subtitle: "Pay to hold your spot — waiver and details come after." Payment step gains the season line (name · price · venue) since there's no agreements interstitial.

- [ ] **Step 6: E2E.** Update `tests/e2e/` registration specs that assert the agreements step for adult seasons; add a v2 spec: guest visits `/register/{adult season}?mode=individual`, fills name+email, reaches payment in one Continue (use `waitForHydration(page)`; the adult season id comes from the e2e seed — extend `src/lib/db/seeds/seed-e2e-tests.ts` with an adult-locked season if none exists, keeping the seed idempotent and anchored to `now` per memory: session-fixtures-must-anchor-to-now).

- [ ] **Step 7: `npm run build` + `npx tsc --noEmit` clean. Commit** — `feat(register): v2 minimal guest flow for adult-locked seasons`

---

### Task 6: guest-checkout API accepts the v2 payload

**Files:**
- Modify: `src/pages/api/registrations/guest-checkout.ts:32-88` (schema), `:395-437` (adult path)
- Test: `tests/api/registration-completion.test.ts` (created here, extended in Task 7)

**Interfaces:**
- Consumes: Task 4 (nullable birthDate), Task 5 payload shape.
- Produces: adult-self schema accepts `birthDate?: string`, `waiverSigned: boolean`, `waiverSignedBy?: string` with a refine: `waiverSigned === true → waiverSignedBy` required. Consent recording already keys off `waiverSigned` (line 292) — no change needed there.

- [ ] **Step 1: Failing API test** (dev server running; guest checkout with no birthDate/waiver):

```ts
// tests/api/registration-completion.test.ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
// ADULT_SEASON_ID: exported by the e2e seed (Task 5 Step 6)
import { ADULT_SEASON_ID } from "./helpers/seed-ids";

describe("guest-checkout v2 (deferred waiver/DOB)", () => {
  it("accepts a registrant without birthDate or waiver and returns a clientSecret", async () => {
    const email = `w1-${Date.now()}@test.aspiresports.com`;
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId: ADULT_SEASON_ID,
        registrant: { firstName: "Wave", lastName: "One", email, isSelf: true },
        registrationType: "full",
        waiverSigned: false,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret ?? body.paid ?? body.waitlisted).toBeTruthy();
  });
  it("still rejects waiverSigned:true without a signature", async () => {
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId: ADULT_SEASON_ID,
        registrant: { firstName: "A", lastName: "B", email: "x@test.aspiresports.com", isSelf: true },
        registrationType: "full",
        waiverSigned: true,
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — FAIL** (400 validation: birthDate/waiverSignedBy required).

- [ ] **Step 3: Implement schema change**

```ts
const guestRegistrantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  // v2 defers DOB to the post-payment completion step.
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isSelf: z.literal(true),
  gender: z.enum(["male", "female", "other"]).optional(),
});
```
Adult branch of `guestCheckoutSchema`: `waiverSignedBy: z.string().min(1).optional()` plus
```ts
.superRefine((d, ctx) => {
  if (d.waiverSigned && !d.waiverSignedBy?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["waiverSignedBy"], message: "Signature required when signing the waiver" });
  }
})
```
In the adult path, `birthDate: r.birthDate ?? null` through `upsertGuestUser` and `resolvePerson` (both now null-tolerant per Task 4). `runCheckout` takes `waiverSignedBy: data.waiverSignedBy ?? ""` — it's only read when `waiverSigned` is true. The **legacy parent+child union member stays untouched.**

- [ ] **Step 4: Run tests — PASS. Commit** — `feat(api): guest-checkout accepts deferred waiver/DOB (v2 adult flow)`

---

### Task 7: Completion endpoint

**Files:**
- Create: `src/pages/api/registrations/[id]/complete.ts`
- Test: extend `tests/api/registration-completion.test.ts`

**Interfaces:**
- Consumes: `recordConsent`, `recordDefaultMediaAuth` (`src/lib/consents/record.ts`), `recordPhoneOptIn` (`src/lib/sms/opt-in.ts`), `SERVER_EVENTS.waiverSigned` (Task 3), `registrations.ageReviewNeeded` (Task 4).
- Produces: `POST /api/registrations/{id}/complete` — authed (session cookie), owner-only (`registrations.registeredByUserId === locals.user.id`). Body:
```ts
{
  waiverAccepted: true,          // literal — the endpoint exists to sign
  waiverSignature: string,       // min 2 chars
  birthDate?: "YYYY-MM-DD",
  phone?: string,
  smsConsent?: boolean,
  mediaAuthOptOuts?: ("internal"|"promotional"|"public")[],
}
```
Behavior: records liability (+ `age_confirmation` for self / `parental` for dependent) consents and media auth; sets `registrations.waiverSigned = true`; writes `birthDate` to the family-member row (and `users.birthDate` for self); if the season has an ageGroup and the DOB falls outside it, sets `ageReviewNeeded = true` (never blocks); records phone opt-in; captures `waiver_signed` `{ season_id, registration_id, via, days_after_payment, age_review_needed }` with `distinctId = user.id`, where `via` comes from a `?via=email_link|confirm_screen` query param (default `confirm_screen`). Idempotent: a second call on an already-signed registration returns `200 { alreadySigned: true }` without duplicate consent rows (use `hasActiveConsent` like guest-checkout does).

- [ ] **Step 1: Failing API tests** — extend the Task 6 file: (a) unauthenticated POST → 401; (b) full happy path: run the Task 6 guest checkout, then sign in via test-account session…  **Correction:** the guest flow's session cookie comes back on the checkout response only for new users, and tests can't complete a Stripe payment. Test against a seeded registration instead: use the parent test account (`parent@test.aspiresports.com` / `TestParent123!` via `tests/api` sign-in helper) + a seeded unsigned registration (extend the e2e seed with one `waiverSigned:false` registration owned by the parent account, `UNSIGNED_REG_ID` exported alongside `ADULT_SEASON_ID`); assert 200, then a second call returns `alreadySigned: true`, and an out-of-range `birthDate` yields `age_review_needed: true` in the response.

- [ ] **Step 2: Run — FAIL (404).**

- [ ] **Step 3: Implement** the endpoint per the Interfaces block. Skeleton:

```ts
// src/pages/api/registrations/[id]/complete.ts
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations, familyMembers, users, seasons, ageGroups } from "@/lib/db/schema";
import { recordConsent, recordDefaultMediaAuth, hasActiveConsent } from "@/lib/consents/record";
import { recordPhoneOptIn } from "@/lib/sms/opt-in";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";

const bodySchema = z.object({
  waiverAccepted: z.literal(true),
  waiverSignature: z.string().min(2),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone: z.string().optional(),
  smsConsent: z.boolean().optional(),
  mediaAuthOptOuts: z.array(z.enum(["internal", "promotional", "public"])).optional(),
});

export const POST: APIRoute = async ({ request, params, locals, clientAddress, url }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  // …parse body; load registration by params.id joined to season+ageGroup+familyMember;
  // 404 unless registeredByUserId === locals.user.id (no cross-user probing);
  // if reg.waiverSigned → 200 { alreadySigned: true };
  // consents via hasActiveConsent guard, exactly like guest-checkout.ts:292-324
  //   (personKind = familyMember.selfUserId ? "self" : "dependent");
  // update familyMembers.birthDate (+ users.birthDate when self) if provided & currently null;
  // ageReviewNeeded = ageGroup && dob outside [minAge, maxAge] — compute age vs today, UTC;
  // registrations: set waiverSigned = true, ageReviewNeeded;
  // recordPhoneOptIn when phone provided (mirror guest-checkout.ts:277-290);
  // posthog.capture waiver_signed with via = url.searchParams.get("via") === "email_link" ? "email_link" : "confirm_screen",
  //   days_after_payment = floor((now - reg.createdAt) / 86_400_000);
  // return { signed: true, ageReviewNeeded };
};
```
(Executor writes the full body following those comments — every referenced helper exists and is imported above; copy the consent block from `guest-checkout.ts:292-324` rather than paraphrasing it.)

- [ ] **Step 4: Run tests — PASS** (with dev server + `E2E_TEST_ENDPOINTS=yes` per memory: dev-server env). **Commit** — `feat(api): post-payment registration completion endpoint`

---

### Task 8: Completion UI — confirm screen + email resume page

**Files:**
- Create: `src/components/registration/completion-form.tsx`
- Modify: `src/components/registration/confirmation-step.tsx`
- Create: `src/pages/account/complete/[registrationId].astro`
- Test: e2e addition to the Task 5 spec.

**Interfaces:**
- Consumes: `POST /api/registrations/{id}/complete` (Task 7), waiver text component from `waiver-step.tsx` (reuse the same legal copy source — do not fork the text), `ErrorBanner`, `trackRegistrationStepViewed` (fires `step: "completion"`).
- Produces: `CompletionForm({ registrationId, seasonId, needsBirthDate, via }: { registrationId: string; seasonId: string; needsBirthDate: boolean; via: "confirm_screen" | "email_link" })` — collapsible waiver text + accept checkbox + typed signature, DOB inputs (three plain fields MM/DD/YYYY composed to ISO — **not** a native date picker), optional phone + `SmsConsentCheckbox`, submit → success state "You're all set for game 1."

- [ ] **Step 1: Build `CompletionForm`** with the interface above. DOB block renders only when `needsBirthDate`. Fires `trackRegistrationStepViewed({ step: "completion", seasonId, flow: "solo", variant: "v2" })` on mount. Error path: `ErrorBanner`; transient failures `toast.error`.
- [ ] **Step 2: Embed in `confirmation-step.tsx`** — when the completed registration has `waiverSigned === false` (v2 flow), render heading "You're in — finish before game 1" + `CompletionForm via="confirm_screen"`. v1 confirmations unchanged.
- [ ] **Step 3: Resume page** `src/pages/account/complete/[registrationId].astro` — SSR (under `/account` middleware gate, so unauthenticated visits bounce through sign-in and return). Frontmatter loads the registration (owner check, 404 otherwise + `waiverSigned` short-circuit to a "already signed" state); renders `BaseLayout` + `CompletionForm via="email_link" client:load`. `useHydrationBeacon` inside CompletionForm (it's the page's top-level island).
- [ ] **Step 4: e2e** — extend the Task 5 spec: seeded unsigned registration → visit `/account/complete/{id}` signed in → sign waiver → assert success copy and (via API) `waiverSigned: true`.
- [ ] **Step 5: Build + tsc clean. Commit** — `feat(register): post-payment completion form on confirm screen + /account/complete resume page`

---

### Task 9: Email lifecycle — confirmation CTA + waiver reminders

**Files:**
- Modify: `src/lib/email/templates/registration-confirmation.tsx`
- Create: `src/lib/email/templates/waiver-reminder.tsx`
- Modify: `src/lib/email/send.ts` (+ `sendWaiverReminderEmail`)
- Create: `src/pages/api/cron/send-waiver-reminders.ts`
- Create: `netlify/functions/scheduled-waiver-reminders.ts`
- Test: `tests/api/` cron smoke (auth + dry shape)

**Interfaces:**
- Consumes: `createMagicLink`/`buildMagicLinkUrl` (`src/lib/auth/magic-link.ts`), `emailLogs` idempotency pattern (`send-balance-reminders.ts:130-140`), `SERVER_EVENTS.waiverReminderSent`.
- Produces: reminder emails with magic-link destination `/account/complete/{registrationId}?via=email_link`. Cadence, computed daily against `registrations` where `waiverSigned = false AND paymentStatus IN ('paid','deposit_paid') AND season.startDate >= today`:
  - `waiver_reminder_1`: createdAt ≤ now − 1d
  - `waiver_reminder_2`: createdAt ≤ now − 4d
  - `waiver_reminder_w{N}`: weekly after day 7 (N = weeks since payment, cap 8)
  - `waiver_reminder_final`: season.startDate − now ≤ 48h
  Each type sends at most once per registration (email_logs `emailType` match — same query shape as balance reminders). Each send captures `waiver_reminder_sent { registration_id, season_id, reminder_number }` keyed to the owner's user id.

- [ ] **Step 1: Confirmation template** — add a prominent "Finish your registration" button (magic-link URL) + one sentence ("Sign the waiver before your first game — takes a minute.") rendered only when the new optional prop `completionUrl?: string` is provided. Existing sends without the prop render unchanged.
- [ ] **Step 2: Wherever the confirmation email is sent post-payment** (`grep -rn "registration-confirmation" src/lib` → the send site in the payment-succeeded webhook handler), thread `completionUrl` when the registration has `waiverSigned === false`.
- [ ] **Step 3: Reminder template + `sendWaiverReminderEmail`** — subject "Sign your waiver before game 1 — {seasonName}"; body: season line, one CTA button, "we'll stop reminding you the moment it's signed." Register the send in `email_logs` exactly like `sendBalanceReminderEmail` does.
- [ ] **Step 4: Cron endpoint** — copy the structure of `send-balance-reminders.ts` wholesale: `x-cron-secret` gate, per-window loop from the Interfaces block, email_logs idempotency, per-window `{ sent, skipped, errored }` result, `captureServerException` on row errors. Brand-correct origins via `originForBrand`.
- [ ] **Step 5: Schedule shim** — `netlify/functions/scheduled-waiver-reminders.ts` copied from any existing `scheduled-*.ts` (e.g. `scheduled-day-before-reminders.ts`), daily schedule, posting to `/api/cron/send-waiver-reminders`.
- [ ] **Step 6: API smoke test** — POST without secret → 401; with `CRON_SECRET` → 200 and JSON shape `{ windows: [...] }` (matches how existing cron tests assert; mismatched CRON_SECRET manifests as spurious 401s — match dev-server env per memory).
- [ ] **Step 7: Commit** — `feat(email): completion CTA + waiver reminder lifecycle (cron + scheduled fn)`

---

### Task 10: Admin visibility — waiver-pending + age-review badges

**Files:**
- Modify: the admin registrations list component (`grep -rn "registrations" src/components/admin/ --include="*.tsx" -l` → the season/registrations table component) and its feeding endpoint if `waiverSigned`/`ageReviewNeeded` aren't already in the payload.

**Interfaces:**
- Consumes: `registrations.waiverSigned`, `registrations.ageReviewNeeded` (Task 4).
- Produces: two inline badges on registration rows — amber "Waiver pending" when `!waiverSigned`, red "Age review" when `ageReviewNeeded` — plus a filter toggle "Needs attention" that narrows to either condition. No new actions (refund/move already exist in the admin surface).

- [ ] **Step 1:** Locate the list component + endpoint; add the two fields to the endpoint's select if missing (tenant scoping via existing `requireSameOrg*` — do not touch the auth shape).
- [ ] **Step 2:** Render badges (existing badge/chip idiom in `src/components/admin/` — match it, don't invent one) + the filter.
- [ ] **Step 3:** e2e grep for admin registrations specs; update snapshots/assertions if any count columns.
- [ ] **Step 4: Commit** — `feat(admin): waiver-pending and age-review badges on registrations`

---

### Task 11: Verification + funnel ops (no code)

- [ ] **Pre-push checklist (CLAUDE.md):** `npm run db:generate` diff empty; `npm run db:seed:e2e`; API tests w/ CI-equivalent env; `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- <affected specs>`; `npm run build`; `npx tsc --noEmit` = 0.
- [ ] **PostHog (post-merge, prod):**
  - New funnel "Solo pre-payment v2": `division_register_clicked → registration_step_viewed[step=player] → [step=payment] → [step=confirm]`, filtered `variant=v2`, breakdown `in_app_browser`; add to dashboard 1862150.
  - New funnel "Completion": `registration_created → waiver_signed` (per-person, 14-day window) + trend on `waiver_reminder_sent` by `reminder_number`.
  - Annotation on release day: "checkout v2 (solo) live".
  - Leave QCwg7kcr untouched (historical).
- [ ] **PR** — via `/ship` or full checklist; PR body links the proposal artifact. CI green on origin before calling it done.

---

## Self-Review Notes

- **Spec coverage:** P1a → Tasks 1–2; P1b → Tasks 4–8; P1c → Task 9; P5 → Task 5 Step 4; eventing → Tasks 3, 7, 9, 11; admin edge-case default (§05 of proposal) → Tasks 7 (flag) + 10 (badges). P1d/P1e (team) and P2/P3/P4 (wallets/webview) are explicitly Waves 2–3. The proposal's "waiver pending on game-day roster for hosts" lands with Wave 2 (team surfaces) — noted so it isn't lost.
- **Type consistency:** `RegFlow`/`RegVariant` defined once (Task 3), consumed in Tasks 5, 7, 8. `depositAllowed` defined Task 2, consumed Tasks 2/5. `ADULT_SEASON_ID`/`UNSIGNED_REG_ID` exported from the e2e seed (Task 5/7).
- **Known risk:** Task 5's step-list refactor touches the largest file (`registration-wizard.tsx`, ~1500 lines). Keep the diff mechanical (name-based branching), no drive-by refactors.

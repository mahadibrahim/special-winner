# Team Registration Clarity — PR 1 (Discovery Surfaces + Captain Flow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every surface a new team captain touches tells one true story — "$200 today reserves your team · $X total, split with your roster" — the charge is announced before it happens, and the captain gets a receipt email with their invite link.

**Architecture:** A new pure helper `teamPriceStory()` in `src/lib/leagues/rail-content.ts` becomes the single source of the deposit-first framing; five discovery surfaces consume it or the `CAPTAIN_DEPOSIT_*` constants. `TeamCreate` gains a `season` prop (already fetched by its parent) to render a fee box before the charge and drops the consent checkbox in favor of notice + button agreement. A new `sendTeamDepositReceiptEmail` fires from the existing deposit webhook handler, gated on the same exactly-once ledger flag as the PostHog capture.

**Tech Stack:** Astro 5 + React 19, Tailwind 4, Vitest (unit project), Playwright, Resend email via `src/lib/email/send.ts`.

**Spec:** `docs/superpowers/specs/2026-07-23-team-registration-clarity-design.md` (PR 1 = spec §1 + §2). PR 2 (member share truth + edge cases) is planned separately after `feat/funnel-friction-fixes` merges.

## Global Constraints

- Canonical copy, verbatim: **"$200 today reserves your team"**, **"split with your roster"** / **"your roster pays the rest"**. Never invent variant phrasings.
- The dollar figure always comes from `CAPTAIN_DEPOSIT_DOLLARS` / `CAPTAIN_DEPOSIT_CENTS` (`src/lib/registrations/team-deposit.ts`). Never hardcode `200`/`20000` in new code (existing `priceCents: 20000` in the EmbeddedPayment call may stay).
- Card-on-file is **notice, not opt-in** (owner decision 2026-07-23): no checkbox anywhere; the API still receives `backstopConsent: true` and records `backstopConsentedAt`.
- No layout redesigns — copy and added lines only; keep each file's existing class idiom.
- Server code reads env via `process.env`/the `env` helper already used in `send.ts` — never `import.meta.env` for non-PUBLIC vars (Netlify inlines those at build).
- Work in a fresh worktree on branch `feat/team-reg-clarity-pr1` (create via superpowers:using-git-worktrees before Task 1). Run all commands from the worktree root.
- Done means: `npm run test:unit` green, `npx tsc --noEmit` zero errors, `npm run build` clean, updated E2E spec green locally.

---

### Task 1: `teamPriceStory()` helper + deposit-first `priceLabel("team")`

**Files:**
- Modify: `src/lib/leagues/rail-content.ts`
- Test: `tests/unit/rail-content.test.ts` (exists — extend and update)

**Interfaces:**
- Consumes: `CAPTAIN_DEPOSIT_DOLLARS` from `@/lib/registrations/team-deposit`; existing `usd()` in the same file.
- Produces: `export function teamPriceStory(season: { price: number; teamPrice: number | null; effectiveTeamPrice?: number | null; teamEarlyBirdActive?: boolean }): { deposit: string; total: string; baseTotal: string | null }` — `deposit` is `"$200"`, `total` the early-bird-aware team total (e.g. `"$1,000"`), `baseTotal` the list total only when a live discount undercuts it (for strikethrough), else `null`. Also changes `priceLabel("team", …)` to return `{ amount: "$200 down", unit: "today · $X total · your roster pays the rest" }` (with `(early-bird)` after the total when live). Tasks 2, 3, 6 import `teamPriceStory`; the rail (`league-context-rail.tsx`) needs no change — the new `priceLabel` output flows through its existing `{amount} {unit}` rendering, and the mobile strip (which renders `amount` alone) now shows "$200 down".

- [ ] **Step 1: Update/extend the unit tests to the new contract**

In `tests/unit/rail-content.test.ts`, replace the three `priceLabel("team", …)` expectations and add a `teamPriceStory` block. The full updated file body for the two changed tests plus the new describe (leave `tierColorClass`, solo/share, and `formatDayTime` tests untouched):

```ts
import { describe, it, expect } from "vitest";
import { tierColorClass, priceLabel, teamPriceStory, formatDayTime } from "@/lib/leagues/rail-content";
```

Replace the body of `it("priceLabel per mode", …)` with:

```ts
    const s = { price: 120, teamPrice: 1000, deposit: 200 } as any;
    expect(priceLabel("solo", s)).toEqual({ amount: "$120", unit: "solo" });
    // Team mode is deposit-first: the number a captain pays today leads.
    expect(priceLabel("team", s)).toEqual({
      amount: "$200 down",
      unit: "today · $1,000 total · your roster pays the rest",
    });
    expect(priceLabel("share", s)).toEqual({ amount: "$120", unit: "your share" });
```

Replace the team expectation inside `it("priceLabel prefers effectivePrice for solo/share, not team", …)`:

```ts
    // The per-player early-bird must not bleed into the team price.
    expect(priceLabel("team", s)).toEqual({
      amount: "$200 down",
      unit: "today · $1,000 total · your roster pays the rest",
    });
```

Replace the body of `it("priceLabel shows the team early-bird price, and only calls it early-bird when live", …)`:

```ts
    const live = {
      price: 120, teamPrice: 1050, deposit: 200,
      effectiveTeamPrice: 1000, teamEarlyBirdActive: true,
    } as any;
    expect(priceLabel("team", live)).toEqual({
      amount: "$200 down",
      unit: "today · $1,000 total (early-bird) · your roster pays the rest",
    });

    // Window closed: charge path bills list, so the rail must show list.
    const closed = {
      price: 120, teamPrice: 1050, deposit: 200,
      effectiveTeamPrice: 1050, teamEarlyBirdActive: false,
    } as any;
    expect(priceLabel("team", closed)).toEqual({
      amount: "$200 down",
      unit: "today · $1,050 total · your roster pays the rest",
    });

    // A team early-bird never discounts the solo price (Aspire policy).
    expect(priceLabel("solo", live)).toEqual({ amount: "$120", unit: "solo" });
```

Add a new describe at the end of the file:

```ts
describe("teamPriceStory", () => {
  it("deposit-first story with early-bird strikethrough base", () => {
    expect(
      teamPriceStory({ price: 120, teamPrice: 1050, effectiveTeamPrice: 1000, teamEarlyBirdActive: true }),
    ).toEqual({ deposit: "$200", total: "$1,000", baseTotal: "$1,050" });
  });
  it("no strikethrough when the window is closed or not discounting", () => {
    expect(
      teamPriceStory({ price: 120, teamPrice: 1050, effectiveTeamPrice: 1050, teamEarlyBirdActive: false }),
    ).toEqual({ deposit: "$200", total: "$1,050", baseTotal: null });
    expect(teamPriceStory({ price: 120, teamPrice: 1050 })).toEqual({
      deposit: "$200", total: "$1,050", baseTotal: null,
    });
  });
  it("falls back to solo price when teamPrice is null (team-only misconfig)", () => {
    expect(teamPriceStory({ price: 120, teamPrice: null })).toEqual({
      deposit: "$200", total: "$120", baseTotal: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- tests/unit/rail-content.test.ts`
Expected: FAIL — `teamPriceStory` is not exported; team-mode `priceLabel` expectations mismatch.

- [ ] **Step 3: Implement in `src/lib/leagues/rail-content.ts`**

Add the import at the top (below the existing header comment):

```ts
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";
```

Add above `priceLabel`:

```ts
/**
 * The one canonical team-price story: a flat $200 deposit reserves the team
 * today; the roster splits the (early-bird-aware) total. Every surface that
 * mentions team pricing renders from this so the framing can't drift.
 */
export function teamPriceStory(season: {
  price: number;
  teamPrice: number | null;
  effectiveTeamPrice?: number | null;
  teamEarlyBirdActive?: boolean;
}): { deposit: string; total: string; baseTotal: string | null } {
  const list = season.teamPrice ?? season.price;
  const eff = season.effectiveTeamPrice ?? list;
  const discountLive = season.teamEarlyBirdActive === true && eff < list;
  return {
    deposit: usd(CAPTAIN_DEPOSIT_DOLLARS),
    total: usd(eff),
    baseTotal: discountLive ? usd(list) : null,
  };
}
```

Replace the `if (mode === "team") { … }` block inside `priceLabel` with:

```ts
  if (mode === "team") {
    // Deposit-first: the amount a captain pays TODAY leads; the total is
    // context. teamPriceStory is early-bird-aware and only marks a discount
    // when the window is genuinely live.
    const story = teamPriceStory(season);
    return {
      amount: `${story.deposit} down`,
      unit: story.baseTotal
        ? `today · ${story.total} total (early-bird) · your roster pays the rest`
        : `today · ${story.total} total · your roster pays the rest`,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- tests/unit/rail-content.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/leagues/rail-content.ts tests/unit/rail-content.test.ts
git commit -m "feat(pricing): teamPriceStory helper + deposit-first team price label"
```

---

### Task 2: ChooseMode "Bring a team" card

**Files:**
- Modify: `src/components/registration/choose-mode.tsx`

**Interfaces:**
- Consumes: `teamPriceStory` from Task 1. The `season` prop already carries `price/teamPrice/effectiveTeamPrice/teamEarlyBirdActive`.
- Produces: nothing downstream; E2E in Task 8 asserts the new copy.

- [ ] **Step 1: Rewrite the team button copy**

In `src/components/registration/choose-mode.tsx`, change the import line and the two price derivations:

```ts
import { priceLabel, teamPriceStory } from "@/lib/leagues/rail-content";
```

Replace:

```ts
  const solo = priceLabel("solo", season);
  const team = priceLabel("team", season);
```

with:

```ts
  const solo = priceLabel("solo", season);
  const team = teamPriceStory(season);
```

Replace the team button's inner description `<div>` (currently `You captain a full roster. <b>{team.amount}</b>` plus the `teamEarlyBirdActive` span) with:

```tsx
          <div className="text-sm text-ink-muted">
            You captain a full roster. <b>{team.deposit} today</b> reserves your
            team · <b>{team.total}</b>
            {team.baseTotal && (
              <span className="line-through text-ink-faint"> {team.baseTotal}</span>
            )}{" "}
            total, split with your roster
          </div>
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/registration/choose-mode.tsx
git commit -m "feat(register): choose-mode team card leads with \$200-today story"
```

---

### Task 3: Soccer term pages — team offer on division rows + priced hero CTA

**Files:**
- Modify: `src/lib/leagues/division-filters.ts` (Division type)
- Modify: `src/pages/adult/leagues/soccer/[term].astro` (row builder + hero CTA)
- Modify: `src/components/leagues/divisions-finder.tsx` (DivisionRow)

**Interfaces:**
- Consumes: `CAPTAIN_DEPOSIT_DOLLARS` from `@/lib/registrations/team-deposit`.
- Produces: `Division.teamTotal?: number | null` — early-bird-aware team total in dollars, null when the season has no team signup. (`tests/unit/division-filters.test.ts` doesn't touch pricing fields; the additive optional field breaks nothing.)

- [ ] **Step 1: Add `teamTotal` to the Division type**

In `src/lib/leagues/division-filters.ts`, after the existing `price?: number | null;` field (with its doc comment), add:

```ts
  /** Early-bird-aware team total in dollars — null when the season has no
   *  team signup. Rendered as the "$200 down, $X total" row line. */
  teamTotal?: number | null;
```

- [ ] **Step 2: Populate it in the term-page row builder**

In `src/pages/adult/leagues/soccer/[term].astro`, inside the `divisions: Division[] = seasons.map(...)` object, after the `price:` line, add:

```ts
  // Team offer on the row — the same price-hunters bounce applies to captains.
  teamTotal: (s.signupModes ?? []).includes("team") ? (s.effectiveTeamPrice ?? s.teamPrice ?? null) : null,
```

- [ ] **Step 3: Render the team line in DivisionRow**

In `src/components/leagues/divisions-finder.tsx`, add the import:

```ts
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";
```

In `DivisionRow`, directly below the closing `</div>` of the `font-mono … uppercase` meta line (the one containing the `$X/player` span) and still inside its parent `<div>`, add:

```tsx
          {d.teamTotal != null && d.status !== "completed" && (
            <div className="font-mono text-[10.5px] tracking-wide text-ink-muted mt-0.5">
              or reserve a team — ${CAPTAIN_DEPOSIT_DOLLARS} down, ${d.teamTotal.toLocaleString()} total
            </div>
          )}
```

- [ ] **Step 4: Price the hero CTA**

In `src/pages/adult/leagues/soccer/[term].astro`, add to the frontmatter imports:

```ts
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";
```

Change the hero register anchor text from `Register a team →` to:

```astro
            <a href="#divisions" class="font-sans font-semibold text-[13px] bg-primary text-cream px-5 py-3 rounded-md" data-testid="hero-register" data-term-cta>{`Register a team · $${CAPTAIN_DEPOSIT_DOLLARS} down →`}</a>
```

- [ ] **Step 5: Verify compile + build**

Run: `npx tsc --noEmit && npm run build`
Expected: zero type errors; build completes (the prerender-warning noise from middleware is expected and fine).

- [ ] **Step 6: Commit**

```bash
git add src/lib/leagues/division-filters.ts "src/pages/adult/leagues/soccer/[term].astro" src/components/leagues/divisions-finder.tsx
git commit -m "feat(leagues): term pages show the \$200-down team offer on rows and hero CTA"
```

---

### Task 4: Catalog card — un-gate the team note, deposit-first team column everywhere

**Files:**
- Modify: `src/components/programs/program-card-v2.tsx`

**Interfaces:**
- Consumes: existing `CAPTAIN_DEPOSIT_DOLLARS` import (already present), existing `teamPath`, `effTeamTotal`, `depositValid` locals.
- Produces: nothing downstream.

- [ ] **Step 1: Split the deposit note so the team story no longer depends on `season.deposit`**

Replace the `depositNote` derivation (the `const depositNote = !soldOut && signupMode === "register" && depositValid ? … : null` block, keeping the `depositValid` const above it) with:

```ts
  // Team story is keyed on the team offer itself (teamPath + a real teamPrice),
  // NOT on season.deposit — that field only governs the individual
  // deposit-checkout and used to make this note appear/disappear on unrelated
  // admin data. Youth/individual hold-a-spot notes still key on depositValid.
  const depositNote =
    !soldOut && signupMode === "register"
      ? teamPath && season.teamPrice != null
        ? `$${CAPTAIN_DEPOSIT_DOLLARS.toLocaleString()} reserves your team — split the rest with your roster`
        : depositValid
          ? audience === "youth"
            ? `$${season.deposit!.toLocaleString()} holds a spot today`
            : `$${season.deposit!.toLocaleString()} holds your spot today`
          : null
      : null
```

- [ ] **Step 2: Make the default dual-mode team column deposit-first**

In the dual-price block, the non-`teamFirst` team column currently renders the full team price. Replace the whole `const teamCol = teamFirst ? (…) : (…)` ternary with a single definition (position still varies via the existing `teamFirst ? [teamCol, soloCol] : [soloCol, teamCol]`):

```tsx
                    const teamCol = (
                      <div key="team" className={teamFirst ? undefined : "border-l border-border pl-3"}>
                        <PriceFigure price={CAPTAIN_DEPOSIT_DOLLARS} basePrice={null} />
                        <div className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                          down · ${effTeamTotal!.toLocaleString()} total
                        </div>
                      </div>
                    )
```

(`effTeamTotal` is guaranteed non-null inside this branch — the branch requires `season.teamPrice != null`.)

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/programs/program-card-v2.tsx
git commit -m "feat(catalog): card team pricing is deposit-first; team note no longer gated on individual deposit"
```

---

### Task 5: SoccerOne surfaces

**Files:**
- Modify: `src/components/soccerone/SoccerOneLeaguesFinder.tsx`
- Modify: `src/pages/soccerone/leagues.astro`

**Interfaces:**
- Consumes: `CAPTAIN_DEPOSIT_DOLLARS` from `@/lib/registrations/team-deposit` (new import in both files).
- Produces: nothing downstream.

- [ ] **Step 1: LeagueCard price line**

In `src/components/soccerone/SoccerOneLeaguesFinder.tsx` add the import:

```ts
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit"
```

Replace the `priceLabel` const in `LeagueCard`:

```ts
  const priceLabel = teamFee
    ? `$${season.price}/player · team: $${CAPTAIN_DEPOSIT_DOLLARS} reserves it, $${teamFee} total${earlyBird ? " early-bird" : ""}`
    : `$${season.price}/player`
```

- [ ] **Step 2: Featured price line on leagues.astro**

In `src/pages/soccerone/leagues.astro` add the frontmatter import:

```ts
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";
```

Replace the featured label (currently `` `$${featured.price}/player · $${featuredTeamFee}/team${…early-bird…}` ``) with:

```ts
      ? `$${featured.price}/player · team: $${CAPTAIN_DEPOSIT_DOLLARS} reserves it, $${featuredTeamFee} total${featured.teamEarlyBirdActive ? ' early-bird' : ''}`
      : `$${featured.price}/player`)
```

- [ ] **Step 3: Verify compile + build, then check both brands render**

Run: `npx tsc --noEmit && npm run build`
Expected: clean. SoccerOne pages invert Aspire tokens — these are plain-text label changes inside existing elements, so no re-pinning is needed, but confirm visually in Task 8's browser pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/soccerone/SoccerOneLeaguesFinder.tsx src/pages/soccerone/leagues.astro
git commit -m "feat(soccerone): league price lines carry the \$200-reserves-a-team story"
```

---

### Task 6: TeamCreate — fee box, notice-not-checkbox, honest button, deposit-screen math

**Files:**
- Modify: `src/components/registration/team-create.tsx`
- Modify: `src/components/registration/register-experience.tsx:130-138`

**Interfaces:**
- Consumes: `teamPriceStory` (Task 1), `CAPTAIN_DEPOSIT_CENTS`/`CAPTAIN_DEPOSIT_DOLLARS`, `formatDateOnly` from `@/lib/time/format-date`. Parent passes a new prop.
- Produces: `TeamCreate` prop `season?: { price: number; teamPrice: number | null; effectiveTeamPrice?: number | null; teamEarlyBirdActive?: boolean; registrationCloses?: string | null }` — `register-experience.tsx` passes its already-fetched `season` object (structural superset). The POST body continues to send `backstopConsent: true` (the API schema requires `z.literal(true)`); `backstopConsentedAt` semantics are unchanged server-side.

- [ ] **Step 1: Thread the season prop**

In `src/components/registration/register-experience.tsx`, inside the `<TeamCreate … />` JSX (after `seasonId={seasonId}`), add:

```tsx
          season={season}
```

In `src/components/registration/team-create.tsx`, extend the component props — after `onCaptainRegister,` in the destructure add `season,`, and in the type after `onCaptainRegister: (inviteToken: string) => void;` add:

```ts
  /** Season pricing/deadline snapshot from the register page's detail fetch —
      renders the fee box + deadline BEFORE the deposit charge. Optional so the
      component stays render-safe if the parent ever mounts it without one. */
  season?: {
    price: number;
    teamPrice: number | null;
    effectiveTeamPrice?: number | null;
    teamEarlyBirdActive?: boolean;
    registrationCloses?: string | null;
  };
```

Add imports at the top of `team-create.tsx`:

```ts
import { teamPriceStory } from "@/lib/leagues/rail-content";
import { CAPTAIN_DEPOSIT_CENTS, CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";
import { formatDateOnly } from "@/lib/time/format-date";
```

(If any of these are already imported for other uses, merge into the existing import lines.)

- [ ] **Step 2: Remove the checkbox state and its gate**

Delete the `backstopConsent` state line and its comment:

```ts
  // Required backstop consent — the captain affirms the saved card may be
  // charged (off-session) for unpaid teammate shares after the deadline.
  const [backstopConsent, setBackstopConsent] = useState(false);
```

In `handleSubmit`'s fetch body, the literal `backstopConsent: true` is already sent — leave it. Change the submit button's `disabled` from `status === "submitting" || !backstopConsent` to:

```ts
          disabled={status === "submitting"}
```

- [ ] **Step 3: Fee box + notice replace the checkbox in the idle form**

Compute near the top of the component body, directly after the state declarations (NOT just before the idle-form `return` — the `status === "deposit"` branch returns earlier in the component and Step 5 uses these same consts there):

```ts
  // Fee box math — display-only; the server recomputes the fee at create time.
  const story = season ? teamPriceStory(season) : null;
  const feeTotalDollars = season ? (season.effectiveTeamPrice ?? season.teamPrice ?? season.price) : null;
  const rosterRemainderDollars =
    feeTotalDollars != null ? Math.max(0, feeTotalDollars - CAPTAIN_DEPOSIT_CENTS / 100) : null;
  const deadlineLabel = season?.registrationCloses
    ? formatDateOnly(season.registrationCloses, { month: "short", day: "numeric" })
    : null;
```

Replace the entire `<label className="flex items-start gap-3 cursor-pointer">…</label>` checkbox block with:

```tsx
        {story && (
          <div className="rounded-xl border border-primary-orange/25 bg-cream-2 px-4 py-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-ink">Today — reserves your team</span>
              <span className="font-semibold text-ink">{story.deposit}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink">Season team fee</span>
              <span className="font-semibold text-ink">
                {story.total}
                {story.baseTotal && (
                  <span className="ml-1.5 line-through text-ink-faint font-normal text-xs">{story.baseTotal}</span>
                )}
              </span>
            </div>
            {rosterRemainderDollars != null && (
              <div className="flex justify-between py-0.5 text-ink-muted text-xs">
                <span>Your roster pays the rest when they register</span>
                <span>${rosterRemainderDollars.toLocaleString()}</span>
              </div>
            )}
            <p className="border-t border-primary-orange/20 mt-2 pt-2 text-xs text-ink-muted leading-relaxed">
              <span className="font-semibold text-ink">Your card stays on file for the team.</span>{" "}
              Teammate shares still unpaid after{deadlineLabel ? <> <b>{deadlineLabel}</b></> : " the payment deadline"} are
              charged to it. Your {story.deposit} counts toward the team fee.
            </p>
          </div>
        )}
```

- [ ] **Step 4: Honest button + binding line**

Replace the submit button's non-submitting label `"Create team & get link →"` with:

```tsx
            `Reserve your team · $${CAPTAIN_DEPOSIT_DOLLARS} →`
```

Directly below the `</button>`, add:

```tsx
        <p className="text-xs text-ink-muted leading-relaxed">
          By reserving, you agree to the payment terms above.
        </p>
```

- [ ] **Step 5: Deposit-screen math**

In the `status === "deposit"` branch, replace the subcopy `<p className="text-ink-2 leading-relaxed text-sm">$200 deposit · credits the team fee.</p>` with:

```tsx
          <div className="text-ink-2 leading-relaxed text-sm space-y-0.5">
            <p>
              Due today: <b>${CAPTAIN_DEPOSIT_DOLLARS}</b> — reserves your team.
            </p>
            {feeTotalDollars != null && rosterRemainderDollars != null && (
              <p className="text-ink-muted text-xs">
                Team fee ${feeTotalDollars.toLocaleString()} − your deposit = $
                {rosterRemainderDollars.toLocaleString()} left for your roster.
              </p>
            )}
          </div>
```

(The existing "Your card stays on file for the team — unpaid teammate shares are charged to it after the deadline." footer below `EmbeddedPayment` stays.)

- [ ] **Step 6: Verify compile + no stray references**

Run: `npx tsc --noEmit && grep -n "backstopConsent" src/components/registration/team-create.tsx`
Expected: zero type errors; the only remaining `backstopConsent` hit is the literal `backstopConsent: true` in the POST body.

- [ ] **Step 7: Commit**

```bash
git add src/components/registration/team-create.tsx src/components/registration/register-experience.tsx
git commit -m "feat(team-create): fee box + deadline before the charge; card-on-file as notice, not opt-in"
```

---

### Task 7: Deposit confirmation email

**Files:**
- Modify: `src/lib/email/send.ts` (new exported builder + send function, placed next to `sendTeamInviteEmail`)
- Modify: `src/lib/stripe/handle-team-deposit-succeeded.ts`
- Test: `tests/unit/email/team-deposit-receipt.test.ts` (new)

**Interfaces:**
- Consumes: existing `send.ts` internals — `sendEmail`, `logEmail`, `isEmailConfigured`, `fromForBrand`, `getBrandTheme`, `originForBrand`, `escapeHtml`, `env.PUBLIC_APP_URL`, `BrandId`. Schema: `teamRegistrations` fields `captainEmail, captainName, teamName, inviteToken, teamFeeCents, depositCents, paymentDeadline, brand`; `seasons.name`.
- Produces:
  - `export function buildTeamDepositReceipt(params: TeamDepositReceiptParams): { subject: string; html: string; text: string; joinUrl: string }` — pure, unit-testable.
  - `export async function sendTeamDepositReceiptEmail(params: TeamDepositReceiptParams)` — wraps the builder in the standard configured/send/log flow with `emailType: "team_deposit_receipt"`.
  - `export interface TeamDepositReceiptParams { to: string; captainName: string; teamName: string; seasonName: string; seasonId: string; inviteToken: string; teamFeeCents: number | null; depositCents: number; paymentDeadline: Date | null; brand?: BrandId }`.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/email/team-deposit-receipt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTeamDepositReceipt } from "@/lib/email/send";

const base = {
  to: "captain@example.com",
  captainName: "Alex Rivera",
  teamName: "Thunder FC",
  seasonName: "Fall 2026 — Co-Ed C",
  seasonId: "season-uuid",
  inviteToken: "tok_abc",
  teamFeeCents: 100000,
  depositCents: 20000,
  paymentDeadline: new Date("2026-09-03T00:00:00Z"),
};

describe("buildTeamDepositReceipt", () => {
  it("names the deposit, total, remainder, deadline, and join link", () => {
    const { subject, html, text, joinUrl } = buildTeamDepositReceipt(base);
    expect(subject).toBe("Thunder FC is reserved — here's your team link");
    expect(joinUrl).toContain("/register/season-uuid?team=tok_abc");
    for (const body of [html, text]) {
      expect(body).toContain("$200");
      expect(body).toContain("$1,000");
      expect(body).toContain("$800"); // remainder the roster covers
      expect(body).toContain("Sep 3"); // backstop deadline
      expect(body).toContain(joinUrl);
    }
  });
  it("degrades when fee/deadline are unknown", () => {
    const { html, text } = buildTeamDepositReceipt({
      ...base,
      teamFeeCents: null,
      paymentDeadline: null,
    });
    for (const body of [html, text]) {
      expect(body).toContain("$200");
      expect(body).not.toContain("null");
      expect(body).not.toContain("NaN");
      expect(body).toContain("the payment deadline"); // generic fallback wording
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- tests/unit/email/team-deposit-receipt.test.ts`
Expected: FAIL — `buildTeamDepositReceipt` is not exported.

- [ ] **Step 3: Implement builder + sender in `send.ts`**

Insert directly after the `sendTeamInviteEmail` function (before the "Team share reminder" section):

```ts
// ---- Team deposit receipt (captain, right after the $200 deposit succeeds) ----

export interface TeamDepositReceiptParams {
  to: string;
  captainName: string;
  teamName: string;
  seasonName: string;
  seasonId: string;
  inviteToken: string;
  /** Snapshot from team_registrations — null on legacy rows. */
  teamFeeCents: number | null;
  depositCents: number;
  paymentDeadline: Date | null;
  brand?: BrandId;
}

/**
 * Pure body builder — exported for unit tests. The receipt is the captain's
 * only durable copy of the join link and next steps: before this email
 * existed, closing the post-deposit tab lost both.
 */
export function buildTeamDepositReceipt(params: TeamDepositReceiptParams): {
  subject: string;
  html: string;
  text: string;
  joinUrl: string;
} {
  const appUrl = originForBrand(params.brand) ?? env.PUBLIC_APP_URL;
  const joinUrl = `${appUrl}/register/${params.seasonId}?team=${encodeURIComponent(params.inviteToken)}`;
  const deposit = `$${(params.depositCents / 100).toLocaleString("en-US")}`;
  const total =
    params.teamFeeCents != null ? `$${(params.teamFeeCents / 100).toLocaleString("en-US")}` : null;
  const remainder =
    params.teamFeeCents != null
      ? `$${(Math.max(0, params.teamFeeCents - params.depositCents) / 100).toLocaleString("en-US")}`
      : null;
  const deadline = params.paymentDeadline
    ? params.paymentDeadline.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;

  const subject = `${params.teamName} is reserved — here's your team link`;
  const feeLine = total
    ? `Your ${deposit} deposit is in and counts toward the ${total} team fee — your roster covers the remaining ${remainder} as they register.`
    : `Your ${deposit} deposit is in and counts toward the team fee — your roster covers the rest as they register.`;
  const deadlineLine = `Teammate shares still unpaid after ${deadline ?? "the payment deadline"} are charged to your card on file.`;

  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;line-height:1.5;">
    <p>${escapeHtml(params.captainName)}, <strong>${escapeHtml(params.teamName)}</strong> is reserved for ${escapeHtml(params.seasonName)}.</p>
    <p>${escapeHtml(feeLine)}</p>
    <p><strong>Your team link</strong> — share it so teammates can register and pay their share:</p>
    <p><a href="${joinUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open your team page →</a></p>
    <p style="color:#666;font-size:13px;">Or paste this link into your browser:<br>${escapeHtml(joinUrl)}</p>
    <p style="color:#666;font-size:13px;">${escapeHtml(deadlineLine)}</p>
  </body></html>`;

  const text = `${params.captainName}, ${params.teamName} is reserved for ${params.seasonName}.\n\n${feeLine}\n\nYour team link — share it so teammates can register and pay their share:\n${joinUrl}\n\n${deadlineLine}\n`;

  return { subject, html, text, joinUrl };
}

export async function sendTeamDepositReceiptEmail(params: TeamDepositReceiptParams) {
  if (!isEmailConfigured()) {
    console.warn("Email not configured, skipping team deposit receipt");
    return { success: false, error: "Email not configured" };
  }
  const { subject, html, text } = buildTeamDepositReceipt(params);
  const result = await sendEmail({
    to: params.to,
    subject,
    html,
    text,
    from: fromForBrand(params.brand),
  });
  await logEmail({
    emailType: "team_deposit_receipt",
    recipientEmail: params.to,
    subject,
    resendMessageId: result.messageId,
    status: result.success ? "sent" : "failed",
  });
  return result;
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npm run test:unit -- tests/unit/email/team-deposit-receipt.test.ts`
Expected: PASS.

- [ ] **Step 5: Fire it from the webhook handler**

In `src/lib/stripe/handle-team-deposit-succeeded.ts`:

Add imports:

```ts
import { seasons } from "@/lib/db/schema";
import { sendTeamDepositReceiptEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";
```

Extend the initial team select with the receipt fields:

```ts
      captainEmail: teamRegistrations.captainEmail,
      captainName: teamRegistrations.captainName,
      teamName: teamRegistrations.teamName,
      inviteToken: teamRegistrations.inviteToken,
      teamFeeCents: teamRegistrations.teamFeeCents,
      depositCents: teamRegistrations.depositCents,
      paymentDeadline: teamRegistrations.paymentDeadline,
      brand: teamRegistrations.brand,
```

After the PostHog capture block (same `if (team.captainUserId && result.ledgerRowInserted)` condition — add the send INSIDE that block, after `getPostHogServer().capture({...});`), append:

```ts
    // Deposit receipt — the captain's durable copy of the join link + next
    // steps. Same exactly-once gate as the capture above (ledgerRowInserted).
    // Awaited so the serverless function doesn't freeze mid-send; a failure
    // logs and never fails the webhook.
    try {
      await sendTeamDepositReceiptEmail({
        to: team.captainEmail,
        captainName: team.captainName,
        teamName: team.teamName,
        seasonName: seasonRow?.name ?? "your season",
        seasonId: team.seasonId,
        inviteToken: team.inviteToken,
        teamFeeCents: team.teamFeeCents,
        depositCents: team.depositCents ?? 20000,
        paymentDeadline: team.paymentDeadline,
        brand: (team.brand as BrandId | undefined) ?? undefined,
      });
    } catch (err) {
      console.error("[team-deposit] receipt email failed:", err);
    }
```

And fetch the season name just before that block (outside the transaction, only when sending):

```ts
  let seasonRow: { name: string } | undefined;
  if (team.captainUserId && result.ledgerRowInserted) {
    [seasonRow] = await db
      .select({ name: seasons.name })
      .from(seasons)
      .where(eq(seasons.id, team.seasonId));
  }
```

- [ ] **Step 6: Verify compile + full unit suite**

Run: `npx tsc --noEmit && npm run test:unit`
Expected: zero type errors, unit suite green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/email/send.ts src/lib/stripe/handle-team-deposit-succeeded.ts tests/unit/email/team-deposit-receipt.test.ts
git commit -m "feat(email): captain deposit receipt with join link, fee math, and backstop deadline"
```

---

### Task 8: E2E update + full verification

**Files:**
- Modify: `tests/e2e/register-team-flow.spec.ts`

**Interfaces:**
- Consumes: copy shipped in Tasks 2 and 6. The seed season `e2e-adult-team-soccer-2026` must carry a `teamPrice` for the fee box to render its total rows — the fee box itself renders whenever the season detail loads, and the "Today — reserves your team" row plus notice line render regardless.

- [ ] **Step 1: Rewrite the checkbox assertions**

In `tests/e2e/register-team-flow.spec.ts`, replace everything from the `// Assert on the team-name field label…` comment's submit-button lookup to the end of the test with:

```ts
  await expect(page.getByText(/team name/i).first()).toBeVisible({ timeout: 10_000 });

  // Fee box: the charge is announced BEFORE the deposit screen…
  await expect(page.getByText(/Today — reserves your team/i)).toBeVisible();
  await expect(page.getByText(/Your card stays on file for the team/i)).toBeVisible();

  // …the button names the charge and is NOT gated on a checkbox (card-on-file
  // is notice, not opt-in — owner decision 2026-07-23)…
  const submitButton = page.getByRole("button", { name: /reserve your team · \$200/i });
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await expect(page.getByText(/By reserving, you agree to the payment terms above/i)).toBeVisible();

  // …and the old consent checkbox is gone.
  await expect(
    page.getByRole("checkbox", { name: /save my card to cover unpaid teammate shares/i }),
  ).toHaveCount(0);
```

Also update the choose-mode section of the same test — after the existing `Bring a team` visibility assertion, add (before the click):

```ts
  // Deposit-first story on the chooser card.
  await expect(page.getByText(/\$200 today/i).first()).toBeVisible();
  await expect(page.getByText(/split with your roster/i).first()).toBeVisible();
```

- [ ] **Step 2: Run the spec locally**

With a dev server up (`npm run dev:bws` in another shell, `E2E_TEST_ENDPOINTS=yes`; re-seed if needed with `npm run db:seed:e2e`):

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- register-team-flow`
Expected: PASS. (This spec only runs post-merge in CI — the local run is the gate.)

- [ ] **Step 3: Full verification battery**

Run: `npm run test:unit && npx tsc --noEmit && npm run build`
Expected: all green / zero errors / clean build.

- [ ] **Step 4: Browser spot-check, both brands**

With the dev server up, visually confirm (greps can't see rendering — check contrast and layout, both brands):
- `/register/<team-season-id>` — chooser card, fee box, deposit screen copy
- `/adult/leagues/soccer/fall` — row team line + hero CTA
- `/programs` — card team column + note
- SoccerOne host (`localhost` with the SoccerOne org host mapping or staging) — finder price lines legible on the inverted theme

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/register-team-flow.spec.ts
git commit -m "test(e2e): team flow asserts deposit-first story and notice-not-checkbox form"
```

---

## Out of scope for PR 1 (→ PR 2 plan, after feat/funnel-friction-fixes merges)

Member share display (`amountDueCents` on the payment step, rail share mode, invitee-ref param), token-endpoint privacy scope-down, resume-with-token roster join, already-registered friendly state, captain backstop-warning email template fix.

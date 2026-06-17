# League Registration Redesign — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-doors register path with one canonical `/register/{seasonId}` page that opens on an in-context "Join solo / Bring a team" choice, wrap every step in a persistent bold **league-context rail** (sticky on desktop, pinned strip on mobile), re-skin the solo wizard inside it, and finally wire the **team-membership linkage** (`?team=` token → `team_registration_members`) that is currently missing. Ships entirely on today's per-player payment model.

**Architecture:** A new orchestrator island (`register-experience.tsx`) mounted by `/register/[seasonId].astro` owns the league fetch + the choose-mode screen and renders the active sub-flow (solo wizard / team-create / teammate-join) inside the shared `league-context-rail.tsx`. The existing `registration-wizard.tsx` stays as the solo step engine but stops drawing its own summary card. Team linkage is wired through the registrations API into `team_registration_members`.

**Tech Stack:** Astro 5 SSR, React 19 islands, Tailwind 4 (editorial cream tokens), Drizzle + Postgres, Vitest (unit/API), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-17-league-registration-flow-redesign-design.md`

**⚠️ Environment:** external volume — editor cache can diverge from disk. Use ABSOLUTE paths, verify edits with `git diff`/`grep`, prove with `npx tsc --noEmit`. Do not `cd`. `@/` → `src/`. Known local build error: `src/pages/guides/baseball.astro` (no DB at build) — ignore ONLY that.

---

## File Structure

**Create:**
- `src/components/registration/league-context-rail.tsx` — presentational shell (rail desktop / pinned strip mobile). Owns league context display; no data fetching.
- `src/components/registration/register-experience.tsx` — orchestrator island: league fetch, choose-mode, renders rail + active sub-flow. Calls `useHydrationBeacon()`.
- `src/components/registration/choose-mode.tsx` — the "How do you want to join?" step.
- `src/components/registration/team-create.tsx` — captain setup sub-flow (folds `create-team-form.tsx` logic, rendered inside the rail).
- `src/lib/leagues/rail-content.ts` — pure helpers: tier→color, price-label per mode, fact formatting. Unit-tested.
- `tests/unit/rail-content.test.ts`, `tests/e2e/register-flow.spec.ts`

**Modify:**
- `src/components/leagues/divisions-finder.tsx` — `registerHref` → single URL.
- `src/pages/register/[seasonId].astro` — mount `register-experience`, read `?team=`.
- `src/pages/register/team/[seasonId].astro` — replace with 301 redirect.
- `src/components/registration/registration-wizard.tsx` — remove summary card; accept `teamToken`/`mode` props; thread token to checkout.
- `src/pages/api/public/seasons.ts` — add `registrationCloses`, `earlyBirdDeadline` to the detail response.
- `src/pages/api/registrations/index.ts` + `src/pages/api/registrations/guest-checkout.ts` + `src/lib/registrations/create-registration.ts` — accept `teamToken`, insert `team_registration_members` on success.

---

## Task 1: Single-door routing in the divisions finder

**Files:** Modify `src/components/leagues/divisions-finder.tsx`; Test `tests/unit/register-href.test.ts` (create)

Currently `registerHref(d)` returns `/register/team/${seasonId}` for team divisions, `/register/${seasonId}` for individual, season-interest for forming. Collapse the two register URLs to one; keep forming → interest. The `mode` for analytics (`registerMode`) stays as-is.

- [ ] **Step 1: Write the failing test**
```ts
// tests/unit/register-href.test.ts
import { describe, it, expect } from "vitest";
import { registerHref } from "@/components/leagues/divisions-finder";

const base = { seasonId: "s1", level: "d", gender: "mens", venueSlug: "worthington", signupModes: ["team", "individual"] };

describe("registerHref", () => {
  it("open team-capable division → canonical /register/{id}", () => {
    expect(registerHref({ ...base, status: "open" } as any)).toBe("/register/s1");
  });
  it("open individual-only division → canonical /register/{id}", () => {
    expect(registerHref({ ...base, signupModes: ["individual"], status: "open" } as any)).toBe("/register/s1");
  });
  it("forming division → season-interest API", () => {
    expect(registerHref({ ...base, status: "forming" } as any)).toBe("/api/public/season-interest?seasonId=s1");
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npx vitest run tests/unit/register-href.test.ts` (registerHref not exported / wrong URL).

- [ ] **Step 3: Implement.** In `src/components/leagues/divisions-finder.tsx`, **export** `registerHref` (add `export` keyword) and change its body to:
```tsx
export function registerHref(d: Division): string {
  if (d.status === "forming") return `/api/public/season-interest?seasonId=${d.seasonId}`;
  return `/register/${d.seasonId}`;
}
```
Leave `registerMode(d)` unchanged (still returns "team"|"individual"|"interest" for the `division_register_clicked` analytics event — funnel granularity is preserved even though the URL is now single).

- [ ] **Step 4: Run → PASS.** `npx vitest run tests/unit/register-href.test.ts`; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add src/components/leagues/divisions-finder.tsx tests/unit/register-href.test.ts
git commit -m "feat(register): collapse division CTAs to one canonical /register URL"
```

---

## Task 2: Retire the team entry page (301 redirect)

**Files:** Modify `src/pages/register/team/[seasonId].astro`

- [ ] **Step 1: Replace the entire file** with a permanent redirect to the canonical URL (preserves any inbound links/bookmarks). The captain path now lives inside `/register/{id}`.
```astro
---
// The standalone team registration page is retired — team creation now lives
// inside the unified /register/{seasonId} experience (choose "Bring a team").
// 301 so old links/bookmarks resolve to the canonical entry.
const { seasonId } = Astro.params;
return Astro.redirect(`/register/${seasonId ?? ""}`, 301);
---
```

- [ ] **Step 2: Build check.** `npm run build` (ignore only the baseball.astro error). Confirm no other route references `create-team-form` for this page; the component is reused in Task 7.

- [ ] **Step 3: Commit**
```bash
git add "src/pages/register/team/[seasonId].astro"
git commit -m "feat(register): 301 /register/team to canonical /register entry"
```

---

## Task 3: Add rail fields to the season detail endpoint

**Files:** Modify `src/pages/api/public/seasons.ts`; Test `tests/api/seasons-detail.test.ts` (create or extend)

The rail needs `registrationCloses` + `earlyBirdDeadline` (both exist on the `seasons` schema but aren't in the detail response today).

- [ ] **Step 1: Write the failing API test**
```ts
// tests/api/seasons-detail.test.ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("GET /api/public/seasons/:id detail", () => {
  it("includes registrationCloses + earlyBirdDeadline keys", async () => {
    // Use the e2e adult soccer season id from the seed if available; otherwise
    // fetch the list and take the first open adult soccer season.
    const list = await (await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)).json();
    const id = list.seasons?.[0]?.id;
    expect(id).toBeTruthy();
    const res = await fetch(`${BASE}/api/public/seasons/${id}`);
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s).toHaveProperty("registrationCloses");
    expect(s).toHaveProperty("earlyBirdDeadline");
  });
});
```

- [ ] **Step 2: Run → FAIL** (keys absent). Start dev server first (`npm run dev`), then `TEST_BASE_URL=http://localhost:4321 npx vitest run tests/api/seasons-detail.test.ts`.

- [ ] **Step 3: Implement.** In `src/pages/api/public/seasons.ts`, in the detail (`/:id`) response object (where it builds the season JSON, around the fields the prior exploration listed — `termSlug`…`status`), add two fields next to `status`:
```ts
    registrationCloses: row.season.registrationCloses ? row.season.registrationCloses.toISOString() : null,
    earlyBirdDeadline: row.season.earlyBirdDeadline ? row.season.earlyBirdDeadline.toISOString() : null,
```
(Match the existing variable name for the season row — the file already selects the full season; if a narrowed `select` omits these columns, add `registrationCloses: seasons.registrationCloses, earlyBirdDeadline: seasons.earlyBirdDeadline` to that select.)

- [ ] **Step 4: Run → PASS.** Re-run the API test; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add src/pages/api/public/seasons.ts tests/api/seasons-detail.test.ts
git commit -m "feat(api): expose registrationCloses + earlyBirdDeadline on season detail"
```

---

## Task 4: `rail-content.ts` pure helpers + tests

**Files:** Create `src/lib/leagues/rail-content.ts`, `tests/unit/rail-content.test.ts`

Pure functions the rail uses, so the rail component stays presentational and the logic is unit-tested.

- [ ] **Step 1: Write the failing test**
```ts
// tests/unit/rail-content.test.ts
import { describe, it, expect } from "vitest";
import { tierColorClass, priceLabel, formatDayTime } from "@/lib/leagues/rail-content";

describe("rail-content", () => {
  it("maps tier → text color (a=ink b=primary c=ochre d=sage)", () => {
    expect(tierColorClass("a")).toBe("text-ink");
    expect(tierColorClass("d")).toBe("text-sage");
    expect(tierColorClass(null)).toBe("text-ink"); // default
  });
  it("priceLabel per mode", () => {
    const s = { price: 120, teamPrice: 1000, deposit: 200 } as any;
    expect(priceLabel("solo", s)).toEqual({ amount: "$120", unit: "solo" });
    expect(priceLabel("team", s)).toEqual({ amount: "$1,000", unit: "team · early-bird" });
    expect(priceLabel("share", s)).toEqual({ amount: "$120", unit: "your share" });
  });
  it("formatDayTime renders day + time window", () => {
    expect(formatDayTime("Tue", "19:00:00", "22:00:00")).toBe("Tue nights · 7–10pm");
    expect(formatDayTime("Tue", null, null)).toBe("Tue nights");
    expect(formatDayTime(null, null, null)).toBe("");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `src/lib/leagues/rail-content.ts`
```ts
// Pure helpers for the league-context rail. No React, no DOM — unit-testable.
type Tier = "a" | "b" | "c" | "d";
export type RailMode = "solo" | "team" | "share";

const TIER_TEXT: Record<Tier, string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
};

export function tierColorClass(skillLevel: string | null | undefined): string {
  const k = (skillLevel ?? "").toLowerCase() as Tier;
  return TIER_TEXT[k] ?? "text-ink";
}

function usd(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

export function priceLabel(
  mode: RailMode,
  season: { price: number; teamPrice: number | null; deposit: number | null },
): { amount: string; unit: string } {
  if (mode === "team") return { amount: usd(season.teamPrice ?? season.price), unit: "team · early-bird" };
  if (mode === "share") return { amount: usd(season.price), unit: "your share" };
  return { amount: usd(season.price), unit: "solo" };
}

const DAY_FULL: Record<string, string> = {
  Sun: "Sun", Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat",
};

function to12h(t: string): string {
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ampm}`;
}

export function formatDayTime(day: string | null, start: string | null, end: string | null): string {
  if (!day) return "";
  const d = `${DAY_FULL[day] ?? day} nights`;
  if (!start || !end) return d;
  // "7–10pm" — collapse matching periods to one suffix.
  const s = to12h(start), e = to12h(end);
  const sNum = s.replace(/[ap]m/, ""), sPer = s.slice(-2), ePer = e.slice(-2);
  return sPer === ePer ? `${d} · ${sNum}–${e}` : `${d} · ${s}–${e}`;
}
```

- [ ] **Step 4: Run → PASS.** `npx vitest run tests/unit/rail-content.test.ts`; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/leagues/rail-content.ts tests/unit/rail-content.test.ts
git commit -m "feat(register): rail-content pure helpers (tier color, price label, day/time)"
```

---

## Task 5: `league-context-rail.tsx` shell component

**Files:** Create `src/components/registration/league-context-rail.tsx`

Presentational. Renders a sticky rail on `lg+` and a pinned condensed strip below `lg`. Visual polish follows the approved mockups in `.superpowers/brainstorm/*/content/context-frame.html` + `solo-flow-v2.html`.

- [ ] **Step 1: Implement the component**
```tsx
"use client";
import { tierColorClass, priceLabel, formatDayTime, type RailMode } from "@/lib/leagues/rail-content";

export interface RailSeason {
  name: string;
  skillLevel: string | null;
  divisionGender: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  location: { name: string };
  price: number;
  teamPrice: number | null;
  deposit: number | null;
  sport: { color: string | null };
  earlyBirdDeadline: string | null;
}

interface Props {
  season: RailSeason;
  mode: RailMode;          // solo | team | share
  step: number;            // 1-based
  stepCount: number;
  variant?: "active" | "success";
  // children render in the right column (desktop) / below the strip (mobile)
  children: React.ReactNode;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

export default function LeagueContextRail({ season, mode, step, stepCount, variant = "active", children }: Props) {
  const tier = (season.skillLevel ?? "").toUpperCase();
  const { amount, unit } = priceLabel(mode, season);
  const dayTime = formatDayTime(season.dayOfWeek, season.startTime, season.endTime);
  const success = variant === "success";
  const railBg = success ? "bg-sage text-ink" : "bg-ink text-cream";

  const Facts = (
    <>
      {dayTime && <div className="text-xs opacity-80">{dayTime}</div>}
      <div className="text-xs opacity-80">{season.location.name.replace(/^Soccer One\s+/i, "")}{fmtDate(season.startDate) ? ` · Starts ${fmtDate(season.startDate)}` : ""}</div>
    </>
  );

  return (
    <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 max-w-5xl mx-auto">
      {/* Desktop rail */}
      <aside className={`hidden lg:block self-start sticky top-24 rounded-2xl p-6 ${railBg}`}>
        {tier && <span className={`inline-block rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-cream ${tierColorClass(season.skillLevel)}`}>Tier {tier}{success ? " · Registered" : ""}</span>}
        <h2 className="font-display text-2xl mt-3 mb-1">{season.name}</h2>
        {Facts}
        {!success && (
          <>
            <div className="border-t border-cream/20 my-4" />
            <div className="font-display text-2xl font-bold">{amount}<span className="text-xs font-sans font-normal opacity-70"> {unit}</span></div>
            {season.earlyBirdDeadline && <div className="text-xs text-orange-bright mt-1">Early-bird ends {fmtDate(season.earlyBirdDeadline)}</div>}
          </>
        )}
        <div className="flex gap-1 mt-4" aria-hidden>
          {Array.from({ length: stepCount }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded ${i < step ? (success ? "bg-ink" : "bg-primary") : "bg-cream/20"}`} />
          ))}
        </div>
      </aside>

      {/* Mobile pinned strip */}
      <div className={`lg:hidden sticky top-16 z-10 -mx-4 px-4 py-3 ${railBg}`}>
        <div className="flex items-center gap-2">
          {tier && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-cream ${tierColorClass(season.skillLevel)}`}>{tier}</span>}
          <span className="font-display text-lg">{season.name}</span>
          {!success && <span className="ml-auto font-display font-bold">{amount}</span>}
        </div>
        <div className="flex gap-1 mt-2" aria-hidden>
          {Array.from({ length: stepCount }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded ${i < step ? (success ? "bg-ink" : "bg-primary") : "bg-cream/20"}`} />
          ))}
        </div>
      </div>

      <section className="pt-6 lg:pt-0">{children}</section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck.** `npx tsc --noEmit` (zero new errors). No unit test for the JSX — its logic lives in `rail-content.ts` (Task 4); visual correctness is covered by E2E (Task 8).

- [ ] **Step 3: Commit**
```bash
git add src/components/registration/league-context-rail.tsx
git commit -m "feat(register): league-context-rail shell (sticky rail + mobile strip)"
```

---

## Task 6: Wizard re-skin + `teamToken`/`mode` props

**Files:** Modify `src/components/registration/registration-wizard.tsx`

The wizard becomes the solo step engine rendered *inside* the rail. Remove its own summary card; accept the new props; thread `teamToken` to the checkout call so the resulting registration can be linked to the team (consumed in Task 7's API change).

- [ ] **Step 1: Remove the summary card.** Delete the JSX block at lines ~1195–1234 (the `<div className="mb-6 p-4 rounded-xl bg-paper border border-border">` … through its close) — the rail owns this now. Verify with `grep -n "rounded-xl bg-paper border border-border" src/components/registration/registration-wizard.tsx` returns nothing after.

- [ ] **Step 2: Add props.** Extend the props interface (lines ~96–102) to:
```tsx
interface RegistrationWizardProps {
  seasonId: string
  wasCancelled?: boolean
  user: AuthedUser | null
  audienceHint?: string | null
  /** When joining via a captain's invite link, the team invite token. */
  teamToken?: string | null
}
```
Destructure `teamToken` in the component signature (line ~140).

- [ ] **Step 3: Thread token to checkout.** In the body that POSTs to `/api/registrations/guest-checkout` and `/api/payments/create-checkout` (the checkout submit handlers), add `teamToken` to the JSON payload, e.g. `body: JSON.stringify({ ...existing, teamToken: teamToken ?? undefined })`. (Both the guest and authed branches — grep for `guest-checkout` and `create-checkout` fetch calls in this file.)

- [ ] **Step 4: Remove the outer max-width wrapper** so the rail (Task 7 orchestrator) controls layout. Change the wizard's outermost `<div className="max-w-3xl mx-auto">` (line ~1137) to `<div className="w-full">`. Keep the progress UI (the rail also shows progress, but the per-step labels in the wizard are fine — they're complementary; do NOT delete the step indicator).

- [ ] **Step 5: Update the confirmation copy.** Open the confirmation step component (the `<ConfirmationStep />` rendered at wizard lines ~1433–1438 — find its file, likely `src/components/registration/confirmation-step.tsx`). Remove any "add to calendar" affordance and replace the post-confirm messaging with the schedule-comes-later promise, e.g.: "Your spot is locked. Registration closes soon — once divisions are set we'll email your team & schedule before kickoff." Keep a "View my registrations" link if present. (Per the mockup `solo-flow-v2.html` step 4.) If `ConfirmationStep` has no calendar affordance today, just confirm the copy reflects schedule-later and move on.

- [ ] **Step 6: Typecheck + build.** `npx tsc --noEmit`; `npm run build` (ignore baseball error).

- [ ] **Step 7: Commit**
```bash
git add src/components/registration/registration-wizard.tsx src/components/registration/confirmation-step.tsx
git commit -m "feat(register): wizard drops summary card, accepts teamToken, schedule-later confirm"
```

---

## Task 7: Orchestrator + choose-mode + team-create + page wiring

**Files:** Create `src/components/registration/register-experience.tsx`, `src/components/registration/choose-mode.tsx`, `src/components/registration/team-create.tsx`; Modify `src/pages/register/[seasonId].astro`

- [ ] **Step 1: `choose-mode.tsx`**
```tsx
"use client";
import { priceLabel } from "@/lib/leagues/rail-content";
export default function ChooseMode({ season, canTeam, onPick }: {
  season: { price: number; teamPrice: number | null; deposit: number | null };
  canTeam: boolean;
  onPick: (m: "solo" | "team") => void;
}) {
  const solo = priceLabel("solo", season), team = priceLabel("team", season);
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">Step 1 of {canTeam ? 4 : 4}</p>
      <h1 className="font-display text-2xl text-ink mt-1 mb-4">How do you want to join?</h1>
      <button onClick={() => onPick("solo")} className="block w-full text-left rounded-xl border border-ink/15 hover:border-primary p-4 mb-3">
        <div className="font-display text-lg">Join solo →</div>
        <div className="text-sm text-ink-muted">We place you on a team. <b>{solo.amount}</b></div>
      </button>
      {canTeam && (
        <button onClick={() => onPick("team")} className="block w-full text-left rounded-xl border border-ink/15 hover:border-primary p-4">
          <div className="font-display text-lg">Bring a team →</div>
          <div className="text-sm text-ink-muted">You captain a full roster. <b>{team.amount}</b></div>
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `team-create.tsx`** — move the captain form logic out of `create-team-form.tsx` into a shell-friendly component. Reuse the existing POST to `/api/public/team-registrations` (body `{ seasonId, teamName, captainName, captainEmail, notes? }`, returns `{ joinUrl: "/team/{token}", inviteToken }`). On success show the share link + a "Register myself as a player" button that calls `onCaptainRegister(inviteToken)`. Keep it presentational about the rail (the rail wraps it). Base the JSX on the existing `create-team-form.tsx` success UI (link box + copy button) — that code already works; relocate it. Props:
```tsx
"use client";
import { useState } from "react";
export default function TeamCreate({ seasonId, defaultName, defaultEmail, onCaptainRegister }: {
  seasonId: string; defaultName: string; defaultEmail: string;
  onCaptainRegister: (inviteToken: string) => void;
}) { /* form state + fetch to /api/public/team-registrations; on ok, render share link + invite-by-email field + onCaptainRegister(inviteToken) button. Reuse copy-to-clipboard from create-team-form.tsx. */ }
```
(Phase A keeps email-invite as a field that captures addresses and POSTs them to a lightweight invite send — if no invite-email endpoint exists yet, render the email inputs but wire only the shareable link in Phase A and leave a `// TODO Phase B: assigned shares` is NOT allowed; instead Phase A sends invite emails via the existing `@/lib/email/send` Resend helper through a new `POST /api/public/team-registrations/[token]/invite` that emails the link. Implement that endpoint in this step: accepts `{ emails: string[] }`, looks up the team by token (tenant-scoped), sends each an invite email with the join link, returns `{ sent: n }`.)

- [ ] **Step 3: `register-experience.tsx` orchestrator**
```tsx
"use client";
import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import LeagueContextRail, { type RailSeason } from "./league-context-rail";
import ChooseMode from "./choose-mode";
import TeamCreate from "./team-create";
import RegistrationWizard from "./registration-wizard";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";

type AuthedUser = React.ComponentProps<typeof RegistrationWizard>["user"];

export default function RegisterExperience({ seasonId, user, audienceHint, wasCancelled, teamToken }: {
  seasonId: string; user: AuthedUser; audienceHint: string | null; wasCancelled: boolean; teamToken: string | null;
}) {
  useHydrationBeacon();
  const [season, setSeason] = useState<(RailSeason & { signupModes: string[]; status: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // teamToken present → teammate-join (mode "share"); else choose-mode first.
  const [mode, setMode] = useState<"choose" | "solo" | "team">(teamToken ? "solo" : "choose");

  useEffect(() => {
    fetch(`/api/public/seasons/${seasonId}`).then(async (r) => {
      if (!r.ok) throw new Error("not_found");
      setSeason(await r.json());
    }).catch(() => setErr("We couldn't load this league. It may be closed."));
  }, [seasonId]);

  if (err) return <ErrorBanner message={err} />;
  if (!season) return <LoadingSkeleton />;
  if (season.status !== "open") return <ErrorBanner message="Registration for this division isn't open." />;

  const canTeam = season.signupModes?.includes("team");
  const railMode = teamToken ? "share" : mode === "team" ? "team" : "solo";

  // choose-mode renders without the wizard; once a mode is picked, render the rail + sub-flow.
  if (mode === "choose") {
    return (
      <LeagueContextRail season={season} mode="solo" step={1} stepCount={4}>
        <ChooseMode season={season} canTeam={canTeam} onPick={setMode} />
      </LeagueContextRail>
    );
  }
  if (mode === "team") {
    return (
      <LeagueContextRail season={season} mode="team" step={1} stepCount={4}>
        <TeamCreate seasonId={seasonId} defaultName={user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : ""} defaultEmail={user?.email ?? ""}
          onCaptainRegister={(tok) => { window.location.href = `/register/${seasonId}?team=${encodeURIComponent(tok)}`; }} />
      </LeagueContextRail>
    );
  }
  // solo OR teammate-join: rail wraps the wizard.
  return (
    <LeagueContextRail season={season} mode={railMode} step={1} stepCount={4}>
      <RegistrationWizard seasonId={seasonId} user={user} audienceHint={audienceHint} wasCancelled={wasCancelled} teamToken={teamToken} />
    </LeagueContextRail>
  );
}
```
(Note: the rail's `step` can stay 1 in Phase A — the wizard renders its own per-step indicator. Live step-sync between wizard and rail is a Phase-B-or-later polish; do not block on it.)

- [ ] **Step 4: Wire the page.** Replace `src/pages/register/[seasonId].astro` body to read `?team=` and mount the orchestrator:
```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import RegisterExperience from '../../components/registration/register-experience';
const { seasonId } = Astro.params;
const user = Astro.locals.user;
const wasCancelled = Astro.url.searchParams.get('payment') === 'cancelled';
const audienceHint = Astro.url.searchParams.get('audience');
const teamToken = Astro.url.searchParams.get('team');
const userProp = user ? { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? null, birthDate: user.birthDate ?? null, gender: user.gender ?? null } : null;
---
<BaseLayout title="Register — Aspire Sports">
  <main id="main-content" class="flex-1 pt-24 pb-16 px-4">
    <RegisterExperience seasonId={seasonId!} user={userProp} audienceHint={audienceHint} wasCancelled={wasCancelled} teamToken={teamToken} client:load />
  </main>
</BaseLayout>
```

- [ ] **Step 5: Typecheck + build.** `npx tsc --noEmit`; `npm run build` (ignore baseball). Confirm `LoadingSkeleton`/`ErrorBanner` import paths match the codebase (`@/components/ui/loading-skeleton`, `@/components/ui/error-banner` — verify exact export names; adjust if named differently).

- [ ] **Step 6: Commit**
```bash
git add src/components/registration/register-experience.tsx src/components/registration/choose-mode.tsx src/components/registration/team-create.tsx src/pages/register/\[seasonId\].astro src/pages/api/public/team-registrations/
git commit -m "feat(register): one-door orchestrator, choose-mode, team-create in rail shell"
```

---

## Task 8: Wire team-membership linkage (the missing `?team=` consumption)

**Files:** Modify `src/lib/registrations/create-registration.ts`, `src/pages/api/registrations/index.ts`, `src/pages/api/registrations/guest-checkout.ts`; Test `tests/api/team-linkage.test.ts` (create)

Today a teammate's registration is never linked to `team_registration_members`. Wire it: the checkout endpoints accept `teamToken`; on successful registration creation, resolve the token → `team_registrations.id` and insert a member row (`role: 'captain'` if the registrant is the captainUserId/captainEmail, else `'member'`).

- [ ] **Step 1: Failing API test**
```ts
// tests/api/team-linkage.test.ts
import { describe, it, expect } from "vitest";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
// Create a team, then guest-register a teammate with the token, then assert the
// team's roster (GET /api/public/team-registrations/:token) shows 1 member.
describe("team linkage via ?team= token", () => {
  it("a teammate registration appears on the team roster", async () => {
    const season = (await (await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)).json()).seasons?.[0];
    expect(season?.id).toBeTruthy();
    const create = await (await fetch(`${BASE}/api/public/team-registrations`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seasonId: season.id, teamName: `Linkage Test ${Date.now()}`, captainName: "Cap Tain", captainEmail: `cap-${Date.now()}@test.aspiresports.com` }) })).json();
    expect(create.inviteToken).toBeTruthy();
    const before = (await (await fetch(`${BASE}/api/public/team-registrations/${create.inviteToken}`)).json()).team.memberCount;
    await fetch(`${BASE}/api/registrations/guest-checkout`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ /* adult-self shape from existing guest-checkout schema */ seasonId: season.id, registrationType: "full", teamToken: create.inviteToken,
        adult: { firstName: "Team", lastName: "Mate", email: `mate-${Date.now()}@test.aspiresports.com`, birthDate: "1990-01-01", gender: "male" }, waiverSigned: true }) });
    const after = (await (await fetch(`${BASE}/api/public/team-registrations/${create.inviteToken}`)).json()).team.memberCount;
    expect(after).toBe(before + 1);
  });
});
```
(Adjust the guest-checkout body to the exact adult-self shape in `guest-checkout.ts`'s zod schema — read it; the point is `teamToken` is included.)

- [ ] **Step 2: Run → FAIL** (memberCount unchanged — token ignored). Dev server up first.

- [ ] **Step 3: Implement.**
  1. `create-registration.ts`: add `teamToken?: string | null` to `CreateRegistrationInput`; after the registration row is inserted (and `db` available), if `teamToken` present, look up `teamRegistrations` by `inviteToken` (tenant-scoped via the season's org), and insert a `teamRegistrationMembers` row `{ teamRegistrationId, registrationId, role }` where `role = (captainUserId === input.user?.id || captainEmail === <registrant email>) ? "captain" : "member"`. Use `onConflictDoNothing` (a registration can only appear once per team — the unique index `rosters_team_registration_uniq` is on rosters; for members add an equivalent guard: skip insert if a row for this `registrationId` already exists). Wrap in try/catch so a bad/expired token never breaks registration (log + continue).
  2. `src/pages/api/registrations/index.ts`: add `teamToken: z.string().max(64).optional()` to `createRegistrationSchema`; pass it into `createRegistration({ ..., teamToken })`.
  3. `src/pages/api/registrations/guest-checkout.ts`: add `teamToken: z.string().max(64).optional()` to the input schema; pass to `createRegistration`.

- [ ] **Step 4: Run → PASS.** Re-run `tests/api/team-linkage.test.ts`; `npx tsc --noEmit`.

- [ ] **Step 5: Commit**
```bash
git add src/lib/registrations/create-registration.ts src/pages/api/registrations/index.ts src/pages/api/registrations/guest-checkout.ts tests/api/team-linkage.test.ts
git commit -m "feat(register): link teammate registrations to team via ?team= token"
```

---

## Task 9: E2E + final verification + PR

**Files:** Create `tests/e2e/register-flow.spec.ts`

- [ ] **Step 1: Write `@critical` E2E**
```ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

test("division Register lands on canonical /register with choose-mode @critical", async ({ page }) => {
  // Reach an open adult soccer division and click Register.
  await page.goto("/adult/leagues/soccer", { waitUntil: "domcontentloaded" });
  // (Navigate to the current season page → divisions tab as the season spec does;
  // or go straight to a known seed season register URL.)
  const season = await (await page.request.get("/api/public/seasons?sport=soccer&audience=adult")).json();
  const id = season.seasons?.[0]?.id;
  await page.goto(`/register/${id}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: /how do you want to join/i })).toBeVisible();
  await expect(page.getByText(/Join solo/i)).toBeVisible();
});

test("/register/team/:id redirects to canonical /register/:id @critical", async ({ page }) => {
  const season = await (await page.request.get("/api/public/seasons?sport=soccer&audience=adult")).json();
  const id = season.seasons?.[0]?.id;
  const resp = await page.goto(`/register/team/${id}`, { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain(`/register/${id}`);
  expect(page.url()).not.toContain("/team/");
});

test("solo path reaches the player step inside the rail @critical", async ({ page }) => {
  const season = await (await page.request.get("/api/public/seasons?sport=soccer&audience=adult")).json();
  const id = season.seasons?.[0]?.id;
  await page.goto(`/register/${id}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  await page.getByText(/Join solo/i).click();
  await expect(page.getByText(/who.?s playing/i)).toBeVisible();
});
```
(Tag `@critical` so the PR gate runs them — the #225/#229 lesson.)

- [ ] **Step 2: Run E2E.** With dev server up + e2e seed: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/register-flow.spec.ts`. Fix selectors to match the implemented copy.

- [ ] **Step 3: Full verification.** `npx vitest run tests/unit/rail-content.test.ts tests/unit/register-href.test.ts`; `npx tsc --noEmit`; `npm run build` (ignore baseball); with dev server: `TEST_BASE_URL=http://localhost:4321 npm run test:api`.

- [ ] **Step 4: PR.**
```bash
git push -u origin <branch>
gh pr create --fill
```

- [ ] **Step 5: Watch CI to green** — typecheck, build, test-api, test-critical. Not done until green.

---

## Self-Review
- **Spec coverage (Phase A):** one-door routing (T1) + redirect (T2); rail fields (T3); rail helpers+component (T4,T5); solo re-skin (T6); orchestrator/choose-mode/team-create + page (T7); the missing team-token linkage (T8); E2E+verify (T9). Hybrid rail (desktop rail / mobile strip) = T5. Confirm-step "schedule later" copy lives in the existing ConfirmationStep — if it still says add-to-calendar, fix it in T6 (the mockup change); note: **add a T6 sub-step to update ConfirmationStep copy to promise schedule later, removing any add-to-calendar affordance.**
- **Placeholders:** the only soft spot was team-create email-invite — resolved by implementing a real invite endpoint in T7 step 2 (no TODO). 
- **Type consistency:** `RailMode` ("solo"|"team"|"share") shared by rail-content, rail, choose-mode; `teamToken` name consistent across wizard → checkout → API → create-registration.
- **Gap fix:** add the ConfirmationStep copy update to Task 6 (see above).

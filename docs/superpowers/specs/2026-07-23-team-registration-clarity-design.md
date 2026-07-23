# Team Registration Clarity — Design

**Date:** 2026-07-23
**Scope decision:** fix everything that blocks or surprises someone *registering* a team now; team *management* improvements (persistent tracker page, invite edit/resend UX, reminder cadence) are deferred fast-follows.
**Tone decision:** progressive disclosure — headline "$200 reserves your team" everywhere; the full economics (total fee, roster split, backstop) explained once, plainly, at team creation before the deposit.

## Problem

A full audit of the team flow (discovery → captain → member) found the $200-deposit-reserves model is nearly invisible in the highest-intent funnels, and several surfaces display numbers that are simply wrong:

- Soccer term pages show only the solo per-player price; team price never rendered.
- The register entry (`ChooseMode`, rail) shows the **full team fee** with no "$200 today".
- The catalog card's "$200 reserves your team — split the rest" note is gated on the unrelated *individual* `season.deposit` field.
- SoccerOne has no deposit/split story anywhere.
- The team-create form shows **no price**; its button says "Create team & get link" and the $200 charge appears as a surprise on the next screen. The total team fee first appears *after* paying.
- The captain receives **no email** after the deposit — the invite link and tracker live only in the open tab.
- A member opening an invite sees the **solo price labeled "your share"** in the rail and on the payment screen, even when the captain assigned a different share; the invite email states the correct amount, so the site contradicts the email — and the displayed total ≠ the actual charge.
- A member with an unpaid solo registration who opens a team invite silently resumes solo: pays solo price, never joins the roster.
- A paid solo registrant opening an invite hits a bare error banner with no team context.
- The pre-backstop-charge warning emails the captain the **teammate** template ("pay your share… or {their own name}, your captain, will be charged").
- The team-token GET returns every invitee's email + share to anyone holding the link.

Prod data confirms seasons carry `teamPrice` ($1,050, $1,000 early-bird) — these are rendering/copy gaps, not data gaps.

## Design

### 1. One canonical price story (discovery + entry)

A shared helper (extend `src/lib/leagues/rail-content.ts`, using `CAPTAIN_DEPOSIT_DOLLARS` from `src/lib/registrations/team-deposit.ts`) produces the team story from a season, early-bird-aware:

> **$200 today reserves your team · $1,000** ~~$1,050~~ **total, split with your roster**

Applied to:

| Surface | File | Change |
|---|---|---|
| ChooseMode "Bring a team" card | `choose-mode.tsx` | Replace bare full-price figure with the story |
| Register rail, team mode | `league-context-rail.tsx`, `rail-content.ts` | "$200 down today · $1,000 total · your roster pays the rest" |
| Soccer term pages | `divisions-finder.tsx`, `adult/leagues/soccer/[term].astro` | Division rows read `teamPrice` and gain "or reserve a team — $200 down, $1,000 total"; hero CTA becomes "Register a team · $200 down →" |
| Catalog card | `program-card-v2.tsx` | "split the rest" note keys off `teamPrice` + team signup mode, not `season.deposit`; team column framed "$200 down · $1,050 total" in default layout too |
| SoccerOne finder + league pages | `SoccerOneLeaguesFinder.tsx`, `soccerone/leagues.astro` | "team: $200 reserves it · $1,050 total" replacing raw "$Y/team"; token values re-pinned per brand |

No layout redesigns — copy and one added line per surface.

### 2. Captain: price before charge, paper trail after

- **Team-create form** (`team-create.tsx`): a fee box above the submit button — Today $200 / Season team fee $1,000 (~~$1,050~~) / "Your roster pays the rest when they register" $800 — with the backstop stated as the box's final term and the **deadline date** (`season.registrationCloses`, currently shown nowhere) named explicitly.
- **Card-on-file acknowledgment is a condition, not an option** (owner note 2026-07-23): the existing required checkbox stays (explicit affirmative consent for off-session charging), but reworded from opt-in-sounding "Save my card to cover…" to: *"I understand my card stays on file — teammate shares still unpaid after {date} are charged to it. My $200 counts toward the team fee. (required to reserve)"*. Submit stays disabled until checked.
- **Submit button:** "Reserve your team · $200 →" (was "Create team & get link →").
- **Deposit screen:** shows Due today $200 and "Team fee $1,000 − your deposit = $800 left for your roster" (was only "credits the team fee").
- **New deposit confirmation email**, sent from `handle-team-deposit-succeeded.ts` via the standard send path (respects `MESSAGING_LIVE` gating): $200 receipt, the join/invite link, remaining amount, deadline, backstop reminder, CTA to the team page. Registration-critical: today closing the tab loses the invite link.

### 3. Member: the number shown is the number charged

- **Payment step uses the server's `amountDueCents`** (`registration-wizard.tsx` currently recomputes `fullPriceCents(season)`; the created registration already returns the real amount). Displayed total = actual charge on every path. Summary line: "Your share — {team} · $90 · Set by your captain · team fee $1,000".
- **Rail "share" mode stops asserting the solo price.** Invite emails' links gain an invitee reference param; `GET /api/public/team-registrations/[token]` accepts it and returns that invitee's `shareCents` so the rail shows the real figure. Generic (captain-shared) links show "Your captain set your share — you'll see the exact amount before payment" with no number.
- **Email mismatch notice:** when a team-token registration resolves *without* an invitee share (sign-up email ≠ invited email), the payment step says so: "This email doesn't match your team invite, so your captain's share amount didn't apply…" instead of silently charging the solo price.
- **Privacy ride-along:** the token GET returns the full invitee list (emails + shares) **only to the signed-in captain** (same identity check as `viewerCaptainCredit`). Everyone else gets aggregate payment summary plus, with an invitee ref, their own share only.

### 4. Edge cases + backstop email fix

- **Unpaid solo registration + team invite:** the resume path in `create-registration.ts` honors the team token — applies the invitee share override and links the registration to the roster (today it early-returns before both). Confirmation copy: "You're joining {team} — your share is $X."
- **Paid solo registration + team invite:** replace the bare error banner with a friendly state: "You're already in this season. To appear on {team}'s roster, ask your captain to add you. Nothing more to pay through this link." Builds on the `already_registered` error-code contract introduced by the unmerged `feat/funnel-friction-fixes` branch (same files) — **merge that branch first** and build on its `code` field rather than duplicating it.
- **Captain pre-charge warning** (`charge-unpaid-team-shares.ts` + `send.ts`): captain-specific template — subject "Heads up: $X in unpaid shares for {team}", body naming the unpaid count, the deadline, and that the charge lands on their card, CTA to the team page — replacing the teammate "pay your share" template currently sent to the captain.

### Testing

- Extend `tests/e2e/register-team-flow.spec.ts` beyond the consent checkbox: price story visible on ChooseMode, fee box + acknowledgment gating on team-create (click-driven, `waitForHydration`). These specs run post-merge only — run locally before merging.
- API tests: token GET scope-down (captain vs. member vs. anonymous payloads), resume-with-token applies share + roster link, mismatch leaves solo amount with flag. CI has no Stripe keys — mint fixtures via the authed path or gate with `itWithStripe`.

### Delivery

Two PRs to keep review tractable:

1. **Surfaces + captain flow** (§1, §2): copy/display changes plus the deposit email.
2. **Member truth + edge cases** (§3, §4): `amountDueCents` display, invitee-ref share, privacy scope-down, resume-with-token, already-registered state, backstop email fix. Sequenced after `feat/funnel-friction-fixes` merges.

### Out of scope (management fast-follow)

Persistent captain tracker/dashboard page, per-invitee resend/edit affordances, escalating reminder cadence, renaming the Telegram "team groups" surfaces, deeper SoccerOne funnel work.

### Open items

- Seasons with `teamPrice` $750 / `deposit` $150 still charge the flat $200 captain deposit by design (`team-deposit.ts` is deliberately season-independent); the individual `deposit` field only governs solo hold-a-spot checkout. Copy must always quote the flat $200 for teams. Flagging in case the owner expects a cheaper reserve on cheaper divisions.

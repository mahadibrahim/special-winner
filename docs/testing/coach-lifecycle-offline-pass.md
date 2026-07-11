# Offline pass: field mode on a real phone

A ~15-minute manual test of the live-session experience under the network
conditions it was designed for: a phone at a field with patchy signal.
Requires a real phone — browser emulation can't credibly fake radio loss,
and our automation renders desktop-viewport only.

**Design contract being tested** (from the lifecycle spec): everything
loads once up front; captures/attendance queue in memory, mirror to
sessionStorage, and flush on action / reconnect / 20s interval; Start is
queued if offline; **Finish is the one action that requires connectivity**
and must say so plainly while losing nothing.

## Setup

- `npm run dev:bws -- --host` on a laptop; note the LAN URL it prints.
- Phone on the same Wi-Fi, signed in as `coach@test.aspiresports.com` /
  `TestCoach123!`. Create a planned session for today (any 2+ segments)
  from the practices page, or reuse one.
- "Go offline" below = airplane mode ON (Wi-Fi off too). "Reconnect" =
  airplane mode OFF, wait for Wi-Fi.

## The toggles

| # | Do | Expect |
|---|----|--------|
| 1 | Open the session's **Set up** screen fully, then **go offline**. Scroll the whole setup. | Everything already rendered stays: plan, equipment, roster. No spinners, no broken sections (load-once payload). |
| 2 | Still offline: tap **Start session**. | UI advances to field mode immediately (optimistic). Offline pill appears: "Offline — will sync". |
| 3 | Still offline: dismiss the attendance sheet (flip one kid absent first), tap a player, capture a glow; advance a segment; cycle prompts. | All interactions instant and local. Pill shows a pending count. Prompts still cycle (they shipped in the payload). |
| 4 | Still offline: **kill the tab/app entirely.** Reopen the LAN URL to the same session (still offline). | The page can't load fresh (no network) — that's expected and fine. Now **reconnect**, reload: because the Start PUT never reached the server, the session is still "planned" — you land back in **setup**. Tap Start again (server-side this is idempotent). Field mode returns; within ~20s the offline pill clears and the pending captures from step 3 flush (they survived in sessionStorage). Verify no duplicate capture appears later in wrap-up (clientId dedupe). |
| 5 | Online: capture one more glow, watch the pill stay absent, then **go offline** and tap **End session** → walk to the final wrap-up step → tap **Finish**. | Wrap-up works offline (attendance confirm, capture triage — ALL captures present including the synced ones). Finish fails **politely and specifically**: a toast telling you nothing was lost and to try again with signal. You stay on step 3; Finish re-enables. |
| 6 | **Reconnect** ("the parking lot"). Tap **Finish** again. | Completes: done screen. Verify in the parent/director views (or DB) that promoted glows exist ONCE each — no duplicates from the retry (promotion idempotency guard). |
| 7 | Reload the session URL online. | Read-only "done" state. |

## Also watch for (ergonomics, not correctness)

- One-thumb reach: player chips, Start/End, and the capture sheet's
  controls all comfortably tappable one-handed on your phone size.
- Sunlight legibility of the current-segment card and timer.
- The 20s background flush never makes the UI stutter mid-interaction.

## Scoring

Pass = every Expect holds. The two most safety-critical rows are **4**
(nothing lost across a tab kill offline) and **6** (retry can't duplicate
parent-visible glows). Any failure: note the row, screen-record if
possible, file against coach-session-lifecycle follow-ups.

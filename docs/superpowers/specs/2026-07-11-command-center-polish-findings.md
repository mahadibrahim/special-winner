# Venue Command Center — Polish Audit Findings (2026-07-11)

Method: live desk-day walkthrough in Chrome against dev (port 4323, seeded staging data, signed in as Test Admin), plus two code passes (error/empty/staleness conformance; seam integrity). Ranked by desk impact. Fix sizes: S < ~1h, M ~ half-day, L ~ multi-day.

## P0 — broken at the desk

1. **Pay-link walk-ins are invisible ghosts until paid.** (live-confirmed, M/L)
   The walk-in flow's success screen says "added to the roster, slot held for payment" — but the held booking appears NOWHERE: the roster panel still says "No confirmed bookings yet." with the open count undecremented (still 20 open), command search finds no such person, and Find booking is explicitly confirmed-only. For the 2-hour hold window staff can't see the pending booking, can't resend the pay link, can't cancel the hold, can't switch to kiosk payment — and nothing stops a second staffer double-filling the slot. Fix: surface held bookings as "⏳ awaiting payment" roster rows with resend/cancel actions, decrement visible open slots, include them in find-booking with a status filter.

2. **The live poll silently dies; "LIVE" keeps pulsing over frozen data.** (live-confirmed, M)
   `src/lib/hooks/use-venue-today.ts:38-56` — the poll fetch has no timeout/AbortController, and the `inFlight` ref guard early-returns every later tick, so one hung request kills polling permanently. Live evidence: the dev-server log shows exactly one `/api/admin/venue/today` request all session (3672ms); the stamp read "updated 268s ago" with the LIVE badge still green and the walk-in never reflected in calendar counts. Fix: AbortController with a ~10s timeout, reset `inFlight` in `finally`, and flip the badge to a visually loud "STALE" state past ~3 missed polls.

3. **Needs-attention "Review" (refund request) is a guaranteed 403 for the front-desk role.** (S)
   `src/components/admin/venue/command/VenueCommandCenter.tsx:192` navigates to `/admin/registrations`, which is in `SUPER_ADMIN_ONLY_PREFIXES` (`src/middleware.ts:373`). A `location_admin` — the screen's primary persona — lands on /admin/unauthorized. Should go to `/admin/refund-requests` (already in their nav), carrying the request id.

4. **Needs-attention "Open" (message) navigates to a page that doesn't exist.** (S)
   `VenueCommandCenter.tsx:190` → `/admin/messages` — no such route (the real inbox is `/messages`, which the sidebar link uses correctly). Every click is a 404.

5. **Find-booking result rows are inert.** (M)
   `src/components/admin/venue/command/FindBookingPanel.tsx:69-97, 222` — result rows render name + status chips but have no onClick/href. Staff find the booking and then can't do anything with it (no roster open, no check-in, no person card).

6. **Day-board game blocks dead-end for location_admins.** (S)
   `src/components/admin/venue/venue-day-page.tsx:200` → `/admin/games/{id}` is super-admin-only (`middleware.ts:375`). "Check in roster" on any league/tournament block bounces the venue manager to unauthorized.

## P1 — trust and feedback gaps

7. **Check-in button swallows failures and allows double-taps.** (S/M)
   `ActivityDetailPanel.tsx:160-169` — no `res.ok` check, no try/catch, no toast; on failure the button "does nothing" and staff never learn the check-in didn't record. `:345-357` — not disabled in flight and no optimistic "Here", so the row only updates on the next 5s poll → rapid double-tap posts twice.

8. **"Text a pay link" silently degrades when no phone is entered.** (live-confirmed, S/M)
   With only an email filled, the payment step still defaults to "Text a pay link" (CTA: "Create booking & text pay link"), the waiver still defaults to "Text link to phone" — and submit succeeds into a copy-link screen without ever saying "no mobile on file; nothing was texted." A staffer walks away believing the customer was texted. Fix: react to which contact fields are filled (auto-select email link / disable text option) and say explicitly when a send didn't happen.

9. **Waiver/photo/ref attention actions can silently no-op, and can't target the person.** (M)
   `VenueCommandCenter.tsx:194-197` — items without a `sessionId` render enabled buttons that do nothing on click. `src/lib/venue/today-types.ts:17-23` — items carry no `personId`, so "Send link"/"Capture" just open the whole-session panel and staff hunt for the right row; the button label promises more than the hand-off delivers.

10. **Out-of-hours sessions masquerade as 8 AM sessions.** (live-confirmed, S)
    The clamp from commit 43311f33 pins a 2:00–3:30 AM session's block to the calendar's 8 AM top edge with no marker; the roster panel then says 2:00 AM. Add an "off-hours ⤴ 2:00 AM" chip on clamped blocks (or extend grid hours to fit the day's real range).

11. **Roster-panel polling is second-class.** (S each)
    `ActivityDetailPanel.tsx:131-148` — error state never cleared on a successful poll (one blip = permanently stuck ErrorBanner; contrast PickupRollCall.tsx:130 which clears correctly); `:252-256` — that banner blocks above still-valid rows instead of quiet retry; `:152` — 5s interval keeps polling hidden tabs (same in PickupRollCall.tsx:140); no freshness stamp on either sub-panel.

12. **The "updated Ns ago" stamp doesn't tick.** (S)
    `VenueCommandCenter.tsx:202, 250-257` — recomputed only on re-render, so it moves in ~7s jumps and freezes entirely when renders stop (exactly when it matters most, per finding 2). Needs a 1s ticker.

13. **No URL state; leaving the page loses everything.** (M)
    `VenueCommandCenter.tsx:85-106` — date/view/open-panel live only in React state (`index.astro:55` always boots to today), and the attention actions navigate with bare `window.location.href` (no return context). Back button = cold reload on today, all panels closed. The old day page did `history.pushState` (venue-day-page.tsx:59-62); the new page regressed this.

14. **Two competing paths for check-in and walk-up.** (M)
    `src/lib/admin/nav-venue-manager.ts:27-28` still links the pre-command-center `/admin/venue/check-in` and `/admin/venue/walk-up` pages. A walk-up entered in the old form isn't visible in the command-center roster flow staff are watching. Retire or redirect.

## P2 — conformance and polish

15. **Calendar header collapses into overlapping garbage with many fields.** (live, S/M)
    With ~15 field columns the header labels overlay each other illegibly (staging ghost venues exaggerate it, but any 6+ field org will hit it). Needs min column width + truncation/tooltip, and ideally a "hide fields with nothing today" toggle.

16. **Hand-rolled feedback UI instead of shared primitives.** (S each)
    WalkInFlow.tsx:602-606 (rose box, not ErrorBanner); :318-322 (clipboard `.then` with no `.catch` — silent copy failure in the pay-link fallback path); FindBookingPanel.tsx:191-193 and CommandSearchBar.tsx:191-193 (rose text, and the search error vanishes on blur); NowStrip.tsx:72-77 and ActivityDetailPanel.tsx:364-368 (hand-rolled empty states); SendLinkActions.tsx:14,79-85 (home-made toast state, not sonner); AvatarUploader.tsx:89-93 (rose text; success gives no confirmation).

17. **Empty day is blank, not inviting.** (M)
    Zero-session day renders a bare grid + muted line instead of the designed EmptyState with "start pickup / add walk-in" quick actions.

18. **Walk-in submit validation is native-only and mute.** (live, S)
    Submitting with a missing required field just jump-focuses the DOB input — no message a busy desk person will notice. Also: why is DOB required for an adult walk-in at all? (Friction per registration; worth a product decision.)

19. **"All clear" vs 11 unread.** (verify, S)
    Needs-attention said "All clear" while the sidebar Inbox badge showed 11 unread. If the queue intentionally scopes to location-relevant messages that's defensible, but as rendered the screen contradicts itself. Verify `group-attention.ts` scoping and either include location-scoped unread or explain the difference in the UI.

## Perf note
The aggregation endpoint took 3672ms on first load (staging DB over proxy inflates this, but it's the page's only data source and worth a query-count look before real-time work).

## Cleared (checked, no issue)
Kiosk hand-off carries locationId and a real URL; PersonCard profile link carries id+context; pickup panels (StartPickupGame, PickupRollCall) are the conformance gold standard; venue-rosters/reports have no broken seams; Week view renders correctly; walk-in → booking creation works end to end (modulo findings 1/8).

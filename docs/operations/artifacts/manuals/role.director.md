# Director

Whole business / multi-venue accountability. Rarely day-of accountable; provides
oversight, owns the catalog, and serves as the final escalation tier.

## post_day

### Rainout refund decision (`act.rainout_refund_decision`) — Accountable | Responsible

- Trigger: T+24h after a recorded rainout
- Expected completion: T+24h
- Tracking: form
- Escalation: If director unreachable, role.venue_manager may default to
"credit only" until director sign-off; a cash refund always requires
director authorization, no exceptions.

1. Within 24 hours of a recorded rainout, pull the rainout decision
   record and the full list of registrations affected — every family
   registered for the cancelled or shortened match(es) at that
   venue/date.
2. Decide the outcome using three tiers, in this order, and never
   skip ahead: reschedule, then credit, then (company-caused
   cancellations only) cash refund. There is no cash refund for a
   weather/lightning/field-condition cancellation, regardless of the
   family's plans — that's the rule, not a case-by-case judgment
   call.
3. Reschedule first. If the match never started, default to
   reschedule where a make-up date is realistic within the season
   window — a family that showed up shouldn't lose the game outright
   if the calendar can absorb it.
4. If a make-up date isn't realistic (end of season, no venue or ref
   availability), the call moves to account credit — the default
   outcome for a weather cancellation that can't be rescheduled.
   Credit holds the value toward a future season or program; it
   doesn't move cash today. For a multi-session program (camp,
   clinic, multi-week program) where the cancellation affects a
   registration that already received some sessions, use a
   tiered-credit-by-sessions-delivered model: credit 75% of session
   value if no sessions were delivered yet, 50% after one session,
   25% after two (SMC Soccer / peer tournament-operator norm; see
   the safety & policy standards reference).
5. A cash refund is reserved for company-caused cancellations — an
   Aspire operational failure, not weather — and always requires your
   explicit sign-off as director. Weather cancellations never reach
   this tier.
6. Decide full vs. partial. A cancellation before kickoff is normally
   a full credit (or, for a company-caused case, a full refund) of
   that game's value; a match stopped partway through is prorated at
   your discretion, with the proration basis documented in the
   rationale.
7. Record the decision — outcome, rationale, affected registration
   count, full vs. partial — and your name as authorizing signer on
   the rainout refund decision form.
8. For a credit outcome, there's no automated credit ledger yet —
   record the credit amount and reason on the form and hand off to
   the office to track it manually against that family's account
   until a dedicated credit ledger ships. Don't let a credit promise
   go untracked between the decision and its application.
9. For the rare cash-refund outcome, action it through each affected
   registration's admin refund action (amount, reason, whether to
   also cancel the registration) individually — the form documents
   the policy call, but the money moves per registration, not as one
   batch transaction.
10. Submit the form. Family and team-captain notice of the outcome
    goes out through the platform per the standard notification
    policy — don't message families individually ahead of the form.
11. If you're unreachable, the venue manager may default to "credit
    only" until you sign off per the escalation path — a cash refund
    always waits for your authorization.

### Rainout reschedule (`act.rainout_reschedule`) — Accountable | Responsible

- Trigger: T+24h after a recorded rainout (when reschedule is the chosen path)
- Expected completion: T+48h
- Tracking: form
- Escalation: If director unreachable, role.venue_manager may propose reschedule
candidates; director sign-off still required before publish.

1. Confirm reschedule is the chosen outcome from the rainout refund
   decision (or noted directly on the original rainout decision)
   before starting — this activity only runs when reschedule, not
   refund or credit, was picked.
2. Identify make-up date candidates: check venue/field availability
   for open slots before the season ends, cross-check the ref
   assignment calendar for crew availability, and check the league
   schedule for conflicts (playoffs, tournament dates, other teams'
   existing games).
3. Consult venue_manager on facility feasibility and event_lead on
   staffing/ref feasibility for each candidate date before committing
   — this is a three-way constraint (venue, refs, calendar), not just
   an open calendar slot.
4. Prefer the earliest feasible date so a cancelled match doesn't
   compound into a scheduling backlog; if no single date works for
   both teams, consider splitting into separate make-up dates rather
   than delaying indefinitely.
5. Record the chosen date(s), venue/field, and any conditions (e.g.,
   "conditional on ref availability") on the rainout reschedule form.
6. Submit the form. This feeds the platform's rescheduling workflow,
   which updates the affected teams' schedules and triggers the
   standard notification to coaches, refs, captains, and parents —
   don't announce the date separately ahead of the form.
7. If a chosen date conflicts with something noticed after the fact
   (a ref crew falls through, a field becomes unavailable), amend the
   reschedule promptly rather than letting stale info stand — a wrong
   make-up date reaching a parent is worse than a delayed one.
8. If you're unreachable, the venue manager may propose candidate
   dates, but the reschedule doesn't publish until you sign off.

### Weekly safety review (`act.weekly_safety_review`) — Accountable | Responsible

- Trigger: Weekly cadence after the weekly metrics rollup lands
- Expected completion: T+72h
- Tracking: form
- Escalation: If director unreachable in a given week, role.venue_manager drafts the
review and director signs off retroactively; no review goes unsigned past
two weeks.

1. After the weekly metrics rollup lands, pull the week's finalized
   incident reports, incident follow-ups, and field damage reports
   across every venue — this review works from the finalized record,
   not the in-the-moment incident response forms.
2. Read every incident from the week, not just the serious ones — a
   pattern across several minor incidents (same field, same age
   group, same time of day) is exactly what this review exists to
   catch before it becomes a serious one.
3. Note any near-miss or close call reported outside the formal
   incident process (a coach or venue manager flagging something in a
   debrief or in person) — near-misses count for this review even
   without their own form.
4. Cross-reference the week's field damage reports for any pattern
   suggesting a facility issue rather than normal wear (recurring
   turf failure at the same spot, equipment failing at the same
   venue).
5. For each theme identified, decide whether it needs a policy
   change, a facility repair or investment, additional training, or
   no action beyond documentation — record the decision and rationale,
   not just the observation.
6. Consult the venue_manager on any decision affecting their venue's
   operations before finalizing — they're the one who executes most
   facility and procedural changes day to day.
7. Record the week's themes, decisions, and any facility or policy
   changes on the weekly safety review form, and submit it.
8. Any decision requiring facility investment or a policy change gets
   flagged explicitly for follow-through — don't let a documented
   decision sit undone; the next week's review should show it closed
   out or explain why not.
9. If you're unavailable in a given week, the venue manager drafts
   the review and you sign off retroactively — no review goes
   unsigned past two weeks per the escalation path.

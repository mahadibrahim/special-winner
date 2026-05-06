# Director

Whole business / multi-venue accountability. Rarely day-of accountable; provides
oversight, owns the catalog, and serves as the final escalation tier.

## post_day

### Rainout refund decision (`act.rainout_refund_decision`) — Accountable | Responsible

- Trigger: T+24h after a recorded rainout
- Expected completion: T+24h
- Tracking: form
- Escalation: If director unreachable, role.venue_manager may default to "credit
only" until director sign-off; refund disbursements still require
director authorization.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Rainout reschedule (`act.rainout_reschedule`) — Accountable | Responsible

- Trigger: T+24h after a recorded rainout (when reschedule is the chosen path)
- Expected completion: T+48h
- Tracking: form
- Escalation: If director unreachable, role.venue_manager may propose reschedule
candidates; director sign-off still required before publish.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Weekly safety review (`act.weekly_safety_review`) — Accountable | Responsible

- Trigger: Weekly cadence after the weekly metrics rollup lands
- Expected completion: T+72h
- Tracking: form
- Escalation: If director unreachable in a given week, role.venue_manager drafts
the review and director signs off retroactively; no review goes
unsigned past two weeks.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

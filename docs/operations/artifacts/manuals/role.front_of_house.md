# Front of House

Owns check-in, parent comms, walk-on registrations, and concessions during an
event-day.

## day_setup

### Concession inventory count (open) (`act.concession_inventory_count`) — Accountable | Responsible

- Trigger: After concession setup, before first sale
- Expected completion: T-60min
- Tracking: form
- Escalation: If front_of_house unreachable, escalate to role.venue_manager per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Concession setup (`act.concession_setup`) — Accountable | Responsible

- Trigger: ~90 minutes before first kickoff (concessions venues only)
- Expected completion: T-90min
- Tracking: checklist
- Escalation: If front_of_house unreachable, escalate to role.venue_manager per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## pre_game

### Walk-on registration (`act.walk_on_registration`) — Accountable | Responsible

- Trigger: Throughout the drop-in/clinic intake window
- Expected completion: T-15min
- Tracking: counter_increment
- Escalation: If front_of_house unreachable, escalate to role.event_lead per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## in_game

### Spectator management (`act.spectator_management`) — Accountable | Responsible

- Trigger: Spectator complaint or sideline issue raised during a match
- Expected completion: trigger+5min
- Tracking: form
- Escalation: If issue exceeds front_of_house scope, escalate to role.event_lead;
any safety-relevant escalation goes to role.venue_manager.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## end_of_day

### Cash and concession reconcile (`act.cash_concession_reconcile`) — Accountable | Responsible

- Trigger: After concession close, before deposit
- Expected completion: phase_end
- Tracking: form
- Escalation: If front_of_house unreachable, role.venue_manager performs the
reconciliation; any cash variance over threshold escalates to
role.director.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Lost and found inventory (`act.lost_and_found_inventory`) — Accountable | Responsible

- Trigger: At end of day after the venue clears
- Expected completion: phase_end
- Tracking: form
- Escalation: If front_of_house unreachable, role.event_lead inventories and
escalates to role.venue_manager per the standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

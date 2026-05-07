# Photographer

Field-side contractor responsible for media capture per assignment, feeding
the media tagging and publishing pipeline.

## pre_game

### Photographer check-in (`act.photographer_check_in`) — Accountable | Responsible

- Trigger: ~30 minutes before first assigned match
- Expected completion: T-30min
- Tracking: signature
- Escalation: If photographer no-show, event_lead escalates to role.venue_manager;
pull from standby pool or accept reduced media coverage.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## post_game

### Photo handoff (raw upload) (`act.photo_handoff`) — Accountable | Responsible

- Trigger: After photographer's last match of the day
- Expected completion: T+30min
- Tracking: counter_increment
- Escalation: If upload fails, photographer notifies role.event_lead who escalates
to role.director; raw cards are retained until upload succeeds.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## post_day

### Photo publish (`act.photo_publish`) — Accountable | Responsible

- Trigger: After tagging is complete (typically T+24h)
- Expected completion: T+24h
- Tracking: counter_increment
- Escalation: If photographer unreachable, role.event_lead pings role.director;
publish authority can be re-assigned for that batch only.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

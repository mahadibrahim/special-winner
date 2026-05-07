# Event Lead

Per-match operational lead. Owns the run-of-show for an individual match or
event slot within a venue's event-day.

## pre_day

### Referee assignment confirmation (`act.ref_assignment_confirm`) — Accountable | Responsible

- Trigger: 48h before kickoff (after assignor publishes schedule)
- Expected completion: T-48h
- Tracking: checklist
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## day_setup

### Pre-shift staff briefing (`act.preshift_staff_briefing`) — Responsible

- Trigger: ~60 minutes before first kickoff
- Expected completion: T-60min
- Tracking: signature
- Escalation: If venue_manager unreachable, role.event_lead delivers the briefing and
escalates to role.director per the standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## pre_game

### Coach pregame briefing (youth league) (`act.coach_pregame_briefing`) — Accountable | Responsible

- Trigger: ~15 minutes before each youth-league kickoff
- Expected completion: T-15min
- Tracking: signature
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Photographer check-in (`act.photographer_check_in`) — Responsible

- Trigger: ~30 minutes before first assigned match
- Expected completion: T-30min
- Tracking: signature
- Escalation: If photographer no-show, event_lead escalates to role.venue_manager;
pull from standby pool or accept reduced media coverage.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Referee check-in (`act.ref_check_in`) — Accountable | Responsible

- Trigger: ~30 minutes before each kickoff
- Expected completion: T-30min
- Tracking: signature
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the
standard handoff ladder; backup ref pulled from standby pool if
scheduled ref no-shows.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Team check-in (`act.team_check_in`) — Accountable | Responsible

- Trigger: ~15 minutes before each kickoff
- Expected completion: T-15min
- Tracking: form
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## in_game

### Code of conduct enforcement (`act.code_of_conduct_enforcement`) — Accountable | Responsible

- Trigger: Conduct issue observed or reported during the match
- Expected completion: trigger+5min
- Tracking: form
- Escalation: If event_lead unreachable, escalate to role.venue_manager; for any
threatened violence escalate immediately to role.director and law
enforcement as appropriate.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Incident response (in-the-moment) (`act.incident_response`) — Responsible

- Trigger: Incident observed or reported during the match
- Expected completion: trigger+5min
- Tracking: form
- Escalation: Any life-threatening incident escalates immediately to 911 and
role.director; venue_manager remains accountable for documentation
but role.event_lead may capture the initial form.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## post_game

### Ref stipend log (`act.ref_stipend_log`) — Accountable | Responsible

- Trigger: After ref's last match of the day
- Expected completion: T+30min
- Tracking: form
- Escalation: If event_lead unreachable, role.venue_manager logs the stipend and
escalates to role.director for sign-off.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## end_of_day

### Staff debrief (`act.staff_debrief`) — Responsible

- Trigger: After facility close walkthrough is signed off
- Expected completion: phase_end
- Tracking: form
- Escalation: If venue_manager unreachable, role.event_lead runs the debrief and
escalates to role.director per the standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

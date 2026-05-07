# Referee

Field-side contractor responsible for match officiating and final score
authority.

## pre_game

### Referee check-in (`act.ref_check_in`) — Responsible

- Trigger: ~30 minutes before each kickoff
- Expected completion: T-30min
- Tracking: signature
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the
standard handoff ladder; backup ref pulled from standby pool if
scheduled ref no-shows.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## in_game

### Live score update (`act.live_score_update`) — Accountable | Responsible

- Trigger: Each scoring event during the match
- Expected completion: phase_end
- Tracking: counter_increment
- Escalation: If the entry app fails, ref keeps a paper tally and event_lead
enters the running score in batch; escalate to role.venue_manager
if the issue persists across matches.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Final score attestation (`act.score_reporting_final`) — Accountable | Responsible

- Trigger: Final whistle of each match
- Expected completion: phase_end
- Tracking: signature
- Escalation: If ref unable to sign, event_lead captures a co-attestation with the
ref's verbal confirmation and escalates to role.venue_manager for
any contested score.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Timekeeping (`act.timekeeping`) — Accountable | Responsible

- Trigger: Match clock start at kickoff
- Expected completion: phase_end
- Tracking: system_event
- Escalation: If primary ref unable to operate clock, the assistant ref or event
lead takes over; escalate to role.venue_manager only if the match
must be paused.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## post_game

### Ejection logging (`act.ejection_logging`) — Accountable | Responsible

- Trigger: Ejection issued during or immediately after the match
- Expected completion: T+30min
- Tracking: form
- Escalation: If ref cannot complete the form, role.event_lead captures the ref's
verbal account and files; escalate to role.director for any ejection
carrying multi-match suspension.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

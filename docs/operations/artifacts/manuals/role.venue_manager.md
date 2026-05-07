# Venue Manager

Single venue, single day. The on-site decision-maker accountable for the
end-to-end execution of an event-day at one location.

## pre_day

### Staff schedule confirmation (`act.staff_schedule_confirm`) — Accountable | Responsible

- Trigger: 48h before event window
- Expected completion: T-48h
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Pre-day weather pre-check (`act.weather_pre_check`) — Accountable | Responsible

- Trigger: 72h before event window for outdoor venues (scheduled review)
- Expected completion: T-72h
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## day_setup

### Facility unlock (`act.facility_unlock`) — Accountable | Responsible

- Trigger: ~2h before first kickoff
- Expected completion: T-2h
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### First-aid kit check (`act.first_aid_kit_check`) — Accountable | Responsible

- Trigger: ~60 minutes before first kickoff
- Expected completion: T-60min
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder; no event begins without a verified kit.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Opening walkthrough (`act.opening_walkthrough`) — Accountable | Responsible

- Trigger: Immediately after facility unlock
- Expected completion: T-2h
- Tracking: form
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder; facilities walks the building until
coverage resumes.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Pre-shift staff briefing (`act.preshift_staff_briefing`) — Accountable | Responsible

- Trigger: ~60 minutes before first kickoff
- Expected completion: T-60min
- Tracking: signature
- Escalation: If venue_manager unreachable, role.event_lead delivers the briefing and
escalates to role.director per the standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## pre_game

### Field condition photo (pregame) (`act.field_condition_photo`) — Accountable | Responsible

- Trigger: ~30 minutes before first kickoff on each surface
- Expected completion: T-30min
- Tracking: photo_upload
- Escalation: If venue_manager unreachable, role.facilities captures the photo and
escalates to role.director per the standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Rainout decision (`act.rainout_decision`) — Accountable | Responsible

- Trigger: Weather/field condition within 2h of kickoff suggests cancellation
- Expected completion: T-90min
- Tracking: form
- Escalation: If venue_manager unreachable, escalate to role.director who has
unilateral authority to call the event.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Pregame weather check (`act.weather_check_pregame`) — Accountable | Responsible

- Trigger: ~90 minutes before kickoff (outdoor venues only)
- Expected completion: T-90min
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## in_game

### Incident response (in-the-moment) (`act.incident_response`) — Accountable | Responsible

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

### Incident report finalization (`act.incident_report_finalization`) — Accountable | Responsible

- Trigger: After the incident is stable and the affected match is over
- Expected completion: T+30min
- Tracking: form
- Escalation: If venue_manager unreachable, role.event_lead drafts and role.director
finalizes; nothing closes until the report is signed off.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## end_of_day

### Facility close walkthrough (`act.facility_close_walkthrough`) — Accountable | Responsible

- Trigger: After the last match concludes and spectators have cleared
- Expected completion: phase_end
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder; closure cannot be completed without a
walkthrough sign-off.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Facility lock and alarm (`act.facility_lock_alarm`) — Accountable | Responsible

- Trigger: After the close walkthrough is signed off
- Expected completion: phase_end
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder; alarm code rotation policy is enforced
centrally.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Staff clock-out (`act.staff_clock_out`) — Accountable | Responsible

- Trigger: As each staff member finishes their last task
- Expected completion: phase_end
- Tracking: signature
- Escalation: If venue_manager unreachable, role.event_lead witnesses the
clock-out and escalates to role.director per the standard handoff
ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Staff debrief (`act.staff_debrief`) — Accountable | Responsible

- Trigger: After facility close walkthrough is signed off
- Expected completion: phase_end
- Tracking: form
- Escalation: If venue_manager unreachable, role.event_lead runs the debrief and
escalates to role.director per the standard handoff ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

## post_day

### Incident follow-up (`act.incident_followup`) — Accountable | Responsible

- Trigger: T+24h to T+48h after incident report finalization
- Expected completion: T+48h
- Tracking: form
- Escalation: If venue_manager unreachable, role.event_lead conducts follow-up
outreach and escalates to role.director per the standard handoff
ladder.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

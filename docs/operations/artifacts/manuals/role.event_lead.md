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

1. Once the assignor publishes the match schedule (around 48 hours
   before kickoff), pull the full match list for today's event window
   and check which matches have a referee crew assigned.
2. For each assigned crew, check whether they've acknowledged the
   assignment through the assignor tool or contractor channel.
3. Follow up directly with any ref who hasn't acknowledged — a quick
   message asking for a yes/no is enough at this stage.
4. For any match still unassigned or any ref who declines, pull a
   replacement from the standby ref pool and confirm they can cover
   the match time and location.
5. Watch for a ref double-booked across two matches that overlap in
   time, and reassign one of them before the day arrives.
6. Confirm the crew size matches what the match format needs (center
   ref only vs. center plus assistants) for tournament or higher-level
   matches.
7. Once every match on today's schedule shows a confirmed, acknowledged
   ref crew, mark the checklist complete.
8. If a match still has no confirmed ref by T-24h, escalate per the
   escalation path — don't let it ride into game day unresolved.

## day_setup

### Pre-shift staff briefing (`act.preshift_staff_briefing`) — Responsible

- Trigger: ~60 minutes before first kickoff
- Expected completion: T-60min
- Tracking: signature
- Escalation: If venue_manager unreachable, role.event_lead delivers the briefing and
escalates to role.director per the standard handoff ladder.

1. About 60 minutes before first kickoff, once the facility unlock and
   first-aid kit check are done, gather every on-shift staff member in
   one spot — event leads, facilities, front of house, photographer.
2. Keep it to 5-10 minutes. Cover today's schedule (match count, key
   times), anything special about today (VIP guests, a rescheduled
   match, a tournament format quirk), the weather outlook if outdoor,
   and any safety reminders (first-aid kit locations, incident
   escalation path).
3. Call out any staffing changes from the schedule confirm — who's
   covering for a standby swap, who's new to the venue today.
4. Ask if anyone has a conflict or needs to leave early, and confirm
   coverage for that window now rather than discovering it mid-shift.
5. Pass around the sign-in sheet — every attendee signs to confirm
   they were briefed.
6. Front of house checks the sign-in sheet against today's staffing
   plan and signs to confirm the full roster attended and the sheet is
   complete.
7. File the signed sheet with today's event records.
8. If the venue manager can't deliver the briefing, the event lead
   runs it and escalates per the escalation path.

## pre_game

### Coach pregame briefing (youth league) (`act.coach_pregame_briefing`) — Accountable | Responsible

- Trigger: ~15 minutes before each youth-league kickoff
- Expected completion: T-15min
- Tracking: signature
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. This runs for youth-league matches only, alongside team check-in,
   about 15 minutes before kickoff — adult leagues are self-managed
   and skip it entirely.
2. Gather both teams' coaches together, not one at a time, so both
   hear the same information.
3. Cover rules of the day: any format quirks (small-sided rules,
   quarter/half length for the age group), and anything from the
   coach pregame dispatch packet worth repeating out loud.
4. Cover special situations: weather watch status if outdoor, any
   field/court condition notes, rescheduled or shortened matches.
5. Restate conduct expectations — sideline coaching by parents,
   unsporting conduct, and that the code of conduct enforcement
   activity is what handles violations, not an on-field argument.
6. Introduce the ref crew for the match if the coaches haven't already
   met them at this venue.
7. Ask if either coach has a conflict to flag before kickoff (a
   player who needs to leave early, an injury from warmups).
8. Each coach signs to acknowledge the briefing.
9. If the event lead can't run the briefing, escalate to the venue
   manager per the escalation path rather than skipping it.

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

1. About 30 minutes before their assigned kickoff, the ref reports to
   the event lead's check-in station — the same match shows up in the
   ref's My Matches list on their phone.
2. Confirm the ref's identity against today's confirmed assignment
   from the ref assignment confirm.
3. Check the ref is in proper uniform (kit, badge/credential if
   required) and has their equipment — whistle, cards, watch.
4. Confirm the ref knows their match: teams, field/court, kickoff
   time, and any special notes from the pregame weather or facility
   check.
5. The ref signs in on the spot. This is what starts the stipend
   clock, so don't let a ref skip it and go straight to the field.
6. Note the actual check-in time — if it's inside the 30-minute
   window but tight, give the ref a heads-up on time remaining before
   kickoff.
7. If the scheduled ref doesn't show by check-in time, pull the backup
   from the standby pool immediately and check them in instead —
   don't wait past the window hoping the original ref appears.
8. If the event lead is unavailable to run check-in, escalate to the
   venue manager per the escalation path.

### Team check-in (`act.team_check_in`) — Accountable | Responsible

- Trigger: ~15 minutes before each kickoff
- Expected completion: T-15min
- Tracking: form
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. About 15 minutes before kickoff, have both teams' coaches (youth
   leagues) or captains (adult leagues) come to the check-in station —
   this is the same check-in station families see when they arrive.
2. Pull the team's roster on the check-in panel and confirm which
   players are physically present for today's match.
3. Spot-check jerseys/uniforms match team colors so there's no
   confusion once play starts.
4. If a guest player is being used (roster-eligible fill-in for a
   short-handed team), confirm their guest-player paperwork is on
   file before counting them as checked in.
5. Flag any player who isn't on the roster at all — they can't play
   under this team's check-in; direct them to registration if they
   believe it's an error.
6. Confirm both teams have enough checked-in players to meet the
   format's minimum to start (per the sport's roster rules).
7. Submit the check-in form once both teams are confirmed — this both
   gates kickoff and records today's attendance.
8. If either team can't field a legal minimum by kickoff, notify the
   ref and follow the format's forfeit/delay rule rather than
   starting short.

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

1. Once the facility close walkthrough is signed off, gather whoever's
   still on shift for a 5-10 minute huddle — don't hold people who've
   already clocked out waiting for this.
2. Ask what worked today: anything that ran smoother than expected,
   any process worth repeating.
3. Ask what broke or ran rough: equipment failures, staffing gaps,
   confused parents, anything that slowed the day down.
4. Ask if anything needs to go to the office: a facility repair
   request, a supply reorder, a schedule conflict for next time, a
   personnel note.
5. Capture incident or safety mentions even briefly — the full
   incident report is a separate activity, but the debrief should
   flag that one happened so it isn't lost.
6. Write the notes into the debrief form in plain language — this
   feeds directly into tonight's daily digest and the weekly review,
   so vague notes ("things were fine") aren't useful to future you.
7. Submit the form before leaving the venue.
8. If the venue manager isn't available, the event lead runs the
   debrief and escalates per the escalation path.

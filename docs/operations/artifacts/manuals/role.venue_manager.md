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

1. 72 hours before the event window, pull up every outdoor match on the
   day's schedule and check the forecast for temperature, precipitation
   chance, wind, and lightning risk on the weather-alert dashboard.
2. Flag a heat advisory if the forecast heat index reaches 95°F or
   higher during the event window, and flag a precipitation risk if the
   chance of rain is 60% or higher during that window.
3. If the surface is accessible, walk it and note current field
   condition (standing water from recent rain, firmness) as a baseline.
4. If nothing is flagged, complete the checklist — no further action is
   needed until the pregame recheck 90 minutes before kickoff.
5. If something is flagged, notify the event lead and the director
   right away so staffing and family communications can adjust early,
   and schedule a follow-up recheck at T-24h before the forecast locks
   in.
6. Re-run the T-24h recheck if step 5 applied, and carry any still-open
   risk forward into the pregame weather check.

## day_setup

### Facility unlock (`act.facility_unlock`) — Accountable | Responsible

- Trigger: ~2h before first kickoff
- Expected completion: T-2h
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder.

1. Arrive at least 2 hours before first kickoff — before any other
   staff.
2. Disarm the alarm with the current code; if the code fails, use the
   backup entry procedure and log the discrepancy.
3. Unlock the exterior doors staff and families will need today (main
   entrance, staff entrance, any concessions or loading doors) per the
   day's traffic plan.
4. Unlock interior doors: locker rooms, storage/equipment room,
   concessions, restrooms, office.
5. Turn on lights throughout the facility and set HVAC to the
   comfortable operating range for the season.
6. Confirm restrooms are functioning — running water, no leaks, no
   overnight plumbing issues.
7. Note anything unusual from overnight (forced-entry signs, alarm
   trouble codes, standing water) and escalate per the escalation path
   before staff arrive.
8. Mark the checklist complete once the building is ready for staff —
   this clears the way for the opening walkthrough.

### First-aid kit check (`act.first_aid_kit_check`) — Accountable | Responsible

- Trigger: ~60 minutes before first kickoff
- Expected completion: T-60min
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder; no event begins without a verified kit.

1. Open every first-aid kit on premises — one per field/court plus any
   building kit.
2. Check contents against the kit manifest: bandages, gauze, tape,
   antiseptic wipes, gloves, cold packs, CPR mask.
3. Restock any missing or expired item from bulk supply before moving
   to the next kit.
4. Locate the AED and confirm it's in its wall mount or designated
   spot.
5. Check the AED's battery indicator and confirm the pads are within
   their expiration date; swap in fresh pads from backup stock if
   they've expired.
6. Confirm each kit's location is known to today's coaches and event
   leads — a kit at the field/court is one of the items on their own
   session-open check.
7. Log the check complete. No event begins without a verified kit — if
   any kit or the AED can't be verified, escalate immediately per the
   escalation path and hold the start of play at that surface.

### Opening walkthrough (`act.opening_walkthrough`) — Accountable | Responsible

- Trigger: Immediately after facility unlock
- Expected completion: T-2h
- Tracking: form
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder; facilities walks the building until
coverage resumes.

1. Immediately after unlock, walk the entire facility in a fixed route:
   playing surfaces, restrooms, locker rooms, bleachers/spectator
   areas, then the parking lot.
2. At each surface, look for standing water, debris, damaged fixtures
   (goals, nets, benches, lighting), and anything a player or spectator
   could trip on or be hurt by.
3. Check restrooms and locker rooms for cleanliness, supplies (soap,
   paper towels or toilet paper), and any plumbing issues.
4. Check bleachers and spectator areas for structural issues (loose
   bolts, damaged seating) and general cleanliness.
5. Check the parking lot for surface hazards and lighting, and confirm
   the overflow path is clear.
6. Record every finding in the walkthrough form with location and
   severity, even minor ones — this is the day's baseline safety
   record.
7. Route anything unsafe to facilities for correction before players
   and spectators arrive; anything that can't be resolved before the
   event escalates per the escalation path.
8. Submit the completed form before the pre-shift staff briefing so
   findings can be shared with the team.

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

1. About 30 minutes before the first match on each surface, walk to
   that surface with a phone or camera.
2. Frame a wide shot showing the full playing surface — turf/grass
   condition, lines, and goals or nets in position.
3. Take the photo with location and timestamp on so it's date-stamped
   automatically.
4. Upload it to the day's match record under that surface before the
   first whistle.
5. Repeat for every surface hosting a match that day — one dated photo
   per surface, before its first kickoff.
6. If the photo reveals a condition issue (standing water, divots,
   damaged line paint), flag it to facilities right away rather than
   waiting for the field damage process.
7. Don't skip this even on a clear day — it's the baseline any later
   damage claim gets measured against.

### Rainout decision (`act.rainout_decision`) — Accountable | Responsible

- Trigger: Weather/field condition within 2h of kickoff suggests cancellation
- Expected completion: T-90min
- Tracking: form
- Escalation: If venue_manager unreachable, escalate to role.director who has
unilateral authority to call the event.

1. When weather or field conditions within 2 hours of kickoff raise
   real doubt — active lightning, sustained heavy rain producing
   standing water or unsafe footing, or a heat index at or above the
   venue's cutoff — pull the current weather-alert dashboard reading
   and the field condition status.
2. Consult the director before making the call. This is a consequential
   decision; if the director can't be reached in time, the decision
   defaults to them per the escalation path.
3. For lightning specifically, use the standard flash-to-bang rule:
   suspend play if thunder follows lightning within 30 seconds, and
   don't resume until 30 minutes have passed with no further lightning.
4. Decide one of three outcomes: play as scheduled, delay the start
   (name a re-check time), or cancel.
5. Record the decision, the specific conditions that drove it, and your
   name as authorizing signer in the rainout decision form.
6. Submit the form. This triggers the platform's cancellation broadcast
   to parents, coaches, refs, captains, and the venue team
   automatically — don't message people separately ahead of the form.
7. If the outcome is cancel, remember the refund/reschedule call
   (rainout refund decision, rainout reschedule) belongs to the
   director within the next 24 hours — your job ends at the call and
   the record.

### Pregame weather check (`act.weather_check_pregame`) — Accountable | Responsible

- Trigger: ~90 minutes before kickoff (outdoor venues only)
- Expected completion: T-90min
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder.

1. About 90 minutes before kickoff at any outdoor venue, re-check the
   weather-alert dashboard for live conditions — this replaces the 72h
   pre-check with real-time data.
2. Check the lightning radar for detected strikes within 10 miles of
   the venue.
3. Check current precipitation on radar and confirm whether it's
   arriving before, during, or after the event window.
4. Walk the surface (or have facilities confirm) for standing water,
   saturated turf, or other unsafe footing from overnight or same-day
   rain.
5. Check current temperature and heat index against the venue's
   heat-advisory cutoff.
6. If any reading crosses a risk threshold — active lightning, heavy
   rain producing standing water, a heat advisory — move straight to
   the rainout decision rather than waiting out the clock.
7. If conditions are clear, complete the checklist and log the readings
   for the record; that's the data trail if conditions change later and
   the call gets challenged.

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

1. After the last match concludes and spectators have cleared, walk the
   same fixed route as the opening walkthrough: playing surfaces,
   locker rooms, restrooms, bleachers, then the parking lot.
2. Check every locker room and restroom stall for anyone still inside;
   call out before entering an occupied-looking space.
3. Confirm no personal belongings, equipment, or trash was left behind
   on the surfaces or in the stands; route anything found to lost and
   found.
4. Confirm the day's equipment has been accounted for by facilities
   (equipment storage should already be underway).
5. Check for any new safety issue from the day's use — damaged
   fixtures, spills, tripping hazards — and note it for the next
   opening walkthrough or an immediate work order.
6. Confirm exterior areas (parking lot, entrances) are clear of people
   and hazards.
7. Sign off the walkthrough — facility lock and alarm cannot start
   without this sign-off.

### Facility lock and alarm (`act.facility_lock_alarm`) — Accountable | Responsible

- Trigger: After the close walkthrough is signed off
- Expected completion: phase_end
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the
standard handoff ladder; alarm code rotation policy is enforced
centrally.

1. Confirm the close walkthrough is signed off before starting —
   lock-up never happens first.
2. Power down field/court lighting, scoreboards, and any powered
   equipment not needed overnight.
3. Set HVAC to its overnight/unoccupied setting.
4. Walk back through and lock all interior doors: locker rooms,
   storage/equipment room, concessions, office.
5. Confirm interior lights are off except any required security
   lighting.
6. Lock all exterior doors, confirming each is fully secured (not just
   latched).
7. Set the alarm with the current code and wait for the confirmation
   tone or light before you leave — don't assume it armed.
8. Confirm the perimeter is secure (gates latched, no propped doors) on
   your way to your vehicle.
9. Log the lock-and-alarm completion. Alarm code rotation follows the
   centrally-enforced policy — never share or write down the code.

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

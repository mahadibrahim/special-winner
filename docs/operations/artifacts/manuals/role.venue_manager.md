# Venue Manager

Single venue, single day. The on-site decision-maker accountable for the
end-to-end execution of an event-day at one location.

## pre_day

### Staff schedule confirmation (`act.staff_schedule_confirm`) — Accountable | Responsible

- Trigger: 48h before event window
- Expected completion: T-48h
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder.

1. 48 hours before the event window, pull the day's staffing plan and
   list every shift slot that needs to be covered — venue manager,
   event leads, facilities, front of house, and photographer.
2. Check the acknowledgment status the platform has already collected
   for each assigned person (the schedule invite went out automatically
   when the plan was published).
3. For any slot still unacknowledged, contact the assigned person
   directly and get a yes/no before moving on to the next slot.
4. For any no-response or decline, pull a replacement from that role's
   standby pool and confirm their availability for the full shift.
5. Watch for double-booked people or shift times that don't cover the
   full event window, and fix the gap before confirming the slot.
6. Confirm contractor slots (ref, photographer) separately — they come
   from the assignor/contractor pool, not the staff schedule, and need
   their own acknowledgment check.
7. Once every slot on the plan shows a confirmed name, mark the
   checklist complete.
8. If any role still can't be filled by T-24h, escalate per the
   escalation path rather than running the event short-staffed.

### Pre-day weather pre-check (`act.weather_pre_check`) — Accountable | Responsible

- Trigger: 72h before event window for outdoor venues (scheduled review)
- Expected completion: T-72h
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder.

1. 72 hours before the event window, pull up every outdoor match on the
   day's schedule and check the forecast for temperature, humidity,
   precipitation, wind, and lightning risk on weather.gov (National
   Weather Service) — a built-in weather-alert dashboard is planned.
2. Flag a heat risk if the forecast projects Wet Bulb Globe Temperature
   (WBGT) at or above 85.8°F during the event window. WBGT — not the
   heat index or a fixed air-temperature cutoff — is the standard
   (NATA / Korey Stringer Institute; see the safety & policy standards
   reference). Flag a field-condition risk if the forecast shows
   sustained rain likely to leave the surface unsafe (standing water,
   unstable footing) rather than keying off a rain-percentage
   threshold — rain alone doesn't stop play; unsafe field conditions
   and lightning do.
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

- Trigger: ~2h before first kickoff (outdoor/rented venues); at the facility's standard opening time for owned venues on set hours
- Expected completion: T-2h
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder.

1. For an outdoor or rented venue, arrive at least 2 hours before
   first kickoff — before any other staff. For an owned facility
   that runs on set daily hours, arrive at the facility's standard
   opening time instead; this activity isn't tied to kickoff there.
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
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder; no event begins without a
verified kit.

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
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder; facilities walks the building
until coverage resumes.

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
8. Submit the completed form promptly so findings are on record and
   available to share with the team — including at the pre-shift
   staff check, if the venue manager decides to run one.

### Pre-shift staff check (optional) (`act.preshift_staff_briefing`) — Accountable | Responsible

- Trigger: ~60 minutes before first kickoff, at the venue manager's discretion
- Expected completion: T-60min
- Tracking: form
- Escalation: This activity is optional and has no hard failure mode. If the venue
manager wants it run and can't do it themselves, role.event_lead
covers it per the Coach → Venue Manager → Director handoff ladder.

1. This check is optional. Run it when there's something worth
   flagging — a schedule surprise, VIP guests, a weather watch, a
   finding from the opening walkthrough, a staffing swap from the
   schedule confirm. Skip it entirely on a routine day with nothing
   new to share.
2. If you're running it, keep it to a quick radio or in-person round
   with on-shift staff — event leads, facilities, front of house,
   photographer — not a scheduled meeting everyone has to gather in
   one spot for.
3. Cover only what's actually changed or worth flagging; don't
   restate the full day's schedule if nothing about it is unusual.
4. There's no sign-in sheet — this isn't a tracked briefing everyone
   attests to. Log whether you ran it and what you flagged, if
   anything, on the pre-shift staff check form.
5. If the venue manager decides to run it and can't do so themselves,
   the event lead covers it.

## pre_game

### Field condition photo (pregame) (`act.field_condition_photo`) — Accountable | Responsible

- Trigger: ~30 minutes before first kickoff on each surface
- Expected completion: T-30min
- Tracking: photo_upload
- Escalation: If venue_manager unreachable, role.facilities captures the photo and
escalates to role.director per the Coach → Venue Manager → Director
handoff ladder.

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
   standing water or unsafe footing, or WBGT (Wet Bulb Globe
   Temperature) at or above the 89.8°F postpone-or-cancel threshold —
   check current conditions on weather.gov (National Weather Service;
   a built-in weather-alert dashboard is planned) and the field
   condition status. WBGT, not heat index or a fixed air-temperature
   number, is the standard (NATA / Korey Stringer Institute; see the
   safety & policy standards reference).
2. Consult the director before making the call. This is a consequential
   decision; if the director can't be reached in time, the decision
   defaults to them per the escalation path.
3. For lightning, use the 30-30 rule: stop play at the first thunder or
   lightning. Evacuate to safe shelter once a storm is within 5
   nautical miles (~6 miles) — a substantial enclosed building (wiring
   and plumbing) or a fully enclosed hard-top metal vehicle; dugouts,
   tents, gazebos, and park/picnic shelters are NOT safe shelter. Don't
   resume until 30 minutes have passed with no further thunder or
   lightning — the 30-minute clock restarts on every strike or
   thunderclap. A designated weather monitor (not the coach or
   referee — they can't monitor while working) watches conditions
   throughout.
4. Rain alone doesn't stop play — the deciding factors are field
   playability (standing water, unstable footing) and lightning, not a
   rain-percentage forecast.
5. Decide one of three outcomes: play as scheduled, delay the start
   (name a re-check time), or cancel.
6. Record the decision, the specific conditions that drove it, and your
   name as authorizing signer in the rainout decision form.
7. Submit the form. This triggers the platform's cancellation broadcast
   to parents, coaches, refs, captains, and the venue team
   automatically — don't message people separately ahead of the form.
8. If the outcome is cancel, remember the refund/reschedule call
   (rainout refund decision, rainout reschedule) belongs to the
   director within the next 24 hours — your job ends at the call and
   the record.

### Pregame weather check (`act.weather_check_pregame`) — Accountable | Responsible

- Trigger: ~90 minutes before kickoff (outdoor venues only)
- Expected completion: T-90min
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder.

1. About 90 minutes before kickoff at any outdoor venue, re-check
   weather.gov (National Weather Service) for live conditions (a
   built-in weather-alert dashboard is planned) — this replaces the
   72h pre-check with real-time data.
2. Check the lightning radar for detected strikes within 10 nautical
   miles of the venue; the 5-nautical-mile evacuation trigger and the
   rest of the lightning protocol live on the rainout decision.
3. Check current precipitation on radar and confirm whether it's
   arriving before, during, or after the event window — rain alone
   doesn't stop play; unsafe field conditions and lightning do.
4. Walk the surface (or have facilities confirm) for standing water,
   saturated turf, or other unsafe footing from overnight or same-day
   rain.
5. Take a WBGT (Wet Bulb Globe Temperature) reading — not air
   temperature or heat index — 3-4 feet off the ground, in the sun.
   Once WBGT is above 70°F, re-take it every 30 minutes for the
   duration of the event; assign that recurring reading to a
   designated weather monitor who is not the coach or referee (they
   can't monitor conditions while working the match).
6. If any reading crosses a risk threshold — active lightning, heavy
   rain producing standing water, WBGT at or above 85.8°F — move
   straight to the rainout decision rather than waiting out the clock.
7. If conditions are clear, complete the checklist and log the readings
   for the record; that's the data trail if conditions change later and
   the call gets challenged.

## in_game

### Incident response (in-the-moment) (`act.incident_response`) — Accountable | Responsible

- Trigger: Incident observed or reported during the match
- Expected completion: trigger+5min
- Tracking: system_event
- Escalation: Any life-threatening incident escalates immediately to 911 and
role.director; venue_manager remains accountable for documentation but
role.event_lead may capture the initial form.

1. The moment an incident is reported to you — injury, altercation,
   medical event, or property damage — get to the scene. If you
   didn't witness it yourself, find whoever did (coach, ref, event
   lead) before writing anything down.
2. Scene safety and care come before documentation. If it's
   life-threatening, call 911 immediately — this also escalates
   directly to the director; don't wait to finish a form first.
   Never leave an injured or distressed child unattended while you
   sort out logistics.
3. If the incident is or could be a concussion — any sign after a hit
   to the head or body: confusion, headache, dizziness, memory gaps,
   loss of consciousness — remove the athlete from play immediately.
   A coach, referee, or official makes this call on the spot; the
   athlete doesn't get to self-diagnose back into the game. For any
   athlete under 19, this is an Ohio legal requirement, not just good
   practice (ORC 3707.511; see the safety & policy standards
   reference): no return to play the same day, and no return to any
   Aspire activity without written clearance from a physician or an
   Ohio-authorized licensed health-care provider. Coaches and refs
   are required to hold concussion-recognition training (CDC HEADS UP
   or NFHS) current within the past three years as a condition of the
   role.
4. Get first-hand information from whoever responded: who was
   involved, what immediate care was given, whether 911 was called
   and when, and the exact time.
5. Open the incident response form and capture what you have within
   about 5 minutes of the incident — this is the in-the-moment
   record, not the full report. It doesn't need to be complete, it
   needs to be fast and accurate: what happened, who responded, what
   care was given, whether 911 was called.
6. If a parent is on-site, notify them directly and in person before
   they hear about it secondhand. Stick to what happened and what was
   done — don't speculate about diagnosis or fault.
7. Handle this discreetly — this record names a minor. Don't discuss
   specifics in a group chat, in front of other families, or with
   anyone who doesn't need to know; the incident form is the record,
   not a text thread. If what you're looking at is a suspected abuse
   concern rather than an accident or medical event, this form isn't
   the right channel — covered adults must report suspected child
   abuse to law enforcement within 24 hours; see code of conduct
   enforcement for the mandatory-reporting framing.
8. Submit the form as soon as the immediate situation is stable. This
   starts the clock on the incident report finalization, which
   happens once the affected match is over.
9. If you can't capture this yourself, the event lead may capture
   the initial form from the same first-hand accounts — you remain
   accountable for it either way.
10. This form is the fast first pass, not the final record used for
    disputes or insurance — every incident captured here still needs
    the full finalized report before it's closed.

## post_game

### Incident report finalization (`act.incident_report_finalization`) — Accountable | Responsible

- Trigger: After the incident is stable and the affected match is over
- Expected completion: T+30min
- Tracking: form
- Escalation: If venue_manager unreachable, role.event_lead drafts and role.director
finalizes; nothing closes until the report is signed off.

1. Once the affected match is over and the situation is stable, pull
   up the in-the-moment incident response form as your starting point
   — this report builds on it, it doesn't replace it.
2. Identify every witness — players, coaches, refs, spectators who
   saw what happened — and get a brief statement from each while
   memories are fresh; don't rely on a single account.
3. Record post-event status: how the affected person is doing now
   (returned to play, sent home, went to urgent care/ER, refused
   further care), not just what happened in the moment. For a
   suspected concussion, "returned to play" is never a valid status
   for the same day — record that the athlete was removed and, for
   an athlete under 19, that the file is open until a written
   medical clearance (physician or Ohio-authorized health-care
   provider) is received; don't close this out on a verbal
   "they're fine."
4. Attach any relevant photos (of the scene, of visible injury if
   appropriate and consented to, of property damage) to support the
   record.
5. Complete every section of the full incident report form —
   witnesses, statements, photos, post-event status, and anything
   from the in-the-moment response you need to correct or add detail
   to.
6. Handle the report discreetly throughout — it names a minor. Store
   it only in the platform record; don't forward statements or photos
   over text or email, and don't discuss specifics with anyone
   outside the people who need to know to do their job.
7. Consult the director before finalizing anything serious enough to
   carry insurance or legal exposure (a trip to the ER, a serious
   altercation, anything with a clear liability question) — this is
   the record the office and insurer treat as authoritative, so get
   it right rather than fast on anything consequential.
8. Submit the finalized report. Nothing about this incident closes
   until this report is signed off — the incident follow-up activity
   depends on it being complete.
9. If you're unreachable, the event lead drafts the report from the
   same witness statements and evidence, and the director finalizes
   it before it's considered closed.

## end_of_day

### Facility close walkthrough (`act.facility_close_walkthrough`) — Accountable | Responsible

- Trigger: After the last match concludes and spectators have cleared
- Expected completion: phase_end
- Tracking: checklist
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder; closure cannot be completed
without a walkthrough sign-off.

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
- Escalation: If venue_manager unreachable, escalate to role.director per the Coach →
Venue Manager → Director handoff ladder; alarm code rotation policy is
enforced centrally.

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

### Staff check-in / check-out (`act.staff_check_in_out`) — Accountable | Responsible

- Trigger: As each staff member finishes their last task
- Expected completion: phase_end
- Tracking: signature
- Escalation: If venue_manager unreachable, role.event_lead witnesses the check-out;
any escalation needed goes to role.director per the Coach → Venue Manager
→ Director handoff ladder.

1. When a staff member finishes their last task for the day (final
   equipment stored, facility close walkthrough done, concession
   settlement reconciled — whatever their role's closing task is),
   they come to the check-out station before leaving the venue.
2. Confirm their name against today's staffing plan and capture both
   times: the actual check-in (start) time and the actual check-out
   (end) time — not the scheduled times, the real ones. For hourly
   staff (coaches, venue managers, and every other on-site role),
   this pair of times is what payroll runs on, so get both right,
   not just the end time.
3. Ask if there's anything to note for payroll or the office: worked
   past the scheduled end time, left early with venue manager
   sign-off, covered an extra task outside their normal role.
4. The staff member signs to confirm both times and any notes are
   accurate.
5. Front of house checks the signature against the staffing plan and
   signs to close that person's labor record for the day.
6. Repeat for each staff member as they finish, in any order — this
   isn't a single end-of-day batch, it's per-person as people wrap up.
7. Once every staffed slot for the day has a signed check-in/check-out
   record, the record is complete and ready to feed the payroll
   integration.
8. If the venue manager isn't available to witness a check-out, the
   event lead witnesses it and escalates per the escalation path.

### Staff debrief (`act.staff_debrief`) — Accountable | Responsible

- Trigger: After facility close walkthrough is signed off
- Expected completion: phase_end
- Tracking: form
- Escalation: If venue_manager unreachable, role.event_lead runs the debrief; any
unresolved item escalates to role.director per the Coach → Venue Manager
→ Director handoff ladder.

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
   debrief; anything unresolved escalates to the director per the
   escalation path.

## post_day

### Incident follow-up (`act.incident_followup`) — Accountable | Responsible

- Trigger: T+24h to T+48h after incident report finalization
- Expected completion: T+48h
- Tracking: form
- Escalation: If venue_manager unreachable, role.event_lead conducts follow-up
outreach; any escalation needed goes to role.director per the Coach →
Venue Manager → Director handoff ladder.

1. Within 24-48 hours of the finalized incident report, follow up
   directly with the affected family (or staff member, if it's a
   staff incident) — a phone call or in-person check-in, not just a
   text.
2. Ask about recovery status and, for a player, whether or when they
   expect to return to play — record what they tell you, not what
   you assume. For a suspected concussion, don't record or accept a
   "cleared to return" status based on the family's word alone —
   confirm written medical clearance (physician or Ohio-authorized
   health-care provider) is on file before any return-to-play status
   is recorded; this is a legal requirement for athletes under 19
   (ORC 3707.511), not a courtesy check.
3. If the incident involves any injury claim, confirm whether the
   family has been in contact with insurance and capture the contact
   status (not yet, in progress, resolved).
4. Note whether the family has any outstanding question or concern
   from the incident that the office should address — don't let this
   follow-up be a formality if they still have something unresolved.
5. Decide whether any additional action is needed from the office: a
   policy referral (feeds the weekly safety review), a facility
   referral (feeds the field damage report if one hasn't already been
   filed), or a direct follow-up from the director.
6. If the injury ends the athlete's season, flag it to the director:
   the director proactively offers the family a free coupon for
   another Aspire league as a goodwill gesture — this is a director
   offer, not something you extend yourself on this call, but note
   in the follow-up that the family qualifies so the director follows
   through.
7. Record the outreach, what you learned, and any recommended
   additional action on the incident follow-up form, and submit it.
8. Handle this discreetly like every other step in the incident chain
   — it still names a minor; keep the conversation and the record
   between you, the family, and anyone else who needs to know.
9. If you're unreachable within the window, the event lead conducts
   the outreach; any escalation needed goes to the director per the
   Coach → Venue Manager → Director handoff ladder — the 24-48h
   window doesn't stretch just because you're unavailable.

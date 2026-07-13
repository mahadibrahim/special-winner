# Event Lead

Per-match operational lead. Owns the run-of-show for an individual match or
event slot within a venue's event-day.

## pre_day

### Referee assignment confirmation (`act.ref_assignment_confirm`) — Accountable | Responsible

- Trigger: 48h before kickoff (after assignor publishes schedule)
- Expected completion: T-48h
- Tracking: checklist
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the Coach →
Venue Manager → Director handoff ladder.

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

## pre_game

### Coach pregame briefing (youth league) (`act.coach_pregame_briefing`) — Accountable | Responsible

- Trigger: ~15 minutes before each youth-league kickoff
- Expected completion: T-15min
- Tracking: signature
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the Coach →
Venue Manager → Director handoff ladder.

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
- Escalation: If photographer no-show, event_lead escalates to role.venue_manager; pull
from standby pool or accept reduced media coverage.

1. About 30 minutes before your first assigned match, go to the event
   lead's station to sign in — this starts your pay clock for the
   session, so don't skip it even if you're already shooting
   warmups.
2. Confirm your assignment against the event lead's schedule — venue,
   match(es), and session type (game, team posed, practice, event) —
   and flag any mismatch before signing.
3. Confirm your gear — camera body, charged batteries plus a backup,
   memory cards with enough free space for the day, and any lens or
   flash the shot list calls for. This is your own equipment; Aspire
   doesn't supply, issue, or track camera gear.
4. Review the shot list or session notes with the event lead —
   required shots (team photos, action shots, specific players if
   requested) and the event's do-not-publish shortlist pulled from
   the roster, so you know which kids' families opted out of publish
   before you're framing shots, not after.
5. Sign the check-in. The event lead countersigns to confirm your
   arrival and gear are in order.
6. Once signed, your session moves from confirmed to checked-in in the
   platform — this is what the event lead and venue manager see
   reflected on the day's operations view.
7. If you're a no-show, or running late enough that you'll miss the
   window, the event lead escalates to the venue manager immediately
   per the escalation path — don't wait until your scheduled start to
   raise it.

### Referee check-in (`act.ref_check_in`) — Accountable | Responsible

- Trigger: ~30 minutes before each kickoff
- Expected completion: T-30min
- Tracking: system_event
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the Coach →
Venue Manager → Director handoff ladder; backup ref pulled from standby
pool if scheduled ref no-shows.

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
5. Before every game, independently inspect the goal anchoring on
   the assigned field/court — this is a second check on top of
   facilities' field/court setup, not a redundant one, and it isn't
   skippable even when facilities already confirmed it (Montana
   Youth Soccer 2-1100 model; see the safety & policy standards
   reference). Flag anything unanchored to facilities before kickoff.
6. The ref signs in on the spot. This is what starts the stipend
   clock, so don't let a ref skip it and go straight to the field.
7. Note the actual check-in time — if it's inside the 30-minute
   window but tight, give the ref a heads-up on time remaining before
   kickoff.
8. If the scheduled ref doesn't show by check-in time, pull the backup
   from the standby pool immediately and check them in instead —
   don't wait past the window hoping the original ref appears.
9. If the event lead is unavailable to run check-in, escalate to the
   venue manager per the escalation path.

### Team check-in (`act.team_check_in`) — Accountable | Responsible

- Trigger: ~15 minutes before each kickoff
- Expected completion: T-15min
- Tracking: form
- Escalation: If event_lead unreachable, escalate to role.venue_manager per the Coach →
Venue Manager → Director handoff ladder.

1. About 15 minutes before kickoff, have both teams' coaches (youth
   leagues) or captains (adult leagues) come to the front desk —
   there's no separate check-in station anymore. Find today's match
   on the venue command center board and open it: the roster panel
   shows each team's lineup for reference.
2. Confirm in person which players are physically present for today's
   match, checking who's there against the on-screen roster by eye.
   The app doesn't record per-player attendance for league matches —
   the check-in form you submit in step 7 is the day-of attendance
   record, not anything you tap in the roster panel.
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

1. When a conduct issue is observed or reported during a match — a
   coach yelling from the sideline, a parent shouting at players or
   officials, someone ignoring the sideline boundary — respond in
   person and calmly. The goal is to de-escalate and get the match
   back to normal, not to make a scene.
2. Start with the lightest effective step: a direct, private word with
   the person restating the expectation, not shouted across the
   field. Most sideline issues resolve here, especially for someone
   who just got heated in the moment.
3. If the behavior continues after that first word, or it's serious
   enough to skip straight past a warning (targeting a player, abusive
   language at an official), issue a clear, specific warning: name the
   behavior, state what happens if it continues, and note who
   witnessed it.
4. If the person doesn't comply with a warning, or the issue warrants
   it immediately, remove them — a parent goes to the parking lot or
   away from the team area; a coach who won't stop steps away from
   their team for the rest of the match (the assistant coach or team
   captain takes over).
5. This is enforcement, not a referee ejection — you're not sending
   anyone from play under the sport's rules, and this isn't logged as
   an ejection. If what you're looking at is serious enough to be a
   formal ejection of a rostered player or coach, that's the ref's
   call, not yours.
6. Log the incident in the form regardless of how it resolved: who was
   involved, what happened, what action you took, and who witnessed
   it. Even a fully-resolved verbal reminder gets logged — this is
   what lets the office see a pattern if the same person shows up
   again.
7. Submit the form within about 5 minutes of the issue, while the
   details are fresh, and let the coach know afterward if a parent
   from their team was involved. Keep it factual and non-punitive in
   tone — the coach still owns that family relationship day to day.
8. For anything involving a threat of violence or a safety concern,
   skip straight to removal and escalate immediately to the venue
   manager and, for a genuine safety threat, the director and law
   enforcement as appropriate. Don't try to talk someone down who's
   already crossed into a safety issue.
9. This form is for conduct — sideline behavior, disputes, unsporting
   conduct. If what you're looking at is a suspected child-abuse
   concern instead (grooming behavior, an inappropriate one-on-one
   interaction with a minor), this form isn't the right channel:
   covered adults are required to report any suspicion of child
   sexual abuse to law enforcement within 24 hours, and to limit
   one-on-one adult-minor interaction to observable settings as a
   matter of policy. Treat it as a reporting obligation, not a
   conduct write-up, and loop in the director immediately.

### Incident response (in-the-moment) (`act.incident_response`) — Responsible

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

### Ref stipend log (`act.ref_stipend_log`) — Accountable | Responsible

- Trigger: After ref's last match of the day
- Expected completion: T+30min
- Tracking: form
- Escalation: If event_lead unreachable, role.venue_manager logs the stipend and
escalates to role.director for sign-off.

1. After a ref's last match of the day, pull their check-in
   record(s) — one per match — to confirm which matches they
   actually worked today.
2. For each match, confirm the in-app closeout is submitted — the
   final score attestation with cards/incidents logged — before
   locking that match's stipend line. Check-in alone never locks
   pay; a match with no closeout submitted stays open, not paid,
   until the closeout lands.
3. Apply the standard per-match stipend rate for each closed-out
   match, then add any on-file add-ons (travel, doubleheader bonus,
   last-minute fill-in premium — whatever your org's pay schedule
   defines) on top of the base.
4. Total the day's stipend across every closed-out match and record
   the breakdown (base rate x number of matches, plus each add-on
   line) rather than just the final total — the ref and the office
   both need to see how the number was built. A match still awaiting
   closeout isn't in this total yet.
5. Walk the ref through the total before they leave and get their
   acknowledgment that it matches what they expect for today's work —
   resolve any discrepancy on the spot rather than after they've
   left.
6. Record the stipend log — matches worked, base rate, add-ons,
   total, and the ref's acknowledgment — on the ref stipend log form.
7. Submit the form. This hands the day's stipend record to the
   platform's payroll integration for the ref payroll event, which
   processes it for payout — you're not disbursing money yourself
   here, just logging what's owed and getting it acknowledged.
8. If a match's closeout lands after the ref has already left (a late
   score attestation), log that match's stipend as a separate,
   late-add line once the closeout is submitted — don't hold up the
   rest of the day's stipend log waiting on it.
9. If a ref disputes the total and it isn't resolved on the spot, log
   the dispute and the ref's stated expectation on the form rather
   than logging a number they haven't agreed to, and flag it to the
   venue manager.
10. If you're unreachable, the venue manager logs the stipend and
    escalates to the director for sign-off.

## end_of_day

### Staff debrief (`act.staff_debrief`) — Responsible

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

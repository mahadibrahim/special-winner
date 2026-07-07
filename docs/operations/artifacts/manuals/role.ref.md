# Referee

Field-side contractor responsible for match officiating and final score
authority.

## pre_game

### Referee check-in (`act.ref_check_in`) — Responsible

- Trigger: ~30 minutes before each kickoff
- Expected completion: T-30min
- Tracking: signature
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

## in_game

### Live score update (`act.live_score_update`) — Accountable | Responsible

- Trigger: Each scoring event during the match
- Expected completion: phase_end
- Tracking: counter_increment
- Escalation: If the entry app fails, ref keeps a paper tally and event_lead enters the
running score in batch; escalate to role.venue_manager if the issue
persists across matches.

1. Throughout the match, keep your own live tally of the score as
   goals happen — who scored, which side, roughly what minute. This
   is the authoritative running score until it's entered into the
   system at the final report.
2. If the venue has a manual scoreboard or signage table, keep it
   updated goal by goal so spectators and any parents following along
   see the score change in real time. There's no in-app live-score
   screen yet (real-time phone entry is still on the roadmap), so this
   is how "live" actually reaches spectators today.
3. At each stoppage — end of a period or half, an injury break —
   cross-check your tally against your assistant ref's count and the
   venue scoreboard if one is running, so a missed goal doesn't carry
   through to the end of the match.
4. If the event lead or a parent asks for the current score mid-match,
   you should be able to answer immediately and with confidence, not
   have to go check anything.
5. If your tally and your assistant's disagree, stop at the next dead
   ball and reconcile with the two captains/coaches before play
   resumes — sorting this out live is far easier than reconstructing
   it after the final whistle.
6. Reconcile your running tally one more time at the final whistle
   before you go to file the match report. The number you enter as
   the final score should match what you and your assistant have been
   tracking all match, not a guess.
7. If the count becomes genuinely unclear and can't be resolved on the
   field, flag it to the event lead immediately rather than guessing —
   the event lead escalates to the venue manager if it can't be
   resolved before the match needs to continue.
8. Once the final report is submitted, that entry is what the
   platform's score and standings pipeline treats as the record of the
   match's scoring — there's no separate live feed to reconcile it
   against today.

### Final score attestation (`act.score_reporting_final`) — Accountable | Responsible

- Trigger: Final whistle of each match
- Expected completion: phase_end
- Tracking: signature
- Escalation: If ref unable to sign, event_lead captures a co-attestation with the
ref's verbal confirmation and escalates to role.venue_manager for any
contested score.

1. At the final whistle, open the match from My Matches — the same
   match that showed up at check-in — and go to its match report.
2. Enter the final score for both teams in the Home score and Away
   score fields. Double-check the number against your own running
   tally (and your assistant's, if you have one) from the live score
   update before typing it in.
3. Log every incident from the match — yellow cards, red cards,
   injuries, anything else notable — in the incidents list. If you
   already separately logged an ejection, list it here too; the match
   report is the complete record on its own, not a supplement to
   another log.
4. Add anything else worth noting in the match notes field — a
   weather delay, a contested call, an early stoppage, anything that
   isn't captured by the score or the incident list.
5. Review the score and incident list once more before submitting.
   There's no separate signature step — tapping Submit report is your
   attestation that this is the official, final result.
6. Submit the report and confirm you see the saved confirmation
   before you leave the field or court. Don't walk away assuming it
   went through.
7. Once submitted, the match is marked completed and this is the
   signed record the score post to standings activity picks up —
   treated as authoritative for any later dispute. Get it right the
   first time rather than planning to fix it afterward.
8. If you're unable to submit yourself (injury, emergency, phone
   failure), the event lead captures your verbal confirmation of the
   score and incidents and files a co-attestation on your behalf per
   the escalation path.
9. If a coach or team disputes the score on the spot, note the
   dispute in the match notes before submitting and flag it to the
   venue manager — don't hold up submission trying to resolve the
   dispute yourself.

### Timekeeping (`act.timekeeping`) — Accountable | Responsible

- Trigger: Match clock start at kickoff
- Expected completion: phase_end
- Tracking: system_event
- Escalation: If primary ref unable to operate clock, the assistant ref or event lead
takes over; escalate to role.venue_manager only if the match must be
paused.

1. Start the match clock at kickoff using your own watch or
   stopwatch — there's no in-app clock to start. Track time against
   the format's standard structure (halves/quarters/periods) for the
   sport you're officiating.
2. Run the clock exactly as your sport/format's rules describe
   (running clock vs. stop clock, halftime length), call stoppage or
   added time as usual, and blow the final whistle when regulation and
   any added time expire.
3. Note the actual kickoff time and final whistle time — if the match
   started late (delayed team, weather hold) or ran long (stoppage
   time, an injury delay), you'll want these when you fill out the
   match report.
4. There's no separate clock-start/clock-stop button in the system
   today. What it actually captures is your check-in time and your
   final-report submission time as the proxy for kickoff and final
   whistle — so an accurate check-in and a prompt final-report
   submission are what keep the match record's elapsed time close to
   what really happened on the field.
5. If the match ran unusually long or short of its scheduled duration
   (called early for weather, extended for a delay), say so in the
   match notes on the final report. That's what the office, and any
   stipend or time dispute review, will check against.
6. If you're unable to keep time yourself mid-match (injury, needing
   to step away), hand it to your assistant ref; if none is
   available, ask the event lead to keep visible time from the
   sideline until you're back.
7. If play has to stop for something beyond a normal stoppage (medical
   emergency, weather), note the stoppage length so the resumed clock
   and the final report reflect actual playing time. Escalate to the
   venue manager only if the match itself needs to be paused or
   abandoned.
8. Submit the final report as promptly as possible after the final
   whistle — the gap between your actual final whistle and when the
   report lands is exactly the kind of drift timekeeping exists to
   keep small.

## post_game

### Ejection logging (`act.ejection_logging`) — Accountable | Responsible

- Trigger: Ejection issued during or immediately after the match
- Expected completion: T+30min
- Tracking: form
- Escalation: If ref cannot complete the form, role.event_lead captures the ref's
verbal account and files; escalate to role.director for any ejection
carrying multi-match suspension.

1. When you issue an ejection — sending off a player, or ejecting a
   coach from the sideline — note the exact time, who was ejected
   (player number/name, or "Coach"), and the reason immediately.
   Memory of exact wording fades fast once play resumes.
2. If play can continue, don't stop to file anything on the spot —
   finish officiating the match. The ejection gets logged as part of
   the match report you file at the final whistle (final score
   attestation).
3. On the match report, log the ejection as an incident: type "Red
   card" for a player sent off (the closest match to an ejection in
   today's incident types), the side, the player/number or "COACH" if
   it was a coach, the minute, and a description that spells out the
   reason — and for a coach, states plainly that it was a coach
   ejection, not a player card.
4. If the ejection carries a suspension under your league's rules
   (e.g., a red card that sits a player for the next match), say so
   explicitly in the incident description — the office relies on this
   note to catch the suspension, since there's no separate suspension
   field yet.
5. For an ejected coach, also flag it directly to the event lead in
   person before you leave — the report captures the record, but the
   event lead needs to know in the moment in case the coach needs to
   be walked off site.
6. Submit the match report as usual. This is what files the ejection
   into the incident log, alongside the score and every other
   incident from the match.
7. If you can't complete the report yourself (injury, emergency), give
   the event lead your verbal account of what happened — who, what,
   when, why — and have them file it on your behalf per the
   escalation path.
8. Any ejection you believe could carry a multi-match suspension gets
   escalated to the director in addition to being logged — don't
   count on the office catching it from the incident description
   alone.

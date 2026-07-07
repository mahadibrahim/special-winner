# Photographer

Field-side contractor responsible for media capture per assignment, feeding
the media tagging and publishing pipeline. Brings and uses their own camera
equipment — Aspire doesn't own, issue, or track photographer gear.

## pre_game

### Photographer check-in (`act.photographer_check_in`) — Accountable | Responsible

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

## post_game

### Photo handoff (raw upload) (`act.photo_handoff`) — Accountable | Responsible

- Trigger: After photographer's last match of the day
- Expected completion: T+30min
- Tracking: counter_increment
- Escalation: If upload fails, photographer notifies role.venue_manager, who escalates
to role.director per the Coach → Venue Manager → Director handoff ladder
if unresolved; the photographer keeps their own cards until the upload
succeeds.

1. After your last assigned match of the day, open your job in the
   media app (My jobs) and start the upload for today's session.
2. Upload every raw photo and video from the session — don't cull or
   pre-select before uploading. Raw handoff means complete, unedited
   coverage; culling happens downstream in tagging, not here.
3. Confirm each asset finishes uploading (the app marks it uploaded)
   before closing the app or putting your device away — a transfer
   left mid-upload doesn't count as handed off.
4. Once every asset from the session is uploaded, the session moves
   to uploaded status and hands off to the tagging queue — this is
   what makes the day's photos visible to the tagging team.
5. Each completed upload increments the day's photo-upload counter
   automatically; no manual count is needed.
6. This is your own equipment — Aspire doesn't own or track your
   gear or media cards. Hold off formatting or reusing a card until
   you've confirmed the upload succeeded; that's for your own
   protection against losing work, not a company custody
   requirement.
7. If the upload fails or stalls, notify the venue manager right away
   rather than repeatedly retrying alone; they escalate to the
   director if it isn't resolved quickly. Keep your own cards until
   the upload is confirmed, however long that takes.
8. Once the issue is resolved and the upload completes, confirm the
   counter reflects today's full session before considering handoff
   done.

## post_day

### Photo publish (`act.photo_publish`) — Accountable | Responsible

- Trigger: After the session is organized for publish (typically T+24h)
- Expected completion: T+24h
- Tracking: counter_increment
- Escalation: If photographer unreachable, role.event_lead pings role.director; publish
authority can be re-assigned for that batch only.

1. Confirm the session is organized for publish — it should show
   "ready" in the tagging queue. Team/wide media (bench shots, crowd
   shots, action shots where no single player is the clear subject)
   doesn't need every individual player tagged and cleared one by
   one; that per-photo model is gone. Tag individual players only
   where you're building an individual-highlight product that calls
   for it.
2. Before publishing, pull the event's do-not-publish shortlist from
   the roster — the list of participants (almost always kids) whose
   family didn't consent to publish at registration. This is a
   roster-level list you check once per event, not something you
   build photo by photo.
3. Adults are opt-out by default: publish unless a specific adult
   opted out at registration. Kids are stricter — consent is opt-in
   — but the workable default is still publish for team/wide media;
   it's the do-not-publish shortlist that carves out the exceptions,
   not a requirement that every kid be individually cleared first.
4. Don't publish a photo where a shortlisted participant is the
   clear, identifiable subject (a solo shot, a close-up, anything
   that singles them out). A shortlisted kid appearing incidentally
   in a team/wide shot isn't grounds to hold the whole batch —use
   judgment on "clear subject" vs. "incidentally present," and when
   genuinely unsure, hold that specific photo rather than the batch.
5. Publishing a session (flipping it from ready to published) is an
   org-admin action in the admin media console — request that
   publish from whoever holds that access for your org (typically
   the director or office) rather than trying to do it yourself if
   you don't have admin login.
6. The platform still runs its own automated consent check at
   publish time against registration/roster consent records for any
   tagged family member. Treat a soft-warn from that check as
   unfinished business, not "handled" — it's a backstop behind the
   do-not-publish shortlist, not a replacement for checking it
   yourself first.
7. Once publish succeeds, each newly published asset increments the
   day's photos-published counter; no manual count is needed.
8. Spot-check that published photos are visible where families expect
   to see them before considering the batch done.
9. If a family requests a takedown after publish — even outside the
   original do-not-publish shortlist — action it promptly: pull the
   specific photo (or, if requested, every photo of their child) from
   the public gallery. Takedown-on-request applies regardless of
   whether the family flagged do-not-publish at registration; asking
   later still gets honored.
10. If you're unreachable to coordinate the publish request, the
    event lead pings the director, and publish authority for that
    batch can be reassigned per the escalation path — the shortlist
    check and the platform's consent check still apply regardless of
    who executes the publish.

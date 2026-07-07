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

1. About 30 minutes before your first assigned match, go to the event
   lead's station to sign in — this starts your pay clock for the
   session, so don't skip it even if you're already shooting
   warmups.
2. Confirm your assignment against the event lead's schedule — venue,
   match(es), and session type (game, team posed, practice, event) —
   and flag any mismatch before signing.
3. Confirm your gear: camera body, charged batteries plus a backup,
   memory cards with enough free space for the day, and any lens or
   flash the shot list calls for.
4. Review the shot list or session notes with the event lead —
   required shots (team photos, action shots, specific players if
   requested), any restricted subjects, and the day's intended
   media-auth scope if it's already set (internal, promotional, or
   public), so you know what you're shooting for.
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
- Escalation: If upload fails, photographer notifies role.event_lead who escalates
to role.director; raw cards are retained until upload succeeds.

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
6. Retain your raw memory cards until you've confirmed the upload
   succeeded — don't format or reuse a card until the session shows
   uploaded.
7. If the upload fails or stalls, notify the event lead right away
   rather than repeatedly retrying alone; they escalate to the
   director if it isn't resolved quickly. Keep the cards physically
   secure and retained until the upload is confirmed, however long
   that takes.
8. Once the issue is resolved and the upload completes, confirm the
   counter reflects today's full session before considering handoff
   done.

## post_day

### Photo publish (`act.photo_publish`) — Accountable | Responsible

- Trigger: After tagging is complete (typically T+24h)
- Expected completion: T+24h
- Tracking: counter_increment
- Escalation: If photographer unreachable, role.event_lead pings role.director;
publish authority can be re-assigned for that batch only.

1. Confirm tagging is complete for the session — it should show
   "ready" in the tagging queue, meaning every asset worth keeping
   has been tagged to the right players or teams.
2. Confirm the session's intended media-auth scope (internal,
   promotional, or public) is set correctly for how these photos are
   meant to be used — this determines whose consent the platform
   checks before allowing publish.
3. Publishing a session (flipping it from ready to published) is an
   org-admin action in the admin media console — request that
   publish from whoever holds that access for your org (typically
   the director or office) rather than trying to do it yourself if
   you don't have admin login.
4. When publish is attempted, the platform automatically checks every
   tagged family member against their media-authorization consent for
   the session's intended scope. If any tagged participant is missing
   consent for that scope, publish either hard-blocks with the list
   of missing names (if the org has consent enforcement turned on) or
   proceeds with a logged warning — either way, treat a soft-warn as
   unfinished business, not "handled," and follow up on the missing
   consent.
5. If publish is blocked for missing consent, resolve the actual gap
   — confirm with the family, or drop that specific photo from the
   publish batch — rather than working around it by re-tagging around
   the flagged family members or loosening the intended scope to
   dodge the check.
6. Once publish succeeds, each newly published asset increments the
   day's photos-published counter; no manual count is needed.
7. Spot-check that published photos are visible where families expect
   to see them before considering the batch done.
8. If you're unreachable to coordinate the publish request, the
   event lead pings the director, and publish authority for that
   batch can be reassigned per the escalation path — the consent
   check still applies regardless of who executes the publish.

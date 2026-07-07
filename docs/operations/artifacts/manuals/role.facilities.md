# Facilities

Owns field, court, and equipment readiness for the event-day — setup,
turnover, reset, and close-down.

## pre_day

### Equipment inventory check (`act.equipment_inventory_check`) — Accountable | Responsible

- Trigger: 48h before event window
- Expected completion: T-48h
- Tracking: checklist
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. 48 hours before the event window, walk the storage area with the
   equipment manifest in hand.
2. Count balls by sport and size against the manifest (age-appropriate
   sizes per program).
3. Count cones, pinnies/scrimmage vests, and portable goals or nets
   against the manifest.
4. Count jerseys if venue-supplied, plus scoreboards, whistles, and
   clipboards.
5. Check first-aid restock supply (bandages, tape, ice packs) against
   par for the upcoming event — separate from the field kits checked
   day-of.
6. Note any shortage or damaged item found during the count.
7. Order or arrange a borrow from another venue for anything short,
   with enough lead time to arrive before the event; flag to the venue
   manager if a shortage can't be resolved in time.
8. Log the completed count so equipment storage has a clean baseline to
   compare against after the event.

## day_setup

### Equipment staging (`act.equipment_staging`) — Accountable | Responsible

- Trigger: ~90 minutes before first kickoff
- Expected completion: T-90min
- Tracking: checklist
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. About 90 minutes before first kickoff, pull the day's equipment list
   by match and surface from the schedule.
2. Move balls (correct size and sport per age group), cones, and
   pinnies from storage to the staging area near each playing surface.
3. Move scoreboards to each surface, power them on, and reset to 0-0.
4. Move a first-aid kit to each field/court — the venue manager's
   first-aid kit check should already have verified its contents.
5. Move water coolers or jugs to each staging area per group.
6. Stage match-specific equipment (portable goals, nets, corner flags)
   near each surface without placing it yet — full placement happens at
   field/court setup closer to kickoff.
7. Confirm each match crew can grab their equipment without going back
   to storage.
8. Note anything missing from the staging pass, pull from backup stock,
   or flag it to the venue manager.

### Parking setup (`act.parking_setup`) — Accountable | Responsible

- Trigger: ~60 minutes before first kickoff (managed-parking venues only)
- Expected completion: T-60min
- Tracking: checklist
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. About 60 minutes before first kickoff at managed-parking venues,
   place cones and ropes to mark the traffic flow into and out of the
   lot.
2. Place directional and reserved-row signage (staff, accessible, VIP
   if applicable) in their assigned spots.
3. If the venue attends the entry point, staff it with an
   attendant/greeter per the day's staffing plan.
4. Walk the overflow route and confirm it's clear of obstructions and
   clearly marked.
5. Confirm accessible parking spaces are clear, correctly marked, and
   closest to the accessible entrance.
6. Check lot lighting is functioning if the event runs into evening.
7. Note any surface hazard (potholes, debris) in the lot and flag it to
   the venue manager.
8. Confirm setup is complete before the first families are expected to
   arrive.

### Signage setup (`act.signage_setup`) — Accountable | Responsible

- Trigger: ~90 minutes before first kickoff
- Expected completion: T-90min
- Tracking: photo_upload
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. About 90 minutes before first kickoff, pull the day's signage plan
   (wayfinding, sponsor banners, field-of-play markers, safety
   placards).
2. Place wayfinding signage at entrances, restrooms, and any surface
   families need to find.
3. Hang sponsor banners in their assigned locations per the
   sponsorship agreement, if any.
4. Place field-of-play markers (out-of-bounds, spectator line) so
   spectators know where they can and can't stand.
5. Place safety placards (first-aid location, emergency exit, no pets,
   etc.) wherever required.
6. Walk the completed layout and photograph each signage zone to
   confirm placement.
7. Upload the photos to the day's record; pull a replacement from
   backup stock or flag the venue manager for anything missing or
   damaged.

## pre_game

### Field/court setup (per match) (`act.field_court_setup`) — Accountable | Responsible

- Trigger: ~30 minutes before each kickoff
- Expected completion: T-30min
- Tracking: photo_upload
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. About 30 minutes before each kickoff, place goals/nets in their
   marked positions and secure them (anchored or weighted per the
   venue's safety standard — an unsecured goal is a serious tip-over
   hazard).
2. Place corner flags and any required field markings for the sport.
3. Place team benches on the correct sidelines per the match
   assignment.
4. Set up the scoreboard for the match — reset to 0-0, team
   names/colors if the board supports it.
5. Place any match-specific equipment the sport calls for.
6. Confirm the surface is otherwise clear of the prior match's
   equipment and debris.
7. Photograph the fully configured surface before handing it off, and
   upload it to the match record.
8. If anything can't be resolved in the 30-minute window, notify the
   venue manager and event lead immediately — a match doesn't start on
   an unsafe or incomplete surface.

### Flag football field line check (`act.flag_field_line_check`) — Accountable | Responsible

- Trigger: ~30 minutes before each flag football kickoff
- Expected completion: T-30min
- Tracking: photo_upload
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. About 30 minutes before each flag football kickoff, walk the full
   length of the field.
2. Verify yard lines are visible and accurately spaced per the field's
   marking standard.
3. Verify both end zones are clearly marked at the correct depth.
4. Verify sideline and out-of-bounds markings are visible along the
   full length of the field.
5. Check flag-pulling zone markings if the format uses them, and
   confirm no line has faded or shifted since the last match.
6. Touch up or re-mark anything faded or unclear before the match
   starts — don't let players guess at boundaries.
7. Photograph the field lines and upload the photo to the match record.
8. If field conditions (mud, standing water) are obscuring lines faster
   than they can be maintained, flag it to the venue manager — this may
   factor into a rainout call.

## post_game

### Equipment turnover (between matches) (`act.equipment_turnover`) — Accountable | Responsible

- Trigger: Final whistle of each match
- Expected completion: T+15min
- Tracking: checklist
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. At the final whistle, move immediately to the just-finished surface
   — the next match's crew is on the clock behind you.
2. Collect match-specific equipment: balls, pinnies, corner flags, and
   anything not staying with the field.
3. Re-secure goals/nets if they were repositioned during the match;
   reset any that came loose.
4. Reset the scoreboard to 0-0 and update team names/colors for the
   next match.
5. Sanitize shared-touch equipment (balls, pinnies) as needed between
   matches per the venue's routine.
6. Count balls and pinnies back against the pre-match count and note
   anything missing.
7. Confirm the surface is ready for the next match crew to take over
   within the 15-minute turnover window.
8. Flag anything damaged during the match to the field damage report
   process rather than trying to fix it yourself.

### Field damage report (`act.field_damage_report`) — Accountable | Responsible

- Trigger: Damage observed at any point during or after a match
- Expected completion: T+30min
- Tracking: form
- Escalation: If facilities unreachable, role.venue_manager logs the damage and
escalates to role.director for repair authorization.

Procedure to be authored by the operating team. This activity is defined
in the catalog; full step-by-step SOP content will be added in a
follow-up PR.

### Field reset between matches (`act.field_reset_between_matches`) — Accountable | Responsible

- Trigger: Final whistle of each match
- Expected completion: T+15min
- Tracking: checklist
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. At the final whistle, do a rapid trash pickup along the sidelines
   and benches before the next teams arrive.
2. Sweep the playing surface for debris, displaced equipment, and any
   personal items (route items to lost and found).
3. Check field markings/lines and re-line or touch up any that shifted
   or faded during the match.
4. Replace any displaced markers — corner flags, cone lines, boundary
   markers — to their correct position.
5. Confirm benches and team areas are clear and ready for the next
   teams.
6. Confirm the surface meets the same safety standard as the pregame
   field/court setup — no new hazards introduced during play.
7. Complete within the 15-minute turnover window so the next match
   isn't delayed.

## end_of_day

### Equipment storage (`act.equipment_storage`) — Accountable | Responsible

- Trigger: After last match concludes
- Expected completion: phase_end
- Tracking: checklist
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. After the last match concludes, collect all equipment from staging
   areas across every surface.
2. Return each item to its labeled storage location — balls, cones,
   pinnies, goals/nets, scoreboards, first-aid kits.
3. Count balls and pinnies on return and compare against the morning's
   equipment staging count.
4. Note anything damaged during the day's use or missing from the
   return count.
5. Log any first-aid kit items used during the day so the next
   inventory check starts from an accurate baseline.
6. Coil cords, fold pinnies, and stack cones so the space is ready for
   the next equipment inventory check.
7. Log the completed storage count — any shortfall becomes the first
   line item on the next inventory check.

### Trash disposal (`act.trash_disposal`) — Accountable | Responsible

- Trigger: After last match concludes (owned venues)
- Expected completion: phase_end
- Tracking: checklist
- Escalation: If facilities unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. After the last match concludes at an owned venue, pull all interior
   trash bags — restrooms, concessions, locker rooms, office.
2. Pull all sideline and spectator-area trash bags and any recycling.
3. Walk bags to the dumpster/disposal area; don't leave bagged trash
   staged inside overnight.
4. Replace liners in every bin you emptied.
5. Break down and dispose of any cardboard or bulk packaging from the
   day (concession deliveries, equipment boxes).
6. Confirm the dumpster/disposal area lid or gate is closed and locked
   after use.
7. Note any overflow issue (dumpster full, missed pickup) and flag it
   to the venue manager so the hauler can be contacted before the next
   event.

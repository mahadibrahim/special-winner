# Front of House

Owns check-in, parent comms, walk-on registrations, and concessions during an
event-day.

## day_setup

### Concession inventory count (open) (`act.concession_inventory_count`) — Accountable | Responsible

- Trigger: After concession setup, before first sale
- Expected completion: T-60min
- Tracking: form
- Escalation: If front_of_house unreachable, escalate to role.venue_manager per the
Coach → Venue Manager → Director handoff ladder.

1. Do this right after concession setup finishes and before the stand
   opens for its first sale — counting after sales have started
   makes the numbers useless for reconciliation.
2. Count bottled/canned drinks by type and size, working from the
   display case back to the stockroom so nothing gets double-counted.
3. Count packaged snacks and other shelf-stable goods by SKU.
4. Count paper goods and consumables that affect per-unit cost
   tracking: cups, napkins, condiment packets.
5. Enter every count into the inventory form by item — don't batch
   categories together, since end-of-day reconciliation matches this
   count line-by-line against the closing count.
6. Note anything already damaged, short-dated, or missing from the
   expected opening stock before the first sale, and flag it to the
   venue manager if it looks like a shrink or delivery problem.
7. Submit the form. This is what the concession settlement reconcile
   compares against at the end of the day.

### Concession setup (`act.concession_setup`) — Accountable | Responsible

- Trigger: ~90 minutes before first kickoff (concessions venues only)
- Expected completion: T-90min
- Tracking: checklist
- Escalation: If front_of_house unreachable, escalate to role.venue_manager per the
Coach → Venue Manager → Director handoff ladder.

1. About 90 minutes before first kickoff, power on the register/POS
   terminal — the only equipment this stand runs.
2. Set up the POS terminal: confirm it's connected, logged in under
   today's shift, and configured for card payment only. There's no
   cash drawer or opening bank to count — the stand doesn't accept
   cash.
3. Restock shelf-stable snacks and drinks (chips, candy, bottled or
   canned drinks, and similar shelf-stable items) from back stock so
   the stand looks fully stocked when families arrive. Aspire
   concessions don't sell hot food or fountain drinks, so there's no
   food-safety setup (no cold/hot holding, no hand-wash station) to
   run.
4. Confirm signage at the register clearly states card-only, no cash
   accepted, so families aren't surprised when they reach the front
   of the line.
5. Do a final walk of the stand for anything blocking service — boxes
   in the walkway, signage not yet up, menu board not updated for
   today's pricing.
6. Once the stand is fully ready, mark the checklist complete — this
   clears the way for the concession inventory count.

## pre_game

### Walk-on registration (`act.walk_on_registration`) — Accountable | Responsible

- Trigger: Throughout the drop-in/clinic intake window
- Expected completion: T-15min
- Tracking: counter_increment
- Escalation: If front_of_house unreachable, escalate directly to role.venue_manager
per the Coach → Venue Manager → Director handoff ladder.

1. Throughout the drop-in/clinic intake window, greet each walk-on
   parent or adult player at the front-of-house station — the coach
   running the session isn't the one who registers walk-ons.
2. Open walk-up registration and collect the player/adult info: name,
   date of birth (youth) or the adult registrant's own info, and an
   emergency contact and phone number.
3. Note any medical or allergy information the coach should know
   before the player joins the session.
4. Select the correct session/program the walk-on is joining so
   they're added to the right roster, not just "today's activity."
5. Capture payment before the player joins play — card only, no
   cash accepted. Run the card at the desk and mark it paid once the
   payment actually clears.
6. Get the liability waiver signed. In person, that's the paper
   waiver at the desk; note it as signed once collected — never let a
   player join on a verbal "I'll sign later."
7. Add the player to the session roster so the coach's headcount and
   ratio check reflects them before they join.
8. Once registration, payment, and waiver are all complete, the
   walk-on counter increments automatically — confirm the player is
   on the roster the coach sees before sending them to the field.
9. If intake volume would push a session over its coach ratio cap,
   tell the coach to close intake for that session and hold
   additional walk-ons for the next available slot.

## in_game

### Spectator management (`act.spectator_management`) — Accountable | Responsible

- Trigger: Spectator complaint or sideline issue raised during a match
- Expected completion: trigger+5min
- Tracking: form
- Escalation: If an issue exceeds front_of_house scope, or is safety-relevant, escalate
immediately to role.venue_manager per the Coach → Venue Manager →
Director handoff ladder.

1. When a spectator complaint or sideline issue is raised — a seating
   conflict, a lost parent, a behavior concern — respond in person
   rather than trying to resolve it by shouting across the sideline.
2. Get the reporting spectator's account first, without interrupting
   the match in progress unless the issue is safety-relevant.
3. For seat conflicts or general confusion (wrong bleacher section,
   can't find their kid's field), resolve on the spot — this doesn't
   need the form unless it escalates.
4. For behavior issues (a heated spectator, unsporting conduct from
   the sideline, a dispute between parents), speak with the person
   directly, calmly, and away from the match.
5. If the person won't de-escalate or the issue is safety-relevant
   (physical altercation, threats), pull in the venue manager
   immediately rather than continuing to handle it alone.
6. Any safety-relevant issue goes to the venue manager right away —
   don't wait to see if it resolves before notifying them.
7. Log the complaint details in the form regardless of outcome: what
   happened, who was involved, how it was resolved. Even minor,
   fully-resolved issues get logged — this is what surfaces repeat
   problem patterns over time.
8. Submit the form within about 5 minutes of the issue arising, while
   the details are still fresh.

## end_of_day

### Concession settlement reconcile (card-only) (`act.cash_concession_reconcile`) — Accountable | Responsible

- Trigger: After concession close
- Expected completion: phase_end
- Tracking: form
- Escalation: If front_of_house unreachable, role.venue_manager performs the
reconciliation; any variance over threshold escalates to
role.director.

1. Close the concession stand to new sales before starting the
   reconcile.
2. Run the POS Z-report for the day and record total card sales — the
   stand is card-only, so this is the full day's revenue; there's no
   cash drawer or bank to count.
3. Count closing concession inventory against the opening inventory
   count to compute units sold by item.
4. Multiply units sold by price to get expected revenue, then compare
   expected revenue to POS card sales and record the variance, over
   or short.
5. If the variance is inside the normal tolerance, sign the
   reconciliation form — no witness or deposit step is needed since
   there's no cash to secure.
6. If the variance is outside tolerance, recount inventory before
   assuming shrink or a counting error — then record the variance
   as-is and escalate to the venue manager; anything still
   unexplained after recount escalates to the director.
7. File the signed form with today's records.

### Lost and found inventory (`act.lost_and_found_inventory`) — Accountable | Responsible

- Trigger: At end of day after the venue clears
- Expected completion: phase_end
- Tracking: form
- Escalation: If front_of_house unreachable, role.venue_manager runs the inventory or
assigns coverage, per the Coach → Venue Manager → Director handoff
ladder.

1. After the venue clears at end of day, do one final sweep of common
   areas — bleachers, sidelines, locker rooms, restrooms, concession
   seating — for anything left behind, in addition to whatever's
   already in the lost-and-found bin.
2. For each item, log a description specific enough to identify it
   (color, brand, size) — "water bottle" isn't enough on a day with
   six lost water bottles.
3. Log where it was found (field/court, bleachers, restroom, parking
   lot) so a family calling in has a starting point.
4. If a name, phone number, or team is visible on the item itself,
   log that contact info directly against the entry.
5. If someone already reported the item missing today and you can
   match it, note the match and reach out with the contact info you
   have rather than waiting for them to call the office.
6. Store the physical items together in the lost-and-found holding
   area, not scattered across storage.
7. Submit the inventory form — this is what the office uses to match
   items to inquiries and to know what's still eligible for the
   holding-window disposal.
8. If front of house isn't available to run this at close, the venue
   manager runs the inventory or assigns coverage per the escalation
   path.

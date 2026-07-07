# Front of House

Owns check-in, parent comms, walk-on registrations, and concessions during an
event-day.

## day_setup

### Concession inventory count (open) (`act.concession_inventory_count`) — Accountable | Responsible

- Trigger: After concession setup, before first sale
- Expected completion: T-60min
- Tracking: form
- Escalation: If front_of_house unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. Do this right after concession setup finishes and before the stand
   opens for its first sale — counting after sales have started
   makes the numbers useless for reconciliation.
2. Count drinks by type and size, working from the front cooler back
   to the stockroom so nothing gets double-counted.
3. Count snacks and packaged goods by SKU.
4. Count hot-food pars — the prepped starting quantity for items made
   in batches (hot dogs, pretzels), not raw ingredient stock.
5. Count paper goods and consumables that affect per-unit cost
   tracking: cups, napkins, condiment packets.
6. Enter every count into the inventory form by item — don't batch
   categories together, since end-of-day reconciliation matches this
   count line-by-line against the closing count.
7. Note anything already damaged, short-dated, or missing from the
   expected opening stock before the first sale, and flag it to the
   venue manager if it looks like a shrink or delivery problem.
8. Submit the form. This is what the cash and concession reconcile
   compares against at the end of the day.

### Concession setup (`act.concession_setup`) — Accountable | Responsible

- Trigger: ~90 minutes before first kickoff (concessions venues only)
- Expected completion: T-90min
- Tracking: checklist
- Escalation: If front_of_house unreachable, escalate to role.venue_manager per the
standard handoff ladder.

1. About 90 minutes before first kickoff, power on all concession
   equipment — fountain machine, warmers, grill/hot-food equipment,
   registers — and give it time to reach operating temperature before
   you need it.
2. Restock the front cooler and display cases from the back cooler so
   the stand looks fully stocked when families arrive.
3. Set up the POS terminal: confirm it's connected, logged in under
   today's shift, and the opening cash bank (the fixed starting
   drawer amount) is in the drawer and matches the expected amount.
4. Calibrate fountain syrup-to-water ratios and taste-test each flavor
   before opening — a flat or over-syrupy fountain is the most common
   concession complaint.
5. Confirm hand-wash stations are stocked with soap and paper towels,
   and sanitizer stations/wipes are stocked at the register and food
   prep area.
6. Check food safety basics: cold items are cold, hot items are hot,
   and any date-sensitive stock (dairy, prepped items) is within
   date.
7. Do a final walk of the stand for anything blocking service — boxes
   in the walkway, signage not yet up, menu board not updated for
   today's pricing.
8. Once the stand is fully ready, mark the checklist complete — this
   clears the way for the concession inventory count.

## pre_game

### Walk-on registration (`act.walk_on_registration`) — Accountable | Responsible

- Trigger: Throughout the drop-in/clinic intake window
- Expected completion: T-15min
- Tracking: counter_increment
- Escalation: If front_of_house unreachable, escalate to role.event_lead per the
standard handoff ladder.

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
5. Capture payment before the player joins play — record the payment
   status and method; if paying at the desk in person, mark it paid
   once the payment is actually taken.
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
- Escalation: If issue exceeds front_of_house scope, escalate to role.event_lead;
any safety-relevant escalation goes to role.venue_manager.

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
   (physical altercation, threats), pull in the event lead
   immediately rather than continuing to handle it alone.
6. Any safety-relevant issue also goes to the venue manager right
   away, in parallel with pulling in the event lead — don't wait for
   one before notifying the other.
7. Log the complaint details in the form regardless of outcome: what
   happened, who was involved, how it was resolved. Even minor,
   fully-resolved issues get logged — this is what surfaces repeat
   problem patterns over time.
8. Submit the form within about 5 minutes of the issue arising, while
   the details are still fresh.

## end_of_day

### Cash and concession reconcile (`act.cash_concession_reconcile`) — Accountable | Responsible

- Trigger: After concession close, before deposit
- Expected completion: phase_end
- Tracking: form
- Escalation: If front_of_house unreachable, role.venue_manager performs the
reconciliation; any cash variance over threshold escalates to
role.director.

1. Close the concession stand to new sales before starting the count —
   don't count a drawer that's still taking cash.
2. Count the drawer cash by denomination with a second person present
   as witness; the witness watches the count, they don't just take
   your word for the total.
3. Subtract the opening bank (the fixed starting cash noted at
   concession setup) from the counted total to get cash sales.
4. Run the POS Z-report for the day and record card sales and total
   POS-recorded sales separately from the cash count.
5. Count closing concession inventory against the opening inventory
   count to compute units sold by item.
6. Multiply units sold by price to get expected revenue, then compare
   expected revenue to (cash sales + card sales) and record the
   variance, over or short.
7. If the variance is inside the normal tolerance, both you and the
   witness sign the reconciliation form and prepare the deposit.
8. If the variance is outside tolerance, recount before assuming
   shrink or a counting error — then record the variance as-is and
   escalate to the venue manager; anything still unexplained after
   recount escalates to the director.
9. File the signed, witnessed form with today's records before making
   the deposit.

### Lost and found inventory (`act.lost_and_found_inventory`) — Accountable | Responsible

- Trigger: At end of day after the venue clears
- Expected completion: phase_end
- Tracking: form
- Escalation: If front_of_house unreachable, role.event_lead inventories and
escalates to role.venue_manager per the standard handoff ladder.

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
8. If front of house isn't available to run this at close, the event
   lead does the inventory and escalates per the escalation path.

/**
 * The rentals booking form's annual-waiver WIRE CONTRACT — the two decisions
 * `RentalBooking.tsx` (Aspire) and `FieldCalendar.tsx` (SoccerOne) both have
 * to make identically:
 *
 *   1. is this renter covered, so the waiver block should be skipped?
 *   2. what waiver fields, if any, go in the POST body?
 *
 * CLIENT-SAFE ON PURPOSE. This module must never import `@/lib/db` or
 * anything that reaches it — both consumers are `client:load` islands, and a
 * db import would drag the driver into the browser bundle. The server-side
 * probe that ANSWERS question 1 lives in its sibling
 * `src/lib/rentals/waiver-on-file.ts`; only its boolean result crosses over,
 * as a prop.
 *
 * Extracted rather than inlined twice because the two branches are not
 * symmetric in their failure modes, and getting either wrong is expensive:
 *
 *   - Skip the block but SEND a signature → harmless (the endpoint discards
 *     it for a covered renter), but pointless.
 *   - Skip the block and the server DISAGREES about coverage →
 *     `validateRentalBookingRequest` doesn't apply its relaxation and the
 *     renter hard-422s "waiver must be accepted to book" with no checkbox on
 *     screen to accept. A dead-end form.
 *   - Render the block but OMIT the fields → the renter ticks a box that
 *     does nothing and still 422s.
 *
 * One implementation, one unit test, both brands.
 */

/** The waiver fields `POST /api/rentals/bookings` accepts. A covered renter
 *  sends NEITHER — see `rentalWaiverRequestFields`. */
export interface RentalWaiverFields {
  waiverAccepted: true;
  waiverName: string;
}

/**
 * Whether the form may skip the waiver block entirely.
 *
 * FAILS TOWARD ASKING, twice over:
 *   - `signedIn` must be true. A guest has no account, so no `family_members`
 *     row, so nothing a person-scoped consent could hang on — the endpoint
 *     reaches the same conclusion independently, and this keeps a caller that
 *     passes `waiverOnFile` without `signedIn` from opening a hole.
 *   - `waiverOnFile` must be STRICTLY `true`. `undefined` (an un-prop'd
 *     caller, or a page whose probe threw) and `false` both ASK. Never
 *     loosen this to a truthiness check.
 */
export function rentalWaiverCovered(opts: {
  signedIn: boolean;
  waiverOnFile: boolean | undefined;
}): boolean {
  return opts.signedIn === true && opts.waiverOnFile === true;
}

/**
 * The waiver portion of the request body.
 *
 * Covered → an EMPTY object, spread into the body as nothing at all. The
 * absence of both fields is what `validateRentalBookingRequest`'s relaxation
 * keys on, and the endpoint then stamps `WAIVER_ON_FILE_ATTRIBUTION` itself.
 * Sending `waiverAccepted: false` here instead of omitting would be actively
 * wrong: the validator treats an explicit `false` as "the box was shown and
 * declined" and rejects it even for a covered renter.
 *
 * Not covered → the typed signature, trimmed, exactly as the form has always
 * sent it.
 */
export function rentalWaiverRequestFields(
  covered: boolean,
  typedName: string,
): RentalWaiverFields | Record<string, never> {
  if (covered) return {};
  return { waiverAccepted: true, waiverName: typedName.trim() };
}

/**
 * Whether the submit button must stay disabled on waiver grounds.
 *
 * A covered renter has no box to tick and no name to type, so the waiver
 * contributes nothing to the disabled state — without this, the skip would
 * hide the inputs and then permanently disable the button that needed them.
 */
export function rentalWaiverBlocksSubmit(opts: {
  covered: boolean;
  waiverAccepted: boolean;
  waiverName: string;
}): boolean {
  if (opts.covered) return false;
  return !opts.waiverAccepted || opts.waiverName.trim().length === 0;
}

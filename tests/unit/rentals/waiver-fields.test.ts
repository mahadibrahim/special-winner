/**
 * The rentals booking form's annual-waiver WIRE CONTRACT, shared by
 * `RentalBooking.tsx` (Aspire) and `FieldCalendar.tsx` (SoccerOne).
 *
 * This is the fast gate for the covered-skip branch. The forms themselves are
 * only exercised by post-merge Playwright, and the waiver block sits behind
 * slot-selection state that `renderToStaticMarkup` (this repo's component-test
 * tool) can't reach — so the decision was extracted into pure functions and
 * pinned here instead.
 *
 * The asymmetry that makes this worth testing: the server relaxation in
 * `validateRentalBookingRequest` keys on the ABSENCE of both fields, and
 * treats an explicit `waiverAccepted: false` as a decline that is rejected
 * even for a covered renter. So "send nothing" and "send false" are opposite
 * outcomes, and the gap between the rendered block and the sent body is
 * exactly where a dead-end 422 would come from.
 *
 * Cross-checked against the server matrix in
 * tests/unit/rentals/validators.test.ts (`describe("opts.waiverOnFile")`) —
 * these two files describe the two ends of the same contract.
 */
import { describe, it, expect } from "vitest";
import {
  rentalWaiverBlocksSubmit,
  rentalWaiverCovered,
  rentalWaiverRequestFields,
} from "@/lib/rentals/waiver-fields";

describe("rentalWaiverCovered — only strict true, only when signed in", () => {
  it("is true ONLY for a signed-in renter with waiverOnFile === true", () => {
    expect(rentalWaiverCovered({ signedIn: true, waiverOnFile: true })).toBe(true);
  });

  it("asks whenever waiverOnFile is anything other than strictly true", () => {
    // `undefined` is the un-prop'd caller and the page whose probe threw;
    // `false` is an uncovered renter. Both must ASK. A truthiness check here
    // would still pass the `true` case above, so this is the half that
    // actually pins the rule.
    expect(rentalWaiverCovered({ signedIn: true, waiverOnFile: false })).toBe(false);
    expect(rentalWaiverCovered({ signedIn: true, waiverOnFile: undefined })).toBe(false);
  });

  it("asks a GUEST even when waiverOnFile somehow says true", () => {
    // A guest has no account, so no `family_members` row, so nothing a
    // person-scoped consent could hang on — the endpoint reaches the same
    // conclusion independently. This conjunct is what stops a caller that
    // forwards a stale/incorrect waiverOnFile from opening a hole in the
    // guest path, which is the highest-traffic rental door.
    expect(rentalWaiverCovered({ signedIn: false, waiverOnFile: true })).toBe(false);
    expect(rentalWaiverCovered({ signedIn: false, waiverOnFile: false })).toBe(false);
    expect(rentalWaiverCovered({ signedIn: false, waiverOnFile: undefined })).toBe(false);
  });
});

describe("rentalWaiverRequestFields — what actually goes on the wire", () => {
  it("sends NOTHING for a covered renter — not an empty string, not false", () => {
    const fields = rentalWaiverRequestFields(true, "Renter Name");
    // Spread into the request body, this must contribute zero keys. The
    // validator's relaxation keys on ABSENCE.
    expect(Object.keys(fields)).toEqual([]);
    expect(fields).not.toHaveProperty("waiverAccepted");
    expect(fields).not.toHaveProperty("waiverName");
  });

  it("never emits waiverAccepted:false for a covered renter (the dead-end 422)", () => {
    // Load-bearing distinction: `validateRentalBookingRequest` rejects an
    // explicit `false` even when the server agrees the renter is covered — it
    // reads as "the box was shown and declined". A form that sent `false`
    // instead of omitting would 422 a covered renter who has no box on screen
    // to fix it. See the server-side matrix in validators.test.ts.
    const fields = rentalWaiverRequestFields(true, "") as Record<string, unknown>;
    expect(fields.waiverAccepted).toBeUndefined();
  });

  it("sends the trimmed typed signature for an uncovered renter", () => {
    expect(rentalWaiverRequestFields(false, "  Renter Name  ")).toEqual({
      waiverAccepted: true,
      waiverName: "Renter Name",
    });
  });

  it("keeps sending the fields for an uncovered renter who typed nothing", () => {
    // The submit button is what blocks this case (see below); the body shape
    // must not silently become the COVERED shape just because the name is
    // blank — that would turn a validation error into a wrongly-granted skip.
    expect(rentalWaiverRequestFields(false, "   ")).toEqual({
      waiverAccepted: true,
      waiverName: "",
    });
  });
});

describe("rentalWaiverBlocksSubmit — the skip must not disable its own button", () => {
  it("never blocks a covered renter, who has no box to tick or name to type", () => {
    // The bug this exists to prevent: hiding the inputs while still requiring
    // them, leaving "Request this slot" permanently disabled with nothing on
    // screen explaining why.
    expect(
      rentalWaiverBlocksSubmit({ covered: true, waiverAccepted: false, waiverName: "" }),
    ).toBe(false);
  });

  it("blocks an uncovered renter until BOTH the box and the name are supplied", () => {
    const cases: Array<[boolean, string, boolean]> = [
      // accepted, name, blocked?
      [false, "", true],
      [false, "Renter Name", true],
      [true, "", true],
      [true, "   ", true],
      [true, "Renter Name", false],
    ];
    for (const [waiverAccepted, waiverName, blocked] of cases) {
      expect(
        rentalWaiverBlocksSubmit({ covered: false, waiverAccepted, waiverName }),
        `accepted=${waiverAccepted} name=${JSON.stringify(waiverName)}`,
      ).toBe(blocked);
    }
  });
});

describe("the two halves agree — end-to-end shape per renter state", () => {
  it("covered signed-in renter: block skipped, no fields, button free", () => {
    const covered = rentalWaiverCovered({ signedIn: true, waiverOnFile: true });
    expect(covered).toBe(true);
    expect(Object.keys(rentalWaiverRequestFields(covered, ""))).toEqual([]);
    expect(
      rentalWaiverBlocksSubmit({ covered, waiverAccepted: false, waiverName: "" }),
    ).toBe(false);
  });

  it("uncovered signed-in renter: block shown, fields sent, button gated", () => {
    const covered = rentalWaiverCovered({ signedIn: true, waiverOnFile: false });
    expect(covered).toBe(false);
    expect(
      rentalWaiverBlocksSubmit({ covered, waiverAccepted: false, waiverName: "" }),
    ).toBe(true);
    expect(rentalWaiverRequestFields(covered, "Renter Name")).toEqual({
      waiverAccepted: true,
      waiverName: "Renter Name",
    });
  });

  it("guest: identical to the pre-annual-waiver behaviour, always", () => {
    const covered = rentalWaiverCovered({ signedIn: false, waiverOnFile: true });
    expect(covered).toBe(false);
    expect(rentalWaiverRequestFields(covered, "Guest Name")).toEqual({
      waiverAccepted: true,
      waiverName: "Guest Name",
    });
    expect(
      rentalWaiverBlocksSubmit({ covered, waiverAccepted: false, waiverName: "" }),
    ).toBe(true);
  });
});

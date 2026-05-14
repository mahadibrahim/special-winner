import { describe, it, expect } from "vitest";
import {
  validateRentalRateCardPut,
  validateRentalBookingRequest,
  validateAdminRentalCreate,
} from "@/lib/rentals/validators";

describe("validateRentalRateCardPut", () => {
  it("accepts an empty body (partial update)", () => {
    expect(validateRentalRateCardPut({})).toBeNull();
  });
  it("rejects a negative rate", () => {
    expect(validateRentalRateCardPut({ defaultHourlyRateCents: -1 })).toMatch(
      /defaultHourlyRateCents/,
    );
  });
  it("rejects minDuration greater than maxDuration", () => {
    expect(
      validateRentalRateCardPut({ minDurationMinutes: 300, maxDurationMinutes: 240 }),
    ).toMatch(/minDuration/);
  });
});

describe("validateRentalBookingRequest", () => {
  const base = {
    venueId: "11111111-1111-1111-1111-111111111111",
    fieldNumber: 1,
    startsAt: "2026-06-01T18:00:00Z",
    endsAt: "2026-06-01T19:00:00Z",
    partySize: 8,
    waiverName: "Sam Renter",
    waiverAccepted: true,
  };
  it("accepts a well-formed request", () => {
    expect(validateRentalBookingRequest(base)).toBeNull();
  });
  it("rejects when endsAt is not after startsAt", () => {
    expect(
      validateRentalBookingRequest({ ...base, endsAt: "2026-06-01T18:00:00Z" }),
    ).toMatch(/endsAt/);
  });
  it("rejects when the waiver is not accepted", () => {
    expect(
      validateRentalBookingRequest({ ...base, waiverAccepted: false }),
    ).toMatch(/waiver/i);
  });
  it("rejects a blank waiver name", () => {
    expect(
      validateRentalBookingRequest({ ...base, waiverName: "  " }),
    ).toMatch(/waiver/i);
  });
});

describe("validateAdminRentalCreate", () => {
  const base = {
    venueId: "11111111-1111-1111-1111-111111111111",
    fieldNumber: 1,
    startsAt: "2026-06-01T18:00:00Z",
    endsAt: "2026-06-01T19:00:00Z",
    renterName: "Phone Caller",
    partySize: 10,
    paymentMethod: "cash" as const,
  };
  it("accepts a well-formed admin create", () => {
    expect(validateAdminRentalCreate(base)).toBeNull();
  });
  it("rejects a blank renter name", () => {
    expect(validateAdminRentalCreate({ ...base, renterName: "" })).toMatch(
      /renterName/,
    );
  });
  it("rejects an unknown payment method", () => {
    expect(
      validateAdminRentalCreate({ ...base, paymentMethod: "bitcoin" as never }),
    ).toMatch(/paymentMethod/);
  });
});

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
  it("rejects an unrealistic cancelWindowHours (>30 days)", () => {
    expect(validateRentalRateCardPut({ cancelWindowHours: 99999 })).toMatch(
      /cancelWindowHours/,
    );
  });
  it("rejects a non-integer defaultHourlyRateCents", () => {
    expect(validateRentalRateCardPut({ defaultHourlyRateCents: 94.99 })).toMatch(
      /defaultHourlyRateCents/,
    );
  });
  it("rejects a maxDurationMinutes exceeding 24 hours", () => {
    expect(validateRentalRateCardPut({ maxDurationMinutes: 99999 })).toMatch(
      /maxDurationMinutes/,
    );
  });

  it("accepts the four block settings inside their bounds", () => {
    expect(
      validateRentalRateCardPut({
        depositPct: 30,
        balanceDueLeadDays: 21,
        blockHoldHours: 48,
        quoteMarkerTtlDays: 10,
      }),
    ).toBeNull();
  });
  it("accepts a zero deposit percent and a zero balance lead", () => {
    expect(
      validateRentalRateCardPut({ depositPct: 0, balanceDueLeadDays: 0 }),
    ).toBeNull();
  });
  it("rejects a deposit percent above 100", () => {
    expect(validateRentalRateCardPut({ depositPct: 130 })).toMatch(/depositPct/);
  });
  it("rejects a negative deposit percent", () => {
    expect(validateRentalRateCardPut({ depositPct: -1 })).toMatch(/depositPct/);
  });
  it("rejects a non-integer hold window", () => {
    expect(validateRentalRateCardPut({ blockHoldHours: 12.5 })).toMatch(
      /blockHoldHours/,
    );
  });
  it("rejects a hold window of zero hours", () => {
    expect(validateRentalRateCardPut({ blockHoldHours: 0 })).toMatch(/blockHoldHours/);
  });
  it("rejects a balance lead beyond half a year", () => {
    expect(validateRentalRateCardPut({ balanceDueLeadDays: 400 })).toMatch(
      /balanceDueLeadDays/,
    );
  });
  it("rejects a quote marker TTL of zero days", () => {
    expect(validateRentalRateCardPut({ quoteMarkerTtlDays: 0 })).toMatch(
      /quoteMarkerTtlDays/,
    );
  });
  it("rejects a quote marker TTL beyond 90 days", () => {
    expect(validateRentalRateCardPut({ quoteMarkerTtlDays: 120 })).toMatch(
      /quoteMarkerTtlDays/,
    );
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
  it("rejects a non-UUID venueId", () => {
    expect(
      validateRentalBookingRequest({ ...base, venueId: "not-a-uuid" }),
    ).toMatch(/venueId/);
  });
  it("rejects a non-integer fieldNumber", () => {
    expect(
      validateRentalBookingRequest({ ...base, fieldNumber: 1.5 }),
    ).toMatch(/fieldNumber/);
  });
  it("rejects a non-integer partySize", () => {
    expect(
      validateRentalBookingRequest({ ...base, partySize: 2.5 }),
    ).toMatch(/partySize/);
  });

  describe("opts.waiverOnFile", () => {
    // `noWaiverFields` omits both waiverAccepted/waiverName entirely —
    // distinct from `base`, which always sets them.
    const noWaiverFields = {
      venueId: base.venueId,
      fieldNumber: base.fieldNumber,
      startsAt: base.startsAt,
      endsAt: base.endsAt,
      partySize: base.partySize,
    };

    it("both fields omitted + covered → valid (on-file wins)", () => {
      expect(
        validateRentalBookingRequest(noWaiverFields, { waiverOnFile: true }),
      ).toBeNull();
    });

    it("both fields omitted + uncovered → still 422, today's default", () => {
      expect(
        validateRentalBookingRequest(noWaiverFields, { waiverOnFile: false }),
      ).toMatch(/waiver/i);
    });

    it("explicit waiverAccepted:false + covered → still 422 (decline overrides coverage)", () => {
      expect(
        validateRentalBookingRequest(
          { ...noWaiverFields, waiverAccepted: false },
          { waiverOnFile: true },
        ),
      ).toMatch(/waiver must be accepted/i);
    });

    it("explicit waiverAccepted:false + uncovered → 422", () => {
      expect(
        validateRentalBookingRequest(
          { ...noWaiverFields, waiverAccepted: false },
          { waiverOnFile: false },
        ),
      ).toMatch(/waiver must be accepted/i);
    });

    it("partial (accepted:true, no name) + uncovered → still 422, name required", () => {
      expect(
        validateRentalBookingRequest(
          { ...noWaiverFields, waiverAccepted: true },
          { waiverOnFile: false },
        ),
      ).toMatch(/waiver signature name/i);
    });

    it("partial (name, no accepted) + uncovered → still 422, must be accepted", () => {
      expect(
        validateRentalBookingRequest(
          { ...noWaiverFields, waiverName: "Sam Renter" },
          { waiverOnFile: false },
        ),
      ).toMatch(/waiver must be accepted/i);
    });

    // Covered-renter partial behavior: the endpoint stamps the shared
    // "on file" attribution regardless of what the client sent (see
    // src/pages/api/rentals/bookings/index.ts), so a partial value that
    // isn't an explicit decline carries no more meaning than an omitted
    // one — on-file wins here too, same as the fully-omitted case above.
    it("partial (accepted:true, no name) + covered → valid (on-file wins)", () => {
      expect(
        validateRentalBookingRequest(
          { ...noWaiverFields, waiverAccepted: true },
          { waiverOnFile: true },
        ),
      ).toBeNull();
    });

    it("partial (name, no accepted) + covered → valid (on-file wins)", () => {
      expect(
        validateRentalBookingRequest(
          { ...noWaiverFields, waiverName: "Sam Renter" },
          { waiverOnFile: true },
        ),
      ).toBeNull();
    });

    it("a well-formed waiver + covered → still valid (no behavior change on the happy path)", () => {
      expect(
        validateRentalBookingRequest(base, { waiverOnFile: true }),
      ).toBeNull();
    });
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
  it("rejects an invalid startsAt date string", () => {
    expect(
      validateAdminRentalCreate({ ...base, startsAt: "not-a-date" }),
    ).toMatch(/startsAt/);
  });
});

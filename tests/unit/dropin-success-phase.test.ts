import { describe, it, expect } from "vitest";
import { deriveDropInSuccessPhase } from "@/lib/dropin/success-phase";

describe("deriveDropInSuccessPhase", () => {
  it("is 'none' when the page was not reached via a successful checkout", () => {
    expect(
      deriveDropInSuccessPhase({
        bannerKind: null,
        bookingStatus: null,
        pollExhausted: false,
      }),
    ).toBe("none");
    expect(
      deriveDropInSuccessPhase({
        bannerKind: "cancelled",
        bookingStatus: null,
        pollExhausted: false,
      }),
    ).toBe("none");
  });

  it("is 'confirmed' once the booking row exists", () => {
    expect(
      deriveDropInSuccessPhase({
        bannerKind: "success",
        bookingStatus: "confirmed",
        pollExhausted: false,
      }),
    ).toBe("confirmed");
  });

  it("is 'finalizing' after a successful checkout while the booking is not yet recorded", () => {
    expect(
      deriveDropInSuccessPhase({
        bannerKind: "success",
        bookingStatus: null,
        pollExhausted: false,
      }),
    ).toBe("finalizing");
  });

  it("is 'finalizing-timed-out' when the booking never appeared within the poll window", () => {
    expect(
      deriveDropInSuccessPhase({
        bannerKind: "success",
        bookingStatus: null,
        pollExhausted: true,
      }),
    ).toBe("finalizing-timed-out");
  });
});

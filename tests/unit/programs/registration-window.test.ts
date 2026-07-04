import { describe, expect, it } from "vitest";
import { isRegistrationClosed } from "@/lib/programs/registration-window";

const NOW = new Date("2026-07-04T15:00:00Z");

describe("isRegistrationClosed", () => {
  it("stays open before an explicit registration_closes", () => {
    expect(
      isRegistrationClosed(
        { registrationCloses: "2026-08-03T23:59:59Z", startDate: "2026-09-14" },
        NOW,
      ),
    ).toBe(false);
  });

  it("closes once registration_closes has passed", () => {
    expect(
      isRegistrationClosed(
        { registrationCloses: "2026-07-01T00:00:00Z", startDate: "2026-09-14" },
        NOW,
      ),
    ).toBe(true);
  });

  it("an explicit close AFTER start allows late joins past the start date", () => {
    // Season started July 1, but admin set closes = Aug 1 → still open.
    expect(
      isRegistrationClosed(
        { registrationCloses: "2026-08-01T00:00:00Z", startDate: "2026-07-01" },
        NOW,
      ),
    ).toBe(false);
  });

  it("with no close date, stays open through the start day itself", () => {
    expect(
      isRegistrationClosed({ registrationCloses: null, startDate: "2026-07-04" }, NOW),
    ).toBe(false);
  });

  it("with no close date, closes the day after start (the Founders' Tournament case)", () => {
    expect(
      isRegistrationClosed({ registrationCloses: null, startDate: "2026-06-21" }, NOW),
    ).toBe(true);
  });

  it("with no close date and a future start, stays open", () => {
    expect(
      isRegistrationClosed({ registrationCloses: null, startDate: "2026-09-14" }, NOW),
    ).toBe(false);
  });

  it("accepts Date objects for either field", () => {
    expect(
      isRegistrationClosed(
        { registrationCloses: new Date("2026-07-01T00:00:00Z"), startDate: null },
        NOW,
      ),
    ).toBe(true);
    expect(
      isRegistrationClosed(
        { registrationCloses: null, startDate: new Date("2026-06-21T00:00:00Z") },
        NOW,
      ),
    ).toBe(true);
  });

  it("treats a season with neither date as open (nothing to gate on)", () => {
    expect(isRegistrationClosed({ registrationCloses: null, startDate: null }, NOW)).toBe(
      false,
    );
  });
});

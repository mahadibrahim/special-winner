import { describe, it, expect } from "vitest";
import {
  REQUIRED_COACH_CREDENTIALS,
  EXPIRING_SOON_DAYS,
  effectiveCredentialStatus,
  requiredCredentialGaps,
} from "@/lib/compliance/coach-credentials";

const NOW = new Date("2026-07-06T12:00:00Z");
const daysFromNow = (n: number) =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("REQUIRED_COACH_CREDENTIALS", () => {
  it("is the hardcoded child-safety set", () => {
    expect([...REQUIRED_COACH_CREDENTIALS]).toEqual([
      "safesport",
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
    expect(EXPIRING_SOON_DAYS).toBe(60);
  });
});

describe("effectiveCredentialStatus", () => {
  it("missing when there is no row", () => {
    expect(effectiveCredentialStatus(null, NOW)).toBe("missing");
    expect(effectiveCredentialStatus(undefined, NOW)).toBe("missing");
  });

  it("valid with no expiry stays valid", () => {
    expect(
      effectiveCredentialStatus({ status: "valid", expiresAt: null }, NOW),
    ).toBe("valid");
  });

  it("valid far in the future stays valid", () => {
    expect(
      effectiveCredentialStatus(
        { status: "valid", expiresAt: daysFromNow(120) },
        NOW,
      ),
    ).toBe("valid");
  });

  it("valid expiring exactly at the 60-day threshold is expiring_soon", () => {
    expect(
      effectiveCredentialStatus(
        { status: "valid", expiresAt: daysFromNow(60) },
        NOW,
      ),
    ).toBe("expiring_soon");
  });

  it("valid but past its expiry date is expired (date wins over status)", () => {
    expect(
      effectiveCredentialStatus(
        { status: "valid", expiresAt: daysFromNow(-1) },
        NOW,
      ),
    ).toBe("expired");
  });

  it("pending / expired / rejected pass through", () => {
    expect(
      effectiveCredentialStatus({ status: "pending", expiresAt: null }, NOW),
    ).toBe("pending");
    expect(
      effectiveCredentialStatus({ status: "expired", expiresAt: null }, NOW),
    ).toBe("expired");
    expect(
      effectiveCredentialStatus({ status: "rejected", expiresAt: null }, NOW),
    ).toBe("rejected");
  });
});

describe("requiredCredentialGaps", () => {
  it("reports all four required credentials as missing for an empty row set", () => {
    const gaps = requiredCredentialGaps([], NOW);
    expect(gaps.map((g) => g.credentialType)).toEqual([
      ...REQUIRED_COACH_CREDENTIALS,
    ]);
    expect(gaps.every((g) => g.reason === "missing")).toBe(true);
  });

  it("a valid credential clears its gap", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "safesport",
          status: "valid",
          expiresAt: daysFromNow(365),
        },
      ],
      NOW,
    );
    expect(gaps.map((g) => g.credentialType)).toEqual([
      "background_check",
      "cpr_first_aid",
      "concussion_protocol",
    ]);
  });

  it("expiring_soon is NOT a gap (still valid today)", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "safesport",
          status: "valid",
          expiresAt: daysFromNow(30),
        },
      ],
      NOW,
    );
    expect(gaps.map((g) => g.credentialType)).not.toContain("safesport");
  });

  it("a date-expired credential is a gap with reason expired", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "background_check",
          status: "valid",
          expiresAt: daysFromNow(-10),
        },
      ],
      NOW,
    );
    const bg = gaps.find((g) => g.credentialType === "background_check");
    expect(bg?.reason).toBe("expired");
  });

  it("non-required types never appear as gaps", () => {
    const gaps = requiredCredentialGaps(
      [
        {
          credentialType: "coaching_license",
          status: "rejected",
          expiresAt: null,
        },
      ],
      NOW,
    );
    expect(gaps.map((g) => g.credentialType)).not.toContain("coaching_license");
    expect(gaps).toHaveLength(4); // the four required ones, all missing
  });
});
